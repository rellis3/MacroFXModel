# nq-forecast-target-ev: results

- **Prereg:** `forge/NQ_FORECAST_TARGET_EV_PREREG.md`. The prereg and register row were pushed in commit 639f1136 before any strategy outcome was computed.
- **Script:** `scripts/nq-forecast-target-ev/run.py`, seed 20261102. Run once on 2026-11-02.
  - A first attempt crashed writing to a missing output folder before printing anything. The mechanics check had run on its own beforehand (`--check`).
- **Outputs:** `results.json`, `trades.csv` (every strategy, every session), `equity_usd_nq.csv`, `monthly_usd_nq.csv`.
- **Window:** 1,550 point-in-time London sessions, 2020-08-24 → 2026-08-20. The lockbox was not read.

## Verdict

**`nq-forecast-target-ev`: UNDERPOWERED by the frozen rule** (paired MDE 0.024% > 0.020%). **Decision: reject the construction.**

1. **The primary trade made money only because NQ drifted up.**
   - P1 (long at the London open, limit exit at open + O→C p75, else out at 22:00) netted **+0.027% per trade (+4.3 pts, +$86 per NQ contract), 95% CI [−0.029, +0.086], t 0.9**. That is not significant.
2. **The target makes the trade worse than no target.** Plain open → 22:00 long (B1) made +0.054%.
   - **P1 − B1 = −0.026% [−0.050, −0.003].** The forecast target cuts off the right tail of a drifting index. It lost to "just hold" in 63% of months.
3. **The forecast adds nothing over non-forecast targets of the same size.**
   - P1 − trailing-quantile target (B2): **+0.002% [−0.013, +0.020]**.
   - P1 − ATR target (B3): **+0.001% [−0.011, +0.014]**.
   - Same-quarter shuffled forecast (B4): P1 sits at the 81st percentile, below the 95th needed.
   - The development and validation halves disagree in sign against B2 (−0.008 / +0.012).
   - Every gate condition fails (0 of 4).
4. **What the intervals rule out.** A forecast-specific advantage larger than about 0.014–0.020% per trade (about 2–3 pts, $50–60 per NQ contract) is excluded.
   - The frozen rule needed the paired MDE ≤ 0.020% to call this NULL. Against B2 it is 0.024%, so the word is UNDERPOWERED. Against B3 alone (0.018%) it would have been NULL.
   - The point-estimate margins over the controls are smaller than a third of one cost unit, so the §8 "promising but unconfirmed" reading is demoted (Amendment A1).

**`nq-forecast-oc-hl-calibration`: CONTEXT.**
- Both rungs are well calibrated.
- Both beat an unconditional trailing quantile clearly.
- Neither beats a plain recent-ATR scaling with a CI above zero.
- So the forecast is a good **size** ruler, and its edge over a simple ruler is small. No combined rule is warranted under the prereg's frozen decision rule (§3).

## 1. Forecast-definition audit (summary; full text in prereg §0)

| | O→C | H→L | O→H / O→L |
|---|---|---|---|
| Meaning | \|close − open\| reaches this | session range reaches this | high (low) reaches open ± this |
| Signed? | **no: a size, both directions** | no: a width, never a level | yes: one side each |
| Unit | % of the London-midnight open | % (width) | % of open |
| Construction | fitted quantile of (realised ÷ σ) × σ_used; σ from prior NY-close bars; event multiplier; walk-forward folds | same | same, fitted separately |
| Fixed at the open? | yes | yes | yes |
| Point-in-time history | 2020-08-24 → (fold 0 trained to 2020-08-20); earlier rows are in-sample and excluded | same | same |

- The session runs from 00:00 London (the first M1 bar's open) to the last M1 bar before 22:00 London.
- The rebuild reproduces the forecast history:
  - opens match to 5e-8 (CSV rounding);
  - signed O→C, O→H and O→L match to 0.0001%;
  - the vectorised target rule matches the path simulation to 0.00005%.
- **Ambiguity resolved before testing.** "Exit at the p75 open-to-close" can only be an *upward* target if the unsigned O→C size is applied above the open. That reading is P1.
  - The forecast's own upside quantity is O→H, tested as S2.
  - H→L was never turned into a level, because the engine itself refuses to (`ladderLevels`).

## 2. Frozen hypothesis (as run)

- **Entry:** long 1 contract at the session open. Every session traded (100%, n = 1,550).
- **Target:** limit at open × (1 + O→C p75), filled at the target on the first M1 high ≥ target. The average target was 1.44% (about 1.1σ).
- **Stop:** none in P1 (the suggestion had none). The one stop variant, S3, uses open × (1 − O→L p75).
- **Exit:** otherwise at the close of the last bar before 22:00 London. No overnight financing.
- **Cost:** 0.0068% round trip (OANDA NAS100 model), with 0/2/3× sensitivity.
- **Sizing:** fixed 1 NQ ($20/pt; MNQ = 1/10 of every $ figure). The average notional is about $349k per NQ contract.

## 3. Forecast analysis (Parts A and B)

### A. Open-to-close

| rung | \|O→C\| exceeds (target) | close above open + rung | close below open − rung |
|---|---|---|---|
| p50 | 50.4% (50%) | 27.5% | 22.8% |
| p75 | 26.3% (25%) | 13.7% | 12.5% |
| p90 | 9.3% (10%) | 4.1% | 5.2% |

- Calibrated. The up/down split leans up at p50/p75, which is NQ's drift; the forecast does not say which side.
- **Signed O→C by σ tercile (descriptive):** low +0.026%, mid +0.026%, high +0.131%. The high-vol tercile drifted more, in % and in σ (+0.07σ). This is one descriptive cut with no p-value claimed. It is the drift that P1 rides, and it is not something the O→C rung predicts.
- **Pinball skill of O→C p75:**
  - vs a trailing 250-session quantile: **+9.6% [+6.1, +13.4]**;
  - vs recent ATR × constant: **+1.3% [−0.6, +3.0]**.

### B. High-to-low

- **Coverage:** p50 52.6%, p75 24.6%, p90 9.0%. Calibrated.
- **Pinball skill of H→L p75:**
  - vs trailing quantile: **+16.9% [+11.2, +22.3]**;
  - vs ATR: **+3.2% [−0.2, +5.9]** (borderline; the CI touches 0).
- **When the range reaches H→L p50** (cumulative share of all sessions, by the end of the London hour):

  | by | 09:00 | 12:00 | 13:00 | 14:00 | 15:00 | 16:00 | 18:00 | 22:00 |
  |---|---|---|---|---|---|---|---|---|
  | reached p50 | 2.0% | 4.3% | 5.2% | 9.2% | 17.1% | 28.5% | 39.1% | 52.6% |

  - The median hour of reach is the 16:00 hour, after the 14:30 US cash open.
  - p75 is reached on 24.6% of days, median hour 17.
  - The range forecast is mostly "used" in the US session. A London-midnight entry carries 14 hours of mostly quiet tape first.
- **After the range reaches p50:**
  - The median reach is 15:43 London (minute 943).
  - From the reach, the range extends a further **0.62σ**, and the close is **0.60σ** from the reach price.
  - On non-reach days measured from the same minute, the figures are 0.18σ and 0.29σ.
  - **Reading:** a day that has used its p50 range by mid-afternoon stays active (vol clustering). It is not a sign of exhaustion, and it says nothing about direction. There is no placebo here, so it is descriptive only.

## 4. Backtest results (net of 1× cost; $ per 1 NQ contract)

| | P1 O→C p75 | S1 O→C p50 | S2 O→H p75 | S3 P1 + O→L p75 stop | B1 open→close | B1 + same stop | B2 trailing q75 | B3 ATR |
|---|---|---|---|---|---|---|---|---|
| target hit | 22.9% | 48.8% | 24.6% | 22.3% | – | – | 21.4% | 23.7% |
| stopped | – | – | – | 25.9% | – | 26.6% | – | – |
| win rate (net > 0) | 55.6% | 63.2% | 56.1% | 52.5% | 54.1% | 51.1% | 56.0% | 55.7% |
| avg win / loss % | +0.89 / −1.05 | +0.67 / −1.11 | +0.88 / −1.05 | +0.90 / −0.94 | +0.98 / −1.04 | +1.00 / −0.93 | +0.86 / −1.03 | +0.88 / −1.04 |
| **expectancy % / trade** | **+0.027** | +0.013 | +0.035 | +0.028 | +0.054 | +0.057 | +0.026 | +0.026 |
| 95% CI | [−0.029, +0.086] | [−0.037, +0.063] | [−0.022, +0.091] | [−0.024, +0.077] | [−0.011, +0.117] | [−0.000, +0.111] | [−0.031, +0.080] | [−0.031, +0.082] |
| pts / $ per trade | 4.3 / $86 | 1.3 / $27 | 5.6 / $112 | 4.7 / $94 | 8.5 / $170 | 9.4 / $188 | 3.6 / $73 | 4.2 / $84 |
| σ-units / trade | +0.024 | +0.008 | +0.028 | +0.028 | +0.037 | +0.044 | +0.022 | +0.019 |
| profit factor | 1.05 | 1.02 | 1.07 | 1.06 | 1.11 | 1.12 | 1.05 | 1.05 |
| total, 6 years | $133k | $41k | $174k | $145k | $263k | $291k | $112k | $131k |
| max drawdown | $126k (36% of notional) | $105k | $118k | $101k | $120k | $98k | $136k | $134k |
| Sharpe / Sortino | 0.35 / 0.45 | 0.19 / 0.22 | 0.44 / 0.58 | 0.40 / 0.57 | 0.61 / 0.88 | 0.71 / 1.15 | 0.33 / 0.43 | 0.34 / 0.44 |
| avg MFE / MAE (σ) | 0.63 / 0.79 | 0.46 / 0.72 | 0.62 / 0.78 | 0.62 / 0.60 | 0.75 / 0.80 | 0.73 / 0.61 | 0.64 / 0.79 | 0.63 / 0.79 |
| hold, mean / median (min) | 1,225 / 1,319 | 1,063 / 1,216 | 1,216 / 1,319 | 1,116 / 1,252 | 1,305 / 1,319 | 1,194 / 1,319 | 1,221 / 1,319 | 1,222 / 1,319 |
| mean without best 10 trades | +0.009 | +0.000 | +0.016 | +0.009 | +0.018 | +0.021 | +0.011 | +0.009 |
| top 5% of trades, share of total P&L | 406% | 555% | 318% | 392% | 290% | 272% | 379% | 403% |
| dev / val half | +0.004 / +0.051 | +0.007 / +0.019 | +0.011 / +0.059 | +0.007 / +0.049 | +0.024 / +0.084 | +0.027 / +0.086 | +0.012 / +0.039 | +0.000 / +0.053 |

- **Profit claims (Holm, family P1/S1/S2/S3):** p_holm 0.80 / 0.80 / 0.80 / 0.80. **None passes.**
- **No same-minute target/stop ambiguity** occurred in S3.
- **Concentration.** In every strategy, the top 5% of trades make more than the whole total, so the other 95% net negative. The result rests on a few large up-days.
- **Drawdown in context.** One NQ contract is about $349k of index. A $126k drawdown is about 36% of that notional. Per MNQ it is $12.6k.

### By year (P1 vs B1, mean % per trade)

| | 2020 (Aug–) | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 (–Aug) |
|---|---|---|---|---|---|---|---|
| P1 | −0.012 | +0.062 | **−0.159** | +0.149 | +0.063 | +0.033 | +0.032 |
| B1 | +0.039 | +0.072 | −0.136 | +0.171 | +0.069 | +0.068 | +0.100 |
| P1 $ (1 NQ) | −$4k | +$46k | **−$116k** | +$101k | +$56k | +$32k | +$19k |

- P1 follows B1 year by year, slightly below, and loses heavily in the 2022 bear market. It is a long-NQ exposure with a capped upside.
- **Months (73):** P1 positive in 56%, B1 in 60%. P1 beat B1 in 37% of months and beat B2 in 49%.

## 5. Baseline comparisons (paired, same sessions and costs)

| comparison | mean diff % / trade | 95% CI | dev / val | MDE |
|---|---|---|---|---|
| P1 − B1 (no target) | **−0.026** | [−0.050, −0.003] | −0.020 / −0.032 | 0.033 |
| P1 − B2 (trailing quantile) | +0.002 | [−0.013, +0.020] | −0.008 / +0.012 | 0.024 |
| P1 − B3 (ATR) | +0.001 | [−0.011, +0.014] | +0.003 / −0.001 | 0.018 |
| P1 vs B4 placebo (1,000 same-quarter shuffles) | P1 +0.027 vs placebo mean +0.021, p95 +0.033 | 81st percentile | | |
| S1 − B2 / B3 | −0.013 / −0.014 | [−0.034, +0.011] / [−0.036, +0.011] | | |
| S2 − B2 / B3 | +0.009 / +0.009 | [−0.007, +0.030] / [−0.002, +0.021] | | |
| S3 − (B1 + same stop) | −0.029 | [−0.055, −0.004] | | |

- **The mirror** (the same rules short):
  - every short loses, at about −0.06 to −0.07% per trade: the drift;
  - M_P1 − M_B2 is +0.001, and M_P1 − M_B3 is −0.006;
  - M_P1 sits at the 4th percentile of its placebo.
- No forecast-target value appears on either side.
- S2 (O→H p75, the forecast's correct upside quantity) is the best forecast cell. It still does not separate from the ATR control (CI includes 0), and it is a secondary cell.

## 6. Robustness and uncertainty

- **Uncertainty method:** moving-block bootstrap over sessions (21-session blocks, B = 2000) for all intervals.
- **Cost sensitivity (P1 mean % per trade):** 0× +0.034, 1× +0.027, 2× +0.021, 3× +0.014. Cost is not what decides it; the strategy has no significant edge even at zero cost.
- **Halves:**
  - Development (2020-08 → 2023-08): P1 +0.004.
  - Validation (2023-08 → 2026-08): P1 +0.051.
  - B1 behaves the same way (+0.024 / +0.084), so the halves differ by market drift, not by forecast skill.
- **Lockbox:** sessions after 2026-08-21 untouched. Because the gate failed, no lockbox read or forward record is proposed for this construction.

## 7. Decision

- **Reject this hypothesis as a trade construction.** Banked: `nq-forecast-target-ev` UNDERPOWERED (frozen rule), with the use note "reject: the target costs money vs holding to the close and adds nothing over same-size non-forecast targets".
- **What the evidence does support:**
  - The O→C and H→L rungs are calibrated size rulers.
  - They are clearly better than a static trailing quantile.
  - They are only marginally better (CI touching 0) than recent ATR.
- **No follow-up variants are proposed.** Other rungs, stops, entry times and filters on this construction would be variant-hunting on a result whose controls are flat.
- **If the levels are to be used for trade construction at all**, the evidence points to **risk and size** (stop distance, position size, how much range is left), not to target placement or direction. That is consistent with day-recon M1–M7.

## Amendments carried into the prereg

- **A1, 2026-11-02, POST-HOC (results seen):** demotes the §8 reading "promising but unconfirmed".
  - The point-estimate margins over B2/B3 (+0.002/+0.001%) are under a third of one cost unit. The placebo percentile (81st) is below the gate.
  - The verdict word stays UNDERPOWERED by the frozen MDE rule.
  - The description is "reject as a construction / cannot tell beyond ±0.02% per trade".
