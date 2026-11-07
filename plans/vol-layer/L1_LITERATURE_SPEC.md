# Layer 1: Shared Volatility State. Literature-based research spec

Sources: published research only; no repository files were read. **[V]** = verified by web search this session (record and abstract claims; full texts not read). **[M]** = cited from memory; check before relying on it.

Notation: r_t = session log return; RV_t = session realised variance from intraday returns; h_t = conditional variance forecast. Each field is indexed by when it becomes known.

---

## 1. Current conditional volatility (daily and intraday)

**Candidates**
1. **EWMA / RiskMetrics.** h_t = λh_{t−1} + (1−λ)r²_{t−1}, λ≈0.94 [M: RiskMetrics 1996]; a range-based version swaps in Rogers-Satchell or Parkinson for r². Needs daily OHLC. No mean reversion, so multi-step forecasts are flat.
2. **GARCH(1,1).** h_t = ω + αε²_{t−1} + βh_{t−1}. Hansen & Lunde (2005), 330 ARCH-type models: **no evidence GARCH(1,1) is beaten for DM/USD**; leverage models won for IBM [V]. Andersen & Bollerslev (1998): GARCH only looks poor when scored against noisy squared returns; against intraday RV it forecasts well [V]. Brownlees, Engle & Kelly (2011/12), equity indices and FX 1990–2008: 1-day GARCH-type forecasts tracked 2008 well [V]. GJR/EGARCH asymmetry is a fair candidate for NQ and DAX; it is usually weak in FX [M].
3. **HAR-RV** (Corsi 2009) [V]. RV_{t+1} = β0 + βd·RV_t + βw·RV_t^{(5)} + βm·RV_t^{(22)} + e. Usually fitted in logs. Needs daily RV from 1-minute bars. Pong et al. (2004), GBP/DEM/JPY vs USD: at 1 day to 1 week, intraday-based forecasts beat implied vol and GARCH, and **the gain came from the high-frequency data, not the long-memory specification** [V]. Bollerslev, Hood, Huss & Pedersen (2018), 50+ commodities, currencies, indices and bonds: RV dynamics are similar across classes, and **panel-estimated HAR-type models** beat existing models out of sample [V]. Directly relevant to ~40 FX pairs.
4. **HARQ** (Bollerslev, Patton & Quaedvlieg 2016) [V]. βd becomes βd + βQ·√RQ_t (RQ = realised quarticity), so noisily measured RV is down-weighted. Evidence is on S&P 500 and DJIA stocks, not FX.
5. **Realized GARCH** (Hansen, Huang & Shek 2012) [V]. GARCH driven by a realised measure, with measurement equation x_t = ξ + φh_t + τ(z_t) + u_t. Beats GARCH on DJIA stocks and an ETF [V]; FX evidence not verified.
6. **Intraday / session level: multiplicative component model** (Engle & Sokalska 2012) [V]. σ²_{t,i} = h_t·s_i·q_{t,i} (daily × diurnal × intraday unit GARCH). Andersen & Bollerslev (1997, 1998): FX intraday periodicity must be filtered out before intraday dynamics can be estimated [V].

**Ex-post proxy (the target for fields 1, 2 and 5).** Liu, Patton & Sheppard (2015), ~400 estimators, 31 assets, 5 classes: **hard to significantly beat 5-minute RV**; truncated low-frequency RV did well for forecasting [V]. Realised range (Martens & van Dijk 2007) is more efficient than RV under bid-ask bounce [V]. Bipower variation is jump-robust (Barndorff-Nielsen & Shephard 2004) [V]. Noise-robust options: two-scale RV [M: Zhang, Mykland & Aït-Sahalia 2005], realised kernels [M: Barndorff-Nielsen et al. 2008].

**Pitfalls.** 1-minute bounce and stale quotes bias RV up: use 5-minute or subsampled RV. Keep Sunday gaps and thin Asia bars as a separate overnight term. Scale or drop holidays and half-days. Futures have breaks and roll gaps. Store RV and BV separately so news-day jumps are visible.

**Mixed evidence.** In FX, GARCH(1,1) holds up against complex GARCH variants. RV models win mainly through better input data, not complexity. The gain of HARQ or Realized GARCH over log-HAR is small and mostly shown on equities.

## 2. Expected change in volatility (next 1–5 sessions)

Δ_h = log E_t[σ²_{t+1..t+h}] − log σ²_t, h = 1…5.

**Candidates**
1. **GARCH mean reversion (implied by the model).** E_t[h_{t+k}] = σ̄² + (α+β)^{k−1}(h_{t+1} − σ̄²). Δ is then a deterministic function of the gap to σ̄²: no information beyond fields 1 and 3.
2. **Direct HAR at horizon h.** Regress mean RV over t+1..t+h on the HAR regressors; the βd/βw/βm pattern encodes the expected decay.
3. **Component GARCH** (Engle & Lee 1999) [V, secondary sources]. Transitory component (persistence α+β) around a slow permanent level q_t; the expected change is driven by h_t − q_t.
4. **Scheduled-event augmentation.** HAR or GARCH plus calendar dummies for known releases inside the horizon (NFP, CPI, central-bank decisions). Andersen, Bollerslev, Diebold & Vega (2003): announcement surprises cause conditional-mean jumps in FX, bad news more than good [V]. The date is known in advance; the surprise is not.
5. **IV term slope** (1-week minus 1-month IV; see field 6).
6. **Regime-switching GARCH multi-step.** Marcucci (2005), on US equities: MS-GARCH is best below about 1 week, and asymmetric single-regime GARCH is better beyond that [V].

**Tests.** QLIKE (defined in Section 5) per horizon h; hit rate of sign(Δ̂) against realised sign, versus a no-change forecast.

**Pitfalls.** Overlapping h-day targets make errors MA(h−1): use HAC or bootstrap errors. After a spike, "vol will fall" is nearly always right, so score skill beyond pure mean reversion, not the raw hit rate.

## 3. Volatility relative to its long-run level

z_t = log σ_t − log σ̄_t; the choice of σ̄ is the whole field.

**Candidates**
1. **Trailing window.** σ̄ is the 1-year (or 3-year) median of RV. Simple and causal; lags structural shifts.
2. **GARCH unconditional variance.** σ̄² = ω/(1−α−β) on a rolling window; unstable when α+β≈1, common in FX.
3. **Component GARCH permanent level q_t** (Engle & Lee) [V, secondary]. Time-varying, estimated jointly with h_t.
4. **GARCH-MIDAS / Spline-GARCH.** The long-run τ_t is a MIDAS polynomial in monthly RV or in macro variables (Engle, Ghysels & Sohn 2013) [V]. Fundamentals help mainly at long horizons, with some short-horizon effect; evidence is on US equities.
5. **Percentile rank** of σ_t within the trailing window. Distribution-free; comparable across instruments.

**Pitfalls.** The long run shifts (EUR/CHF before and after 2015). A full-sample mean leaks the future. Near-collinear with field 2.

**Mixed evidence.** No strong out-of-sample case found that MIDAS-type components beat a trailing window at 1–5 days in FX. Expect a tie.

## 4. Probability of being in each volatility regime (filtered, real time)

**Candidates**
1. **Threshold / quantile buckets.** Percentile of z_t or of the HAR forecast against causal trailing quantiles; hard label, or soft via a logistic on distance to thresholds. Baseline.
2. **Two-state Markov-switching model on log RV** (Hamilton 1989 [M]). Use only the **Hamilton-filtered** P(S_t=k|F_t) or the predicted P(S_{t+1}=k|F_t). Smoothed probabilities use future data and inflate backtests [V, secondary: Guidolin 2012 review, lecture notes]. **Parameters must also be estimated on expanding or rolling windows**: full-sample parameters are lookahead even with the filter.
3. **MS-GARCH** (Haas, Mittnik & Paolella 2004 [M]; Gray 1996 [M]). Ardia, Bluteau, Boudt & Catania (2018): MS-GARCH gives better VaR and left-tail forecasts, **especially for equities**; parameter uncertainty helped independently of switching [V]. Marcucci (2005): better only below ~1 week [V].
4. **Regime-dependent HAR**, or an HMM on (log RV, |r|, range).

**Tests.** Brier score [M: Brier 1950] with Murphy reliability/resolution decomposition [V, existence only], reliability diagram, and log score [M: Gneiting & Raftery 2007]. Label ex post, e.g. next-session RV above the trailing 80th percentile. Usefulness: does P(high) improve field-1 QLIKE (MCS)?

**Pitfalls.** Label switching on re-estimation (order states by mean vol). In-sample persistence is overstated. Two-state FX models often reduce to "spike vs normal", the same information as buckets.

**Mixed evidence.** Switching gains are clearest for equity tails, less established for FX. Buckets may tie an HMM while being far more transparent.

## 5. Forecast error (the feedback signal)

Define the standardised error u_t = log(RV_t / ĥ_t) and the QLIKE loss L_t = RV_t/ĥ_t − log(RV_t/ĥ_t) − 1. These are computed only after the session closes.

**Candidates**
1. **Raw error EWMA.** ū_t = EWMA(u) is a running bias; persistent ū > 0 means under-forecasting (regime shift or model breakdown).
2. **Mincer-Zarnowitz recursion** [M: Mincer & Zarnowitz 1969]. Rolling RV = a + b·ĥ + e; departures from (0, 1) give a real-time recalibration, directly actionable for sizing.
3. **HARQ-style measurement-error weighting** [V]. √RQ separates proxy noise from true error in u_t; down-weight feedback on noisy days.
4. **Volatility of volatility.** Corsi, Mittnik, Pigorsch & Pigorsch (2008) HAR residuals are non-Gaussian and clustered; HAR-GARCH improves fit and density forecasts on S&P futures [V]. Var(u) is a natural forecast-uncertainty state for widening bands and cutting size.
5. **Rolling coverage of the range quantiles.** Christoffersen (1998) conditional-coverage LR test (χ²(2)) on range-quantile breaches [V].

**Proxy choice.** Patton (2011): of nine common losses, only MSE and QLIKE rank forecasts consistently against noisy proxies (squared return, range, RV) [V]. QLIKE depends only on the standardised error, so it is comparable across instruments.

**Pitfalls.** Feedback can chase noise: smooth u with a pre-registered length. News-day jumps are not model failure; tag them via calendar and RV−BV. Never refit on u inside the evaluation window.

## 6. (Optional) Implied versus realised volatility

**Candidates.** (a) IV/σ̂ ratio or log spread. (b) HAR-RV augmented with IV, written HAR-RV-IV. (c) IV term slope. (d) Variance risk premium, IV² − E[RV] [M: Bekaert & Hoerova 2014].

**Evidence.** Busch, Christensen & Nielsen (2011), FX/stocks/bonds: IV adds information beyond HAR components and predicts jumps; working paper reports IV unbiased for FX and stocks [V]. Pong et al. (2004): intraday beats IV at 1 day–1 week, IV matches or wins at 1–3 months [V]. Gold: GVZ improves next-day RV for Shanghai gold futures (Luo, Qin & Ye 2016) [V, secondary]; no COMEX head-to-head found.

**Pitfalls.** IV snapshot timing, day-count and annualisation. IV is risk-neutral and carries the variance premium, so the ratio averages above 1.

---

## Evaluation toolkit (common to all fields)

- **Loss.** QLIKE primary, MSE on variance secondary (Patton 2011 [V]); never MAE or MSE on σ.
- **Pairwise comparison.** Diebold-Mariano with HAC errors [M: Diebold & Mariano 1995]. Giacomini-White (2006) for rolling re-estimation and nested models; its null under fixed windows is disputed (Zhu & Timmermann 2020) [V].
- **Many models.** Model Confidence Set (Hansen, Lunde & Nason 2011) [V]; SPA against a fixed benchmark (Reality Check has low power, Hansen & Lunde 2005 [V]).
- **Calibration.** Mincer-Zarnowitz (levels); Christoffersen (1998) [V] and Kupiec (1995) [M] (bands); Brier/log score (regimes).
- **Economic value.** Utility-based or volatility-targeted P&L (Bollerslev et al. 2018 [V]). Moreira & Muir (2017): vol-timing raised Sharpe ratios, carry included [V]; Harvey et al. (2018, JPM) reportedly find **negligible Sharpe effect for currencies and commodities** [V, secondary]. FX sizing gains are an open question.
- **Cross-section.** Pool losses and report per asset class.

## How the five fields fit together without double-counting

All fields share one information set and one core forecast ĥ (field 1). Under mean reversion, fields 2 and 3 are transforms of ĥ: treat them as **one degree of freedom** unless a non-ĥ input (calendar, IV term structure, macro) adds content. Field 4 is a **filtered** probability on the same RV; do not use z_t and P(high) together downstream without testing the increment. Field 5 is the only realised feedback and enters strictly lagged. Field 6 is the only external source. Recommended state vector: {log ĥ_t (daily, session); Δ_h residual after mean reversion; z_t; P_filt(high); ū_t and σ(u)_t; IV/ĥ}. Publish their correlation matrix before downstream use.

## Ranked test order (each one isolated)

1. **Proxy choice.** 5-min RV vs subsampled 1-min RV vs realised range vs RS. Metric: QLIKE ranking stability of a fixed log-HAR across proxies, plus proxy noise (RQ). Benchmark: 5-min RV.
2. **Field 1 core.** EWMA vs GARCH(1,1) vs log-HAR vs panel log-HAR vs HARQ at 1-session horizon. Metric: QLIKE, MCS at 90%, and MZ regression. Benchmark: GARCH(1,1).
3. **Field 5 calibration.** Coverage of the existing range quantiles. Metric: Christoffersen conditional coverage per instrument. Benchmark: nominal coverage. Then ask whether lagged ū_t improves next-day QLIKE (DM test against no correction).
4. **Field 2.** Direct HAR at h = 1..5 with and without calendar-event dummies. Metric: QLIKE per h and directional skill beyond GARCH-implied mean reversion. Benchmark: GARCH term structure.
5. **Field 4.** Filtered 2-state MS on log RV vs percentile buckets. Metric: Brier score and reliability for next-session "high" label, plus incremental QLIKE gain. Benchmark: bucket rule.
6. **Field 3.** Trailing median vs component-GARCH q_t vs MIDAS τ_t. Metric: incremental QLIKE at h = 5 when z_t is added to the HAR. Benchmark: trailing 1-year median.
7. **Field 6** (IV instruments only). HAR vs HAR-IV. Metric: QLIKE DM and MZ. Benchmark: HAR.

Pre-register splits, keep a holdout, and control multiplicity (~45 instruments × 7 tests: MCS/SPA or FDR).
