/**
 * Long market histories for the engine (plans/DATA_ASSET_MAP.md §4C): the dormant assets the repo already holds,
 * kept current and archived.
 *
 *   Cboe vol indices (21; VIX from 1990)            cdn.cboe.com daily_prices CSV (keyless)
 *   Yahoo long dailies (^MOVE from 2002, ^TNX/^FVX
 *     from 1970, credit/duration ETFs, 20 FX crosses incl. EM)   Yahoo chart range=max
 *   Overnight benchmarks: €STR (ECB), CORRA (BoC Valet); SONIA comes through server.js's BoE fetcher
 *
 * Each source has a committed seed in the repo (analysis/surfaces/cboe/*.csv, the Yahoo caches) so the engine has
 * the long history from the first boot; the daily archive job (server.js _archiveDaily) refreshes and merges into R2.
 * Pure parsers + thin fetchers; tested in js/marketHistory.test.mjs.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const CBOE_INDICES = ['VIX', 'VIX9D', 'VIX1D', 'VIX3M', 'VIX6M', 'VIX1Y', 'VVIX', 'SKEW', 'VXN', 'RVX', 'VXD', 'GVZ', 'OVX',
  'VXTLT', 'VXEEM', 'VXEWZ', 'VXFXI', 'VXGDX', 'VXSLV', 'VXAPL', 'VXAZN'];

/** Yahoo long dailies: id → ticker (and the committed seed file, when one exists). */
export const YAHOO_LONG = {
  MOVE: { t: '^MOVE', seed: 'analysis/output/nbfi-rates-vol/cache/move_daily.json', label: 'Bond-market vol (MOVE)' },
  TNX: { t: '^TNX', seed: 'analysis/output/nbfi-rates-vol/cache/tnx_daily.json', label: 'US 10Y yield (^TNX, ×10)' },
  FVX: { t: '^FVX', seed: 'analysis/output/nbfi-rates-vol/cache/fvx_daily.json', label: 'US 5Y yield (^FVX, ×10)' },
  HYG: { t: 'HYG', label: 'High-yield credit ETF' }, JNK: { t: 'JNK', label: 'High-yield credit ETF (JNK)' },
  IEF: { t: 'IEF', label: '7-10Y Treasury ETF' }, LQD: { t: 'LQD', label: 'Investment-grade credit ETF' }, TLT: { t: 'TLT', label: '20Y+ Treasury ETF' },
};
const FX_SEED = 'analysis/output/fx-dollar-funding-exposure/cache';
export const YAHOO_FX = ['AUDUSD', 'EURUSD', 'GBPUSD', 'NZDUSD', 'BRL', 'CAD', 'CHF', 'IDR', 'INR', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'PHP', 'SEK', 'SGD', 'THB', 'TRY', 'TWD'];
for (const c of YAHOO_FX) YAHOO_LONG[`FX_${c}`] = { t: `${c}=X`, seed: `${FX_SEED}/${c}_X_d.json`, label: c.length === 6 ? c : `USD/${c}`, fx: true };

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Cboe daily_prices CSV → [{date, value}] (CLOSE, or the single value column for SKEW-style files). */
export function parseCboeCsv(text) {
  const lines = String(text ?? '').trim().split(/\r?\n/);
  if (!lines.length || !/^DATE,/i.test(lines[0])) return [];
  const h = lines[0].split(','), ci = h.findIndex(x => /^CLOSE$/i.test(x)), vi = ci >= 0 ? ci : 1;
  const out = [];
  for (const l of lines.slice(1)) {
    const c = l.split(','), m = c[0]?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/), v = Number(c[vi]);
    if (m && Number.isFinite(v) && v > 0) out.push({ date: iso(m[3], m[1], m[2]), value: v });
  }
  return out;
}

/** London date of an epoch second (DST-safe). */
function londonDate(sec) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(sec * 1000));
  return p;
}

/**
 * Yahoo chart payload → [{date, value}] closes. FX (=X) bars are stamped at their END, London midnight, so the session
 * is the London date of (stamp − 1 min) (DATA_SPEC §5 #18); other symbols use the exchange-local date.
 */
export function parseYahooChart(payload, { fx = false } = {}) {
  const r = payload?.chart?.result?.[0]; if (!r) return [];
  const ts = r.timestamp ?? [], cl = r.indicators?.quote?.[0]?.close ?? [], off = r.meta?.gmtoffset ?? 0;
  const by = new Map();
  for (let i = 0; i < ts.length; i++) {
    const v = cl[i]; if (v == null || !Number.isFinite(v)) continue;
    const date = fx ? londonDate(ts[i] - 60) : new Date((ts[i] + off) * 1000).toISOString().slice(0, 10);
    by.set(date, v);                                    // Yahoo repeats the live bar under the last date: keep the last
  }
  return [...by].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, value]) => ({ date, value }));
}

export async function fetchCboe(sym, { fetchImpl = fetch } = {}) {
  const r = await fetchImpl(`https://cdn.cboe.com/api/global/us_indices/daily_prices/${sym}_History.csv`, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`Cboe ${sym} HTTP ${r.status}`);
  const pts = parseCboeCsv(await r.text());
  if (!pts.length) throw new Error(`Cboe ${sym}: no rows`);
  return pts;
}

export async function fetchYahooLong(id, { fetchImpl = fetch, range = 'max' } = {}) {
  const s = YAHOO_LONG[id]; if (!s) throw new Error(`unknown ${id}`);
  // Explicit period1/period2: with range=max Yahoo silently downgrades the interval to monthly bars.
  const p1 = range === 'max' ? 0 : Math.floor(Date.now() / 1000) - 400 * 86400, p2 = Math.floor(Date.now() / 1000);
  const r = await fetchImpl(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.t)}?period1=${p1}&period2=${p2}&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`Yahoo ${s.t} HTTP ${r.status}`);
  return parseYahooChart(await r.json(), { fx: !!s.fx });
}

/** €STR (ECB Data Portal, from its 2019 start) and CORRA (Bank of Canada Valet). */
export const OVERNIGHT = {
  ESTR: { label: '€STR', fetch: async (fetchImpl = fetch) => {
    const r = await fetchImpl('https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT?format=csvdata&startPeriod=2019-10-01', { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`ECB €STR HTTP ${r.status}`);
    const rows = (await r.text()).trim().split('\n'), h = rows[0].split(','), di = h.indexOf('TIME_PERIOD'), vi = h.indexOf('OBS_VALUE');
    return rows.slice(1).map(l => l.split(',')).map(c => ({ date: c[di], value: +c[vi] })).filter(o => /^\d{4}-\d{2}-\d{2}$/.test(o.date) && Number.isFinite(o.value));
  } },
  CORRA: { label: 'CORRA', fetch: async (fetchImpl = fetch) => {
    const r = await fetchImpl('https://www.bankofcanada.ca/valet/observations/AVG.INTWO/json?start_date=1997-01-01', { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`BoC CORRA HTTP ${r.status}`);
    return ((await r.json()).observations ?? []).map(o => ({ date: o.d, value: Number(o['AVG.INTWO']?.v) })).filter(o => /^\d{4}-\d{2}-\d{2}$/.test(o.date) && Number.isFinite(o.value));
  } },
};

/** The committed seed for a source, so the engine has long history before the first archive run. */
export function loadSeed(kind, id, root = process.cwd()) {
  try {
    if (kind === 'cboe') {
      const f = path.join(root, 'analysis/surfaces/cboe', `${id}.csv`);
      return existsSync(f) ? parseCboeCsv(readFileSync(f, 'utf8')) : [];
    }
    if (kind === 'yahoo') {
      const s = YAHOO_LONG[id]; if (!s?.seed) return [];
      const f = path.join(root, s.seed);
      return existsSync(f) ? parseYahooChart(JSON.parse(readFileSync(f, 'utf8')), { fx: !!s.fx }) : [];
    }
  } catch { /* a bad seed is no seed */ }
  return [];
}

/** Seed and archived/live points merged by date (later sources win). */
export function mergeByDate(...lists) {
  const m = new Map();
  for (const l of lists) for (const p of l ?? []) if (p && p.date && Number.isFinite(p.value)) m.set(p.date, p.value);
  return [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, value]) => ({ date, value }));
}
