//     ▄▄ ▄▄ ▄▄  ▄▄▄▄  ▄▄▄▄ ▄▄    ▄▄▄▄▄ ▄▄▄▄
//     ██ ██ ██ ██ ▄▄ ██ ▄▄ ██    ██▄▄  ██▄█▄   Copyright (c) 2026 Julian Storer
//   ▄▄█▀ ▀███▀ ▀███▀ ▀███▀ ██▄▄▄ ██▄▄▄ ██ ██   AGPL-3.0-or-later - see LICENSE

/**
 * i18n — the app's translation layer.
 *
 * **English is the source language and the fallback.** A translated string is
 * asked for as `t('some.key', 'The English text')`: the English text rides at
 * the call site, and a catalogue only supplies what it overrides. That ordering
 * is deliberate. A key with no translation renders as its English original, so
 * a missing or half-finished catalogue degrades to English rather than to a
 * screen full of dotted keys — and because the English is byte-for-byte the
 * literal that was there before, the existing UI (and every test that asserts on
 * it) is unchanged until a translation actually exists.
 *
 * The chosen language is a `prefs` User-realm preference, so it is one setting
 * for this person across every project and every window, and a change made in
 * one window reaches the others over the settings broadcast. The effective
 * locale is derived from that preference — `system` follows the browser/OS
 * language — and is read synchronously at boot from the preference's
 * localStorage mirror so the first paint is already in the right language.
 *
 * A watcher re-renders by listening for {@link LANGUAGE_EVENT} on `window`;
 * nothing reads `t()` once and caches it across a language change.
 * @module i18n
 */

import { cachedUserPref, reconcilePref, setUserPref, onGlobalSettings, notifyPrefChanged } from '../services/prefs.js';
import { zhCN } from './zh-CN.js';

/** The User-realm preference holding the chosen language. */
export const LANGUAGE_PREF = 'language';

/** The CustomEvent dispatched on `window` when the effective locale changes. */
export const LANGUAGE_EVENT = 'juggler:language-changed';

/** Preference value: follow the browser/OS language. */
export const LANGUAGE_SYSTEM = 'system';

/** Preference value: English (the source language — nothing is translated). */
export const LANGUAGE_EN = 'en';

/** Preference value: Simplified Chinese. */
export const LANGUAGE_ZH_CN = 'zh-CN';

/**
 * The languages the Settings row offers, in menu order. Only the *values* live
 * here; the labels are rendered by {@link languageLabel}, because a language's
 * own name is never translated — an endonym stays legible to the person looking
 * for it whichever language the rest of the UI happens to be in.
 * @type {{value: string}[]}
 */
export const LANGUAGES = [
  { value: LANGUAGE_SYSTEM },
  { value: LANGUAGE_EN },
  { value: LANGUAGE_ZH_CN }
];

/**
 * Translation catalogues, by locale. English has no entry: it is the literal
 * passed to {@link t} at each call site, which is what makes an untranslated
 * string read as its English original instead of as a key.
 * @type {Record<string, Record<string, string>>}
 */
const CATALOGUES = {
  [LANGUAGE_ZH_CN]: zhCN
};

/** @type {string} The stored preference ('system', 'en' or 'zh-CN'). */
let _preference = LANGUAGE_SYSTEM;

/** @type {string} The locale translations are actually read from. */
let _locale = LANGUAGE_EN;

/**
 * The locale a `system` preference resolves to, from the browser/OS language.
 * Anything that is not Chinese resolves to English, the source language.
 * @returns {string} `zh-CN` when the environment is Chinese, otherwise `en`.
 * @private
 */
function detectSystemLocale() {
  if (typeof navigator === 'undefined' || !navigator.language) return LANGUAGE_EN;
  return /^zh\b/i.test(navigator.language) ? LANGUAGE_ZH_CN : LANGUAGE_EN;
}

/**
 * Resolve a stored preference to the locale its text should be read in.
 * An unrecognised value is treated as `system`, so a preference written by a
 * newer build cannot leave the UI in a locale this one has no catalogue for.
 * @param {string} preference - A stored preference value.
 * @returns {string} The locale to read translations from.
 */
export function resolveLocale(preference) {
  if (preference === LANGUAGE_ZH_CN) return LANGUAGE_ZH_CN;
  if (preference === LANGUAGE_EN) return LANGUAGE_EN;
  return detectSystemLocale();
}

/**
 * The chosen language preference, as stored.
 * @returns {string} `system`, `en` or `zh-CN`.
 */
export function getLanguage() {
  return _preference;
}

/**
 * The locale translations are currently read from.
 * @returns {string} `en` or `zh-CN`.
 */
export function getLocale() {
  return _locale;
}

/**
 * The menu label for a language preference: the localised word for "follow the
 * system", or the language's own name, which is the same in every locale.
 * @param {string} value - A language preference value.
 * @returns {string} The label to show in the menu.
 */
export function languageLabel(value) {
  if (value === LANGUAGE_SYSTEM) return t('settings.language.system', 'System');
  if (value === LANGUAGE_EN) return 'English';
  if (value === LANGUAGE_ZH_CN) return '简体中文';
  return value;
}

/**
 * Substitute `{name}` placeholders in a translated string. A placeholder with no
 * matching entry is left as it was written, so a caller that forgets a value
 * shows the gap rather than the word `undefined`.
 * @param {string} text - The text, possibly containing `{name}` placeholders.
 * @param {Record<string, string|number>} [params] - The values to substitute.
 * @returns {string} The text with every known placeholder replaced.
 * @private
 */
function interpolate(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    (Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match));
}

/**
 * Translate a key into the current locale.
 *
 * The catalogue for the current locale wins; failing that the English text
 * passed here, and failing that the key itself. The last case is a programming
 * error — but it is the one that still renders something, which matters in a
 * release build with no console.
 * @param {string} key - Stable key, e.g. `'settings.language'`.
 * @param {string} english - The English text, used verbatim when the current locale has no translation.
 * @param {Record<string, string|number>} [params] - Values for `{name}` placeholders in the text.
 * @returns {string} The localized string.
 */
export function t(key, english, params) {
  const catalogue = CATALOGUES[_locale];
  const text = (catalogue && catalogue[key]) || english || key;
  return interpolate(text, params);
}

/**
 * Adopt a language preference and, if the effective locale actually moved,
 * announce it so the UI re-renders.
 *
 * Applying without persisting is what the server-injected value, the settings
 * broadcast and the boot-time mirror read all want: they are told the language,
 * not asked to choose it.
 * @param {string} preference - The language preference to adopt.
 * @returns {void}
 */
export function applyLanguage(preference) {
  const next = resolveLocale(preference);
  const changed = next !== _locale;
  _preference = typeof preference === 'string' && preference ? preference : LANGUAGE_SYSTEM;
  _locale = next;
  // Keep the document's declared language in step — index.html sets it for the
  // first paint, and a change made at runtime has to follow.
  if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', next);
  if (changed) notifyPrefChanged(LANGUAGE_EVENT);
}

/**
 * Change the language and remember it for this person, in every project.
 * @param {string} preference - The language preference to store.
 * @returns {Promise<void>} Resolves once the choice has been sent to the server.
 */
export async function setLanguage(preference) {
  applyLanguage(preference);
  await setUserPref(LANGUAGE_PREF, preference);
}

/**
 * Bring the language up at boot: adopt the mirrored value synchronously, so the
 * first frame is already in the right language, then reconcile with the server —
 * which is authoritative and may know a choice this device has never seen. A
 * later change from any window arrives through the settings broadcast.
 * @returns {void}
 */
export function initLanguage() {
  const w = typeof window !== 'undefined' ? /** @type {any} */ (window) : null;
  // The server injected the stored choice into the page before it painted, and
  // index.html already resolved it into `__locale`; adopting rather than
  // re-deriving means the first frame and this module always agree.
  const injected = w && typeof w.__sessionLanguage === 'string' ? w.__sessionLanguage : '';
  const cached = injected || cachedUserPref(LANGUAGE_PREF, LANGUAGE_SYSTEM);
  applyLanguage(typeof cached === 'string' ? cached : LANGUAGE_SYSTEM);

  void reconcilePref('user', LANGUAGE_PREF, LANGUAGE_EVENT)
    .then((value) => applyLanguage(typeof value === 'string' ? value : LANGUAGE_SYSTEM))
    .catch(() => {
      /* unreachable realm — the mirrored value already applied stands */
    });

  onGlobalSettings((settings) => {
    const ui = settings && typeof settings === 'object' ? settings.ui : null;
    const value = ui && typeof ui === 'object' ? ui[LANGUAGE_PREF] : null;
    if (typeof value === 'string') applyLanguage(value);
  });
}
