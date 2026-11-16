// js/terminal/insightSeries.js: what each series in the daily market bundle (/api/drill-series: { dates, series: { key: [num|null] } }) IS, for the
// Insight tab's boards. Pure data. `kind` says how a move is measured: 'rate' = a difference in the series' own units (yields, spreads, a breakeven),
// 'ratio' = a log change (prices and volatility indices, which move in proportion). `level` says whether where the series sits in its own history is
// itself worth ranking (a yield, a spread or a volatility index is read by its level; an index price that trends up is not, so only its moves count).
// `go` is where a click goes: a Macro board id, or an instrument key for the Pair page. Labels are plain words, never a series code.
//
// Rule: a series the bundle does not carry is simply absent from the board; a series in the bundle with no row here is shown under Other with its key,
// and insightSeries.test.mjs lists those so the table is kept up to date.

export const GROUPS = {
  rates: 'Rates', credit: 'Credit', vol: 'Volatility', fx: 'Currencies', index: 'Equity indices', sector: 'US sectors', stock: 'Big shares', commodity: 'Commodities', crypto: 'Crypto', other: 'Other',
};
const R = 'rate', X = 'ratio';
const row = (key, label, group, kind, level, go, unit = '') => ({ key, label, group, kind, level, go, unit });

export const SERIES = [
  row('us2y', 'US 2-year yield', 'rates', R, true, 'panel.macro.globalyields', '%'), row('us5y', 'US 5-year yield', 'rates', R, true, 'panel.macro.globalyields', '%'),
  row('us10y', 'US 10-year yield', 'rates', R, true, 'panel.macro.globalyields', '%'), row('us30y', 'US 30-year yield', 'rates', R, true, 'panel.macro.globalyields', '%'),
  row('tips', 'US 10-year real yield', 'rates', R, true, 'panel.macro.globalyields', '%'), row('bei', 'US 10-year breakeven inflation', 'rates', R, true, 'panel.macro.inflation', '%'),
  row('move', 'Bond volatility (MOVE)', 'rates', X, true, 'panel.macro.vol'),
  row('hy', 'High-yield credit spread', 'credit', R, true, 'panel.macro.creditspreads', 'pp'), row('ig', 'Investment-grade credit spread', 'credit', R, true, 'panel.macro.creditspreads', 'pp'),
  row('ccc', 'CCC credit spread', 'credit', R, true, 'panel.macro.creditspreads', 'pp'),
  row('vix', 'VIX (S&P 500 implied vol)', 'vol', X, true, 'panel.macro.vol'), row('vix9d', 'VIX 9-day', 'vol', X, true, 'panel.macro.vol'), row('vix3m', 'VIX 3-month', 'vol', X, true, 'panel.macro.vol'),
  row('vix6m', 'VIX 6-month', 'vol', X, true, 'panel.macro.vol'), row('vvix', 'Volatility of VIX (VVIX)', 'vol', X, true, 'panel.macro.vol'), row('skew', 'SKEW (tail-risk price)', 'vol', X, true, 'panel.macro.skewhist'),
  row('vxn', 'Nasdaq implied vol (VXN)', 'vol', X, true, 'panel.macro.vol'), row('rvx', 'Russell 2000 implied vol (RVX)', 'vol', X, true, 'panel.macro.vol'),
  row('cor1m', 'Implied correlation, 1 month', 'vol', X, true, 'panel.macro.vol'), row('cor3m', 'Implied correlation, 3 months', 'vol', X, true, 'panel.macro.vol'),
  row('vixeq', 'Single-stock implied vol (VIXEQ)', 'vol', X, true, 'panel.macro.vol'), row('ovx', 'Oil implied vol (OVX)', 'vol', X, true, 'panel.macro.vol'),
  row('gvz', 'Gold implied vol (GVZ)', 'vol', X, true, 'panel.macro.vol'), row('dspx', 'Dispersion index (DSPX)', 'vol', X, true, 'panel.macro.vol'),
  row('dxy', 'US dollar index', 'fx', X, true, null),
  row('eurusd', 'EUR/USD', 'fx', X, false, 'EURUSD'), row('gbpusd', 'GBP/USD', 'fx', X, false, 'GBPUSD'), row('usdjpy', 'USD/JPY', 'fx', X, false, 'USDJPY'), row('audusd', 'AUD/USD', 'fx', X, false, 'AUDUSD'),
  row('nzdusd', 'NZD/USD', 'fx', X, false, 'NZDUSD'), row('usdcad', 'USD/CAD', 'fx', X, false, 'USDCAD'), row('usdchf', 'USD/CHF', 'fx', X, false, 'USDCHF'), row('eurjpy', 'EUR/JPY', 'fx', X, false, 'EURJPY'),
  row('audjpy', 'AUD/JPY', 'fx', X, false, 'AUDJPY'), row('eurgbp', 'EUR/GBP', 'fx', X, false, 'EURGBP'),
  row('nq', 'Nasdaq 100', 'index', X, false, 'NQ'), row('spx', 'S&P 500', 'index', X, false, 'SPX500'), row('r2k', 'Russell 2000', 'index', X, false, 'US2000'), row('de30', 'German DAX', 'index', X, false, 'DE30'),
  row('uk100', 'UK FTSE 100', 'index', X, false, 'UK100'), row('jp225', 'Japan Nikkei 225', 'index', X, false, null), row('spy', 'S&P 500 ETF (SPY)', 'index', X, false, 'SPX500'),
  row('rsp', 'S&P 500 equal-weight ETF', 'index', X, false, 'SPX500'), row('smh', 'Semiconductor ETF', 'index', X, false, 'NQ'),
  row('xlf', 'Financials', 'sector', X, false, null), row('xlk', 'Technology', 'sector', X, false, null), row('xle', 'Energy', 'sector', X, false, null), row('xlv', 'Health care', 'sector', X, false, null),
  row('xli', 'Industrials', 'sector', X, false, null), row('xlp', 'Consumer staples', 'sector', X, false, null), row('xlu', 'Utilities', 'sector', X, false, null), row('xly', 'Consumer discretionary', 'sector', X, false, null),
  row('xlb', 'Materials', 'sector', X, false, null), row('xlc', 'Communication services', 'sector', X, false, null), row('xlre', 'Real estate', 'sector', X, false, null),
  row('nvda', 'Nvidia', 'stock', X, false, null), row('aapl', 'Apple', 'stock', X, false, null), row('msft', 'Microsoft', 'stock', X, false, null), row('meta', 'Meta', 'stock', X, false, null),
  row('amzn', 'Amazon', 'stock', X, false, null), row('googl', 'Alphabet', 'stock', X, false, null), row('tsla', 'Tesla', 'stock', X, false, null), row('avgo', 'Broadcom', 'stock', X, false, null),
  row('lly', 'Eli Lilly', 'stock', X, false, null), row('jpm', 'JPMorgan', 'stock', X, false, null), row('xom', 'Exxon Mobil', 'stock', X, false, null), row('brk', 'Berkshire Hathaway', 'stock', X, false, null),
  row('gold', 'Gold', 'commodity', X, false, 'GOLD'), row('silver', 'Silver', 'commodity', X, false, 'SILVER'), row('platinum', 'Platinum', 'commodity', X, false, 'PLATINUM'), row('copper', 'Copper', 'commodity', X, false, 'COPPER'),
  row('oil', 'WTI oil', 'commodity', X, false, 'WTI'), row('brent', 'Brent oil', 'commodity', X, false, 'BRENT'), row('natgas', 'Natural gas', 'commodity', X, false, 'NATGAS'),
  row('btc', 'Bitcoin', 'crypto', X, false, 'BTCUSD'),
];
export const BY_KEY = Object.fromEntries(SERIES.map(s => [s.key, s]));
/** A series in the bundle that has no row above is shown, not hidden: a plain move measure and its key as its name. */
export const metaFor = key => BY_KEY[key] ?? row(key, key, 'other', X, false, null);

/** The eleven US sector ETFs, in the order the rotation board draws them. */
export const SECTORS = ['xlk', 'xlc', 'xly', 'xlf', 'xli', 'xlb', 'xle', 'xlv', 'xlp', 'xlu', 'xlre'];
