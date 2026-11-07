# vol-layer-round-numbers — does price react at round numbers more than at arbitrary prices, and at our lines when they sit on one?

**Pre-registered 2026-11-07, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `vol-layer-round-numbers` |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `vol-layer-round-numbers` |
| Data | M1 mid bars (`VolRangeForecaster/data/m1`), chosen lines and σ (`analysis/output/line_reaction/chosen_lines.csv`), LINE-REACTION encounters. 34 instruments, sessions 2020-08 → 2026-08. No session after 2026-08-20 is read. |
| Seed | `20261107` where one is used. The bootstrap keeps `forecast_record.boot_weights` (20261006), so intervals match LINE-REACTION. |
| Uncertainty | Date-block stationary bootstrap, block 20, 2,000 reps |
| Scripts / outputs | `scripts/vol-layer/round_numbers.py` → `analysis/output/vol-layer-round-numbers/` |
| Harness | Own script. The reaction rules are LINE-REACTION's, and a check requires the replay to reproduce its outcomes at the lines |

## 1. The claim

Osler (2000, 2003, 2005) on FX: take-profit orders cluster at round numbers and stop-losses just beyond them, so price reverses more at round numbers than at arbitrary levels and moves faster once through. The layer 7 literature pass found no evidence of order clustering at vol-scaled forecast levels (`plans/vol-layer/L7_LITERATURE_SPEC.md`). `vol-layer-reaction` found no reaction special to the chosen lines. So the owner's exhaustion question becomes: is there any price where orders visibly rest, and do our lines inherit it when they land on one?

## 2. Why it is not already settled

- `LINE-REACTION`, `level-touch`, `vol-layer-reaction`: the lines against shifted lines. No round-number comparison.
- `forge/CONFLUENCE_LEVELS_PREREG.md` and `LEVEL_P2_PREREG`: round numbers appear as one feature among many at a vol line, on the 50-pip grid. Neither compares them to arbitrary prices as levels in their own right, and neither banks a round-number result in `js/deskEvidence.js`.
- `live-range-confluence-book`: round numbers listed as phase 2, "not run".
- Osler's evidence uses 1996-2000 FX quotes, before electronic dominance, and is not shown net of cost.

## 3. Definitions

**Grids.** `00` = multiples of S. `50` = odd multiples of S/2. Arbitrary placebo = (k + f)·S, f ∈ {0.13, 0.37, 0.63, 0.87}.

| Instruments | S |
|---|---|
| FX non-JPY | 0.0100 |
| FX JPY | 1.00 |
| GOLD | 50 |
| NQ, DE30 | 500 |
| SPX500, UK100 | 100 |
| DOW | 1000 |
| US2000 | 50 |

**Encounters.** Per session, each level at least 0.1σ and at most 3σ from the session open. Above the open is `up`, below is `dn`. First touch only, between 01:00 and 20:00 London, not the session's first bar. σ is the chosen σ for that session. Everything is known before the touch: the grid is fixed and the level side comes from the open.

**Outcomes.** Same rule as LINE-REACTION at two geometries:
- **G1:** K = 0.25σ, 120 minutes, comparable with the lines.
- **G2:** K = 0.10σ, 30 minutes, nearer the size and duration Osler reports.

Reject = K back toward the open before K beyond. A touch bar already K beyond is a break. Same-bar ambiguity is dropped from rates and is a loss in trades. Timeouts mark to market, clipped to ±1 K.

**Control.** Arbitrary-grid encounters, post-stratified to the round-number mix on distance from the open (σ edges 0.1, 0.3, 0.5, 0.75, 1, 1.5, 3), session (Asia, London, New York) and class. Weights are fixed once.

**Interaction at the lines.** Chosen-line first touches (LINE-REACTION offset 0). `near_round` = within 0.05σ of a `00` or `50` level. `near_arb` = within 0.05σ of an arbitrary-grid level and not `near_round`. Compared within rung × class.

**Costs.** One measured round-trip spread, as `vol-layer-reaction`.

**Replay check.** Before scoring, the replay function is run on the chosen-line levels for three instruments. Its outcome must match LINE-REACTION on at least 99.9% of encounters, or nothing is scored.

## 4. Hypotheses

| # | Question | Expectation |
|---|---|---|
| a | P(reject \| resolved) at `00` above arbitrary, G1 | Small yes: +0 to +2pp. G1 may be too large for the effect |
| b | Same at `00`, G2 | Yes: +1 to +3pp |
| c | Same at `50`, G1 and G2 | Smaller than `00` |
| d | Lines near a round number reject more than lines near an arbitrary level | Small yes |
| e | Fading at round numbers pays net of spread | No |
| **GATE (VALIDATED)** | A cell in (a)-(c) positive after Holm, **and** its fade is net positive with its whole interval above 0, **and** positive in at least 4 of 6 folds | |
| **MIRROR** | Crossing: once through, does price go further than at arbitrary levels? Mean `beyond60` on breaks, reported with intervals. Osler's cascade side | |

**Words.**
- `VALIDATED`: the gate holds.
- `CONTEXT`: a scored cell clears Holm but the gate fails. Orders may rest there, but it does not pay.
- `NULL`: no cell clears Holm, and the cell was powered.
- `UNDERPOWERED`: a cell whose realised interval half-width exceeds 0.015 and which comes back empty.

## 5. Power

Sizes estimated from price range and σ only, no outcomes. About 18,000 `00` encounters, design effect about 1.75 for date clustering: SE about 0.005, MDE about 0.015 at α 0.01 (Holm, five cells). `50` is similar. Osler's reversal gap is 3–4pp, so these are POWERED. Line interaction: about 6,400 touches near a round level, SE about 0.01, MDE about 0.03: POWERED only for an effect about Osler's size. If its interval is wider than ±0.03 and contains 0, it is recorded as `UNDERPOWERED`.

## 6. Multiplicity

**Scored cells:** `00` G1, `00` G2, `50` G1, `50` G2, line interaction. Holm at α = 0.05, one-sided bootstrap. By class, by fold and first vs second half are descriptive. FX is shown separately because Osler's mechanism is an FX one. A slice is a candidate for its own prereg, never a result.

## 7. What it does not test

Whether stops sit "just beyond" a level at a specific offset. Order books. Round numbers in rates or other markets. Levels other than first touch in a session. Follow-through as a trade with wider stops, which is the next study.

## 8. What each verdict changes

- **VALIDATED:** a forward paper record. Nothing live.
- **CONTEXT:** round numbers go on the chart as places orders probably rest. Lines close to one are marked. No trade.
- **NULL:** price shows no special reaction at round numbers either, so a resting-order explanation of "reaction" isn't visible in M1 at these scales.

## Amendments

## RESULTS
