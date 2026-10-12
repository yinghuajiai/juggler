//     ▄▄ ▄▄ ▄▄  ▄▄▄▄  ▄▄▄▄ ▄▄    ▄▄▄▄▄ ▄▄▄▄
//     ██ ██ ██ ██ ▄▄ ██ ▄▄ ██    ██▄▄  ██▄█▄   Copyright (c) 2026 Julian Storer
//   ▄▄█▀ ▀███▀ ▀███▀ ▀███▀ ██▄▄▄ ██▄▄▄ ██ ██   AGPL-3.0-or-later - see LICENSE

/**
 * Simplified Chinese catalogue.
 *
 * Keyed by the **English source text**, which is also the fallback a call site
 * passes to `t()`. So each key here is a string that literally appears in the
 * source, and a key that no longer appears there is a translation orphaned by
 * an English rewording — `locale-coverage-test` fails on one rather than
 * letting it sit unread.
 *
 * Untranslated English is simply absent: nothing needs an entry that is the
 * same in both languages.
 * @module i18n/zh-CN
 */

/** @type {Record<string, string>} */
export const zhCN = {
  // Settings — Appearance tab
  'Language': '语言',
  'Choose the language the interface is shown in.': '选择界面显示的语言。',
  'System': '跟随系统'
};
