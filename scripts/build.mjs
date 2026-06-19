// Build the Console Security Banner artifacts with esbuild.
//
// For each entry (loader, banner) this produces, under dist/v1/:
//   <name>.js          readable bundle (IIFE, not minified)   — for audits
//   <name>.min.js      minified bundle (IIFE) + inline /*! */ banner — production
//   <name>.min.js.map  source map for the minified bundle
// Plus dist/v1/integrity.json — SHA-384 SRI digests for the two .min.js
// artifacts, so embedders can pin `integrity="…"` on the <script> tag.
//
// Two-pass ordering matters: the banner is built first so its SRI digest can
// be substituted into the loader (the loader pins Stage-2 with that hash), and
// the loader's own digest is computed AFTER substitution so integrity.json
// matches the shipped bytes.
//
// The output layout is `v1/...` (NOT `console-banner/v1/...`): the bucket
// prefix `console-banner` is added by the deploy zone, which keeps the local
// tree clean and lets a future /v2 build live alongside /v1.
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

// Sentinel in src/loader.js, replaced with the real Stage-2 SRI at build time.
const SRI_PLACEHOLDER = 'BG_BANNER_SRI_PLACEHOLDER';

const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));

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

// Build one entry into <name>.js (readable) + <name>.min.js (+ .map).
async function buildEntry(name) {
  const entryPoints = [resolve(srcDir, `${name}.js`)];
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

// 1. Banner first — its minified digest pins Stage-2 in the loader.
await buildEntry('banner');
const bannerMin = await readFile(resolve(outDir, 'banner.min.js'));
const bannerSri = sriOf(bannerMin);

// 2. Loader — then substitute the placeholder in both outputs with the SRI.
await buildEntry('loader');
for (const file of ['loader.js', 'loader.min.js']) {
  const p = resolve(outDir, file);
  const patched = (await readFile(p, 'utf8')).replaceAll(SRI_PLACEHOLDER, bannerSri);
  await writeFile(p, patched, 'utf8');
}
const loaderMin = await readFile(resolve(outDir, 'loader.min.js'));

// 3. integrity.json — digests computed on the SHIPPED bytes.
const integrity = { 'loader.min.js': sriOf(loaderMin), 'banner.min.js': bannerSri };
await writeFile(
  resolve(outDir, 'integrity.json'),
  JSON.stringify({ version: pkg.version, algorithm: 'sha384', files: integrity }, null, 2) + '\n',
  'utf8'
);

// Human-readable build summary — raw + gzip transfer size per production file.
const fmt = (n) => `${(n / 1024).toFixed(2)} KB`;
process.stdout.write(`✓ Built console-banner v${pkg.version} → dist/v1/\n`);
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
