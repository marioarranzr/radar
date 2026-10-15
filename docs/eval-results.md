# Evaluation results

> Run: 2026-10-14 · Model: `gpt-6.1-sol` · `reasoning.effort: medium` · `search_context_size: medium`
> Command: `npm run agent:eval` (10 companies, no context). Costs are list-price estimates
> ($2 / $10 per 1M tokens, $10 per 1,000 searches) and ignore cached-input discounts.

| Company | Result | Time | Sources | Unconfirmed facts | Searches / pages | Tokens in / out | Cost | Useful? |
|---|---|---|---|---|---|---|---|---|
| Typeform | ✅ done | 61 s | 11 | 1 | 3 / 3 | 55k / 2k | $0.158 |  |
| Glovo | ✅ done | 75 s | 15 | 1 | 4 / 2 | 56k / 2k | $0.176 |  |
| Wallapop | ✅ done | 88 s | 11 | 0 | 5 / 4 | 68k / 3k | $0.210 |  |
| Personio | ✅ done | 60 s | 8 | 0 | 2 / 2 | 43k / 2k | $0.122 |  |
| Mercadona | ✅ done | 70 s | 10 | 0 | 4 / 1 | 39k / 2k | $0.141 |  |
| Seedtag | ✅ done | 64 s | 12 | 1 | 3 / 2 | 51k / 2k | $0.153 |  |
| Clarity AI | ✅ done | 70 s | 9 | 1 | 4 / 2 | 58k / 2k | $0.176 |  |
| TravelPerk | ✅ done | 61 s | 10 | 0 | 2 / 3 | 55k / 2k | $0.152 |  |
| Idealista | ✅ done | 96 s | 13 | 0 | 5 / 3 | 63k / 3k | $0.203 |  |
| Notion | ✅ done | 81 s | 12 | 0 | 4 / 3 | 65k / 2k | $0.192 |  |

## Against the PRD goals

| Goal | Target | Result | Status |
|---|---|---|---|
| O1 Useful briefs | ≥ 8/10 rated useful | Automated quality checks pass 10/10 (below); the owner's usefulness rating is pending | ⏳ |
| O2 Fast | p50 ≤ 90 s | p50 **70 s** (max 96 s) | ✅ |
| O3 Reliable | 100 % with ≥ 3 sources | **10/10**, 8–15 sources each | ✅ |
| O4 Cheap | avg ≤ $0.15 | avg **$0.168** (upper bound) | ⚠️ 12 % over |

## Automated quality checks

Checked on 2026-10-15 against the stored briefs (no model involved):

| Check | Result |
|---|---|
| All sections present (3–5 questions, ≤ 5 signals, key facts, pains) | 10/10 briefs |
| Recent signals dated within the last 12 months | 50/50 signals |
| Cited URLs that return 404/410 (likely invented) | **0 of 117** |
| Cited URLs that load (2xx/3xx) | 89 of 117 |
| Cited URLs not verifiable automatically (bot protection or timeout, e.g. all Personio pages) | 28 of 117 |

## Observations

- 10/10 runs produced a valid brief on the first request: no reminders, no validation retries,
  no leftover citation markers, no duplicate sources.
- It handles ambiguity and change as instructed: "Notion" is flagged as an assumed match, and
  TravelPerk's 2025 rebrand to Perk is picked up.
- Cost is dominated by input tokens (~40–68k per run): web content read during search. Output is
  ~2–3k tokens.

## Next tuning experiments (for O4)

1. `search_context_size: "low"` — less retrieved content per search, the main cost driver.
2. `reasoning.effort: "low"` — fewer, more consolidated tool calls.
3. Measure the real bill (cached input is cheaper than this estimate) before changing anything.

Each experiment: rerun `npm run agent:eval`, compare cost and the owner's usefulness rating.
