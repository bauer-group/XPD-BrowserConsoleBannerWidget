import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ConsoleSecurityBanner } from '../src/index';

// jsdom defaults innerWidth≈1024; a large outerWidth simulates docked DevTools.
function setViewport(open: boolean) {
  Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  Object.defineProperty(window, 'outerWidth', { value: open ? 1400 : 1000, configurable: true });
  Object.defineProperty(window, 'outerHeight', { value: 800, configurable: true });
}

function loaderScript() {
  return document.querySelector('script[data-bg-console-banner-loader]');
}

describe('ConsoleSecurityBanner (React)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>).__bgConsoleBannerReact;
    document.head
      .querySelectorAll('script[data-bg-console-banner-loader]')
      .forEach((n) => n.remove());
    document.documentElement.lang = 'de';
    setViewport(false);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the banner locally when DevTools are detected (no network)', () => {
    setViewport(true);
    render(<ConsoleSecurityBanner />);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('BAUER GROUP');
    expect(loaderScript()).toBeNull(); // local mode: zero <script> injection
  });

  it('does not render the banner locally while the console looks closed', () => {
    render(<ConsoleSecurityBanner />);
    // The one-shot tripwire probe may log a placeholder, but the banner itself
    // (the BAUER GROUP block) must not appear until DevTools are detected.
    const bannerShown = logSpy.mock.calls.some((c) => String(c[0]).includes('BAUER GROUP'));
    expect(bannerShown).toBe(false);
  });

  it('respects a forced language', () => {
    setViewport(true);
    document.documentElement.lang = '';
    render(<ConsoleSecurityBanner lang="fr" />);
    expect(logSpy.mock.calls[0][0]).toContain('AVIS DE SÉCURITÉ');
  });

  it('injects the CDN loader script in cdn mode', () => {
    render(<ConsoleSecurityBanner mode="cdn" nonce="abc123" />);
    const s = loaderScript() as HTMLScriptElement;
    expect(s).not.toBeNull();
    expect(s.getAttribute('src')).toBe(
      'https://widgets.professional-hosting.com/console-banner/v1/loader.min.js'
    );
    expect(s.crossOrigin).toBe('anonymous');
    expect(s.getAttribute('nonce')).toBe('abc123');
  });

  it('honours a custom cdnUrl + integrity', () => {
    render(
      <ConsoleSecurityBanner
        mode="cdn"
        cdnUrl="https://mirror.example/cb/v1"
        integrity="sha384-xyz"
      />
    );
    const s = loaderScript() as HTMLScriptElement;
    expect(s.getAttribute('src')).toBe('https://mirror.example/cb/v1/loader.min.js');
    expect(s.getAttribute('integrity')).toBe('sha384-xyz');
  });

  it('is a no-op when disabled', () => {
    setViewport(true);
    render(<ConsoleSecurityBanner disabled mode="cdn" />);
    expect(logSpy).not.toHaveBeenCalled();
    expect(loaderScript()).toBeNull();
  });

  it('is idempotent across two instances', () => {
    render(
      <>
        <ConsoleSecurityBanner mode="cdn" />
        <ConsoleSecurityBanner mode="cdn" />
      </>
    );
    expect(document.querySelectorAll('script[data-bg-console-banner-loader]')).toHaveLength(1);
  });

  it('removes the injected script on unmount', () => {
    const view = render(<ConsoleSecurityBanner mode="cdn" />);
    expect(loaderScript()).not.toBeNull();
    view.unmount();
    expect(loaderScript()).toBeNull();
  });
});
