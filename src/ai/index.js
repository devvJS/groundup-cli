import * as claude from './providers/claude.js';
import * as claudecode from './providers/claudecode.js';
import * as openai from './providers/openai.js';
import * as gemini from './providers/gemini.js';
import * as ollama from './providers/ollama.js';

const providers = { claudecode, claude, openai, gemini, ollama };

export function getProvider(name) {
  const provider = providers[name];
  if (!provider) throw new Error(`Unknown AI provider: ${name}`);
  return provider;
}
