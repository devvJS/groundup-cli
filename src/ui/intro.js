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
  'a .groundup/ directory with BLUEPRINT.md, GROUNDUP.md, and agent configs',
  'a README.md and .gitignore',
  'a scaffolded project you fully own — every file in plain sight',
];

export function hasSeenIntro() {
  return getFlag('seenIntro') === true;
}

export function markIntroSeen() {
  setFlag('seenIntro', true);
}

export function showIntro() {
  return new Promise((resolve) => {
    process.stdout.write('\x1B[2J\x1B[H');
    sep();
    console.log(amber('■ ') + white('welcome to groundup'));
    sep();
    line();
    console.log(muted('  build from nothing. a global cli that walks you from an empty folder'));
    console.log(muted('  to a scaffolded project — no assumptions, no lock-in.'));
    line();

    sep();
    console.log(amber('■ ') + white('how it works'));
    sep();
    line();
    for (const s of STEPS) console.log('  ' + muted(s));
    line();

    sep();
    console.log(amber('■ ') + white('what you\'ll need'));
    sep();
    line();
    for (const n of NEEDS) console.log('  ' + muted('· ') + white(n));
    line();

    sep();
    console.log(amber('■ ') + white('what you get'));
    sep();
    line();
    for (const g of GETS) console.log('  ' + muted('· ') + white(g));
    line();

    sep();
    console.log(amber('■ ') + white('no lock-in'));
    sep();
    line();
    console.log('  ' + muted('every file groundup writes is plain text you own. no hidden config,'));
    console.log('  ' + muted('no runtime dependency on groundup itself. walk away any time.'));
    line();

    sep();
    console.log(amber('■ ') + white('commands'));
    sep();
    line();
    renderCommandsList();
    line();

    sep();
    console.log('  ' + muted('press any key to start'));
    sep();

    if (process.stdin.isPaused()) process.stdin.resume();
    process.stdin.setRawMode(true);
    const onData = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      markIntroSeen();
      resolve();
    };
    process.stdin.on('data', onData);
  });
}
