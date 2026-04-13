import chalk from 'chalk';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

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

export const SEP = chalk.hex('#F5A623')('── '.repeat(20));

export function sep() {
  console.log(SEP);
}

export function line() {
  console.log('');
}

export function header(project, phase) {
  console.log(chalk.hex('#F5A623')('■ ') + chalk.white(`groundup — ${project} — ${phase}`));
  console.log('');
}

export function confirm(text) {
  console.log(chalk.hex('#4CAF50')('✓ ') + chalk.white(text));
}

export function flag(text) {
  console.log(chalk.hex('#F5A623')('■ ') + chalk.white(text));
}

export function hint(text) {
  console.log(chalk.hex('#666666')('  ' + text));
}

export function showSplash() {
  console.clear();
  console.log(chalk.hex('#F5A623')(GROUND));
  console.log(chalk.whiteBright(UP));
  line();
  console.log(chalk.hex('#666666')('  build from nothing.') + '  ' + chalk.hex('#666666')(`v${version}`));
  line();
  console.log(SEP);
  line();
}
