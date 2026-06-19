# @bauer-group/console-security-banner-react

React 19 component & hook for the **BAUER GROUP Console Security Banner** — a
lean widget that warns end users about **Self-XSS scams** ("paste this into the
console to unlock…") directly in the browser console, and only when DevTools are
actually opened.

- **Local by default** — detection logic, render and all **22 locales** are
  bundled into your app. **Zero network requests**, works offline / air-gapped.
- **Optional CDN mode** — inject the loader from
  `widgets.professional-hosting.com` instead (smaller bundle).
- **SSR-safe**, idempotent, React 19 Strict-Mode-safe, ships its own types and a
  `"use client"` directive for the Next.js App Router.

[![npm](https://img.shields.io/npm/v/@bauer-group/console-security-banner-react.svg)](https://www.npmjs.com/package/@bauer-group/console-security-banner-react)
[![License: MIT](https://img.shields.io/badge/License-MIT-FF8500.svg)](./LICENSE)

---

## Install

```bash
npm i @bauer-group/console-security-banner-react
```

`react` (^19) is a peer dependency.

## Quick start

Mount the component once, near the root of your app.

```tsx
import { ConsoleSecurityBanner } from '@bauer-group/console-security-banner-react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <ConsoleSecurityBanner />
        {children}
      </body>
    </html>
  );
}
```

The component renders nothing — it just arms the banner. The language follows
`<html lang>`, then `navigator.languages`, then English.

### Next.js (App Router)

The package is already marked `"use client"`, so you can drop it straight into a
Server Component (e.g. `app/layout.tsx`) without adding your own directive.

### Hook form

For programmatic control (custom layouts, conditional enablement):

```tsx
'use client';
import { useConsoleSecurityBanner } from '@bauer-group/console-security-banner-react';

export function Providers({ children }: { children: React.ReactNode }) {
  useConsoleSecurityBanner({ lang: 'de' });
  return <>{children}</>;
}
```

## Modes

```tsx
<ConsoleSecurityBanner />                 {/* local (default) — zero requests */}
<ConsoleSecurityBanner mode="cdn" />      {/* inject the loader from the CDN  */}
```

- **`local`** bundles the widget into your app — nothing is fetched at runtime.
- **`cdn`** injects `…/console-banner/v1/loader.min.js` from the CDN. Pin its
  Subresource-Integrity hash (from the published `integrity.json`) for
  supply-chain hardening.

## Props / options

| Prop        | Type               | Default                                                      | Description                                                                         |
| ----------- | ------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `mode`      | `'local' \| 'cdn'` | `'local'`                                                    | Bundle locally (zero requests) or load the CDN loader script.                       |
| `lang`      | `string`           | auto                                                         | Force a locale (e.g. `'de'`); otherwise auto-detected.                              |
| `disabled`  | `boolean`          | `false`                                                      | Disable entirely (e.g. per environment).                                            |
| `nonce`     | `string`           | —                                                            | CSP nonce for the injected script (CDN mode).                                       |
| `cdnUrl`    | `string`           | `https://widgets.professional-hosting.com/console-banner/v1` | Override the CDN base (CDN mode).                                                   |
| `integrity` | `string`           | —                                                            | SRI hash for the loader script (CDN mode).                                          |
| `probe`     | `boolean`          | `false`                                                      | Strict-security opt-in: also detect **undocked** DevTools (logs one console value). |

The hook accepts the same options object.

## Notes

- **SSR:** the effect is a no-op on the server; nothing renders until hydration.
- **CSP:** in CDN mode pass `nonce` so the injected script satisfies a strict
  `script-src 'nonce-…'` policy. In local mode there is no injected script.
- **Idempotent:** mounting more than one instance arms the banner once.

## License

MIT © BAUER GROUP. Part of the
[Console Security Banner](https://github.com/bauer-group/XPD-BrowserConsoleBannerWidget)
project (the CDN widget lives in the same repository).
