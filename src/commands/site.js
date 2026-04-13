import { sessionExists, loadSession, clearSession } from '../session/state.js';
import { line, amber, white, muted, success } from '../ui/splash.js';

export async function siteClear() {
  if (!sessionExists()) {
    console.log(muted('  No active session to clear.'));
    line();
    return;
  }

  const session = loadSession();
  clearSession();

  console.log(amber('■ ') + white(`Session cleared: ${session.project.name}`));
  console.log(success('✓ ') + muted('Ready for a fresh start.'));
  console.log(muted('  Run ') + white('groundup dig [name]') + muted(' to begin.'));
  line();
}
