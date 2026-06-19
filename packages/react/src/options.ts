/** How the banner is delivered. */
export type ConsoleBannerMode = 'local' | 'cdn';

/** Options shared by the {@link useConsoleSecurityBanner} hook and the
 *  {@link ConsoleSecurityBanner} component. */
export interface ConsoleBannerOptions {
  /**
   * `'local'` (default) bundles the detection + render logic and all 22
   * locales into your app — zero network requests, works offline / air-gapped.
   * `'cdn'` injects the loader `<script>` from the CDN instead (smaller bundle,
   * but an external dependency).
   */
  mode?: ConsoleBannerMode;

  /** Force a locale (e.g. `'de'`). Omit to auto-detect from `<html lang>` →
   *  `navigator.languages` → English fallback. */
  lang?: string;

  /** Set `true` to disable the banner entirely (e.g. per environment). */
  disabled?: boolean;

  /** CSP nonce to put on the injected `<script>` (CDN mode only). */
  nonce?: string;

  /** Override the CDN base URL (CDN mode only). Defaults to the official
   *  `https://widgets.professional-hosting.com/console-banner/v1`. */
  cdnUrl?: string;

  /** Subresource-Integrity hash for the loader script (CDN mode only). Pin it
   *  from the published `console-banner/v1/integrity.json` for supply-chain
   *  hardening. */
  integrity?: string;

  /** Opt-in for stricter security requirements: also detect **undocked**
   *  DevTools (separate window) via a one-time console getter-tripwire. Off by
   *  default — enabling it logs a single probe value to the console. */
  probe?: boolean;
}
