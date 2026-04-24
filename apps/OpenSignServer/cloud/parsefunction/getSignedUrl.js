import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as presign } from '@aws-sdk/s3-request-presigner';
import { useLocal } from '../../Utils.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { isAuthenticated } from '../../utils/AuthUtils.js';
dotenv.config({ quiet: true });

function extractKeyFromUrl(url) {
  // Create a new URL object
  const parsedUrl = new URL(url);
  // Get the pathname of the URL
  const pathname = parsedUrl.pathname; // e.g. /mybucket/path/to/file.pdf (depends on baseUrl style)
  // Extract the filename from the pathname
  const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
  return filename;
}

function makeEndpoint(endpoint) {
  if (!endpoint) return '';

  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }

  return `https://${endpoint}`;
}

function makeS3Client() {
  const accessKeyId = process.env.DO_ACCESS_KEY_ID;

  const secretAccessKey = process.env.DO_SECRET_ACCESS_KEY;

  const region = process.env.DO_REGION;

  const endpoint = makeEndpoint(process.env.DO_ENDPOINT);

  return new S3Client({
    region,
    endpoint, // endpoint should be Url e.g. https://blr1.digitaloceanspaces.com)
    credentials: { accessKeyId, secretAccessKey },
  });
}

export default async function getPresignedUrl(url) {
  if (url?.includes('files')) {
    return presignedlocalUrl(url);
  } else {
    // For remote storage, return an app-owned proxy URL so the client never sees S3 URLs
    // (and avoids S3 CORS issues).
    return createProxyUrl(url);
  }
}

function getPublicOrigin() {
  // cloudServerUrl often includes /app; we only want the origin.
  const serverUrl = process.env.SERVER_URL || process.env.CLOUD_SERVER_URL || process.env.PARSE_SERVER_URL;
  try {
    if (serverUrl) return new URL(serverUrl).origin;
  } catch {
    // ignore
  }
  // Fallback: DO_BASEURL is typically like https://<bucket>.<region>... but we want our own server.
  // If SERVER_URL isn't provided, the proxy still works when called relative from the client.
  return '';
}

export function createProxyUrl(remoteUrl, expirationTimeInSeconds) {
  const secretKey = process.env.MASTER_KEY;
  const exp = expirationTimeInSeconds || 200;
  const payload = {
    url: remoteUrl,
    exp: Math.floor(Date.now() / 1000) + exp,
  };
  const token = jwt.sign(payload, secretKey);
  const origin = getPublicOrigin();
  const mountPath = process.env.PARSE_MOUNT || '/app';
  // Proxy route is mounted both at / and at the Parse mount path; prefer mount path for hosted setups.
  return `${origin}${mountPath}/proxy/s3?token=${token}`;
}

export async function getSignedUrl(request) {
  try {
    const docId = request.params.docId || '';
    const templateId = request.params.templateId || '';
    const url = request.params.url;

    if (docId || templateId) {
      try {
        if (url?.includes('files')) {
          return presignedlocalUrl(url);
        } else if (useLocal !== 'true') {
          const query = new Parse.Query(docId ? 'contracts_Document' : 'contracts_Template');
          query.equalTo('objectId', docId ? docId : templateId);
          query.include('ExtUserPtr.TenantId');
          query.notEqualTo('IsArchive', true);
          const res = await query.first({ useMasterKey: true });
          if (!res) return url;

          const _resDoc = res?.toJSON();
          // Ensure user is authenticated if OTP is required
          if (_resDoc?.IsEnableOTP) {
            const isAuth = await isAuthenticated(request?.user);
            if (!isAuth) {
              throw new Parse.Error(
                Parse.Error.INVALID_SESSION_TOKEN,
                'User is not authenticated.'
              );
            }
          }

          return createProxyUrl(url, 160);
        } else {
          return url;
        }
      } catch (err) {
        console.log('Err in presigned url', err);
        throw err;
      }
    } else {
      const isAuth = await isAuthenticated(request?.user);
      if (!isAuth) {
        throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'User is not authenticated.');
      } else {
        if (url?.includes('files')) {
          return presignedlocalUrl(url);
        } else if (useLocal !== 'true') {
          return createProxyUrl(url, 160);
        } else {
          return url;
        }
      }
    }
  } catch (err) {
    console.log('error in getsignedurl', err);
    const code = err.code || 400;
    const msg = err.message;
    const error = new Parse.Error(code, msg);
    throw error;
  }
}

// Function to generate a signed URL with JWT
export function getSignedLocalUrl(fileUrl, expirationTimeInSeconds) {
  const secretKey = process.env.MASTER_KEY;
  const exp = expirationTimeInSeconds || 200;
  try {
    // Create the payload with the file URL and expiration time
    const payload = {
      fileUrl,
      exp: Math.floor(Date.now() / 1000) + exp, // Expiry time in seconds
    };

    // Generate the JWT token
    const token = jwt.sign(payload, secretKey);
    // Return the signed URL containing the token
    return `${fileUrl}?token=${token}`;
  } catch (err) {
    console.log('Err while siging local url', err);
    throw new Error('Invalid or expired token.');
  }
}

export function presignedlocalUrl(signedUrl, expirationTimeInSeconds) {
  if (signedUrl?.includes('files')) {
    const fileUrl = signedUrl.split('?')?.[0];
    const secretKey = process.env.MASTER_KEY;
    const exp = expirationTimeInSeconds || 200;
    try {
      // Create the payload with the file URL and expiration time
      const payload = {
        fileUrl,
        exp: Math.floor(Date.now() / 1000) + exp, // Expiry time in seconds
      };
      // Generate the JWT token
      const token = jwt.sign(payload, secretKey);
      // Return the signed URL containing the token
      return `${fileUrl}?token=${token}`;
    } catch (err) {
      throw new Error('Invalid or expired token.');
    }
  } else {
    return signedUrl;
  }
}

// Function to validate the signed URL
export async function validateSignedLocalUrl(signedUrl) {
  const urlParams = new URLSearchParams(signedUrl.split('?')[1]);
  const token = urlParams.get('token');
  try {
    if (!token) {
      throw new Error('No token provided.');
    }
    const secretKey = process.env.MASTER_KEY;
    // Now verify the token (validate signature and expiration automatically)
    const decoded = jwt.verify(token, secretKey);
    // Check if the file URL in the JWT matches the requested file URL
    const fileUrl = signedUrl.split('?')[0];
    if (decoded.fileUrl !== fileUrl) {
      throw new Error('Invalid file URL in token.');
    }
    // If the token is valid and not expired, return the file URL
    return signedUrl;
  } catch (error) {
    console.log('Error validating file', error.message);
    return 'Unauthorized';
  }
}
