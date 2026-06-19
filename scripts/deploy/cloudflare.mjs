// Cloudflare R2 + CDN adapter.
//
// Three-step deploy for sites fronted by Cloudflare:
//   1. Upload every file under `source` to an R2 bucket via the S3-compatible
//      API (R2 speaks SigV4, so we reuse @aws-sdk/client-s3).
//   2. Sync-delete: remove R2 keys that **this adapter wrote on a previous
//      deploy** but are no longer part of the local source. Uses a manifest
//      file (`.deploy-manifest.json` at the prefix root) as the sole source
//      of truth for "what's ours" — files in the bucket that the adapter
//      never wrote are never touched, so the bucket can safely hold
//      externally-managed objects alongside adapter-managed ones.
//      Opt-out via `syncDelete: false`.
//   3. Purge the matching URLs on the Cloudflare zone so clients fetch the
//      new bytes before the edge TTL expires.
//
// R2 docs:     https://developers.cloudflare.com/r2/api/s3/api/
// Purge docs:  https://developers.cloudflare.com/api/operations/zone-purge
// SDK:         https://github.com/cloudflare/cloudflare-typescript
//
// Cache-Control default: `public, max-age=300, s-maxage=31536000`.
// Split-TTL belt-and-suspenders — CDNs (incl. Cloudflare) prefer
// `s-maxage` for their edge cache, browsers only see `max-age`. So:
//   * If the Cloudflare Cache Rule is active, it overrides everything
//     and this header is cosmetic.
//   * If the Rule is missing/broken, Cloudflare's edge still caches for
//     1 year (via s-maxage) and browsers cache for 5 minutes (via
//     max-age) — matches the Rule's intent without it. Note that CF's
//     default-cache behaviour skips HTML unless a Rule says otherwise,
//     so the Rule is still essential for the HTML landing page itself;
//     the header fallback only protects static assets (CSS/JS/images).

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import Cloudflare from 'cloudflare';
import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';

import { MANIFEST_FILENAME, deleteKeys, readManifestKeys, writeManifest } from './s3-sync.mjs';
import { contentTypeFor, mapLimit, requireEnv, toPosix, walk } from './utils.mjs';

// Cloudflare's purge-by-URL endpoint accepts up to 30 URLs per call
// on Free / Pro / Business plans (500 on Enterprise). Batch accordingly.
const PURGE_BATCH_SIZE = 30;

export async function deploy({ source, config, dryRun, logger = console }) {
  const {
    accountId,
    endpoint,
    bucket,
    prefix = '',
    accessKeyIdEnv,
    secretAccessKeyEnv,
    cacheControl = 'public, max-age=300, s-maxage=31536000',
    concurrency = 8,
    syncDelete = true,
    zoneIdEnv,
    apiTokenEnv,
    publicOrigin,
    purgeEverything = false,
  } = config;

  if (!accountId) throw new Error('cloudflare: missing config.accountId');
  if (!bucket) throw new Error('cloudflare: missing config.bucket');
  if (!accessKeyIdEnv) throw new Error('cloudflare: missing config.accessKeyIdEnv');
  if (!secretAccessKeyEnv) throw new Error('cloudflare: missing config.secretAccessKeyEnv');
  if (!apiTokenEnv) throw new Error('cloudflare: missing config.apiTokenEnv');
  if (!zoneIdEnv) throw new Error('cloudflare: missing config.zoneIdEnv');

  // publicOrigin may be a string (single hostname) or an array of strings
  // (bucket fronted by multiple hostnames — e.g. apex + www, or legacy aliases).
  // Internally we always work with an array so the purge loop handles both
  // cases uniformly and all fronting hostnames get invalidated on every deploy.
  const origins = publicOrigin
    ? (Array.isArray(publicOrigin) ? publicOrigin : [publicOrigin])
        .filter((o) => typeof o === 'string' && o.length > 0)
        .map((o) => o.replace(/\/+$/, ''))
    : [];
  if (!purgeEverything && origins.length === 0) {
    throw new Error(
      'cloudflare: config.publicOrigin is required (string or non-empty array of origin URLs) unless purgeEverything=true'
    );
  }

  const accessKeyId = requireEnv(accessKeyIdEnv, 'cloudflare');
  const secretAccessKey = requireEnv(secretAccessKeyEnv, 'cloudflare');
  const apiToken = requireEnv(apiTokenEnv, 'cloudflare');
  const zoneId = requireEnv(zoneIdEnv, 'cloudflare');

  // Default endpoint is account-scoped and works for any R2 bucket, but
  // EU-jurisdiction buckets require the `.eu.` host (and FedRAMP the
  // `.fedramp.` host) to stay inside the required data-residency boundary.
  // Callers override via config.endpoint when needed.
  const r2Endpoint = endpoint || `https://${accountId}.r2.cloudflarestorage.com`;
  const s3 = new S3Client({
    region: 'auto',
    endpoint: r2Endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  const prefixStr = prefix.replace(/^\/+|\/+$/g, '');
  const makeKey = (rel) => (prefixStr ? `${prefixStr}/${rel}` : rel);

  const files = await walk(source);
  if (files.length === 0) {
    throw new Error(`cloudflare: no files found under ${source}`);
  }

  logger.log(
    `  target:   r2://${bucket}/${prefixStr ? prefixStr + '/' : ''} (account ${accountId})`
  );
  logger.log(`  files:    ${files.length}`);
  logger.log(`  parallel: ${concurrency}`);

  const uploadedRels = [];
  let totalBytes = 0;
  let deletedCount = 0;

  try {
    await mapLimit(files, concurrency, async (file) => {
      const rel = toPosix(relative(source, file));
      const key = makeKey(rel);
      const body = await readFile(file);
      totalBytes += body.byteLength;

      if (dryRun) {
        logger.log(`  [dry-run] PUT ${key} (${body.byteLength} B, ${contentTypeFor(file)})`);
      } else {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentTypeFor(file),
            CacheControl: cacheControl,
          })
        );
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
        const previousKeys = await readManifestKeys(s3, bucket, manifestKey);

        // Only delete keys this adapter wrote previously — never touch
        // objects that were placed in the bucket by someone else.
        const obsolete = previousKeys.filter((k) => !currentKeys.has(k) && k !== manifestKey);

        if (obsolete.length === 0) {
          logger.log(`  sync:     no obsolete keys to remove`);
        } else {
          await deleteKeys(s3, bucket, obsolete);
          deletedCount = obsolete.length;
          for (const k of obsolete) logger.log(`  ✗ ${k} (deleted, obsolete)`);
        }

        await writeManifest(s3, bucket, manifestKey, [...currentKeys]);
        logger.log(`  ✓ manifest ${manifestKey} (${currentKeys.size} key(s))`);
      }
    }
  } finally {
    s3.destroy();
  }

  const mb = (totalBytes / 1024 / 1024).toFixed(2);
  logger.log(
    dryRun
      ? `  [dry-run] would upload ${files.length} files (${mb} MB)`
      : `  uploaded ${files.length} files (${mb} MB)` +
          (deletedCount > 0 ? `, deleted ${deletedCount} obsolete key(s)` : '')
  );

  const cf = new Cloudflare({ apiToken });

  if (purgeEverything) {
    if (dryRun) {
      logger.log(`  [dry-run] would purge_everything on zone ${zoneId}`);
      return;
    }
    await cf.cache.purge({ zone_id: zoneId, purge_everything: true });
    logger.log(`  ✓ purged everything on zone ${zoneId}`);
    return;
  }

  const urls = origins.flatMap((origin) => uploadedRels.map((rel) => `${origin}/${makeKey(rel)}`));
  logger.log(
    `  purge:    ${urls.length} URL(s) across ${origins.length} origin(s) on zone ${zoneId}`
  );

  for (let i = 0; i < urls.length; i += PURGE_BATCH_SIZE) {
    const batch = urls.slice(i, i + PURGE_BATCH_SIZE);
    const batchNum = Math.floor(i / PURGE_BATCH_SIZE) + 1;
    if (dryRun) {
      logger.log(`  [dry-run] purge batch ${batchNum} (${batch.length} URL(s))`);
      continue;
    }
    await cf.cache.purge({ zone_id: zoneId, files: batch });
    logger.log(`  ✓ purged ${batch.length} URL(s) (batch ${batchNum})`);
  }
}
