// Sync .env to GitHub repository secrets.
//
// Two modes — same code path, one flag:
//   --push-only : ADD/OVERWRITE only (used by `npm run secrets:push`).
//   default     : also DELETE GitHub secrets removed from .env, scoped
//                 to keys listed in .env.example.
//
// Why the .env.example gate (delete mode only):
//   Not all GitHub secrets belong to this deploy flow. Things like the
//   Teams webhook, AI-summary API key etc. are managed outside .env.
//   Treating .env.example as the universe of "secrets managed by the
//   deploy flow" keeps external secrets untouched.
//
// Usage:
//   npm run secrets:push                  # add/overwrite from .env (no deletes)
//   npm run secrets:sync                  # add/overwrite + delete (prompts)
//   npm run secrets:sync -- --dry-run     # show plan, no changes
//   npm run secrets:sync -- --yes         # apply without prompts (CI-safe)

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    'push-only': { type: 'boolean', default: false },
    yes: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  process.stdout.write(`Usage: npm run secrets:sync [-- options]

Pushes every KEY=VALUE from .env to GitHub repository secrets, then
deletes GitHub secrets that are listed in .env.example but no longer in
.env. Other GitHub secrets (external to this flow) are left alone.

Options:
  --push-only Skip the delete step — add/overwrite only.
  --dry-run   Show the sync plan without making any changes.
  --yes       Skip confirmation prompt before deletions.
  -h, --help  Show this message.
`);
  process.exit(0);
}

// Extract KEY names from an env file. For the universe we need commented
// lines too (they document the shape of the managed secret set).
function parseEnvKeys(filepath, { includeCommented = false } = {}) {
  const keys = new Set();
  let content;
  try {
    content = readFileSync(filepath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return keys;
    throw err;
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const isComment = line.startsWith('#');
    if (isComment && !includeCommented) continue;
    const stripped = isComment ? line.replace(/^#+\s*/, '') : line;
    const m = stripped.match(/^([A-Z][A-Z0-9_]*)\s*=/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

function ghWithOutput(args) {
  execFileSync('gh', args, { stdio: 'inherit' });
}

function ghSecretList() {
  const output = gh(['secret', 'list', '--json', 'name']);
  return new Set(JSON.parse(output).map((entry) => entry.name));
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(question);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

const pushOnly = values['push-only'];
const envPath = resolve(repoRoot, '.env');
const examplePath = resolve(repoRoot, '.env.example');

const envKeys = parseEnvKeys(envPath);
const ghKeys = ghSecretList();

// Deletion universe is only loaded when delete mode is active — push-only
// callers don't need .env.example to exist or be parsed.
const universe = pushOnly ? new Set() : parseEnvKeys(examplePath, { includeCommented: true });

const toDelete = pushOnly
  ? []
  : [...ghKeys].filter((k) => universe.has(k) && !envKeys.has(k)).sort();
const external = pushOnly ? [] : [...ghKeys].filter((k) => !universe.has(k)).sort();
const inBoth = [...envKeys].filter((k) => ghKeys.has(k));
const onlyLocal = [...envKeys].filter((k) => !ghKeys.has(k));

console.log('');
console.log(`  mode         : ${pushOnly ? 'push-only (add/overwrite)' : 'sync (add + delete)'}`);
console.log(`  .env         : ${envKeys.size} key(s)`);
if (!pushOnly) {
  console.log(`  .env.example : ${universe.size} managed key(s) (universe)`);
}
console.log(`  GitHub       : ${ghKeys.size} secret(s)`);
console.log('');
console.log('Plan:');
if (onlyLocal.length) {
  console.log(`  + add    : ${onlyLocal.length} — ${onlyLocal.join(', ')}`);
}
if (inBoth.length) {
  console.log(`  ~ update : ${inBoth.length} — ${inBoth.join(', ')}`);
}
if (!pushOnly) {
  if (toDelete.length) {
    console.log(`  - DELETE : ${toDelete.length} — ${toDelete.join(', ')}`);
  } else {
    console.log('  - delete : (none)');
  }
  if (external.length) {
    console.log(`  · skip   : ${external.length} external — ${external.join(', ')}`);
  }
}

if (values['dry-run']) {
  console.log('\n(dry-run: no changes applied)');
  process.exit(0);
}

const willMutate = onlyLocal.length > 0 || inBoth.length > 0 || toDelete.length > 0;
if (!willMutate) {
  console.log('\n✓ Nothing to sync.');
  process.exit(0);
}

if (toDelete.length > 0 && !values.yes) {
  const ok = await confirm(`\nDelete ${toDelete.length} GitHub secret(s)? [y/N] `);
  if (!ok) {
    console.log('Aborted.');
    process.exit(1);
  }
}

if (onlyLocal.length > 0 || inBoth.length > 0) {
  console.log('\nPushing .env to GitHub secrets...');
  ghWithOutput(['secret', 'set', '-f', envPath]);
}

for (const name of toDelete) {
  console.log(`\nDeleting secret ${name}...`);
  ghWithOutput(['secret', 'delete', name]);
}

console.log(`\n✓ ${pushOnly ? 'Push' : 'Sync'} complete.`);
