import { createExtendedUserRecords, saveParseUser } from './provisionOpenSignUser.js';

export default async function usersignup(request) {
  const userDetails = request.params.userDetails;

  try {
    const user = await saveParseUser(userDetails);
    const extClass = userDetails.role.split('_')[0];

    const extQuery = new Parse.Query(extClass + '_Users');
    extQuery.equalTo('UserId', {
      __type: 'Pointer',
      className: '_User',
      objectId: user.id,
    });
    const extUser = await extQuery.first({ useMasterKey: true });
    if (extUser) {
      return { message: 'User already exist' };
    }

    await createExtendedUserRecords(user, userDetails);
    return { message: 'User sign up', sessionToken: user.sessionToken };
  } catch (err) {
    console.log('Err ', err);
  }
}
