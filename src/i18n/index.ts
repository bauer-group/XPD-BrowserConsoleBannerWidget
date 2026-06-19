/*
 * Locale registry for the Console Security Banner (Stage 2).
 *
 * Each locale supplies the five strings consumed by the renderer. The JSON
 * files are imported statically so bundlers (esbuild for the CDN, tsup for the
 * npm package) inline every locale into a single self-contained artifact — no
 * runtime fetch. English is the guaranteed fallback.
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

/** The five strings every locale must provide. */
export interface BannerMessages {
  tagline: string;
  title: string;
  body: string;
  assurance: string;
  cta: string;
}

export type LocaleMap = Record<string, BannerMessages>;

export const MSG: LocaleMap = {
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

/** Right-to-left scripts — render.ts prefixes a RLM mark for these. */
export const RTL: ReadonlySet<string> = new Set(['ar']);

export const FALLBACK_LANG = 'en';
