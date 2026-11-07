// Vol-Layer System — the research plan behind vol-layer-system.html.
//
// Source: C.OG in Market Movers, 2026-09-28 (education/cog_inbox/2026-09-28-market-movers-vol-forecaster-as-a-layer.md).
// "Something like 6 layers with the forecaster itself only being one of those layers." "Every single position is
// different and this is an entire system built on top of the forecaster itself."
//
// RULES FOR THIS FILE
//  - It is a research plan, not a verdict list. No layer is ruled in or out here. Every candidate, including the
//    literature's "usually loses" ones, stays OPEN until our own pre-registered test on our data decides it.
//  - Past repo verdicts were deliberately NOT used to write it (owner's request, 2026-11-06). A deep dive may read
//    them only AFTER writing its own spec, and must say where it then disagrees.
//  - A deep dive updates its own layer: status, findings[], and candidate.state. Nothing else.
//
// state words for candidates: 'open' (not looked at) · 'researching' · 'specified' (prereg written) · 'tested'
// status words for layers: 'not started' · 'deep dive' · 'specified' · 'testing' · 'done'

export const SOURCE_NOTE = 'C.OG, Market Movers, 28 Sep 2026: "the vol forecaster can drive so many things: position sizing, regime states, but you can also use its errors as a feedback loop."';

export const LAYERS = [
  {
    id: 'state', n: 1, short: 'Vol state', title: 'Vol forecast as a shared state variable',
    status: 'testing',
    cog: [
      'If you make volatility a shared states variable where you have current conditional volatility, expected change in volatility, volatility relative to its longrun level, probability of being in different volatility regimes, forecast error.',
      'So having the forecaster is very useful as a layer.',
    ],
    question: 'Can the existing forecaster (≈40 pairs) publish one point-in-time state object per instrument per session that every other layer reads, and is each field a better forecast than a naive benchmark?',
    fields: [
      { k: 'σ now', d: 'current conditional volatility' },
      { k: 'Δσ expected', d: 'expected change in volatility over the next days' },
      { k: 'σ vs long-run', d: 'volatility relative to its long-run level' },
      { k: 'P(regime)', d: 'probability of each volatility regime, filtered (no future data)' },
      { k: 'forecast error', d: 'how wrong the forecaster has recently been, signed' },
    ],
    candidates: [
      { name: 'σ: the chosen forecast (persistence + IV)', src: 'repo', state: 'tested', note: 'the lines; won forecast-pick on range accuracy, and is the benchmark' },
      { name: 'σ: chosen form + M1 realised-vol terms', src: 'both', state: 'tested', note: 'VALIDATED: about 1.2% better on all 34' },
      { name: 'σ: log-HARQ on 5-min M1 realised variance', src: 'literature', state: 'open', note: 'Bollerslev-Patton-Quaedvlieg 2016; down-weights noisy days' },
      { name: 'σ: realized GARCH', src: 'literature', state: 'open', note: 'Hansen-Huang-Shek 2012; needs MLE' },
      { name: 'σ: time-of-day profile to turn daily σ into session σ', src: 'literature', state: 'open', note: 'Andersen-Bollerslev 1997' },
      { name: 'Δσ: HAR iterated forward', src: 'literature', state: 'open', note: 'model-based, replaces a percentile proxy' },
      { name: 'Δσ: implied-vol term-structure slope', src: 'repo', state: 'open', note: 'js/ivMetrics.js; only where IV exists' },
      { name: 'σ vs long-run: model long-run level vs 252-day median', src: 'both', state: 'open', note: '' },
      { name: 'P(regime): HMM on log RV', src: 'literature', state: 'open', note: '' },
      { name: 'P(regime): switching model on forecast residuals', src: 'literature', state: 'open', note: 'measures model failure, not vol level' },
      { name: 'P(regime): change-point (BOCPD) break probability', src: 'repo', state: 'open', note: 'RegimeV2/bocpd.py exists on another stream' },
      { name: 'forecast error: EWMA of log(realised / forecast)', src: 'C.OG', state: 'open', note: '' },
      { name: 'forecast error: score-driven (GAS) correction', src: 'literature', state: 'open', note: 'Creal-Koopman-Lucas' },
      { name: 'IV vs RV: log(IV / σ forecast), same horizon', src: 'repo', state: 'open', note: 'js/forecastLadderIvAdj.js uses this form' },
    ],
    repo: [
      'js/volStateVector.js + js/volStateRoutes.js (GET /api/vol-state): the object already exists, descriptive only',
      'js/volForecastScheduler.js: the instruments the forecaster runs on',
      'forge/vol.py: HAR, Yang-Zhang, EWMA, quantiles, pinball loss, walk-forward',
      'volatilityExhaustion/jump_detect_lm.py: realised variance, semivariance, quarticity from M1',
      'hmm.js, js/hmmHourly.js, RegimeV2/bocpd.py',
      'Theory Lab: garch-volatility, institutional-har-rv, hidden-markov-models, regime-switching-state-space, change-point-detection, variance-risk-premium',
    ],
    test: 'Each field alone. σ: QLIKE loss vs a session realised-variance proxy, Diebold-Mariano + Model Confidence Set vs the incumbent. Δσ: slope and R² of realised change on predicted change. P(regime): Brier score of next-session state; does it lower QLIKE when added. Forecast error: coverage of the bands with and without it.',
    defects: [
      'RULE (checked 2026-11-06, not a live bug): hmm.js labels live regimes from the filtered probability (since 2026-10-16) and the vol state uses js/hmmHourly.js filtered readings. In a backtest, never reuse the historical Viterbi path or parameters fitted on the whole sample.',
      'Open question for this layer, not a bug: VolRangeForecaster uses fixed GARCH parameters, not fitted per instrument. It is the incumbent the candidates are scored against.',
    ],
    findings: [
      { date: '2026-11-07', title: 'Tested: does the vol state predict reaction at the lines? CONTEXT', text: '70,965 touches of the chosen lines, walk-forward 2021-2026. Expected change, filtered regime and forecast-error state add nothing beyond the 31 old features: 1.0000 [0.9995, 1.0004], Holm p 0.47. So the state describes the day but does not say whether a touch rejects or breaks. Keep it for sizing and stops, which this did not judge.' },
      { date: '2026-11-07', title: 'Forecast check, your question: keep the chosen forecast', text: 'The chosen forecast (persistence + IV) already beat plain, IV-adjusted, HAR-800 and persistence head to head (forecast-pick), so it stays as the lines and no forecaster is rebuilt as the base. That test scored range accuracy only. It did not ask whether price reacts at a line, and that is the question this programme now tests (vol-layer-reaction).' },
      { date: '2026-11-07', title: 'Tested: does M1 realised vol add? VALIDATED, small', text: 'Added yesterday and last-week 5-minute realised vol to the chosen form. All 34 instruments: pinball 0.9884 [0.9856, 0.9910] of the chosen form, all six folds better, regime miss 1.6 vs 2.4 pp. IV-13: 0.9901 [0.9869, 0.9931]. Biggest on indices (2.4%), about 1% on FX and gold. Nothing live changes. This reopens the fitted-GARCH / HARQ / panel HAR comparison, queued after the reaction test.' },
      { date: '2026-11-07', title: 'Bias check, read for the first time', text: 'LINE-REACTION: P(reject) about 0.485 at every rung and no different from ±0.3σ away; 31 lead-up features added nothing. exhaustion-schedule: distance from the open adds almost nothing beyond the clock. line-touch-wide-scan: a gross fade edge that fails net of costs. None of these held expected change, filtered regime on realised vol, forecast error state, unscheduled jump intensity, realised vol so far, or common vs own move, so those are what vol-layer-reaction adds.' },
      { date: '2026-11-07', title: 'Repo pass (code only) + first build', text: 'Map: plans/vol-layer/L1_REPO_PASS.md. The chosen σ (vol-forecast-v3 "persistence + IV") is a daily-bar estimator per instrument (Yang-Zhang 10/20 or EWMA 0.94/0.90 on NY-close bars) nudged for regime, recent misses, weekday and implied vol. Nothing in the repo built a 5-min realised-variance target from M1 for London sessions without forward-filling, and there was no Python NY-close builder, so forge/rv.py now does both, point-in-time with the lockbox cut, proven by 9 tests including prefix invariance. Still to build: fitted GARCH(1,1), HAR / HARQ / panel HAR on RV5, Model Confidence Set. Risks found: the estimator was picked on London bars but runs on NY bars; several HAR helpers use full-sample scales.' },
      { date: '2026-11-06', title: 'Literature pass (no repo access)', text: 'Spec: plans/vol-layer/L1_LITERATURE_SPEC.md. Main points: GARCH(1,1) is a hard benchmark in FX (Hansen-Lunde 2005); intraday-data gains come from better inputs more than model complexity; 5-min RV is the target to beat as the realised measure; QLIKE + Diebold-Mariano + Model Confidence Set to compare. Δσ and σ-vs-long-run are mostly transforms of the σ forecast (one degree of freedom, not two). Thin evidence: HARQ / realized GARCH mostly equity-tested, regime-switching gains for FX not established, nothing head-to-head for gold. Proposed test order: realised target, σ shootout, coverage + error feedback, Δσ, regime, long-run level, IV.' },
      { date: '2026-11-06', title: 'Step 0 check', text: 'The review claim that hmm.js leaks future data into live state was overstated. The live label is filtered and causal. The risk is only in backtests that reuse the Viterbi path, so it is recorded as a rule above.' },
    ],
  },
  {
    id: 'jumps', n: 2, short: 'Jumps', title: 'Jump intensity and jump diffusion',
    status: 'testing',
    cog: [
      'And research a lot into jump intensity and jump diffusion.',
      '(Merton) That\'s part of it. Then it\'s a jump added on top.',
    ],
    question: 'Can we split vol into a smooth (diffusion) part and a jump part, and does knowing jump risk tell us when a σ-based stop will be blown through, beyond what σ and the news calendar already tell us?',
    fields: [
      { k: 'continuous σ', d: 'vol with the jumps removed' },
      { k: 'jump share', d: 'fraction of recent variance that came from jumps' },
      { k: 'λ scheduled', d: 'jump risk from known news releases and weekend gaps' },
      { k: 'λ unscheduled', d: 'rate of surprise jumps' },
      { k: 'stop-through tail', d: 'how far past a stop price goes when it is hit' },
    ],
    candidates: [
      { name: 'Bipower variation (RV − BV)', src: 'repo', state: 'open', note: 'js/jumpDiffusionCore.js' },
      { name: 'MedRV / threshold bipower', src: 'literature', state: 'open', note: 'Andersen-Dobrev-Schaumburg; Corsi-Pirino-Renò' },
      { name: 'BNS day-level jump test', src: 'repo', state: 'open', note: '' },
      { name: 'Lee-Mykland intraday jump test + false-discovery control', src: 'both', state: 'open', note: 'gives time, sign and size of each jump' },
      { name: 'Scheduled (calendar) vs unscheduled jump split', src: 'literature', state: 'open', note: 'Lahaye-Laurent-Neely 2011' },
      { name: 'Hawkes self-exciting jump intensity', src: 'literature', state: 'open', note: 'Aït-Sahalia et al. 2015' },
      { name: 'EWMA count of unscheduled jumps', src: 'literature', state: 'open', note: '' },
      { name: 'HAR-CJ: jumps as a separate forecast input', src: 'both', state: 'open', note: 'Andersen-Bollerslev-Diebold 2007' },
      { name: 'Merton parameters (λ, μJ, σJ) as a model', src: 'C.OG', state: 'open', note: 'estimate, or use as moment summaries' },
      { name: 'Peaks-over-threshold tail on stop-through loss', src: 'repo', state: 'open', note: 'js/evtTail.js' },
    ],
    repo: [
      'js/jumpDiffusionCore.js, jump-diffusion.html',
      'volatilityExhaustion/jump_detect_lm.py, volatilityExhaustion/har_cj_forecast.py',
      'scripts/forecast_history/jumps.py, scripts/forecast_history/jump_flags_seasonal.py',
      'js/evtTail.js, volatilityExhaustion/evt_envelope.py',
      'Theory Lab: merton-jump-diffusion, institutional-bipower-variation, institutional-jump-detection-tests, institutional-bates-model, extreme-value-theory',
      'education/forecaster-portfolio-case-study/LESSON_03_a-system-built-in-layers.md',
    ],
    test: 'Target: next-session stop-through, P(price moves more than d·σ against a position, d = 0.25/0.5/1), and the loss past the stop in σ. Benchmarks: (a) σ alone, (b) σ + calendar + Monday gap flag. A jump variable earns its place only by beating (b). Brier / log-loss skill, date-block bootstrap.',
    defects: [
      'RULE for the new detector: scripts/forecast_history/jump_flags_seasonal.py forward-fills stale 5-min prices into zero returns. Zeros pull bipower variation down, so its BNS test over-flags jump days. Drop stale returns instead.',
      'RULE: its time-of-day factor sets zero-median slots to "no test", but slots with a tiny positive median can still over-flag. Floor the factor.',
      'That script is a pre-registered study (forge/JUMPS_PREREG.md) and is left unchanged so its numbers reproduce; the jump layer builds its own detector.',
    ],
    findings: [
      { date: '2026-11-07', title: 'Tested: jump intensity and reaction. No added power, one lead', text: 'Jump share and intensity add nothing overall: 0.9999 [0.9995, 1.0002], Holm p 0.39. One candidate for its own prereg, not a result: at p75, instruments with more recent scheduled jumps reject less, 46.4% vs 50.9% (q 0.000), also smaller at nearby levels (-2.8pp).' },
      { date: '2026-11-07', title: 'Literature pass', text: 'Post-jump direction depends on context: in US equity ETFs, no-news and scheduled-news jumps reverse, unscheduled-news jumps continue, negative jumps reverse hardest. FX evidence is thin and no gold study was found. No published test of jump intensity predicting a break at a vol-scaled level. Seasonality gave most of the accuracy for EURUSD jumps, and Hawkes did not beat logistic. 1-minute jump flags are bursts, not true jumps. Literature only: no repo files read, though the agents had the memory index of past results in context. Spec: plans/vol-layer/L2_LITERATURE_SPEC.md' },
    ],
  },
  {
    id: 'features', n: 3, short: 'Corr ÷ variance', title: 'Engineering features: splitting correlation from variance',
    status: 'testing',
    cog: [
      'An example of a layer is an engineering feature such as splitting correlation from variance.',
    ],
    question: 'If we model each instrument\'s own vol and the correlations between them separately, do we get a better forecast of combined risk, and a cleaner signal of "is this move the dollar or this currency"?',
    fields: [
      { k: 'own vol (D)', d: 'each instrument\'s vol, from layer 1' },
      { k: 'correlation (R)', d: 'how instruments move together, modelled on its own' },
      { k: 'dollar share', d: 'how much of a pair\'s move is the common USD factor' },
      { k: 'stress correlation', d: 'correlation on big risk-off days' },
    ],
    candidates: [
      { name: 'Σ = D·R·D on pairs', src: 'C.OG', state: 'open', note: '' },
      { name: 'Per-currency basis (7 currencies vs USD + gold + NQ)', src: 'repo', state: 'open', note: 'pairs and crosses follow exactly' },
      { name: 'R: rolling sample correlation', src: 'repo', state: 'open', note: 'benchmark' },
      { name: 'R: EWMA correlation', src: 'literature', state: 'open', note: '' },
      { name: 'R: EWMA shrunk to constant correlation (Ledoit-Wolf)', src: 'literature', state: 'open', note: '' },
      { name: 'R: DCC / cDCC', src: 'literature', state: 'open', note: 'Engle 2002, Aielli 2013' },
      { name: 'Built factors: dollar + carry (+ risk)', src: 'both', state: 'open', note: 'Lustig-Roussanov-Verdelhan; js/factorRisk.js' },
      { name: 'PCA factors', src: 'repo', state: 'open', note: '' },
      { name: 'Stress correlation / copula tail dependence', src: 'literature', state: 'open', note: '' },
      { name: 'Realized covariance from M1 (Epps effect)', src: 'literature', state: 'open', note: '' },
    ],
    repo: [
      'js/factorRisk.js: USD, CARRY, RISK, COMMOD, RATES factors with ridge betas',
      'education/residual_pca_currency_test/scripts/residual_test.py: per-currency returns + PCA',
      'js/deskRisk.js, js/deskExposure.js, scripts/build_corr_history.py',
      'Surface Lab "dollar or own story" split (today.html)',
      'Theory Lab: institutional-ledoit-wolf-shrinkage, copulas, correlation-networks-mst, institutional-barra-risk-models, multivariate-correlated-sdes, pca-factors',
    ],
    test: 'Forecast next-day covariance for random books of pairs. QLIKE loss on book variance and out-of-sample minimum-variance portfolio variance. Model Confidence Set over {sample, EWMA, EWMA+shrink, DCC}. Factor model: out-of-sample R² of factor-implied covariance.',
    defects: [],
    findings: [
      { date: '2026-11-07', title: 'Tested: dollar move vs own move at the line. Not cleared', text: 'My first version was wrong: triangular arbitrage made the common move equal the pair itself, caught before any outcome was computed. Redone on the 7 USD pairs with the dollar measured against other currencies. The dollar explains about 60% of EURUSD, GBPUSD, AUDUSD and NZDUSD variance, but about 15% of USDCAD and 5% of USDJPY. As a reaction predictor: 0.9994 [0.9984, 1.0004], Holm p 0.39. p75 points the expected way (more dollar-led moves reject more, 50.4% vs 45.9%) but its interval includes zero.' },
      { date: '2026-11-07', title: 'Literature pass', text: 'Equities show residual reversal and industry continuation. In FX, dollar and carry factors are autocorrelated and idiosyncratic returns show little momentum, which is not reversal; the dollar does reverse around fixes. No short-horizon FX residual-reversal test was found, so three hypotheses stay open. Crosses make a 34-instrument covariance near-singular: estimate in currency legs. Quote bounce and stale pairs create fake residual reversal. Literature only: no repo files read, though the agents had the memory index of past results in context. Spec: plans/vol-layer/L3_LITERATURE_SPEC.md' },
    ],
  },
  {
    id: 'views', n: 4, short: 'Conditional views', title: 'Conditional views',
    status: 'deep dive',
    cog: [
      'The way to really develop this is by having conditional views and then other layers supporting it.',
    ],
    question: 'Which directional views (rates, trend, carry, positioning, macro) work, and does their accuracy change with the vol state? A view here is "long/short, with a confidence", conditioned on layer 1.',
    fields: [
      { k: 'view', d: 'direction and strength per instrument' },
      { k: 'confidence', d: 'how much to trust the view right now' },
      { k: 'conditioning', d: 'which vol-state fields change the view\'s accuracy' },
    ],
    candidates: [
      { name: 'Rate-spread view', src: 'repo', state: 'open', note: '' },
      { name: 'Time-series momentum / trend', src: 'literature', state: 'open', note: 'Moskowitz-Ooi-Pedersen 2012' },
      { name: 'Carry', src: 'literature', state: 'open', note: 'crashes in vol spikes: Menkhoff et al. 2012' },
      { name: 'Positioning (COT)', src: 'repo', state: 'open', note: '' },
      { name: 'Separate view per regime cell', src: 'design', state: 'open', note: 'simple, but thin samples per cell' },
      { name: 'One model with view × vol-state interactions, shrunk', src: 'literature', state: 'open', note: 'ridge / hierarchical prior across pairs' },
      { name: 'Combine views: equal weight', src: 'literature', state: 'open', note: '' },
      { name: 'Combine views: IC-weighted, shrunk', src: 'repo', state: 'open', note: 'action-combining-signals lesson' },
      { name: 'Time-varying betas (Kalman)', src: 'repo', state: 'open', note: '' },
    ],
    repo: [
      'DecisionEngine/DESIGN.md (permission state machine)',
      'YieldSpreadBot/, macro-direction.html, cot-extremes.html, trend.html',
      'Theory Lab: action-combining-signals, hierarchical-bayesian-models, kalman-filter, action-base-rates',
      'education/QUANT_MACRO_LESSONS_1-6.md, education/cog-snippets.md',
    ],
    test: 'Out-of-sample information coefficient and hit rate of each view, overall and by vol-state tercile, purged walk-forward. Conditioned model vs unconditioned view. Deflated Sharpe with the true number of variants tried.',
    defects: [],
    findings: [
      { date: '2026-11-07', title: 'Literature pass', text: 'A Sharpe 0.5 view shifts P(up first) by only about 1.6pp at one daily σ (derived, not run), so views condition trades rather than stand alone. Nearly all evidence is monthly; no paper links a view to an intraday level reaction. Carry and momentum vol-state results do not transfer directly to a vol-level filter on FX. Equal-weight combination is hard to beat. Literature only: no repo files read, though the agents had the memory index of past results in context. Spec: plans/vol-layer/L4_LITERATURE_SPEC.md' },
    ],
  },
  {
    id: 'meta', n: 5, short: 'Meta-labelling', title: 'Meta-labelling: filtering the trades',
    status: 'deep dive',
    cog: [
      'Have you ever looked into meta labelling?',
    ],
    question: 'Given a trade from the views layer, can a second model predict whether it hits its target before its stop, well enough to skip the bad ones or size them down?',
    fields: [
      { k: 'label', d: 'did the trade hit take-profit before stop (triple barrier)' },
      { k: 'P(win)', d: 'calibrated probability from the secondary model' },
      { k: 'bet size', d: 'size from P(win), only if calibrated' },
    ],
    candidates: [
      { name: 'Triple-barrier labels with σ barriers', src: 'both', state: 'open', note: 'AFML ch.3' },
      { name: 'Logistic regression, 5–8 features', src: 'literature', state: 'open', note: '' },
      { name: 'Random forest / bagged trees', src: 'repo', state: 'open', note: '' },
      { name: 'Isotonic / Platt calibration', src: 'literature', state: 'open', note: 'Meyer-Barziy-Joubert 2023' },
      { name: 'Purged walk-forward + embargo', src: 'repo', state: 'open', note: '' },
      { name: 'Combinatorial purged CV (CPCV) + PBO', src: 'literature', state: 'open', note: 'AFML ch.12; Bailey et al.' },
      { name: 'AFML bet sizing vs half-Kelly vs flat', src: 'both', state: 'open', note: '' },
      { name: 'Conformal trade filter', src: 'literature', state: 'open', note: '' },
    ],
    repo: [
      'scripts/meta_proper/ (build_events.mjs, model.py): tooling to reuse',
      'pylego/barrier_race.py: first-touch walker on M1',
      'Theory Lab: institutional-triple-barrier-labeling, walk-forward-purged-cv, action-calibration-scoring, sharpe-family-deflated',
      'education/tools/whiteboards/institutional_triple_barrier_labeling.py',
    ],
    test: 'Per fold: precision lift vs taking every trade, Brier skill vs the base rate the barriers imply (SL / (TP+SL)), log-loss, reliability curve, AUC. Deflated Sharpe and PBO with the true trial count.',
    defects: [
      'RULE for the new model: scripts/meta_proper labels ret > 0, not "take-profit before stop". Use the triple-barrier first touch.',
      'RULE: meta_proper reweights classes and does not calibrate, yet sizes from the probabilities. Calibrate (isotonic / Platt) before any probability-based sizing, and do not rebalance classes.',
      'meta_proper is a pre-registered study and is left unchanged; its tooling (weights, purge, embargo) is reused.',
    ],
    findings: [
      { date: '2026-11-07', title: 'Literature pass', text: 'Barriers fix the base rate at b/(a+b). The model must beat a geometry-only benchmark, because time-limited or asymmetric barriers give AUC above 0.5 on a random walk (reasoned, no paper). Detecting 50 to 53% needs about 2,200 retained trades, about 5,200 after 100 trials. Calibration helped fixed sizing only. Platt beat isotonic below about 2,000 cases. No independent replication or peer-reviewed FX or gold test found. Literature only: no repo files read, though the agents had the memory index of past results in context. Spec: plans/vol-layer/L5_LITERATURE_SPEC.md' },
    ],
  },
  {
    id: 'sizing', n: 6, short: 'Black-Litterman & sizing', title: 'Black-Litterman, position sizing and the book',
    status: 'deep dive',
    cog: [
      'Stuff about Black Litterman will be an interesting read as well.',
      'The vol forecaster can drive so many things: position sizing, regime states.',
    ],
    question: 'How should the views and their confidence turn into position sizes across the book, so that risk is steady and no single hidden bet (e.g. the dollar) dominates?',
    fields: [
      { k: 'trade size', d: 'risk budget ÷ stop distance × confidence' },
      { k: 'book risk', d: 'combined risk from layer 3\'s covariance' },
      { k: 'factor share', d: 'how much of the book is one bet' },
      { k: 'drawdown throttle', d: 'size cut after losses' },
    ],
    candidates: [
      { name: 'Black-Litterman with Ω from forecast error and regime', src: 'C.OG', state: 'open', note: 'needs a prior; FX has no market portfolio' },
      { name: 'Meucci entropy pooling', src: 'literature', state: 'open', note: '' },
      { name: 'Signal ÷ σ risk budgeting + book vol target', src: 'literature', state: 'open', note: '' },
      { name: 'Equal risk contribution / HRP', src: 'repo', state: 'open', note: 'lessons only' },
      { name: 'Fractional Kelly', src: 'repo', state: 'open', note: '' },
      { name: 'Vol targeting (Moreira-Muir)', src: 'literature', state: 'open', note: '' },
      { name: 'Dollar-factor risk cap', src: 'literature', state: 'open', note: '' },
      { name: 'Step drawdown throttle vs continuous (Grossman-Zhou)', src: 'both', state: 'open', note: '' },
    ],
    repo: [
      'pylego/sizing.py, pylego/drawdown_throttle.py, pylego/risk_guard.py, pylego/portfolio_sim.py',
      'js/positionSizerEngine.js, js/factorRisk.js, position-sizer.html',
      'Theory Lab: markowitz-black-litterman, risk-parity-erc, hierarchical-risk-parity, kelly-criterion, action-vol-to-size, drawdowns-risk-of-ruin',
    ],
    test: 'Realised vs target book vol (ratio and dispersion), max drawdown, turnover and net Sharpe for each sizing rule vs plain per-trade risk. One vol scaler only: a kσ stop plus a vol-cut budget scales size by σ².',
    defects: [],
    findings: [
      { date: '2026-11-07', title: 'Literature pass', text: 'Black-Litterman with a zero prior reduces to signal/σ (derived), so it only differs through correlations and a state-varying Ω; test those steps one at a time. It needs a mean view, and a range forecast gives size not sign, so forecast error is not a valid Ω for a direction view. Vol targeting evidence is split: Moreira-Muir vs Cederburg (53 of 103 higher Sharpe); currencies show negligible Sharpe gain but thinner tails. Freeze the trade list and compare at equal ex-post vol. Literature only: no repo files read, though the agents had the memory index of past results in context. Spec: plans/vol-layer/L6_LITERATURE_SPEC.md' },
    ],
  },
  {
    id: 'execution', n: 7, short: 'Stop orders', title: 'Execution: entries and stop orders',
    status: 'testing',
    cog: [
      'The way how I\'m able to have the stop orders you\'ve said about is because I\'m using a vol forecaster as a single layer in a multi layer system.',
      'Every single position is different.',
    ],
    question: 'Given the state, the view, the filter and the size, where exactly do the entry, stop and target go, and what order type is used? Every position differs because every input differs.',
    fields: [
      { k: 'entry type', d: 'stop order (breakout) or limit (fade)' },
      { k: 'entry level', d: 'open ± k·σ, scaled for time of day' },
      { k: 'stop', d: 'noise threshold in σ, widened or skipped for jump risk' },
      { k: 'target / time stop', d: 'range quantile, vertical barrier' },
    ],
    candidates: [
      { name: 'Fade at range quantiles (touch, rejection, close back inside)', src: 'C.OG', state: 'open', note: 'FORECASTER_WALKTHROUGH_NOTES.md' },
      { name: 'Breakout stop orders at open ± k·σ_session', src: 'design', state: 'open', note: '' },
      { name: 'Entry type chosen by vol state', src: 'design', state: 'open', note: 'fade and breakout tested side by side, neither default' },
      { name: 'Stop = MAE noise threshold, in σ', src: 'C.OG', state: 'open', note: 'education/cog-snippets.md #1, #5' },
      { name: 'First-passage probability benchmark (with drift)', src: 'literature', state: 'open', note: 'not in repo yet' },
      { name: 'Remaining-session σ from time-of-day profile', src: 'literature', state: 'open', note: '' },
      { name: 'Trailing vs fixed stops', src: 'literature', state: 'open', note: 'Kaminski-Lo' },
      { name: 'Brownian-bridge intrabar touch correction', src: 'literature', state: 'open', note: '' },
      { name: 'Cancel pending orders on regime flip (with hysteresis)', src: 'design', state: 'open', note: '' },
    ],
    repo: [
      'pylego/barrier_race.py, VolRangeForecaster/sltp_distribution.py, js/forecastCore.js (computeBands)',
      'fill-realism.html, pylego/costs.py, pylego/events.py (news blackout)',
      'education/FORECASTER_WALKTHROUGH_NOTES.md, education/range-extension-levels-notes.md, education/jordan_trade_geometry/',
      'Theory Lab: trade-management-exits, action-trade-plan, execution-algorithms',
    ],
    test: 'Start with a dumb directional view so only the vol layers are tested. Realised fill rate vs model fill probability; P(TP first) by (stop, target) bin vs the first-passage formula; MAE/MFE; net expectancy after costs on the real M1 path.',
    defects: [
      'FIXED 2026-11-06: pylego/barrier_race.race_grid and race_trades_variable had no way to score a same-bar TP/SL touch as a stop; they now take pessimistic_ties. The default stays False so past studies reproduce. Every vol-layer test passes pessimistic_ties=True.',
    ],
    findings: [
      { date: '2026-11-07', title: 'Tested: real stop orders through round numbers. The location is real, the trade is not', text: 'Real bid/ask fills, FX majors. Setup chosen on 2020-2026 (stop 1σ, target 2σ, 240 minutes), then scored on untouched 2016-2020. First touches reject -2.5pp [-3.9, -1.1] against arbitrary prices, so the effect replicates in a separate window. Net R beats arbitrary by +0.019 [+0.009, +0.029]. But net R is -0.031 [-0.045, -0.018], with 0 of 4 years positive, and all 24 setups lost on discovery. The edge is about 0.012-0.019σ at every stop size, about a third of the costs at a 1σ stop, so a wider stop does not rescue it. This is the first location we have found that holds up in two windows: use it as a conditioner, such as not fading there.' },
      { date: '2026-11-07', title: 'Correction: my follow numbers were slightly too good', text: 'I counted same-bar ambiguous outcomes as wins on follow trades, against the prereg. Fixed and re-run: gross +0.064 became +0.058 R, net -0.107 became -0.113 R. The verdict did not change.' },
      { date: '2026-11-07', title: 'Tested: do round numbers reject more? NULL, and the opposite way', text: 'About 34,000 touches of each round grid vs 139,612 arbitrary prices. Round numbers reject less: 00 at 0.25σ -1.28pp [-1.87, -0.68], the same direction on the other three cells except one interval that includes zero. Fades lose -0.20 R net. Our lines gain nothing by sitting on a round number: +0.13pp [-1.15, +1.43]. Exploratory, not a result: in FX majors the gap is 4-5pp on all seven pairs and every year, and a follow makes about +0.07 R gross against about zero at arbitrary prices. This fits Osler\'s stop-cascade side. It has its own prereg on untouched 2016-2020 data with real bid/ask fills (round-break-follow).' },
      { date: '2026-11-07', title: 'Tested: fade or follow with a dumb stop and target. Spread is the wall', text: 'Target and stop 0.25σ, 120-minute limit, one measured spread. Selected fade: -0.176 R net [-0.197, -0.156], 0 of 5 folds. Selected follow: +0.058 R gross [+0.040, +0.076], 5 of 5 folds, but -0.113 R net [-0.133, -0.091], because one spread costs 0.17 R at this size. FX majors come closest: -0.026 R [-0.055, +0.005]. The open lead is the gross follow-through at a wider stop where spread shrinks against σ.' },
      { date: '2026-11-07', title: 'Literature pass', text: 'On a martingale no entry type or placement gives positive gross R, so a stop-order claim needs a source of drift. Osler: FX reversal 59-60% at round numbers vs 55-57% at arbitrary levels, fading in about 30 minutes; crossing adds about 0.7bp; neither net of cost. No evidence of order clustering at vol-scaled levels, which is the central gap for your exhaustion question. Breakouts look positive in equities, with no independent replication found, and have decayed in major FX. Stops help only with momentum (Kaminski-Lo). Literature only: no repo files read, though the agents had the memory index of past results in context. Spec: plans/vol-layer/L7_LITERATURE_SPEC.md' },
    ],
  },
  {
    id: 'feedback', n: 8, short: 'Feedback loop', title: 'Forecast error as a feedback loop',
    status: 'testing',
    cog: [
      'But you can also use its errors as a feedback loop.',
    ],
    question: 'How should the forecaster\'s own recent errors flow back into every other layer: band widths, view confidence, filter features, size, and when to stop trading?',
    fields: [
      { k: 'band width', d: 'widen / narrow from recent coverage' },
      { k: 'drift alarm', d: 'is the forecaster breaking down' },
      { k: 'kill switch', d: 'stop a regime × entry type that is losing' },
    ],
    candidates: [
      { name: 'Adaptive conformal band widths', src: 'literature', state: 'open', note: 'Gibbs-Candès 2021' },
      { name: 'Static per-asset corrections', src: 'repo', state: 'open', note: 'incumbent' },
      { name: 'CUSUM / Page-Hinkley on standardised errors', src: 'repo', state: 'open', note: 'lessons only' },
      { name: 'SPRT kill switch per regime × entry type', src: 'repo', state: 'open', note: 'analysis/forecaster_lessons/monitoring_and_tails.py' },
      { name: 'Error features into meta-labelling', src: 'design', state: 'open', note: 'highest overfit risk; last' },
      { name: 'Error → Black-Litterman Ω', src: 'design', state: 'open', note: '' },
    ],
    repo: [
      'js/volStateVector.js (forecastError), js/harShadowCore.js, stress / drawdown shadows',
      'analysis/forecaster_lessons/monitoring_and_tails.py',
      'Theory Lab: change-point-detection, action-edge-decay',
    ],
    test: 'Rolling 60-day coverage error and band width vs static bands, per regime. Drift: detection delay on injected shifts vs false-alarm rate. Kill switch: expected run length under good and bad edge, by simulation.',
    defects: [],
    findings: [
      { date: '2026-11-07', title: 'Tested: today\'s realised vol and range so far. The only family that adds', text: 'Realised vol so far, jumps so far and range used so far: 0.9990 [0.9983, 0.9997], Holm p 0.002, and the whole set beats all 20 shuffles. Real, but only 0.1% of log-loss against a 1% gate. More range used means more rejection, about 2-4pp from bottom to top quintile, and the same size at nearby levels. So this is the nearest thing to exhaustion we have found: a small effect of how much of the day is spent, not something special about the line.' },
      { date: '2026-11-07', title: 'Literature pass', text: 'Three separate uses: correct the forecast, signal, governance. No direct test of realised-minus-forecast predicting reversal in FX, gold or index futures. Adjacent work conflicts: surprise vol with continuation on S&P futures, VIX level with reversal, so any test must separate level from surprise. The adaptive conformal coverage guarantee holds regardless of forecaster, so judge width and conditional coverage. No peer-reviewed live kill-switch study found. Literature only: no repo files read, though the agents had the memory index of past results in context. Spec: plans/vol-layer/L8_LITERATURE_SPEC.md' },
    ],
  },
];

// The order the layers are researched and then stacked. Each step must pass its own test before the next goes on top.
export const BUILD_ORDER = [
  { step: 0, what: 'Fix the defects listed on each tab (done 2026-11-06: one code fix, the rest are rules for new code)', why: 'they bias every test downstream' },
  { step: 1, what: 'Vol state: chosen forecast kept as the lines; tested against reaction (done 2026-11-07, CONTEXT)', why: 'every other layer reads it' },
  { step: 2, what: 'Jumps', why: 'decides when σ-based stops can be trusted' },
  { step: 3, what: 'Stop orders with a dumb view', why: 'isolates what the vol layers alone do for entries and stops' },
  { step: 4, what: 'Conditional views', why: 'adds direction' },
  { step: 5, what: 'Meta-labelling', why: 'filters the views\' trades' },
  { step: 6, what: 'Corr ÷ variance, then sizing / Black-Litterman', why: 'turns trades into a book' },
  { step: 7, what: 'Feedback loop', why: 'last, because it touches every layer' },
];

// How each deep dive runs (agents), so every layer is treated the same way.
export const DEEP_DIVE = [
  'Literature pass: published research and C.OG\'s words only, no repo access. Output: a spec with candidates and formulas.',
  'Repo pass: map the spec onto existing code, lessons and C.OG education. Reads code, not verdict comments or results files.',
  'Bias check: only now read past repo results for this layer, and record where they disagree with the spec.',
  'Prereg: register row (plans/RESEARCH_REGISTER.md), pre-registered test, lockbox respected.',
  'Run the isolated test, bank the verdict, update this tab.',
];

// The combined test, filled as stacks are run. Units: R, where 1 R = the stop distance.
export const COMBINED = [
  { stack: '1 state + 7 stops (dumb view), 0.25σ stop: follow', trades: 15755, gross: 0.058, net: -0.113, ci: [-0.133, -0.091], against: 'loses to spread; model adds 0.1%' },
  { stack: 'Stop order through a round number, FX majors, 1σ stop, 2σ target, real fills, 2016-2020', trades: 8234, gross: null, net: -0.031, ci: [-0.0447, -0.0178], against: 'beats arbitrary prices by +0.019 R; still loses' },
  { stack: '1 state + 7 stops (dumb view), 0.25σ stop: fade', trades: 11339, gross: -0.007, net: -0.176, ci: [-0.197, -0.156], against: 'no gross edge' },
];

// What has been tested, why, and what came out. Add a row in the same change that banks a result.
// verdict: the four banked words, or 'running' / 'registered'.
export const TESTS = [
  { date: '2026-11-07', id: 'vol-layer-rv5-increment', layer: 'state', what: 'Added yesterday and last-week 1-minute realised vol to the chosen forecast', why: 'The literature says most gains come from intraday data, and the chosen forecast reads daily bars only. The cheapest check before rebuilding any forecaster.', output: 'Lines 1.2% more accurate on 34 instruments, 0.9884 [0.9856, 0.9910], every fold better. Biggest on indices.', verdict: 'VALIDATED', doc: 'analysis/output/vol-layer-rv5-increment/RESULTS.md' },
  { date: '2026-11-07', id: 'vol-layer-reaction', layer: 'state, jumps, corr, stops, feedback', what: 'Shared vol state against reject or break at the chosen lines, then fade or follow net of spread', why: 'Your question: for exhaustion, does price react at the line, not is it touched. Earlier tests never held these fields.', output: 'Only realised vol and range so far today adds, by 0.1% against a 1% gate. Follow +0.058 R gross, -0.113 R net. Fade -0.176 R net. Spread is 0.17 R at a 0.25σ stop.', verdict: 'CONTEXT', doc: 'analysis/output/vol-layer-reaction/RESULTS.md' },
  { date: '2026-11-07', id: 'vol-layer-round-numbers', layer: 'stops', what: 'First touches of round numbers against arbitrary prices, and lines that sit on a round number', why: 'The literature found no order clustering at vol-scaled levels. Osler finds reversal where orders rest, so this checks if a level reacts anywhere.', output: 'Round numbers reject less, not more: -1.28pp [-1.87, -0.68] at 00. Lines gain nothing on one: +0.13pp [-1.15, +1.43].', verdict: 'NULL', doc: 'analysis/output/vol-layer-round-numbers/RESULTS.md' },
  { date: '2026-11-07', id: 'round-break-follow', layer: 'stops', what: 'Real stop orders through round numbers in FX majors on bid/ask fills. Setup chosen on 2020-2026, scored on untouched 2016-2020', why: 'The round-number test showed breaks in majors after the fact. This confirms it on separate data and prices it with real fills.', output: 'The location replicates: -2.5pp rejection, +0.019 R vs arbitrary. The trade loses: -0.031 R, no positive year 2017-2020. All 24 setups lose on discovery.', verdict: 'CONTEXT', doc: 'analysis/output/round-break-follow/RESULTS.md' },
];

// Everything C.OG or the chat named, and how far each has really gone.
// status: 'tested' (own test on our data) · 'input only' (fed into another test) · 'literature only' · 'not started'
export const NAMED = [
  { item: 'Current conditional vol', by: 'C.OG', layer: 'state', status: 'tested', note: 'Chosen forecast kept. 1-minute vol adds 1.2%.', next: 'HARQ and a single HAR across instruments, as nudges' },
  { item: 'Expected change in vol', by: 'C.OG', layer: 'state', status: 'input only', note: 'Added nothing to reaction at the lines.', next: 'Own test: does it forecast realised change? The live field is still a proxy' },
  { item: 'Vol relative to its long-run level', by: 'C.OG', layer: 'state', status: 'input only', note: 'Added nothing to reaction at the lines.', next: 'Own test: which long-run level, and does it add' },
  { item: 'Probability of vol regimes', by: 'C.OG', layer: 'state', status: 'input only', note: 'Added nothing to reaction at the lines.', next: 'Calibration of the probabilities' },
  { item: 'Forecast error as a feedback loop', by: 'C.OG', layer: 'feedback', status: 'input only', note: 'Range and realised vol so far today add 0.1%.', next: 'Band widths from errors, drift alarm, kill switch' },
  { item: 'Jump intensity and jump diffusion', by: 'C.OG', layer: 'jumps', status: 'input only', note: 'Rough features added nothing. Five earlier studies are banked.', next: 'Deep dive running: clean detector, after-jump behaviour, stop-through, Merton first-passage' },
  { item: 'Splitting correlation from variance', by: 'C.OG', layer: 'features', status: 'input only', note: 'Only a dollar-share feature on reaction, which did not clear Holm.', next: 'Build and test the covariance model itself' },
  { item: 'Conditional views', by: 'C.OG', layer: 'views', status: 'literature only', note: 'Nothing run on our data.', next: 'Stack a direction view on round-number breaks' },
  { item: 'Meta-labelling', by: 'C.OG', layer: 'meta', status: 'literature only', note: 'The reaction model is close but uncalibrated and had no primary signal.', next: 'Run on the stack, with calibration' },
  { item: 'Black-Litterman', by: 'C.OG', layer: 'sizing', status: 'literature only', note: 'Nothing run on our data.', next: 'After something pays' },
  { item: 'Position sizing from vol', by: 'C.OG', layer: 'sizing', status: 'not started', note: '', next: 'After something pays' },
  { item: 'Stop orders; every position is different', by: 'C.OG, Jordan', layer: 'execution', status: 'input only', note: 'Only fixed stop sizes tested.', next: 'Noise-threshold stops from each system\'s MAE/MFE' },
  { item: 'HMM splitting range and trend regimes', by: 'Stephen', layer: 'state', status: 'not started', note: 'My regime fields measure quiet vs busy, not range vs trend.', next: 'Own test after noise-threshold stops' },
  { item: 'Technicals alone have no edge after spread', by: 'Husky', layer: 'execution', status: 'input only', note: 'Results so far agree, but not tested as his claim.', next: 'Keep as a check' },
  { item: 'C.OG\'s old forecaster logic', by: 'C.OG', layer: 'state', status: 'not started', note: 'He said he would post it.', next: 'Check education/cog_inbox/ for it' },
];
