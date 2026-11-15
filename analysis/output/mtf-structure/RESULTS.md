# mtf-structure — results

Prereg: `forge/MTF_STRUCTURE_PREREG.md` (committed alone in `56705de1`, 2026-11-15, before any outcome was computed;
amendment A1 is PRE-RESULTS, mechanics only). Run 2026-11-15, seed 20261115, B = 2000, 200 whole-block outcome
shuffles, 1000 random-abstention draws, 40 plants per cell. Branch `claude/signal-bot-bias-analysis-bwr1qv`.
Ledger ids: `mtf-structure-ema`, `-swing`, `-hmm`, `-pullback`, `-conflict-ema`, `-conflict-hmm`.
13 instruments, OANDA mid M1 2016-01-04 → 2026-08-21 (lockbox asserted), test sessions 2018-01-02 → 2026-08-21
(2,237 dates). Outcome: 07:00 London → 07:00 London h sessions later (h = 1, 3, 5), scored as the hit-rate excess over
the point-in-time base rate B0.

## Verdict: UNDERPOWERED (all six families, by the registered family rule), and no cell comes near a pass

The registered family word is UNDERPOWERED for every family, because each family has at least one cell (the 3-day /
5-day cells, and every swing cell) whose planted bar-sized effect is found less than 80% of the time at the Holm-18
level, as the §5 power table predicted. But **no cell of the 18 passes anything**: 0/18 pass Holm (smallest Holm p
0.77), 16/18 point estimates are **negative** (the call does worse than the base rate), and the five cells that *are*
powered come back **NULL**: EMA alignment 24h −0.0034 [−0.0176, +0.0100]; HMM alignment 24h −0.0038 [−0.0153,
+0.0063] and 3d −0.0043 [−0.0219, +0.0127]; pullback 24h +0.0075 [−0.0115, +0.0254]; HMM conflict-as-no-view 24h
Δ −0.0026 [−0.0125, +0.0054]. Every upper bound sits below its bar (+0.03 hit-rate excess; +0.02 for Δ). The HMM does
**not** beat the named-state σ-chain (differences +0.001 to +0.005, every CI spanning 0). Conflict-as-no-view
**lowers** kept-day accuracy relative to calling the D1 side every day, at every horizon (Δ −0.003 to −0.013), at the
0th–27th percentile of random abstention at the same keep rate.

Per cell, by the registered rule: **NULL** ema h1, hmm h1, hmm h3, pullback h1, conflict-hmm h1; **UNDERPOWERED** the
other 13. Read the underpowered cells with their intervals: in most the CI already excludes the bar (e.g. EMA 5d
−0.023 [−0.047, −0.001], swing 5d −0.057 [−0.111, −0.006]), so a useful *positive* effect is ruled out even where
the registered power check could not certify the cell (description, not a verdict change).

## Scored cells

| Cell | rows (dates) | Estimate [95% CI] | bar | z | Holm p | halves H1 / H2 | noise q97.5 (pct) | vs named [CI] | planted 1x bar found | hit vs B0 hit | G1-G6 | Word |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ema|h1 | 8539 (2060) | -0.0034 [-0.0176, +0.0100] | +0.03 | -0.48 | 1.000 | -0.0065 / -0.0009 | +0.0153 (19) | — | 100% | 51.7% vs 52.0% | ✗✗✗✗✓✓ | **NULL** |
| ema|h3 | 8546 (2059) | -0.0142 [-0.0355, +0.0037] | +0.03 | -1.40 | 1.000 | -0.0191 / -0.0101 | +0.0213 (6) | — | 0% | 51.4% vs 52.9% | ✗✗✗✗✓✗ | **UNDERPOWERED** |
| ema|h5 | 8537 (2057) | -0.0226 [-0.0465, -0.0008] | +0.03 | -1.86 | 1.000 | -0.0330 / -0.0138 | +0.0243 (1) | — | 0% | 51.6% vs 53.8% | ✗✗✗✗✓✗ | **UNDERPOWERED** |
| swing|h1 | 558 (449) | -0.0258 [-0.0770, +0.0217] | +0.03 | -1.04 | 1.000 | -0.0447 / -0.0098 | +0.0443 (12) | — | 0% | 48.7% vs 51.3% | ✗✗✗✗✓✗ | **UNDERPOWERED** |
| swing|h3 | 558 (448) | -0.0399 [-0.0953, +0.0052] | +0.03 | -1.55 | 1.000 | -0.0410 / -0.0390 | +0.0464 (4) | — | 0% | 47.8% vs 51.8% | ✗✗✗✗✓✗ | **UNDERPOWERED** |
| swing|h5 | 558 (448) | -0.0573 [-0.1114, -0.0063] | +0.03 | -2.03 | 0.765 | -0.0459 / -0.0671 | +0.0552 (1) | — | 0% | 46.8% vs 52.5% | ✗✗✗✗✓✗ | **UNDERPOWERED** |
| hmm|h1 | 13401 (2237) | -0.0038 [-0.0153, +0.0063] | +0.03 | -0.69 | 1.000 | -0.0025 / -0.0048 | +0.0102 (9) | +0.0013 [-0.0125, +0.0139] | 100% | 52.0% vs 52.4% | ✗✗✗✗✗✓ | **NULL** |
| hmm|h3 | 13403 (2235) | -0.0043 [-0.0219, +0.0127] | +0.03 | -0.48 | 1.000 | -0.0091 / -0.0008 | +0.0142 (9) | +0.0032 [-0.0158, +0.0192] | 80% | 53.1% vs 53.5% | ✗✗✗✗✗✓ | **NULL** |
| hmm|h5 | 13387 (2233) | -0.0085 [-0.0301, +0.0123] | +0.03 | -0.77 | 1.000 | -0.0217 / +0.0009 | +0.0142 (6) | -0.0014 [-0.0228, +0.0171] | 0% | 53.9% vs 54.7% | ✗✗✗✗✗✗ | **UNDERPOWERED** |
| pullback|h1 | 5196 (1765) | +0.0075 [-0.0115, +0.0254] | +0.03 | +0.80 | 1.000 | -0.0027 / +0.0161 | +0.0185 (70) | — | 100% | 51.9% vs 51.2% | ✗✗✗✗✓✓ | **NULL** |
| pullback|h3 | 5194 (1763) | -0.0024 [-0.0269, +0.0225] | +0.03 | -0.19 | 1.000 | +0.0011 / -0.0053 | +0.0270 (33) | — | 0% | 51.4% vs 51.7% | ✗✗✗✗✓✗ | **UNDERPOWERED** |
| pullback|h5 | 5196 (1763) | +0.0007 [-0.0289, +0.0314] | +0.03 | +0.05 | 1.000 | +0.0052 / -0.0030 | +0.0344 (46) | — | 0% | 52.3% vs 52.3% | ✗✗✗✗✓✗ | **UNDERPOWERED** |
| conflict-ema|h1 | 8539 (2060) | -0.0027 [-0.0138, +0.0084] | +0.02 | -0.47 | 1.000 | -0.0078 / +0.0017 | +0.0088 (27) | — | 57% | 51.7% vs 52.0% | ✗✗✗✗✓✗ | **UNDERPOWERED** |
| conflict-ema|h3 | 8546 (2059) | -0.0064 [-0.0243, +0.0093] | +0.02 | -0.75 | 1.000 | -0.0116 / -0.0020 | +0.0091 (6) | — | 0% | 51.4% vs 52.9% | ✗✗✗✗✓✗ | **UNDERPOWERED** |
| conflict-ema|h5 | 8537 (2057) | -0.0125 [-0.0330, +0.0062] | +0.02 | -1.25 | 1.000 | -0.0227 / -0.0040 | +0.0091 (0) | — | 0% | 51.6% vs 53.8% | ✗✗✗✗✓✗ | **UNDERPOWERED** |
| conflict-hmm|h1 | 13401 (2237) | -0.0026 [-0.0125, +0.0054] | +0.02 | -0.59 | 1.000 | -0.0017 / -0.0032 | +0.0064 (11) | +0.0035 [-0.0112, +0.0165] | 100% | 52.0% vs 52.4% | ✗✗✗✗✗✓ | **NULL** |
| conflict-hmm|h3 | 13403 (2235) | -0.0032 [-0.0163, +0.0083] | +0.02 | -0.50 | 1.000 | -0.0083 / +0.0005 | +0.0064 (7) | +0.0037 [-0.0150, +0.0194] | 30% | 53.1% vs 53.5% | ✗✗✗✗✗✗ | **UNDERPOWERED** |
| conflict-hmm|h5 | 13387 (2233) | -0.0039 [-0.0211, +0.0106] | +0.02 | -0.49 | 1.000 | -0.0158 / +0.0043 | +0.0059 (7) | +0.0049 [-0.0175, +0.0237] | 0% | 53.9% vs 54.7% | ✗✗✗✗✗✗ | **UNDERPOWERED** |

Families: `mtf-structure-ema` **UNDERPOWERED**, `mtf-structure-swing` **UNDERPOWERED**, `mtf-structure-hmm` **UNDERPOWERED**, `mtf-structure-pullback` **UNDERPOWERED**, `mtf-structure-conflict-ema` **UNDERPOWERED**, `mtf-structure-conflict-hmm` **UNDERPOWERED**

## Benchmarks

| Benchmark | h1 | h3 | h5 |
|---|---|---|---|
| named | -0.0051 [-0.0199, +0.0086] | -0.0075 [-0.0274, +0.0118] | -0.0071 [-0.0334, +0.0183] |
| conflict-named | -0.0062 [-0.0169, +0.0053] | -0.0068 [-0.0219, +0.0074] | -0.0088 [-0.0278, +0.0111] |
| hmm_smooth | +0.0100 [-0.0008, +0.0208] | +0.0116 [-0.0050, +0.0278] | +0.0035 [-0.0177, +0.0233] |
| conflict-hmm-smooth | +0.0007 [-0.0093, +0.0094] | -0.0006 [-0.0133, +0.0108] | -0.0069 [-0.0221, +0.0063] |

## Coverage (share of test instrument-sessions called / kept)

ema 29.6%, swing 2.1%, hmm 46.3%, named 24.8%, hmm_smooth 46.3%, pullback 18.1%, conflict-ema 29.4%, conflict-hmm 46.1%, conflict-named 24.6%, conflict-hmm-smooth 46.1%


G1 Holm · G2 bar · G3 both halves positive · G4 above the noise 97.5th percentile (outcome shuffle F1–F4, random
abstention F5–F6) · G5 HMM beats named chain (F3, F6 only; ✓ = not applicable elsewhere) · G6 planted control ≥ 80%.

## Controls

- **Selftest (synthetic, before any real outcome)**: planted +0.06 alignment recovered (+0.063 [+0.052, +0.080],
  z 7.7); null not flagged (z 0.73); planted abstention Δ recovered (+0.062 vs random 97.5th +0.009); forward filter =
  hmmlearn posterior at the last observation (diff 1e-12); filtered probabilities unchanged when the future is
  perturbed (smoothed moved up to 0.36); smoothed next-observation accuracy beats filtered by +5.1 pp (the leak is
  visible); on synthetic M1, perturbing every bar after 07:00 London left every EMA / swing / HMM / named state on and
  before that date unchanged (the smoothed W1 state changed: it reads the future).
- **Outcome shuffle** (whole 21-session date blocks): real estimates at the 1st–70th percentile; none above the 97.5th.
- **Random abstention** (F5/F6): band centred at +0.000 to +0.001; real Δ at the 0.3rd–27th percentile (EMA 5d below
  the 2.5th: filtering on conflict is worse than dropping days at random).
- **Planted control on the real rows** (bar-sized hit-rate gain by flipping wrong calls): recovered +0.029 to +0.031 on
  every cell, so the pipeline sees what is planted; detection at the Holm-18 level ≥ 80% only for ema h1, hmm h1/h3,
  pullback h1, conflict-hmm h1.
- **Smoothed-HMM leak canary**: smoothed alignment +0.010 [−0.001, +0.021] at 24h vs filtered −0.004. The lookahead is
  visible but small, because the HMM's direction is mostly the sign of the fold's drift (Why, point 3).
- **Concentration**: 0 of 234 positive instrument slices pass BH q = 0.10.

## Why — evidence

Evidence packs (one per family, 24h; `scripts/evidence_pack/pack.py`), each with `EVIDENCE.md`, `evidence.json`,
`sample_rows.csv` and four charts:

| Family | Diagnosis label (pack checklist) | Pack estimate [CI] | Planted 0.5× / 1× / 2× found | Leak canary (leak / clean) | Charts |
|---|---|---|---|---|---|
| ema | **FLAT**: test could see a useful effect, interval rules it out | −0.0034 [−0.0161, +0.0097] | 5% / 100% / 100% | +0.498 / −0.003 (tomorrow's sign) | [placebo](ema/evidence/placebo.png) · [buckets](ema/evidence/buckets.png) · [breakdown](ema/evidence/breakdown.png) · [plants](ema/evidence/plants.png) |
| swing | **UNDERPOWERED**: cannot reliably see the useful size | −0.0258 [−0.0764, +0.0188] | 0% / 0% / 0% | +0.501 / −0.026 | [placebo](swing/evidence/placebo.png) · [buckets](swing/evidence/buckets.png) · [breakdown](swing/evidence/breakdown.png) · [plants](swing/evidence/plants.png) |
| hmm | **FLAT** | −0.0038 [−0.0137, +0.0064] | 78% / 100% / 100% | +0.008 / −0.004 (smoothed-HMM side) | [placebo](hmm/evidence/placebo.png) · [buckets](hmm/evidence/buckets.png) · [breakdown](hmm/evidence/breakdown.png) · [plants](hmm/evidence/plants.png) |
| pullback | **FLAT** | +0.0075 [−0.0095, +0.0245] | 100% / 100% / 100% | +0.498 / +0.008 | [placebo](pullback/evidence/placebo.png) · [buckets](pullback/evidence/buckets.png) · [breakdown](pullback/evidence/breakdown.png) · [plants](pullback/evidence/plants.png) |
| conflict-ema | **FLAT** | −0.0027 [−0.0125, +0.0082] | 0% / 100% / 100% | +0.351 / −0.003 | [placebo](conflict-ema/evidence/placebo.png) · [buckets](conflict-ema/evidence/buckets.png) · [breakdown](conflict-ema/evidence/breakdown.png) · [plants](conflict-ema/evidence/plants.png) |
| conflict-hmm | **FLAT** | −0.0026 [−0.0107, +0.0056] | 10% / 100% / 100% | +0.001 / −0.003 (smoothed-HMM side) | [placebo](conflict-hmm/evidence/placebo.png) · [buckets](conflict-hmm/evidence/buckets.png) · [breakdown](conflict-hmm/evidence/breakdown.png) · [plants](conflict-hmm/evidence/plants.png) |

The pack's plant adds drift to the real excess and tests at a single-test level, so its 24h detection is higher than
the registered Holm-18 plant; the registered cell words use the stricter one.

What the evidence says, in order of weight:
1. **The alignment call is right about as often as the base rate, and slightly less.** EMA-aligned days hit 51.7%
   vs B0's 52.0% at 24h and 51.6% vs 53.8% at 5d. The shortfall sits where B0 is strong (indices 53.6% vs 55.3%): when
   all four timeframes point down on an index, the call fights the drift B0 already has. In FX the EMA cell is +0.001
   at 24h.
2. **Conflict-as-no-view keeps worse days, not better.** Keeping only aligned days lowers the D1 call's excess at every
   horizon (Δ −0.003 / −0.006 / −0.013), and at 5d it is below 99.7% of random abstentions at the same 29.5% keep rate.
   "Every timeframe agrees" is a late-trend state; the next 1–5 days are, if anything, slightly more mean-reverting.
3. **The HMM direction is mostly the fold's drift.** Share of sessions with an "up" HMM direction: GOLD 95–100% on
   every timeframe, NAS100 / SPX500 / US30 64–96%, GBPUSD D1 10%, USDCAD W1 15%. Held-out likelihood chose K = 3 for
   100% of H1 and 95% of H4 fits but 29% of W1 fits; implied dwell ≈ 3–5 bars on H4/H1. So the filtered one-step mean
   is a slow drift sign plus a fast variance switch. That is why it aligns on 46% of sessions, why smoothing (which
   reads the future) moves the 24h estimate only +1.4 pp, and why it is no better than the explicit named σ-chain
   (HMM − named +0.001 [−0.013, +0.014] at 24h). It matches `gr-hmm-trend-direction` and "HMM = variance, not
   direction".
4. **The pullback (buy the dip in the higher-timeframe trend) is flat in FX and indices.** Its only positive slice is
   gold (3d +0.094 [+0.031, +0.159], 61.6% vs 52.3%, 352 instrument-days): one of 9 group slices and not BH-significant
   at the instrument level. A candidate for its own prereg on fresh data at most.
5. **Swing alignment is too rare to judge** (2.1% of instrument-sessions, 558 rows on 449 dates), and what there is
   points the wrong way (5d −0.057 [−0.111, −0.006]; gold 33% hit on 42 rows).
6. **Mirror (alignment against the trend)** is the sign flip of F1–F3: +0.003 to +0.057, never Holm-significant
   (|z| ≤ 2.03, Holm p ≥ 0.77). Not a fade signal either. The pullback's mirror (the lower timeframe continues) is
   −0.008 at 24h.

**Benchmarks.** Named σ-chain alignment −0.005 / −0.008 / −0.007 (all CIs span 0). bias-learner (banked; its targets
end at 21:00 London, so the comparison is approximate): FX top-20% accuracy 0.538 / 0.546 / 0.540 / 0.547 (21:00 / +1 /
+3 / +5) vs B0 0.539–0.565. The same picture: neither the learner over continuous MTF slopes nor discrete alignment
states beat the base rate on direction.

## Deviations from the prereg

Amendment A1 (PRE-RESULTS): the selftest synthetic history was lengthened and `N_W1` exempted from its emptiness check;
thread pools set to 1 and states cached per instrument after the first (states-only) attempt ran at ~2.4 h per
instrument on the shared CPU. No definition, statistic, bar or gate changed. Stated consequence: `N_W1` is undefined
until ~2018-05, so the named chain aligns less in 2018. The bias-learner comparison is read from its RESULTS.md (the
runner's automatic extraction found no matching keys in its results.json).

## Descriptive (not part of the verdict)

### By asset group (descriptive)

| family | h | group | n | est [95% CI] | hit | B0 hit |
|---|---|---|---|---|---|---|
| ema | 1 | fx | 5397 | +0.0013 [-0.0164, +0.0176] | 50.8% | 50.6% |
| ema | 1 | gold | 691 | +0.0072 [-0.0242, +0.0416] | 52.2% | 51.5% |
| ema | 1 | idx | 2451 | -0.0168 [-0.0433, +0.0068] | 53.6% | 55.3% |
| ema | 3 | fx | 5400 | -0.0168 [-0.0438, +0.0068] | 49.0% | 50.7% |
| ema | 3 | gold | 690 | +0.0036 [-0.0598, +0.0587] | 52.9% | 52.5% |
| ema | 3 | idx | 2456 | -0.0136 [-0.0524, +0.0185] | 56.4% | 57.8% |
| ema | 5 | fx | 5394 | -0.0211 [-0.0510, +0.0084] | 48.8% | 50.9% |
| ema | 5 | gold | 690 | -0.0122 [-0.0804, +0.0453] | 53.5% | 54.7% |
| ema | 5 | idx | 2453 | -0.0288 [-0.0749, +0.0031] | 57.2% | 60.0% |
| swing | 1 | fx | 373 | -0.0167 [-0.0779, +0.0343] | 48.8% | 50.5% |
| swing | 1 | gold | 42 | -0.1492 [-0.3053, -0.0035] | 35.7% | 50.6% |
| swing | 1 | idx | 143 | -0.0134 [-0.1207, +0.0761] | 52.4% | 53.8% |
| swing | 3 | fx | 373 | -0.0322 [-0.0984, +0.0300] | 47.2% | 50.4% |
| swing | 3 | gold | 42 | -0.0826 [-0.2707, +0.0749] | 42.9% | 51.1% |
| swing | 3 | idx | 143 | -0.0475 [-0.1595, +0.0415] | 51.0% | 55.8% |
| swing | 5 | fx | 373 | -0.0330 [-0.0988, +0.0305] | 47.5% | 50.8% |
| swing | 5 | gold | 42 | -0.1833 [-0.3554, -0.0192] | 33.3% | 51.7% |
| swing | 5 | idx | 143 | -0.0838 [-0.1930, +0.0049] | 49.0% | 57.3% |
| hmm | 1 | fx | 7021 | -0.0006 [-0.0173, +0.0121] | 50.7% | 50.8% |
| hmm | 1 | gold | 2052 | +0.0085 [-0.0124, +0.0302] | 52.5% | 51.6% |
| hmm | 1 | idx | 4328 | -0.0149 [-0.0380, +0.0053] | 54.0% | 55.5% |
| hmm | 3 | fx | 7025 | -0.0013 [-0.0233, +0.0198] | 51.0% | 51.1% |
| hmm | 3 | gold | 2049 | +0.0203 [-0.0116, +0.0512] | 54.6% | 52.6% |
| hmm | 3 | idx | 4329 | -0.0209 [-0.0537, +0.0098] | 55.7% | 57.8% |
| hmm | 5 | fx | 7013 | -0.0021 [-0.0319, +0.0256] | 50.9% | 51.1% |
| hmm | 5 | gold | 2048 | +0.0141 [-0.0254, +0.0526] | 56.7% | 55.3% |
| hmm | 5 | idx | 4326 | -0.0295 [-0.0703, +0.0079] | 57.2% | 60.2% |
| pullback | 1 | fx | 3730 | +0.0031 [-0.0169, +0.0217] | 50.7% | 50.4% |
| pullback | 1 | gold | 352 | +0.0403 [-0.0076, +0.0937] | 55.4% | 51.4% |
| pullback | 1 | idx | 1114 | +0.0121 [-0.0273, +0.0544] | 55.0% | 53.8% |
| pullback | 3 | fx | 3730 | -0.0065 [-0.0344, +0.0221] | 49.8% | 50.5% |
| pullback | 3 | gold | 352 | +0.0937 [+0.0308, +0.1592] | 61.6% | 52.3% |
| pullback | 3 | idx | 1112 | -0.0190 [-0.0728, +0.0378] | 53.7% | 55.6% |
| pullback | 5 | fx | 3732 | -0.0017 [-0.0320, +0.0325] | 50.4% | 50.6% |
| pullback | 5 | gold | 352 | +0.0688 [-0.0009, +0.1386] | 61.1% | 54.2% |
| pullback | 5 | idx | 1112 | -0.0127 [-0.0784, +0.0506] | 56.0% | 57.3% |
| conflict-ema | 1 | fx | 5397 | +0.0032 [-0.0109, +0.0182] | 50.8% | 50.6% |
| conflict-ema | 1 | gold | 691 | -0.0144 [-0.0407, +0.0182] | 52.2% | 51.5% |
| conflict-ema | 1 | idx | 2451 | -0.0121 [-0.0318, +0.0049] | 53.6% | 55.3% |
| conflict-ema | 3 | fx | 5400 | -0.0049 [-0.0264, +0.0152] | 49.0% | 50.7% |
| conflict-ema | 3 | gold | 690 | -0.0326 [-0.0818, +0.0075] | 52.9% | 52.5% |
| conflict-ema | 3 | idx | 2456 | -0.0032 [-0.0327, +0.0251] | 56.4% | 57.8% |
| conflict-ema | 5 | fx | 5394 | -0.0093 [-0.0334, +0.0137] | 48.8% | 50.9% |
| conflict-ema | 5 | gold | 690 | -0.0409 [-0.0967, +0.0031] | 53.5% | 54.7% |
| conflict-ema | 5 | idx | 2453 | -0.0110 [-0.0458, +0.0180] | 57.2% | 60.0% |
| conflict-hmm | 1 | fx | 7021 | +0.0009 [-0.0142, +0.0117] | 50.7% | 50.8% |
| conflict-hmm | 1 | gold | 2052 | -0.0007 [-0.0056, +0.0044] | 52.5% | 51.6% |
| conflict-hmm | 1 | idx | 4328 | -0.0111 [-0.0256, +0.0003] | 54.0% | 55.5% |
| conflict-hmm | 3 | fx | 7025 | +0.0012 [-0.0166, +0.0163] | 51.0% | 51.1% |
| conflict-hmm | 3 | gold | 2049 | +0.0031 [-0.0039, +0.0104] | 54.6% | 52.6% |
| conflict-hmm | 3 | idx | 4329 | -0.0177 [-0.0354, -0.0032] | 55.7% | 57.8% |
| conflict-hmm | 5 | fx | 7013 | +0.0019 [-0.0238, +0.0247] | 50.9% | 51.1% |
| conflict-hmm | 5 | gold | 2048 | +0.0040 [-0.0033, +0.0114] | 56.7% | 55.3% |
| conflict-hmm | 5 | idx | 4326 | -0.0185 [-0.0404, -0.0012] | 57.2% | 60.2% |

Instrument slices: 0 of 234 positive slices pass BH q = 0.10.


### By year (estimate, descriptive)

| family | h | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|---|---|---|---|
| ema | 1 | -0.027 | +0.016 | +0.013 | -0.034 | +0.026 | -0.005 | +0.012 | -0.009 | -0.050 |
| ema | 3 | -0.033 | -0.009 | -0.003 | -0.036 | +0.024 | -0.010 | +0.016 | -0.042 | -0.065 |
| ema | 5 | -0.059 | -0.019 | -0.000 | -0.061 | +0.020 | +0.012 | +0.011 | -0.052 | -0.093 |
| swing | 1 | -0.156 | +0.123 | -0.002 | -0.136 | +0.085 | -0.041 | -0.137 | +0.009 | -0.008 |
| swing | 3 | -0.044 | +0.001 | +0.014 | -0.130 | +0.030 | -0.068 | +0.021 | -0.109 | -0.106 |
| swing | 5 | -0.071 | +0.102 | -0.068 | -0.109 | +0.044 | -0.066 | -0.042 | -0.202 | -0.115 |
| hmm | 1 | -0.027 | +0.013 | +0.015 | +0.001 | -0.034 | -0.010 | +0.017 | -0.005 | -0.003 |
| hmm | 3 | -0.043 | +0.005 | +0.013 | +0.002 | -0.062 | -0.007 | +0.027 | +0.009 | +0.013 |
| hmm | 5 | -0.061 | +0.026 | -0.009 | -0.022 | -0.081 | +0.017 | +0.034 | +0.014 | -0.005 |
| pullback | 1 | -0.004 | -0.009 | -0.004 | +0.007 | +0.040 | -0.001 | +0.016 | +0.003 | +0.018 |
| pullback | 3 | +0.001 | -0.039 | +0.029 | +0.014 | +0.015 | -0.035 | -0.041 | +0.024 | +0.017 |
| pullback | 5 | -0.004 | -0.016 | +0.069 | -0.030 | +0.006 | -0.046 | -0.059 | +0.056 | +0.047 |
| conflict-ema | 1 | -0.025 | +0.020 | +0.003 | -0.035 | +0.012 | +0.014 | +0.011 | -0.006 | -0.042 |
| conflict-ema | 3 | -0.032 | +0.019 | -0.017 | -0.020 | +0.020 | +0.004 | +0.032 | -0.040 | -0.046 |
| conflict-ema | 5 | -0.053 | +0.008 | -0.024 | -0.029 | +0.010 | +0.028 | +0.037 | -0.053 | -0.070 |
| conflict-hmm | 1 | -0.019 | +0.014 | +0.005 | +0.006 | -0.021 | +0.004 | +0.003 | -0.011 | -0.003 |
| conflict-hmm | 3 | -0.039 | +0.009 | +0.007 | +0.004 | -0.044 | -0.008 | +0.013 | +0.007 | +0.021 |
| conflict-hmm | 5 | -0.045 | +0.023 | -0.003 | -0.018 | -0.055 | +0.019 | +0.017 | +0.010 | +0.010 |

### State behaviour (descriptive)

Flip rate per session (share of sessions whose state differs from the previous session):

T_W1 0.00, T_D1 0.02, T_H4 0.11, T_H1 0.31, S_W1 0.03, S_D1 0.13, S_H4 0.56, S_H1 0.65, H_W1 0.02, H_D1 0.07, H_H4 0.17, H_H1 0.16, N_W1 0.01, N_D1 0.07, N_H4 0.19, N_H1 0.37

HMM fits: 468; share choosing K = 3 on held-out likelihood: W1 29%, D1 67%, H4 95%, H1 100%; median implied dwell (bars): W1 15, D1 17, H4 3, H1 5

### Sigma-scaled move on called / kept rows (descriptive, mean side x move / sigma_day)

ema|h1 +0.020, ema|h3 +0.010, ema|h5 +0.056, swing|h1 -0.042, swing|h3 -0.097, swing|h5 -0.216, hmm|h1 +0.012, hmm|h3 +0.047, hmm|h5 +0.083, pullback|h1 +0.008, pullback|h3 +0.021, pullback|h5 +0.070, conflict-ema|h1 +0.020, conflict-ema|h3 +0.010, conflict-ema|h5 +0.056, conflict-hmm|h1 +0.012, conflict-hmm|h3 +0.047, conflict-hmm|h5 +0.083


Sessions dropped for no 07:00–07:04 London bar: 17–18 per FX pair and gold, 23 NAS100 / US30, 42 SPX500
(`load_info.json`). HMM fit metadata per instrument × timeframe × year: `hmm_meta.json`. The σ-scaled move on
called rows is positive for some cells (e.g. EMA 5d +0.056σ) while the hit-rate excess is negative: that is the index
and gold drift the call shares with B0, not skill.

## What this changes

- **The morning card must not present multi-timeframe alignment as a direction call** at 24h, 3d or 5d: EMA, swing
  or HMM. "All timeframes up" describes the trend so far; its next-day hit rate is at or slightly below the base rate.
- **"Timeframe conflict = no view" is not an accuracy filter.** Standing aside on conflict does not raise the kept-day
  hit rate (it lowers it slightly). Abstention can still be a risk choice, but the card must not say aligned days are
  better days.
- **HMM direction states** stay out of direction (consistent with `gr-hmm-trend-direction`): they carry the drift sign
  and a variance switch and do not beat a readable named σ-chain. If an HMM is kept, use it for variance / range
  (`model-audits` Q1, label stability, is still open).
- **Underpowered parts, and what would make them testable**: the 3d/5d cells and swing alignment need ~2–3× the
  independent sample (the 28-pair FX universe, pre-2016 M1) or a forward record. With point estimates negative almost
  everywhere, the expected value of that extra power is low. The one open thread is **gold pullback-in-trend at 3–5
  days** (above), which needs its own prereg on data not used here.
- Nothing is promoted. No page or bot changes beyond the wording rules above.
