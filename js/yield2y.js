// js/yield2y.js — each of the eight currencies' 2-year government yield, daily closes, from the official free sources.
//
// WHY: the bias engine's policy driver reads the laptop's IBKR futures pull (KV cb_rate_futures_v1). When the laptop
// has not pushed for longer than MAX_AGE_DAYS.policy, every currency's policy driver was dropped, and GBP / NZD were
// never covered at all. The 2y government yield is the market's own read of the policy path over the next two years,
// published daily by each central bank or finance ministry, and reachable from the server with no laptop. The bias
// engine uses its change over the last 5 business days as a PROXY for the priced policy change when the futures are
// missing or stale (js/biasEngine.js fillPolicyFallback). The futures stay primary whenever they are fresh.
//
// Stored in KV yield2y_daily_v1 (server.js _y2Build): { generatedAt, byCcy: { CCY: { ok, source, url, points, last,
// error, fetchedAt, lastOkAt } } }. A currency whose fetch fails keeps the points of its last good fetch (real
// published values, with their dates; never filled in) and carries the error. Nothing here invents a value.
//
// Sources (checked from the dev sandbox 2026-11-16; the server's network may differ, the per-currency status says):
//   USD  FRED DGS2 (H.15 2-year Treasury constant maturity), via the server's FRED helper; fredgraph.csv without a key
//   EUR  ECB yield curve YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y (euro-area AAA spot, 2y), csvdata
//   GBP  Bank of England IADB IUDSNPY (nominal 2y spot, daily), the _iadb-fromshowcolumns CSV form
//   JPY  Japan MoF jgbcme.csv (this month) + historical/jgbcme_all.csv (to the end of last month), the 2Y column
//   CHF  SNB data portal cube rendoeid (yield and residual maturity of each Confederation bond issue), linearly
//        interpolated to 2 years. The fitted 2y spot cube rendoblid stopped at 2025-07-31; rendoeid is published
//        monthly (early in the month, to the last business day of the previous month), so the CHF proxy is usually
//        older than the policy age budget late in the month and is then dropped by the engine (said in the reason).
//   CAD  Bank of Canada Valet BD.CDN.2YR.DQ.YLD (2y benchmark bond yield)
//   AUD  RBA F2 (FCMYGBAG2D, Australian Government 2 year bond, interpolated)
//   NZD  RBNZ B2 daily (hb2-daily.xlsx, 2 year government bond). rbnz.govt.nz returns 403 "Website unavailable" to
//        non-browser clients from some networks (see js/rbnzFetch.js); then NZD is missing with that reason.
// Pure parsers are exported for tests (js/yield2y.test.mjs).

export const YIELD2Y_KV = 'yield2y_daily_v1';
export const YIELD2Y_CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
export const KEEP_POINTS = 60;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
const MON_NAMES = Object.keys(MON);
const p2 = x => String(x).padStart(2, '0');
const num = s => { const x = parseFloat(String(s ?? '').replace(/"/g, '').trim()); return Number.isFinite(x) ? x : null; };
const isoOk = d => /^\d{4}-\d{2}-\d{2}$/.test(d);
const sortDedupe = pts => { const m = new Map(); for (const p of pts) if (isoOk(p.date) && Number.isFinite(p.value)) m.set(p.date, p.value); return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, value]) => ({ date, value })); };
const csvSplit = l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(s => s.trim()); };
const lines = t => String(t ?? '').replace(/^﻿/, '').split(/\r?\n/);

export const SOURCES = {
  USD: { source: 'FRED DGS2', url: 'https://api.stlouisfed.org/fred/series/observations?series_id=DGS2' },
  EUR: { source: 'ECB YC SR_2Y (euro-area AAA)', url: 'https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y?format=csvdata' },
  GBP: { source: 'BoE IADB IUDSNPY', url: 'https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&SeriesCodes=IUDSNPY' },
  JPY: { source: 'Japan MoF JGB 2Y', url: 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv' },
  CHF: { source: 'SNB rendoeid (Confederation bonds, interpolated 2y)', url: 'https://data.snb.ch/api/cube/rendoeid/data/csv/en' },
  CAD: { source: 'BoC Valet BD.CDN.2YR.DQ.YLD', url: 'https://www.bankofcanada.ca/valet/observations/BD.CDN.2YR.DQ.YLD/json' },
  AUD: { source: 'RBA F2 FCMYGBAG2D', url: 'https://www.rba.gov.au/statistics/tables/csv/f2-data.csv' },
  NZD: { source: 'RBNZ B2 2y government bond', url: 'https://www.rbnz.govt.nz/-/media/project/sites/rbnz/files/statistics/series/b/b2/hb2-daily.xlsx' },
};

// ── parsers (pure) ──────────────────────────────────────────────────────────────────────────────────────────────
/** ECB csvdata: header row with TIME_PERIOD and OBS_VALUE. */
export function parseEcbCsv(text) {
  const ls = lines(text).filter(Boolean); if (!ls.length) return [];
  const h = csvSplit(ls[0]), it = h.indexOf('TIME_PERIOD'), iv = h.indexOf('OBS_VALUE');
  if (it < 0 || iv < 0) throw new Error('ECB: no TIME_PERIOD / OBS_VALUE header');
  return sortDedupe(ls.slice(1).map(l => { const c = csvSplit(l); return { date: c[it], value: num(c[iv]) }; }));
}
/** BoE IADB CSV ("DATE,IUDSNPY" then "02 Jan 2025,4.75"). */
export function parseIadbCsv(text) {
  return sortDedupe(lines(text).slice(1).map(l => {
    const [dt, v] = l.split(','); const m = String(dt ?? '').trim().match(/^(\d{2}) (\w{3}) (\d{4})$/);
    return m && MON[m[2]] ? { date: `${m[3]}-${MON[m[2]]}-${m[1]}`, value: num(v) } : null;
  }).filter(Boolean));
}
/** MoF jgbcme(_all).csv: a "Date,1Y,2Y,..." header row, then "2026/11/2,1.671,1.88,...". "-" means no value. */
export function parseMofCsv(text) {
  const ls = lines(text), hi = ls.findIndex(l => /^Date,/i.test(l.trim()));
  if (hi < 0) throw new Error('MoF: no Date header');
  const ix = csvSplit(ls[hi]).indexOf('2Y'); if (ix < 0) throw new Error('MoF: no 2Y column');
  return sortDedupe(ls.slice(hi + 1).map(l => {
    const c = csvSplit(l), m = String(c[0] ?? '').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    return m ? { date: `${m[1]}-${p2(m[2])}-${p2(m[3])}`, value: num(c[ix]) } : null;
  }).filter(Boolean));
}
/**
 * SNB rendoeid ("Date";"d0";"d1";"Value", d1 = R1 yield to maturity | LZ residual maturity in years): per date, the
 * yield at 2 years by linear interpolation between the nearest issues either side (each within 0.25..4 years).
 */
export function parseSnbRendoeid(text, target = 2) {
  const by = new Map();
  for (const l of lines(text)) {
    const c = l.split(';').map(s => s.replace(/"/g, '').trim());
    if (c.length < 4 || !isoOk(c[0])) continue;
    const v = num(c[3]); if (v == null) continue;
    const d = by.get(c[0]) ?? new Map(); by.set(c[0], d);
    const b = d.get(c[1]) ?? {}; d.set(c[1], b);
    if (c[2] === 'R1') b.y = v; else if (c[2] === 'LZ') b.m = v;
  }
  const out = [];
  for (const [date, bonds] of by) {
    const xs = [...bonds.values()].filter(b => Number.isFinite(b.y) && Number.isFinite(b.m));
    const lo = xs.filter(b => b.m <= target && b.m >= 0.25).sort((a, b) => b.m - a.m)[0];
    const hi = xs.filter(b => b.m >= target && b.m <= 4).sort((a, b) => a.m - b.m)[0];
    if (!lo || !hi) continue;
    const value = hi.m === lo.m ? lo.y : lo.y + (hi.y - lo.y) * (target - lo.m) / (hi.m - lo.m);
    out.push({ date, value: Math.round(value * 10000) / 10000 });
  }
  return sortDedupe(out);
}
/** Bank of Canada Valet JSON. */
export function parseValetJson(json, series = 'BD.CDN.2YR.DQ.YLD') {
  const obs = json?.observations; if (!Array.isArray(obs)) throw new Error('Valet: no observations');
  return sortDedupe(obs.map(o => ({ date: o.d, value: num(o?.[series]?.v) })));
}
/** RBA F2 CSV: metadata rows, a "Series ID" row naming FCMYGBAG2D, then "13-Nov-2026,4.748,...". */
export function parseRbaF2(text, id = 'FCMYGBAG2D') {
  const ls = lines(text), si = ls.findIndex(l => /^Series ID,/.test(l));
  if (si < 0) throw new Error('RBA F2: no Series ID row');
  const ix = csvSplit(ls[si]).indexOf(id); if (ix < 0) throw new Error(`RBA F2: no ${id} column`);
  return sortDedupe(ls.slice(si + 1).map(l => {
    const c = csvSplit(l), m = String(c[0] ?? '').match(/^(\d{1,2})-(\w{3})-(\d{4})$/);
    return m && MON[m[2]] ? { date: `${m[3]}-${MON[m[2]]}-${p2(m[1])}`, value: num(c[ix]) } : null;
  }).filter(Boolean));
}
/** FRED fredgraph.csv ("observation_date,DGS2" then "2026-10-01,4.78"; blank = no value). */
export function parseFredGraphCsv(text) {
  return sortDedupe(lines(text).slice(1).map(l => { const [d, v] = l.split(','); return { date: String(d ?? '').trim(), value: v?.trim() ? num(v) : null }; }));
}
const excelDate = v => {
  if (v instanceof Date && Number.isFinite(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) return `${m[3]}-${p2(m[2])}-${p2(m[1])}`;   // NZ day-first
  m = s.match(/^(\d{1,2})[ -](\w{3})[ -](\d{4})$/); if (m && MON[m[2]]) return `${m[3]}-${MON[m[2]]}-${p2(m[1])}`;
  return null;
};
/**
 * RBNZ B2 sheet as rows (xlsx sheet_to_json header:1): header rows on top (group / series / unit / series id), dates
 * in the first column. The 2y column is the one whose header text says "2 year" and not bill / swap / indexed.
 */
export function parseRbnzRows(rows) {
  if (!Array.isArray(rows) || rows.length < 5) throw new Error('RBNZ: sheet too short');
  const head = rows.slice(0, 12), width = Math.max(...head.map(r => r?.length ?? 0));
  let col = -1;
  for (let j = 1; j < width && col < 0; j++) {
    const txt = head.map(r => String(r?.[j] ?? '')).join(' | ');
    if (/\b2[\s-]*y(ea)?r/i.test(txt) && !/bill|swap|index|inflation|real/i.test(txt)) col = j;
  }
  if (col < 0) throw new Error('RBNZ: no 2 year government bond column');
  return sortDedupe(rows.map(r => ({ date: excelDate(r?.[0]), value: num(r?.[col]) })).filter(p => p.date));
}

/** The 2y change over the last 5 observations (business days) dated before `beforeDate` (YYYY-MM-DD), in bp. */
export function yieldWeekChange(points, beforeDate, { maxSpanDays = 12 } = {}) {
  const pts = (points ?? []).filter(p => p && isoOk(p.date) && Number.isFinite(p.value) && (!beforeDate || p.date < beforeDate));
  if (pts.length < 6) return { ok: false, why: `only ${pts.length} daily 2y points` };
  const last = pts.at(-1), prev = pts.at(-6), span = (Date.parse(last.date) - Date.parse(prev.date)) / 864e5;
  if (span > maxSpanDays) return { ok: false, why: `gap in the 2y series (${prev.date} to ${last.date})` };
  return { ok: true, weekBp: Math.round((last.value - prev.value) * 1000) / 10, level: last.value, date: last.date, fromDate: prev.date };
}

// ── fetchers ────────────────────────────────────────────────────────────────────────────────────────────────────
const ymd = ms => new Date(ms).toISOString().slice(0, 10);
async function getText(fetchImpl, url, { ua = BROWSER_UA, accept, ms = 30_000 } = {}) {
  const r = await fetchImpl(url, { headers: { 'User-Agent': ua, ...(accept ? { Accept: accept } : {}) }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
  if (!r.ok) { const body = await r.text().catch(() => ''); throw new Error(`HTTP ${r.status}${/Website unavailable|access to the Reserve Bank/i.test(body) ? ' (RBNZ firewall block page)' : ''}`); }
  return r;
}

/**
 * One currency's daily 2y closes since ~`days` calendar days ago. `fredObs(id, fromIso)` -> Map(date -> value) is the
 * server's FRED helper (fetchFredObservations with FRED_KEY); without it, FRED's public fredgraph.csv is used.
 * `loadXlsx()` -> the xlsx module (NZD only).
 */
export async function fetchYield2y(ccy, { fetchImpl = fetch, fredObs = null, loadXlsx = () => import('xlsx'), now = Date.now(), days = 120 } = {}) {
  const from = ymd(now - days * 864e5);
  switch (ccy) {
    case 'USD': {
      if (fredObs) return sortDedupe([...(await fredObs('DGS2', from))].map(([date, value]) => ({ date, value })));
      const u = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS2&cosd=${from}`, get = () => getText(fetchImpl, u, { ua: 'MacroFXDashboard/1.0' });
      return parseFredGraphCsv(await (await get().catch(get)).text());   // one retry: fredgraph drops connections now and then
    }
    case 'EUR': return parseEcbCsv(await (await getText(fetchImpl, `${SOURCES.EUR.url}&startPeriod=${from}`, { accept: 'text/csv' })).text());
    case 'GBP': {
      const d = new Date(from + 'T00:00:00Z'), f = `${p2(d.getUTCDate())}/${MON_NAMES[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
      const r = await getText(fetchImpl, `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${f}&Dateto=now&SeriesCodes=IUDSNPY&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`);
      const t = await r.text();
      if (/<html/i.test(t.slice(0, 500))) throw new Error('BoE returned an HTML page, not the CSV');
      return parseIadbCsv(t);
    }
    case 'JPY': {
      // this month's file, plus the all-history file only when this month has too few days
      const cur = parseMofCsv(await (await getText(fetchImpl, SOURCES.JPY.url)).text());
      if (cur.length >= 25) return cur;
      const all = parseMofCsv(await (await getText(fetchImpl, 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv', { ms: 60_000 })).text());
      return sortDedupe([...all.filter(p => p.date >= from), ...cur]);
    }
    case 'CHF': return parseSnbRendoeid(await (await getText(fetchImpl, `${SOURCES.CHF.url}?fromDate=${from}`)).text());
    case 'CAD': return parseValetJson(await (await getText(fetchImpl, `${SOURCES.CAD.url}?start_date=${from}`, { accept: 'application/json' })).json());
    case 'AUD': return parseRbaF2(await (await getText(fetchImpl, SOURCES.AUD.url)).text()).filter(p => p.date >= from);
    case 'NZD': {
      const buf = Buffer.from(await (await getText(fetchImpl, SOURCES.NZD.url)).arrayBuffer());
      if (buf.slice(0, 2).toString() !== 'PK') throw new Error('RBNZ did not return an xlsx file');
      const X = await loadXlsx(), XL = X.default ?? X, wb = XL.read(buf, { type: 'buffer' });
      const name = wb.SheetNames.find(n => /data/i.test(n)) ?? wb.SheetNames[0];
      return parseRbnzRows(XL.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true })).filter(p => p.date >= from);
    }
    default: throw new Error(`unknown currency ${ccy}`);
  }
}

/**
 * All eight, merged onto the previous payload: a failed currency keeps its last good points (with lastOkAt) and
 * carries the error. Never throws.
 */
export async function buildYield2yPayload(prev, opts = {}) {
  const now = opts.now ?? Date.now(), byCcy = {};
  await Promise.all(YIELD2Y_CCYS.map(async c => {
    const old = prev?.byCcy?.[c], meta = { source: SOURCES[c].source + (c === 'USD' && !opts.fredObs ? ' (fredgraph.csv)' : ''), url: SOURCES[c].url, fetchedAt: new Date(now).toISOString() };
    try {
      const pts = (await fetchYield2y(c, { ...opts, now })).filter(p => p.date <= ymd(now)).slice(-KEEP_POINTS);
      if (!pts.length) throw new Error('no observations in the window');
      byCcy[c] = { ok: true, ...meta, points: pts, last: pts.at(-1), lastOkAt: meta.fetchedAt, error: null };
    } catch (e) {
      const err = String(e?.message ?? e).slice(0, 300);
      byCcy[c] = old?.points?.length ? { ...old, ...meta, ok: false, error: err } : { ok: false, ...meta, points: [], last: null, lastOkAt: null, error: err };
    }
  }));
  return { version: 1, generatedAt: new Date(now).toISOString(), byCcy };
}
