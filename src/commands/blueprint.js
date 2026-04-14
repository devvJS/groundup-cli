import { generateBlueprint } from '../blueprint/generate.js';
import { updateSession } from '../session/state.js';
import { sep, line, header, confirm, amber, white, muted, success, warning } from '../ui/splash.js';
import { askSelect } from '../ui/input.js';

export async function runBlueprint(session) {
  header(session.project.name, 'blueprint');

  console.log(muted('  Generating .groundup/BLUEPRINT.md from your decisions...'));
  line();

  const content = generateBlueprint(session);

  sep();
  line();
  console.log(content);
  sep();
  line();

  const decision = await askSelect(
    'Does this reflect what you want to build?',
    [
      { value: 'approve', label: 'A — Approve and continue', hint: 'break ground' },
      { value: 'edit', label: 'E — Edit .groundup/BLUEPRINT.md first', hint: 'resume when ready' },
      { value: 'restart', label: 'R — Restart interview', hint: 'start over' },
      { value: 'quit', label: 'Q — Quit', hint: 'session saved' },
    ],
    'approve'
  );

  if (decision === 'quit') {
    line();
    console.log(amber('■ ') + white('Session saved. Run ') + amber('groundup continue') + white(' to pick up where you left off.'));
    line();
    process.exit(0);
  }

  if (decision === 'restart') {
    updateSession({ phase: 'interview', interview: {}, stack: {}, blueprint: null });
    line();
    console.log(warning('↺ ') + white('Interview restarted. Run ') + amber('groundup continue') + white(' to begin again.'));
    line();
    process.exit(0);
  }

  if (decision === 'edit') {
    updateSession({ phase: 'repo', blueprint: 'edited' });
    line();
    console.log(amber('■ ') + white('.groundup/BLUEPRINT.md is open for editing.'));
    console.log(muted('  Make your changes, then run ') + white('groundup continue') + muted(' to proceed.'));
    line();
    sep();
    process.exit(0);
  }

  updateSession({ phase: 'repo', blueprint: 'approved' });
  line();
  confirm('Blueprint approved. Breaking ground next.');
  line();
  sep();
  line();

  return true;
}
