// Vercel deploy provider. Implements the provider interface (detect, preflight,
// deploy, parseUrl) by shelling out to the Vercel CLI. No SDK dependency —
// everything goes through `vercel` on PATH. Called by src/commands/deploy.js
// via src/deploy/index.js.
//
// Framework detection (ensureFrameworkHint): Vercel's automatic framework
// detection silently fails on some package shapes — notably Next.js 16.x with
// Turbopack-default output (observed April 2026, test run /tmp/gts-web-e2e).
// Vercel defaults to Framework Preset: Other, runs a generic static-site build
// that produces no output, and reports "Ready" — but serves 404 on every route.
// We detect the framework from package.json dependencies and write a minimal
// vercel.json with the framework hint before deploying.
//
// Why vercel.json instead of CLI flags like --build-env: vercel.json persists
// for future deploys, CI integrations (Vercel's GitHub app reads it), and
// manual `vercel` runs. CLI flags would only fix the one deploy groundup fires.
//
// Assumes cwd is already the project directory.

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Framework detection map. Intentionally conservative — only includes
// frameworks Vercel officially supports where we've verified auto-detection
// can fail. If the framework isn't in this map, we don't write a hint and
// let Vercel try its own detection. Adding entries here should be backed by
// a real failure case, not speculative coverage.
const FRAMEWORK_HINTS = {
  next:               'nextjs',
  vite:               'vite',
  '@sveltejs/kit':    'sveltekit',
  astro:              'astro',
  '@remix-run/dev':   'remix',
};

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

  // Write framework hint before linking — vercel link reads vercel.json
  // to configure the project's build settings on creation.
  const hint = ensureFrameworkHint(cwd);

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

  return { ready: true, hint };
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

/**
 * Detect the project's framework from package.json and write a vercel.json
 * hint if needed. Commits and pushes the file so future deploys and CI
 * integrations pick up the same hint.
 *
 * @param {string} cwd — project directory
 * @returns {{ wrote: boolean, framework?: string }}
 */
export function ensureFrameworkHint(cwd) {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) return { wrote: false };

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } catch {
    return { wrote: false };
  }

  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  let detectedFramework = null;
  for (const [dep, framework] of Object.entries(FRAMEWORK_HINTS)) {
    if (dep in deps) {
      detectedFramework = framework;
      break;
    }
  }

  if (!detectedFramework) return { wrote: false };

  const vercelJsonPath = path.join(cwd, 'vercel.json');

  if (fs.existsSync(vercelJsonPath)) {
    // vercel.json exists — check if framework is already set
    let existing;
    try {
      existing = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
    } catch {
      return { wrote: false };
    }

    if (existing.framework) {
      // Trust the user's explicit choice
      return { wrote: false };
    }

    // Add framework to existing vercel.json
    existing.framework = detectedFramework;
    fs.writeFileSync(vercelJsonPath, JSON.stringify(existing, null, 2) + '\n');
  } else {
    // Create minimal vercel.json
    fs.writeFileSync(vercelJsonPath, JSON.stringify({ framework: detectedFramework }, null, 2) + '\n');
  }

  // Commit and push so CI integrations and future deploys pick up the hint
  try {
    execSync('git add vercel.json', { cwd, encoding: 'utf-8', stdio: 'pipe' });
    const msg = 'chore: add vercel.json framework hint';
    spawnSync('git', ['commit', '-m', msg], { cwd, encoding: 'utf-8', stdio: 'pipe' });
    execSync('git push origin develop', { cwd, encoding: 'utf-8', stdio: 'pipe' });
  } catch {
    // Non-fatal — the file is on disk regardless
  }

  return { wrote: true, framework: detectedFramework };
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
