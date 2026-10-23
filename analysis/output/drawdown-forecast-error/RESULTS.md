# drawdown-forecast-error — results

Prereg: `forge/DRAWDOWN_FORECAST_ERROR_PREREG.md` (committed 2026-10-22, before the run). Run 2026-10-22, seed 20261022, B = 2000.
Branch `main`. Ledger ids: `drawdown-forecast-error-fx`, `drawdown-forecast-error-idx`.

## Verdict: VALIDATED (fx) · VALIDATED (idx)

After the S&P 500 has fallen over the previous 20 days (known before the London open), markets move further than the desk's shipped range forecast. The test covered 52,486 out-of-sample sessions, 2020-08 → 2026-08.

| Cell | Sessions | Top − bottom tercile (realised ÷ forecast) | 95% CI | Halves | Placebo 95% | Holm p | |t| | Verdict |
|---|---|---|---|---|---|---|---|---|
| fx (29 pairs) | 1,556 | **+5.9%** | [+2.2%, +9.3%] | +4.6% / +6.9% | [−3.7%, +3.4%] | 0.001 | ≈3.2 | VALIDATED |
| idx (6 indices) | 1,547 | **+6.6%** | [+2.9%, +10.4%] | +6.0% / +7.3% | [−4.0%, +4.1%] | 0.001 | ≈3.3 | VALIDATED |

## Where the miss sits (descriptive, by quintile of the S&P's 20-day move)

| S&P over the previous 20 days | FX: realised ÷ forecast | FX: beat the 75% line | Indices: realised ÷ forecast | Indices: beat the 75% line |
|---|---|---|---|---|
| Up more than ~4% | −1.2% | 22.9% | −3.4% | 21.0% |
| Up 2.5–4% | −2.2% | 22.2% | −2.0% | 23.2% |
| Up 0.8–2.5% | −1.8% | 22.1% | −1.4% | 22.6% |
| Down 2% → up 0.8% | −0.8% | 23.2% | +1.4% | 24.3% |
| **Down more than ~2%** | **+6.7%** | **29.4%** | **+2.8%** | **25.0%** |

- **FX:** the forecast is fine or slightly wide in four-fifths of conditions, and **too narrow by about 7% after a meaningful S&P fall**. The 75% line is then beaten 29% of the time instead of 25%.
- **Indices:** a smooth gradient, too wide after rallies and slightly too narrow after falls. Their implied vol absorbs part of it, but not all.

## Controls and splits

- **Shift placebo:** centred on 0 (±3.5–4%); the observed values are well outside it.
- **With and without implied vol** in the forecast: FX majors with IV +5.2%; FX without IV +6.6%; indices (all carry IV) +6.6%. IV narrows the miss but does not remove it.
- **Other windows** (descriptive): FX after a 5-day fall +7.8%, after a 60-day fall +8.5%. Indices after a 5-day fall +12.7%, after a 60-day fall +3.0%. For indices it is a short-memory effect.
- **Gold:** −1.5%. Gold does not share it.

## Deviations from the prereg

None.

## What this changes

- **Validated, research-only:** after the S&P has fallen more than about 2% over 20 days, the shipped range lines run too narrow, by about 7% for FX and 3–6% for indices.
- Per prereg §8, the next step is a **shadow band** logged beside the shipped forecast: forecast × the measured factor on drawdown days. It never replaces the forecast (side-by-side rule), and its own forward record starts. Promotion needs |t| ≥ 3 (met here, about 3.2) **and** the forward record.
- This also closes the loop on the credit thread. The real thing behind the high-yield signal is the stock market's own drawdown, and it maps onto a measurable, fixable miss in the forecaster.
