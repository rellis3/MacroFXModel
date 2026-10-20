# Research register

Every study, test or exploratory analysis has one row here, from the moment it's claimed until it's banked or dropped.
This file is how parallel sessions see each other's work. Protocol: `.claude/skills/research-protocol/SKILL.md`; row
format and statuses: its `references/register.md`. See what is in flight on other branches, including rows not yet
merged here, with:

```bash
node .claude/skills/research-protocol/scripts/research_status.mjs
```

Rules: claim a row before writing a prereg, and push it. Edit only your own rows. On a merge conflict, keep both
sides' rows. Move finished rows to Done; never delete them.

Seeded 2026-10-18 from the first status report. Rows below are the studies that were found registered or run but not
banked, plus one re-run that a data fault requires. The other preregs with no banked verdict are listed by the status
script (§4) until someone claims, banks or parks each one.

## Active

| ID | Question | Status | Branch | Updated | Prereg | Results | Ledger | Next |
|---|---|---|---|---|---|---|---|---|
| hedging-state-forward | On the full Cboe book, does the dealer-hedging state at the open tell us how the day behaves (range, breaks)? | REGISTERED | main | 2026-10-19 | `forge/HEDGING_STATE_FORWARD_PREREG.md` | — | — | forward record logs daily from 2026-10-20 (job `hedgingForward`); judge at ≥ 250 sessions per market (~2027-10) |
| range-book-family | 33 EURUSD/cross-pair range-book studies (fades, breaks, exits, IV/RV, COT, confluence…) | RESULTS | fade-continue-book | 2026-10-03 | `forge/RANGE_BOOK_EURUSD_PREREG.md` + 32 more on that branch | `analysis/output/rangebook/*_RESULTS.md` (35) | — | needs owner: the branch was never merged, so main can't see these results. Merge or close it, then bank each study |
| positioning-into-release | Does positioning into a release change the move after it? | REGISTERED | main | 2026-10-17 | `MD files/POSITIONING_INTO_RELEASE_PREREG.md` | — | — | run it, or mark PARKED with the reason |
| macro-confluence-rerun | Do the macro-confluence verdicts survive the net-liquidity unit fix? | RE-RUN | main | 2026-10-18 | (original preregs) | — | macro-confluence-direction, macro-confluence-baa-credit, macro-confluence-range | re-run with `js/netLiquidity.js` (DATA_SPEC §5 #8); update the three entries in place |
| ripple-book | Does the all-expiry OI book read NQ range better than the day book, and do its walls hold? | RESULTS | main | 2026-10-18 | `oi_research_book/RIPPLE_BOOK_PREREG.md` | `oi_research_book/RIPPLE_BOOK_RESULTS.md` | — | bank per scored question: main test UNDERPOWERED (written as UNJUDGEABLE; 94 days vs 400 gate), wall test checked separately |
| gex-ladder-confluence | Do GEX walls that coincide with ladder lines react differently? | RESULTS | main | 2026-10-18 | `oi_research_book/GEX_LADDER_CONFLUENCE_PREREG.md` | `oi_research_book/GEX_LADDER_CONFLUENCE_RESULTS.md` | — | bank as UNDERPOWERED (308 < 400 registered minimum) |
| futures-cost-rescore | Do line-touch results survive futures costs? | RESULTS | main | 2026-10-18 | `forge/FUTURES_COST_RESCORE_PREREG.md` | in the prereg (Results record 2026-10-11) | — | bank |
| harness-weekend-rows | Do the harness results with pre-2014 FX windows change once the store's weekend rows are dropped? | RE-RUN | main | 2026-10-19 | (original preregs) | — | ys-long-confirm, cot-positioning-factor | fix `px_d1_*` weekend rows in build_features.py (DATA_SPEC §5 #9), then re-run `analysis/harness/repro_ys.mjs SAMPLE=long` and `repro_cot.mjs`; expected scale-only changes (COT OOS starts 2018, unaffected) |
| ai-crack-metals | After the AI trade cracks (SMH/SPY 20-session change in its rolling bottom decile), do gold and silver outperform their ordinary 20-session drift? | BANKED | main | 2026-10-19 | `forge/AI_CRACK_METALS_PREREG.md` | `analysis/output/ai-crack-metals/RESULTS.md` | ai-crack-metals (null), ai-crack-metals-silver (null) | both cells null as registered (61 setups; intervals exclude the pass bars); descriptive converse (gold lags 60s after an AI RIP, −3.5 [−5.9, −1.1]) is a candidate for its own prereg on the lockbox tail |
| range-ladder-placebo-confirm | On 15 instruments the first test never loaded, do the Asia/Monday range EDGES revert more than a shifted ladder? | RUNNING | main | 2026-10-20 | `forge/RANGE_LADDER_PLACEBO_CONFIRM_PREREG.md` | — | — | build scripts/range-ladder-placebo-confirm/ (copy of the original run.mjs, K=8, edge lines only) and run |
| range-edge-limit-fade | Does fading the Asia range edges with resting limit orders, filled and exited on real bid/ask M1, make money net? | RUNNING | main | 2026-10-20 | `forge/RANGE_EDGE_LIMIT_FADE_PREREG.md` | — | — | build scripts/range-edge-limit-fade/ (bid/ask read by column name) and run T1/T2 + placebo control |

## Done

| ID | Question | Status | Branch | Updated | Prereg | Results | Ledger | Next |
|---|---|---|---|---|---|---|---|---|
| range-ladder-placebo | Do the Asia/Monday range-ladder lines (the range-line book's levels) revert or continue differently from the same ladder shifted to the wrong price? | BANKED | main | 2026-10-19 | `forge/RANGE_LADDER_PLACEBO_PREREG.md` | `analysis/output/range-ladder-placebo/RESULTS.md` | range-ladder-placebo (underpowered) | placebo control failed (−0.09 pp); real +0.91 pp under the 2-pp bar, edges A_0/A_1 ~+3 pp; confirm on forward sessions as `range-ladder-placebo-confirm` |
| portfolio-book | Does a fixed-weight book of the standard sleeves (beta, trend, carry, FOMC drift, vol-premium proxy) earn a deflated positive Sharpe after costs? | BANKED | main | 2026-10-19 | `forge/PORTFOLIO_BOOK_PREREG.md` | `analysis/output/portfolio-book/RESULTS.md` | portfolio-book | context: Sharpe 1.06 (1.11 weekend-folded), t 4.9, but DSR 0.49 < 0.95 because the trial variance counted the mirror (A5). Next: claim `portfolio-book-confirm` (corrected trial rule, forward demo record); page `portfolio-book.html` |
| zero-gamma-distance | Does distance to zero gamma predict NQ next-day range? | BANKED | main | 2026-10-19 | `oi_research_book/ZERO_GAMMA_DISTANCE_PREREG.md` | `oi_research_book/ZERO_GAMMA_DISTANCE_RESULTS.md` | zero-gamma-distance (underpowered) | rerun as a new prereg on our own per-expiry capture after ~400 days |
| one-range-forecast | Do the validated market-state flags (Q1) and NQ gamma sign (Q2) still add on top of the shipped range lines? | BANKED | main | 2026-10-19 | `forge/ONE_RANGE_FORECAST_PREREG.md` | `analysis/output/one_forecast/RESULTS.md` | one-range-forecast (null: Q1 0.9926 missed the 0.99 bar with the interval below 1; Q2 1.0019, interval spans 1) | applied: Global Read reads the chosen lines with no stacked multipliers |
| opex-cycle-range | Are US index ranges tighter into monthly expiry and wider after it? | BANKED | main | 2026-10-19 | `forge/OPEX_CYCLE_RANGE_PREREG.md` | `analysis/output/opex_cycle/RESULTS.md` | opex-cycle-range (underpowered) | right way on all 4 and both halves, interval spans 0; side finding (second half of month quieter) needs its own prereg |
| vol-crush-drift | After a Fed/CPI day where VIX falls 5%+, do US indices keep rising the next session? | BANKED | main | 2026-10-19 | `forge/VOL_CRUSH_DRIFT_PREREG.md` | `analysis/output/vol_crush_drift/RESULTS.md` | vol-crush-drift (null) | the rally is same-day; nothing next session |
| gamma-regime-trades | Does the NQ gamma regime say when to fade or follow the p75 line, and does a zero-gamma break follow through? | BANKED | main | 2026-10-19 | `forge/GAMMA_REGIME_TRADES_PREREG.md` | `analysis/output/gamma_regime_trades/RESULTS.md` | gamma-regime-trades (null) | CME book only; retest on the Cboe index + ETF capture (hedging-state-forward first) |
| harness-registry-deflation | Does a fixed harness reproduce two banked results, and how many of 36 validated entries survive registry-wide deflation? | BANKED | main | 2026-10-17 | `forge/HARNESS_REGISTRY_PREREG.md` | `forge/HARNESS_REGISTRY_ADDENDUM_A.md`, `_B.md` | yield-spread-sleeve, multi-spread-sleeve, spread-sleeve-factor-audit, ys-long-confirm → context (deflated) | the 2Y sleeve edge was a GS2 lookahead; HY-vol follow-up needs a long junk-credit series |
| credit-leads-equities | Does credit move before equities (the plumbing order) at 1–20 sessions, direction or vol? | BANKED | main | 2026-10-19 | `forge/CREDIT_LEADS_EQUITIES_PREREG.md` | `forge/CREDIT_LEADS_EQUITIES_RESULTS.md` | credit-leads-equities (null) | HY OAS → next-week vol +0.26 on 3y is descriptive; a prereg on HYG/JNK from 2007 would score it |
| decision-lab-filters | Can rates, COT, VIX stress, US surprises or IV÷RV at entry make rule A (rich-day break on the chosen v3 lines) trades better? | EXPLORATORY | main | 2026-10-19 | `forge/DECISION_LAB_FILTERS_PREREG.md` (DRAFT, not registered) | `backtest-data/decision-lab/findings.json`, decision-lab.html | — | needs owner: approve the draft prereg; confirmation only on the forward paper record + sealed holdout (2024–26 already viewed); prior art on branch fade-continue-book (COT sign conflicts) |
