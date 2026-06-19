# Secrets

Deployment needs four credentials. They are read from environment variables
(named in `deploy/zones.json`) both locally and in CI.

| Variable               | Purpose                                   |
| ---------------------- | ----------------------------------------- |
| `R2_ACCESS_KEY_ID`     | R2 S3 access key                          |
| `R2_SECRET_ACCESS_KEY` | R2 S3 secret                              |
| `CF_PURGE_TOKEN`       | Cloudflare API token (Zone › Cache Purge) |
| `CF_ZONE_ID`           | Cloudflare zone ID for the domain         |

## Local

```bash
cp .env.example .env      # then fill in the four values
npm run deploy:dry        # verify
```

`.env` is gitignored. See [`.env.example`](../.env.example) for the documented
shape.

## CI (GitHub Actions)

Set the same four names under **Settings → Secrets and variables → Actions →
Repository secrets**, or share an organization-level secret with the Microsites
repo (the values are identical — same R2 account, same Cloudflare zone).

## Sync helper

[`scripts/secrets/sync.mjs`](../scripts/secrets/sync.mjs) pushes your local
`.env` to GitHub repository secrets via the `gh` CLI:

```bash
npm run secrets:push       # add/overwrite from .env (no deletes)
npm run secrets:sync       # add/overwrite + delete keys dropped from .env
npm run secrets:sync:dry   # preview the plan, no changes
```

Delete mode is scoped to the keys documented in `.env.example`, so unrelated
GitHub secrets (Teams webhook, AI-summary token, …) are never touched.

> **Never** commit real secrets. Only `.env.example` (placeholders) belongs in
> git.
