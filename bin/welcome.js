#!/usr/bin/env node

import { showSplash, teardownSplashResize, line } from '../src/ui/splash.js';
import { renderWelcomeBody, waitForAnyKey, hasSeenWelcome, markWelcomeSeen } from '../src/ui/intro.js';

async function main() {
  // --force bypasses the seenWelcome + TTY checks for local testing.
  // Otherwise: skip on non-interactive installs (CI, Docker) and on
  // repeat installs after the welcome has already been acknowledged.
  const force = process.argv.includes('--force');
  if (!force && !(process.stdin.isTTY && !hasSeenWelcome())) return;

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
