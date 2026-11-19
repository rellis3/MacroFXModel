# Bias engine audit (statistical and architectural)

Audit date 2026-11-18/19. Subject: `js/biasEngine.js` (bias-engine-v1, weights theory-v1) and its gatherer
`server.js` `_beGather` (lines 30399-30500). Independent review. No production file was changed.

**Status: exploratory, not pre-registered.** Everything below is descriptive. No engine output was joined to a price
outcome. Nothing was fitted. All historical statistics use data dated before 2026-08-21 (lockbox). Live readings
(stored issues of 2026-11-16, -17, -18, and a `?live=1` read at 2026-11-18 23:54 UTC) are quoted as descriptive facts
only. Under the research protocol, this look needs a register row (`EXPLORATORY`). I did not add it, because this task
was limited to two folders.

Files:
- Scripts: `scripts/bias-engine-audit/` (`risk_factors.py`, `rate_driver.py`, `policy_noise.py`, `freshness.py`,
  `live_structure.py`)
- Outputs: `analysis/output/bias-engine-audit/` (`risk_factors.json`, `rate_driver.json`, `policy_noise.json`,
  `freshness.json`, `live_structure.json`)
- Production GET responses: `analysis/output/bias-engine-audit/live/`
- FRED keyless pulls: `analysis/output/bias-engine-audit/data/`

---

## 0. Top findings

| # | Finding | Evidence (one line) | Severity |
|---|---|---|---|
| 1 | The "rate differential" driver is not a differential. It is each currency's short rate z-scored against its **own** last 24 monthly prints, plus a small level nudge. | 2010-2026: Spearman(d, own z) **0.94**, (d, level gap) 0.26. At pair level the sign matches the real bilateral rate gap only **63.5%** of the time when it speaks, and is the wrong way on **23%** of pair-months where the gap is ≥ 2 pp. In Jul-2026, JPY at 0.98% and AUD at 4.48% both scored d = +2. | High |
| 2 | The four risk inputs are close to **one factor**. | 2023-10 → 2026-08 (n 703): PC1 explains **70%** [59, 79] of the readings' variance. The effective number of independent inputs is **1.9** [1.6, 2.2]. Daily changes: PC1 77%, effective N 1.6. corr(R, PC1) = 0.96. | High |
| 3 | R has a built-in risk-on lean. Through the fixed roles it is the largest single swing factor in the pairs. | Mean R = **+0.20**. The S&P leg's mean d is +0.73, from equity drift. VIX/VIX3M can reach −2 but only +1. On 2026-11-18, risk (nominal weight 0.10) carried **23%** of all pair contributions and removing it would flip the sign, or move the score across the ±0.5 call line, on 8 of the 28 pairs. The backtest's worst driver is FX risk role × R: −4.4 pp at 20 days (q 0.001). | High |
| 4 | The policy driver reads only the **5-day change** in pricing. It ignores what is priced, and its state is renewed about weekly, against a 20-day horizon. | USD 2y 2010-2026: autocorrelation of d is −0.01 at lag 5 and 0.07 at lag 20; d changes on 36% of days. Live: futures price **+54 bp** of Fed hikes at 6 months, yet USD policy d was 0 (issue) and then −1 (live). GBP went from d +2 to +1 to 0 inside two days. | High |
| 5 | A banked-null signal re-enters the score through the policy driver. | The `stance` ±1 is `cbSentiment`. The Evidence Book has `cb-tone-direction` as NULL, and `js/macroScorecardEngine.js:124` deliberately keeps cbSentiment out of every score. On 2026-11-18 stance alone set the policy d for GBP, AUD and CAD (weekly change < 5 bp). | High |
| 6 | Freshness is measured from the wrong date, and only the **newest** sub-input counts. | Monthly series are stamped at the start of the month they cover, so ages are understated by about a month. The data driver takes the newest of its dimensions: CHF, JPY and AUD keep GDP prints 231 days old. NZD's whole data block is dropped at 139 days by a flat 120-day budget, while the scorecard's own cadence budget (300 days) calls none of it stale. | High |
| 7 | Values change under an unchanged date stamp (no vintage tracking). | EUR 10y real yield on the 05:32 issue was −0.33% (z −1.86), dated 2026-10-01. By 23:46 the store held −0.59% (z −2.56) under the same date. | Medium |
| 8 | Renormalisation lets one or two drivers carry a label. | 2026-11-16: GBP was called **Bullish 0.67** from the data driver alone (coverage 0.63). NZD's rates driver has normalised weight 0.50 (coverage 0.44). Every NZD cross is forced Neutral because pair coverage = min(legs). | Medium |
| 9 | The "data momentum" signs and contents differ by market and are not always economically right. | Inflation is always bullish: for the currency, for the US and EU indices, and for commodities. Inflation is present only for USD, EUR and CHF, so "data" means a different thing per currency. On 2026-11-18, flipping the inflation sign for SPX turns its data d from +1 to 0. | Medium |
| 10 | Several inputs are counted twice inside the asset models, and "US real yield" has two definitions in one record. | SPX500 gets S&P momentum through R (spxTrend) and again through its own trend driver. Gold gets the Fed path directly and again through the USD score. The same record shows "US 10y real" as **2.92%** (TIPS, gold and indices) and **1.05%** (GS10 − CPI, USD currency). | Medium |
| 11 | Strength is a rescaled score, not a confidence. The forward scoreboard scores it at a horizon the engine was not designed for. | strength = round(\|s\|×5) (`js/biasEngine.js:191`). The backtest found strength does not grade (FX 20 d: −3.0 / −4.3 / −10.8 pp by rising strength). The scoreboard maps strength to p_up shifts of 3 to 10 pp (`js/biasForecasters.js:189`), and its primary score is the same day (`d21`). | Medium |
| 12 | The live engine is largely untested. | The backtest rebuilt policy only via the 2y proxy (never futures, never stance). It dropped data momentum (0.20). It had real yield for USD only. About half of each currency's live weight has no history behind it. | High |

Correction to the brief: on the 2026-11-18 issue the futures store was **not** stale. It was dated 2026-11-17 17:30 UTC
(0.5 days old), and all seven banks used futures. The 12-day staleness was true on the 2026-11-16 issue: "stale (11 days
old)", with policy dropped for every currency because the 2y fallback was not yet live then.

---

## 1. Calculation trace for every driver

Notation: `band(x,[t1,t2])` returns ±2 when |x| ≥ t2, ±1 when |x| ≥ t1, else 0 (`js/biasEngine.js:91-95`).
`unusable(asOf, issue, maxAge)` drops an input that has no date, is dated after the issue time, or is older than its
budget (`:98-104`). A missing driver is dropped and the remaining weights renormalised (`combine`, `:177-183`). An
`na` driver leaves the weight base entirely.

### 1a. Currency drivers (`buildBiasRecord`, `:372-388`; weights `CCY_WEIGHTS`, `:41`)

| Driver (w) | Input source → store key | Transformation | Threshold → d | Missing / na | asOf handling |
|---|---|---|---|---|---|
| **Policy path** (0.25) | Futures: KV `cb_rate_futures_v1` via `_cbExpect`, horizon m6, else m3, else m12 (`server.js:30410-30420`). Fallback: KV `yield2y_daily_v1` 2y yield, change over the last 5 observations (`js/yield2y.js:148-154`; `server.js:30424-30429`). Selection: `fillPolicyFallback` (`js/biasEngine.js:115-126`). | `weekBp` = change in priced bp over ~5 sessions (futures) or 2y change in bp (proxy). Same thresholds for both instruments. | `band(weekBp,[5,15])` plus the stance ±1 (below), clamped to ±2 (`:263`). | Futures unusable (stale > 10 d, no week change) → proxy. Both unusable → missing with both reasons. NZD: no futures, and the 2y fetch gets HTTP 403 → always missing. CHF proxy is a monthly SNB file → usually stale. | Futures: a single `ex.asOf` (pull time) for every bank (`server.js:30418`). Proxy: date of the last 2y point at 23:59. |
| ↳ **Stance** (inside policy) | `_buildMacroScorecard().cbSentiment` (`server.js:30445`) | Lexicon hawkish score in −1..1 | score ≥ 0.5 → +1, ≤ −0.5 → −1 (`:262`) | Absent → 0 (silently, no "missing") | asOf = meeting date; budget 120 days (`:75`) |
| **Rate differential trend** (0.20) | KV `rate_diff_v1`, built by `_buildRateDiffScores` (`server.js:14436-14452`) → `rateDiffScore` (`js/rateDiffEngine.js:41-48`). One series per currency (`js/yieldCurveEngine.js:30-44`): USD **GS2** (2y Treasury), EUR DE call money, GBP **BoE Bank Rate monthly mean** (`BOE_IUDBEDR_M`), JPY call, AUD 3m, CAD call, CHF 3m, NZD 3m. | z = latest vs the previous 24 monthly prints, population SD (`latestZScore`, `js/yieldCurveEngine.js:51-63`). gap = level − mean level of the 8 (needs ≥ 4; `js/biasEngine.js:368-369`). | `band(z,[0.5,1.5])` + (gap ≥ 1.5 pp → +1, ≤ −1.5 → −1), clamped to ±2 (`:272`). | No row or no z → missing. | `latestDate` = first day of the month observed, at 23:59 (`server.js:30449`); budget 120 days. |
| **Data momentum** (0.20) | `_buildMacroScorecard` (`server.js:14824-14896`) → `ranked[].factors` growth (gdp, ism), inflation (cpi, ppi), labour, demand (retail, confidence) (`js/macroScorecardEngine.js:108-115`) | Plain mean of the factor scores present (needs ≥ 2) (`server.js:30439-30443`). Each factor is the mean of its dimension scores; each dimension is a sub-engine's −1..1 score (z-vs-history or level-vs-target composites). | `band(score,[0.15,0.5])` (`js/biasEngine.js:279`) | < 2 factors → missing. Stale → missing as a whole. | asOf = the **newest** date among the dimensions used (`server.js:30442-30443`). Each dimension's date is itself the newest date anywhere in its node (`_newestDataDate`, `server.js:14798-14813`). Budget 120 days, flat. |
| **Real yield** (0.10) | KV `real_yield_v1` (`server.js:14378-14394`) → `realYieldScore` (`js/realYieldEngine.js:104-114`): 10y yield − CPI YoY, CPI forward-filled (`:87-98`). Only USD (GS10), EUR, CHF have a CPI headline. | gap = level − mean of the available ones (needs ≥ 4 currencies, so with 3 held it is **always null**). z vs 24 prints. | gap part ±1 at 1 pp (dead, see above) + (z ≥ 1 → +1, ≤ −1 → −1), clamped (`:286-288`). In practice d = sign of z beyond 1. | Outside {USD, EUR, CHF} → `na` (out of the base). | latestDate (month start) at 23:59; 120 days. |
| **Risk role × R** (0.10) | R from `riskScore` (section 1b) | x = RISK_ROLE[c] × R. Roles: USD −0.5, JPY −1, CHF −1, EUR 0, GBP +0.25, CAD +0.5, AUD +1, NZD +1 (`:48-49`). | `band(x,[0.3,1.0])` (`:294`) | R missing or R coverage < 0.5 → missing | asOf = R.asOf = **the issue time** (`:362`), not the VIX/HY/SPX dates. |
| **Commodity link** (0.05) | OANDA D1 closes: AUD → XCU_USD, CAD → WTICO_USD; NZD → none (`:51`, `:376-380`) | 20-session % return (`ret20`, `:317`) | `band(ret,[2,6])` | NZD: missing ("no dairy feed"). Other currencies: `na`. | Last closed bar + 1 day; 7-day budget. |
| **Positioning (COT, contrarian)** (0.05) | `_buildCotState` (`server.js:30462-30469`), percentile and share of open interest; JPY/CAD/CHF flipped to currency terms (`js/cotState.js:20-29`) | — | p ≥ 90 and net long → −2; p ≥ 75 → −1; p ≤ 10 and net short → +2; p ≤ 25 → +1 (`js/biasEngine.js:301-302`) | USD: `na` (no contract). EUR, JPY and CAD are absent from cot-state today, so they count as missing, not `na`. | Report Tuesday + 3 days 20:30 UTC (`server.js:30466`); 14-day budget. |
| **Trend (D1/H4 EMA20)** (0.05) | OANDA D (130 bars) and H4 (200 bars) for the 7 USD majors (`server.js:30487-30498`) → equal-weight 8-currency log basket (`basketIndex`, `:156-169`) | `slopeZ`: EMA20 change over 5 bars ÷ (SD of the last 60 one-bar log changes × √5) (`:135-141`) | `band(z,[0.15,0.6])` per timeframe. Both agree → ±1, or ±2 if both strong. Conflict or flat → 0. No H4 → D1 capped at ±1 (`:146-152`). | No basket bars, or bars older than 7 days → missing. | Last closed D1 bar + 1 day. |

### 1b. Risk drivers (`riskScore`, `js/biasEngine.js:240-254`; inputs `server.js:30471-30486`; `RISK_WEIGHTS` all 0.25)

| Driver | Input | Transformation | → d | Missing | asOf |
|---|---|---|---|---|---|
| vixLevel | CBOE VIX daily (`_cboeCsv`; fallback FRED cache `fredhistory_series_vix`) | percentile of the last close in the last 252 closes, inclusive (`server.js:30479-30480`) | < 20 → +2, < 40 → +1, > 80 → −2, > 60 → −1 (`:235-238`) | No VIX → missing | VIX date (closes dated before the issue date), 7-day budget |
| vixTerm | VIX / VIX3M on the same date (`:30481-30482`) | ratio | ≥ 1.00 → −2, ≥ 0.95 → −1, ≤ 0.85 → +1, else 0 (`:239`). Asymmetric: the most it can give is **+1**. | No same-date VIX3M → missing | VIX date |
| credit | KV `fredhistory_series_hy` (BAMLH0A0HYM2) | (last − 21st last) × 100 bp (`:30485`) | −band(chg,[20,50]) (`:248`) | < 21 points → missing | HY date |
| spxTrend | OANDA SPX500_USD D1 (the same bars as the index model) | 20-session % return (`:361`) | band(ret,[1,3]) (`:250`) | < 21 bars → missing | last bar + 1 day |
| **R** | — | weighted mean of the four d (renormalised) | R ∈ [−2, +2] | coverage < 0.5 → roles drop | **R.asOf is set to the issue time** (`:362`) |

### 1c. Asset models

| Model (weights) | Drivers and how each is built |
|---|---|
| **Gold** (`:395-402`; realYield .25, usd .25, fedPath .15, risk .10, positioning .10, trend .15) | **US real yield**: FRED DFII10 cache, 20-obs change in bp, `−band(chg,[8,25])` (`:318-323`, `server.js:30457-30461`). **usd**: `−band(USD score,[0.3,1.0])` (`:324-329`); uses the USD *score*, which itself contains policy, rates, data, real yield, risk. **fedPath**: −(USD policy d), the same number as the USD policy driver (`:330-334`). **risk**: role −0.5 × R. **COT** (GOLD). **Trend** on XAU. |
| **Silver** (`:403`) | The gold model with role +0.5. COT is `na`. |
| **US indices** NQ, SPX500, US30, US2000 (`:405-411`; rates .20, fedPath .15, risk .25, data .15, positioning .10, trend .15) | rates = the same DFII10 20-day change (falling = +). fedPath as gold. risk = +1 × R, and R contains SPX 20-day momentum. data = **USD** data score. COT (ES, NQ, YM, RTY). Own trend. The four models differ only in trend and COT. |
| **DE30 / UK100** (`:412-421`; ratesPath .20, ccy .15, risk .25, data .15, trend .15, positioning .10) | ratesPath = −(EUR or GBP policy d). ccy = −band(own currency score,[0.3,1]); its asOf is the issue time. risk +1 × R. data = EUR or GBP data. COT is `na`. |
| **WTI / COPPER** (`:422-436`; usd .20, globalData .25, risk .20, inventories .15, trend .20) | usd inverted. globalData = mean of the currencies' data scores (≥ 4), band [0.15, 0.5], asOf the newest of them. risk +1 × R. inventories: WTI missing ("no EIA feed"), COPPER `na`. Trend. |

### 1d. Combination, label, pair

- **Score:** `Σ (w_i / Σ w_present) · d_i` (`:180`). **Coverage** = Σ w_present / Σ w_applicable (`:181`).
- **Strength:** clamp(round(|s| × 5), 0, 10) (`:191`).
- **Neutral** when coverage < 0.5, or strength ≤ 2 (that is, |s| < 0.5), or the top two contributions oppose and differ by < 0.1 (`:196-199`).
- **Pair:** s = (s_base − s_quote) / 2, coverage = min(legs) (`:345-352`). A pair can only be called when |s_b − s_q| ≥ 1.0.

---

## 2. Defects and weaknesses

Severity scale. **Critical:** the output is wrong. **High:** the driver does not measure what it says, or the score's
validity is compromised. **Medium:** a distortion or an inconsistency. **Low:** hygiene.

| ID | Area | Defect | Severity |
|---|---|---|---|
| F1 | Freshness | Monthly series are stamped with the **first day of the month they cover** (FRED/OECD convention; also `BOE_*_M`, `js/boeSeries.js:30-31`). The engine reads that as the publication time. Result: (a) ages are understated by about a month, plus the release lag; (b) the "published after the issue time" check cannot fire on these inputs; (c) GBP's rate is a **partial-month mean** dated 2026-11-01, used on 2026-11-18. | High |
| F2 | Freshness | The data driver's asOf is the **newest** dimension date (`server.js:30442-30443`), and each dimension's date is the newest anywhere in its node (`:14798-14813`). Old dimensions hide behind one fresh one. | High |
| F3 | Freshness | Inconsistent budgets. The engine's flat 120 days drops NZD's whole data block ("stale (139 days old)"), while the scorecard's cadence budgets (monthly 130, quarterly 300; `js/macroScorecardEngine.js:87-92`) flag nothing stale for NZD. Meanwhile USD's GDP dimension (140 days old) passes, because its block's newest date is ISM. | High |
| F4 | Freshness | Derived drivers take the **issue time** as their asOf: risk role (all markets), usd (gold, silver, oil, copper), ccy (DE30, UK100). Their real observation dates (VIX 11-17, HY 11-16) never reach the card. | Medium |
| F5 | Freshness | No vintage tracking. The same `latestDate` can carry a different value later the same day: EUR real yield −0.33% → −0.59% under the same date stamp. The write-once issue protects the record, but a replay or a backtest cannot reproduce what was knowable. | Medium |
| F6 | Freshness | `/api/data-health` measures **store write time**, not observation time: `cpi_v1` shows "fresh, 0.01 days" while its newest observation is 48 days old. Store health is not data freshness. | Medium |
| F7 | Freshness | The futures store carries one asOf for every bank and every rung. A single illiquid or unrolled contract cannot be detected (not verified; `_cbExpect` internals not audited). | Low |
| R1 | Rates | The rates driver measures each rate's **own 2-year z-score** (that is, its trend), not a differential. d tracks z (Spearman 0.94), not the level gap (0.26). The gap part is non-zero on only 22% of currency-months. | High |
| R2 | Rates | Pair-level consequence. (d_base − d_quote) matches the sign of the actual bilateral differential only **63.5%** of the time when non-zero. It is the wrong way on 23% of pair-months with a gap ≥ 2 pp, and zero on another 23.5% of them. It does agree with the sign of the 12-month **change** in the differential 86% of the time. So it is a slow rate-momentum signal, a close cousin of the policy driver. | High |
| R3 | Rates | Mixed tenors in the "8-currency average". USD uses the 2y Treasury monthly mean (4.74%), the others overnight/3m rates or Bank Rate. The USD gap (+1.91 pp) partly reflects the tenor, not policy: the Fed funds upper bound is 4.00%. | Medium |
| R4 | Rates | z vs 24 monthly prints with population SD, threshold 0.5 SD. 86% of currency-months are non-zero. A rate that has merely drifted since last year scores. The flat-SD floor returns ±4 for a perfectly flat series; this never happened on the monthly means 2010-2026, but it can for the monthly mean of a stepped Bank Rate. | Medium |
| R5 | Spec drift | The spec says rates = "vs the 8-currency average, 20-day change" and real yield = "level vs peers and its 20-day change" (`plans/BIAS_ENGINE_SPEC.md`). The code uses a monthly z vs 24 prints. For real yield, the peer gap needs ≥ 4 currencies, but only 3 are held, so that half of the driver never runs. | Medium |
| P1 | Policy | It reads only the 5-day change. The priced path itself (USD **+54 bp** at 6 months on 2026-11-18) never enters. | High |
| P2 | Policy | The d state renews about weekly. USD 2y 2010-2026: autocorrelation of d is 0.69 at 1 day, **−0.01 at 5 days**, 0.07 at 20 days. d changes on 36% of days. Median \|5-day change\| is 4 bp, so the 5 bp threshold sits at the median. | High |
| P3 | Policy | One threshold set for two instruments. Futures at 6 months and the 2y yield have different volatility, so the same 5/15 bp bands mean different things depending on which path was used. | Medium |
| P4 | Policy | Stance ±1 is cbSentiment: banked NULL as a direction (`cb-tone-direction`), and excluded from scores by the scorecard (`js/macroScorecardEngine.js:124-127`). Its meeting dates run up to 120 days back (CHF 2026-09-24). | High |
| K1 | Risk | The four inputs are one factor (section 3.4). Equal weights on four views of the same thing give R the appearance of a four-way consensus. | High |
| K2 | Risk | Structural risk-on lean: mean R +0.20, from S&P drift (d_spx > 0 on 64% of days) and the one-sided VIX/VIX3M mapping (+1 at most, −2 at least). Through the fixed roles, this becomes a permanent tilt: AUD and NZD up, JPY and CHF down. | Medium |
| K3 | Risk | The fixed roles amplify R in crosses: AUDJPY gets (+1) − (−1). On 2026-11-18, risk carried 23% of all pair contributions (nominal 0.10). Removing it would flip the sign, or move the score across the ±0.5 call line, on 8 of the 28 pairs (`live_structure.json`; e.g. NZDJPY −0.66 → −0.28). In the backtest this is the worst driver: FX 20 d −4.4 pp [−6.3, −2.4], 5 d −2.0 pp (BH q 0.001 / 0.04). | High |
| D1 | Data | Inflation is always "bullish": for currencies, for the US indices (USD data), for DE30/UK100, and for commodities. For equities this is the wrong sign in most regimes (higher inflation → higher real-rate expectations). Stagflation (growth −, inflation +) nets to about 0, not to a distinct state. | Medium |
| D2 | Data | The factor mix differs by currency. Inflation is present only for USD, EUR and CHF; CAD has growth and labour only. "Data" is not the same measurement across the 8, so cross-currency comparisons are biased. | Medium |
| D3 | Data | The label says "momentum", but the sub-scores are mostly state readings (level vs target, z vs own history; e.g. `js/cpiEngine.js:215-220`), not surprises or changes. | Low |
| S1 | Scoring | Renormalisation. A currency with 2 drivers present scores on the same scale as one with 8. GBP 11-16 was Bullish 0.67 from one driver. NZD rates had normalised weight 0.50. Coverage gates at 0.5 only. | Medium |
| S2 | Scoring | Banding throws away magnitude, and the clamps (policy + stance, rates z + gap, real yield) hide conflicts. Everything is then averaged as if the d's were on a common scale. | Medium |
| S3 | Scoring | Pair coverage = min(legs): every NZD cross is Neutral because NZD's coverage is 0.44. | Low |
| A1 | Assets | Double counting. SPX500: S&P momentum through R (1/4 of R × 0.25) plus its own trend (0.15). Gold: the Fed path directly (0.15) plus inside the USD score (policy ~0.28 of it) × 0.25. Gold also takes R twice with opposite signs: directly (role −0.5, so risk-off pushes gold up), and through the USD score (USD role −0.5 lifts USD in risk-off, which the inverted usd driver turns into gold down). | Medium |
| A2 | Assets | "US real yield" means two things in one record: TIPS 2.92% (gold, indices) and GS10 − CPI YoY 1.05% (USD currency). The second is backward-looking (realised CPI). | Medium |
| A3 | Assets | The four US index models are nearly identical (they differ only in trend and COT), so four "calls" are about one view. | Low |
| C1 | Confidence | Strength = |s|×5 conflates direction size with confidence. Data quality (coverage) is used only as a gate. Driver agreement is used only in the conflict rule. The backtest shows strength does not grade. | Medium |
| C2 | Confidence | Horizon mismatch. The engine's design horizon is 1-4 weeks, while the scoreboard's primary statistic is the same-day `d21` log score. Its shift p0 ± 0.01×strength is uncalibrated. | Medium |
| V1 | Validation | Live ≠ backtested. Futures policy, stance, data momentum and EUR/CHF real yield have no history: ~45-55% of a currency's live weight. Only the forward record (days old: 3 stored issues) tests the live engine. | High |
| X1 | Coverage | NZD: policy missing always (RBNZ 403), dairy missing, data dropped (F3). CHF 2y proxy is monthly (backtest coverage 20.7%). EUR, JPY and CAD have no row in cot-state today. | Low |

---

## 3. Evidence

### 3.1 Data freshness (item 1)

Observation dates on the stored issue of **2026-11-18 05:32 UTC** (`freshness.json`):

| Driver | Engine asOf (all ccys unless noted) | Engine age | If month-start stamped: earliest knowable | Budget | What happened |
|---|---|---|---|---|---|
| Policy (futures) | 2026-11-17 17:30 | 0.5 d | — | 10 d | used, all 7 banks; NZD missing (no futures, 2y 403) |
| Stance | meetings 2026-09-24 (CHF) → 11-05 (GBP) | 13-55 d | — | 120 d | used |
| Rates | 2026-10-01 (GBP 2026-11-01) | 47 d (GBP 16 d) | month end: Nov 1 (GBP: **Dec 1**, partial month) | 120 d | used |
| Data | newest dim: USD 11-01, CHF 09-01, NZD 07-01, others 10-01 | 16-139 d | oldest dims used: 2026-04-01 (JPY, CHF, AUD), 2026-07-01 (others) | 120 d | NZD dropped, others used |
| Real yield | 2026-10-01 | 47 d | Nov 1 | 120 d | used (USD, EUR, CHF) |
| COT | report 2026-11-10, release 11-13 20:30 | 4.4 d | — | 14 d | used; EUR, JPY, CAD rows absent |
| Risk role | the issue time | 0 d (true: VIX 11-17, HY 11-16, SPX 11-17 close) | — | 7 d | used |
| Trend, commodity | 2026-11-18 00:00 | 0.2 d | — | 7 d | used |
| US real (TIPS) | 2026-11-16 | 1.2 d | — | 7 d | used |

Data-driver dimensions behind each currency (from `/api/macro-scorecard`, ages at its build time):

| Ccy | Factors present | Oldest dimension used | Engine asOf |
|---|---|---|---|
| USD | growth, inflation, labour, demand | gdp 2026-07-01 (140 d) | 2026-11-01 |
| EUR | all four | gdp 2026-07-01 (140 d) | 2026-10-01 |
| GBP | growth, labour, demand | gdp, labour, retail 2026-07-01 (140 d) | 2026-10-01 |
| JPY | growth, labour, demand | retail 2026-04-01 (231 d) | 2026-10-01 |
| AUD | growth, labour, demand | gdp 2026-04-01 (231 d) | 2026-10-01 |
| CAD | growth, labour | gdp, ism 2026-07-01 (140 d) | 2026-10-01 |
| CHF | all four | gdp, labour 2026-04-01 (231 d) | 2026-09-01 |
| NZD | growth, labour, demand | gdp, retail 2026-04-01 (231 d) | 2026-07-01 → **dropped** |

Code for the "newest" rule: `server.js:30442-30443`

```js
const dims = fs.flatMap(f => f.dims), dates = dims.map(d => r.asOf?.[d]).filter(...).sort();
inputs.data[r.ccy] = { score: ..., asOf: dates.length ? _beDayEnd(dates.at(-1).slice(0, 10)) : sc.generatedAt, ... };
```

Silent revision: the stored issue read EUR "10y real −0.33%, z −1.86" (asOf 2026-10-01). `/api/real-yield` at
23:46 UTC the same day: EUR latestReal −0.59, z −2.56, `latestDate` still 2026-10-01 (`live/real-yield.json`).

Is stale data treated as valid? Yes, within the budgets, and at **full weight**: a 119-day-old input counts the same as
a 1-day-old one. Past the budget it is dropped entirely: a cliff, not a slope.

**Proposed age-based confidence (not a score change).** Measure age from the *knowable* time (release time, or period
end + the series' typical lag), not the period start. Give each input a freshness factor
f = 0.5^(max(0, age − expected_lag) / half_life), with the half-life set by cadence before any test (daily 3 d, weekly
10 d, monthly 45 d, quarterly 120 d; theory values, not fitted). Report a per-market **data-quality** number,
Σ w_i·f_i / Σ w_applicable, separately from the score. Keep the score itself unadjusted until the forward test in §6
(change 1) says a freshness discount helps.

### 3.2 Rate differential (item 2)

Trace: FRED/BoE monthly short rate → `rateDiffScore` → z vs the previous 24 prints → KV `rate_diff_v1` →
`inputs.rates[c] = { level, z }` → d = band(z) + gap nudge. Answers to the brief's question:

| Does it measure… | Answer |
|---|---|
| individual currency rate levels? | Only through the ±1 gap nudge at ≥ 1.5 pp vs a mixed-tenor average (non-zero on 22% of months). |
| changes? | Indirectly: a 24-month z of a level is a slow change signal. It agrees with the sign of the 12-month change in the bilateral gap 86% of the time. |
| historical z-scores? | **Yes, mainly** (Spearman 0.94 with d). |
| actual bilateral differentials? | **No.** The pair term agrees with the sign of the real bilateral level 63.5% of the time (`rate_driver.json`, 5,194 pair-months 2010-2026). |

Live inconsistencies (stored 2026-11-18):

| Ccy | Level | Gap vs avg | Own z | d | Comment |
|---|---|---|---|---|---|
| JPY | 1.23% | −1.60 pp | +2.84 | **+1** | Second-lowest rate in the set; called rates-positive because it rose. |
| USD | 4.74% (2y) | +1.91 | +2.70 | +2 | Tenor mismatch: Fed funds is 4.00%. |
| AUD | 4.80% | +1.97 | +2.01 | +2 | |
| GBP | 3.93% (partial Nov mean) | +1.10 | −0.42 | **0** | Third-highest rate, scored 0. |
| CHF | −0.04% | −2.87 | −0.59 | −2 | z −0.59 crosses the 0.5 line. |
| CAD | 2.27% | −0.56 | −0.79 | −1 | |

AUDJPY rates contribution: AUD +2 × 0.222 and JPY +1 × 0.25 → net **+0.097** to the pair score, against a carry
differential of about 3.6 pp. In July 2026 (latest-vintage FRED, before the lockbox) JPY at 0.98% and AUD at 4.48% both
scored d = +2, so the pair term was 0.

### 3.3 Scoring architecture (item 3)

- **Few drivers can dominate.** 2026-11-16: GBP = data only → 0.667 Bullish, coverage 0.632 (`live_structure.json`).
  NZD 2026-11-18: rates wNorm 0.50 and risk 0.25, coverage 0.444, so Neutral only through the coverage gate.
- **Coverage changes move scores with no new information.** USD went 1.08 (coverage 0.68, policy dropped) on 11-16 to
  0.89 (coverage 1.00) on 11-17 mostly because policy came back at d = 0 and diluted the others.
- **Label flicker.** GBP: 11-17 Bullish 0.82 (policy +2: +7 bp and hawkish) → 11-18 Neutral 0.47 (+4 bp and hawkish:
  +1) → 23:54 live 0.12 (−5 bp and hawkish: 0).
- **On 2026-11-18, 0 of 28 pairs were called.** On 11-17 one was; on 11-16 three were.
- **Arbitrary constants** (all chosen by theory, none tested; every one is a hidden degree of freedom):

| Constant | Value | Where |
|---|---|---|
| Policy bands | 5 / 15 bp per ~5 sessions | `js/biasEngine.js:55` |
| Stance cut | ±0.5 → ±1 | `:56` |
| Rates z bands, gap | 0.5 / 1.5 SD; 1.5 pp | `:57-58` |
| Data bands | 0.15 / 0.5 | `:59` |
| Real-yield gap, z | 1.0 pp; 1.0 SD | `:60-61` |
| Role bands | 0.3 / 1.0 | `:62` |
| Commodity bands | 2 / 6 % over 20 sessions | `:63` |
| COT | 90 / 75 percentile (and mirror) | `:64` |
| Trend | 0.15 / 0.6 σ·√5; EMA20; 5-bar slope; 60-bar σ | `:65`, `:135-141` |
| US real change | 8 / 25 bp over 20 obs | `:66` |
| USD score → d | 0.3 / 1.0 | `:67` |
| VIX percentile | 20 / 40 / 60 / 80 over 252 days | `:68`; `server.js:30479` |
| VIX/VIX3M | 1.00 / 0.95 / 0.85 (asymmetric) | `:69` |
| HY change | 20 / 50 bp over 20 obs | `:70` |
| S&P return | 1 / 3 % over 20 sessions | `:71` |
| Risk roles | −1 … +1 per market | `:48-49` |
| All weights | theory-v1 | `:41-46` |
| Age budgets | 10 / 120 / 7 / 14 days | `:75` |
| Neutral rules | strength ≤ 2; coverage < 0.5; conflict gap 0.1 | `:76` |
| Strength scale | × 5 | `:191` |
| Sub-engine z | 24 prints, ≥ 6 baseline; score = clip(z/2.5) | `js/yieldCurveEngine.js:51`, `js/rateDiffEngine.js:33` |
| Peer averages | need ≥ 4 currencies | `:368` |

### 3.4 Risk factor independence (item 4)

`risk_factors.json`. Engine sample (the 4 inputs incl. HY OAS): 2023-10-31 → 2026-08-20, n = 703 days. FRED only
holds ~3 years of HY OAS. 95% CIs from a 21-day block bootstrap (B = 1000, seed 20261118).

Spearman correlations of the **readings**:

| | VIX level | VIX pct1y | VIX/VIX3M | HY 20d chg | SPX 20d ret |
|---|---|---|---|---|---|
| VIX level | 1 | 0.87 | 0.68 | 0.35 | −0.48 |
| VIX pct1y | | 1 | 0.84 | 0.37 | −0.53 |
| VIX/VIX3M | | | 1 | 0.34 | −0.51 |
| HY 20d chg | | | | 1 | **−0.72** |

Changes (risk-on orientation, Pearson):

| Pair | Daily | Weekly (non-overlapping) |
|---|---|---|
| −ΔVIX ~ −Δ(VIX/VIX3M) | 0.87 | 0.89 |
| −ΔVIX ~ SPX return | 0.83 | 0.74 |
| −ΔHY ~ SPX return | 0.63 | 0.67 |
| −ΔVIX ~ −ΔHY | 0.56 | 0.66 |
| −Δratio ~ −ΔHY | 0.46 | 0.50 |

**d-values as the engine maps them** (Spearman): vix~term 0.72, credit~spx 0.65, vix~spx 0.53, term~spx 0.44,
vix~credit 0.31, term~credit 0.29. When both are non-zero, they share a sign 97.5% (vix~term), 98% (credit~spx) and
90% (term~spx) of the time.

PCA:

| Set | PC1 share | Effective N (participation ratio) | Eigenvalues > 1 |
|---|---|---|---|
| Readings (risk-on signed) | **0.70** [0.59, 0.79] | **1.86** [1.55, 2.24] | 1 |
| d-values | 0.65 [0.55, 0.74] | 2.09 [1.74, 2.55] | 1 |
| Daily changes | 0.77 | 1.63 | 1 |
| Weekly changes | 0.77 | 1.61 | 1 |
| 3 inputs (no credit), 2010-2026, n 4,183 | 0.73 [0.69, 0.76] | 1.75 [1.63, 1.89] | 1 |
| Sensitivity: BAA−10y as credit stand-in, 2009-2026, n 4,222 | 0.64 [0.59, 0.69] | 2.16 [1.95, 2.40] | 1 |

PC1 loadings are nearly equal (0.48-0.52), so **R is essentially PC1 already**: corr(R, PC1) = 0.96. The equal-weight
mean of four banded copies of one factor adds little beyond one well-measured factor. What it does add is the
appearance of agreement, plus band noise.

Agreement: on 17% of days at least one d opposes another. Given any non-zero d, 82% of days have no conflict. All four
are non-zero and the same sign on 14% of days. |R| ≥ 1 on 39% of days.

Persistence: R autocorrelation is 0.91 at lag 1, 0.73 at lag 5, 0.22 at lag 20 and −0.06 at lag 60, consistent with the
backtest finding that risk readings mean-revert at 1-4 weeks.

**Bias.** Mean R = +0.195. Mean d: S&P +0.73, HY +0.10, VIX/VIX3M +0.005, VIX pct −0.05.

Would PCA or a factor approach help? Structurally yes: use one risk factor (an equal-weight mean of z-scored inputs, so
nothing is fitted), drift-adjusted, and say it is one factor. Effective N ≈ 2 means at most two dimensions are worth
keeping. The second is mostly credit vs vol (eigenvalue 0.83). The **sign and size of each market's exposure** is the
real open question, not the number of inputs (§6, change 4).

### 3.5 Macro data (item 5)

Combination: data = mean(growth, inflation, labour, demand) over the factors present, each in −1..1, then banded at
0.15 / 0.5. Live USD: (0.27 + **0.79** + 0.10 + 0.20) / 4 = +0.34 → d +1. Inflation is the largest term.

Sign problems:

| Market | Inflation sign used | Economically |
|---|---|---|
| Currency | + always | + only if the central bank is expected to respond (priced path rising). In stagflation, or with a CB behind the curve, real rates fall: neutral to negative for the currency. |
| US / EU indices | + (through USD / EUR / GBP data) | Mostly − (discount rates up). 2026-11-18 SPX: dropping inflation from USD data still gives +0.19 (d +1). Flipping its sign gives −0.055 (d **0**). |
| Oil, copper | + (global data) | Defensible (partly reverse causality), but circular. |

Stagflation (growth −, inflation +) averages to about 0. It is reported as "nothing to see", which is the opposite of
what a desk wants flagged.

### 3.6 Bilateral relationships (item 6)

(s_b − s_q)/2 assumes every driver is a currency attribute that differences cleanly. That holds for linear drivers on
a common scale. It fails here:

- **Rates.** Banded own-history z's do not difference into a rate gap (§3.2).
- **Real yields.** Only 3 currencies, and `na` elsewhere. EURJPY's real-yield term comes from EUR only, and is not a
  real-yield differential.
- **Policy.** The difference of two banded 5-day changes, not the relative priced path (priced bp_b − priced bp_q, or
  the 2y spread).
- **Risk.** The fixed role difference (AUD +1 vs JPY −1 = 2) is not the pair's actual beta to the risk factor.
- **Economic divergence.** Each leg's "data" mixes different factor sets (§2 D2).

Evidence the bilateral form carries information that the engine discards: Evidence Book `fx-factor-carry` (3-month
differential vs USD ranking: OOS rank-IC +0.079 [−0.030, +0.192], UNDERPOWERED). It is a candidate, not a result, but it
is the bilateral **level**, which this engine's rates term does not represent.

### 3.7 Confidence and calibration (item 7)

- **Today:** one number (strength) does three jobs: direction size, confidence and display gate. Coverage is a gate
  only. Driver agreement enters only through the top-two conflict rule.
- **Backtest** (`analysis/output/bias-engine-backtest/RESULTS.md`, components): strength does not grade (pooled
  20 d: −2.2 / −3.2 / −0.6 pp by strength band; FX worsens with strength). The Neutral line adds nothing (+0.7 / −0.4 /
  −1.2 pp). Used here as evidence only, not refitted.
- **Scoreboard mapping:** p_up = p0 ± 0.01 × strength (3-10 pp). With no grading, the log score is penalised in
  proportion to strength.
- **Can it be calibrated?** Only from the forward record, and only after enough rows (the scoreboard's own MDE at 120
  shared days is several pp). Calibration has to come after a clean, horizon-matched record; it cannot be fitted to
  the backtest.
- **Does agreement add information?** Unknown. It is testable as a pre-registered conditioning variable (§6, change 8).
  The risk block shows why naive agreement misleads: correlated inputs agree by construction.

---

## 4. Proposed changes, ranked by importance

Ranked by how much each one fixes what the engine measures, before any question of whether it predicts.

1. **Point-in-time freshness and data quality.** Stamp every input with obsPeriodEnd, releaseTime (knowable),
   fetchedAt and vintage. Age = issue − releaseTime. Use the **oldest** (or weight-averaged) age, not the newest. One
   budget per cadence, shared with the scorecard. Give derived drivers the true dates of their inputs. Add a separate
   `dataQuality` field (§3.1). Hash the input values into the issue so a replay can detect revisions. *(F1-F7)*
2. **Rebuild the rates driver as a level differential.** Use one tenor for every currency (the 2y government yield
   already held in `yield2y_daily_v1`, or the policy rate). At currency level: the cross-sectional level gap. At pair
   level: the bilateral gap (see 7). Report "level" and "20-day change" as two separately named readings, and stop
   calling a 24-month z a differential. *(R1-R5)*
3. **Take banked-null inputs out of the score path.** Stance (cbSentiment) and the COT contrarian rule become context
   rows on the card, with no d. This is based on their own banked evidence (`cb-tone-direction` NULL; the cot-crowding
   programme mostly NULL/UNDERPOWERED, and `js/cotState.js` says "never a direction"), not on this backtest. *(P4, part of
   S2)*
4. **One risk factor, drift-adjusted, with its exposure an open, tested question.** Replace four banded d's with one
   continuous factor: the mean of z-scored VIX percentile, VIX/VIX3M, HY change and S&P **excess** return (each z vs a
   point-in-time trailing window). Make the term-structure mapping symmetric. Remove the S&P leg from R inside the
   index models (they have their own trend). Freeze the FX roles at 0 in the *score* (keep R as context) until change
   4's test decides their sign. That freeze is not a weight optimisation: it removes a term whose sign is in doubt from
   independent evidence (mean reversion) and from the backtest's BH-surviving cell. *(K1-K3, A1)*
5. **Policy: use the priced path, at the engine's horizon.** Reading = priced bp over 6-12 months relative to the peer
   average (level), plus its 20-session change. One scale for futures and the 2y proxy (z vs each series' own PIT
   trailing SD of 20-day changes). *(P1-P3)*
6. **Split data into growth and inflation and fix the signs.** Growth (growth + labour + demand) → +. Inflation →
   conditional: + for the currency only when the priced path is rising; − for equity indices; flagged as
   **stagflation** when growth < 0 < inflation. Require the same factor set for every currency, or mark the driver
   `na`. *(D1-D3)*
7. **A pair-level relative-value engine** (section 5). The (b − q)/2 cross stays as the "currency strength" view;
   pairs get their own bilateral block. *(R2, §3.6)*
8. **Separate the three outputs and score at the right horizon.** Output `direction` (a continuous score), `confidence`
   (uncalibrated until the forward record supports calibration; shown as "uncalibrated"), `dataQuality` (change 1) and
   `agreement` (the share of the weight that agrees in sign, with the risk block counted once). Add a 20-session
   forward target for the engine on the scoreboard (a PRE-RESULTS amendment). Map strength to p_up only after
   calibration. *(C1-C2)*
9. **Missing-driver policy: shrink, don't renormalise.** Score = Σ w·d / Σ w_applicable (missing counts as 0), so a
   thin market is pulled to neutral rather than amplified. Report coverage beside it. *(S1, S3)*
10. **Remove double counting in the asset models and unify "US real yield".** Gold: Fed path either direct or through
    the USD score, not both. Indices: no S&P momentum inside R. One US real yield (TIPS) everywhere; drop GS10 − CPI or
    rename it "ex-post real yield". *(A1-A3)*
11. **Bring the spec back in line with the code** (or the code with the spec). List every constant in §3.3 in the spec
    with "theory, untested". *(R5)*

---

## 5. Revised architecture proposal

```
L0  Input ledger (pure, versioned)
    every reading: value, obsPeriodEnd, releaseTime, fetchedAt, vintageHash, cadence, source, fallback?
    freshness f_i = 0.5^(max(0, age - lag)/halfLife(cadence))       (theory constants, frozen before any test)

L1  State blocks (continuous, no bands; each z vs its own POINT-IN-TIME trailing window)
    per currency:  PolicyPath  (priced bp 6-12m vs peers; 20d change)       one tenor, futures or 2y on one scale
                   RateLevel   (2y or policy rate, same tenor for all)
                   Growth      (growth, labour, demand; same factor set or na)
                   Inflation   (kept separate; never summed into Growth)
    global:        RiskFactor  (mean of z(VIX pct), z(VIX/VIX3M), z(HY 20d chg), z(SPX excess 20d)); one factor
                   USD-real    (TIPS 10y, level and 20d change)

L2  Market views
    Currency strength  (descriptive): a fixed linear map of L1 blocks; missing = 0 (shrink), coverage shown
    Pair RV engine     (bilateral):   ΔPolicyPath(b-q), ΔRateLevel(b-q) and its 20d change, ΔGrowth, ΔInflation
                                      conditioned on ΔPolicyPath (stagflation flag), carry = RateLevel(b-q),
                                      risk exposure = rolling PIT beta of the pair to RiskFactor (context until tested)
    Asset models       each input enters once (no R-inside-trend, no Fed-path-inside-USD-and-direct)

L3  Output, per market (four separate fields)
    direction   continuous score in [-2, 2] and its sign
    confidence  'uncalibrated' until the forward record supports a monotone map (isotonic) score -> P(up)
    dataQuality Σ w·f / Σ w_applicable
    agreement   weight share agreeing with the sign (risk counted once)
    Neutral = |direction| small OR dataQuality low; never "because the two biggest drivers disagree by < 0.1"
```

Principles:
- Every number is reproducible from L0 at the issue time.
- No banded d enters an average.
- No banked-null input carries a d.
- Correlated inputs count once.
- The pair engine is the place for relative value; currency strength is context.

---

## 6. Test plan per change (repo research style)

Common rules for every test below:
- Each is its own slug, with a register row, a prereg committed before any outcome is computed, and one seed (the
  prereg date).
- **Point-in-time inputs only**: ALFRED first prints with release-time `eff` (as `scripts/bias-engine-backtest/build_inputs.py`
  does), issue 07:00 London, inputs dated before it.
- **Lockbox:** no session on or after **2026-08-21** is used for any decision. Historical screens stop at London
  date 2026-08-21. Forward rows count from the deploy date only. Sessions from 2026-08-22 to the day before deploy are
  used by nothing.
- **Score against the point-in-time B0** (hit excess, and log score vs B0 on identical rows), net of real spread.
  21-session block bootstrap, block-permutation placebo, both halves.
- **Multiplicity:** Holm across the primary cells of the family (change × horizon {1, 5, 20} × group {fx, gold, idx});
  BH q = 0.10 for component diagnostics, which are candidates only.
- **No weight fitting.** Every constant is frozen in the prereg from theory. A change that needs a tuned parameter is
  not eligible.
- **The decision rests on the forward record.** Each change runs as a **shadow forecaster** `bias-engine-v2-<change>`
  on the bias scoreboard. Head-to-head against v1 on the same rows (the scoreboard's later-anchor rule), at the
  registered looks (60th and 120th shared day). Add a 20-session target as a PRE-RESULTS amendment to
  `forge/BIAS_SCOREBOARD_PREREG.md`.
- **The 2010 → 2026-08-21 history has already been seen** for v1. A historical run of a structurally specified
  alternative is a **falsification screen**: it may demote a change (for example, worse than v1 beyond the CI, or wrong
  sign in both halves). It may never promote one.

| # | Change | What would show it helps | Test design | Notes |
|---|---|---|---|---|
| 1 | PIT freshness + dataQuality | (a) Correctness: stored issues replayed with corrected stamps; count labels that change. (b) Usefulness: rows with high dataQuality score better vs B0 than rows with low. | (a) Unit tests and a replay diff, descriptive: no performance claim needed for a correctness fix. (b) Forward: pre-registered split at the median dataQuality, log-score difference vs B0 in each half, interaction CI excludes 0 at look 2. | The freshness half-lives are frozen in the prereg. |
| 2 | Rates = level differential | The pair rates term ranks next-20-session pair returns, and the bilateral gap beats v1's z-term head-to-head. | Historical screen: monthly, 28 crosses, rank-IC of the bilateral 2y gap vs v1's (d_b − d_q), 2010-01 → 2024-08 discovery, 2024-08 → 2026-08-21 confirm, Holm over {IC_v2, IC_v1, v2 − v1}. Forward shadow at 20 d. | Must not reuse `fx-factor-carry` as discovery for the same claim: cite it, don't re-run it. |
| 3 | Drop stance and COT from the score | v2 is not worse than v1 (a non-inferiority margin of 1 pp hit excess at 20 d), and it is simpler. | Forward shadow; non-inferiority, one-sided 95%. Historical screen not possible for stance (no PIT history), so the forward record only. | Their removal rests on banked evidence; this test only guards against harm. |
| 4 | One risk factor; FX roles at 0 in the score | (i) R as one factor has no worse coverage and the same information; (ii) the sign of the FX risk exposure at 5 / 20 d. | (i) Descriptive (this audit). (ii) A **new** prereg on the role question. Discovery = FX crosses 2010-2018, confirm 2018-2026-08-21, roles from the pair's rolling PIT 60-day beta to the factor (no fitting to returns), Holm across {5, 20} d × {role-signed, beta-signed}. Then a forward shadow. | The backtest's −4.4 pp is the motivation, so it cannot also be the test. Hence the new split and the beta-based exposure. |
| 5 | Policy = priced path level + 20 d change | The policy term ranks 20-session currency returns better than v1's 5-day change. | Historical screen with the 2y proxy only (futures history not held): currency-level IC, discovery and confirm as in #4, Holm. Forward shadow with futures. | The same 2y data as the backtest, so a screen only. |
| 6 | Growth / inflation split, conditional inflation sign | (a) Equity indices: the data term with inflation signed − beats v1's +. (b) A stagflation flag predicts a lower currency 20 d return than non-stagflation. | Needs a PIT scorecard history that does not exist: first build ALFRED vintages of the scorecard inputs (a separate data task), then prereg. Until then, forward shadow only. | Biggest data dependency. |
| 7 | Pair RV engine | The pair engine beats (b − q)/2 head-to-head on the 28 crosses at 20 d, and beats B0. | Forward shadow `pair-rv`; historical screen limited to the blocks with PIT history (2y gap, carry, risk beta). Holm across {pair-rv vs B0, vs v1} × {5, 20} d. | Every constant pre-frozen. |
| 8 | Separate confidence / quality / agreement | (a) Agreement: rows in the top agreement tercile beat the bottom tercile vs B0. (b) Calibration: after look 2, an isotonic map from score to P(up) fitted on looks 1-2 is evaluated on the next 120 forward days only. | (a) Forward, pre-registered terciles, interaction CI. (b) Strictly forward: fit on rows 1-120, test on 121-240, log score vs B0. Never fitted on the backtest. | Until (b) passes, the card says "uncalibrated". |
| 9 | Shrink instead of renormalise | Low-coverage calls are fewer and not worse; label flicker falls. | Descriptive flicker statistic on the forward issues (label changes per market-week) v1 vs v2; forward non-inferiority on log score. | Mostly a robustness fix. |
| 10 | Asset de-duplication, one US real yield | Index and gold models are not worse; the explanation is cleaner. | Forward non-inferiority on gold and idx at 1 / 5 / 20 d. | |
| 11 | Spec = code | n/a | Code review; a test that asserts the spec's constant table equals `TH`. | |

---

## 7. What I could not verify

- **`_cbExpect` internals.** How the futures rungs become m3 / m6 / m12, whether any rung is stale or illiquid, and
  per-bank freshness (the store has one asOf).
- **Sub-engine dating per series.** For the scorecard dimensions (ism, gdp, retail, labour, confidence) I relied on the
  dates the scorecard reports. Whether each is a period start or a release date was **not** checked series by series.
  USD `ism` dated 2026-11-01 on 2026-11-18 suggests at least one is not a monthly-average period start.
- **COT percentile.** Lookback and definition were taken from the backtest's description (`build_inputs.py`: up to
  155 prior reports, ≥ 52), not re-derived from the worker. I did not find out why EUR, JPY and CAD are missing from
  `/api/cot-state`.
- **Data sources.** The risk analysis uses the Yahoo ^GSPC cash close, not OANDA SPX500, and FRED HY OAS holds only
  2023-10 onward (n 703). The long-history row uses BAA−10y as a stand-in, labelled. The rates analysis uses
  latest-vintage FRED (not first prints), and the GBP 3m series that ended 2026-01. Live GBP uses Bank Rate.
- **EUR CPI.** The EUR real-yield revision is observed (two reads), but I did not identify which input changed.
- **Live engine performance.** No statistic here measures performance. The forward record has 3 stored issues.
