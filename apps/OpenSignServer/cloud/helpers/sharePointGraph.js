import { getValidAccessToken } from './microsoftGraphTokens.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.png', '.jpg', '.jpeg'];

function graphHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
}

async function graphJson(token, path) {
  const res = await fetch(`${GRAPH_BASE}${path}`, { headers: graphHeaders(token) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json?.error?.message || json?.error_description || res.statusText;
    const error = new Error(typeof err === 'string' ? err : 'Microsoft Graph request failed');
    error.status = res.status;
    throw error;
  }
  return json;
}

function mapSite(site) {
  if (!site?.id) return null;
  return {
    kind: 'site',
    id: site.id,
    name: site.displayName || site.name || 'SharePoint site',
    webUrl: site.webUrl || '',
  };
}

function mapDrive(drive, siteId) {
  if (!drive?.id) return null;
  return {
    kind: 'drive',
    id: drive.id,
    name: drive.name || 'Documents',
    siteId: siteId || '',
    webUrl: drive.webUrl || '',
    driveType: drive.driveType || '',
  };
}

function fileExtension(name) {
  const match = String(name || '')
    .toLowerCase()
    .match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : '';
}

function isAllowedFile(item) {
  if (!item?.file) return false;
  const ext = fileExtension(item.name);
  if (ALLOWED_EXTENSIONS.includes(ext)) return true;
  const mime = String(item.file?.mimeType || '').toLowerCase();
  return (
    mime === 'application/pdf' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'image/png' ||
    mime === 'image/jpeg' ||
    mime === 'image/jpg'
  );
}

function mapDriveItem(item, driveId) {
  if (!item?.id) return null;
  const parentId = item.parentReference?.id || 'root';
  const itemDriveId = item.parentReference?.driveId || driveId;
  if (item.folder) {
    return {
      kind: 'folder',
      id: item.id,
      name: item.name || 'Folder',
      driveId: itemDriveId,
      parentId,
      webUrl: item.webUrl || '',
      childCount: item.folder.childCount || 0,
    };
  }
  if (!isAllowedFile(item)) return null;
  return {
    kind: 'file',
    id: item.id,
    name: item.name || 'File',
    driveId: itemDriveId,
    parentId,
    mimeType: item.file?.mimeType || '',
    size: item.size || 0,
    webUrl: item.webUrl || '',
  };
}

export async function listSites(token, search = '') {
  const query = encodeURIComponent(search?.trim() || '*');
  const sites = new Map();

  const addSites = values => {
    (values || []).forEach(site => {
      const mapped = mapSite(site);
      if (mapped) sites.set(mapped.id, mapped);
    });
  };

  try {
    const searched = await graphJson(token, `/sites?search=${query}&$top=50`);
    addSites(searched.value);
  } catch (err) {
    console.log('SharePoint list sites search failed:', err?.message || err);
  }

  try {
    const followed = await graphJson(token, '/me/followedSites?$top=50');
    addSites(followed.value);
  } catch (err) {
    console.log('SharePoint followed sites failed:', err?.message || err);
  }

  try {
    const root = await graphJson(token, '/sites/root?$select=id,name,displayName,webUrl');
    const mapped = mapSite(root);
    if (mapped) sites.set(mapped.id, mapped);
  } catch (err) {
    console.log('SharePoint root site failed:', err?.message || err);
  }

  return [...sites.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function listDrives(token, siteId) {
  const json = await graphJson(token, `/sites/${encodeURIComponent(siteId)}/drives?$select=id,name,webUrl,driveType`);
  return (json.value || []).map(drive => mapDrive(drive, siteId)).filter(Boolean);
}

export async function listChildren(token, driveId, itemId) {
  const itemPath = itemId && itemId !== 'root' ? encodeURIComponent(itemId) : 'root';
  const json = await graphJson(
    token,
    `/drives/${encodeURIComponent(driveId)}/items/${itemPath}/children?$select=id,name,folder,file,size,webUrl,parentReference&$top=200`,
  );
  const folders = [];
  const files = [];
  (json.value || []).forEach(item => {
    const mapped = mapDriveItem(item, driveId);
    if (!mapped) return;
    if (mapped.kind === 'folder') folders.push(mapped);
    else files.push(mapped);
  });
  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...folders, ...files];
}

export async function downloadFile(token, driveId, itemId) {
  const meta = await graphJson(
    token,
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id,name,file,size,webUrl,parentReference`,
  );
  const res = await fetch(
    `${GRAPH_BASE}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`,
    { headers: graphHeaders(token), redirect: 'follow' },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || 'Failed to download SharePoint file');
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return {
    name: meta.name || 'document.pdf',
    mimeType: meta.file?.mimeType || res.headers.get('content-type') || 'application/octet-stream',
    size: buffer.length,
    webUrl: meta.webUrl || '',
    parentId: meta.parentReference?.id || 'root',
    driveId: meta.parentReference?.driveId || driveId,
    base64: buffer.toString('base64'),
    buffer,
  };
}

function sanitizeSharePointFilename(name) {
  return String(name || 'document')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

export function buildSignedSharePointFilename(originalFileName, signedAt = new Date()) {
  const raw = String(originalFileName || 'document');
  const base = raw.replace(/\.[^.]+$/, '') || 'document';
  const date = signedAt.toISOString().slice(0, 10);
  return `${sanitizeSharePointFilename(base)}_signed_${date}.pdf`;
}

export async function uploadSignedFile(token, driveId, parentId, filename, buffer) {
  const safeFilename = sanitizeSharePointFilename(filename);
  const encodedName = encodeURIComponent(safeFilename);
  const parentPath =
    !parentId || parentId === 'root'
      ? `root:/${encodedName}:`
      : `items/${encodeURIComponent(parentId)}:/${encodedName}:`;
  const itemUrl = `${GRAPH_BASE}/drives/${encodeURIComponent(driveId)}/${parentPath}`;
  const payload = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  if (payload.length <= 4 * 1024 * 1024) {
    const res = await fetch(`${itemUrl}/content`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/pdf',
      },
      body: payload,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = json?.error?.message || res.statusText;
      throw new Error(typeof err === 'string' ? err : 'Failed to upload signed file to SharePoint');
    }
    return {
      id: json.id,
      name: json.name,
      webUrl: json.webUrl || '',
    };
  }

  const sessionRes = await fetch(`${itemUrl}/createUploadSession`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      item: {
        '@microsoft.graph.conflictBehavior': 'rename',
        name: safeFilename,
      },
    }),
  });
  const sessionJson = await sessionRes.json().catch(() => ({}));
  if (!sessionRes.ok || !sessionJson.uploadUrl) {
    const err = sessionJson?.error?.message || sessionRes.statusText;
    throw new Error(typeof err === 'string' ? err : 'Failed to start SharePoint upload');
  }

  const chunkSize = 5 * 1024 * 1024;
  let offset = 0;
  let uploaded = sessionJson;
  while (offset < payload.length) {
    const end = Math.min(offset + chunkSize, payload.length);
    const chunk = payload.subarray(offset, end);
    const chunkRes = await fetch(sessionJson.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(chunk.length),
        'Content-Range': `bytes ${offset}-${end - 1}/${payload.length}`,
      },
      body: chunk,
    });
    uploaded = await chunkRes.json().catch(() => ({}));
    if (!chunkRes.ok && chunkRes.status !== 202) {
      const err = uploaded?.error?.message || chunkRes.statusText;
      throw new Error(typeof err === 'string' ? err : 'Failed to upload signed file to SharePoint');
    }
    offset = end;
  }
  return {
    id: uploaded.id,
    name: uploaded.name,
    webUrl: uploaded.webUrl || '',
  };
}

export async function saveSignedPdfToSharePoint(documentJson, signedBuffer, docId) {
  const source = documentJson?.SharePointSource;
  if (!source?.driveId || !source?.parentId) {
    return null;
  }
  const extUserId = documentJson?.ExtUserPtr?.objectId;
  if (!extUserId) {
    throw new Error('Document owner profile is missing');
  }
  const extQuery = new Parse.Query('contracts_Users');
  const extUser = await extQuery.get(extUserId, { useMasterKey: true });
  const token = await getValidAccessToken(extUser);
  const filename = buildSignedSharePointFilename(source.originalFileName || documentJson?.Name);
  const uploaded = await uploadSignedFile(token, source.driveId, source.parentId, filename, signedBuffer);
  if (docId) {
    const doc = new Parse.Object('contracts_Document');
    doc.id = docId;
    doc.set('SharePointSignedItemId', uploaded.id || '');
    doc.set('SharePointSignedWebUrl', uploaded.webUrl || '');
    doc.unset('SharePointSaveError');
    await doc.save(null, { useMasterKey: true });
  }
  return uploaded;
}
