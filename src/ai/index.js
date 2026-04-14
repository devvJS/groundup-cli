import * as claude from './providers/claude.js';
import * as claudecode from './providers/claudecode.js';
import * as openai from './providers/openai.js';
import * as gemini from './providers/gemini.js';
import * as ollama from './providers/ollama.js';

const providers = { claudecode, claude, openai, gemini, ollama };

// getProvider returns an object with a stream() that closes over the chosen
// model. Callers that don't care about model selection can omit it — each
// provider falls back to its own DEFAULT_MODEL.
export function getProvider(name, model) {
  const p = providers[name];
  if (!p) throw new Error(`Unknown AI provider: ${name}`);
  return {
    stream(messages, systemPrompt) {
      return p.stream(messages, systemPrompt, model ? { model } : {});
    },
  };
}
