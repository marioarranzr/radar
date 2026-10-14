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
| Web search | `web_search` (built-in) | `search_context_size: "medium"`; reasoning models can also `open_page` and `find_in_page` |
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

## 4. Own APIs (Route Handlers)

| Method | Route | Body / response | Notes |
|---|---|---|---|
| POST | `/api/research` | `{ query, context? }` → `{ id }` | Requires `Content-Type: application/json` (415); 400 validation; 429 if over the daily limit |
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
    run.ts          # runResearchAgent(id)
    prompt.ts
    schema.ts       # ReportSchema (Zod)
    steps.ts        # translates events → readable steps
  lib/
    db.ts           # node:sqlite connection + queries
    env.ts          # validates environment variables with Zod
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
| 2026-10-14 | `tsx` to run `scripts/` | `node --experimental-strip-types` | Node can't resolve the `@/` path alias; `tsx` honours tsconfig paths |
| 2026-10-14 | **Everything in English** (code, docs, UI, briefs) | Spanish | Public repo, portfolio for recruiters |
