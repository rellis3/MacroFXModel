/**
 * Daily 2-year and 10-year government yields from each issuer (plans/DESK_ANALYST_PIPELINE.md §9ag), for the global
 * yield board. Each fetcher returns ascending [{ date: 'YYYY-MM-DD', value: % }]. Keyless except the US (FRED, through
 * the server's fetchFredObservations) and the UK (BoE IADB through the same helper's BOE_ ids).
 *
 *   DE  Bundesbank BBSIS ...R02XX / R10XX   2y and 10y Federal securities, same day
 *   JP  MoF Japan jgbcme(.csv, _all.csv)     2Y and 10Y columns, ~1 day behind
 *   CA  Bank of Canada Valet BD.CDN.2YR / 10YR benchmark bond yields
 *   AU  RBA statistical table F2            Australian Government 2 and 10 year bonds
 *
 * The parsers are pure and tested (js/yieldFeeds.test.mjs).
 */
import { parseBubaCsv, parseMofCsv } from './intlYields.js';

const UA = { 'User-Agent': 'Mozilla/5.0 MacroFXDashboard' };
const text = async (url, ms = 45_000) => { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(`${new URL(url).host} HTTP ${r.status}`); return r.text(); };
const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

export const bubaUrl = tenor => `https://api.statistiken.bundesbank.de/rest/download/BBSIS/D.I.ZAR.ZI.EUR.S1311.B.A604.R${tenor}XX.R.A.A._Z._Z.A?format=csv&lang=en`;
export async function fetchBund(tenor = '02') { return parseBubaCsv(await text(bubaUrl(tenor))); }

/** JGBs: the full history file plus the current month, one tenor column. */
export async function fetchJgb(tenor = '2Y', { history = true } = {}) {
  const base = 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/';
  const cur = await text(base + 'jgbcme.csv'), all = history ? await text(base + 'historical/jgbcme_all.csv', 90_000) : '';
  const m = new Map(); for (const p of [...(history ? parseMofCsv(all, tenor) : []), ...parseMofCsv(cur, tenor)]) m.set(p.date, p.value);
  return [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, value]) => ({ date, value }));
}
/** Both JGB tenors from one download of each file. */
export async function fetchJgbBoth() {
  const base = 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/';
  const [cur, all] = await Promise.all([text(base + 'jgbcme.csv'), text(base + 'historical/jgbcme_all.csv', 90_000)]);
  const merge = t => { const m = new Map(); for (const p of [...parseMofCsv(all, t), ...parseMofCsv(cur, t)]) m.set(p.date, p.value); return [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, value]) => ({ date, value })); };
  return { y2: merge('2Y'), y10: merge('10Y') };
}

/** Bank of Canada Valet JSON for several series → { id: [{date, value}] } (Valet lists newest first: sorted here). */
export function parseValet(json, ids) {
  const out = Object.fromEntries(ids.map(i => [i, []]));
  for (const o of json?.observations ?? []) for (const i of ids) { const v = parseFloat(o?.[i]?.v); if (o?.d && Number.isFinite(v)) out[i].push({ date: o.d, value: v }); }
  for (const i of ids) out[i].sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}
export async function fetchCanada({ recent = 600 } = {}) {
  const ids = ['BD.CDN.2YR.DQ.YLD', 'BD.CDN.10YR.DQ.YLD'], j = JSON.parse(await text(`https://www.bankofcanada.ca/valet/observations/${ids.join(',')}/json?recent=${Math.max(1, Math.round(recent))}`));
  const p = parseValet(j, ids); return { y2: p[ids[0]], y10: p[ids[1]] };
}

/** RBA F2 CSV: a "Title," row naming the columns, then rows "28-Oct-2026,4.951,...". */
export function parseRbaF2(csv, column) {
  const lines = String(csv ?? '').split(/\r?\n/), head = lines.find(l => /^Title,/.test(l)); if (!head) return [];
  const col = head.split(',').indexOf(column); if (col < 1) return [];
  const out = [];
  for (const l of lines) { const c = l.split(','), m = /^(\d{2})-([A-Z][a-z]{2})-(\d{4})$/.exec(c[0]); if (!m) continue; const v = parseFloat(c[col]); if (Number.isFinite(v)) out.push({ date: `${m[3]}-${MON[m[2]]}-${m[1]}`, value: v }); }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
export async function fetchAustralia() {
  const csv = await text('https://www.rba.gov.au/statistics/tables/csv/f2-data.csv');
  return { y2: parseRbaF2(csv, 'Australian Government 2 year bond'), y10: parseRbaF2(csv, 'Australian Government 10 year bond') };
}
