import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const DEFAULT_TENANT_ID = 'f6f70f1b-2a2d-4f30-852a-64b8ce0c19d7';

export const MICROSOFT_GRAPH_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  'Files.ReadWrite.All',
  'Sites.Read.All',
];

export function hasSharePointScopes(scopeStr) {
  const scopes = String(scopeStr || '')
    .split(/\s+/)
    .map(s => s.toLowerCase())
    .filter(Boolean);
  const hasFiles = scopes.some(s => s.includes('files.readwrite'));
  const hasSites = scopes.some(s => s.includes('sites.read'));
  return hasFiles && hasSites;
}

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

function tenantBaseUrl(tenantId) {
  return `https://login.microsoftonline.com/${tenantId}`;
}

export function parseMicrosoftTokenResponse(json) {
  const accessToken = json?.access_token;
  if (typeof accessToken !== 'string') {
    throw new Error('No access token from Microsoft');
  }
  const expiresIn = Number(json.expires_in || 3600);
  return {
    accessToken,
    refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    scopes: typeof json.scope === 'string' ? json.scope : MICROSOFT_GRAPH_SCOPES.join(' '),
    idToken: typeof json.id_token === 'string' ? json.id_token : undefined,
  };
}

function profileFromIdToken(idToken) {
  const seg = String(idToken || '').split('.');
  if (seg.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(seg[1], 'base64url').toString('utf8'));
    const email =
      (typeof payload.email === 'string' && payload.email) ||
      (typeof payload.preferred_username === 'string' && payload.preferred_username) ||
      '';
    if (!email) return null;
    const name = typeof payload.name === 'string' ? payload.name : '';
    const nameParts = name.split(' ').filter(Boolean);
    return {
      id: String(payload.oid || payload.sub || email),
      email: email.toLowerCase().replace(/\s/g, ''),
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      name: name || email,
    };
  } catch {
    return null;
  }
}

async function profileFromGraphMe(accessToken) {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error('Could not read Microsoft profile');
  }
  const email =
    (typeof data.mail === 'string' && data.mail) ||
    (typeof data.userPrincipalName === 'string' && data.userPrincipalName) ||
    '';
  if (!email.includes('@')) {
    throw new Error('Microsoft account has no email');
  }
  const displayName = typeof data.displayName === 'string' ? data.displayName : '';
  const nameParts = displayName.split(' ').filter(Boolean);
  return {
    id: String(data.id || email),
    email: email.toLowerCase().replace(/\s/g, ''),
    firstName: nameParts[0] || '',
    lastName: nameParts.slice(1).join(' ') || '',
    name: displayName || email,
  };
}

export async function getCodeUrl(state) {
  const { clientId, redirectUri, tenantId } = getConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: MICROSOFT_GRAPH_SCOPES.join(' '),
    prompt: 'select_account',
  });
  if (state) {
    params.set('state', state);
  }
  return `${tenantBaseUrl(tenantId)}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(code) {
  const { clientId, clientSecret, redirectUri, tenantId } = getConfig();
  const tokenUrl = `${tenantBaseUrl(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    scope: MICROSOFT_GRAPH_SCOPES.join(' '),
  });
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = await res.json();
  if (!res.ok) {
    const err = json.error_description || json.error || res.statusText;
    throw new Error(typeof err === 'string' ? err : 'Microsoft token exchange failed');
  }
  return parseMicrosoftTokenResponse(json);
}

export async function refreshMicrosoftTokens(refreshToken) {
  const { clientId, clientSecret, tenantId } = getConfig();
  const tokenUrl = `${tenantBaseUrl(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: MICROSOFT_GRAPH_SCOPES.join(' '),
  });
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = await res.json();
  if (!res.ok) {
    const err = json.error_description || json.error || res.statusText;
    throw new Error(typeof err === 'string' ? err : 'Microsoft token refresh failed');
  }
  return parseMicrosoftTokenResponse(json);
}

export async function getProfileFromTokens(tokens) {
  const fromId = tokens?.idToken ? profileFromIdToken(tokens.idToken) : null;
  if (fromId?.email) {
    return fromId;
  }
  return profileFromGraphMe(tokens.accessToken);
}

export async function getProfileByCode(code) {
  const tokens = await exchangeCodeForTokens(code);
  const profile = await getProfileFromTokens(tokens);
  if (!profile?.email) {
    throw new Error('Microsoft account has no email');
  }
  return { profile, tokens };
}
