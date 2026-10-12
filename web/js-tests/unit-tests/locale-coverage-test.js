//     ▄▄ ▄▄ ▄▄  ▄▄▄▄  ▄▄▄▄ ▄▄    ▄▄▄▄▄ ▄▄▄▄
//     ██ ██ ██ ██ ▄▄ ██ ▄▄ ██    ██▄▄  ██▄█▄   Copyright (c) 2026 Julian Storer
//   ▄▄█▀ ▀███▀ ▀███▀ ▀███▀ ██▄▄▄ ██▄▄▄ ██ ██   AGPL-3.0-or-later - see LICENSE

/**
 * Drift guard between the Chinese catalogue and the interface.
 *
 * The catalogue is keyed by the English source text, so the two ways it can go
 * wrong are both silent: a chunk that failed to translate leaves English under a
 * Chinese key, and an English rewording orphans an entry that nothing looks up
 * any more. Neither shows up as a missing string — the first reads as English,
 * the second is simply never reached — so nothing else in the suite would say a
 * word. A third failure is a truncation: a catalogue that lost most of its
 * entries still translates the handful a test happens to check.
 *
 * What cannot be checked here is that every *call site* has an entry, because
 * English is the fallback by design — an absent entry is a legitimate, readable
 * screen, not a fault. So the invariant is the other direction: every entry must
 * be a real translation, and the catalogue must be the size it is meant to be.
 * @module unit-tests/locale-coverage-test
 */

import { assert } from '../utilities/test-helpers.js';

/**
 * @typedef {object} TestResult
 * @property {number} passed - Number of passed tests
 * @property {number} failed - Number of failed tests
 * @property {string[]} errors - Error messages for failed tests
 */

/**
 * Values that are legitimately the same in both languages: command lines, paths,
 * product names, key bindings, single symbols. Listed rather than pattern-matched
 * so a new one is a deliberate addition, and so a translated string that
 * accidentally reads as identity here is caught.
 * @type {Set<string>}
 */
const IDENTITY = new Set([
  '...', '.juggler/skills', 'Acme Gateway', 'Alt+ArrowLeft Alt+ArrowRight',
  'Claude Code', 'GitHub Copilot', 'Knock Knock', 'Page Down', 'Page Up',
  'Pixie Dust', 'Pure Tone', 'Query Code', 'X-Tenant', '👁',
  'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
  'curl -fsSL https://claude.ai/install.sh | bash',
  'git add -A', 'git config -f .gitmodules --list',
  'git rev-parse --abbrev-ref HEAD', 'git rev-parse --git-dir',
  'git rev-parse --short HEAD', 'git status --porcelain',
  'git worktree list --porcelain',
  'github.com or your-tenant.ghe.com',
  'irm https://claude.ai/install.ps1 | iex',
  'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"',
  'spin 0.6s ease-in-out', '~/.agents/skills', '~/.juggler/skills',
]);

/** The interface has this many strings; a catalogue far below it is truncated. */
const MIN_ENTRIES = 1400;

/** A language name, a setting and a description, so the checks span categories. */
const SAMPLES = [
  'Language',
  'System',
  'Choose the language the interface is shown in.',
  'Settings',
  'Cancel',
  'Delete',
  'Save',
  'Close',
];

/**
 * Run locale coverage tests.
 * @param {object} _ctx - Test context (unused - no fixtures needed).
 * @returns {Promise<TestResult>} Aggregated test results
 */
export async function runTests(_ctx) {
  let passed = 0;
  let failed = 0;
  /** @type {string[]} */
  const errors = [];

  const { zhCN } = await import('../../js/i18n/zh-CN.js');
  const { t, applyLanguage, LANGUAGE_EN, LANGUAGE_ZH_CN } = await import('../../js/i18n/index.js');

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

  applyLanguage(LANGUAGE_EN);
  const keys = Object.keys(zhCN);

  run('the catalogue is the size the interface needs', () => {
    assert(keys.length >= MIN_ENTRIES,
      `the Chinese catalogue has ${keys.length} entries, expected at least ${MIN_ENTRIES} — a chunk has been lost`);
  });

  run('no entry is empty or non-string', () => {
    const bad = keys.filter((k) => typeof zhCN[k] !== 'string' || zhCN[k].trim() === '');
    assert(bad.length === 0, `empty or non-string entries: ${bad.slice(0, 5).join(' | ')}`);
  });

  run('every key is a non-trivial string', () => {
    const bad = keys.filter((k) => typeof k !== 'string' || k.trim() === '');
    assert(bad.length === 0, `${bad.length} keys are empty`);
  });

  run('every entry translates except the known identity strings', () => {
    const untranslated = keys.filter((k) => zhCN[k] === k && !IDENTITY.has(k));
    assert(untranslated.length === 0,
      `${untranslated.length} entries are unchanged English, e.g. ${untranslated.slice(0, 3).map((s) => JSON.stringify(s)).join(', ')}`);
  });

  run('the identity list has no stale entries', () => {
    const stale = [...IDENTITY].filter((k) => !(k in zhCN));
    assert(stale.length === 0,
      `identity entries the catalogue no longer carries: ${stale.slice(0, 5).join(' | ')}`);
  });

  run('the sampled strings translate to Chinese', () => {
    applyLanguage(LANGUAGE_ZH_CN);
    const missed = [];
    for (const message of SAMPLES) {
      const translated = t(message);
      if (translated === message || !/[\u4e00-\u9fff]/.test(translated)) missed.push(message);
    }
    assert(missed.length === 0, `these samples did not translate: ${missed.join(' | ')}`);
  });

  run('every sampled string is unchanged in English', () => {
    applyLanguage(LANGUAGE_EN);
    const changed = SAMPLES.filter((m) => t(m) !== m);
    assert(changed.length === 0, `English rendering changed for: ${changed.join(' | ')}`);
  });

  run('a message with no entry still renders its English', () => {
    applyLanguage(LANGUAGE_ZH_CN);
    const absent = 'A message that exists in no catalogue whatsoever';
    assert(t(absent) === absent, 'an untranslated message must fall back to English verbatim');
    applyLanguage(LANGUAGE_EN);
  });

  // Leave the app English for whatever runs after this suite.
  applyLanguage(LANGUAGE_EN);

  return { passed, failed, errors };
}
