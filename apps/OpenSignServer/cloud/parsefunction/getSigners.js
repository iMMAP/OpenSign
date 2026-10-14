import { isImmapCareersConfigured, searchImmapers } from '../helpers/immapCareers.js';

// Function to escape special characters in the search string
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape special characters
}

async function findOrCreateImmaperContact(ownerId, { full_name, immap_email }) {
  const ownerPtr = { __type: 'Pointer', className: '_User', objectId: ownerId };
  const existingQ = new Parse.Query('contracts_Contactbook');
  existingQ.equalTo('CreatedBy', ownerPtr);
  existingQ.notEqualTo('IsDeleted', true);
  existingQ.equalTo('Email', immap_email);
  const existing = await existingQ.first({ useMasterKey: true });
  if (existing) {
    return JSON.parse(JSON.stringify(existing));
  }

  let guestUser;
  try {
    const user = new Parse.User();
    user.set('name', full_name);
    user.set('username', immap_email);
    user.set('email', immap_email);
    user.set('password', immap_email);
    guestUser = await user.signUp(null, { useMasterKey: true });
  } catch (err) {
    if (err.code !== 202) throw err;
    const userQ = new Parse.Query(Parse.User);
    userQ.equalTo('email', immap_email);
    guestUser = await userQ.first({ useMasterKey: true });
    if (!guestUser) throw err;
  }

  const contact = new Parse.Object('contracts_Contactbook');
  contact.set('Name', full_name);
  contact.set('Email', immap_email);
  contact.set('UserRole', 'contracts_Guest');
  contact.set('IsDeleted', false);
  contact.set('CreatedBy', ownerPtr);
  contact.set('UserId', guestUser);
  const acl = new Parse.ACL();
  acl.setReadAccess(guestUser.id, true);
  acl.setWriteAccess(guestUser.id, true);
  acl.setReadAccess(ownerId, true);
  acl.setWriteAccess(ownerId, true);
  contact.setACL(acl);
  const saved = await contact.save(null, { useMasterKey: true });
  return JSON.parse(JSON.stringify(saved));
}

async function immaperContacts(ownerId, search) {
  if (!search || !isImmapCareersConfigured()) return [];
  const people = await searchImmapers(search, { page: 1, paginate: 50 });
  const contacts = [];
  for (const person of people) {
    contacts.push(await findOrCreateImmaperContact(ownerId, person));
  }
  return contacts;
}

async function getContacts(searchObj, isJWT) {
  try {
    const escapedSearch = escapeRegExp(searchObj.search); // Escape the search input
    const searchRegex = new RegExp(escapedSearch, 'i'); // Create regex once to reuse
    const contactNameQuery = new Parse.Query('contracts_Contactbook');
    contactNameQuery.matches('Name', searchRegex);

    const conatctEmailQuery = new Parse.Query('contracts_Contactbook');
    conatctEmailQuery.matches('Email', searchRegex);

    // Combine the two queries with OR
    const mainQuery = Parse.Query.or(contactNameQuery, conatctEmailQuery);

    // Add the common condition for 'CreatedBy'
    mainQuery.equalTo('CreatedBy', searchObj.CreatedBy);
    mainQuery.notEqualTo('IsDeleted', true);
    const findOpt = isJWT ? { useMasterKey: true } : { sessionToken: searchObj.sessionToken };
    const contactRes = await mainQuery.find(findOpt);
    const _contactRes = JSON.parse(JSON.stringify(contactRes));
    return _contactRes;
  } catch (err) {
    console.log('err while fetch contacts', err);
    throw err;
  }
}
export default async function getSigners(request) {
  const searchObj = { search: request.params.search || '', sessionToken: '' };
  try {
    if (request.user) {
      searchObj.CreatedBy = { __type: 'Pointer', className: '_User', objectId: request?.user?.id };
      searchObj.sessionToken = request.user.getSessionToken();
      const contacts = await getContacts(searchObj);
      let immapers = [];
      try {
        immapers = await immaperContacts(request.user.id, searchObj.search);
      } catch (err) {
        console.log('err while searching iMMAPers', err?.message || err);
      }
      const seen = new Set();
      return [...contacts, ...immapers].filter(contact => {
        const email = String(contact?.Email || '').toLowerCase();
        if (!email || seen.has(email)) return false;
        seen.add(email);
        return true;
      });
    } else {
      throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
    }
  } catch (err) {
    console.log('err in get signers', err);
    throw err;
  }
}
