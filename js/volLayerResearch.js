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
    status: 'deep dive',
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
      { name: 'σ: current forecaster (GARCH / RS-EWMA / log-HAR)', src: 'repo', state: 'open', note: 'the incumbent and the benchmark everything else must beat' },
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
      { date: '2026-11-07', title: 'Repo pass (code only) + first build', text: 'Map: plans/vol-layer/L1_REPO_PASS.md. The chosen σ (vol-forecast-v3 "persistence + IV") is a daily-bar estimator per instrument (Yang-Zhang 10/20 or EWMA 0.94/0.90 on NY-close bars) nudged for regime, recent misses, weekday and implied vol. Nothing in the repo built a 5-min realised-variance target from M1 for London sessions without forward-filling, and there was no Python NY-close builder, so forge/rv.py now does both, point-in-time with the lockbox cut, proven by 9 tests including prefix invariance. Still to build: fitted GARCH(1,1), HAR / HARQ / panel HAR on RV5, Model Confidence Set. Risks found: the estimator was picked on London bars but runs on NY bars; several HAR helpers use full-sample scales.' },
      { date: '2026-11-06', title: 'Literature pass (no repo access)', text: 'Spec: plans/vol-layer/L1_LITERATURE_SPEC.md. Main points: GARCH(1,1) is a hard benchmark in FX (Hansen-Lunde 2005); intraday-data gains come from better inputs more than model complexity; 5-min RV is the target to beat as the realised measure; QLIKE + Diebold-Mariano + Model Confidence Set to compare. Δσ and σ-vs-long-run are mostly transforms of the σ forecast (one degree of freedom, not two). Thin evidence: HARQ / realized GARCH mostly equity-tested, regime-switching gains for FX not established, nothing head-to-head for gold. Proposed test order: realised target, σ shootout, coverage + error feedback, Δσ, regime, long-run level, IV.' },
      { date: '2026-11-06', title: 'Step 0 check', text: 'The review claim that hmm.js leaks future data into live state was overstated. The live label is filtered and causal. The risk is only in backtests that reuse the Viterbi path, so it is recorded as a rule above.' },
    ],
  },
  {
    id: 'jumps', n: 2, short: 'Jumps', title: 'Jump intensity and jump diffusion',
    status: 'not started',
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
    findings: [],
  },
  {
    id: 'features', n: 3, short: 'Corr ÷ variance', title: 'Engineering features: splitting correlation from variance',
    status: 'not started',
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
    findings: [],
  },
  {
    id: 'views', n: 4, short: 'Conditional views', title: 'Conditional views',
    status: 'not started',
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
    findings: [],
  },
  {
    id: 'meta', n: 5, short: 'Meta-labelling', title: 'Meta-labelling: filtering the trades',
    status: 'not started',
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
    findings: [],
  },
  {
    id: 'sizing', n: 6, short: 'Black-Litterman & sizing', title: 'Black-Litterman, position sizing and the book',
    status: 'not started',
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
    findings: [],
  },
  {
    id: 'execution', n: 7, short: 'Stop orders', title: 'Execution: entries and stop orders',
    status: 'not started',
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
    findings: [],
  },
  {
    id: 'feedback', n: 8, short: 'Feedback loop', title: 'Forecast error as a feedback loop',
    status: 'not started',
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
    findings: [],
  },
];

// The order the layers are researched and then stacked. Each step must pass its own test before the next goes on top.
export const BUILD_ORDER = [
  { step: 0, what: 'Fix the defects listed on each tab (done 2026-11-06: one code fix, the rest are rules for new code)', why: 'they bias every test downstream' },
  { step: 1, what: 'Vol state (σ first, then the other four fields)', why: 'every other layer reads it' },
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
