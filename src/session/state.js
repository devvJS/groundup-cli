import fs from 'fs';
import path from 'path';

const SESSION_DIR = '.groundup';
const SESSION_FILE = '.groundup/session.json';

export const VALID_PHASES = ['seed', 'interview', 'blueprint', 'repo', 'build'];

const defaultSession = {
  version: '1.0.0',
  project: {
    name: null,
    dir: null,
    created: null,
    lastUpdated: null,
  },
  phase: 'seed',
  interview: {
    purpose: null,
    platform: null,
    provider: null,
    answers: [],
  },
  agent: null,
  stack: {},
  blueprint: null,
  repo: null,
  build: {
    currentPhaseIndex: 0,
    status: 'idle',
    snapshots: {},
  },
};

export function sessionExists(projectDir) {
  const filePath = projectDir ? path.join(projectDir, SESSION_FILE) : SESSION_FILE;
  return fs.existsSync(filePath);
}

export function loadSession(projectDir) {
  const filePath = projectDir ? path.join(projectDir, SESSION_FILE) : SESSION_FILE;
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
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

/**
 * Merge interview-phase updates into the session and persist immediately.
 * Call this after every seed answer, provider choice, and interview Q&A
 * so that .groundup/session.json is always current.
 *
 * @param {string} projectDir — absolute path to the project directory
 * @param {object} updates — partial interview object:
 *   { purpose?, platform?, provider?, answers?, phase? }
 *   `phase` (if provided) is written to the top-level session.phase
 *   and validated against VALID_PHASES.
 */
export function saveInterviewProgress(projectDir, updates = {}) {
  const sessionPath = path.join(projectDir, SESSION_FILE);
  const dir = path.join(projectDir, SESSION_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let current = null;
  if (fs.existsSync(sessionPath)) {
    try {
      current = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
    } catch {
      current = null;
    }
  }
  if (!current) current = JSON.parse(JSON.stringify(defaultSession));

  const { phase, ...interviewUpdates } = updates;

  const merged = {
    ...current,
    project: {
      ...(current.project || {}),
      dir: current.project?.dir ?? projectDir,
      lastUpdated: new Date().toISOString(),
    },
    interview: {
      ...(current.interview || {}),
      ...interviewUpdates,
    },
  };

  if (phase !== undefined) {
    if (!VALID_PHASES.includes(phase)) {
      throw new Error(`saveInterviewProgress: invalid phase "${phase}" (expected one of ${VALID_PHASES.join(', ')})`);
    }
    merged.phase = phase;
  }

  fs.writeFileSync(sessionPath, JSON.stringify(merged, null, 2));
  return merged;
}