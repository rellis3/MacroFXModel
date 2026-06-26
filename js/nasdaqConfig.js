// js/nasdaqConfig.js
//
// NASDAQ Liquidity Continuation Framework — single source of truth for every
// threshold, weight, sign convention, series ID and ticker used anywhere in
// this system. The "no black boxes" requirement means a reader should be able
// to open this one file and see every number that drives a decision, with a
// comment explaining why it has the sign/value it has. Nothing in the engines
// should hardcode a magic number that isn't defined (and explained) here.
//
// This module is brand new and does not import from, or share state with,
// any other backtest/gate system already in this repository.

// ── Liquidity Engine (Gate 1) inputs ────────────────────────────────────────
// `sign` encodes the economic direction of "more liquidity for US risk assets":
//   +1 → a rising value is bullish for liquidity (e.g. Fed balance sheet growth)
//   -1 → a rising value is bearish for liquidity (e.g. dollar strength drains it)
// `source` selects which fetcher in nasdaqDataSources.js to use.
// `publicationLagDays` models real-world reporting delay so the backtest can
// never see a number before it would actually have been published.
export const LIQUIDITY_INPUTS = [
  { id: 'walcl',     label: 'Fed Balance Sheet (WALCL)',        source: 'fred',  seriesId: 'WALCL',         sign: +1, weight: 1.2, publicationLagDays: 4, freq: 'weekly' },
  { id: 'rrp',       label: 'Reverse Repo (RRPONTSYD)',         source: 'fred',  seriesId: 'RRPONTSYD',     sign: -1, weight: 1.2, publicationLagDays: 1, freq: 'daily' },
  { id: 'tga',       label: 'Treasury General Account (WTREGEN)', source: 'fred', seriesId: 'WTREGEN',     sign: -1, weight: 1.0, publicationLagDays: 4, freq: 'weekly' },
  { id: 'ecb',       label: 'ECB Balance Sheet (ECBASSETSW)',   source: 'fred',  seriesId: 'ECBASSETSW',    sign: +1, weight: 0.7, publicationLagDays: 5, freq: 'weekly' },
  { id: 'boj',       label: 'BOJ Balance Sheet (JPNASSETS)',    source: 'fred',  seriesId: 'JPNASSETS',     sign: +1, weight: 0.5, publicationLagDays: 10, freq: 'monthly' },
  { id: 'pboc',      label: 'PBOC Proxy — China FX Reserves',   source: 'fred',  seriesId: 'TRESEGCNM052N', sign: +1, weight: 0.4, publicationLagDays: 15, freq: 'monthly',
    proxyNote: 'FRED has no clean official PBOC balance-sheet series; China FX reserves (ex-gold) is the closest free, disclosed proxy for PBOC liquidity stance.' },
  { id: 'curve',     label: 'US 10Y-2Y Spread (T10Y2Y)',        source: 'fred',  seriesId: 'T10Y2Y',        sign: +1, weight: 1.0, publicationLagDays: 1, freq: 'daily',
    note: 'Steepening curve = improving growth/risk-on = bullish; flattening/inversion = bearish.' },
  { id: 'dxy',       label: 'Dollar Index (DTWEXBGS)',          source: 'fred',  seriesId: 'DTWEXBGS',      sign: -1, weight: 1.0, publicationLagDays: 1, freq: 'daily',
    note: 'A strengthening dollar tightens global USD liquidity — bearish for risk assets.' },
  // HY Credit Spread (BAMLH0A0HYM2) removed: only 16% data coverage on real FRED
  // history — essentially absent. HYG/LQD ratio (hygLqd, below) covers the same
  // economic signal with 92% coverage from Yahoo and is retained in the panel.
  { id: 'nfci',      label: 'Chicago Fed NFCI',                 source: 'fred',  seriesId: 'NFCI',          sign: -1, weight: 0.8, publicationLagDays: 7, freq: 'weekly',
    note: 'NFCI > 0 = tighter-than-average financial conditions = bearish.' },
  { id: 'hygLqd',    label: 'HYG/LQD Ratio',                    source: 'yahoo', tickers: ['HYG', 'LQD'],   sign: +1, weight: 0.9, publicationLagDays: 0, freq: 'daily',
    note: 'Rising HY-vs-IG credit ETF ratio = risk appetite improving = bullish.' },
  { id: 'vix',       label: 'VIX',                              source: 'yahoo', tickers: ['^VIX'],         sign: -1, weight: 1.0, publicationLagDays: 0, freq: 'daily' },
  { id: 'vix3m',     label: 'VIX3M',                            source: 'yahoo', tickers: ['^VIX3M'],       sign: -1, weight: 0.5, publicationLagDays: 0, freq: 'daily' },
  { id: 'vvix',      label: 'VVIX',                             source: 'yahoo', tickers: ['^VVIX'],        sign: -1, weight: 0.5, publicationLagDays: 0, freq: 'daily' },
];

export const LIQUIDITY_SCORE = {
  range: [-5, 5],
  bullishThreshold: 1.5,  // LiquidityScore > +1.5 → BULLISH (lowered from 2 to widen the active zone)
  bearishThreshold: -1.5, // LiquidityScore < -1.5 → BEARISH (raised from -2 to widen the active zone)
  zClip: 3,               // component sub-scores are clipped to +/-3 std devs before averaging
  rocLookbackDays: 63,    // rate-of-change window: arr[i] - arr[i-63]. Converts levels → momentum.
                          // 63 days ≈ one fiscal quarter.
  zWindowDays: 252,       // std-dev lookback for normalising ROC. We divide ROC by its trailing σ
                          // WITHOUT subtracting the mean. This preserves persistent directional signals:
                          // steady QT → roc ≈ constant negative → norm = roc/σ ≈ −1.5 (BEARISH).
                          // A true z-score would give (roc − mean)/σ ≈ 0 → NEUTRAL — wrong.
  minCoverage: 0.5,       // at least 50% of the weighted panel (by weight) must have data, else score is INVALID
  marginalMargin: 0.5,    // |score| within this of bullish/bearishThreshold counts as "marginal" conviction for sizing
};

// ── Trend Expression Engine (Gate 2) ────────────────────────────────────────
export const TREND_SCORE = {
  range: [0, 100],
  validThreshold: 70,     // TrendScore > 70 → VALID
  adxTrendLevel: 25,      // reference line only — ADX above this = "a real trend is present" on dashboards
  hurstTrendLevel: 0.5,   // reference line only — Hurst > 0.5 = persistent/trending series
  atrPercentileBand: [25, 90], // healthy participation band; outside this = exhaustion (>90) or dead market (<25)
  exhaustionPenalty: 0.5, // multiplier applied to the atrPercentile sub-score when outside atrPercentileBand
  vwapLookbackBars: 13,   // ~ one session of 30-min bars, or one trading day at daily resolution
  asiaCloseBands: { bottom: 40, top: 60 }, // bottom 40% / middle / top 40% of the Asia range
  adxPeriod: 14,          // classic Wilder ADX/ATR smoothing period
  atrPeriod: 14,
  atrPercentileLookback: 100, // trailing bars used for the ATR percentile rank
  hurstLookbackBars: 100,     // trailing return-bars fed into the R/S Hurst estimate
  breadthRocDays: 20,         // breadth ratio rate-of-change window before z-scoring
  breadthZWindow: 252,        // breadth ratio-of-change z-score lookback
  // Each component maps a raw indicator value onto a 0-100 sub-score via a
  // linear ramp between [rampLow, rampHigh] (clipped outside the range);
  // rampLow > rampHigh encodes "a lower raw value is better". Sub-scores are
  // combined by weighted average (compositeRampScore in nasdaqTransforms.js).
  // Ramp anchors below (adx/hurst/momentum/breadth) were recalibrated against
  // an empirical diagnostic run (see the Gate 2 Component Diagnostic card):
  // the original anchors were pinned to crisis-level raw values, so a
  // genuinely strong "good trend day" landed just under validThreshold even
  // when every other gate agreed — the component breakdown showed momentum
  // and breadth as the dominant always-weakest-link blockers, and the
  // framework's own "reference" lines (adxTrendLevel 25, hurstTrendLevel 0.5)
  // scored only 50/40 under the old ramps, i.e. below the midpoint of what
  // the dashboard itself calls "a real/persistent trend". Tightening the
  // ramps to realistic single-day/short-window magnitudes (rather than full
  // ATR-scale or crisis-scale moves) fixes that inconsistency without
  // changing validThreshold itself.
  components: [
    { id: 'adx',         label: 'ADX (trend strength)',                     unit: 'ADX',         weight: 1.2, rampLow: 10,   rampHigh: 32 },
    { id: 'hurst',       label: 'Hurst exponent (persistence)',             unit: 'H',           weight: 1.0, rampLow: 0.32, rampHigh: 0.65 },
    { id: 'atrPercentile', label: 'ATR percentile (participation)',        unit: '%ile',        weight: 0.8, rampLow: 10,   rampHigh: 60 },
    { id: 'momentum',    label: 'Directional session momentum',            unit: 'ATRs',        weight: 1.2, rampLow: 0,    rampHigh: 0.6 },
    { id: 'breadth',     label: 'Breadth trend (equal-weight vs cap-weight)', unit: 'z',         weight: 1.0, rampLow: -1,   rampHigh: 1.0 },
    { id: 'vwapDist',    label: 'Conviction vs session VWAP',               unit: 'ATRs',        weight: 0.8, rampLow: 0,    rampHigh: 1.0 },
    { id: 'vixTermStructure', label: 'VIX term structure (VIX3M/VIX)',      unit: 'ratio',       weight: 0.7, rampLow: 0.95, rampHigh: 1.15 },
  ],
  // When Gate 2 TrendScore reaches this level, Gate 3 confirmation is bypassed —
  // a very high-conviction trend signal is treated as self-confirming. Set null to disable.
  highConvictionGate3Bypass: 85,
};

// Risk tier mapping that Gate 2 recommends (final sizing decision lives in
// nasdaqSizing.js, which also folds in LiquidityScore strength and vol regime).
export const TREND_RISK_TIERS = [
  { minScore: 90, riskPct: 1.5, label: 'HIGH' },
  { minScore: 80, riskPct: 1.0, label: 'MEDIUM' },
  { minScore: 70, riskPct: 0.5, label: 'LOW' },
];

// ── NY Confirmation Engine (Gate 3) ─────────────────────────────────────────
export const NY_CONFIRMATION = {
  // Window is specified in UK local time per the spec, converted with real
  // DST rules (Europe/London) rather than a fixed UTC offset.
  windowStartUk: '14:20',
  windowEndUk: '14:35',
  agreementThreshold: 0.60, // >=60% of weighted inputs must agree with the Gate1+Gate2 bias for LONG/SHORT; otherwise INVALID
  // `polarity` is the sign multiplier such that polarity * rawMove > 0 means
  // "this input agrees with a LONG bias" (and the opposite for SHORT). Made
  // explicit per input rather than inferred from the label text.
  inputs: [
    { id: 'nq',      label: 'NQ Futures 30m momentum',  weight: 1.2, polarity: +1 },
    { id: 'es',      label: 'ES Futures 30m momentum',  weight: 1.0, polarity: +1 },
    { id: 'rty',     label: 'RTY Futures 30m momentum', weight: 0.8, polarity: +1 },
    { id: 'dxy',     label: 'DXY 30m move (inverse)',   weight: 0.8, polarity: -1 },
    { id: 'us10y',   label: 'US10Y yield 30m move',     weight: 0.6, polarity: +1 },
    { id: 'vwap',    label: 'Price vs session VWAP',    weight: 1.0, polarity: +1 },
    { id: 'breadth', label: 'Breadth proxy',            weight: 1.0, polarity: +1 },
    { id: 'tick',    label: 'TICK proxy',                weight: 0.7, polarity: +1 },
    { id: 'add',     label: 'Advance/Decline proxy',     weight: 0.7, polarity: +1 },
    { id: 'trin',    label: 'TRIN proxy (inverse)',       weight: 0.6, polarity: -1 },
  ],
};

// ── Dynamic Exit Engine (Gate 4) ────────────────────────────────────────────
export const CONTINUATION_SCORE = {
  range: [0, 100],
  stayInThreshold: 70,     // > 70 → stay in fully sized
  reduceBand: [50, 70],    // 50-70 → reduce position
  closeThreshold: 40,      // < 40 → close trade
  reevaluateEveryMinutes: 30,
  // All raw values below are pre-aligned to the OPEN trade's direction by the
  // engine before scoring (e.g. for a SHORT, a falling DXY is fed in as a
  // positive number) — so every ramp here can be read as "higher raw value
  // is more supportive of staying in", independent of LONG/SHORT.
  components: [
    { id: 'momentum30m', label: 'Directional momentum continuation', unit: 'ATRs', weight: 1.2, rampLow: -0.5, rampHigh: 0.8 },
    { id: 'adx',         label: 'ADX level',                          unit: 'ADX',  weight: 1.0, rampLow: 15,   rampHigh: 35 },
    { id: 'adxSlope',    label: 'ADX slope (change since last reval)', unit: 'pts', weight: 1.0, rampLow: -5,   rampHigh: 5 },
    { id: 'hurst',       label: 'Hurst exponent',                      unit: 'H',   weight: 0.8, rampLow: 0.40, rampHigh: 0.60 },
    { id: 'vwapDist',    label: 'Distance from VWAP (aligned)',        unit: 'ATRs', weight: 0.8, rampLow: -0.5, rampHigh: 1.0 },
    { id: 'vwapLoss',    label: 'VWAP loss (cross against direction)', unit: 'bool', weight: 1.2, rampLow: 1,    rampHigh: 0 },
    { id: 'breadth',     label: 'Breadth (aligned)',                   unit: 'z',   weight: 1.0, rampLow: -1,   rampHigh: 1 },
    { id: 'add',         label: 'Advance/Decline proxy (aligned)',     unit: 'z',   weight: 0.7, rampLow: -1,   rampHigh: 1 },
    { id: 'tick',        label: 'TICK proxy (aligned)',                unit: 'z',   weight: 0.6, rampLow: -1,   rampHigh: 1 },
    { id: 'trin',        label: 'TRIN proxy (aligned, inverse)',       unit: 'z',   weight: 0.6, rampLow: -1,   rampHigh: 1 },
    { id: 'dxy',         label: 'DXY movement (aligned, inverse)',     unit: 'z',   weight: 0.6, rampLow: -1,   rampHigh: 1 },
    { id: 'yields',      label: 'Bond yield movement (aligned)',       unit: 'z',   weight: 0.5, rampLow: -1,   rampHigh: 1 },
    { id: 'vix',         label: 'VIX level/move (aligned, inverse)',   unit: 'z',   weight: 0.8, rampLow: -1,   rampHigh: 1 },
    { id: 'vvix',        label: 'VVIX level/move (aligned, inverse)',  unit: 'z',   weight: 0.5, rampLow: -1,   rampHigh: 1 },
    { id: 'realizedVol', label: 'Realized vol regime (lower = healthier trend)', unit: '%ile', weight: 0.6, rampLow: 80, rampHigh: 20 },
  ],
};

// Secondary exit models — run in parallel (research/comparison only) against
// every completed primary trade to see how a simpler rule would have done.
// The primary exit is always the Gate 4 ContinuationScore above; these never
// override a live trade, they only feed the backtest's exit-model comparison.
export const SECONDARY_EXIT_MODELS = {
  fixedR: { targets: [2, 3] },             // fixed2R / fixed3R — exit at entry +/- R * initial stop distance
  atrTrailing: { atrMultiplier: 2.0 },     // trail stop = extreme price since entry -/+ 2x current ATR
  chandelier: { atrMultiplier: 3.0, lookbackBars: 22 }, // classic chandelier: trail off the highest/lowest of the trailing 22 bars
  momentumDeterioration: { negativeBarsToExit: 3 },     // exit after N consecutive bars of momentum against direction
  vwapLoss: { confirmBars: 1 },            // exit after price closes on the wrong side of VWAP for N consecutive bars
  breadthDeterioration: { zThreshold: -1.0 }, // exit when aligned breadth z-score falls below this
  timeExit: { maxHoldingBars: 10 },        // exit after N bars regardless of price action
  hybridTrailTime: { atrMultiplier: 2.5, maxHoldingBars: 20 }, // ATR trailing OR time cap, whichever triggers first
};

// ── Volatility model / stop loss ────────────────────────────────────────────
// Regime = average percentile rank (0-100) across whichever of these five
// measures have data: ATR, realized vol (stdev of returns), GARCH(1,1)
// forecast vol, VIX level, VVIX level — each ranked against its own trailing
// `percentileLookbackDays` history. < lowPercentile => LOW, > highPercentile
// => HIGH, else NORMAL. Using the average of several measures (rather than
// any single one) is a deliberate simplicity/robustness choice: no single
// vol proxy has to be "right" for the regime call to be reasonable.
export const VOLATILITY_REGIME = {
  lowPercentile: 33,
  highPercentile: 67,
  percentileLookbackDays: 252,
  realizedVolWindowDays: 20,   // trailing window for the realized-vol (stdev of returns) measure
  stopAtrMultiplier: { LOW: 1.0, NORMAL: 1.25, HIGH: 1.75 },
};

// ── Position sizing ──────────────────────────────────────────────────────────
export const POSITION_SIZING = {
  HIGH:   { riskPct: 1.5 },
  MEDIUM: { riskPct: 1.0 },
  LOW:    { riskPct: 0.5 },
};

// ── Entry rule (Gate composition) ───────────────────────────────────────────
export const ENTRY_RULE = {
  longLiquidityMin: LIQUIDITY_SCORE.bullishThreshold,
  shortLiquidityMax: LIQUIDITY_SCORE.bearishThreshold,
  trendScoreMin: TREND_SCORE.validThreshold,
  // Maximum number of positions that may be open or queued simultaneously.
  // Raising this from 1 allows the system to enter continuation trades while
  // a prior trade is still running, removing the structural blocker where the
  // average 12-bar hold would prevent any new signals from firing.
  maxConcurrentPositions: 3,
};

// ── Backtest execution assumptions ──────────────────────────────────────────
export const EXECUTION = {
  commissionBps: 0.5,    // 0.5 bps per side — futures/CFD-style commission
  slippageBps: 1.0,      // 1 bp per side — conservative for liquid index futures/ETFs
  fillRule: 'next-bar-open', // signal computed on bar close, fill at the FOLLOWING bar's open — never the same bar (no lookahead)
};

// ── Market data instruments ─────────────────────────────────────────────────
export const INSTRUMENTS = {
  primary: { id: 'nq_futures', label: 'NQ Futures (continuous)', source: 'yahoo', ticker: 'NQ=F' },
  secondary: [
    { id: 'qqq',  label: 'QQQ (Nasdaq-100 ETF)', source: 'yahoo', ticker: 'QQQ' },
    { id: 'nas_cfd', label: 'NASDAQ CFD (proxy: ^NDX)', source: 'yahoo', ticker: '^NDX' },
  ],
  trendConfirmation: [
    { id: 'qqq', ticker: 'QQQ' },
    { id: 'spy', ticker: 'SPY' },
    { id: 'iwm', ticker: 'IWM' },
  ],
  nyFuturesProxy: [
    { id: 'nq', ticker: 'NQ=F' },
    { id: 'es', ticker: 'ES=F' },
    { id: 'rty', ticker: 'RTY=F' },
  ],
  breadthProxy: {
    nasdaq: { equalWeight: 'QQQE', capWeight: 'QQQ' },
    sp500:  { equalWeight: 'RSP',  capWeight: 'SPY' },
    note: 'True NYSE TICK / Advance-Decline line / TRIN require a real-time Level-1 market-internals feed that has no free source. This relative-strength proxy (equal-weight vs cap-weight ETFs) is a disclosed substitute, not a claim of equivalence.',
  },
  dxy: { id: 'dxy', ticker: 'DX-Y.NYB', fallbackTicker: 'UUP' },
  us10y: { id: 'us10y', ticker: '^TNX', note: '^TNX is 10x the yield in percent (e.g. 42.5 = 4.25%)', fredSeriesId: 'DGS10' },
};

// ── Session windows (real DST-aware local time, not fixed UTC offsets) ─────
export const SESSIONS = {
  asia:   { tz: 'Asia/Tokyo',     start: '09:00', end: '15:00' },
  london: { tz: 'Europe/London',  start: '08:00', end: '16:30' },
  londonLunch: { tz: 'Europe/London', start: '12:00', end: '13:00' }, // Gate 2 run time
  newYork: { tz: 'America/New_York', start: '09:30', end: '16:00' },
};

// ── Data fetch defaults ─────────────────────────────────────────────────────
export const DATA_DEFAULTS = {
  backtestStart: '2014-01-01',
  cacheTtlSeconds: 6 * 60 * 60, // 6h — matches the rest of the dashboard's macro refresh cadence
  intraday: {
    granularity: '30m',
    maxLookbackDays: 60, // hard limit imposed by free intraday data providers, not a design choice
  },
  hourlyFallback: {
    granularity: '60m',
    maxLookbackDays: 730,
  },
};

// ── Performance reporting / robustness checks ───────────────────────────────
// Every number a report depends on lives here, same as the gates above —
// nothing in nasdaqPerformance.js should hardcode a constant not named here.
export const PERFORMANCE = {
  tradingDaysPerYear: 252,
  riskFreeRate: 0,              // annualized; Sharpe/Sortino computed as excess-return-over-0 for simplicity
  omegaThreshold: 0,            // gain/loss split point for the Omega ratio
  rollingSharpeWindowDays: 63,  // ~ one trading quarter
  monteCarlo: {
    resamples: 2000,            // number of bootstrap resamples of the completed-trade R sequence
    seed: 20140101,             // deterministic — same trade sequence always reproduces the same bands
    percentiles: [5, 25, 50, 75, 95],
  },
  walkForward: {
    windowCount: 4,             // split the full backtest into this many equal-length, non-overlapping sub-windows
  },
  outOfSample: {
    oosFraction: 0.2,           // final fraction of the backtest period held out and reported separately
  },
};

// ── Research module (lead-lag / feature importance) ─────────────────────────
export const RESEARCH = {
  lagRangeDays: [-30, 30],                      // tested lag range for cross-correlation studies
  forwardReturnHorizonsDays: [5, 10, 20, 60],    // forward NASDAQ return horizons tested against each driver
  correlationMethod: 'spearman',                 // rank correlation — robust to the heavy-tailed/non-normal nature of macro & return series
};
