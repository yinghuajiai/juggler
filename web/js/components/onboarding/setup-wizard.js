//     ▄▄ ▄▄ ▄▄  ▄▄▄▄  ▄▄▄▄ ▄▄    ▄▄▄▄▄ ▄▄▄▄
//     ██ ██ ██ ██ ▄▄ ██ ▄▄ ██    ██▄▄  ██▄█▄   Copyright (c) 2026 Julian Storer
//   ▄▄█▀ ▀███▀ ▀███▀ ▀███▀ ██▄▄▄ ██▄▄▄ ██ ██   AGPL-3.0-or-later - see LICENSE

/**
 * First-run setup — what to do when Juggler has no provider to talk to.
 *
 * "No providers configured" is true and useless. What actually helps depends on
 * which facts about the machine disagree with each other, and the disagreements
 * are the whole point:
 *
 *   - The Claude desktop app is installed, the `claude` CLI is not. The app has
 *     a Code tab of its own, so the user believes they have Claude Code; Juggler
 *     drives the CLI, a separate download. Reporting "nothing found" here denies
 *     something they can see on their dock.
 *   - The ChatGPT app is installed and signed in, with no Codex CLI anywhere.
 *     Nothing needs installing: the app writes the same login the CLI would.
 *   - A CLI is installed but signed out. The fix is a login, not an install.
 *
 * Every screen that sends someone away ends in "Check again", which re-reads the
 * machine rather than repeating what was true at launch.
 * @module components/onboarding/setup-wizard
 */

import { t } from '../../i18n/index.js';
import { fetchJson } from '../../services/http.js';
import { presentWizard } from './step-modal.js';
import { apiUrl } from '../../utils/api-url.js';

/** Where to read the current state of the machine. */
const DETECT_URL = apiUrl('/onboarding/detect');

/**
 * The preference that stops this asking again. A user preference rather than a
 * device or project one: it records a decision about the person's setup, which
 * does not change because they opened a different folder.
 */
export const ONBOARDING_DISMISSED_PREF = 'onboardingDismissed';

/** Anthropic's own setup page — the install methods, kept current by them. */
const CLAUDE_SETUP_URL = 'https://code.claude.com/docs/en/setup';
/** Where the ChatGPT desktop app comes from. Codex is a mode inside it. */
const CHATGPT_DOWNLOAD_URL = 'https://chatgpt.com/download/';
/** The Codex CLI's own page, for anyone who would rather have the terminal. */
const CODEX_CLI_URL = 'https://learn.chatgpt.com/docs/codex/cli';
/** OpenRouter's key page, which is what their docs hand a new user. */
const OPENROUTER_KEYS_URL = 'https://openrouter.ai/keys';

/**
 * The routes offered to someone with no AI account at all, in the order shown.
 * Ordering is a judgement about which is likeliest to leave them working, so it
 * lives in one list rather than being spelled out in the markup.
 */
const FREE_ROUTES = [
  {
    title: t('A free ChatGPT account'),
    detail: t('Codex is included in every ChatGPT plan, the free one included. Install the app, sign in, done.'),
    step: 'chatgptAccount',
  },
  {
    title: t('A GitHub account'),
    detail:
      t('GitHub Copilot has a free plan, and it is the only one Juggler can sign you into without leaving this window. Model choice is limited on it.'),
    step: 'copilotAccount',
  },
  {
    title: t('Neither, and no card'),
    detail:
      t('OpenRouter serves some models free — no payment method, around 50 requests a day. You paste an API key.'),
    step: 'openrouterAccount',
  },
];

/**
 * Decide which screen a machine should land on.
 *
 * Exported because it is the entire decision this module makes, and it is worth
 * testing on its own — every screen below is just prose attached to one of these
 * names. Ordered by how little the user has left to do: a login beats an
 * install, and an install of something they already pay for beats shopping.
 * @param {any} detection - The `/api/onboarding/detect` payload.
 * @returns {string} The name of the step to show first.
 */
export function chooseRoute(detection) {
  // Something is already installed and signed in, yet nothing is serving a
  // model: the provider is switched off, or its login has lapsed. Either way
  // there is nothing to install and the settings panel is where the answer is.
  if (detection.claudeCLI || detection.codexSignedIn) return 'almostThere';
  // A sign-in inside an app that is already open, with nothing to download.
  if (detection.chatgptApp) return 'chatgptSignIn';
  // Same login, but it has to be made from a terminal.
  if (detection.codexCLI) return 'codexSignIn';
  // They have Claude, but not the part Juggler can drive.
  if (detection.claudeDesktopApp) return 'claudeNeedsCLI';
  return 'askAccount';
}

/**
 * Read the machine.
 * @param {boolean} refresh - Discard memoised detection first. Used by "check
 *   again", where the machine has changed since the last answer.
 * @returns {Promise<any>} The detection payload.
 */
async function fetchDetection(refresh) {
  return fetchJson(refresh ? `${DETECT_URL}?refresh=1` : DETECT_URL);
}

/**
 * Show the first-run setup flow.
 * @param {object} [opts]
 * @param {(refresh: boolean) => Promise<any>} [opts.detect] - Machine reader.
 * @param {string} [opts.platform] - `darwin`, `windows` or `linux`. Defaults to
 *   what the window chrome was told, so the install command matches the machine.
 * @param {(tab: string) => void} [opts.openProviderSettings] - Escape hatch to
 *   the settings panel, for the routes this flow deliberately does not automate.
 * @returns {Promise<any>} `'ready'` once a provider is serving, `'settings'` if
 *   the user left for the settings panel, `undefined` if they dismissed it.
 */
export async function startSetupWizard({
  detect = fetchDetection,
  platform = document.documentElement.dataset.windowPlatform || 'darwin',
  openProviderSettings,
} = {}) {
  const first = await detect(false);
  // Nothing to say: something already works.
  if (first?.anyProviderAvailable) return 'ready';

  const state = {
    detection: first,
    route: chooseRoute(first),
    /** Set once a "check again" has come back empty, so the screen can say so. */
    checkedInVain: false,
  };

  const isWindows = platform === 'windows';
  const claudeInstall = isWindows
    ? t('irm https://claude.ai/install.ps1 | iex')
    : t('curl -fsSL https://claude.ai/install.sh | bash');
  const codexInstall = isWindows
    ? t('powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"')
    : t('curl -fsSL https://chatgpt.com/codex/install.sh | sh');

  /** @returns {string|undefined} The small print for a check that found nothing. */
  const vainNote = () =>
    state.checkedInVain ? t('Still nothing. The change may need a new terminal, or a moment.') : undefined;

  /**
   * The action every "go and do something" screen ends with.
   * @returns {import('./step-modal.js').StepAction} The check-again button.
   */
  const checkAgainAction = () => ({
    label: t('Check again'),
    kind: 'primary',
    busyLabel: 'Checking…',
    onSelect: async (ctx) => {
      const next = await detect(true);
      state.detection = next;
      if (next?.anyProviderAvailable) {
        ctx.finish('ready');
        return;
      }
      state.checkedInVain = true;
      const route = chooseRoute(next);
      if (route !== state.route) {
        state.route = route;
        ctx.go(route);
      } else {
        ctx.rerender();
      }
    },
  });

  /**
   * Leave for the settings panel, which owns every provider this flow does not
   * walk through by hand.
   * @param {string} [label] - Button text.
   * @returns {import('./step-modal.js').StepAction} The settings button.
   */
  const settingsAction = (label = t('Open provider settings')) => ({
    label,
    onSelect: (ctx) => {
      ctx.finish('settings');
      openProviderSettings?.('providers');
    },
  });

  /**
   * The way out for someone who has decided not to connect anything yet. Offered
   * only on the screens where that is a real answer — being asked this while
   * halfway through installing a CLI would be noise.
   * @returns {import('./step-modal.js').StepAction} The dismissal button.
   */
  const dismissForeverAction = () => ({
    label: t("Don't ask again"),
    onSelect: (ctx) => ctx.finish('dismissForever'),
  });

  /**
   * Render a list of routes as cards.
   * @param {{title: string, detail: string, step: string}[]} routes - The choices.
   * @returns {string} The markup.
   */
  const choiceList = (routes) =>
    `<div class="wiz-choices">${routes
      .map(
        (route, index) =>
          `<button type="button" class="wiz-choice" data-wiz-choice="${index}">
             <span class="wiz-choice-title">${route.title}</span>
             <span class="wiz-choice-detail">${route.detail}</span>
           </button>`
      )
      .join('')}</div>`;

  /**
   * Wire a choice list's cards. They sit in the body rather than the footer, so
   * they are not `wiz-action` buttons and the modal does not know about them.
   * @param {import('./step-modal.js').StepContext} ctx - Navigation.
   * @param {{step: string}[]} routes - The same list that was rendered.
   * @returns {(root: HTMLElement) => void} A mount handler for the step view.
   */
  const choiceMount = (ctx, routes) => (root) => {
    root.querySelectorAll('[data-wiz-choice]').forEach((el) => {
      el.addEventListener('click', () => {
        const route = routes[Number(/** @type {HTMLElement} */ (el).dataset.wizChoice)];
        if (route) ctx.go(route.step);
      });
    });
  };

  /** @type {Record<string, (ctx: any) => import('./step-modal.js').StepView>} */
  const steps = {
    almostThere: () => {
      const installed = state.detection?.claudeCLI ? t('Claude Code') : 'Codex';
      return {
        title: t('Nearly there'),
        body: `
          <p>${installed} is installed and signed in, but nothing is serving a model yet. Usually that means the provider is switched off, or the login has lapsed.</p>
          <p>${t('Provider settings will say which.')}</p>`,
        actions: [settingsAction(), checkAgainAction()],
        note: vainNote(),
      };
    },

    chatgptSignIn: () => ({
      title: t('Sign in to Codex'),
      body: `
        <p>${t('The ChatGPT app is on this machine but not signed in to Codex. Open it, switch to')} <strong>${t('Codex')}</strong>${t(', and sign in.')}</p>
        <p>Nothing else to install — Juggler reads that login directly. Codex is included in every ChatGPT plan, the free one included.</p>`,
      actions: [checkAgainAction(), { label: t('Use a different provider'), onSelect: (ctx) => ctx.go('askAccount') }],
      note: vainNote(),
    }),

    codexSignIn: () => ({
      title: t('Sign in to Codex'),
      body: `
        <p>${t('The Codex CLI is installed but signed out. In a terminal:')}</p>
        <code class="wiz-command">${t('codex login')}</code>
        <p>${t('Codex is included in every ChatGPT plan, the free one included.')}</p>`,
      actions: [checkAgainAction(), { label: t('Use a different provider'), onSelect: (ctx) => ctx.go('askAccount') }],
      note: vainNote(),
    }),

    claudeNeedsCLI: () => ({
      title: t('Claude Code needs its CLI'),
      body: `
        <p>${t('The Claude desktop app is installed. It has a Code tab of its own, but Juggler drives the')} <strong>claude</strong> ${t('command-line tool, which is a separate install:')}</p>
        <code class="wiz-command">${claudeInstall}</code>
        <p><strong>${t('Claude Code needs a paid Claude plan')}</strong> — Pro, Max, Team or Enterprise. The free claude.ai plan does not include it, and no amount of installing will change that.</p>
        <p><a href="${CLAUDE_SETUP_URL}" target="_blank" rel="noreferrer">${t("Anthropic's setup guide")}</a> ${t('covers the other install methods.')}</p>`,
      actions: [checkAgainAction(), { label: t('Use a different provider'), onSelect: (ctx) => ctx.go('askAccount') }],
      note: vainNote(),
    }),

    askAccount: (ctx) => {
      const routes = [
        {
          title: t('A ChatGPT account'),
          detail: t('Any plan, including free. Codex is included with all of them.'),
          step: 'chatgptAccount',
        },
        {
          title: t('A paid Claude plan'),
          detail: t('Pro, Max, Team or Enterprise. Claude Code is not part of the free plan.'),
          step: 'claudeAccount',
        },
        {
          title: t('An API key for something else'),
          detail: t('Anthropic, OpenAI, Gemini, Mistral, a local model — settings takes keys for all of them.'),
          step: 'otherProvider',
        },
        {
          title: t('None of these'),
          detail: t('There are a few ways to get running for nothing.'),
          step: 'freeOptions',
        },
      ];
      return {
        title: t('What do you have?'),
        body: `<p>${t('Juggler needs one model provider before it can do anything.')}</p>${choiceList(routes)}`,
        actions: [dismissForeverAction()],
        onMount: choiceMount(ctx, routes),
      };
    },

    chatgptAccount: () => ({
      title: t('Use your ChatGPT account'),
      body: `
        <p>${t('Install the')} <a href="${CHATGPT_DOWNLOAD_URL}" target="_blank" rel="noreferrer">${t('ChatGPT desktop app')}</a>${t(', sign in, and switch to')} <strong>${t('Codex')}</strong>${t('. Juggler picks that login up on its own.')}</p>
        <p>${t('If you would rather work from a terminal, the')} <a href="${CODEX_CLI_URL}" target="_blank" rel="noreferrer">${t('Codex CLI')}</a> ${t('shares the same login:')}</p>
        <code class="wiz-command">${codexInstall}</code>`,
      actions: [checkAgainAction()],
      note: vainNote(),
    }),

    claudeAccount: () => ({
      title: t('Use your Claude plan'),
      body: `
        <p>${t('Juggler drives the')} <strong>claude</strong> ${t('command-line tool. Install it with:')}</p>
        <code class="wiz-command">${claudeInstall}</code>
        <p>${t('Then run')} <strong>claude</strong> ${t('once in a terminal to sign in.')} <a href="${CLAUDE_SETUP_URL}" target="_blank" rel="noreferrer">${t("Anthropic's setup guide")}</a> ${t('has the other install methods.')}</p>
        <p>This needs a paid plan — Pro, Max, Team or Enterprise. The free claude.ai plan does not include Claude Code.</p>`,
      actions: [checkAgainAction()],
      note: vainNote(),
    }),

    otherProvider: () => ({
      title: t('Add a key'),
      body: `<p>Provider settings takes an API key for Anthropic, OpenAI, Gemini, Mistral, OpenRouter and the rest, and finds local models served by Ollama, LM Studio or llama.cpp.</p>`,
      actions: [{ ...settingsAction(t('Open provider settings')), kind: 'primary' }],
    }),

    freeOptions: (ctx) => {
      return {
        title: t('Free ways to start'),
        body: `<p>${t('None of these costs anything, and none of them needs a card.')}</p>${choiceList(FREE_ROUTES)}`,
        actions: [dismissForeverAction()],
        onMount: choiceMount(ctx, FREE_ROUTES),
      };
    },

    copilotAccount: () => ({
      title: t('Use GitHub Copilot'),
      body: `
        <p>Copilot's free plan costs nothing, and Juggler can sign you in from here — no other app, no key to paste.</p>
        <p>${t('In provider settings, find')} <strong>${t('GitHub Copilot')}</strong> ${t('and choose Sign in.')}</p>
        <p>${t('Model choice is limited on the free plan.')}</p>`,
      actions: [{ ...settingsAction(t('Open provider settings')), kind: 'primary' }],
    }),

    openrouterAccount: () => ({
      title: t('Use OpenRouter'),
      body: `
        <p>${t('OpenRouter serves some models free — no payment method, around 50 requests a day.')}</p>
        <p>${t('Create a key at')} <a href="${OPENROUTER_KEYS_URL}" target="_blank" rel="noreferrer">${t('openrouter.ai/keys')}</a>${t(', then paste it into provider settings. The free models are the ones whose name ends in')} <strong>${t(':free')}</strong>.</p>`,
      actions: [{ ...settingsAction(t('Open provider settings')), kind: 'primary' }],
    }),
  };

  return presentWizard({ steps, start: state.route, dismissLabel: t('Close setup') });
}
