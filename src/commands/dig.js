import { showSplash, teardownSplashResize, line, amber, white, muted, sep, success } from '../ui/splash.js';
import { sessionExists, loadSession, saveSession, updateSession, clearSession, saveInterviewProgress } from '../session/state.js';
// DEPRECATED: replaced by AI engine in v0.2.0
// import { runInterview } from '../interview/engine.js';
// import { runAgentSelection } from './agent.js';
// import { runStackSelection } from '../stack/selection.js';
// import { runBlueprint } from './blueprint.js';
import { runRepoSetup } from './repo.js';
import { generateWorkflow } from './workflow.js';
import { runBuild } from './build.js';
import { runDeploy } from './deploy.js';
import { renderRepoFailure } from '../ui/repo-failure.js';
import { resume } from './continue.js';
import { askSelect, askMultiselect, askText } from '../ui/input.js';
import { runAIInterview, createActivityLog, INTERVIEW_REQUIREMENTS } from '../ai/interview.js';
import { get as getKey, set as setKey, PROVIDER_TO_AGENT, AGENT_LABELS } from '../ai/config.js';
import { isInstalled as claudeCodeInstalled } from '../ai/providers/claudecode.js';
import { MODELS, PROVIDER_LABELS, modelsForPhase, recommendedFor } from '../ai/models.js';
import { validateModel } from '../ai/validate.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLANS_DIR = path.join(__dirname, '..', 'plans');

const PROVIDERS = [
  { value: 'claudecode', label: 'Claude Code', hint: 'local — uses your claude.ai subscription' },
  { value: 'claude', label: 'Claude', hint: 'Anthropic API — claude-opus-4-6' },
  { value: 'openai', label: 'OpenAI', hint: 'gpt-4o' },
  { value: 'gemini', label: 'Gemini', hint: 'google — gemini-2.5-pro' },
  { value: 'ollama', label: 'Ollama', hint: 'local — llama3' },
];

const CLAUDE_CODE_INSTALL_URL = 'https://claude.ai/download';

// Platform → default deploy target. web and api default to Vercel because the
// typical groundup project in those buckets is a Next.js / Express-on-serverless
// shape. mobile/cli/desktop/library skip deploy entirely — they publish or
// distribute through platform-specific channels, not web deploys.
// "other" is ambiguous, so the interview asks an explicit deployment question.
//
// Why not default library to "none" silently: libraries publish to npm, not
// deploy, but some libraries have companion docs sites that DO deploy. Out of
// scope for this cut; a future branch could add "library with docs site" as a
// follow-up question.
const PLATFORM_DEPLOY_DEFAULTS = {
  web: 'Vercel',
  api: 'Vercel',
  mobile: 'none',
  cli: 'none',
  desktop: 'none',
  library: 'none',
  other: 'ask',
};

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// runFsStep — drives a single fs operation through the unified activity log.
// Shows `in progress` while running, then flips to a ✓ completed entry. A
// small delay makes fast sync ops visible on the live screen.
async function runFsStep(log, inProgressLabel, finishedLabel, value, fn) {
  if (log) {
    log.startTask(inProgressLabel);
    await sleep(140);
  }
  fn();
  if (log) log.finishTask(finishedLabel, value);
}

// All platform-specific section titles in the blueprint template. Used by
// stripNonMatchingSections to remove sections that don't apply.
const ALL_SECTION_TITLES = ['Design', 'CLI UX', 'API Shape'];

// Remove blueprint sections whose title doesn't match the current platform's
// requirements. Keeps only the section matching the platform, or none if the
// platform has no requirements entry.
function stripNonMatchingSections(content, platform) {
  const req = INTERVIEW_REQUIREMENTS[platform];
  const keepTitle = req?.sectionTitle ?? null;
  const titlesToRemove = ALL_SECTION_TITLES.filter((t) => t !== keepTitle);

  let result = content;
  for (const title of titlesToRemove) {
    // Match ### Title through all its bullet lines. The \\*\\* escapes the
    // markdown bold markers (literal ** in the template).
    const pattern = new RegExp(
      `### ${title}\\n(?:- \\*\\*[^\\n]*\\n)*\\n?`,
      'g'
    );
    result = result.replace(pattern, '');
  }
  // Clean up any resulting double blank lines
  result = result.replace(/\n{3,}/g, '\n\n');
  return result;
}

async function installGroundupDir(projectDir, projectName, purpose, platform, log = null) {
  const groundupDir = path.join(projectDir, '.groundup');
  if (!fs.existsSync(groundupDir)) {
    await runFsStep(log, 'creating .groundup/', 'created', '.groundup/', () => {
      fs.mkdirSync(groundupDir, { recursive: true });
    });
  }

  const groundupSrc = path.join(PLANS_DIR, 'GROUNDUP.md');
  const groundupDest = path.join(groundupDir, 'GROUNDUP.md');
  if (fs.existsSync(groundupSrc) && !fs.existsSync(groundupDest)) {
    await runFsStep(log, 'writing GROUNDUP.md', 'wrote', '.groundup/GROUNDUP.md', () => {
      fs.copyFileSync(groundupSrc, groundupDest);
    });
  }

  const blueprintSrc = path.join(PLANS_DIR, 'BLUEPRINT.md');
  const blueprintDest = path.join(groundupDir, 'BLUEPRINT.md');
  if (fs.existsSync(blueprintSrc) && !fs.existsSync(blueprintDest)) {
    await runFsStep(log, 'writing BLUEPRINT.md', 'wrote', '.groundup/BLUEPRINT.md', () => {
      const platformLabel = PLATFORMS.find((p) => p.value === platform)?.label ?? platform;
      // web and api default to Vercel — the typical groundup project is a
      // Next.js or Express-on-serverless shape. The AI interview can still
      // course-correct if the user signals a different target mid-interview.
      const deployTarget = PLATFORM_DEPLOY_DEFAULTS[platform] ?? 'none';
      let filled = fs
        .readFileSync(blueprintSrc, 'utf-8')
        .replace('[project-name]', projectName)
        .replace('[purpose — one sentence, filled from seed question 1]', purpose)
        .replace('[filled from seed question 2]', platformLabel)
        .replace('[deploy-target]', deployTarget);

      // Strip platform sections that don't match. The template contains all
      // three (### Design, ### CLI UX, ### API Shape). Keep only the one whose
      // title matches INTERVIEW_REQUIREMENTS[platform].sectionTitle, or none
      // if the platform has no requirements (desktop, library, other).
      filled = stripNonMatchingSections(filled, platform);

      fs.writeFileSync(blueprintDest, filled);
    });
  }

  const readmePath = path.join(projectDir, 'README.md');
  if (!fs.existsSync(readmePath)) {
    await runFsStep(log, 'writing README.md', 'wrote', 'README.md', () => {
      const body = `# ${projectName}\n\n> ${purpose}\n\n---\n\n_built with groundup ⚒️_\n`;
      fs.writeFileSync(readmePath, body);
    });
  }

  const gitignorePath = path.join(projectDir, '.gitignore');
  const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
  const alreadyIgnored = existing
    .split('\n')
    .map((l) => l.trim())
    .some((l) => l === '.groundup/' || l === '.groundup');
  if (!alreadyIgnored) {
    const verb = existing ? 'updated' : 'created';
    await runFsStep(log, 'updating .gitignore', verb, '.gitignore (+ .groundup/)', () => {
      const prefix = existing.length && !existing.endsWith('\n') ? '\n' : '';
      fs.writeFileSync(gitignorePath, existing + prefix + '.groundup/\n');
    });
  }
}

async function installAgentDirs(projectDir, agents, log = null) {
  if (!agents || agents.length === 0) return;

  const agentsRoot = path.join(projectDir, '.groundup', 'agents');
  if (!fs.existsSync(agentsRoot)) {
    await runFsStep(log, 'creating .groundup/agents/', 'created', '.groundup/agents/', () => {
      fs.mkdirSync(agentsRoot, { recursive: true });
    });
  }

  for (const agent of agents) {
    const dir = path.join(agentsRoot, agent);
    const label = AGENT_LABELS[agent] ?? agent;
    if (!fs.existsSync(dir)) {
      await runFsStep(log, `scaffolding ${label}`, 'created', `.groundup/agents/${agent}/`, () => {
        fs.mkdirSync(dir, { recursive: true });
      });
    }
    const agentMd = path.join(dir, 'AGENT.md');
    if (!fs.existsSync(agentMd)) {
      await runFsStep(log, `writing ${agent}/AGENT.md`, 'wrote', `.groundup/agents/${agent}/AGENT.md`, () => {
        fs.writeFileSync(agentMd, `# ${label}\n\nAgent configuration placeholder.\n`);
      });
    }
    const skillsMd = path.join(dir, 'SKILLS.md');
    if (!fs.existsSync(skillsMd)) {
      await runFsStep(log, `writing ${agent}/SKILLS.md`, 'wrote', `.groundup/agents/${agent}/SKILLS.md`, () => {
        fs.writeFileSync(skillsMd, `# ${label} — skills\n\nSkill list placeholder.\n`);
      });
    }
  }
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
    hintParts.push(c.descriptor);
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
  const modelName = pick.slice(idx + 2) || null;

  if (modelName) {
    const result = await validateModel(providerName, modelName);
    if (!result.valid) {
      console.log(amber('■ ') + white(`Model "${modelName}" not found on ${PROVIDER_LABELS[providerName]}.`));
      console.log(muted('  It may have been renamed or deprecated.'));
      console.log(muted('  Run ') + amber('groundup update-models') + muted(' to refresh available models.'));
      line();
    }
  }

  return { provider: providerName, model: modelName };
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

function isGroundupCliRepo(dir) {
  try {
    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg?.name === 'groundup-cli';
  } catch {
    return false;
  }
}

export async function dig(name) {
  if (isGroundupCliRepo(process.cwd())) {
    console.log(amber('■ ') + white('You are inside the groundup-cli source repo.'));
    console.log(muted('  Running dig here will scaffold a project into this directory.'));
    line();
    const proceed = await askSelect(
      'Continue anyway?',
      [
        { value: 'no', label: 'No — exit', hint: 'recommended' },
        { value: 'yes', label: 'Yes — I know what I\'m doing' },
      ],
      'no'
    );
    if (proceed !== 'yes') {
      line();
      console.log(muted('  Exited. Run groundup dig from a different directory.'));
      line();
      return;
    }
  }

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
  // Unified activity log — every seed answer, provider/model pick, and fs
  // action gets recorded here and surfaces on the thinking screen later.
  const activityLog = createActivityLog();

  // --- seed question 1: purpose ---
  const purpose = prefill.purpose ?? await askText(
    'In one sentence, what are you building?',
    'e.g. a CLI that scaffolds new projects from nothing',
    true
  );
  activityLog.record('what are you building?', purpose);
  saveInterviewProgress(projectDir, { purpose, phase: 'seed' });

  // --- seed question 2: platform ---
  const platform = prefill.platform ?? await askSelect(
    'What kind of thing is it?',
    PLATFORMS,
    'web'
  );
  const platformLabel = PLATFORMS.find((p) => p.value === platform)?.label ?? platform;
  activityLog.record('what kind of thing?', platformLabel);
  saveInterviewProgress(projectDir, { platform, phase: 'seed' });

  // --- STEP 1: provider onboarding (multiselect) ---
  // Reactive callout — when the user toggles Claude Code (alone or paired
  // with Anthropic API), render the relevant hint inline below the options.
  // The hint updates live on every space-toggle.
  const providerToggleHint = (selSet) => {
    const hasCC = selSet.has('claudecode');
    const hasClaude = selSet.has('claude');
    const onlyCC = selSet.size === 1 && hasCC;
    const pair = selSet.size === 2 && hasCC && hasClaude;

    if (onlyCC) {
      return [
        '',
        amber('  ■ ') + white('Claude Code selected'),
        '',
        muted('    Uses your claude.ai subscription — no API cost.'),
        muted('    Responses may be slower than direct API access'),
        muted('    as requests route through the Claude Code subprocess.'),
      ];
    }
    if (pair) {
      return [
        '',
        amber('  ■ ') + white('Claude Code + Anthropic API selected'),
        '',
        muted('    Both run the same Claude model family — billing differs:'),
        muted('      · Claude Code   — subscription, no per-call charges, subprocess speed'),
        muted('      · Anthropic API — per-token billing, lower latency'),
        muted('    You can mix them per phase below.'),
      ];
    }
    return [];
  };

  let onboardedProviders = prefill.providers;
  while (!onboardedProviders || onboardedProviders.length === 0) {
    const picks = await askMultiselect(
      'Which AI providers do you want to use on this project?',
      PROVIDERS,
      [],
      undefined,
      undefined,
      false,
      null,
      providerToggleHint
    );

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

  const providerLabels = onboardedProviders
    .map((p) => PROVIDER_LABELS[p] ?? p)
    .join(', ');
  activityLog.record('providers selected', providerLabels);
  saveInterviewProgress(projectDir, { providers: onboardedProviders, phase: 'interview' });

  // --- Special-case flag ---
  // Callouts for Claude-Code-only and Claude-Code + Anthropic-API are
  // rendered reactively inside the provider multiselect itself (see
  // providerToggleHint above), so there is no post-confirmation narration.
  const onlyClaudeCode =
    onboardedProviders.length === 1 && onboardedProviders[0] === 'claudecode';

  let interviewModel = prefill.interviewModel ?? null;
  let buildModel = prefill.buildModel ?? null;

  if (onlyClaudeCode) {
    interviewModel = interviewModel ?? { provider: 'claudecode', model: null };
    buildModel = buildModel ?? { provider: 'claudecode', model: null };
  }

  // --- API key collection for every onboarded provider that needs one ---
  for (const p of onboardedProviders) {
    await ensureProviderKey(p);
  }

  const fmtChoice = (c) =>
    `${PROVIDER_LABELS[c.provider]}${c.model ? ' / ' + c.model : ''}`;

  // --- STEP 2: interview model ---
  if (!interviewModel) {
    interviewModel = await pickModel('interview', onboardedProviders);
  }
  activityLog.record('interview model', fmtChoice(interviewModel));
  saveInterviewProgress(projectDir, { interviewModel, phase: 'interview' });

  // --- STEP 3: build model ---
  if (!buildModel) {
    buildModel = await pickModel('build', onboardedProviders);
  }
  activityLog.record('build model', fmtChoice(buildModel));
  saveInterviewProgress(projectDir, { buildModel, phase: 'interview' });

  // Keep legacy session.interview.provider field in sync so continue.js and
  // other pre-model-select code paths still work.
  saveInterviewProgress(projectDir, {
    provider: interviewModel.provider,
    phase: 'interview',
  });

  const provider = interviewModel.provider;

  // --- infer agent dirs from provider selection ---
  const agents = prefill.agents ??
    [...new Set(onboardedProviders.map((p) => PROVIDER_TO_AGENT[p]))];
  const agentLabels = agents
    .map((a) => AGENT_LABELS[a] ?? a)
    .join(', ');
  activityLog.record('agents selected', agentLabels);
  saveInterviewProgress(projectDir, { agents, phase: 'interview' });

  // --- phase: AI interview ---
  // The thinking screen (started inside runAIInterview) is the single source
  // of truth for activity from here forward — fs installs run live inside it
  // via preInstalls, and every seed decision above already lives in the log.
  // Full terminal clear so the thinking screen starts on a clean slate —
  // seed/provider/model scroll is wiped before the unified view takes over.
  process.stdout.write('\x1B[2J\x1B[H');
  try {
    await runAIInterview({ purpose, platform }, provider, projectDir, priorHistory, {
      activityLog,
      preInstalls: async (log) => {
        await installGroundupDir(projectDir, projectName, purpose, platform, log);
        await installAgentDirs(projectDir, agents, log);
      },
    });
  } catch (err) {
    line();
    console.log(amber('■ ') + white(`Interview failed: ${err.message}`));
    console.log(muted('  Session saved. Run groundup continue to retry.'));
    line();
    return;
  }

  updateSession({ ...loadSession(), phase: 'repo' });

  // --- phase: repo setup ---
  const repoResult = await runRepoSetup(projectDir);
  if (!repoResult?.ok) {
    renderRepoFailure(repoResult);
    return;
  }

  // --- phase: workflow generation ---
  line();
  console.log(muted('── starting workflow generation ──'));
  line();

  const workflowResult = await generateWorkflow({ projectRoot: projectDir });
  if (!workflowResult.approved) {
    line();
    console.log(muted('  Run ') + amber('groundup build') + muted(' to continue when ready.'));
    line();
    return;
  }

  // --- phase: build ---
  updateSession({ ...loadSession(), phase: 'build' });
  const buildResult = await runBuild({ projectRoot: projectDir });

  if (buildResult?.completed) {
    // --- phase: deploy ---
    const deployResult = await runDeploy({ projectRoot: projectDir });
    await renderPostPipeline(projectDir, deployResult);
  }
}

// Unified post-pipeline output: teardown, checklist (blueprint items + deploy
// fallthrough), and done screen. Kept in dig.js because it's the orchestrator —
// build.js and deploy.js each return data, this function renders the combined view.
async function renderPostPipeline(projectDir, deployResult) {
  // --- Teardown ---
  // Moved here from build.js so .groundup/ survives until deploy reads
  // BLUEPRINT.md for the target.
  console.log(white('Remove .groundup/ project files?'));

  const teardownChoice = await askSelect(
    '',
    [
      { value: 'yes', label: 'Yes — clean up' },
      { value: 'no', label: 'No — keep them' },
    ],
    'no'
  );

  // Collect checklist items BEFORE potential removal
  const blueprintPath = path.join(projectDir, '.groundup', 'BLUEPRINT.md');
  let checklist = [];
  if (fs.existsSync(blueprintPath)) {
    const blueprint = fs.readFileSync(blueprintPath, 'utf-8');
    checklist = extractManualStepsFromBlueprint(blueprint);
  }

  line();

  const groundupDir = path.join(projectDir, '.groundup');
  if (teardownChoice === 'yes') {
    fs.rmSync(groundupDir, { recursive: true, force: true });
    console.log(muted('── .groundup/ removed ──'));
  } else {
    console.log(muted('── .groundup/ kept at .groundup/ ──'));
  }

  line();

  // Append deploy fallthrough item if deploy didn't land
  if (deployResult?.fallthrough) {
    checklist.push({
      text: deployResult.fallthrough.text,
      hint: deployResult.fallthrough.hint,
      done: false,
    });
  }

  // Render unified checklist
  if (checklist.length > 0) {
    sep();
    console.log(amber('■ ') + white('before you ship'));
    sep();
    line();
    for (const item of checklist) {
      const marker = item.done ? success('  ■') : amber('  □');
      console.log(marker + ' ' + white(item.text));
      if (item.hint) console.log(muted(`      ${item.hint}`));
    }
    line();
  }

  // Done screen
  const cols = process.stdout.columns || 80;
  const tagline = 'happy building. ⚒️';
  const pad = Math.max(0, Math.floor((cols - tagline.length) / 2));

  console.log(amber('━'.repeat(cols)));
  console.log(' '.repeat(pad) + amber(tagline));
  console.log(amber('━'.repeat(cols)));
  line();
  console.log(muted(`  your project is at ${projectDir}`));
  console.log(muted('  your code is on origin/develop — merge to main when ready to ship'));
  if (deployResult?.deployed && deployResult.url) {
    console.log(muted('  live at ') + amber(deployResult.url));
  }
  console.log(muted('═'.repeat(cols)));
  line();
}

// Mirrors extractManualSteps in build.js but importable from dig.js. Extracts
// checklist items from blueprint sections titled Manual Steps, Post-build,
// Checklist, Deployment, etc.
function extractManualStepsFromBlueprint(blueprint) {
  const lines = blueprint.split('\n');
  const items = [];
  let capturing = false;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (/^#{1,3}\s+/i.test(trimmed)) {
      const heading = trimmed.replace(/^#{1,3}\s+/, '').toLowerCase();
      if (/manual\s*steps|post[- ]?build|checklist/.test(heading)) {
        capturing = true;
        continue;
      }
      if (capturing) break;
    }
    if (!capturing) continue;
    const checkMatch = trimmed.match(/^- \[([ xX])\]\s+(.*)/);
    if (checkMatch) {
      items.push({ text: checkMatch[2].trim(), done: checkMatch[1].toLowerCase() === 'x' });
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      items.push({ text: trimmed.replace(/^[-*]\s+/, ''), done: false });
    }
  }
  return items;
}
