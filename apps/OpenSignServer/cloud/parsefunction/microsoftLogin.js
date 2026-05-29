import { runMicrosoftLogin } from './runMicrosoftLogin.js';

export default async function microsoftLogin(request) {
  const { code, timezone } = request.params || {};
  return runMicrosoftLogin(code, timezone || 'UTC');
}
