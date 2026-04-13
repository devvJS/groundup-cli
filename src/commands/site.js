import fs from 'fs';
import path from 'path';
import os from 'os';
import { sessionExists, loadSession, clearSession } from '../session/state.js';
import { line, amber, white, muted, success } from '../ui/splash.js';

const PROJECTS_FILE = path.join(os.homedir(), '.groundup', 'projects.json');

function findRegisteredProjectDir() {
  if (!fs.existsSync(PROJECTS_FILE)) return null;
  try {
    const raw = fs.readFileSync(PROJECTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : Object.values(parsed);
    const cwd = process.cwd();
    const match = list.find((p) => p && p.dir && path.resolve(p.dir) === cwd);
    if (!match) return null;
    const sessionPath = path.join(match.dir, '.groundup', 'session.json');
    return fs.existsSync(sessionPath) ? match.dir : null;
  } catch {
    return null;
  }
}

export async function siteClear() {
  if (sessionExists()) {
    const session = loadSession();
    clearSession();
    console.log(amber('■ ') + white(`Session cleared: ${session.project.name}`));
    console.log(success('✓ ') + muted('Ready for a fresh start.'));
    console.log(muted('  Run ') + white('groundup dig [name]') + muted(' to begin.'));
    line();
    return;
  }

  const registeredDir = findRegisteredProjectDir();
  if (registeredDir) {
    const previousCwd = process.cwd();
    process.chdir(registeredDir);
    const session = loadSession();
    clearSession();
    process.chdir(previousCwd);
    console.log(amber('■ ') + white(`Session cleared: ${session?.project?.name ?? path.basename(registeredDir)}`));
    console.log(success('✓ ') + muted('Ready for a fresh start.'));
    console.log(muted('  Run ') + white('groundup dig [name]') + muted(' to begin.'));
    line();
    return;
  }

  console.log(muted('  No session found in this directory. Navigate to your project folder and try again.'));
  line();
}
