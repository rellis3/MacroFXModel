# Layer 3: Correlation vs Variance (literature spec)

Sources: published research and the trader's words; no repo files read. **No winner is declared on our data.** Tags: [V] confirmed by search this session (abstracts or summaries, no full text); [M] from memory. Trader: "an example of a layer is an engineering feature such as splitting correlation from variance."

## 1. Candidates

| Candidate | Form | Note |
|---|---|---|
| CCC | Σ_t = D_t R D_t | Bollerslev 1990, on FX [V]. The split itself; D can come from the vol forecaster. Benchmark |
| EWMA | Σ_t = λΣ_{t-1} + (1-λ) r r′, λ=0.94 daily | RiskMetrics 1996 [V, secondary]. One parameter, no target |
| DCC | Q_t = (1-a-b)S + a ε_{t-1}ε′_{t-1} + bQ_{t-1}; R_t = diag(Q)^{-½} Q diag(Q)^{-½} | Engle 2002 [V, citation]. Composite likelihood for large N: Engle-Sheppard, Pakel et al. [M] |
| cDCC | Replace εε′ with Q\*^{½}εε′Q\*^{½}, Q\*=diag(Q) | Aielli 2013: DCC targeting can be inconsistent; bias shows at high persistence; forecasts at least as good [V] |
| Shrinkage | Ŝ = δF + (1-δ)S, F = constant correlation; DCC-NL shrinks the DCC target nonlinearly | Ledoit-Wolf 2004; Engle-Ledoit-Wolf 2019; OHLC: De Nard et al. 2022 [V]. Stock evidence |
| Dollar + carry | r_i = α_i + β_D DOL + β_C CAR + ε_i | Lustig-Roussanov-Verdelhan 2011: DOL is PC1 level, HML_FX explains the cross-section [V]. Verdelhan 2018: R² 19-91% in developed currencies [V] |
| Other factor sets | Dollar + euro; Dollar, Carry, Euro-Yen | Greenaway-McGrevy et al. 2018 [V]. An-Huber WP: 90% of intermediary risk; ~1% price move per $20bn / $10bn / $3.5bn [V, secondary] |
| Per-currency legs | r_{ij} = x_i - x_j, Σx_i = 0, so x_i = mean_j r_{ij} on a complete graph | Algebra. Numeraire-free "common". Hovanov et al. 2004 [M] |
| PCA | Rolling eigenvectors of R | Loadings unstable; sign flips |
| Realised covariance | RC_t = Σ r_k r_k′ at Δ; HAR-style | Chiriac-Voev 2011 [M]. Realised vol panels forecast better, FX included: Bollerslev et al. 2018 [V] |

Stress overlay: Forbes-Rigobon ρ\* = ρ/√(1+δ(1-ρ²)), δ = stress/calm variance ratio minus 1 (formula [M]).

## 2. Why split at all

- Pollet-Wilson 2010: average correlation predicts equity market returns; variance holding correlation fixed has a negative relation [V].
- Cenedese-Sarno-Tsiakas 2014: FX market variance ≈ average variance × average correlation (corr 0.19 between them). High average variance predicts carry losses; low average correlation predicts gains [V]. **Mixed:** a later citing paper finds average correlation insignificant for carry [V].
- Mueller-Stathopoulos-Vedolin 2017: FX correlation risk priced, not subsumed by FX vol risk [V].
- All are risk-premium results at monthly or longer horizons, not intraday.

## 3. Evidence by asset class

**Covariance forecasting.** FX: no evidence GARCH(1,1) is beaten on DM/$ (Hansen-Lunde 2005), though their test lacked power [V]. Equities: DCC with leverage hard to beat (Laurent et al.) [V]. No clean FX head-to-head of EWMA vs DCC found. **Gap.**

**Epps.** Correlation biases downward at short Δ, documented in FX and liquidity-linked: Muthuswamy et al. 2001 [V]. Hayashi-Yoshida fixes asynchrony only, not noise [V], and needs tick times, which 1-minute bars lack.

**Stress.** Equities: correlation up in bear not bull markets (Longin-Solnik 2001); downside asymmetry (Ang-Chen 2002) [V]. Counter: conditioning on high vol alone inflates correlation, and after adjustment Forbes-Rigobon find virtually no crisis rise [V]. FX: strong liquidity commonality (Mancini et al. 2013) [V]; crash-correlation evidence not located. **Mixed.**

## 4. The core question: common vs own-pair move afterwards

| Horizon | Asset | Finding | Direction |
|---|---|---|---|
| Month | Equities | Residual reversal about twice conventional (Blitz et al. 2013) [V]; within-industry residual the only significant piece (Da-Liu-Schaumburg 2014 WP) [V]; non-news returns reverse faster [V] | Own reverses |
| Month | Equities | Industry returns continue (Moskowitz-Grinblatt 1999) [V] | Common continues |
| Month | Equities | Industry reversal pays when VIX is high (Nagel 2012) [V] | Common reverses under stress |
| Month | FX | Dollar and carry autocorrelated; idiosyncratic returns "contain little momentum"; factor vol drives out the autocorrelation (Zhang 2022) [V, secondary] | Common continues; own flat, **not shown to reverse** |
| Month | FX | Momentum stronger in high idiosyncratic-vol currencies; reverses over longer horizons (Menkhoff et al. 2012) [V]. No significant momentum or reversal in a long history (Chen WP) [V] | Mixed |
| Year+ | FX | Factor forecasts beat no-change at 8-12 quarters, only 1999-2007 (Engel-Mark-West) [V] | Unstable |
| Daily | FX | Reversal stronger on abnormally low volume; 31 pairs, CLS data (Cespa et al. 2022) [V] | Pair-level, liquidity-linked |
| Hours | FX | Dollar rises pre-fix and falls post-fix, W-shape; dealer hedging (Krohn et al. 2024) [V] | **Common reverses** |
| 1 min-2 wks | FX | Order-flow link weaker at long horizons, stronger in low liquidity (Berger et al. 2008) [V] | Transient impact |
| Days | Equities | PCA residual OU: Sharpe 1.44 net 1997-2007, stressed in 2007 unwind (Avellaneda-Lee) [V] | Own reverses; crowding risk |

Dollar-neutral carry is skewed and risk-loaded, dollar carry is not (Daniel-Hodrick-Lu 2017) [V].

**Gap:** targeted searches found no published test of short-horizon FX residual reversal after removing dollar and carry, and no PCA-residual FX study with costs. A limited search, not proof of absence. The equity analogy is unproven in FX.

Competing hypotheses (all live):
- **H1:** common = news, continues; own = liquidity, reverses. Support: Da, Zhang, Berger; Andersen et al. 2003 [M].
- **H2:** common flow reverses, especially at fixes and in stress. Support: Krohn, Nagel.
- **H3:** vol is the driver; the split adds little once σ is conditioned on (Zhang). The null to beat.

## 5. Testing in isolation

**T1 Correlation only.** Freeze D across all models so only R differs. Metric: multivariate QLIKE/Stein on a realised proxy (Patton-Sheppard; Patton 2011 [V]), plus realised vol of the minimum-variance portfolio (Engle-Colacito [V, secondary]). Model confidence set. Benchmark: CCC with rolling R.

**T2 Decomposition stability.** Out-of-sample R² and β drift per "common" definition. Benchmark: leave-own-out USD basket.

**T3 Common vs own.** Regress r_{t→t+h} on common_t and own_t, both scaled by forecast σ: r_{t+h}/σ = a + b_c·C_t + b_o·O_t + c·σ-state + e. Sweep h and formation window. **Primary statistic: Wald test of b_c = b_o**; the restricted model (total move only) is the benchmark. Report outcome distributions, not just means. Also at line touches: split the from-open move into common and own; compare with same-size total moves.
Split by: release days; fix windows; session; activity; σ-stress. Controls: skip one bar; shuffled-factor placebo. Inference: date-block bootstrap, FDR, holdout. Judge net of cost including extra legs.

**T4 Stress.** Ratio of realised to predicted cluster vol in high-σ states; VaR exceedances (Kupiec/Christoffersen [M]). Report conditioning bias (Ang-Chen H [V]).

## 6. Pitfalls

1. **Crosses are near-exact linear combinations.** EURGBP ≈ EURUSD - GBPUSD, so the pair covariance is rank-deficient up to noise. Inverses on 34 raw instruments blow up. Estimate in currency-leg space. (Algebra.)
2. **Mechanical residual reversal.** Quote bounce is own-pair noise the factor averages away, so residuals mean-revert by construction. (Reasoned; unsourced.)
3. **Lead-lag masquerading as reversal.** A stale pair's residual "reverts" when it catches up. Skip bars; vary Δ.
4. **Own-pair in its own factor.** Use leave-own-out baskets or the common leg contains the target.
5. **Errors in β** leak factor momentum into the residual.
6. **Numeraire.** A EUR move looks "own" in a dollar decomposition; test currency legs.
7. **Pseudo-replication.** One dollar move creates many correlated events. Cluster by date, not by pair.
8. **Mixed hours.** Index hours and gold differ from 24h FX; non-FX blocks do not fit the leg algebra.
10. **Vol contamination.** Condition on σ first (H3).
11. **Conditioning bias** if stress is selected on realised vol or returns (Boyer et al. 1999 [V, cited only]).
12. **Few concurrent trades:** correlation bites only when positions overlap. Measure that share first.

## 7. Where evidence is mixed

- Stress correlation beyond the vol effect; average correlation as an FX predictor.
- FX idiosyncratic reversal: equities yes, FX monthly "little momentum", intraday not located.
- Common FX moves: continue (Zhang, monthly) or reverse (Krohn, fixes). Possibly both, by horizon.
- Factor count (two or three); DCC vs simpler in FX.
