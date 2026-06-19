// S3-compatible storage adapter.
//
// Works with any S3-compatible provider (AWS S3, Hetzner Object Storage,
// MinIO, Cloudflare R2, Backblaze B2, DigitalOcean Spaces, Wasabi, …).
// Non-AWS providers typically require `forcePathStyle: true` and a custom
// `endpoint`.
//
// Uploads every file under `source` to:
//   {bucket}/{prefix?}/{relative-path}
// Aws-sdk v3 streams the body and signs the request via the canonical
// SigV4 algorithm.
//
// Sync-delete: after upload, keys this adapter wrote on a previous deploy
// (tracked via a manifest at `<prefix>/.deploy-manifest.json`) that are no
// longer part of the current source get removed. Externally-managed
// objects in the bucket are never touched — only keys the adapter itself
// wrote are eligible for deletion. Opt-out via `syncDelete: false`.
//
// Docs: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';

import { MANIFEST_FILENAME, deleteKeys, readManifestKeys, writeManifest } from './s3-sync.mjs';
import { contentTypeFor, mapLimit, requireEnv, toPosix, walk } from './utils.mjs';

export async function deploy({ source, config, dryRun, logger = console }) {
  const {
    endpoint,
    region,
    bucket,
    prefix = '',
    accessKeyIdEnv,
    secretAccessKeyEnv,
    forcePathStyle = false,
    acl,
    cacheControl,
    concurrency = 8,
    syncDelete = true,
  } = config;

  if (!bucket) throw new Error('s3: missing config.bucket');
  if (!region) throw new Error('s3: missing config.region');
  if (!accessKeyIdEnv) throw new Error('s3: missing config.accessKeyIdEnv');
  if (!secretAccessKeyEnv) throw new Error('s3: missing config.secretAccessKeyEnv');

  const accessKeyId = requireEnv(accessKeyIdEnv, 's3');
  const secretAccessKey = requireEnv(secretAccessKeyEnv, 's3');

  const client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
    ...(endpoint ? { endpoint } : {}),
    ...(forcePathStyle ? { forcePathStyle: true } : {}),
  });

  const prefixStr = prefix.replace(/^\/+|\/+$/g, '');
  const makeKey = (rel) => (prefixStr ? `${prefixStr}/${rel}` : rel);

  const files = await walk(source);
  if (files.length === 0) {
    throw new Error(`s3: no files found under ${source}`);
  }

  const target = endpoint
    ? `${endpoint.replace(/\/$/, '')}/${bucket}/${prefixStr ? prefixStr + '/' : ''}`
    : `s3://${bucket}/${prefixStr ? prefixStr + '/' : ''} (${region})`;
  logger.log(`  target:   ${target}`);
  logger.log(`  files:    ${files.length}`);
  logger.log(`  parallel: ${concurrency}`);

  let uploaded = 0;
  let totalBytes = 0;
  let deletedCount = 0;
  const uploadedRels = [];

  try {
    await mapLimit(files, concurrency, async (file) => {
      const rel = toPosix(relative(source, file));
      const key = makeKey(rel);
      const body = await readFile(file);
      totalBytes += body.byteLength;

      if (dryRun) {
        logger.log(`  [dry-run] PUT ${key} (${body.byteLength} B, ${contentTypeFor(file)})`);
      } else {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentTypeFor(file),
            ...(acl ? { ACL: acl } : {}),
            ...(cacheControl ? { CacheControl: cacheControl } : {}),
          })
        );
        uploaded++;
        logger.log(`  ✓ ${key}`);
      }
      uploadedRels.push(rel);
    });

    if (syncDelete) {
      const manifestKey = makeKey(MANIFEST_FILENAME);
      const currentKeys = new Set(uploadedRels.map(makeKey));

      if (dryRun) {
        logger.log(
          `  [dry-run] would read manifest ${manifestKey}, delete obsolete keys, then rewrite manifest`
        );
      } else {
        const previousKeys = await readManifestKeys(client, bucket, manifestKey);

        // Only delete keys this adapter wrote previously — never touch
        // objects that were placed in the bucket by someone else.
        const obsolete = previousKeys.filter((k) => !currentKeys.has(k) && k !== manifestKey);

        if (obsolete.length === 0) {
          logger.log(`  sync:     no obsolete keys to remove`);
        } else {
          await deleteKeys(client, bucket, obsolete);
          deletedCount = obsolete.length;
          for (const k of obsolete) logger.log(`  ✗ ${k} (deleted, obsolete)`);
        }

        await writeManifest(client, bucket, manifestKey, [...currentKeys]);
        logger.log(`  ✓ manifest ${manifestKey} (${currentKeys.size} key(s))`);
      }
    }
  } finally {
    client.destroy();
  }

  const mb = (totalBytes / 1024 / 1024).toFixed(2);
  if (dryRun) {
    logger.log(`  [dry-run] would upload ${files.length} files (${mb} MB)`);
  } else {
    logger.log(
      `  uploaded ${uploaded}/${files.length} files (${mb} MB)` +
        (deletedCount > 0 ? `, deleted ${deletedCount} obsolete key(s)` : '')
    );
  }
}
