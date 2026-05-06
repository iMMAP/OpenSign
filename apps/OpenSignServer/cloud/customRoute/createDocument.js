/**
 * Hosted-compatible POST /createdocument for OSS.
 * Accepts compact JSON from integrations (file base64, name, note, signers[].widgets)
 * and persists contracts_Document + sends signer invitations like bulk/quick-send flows.
 */
import axios from 'axios';
import crypto from 'node:crypto';
import {
  flattenPdf,
  getSecureUrl,
  mailTemplate,
  replaceMailVaribles,
  randomId,
  color as signerColors,
  cloudServerUrl,
  serverAppId,
} from '../../Utils.js';
import { parseUploadFile } from '../../utils/fileUtils.js';
import { setDocumentCount } from '../../utils/CountUtils.js';

function toBase64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

function sanitizeFileName(name) {
  const base = String(name || 'document.pdf').trim() || 'document.pdf';
  return base.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').slice(0, 180);
}

/**
 * Resolve or create a guest Parse.User + contracts_Contactbook row for the API owner's tenant.
 */
async function findOrCreateContact(ownerParseUserId, { displayName, email }) {
  const normalized = String(email || '')
    .toLowerCase()
    .replace(/\s/g, '');
  if (!normalized) {
    throw new Error('Signer email is required');
  }
  const ownerPtr = { __type: 'Pointer', className: '_User', objectId: ownerParseUserId };
  const existingQ = new Parse.Query('contracts_Contactbook');
  existingQ.equalTo('CreatedBy', ownerPtr);
  existingQ.notEqualTo('IsDeleted', true);
  existingQ.equalTo('Email', normalized);
  const existing = await existingQ.first({ useMasterKey: true });
  if (existing) {
    return existing;
  }

  let guestUser;
  try {
    const u = new Parse.User();
    u.set('username', normalized);
    u.set('email', normalized);
    u.set('password', normalized);
    u.set('name', displayName || normalized);
    guestUser = await u.signUp(null, { useMasterKey: true });
  } catch (err) {
    if (err.code === 202) {
      const q = new Parse.Query(Parse.User);
      q.equalTo('email', normalized);
      guestUser = await q.first({ useMasterKey: true });
      if (!guestUser) {
        throw new Error('Unable to resolve existing user for contact');
      }
    } else {
      throw err;
    }
  }

  const contact = new Parse.Object('contracts_Contactbook');
  contact.set('Name', displayName || normalized);
  contact.set('Email', normalized);
  contact.set('UserRole', 'contracts_Guest');
  contact.set('IsDeleted', false);
  contact.set('CreatedBy', ownerPtr);
  contact.set('UserId', guestUser);

  const acl = new Parse.ACL();
  acl.setReadAccess(guestUser.id, true);
  acl.setWriteAccess(guestUser.id, true);
  acl.setReadAccess(ownerParseUserId, true);
  acl.setWriteAccess(ownerParseUserId, true);
  contact.setACL(acl);

  await contact.save(null, { useMasterKey: true });
  return contact;
}

function hostedWidgetToPos(widget, zIndex) {
  const type = String(widget?.type || 'signature').toLowerCase();
  const key = crypto.randomUUID?.() || crypto.randomBytes(16).toString('hex');
  const opts = widget?.options && typeof widget.options === 'object' ? widget.options : {};
  const xPosition = Number(widget.x);
  const yPosition = Number(widget.y);
  const Width = Number(widget.w);
  const Height = Number(widget.h);
  if (![xPosition, yPosition, Width, Height].every(n => Number.isFinite(n))) {
    throw new Error('Each widget must include finite numeric x, y, w, h');
  }
  return {
    xPosition,
    yPosition,
    Width,
    Height,
    key,
    scale: 1,
    zIndex,
    isStamp: type === 'stamp' || type === 'image',
    type,
    signatureType: '',
    options: {
      status: 'required',
      name: opts.name || '',
      hint: opts.hint || '',
    },
  };
}

function buildPlaceholderPagesForSigner(signerPayload, contact, signerIdx) {
  const widgets = Array.isArray(signerPayload.widgets) ? signerPayload.widgets : [];
  if (!widgets.length) {
    throw new Error(`Signer "${signerPayload.email}" must include at least one widget`);
  }
  const byPage = new Map();
  for (let i = 0; i < widgets.length; i++) {
    const w = widgets[i];
    const pageNum = Math.max(1, Number(w.page) || 1);
    if (!byPage.has(pageNum)) {
      byPage.set(pageNum, []);
    }
    const posArr = byPage.get(pageNum);
    posArr.push(hostedWidgetToPos(w, posArr.length + 1));
  }
  const placeHolder = [...byPage.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([pageNumber, pos]) => ({ pageNumber, pos }));

  const normalizedEmail = String(contact.get('Email') || signerPayload.email || '')
    .toLowerCase()
    .replace(/\s/g, '');

  return {
    Id: randomId(),
    blockColor: signerColors[signerIdx % signerColors.length],
    Role: `Role ${signerIdx + 1}`,
    email: normalizedEmail,
    signerObjId: contact.id,
    signerPtr: {
      __type: 'Pointer',
      className: 'contracts_Contactbook',
      objectId: contact.id,
    },
    placeHolder,
  };
}

/**
 * Mirrors createBatchDocs.sendMail — notifies signers with signing links.
 */
async function sendInviteEmails(document, publicHostUrl) {
  const baseUrl = new URL(publicHostUrl);
  const timeToCompleteDays = document?.TimeToCompleteDays || 15;
  const ExpireDate = new Date(document.createdAt);
  ExpireDate.setDate(ExpireDate.getDate() + timeToCompleteDays);
  const localExpireDate = ExpireDate.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  let signerMail = document.Placeholders?.filter(x => x?.Role !== 'prefill');
  const senderName = document?.SenderName || document.ExtUserPtr?.Name;
  const senderEmail = document?.SenderMail || document.ExtUserPtr?.Email;
  const from =
    document?.SenderName || document?.ExtUserPtr?.UseNameAsSender === true
      ? document.ExtUserPtr?.Name
      : senderEmail;

  if (document.SendinOrder) {
    signerMail = signerMail.slice();
    signerMail.splice(1);
  }

  const fnUrl = `${cloudServerUrl}/functions/sendmailv3`;
  const headers = { 'Content-Type': 'application/json', 'X-Parse-Application-Id': serverAppId };

  for (let i = 0; i < signerMail.length; i++) {
    try {
      const objectId = signerMail[i]?.signerObjId;
      const hostUrl = baseUrl.origin;
      let encodeBase64;
      let existSigner = {};
      if (objectId) {
        existSigner = document?.Signers?.find(user => user.objectId === objectId) || {};
        encodeBase64 = toBase64(
          `${document.objectId}/${existSigner?.Email || signerMail[i].email}/${objectId}`
        );
      } else {
        encodeBase64 = toBase64(`${document.objectId}/${signerMail[i].email}`);
      }
      const signPdf = `${hostUrl}/login/${encodeBase64}`;
      const orgName = document.ExtUserPtr?.Company ? document.ExtUserPtr.Company : '';
      const senderObj = document?.ExtUserPtr;
      let mailBody = senderObj?.TenantId?.RequestBody || '';
      let mailSubject = senderObj?.TenantId?.RequestSubject || '';
      let replaceVar;
      if (mailBody && mailSubject) {
        const replacedRequestBody = mailBody.replace(/"/g, "'");
        const htmlReqBody =
          "<html><head><meta http-equiv='Content-Type' content='text/html; charset=UTF-8' /></head><body>" +
          replacedRequestBody +
          '</body></html>';
        const variables = {
          document_title: document?.Name,
          note: document?.Note || '',
          sender_name: senderName,
          sender_mail: senderEmail,
          sender_phone: senderObj?.Phone || '',
          receiver_name: existSigner?.Name || '',
          receiver_email: existSigner?.Email || signerMail[i].email,
          receiver_phone: existSigner?.Phone || '',
          expiry_date: localExpireDate,
          company_name: orgName,
          signing_url: signPdf,
        };
        replaceVar = replaceMailVaribles(mailSubject, htmlReqBody, variables);
      }
      const mailparam = {
        note: document?.Note || '',
        senderName: senderName,
        senderMail: senderEmail,
        title: document.Name,
        organization: orgName,
        localExpireDate: localExpireDate,
        signingUrl: signPdf,
      };
      const params = {
        extUserId: document.ExtUserPtr.objectId,
        recipient: existSigner?.Email || signerMail[i].email,
        subject: replaceVar?.subject ? replaceVar?.subject : mailTemplate(mailparam).subject,
        from: from,
        replyto: senderEmail || '',
        html: replaceVar?.body ? replaceVar?.body : mailTemplate(mailparam).body,
      };
      await axios.post(fnUrl, params, { headers });
    } catch (error) {
      console.log('createdocument sendmail error:', error?.message || error);
    }
  }
}

export async function createDocumentHandler(req, res) {
  try {
    const apiUser = req.apiUser;
    if (!apiUser?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = req.body || {};
    const fileB64 = body.file;
    const name = body.name;
    const note = body.note != null ? String(body.note) : '';
    const signersIn = Array.isArray(body.signers) ? body.signers : [];

    if (!fileB64 || typeof fileB64 !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "file" (base64 PDF)' });
    }
    if (!signersIn.length) {
      return res.status(400).json({ error: '"signers" must be a non-empty array' });
    }

    const extCls = new Parse.Query('contracts_Users');
    extCls.equalTo('UserId', {
      __type: 'Pointer',
      className: '_User',
      objectId: apiUser.id,
    });
    extCls.include('TenantId');
    const extUser = await extCls.first({ useMasterKey: true });
    if (!extUser) {
      return res.status(400).json({
        error: 'No contracts_Users profile for this account; complete OpenSign onboarding first.',
      });
    }

    const extJson = JSON.parse(JSON.stringify(extUser));

    const contacts = [];
    const placeholders = [];
    for (let i = 0; i < signersIn.length; i++) {
      const s = signersIn[i];
      const email = s?.email;
      const displayName = s?.name || email;
      const contact = await findOrCreateContact(apiUser.id, { displayName, email });
      contacts.push(contact);
      placeholders.push(buildPlaceholderPagesForSigner(s, contact, i));
    }

    let pdfBuffer = Buffer.from(fileB64, 'base64');
    if (!pdfBuffer.length) {
      return res.status(400).json({ error: 'Decoded PDF is empty' });
    }
    const flatPdf = await flattenPdf(pdfBuffer);
    const safeName = sanitizeFileName(name || 'document.pdf');
    const uploaded = await parseUploadFile(safeName, flatPdf, 'application/pdf');
    const { url: securePath } = getSecureUrl(uploaded.url);
    if (!securePath) {
      return res.status(500).json({ error: 'Unable to resolve uploaded file URL' });
    }

    const ownerPtr = { __type: 'Pointer', className: '_User', objectId: apiUser.id };
    const extPtr = {
      __type: 'Pointer',
      className: 'contracts_Users',
      objectId: extUser.id,
    };

    const acl = new Parse.ACL();
    acl.setPublicReadAccess(false);
    acl.setReadAccess(apiUser.id, true);
    acl.setWriteAccess(apiUser.id, true);
    for (const c of contacts) {
      const guestId = c.get('UserId')?.id;
      if (guestId) {
        acl.setReadAccess(guestId, true);
        acl.setWriteAccess(guestId, true);
      }
    }

    const doc = new Parse.Object('contracts_Document');
    doc.set('Name', safeName);
    doc.set('Note', note);
    doc.set('Description', '');
    doc.set('CreatedBy', ownerPtr);
    doc.set('ExtUserPtr', extPtr);
    doc.set('SendinOrder', true);
    doc.set('Placeholders', placeholders);
    doc.set(
      'Signers',
      contacts.map(c => ({
        __type: 'Pointer',
        className: 'contracts_Contactbook',
        objectId: c.id,
      }))
    );
    doc.set('URL', securePath);
    doc.set('SignedUrl', securePath);
    doc.set('SentToOthers', true);
    doc.set('RemindOnceInEvery', 5);
    doc.set('AutomaticReminders', false);
    doc.set('TimeToCompleteDays', 15);
    doc.set('OriginIp', req.headers['x-real-ip'] || req.ip || '');
    doc.set('DocSentAt', new Date());
    doc.set('IsEnableOTP', false);
    doc.set('IsTourEnabled', false);
    doc.set('AllowModifications', false);
    doc.set('IsSendMail', true);
    doc.setACL(acl);

    await doc.save(null, { useMasterKey: true });

    await setDocumentCount(extUser.id);

    const publicHostUrl =
      req.headers.public_url || req.headers['public_url'] || `https://${req.get('host')}`;

    const reloadQuery = new Parse.Query('contracts_Document');
    reloadQuery.include(['ExtUserPtr', 'ExtUserPtr.TenantId', 'Signers']);
    reloadQuery.equalTo('objectId', doc.id);
    const full = await reloadQuery.first({ useMasterKey: true });
    const plain = JSON.parse(JSON.stringify(full));

    void sendInviteEmails(plain, publicHostUrl).catch(err =>
      console.log('createdocument invite emails failed:', err?.message || err)
    );

    return res.status(200).json({
      objectId: doc.id,
      createdAt: doc.get('createdAt')?.toISOString?.() || new Date().toISOString(),
      result: { objectId: doc.id },
    });
  } catch (err) {
    console.log('createDocument error:', err);
    const message = err?.message || 'Unable to create document';
    const clientLike =
      /Missing|must include|required|invalid|empty|Unable to resolve|No contracts_Users/i.test(
        message
      );
    return res.status(clientLike ? 400 : 500).json({
      error: message,
    });
  }
}
