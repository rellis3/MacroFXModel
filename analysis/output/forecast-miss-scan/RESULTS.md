# forecast-miss-scan — results

Prereg: `forge/FORECAST_MISS_SCAN_PREREG.md` (committed `dbdfa10d`, 2026-10-27, before the run). Run 2026-10-27, seed 20261027.
Ledger ids: `forecast-miss-scan` (family), `forecast-miss-shock-idx`, `forecast-miss-shock-fx`, `forecast-miss-month-end-fx`.

## Verdict: 18 of 34 cells survived discovery (BH q 0.10); 8 confirmed on the untouched 2023–2026 half

The outcome is the shipped range forecast's error (realised HL ÷ forecast p50) on 52,486 out-of-sample instrument-sessions, scored per date and class. Discovery covered 2020-08 → 2023-08 and confirmation 2023-08 → 2026-08. A cell confirmed if it had the same sign, a 95% CI excluding 0, and sat outside the shift placebo.

| Class | Condition (known before the London open) | Discovery | Confirmation [95% CI] | Corr. with S&P 20d | Within S&P-20d middle tercile | |
|---|---|---|---|---|---|---|
| idx | S&P fell over 5 days | +11.5% | **+13.1%** [+7.5, +19.5] | 0.46 | +11.8% | CONFIRMED |
| idx | VIX rose over 5 days | +9.9% | **+13.0%** [+7.1, +19.7] | 0.20 | +16.6% | CONFIRMED |
| fx | VIX high | +9.8% | **+6.2%** [+0.9, +11.4] | 0.53 | +4.2% | CONFIRMED |
| fx | S&P fell over 60 days | +8.3% | **+8.0%** [+2.9, +13.1] | 0.50 | +6.7% | CONFIRMED |
| fx | VIX inverted (VIX/VIX3M high) | +7.1% | **+6.5%** [+1.1, +11.8] | 0.57 | +2.2% | CONFIRMED |
| fx | S&P fell over 5 days | +6.2% | **+9.8%** [+4.5, +14.9] | 0.46 | +4.9% | CONFIRMED |
| fx | VIX rose over 5 days | +5.5% | **+9.1%** [+3.8, +14.6] | 0.20 | +8.4% | CONFIRMED |
| fx | **Month-end** (last 2 / first 2 sessions) | +4.8% | **+11.6%** [+6.2, +16.8] | 0.00 | +13.0% | CONFIRMED |

Survived discovery but did not confirm:
- idx MOVE level (+3.5%), VIX term (+4.7%), rrp_level (+8.6% but inside its placebo), NQ 20d, US 2-year and 10-year 20-day moves;
- fx credit 20d (+0.5%), NQ 20d (+4.5%, CI touches 0), MOVE.

Not discovered (|p| > BH line): recent-miss streaks (fx +3.8%, idx +2.8%), the dollar 20d, USDJPY 20d, both basis changes, idx month-end (+0.3%), RRP for FX.

Reference (validated earlier, not counted): S&P 20-day fall, fx +5.3% → +6.5%, idx +6.6% → +6.8%. It **replicates in both halves**.

## Two mechanisms

1. **Equity and volatility shocks** (all confirmed cells except month-end). Short-memory shocks matter more than the 20-day drawdown:
   - a 5-day S&P fall or VIX jump: +13% on indices;
   - the VIX jump is largely independent of the 20-day drawdown (r 0.20; +16.6% within its middle tercile).
2. **FX month-end**, unrelated to equities (r 0.00). Mechanism check (`month_end_check.json`, post-hoc, describe only):
   - on sessions the forecast tagged with no event: last 2 +6.3%, first 2 +6.6%;
   - positive in 6 of 7 years (2025 −1%);
   - stronger in 2023–26 (+8 to +11% event-free).

   It is consistent with month-end FX fixing and rebalancing flows. The forecaster has no month-end multiplier.

## The pattern behind both: the forecast is a little too wide when calm, and too narrow under stress

`shadow_factors.json` (full sample, in-sample; for the forward shadow only):

| Conditions active (FX: 5d S&P fall, 5d VIX rise, VIX high, VIX inverted, 60d S&P fall) | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| FX realised ÷ forecast | ×0.95 | ×0.98 | ×1.00 | ×1.00 | ×1.06 | ×1.15 |

| Index conditions active (5d S&P fall, 5d VIX rise) | 0 | 1 | 2 |
|---|---|---|---|
| Index realised ÷ forecast | ×0.96 | ×1.02 | ×1.06 |

FX month-end days: ×1.067 (other days ×0.986).

## Deviations from the prereg

- Ledger entries are grouped by mechanism (shock-idx, shock-fx, month-end-fx) rather than one per confirmed cell. Every confirmed cell is listed in its entry; the verdicts are unchanged.
- The month-end mechanism check and the shadow factors are post-hoc descriptions.

## What this changes

- **The shipped range lines have two systematic, confirmed misses:** too narrow after equity/vol shocks (FX and indices), and too narrow for FX at month-end. They are slightly too wide in calm conditions.
- Per prereg §8, a **stress-count shadow** (amendment A1) is fixed now, before any forward data, to run beside the drawdown shadow. Nothing changes the shipped lines until a shadow's forward record passes and the owner decides.
