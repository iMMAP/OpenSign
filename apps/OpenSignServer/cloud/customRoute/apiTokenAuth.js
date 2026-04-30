import {
  findUserByApiToken,
  markApiTokenUsage,
  getWebhookForUser,
  saveWebhookForUser,
} from '../helpers/apiIntegration.js';

export async function authenticateApiToken(req, res, next) {
  try {
    const apiToken = req.get('X-Api-Token') || req.get('X-Parse-ApiKey');
    if (!apiToken) {
      return res.status(401).json({ error: 'Missing API token' });
    }
    const user = await findUserByApiToken(apiToken);
    if (!user) {
      return res.status(401).json({ error: 'Invalid API token' });
    }
    await markApiTokenUsage(user);
    req.apiUser = user;
    return next();
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Authentication failed' });
  }
}

export async function getWebhookByToken(req, res) {
  try {
    const webhook = getWebhookForUser(req.apiUser);
    return res.status(200).json(webhook);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to fetch webhook' });
  }
}

export async function saveWebhookByToken(req, res) {
  try {
    const webhook = await saveWebhookForUser(req.apiUser, req.body || {});
    return res.status(200).json(webhook);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'Unable to save webhook' });
  }
}
