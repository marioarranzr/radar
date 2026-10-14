# CLAUDE.md — Rules for agents working in this repo

This project is **document-driven**. The documents in `docs/` are the source of truth.
If code and a document disagree, the document wins (or the document is updated first — never silently).

## Mandatory reading order (before touching code)

1. `docs/01-PRD.md` — WHAT we are building and WHY. Scope and what is NOT included.
2. `docs/02-TRD.md` — WHAT WITH. Stack, APIs, closed technical decisions.
3. `docs/03-APP-FLOW.md` — HOW it is navigated. Screens, buttons and what happens when pressed.
4. `docs/04-DESIGN-BRIEF.md` — HOW it looks. Color tokens, typography, components.
5. `docs/05-BACKEND-SCHEMA.md` — WHERE data lives. SQLite tables, columns, relationships.
6. `docs/06-IMPLEMENTATION-PLAN.md` — IN WHAT ORDER. Numbered steps with a "done" criterion.

## Working rules

- **Everything in the repo is written in English** — code, comments, docs, commit messages, UI copy,
  test names, agent prompts and the reports the agent produces. (The owner may chat in Spanish;
  the repository is still English-only.)
- **Work one plan step at a time.** State which step (`P3.2`, etc.) you are executing.
- **Do not invent.** If something is not defined in the docs, STOP and ask. Do not add libraries,
  screens, tables or features that are not in the PRD/TRD.
- **When a step is finished:** tick its checkbox in `06-IMPLEMENTATION-PLAN.md`, verify its
  "done" criterion and summarize what changed in 2-3 lines.
- **If a decision changes** (e.g. a different library), first propose the change in the relevant doc,
  add an entry to the TRD "Decision log", and only then change the code.
- **This repository is PUBLIC.** Before every commit, review `git diff --cached` and make sure none of
  these get in: keys or tokens (`sk-`…), `.env*` files (except the empty `.env.example`), `data/`
  (the database), logs, absolute paths from my machine, emails or personal data. If in doubt, do not
  commit — ask.
- **Secrets:** never in code, tests, fixtures or commits. Only in `.env.local` (and `.env.example`
  without values). Model responses recorded as fixtures are reviewed before committing.
- **Tests:** every step with logic (not just UI) gets at least one test. TDD whenever feasible.

## Workflow with the ECC plugin

| When | ECC command / skill |
|---|---|
| Bootstrap the MVP from these docs | `/ecc:orch-build-mvp` (pass it `docs/`) or step by step with `/ecc:plan` |
| Plan a specific step before coding | `/ecc:plan` (waits for your confirmation) |
| Implement tests-first | `ecc:tdd-workflow` skill / `/ecc:react-test` |
| Review work before committing | `/ecc:code-review` and `/ecc:react-review` |
| Security review (keys, inputs, SQL) and before every push | `ecc:security-reviewer` agent |
| Review the SQL schema | `ecc:database-reviewer` agent |
| Build is failing | `/ecc:react-build` |
| Add a feature after the MVP | `/ecc:orch-add-feature` (update PRD → plan first) |
| Save state at the end of a session | `/ecc:save-session` |

## Project commands

```bash
npm run dev       # local server at http://localhost:3000
npm test          # vitest
npm run lint      # eslint + tsc --noEmit
```
