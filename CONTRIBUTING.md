# Contributing

## Gitflow Policy

- **main** — production and deployment only. Never commit directly to main.
- **develop** — default integration branch. Never commit directly to develop.
- All work happens on feature branches cut from develop.

## Branch Naming

feature/short-description

Examples:
- feature/separator-fix
- feature/amber-highlight
- feature/splash-version

## Pull Request Rules

- Feature branches → develop via PR only
- develop → main via PR only, on release
- No direct pushes to main or develop

## What Lives Here

- .claude/ — local Claude Code context. Gitignored. Never committed.
- CLAUDE.md — local Claude Code instructions. Gitignored. Never committed.
- CONTRIBUTING.md — this file. Committed. Source of truth for repo policy.
