// Model catalog — per-provider list of selectable models with context
// window + capability descriptors and per-phase recommendation tags.

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
      descriptor: '200K context · subscription-backed',
      recommendedFor: ['interview', 'build'],
    },
  ],
  claude: [
    {
      value: 'claude-opus-4-6',
      label: 'Claude Opus 4.6',
      descriptor: '200K context · most capable',
      recommendedFor: ['build'],
    },
    {
      value: 'claude-sonnet-4-6',
      label: 'Claude Sonnet 4.6',
      descriptor: '200K context · fast and capable',
      recommendedFor: ['interview'],
    },
    {
      value: 'claude-haiku-4-5-20251001',
      label: 'Claude Haiku 4.5',
      descriptor: '200K context · fastest / lightest',
      recommendedFor: [],
    },
  ],
  openai: [
    {
      value: 'o1',
      label: 'o1',
      descriptor: '200K context · deepest reasoning',
      recommendedFor: ['build'],
    },
    {
      value: 'gpt-4o',
      label: 'GPT-4o',
      descriptor: '128K context · balanced',
      recommendedFor: [],
    },
    {
      value: 'gpt-4o-mini',
      label: 'GPT-4o mini',
      descriptor: '128K context · fastest / lightest',
      recommendedFor: ['interview'],
    },
  ],
  gemini: [
    {
      value: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro',
      descriptor: '1M context · most capable',
      recommendedFor: ['build'],
    },
    {
      value: 'gemini-2.0-flash',
      label: 'Gemini 2.0 Flash',
      descriptor: '1M context · fastest / lightest',
      recommendedFor: ['interview'],
    },
  ],
  ollama: [
    {
      value: 'llama3.1',
      label: 'Llama 3.1 (local)',
      descriptor: 'local · no API cost · lower quality',
      recommendedFor: ['build'],
    },
    {
      value: 'llama3',
      label: 'Llama 3 (local)',
      descriptor: 'local · no API cost · lower quality',
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
