import { spawn } from 'child_process';

export function dispatch(promptPath, cwd) {
  return new Promise((resolve) => {
    const child = spawn('codex', [promptPath], {
      cwd,
      stdio: 'inherit',
    });

    child.on('error', (err) => {
      resolve({ success: false, exitCode: 1, error: err.message });
    });

    child.on('close', (code) => {
      resolve({ success: code === 0, exitCode: code ?? 1 });
    });
  });
}
