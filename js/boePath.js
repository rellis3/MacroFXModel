// js/boePath.js: the Bank of England's market-implied Bank Rate path, from its own free OIS curve (no account, no key), as meeting-by-meeting priced moves.
// Pure apart from the injected fetch / xlsx loader, so it is tested with fixtures (tests/fixtures/boe_*). server.js owns the timer, the KV and the route.
//
// SOURCES (all the Bank's own public files; tested 2026-11-16):
//   curve   latest-yield-curve-data.zip (300 KB): 'OIS daily data current month.xlsx', sheet '1. fwds, short end' = the instantaneous OIS forward rate at 1..60 months
//           for every business day of the month so far. Updated by noon the next business day; the server answers If-Modified-Since with 304.
//   history oisddata.zip (11.8 MB): 'OIS daily data_2025 to present.xlsx' (1.4 MB, same sheet layout), read by HTTP range so a first-run backfill costs 1.4 MB.
//   rate    the database CSV for IUDBEDR, the official Bank Rate (daily).
//   dates   the MPC dates page (2026 and 2027 confirmed dates); MPC_DATES below is the hand-kept copy used when the page cannot be read.
//
// METHOD, plainly (the card says this too): the OIS curve is a smoothed fit of SONIA swap rates, so it gives the average overnight rate the market expects at each
// future date. For each meeting we take the average expected rate in the window AFTER it (until the next meeting) minus the average in the window BEFORE it
// (for the first meeting: from the curve date to the meeting). That difference is the move priced at that meeting. Levels are anchored to the official Bank Rate
// today, so basis between SONIA and Bank Rate never enters. Probability: a move of d bp is read as a (|d|/25) chance of one 25bp step, capped at 100%; at or beyond
// 25bp it says "more than one step priced" instead. Because the Bank's curve is smoothed, one meeting's size blurs into its neighbours: read the running level
// before the single step. This is what is PRICED, not a forecast, and a 25bp step is the Bank's habit, not a rule.

export const BOE_ZIP_URL = 'https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/latest-yield-curve-data.zip';
export const BOE_ARCHIVE_URL = 'https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/oisddata.zip';
export const BOE_MPC_URL = 'https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates';
export const bankRateCsvUrl = (fromISO, toISO = null) => {
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const f = new Date(fromISO + 'T00:00:00Z'), fm = `${String(f.getUTCDate()).padStart(2, '0')}/${m[f.getUTCMonth()]}/${f.getUTCFullYear()}`;
  let to = 'now';
  if (toISO) { const d = new Date(toISO + 'T00:00:00Z'); to = `${String(d.getUTCDate()).padStart(2, '0')}/${m[d.getUTCMonth()]}/${d.getUTCFullYear()}`; }
  return `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${fm}&Dateto=${to}&SeriesCodes=IUDBEDR&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
};
const UA = 'Mozilla/5.0 (compatible; MacroFXDesk/1.0)';

/** The MPC announcement dates the Bank publishes (page read 2026-11-16: "2026 confirmed dates" and "2027 confirmed dates"). Re-read from the page by the timer; this list is the fallback. */
export const MPC_DATES = [
  '2026-02-05', '2026-03-19', '2026-04-30', '2026-06-18', '2026-07-30', '2026-09-17', '2026-11-05', '2026-12-17',
  '2027-02-04', '2027-03-18', '2027-04-29', '2027-06-17', '2027-07-29', '2027-09-16', '2027-11-04', '2027-12-16',
];
export const MPC_LIST_VERIFIED = '2026-11-16';

const p2 = n => String(n).padStart(2, '0');
const MON = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const fin = v => typeof v === 'number' && Number.isFinite(v);
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const dayMs = 86400000;
const dayNum = iso => Math.round(Date.parse(iso + 'T00:00:00Z') / dayMs);
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * dayMs).toISOString().slice(0, 10);
const todayISO = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** Excel serial day number -> 'YYYY-MM-DD' (1900 system; the 1899-12-30 epoch absorbs Excel's phantom 29 Feb 1900). */
export const excelSerialToISO = n => new Date(Math.round((n - 25569) * dayMs)).toISOString().slice(0, 10);

// ── parsing ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * The '1. fwds, short end' sheet as rows (SheetJS sheet_to_json header:1, raw:true) -> { months: [1..60], snaps: [{ d, f: [60 numbers] }] }.
 * A header row has 'months:' in column A; a data row has an Excel date serial (or an ISO string or a Date) in column A and numbers after it.
 * Rows with no numbers (the file starts each year with an empty holiday row) are skipped, never filled.
 */
export function parseForwardRows(rows) {
  const hi = rows.findIndex(r => /^months/i.test(String(r?.[0] ?? '').trim()));
  if (hi < 0) throw new Error('BoE OIS sheet: no "months:" header row');
  const months = rows[hi].slice(1).map(v => (fin(v) ? Math.round(v) : null));
  const last = months.reduce((a, v, i) => (v != null ? i : a), -1);
  if (last < 11) throw new Error('BoE OIS sheet: the maturity header is too short');
  const grid = months.slice(0, last + 1);
  if (grid.some((m, i) => m !== i + 1)) throw new Error('BoE OIS sheet: maturities are not 1..N months in order');
  const snaps = [];
  for (const r of rows.slice(hi + 1)) {
    const a = r?.[0];
    let d = null;
    if (fin(a) && a > 30000 && a < 80000) d = excelSerialToISO(a);
    else if (a instanceof Date && Number.isFinite(a.getTime())) d = new Date(a.getTime() - a.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    else if (typeof a === 'string' && /^\d{4}-\d{2}-\d{2}/.test(a)) d = a.slice(0, 10);
    if (!d) continue;
    const f = grid.map((_, i) => r[i + 1]);
    if (f.some(v => !fin(v))) continue;   // a partial row is no curve
    snaps.push({ d, f: f.map(r3) });
  }
  snaps.sort((x, y) => (x.d < y.d ? -1 : 1));
  if (!snaps.length) throw new Error('BoE OIS sheet: no dated curve rows');
  return { months: grid, snaps };
}

/** Pick the short-end forward sheet from a workbook's sheet names. */
export const pickForwardSheet = names => names.find(n => /fwd/i.test(n) && /short/i.test(n)) ?? null;

/** BoE database CSV (DATE,IUDBEDR) -> [{ date, rate }] ascending. */
export function parseBankRateCsv(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*(\d{1,2}) ([A-Za-z]{3}) (\d{4})\s*,\s*([0-9.]+)\s*$/.exec(line);
    if (!m) continue;
    const mi = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].toLowerCase());
    const rate = Number(m[4]);
    if (mi >= 0 && Number.isFinite(rate)) out.push({ date: `${m[3]}-${p2(mi + 1)}-${p2(m[1])}`, rate });
  }
  if (!out.length) throw new Error('BoE Bank Rate CSV: no rows (the answer was not the expected file)');
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
/** Keep only the rows where the rate changed, plus the first and last row: the rate in force on any date is unchanged, and the stored copy stays tiny. */
export const compactRates = rows => (rows ?? []).filter((r, i, all) => i === 0 || i === all.length - 1 || r.rate !== all[i - 1].rate);
/** The Bank Rate in force on `iso` (the last published row on or before it), or null. */
export function bankRateOn(rates, iso) {
  let v = null;
  for (const r of rates) { if (r.date <= iso) v = r.rate; else break; }
  return v;
}

/** The MPC dates page -> ISO dates. Reads "YYYY confirmed dates" blocks and "Thursday 5 February" lines inside them. */
export function parseMpcPage(html) {
  const text = String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, '\n').replace(/&nbsp;|&#160;| /g, ' ')
    .split(/\n+/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = [];
  let year = null;
  for (const line of text) {
    const y = /^(\d{4}) confirmed dates$/i.exec(line);
    if (y) { year = Number(y[1]); continue; }
    if (year == null) continue;
    if (/^Monetary Policy Committee (voting history|Reports)/i.test(line)) { year = null; continue; }
    const m = /^(?:Monday|Tuesday|Wednesday|Thursday|Friday)\s+(\d{1,2})\s+([A-Za-z]+)$/i.exec(line);
    if (m && MON[m[2].toLowerCase()]) out.push(`${year}-${p2(MON[m[2].toLowerCase()])}-${p2(m[1])}`);
  }
  return [...new Set(out)].sort();
}

// ── the curve arithmetic ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The forward rate (percent) at `tYears` from the curve date: linear between the monthly points, flat before the first and after the last. */
export function forwardAt(months, f, tYears) {
  const x = tYears * 12;
  if (x <= months[0]) return f[0];
  const last = months.length - 1;
  if (x >= months[last]) return f[last];
  const i = Math.min(last - 1, Math.floor(x) - 1);   // months[i] = i + 1
  const w = (x - months[i]) / (months[i + 1] - months[i]);
  return f[i] + w * (f[i + 1] - f[i]);
}
/** The average forward rate over [fromDay, toDay) given in days from the curve date (daily steps, midpoints). A window shorter than a day is read at its start. */
export function windowMean(months, f, fromDay, toDay) {
  const a = Math.max(0, fromDay), b = Math.max(a, toDay);
  if (b - a < 1) return forwardAt(months, f, a / 365);
  let s = 0, n = 0;
  for (let d = a; d < b; d += 1) { s += forwardAt(months, f, (d + 0.5) / 365); n++; }
  return s / n;
}

/** A move of `stepBp` read as a chance of one 25bp step (or "more than one step"). */
export function readStep(stepBp, unit = 25) {
  const a = Math.abs(stepBp), dir = stepBp > 0.5 ? 'hike' : stepBp < -0.5 ? 'cut' : 'hold';
  if (dir === 'hold') return { dir, pMove: 0, steps: 0, multi: false };
  if (a >= unit) return { dir, pMove: 1, steps: r2(a / unit), multi: true };
  return { dir, pMove: r2(a / unit), steps: r2(a / unit), multi: false };
}

/**
 * The priced path for one curve.
 *   curve    { months, f }                the forward curve (percent) on `valuation`
 *   valuation 'YYYY-MM-DD'                the curve date
 *   bankRate  number                      the official Bank Rate on the valuation date (percent)
 *   meetings  ['YYYY-MM-DD', ...]         MPC dates (any; only those after the valuation date are used)
 * Returns { baselinePct, rows: [{ date, daysAway, stepBp, cumBp, levelPct, dir, pMove, steps, multi }], levels: [{ months, levelPct }] }.
 */
export function pricedPath({ curve, valuation, bankRate, meetings }) {
  const { months, f } = curve;
  const v = dayNum(valuation);
  const ms = meetings.filter(m => m > valuation).sort();
  const lastDay = months[months.length - 1] * 30.4375;
  const base = ms.length ? windowMean(months, f, 0, dayNum(ms[0]) - v) : windowMean(months, f, 0, 30);
  const rows = [];
  let prev = base;
  ms.forEach((m, i) => {
    const a = dayNum(m) - v;
    if (a >= lastDay) return;
    const b = i + 1 < ms.length ? dayNum(ms[i + 1]) - v : a + 60;
    const after = windowMean(months, f, a, Math.min(b, lastDay));
    const stepBp = (after - prev) * 100;
    rows.push({ date: m, daysAway: a, stepBp: r2(stepBp), cumBp: r2((after - base) * 100), levelPct: r3(bankRate + (after - base)), ...readStep(stepBp) });
    prev = after;
  });
  const levels = [6, 12, 18, 24, 36, 48, 60].filter(m => m <= months[months.length - 1]).map(m => ({ months: m, levelPct: r3(bankRate + (forwardAt(months, f, m / 12) - base)) }));
  return { baselinePct: r3(base), rows, levels };
}

// ── history of our own daily copies ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Merge dated curve snapshots ({ d, f }) into a history ascending by date (newer wins on a repeat date); keep at most `cap`. */
export function mergeHistory(hist, snaps, cap = 800) {
  const by = new Map((hist ?? []).map(s => [s.d, s]));
  for (const s of snaps ?? []) if (s?.d && Array.isArray(s.f) && s.f.length) by.set(s.d, { d: s.d, f: s.f.map(r3) });
  return [...by.values()].sort((a, b) => (a.d < b.d ? -1 : 1)).slice(-cap);
}
/** The snapshot nearest on or before `iso`, within `tolDays`; else null. */
export function snapOnOrBefore(hist, iso, tolDays = 4) {
  let best = null;
  for (const s of hist) { if (s.d <= iso) best = s; else break; }
  return best && dayNum(iso) - dayNum(best.d) <= tolDays ? best : null;
}

/** The look-back ticks: for each of 1 day, 1 week, 1 month (28 days) earlier, the priced level after each of today's meetings (or null when we hold no curve that old). */
export function ticksFor({ hist, months, valuation, meetings, rates }) {
  const out = { d1: null, w1: null, m1: null };
  const spec = { d1: 1, w1: 7, m1: 28 };
  for (const [k, back] of Object.entries(spec)) {
    const target = k === 'd1' ? (hist.filter(s => s.d < valuation).at(-1)?.d ?? null) : addDays(valuation, -back);
    const s = target ? snapOnOrBefore(hist, target, k === 'd1' ? 6 : 4) : null;
    if (!s) continue;
    const br = bankRateOn(rates, s.d);
    if (!fin(br)) continue;
    const p = pricedPath({ curve: { months, f: s.f }, valuation: s.d, bankRate: br, meetings });
    out[k] = { asOf: s.d, bankRate: br, byMeeting: Object.fromEntries(p.rows.map(r => [r.date, { levelPct: r.levelPct, stepBp: r.stepBp, pMove: r.pMove, dir: r.dir }])) };
  }
  return out;
}

// ── the document the route serves ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Everything the card needs, from the latest curve, our history, the Bank Rate series and the meeting list. Never invents: with no curve it returns ok:false.
 *   latest   { months, snap: { d, f } }
 *   hist     [{ d, f }] (our copies, including `latest`)
 *   rates    [{ date, rate }]
 *   meetings { dates, source: 'page' | 'list', readAt }
 * Staleness: curveAgeDays (calendar days from the curve date to now); meetingsStale when fewer than two meetings remain in the list.
 */
export function buildDocument({ latest, hist = [], rates = [], meetings = { dates: MPC_DATES, source: 'list', readAt: null }, now = Date.now(), fetched = {} } = {}) {
  if (!latest?.snap) return { ok: false, error: 'no curve held yet' };
  const valuation = latest.snap.d, months = latest.months;
  const bankRate = bankRateOn(rates, valuation) ?? bankRateOn(rates, todayISO(now));
  if (!fin(bankRate)) return { ok: false, error: 'no Bank Rate from the Bank of England database yet', asOf: valuation };
  const path = pricedPath({ curve: { months, f: latest.snap.f }, valuation, bankRate, meetings: meetings.dates });
  const ticks = ticksFor({ hist, months, valuation, meetings: meetings.dates, rates });
  const rows = path.rows.map(r => ({ ...r, ticks: { d1: ticks.d1?.byMeeting?.[r.date]?.levelPct ?? null, w1: ticks.w1?.byMeeting?.[r.date]?.levelPct ?? null, m1: ticks.m1?.byMeeting?.[r.date]?.levelPct ?? null } }));
  const future = meetings.dates.filter(m => m > todayISO(now));
  const current = rates.length ? rates.at(-1) : null;
  const lastChange = (() => { for (let i = rates.length - 1; i > 0; i--) if (rates[i].rate !== rates[i - 1].rate) return { date: rates[i].date, from: rates[i - 1].rate, to: rates[i].rate }; return null; })();
  return {
    ok: true,
    asOf: valuation,
    curveAgeDays: Math.round((Date.parse(todayISO(now) + 'T00:00:00Z') - Date.parse(valuation + 'T00:00:00Z')) / dayMs),
    bankRate: { pct: bankRate, asOf: current?.date ?? null, current: current?.rate ?? null, lastChange },
    baselinePct: path.baselinePct,
    meetings: rows.slice(0, 8),
    levels: path.levels,
    ticks: { d1: ticks.d1 ? { asOf: ticks.d1.asOf, bankRate: ticks.d1.bankRate } : null, w1: ticks.w1 ? { asOf: ticks.w1.asOf, bankRate: ticks.w1.bankRate } : null, m1: ticks.m1 ? { asOf: ticks.m1.asOf, bankRate: ticks.m1.bankRate } : null },
    meetingsInfo: { source: meetings.source, readAt: meetings.readAt, listVerified: MPC_LIST_VERIFIED, remaining: future.length, stale: future.length < 2 },
    historyDays: hist.length,
    method: 'Average expected overnight rate in the window after each meeting minus the window before it, from the Bank of England OIS forward curve (a smoothed fit, so one meeting blurs into its neighbours). Levels are anchored to the official Bank Rate. A move of d bp is read as a d/25 chance of one 25bp step, capped at 100%. Priced, not forecast.',
    source: { curve: 'Bank of England OIS curve', rate: 'Bank of England database IUDBEDR', ...fetched },
    builtAt: new Date(now).toISOString(),
  };
}

// ── fetching ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const get = async (fetchImpl, url, { headers = {}, timeoutMs = 45_000 } = {}) =>
  fetchImpl(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });

/** Rows of the short-end forward sheet of an xlsx buffer. */
export async function rowsFromWorkbook(buf, { loadXlsx = () => import('xlsx') } = {}) {
  const mod = await loadXlsx(), X = mod.default ?? mod;
  const wb = X.read(buf, { type: 'buffer' });
  const name = pickForwardSheet(wb.SheetNames);
  if (!name) throw new Error(`BoE OIS workbook: no short-end forward sheet (has: ${wb.SheetNames.join(', ')})`);
  return X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
}

/**
 * The current month's curve file. Conditional: pass the Last-Modified we saw last time and a 304 returns { notModified: true } with no body.
 * Returns { notModified, lastModified } or { months, snaps, lastModified, bytes }.
 */
export async function fetchLatestCurve({ fetchImpl = fetch, loadXlsx, readEntry, ifModifiedSince = null } = {}) {
  const headers = ifModifiedSince ? { 'If-Modified-Since': ifModifiedSince } : {};
  const r = await get(fetchImpl, BOE_ZIP_URL, { headers });
  if (r.status === 304) return { notModified: true, lastModified: ifModifiedSince };
  if (!r.ok) throw new Error(`BoE curve zip: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1000 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('BoE curve zip: the answer was not a zip file');
  const { data } = readEntry(buf, /^OIS daily data/i);
  const parsed = parseForwardRows(await rowsFromWorkbook(data, { loadXlsx }));
  return { ...parsed, lastModified: r.headers?.get?.('last-modified') ?? null, bytes: buf.length };
}

/** One-off backfill of older curves from the archive's '2025 to present' workbook, by range request: only snapshots dated >= sinceISO are kept. */
export async function fetchArchiveSince(sinceISO, { fetchImpl = fetch, loadXlsx, readRemoteEntry } = {}) {
  const got = await readRemoteEntry(BOE_ARCHIVE_URL, /^OIS daily data.*present/i, { fetchImpl, headers: { 'User-Agent': UA } });
  const parsed = parseForwardRows(await rowsFromWorkbook(got.data, { loadXlsx }));
  return { months: parsed.months, snaps: parsed.snaps.filter(s => s.d >= sinceISO), bytes: got.bytesFetched };
}

export async function fetchBankRates(fromISO, { fetchImpl = fetch } = {}) {
  const r = await get(fetchImpl, bankRateCsvUrl(fromISO));
  if (!r.ok) throw new Error(`BoE database: HTTP ${r.status}`);
  return parseBankRateCsv(await r.text());
}

/** The MPC dates from the Bank's page, or throws; the caller falls back to MPC_DATES. */
export async function fetchMpcDates({ fetchImpl = fetch } = {}) {
  const r = await get(fetchImpl, BOE_MPC_URL, { headers: { Accept: 'text/html,*/*' } });
  if (!r.ok) throw new Error(`BoE MPC page: HTTP ${r.status}`);
  const dates = parseMpcPage(await r.text());
  if (dates.length < 8) throw new Error(`BoE MPC page: only ${dates.length} dates read (the layout may have changed)`);
  return dates;
}
