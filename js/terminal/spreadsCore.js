// js/terminal/spreadsCore.js: the maths and the plain-words captions behind the Insight tab's "Spreads & ratios" board. Pure: no DOM, no fetch, no clock.
//
// Input is the daily market bundle (/api/drill-series: { dates, series: { key: [num|null] } }, ~6 years of completed closes). A spread or a ratio is built
// only on the dates where BOTH legs exist, so nothing is filled in. Everything says where a line sits against its own history (a percentile), how it has
// moved, and what the Evidence Book found when this relationship was tested. It never says where anything goes next.
//
// As-of rule for the replay: scatterFrames() builds each frame from the points up to that date only, and scatterBounds() expands the axes from the
// frames already shown, so a past frame is never drawn with knowledge of what came after it.
import { seriesMeta, zgapSeries } from './spreadsDerived.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';
import { PAIRS, GENERAL_EV } from './spreadsLibrary.js';
import { TEMPLATES, legsOf } from './spreadsTemplates.js';

export const fin = v => typeof v === 'number' && Number.isFinite(v);
export const SHORT_SESSIONS = 1000;         // under about four years of closes is a short record
export const Z_MIN = 534;                    // a divergence needs a full two-year window plus a month of closes to rank
export const STALE_SESSIONS = 3;            // a pair whose last common close is this many sessions behind the bundle is "stale"
const MINUS = '−';
export const nth = p => { const n = Math.round(p * 100), t = n % 100; return `${n}${t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')}`; };
export const niceDate = iso => { const d = new Date(`${iso}T00:00:00Z`); return Number.isNaN(+d) ? String(iso) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
const sig = (v, n) => { const s = Number(v).toPrecision(n); return s.includes('e') ? String(Number(s)) : s; };

const LEVEL_FMT = { pct: v => `${v.toFixed(2)}%`, bn: v => `$${Math.round(v).toLocaleString('en-GB')}bn`, corr: v => v.toFixed(2), pts: v => `${v.toFixed(1)} pts` };
/** diff = x minus y in basis points; zgap = a divergence in standard deviations; usd = x minus y in dollars; a level with a `fmt` is a number with its own unit (a %, $bn, a correlation, vol points), compared by difference. */
export const diffLike = p => p.op === 'diff' || p.op === 'zgap' || p.op === 'usd' || (p.op === 'level' && !!p.fmt);
const gapish = p => p.op === 'diff' || p.op === 'zgap' || p.op === 'usd';
export function unitOf(p) {
  if (p.rebased) return 'pts'; if (p.op === 'diff') return 'bp'; if (p.op === 'zgap') return 'σ'; if (p.op === 'usd') return '$';
  if (p.op === 'level' && p.fmt) return { pct: 'pp', bn: '$bn', corr: '', pts: 'pts' }[p.fmt] ?? '';
  return '%';
}
/** How a value of this pair reads on a tile. diff = basis points; ratio and level = three significant figures. */
export function fmtValue(pair, v) {
  if (!fin(v)) return '–';
  if (pair.rebased) return `${v < 0 ? MINUS : '+'}${Math.abs(v).toFixed(1)} pts`;   // two prices each rebased to 100: the gap in index points
  if (pair.op === 'diff') return `${v < 0 ? MINUS : '+'}${Math.abs(v).toFixed(0)}bp`;
  if (pair.op === 'zgap') return `${v < 0 ? MINUS : '+'}${Math.abs(v).toFixed(1)}σ`;
  if (pair.op === 'usd') return `${v < 0 ? MINUS : '+'}$${Math.abs(v).toFixed(2)}`;
  if (pair.op === 'level') return LEVEL_FMT[pair.fmt]?.(v) ?? v.toFixed(2);
  return sig(v, 3);
}
/** A change over a window: a ratio moves in percent, a spread in basis points, a level in percent. */
export function changeOf(pair, now, then) {
  if (!fin(now) || !fin(then)) return null;
  if (pair.rebased) return { v: now - then, text: `${now - then < 0 ? MINUS : '+'}${Math.abs(now - then).toFixed(1)} pts`, unit: 'pts' };
  if (pair.op === 'diff') return { v: now - then, text: `${now - then < 0 ? MINUS : '+'}${Math.abs(now - then).toFixed(0)}bp`, unit: 'bp' };
  if (diffLike(pair)) { const dv = now - then, a = Math.abs(dv), u = unitOf(pair), sg = dv < 0 ? MINUS : '+'; return { v: dv, unit: u, text: pair.fmt === 'bn' ? `${sg}$${a.toFixed(0)}bn` : pair.op === 'usd' ? `${sg}$${a.toFixed(2)}` : pair.fmt === 'pts' ? `${sg}${a.toFixed(1)} pts` : `${sg}${a.toFixed(pair.op === 'zgap' ? 1 : 2)}${u}` }; }
  if (!(then !== 0)) return null;
  const p = (now / then - 1) * 100;
  return { v: p, text: `${p < 0 ? MINUS : '+'}${Math.abs(p).toFixed(Math.abs(p) < 10 ? 1 : 0)}%`, unit: '%' };
}

/** The line for a pair from the bundle, on the dates where every leg exists. null when a leg is not in the bundle. */
export function buildSeries(bundle, def) {
  const S = bundle?.series, dates = bundle?.dates; if (!S || !Array.isArray(dates)) return null;
  if (def.op === 'zgap') return zgapSeries(bundle, def);
  const X = S[def.x], Y = def.y ? S[def.y] : null;
  if (!X || (def.y && !Y)) return null;
  const d = [], v = [];
  for (let i = 0; i < dates.length; i++) {
    const a = X[i]; if (!fin(a)) continue;
    let val;
    if (def.op === 'level') val = a;
    else { const b = Y[i]; if (!fin(b)) continue; if (def.op === 'ratio') { if (!(b > 0)) continue; val = a / b; } else if (def.op === 'usd') val = a - b; else val = (a - b) * 100; }
    d.push(dates[i]); v.push(val);
  }
  return { dates: d, vals: v };
}

const quantile = (sorted, q) => { const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
/** Where a value sits in a sorted history, 0..1 (ties count half). */
export function percentileIn(sorted, x) {
  let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < x) lo = m + 1; else hi = m; }
  let eq = lo; while (eq < sorted.length && sorted[eq] === x) eq++;
  return sorted.length ? (lo + (eq - lo) / 2) / sorted.length : null;
}

/** The standing of a line against its own history. null when there are too few closes to say anything. */
export function describe(series, minN = 120) {
  const v = series?.vals; if (!v || v.length < minN) return null;
  const n = v.length, sorted = Float64Array.from(v).sort();
  let m = 0; for (const x of v) m += x; m /= n;
  let s2 = 0; for (const x of v) s2 += (x - m) * (x - m); const sd = Math.sqrt(s2 / (n - 1)) || 1;
  const last = v[n - 1], at = k => (n - 1 - k >= 0 ? v[n - 1 - k] : null);
  return { n, last, lastDate: series.dates[n - 1], from: series.dates[0], mean: m, sd, z: (last - m) / sd,
    pct: percentileIn(sorted, last), pct1w: fin(at(5)) ? percentileIn(sorted, at(5)) : null, pct1m: fin(at(21)) ? percentileIn(sorted, at(21)) : null,
    v1d: at(1), v1w: at(5), v1m: at(21), v3m: at(63), sorted, p: { p10: quantile(sorted, 0.1), p25: quantile(sorted, 0.25), p50: quantile(sorted, 0.5), p75: quantile(sorted, 0.75), p90: quantile(sorted, 0.9) }, min: sorted[0], max: sorted[n - 1] };
}
/** 0 in the middle of its history, 1 at either end: how extreme it is, not which end. */
export const extremeness = pct => (fin(pct) ? Math.abs(pct - 0.5) * 2 : 0);

const VERDICT_WORD = { validated: 'VALIDATED', null: 'NULL', underpowered: 'UNDERPOWERED', context: 'CONTEXT' };
const VERDICT_SAY = {
  validated: 'a measured effect, as the chip says (the validated findings here are about size and range, not direction)',
  null: 'tested, and nothing was found going forward',
  underpowered: 'tested, but the test could only have found a large effect, so it rules out a large one and says nothing about a small one',
  context: 'described only, with no claim that it predicts anything',
};
/** The Evidence Book entries for a pair, read live from the book so a changed verdict changes the chip. A missing id is dropped. */
export function evidenceFor(refs, book = DESK_EVIDENCE) {
  return (refs ?? []).map(r => { const e = (book ?? []).find(x => x.id === r.id); return e ? { id: e.id, about: r.about, verdict: e.verdict, word: VERDICT_WORD[e.verdict] ?? String(e.verdict).toUpperCase(), date: e.date, doc: e.doc, say: VERDICT_SAY[e.verdict] ?? '' } : null; }).filter(Boolean);
}

/** Every library pair against its own history, most extreme first. Pairs whose legs are not in the bundle come back in `missing`. */
export function rankPairs(bundle, pairs = PAIRS, book = DESK_EVIDENCE) {
  const rows = [], missing = [], allLast = [];
  const dIdx = new Map((bundle?.dates ?? []).map((x, i) => [x, i]));
  /** The two legs on the pair's own dates (for the "why it moved" view); null when a leg is not in the bundle or the pair is one series. */
  const legsFor = (pair, series) => {
    const lg = legsOf(pair), S = bundle?.series; if (!lg || !S?.[lg.x] || !S?.[lg.y]) return null;
    const at = k => series.dates.map(dt => { const v = S[k][dIdx.get(dt)]; return fin(v) ? v : null; });
    return { op: lg.op, xKey: lg.x, yKey: lg.y, x: at(lg.x), y: at(lg.y) };
  };
  for (const pair of pairs) {
    const series = buildSeries(bundle, pair);
    if (!series) { missing.push({ pair, why: pair.needs === 'extras' && bundle?.extrasOk === false ? 'The extra FRED series (/api/spread-extras) did not answer, and this pair needs one.' : pair.op === 'zgap' ? `A leg is missing or there are under ${Z_MIN} common closes to measure a divergence.` : 'A leg of this pair is not in the daily bundle.' }); continue; }
    const d = describe(series); if (!d) { missing.push({ pair, why: `Under 120 common closes (${series.vals.length}).` }); continue; }
    allLast.push(d.lastDate);
    rows.push({ id: pair.id, pair, label: pair.label, group: pair.group, story: pair.story ?? 'Other', series, ...d, score: extremeness(d.pct), side: d.pct >= 0.9 ? 'high' : d.pct <= 0.1 ? 'low' : 'mid',
      lastFmt: fmtValue(pair, d.last), c1: changeOf(pair, d.last, d.v1d), c5: changeOf(pair, d.last, d.v1w), c21: changeOf(pair, d.last, d.v1m), c63: changeOf(pair, d.last, d.v3m),
      short: d.n < SHORT_SESSIONS, ev: evidenceFor(pair.ev, book), tpl: TEMPLATES[pair.id] ?? null, kind: TEMPLATES[pair.id]?.kind ?? null, legs: legsFor(pair, series),
      refPct: refPctOf(pair, d) });
  }
  const refDate = allLast.sort().at(-1) ?? null;
  const dates = bundle?.dates ?? [];
  for (const r of rows) { const a = dates.indexOf(r.lastDate), b = dates.indexOf(refDate); r.stale = a >= 0 && b >= 0 && b - a > STALE_SESSIONS; }
  rows.sort((a, b) => b.score - a.score);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return { rows, missing, refDate };
}

/** Where the pair's natural level (zero, or 1.0 for a vol ratio) sits in its own history, 0..1; null when it has none or the line never reaches it. */
function refPctOf(pair, d) {
  const r = TEMPLATES[pair.id]?.ref; if (!r) return null;
  const v = r.one ? 1 : r.zero ? 0 : null; if (v == null || v < d.min || v > d.max) return null;
  return percentileIn(d.sorted, v);
}
const mark = side => (side === 'high' ? 'near the top of its range' : side === 'low' ? 'near the bottom of its range' : 'inside its usual range');
const years = n => (n >= 500 ? `${(n / 252).toFixed(n >= 1260 ? 0 : 1)} years` : `${n} sessions`);

/** Plain-English caption from the numbers. Describes state; the last sentence is the Evidence Book's own word, never a view. */
export function caption(row) {
  const p = row.pair;
  let first = `${p.short} is at the ${nth(row.pct)} percentile of its ${years(row.n)} of history (since ${niceDate(row.from)}), ${mark(row.side)}${row.short ? ' (a short record, so read it with care)' : ''}.`;
  if (p.op === 'zgap') first = `${p.short}: the gap between ${p.xname} and ${p.yname} is at the ${nth(row.pct)} percentile of its ${years(row.n)} (since ${niceDate(row.from)}), ${mark(row.side)}. Right now ${p.xname} is ${Math.abs(row.last).toFixed(1)}σ ${row.last >= 0 ? 'higher' : 'lower'} than ${p.yname} would suggest, each measured against its own last two years (${p.rel}).`;
  let move = '';
  if (row.c21) {
    const up = row.c21.v > 0;
    move = gapish(p) ? ` Over the last month the gap has ${up ? 'widened' : 'narrowed'} by ${row.c21.text.replace(/^[+−]/, '')}: ${up ? p.up : p.down}.`
      : ` Over the last month it has ${up ? 'risen' : 'fallen'} ${row.c21.text.replace(/^[+−]/, '')}: ${up ? p.up : p.down}.`;
  }
  let ev;
  if (!row.ev.length) ev = ' No test of this relationship is on file here yet.';
  else ev = ` ${row.ev.map(e => `Our test of ${e.about}: ${e.word} (${e.say})`).join('. ')}.`;
  return `${first}${move}${ev}`;
}
export const trustNote = row => `${row.n.toLocaleString('en-GB')} common closes since ${niceDate(row.from)}; the percentile is against this window only${row.short ? ' (a short record)' : ''}. A line at an extreme says it is stretched, not that it turns.`;

/** The last month (now), the month before it and the quarter before that, each rebased to its own start so the shapes can be laid on top of each other. */
export function ghosts(series, pair, len = 21) {
  const v = series.vals, n = v.length;
  const win = (end) => v.slice(Math.max(0, end - len), end);
  const rebase = w => { const s = w[0]; return w.map(x => (diffLike(pair) ? x - s : (x / s - 1) * 100)); };
  const sets = [{ label: 'last month', end: n, tone: 'now' }, { label: 'the month before', end: n - len, tone: 'm1' }, { label: 'a quarter ago', end: n - 63, tone: 'm3' }]
    .map(s => ({ ...s, w: win(s.end) })).filter(s => s.w.length >= len * 0.8 && s.end > 0);
  return { unit: unitOf(pair), paths: sets.map(s => ({ label: s.label, tone: s.tone, pts: rebase(s.w), from: series.dates[Math.max(0, s.end - len)], to: series.dates[s.end - 1] })) };
}

/** The slice of a line to draw: the last `sessions` points, or all of them. */
export const slice = (series, sessions) => (sessions && sessions < series.vals.length ? { dates: series.dates.slice(-sessions), vals: series.vals.slice(-sessions), ...(series.xz ? { xz: series.xz.slice(-sessions), yz: series.yz.slice(-sessions), sign: series.sign } : {}) } : series);

// ── the X-versus-Y picker ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const OPS = [{ id: 'ratio', label: 'X / Y (relative strength)' }, { id: 'rebased', label: 'X minus Y, both rebased to 100' }, { id: 'minus', label: 'X minus Y (yields and spreads only)' }];
const isRate = k => seriesMeta(k)?.kind === 'rate';
/** Is this operation allowed for these two series? X minus Y of two prices has no meaning, so it is refused with the reason. */
export function opAllowed(op, xKey, yKey) {
  if (xKey === yKey) return { ok: false, why: 'Pick two different series.' };
  if (op === 'minus' && !(isRate(xKey) && isRate(yKey))) return { ok: false, why: 'X minus Y only makes sense when both are yields or spreads (the same units). Use X / Y or the rebased version for prices.' };
  return { ok: true };
}
const labelOf = k => seriesMeta(k)?.label ?? k;
/** A custom pair as a line, over the last `sessions` closes (0 = all). rebased: both legs start at 100 on the first common date of the window. */
export function customSeries(bundle, xKey, yKey, op, sessions = 0) {
  const a = opAllowed(op, xKey, yKey); if (!a.ok) return { ok: false, error: a.why };
  const S = bundle?.series; if (!S?.[xKey] || !S?.[yKey]) return { ok: false, error: 'One of those series is not in the daily bundle.' };
  const d = [], x = [], y = [];
  for (let i = 0; i < bundle.dates.length; i++) { const p = S[xKey][i], q = S[yKey][i]; if (fin(p) && fin(q)) { d.push(bundle.dates[i]); x.push(p); y.push(q); } }
  const from = sessions && sessions < d.length ? d.length - sessions : 0;
  const D = d.slice(from), X = x.slice(from), Y = y.slice(from);
  if (D.length < 30) return { ok: false, error: `Only ${D.length} common closes: too few to say anything.` };
  let vals, pair;
  if (op === 'ratio') { vals = X.map((p, i) => (Y[i] > 0 ? p / Y[i] : NaN)); pair = { op: 'ratio', short: `${labelOf(xKey)} / ${labelOf(yKey)}`, up: `${labelOf(xKey)} is out-running ${labelOf(yKey)}`, down: `${labelOf(yKey)} is out-running ${labelOf(xKey)}` }; }
  else if (op === 'minus') { vals = X.map((p, i) => (p - Y[i]) * 100); pair = { op: 'diff', short: `${labelOf(xKey)} minus ${labelOf(yKey)}`, up: `${labelOf(xKey)} is rising against ${labelOf(yKey)}`, down: `${labelOf(xKey)} is falling against ${labelOf(yKey)}` }; }
  else { vals = X.map((p, i) => (p / X[0]) * 100 - (Y[i] / Y[0]) * 100); pair = { op: 'diff', rebased: true, short: `${labelOf(xKey)} minus ${labelOf(yKey)} (rebased)`, up: `${labelOf(xKey)} is out-running ${labelOf(yKey)} since the start`, down: `${labelOf(yKey)} is out-running ${labelOf(xKey)} since the start` }; }
  const keep = vals.map((v, i) => i).filter(i => fin(vals[i]));
  const series = { dates: keep.map(i => D[i]), vals: keep.map(i => vals[i]) };
  return { ok: true, series, pair, windowed: from > 0, xs: keep.map(i => X[i]), ys: keep.map(i => Y[i]), dates: series.dates };
}
/** Correlation of the DAILY moves of two aligned arrays (a change for yields and spreads, a log change for prices). null under 20 pairs. */
export function moveCorr(xs, ys, xKey, yKey, last = 0) {
  const ch = (a, key) => a.slice(1).map((v, i) => (isRate(key) ? v - a[i] : (v > 0 && a[i] > 0 ? Math.log(v / a[i]) : NaN)));
  let cx = ch(xs, xKey), cy = ch(ys, yKey); if (last) { cx = cx.slice(-last); cy = cy.slice(-last); }
  const idx = cx.map((v, i) => i).filter(i => fin(cx[i]) && fin(cy[i])); if (idx.length < 20) return null;
  let mx = 0, my = 0; for (const i of idx) { mx += cx[i]; my += cy[i]; } mx /= idx.length; my /= idx.length;
  let sxy = 0, sxx = 0, syy = 0; for (const i of idx) { sxy += (cx[i] - mx) * (cy[i] - my); sxx += (cx[i] - mx) ** 2; syy += (cy[i] - my) ** 2; }
  return sxx > 0 && syy > 0 ? { r: sxy / Math.sqrt(sxx * syy), n: idx.length } : null;
}
/** A custom line described like a library row (percentile, z, windows), or null when it is too short. */
export function customRow(c) {
  const d = describe(c.series, 30); if (!d) return null;
  return { ...d, pair: c.pair, series: c.series, side: d.pct >= 0.9 ? 'high' : d.pct <= 0.1 ? 'low' : 'mid', short: !c.windowed && d.n < SHORT_SESSIONS, lastFmt: fmtValue(c.pair, d.last), c21: changeOf(c.pair, d.last, d.v1m), c5: changeOf(c.pair, d.last, d.v1w), c63: changeOf(c.pair, d.last, d.v3m) };
}
/** Caption for a custom pair: where it sits, how the two legs have moved together, and what we have (or have not) tested. */
export function customCaption(info, xKey, yKey, all, recent, ev) {
  const row = info.row, p = info.pair, c = all ? `Their daily moves have a correlation of ${all.r.toFixed(2)} over ${all.n.toLocaleString('en-GB')} sessions${recent ? ` and ${recent.r.toFixed(2)} over the last ${recent.n}` : ''}` : 'Too few common days to measure how they move together';
  const first = `${p.short} is at the ${nth(row.pct)} percentile of its ${years(row.n)} (since ${niceDate(row.from)}), ${mark(row.side)}${row.short ? ' (a short record)' : ''}.`;
  const tail = ev?.length ? ` ${ev.map(e => `Our test of ${e.about}: ${e.word}.`).join(' ')}` : ' This pair is not one we have tested: the general tests of two markets coming apart, or one making a rare move, found nothing that follows (see the chips).';
  return `${first} ${c}. A correlation describes how they have moved together, not which leads.${tail}`;
}
/** The library pair that matches two chosen series (either order), or null. */
export function libraryMatch(xKey, yKey, op) { return PAIRS.find(p => (p.x === xKey && p.y === yKey && ((op === 'ratio' && p.op === 'ratio') || (op === 'minus' && p.op === 'diff'))) || (op === 'ratio' && p.op === 'ratio' && p.x === yKey && p.y === xKey)) ?? null; }
export const generalEvidence = (book = DESK_EVIDENCE) => evidenceFor(GENERAL_EV, book);

// ── the stories strip ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The most stretched readings across the stories, at most `perStory` from any one story so a single theme cannot fill the strip. Never a pair whose data is stale. */
export function storiesNow(rank, n = 6, perStory = 2) {
  const seen = {}, out = [], used = new Set();
  const line = r => `${r.pair.short} is at the ${nth(r.pct)} percentile of its ${years(r.n)}, ${mark(r.side)}${r.short ? ' (a short record)' : ''}.`;
  const add = r => { out.push({ id: r.id, story: r.story, row: r, text: line(r) }); used.add(r.id); seen[r.story] = (seen[r.story] ?? 0) + 1; };
  for (const r of rank.rows) { if (out.length >= n) break; if (r.stale || r.side === 'mid' || (seen[r.story] ?? 0) >= perStory) continue; add(r); }
  for (const r of rank.rows) { if (out.length >= Math.min(3, n)) break; if (!r.stale && !used.has(r.id)) add(r); }
  const live = rank.rows.filter(r => !r.stale), outer = live.filter(r => r.side !== 'mid').length;
  return { items: out, outer, total: live.length, chance: Math.round(live.length * 0.2) };
}

// ── the scatter and its replay ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Frames for the shared replay player: each is the trail of (x, y) ending on that date, built from points up to that date only. */
export function scatterFrames(xs, ys, dates, { span = 252, trail = 40, step = 3 } = {}) {
  const n = Math.min(xs.length, ys.length, dates.length), from = Math.max(0, n - span), frames = [];
  for (let i = from + Math.min(trail, n - from) - 1; i < n; i += step) frames.push(frameAt(xs, ys, dates, i, trail));
  if (frames.length && frames.at(-1).i !== n - 1) frames.push(frameAt(xs, ys, dates, n - 1, trail));
  return frames;
}
const frameAt = (xs, ys, dates, i, trail) => { const a = Math.max(0, i - trail + 1); return { t: dates[i], i, pts: xs.slice(a, i + 1).map((x, k) => [x, ys[a + k]]) }; };
/** Axis limits from the frames shown so far (frames 0..i): they only ever widen, and never use a later frame. */
export function scatterBounds(frames, i) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let f = 0; f <= Math.min(i, frames.length - 1); f++) for (const [x, y] of frames[f].pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const px = (x1 - x0) * 0.06 || 1, py = (y1 - y0) * 0.06 || 1;
  return { x0: x0 - px, x1: x1 + px, y0: y0 - py, y1: y1 + py };
}
