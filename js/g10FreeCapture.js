/**
 * G10 free-source capture, phase 3 of plans/DATA_CAPTURE_G10.md: the free central-bank, Treasury, IMF and CFTC series
 * the archive did not hold yet, fetched daily (CFTC weekly) and merged into R2 (js/dataArchive.js). Capture only:
 * no reader, no live calc reads any of it.
 *
 *   UK (BoE IADB, through server.js's fetcher)  gilt zero-coupon nominal / real / implied inflation at 5, 10, 20y;
 *                                               SONIA 10th/25th/75th/90th percentiles and volume; the weekly report
 *                                               (reserves, notes, APF loan, TFSME, repo operations)
 *   UK (BoE yield-curve files)                  the full fitted nominal, real, inflation and OIS spot curves
 *   Switzerland (SNB data portal)               Confederation yields 2/5/10y (interpolated between issues), SARON;
 *                                               the discontinued SNB spot curve (1988 to 2025-07, deep fill only)
 *   Euro area (ECB Data Portal)                 €STR with 25th/75th percentiles, volume, transactions, banks;
 *                                               M3, loans to firms and households, Bank Lending Survey net balances
 *   Japan (BoJ time-series API)                 TONA (uncollateralised overnight call rate) average, high, low
 *   US Treasury TIC                             major foreign holders of Treasuries by country (monthly, from 2000)
 *   IMF COFER                                   currency composition of world FX reserves (quarterly, from 1999)
 *   CFTC TFF                                    dealers / asset managers / leveraged funds / other for G10 FX, EM FX
 *                                               and every Treasury, SOFR, fed funds, Eurodollar and €STR future (weekly
 *                                               from 2006, old and renamed contracts stitched)
 *
 * Every source fails on its own into `failed`; one bad host never stops the rest. Pure parsers are exported and tested
 * on fixtures cut from the real responses (js/g10FreeCapture.test.mjs), so the tests need no network.
 */
import { splitCsv } from './macroCapture.js';

const T = (ms = 40_000) => AbortSignal.timeout(ms);
const UA = { 'User-Agent': 'Mozilla/5.0' };
const isoOk = d => /^\d{4}-\d{2}-\d{2}$/.test(d);
const num = v => { const s = String(v ?? '').replace(/"/g, '').trim(); const x = Number(s); return s !== '' && Number.isFinite(x) ? x : null; };
const pad = n => String(n).padStart(2, '0');
const MAX_BYTES = 60e6;

/** An SDMX period as a date: '2026-10' → 2026-10-01, '2026-Q4' → 2026-10-01 (the quarter's first day), '2026' → 2026-01-01. */
export function periodToDate(p) {
  const s = String(p ?? '').trim();
  if (isoOk(s)) return s;
  let m = s.match(/^(\d{4})-(\d{2})$/); if (m) return `${m[1]}-${m[2]}-01`;
  m = s.match(/^(\d{4})-Q([1-4])$/); if (m) return `${m[1]}-${pad((+m[2] - 1) * 3 + 1)}-01`;
  m = s.match(/^(\d{4})$/); if (m) return `${m[1]}-01-01`;
  return null;
}

/**
 * SDMX CSV with several series in one response → { id: points }. idOf(row as {col: value}) names the series; rows it
 * returns null for are skipped. Works for the ECB csvdata and the IMF SDMX 2.1 CSV (detail=dataonly keeps both one line per row).
 */
export function parseSdmxCsvSeries(text, idOf) {
  const rows = String(text ?? '').replace(/^﻿/, '').trim().split(/\r?\n/); if (rows.length < 2) return {};
  const h = splitCsv(rows[0]).map(s => s.trim()), di = h.indexOf('TIME_PERIOD'), vi = h.indexOf('OBS_VALUE');
  if (di < 0 || vi < 0) return {};
  const out = {};
  for (const l of rows.slice(1)) {
    const c = splitCsv(l), rec = Object.fromEntries(h.map((k, i) => [k, c[i]?.trim()]));
    const id = idOf(rec), date = periodToDate(c[di]), value = num(c[vi]);
    if (!id || !date || value == null) continue;
    (out[id] ??= []).push({ date, value });
  }
  for (const p of Object.values(out)) p.sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

/** SNB data-portal cube CSV ("Date";"D0";["D1";]"Value", after a 3-line header) → { 'D0' or 'D0|D1': points }. */
export function parseSnbCube(text) {
  const out = {};
  for (const l of String(text ?? '').replace(/^﻿/, '').split(/\r?\n/)) {
    const c = splitCsv(l, ';').map(s => s.trim());
    if (c.length < 3) continue;
    const date = periodToDate(c[0]), value = num(c.at(-1)); if (!date || value == null) continue;
    (out[c.slice(1, -1).join('|')] ??= []).push({ date, value });
  }
  return out;
}

/**
 * SNB rendoeid (one yield 'R1' and residual maturity 'LZ' per Confederation bond per day) → { target: points }, the yield
 * at each target maturity by linear interpolation between the nearest bonds either side, each within `span` years.
 */
export function snbYieldsAt(text, targets = [2, 5, 10], span = 3) {
  const by = new Map();
  for (const [k, p] of Object.entries(parseSnbCube(text))) {
    const [bond, kind] = k.split('|'); if (kind !== 'R1' && kind !== 'LZ') continue;
    for (const { date, value } of p) {
      const d = by.get(date) ?? new Map(); by.set(date, d);
      const b = d.get(bond) ?? {}; d.set(bond, b); b[kind === 'R1' ? 'y' : 'm'] = value;
    }
  }
  const out = Object.fromEntries(targets.map(t => [t, []]));
  for (const date of [...by.keys()].sort()) {
    const xs = [...by.get(date).values()].filter(b => Number.isFinite(b.y) && Number.isFinite(b.m) && b.m >= 0.25);
    for (const t of targets) {
      const lo = xs.filter(b => b.m <= t && b.m >= t - span).sort((a, b) => b.m - a.m)[0];
      const hi = xs.filter(b => b.m >= t && b.m <= t + span).sort((a, b) => a.m - b.m)[0];
      if (!lo || !hi) continue;
      const v = hi.m === lo.m ? lo.y : lo.y + (hi.y - lo.y) * (t - lo.m) / (hi.m - lo.m);
      out[t].push({ date, value: Math.round(v * 1e4) / 1e4 });
    }
  }
  return out;
}

/** BoJ time-series API JSON (RESULTSET[].VALUES.SURVEY_DATES / VALUES, YYYYMMDD) → { SERIES_CODE: points }. */
export function parseBojApi(json) {
  const out = {};
  for (const s of json?.RESULTSET ?? []) {
    const ds = s?.VALUES?.SURVEY_DATES ?? [], vs = s?.VALUES?.VALUES ?? [], p = (out[s.SERIES_CODE] ??= []);
    for (let i = 0; i < ds.length; i++) {
      const m = String(ds[i]).match(/^(\d{4})(\d{2})(\d{2})$/), v = vs[i];
      if (m && v != null && Number.isFinite(+v)) p.push({ date: `${m[1]}-${m[2]}-${m[3]}`, value: +v });
    }
  }
  return out;
}

const TIC_ALIAS = { GRAND_TOTAL: 'TOTAL', FOR_OFFICIAL: 'FOREIGN_OFFICIAL', OF_WHICH_FOREIGN_OFFICIAL: 'FOREIGN_OFFICIAL', OF_WHICH_FOREIGN_OFFICIAL_TREASURY_BILLS: 'FOREIGN_OFFICIAL_BILLS',
  TREASURY_BILLS: 'FOREIGN_OFFICIAL_BILLS', OF_WHICH_FOREIGN_OFFICIAL_T_BONDS_NOTES: 'FOREIGN_OFFICIAL_BONDS_NOTES', T_BONDS_NOTES: 'FOREIGN_OFFICIAL_BONDS_NOTES', KOREA_SOUTH: 'KOREA' };
const ticKey = name => { const k = String(name).replace(/"/g, '').replace(/\s+\d+\/\s*$/, '').toUpperCase().replace(/&/g, ' ').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, ''); return TIC_ALIAS[k] ?? k; };
/**
 * TIC major foreign holders ($bn). Reads both layouts: slt_table5.txt (one "Country  2026-09  2026-08 ..." header) and the
 * history file mfhhis01.txt (yearly blocks: a row of month names over a "Country  2025  2025 ..." row). → rows
 * [{ date: 'YYYY-MM-01', JAPAN, UNITED_KINGDOM, ..., TOTAL, FOREIGN_OFFICIAL }]; where a month appears twice (the
 * 2011 benchmark break) the first column, the revised series, is kept.
 */
export function parseTicMfh(text) {
  const MON = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
  const lines = String(text ?? '').split(/\r?\n/).map(l => l.split('\t').map(s => s.trim()));
  const by = new Map(); let cols = null;
  for (let i = 0; i < lines.length; i++) {
    const r = lines[i];
    if (r[0] === 'Country') {
      const prev = lines[i - 1] ?? [];
      cols = r.slice(1).map((y, k) => {
        if (/^\d{4}-\d{2}$/.test(y)) return `${y}-01`;
        const mo = MON[String(prev[k + 1] ?? '').slice(0, 3).toUpperCase()];
        return /^\d{4}$/.test(y) && mo ? `${y}-${pad(mo)}-01` : null;
      });
      continue;
    }
    if (!cols || !r[0] || /^-+$/.test(r[1] ?? '') || /^(Notes|Link|Holdings|Billions|Table)/i.test(r[0])) continue;
    const key = ticKey(r[0]); if (!key) continue;
    const seen = new Set();
    cols.forEach((date, k) => {
      if (!date || seen.has(date)) return; seen.add(date);
      const v = num(r[k + 1]); if (v == null) return;
      const row = by.get(date) ?? { date }; by.set(date, row);
      if (row[key] == null) row[key] = v;
    });
  }
  return [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * One BoE yield-curve spot sheet (rows as SheetJS header:1 arrays: a "years:" row of maturities, then [Excel date
 * serial, yield...] rows) → { tenor: points } for the tenors asked that the sheet carries.
 */
export function parseGlcSpotRows(rows, tenors) {
  const hdr = (rows ?? []).find(r => r?.[0] === 'years:'); if (!hdr) return {};
  const col = {}; for (const t of tenors) { const k = hdr.findIndex((x, i) => i > 0 && Math.abs(Number(x) - t) < 1e-6); if (k > 0) col[t] = k; }
  const out = Object.fromEntries(Object.keys(col).map(t => [t, []]));
  for (const r of rows) {
    if (typeof r?.[0] !== 'number' || r[0] < 20000 || r[0] > 80000) continue;
    const date = new Date(Math.round((r[0] - 25569) * 864e5)).toISOString().slice(0, 10);
    for (const [t, k] of Object.entries(col)) { const v = r[k]; if (typeof v === 'number' && Number.isFinite(v)) out[t].push({ date, value: Math.round(v * 1e6) / 1e6 }); }
  }
  return out;
}
/** Which curve a BoE file holds, from its name ("GLC Nominal daily data_2016 to 2024.xlsx", "OIS daily data current month.xlsx"). */
export const glcKind = name => (/inflation/i.test(name) ? 'INF' : /real/i.test(name) ? 'REAL' : /nominal/i.test(name) ? 'NOM' : /^OIS/i.test(String(name).split('/').pop()) ? 'OIS' : null);

const normTffKey = k => /(_long|_short|_spread|open_interest|^traders_)/.test(k) && !/(pct|change|_old|_other|conc_)/.test(k);
/** CFTC TFF rows → [{date, open_interest_all, dealer_positions_long_all, asset_mgr_positions_long, lev_money_..., traders_...}]. */
export function normaliseTff(rows) {
  return (rows ?? []).map(r => {
    const o = { date: String(r?.report_date_as_yyyy_mm_dd ?? '').slice(0, 10) };
    for (const [k, v] of Object.entries(r ?? {})) if (normTffKey(k)) { const n = Number(v); if (Number.isFinite(n)) o[k] = n; }
    return o;
  }).filter(r => isoOk(r.date)).sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ── What is captured ───────────────────────────────────────────────────────────────────────────────────────────────
/** BoE IADB codes (fetched as BOE_<code>). family → { id: [code, label] }. */
export const BOE_IADB = {
  g10_yields: {
    UK_NOM_ZC_5Y: ['IUDSNZC', 'UK gilt 5y nominal zero-coupon'], UK_NOM_ZC_10Y: ['IUDMNZC', 'UK gilt 10y nominal zero-coupon'], UK_NOM_ZC_20Y: ['IUDLNZC', 'UK gilt 20y nominal zero-coupon'],
    UK_REAL_ZC_5Y: ['IUDSRZC', 'UK index-linked 5y real zero-coupon'], UK_REAL_ZC_10Y: ['IUDMRZC', 'UK index-linked 10y real zero-coupon'], UK_REAL_ZC_20Y: ['IUDLRZC', 'UK index-linked 20y real zero-coupon'],
    UK_INF_ZC_5Y: ['IUDSIZC', 'UK implied inflation 5y zero-coupon (RPI)'], UK_INF_ZC_10Y: ['IUDMIZC', 'UK implied inflation 10y zero-coupon (RPI)'], UK_INF_ZC_20Y: ['IUDLIZC', 'UK implied inflation 20y zero-coupon (RPI)'],
  },
  overnight: {
    SONIA_P10: ['IUDZLS6', 'SONIA 10th percentile'], SONIA_P25: ['IUDZLS7', 'SONIA 25th percentile'], SONIA_P75: ['IUDZLS8', 'SONIA 75th percentile'], SONIA_P90: ['IUDZLS9', 'SONIA 90th percentile'],
    SONIA_VOL: ['IUDZLT2', 'SONIA total nominal value (£mn)'],
  },
  boe: {
    RESERVES: ['RPWB56A', 'Reserves balances (£mn, Wed)'], NOTES: ['RPWB55A', 'Notes in circulation (£mn, Wed)'], FX_SECURITIES_ISSUED: ['RPWB59A', 'Foreign currency public securities issued (£mn)'],
    SHORT_TERM_OMO: ['RPWB66A', 'Short-term open market operations (£mn)'], SHORT_TERM_OMO_OLD: ['RPWB9R6', 'Short-term OMO, until 21 Sep 2022 (£mn)'], LONG_TERM_OPS: ['RPWB69A', 'Long-term operations (ILTR / CTRF, £mn)'],
    TFS: ['RPWZO8Q', 'Term Funding Scheme, until 21 Sep 2022 (£mn)'], TFSME: ['RPWZOQ4', 'TFSME (£mn)'], STERLING_BONDS: ['RPWZ4TL', 'Sterling bond holdings (£mn)'],
    APF_LOAN: ['RPWZ4TM', 'Loan to the Asset Purchase Facility (£mn)'], APF_LOAN_TEMP: ['RPWZOI7', 'APF loan, 2022 temporary gilt purchases (£mn)'], CCFF_LOAN: ['RPWZOQ3', 'Loan to the Covid Corporate Financing Facility (£mn)'],
    FX_RESERVE_ASSETS: ['RPWZ4TN', 'Foreign currency reserve assets (£mn)'], WAYS_AND_MEANS: ['RPWB72A', 'Ways and Means advances to HM Government (£mn)'],
  },
};
const BOE_FROM = { g10_yields: '1970-01-01', overnight: '2018-01-01', boe: '1990-01-01' };

const GLC_BASE = 'https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves';
export const GLC_LATEST = `${GLC_BASE}/latest-yield-curve-data.zip`;
/** The full histories (each 12-40 MB of zipped spreadsheets, about 15 s and 270 MB of memory each): the deep first fill only. */
export const GLC_HISTORY = ['glcnominalddata', 'glcrealddata', 'glcinflationddata', 'oisddata'].map(f => `${GLC_BASE}/${f}.zip`);
export const GLC_TENORS = { NOM: [0.5, 1, 2, 3, 5, 7, 10, 15, 20, 25, 30, 40], REAL: [2.5, 3, 5, 7, 10, 15, 20, 25, 30, 40], INF: [2.5, 3, 5, 7, 10, 15, 20, 25, 30, 40], OIS: [0.5, 1, 2, 3, 5] };

const SNB = 'https://data.snb.ch/api/cube';
const ECB = 'https://data-api.ecb.europa.eu/service/data';
/** €STR: one query, the series split by DATA_TYPE_EST. */
export const ESTR_TYPES = { WT: 'ESTR', R25: 'ESTR_P25', R75: 'ESTR_P75', TT: 'ESTR_VOL', NT: 'ESTR_NTRANS', NB: 'ESTR_NBANKS', VL: 'ESTR_VL' };
export const ECB_SERIES = {
  M3: 'BSI/M.U2.Y.V.M30.X.1.U2.2300.Z01.E', M3_YOY: 'BSI/M.U2.Y.V.M30.X.I.U2.2300.Z01.A',
  LOANS_NFC: 'BSI/M.U2.Y.U.A20T.A.1.U2.2240.Z01.E', LOANS_NFC_YOY: 'BSI/M.U2.Y.U.A20T.A.I.U2.2240.Z01.A',
  LOANS_HH: 'BSI/M.U2.Y.U.A20T.A.1.U2.2250.Z01.E', LOANS_HH_YOY: 'BSI/M.U2.Y.U.A20T.A.I.U2.2250.Z01.A',
  BLS_FIRMS_STANDARDS: 'BLS/Q.U2.ALL.O.E.Z.B3.ST.S.WFNET', BLS_FIRMS_DEMAND: 'BLS/Q.U2.ALL.O.E.Z.B3.ZZ.D.WFNET',
  BLS_HOUSE_STANDARDS: 'BLS/Q.U2.ALL.Z.H.H.B3.ST.S.WFNET', BLS_HOUSE_DEMAND: 'BLS/Q.U2.ALL.Z.H.H.B3.ZZ.D.WFNET',
  BLS_CONSUMER_STANDARDS: 'BLS/Q.U2.ALL.Z.H.C.B3.ST.S.WFNET', BLS_CONSUMER_DEMAND: 'BLS/Q.U2.ALL.Z.H.C.B3.ZZ.D.WFNET',
};
export const BOJ_TONA = { TONA: 'STRDCLUCON', TONA_HIGH: 'STRDCLUCONH', TONA_LOW: 'STRDCLUCONL' };
const TIC_BASE = 'https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents';
export const TIC_URLS = [`${TIC_BASE}/mfhhis01.txt`, `${TIC_BASE}/slt_table5.txt`];      // history first, so the current table's revisions win
export const COFER_URL = 'https://api.imf.org/external/sdmx/2.1/data/COFER/G001....Q?detail=dataonly';

const CFTC = 'https://publicreporting.cftc.gov/resource/gpe5-46if.json';
/** TFF futures-only markets. names: old then new (CFTC renamed most contracts in Feb 2022); every name is pulled and stitched. */
export const TFF_MARKETS = [
  { sym: 'EUR', names: ['EURO FX - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'GBP', names: ['BRITISH POUND STERLING - CHICAGO MERCANTILE EXCHANGE', 'BRITISH POUND - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'JPY', names: ['JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'CHF', names: ['SWISS FRANC - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'CAD', names: ['CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'AUD', names: ['AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'NZD', names: ['NEW ZEALAND DOLLAR - CHICAGO MERCANTILE EXCHANGE', 'NZ DOLLAR - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'MXN', names: ['MEXICAN PESO - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'BRL', names: ['BRAZILIAN REAL - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'ZAR', names: ['SOUTH AFRICAN RAND - CHICAGO MERCANTILE EXCHANGE', 'SO AFRICAN RAND - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'DXY', names: ['U.S. DOLLAR INDEX - ICE FUTURES U.S.', 'USD INDEX - ICE FUTURES U.S.'] },
  { sym: 'EURGBP', names: ['EURO FX/BRITISH POUND XRATE - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'EURJPY', names: ['EURO FX/JAPANESE YEN XRATE - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'TU', names: ['2-YEAR U.S. TREASURY NOTES - CHICAGO BOARD OF TRADE', 'UST 2Y NOTE - CHICAGO BOARD OF TRADE'] },
  { sym: 'FV', names: ['5-YEAR U.S. TREASURY NOTES - CHICAGO BOARD OF TRADE', 'UST 5Y NOTE - CHICAGO BOARD OF TRADE'] },
  { sym: 'TY', names: ['10-YEAR U.S. TREASURY NOTES - CHICAGO BOARD OF TRADE', 'UST 10Y NOTE - CHICAGO BOARD OF TRADE'] },
  { sym: 'TN', names: ['ULTRA 10-YEAR U.S. T-NOTES - CHICAGO BOARD OF TRADE', 'ULTRA UST 10Y - CHICAGO BOARD OF TRADE'] },
  { sym: 'US', names: ['U.S. TREASURY BONDS - CHICAGO BOARD OF TRADE', 'UST BOND - CHICAGO BOARD OF TRADE'] },
  { sym: 'UB', names: ['ULTRA U.S. TREASURY BONDS - CHICAGO BOARD OF TRADE', 'ULTRA UST BOND - CHICAGO BOARD OF TRADE'] },
  { sym: 'ZQ', names: ['30-DAY FEDERAL FUNDS - CHICAGO BOARD OF TRADE', 'FED FUNDS - CHICAGO BOARD OF TRADE'] },
  { sym: 'SR3', names: ['3-MONTH SOFR - CHICAGO MERCANTILE EXCHANGE', 'SOFR-3M - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'SR1', names: ['1-MONTH SOFR - CHICAGO MERCANTILE EXCHANGE', 'SOFR-1M - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'ED', names: ['3-MONTH EURODOLLARS - CHICAGO MERCANTILE EXCHANGE', 'EURODOLLARS-3M - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'ESTR', names: ['EURO SHORT TERM RATE - CHICAGO MERCANTILE EXCHANGE'] },
  { sym: 'SOFR_SWAP_2Y', names: ['2 YEAR ERIS SOFR SWAP - CHICAGO BOARD OF TRADE'] },
  { sym: 'SOFR_SWAP_5Y', names: ['5 YEAR ERIS SOFR SWAP - CHICAGO BOARD OF TRADE'] },
  { sym: 'SOFR_SWAP_10Y', names: ['10 YEAR ERIS SOFR SWAP - CHICAGO BOARD OF TRADE'] },
];

// ── Fetchers ────────────────────────────────────────────────────────────────────────────────────────────────────────
async function get(fetchImpl, url, kind = 'text', ms, headers = {}) {
  const r = await fetchImpl(url, { headers: { ...UA, ...headers }, signal: T(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url.slice(0, 90)}`);
  const len = Number(r.headers?.get?.('content-length') ?? 0); if (len > MAX_BYTES) throw new Error(`too large (${len} bytes) ${url.slice(0, 90)}`);
  if (kind === 'json') return r.json();
  if (kind === 'buffer') { const b = Buffer.from(await r.arrayBuffer()); if (b.length > MAX_BYTES) throw new Error(`too large ${url.slice(0, 90)}`); return b; }
  return r.text();
}

/** BoE IADB series through server.js's fetcher (fetchBoe('BOE_<code>', from) → [{date, value}]). */
export async function fetchBoeIadb({ fetchBoe, log = console } = {}) {
  const out = {}, fail = [];
  if (typeof fetchBoe !== 'function') return { out, fail: ['boe iadb: no fetcher'] };
  for (const [family, map] of Object.entries(BOE_IADB)) {
    out[family] = {};
    for (const [id, [code]] of Object.entries(map)) {
      try { const p = await fetchBoe(`BOE_${code}`, BOE_FROM[family]); out[family][id] = Array.isArray(p) ? p : [...p].map(([date, value]) => ({ date, value })); }
      catch (e) { fail.push(`boe ${code}: ${e.message}`); }
    }
  }
  if (fail.length) log.warn?.(`[g10-free] boe iadb: ${fail.join('; ')}`);
  return { out, fail };
}

/** BoE fitted curves from one zip of spreadsheets → { 'NOM_10Y': points, 'REAL_5Y': ..., 'OIS_2Y': ... }. One sheet parsed per file. */
export function readGlcZip(buf, XLSX) {
  const out = {}, cfb = XLSX.CFB.read(buf, { type: 'buffer' });
  for (const f of cfb.FileIndex) {
    const kind = /\.xlsx$/i.test(f.name) ? glcKind(f.name) : null; if (!kind || !f.content?.length) continue;
    const names = XLSX.read(f.content, { type: 'buffer', bookSheets: true }).SheetNames;
    const sheet = names.find(n => /spot curve\s*$/i.test(n)); if (!sheet) continue;      // "4. spot curve", "4. nominal spot curve", OIS 2009-15 "2. spot curve"
    const wb = XLSX.read(f.content, { type: 'buffer', sheets: [sheet], dense: true });
    const by = parseGlcSpotRows(XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: true }), GLC_TENORS[kind]);
    for (const [t, p] of Object.entries(by)) (out[`${kind}_${String(t).replace('.', 'P')}Y`] ??= []).push(...p);
  }
  return out;
}
export async function fetchBoeCurves({ fetchImpl = fetch, deep = false, xlsx = null, log = console } = {}) {
  const out = {}, fail = [];
  let XLSX = xlsx;
  try { XLSX ??= await import('xlsx'); } catch (e) { return { series: out, fail: [`glc: xlsx not loadable (${e.message})`] }; }
  for (const url of [...(deep ? GLC_HISTORY : []), GLC_LATEST]) {
    try { for (const [id, p] of Object.entries(readGlcZip(await get(fetchImpl, url, 'buffer', 180_000), XLSX))) (out[id] ??= []).push(...p); }
    catch (e) { fail.push(`glc ${url.split('/').pop()}: ${e.message}`); }
  }
  if (fail.length) log.warn?.(`[g10-free] glc: ${fail.join('; ')}`);
  return { series: out, fail };
}

export async function fetchSnb({ fetchImpl = fetch, deep = false, log = console } = {}) {
  const out = {}, fail = [];
  try { const y = snbYieldsAt(await get(fetchImpl, `${SNB}/rendoeid/data/csv/en`, 'text', 90_000)); for (const t of [2, 5, 10]) out[`CH_${t}Y`] = y[t]; } catch (e) { fail.push(`snb rendoeid: ${e.message}`); }
  try { out.SARON = parseSnbCube(await get(fetchImpl, `${SNB}/snbgwdzid/data/csv/en`, 'text', 60_000)).SARON ?? []; } catch (e) { fail.push(`snb saron: ${e.message}`); }
  // The SNB spot curve stopped at 2025-07-31; history only, so pulled on the deep fill.
  if (deep) try { const c = parseSnbCube(await get(fetchImpl, `${SNB}/rendoblid/data/csv/en`, 'text', 90_000)); for (const t of [1, 2, 5, 10, 20, 30]) out[`CH_SPOT_${t}Y`] = c[t === 10 ? '10J0' : `${t}J`] ?? []; } catch (e) { fail.push(`snb rendoblid: ${e.message}`); }
  if (fail.length) log.warn?.(`[g10-free] snb: ${fail.join('; ')}`);
  return { series: out, fail };
}

export async function fetchEcbMoney({ fetchImpl = fetch, log = console } = {}) {
  const out = {}, fail = [];
  try {
    const by = parseSdmxCsvSeries(await get(fetchImpl, `${ECB}/EST/B.EU000A2X2A25.${Object.keys(ESTR_TYPES).join('+')}?format=csvdata&detail=dataonly`, 'text', 90_000), r => ESTR_TYPES[r.DATA_TYPE_EST] ?? null);
    Object.assign(out, by);
  } catch (e) { fail.push(`ecb estr: ${e.message}`); }
  for (const [id, k] of Object.entries(ECB_SERIES)) {
    try { out[id] = parseSdmxCsvSeries(await get(fetchImpl, `${ECB}/${k}?format=csvdata&detail=dataonly`, 'text', 60_000), () => 'x').x ?? []; }
    catch (e) { fail.push(`ecb ${id}: ${e.message}`); }
  }
  if (fail.length) log.warn?.(`[g10-free] ecb: ${fail.join('; ')}`);
  return { series: out, fail };
}

export async function fetchBoj({ fetchImpl = fetch, from = '199501', log = console } = {}) {
  const out = {}, fail = [];
  for (const [id, code] of Object.entries(BOJ_TONA)) {
    try { out[id] = parseBojApi(await get(fetchImpl, `https://www.stat-search.boj.or.jp/api/v1/getDataCode?format=json&lang=en&db=FM01&code=${code}&startDate=${from}`, 'json', 60_000))[code] ?? []; }
    catch (e) { fail.push(`boj ${code}: ${e.message}`); }
  }
  if (fail.length) log.warn?.(`[g10-free] boj: ${fail.join('; ')}`);
  return { series: out, fail };
}

export async function fetchTic({ fetchImpl = fetch, log = console } = {}) {
  const by = new Map(), fail = [];
  for (const url of TIC_URLS) {
    try { for (const r of parseTicMfh(await get(fetchImpl, url))) by.set(r.date, { ...(by.get(r.date) ?? {}), ...r }); }
    catch (e) { fail.push(`tic ${url.split('/').pop()}: ${e.message}`); }
  }
  if (fail.length) log.warn?.(`[g10-free] tic: ${fail.join('; ')}`);
  return { rows: [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1)), fail };
}

export async function fetchCofer({ fetchImpl = fetch, log = console } = {}) {
  try {
    const series = parseSdmxCsvSeries(await get(fetchImpl, COFER_URL, 'text', 90_000, { Accept: 'application/vnd.sdmx.data+csv;version=1.0.0' }),
      r => (r.INDICATOR && r.FXR_CURRENCY && r.TYPE_OF_TRANSFORMATION ? `${r.INDICATOR}_${r.FXR_CURRENCY.replace(/^CI_/, '')}_${r.TYPE_OF_TRANSFORMATION}` : null));
    return { series, fail: [] };
  } catch (e) { log.warn?.(`[g10-free] cofer: ${e.message}`); return { series: {}, fail: [`imf cofer: ${e.message}`] }; }
}

/** Every weekly TFF row for one market, all its names stitched (a later name wins a shared date). */
export async function fetchTffMarket(market, { fetchImpl = fetch, pageSize = 5000 } = {}) {
  const by = new Map();
  for (const name of market.names) {
    for (let offset = 0; offset < 20_000; offset += pageSize) {
      const params = new URLSearchParams({ market_and_exchange_names: name, $limit: String(pageSize), $offset: String(offset), $order: 'report_date_as_yyyy_mm_dd ASC' });
      const page = await get(fetchImpl, `${CFTC}?${params}`, 'json', 45_000);
      for (const r of normaliseTff(page)) by.set(r.date, r);
      if (!Array.isArray(page) || page.length < pageSize) break;
    }
  }
  return [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ── The job ─────────────────────────────────────────────────────────────────────────────────────────────────────────
let _tffAt = 0;
/**
 * Everything above into the archive (archive = js/dataArchive.js instance). Series → archive/series/<family>/<id>.json:
 * g10_yields (UK zero-coupon, CH), overnight (SONIA tails, SARON, TONA), boe (weekly report), boe_glc (fitted curves),
 * ecb, imf. Tables → archive/tables/tic/major_foreign_holders.json and archive/tables/cftc_tff/<sym>.json (weekly).
 * deep: also pull the BoE curve histories and the discontinued SNB spot curve (the first fill; heavy, not daily).
 */
export async function archiveG10Free(archive, { fetchImpl = fetch, fetchBoe = null, deep = false, xlsx = null, log = console, now = Date.now, tffEveryMs = 6 * 864e5, wait = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  if (!archive?.enabled) return { ok: false, reason: 'R2 not configured' };
  const res = { boe: 0, glc: 0, snb: 0, ecb: 0, boj: 0, tic: 0, cofer: 0, tff: 0, failed: [] };
  const put = async (family, series, labels = {}, meta = {}) => {
    let n = 0;
    for (const [id, p] of Object.entries(series ?? {})) {
      if (!p?.length) continue;
      const w = await archive.mergeSeries(family, id, p, { ...meta, ...(labels[id] ? { label: labels[id] } : {}) });
      if (!w.error) n++; else res.failed.push(`${family}/${id}: ${w.error}`);
    }
    return n;
  };
  const step = async (name, fn) => { try { await fn(); } catch (e) { res.failed.push(`${name}: ${e.message}`); } };
  await step('boe iadb', async () => {
    const b = await fetchBoeIadb({ fetchBoe, log }); res.failed.push(...b.fail);
    for (const [family, map] of Object.entries(BOE_IADB)) res.boe += await put(family, b.out[family], Object.fromEntries(Object.entries(map).map(([id, [code, label]]) => [id, `${label} [BoE ${code}]`])), { via: 'BoE IADB' });
  });
  await step('glc', async () => { const g = await fetchBoeCurves({ fetchImpl, deep, xlsx, log }); res.failed.push(...g.fail); res.glc = await put('boe_glc', g.series, {}, { via: 'BoE yield-curve files', unit: '% spot, continuously compounded' }); });
  await step('snb', async () => { const s = await fetchSnb({ fetchImpl, deep, log }); res.failed.push(...s.fail); res.snb = await put('g10_yields', Object.fromEntries(Object.entries(s.series).filter(([k]) => k !== 'SARON')), {}, { via: 'SNB data portal' }) + await put('overnight', { SARON: s.series.SARON }, { SARON: 'SARON (SNB)' }); });
  await step('ecb', async () => { const e = await fetchEcbMoney({ fetchImpl, log }); res.failed.push(...e.fail); res.ecb = await put('ecb', e.series, {}, { via: 'ECB Data Portal' }); });
  await step('boj', async () => { const j = await fetchBoj({ fetchImpl, log }); res.failed.push(...j.fail); res.boj = await put('overnight', j.series, { TONA: 'TONA (BoJ uncollateralised overnight call, average)', TONA_HIGH: 'TONA high', TONA_LOW: 'TONA low' }); });
  await step('tic', async () => { const t = await fetchTic({ fetchImpl, log }); res.failed.push(...t.fail); if (t.rows.length) { const w = await archive.mergeTable('tic', 'major_foreign_holders', t.rows, { unit: '$bn, end of month (dated the 1st)', via: 'US Treasury TIC' }); if (!w.error) res.tic = t.rows.length; else res.failed.push(`tic: ${w.error}`); } });
  await step('cofer', async () => { const c = await fetchCofer({ fetchImpl, log }); res.failed.push(...c.fail); res.cofer = await put('imf', c.series, {}, { via: 'IMF COFER', note: 'NV_USD in US dollars, SHRO_PT in % of allocated reserves; quarter dated its first day' }); });
  if (now() - _tffAt > tffEveryMs) {
    for (const m of TFF_MARKETS) {
      try { const rows = await fetchTffMarket(m, { fetchImpl }); if (rows.length) { const w = await archive.mergeTable('cftc_tff', m.sym, rows, { names: m.names, dataset: 'gpe5-46if (TFF futures only)' }); if (!w.error) res.tff++; } }
      catch (e) { res.failed.push(`tff ${m.sym}: ${e.message}`); }
      await wait(500);
    }
    if (res.tff) _tffAt = now();
  }
  log.log?.(`[g10-free] BoE ${res.boe}, curves ${res.glc}, SNB ${res.snb}, ECB ${res.ecb}, BoJ ${res.boj}, TIC ${res.tic} months, COFER ${res.cofer}, TFF ${res.tff} markets${res.failed.length ? `; failed: ${res.failed.slice(0, 6).join('; ')}` : ''}`);
  return { ok: true, ...res };
}
/** Test hook: forget the weekly TFF stamp. */
export const _resetTffClock = () => { _tffAt = 0; };
