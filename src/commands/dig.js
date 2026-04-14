import { showSplash, teardownSplashResize, line, amber, white, muted, sep } from '../ui/splash.js';
import { sessionExists, loadSession, saveSession, updateSession, clearSession, saveInterviewProgress } from '../session/state.js';
// DEPRECATED: replaced by AI engine in v0.2.0
// import { runInterview } from '../interview/engine.js';
// import { runAgentSelection } from './agent.js';
// import { runStackSelection } from '../stack/selection.js';
// import { runBlueprint } from './blueprint.js';
import { runRepoSetup } from './repo.js';
import { resume } from './continue.js';
import { askSelect, askMultiselect, askText } from '../ui/input.js';
import { runAIInterview } from '../ai/interview.js';
import { get as getKey, set as setKey } from '../ai/config.js';
import { isInstalled as claudeCodeInstalled } from '../ai/providers/claudecode.js';
import { MODELS, PROVIDER_LABELS, modelsForPhase, recommendedFor } from '../ai/models.js';
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

const AGENTS = [
  { value: 'claudecode', label: 'Claude Code' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'copilot', label: 'GitHub Copilot' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'other', label: 'Other' },
];

const PLATFORMS = [
  { value: 'web', label: 'Web app' },
  { value: 'mobile', label: 'Mobile app' },
  { value: 'cli', label: 'CLI tool' },
  { value: 'api', label: 'API / backend service' },
  { value: 'desktop', label: 'Desktop app' },
  { value: 'library', label: 'Library / package' },
  { value: 'other', label: 'Something else' },
];

function narrate(verb, relPath) {
  console.log(amber('■ ') + white(verb + ' ') + muted(relPath));
}

function installGroundupDir(projectDir, projectName, purpose, platform) {
  console.log(amber('■ ') + white('setting up .groundup/'));
  line();

  const groundupDir = path.join(projectDir, '.groundup');
  if (!fs.existsSync(groundupDir)) {
    fs.mkdirSync(groundupDir, { recursive: true });
    narrate('created', '.groundup/');
  }

  const groundupSrc = path.join(PLANS_DIR, 'GROUNDUP.md');
  const groundupDest = path.join(groundupDir, 'GROUNDUP.md');
  if (fs.existsSync(groundupSrc) && !fs.existsSync(groundupDest)) {
    fs.copyFileSync(groundupSrc, groundupDest);
    narrate('wrote', '.groundup/GROUNDUP.md');
  }

  const blueprintSrc = path.join(PLANS_DIR, 'BLUEPRINT.md');
  const blueprintDest = path.join(groundupDir, 'BLUEPRINT.md');
  if (fs.existsSync(blueprintSrc) && !fs.existsSync(blueprintDest)) {
    const platformLabel = PLATFORMS.find((p) => p.value === platform)?.label ?? platform;
    const filled = fs
      .readFileSync(blueprintSrc, 'utf-8')
      .replace('[project-name]', projectName)
      .replace('[purpose — one sentence, filled from seed question 1]', purpose)
      .replace('[filled from seed question 2]', platformLabel);
    fs.writeFileSync(blueprintDest, filled);
    narrate('wrote', '.groundup/BLUEPRINT.md');
  }

  const gitignorePath = path.join(projectDir, '.gitignore');
  const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
  const alreadyIgnored = existing
    .split('\n')
    .map((l) => l.trim())
    .some((l) => l === '.groundup/' || l === '.groundup');
  if (!alreadyIgnored) {
    const prefix = existing.length && !existing.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(gitignorePath, existing + prefix + '.groundup/\n');
    narrate(existing ? 'updated' : 'created', '.gitignore (+ .groundup/)');
  }

  line();
  sep();
  line();
}

function installAgentDirs(projectDir, agents) {
  if (!agents || agents.length === 0) return;

  console.log(amber('■ ') + white('scaffolding agent directories'));
  line();

  const agentsRoot = path.join(projectDir, '.groundup', 'agents');
  if (!fs.existsSync(agentsRoot)) {
    fs.mkdirSync(agentsRoot, { recursive: true });
    narrate('created', '.groundup/agents/');
  }

  for (const agent of agents) {
    const dir = path.join(agentsRoot, agent);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      narrate('created', `.groundup/agents/${agent}/`);
    }
    const agentMd = path.join(dir, 'AGENT.md');
    if (!fs.existsSync(agentMd)) {
      const label = AGENTS.find((a) => a.value === agent)?.label ?? agent;
      fs.writeFileSync(agentMd, `# ${label}\n\nAgent configuration placeholder.\n`);
      narrate('wrote', `.groundup/agents/${agent}/AGENT.md`);
    }
    const skillsMd = path.join(dir, 'SKILLS.md');
    if (!fs.existsSync(skillsMd)) {
      const label = AGENTS.find((a) => a.value === agent)?.label ?? agent;
      fs.writeFileSync(skillsMd, `# ${label} — skills\n\nSkill list placeholder.\n`);
      narrate('wrote', `.groundup/agents/${agent}/SKILLS.md`);
    }
  }

  line();
  sep();
  line();
}

async function pickModel(phase, onboardedProviders) {
  const candidates = modelsForPhase(phase, onboardedProviders);
  if (candidates.length === 0) {
    throw new Error(`No models available for phase ${phase}. Onboard at least one provider.`);
  }
  if (candidates.length === 1) {
    const c = candidates[0];
    console.log(
      muted(`  Only one ${phase} model available: `) +
      white(`${PROVIDER_LABELS[c.provider]} — ${c.label}`)
    );
    line();
    return { provider: c.provider, model: c.model };
  }

  const rec = recommendedFor(phase, onboardedProviders);
  const options = candidates.map((c) => {
    const hintParts = [];
    if (c.recommended) hintParts.push('recommended');
    hintParts.push(c.cost);
    return {
      value: `${c.provider}::${c.model ?? ''}`,
      label: `${PROVIDER_LABELS[c.provider]} — ${c.label}`,
      hint: hintParts.join(' · '),
    };
  });
  const defaultVal = rec
    ? `${rec.provider}::${rec.model ?? ''}`
    : options[0].value;

  const phaseLabel = phase === 'interview' ? 'Interview model' : 'Build model';
  const pick = await askSelect(
    `${phaseLabel} — which model should run the ${phase} phase?`,
    options,
    defaultVal
  );
  const idx = pick.indexOf('::');
  const providerName = pick.slice(0, idx);
  const modelName = pick.slice(idx + 2);
  return { provider: providerName, model: modelName === '' ? null : modelName };
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

  // --- STEP 1: provider onboarding (multiselect) ---
  let onboardedProviders = prefill.providers;
  while (!onboardedProviders || onboardedProviders.length === 0) {
    const picks = await askMultiselect(
      'Which AI providers do you want to use on this project?',
      PROVIDERS,
      ['claudecode']
    );
    sep();
    line();

    if (picks.includes('claudecode') && !claudeCodeInstalled()) {
      console.log(amber('■ ') + white('Claude Code not detected on this machine.'));
      console.log(amber('  → ') + white(`Install it at: ${CLAUDE_CODE_INSTALL_URL}`));
      console.log(muted('  Removing Claude Code from your selection.'));
      line();
      onboardedProviders = picks.filter((p) => p !== 'claudecode');
    } else {
      onboardedProviders = picks;
    }

    if (onboardedProviders.length === 0) {
      console.log(amber('■ ') + white('Pick at least one provider to continue.'));
      line();
      onboardedProviders = null;
    }
  }

  saveInterviewProgress(projectDir, { providers: onboardedProviders, phase: 'interview' });

  // --- API key collection for every onboarded provider that needs one ---
  for (const p of onboardedProviders) {
    await ensureProviderKey(p);
  }

  // --- Special-case callouts ---
  const onlyClaudeCode =
    onboardedProviders.length === 1 && onboardedProviders[0] === 'claudecode';
  const pairClaudeCodeAndClaude =
    onboardedProviders.length === 2 &&
    onboardedProviders.includes('claudecode') &&
    onboardedProviders.includes('claude');

  let interviewModel = prefill.interviewModel ?? null;
  let buildModel = prefill.buildModel ?? null;

  if (onlyClaudeCode) {
    line();
    console.log(amber('■ ') + white('Claude Code selected'));
    line();
    console.log(muted('  Interview and build both run through your Claude Code subscription.'));
    console.log(muted('  No per-call billing — model is managed by the CLI subprocess.'));
    console.log(muted('  Caveat: subprocess invocation is slower than direct API streaming.'));
    line();
    sep();
    line();
    interviewModel = interviewModel ?? { provider: 'claudecode', model: null };
    buildModel = buildModel ?? { provider: 'claudecode', model: null };
  } else if (pairClaudeCodeAndClaude && !interviewModel && !buildModel) {
    line();
    console.log(amber('■ ') + white('Claude Code + Anthropic API selected'));
    line();
    console.log(muted('  Both run the same Claude model family — billing differs:'));
    console.log(muted('    · Claude Code   — subscription, no per-call charges, subprocess speed'));
    console.log(muted('    · Anthropic API — per-token billing, lower latency'));
    console.log(muted('  You can mix them per phase below.'));
    line();
    sep();
    line();
  }

  // --- STEP 2: interview model ---
  if (!interviewModel) {
    interviewModel = await pickModel('interview', onboardedProviders);
    sep();
    line();
  }
  saveInterviewProgress(projectDir, { interviewModel, phase: 'interview' });

  // --- STEP 3: build model ---
  if (!buildModel) {
    buildModel = await pickModel('build', onboardedProviders);
    sep();
    line();
  }
  saveInterviewProgress(projectDir, { buildModel, phase: 'interview' });

  // Keep legacy session.interview.provider field in sync so continue.js and
  // other pre-model-select code paths still work.
  saveInterviewProgress(projectDir, {
    provider: interviewModel.provider,
    phase: 'interview',
  });

  // --- Narrate final decisions ---
  const fmtChoice = (c) =>
    `${PROVIDER_LABELS[c.provider]}${c.model ? ' / ' + c.model : ''}`;
  console.log(amber('■ ') + white('provider & model decisions'));
  line();
  console.log(muted('  interview: ') + white(fmtChoice(interviewModel)));
  console.log(muted('  build:     ') + white(fmtChoice(buildModel)));
  line();
  sep();
  line();

  const provider = interviewModel.provider;

  // --- agent multiselect ---
  const agents = prefill.agents ?? await askMultiselect(
    'Which AI coding agents will you use on this project?',
    AGENTS,
    ['claudecode']
  );
  if (!prefill.agents) { sep(); line(); }
  saveInterviewProgress(projectDir, { agents, phase: 'interview' });

  // --- install .groundup/ (templates + .gitignore) and agent dirs ---
  installGroundupDir(projectDir, projectName, purpose, platform);
  installAgentDirs(projectDir, agents);

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
