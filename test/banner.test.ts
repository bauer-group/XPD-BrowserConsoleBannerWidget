import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';

// Each load re-executes the Stage-2 IIFE against the current jsdom globals.
async function loadBanner(): Promise<void> {
  vi.resetModules();
  await import('../src/banner');
}

describe('banner Stage-2 render', () => {
  let logSpy: MockInstance<(...args: unknown[]) => void>;

  beforeEach(() => {
    document.documentElement.lang = '';
    delete (window as unknown as Record<string, unknown>).__bgConsoleBannerShown;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}) as typeof logSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const firstTemplate = (): string => String(logSpy.mock.calls[0][0]);

  it('renders exactly once', async () => {
    await loadBanner();
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('is idempotent across double-injection', async () => {
    await loadBanner();
    await loadBanner(); // flag already set on window → no second render
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('prefers <html lang> over navigator.languages', async () => {
    document.documentElement.lang = 'fr-FR';
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['de-DE']);
    await loadBanner();
    expect(firstTemplate()).toContain('AVIS DE SÉCURITÉ'); // French tagline
  });

  it('falls back to navigator.languages when <html lang> is unset', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['it-IT']);
    await loadBanner();
    expect(firstTemplate()).toContain('AVVISO DI SICUREZZA'); // Italian tagline
  });

  it('falls back to English for unsupported languages', async () => {
    document.documentElement.lang = 'xx';
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['zz-ZZ']);
    await loadBanner();
    expect(firstTemplate()).toContain('SECURITY NOTICE'); // English tagline
  });

  it('emits the brand word and six %c style segments', async () => {
    await loadBanner();
    const [template, ...styles] = logSpy.mock.calls[0] as [string, ...string[]];
    expect(template).toContain('BAUER GROUP');
    expect((template.match(/%c/g) || []).length).toBe(6);
    expect(styles).toHaveLength(6);
    expect(styles[0]).toContain('#FF8500'); // brand orange
  });

  it('keeps the title background off the line break (no bleeding orange bar)', async () => {
    await loadBanner();
    const [template, ...styles] = logSpy.mock.calls[0] as [string, ...string[]];
    // The orange title style must wrap ONLY the title text. If it wraps a
    // newline, the console renders that background as a stray bar.
    const titleIdx = styles.findIndex((s) => s.includes('background:#FF8500'));
    const titleSegment = template.split('%c')[titleIdx + 1];
    expect(titleSegment).not.toContain('\n');
  });
});
