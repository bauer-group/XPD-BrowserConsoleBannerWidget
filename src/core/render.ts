/*
 * Framework-agnostic Stage-2 renderer for the Console Security Banner.
 *
 * Shared by the CDN IIFE (src/banner.ts) and the React package. All
 * environment access (console, document, navigator) is injectable so the same
 * code runs in a page, in jsdom tests and under SSR guards.
 */
import { MSG, RTL, FALLBACK_LANG, type BannerMessages, type LocaleMap } from '../i18n/index';

/** Subset of `console` the renderer needs — keeps it testable/injectable. */
export type ConsoleLike = Pick<Console, 'log'>;

export interface RenderOptions {
  /** Force a locale (else auto-detect). */
  lang?: string;
  /** Target console (default: global `console`). */
  console?: ConsoleLike | null;
  /** Environment for language detection (default: globals). */
  document?: Document | null;
  navigator?: Navigator | null;
  /** Override the locale table / RTL set (mainly for tests). */
  messages?: LocaleMap;
  rtl?: ReadonlySet<string>;
}

/* Brand tokens from the Corporate-Identity repository:
     --orange-500 #FF8500 · --warm-900 #231F1C · --warm-600 #6B635C */
const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';

const S = {
  brand: `color:#FF8500;font:800 30px/1.1 ${FONT};letter-spacing:.02em;padding:2px 0;`,
  tagline: `color:#231F1C;font:600 11px/1.4 ${FONT};letter-spacing:.32em;text-transform:uppercase;padding:0 0 14px;`,
  title: `background:#FF8500;color:#FFFFFF;font:700 13px/1.5 ${FONT};padding:4px 10px;border-radius:3px;`,
  body: `color:#231F1C;font:400 12.5px/1.6 ${FONT};padding:10px 0 0;`,
  assurance: `color:#231F1C;font:700 12.5px/1.6 ${FONT};padding:8px 0 0;`,
  cta: `color:#6B635C;font:400 12px/1.6 ${FONT};padding:6px 0 4px;`,
};

/* Right-to-left mark (U+200F) — via fromCharCode to keep this invisible
   control character explicit in source. */
const RLM = String.fromCharCode(0x200f);

/** Match a BCP-47 tag's primary subtag (e.g. "de-AT" → "de") against the
 *  shipped locales. Returns a supported key or '' for no match. */
export function pick(tag: string | null | undefined, messages: LocaleMap = MSG): string {
  const primary = String(tag || '')
    .toLowerCase()
    .split(/[-_]/)[0];
  return primary && Object.prototype.hasOwnProperty.call(messages, primary) ? primary : '';
}

/** Resolve the banner language: `<html lang>` → `navigator.languages` →
 *  English fallback. Environment is injectable for tests/SSR. */
export function detectLang(opts: RenderOptions = {}): string {
  const doc = opts.document ?? (typeof document !== 'undefined' ? document : null);
  const nav = opts.navigator ?? (typeof navigator !== 'undefined' ? navigator : null);
  const dict = opts.messages ?? MSG;
  try {
    const fromHtml = pick(doc?.documentElement?.lang, dict);
    if (fromHtml) return fromHtml;

    const langs =
      nav?.languages && nav.languages.length ? nav.languages : [(nav && nav.language) || ''];
    for (const tag of langs) {
      const hit = pick(tag, dict);
      if (hit) return hit;
    }
  } catch {
    /* noop */
  }
  return FALLBACK_LANG;
}

/** Print the styled, localized banner once. The title's orange background
 *  must wrap ONLY the title text: the newline before it lives in the
 *  (background-less) tagline segment, so it never bleeds into a stray bar. */
export function renderBanner(opts: RenderOptions = {}): void {
  const con: ConsoleLike | null = opts.console ?? (typeof console !== 'undefined' ? console : null);
  if (!con || typeof con.log !== 'function') return;

  const dict = opts.messages ?? MSG;
  const rtlSet = opts.rtl ?? RTL;
  const lang = opts.lang ? pick(opts.lang, dict) || FALLBACK_LANG : detectLang(opts);
  const m: BannerMessages = dict[lang] || dict[FALLBACK_LANG];
  const rtl = rtlSet.has(lang) ? RLM : '';

  try {
    con.log(
      '%cBAUER GROUP' +
        '%c\n' +
        rtl +
        m.tagline +
        '\n' +
        '%c' +
        rtl +
        m.title +
        '%c\n\n' +
        rtl +
        m.body +
        '%c\n\n' +
        rtl +
        m.assurance +
        '%c\n' +
        rtl +
        m.cta,
      S.brand,
      S.tagline,
      S.title,
      S.body,
      S.assurance,
      S.cta
    );
  } catch {
    /* Extremely old engine with no %c support — still log something useful. */
    try {
      con.log('BAUER GROUP — ' + m.title);
      con.log(m.body);
      con.log(m.assurance);
      con.log(m.cta);
    } catch {
      /* silent */
    }
  }
}
