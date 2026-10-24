// Capital-flow chain — data sources (server side). Builds the payload flow-chain.html charts:
//   { ok, at, from, dates:[YYYY-MM-DD], line:{id:[v|null]}, ohlc:{id:{o,h,l,c}}, src:{id:'…'}, errors:[] }
// One shared weekday calendar; every series is aligned to it (null where it has no print).
//
// Keys are optional. With OANDA_KEY prices come from OANDA daily mid candles (the desk's source);
// without it, from Yahoo daily. With FRED_KEY FRED comes from the API; without it, from the public
// fredgraph CSV. ECB, Bundesbank, MoF Japan and BoE are public. Fetches run one at a time (FRED
// 403s bursts — memory project_macro_feed_health).

import { FLOW_SERIES } from './flowChain.js';
import { parseBubaCsv, parseMofCsv, parseBoeCsv } from './intlYields.js';

const UA = { 'User-Agent': 'Mozilla/5.0 MacroFXDashboard' };
const text = async (url, ms = 60_000) => { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(`${new URL(url).host} HTTP ${r.status}`); return r.text(); };
const json = async (url, opts = {}, ms = 60_000) => { const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(`${new URL(url).host} HTTP ${r.status}`); return r.json(); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fred(id, from, key) {
  if (key) {
    const d = await json(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&observation_start=${from}`);
    return (d.observations || []).filter(o => o.value && o.value !== '.').map(o => ({ date: o.date, value: +o.value }));
  }
  const t = await text(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${from}`);
  return t.trim().split('\n').slice(1).map(l => l.split(',')).filter(([, v]) => v && v !== '.').map(([date, v]) => ({ date, value: +v }));
}
async function ecb(key, from) {
  const t = await text(`https://data-api.ecb.europa.eu/service/data/${key}?format=csvdata&startPeriod=${from}`);
  const rows = t.trim().split('\n'), h = rows[0].split(','), di = h.indexOf('TIME_PERIOD'), vi = h.indexOf('OBS_VALUE');
  return rows.slice(1).map(l => l.split(',')).map(c => ({ date: c[di], value: +c[vi] })).filter(o => /^\d{4}-\d{2}-\d{2}$/.test(o.date) && Number.isFinite(o.value));
}
const buba = code => text(`https://api.statistiken.bundesbank.de/rest/download/BBSIS/D.I.ZAR.ZI.EUR.S1311.B.A604.${code}.R.A.A._Z._Z.A?format=csv&lang=en`).then(parseBubaCsv);
let _mofAll = null;
async function mof(tenor) {
  const base = 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/';
  _mofAll ??= Promise.all([text(base + 'historical/jgbcme_all.csv', 90_000), text(base + 'jgbcme.csv')]);
  const [all, cur] = await _mofAll;
  const m = new Map(); for (const o of [...parseMofCsv(all, tenor), ...parseMofCsv(cur, tenor)]) m.set(o.date, o.value);
  return [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, value]) => ({ date, value }));
}
const boe = (code, from) => {
  const d = new Date(from); const mon = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[d.getUTCMonth()];
  return text(`https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/${mon}/${d.getUTCFullYear()}&Dateto=now&SeriesCodes=${code}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`).then(parseBoeCsv);
};

// OANDA daily mid candles, paged. Date = the session the 17:00 NY close ends (21:00/22:00 UTC → next date),
// as fetchOandaD1Range in server.js.
async function oandaD1(instrument, from, { key, base }) {
  const out = []; let cursor = `${from}T00:00:00.000000000Z`;
  for (let page = 0; page < 12; page++) {
    const d = await json(`${base}/v3/instruments/${encodeURIComponent(instrument)}/candles?granularity=D&from=${encodeURIComponent(cursor)}&count=4500&price=M`, { headers: { Authorization: `Bearer ${key}` } });
    const cs = (d.candles ?? []).filter(c => c.complete !== false && c.mid);
    for (const c of cs) {
      const t = new Date(c.time); if (t.getUTCHours() >= 20) t.setUTCDate(t.getUTCDate() + 1);
      out.push({ date: t.toISOString().slice(0, 10), o: +c.mid.o, h: +c.mid.h, l: +c.mid.l, c: +c.mid.c });
    }
    if (cs.length < 4500) break;
    cursor = cs[cs.length - 1].time;
  }
  return out;
}
async function yahooD1(ticker, from) {
  const p1 = Math.floor(Date.parse(from + 'T00:00:00Z') / 1000), p2 = Math.floor(Date.now() / 1000);
  const d = await json(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${p1}&period2=${p2}&interval=1d`, { headers: UA });
  const r = d?.chart?.result?.[0], q = r?.indicators?.quote?.[0], ts = r?.timestamp;
  if (!ts || !q) throw new Error(`yahoo ${ticker}: no series`);
  return ts.map((t, k) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), o: q.open[k], h: q.high[k], l: q.low[k], c: q.close[k] }))
    .filter(b => [b.o, b.h, b.l, b.c].every(Number.isFinite));
}

function weekdays(from, to) {
  const out = []; const d = new Date(from + 'T00:00:00Z'), end = new Date(to + 'T00:00:00Z');
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10)); }
  return out;
}
const r6 = v => (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null);

/**
 * Build the whole payload. opts: { from='2005-01-03', fredKey, oandaKey, oandaBase, log }.
 * A failed source is recorded in `errors` and its series left out; the rest still ship.
 */
export async function buildFlowChain({ from = '2005-01-03', fredKey = null, oandaKey = null, oandaBase = null, log = () => {} } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const dates = weekdays(from, today), idx = new Map(dates.map((d, i) => [d, i]));
  const line = {}, ohlc = {}, src = {}, errors = [];
  const lineJobs = {
    us_ff: () => fred('DFF', from, fredKey), us_2y: () => fred('DGS2', from, fredKey), us_10y: () => fred('DGS10', from, fredKey),
    baa10y: () => fred('BAA10Y', from, fredKey), hy_oas: () => fred('BAMLH0A0HYM2', from, fredKey),
    ecb_dfr: () => ecb('FM/D.U2.EUR.4F.KR.DFR.LEV', from),
    de_2y: () => buba('R02XX'), de_10y: () => buba('R10XX'),
    jp_2y: () => mof('2Y'), jp_10y: () => mof('10Y'),
    boe_bank: () => boe('IUDBEDR', from), uk_10y: () => boe('IUDMNZC', from),
  };
  for (const [id, job] of Object.entries(lineJobs)) {
    try {
      const pts = await job(); const col = new Array(dates.length).fill(null); let n = 0;
      for (const p of pts) { const i = idx.get(p.date); if (i != null) { col[i] = r6(p.value); n++; } }
      if (!n) throw new Error('no rows in range');
      line[id] = col; src[id] = FLOW_SERIES[id].src + (id.startsWith('us_') || id === 'baa10y' || id === 'hy_oas' ? (fredKey ? '' : ' (public CSV)') : '');
      log(`${id} ${n}`);
    } catch (e) { errors.push(`${id}: ${e.message}`); }
    if (lineJobs[id] && /^(us_|baa|hy_)/.test(id)) await sleep(400);
  }
  for (const [id, s] of Object.entries(FLOW_SERIES).filter(([, s]) => s.ohlc)) {
    try {
      const bars = oandaKey && oandaBase ? await oandaD1(s.oanda, from, { key: oandaKey, base: oandaBase }) : await yahooD1(s.yahoo, from);
      const o = { o: new Array(dates.length).fill(null), h: [], l: [], c: [] };
      o.h = o.o.slice(); o.l = o.o.slice(); o.c = o.o.slice(); let n = 0;
      for (const b of bars) { const i = idx.get(b.date); if (i == null) continue; o.o[i] = r6(b.o); o.h[i] = r6(b.h); o.l[i] = r6(b.l); o.c[i] = r6(b.c); n++; }
      if (!n) throw new Error('no rows in range');
      ohlc[id] = o; src[id] = oandaKey ? `OANDA ${s.oanda} daily mid` : `Yahoo ${s.yahoo} daily`;
      log(`${id} ${n}`);
    } catch (e) { errors.push(`${id}: ${e.message}`); }
  }
  // Trim trailing weekdays with no print at all (today before any close).
  let end = dates.length;
  const any = i => Object.values(line).some(c => c[i] != null) || Object.values(ohlc).some(o => o.c[i] != null);
  while (end > 0 && !any(end - 1)) end--;
  const cut = a => a.slice(0, end);
  for (const k of Object.keys(line)) line[k] = cut(line[k]);
  for (const k of Object.keys(ohlc)) for (const f of ['o', 'h', 'l', 'c']) ohlc[k][f] = cut(ohlc[k][f]);
  return { ok: Object.keys(line).length + Object.keys(ohlc).length > 0, at: new Date().toISOString(), from, dates: cut(dates), line, ohlc, src, errors };
}
