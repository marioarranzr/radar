# 02 · TRD — Technical Requirements Document

> **Closed** decisions. The implementing agent must not choose alternatives without
> going through the "Decision log" first (section 9).
> **MVP principle:** zero external services other than the Claude API, and the fewest possible npm dependencies.

---

## 1. Stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| Runtime | Node.js | 24.x (already installed) | Ships with built-in SQLite |
| Language | TypeScript (strict) | 5.x | Shared types front/back, better guidance for the AI |
| Web framework | Next.js (App Router) | 15.x | Front end + API in a single project |
| Styling | Tailwind CSS | 4.x | No component library: the (few) components are hand-written |
| Database | **SQLite via `node:sqlite`** (Node built-in module) | — | A local file, nothing to install, no server |
| LLM | Claude API via `@anthropic-ai/sdk` | latest | Official SDK |
| Validation | Zod | 3.x | Validates inputs and the agent's output |
| Tests | Vitest + Testing Library | — | Fast, standard |
| Package manager | npm | Node's | Already installed |
| Runtime environment | Local: `npm run dev` | — | No hosting in the MVP |

### Allowed dependencies (closed list)
- **Runtime:** `next`, `react`, `react-dom`, `@anthropic-ai/sdk`, `zod`
- **Development:** `typescript`, `@types/*`, `tailwindcss` (+ its PostCSS plugin), `eslint` (+ Next config), `vitest`, `@testing-library/react`, `@testing-library/dom`, `jsdom`
- Anything else → goes through the Decision log.

## 2. Architecture

```
Browser ──(1) POST /api/research──▶ Next.js Route Handler (on my machine)
    │                                    │ validates (Zod), checks the daily limit,
    │                                    │ INSERT research(status='queued') into SQLite
    │                                    │ responds { id } immediately
    │                                    ▼
    │                         after(): runResearchAgent(id)   ← runs after responding
    │                                    │ agent loop with Claude
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
**Claude API + server tools** (web search and web fetch are executed by Anthropic).
We don't need our own client-side tool loop in the MVP, except for the final
`submit_report` tool used to get the structured brief.

### 3.2 Request configuration

| Parameter | Value |
|---|---|
| `model` | `claude-opus-5-5` (configurable via `ANTHROPIC_MODEL`) |
| `thinking` | `{ type: "adaptive" }` |
| `output_config.effort` | `"medium"` (raise to `high` if quality doesn't reach O1) |
| `max_tokens` | 64000 (streaming: `client.messages.stream(...).finalMessage()`) |
| Fallback on `refusal` | `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"` |
| Budget | `output_config.task_budget = { type: "tokens", total: 60000 }` (beta `task-budgets-2026-03-13`) |

### 3.3 Tools

| Tool | Type | Config |
|---|---|---|
| Web search | `web_search_20260209` (server) | `max_uses: 6` |
| Web fetch | `web_fetch_20260209` (server) | `max_uses: 8`, `max_content_tokens: 8000` |
| `submit_report` | Client, `strict: true` | `input_schema` = `ReportSchema` (section 3.5) |

- `tool_choice: { type: "auto" }` (forced tool choice returns a 400 on this model). The system prompt
  states that it **must** finish by calling `submit_report`.
- If the turn ends with `stop_reason: "pause_turn"`, the conversation is resent so it can continue.
- If it ends without calling `submit_report`, it is resent once with a reminder message; if it fails
  again → `status='failed'`.

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
The `submit_report` input is validated again with Zod on the server before saving it.

### 3.6 Progress
Each `server_tool_use` block that appears in the streamed response is translated into a readable step
("Searching: “acme pricing”", "Reading: acme.com/about") and inserted into `research_steps`.

## 4. Own APIs (Route Handlers)

| Method | Route | Body / response | Notes |
|---|---|---|---|
| POST | `/api/research` | `{ query, context? }` → `{ id }` | 400 validation; 429 if over the daily limit |
| GET | `/api/research/[id]` | → `{ research, steps }` | Used by polling; 404 if not found |
| POST | `/api/research/[id]/retry` | → `{ id }` | Only if `status='failed'` |
| DELETE | `/api/research/[id]` | → `204` | |

The history and the brief are read directly from SQLite in Server Components (`src/lib/db.ts`).

## 5. Environment variables (`.env.local`)

```
ANTHROPIC_API_KEY=             # required, server only
ANTHROPIC_MODEL=claude-opus-5-5
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
  interpolated into the system prompt. The server only listens on `localhost`.
- **Cost:** record `usage` (input/output tokens) in `research` to compute O4.
- **Errors:** catch by type (`RateLimitError`, `APIStatusError`, `APIConnectionError`)
  and store a readable message in `research.error`.
- **Accessibility:** WCAG AA contrast and keyboard navigation.
- **Clean start:** if `data/radar.db` doesn't exist, it is created from `db/schema.sql` on first access.
- **Language:** all code, UI copy and generated briefs are in English.

## 8. Testing

- Unit: `schema.ts`, `steps.ts`, `db.ts` (with an `:memory:` database), route validation, daily limit.
- Agent: test with **recorded** Claude responses (fixtures), without calling the real API.
- Manual evaluation: 10 well-known companies, rated useful / not useful (O1).
- E2E with Playwright: **out of the MVP** (it would be one more dependency).

## 9. Decision log (lightweight ADR)

| Date | Decision | Rejected alternatives | Reason |
|---|---|---|---|
| 2026-10-14 | Anthropic server-side web tools | Tavily/SerpAPI + custom scraping | Less code, fewer keys |
| 2026-10-14 | `after()` instead of a queue | Inngest, Managed Agents | Enough for the MVP |
| 2026-10-14 | Output via a `submit_report` tool with `strict` | Parsing Markdown | Guaranteed structure |
| 2026-10-14 | **No users or login; local personal use** | Supabase Auth | The MVP is just for me; fewer moving parts |
| 2026-10-14 | **SQLite via `node:sqlite`** | Supabase/Postgres, `better-sqlite3`, Prisma | Zero services and zero extra dependencies |
| 2026-10-14 | **Polling every 2 s** for progress | Supabase Realtime, SSE, websockets | The simplest thing that works |
| 2026-10-14 | **No component library** (hand-written Tailwind) | shadcn/ui | Fewer dependencies; only a few components |
| 2026-10-14 | npm | pnpm | Ships with Node |
| 2026-10-14 | Add `@testing-library/dom` | — | Required peer dependency of `@testing-library/react` |
| 2026-10-14 | **Everything in English** (code, docs, UI, briefs) | Spanish | Public repo, portfolio for recruiters |
