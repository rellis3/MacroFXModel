// js/terminal/spreadsExplain.js: the explanation layer of the Spreads & ratios board. Pure: no DOM, no fetch, no clock.
//   - plain window and period labels ("22nd of 6y", "1m +5.5%"),
//   - the evidence chips in plain graded words (one chip per verdict, with a count),
//   - WHY a line moved: its two legs rebased, and a sentence that says which leg did the work,
//   - WHERE it has been before: the earlier stretches in the same zone of its own history (descriptive, no forecast),
//   - the compare chart's data, and the educators' "so what" line.
// As-of rule: every function takes the series it is given and uses nothing after its last close.
import { legsOf } from './spreadsTemplates.js';
import { seriesMeta } from './spreadsDerived.js';

const MINUS = '−';
export const fin = v => typeof v === 'number' && Number.isFinite(v);
const sgn = v => (v < 0 ? MINUS : '+');

/** "6y" for a long record, "412d" for a short one: the window a percentile is measured against. */
export const winShort = n => (n >= 500 ? `${(n / 252).toFixed(n >= 1260 ? 0 : 1)}y` : `${n}d`);
export const pctLabel = (nthText, n) => `${nthText} of ${winShort(n)}`;
/** The one-month change with its period: "1m +5.5%". */
export const periodChange = c21 => (c21 ? `1m ${c21.text}` : '');

// ── evidence chips in plain graded words ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export const GRADE_ORDER = ['validated', 'underpowered', 'context', 'null'];
const RANGEY = /range|size|width|wider|vol|move/i;
/** Plain label for one verdict (the Evidence Book's own word underneath, in the title). */
export function gradeLabel(verdict, abouts = []) {
  if (verdict === 'validated') return abouts.some(a => RANGEY.test(a)) ? 'Range validated' : 'Validated';
  if (verdict === 'underpowered') return 'Tested: underpowered';
  if (verdict === 'context') return 'Described only';
  return 'Tested: no forward edge found';
}
/** The evidence for a row collapsed to one chip per verdict: [{ verdict, label, count, ids, abouts }], strongest grade first. */
export function gradeChips(ev) {
  const by = new Map();
  for (const e of ev ?? []) { const g = by.get(e.verdict) ?? { verdict: e.verdict, ids: [], abouts: [], word: e.word }; g.ids.push(e.id); g.abouts.push(e.about); by.set(e.verdict, g); }
  return [...by.values()].sort((a, b) => GRADE_ORDER.indexOf(a.verdict) - GRADE_ORDER.indexOf(b.verdict))
    .map(g => ({ ...g, count: g.ids.length, label: gradeLabel(g.verdict, g.abouts) }));
}
export const GRADE_HELP = [
  ['Range validated', 'The reading does say something about how big the next moves are (size and width), tested with enough data. It never says which way.'],
  ['Tested: no forward edge found', 'We tested it and what followed looked like chance. That is a real answer for the sizes the test could see, not a claim that nothing could ever be there.'],
  ['Tested: underpowered', 'We tested it, but with too little data to rule out a small effect. It rules a large one out and says nothing about a small one.'],
  ['Described only', 'Shown for context. Nothing is claimed about what follows.'],
  ['Not tested here', 'No test of this relationship is on file yet. A test plan is drafted in plans/SPREADS_AND_RATIOS.md.'],
];

// ── the trend lines ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** A simple moving average aligned to the input (null until `n` values exist). */
export function sma(vals, n) {
  const out = new Array(vals.length).fill(null); let s = 0;
  for (let i = 0; i < vals.length; i++) { s += vals[i]; if (i >= n) s -= vals[i - n]; if (i >= n - 1) out[i] = s / n; }
  return out;
}

// ── why it moved: the two legs ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The unit of an x-minus-y pair: basis points for yields and credit spreads, dollars for the oil spread, points for the vol premium. */
export const subUnit = p => (p.op === 'usd' ? '$' : p.op === 'diff' ? 'bp' : 'pts');
const legName = key => { const m = seriesMeta(key)?.label; return m ? m.replace(/\s*\([^)]*\)\s*$/, '').trim() : String(key).toUpperCase(); };
// a ranked row's legs hold the bundle KEYS in xKey / yKey and the aligned VALUES in x / y; a hand-built legs object may carry a key in x / y
const keyOf = (legs, k) => (legs?.[`${k}Key`] ?? (typeof legs?.[k] === 'string' ? legs[k] : k.toUpperCase()));
export const legNames = (pair, legs) => ({ x: legs ? legName(keyOf(legs, 'x')) : '', y: legs ? legName(keyOf(legs, 'y')) : '' });

/** The legs of a ranked row on the row's own dates, rebased for a chart. kind: 'rebased' (prices: 100 at the window start) or 'change' (yields: change since the start, in basis points). */
export function componentSeries(row, sessions = 0) {
  const lg = row.legs; if (!lg?.x || !lg?.y) return null;
  const from = sessions && sessions < row.series.dates.length ? row.series.dates.length - sessions : 0;
  const dates = row.series.dates.slice(from), X = lg.x.slice(from), Y = lg.y.slice(from);
  const idx = dates.map((_, i) => i).filter(i => fin(X[i]) && fin(Y[i])); if (idx.length < 5) return null;
  const x0 = X[idx[0]], y0 = Y[idx[0]], isSub = lg.op === 'sub', su = subUnit(row.pair);
  if (!isSub && !(x0 > 0 && y0 > 0)) return null;
  const mk = (arr, a0) => idx.map(i => (isSub ? (arr[i] - a0) * (su === 'bp' ? 100 : 1) : (arr[i] / a0) * 100));
  return { kind: isSub ? 'change' : 'rebased', unit: isSub ? su : '', dates: idx.map(i => dates[i]), x: mk(X, x0), y: mk(Y, y0), names: legNames(row.pair, lg), op: lg.op };
}

/** What the change in the last `sessions` closes was made of, in words: which leg moved and which did the work. Returns { text, parts }. null when the legs are not available. */
export function decompose(row, sessions = 21) {
  const p = row.pair, nm = legNames(p, row.legs);
  if (p.op === 'zgap' && row.series.xz) {
    const n = row.series.xz.length, k = Math.min(sessions, n - 1), dx = row.series.xz[n - 1] - row.series.xz[n - 1 - k], dy = (row.series.sign ?? 1) * (row.series.yz[n - 1] - row.series.yz[n - 1 - k]);
    const f = v => `${sgn(v)}${Math.abs(v).toFixed(1)}σ`, gap = dx - dy;
    const who = Math.abs(dx) >= Math.abs(dy) ? p.xname : p.yname;
    return { parts: { x: dx, y: dy }, text: `Over the last month ${p.xname} moved ${f(dx)} against its own last two years and ${p.yname} ${f(dy)}: the gap ${gap >= 0 ? 'widened' : 'narrowed'} mostly because of ${who}.` };
  }
  const lg = row.legs; if (!lg?.x || !lg?.y) return null;
  const n = lg.x.length, a = n - 1 - sessions; if (a < 0 || ![lg.x[n - 1], lg.x[a], lg.y[n - 1], lg.y[a]].every(fin)) return null;
  const x1 = lg.x[n - 1], x0 = lg.x[a], y1 = lg.y[n - 1], y0 = lg.y[a];
  if (lg.op === 'sub') {
    const u = subUnit(p), k = u === 'bp' ? 100 : 1, f = v => `${sgn(v)}${u === '$' ? '$' : ''}${Math.abs(v).toFixed(u === 'bp' ? 0 : 2)}${u === 'bp' ? 'bp' : u === 'pts' ? ' pts' : ''}`;
    const dx = (x1 - x0) * k, dy = (y1 - y0) * k, gap = dx - dy, noun = u === 'bp' ? 'gap' : 'spread';
    return { parts: { x: dx, y: dy, gap }, text: `Over the last month ${nm.x} moved ${f(dx)} and ${nm.y} ${f(dy)}: the ${noun} ${gap >= 0 ? 'widened' : 'narrowed'} by ${f(Math.abs(gap)).replace(/^\+/, '')}${because(Math.abs(dx) >= Math.abs(dy) ? nm.x : nm.y, dx, dy, nm)}.` };
  }
  if (!(x0 > 0 && y0 > 0 && x1 > 0 && y1 > 0)) return null;
  const px = (x1 / x0 - 1) * 100, py = (y1 / y0 - 1) * 100, f = v => `${sgn(v)}${Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0)}%`;
  const lx = Math.log(x1 / x0), ly = Math.log(y1 / y0), eff = lg.op === 'mul' ? lx + ly : lx - ly, mul = lg.op === 'mul';
  const noun = row.pair.op === 'level' || mul ? 'cross' : 'ratio';
  const dom = Math.abs(lx) >= Math.abs(ly) ? nm.x : nm.y;
  const verb = eff >= 0 ? 'rose' : 'fell';
  return { parts: { x: px, y: py, eff }, text: `Over the last month ${nm.x} moved ${f(px)} and ${nm.y} ${f(py)}: the ${noun} ${verb}${mul ? (lx >= 0 === ly >= 0 ? ' because both legs moved the same way' : ` mostly because ${dom} moved more`) : because(dom, lx, ly, nm, eff)}.` };
}
function because(dom, dx, dy, nm) {
  const verbOf = v => (v >= 0 ? 'rose' : 'fell');
  if ((dx >= 0) !== (dy >= 0)) return ` because ${nm.x} ${verbOf(dx)} while ${nm.y} ${verbOf(dy)}`;
  return ` because ${dom} moved more (both ${dx >= 0 ? 'rose' : 'fell'})`;
}

// ── where it has been before ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const quantile = (sorted, q) => { const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
/**
 * The earlier stretches when this line sat in the same zone of its own record as it does now (the same percentile, give or take `band`). Descriptive.
 * Runs closer than `gap` sessions are one stretch. The stretch the line is in now is returned as `current`, not counted in `past`.
 * As-of safe: it reads only the series it is given (a series cut at a date has no stretch that reaches past that date).
 */
export function episodes(series, pct, { band = 0.075, gap = 5, keep = 6 } = {}) {
  const v = series?.vals, d = series?.dates, n = v?.length ?? 0; if (n < 60 || !fin(pct)) return null;
  const sorted = Float64Array.from(v).sort(), lo = quantile(sorted, Math.max(0, pct - band)), hi = quantile(sorted, Math.min(1, pct + band));
  const runs = []; let a = -1;
  for (let i = 0; i < n; i++) { const inside = v[i] >= lo && v[i] <= hi; if (inside && a < 0) a = i; if ((!inside || i === n - 1) && a >= 0) { const b = inside ? i : i - 1; runs.push([a, b]); a = -1; } }
  const merged = []; for (const r of runs) { const m = merged.at(-1); if (m && r[0] - m[1] <= gap) m[1] = r[1]; else merged.push([...r]); }
  const cur = merged.length && merged.at(-1)[1] === n - 1 ? merged.pop() : null;
  const lens = merged.map(r => r[1] - r[0] + 1).sort((x, y) => x - y);
  return { band: [lo, hi], current: cur ? { from: d[cur[0]], len: cur[1] - cur[0] + 1 } : null, n: merged.length, median: lens.length ? lens[(lens.length - 1) >> 1] : null,
    past: merged.slice(-keep).reverse().map(r => ({ from: d[r[0]], to: d[r[1]], len: r[1] - r[0] + 1 })) };
}

// ── compare two rows ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Two ranked rows on their common dates over the last `sessions` closes (0 = all). Ratio lines rebase to 100; spreads and levels, or a mix, are standard scores of the window. */
export function compareSeries(a, b, sessions = 0) {
  const mapB = new Map(b.series.dates.map((dt, i) => [dt, b.series.vals[i]]));
  let d = [], x = [], y = []; a.series.dates.forEach((dt, i) => { const q = mapB.get(dt); if (fin(a.series.vals[i]) && fin(q)) { d.push(dt); x.push(a.series.vals[i]); y.push(q); } });
  if (sessions && sessions < d.length) { d = d.slice(-sessions); x = x.slice(-sessions); y = y.slice(-sessions); }
  if (d.length < 30) return null;
  const isRatio = r => r.pair.op === 'ratio' && !r.pair.rebased, both = isRatio(a) && isRatio(b) && x[0] > 0 && y[0] > 0;
  if (both) return { mode: 'rebased', unit: '', dates: d, a: x.map(v => (v / x[0]) * 100), b: y.map(v => (v / y[0]) * 100) };
  const z = arr => { const m = arr.reduce((s, v) => s + v, 0) / arr.length, sd = Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1)) || 1; return arr.map(v => (v - m) / sd); };
  return { mode: 'zscore', unit: 'σ', dates: d, a: z(x), b: z(y) };
}

// ── the educators' lane and the so-what ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const LANES = { 'Nicholas Crown': 'informational lane', Jessinskip: 'informational lane', 'C.OG course text': 'C.OG lane', 'Podcast notes': 'informational lane', 'Colez notes': 'informational lane', 'Jordan videos': 'informational lane',
  'Quant Guild': 'technical lane', 'Friend (VIX ratio)': 'informational lane', 'Educator claim, as tested': 'Evidence Book' };
export const laneOf = who => LANES[who] ?? 'stored notes';

/** One line under the quotes: how the educators read the pair, what our test found, and how to use it. Built from the pair's own up/down words and the live verdicts. */
export function soWhat(row) {
  const p = row.pair, g = gradeChips(row.ev);
  const found = !g.length ? 'we have not tested what follows this reading yet'
    : g.map(c => `${c.verdict === 'null' ? 'no forward edge was found' : c.verdict === 'underpowered' ? 'the test was too small to rule out a small effect' : c.verdict === 'validated' ? 'a size/range effect was validated (never a direction)' : 'it is described only'}${c.count > 1 ? ` (${c.count} tests)` : ''}`).join('; ');
  return `Educators read a rise as "${p.up}" and a fall as "${p.down}". In our own tests of what follows: ${found}. Use it as a description of state.`;
}
export { MINUS };
