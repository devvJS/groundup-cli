const AGENT_CONTEXT = {
  claudecode: {
    name: 'Claude Code',
    sizing: 'Claude Code works best with focused, file-scoped tasks. Each task should touch a small number of files and have a clear completion signal. Avoid tasks that require long interactive sessions or manual browser testing.',
  },
  cursor: {
    name: 'Cursor',
    sizing: 'Cursor excels at file edits guided by natural language. Each task should describe the change in terms of which files to touch and what the result looks like. Keep tasks to single-file or tightly-coupled multi-file edits.',
  },
  copilot: {
    name: 'GitHub Copilot',
    sizing: 'GitHub Copilot works best with code-completion-style tasks. Each task should be a single, well-defined unit of implementation — one function, one component, one route handler. Keep scope narrow.',
  },
  gemini: {
    name: 'Gemini CLI',
    sizing: 'Gemini CLI handles broad context well but works best with explicit, step-by-step instructions. Each task should state exactly what to create or modify and what the expected output is.',
  },
  other: {
    name: 'coding agent',
    sizing: 'Each task should be a single, atomic unit of work — one file or one tightly-coupled set of files. State the goal, the files involved, and the acceptance criteria clearly.',
  },
};

export function buildWorkflowPrompt({ blueprint, provider, agent, feedback }) {
  const agentInfo = AGENT_CONTEXT[agent] || AGENT_CONTEXT.other;

  const feedbackBlock = feedback
    ? `\nDEVELOPER FEEDBACK ON PREVIOUS DRAFT\nThe developer reviewed the previous workflow and asked for changes:\n${feedback}\n\nIncorporate this feedback into the new workflow. Do not mention the feedback in your output.\n`
    : '';

  return `You are groundup — a project scaffolding agent. Your job is to convert an approved BLUEPRINT.md into a phased execution plan called WORKFLOW.md.

EXECUTING AGENT
The developer will execute each phase using ${agentInfo.name}. ${agentInfo.sizing}

TARGET: 4–8 tasks per phase. Each task is one atomic unit of work — one agent invocation.

APPROVED BLUEPRINT
\`\`\`
${blueprint}
\`\`\`
${feedbackBlock}
OUTPUT CONTRACT
Return ONLY the markdown below. No preamble. No closing commentary. No code fences wrapping the document.

Structure:

# WORKFLOW.md

## Phase 1: <title>

**Goal:** <one sentence>

**Acceptance criteria:**
- <criterion>

**Tasks:**
- [ ] <atomic task description>

## Phase 2: <title>
(assumes Phase 1 is complete)

...continue for all phases...

RULES
- Order phases by dependency. Each phase header after Phase 1 must include "(assumes Phase N is complete)" where N is the latest dependency.
- 4–8 tasks per phase. If a phase has more than 8 tasks, split it into two phases.
- Each task is a checkbox line. The description must be specific enough that the executing agent can complete it without ambiguity.
- Tasks within a phase can be executed in order — no circular dependencies within a phase.
- Include a final phase for integration testing / smoke test of the complete build.
- Do not include deployment, CI/CD, or hosting setup unless the blueprint explicitly calls for it.
- Do not repeat blueprint content verbatim — translate requirements into executable tasks.`;
}
