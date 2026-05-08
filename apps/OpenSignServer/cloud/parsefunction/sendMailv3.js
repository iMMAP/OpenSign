import fs from 'node:fs';
import https from 'https';
import formData from 'form-data';
import Mailgun from 'mailgun.js';
import { appName, smtpenable, smtpsecure, updateMailCount } from '../../Utils.js';
import { createTransport } from 'nodemailer';
import axios from 'axios';
async function sendMailProvider(req) {
  const app = appName;
  const extUserId = req.params?.extUserId || '';
  const reportMsg = `<p style="font-size: 13px; color:grey; text-align: center;">If you think this email is inappropriate or spam, you may report it to iMMAP Sign at <a href="mailto:info@immap.org?subject=Spam%20report%20for%20user%20ID%20${extUserId}">info@immap.org</a>.</p>`;

  const mailgunApiKey = process.env.MAILGUN_API_KEY;
  try {
    let transporterSMTP;
    let mailgunClient;
    let mailgunDomain;
    if (smtpenable) {
      let transporterConfig = {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 465,
        secure: smtpsecure,
      };

      const smtpUser = process.env.SMTP_USERNAME || process.env.SMTP_USER_EMAIL;
      const smtpPass = process.env.SMTP_PASS;

      if (smtpUser && smtpPass) {
        transporterConfig.auth = {
          user: smtpUser,
          pass: smtpPass,
        };
      }
      transporterSMTP = createTransport(transporterConfig);
    } else {
      if (mailgunApiKey) {
        const mailgun = new Mailgun(formData);
        mailgunClient = mailgun.client({ username: 'api', key: mailgunApiKey });
        mailgunDomain = process.env.MAILGUN_DOMAIN;
      }
    }

    const from = req.params.from || '';
    const mailsender = smtpenable ? process.env.SMTP_USER_EMAIL : process.env.MAILGUN_SENDER;
    const replyto = req.params?.replyto || '';
    const messageParams = {
      from: from + ' <' + mailsender + '>',
      to: req.params.recipient,
      subject: req.params.subject,
      text: req.params.text || 'mail',
      html: req.params?.html ? req.params.html + reportMsg : '',
      bcc: req.params.bcc ? req.params.bcc : undefined,
      replyTo: replyto ? replyto : undefined,
    };

    if (transporterSMTP) {
      const res = await transporterSMTP.sendMail(messageParams);
      console.log('smtp transporter res: ', res?.response);
      if (!res.err) {
        if (extUserId) {
          await updateMailCount(extUserId);
        }
        return { status: 'success' };
      }
    } else {
      if (mailgunApiKey) {
        const res = await mailgunClient.messages.create(mailgunDomain, messageParams);
        console.log('mailgun res: ', res?.status);
        if (res.status === 200) {
          if (extUserId) {
            await updateMailCount(extUserId);
          }
          return { status: 'success' };
        }
      } else {
        return { status: 'error' };
      }
    }
  } catch (err) {
    console.log(`sendmailv3 Error: ${err}`);
    if (err) {
      return { status: 'error' };
    }
  }
}

async function sendmailv3(req) {
  const nonCustomMail = await sendMailProvider(req);
  return nonCustomMail;
}

export default sendmailv3;
