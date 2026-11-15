# positioning-flow-inputs — results

Prereg: `forge/POSITIONING_FLOW_INPUTS_PREREG.md` (committed `c18afef3`; power amendment A1 `95aa7f9f`, both before any
outcome was read). Runner `scripts/positioning-flow-inputs/run.py` (committed `394e76f5`). Run 2026-11-15, seed
20261115, B = 2000 (21-date moving blocks), 200 placebo refits per cell. Branch `claude/signal-bot-bias-analysis-bwr1qv`.
Data to 2026-08-21 (lockbox; every horizon end ≤ 2026-08-21, asserted). Suggested ledger ids (the owner banks):
`positioning-flow-book`, `positioning-flow-rr`, `positioning-flow-vrp`, `positioning-flow-monthend`.

## Verdict: UNDERPOWERED (all four inputs, by the registered per-input rule), with 10 of 28 cells cleanly NULL

No cell passed G1 (CI lower > 0 and Holm p < 0.05; every Holm-adjusted p is 1.00). No input adds next-day or 5-day
direction information beyond B0, or beyond the bias-learner's readings, that this design can find. The per-input word
is UNDERPOWERED only because each input has some cells too thin to rule out the useful effect (gold, NAS100, month-end,
the +5 incrementals). **Where the test was powered, in the FX 21:00 cells, the answer is NULL.** The retail book (alone
and over the learner), RR (alone) and FX VRP (alone and over the learner) all have 95% CIs whose upper end sits below
the useful effect U (≈ 1.3 pp of hit rate). The evidence pack's planted bar-sized drift on the same real rows was found
100% of the time. VRP on indices and gold is NULL at 21:00. At +5 it is NULL with the wrong sign: the fitted tilt lost
skill out of sample.

| Input | Word | NULL cells (powered, CI upper < U, plant found) | Everything else |
|---|---|---|---|
| OANDA retail book (EURUSD, GBPUSD, USDJPY, GOLD; 2017-05 →) | **UNDERPOWERED** | fx alone 21:00 (−0.023% [−0.055, +0.004]); fx incremental 21:00 (+0.056% [−0.015, +0.134]) | gold (one instrument, CI ±0.45%) and the +5 cells cannot rule U out |
| 25-delta RR, 30-day (6 FX pairs, NAS100; 2020-09 →) | **UNDERPOWERED** | fx alone 21:00 (−0.037% [−0.282, +0.167]); fx alone +5 (+0.096% [−0.055, +0.265]) | fx incremental 21:00 **hurt** (−0.192% [−0.445, −0.002]: adding RR overfits); NAS100 cannot recover a planted signal at all (U ≈ 0) |
| VRP (FX: CME IV 2020-09 →; GVZ/VXN/VIX/VXD 2016 →) | **UNDERPOWERED** | fx alone 21:00; fx incremental 21:00; fx alone +5 (−0.314%); gold alone 21:00 (−0.077% [−0.155, −0.017]); idx alone 21:00; idx alone +5 (−0.263% [−0.527, −0.018]) | fx incremental +5; gold +5 |
| Month-end flow (7 USD pairs, last 3 weekdays of the month) | **UNDERPOWERED** | none (21:00 alone was registered NULL, then demoted by A2 because the pack could not find the planted bar) | +5 is the one large number: **+1.88% [−1.32, +4.84]**, placebo percentile 100, but the halves are +5.3% and −1.5% and G1 fails |

Forward-record cells (no history before the lockbox; UNDERPOWERED by design):
- the OANDA book on the other 12 instruments (44 daily rows, all from about 2026-09);
- the IBKR skew pull (RR/BF at 1w/1m/3m for gold, ES, NQ, crude and 6 FX pairs; from 2026-11-04).

## Data depth (measured first, prereg §3.2 / A1)

| Input | History before the lockbox | Scored use |
|---|---|---|
| OANDA position book, `backfill/books_daily.ndjson` (07:00 UTC daily snapshot) | 2017-05-01 → 2026-08-20: 2,379 snapshots each for EURUSD, GBPUSD, USDJPY, XAUUSD. Other 12 instruments: 0 | session d uses the previous UTC day's snapshot (≥ 23 h old); test years 2019–2026 |
| Server `/api/oanda-book/history` (cross-check only) | from 2019-09-09; 1,771 overlapping days. Our crowd series vs the server's longPct: corr ≥ 0.9996, mean abs diff 0.025 pp (`book_crosscheck.json`) | — |
| CME settlement IV/RR (`oi_research_book/data/iv_daily_*`) | 2020-09-08 → 2026-08-20: 1,500 settlements per FX pair, 1,497 for NAS100 | test years 2022–2026 |
| Cboe GVZ/VXN/VIX/VXD | 2009 → (panel from 2016) | test years 2018–2026 |
| SPX500, DE30, UK100 M1 (month-end) | 2016-01-04 → | 309 window dates, 2018–2026 |

## Scored cells

The statistic is BSS vs B0 for alone cells. For incremental cells it is ΔBSS: the gain over the bias-learner base, as
a fraction of B0's error. The gates:
- **G1**: CI lower > 0 and Holm p < 0.05 across the 28 cells.
- **G2**: above the 95th percentile of 200 block-shuffled-input refits.
- **G3**: > 0 in both halves.
- **G4**: the leading slope has the same sign in ≥ 75% of folds.

MDE, U and POWERED come from amendment A1.

| Cell | n rows (test dates) | Statistic | 95% CI (21-date block) | Placebo 95th (200 refits) | MDE | U | Holm p | G1 G2 G3 G4 | Verdict | Pack diagnosis |
|---|---|---|---|---|---|---|---|---|---|---|
| `book|fx|alone|21:00` | 5928 (1979) | -0.023% | [-0.055%, +0.004%] | +0.023% | +0.311% | +0.408% | 1.00 | ✗ ✗ ✗ ✓ | **NULL** | FLAT |
| `book|fx|incr|21:00` | 5916 (1976) | +0.056% | [-0.015%, +0.134%] | +0.071% | +0.092% | +0.245% | 1.00 | ✗ ✗ ✓ ✓ | **NULL** | FLAT |
| `book|gold|alone|21:00` | 1906 (1906) | -0.044% | [-0.493%, +0.416%] | +0.065% | +0.327% | +0.375% | 1.00 | ✗ ✗ ✗ ✓ | **UNDERPOWERED** | UNDERPOWERED |
| `book|gold|incr|21:00` | 1900 (1900) | +0.007% | [-0.270%, +0.300%] | +0.063% | +0.588% | +0.246% | 1.00 | ✗ ✗ ✗ ✓ | **UNDERPOWERED** | UNDERPOWERED |
| `rr|fx|alone|21:00` | 7197 (1201) | -0.037% | [-0.282%, +0.167%] | +0.050% | +0.201% | +0.479% | 1.00 | ✗ ✗ ✗ ✓ | **NULL** | FLAT |
| `rr|fx|incr|21:00` | 7188 (1200) | -0.192% | [-0.445%, -0.002%] | +0.050% | +0.346% | +0.278% | 1.00 | ✗ ✗ ✗ ✓ | **UNDERPOWERED** | UNDERPOWERED |
| `rr|idx|alone|21:00` | 1150 (1150) | +0.077% | [-0.045%, +0.268%] | +0.115% | +0.678% | -0.020% | 1.00 | ✗ ✗ ✓ ✓ | **UNDERPOWERED** | UNDERPOWERED |
| `rr|idx|incr|21:00` | 1147 (1147) | +0.079% | [-0.009%, +0.250%] | +0.043% | +1.249% | +0.001% | 1.00 | ✗ ✓ ✗ ✓ | **UNDERPOWERED** | UNDERPOWERED |
| `vrp|fx|alone|21:00` | 7199 (1201) | -0.012% | [-0.104%, +0.077%] | +0.017% | +0.101% | +0.614% | 1.00 | ✗ ✗ ✗ ✓ | **NULL** | FLAT |
| `vrp|fx|incr|21:00` | 7190 (1200) | +0.085% | [-0.008%, +0.203%] | +0.103% | +0.338% | +0.445% | 1.00 | ✗ ✗ ✗ ✓ | **NULL** | FLAT |
| `vrp|gold|alone|21:00` | 2156 (2156) | -0.077% | [-0.155%, -0.017%] | +0.043% | +0.253% | +0.559% | 1.00 | ✗ ✗ ✗ ✗ | **NULL** | WRONG SIGN |
| `vrp|idx|alone|21:00` | 6426 (2146) | -0.003% | [-0.007%, +0.008%] | +0.030% | +0.193% | +0.578% | 1.00 | ✗ ✗ ✗ ✓ | **NULL** | FLAT |
| `monthend|fx|alone|21:00` | 2162 (309) | -0.190% | [-0.960%, +0.417%] | +0.167% | +0.546% | +0.559% | 1.00 | ✗ ✗ ✗ ✓ | **UNDERPOWERED (registered NULL; A2)** | UNDERPOWERED |
| `monthend|fx|incr|21:00` | 2150 (308) | -0.090% | [-0.152%, +0.059%] | +0.121% | +0.744% | +0.202% | 1.00 | ✗ ✗ ✗ ✓ | **UNDERPOWERED** | UNDERPOWERED |
| `book|fx|alone|+5` | 5923 (1975) | -0.013% | [-0.073%, +0.039%] | +0.054% | +0.695% | +0.408% | 1.00 | ✗ ✗ ✗ ✓ | **UNDERPOWERED** | FLAT |
| `book|fx|incr|+5` | 5911 (1972) | +0.029% | [-0.277%, +0.381%] | +0.145% | +0.205% | +0.245% | 1.00 | ✗ ✗ ✗ ✓ | **UNDERPOWERED** | FLAT |
| `book|gold|alone|+5` | 1965 (1965) | -0.437% | [-1.188%, +0.232%] | +0.171% | +0.731% | +0.375% | 1.00 | ✗ ✗ ✗ ✓ | **UNDERPOWERED** | UNDERPOWERED |
| `book|gold|incr|+5` | 1959 (1959) | -0.472% | [-1.696%, +0.901%] | +0.268% | +1.315% | +0.246% | 1.00 | ✗ ✗ ✗ ✓ | **UNDERPOWERED** | UNDERPOWERED |
| `rr|fx|alone|+5` | 7170 (1196) | +0.096% | [-0.055%, +0.265%] | +0.030% | +0.449% | +0.479% | 1.00 | ✗ ✓ ✓ ✓ | **NULL** | SMALL BUT REAL |
| `rr|fx|incr|+5` | 7161 (1195) | +0.004% | [-0.098%, +0.074%] | +0.042% | +0.773% | +0.278% | 1.00 | ✗ ✗ ✓ ✓ | **UNDERPOWERED** | FLAT |
| `rr|idx|alone|+5` | 1191 (1191) | -0.050% | [-0.158%, +0.033%] | +0.282% | +1.516% | -0.020% | 1.00 | ✗ ✗ ✗ ✓ | **UNDERPOWERED** | UNDERPOWERED |
| `rr|idx|incr|+5` | 1188 (1188) | -0.051% | [-0.152%, +0.009%] | +0.185% | +2.792% | +0.001% | 1.00 | ✗ ✗ ✗ ✓ | **UNDERPOWERED** | UNDERPOWERED |
| `vrp|fx|alone|+5` | 7172 (1196) | -0.314% | [-0.687%, +0.046%] | +0.105% | +0.225% | +0.614% | 1.00 | ✗ ✗ ✗ ✓ | **NULL** | WRONG SIGN |
| `vrp|fx|incr|+5` | 7163 (1195) | -0.129% | [-0.533%, +0.298%] | +0.060% | +0.756% | +0.445% | 1.00 | ✗ ✗ ✗ ✓ | **UNDERPOWERED** | FLAT |
| `vrp|gold|alone|+5` | 2223 (2223) | -0.042% | [-0.231%, +0.142%] | +0.256% | +0.566% | +0.559% | 1.00 | ✗ ✗ ✗ ✓ | **UNDERPOWERED** | FLAT |
| `vrp|idx|alone|+5` | 6655 (2221) | -0.263% | [-0.527%, -0.018%] | +0.118% | +0.431% | +0.578% | 1.00 | ✗ ✗ ✗ ✓ | **NULL** | WRONG SIGN |
| `monthend|fx|alone|+5` | 2162 (309) | +1.877% | [-1.315%, +4.837%] | +0.240% | +1.221% | +0.559% | 1.00 | ✗ ✓ ✗ ✓ | **UNDERPOWERED** | UNDERPOWERED |
| `monthend|fx|incr|+5` | 2150 (308) | +1.641% | [-2.129%, +4.965%] | +0.778% | +1.665% | +0.202% | 1.00 | ✗ ✓ ✗ ✓ | **UNDERPOWERED** | UNDERPOWERED |

## Why — evidence

Every cell has the standard evidence pack (`scripts/evidence_pack/pack.py`) in `evidence/<cell>/`: `EVIDENCE.md`,
`evidence.json`, `placebo.png`, `buckets.png`, `breakdown.png`, `plants.png` and `sample_rows.csv`. A one-line summary
per cell is in `evidence/summary.txt`. How the pack is built:
- **Rows**: one per instrument × test date.
- **Signal**: the input's lean, p − B0 (alone) or p − the learner base (incremental). **Outcome**: the per-row Brier
  gain.
- **Plant**: labels are flipped toward the lean until the statistic rises by exactly the bar, i.e. a bar-sized drift in
  the signal's direction on the real rows.
- **Canary**: the lean is set to the realised same-day direction.

What the packs show:
- **The lookahead canary fires in all 28 cells**: with the leak, the statistic goes to about +1.0. The pipeline would
  see a leak, and none is present in the clean numbers.
- **FLAT (11 cells)**: the pack found the planted bar 100% of the time, and the interval rules it out. These are the
  clean nulls: the test could see 1.3 pp and found nothing. They are:
  - book fx at 21:00 (alone and incremental) and fx at +5 (both);
  - RR fx alone at 21:00, and RR fx incremental at +5;
  - VRP fx at 21:00 (both), VRP idx at 21:00, VRP fx incremental at +5, VRP gold at +5.
- **WRONG SIGN (3 cells)**: VRP gold 21:00, VRP fx alone +5, VRP idx alone +5. The pooled slope is re-fitted each
  year, so a CI below zero means the in-sample tilt reversed out of sample. Index VRP lost most in 2022 (−2.4% that
  year). This is overfit cost, not a usable contrarian signal: the sign is free in the fit.
- **UNDERPOWERED (13 cells)**: the bar-sized plant was found in ≤ 15% of draws. These are:
  - the gold book (one instrument);
  - every NAS100 RR cell (one instrument, four test years);
  - month-end (≈ 100 independent months, and the 7 pairs move as one USD trade);
  - the RR fx incremental 21:00 cell (it starts at −0.19%, so a +0.28% plant lands near zero).
- **SMALL BUT REAL (1 cell, not a pass)**: RR fx alone at +5, +0.096%.
  - The pack's iid-date CI excludes zero. The registered 21-date block CI [−0.055%, +0.265%] does not, because the +5
    labels overlap. Holm p = 1.0.
  - The lean is the RR level, with a **negative** slope in every fold: calls on the pair rich → the pair drifts down
    over the week (the crash-premium reading).
  - It is 5× below U: a pointer, not a result.
- **Month-end +5** (the largest number):
  - +1.88% BSS, a 58.6% hit rate on 309 window dates, placebo percentile 100.
  - The slope is **negative in 9 of 9 folds**: when US equities outperform Europe over the month, the **USD rises** over
    the next week. That is the opposite of the rebalancing story.
  - Against it: first half +5.3%, second half −1.5%; 2020 alone +9.5%, 2026 −6.6%; USDJPY and USDCHF carry no sign.
  - The pack found the plant at 1× the bar in 5% of draws (at 2× the bar, 70%).
  - Seven pairs that are one dollar trade, over 3 overlapping sessions a month, make about 100 independent
    observations. This is a large, unstable number, correctly UNDERPOWERED.

## Controls

- **Selftest** (synthetic panel, the exact cell scorer, run before any real target):
  - A planted IC 0.15 was recovered: alone +2.35% BSS, CI lower +1.60%, placebo 95th +0.04%; incremental +2.23%.
  - IC 0 was not flagged (−0.09%, −0.03%).
  - Unit check: a snapshot dated d never serves session d.
  - It passed twice, standalone and inside the real run.
- **Placebo** (200 refits per cell): 21-date blocks of the input were moved across dates, with targets, B0 and the
  learner readings fixed. The real statistic beat the 95th percentile in 4 cells: RR fx alone +5, RR idx incremental
  21:00 and both month-end +5 cells. None of them passed G1. At most 0.43% of placebo rows (mean per cell) had no
  source reading.
- **Learner base on the cell rows** (incremental cells): BSS between −0.32% and +0.22% at 21:00, so the banked
  `bias-learner` null reproduces on these subsets. The exception is the NAS100 RR rows at +5 (−2.1%): one index, four
  years.
- **Concentration**: with the top 1% of rows by |contribution| dropped, every NULL cell stays inside its CI. Month-end
  +5 stays at +3.3%: it is not one day but a few months.
- **Shrinkage**: the inner C rule chose C ≤ 1e-4 in most folds of most cells, so p ≈ B0 (the same behaviour as the
  bias-learner). The power runs show the pipeline does open up (U ≈ 0.25–0.6%) when a real IC 0.08 is present.

## Deviations from the prereg

- **A1 (PRE-RESULTS)**: the power table was filled, and SD_null was inflated for cross-instrument correlation and for
  the +5 overlap. That rule can only turn NULL into UNDERPOWERED.
- **A2 (POST-HOC, demotes only)**: `monthend|fx|alone|21:00` passed the registered NULL rule (POWERED by the
  simulation; CI upper +0.417% < U +0.559%). But its evidence pack found the planted bar in 0% of draws on the real
  rows, so the simulation's POWERED label was optimistic for this cell. It is demoted to UNDERPOWERED. Every other
  NULL cell had a pack plant rate of 100%. No cell was promoted.
- The "rows" in the A1 table count train + test rows; the scored-cell table above counts test rows only.

## Descriptive (not part of the verdict)

Per-reading splits, halves, slopes, hit rates, calibration slopes, and per-instrument and per-year values are in
`results.json` (`cells[*].single`, `halves`, `folds`, `by_inst`, `by_year`). `scripts/positioning-flow-inputs/report.py`
prints them as tables. Notable:
- The book's level and change were each ≈ 0 alone (fx 21:00: bk_lvl −0.009%, bk_chg −0.000%).
- The retail crowd on these four instruments is 58–62% long on average, with an SD of 1.6–4.4 pp (`--depth`). There is
  little variation to use, the same picture as `squeeze-fuel`.

## What this changes

- **Desk card, brief, Global Read**: none of the four inputs may be shown as a direction lean.
  - The retail book stays context ("who holds what").
  - RR and VRP stay vol information.
  - Month-end stays a range note (`forecast-miss-month-end-fx`).

  Where it could be measured (FX, next day), there is no information at the 1.3 pp level, alone or on top of the
  learner. That matches `squeeze-fuel`, `cot-positioning-factor` and the `bias-learner` FX null.
- **P4 in `plans/BIAS_RESEARCH_SYNTHESIS.md`** is answered for t → t+1: positioning and flow data with history before
  the lockbox give no new direction input. Keep recording the forward ones (the book on 16 instruments, the IBKR skew
  pull, the CME IV archive) so the bias-scoreboard can score them once 120+ days exist.
- **Where the nulls point next** (each needs its own prereg; none is a result):
  1. **Relative equity momentum → USD at +5 days, on every day, not only at month-end.** The month-end +5 slope was
     negative in 9 of 9 folds (US outperformance → USD up). An all-days version has ~20× the rows and can separate a
     month-end flow from plain cross-asset momentum. Hold out 2008–2015 for confirmation (pull DE30/UK100/SPX dailies).
  2. **RR level as a 5-day crash-premium tilt** (rich calls on a pair → the pair drifts down). Pool it with longer
     settlement history if CME chains before 2020-09 are ever pulled. Its +0.10% is 5× below U today.
  3. **The OANDA book is done as a direction input** for the four deep instruments. Further book work should look at
     range, or be event-conditional (the `positioning-into-release` shape), not always-on direction.

## Files

- `results.json` (all cells, folds, gates, packs, the A2 demotion), `book_crosscheck.json`, and `evidence/` (28 packs
  plus `summary.txt`).
- Not committed: `cache/` (panel, book parquet, OOS predictions, logs).
