export function dispatch() {
  return Promise.resolve({
    success: false,
    exitCode: 1,
    error: 'Ollama does not support agentic build execution. Use Ollama for interview/blueprint phases and pick a different provider for builds.',
  });
}
