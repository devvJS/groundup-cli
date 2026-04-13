import { showSplash, line, amber, white, muted } from '../ui/splash.js';
import { sessionExists, loadSession, updateSession } from '../session/state.js';
import { runInterview } from '../interview/engine.js';
import { runAgentSelection } from './agent.js';
import { runStackSelection } from '../stack/selection.js';
import { runBlueprint } from './blueprint.js';
import { runRepoSetup } from './repo.js';

export async function resume() {
  showSplash();

  if (!sessionExists()) {
    console.log(amber('■ ') + white('No session found.'));
    console.log(muted('  Run ') + white('groundup dig [name]') + muted(' to start a new project.'));
    line();
    return;
  }

  const session = loadSession();

  console.log(amber('■ ') + white(`Resuming: ${session.project.name}`));
  console.log(muted(`  Phase: ${session.phase}`));
  line();

  if (session.phase === 'interview') {
    const answers = await runInterview(session);
    updateSession({ phase: 'agent', interview: answers });
    const s = loadSession();
    await runAgentSelection(s);
    const s2 = loadSession();
    await runStackSelection(s2);
    updateSession({ phase: 'blueprint' });
    const s3 = loadSession();
    await runBlueprint(s3);
    const s4 = loadSession();
    await runRepoSetup(s4);
  } else if (session.phase === 'agent') {
    await runAgentSelection(session);
    const s = loadSession();
    await runStackSelection(s);
    updateSession({ phase: 'blueprint' });
    const s2 = loadSession();
    await runBlueprint(s2);
    const s3 = loadSession();
    await runRepoSetup(s3);
  } else if (session.phase === 'stack') {
    await runStackSelection(session);
    updateSession({ phase: 'blueprint' });
    const s = loadSession();
    await runBlueprint(s);
    const s2 = loadSession();
    await runRepoSetup(s2);
  } else if (session.phase === 'blueprint') {
    await runBlueprint(session);
    const s = loadSession();
    await runRepoSetup(s);
  } else if (session.phase === 'repo') {
    await runRepoSetup(session);
  } else if (session.phase === 'build') {
    console.log(muted('  Build phase coming soon.'));
  } else {
    console.log(muted(`  Unknown phase: ${session.phase}`));
  }
}
