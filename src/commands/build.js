import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { getAgent } from '../agents/index.js';
import { PROVIDER_TO_AGENT, AGENT_LABELS } from '../ai/config.js';
import { loadSession, updateSession } from '../session/state.js';
import { askSelect, askText } from '../ui/input.js';
import { amber, white, muted, success, line, sep } from '../ui/splash.js';
import { renderMarkdownLines } from '../ui/markdown.js';

// Parse WORKFLOW.md into an array of phase objects.
// Each phase: { number, title, goal, acceptance, tasks: [{ description, done }] }
function parseWorkflow(markdown) {
  const phases = [];
  let current = null;
  let section = null; // 'acceptance' | 'tasks' | null

  for (const raw of markdown.split('\n')) {
    const trimmed = raw.trim();

    // ## Phase N: Title
    const phaseMatch = trimmed.match(/^##\s+Phase\s+(\d+):\s*(.+)/i);
    if (phaseMatch) {
      if (current) phases.push(current);
      current = {
        number: parseInt(phaseMatch[1], 10),
        title: phaseMatch[2].trim(),
        goal: '',
        acceptance: [],
        tasks: [],
      };
      section = null;
      continue;
    }

    if (!current) continue;

    // **Goal:** one sentence
    const goalMatch = trimmed.match(/^\*\*Goal:\*\*\s*(.*)/i);
    if (goalMatch) {
      current.goal = goalMatch[1].trim();
      section = null;
      continue;
    }

    // **Acceptance criteria:**
    if (/^\*\*Acceptance criteria:\*\*/i.test(trimmed)) {
      section = 'acceptance';
      continue;
    }

    // **Tasks:**
    if (/^\*\*Tasks:\*\*/i.test(trimmed)) {
      section = 'tasks';
      continue;
    }

    // Other section label resets section
    if (/^\*\*.+:\*\*/.test(trimmed)) {
      section = null;
      continue;
    }

    // Acceptance criteria bullets
    if (section === 'acceptance' && /^[-*]\s+/.test(trimmed)) {
      current.acceptance.push(trimmed.replace(/^[-*]\s+/, ''));
      continue;
    }

    // Task checkboxes
    const taskMatch = trimmed.match(/^- \[([ xX])\]\s+(.*)/);
    if (section === 'tasks' && taskMatch) {
      current.tasks.push({
        description: taskMatch[2].trim(),
        done: taskMatch[1].toLowerCase() === 'x',
      });
      continue;
    }
  }

  if (current) phases.push(current);
  return phases;
}

// Build a prompt file for a single phase, giving the agent all context needed.
function buildPhasePrompt(phase, blueprint, workflow, feedback) {
  const taskList = phase.tasks
    .map((t, i) => `${i + 1}. ${t.description}`)
    .join('\n');

  const criteria = phase.acceptance
    .map((c) => `- ${c}`)
    .join('\n');

  const feedbackBlock = feedback
    ? `\nRETRY FEEDBACK\nThe developer reviewed your previous attempt at this phase and asked for changes:\n${feedback}\n\nIncorporate this feedback. Do not mention the feedback in your output.\n`
    : '';

  const recapFileName = `${String(phase.number).padStart(2, '0')}-recap.md`;

  return `You are building Phase ${phase.number}: ${phase.title}

GOAL
${phase.goal}

TASKS (complete in order)
${taskList}

ACCEPTANCE CRITERIA
${criteria}
${feedbackBlock}
FULL BLUEPRINT (for reference)
\`\`\`
${blueprint}
\`\`\`

FULL WORKFLOW (for reference)
\`\`\`
${workflow}
\`\`\`

RULES
- Complete every task in the TASKS list above, in order.
- Do not skip tasks or reorder them.
- After completing all tasks, verify that every acceptance criterion is met.
- Do not modify files outside the scope of this phase unless a task explicitly requires it.
- If a task is ambiguous, make a reasonable choice and document it in a code comment.
- You MUST write a summary of what you built to .groundup/phases/${recapFileName} before exiting. Include: files created or modified, commands run, and whether acceptance criteria were met.
`;
}

function gitHeadSha(cwd) {
  try {
    return execSync('git rev-parse HEAD', { cwd, encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

function gitDiffStat(cwd, fromSha) {
  if (!fromSha) return null;
  try {
    return execSync(`git diff --stat ${fromSha}`, { cwd, encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

function gitCommitPhase(cwd, phase) {
  try {
    execSync('git add -A', { cwd, encoding: 'utf-8' });
    // Nothing to commit if index matches HEAD
    const diffRes = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd });
    if (diffRes.status === 0) return false;
    const msg = `phase ${phase.number}: ${phase.title}`;
    const res = spawnSync('git', ['commit', '-m', msg], { cwd, encoding: 'utf-8' });
    return res.status === 0;
  } catch {
    return false;
  }
}

function gitPush(cwd) {
  try {
    execSync('git push origin develop', { cwd, encoding: 'utf-8', stdio: 'pipe' });
    return { ok: true };
  } catch (err) {
    const sha = gitHeadSha(cwd);
    return { ok: false, sha, error: (err.stderr || err.message || '').trim() };
  }
}

function gitResetHard(cwd, sha) {
  try {
    execSync(`git reset --hard ${sha}`, { cwd, encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

// Extract manual/post-build checklist from BLUEPRINT.md if present.
// Looks for sections titled "Manual Steps", "Post-build", "Checklist",
// or any heading containing those keywords.
function extractManualSteps(blueprint) {
  const lines = blueprint.split('\n');
  const items = [];
  let capturing = false;

  for (const raw of lines) {
    const trimmed = raw.trim();

    // Check for relevant headings
    if (/^#{1,3}\s+/i.test(trimmed)) {
      const heading = trimmed.replace(/^#{1,3}\s+/, '').toLowerCase();
      if (/manual\s*steps|post[- ]?build|checklist|distribution|deployment|installation|getting\s*started|publishing/.test(heading)) {
        capturing = true;
        continue;
      }
      // A new heading stops capturing
      if (capturing) break;
    }

    if (!capturing) continue;

    // Capture checklist items and bullets
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

function saveBuildState(projectRoot, updates) {
  const session = loadSession(projectRoot);
  const currentBuild = session.build || {};
  updateSession({
    ...session,
    build: { ...currentBuild, ...updates },
  });
}

export async function runBuild({ projectRoot }) {
  const workflowPath = path.join(projectRoot, '.groundup', 'WORKFLOW.md');
  if (!fs.existsSync(workflowPath)) {
    console.log(amber('■ ') + white('No .groundup/WORKFLOW.md found.'));
    console.log(muted('  Run groundup workflow first to generate an approved workflow.'));
    line();
    return { completed: false };
  }

  const blueprintPath = path.join(projectRoot, '.groundup', 'BLUEPRINT.md');
  if (!fs.existsSync(blueprintPath)) {
    console.log(amber('■ ') + white('No .groundup/BLUEPRINT.md found.'));
    console.log(muted('  Run groundup dig first to generate an approved blueprint.'));
    line();
    return { completed: false };
  }

  const workflow = fs.readFileSync(workflowPath, 'utf-8');
  const blueprint = fs.readFileSync(blueprintPath, 'utf-8');
  const phases = parseWorkflow(workflow);

  if (phases.length === 0) {
    console.log(amber('■ ') + white('WORKFLOW.md contains no phases.'));
    console.log(muted('  Regenerate the workflow with groundup workflow.'));
    line();
    return { completed: false };
  }

  // Load session for provider → agent mapping
  const session = loadSession(projectRoot);
  if (!session) {
    console.log(amber('■ ') + white('No session found.'));
    console.log(muted('  Run groundup dig first.'));
    line();
    return { completed: false };
  }

  const buildModel = session.interview?.buildModel;
  if (!buildModel) {
    console.log(amber('■ ') + white('No build model configured in session.'));
    console.log(muted('  Run groundup dig to select a build model.'));
    line();
    return { completed: false };
  }

  const providerName = buildModel.provider;
  const agentName = PROVIDER_TO_AGENT[providerName] || 'other';
  const agentLabel = AGENT_LABELS[agentName] || agentName;

  // Block unsupported agents early
  if (agentName === 'ollama' || agentName === 'other') {
    const agentMod = getAgent(agentName);
    const result = await agentMod.dispatch();
    console.log(amber('■ ') + white(result.error));
    line();
    return { completed: false };
  }

  const agent = getAgent(agentName);

  // Resume support — read currentPhaseIndex from session
  const buildState = session.build || {};
  let startIndex = buildState.currentPhaseIndex || 0;
  if (startIndex >= phases.length) startIndex = 0;

  const snapshots = { ...(buildState.snapshots || {}) };

  // Mark build as in-progress
  saveBuildState(projectRoot, { status: 'in-progress', currentPhaseIndex: startIndex });

  // Ensure phases directory exists
  const phasesDir = path.join(projectRoot, '.groundup', 'phases');
  if (!fs.existsSync(phasesDir)) {
    fs.mkdirSync(phasesDir, { recursive: true });
  }

  // --- Phase loop ---
  for (let i = startIndex; i < phases.length; i++) {
    const phase = phases[i];
    let feedback = '';

    // Retry loop for current phase
    while (true) {
      sep();
      console.log(amber('■ ') + white(`Phase ${phase.number} of ${phases.length}: ${phase.title}`));
      sep();
      line();

      console.log(success('Goal: ') + white(phase.goal));
      line();

      console.log(success('Tasks:'));
      for (const task of phase.tasks) {
        const marker = task.done ? success('  ■') : muted('  □');
        console.log(marker + ' ' + white(task.description));
      }
      line();

      console.log(muted(`  Agent: ${agentLabel}`));
      line();

      // Write phase prompt to disk
      const promptFileName = `${String(phase.number).padStart(2, '0')}-prompt.md`;
      const promptPath = path.join(phasesDir, promptFileName);
      const promptContent = buildPhasePrompt(phase, blueprint, workflow, feedback);
      fs.writeFileSync(promptPath, promptContent);
      console.log(muted(`  Prompt written to .groundup/phases/${promptFileName}`));
      line();

      // Git snapshot before dispatch
      const beforeSha = gitHeadSha(projectRoot);
      snapshots[i] = beforeSha;

      // Dispatch to agent — spinner runs until agent produces first output
      sep();
      console.log(amber('■ ') + white(`Dispatching to ${agentLabel}`));
      sep();
      line();

      const spinFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      let spinIdx = 0;
      let spinnerActive = true;
      const spinner = setInterval(() => {
        if (spinnerActive) {
          process.stdout.write(`\r  ${amber(spinFrames[spinIdx++ % spinFrames.length])} ${muted(`launching ${agentLabel}...`)}`);
        }
      }, 80);

      const clearSpinner = () => {
        if (!spinnerActive) return;
        spinnerActive = false;
        clearInterval(spinner);
        process.stdout.write('\r\x1B[2K');
      };

      const result = await agent.dispatch(promptPath, projectRoot, {
        onFirstOutput: clearSpinner,
      });

      // Ensure spinner is cleared if agent exited without output
      clearSpinner();

      line();
      sep();

      if (!result.success) {
        console.log(amber('■ ') + white(`${agentLabel} exited with code ${result.exitCode}`));
        if (result.error) {
          console.log(muted(`  ${result.error}`));
        }
        sep();
        line();
      } else {
        console.log(amber('■ ') + white(`${agentLabel} completed successfully`));
        sep();
        line();
      }

      // Show recap if present — rendered through markdown renderer with left border
      const recapFileName = `${String(phase.number).padStart(2, '0')}-recap.md`;
      const recapPath = path.join(phasesDir, recapFileName);
      if (fs.existsSync(recapPath)) {
        const recap = fs.readFileSync(recapPath, 'utf-8').trim();
        if (recap) {
          console.log(success('Recap:'));
          const renderedLines = renderMarkdownLines(recap);
          for (const recapLine of renderedLines) {
            console.log(muted('  │ ') + recapLine);
          }
          line();
        }
      } else {
        console.log(muted('  No recap file found (.groundup/phases/' + recapFileName + ')'));
        line();
      }

      // Show git diff stat if there's a snapshot to compare against
      const diffStat = gitDiffStat(projectRoot, beforeSha);
      if (diffStat) {
        console.log(muted('Changes:'));
        for (const diffLine of diffStat.split('\n')) {
          console.log(muted('  ' + diffLine));
        }
        line();
      }

      // Approval gate — reviewBlueprint pattern
      console.log(white('How did this phase go?'));

      const choice = await askSelect(
        '',
        [
          { value: 'approve', label: 'Approve — phase complete' },
          { value: 'retry', label: 'Retry — provide feedback and re-run' },
          { value: 'abort', label: 'Abort — pause the build' },
        ],
        'approve'
      );

      if (choice === 'approve') {
        line();

        // Commit phase work
        const committed = gitCommitPhase(projectRoot, phase);
        if (committed) {
          console.log(muted(`  Committed: phase ${phase.number}: ${phase.title}`));
          const pushResult = gitPush(projectRoot);
          if (pushResult.ok) {
            console.log(muted('  Pushed to origin/develop'));
          } else {
            console.log(amber('■ ') + white('Push failed — you can push manually later'));
            if (pushResult.sha) console.log(muted(`  HEAD is at ${pushResult.sha}`));
            if (pushResult.error) console.log(muted(`  ${pushResult.error}`));
          }
        } else {
          console.log(muted('  Nothing to commit for this phase'));
        }

        line();
        sep();
        console.log(amber('■ ') + white(`Phase ${phase.number} approved`));
        sep();
        line();
        line(); // breathing room before next phase header

        // Persist progress
        saveBuildState(projectRoot, {
          currentPhaseIndex: i + 1,
          status: i + 1 >= phases.length ? 'complete' : 'in-progress',
          snapshots,
        });
        break; // next phase
      }

      if (choice === 'retry') {
        // Reset to pre-phase state so the agent starts clean
        const resetSha = snapshots[i];
        if (resetSha) {
          const didReset = gitResetHard(projectRoot, resetSha);
          if (didReset) {
            console.log(muted(`  Reset to pre-phase state (${resetSha.slice(0, 7)})`));
          } else {
            console.log(amber('■ ') + white('Could not reset — agent will retry on current state'));
          }
        }

        feedback = await askText(
          'What should be different?',
          'e.g. "the auth middleware is missing error handling"',
          true
        );
        line();
        continue; // retry same phase
      }

      // abort
      saveBuildState(projectRoot, {
        currentPhaseIndex: i,
        status: 'aborted',
        snapshots,
      });
      line();
      console.log(amber('■ ') + white(`Build paused at Phase ${phase.number}. Run `) + amber('groundup continue') + white(' to resume.'));
      line();
      return { completed: false };
    }
  }

  // --- All phases complete ---

  // Post-build checklist
  const manualSteps = extractManualSteps(blueprint);
  if (manualSteps.length > 0) {
    sep();
    console.log(amber('■ ') + white('Post-build checklist'));
    sep();
    line();

    for (const step of manualSteps) {
      const marker = step.done ? success('  ■') : amber('  □');
      console.log(marker + ' ' + white(step.text));
    }
    line();
  }

  // All phases complete header
  sep();
  console.log(amber('■ ') + white('All phases complete'));
  sep();
  line();

  // --- Squash option ---
  const currentSession = loadSession(projectRoot);
  const scaffoldSha = currentSession?.build?.scaffoldSha;
  if (scaffoldSha) {
    const purpose = currentSession?.interview?.purpose || 'new project';
    console.log(white('Squash all phase commits into one?'));
    console.log(muted('  Replaces per-phase commits with a single clean commit.'));
    line();

    const squashChoice = await askSelect(
      '',
      [
        { value: 'no', label: 'No — keep per-phase commits', hint: 'recommended' },
        { value: 'yes', label: 'Yes — squash into one commit' },
      ],
      'no'
    );

    if (squashChoice === 'yes') {
      line();
      const squashMsg = `built with groundup — ${purpose}`;
      try {
        execSync(`git reset --soft ${scaffoldSha}`, { cwd: projectRoot, encoding: 'utf-8' });
        execSync('git add -A', { cwd: projectRoot, encoding: 'utf-8' });
        spawnSync('git', ['commit', '-m', squashMsg], { cwd: projectRoot, encoding: 'utf-8' });
        console.log(muted(`  Squashed to: ${squashMsg}`));
        try {
          const pushRes = spawnSync('git', ['push', '--force-with-lease', 'origin', 'develop'], { cwd: projectRoot, encoding: 'utf-8' });
          if (pushRes.status !== 0) throw new Error((pushRes.stderr || '').trim());
          console.log(muted('  Force-pushed to origin/develop'));
        } catch (pushErr) {
          const sha = gitHeadSha(projectRoot);
          console.log(amber('■ ') + white('Push failed — you can push manually'));
          if (sha) console.log(muted(`  HEAD is at ${sha}`));
        }
      } catch (squashErr) {
        console.log(amber('■ ') + white('Squash failed — per-phase commits preserved'));
        console.log(muted(`  ${squashErr.message || squashErr}`));
      }
      line();
    } else {
      line();
    }
  }

  // --- Teardown ---
  console.log(white('Remove .groundup/ project files?'));

  const teardownChoice = await askSelect(
    '',
    [
      { value: 'yes', label: 'Yes — clean up' },
      { value: 'no', label: 'No — keep them' },
    ],
    'no'
  );

  // Mark complete before potential removal
  saveBuildState(projectRoot, { status: 'complete' });

  line();

  const groundupDir = path.join(projectRoot, '.groundup');
  if (teardownChoice === 'yes') {
    fs.rmSync(groundupDir, { recursive: true, force: true });
    console.log(muted('── .groundup/ removed ──'));
  } else {
    console.log(muted('── .groundup/ kept at .groundup/ ──'));
  }

  line();

  // --- Done screen ---
  const cols = process.stdout.columns || 80;
  const tagline = 'happy building. ⚒️';
  const pad = Math.max(0, Math.floor((cols - tagline.length) / 2));

  console.log(amber('━'.repeat(cols)));
  console.log(' '.repeat(pad) + amber(tagline));
  console.log(amber('━'.repeat(cols)));
  line();
  console.log(muted(`  your project is at ${projectRoot}`));
  console.log(muted('  your code is on origin/develop — merge to main when ready to ship'));
  console.log(muted('═'.repeat(cols)));
  line();

  return { completed: true };
}
