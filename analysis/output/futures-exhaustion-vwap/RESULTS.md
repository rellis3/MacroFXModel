# futures-exhaustion-vwap — results

Prereg: `forge/FUTURES_EXHAUSTION_VWAP_PREREG.md` (committed in `1db4baba`, 2026-11-17, before any outcome). Run
2026-11-17, seed 20261117, B = 2000 (London-day block bootstrap). Branch `main`. Ledger id: `futures-exhaustion-vwap`.
Script `scripts/futures-exhaustion-vwap/run.py` → `results.json`, `cells.csv`, `trades.parquet` (gitignored).
Page: `futures-research.html` (Research menu).

## Verdict: UNDERPOWERED (registered rule), with the well-powered cells ruling an edge out

No cell passed. Under BH q = 0.10 across 117 cells, **0 survived discovery**: 115 of 117 discovery means are negative
after cost, the best one-sided p is 0.48, and so nothing reached the holdout gate. The registered NULL rule needed every
baseline cell's 95% CI to sit below +0.10R; the p50 and p75 baselines do (NQ p50 [−0.081, +0.003], 6E p50
[−0.159, −0.067], GC p50 [−0.159, −0.066]; p75 uppers +0.037 / −0.013 / +0.002), but the thin p90 baselines don't
(holdout uppers up to +0.21R), so the word is UNDERPOWERED. In plain terms: where there is enough data, a 0.10R edge
is excluded; at p90 there are too few touches to exclude it, and the point estimates there are negative too.

## Scored cells (baseline = every touch; discovery 2016-03 → 2022, holdout 2023 → 2026-08-20; net R after cost)

| Cell | n disc / hold | MDE | Disc mean [95% CI] | Holdout mean [95% CI] | Placebo hold |
|---|---|---|---|---|---|
| NQ p50 | 10,847 / 6,000 | 0.03 | −0.038 [−0.081, +0.003] | −0.036 [−0.096, +0.024] | −0.019 |
| NQ p75 | 5,144 / 2,943 | 0.05 | −0.045 [−0.129, +0.037] | −0.006 [−0.106, +0.098] | −0.056 |
| NQ p90 | 2,326 / 1,219 | 0.09 | −0.145 [−0.273, −0.013] | −0.009 [−0.192, +0.206] | +0.017 |
| 6E p50 | 8,481 / 4,204 | 0.04 | −0.114 [−0.159, −0.067] | −0.157 [−0.222, −0.089] | −0.094 |
| 6E p75 | 4,432 / 1,945 | 0.06 | −0.088 [−0.164, −0.013] | −0.022 [−0.139, +0.093] | −0.044 |
| 6E p90 | 1,504 / 685 | 0.10 | −0.199 [−0.317, −0.070] | −0.238 [−0.423, −0.044] | −0.048 |
| GC p50 | 8,004 / 4,538 | 0.04 | −0.112 [−0.159, −0.066] | −0.017 [−0.083, +0.052] | −0.039 |
| GC p75 | 3,327 / 2,059 | 0.07 | −0.082 [−0.169, +0.002] | −0.093 [−0.224, +0.027] | −0.055 |
| GC p90 | 1,614 / 988 | 0.11 | −0.064 [−0.216, +0.092] | −0.063 [−0.262, +0.145] | −0.073 |

Exhaustion conditions, mean over the 9 instrument × rung cells (discovery / holdout net R): baseline −0.099 / −0.071;
stretch hi −0.096 / −0.081; range used hi −0.128 / −0.061; speed hi −0.094 / −0.056; speed lo −0.115 / −0.085;
approach volume rising −0.085 / −0.032; volume fading −0.104 / −0.115; repeat touch −0.098 / −0.071; pairs −0.12 to
−0.22 / −0.05 to −0.09. **No exhaustion feature moves the fade above the unfiltered baseline.** Full grid in `cells.csv`.

## Controls

- **Placebo ladders** (×0.85 / ×1.15): holdout net −0.02 to −0.09R, the same as the forecast lines.
- **Mirror (continuation, same distances):** gross +0.05 (NQ), −0.005 (6E), +0.02 (GC); net negative.
- **2× cost:** every cell more negative.

## Decomposition of the null (owner rule 2026-10-27)

- **Geometry:** the frozen VWAP sits a median 1.9–2.0× the stop distance away (NQ p50 target 142 ticks vs stop 105).
  Fade outcomes: target 28–31%, stop 54%, still open at 22:00 15–19%. For a random walk the chance of reaching a
  target 2× the stop first is 1/3; observed target ÷ (target + stop) = 34–36%. **Gross R is −0.004 to −0.013 on all
  three markets**: what a coin-flip path gives with this payoff shape.
- **The VWAP target is reachable and the payoff is asymmetric, but the hit rate drops in exact proportion.** Nothing
  at the touch tilts the race.
- **Cost:** 2.4–2.8 ticks round trip = 0.03–0.11R on a 0.25σ stop, which takes a zero gross to the negative nets above.
- **Skipped:** 4–6% of touches had VWAP on the wrong side of the line (no fade target).

## Deviations from the prereg

None. The NULL/UNDERPOWERED rule was applied exactly as written (it is strict at p90).

## What this changes

Exhaustion read at the touch (VWAP stretch, range already used, approach speed, approach volume, repeat touch) does not
turn the vol lines into a fade toward VWAP on NQ, 6E or GC futures. With the VWAP target the trade is a fair coin before
cost, as every earlier line-touch test found. The lines stay size rulers. What would reopen it: an exhaustion read that
is not available at the touch minute (confirmation after the touch, order-flow delta), pre-registered as a new slug.
