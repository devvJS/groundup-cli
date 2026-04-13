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

const GROUND = ` ██████╗ ██████╗  ██████╗ ██╗   ██╗███╗   ██╗██████╗
██╔════╝ ██╔══██╗██╔═══██╗██║   ██║████╗  ██║██╔══██╗
██║  ███╗██████╔╝██║   ██║██║   ██║██╔██╗ ██║██║  ██║
██║   ██║██╔══██╗██║   ██║██║   ██║██║╚██╗██║██║  ██║
╚██████╔╝██║  ██║╚██████╔╝╚██████╔╝██║ ╚████║██████╔╝
 ╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝╚═════╝ `;

const UP = `                                               ██╗   ██╗██████╗
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
  console.log(amber(GROUND));
  console.log(chalk.whiteBright(UP));
  line();
  console.log('  ' + white('build from nothing. ') + amber('■'));
  line();
  sep();
  line();
  console.log('  ' + muted(`v${version}`));
  line();
}
