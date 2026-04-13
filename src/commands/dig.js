import { showSplash } from '../ui/splash.js';
import { sessionExists, loadSession, saveSession, updateSession } from '../session/state.js';
import { runInterview } from '../interview/engine.js';
import { runAgentSelection } from './agent.js';
import { runStackSelection } from '../stack/selection.js';
import chalk from 'chalk';

const amber = chalk.hex('#F5A623');
const muted = chalk.hex('#666666');

export async function dig(name) {
  showSplash();

  if (sessionExists()) {
    const session = loadSession();
    console.log(amber('  ■ ') + chalk.white(`Session found: ${session.project.name}`));
    console.log(muted(`  Last updated: ${session.project.lastUpdated}`));
    console.log('');
    console.log(muted('  Run ') + chalk.white('groundup continue') + muted(' to resume.'));
    console.log(muted('  Run ') + chalk.white('groundup site-clear') + muted(' to start fresh.'));
    console.log('');
    return;
  }

  const projectName = name ?? 'unnamed';

  saveSession({
    project: {
      name: projectName,
      created: new Date().toISOString(),
    },
    phase: 'interview',
  });

  console.log(amber('  ■ ') + chalk.white(`Starting: ${projectName}`));
  console.log('');

  let session = loadSession();

  // phase 1 — interview
  const answers = await runInterview(session);
  updateSession({ phase: 'agent', interview: answers });

  // phase 2 — agent selection
  session = loadSession();
  await runAgentSelection(session);

  // phase 3 — stack selection
  session = loadSession();
  const stack = await runStackSelection(session);
  updateSession({ phase: 'blueprint', stack });

  console.log('');
  console.log(muted('  Generating BLUEPRINT.md...'));
}
