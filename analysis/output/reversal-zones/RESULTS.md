# reversal-zones — results

Prereg: `forge/REVERSAL_ZONES_PREREG.md` (2026-11-19). Seed 20261119, B = 2000, 63-session blocks within instrument.
Script: `scripts/reversal-zones/score.py`.
- The touch walks were built by the first full run (`run_full_walks.log`).
- That run then crashed printing "σ" to the console, after H1 had been computed.
- The statistics were re-run on the saved walks (`REUSE_WALKS=1`, `run.log`): same code, same seed for the bootstrap.
- H1 matches the first run's numbers to within ±0.04pp in the CIs.

Outputs: `zones.csv` (full tables), `results.json`. Ledger: `reversal-zones-race`, `reversal-zones-overshoot` (both
NULL).

## Verdicts (OANDA CFD, NQ + GOLD + EURUSD pooled, v2 ladder lines, 2018 → 2026-08-21)

21,567 real first touches; 90,630 placebo touches (the same lines moved ±0.15σ / ±0.30σ); 22,859 random-walk touches.
0.1% of races were ambiguous within a single bar.

| Test | Real lines | Offset copies | Difference, 90% CI | Verdict |
|---|---|---|---|---|
| H1 EXT, pullback 0.25σ before the next rung | 81.6% | 81.7% | −0.12pp [−0.50, +0.30] | NULL |
| H1 EXT, pullback 0.50σ first | 58.0% | 57.9% | +0.13pp [−0.31, +0.58] | NULL |
| H1 CLOSE, pullback 0.25σ first | 76.7% | 76.3% | +0.32pp [−0.10, +0.85] | NULL |
| H1 CLOSE, pullback 0.50σ first | 52.8% | 52.8% | +0.08pp [−0.40, +0.54] | NULL |
| H2 EXT, median overshoot before a 0.25σ pullback | 0.174σ | 0.177σ | −0.003σ [−0.007, +0.002] | NULL |
| H2 EXT, before a 0.50σ pullback | 0.309σ | 0.312σ | −0.003σ [−0.009, +0.004] | NULL |
| H2 CLOSE, 0.25σ | 0.175σ | 0.177σ | −0.002σ [−0.008, +0.002] | NULL |
| H2 CLOSE, 0.50σ | 0.312σ | 0.317σ | −0.005σ [−0.012, +0.001] | NULL |

None passes BH. Every CI excludes the registered NULL bars (2pp for H1, 0.05σ for H2).

## The zone figures (descriptive, real data; OH and OL pooled across the four time buckets)

What price does after it first touches a ladder line, before a 0.25σ pullback:

| Instrument | Line | n | Overshoot median (σ / %) | Overshoot 75th (σ) | Random walk median | Pullback before next rung | Closes back inside |
|---|---|---|---|---|---|---|---|
| NQ | p50 | 2,263 | 0.18σ / 0.22% | 0.38σ | 0.18σ | 80% (RW 81%) | 47% (RW 50%) |
| NQ | p75 | 1,176 | 0.18σ / 0.23% | 0.37σ | 0.16σ | 88% (RW 91%) | 45% (RW 52%) |
| NQ | p90 | 436 | 0.16σ / 0.18% | 0.33σ | 0.13σ | 63% (RW 64%) | 45% (RW 45%) |
| GOLD | p50 | 2,260 | 0.18σ / 0.15% | 0.35σ | 0.18σ | 84% (RW 83%) | 51% (RW 50%) |
| GOLD | p75 | 1,130 | 0.17σ / 0.15% | 0.34σ | 0.16σ | 89% (RW 90%) | 50% (RW 50%) |
| GOLD | p90 | 475 | 0.17σ / 0.15% | 0.36σ | 0.16σ | 63% (RW 60%) | 49% (RW 49%) |
| EURUSD | p50 | 2,193 | 0.17σ / 0.075% | 0.35σ | 0.18σ | 82% (RW 84%) | 49% (RW 51%) |
| EURUSD | p75 | 1,098 | 0.16σ / 0.071% | 0.33σ | 0.18σ | 86% (RW 85%) | 49% (RW 51%) |
| EURUSD | p90 | 418 | 0.18σ / 0.077% | 0.34σ | 0.17σ | 61% (RW 59%) | 49% (RW 48%) |

Notes:
- For p90 lines the next level is 0.25σ further, hence the lower pullback-first share.
- The time-of-day splits are in `zones.csv`.

## Reading

- **Ladder lines are not reversal points.** After a touch, the first real pullback comes at the same place, and with
  the same odds against extension, whether the line is the real one or a copy moved ±0.15–0.30σ. Every figure matches
  a random walk with the same σ and vol clock.
- **There is a stable rule of thumb, and it belongs to price, not to the line.** After touching any level, price
  typically runs **about 0.17σ further** (median), and a quarter of the time more than **about 0.35σ**, before its first
  0.25σ pullback. Today that's roughly:

  | Instrument | Median overshoot | 75th percentile |
  |---|---|---|
  | NQ | ≈ 0.22% | ≈ 0.45% |
  | Gold | ≈ 0.15% | ≈ 0.30% |
  | EURUSD | ≈ 0.075% | ≈ 0.15% |

  The figure is the same for p50, p75 and p90 lines, for all three instruments, and for the random walk.
- **About half of touched lines are back inside by the close,** again as a random walk predicts.
- **For the chart:** each line can honestly be drawn as a **zone**: from the line to +0.17σ (where the first pullback
  typically starts), with an outer edge at +0.35σ. That describes how price typically behaves after touching any level
  of that size, and it stays correct whatever line it's attached to. Combined with exhaustion (how likely the *next*
  rung is, by hour), it is the full read.
