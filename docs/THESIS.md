# groundup thesis

> Make this product yours. Ground to ship. No assumptions. Only real expected output.

groundup is an interview-first, stack-agnostic scaffolder that captures what a developer actually wants to build before writing a single line of code. The AI and the tool are in service of the user's specified vision — not the other way around. [voice review] Every decision flows from an explicit conversation, preserved as a reviewable blueprint, and executed exactly as approved.

---

## the posture

Every other tool decides for the user and the user reacts. groundup does the opposite.

The user decides. The tool captures the decision as a blueprint. The tool executes exactly what was decided. This applies to stack, aesthetics, architecture, deploy target, and brand. If it hasn't been specified, groundup doesn't invent it. There is no "smart default" that silently overrides what the user asked for, no opinionated template that bakes in choices the user never made.

---

## the wedge

Most tools optimize one layer — scaffolding, code generation, deploy. groundup coordinates them toward a user-specified intent. The interview feeds the blueprint, the blueprint feeds the workflow, the workflow feeds the phased build, the build feeds the deploy. Each layer executes within the constraints the user established in the layer before it.

Coordination is the competitive position. Better models make coordination more important, not less — they improvise more aggressively in the absence of constraints. [voice review] A model that can build anything will build the wrong thing unless the intent is explicit. groundup makes the intent explicit.

---

## scale

The same posture scales from solo dev to engineering team. Solo: Vercel, Netlify, simple deploys — one developer, one terminal, one pipeline run. Teams: CI pipelines, Spinnaker, AWS, approval workflows — the blueprint becomes a shared contract, phase approvals become PR gates, deploy targets span infrastructure. The philosophy stays the same across both: explicit decisions, captured intent, reviewable blueprint, phased build. [voice review] What changes is the coordination surface, not the posture.

---

## what this means in practice

The interview adapts to what the user is building, not what the tool wants to build. A CLI project gets different questions than a web app, and neither gets questions that assume a stack the user hasn't chosen. Defaults are opt-in, not assumed — if a field isn't filled, the tool asks. The blueprint is a reviewable contract before any code runs. We don't generate code from a prompt; we generate code from an approved plan. Phase approval gates mean every commit happens because the user approved it. The AI implements within explicit constraints and does not freestyle on aesthetics, architecture, or brand. If the blueprint says "Tailwind, minimal, dark mode," that's what gets built — not the model's idea of what looks good.

---

We build from nothing. We ship exactly what was decided.

---

*build from nothing. ship everything. ⚒️*
