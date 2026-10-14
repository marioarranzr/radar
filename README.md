# Radar — company research agent

A learning project in agent automation **and** a documentation template for future
AI-built projects.

Type a company name and a Claude agent researches it on the web and hands you a one-page
brief with cited sources. Runs locally: Next.js + SQLite (`node:sqlite`) + Claude API.

> Status: documentation complete, implementation in progress (see the [plan](docs/06-IMPLEMENTATION-PLAN.md)).

## How it is organized

| Doc | Answers | The agent reads it to… |
|---|---|---|
| [CLAUDE.md](CLAUDE.md) | How should AI work here? | Rules, reading order, ECC commands |
| [01-PRD](docs/01-PRD.md) | What and why? | Know the exact scope and what is NOT included |
| [02-TRD](docs/02-TRD.md) | With what? | Stack, APIs and closed decisions |
| [03-APP-FLOW](docs/03-APP-FLOW.md) | How is it navigated? | What each button does and where it leads |
| [04-DESIGN-BRIEF](docs/04-DESIGN-BRIEF.md) | How does it look? | Colors, typography, components, screens |
| [05-BACKEND-SCHEMA](docs/05-BACKEND-SCHEMA.md) | Where does data live? | SQLite tables, columns, relationships |
| [06-IMPLEMENTATION-PLAN](docs/06-IMPLEMENTATION-PLAN.md) | In what order? | Steps with a "done" criterion |

## Using it as a template for another project

1. Copy `CLAUDE.md` and `docs/`.
2. Rewrite the docs **in order** (01 → 06): each one depends on the previous ones.
3. Keep the headings; change the content. The "Element / Action / What happens / Next" tables in
   the flow and the "Done:" lines in the plan are what most prevent the AI from improvising.
4. Before writing code, ask Claude to check consistency:
   *"Read docs/ and list contradictions or gaps between the PRD, TRD, flow, design and schema."*
