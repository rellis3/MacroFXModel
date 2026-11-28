/**
 * Macro capture (plans/DATA_CAPTURE_G10.md): the G10 rates, funding, repo, auction and intraday-vol series the
 * desk did not hold, fetched daily and merged into the R2 archive (js/dataArchive.js) so the history starts now.
 *
 *   G10 government yields (daily)  BoC Valet (CA), RBA F2 (AU), Riksbank SWEA (SE), Norges Bank (NO),
 *                                  ECB AAA curve (EA), Japan MoF (JP); UK gilts through server.js's BoE fetcher
 *   US money markets (daily)       NY Fed: SOFR / BGCR / TGCR / EFFR / OBFR with 1st-99th percentiles and volume;
 *                                  ON RRP and standing repo take-up
 *   Repo segments (daily, monthly) OFR short-term funding monitor: DVP / GCF / tri-party rates and volumes; MMF holdings
 *   Treasury auctions              TreasuryDirect: yield, bid-to-cover, who bought (indirect / direct / dealers)
 *   Intraday (15-min)              Yahoo: MOVE, the ICE dollar index, Treasury yields and futures, VIX, credit ETFs
 *
 * Every fetcher returns { id: [{date, value}] } (or table rows); one failure never stops the rest. Pure parsers are
 * exported and tested in js/macroCapture.test.mjs with fixtures, so the tests need no network.
 */

const T = (ms = 40_000) => AbortSignal.timeout(ms);
const UA = { 'User-Agent': 'Mozilla/5.0' };
const isoOk = d => /^\d{4}-\d{2}-\d{2}$/.test(d);
const num = v => { const x = Number(String(v ?? '').trim()); return String(v ?? '').trim() !== '' && Number.isFinite(x) ? x : null; };
const pts = (rows) => rows.filter(o => o && isoOk(o.date) && Number.isFinite(o.value));
const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const pad = n => String(n).padStart(2, '0');

/** A CSV line split that respects double quotes (ECB titles contain commas). */
export function splitCsv(line, sep = ',') {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === sep && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out;
}
/** SDMX-style CSV with TIME_PERIOD and OBS_VALUE columns (ECB csvdata, Norges Bank) → points. */
export function parseSdmxCsv(text, sep = ',') {
  const rows = String(text ?? '').trim().split(/\r?\n/); if (rows.length < 2) return [];
  const h = splitCsv(rows[0], sep).map(s => s.trim()), di = h.indexOf('TIME_PERIOD'), vi = h.indexOf('OBS_VALUE');
  if (di < 0 || vi < 0) return [];
  return pts(rows.slice(1).map(l => { const c = splitCsv(l, sep); return { date: c[di]?.trim(), value: num(c[vi]) }; }));
}
/** RBA statistical table CSV (header block, a "Series ID" row, then DD-Mon-YYYY rows) → { seriesId: points }. */
export function parseRbaCsv(text) {
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/).map(l => splitCsv(l));
  const hi = lines.findIndex(r => r[0]?.trim() === 'Series ID'); if (hi < 0) return {};
  const ids = lines[hi].slice(1).map(s => s.trim()), out = Object.fromEntries(ids.filter(Boolean).map(id => [id, []]));
  for (const r of lines.slice(hi + 1)) {
    const m = r[0]?.trim().match(/^(\d{1,2})-([A-Z][a-z]{2})-(\d{4})$/); if (!m || !MON[m[2]]) continue;
    const date = `${m[3]}-${pad(MON[m[2]])}-${pad(m[1])}`;
    ids.forEach((id, k) => { const v = num(r[k + 1]); if (id && v != null) out[id].push({ date, value: v }); });
  }
  return out;
}
/** Japan MoF JGB constant-maturity CSV (two title rows, then Y/M/D rows; '-' = none) → { '2Y': points, ... }. */
export function parseMofCsv(text) {
  const lines = String(text ?? '').split(/\r?\n/).map(l => splitCsv(l));
  const hi = lines.findIndex(r => r[0]?.trim() === 'Date'); if (hi < 0) return {};
  const cols = lines[hi].map(s => s.trim()), out = {};
  for (const r of lines.slice(hi + 1)) {
    const m = r[0]?.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/); if (!m) continue;
    const date = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    for (let k = 1; k < cols.length; k++) { const v = num(r[k]); if (v != null) (out[cols[k]] ??= []).push({ date, value: v }); }
  }
  return out;
}
/** BoC Valet observations JSON → { seriesName: points }. */
export function parseValet(json, names) {
  const out = Object.fromEntries(names.map(n => [n, []]));
  for (const o of json?.observations ?? []) for (const n of names) { const v = num(o?.[n]?.v); if (v != null && isoOk(o.d)) out[n].push({ date: o.d, value: v }); }
  return out;
}
/** NY Fed reference-rate JSON (refRates[]) → { RATE, RATE_P1, RATE_P25, RATE_P75, RATE_P99, RATE_VOL } for one type. */
export function parseNyFedRates(json, id) {
  const f = { '': 'percentRate', _P1: 'percentPercentile1', _P25: 'percentPercentile25', _P75: 'percentPercentile75', _P99: 'percentPercentile99', _VOL: 'volumeInBillions' };
  const out = Object.fromEntries(Object.keys(f).map(s => [`${id}${s}`, []]));
  for (const r of json?.refRates ?? []) for (const [s, k] of Object.entries(f)) { const v = num(r?.[k]); if (v != null && isoOk(r.effectiveDate)) out[`${id}${s}`].push({ date: r.effectiveDate, value: v }); }
  return out;
}
/** NY Fed repo / reverse-repo operations → $bn accepted per day (several operations on one day are summed). */
export function parseNyFedOps(json, type) {
  const by = new Map();
  for (const o of json?.repo?.operations ?? []) {
    if (type && o?.operationType !== type) continue;
    const v = num(o?.totalAmtAccepted); if (v == null || !isoOk(o.operationDate)) continue;
    by.set(o.operationDate, (by.get(o.operationDate) ?? 0) + v / 1e9);
  }
  return [...by].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, value]) => ({ date, value: +value.toFixed(3) }));
}
/** OFR timeseries ([[date, value]]) → points. */
export const parseOfr = arr => pts((Array.isArray(arr) ? arr : []).map(r => ({ date: r?.[0], value: num(r?.[1]) })));
/** TreasuryDirect auctioned securities → table rows, one per auction, with the indirect (foreign and fund) share. */
export function parseAuctions(list) {
  const out = [];
  for (const a of Array.isArray(list) ? list : []) {
    const date = String(a?.auctionDate || a?.competitiveAuctionCloseDate || '').slice(0, 10); if (!isoOk(date)) continue;
    const ind = num(a.indirectBiddersCompetitiveParAwarded) ?? 0, dir = num(a.directBiddersCompetitiveParAwarded) ?? 0, pd = num(a.primaryDealersCompetitiveParAwarded) ?? 0, comp = ind + dir + pd;
    out.push({
      date, cusip: a.cusip, type: a.type || a.securityType, term: a.originalSecurityTerm || a.securityTerm, termLeft: a.securityTerm, reopening: a.reopening === 'Yes',
      highYield: num(a.highYield), highRate: num(a.highRate), investmentRate: num(a.investmentRate), medianYield: num(a.medianYield) ?? num(a.medianRate), bidToCover: num(a.bidToCoverRatio),
      offeringBn: num(a.offeringAmount) != null ? +(num(a.offeringAmount) / 1e9).toFixed(3) : null,
      indirectShare: comp > 0 ? +(ind / comp).toFixed(4) : null, directShare: comp > 0 ? +(dir / comp).toFixed(4) : null, dealerShare: comp > 0 ? +(pd / comp).toFixed(4) : null,
    });
  }
  return out;
}
/** Yahoo intraday chart → { date: { t: [epoch s], c: [close] } } grouped by UTC date, empty bars dropped. */
export function parseYahooIntraday(payload) {
  const r = payload?.chart?.result?.[0], ts = r?.timestamp ?? [], cl = r?.indicators?.quote?.[0]?.close ?? [], out = {};
  for (let i = 0; i < ts.length; i++) {
    const v = cl[i]; if (v == null || !Number.isFinite(v)) continue;
    const d = new Date(ts[i] * 1000).toISOString().slice(0, 10), o = (out[d] ??= { t: [], c: [] });
    o.t.push(ts[i]); o.c.push(+v.toPrecision(8));
  }
  return out;
}

// ── What is captured ───────────────────────────────────────────────────────────────────────────────────────────────
export const G10_YIELDS = {
  CA_2Y: 'Canada 2y', CA_5Y: 'Canada 5y', CA_10Y: 'Canada 10y', CA_LONG: 'Canada long bond',
  AU_2Y: 'Australia 2y', AU_3Y: 'Australia 3y', AU_5Y: 'Australia 5y', AU_10Y: 'Australia 10y', AU_10Y_REAL: 'Australia 10y indexed (real)',
  SE_2Y: 'Sweden 2y', SE_5Y: 'Sweden 5y', SE_10Y: 'Sweden 10y',
  NO_3Y: 'Norway 3y', NO_5Y: 'Norway 5y', NO_10Y: 'Norway 10y',
  EA_2Y: 'Euro area AAA 2y', EA_5Y: 'Euro area AAA 5y', EA_10Y: 'Euro area AAA 10y', EA_30Y: 'Euro area AAA 30y',
  JP_2Y: 'Japan 2y', JP_5Y: 'Japan 5y', JP_10Y: 'Japan 10y', JP_30Y: 'Japan 30y',
  UK_5Y: 'UK gilt 5y (par)', UK_10Y: 'UK gilt 10y (par)', UK_20Y: 'UK gilt 20y (par)',
};
export const UK_GILT_CODES = { UK_5Y: 'IUDSNPY', UK_10Y: 'IUDMNPY', UK_20Y: 'IUDLNPY' };
const BOC = { CA_2Y: 'BD.CDN.2YR.DQ.YLD', CA_5Y: 'BD.CDN.5YR.DQ.YLD', CA_10Y: 'BD.CDN.10YR.DQ.YLD', CA_LONG: 'BD.CDN.LONG.DQ.YLD' };
const RBA = { AU_2Y: 'FCMYGBAG2D', AU_3Y: 'FCMYGBAG3D', AU_5Y: 'FCMYGBAG5D', AU_10Y: 'FCMYGBAG10D', AU_10Y_REAL: 'FCMYGBAGID' };
const RIKS = { SE_2Y: 'SEGVB2YC', SE_5Y: 'SEGVB5YC', SE_10Y: 'SEGVB10YC' };
const NORGES = { NO_3Y: '3Y', NO_5Y: '5Y', NO_10Y: '10Y' };
const ECB = { EA_2Y: 'SR_2Y', EA_5Y: 'SR_5Y', EA_10Y: 'SR_10Y', EA_30Y: 'SR_30Y' };
const MOF = { JP_2Y: '2Y', JP_5Y: '5Y', JP_10Y: '10Y', JP_30Y: '30Y' };

export const NYFED_RATES = { SOFR: 'secured/sofr', BGCR: 'secured/bgcr', TGCR: 'secured/tgcr', EFFR: 'unsecured/effr', OBFR: 'unsecured/obfr' };
export const OFR_SERIES = {
  // preliminary prints (the final ones lag by months); a later revision keeps the first print beside it (mergePoints)
  DVP_RATE: 'REPO-DVP_AR_OO-P', GCF_RATE: 'REPO-GCF_AR_OO-P', TRI_RATE: 'REPO-TRI_AR_OO-P',
  DVP_VOL: 'REPO-DVP_TV_OO-P', GCF_VOL: 'REPO-GCF_TV_OO-P', TRI_VOL: 'REPO-TRI_TV_OO-P',
  MMF_TOTAL: 'MMF-MMF_TOT-M', MMF_TREASURIES: 'MMF-MMF_T_TOT-M', MMF_REPO: 'MMF-MMF_RP_TOT-M', MMF_REPO_FED: 'MMF-MMF_RP_wFR-M', MMF_REPO_FICC: 'MMF-MMF_RP_wFICC-M',
};
/** Intraday 15-minute series (Yahoo keeps about 60 days, so a daily pull loses nothing). */
export const INTRADAY_15M = {
  MOVE: '^MOVE', DXY: 'DX-Y.NYB', TNX: '^TNX', FVX: '^FVX', TYX: '^TYX', IRX: '^IRX',
  ZT: 'ZT=F', ZN: 'ZN=F', ZB: 'ZB=F', SR3: 'SR3=F', ZQ: 'ZQ=F', VIX: '^VIX', HYG: 'HYG', LQD: 'LQD', KRE: 'KRE',
  IGLT: 'IGLT.L', INXG: 'INXG.L', VGOV: 'VGOV.L',   // UK gilt ETFs (LSE hours only; no ICE Europe gilt futures feed), 2026-11-28
};
/** FRED series the archive job adds (stress, banking, balance sheets, more of the ICE BofA credit family). */
export const FRED_EXTRA = [
  'STLFSI4', 'NFCI', 'ANFCI',                                   // financial stress / conditions (weekly)
  'DTWEXAFEGS',                                                  // dollar vs the advanced economies (the G10 dollar, weekly release)
  'ECBASSETSW', 'JPNASSETS', 'TREAST', 'WSHOMCB',                // ECB and BoJ balance sheets; Fed Treasuries and MBS held
  'M2SL', 'BUSLOANS', 'DPSACBW027SBOG', 'DRTSCILM',              // money, bank loans, deposits, loan officers tightening
  'BAMLC0A1CAAA', 'BAMLC0A2CAA', 'BAMLC0A3CA', 'BAMLH0A0HYM2EY', 'BAMLC0A0CMEY', 'BAMLEMHBHYCRPIOAS', 'BAMLEMIBHGCRPIOAS',
];
export const AUCTION_TYPES = ['Bill', 'Note', 'Bond', 'TIPS', 'FRN'];

// ── Fetchers ────────────────────────────────────────────────────────────────────────────────────────────────────────
async function get(fetchImpl, url, kind = 'text', ms) {
  const r = await fetchImpl(url, { headers: UA, signal: T(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url.slice(0, 80)}`);
  return kind === 'json' ? r.json() : r.text();
}
const remap = (by, map) => Object.fromEntries(Object.entries(map).map(([id, k]) => [id, by[k] ?? []]));

export async function fetchG10Yields({ fetchImpl = fetch, from = '2000-01-01', fetchBoe = null, log = console } = {}) {
  const out = {}, fail = [];
  const step = async (name, fn) => { try { Object.assign(out, await fn()); } catch (e) { fail.push(`${name}: ${e.message}`); } };
  await step('boc', async () => remap(parseValet(await get(fetchImpl, `https://www.bankofcanada.ca/valet/observations/${Object.values(BOC).join(',')}/json?start_date=${from}`, 'json'), Object.values(BOC)), BOC));
  await step('rba', async () => remap(parseRbaCsv(await get(fetchImpl, 'https://www.rba.gov.au/statistics/tables/csv/f2-data.csv')), RBA));
  for (const [id, s] of Object.entries(RIKS)) await step(`riksbank ${s}`, async () => {
    const j = await get(fetchImpl, `https://api.riksbank.se/swea/v1/Observations/${s}/${from}`, 'json');
    return { [id]: pts((Array.isArray(j) ? j : []).map(o => ({ date: o?.date, value: num(o?.value) }))) };
  });
  for (const [id, t] of Object.entries(NORGES)) await step(`norges ${t}`, async () => ({ [id]: parseSdmxCsv(await get(fetchImpl, `https://data.norges-bank.no/api/data/GOVT_GENERIC_RATES/B.${t}.GBON?format=csv&startPeriod=${from}`), ';') }));
  for (const [id, t] of Object.entries(ECB)) await step(`ecb ${t}`, async () => ({ [id]: parseSdmxCsv(await get(fetchImpl, `https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.${t}?format=csvdata&startPeriod=${from}`, 'text', 60_000)) }));
  await step('mof', async () => {
    const hist = parseMofCsv(await get(fetchImpl, 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv', 'text', 60_000));
    const cur = parseMofCsv(await get(fetchImpl, 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv'));
    return Object.fromEntries(Object.entries(MOF).map(([id, k]) => [id, [...(hist[k] ?? []).filter(p => p.date >= from), ...(cur[k] ?? [])]]));
  });
  if (fetchBoe) for (const [id, code] of Object.entries(UK_GILT_CODES)) await step(`boe ${code}`, async () => {
    const m = await fetchBoe(`BOE_${code}`, from);
    return { [id]: pts(Array.isArray(m) ? m : [...m].map(([date, value]) => ({ date, value }))) };
  });
  if (fail.length) log.warn?.(`[macro-capture] yields: ${fail.join('; ')}`);
  return { series: out, fail };
}

export async function fetchNyFed({ fetchImpl = fetch, from = '2018-04-02', to = new Date().toISOString().slice(0, 10), log = console } = {}) {
  const out = {}, fail = [];
  for (const [id, path] of Object.entries(NYFED_RATES)) {
    try { Object.assign(out, parseNyFedRates(await get(fetchImpl, `https://markets.newyorkfed.org/api/rates/${path}/search.json?startDate=${from}&endDate=${to}`, 'json', 60_000), id)); }
    catch (e) { fail.push(`${id}: ${e.message}`); }
  }
  try { out.ON_RRP = parseNyFedOps(await get(fetchImpl, `https://markets.newyorkfed.org/api/rp/reverserepo/propositions/search.json?startDate=2014-01-01&endDate=${to}`, 'json', 60_000), 'Reverse Repo'); } catch (e) { fail.push(`ON_RRP: ${e.message}`); }
  // Fed repo (standing repo facility) take-up is FRED RPONTSYD, already archived by the FRED job.
  if (fail.length) log.warn?.(`[macro-capture] nyfed: ${fail.join('; ')}`);
  return { series: out, fail };
}

export async function fetchOfr({ fetchImpl = fetch, log = console } = {}) {
  const out = {}, fail = [];
  for (const [id, m] of Object.entries(OFR_SERIES)) {
    try { out[id] = parseOfr(await get(fetchImpl, `https://data.financialresearch.gov/v1/series/timeseries?mnemonic=${encodeURIComponent(m)}`, 'json', 60_000)); }
    catch (e) { fail.push(`${id}: ${e.message}`); }
  }
  if (fail.length) log.warn?.(`[macro-capture] ofr: ${fail.join('; ')}`);
  return { series: out, fail };
}

export async function fetchAuctions({ fetchImpl = fetch, pagesize = 2000, log = console } = {}) {
  const rows = [], fail = [];
  for (const t of AUCTION_TYPES) {
    try { rows.push(...parseAuctions(await get(fetchImpl, `https://www.treasurydirect.gov/TA_WS/securities/auctioned?format=json&type=${t}&pagesize=${pagesize}`, 'json', 60_000))); }
    catch (e) { fail.push(`${t}: ${e.message}`); }
  }
  if (fail.length) log.warn?.(`[macro-capture] auctions: ${fail.join('; ')}`);
  return { rows, fail };
}

export async function fetchIntraday({ fetchImpl = fetch, range = '5d', log = console } = {}) {
  const out = {}, fail = [];
  for (const [id, t] of Object.entries(INTRADAY_15M)) {
    try { out[id] = parseYahooIntraday(await get(fetchImpl, `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?interval=15m&range=${range}`, 'json')); }
    catch (e) { fail.push(`${id}: ${e.message}`); }
    await new Promise(r => setTimeout(r, 300));
  }
  if (fail.length) log.warn?.(`[macro-capture] intraday: ${fail.join('; ')}`);
  return { byId: out, fail };
}

/**
 * The daily job: everything above into the archive. archive = js/dataArchive.js instance. Returns counts per family.
 * Series go to archive/series/<family>/<id>.json, auctions to archive/tables/ust_auctions/<type>_<term>.json, and the
 * intraday bars to archive/i15_<ID>/<YYYY>/<date>.json (a finished day is never rewritten with fewer bars).
 */
export async function archiveMacro(archive, { fetchImpl = fetch, fetchBoe = null, getJSON = null, log = console } = {}) {
  if (!archive?.enabled) return { ok: false, reason: 'R2 not configured' };
  const res = { yields: 0, nyfed: 0, ofr: 0, auctions: 0, intradayDays: 0, failed: [] };
  const put = async (family, series, labels = {}) => {
    let n = 0;
    for (const [id, p] of Object.entries(series)) {
      if (!p?.length) continue;
      const w = await archive.mergeSeries(family, id, p, labels[id] ? { label: labels[id] } : {});
      if (!w.error) n++; else res.failed.push(`${family}/${id}: ${w.error}`);
    }
    return n;
  };
  const y = await fetchG10Yields({ fetchImpl, fetchBoe, log }); res.failed.push(...y.fail); res.yields = await put('g10_yields', y.series, G10_YIELDS);
  const f = await fetchNyFed({ fetchImpl, log }); res.failed.push(...f.fail); res.nyfed = await put('nyfed', f.series);
  const o = await fetchOfr({ fetchImpl, log }); res.failed.push(...o.fail); res.ofr = await put('ofr', o.series);
  const a = await fetchAuctions({ fetchImpl, log }); res.failed.push(...a.fail);
  const byKey = new Map(); for (const r of a.rows) { const k = `${r.type}_${r.term}`; (byKey.get(k) ?? byKey.set(k, []).get(k)).push(r); }
  for (const [k, rows] of byKey) {
    // two auctions of the same type and term on one date (cash-management bills) keep the larger offering
    const one = new Map(); for (const r of rows) { const c = one.get(r.date); if (!c || (r.offeringBn ?? 0) > (c.offeringBn ?? 0)) one.set(r.date, r); }
    const w = await archive.mergeTable('ust_auctions', k, [...one.values()]); if (!w.error) res.auctions++;
  }
  const it = await fetchIntraday({ fetchImpl, log }); res.failed.push(...it.fail);
  for (const [id, days] of Object.entries(it.byId)) for (const [date, bars] of Object.entries(days)) {
    const src = `i15_${id}`, key = `archive/${src}/${date.slice(0, 4)}/${date}.json`;
    if (getJSON) { const prev = await getJSON(key).catch(() => null); if ((prev?.payload?.t?.length ?? 0) >= bars.t.length) continue; }
    const w = await archive.snapshot(src, date, { ticker: INTRADAY_15M[id], interval: '15m', ...bars }); if (w.wrote) res.intradayDays++;
  }
  log.log?.(`[macro-capture] ${res.yields} G10 yields, ${res.nyfed} NY Fed, ${res.ofr} OFR series, ${res.auctions} auction tables, ${res.intradayDays} intraday days${res.failed.length ? `; failed: ${res.failed.slice(0, 6).join('; ')}` : ''}`);
  return { ok: true, ...res };
}
