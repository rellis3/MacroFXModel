# Market-sense tests — eight claims about "sensing a change", pre-registered together

> **Status: PRE-REGISTERED 2026-09-17, before any of the eight was run.** Results
> are appended per study after the run; nothing above the Results line changes.
> One harness (`analysis/market_sense_studies.mjs`), one discipline for all eight:
> the same paired-control method that closed the level-touch, approach-speed,
> squeeze and growth-vs-yields questions.

## Shared method

- **Data.** OANDA daily bars (session-dated) for NAS100, SPX500, US2000, XAU/USD,
  EUR/USD, USD/JPY, GBP/USD, AUD/USD, USD/CAD; FRED daily VIXCLS, VXVCLS, DGS2,
  DGS10, DFII10, T10YIE, DCOILWTICO, DTWEXBGS (keyless CSV, full history). Merged
  on shared dates; FRED holidays carried forward one session.
- **Outcome unit.** Range in ATR14 of the instrument, measured at the setup day,
  so 2008 and 2026 are on one scale. "Next-5d range" = max high − min low over the
  five following sessions ÷ ATR14. "Next-20d" likewise.
- **Control.** One non-setup day per setup day: same instrument, different ISO
  week, same ATR-percentile quintile (trailing 250-day rank of ATR/close), same
  20-day trend tercile; never itself inside the setup. Random draw, fixed seed.
- **Statistic.** Paired mean difference; ISO-week block bootstrap, 1,000 reps,
  95% CI. Setups with fewer than 40 paired days are reported, not scored.
- **Pass bar** (range studies). Primary difference ≥ +0.10 ATR with the CI clear
  of zero. A *narrower* result with the CI clear of zero is reported as a
  "calmer" finding, not a pass.
- **Population audit** at every filter step.
- Robustness for every scored study: R1 = 2018-01-01 onward only.

## The eight studies

**S1 — VIX term structure inverts → the week gets wide.**
Setup: first day VIX ≥ VIX3M after ≥3 days below. Outcomes: next-5d range on
SPX500, NAS100, USD/JPY, XAU/USD. Exit setup: first day back below after an
inversion of ≥3 days (expect narrower). Descriptive: episode lengths (median,
p75) and how many sessions after inversion the range stays above control.

**S2 — Stocks and bonds falling together = an inflation regime.**
Feature: 20-day correlation of SPX500 daily log returns with DGS10 daily changes.
Normal risk-on is positive (stocks up, yields up); "falling together" is
negative. Setup: first day the correlation crosses below −0.20 after ≥10 days
above. Outcomes: next-20d range on XAU/USD, EUR/USD, USD/JPY, SPX500.
Descriptive: how long the negative-correlation episodes last.

**S3 — Front-end shock → FX vol.**
Feature: 5-day change in DGS2. Setup: |Δ2Y| in the top decile of the trailing
population (threshold reported). Outcomes: next-5d range on EUR/USD, USD/JPY,
GBP/USD. Split reported for up-moves vs down-moves. Direction is NOT scored
(banked null, project_yield_asset_coupling).

**S4 — How long does an oil move take to reach breakevens?**
Setup: WTI 20-day move ≥ +10% (and, separately, ≤ −10%). Outcome: T10YIE change
over the following 5, 10 and 20 sessions, in bp, vs control. Pass bar for this
study only: +5bp (−5bp for the down setup) with the CI clear of zero at any
horizon. Descriptive: cross-correlation of 20-day oil change with 20-day
breakeven change at lags 0..20 sessions.

**S5 — Which side of a broken link gives way?**
(a) Real yield 20-day ≥ +15bp AND DTWEXBGS 20-day ≤ −0.5% (today's break).
Outcome over the next 20 sessions: share of episodes where the dollar caught up
(≥ +0.5%) vs where the real yield gave back (≤ −8bp) vs neither; DXY and real
yield mean changes vs control. (b) Real yield 20-day ≥ +15bp AND XAU 20-day ≥
+2%. Same outcomes for gold. These are BASE RATES with intervals; no pass bar,
no directional claim — the output is "historically this resolved by X in n% of
cases", or "n too small to say".

**S6 — "Priced in": does a well-telegraphed decision move less?**
Population: every FOMC decision day 2016-01-27 → latest (js/fomcHistory.js).
Feature: |Δ2Y| over the 20 sessions before the decision (how much repricing
already happened). Outcome: decision-day range/ATR on EUR/USD, USD/JPY,
XAU/USD, SPX500. Test: top tercile of prior repricing vs bottom tercile,
bootstrap over meetings. Pass: top-tercile range LOWER by ≥ 0.10 ATR with the
CI clear of zero (the "already priced" claim). The opposite sign is also
reported honestly.

**S7 — Data surprise size → range, by release.**
Population: the desk's own surprise store (econ_surprise_v1, ~10k releases,
2017→, actual vs consensus z-scored per series). Currency → pair: US→EUR/USD
and USD/JPY, GB→GBP/USD, EU→EUR/USD, JP→USD/JPY, AU→AUD/USD, CA→USD/CAD.
Outcome: release-session range/ATR and next-session range/ATR vs control
(non-release day for that pair). Split by |z| tercile and by family: CPI,
employment (NFP / unemployment / claims), GDP, rate decisions, retail sales,
PMI. Pass per family: top-|z| tercile release-day range ≥ +0.10 ATR vs control
with the CI clear of zero.

**S8 — Rotation underneath a quiet index.**
Feature: 20-day relative log return NAS100 minus US2000. Setup: |relative| in
the top decile. Outcomes: next-20d range on NAS100 and SPX500 vs control.
Descriptive: the relative-return series' own persistence (does an extreme
mean-revert or extend over the following 20 sessions — reported as a base rate).

## What a pass changes on the page

A validated range effect earns a ✓ chip on the instrument it was measured on,
worded as range, never direction. A base-rate study (S4, S5) earns a sentence in
the chain row it describes. Every result, pass or null, goes into the morning
brief and the chain read as a "TESTED ON THIS DESK" block so the prose leans on
what was measured before it leans on folklore.

---

## Results

*(appended after the run, one section per study)*
