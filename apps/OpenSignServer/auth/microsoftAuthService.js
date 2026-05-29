import * as msal from '@azure/msal-node';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const DEFAULT_TENANT_ID = 'f6f70f1b-2a2d-4f30-852a-64b8ce0c19d7';

function getConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  const tenantId = process.env.MICROSOFT_TENANT_ID || DEFAULT_TENANT_ID;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Microsoft auth is not configured. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_REDIRECT_URI.',
    );
  }

  return { clientId, clientSecret, redirectUri, tenantId };
}

function createPca() {
  const { clientId, clientSecret, tenantId } = getConfig();
  return new msal.ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  });
}

export async function getCodeUrl(state) {
  const { redirectUri } = getConfig();
  const pca = createPca();
  const options = {
    scopes: ['User.Read'],
    redirectUri,
  };
  if (state) {
    options.state = state;
  }
  return pca.getAuthCodeUrl(options);
}

export async function getProfileByCode(code) {
  const { redirectUri } = getConfig();
  const pca = createPca();
  const token = await pca.acquireTokenByCode({
    scopes: ['User.Read'],
    code,
    redirectUri,
  });

  if (!token?.account) {
    throw new Error('Invalid Microsoft token response');
  }

  const nameParts = token.account.name?.split(' ') || [];
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  const name = token.account.name || [firstName, lastName].filter(Boolean).join(' ');

  return {
    id: token.account.homeAccountId,
    email: token.account.username?.toLowerCase()?.replace(/\s/g, '') || '',
    firstName,
    lastName,
    name,
  };
}
