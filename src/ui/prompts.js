import chalk from 'chalk';

const muted = chalk.hex('#666666');
const amber = chalk.hex('#F5A623');

export function showKeyboardHints(multiselect = false) {
  console.log('');
  if (multiselect) {
    console.log(
      muted('  ↑ ↓ navigate   ') +
      amber('space') +
      muted(' select/deselect   ') +
      amber('enter') +
      muted(' confirm   ') +
      amber('?') +
      muted(' help')
    );
  } else {
    console.log(
      muted('  ↑ ↓ navigate   ') +
      amber('enter') +
      muted(' confirm   ') +
      amber('?') +
      muted(' help')
    );
  }
  console.log('');
}