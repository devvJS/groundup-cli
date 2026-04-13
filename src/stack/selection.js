import { getRecommendations } from './recommend.js';
import { updateSession } from '../session/state.js';
import { sep, line, header, confirm, success, flag, amber, white, muted } from '../ui/splash.js';
import { askSelect } from '../ui/input.js';

async function selectLayer(layerName, config) {
  line();
  flag(layerName.toUpperCase());
  console.log(muted('  ' + config.reason));
  line();

  const options = config.options.map((o) => ({
    ...o,
    label: o.value === config.recommended
      ? o.label + amber(' ★')
      : o.label,
  }));

  const selected = await askSelect(
    `Choose your ${layerName}:`,
    options,
    config.recommended
  );

  sep();
  line();
  confirm(`${layerName}: ${selected}`);
  line();

  return selected;
}

export async function runStackSelection(session) {
  const { interview, agent } = session;
  const recommendations = getRecommendations(interview, agent);

  header(session.project.name, 'stack');

  console.log(white('These are your decisions. I\'ll recommend with reasoning.'));
  console.log(muted('  ★ = recommended for your project.'));
  line();

  const stack = session.stack ?? {};
  const layers = Object.keys(recommendations);

  for (const layer of layers) {
    if (stack[layer]) {
      confirm(`${layer}: ${stack[layer]}`);
      continue;
    }

    const choice = await selectLayer(layer, recommendations[layer]);
    stack[layer] = choice;
    updateSession({ stack });
  }

  line();
  console.log(success('✓ ') + white('Stack locked.'));
  line();
  sep();
  line();

  return stack;
}
