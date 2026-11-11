# wall-dte-style — results

Prereg: `oi_research_book/WALL_DTE_STYLE_PREREG.md` (registered 2026-10-27 in `3dd483e8`; PRE-RESULTS amendments A1-A3
committed in `fce5a696` on 2026-11-11, before any race outcome was computed). Run 2026-11-11, seed 20261027, B = 2,000
(instrument, ISO week) cluster resamples. Branch `main`. Script `oi_research_book/scripts/30_wall_dte_style.py`
(`build` → `count` → `score`), output `oi_research_book/data/results/wall_dte_style.json`.
Ledger ids: `wall-dte-style-h1`, `wall-dte-style-h2`, `wall-dte-style-h3-fx`, `wall-dte-style-h3-idx`.

## Verdict: H1 UNDERPOWERED · H2 UNDERPOWERED · H3 NULL (FX/gold), UNDERPOWERED (NQ+SPX) · H4 not scored

No cell of (DTE bucket, gamma sign) makes a strong wall break or bounce differently from its listed neighbours by the
registered 3 pp. Pooled over every strong wall, walls break at about the neighbours' rate (FX/gold −2.8 pp, NQ+SPX
+1.7 pp; distance-matched −2.9 / +2.6). Nothing passes its gate, nothing survives BH q = 0.10, and the mirror (the
expected-move edge, an IV-style ruler) passes its own gate on long-gamma days in both samples (+3.1 and +5.2 pp). So the
grid placebo is itself biased by about 3-5 pp in this geometry, and no wall difference of that size could be read as
wall-specific anyway.

## Scored cells

Statistic: wall break rate minus placebo break rate over resolved touches, in pp. Pass bar: |diff| ≥ 3 pp in the
hypothesised direction, CI excludes 0, same sign in both date halves, instrument rule, ≥ 400 distinct days, BH q 0.10.
MDE = 2.8 × bootstrap SE.

| Test | Sample | n wall / placebo (resolved) | days | Wall break | Placebo break | Diff | 95% CI | MDE | p | Halves | Inst. rule | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| H1 near-DTE (0-7), long gamma: below placebo | FX/gold | 985 / 264 | 489 | 54.4% | 57.2% | −2.8 | [−8.9, +3.8] | 9.0 | 0.20 | −2.0 / −3.3 | 3 of 7 | **UNDERPOWERED** (MDE 9 > 3) |
| H1 | NQ+SPX | 256 / 215 | **97** | 56.2% | 51.6% | +4.6 | [−4.3, +13.8] | 12.8 | 0.85 | +1.5 / +6.0 | 0 of 2 | **UNDERPOWERED** (97 < 400) |
| H2 far-only (8+, no near wall), long gamma: two-sided | FX/gold | 2,416 / 1,193 | 1,175 | 49.5% | 51.8% | −2.3 | [−5.6, +1.1] | 4.7 | 0.18 | +0.7 / −3.7 | 4 of 7 | **UNDERPOWERED** (CI holds −3; mirror passes) |
| H2 | NQ+SPX | 1,029 / 1,485 | 661 | 52.3% | 51.3% | +1.0 | [−2.9, +5.0] | 5.8 | 0.64 | +2.1 / +0.2 | 2 of 2 | **UNDERPOWERED** (CI holds +3; mirror passes) |
| H3 short gamma, any DTE: above placebo | FX/gold | 2,571 / 802 | 1,197 | 49.9% | 52.2% | −2.4 | [−6.5, +1.6] | 5.7 | 0.88 | −0.2 / −4.9 | 1 of 7 | **NULL** (wrong sign; CI excludes +3) |
| H3 | NQ+SPX | 776 / 1,199 | **397** | 55.2% | 51.3% | +3.9 | [−0.1, +8.0] | 5.8 | 0.027 | +4.6 / +3.1 | 2 of 2 | **UNDERPOWERED** (397 < 400; CI touches 0; BH fails) |
| H4 hour interaction | — | — | — | — | — | — | — | — | — | — | — | not scored (needs H1 or H3 to pass) |

Per instrument (diff pp, resolved wall n). H1 FX/gold: EUR +3.3 (128), GBP +4.6 (131), AUD +0.8 (169), CAD +22.5 (132),
CHF −9.7 (111), JPY −2.0 (145), gold −12.6 (169). H2 FX/gold: EUR −6.4, GBP +2.1, AUD +3.0, CAD −9.4, CHF −4.8, JPY +2.3,
gold −3.0; NQ +1.8, SPX +0.1. H3: EUR −5.1, GBP −7.0, AUD +4.6, CAD −15.3, CHF −0.5, JPY −2.1, gold n = 15 (gold's book is
long gamma on 778 of 889 sessions); NQ +2.3, SPX +5.5.

BH q = 0.10 over the six tests: none survives (smallest p 0.027, IDX H3; its BH threshold is 0.017).

## Controls

- **Mirror (expected-move edge, open ± 1 NY-close σ, same race, same gate, same gamma-sign days).** Long-gamma days:
  FX/gold edge 53.2% vs its placebos 50.1%, +3.1 pp [+0.6, +5.6], halves +1.5 / +4.6. That passes the two-sided H2
  gate (5 of 7 instruments). NQ+SPX: +5.2 pp [+1.6, +9.1], both halves, both instruments, so it passes too. Short-gamma
  days: FX/gold +0.6 [−1.9, +3.1], NQ+SPX +3.0 [−1.7, +7.7], neither passes. **The registered rule says a passing mirror
  means the detector is broken.** Here that means the ±1/±2-increment grid placebo is not neutral to ~3-5 pp. On the
  NQ+SPX short-gamma days the wall's +3.9 pp is the same size as the mirror's +3.0 pp, so even that near-miss is not
  wall-specific.
- **H2 stacked vs far-only (registered paired gate, descriptive).** FX/gold: on 588 days with both, stacked walls break
  49.6% (n 1,230) and far-only 48.8% (n 1,325). NQ+SPX: 124 days, 55.9% vs 55.3%. Far-only walls are no different from
  stacked ones.
- **Unresolved share.** Walls 4.0% / 5.1%, placebos 4.1% / 6.2%, mirror 5.0% / 7.3% (FX/gold / NQ+SPX). No scored test
  drops more than 7%. 39 of 256 map cells (mostly small late-hour cells) are flagged > 20%. 59 ambiguous same-bar races
  of 53,190 touches are counted as unresolved.
- **Distance from the open (POST-HOC, describe only).** Pooled strong walls vs their placebos, break rate matched on
  |level − open| / σ bins: FX/gold −2.8 raw, −2.9 matched; NQ+SPX +1.7 raw, +2.6 matched. Wall and placebo median
  distances: 0.50 / 0.48 σ (FX/gold) and 0.46 / 0.61 σ (NQ+SPX).

## Deviations from the prereg

- Amendments A1-A3 (PRE-RESULTS, `fce5a696`): the basis + call/put-swap rebuild, publish-honest timing (book D used
  from session D+2), the gamma and neutral-band mechanics, SPX/gold placebo steps of 25, "days" = distinct dates, the
  mirror ruler = open ± 1 NY-close σ, the count-first n per cell, and the owner's local-gamma CONTEXT cut.
- **A4 (POST-HOC, results seen): a bug in my own first run, fixed before anything was written up.** Run 1 dropped
  untouched levels *before* choosing each population. Placebos were therefore kept only on sessions where their parent
  wall had been touched, which conditions on price having reached the wall. Their break rates rose to 60-64% and gave
  wall-minus-placebo gaps of −7.1 (FX/gold H1), −13.6 / −11.9 (H2) and −10.2 / −4.4 (H3), with H2 "passing" its gate.
  The tell was that pooling all strong walls without that selection gave only −2.8 pp. Run 2 selects placebos as the
  prereg defines them (each real wall's neighbours on the same day, touched or not). Only run 2 is scored. This can
  only demote: nothing that was run-1-only is claimed.
- The shared builder `01_build_daily_dataset.py` still lacks the basis and the swap (DATA_SPEC §5 #12, open). This study
  does not use it.

## Descriptive (not part of the verdict)

**Local gamma sign at the wall (owner's addition, A3; CONTEXT only).** Strong walls, wall vs placebo break rate, diff pp
[95% CI], n wall, distinct days. Book sign × local sign (net dealer gamma within ±0.25σ of the wall):

| Sample | Book | Local | All DTE | Near 0-7 | Far 8+ |
|---|---|---|---|---|---|
| FX/gold | + | + | −2.1 [−5.3, +1.3] n 2,783, 1,243 d | **−7.6 [−14.8, −0.7]** n 797, 444 d | −2.1 [−5.7, +1.4] n 2,266 |
| FX/gold | + | − | +0.3 [−6.1, +6.6] n 619, 470 d | +10.5 [−1.5, +22.6] n 188 | −1.5 [−8.7, +5.7] n 483 |
| FX/gold | − | + | −5.5 [−12.4, +1.4] n 493, 405 d | +0.3 [−15.9, +16.6] n 142 | −6.4 [−13.8, +0.7] n 395 |
| FX/gold | − | − | −1.4 [−6.2, +3.4] n 2,075, 1,079 d | +2.1 [−8.9, +12.8] n 654 | −0.5 [−5.6, +4.7] n 1,566 |
| NQ+SPX | + | + | +0.8 [−3.1, +4.8] n 1,098, 680 d | +4.2 [−5.3, +14.0] n 222, 92 d | +0.4 [−3.7, +4.6] n 929 |
| NQ+SPX | + | − | **+8.5 [+0.5, +17.0]** n 187, 154 d | +5.9 [−19.4, +32.3] n 34 | **+8.7 [+0.9, +17.4]** n 158 |
| NQ+SPX | − | + | +9.3 [−2.3, +21.4] n 101, 92 d | +22.8 [−4.3, +56.1] n 13 | +6.5 [−5.3, +19.0] n 90 |
| NQ+SPX | − | − | +3.0 [−1.3, +7.4] n 675, 358 d | **−11.7 [−24.6, −0.4]** n 113, 47 d | **+4.8 [+0.2, +9.3]** n 594 |

Five of 24 intervals exclude 0, and with overlapping rows about 1-2 would be expected by chance. The readable pattern
fits the mechanism: on NQ+SPX a wall whose own neighbourhood is short gamma breaks more often (+8.5 under a long-gamma
book, n 187), while long local gamma in a long book is flat. On FX/gold, near-dated walls with long local and long book
gamma lean to fade (−7.6). All of it is small-n and below the mirror's own ~3-5 pp bias. These are pointers for the
registered `level-local-gamma` study, not evidence.

**Map (section 5).** 256 cells (4 buckets × 2 signs × strong/moderate × 4 hour blocks × stacked/not × 2 samples).
133 have ≥ 20 resolved wall touches. 6 of those have p < 0.05 (6.7 expected by chance), **0 survive BH q = 0.10**, and
only 2 cells reach 400 days. Full table: `wall_dte_style.json` → `map`.

## Power

The archive cannot answer the near-DTE question. The FX and gold chains hold monthlies only and NQ/SPX quarterlies
only (no weeklies or 0DTE), so 0-7 DTE OI exists on 27% of FX sessions and 9% of NQ/SPX sessions. H1 has 97 distinct days
on NQ+SPX against a 400 gate, and an MDE of 9 pp on FX/gold against a 3 pp bar. The forward record (the OI bots and the
hedging-plan shadow log every wall's DTE on weekly books) is the way to power H1.

## What this changes

- The OI-Conf / OI Gamma bots get no evidence for splitting fade vs follow by the wall's own DTE, the book's gamma sign
  or the hour (H1-H4). Section 8's "nothing passes" branch applies: walls stay a map of positioning, and the
  "fade/follow" labels are not an edge claim. The switch from fade to break is not made on this evidence.
- Short gamma does not make FX/gold walls break more (NULL, CI excludes +3 pp). On NQ+SPX the +3.9 pp lean is
  underpowered and the same size as the mirror.
- Grid-neighbour placebos are biased by about 3-5 pp for levels at ~1σ (the mirror). Future level studies should use a
  distance-matched or random-level control rather than ±k increments alone.
- What would reopen it: a weekly/0DTE OI history (forward capture) giving ≥ 400 near-DTE days, or the
  `level-local-gamma` prereg finding a local-gamma effect larger than the placebo bias.
