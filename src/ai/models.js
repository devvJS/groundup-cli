import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, 'models.config.json'), 'utf8'));

export const PROVIDER_LABELS = config.providerLabels;
export const MODELS = config.models;

export function modelsForPhase(phase, onboardedProviders) {
  const out = [];
  for (const provider of onboardedProviders) {
    const list = MODELS[provider] ?? [];
    for (const m of list) {
      out.push({
        provider,
        model: m.value,
        label: m.label,
        descriptor: m.descriptor,
        recommended: m.recommendedFor.includes(phase),
      });
    }
  }
  return out;
}

export function recommendedFor(phase, onboardedProviders) {
  const candidates = modelsForPhase(phase, onboardedProviders);
  return candidates.find((c) => c.recommended) ?? candidates[0] ?? null;
}
