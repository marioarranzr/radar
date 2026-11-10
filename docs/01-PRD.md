# 01 · PRD — Product Requirements Document

> **Project:** Radar — company research agent
> **Version:** 0.2 (local MVP, personal use) · **Date:** 2026-10-14 · **Status:** Approved

---

## 1. Summary

Radar is a web app where you type the name or URL of a company and, within 1-2 minutes,
an AI agent researches it on the internet for you and delivers a **one-page brief**: what the
company does, who it sells to, how it makes money, recent news, likely pains and opportunities,
**with sources cited**. Every brief is saved to your history.

The user **never writes a prompt**. They type a name and press a button. All the
"knowing how to ask the AI" is encapsulated in the product. That is the value of the middle layer.

**MVP = a personal tool that runs on my computer.** No users, no login, no external services
other than the OpenAI API. Data lives in a local SQLite file.

## 2. Problem

Salespeople, founders and consultants spend 20-40 minutes per company opening tabs
(company website, LinkedIn, news, Crunchbase) before a call. Using ChatGPT/Claude directly
helps, but it requires knowing how to write the prompt, the format changes every time, and nothing is saved.

## 3. Target user

- **MVP: me**, a developer learning to build agents who also prepares meetings.
- **Future:** a B2B salesperson or founder preparing meetings with companies (5-20/week).

## 4. MVP goals

| # | Goal | Success metric |
|---|---|---|
| O1 | Generate a useful brief without writing prompts | ≥ 8/10 test briefs rated "useful" by me |
| O2 | Fast | p50 ≤ 90 s per brief |
| O3 | Reliable | 100 % of briefs have ≥ 3 sources with URLs |
| O4 | Cheap | average cost ≤ $0.15 per brief (measured from `usage`) |
| O5 | Learning | Project documented and reusable as a template |

## 5. Features (exact scope)

### F1 · Access
- F1.1 The app opens at `http://localhost:3000` with no login. A single implicit user (me).

### F2 · New research
- F2.1 Text field: company name **or** URL (required, 2-200 characters).
- F2.2 Optional "Context" field: why you are researching it (e.g. "I want to sell them HR software"). Max 300 characters.
- F2.3 "Research" button that launches the agent.
- F2.4 Cost safety limit: **10 research runs per day** (configurable; a counter is shown).

### F3 · Live progress
- F3.1 While the agent works, a list of steps is shown ("Searching the web…", "Reading acme.com…").
- F3.2 The user can leave the screen; the research keeps running and appears in the history when done.
- F3.3 If it fails, a human-readable error is shown with a "Retry" button.

### F4 · Company brief (result)
Fixed sections, always in this order:
1. **Summary** (2-3 sentences)
2. **What they sell and to whom**
3. **Business model**
4. **Size and key facts** (approx. employees, HQ, founding year, funding if public)
5. **Recent signals** (max 5, dated)
6. **Likely pains / opportunities** (max 5; if Context is given, oriented to it)
7. **Questions for a first call** (3-5)
8. **Sources** (list of URLs)

- F4.1 "Copy as Markdown" button.
- F4.2 Any uncertain fact is marked "unconfirmed" instead of being made up.

### F5 · History
- F5.1 List of research runs, most recent first (name, date, status).
- F5.2 Open an old brief.
- F5.3 Delete a research run (with confirmation).

## 6. Out of scope (NOT built in the MVP)

- **Users, login and multi-user** (added once there are users other than me) _(roadmap, §9)_.
- **Deploying to the internet**: the MVP only runs locally _(roadmap, §9)_.
- Payments, plans, teams or sharing briefs with other users.
- Batch research (CSV) or scheduled research _(now on the post-MVP roadmap, §9)_.
- CRM integration (HubSpot, Salesforce). PDF export _(roadmap, §9)_.
- Native mobile app (the web app only needs to be responsive).
- Editing a brief by hand.

## 7. Assumptions and risks

| Risk | Mitigation |
|---|---|
| The agent makes up facts (hallucination) | Structured output + "no source = unconfirmed" rule + mandatory sources |
| Companies with the same name | If ambiguous, the agent picks the most likely one and says so in the Summary |
| Costs spiral | Daily limit, `max_uses` on tools, `task_budget` |
| It takes too long | Background execution + live progress |

## 8. Open questions

- Is a "Competitors" section worth adding? → Decide after testing 10 briefs.

## 9. Post-MVP roadmap

After the MVP, these features are added one at a time (phases 7-16 in the implementation plan).
Each gets its detailed specification here when its phase starts.

| # | Feature | Why |
|---|---|---|
| F6 | CI and an animated demo | Show the project working and healthy without cloning it |
| F7 | Close the evaluation (cost experiment, owner rating) | Meet O1-O4 |
| F8 | LLM-as-judge quality scores | Measure brief quality objectively, not just "it ran" |
| F9 | Verifier agent | Fewer unsupported claims; a second agent checks the first |
| F10 | Swappable model provider + comparison | Pick models on evidence (quality, time, cost) |
| F11 | Custom tools | Data sources beyond web search |
| F12 | Batch research from a CSV | Prepare many meetings at once |
| F13 | Watchlist with scheduled refresh | Know when something changes at a followed company |
| F14 | Export to Markdown and PDF | Share briefs outside Radar |
| F15 | Users and deployment | A public, signed-in version |

### F8 · LLM-as-judge quality scores (phase 9)
- A judge agent grades each evaluation brief: it checks the 5 most important claims against
  their cited sources and scores groundedness, completeness, relevance and recency from 1 to 5.
- It runs only in the evaluation tooling (`npm run agent:eval`, `npm run agent:judge`), never in the app.
- Success: every eval run reports quality scores next to time and cost, so changes to the prompt,
  model or settings can be compared on quality, not just on whether they ran.

### F9 · Verifier agent (phase 10)
- After the research, a second agent re-checks every key fact and recent signal against its cited page.
- Facts it can't confirm are marked "unconfirmed"; signals its sources contradict are removed.
  It never adds or rewrites content.
- The brief's footer says how many facts were verified and how many were downgraded.
- Success: the judge's groundedness score and share of supported claims go up compared with briefs
  produced without the verifier, at an acceptable extra cost and time.
- **Outcome (2026-11-10):** not met on the evaluation set — the briefs were already well grounded,
  so the verifier changed little for +39 % cost. It ships as an opt-in (`VERIFY_BRIEFS=true`).

### F14 · Export (phase 15)
- From a brief: "Download .md" saves a Markdown file named after the company, and "Print / PDF"
  opens the browser's print dialog with print styles, so "Save as PDF" produces a clean document.
- No new dependencies: the PDF comes from the browser, not a PDF library.

### F12 · Batch research (phase 13)
- On the home page, "Research several" accepts up to 20 companies, one per line, or a CSV whose
  first column is the company name.
- All of them are queued at once; they count against the daily limit, and a batch larger than what
  is left today is rejected with a clear message.
- Runs are processed two at a time; the history shows each one's status live.

### F13 · Watchlist (phase 14)
- "Follow" on a brief adds the company to a watchlist; "Unfollow" removes it.
- While Radar is running, each followed company is re-researched every 7 days (it's a local tool,
  so nothing runs while it's closed); "Refresh now" does it on demand.
- Each refresh is linked to the previous brief; recent signals that weren't in it get a "New" badge,
  and the brief says what it was compared with.
- The home page lists followed companies with their last refresh and how many new signals it found.
- Refreshes go through the run queue and count against the daily limit; if none are left, they wait.

