import { getProfileByCode } from '../../auth/microsoftAuthService.js';
import {
  buildMicrosoftUserDetails,
  provisionOpenSignUser,
} from './provisionOpenSignUser.js';
import { saveMicrosoftTokensOnExtUser } from '../helpers/microsoftGraphTokens.js';

export async function runMicrosoftLogin(code, timezone = 'UTC') {
  if (!code) {
    throw new Error('Authorization code is required');
  }

  const { profile, tokens } = await getProfileByCode(code);
  if (!profile.email) {
    throw new Error('Microsoft account has no email');
  }

  const userDetails = buildMicrosoftUserDetails(profile, timezone);
  const result = await provisionOpenSignUser(userDetails);
  try {
    await saveMicrosoftTokensOnExtUser(profile.email, tokens);
  } catch (err) {
    console.error('Failed to persist Microsoft Graph tokens:', err?.message || err);
  }

  return {
    sessionToken: result.sessionToken,
    user: result.user,
    created: result.created,
  };
}
