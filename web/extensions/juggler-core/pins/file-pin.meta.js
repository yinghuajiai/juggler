//     ▄▄ ▄▄ ▄▄  ▄▄▄▄  ▄▄▄▄ ▄▄    ▄▄▄▄▄ ▄▄▄▄
//     ██ ██ ██ ██ ▄▄ ██ ▄▄ ██    ██▄▄  ██▄█▄   Copyright (c) 2026 Julian Storer
//   ▄▄█▀ ▀███▀ ▀███▀ ▀███▀ ██▄▄▄ ██▄▄▄ ██ ██   Apache-2.0 - see LICENSE
// SPDX-License-Identifier: Apache-2.0

import { t } from '../../../js/i18n/index.js';
import { normalizeFilePinParameters } from '../lib/file-pin-config.js';

/**
 * Agent descriptor for the File pin. Loaded in the engine worker, so it shares
 * only the DOM-free half of the pin — the spelling of a path — and none of the
 * viewer half.
 * @type {import('juggler/pinboard-item-type').PinAgentDescriptor}
 */
export default {
  id: 'file',
  description: t('Any file or directory, shown as its contents. The general case: reach for it when nothing above describes what the path actually holds.'),
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: t('File or directory path, absolute or relative to the project.') },
      isDirectory: { type: 'boolean', description: t('Whether the path names a directory. A trailing slash also implies this.') },
    },
    required: ['path'],
  },
  normalize: normalizeFilePinParameters,
  identity: (parameters) => parameters.path,
  fallback: true,
};
