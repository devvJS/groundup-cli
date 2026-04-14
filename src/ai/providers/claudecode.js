import { spawn, spawnSync } from 'child_process';

const INSTALL_URL = 'https://claude.ai/download';

export function isInstalled() {
  const result = spawnSync('claude', ['--version'], { encoding: 'utf-8' });
  return result.status === 0;
}

function flatten(messages) {
  return messages
    .map((m) => {
      const role = m.role === 'assistant' ? 'Assistant' : 'User';
      return `[${role}]\n${m.content}`;
    })
    .join('\n\n');
}

export async function* stream(messages, systemPrompt) {
  if (!isInstalled()) {
    throw new Error(`Claude Code not found. Install it at ${INSTALL_URL} or choose another provider.`);
  }

  const args = ['-p', '--system-prompt', systemPrompt];
  const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });

  child.stdin.write(flatten(messages));
  child.stdin.end();

  const queue = [];
  let waiter = null;
  let finished = false;
  let exitError = null;
  let stderrBuf = '';

  const push = (item) => {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w(item);
    } else {
      queue.push(item);
    }
  };

  child.stdout.on('data', (data) => {
    const text = data.toString();
    if (text) push({ text });
  });

  child.stderr.on('data', (data) => {
    stderrBuf += data.toString();
  });

  child.on('error', (err) => {
    exitError = err;
    finished = true;
    push({ done: true });
  });

  child.on('close', (code) => {
    if (code !== 0) {
      exitError = new Error(
        `claude exited with code ${code}${stderrBuf ? `: ${stderrBuf.trim()}` : ''}`
      );
    }
    finished = true;
    push({ done: true });
  });

  while (true) {
    let item;
    if (queue.length > 0) {
      item = queue.shift();
    } else if (finished) {
      break;
    } else {
      item = await new Promise((resolve) => {
        waiter = resolve;
      });
    }
    if (item.done) break;
    if (item.text) yield item.text;
  }

  if (exitError) throw exitError;
}
