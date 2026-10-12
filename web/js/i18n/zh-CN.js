//     ▄▄ ▄▄ ▄▄  ▄▄▄▄  ▄▄▄▄ ▄▄    ▄▄▄▄▄ ▄▄▄▄
//     ██ ██ ██ ██ ▄▄ ██ ▄▄ ██    ██▄▄  ██▄█▄   Copyright (c) 2026 Julian Storer
//   ▄▄█▀ ▀███▀ ▀███▀ ▀███▀ ██▄▄▄ ██▄▄▄ ██ ██   AGPL-3.0-or-later - see LICENSE

/**
 * Simplified Chinese catalogue.
 *
 * Every key here must also exist as an English literal at a `t(key, 'English')`
 * call site — the English is the fallback, and the key is what the call site and
 * this table agree on. `locale-coverage-test` holds the two catalogues to the
 * same key set, so a translation added in one language and forgotten in another
 * fails the suite rather than silently falling back.
 * @module i18n/zh-CN
 */

/** @type {Record<string, string>} */
export const zhCN = {
  // Settings — Appearance tab
  'settings.language': '语言',
  'settings.language.description': '选择界面显示的语言。',
  'settings.language.system': '跟随系统'
};
