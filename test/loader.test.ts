import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';

const DEFAULT_ORIGIN = 'https://widgets.professional-hosting.com/console-banner/v1';

// Override a window dimension (jsdom defines these as configurable).
function setDim(prop: string, value: number): void {
  Object.defineProperty(window, prop, { value, configurable: true, writable: true });
}

// Simulate "DevTools docked" (large outer/inner delta) or "console closed".
function setViewportDelta(open: boolean): void {
  setDim('innerWidth', 1000);
  setDim('innerHeight', 800);
  setDim('outerWidth', open ? 1400 : 1000);
  setDim('outerHeight', 800);
}

// Place a loader <script> with optional data-* overrides as the last script
// in the DOM, so the loader's currentScript fallback resolves to it.
function placeLoaderScript(dataset: Record<string, string> = {}): HTMLScriptElement {
  const s = document.createElement('script');
  s.src = `${DEFAULT_ORIGIN}/loader.min.js`;
  for (const [k, v] of Object.entries(dataset)) s.dataset[k] = v;
  document.body.appendChild(s);
  return s;
}

async function loadLoader(): Promise<void> {
  vi.resetModules();
  await import('../src/loader');
}

function injectedBanner(): HTMLScriptElement | null {
  return document.querySelector<HTMLScriptElement>('script[data-bg-console-banner]');
}

describe('loader Stage-1', () => {
  let logSpy: MockInstance<(...args: unknown[]) => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    delete (window as unknown as Record<string, unknown>).__bgConsoleBanner;
    document.head.querySelectorAll('script[data-bg-console-banner]').forEach((n) => n.remove());
    document.body.replaceChildren();
    setViewportDelta(false);
    // Default to a no-op console so the getter-tripwire (heuristic B) stays
    // dormant — this isolates the viewport heuristic (A) under test.
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}) as typeof logSpy;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not inject Stage-2 while the console looks closed', async () => {
    placeLoaderScript();
    await loadLoader();
    expect(injectedBanner()).toBeNull();
  });

  it('injects via the getter tripwire when the console previews the tagged object', async () => {
    placeLoaderScript();
    setViewportDelta(false); // viewport heuristic stays silent
    // Simulate DevTools reading the logged value's properties (incl. .name).
    logSpy.mockImplementation((...args: unknown[]) => {
      args.forEach((a) => {
        if (typeof a === 'function') void (a as { name: string }).name;
      });
    });
    await loadLoader();
    expect(injectedBanner()).not.toBeNull();
  });

  it('injects Stage-2 when the viewport delta exceeds the threshold', async () => {
    placeLoaderScript();
    setViewportDelta(true);
    await loadLoader();
    const el = injectedBanner();
    expect(el).not.toBeNull();
    expect(el!.getAttribute('src')).toBe(`${DEFAULT_ORIGIN}/banner.min.js`);
  });

  it('marks the injected script async, cross-origin and no-referrer', async () => {
    placeLoaderScript();
    setViewportDelta(true);
    await loadLoader();
    const el = injectedBanner()!;
    expect(el.async).toBe(true);
    expect(el.crossOrigin).toBe('anonymous');
    expect(el.referrerPolicy).toBe('no-referrer');
  });

  it('propagates the host page CSP nonce to the injected script', async () => {
    const loader = placeLoaderScript();
    loader.setAttribute('nonce', 'abc123');
    setViewportDelta(true);
    await loadLoader();
    expect(injectedBanner()!.getAttribute('nonce')).toBe('abc123');
  });

  it('honours the data-cdn override', async () => {
    placeLoaderScript({ cdn: 'https://mirror.example/cb/v1' });
    setViewportDelta(true);
    await loadLoader();
    expect(injectedBanner()!.getAttribute('src')).toBe(
      'https://mirror.example/cb/v1/banner.min.js'
    );
  });

  it('lets data-banner take precedence over data-cdn', async () => {
    placeLoaderScript({
      cdn: 'https://mirror.example/cb/v1',
      banner: 'https://edge.example/custom-banner.js',
    });
    setViewportDelta(true);
    await loadLoader();
    expect(injectedBanner()!.getAttribute('src')).toBe('https://edge.example/custom-banner.js');
  });

  it('is idempotent — a second loader instance does not double-inject', async () => {
    placeLoaderScript();
    setViewportDelta(true);
    await loadLoader();
    await loadLoader(); // window.__bgConsoleBanner already set → early return
    expect(document.querySelectorAll('script[data-bg-console-banner]')).toHaveLength(1);
  });
});
