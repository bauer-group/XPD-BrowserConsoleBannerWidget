// BunnyCDN storage adapter.
//
// Uploads every file under `source` to
//   {endpoint}/{storageZone}/{relative-path}
// preserving the directory layout so e.g. `dist/cdn/index.html`
// becomes the root `index.html` of the configured storage zone.
//
// Also removes previously-uploaded files that are no longer part of the
// current source, tracked via a manifest at
//   {endpoint}/{storageZone}/.deploy-manifest.json
// — only keys this adapter wrote on a prior deploy are ever eligible for
// deletion. Externally-managed files in the storage zone are never touched.
// Opt-out via `syncDelete: false`.
//
// Docs: https://docs.bunny.net/reference/storage-api

import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';

import { contentTypeFor, mapLimit, requireEnv, toPosix, walk } from './utils.mjs';

const MANIFEST_FILENAME = '.deploy-manifest.json';

export async function deploy({ source, config, dryRun, logger = console }) {
  const { endpoint, storageZone, accessKeyEnv, concurrency = 8, syncDelete = true } = config;

  if (!endpoint) throw new Error('bunny: missing config.endpoint');
  if (!storageZone) throw new Error('bunny: missing config.storageZone');
  if (!accessKeyEnv) throw new Error('bunny: missing config.accessKeyEnv');

  const accessKey = requireEnv(accessKeyEnv, 'bunny');
  const base = endpoint.replace(/\/$/, '');
  const zonePath = storageZone.replace(/^\/|\/$/g, '');
  const zoneUrl = `${base}/${zonePath}`;

  const files = await walk(source);
  if (files.length === 0) {
    throw new Error(`bunny: no files found under ${source}`);
  }

  logger.log(`  target:   ${zoneUrl}/`);
  logger.log(`  files:    ${files.length}`);
  logger.log(`  parallel: ${concurrency}`);

  let uploaded = 0;
  let totalBytes = 0;
  let deletedCount = 0;
  const uploadedRels = [];

  await mapLimit(files, concurrency, async (file) => {
    const rel = toPosix(relative(source, file));
    const url = `${zoneUrl}/${rel}`;
    const body = await readFile(file);
    totalBytes += body.byteLength;

    if (dryRun) {
      logger.log(`  [dry-run] PUT ${rel} (${body.byteLength} B, ${contentTypeFor(file)})`);
    } else {
      await bunnyPut(url, accessKey, contentTypeFor(file), body);
      logger.log(`  ✓ ${rel}`);
      uploaded++;
    }
    uploadedRels.push(rel);
  });

  if (syncDelete) {
    const manifestUrl = `${zoneUrl}/${MANIFEST_FILENAME}`;
    const currentKeys = new Set(uploadedRels);

    if (dryRun) {
      logger.log(
        `  [dry-run] would read manifest ${MANIFEST_FILENAME}, delete obsolete keys, then rewrite manifest`
      );
    } else {
      const previousKeys = await readManifestKeys(manifestUrl, accessKey);

      // Only delete keys this adapter wrote previously — never touch
      // files that were placed in the storage zone by someone else.
      const obsolete = previousKeys.filter((k) => !currentKeys.has(k) && k !== MANIFEST_FILENAME);

      if (obsolete.length === 0) {
        logger.log(`  sync:     no obsolete keys to remove`);
      } else {
        await mapLimit(obsolete, concurrency, async (rel) => {
          await bunnyDelete(`${zoneUrl}/${rel}`, accessKey);
          logger.log(`  ✗ ${rel} (deleted, obsolete)`);
        });
        deletedCount = obsolete.length;
      }

      await writeManifest(manifestUrl, accessKey, [...currentKeys]);
      logger.log(`  ✓ manifest ${MANIFEST_FILENAME} (${currentKeys.size} key(s))`);
    }
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

async function bunnyPut(url, accessKey, contentType, body) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { AccessKey: accessKey, 'Content-Type': contentType },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `bunny: PUT ${url} → ${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`
    );
  }
}

async function bunnyDelete(url, accessKey) {
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { AccessKey: accessKey },
  });
  // 404 = already gone (manifest drifted from actual state) — treat as success.
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `bunny: DELETE ${url} → ${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`
    );
  }
}

// Fetch the previous-deploy manifest. Missing manifest = first deploy (empty
// list). Any other failure bubbles up so the deploy fails loud rather than
// silently skipping cleanup.
async function readManifestKeys(manifestUrl, accessKey) {
  const res = await fetch(manifestUrl, {
    method: 'GET',
    headers: { AccessKey: accessKey },
  });
  if (res.status === 404) return [];
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `bunny: GET ${manifestUrl} → ${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`
    );
  }
  const parsed = await res.json();
  return Array.isArray(parsed?.keys) ? parsed.keys.filter((k) => typeof k === 'string') : [];
}

async function writeManifest(manifestUrl, accessKey, keys) {
  const body = JSON.stringify(
    {
      version: 1,
      updatedAt: new Date().toISOString(),
      keys: [...keys].sort(),
    },
    null,
    2
  );
  await bunnyPut(manifestUrl, accessKey, 'application/json; charset=utf-8', body);
}
