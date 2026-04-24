import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { RateLimiterMemory } from 'rate-limiter-flexible';

dotenv.config({ quiet: true });

function makeEndpoint(endpoint) {
  if (!endpoint) return '';
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) return endpoint;
  return `https://${endpoint}`;
}

function makeS3Client() {
  const accessKeyId = process.env.DO_ACCESS_KEY_ID;
  const secretAccessKey = process.env.DO_SECRET_ACCESS_KEY;
  const region = process.env.DO_REGION;
  const endpoint = makeEndpoint(process.env.DO_ENDPOINT);
  return new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function extractKeyFromUrl(url) {
  const parsedUrl = new URL(url);
  const pathname = parsedUrl.pathname;
  const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
  return filename;
}

function parseRangeHeader(rangeHeader) {
  // supports: bytes=start-end, bytes=start-, bytes=-suffixLength (suffix not supported here)
  if (!rangeHeader) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!m) return null;
  const startStr = m[1];
  const endStr = m[2];
  if (startStr === '' && endStr === '') return null;
  if (startStr === '') return null; // suffix ranges not supported
  const start = Number(startStr);
  const end = endStr === '' ? undefined : Number(endStr);
  if (!Number.isFinite(start) || (end !== undefined && !Number.isFinite(end))) return null;
  if (end !== undefined && end < start) return null;
  return { start, end };
}

const limiter = new RateLimiterMemory({
  points: 120, // 120 requests
  duration: 60, // per 60 seconds per IP
});

export async function proxyS3(req, res) {
  try {
    const ip = req.headers['x-real-ip'] || req.ip || 'unknown';
    await limiter.consume(String(ip));

    const token = req.query.token;
    if (!token) return res.status(400).json({ message: 'missing token' });

    const secretKey = process.env.MASTER_KEY;
    if (!secretKey) return res.status(500).json({ message: 'server misconfigured' });

    let decoded;
    try {
      decoded = jwt.verify(token, secretKey);
    } catch {
      return res.status(403).json({ message: 'invalid or expired token' });
    }

    const url = decoded?.url;
    if (!url) return res.status(400).json({ message: 'missing url' });

    const bucket = process.env.DO_SPACE;
    if (!bucket) return res.status(500).json({ message: 'missing bucket' });

    const key = extractKeyFromUrl(url);
    if (!key) return res.status(400).json({ message: 'invalid key' });

    const range = parseRangeHeader(req.headers.range);
    const client = makeS3Client();

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(range
        ? { Range: `bytes=${range.start}-${range.end !== undefined ? range.end : ''}` }
        : {}),
    });

    const s3Res = await client.send(command);

    const contentType = s3Res.ContentType || 'application/octet-stream';
    const contentLength = s3Res.ContentLength;
    const acceptRanges = s3Res.AcceptRanges || 'bytes';
    const contentRange = s3Res.ContentRange;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', acceptRanges);
    res.setHeader('Cache-Control', 'private, max-age=60');
    // Inline display for PDFs; download behavior can still be controlled client-side.
    res.setHeader('Content-Disposition', `inline; filename="${key}"`);

    if (range && contentRange) {
      res.status(206);
      res.setHeader('Content-Range', contentRange);
    }
    if (typeof contentLength === 'number') {
      res.setHeader('Content-Length', String(contentLength));
    }

    // Stream response body; no temp files → no cleanup needed.
    s3Res.Body.pipe(res);
  } catch (err) {
    if (err?.msBeforeNext !== undefined) {
      return res.status(429).json({ message: 'rate limited' });
    }
    console.log('proxyS3 error', err);
    return res.status(500).json({ message: 'proxy error' });
  }
}

