# slow-bias-clock — results

Prereg: `forge/SLOW_BIAS_CLOCK_PREREG.md` (committed in `7809659e`, 2026-11-15; amendments A1, A2 inside it).
Run 2026-11-15, seed 20261115, B = 2000 (scored cells). Branch `claude/signal-bot-bias-analysis-bwr1qv`.
Ledger ids: `slow-bias-clock-dir`, `slow-bias-clock-r`, `slow-bias-clock-book`.
Scripts: `scripts/slow-bias-clock/run.py` (selftest + run), `scripts/slow-bias-clock/finalize.py` (A2).
Data: NY-close mid bars (OANDA D, 100% identical to M1-rebuilt NY closes on the overlap), 2002/2003/2006 → 2026-08-21;
bid/ask M1 2016-10 → 2026-08-21 for the R cells. Nothing after 2026-08-21 read (asserted).

## Verdict: `slow-bias-clock-dir` UNDERPOWERED · `slow-bias-clock-r` NULL · `slow-bias-clock-book` UNDERPOWERED

The vol-scaled 1/3/12-month trend blend (+ carry for FX) does not work as a **daily** bias. (i) Calibrated P(up) does
not beat the base rate B0 on any of the 6 direction cells. The FX cells are NULL: +1 −0.050% [−0.089, −0.012],
+5 −0.039% [−0.150, +0.078] against a 0.40% bar, and the positive control found the planted bar 100% of the time.
Gold and indices are UNDERPOWERED (the planted bar was found in 0-10% of plants). (ii) As the side of a 07:00-21:00
trade at 1σ risk it is no better than the 4h rule, ΔR −0.0025R [−0.022, +0.018], and no better than always-long,
ΔR −0.016R [−0.033, +0.0005]. Both cells are NULL against the 0.05R bar, and the planted bar was found 100%. (iii) As a
13-market equal-risk book held close to close over 21.6 years, it earns a net Sharpe of +0.24 [−0.15, +0.63]
(halves +0.34 / +0.13). This sits in the literature's post-2009 range and is slightly positive, but the design can only
see about 0.8 (UNDERPOWERED by design, §5). It is half the always-long book's Sharpe on the same markets (+0.48). Nothing
passes Holm (smallest adjusted p 0.11).

## Scored cells

| Cell | n (dates) | Estimate | 95% CI | Halves | Binding MDE | Bar | Placebo pct | Holm p | Pack diagnosis | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| dir +1 FX (b −0.0069) | 2761 | −0.050% | [−0.089%, −0.012%] | −0.004% / −0.095% | 0.170% | 0.400% | 46 | 0.113 | FLAT | **NULL** |
| dir +1 gold (b +0.0388) | 2745 | −0.299% | [−0.565%, +0.009%] | −0.304% / −0.294% | 0.514% | 0.400% | 94 | 0.250 | UNDERPOWERED | **UNDERPOWERED** |
| dir +1 indices (b −0.0046) | 2747 | −0.004% | [−0.015%, +0.007%] | −0.009% / +0.000% | 0.220% | 0.400% | 58 | 1.000 | UNDERPOWERED | **UNDERPOWERED** (A2: run said NULL) |
| dir +5 FX (b −0.0109) | 2757 | −0.039% | [−0.150%, +0.078%] | +0.045% / −0.124% | 0.390% | 0.400% | 91 | 1.000 | FLAT | **NULL** |
| dir +5 gold (b +0.0156) | 2741 | −1.356% | [−2.611%, −0.119%] | −1.184% / −1.529% | 2.227% | 0.400% | 87 | 0.224 | UNDERPOWERED | **UNDERPOWERED** |
| dir +5 indices (b −0.0609) | 2743 | −0.075% | [−0.384%, +0.189%] | −0.191% / +0.024% | 0.750% | 0.400% | 9 | 1.000 | UNDERPOWERED | **UNDERPOWERED** |
| ΔR SLOW − 4h rule | 2495 (31,735 entries) | −0.0025R | [−0.0221, +0.0177] | −0.0094 / +0.0043 | 0.047R | 0.05R | 2 | 1.000 | FLAT | **NULL** |
| ΔR SLOW − always-long | 2495 (31,735 entries) | −0.0162R | [−0.0329, +0.0005] | −0.0102 / −0.0221 | 0.047R | 0.05R | 0 | 0.357 | FLAT | **NULL** |
| Book net Sharpe | 5619 days (21.6 yr) | +0.24 | [−0.15, +0.63] | +0.34 / +0.13 | 0.79 | 0.30 | 50 | 1.000 | INCONCLUSIVE | **UNDERPOWERED** |

Direction statistic = Brier skill vs B0 (test 2016-01-04 → 2026-08-21, calibration fitted on labels ending before
2016). b = the fitted calibration slope on S. The registered mirror needs b > 0, and four of six came out negative, so
the fit window itself saw no trend-following relation in FX or indices. R = risk-weighted mean R per entry, spread
inside. Book = annualised net Sharpe (√252) of the daily equal-risk book with financing, 2005-01-03 → 2026-08-21.
p = two-sided normal from SE = max(bootstrap SE, placebo SD).

Raw R per entry (common days, net of spread): SLOW −0.030, 4h rule −0.028, always-long −0.014. The 4h baseline
reconciles with `exit-on-fixed-entries` E0 (−0.027) to 0.001R.

## Why — evidence

One evidence pack per cell, built with `scripts/evidence_pack/pack.py` in `evidence/<cell>/evidence/`. Each pack has
EVIDENCE.md, placebo/buckets/breakdown/plants charts and 30 sample rows to check by hand.

| Cell | Planted 0.5× / 1× / 2× bar detected | Mean recovered at 1× | Lookahead canary (clean → leaked) |
|---|---|---|---|
| dir +1 FX | 70% / 100% / 100% | +0.351% | −0.050% → +100% |
| dir +1 gold | 0% / 0% / 0% | +0.105% | −0.299% → +100% |
| dir +1 indices | 0% / 0% / 70% | +0.399% | −0.004% → +100% |
| dir +5 FX | 0% / 100% / 100% | +0.361% | −0.039% → +100% |
| dir +5 gold | 0% / 0% / 0% | −0.938% | −1.356% → +100% |
| dir +5 indices | 0% / 10% / 100% | +0.326% | −0.075% → +100% |
| ΔR SLOW − 4h | 90% / 100% / 100% | +0.0475R | −0.0025R → +0.666R |
| ΔR SLOW − long | 0% / 100% / 100% | +0.0338R | −0.0162R → +0.652R |
| Book Sharpe | 100% / 100% / 100% | +0.54 | +0.24 → +27.6 |

- **The positive control and the canary both work.** The pipeline recovers a planted bar-sized effect on the real rows.
  Feeding it the answer (tomorrow's sign) makes every estimate jump: BSS to 100%, ΔR to +0.65R, Sharpe to 27. A null
  from these cells is a measurement, not a broken test. The selftest (synthetic, outside the pipeline) agrees: a planted
  slow drift with oracle Sharpe ≈ 1 per market gives book Sharpe +1.97 [+1.52, +2.43] and +5 BSS +0.38%; the
  zero-drift twin gives −0.08 [−0.57, +0.38] and an interval spanning 0.
- **Labels (pack checklist):** the FX direction cells and both R cells are **FLAT**: the useful effect is ruled out and
  the planted one is found. Gold and index direction are **UNDERPOWERED**. Here the pack refits the calibration on
  every resample, and the slope noise alone hides a 0.4% skill. This is why A2 demoted dir +1 indices from NULL. The
  book is **INCONCLUSIVE**: its interval holds both 0 and the 0.3 bar.
- **Why the direction cells fail:** the fitted slopes are tiny and mostly the wrong sign (FX −0.007/−0.011, indices
  −0.005/−0.061). The literature's premium is about Sharpe 0.4 a year per market. At one day that is an IC of about
  0.025, a BSS of about 0.04%, ten times below the bar. The test window adds negative skill because B0 already carries
  the drift and the slope only adds noise. The gold +5 cell is −1.36% with a CI below 0: a positive slope fitted on
  2006-2015 then misfired out of sample (WRONG SIGN out of sample; underpowered, so not a finding).
- **Why the R cells fail:** the slow side and the 4h side agree on 60% of entries, and on the 40% where they differ
  neither wins. The trade's 14-hour window catches only intraday noise. The slow side's edge, if any, is in the
  overnight and multi-day path that this trade does not hold. On the placebo, the real ΔR sits at the 0-2nd percentile
  of shuffled sides. That shuffle is row-level, so its spread understates the block SE (lesson 2026-11-04). The
  bootstrap CI includes 0, so this is not read as a wrong-sign effect.
- **Why the book is only +0.24:** gross it is +0.30. Spreads take 0.06. The financing earned on the side held (mostly
  FX carry) adds about 0.11: the same book on spot returns only is +0.13. Long-term trend in FX loses on 4 of 9 pairs (USDCHF −0.33, USDCAD −0.29,
  GBPUSD −0.20). The yen crosses, gold and NAS100 carry it (GBPJPY +0.54, NAS100 +0.40, USDJPY +0.33, gold +0.25).
  Halves +0.34 → +0.13 repeat the decay `cot-trend-filter` saw (0.49 → 0.10). Post-publication (2013 →) it earns +0.20.
- **What it does well (descriptive):** it is uncorrelated with always-long (daily ρ +0.14). In the three named stress
  windows it made money while long lost: 2008-09 → 2009-03 +8.4% vs −6.8%, 2020-02 → 04 +1.8% vs −4.1%, 2022 +0.1%
  vs −2.8% (cumulative book return). The reversed book is −0.36 [−0.74, −0.004], so the sign is not arbitrary. The
  premium is real enough that flipping it costs, but too small to see on 13 markets.

## Controls and decomposition (descriptive, BH q = 0.10, 22 tests, 2 survive)

| Component used as the side | ΔR vs 4h (R alone) | BSS +1 (all 13) | BSS +5 (all 13) | Book Sharpe (halves) |
|---|---|---|---|---|
| T21 (1 month) | −0.002 (−0.030) | −0.029% | −0.060% | +0.10 (+0.24 / −0.05) |
| T63 (3 months) | −0.002 (−0.029) | −0.035% | −0.055% | +0.23 (+0.25 / +0.20) |
| T252 (12 months) | +0.004 (−0.024) | −0.030% | −0.069% | +0.19 (+0.23 / +0.14) |
| Trend blend (no carry) | +0.001 (−0.027) | −0.041% | −0.080% | +0.22 (+0.28 / +0.16) |
| Carry alone (FX) | +0.015 (−0.022) | **−0.113%** (BH) | **−0.209%** (BH) | −0.04 (−0.52 / +0.54) |
| S, size cut off | +0.000 (−0.027) | — | — | +0.27 (+0.28 / +0.26) |

- No component is a reusable candidate. Every part fails one of its own nulls or its halves.
- The two BH survivors are **negative**. Carry calibrated as a direction forecast fits a reversal slope in 2002-2015
  (b −0.12/−0.17) that then loses out of sample (2016 → rates diverged). This is the same regime split as
  `fx-factor-carry` / `fx-factor-book-v2` (carry book −0.52 before 2016, +0.54 after).
- **The size cut adds nothing.** Fast and slow disagree on 39% of entries. Trading full size anyway gives ΔR +0.000 vs
  −0.003 and book +0.27 vs +0.24.
- The 3-month leg is the steadiest (+0.25 / +0.20 by half). The 1-month leg is the one that died after 2016.
- R by group (SLOW / 4h / long): FX −0.050 / −0.037 / −0.030, gold −0.016 / −0.006 / −0.019, indices +0.025 /
  −0.006 / +0.040. On indices the slow side mostly says long (65% long overall), and long is better.
- Book variants: always-long +0.48 [+0.08, +0.92]; costs ×2 +0.18; gross +0.30; spot only (no financing) +0.13.
- Concentration: by year the book's Sharpe ranges −0.69 (2005) to +1.13 (2008). 12 of 22 years are positive.

## Deviations from the prereg

- **A1 (pack wiring, before any pack was read):** the direction packs now refit the calibration on each resample,
  plant and leak, and the pack paths were fixed. The packs use fewer resamples because the laptop was saturated by
  concurrent studies. Scored cells are unchanged (same seed, same numbers in both runs).
- **A2 (post-hoc, demote only):** a cell whose pack positive control finds the 1× plant in < 80% of plants cannot be
  NULL. dir +1 indices NULL → UNDERPOWERED. The ledger-id words are unchanged by it.
- Gold 21:00 bar missing on 179 of 2,545 days (US holiday sessions): counted, not imputed. Book annualised with √252
  (understates by ~1.6%). Pre-2017 spreads use the 2017 value; the costs ×2 sensitivity covers this.

## What this changes

- **The desk's daily bias does not become the slow clock.** It does not forecast tomorrow or the week better than the
  base rate in FX (a powered NULL), and nothing is shown for gold and indices. As the side of the 07:00 trade it is no
  better than the 4h rule or always-long. The card may *describe* the slow trend state ("12-month trend up, 1-month
  down"), never present it as a call. The "fast vs slow disagree → half size" rule is dropped: it changed nothing.
- **The 4h rule is not replaced on R grounds.** Both lose about −0.03R a trade net, so the bias question for the
  copier stays where `exit-on-fixed-entries` left it: timing and selection, not side.
- **As a book**, the slow clock is a small, uncorrelated, crisis-positive premium (+0.24 net, +0.30 gross), consistent
  with the literature's post-2009 0.3. It is not demonstrated on 13 markets. To judge it: a 60+ market futures panel
  from 1985 (MDE ≈ 0.3), or a forward record in `bias-scoreboard` / the paper book. It is a diversifier candidate
  beside long exposure, not a direction signal. The trend-following memory note stands: FX null; multi-asset ≈ 0.2-0.3.
- **What would reopen it:** a longer or wider panel (the book cell); a multi-day hold of the slow side with a
  vol-scaled stop (the R cell measured only the 14-hour window); a direction claim only with a horizon of weeks
  (20/60 closes), where the premium's IC is large enough to see.
