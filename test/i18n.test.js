import { describe, it, expect } from 'vitest';
import { MSG, RTL, FALLBACK_LANG } from '../src/i18n/index.js';

const REQUIRED_KEYS = ['tagline', 'title', 'body', 'assurance', 'cta'];
const locales = Object.keys(MSG);

describe('i18n locale registry', () => {
  it('ships the full 22-locale set', () => {
    expect(locales).toHaveLength(22);
  });

  it('guarantees English as the fallback', () => {
    expect(FALLBACK_LANG).toBe('en');
    expect(MSG).toHaveProperty(FALLBACK_LANG);
  });

  it('marks Arabic as right-to-left', () => {
    expect(RTL.has('ar')).toBe(true);
  });

  it.each(locales)('locale "%s" has all five non-empty string keys', (lang) => {
    const entry = MSG[lang];
    for (const key of REQUIRED_KEYS) {
      expect(entry, `${lang}.${key} missing`).toHaveProperty(key);
      expect(typeof entry[key], `${lang}.${key} type`).toBe('string');
      expect(entry[key].trim().length, `${lang}.${key} empty`).toBeGreaterThan(0);
    }
  });

  it.each(locales)('locale "%s" carries the support contact in its CTA', (lang) => {
    expect(MSG[lang].cta).toContain('support.bauer-group.com');
  });

  it('has no stray keys beyond the contract', () => {
    for (const lang of locales) {
      expect(Object.keys(MSG[lang]).sort()).toEqual([...REQUIRED_KEYS].sort());
    }
  });
});
