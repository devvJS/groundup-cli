import { amber, white, muted, line, sep } from './splash.js';

export const COMMANDS = [
  { cmd: 'groundup dig [name]', desc: 'start a new project' },
  { cmd: 'groundup continue',   desc: 'resume a paused session' },
  { cmd: 'groundup site',       desc: 'view current session details' },
  { cmd: 'groundup site-clear', desc: 'discard session and start fresh' },
  { cmd: 'groundup foreman',    desc: 'full command reference and help' },
  { cmd: 'groundup update-models', desc: 'refresh models from provider APIs' },
];

export const SESSION_SHORTCUTS = [
  { key: 'h',      desc: 'contextual help for current question' },
  { key: 'ctrl+o', desc: 'expand decisions list' },
  { key: '/',      desc: 'this screen' },
  { key: 'ctrl+c', desc: 'quit (with confirmation)' },
];

const CMD_WIDTH = Math.max(...COMMANDS.map((c) => c.cmd.length));
const KEY_WIDTH = Math.max(...SESSION_SHORTCUTS.map((s) => s.key.length));

export function renderCommandsList() {
  for (const c of COMMANDS) {
    console.log('  ' + amber(c.cmd.padEnd(CMD_WIDTH + 4)) + muted(c.desc));
  }
}

export function renderSessionShortcutsList() {
  for (const s of SESSION_SHORTCUTS) {
    console.log('  ' + amber(s.key.padEnd(KEY_WIDTH + 4)) + muted(s.desc));
  }
}

export function renderCommandsBlock() {
  sep();
  console.log(amber('■ ') + white('commands'));
  sep();
  line();
  renderCommandsList();
  line();
  sep();
}

// paintCommandsOverlay — used by the `/` shortcut at any prompt. Writes
// into the alt screen buffer so the caller's view is restored on dismiss.
export function paintCommandsOverlay() {
  process.stdout.write('\x1B[?1049h\x1B[2J\x1B[H');
  line();
  sep();
  console.log(amber('■ ') + white('commands'));
  console.log('  ' + muted('run these from your terminal, not during a session'));
  sep();
  line();
  renderCommandsList();
  line();

  sep();
  console.log(amber('■ ') + white('session shortcuts'));
  console.log('  ' + muted('use these during an active groundup session'));
  sep();
  line();
  renderSessionShortcutsList();
  line();

  sep();
  console.log('  ' + muted('press any key to return'));
  sep();
}

export function dismissCommandsOverlay() {
  process.stdout.write('\x1B[?1049l');
}
