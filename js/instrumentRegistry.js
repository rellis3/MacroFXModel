/**
 * Instrument Registry — ONE canonical instrument table. Pip size, price digits,
 * asset class and the symbol aliases (display / OANDA / Yahoo / MT5 / lowercase
 * code) were redefined in 8–10 places (server.js PIP_SIZE, js/config.js PAIRS,
 * js/volBacktestEngine.js INSTRUMENTS, asiaRangeEngine.js & rangeFibEngine.js
 * PIP_SIZE, bot/*.py _PIP_SIZES, VolRangeForecaster & portfolioBacktest Python
 * lists). A single wrong pip (0.0001 vs 0.001) silently scales PnL by 10×, so
 * this is the highest-leverage registry in the tree.
 *
 * Canonical key = the lowercase code ('eurusd', 'usdjpy', 'gold', 'nq').
 * Accessors normalise any known alias to the canonical record.
 *
 * ⚠ KNOWN DRIFTS this registry is meant to retire (documented, NOT yet rewired —
 * changing them shifts existing backtests, so adopt deliberately):
 *   • GOLD pip: 1.0 in server.js & asiaRangeEngine.js, but 0.1 in
 *     rangeFibEngine.js. Canonical here = 1.0 (matches the live/server side).
 *   • Point/pip VALUE (cash per pip per lot) currently lives ONLY in
 *     RegimeV2/regime_bot.py `_PIP_VALUES` and is not represented here — add it
 *     as a `pointValue` field once a single source is agreed.
 */

// pip = the price increment one "pip" represents. digits = display precision.
// oanda/yahoo/mt5 = venue symbols (null where not traded on that venue).
const REG = {
  // ── FX majors / USD pairs ──
  eurusd: { display: 'EUR/USD', oanda: 'EUR_USD', yahoo: 'EURUSD=X', mt5: 'EURUSD', assetClass: 'fx', pip: 0.0001, digits: 5 },
  gbpusd: { display: 'GBP/USD', oanda: 'GBP_USD', yahoo: 'GBPUSD=X', mt5: 'GBPUSD', assetClass: 'fx', pip: 0.0001, digits: 5 },
  audusd: { display: 'AUD/USD', oanda: 'AUD_USD', yahoo: 'AUDUSD=X', mt5: 'AUDUSD', assetClass: 'fx', pip: 0.0001, digits: 5 },
  nzdusd: { display: 'NZD/USD', oanda: 'NZD_USD', yahoo: 'NZDUSD=X', mt5: 'NZDUSD', assetClass: 'fx', pip: 0.0001, digits: 5 },
  usdcad: { display: 'USD/CAD', oanda: 'USD_CAD', yahoo: 'USDCAD=X', mt5: 'USDCAD', assetClass: 'fx', pip: 0.0001, digits: 5 },
  usdchf: { display: 'USD/CHF', oanda: 'USD_CHF', yahoo: 'USDCHF=X', mt5: 'USDCHF', assetClass: 'fx', pip: 0.0001, digits: 5 },
  // ── FX crosses ──
  eurgbp: { display: 'EUR/GBP', oanda: 'EUR_GBP', yahoo: 'EURGBP=X', mt5: 'EURGBP', assetClass: 'fx', pip: 0.0001, digits: 5 },
  euraud: { display: 'EUR/AUD', oanda: 'EUR_AUD', yahoo: 'EURAUD=X', mt5: 'EURAUD', assetClass: 'fx', pip: 0.0001, digits: 5 },
  eurcad: { display: 'EUR/CAD', oanda: 'EUR_CAD', yahoo: 'EURCAD=X', mt5: 'EURCAD', assetClass: 'fx', pip: 0.0001, digits: 5 },
  eurchf: { display: 'EUR/CHF', oanda: 'EUR_CHF', yahoo: 'EURCHF=X', mt5: 'EURCHF', assetClass: 'fx', pip: 0.0001, digits: 5 },
  eurnzd: { display: 'EUR/NZD', oanda: 'EUR_NZD', yahoo: 'EURNZD=X', mt5: 'EURNZD', assetClass: 'fx', pip: 0.0001, digits: 5 },
  audnzd: { display: 'AUD/NZD', oanda: 'AUD_NZD', yahoo: 'AUDNZD=X', mt5: 'AUDNZD', assetClass: 'fx', pip: 0.0001, digits: 5 },
  audcad: { display: 'AUD/CAD', oanda: 'AUD_CAD', yahoo: 'AUDCAD=X', mt5: 'AUDCAD', assetClass: 'fx', pip: 0.0001, digits: 5 },
  audchf: { display: 'AUD/CHF', oanda: 'AUD_CHF', yahoo: 'AUDCHF=X', mt5: 'AUDCHF', assetClass: 'fx', pip: 0.0001, digits: 5 },
  gbpaud: { display: 'GBP/AUD', oanda: 'GBP_AUD', yahoo: 'GBPAUD=X', mt5: 'GBPAUD', assetClass: 'fx', pip: 0.0001, digits: 5 },
  gbpcad: { display: 'GBP/CAD', oanda: 'GBP_CAD', yahoo: 'GBPCAD=X', mt5: 'GBPCAD', assetClass: 'fx', pip: 0.0001, digits: 5 },
  gbpchf: { display: 'GBP/CHF', oanda: 'GBP_CHF', yahoo: 'GBPCHF=X', mt5: 'GBPCHF', assetClass: 'fx', pip: 0.0001, digits: 5 },
  gbpnzd: { display: 'GBP/NZD', oanda: 'GBP_NZD', yahoo: 'GBPNZD=X', mt5: 'GBPNZD', assetClass: 'fx', pip: 0.0001, digits: 5 },
  // ── JPY pairs (pip = 0.01) ──
  usdjpy: { display: 'USD/JPY', oanda: 'USD_JPY', yahoo: 'USDJPY=X', mt5: 'USDJPY', assetClass: 'fx', pip: 0.01, digits: 3 },
  eurjpy: { display: 'EUR/JPY', oanda: 'EUR_JPY', yahoo: 'EURJPY=X', mt5: 'EURJPY', assetClass: 'fx', pip: 0.01, digits: 3 },
  gbpjpy: { display: 'GBP/JPY', oanda: 'GBP_JPY', yahoo: 'GBPJPY=X', mt5: 'GBPJPY', assetClass: 'fx', pip: 0.01, digits: 3 },
  audjpy: { display: 'AUD/JPY', oanda: 'AUD_JPY', yahoo: 'AUDJPY=X', mt5: 'AUDJPY', assetClass: 'fx', pip: 0.01, digits: 3 },
  cadjpy: { display: 'CAD/JPY', oanda: 'CAD_JPY', yahoo: 'CADJPY=X', mt5: 'CADJPY', assetClass: 'fx', pip: 0.01, digits: 3 },
  chfjpy: { display: 'CHF/JPY', oanda: 'CHF_JPY', yahoo: 'CHFJPY=X', mt5: 'CHFJPY', assetClass: 'fx', pip: 0.01, digits: 3 },
  nzdjpy: { display: 'NZD/JPY', oanda: 'NZD_JPY', yahoo: 'NZDJPY=X', mt5: 'NZDJPY', assetClass: 'fx', pip: 0.01, digits: 3 },
  // ── Commodity ──
  gold:   { display: 'XAU/USD', oanda: 'XAU_USD', yahoo: 'GC=F', mt5: 'XAUUSD', assetClass: 'commodity', pip: 1.0, digits: 2 },
  // ── Index CFDs (pip = 1.0 point) ──
  nq:     { display: 'NAS100_USD', oanda: 'NAS100_USD', yahoo: 'NQ=F',   mt5: 'USTECH100M', assetClass: 'index', pip: 1.0, digits: 1 },
  spx:    { display: 'SPX500_USD', oanda: 'SPX500_USD', yahoo: '^GSPC',  mt5: 'SP500',      assetClass: 'index', pip: 1.0, digits: 1 },
  dax:    { display: 'DE30_USD',   oanda: 'DE30_EUR',   yahoo: '^GDAXI', mt5: 'GER40',      assetClass: 'index', pip: 1.0, digits: 1 },  // OANDA quotes DAX in EUR (DE30_USD has no candles → "no D1 bars"); display kept for back-compat
  ftse:   { display: 'UK100_GBP',  oanda: 'UK100_GBP',  yahoo: '^FTSE',  mt5: 'UK100',      assetClass: 'index', pip: 1.0, digits: 1 },
  dow:    { display: 'US30_USD',   oanda: 'US30_USD',   yahoo: '^DJI',   mt5: 'US30',       assetClass: 'index', pip: 1.0, digits: 1 },
  rut:    { display: 'US2000_USD', oanda: 'US2000_USD', yahoo: '^RUT',   mt5: 'US2000',     assetClass: 'index', pip: 1.0, digits: 1 },
};

// Alias index: any known symbol form → canonical key. Built once.
// Short names used by the per-line book / vol-forecast export that aren't a venue
// field on the canonical record (e.g. 'spx500'→spx, 'de30'→dax). Without these the
// volatility-bot producer would silently drop those index survivors. Exported so
// the JS→JSON generator applies the SAME extras (one source, both languages).
export const EXTRA_ALIASES = { spx500: 'spx', us500: 'spx', de30: 'dax', ger40: 'dax', nas100: 'nq', ndx: 'nq' };

const ALIAS = (() => {
  const m = new Map();
  for (const [key, r] of Object.entries(REG)) {
    const add = s => { if (s) m.set(String(s).toLowerCase(), key); };
    add(key);
    add(r.display);
    add(r.display.replace('/', ''));   // EURUSD
    add(r.oanda);
    add(r.oanda.replace('_', ''));
    add(r.yahoo);
    add(r.mt5);
  }
  for (const [a, key] of Object.entries(EXTRA_ALIASES)) {
    if (REG[key] && !m.has(a)) m.set(a, key);
  }
  return m;
})();

export const INSTRUMENT_KEYS = Object.keys(REG);

// Resolve any alias (case-insensitive) to its canonical key, or null.
export function resolveKey(symbol) {
  if (!symbol) return null;
  return ALIAS.get(String(symbol).toLowerCase()) ?? null;
}

// Full canonical record for any alias (throws on unknown — fail loud, never
// silently default a pip size).
export function instrument(symbol) {
  const key = resolveKey(symbol);
  if (!key) throw new Error(`instrumentRegistry: unknown instrument "${symbol}"`);
  return { key, ...REG[key] };
}

export const pipSize     = s => instrument(s).pip;
export const priceDigits = s => instrument(s).digits;
export const assetClass  = s => instrument(s).assetClass;
export const oandaSymbol = s => instrument(s).oanda;
export const yahooSymbol = s => instrument(s).yahoo;
export const mt5Symbol   = s => instrument(s).mt5;

export { REG as INSTRUMENTS };
