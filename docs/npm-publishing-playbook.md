# Playbook: npm-Publishing per OIDC Trusted Publishing (in anderen Repos)

Anleitung, um dasselbe Setup wie hier in einem **anderen Repo** umzusetzen:
laufende Releases publizieren **tokenlos per OIDC** (mit Provenance), und der
**allererste** Publish wird **einmalig lokal** gemacht (weil npm Trusted
Publishing nur ein bereits gelistetes Paket publizieren kann).

> **Referenz-Implementierung (dieses Repo):**
>
> - Release-Workflow: [`.github/workflows/release.yml`](https://github.com/bauer-group/XPD-BrowserConsoleBannerWidget/blob/main/.github/workflows/release.yml)
> - Bootstrap-Script: [`scripts/publish-bootstrap.mjs`](https://github.com/bauer-group/XPD-BrowserConsoleBannerWidget/blob/main/scripts/publish-bootstrap.mjs)
> - Detail-Doku: [`docs/npm-publishing.md`](https://github.com/bauer-group/XPD-BrowserConsoleBannerWidget/blob/main/docs/npm-publishing.md)

---

## Warum so?

| Wann                       | Mechanismus                        | Token?                       |
| -------------------------- | ---------------------------------- | ---------------------------- |
| **Erstmaliges Publishing** | lokal `npm publish` (interaktiv)   | dein npm-Login (Passkey/2FA) |
| **Jeder Release danach**   | CI per **OIDC Trusted Publishing** | **keiner**                   |

npm Trusted Publishing braucht ein **existierendes** Paket — die „Trusted
Publisher"-Einstellung erscheint erst nach dem ersten Publish. Henne-Ei → der
erste Publish listet das Paket einmalig (lokal). Danach nie wieder ein Token.

---

## Schritt 1 — `package.json`

```jsonc
{
  "name": "@<scope>/<paket>",
  "publishConfig": { "access": "public" }, // KEIN registry-Feld → setup-node steuert das Ziel
  "files": ["dist", "README.md", "LICENSE"],
  // + main/module/types/exports je nach Build (siehe React-Paket hier)
}
```

In einem **Monorepo/Workspace** liegt das Paket unter `packages/<name>`; die
Version wird beim Publish gesetzt (siehe Workflow), das committete `version`
bleibt ein Platzhalter.

## Schritt 2 — Release-Workflow (CI, OIDC)

Der Publish-Job — **ohne** `NODE_AUTH_TOKEN`, mit `id-token: write` und
`--provenance` (aus [`release.yml`](https://github.com/bauer-group/XPD-BrowserConsoleBannerWidget/blob/main/.github/workflows/release.yml)):

```yaml
publish-npm:
  needs: release
  if: needs.release.outputs.release-created == 'true'
  runs-on: ubuntu-latest
  permissions:
    contents: read
    id-token: write # OIDC trusted publishing + provenance
  steps:
    - uses: actions/checkout@v6
    - uses: actions/setup-node@v6
      with:
        node-version-file: '.nvmrc'
        cache: npm
        registry-url: 'https://registry.npmjs.org'
    - run: npm ci
    # Monorepo: Version synchronisieren + bauen
    - run: |
        npm version "${{ needs.release.outputs.version }}" \
          --workspace=@<scope>/<paket> --no-git-tag-version
        npm run build -w @<scope>/<paket>
    # Single-Repo: stattdessen einfach `npm run build`
    - run: npm publish -w @<scope>/<paket> --provenance --access public
      # KEIN env: NODE_AUTH_TOKEN — OIDC übernimmt die Auth
```

> Tipp: Wenn andere Release-Outputs (z. B. ein CDN-Deploy) **nicht** an einem
> npm-Schluckauf hängen sollen, den Publish-Job `continue-on-error: true`
> setzen.

## Schritt 3 — Bootstrap-Script (für den lokalen Erstpublish)

[`scripts/publish-bootstrap.mjs`](https://github.com/bauer-group/XPD-BrowserConsoleBannerWidget/blob/main/scripts/publish-bootstrap.mjs)
übernehmen und als npm-Script registrieren:

```jsonc
"scripts": { "publish:bootstrap": "node scripts/publish-bootstrap.mjs" }
```

(In einem Single-Package-Repo genügt auch ein einmaliges `npm publish` von Hand —
das Script ist v. a. fürs Monorepo komfortabel.)

## Schritt 4 — Erstpublish (einmalig, lokal)

```bash
npm login   # Browser-Auth — funktioniert auch mit Passkey/2FA
npm run publish:bootstrap -- --package @<scope>/<paket>
```

Das **listet** das Paket auf npm. Die Version ist egal — der Platzhalter `0.0.0`
reicht (echte Versionen kommen danach via OIDC).

> **Passkey/2FA:** Ein tippbares OTP (`--otp`) gibt es dann nicht — der
> `npm login`-Browserflow erledigt die 2FA. Alternativ ein npm-**Automation**-
> Token (umgeht 2FA), das man danach wieder löschen kann.

## Schritt 5 — Trusted Publisher auf npmjs.com eintragen

Paket-Seite → **Settings → Trusted Publisher** → GitHub Actions:

- **Repository:** `<owner>/<repo>`
- **Workflow filename:** `release.yml` _(genau die Datei, die publisht)_
- **Environment:** _(leer lassen, außer der Job nutzt eine GitHub-Environment)_

## Schritt 6 — Fertig

Ab jetzt publiziert **jeder Release** automatisch per OIDC (mit Provenance) —
kein Token, kein lokaler Schritt mehr.

---

## Stolpersteine

- **Paket muss existieren**, bevor Trusted Publishing konfigurierbar ist → daher der lokale Bootstrap.
- **`id-token: write`** ist Pflicht (OIDC + Provenance).
- **Re-Run des alten, fehlgeschlagenen Publish-Jobs hilft nicht** — er nutzt den damaligen Workflow-Stand. Nach dem Einrichten des Trusted Publishers einen **neuen** Release auslösen (z. B. `release.yml` per `workflow_dispatch` mit `force-release`).
- **`publishConfig.registry` weglassen** — sonst überschreibt es das Registry-Routing von `setup-node` (relevant beim Dual-Publish npm + GitHub Packages).
- Die `0.0.0`-Platzhalterversion kann man nach dem ersten echten Release deprecaten:
  ```bash
  npm deprecate @<scope>/<paket>@0.0.0 "placeholder — use the latest version"
  ```
