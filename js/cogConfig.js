// js/cogConfig.js
//
// COG-inspired Nasdaq Macro Threshold Engine — single source of truth for
// every threshold, weight, sign convention, series ID and ticker used by the
// COG_* gate/exit/execution system. "No black boxes" means a reader should
// be able to open this one file and see every number that drives a
// decision, with a comment explaining why it has the sign/value it has.
//
// Core thesis this config encodes: Nasdaq price must NEVER feed a trade
// SIGNAL or VALID/INVALID classification. Gate 1 (Liquidity) is a pure
// macro/cross-asset read with zero Nasdaq input. Gate 3 (Direction) prefers
// cross-asset confirmation over Nasdaq price and only ever touches ES/RTY
// futures as broad risk-proxy confirmation, never NQ/QQQ. Gate 2
// (Risk/Volatility) is the one deliberate exception: it reads QQQ/SPY price
// ONLY to measure the traded instrument's own volatility/correlation regime
// (ATR, realized vol, GARCH sigma, QQQ-SPY/QQQ-DXY correlation) for stop
// distance and position sizing — direction-blind risk management, never a
// directional signal. Gate 4 (Execution) is the only gate allowed to look at
// NQ/QQQ price for the trade decision itself — it exists purely to place
// the trade Gates 1-3 already justified, never to generate the signal.
//
// Reuse policy (so the boundary is explicit, not accidental): this system
// imports the repo's generic, gate-agnostic utility layers directly —
// js/nasdaqTransforms.js (pure math: z-score, ramp-scoring, GARCH, roc, ...),
// js/nasdaqDataSources.js (FRED/Yahoo HTTP + kv.js caching plumbing), and
// js/nasdaqPerformance.js (Sharpe/Sortino/Calmar/Monte Carlo/walk-forward —
// operates on an abstract {dates, equityCurve, trades} shape with no gate
// logic of its own). It does NOT import any gate-specific config or
// decision logic from nasdaqConfig.js / nasdaqLiquidityEngine.js / etc. —
// every threshold, weight and decision rule the COG gates use lives only in
// this file and the cog*.js engine files, so the two sibling systems can
// evolve independently and neither can silently break the other.

// ── Gate 1 — Liquidity Engine ────────────────────────────────────────────
// `sign` encodes "more liquidity for US risk assets": +1 = rising raw value
// is bullish (e.g. central-bank balance sheet growth), -1 = rising raw value
// is bearish (e.g. dollar strength drains USD liquidity globally).
// `publicationLagDays` models real-world reporting delay — a print is never
// visible to the backtest before its actual publication date (no lookahead).
export const COG_LIQUIDITY_INPUTS = [
  { id: 'walcl',  label: 'Fed Balance Sheet (WALCL)',          source: 'fred',  seriesId: 'WALCL',         sign: +1, weight: 1.2, publicationLagDays: 4 },
  { id: 'rrp',    label: 'Reverse Repo (RRPONTSYD)',           source: 'fred',  seriesId: 'RRPONTSYD',     sign: -1, weight: 1.2, publicationLagDays: 1 },
  { id: 'tga',    label: 'Treasury General Account (WTREGEN)', source: 'fred',  seriesId: 'WTREGEN',       sign: -1, weight: 1.0, publicationLagDays: 4 },
  { id: 'ecb',    label: 'ECB Balance Sheet (ECBASSETSW)',     source: 'fred',  seriesId: 'ECBASSETSW',    sign: +1, weight: 0.7, publicationLagDays: 5 },
  { id: 'boj',    label: 'BOJ Balance Sheet (JPNASSETS)',      source: 'fred',  seriesId: 'JPNASSETS',     sign: +1, weight: 0.5, publicationLagDays: 10 },
  { id: 'pboc',   label: 'PBOC Proxy — China FX Reserves',     source: 'fred',  seriesId: 'TRESEGCNM052N', sign: +1, weight: 0.4, publicationLagDays: 15,
    proxyNote: 'FRED has no clean official PBOC balance-sheet series; China FX reserves (ex-gold) is the closest free, disclosed proxy.' },
  { id: 'curve',  label: 'US 10Y-2Y Spread (T10Y2Y)',          source: 'fred',  seriesId: 'T10Y2Y',        sign: +1, weight: 1.0, publicationLagDays: 1,
    note: 'Steepening = improving growth/risk-on = bullish; flattening/inversion = bearish.' },
  { id: 'dxy',    label: 'Dollar Index (DTWEXBGS)',            source: 'fred',  seriesId: 'DTWEXBGS',      sign: -1, weight: 1.0, publicationLagDays: 1,
    note: 'A strengthening dollar tightens global USD liquidity — bearish for risk assets.' },
  { id: 'credit', label: 'HY Credit Spread (BAMLH0A0HYM2)',    source: 'fred',  seriesId: 'BAMLH0A0HYM2',  sign: -1, weight: 1.0, publicationLagDays: 1,
    note: 'Widening spreads = credit stress = bearish.' },
  { id: 'nfci',   label: 'Chicago Fed NFCI',                   source: 'fred',  seriesId: 'NFCI',          sign: -1, weight: 0.8, publicationLagDays: 7,
    note: 'NFCI > 0 = tighter-than-average financial conditions = bearish.' },
  { id: 'hygLqd', label: 'HYG/LQD Ratio',                      source: 'yahoo', tickers: ['HYG', 'LQD'],   sign: +1, weight: 0.9, publicationLagDays: 0,
    note: 'Rising HY-vs-IG credit ETF ratio = risk appetite improving = bullish.' },
  { id: 'vix',    label: 'VIX',                                source: 'yahoo', tickers: ['^VIX'],         sign: -1, weight: 1.0, publicationLagDays: 0 },
  { id: 'vix3m',  label: 'VIX3M',                              source: 'yahoo', tickers: ['^VIX3M'],       sign: -1, weight: 0.5, publicationLagDays: 0 },
  { id: 'vvix',   label: 'VVIX',                               source: 'yahoo', tickers: ['^VVIX'],        sign: -1, weight: 0.5, publicationLagDays: 0 },
];

// Per the brief, each input blends THREE signals before being weighted into
// the composite: a multi-horizon ROC z-score (responsiveness) and a level
// percentile (regime placement). Each sub-signal is scaled/clipped onto
// [-1, +1] ("normalized") and averaged; the equal-weight blend of those
// normalized values is this input's final contribution before `sign`/weight
// — see computeInputContribution in cogLiquidityGate.js.
export const COG_LIQUIDITY_SCORE = {
  range: [-5, 5],
  bullishThreshold: 2,     // LiquidityScore > +2 → BULLISH
  bearishThreshold: -2,    // LiquidityScore < -2 → BEARISH
  rocHorizonsDays: [1, 7, 30],   // daily / 7d / 30d rate-of-change, each z-scored then averaged
  zWindowDays: 252,        // ~1 trading year lookback for the ROC z-scores
  percentileWindowDays: 252, // lookback for the raw-level percentile-rank sub-signal
  zClip: 3,                // ROC z-scores clipped to +/-3 std devs before normalizing to [-1,1]
  minCoverage: 0.5,        // >=50% of the weighted panel (by weight) must have data, else score is INVALID
  marginalMargin: 0.5,     // |score| within this of the bullish/bearish threshold counts as "marginal" conviction
};

// ── Gate 2 — Risk / Volatility Engine ───────────────────────────────────
// Inputs never touch Nasdaq price — vol/correlation/credit measures only.
// `ticker`/`fredSeriesId` resolve through cogDataSources.js. MOVE has no
// reliable free daily ticker; it's listed so its absence is visible and
// auditable — the gate abstains on it via the weight-present coverage
// policy rather than faking a value (same disclosure standard as the
// sibling NLC system's TICK/ADD/TRIN abstention).
export const COG_RISK_INPUTS = {
  vix:   { ticker: '^VIX' },
  vix3m: { ticker: '^VIX3M' },
  vvix:  { ticker: '^VVIX' },
  move:  { ticker: '^MOVE', flaggedMissing: true, note: 'No reliable free daily MOVE index feed — abstains via coverage policy until a paid feed is wired in (Phase 2 gap, disclosed not faked).' },
  qqq:   { ticker: 'QQQ' },
  spy:   { ticker: 'SPY' },
  dxy:   { ticker: 'DX-Y.NYB', fallbackTicker: 'UUP' },
  us10y: { fredSeriesId: 'DGS10' },
  credit:{ fredSeriesId: 'BAMLH0A0HYM2' },
};

// Each component's sub-score (0-100, via compositeRampScore) is built so
// "higher sub-score = more acceptable conditions to size a trade in" —
// `rampLow > rampHigh` always means "a lower raw value is better" here,
// same convention as nasdaqTransforms.rampScore.
export const COG_RISK_SCORE = {
  range: [0, 100],
  validThreshold: 35,   // intentionally permissive — this gate vetoes genuinely extreme/crisis regimes, it is not a tight trend-quality filter
  minCoverage: 0.5,
  percentileLookbackDays: 252,
  realizedVolWindowsDays: [5, 20, 60],
  garchRefitEveryDays: 20,
  garchMinObservations: 50,
  correlationWindowDays: 60,
  components: [
    { id: 'vixPercentile',      label: 'VIX percentile',                       weight: 1.0, rampLow: 90, rampHigh: 15 },
    { id: 'vvixPercentile',     label: 'VVIX percentile',                      weight: 0.6, rampLow: 90, rampHigh: 15 },
    { id: 'vixTermStructure',   label: 'VIX3M/VIX term structure',             weight: 0.5, rampLow: 0.90, rampHigh: 1.15, note: 'contango (>1) = calm; backwardation (<1) = stress' },
    { id: 'movePercentile',     label: 'MOVE percentile (bond vol)',           weight: 0.6, rampLow: 90, rampHigh: 15 },
    { id: 'realizedVol5dPctile',  label: 'Realized vol 5d percentile',         weight: 0.6, rampLow: 90, rampHigh: 15 },
    { id: 'realizedVol20dPctile', label: 'Realized vol 20d percentile',        weight: 1.0, rampLow: 90, rampHigh: 15 },
    { id: 'realizedVol60dPctile', label: 'Realized vol 60d percentile',        weight: 0.6, rampLow: 90, rampHigh: 15 },
    { id: 'atrPercentile',      label: 'NQ ATR percentile',                    weight: 0.8, rampLow: 92, rampHigh: 20 },
    { id: 'garchVolPercentile', label: 'GARCH(1,1) forecast vol percentile',   weight: 0.8, rampLow: 90, rampHigh: 15 },
    { id: 'corrQqqSpy',         label: 'QQQ-SPY 60d correlation',              weight: 0.7, rampLow: 0.50, rampHigh: 0.95, note: 'breakdown below ~0.6 signals dispersion/stress' },
    { id: 'corrQqqDxyInverse',  label: 'QQQ vs DXY inverse-correlation strength', weight: 0.4, rampLow: -0.10, rampHigh: 0.50, note: 'raw value is -corr(QQQ,DXY); a healthy regime keeps this positive' },
    { id: 'corrBondEquity',     label: 'Bond/equity hedge correlation',        weight: 0.5, rampLow: -0.30, rampHigh: 0.30, note: 'raw value is corr(10Y yield change, QQQ return); positive = normal "stocks down, yields down" hedge regime' },
    { id: 'creditStressPercentile', label: 'HY credit spread percentile',      weight: 0.8, rampLow: 90, rampHigh: 10 },
  ],
};

// Three independently backtestable stop models (Backtest Lab lets you pick
// one). All are expressed as a fraction of the instrument's own price via a
// distance-per-unit-vol measure, scaled by a tier multiplier.
export const COG_STOP_MODELS = {
  atrFraction:   { label: 'Model A — ATR fraction',        standardMultiplier: 0.25, conservativeMultiplier: 0.125 }, // distance = multiplier x ATR
  garchSigma:    { label: 'Model B — GARCH sigma',         standardMultiplier: 1.0,  conservativeMultiplier: 0.5 },   // distance = multiplier x (forecastVol x price)
  expectedMove:  { label: 'Model C — Expected move (implied vol proxy)', standardMultiplier: 1.0, conservativeMultiplier: 0.5,
    note: 'implied vol proxy = VIX/100 (no listed NQ options vol feed) scaled to a 1-day expected move via /sqrt(252)' },
};

// Risk-tier sizing — Gate 2's own score selects which tiers are even
// eligible (see selectEligibleTiers in cogRiskGate.js); final sizing in
// cogExecutionEngine.js only ever sizes DOWN from what Gate 2 + Gate 3 would
// otherwise justify, mirroring the sibling NLC system's sizing asymmetry.
export const COG_RISK_TIERS = {
  conservative: { riskPct: 0.25, minGate2Score: 0 },
  standard:     { riskPct: 0.50, minGate2Score: 45 },
  aggressive:   { riskPct: 1.00, minGate2Score: 65 },
};

// ── Gate 3 — Direction Engine ───────────────────────────────────────────
// Cross-asset macro only. ES/RTY are broad index-futures risk-proxies
// (confirmation), never the Nasdaq instrument itself — see header note.
// `sign` follows the Gate 1 convention: +1 = a rising raw value is bullish
// for Nasdaq, -1 = bearish. Each input's ROC is z-scored over `zWindowDays`
// at its own `rocWindowDays` horizon (short for FX/rates, longer for
// commodities) before being signed, weighted and averaged.
export const COG_DIRECTION_INPUTS = [
  { id: 'dxy',    label: 'DXY trend',                 source: 'yahoo', tickers: ['DX-Y.NYB'], fallbackTickers: ['UUP'], sign: -1, weight: 1.2, rocWindowDays: 10 },
  { id: 'usdjpy', label: 'USDJPY',                    source: 'yahoo', tickers: ['USDJPY=X'], sign: +1, weight: 0.7, rocWindowDays: 10, note: 'rising USDJPY tracks broad risk-on / carry-trade flow' },
  { id: 'eurusd', label: 'EURUSD',                    source: 'yahoo', tickers: ['EURUSD=X'], sign: +1, weight: 0.5, rocWindowDays: 10 },
  { id: 'us2y',   label: 'US 2Y Yield ROC',            source: 'fred',  seriesId: 'DGS2',       sign: -1, weight: 0.8, rocWindowDays: 10, note: 'rising short-end yields = tightening = bearish for duration-sensitive growth names' },
  { id: 'us10y',  label: 'US 10Y Yield ROC',           source: 'fred',  seriesId: 'DGS10',      sign: -1, weight: 1.0, rocWindowDays: 10, note: 'rising long yields are a direct discount-rate headwind for Nasdaq-heavy growth multiples' },
  { id: 'hygLqd', label: 'HYG/LQD Credit Spread',      source: 'yahoo', tickers: ['HYG', 'LQD'], sign: +1, weight: 1.0, rocWindowDays: 10 },
  { id: 'creditImpulse', label: 'HY Spread Impulse',   source: 'fred',  seriesId: 'BAMLH0A0HYM2', sign: -1, weight: 0.7, rocWindowDays: 5, note: 'fast widening of HY spreads (impulse, not level) = acute credit stress' },
  { id: 'gold',   label: 'Gold',                       source: 'yahoo', tickers: ['GC=F'],     sign: -1, weight: 0.5, rocWindowDays: 20, note: 'gold strength = safety/inflation-hedge demand = risk-off tell' },
  { id: 'copper', label: 'Copper',                     source: 'yahoo', tickers: ['HG=F'],     sign: +1, weight: 0.6, rocWindowDays: 20, note: 'copper strength = global growth optimism = bullish' },
  { id: 'oil',    label: 'Crude Oil',                  source: 'yahoo', tickers: ['CL=F'],     sign: -1, weight: 0.4, rocWindowDays: 20, note: 'oil spikes = inflation/input-cost shock = bearish' },
  { id: 'es',     label: 'ES Futures (broad risk proxy)', source: 'yahoo', tickers: ['ES=F'],  sign: +1, weight: 0.8, rocWindowDays: 5 },
  { id: 'rty',    label: 'RTY Futures (breadth proxy)', source: 'yahoo', tickers: ['RTY=F'],   sign: +1, weight: 0.6, rocWindowDays: 5 },
];

export const COG_DIRECTION_SCORE = {
  range: [0, 100],
  longThreshold: 60,    // DirectionScore > 60 → LONG
  shortThreshold: 40,   // DirectionScore < 40 → SHORT
  zClip: 3,
  zWindowDays: 252,
  minCoverage: 0.5,
};

// ── Gate 4 — Execution Engine ───────────────────────────────────────────
// The ONLY engine in this system allowed to read Nasdaq price.
export const COG_EXECUTION = {
  commissionBps: 0.5,
  slippageBps: 1.0,
  spreadBps: 1.0,           // estimated bid/ask spread cost on entry, in bps of notional
  fillRule: 'next-bar-open', // signal computed on bar close, fills at the FOLLOWING bar's open — never the same bar
  baseRiskPctOfEquity: 0.01, // 1% of account equity is the "standard"-tier (riskPct 0.50) reference risk; COG_RISK_TIERS scales this up/down
  defaultStopModel: 'atrFraction', // which COG_STOP_MODELS entry sizes the position by default (Backtest Lab can override per run)
  defaultTier: 'aggressive', // the *requested* tier — cogExecutionEngine.js still caps this down to whatever Gate 2 actually clears
  instruments: {
    // `pointValue` = $ per 1.0 price-point move per unit, used to convert a
    // stop distance (price points) into a $ risk amount for position sizing.
    primary:   { id: 'nq_futures', label: 'NQ Futures (continuous)', ticker: 'NQ=F', pointValue: 20 },
    secondary: { id: 'qqq', label: 'QQQ (Nasdaq-100 ETF)', ticker: 'QQQ', pointValue: 1 },
  },
};

// ── Exit Engine ──────────────────────────────────────────────────────────
// ContinuationScore re-evaluated every N minutes live (5/15/30 are the
// supported cadences — `reevaluateOptionsMinutes`); the daily backtest can
// only re-evaluate once per daily bar, which is disclosed in
// cogBacktestEngine.js rather than hidden. All raw values are pre-aligned to
// the open trade's direction before scoring (see alignExitFeatures in
// cogExitEngine.js), so every ramp below reads as "higher raw value is more
// supportive of staying in", independent of LONG/SHORT.
export const COG_EXIT_SCORE = {
  range: [0, 100],
  stayInThreshold: 70,      // > 70 → stay in at full size
  reduceBand: [50, 70],     // 50-70 → reduce position
  closeThreshold: 40,       // < 40 → close trade
  reevaluateOptionsMinutes: [5, 15, 30],
  defaultReevaluateMinutes: 15,
  components: [
    { id: 'liquidityDeterioration', label: 'Liquidity deterioration (aligned ΔLiquidityScore)', weight: 1.2, rampLow: -1.5, rampHigh: 1.0 },
    { id: 'dxyReversal',            label: 'DXY reversal against trade (aligned, inverse)',     weight: 1.0, rampLow: -1,   rampHigh: 1 },
    { id: 'yieldReversal',          label: 'US10Y yield reversal against trade (aligned)',      weight: 0.8, rampLow: -1,   rampHigh: 1 },
    { id: 'creditWeakening',        label: 'Credit weakening (aligned HYG/LQD move)',            weight: 1.0, rampLow: -1,   rampHigh: 1 },
    { id: 'vixSpike',               label: 'VIX spike (inverse)',                                weight: 0.9, rampLow: 1.0,  rampHigh: -0.3 },
    { id: 'vvixSpike',               label: 'VVIX spike (inverse)',                              weight: 0.6, rampLow: 1.0,  rampHigh: -0.3 },
    { id: 'momentumDecay',          label: 'Directional momentum continuation',                  weight: 1.2, rampLow: -0.5, rampHigh: 0.8 },
    { id: 'atrExpansion',           label: 'ATR expansion (inverse — blow-off risk)',            weight: 0.7, rampLow: 90,   rampHigh: 40 },
    { id: 'regimeShift',            label: 'Vol-regime shift toward HIGH (inverse)',             weight: 0.8, rampLow: 1,    rampHigh: 0 },
  ],
};

// ── Synthetic / backtest data defaults ──────────────────────────────────
export const COG_DATA_DEFAULTS = {
  backtestStart: '2014-01-01',
  cacheTtlSeconds: 6 * 60 * 60, // 6h — matches the rest of the dashboard's macro refresh cadence
};
