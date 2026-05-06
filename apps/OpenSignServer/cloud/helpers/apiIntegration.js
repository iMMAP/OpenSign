import crypto from 'node:crypto';
import axios from 'axios';

const EVENT_OPTIONS = [
  'document.viewed',
  'document.signed',
  'document.completed',
  'document.declined',
];

export function hashApiToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function maskApiToken(token) {
  if (!token || token.length < 10) return '********';
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

function normalizeEvents(events) {
  if (!Array.isArray(events) || !events.length) {
    return EVENT_OPTIONS;
  }
  const unique = [...new Set(events.filter(event => EVENT_OPTIONS.includes(event)))];
  return unique.length ? unique : EVENT_OPTIONS;
}

function buildUserWebhookData(userObj) {
  return {
    webhookUrl: userObj?.get('WebhookUrl') || '',
    webhookSecret: userObj?.get('WebhookSecret') || '',
    webhookEvents: normalizeEvents(userObj?.get('WebhookEvents') || []),
    updatedAt: userObj?.get('WebhookUpdatedAt') || null,
  };
}

export async function generateApiTokenForUser(user) {
  const plainToken = `os_${crypto.randomBytes(24).toString('hex')}`;
  user.set('ApiTokenHash', hashApiToken(plainToken));
  user.set('ApiTokenPreview', maskApiToken(plainToken));
  user.set('ApiTokenCreatedAt', new Date());
  user.set('ApiTokenLastUsedAt', null);
  await user.save(null, { useMasterKey: true });
  return {
    token: plainToken,
    preview: user.get('ApiTokenPreview'),
    createdAt: user.get('ApiTokenCreatedAt'),
  };
}

export function getApiTokenMeta(userObj) {
  const preview = userObj?.get('ApiTokenPreview');
  return {
    enabled: Boolean(preview),
    preview: preview || null,
    createdAt: userObj?.get('ApiTokenCreatedAt') || null,
    lastUsedAt: userObj?.get('ApiTokenLastUsedAt') || null,
  };
}

export async function revokeApiTokenForUser(user) {
  user.unset('ApiTokenHash');
  user.unset('ApiTokenPreview');
  user.unset('ApiTokenCreatedAt');
  user.unset('ApiTokenLastUsedAt');
  await user.save(null, { useMasterKey: true });
}

export async function findUserByApiToken(token) {
  const tokenHash = hashApiToken(token);
  const query = new Parse.Query(Parse.User);
  query.equalTo('ApiTokenHash', tokenHash);
  query.select(['email', 'username', 'ApiTokenHash']);
  return query.first({ useMasterKey: true });
}

export async function markApiTokenUsage(userObj) {
  const updateUser = new Parse.User();
  updateUser.id = userObj.id;
  updateUser.set('ApiTokenLastUsedAt', new Date());
  await updateUser.save(null, { useMasterKey: true });
}

export async function saveWebhookForUser(userObj, webhookData = {}) {
  const { url = '', secret = '', events = [] } = webhookData;
  const normalizedUrl = String(url).trim();

  if (normalizedUrl) {
    try {
      new URL(normalizedUrl);
    } catch (err) {
      throw new Parse.Error(Parse.Error.VALIDATION_ERROR, 'Please provide a valid webhook URL.');
    }
  }

  userObj.set('WebhookUrl', normalizedUrl);
  userObj.set('WebhookSecret', String(secret || '').trim());
  userObj.set('WebhookEvents', normalizeEvents(events));
  userObj.set('WebhookUpdatedAt', new Date());
  await userObj.save(null, { useMasterKey: true });
  return buildUserWebhookData(userObj);
}

export function getWebhookForUser(userObj) {
  return buildUserWebhookData(userObj);
}

export async function sendWebhookEvent(userId, payload) {
  if (!userId) return { delivered: false, reason: 'owner_missing' };
  const query = new Parse.Query(Parse.User);
  const owner = await query.get(userId, { useMasterKey: true });
  const webhook = buildUserWebhookData(owner);
  if (!webhook.webhookUrl) return { delivered: false, reason: 'webhook_not_configured' };
  if (!webhook.webhookEvents.includes(payload.event)) {
    return { delivered: false, reason: 'event_not_subscribed' };
  }

  const body = {
    ...payload,
    sentAt: new Date().toISOString(),
  };
  const rawBody = JSON.stringify(body);
  const headers = { 'Content-Type': 'application/json' };
  if (webhook.webhookSecret) {
    const signature = crypto
      .createHmac('sha256', webhook.webhookSecret)
      .update(rawBody)
      .digest('hex');
    headers['X-OpenSign-Signature'] = signature;
  }
  await axios.post(webhook.webhookUrl, body, { headers, timeout: 10000 });
  return { delivered: true };
}
