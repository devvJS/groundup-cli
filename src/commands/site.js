import { sessionExists, loadSession, clearSession } from '../session/state.js';
import { showSplash } from '../ui/splash.js';
import chalk from 'chalk';

const amber = chalk.hex('#F5A623');
const muted = chalk.hex('#666666');
const success = chalk.hex('#4CAF50');

export async function siteClear() {
  showSplash();

  if (!sessionExists()) {
    console.log(muted('  No active session to clear.'));
    console.log('');
    return;
  }

  const session = loadSession();
  clearSession();

  console.log(amber('  ■ ') + chalk.white(`Session cleared: ${session.project.name}`));
  console.log(success('  ✓ ') + muted('Ready for a fresh start.'));
  console.log(muted('  Run ') + chalk.white('groundup dig [name]') + muted(' to begin.'));
  console.log('');
}