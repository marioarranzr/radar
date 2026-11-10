# 02 · TRD — Technical Requirements Document

> **Closed** decisions. The implementing agent must not choose alternatives without
> going through the "Decision log" first (section 9).
> **MVP principle:** zero external services other than the OpenAI API, and the fewest possible npm dependencies.

---

## 1. Stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| Runtime | Node.js | 24.x (already installed) | Ships with built-in SQLite |
| Language | TypeScript (strict) | 5.x | Shared types front/back, better guidance for the AI |
| Web framework | Next.js (App Router) | 15.x | Front end + API in a single project |
| Styling | Tailwind CSS | 4.x | No component library: the (few) components are hand-written |
| Database | **SQLite via `node:sqlite`** (Node built-in module) | — | A local file, nothing to install, no server |
| LLM | OpenAI Responses API via `openai` | 7.x | Official SDK |
| Validation | Zod | 4.x | Validates inputs and the agent's output; built-in JSON Schema export |
| Tests | Vitest + Testing Library | — | Fast, standard |
| Package manager | npm | Node's | Already installed |
| Runtime environment | Local: `npm run dev` | — | No hosting in the MVP |

### Allowed dependencies (closed list)
- **Runtime:** `next`, `react`, `react-dom`, `openai`, `zod`
- **Development:** `typescript`, `@types/*`, `tailwindcss` (+ its PostCSS plugin), `eslint` (+ Next config), `vitest`, `@testing-library/react`, `@testing-library/dom`, `jsdom`, `tsx`
- Anything else → goes through the Decision log.

## 2. Architecture

```
Browser ──(1) POST /api/research──▶ Next.js Route Handler (on my machine)
    │                                    │ validates (Zod), checks the daily limit,
    │                                    │ INSERT research(status='queued') into SQLite
    │                                    │ responds { id } immediately
    │                                    ▼
    │                         after(): runResearchAgent(id)   ← runs after responding
    │                                    │ agent loop with OpenAI
    │                                    │ INSERT research_steps (progress)
    │                                    │ UPDATE research.report + status
    │                                    ▼
    └──(2) GET /api/research/[id] every 2 s ◀── SQLite (data/radar.db)
```

- The HTTP request **does not wait** for the agent: it returns the `id` and the page **polls every 2 s**
  until the status is `done` or `failed`. No websockets or real-time services.
- The agent runs inside the Next server itself via `after()`.

## 3. The agent (core of the project)

### 3.1 Agent type
**OpenAI Responses API + the built-in `web_search` tool** (searching and opening pages run on OpenAI's side).
The only function tool is `submit_report`, used to get the structured brief. Turns are chained with
`previous_response_id`, so the full history is not resent.

### 3.2 Request configuration

| Parameter | Value |
|---|---|
| `model` | `gpt-6.1-sol` (configurable via `OPENAI_MODEL`; `gpt-6-astra` for maximum quality) |
| `reasoning.effort` | `"medium"` (raise to `high` if quality doesn't reach O1) |
| `max_output_tokens` | 32000 |
| `instructions` | The static system prompt (§3.4) |
| Streaming | `client.responses.create({ ..., stream: true })`, reading raw events (`src/agent/openai-stream.ts`): progress from `response.output_item.done`, the final response from `response.completed` / `response.incomplete` |

### 3.3 Tools

| Tool | Type | Config |
|---|---|---|
| Web search | `web_search` (built-in) | `search_context_size` from `SEARCH_CONTEXT_SIZE` (default `"low"`, see the decision log); reasoning models can also `open_page` and `find_in_page` |
| `submit_report` | `function`, `strict: true` | `parameters` = `ReportSchema` as JSON Schema (§3.5) |

- `tool_choice: "auto"`. The instructions state that the model **must** finish by calling `submit_report`.
- If the response ends without calling `submit_report`, a reminder is sent once (chained with
  `previous_response_id`); if it fails again → `status='failed'`.
- If the `submit_report` arguments fail Zod validation, the issues are returned once as the
  `function_call_output`; a second invalid brief → `status='failed'`.
- At most 8 requests per run. `status: "incomplete"` (`max_output_tokens`, `content_filter`) or a
  `refusal` content part → `status='failed'`.

### 3.4 System prompt (summary; full version in `src/agent/prompt.ts`)
- Role: B2B research analyst.
- Process: 1) identify the right company, 2) official website, 3) news from the last 12 months,
  4) size/funding data, 5) fill in the brief.
- Rules: don't make things up; every important claim must be traceable to a source; anything unconfirmed
  is marked `confirmed: false`; **write the brief in English**.
- The user's **Context** is added as a separate block in the user message, inside tags.

### 3.5 Brief schema (`ReportSchema`, Zod → JSON Schema)

```ts
{
  company_name: string,
  website: string | null,
  summary: string,                     // 2-3 sentences
  offering: string,                    // what they sell and to whom
  business_model: string,
  key_facts: { label: string, value: string, confirmed: boolean }[],
  recent_signals: { date: string, title: string, url: string }[],   // max 5
  pains_opportunities: string[],       // max 5
  discovery_questions: string[],       // 3-5
  sources: { title: string, url: string }[]                          // min 3
}
```
The `submit_report` arguments are parsed and validated again with Zod on the server before saving.
Keywords strict mode may not support (length/size bounds, `format`) are dropped from the schema sent
to the model and enforced by Zod instead. Before validation, OpenAI's internal citation markers
(private-use characters such as `\uE200cite…\uE201`) are stripped from every string (`src/agent/sanitize.ts`).

### 3.6 Progress
Each finished `web_search_call` item is translated into a readable step: `search` →
"Searching: “acme pricing”", `open_page` → "Reading: acme.com/about", `find_in_page` →
"Scanning: acme.com/pricing". The `submit_report` call becomes "Writing the brief".

### 3.7 Shared agent loop (`src/agent/loop.ts`)
The researcher, the judge (§3.8) and the verifier all follow the same pattern, so it lives in one
function: stream a request with the given tools, report each finished output item, and finish when
the model calls the **submit function** with arguments that pass its Zod schema. The loop owns the
chaining (`previous_response_id`), the single reminder, the single validation-correction turn, the
turn cap and the refusal / truncation checks, and returns a typed result:
`ok | refused | truncated | invalid | no_submit | too_many_turns | aborted`, plus token usage.
Callers map those outcomes to their own messages; API errors are thrown to the caller.

### 3.8 Evaluation judge (`src/eval/judge.ts`, offline only)
A second agent grades a finished brief. It never runs in the app — only from `npm run agent:eval`
and `npm run agent:judge`.

| Setting | Value |
|---|---|
| Model | `JUDGE_MODEL` (default: same as `OPENAI_MODEL`) |
| Tools | `web_search` (to open the cited pages) + strict `submit_judgement` function |
| Effort | `reasoning.effort: "medium"` |

It picks the 5 most important factual claims (key facts and recent signals), opens the cited
source for each and marks it `supported`, `unsupported` or `unverifiable`, then scores 1-5:

| Score | Question |
|---|---|
| `groundedness` | Are the claims backed by the cited sources? |
| `completeness` | Are all sections substantive (not filler)? |
| `relevance` | Would this actually help prepare a first sales call? |
| `recency` | Are the signals recent and dated correctly? |

Plus a one-paragraph `summary`. Results are printed as a table and saved as JSON in `data/evals/`
(ignored by git); the headline numbers go into `docs/eval-results.md`.

### 3.9 Verifier agent (`src/agent/verify.ts`)
After the researcher submits a valid brief, a second agent checks it before it is saved.

| Setting | Value |
|---|---|
| Model | `OPENAI_MODEL` |
| Tools | `web_search` (to open the cited pages) + strict `submit_verification` function |
| Effort | `reasoning.effort: "low"` (targeted checks, not open research) |
| Switch | `VERIFY_BRIEFS` (default `false`: opt-in, see the decision log) |

It receives the brief with every key fact and recent signal numbered, opens the relevant cited
page for each and returns a verdict per item: `supported`, `unsupported` or `unverifiable`.

- **It can only downgrade, never add.** A key fact that is not `supported` gets `confirmed: false`;
  an `unsupported` recent signal is removed. The verifier cannot change values or add facts, so it
  cannot introduce new hallucinations.
- Progress steps: "Verifying the facts", then "Checking: <page>" for each page it opens.
- The outcome is saved in `research.verification` (JSON): `{ checked, downgraded, removedSignals }`,
  and shown in the brief's footer.
- **If the verifier fails** (API error, no submission, invalid output), the researcher's brief is
  saved unchanged with `verification = null`: the run still succeeds.
- Its token usage is added to the run's metrics, so cost reflects both agents.

### 3.10 Run queue (`src/agent/queue.ts`)
Every research — single or batch — goes through one in-process queue that runs at most
**2 agents at a time** (`MAX_CONCURRENT_RUNS`), in creation order. It bounds API cost, rate-limit
pressure and load on the local machine. `startResearchAgent(id)` enqueues inside Next's `after()`,
so the request still responds immediately. A queued research shows as `Queued` until a slot frees up.

### 3.11 Watchlist refresh (`src/agent/watchlist.ts`)
- A `watchlist` row per followed company; each refresh creates a normal research with
  `previous_id` pointing at the watch's last research, then becomes its new `last_research_id`.
- **Scheduler:** started from `src/instrumentation.ts`, it checks every 10 minutes for watches whose
  last research is older than `interval_days` (default 7) and has finished, and enqueues a refresh if
  the daily limit allows. A watch never has two refreshes in flight.
- **New signals** are computed at read time: signals in the brief whose URL (or title, when URLs
  differ only in tracking parameters) doesn't appear in the previous brief.

### 3.12 Custom tool: `lookup_company_facts` (`src/agent/tools/wikidata.ts`)
A client-side function tool the researcher can call alongside `web_search`. Our server executes it
against **Wikidata** (free, no API key) and returns structured facts for up to 3 matching entities:
founding date, country, headquarters, employees (latest), website, industry, CEO and parent
organisation, each entity with its `https://www.wikidata.org/wiki/Q…` URL to cite.

- The shared loop (§3.7) runs **client functions**: when a response contains calls to them (and no
  submit call), it executes them, sends the outputs back as `function_call_output` items chained
  with `previous_response_id`, and continues. Tool errors are returned to the model as text, never thrown.
- Requests go only to `www.wikidata.org` with a descriptive `User-Agent` and an 8 s timeout; the
  result is capped at 3 entities, so its size is bounded.
- Progress step: "Checking Wikidata: <name>".

## 4. Own APIs (Route Handlers)

| Method | Route | Body / response | Notes |
|---|---|---|---|
| POST | `/api/research` | `{ query, context? }` → `{ id }` | Requires `Content-Type: application/json` (415); 400 validation; 429 if over the daily limit |
| POST | `/api/research/batch` | `{ queries: string[] }` → `{ ids }` | 1-20 companies; 400 validation; 429 if more than the day's remaining limit (nothing is created) |
| POST | `/api/watchlist` | `{ researchId }` → `{ watch }` | Follow the company of a finished research; 404 if missing, idempotent per company |
| DELETE | `/api/watchlist/[id]` | → `204` | Unfollow |
| POST | `/api/watchlist/[id]/refresh` | → `{ id }` | Refresh now; 409 if one is already running, 429 at the daily limit |
| GET | `/api/research/[id]` | → `{ research, steps }` | Used by polling; 404 if not found |
| POST | `/api/research/[id]/retry` | → `{ id }` | Only if `status='failed'` (409); max 3 attempts per research (409) |
| DELETE | `/api/research/[id]` | → `204` | |

The history and the brief are read directly from SQLite in Server Components (`src/lib/db.ts`).

`src/middleware.ts` guards every `/api/*` route: the `Host` must be a localhost name (blocks DNS
rebinding) and non-GET requests with a non-local `Origin` are rejected with 403 (blocks CSRF).

## 5. Environment variables (`.env.local`)

```
OPENAI_API_KEY=                # required, server only
OPENAI_MODEL=gpt-6.1-sol
JUDGE_MODEL=                  # optional, evaluation only; defaults to OPENAI_MODEL
VERIFY_BRIEFS=false           # opt-in: run the verifier agent after each research
SEARCH_CONTEXT_SIZE=low       # low | medium | high: web content per search (the main cost driver)
DAILY_RESEARCH_LIMIT=10
DATABASE_PATH=./data/radar.db
```

## 6. Folder structure

```
src/
  app/
    page.tsx                      # New research + history
    research/[id]/page.tsx        # Progress / Brief / Error
    api/research/route.ts
    api/research/[id]/route.ts
    api/research/[id]/retry/route.ts
  agent/
    loop.ts         # shared submit-function agent loop (§3.7)
    run.ts          # runResearchAgent(id)
    verify.ts       # verifier agent (§3.9)
    prompt.ts
    schema.ts       # ReportSchema (Zod)
    steps.ts        # translates events → readable steps
  lib/
    db.ts           # node:sqlite connection + queries
    env.ts          # validates environment variables with Zod
  eval/
    judge.ts        # evaluation judge (§3.8), offline only
  components/       # Button, Input, Badge, Card, StepList, Report…
db/schema.sql       # SQLite schema (applied on startup if missing)
data/               # radar.db (ignored by git)
tests/
```

## 7. Non-functional requirements

- **Security:** API key only on the server and in `.env.local` (ignored by git); inputs validated
  with Zod; SQL queries always parameterized (`?`), never string concatenation; user text is never
  interpolated into the system prompt. The server only listens on `127.0.0.1` (`next dev -H 127.0.0.1`).
  The UI renders every report string as plain React text (never `dangerouslySetInnerHTML` or Markdown→HTML),
  shows each link's hostname, and opens links with `rel="noopener noreferrer"`.
- **Cost:** record `usage` (input/output tokens) in `research` to compute O4.
- **Errors:** catch by type (`AuthenticationError`, `RateLimitError`, `APIConnectionError`, `APIError`)
  and store a readable message in `research.error`.
- **Accessibility:** WCAG AA contrast and keyboard navigation.
- **Clean start:** if `data/radar.db` doesn't exist, it is created from `db/schema.sql` on first access.
- **Language:** all code, UI copy and generated briefs are in English.

## 8. Testing

- Unit: `schema.ts`, `steps.ts`, `db.ts` (with an `:memory:` database), route validation, daily limit.
- Agent: test with **scripted** model responses (a fake stream), without calling the real API.
- Manual evaluation: 10 well-known companies, rated useful / not useful (O1).
- E2E with Playwright: **out of the MVP** (it would be one more dependency).

## 9. Decision log (lightweight ADR)

| Date | Decision | Rejected alternatives | Reason |
|---|---|---|---|
| 2026-10-14 | Provider-hosted web search tool | Tavily/SerpAPI + custom scraping | Less code, fewer keys |
| 2026-10-14 | `after()` instead of a queue | Inngest, Managed Agents | Enough for the MVP |
| 2026-10-14 | Output via a `submit_report` tool with `strict` | Parsing Markdown | Guaranteed structure |
| 2026-10-14 | **No users or login; local personal use** | Supabase Auth | The MVP is just for me; fewer moving parts |
| 2026-10-14 | **SQLite via `node:sqlite`** | Supabase/Postgres, `better-sqlite3`, Prisma | Zero services and zero extra dependencies |
| 2026-10-14 | **Polling every 2 s** for progress | Supabase Realtime, SSE, websockets | The simplest thing that works |
| 2026-10-14 | **No component library** (hand-written Tailwind) | shadcn/ui | Fewer dependencies; only a few components |
| 2026-10-14 | npm | pnpm | Ships with Node |
| 2026-10-14 | Add `@testing-library/dom` | — | Required peer dependency of `@testing-library/react` |
| 2026-10-14 | Zod 4 instead of 3 | Zod 3 + `zod-to-json-schema` | `z.toJSONSchema()` is built in: one dependency fewer |
| 2026-10-14 | **Switch the LLM provider from Anthropic (Claude) to OpenAI** — Responses API, `web_search`, `gpt-6.1-sol` | Claude API (`claude-opus-5-5`) | Owner's decision. `gpt-6.1-sol` is half the price per token, and `web_search` can also open pages, so one tool replaces web search + web fetch |
| 2026-10-14 | Read raw stream events instead of the SDK's `responses.stream()` helper | `client.responses.stream()` | The helper's accumulator throws on valid sequences ("expected output item type 'message', got 'function_call'"); the terminal event already carries the full response |
| 2026-11-10 | One shared agent loop for the researcher, judge and verifier | Copying the loop per agent | One place for chaining, retries, refusal and truncation handling |
| 2026-11-10 | The judge uses the same model by default, configurable via `JUDGE_MODEL` | Always a stronger model | Cost; a model may favour its own output, so a different `JUDGE_MODEL` is recommended for final numbers |
| 2026-11-10 | The verifier can only downgrade facts or remove signals | Letting it rewrite the brief | A checker that can add content can also add errors |
| 2026-11-10 | Small in-code migration adds new columns to existing databases | Asking to delete `data/radar.db` | Owners keep their history across schema changes |
| 2026-11-10 | PDF export through the browser's print dialog and print CSS | A PDF library (e.g. react-pdf, Puppeteer) | No new dependency; the browser already renders the brief well |
| 2026-11-10 | One in-process queue, 2 concurrent runs, for single and batch research | Unbounded `after()` per request; an external job queue | Bounds cost and rate limits with no new service; enough for a local tool |
| 2026-11-10 | **Verifier off by default** (`VERIFY_BRIEFS=false`) | On by default | Measured on the 10 eval briefs: +$0.065 (+39 %) and +16 s per brief, 4 of 124 claims downgraded (all blocked pages or nuances, no real error caught), judge scores unchanged. Kept as an opt-in safety net |
| 2026-11-10 | In-process scheduler for the watchlist | OS cron, a hosted scheduler | Nothing to install; a local tool only needs to refresh while it's running |
| 2026-11-10 | New signals computed at read time from `previous_id` | Storing a diff | No duplicated data; the comparison can improve without a migration |
| 2026-11-10 | **`search_context_size: "low"` by default** | `"medium"` | Same 10 companies: avg cost $0.168 → $0.138 (meets O4), median 70 s → 42 s, judge scores within noise (49/50 vs 50/50 claims supported) |
| 2026-11-10 | First custom tool: Wikidata company facts | OpenCorporates, GLEIF, scraping a registry | Free, no key, structured and citable; GLEIF has legal data only, OpenCorporates now needs a key |
| 2026-10-14 | `tsx` to run `scripts/` | `node --experimental-strip-types` | Node can't resolve the `@/` path alias; `tsx` honours tsconfig paths |
| 2026-10-14 | **Everything in English** (code, docs, UI, briefs) | Spanish | Public repo, portfolio for recruiters |
