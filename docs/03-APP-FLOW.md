# 03 · App Flow

> Which screens exist, how you get to each one and **exactly what happens when each button is pressed**.

---

## 1. Screen map

No login: the app opens directly at `/` (http://localhost:3000).

```
                  ┌──────────────────────────┐        ┌───────────────────────────┐
  localhost:3000─▶│  /  (Home)               │───────▶│ /research/[id]            │
                  │  · New research          │◀───────│ · state: progress         │
                  │  · History               │        │ · state: brief            │
                  └──────────────────────────┘        │ · state: error            │
                                                      └───────────────────────────┘
```

## 2. Product phases

1. **Request** → type the company (+ context) and launch.
2. **Active wait** → watch the agent's progress.
3. **Consumption** → read/copy the brief.
4. **Return** → go back to the history and repeat.

## 3. Screens and actions

### P1 · `/` Home
**Header:** "Radar" logo (no user menu).

**Block A — New research**
| Element | Action | What happens | Next |
|---|---|---|---|
| "Company or URL" field | Types | Character counter; Enter = press Research | — |
| "Context (optional)" field | Types | Counter 0/300 | — |
| "N of 10 left today" text | — | Computed on the server | — |
| **"Research"** button | Presses | 1) Client validation (Zod). 2) `POST /api/research`. 3) Button in loading state. | **200** → `/research/[id]` · **429** → notice "You've reached today's limit" and button disabled · **4xx/5xx** → error toast, text is kept |

**Block B — History**
| Element | Action | What happens | Next |
|---|---|---|---|
| Row (name, relative date, status chip) | Click | — | `/research/[id]` |
| Trash icon on row | Click | Dialog "Delete the research on X?" | — |
| Dialog → **"Delete"** | Presses | `DELETE /api/research/[id]`, row disappears (optimistic; if it fails, it comes back with a toast) | `/` |
| Dialog → **"Cancel"** / Esc | Presses | Closes dialog | `/` |
| Empty state | — | "You haven't researched any company yet" | — |

Status chips: `Queued` · `Researching` (animated) · `Ready` · `Error`.

### P2 · `/research/[id]`
A single route with **3 states** depending on `research.status`. While the status is `queued` or `running`,
the page calls `GET /api/research/[id]` **every 2 s** (polling) and stops once it reaches `done`/`failed`.

**State 2a — Progress** (`queued` | `running`)
| Element | Behavior |
|---|---|
| Title "Researching {query}" | Fixed |
| Step list | Each new `research_step` appears at the bottom with an animation; the last one has a spinner |
| Timer | Elapsed seconds |
| **"Back to home"** button | Navigates to `/`. The research **keeps running** in the background |

Automatic transition → 2b when `status='done'`, → 2c when `status='failed'`.

**State 2b — Brief** (`done`)
| Element | Action | What happens |
|---|---|---|
| Brief with the 8 PRD sections (F4) | — | Facts with `confirmed:false` carry an "unconfirmed" label |
| Links in Sources and Signals | Click | Open in a new tab (`rel="noopener"`) |
| **"Copy Markdown"** button | Presses | Copies to clipboard; "Copied" toast |
| **"New research"** button | Presses | `/` with focus on the Company field |
| Footer: "Generated in 74 s · 3 searches · 5 pages read" | — | Transparency info |

**State 2c — Error** (`failed`)
| Element | Action | What happens | Next |
|---|---|---|---|
| Readable message (`research.error`) | — | — | — |
| **"Retry"** button | Presses | `POST /api/research/[id]/retry` | Same `id`, state 2a |
| **"Back"** button | Presses | — | `/` |

**Edge cases:** non-existent `id` → 404 page "We couldn't find this research".

## 4. Happy path (user journey)

1. I start the app (`npm run dev`) and open `localhost:3000` → `/` with an empty history.
2. I type "Factorial HR" + context "I want to sell them sales training" → **Research**.
3. `/research/abc`: I see "Searching: Factorial HR…", "Reading: factorialhr.com…" (≈70 s).
4. The brief appears → **Copy Markdown** → I paste it into my meeting notes.
5. **New research** → back to `/`, now with 1 item in the history.

## 5. Research state diagram

```
queued ──▶ running ──▶ done
              │
              └──────▶ failed ──(Retry)──▶ queued
```
