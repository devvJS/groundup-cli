import * as claudecode from './claudecode.js';
import * as gemini from './gemini.js';
import * as codex from './codex.js';
import * as ollama from './ollama.js';
import * as other from './other.js';

const AGENTS = {
  claudecode,
  gemini,
  copilot: codex,
  ollama,
  other,
};

export function getAgent(agentName) {
  const agent = AGENTS[agentName];
  if (!agent) {
    throw new Error(`Unknown agent: "${agentName}". Expected one of: ${Object.keys(AGENTS).join(', ')}`);
  }
  return agent;
}
