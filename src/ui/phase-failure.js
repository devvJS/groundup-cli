// Inline render for phase failures (repo setup, deploy, etc.). Called by
// callers when a phase returns a failure result. Intentionally minimal —
// early-phase halt, not a completion screen.

import { sep, line, amber, white, muted } from './splash.js';

export function renderPhaseFailure({ header, hint }) {
  sep();
  console.log(amber('■ ') + white(header));
  sep();
  line();
  console.log(muted('  ' + hint));
  line();
}
