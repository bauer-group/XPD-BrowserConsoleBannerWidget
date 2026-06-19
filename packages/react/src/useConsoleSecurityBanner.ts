import { useEffect } from 'react';
// Shared, framework-agnostic TypeScript core (single source of truth with the
// CDN widget). tsup bundles these + the 22 locale JSONs into the package so
// local mode needs zero network.
import { watchDevtools } from '../../../src/core/detect';
import { renderBanner } from '../../../src/core/render';
import type { ConsoleBannerOptions } from './options';

const DEFAULT_CDN = 'https://widgets.professional-hosting.com/console-banner/v1';
/** Cross-instance guard so the banner arms at most once per page. */
const FLAG = '__bgConsoleBannerReact';

/**
 * Arm the Console Security Banner for the lifetime of the calling component.
 * SSR-safe (no-op on the server), idempotent across instances and React 19
 * Strict-Mode-safe (cleans up and re-arms without leaking listeners/scripts).
 */
export function useConsoleSecurityBanner(options: ConsoleBannerOptions = {}): void {
  const {
    mode = 'local',
    lang,
    disabled = false,
    nonce,
    cdnUrl = DEFAULT_CDN,
    integrity,
    probe = false,
  } = options;

  useEffect(() => {
    if (disabled || typeof window === 'undefined') return;

    const w = window as unknown as Record<string, boolean>;
    if (w[FLAG]) return;
    w[FLAG] = true;

    if (mode === 'cdn') {
      const s = document.createElement('script');
      s.src = cdnUrl.replace(/\/+$/, '') + '/loader.min.js';
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.referrerPolicy = 'no-referrer';
      if (integrity) s.setAttribute('integrity', integrity);
      if (nonce) s.setAttribute('nonce', nonce);
      if (probe) s.setAttribute('data-probe', '');
      s.setAttribute('data-bg-console-banner-loader', '1');
      (document.head || document.documentElement).appendChild(s);
      return () => {
        w[FLAG] = false;
        s.remove();
      };
    }

    // Local mode: detect + render entirely from the bundle — zero requests.
    const stop = watchDevtools(() => renderBanner({ lang }), { window, document, probe });
    return () => {
      w[FLAG] = false;
      stop();
    };
  }, [mode, lang, disabled, nonce, cdnUrl, integrity, probe]);
}
