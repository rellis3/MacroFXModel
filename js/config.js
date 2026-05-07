export const PAIRS = [
  { symbol: 'EUR/USD', code: 'eu', shortCode: 'de', name: 'EUR/USD' },
  { symbol: 'GBP/USD', code: 'gu', shortCode: 'gb', name: 'GBP/USD' },
  { symbol: 'USD/JPY', code: 'uj', shortCode: 'jp', name: 'USD/JPY', isSafeHaven: true, isUsdBase: true },
  { symbol: 'AUD/USD', code: 'au', shortCode: 'au', name: 'AUD/USD' },
  { symbol: 'XAU/USD', code: 'xu', shortCode: 'xau', name: 'Gold', isGold: true },
  { symbol: 'EUR/GBP', code: 'eg', shortCode: 'gb', name: 'EUR/GBP', isPairCross: true },
  { symbol: 'USD/CAD', code: 'uc', shortCode: 'ca', name: 'USD/CAD', isUsdBase: true },
  { symbol: 'USD/CHF', code: 'uf', shortCode: 'ch', name: 'USD/CHF', isUsdBase: true, isSafeHaven: true },
  { symbol: 'GBP/JPY', code: 'gj', shortCode: 'jp', name: 'GBP/JPY', isPairCross: true, isSafeHaven: true },
];

// 45 Fib levels matching Pine Script backtester exactly.
export const FIB_LEVELS = [
  -10.5,-10,-9.5,-9,-8.5,-8,-7.5,-7,-6.5,-6,-5.5,-5,-4.5,-4,-3.5,-3,-2.5,-2,-1.5,-1,
  -0.75,-0.5,-0.25,
  0,0.25,0.5,0.75,
  1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10,10.5
];

export const CACHE_DURATION = {
  FRED:     12 * 60 * 60 * 1000,
  OHLC:     23 * 60 * 60 * 1000,
  OHLC5M:   18 * 60 * 60 * 1000,
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
  'GBP/JPY': { short: 'gb_short', long: 'gb10y',  label: 'GB–JP',  fxSign: +1, crossBase: 'jp10y', crossBaseShort: 'jp_short' },
};

export const COMPASS_TTL = 6 * 60 * 60 * 1000;
// Increment when cached data structure changes to force re-fetch.
export const COMPASS_CACHE_VERSION = 4;

export const CAP_DEFAULTS = {
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
  updatedAt: null,
};

export const AI_CACHE_PREFIX = 'ai_';
export const AI_CACHE_TTL = 60 * 60 * 1000;
