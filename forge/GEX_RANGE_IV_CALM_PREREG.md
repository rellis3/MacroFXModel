# gex-range-iv-calm — is any short-gamma range widening left, once implied vol is controlled, in calm-VIX sessions only?

**Pre-registered 2026-11-14, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `gex-range-iv-calm` (two scored cells: ES-calm, NQ-calm) |
| Branch | `main` (small commits) |
| Register row | `plans/RESEARCH_REGISTER.md` → `gex-range-iv-calm` |
| Data | Exactly the `gex-range-iv` frames: `oi_research_book/scripts/32_gex_range_iv.py` `build(name, start)` (script 27's NY-close sessions, OI(D) → S(D+2), targets ≤ **2026-08-21**, controls r5, r20, dd60, IV ratio v from Cboe VIX for ES and VXN for NQ). Nothing new is fetched; the calm label reads the same Cboe series (`analysis/surfaces/cboe/VIX.csv`, `VXN.csv`) |
| Seed | `20261114` |
| Uncertainty | the parent's stationary block bootstrap (mean block 10 sessions, B = 4,000, `scripts/18` `_boot_stats`); all-shift placebo as in the parent |
| Scripts / outputs | `scripts/gex-range-iv-calm/run.py` (imports `32_gex_range_iv.py`; nothing copied) → `analysis/output/gex-range-iv-calm/` |
| Harness | own script (OI-book convention, same as the parent) |

Applied from `education/RESEARCH_METHOD_LESSONS.md`: a split of a banked cell is a new family of tests on the same data and is
priced as such (§6); the registered gate is read against the verdict code before any result is read (a lesson from
2026-10-14…18).

## 1. The claim (required)

`gex-range-iv` (UNDERPOWERED, 2026-11-03) found implied vol absorbs 64% (ES) and 73% (NQ) of the short-gamma range widening
and what is left (+0.054 ES, +0.044 NQ over 770 sessions) is too small to see. A 2026 working paper (Dealer Gamma
Exposure and Overnight Gap Risk, ssrn 6650858) reports that residualised gamma improves out-of-sample overnight-gap
forecasts **only on low-VIX days** (calm Clark-West +5.82, N = 349; stress +0.76), concentrated after 2020. This study asks
the one cut the parent did not make: **in calm-VIX sessions, does short gamma still widen the next range after the IV ratio
is in the baseline?** Descriptive range question, no direction.

## 2. Why it is not already settled (required)

Searched 2026-11-14 (register, `forge/`, `oi_research_book/`, `js/deskEvidence.js`, the paper-ideas report):
- `gex-range-iv` (UNDERPOWERED): whole sample, ES and NQ, IV absorbs most. No calm/stress split. Its §5 says a clean NULL
  needs the CI upper below +0.10 and that UNDERPOWERED is the likely label.
- `gex-range-es`, `gex-range` (VALIDATED) and `gex-split-book` (NULL): whole-sample gamma sign versus range; the split book
  found no book-specific effect. `gex-range-gold` (UNDERPOWERED): gold, no calm split.
- `vol-curve-front` (VALIDATED) uses the front of the implied-vol curve to size the range lines but does not condition
  gamma. `stress-filter-hold` (BANKED) found stressed days no worse on hold-day returns: a different target.
- A grep for "calm" with "gamma" in the OI book finds no regime split. This is a miss in a grep, not proof of absence.

**Seen-data warning.** This is the sixth analysis of the 2020-10 → 2026-08 gamma/range window (`gex-range-es`, post-hoc, NQ
re-run, `gex-split-book`, `gex-range-iv`, this). The parent's prior applies: IV already absorbed most of the effect, so a
remainder confined to calm days is a long shot. Any pass is research-only until |t| ≥ 3 and unseen data confirm it.

## 3. Definitions, fixed in advance (required)

- **Frames, DR, short, B0/B1, v, timing:** exactly `GEX_RANGE_IV_PREREG.md` §3 (the parent's `build`, `X_of`, `coef`).
- **Calm label (knowable at the target):** the Cboe IV (VIX for ES, VXN for NQ) close on the label date of S(D+1), as in v,
  compared with the **trailing 252-session median of the same series ending that date** (inclusive, no later data):
  **calm** = IV ≤ that median, **stress** = IV > that median. Sessions with fewer than 126 prior IV observations are
  dropped (count reported).
- **Scored statistic (per instrument):** the short coefficient in B1 (B0 + v) **estimated within the calm sub-sample**
  ("b_IV,calm"), with the parent's block bootstrap interval and the parent's all-shift placebo (shifts on the short label
  within the sub-sample).
- **Descriptive:** B0 (no IV) short coefficient in calm and in stress; the calm − stress difference with a paired bootstrap
  (resample sessions once, estimate both); a pooled interaction regression (B1 + calm + short×calm) with its short×calm
  coefficient and bootstrap p; the parent's absorbed share inside calm (Δb = b_B0,calm − b_IV,calm, paired bootstrap).
- **Sensitivities (descriptive, never scored):** fixed cut (VIX < 20, VXN < 25); calm = lowest tercile of the same trailing
  window; calm label from the IV at the OI date D rather than D+1; first and second half.

## 4. Hypotheses, expectation first (required)

Expectation: the whole-sample remainder is small (+0.05 ES, +0.04 NQ); a calm-only remainder is likely a little larger
in point estimate (the paper's direction) but with an interval that spans zero, because the sub-sample is half the size.

| # | Question | Pre-registered expectation |
|---|---|---|
| ES-calm | b_IV,calm > 0? | small and uncertain; interval includes 0 |
| NQ-calm | b_IV,calm > 0? | small to moderate; interval includes 0 and the +0.10 operational bar |
| — | **THE GATE** (each cell) | b_IV,calm ≥ +0.05; bootstrap 95% CI lower > 0; Holm p < 0.05 across the two cells; real b_IV,calm above **95%** of all-shift placebos |
| — | **THE MIRROR** | the same coefficient in **stress** sessions, and the placebo in calm (reported; not a gate) |

**Verdict rules (each cell):** `VALIDATED` if the gate holds. `NULL` if the gate fails **and** the 95% CI upper bound of
b_IV,calm < +0.10. `UNDERPOWERED` otherwise. The study-level word per instrument is the cell's word; ES and NQ are
banked as one id with both cells in `result` (the parent banked them together).

## 5. Power — what this design can and cannot find (required)

From the parent's whole-sample standard errors (ES 0.072, NQ 0.050 at n = 770) scaled to about half the sessions (×√2):
ES-calm SE ≈ 0.10, MDE ≈ 0.31; NQ-calm SE ≈ 0.071, MDE ≈ 0.21 (80% power, Holm α 0.025 two-sided, ×3.0 SE). Both are
above the +0.10 operational bar, so a NULL by the rule is essentially unreachable and the expected label is
**UNDERPOWERED by design**. The cell can only confirm a remainder of 0.21+ (NQ) or 0.31+ (ES), roughly 4-6 times the parent's
whole-sample remainder. The study's real output is the **interval and the calm-versus-stress contrast**, which is why the
descriptive rule for the difference is fixed above. The actual SEs are written into Amendment A1 (PRE-RESULTS) once the
calm sample size is known, before any short coefficient is read.

## 6. Multiplicity — how many cells, and the corrected bar (required)

Scored: two cells (ES-calm, NQ-calm), Holm at α 0.05. Descriptive and not corrected: stress mirror, difference,
interaction, sensitivities (three label variants, two halves). The split is a new subset of the parent's data, so it adds
**one** family of two tests to the seen-data family count (now six analyses). Fixed-cut and tercile variants are logged
here so they cannot be chosen after seeing results.

## 7. What this does NOT test (required)

Direction; tradability; the full Cboe book; overnight gaps as such (the target here is the parent's next-session DR, not the
overnight gap series of the paper); whether implied vol causes anything; the paper's out-of-sample Clark-West design;
anything after 2026-08-21.

## 8. What each verdict changes (required)

- `VALIDATED` (either cell): research-only; reopen a calm-regime gamma input to the range lines for that instrument, with |t| ≥ 3
  and unseen data required before live use. The terminal's "dealer gamma context" board is allowed to say "in calm VIX
  sessions".
- `NULL`: say so plainly: calm days do not rescue the CME gamma sign; close the calm-regime question on the CME book.
- `UNDERPOWERED` (expected): report the calm and stress coefficients with their intervals and the contrast; nothing reopens on the
  CME book; the question moves to the Cboe capture; the terminal does **not** print "gamma is informative in calm regimes".

## Amendments

### A1 — 2026-11-14 — PRE-RESULTS (calm sample sizes and design standard errors)
No calm-subsample coefficient had been computed. `scripts/gex-range-iv-calm/run.py --stage power` reads only the label counts and the design matrix; the residual SD is the parent whole-sample B1 fit (already banked), so no calm-subsample coefficient is read.

- **Sample:** 770 sessions each. The trailing-252 median had at least 126 prior observations for every session (none dropped). **ES:** 475 calm / 295 stress; short-gamma sessions 59 calm / 140 stress. **NQ:** 461 calm / 309 stress; short 87 calm / 143 stress.
- **Design SE and MDE (calm):** ES residual SD 0.476, design SE 0.088, **MDE 0.265**; NQ residual SD 0.417, design SE 0.062, **MDE 0.186** (×3.0 SE). Both exceed the +0.10 operational bar, so a NULL by the rule is out of reach; the expected label is UNDERPOWERED. With only 59 (ES) and 87 (NQ) short-gamma calm sessions the arm is thin; the +0.05 gate is far below the MDE.
- No other change.


### A2 — 2026-11-14 — POST-HOC (results seen; bookkeeping only)
The two scored cells came out with different registered verdict words (ES-calm NULL by the interval-upper-below-+0.10 rule, marginal at 0.0986; NQ-calm UNDERPOWERED), so they are banked as two ledger ids, `gex-range-iv-calm-es` and `gex-range-iv-calm-nq`, both with this prereg as `doc`. The calm-from-D (OI date) sensitivity listed in §3 was not run: the parent frame carries no separate OI-date IV column. This changes no scored number and promotes nothing.

## RESULTS
