/**
 * Assemble the chain-node series the Market State Engine reads, from the raw payloads of existing
 * endpoints. Pure: the caller fetches. Same rules as today.html chainVals() (2026-10-31), moved here so
 * the server and any page build the series ONE way. Tested in js/stateEngine.test.mjs.
 *
 * Inputs (each optional; a missing input leaves its nodes unmeasured):
 *   fredHist   — /api/fredhistory payload: { us10y:[{date,value}], us2y, us30y, tips, bei, dxy, vix, hy, sofr, iorb, ioer, ... }
 *   ohlc       — { <nodeKey>: /api/ohlc payload } for CHAIN_OHLC instruments ({ values:[{datetime|time, close}] })
 *   intlYields — /api/intl-yields `.series`: { gb10y, de10y, jp10y: [{date,value}] }
 *   chainExtra — /api/chain-extra `.series`: { smh, xle, xlre, move, ccc, emdollar, emoas: [{date,value}] }
 *   crack      — /api/crack `.series`: [{date,value}]
 */

/** OANDA instruments behind the price nodes (today.html CHAIN_OHLC). */
export const CHAIN_OHLC = {
  oil: 'WTICO_USD', gold: 'XAU_USD', copper: 'XCU_USD', audusd: 'AUD_USD', usdcad: 'USD_CAD', usdjpy: 'USD_JPY',
  btc: 'BTC_USD', nq: 'NAS100_USD', spx: 'SPX500_USD', gbpusd: 'GBP_USD', eurusd: 'EUR_USD',
};

/** Keyless fallback for the price nodes when OANDA is not configured or fails: Yahoo daily (labelled as such). */
export const YAHOO_FALLBACK = {
  oil: 'CL=F', gold: 'GC=F', copper: 'HG=F', audusd: 'AUDUSD=X', usdcad: 'CAD=X', usdjpy: 'JPY=X', btc: 'BTC-USD',
  nq: '^NDX', spx: '^GSPC', gbpusd: 'GBPUSD=X', eurusd: 'EURUSD=X',
};

/** FRED short keys → chain node (today.html fredSrc). */
export const FRED_NODES = { bei: 'bei', us2y: 'us2y', us10y: 'us10y', us30y: 'us30y', real: 'tips', dxy: 'dxy', vix: 'vix', hy: 'hy' };
export const FRED_KEYS = ['us10y', 'us2y', 'us30y', 'tips', 'bei', 'vix', 'vix3m', 'dxy', 'hy', 'ig', 'sofr', 'iorb', 'ioer', 'tp10', 'fy10'];

const num = v => (v == null || v === '' ? null : Number(v));
const asc = pts => (Array.isArray(pts) ? pts : [])
  .map(p => ({ date: String(p.date ?? '').slice(0, 10), value: num(p.value) }))
  .filter(p => p.date && Number.isFinite(p.value))
  .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

/**
 * OANDA daily candles are stamped by their OPEN (17:00 New York, the evening before the session), so a
 * candle dated D is the D+1 trading day (checked against FRED DCOILWTICO in today.html).
 */
export function ohlcToSessionSeries(payload) {
  const next = d => { const t = Date.parse(d + 'T00:00:00Z'); return Number.isFinite(t) ? new Date(t + 864e5).toISOString().slice(0, 10) : ''; };
  return (payload?.values ?? [])
    .map(v => ({ date: next(String(v.datetime ?? v.time ?? '').slice(0, 10)), value: num(v.close) }))
    .filter(v => v.date && Number.isFinite(v.value))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** SOFR minus the Fed's floor (IORB; IOER before 2021-07-29), carrying the last floor forward. */
export function fundingSpread(sofr, iorb, ioer) {
  const s = asc(sofr); if (!s.length) return [];
  const fl = new Map([...asc(ioer).map(p => [p.date, p.value]), ...asc(iorb).map(p => [p.date, p.value])]);
  if (!fl.size) return [];
  let floor = null; const out = [];
  for (const p of s) { if (fl.has(p.date)) floor = fl.get(p.date); if (floor != null) out.push({ date: p.date, value: p.value - floor }); }
  return out;
}

/** Foreign 10Y minus the Treasury 10Y on common dates. */
export function yieldGap(foreign, ust) {
  const by = new Map(asc(ust).map(p => [p.date, p.value]));
  return asc(foreign).filter(p => by.has(p.date)).map(p => ({ date: p.date, value: p.value - by.get(p.date) }));
}

/**
 * prices — { <nodeKey>: [{date, close|value}] } already session-dated (e.g. server fetchD1, New York-close bars
 *          dated by trading session). Takes precedence over `ohlc` for the same node.
 */
export function assembleChainSeries({ fredHist = null, ohlc = {}, prices = {}, intlYields = null, chainExtra = null, crack = null } = {}) {
  const out = {}, src = {};
  const put = (k, pts, s) => { if (Array.isArray(pts) && pts.length >= 3) { out[k] = pts; src[k] = s; } };
  for (const [node, key] of Object.entries(FRED_NODES)) put(node, asc(fredHist?.[key]), `FRED ${key}`);
  for (const [node, sym] of Object.entries(CHAIN_OHLC)) {
    if (Array.isArray(prices?.[node]) && prices[node].length) put(node, asc(prices[node].map(b => ({ date: b.date, value: b.value ?? b.close }))), `OANDA ${sym} (NY-close daily)`);
    else put(node, ohlcToSessionSeries(ohlc?.[node]), `OANDA ${sym}`);
  }
  put('funding', fundingSpread(fredHist?.sofr, fredHist?.iorb, fredHist?.ioer), 'FRED SOFR − IORB/IOER');
  for (const [node, key] of [['giltgap', 'gb10y'], ['bundgap', 'de10y'], ['jgbgap', 'jp10y']]) put(node, yieldGap(intlYields?.[key], fredHist?.us10y), `${key} − US 10Y`);
  for (const node of ['smh', 'xle', 'xlre', 'move', 'ccc', 'emdollar', 'emoas']) {
    const pts = asc(chainExtra?.[node]); if (pts.length > 20) put(node, pts, `chain-extra ${node}`);
  }
  put('crack', asc(crack), 'crack 3-2-1');
  return { series: out, sources: src };
}
