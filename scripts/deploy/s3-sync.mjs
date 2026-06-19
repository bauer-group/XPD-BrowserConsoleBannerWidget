// Shared sync-delete logic for S3-backed adapters (cloudflare, s3).
//
// The adapter tracks every key it writes in a manifest file at
//   <prefix>/.deploy-manifest.json
// — on the next deploy it reads that manifest, and any key listed there but
// no longer part of the current upload is deleted. Keys the adapter never
// wrote are invisible to the cleanup logic, so the bucket can safely host
// externally-managed objects alongside adapter-managed ones.
//
// Missing manifest = first deploy (or someone deleted it out of band). In
// that case `readManifestKeys` returns `[]`, no deletion happens, and a
// fresh manifest is written from the current upload set.

import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

export const MANIFEST_FILENAME = '.deploy-manifest.json';

// S3 DeleteObjects accepts up to 1000 keys per request.
const DELETE_BATCH_SIZE = 1000;

export async function readManifestKeys(s3, bucket, manifestKey) {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: manifestKey }));
    const body = await res.Body.transformToString();
    const parsed = JSON.parse(body);
    return Array.isArray(parsed?.keys) ? parsed.keys.filter((k) => typeof k === 'string') : [];
  } catch (err) {
    const notFound =
      err?.name === 'NoSuchKey' ||
      err?.Code === 'NoSuchKey' ||
      err?.$metadata?.httpStatusCode === 404;
    if (notFound) return [];
    throw err;
  }
}

export async function writeManifest(s3, bucket, manifestKey, keys) {
  const body = JSON.stringify(
    {
      version: 1,
      updatedAt: new Date().toISOString(),
      keys: [...keys].sort(),
    },
    null,
    2
  );
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: manifestKey,
      Body: body,
      ContentType: 'application/json; charset=utf-8',
      CacheControl: 'no-store',
    })
  );
}

export async function deleteKeys(s3, bucket, keys) {
  for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
    const batch = keys.slice(i, i + DELETE_BATCH_SIZE);
    const res = await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      })
    );
    if (res.Errors?.length) {
      const first = res.Errors[0];
      throw new Error(
        `s3-sync: DeleteObjects failed for ${res.Errors.length} key(s). ` +
          `First: ${first.Key} — ${first.Code}: ${first.Message}`
      );
    }
  }
}
