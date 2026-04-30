import {
  generateApiTokenForUser,
  getApiTokenMeta,
  revokeApiTokenForUser,
  saveWebhookForUser,
  getWebhookForUser,
} from '../helpers/apiIntegration.js';

function requireUser(request) {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, 'Please login and try again.');
  }
  return request.user;
}

export async function generateApiToken(request) {
  const user = requireUser(request);
  return generateApiTokenForUser(user);
}

export async function getApiToken(request) {
  const user = requireUser(request);
  return getApiTokenMeta(user);
}

export async function revokeApiToken(request) {
  const user = requireUser(request);
  await revokeApiTokenForUser(user);
  return { success: true };
}

export async function saveWebhook(request) {
  const user = requireUser(request);
  const params = request.params || {};
  return saveWebhookForUser(user, params);
}

export async function getWebhook(request) {
  const user = requireUser(request);
  return getWebhookForUser(user);
}
