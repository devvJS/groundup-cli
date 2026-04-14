#!/usr/bin/env node

import { showSplash, teardownSplashResize, line } from '../src/ui/splash.js';
import { renderWelcomeBody, waitForAnyKey, hasSeenWelcome, markWelcomeSeen } from '../src/ui/intro.js';

async function main() {
  // Skip entirely on non-interactive installs (CI, Docker builds, etc.)
  // and on repeat installs after the welcome has already been acknowledged.
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;
  if (hasSeenWelcome()) return;

  await showSplash();
  teardownSplashResize();
  line();
  renderWelcomeBody();
  await waitForAnyKey();
  markWelcomeSeen();
  line();
}

main().catch(() => {
  // Never fail the install because the welcome screen choked.
  process.exit(0);
});
