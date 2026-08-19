import { getCodeUrl } from '../../auth/microsoftAuthService.js';
import {
  findContractsUserByEmail,
  getValidAccessToken,
  sharePointConnectionStatus,
} from '../helpers/microsoftGraphTokens.js';
import { downloadFile, listChildren, listDrives, listSites } from '../helpers/sharePointGraph.js';

async function requireAuthenticatedUser(request) {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'User is not authenticated.');
  }
  const email = request.user.get('email');
  const extUser = await findContractsUserByEmail(email);
  if (!extUser) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'User profile not found.');
  }
  return extUser;
}

async function requireSharePointToken(request) {
  const extUser = await requireAuthenticatedUser(request);
  const status = sharePointConnectionStatus(extUser);
  if (!status.connected) {
    throw new Parse.Error(
      119,
      'Microsoft SharePoint access is not connected. Sign in with Microsoft again.',
    );
  }
  try {
    const token = await getValidAccessToken(extUser);
    return { extUser, token };
  } catch (err) {
    throw new Parse.Error(
      119,
      err?.message || 'Microsoft Outlook session expired; sign in with Microsoft again',
    );
  }
}

export async function sharePointStatus(request) {
  const extUser = await requireAuthenticatedUser(request);
  const status = sharePointConnectionStatus(extUser);
  let consentUrl = null;
  if (status.needsConsent) {
    try {
      consentUrl = await getCodeUrl(request.params?.state || '');
    } catch (err) {
      console.log('SharePoint consent URL failed:', err?.message || err);
    }
  }
  return { ...status, consentUrl };
}

export async function sharePointListSites(request) {
  const { token } = await requireSharePointToken(request);
  const search = request.params?.search || '';
  return { sites: await listSites(token, search) };
}

export async function sharePointListItems(request) {
  const { token } = await requireSharePointToken(request);
  const { siteId, driveId, itemId } = request.params || {};
  if (!driveId && siteId) {
    return { items: await listDrives(token, siteId) };
  }
  if (!driveId) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'siteId or driveId is required.');
  }
  return { items: await listChildren(token, driveId, itemId) };
}

export async function sharePointGetFile(request) {
  const { token } = await requireSharePointToken(request);
  const { driveId, itemId } = request.params || {};
  if (!driveId || !itemId) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'driveId and itemId are required.');
  }
  const file = await downloadFile(token, driveId, itemId);
  return {
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    webUrl: file.webUrl,
    parentId: file.parentId,
    driveId: file.driveId,
    base64: file.base64,
  };
}
