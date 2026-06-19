/*
 * Locale registry for the Console Security Banner (Stage 2).
 *
 * Each locale supplies the five strings consumed by banner.js:
 *   tagline · title · body · assurance · cta
 *
 * The JSON files are imported statically so the bundler (esbuild) can
 * inline every locale into the single Stage-2 artifact — no runtime fetch,
 * one cached file. English is the guaranteed fallback (see banner.js).
 *
 * Add a language by dropping a `<tag>.json` in ./locales and registering
 * it below; detectLang() in banner.js matches against these keys.
 */
import ar from './locales/ar.json';
import cs from './locales/cs.json';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import hu from './locales/hu.json';
import it from './locales/it.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import nl from './locales/nl.json';
import pl from './locales/pl.json';
import pt from './locales/pt.json';
import ro from './locales/ro.json';
import ru from './locales/ru.json';
import sv from './locales/sv.json';
import th from './locales/th.json';
import tr from './locales/tr.json';
import uk from './locales/uk.json';
import vi from './locales/vi.json';
import zh from './locales/zh.json';

export const MSG = {
  ar,
  cs,
  de,
  en,
  es,
  fr,
  hi,
  hu,
  it,
  ja,
  ko,
  nl,
  pl,
  pt,
  ro,
  ru,
  sv,
  th,
  tr,
  uk,
  vi,
  zh,
};

/* Right-to-left scripts — exposed so banner.js can hint the console direction. */
export const RTL = new Set(['ar']);

export const FALLBACK_LANG = 'en';
