import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getProvider } from '../ai/index.js';
import { buildWorkflowPrompt } from '../ai/prompts/workflow.js';
import { loadSession } from '../session/state.js';
import { askSelect, askText } from '../ui/input.js';
import { renderMarkdown } from '../ui/markdown.js';
import { amber, white, muted, line, sep } from '../ui/splash.js';

// Render workflow markdown, paging through `less` when it exceeds terminal height.
async function renderWorkflowReview(markdown) {
  // Capture renderMarkdown output to a string so we can measure line count.
  const lines = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  const origLog = console.log;
  console.log = (...args) => { lines.push(args.join(' ')); };
  process.stdout.write = (chunk) => {
    // write() chunks don't always end with \n — accumulate into current line
    const str = String(chunk);
    const parts = str.split('\n');
    if (lines.length === 0) lines.push('');
    lines[lines.length - 1] += parts[0];
    for (let i = 1; i < parts.length; i++) lines.push(parts[i]);
    return true;
  };

  renderMarkdown(markdown);

  console.log = origLog;
  process.stdout.write = origWrite;

  const termRows = process.stdout.rows || 24;
  // Reserve rows for the separator + question + select prompt that follow
  const available = termRows - 6;

  if (lines.length <= available) {
    // Fits on screen — render inline
    for (const l of lines) origWrite(l + '\n');
    return;
  }

  // Content exceeds terminal — page through less
  const content = lines.join('\n');
  return new Promise((resolve) => {
    const pager = spawn('less', ['-R', '-F', '-X'], {
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    pager.stdin.write(content);
    pager.stdin.end();
    pager.on('close', () => resolve());
    pager.on('error', () => {
      // less not available — fall back to inline
      origWrite(content + '\n');
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
    console.log(white('How does the workflow look?'));

    const choice = await askSelect(
      '',
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
