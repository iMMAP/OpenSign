import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import docxtopdf, { upload as docxUpload } from './docxtopdf.js';
import decryptpdf, { upload as decryptUpload } from './decryptpdf.js';
import { deleteUserByAdmin, deleteUserPost } from './deleteAccount/deleteUser.js';
import { deleteUserGet } from './deleteAccount/deleteUserGet.js';
import { deleteUserOtp } from './deleteAccount/deleteUserOtp.js';
import { proxyS3 } from './proxyS3.js';
import { authenticateApiToken, getWebhookByToken, saveWebhookByToken } from './apiTokenAuth.js';
import { getMicrosoftConsent, postMicrosoftLogin } from './microsoftAuth.js';
import { createDocumentHandler } from './createDocument.js';

export const app = express();

dotenv.config({ quiet: true });
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

app.post('/docxtopdf', docxUpload.single('file'), docxtopdf);
app.post('/decryptpdf', decryptUpload.single('file'), decryptpdf);
app.get('/delete-account/:userId', deleteUserGet);
app.post('/delete-account/:userId/otp', deleteUserOtp);
app.post('/delete-account/:userId', deleteUserPost);
app.post('/deleteuser/:userId', deleteUserByAdmin);
app.get('/proxy/s3', proxyS3);
app.get('/webhook', authenticateApiToken, getWebhookByToken);
app.post('/webhook', authenticateApiToken, saveWebhookByToken);
app.get('/auth/microsoft/consent', getMicrosoftConsent);
app.post('/auth/microsoft/login', postMicrosoftLogin);
app.post('/createdocument', authenticateApiToken, createDocumentHandler);
