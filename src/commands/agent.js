import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { agents } from '../interview/agents.js';
import { updateSession } from '../session/state.js';
import { showKeyboardHints } from '../ui/prompts.js';

const amber = chalk.hex('#F5A623');
const muted = chalk.hex('#666666');
const success = chalk.hex('#4CAF50');

export async function runAgentSelection(session) {
  clack.intro(amber('■ groundup — agent'));

  console.log(muted('  groundup is agent-agnostic. Pick what you\'re building with.'));
  console.log(muted('  This determines your context file and MCP availability.'));
  console.log(muted('  Select all that apply to your workflow.'));

  showKeyboardHints(true);

  const selected = await clack.multiselect({
    message: 'What AI are you building with?',
    options: agents.map((a) => ({
      value: a.value,
      label: a.label,
      hint: a.hint,
    })),
    required: true,
  });

  if (clack.isCancel(selected)) {
    clack.cancel(amber('■ ') + 'Session saved. Run ' + chalk.white('groundup continue') + ' to pick up where you left off.');
    process.exit(0);
  }

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

  console.log('');
  console.log(success('  ✓ ') + chalk.white(`Primary: ${primary.label}`));
  if (selected.length > 1) {
    console.log(muted(`  + ${selected.slice(1).join(', ')}`));
  }
  console.log(muted(`  Context files: ${contextFiles.join(', ')}`));
  if (mcpEnabled) {
    console.log(amber('  ■ ') + muted('MCP integration enabled'));
  }

  clack.outro(success('✓ Agent selection complete.'));

  return { primary: selected[0], all: selected, contextFiles, mcpEnabled };
}
