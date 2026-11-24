# bias-day-trade — RESULTS (run 2026-11-24)

Prereg: `forge/BIAS_DAY_TRADE_PREREG.md` (pushed 2026-11-24 in `e9d59ce5`; A1 h4-trend arm `df148fc0` and A2 VIX
stamp `1f0a3d6f` both before any outcome). Scripts: `scripts/bias-day-trade/` (`score.py`, `h4_parity.py`). Seed
20261124, 21-session date-block bootstrap B 2000, random-side placebo 500 shuffles (sides permuted within market, so
each market's long/short mix and therefore its drift stays in the placebo). London sessions 2016-10-24 → 2026-08-20,
OANDA bid/ask M1, real spread on every fill.

**Question.** Open at 00:00 London on the bias engine's side, close at 21:00 (E21) or at midnight (E24): does it make
money after costs, and do some assets reliably move with or against the bias? Does trading only the bias side rescue
the line trades that lose (`trade-at-lines`)? Same for the 4-hour trend (h4-trend) as a comparison.

**Answer: no.**
- **Neither signal makes money from 00:00 in any group.** V1 and the 4-hour trend come out the same.
- **FX:** loses the spread whichever way you trade it. Following the bias and fading it are both negative, so there is no direction in it.
- **Gold:** leans the bias's way, but it's too thin to call (UNDERPOWERED).
- **Indices:** the bias's apparent edge is just drift: they go up, and the bias is long two-thirds of the time.
- **Line trades:** taking only the bias's side lifts them by about +0.07R, but they still lose money.

## Checks before reading any cell

- **Plant control.** Adding 0.06σ × side was recovered in 100% of 200 draws, and the planted value sat at the 100th
  percentile of the placebo.
- **Session cuts.** Audited by hand on EURUSD 2024-07-15 (BST) and 2024-01-15 (GMT): entry/exit fills equal the raw
  bid/ask bars exactly (net R 0.3008 both ways).
- **4-hour trend port.** Matches the live JS `h4Slope` on 30 of 30 synthetic series.
- **Replay coverage.** The 00:00 replay has the same drivers as the banked 07:00 replay, within one day per driver,
  after the A2 fix (before it, VIX was dropped on summer-time days). The CHF policy proxy covers 982 days vs 899,
  because the yields were fetched fresh.
- **Coverage gap.** DE30 and UK100 have no bid/ask bars at 00:00 London (the DAX file starts 06:00), so they are not
  scored. The indices group is the 4 US indices; US2000 has 2,112 sessions.

## Scored cells (net R per call; "with" = trade the side, "against" = fade it)

### V1 bias engine (00:00 London issue)

| Cell | n | Long share | Gross | Placebo pct | With (net) | 95% CI | Against (net) | MDE | Bar | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| fx, to 21:00 | 11,788 | 51% | −0.002 | 68 | −0.059 | [−0.093, −0.028] | −0.055 | 0.026 | 0.04 | **NULL** |
| gold, to 21:00 | 979 | 42% | +0.048 | 91 | +0.019 | [−0.058, +0.090] | −0.076 | 0.104 | 0.04 | **UNDERPOWERED** |
| idx, to 21:00 | 5,286 | 66% | +0.023 | 75 | +0.009 | [−0.043, +0.059] | −0.036 | 0.036 | 0.04 | **NULL** |
| fx, to midnight | 11,569 | 51% | −0.010 | 55 | −0.086 | [−0.119, −0.057] | −0.066 | 0.029 | 0.05 | **NULL** |
| gold, to midnight | 982 | 42% | +0.053 | 94 | +0.016 | [−0.056, +0.082] | −0.089 | 0.109 | 0.05 | **UNDERPOWERED** |
| idx, to midnight | 5,296 | 66% | +0.008 | 23 | −0.007 | [−0.059, +0.045] | −0.024 | 0.037 | 0.05 | **NULL** |

### 4-hour trend (h4-trend, 00:00 London)

| Cell | n | Gross | Placebo pct | With (net) | 95% CI | Against (net) | MDE | Verdict |
|---|---|---|---|---|---|---|---|---|
| fx, to 21:00 | 67,595 | −0.004 | 13 | −0.060 | [−0.076, −0.043] | −0.052 | 0.011 | **NULL** |
| gold, to 21:00 | 2,413 | +0.031 | 88 | +0.002 | [−0.038, +0.043] | −0.060 | 0.065 | **UNDERPOWERED** |
| idx, to 21:00 | 9,298 | +0.004 | 37 | −0.010 | [−0.045, +0.026] | −0.018 | 0.029 | **NULL** |
| fx, to midnight | 66,440 | −0.008 | 2 | −0.083 | [−0.099, −0.066] | −0.067 | 0.012 | **NULL** |
| gold, to midnight | 2,425 | +0.023 | 79 | −0.015 | [−0.057, +0.026] | −0.062 | 0.061 | **UNDERPOWERED** |
| idx, to midnight | 9,291 | −0.006 | 9 | −0.022 | [−0.056, +0.013] | −0.011 | 0.031 | **NULL** |

Median round-trip cost from 00:00: **FX 0.048R, gold 0.022R, indices 0.010R.**
- **FX:** gross is about zero (no skill), so the spread is the whole result. Following and fading both lose roughly the
  cost.
- **Gold:** gross +0.05R on the bias side, which halves after costs.
- **The "against" side:** loses in every cell. No group is reliably wrong, so there is nothing to fade either.

## Head-to-head, V1 against the 4-hour trend (descriptive)

- **Agreement.** On the 18,307 market-days where V1 speaks, they agree 66% of the time.
- **Difference.** V1 − 4-hour trend, net, is +0.004R [−0.033, +0.038] pooled, and within ±0.01 in every group. V1 adds
  nothing over the price trend.
- **When the two agree vs disagree (descriptive):**

  | Group | V1 net when they agree | V1 net when they disagree |
  |---|---|---|
  | Gold | +0.046 | −0.037 |
  | Indices | +0.022 | −0.017 |
  | FX | −0.050 | −0.047 |

## Line part: does the side filter rescue the line trades?

The trades are the `trade-at-lines` list (NQ, gold, EURUSD; real lines; 2018 → 2026-08-20). Columns are mean net R per
trade.

| Rule | All trades | With V1 | 95% CI | Against V1 | With − all | 95% CI | With − against | Halves (with) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| FADE-L | −0.102 | −0.030 | [−0.067, +0.010] | −0.102 | **+0.072** | [+0.037, +0.109] | +0.072 | −0.047 / −0.013 | **NULL** |
| FADE-Z | −0.140 | −0.118 | [−0.163, −0.072] | −0.148 | +0.022 | [−0.016, +0.062] | +0.031 | −0.135 / −0.100 | **NULL** |
| FOLLOW | −0.081 | −0.015 | [−0.072, +0.042] | −0.109 | **+0.066** | [+0.016, +0.117] | +0.094 | −0.005 / −0.026 | **NULL** |

- **V1 picks the better side.** On FADE-L and FOLLOW the bias side beats all trades by about 0.07R, and that interval
  excludes 0.
- **It doesn't make them pay.** The trades it keeps still lose in both halves. The useful size, +0.05R, is outside the
  net interval for every rule (the `trade-at-lines` NULL rule; A3).
- **NQ.** The one positive: NQ FOLLOW with V1 at +0.070 (descriptive).
- **4-hour trend as the filter.** Adds only +0.016 / +0.023 / +0.017. With V1 the gain is about four times larger, but
  V1 also leaves about 62% of days un-called (bias neutral). It's a candidate, not a result.

## Disaggregation (BH q 0.10; candidates only, never results)

- **Per market:** 0 of 64 market × side tests pass BH, for V1 and for the 4-hour trend, at either exit (3.2 expected by
  chance). The best V1 market is EURJPY at +0.057; the worst is AUDCAD at −0.295 with the bias and +0.141 against it
  (n 219). Neither passes.
- **By year (V1, 21:00):**
  - FX is negative after costs in every year, 2016 to 2026.
  - Gold is positive in 7 of 11 years.
  - Indices swing between +0.20 and −0.10 with the market's direction.
- **By strength (V1, 21:00):** FX does not grade (3–4 / 5–6 / 7+ = −0.049 / −0.046 / −0.042). Indices at strength 7+
  reach +0.072 (n 458; descriptive). Gold is not monotonic.

## What it means

- **Yes, the bias can be backtested.** The live V1 code is replayed point in time, and this is the second full test
  (07:00 entry banked 2026-11-16, 00:00 entry here). V2 can't be replayed; its record is forward-only from 2026-11-23.
- **As a trade on its own (midnight to 21:00 or midnight to midnight):** V1 has no edge after costs in FX or indices,
  and gold is too thin to call. It is no better than the 4-hour price trend.
- **Where it may still help: as a side filter.** It picks the less-bad side of the line trades by about 0.07R, but not
  enough to make them pay.
- **Candidates for a forward record or a lockbox prereg** (not results):
  - gold on the bias side;
  - V1 and the 4-hour trend agreeing on gold and indices;
  - V1 as a side filter on NQ FOLLOW.
