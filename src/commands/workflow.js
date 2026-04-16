import fs from 'fs';
import path from 'path';
import { getProvider } from '../ai/index.js';
import { buildWorkflowPrompt } from '../ai/prompts/workflow.js';
import { loadSession } from '../session/state.js';
import { askSelect, askText } from '../ui/input.js';
import { renderMarkdown } from '../ui/markdown.js';
import { amber, white, muted, line, sep } from '../ui/splash.js';

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

    renderMarkdown(result);

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
