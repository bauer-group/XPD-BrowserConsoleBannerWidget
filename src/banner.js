/*!
 * BAUER GROUP — Console Security Banner (Core · Stage 2)
 * v1.0.0 · (c) BAUER GROUP · MIT
 *
 * Printed only once, inside an already-open DevTools console.
 * Language is chosen from <html lang> first, then navigator.languages,
 * falling back to English. Locales live under ./i18n/locales and are
 * inlined at build time — see ./i18n/index.js.
 */
import { MSG, RTL, FALLBACK_LANG } from './i18n/index.js';

(function (w, d) {
  'use strict';

  /* Idempotency: never double-print, even if the loader ever injects twice. */
  if (w.__bgConsoleBannerShown) return;
  w.__bgConsoleBannerShown = true;

  /* ------------------------------------------------------------ Language */
  /* Match a BCP-47 tag's primary subtag (e.g. "de-AT" → "de") against the
     locales we actually ship. Returns a supported key or '' for no match. */
  function pick(tag) {
    var primary = String(tag || '')
      .toLowerCase()
      .split(/[-_]/)[0];
    return primary && Object.prototype.hasOwnProperty.call(MSG, primary) ? primary : '';
  }

  function detectLang() {
    try {
      var htmlLang = d.documentElement && d.documentElement.lang;
      var fromHtml = pick(htmlLang);
      if (fromHtml) return fromHtml;

      var nav = w.navigator || {};
      var langs =
        nav.languages && nav.languages.length
          ? nav.languages
          : [nav.language || nav.userLanguage || ''];
      for (var i = 0; i < langs.length; i++) {
        var hit = pick(langs[i]);
        if (hit) return hit;
      }
    } catch (e) {
      /* noop */
    }
    return FALLBACK_LANG;
  }

  /* ------------------------------------------------------------- Styling */
  /* Brand tokens sourced from the Corporate-Identity repository:
       --orange-500  #FF8500   (primary)
       --warm-900    #231F1C   (brand black)
       --warm-600    #6B635C   (body text AA)
       --warm-100    #F0EDEA   (surface subtle)
     Font stack mirrors the --font-body token. */
  var FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';

  var S = {
    brand: 'color:#FF8500;font:800 30px/1.1 ' + FONT + ';letter-spacing:.02em;padding:2px 0;',
    tagline:
      'color:#231F1C;font:600 11px/1.4 ' +
      FONT +
      ';letter-spacing:.32em;text-transform:uppercase;padding:0 0 14px;',
    title:
      'background:#FF8500;color:#FFFFFF;font:700 13px/1.5 ' +
      FONT +
      ';padding:4px 10px;border-radius:3px;',
    body: 'color:#231F1C;font:400 12.5px/1.6 ' + FONT + ';padding:10px 0 0;',
    assurance: 'color:#231F1C;font:700 12.5px/1.6 ' + FONT + ';padding:8px 0 0;',
    cta: 'color:#6B635C;font:400 12px/1.6 ' + FONT + ';padding:6px 0 4px;',
  };

  /* -------------------------------------------------------------- Render */
  function render() {
    var lang = detectLang();
    var m = MSG[lang] || MSG[FALLBACK_LANG];
    /* RTL scripts read more naturally with a right-to-left mark prefixed. */
    var rtl = RTL.has(lang) ? '‏' : '';

    try {
      /* Single combined call keeps the block visually grouped. Each %c
         applies until the next %c, so the message is stitched together
         from six styled segments. */
      console.log(
        '%cBAUER GROUP' +
          '%c\n' +
          rtl +
          m.tagline +
          '%c\n' +
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
    } catch (e) {
      /* Extremely old engine with no %c support — still log something useful. */
      try {
        console.log('BAUER GROUP — ' + m.title);
        console.log(m.body);
        console.log(m.assurance);
        console.log(m.cta);
      } catch (_) {
        /* silent */
      }
    }
  }

  render();
})(window, document);
