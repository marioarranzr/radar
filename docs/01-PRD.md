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
other than the Claude API. Data lives in a local SQLite file.

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

- **Users, login and multi-user** (added once there are users other than me).
- **Deploying to the internet**: the MVP only runs locally.
- Payments, plans, teams or sharing briefs with other users.
- Batch research (CSV) or scheduled research.
- CRM integration (HubSpot, Salesforce), PDF export.
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
