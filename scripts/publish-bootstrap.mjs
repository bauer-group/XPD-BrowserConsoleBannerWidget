// Bootstrap a workspace package's FIRST publish to npm — locally.
//
// Why local: npm Trusted Publishing (OIDC, used by the release workflow) can
// only publish a package that already EXISTS on the registry. So the very
// first publish has to list the package once — done by a maintainer locally
// (interactive 2FA / passkey). The version is irrelevant for this step (the
// placeholder 0.0.0 is fine); after the package is listed, configure its
// Trusted Publisher on npmjs and every further release publishes from CI via
// OIDC — no token, no local publish.
//
// Usage (from the repo root):
//   npm run publish:bootstrap -- --package <name> [--version <x.y.z>] [--tag latest]
//
// Examples:
//   # list the package at the placeholder 0.0.0 (just to enable Trusted Publishing)
//   npm run publish:bootstrap -- --package @bauer-group/console-security-banner-react
//   # or pin a real first version
//   npm run publish:bootstrap -- --package @bauer-group/... --version 0.2.0
//
// When --version is given it is set before publishing and reverted afterwards
// (the committed version stays the CI-managed placeholder).

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    package: { type: 'string' },
    version: { type: 'string' },
    tag: { type: 'string', default: 'latest' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help || !values.package) {
  process.stdout
    .write(`Bootstrap (list) a workspace package on npm so Trusted Publishing can be set up.

Usage:
  npm run publish:bootstrap -- --package <name> [--version <x.y.z>] [--tag latest]

Options:
  --package  Workspace package name (e.g. @bauer-group/console-security-banner-react)
  --version  Optional version (default: the package's current placeholder, e.g. 0.0.0)
  --tag      npm dist-tag (default: latest)
  -h, --help Show this message
`);
  process.exit(values.help ? 0 : 1);
}

if (values.version && !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(values.version)) {
  throw new Error(`Invalid --version "${values.version}" (expected semver, e.g. 0.2.0)`);
}

// Resolve the workspace directory whose package.json name matches --package.
const root = process.cwd();
const pkgDir = readdirSync(resolve(root, 'packages'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => `packages/${e.name}`)
  .find((dir) => {
    try {
      return (
        JSON.parse(readFileSync(resolve(root, dir, 'package.json'), 'utf8')).name === values.package
      );
    } catch {
      return false;
    }
  });

if (!pkgDir) {
  throw new Error(`Workspace package "${values.package}" not found under packages/*`);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });

const version =
  values.version || JSON.parse(readFileSync(resolve(root, pkgDir, 'package.json'), 'utf8')).version;
process.stdout.write(`\n▶ Bootstrap publish ${values.package}@${version} (${pkgDir})\n\n`);

try {
  if (values.version) {
    run(npm, ['version', values.version, '-w', values.package, '--no-git-tag-version']);
  }
  run(npm, ['run', 'build', '-w', values.package]);
  // Interactive — completes npm 2FA (passkey/OTP) in the browser.
  run(npm, ['publish', '-w', values.package, '--access', 'public', '--tag', values.tag]);
  process.stdout.write(`\n✓ Listed ${values.package}@${version}\n`);
  process.stdout.write(
    `Next: add the Trusted Publisher on npmjs (repo + release.yml). Ongoing\n` +
      `releases then publish the real versions from CI via OIDC.\n`
  );
} finally {
  if (values.version) {
    // Restore the CI-managed placeholder version so the working tree stays clean.
    try {
      run('git', ['checkout', '--', `${pkgDir}/package.json`, 'package-lock.json']);
    } catch {
      /* git unavailable / nothing to restore — ignore */
    }
  }
}
