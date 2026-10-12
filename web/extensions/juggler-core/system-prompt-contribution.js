//     ▄▄ ▄▄ ▄▄  ▄▄▄▄  ▄▄▄▄ ▄▄    ▄▄▄▄▄ ▄▄▄▄
//     ██ ██ ██ ██ ▄▄ ██ ▄▄ ██    ██▄▄  ██▄█▄   Copyright (c) 2026 Julian Storer
//   ▄▄█▀ ▀███▀ ▀███▀ ▀███▀ ██▄▄▄ ██▄▄▄ ██ ██   Apache-2.0 - see LICENSE
// SPDX-License-Identifier: Apache-2.0

/**
 * Juggler Core's system-prompt contribution.
 *
 * Scope: ONLY per-tool usage guidance, each section gated on the plugin that
 * provides the tool (`has(id)`), so the prompt never advertises a tool the user
 * has disabled. This is factual "how to drive these specific tools" text — not
 * persona, tone, or general working style. Tool-independent, opinion-free
 * guidance (identity, working loop, code quality, code references) lives in the
 * editable system-prompt presets instead, where the user can see and change it.
 *
 * The default export is a PURE function of the enabled-plugin set, so its output
 * is cache-stable across turns and strategy changes — it belongs in the cached
 * system-prompt anchor, not the per-turn message stream. Keep additions terse:
 * this text is a permanent resident of every turn's context, billed at the
 * cache-read rate.
 *
 * Every line is written in both languages, English first, and {@link E} chooses
 * between them. Keeping the pair side by side is what makes the prompt readable
 * as a prompt — a translation pulled out into a string table would put the
 * English it translates an arm's length away from it. The language is the one
 * the server baked into the page, because this code also runs in the engine,
 * which has no access to the viewer's preferences.
 * @module juggler-core/system-prompt-contribution
 */

/**
 * Whether the interface is being shown in Chinese, from the language the server
 * baked into the page. Absent in any context that never sets it (a unit test,
 * the Node engine host), which reads as English — the source language.
 * @returns {boolean} True when the language is Chinese.
 */
function isChinese() {
  if (typeof window === 'undefined') return false;
  const language = /** @type {any} */ (window).__jugglerLanguage;
  return typeof language === 'string' && /^zh/i.test(language);
}

/**
 * Choose the line for the current interface language. A missing Chinese line
 * falls back to the English, so a line that has no Chinese — a bare tool name,
 * say — needs only the English.
 * @param {string} en - The English text.
 * @param {string} [zh] - The Chinese text.
 * @returns {string} The text for the language in use.
 */
function E(en, zh) {
  return isChinese() && zh ? zh : en;
}

/**
 * Build Juggler Core's contribution to the system prompt.
 * @param {object} args
 * @param {string[]} args.enabledPluginIds - Capability ids currently enabled
 *   (catalog minus the disabled set). Sections gate on membership.
 * @returns {string} Guidance text (possibly empty), sections separated by blank lines
 */
export default function systemPromptContribution({ enabledPluginIds }) {
  const ids = Array.isArray(enabledPluginIds) ? enabledPluginIds : [];
  const has = (/** @type {string} */ id) => ids.includes(id);

  // Tool Usage — one parent section; each subsection gates on its plugin so
  // the prompt never advertises a tool the user has disabled. Everything here
  // is per-tool guidance; general working style lives in the prompt presets.
  /** @type {string[]} */
  const toolUsage = [];

  // Prefer specialized tools over shelling out to bash.
  /** @type {string[]} */
  const preferLines = [];
  if (has('read-file')) {
    preferLines.push(E('- **read** for reading files (not cat/head/tail)',
      '- 读取文件用 **read**（不要用 cat/head/tail）'));
  }
  if (has('write-file')) {
    preferLines.push(E('- **write** for creating files (not echo/cat)',
      '- 创建文件用 **write**（不要用 echo/cat）'));
  }
  if (has('replace-text')) {
    preferLines.push(E('- **edit** for editing files (not sed/awk)',
      '- 编辑文件用 **edit**（不要用 sed/awk）'));
  }
  if (has('search')) {
    preferLines.push(E('- **grep** for searching file contents (not grep/rg in bash)',
      '- 搜索文件内容用 **grep**（不要在 bash 里用 grep/rg）'));
  }
  if (has('glob')) {
    preferLines.push(E('- **glob** for finding files by name (not find/ls)',
      '- 按文件名查找用 **glob**（不要用 find/ls）'));
  }
  if (preferLines.length > 0) {
    const lead = has('execute')
      ? E('### Prefer specialized tools over bash\nUse the dedicated tool instead of shelling out for the same job:',
        '### 优先使用专用工具而非 bash\n同样的任务，用专用工具，而不是调起 shell 来做：')
      : E('### Specialized tools', '### 专用工具');
    toolUsage.push(lead + '\n' + preferLines.join('\n'));
  }

  // Batching — only meaningful when more than one tool can run; describes how to
  // issue tool calls, so it is per-tool guidance rather than general style.
  /** @type {string[]} */
  const batchLines = [
    E('- Call multiple independent tools in parallel', '- 并行调用多个相互独立的工具'),
    E('- Read files before editing to understand current state', '- 修改前先读文件，了解当前状态')
  ];
  if (has('batch')) {
    batchLines.push(E('- Prefer batch_read / batch_grep when reading or searching several files at once',
      '- 一次要读取或搜索多个文件时，优先用 batch_read / batch_grep'));
  }
  toolUsage.push(E('### Tool Batching', '### 批量调用工具') + '\n' + batchLines.join('\n'));

  // Context economy — every tool whose point is doing work without putting it
  // in the transcript, explained once and side by side, because the choice
  // between them (a script vs. a sub-agent) is what the model gets wrong when
  // each is described alone. Each line gates on its own plugin.
  /** @type {string[]} */
  const economyLines = [];
  if (has('explore-code')) {
    economyLines.push(
      E('- **`query_code`** — use it instead of making several read/grep/glob calls. Only what the script ' +
      'returns comes back.',
      '- **`query_code`** —— 用它来代替多次 read/grep/glob 调用。只有脚本返回的内容会进入上下文。')
    );
  }
  if (has('explore-agent')) {
    economyLines.push(
      E('- **Judgement about this codebase → `Explore`.** An open question that needs reading and weighing ' +
      '("how does auth work here"). A read-only sub-agent investigates and returns only what it found.',
      '- **需要对该代码库做判断 → `Explore`。** 一个需要阅读和权衡的开放性问题（例如“这里的鉴权是怎么工作的”）。\n' +
      '  只读的子代理会去调查，并且只返回它查到的内容。')
    );
  }
  if (has('research-agent')) {
    economyLines.push(
      E('- **Judgement from the web → `Research`.** A question that takes several sources. A sub-agent ' +
      'searches and reads; only the answer returns.',
      '- **需要从网上获取判断 → `Research`。** 一个需要多个来源的问题。子代理会去搜索和阅读，只返回答案。')
    );
  }
  if (has('web-fetch')) {
    economyLines.push(
      E('- **One fact from one large page → `WebFetch` with a `prompt`.** Omit `prompt` to read the page yourself.',
        '- **从一个大页面里取一个事实 → 用带 `prompt` 的 `WebFetch`。** 省略 `prompt` 则把整个页面读进来。')
    );
  }
  if (has('thread')) {
    economyLines.push(
      E('- **A self-contained sub-task → `create_thread`.** It runs in isolation and only its final summary ' +
      'returns. Give `goal` only a very short user-facing label. Put the complete self-contained task and ' +
      'context in `prompt`, and the required contents and shape of the final answer in `resultSpec`. Give each ' +
      'thread one task — never a task list, and never tell it to spawn further threads; run multiple tasks as ' +
      'separate threads yourself.',
      '- **一个自成体系的子任务 → `create_thread`。** 它独立运行，只返回最终的总结。\n' +
      '  `goal` 只填一个很短的、面向用户的标签。把完整且自包含的任务和上下文放进 `prompt`，' +
      '把最终答案应有的内容和形式写进 `resultSpec`。每个线程只给一个任务——不要给任务清单，' +
      '也不要让它再去开子线程；多个任务由你自己开多个线程来做。')
    );
  }
  if (economyLines.length > 0) {
    let economy = E('### Keeping intermediate work out of context\n' +
      'These tools do work whose intermediate steps never enter this conversation — only the result does. ' +
      'Choose by what the work needs:\n',
    '### 让中间过程不进入上下文\n' +
      '这些工具所做工作的中间步骤永远不会进入本会话——只会进入结果。按工作需要来选择：\n') + economyLines.join('\n');
    if (has('explore-code') && (has('explore-agent') || has('research-agent') || has('thread'))) {
      economy += E('\nPrefer `query_code` over a sub-agent when a script can answer it.',
        '\n如果一段脚本就能回答，优先用 `query_code` 而不是子代理。');
    }
    toolUsage.push(economy);
  }

  if (has('new-conversation')) {
    toolUsage.push(
      E('### Spinning off a separate line of work — use new_conversation\n' +
        'When the user asks for a **new conversation, a new tab, or a new chat** (all the same thing), or you ' +
        'want to start a fresh, independent line of work that does not belong in this conversation, call ' +
        '`new_conversation` with the initial `message`. It opens a separate top-level conversation in its own ' +
        'tab, taking the user there if they are still watching this one and have not begun typing. This is NOT ' +
        'create_thread: it is a peer conversation, not a sub-task ' +
        '— it works on its own and never reports back to you, so the message must be self-contained. Leave ' +
        '`autostart` at its default to have it begin immediately; set it false to hand the user a ready-to-send ' +
        'message they can review first.',
      '### 另起一条独立的工作线 —— 用 new_conversation\n' +
        '当用户要求**新开会话、新开标签页或新开聊天**（都是同一个意思），或者你想开始一条与本会话无关的、' +
        '全新的独立工作线时，用初始的 `message` 调用 `new_conversation`。它会在自己的标签页里新开一个顶层会话，' +
        '如果用户还在看着当前这个且尚未开始输入，就把用户带过去。它**不是** create_thread：它是平级的会话，' +
        '不是子任务——它独立工作，永远不会向你回报，所以这条消息必须自成体系。\n' +
        '让 `autostart` 保持默认，它会立即开始；设为 false 则把一条可以直接发送的消息交给用户，让他先过目。')
    );
  }

  // Planning vs tracking — steer the model between the two checklist tools:
  // `todo` for its own live progress tracking, `plan` for an approval-gated
  // proposal. Gated so it only mentions the tools actually enabled.
  if (has('plan') || has('todo')) {
    /** @type {string[]} */
    const planTrack = [E('### Planning vs tracking', '### 计划与进度跟踪')];
    if (has('plan') && has('todo')) {
      planTrack.push(
        E('For multi-step work, keep a `todo` checklist and update it as you go — exactly one item ' +
        'in_progress at a time, and each call replaces the whole list. Use the `plan` tool only to ' +
        'propose an approach for the user\'s review: plans should be detailed enough to evaluate ' +
        '(steps name the files involved and how the change is verified). Never submit a bare checklist ' +
        'as a plan.',
        '对于多步骤的工作，维护一个 `todo` 清单并随时更新——任何时刻只有一个条目处于 in_progress，' +
        '每次调用都会替换整个清单。`plan` 工具只用来向用户提交方案供其审阅：方案应当详细到可以评估' +
        '（每一步要写明涉及哪些文件，以及如何验证改动）。绝不要把一份光秃秃的清单当作方案提交。')
      );
    } else if (has('todo')) {
      planTrack.push(
        E('For multi-step work, keep a `todo` checklist and update it as you go — exactly one item ' +
        'in_progress at a time. Each call replaces the whole list, so include every item.',
        '对于多步骤的工作，维护一个 `todo` 清单并随时更新——任何时刻只有一个条目处于 in_progress。' +
        '每次调用都会替换整个清单，所以要包含全部条目。')
      );
    } else {
      planTrack.push(
        E('Use the `plan` tool to propose an approach for the user\'s review, then track its execution. ' +
        'Plans should be detailed enough to evaluate: steps name the files involved and how the change ' +
        'is verified.',
        '用 `plan` 工具向用户提交方案供其审阅，然后跟踪方案的执行。方案应当详细到可以评估：' +
        '每一步要写明涉及哪些文件，以及如何验证改动。')
      );
    }
    toolUsage.push(planTrack.join('\n'));
  }

  /** @type {string[]} */
  const sections = [];

  if (toolUsage.length > 0) {
    sections.push(E('## Tool Usage', '## 工具使用') + '\n\n' + toolUsage.join('\n\n'));
  }

  // Memory — durable, cross-session project facts. Gated on the memory plugin.
  // The tool only gets used if the prompt tells the model when to reach for it;
  // without this, project memory stays empty.
  if (has('memory')) {
    sections.push(
      E('## Memory\n' +
        'The `memory` tool keeps durable project facts in `.juggler/MEMORY.md`, already shown at the top ' +
        'of your context every turn (never re-read it). The block is fixed for this conversation — a ' +
        'fact you record now reaches future ones.\n' +
        '- `remember` a durable, cross-session fact worth recalling — a build/test command, a convention, ' +
        'a user correction, a non-obvious constraint. One concise fact per call.\n' +
        '- `forget` (substring match) to drop a stale fact; to revise, forget then remember.\n' +
        '- Not for ephemeral within-task state — only what stays true across sessions.',
      '## 记忆\n' +
        '`memory` 工具把持久的项目事实保存在 `.juggler/MEMORY.md` 中，每回合都显示在你上下文的最上方' +
        '（不要重新读取它）。这个区块对本会话是固定的——你现在记录的事实会传递给以后的会话。\n' +
        '- 用 `remember` 记录值得日后回顾的、跨会话的持久事实——构建/测试命令、约定、用户的纠正、' +
        '不太显然的约束。每次调用只记一条简洁的事实。\n' +
        '- 用 `forget`（子串匹配）删除过时的事实；要修改就先 forget 再 remember。\n' +
        '- 不用于任务内的临时状态——只记录跨会话仍然成立的东西。')
    );
  }

  // define_command — offer to save a repeatable workflow as a user-defined slash
  // command. Gated on the plugin so the prompt never advertises it when disabled.
  if (has('define-command')) {
    sections.push(
      E('## Custom slash commands\n' +
        'When the user asks to save, name, or repeat a prompt/workflow as a reusable command ' +
        '("make that a slash command", "save this as /review"), offer the `define_command` tool: it ' +
        'writes a user-defined slash command they can invoke with `/name`. The user approves the full ' +
        'definition before it is created.',
      '## 自定义斜杠命令\n' +
        '当用户要求把某个提示词/工作流保存、命名或复用为一个可重复调用的命令时' +
        '（“把它做成一个斜杠命令”“把这个保存为 /review”），就提议使用 `define_command` 工具：' +
        '它会写入一个用户自定义的斜杠命令，用户可以用 `/name` 来调用。在创建之前，用户会先审阅并确认完整的定义。')
    );
  }

  return sections.join('\n\n');
}
