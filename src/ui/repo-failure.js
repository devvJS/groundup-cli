// Inline render for repo-setup failures. Called by dig.js and continue.js
// when runRepoSetup returns { ok: false }. Intentionally minimal — this is
// an early-phase halt, not a completion screen.

import { sep, line, amber, white, muted } from './splash.js';

export function renderRepoFailure(result) {
  sep();
  console.log(amber('■ ') + white("repo setup didn't land"));
  sep();
  line();
  console.log(muted('  ' + result.hint));
  line();
}
