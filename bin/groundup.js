#!/usr/bin/env node

import { program } from 'commander';
import { createRequire } from 'module';
import { dig } from '../src/commands/dig.js';
import { resume } from '../src/commands/continue.js';
import { siteClear } from '../src/commands/site.js';
import { foreman } from '../src/commands/foreman.js';
import { updateModels } from '../src/commands/update-models.js';
import { runDeploy } from '../src/commands/deploy.js';
import { renderPhaseFailure } from '../src/ui/phase-failure.js';
import { renderCommandHelp, HELP } from '../src/ui/help.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

// Suppress commander's default help entirely
program
  .name('groundup')
  .description('Build from nothing.')
  .version(version, '-v, --version', 'current version and changelog')
  .helpOption(false)
  .addHelpCommand(false);

// Wrap an action to intercept --help / -h before running the real handler
function helpGuard(helpKey, action) {
  return (...args) => {
    const cmd = args[args.length - 1]; // commander passes Command as last arg
    const rawArgs = cmd?.args ?? [];
    if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
      renderCommandHelp(HELP[helpKey]);
      return;
    }
    return action(...args);
  };
}

program
  .command('dig [name]')
  .description('Start a new project — the hero command')
  .allowUnknownOption()
  .action(helpGuard('dig', dig));

program
  .command('continue')
  .description('Resume a paused session')
  .allowUnknownOption()
  .action(helpGuard('continue', resume));

program
  .command('site')
  .description('View current session details')
  .allowUnknownOption()
  .action(helpGuard('site', () => console.log('site coming soon')));

program
  .command('site-clear')
  .description('Discard session and start fresh')
  .allowUnknownOption()
  .action(helpGuard('site-clear', siteClear));

program
  .command('foreman')
  .description('Full command reference and help')
  .allowUnknownOption()
  .action(helpGuard('foreman', foreman));

program
  .command('deploy')
  .description('Deploy to production')
  .allowUnknownOption()
  .action(helpGuard('deploy', async () => {
    const result = await runDeploy({ projectRoot: process.cwd() });
    if (result?.fallthrough) {
      renderPhaseFailure({
        header: "deploy didn't land",
        hint: result.fallthrough.hint,
      });
    }
  }));

program
  .command('update-models')
  .description('Refresh available models from provider APIs')
  .allowUnknownOption()
  .action(helpGuard('update-models', updateModels));

// `groundup help` → foreman
program
  .command('help')
  .description(false)
  .action(foreman);

// No args / bare --help / -h → foreman
if (process.argv.length <= 2 ||
    (process.argv.length === 3 && (process.argv[2] === '--help' || process.argv[2] === '-h'))) {
  foreman();
  process.exit(0);
}

program.parse(process.argv);
