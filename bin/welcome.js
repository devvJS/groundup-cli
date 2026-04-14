#!/usr/bin/env node

import fs from 'fs';
import { showSplash, teardownSplashResize } from '../src/ui/splash.js';
import { renderWelcomeBody, waitForAnyKey, hasSeenWelcome, markWelcomeSeen } from '../src/ui/intro.js';

// --test bypasses the seenWelcome + TTY gate, but only when run from
// inside the groundup-cli source tree. A globally-installed user's cwd
// will never match, so --test is a no-op for them.
function inGroundupCliSource() {
  try {
    const pkg = JSON.parse(fs.readFileSync(process.cwd() + '/package.json', 'utf-8'));
    return pkg.name === 'groundup-cli';
  } catch {
    return false;
  }
}

async function main() {
  const testMode = process.argv.includes('--test') && inGroundupCliSource();

  // Normal path: skip on non-interactive installs (CI, Docker) and on
  // repeat installs after the welcome has already been acknowledged.
  if (!testMode && !(process.stdin.isTTY && !hasSeenWelcome())) return;

  await showSplash();
  teardownSplashResize();
  renderWelcomeBody();
  await waitForAnyKey();
  markWelcomeSeen();
}

main().catch(() => {
  // Never fail the install because the welcome screen choked.
  process.exit(0);
});
