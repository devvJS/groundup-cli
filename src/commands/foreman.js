import { amber, white, muted, line, sep } from '../ui/splash.js';
import { renderCommandsList } from '../ui/commands.js';

export function foreman() {
  line();
  sep();
  console.log(amber('■ ') + white('groundup — foreman'));
  sep();
  line();
  console.log(muted('  full command reference'));
  line();
  renderCommandsList();
  line();
  sep();
  console.log('  ' + muted('run any command with ') + amber('--help') + muted(' for usage details.'));
  line();
}
