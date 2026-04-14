#!/usr/bin/env node

import fs from 'fs';
import { showSplash, teardownSplashResize, amber, white, muted, line } from '../src/ui/splash.js';
import { renderWelcomeBody, waitForAnyKey, hasSeenWelcome, markWelcomeSeen } from '../src/ui/intro.js';

const MIN_COLS = 100;

function renderTooNarrow() {
  line();
  console.log(amber('  ■ ') + white('terminal too narrow'));
  line();
  console.log('    ' + muted('groundup requires a terminal at least 100 columns wide.'));
  console.log('    ' + muted('resize your terminal and run: ') + amber('node bin/welcome.js --test'));
  line();
}

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

  if ((process.stdout.columns || 0) < MIN_COLS) {
    renderTooNarrow();
    return;
  }

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
