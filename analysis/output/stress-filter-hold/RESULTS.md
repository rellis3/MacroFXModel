# stress-filter-hold — results (run 2026-11-02)

Prereg: `forge/STRESS_FILTER_HOLD_PREREG.md` (commit 5253ba8d, pushed before the script existed). Script: `scripts/stress-filter-hold/run.py`, seed 20261102, stationary block bootstrap (mean block 20, B 2000), 2000 label-shift placebos. Full output: `results.json`, `run.log`.

**Verdict.** A VIX stress filter does not improve holding NQ:
- Stressed days were followed by slightly *better* returns than calm days, not worse.
- Stepping aside in stress cut return without buying any drawdown that a smaller position wouldn't.
- On top of vol-target sizing, the stress state slightly hurt.

Vol sizing remains the drawdown tool. The Moreira–Muir 1/σ² version had the best drawdown of any arm, but no Sharpe gain.

## Sample

NQ (OANDA D1, futures-basis costs), **2004-03-16 → 2026-08-20** (outcome through 2026-08-21): 5,795 days, of which 1,122 were stressed (19.4%).
- Deviation from §3: the window starts 2004-03-16, not 2004-01-02, because the 252-row VIX percentile needs history on the NQ calendar, which starts 2003-03-24.
- The cash rate is the USD 3m rate of the previous month. In the code it reads monthly dates without the weekday filter, because month starts can fall on a weekend; that was fixed before any outcome was computed.

## Controls (computed first)

| | Value |
|---|---|
| H1 placebo SD of Δz | 0.031σ, so MDE 0.086σ (Moreira–Muir-sized effect 0.02–0.04σ: below it) |
| Planted Δz = −0.15σ on shifted labels | detected 200/200 |
| MDE, ΔSharpe | H2a 0.38 · H2b 0.17 · H3 0.13 · H4 0.37 |

## Scored cells (NQ, S1 = VIX > previous-252 p80)

| Cell | Statistic | 95% CI | p (Holm) | Halves | 1-row lag | Verdict |
|---|---|---|---|---|---|---|
| H1 Δz stressed − calm (claim < 0) | **+0.022σ** | [−0.051, +0.089] | 0.52 (1.0) | +0.019 / +0.024 | +0.008 | UNDERPOWERED |
| H2a flat-in-stress − B&H Sharpe | −0.079 | [−0.330, +0.204] | 0.54 (1.0) | +0.018 / −0.168 | −0.016 | UNDERPOWERED |
| H2b half-in-stress − B&H | +0.013 | [−0.105, +0.133] | 0.88 (1.0) | +0.046 / −0.019 | +0.040 | NULL |
| H3 VT+stress − VT | −0.029 | [−0.113, +0.069] | 0.53 (1.0) | −0.029 / −0.029 | −0.013 | NULL |
| H4 Moreira–Muir − B&H | −0.006 | [−0.263, +0.257] | 0.96 (1.0) | +0.132 / −0.128 | −0.008 | UNDERPOWERED |

- **H1:** the point estimate has the wrong sign in both halves. It is UNDERPOWERED rather than NULL only because the CI's far end (−0.051σ) just reaches the 0.05σ worthwhile size.
- **H1, in P(up) terms:** stressed 0.553, B0 on those days 0.551, calm 0.554.
- **3× costs:** no sign changes.

## The arms (NQ, net of futures costs, excess of cash)

| Arm | CAGR | Vol | Sharpe | Max DD | Max DD at B&H vol | Worst month | Avg exposure |
|---|---|---|---|---|---|---|---|
| Buy & hold | 11.8% | 21.5% | 0.63 | −55% | −55% | −18.8% | 1.00 |
| Flat in stress | 7.6% | 15.4% | 0.55 | −44% | −57% | −11.7% | 0.81 |
| Half in stress | 10.0% | 17.1% | 0.64 | −48% | −56% | −12.4% | 0.90 |
| Vol target (1/σ) | 11.0% | 17.4% | 0.69 | −35% | −42% | −12.8% | 1.01 |
| Vol target + stress | 9.6% | 15.7% | 0.66 | −32% | −42% | −11.6% | 0.94 |
| Moreira–Muir (1/σ²) | 10.1% | 18.0% | 0.62 | −26% | −30% | −14.1% | 1.07 |

**How to read the "Max DD at B&H vol" column:**
- The stress filters' smaller drawdowns disappear once each arm is scaled to the same volatility. They hold less on average, and that is all.
- Vol sizing really does change the shape: −42% at buy & hold's volatility, and −30% for 1/σ².

## Secondary (descriptive, BH q 0.10)

The family is 40 cells: ES and gold on S1, plus S2 (own 20-day realised vol above its trailing p80) and S3 (VIX ≥ VIX3M) on all three instruments.
- **0 of 40 survive** (smallest q 0.81).
- Nearest: NQ S2 half-size +0.116 Sharpe [+0.001, +0.231], nominal p 0.049. That is about 2 hits expected by chance in 40 cells, and it is not a candidate.

## What this changes

- **Banked:** `stress-filter-hold-direction` (underpowered), `-flat` (underpowered), `-half` (null), `-beyond-vt` (null), `vol-managed-mm` (underpowered).
- **Forward:** ledger forecaster `stress-vix-p80` (prereg §8). It issues B0 + the frozen in-sample excess when VIX is above its previous-252 p80, on NQ/ES/gold.
  - The NQ excesses are −0.13 / +1.25 / −0.53 / +2.34pp at 1 / 5 / 20 / 60 days.
  - It will be a near-baseline record. That is the point: it shows forward whether stress days differ.
- **For the owner's question** (does a daily regime filter improve a multi-week hold?):
  - A stress filter does not.
  - Vol sizing gives the same return with a third less drawdown.
  - The 200d trend filter from the exploratory look also gave up return.
  - Holding NQ is the edge; filters change the ride, not the destination.
