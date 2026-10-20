# range-ladder-placebo-confirm — Do the Asia/Monday range EDGES revert more than a shifted ladder on instruments the first test never saw?

**Pre-registered 2026-10-20, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `range-ladder-placebo-confirm` |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `range-ladder-placebo-confirm` |
| Data | OANDA M1, local research cache (`VolRangeForecaster/data/m1`, R2 not used), the **15 instruments not in `range-ladder-placebo`**: audcad, audchf, audnzd, cadchf, chfjpy, eurcad, eurchf, eurgbp, eurnzd, gbpaud, gbpcad, gbpchf, gbpnzd, nzdcad (fx) and uk100 (index). Window **2016-01-04 → 2026-08-20**, the same as the original, inside the lockbox cut |
| Seed | `20261020` (mulberry32; the placebo shift and the bootstrap) |
| Uncertainty | session-date moving-block bootstrap, every instrument of a date resampled together, block = 21 sessions, B = 2000 |
| Scripts / outputs | `scripts/range-ladder-placebo-confirm/` → `analysis/output/range-ladder-placebo-confirm/` |
| Harness | own script, a copy of `scripts/range-ladder-placebo/run.mjs` with only the changes listed in §3. The outcome is a touch-level race on M1 paths, which `js/harness/runStudy.mjs` does not score |

## 1. The claim

`range-ladder-placebo` (banked `underpowered`, 2026-10-19) found that across 19 instruments the range-ladder lines
behave like a ladder shifted to the wrong price, **except at the range edges**: the Asia low/high (`A_0` +2.83 pp,
`A_1` +3.07 pp) and the Monday low/high (`M_0` +1.25, `M_1` +1.67 pp) revert more often than their placebo, with both
halves of the decade the same sign. Its own "what this changes" said to confirm the edge lines alone on data it did not
see. Claim: **at the four edge lines, the race "next line in" vs "next line out" reverts more often than the same race
at a shifted ladder.**

This is the location half of the question "can the Fib Atlas / range-line ladder be traded at all". The economics
half is `range-edge-limit-fade` (`forge/RANGE_EDGE_LIMIT_FADE_PREREG.md`), registered the same day.

## 2. Why it is not already settled

- `range-ladder-placebo`: the edge effect is a post-hoc reading of 77 cells on the same 19 instruments (only `A_1`
  passed its P2 gate) and the run is unjudgeable because control C1 failed by −0.09 pp. Same data cannot confirm it.
- `iep-time` H2 (`forge/IEP_TIME_PREREG.md`) found raw Asia session extremes no different from ±0.15σ placebo levels.
  That used a different race (not the ladder's next-line race) and a different placebo; the two disagree, and this
  test is one way to settle which reading holds for the ladder race.
- `level-touch` (null, 2026-09-10) did not include the Asia or Monday ladders.
- Not a re-cut of a banked null: the scored cells were named by the earlier test's descriptive section and are now
  run on instruments that test never loaded.

**Why these instruments are a fair holdout, and how they are not.** The original 19 are the range-line bot's own
universe (`RL_STRONG_PAIRS` + `RL_BOT_INDEX`); the 15 here are every other instrument in the research cache with
2016+ M1. They were never loaded by `range-ladder-placebo`. They are not independent of it: crosses share currencies
with the seen set, and the years are the same. The bot's pair list was chosen on the book's own results, so these
are likely the book's weaker pairs. That makes the test harsher for the book, and neutral for a location effect,
which does not depend on the book's policy.

## 3. Definitions, fixed in advance

Identical to `forge/RANGE_LADDER_PLACEBO_PREREG.md` §3 including its amendment A1 (sessions re-labelled to their true
UTC date, weekend sessions excluded), with these changes only:

- **Instruments**: the 15 above.
- **Placebo copies**: K = **8** (was 4), same shift `s = u × range`, `u ~ Uniform[0.10, 0.40]`, random sign.
- **Scored lines**: `A_0`, `A_1`, `M_0`, `M_1` only. Pooled cell **E** = all four together (touch-weighted).
- **Control C1**: placebo copies 1–4 vs 5–8, with a **fixed tolerance**: |Δ_C1| ≤ 0.30 pp on the point estimate
  (about a tenth of the effect being confirmed). The original's "CI must contain 0" rule failed on a −0.09 pp bias
  with 2 million placebo touches, a precision no design bias of interest needs.
- **Control C2 (descriptive)**: the extension lines (|fib| ≥ 1.5), pooled, expected ≈ 0 as in the original.
- **Halves**: 2016-01-04 → 2020-12-31 and 2021-01-01 → 2026-08-20.
- Everything else (sessions ≥ 30 bars, first 20 skipped, Asia = `bodyRange(first 6 h, 5)` valid from session start
  + 6 h, Monday = `bodyRange(Monday, 15)` used Tue–Fri, `analyseRangeWindow` unedited, races open at the session
  close marked by the close) is unchanged.

## 4. Hypotheses, expectation first

| # | Cell | Expectation | Pass bar |
|---|---|---|---|
| H1 | E pooled edges | **Yes**, ≈ +2 pp (the original's touch-weighted edge mean) | **THE GATE**: Δ ≥ +1.0 pp **and** two-sided bootstrap p < 0.05 **and** Δ > 0 in both halves |
| H2 | `A_0`, `A_1`, `M_0`, `M_1` each | Asia ≈ +3 pp, Monday ≈ +1.5 pp | Holm across the 4 at α 0.05, Δ ≥ +1.0 pp, both halves > 0 |
| — | **THE MIRROR** | Δ < 0 (edges continue more than a shifted ladder) | A significant negative Δ is reported as such and is a fail for this claim, which is one-signed (confirmation of a positive effect) |
| C1 | placebo vs placebo | ≈ 0 | \|Δ_C1\| ≤ 0.30 pp, else no verdict |

Verdict: **VALIDATED** if H1 passes and C1 is clean (H2 survivors are named in the entry). **NULL** if H1 fails, C1
is clean and the H1 95% CI upper bound is below +1.0 pp. **UNDERPOWERED** otherwise (including any C1 failure).

## 5. Power

From the original run's bootstrap SEs (control-free: they come from a different instrument set), scaled by
√(19/15) for the smaller universe:

| Cell | Expected real touches | SE (pp) | MDE = 2.8 × SE | Pass bar | Verdict |
|---|---|---|---|---|---|
| E pooled | ≈ 97,000 | ≈ 0.16 | ≈ 0.45 pp | 1.0 pp | POWERED |
| `A_0` / `A_1` | ≈ 30,000 each | ≈ 0.28 | ≈ 0.79 pp | 1.0 pp | POWERED |
| `M_0` / `M_1` | ≈ 17–19,000 each | ≈ 0.33 | ≈ 0.93 pp | 1.0 pp | POWERED (thin) |

The realised MDE from this run's own bootstrap is reported; if it exceeds 1.0 pp for a cell, that cell is
UNDERPOWERED regardless of its point estimate.

## 6. Multiplicity

One scored gate (H1) at α 0.05. H2 is four cells under Holm. Per-instrument and per-year slices are descriptive, BH
q 0.10 with `chanceBaseline`. One design, no variants: no other shift range, K, session split or line is run.
Anything that sizes or gates a live position needs |t| ≥ 3.

## 7. What this does NOT test

- **Whether fading the edges makes money.** A +2 pp tilt on a race whose base rate is below 50% (the original's
  pooled revert rate was 46.0%) can be a real location effect and still lose money. That is
  `range-edge-limit-fade`.
- Costs, fills, exits, the Fib Atlas vote, confluence with the previous day's ladder, or the London-session split.
- Forward data: the sessions after 2026-08-21 stay unscored here.

## 8. What each verdict changes

- **VALIDATED**: the range edges are a real location, on unseen instruments. They become the only ladder lines any
  new level-family work may use without its own placebo, and `range-edge-limit-fade`'s economics are read as a test
  of a real effect.
- **NULL**: the edge effect was specific to the 19 instruments it was found on. The Asia/Monday ladder carries no
  location information anywhere; Fib Atlas's levels are closed as a signal and its remaining value is as an exit/
  geometry ruler only.
- **UNDERPOWERED**: wait for forward sessions; no level work builds on the edges in the meantime.

## Amendments

(none)

## RESULTS

Run 2026-10-20 → `analysis/output/range-ladder-placebo-confirm/RESULTS.md`. **VALIDATED**: pooled edges +2.92 pp [+2.68, +3.19], halves +2.70 / +3.12, all four lines pass under Holm, 15/15 instruments, C1 clean (+0.01 pp). Descriptive: the effect is relative (Asia edges revert ~51.7% vs ~48.3% placebo), a coin flip before costs.
