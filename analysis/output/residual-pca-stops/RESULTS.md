# residual-pca-stops — results (EXPLORATORY, not pre-registered)

Run 2026-10-31. Script `scripts/residual-pca-stops/stops.py` (`python3 stops.py`, then `stops.py robust`,
`stops.py book`). Raw output: `results.json`, trade lists `trades_C_fx8.csv`, `trades_C_wide10.csv`. Not banked
(exploratory). Register row `residual-pca-stops`.

**Why:** C.OG to Chris (VIP Discord, 2026-10-31; `education/cog-snippets.md` #5) was asked whether to add a time stop or
a z-score hard stop. He answered: map the system's actual trade distribution, with full MFE/MAE, first, then engineer
the stop to it. This does that for the micro bank residual model on our data.

**Set-up.** The q1 model exactly as in `residual-pca-family` (window 120, K 2, 17:00 NY closes, panel to 2026-08-20).
Trade paths are in **residual-sd units** (the factor-hedged residual a z-score trader bets on), at **daily-close
resolution** (no intraday MAE here, so true MAE is deeper). Two trade definitions:

- **L, the lesson book:** in a trade while the signal keeps its sign (dead band 0.2).
- **C, a Chris-style threshold trade:** enter at |z| ≥ 1.5, exit when z gets back to 0.

The stop grid was fixed in the script header before any result was seen: z stop 2.0 / 2.5 / 3.0; time stop
5 / 10 / 20 / 40 days. IS/OOS split as in the family: fx8 at 2021-07-22, wide10 at 2022-07-20.

## 1. The trade distribution (C trades, the ones a stop would be put on)

| | fx8 IS | fx8 OOS | wide10 IS | wide10 OOS |
|---|---|---|---|---|
| trades | 138 | 127 | 133 | 136 |
| win rate | 69% | 65% | 70% | 68% |
| mean / median result (res-sd) | +1.11 / +1.76 | +1.09 / +1.66 | +1.18 / +1.74 | +1.07 / +1.84 |
| holding days, median (p75, p90) | 28 (45, 66) | 28 (46, 71) | 27 (47, 67) | 24 (41, 61) |
| MAE of winners, median (p10) | −1.8 (−4.7) | −0.9 (−5.4) | −1.6 (−5.0) | −1.0 (−4.9) |
| MAE of losers, median (p10) | −8.4 (−14.2) | −7.5 (−15.2) | −10.0 (−16.6) | −7.4 (−16.2) |
| MFE of losers, median | +0.2 | +0.9 | +1.5 | +0.5 |

Shape: many modest winners that take about a month, and a minority of losers that run very far (median MAE about −8
residual sd) and rarely go into profit first. Lesson-book (L) trades are short (median 3 days) and are mostly flips of
a signal sitting near zero.

## 2. The noise threshold (snippet #1's method)

Among C trades that went at least m against them, what did holding on earn **from that point on** (final + m)?

| m (res-sd) | 1.0 | 2.0 | 3.0 | 4.0 |
|---|---|---|---|---|
| fx8 IS: share reaching it / after-touch mean | 75% / +1.02 | 62% / +1.15 | 46% / +0.92 | 36% / +0.97 |
| fx8 OOS | 67% / +0.11 | 58% / +0.63 | 47% / +0.70 | 44% / +1.44 |
| wide10 IS | 71% / +0.86 | 62% / +1.41 | 47% / +1.55 | 39% / +1.76 |
| wide10 OOS | 66% / +0.50 | 50% / +0.13 | 43% / +0.62 | 35% / +0.88 |

Win rates fall as MAE deepens (fx8 OOS: 47% at m = 1 to 27% at m = 4). But the after-touch mean stays **positive at
every depth in both halves**. So there is **no noise threshold inside 4 residual sd**: an adverse move of any size up
to 4 sd still leaves a trade worth holding on average. On this distribution, a stop placed by MAE would cut trades
that, as a group, still recover.

## 3. The two stops Chris asked about (C trades, mean result per trade, res-sd)

| Rule | fx8 IS | fx8 OOS | wide10 IS | wide10 OOS |
|---|---|---|---|---|
| no stop | **+1.11** | **+1.09** | **+1.18** | **+1.07** |
| z stop 2.0 | +0.56 | +0.40 | +0.34 | +0.64 |
| z stop 2.5 | +1.07 | +0.84 | +0.73 | +0.83 |
| z stop 3.0 | +1.03 | +1.00 | +1.23 | +1.02 |
| time stop 5 d | −0.25 | +0.32 | +0.38 | +0.19 |
| time stop 10 d | −0.03 | +0.36 | +0.37 | +0.10 |
| time stop 20 d | +0.02 | +0.52 | +0.33 | +0.42 |
| time stop 40 d | +0.51 | +0.60 | +0.57 | +0.71 |

- **Time stops hurt in every cell.** The winners take a median of about four weeks, so any time stop shorter than the
  typical hold cuts them before the pull arrives.
- **A tight z stop (2.0) halves the result.** A z of 2.0 is only 0.5 beyond the 1.5 entry, well inside the noise.
  At 2.5 it costs a little; at 3.0 it's roughly neutral (it is a disaster stop only).
- Same pattern on the lesson book with costs (net Sharpe IS/OOS): fx8 none −0.04/+0.41, z3.0 −0.04/+0.40, t5
  −0.21/−0.49, t10 −0.47/−0.08; wide10 none −0.49/+0.05 and no stop makes it positive in both halves.

## 4. Side finding: the threshold rule itself (a lead, not a result)

The C trades are positive in both halves on both baskets. Date-block bootstrap (63-day blocks, B 2000): fx8 t 2.75
IS / 2.06 OOS, wide10 2.65 / 2.24. That is positive in most entry years and broad across currencies. Run as a real
costed, factor-neutral book (`stops.py book`):

| Threshold book, net Sharpe | IS | OOS | IS 2× cost | OOS 2× cost |
|---|---|---|---|---|
| fx8 | **+0.43** | **+0.38** | +0.34 | +0.27 |
| wide10 (with metals) | −0.10 | −0.10 | −0.24 | −0.24 |

**Why this is a lead and nothing more:**
1. It is exploratory and was suggested by q1's own bucket table, which had already been seen (the extremes leaned the
   right way in both halves; the middle didn't).
2. As money, a Sharpe of about 0.4 over five years per half is only t ≈ 1. The residual-unit t of about 2–3 overstates
   it, because residual units ignore how the hedged position is built and sized.
3. With metals it doesn't survive costs.

The only clean test is a **pre-registered forward record**: the frozen FX8 model with entry |z| ≥ 1.5 and exit at home,
no stop (or a 3.0 disaster stop), judged on new data.

## What to tell Chris (our read, for the Discord)

- C.OG's order is right, and on this model the distribution answers his question: **don't add a time stop**; winners
  need about a month. **If he uses a z stop, keep it wide (around 3)** as a disaster stop only. Tight z stops and
  MAE-based stops cut trades that still recover on average.
- The real risk is the fat losing tail (median loser MAE about −8 residual sd, p10 about −15): residuals that become
  trends. In our data that was mostly the metals. Sizing small and capping per-instrument exposure handles that tail
  better than a stop.
- His own trade log with intraday MFE/MAE is what decides it for **his** version. `trades_C_*.csv` shows the columns
  to keep.

Caveats: daily-close MAE; residual-sd units; no swap/carry; the stop grid is 7 cells per definition (best-of-7 noise
≈ 1.3 SE), so read the pattern across cells, not the best cell.
