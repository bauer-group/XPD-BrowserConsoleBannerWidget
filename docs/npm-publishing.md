# npm Publishing

> Replicating this OIDC-publishing setup in **another** repo? See the
> [npm publishing playbook](npm-publishing-playbook.md).

## What ships to npm

Exactly **one** package: **`@bauer-group/console-security-banner-react`**
(`packages/react`). The root package `@bauer-group/console-security-banner` is
`"private": true` — it is the CDN widget tooling and is **never** published to
npm (it deploys to Cloudflare R2 instead).

The package is also mirrored to **GitHub Packages** (`npm.pkg.github.com`) by
the release workflow.

## Auth model

| When              | Mechanism                          | Secret/Token                   |
| ----------------- | ---------------------------------- | ------------------------------ |
| **First publish** | local `npm publish` (interactive)  | your npm login (2FA / passkey) |
| **Every release** | CI via **OIDC Trusted Publishing** | none (OIDC `id-token`)         |
| GitHub Packages   | CI                                 | `GITHUB_TOKEN`                 |

> **Why the first publish is manual:** npm Trusted Publishing can only publish a
> package that **already exists** on the registry, and its "Trusted Publisher"
> settings page only appears once the package is listed. So the very first
> publish has to list the package once, locally. The version doesn't matter —
> the placeholder `0.0.0` is fine; real versions follow via OIDC.

## 1. First-time bootstrap (one-time, local)

Lists the package so Trusted Publishing can be configured.

```bash
npm login                                   # browser auth (2FA / passkey)
npm run publish:bootstrap -- --package @bauer-group/console-security-banner-react
```

`publish:bootstrap` ([scripts/publish-bootstrap.mjs](../scripts/publish-bootstrap.mjs))
builds the package and runs `npm publish` (you complete 2FA in the browser). It
publishes the current placeholder version (`0.0.0`) by default; pass
`--version x.y.z` to pin a real first version (it is reverted afterwards so the
committed version stays the CI-managed placeholder).

This script is reusable for bootstrapping **any** future workspace package.

## 2. Configure the Trusted Publisher (npmjs.com)

Now that the package is listed, open its page → **Settings → Trusted Publisher**
and add a GitHub Actions publisher:

- **Repository:** `bauer-group/XPD-BrowserConsoleBannerWidget`
- **Workflow filename:** `release.yml`
- **Environment:** _(leave empty)_

## 3. Ongoing releases (automatic, no token)

Every semantic-release version bump runs the `publish-npm` job in
[`.github/workflows/release.yml`](../.github/workflows/release.yml):

```yaml
permissions:
  id-token: write # OIDC trusted publishing + provenance
...
run: npm publish -w @bauer-group/console-security-banner-react --provenance --access public
# no NODE_AUTH_TOKEN — OIDC
```

The React package shares **one version line** with the CDN widget: a release
bumps both, deploys the widget to R2, and publishes the React package to npm +
GitHub Packages at the same version (with provenance). The publish jobs are
`continue-on-error`, so an npm hiccup never blocks the CDN delivery.

To cut a release manually: **Actions → 🚀 Release → Run workflow**
(`force-release: true`).

## Housekeeping

- The bootstrap leaves an old version on npm (e.g. `0.0.0`). Once a real version
  is `latest`, you may deprecate the placeholder:
  ```bash
  npm deprecate @bauer-group/console-security-banner-react@0.0.0 "placeholder — use the latest version"
  ```
- Local `npm publish` is blocked by interactive 2FA (passkey/OTP) per operation
  — prefer CI/OIDC for everything after the bootstrap.
