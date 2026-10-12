//     ▄▄ ▄▄ ▄▄  ▄▄▄▄  ▄▄▄▄ ▄▄    ▄▄▄▄▄ ▄▄▄▄
//     ██ ██ ██ ██ ▄▄ ██ ▄▄ ██    ██▄▄  ██▄█▄   Copyright (c) 2026 Julian Storer
//   ▄▄█▀ ▀███▀ ▀███▀ ▀███▀ ██▄▄▄ ██▄▄▄ ██ ██   AGPL-3.0-or-later - see LICENSE

/**
 * The Appearance tab's language row, end to end.
 *
 * The row is the only place the language is chosen, and it has to do three
 * things at once: show the languages (with the "follow the system" entry
 * translated and the language names left as their own), write the choice, and
 * re-label itself the moment the choice takes effect. A row that failed to
 * re-label would look as though the choice had not applied, which is precisely
 * the bug this pins.
 * @module unit-tests/language-row-test
 */

import { assert } from '../utilities/test-helpers.js';

/**
 * @typedef {object} TestResult
 * @property {number} passed - Number of passed tests
 * @property {number} failed - Number of failed tests
 * @property {string[]} errors - Error messages for failed tests
 */

/**
 * Run language-row tests.
 * @param {object} _ctx - Test context (unused - the row is built from the DOM alone).
 * @returns {Promise<TestResult>} Aggregated test results
 */
export async function runTests(_ctx) {
  let passed = 0;
  let failed = 0;
  /** @type {string[]} */
  const errors = [];

  const { AppearanceTab } = await import('../../js/components/settings/appearance-tab.js');
  const { t, applyLanguage, getLanguage, LANGUAGE_EVENT, LANGUAGE_EN, LANGUAGE_ZH_CN, LANGUAGE_SYSTEM } =
    await import('../../js/i18n/index.js');

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

  /**
   * A host with the section the tab renders into.
   * @returns {HTMLElement} The host element.
   */
  const makeHost = () => {
    const host = document.createElement('div');
    host.innerHTML = '<div id="appearance-form"></div>';
    return host;
  };

  /**
   * The tab, rendered, plus its language select.
   * @returns {{tab: import('../../js/components/settings/appearance-tab.js').AppearanceTab, select: HTMLSelectElement}} The rendered tab and its language menu.
   */
  const rendered = () => {
    const tab = new AppearanceTab(makeHost());
    tab.render();
    const select = /** @type {HTMLSelectElement|null} */ (tab.host.querySelector('#appearance-language-select'));
    if (!select) throw new Error('the language row did not render a select');
    return { tab, select };
  };

  applyLanguage(LANGUAGE_EN);

  run('the row offers system, English and Chinese', () => {
    const { select } = rendered();
    const values = Array.from(select.options).map((o) => o.value);
    assert(values.includes(LANGUAGE_SYSTEM), 'a "follow the system" entry should be offered');
    assert(values.includes(LANGUAGE_EN), 'English should be offered');
    assert(values.includes(LANGUAGE_ZH_CN), 'Chinese should be offered');
  });

  run('the row starts on the current language', () => {
    applyLanguage(LANGUAGE_ZH_CN);
    const { select } = rendered();
    assert(select.value === LANGUAGE_ZH_CN,
      `the select should show the current language, got ${JSON.stringify(select.value)}`);
    applyLanguage(LANGUAGE_EN);
  });

  run('language names are their own, the system entry is translated', () => {
    applyLanguage(LANGUAGE_ZH_CN);
    const { select } = rendered();
    const labels = Object.fromEntries(Array.from(select.options).map((o) => [o.value, o.textContent]));
    assert(labels[LANGUAGE_EN] === 'English',
      'a language name must not be translated into another language');
    assert(labels[LANGUAGE_ZH_CN] === '简体中文', 'Chinese must be named in Chinese');
    assert(labels[LANGUAGE_SYSTEM] === t('System'),
      'the "follow the system" entry should be translated');
    assert(/[\u4e00-\u9fff]/.test(labels[LANGUAGE_SYSTEM]),
      'in Chinese the system entry should read Chinese');
    applyLanguage(LANGUAGE_EN);
  });

  run('a language change re-labels the row without rebuilding it', () => {
    applyLanguage(LANGUAGE_EN);
    const { select } = rendered();
    const rowName = /** @type {HTMLElement} */ (select.closest('.settings-group')?.querySelector('.provider-name'));
    assert(rowName.textContent === t('Language'), 'the row title starts in English');

    applyLanguage(LANGUAGE_ZH_CN);
    document.dispatchEvent(new Event(LANGUAGE_EVENT));

    assert(rowName.textContent === t('Language') && /[\u4e00-\u9fff]/.test(rowName.textContent),
      `the row title should be Chinese after the change, got ${JSON.stringify(rowName.textContent)}`);
    const systemLabel = Array.from(select.options).find((o) => o.value === LANGUAGE_SYSTEM)?.textContent;
    assert(/[\u4e00-\u9fff]/.test(systemLabel || ''),
      'the system entry should be Chinese after the change');
    applyLanguage(LANGUAGE_EN);
  });

  run('dispose stops re-labelling', () => {
    applyLanguage(LANGUAGE_EN);
    const { tab, select } = rendered();
    tab.dispose();
    const rowName = /** @type {HTMLElement} */ (select.closest('.settings-group')?.querySelector('.provider-name'));
    const before = rowName.textContent;
    applyLanguage(LANGUAGE_ZH_CN);
    document.dispatchEvent(new Event(LANGUAGE_EVENT));
    const after = rowName.textContent;
    assert(before === after, 'a disposed tab must not keep re-rendering');
    applyLanguage(LANGUAGE_EN);
  });

  run('the choice is what getLanguage reports', () => {
    applyLanguage(LANGUAGE_EN);
    assert(getLanguage() === LANGUAGE_EN, 'English should be the reported language');
    applyLanguage(LANGUAGE_ZH_CN);
    assert(getLanguage() === LANGUAGE_ZH_CN, 'Chinese should be the reported language');
    applyLanguage(LANGUAGE_EN);
  });

  applyLanguage(LANGUAGE_EN);
  return { passed, failed, errors };
}
