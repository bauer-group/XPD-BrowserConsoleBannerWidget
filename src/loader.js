/*!
 * BAUER GROUP — Console Security Banner (Loader · Stage 1)
 * v1.0.0 · (c) BAUER GROUP · MIT
 *
 * Purpose
 * -------
 * Print a security warning inside the browser console ONLY when the
 * DevTools panel is actually opened. This keeps the impact on page-
 * load performance essentially zero: a handful of property reads, one
 * passive resize listener and a single console probe until the console
 * is used.
 *
 * How it works
 * ------------
 *  1. Heuristic A — throttled window-dimension delta check (primary
 *     signal for docked DevTools; re-checked on resize + visibilitychange
 *     and via a bounded, silent safety-net interval).
 *  2. Heuristic B — a getter-tripwire logged ONCE. When the console
 *     renders the tagged value (now, or when DevTools is opened later)
 *     it reads the getter and fires. Logging once keeps the console
 *     clean while the panel stays closed.
 *  3. On the first positive signal, dynamically injects the Stage-2
 *     banner module — with crossorigin, Subresource Integrity, the host
 *     page's CSP nonce and a no-referrer policy.
 *
 * Overrides (optional)
 * --------------------
 *   <script async src="…/loader.min.js" data-cdn="https://mirror.example"></script>
 *   <script async src="…/loader.min.js" data-banner="/custom/banner.min.js"></script>
 */
(function (w, d) {
  'use strict';

  /* Idempotency — tolerate the script being embedded twice on a page. */
  if (w.__bgConsoleBanner) return;
  var ns = (w.__bgConsoleBanner = { v: '1.0.0', loaded: false });

  /* CDN origin resolution. Defaults to the official endpoint; can be
     overridden via data-cdn on the <script> tag for staging/mirrors. */
  var CDN = 'https://widgets.professional-hosting.com/console-banner/v1';
  var BANNER = null;

  /* SHA-384 SRI of the DEFAULT Stage-2 module, substituted at build time.
     It stays a non-SRI sentinel in source so unbuilt/tested code simply
     skips integrity (the check below requires a real `sha384-` value). */
  var BANNER_SRI = 'BG_BANNER_SRI_PLACEHOLDER';

  var nonce = '';
  try {
    var me =
      d.currentScript ||
      (function () {
        var s = d.getElementsByTagName('script');
        return s[s.length - 1];
      })();
    if (me) {
      if (me.dataset && me.dataset.cdn) CDN = String(me.dataset.cdn).replace(/\/+$/, '');
      if (me.dataset && me.dataset.banner) BANNER = String(me.dataset.banner);
      /* Carry the host page's CSP nonce over to the injected Stage-2 script —
         browsers do NOT propagate it to dynamically inserted scripts. */
      nonce = (me.nonce || me.getAttribute('nonce') || '') + '';
    }
  } catch (e) {
    /* ignore parse issues */
  }

  /* Stage-2 injection — hardened: async + crossorigin so it works under
     strict CSP, SRI-pinned to the known build, nonce-propagated, and sent
     without a Referer header. */
  function loadBanner() {
    if (ns.loaded) return;
    ns.loaded = true;
    var s = d.createElement('script');
    s.src = BANNER || CDN + '/banner.min.js';
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.referrerPolicy = 'no-referrer';
    /* Pin the default module with SRI. A custom data-banner has an unknown
       hash, so integrity is intentionally skipped there. */
    if (!BANNER && BANNER_SRI.indexOf('sha384-') === 0) s.integrity = BANNER_SRI;
    if (nonce) s.setAttribute('nonce', nonce);
    s.setAttribute('data-bg-console-banner', '1');
    (d.head || d.documentElement).appendChild(s);
  }

  /* Heuristic A: outer/inner viewport delta — the common docked case. */
  var THRESHOLD = 160;
  function measure() {
    if (ns.loaded) return true;
    if (w.outerWidth - w.innerWidth > THRESHOLD || w.outerHeight - w.innerHeight > THRESHOLD) {
      loadBanner();
      return true;
    }
    return false;
  }

  /* Heuristic B: console-render tripwire. A no-op function carries a getter
     on `name` that DevTools touches when it previews the value. Logged once;
     re-rendered (and thus tripped) when the panel is opened later. Safe when
     Object.defineProperty is missing (heuristic A still applies). */
  var trap = function () {
    return '';
  };
  try {
    Object.defineProperty(trap, 'name', {
      get: function () {
        loadBanner();
        return '';
      },
    });
  } catch (e) {
    /* ancient engine */
  }
  function probeOnce() {
    try {
      console.log('%c', '', trap);
    } catch (e) {
      /* console-free env */
    }
  }

  /* Kick-off: covers "DevTools already open at load". */
  measure();
  probeOnce();

  /* Resize + visibility cover "opened/docked later" without any logging. */
  var ticking = false;
  w.addEventListener(
    'resize',
    function () {
      if (ticking || ns.loaded) return;
      ticking = true;
      (
        w.requestAnimationFrame ||
        function (f) {
          return setTimeout(f, 16);
        }
      )(function () {
        ticking = false;
        measure();
      });
    },
    { passive: true }
  );
  d.addEventListener('visibilitychange', measure, false);

  /* Silent viewport safety-net (no console output) for a dock that doesn't
     emit a resize event. Bounded to ~5 min so it never runs forever. */
  var ticks = 0;
  var pid = w.setInterval(function () {
    if (ns.loaded || measure() || ++ticks > 150) w.clearInterval(pid);
  }, 2000);
})(window, document);
