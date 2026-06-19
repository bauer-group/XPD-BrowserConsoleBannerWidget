// Deploy dispatcher.
//
// Reads deploy/zones.json, picks the provider adapter per zone and runs it.
// Designed so that new providers drop in as new files under ./providers plus a
// single import here — no workflow changes needed.
//
// Usage:
//   node scripts/deploy/index.mjs                        # all enabled zones
//   node scripts/deploy/index.mjs --zone widget-cdn-b    # just one zone
//   node scripts/deploy/index.mjs --dry-run              # no network writes
//   node scripts/deploy/index.mjs --manifest deploy/zones.json
//
// Local development:
//   Put secret env vars (e.g. BUNNY_WIDGETS_ACCESS_KEY) in .env. See
//   .env.example for the expected names.
//
// CI:
//   The same names are read from GitHub Actions repository secrets.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { deploy as deployBunny } from './bunny.mjs';
import { deploy as deployCloudflare } from './cloudflare.mjs';
import { deploy as deployS3 } from './s3.mjs';

const providers = {
  bunny: deployBunny,
  cloudflare: deployCloudflare,
  s3: deployS3,
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

// Load .env for local runs. In CI the env is already populated via the
// workflow's `env:` block, so a missing .env is not an error.
try {
  process.loadEnvFile(resolve(repoRoot, '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const { values } = parseArgs({
  options: {
    zone: { type: 'string' },
    manifest: { type: 'string', default: 'deploy/zones.json' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  process.stdout.write(`Usage: node scripts/deploy/index.mjs [options]

Options:
  --zone <name>     Deploy only this zone.
  --manifest <path> Zones manifest (default: deploy/zones.json).
  --dry-run         Run without network writes.
  -h, --help        Show this message.
`);
  process.exit(0);
}

const manifestPath = resolve(repoRoot, values.manifest);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

let zones = (manifest.zones ?? []).filter((z) => z.enabled !== false);
if (values.zone) {
  const selected = zones.find((z) => z.name === values.zone);
  if (!selected) {
    const known = zones.map((z) => z.name).join(', ') || '(none enabled)';
    throw new Error(`Unknown zone "${values.zone}". Known: ${known}`);
  }
  zones = [selected];
}

if (zones.length === 0) {
  console.log('No enabled zones to deploy. Nothing to do.');
  process.exit(0);
}

console.log(`Deploying ${zones.length} zone(s)${values['dry-run'] ? ' (dry-run)' : ''}`);

for (const zone of zones) {
  const provider = providers[zone.provider];
  if (!provider) {
    const known = Object.keys(providers).join(', ');
    throw new Error(`Zone "${zone.name}": unknown provider "${zone.provider}". Known: ${known}`);
  }

  const absoluteSource = resolve(repoRoot, zone.source);
  console.log(`\n→ ${zone.name} (${zone.provider})`);
  console.log(`  source:   ${zone.source}`);

  await provider({
    source: absoluteSource,
    config: zone.config,
    dryRun: values['dry-run'],
  });
}

console.log('\n✓ Deploy complete.');
