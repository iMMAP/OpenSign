import { encryptMicrosoftToken, decryptMicrosoftToken } from '../../auth/microsoftTokenCrypto.js';
import { hasSharePointScopes, refreshMicrosoftTokens } from '../../auth/microsoftAuthService.js';

const TOKEN_FIELDS = [
  'MicrosoftAccessTokenEnc',
  'MicrosoftRefreshTokenEnc',
  'MicrosoftTokenExpiresAt',
  'MicrosoftScopes',
];

export { TOKEN_FIELDS };

export async function findContractsUserByEmail(email) {
  if (!email) return null;
  const query = new Parse.Query('contracts_Users');
  query.equalTo('Email', String(email).toLowerCase().replace(/\s/g, ''));
  return query.first({ useMasterKey: true });
}

export async function saveMicrosoftTokensOnExtUser(email, tokens) {
  const ext = await findContractsUserByEmail(email);
  if (!ext || !tokens?.accessToken) {
    return ext;
  }
  ext.set('MicrosoftAccessTokenEnc', encryptMicrosoftToken(tokens.accessToken));
  if (tokens.refreshToken) {
    ext.set('MicrosoftRefreshTokenEnc', encryptMicrosoftToken(tokens.refreshToken));
  }
  ext.set('MicrosoftTokenExpiresAt', tokens.expiresAt || new Date(Date.now() + 3600 * 1000));
  ext.set('MicrosoftScopes', tokens.scopes || '');
  await ext.save(null, { useMasterKey: true });
  return ext;
}

export function sharePointConnectionStatus(extUser) {
  const refreshEnc = extUser?.get?.('MicrosoftRefreshTokenEnc') || extUser?.MicrosoftRefreshTokenEnc;
  const scopes = extUser?.get?.('MicrosoftScopes') || extUser?.MicrosoftScopes || '';
  const connected = Boolean(refreshEnc) && hasSharePointScopes(scopes);
  return {
    connected,
    needsConsent: !connected,
    scopes: scopes || null,
  };
}

export async function getValidAccessToken(extUser) {
  if (!extUser) {
    throw new Error('Microsoft Outlook is not connected for this user');
  }
  const accessEnc = extUser.get('MicrosoftAccessTokenEnc');
  const refreshEnc = extUser.get('MicrosoftRefreshTokenEnc');
  if (!accessEnc && !refreshEnc) {
    throw new Error('Microsoft Outlook is not connected for this user');
  }
  const expiresAtRaw = extUser.get('MicrosoftTokenExpiresAt');
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
  const bufferMs = 60_000;
  if (accessEnc && expiresAt && expiresAt.getTime() - bufferMs > Date.now()) {
    return decryptMicrosoftToken(accessEnc);
  }
  if (!refreshEnc) {
    throw new Error('Microsoft Outlook session expired; sign in with Microsoft again');
  }
  const refreshed = await refreshMicrosoftTokens(decryptMicrosoftToken(refreshEnc));
  const email = extUser.get('Email');
  await saveMicrosoftTokensOnExtUser(email, {
    ...refreshed,
    refreshToken: refreshed.refreshToken || decryptMicrosoftToken(refreshEnc),
  });
  if (refreshed.refreshToken) {
    extUser.set('MicrosoftRefreshTokenEnc', encryptMicrosoftToken(refreshed.refreshToken));
  }
  extUser.set('MicrosoftAccessTokenEnc', encryptMicrosoftToken(refreshed.accessToken));
  extUser.set('MicrosoftTokenExpiresAt', refreshed.expiresAt);
  extUser.set('MicrosoftScopes', refreshed.scopes || extUser.get('MicrosoftScopes'));
  return refreshed.accessToken;
}
