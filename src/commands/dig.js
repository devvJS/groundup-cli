import { showSplash, line, amber, white, muted } from '../ui/splash.js';
import { sessionExists, loadSession, saveSession, updateSession } from '../session/state.js';
import { runInterview } from '../interview/engine.js';
import { runAgentSelection } from './agent.js';
import { runStackSelection } from '../stack/selection.js';
import { runBlueprint } from './blueprint.js';

export async function dig(name) {
  showSplash();

  if (sessionExists()) {
    const session = loadSession();
    console.log(amber('■ ') + white(`Session found: ${session.project.name}`));
    console.log(muted(`  Last updated: ${session.project.lastUpdated}`));
    line();
    console.log(muted('  Run ') + white('groundup continue') + muted(' to resume.'));
    console.log(muted('  Run ') + white('groundup site-clear') + muted(' to start fresh.'));
    line();
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

  console.log(amber('■ ') + white(`Starting: ${projectName}`));

  let session = loadSession();

  // phase 1 — interview
  const answers = await runInterview(session);
  updateSession({ phase: 'agent', interview: answers });

  // phase 2 — agent selection
  session = loadSession();
  await runAgentSelection(session);

  // phase 3 — stack selection
  session = loadSession();
  await runStackSelection(session);
  updateSession({ phase: 'blueprint' });

  // phase 4 — blueprint
  session = loadSession();
  await runBlueprint(session);
}
