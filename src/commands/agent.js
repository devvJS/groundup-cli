import { agents } from '../interview/agents.js';
import { updateSession } from '../session/state.js';
import { sep, line, header, confirm, success, amber, white, muted } from '../ui/splash.js';
import { askMultiselect } from '../ui/input.js';

export async function runAgentSelection(session) {
  header(session.project.name, 'agent');

  console.log(white('groundup is agent-agnostic. Pick what you\'re building with.'));
  console.log(muted('  Select all that apply to your workflow.'));
  line();

  const selected = await askMultiselect(
    'What AI are you building with?',
    agents.map((a) => ({
      value: a.value,
      label: a.label,
      hint: a.hint,
    }))
  );

  const primary = agents.find((a) => a.value === selected[0]);
  const mcpEnabled = selected.includes('claude');

  const contextFiles = selected
    .map((s) => agents.find((a) => a.value === s)?.contextFile)
    .filter(Boolean);

  updateSession({
    agent: {
      primary: selected[0],
      all: selected,
      contextFiles,
      mcpEnabled,
    },
    phase: 'stack',
  });

  sep();
  line();
  confirm(`Primary: ${primary.label}`);
  if (selected.length > 1) {
    console.log(muted(`  + ${selected.slice(1).join(', ')}`));
  }
  console.log(muted(`  Context files: ${contextFiles.join(', ')}`));
  if (mcpEnabled) {
    console.log(amber('■ ') + muted('MCP integration enabled'));
  }
  line();
  sep();
  line();

  return { primary: selected[0], all: selected, contextFiles, mcpEnabled };
}
