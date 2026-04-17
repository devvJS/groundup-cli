import fs from 'fs';
import path from 'path';
import { getProvider } from '../ai/index.js';
import { PROVIDER_TO_AGENT } from '../ai/config.js';
import { buildWorkflowPrompt } from '../ai/prompts/workflow.js';
import { loadSession } from '../session/state.js';
import { askSelect, askText } from '../ui/input.js';
import { amber, white, muted, success, warning, line, sep } from '../ui/splash.js';

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

const HIDE_CURSOR = '\x1B[?25l';
const SHOW_CURSOR = '\x1B[?25h';
const SAVE_CURSOR = '\x1b7';
const RESTORE_CURSOR = '\x1b8';

// Native scroll view — displays workflow content in a viewport with
// arrow-key scrolling, matching the DEC save/restore cursor pattern
// used by askSelect / askMultiselect in src/ui/input.js.
async function renderWorkflowReview(markdown) {
  const lines = renderWorkflowMarkdown(markdown);

  const termRows = process.stdout.rows || 24;
  // Reserve rows for the hint bar + blank padding below it
  const viewportHeight = termRows - 4;

  if (lines.length <= viewportHeight) {
    // Fits on screen — render inline, no scroll needed
    console.log(lines.join('\n'));
    return;
  }

  const maxOffset = lines.length - viewportHeight;
  let offset = 0;

  const buildHint = () => {
    const atEnd = offset >= maxOffset;
    const status = atEnd
      ? muted('── end of workflow ──')
      : muted(`  ${offset + 1}–${offset + viewportHeight} of ${lines.length} lines`);
    return '  ' + amber('↑ ↓') + ' ' + muted('scroll') +
      '   ' + amber('q') + ' ' + muted('done') +
      '   ' + amber('enter') + ' ' + muted('done') +
      '      ' + status;
  };

  const paint = () => {
    process.stdout.write(RESTORE_CURSOR);
    process.stdout.write('\x1b[J');
    const visible = lines.slice(offset, offset + viewportHeight);
    for (const l of visible) process.stdout.write(l + '\n');
    process.stdout.write('\n');
    process.stdout.write(buildHint());
  };

  // Save cursor at the top of the viewport area, then draw
  process.stdout.write(HIDE_CURSOR);
  process.stdout.write(SAVE_CURSOR);
  paint();

  return new Promise((resolve) => {
    let mode = 'scroll';
    let rule = muted('═'.repeat(process.stdout.columns || 80));

    const teardown = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      // Clear the scroll view and restore cursor to the saved position
      process.stdout.write(RESTORE_CURSOR);
      process.stdout.write('\x1b[J');
      process.stdout.write(SHOW_CURSOR);
    };

    const showConfirmQuit = () => {
      mode = 'confirm-quit';
      process.stdout.write('\n' + rule + '\n');
      process.stdout.write(warning('  Are you sure you want to quit? ') + white('[press y for YES or n for NO]'));
      process.stdout.write('\n' + rule);
    };

    const dismissConfirmQuit = () => {
      process.stdout.write('\x1B[3A\r\x1B[J');
      process.stdout.write(buildHint());
      mode = 'scroll';
    };

    const onData = (data) => {
      let i = 0;
      while (i < data.length) {
        const byte = data[i];

        if (mode === 'confirm-quit') {
          if (byte === 0x79 || byte === 0x59) {
            teardown();
            process.stdout.write('\x1B[2J\x1B[H');
            line();
            console.log(amber('■ ') + white('Session saved. Run ') + amber('groundup continue') + white(' to pick up where you left off.'));
            line();
            process.exit(0);
          }
          dismissConfirmQuit();
          i++;
          continue;
        }

        // ctrl+c
        if (byte === 0x03) {
          showConfirmQuit();
          i++;
          continue;
        }

        // q or enter — exit scroll view
        if (byte === 0x71 || byte === 0x0d || byte === 0x0a) {
          teardown();
          resolve();
          return;
        }

        // ESC sequence — arrow keys
        if (byte === 0x1B && data[i + 1] === 0x5B && i + 2 < data.length) {
          const third = data[i + 2];
          if (third === 0x41 && offset > 0) {
            offset--;
            paint();
          } else if (third === 0x42 && offset < maxOffset) {
            offset++;
            paint();
          }
          i += 3;
          continue;
        }

        i++;
      }
    };

    if (process.stdin.isPaused()) process.stdin.resume();
    process.stdin.setRawMode(true);
    process.stdin.on('data', onData);
  });
}

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

    // Clear scroll view residue and re-print the section header
    process.stdout.write('\x1B[2J\x1B[H');
    sep();
    console.log(amber('■ ') + white('Review WORKFLOW.md'));
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
