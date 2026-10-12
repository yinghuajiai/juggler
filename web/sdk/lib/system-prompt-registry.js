//     ▄▄ ▄▄ ▄▄  ▄▄▄▄  ▄▄▄▄ ▄▄    ▄▄▄▄▄ ▄▄▄▄
//     ██ ██ ██ ██ ▄▄ ██ ▄▄ ██    ██▄▄  ██▄█▄   Copyright (c) 2026 Julian Storer
//   ▄▄█▀ ▀███▀ ▀███▀ ▀███▀ ██▄▄▄ ██▄▄▄ ██ ██   Apache-2.0 - see LICENSE
// SPDX-License-Identifier: Apache-2.0

/**
 * System-prompt preset registry — the single in-memory catalog of prompt
 * presets (built-ins shipped here, plus the user's saved presets merged in at
 * runtime). It lives in core (not the juggler-core extension) so that core
 * seeding/UI can depend on it without a core→extension import; the extension's
 * system-prompt context item depends on core, which is the allowed direction.
 *
 * Module singleton: there is exactly one preset catalog app-wide and `import` is
 * the discovery mechanism (see the frontend-service-style note in CLAUDE.md).
 *
 * The shipped presets are bilingual: each carries the English prompt and its
 * Chinese counterpart, and the one matching the interface language is chosen
 * when the preset is read. The text is kept here rather than in the viewer's
 * translation catalogue for a structural reason — this module is loaded by the
 * **engine** as well as the viewer, and the engine page has no access to the
 * viewer's UI tree. The language reaches it as a server-baked global.
 * @module services/system-prompt-registry
 */

/**
 * Whether the interface is being shown in Chinese, from the language the server
 * baked into the page. Read at access time rather than captured, so a preset
 * reflects a language changed after the registry was populated. Absent in any
 * context that never sets it (a unit test, the Node engine host), which reads as
 * English — the source language.
 * @returns {boolean} True when the language is Chinese.
 */
function isChinese() {
  if (typeof window === 'undefined') return false;
  const language = /** @type {any} */ (window).__jugglerLanguage;
  return typeof language === 'string' && /^zh/i.test(language);
}

/**
 * @typedef {object} SystemPromptPreset
 * @property {string} id - Unique preset identifier (kebab-case)
 * @property {string} name - Display name
 * @property {string} version - Semantic version
 * @property {string} description - Short description
 * @property {string} content - Full prompt body (identity + working guidance, no env block)
 * @property {string} category - Category: "general", "specialized", or "user"
 * @property {boolean} [builtin] - True for shipped presets; false/absent for user-saved ones
 */

/** The id of the built-in preset used as the universal fallback. */
export const BUILTIN_DEFAULT_ID = 'default';

class SystemPromptRegistry {
  constructor() {
    // Insertion-ordered: built-ins register first (in declaration order), then
    // user presets are appended. Categories and per-category lists are derived
    // from this map on demand so removing a user preset needs no bookkeeping.
    /** @type {Map<string, SystemPromptPreset>} @private */
    this._presets = new Map();
  }

  /**
   * Register a preset (built-in or user).
   * @param {SystemPromptPreset} preset - Preset to register
   * @returns {Promise<void>}
   */
  async register(preset) {
    if (!preset.id || !preset.name || !preset.content || !preset.category) {
      throw new Error('Invalid preset: missing required fields (id, name, content, category)');
    }
    this._presets.set(preset.id, preset);
  }

  /**
   * Get a preset by ID
   * @param {string} id - Preset ID
   * @returns {SystemPromptPreset|undefined} Preset if found
   */
  getPreset(id) {
    return this._presets.get(id);
  }

  /**
   * Get all registered presets
   * @returns {SystemPromptPreset[]} Array of all presets
   */
  getAllPresets() {
    return Array.from(this._presets.values());
  }

  /**
   * Get presets by category
   * @param {string} category - Category name
   * @returns {SystemPromptPreset[]} Presets in that category
   */
  getPresetsByCategory(category) {
    const c = category.toLowerCase();
    return this.getAllPresets().filter(p => (p.category || '').toLowerCase() === c);
  }

  /**
   * Get all categories in first-seen order.
   * @returns {string[]} Category names
   */
  getCategories() {
    /** @type {string[]} */
    const seen = [];
    for (const p of this._presets.values()) {
      const c = (p.category || '').toLowerCase();
      if (c && !seen.includes(c)) seen.push(c);
    }
    return seen;
  }

  /**
   * Replace all user (non-built-in) presets with the given list, leaving the
   * built-in presets untouched. Called after fetching the user's presets from
   * the server so the registry reflects the latest saved set. User presets are
   * filed under the `user` category and marked `builtin: false`.
   * @param {Array<{id: string, name: string, content: string}>} presets - User presets from the server
   */
  setUserPresets(presets) {
    for (const [id, p] of [...this._presets]) {
      if (!p.builtin) this._presets.delete(id);
    }
    for (const p of (Array.isArray(presets) ? presets : [])) {
      if (!p || !p.id || !p.name || !p.content) continue;
      this._presets.set(p.id, {
        id: p.id,
        name: p.name,
        content: p.content,
        version: '1.0.0',
        description: 'User-saved preset',
        category: 'user',
        builtin: false
      });
    }
  }
}

const systemPromptRegistry = new SystemPromptRegistry();

/**
 * Neutral, opinion-free working guidance shared by the general-purpose built-in
 * presets. It describes how Juggler operates (the tool loop, code handling, code
 * references) in factual terms that apply to any user and any project — no tone,
 * persona, or workflow preferences. Persona/tone choices belong to whoever
 * writes a custom preset, not to the shipped defaults.
 * @type {string}
 */
const GLOBAL_GUIDANCE =
  '## Responses\n' +
  '- Reply in plain text, Markdown, HTML, or Markdown containing HTML, as best suits the response.\n' +
  '- That covers your reply only. Strings you pass as tool arguments are plain text — never HTML-escape them.\n\n' +
  '## Code\n' +
	'- Match the existing patterns, naming, and formatting of the surrounding code.\n' +
	'- Read the relevant code before changing it.\n' +
	'- When a tool call fails, read the error and adjust your approach.\n\n' +
  '## Code references\n' +
	'Refer to code locations as `file_path:line_number`.';

/**
 * The Chinese counterpart of {@link GLOBAL_GUIDANCE}, used when the interface
 * is Chinese. Code identifiers and the `file_path:line_number` convention are
 * left as written — the model is told to use them verbatim.
 * @type {string}
 */
const GLOBAL_GUIDANCE_ZH =
  '## 回复\n' +
  '- 用纯文本、Markdown、HTML 或包含 HTML 的 Markdown 回复，选择最适合该回复的形式。\n' +
  '- 这只针对你的回复本身。作为工具参数传入的字符串是纯文本——绝不要对它们做 HTML 转义。\n\n' +
  '## 代码\n' +
	'- 与周围代码的既有模式、命名和格式保持一致。\n' +
	'- 修改代码前先阅读相关代码。\n' +
	'- 工具调用失败时，阅读错误信息并调整做法。\n\n' +
	'## 代码引用\n' +
	'用 `file_path:line_number` 的形式引用代码位置。';

/**
 * One built-in preset, in both languages. `name` and `description` are what the
 * preset picker shows; `content` is the prompt body the model receives.
 * @typedef {object} BilingualPreset
 * @property {string} id - Unique preset identifier (kebab-case)
 * @property {string} category - Category: "general" or "specialized"
 * @property {string} version - Semantic version
 * @property {string} name - English display name
 * @property {string} nameZh - Chinese display name
 * @property {string} description - English description
 * @property {string} descriptionZh - Chinese description
 * @property {string} content - English prompt body
 * @property {string} contentZh - Chinese prompt body
 */

/** @type {BilingualPreset[]} */
const BUILTIN_PRESETS = [
  {
    id: 'default',
    version: '2.0.0',
    category: 'general',
    name: 'Default',
    nameZh: '默认',
    description: 'General-purpose coding assistant with neutral working guidance',
    descriptionZh: '通用编码助手，附带中性的工作指引',
    content: 'You are Juggler, an AI coding assistant.\n\n' + GLOBAL_GUIDANCE,
    contentZh: '你是 Juggler，一个 AI 编码助手。\n\n' + GLOBAL_GUIDANCE_ZH
  },
  {
    id: 'minimal',
    version: '2.0.0',
    category: 'general',
    name: 'Minimal',
    nameZh: '极简',
    description: 'Just the role — no added guidance',
    descriptionZh: '只保留角色设定——不附加任何指引',
    content: 'You are Juggler, a coding assistant.',
    contentZh: '你是 Juggler，一个编码助手。'
  },
  {
    id: 'code-reviewer',
    version: '2.0.0',
    category: 'specialized',
    name: 'Code Reviewer',
    nameZh: '代码审查',
    description: 'Review-focused: examines changes for correctness, edge cases, and clarity',
    descriptionZh: '以审查为核心：检查改动的正确性、边界情况与清晰度',
    content:
			'You are Juggler, an AI coding assistant focused on reviewing code. Examine changes for ' +
			'correctness, edge cases, and clarity, and explain the reasoning behind each point you raise.\n\n' +
			GLOBAL_GUIDANCE,
    contentZh:
			'你是 Juggler，一个专注于代码审查的 AI 编码助手。检查改动的正确性、边界情况和清晰度，' +
			'并解释你提出的每一点背后的理由。\n\n' +
			GLOBAL_GUIDANCE_ZH
  }
];

/**
 * Flatten a bilingual preset into the single-language shape the registry stores,
 * for the language in use now.
 * @param {BilingualPreset} p - The bilingual definition.
 * @returns {SystemPromptPreset} The preset in the current language.
 */
function localise(p) {
  const zh = isChinese();
  return {
    id: p.id,
    version: p.version,
    category: p.category,
    builtin: true,
    name: zh ? p.nameZh : p.name,
    description: zh ? p.descriptionZh : p.description,
    content: zh ? p.contentZh : p.content
  };
}

for (const preset of BUILTIN_PRESETS) {
  systemPromptRegistry.register(localise(preset));
}

/**
 * Re-register every built-in preset in the language now in use. Called when the
 * language changes: a preset already registered (and possibly already displayed,
 * or already seeded into a conversation) is otherwise frozen in the language it
 * was read in. User-saved presets are left alone — their text is the user's.
 * @returns {void}
 */
export function relocaliseBuiltinPresets() {
  for (const preset of BUILTIN_PRESETS) {
    systemPromptRegistry.register(localise(preset));
  }
}

/**
 * Get the built-in default preset's content — the universal fallback prompt body
 * used when a conversation has no stored prompt text. Available in every context
 * (including the engine) because the built-ins register at module load.
 * @returns {string} Default prompt body (no env block)
 */
export function getDefaultIdentityText() {
  const preset = systemPromptRegistry.getPreset(BUILTIN_DEFAULT_ID);
  // A user preset may share the id only if it was saved under one, which the
  // registry refuses; so this is always a built-in and always re-derivable.
  const bilingual = BUILTIN_PRESETS.find((p) => p.id === BUILTIN_DEFAULT_ID);
  if (bilingual) return localise(bilingual).content;
  return preset ? preset.content : '';
}

export { systemPromptRegistry, SystemPromptRegistry, GLOBAL_GUIDANCE };
