import { spawn } from 'child_process';

export function dispatch(promptPath, cwd, { onFirstOutput } = {}) {
  return new Promise((resolve) => {
    const child = spawn('codex', [promptPath], {
      cwd,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let firstFired = false;
    const fireFirst = () => {
      if (firstFired) return;
      firstFired = true;
      if (onFirstOutput) onFirstOutput();
    };

    child.stdout.on('data', (chunk) => {
      fireFirst();
      process.stdout.write(chunk);
    });

    child.stderr.on('data', (chunk) => {
      fireFirst();
      process.stderr.write(chunk);
    });

    child.on('error', (err) => {
      fireFirst();
      resolve({ success: false, exitCode: 1, error: err.message });
    });

    child.on('close', (code) => {
      fireFirst();
      resolve({ success: code === 0, exitCode: code ?? 1 });
    });
  });
}
