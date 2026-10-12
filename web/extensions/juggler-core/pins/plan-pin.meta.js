//     ▄▄ ▄▄ ▄▄  ▄▄▄▄  ▄▄▄▄ ▄▄    ▄▄▄▄▄ ▄▄▄▄
//     ██ ██ ██ ██ ▄▄ ██ ▄▄ ██    ██▄▄  ██▄█▄   Copyright (c) 2026 Julian Storer
//   ▄▄█▀ ▀███▀ ▀███▀ ▀███▀ ██▄▄▄ ██▄▄▄ ██ ██   Apache-2.0 - see LICENSE
// SPDX-License-Identifier: Apache-2.0

import { t } from '../../../js/i18n/index.js';

/** @type {import('juggler/pinboard-item-type').PinAgentDescriptor} */
export default {
  id: 'plan',
  description: t('The current plan and how far through it the conversation has got.'),
  parameters: { type: 'object', properties: {}, required: [] },
};
