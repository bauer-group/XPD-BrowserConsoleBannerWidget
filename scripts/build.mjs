// Build the Console Security Banner artifacts with esbuild.
//
// For each entry (loader, banner) this produces, under dist/v1/:
//   <name>.js          readable bundle (IIFE, not minified)   — for audits
//   <name>.min.js      minified bundle (IIFE) + inline /*! */ banner — production
//   <name>.min.js.map  source map for the minified bundle
// Plus dist/v1/integrity.json — SHA-384 SRI digests for the two .min.js
// artifacts, so embedders can pin `integrity="…"` on the <script> tag.
//
// Two build-time substitutions keep the source free of stale constants:
//   __BG_VERSION__            → the resolved build version (CI tag / package.json)
//   BG_BANNER_SRI_PLACEHOLDER → the banner's SRI digest (loader pins Stage-2)
//
// Ordering matters: the version is substituted into the BANNER first, then its
// SRI is computed on the final bytes, then that SRI + the version are
// substituted into the loader, then the loader's own SRI is computed — so
// integrity.json always matches the shipped bytes.
//
// Version source priority: BANNER_VERSION env (set by CI from the git tag) →
// package.json version (local builds). The leading "v" of a tag is stripped.
//
// The output layout is `v1/...` (NOT `console-banner/v1/...`): the bucket
// prefix `console-banner` is added by the deploy zone, which keeps the local
// tree clean and lets a future /v2 build live alongside /v1. (The `v1` path is
// the API major and is independent of this semver build version.)
//
// esbuild bundles the ESM source (banner.js imports the locale JSONs via
// ./i18n/index.js) into a single self-contained IIFE — zero runtime imports.

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const srcDir = resolve(root, 'src');
const outDir = resolve(root, 'dist', 'v1');

// Sentinels in src/, replaced with real values at build time.
const SRI_PLACEHOLDER = 'BG_BANNER_SRI_PLACEHOLDER';
const VERSION_PLACEHOLDER = '__BG_VERSION__';

const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));

// CI passes the released git tag via BANNER_VERSION; locally we fall back to
// package.json (which semantic-release keeps in sync after each release).
const version = (process.env.BANNER_VERSION || pkg.version).replace(/^v/, '');

// Shared esbuild options. `charset: 'utf8'` keeps real Unicode in the output
// (the locale strings) instead of \uXXXX escapes. `legalComments: 'inline'`
// preserves the /*! … */ license banner inside the minified file.
const common = {
  bundle: true,
  format: 'iife',
  target: ['es2017'],
  charset: 'utf8',
  legalComments: 'inline',
  logLevel: 'silent',
};

// SHA-384 is the SRI sweet spot. Format per the SRI spec: `sha384-<base64>`.
const sriOf = (bytes) => `sha384-${createHash('sha384').update(bytes).digest('base64')}`;

// Read a built file, apply token substitutions, write it back.
async function patch(name, replacements) {
  const p = resolve(outDir, name);
  let text = await readFile(p, 'utf8');
  for (const [from, to] of replacements) text = text.replaceAll(from, to);
  await writeFile(p, text, 'utf8');
}

// Build one entry into <name>.js (readable) + <name>.min.js (+ .map).
async function buildEntry(name) {
  const entryPoints = [resolve(srcDir, `${name}.ts`)];
  await build({ ...common, entryPoints, outfile: resolve(outDir, `${name}.js`), minify: false });
  await build({
    ...common,
    entryPoints,
    outfile: resolve(outDir, `${name}.min.js`),
    minify: true,
    sourcemap: true,
  });
}

await rm(resolve(root, 'dist'), { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

// 1. Banner — substitute the version BEFORE computing its SRI so the digest
//    matches the shipped bytes; that digest then pins Stage-2 in the loader.
await buildEntry('banner');
await patch('banner.js', [[VERSION_PLACEHOLDER, version]]);
await patch('banner.min.js', [[VERSION_PLACEHOLDER, version]]);
const bannerMin = await readFile(resolve(outDir, 'banner.min.js'));
const bannerSri = sriOf(bannerMin);

// 2. Loader — substitute version + the banner SRI, then read final bytes.
await buildEntry('loader');
const loaderSubs = [
  [VERSION_PLACEHOLDER, version],
  [SRI_PLACEHOLDER, bannerSri],
];
await patch('loader.js', loaderSubs);
await patch('loader.min.js', loaderSubs);
const loaderMin = await readFile(resolve(outDir, 'loader.min.js'));

// 3. integrity.json — digests computed on the SHIPPED bytes.
const integrity = { 'loader.min.js': sriOf(loaderMin), 'banner.min.js': bannerSri };
await writeFile(
  resolve(outDir, 'integrity.json'),
  JSON.stringify({ version, algorithm: 'sha384', files: integrity }, null, 2) + '\n',
  'utf8'
);

// Human-readable build summary — raw + gzip transfer size per production file.
const fmt = (n) => `${(n / 1024).toFixed(2)} KB`;
process.stdout.write(`✓ Built console-banner v${version} → dist/v1/\n`);
for (const [file, bytes] of [
  ['loader.min.js', loaderMin],
  ['banner.min.js', bannerMin],
]) {
  const gz = gzipSync(bytes, { level: 9 }).byteLength;
  process.stdout.write(
    `  ${file.padEnd(14)} ${fmt(bytes.byteLength).padStart(9)}  (gzip ${fmt(gz)})\n`
  );
}
process.stdout.write(`  integrity.json  SRI digests for 2 file(s)\n`);
