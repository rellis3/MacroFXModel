# flow-range-liquidity — do order flow and liquidity say how much price will move, beyond volume and recent volatility?

**Pre-registered 2026-11-07, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `flow-range-liquidity` |
| Branch | main |
| Register row | `plans/RESEARCH_REGISTER.md` → `flow-range-liquidity` |
| Data | 1-minute flow bars already built for `delta-at-line`: 6E 2023-04-03 to 2026-08-21 and 6J 2023-08-01 to 2026-08-21 with the exchange aggressor flag (03:00 to 16:00 New York); NQ 2025-11-06 to 2026-08-21 with the tick rule (cash hours). Nothing after 2026-08-21 is read |
| Seed | `20261107` |
| Uncertainty | session-date block bootstrap, 20-session blocks, B = 2000 |
| Scripts / outputs | `scripts/flow-range-liquidity/` → `analysis/output/flow-range-liquidity/` |
| Harness | own script (local data, its own target) |

## 1. The claim

Uses S1 and S2 on `.claude/skills/research-director/agendas/volume-footprints.md`, chosen by the owner on 2026-11-07. Direction tests on this data have come back empty, so this asks about size instead.

- **M1, flow state.** One-sided, persistent aggressive flow consumes liquidity and clusters, so it should come before more range, whichever way price goes.
- **M2, liquidity.** Cont, Kukanov and Stoikov find price impact rises as depth falls. A market that moves further per contract traded is thin, and thin markets should move more per unit of new flow.

## 2. Why it is not already settled

- `orderflow-lead-aggressor`, `footprint-absorption` and `delta-at-line` asked which way, not how much.
- Andersen and Bondarenko report that VPIN's forecasting power for volatility vanishes once realised volatility is controlled for, so the baseline here includes realised volatility and volume. Wen, Jia and Hao report a gain from an imbalance measure in a HAR model on Chinese index futures (abstract only).
- `vol-layer-rv5-increment` found about a 1.2% gain from realised variance over the chosen lines. `vmc-nq-vol-increment` found no increment for indicators, about +0.1% skill. Nothing has tested signed flow or price impact as a range input.

## 3. Definitions, fixed in advance

- **Checkpoints:** each hour on the hour in New York time inside the session, one per hour, with the previous 60 minutes behind it. 6E and 6J 04:00 to 15:00. NQ 10:30 to 15:00 on the half hour.
- **Usable:** at least 45 of the 60 minutes before and after, and one contract throughout.
- **Targets, both log:** `h60` is the high minus low over the next 60 minutes. `rest` is the high minus low from the checkpoint to the session's end, for checkpoints with at least 60 minutes left.
- **Baseline inputs (the bar to beat):** over the prior window, log range over 60 minutes and over 15 minutes, log realised volatility from 1-minute returns, and log volume.
- **M1 inputs:** |buy - sell| / (buy + sell) over 60 minutes, and |sum of minute delta| / sum of |minute delta| over 60 minutes (how persistent the side was).
- **M2 inputs:** log of the OLS slope of 1-minute return on signed minute volume over 60 minutes, floored at a small positive number (impact per contract); and log of the mean of |return| / volume per minute (Amihud).
- **Normalising:** every target and input is expressed against its own same-hour mean, and inputs also its standard deviation, over up to the previous 60 sessions, needing 20, strictly earlier. Nothing here uses the checkpoint's own session or later.
- **Models:** pooled OLS with an intercept. Base = baseline inputs. M1 = base + M1 inputs. M2 = base + M2 inputs.
- **Walk-forward:** dates split into 5 chronological folds. Fold 1 only trains. Each later fold is predicted from all earlier folds, with a 5-session gap.
- **Score:** MSE of the model over MSE of base, on predicted folds, pooled. Below 1 is better.
- **Placebo:** the model's added inputs replaced by the same inputs from the same hour k sessions away, k = 1..20.

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| M1-h60, M1-rest | Flow state beyond the baseline | **Null or very small.** Andersen and Bondarenko predict little once realised vol is in |
| M2-h60, M2-rest | Impact per contract beyond the baseline | **Small.** It is the likelier of the two, because it measures something the baseline does not |
| **THE GATE, per cell** | Ratio at or below 0.99 with the bootstrap upper bound below 1; Holm at alpha 0.05 over 4 cells on P(ratio >= 1); better in at least 3 of the 4 predicted folds; below 1 on each of 6E, 6J and NQ; below all 20 placebos. `VALIDATED` if any cell passes. A cell below 1 that misses 0.99 is `CONTEXT` | — |

The 0.99 bar is the one `vol-layer-reaction` used: a 1% better forecast of log range is about the smallest gain worth carrying into a live input.

Descriptive, no pass weight:
- Realised range over the base forecast, by quintile of each added input, per market. This is the number a size rule would use.
- Top-quintile share of the largest 10% range surprises.
- Each input alone; each market; each hour; each fold. The tick-rule version of M1 on 6E and 6J, to see whether the free tick rule is enough there.

## 5. Power

About 10,000 checkpoints on 6E, 9,000 on 6J and 1,000 on NQ. A ratio is not a mean difference, so there is no textbook MDE. **The test of power is the interval:** a cell whose upper bound is below 1 but whose lower bound is above 0.99 could not have met the bar's first half and is `CONTEXT`; a cell whose interval contains both 0.99 and 1 is `UNDERPOWERED`; a cell whose lower bound is above 0.99 and upper bound at or above 1 is `NULL`, because the bar is ruled out.

Count first: the run reports checkpoints per market and target, nothing about any model. It goes in `## Amendments` as PRE-RESULTS only if a market falls under 500.

## 6. Multiplicity

- Scored cells: 4, Holm at alpha 0.05.
- Disaggregation: BH at q = 0.10 with `chanceBaseline`. A survivor is a candidate for its own prereg.
- Promotion to live use needs a forward shadow record through the decision engine, whatever this finds.

## 7. What this does NOT test

- Direction. Neither input says which way.
- A profit. It scores a forecast of range. Whether a better forecast earns anything is a sizing question for later; `vol-target` found that sizing cuts the worst month without adding return.
- Book depth. M2 infers liquidity from trades, which is a stand-in for what Cont et al. measured.
- Markets beyond these three. The recorder adds them from 2026-11-09, inside the lockbox.
- The chosen forecast lines themselves: the base here is built from recent intraday data, so a pass still needs testing against those lines.

## 8. What each verdict changes

- **Validated** → research-only ledger entry; the input runs as a shadow beside the lines and in the decision engine's log; a forward record starts; a size or stand-aside rule is pre-registered next, tested against the chosen lines. No bot obeys it first.
- **Context** → recorded and described on the page. No live use.
- **Null** → ledger entry; order flow is closed for range on these markets at this horizon. Use 4 on the agenda (execution audit) is what remains.
- **Underpowered** → ledger entry and what more data would fix it.

## Amendments

*(none yet)*
