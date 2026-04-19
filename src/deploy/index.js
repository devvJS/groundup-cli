// Deploy provider registry. Returns the adapter module for a given deploy
// target name (e.g. "Vercel"). Each provider exports: detect(), preflight(cwd),
// deploy(cwd), and parseUrl(output). Called by src/commands/deploy.js.

import * as vercel from './vercel.js';

const PROVIDERS = {
  vercel,
};

/**
 * Return the deploy provider for a target name, or null if unsupported.
 * @param {string} target — deploy target from blueprint (e.g. "Vercel")
 * @returns {object|null} provider module with detect/preflight/deploy/parseUrl
 */
export function getDeployProvider(target) {
  if (!target) return null;
  const key = target.toLowerCase().trim();
  return PROVIDERS[key] ?? null;
}
