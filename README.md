# BAUER GROUP — Console Security Banner

Ein schlanker, zweistufiger Console-Banner, der Endanwender vor **Self-XSS-Betrug** („Kopieren Sie dies in die Konsole, um …") warnt. Das Banner erscheint **nur dann**, wenn die Browser-DevTools tatsächlich geöffnet werden — die Seite bleibt ansonsten vollständig unbelastet (0 Netzwerk-Requests, kein Render-Blocking, kein Tracking).

Tonalität und Muster sind am bekannten Infomaniak-Beispiel angelehnt; die Brand-Umsetzung folgt der BAUER-GROUP-CI (Orange `#FF8500`, Warm-Gray-Skala, System-Font-Stack).

[![Release](https://img.shields.io/github/v/release/bauer-group/XPD-BrowserConsoleBannerWidget?sort=semver)](https://github.com/bauer-group/XPD-BrowserConsoleBannerWidget/releases)
[![npm](https://img.shields.io/npm/v/@bauer-group/console-security-banner-react?label=npm%20react)](https://www.npmjs.com/package/@bauer-group/console-security-banner-react)
[![License: MIT](https://img.shields.io/badge/License-MIT-FF8500.svg)](LICENSE)

---

## Einbindung (One-Liner)

```html
<script
  async
  src="https://widgets.professional-hosting.com/console-banner/v1/loader.min.js"
></script>
```

Empfohlen im `<head>`, so früh wie möglich. `async` ist korrekt: Der Loader blockiert nichts und hat keine DOM-Abhängigkeit.

**Mit Subresource-Integrity** (Hash aus `console-banner/v1/integrity.json`):

```html
<script
  async
  src="https://widgets.professional-hosting.com/console-banner/v1/loader.min.js"
  integrity="sha384-…"
  crossorigin="anonymous"
></script>
```

---

## React-Integration

Für React-19-Projekte gibt es das npm-Paket
**[`@bauer-group/console-security-banner-react`](packages/react/)** — komfortabel
einzubinden, **lokal gebundlet** (0 Requests, offline-tauglich) als Default oder
optional vom CDN:

```bash
npm i @bauer-group/console-security-banner-react
```

```tsx
import { ConsoleSecurityBanner } from '@bauer-group/console-security-banner-react';

// einmal nahe der App-Wurzel (Next.js App Router, Vite, CRA …)
<ConsoleSecurityBanner />              {/* local (Default), Sprache automatisch */}
<ConsoleSecurityBanner mode="cdn" />   {/* stattdessen vom CDN laden */}
```

Komponente **und** Hook (`useConsoleSecurityBanner`), SSR-sicher, mit `"use client"`
und Typen. Details: [packages/react/README.md](packages/react/README.md). Das
Paket teilt sich den Core (`src/core`) mit dem CDN-Widget — eine Single Source of
Truth.

---

## Architektur (zwei Stufen)

```text
┌──────────────────────────────┐      ┌──────────────────────────────┐
│  Stage 1 · loader.min.js     │      │  Stage 2 · banner.min.js     │
│  ~1.2 KB gzip · eager        │ ──►  │  ~8 KB gzip · lazy           │
│  · DevTools-Detect (A+B)     │      │  · 22 Sprachen (auto)        │
│  · passiver Resize-Listener  │      │  · styled %c-Konsolen-Log    │
│  · Probe-Intervall (2 s)     │      │  · einmal pro Tab            │
│  · bei Treffer → Stage 2     │      │                              │
└──────────────────────────────┘      └──────────────────────────────┘
```

- **Stage 1** wird auf jeder Seite eingebunden, ist idempotent und macht **keine** Requests, solange die Konsole geschlossen bleibt.
- **Stage 2** wird vom Loader dynamisch nachgezogen, sobald DevTools erkannt werden — erst dann fällt ein einziger HTTP-Request an.

Detektion: **(A)** Outer-/Inner-Viewport-Delta (docked DevTools) und **(B)** ein Getter-Tripwire, der feuert, wenn die Konsole das getaggte Objekt rendert (undocked DevTools).

---

## Repository-Struktur

```text
src/                     TypeScript-Source (CDN-Widget)
  core/                  geteilter, framework-agnostischer Core …
    detect.ts            DevTools-Erkennung (Heuristik A+B)
    render.ts            i18n + styled %c-Konsolen-Render
  loader.ts              Stage-1 IIFE (dünner Wrapper um core/detect)
  banner.ts              Stage-2 IIFE (dünner Wrapper um core/render)
  i18n/
    index.ts             Locale-Registry + Fallback 'en'
    locales/*.json        22 Sprachen × {tagline,title,body,assurance,cta}
packages/react/          npm-Paket @bauer-group/console-security-banner-react …
  src/                   Hook + Komponente (TS) — nutzt denselben src/core
  tsup.config.ts         Build → ESM + CJS + .d.ts (use client)
scripts/
  build.mjs              esbuild: src/*.ts → dist/v1 + SRI (CDN-Widget)
  deploy/                provider-agnostische Deploy-Schicht (cloudflare/s3/bunny)
  secrets/sync.mjs       .env ↔ GitHub-Secrets
deploy/zones.json        Deploy-Ziele (eine Zone: console-banner-cf)
test/                    Vitest + jsdom (Loader, Banner, i18n) — TS
demo/index.html          lokale Vorschau
docs/                    Deployment-, Provider- & Secrets-Doku
dist/                    Build-Artefakt (gitignored)
```

Alles in `src/**` und `packages/react/src/**` ist **TypeScript**; esbuild (CDN)
und tsup (npm) kompilieren nach JS. `dist/` wird **nie** von Hand editiert.

---

## Entwicklung

```bash
npm install
npm run build          # dist/v1/{loader,banner}{.js,.min.js,.map} + integrity.json
npm run test           # Vitest (jsdom)
npm run lint           # ESLint
npm run validate       # format:check + lint + test + build (CI-Gate)
```

### Lokale Vorschau

```bash
npm run build
npx serve .            # Repo-Root ausliefern …
# … dann http://localhost:3000/demo/ öffnen und DevTools (F12) öffnen
```

---

## Build-Artefakte

Pro Stufe erzeugt `npm run build` unter `dist/v1/`:

| Datei               | Zweck                                 |
| ------------------- | ------------------------------------- |
| `<name>.js`         | lesbarer Bundle (für Audit/Debug)     |
| `<name>.min.js`     | produktives, minifiziertes Artefakt   |
| `<name>.min.js.map` | Source-Map                            |
| `integrity.json`    | SHA-384-SRI-Digests beider `*.min.js` |

esbuild bündelt den ESM-Quellcode (Banner importiert die Locale-JSONs) in ein eigenständiges IIFE — keine Runtime-Imports, eine gecachte Datei.

---

## Sprach-Handling

Reihenfolge: **(1)** `<html lang>` → **(2)** `navigator.languages[]` → **(3)** Fallback Englisch. Verglichen wird das Primär-Subtag (`de-AT` → `de`) gegen die ausgelieferten Locales.

Unterstützt (22): `ar cs de en es fr hi hu it ja ko nl pl pt ro ru sv th tr uk vi zh`.

**Sprache ändern/ergänzen:** Strings in `src/i18n/locales/<lang>.json` bearbeiten bzw. neue Datei anlegen und in `src/i18n/index.js` registrieren, dann `npm run build`. Alle Locales teilen denselben 5-Schlüssel-Vertrag (per Test erzwungen).

---

## Deployment

Auslieferung via Cloudflare R2 (Bucket `bg-widgets`, Prefix `console-banner/`), fronted von `widgets.professional-hosting.com`.

```bash
npm run deploy:dry     # Vorschau: geplante PUTs + Purge, keine Netzwerk-Writes
npm run deploy         # Upload + URL-Purge der geänderten Dateien
```

Der Bucket wird mit **anderen Projekten geteilt**. Jeder Deploy bleibt strikt auf unsere Dateien beschränkt:

- **Manifest-Sync-Delete** (`console-banner/.deploy-manifest.json`) löscht nur Keys, die dieses Repo selbst geschrieben hat.
- **Purge nur per URL** (`purgeEverything: false`) — andere Projekte werden nie aus dem Edge-Cache entfernt.

Details: [docs/deployment.md](docs/deployment.md) · [docs/providers/cloudflare.md](docs/providers/cloudflare.md) · [docs/secrets.md](docs/secrets.md).

### CI/CD

| Workflow                  | Auslöser              | Funktion                                      |
| ------------------------- | --------------------- | --------------------------------------------- |
| `release.yml`             | Push `main`           | Validate (lint/test/build) → Semantic Release |
| `deploy-cdn.yml`          | Push `main` / manuell | Build → Matrix-Deploy je Zone → URL-Purge     |
| `deploy-pages.yml`        | Push `main`           | Live-Demo-Vorschau auf GitHub Pages           |
| `ai-issue-summary.yml`    | Issue/PR geöffnet     | KI-Triage-Zusammenfassung                     |
| `teams-notifications.yml` | diverse Events        | Teams-Benachrichtigungen                      |

**Vor dem ersten Deploy:** GitHub-Secrets `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `CF_PURGE_TOKEN`, `CF_ZONE_ID` setzen (identisch zur Microsites-Zone). Lokal via `.env` + `npm run secrets:push`.

---

## Konfiguration (data-Attribute)

| Attribut      | Zweck                                                              |
| ------------- | ------------------------------------------------------------------ |
| `data-cdn`    | Überschreibt die Basis-URL, von der Stage 2 nachgeladen wird.      |
| `data-banner` | Überschreibt den kompletten Stage-2-Pfad (Vorrang vor `data-cdn`). |

Anwendungsfälle: Staging/Preview, QA-Umgebungen, lokale Tests (siehe `demo/`).

---

## Content-Security-Policy

Bei strikter CSP `widgets.professional-hosting.com` für `script-src` freigeben:

```text
Content-Security-Policy: script-src 'self' https://widgets.professional-hosting.com; …
```

Bei `nonce`/`hash`-Policies: Der Loader injiziert Stage 2 dynamisch; Browser propagieren den Nonce nicht automatisch an Kind-Skripte. Einfachste Lösung: die CDN-Domain domänenbasiert erlauben.

---

## Performance-Profil

| Metrik                              | Wert                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------ |
| HTTP-Requests (Konsole geschlossen) | **0**                                                                    |
| HTTP-Requests (Konsole offen)       | **1** (Stage 2, ~8 KB gzip)                                              |
| Stage-1-Transfer                    | ~1,2 KB gzip                                                             |
| Render-Blocking                     | keines (`async`)                                                         |
| Cookies / Tracking                  | keine                                                                    |
| Laufzeit-Overhead                   | 1× passiver Resize-Listener + 1× `setInterval` (2 s, selbstterminierend) |

---

## Bekannte Grenzen

- **Undocked-DevTools:** Die Viewport-Heuristik greift nicht; der Getter-Probe fängt den Fall mit bis zu 2 s Latenz ab.
- **Gezielt blockiert:** Sicherheitsbewusste Entwickler können den Loader abschalten — akzeptiert, das Banner richtet sich an Endnutzer.
- **`console.clear()` nach Stage 2:** Seiten-Code, der `console.clear()` aufruft, kann das Banner entfernen; Reload löst es erneut aus.
- **Firefox:** `%c`-Stile (Farbe/Weight/Padding/Background) werden ab FF ≥ 109 korrekt gerendert.

---

## Lizenz

MIT © BAUER GROUP. Brand-Assets (Logo, Markenwort „BAUER GROUP", Farbtoken) sind ausgenommen und bleiben Eigentum der BAUER GROUP.
