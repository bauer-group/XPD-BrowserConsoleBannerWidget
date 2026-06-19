# Deployment

The built widget is delivered from a Cloudflare R2 bucket fronted by
`widgets.professional-hosting.com`. Deployment is **provider-agnostic** and
driven by [`deploy/zones.json`](../deploy/zones.json): each _zone_ maps the
local `dist/` tree to a storage/CDN target.

```text
src/  ──(npm run build)──▶  dist/v1/*.{js,min.js,map} + integrity.json
                                   │
                                   ▼
        node scripts/deploy/index.mjs  ──▶  R2 bucket bg-widgets
                                            prefix console-banner/
                                                   │
                                                   ▼
                 https://widgets.professional-hosting.com/console-banner/v1/…
```

## Commands

```bash
npm run build         # produce dist/v1/
npm run deploy:dry    # preview: prints planned PUTs + purge, no network writes
npm run deploy        # upload to every enabled zone + purge the changed URLs
npm run deploy -- --zone console-banner-cf   # one specific zone
```

`deploy:dry` requires the four env vars to be present (any value) so the
adapter can construct its clients; it never makes network calls in dry-run.

## Why it is safe to share the `bg-widgets` bucket

The bucket also hosts assets managed by **other repositories** (e.g. the
Microsites root deploy). Two mechanisms keep every deploy scoped to our files
only:

1. **Manifest-based sync-delete.** The Cloudflare adapter tracks every key it
   writes in `console-banner/.deploy-manifest.json`. On the next deploy it only
   deletes keys listed in _that_ manifest that are no longer part of the
   current upload. Objects the adapter never wrote are invisible to the cleanup
   logic — see [`scripts/deploy/s3-sync.mjs`](../scripts/deploy/s3-sync.mjs).
2. **Purge by URL, never zone-wide.** `purgeEverything` is `false`, so only the
   exact URLs we uploaded are invalidated on the Cloudflare edge. A widget
   deploy never flushes another project's cache.

> **Never** set `purgeEverything: true` and **never** change the zone `prefix`
> to the bucket root — both would break the isolation guarantee.

## Cache / TTL

`Cache-Control: public, max-age=300, s-maxage=31536000`

- Browsers cache for 5 minutes (`max-age`) → text updates to `/v1/` propagate
  within ≤ 5 min.
- The Cloudflare edge caches for 1 year (`s-maxage`) and is refreshed by the
  per-URL purge on every deploy.

## Versioning

- **Breaking changes** → publish under a new path (`/v2/`, `/v3/`). The build
  emits `dist/v1/`; bump the source layout for a new major and keep `/v1/`
  frozen.
- **Minor/patch** → overwrite the existing `/v1/` build; the 5-minute browser
  TTL rolls it out naturally.

See [`providers/cloudflare.md`](providers/cloudflare.md) for the R2 + token
setup and [`secrets.md`](secrets.md) for the credential workflow.
