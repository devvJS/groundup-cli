import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getProvider } from '../ai/index.js';
import { buildWorkflowPrompt } from '../ai/prompts/workflow.js';
import { loadSession } from '../session/state.js';
import { askSelect, askText } from '../ui/input.js';
import { amber, white, muted, success, line, sep } from '../ui/splash.js';

// Workflow-aware markdown renderer. Applies project color tokens to
// phase headers, section labels, and body text per the workflow palette.
function renderWorkflowMarkdown(text) {
  const srcLines = String(text || '').split('\n');
  const cols = process.stdout.columns || 80;
  const output = [];

  for (let i = 0; i < srcLines.length; i++) {
    const raw = srcLines[i];
    const trimmed = raw.trim();

    if (!trimmed) { output.push(''); continue; }

    // --- h1: # WORKFLOW.md → amber full-width bar + title + bar ---
    if (/^#\s+/.test(trimmed)) {
      const content = trimmed.replace(/^#\s+/, '');
      output.push('');
      output.push(amber('━'.repeat(cols)));
      output.push(amber(content.toUpperCase()));
      output.push(amber('━'.repeat(cols)));
      output.push('');
      continue;
    }

    // --- h2: ## Phase N: Title → amber bold + muted underline ---
    if (/^##\s+/.test(trimmed)) {
      const content = trimmed.replace(/^##\s+/, '');
      output.push('');
      output.push(amber(content));
      output.push(muted('─'.repeat(content.length)));
      continue;
    }

    // --- dependency note: (assumes Phase N is complete) ---
    if (/^\(assumes\s+Phase\s+\d/i.test(trimmed)) {
      output.push(muted('  ' + trimmed));
      continue;
    }

    // --- section labels: **Goal:** / **Acceptance criteria:** / **Tasks:** ---
    const labelMatch = trimmed.match(/^\*\*(.+?):\*\*\s*(.*)/);
    if (labelMatch) {
      const label = labelMatch[1] + ':';
      const rest = labelMatch[2];
      output.push(success(label) + (rest ? ' ' + white(rest) : ''));
      continue;
    }

    // --- acceptance criteria bullets: - criterion ---
    if (/^[-*]\s+/.test(trimmed) && !/^- \[[ x]\]/.test(trimmed)) {
      const content = trimmed.replace(/^[-*]\s+/, '');
      output.push(amber('  ■') + ' ' + white(content));
      continue;
    }

    // --- task checkboxes: - [ ] task description ---
    if (/^- \[ \]\s+/.test(trimmed)) {
      const content = trimmed.replace(/^- \[ \]\s+/, '');
      output.push(muted('  □') + ' ' + white(content));
      continue;
    }

    // --- completed task checkboxes: - [x] task description ---
    if (/^- \[x\]\s+/i.test(trimmed)) {
      const content = trimmed.replace(/^- \[x\]\s+/i, '');
      output.push(success('  ■') + ' ' + white(content));
      continue;
    }

    // --- everything else: plain white ---
    output.push(white(trimmed));
  }

  return output;
}

// Render workflow markdown, paging through `less` when it exceeds terminal height.
async function renderWorkflowReview(markdown) {
  const lines = renderWorkflowMarkdown(markdown);

  const termRows = process.stdout.rows || 24;
  // Reserve rows for the separator + question + select prompt that follow
  const available = termRows - 6;
  const content = lines.join('\n');

  if (lines.length <= available) {
    // Fits on screen — render inline
    console.log(content);
    return;
  }

  // Content exceeds terminal — page through less
  console.log(muted('  ↑ ↓ scroll   q exit'));
  line();
  return new Promise((resolve) => {
    const pager = spawn('less', ['-R', '-F', '-X', '-P', '── end of workflow · q to exit ──'], {
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    pager.stdin.write(content);
    pager.stdin.end();
    pager.on('close', () => resolve());
    pager.on('error', () => {
      // less not available — fall back to inline
      console.log(content);
      resolve();
    });
  });
}

const PROVIDER_TO_AGENT = {
  claudecode: 'claudecode',
  claude: 'claudecode',
  openai: 'copilot',
  gemini: 'gemini',
  ollama: 'other',
};

export async function generateWorkflow({ projectRoot }) {
  const blueprintPath = path.join(projectRoot, '.groundup', 'BLUEPRINT.md');
  if (!fs.existsSync(blueprintPath)) {
    console.log(amber('■ ') + white('No .groundup/BLUEPRINT.md found.'));
    console.log(muted('  Run groundup dig first to generate an approved blueprint.'));
    line();
    return { approved: false };
  }

  const blueprint = fs.readFileSync(blueprintPath, 'utf-8');
  const session = loadSession(projectRoot);
  if (!session) {
    console.log(amber('■ ') + white('No session found.'));
    console.log(muted('  Run groundup dig first.'));
    line();
    return { approved: false };
  }

  const buildModel = session.interview?.buildModel;
  if (!buildModel) {
    console.log(amber('■ ') + white('No build model configured in session.'));
    console.log(muted('  Run groundup dig to select a build model.'));
    line();
    return { approved: false };
  }

  const providerName = buildModel.provider;
  const modelName = buildModel.model;
  const agent = PROVIDER_TO_AGENT[providerName] || 'other';
  const provider = getProvider(providerName, modelName);

  const workflowPath = path.join(projectRoot, '.groundup', 'WORKFLOW.md');
  let feedback = '';

  while (true) {
    // --- generate ---
    sep();
    console.log(amber('■ ') + white('Generating WORKFLOW.md'));
    sep();
    line();

    const prompt = buildWorkflowPrompt({ blueprint, provider: providerName, agent, feedback });
    const messages = [{ role: 'user', content: prompt }];
    const system = 'You are groundup — a project scaffolding agent. Return only the requested markdown. No preamble. No commentary.';

    let result = '';
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frame = 0;
    const spinner = setInterval(() => {
      process.stdout.write(`\r  ${amber(frames[frame++ % frames.length])} ${muted('generating...')}`);
    }, 80);
    try {
      for await (const chunk of provider.stream(messages, system)) {
        result += chunk;
      }
    } catch (err) {
      clearInterval(spinner);
      process.stdout.write('\r\x1B[2K');
      console.log(amber('■ ') + white(`Generation failed: ${err.message}`));
      line();
      return { approved: false };
    }
    clearInterval(spinner);
    process.stdout.write('\r\x1B[2K');

    // Write complete result to disk
    fs.writeFileSync(workflowPath, result.trim() + '\n');

    // --- review ---
    sep();
    console.log(amber('■ ') + white('Review WORKFLOW.md'));
    sep();
    line();

    await renderWorkflowReview(result);

    line();
    sep();
    line();

    const choice = await askSelect(
      'How does the workflow look?',
      [
        { value: 'approve', label: 'Approve — continue to build' },
        { value: 'regenerate', label: 'Regenerate — provide feedback and try again' },
        { value: 'abort', label: 'Abort — exit without saving' },
      ],
      'approve'
    );

    if (choice === 'approve') {
      line();
      sep();
      console.log(amber('■ ') + white('workflow approved'));
      sep();
      line();
      return { approved: true, path: workflowPath };
    }

    if (choice === 'abort') {
      // Clean up the written file on abort
      if (fs.existsSync(workflowPath)) {
        fs.unlinkSync(workflowPath);
      }
      line();
      console.log(muted('  Workflow generation aborted.'));
      line();
      return { approved: false };
    }

    // regenerate — collect feedback
    feedback = await askText(
      'What should be different?',
      'e.g. "split the database phase into schema + seed data"',
      true
    );
    line();
  }
}
