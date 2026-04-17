import { amber, white, muted, line, sep } from './splash.js';

/**
 * Render styled per-command help output.
 *
 * @param {object} content
 * @param {string} content.name        — command name (e.g. 'dig [name]')
 * @param {string} content.summary     — one-line description
 * @param {string} content.usage       — usage signature
 * @param {string} content.description — 2-3 sentences, plain voice
 * @param {string} content.next        — what happens after / what to expect
 * @param {string} content.related     — comma-separated list of related commands
 */
export function renderCommandHelp({ name, summary, usage, description, next, related }) {
  line();
  sep();
  console.log(amber('■ ') + white(`groundup — ${name}`));
  sep();
  line();
  console.log(muted(`  ${summary}`));
  line();

  console.log(amber('  usage'));
  console.log(white(`    $ groundup ${usage}`));
  line();

  console.log(amber('  what this does'));
  for (const sentence of description.split('\n')) {
    console.log(muted(`    ${sentence}`));
  }
  line();

  console.log(amber('  what comes next'));
  for (const sentence of next.split('\n')) {
    console.log(muted(`    ${sentence}`));
  }
  line();

  console.log(amber('  related'));
  console.log(muted(`    ${related}`));
  line();

  sep();
  console.log('  ' + muted('run any command with ') + amber('--help') + muted(' for details.'));
  line();
}

// --- Help content for all user-facing commands ---

export const HELP = {
  dig: {
    name: 'dig [name]',
    summary: 'start a new project — the hero command',
    usage: 'dig [name]',
    description:
      'We walk you through an AI-powered interview to understand what\n' +
      "you're building, then generate a blueprint, set up your repo,\n" +
      'plan a phased workflow, and hand each phase to your chosen agent.',
    next:
      'When dig finishes, your project is scaffolded, committed, and\n' +
      'pushed to origin/develop. Run groundup continue if the build\n' +
      'was paused or aborted partway through.',
    related: 'continue, foreman, site-clear',
  },

  continue: {
    name: 'continue',
    summary: 'resume a paused session',
    usage: 'continue',
    description:
      'Picks up where you left off. We read the session file to find\n' +
      'the last completed phase and resume from there — whether that\n' +
      'was the interview, blueprint review, repo setup, or mid-build.',
    next:
      'We drop you back into whatever phase was in progress. If the\n' +
      'build was aborted, we resume at the phase that was paused.',
    related: 'dig, site, site-clear',
  },

  site: {
    name: 'site',
    summary: 'view current session details',
    usage: 'site',
    description:
      'Shows the state of the current project session — name, phase,\n' +
      'provider, build progress. Reads from .groundup/session.json\n' +
      'in the current directory.',
    next:
      'This is read-only — nothing changes. Use it to check where\n' +
      'a project stands before running continue or site-clear.',
    related: 'site-clear, continue, foreman',
  },

  'site-clear': {
    name: 'site-clear',
    summary: 'discard session and start fresh',
    usage: 'site-clear',
    description:
      'Wipes the .groundup/session.json for the current project.\n' +
      'Your source files are untouched — we only remove the session\n' +
      'state so you can start over with groundup dig.',
    next:
      'After clearing, the project directory is still there with any\n' +
      'files the build created. Run groundup dig [name] to start a\n' +
      'new session from scratch.',
    related: 'dig, site, continue',
  },

  foreman: {
    name: 'foreman',
    summary: 'full command reference and help',
    usage: 'foreman',
    description:
      'Shows every available command with a short description.\n' +
      'This is the same output you see when you run groundup with\n' +
      'no arguments, --help, or -h.',
    next:
      'Pick a command and run it. Every command also accepts --help\n' +
      'for a more detailed breakdown.',
    related: 'dig, continue, update-models',
  },

  'update-models': {
    name: 'update-models',
    summary: 'refresh models from provider APIs',
    usage: 'update-models',
    description:
      'Queries each configured provider API for its current model\n' +
      'list and updates the local model cache. Run this when a new\n' +
      'model drops and you want it available in the interview.',
    next:
      'The model list is updated in place. Next time you run\n' +
      'groundup dig, the new models will appear as options.',
    related: 'dig, foreman',
  },

  deploy: {
    name: 'deploy',
    summary: 'deploy to production',
    usage: 'deploy',
    description:
      'Reads the deploy target from the blueprint (set during the\n' +
      'interview) and ships to production. Currently supports Vercel.\n' +
      'Standalone re-deploy — run after dig or continue finishes.',
    next:
      'On success, we print the live URL. On failure, we retry once\n' +
      'then fall through to a manual checklist item with a hint.',
    related: 'dig, continue, foreman',
  },
};
