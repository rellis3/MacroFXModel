export const PAIRS = [
  { symbol: 'EUR/USD',    code: 'eu',  shortCode: 'de',  name: 'EUR/USD' },
  { symbol: 'GBP/USD',    code: 'gu',  shortCode: 'gb',  name: 'GBP/USD' },
  { symbol: 'USD/JPY',    code: 'uj',  shortCode: 'jp',  name: 'USD/JPY', isSafeHaven: true, isUsdBase: true },
  { symbol: 'AUD/USD',    code: 'au',  shortCode: 'au',  name: 'AUD/USD' },
  { symbol: 'XAU/USD',    code: 'xu',  shortCode: 'xau', name: 'Gold', isGold: true },
  { symbol: 'EUR/GBP',    code: 'eg',  shortCode: 'gb',  name: 'EUR/GBP', isPairCross: true },
  { symbol: 'USD/CAD',    code: 'uc',  shortCode: 'ca',  name: 'USD/CAD', isUsdBase: true },
  { symbol: 'USD/CHF',    code: 'uf',  shortCode: 'ch',  name: 'USD/CHF', isUsdBase: true, isSafeHaven: true },
  { symbol: 'GBP/JPY',    code: 'gj',  shortCode: 'jp',  name: 'GBP/JPY', isPairCross: true, isSafeHaven: true },
  { symbol: 'EUR/JPY',    code: 'ej',  shortCode: 'jp',  name: 'EUR/JPY', isPairCross: true },
  { symbol: 'EUR/CHF',    code: 'ef',  shortCode: 'ch',  name: 'EUR/CHF', isPairCross: true, isSafeHaven: true },
  { symbol: 'GBP/CHF',    code: 'gf',  shortCode: 'ch',  name: 'GBP/CHF', isPairCross: true },
  { symbol: 'AUD/JPY',    code: 'aj',  shortCode: 'jp',  name: 'AUD/JPY', isPairCross: true },
  { symbol: 'CAD/JPY',    code: 'cj',  shortCode: 'jp',  name: 'CAD/JPY', isPairCross: true },
  { symbol: 'NAS100_USD', code: 'nas', shortCode: 'nas', name: 'NAS100', isEquity: true },
];

// 45 Fib levels — exact match to Pine Script indicator.
export const FIB_LEVELS = [
  -9.5,-9,-8.5,-8,-7.5,-7,-6.5,-6,-5.5,-5,-4.5,-4,-3.5,-3,-2.5,-2,-1.5,-1,
  -0.5,-0.25,
  0,0.25,0.5,0.75,
  1,1.25,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10,10.5
];

export const CACHE_DURATION = {
  FRED:     12 * 60 * 60 * 1000,
  OHLC:     23 * 60 * 60 * 1000,
  OHLC5M:   30 * 60 * 1000,  // 30 min — refreshQuote() handles within-session bar updates
  OHLC30M:  23 * 60 * 60 * 1000,
  QUOTE:     5 * 60 * 1000,
  EVENTS:    4 * 60 * 60 * 1000,  // Finnhub economic calendar — refresh every 4h
  SURPRISE: 24 * 60 * 60 * 1000,  // Macro surprise index — daily
};

// Per-pair config for Macro Compass yield spread chart.
// fxSign: +1 = higher spread → pair bullish, -1 = higher spread → pair bearish.
export const COMPASS_CONFIG = {
  'EUR/USD': { short: 'de_short', long: 'de10y',  label: 'US–DE',  fxSign: -1 },
  'GBP/USD': { short: 'gb_short', long: 'gb10y',  label: 'GB–US',  fxSign: +1 },
  'USD/JPY': { short: 'jp_short', long: 'jp10y',  label: 'US–JP',  fxSign: +1 },
  'AUD/USD': { short: 'au_short', long: 'au10y',  label: 'AU–US',  fxSign: +1 },
  'XAU/USD': { short: null,       long: 'us10y',  label: 'US10Y',  fxSign: -1, dxy: true },
  'EUR/GBP': { short: 'gb_short', long: 'gb10y',  label: 'GB–DE',  fxSign: -1, crossBase: 'de10y', crossBaseShort: 'de_short' },
  'USD/CAD': { short: 'ca_short', long: 'ca10y',  label: 'US–CA',  fxSign: +1 },
  'USD/CHF': { short: 'ch_short', long: 'ch10y',  label: 'US–CH',  fxSign: +1 },
  'GBP/JPY':    { short: 'gb_short', long: 'gb10y',  label: 'GB–JP',  fxSign: +1, crossBase: 'jp10y', crossBaseShort: 'jp_short' },
  'EUR/JPY':    { short: 'de_short', long: 'de10y',  label: 'DE–JP',  fxSign: +1, crossBase: 'jp10y', crossBaseShort: 'jp_short' },
  'EUR/CHF':    { short: 'de_short', long: 'de10y',  label: 'DE–CH',  fxSign: +1, crossBase: 'ch10y', crossBaseShort: 'ch_short' },
  'GBP/CHF':    { short: 'gb_short', long: 'gb10y',  label: 'GB–CH',  fxSign: +1, crossBase: 'ch10y', crossBaseShort: 'ch_short' },
  'AUD/JPY':    { short: 'au_short', long: 'au10y',  label: 'AU–JP',  fxSign: +1, crossBase: 'jp10y', crossBaseShort: 'jp_short' },
  'CAD/JPY':    { short: 'ca_short', long: 'ca10y',  label: 'CA–JP',  fxSign: +1, crossBase: 'jp10y', crossBaseShort: 'jp_short' },
  'NAS100_USD': { short: null, long: null, label: 'Yield Curve', fxSign: 1, isEquity: true },
};

export const COMPASS_TTL = 6 * 60 * 60 * 1000;
// Increment when cached data structure changes to force re-fetch.
export const COMPASS_CACHE_VERSION = 5;

export const CAP_DEFAULTS = {
  // Global confluence mode — applies to all instruments and all consumers
  // (dashboard, backtest, telegram alerts).
  // confluencePriceMode: where to draw when two fibs are confluent
  //   'midpoint' = average (current default), 'lowest' = Pine Script default, 'highest'
  // clusterMerge: true = collapse nearby pairs into one level (current default)
  //               false = Pine Script mode, one line per qualifying pair
  confluencePriceMode: 'lowest',
  clusterMerge: true,
  slMaxAtrMult: 0.5,  // structural SL cap: won't exceed this multiple of daily ATR

  fx: {
    confluencePips: 2,    // max pip distance for two Fibs to count as a confluence
    mergeFactor:    0.30, // fraction of confluencePips used to cluster nearby raw pairs
    asiaMinPips:           15,   // min Asia range in pips to enable daily Fib retracement matching
    structuralLookbackDays: 30,  // days of 30m history for structural fib sweep
    structuralPivotN:       5,   // N-bar pivot: high must dominate N bars each side
    oiAtrFrac: 0.12, oiPipCap: 10,
    pivAtrFrac: 0.10, pivPipCap: 8,
    rngAtrFrac: 0.08, rngPipCap: 6,
    gexAtrFrac: 0.15, gexPipCap: 12,
    enhPivAtrFrac: 0.10, enhPivPipCap: 8,
  },
  gold: {
    confluencePips: 200,  // gold pips ($0.10 each) — 200 pips = $20
    mergeFactor:    0.30, // 30% of $20 = $6 merge radius — collapses near-duplicate levels
    asiaMinPips:           150,  // gold pips — 150 = $15 min Asia range
    structuralLookbackDays: 30,  // days of 30m history for structural fib sweep
    structuralPivotN:       5,   // N-bar pivot lookback
    // Dollar caps for gold — not pip units (gold pip=$0.10 makes pip caps too tight)
    oiAtrFrac: 0.12, oiPipCap: 8,
    pivAtrFrac: 0.10, pivPipCap: 6,
    rngAtrFrac: 0.08, rngPipCap: 5,
    gexAtrFrac: 0.15, gexPipCap: 10,
    enhPivAtrFrac: 0.10, enhPivPipCap: 6,
  },
  nas100: {
    confluencePips: 100,  // 100 points threshold (~0.5% at 20000)
    mergeFactor:    0.30, // 30% of 100 = 30 point merge radius
    asiaMinPips:           50,   // 50 points min overnight range
    structuralLookbackDays: 30,
    structuralPivotN:       5,
    oiAtrFrac: 0.12, oiPipCap: 200,
    pivAtrFrac: 0.10, pivPipCap: 150,
    rngAtrFrac: 0.08, rngPipCap: 100,
    gexAtrFrac: 0.15, gexPipCap: 250,
    enhPivAtrFrac: 0.10, enhPivPipCap: 150,
  },
  updatedAt: null,
};

// 5-minute z-score regime bias tier (T8) configuration.
// longScore:  score added to bias when z-score < -threshold (oversold → long weight)
// shortScore: score subtracted when z-score > +threshold (overbought → short weight)
// lookback:   number of closed 5m bars used for mean/σ (20 bars ≈ 1h40m)
// threshold:  absolute z-score needed to trigger a signal (default ±1.0σ)
export const ZSCORE5M_DEFAULTS = {
  lookback:    20,
  threshold:   1.0,
  longScore:   1,
  shortScore:  1,
};

// Kalman filter deviation bias tier (T8) — replaces raw z-score.
// processNoise (Q) and observNoise (R) are expressed as fractions of the
// data variance so the filter is scale-independent across instruments.
// Lower Q → slower state evolution (smoother).  Higher R → trust filter more.
export const KALMAN5M_DEFAULTS = {
  lookback:     40,   // closed 5m bars to run the filter over
  processNoise: 0.01, // Q fraction of variance — lower = smoother tracking
  observNoise:  0.10, // R fraction of variance — higher = trust filtered state
  threshold:    1.5,  // normalised deviation σ that triggers a score
  longScore:    1,
  shortScore:   1,
};

export const AI_CACHE_PREFIX = 'ai_';
export const AI_CACHE_TTL = 60 * 60 * 1000;

// ── Feature flags ─────────────────────────────────────────────────────────────
// Toggle experimental features without reverting code. Set to false to fall back
// to the previous behaviour. Changes take effect on the next page load.
export const FEATURE_FLAGS = {
  // PCA-inspired tier decorrelation (suggestion #10).
  // Discounts correlated tier pairs (T1↔T3, T2↔T4 etc.) to reduce double-counting.
  // Disable to revert to raw additive sum.
  PCA_DECORRELATION: true,

  // Client-side bootstrap particle filter for 5m regime estimation (suggestion #7).
  // When true, the particle filter output is shown next to the server-side HMM pill.
  // Disable to hide PF and rely solely on the server HMM.
  PARTICLE_FILTER: true,
};

// Typical bid/ask spreads in pips for session quality classification.
// XAU/USD unit is dollars (pip size = 1.0 in the spread endpoint).
export const TYPICAL_SPREADS = {
  'EUR/USD': 0.4,
  'GBP/USD': 0.6,
  'USD/JPY': 0.5,
  'AUD/USD': 0.6,
  'XAU/USD': 0.25,
  'EUR/GBP': 0.5,
  'USD/CAD': 0.6,
  'USD/CHF': 0.6,
  'GBP/JPY': 0.9,
  'EUR/JPY': 0.7,
  'EUR/CHF': 1.0,
  'GBP/CHF': 1.5,
  'AUD/JPY': 1.2,
  'CAD/JPY': 1.5,
};
