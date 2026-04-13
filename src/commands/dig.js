import { showSplash, line, amber, white, muted, sep } from '../ui/splash.js';
import { sessionExists, loadSession, saveSession, updateSession, clearSession } from '../session/state.js';
import { runInterview } from '../interview/engine.js';
import { runAgentSelection } from './agent.js';
import { runStackSelection } from '../stack/selection.js';
import { runBlueprint } from './blueprint.js';
import { runRepoSetup } from './repo.js';
import { resume } from './continue.js';
import { askSelect, askText } from '../ui/input.js';
import fs from 'fs';
import path from 'path';

export async function dig(name) {
  showSplash();

  const projectName = name ?? 'unnamed';

  // --- directory setup ---
  const cwd = process.cwd();
  const suggestedDir = path.join(cwd, projectName);

  console.log(amber('■ ') + white(`Starting: ${projectName}`));
  line();

  const dirChoice = await askSelect(
    'Where should we create this project?',
    [
      { value: 'new', label: `Create ./${projectName}/`, hint: 'recommended' },
      { value: 'here', label: 'Use current directory', hint: cwd },
      { value: 'custom', label: 'Choose a different path' },
    ],
    'new'
  );

  sep();
  line();

  let projectDir = cwd;

  if (dirChoice === 'new') {
    projectDir = suggestedDir;
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
  } else if (dirChoice === 'custom') {
    const customPath = await askText(
      'Enter the path:',
      'e.g. ~/Projects/my-app',
      true
    );
    projectDir = path.resolve(customPath.replace('~', process.env.HOME));
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    sep();
    line();
  }

  // move into project directory
  process.chdir(projectDir);

  // check for existing session in this directory
  if (sessionExists()) {
    const existing = loadSession();
    console.log(amber('■ ') + white(`Session found: ${existing.project.name}`));
    console.log(muted(`  Last updated: ${existing.project.lastUpdated}`));
    line();

    const resumeChoice = await askSelect(
      `A session for ${existing.project.name} already exists. Resume it or start fresh?`,
      [
        { value: 'resume', label: 'Resume', hint: 'run groundup continue' },
        { value: 'fresh', label: 'Start fresh', hint: 'discard and begin new session' },
        { value: 'quit', label: 'Quit' },
      ],
      'resume'
    );

    sep();
    line();

    if (resumeChoice === 'resume') {
      await resume();
      return;
    }
    if (resumeChoice === 'quit') {
      return;
    }
    clearSession();
    console.log(muted('  Previous session discarded. Starting fresh.'));
    line();
  }

  saveSession({
    project: {
      name: projectName,
      dir: projectDir,
      created: new Date().toISOString(),
    },
    phase: 'interview',
  });

  console.log(muted(`  Project directory: ${projectDir}`));
  line();

  let session = loadSession();

  // phase 1 — interview
  const answers = await runInterview(session);
  updateSession({ phase: 'agent', interview: answers });

  // phase 2 — agent selection
  session = loadSession();
  await runAgentSelection(session);

  // phase 3 — stack selection
  session = loadSession();
  await runStackSelection(session);
  updateSession({ phase: 'blueprint' });

  // phase 4 — blueprint
  session = loadSession();
  await runBlueprint(session);

  // phase 5 — repo setup
  session = loadSession();
  await runRepoSetup(session);
}
