# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Last verified against:** `v0.3.0-beta.8` (April 17, 2026)

## What this is

`groundup-cli` is a global, interactive Node CLI (ESM, `"type": "module"`) that walks a developer from an empty folder to a fully scaffolded, committed, pushed, and deployed project. The pipeline is: seed questions → provider/model selection → AI interview → blueprint generation/approval → repo setup (git init, create remote, push) → workflow generation/approval → phased build (agent dispatch per phase, commit/push per phase, optional squash) → deploy (Vercel, with retry-once policy). It is stack-agnostic and assumption-free — every choice requires explicit user confirmation.

## Run / develop

```bash
npm install
npm link              # exposes `groundup` globally, pointing at this checkout
groundup dig my-test  # exercise the full flow
```

There is no build step (pure ESM), no linter, and no test suite (`npm test` is a placeholder). Iterate by running `groundup` directly.

## Architecture

### Entry point

`bin/groundup.js` registers seven user-facing commands with commander and dispatches to `src/commands/*`. Commander's built-in help is fully suppressed — all help routes through `foreman` (see Help system below). `workflow` and `build` are **not** registered as commander commands; they are internal functions imported directly by `dig.js` and `continue.js`.

### Phase ordering

The hero command `dig` orchestrates the full pipeline in this order:

1. **Seed** — project name, directory, purpose, platform (`dig.js`)
2. **Provider onboarding** — multiselect providers, collect API keys, pick interview + build models (`dig.js`)
3. **AI interview** — adaptive Q&A driven by the selected interview model (`src/ai/interview.js`). Generates and approves `BLUEPRINT.md`.
4. **Repo setup** — `git init`, create `develop` + `main` branches at scaffold commit, create remote repo, push both branches, set `main` as GitHub default (`src/commands/repo.js`)
5. **Workflow generation** — AI generates `WORKFLOW.md` from the blueprint, user reviews in a native scroll view, approve/regenerate/abort (`src/commands/workflow.js`, called as `generateWorkflow()`)
6. **Build** — phase loop dispatches each workflow phase to the selected build agent, with per-phase commit/push, retry via snapshot reset, and optional squash at the end (`src/commands/build.js`, called as `runBuild()`)
7. **Deploy** — reads blueprint `### Deployment` target, runs preflight checks, deploys to production (Vercel). Retry-once on failure, then falls through to a manual checklist item. (`src/commands/deploy.js`, called as `runDeploy()`)
8. **Post-pipeline** — teardown (remove `.groundup/`), unified checklist (blueprint items + deploy fallthrough), done screen with optional live URL (`dig.js` `renderPostPipeline()`)

`continue.js` resumes at whatever phase was last saved in the session, re-entering the same functions.

### Module map

- `src/commands/dig.js` — hero command, orchestrates seed → interview → repo → workflow → build → deploy → post-pipeline
- `src/commands/continue.js` — resume at saved phase, re-enters the same pipeline functions (includes deploy phase)
- `src/commands/deploy.js` — `runDeploy()` reads blueprint target, runs provider preflight/deploy, retry-once policy
- `src/commands/repo.js` — git init, branch creation (develop + main), remote setup (GitHub/GitLab/Bitbucket/self-hosted/skip), scaffold SHA capture. Returns `{ ok: true }` on success or `{ ok: false, reason, hint }` on failure with classified reason codes (`REPO_REASONS`). Callers halt the pipeline on failure.
- `src/ui/repo-failure.js` — `renderRepoFailure(result)` renders the inline halt screen for repo-setup failures
- `src/commands/workflow.js` — `generateWorkflow()` streams WORKFLOW.md from AI, renders in scroll view, approve/regenerate/abort loop
- `src/commands/build.js` — `runBuild()` parses WORKFLOW.md into phases, dispatches each to an agent adapter, manages the approve/retry/abort gate with git lifecycle
- `src/commands/foreman.js` — full command reference, single source of truth for top-level help
- `src/commands/site.js` — `siteClear()` wipes session; `site` command is stubbed
- `src/commands/update-models.js` — fetches current model lists from provider APIs, updates `src/ai/models.config.json`
- `src/ai/interview.js` — AI-driven adaptive interview, structured Q&A format, blueprint generation and approval
- `src/ai/config.js` — API key storage (`~/.groundup/config.json`), `PROVIDER_TO_AGENT` mapping, `AGENT_LABELS`
- `src/ai/models.js` — model registry, per-phase model selection, recommendations
- `src/ai/validate.js` — model validation against live provider APIs
- `src/ai/providers/` — streaming provider adapters (see Provider architecture below)
- `src/agents/` — build-phase dispatch adapters (see Agent architecture below)
- `src/session/state.js` — JSON persistence at `.groundup/session.json`
- `src/ui/splash.js` — brand colors, separators, ASCII splash screen
- `src/ui/input.js` — `askSelect`, `askMultiselect`, `askText` wrapping `@clack/prompts` with custom rendering
- `src/deploy/index.js` — deploy provider registry, `getDeployProvider(target)` returns adapter module
- `src/deploy/vercel.js` — Vercel deploy provider (detect, preflight, deploy, parseUrl) via CLI
- `src/ui/help.js` — `renderCommandHelp()` utility, `HELP` content object for all seven commands
- `src/ui/commands.js` — command table data, overlay for `/` shortcut
- `src/ui/markdown.js` — `renderMarkdown()` and `renderMarkdownLines()` for recap display

#### Deprecated modules (pre-v0.2.0, not in the active pipeline)

- `src/interview/engine.js`, `src/interview/questions.js` — replaced by `src/ai/interview.js`
- `src/stack/selection.js`, `src/stack/recommend.js` — replaced by AI interview
- `src/blueprint/generate.js` — replaced by AI interview

### Session model

`src/session/state.js` is the single source of truth between phases. `dig.js` calls `loadSession()` after every phase to re-read fresh state and `updateSession({ phase, ... })` to advance.

Default session shape:

```json
{
  "version": "1.0.0",
  "project": { "name": null, "dir": null, "created": null, "lastUpdated": null },
  "phase": "seed",
  "interview": {
    "purpose": null, "platform": null, "provider": null,
    "providers": [], "interviewModel": {}, "buildModel": {},
    "agents": [], "answers": []
  },
  "agent": null,
  "stack": {},
  "blueprint": null,
  "repo": null,
  "build": {
    "currentPhaseIndex": 0,
    "status": "idle",
    "snapshots": {},
    "scaffoldSha": null
  },
  "deploy": {
    "target": null,
    "status": "idle",
    "url": null
  }
}
```

Important quirks:

- `saveSession` **shallow-merges over `defaultSession`** — passing a partial object will wipe sibling keys at the top level. Always spread an existing `loadSession()` result, or use `updateSession` which does this for you.
- All session paths are relative (`.groundup/session.json`); `dig` calls `process.chdir()` into the project dir before any session call. Phase modules assume cwd is already the project dir.
- `repo` is set by `runRepoSetup`: `{ host, status }` on success/skip, `{ host, status: 'failed', reason, hint }` on failure. Reason codes are enumerated in `REPO_REASONS` (`repo.js`).
- `build.status` values: `idle`, `in-progress`, `aborted`, `complete`.
- `build.snapshots` maps phase index → pre-phase HEAD SHA (used for retry reset).
- `build.scaffoldSha` is captured during repo setup and used for the optional post-build squash.
- `build.currentPhaseIndex` tracks resume position for `continue`.
- `deploy.target` is the deploy target from blueprint (e.g. "Vercel"), set when deploy phase starts.
- `deploy.status` values: `idle`, `pending`, `in-progress`, `complete`, `skipped`, `fallthrough`.
- `deploy.url` is the production URL on successful deploy.

### Git lifecycle inside build

The build loop in `src/commands/build.js` manages git state throughout the phase cycle:

- **Before each phase dispatch:** snapshot the current HEAD SHA into `build.snapshots[phaseIndex]`.
- **On approve:** `git add -A`, commit as `phase N: <title>` (skips if nothing changed), push to `origin/develop`. Push failures log the SHA and a recovery hint instead of crashing.
- **On retry:** `git reset --hard` to the pre-phase snapshot SHA, then re-dispatch with feedback.
- **On abort:** leave the working tree as-is, save `currentPhaseIndex` for resume.
- **After all phases:** offer an optional squash (default: No). If accepted: `git reset --soft <scaffoldSha>`, `git add -A`, commit as `built with groundup — <purpose>`, `git push --force-with-lease origin develop`.

Repo setup (`src/commands/repo.js`) creates both `main` and `develop` branches at the scaffold commit. On GitHub, `main` is pushed and set as the default branch via `gh repo edit --default-branch main`. GitLab and manual push paths also push `main`.

### Deploy architecture

Deploy providers under `src/deploy/` handle shipping to production after build completes. Each exports `detect()`, `preflight(cwd)`, `deploy(cwd)`, and `parseUrl(output)`.

| Provider | File | CLI | Supported |
|---|---|---|---|
| Vercel | `vercel.js` | `vercel --prod --yes` | Yes |

`src/deploy/index.js` returns the provider via `getDeployProvider(targetName)`.

The deploy target is determined during the interview via the blueprint's `### Deployment` section. Platform-to-default mapping: `web` and `api` default to Vercel; `mobile`, `cli`, `desktop`, `library` skip deploy entirely; `other` triggers an explicit interview question.

Retry policy: on first failure, retry once automatically. On second failure, fall through to a manual checklist item with a platform-specific hint. No infinite retry, no abort gate.

Preflight appends `.vercel/` to the project's `.gitignore` before any Vercel CLI command runs. On resume with a missing `.vercel/project.json`, preflight re-runs `vercel link --yes` silently.

### Post-pipeline (teardown + done screen)

After deploy (or skip), `dig.js`'s `renderPostPipeline()` handles teardown and the done screen. Teardown was moved out of `build.js` so `.groundup/` survives until deploy reads `BLUEPRINT.md` for the target. The unified checklist combines blueprint manual-step items with any deploy fallthrough item into one `amber('□')` list.

### Help system

`foreman` is the single source of truth for top-level help.

- `groundup` (no args), `--help`, `-h`, `help` → all route to `foreman()`
- Commander's built-in help is suppressed via `helpOption(false)` and `addHelpCommand(false)` on both the program and each subcommand
- Per-command `--help` is intercepted by `helpGuard()` in `bin/groundup.js`, which calls `renderCommandHelp()` from `src/ui/help.js`
- Help content lives as a data structure (`HELP` object in `src/ui/help.js`), styling lives in `renderCommandHelp()`
- Each help block includes: amber header, summary, usage, what this does, what comes next, related commands

### Provider architecture

Providers under `src/ai/providers/` handle AI model communication for the interview and workflow phases. Each exports an `async function* stream(messages, systemPrompt, options)` generator that yields text chunks.

| Provider | File | Default model | SDK |
|---|---|---|---|
| Claude (API) | `claude.js` | `claude-opus-4-6` | `@anthropic-ai/sdk` |
| Claude Code | `claudecode.js` | subprocess | `claude` CLI via `spawn` |
| OpenAI | `openai.js` | `gpt-4o` | `openai` |
| Gemini | `gemini.js` | `gemini-2.5-pro` | `@google/generative-ai` |
| Ollama | `ollama.js` | `llama3` | raw `fetch` to `localhost:11434` |

`src/ai/index.js` returns the appropriate provider via `getProvider(providerName, modelName)`.

### Agent architecture

Agents under `src/agents/` handle build-phase dispatch — spawning an external coding agent to execute a phase prompt file. Each exports a `dispatch(promptPath, cwd, { onFirstOutput })` function.

| Agent | File | CLI command | Supported |
|---|---|---|---|
| Claude Code | `claudecode.js` | `claude -p <path> --dangerously-skip-permissions` | Yes |
| Gemini | `gemini.js` | `gemini -p <path>` | Yes |
| Codex (Copilot) | `codex.js` | `codex <path>` | Yes |
| Ollama | `ollama.js` | — | No (error message) |
| Other | `other.js` | — | No (error message) |

All supported agents use `stdio: ['inherit', 'pipe', 'pipe']` — stdin is inherited (for interactive agents), stdout/stderr are piped through to the parent process. The `onFirstOutput` callback fires on the first byte of output, allowing the build loop's spinner to clear at the right moment rather than on a fixed delay.

`src/ai/config.js` maps providers to agents: `PROVIDER_TO_AGENT = { claudecode: 'claudecode', claude: 'claudecode', openai: 'copilot', gemini: 'gemini', ollama: 'other' }`.

`src/agents/index.js` exports `getAgent(agentName)` which returns the adapter module.

## Commands glossary

User-facing commands (registered in commander):

| Command | Description |
|---|---|
| `groundup dig [name]` | Start a new project — the hero command |
| `groundup continue` | Resume a paused session |
| `groundup site` | View current session details (stubbed) |
| `groundup site-clear` | Discard session and start fresh |
| `groundup foreman` | Full command reference and help |
| `groundup deploy` | Deploy to production (reads blueprint target) |
| `groundup update-models` | Refresh models from provider APIs |

**`workflow` and `build` are not user-facing commands.** They are internal functions (`generateWorkflow()` and `runBuild()`) imported and called directly by `dig.js` and `continue.js`. They are not registered in commander and produce "unknown command" if a user tries to invoke them.

## Brand palette

From `src/ui/splash.js`:

| Name | Hex | Usage |
|---|---|---|
| `amber` | `#F5A623` | GROUND, primary accent, headers, prompts |
| `white` | chalk.white | UP, body text, confirmations |
| `muted` | `#666666` | hints, secondary info, separators |
| `success` | `#4CAF50` | confirmations, completed items |
| `warning` | `#FF6B35` | warnings, caution prompts |
| `error` | `#E53935` | error messages |

## Voice

Direct, warm, first-person plural ("we save the session", "we walk you through"). Construction-trade language (dig, foreman, site, groundup). No generic AI phrasing. No second-person passive ("Your session will be saved"). Keep it short.

## Conventions

- ESM only — use `import`, `.js` extensions in relative imports.
- UI strings go through `src/ui/splash.js` helpers (`amber`, `white`, `muted`, `line`, `sep`) so brand styling stays consistent. Don't reach for `chalk` directly in command code if a helper exists.
- User input goes through `src/ui/input.js` (`askSelect`, `askMultiselect`, `askText`) — these are custom raw-mode implementations, not `@clack/prompts` wrappers. They handle cancellation, rerendering, and the `/` overlay uniformly.
- The "no assumptions" principle is load-bearing: never auto-select, auto-skip, or default a choice on the user's behalf without an explicit confirm step.
- API keys are stored at `~/.groundup/config.json` (user home, not the project). Session state is at `.groundup/session.json` (project directory).
- No linter, no test suite. `npm test` is a placeholder.
