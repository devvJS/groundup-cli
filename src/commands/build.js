import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getAgent } from '../agents/index.js';
import { PROVIDER_TO_AGENT, AGENT_LABELS } from '../ai/config.js';
import { loadSession, updateSession } from '../session/state.js';
import { askSelect, askText } from '../ui/input.js';
import { amber, white, muted, success, line, sep } from '../ui/splash.js';

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
      if (/manual\s*steps|post[- ]?build|checklist/.test(heading)) {
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

      // Dispatch to agent
      sep();
      console.log(amber('■ ') + white(`Dispatching to ${agentLabel}...`));
      sep();
      line();

      const result = await agent.dispatch(promptPath, projectRoot);

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

      // Show recap if present
      const recapFileName = `${String(phase.number).padStart(2, '0')}-recap.md`;
      const recapPath = path.join(phasesDir, recapFileName);
      if (fs.existsSync(recapPath)) {
        const recap = fs.readFileSync(recapPath, 'utf-8').trim();
        if (recap) {
          console.log(success('Recap:'));
          for (const recapLine of recap.split('\n')) {
            console.log(muted('  ' + recapLine));
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
        console.log(success('Changes:'));
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
        sep();
        console.log(amber('■ ') + white(`Phase ${phase.number} approved`));
        sep();
        line();

        // Persist progress
        saveBuildState(projectRoot, {
          currentPhaseIndex: i + 1,
          status: i + 1 >= phases.length ? 'complete' : 'in-progress',
          snapshots,
        });
        break; // next phase
      }

      if (choice === 'retry') {
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

  // Teardown placeholder
  console.log(muted('── teardown + done screen coming in Prompt 4 ──'));
  line();

  return { completed: true };
}
