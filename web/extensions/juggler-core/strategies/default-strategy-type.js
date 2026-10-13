//     ▄▄ ▄▄ ▄▄  ▄▄▄▄  ▄▄▄▄ ▄▄    ▄▄▄▄▄ ▄▄▄▄
//     ██ ██ ██ ██ ▄▄ ██ ▄▄ ██    ██▄▄  ██▄█▄   Copyright (c) 2026 Julian Storer
//   ▄▄█▀ ▀███▀ ▀███▀ ▀███▀ ██▄▄▄ ██▄▄▄ ██ ██   Apache-2.0 - see LICENSE
// SPDX-License-Identifier: Apache-2.0

import { t } from '../../../js/i18n/index.js';
import StrategyType from 'juggler/strategy-type';

/**
 * DefaultStrategyType - Baseline strategy using coroutine pattern
 *
 * This strategy implements the standard Juggler behavior:
 * - No iteration limit (continues until LLM stops calling tools)
 * - Standard context assembly with context items, messages, decision framework
 * - No sub-conversation spawning
 *
 * Use this as the baseline/regression test for comparing other strategies.
 * @augments {StrategyType}
 */
export default class DefaultStrategyType extends StrategyType {
  /**
   * Strategy manifest describing capabilities and recommendations
   * @type {import('juggler/strategy-type').StrategyManifest}
   */
  static MANIFEST = {
    id: 'default',
    name: t('Default Strategy'),
    version: '2.0.0',
    description: t('Standard Juggler behavior - general-purpose coding assistant'),
    author: t('Juggler Team'),
    color: 'var(--accent-yellow)',
    icon: 'icon-live-help',
    order: 0,
    showsApprovalControls: true,
    defaultRules: [],
    recommendations: {
      recommendedFor: [
        t('General coding tasks'),
        t('Bug fixes'),
        t('Code refactoring'),
        t('Feature implementation'),
        t('Code review and analysis')
      ],
      exampleTriggers: [
        t('fix the bug in...'),
        t('refactor this code...'),
        t('add a new feature...'),
        'implement...',
        t('update the...')
      ],
      approach: t('Iterative agentic loop with the full toolset. Read tools run automatically; writes and shell commands pause for your approval before they run. The loop continues until the task is done — there is no fixed iteration cap.'),
      tradeoffs: {
        pros: [
          t('Well-tested, predictable baseline behaviour'),
          t('Asks before writing files or running commands, so you stay in control'),
          t('Read tools run without interruption'),
          t('Suits the full range of everyday coding tasks')
        ],
        cons: [
          t('Stops for approval on writes and shell commands — use YOLO for an uninterrupted run'),
          t('Does not guarantee read-only safety — use Read-only to make changes impossible')
        ]
      }
    }
  };

}
