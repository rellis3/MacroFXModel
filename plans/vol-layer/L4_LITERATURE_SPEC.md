# Layer 4: Conditional Views. Literature Spec

From published research and the trader's words only; no repository files read. **No winner declared; nothing run on our data.**

Tags: [V] = checked by search this session, usually abstract or working-paper level. [V2] = secondary source only. [M] = from memory, check before relying on it.

## Why this layer
C.OG: "the way to really develop this is by having conditional views and then other layers supporting it." A view supplies a drift estimate μ to the level layers.

**Scale check (my arithmetic).** With barriers at ±d, P(up first) ≈ ½ + μd/(2σ²). A view worth annual Sharpe 0.5 has daily μ/σ ≈ 0.032, so at d = 1 daily σ it moves P by about 1.6pp. Most views are small against spreads when traded alone at this horizon.

## Candidates
| View | Signal | Sources |
|---|---|---|
| TSMOM | sign(r[t−h,t])·σ_target/σ_t, h = 1-12 months | Moskowitz-Ooi-Pedersen 2012 JFE [V] |
| FX carry | i* − i, rank or sign | Koijen et al. 2018 JFE [V]; Lustig et al. 2011 RFS [M] |
| Dollar carry | sign(mean(i* − i_US)) | Lustig et al. 2014 JFE [V2]; Daniel-Hodrick-Lu 2017 CFR [V] |
| Value | q = s + p* − p against a long-run anchor | Menkhoff et al. 2017 RFS [V]; Asness et al. 2013 JF [V] |
| Dollar factor | Mean of USD crosses | Verdelhan 2018 JF [V] |
| Rates | 2y spread level and change | Engel-West [M] |
| Positioning | z-score of CFTC net position, and its change | Klitgaard-Weir 2004 [V]; Brunnermeier et al. 2009 [V] |

## Evidence by asset class
**FX**
- Carry: negative skew from sudden unwinds; funding liquidity helps predict moves; past losses lower crash risk but raise its price (Brunnermeier [V]).
- Value: Sharpe about 0.5, information distinct from carry and momentum (Menkhoff 2017 [V]).
- Cross-sectional momentum differs from carry (Menkhoff 2012 JFE [V]); returns concentrated in hard-to-trade currencies [M].
- Dollar and carry factors explain 19-91% of developed bilateral variation, but contemporaneously; Verdelhan cautions this is not forecastability [V].
- Positioning: same-week knowledge gives about 75% direction accuracy; no use for the following week (Klitgaard-Weir [V]).

**Equity indices:** in MOP's sample (9 indices) [V]. Carry across assets loses in illiquid, high-vol periods; negative skew is specific to currency carry (Koijen [V]).

**Gold:** no gold-specific study retrieved. Indirect only, via MOP's 24 commodities [V].

## Accuracy by vol state
- **Daniel-Moskowitz 2016 JFE [V].** Momentum crashes are partly forecastable: panic states after declines with high vol, during rebounds. Bear-market up-beta −1.51 against down-beta −0.70 (working-paper figures). Cross-sectional equity momentum, so transfer to FX or daily TSMOM is an assumption. Dynamic weight w ∝ μ_t/σ²_t.
- **Menkhoff et al. 2012 JF [V].** High-carry currencies lose when global FX vol *unexpectedly* rises; the proxy prices over 90% of five carry portfolios. Returns track innovations more than expected vol. This is cross-sectional pricing, not accuracy by state, so it does not directly support a vol *level* filter.
- **Barroso-Santa-Clara 2015 JFE [V].** Managing momentum risk virtually eliminates crashes and nearly doubles Sharpe.
- **Moreira-Muir 2017 JF [V].** Inverse lagged variance scaling gives large alphas.

## Interaction models
1. Binned: hit rate and vol-normalised return by view sign × state quartile.
2. Linear: y = β₀ + β₁V + β₂S + β₃(V×S) + α_instrument + ε, clustered by date. β₃ is the target.
3. States, pre-declared: forecast σ against trailing median (level); RV − forecast (innovation); IV/RV; term slope. Test level and innovation separately.
4. Dynamic weight, μ_t/σ²_t.
5. Fundamental conditioning: carry given valuation (Jordà-Taylor [V]).

## Forecast combination
- **Equal weight** of standardised views. Estimated weights add bias and variance, so "optimal" need not win (Claeskens et al. 2016 IJF [V]).
- **Inverse-MSE** (Bates-Granger [M]); **shrinkage** toward equal, or complete subsets (Elliott et al. [M]).
- **State-dependent weights:** highest overfit risk; treat as a separate hypothesis.
- Evidence: combination beats the historical mean OOS by cutting forecast variance, in low-frequency equities (Rapach et al. 2010 RFS [V]); single predictors fail OOS (Welch-Goyal [V2]).

## Where evidence is mixed
- **TSMOM as predictability.** Little asset-by-asset evidence; pooled t-stat fails bootstrap critical values (Huang et al. 2020 JFE [V]). Much of the result is vol scaling (Kim-Tse-Wald 2016 JFM [V]). An informal reply disputes that this undermines the strategy [V2].
- **Vol management OOS.** Across 103 strategies, no systematic win despite positive spanning alphas; structural instability (Cederburg et al. 2020 JFE [V]). Costs offset gains on single factors (DeMiguel et al. [V2]). Alphas only when liquidity is high (Barroso-Detzel [V2]).
- **Value.** Menkhoff 2017 says yes. Barroso-Santa-Clara 2015 JFQA [V]: carry, momentum and reversal help; real exchange rate does not.
- **Carry skew.** FEER conditioning purges it and removes VIX correlation (Jordà-Taylor [V]). Time-varying autocorrelation; dollar-carry minimal skew, dollar-neutral highly skewed (Daniel-Hodrick-Lu [V]).

## Testing each view in isolation
**Unit:** instrument-day, signal frozen before London open.

**Targets:** vol-normalised open-to-close return; P(upper line first) against the zero-drift first-passage value, which links views to levels.

**Metrics:** skill over own base rate; IC; Brier skill; R²_OS = 1 − Σ(r−r̂)²/Σ(r−r̄)² (Campbell-Thompson [M]); β₃ with date-clustered CI.

**Benchmarks, all required:**
1. Own drift (always-long for indices and gold).
2. Unconditional view, for any state claim.
3. Placebo state: shuffle labels within year.
4. Mirror: flip the sign.
5. Signal lagged one week, to expose leakage.

**Family:** declare view × horizon × state in advance; FDR; final holdout. Report minimum detectable effect first; date block bootstrap; effective instruments per day, since USD pairs share a factor.

## Pitfalls
- **Horizon mismatch.** Nearly all evidence is monthly and portfolio-level; our target is daily, single-instrument, London hours. No retrieved paper shows a monthly view predicts a reaction at an intraday level.
- **Thin samples.** Ten years of a 12-month view holds about 10 non-overlapping observations per instrument.
- **Point-in-time.** CPI revisions and lag; CFTC dated Tuesday, released Friday [M].
- **Contemporaneous fit** presented as forecast (dollar factor, positioning).
- **Definitions.** Gold and index carry (basis, dividends) is not i* − i.
- **Crisis dominance.** Our 10 years may hold few crises.
- **Vol-scaling confound.** Test scaled and unscaled.
- **Costs.** Papers did not test daily rebalancing of slow views.

## Links
nber.org/papers/w20439 · openaccess.city.ac.uk/3391 · openaccess.city.ac.uk/id/eprint/14851 · nber.org/papers/w14473 · nber.org/papers/w20433
