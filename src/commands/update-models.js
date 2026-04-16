import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { get as getKey } from '../ai/config.js';
import { fetchProviderModels, clearValidationCache } from '../ai/validate.js';
import { PROVIDER_LABELS, MODELS } from '../ai/models.js';
import { sep, line, amber, white, muted, confirm, warning } from '../ui/splash.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'ai', 'models.config.json');

const KNOWN_PATTERNS = {
  claude: [
    { pattern: /^claude-opus-/, tier: 'most capable', phase: ['build'] },
    { pattern: /^claude-sonnet-/, tier: 'fast and capable', phase: ['interview'] },
    { pattern: /^claude-haiku-/, tier: 'fastest / lightest', phase: [] },
  ],
  openai: [
    { pattern: /^o1/, tier: 'deepest reasoning', phase: ['build'] },
    { pattern: /^o3/, tier: 'deepest reasoning', phase: ['build'] },
    { pattern: /^gpt-4o-mini/, tier: 'fastest / lightest', phase: ['interview'] },
    { pattern: /^gpt-4o/, tier: 'balanced', phase: [] },
    { pattern: /^gpt-4\.1/, tier: 'balanced', phase: [] },
  ],
  gemini: [
    { pattern: /pro/, tier: 'most capable', phase: ['build'] },
    { pattern: /flash/, tier: 'fastest / lightest', phase: ['interview'] },
  ],
  ollama: [
    { pattern: /llama3\.1/, tier: 'no API cost · lower quality', phase: ['build'] },
    { pattern: /llama3/, tier: 'no API cost · lower quality', phase: ['interview'] },
    { pattern: /mistral/, tier: 'no API cost · lower quality', phase: [] },
    { pattern: /codellama/, tier: 'no API cost · lower quality', phase: [] },
  ],
};

const CONTEXT_WINDOWS = {
  claude: '200K context',
  openai: '128K context',
  gemini: '1M context',
  ollama: 'local',
};

function buildModelEntry(provider, modelId) {
  const patterns = KNOWN_PATTERNS[provider] ?? [];
  const match = patterns.find((p) => p.pattern.test(modelId));
  const ctx = CONTEXT_WINDOWS[provider] ?? '';
  const tier = match?.tier ?? 'available';
  const descriptor = ctx ? `${ctx} · ${tier}` : tier;

  return {
    value: modelId,
    label: modelId,
    descriptor,
    recommendedFor: match?.phase ?? [],
  };
}

function filterRelevantModels(provider, ids) {
  const patterns = KNOWN_PATTERNS[provider];
  if (!patterns) return ids.slice(0, 10);
  return ids.filter((id) => patterns.some((p) => p.pattern.test(id)));
}

export async function updateModels() {
  sep();
  line();
  console.log(amber('■ ') + white('groundup update-models'));
  console.log(muted('  Fetching available models from each provider...'));
  line();

  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  let updated = 0;

  for (const provider of Object.keys(KNOWN_PATTERNS)) {
    if (provider === 'claudecode') continue;

    const label = PROVIDER_LABELS[provider] ?? provider;
    const key = getKey(provider);

    if (!key && provider !== 'ollama') {
      console.log(muted(`  ${label}: no API key — skipped`));
      continue;
    }

    let ids;
    try {
      ids = await fetchProviderModels(provider);
    } catch (err) {
      console.log(warning(`  ${label}: fetch failed — ${err.message}`));
      continue;
    }

    if (!ids || ids.length === 0) {
      console.log(warning(`  ${label}: no models returned`));
      continue;
    }

    const relevant = filterRelevantModels(provider, ids);
    if (relevant.length === 0) {
      console.log(muted(`  ${label}: no recognized models in response`));
      continue;
    }

    config.models[provider] = relevant.map((id) => buildModelEntry(provider, id));
    confirm(`${label}: found ${relevant.length} models`);
    for (const id of relevant) {
      console.log(muted(`    · ${id}`));
    }
    updated++;
  }

  if (updated > 0) {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
    clearValidationCache();
    line();
    confirm('models.config.json updated');
  } else {
    line();
    console.log(muted('  No providers updated.'));
  }

  line();
  sep();
  line();
}
