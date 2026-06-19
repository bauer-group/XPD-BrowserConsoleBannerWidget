/*!
 * BAUER GROUP — Console Security Banner (Loader · Stage 1)
 * v__BG_VERSION__ · (c) BAUER GROUP · MIT
 *
 * Prints a security warning inside the browser console ONLY when the DevTools
 * panel is actually opened — keeping page-load impact essentially zero. The
 * detection heuristics live in ./core/detect (shared with the React package);
 * this thin wrapper resolves CDN/SRI/nonce options from the host <script> tag
 * and injects the Stage-2 module on the first positive signal.
 *
 * Overrides (optional):
 *   <script async src="…/loader.min.js" data-cdn="https://mirror.example"></script>
 *   <script async src="…/loader.min.js" data-banner="/custom/banner.min.js"></script>
 *   <script async src="…/loader.min.js" data-probe></script>  (strict: also
 *     detect undocked DevTools — logs one console value)
 */
import { watchDevtools } from './core/detect';

type BgWindow = Window & typeof globalThis & { __bgConsoleBanner?: { v: string; loaded: boolean } };

(function (w: BgWindow, d: Document) {
  'use strict';

  /* Idempotency — tolerate the script being embedded twice on a page. */
  if (w.__bgConsoleBanner) return;
  const ns = (w.__bgConsoleBanner = { v: '__BG_VERSION__', loaded: false as boolean });

  /* CDN origin resolution. Defaults to the official endpoint; can be
     overridden via data-cdn on the <script> tag for staging/mirrors. */
  let CDN = 'https://widgets.professional-hosting.com/console-banner/v1';
  let BANNER: string | null = null;

  /* SHA-384 SRI of the DEFAULT Stage-2 module, substituted at build time.
     Stays a non-SRI sentinel in source so unbuilt/tested code skips integrity. */
  const BANNER_SRI = 'BG_BANNER_SRI_PLACEHOLDER';

  let nonce = '';
  /* Opt-in console getter-tripwire (for stricter security: also catches
     UNDOCKED DevTools). Off unless data-probe is present (and not "false"). */
  let probe = false;
  try {
    const me =
      (d.currentScript as HTMLScriptElement | null) ||
      (() => {
        const s = d.getElementsByTagName('script');
        return s[s.length - 1] as HTMLScriptElement | undefined;
      })();
    if (me) {
      if (me.dataset && me.dataset.cdn) CDN = String(me.dataset.cdn).replace(/\/+$/, '');
      if (me.dataset && me.dataset.banner) BANNER = String(me.dataset.banner);
      if (me.dataset && me.dataset.probe != null) probe = me.dataset.probe !== 'false';
      /* Carry the host page's CSP nonce to the injected Stage-2 script —
         browsers do NOT propagate it to dynamically inserted scripts. */
      nonce = (me.nonce || me.getAttribute('nonce') || '') + '';
    }
  } catch {
    /* ignore parse issues */
  }

  /* Stage-2 injection — hardened: async + crossorigin (strict CSP), SRI-pinned
     to the known build, nonce-propagated, no Referer. */
  function loadBanner(): void {
    if (ns.loaded) return;
    ns.loaded = true;
    const s = d.createElement('script');
    s.src = BANNER || CDN + '/banner.min.js';
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.referrerPolicy = 'no-referrer';
    if (!BANNER && BANNER_SRI.indexOf('sha384-') === 0) s.integrity = BANNER_SRI;
    if (nonce) s.setAttribute('nonce', nonce);
    s.setAttribute('data-bg-console-banner', '1');
    (d.head || d.documentElement).appendChild(s);
  }

  watchDevtools(loadBanner, { window: w, document: d, probe });
})(window, document);
