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
| D7 | **Wired Monday-weekly as an optional 2nd level source** (`levelSource: asia\|monday\|both`), stop scaled to each source's own range, tagged per trade. **Tested the user's "weekly levels are stronger" hypothesis — decisively refuted for THIS intraday engine:** Monday levels pooled **−0.367 R** vs Asia −0.119 R (t −96), **worse on 0/26 pairs, positive on 0/26**, and top-1 selection can't rescue them (Monday −0.072 R vs Asia +0.05 R). Mechanistic reason: this engine resolves every trade **within the same day** (06:00–20:00), but weekly levels sit far from price and are *swing-timeframe* levels that react over days — an intraday fade of them mostly EOD-marks or stops out before any weekly reaction. Kept the capability (default `asia`); "weekly levels are stronger" may hold for a **multi-day hold** (a different engine, G4). | User asked 2026-07-24; tested rather than guessed. |

| D8 | **Built multi-day hold (`holdDays`). Thought it found a survivor — it didn't; RETRACTED.** The apparent +0.117 R "Monday swing survivor" was a **fill-conditioned selection look-ahead** (offline analysis picked the best-confidence level *among those that filled*). Measured honestly through the engine's own selection (choose top-N first, trade whatever fills), Monday-3d-fade is **−0.006 R OOS at top-1, negative at top-2/3/5, spreads-only** → negative after carry. Carry (G5) moot. The hold DID lift the raw Monday number (−0.37 → −0.03 R) so the timeframe intuition was directionally right, but it lands at breakeven. **The range-extension family is a null, intraday and swing.** See `RANGE_EXTENSION_FINDINGS.md` "Weekly swing variant — RETRACTED". | Honest correction; caught by requiring the engine to reproduce the offline finding before shipping the webpage. |
| D9 | **Rule earned here: never select "best among filled" offline.** A per-level engine that records only filled trades will inflate any offline top-N picked from the dump — it conditions on a future fill. Selection is only honest when done inside the engine (rank → place orders → trade fills). The webpage runs the engine's `gated` selection, so it shows the true number. | Prevents repeating the D8 mistake. |

| D10 | **Added the at-touch approach-velocity confidence** (`touchFeatures.approachVel` + `touchGate`, daily σ in `buildDailyFeatures`) — the platform's OOS-proven discriminator, which my brain had omitted (I used only pre-day static features, already known dead). Recorded on every fade, no lookahead. **Finding: it's the biggest discriminator in the study (grind fade +0.003 R vs spike fade −0.23 R, a 0.23 R spread) — so "some touches are far better" is TRUE — but no pole is tradeable** (grind = breakeven, spike-fade −0.23, spike-follow −0.29). Polarity is REVERSED vs the platform's σ-band lines (structural range-multiple → spike = continuation, not exhaustion). Feature kept; verdict unchanged (null). See FINDINGS "At-touch approach velocity". | Tested the strongest available confidence signal; confirms selection reaches breakeven, not profit. |

## C. Known gaps / open items

- **G1 — Monday–Monday weekly range: DONE + tested (see D7).** Now wired as
  `levelSource: asia | monday | both`. Result: Monday levels are decisively worse
  intraday (−0.367 R, 0/26 pairs). Default stays `asia`.
- **G4 — DONE (see D8): multi-day hold built (`holdDays`).** It lifted the raw
  Monday number to breakeven but NOT to a real edge (the "survivor" was retracted
  as a look-ahead artifact). Timeframe-match intuition was directionally right.
- **G5 — carry/swap: MOOT.** The edge is gone at spreads-only, so carry no longer
  decides anything. (Would only matter if a spreads-only-positive base reappeared.)
- **G6 — position management: not needed** unless a real base edge is found.
- **G2 — Macro/OI conditioners not sourced** (sandbox has OANDA mids only): CME OI/gamma walls, rate-spread compass, catalyst calendar, COT. These are the only honest path to a *positive* version; harness is ready to test them.
- **G3 — Session-range brick copies not migrated** — `rangeFibEngine`/`asiaRangeEngine` still carry private copies (LEGO drift #10).
