# 06 · Implementation Plan

> Exact build sequence. **One step at a time, in order.** Each step has a verifiable
> "done" criterion. Tick `[x]` when finished.
> Golden rule: at the end of each phase the app **starts and works** with everything built so far.

---

## Phase 0 · Setup (manual, I do it)
- [ ] **P0.1** Full Anthropic key in `.env.local` (console.anthropic.com) and a monthly spend limit (e.g. $10).
- [x] **P0.2** Create the `radar` repo on GitHub (**public**), local `git init`, check that no `.env*` gets pushed, first commit with `docs/`, `CLAUDE.md`, `README.md`, `.gitignore`, `.env.example`.

**Done:** `git status` clean, the remote repo has the docs and contains **no** keys
(checked with `git ls-files` and by searching the history for `sk-ant-`).

## Phase 1 · Skeleton
- [x] **P1.1** `npx create-next-app@latest` in the current folder (TS, App Router, Tailwind, ESLint, `src/`). Adjust to the TRD §6 structure.
- [x] **P1.2** Put the Design Brief color tokens and fonts into `globals.css` and `layout.tsx` (`next/font`).
- [x] **P1.3** Vitest + Testing Library + one trivial test; `test` and `lint` scripts in `package.json`.
- [x] **P1.4** `src/lib/env.ts`: validates the TRD §5 variables with Zod; fails on startup if the API key is missing.

**Done:** `npm run dev` shows a page with the right typography and colors; `npm test` and `npm run lint` pass.

## Phase 2 · Database
- [x] **P2.1** `db/schema.sql` (Backend §4).
- [x] **P2.2** `src/lib/db.ts` with the Backend §5 functions. Tests against SQLite `:memory:`: create, read, list, count today, steps, cascade delete.
- [x] **P2.3** SQL review with the `ecc:database-reviewer` agent.

**Done:** `db.ts` tests pass and `data/radar.db` is created when the app starts.

## Phase 3 · The agent (in isolation, no UI)
- [x] **P3.1** `agent/schema.ts`: `ReportSchema` in Zod + conversion to JSON Schema. Tests: accepts a valid example, rejects no sources / >5 signals.
- [ ] **P3.2** `agent/prompt.ts`: system prompt (TRD §3.4) and user message builder (query + context inside tags).
- [ ] **P3.3** `agent/steps.ts`: translates `server_tool_use` blocks into `{ kind, label }`. Tests with fixtures.
- [ ] **P3.4** `agent/run.ts`: full `runResearchAgent(id)` — streaming, tools, `pause_turn`, reminder if there's no `submit_report`, Zod validation, writing to SQLite, `usage`, errors by type (TRD §3, §7).
- [ ] **P3.5** Script `scripts/try-agent.ts "Company name"` (run with `node --experimental-strip-types`, or `npx tsx` if needed → record the decision) that creates a row and runs the agent from the terminal.
- [ ] **P3.6** Try it with 3 real companies; record one response as a fixture (review it for secrets first) and write a `run.ts` test that doesn't call the API.

**Done:** the script produces a valid brief in `research.report` with ≥ 3 sources, in < 2 min, and records tokens. The `run.ts` test passes offline.

> This is the phase where you **learn agents**. Read the raw responses, change the prompt, watch how the behavior changes.

## Phase 4 · API
- [ ] **P4.1** `POST /api/research`: Zod, daily limit (429), INSERT, `after(() => runResearchAgent(id))`.
- [ ] **P4.2** `GET /api/research/[id]` (research + steps) and `DELETE /api/research/[id]`.
- [ ] **P4.3** `POST /api/research/[id]/retry`.
- [ ] **P4.4** Route tests (validation → 400, limit → 429, missing → 404, ok). → `/ecc:code-review` + `ecc:security-reviewer` agent.

**Done:** with `curl` I can create, fetch, retry and delete; tests pass.

## Phase 5 · Interface
- [ ] **P5.1** Hand-written Tailwind base components: `Button`, `Input`, `Textarea`, `Badge`, `Card`, `ConfirmDialog` (native `<dialog>`), `Toast`, `StepList`.
- [ ] **P5.2** `/` Block A: new research form with counter and states (Flow P1).
- [ ] **P5.3** `/` Block B: history, empty state, delete with dialog.
- [ ] **P5.4** `/research/[id]` Progress state with `StepList` + polling every 2 s + timer.
- [ ] **P5.5** Brief state: the 8 sections, "unconfirmed", "Copy Markdown", metrics footer.
- [ ] **P5.6** Error state with Retry; 404 page.
- [ ] **P5.7** Responsive (375 px) and dark mode pass. → `/ecc:react-review` + `ecc:a11y-architect` agent.

**Done:** the full happy path (Flow §4) works locally, in a narrow window and in dark mode.

## Phase 6 · Quality
- [ ] **P6.1** Manual evaluation: 10 companies, note useful/not useful, time and cost in `docs/eval-results.md`. Tune prompt/effort until O1-O4 from the PRD are met.
- [ ] **P6.2** README with screenshots, how to run it and "what I learned". `/ecc:save-session`.

**Done:** goals O1-O4 measured and recorded; anyone can clone the repo and run it by following the README.

---

## Rough estimate
| Phase | Time (while learning) |
|---|---|
| 0-1 | 1 afternoon |
| 2 | ½ afternoon |
| 3 | 1-2 afternoons ← the important one |
| 4 | 1 afternoon |
| 5 | 2 afternoons |
| 6 | ½ afternoon |

## Possible next steps (post-MVP, each with its own mini-PRD)
- Users and login + deploying to the internet (this is where Supabase or similar would fit).
- Batch research from a CSV (Message Batches API, 50 % cheaper).
- Weekly scheduled "new signals" briefs.
- A custom tool that queries a real API (e.g. a company registry) → client-side tool loop.
