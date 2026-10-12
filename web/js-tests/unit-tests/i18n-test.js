//     ▄▄ ▄▄ ▄▄  ▄▄▄▄  ▄▄▄▄ ▄▄    ▄▄▄▄▄ ▄▄▄▄
//     ██ ██ ██ ██ ▄▄ ██ ▄▄ ██    ██▄▄  ██▄█▄   Copyright (c) 2026 Julian Storer
//   ▄▄█▀ ▀███▀ ▀███▀ ▀███▀ ██▄▄▄ ██▄▄▄ ██ ██   AGPL-3.0-or-later - see LICENSE

/**
 * i18n layer tests.
 *
 * The layer's whole premise is that English is the fallback, so the cases that
 * matter are the ones where a translation is absent or incomplete: an untouched
 * key must render its English literal byte for byte, or the untranslated UI —
 * and every existing assertion about it — changes out from under the app. The
 * remainder covers what a translation adds: a catalogue override, placeholder
 * substitution, the locale a preference resolves to, and the announcement that
 * tells the UI to re-render.
 * @module unit-tests/i18n-test
 */

import { assert } from '../utilities/test-helpers.js';

/**
 * @typedef {object} TestResult
 * @property {number} passed - Number of passed tests
 * @property {number} failed - Number of failed tests
 * @property {string[]} errors - Error messages for failed tests
 */

/**
 * Run i18n tests.
 * @param {object} _ctx - Test context (unused - no fixtures needed).
 * @returns {Promise<TestResult>} Aggregated test results
 */
export async function runTests(_ctx) {
  let passed = 0;
  let failed = 0;
  /** @type {string[]} */
  const errors = [];

  const i18n = await import('../../js/i18n/index.js');
  const { t, setLanguage, applyLanguage, getLocale, getLanguage, resolveLocale,
    languageLabel, LANGUAGES, LANGUAGE_EVENT, LANGUAGE_EN, LANGUAGE_ZH_CN,
    LANGUAGE_SYSTEM } = i18n;

  /**
   * @param {string} label - Case name
   * @param {() => void} fn - Case body
   */
  const run = (label, fn) => {
    try {
      fn();
      passed++;
    } catch (e) {
      failed++;
      errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Every case starts from English and leaves it that way, so one case's
  // language choice cannot change what the next asserts on.
  applyLanguage(LANGUAGE_EN);

  run('an untranslated key renders its English literal unchanged', () => {
    assert(t('some.untouched.key', 'Hello world') === 'Hello world',
      'a key with no translation must render its English text verbatim');
  });

  run('English is used even when a catalogue would override it', () => {
    applyLanguage(LANGUAGE_EN);
    assert(t('settings.language', 'Language') === 'Language',
      'the English locale must not read the Chinese catalogue');
  });

  run('a translated key renders the catalogue text', () => {
    applyLanguage(LANGUAGE_ZH_CN);
    assert(t('settings.language', 'Language') === '语言',
      'zh-CN must read its own catalogue');
    assert(t('settings.language.system', 'System') === '跟随系统',
      'zh-CN must read its own catalogue for every key');
  });

  run('switching language changes what t() returns', () => {
    applyLanguage(LANGUAGE_EN);
    const before = t('settings.language', 'Language');
    applyLanguage(LANGUAGE_ZH_CN);
    const after = t('settings.language', 'Language');
    applyLanguage(LANGUAGE_EN);
    assert(before !== after, `t() did not change with the language (${before})`);
  });

  run('a key missing from the catalogue falls back to English', () => {
    applyLanguage(LANGUAGE_ZH_CN);
    assert(t('settings.language.description', 'Choose the language of the interface.') === '选择界面显示的语言。',
      'a translated key should still come from the catalogue');
    assert(t('a.key.with.no.translation', 'Untranslated') === 'Untranslated',
      'a key the catalogue lacks must fall back to its English text');
    applyLanguage(LANGUAGE_EN);
  });

  run('params are substituted into the text', () => {
    assert(t('greeting', 'Hello, {name}!', { name: 'Ada' }) === 'Hello, Ada!',
      'a named placeholder should be replaced');
    assert(t('count', '{n} of {total}', { n: 2, total: 5 }) === '2 of 5',
      'every placeholder should be replaced');
  });

  run('a placeholder with no value is left as written', () => {
    assert(t('greeting', 'Hello, {name}!', {}) === 'Hello, {name}!',
      'a missing value must leave the placeholder rather than print undefined');
    assert(t('greeting', 'Hello, {name}!') === 'Hello, {name}!',
      'omitting params entirely must leave the text alone');
  });

  run('an unknown key with no English renders the key', () => {
    assert(t('only.a.key') === 'only.a.key',
      'with neither a catalogue entry nor English, the key is the last resort');
  });

  run('a preference resolves to a locale', () => {
    assert(resolveLocale(LANGUAGE_ZH_CN) === LANGUAGE_ZH_CN, 'zh-CN resolves to itself');
    assert(resolveLocale(LANGUAGE_EN) === LANGUAGE_EN, 'en resolves to itself');
    assert([LANGUAGE_EN, LANGUAGE_ZH_CN].includes(resolveLocale(LANGUAGE_SYSTEM)),
      'system resolves to a concrete locale');
    assert(resolveLocale('nonsense') === resolveLocale(LANGUAGE_SYSTEM),
      'an unrecognised preference is treated as system, never as a bad locale');
  });

  run('a language choice announces itself exactly when the locale moves', () => {
    /** @type {number} */
    let announcements = 0;
    const onChanged = () => { announcements++; };
    window.addEventListener(LANGUAGE_EVENT, onChanged);
    try {
      applyLanguage(LANGUAGE_ZH_CN);
      assert(announcements === 1, `moving to zh-CN should announce once (got ${announcements})`);
      applyLanguage(LANGUAGE_ZH_CN);
      assert(announcements === 1, 're-applying the same locale must not announce again');
      applyLanguage(LANGUAGE_EN);
      assert(announcements === 2, 'moving back to English should announce again');
    } finally {
      window.removeEventListener(LANGUAGE_EVENT, onChanged);
    }
  });

  run('every offered language has a label and a locale', () => {
    assert(LANGUAGES.length >= 3, 'the menu should offer at least system, English and Chinese');
    for (const { value } of LANGUAGES) {
      assert(typeof languageLabel(value) === 'string' && languageLabel(value).length > 0,
        `language ${value} has no label`);
      assert([LANGUAGE_EN, LANGUAGE_ZH_CN].includes(resolveLocale(value)),
        `language ${value} does not resolve to a usable locale`);
    }
  });

  run('English is the starting state for other suites', () => {
    applyLanguage(LANGUAGE_EN);
    assert(getLanguage() === LANGUAGE_EN && getLocale() === LANGUAGE_EN,
      'this suite must leave the app in English for whatever runs next');
  });

  void setLanguage; // exercised by the settings row, which needs a server

  return { passed, failed, errors };
}
