# jordan-vwap-band-tp: results

Prereg `forge/JORDAN_VWAP_BAND_TP_PREREG.md` (ffe6f2aa). Scripts: `scripts/jordan-vwap-band-tp/run.py` (A–D) and
`jordan_like.py` (part E, post-hoc). Seed 20261125. 25 NT8 futures, 2020 → 2026-08-21, net of 2.5 ticks.

Files:
- `A_indicator_mfe_mae.csv`: the indicator's own MFE/MAE.
- `B_staged_mae.csv`: 15 / 30 / 60 min and end of day at Jordan's lines.
- `E_jordan_like_*.csv`: Jordan's MAE method on our lines.
- `results.json`, `report.txt`.

The indicator is copied exactly from the owner's "VWAP Fixed Sigma + MFE MAE" (Pine v6):
- hlc3 × volume VWAP, reset each session
- σ_v = median of the previous 20 sessions' RMS(hlc3 − VWAP), fixed for the day
- bands = VWAP of the previous bar ± k·σ_v

The 6E check matched: σ_v is about 10 pips, against 12.5 pips VWAP-to-1σ on the owner's screenshot.

## Verdicts

| Test | Trades | Net R (line) | Gross | Line minus placebo | Halves (vs placebo) | Verdict |
|---|---|---|---|---|---|---|
| C1: fade a Close± / HL line at ≥ +2σ_v, TP +1σ_v band, stop 0.30σ | 116,939 | −0.155 [−0.170, −0.140] | −0.018 | +0.002 [−0.008, +0.011] | −0.011 / +0.013 | **NULL** |
| C2: the same, TP at VWAP | 116,939 | −0.159 [−0.178, −0.141] | −0.023 | +0.004 [−0.007, +0.014] | −0.009 / +0.015 | **NULL** |
| D: the indicator's ±2σ re-entry signal, stop ±3σ, TP ±1σ | 267,553 | −0.178 [−0.186, −0.169] | −0.017 | +0.016 [+0.010, +0.023] (real bands vs scaled bands) | +0.019 / +0.013 | **UNDERPOWERED** |

**Graded weight:** against, for VWAP bands as targets at Jordan's lines.

**C1 and C2:**
- About half of all line touches (47%) sit at or beyond +2σ_v. So "line + outer band" is ordinary, not a special
  confluence.
- The band target is far: +1σ_v is a median 1.5R away, and VWAP is 2.4R.
- The target is hit only 29% (C1) and 17% (C2) of the time.
- Gross is about −0.02R at every stretch (z 2 → 4+), with the placebo the same. A line beyond the band is no better
  than a level there.

**D:**
- The re-entry signal hits +1σ 47% of the time.
- Gross is −0.017R. Costs on a stop 1σ_v wide take it to −0.18R net.
- The real bands do slightly better than the scaled bands (+0.016R, both halves). It is a faint pointer, not a trade.

## A. The indicator's own MFE / MAE (fresh ±2σ touches, entry at the band, from the next bar)

Pooled, in σ_v (median / P75 / P90):

| Window | MAE | MFE |
|---|---|---|
| 15 min | 0.35 / 0.69 / 1.17 | 0.34 / 0.66 / 1.09 |
| 30 min | 0.48 / 0.94 / 1.59 | 0.48 / 0.90 / 1.48 |
| 60 min | 0.65 / 1.28 / 2.15 | 0.65 / 1.23 / 2.03 |
| To 22:00 | 1.33 / 2.80 / 4.96 | 1.28 / 2.71 / 4.86 |

- MFE equals MAE at every band (±2, 2.5, 3σ) and every window.
- In ticks, the ±2σ band MAE is almost the same as at Jordan's lines (60-minute median: NQ 131, GC 34, 6E 15, 6J 8),
  because both are fixed-window measures of price noise.

## B. Staged MAE at Jordan's lines (median line, futures ticks, median / P75 / P90)

| | 15 min | 30 min | 60 min | To 22:00 |
|---|---|---|---|---|
| GC, Close± | 18 / 41 / 80 | 24 / 56 / 106 | 34 / 75 / 142 | 87 / 208 / 374 |
| NQ, Close± | 71 / 146 / 255 | 100 / 201 / 360 | 135 / 271 / 461 | 314 / 651 / 1075 |
| 6E, Close± (half-pip ticks) | 8 / 17 / 30 | 11 / 22 / 39 | 16 / 30 / 53 | 39 / 77 / 120 |
| 6J, Close± | 4 / 9 / 18 | 6 / 13 / 24 | 8 / 17 / 31 | 23 / 49 / 88 |

- In line σ (Close±, all instruments), the median MAE is 0.08 → 0.12 → 0.16 → 0.39σ over 15 / 30 / 60 minutes / to
  the close. It grows roughly with √time.
- MFE is the same size at every stage.

## E. Jordan's own method on our lines (POST-HOC, descriptive; `Misc/mae_analysis.py`)

Jordan's script measures MAE **only while the trade is open** (entry bar to exit bar), against a fixed stop, split
by tier and by win or loss. Copied on our lines:
- Every touch of Close± and the HL projections is faded.
- His stop sizes: GC 75 ticks, NQ 150 ticks, EURUSD and USDJPY 12 pips.
- Exit at the stop, a 1R target, or the 22:00 hard close.

| | Mean | Median | P75 | P90 | Jordan (mean / median / P75 / P90) |
|---|---|---|---|---|---|
| GC (ticks) | 53.7 | 55.5 | 79.5 | 91.3 | 43.8 / 33.8 / 76.3 / 86.8 |
| NQ (ticks) | 115.8 | 134.6 | 163.5 | 186.1 | 107.7 / 114.0 / 161.4 / 185.1 |
| EURUSD (pips) | 9.2 | 10.4 | 13.0 | 15.0 | 10.9 / 12.2 / 14.5 / 18.2 |
| USDJPY (pips) | 11.0 | 11.8 | 13.6 | 16.8 | 10.1 / 12.0 / 13.8 / 16.8 |

**Measured his way, our lines give his table.** The P75 and P90 match within a few ticks, and USDJPY is almost
identical. The earlier gap came from how MAE was measured (a fixed window with no stop, against the life of a
trade), not from the lines. It also confirms that his FX units are pips.

**Winners vs losers (1R variant):**
- Winners' MAE: median about 28–34% of the risk, P90 about 60–80% (NQ 119 of 150 ticks, GC 57 of 75, 6E 9.6 of 12,
  6J 9.8 of 12).
- About 90% of trades that go 80% of the way to the stop end up losing.
- The win rate is 47–50% with a 1R target, and the hard-close variant is 25–35%.
- Both are close to break-even gross.

## What it means

1. **The MAE puzzle is solved.** Jordan's table is MAE during the trade, capped by his stop. Measured that way, our
   lines reproduce it.
2. **VWAP bands as targets don't make the fade work.** The bands are mostly beyond the 1R area, so the target is hit
   less often. There is no extra pull toward VWAP at the lines.
3. **For stops, use the winners' MAE.** Winners rarely go past about 80% of Jordan's stop. A stop much tighter than
   about 0.6–0.8 of his size would cut winners; a wider one only adds to losers.

## F. Previous line as the target, and what target fits Jordan's table (POST-HOC, exploratory)

Owner 2026-11-25. Script `prev_line_tp.py`; tables `F_prev_line_*.csv`.

**Setup:** fade every touch of Jordan's lines, with his stops and a 22:00 hard close. Target the previous line, two
ways:
- **A, same family:** 90th → 75th → median → open.
- **B, nearest line:** the nearest of his lines inside the entry on that side.

**Result:**
- With his stop sizes, the previous line is a median 1.2–3.2R away and is hit 18–36% of the time.
- The trade is −0.03R gross (net −0.13R).
- Against the whole ladder scaled, it's −0.014R (A) and −0.010R (B), and both CIs cross 0.
- Its MAE fits his table worse than a fixed target does (gold median 63–74 against his 33.8).

**Fixed-target fit:** the same trades with targets of 0.25–2R, or no target (`scratchpad tp_fit`, numbers on the MAE
Book page).
- Gold matches his table at **0.5R** (34.8 / 76.5 / 87.0 against 33.8 / 76.3 / 86.8).
- NQ matches at **0.75R** (108 / 161 / 184 against 114 / 161 / 185).
- USDJPY matches at 1R.
- EURUSD matches a hard close or 2R.

So his target looks closer than the previous line: about half to three-quarters of his stop on GC and NQ. This is
inferred from the shape of his MAE, not confirmed.
