const TOKEN_SKEW_MS = 60 * 1000;

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function careersConfig() {
  const baseUrl = (process.env.IMMAP_CAREERS_API_URL || '').replace(/\/$/, '');
  const username = process.env.IMMAP_CAREERS_USERNAME || '';
  const password = process.env.IMMAP_CAREERS_PASSWORD || '';
  return { baseUrl, username, password };
}

export function isImmapCareersConfigured() {
  const { baseUrl, username, password } = careersConfig();
  return Boolean(baseUrl && username && password);
}

function readToken(body) {
  if (!body || typeof body !== 'object') return '';
  return body.token || body.access_token || body.data?.token || body.data?.access_token || '';
}

function readExpiry(body) {
  const expiresIn = Number(body?.expires_in || body?.data?.expires_in);
  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    return Date.now() + expiresIn * 1000 - TOKEN_SKEW_MS;
  }
  return Date.now() + 50 * 60 * 1000;
}

export async function loginImmapCareers() {
  const { baseUrl, username, password } = careersConfig();
  if (!baseUrl || !username || !password) {
    throw new Error('iMMAP Careers client credentials are not configured');
  }
  const res = await fetch(`${baseUrl}/api/third-party/login`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.message || body?.error || res.statusText;
    throw new Error(typeof message === 'string' ? message : 'iMMAP Careers login failed');
  }
  const token = readToken(body);
  if (!token) {
    throw new Error('iMMAP Careers login did not return a token');
  }
  cachedToken = token;
  cachedTokenExpiresAt = readExpiry(body);
  return token;
}

async function getToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) {
    return cachedToken;
  }
  return loginImmapCareers();
}

function extractImmapers(body) {
  const page = body?.data;
  if (Array.isArray(page?.data)) return page.data;
  if (Array.isArray(page)) return page;
  if (Array.isArray(body)) return body;
  return [];
}

export async function searchImmapers(search, { page = 1, paginate = 50 } = {}) {
  const { baseUrl } = careersConfig();
  const params = new URLSearchParams({
    search: String(search || ''),
    page: String(page),
    paginate: String(paginate),
  });
  const request = token =>
    fetch(`${baseUrl}/api/third-party/immapers?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

  let token = await getToken();
  let res = await request(token);
  if (res.status === 401) {
    cachedToken = null;
    token = await loginImmapCareers();
    res = await request(token);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.message || body?.error || res.statusText;
    throw new Error(typeof message === 'string' ? message : 'iMMAP Careers search failed');
  }
  return extractImmapers(body)
    .map(item => ({
      full_name: String(item?.full_name || '').trim(),
      immap_email: String(item?.immap_email || '')
        .toLowerCase()
        .replace(/\s/g, ''),
    }))
    .filter(item => item.full_name && item.immap_email);
}
