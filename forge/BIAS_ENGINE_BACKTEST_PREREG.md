# bias-engine-backtest — does the live bias engine, rebuilt point in time, call direction better than the base rate?

**Pre-registered 2026-11-16, before any engine call was joined to an outcome.**

| | |
|---|---|
| ID / ledger ids | `bias-engine-backtest-sameday`, `bias-engine-backtest-5d`, `bias-engine-backtest-20d` (one per horizon; each holds its three group cells), `bias-engine-backtest-components` (strength ladder, Neutral abstention, driver decomposition: descriptive / candidates only) |
| Branch | `claude/bias-engine-backtest` |
| Register row | `plans/RESEARCH_REGISTER.md` → `bias-engine-backtest` |
| Data | London issue dates 2010-01-04 → 2026-08-21 (4,340 weekdays). Engine inputs: see §3. Outcomes: OANDA bid/ask M1 (same day, 2016-10-24 →), New York 17:00 closes (5 / 20 days; majors, crosses, gold, NAS100, SPX500 from 2010; US30, US2000, DE30, UK100 from 2016). Nothing priced after 2026-08-21 21:00 UTC (lockbox) |
| Seed | `20261116` (every script) |
| Uncertainty | cluster bootstrap over 21-session date blocks shared by every market, B = 2000; block-permutation placebo (whole 21-session blocks of the engine's calls moved together across all markets), 500 draws |
| Scripts / outputs | `scripts/bias-engine-backtest/` → `analysis/output/bias-engine-backtest/` |
| Harness | own scripts: the engine itself is imported from `js/biasEngine.js` (node), inputs and scoring in Python, evidence pack `scripts/evidence_pack/pack.py` |

## 1. The claim (required)

Owner 2026-11-15/16: the bias engine (`js/biasEngine.js`, spec `plans/BIAS_ENGINE_SPEC.md`, weights `theory-v1`) is "an
explainable, rule-based macro bias for every market" meant to be "a good indication of what happens"; the question now
is whether it should be shown on the desk terminal as a slow data-driven bias under the discretionary Desk Call, or
hidden. Each morning (~07:00 London) it gives every currency, the 28 crosses, gold and the indices a direction
(Bullish / Bearish / Neutral) and a strength 1–10 from: policy path .25, rate differential .20, data momentum .20, real
yield .10, risk role × R .10, commodity .05, COT positioning (contrarian) .05, trend .05 (currencies); the asset models
have their own lists. It has never been back-tested; forward scoring began 2026-11-16 (`bias-scoreboard`, forecaster
`bias-engine`).

**Claim tested:** on the days it calls a side, the engine's side is right more often than the point-in-time base rate
(B0), on the same London day and at 5 and 20 trading days, and the calls make money net of the spread. The engine
claims to be slow, so 5 and 20 days are where it is judged mainly.

**Edge source (RESEARCH_METHOD_LESSONS #4):** a mix. Rate differential / policy path / real yield are the carry and
policy-surprise premia (risk premium + slow information diffusion); trend is time-series momentum (behavioural); COT
contrarian and the risk role are positioning / risk-premium views. Who is on the other side: hedgers and slower real
money. Nothing in the engine is fitted, so there is no in-sample fit to overfit; the holdout guards against the
2010-2024 era being special.

## 2. Why it is not already settled (required)

The engine has never been scored. Its pieces have been, separately, and mostly came back null or underpowered:

- `slow-bias-clock` (branch `claude/signal-bot-bias-analysis-bwr1qv`, banked 2026-11-15): vol-scaled 1/3/12-month trend
  + carry blend as a daily bias. Direction UNDERPOWERED (FX powered NULL +1d BSS −0.050% [−0.089, −0.012]); R NULL;
  book UNDERPOWERED (net Sharpe +0.24 [−0.15, +0.63]). Next it named: weeks-scale direction only.
- `fx-factor-book-v2` (2026-09-27, UNDERPOWERED): carry +0.61 OOS Sharpe in the 2021-26 divergence era, −0.12 in
  sample; trend −0.16. `trend-following-fx` NULL.
- `positioning-flow-inputs` (2026-11-15): book / RR / VRP / month-end all UNDERPOWERED, powered FX cells NULL.
- `growth-inflation-quadrant` (2026-11-15): 7 NULL, 14 UNDERPOWERED; USD / indices no tilt.
- COT: `cot-positioning-factor` NULL, `cot-crowding-*` mostly NULL / UNDERPOWERED (crowded-against not a reversal
  signal, `cot-crowding-s0-adv` NULL; only P5 "crowded pullback resets" VALIDATED, a different state).
- `direction-bar` (Phase 0, CONTEXT): what any directional cell must beat; B0 base rates; pooling 7 USD pairs ≈ 2.8
  independent forecasts; a 20-day single-market cell needs ~29 pp on 10% activity — pooling is the only route.
- `mtf-structure`, `coherence-conviction`, `meta-labelling`: no daily-bias upgrade from timeframe agreement,
  cross-asset coherence or a fitted act/stand-aside label.
- `bias-scoreboard` (forward, REGISTERED): the engine's forward record from 2026-11-16, judged at 60 / 120 shared days.

**Why this is a different question:** none of those scores the COMBINED engine as built: its thresholds, weights,
renormalisation over missing drivers, coverage rule, Neutral rule and the pair = (base − quote)/2 construction, across
28 crosses + gold + indices. A combination of individually weak drivers can be better or worse than its parts; this is
the one test of the thing that would be shown. The component nulls are written down here so a positive result is read
against them and a null is not "new".

Prior-session check: `grep -ril bias-engine forge plans analysis/output js/deskEvidence.js` → only the spec and the
scoreboard prereg's forward amendment; no back-test exists.

## 3. Definitions, fixed in advance (required)

### 3.1 The engine, rebuilt point in time

`scripts/bias-engine-backtest/run_engine.mjs` **imports** `buildBiasRecord`, `fillPolicyFallback`, `labelOf`,
`pairFrom` from `js/biasEngine.js` and `yieldWeekChange` from `js/yield2y.js`. No threshold or weight is re-implemented.
Parity: `node js/biasEngine.test.mjs` passes (9 tests) on the commit used; the driver has its own selftest (publication
lags, bar slicing, proxy policy reaches the engine). Issue time 07:00 Europe/London on every weekday.

| Driver (weight) | Live source | Point-in-time stand-in here | Coverage 2010-01 → 2026-08 |
|---|---|---|---|
| Policy path (.25) | IBKR futures pull, 2y yield proxy when stale | **the spec's own 2y proxy for every currency** (futures have no history): each 2y series from the same official source as `js/yield2y.js` (FRED DGS2, ECB YC SR_2Y, BoE IUDSNPY, MoF JGB, BoC Valet, RBA F2 + f02dhist, SNB rendoblid → rendoeid), points used only once published (daily sources: dated before the previous business day; SNB monthly: from the 4th of the next month), `yieldWeekChange` → `fillPolicyFallback`. Stance (cbSentiment ±1) not reconstructible → 0 | USD, GBP, CAD 100%; EUR 99.7%; JPY 98.7%; AUD 98.2% (gap 2013-05→09); CHF 20.7% (monthly publication vs the 10-day age budget, as live); **NZD 0%** (RBNZ blocks scripted clients with 403, as it often does live) |
| Rate differential (.20) | FRED/BoE monthly short rates, `rateDiffScore` | the same series (USD GS2, EUR DE call money, GBP Bank Rate, JPY call, AUD 3m, CAD call, CHF 3m, NZD 3m) from ALFRED **first prints**, known from their vintage date (2013-06-03 bulk vintage → month end + 45 days); `latestZScore` ported line for line | 85–100% |
| Data momentum (.20) | macro scorecard composite | **not reconstructible** (no point-in-time scorecard history) → dropped | 0% |
| Real yield (.10) | 10y − CPI YoY (USD, EUR, CHF) | USD only: GS10 (monthly mean of DGS10, known after month end) − CPIAUCSL YoY first prints; EUR/CHF CPI vintages not held → dropped | USD 100%, EUR/CHF 0% |
| Risk role × R (.10) | VIX pct, VIX/VIX3M, HY OAS 20d, SPX 20d | VIX, VIX3M (CBOE via FRED, dated before the issue date), HY OAS (FRED, 2023-10 → only: ICE licence), SPX500 D1 | VIX 100%, term 99.3%, credit 16.9%, SPX 100% |
| Commodity (.05) | OANDA copper / WTI D1 | OANDA macro D1 (2016 →); WTI before 2016 from FRED DCOILWTICO lagged 7 days | CAD 100%, AUD 63.5% |
| Positioning (.05 ccy; .10 assets) | `/api/cot-state` share-of-OI percentile | CFTC TFF leveraged funds / disaggregated managed money (`cot_weekly.csv`), the worker's pctRank over the prior ≤155 reports (≥52), public Friday 20:30 UTC, JPY/CAD/CHF turned to currency terms as live | 100% (US2000 54%; USD n/a as live) |
| Trend (.05 ccy; .15 assets) | OANDA D (London midnight) + H4 | D1 London-midnight and H4 (17:00 NY grid) built from OANDA mid M1 from 2016; before 2016 NY-close daily closes as D1 and no H4 (the engine then uses D1 alone, capped ±1, its own rule) | 100% (US30/US2000/DE30/UK100 from 2016) |

**Primary label: history-adjusted coverage.** The engine's SCORE only ever uses the drivers present (weights
renormalised), so missing data momentum does not change any score. It does change the coverage gate behind Neutral:
with data momentum (.20) counted as missing, NZD and CHF (and every NZD/CHF pair) fall below coverage 0.5 and are
forced Neutral for a gap the live engine does not have. So the primary label takes the drivers that exist live but
cannot be rebuilt (data momentum everywhere; EUR / CHF real yield) out of the coverage base, then applies the engine's
own `labelOf` / `pairFrom` unchanged. NZD policy stays counted as missing. Effect on calls (signals only, no outcome
seen): FX market-days called 19.2% (as built 9.0%), gold 37.6%, indices 55.5% (identical). Calls by strength:
3: 19.5k, 4: 11.3k, 5: 4.9k, 6: 2.3k, 7+: 1.4k. **Sensitivity S4:** the labels exactly as built.

### 3.2 Markets and groups

- **fx**: all 28 crosses as the engine builds them (s = (s_base − s_quote)/2).
- **gold**: GOLD.
- **idx**: NQ (NAS100), SPX500, US30, US2000, DE30, UK100.
- Silver / WTI / copper: priced by the engine, not scored (no outcome history to 2010; macro D1 only).

### 3.3 Outcomes, costs, units

- **Same day** (h = 0): ln(mid at the close of the last M1 bar in [20:30, 21:00) London / mid at the open of the first
  bar in [07:00, 07:10)) on the issue day, OANDA bid/ask M1, 2016-10-24 → 2026-08-21. Cost = half the quoted spread
  at entry + half at exit (real quotes at those minutes). NZDCHF has no bid/ask file: not scored same day. Days with no
  bar in either window are counted as unresolved and reported.
- **5 / 20 days**: ln(C[D+h] / C[D]) on New York 17:00 closes, C[D] = the close of the issue date (≈ 22:00 London,
  after the 07:00 issue: the 15 hours in between are given up, never credited). Crosses as ratios of the USD majors.
  Exits after 2026-08-21 are dropped. Cost = the instrument's median quoted round-trip spread at the 21:00-London exit
  bar (2016-10 → 2026-08), one entry + one exit. Financing / swap is not charged (FX carry would flatter the rate
  driver's long-carry calls; reported as a limit in §7).
- **Unit**: σ = SD of the previous 60 NY-close daily log returns (≥ 40, ending at D−1). R = signed return / σ.
  "R per day" = R per call / max(h, 1).
- **B0 (point in time)**: per market and horizon, from outcomes fully realised before D: P(up) (expanding; 0.5 until
  120 resolved) and drift μ (mean outcome in σ). Expected hit of a call = P(up) for Bullish, 1 − P(up) for Bearish.
- **Hit excess** = hit − expected hit, over called rows with a non-zero outcome (the primary statistic).

### 3.4 Sample, de-clustering, uncertainty

- Discovery: issue dates 2010-01-04 → 2024-08-21. **Holdout: 2024-08-22 → 2026-08-21** (opened once, in the same run;
  the engine has no fitted parameters, so the holdout guards against era, not overfitting).
- Rows: one per market per issue date where the engine calls a side. Overlap and cross-market correlation are handled
  by clustering: every row's cluster is its 21-session date block (shared by all markets); bootstrap resamples whole
  blocks (B = 2000).
- Block-permutation placebo (500): whole 21-session date blocks of the engine's calls are moved to other blocks,
  the same move for every market (keeps each call series' persistence and the cross-section; breaks only the link to
  outcomes). Lesson 2026-11-04 (row shuffles understate the SE of persistent signals) applied. The evidence pack also
  runs its standard row-level shuffle; that one is descriptive.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| H1 | Same day, per group: hit excess > 0 | **Null** (every same-day direction cell in the book is null; the engine is slow by design) |
| H2 | 5 days, per group | **Null or small** (≤ +1 pp; component nulls) |
| H3 | 20 days, per group | **Small at most** (carry / trend era effects; FX maybe +1–3 pp, below the bar) |
| **THE GATE** (per cell) | VALIDATED needs all of: discovery hit excess > 0 with Holm-adjusted p < 0.05 across the 9 primary cells; discovery net R per call 95% CI > 0; real hit excess above the 97.5th percentile of the block-permutation placebo; hit excess > 0 in both discovery halves; holdout hit excess > 0 (point) | |
| verdict words | **CONTEXT** if Holm + placebo pass but net R, either half or the holdout fails (statistical, not usable). **NULL** if not validated, MDE ≤ bar and the CI upper end < bar (the useful size ruled out). **UNDERPOWERED** otherwise (MDE > bar, or the CI still holds the bar). A CI wholly below 0 is NULL (wrong sign) when powered | |
| **THE MIRROR** | The opposite call (fade the engine) is the same cell with the sign flipped; a significantly negative hit excess is reported as wrong-sign, never re-labelled as a fade signal | |
| S1 | Strength ladder: does hit excess rise with strength (buckets 3–4 / 5–6 / 7–10; slope per strength point)? | **No** |
| S2 | Neutral abstention: are Neutral days, scored on sign(score), worse than called days (abstention value = hit excess called − Neutral-signed > 0)? | **No** |
| S3 | Driver decomposition: each driver alone (FX: sign(d_base − d_quote); assets: sign(d)), hit excess per horizon × group | carry/rates and trend at 20 d are the only plausible positives |
| S4 | As-built labels (data momentum counted missing) | same as primary |

S1–S4 are disaggregation cells (Benjamini–Hochberg q = 0.10). A slice that survives is a candidate for its own
prereg, never a result.

## 5. Power — what this design can and cannot find (required)

Pass bars (the useful size, written before any result): hit excess **+2 pp same day, +3 pp at 5 d, +5 pp at 20 d**
(the R-unit equivalents under a normal approximation, Δp ≈ 0.4·μ/σ_h: 0.04 σ, 0.17 σ, 0.56 σ per trade, used as the
evidence pack's bar). A bias label that is right 2–5 pp more often than the base rate is the least that would justify
a "historically right X%" line on the desk.

MDE = (z₁₋₀.₀₅/(2·9) + z₀.₈) × SE = 3.61 × SE, SE = the SD of the hit excess under the block-permutation placebo
(engine calls moved in 21-session blocks against the real outcomes: a control sample, no setup outcome read), 200
draws, discovery rows. Filled from `run.py --power` (`analysis/output/bias-engine-backtest/power_table.json`):

| Cell | Called rows (discovery) | 21-session clusters | SE (placebo) | **MDE** hit excess | Pass bar | Verdict by design |
|---|---|---|---|---|---|---|
| sameday|fx | 9,268 | 98 | 0.80 pp | 2.9 pp | 2 pp | UNDERPOWERED |
| sameday|gold | 791 | 98 | 1.84 pp | 6.7 pp | 2 pp | UNDERPOWERED |
| sameday|idx | 6,767 | 98 | 0.95 pp | 3.5 pp | 2 pp | UNDERPOWERED |
| 5d|fx | 20,552 | 182 | 1.00 pp | 3.6 pp | 3 pp | UNDERPOWERED |
| 5d|gold | 1,416 | 182 | 2.36 pp | 8.5 pp | 3 pp | UNDERPOWERED |
| 5d|idx | 9,176 | 182 | 1.74 pp | 6.3 pp | 3 pp | UNDERPOWERED |
| 20d|fx | 20,553 | 182 | 1.51 pp | 5.5 pp | 5 pp | UNDERPOWERED |
| 20d|gold | 1,416 | 182 | 3.18 pp | 11.5 pp | 5 pp | UNDERPOWERED |
| 20d|idx | 9,186 | 182 | 2.27 pp | 8.2 pp | 5 pp | UNDERPOWERED |

**All nine cells are UNDERPOWERED by design** at the useful bars: FX comes closest (MDE 2.9 / 3.6 / 5.5 pp against
2 / 3 / 5 pp), gold and the indices need 3.5-11 pp. The sample cannot be lengthened (no intraday data before 2016,
no index history before 2016 for four of six, the engine's inputs start 2009-10). So, by the rule, an empty cell is
banked `UNDERPOWERED`, never `NULL`; a cell can still be VALIDATED or CONTEXT if an effect the size of the MDE is
there. Every cell reports what size of effect its interval rules out, so "how large could it be" is answered even
when the verdict word is UNDERPOWERED. Same-day intervals use 98 clusters (2016-10 onward only).

## 6. Multiplicity (required)

- **Scored cells:** 9 = 3 horizons × 3 groups (fx, gold, idx), discovery sample. Holm at α = 0.05 on their hit-excess
  p-values (normal approximation from the cluster-bootstrap SE). The gate is conjunctive beyond Holm (placebo, net R,
  halves, holdout).
- **Disaggregation:** S1 (12 slope cells), S2 (3), S3 (~39 driver cells): BH q = 0.10 within each family, with the
  chance baseline. Per-instrument and per-year rows come from the evidence pack (descriptive).
- **Promotion bar:** anything that sizes a position needs |t| ≥ 3. A VALIDATED here would allow a labelled display
  ("historically right X% at 20 days, back-test 2010-2024"), not a trade rule.
- Variants: primary (history-adjusted labels) and S4 (as built). No other variant will be run; anything else is a new
  prereg.

## 7. What this does NOT test (required)

- **The live engine with all its inputs.** Data momentum (.20) and the statement-stance nudge are absent from the whole
  history; EUR/CHF real yield too; HY credit exists only from 2023-11; futures-based policy never (the 2y proxy stands
  in, as the spec allows); NZD has no policy input. A null here is a null for the engine **without data momentum**.
  The forward record (`bias-scoreboard`) is the only test of the full engine.
- **Carry / financing.** Swaps are not charged; long-carry calls would earn carry that this ignores (and short-carry
  calls pay it).
- **Silver, WTI, copper** and the currency rankings themselves (only the tradeable pairs and assets).
- **Timing:** the 5/20-day entry is the NY close after the issue (15 hours late); intraday entries are not tested.
- **Cause:** a pass would not show which driver does the work; S3 describes that only.

## 8. What each verdict changes (required)

- **VALIDATED** (any 5 d / 20 d cell): the desk may SHOW the engine under the Desk Call with the label "Slow macro bias,
  rule-based; back-test 2010-2024: right X% vs Y% base rate at N days (holdout X%)" for that group only; never as a
  trade signal; forward scoreboard continues.
- **CONTEXT**: show as context only, with the hit rate and "not tradeable after costs / unstable" beside it.
- **NULL**: HIDE the direction chip; the driver table may stay as a description of conditions ("what the macro inputs
  read"), with no Bullish/Bearish word. Forward record continues so a full-input engine can still earn the display.
- **UNDERPOWERED**: same display rule as NULL (no direction claim), plus what data would make it testable (data momentum
  history; a longer intraday sample).

## Amendments

### A1 — 2026-11-16 — POST-HOC (results seen)
S3 (driver decomposition, descriptive) code fix: FX and asset driver sides shared column names, so the FX risk /
positioning / trend cells were silently skipped, and a missing currency leg was NaN instead of 0 (the engine treats it
as contributing 0). Fixed and S3 alone recomputed (`run.py --drivers-only`). The primary cells, S1, S2, S4 and the
evidence packs did not read those columns. Describes only; changes no verdict. Also: NZDCHF (no bid/ask file) is
charged NZDCAD's measured spread at 5 / 20 d.

---

## RESULTS — run 2026-11-16

UNDERPOWERED at all three horizons (0/9 cells pass the gate); 20-day FX leans the wrong way (hit excess −3.1 pp
[−6.5, +0.1], net −0.37 R per call). Full write-up: `analysis/output/bias-engine-backtest/RESULTS.md`.

*Written to `analysis/output/bias-engine-backtest/RESULTS.md`. Nothing above this line changes after the run.*
