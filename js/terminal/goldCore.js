// js/terminal/goldCore.js: the Gold board (Insight tab). Pure: no DOM, no fetch, no clock (now is passed in). Puts the things gold is read against on one page:
//   the price, the 10-year real yield, the dollar index and gold's implied vol (GVZ, set against its own realised vol), all from the daily market bundle
//   (/api/drill-series); speculative positioning from /api/cot-state; the gold ETF holdings from /api/gold-etf-flow.
// And one fitted description, clearly labelled: how much of gold's recent move the dollar and real yields would usually account for (an OLS fit of gold's daily
// move on the dollar's move and the real yield's change over the last 250 sessions). It is a description of the past, not a forecast: low R squared is the normal
// case, and the board prints it.
import { analyse } from './unusualCore.js';
import { dailyMoves } from './matrixCore.js';
import { metaFor } from './insightSeries.js';

const fin = v => v != null && Number.isFinite(+v);
export const FIT_WIN = 250, CHART_N = 120, COT_STALE_DAYS = 9;

/** Annualised realised volatility (%) of the last `win` daily log moves. null under 10 moves. */
export function realisedVol(vals, win = 20) {
  const m = dailyMoves(vals, 'ratio').filter(fin).slice(-win); if (m.length < 10) return null;
  const mean = m.reduce((a, b) => a + b, 0) / m.length, v = m.reduce((a, b) => a + (b - mean) ** 2, 0) / (m.length - 1);
  return Math.sqrt(v) * Math.sqrt(252) * 100;
}

/** Ordinary least squares y = a + b1 x1 + b2 x2 on rows where all three exist. { a, b: [b1,b2], se: [s1,s2], t: [t1,t2], r2, n } or null (under 60 rows or a singular fit). */
export function ols2(y, x1, x2) {
  const rows = []; for (let i = 0; i < y.length; i++) if (fin(y[i]) && fin(x1[i]) && fin(x2[i])) rows.push([1, +x1[i], +x2[i], +y[i]]);
  const n = rows.length; if (n < 60) return null;
  const A = Array.from({ length: 3 }, () => new Array(3).fill(0)), B = new Array(3).fill(0);
  for (const r of rows) for (let i = 0; i < 3; i++) { B[i] += r[i] * r[3]; for (let j = 0; j < 3; j++) A[i][j] += r[i] * r[j]; }
  const inv = inv3(A); if (!inv) return null;
  const beta = inv.map(row => row[0] * B[0] + row[1] * B[1] + row[2] * B[2]);
  const ym = rows.reduce((a, r) => a + r[3], 0) / n; let sse = 0, sst = 0;
  for (const r of rows) { const f = beta[0] + beta[1] * r[1] + beta[2] * r[2]; sse += (r[3] - f) ** 2; sst += (r[3] - ym) ** 2; }
  if (sst <= 0) return null;
  const s2 = sse / (n - 3), se = [Math.sqrt(s2 * inv[1][1]), Math.sqrt(s2 * inv[2][2])];
  return { a: beta[0], b: [beta[1], beta[2]], se, t: [beta[1] / se[0], beta[2] / se[1]], r2: 1 - sse / sst, n };
}
function inv3(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-18) return null;
  return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
}

const lastOf = a => { for (let i = a.length - 1; i >= 0; i--) if (fin(a[i])) return +a[i]; return null; };
const tail = (a, n) => a.slice(-n).map(x => (fin(x) ? +x : null));

/** How much of gold's last 20 session move the dollar and the real yield would usually account for, from a fit over the 250 sessions BEFORE that window. */
export function goldFit(bundle, { fitWin = FIT_WIN, win = 20 } = {}) {
  const s = bundle?.series ?? {}; if (!s.gold || !s.dxy || !s.tips) return null;
  const y = dailyMoves(s.gold, 'ratio'), x1 = dailyMoves(s.dxy, 'ratio'), x2 = dailyMoves(s.tips, 'rate');
  const end = y.length - 1, cut = end - win;                       // fit on rows up to the day before the window, so the window is out of sample
  const slice = a => a.slice(Math.max(0, cut - fitWin + 1), cut + 1);
  const fit = ols2(slice(y), slice(x1), slice(x2)); if (!fit) return null;
  let actual = 0, fitted = 0, n = 0;
  for (let i = cut + 1; i <= end; i++) if (fin(y[i]) && fin(x1[i]) && fin(x2[i])) { actual += y[i]; fitted += fit.a + fit.b[0] * x1[i] + fit.b[1] * x2[i]; n++; }
  if (n < 10) return null;
  const pct = x => (Math.exp(x) - 1) * 100;
  return { fit, n, window: win, actualPct: pct(actual), fittedPct: pct(fitted), unexplainedPct: pct(actual) - pct(fitted),
    // sensitivities in plain units: gold's % move for a 1% dollar move, and for a 10bp real yield move
    perDollarPct: fit.b[0], perTenBp: fit.b[1] * 10 };   // log move per 1 pct-point of yield = b[1], so per 10bp (0.10 pt) in percent = b[1] * 0.10 * 100
}

/** The positioning card from /api/cot-state's GOLD entry. now() = ms. */
export function positioning(cot, now) {
  const g = cot?.instruments?.GOLD; if (!cot?.ok || !g) return null;
  const rd = g.reportDate ?? cot.reportDate, age = rd ? Math.floor((now - Date.parse(`${rd}T00:00:00Z`)) / 86_400_000) : null;
  return { pct: g.pct, zone: g.zone, label: g.label, line: g.line, reportDate: rd, ageDays: age, stale: age != null && age > COT_STALE_DAYS, share: g.share, move13: g.move13, trend: g.trend, verdict: g.verdict ?? 'descriptive' };
}

/**
 * The ETF holdings card from /api/gold-etf-flow ({ series: [{ date, value }], last, deltas }). A fund's assets move with the gold price as well as with creations
 * and redemptions, so the change is shown twice: raw, and with gold's own move over the same dates taken out (the part that is not price).
 */
export function etfFlows(etf, goldByDate = null) {
  const r = etfFlowsDollars(etf, goldByDate), t = etf?.tonnes;
  // tonnes held is the better read of a flow (dollars also move with the gold price): GLD's from SPDR's own archive, IAU's from its page, each with its as-of date
  if (!t?.last?.gld && !t?.last?.iau) return r;
  return { ...r, tonnes: { asOf: t.asOf, gld: t.last.gld ?? null, iau: t.last.iau ?? null, total: t.last.total ?? null, deltas: t.deltas ?? null, source: etf.fetch?.source ?? null } };
}
function etfFlowsDollars(etf, goldByDate = null) {
  if (!etf?.ok) return { state: 'error', note: etf?.error ?? 'the gold ETF feed is not available' };
  const s = (etf.series ?? []).filter(p => fin(p.value) && p.date);
  if (!s.length) return { state: 'empty', days: 0, note: `No history held yet: the daily capture of GLD and IAU assets has not recorded a day together.${etf.fetch?.reason ? ` Last try: ${etf.fetch.reason}.` : ''}` };
  const last = s[s.length - 1];
  if (s.length < 2) return { state: 'one', days: 1, last: last.value, asOf: last.date, note: 'One day held so far. A change needs two.' };
  const out = { state: 'ok', days: s.length, last: last.value, asOf: last.date, from: s[0].date, deltas: {} };
  for (const k of [1, 5, 20]) {
    if (s.length <= k) continue;
    const a = s[s.length - 1 - k], raw = (last.value / a.value - 1) * 100;
    let flow = null;
    if (goldByDate && fin(goldByDate[a.date]) && fin(goldByDate[last.date])) flow = raw - (goldByDate[last.date] / goldByDate[a.date] - 1) * 100;
    out.deltas[k] = { raw, flow, from: a.date };
  }
  return out;
}

/** Everything the board draws. etf/cot may be null (a feed that failed): its card then says so. */
export function goldBoard(bundle, cot, etf, { now = Date.now() } = {}) {
  const dates = bundle?.dates ?? [], s = bundle?.series ?? {}, refDate = bundle?.to ?? dates[dates.length - 1] ?? null;
  const card = (key, tone, unit) => {
    if (!Array.isArray(s[key])) return null;
    const a = analyse(key, dates, s[key], { refDate }); if (!a || a.tooShort) return null;
    const meta = metaFor(key);
    return { key, label: meta.label, tone, last: a.lastFmt, lastRaw: lastOf(s[key]), spark: tail(s[key], CHART_N), moves: a.moves, level: a.level, stale: a.stale, n: a.n, unit, go: meta.go };
  };
  const cards = [card('gold', 'var(--gold)'), card('tips', 'var(--blue)'), card('dxy', 'var(--teal)'), card('gvz', 'var(--pur2)')].filter(Boolean);
  const rv = Array.isArray(s.gold) ? realisedVol(s.gold, 20) : null, gv = lastOf(s.gvz ?? []);
  const goldByDate = Array.isArray(s.gold) ? Object.fromEntries(dates.map((d, i) => [d, s.gold[i]]).filter(([, v]) => fin(v))) : null;
  return { asOf: refDate, cards, vol: rv != null && gv != null ? { implied: gv, realised: rv, ratio: gv / rv } : null, fit: goldFit(bundle), positioning: positioning(cot, now), etf: etfFlows(etf, goldByDate), haveBundle: !!bundle?.ok };
}
