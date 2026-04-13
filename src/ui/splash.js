import chalk from 'chalk';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

const amber = chalk.hex('#F5A623');
const muted = chalk.hex('#666666');

export function showSplash() {
  console.log('');
  console.log(amber.bold('  ■ GROUNDUP'));
  console.log(amber('  ────────────────────────────────────────────────'));
  console.log(chalk.white('  build from nothing.') + '  ' + muted(`v${version}`));
  console.log(amber('  ────────────────────────────────────────────────'));
  console.log('');
}