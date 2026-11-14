/**
 * Curve board (Desk Terminal, Macro tab): the pure shaping. No fetch, no DOM; `now` is passed in.
 *
 *   buildCurveBoard({ S, coupling, episodes, now })   what /api/curve-board serves
 *   describeCurve(cb)                                 the rule-built sentence
 *   shapeMove(d2, d10)                                bull / bear steepener or flattener from two changes
 *
 * S = { effr, us2y, us5y, us10y, us30y }: ascending [{ date, value }] in percent (FRED H.15 and the NY Fed EFFR, daily), the same series the
 * Rates & policy board holds. What this adds to that board: the curve drawn THROUGH TIME (36 month-end curves plus today's), five slopes with
 * where each sits against 1, 3 and 5 years, how many of the last 156 weeks the 2s10s was inverted / flat / upward, and the two coupling reads
 * that were only in the analysts' pack (yield spread vs EURUSD; the SOFR-Euribor spread turn log). No 2y-vs-model, no forecast.
 */
import { onOrBefore, changeBp, spreadSeries, pctile } from './terminal/ratesBoardCore.js';

const fin = v => v != null && Number.isFinite(+v);
const DAY = 864e5, ts = d => Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`), iso = t => new Date(t).toISOString().slice(0, 10);
const last = a => (Array.isArray(a) && a.length ? a[a.length - 1] : null);
const every = (a, k) => a.filter((_, i) => (a.length - 1 - i) % k === 0);

export const TENORS = [['FF', 'effr'], ['2y', 'us2y'], ['5y', 'us5y'], ['10y', 'us10y'], ['30y', 'us30y']];
// [key, label, long, short]: the slope is long minus short, in bp
export const SLOPES = [
  ['2s10s', '2y–10y', 'us10y', 'us2y'], ['2s30s', '2y–30y', 'us30y', 'us2y'], ['10s30s', '10y–30y', 'us30y', 'us10y'],
  ['5s30s', '5y–30y', 'us30y', 'us5y'], ['2s5s', '2y–5y', 'us5y', 'us2y'], ['ff2y', 'fed funds–2y', 'us2y', 'effr'],
];

/** How the curve moved over a window, from the front (2y) and long (10y) changes in bp. Words follow the market's own: bull = yields fell. */
export function shapeMove(d2, d10, eps = 3) {
  if (!fin(d2) || !fin(d10)) return null;
  const ds = d10 - d2, avg = (d2 + d10) / 2;
  if (Math.abs(ds) < eps) return Math.abs(avg) < eps ? { key: 'still', word: 'little changed' } : { key: avg > 0 ? 'up' : 'down', word: avg > 0 ? 'a parallel rise' : 'a parallel fall' };
  if (ds > 0) return avg < 0 ? { key: 'bullsteep', word: 'a bull steepener' } : { key: 'bearsteep', word: 'a bear steepener' };
  return avg < 0 ? { key: 'bullflat', word: 'a bull flattener' } : { key: 'bearflat', word: 'a bear flattener' };
}
const SHAPE_WHY = { bullsteep: 'yields fell, the front end most', bearsteep: 'yields rose, the long end most', bullflat: 'yields fell, the long end most', bearflat: 'yields rose, the front end most' };

function monthEnds(a, months) {
  const out = []; let cur = null;
  for (const p of a) { const m = p.date.slice(0, 7); if (cur && cur.m !== m) out.push(cur.p.date); cur = { m, p }; }
  return out.slice(-months);
}

export function buildCurveBoard({ S, coupling = null, episodes = null, now = Date.now() } = {}) {
  const l10 = last(S?.us10y), l2 = last(S?.us2y), l30 = last(S?.us30y);
  if (!l10 || !l2 || !l30) return { ok: false, error: 'the Treasury series are not loaded yet' };
  const asOf = [l2.date, l10.date, l30.date].sort().at(-1);
  // the curve through time: 36 month-end curves, oldest first, then the latest
  const tenorKeys = TENORS.map(t => t[0]);
  const curveAt = date => { const pts = []; for (const [k, key] of TENORS) { const o = onOrBefore(S[key], date); if (!o || !fin(o.value) || (ts(date) - ts(o.date)) / DAY > 6) return null; pts.push({ k, v: o.value }); } return { date, pts }; };
  const dates = [...monthEnds(S.us10y.filter(p => p.date >= iso(ts(asOf) - 3.2 * 365.25 * DAY) && p.date < asOf), 36), asOf];
  const curves = dates.map(curveAt).filter(Boolean);
  // slopes
  const from3 = iso(ts(asOf) - 3 * 365.25 * DAY);
  const slopes = SLOPES.map(([k, label, long, short]) => {
    if (!S[long]?.length || !S[short]?.length) return null;
    const sr = spreadSeries(S[long], S[short]), l = last(sr); if (!l) return null;
    const chg = n => { const ref = onOrBefore(sr, iso(ts(l.date) - n * DAY)); return ref && ref.date !== l.date ? Math.round(l.value - ref.value) : null; };
    const p1 = pctile(sr, 1), p3 = pctile(sr, 3, 120), p5 = pctile(sr, 5, 250), w3 = sr.filter(p => p.date >= from3);
    const weekly = every(w3, 5);
    return { k, label, bp: Math.round(l.value), asOf: l.date, chg1d: chg(1), chg5d: chg(7), chg20d: chg(28), pct1y: p1.pct, pct3y: p3.pct, pct5y: p5.pct,
      lo3y: w3.length ? Math.round(Math.min(...w3.map(p => p.value))) : null, hi3y: w3.length ? Math.round(Math.max(...w3.map(p => p.value))) : null,
      weeks: weekly.map(p => Math.round(p.value)), inverted: l.value < 0 };
  }).filter(Boolean);
  const s2s10 = slopes.find(s => s.k === '2s10s');
  // curve memory: weekly 2s10s over three years as inverted / flat / upward
  const memory = s2s10 ? s2s10.weeks.map(v => (v < 0 ? 'inverted' : v < 50 ? 'flat' : 'upward')) : [];
  const tally = ['inverted', 'flat', 'upward'].map(w => ({ w, n: memory.filter(x => x === w).length }));
  const tenor = k => { const key = TENORS.find(t => t[0] === k)[1], a = S[key]; const l = last(a); return l ? { k, level: l.value, chg1d: changeBp(a, 1), chg5d: changeBp(a, 7), chg20d: changeBp(a, 28) } : null; };
  const t2 = tenor('2y'), t10 = tenor('10y');
  const move = {};
  for (const [w, key] of [['5D', 'chg5d'], ['20D', 'chg20d']]) { const m = shapeMove(t2?.[key], t10?.[key]); move[w] = m ? { ...m, why: SHAPE_WHY[m.key] ?? null, d2: Math.round(t2[key]), d10: Math.round(t10[key]) } : null; }
  const cp = coupling?.spreads?.find(s => s.tenor === '10Y' && s.available) ?? null;
  const cp2 = coupling?.spreads?.find(s => s.tenor === '2Y' && s.available) ?? null;
  const evs = episodes?.events ?? [];
  const tally4 = { revert: 0, follow: 0, other: 0 };
  for (const e of evs) { const o = e.outcome?.['4h']; if (o === 'revert') tally4.revert++; else if (o === 'follow') tally4.follow++; else if (o) tally4.other++; }
  const coup = c => (c ? { label: c.label, coincident: fin(c.coincident) ? Math.round(c.coincident * 100) / 100 : null, regimeCorr: fin(c.state?.regimeCorr) ? Math.round(c.state.regimeCorr * 100) / 100 : null, state: c.state?.state ?? null, note: c.state?.note ?? null, bars: c.bars } : null);
  return { ok: true, builtAt: new Date(now).toISOString(), asOf, tenors: tenorKeys, curves, slopes, memory: { weeks: memory, tally }, move, t2, t10,
    coupling: cp || cp2 ? { fx: coupling.symbol ?? 'EUR/USD', asOf: coupling.availability?.[0]?.last ?? null, ten: coup(cp), two: coup(cp2) } : null,
    episodes: episodes?.ok ? { spread: fin(episodes.now?.spread) ? Math.round(episodes.now.spread * 10) / 10 : null, link20: fin(episodes.now?.link20) ? Math.round(episodes.now.link20 * 100) / 100 : null, stale: !!episodes.stale, n: evs.length, tally4,
      pending: episodes.now?.pending ? { dir: episodes.now.pending.legDir, retraced: episodes.now.pending.retraced ?? null } : null, asOfT: episodes.asOfT ?? null } : null };
}

const sg = (v, d = 0) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(+v).toFixed(d);
/** One paragraph by rule: the three headline slopes with where they sit, and how the curve moved over 20 days. */
export function describeCurve(cb) {
  if (!cb?.ok) return null;
  const g = k => cb.slopes.find(s => s.k === k), p = [];
  const a = g('2s10s'), b = g('2s30s'), c = g('10s30s');
  if (a) p.push(`2s10s is ${sg(a.bp)}bp${a.pct3y != null ? `, the ${a.pct3y}th percentile of three years` : ''}${a.inverted ? ' (inverted)' : ''}`);
  if (b) p.push(`2s30s ${sg(b.bp)}bp`);
  if (c) p.push(`10s30s ${sg(c.bp)}bp`);
  let out = p.join('; ');
  const m = cb.move?.['20D'];
  if (m && m.key !== 'still') out += `. Over 20 days the curve made ${m.word}${m.why ? ` (${m.why}: 2y ${sg(m.d2)}bp, 10y ${sg(m.d10)}bp)` : ` (2y ${sg(m.d2)}bp, 10y ${sg(m.d10)}bp)`}`;
  else if (m) out += '. Over 20 days the curve was little changed';
  const inv = cb.memory?.tally?.find(t => t.w === 'inverted');
  if (inv && cb.memory.weeks.length) out += `. The 2s10s was inverted in ${inv.n} of the last ${cb.memory.weeks.length} weeks`;
  return out ? `${out}.` : null;
}
