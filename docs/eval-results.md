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
| O2 Fast | p50 ≤ 90 s | p50 **42 s** with the default `low` search context (70 s with `medium`) | ✅ |
| O3 Reliable | 100 % with ≥ 3 sources | **10/10**, 8–15 sources each | ✅ |
| O4 Cheap | avg ≤ $0.15 | avg **$0.138** with the default `low` search context ($0.168 with `medium`) | ✅ |

## Automated quality checks

Checked on 2026-10-15 against the stored briefs (no model involved):

| Check | Result |
|---|---|
| All sections present (3–5 questions, ≤ 5 signals, key facts, pains) | 10/10 briefs |
| Recent signals dated within the last 12 months | 50/50 signals |
| Cited URLs that return 404/410 (likely invented) | **0 of 117** |
| Cited URLs that load (2xx/3xx) | 89 of 117 |
| Cited URLs not verifiable automatically (bot protection or timeout, e.g. all Personio pages) | 28 of 117 |

## LLM judge scores

Run on 2026-11-10 with `npm run agent:judge` (judge: `gpt-6.1-sol`, TRD §3.8) on the same ten
briefs. The judge opened the cited pages for the 5 most important claims of each brief.

| Company | Grounded | Complete | Relevant | Recent | Claims supported |
|---|---|---|---|---|---|
| Typeform | 5 | 4 | 4 | 5 | 5/5 |
| Glovo | 5 | 4 | 4 | 4 | 5/5 |
| Wallapop | 4 | 5 | 5 | 5 | 5/5 |
| Personio | 5 | 4 | 4 | 5 | 5/5 |
| Mercadona | 5 | 4 | 4 | 5 | 5/5 |
| Seedtag | 5 | 5 | 4 | 5 | 5/5 |
| Clarity AI | 5 | 4 | 4 | 4 | 5/5 |
| TravelPerk | 5 | 5 | 4 | 4 | 5/5 |
| Idealista | 5 | 5 | 4 | 4 | 5/5 |
| Notion | 5 | 4 | 4 | 4 | 5/5 |
| **Average** | **4.9** | **4.4** | **4.1** | **4.5** | **50/50 (100 %)** |

Judge cost: ~$0.61 for the ten. **Caveat:** the judge is the same model that wrote the briefs, and
models tend to rate their own output favourably; treat these as an upper bound and set a different
`JUDGE_MODEL` for definitive numbers. Relevance is the lowest score: the briefs are accurate, and
the next gains are in making pains and questions more specific to a sales conversation.

## Cost experiment: search context size (phase 8)

Run on 2026-11-10 with `SEARCH_CONTEXT_SIZE=low VERIFY_BRIEFS=false npm run agent:eval` and compared
with the original run (`medium`, researched 2026-10-14, judged 2026-11-10). Typeform first failed on
a bug the experiment exposed (a web search item without an `action`, now fixed) and was rerun.

| | `medium` | `low` | Change |
|---|---|---|---|
| Valid briefs | 10/10 | 10/10 | = |
| Median time | 70 s | **42 s** | −40 % |
| Avg research cost | $0.168 | **$0.138** | −18 % |
| Grounded / complete | 4.9 / 4.4 | 4.6 / 4.6 | ≈ |
| Relevant / recent | 4.1 / 4.5 | 4.2 / 4.8 | ≈ |
| Claims supported | 50/50 | 49/50 | ≈ |

**Decision:** `low` is now the default. It meets O4 and is much faster; quality moves within the
judge's noise.

## Model comparison (phase 11)

Run on 2026-11-10 with `OPENAI_MODEL=<model> JUDGE_MODEL=gpt-6.1-sol npm run agent:eval`, default
`low` search context, no verifier. The judge is Sol for every model, so scores are comparable. Astra
ran on 3 of the companies (Typeform, Mercadona, Notion) to bound cost.

| Model | Briefs | Avg cost | Median time | Grounded | Complete | Relevant | Recent | Claims supported |
|---|---|---|---|---|---|---|---|---|
| `gpt-6-luna` | 10 | **$0.038** | 39 s | 4.4 | 4.0 | **3.4** | 4.5 | **90 %** |
| `gpt-6.1-sol` | 10 | $0.138 | 42 s | 4.6 | 4.6 | 4.2 | 4.8 | 98 % |
| `gpt-6-astra` | 3 | $0.663 | 51 s | 5.0 | 5.0 | 4.0 | 5.0 | 100 % |

Luna's cost is mostly the per-search fee; it also cites fewer sources (5–9 vs 7–13).

**Decision:** Sol stays the default. Luna is 3.6× cheaper but drops on relevance and leaves 1 in 10
checked claims unsupported; Astra is 5× the cost for a small gain. Next experiment: Luna with the
verifier on, the case where a second agent is most likely to pay for itself.

## Verifier agent

Run on 2026-11-10 with `npm run agent:verify-eval`: the verifier (TRD §3.9) re-checked the same ten
stored briefs, so the research itself stayed fixed and only the verifier's effect was measured.

| Metric | Result |
|---|---|
| Claims checked | 124 (12–13 per brief) |
| Confirmed facts downgraded | 4 (3 %): two blocked or JS-only pages, one "latest round" that a page can't prove is still the latest, one employee count with a different source date |
| Recent signals removed | 0 |
| Out-of-range indexes returned (ignored by design) | 2 |
| Judge groundedness of the 4 changed briefs | 5, 4, 5, 5 — unchanged |
| Extra time / cost per brief | +16 s / +$0.065 (+39 % on the research cost) |

**Decision:** the verifier ships **off by default** (`VERIFY_BRIEFS=false`). On this set the briefs
were already well grounded, so a second agent added cost and latency without catching a real error.
It stays available as an opt-in safety net — for example with a cheaper researcher model, where
the trade-off may flip.

## Observations

- 10/10 runs produced a valid brief on the first request: no reminders, no validation retries,
  no leftover citation markers, no duplicate sources.
- It handles ambiguity and change as instructed: "Notion" is flagged as an assumed match, and
  TravelPerk's 2025 rebrand to Perk is picked up.
- Cost is dominated by input tokens (~40–68k per run): web content read during search. Output is
  ~2–3k tokens.

## Next tuning experiments

1. ~~`search_context_size: "low"`~~ — done, now the default (above).
2. `reasoning.effort: "low"` — fewer, more consolidated tool calls.
3. Measure the real bill (cached input is cheaper than this estimate) before changing anything.

Each experiment: rerun `npm run agent:eval`, compare cost and the owner's usefulness rating.
