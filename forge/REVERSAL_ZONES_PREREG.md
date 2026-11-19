# reversal-zones — after a ladder line is touched, how far past it does price run before the first real reversal?

**Pre-registered 2026-11-19, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `reversal-zones-race` (H1), `reversal-zones-overshoot` (H2); per-instrument zone tables reported |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` (pushed to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `reversal-zones` |
| Instruments / track | NQ, GOLD, EURUSD on the OANDA CFD (primary); futures reported, no rule |
| Lines | the walk-forward `ladder-v2-*` ladders, each instrument's chosen arm (NQ E6, GOLD HARCJ, EURUSD HARCJ), `test_C.parquet` |
| Window | London sessions 00:00–22:00, 2018 → 2026-08-21 (no fitting, so every test year is used) |
| Seed / uncertainty | `20261119`; session block bootstrap within instrument, block 63, B = 2000 |
| Scripts / outputs | `scripts/reversal-zones/` → `analysis/output/reversal-zones/` |

## 1. The owner's question

The ladder is calibrated: the p50 line is reached on about half of days. But a trader needs to know **what happens at
the line**:
- Does price usually run a fixed extra amount past it, then turn?
- Does it only tap it, or go through and come back?

If the first reversal reliably happens in a band just past each line, that band is an **exhaustion zone**, and the
chart should show the band rather than a thin line. `exhaustion-v2-*` measured continuation after a touch. It never
defined a meaningful pullback or measured how far price overshoots before one.

## 2. Prior art

- `exhaustion-v2-nq/gold/eurusd` (VALIDATED): P(reach the next rung) after a touch depends strongly on the clock.
- `turn-at-lines` (CLOSE UNDERPOWERED +0.5pp, PROJ NULL): the session high/low doesn't land at lines more than beside
  them.
- `range-ladder-placebo-confirm` (VALIDATED +2.9pp): Asia-edge lines revert slightly more than a shifted ladder.
- `raw-level-mfe-mae` (EXPLORATORY): after a touch, fading and following have the same odds.
- `nq-lines-as-exhaustion` (EXPLORATORY): price runs a median 0.3–0.5σ past a line.
- `live-range-line-race` (NULL): the race after a touch matches placebo touches.

None of these used the regime-correct v2 lines, a pullback-size grid, or a time-of-day split together.

## 3. Definitions

- **Lines** (σ = chosen arm's daily σ, O = London-midnight open):
  - **EXT:** OH p50/75/90 up, OL p50/75/90 down.
  - **CLOSE:** O·(1 ± oc_p), p50/p75.
  - The projected (dynamic) lines are reported only.
- **Touch:** the first M1 bar whose high ≥ an up line (low ≤ a down line). One per line per session.
- **Reversal of size R:** after the touch, the first bar whose low ≤ (the highest high of the *earlier* post-touch bars,
  or the line if none) − R·σ·O. Down lines mirror this. Using only earlier bars avoids guessing intrabar order.
- **R grid:** 0.25σ and 0.50σ. At today's gold σ that is roughly 13 and 26 points; at EURUSD roughly 9 and 18 pips.
- **Overshoot:** how far past the line price ran before that reversal, i.e. the earlier-bars extreme minus the line,
  in σ·O and in % of price. If no reversal comes by 22:00, the overshoot is the run to the close of the session and
  is flagged *censored*.
- **Extension E:** the next rung of the same family (p50→p75, p75→p90). For p90 lines and for CLOSE p75, E = 0.25σ.
- **Race:** after the touch, which comes first: extension by E, or a reversal of R.
  - A bar that does both counts as **ambiguous** and is left out of the race (share reported).
  - If neither happens, the touch counts as **neither**.
  - Race share = reversal-first ÷ (reversal-first + extension-first).
- **Local placebo:** the same family moved ±0.15σ and ±0.30σ (four copies), with the same touch, reversal and race
  definitions. A line effect must beat its own neighbours.
- **Random-walk baseline (reported):** 20 synthetic histories of Brownian sessions on each instrument's real vol clock,
  60 substeps a minute, with lines at the same σ multiples (the exhaustion-v2 control generator). This shows what
  geometry and the clock alone produce.

## 4. Hypotheses and pass rules

- **H1 (race):** for EXT and CLOSE, and R ∈ {0.25σ, 0.50σ}, the reversal-first share at real lines exceeds the mean of
  the four placebo copies.
  - Pooled over the three instruments, this gives 4 tests, adjusted with Benjamini–Hochberg q = 0.10.
  - **VALIDATED** if the excess > 0 with the 90% CI excluding 0 in both halves (2018–22, 2023–26) and BH passes.
  - **NULL** if the CI excludes an excess ≥ 2pp.
  - **UNDERPOWERED** otherwise.
- **H2 (overshoot):** for the same 4 cells, the median overshoot before the first reversal at real lines is **smaller**
  than at the placebo copies (σ units; difference CI; both halves). Same verdict words; NULL bar 0.05σ.
- **The zone tables** are the descriptive deliverable, whatever the verdicts. Per instrument × rung × London time
  bucket (00–07, 07–12, 12–16, 16–22) they give:
  - overshoot p25/p50/p75 (in % and σ)
  - the reversal-first share for each R
  - P(the session closes back inside the line)
  - P(price crosses the line again later)
  - n
  - the random-walk baseline beside each figure

## 5. Power

About 2,200 sessions × 3 instruments × 10 lines, with roughly 45% of lines touched: about 30,000 touches. The race
share's SE ≈ 0.3pp before clustering, so 2pp is well powered. Per time bucket the tables have a few hundred to
a few thousand touches.

## 6. What each verdict changes

- **H1 or H2 VALIDATED:** real lines are reversal zones beyond geometry. The export and indicator then show each line
  as a band (line → p50 overshoot) with its reversal odds by hour.
- **NULL:** lines are no special reversal points. The zone tables (overshoot and reversal odds by rung and hour) are
  still accurate descriptions of what price does after a touch, because they're measured on real data. They can go
  on the chart as such, labelled as distance-and-clock odds, not line magic.
- **Nothing live changes without owner sign-off.**

## Variant log

| # | Variant | Added | Status |
|---|---|---|---|
| 1 | EXT + CLOSE lines, R = 0.25σ/0.50σ, E = next rung or 0.25σ, local placebo ±0.15/±0.30σ, random-walk baseline | 2026-11-19 | registered |

## Amendments

(none)
