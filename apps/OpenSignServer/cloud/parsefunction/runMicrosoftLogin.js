import { getProfileByCode } from '../../auth/microsoftAuthService.js';
import {
  buildMicrosoftUserDetails,
  provisionOpenSignUser,
} from './provisionOpenSignUser.js';

export async function runMicrosoftLogin(code, timezone = 'UTC') {
  if (!code) {
    throw new Error('Authorization code is required');
  }

  const profile = await getProfileByCode(code);
  if (!profile.email) {
    throw new Error('Microsoft account has no email');
  }

  const userDetails = buildMicrosoftUserDetails(profile, timezone);
  const result = await provisionOpenSignUser(userDetails);

  return {
    sessionToken: result.sessionToken,
    user: result.user,
    created: result.created,
  };
}
