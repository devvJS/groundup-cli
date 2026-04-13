import chalk from 'chalk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));

export const amber = chalk.hex('#F5A623');
export const white = chalk.white;
export const muted = chalk.hex('#666666');
export const success = chalk.hex('#4CAF50');
export const warning = chalk.hex('#FF6B35');
export const error = chalk.hex('#E53935');

const GROUND = ` 
 ██████╗ ██████╗  ██████╗ ██╗   ██╗███╗   ██╗██████╗
██╔════╝ ██╔══██╗██╔═══██╗██║   ██║████╗  ██║██╔══██╗
██║  ███╗██████╔╝██║   ██║██║   ██║██╔██╗ ██║██║  ██║
██║   ██║██╔══██╗██║   ██║██║   ██║██║╚██╗██║██║  ██║
╚██████╔╝██║  ██║╚██████╔╝╚██████╔╝██║ ╚████║██████╔╝
 ╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝╚═════╝ `;

const UP = `                                               
                                               ██╗   ██╗██████╗
                                               ██║   ██║██╔══██╗
                                               ██║   ██║██████╔╝
                                               ██║   ██║██╔═══╝
                                               ╚██████╔╝██║
                                                ╚═════╝ ╚═╝     `;

export function sep() {
  const cols = process.stdout.columns || 80;
  console.log(muted(('◼' + '\u2009').repeat(Math.floor(cols / 2))));
}

export const SEP = muted(('◼' + '\u2009').repeat(Math.floor((process.stdout.columns || 80) / 2)));

export function line() {
  console.log('');
}

export function header(project, phase) {
  console.log(amber('■ ') + white(`groundup — ${project} — ${phase}`));
  console.log('');
}

export function confirm(text) {
  console.log(success('✓ ') + white(text));
}

export function flag(text) {
  console.log(amber('■ ') + white(text));
}

export function hint(text) {
  console.log(muted('  ' + text));
}

export function showSplash() {
  console.clear();
  const cols = process.stdout.columns || 80;
  const interiorWidth = Math.max(0, cols - 2);
  const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
  const edge = amber('║');
  const blankInterior = edge + ' '.repeat(interiorWidth) + edge;
  const groundLines = GROUND.split('\n');
  const upLines = UP.split('\n');
  const combined = [...groundLines, ...upLines];
  const maxWidth = Math.max(...combined.map((l) => stripAnsi(l).length));
  const leftPad = Math.max(0, Math.floor((interiorWidth - maxWidth) / 2));
  const padLine = (text, paint) => {
    const visible = stripAnsi(text).length;
    const rightPad = Math.max(0, interiorWidth - leftPad - visible);
    return edge + ' '.repeat(leftPad) + paint(text) + ' '.repeat(rightPad) + edge;
  };

  console.log(amber('╔' + '═'.repeat(interiorWidth) + '╗'));
  console.log(blankInterior);
  console.log(blankInterior);
  groundLines.forEach((l) => console.log(padLine(l, amber)));
  upLines.forEach((l) => console.log(padLine(l, chalk.whiteBright)));
  console.log(blankInterior);
  console.log(blankInterior);
  console.log(amber('╚' + '═'.repeat(interiorWidth) + '╝'));
  line();
  console.log('  ' + white('build from nothing. ') + amber('■') + '  ' + muted(`v${version}`));
  line();
  sep();
}
