# 06 · Implementation Plan

> Exact build sequence. **One step at a time, in order.** Each step has a verifiable
> "done" criterion. Tick `[x]` when finished.
> Golden rule: at the end of each phase the app **starts and works** with everything built so far.

---

## Phase 0 · Setup (manual, I do it)
- [x] **P0.1** OpenAI API key in `.env.local` (platform.openai.com → API keys) and a monthly spend limit (e.g. $10).
- [x] **P0.2** Create the `radar` repo on GitHub (**public**), local `git init`, check that no `.env*` gets pushed, first commit with `docs/`, `CLAUDE.md`, `README.md`, `.gitignore`, `.env.example`.

**Done:** `git status` clean, the remote repo has the docs and contains **no** keys
(checked with `git ls-files` and by searching the history for `sk-`).

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
- [x] **P3.2** `agent/prompt.ts`: system prompt (TRD §3.4) and user message builder (query + context inside tags).
- [x] **P3.3** `agent/steps.ts`: translates `web_search_call` items into `{ kind, label }`. Tests with fixtures.
- [x] **P3.4** `agent/run.ts`: full `runResearchAgent(id)` — streaming, tools, chained turns, reminder if there's no `submit_report`, Zod validation, writing to SQLite, `usage`, errors by type (TRD §3, §7).
- [x] **P3.5** Script `scripts/try-agent.ts "Company name"` (`npm run agent:try -- "Company"`, runs with `tsx`) that creates a row and runs the agent from the terminal.
- [x] **P3.6** Try it with 3 real companies and tune the prompt; the `run.ts` tests drive the loop with a scripted fake stream, so they never call the API.

**Done:** the script produces a valid brief in `research.report` with ≥ 3 sources, in < 2 min, and records tokens. The `run.ts` test passes offline.

> This is the phase where you **learn agents**. Read the raw responses, change the prompt, watch how the behavior changes.

## Phase 4 · API
- [x] **P4.1** `POST /api/research`: Zod, daily limit (429), INSERT, `after(() => runResearchAgent(id))`.
- [x] **P4.2** `GET /api/research/[id]` (research + steps) and `DELETE /api/research/[id]`.
- [x] **P4.3** `POST /api/research/[id]/retry`.
- [x] **P4.4** Route tests (validation → 400, limit → 429, missing → 404, ok). → `/ecc:code-review` + `ecc:security-reviewer` agent.

**Done:** with `curl` I can create, fetch, retry and delete; tests pass.

## Phase 5 · Interface
- [x] **P5.1** Hand-written Tailwind base components: `Button`, `Input`, `Textarea`, `Badge`, `Card`, `ConfirmDialog` (native `<dialog>`), `Toast`, `StepList`.
- [x] **P5.2** `/` Block A: new research form with counter and states (Flow P1).
- [x] **P5.3** `/` Block B: history, empty state, delete with dialog.
- [x] **P5.4** `/research/[id]` Progress state with `StepList` + polling every 2 s + timer.
- [x] **P5.5** Brief state: the 8 sections, "unconfirmed", "Copy Markdown", metrics footer.
- [x] **P5.6** Error state with Retry; 404 page.
- [x] **P5.7** Responsive (375 px) and dark mode pass. → `/ecc:react-review` + `ecc:a11y-architect` agent.

**Done:** the full happy path (Flow §4) works locally, in a narrow window and in dark mode.

## Phase 6 · Quality
- [ ] **P6.1** Manual evaluation: 10 companies, note useful/not useful, time and cost in `docs/eval-results.md`. Tune prompt/effort until O1-O4 from the PRD are met. _(First run done with `npm run agent:eval`: O2 and O3 met, O4 12 % over, O1 awaiting the owner's rating.)_
- [x] **P6.2** README with screenshots, how to run it and "what I learned". `/ecc:save-session`.

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

# Post-MVP roadmap

> Each phase starts by writing its mini-spec (PRD feature + TRD section) and ends with the app
> working, tests green, CI green and the README updated. Built one phase after another on `main`.

## Phase 7 · Showcase
- [x] **P7.1** GitHub Actions CI: lint, tests and build on every push, with a README badge.
- [x] **P7.2** Animated demo in the README (type a company → live steps → brief).

**Done:** a visitor sees the app working and a green build without cloning the repo.

## Phase 8 · Close the evaluation
> Runs after phase 9, so the cost experiment can be compared on judge scores, not just on cost.

- [x] **P8.1** Cost experiment: `search_context_size: "low"` vs `"medium"` on the same 10 companies; keep the cheaper setting if quality holds (O4).
- [ ] **P8.2** Owner rates the 10 briefs useful / not useful (O1). _(Owner task.)_

**Done:** O1-O4 recorded in `docs/eval-results.md` with the chosen configuration.

## Phase 9 · LLM-as-judge evaluation
- [x] **P9.1** Extract the shared agent loop (TRD §3.7); the researcher's tests pass unchanged.
- [x] **P9.2** Judge agent (TRD §3.8) with a strict schema and tests driven by a fake model.
- [x] **P9.3** `npm run agent:judge` grades existing briefs; `npm run agent:eval` grades each new one. Judge the 10 evaluation briefs.

**Done:** every eval run produces objective quality scores next to time and cost.

## Phase 10 · Verifier agent (multi-agent)
- [x] **P10.1** `verification` column with an in-code migration for existing databases.
- [x] **P10.2** Verifier agent (TRD §3.9) wired into the research run, with tests driven by a fake model.
- [x] **P10.3** Progress steps and the brief's footer show the verification.
- [x] **P10.4** Eval with and without the verifier; compare judge scores, time and cost.

**Done:** the verifier measurably reduces unsupported claims in the eval.

## Phase 11 · Swappable model provider
- [ ] **P11.1** Provider interface; OpenAI and Anthropic implementations of the research loop.
- [ ] **P11.2** Model comparison: the eval run across providers/models, published as a table.

**Done:** `LLM_PROVIDER` switches providers with no other code change; comparison table in the docs.

## Phase 12 · Custom tools
- [ ] **P12.1** The shared loop executes client functions (TRD §3.7, §3.12).
- [ ] **P12.2** `lookup_company_facts` backed by Wikidata, wired into the researcher, with tests on recorded responses.

**Done:** the agent calls our own tool when relevant and its results appear in the brief's sources.

## Phase 13 · Batch research
- [x] **P13.1** Run queue with bounded concurrency (TRD §3.10) used by every research.
- [x] **P13.2** `POST /api/research/batch` with validation and the daily limit.
- [x] **P13.3** "Research several" on the home page (paste or CSV) and a live-refreshing history.

**Done:** 10 companies from a CSV end up as 10 briefs in the history.

## Phase 14 · Watchlist
- [x] **P14.1** `watchlist` table, `previous_id` column, store functions and new-signal comparison.
- [x] **P14.2** Scheduler and the watchlist API (follow, unfollow, refresh now).
- [x] **P14.3** Follow button, "New" badges on refreshed briefs and the Following block on the home page.

**Done:** a followed company shows "new since last time" after a refresh.

## Phase 15 · Export
- [x] **P15.1** Download a brief as Markdown and as a print-ready PDF.

**Done:** both files open correctly and contain all eight sections.

## Phase 16 · Users and deployment
- [ ] **P16.1** Decide hosting, auth and database with the owner (accounts and running costs are theirs).
- [ ] **P16.2** Implement and deploy.

**Done:** a public URL where a signed-in user can research companies.
