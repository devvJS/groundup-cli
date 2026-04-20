# groundup roadmap

> Direction, not promises. Dates are intent, not commitment.

---

## where we are

The interview-first pipeline works end-to-end across five providers (Claude API, Claude Code, Gemini, OpenAI, Ollama). A developer runs `groundup dig <name>` and walks from empty folder through seed, interview, blueprint, repo setup, phased build, and auto-commit to `origin/develop`. Current release: `v0.3.0-beta.8` on develop, beta.7 on npm.

groundup works for solo developers today. The posture — explicit decisions, reviewable blueprints, phased approvals — scales to teams, and that's where the product is heading.

---

## shipping

### Ground to Ship — closing the loop

Take groundup from "code on develop" to "live on the internet." Vercel first, Netlify and GitHub Pages to follow. The blueprint gains a Deployment section populated during the interview. No assumptions about deploy target — the user decides during the interview, we execute.

**Target:** beta.9 · in progress

### Design-Aware Interviews — no assumptions applies to aesthetics too

Today's pipeline scaffolds functional projects but makes no attempt to capture the user's visual intent. Beta.10 changes that. Web and mobile projects get a structured design interview covering brand palette, typography, visual direction, component library preference, and asset handling. The blueprint gains a Design section. The workflow gains a Design Tokens phase before any UI implementation. The AI works within the design the user specified, not a default it picked.

**Target:** beta.10

### Provider parity — Ollama and Copilot

Local Ollama works but has rough edges — structured output validation, loop detection, model capability tiering. Copilot provider has been planned but not shipped. Both get production-ready support.

**Target:** beta.11 (or sooner as ride-along polish)

---

## where this is heading

The solo-developer track proves the posture. The team track scales it.

### Team coordination

groundup's posture — explicit decisions, reviewable blueprints, phased approvals — is how serious work actually gets done on teams. Future releases bring:

- **CI integration** — phase approvals via PR comments instead of the terminal, for async teams
- **Shared blueprints** — a team publishes a "standard service" blueprint, every new project starts from it
- **Multi-target deploys** — beyond single-platform deploys, groundup coordinates with CI pipelines (GitHub Actions, Spinnaker, Argo, GitLab CI) and cloud infrastructure (AWS, GCP, Azure)
- **Enterprise posture** — SSO, audit trails, compliance flags baked into the blueprint where the organization requires them

This isn't a separate product. It's the same groundup, same posture, more coordination surface.

### Skill edition

A standalone Claude Code skill (and eventually other-agent equivalents) that walks any developer through the groundup workflow without requiring the CLI install. Lower-friction entry point. Same interview, same blueprint, same phases.

---

## the principle

Every release in this roadmap extends the same posture: **no assumptions, user intent as source of truth, coordination over automation.** Features that don't fit the posture don't make the roadmap.

---

*build from nothing. ship everything. ⚒️*
