import axios from 'axios';
import crypto from 'node:crypto';
import { cloudServerUrl, serverAppId } from '../../Utils.js';

const serverUrl = cloudServerUrl;
const APPID = serverAppId;
const masterKEY = process.env.MASTER_KEY;

async function findParseUserByEmail(email) {
  const byUsername = new Parse.Query(Parse.User);
  byUsername.equalTo('username', email);
  const byEmail = new Parse.Query(Parse.User);
  byEmail.equalTo('email', email);
  return Parse.Query.or(byUsername, byEmail).first({ useMasterKey: true });
}

export async function saveParseUser(userDetails) {
  const email = userDetails?.email?.toLowerCase()?.replace(/\s/g, '');
  const userRes = await findParseUserByEmail(email);

  if (userRes) {
    const url = `${serverUrl}/loginAs`;
    const axiosRes = await axios({
      method: 'POST',
      url,
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'X-Parse-Application-Id': APPID,
        'X-Parse-Master-Key': masterKEY,
      },
      params: {
        userId: userRes.id,
      },
    });
    const login = await axiosRes.data;
    return { id: login.objectId, sessionToken: login.sessionToken };
  }

  const user = new Parse.User();
  user.set('username', email);
  user.set('password', userDetails.password);
  user.set('email', userDetails?.email?.toLowerCase()?.replace(/\s/g, ''));
  if (userDetails?.phone) {
    user.set('phone', userDetails.phone);
  }
  user.set('name', userDetails.name);

  const res = await user.signUp();
  return { id: res.id, sessionToken: res.getSessionToken() };
}

export async function loginAsUserById(userId) {
  const url = `${serverUrl}/loginAs`;
  const axiosRes = await axios({
    method: 'POST',
    url,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'X-Parse-Application-Id': APPID,
      'X-Parse-Master-Key': masterKEY,
    },
    params: { userId },
  });
  const login = await axiosRes.data;
  return { id: login.objectId, sessionToken: login.sessionToken };
}

/**
 * Create or return session for a full OpenSign user (Parse _User + contracts_Users + tenant).
 */
export async function provisionOpenSignUser(userDetails) {
  const email = userDetails?.email?.toLowerCase()?.replace(/\s/g, '');
  if (!email) {
    throw new Error('Email is required');
  }

  const extQuery = new Parse.Query('contracts_Users');
  extQuery.equalTo('Email', email);
  const existingExt = await extQuery.first({ useMasterKey: true });

  if (existingExt) {
    const userId = existingExt.get('UserId')?.id;
    if (!userId) {
      throw new Error('Extended user record is invalid');
    }
    const session = await loginAsUserById(userId);
    return {
      sessionToken: session.sessionToken,
      user: { email, name: existingExt.get('Name') || userDetails.name },
      created: false,
    };
  }

  const user = await saveParseUser(userDetails);
  const extClass = userDetails.role.split('_')[0];

  const extByUserQuery = new Parse.Query(extClass + '_Users');
  extByUserQuery.equalTo('UserId', {
    __type: 'Pointer',
    className: '_User',
    objectId: user.id,
  });
  const extUser = await extByUserQuery.first({ useMasterKey: true });
  if (extUser) {
    return {
      sessionToken: user.sessionToken,
      user: { email, name: extUser.get('Name') || userDetails.name },
      created: false,
    };
  }

  await createExtendedUserRecords(user, userDetails);

  return {
    sessionToken: user.sessionToken,
    user: { email, name: userDetails.name },
    created: true,
  };
}

export async function createExtendedUserRecords(parseUser, userDetails) {
  const email = userDetails?.email?.toLowerCase()?.replace(/\s/g, '');
  const extClass = userDetails.role.split('_')[0];

  const partnerCls = Parse.Object.extend('partners_Tenant');
  const partnerQuery = new partnerCls();
  partnerQuery.set('UserId', {
    __type: 'Pointer',
    className: '_User',
    objectId: parseUser.id,
  });

  if (userDetails?.phone) {
    partnerQuery.set('ContactNumber', userDetails.phone);
  }
  partnerQuery.set('TenantName', userDetails.company);
  partnerQuery.set('EmailAddress', email);
  partnerQuery.set('IsActive', true);
  partnerQuery.set('CreatedBy', {
    __type: 'Pointer',
    className: '_User',
    objectId: parseUser.id,
  });
  if (userDetails?.pincode) partnerQuery.set('PinCode', userDetails.pincode);
  if (userDetails?.country) partnerQuery.set('Country', userDetails.country);
  if (userDetails?.state) partnerQuery.set('State', userDetails.state);
  if (userDetails?.city) partnerQuery.set('City', userDetails.city);
  if (userDetails?.address) partnerQuery.set('Address', userDetails.address);

  const tenantRes = await partnerQuery.save(null, { useMasterKey: true });

  const extCls = Parse.Object.extend(extClass + '_Users');
  const newObj = new extCls();
  newObj.set('UserId', {
    __type: 'Pointer',
    className: '_User',
    objectId: parseUser.id,
  });
  newObj.set('UserRole', userDetails.role);
  newObj.set('Email', email);
  newObj.set('Name', userDetails.name);
  if (userDetails?.phone) {
    newObj.set('Phone', userDetails.phone);
  }
  newObj.set('TenantId', {
    __type: 'Pointer',
    className: 'partners_Tenant',
    objectId: tenantRes.id,
  });
  if (userDetails?.company) {
    newObj.set('Company', userDetails.company);
  }
  if (userDetails?.jobTitle) {
    newObj.set('JobTitle', userDetails.jobTitle);
  }
  if (userDetails?.timezone) {
    newObj.set('Timezone', userDetails.timezone);
  }
  await newObj.save(null, { useMasterKey: true });
}

export function buildMicrosoftUserDetails(profile, timezone = 'UTC') {
  const name =
    profile.name ||
    [profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
    profile.email;

  return {
    email: profile.email,
    name,
    role: 'contracts_User',
    company: 'iMMAP',
    jobTitle: 'Staff',
    password: crypto.randomBytes(32).toString('hex'),
    timezone,
  };
}
