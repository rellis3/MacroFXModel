# Layer 6: Black-Litterman and Sizing (literature spec)

Sources: published research and the trader's words; no repo files read. **No winner is declared on our data.** Tags: [V] confirmed by search this session (abstracts or summaries, no full text); [M] from memory. Lines marked "derived" are my algebra, not citations. Trader: "Stuff about Black Litterman will be an interesting read"; "the vol forecaster can drive so many things: position sizing, regime states."

## 1. Black-Litterman, fair hearing

μ_BL = [(τΣ)⁻¹ + P′Ω⁻¹P]⁻¹ [(τΣ)⁻¹π + P′Ω⁻¹q];  w = (δΣ)⁻¹μ_BL.

Kolm-Ritter 2017: BL is Bayesian regression [V], so a shrinkage device. **It generates no alpha; its value depends entirely on q and Ω.**

**Prior with no market portfolio**

| Prior | Form | Case for | Case against |
|---|---|---|---|
| Zero | π = 0 | Active framing (Da Silva et al. 2009 [V, citation; content M]); random walk is the hard FX benchmark (Meese-Rogoff [M]) | No information; everything rests on views |
| Equilibrium hedge | Black 1989 universal hedge; Black-Litterman 1991-92 included currencies [V] | The original setting | FX depends on hedge ratios (Satchell-Scowcroft) [V]. Implied daily premia ≈ 0, so collapses to zero (derived) |
| Reference-implied | π = δΣw_ref, w_ref = 1/N or ERC | Naive-allocation prior used in practice [V, practitioner note] | **Depends on quote convention:** in a long/short universe, "long EURUSD" is arbitrary (derived) |
| Carry | π_i = κ·(i_i - i_j) | Carry drives FX returns (Barroso-Santa-Clara 2015; Ranganathan et al. 2023) [V] | Tiny per day against vol (derived) |
| Hierarchical | Shrink to factor means | Bayesian alternatives (arXiv 1811.09309 [V]; Pastor 2000 [M]) | Heavier |

**Ω options**

- **He-Litterman:** ω/τ = view-portfolio variance [V]. A convention, not a measurement.
- **Idzorek:** Ω from stated 0-100% confidence [V].
- **Forecast error:** ω_{k,t} = Var̂(q_k - r_k) from out-of-sample errors. Bessler-Opfer-Wolff 2017 sample-based BL credits reliability weighting and lower turnover [V, summary]. Beach-Orlov 2007 use GARCH-derived views [V]. No source located specifying the exact construction; preregister it.
- **Regime:** ω_{k,t} = s²(state_t)·σ²_t, with error ratio s² estimated per state.

**Bridge to signal/σ (derived).** With π=0 and a single view, μ = q·τσ²/(τσ²+ω). Setting ω = τσ²(1/IC - 1) makes the shrink factor equal IC, so with q = σz this reproduces Grinold's α = σ·IC·z [V]. Then w ∝ IC·z/σ. So **BL differs from signal/σ only through (a) off-diagonal Σ and (b) a state-varying Ω.** That is what to test.

**Structural limit.** BL needs a *mean* view. A range forecast is a view on size, not sign. With no directional q, BL returns zero weight, and range-forecast error is not a valid Ω for a direction view (derived). Usable views: expected R per trade, from out-of-sample trade outcomes.

**Evidence.** For: BL beat 1/N, mean-variance, Bayes-Stein and minimum-variance out of sample on multi-asset indices 1993-2011, net of costs (Bessler et al. [V]). Beach-Orlov beat equilibrium and Markowitz [V]. Against: τ lacks firm theoretical basis [V]; both use author-built views; 1/N is hard to beat (DeMiguel et al. 2009 [V, secondary]). **No short-horizon or FX-book BL test located: gap.**

## 2. Entropy pooling

min_p Σ p_j ln(p_j/p⁰_j) subject to Fp ≤ f, Hp = h (Meucci 2008 [V]; constraint notation [M]). Handles non-normal markets, medians and fat tails; tail extension Meucci-Ardia-Keel [V].

Fair point for us: **a range forecast can be stated as a quantile or variance view, which BL cannot express.** Regime can reweight p⁰ [M]. Costs: needs scenarios; fragile as effective scenario count falls (Meucci 2012 [M]). No out-of-sample trading evidence located.

## 3. Sizing candidates

| Method | Form | Evidence |
|---|---|---|
| Signal/σ | w_i = c·s_i/σ_i | Grinold rule; IR ≈ TC·IC·√BR, √BR contested [V] |
| ERC | w_i(Σw)_i equal across i; budgets b_i | Maillard et al. 2010 [V, citation]; vol between min-var and 1/N [M]. Disputed: Chaves et al. 2011 [V, citation] |
| HRP | Cluster, quasi-diagonalise, recursive bisection | López de Prado 2016 [M]. Replications do not clearly beat naive risk parity; mostly theses and blogs [V, weak sources] |
| Fractional Kelly | f = c·μ/σ²; growth ∝ c(2-c)/2·SR² | Half Kelly: half the vol, 75% of growth (algebra). Can still lose most wealth (MacLean-Thorp-Ziemba) [V] |
| Shrunk Kelly | Shrink for parameter error | Baker-McHale 2013, simulation and tennis [V]. k = t²/(1+t²) (derived; compare their form) |
| Vol target | w_t = σ\*/σ̂_t | See below |
| Managed variance | f_t = (c/σ̂²) r_t | Moreira-Muir 2017 [V] |
| Conditional target | Scale only in extreme vol states | Bongaerts et al. 2020 [V] |
| Drawdown floor | x_t = k(W_t - αM_t), M = running max | Grossman-Zhou 1993 [V]; multi-asset Cvitanić-Karatzas 1995 [V] |
| Cost-aware | Aim ahead of target, trade partway | Gârleanu-Pedersen 2013 [V] |

### Vol targeting: both sides

**For.** Moreira-Muir: positive alphas across factors, currency carry included [V]. Harvey et al. 2018: 60+ assets, left tail and vol-of-vol reduced everywhere [V]. Bollerslev et al. 2018: utility gains, including currencies [V]. Scaling carries much of time-series momentum (Kim-Tse-Wald 2016) [V, secondary].

**Against.** Cederburg et al. 2020: 103 equity strategies, higher Sharpe in only 53, 8 significant; real-time versions usually lose to unmanaged, from unstable spanning regressions [V, partly secondary]. Liu-Tang-Zhou: look-ahead in c; corrected max drawdown 68-93% in almost all cases [V]. Bongaerts: conventional targeting inconsistent in global equities [V]. Costs erode managed factors; multifactor diversification offsets (DeMiguel-Martín-Utrera-Uppal) [V].

**For FX specifically.** Harvey: Sharpe gain *negligible* for currencies, tail reduction retained [V]. So this literature points to risk shape, not return, in FX. Vol proxies irrelevant in optimised FX overlays (Barroso et al. 2018) [V]. Direct out-of-sample test of vol-managed FX not located.

### Drawdown control: both sides

For: the floor holds by construction in continuous time. Against: gaps breach it in discrete time; growth optimality can fail (Klass-Nowicki [V, secondary]); with costs, expected return can turn negative at some drawdown [V, secondary]. Kaminski-Lo 2014: if returns are unforecastable, stops lower expected return with no benefit; they help only under momentum [V]. **So the case depends on P&L autocorrelation; measure that first.**

## 4. Testing in isolation

**Freeze the trade list and signal; vary only size.** Otherwise selection contaminates.

**Metrics.** Net Sharpe (robust test; Ledoit-Wolf 2008 [M]); certainty equivalent; max drawdown; 1% tail per unit vol; realised/target vol; turnover.

**Benchmarks.** Equal-risk per trade, inverse-vol, and 1/N. **Scale all to identical ex-post vol** before comparing; otherwise leverage is what gets compared.

**BL ablation ladder**, each step tested on the step before:
1. Signal/σ with diagonal Σ.
2. Add off-diagonal Σ, constant Ω.
3. Add forecast-error Ω.
4. Add regime Ω.

**Ω calibration.** Standardised errors (q-r)/√ω should have variance ≈ 1 per state. Reject before any P&L test.

**Vol sizing.** Tabulate E[R] and Var[R] by σ bucket; gains require risk to vary more than return. Compare with naive σ and shuffled-σ placebo.

**Drawdown.** Bootstrap trade order for the max-drawdown distribution, against constant leverage at equal vol. Report P&L autocorrelation.

**Inference.** Date-block bootstrap on paired daily P&L differences; deflate for variants; holdout.

## 5. Pitfalls

1. **Few concurrent trades.** BL, ERC and HRP bind only when two or more are open. Measure that share first; HRP trees on 2-4 trades are degenerate (derived).
2. **Double-counting σ.** A stop at k·σ with fixed-risk sizing already embeds 1/σ; vol targeting then scales twice (derived).
3. **Singular Σ:** crosses are linear combinations of majors; use the Layer 3 output in leg space.
4. **Quote-sign dependence** in long-only methods: define signed exposures first.
5. **Look-ahead in scale constants:** c, κ, IC, τ (Liu-Tang-Zhou lesson) [V].
6. **Inverse variance vs inverse vol:** do not pool the evidence.
7. **Fractional Kelly's cash-blend equivalence** is cleanest under lognormal returns [M]; stopped trades are not.
8. **Estimated μ dominates Kelly.** Overbetting costs more than underbetting [V, secondary].
9. **Equity transfer:** Harvey ties gains to the leverage effect in risk assets [V]; do not assume it in FX.
10. **Regime Ω overfit:** few trades per state; pool or shrink s².

## 6. Where evidence is mixed

- Vol management: strong in spanning regressions, weak in real-time equity tests, in FX mostly tail shape.
- BL vs 1/N: supportive papers use their own view models; no independent replication located.
- HRP: little peer-reviewed support found; check primary sources. ERC vs heuristics: disputed.
- Entropy pooling: expressive, little out-of-sample evidence.
