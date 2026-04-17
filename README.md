# groundup

![groundup](docs/splash.png)

> build from nothing. ⚒️

A global CLI that takes a developer from an empty folder to a scaffolded, git-ready project through a conversational AI interview. No config. No assumptions. Never leaves the terminal.

---

## status

**v0.3.0-beta** — full flow is functional end-to-end: interview → blueprint → repo → workflow → build.

---

## install

```bash
npm install -g groundup-cli@beta
```

> Always install with `@beta` to get the latest version.
> Running `npm install -g groundup-cli` without the tag may install an older release.

The welcome screen runs automatically on install.

---

## usage

```bash
groundup dig my-project
```

That's it. groundup takes it from there.

---

## the flow

| # | Phase | What happens |
|---|-------|-------------|
| 01 | Seed | Answer two questions — what are you building and what kind of thing is it |
| 02 | Providers | Pick your AI providers and models for interview and build phases |
| 03 | Interview | AI conducts an adaptive interview to shape your blueprint |
| 04 | Blueprint | Review and approve your full project spec |
| 05 | Repo | Git init, host selection, push to develop |
| 06 | Workflow | AI generates a phased execution plan (WORKFLOW.md) from your blueprint — review and approve |
| 07 | Build | groundup dispatches each workflow phase to your chosen AI agent, one at a time. After each phase: review the recap and diff, then approve, retry with feedback, or abort. Resume any time with `groundup continue`. |
| 08 | Teardown | Option to clean up `.groundup/` project files, then the done screen |

---

## commands

| Command | Description |
|---------|-------------|
| `groundup dig [name]` | Start a new project |
| `groundup continue` | Resume a paused session |
| `groundup site` | View current session details |
| `groundup site-clear` | Discard session and start fresh |
| `groundup foreman` | Full command reference and help |
| `groundup update-models` | Refresh available models from provider APIs |

---

## session shortcuts

| Key | Action |
|-----|--------|
| `h` | Contextual help for current question |
| `ctrl+o` | Expand decisions list |
| `/` | Commands reference |
| `ctrl+c` | Quit with confirmation |

---

## what groundup produces

| File | Description |
|------|-------------|
| `README.md` | Project name, purpose, and ⚒️ footnote |
| `.gitignore` | With `.groundup/` excluded |
| `.groundup/BLUEPRINT.md` | Your approved project spec |
| `.groundup/WORKFLOW.md` | Phased execution plan generated from blueprint |
| `.groundup/GROUNDUP.md` | Agent-agnostic project instructions |
| `.groundup/agents/` | Agent-specific context files |
| `.groundup/phases/` | Per-phase prompt and recap files |

---

## AI providers

| Provider | Notes |
|----------|-------|
| Claude Code | Local — uses your claude.ai subscription |
| Anthropic API | claude-sonnet / claude-opus |
| OpenAI | gpt-4o / gpt-4o-mini |
| Gemini | gemini-2.5-pro / flash |
| Ollama | Local — llama3 |
| GitHub Copilot | Coming soon |

---

## design principles

**No assumptions. Ever.**
groundup never installs, configures, or recommends anything you didn't explicitly confirm.

**Stay in the terminal.**
From empty folder to shipped project without leaving the terminal once.

**Blueprint before build.**
Nothing gets built until you've read and approved the blueprint. The spec is the contract.

**Your project is yours.**
No lock-in. No injected dependencies. No runtime dependency on groundup. Walk away any time.

---

## positioning

> BMAD is for teams orchestrating AI agents.
> groundup is for one developer with an idea and an empty folder.

---

## license

MIT — see [LICENSE](LICENSE)

---

## contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)