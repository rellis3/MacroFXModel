/**
 * COT at full depth (plans/DATA_ASSET_MAP.md §4 B8).
 *
 * The live COT reads (_worker.js /api/cot-extremes) fetch a deliberate 156-week window: the 3-year spec the percentiles
 * are defined on. That stays. This module pulls EVERY weekly report for the same 36 markets (TFF from 2006-06, the
 * Disaggregated report from 2006) and keeps the position, trader-count and open-interest columns, so the full history
 * lives in R2 (archive/tables/cot/<sym>.json) instead of only on a laptop. Values are as CFTC publishes them
 * (no pair-terms flip here; `flip` records which markets the live reads invert — see COT_WEEKLY_README.md).
 *
 * The market list mirrors _worker.js DISAGG / TFF; js/cotArchive.test.mjs fails if they drift apart.
 */
export const CFTC_BASE = 'https://publicreporting.cftc.gov/resource';

export const COT_MARKETS = [
  { sym: 'EUR', group: 'fx', dataset: 'gpe5-46if', flip: false, names: ['EURO FX - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'GBP', group: 'fx', dataset: 'gpe5-46if', flip: false, names: ['BRITISH POUND - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'JPY', group: 'fx', dataset: 'gpe5-46if', flip: true, names: ['JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'AUD', group: 'fx', dataset: 'gpe5-46if', flip: false, names: ['AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'CAD', group: 'fx', dataset: 'gpe5-46if', flip: true, names: ['CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'CHF', group: 'fx', dataset: 'gpe5-46if', flip: true, names: ['SWISS FRANC - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'NZD', group: 'fx', dataset: 'gpe5-46if', flip: false, names: ['NZ DOLLAR - CHICAGO MERCANTILE EXCHANGE', 'NEW ZEALAND DOLLAR - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'MXN', group: 'fx', dataset: 'gpe5-46if', flip: false, names: ['MEXICAN PESO - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'USD', group: 'fx', dataset: 'gpe5-46if', flip: false, names: ['USD INDEX - ICE FUTURES U.S.', 'U.S. DOLLAR INDEX - ICE FUTURES U.S.'] },
  { sym: 'NQ', group: 'equities', dataset: 'gpe5-46if', flip: false, names: ['NASDAQ MINI - CHICAGO MERCANTILE EXCHANGE', 'NASDAQ-100 MINI - CHICAGO MERCANTILE EXCHANGE', 'E-MINI NASDAQ-100 - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'ES', group: 'equities', dataset: 'gpe5-46if', flip: false, names: ['E-MINI S&P 500 - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'YM', group: 'equities', dataset: 'gpe5-46if', flip: false, names: ['DJIA x $5 - CHICAGO BOARD OF TRADE'] },
  { sym: 'RTY', group: 'equities', dataset: 'gpe5-46if', flip: false, names: ['RUSSELL E-MINI - CHICAGO MERCANTILE EXCHANGE', 'E-MINI RUSSELL 2000 - CHICAGO MERCANTILE EXCHANGE', 'RUSSELL 2000 MINI INDEX FUTURES - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'TY', group: 'rates', dataset: 'gpe5-46if', flip: false, names: ['UST 10Y NOTE - CHICAGO BOARD OF TRADE', '10-YEAR U.S. TREASURY NOTES - CHICAGO BOARD OF TRADE', 'ULTRA UST 10Y - CHICAGO BOARD OF TRADE'] },
  { sym: 'US', group: 'rates', dataset: 'gpe5-46if', flip: false, names: ['UST BOND - CHICAGO BOARD OF TRADE', '30-YEAR TREASURY BONDS - CHICAGO BOARD OF TRADE', 'U.S. TREASURY BONDS - CHICAGO BOARD OF TRADE'] },
  { sym: 'TU', group: 'rates', dataset: 'gpe5-46if', flip: false, names: ['UST 2Y NOTE - CHICAGO BOARD OF TRADE', '2-YEAR U.S. TREASURY NOTES - CHICAGO BOARD OF TRADE'] },
  { sym: 'BTC', group: 'crypto', dataset: 'gpe5-46if', flip: false, names: ['BITCOIN - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'GOLD', group: 'metals', dataset: '72hh-3qpy', flip: false, names: ['GOLD - COMMODITY EXCHANGE INC.'] },
  { sym: 'SILVER', group: 'metals', dataset: '72hh-3qpy', flip: false, names: ['SILVER - COMMODITY EXCHANGE INC.'] },
  { sym: 'COPPER', group: 'metals', dataset: '72hh-3qpy', flip: false, names: ['COPPER- #1 - COMMODITY EXCHANGE INC.', 'COPPER-GRADE #1 - COMMODITY EXCHANGE INC.', 'COPPER - COMMODITY EXCHANGE INC.'] },
  { sym: 'PLAT', group: 'metals', dataset: '72hh-3qpy', flip: false, names: ['PLATINUM - NEW YORK MERCANTILE EXCHANGE'] },
  { sym: 'PALL', group: 'metals', dataset: '72hh-3qpy', flip: false, names: ['PALLADIUM - NEW YORK MERCANTILE EXCHANGE'] },
  { sym: 'WTI', group: 'energy', dataset: '72hh-3qpy', flip: false, names: ['WTI-PHYSICAL - NEW YORK MERCANTILE EXCHANGE', 'CRUDE OIL, LIGHT SWEET - NEW YORK MERCANTILE EXCHANGE', 'WTI FINANCIAL CRUDE OIL - NEW YORK MERCANTILE EXCHANGE'] },
  { sym: 'BRENT', group: 'energy', dataset: '72hh-3qpy', flip: false, names: ['BRENT LAST DAY - NEW YORK MERCANTILE EXCHANGE', 'BRENT CRUDE OIL LAST DAY - ICE FUTURES EUROPE', 'BRENT LAST DAY FINANCIAL - ICE FUTURES EUROPE', 'BRENT CRUDE OIL - ICE FUTURES EUROPE'] },
  { sym: 'NATGAS', group: 'energy', dataset: '72hh-3qpy', flip: false, names: ['HENRY HUB - NEW YORK MERCANTILE EXCHANGE', 'NAT GAS NYME - NEW YORK MERCANTILE EXCHANGE', 'NATURAL GAS - NEW YORK MERCANTILE EXCHANGE', 'HENRY HUB LAST DAY FIN - NEW YORK MERCANTILE EXCHANGE'] },
  { sym: 'RBOB', group: 'energy', dataset: '72hh-3qpy', flip: false, names: ['GASOLINE RBOB - NEW YORK MERCANTILE EXCHANGE', 'GASOLINE BLENDSTOCK (RBOB) - NEW YORK MERCANTILE EXCHANGE', 'NY HARBOR RBOB GASOLINE - NEW YORK MERCANTILE EXCHANGE'] },
  { sym: 'CORN', group: 'grains', dataset: '72hh-3qpy', flip: false, names: ['CORN - CHICAGO BOARD OF TRADE'] },
  { sym: 'WHEAT', group: 'grains', dataset: '72hh-3qpy', flip: false, names: ['WHEAT-SRW - CHICAGO BOARD OF TRADE'] },
  { sym: 'SOYS', group: 'grains', dataset: '72hh-3qpy', flip: false, names: ['SOYBEANS - CHICAGO BOARD OF TRADE'] },
  { sym: 'SYBO', group: 'grains', dataset: '72hh-3qpy', flip: false, names: ['SOYBEAN OIL - CHICAGO BOARD OF TRADE'] },
  { sym: 'SUGAR', group: 'softs', dataset: '72hh-3qpy', flip: false, names: ['SUGAR NO. 11 - ICE FUTURES U.S.'] },
  { sym: 'COFFEE', group: 'softs', dataset: '72hh-3qpy', flip: false, names: ['COFFEE C - ICE FUTURES U.S.'] },
  { sym: 'COTTON', group: 'softs', dataset: '72hh-3qpy', flip: false, names: ['COTTON NO. 2 - ICE FUTURES U.S.'] },
  { sym: 'COCOA', group: 'softs', dataset: '72hh-3qpy', flip: false, names: ['COCOA - ICE FUTURES U.S.'] },
  { sym: 'CATTLE', group: 'livestock', dataset: '72hh-3qpy', flip: false, names: ['LIVE CATTLE - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'HOGS', group: 'livestock', dataset: '72hh-3qpy', flip: false, names: ['LEAN HOGS - CHICAGO MERCANTILE EXCHANGE'] }
];

/** Keep the columns that carry positions, trader counts and open interest; drop percent/change/old/other views. */
export function keepColumn(k) {
  return /(_long|_short|open_interest)/.test(k) && !/(pct|change|_old|_other|conc_)/.test(k);
}

export function normaliseRows(rows) {
  return (rows ?? []).map(r => {
    const date = String(r.report_date_as_yyyy_mm_dd ?? '').slice(0, 10);
    const o = { date };
    for (const [k, v] of Object.entries(r)) if (keepColumn(k)) { const n = Number(v); if (Number.isFinite(n)) o[k] = n; }
    return o;
  }).filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date)).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Every weekly row for one market (first name that returns data; paginated past Socrata's page size). */
export async function fetchCotFull(market, { fetchImpl = fetch, pageSize = 5000 } = {}) {
  for (const name of market.names) {
    const all = [];
    for (let offset = 0; offset < 50_000; offset += pageSize) {
      const params = new URLSearchParams({ market_and_exchange_names: name, $limit: String(pageSize), $offset: String(offset), $order: 'report_date_as_yyyy_mm_dd ASC' });
      const r = await fetchImpl(`${CFTC_BASE}/${market.dataset}.json?${params}`, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`CFTC ${market.sym} HTTP ${r.status}`);
      const page = await r.json();
      all.push(...page);
      if (page.length < pageSize) break;
    }
    if (all.length) return { name, rows: normaliseRows(all) };
  }
  return { name: null, rows: [] };
}
