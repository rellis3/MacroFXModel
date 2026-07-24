# Range-Extension Strategy — Rules & Decisions Log

> Quick, scannable record of **what the engine actually does** and **the choices
> I made** (and why), so we don't have to re-derive them. Full spec:
> `RANGE_EXTENSION_STRATEGY.md`; result: `RANGE_EXTENSION_FINDINGS.md`. Code:
> `js/rangeExtEngine.js`, `js/rangeExtConfidence.js`, `js/sessionRanges.js`.
> Newest decisions at the bottom.

---

## A. The rules the engine follows (as built)

| # | Rule | Where |
|---|---|---|
| R1 | **Levels** = today's Asia session (00:00–06:00, `sessionTz` utc default) range projected as fib extension multiples (`FIB_LEVELS` ±0.25…±10.5). | `rangeExtEngine.buildCandidates` |
| R2 | **Range measure** = candle **bodies** (open/close), 5m, wicks ignored — "closes = acceptance." | `barUtils.bodyRange` via `sessionRanges` |
| R3 | **Tradeable band** = only `0.25 ≤ |mult| ≤ 4.0`. A 4× Asia ext ≈ a full expected daily range, so beyond is un-hittable intraday noise. `maxTradeMult` knob. | `buildCandidates` |
| R4 | **Two-session alignment** = for each of today's levels, distance to nearest **previous-day** Asia level → tag `tight` (≤0.2 pip), `strong` (≤2 pip), `none`. | `buildCandidates` |
| R5 | **Direction** chosen from state: `trendiness = f(vol-regime, day-type, Asia-range wideness)` → **fade** (low) or **follow** (high). | `rangeExtConfidence.dayContext` |
| R6 | **Confidence** per level = blend of geometry (multiple prior + alignment + key-level) and regime-fit. Ranks levels. | `scoreLevel` |
| R7 | **Selection** = keep confidence ≥ `minConfidence` (0.5), take **top-N** (`topN` = 3). Anti-noise gate. | `selectLevels` |
| R8 | **Fade** = limit at level toward range; **follow** = stop through level. SL = `max(AsiaRange×slMult, minSlPips)`; TP = structural (next ladder level) or fixed-R. | `buildOrder` |
| R9 | **Costs on** = round-trip % of price (FX 0.012%, commodity 0.020%) + stop-entry slippage. | engine |
| R10 | **No-lookahead** = state features for day D use data < D (ATR pct & day-type through D−1; Asia-range-ratio from trailing 20 sessions; levels fixed at 06:00; fills on the post-06:00 path via `forecastCore.walkBars`). | engine |

## B. Decisions I made (and why)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Confluence is a scored FEATURE, not a hard gate.** Universe = all extensions ≤4×; alignment is one vote in the confidence. | The in-house POI test showed confluence-*stacking* was already the losing baseline; my disaggregation confirmed aligned levels did *worse* than non-aligned. So gating on overlap-only is unsupported. (User agreed to keep this build for now.) |
| D2 | **`topN`/`minConfidence` are the noise control**, not a target count. `topN=3` is a chosen cap; the "14 levels" was an illustrative worst-case, not a target. Easily changed to a pure floor with no cap. | User clarified 14 was an example of what the 2-pip scan can throw up. |
| D3 | **Fade-vs-follow is a state selector** (the lever the POI test never pulled), not always-fade. | Education: LOW-vol/range-day → fade; HIGH-vol/trend-day → follow. |
| D4 | **Weights are priors, exposed & ablatable — none fit to trade outcomes.** | Avoid overfitting the selector. |
| D5 | **Cost realism matters more than the headline.** Flat-cost top-1 looked positive; realistic per-pair spreads killed it (survivors only in wide-spread crosses). | The decisive honesty test — reported as the verdict. |
| D6 | **Verdict = NULL for tradeable edge**, kept as a costed harness + brain. Alignment zones & follow-direction refuted; base loses on all 26 pairs. | Honest result; ranker works, no edge to concentrate. |

## C. Known gaps / open items

- **G1 — Monday–Monday weekly range NOT included.** The engine uses only today's + yesterday's **Asia** session. The `sessionRanges` brick already exports `buildMondayRanges`/`mondayForDay`/`prevMonday` (ported from the existing engines, which support `levelSource: asia | monday | both`) but the range-ext engine doesn't wire it in. The education doesn't mention it; the rest of the platform does. **Small add if we want Monday-weekly levels + Monday-vs-Asia / week-over-week confluence as extra level sources.** ← *raised by user 2026-07-24.*
- **G2 — Macro/OI conditioners not sourced** (sandbox has OANDA mids only): CME OI/gamma walls, rate-spread compass, catalyst calendar, COT. These are the only honest path to a *positive* version; harness is ready to test them.
- **G3 — Session-range brick copies not migrated** — `rangeFibEngine`/`asiaRangeEngine` still carry private copies (LEGO drift #10).
