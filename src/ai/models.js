// Model catalog — per-provider list of selectable models with human-friendly
// cost estimates and per-phase recommendation tags. Cost strings are
// display-only snapshots; update as provider pricing changes.

export const PROVIDER_LABELS = {
  claudecode: 'Claude Code',
  claude: 'Anthropic (Claude API)',
  openai: 'OpenAI',
  gemini: 'Gemini',
  ollama: 'Ollama',
};

export const MODELS = {
  claudecode: [
    {
      value: 'claudecode',
      label: 'Claude Code',
      cost: 'subscription — no per-call billing',
      recommendedFor: ['interview', 'build'],
    },
  ],
  claude: [
    {
      value: 'claude-opus-4-5',
      label: 'Claude Opus 4.5',
      cost: '$15 / 1M in  ·  $75 / 1M out',
      recommendedFor: ['build'],
    },
    {
      value: 'claude-sonnet-4-5',
      label: 'Claude Sonnet 4.5',
      cost: '$3 / 1M in  ·  $15 / 1M out',
      recommendedFor: ['interview'],
    },
    {
      value: 'claude-haiku-4-5',
      label: 'Claude Haiku 4.5',
      cost: '$0.80 / 1M in  ·  $4 / 1M out',
      recommendedFor: [],
    },
  ],
  openai: [
    {
      value: 'o1',
      label: 'o1',
      cost: '$15 / 1M in  ·  $60 / 1M out',
      recommendedFor: ['build'],
    },
    {
      value: 'gpt-4o',
      label: 'GPT-4o',
      cost: '$2.50 / 1M in  ·  $10 / 1M out',
      recommendedFor: [],
    },
    {
      value: 'gpt-4o-mini',
      label: 'GPT-4o mini',
      cost: '$0.15 / 1M in  ·  $0.60 / 1M out',
      recommendedFor: ['interview'],
    },
  ],
  gemini: [
    {
      value: 'gemini-1.5-pro',
      label: 'Gemini 1.5 Pro',
      cost: '$1.25 / 1M in  ·  $5 / 1M out',
      recommendedFor: ['build'],
    },
    {
      value: 'gemini-1.5-flash',
      label: 'Gemini 1.5 Flash',
      cost: '$0.075 / 1M in  ·  $0.30 / 1M out',
      recommendedFor: ['interview'],
    },
  ],
  ollama: [
    {
      value: 'llama3.1',
      label: 'Llama 3.1 (local)',
      cost: 'free — local',
      recommendedFor: ['build'],
    },
    {
      value: 'llama3',
      label: 'Llama 3 (local)',
      cost: 'free — local',
      recommendedFor: ['interview'],
    },
  ],
};

export function modelsForPhase(phase, onboardedProviders) {
  const out = [];
  for (const provider of onboardedProviders) {
    const list = MODELS[provider] ?? [];
    for (const m of list) {
      out.push({
        provider,
        model: m.value,
        label: m.label,
        cost: m.cost,
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
