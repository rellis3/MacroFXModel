# range-edge-limit-fade — Does fading the Asia range edges with resting limit orders make money on real bid/ask?

**Pre-registered 2026-10-20, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `range-edge-limit-fade` (cells T1, T2 under one id) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `range-edge-limit-fade` |
| Data | OANDA bid/ask M1, `data/m1_bidask/<key>_m1.parquet` (practice pricing, spread-only account), all **34** instruments: 28 FX, gold, nq, spx, dow, dax, uk100, us2000. Window: first full session in each file (2016-10) → **2026-08-20** (inside the lockbox cut). Read by column name (`bid_*`, `ask_*`, `time`); never through `loadM1ForPair`, which reads the timestamp by position |
| Seed | `20261020` (mulberry32; the placebo shift and the bootstrap) |
| Uncertainty | session-date moving-block bootstrap, every instrument of a date resampled together, block = 21 sessions, B = 2000 |
| Scripts / outputs | `scripts/range-edge-limit-fade/` → `analysis/output/range-edge-limit-fade/` |
| Harness | own script. Reuses `bodyRange` and `buildRangeLadder` unedited for the ladder; the fill/exit simulation is new and is the thing under test. `js/harness/runStudy.mjs` scores daily signals from the feature store, not intraday fills |

## 1. The claim

Fib Atlas and the range-line book both trade a ladder built off the Asia range. With the look-ahead fixed, Fib
Atlas's backtest won 85.7% while the live bot won 39.6% (`MD files/FIB_ATLAS_BACKTEST_VS_LIVE.md`). Two of the four
confirmed causes were execution: market entries after the touch, and "hairline" touches (median clearance under
1 pip) that no real order catches. `range-ladder-placebo` then showed the only ladder lines that differ from a
shifted ladder are the range edges, by about +3 pp of reversion at the Asia low/high.

Claim: **a resting limit order at the Asia range edge (sell at `A_1`, buy at `A_0`), filled only when the far side of
the quote trades through it, and exited on real bid/ask, has positive net expectancy per trade.** This tests the one
surviving location effect in the form a live bot could actually execute.

## 2. Why it is not already settled

- `range-ladder-placebo` / `-confirm` score a race on mid prices, not P&L. A relative edge (+3 pp over a placebo)
  does not imply an absolute one: that test's pooled revert rate was 46.0%, below the 50% a 1:1 fade needs.
- `analysis/fib_atlas_limit_order_clearance_test.mjs` and `vote_atlas_limit_order_clearance_test.mjs` ran on the
  pre-fix (look-ahead) books, on mid prices, and on every rung, not the edges.
- `line-touch-wide-scan`, `futures-cost-rescore`, `level-touch`: different lines (vol-forecast ladders, prior-day
  levels) and market entries. None used a resting order or measured bid/ask.
- The bid/ask history (`data/m1_bidask`, 2026-10-20) did not exist before today; no study has priced a fill with it.

## 3. Definitions, fixed in advance

- **Session**: UTC calendar day (the range-line book's convention, with `range-ladder-placebo` A1: true UTC date,
  weekends excluded), ≥ 30 bars, the first 20 sessions of each file skipped.
- **Ladder**: Asia range = `bodyRange(bars with time < session start + 6 h, 5)` on **mid** OHLC; `buildRangeLadder`
  gives `A_0` (= low), `A_0.5` (mid), `A_1` (= high), `A_1.5`, `A_-0.5`, `A_2`, `A_-1`. R = 0.5 × range (one rung).
- **Order placement** at `validFrom` = session start + 6 h (06:00 UTC), only if:
  - the last mid close before `validFrom` lies strictly between `A_0` and `A_1`; and
  - the spread at placement (`ask_c − bid_c` of the last bar before `validFrom`) is ≤ 0.10 × R (the execution
    feasibility gate, `project_execution_feasibility_gate`: above 0.15 spread/ATR nothing survives).
  Sessions failing either are counted and reported by reason, never silently dropped.
- **Orders**: a sell limit at `A_1` and a buy limit at `A_0`, independent, each live 06:00 → 20:00 UTC, at most one
  fill per side per session.
- **Fill**: the sell limit fills at `A_1` on the first bar with `bid_h > A_1` (the bid traded **through** the level,
  not just to it); the buy limit fills at `A_0` on the first bar with `ask_l < A_0`. No price improvement.
- **Exits** (short shown; long mirrored on the other side of the quote):
  - **stop**: buy stop at `A_1.5`, triggered when `ask_h ≥ A_1.5`, filled at `max(A_1.5, ask_o)` (a gap fills at the
    bar's open);
  - **target**: buy limit at the cell's target, filled when `ask_l < target`, at the target;
  - **time**: anything open at 21:55 UTC is closed at that bar's `ask_c` (last bar before 22:00 if 21:55 is missing),
    so no position crosses the rollover and no financing is charged.
  - **Same-bar rules (adverse first)**: on the fill bar only the stop is checked; on any later bar where both stop and
    target trigger, the stop is taken.
- **Outcome**: net R per trade = signed P&L ÷ R, all prices from the bid/ask columns, so the spread is inside every
  fill. No commission (OANDA spread-only).
- **Cells**:
  - **T1** target `A_0.5` (the range mid, the race `range-ladder-placebo` measured): 1:1 before costs.
  - **T2** target the opposite edge (`A_0` for a short, `A_1` for a long), same stop: 2:1. The single logged
    variant; it asks whether the edge reversion carries through the range.
- **Control C1 (descriptive)**: the identical rules on K = 4 placebo ladders per session, shifted by
  `u × range`, `u ~ U[0.10, 0.40]`, random sign (as `range-ladder-placebo`). Real − placebo net R is reported for T1
  and T2: it says how much of the P&L is location and how much is the exit geometry.
- **Descriptive diagnostics**: touch→fill rate (mid touch vs bid/ask trade-through); win rate of filled trades vs the
  mid race at touches that never filled (adverse selection); excluded share by reason; spread paid in R by
  instrument and year; by year; without the top 1% of days.
- **Instrument sets**: S = the 19 instruments `range-ladder-placebo` used (spx500→spx, de30→dax, us30→dow); U = the
  other 15.
- **Halves**: first session → 2020-12-31 and 2021-01-01 → 2026-08-20.

## 4. Hypotheses, expectation first

| # | Cell | Expectation | Pass bar |
|---|---|---|---|
| T1 | 1:1 edge fade, all 34 pooled | **Null**: gross ≈ −0.02…+0.04R (a ~+3 pp tilt on a base rate near 47%), net ≈ −0.05R | **THE GATE**: mean net R > 0 with bootstrap 95% CI lower bound > 0 (Holm-adjusted across T1/T2) **and** > 0 in both halves **and** > 0 in S and in U separately **and** > 0 on the point estimate under the stress fill (below) |
| T2 | 2:1 edge fade | **Null**, slightly less negative than T1 if the reversion carries | same gate |
| — | **THE MIRROR** | a significantly negative T1/T2 would mean following the break at the edge pays. Reported, not scored; a follow-the-break rule needs its own prereg (and `paper-record` rule A already trades breaks on rich-IV days) | |

**Stress fill**: the limit fills only when the far side trades through by at least one spread at that minute
(`bid_h > A_1 + (ask_c − bid_c)` for the sell). It addresses the hairline problem directly.

Verdict: **VALIDATED** if T1 or T2 passes its gate. **NULL** if neither passes and both cells' 95% CI upper bounds
are below +0.05R (half a typical spread in R at these stops: an edge smaller than that is not worth trading).
**UNDERPOWERED** otherwise.

## 5. Power

The outcome SD is not known before the run; for a ±1R race it is ≈ 1R (T1) and ≈ 1.4R (T2). Expected trades:
`range-ladder-placebo` saw ≈ 78,000 Asia-edge touches over 19 instruments × 10.6 years; for 34 instruments × 9.9
years at a ~75% fill rate that is ≈ 98,000 trades over ≈ 2,500 session dates. Trades on one date are correlated, so
the effective sample is the date-clustered bootstrap's; assuming an effective n ≈ 10,000–20,000 the SE is
≈ 0.007–0.010R and the **MDE ≈ 0.02–0.03R (T1), 0.03–0.04R (T2)**, below the +0.05R line the NULL rule uses.
The realised MDE (2.8 × bootstrap SE) is reported per cell and decides POWERED vs UNDERPOWERED.

## 6. Multiplicity

Two scored cells (T1, T2), Holm at α 0.05. The gate is otherwise conjunctive (halves, S and U, stress fill), so no
further correction. Per-instrument, per-year, per-class slices are descriptive, BH q 0.10 with `chanceBaseline`.
No other stop, target, time window, spread filter, entry offset or line is run: **one prereg + one logged variant**
(`feedback_lessons_on_track`). Promotion to anything live needs |t| ≥ 3 and a forward shadow record.

## 7. What this does NOT test

- The MT5 broker's spreads (this is OANDA practice pricing) or queue position (a trade-through fill assumes no queue,
  the stress fill bounds that), stop slippage beyond a bar's open, or latency.
- The Fib Atlas vote, previous-day confluence, the chandelier trail, Monday edges, extension rungs or re-entries.
- Sizing (equal R per trade) and the one-account constraints (margin, net exposure) that rejected 42% of Fib Atlas's
  signals. A pass is a per-trade edge, not a portfolio.
- Direction beyond "fade the edge".

## 8. What each verdict changes

- **VALIDATED**: the first net-positive form of the Asia ladder. Next: a shadow logger beside the live bots (no live
  change, `feedback_side_by_side_no_live_impact`), one look at 60 sessions, then the one-account sim with a fixed
  priority order before any bot work.
- **NULL**: fading the Asia range edges does not pay at either exit, even with a resting order and with the one real
  location effect behind it. The ladder is closed as a stand-alone fade; no more exit variants on it. What the Atlas
  work keeps is its machinery (point-in-time walk, barrier pricing, one-account sim) and the edges as context (e.g. a
  sizing input for rule A), each needing its own prereg.
- **UNDERPOWERED**: add the forward sessions (H-B shadow) before deciding.

## Amendments

(none)

## RESULTS

(not yet run)
