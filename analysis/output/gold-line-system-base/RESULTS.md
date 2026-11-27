# gold-line-system-base: results (gold)

**Setup**
- Prereg: `forge/GOLD_LINE_SYSTEM_BASE_PREREG.md` (f2b218d4, pushed before the run). Script:
  `scripts/gold-line-system-base/run.py`. Seed 20261127. Page: `gold-line-system.html`.
- **The system:** gold's 18 shadow lines → Jordan's gold entry (arm then retest, cancel, chase) → target VWAP ± 0.5σ_v
  → stop S1 (0.15 × open→P90) or S2 (Jordan's rolling MAE, 3 months, per line).
- **Data:** GC M1 with volume, 2021 → 2026-08-21. IS 2021–22, OOS 2023 → 2026-08-21. Pessimistic fills, costs on.
- **Positive control:** cut back to the earlier study's 4 lines from 2020, the engine fills the same 957 trades
  (+0.102R vs +0.112R; the gap is the registered no-target-on-the-fill-bar rule).

## The two pre-registered tests

| | IS R | OOS R [90% CI] | OOS trades | OOS total | Before costs | PF | Fake lines (mean / p95) | Real lines' percentile | p | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| **S2: rolling-MAE stop** | +0.044 | **+0.106 [+0.032, +0.160]** | 2,119 | **+224R** | +0.202 | 1.16 | +0.037 / +0.090 | 96th | 0.008 | **VALIDATED** |
| S1: 0.15 × P90 stop | −0.000 | +0.040 [−0.004, +0.085] | 2,105 | +85R | +0.089 | 1.07 | +0.004 / +0.040 | 95th | 0.080 | UNDERPOWERED |

BH over the two tests passes for both. S1 fails because its CI touches 0, IS is not above 0, and it doesn't beat the
placebo p95.

**S2 by year:** 2021 −0.014, 2022 +0.101, 2023 +0.104, 2024 +0.052, 2025 +0.140, 2026 +0.143. OOS halves: +0.112 / +0.101.
25 of 44 OOS months are positive; the worst month is −23R and the maximum drawdown −64R.

## Checks on the strong result (post-hoc, describe only)

- **Robust to:**
  - a $1 stop floor instead of $0.50: +0.102;
  - double slippage ($0.20 each way): +0.049, total +103R;
  - the split of the OOS period.
- **Concentrated in the big winners:**
  - It is a positive-skew system: 7% of trades make more than 3R, and the largest makes 24.5R.
  - Without the top 1% of trades (21), the OOS total is −56R.
- **Concentrated in small stops:**

  | Stop size (OOS quintile) | Median stop | Net R a trade | Total |
  |---|---|---|---|
  | Smallest fifth | $1.32 | +0.201 | +85R |
  | Second | $2.85 | +0.218 | +92R |
  | Middle | $4.39 | +0.060 | +25R |
  | Fourth | $7.97 | +0.078 | +33R |
  | Largest fifth | $15.96 | −0.028 | −12R |

  Most of the edge sits where M1 fills and slippage matter most. That needs tick data or a forward record before it's
  trusted.
- **By line (OOS):**
  - Lower lines (longs) +0.153 vs upper lines (shorts) +0.063.
  - HL projection down +119R, OL +83R, Close− −48R.
  - P50 lines −0.025 a trade; P75 +0.360; P90 +0.256.
  - These are descriptive. Dropping P50 is a candidate for a new pre-registration, not a change to this result.

## Every variant (OOS, 18 lines)

- **S2 (rolling MAE per line):**
  - the VWAP targets (± 1σ, ± 0.5σ, VWAP) all give +0.08 to +0.11 with BE on or off, CIs above 0;
  - the line-inside target gives +0.056 / +0.059.
- **S2 pooled stop:** +0.055 to +0.083. **σ-scaled 6 months:** +0.042 to +0.076. **S1:** +0.010 to +0.046.
- **4 lines only (OH/OL P75/P90):** S1 +0.158 [+0.058, +0.264], S2 +0.258 [+0.052, +0.360] on about 550 trades: higher
  per trade, fewer trades.
- **Break-even:** makes little difference to the mean; it lifts PF (1.16 → 1.22) and cuts stop-outs (59% → 40%).

## Answer

On gold, the system as described (shadow lines → Jordan's gold entry → VWAP ± 0.5σ target) with Jordan's rolling-MAE
stop makes **+0.106R a trade out of sample, +224R over 2023 → Aug 2026**. It sits above fake lines and has been
positive every year since 2022. **VALIDATED** by the pre-registered gates.

With the 0.15 × P90 stop it is weaker (+0.040, UNDERPOWERED). The stop rule matters: Jordan's rolling MAE is the better
stop.

**Before it is trusted:** the profit comes from rare large winners on small stops. Next:
1. NQ and EURUSD with the same frozen rules (Jordan's three-way comparison).
2. A tick-data or forward check of the small-stop fills.
3. The one-time lockbox run (after 2026-08-21) at the end.

No live change.


## Replication on NQ and EURUSD (amendment A2, frozen gold rules)

The same system, not re-tuned: 18 shadow lines, Jordan's gold entry, VWAP ± 0.5σ_v, rolling-MAE stop of 3 months per
line, BE off. Costs 1 tick in, 1 out, 1 commission.

| | IS R | OOS R [90% CI] | OOS trades | OOS total | Before costs | PF | Fake lines (mean / p95) | Real lines' percentile | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **GOLD** (from above) | +0.044 | +0.106 [+0.032, +0.160] | 2,119 | +224R | +0.202 | 1.16 | +0.037 / +0.090 | 96th | **VALIDATED** |
| **NQ** | −0.011 | +0.153 [+0.065, +0.236] | 2,464 | +376R | +0.193 | 1.21 | **+0.115** / +0.181 | 87th | UNDERPOWERED |
| **EURUSD** | −0.065 | −0.089 [−0.153, −0.014] | 1,812 | −162R | +0.087 | 0.87 | −0.053 / −0.004 | 14th | NULL |

**The mirror (pre-registered): neither passes, so the line effect is gold-only, flagged as possibly specific to gold.**

- **NQ makes money, but not because of the lines:**
  - +0.153R a trade OOS, +376R; every year from 2022 on is positive (+0.04, +0.09, +0.12, +0.20, +0.25).
  - The same system on fake lines also makes +0.115R. The edge on NQ is the mechanism (gold entry + VWAP target +
    rolling-MAE stop), not where the lines sit. IS (2021–22) is −0.011.
  - Longs +0.259 vs shorts +0.034 in a strongly rising NQ (2023–26): part of it is fading dips in an uptrend. The fake
    lines get the same drift, which is why they score well too.
  - Every S2 variant on NQ is positive with a CI above 0 (+0.09 to +0.19).
- **EURUSD makes money before costs and loses after:**
  - +0.087R before costs, −0.089R after. The median stop is about 9 pips, so 3 ticks (1.5 pips) of costs are about
    0.17R a trade.
  - The 1-tick commission is conservative for 6E (about 0.4 tick in practice). Jordan scores without spread, but the
    pre-registered costs stand, and the real lines are below fake lines (14th percentile).
- **Reading:**
  - The mechanism (Jordan's entry + VWAP band + rolling-MAE stop) is positive before costs on all three, and on gold and
    NQ after costs.
  - Only on gold do the shadow lines add something over fake lines.
  - Graded weight: for the mechanism as a cross-market candidate component; gold's line effect stays a single-market
    result until it has a forward record.
