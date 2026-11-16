# noise-area-build: RESULTS

Prereg `forge/NOISE_AREA_BUILD_PREREG.md` · seed 20261116 · 1,440 designs per instrument · realistic costs
(SPY $0.019/share round trip; futures 1 tick each side + $4.50) · page `noise-area-build.html` ·
scripts `scripts/noise-area-build/` (scan.py, run.py) · ledger ids `noise-area-build` (B1), `noise-area-build-wf` (B2).

## Verdict: tuning the theory does not beat the paper's rule (B1 NULL headline); the honestly chosen build makes money only on SPY (B2 VALIDATED on SPY, UNDERPOWERED on futures)

## Walk-forward (design re-chosen each January from earlier years only)

| Instrument | Out of sample | Build net Sharpe | Paper rule, same days | Build − paper | B1 | B2 |
|---|---|---|---|---|---|---|
| SPY | 2010–2026-08 | **0.69** [0.20, 1.12] | 0.67 | +0.02 [-0.37, 0.39], halves 0.31 / -0.25 | **UNDERPOWERED** | **VALIDATED** |
| ES | 2019–2026-08 | **0.20** [-0.49, 0.86] | 0.68 | -0.48 [-1.12, 0.14], halves -0.14 / -0.73 | **NULL** | **UNDERPOWERED** |
| NQ | 2019–2026-08 | **0.60** [-0.04, 1.26] | 1.24 | -0.64 [-1.22, -0.01], halves -0.71 / -0.48 | **NULL** | **UNDERPOWERED** |
| YM | 2019–2026-08 | **0.21** [-0.62, 1.05] | -0.05 | +0.26 [-0.44, 0.92], halves 0.62 / -0.54 | **UNDERPOWERED** | **UNDERPOWERED** |
| RTY | 2020–2026-08 | **-0.15** [-0.98, 0.64] | -1.27 | +1.11 [0.26, 1.97], halves 1.82 / 0.38 | **VALIDATED** | **UNDERPOWERED** |

- **SPY**: the builder chose 1.5× band / 28 days / hourly checks / VWAP stop / vol target in 13 of 17 years (trail or a
  filter in the others), a wider, slower version of the paper's rule. It made 0.69 [0.20, 1.12], 3.0 bp/day, halves
  0.82 / 0.57, CAGR 7.3%, max drawdown −20%. B2 VALIDATED. The paper's rule made 0.67 on the same days, so tuning added
  nothing (+0.02). 2025 −0.01 and 2026 to August −1.50: the post-publication years are flat to negative for both.
- **NQ**: the builder hopped between designs (band/trail, 0.75× to 1.5×, VIX filter on and off) and made 0.60 against the
  plain paper rule's 1.24 (−0.64 [−1.22, −0.01]). With 3–7 years of history the plateau choice chased noise. ES the same
  (−0.48).
- **RTY**: B1 VALIDATED as pre-registered (+1.11, halves 1.82 / 0.38), but only because the paper's rule loses badly on
  the Russell (−1.27). The build is −0.15: less bad, still not a strategy.
- **Book** (described): the five walk-forward streams at 10% vol each, 2019-03-29 → 2026-08-21: 0.32
  [-0.49, 0.90], halves 0.95 / -0.52.

## The design map over the paper window (described; in-sample)

| Instrument | Paper rule Sharpe (rank) | Best single design → after Apr 2024 | Deflated p | Plateau pick → after Apr 2024 | Designs > 0 |
|---|---|---|---|---|---|
| SPY | 1.02 (93th pct) | 1.5/14/30m/trail/none/vt 1.30 → 0.27 | 0.98 (noise max 0.85) | 1.5/28/60m/vwap/none/vt 1.05 → 0.05 | 99% |
| ES | 0.57 (81th pct) | 1.5/14/30m/flip/nr4/vt 0.90 → 0.02 | 0.46 (noise max 0.94) | 1.5/28/15m/flip/nr4/1x 0.48 → -0.49 | 84% |
| NQ | 1.30 (97th pct) | 1.0/7/30m/trail/none/1x 1.55 → 0.56 | 0.94 (noise max 1.03) | 1.5/7/60m/trail/none/1x 0.98 → 0.52 | 100% |
| YM | -0.03 (60th pct) | 1.25/28/30m/trail/vix_hi/1x 0.62 → 0.06 | 0.08 (noise max 1.07) | 1.5/28/15m/trail/vix_hi/1x 0.52 → -0.73 | 36% |
| RTY | -0.63 (10th pct) | 1.0/28/15m/flip/vix_lo/vt 0.84 → -0.57 | 0.07 (noise max 1.40) | 1.0/28/15m/flip/vix_lo/vt 0.84 → -0.57 | 53% |

- The paper's rule already sits near the top: better than 93% of designs on SPY and 97% on NQ.
- The map is broad on SPY: 99% of designs are positive after costs. Wider bands (1.25–1.5×) score a little higher
  (1.13–1.17 vs 1.02), which is what the walk-forward picked up.
- Knob by knob on SPY (median Sharpe): a wider band helps (0.75× 0.54 → 1.5× 0.77); the exit matters most (VWAP stop
  0.84, band 0.81, trail 0.81, hold 0.55, flip 0.48), so the paper's stop *is* the right exit on SPY even though the
  decomposition put most of the gross edge in the hold. The VIX filters both lower the median (they halve the trading
  days); NR4 is neutral; vol targeting helps a little (0.73 vs 0.65).
- Best single designs fall apart after April 2024 (SPY 1.30 → 0.27; ES/YM/RTY plateau picks negative after).

## What this means

The paper's parameters are not arbitrary: they sit at or near the top of a broad region. Re-tuning them on our data
adds nothing on SPY and loses on the futures, where there is too little history to choose well. What survives is the
paper's own edge on SPY (and the paper's rule on NQ, banked under `noise-area-momentum`). The next step is unchanged:
a pre-registered forward paper record of the paper's rule on SPY and NQ, not a better-tuned version.

## Limitations

- The design space was written knowing the paper's rule and its results on these instruments (prereg header). The SPY
  walk-forward years 2010–2024.04 are inside the paper's own sample, so the paper's authors had seen them; only
  2024.05 → 2026.08 is out of everyone's sample, and it is flat to negative.
- Fills at the check bar's close; fractional size; no latency; VIX daily close from Cboe (prior day).
- Lockbox: nothing after 2026-08-21.
