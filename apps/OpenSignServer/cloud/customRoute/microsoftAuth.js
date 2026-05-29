import { getCodeUrl } from '../../auth/microsoftAuthService.js';
import { runMicrosoftLogin } from '../parsefunction/runMicrosoftLogin.js';

export async function getMicrosoftConsent(req, res) {
  try {
    const state = req.query.state;
    const url = await getCodeUrl(state);
    return res.status(200).json({ url });
  } catch (error) {
    console.error('Microsoft consent error:', error?.message || error);
    return res.status(503).json({
      message: error?.message || 'Microsoft authentication is not configured',
    });
  }
}

export async function postMicrosoftLogin(req, res) {
  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ message: 'Authorization code is required' });
  }

  try {
    const timezone = req.body?.timezone || 'UTC';
    const result = await runMicrosoftLogin(code, timezone);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Microsoft login error:', error?.message || error);
    return res.status(401).json({
      message: 'Microsoft sign-in failed. Please try again.',
    });
  }
}
