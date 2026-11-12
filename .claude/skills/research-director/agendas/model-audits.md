# Agenda: model audits (are the models we already run doing the job we think?)

Set 2026-11-12 by learn-intake from Quant Guild notes (`education/intake/technical/quant-guild/`; 33 items). Not C.OG.
These are mechanics audits of live inputs and banked numbers, not edge hunts: the verdict changes what the desk relies
on, not a trade. Theme keywords for `evidence_map.mjs`: `hmm regime stability touch probability reachability monte
carlo pca loadings kalman vendor iv fit window`. Hand chosen cards to `research-protocol` to claim. Method lesson
numbers (#n) refer to `education/RESEARCH_METHOD_LESSONS.md`.

## Cards, in rank order

### Q1. Does the HMM label stay put, how many states, and does it beat a plain chain? — score 12/15

> Fit the regime model at t and record day t's label; refit at t+1, t+5, t+20 and re-read day t. Count relabels,
> dwell and flips. Pick 2 vs 3 states on held-out likelihood, try 10 starts against our fixed start, compare transition
> matrices across halves, and read all of it against an explicit two-state σ Markov chain.

| | |
|---|---|
| Construct | `hmm.js` (and `hmmHourly.js`, `creditHmm.js`) filtered state for day t, as fitted at t and after later refits |
| Knowable when | label at t uses data ≤ t (already true since 2026-10-16; lesson #14); the audit compares vintages |
| Condition | instrument; calm vs busy years; fit window 100 vs 200 daily bars (the two live settings) |
| Horizons | refit lags 1, 5, 20 days |
| Noise threshold | relabel and flip rate of the σ chain ("20-day σ above its 1-year median" as a 2-state Markov chain) |
| Outcome distribution | relabel rate, model-implied vs realised dwell, flip rate, held-out log-likelihood 2 vs 3 states, likelihood spread over 10 starts, transition-matrix change between halves |
| Benchmark / control / mirror | the explicit σ Markov chain: QG's rule is that an HMM must beat named states out of sample (lesson #5) |
| Mechanism | none needed: a live label must not change after the fact, and must earn its place over a readable split |
| Builds on | `gr-hmm-trend-direction` NULL (direction, not stability); memory: HMM = variance, not direction; QG's own HMM notebook has no OOS, one start, smoothed labels |
| Data & power | daily bars on hand; descriptive; testable now |
| If yes → | keep; document dwell/flip/state count in the inputs register |
| If no → | replace `hmmSignalScore` inputs with the σ chain |
| Falsifier | HMM no better than the σ chain on held-out likelihood and relabels more |

### Q2. Where does the P(touch) miss come from: σ or path shape? — score 11/15

> **Step 0 (new)**: score realised touches against (a) the shipped MC, (b) the reflection closed form with the
> *realised* σ, (c) the closed form with the *forecast* σ. Then, only if (b) also misses, compare generators: iid +
> wick, block bootstrap of own intraday returns at the same σ, and that plus a time-of-day profile.

| | |
|---|---|
| Construct | P(touch) per method, as in `forecastPathCore.intradayReachability` |
| Knowable when | inputs to bar t; touch over the next H M5 bars |
| Condition | EURUSD, GOLD, NQ × distance tercile |
| Horizons | 6 / 12 / 24 / 48 M5 bars |
| Noise threshold | day-bootstrap binomial interval; placebo levels; MC SE and path/step doubling (lesson #2) |
| Outcome distribution | reliability curve, Brier, Brier skill |
| Benchmark / control / mirror | (b) the oracle-σ closed form; the current piecewise map (fitted EURUSD M5 H=12, borrowed elsewhere) |
| Mechanism | **already checked (2026-11-12, scratch)**: the generator matches the Brownian reflection formula within 1–2.5pp at 0.5–2σ and wick padding is right. So the 94% → 68% miss is σ inputs or non-Brownian paths |
| Builds on | `oiReachability.js` header; level_p2 calibrated geometry; EURUSD reach cells (Brier skill +0.188) |
| Data & power | M1/M5 on hand; thousands of level-days; testable now |
| If (b) matches → | fix the intraday σ ladder, retire the borrowed map |
| If not → | paths aren't Brownian; run the bootstrap generator arm |
| Falsifier | neither the oracle σ nor the bootstrap generator beats the map out of sample |

### Q4. Score the live 5-minute Kalman bias (alert T8) — score 9/15

> Rebuild `compute5mKalmanDev` normDev point-in-time. At |normDev| above 1.0 to 3.0, read the next 1/3/6/12 M5 bars in
> ATR with MAE, against an EMA deviation with the matched gain and shuffled placebos.

Construct: `js/macro.js` `compute5mKalmanDev` · noise: matched-gain EMA + shuffles · benchmark: `vwap-extension-fade`,
the spread/ATR gate; mirror continuation · prior: net null (vwap-extension-fade 3–8× under cost) · why run it: a live
alert input nobody has scored; Q/R are hand-set (gain ≈ 0.27, ~2-bar EMA; lesson #15) · **first** check
`MD files/BUG_LIST.md` #73 (Kalman loop shape still in code) · if null → drop T8 or show as context only.
Source: QG Kalman filter, Kalman mean reversion.

### Q5. Forgetting window vs expanding fit for the chosen σ — score 8/15

> For the chosen σ's coefficients, widths and log(IV÷σ) mean: expanding (live) vs rolling 2y/4y vs exponentially
> down-weighted (half-life 1y/2y), scored by QLIKE and pinball (p50/p75/p90 H-L), daily/weekly/monthly, by class and calm vs stressed years.

Noise: `forecast-pick`'s 1% tie rule, 21-session block bootstrap; mirror rolling on shuffled years · if yes → shadow
refit policy changes · prior small (feedback betas stable 2018–22) · stays off H-A · lesson #19. Source: QG non-stationarity.

### Q6. Which leg drifts, live against backtest — score 8/15

> For each bot or forward record with months of trades: rolling 50/100/200-trade P(win), E[R|win], E[R|loss] and
> regime weights, each against its backtest 90% block-bootstrap band; shuffled-date mirror for the false-alarm rate.

Diagnostic only; never moves a judge date. First use: a leg-by-leg reading of the Fib Atlas gap (bt 85.7% vs live 39.6%).
Trade pulls stay gitignored (public repo). Lesson #20. Source: QG law of total expectation.

### Q7. Is the rich-vol flag a premium or a forecast? — score 10/15

> Split ln(IV30/RV20) into premium ln(IV/RV_fwd) and catch-up ln(RV_fwd/RV20), by IV/RV20 tercile, at 1/5/21
> sessions; block bootstrap plus a placebo matched on RV20; benchmark the bottom/middle terciles and HAR's RV_fwd forecast.

Why: the rule (`js/paperRecordCore.js`, ≥1.182 FX/gold, ≥1.53 indices) is flagged by IV÷trailing RV but trades breaks,
i.e. it bets realised vol catches up, the opposite lean to "IV is overstated". It has never been measured which it
rides (lesson #4). Builds on BREAK_IVRV check 4 (orders terciles only) and `vrp-forecast` (unconditional; FAIL, see
housekeeping). If catch-up → it's a vol-forecast trade, judged as one; if neither → no mechanism behind the rule. Data on hand.
Source: QG VRP.

### Q8. Vendor IV vs our own inversion — score 7/15

> Daily for 10 days: IBKR model IV (and Cboe `iv`) minus our own Black-76 IV from the delayed mid, ATM and 25Δ,
> 1w/1m/3m; noise half-spread ÷ vega; benchmark same-day CME settlement IV.

Changes: whether Desk Terminal rr25/bf25 can be trusted; adds quote filters (lesson #17). Note: any new raw-ibapi
script must handle delayed tick types 80–83 (our ib_insync maps 13 and 83 already). Lesson #16. Source: QG live vol surface.

### Q9. Fama-MacBeth re-read of `fx-factor-stack` + the haircut check — score 8/15

> (a) Planted-correlation simulation: does `haircut_ci` (√(7/m_eff)=1.74 on a month-block bootstrap of the monthly IC)
> double-count cross-currency correlation? (b) Joint monthly slopes on carry and momentum at 1m (NW 0–4) and 3m (NW ≥ 2), plus the carry slope series' autocorrelation.

Reported only; the banked verdict is never re-scored (stays UNDERPOWERED: Sharpe bars fail either way). Without the
haircut carry's IC CI ≈ [+0.015, +0.143]. Changes: whether future cross-section preregs keep the haircut; whether
carry is separate from momentum. Lesson #9. Source: QG Fama-MacBeth.

## Parked

- **Q3. PCA loading stability as a condition on FX8 residual reversion** (6/15): base effect NULL/UNDERPOWERED; wait
  for the `residual-fx8-forward` verdict. Run the stability *diagnostic* (lesson #3) meanwhile.
- **Wing calibration**: are 10Δ/25Δ N(d2) probabilities calibrated per side at 30 days from settlements? ~70
  independent expiries per instrument: power-limited. Source: QG VRP.
- **IV level → short-VX P&L**: VXN 252-session percentile quintiles, 5/10/21 sessions, front-VX settlement change with
  roll, 2,000 month-matched random entries. Belongs beside `short-vx-rule` / vix-calculus B (UNDERPOWERED), not here. Source: QG vol dashboard.

## Housekeeping found by intake (2026-11-12): owner's call

1. **`vrp-forecast` FAIL is not banked in the Evidence Book.** It exists only as `analysis/output/rangebook/VRP_RESULTS.md`
   (commit 8f82e725), so `evidence_map "variance risk premium"` returns 0. Bank it.
2. **Possible double count in `scripts/fx-factor-stack/run.py` `haircut_ci`** (Q9a).
3. **Book Explorer default is in-sample Markowitz** (`diversification.html` `maxSharpeMarkowitz()`, `applyPreset('ms')` ~line 3474).
   Suggest default equal-risk and label Max Sharpe "in-sample, not a forecast" (lesson #21).
4. **`MD files/BUG_LIST.md` #73** (Kalman loop in `js/macro.js`): the described shape is still in the code; check before Q4.
5. **`analysis/residual_reversion_fx.mjs` KALMAN branch** has no result in `MD files/RESIDUAL_REVERSION_FX_TEST.md`.
6. **Quote filtering**: neither `refresh_options_skew.py` nor `parseCboeChain` filters zero bids or wide half-spread ÷ vega (lesson #17).
