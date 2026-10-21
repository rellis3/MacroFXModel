# rate-surprise-events — results

Prereg: `forge/RATE_SURPRISE_EVENTS_PREREG.md` (committed `13c882ae`, 2026-10-21). The event features, timestamp
audit and power check were committed with it, before any post-signal outcome was read.

- Run 2026-10-21, seed 20261021.
- 526 events: FOMC 131, core CPI 196, payrolls 199. Discover 2010–17 (256), validate 2018–21 (127), test 2022 →
  2026-08-21 (143).
- Ledger ids: `rate-surprise-eurusd`, `rate-surprise-nq`.
- Files: `results_full.json`, `events_with_outcomes.parquet`, `h4_month_block.csv`, `DATA_AUDIT.md`, `power.json`,
  `fig_*.png`.

Labels: **D** descriptive, **P** predictive, **C** causal, **T** tradable after costs.

## Answer to the brief's final question

**No measurable, executable advantage was shown for EURUSD or Nasdaq.**

- **The surprise is fully priced inside the window.** For EURUSD the whole response happens in the first 15 minutes
  (`fig_profiles.png`).
- **The market rate surprise is nearly the asset's own move.** Its correlation with EURUSD's reaction is −0.83, so
  little independent information is left to test. That is a structural limit, not a modelling choice.
- **After the signal is known** (window + 15 min), neither surprise predicts EURUSD or Nasdaq beyond the asset's own
  reaction, at any horizon from 1 hour to 5 days. 0 of 16 cells pass. Every pooled correlation is within ±0.09.
- **Power:** the sample can only rule out large effects. Four cells are NULL, meaning their interval excludes ±0.10.
  The other twelve are UNDERPOWERED.

## Verdicts

| | EURUSD (`rate-surprise-eurusd`) | NAS100 (`rate-surprise-nq`) |
|---|---|---|
| **Ledger verdict** | **UNDERPOWERED** (rate surprise); data surprise **NULL** at 1h / close / next day | **UNDERPOWERED**; data surprise NULL at 1h |
| Same-window link (D) | corr(rs2, own reaction) −0.83: the rate surprise *is* the EURUSD move | −0.40 |
| After the signal, beyond the asset's reaction (P), pooled corr [95%] | rs2: +0.015 / +0.017 / +0.038 / +0.026 (h1 / close / next day / 5 d), all intervals ±0.09. ds: −0.004 / −0.011 / −0.005 / +0.014 | rs2: +0.020 / +0.019 / −0.040 / **−0.087 [−0.18, +0.005]**. ds: +0.011 / +0.021 / −0.046 / **−0.085 [−0.17, +0.004]** |
| Gate (Holm across 16 + same sign in all 3 periods + survives dropping the top 5 events) | 0 of 8 | 0 of 8. The 5-day cells reach p 0.068 / 0.058, against a Holm bar of 0.003 |
| Forecast ladder (Clark–West vs the price baseline, 2018–26) | no model beats B1; CW t −1.4..+0.3 | no model beats B1; best M_DS 1h CW t 1.67 (IC +0.05), not significant |
| Splits (direction, large surprise, policy regime, real-yield trend, risk, family) | 240 split cells: 8 at p < 0.05 vs 12 expected by chance; **0 pass BH** | (pooled with EURUSD) |
| Net of real bid/ask (T), 2018–26, direction fixed on 2010–17 | every rule ≤ 0 net (−0.05..−0.27σ per event); the price baseline is no better | rate/data surprise intraday rules ≤ 0 net. The **price baseline** (continue the reaction) +0.18σ at 1h / close |

## Exploratory only: the Nasdaq 5-day reversal

The strongest pattern, which is not a result, is that **Nasdaq reverses, over five sessions, the move a surprise
implies:**

- **Correlations:** the data surprise gives −0.085, with the same sign in all three periods (−0.09 / −0.10 / −0.07)
  and after dropping the top 5 events. The rate surprise gives −0.087 (−0.03 / −0.18 / −0.09). The 10y version gives
  −0.082, and entering 30 min later gives −0.092.
- **Trading it:** fade the implied direction, with the direction fixed from 2010–17, and hold 5 days. Net of the real
  spread, using the registered month-block bootstrap:

  | | Data surprise | Rate surprise |
  |---|---|---|
  | 2018–26 | **+0.25σ per event [+0.10, +0.40]**, ≈ +62 bp, 162 events | +0.12σ [−0.01, +0.26] |
  | test 2022–26 | +0.32σ [+0.11, +0.54] | — |
  | after removing Nasdaq's drift | +0.23σ | — |

- **Why it is not promoted:**
  - It is one of 16 cells and failed the registered multiple-testing gate (p 0.058 vs 0.003).
  - The 5-day windows overlap across events in the same week.
  - It is a mean of ~160 events, so a few months can dominate.
  - A forward record is the only clean test left.

## Controls and robustness

- **Timestamp audit:** the 2y CFD move peaks in the release bar for every family in both 2010–17 and 2018–26
  (`DATA_AUDIT.md`). FOMC also shows the press-conference spike, which is why its window is 60 minutes.
- **Price-only baseline (B1):** own reaction + the hour before + family. The surprise is tested on the residual.
- **No-signal benchmark:** 0 (and the family mean in the forecast ladder).
- **Signal delay:** entry 15 min after the window; +30 min changes nothing.
- **Costs:** the real spread at the entry and exit minutes (median ≈ 1.7 bp EURUSD, 1.8–2.0 bp NAS100 round trip),
  plus slippage. Before 2016-10, 1.5 × the later median.
- **Concentration:** both Nasdaq 5-day signs survive dropping the top 5 |return| events; the EURUSD data-surprise 5-day sign does not (+0.014 → −0.012). By year (rs2 → NQ 5d), see
  `results_full.json`.

## Data and power limits (the decision rule asks for these)

1. **Event count:** about 32 events a year. Even with 2010–26, 80% power needs a true correlation of ≈ 0.17 (best
   cell) to 0.27; under the full gate, ≈ 0.24 to > 0.3 (`power.json`). Effects near 0.10 cannot be confirmed or ruled
   out here.
2. **Collinearity:** for EURUSD the 2y surprise and the asset's own move are one signal (−0.83). Only a
   sub-15-minute clock (1-min rates and FX at the release) could separate "rates moved first" from "both moved
   together". The M15 grid can't.
3. **Instruments:** Nasdaq futures 1-min history isn't available, so NAS100 (the CFD) is the proxy. The US 2y is a
   CFD, not ZT futures; ZT 1-min exists only for live contracts.
4. **Calendar:** before 2018 the ff_calendar clock times are placeholders (the published schedule was used and
   verified by the spike test). Consensus is one vendor's.

## Deviations from the prereg

- **h4 trade intervals** use the registered month-block bootstrap (`h4_month_block.csv`). The first pass printed
  i.i.d. intervals, which were nearly the same.
- **The primary statistic's permutation p** is within-family, as registered.
- **Nothing else changed.**

## What this changes

- **Nothing goes into MacroFXModel.**
- Release-day pages may say the rate surprise *explains* the first 15 minutes (D). Do not say the surprise tells
  where EURUSD or Nasdaq go next.
- **Shortlist:**
  1. A forward record of the Nasdaq 5-day fade after data surprises, pre-registered now and judged at ~100 new events
     (≈ 3 years).
  2. A pooled multi-asset event family (more USD pairs, gold, S&P) to reach the power needed for ρ ≈ 0.10.
  3. A 1-minute release-clock study, if ZT/ZN and NQ 1-min become available.
