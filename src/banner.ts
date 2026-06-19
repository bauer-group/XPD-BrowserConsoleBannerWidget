/*!
 * BAUER GROUP — Console Security Banner (Core · Stage 2)
 * v__BG_VERSION__ · (c) BAUER GROUP · MIT
 *
 * Prints the styled, localized warning once inside an already-open DevTools
 * console. The render + language logic lives in ./core/render (shared with the
 * React package); this thin wrapper just guards against double-printing.
 */
import { renderBanner } from './core/render';

type BgWindow = Window & typeof globalThis & { __bgConsoleBannerShown?: boolean };

(function (w: BgWindow) {
  'use strict';

  /* Idempotency: never double-print, even if the loader injects twice. */
  if (w.__bgConsoleBannerShown) return;
  w.__bgConsoleBannerShown = true;

  renderBanner();
})(window);
