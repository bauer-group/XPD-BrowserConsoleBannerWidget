/*
 * Framework-agnostic DevTools detector for the Console Security Banner.
 *
 * Shared by the CDN loader (src/loader.ts) and the React package. Calls
 * `onOpen` exactly once when an open DevTools panel is detected, then tears
 * itself down. Returns a `stop()` function so callers (e.g. a React effect
 * cleanup) can detach early.
 *
 * Detection:
 *   • Viewport delta (default) — the outer/inner window gap a DOCKED DevTools
 *     panel creates, checked at load, on resize + visibilitychange, and via a
 *     bounded, silent safety-net interval. Writes nothing to the console.
 *   • Console getter-tripwire (OPT-IN via `probe: true`) — additionally
 *     detects DevTools UNDOCKED into a separate window (which doesn't change
 *     the viewport). It logs ONE tagged value, so the console is no longer
 *     pristine — hence opt-in.
 */
import type { ConsoleLike } from './render';

export interface WatchOptions {
  window?: (Window & typeof globalThis) | null;
  document?: Document | null;
  console?: ConsoleLike | null;
  threshold?: number;
  /**
   * Opt-in for stricter security requirements: additionally detect UNDOCKED
   * DevTools (separate window) via a one-time console getter-tripwire. Off by
   * default — enabling it logs a single probe value, so the console is no
   * longer pristine.
   */
  probe?: boolean;
}

const noop = (): void => {};

export function watchDevtools(onOpen: () => void, options: WatchOptions = {}): () => void {
  const w = options.window ?? (typeof window !== 'undefined' ? window : null);
  const d = options.document ?? (typeof document !== 'undefined' ? document : null);
  const con = options.console ?? (typeof console !== 'undefined' ? console : null);
  const THRESHOLD = options.threshold ?? 160;

  /* SSR / non-browser environment: nothing to watch. */
  if (!w) return noop;

  let fired = false;
  let ticking = false;
  let ticks = 0;
  let pid: ReturnType<typeof setInterval> | null = null;

  function cleanup(): void {
    try {
      w!.removeEventListener('resize', onResize);
    } catch {
      /* ignore */
    }
    try {
      d?.removeEventListener('visibilitychange', measure as EventListener);
    } catch {
      /* ignore */
    }
    if (pid != null) {
      w!.clearInterval(pid as unknown as number);
      pid = null;
    }
  }

  function fire(): void {
    if (fired) return;
    fired = true;
    cleanup();
    try {
      onOpen();
    } catch {
      /* never let a consumer error break detection teardown */
    }
  }

  /* Viewport delta — fires for the common docked DevTools case. */
  function measure(): boolean {
    if (fired) return true;
    if (w!.outerWidth - w!.innerWidth > THRESHOLD || w!.outerHeight - w!.innerHeight > THRESHOLD) {
      fire();
      return true;
    }
    return false;
  }

  function onResize(): void {
    if (ticking || fired) return;
    ticking = true;
    const raf = w!.requestAnimationFrame || ((f: FrameRequestCallback) => setTimeout(f, 16));
    raf(() => {
      ticking = false;
      measure();
    });
  }

  /* Kick-off: covers "DevTools already docked-open at load". */
  measure();

  /* Opt-in console-render tripwire for UNDOCKED DevTools. A no-op function
     carries a getter on `name` that the console reads when it previews the
     value (now, or when the panel is opened later). Logs exactly one value. */
  if (options.probe && !fired && con) {
    const trap = function (): string {
      return '';
    };
    try {
      Object.defineProperty(trap, 'name', {
        get: () => {
          fire();
          return '';
        },
      });
    } catch {
      /* ancient engine — viewport heuristic still applies */
    }
    try {
      con.log('%c', '', trap);
    } catch {
      /* console-free env */
    }
  }

  w.addEventListener('resize', onResize, { passive: true });
  if (d) d.addEventListener('visibilitychange', measure as EventListener, false);

  /* Silent safety-net for a dock that emits no resize event. Bounded to ~5 min
     so it never runs forever. */
  pid = w.setInterval(() => {
    if (fired || measure() || ++ticks > 150) cleanup();
  }, 2000);

  return cleanup;
}
