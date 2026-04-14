import { amber, white, muted, line, sep } from './splash.js';
import { renderCommandsList } from './commands.js';
import { getFlag, setFlag } from '../ai/config.js';

const STEPS = [
  '01  answer a few seed questions about what you\'re building',
  '02  pick your AI providers and models',
  '03  groundup runs an adaptive interview to shape a blueprint',
  '04  review and approve the blueprint',
  '05  git + host setup for your new repo',
  '06  build — groundup scaffolds the project from the blueprint',
];

const NEEDS = [
  'a terminal, node 18+, and git',
  'an AI provider (Claude Code, Anthropic, OpenAI, Gemini, or Ollama)',
  'a rough idea — groundup handles the rest',
];

const GETS = [
  'a README.md and .gitignore',
  'a clean git repo pushed to develop',
  'a scaffolded project you fully own — every file in plain sight',
];

export function hasSeenWelcome() {
  return getFlag('seenWelcome') === true;
}

export function markWelcomeSeen() {
  setFlag('seenWelcome', true);
}

// renderWelcomeBody — prints the welcome content without clearing the
// screen or waiting for input. Callers compose it with splash + keywait
// however they want.
export function renderWelcomeBody() {
  sep();
  console.log(amber('■ ') + white('welcome to groundup'));
  sep();
  console.log(muted('  a global cli that walks you from an empty folder to a scaffolded,'));
  console.log(muted('  git-ready project — no assumptions, no lock-in.'));

  sep();
  console.log(amber('■ ') + white('how it works'));
  sep();
  for (const s of STEPS) console.log('  ' + muted(s));

  sep();
  console.log(amber('■ ') + white('what you\'ll need'));
  sep();
  for (const n of NEEDS) console.log('  ' + muted('· ' + n));

  sep();
  console.log(amber('■ ') + white('what you get'));
  sep();
  for (const g of GETS) console.log('  ' + muted('· ' + g));

  sep();
  console.log(amber('■ ') + white('no lock-in'));
  sep();
  console.log('  ' + muted('every file groundup writes is plain text you own. no hidden config,'));
  console.log('  ' + muted('no runtime dependency on groundup itself. walk away any time.'));

  sep();
  console.log(amber('■ ') + white('commands'));
  sep();
  renderCommandsList();

  sep();
  console.log('  ' + amber('› ') + muted('press any key to start'));
  sep();
}

export function waitForAnyKey() {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve();
      return;
    }
    if (process.stdin.isPaused()) process.stdin.resume();
    process.stdin.setRawMode(true);
    const onData = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve();
    };
    process.stdin.on('data', onData);
  });
}
