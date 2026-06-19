# Cloudflare R2 + CDN provider

The `cloudflare` adapter
([`scripts/deploy/cloudflare.mjs`](../../scripts/deploy/cloudflare.mjs)) does
three things per deploy:

1. **Upload** every file under `dist/` to the R2 bucket via the S3-compatible
   API (R2 speaks SigV4, so the adapter reuses `@aws-sdk/client-s3`).
2. **Sync-delete** obsolete keys using the manifest at
   `console-banner/.deploy-manifest.json` — only keys this repo previously
   wrote are eligible for deletion.
3. **Purge** the matching URLs on the Cloudflare zone so clients fetch fresh
   bytes before the edge TTL expires.

## Zone config (`deploy/zones.json`)

| Field                | Value                                                      |
| -------------------- | ---------------------------------------------------------- |
| `bucket`             | `bg-widgets` (shared)                                      |
| `prefix`             | `console-banner` → keys land at `console-banner/v1/…`      |
| `endpoint`           | `https://<account>.eu.r2.cloudflarestorage.com` (EU host!) |
| `publicOrigin`       | `https://widgets.professional-hosting.com`                 |
| `cacheControl`       | `public, max-age=300, s-maxage=31536000`                   |
| `purgeEverything`    | `false` (always)                                           |
| `accessKeyIdEnv`     | `R2_ACCESS_KEY_ID`                                         |
| `secretAccessKeyEnv` | `R2_SECRET_ACCESS_KEY`                                     |
| `zoneIdEnv`          | `CF_ZONE_ID`                                               |
| `apiTokenEnv`        | `CF_PURGE_TOKEN`                                           |

> `bg-widgets` is an **EU-jurisdiction** bucket — the endpoint must use the
> `.eu.` host or R2 rejects the request on data-residency grounds.

## Credentials

| Secret                            | Where to get it                                             |
| --------------------------------- | ----------------------------------------------------------- |
| `R2_ACCESS_KEY_ID` / `..._SECRET` | Cloudflare dashboard → R2 → **Manage R2 API Tokens**        |
| `CF_PURGE_TOKEN`                  | My Profile → API Tokens → permission **Zone › Cache Purge** |
| `CF_ZONE_ID`                      | `professional-hosting.com` zone → overview → **Zone ID**    |

`widgets.professional-hosting.com` is a subdomain of `professional-hosting.com`,
so `CF_ZONE_ID` and `CF_PURGE_TOKEN` are **identical** to the Microsites
deploy, and `R2_*` come from the same R2 account. You can reuse the same values
(or an organization-level secret).

## Custom-domain binding

R2 serves the bucket through a **Custom Domain** binding
(`widgets.professional-hosting.com`) configured in the Cloudflare R2 dashboard.
The Cache Rule (Edge 1 y / Browser 5 min) lives on the zone; the `Cache-Control`
header set per object is a belt-and-suspenders fallback if the rule is ever
removed.
