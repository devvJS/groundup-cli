#!/usr/bin/env node

import { program } from 'commander';
import { createRequire } from 'module';
import { dig } from '../src/commands/dig.js';
import { resume } from '../src/commands/continue.js';
import { siteClear } from '../src/commands/site.js';
import { foreman } from '../src/commands/foreman.js';
import { updateModels } from '../src/commands/update-models.js';
import { generateWorkflow } from '../src/commands/workflow.js';
import { runBuild } from '../src/commands/build.js';

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
  .command('foreman')
  .description('Full command reference and help')
  .action(foreman);

program
  .command('update-models')
  .description('Refresh available models from provider APIs')
  .action(updateModels);

// internal dev commands — not advertised in help or commands table
program
  .command('workflow')
  .description(false)
  .action(async () => {
    const result = await generateWorkflow({ projectRoot: process.cwd() });
    if (!result.approved) process.exit(1);
  });

program
  .command('build')
  .description(false)
  .action(async () => {
    const result = await runBuild({ projectRoot: process.cwd() });
    if (!result.completed) process.exit(1);
  });

program.parse(process.argv);