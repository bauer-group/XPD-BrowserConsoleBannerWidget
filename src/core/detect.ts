/*
 * Framework-agnostic DevTools detector for the Console Security Banner.
 *
 * Shared by the CDN loader (src/loader.ts) and the React package. Calls
 * `onOpen` exactly once when an open DevTools panel is detected, then tears
 * itself down. Returns a `stop()` function so callers (e.g. a React effect
 * cleanup) can detach early.
 *
 * Two heuristics:
 *   A — outer/inner viewport delta (docked DevTools; re-checked on resize +
 *       visibilitychange and via a bounded, silent safety-net interval).
 *   B — a getter-tripwire logged ONCE, but only if A did not already fire, so
 *       a docked-and-open console never leaves a stray probe line behind.
 */
import type { ConsoleLike } from './render';

export interface WatchOptions {
  window?: (Window & typeof globalThis) | null;
  document?: Document | null;
  console?: ConsoleLike | null;
  threshold?: number;
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

  /* Heuristic A. */
  function measure(): boolean {
    if (fired) return true;
    if (w!.outerWidth - w!.innerWidth > THRESHOLD || w!.outerHeight - w!.innerHeight > THRESHOLD) {
      fire();
      return true;
    }
    return false;
  }

  /* Heuristic B: a no-op function whose `name` getter fires when the console
     previews it. Safe when Object.defineProperty is missing. */
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
    /* ancient engine — heuristic A still applies */
  }
  function probeOnce(): void {
    if (!con) return;
    try {
      con.log('%c', '', trap);
    } catch {
      /* console-free env */
    }
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

  /* Kick-off: A covers "already open". B (logged once) only if A stayed
     silent, so a docked-open console isn't polluted with a probe line. */
  measure();
  if (!fired) probeOnce();

  w.addEventListener('resize', onResize, { passive: true });
  if (d) d.addEventListener('visibilitychange', measure as EventListener, false);

  /* Silent viewport safety-net for a dock that emits no resize event.
     Bounded to ~5 min so it never runs forever. */
  pid = w.setInterval(() => {
    if (fired || measure() || ++ticks > 150) cleanup();
  }, 2000);

  return cleanup;
}
