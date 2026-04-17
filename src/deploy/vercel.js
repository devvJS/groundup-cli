// Vercel deploy provider. Implements the provider interface (detect, preflight,
// deploy, parseUrl) by shelling out to the Vercel CLI. No SDK dependency —
// everything goes through `vercel` on PATH. Called by src/commands/deploy.js
// via src/deploy/index.js.
//
// Assumes cwd is already the project directory.

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Check whether the `vercel` CLI is installed and on PATH.
 * @returns {boolean}
 */
export function detect() {
  try {
    execSync('vercel --version', { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run preflight checks: ensure the user is logged in and the project is linked.
 * Appends .vercel/ to .gitignore if not already present.
 *
 * Why .vercel/ in .gitignore: the Vercel CLI creates .vercel/project.json on
 * link, containing org/project IDs. These are not secrets but are
 * environment-specific — committing them would tie every clone to one Vercel
 * org. Same reasoning as .groundup/ being ignored.
 *
 * @param {string} cwd — project directory
 * @returns {{ ready: boolean, error?: string }}
 */
export function preflight(cwd) {
  // Ensure .vercel/ is gitignored before any vercel command creates it
  ensureVercelIgnored(cwd);

  // Check login — `vercel whoami` exits 1 if not logged in
  const whoami = spawnSync('vercel', ['whoami'], { cwd, encoding: 'utf-8', stdio: 'pipe' });
  if (whoami.status !== 0) {
    return {
      ready: false,
      error: 'not logged in to Vercel. run `vercel login` and try again.',
    };
  }

  // Link project if .vercel/project.json is missing. `vercel link --yes`
  // auto-creates a new Vercel project or connects to an existing one.
  const projectJson = path.join(cwd, '.vercel', 'project.json');
  if (!fs.existsSync(projectJson)) {
    const link = spawnSync('vercel', ['link', '--yes'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    if (link.status !== 0) {
      const msg = (link.stderr || '').trim();
      return {
        ready: false,
        error: `vercel link failed${msg ? ': ' + msg : ''}`,
      };
    }
  }

  return { ready: true };
}

/**
 * Deploy the project to Vercel production.
 * @param {string} cwd — project directory
 * @returns {{ ok: boolean, output: string, error?: string }}
 */
export function deploy(cwd) {
  const result = spawnSync('vercel', ['--prod', '--yes'], {
    cwd,
    encoding: 'utf-8',
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  const output = (result.stdout || '').trim();
  const error = (result.stderr || '').trim();

  if (result.status !== 0) {
    return { ok: false, output, error: error || 'vercel deploy exited with non-zero status' };
  }

  return { ok: true, output };
}

/**
 * Extract the production URL from `vercel --prod` output.
 * Vercel CLI prints the deployment URL as the last line of stdout.
 * @param {string} output — stdout from deploy()
 * @returns {string|null}
 */
export function parseUrl(output) {
  if (!output) return null;
  const lines = output.trim().split('\n');
  // Walk backwards to find the first URL-shaped line
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (/^https?:\/\//.test(line)) return line;
  }
  return null;
}

function ensureVercelIgnored(cwd) {
  const gitignorePath = path.join(cwd, '.gitignore');
  const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
  const alreadyIgnored = existing
    .split('\n')
    .map((l) => l.trim())
    .some((l) => l === '.vercel/' || l === '.vercel');
  if (!alreadyIgnored) {
    const prefix = existing.length && !existing.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(gitignorePath, existing + prefix + '.vercel/\n');
  }
}
