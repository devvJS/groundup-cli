export const agents = [
  {
    value: 'claude',
    label: 'Claude Code',
    hint: 'recommended',
    contextFile: 'CLAUDE.md',
    mcpSupport: true,
  },
  {
    value: 'cursor',
    label: 'Cursor',
    hint: 'with .cursorrules',
    contextFile: '.cursorrules',
    mcpSupport: false,
  },
  {
    value: 'codex',
    label: 'OpenAI Codex CLI',
    hint: 'with AGENTS.md',
    contextFile: 'AGENTS.md',
    mcpSupport: false,
  },
  {
    value: 'gemini',
    label: 'Gemini CLI',
    hint: 'with GEMINI.md',
    contextFile: 'GEMINI.md',
    mcpSupport: false,
  },
  {
    value: 'copilot',
    label: 'GitHub Copilot',
    hint: 'with .github/copilot-instructions.md',
    contextFile: '.github/copilot-instructions.md',
    mcpSupport: false,
  },
  {
    value: 'other',
    label: 'Other / None',
    hint: 'generates AGENT.md',
    contextFile: 'AGENT.md',
    mcpSupport: false,
  },
];