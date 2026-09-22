/**
 * FRED actuals for the economic-surprise store.
 *
 * The free ForexFactory feed gives every release's consensus and prior but never
 * the actual, so the surprise store (`econ_surprise_v1`) took no live print after
 * its 2025-04 backfill -- eighteen months of "nothing new, store untouched". This
 * brick fills the actual for the US releases FRED publishes, in the same string
 * shape ForexFactory uses ("0.2%", "228K", "7.57M", "-48.7B"), so a live print
 * joins the backfilled history of the same series and scores on the same scale.
 *
 * Pure: the map, the reference-period rule and the formatting are here and unit
 * tested; the server does the fetching. Nothing is guessed -- an actual is only
 * written when FRED's newest observation is dated exactly the period the release
 * reports on (August CPI on 11 September must be the 2025-08-01 observation), so a
 * release FRED has not published yet stays empty and is retried next hour.
 *
 * Not covered on purpose: ISM, S&P PMIs, Conference Board, Philly/Empire, NAR
 * existing/pending sales (no ALFRED vintages), UoM sentiment (FRED's revised copy
 * disagreed with the print) -- proprietary or not vintage-safe. Non-US prints need
 * another source.
 *
 * Validated 2026-09-19 against the ForexFactory archive: the last 5-6 prints of
 * every mapped series rebuilt from vintages -- 179 of 181 exact, the two others one
 * tick out (Building Permits rounding). See MD files/SURPRISE_ACTUALS.md.
 */

const DAY = 864e5;

// ForexFactory title -> FRED series and how to turn observations into FF's number.
//   kind: pct_mom   percent change vs the previous observation (1dp)
//         pct_yoy   percent change vs twelve observations earlier (1dp)
//         diff_k    change vs the previous observation, series already in thousands ("228K")
//         diff_pk   change vs the previous observation, persons -> thousands ("233K")
//         diff_m    change vs the previous observation, thousands -> millions ("-1.2M")
//         level_pct level with a % sign (dp given)
//         level_k   level already in thousands ("670K")
//         level_pk  level in persons -> thousands ("219K")
//         level_m   level in thousands -> millions ("7.57M", dp given)
//         level_mu  level in units -> millions ("4.26M")
//         level_b   level in millions -> billions ("-48.7B")
//         level     bare level (1dp)
//   ref:  the cadence, used only as a sanity band on the observation date the
//         vintage returns: m* monthly (any of the three months before the release),
//         q1 quarterly, wk/wed weekly, day = a target rate (the day after the decision)
export const FRED_ACTUALS = {
  'CPI m/m':                         { id: 'CPIAUCSL',         kind: 'pct_mom',   ref: 'm1' },
  'Core CPI m/m':                    { id: 'CPILFESL',         kind: 'pct_mom',   ref: 'm1' },
  'CPI y/y':                         { id: 'CPIAUCSL',         kind: 'pct_yoy',   ref: 'm1' },
  'Core CPI y/y':                    { id: 'CPILFESL',         kind: 'pct_yoy',   ref: 'm1' },
  'PPI m/m':                         { id: 'PPIFIS',           kind: 'pct_mom',   ref: 'm1' },
  'Core PPI m/m':                    { id: 'PPIFES',           kind: 'pct_mom',   ref: 'm1' },
  'Core PCE Price Index m/m':        { id: 'PCEPILFE',         kind: 'pct_mom',   ref: 'm1' },
  'Personal Spending m/m':           { id: 'PCE',              kind: 'pct_mom',   ref: 'm1' },
  'Import Prices m/m':               { id: 'IR',               kind: 'pct_mom',   ref: 'm1' },
  'Non-Farm Employment Change':      { id: 'PAYEMS',           kind: 'diff_k',    ref: 'm1' },
  'ADP Non-Farm Employment Change':  { id: 'ADPMNUSNERSA',     kind: 'diff_pk',   ref: 'm1' },
  'Unemployment Rate':               { id: 'UNRATE',           kind: 'level_pct', ref: 'm1', dp: 1 },
  'Average Hourly Earnings m/m':     { id: 'CES0500000003',    kind: 'pct_mom',   ref: 'm1' },
  'Unemployment Claims':             { id: 'ICSA',             kind: 'level_pk',  ref: 'wk' },
  'JOLTS Job Openings':              { id: 'JTSJOL',           kind: 'level_m',   ref: 'm2', dp: 2 },
  'Retail Sales m/m':                { id: 'RSAFS',            kind: 'pct_mom',   ref: 'm1' },
  'Core Retail Sales m/m':           { id: 'RSFSXMV',          kind: 'pct_mom',   ref: 'm1' },
  'Industrial Production m/m':       { id: 'INDPRO',           kind: 'pct_mom',   ref: 'm1' },
  'Capacity Utilization Rate':       { id: 'TCU',              kind: 'level_pct', ref: 'm1', dp: 1 },
  'Durable Goods Orders m/m':        { id: 'DGORDER',          kind: 'pct_mom',   ref: 'm1' },
  'Core Durable Goods Orders m/m':   { id: 'ADXTNO',           kind: 'pct_mom',   ref: 'm1' },
  'Factory Orders m/m':              { id: 'AMTMNO',           kind: 'pct_mom',   ref: 'm2' },
  'Business Inventories m/m':        { id: 'BUSINV',           kind: 'pct_mom',   ref: 'm2' },
  'Trade Balance':                   { id: 'BOPGSTB',          kind: 'level_b',   ref: 'm2' },
  'Building Permits':                { id: 'PERMIT',           kind: 'level_m',   ref: 'm1', dp: 2 },
  'Housing Starts':                  { id: 'HOUST',            kind: 'level_m',   ref: 'm1', dp: 2 },
  'New Home Sales':                  { id: 'HSN1F',            kind: 'level_k',   ref: 'm1' },
  'Advance GDP q/q':                 { id: 'A191RL1Q225SBEA',  kind: 'level_pct', ref: 'q1', dp: 1 },
  'Prelim GDP q/q':                  { id: 'A191RL1Q225SBEA',  kind: 'level_pct', ref: 'q1', dp: 1 },
  'Final GDP q/q':                   { id: 'A191RL1Q225SBEA',  kind: 'level_pct', ref: 'q1', dp: 1 },
  'Federal Funds Rate':              { id: 'DFEDTARU',         kind: 'level_pct', ref: 'day', dp: 2 },
};

// Non-US policy rates. FRED only carries the ECB's daily; the others come from
// the central banks' own open feeds (all daily, all free, none revised). The join
// is the same idea without vintages: the first observation dated AFTER the
// decision day carries the new rate (the BoE stamps the decision day itself, the
// RBA the next day, the BoC the announcement day -- waiting a day covers all).
export const POLICY_RATES = {
  // the ECB's new rate applies from the next maintenance period, six days after the decision
  'EU|Main Refinancing Rate': { id: 'ECBMRRFR', source: 'fred', kind: 'level_pct', ref: 'day', dp: 2, lagDays: 6 },
  'GB|Official Bank Rate':    { id: 'IUDBEDR',  source: 'boe',  kind: 'level_pct', ref: 'day', dp: 2 },
  'CA|Overnight Rate':        { id: 'V39079',   source: 'boc',  kind: 'level_pct', ref: 'day', dp: 2 },
  'AU|Cash Rate':             { id: 'FIRMMCRTD', source: 'rba', kind: 'level_pct', ref: 'day', dp: 2 },
};
// Non-US data releases from the statistics offices' own open endpoints.
// Validated 2026-09-19 against the ForexFactory archive (latest vintage, so
// revised series can drift a tick): GB CPI 6/6, core 6/6, unemployment 2 exact +
// 4 one-tick revisions; CA CPI 6/6, common core 5/6, unemployment/GDP within a
// tick, employment change same sign within revision range; EA HICP flash 4/6
// within a tick. Dropped as not validating: GB claimant count, AWE, retail,
// manufacturing, monthly GDP; CA retail (discontinued vector). See
// MD files/SURPRISE_ACTUALS.md. ONS and
// StatCan stamp every observation with its publication date, so the vintage rule
// applies unchanged (newest observation, published on or after the release day).
// Eurostat stamps only the dataset; the newest period carries that stamp and the
// older ones none, which makes the same rule hold.
//   ons:      https://www.ons.gov.uk/<path>/timeseries/<id>/<dataset>/data (months[] / quarters[], updateDate)
//   statcan:  Web Data Service getDataFromVectorsAndLatestNPeriods (refPer, releaseTime)
//   eurostat: JSON-stat API, dataset `updated`
export const INTL_ACTUALS = {
  'GB|CPI y/y':                     { source: 'ons', id: 'd7g7', path: 'economy/inflationandpriceindices', dataset: 'mm23', kind: 'level_pct', ref: 'm1', dp: 1 },
  'GB|Core CPI y/y':                { source: 'ons', id: 'dko8', path: 'economy/inflationandpriceindices', dataset: 'mm23', kind: 'level_pct', ref: 'm1', dp: 1 },
  'GB|Unemployment Rate':           { source: 'ons', id: 'mgsx', path: 'employmentandlabourmarket/peoplenotinwork/unemployment', dataset: 'lms', kind: 'level_pct', ref: 'm1', dp: 1 },
  'CA|Unemployment Rate':           { source: 'statcan', id: 2062815, kind: 'level_pct', ref: 'm1', dp: 1 },
  'CA|Employment Change':           { source: 'statcan', id: 2062811, kind: 'diff_k', ref: 'm1' },
  'CA|CPI m/m':                     { source: 'statcan', id: 41690973, kind: 'pct_mom', ref: 'm1' },
  'CA|Median CPI y/y':              { source: 'statcan', id: 108785714, kind: 'level_pct', ref: 'm1', dp: 1 },
  'CA|Trimmed CPI y/y':             { source: 'statcan', id: 108785715, kind: 'level_pct', ref: 'm1', dp: 1 },
  'CA|Common CPI y/y':              { source: 'statcan', id: 108785713, kind: 'level_pct', ref: 'm1', dp: 1 },
  'CA|GDP m/m':                     { source: 'statcan', id: 65201210, kind: 'pct_mom', ref: 'm2' },
  'EU|CPI Flash Estimate y/y':      { source: 'eurostat', id: 'ei_cphi_m', params: 'geo=EA&unit=RT12&indic=TOTAL', kind: 'level_pct', ref: 'm0', dp: 1 , strictRef: true },
  'EU|Final CPI y/y':               { source: 'eurostat', id: 'ei_cphi_m', params: 'geo=EA&unit=RT12&indic=TOTAL', kind: 'level_pct', ref: 'm1', dp: 1 , strictRef: true },
  'EU|Core CPI Flash Estimate y/y': { source: 'eurostat', id: 'ei_cphi_m', params: 'geo=EA&unit=RT12&indic=CP-HI00XEF', kind: 'level_pct', ref: 'm0', dp: 1 , strictRef: true },
  'EU|Final Core CPI y/y':          { source: 'eurostat', id: 'ei_cphi_m', params: 'geo=EA&unit=RT12&indic=CP-HI00XEF', kind: 'level_pct', ref: 'm1', dp: 1 , strictRef: true },
  'EU|Flash GDP q/q':               { source: 'eurostat', id: 'namq_10_gdp', params: 'geo=EA20&unit=CLV_PCH_PRE&s_adj=SCA&na_item=B1GQ', kind: 'level_pct', ref: 'q1', dp: 1 , strictRef: true },
  'EU|Unemployment Rate':           { source: 'eurostat', id: 'une_rt_m', params: 'geo=EA21&s_adj=SA&age=TOTAL&sex=T&unit=PC_ACT', kind: 'level_pct', ref: 'm2', dp: 1, strictRef: true },
};
export function fredSpecFor(country, event) {
  const cc = String(country ?? '').toUpperCase(), t = String(event ?? '').trim();
  if (cc === 'US') { const f = FRED_ACTUALS[t]; return f ? { ...f, source: 'fred' } : null; }
  return POLICY_RATES[`${cc}|${t}`] ?? INTL_ACTUALS[`${cc}|${t}`] ?? null;
}

// Validation helper: the formatted value at a given reference date from a
// latest-vintage series (no publication stamps needed). Revised series may
// disagree with the first print; that is the check's job to show.
export function actualAtDate(spec, refDate, obs) {
  const rows = _asOf(obs); const i = rows.findIndex(o => o.date === refDate);
  return i >= 0 ? _format(spec, rows, i) : null;
}

// JSON-stat (Eurostat) -> [{date, value}] for a single-series query; the value
// map is keyed by the flat index over the dimension sizes.
export function jsonStatSeries(j) {
  const ids = j.id ?? [], size = j.size ?? []; const tPos = ids.indexOf('time'); if (tPos < 0) return [];
  const timeIdx = j.dimension.time.category.index; const times = Object.entries(timeIdx).sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const strides = []; let acc = 1; for (let d = ids.length - 1; d >= 0; d--) { strides[d] = acc; acc *= size[d]; }
  // every other dimension must be a single category (a filtered query); take its index 0
  const out = [];
  for (let ti = 0; ti < times.length; ti++) {
    let flat = 0; for (let d = 0; d < ids.length; d++) flat += (d === tPos ? ti : 0) * strides[d];
    const v = j.value?.[String(flat)]; if (v == null) continue;
    const t = times[ti]; const date = /^\d{4}-Q[1-4]$/.test(t) ? `${t.slice(0, 4)}-${String((+t.slice(6) - 1) * 3 + 1).padStart(2, '0')}-01` : /^\d{4}-\d{2}$/.test(t) ? `${t}-01` : t;
    out.push({ date, value: +v });
  }
  return out;
}
// ONS timeseries JSON -> [{date, value, realtime_start}]
const ONS_MON = { January: '01', February: '02', March: '03', April: '04', May: '05', June: '06', July: '07', August: '08', September: '09', October: '10', November: '11', December: '12' };
export function onsSeries(j) {
  const rows = (j.months?.length ? j.months : j.quarters ?? []).map(m => {
    const y = m.year; const mo = m.month ? ONS_MON[m.month] : m.quarter ? String((+m.quarter.replace(/\D/g, '') - 1) * 3 + 1).padStart(2, '0') : null; if (!y || !mo) return null;
    // ONS stamps midnight London, which is 23:00 UTC the evening before the 07:00 release: roll it to the release day
    const u = m.updateDate ? new Date(m.updateDate) : null; if (u && u.getUTCHours() >= 20) u.setUTCDate(u.getUTCDate() + 1);
    return { date: `${y}-${mo}-01`, value: parseFloat(m.value), realtime_start: u ? u.toISOString().slice(0, 10) : '' };
  }).filter(o => o && Number.isFinite(o.value));
  return rows;
}
// StatCan WDS -> [{date, value, realtime_start}]
export function statcanSeries(j) {
  const pts = j?.[0]?.object?.vectorDataPoint ?? [];
  return pts.map(p => ({ date: String(p.refPer).slice(0, 10), value: parseFloat(p.value), realtime_start: String(p.releaseTime ?? '').slice(0, 10) })).filter(o => Number.isFinite(o.value));
}

// A daily policy-rate series without vintages -> the actual for a decision:
// the newest observation dated after the decision day, inside six days.
export function policyActualFrom(spec, releaseMs, obs) {
  if (!spec) return null;
  const day0 = iso(new Date(releaseMs));
  const rows = (Array.isArray(obs) ? obs : []).filter(o => o && o.date > day0 && Number.isFinite(o.value) && Date.parse(o.date) <= releaseMs + 6 * DAY).sort((a, b) => a.date < b.date ? -1 : 1);
  if (!rows.length) return null;
  const v = rows[rows.length - 1].value;
  return { actual: `${v.toFixed(spec.dp ?? 2)}%`, prior: null, refDate: rows[rows.length - 1].date, publishedOn: rows[rows.length - 1].date };
}

const iso = d => d.toISOString().slice(0, 10);
const utc = (y, m, d = 1) => new Date(Date.UTC(y, m, d));

// The observation date FRED stamps on the period a release reports on. Monthly
// series are stamped the first of the month; quarterly the first of the quarter;
// weekly claims the Saturday ending the reference week; EIA stocks the Friday of
// the reference week.
export function referenceDate(releaseMs, ref) {
  const d = new Date(releaseMs);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  switch (ref) {
    case 'm0': return iso(utc(y, m));
    case 'm1': return iso(utc(y, m - 1));
    case 'm2': return iso(utc(y, m - 2));
    case 'q1': { const q = Math.floor(m / 3); return iso(utc(y, (q - 1) * 3)); }
    case 'wk': { // claims print Thursday for the week ended the previous Saturday
      const dow = d.getUTCDay(); const back = ((dow - 6) + 7) % 7 || 7; return iso(new Date(Date.UTC(y, m, d.getUTCDate() - back)));
    }
    case 'wed': { // EIA prints Wednesday for the week ended the previous Friday
      const dow = d.getUTCDay(); const back = ((dow - 5) + 7) % 7 || 7; return iso(new Date(Date.UTC(y, m, d.getUTCDate() - back)));
    }
    case 'day': return iso(d);
    default: return null;
  }
}

// ── The join: FRED vintages, not FRED latest ─────────────────────────────────
// FRED's API carries every vintage (ALFRED). Asking for the data "as known
// between the release day and three days later" returns the first print with a
// `realtime_start` stamp saying when it appeared. That is the join: the newest
// observation in that window, provided it was published inside the window, is
// this release's actual -- and the observation before it, in the same vintage, is
// the prior the market had, which should equal ForexFactory's `previous`.
// Latest-vintage data would not do: payrolls, retail sales and GDP are revised by
// tenths and tens of thousands, so a rebuild from today's numbers disagrees with
// what printed on the day.
export function vintageWindow(releaseMs, now = Date.now(), lagDays = 0) {
  const day0 = iso(new Date(releaseMs));
  const end = new Date(Math.min(releaseMs + (3 + lagDays) * DAY, now));
  return { realtime_start: day0, realtime_end: iso(end) < day0 ? day0 : iso(end) };
}

// Vintage observations [{date, value, realtime_start}] -> one row per date, the
// version as of the window's end, ascending.
function _asOf(obs) {
  const by = new Map();
  for (const o of Array.isArray(obs) ? obs : []) {
    if (!o || !o.date || !Number.isFinite(o.value)) continue;
    const cur = by.get(o.date);
    if (!cur || (o.realtime_start ?? '') > (cur.realtime_start ?? '')) by.set(o.date, o);
  }
  return [...by.values()].sort((a, b) => a.date < b.date ? -1 : 1);
}

// Sanity band for the newest observation's date: monthly data reports on one of
// the three months before the release, quarterly on the previous quarter or two,
// weekly inside a fortnight, a target rate on the decision day or after.
function _plausible(spec, releaseMs, date) {
  // a source with no per-observation stamp must match the release's own period
  // exactly, or a flash release would be filled with the previous month's final
  if (spec.strictRef) return date === referenceDate(releaseMs, spec.ref);
  const d = new Date(releaseMs), y = d.getUTCFullYear(), m = d.getUTCMonth();
  switch (spec.ref) {
    case 'm0': case 'm1': case 'm2': return date >= iso(utc(y, m - 3)) && date <= iso(utc(y, m));
    case 'q1': return date >= iso(utc(y, m - 8)) && date < iso(new Date(releaseMs));
    case 'wk': case 'wed': return Date.parse(date) >= releaseMs - 14 * DAY && Date.parse(date) < releaseMs;
    case 'day': { const lag = (spec.lagDays ?? 0) * DAY; return date > iso(new Date(releaseMs + lag)) && Date.parse(date) <= releaseMs + lag + 4 * DAY; }
    default: return false;
  }
}

function _format(spec, rows, i) {
  if (i < 0 || i >= rows.length) return null;
  const v = rows[i].value, prev = rows[i - 1]?.value, yr = rows[i - 12]?.value;
  const dp = spec.dp ?? 1;
  const pct = x => `${x.toFixed(dp)}%`;
  switch (spec.kind) {
    case 'pct_mom':  return prev == null || prev === 0 ? null : pct((v / prev - 1) * 100);
    case 'pct_yoy':  return yr == null || yr === 0 ? null : pct((v / yr - 1) * 100);
    case 'diff_k':   return prev == null ? null : `${Math.round(v - prev)}K`;
    case 'diff_pk':  return prev == null ? null : `${Math.round((v - prev) / 1000)}K`;
    case 'diff_m':   return prev == null ? null : `${((v - prev) / 1000).toFixed(1)}M`;
    case 'level_pct': return pct(v);
    case 'level_k':  return `${Math.round(v)}K`;
    case 'level_pk': return `${Math.round(v / 1000)}K`;
    case 'level_m':  return `${(v / 1000).toFixed(dp)}M`;
    case 'level_mu': return `${(v / 1e6).toFixed(dp)}M`;
    case 'level_b':  return `${(v / 1000).toFixed(1)}B`;
    case 'level':    return v.toFixed(dp);
    default: return null;
  }
}

// The release's actual from a vintage fetch, or null when FRED has not published
// it yet (the newest observation predates the window) or the newest observation
// is not a period this release could be reporting on.
export function actualFromVintage(spec, releaseMs, obs) {
  if (!spec) return null;
  const rows = _asOf(obs); if (!rows.length) return null;
  const { realtime_start } = vintageWindow(releaseMs, releaseMs + 3 * DAY, spec.lagDays ?? 0);
  const i = rows.length - 1, newest = rows[i];
  if ((newest.realtime_start ?? '') < realtime_start) return null;   // nothing new since the release: not out on FRED yet
  if (!_plausible(spec, releaseMs, newest.date)) return null;
  return { actual: _format(spec, rows, i), prior: spec.ref === 'day' ? null : _format(spec, rows, i - 1), refDate: newest.date, publishedOn: newest.realtime_start ?? null };
}

// How far back the fetch must reach for the transform: thirteen months for a y/y,
// a couple of periods otherwise.
export function fetchStart(spec, releaseMs) {
  const back = spec.kind === 'pct_yoy' ? 420 : spec.ref === 'q1' ? 200 : spec.ref === 'wk' || spec.ref === 'wed' ? 30 : spec.ref === 'day' ? 10 : 100;
  return iso(new Date(releaseMs - back * DAY));
}

const num = s => { const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
// Does the prior FRED had at release time read as ForexFactory's `previous`?
// A tick of slack for rounding; a check that is logged, never a gate.
export function priorAgrees(ffPrev, fredPrev) {
  const a = num(ffPrev), b = num(fredPrev); if (a == null || b == null) return null;
  const dp = (String(fredPrev).split('.')[1] ?? '').replace(/[^\d]/g, '').length;
  return Math.abs(a - b) <= 1.5 * Math.pow(10, -dp) + 1e-9;
}

// A revision: the previous release's first print against the same period as the
// market now sees it (the prior in this release's vintage). Null when they agree
// numerically; otherwise the two strings and the change in the series' own unit.
export function revisionOf(firstPrint, priorNow) {
  const a = num(firstPrint), b = num(priorNow); if (a == null || b == null || Math.abs(a - b) < 1e-9) return null;
  const unit = (String(priorNow).match(/[%KMB]$/) ?? [''])[0];
  const dp = (String(priorNow).split('.')[1] ?? '').replace(/[^\d]/g, '').length;
  return { was: String(firstPrint), now: String(priorNow), delta: `${b - a >= 0 ? '+' : '−'}${Math.abs(b - a).toFixed(dp)}${unit}` };
}

// Which rows are worth asking FRED about: US, on the map, released at least 45
// minutes ago (FRED posts within minutes of the print), within the last three
// weeks, and still without an actual.
export function pendingRows(rows, now = Date.now()) {
  return (rows ?? []).filter(r => r && (r.actual == null || r.actual === '') && fredSpecFor(r.country, r.event) && r.ms <= now - 45 * 60_000 && r.ms >= now - 21 * DAY);
}
