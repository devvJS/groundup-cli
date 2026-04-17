export function dispatch() {
  return Promise.resolve({
    success: false,
    exitCode: 1,
    error: 'No supported agent adapter for this provider. groundup currently supports Claude Code, Gemini CLI, and Codex as build agents.',
  });
}
