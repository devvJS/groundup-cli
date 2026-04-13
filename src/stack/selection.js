import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { getRecommendations } from './recommend.js';
import { updateSession } from '../session/state.js';
import { showKeyboardHints } from '../ui/prompts.js';

const amber = chalk.hex('#F5A623');
const muted = chalk.hex('#666666');
const success = chalk.hex('#4CAF50');

async function selectLayer(layerName, config) {
  console.log('');
  console.log(amber(`  ■ ${layerName.toUpperCase()}`));
  console.log(muted(`  ${config.reason}`));

  showKeyboardHints(false);

  const options = config.options.map((o) => ({
    ...o,
    label: o.value === config.recommended
      ? o.label + chalk.hex('#F5A623')(' ★')
      : o.label,
  }));

  const selected = await clack.select({
    message: `Choose your ${layerName}:`,
    options,
    initialValue: config.recommended,
  });

  if (clack.isCancel(selected)) {
    clack.cancel(amber('■ ') + 'Session saved. Run ' + chalk.white('groundup continue') + ' to pick up where you left off.');
    process.exit(0);
  }

  return selected;
}

export async function runStackSelection(session) {
  const { interview, agent } = session;
  const recommendations = getRecommendations(interview, agent);

  clack.intro(amber('■ groundup — stack'));

  console.log(muted('  These are your decisions. I\'ll recommend with reasoning.'));
  console.log(muted('  ★ = recommended for your project.'));

  const stack = session.stack ?? {};
  const layers = Object.keys(recommendations);

  for (const layer of layers) {
    if (stack[layer]) {
      console.log(success(`  ✓ ${layer}: ${stack[layer]}`));
      continue;
    }

    const choice = await selectLayer(layer, recommendations[layer]);
    stack[layer] = choice;
    updateSession({ stack });
  }

  clack.outro(success('✓ Stack locked.'));

  return stack;
}