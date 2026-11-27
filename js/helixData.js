// js/helixData.js: the pure builders behind /api/g10-rates and /api/funding-board (plans/HELIX_IMPROVEMENTS.md 1.12 data side, 3.6; plans/DATA_CAPTURE_G10.md phase 5).
// Input is the R2 archive js/macroCapture.js and server.js's _archiveDaily write: archive/series/<family>/<id>.json ({ points: [[date, value, firstValue?]] }) and
// archive/tables/ust_auctions/<type>_<term>.json ({ rows: [...] }). No fetch, no clock read unless passed: tested in js/helixData.test.mjs with fixtures.
// DESCRIPTION ONLY. The 2y gap to the US is context (deskEvidence nonus-yield-gap-label: context; -direction and -range: null): it explains the day it moves on and does not
// announce the next one. Funding readings are NULL as signals (deskEvidence funding-stress): SOFR above the floor is month-end dressing or mid-month tax and settlement.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const r = (v, d = 2) => (Number.isFinite(v) ? +v.toFixed(d) : null);
/** Archive points ([[date, value, first?]] or [{date, value}]) -> [{date, value}] ascending, finite values only. */
export function toPts(src) {
  const a = Array.isArray(src) ? src : Array.isArray(src?.points) ? src.points : [];
  const out = [];
  for (const p of a) { const d = Array.isArray(p) ? p[0] : p?.date, v = Number(Array.isArray(p) ? p[1] : p?.value); if (ISO.test(String(d ?? '')) && Number.isFinite(v)) out.push({ date: d, value: v }); }
  return out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}
/** Each date of `a` with the latest `b` value on or before it (a step join: IORB and the policy rate change on decision days only). maxGapDays drops stale pairings. */
export function asOfJoin(a, b, maxGapDays = 10) {
  const out = []; let j = -1;
  for (const p of a) {
    while (j + 1 < b.length && b[j + 1].date <= p.date) j++;
    if (j < 0) continue;
    if ((Date.parse(p.date) - Date.parse(b[j].date)) / 864e5 > maxGapDays) continue;
    out.push({ date: p.date, a: p.value, b: b[j].value });
  }
  return out;
}
/** Exact-date inner join (two daily yield curves on their own calendars: only days both printed). */
export function innerJoin(a, b) { const m = new Map(b.map(p => [p.date, p.value])); return a.filter(p => m.has(p.date)).map(p => ({ date: p.date, a: p.value, b: m.get(p.date) })); }
/** Share of `sample` below v, ties counted half, in percent (0-100). null when the sample is empty. */
export function pctRank(v, sample) {
  const s = sample.filter(Number.isFinite); if (!Number.isFinite(v) || !s.length) return null;
  let below = 0, eq = 0; for (const x of s) { if (x < v) below++; else if (x === v) eq++; }
  return r(((below + eq / 2) / s.length) * 100, 0);
}
const sd = a => { const n = a.length; if (n < 2) return null; const m = a.reduce((s, x) => s + x, 0) / n; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1)); };
/**
 * The h-observation change of `vals` (oldest first) at the end, and its z-score against the h-changes over the previous `look` observations (point in time: the current change is
 * not in its own yardstick). null z when fewer than 60 past changes exist.
 */
export function changeZ(vals, h = 20, look = 250) {
  const n = vals.length; if (n <= h) return { chg: null, z: null, n: 0 };
  const chg = vals[n - 1] - vals[n - 1 - h], past = [];
  for (let i = Math.max(h, n - 1 - look); i < n - 1; i++) past.push(vals[i] - vals[i - h]);
  const s = past.length >= 60 ? sd(past) : null;
  return { chg, z: s ? chg / s : null, n: past.length };
}

// ── G10 rates board ────────────────────────────────────────────────────────────────────────────────────────────────
/** One row per G10 currency: where its short and long yield come from. A currency with no captured curve keeps its row with the reason. */
export const G10_SOURCES = [
  { ccy: 'USD', short: ['fred', 'DGS2', '2y'], long: ['fred', 'DGS10', '10y'], src: 'US Treasury constant maturity (FRED)' },
  { ccy: 'EUR', short: ['g10_yields', 'EA_2Y', '2y'], long: ['g10_yields', 'EA_10Y', '10y'], src: 'euro area AAA curve (ECB)' },
  { ccy: 'GBP', short: ['g10_yields', 'UK_5Y', '5y'], long: ['g10_yields', 'UK_10Y', '10y'], src: 'gilt par yields (BoE)', note: 'no gilt 2y is captured; the 5y stands in for the short end' },
  { ccy: 'JPY', short: ['g10_yields', 'JP_2Y', '2y'], long: ['g10_yields', 'JP_10Y', '10y'], src: 'JGB constant maturity (Japan MoF)' },
  { ccy: 'CAD', short: ['g10_yields', 'CA_2Y', '2y'], long: ['g10_yields', 'CA_10Y', '10y'], src: 'Bank of Canada benchmark bonds' },
  { ccy: 'AUD', short: ['g10_yields', 'AU_2Y', '2y'], long: ['g10_yields', 'AU_10Y', '10y'], src: 'RBA F2' },
  { ccy: 'NZD', short: null, long: null, src: null, note: 'no New Zealand yields are captured yet' },
  { ccy: 'CHF', short: null, long: null, src: null, note: 'no Swiss yields are captured yet (SNB, DATA_CAPTURE_G10.md phase 3)' },
  { ccy: 'SEK', short: ['g10_yields', 'SE_2Y', '2y'], long: ['g10_yields', 'SE_10Y', '10y'], src: 'Riksbank SWEA' },
  { ccy: 'NOK', short: ['g10_yields', 'NO_3Y', '3y'], long: ['g10_yields', 'NO_10Y', '10y'], src: 'Norges Bank', note: 'Norway publishes no 2y; the 3y stands in for the short end' },
];
/** The archive keys the board reads, as 'family/id'. */
export const G10_KEYS = [...new Set(G10_SOURCES.flatMap(s => [s.short, s.long].filter(Boolean).map(([f, id]) => `${f}/${id}`)))];
const daysOld = (date, nowMs) => (date ? Math.floor((nowMs - Date.parse(`${date}T00:00:00Z`)) / 864e5) : null);

function leg(pts, tenor, id, nowMs) {
  if (!pts.length) return { tenor, id, date: null, value: null, chg20bp: null, z20: null, stale: true };
  const vals = pts.map(p => p.value), cz = changeZ(vals), last = pts[pts.length - 1], age = daysOld(last.date, nowMs);
  return { tenor, id, date: last.date, value: r(last.value, 3), chg20bp: r(cz.chg * 100, 1), z20: r(cz.z, 2), stale: age != null && age > 5 };
}
function gap(pts, us, tenor, usTenor, nowMs) {
  const j = innerJoin(pts, us); if (!j.length) return null;
  const vals = j.map(x => (x.a - x.b) * 100), cz = changeZ(vals), last = j[j.length - 1], age = daysOld(last.date, nowMs);
  return { vs: `${tenor} vs US ${usTenor}`, date: last.date, bp: r(vals[vals.length - 1], 1), chg20bp: r(cz.chg, 1), z20: r(cz.z, 2), n: j.length, stale: age != null && age > 5, spark: vals.slice(-30).map(v => r(v, 1)) };
}

/**
 * series: { 'family/id': points (any shape toPts reads) }. Returns the board: per currency its short and long yield (latest, 20-session change in bp, z-score of that change
 * against the previous 250 sessions' 20-session changes) and the gap of each to the US yield of the same leg (bp, same change and z). Description only.
 */
export function buildG10Rates(series, { nowMs = Date.now() } = {}) {
  const P = k => toPts(series?.[k]);
  const usS = P('fred/DGS2'), usL = P('fred/DGS10');
  const rows = G10_SOURCES.map(s => {
    if (!s.short) return { ccy: s.ccy, short: null, long: null, gapShort: null, gapLong: null, src: null, note: s.note, missing: true };
    const ps = P(`${s.short[0]}/${s.short[1]}`), pl = P(`${s.long[0]}/${s.long[1]}`);
    const row = { ccy: s.ccy, src: s.src, note: s.note ?? null, short: leg(ps, s.short[2], s.short[1], nowMs), long: leg(pl, s.long[2], s.long[1], nowMs) };
    if (s.ccy !== 'USD') { row.gapShort = gap(ps, usS, s.short[2], '2y', nowMs); row.gapLong = gap(pl, usL, s.long[2], '10y', nowMs); }
    row.missing = row.short.value == null && row.long.value == null;
    return row;
  });
  const dates = rows.flatMap(x => [x.short?.date, x.long?.date]).filter(Boolean).sort();
  const got = rows.filter(x => !x.missing).length;
  return {
    ok: got >= 3, asOf: dates[dates.length - 1] ?? null, oldest: dates[0] ?? null, have: got, of: rows.length, rows,
    degraded: rows.filter(x => x.missing || x.short?.stale || x.long?.stale).map(x => x.ccy),
    method: 'Latest close per curve. chg20bp: change over the last 20 printed sessions, in basis points. z20: that change against the 20-session changes of the previous 250 sessions (needs 60). Gaps use only days both curves printed.',
    evidence: [{ id: 'nonus-yield-gap-label', verdict: 'context' }, { id: 'nonus-yield-gap-direction', verdict: 'null' }, { id: 'nonus-yield-gap-range', verdict: 'null' }],
    label: 'Context, not a signal: the gap to the US explains the day it moves on; it does not announce the next session (direction and range tests are null).',
  };
}

// ── Funding board ──────────────────────────────────────────────────────────────────────────────────────────────────
export const FUNDING_KEYS = ['nyfed/SOFR', 'nyfed/SOFR_P99', 'nyfed/TGCR', 'fred/IORB', 'nyfed/ON_RRP', 'fred/RRPONTSYD', 'fred/WRESBAL', 'treasury/TGA_DTS', 'fred/WTREGEN', 'ofr/MMF_REPO_FED'];
/** Last 2y, 10y and 30y auctions: archive/tables/ust_auctions/<key>.json. */
export const AUCTION_KEYS = [['2y', 'Note_2-Year'], ['10y', 'Note_10-Year'], ['30y', 'Bond_30-Year']];

const bizDaysBetween = (a, b) => { let n = 0; const d = new Date(a); while (d < b) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w && w !== 6) n++; } return n; };
const lastBizDay = (y, m) => { const d = new Date(Date.UTC(y, m + 1, 0)); while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1); return d; };
/**
 * The calendar note the funding board always carries: month-end, quarter-end and the mid-month settlement and tax dates move repo and SOFR on their own. Weekends only (no holiday
 * table), so a holiday can shift a date by a day. date: 'YYYY-MM-DD' (the US day).
 */
export function calendarNote(date) {
  const d = new Date(`${date}T00:00:00Z`); if (!Number.isFinite(d.getTime())) return { tags: [], text: 'No date.' };
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate(), tags = [], parts = [];
  const me = lastBizDay(y, m), toMe = bizDaysBetween(d, me), prevMe = lastBizDay(y, m - 1), fromMe = bizDaysBetween(prevMe, d);
  const qEnd = m % 3 === 2, yEnd = m === 11;
  if (toMe <= 3) { tags.push(yEnd ? 'year-end' : qEnd ? 'quarter-end' : 'month-end'); parts.push(`${toMe === 0 ? 'Today is' : `${toMe} business day${toMe === 1 ? '' : 's'} to`} the ${yEnd ? 'year' : qEnd ? 'quarter' : 'month'}-end (${me.toISOString().slice(0, 10)}): repo rates and the SOFR percentiles routinely run higher into it as banks dress balance sheets, so a wider SOFR 99th percentile here is mostly calendar.`); }
  else if (fromMe <= 2) { tags.push('after month-end'); parts.push(`${fromMe} business day${fromMe === 1 ? '' : 's'} after the month-end (${prevMe.toISOString().slice(0, 10)}): month-end pressure usually fades over the first days.`); }
  if (day >= 12 && day <= 18) {
    tags.push('mid-month');
    const tax = [2, 5, 8, 11].includes(m) ? ' and the quarterly corporate tax date' : m === 3 ? ' and the April individual tax date' : '';
    parts.push(`Mid-month: Treasury coupon settlement on the 15th${tax} move cash from banks into the Treasury's account, which can lift SOFR and its percentiles for a few days.`);
  }
  if (!parts.length) parts.push('No month-end, quarter-end or mid-month settlement date is within three business days.');
  return { tags, text: parts.join(' '), monthEnd: me.toISOString().slice(0, 10), bizDaysToMonthEnd: toMe };
}

/** Auction rows of one tenor -> the latest auction and where its bid-to-cover and high-minus-median spread sit against the previous n same-tenor auctions. */
export function auctionStats(rows, tenor, n = 12) {
  const a = (Array.isArray(rows) ? rows : []).filter(x => ISO.test(String(x?.date ?? '')) && Number.isFinite(x?.highYield)).sort((x, y) => (x.date < y.date ? -1 : 1));
  if (!a.length) return { tenor, ok: false, why: 'no auctions in the archive yet' };
  const last = a[a.length - 1], prior = a.slice(-1 - n, -1), spread = x => (Number.isFinite(x.medianYield) ? (x.highYield - x.medianYield) * 100 : null);
  const s = spread(last);
  return {
    tenor, ok: true, date: last.date, cusip: last.cusip ?? null, reopening: !!last.reopening, highYield: r(last.highYield, 3), bidToCover: r(last.bidToCover, 2),
    btcPct: pctRank(last.bidToCover, prior.map(x => x.bidToCover)), highVsMedianBp: r(s, 1), highVsMedianPct: s == null ? null : pctRank(s, prior.map(spread)),
    indirectShare: r(last.indirectShare, 3), dealerShare: r(last.dealerShare, 3), vsN: prior.length,
    note: 'btcPct: share of the previous auctions of this tenor with a lower bid-to-cover. highVsMedianBp: the high (stop-out) yield minus the median bid yield, a spread of the bids; the true tail needs the 1 pm when-issued yield, which the archive does not hold.',
  };
}

const lastOf = pts => pts[pts.length - 1] ?? null;
const chgOver = (pts, h) => (pts.length > h ? pts[pts.length - 1].value - pts[pts.length - 1 - h].value : null);
const scaleBn = (v, unit) => (v == null ? null : unit === 'mn' ? v / 1000 : unit === 'usd' ? v / 1e9 : v);
function level(id, label, unit, pts, { scale = null, h = 20, maxAgeDays = 10, nowMs } = {}) {
  const sp = scale ? pts.map(p => ({ date: p.date, value: scaleBn(p.value, scale) })) : pts, last = lastOf(sp), age = daysOld(last?.date, nowMs);
  return { id, label, unit, date: last?.date ?? null, value: r(last?.value, 1), chg: r(chgOver(sp, h), 1), chgOver: h, stale: last == null || (age != null && age > maxAgeDays) };
}
function spreadItem(id, label, joined, nowMs) {
  if (!joined.length) return { id, label, unit: 'bp', date: null, value: null, stale: true };
  const vals = joined.map(x => (x.a - x.b) * 100), last = joined[joined.length - 1], age = daysOld(last.date, nowMs);
  return { id, label, unit: 'bp', date: last.date, value: r(vals[vals.length - 1], 1), chg5: r(vals.length > 5 ? vals[vals.length - 1] - vals[vals.length - 6] : null, 1), pct250: pctRank(vals[vals.length - 1], vals.slice(-251, -1)), spark: vals.slice(-30).map(v => r(v, 1)), stale: age != null && age > 5 };
}
/** Pick the first series that has points (a primary source and its fallback). */
const first = (series, ...keys) => { for (const k of keys) { const p = toPts(series?.[k]); if (p.length) return { k, p }; } return { k: keys[0], p: [] }; };

/**
 * series: { 'family/id': points }; auctions: { 'Note_2-Year': rows, ... }. today: the US date for the calendar note (defaults to the newest SOFR date, else nowMs's UTC date).
 * MMF repo with the Fed (OFR) is monthly; reserves (WRESBAL) and the FRED TGA are weekly, the Treasury's own TGA is daily.
 */
export function buildFundingBoard(series, auctions = {}, { nowMs = Date.now(), today = null, n = 12 } = {}) {
  const sofr = toPts(series?.['nyfed/SOFR']), p99 = toPts(series?.['nyfed/SOFR_P99']), tgcr = toPts(series?.['nyfed/TGCR']), iorb = toPts(series?.['fred/IORB']);
  const rrp = first(series, 'nyfed/ON_RRP', 'fred/RRPONTSYD'), res = toPts(series?.['fred/WRESBAL']), tga = first(series, 'treasury/TGA_DTS', 'fred/WTREGEN'), mmf = toPts(series?.['ofr/MMF_REPO_FED']);
  const mmfUnit = Math.abs(lastOf(mmf)?.value ?? 0) > 1e7 ? 'usd' : null;
  const items = [
    spreadItem('sofr_p99_iorb', 'SOFR 99th percentile minus IORB', asOfJoin(p99, iorb), nowMs),
    spreadItem('sofr_iorb', 'SOFR minus IORB', asOfJoin(sofr, iorb), nowMs),
    spreadItem('sofr_tgcr', 'SOFR minus TGCR', innerJoin(sofr, tgcr), nowMs),
    { ...level('rrp', 'Fed overnight reverse repo take-up', '$bn', rrp.p, { nowMs }), source: rrp.k },
    level('reserves', 'Bank reserves at the Fed', '$bn', res, { scale: 'mn', h: 4, maxAgeDays: 14, nowMs }),
    { ...level('tga', "Treasury General Account (the Treasury's cash at the Fed)", '$bn', tga.p, { scale: tga.k === 'fred/WTREGEN' ? 'mn' : null, h: tga.k === 'fred/WTREGEN' ? 4 : 20, maxAgeDays: 14, nowMs }), source: tga.k },
    level('mmf_repo_fed', 'Money-market funds: repo with the Fed (monthly, OFR)', '$bn', mmf, { scale: mmfUnit, h: 1, maxAgeDays: 75, nowMs }),
  ];
  const day = today ?? lastOf(sofr)?.date ?? new Date(nowMs).toISOString().slice(0, 10);
  const auc = AUCTION_KEYS.map(([tenor, key]) => ({ key, ...auctionStats(auctions?.[key], tenor, n) }));
  const dates = items.map(x => x.date).filter(Boolean).sort();
  return {
    ok: items.filter(x => x.value != null).length >= 3, asOf: dates[dates.length - 1] ?? null, items, auctions: auc, calendar: calendarNote(day),
    degraded: [...items.filter(x => x.stale).map(x => x.id), ...auc.filter(a => !a.ok).map(a => a.key)],
    evidence: [{ id: 'funding-stress', verdict: 'null' }],
    label: 'Description of plumbing, not a stress signal: SOFR above the floor tested NULL as a warning (funding-stress). At month-end it is balance-sheet dressing, mid-month it is tax and settlement dates.',
  };
}
