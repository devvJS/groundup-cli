import fs from 'fs';
import path from 'path';

const SESSION_DIR = '.groundup';
const SESSION_FILE = '.groundup/session.json';

const defaultSession = {
  version: '1.0.0',
  project: {
    name: null,
    created: null,
    lastUpdated: null,
  },
  phase: 'interview',
  interview: {},
  agent: null,
  stack: {},
  blueprint: null,
  repo: null,
  build: {
    phase: null,
    completed: [],
  },
};

export function sessionExists() {
  return fs.existsSync(SESSION_FILE);
}

export function loadSession() {
  if (!sessionExists()) return null;
  const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
  return JSON.parse(raw);
}

export function saveSession(data) {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
  const session = {
    ...defaultSession,
    ...data,
    project: {
      ...defaultSession.project,
      ...data.project,
      lastUpdated: new Date().toISOString(),
    },
  };
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
}

export function clearSession() {
  if (fs.existsSync(SESSION_FILE)) {
    fs.unlinkSync(SESSION_FILE);
  }
}

export function updateSession(updates) {
  const current = loadSession() ?? defaultSession;
  saveSession({ ...current, ...updates });
}