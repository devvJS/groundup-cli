import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.groundup');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function read() {
  if (!fs.existsSync(CONFIG_FILE)) return { keys: {} };
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    if (!data.keys) data.keys = {};
    return data;
  } catch {
    return { keys: {} };
  }
}

function write(data) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function get(provider) {
  const data = read();
  return data.keys?.[provider] || null;
}

export function set(provider, key) {
  const data = read();
  data.keys[provider] = key;
  write(data);
}

export function configPath() {
  return CONFIG_FILE;
}

export function getFlag(name) {
  const data = read();
  return data.flags?.[name] ?? null;
}

export function setFlag(name, value) {
  const data = read();
  if (!data.flags) data.flags = {};
  data.flags[name] = value;
  write(data);
}

export function getResponseTimes(provider) {
  const data = read();
  return data.responseTimes?.[provider] || [];
}

export function recordResponseTime(provider, ms) {
  const data = read();
  if (!data.responseTimes) data.responseTimes = {};
  const arr = (data.responseTimes[provider] || []).slice();
  arr.push(ms);
  while (arr.length > 5) arr.shift();
  data.responseTimes[provider] = arr;
  write(data);
}

export function getTokenCounts(provider) {
  const data = read();
  return data.tokenCounts?.[provider] || [];
}

export function recordTokenCount(provider, count) {
  const data = read();
  if (!data.tokenCounts) data.tokenCounts = {};
  const arr = (data.tokenCounts[provider] || []).slice();
  arr.push(count);
  while (arr.length > 5) arr.shift();
  data.tokenCounts[provider] = arr;
  write(data);
}

// Maps provider key → default agent key used for build-phase dispatch.
export const PROVIDER_TO_AGENT = {
  claudecode: 'claudecode',
  claude: 'claudecode',
  openai: 'copilot',
  gemini: 'gemini',
  ollama: 'other',
};

export const AGENT_LABELS = {
  claudecode: 'Claude Code',
  cursor: 'Cursor',
  copilot: 'GitHub Copilot',
  gemini: 'Gemini',
  other: 'Other',
};
