import { get as getKey } from './config.js';
import { getFlag, setFlag } from './config.js';

const ENDPOINTS = {
  claude: {
    url: 'https://api.anthropic.com/v1/models',
    headers: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    }),
    extractIds: (json) => json.data?.map((m) => m.id) ?? [],
  },
  openai: {
    url: 'https://api.openai.com/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    extractIds: (json) => json.data?.map((m) => m.id) ?? [],
  },
  gemini: {
    url: (key) =>
      `https://generativelanguage.googleapis.com/v1/models?key=${key}`,
    headers: () => ({}),
    extractIds: (json) =>
      (json.models ?? []).map((m) => m.name.replace('models/', '')),
  },
  ollama: {
    url: 'http://localhost:11434/api/tags',
    headers: () => ({}),
    extractIds: (json) =>
      (json.models ?? []).map((m) => m.name.replace(/:.*$/, '')),
  },
};

export async function fetchProviderModels(provider) {
  const spec = ENDPOINTS[provider];
  if (!spec) return null;

  const key = getKey(provider);
  if (!key && provider !== 'ollama') return null;

  const url = typeof spec.url === 'function' ? spec.url(key) : spec.url;
  const headers = spec.headers(key);

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;

  const json = await res.json();
  return spec.extractIds(json);
}

export async function validateModel(provider, modelId) {
  if (provider === 'claudecode') return { valid: true };

  const flagKey = `validated_${provider}`;
  if (getFlag(flagKey)) return { valid: true };

  let ids;
  try {
    ids = await fetchProviderModels(provider);
  } catch {
    return { valid: true, skipped: true };
  }

  if (!ids) return { valid: true, skipped: true };

  const found = ids.some((id) => id === modelId || id.startsWith(modelId));
  if (found) {
    setFlag(flagKey, true);
    return { valid: true };
  }

  return { valid: false, available: ids };
}

export function clearValidationCache(provider) {
  if (provider) {
    setFlag(`validated_${provider}`, null);
  } else {
    for (const p of Object.keys(ENDPOINTS)) {
      setFlag(`validated_${p}`, null);
    }
  }
}
