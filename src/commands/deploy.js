// Deploy command. Reads the blueprint's ### Deployment section to determine the
// target, then runs the deploy provider. Called by dig.js after build completes,
// by continue.js on resume, and registered as `groundup deploy` for standalone
// re-deploys. Does NOT re-ask the deploy target — that was settled during the
// interview and approved at blueprint approval time.
//
// Retry policy: on first failure, retry once automatically with a visible
// notice. On second failure, fall through to a manual checklist item. Future
// contributors will be tempted to make the retry count configurable — don't.
// One retry catches transient network issues; anything beyond that is a real
// problem the user needs to investigate, and an infinite loop helps nobody.
//
// Assumes cwd is already the project directory.

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getDeployProvider } from '../deploy/index.js';
import { loadSession, updateSession } from '../session/state.js';
import { askSelect } from '../ui/input.js';
import { amber, white, muted, warning, line, sep } from '../ui/splash.js';

/**
 * Extract the deploy target from the blueprint's ### Deployment section.
 * @param {string} blueprintContent — full BLUEPRINT.md content
 * @returns {string|null} — target name (e.g. "Vercel") or null
 */
export function extractDeployTarget(blueprintContent) {
  if (!blueprintContent) return null;
  const lines = blueprintContent.split('\n');
  let inDeploySection = false;

  for (const raw of lines) {
    const trimmed = raw.trim();

    if (/^#{1,3}\s+deployment/i.test(trimmed)) {
      inDeploySection = true;
      continue;
    }
    if (inDeploySection && /^#{1,3}\s+/.test(trimmed)) break;

    if (inDeploySection) {
      const match = trimmed.match(/^[-*]\s+\*{0,2}Target:\*{0,2}\s*(.+)/i);
      if (match) {
        const target = match[1].trim();
        if (target === 'none' || target === 'ask' || target.startsWith('[')) return null;
        return target;
      }
    }
  }
  return null;
}

/**
 * Run the deploy stage.
 * @param {{ projectRoot: string }} options
 * @returns {{ deployed: boolean, url?: string, fallthrough?: { text: string, hint: string } }}
 */
export async function runDeploy({ projectRoot }) {
  const blueprintPath = path.join(projectRoot, '.groundup', 'BLUEPRINT.md');
  if (!fs.existsSync(blueprintPath)) {
    return { deployed: false };
  }

  const blueprint = fs.readFileSync(blueprintPath, 'utf-8');
  const target = extractDeployTarget(blueprint);
  if (!target) {
    return { deployed: false };
  }

  const provider = getDeployProvider(target);
  if (!provider) {
    return { deployed: false };
  }

  // Persist deploy phase
  const session = loadSession(projectRoot);
  updateSession({
    ...session,
    phase: 'deploy',
    deploy: { ...(session.deploy || {}), target, status: 'pending' },
  });

  // Check CLI is installed
  sep();
  console.log(amber('■ ') + white(`Deploy target: ${target}`));
  sep();
  line();

  if (!provider.detect()) {
    console.log(amber('■ ') + white(`${target} CLI not found on PATH.`));
    console.log(muted(`  Install it and run `) + amber('groundup deploy') + muted(' to try again.'));
    line();
    return buildFallthrough(target, projectRoot);
  }

  // Gate: "ship it now?"
  const shipChoice = await askSelect(
    'ship it now?',
    [
      { value: 'yes', label: 'Yes — deploy to production' },
      { value: 'skip', label: 'Skip — deploy later' },
    ],
    'yes'
  );

  if (shipChoice === 'skip') {
    line();
    console.log(muted('  deploy skipped. run ') + amber('groundup deploy') + muted(' when ready.'));
    line();
    saveDeployState(projectRoot, { status: 'skipped' });
    return { deployed: false };
  }

  // Preflight
  line();
  console.log(muted('  running preflight checks...'));
  const preflightResult = provider.preflight(projectRoot);
  if (!preflightResult.ready) {
    console.log(amber('■ ') + white(preflightResult.error));
    line();
    return buildFallthrough(target, projectRoot);
  }
  if (preflightResult.hint?.wrote) {
    console.log(muted(`  wrote vercel.json (framework: ${preflightResult.hint.framework})`));
  }
  console.log(muted('  preflight passed'));
  line();

  // First attempt
  saveDeployState(projectRoot, { status: 'in-progress' });
  console.log(muted('  deploying...'));
  let result = provider.deploy(projectRoot);

  if (result.ok) {
    return handleSuccess(result, target, provider, projectRoot);
  }

  // Retry once
  line();
  console.log(amber('■ ') + white("deploy didn't land — we'll try once more"));
  if (result.error) console.log(muted(`  ${result.error}`));
  line();

  result = provider.deploy(projectRoot);

  if (result.ok) {
    return handleSuccess(result, target, provider, projectRoot);
  }

  // Fall through after second failure
  line();
  console.log(amber('■ ') + white("second attempt failed — we'll leave this one for you"));
  if (result.error) console.log(muted(`  ${result.error}`));
  line();

  return buildFallthrough(target, projectRoot);
}

function handleSuccess(result, target, provider, projectRoot) {
  const url = provider.parseUrl(result.output);
  line();
  console.log(amber('■ ') + white('deployed'));
  if (url) console.log(muted(`  ${url}`));

  // Health check — Vercel can report "Ready" but serve nothing if framework
  // detection failed and the build produced no output. Doesn't block deploy
  // completion (Vercel's Ready status is the source of truth) but flags the
  // user that something may be off.
  if (url) {
    const health = checkDeployHealth(url);
    if (!health.ok) {
      line();
      console.log(warning('■ ') + white(`deployed, but ${url} returned ${health.status}`));
      console.log(muted('  your deployment may have built empty — check vercel.com/dashboard'));
    }
  }

  line();
  saveDeployState(projectRoot, { status: 'complete', url });
  return { deployed: true, url };
}

function checkDeployHealth(url) {
  try {
    const output = execSync(`curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${url}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const status = parseInt(output, 10);
    const ok = status >= 200 && status < 400;
    return { ok, status };
  } catch {
    return { ok: false, status: 'timeout' };
  }
}

function buildFallthrough(target, projectRoot) {
  const targetLower = target.toLowerCase();
  const hints = {
    vercel: 'run `vercel --prod` from the project directory',
  };
  const hint = hints[targetLower] || `deploy to ${target} manually`;

  saveDeployState(projectRoot, { status: 'fallthrough' });
  return {
    deployed: false,
    fallthrough: {
      text: `finish deploying to ${target}`,
      hint,
    },
  };
}

function saveDeployState(projectRoot, updates) {
  const session = loadSession(projectRoot);
  const currentDeploy = session.deploy || {};
  updateSession({
    ...session,
    deploy: { ...currentDeploy, ...updates },
  });
}
