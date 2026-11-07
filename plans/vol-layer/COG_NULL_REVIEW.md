# C.OG null review: did we test what he describes?

2026-11-07. Read-only audit. Ratings judge the match between his words and our test, not whether he is right.
Quotes are his unless marked. Sources: `cog-snippets.md` = S§, `education/cog_inbox/2026-09-28-market-movers-vol-forecaster-as-a-layer.md` = MM, `education/FORECASTER_WALKTHROUGH_NOTES.md` = FW.

**Pattern.** His lessons say direction is near a coin flip, so our direction nulls mostly agree with him. Three gaps recur: we score alone what he calls a layer; we score tight geometry where spread decides; we score a sign where he asks for a threshold per horizon.

## Rows

| # | Area and his words | Our test | Mismatch | Rating | Retest |
|---|---|---|---|---|---|
| 1 | Vol state at positions: "single layer in a multi layer system" (MM) | `vol-layer-reaction`: touch reject or break, K 0.25σ, 70,965 touches, 2021-26, net of spread | His example short runs about 2.7% (4,257 to 4,142). One spread is 0.17K here. Follow is +0.058K gross, 5/5 folds, −0.113K net | **LIKELY MISTESTED**: geometry decided it | State-selected follow; K 0.5-1.5σ, low spread/σ; net R distribution vs shuffled state |
| 2 | Fade: "touch + rejection + close" (FW Part 11) | `cog-setups-direction` A: OC p50 limit, no rejection. `level-touch`, `live-range-book`. Three-fade study (no ledger id): 15-min proxy, nearest target | No test has all three: re-anchored level, 3-5m close, far target. Every partial form failed | **PARTLY**: recipe never whole | Re-anchored level; 5m close back, budget ≥80%; R distribution vs shifted levels |
| 3 | Budget: ">80% consumed" means fade (FW Part 5) | `exhaustion-schedule` (degenerate, fade not run), `live-range-clock`, `live-range-book` used × pace | Small. Range used adds 1-1.5% beyond the clock. 0 of 68 cells held | **TEST LOOKS FAIR**: many cells, net | None alone; use as a condition in 2 |
| 4 | Meta-labelling: "Have you ever looked into meta labelling?" (MM) | `meta-label-trust-lines`, `-persist`: will p75 pass. `meta-label-yield-spread`, `-proper`, `-long`: yield-spread primary | He labels the forecaster system's trades. Ours labelled line passes and a book whose record was lookahead (`yield-spread-sleeve`). Touch version (3b) stopped before results. "Closed" holds for this book only | **LIKELY MISTESTED**: wrong primary | Vol state; Rule A trades; precision and R by size vs flat. Caveat: `rule-a-pre2020` is null |
| 5 | "splitting correlation from variance" (MM) | No ledger id. Dollar share inside `vol-layer-reaction` only. L3 is a spec | Effectively untested | **LIKELY MISTESTED**: no real test | Common-factor share of variance; high vs low; pair range, stop-through beyond σ |
| 6 | "jump intensity and jump diffusion" (MM) | `jump-diffusion`, `jump-structure`, `jump-p90-event-term`, `jump-next-day-miss`: jump days, next-day range, 34 instruments | He names intensity as a state beside stops. We scored flags against range. Old detector forward-fills. `jump-diffusion` gives no numbers | **PARTLY**: range side sound, stops open | `jump-after-stop-through` (preregistered, not banked): intensity; P(5-min move > dσ) beyond σ, calendar |
| 7 | "Position sizing, regime states" (MM); "theoretical ceiling" (S§9) | `iv-sizing-filter`, `iv-regime-fade-follow`: motif, Vote. `vol-managed-mm`, `stress-filter-hold-beyond-vt`: NQ hold | Primaries were Vote Atlas (dead), motif (PF ~1.20 honest) or buy-and-hold. We read Sharpe; he stresses max DD. No ceiling test found. `vol-target` passes | **PARTLY**: weak primaries | Size vs shrunk Kelly; Rule A by vol state; max DD and growth paths vs 1R |
| 8 | "noise threshold for each horizon type… 6 or 12 months" (S§1) | `line-touch-limit-unseen` arm J: −0.066R, session horizon only. `residual-pca-stops`: exploratory, no ledger id | No grid run. The repo reads it two ways: stop distance (S§1) or size of a change (`cog-question-style.md`) | **LIKELY MISTESTED**: never built | Change in net liquidity or 2y over 2w-12m; above placebo size; NQ return distribution per horizon |
| 9 | Net liquidity: "rising, risk assets have a tailwind" (prereg quote) | `net-liquidity-tailwind-spx`, `-nq`: 4-week sign, next 4 weeks, Fridays 2011-26, MDE 2.0-2.4pp. G1: no ledger id, 20-day sign, 1/5/20d | Fair to that sentence. No size threshold; G1's sign flips about weekly. Fed only; owner recalls "different countries". 13-week +2.0pp unscored | **PARTLY**: sign tested, size not | Fed+ECB+BoJ 13-week change; above threshold; NQ 13-week distribution. About 60 windows |
| 10 | "Magnetism" to high-OI strikes (OI course notes) | G3: no ledger id. `oi-max-pain`, `wall-placebo` (basis fixed), `expiry-pull-side`, `swing-walk-gamma-strike` | Small. G3 as a direction gate is our build | **TEST LOOKS FAIR**: placebos, audited | None soon |
| 11 | "forecasting pinning vs acceleration… open interest" (S§7) | `gex-range`, `gex-range-iv`, `gex-split-book`, `zero-gamma-distance`, `hedge-flow`, `gamma-regime-trades`: next-session range, p75 trades | He asks about intraday. Book is CME monthly/quarterly, ~5% of Nasdaq gamma. Range effect exists; IV absorbs 64-73%. He only says "begin" | **PARTLY**: thin book, wrong clock | Full Cboe gamma, ~400 days; after p50 touch; P(reach p75) beyond IV |
| 12 | Blue line: "plenty of time to react" (video notes) | `cog-exact-pair-lead`, `cog-video-claims`, `cog-trend-state`, `cog-pinned-history`, `cog-matched-pairs`, `cog-turn-sequence-model`, `stir-composite-nq`, `spread-episodes-nq`: 15 min-48 h, 504 unseen days, his 45-min confirm | Small. Python settings unknown; his Pine defaults to daily. He called it "only step one". Divergence (`stir-composite-nq` A) was underpowered, then null at MDE 0.049 | **TEST LOOKS FAIR**: his events, confirmed unseen | Daily line; 2w-3m; part of 8 |
| 13 | "staying up to date with the yield spreads?" (inbox, 2026-11-03) | `cog-spread-direction`: 192 daily US choices at his line. `dip-with-bias`, `policy-direction-at-lines`, `yield-spread-sleeve` | No quote says spreads pick the side at a line; that is ours. Fixed brackets, though "every single position is different". Non-US daily untested | **PARTLY**: fair to our guess | Daily 2y z ≥2; PIT all legs; hold to reversion; trade distribution, forward |
| 14 | Residuals: "lean against the displacement" (notes, slide 31) | `residual-pca-wide10`, `-idx6`, `-news`, `-monthend`, `-cot`: exact loop, next-day IC, net | Exact. Chris's threshold version is exploratory only: FX8 net Sharpe +0.43/+0.38 | **TEST LOOKS FAIR**: reproduces q1 | Frozen FX8 \|z\| ≥1.5 book, forward |
| 15 | "whether it survives costs" (Overnight task) | `overnight-hold-nq`, `-gold`, `-toolkit`: his times, real bid/ask, financing | None. His prediction roughly held | **TEST LOOKS FAIR**: his spec | None; more sample |
| 16 | "when that ratio is at an extreme" (S§3) | `vvix-ratio-direction`, `vix-beta-level`, `short-vx-rule`: daily 2009-26 | "Per unit time" unresolved. Direction floor ~0.6 SD. Vol side validated | **TEST LOOKS FAIR**: limit is power | Forward record |
| 17 | "SR3 is right, NQ is asleep" (Issue 07) | `rates-vol-gap-state`, `-move`: MOVE ≥70th pct of year, VXN ≤40th, next 5 sessions | He read 2y CVOL plus SR3 skew near 90th pct, NQ ATM ~30th of its month. Repo CVOL has FX and gold only | **LIKELY MISTESTED**: different variable | 2y CVOL, SR3 skew minus NQ pct; top decile; NQ 5-day realised over implied. Needs data |
| 18 | "exhaustion zones", alignment zones (range-extension notes) | `range-edge-limit-fade`: A_0/A_1 edges. `range-ladder-placebo-confirm`. `vol-asia-fib-confluence`: vol line + rung | Fade scored at edges, not far multiples. Today/yesterday alignment not found. Extension lines +0.26pp argues against | **PARTLY**: his zone unscored | Alignment at ≥3x; within 2 pips; race vs shifted ladder |
| 19 | Basis "20-30bps in a day" (prereg quote) | `basis-stress-usd`: all-day correlation, 5-day USD | Literal threshold met 5 days. Data cannot do better | **TEST LOOKS FAIR**: untestable literally | None |

**Counts:** LIKELY MISTESTED 5, PARTLY 7, TEST LOOKS FAIR 7.

**Excluded.** `failed-auction-volume`: the author is cut off in the screenshot, yet `verdicts.md` files it under COG. `daily-open-fib-retest`: not C.OG. QMR and Vote Atlas: ours.

**Not found (no test).** Basket of equities (S§6). Black-Litterman: literature spec only. Theoretical ceiling as a test: a sizing note only.

## Top 10 retests by value

| Rank | Row | Why |
|---|---|---|
| 1 | 4 | The layer he names, never tried on a forecaster book |
| 2 | 1 | Live gross signal; our geometry killed it |
| 3 | 8 | His method; also settles rows 9 and 12 |
| 4 | 5 | His own example of a layer; untested |
| 5 | 6 | Preregistered; cheap; stops were Jordan's question |
| 6 | 7 | Sizing can cut DD without a new signal |
| 7 | 2 | Closes the fade question, likely null |
| 8 | 11 | Mechanism real; book thin; wait for data |
| 9 | 17 | Clean mismatch; needs rates vol history |
| 10 | 18 | Cheap; likely null |

Risk on ranks 1, 6: Rule A failed 2016-20, so meta-labelling may have nothing to label.

## Where his claim is only his statement

| Claim | Evidence held |
|---|---|
| Sharpe 2.32, 324 trades | His tearsheet. No trade list held |
| "live and has either meet or exceeded expectations" | Pin only |
| Seven layers | Two named; "the rest are proprietary" |
| Stops come from the layers | His statement. He offered: "You could have the historical csv". Not found in the repo. **Worth asking: it would test more than any row** |
| Forecaster beats GARCH, Parkinson, others | Stated; `forecast-pick` tests ours, not his |
| Fade setup | Four video cases |
| Blue line lead | Two days; he calls it a hypothesis |
| "SR3 is right" | One day, his 45% scenario |
| Lessons 03, residuals | Simulated data, by their own labels |
| March 2020 liquidity | One episode |
| G1 inputs | Owner's paraphrase; "explicitly not observed" what the gates compute |

His silence is also a limit. We cannot prove a mismatch where he has not said what he does; rows 1, 4 and 7 rest on what he names, not on a known recipe.
