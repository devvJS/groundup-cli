import { showSplash, teardownSplashResize, line, amber, white, muted, sep } from '../ui/splash.js';
import { sessionExists, loadSession, saveSession, updateSession, clearSession, saveInterviewProgress } from '../session/state.js';
// DEPRECATED: replaced by AI engine in v0.2.0
// import { runInterview } from '../interview/engine.js';
// import { runAgentSelection } from './agent.js';
// import { runStackSelection } from '../stack/selection.js';
// import { runBlueprint } from './blueprint.js';
import { runRepoSetup } from './repo.js';
import { resume } from './continue.js';
import { askSelect, askText } from '../ui/input.js';
import { runAIInterview } from '../ai/interview.js';
import { get as getKey, set as setKey } from '../ai/config.js';
import { isInstalled as claudeCodeInstalled } from '../ai/providers/claudecode.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLANS_DIR = path.join(__dirname, '..', 'plans');

const PROVIDERS = [
  { value: 'claudecode', label: 'Claude Code', hint: 'local — uses your claude.ai subscription' },
  { value: 'claude', label: 'Claude', hint: 'Anthropic API — claude-opus-4-5' },
  { value: 'openai', label: 'OpenAI', hint: 'gpt-4o' },
  { value: 'gemini', label: 'Gemini', hint: 'google — gemini-1.5-pro' },
  { value: 'ollama', label: 'Ollama', hint: 'local — llama3' },
];

const CLAUDE_CODE_INSTALL_URL = 'https://claude.ai/download';

const PROVIDER_KEY_URLS = {
  claude: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/apikey',
};

const PLATFORMS = [
  { value: 'web', label: 'Web app' },
  { value: 'mobile', label: 'Mobile app' },
  { value: 'cli', label: 'CLI tool' },
  { value: 'api', label: 'API / backend service' },
  { value: 'desktop', label: 'Desktop app' },
  { value: 'library', label: 'Library / package' },
  { value: 'other', label: 'Something else' },
];

function installTemplates(projectDir, projectName, purpose, platform) {
  const groundupSrc = path.join(PLANS_DIR, 'GROUNDUP.md');
  const blueprintSrc = path.join(PLANS_DIR, 'BLUEPRINT.md');

  if (fs.existsSync(groundupSrc)) {
    fs.copyFileSync(groundupSrc, path.join(projectDir, 'GROUNDUP.md'));
  }

  if (fs.existsSync(blueprintSrc)) {
    const platformLabel = PLATFORMS.find((p) => p.value === platform)?.label ?? platform;
    const filled = fs
      .readFileSync(blueprintSrc, 'utf-8')
      .replace('[project-name]', projectName)
      .replace('[purpose — one sentence, filled from seed question 1]', purpose)
      .replace('[filled from seed question 2]', platformLabel);
    fs.writeFileSync(path.join(projectDir, 'BLUEPRINT.md'), filled);
  }
}

async function ensureProviderKey(provider) {
  if (provider === 'ollama' || provider === 'claudecode') return;
  const existing = getKey(provider);
  if (existing) return;

  const label = PROVIDERS.find((p) => p.value === provider)?.label ?? provider;
  console.log(amber('■ ') + white(`${label} API key not found.`));
  console.log(muted('  Stored at ~/.groundup/config.json (local, not synced).'));
  console.log(amber('  → ') + white(`Get your key at: ${PROVIDER_KEY_URLS[provider]}`));
  const key = await askText(`Paste your ${label} API key:`, null, true, true);
  setKey(provider, key);
  line();
  console.log(muted('  Key saved.'));
  sep();
  line();
}

export async function dig(name) {
  await showSplash();
  teardownSplashResize();

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

  process.chdir(projectDir);

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
    phase: 'seed',
  });

  console.log(muted(`  Project directory: ${projectDir}`));
  line();

  await runSeedToInterview(projectName, projectDir);
}

export async function runSeedToInterview(projectName, projectDir, prefill = {}, priorHistory = []) {
  // --- seed question 1: purpose ---
  const purpose = prefill.purpose ?? await askText(
    'In one sentence, what are you building?',
    'e.g. a CLI that scaffolds new projects from nothing',
    true
  );
  if (!prefill.purpose) { sep(); line(); }
  saveInterviewProgress(projectDir, { purpose, phase: 'seed' });

  // --- seed question 2: platform ---
  const platform = prefill.platform ?? await askSelect(
    'What kind of thing is it?',
    PLATFORMS,
    'web'
  );
  if (!prefill.platform) { sep(); line(); }
  saveInterviewProgress(projectDir, { platform, phase: 'seed' });

  // --- provider selection ---
  let provider = prefill.provider;
  if (!provider) {
    while (true) {
      provider = await askSelect(
        'Which AI agent should run your interview?',
        PROVIDERS,
        'claudecode'
      );
      sep();
      line();
      if (provider === 'claudecode' && !claudeCodeInstalled()) {
        console.log(amber('■ ') + white('Claude Code not detected on this machine.'));
        console.log(amber('  → ') + white(`Install it at: ${CLAUDE_CODE_INSTALL_URL}`));
        console.log(muted('  Or pick another provider.'));
        line();
        provider = null;
        continue;
      }
      break;
    }
  }

  await ensureProviderKey(provider);
  saveInterviewProgress(projectDir, { provider, phase: 'interview' });

  // --- install plan templates into the project dir (idempotent) ---
  installTemplates(projectDir, projectName, purpose, platform);

  // --- phase: AI interview ---
  try {
    await runAIInterview({ purpose, platform }, provider, projectDir, priorHistory);
  } catch (err) {
    line();
    console.log(amber('■ ') + white(`Interview failed: ${err.message}`));
    console.log(muted('  Session saved. Run groundup continue to retry.'));
    line();
    return;
  }

  updateSession({ ...loadSession(), phase: 'repo' });

  // --- phase: repo setup ---
  await runRepoSetup(projectDir);

  // DEPRECATED v0.2.0 — legacy phases replaced by AI engine:
  //   runInterview()       → runAIInterview()
  //   runAgentSelection()  → folded into provider select
  //   runStackSelection()  → AI derives from interview
  //   runBlueprint()       → BLUEPRINT.md maintained live during interview
}
