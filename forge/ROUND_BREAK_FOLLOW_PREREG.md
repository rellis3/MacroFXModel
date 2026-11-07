# round-break-follow — does a stop order through a round number make money on real bid/ask fills?

**Pre-registered 2026-11-07, before any outcome on the confirmation window was computed.**

| | |
|---|---|
| ID / ledger id | `round-break-follow` |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `round-break-follow` |
| Data | Real bid/ask M1 (`data/m1_bidask`). σ = `live_sig_used` from the Step 0 table in both windows. **Discovery:** 2020-08-21 → 2026-08-20. **Confirmation:** 2016-10-21 → 2020-08-20, unread for this question. Nothing after 2026-08-20 is read. |
| Seed | `20261107`. Bootstrap keeps `forecast_record.boot_weights`. |
| Uncertainty | Date-block stationary bootstrap, block 20, 2,000 reps |
| Scripts / outputs | `forge/stop_fill.py` (tested), `scripts/round-break-follow/run.py` → `analysis/output/round-break-follow/` |
| Harness | Own script |

## 1. The claim

Found after the fact in `vol-layer-round-numbers`, so not evidence yet. In FX majors 2020-2026, first touches of round numbers reject less than arbitrary prices: about 45% vs 50%, on all seven pairs, every year. A follow at the level makes about +0.07 K gross at K = 0.25σ, against about −0.01 K at arbitrary prices. It loses about 0.04 K after a modelled spread.

Osler's mechanism: stop-loss orders cluster just beyond round numbers, so price moves further once through. This is also the owner's question about stop orders. The test asks if a real stop order at a round number pays.

## 2. Why it is not already settled

- `vol-layer-round-numbers` scored the reversal side only, and this effect has the opposite sign. It used modelled spreads and mid prices, on the same window this prereg uses for discovery.
- `line-touch-limit-unseen`, `range-edge-limit-fade`: limit fades at other levels on bid/ask. Not stop orders, not round numbers.
- `liquidity`, `level-touch`, `LINE-REACTION`: no round-number breaks.

## 3. Definitions

**Levels.** Grids as `vol-layer-round-numbers`: round = `00` and `50` pooled; arbitrary = fractions 0.13, 0.37, 0.63, 0.87. At least 0.1σ and at most 3σ from the session open. Above the open is a buy stop, below is a sell stop. First trigger in a London session, 01:00–20:00 London, not the session's first bar.

**Instruments.** Primary: EURUSD, GBPUSD, AUDUSD, NZDUSD, USDJPY, USDCAD, USDCHF. Reported beside them, never scored: GOLD and the FX crosses.

**Fills (`forge/stop_fill.py`).** Buy stop triggers on the ask high and fills at the level, or at the ask open if the bar gapped through. Exits on the bid. Sell stops mirror. A target or stop hit in the same bar is a stop. A stop gapped through fills at the bar's open on the exit side. These prices already contain the spread. Sensitivity: an extra 0.5 of that session's median spread on each trade.

**Geometry grid, 24 variants.** Stop S ∈ {0.25, 0.5, 0.75, 1.0}σ. Target = S or 2S. Exit at 120 minutes, 240 minutes or the session end (22:00 London), whichever comes first after entry. Result in R = S.

**Selection.** On discovery only: the variant with the highest net mean R on the 7 majors at round numbers. It is the only variant scored on confirmation. All 24 are reported.

**Control.** Arbitrary levels with the same rule, post-stratified on distance from the open, session and instrument.

## 4. Hypotheses

| # | Scored on confirmation | Expectation |
|---|---|---|
| C1 | P(reject \| resolved) at K = 0.25σ, 120 minutes: round minus arbitrary is below 0 | Yes, −2 to −5pp |
| C2 | Net R of the selected variant: round minus arbitrary is above 0 | Yes |
| C3 | Net R of the selected variant at round numbers is above 0 | Probably not: real spread is the obstacle |
| **GATE (VALIDATED)** | C1 and C2 and C3, with C3's whole interval above 0, positive in at least 3 of the 4 years 2017-2020 | |
| **MIRROR** | The same variant fading: a limit at the level with target and stop swapped. Reported, not scored | |

**Words.**
- `VALIDATED`: the gate holds. Research only, then a forward paper record.
- `CONTEXT`: C1 or C2 clears Holm and C3 fails. The location effect is real and does not pay.
- `NULL`: neither C1 nor C2 clears Holm, and both were powered.
- `UNDERPOWERED`: only as §5 says.

## 5. Power

From `vol-layer-round-numbers`: 13,460 round-number follows on majors over six years gave an interval of about ±0.016 K. The confirmation window has about 8,500. SE about 0.010 R at S = 0.25σ, so MDE about 0.03 R at α 0.0167. The discovery gap against arbitrary is about 0.08: C1 and C2 are POWERED. C3 is POWERED only for a net edge of about 0.03 R or more; if its point estimate is positive and its interval contains 0, it is recorded as `UNDERPOWERED`.

## 6. Multiplicity

Three scored cells, Holm at α = 0.05 on one-sided bootstrap. Selection over 24 variants happens only on discovery, so the confirmation is one test per cell. Discovery results are in-sample after selection and are labelled so. By instrument and by year are descriptive.

## 7. What it does not test

Whether stops really sit there: no order data. Other level types. Crosses, indices or gold as a scored result. Execution beyond M1 quotes: no queue, latency or spread widening inside the minute. This is why the extra-spread sensitivity is reported.

## 8. What each verdict changes

- **VALIDATED:** forward paper record on the Vol-Layer page, and the post-lockbox window is scored only under `forge/LOCKBOX_PROTOCOL.md`. Nothing live.
- **CONTEXT:** the location effect goes on the chart as "breaks run further here". It may be a direction-free conditioner for the stop-order layer. No trade.
- **NULL:** the 2020-2026 effect was specific to that window.

## Amendments

## RESULTS

**CONTEXT, 2026-11-07.** C1 -0.0250 [-0.0386, -0.0111]; C2 +0.0191 R [+0.0095, +0.0285]; C3 -0.0310 R [-0.0447, -0.0178], 0 of 4 years positive. Selected variant: stop 1σ, target 2σ, 240 minutes. Details: `analysis/output/round-break-follow/RESULTS.md`.
