import { showSplash } from '../ui/splash.js';
import { sessionExists, loadSession, updateSession } from '../session/state.js';
import { runInterview } from '../interview/engine.js';
import chalk from 'chalk';

const amber = chalk.hex('#F5A623');
const muted = chalk.hex('#666666');

export async function resume() {
  showSplash();

  if (!sessionExists()) {
    console.log(amber('  ■ ') + chalk.white('No session found.'));
    console.log(muted('  Run ') + chalk.white('groundup dig [name]') + muted(' to start a new project.'));
    console.log('');
    return;
  }

  const session = loadSession();

  console.log(amber('  ■ ') + chalk.white(`Resuming: ${session.project.name}`));
  console.log(muted(`  Phase: ${session.phase}`));
  console.log('');

  if (session.phase === 'interview') {
    const answers = await runInterview(session);
    updateSession({ phase: 'agent', interview: answers });
  } else {
    console.log(muted(`  Phase "${session.phase}" resumption coming soon.`));
  }
}