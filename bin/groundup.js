#!/usr/bin/env node

import { program } from 'commander';
import { createRequire } from 'module';
import { dig } from '../src/commands/dig.js';
import { resume } from '../src/commands/continue.js';
import { siteClear } from '../src/commands/site.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

program
  .name('groundup')
  .description('Build from nothing.')
  .version(version, '-v, --version', 'current version and changelog');

program
  .command('dig [name]')
  .description('Start a new project — the hero command')
  .action(dig);

program
  .command('continue')
  .description('Resume a paused session')
  .action(resume);

program
  .command('site')
  .description('View current session details')
  .action(() => console.log('site coming soon'));

program
  .command('site-clear')
  .description('Discard session and start fresh')
  .action(siteClear);

program
  .command('foreman [cmd]')
  .description('Full command reference — contextual help for any command')
  .action(() => console.log('foreman coming in phase 2'));

program.parse(process.argv);