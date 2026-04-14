import { amber, white, muted, line, sep } from './splash.js';

export const COMMANDS = [
  { cmd: 'groundup dig [name]', desc: 'start a new project' },
  { cmd: 'groundup continue',   desc: 'resume a paused session' },
  { cmd: 'groundup site',       desc: 'view current session details' },
  { cmd: 'groundup site-clear', desc: 'discard session and start fresh' },
  { cmd: 'groundup foreman',    desc: 'full command reference and help' },
];

const CMD_WIDTH = Math.max(...COMMANDS.map((c) => c.cmd.length));

export function renderCommandsList() {
  for (const c of COMMANDS) {
    console.log('  ' + amber(c.cmd.padEnd(CMD_WIDTH + 4)) + muted(c.desc));
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
