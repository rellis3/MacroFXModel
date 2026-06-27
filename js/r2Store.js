/**
 * Generic R2 (S3-compatible) JSON store — shared lego piece.
 *
 * Same endpoint / bucket / credentials env as the M1 loader
 * (volBacktestM1Engine.js): R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY,
 * R2_SECRET_KEY. Provides put/get JSON + key listing so any tool can persist
 * computed artifacts to the same bucket the M1 parquet files live in.
 *
 * Returns null (never throws on missing creds) so callers degrade gracefully
 * when R2 isn't configured (e.g. local sandbox).
 */

import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

export const R2_ENDPOINT = process.env.R2_ENDPOINT || 'https://3e867110ae519cd24afc877c72e5026e.r2.cloudflarestorage.com';
export const R2_BUCKET   = process.env.R2_BUCKET   || 'r2-storage';

export function makeR2Client() {
  const accessKeyId     = process.env.R2_ACCESS_KEY;
  const secretAccessKey = process.env.R2_SECRET_KEY;
  if (!accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    endpoint: R2_ENDPOINT,
    region: 'auto',
    credentials: { accessKeyId, secretAccessKey },
    requestHandler: { connectionTimeout: 10_000 },
  });
}

export function r2Configured() { return !!(process.env.R2_ACCESS_KEY && process.env.R2_SECRET_KEY); }

// Write a JSON-serialisable object. Throws on real R2 errors; returns false if
// credentials are absent.
export async function putJSON(key, obj) {
  const client = makeR2Client();
  if (!client) return false;
  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key,
    Body: JSON.stringify(obj), ContentType: 'application/json',
  }));
  return true;
}

// Read + parse a JSON object. Returns null if missing or creds absent.
export async function getJSON(key) {
  const client = makeR2Client();
  if (!client) return null;
  try {
    const resp = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    const text = await resp.Body.transformToString();
    return JSON.parse(text);
  } catch (e) {
    if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}

// List object keys under a prefix (paginated). Returns [] if creds absent.
export async function listKeys(prefix) {
  const client = makeR2Client();
  if (!client) return [];
  const keys = [];
  let token;
  do {
    const resp = await client.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken: token,
    }));
    for (const o of resp.Contents ?? []) keys.push(o.Key);
    token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (token);
  return keys;
}
