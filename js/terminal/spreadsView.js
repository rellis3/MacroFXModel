// js/terminal/spreadsView.js: the "Spreads & ratios" board (Insight tab, PREVIEW surface panel.insight.spreads). Draws js/terminal/spreadsCore.js over the
// educators' pairs in js/terminal/spreadsLibrary.js: a heat ladder (every pair ranked by how stretched it is against its own history), a hero view per
// pair (the line with its percentile bands and its NATURAL LEVEL, the two legs that made it move, where it has been before, ghosts of the last months, what
// the educators said next to what our tests found), a wall of the twelve most mentioned pairs, and an X-versus-Y picker with a scatter whose glowing trail
// plays through time on the shared replay player.
//
// Every pair has a KIND (js/terminal/spreadsTemplates.js: spread, vol ratio, relative strength, risk currency, correlation, level, divergence) that decides its
// reference lines (a zero line and zones, the 1.0 line, its 50- and 200-day average ...) and the plain sentence under its title.
//
// Presentation only. A spread or ratio describes state; every tile carries its Evidence Book verdict (read live from the book, in plain graded words), and
// nothing is worded as a view on direction. Theme tokens only (spreads.css); SVG uses CSS variables, so a theme change repaints it without a redraw. Motion is
// the shared .bv-sweep / glow CSS and is off under prefers-reduced-motion.
import { PAIRS, BY_ID, WALL_IDS, NOT_HELD, EDUCATORS, STORIES } from './spreadsLibrary.js';
import { rankPairs, caption, trustNote, ghosts, slice, nth, niceDate, fmtValue, customSeries, customRow, customCaption, moveCorr, opAllowed, OPS, libraryMatch, evidenceFor, generalEvidence, scatterFrames, scatterBounds, storiesNow } from './spreadsCore.js';
import { meaningOf, KINDS, refLines } from './spreadsTemplates.js';
import { gradeChips, GRADE_HELP, winShort, periodChange, componentSeries, decompose, episodes, compareSeries, laneOf, soWhat, sma } from './spreadsExplain.js';
import { SERIES, GROUPS as SERIES_GROUPS } from './insightSeries.js';
import { DERIVED, seriesMeta, augmentBundle } from './spreadsDerived.js';
import { esc } from './boardViz.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';

export const WINDOWS = { '1y': 252, '3y': 756, '6y': 0 };
const WIN_LABEL = { '1y': 'Last year', '3y': 'Last 3 years', '6y': 'All we hold' };
const LS = 'deskSpreads:v1';
const W = 720, H = 270, M = { l: 56, r: 18, t: 16, b: 26 };
const f1 = n => (Number.isFinite(n) ? n.toFixed(1) : '0');
const sig = (v, n = 3) => { const s = Number(v).toPrecision(n); return s.includes('e') ? String(Number(s)) : s; };

// ── small pieces ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** An Evidence Book chip with its own sentence (the hero's "What we found" list). compact = the verdict word only. */
export const chipHtml = (e, compact = false) => `<span class="chip sp-v sp-v-${esc(e.verdict)}" title="${esc(`Evidence Book: ${e.id} (${e.verdict}, ${e.date}). Examined: ${e.about}. ${e.say}.`)}">${compact ? `tested · ${esc(e.word)}` : `${esc(e.about)}: ${esc(e.word)}`}</span>`;
const noTestChip = '<span class="chip sp-v sp-v-none" title="No test of this relationship is on file in the Evidence Book yet.">Not tested here</span>';
/** The evidence for a row in plain graded words: one chip per verdict, with a count when several tests agree (the full list is in the hero). */
export function gradeChipsHtml(row, max = 3) {
  const g = gradeChips(row.ev); if (!g.length) return noTestChip;
  return g.slice(0, max).map(c => `<span class="chip sp-v sp-v-${esc(c.verdict)}" title="${esc(`Evidence Book: ${c.ids.join(', ')} (${c.word}). Examined: ${c.abouts.join('; ')}.`)}">${esc(c.label)}${c.count > 1 ? ` &middot; ${c.count} tests` : ''}</span>`).join('');
}

/** The percentile track: the extreme tenths shaded, the median ticked, a glowing marker for now, fainter ticks for a week and a month ago, and the pair's natural level (0 or 1.0) where it has one. */
export function trackHtml(row) {
  const p = x => Math.min(1, Math.max(0, x ?? 0)).toFixed(3);
  const r = row.tpl?.ref, refLabel = r?.one ? '1.0' : r?.zero ? '0' : '';
  return `<span class="sp-track" role="img" aria-label="${esc(`${nth(row.pct)} percentile now; ${row.pct1w != null ? `${nth(row.pct1w)} a week ago; ` : ''}${row.pct1m != null ? `${nth(row.pct1m)} a month ago` : ''}${refLabel && row.refPct != null ? `; its natural level, ${refLabel}, sits at the ${nth(row.refPct)} percentile` : ''}`)}"><i class="sp-ext l"></i><i class="sp-ext r"></i><i class="sp-band"></i><i class="sp-medtick"></i>${refLabel && row.refPct != null ? `<u class="sp-ref" style="--p:${p(row.refPct)}" title="${refLabel === '1.0' ? 'the 1.0 line: front vol equals back vol' : 'the zero line'}"><em>${refLabel}</em></u>` : ''}${row.pct1m != null ? `<u class="sp-t m" style="--p:${p(row.pct1m)}" title="a month ago"></u>` : ''}${row.pct1w != null ? `<u class="sp-t w" style="--p:${p(row.pct1w)}" title="a week ago"></u>` : ''}<b class="sp-now" style="--p:${p(row.pct)}"></b></span>`;
}

// ── charts ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The hero line: the series over a window, the history's 10-90 and 25-75 bands, the median, the pair's natural level (zero line and zones, the 1.0 line, its trend averages), a glowing end point. `s` is a {dates, vals} slice. */
export function heroSvg(row, s) {
  const v = s.vals, n = v.length; if (n < 2) return '<div class="in-empty">Too few closes to draw.</div>';
  const pair = row.pair, p = row.p, R = refLines(pair.id);
  const full = row.series?.vals ?? v, a50 = R.trend ? sma(full, 50).slice(-n) : null, a200 = R.trend ? sma(full, 200).slice(-n) : null;
  const ext = [...v, ...(a50 ?? []).filter(Number.isFinite), ...(a200 ?? []).filter(Number.isFinite)];
  let lo = Math.min(...ext), hi = Math.max(...ext); const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
  const X = i => M.l + (i / (n - 1)) * (W - M.l - M.r), Y = a => M.t + (1 - (a - lo) / (hi - lo)) * (H - M.t - M.b);
  const band = (a, b, cls) => { const a1 = Math.max(lo, Math.min(a, b)), b1 = Math.min(hi, Math.max(a, b)); return a1 < b1 ? `<rect class="${cls}" x="${M.l}" y="${f1(Y(b1))}" width="${W - M.l - M.r}" height="${f1(Y(a1) - Y(b1))}"/>` : ''; };
  const stride = Math.max(1, Math.floor(n / 420)), pts = []; for (let i = 0; i < n; i += stride) pts.push(i); if (pts.at(-1) !== n - 1) pts.push(n - 1);
  const d = pts.map((i, k) => `${k ? 'L' : 'M'}${f1(X(i))},${f1(Y(v[i]))}`).join('');
  const ma = arr => { const q = pts.filter(i => Number.isFinite(arr[i])); return q.length > 1 ? q.map((i, k) => `${k ? 'L' : 'M'}${f1(X(i))},${f1(Y(arr[i]))}`).join('') : ''; };
  const yt = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * k) / 4);
  const xt = []; let yr = ''; s.dates.forEach((dt, i) => { const y = dt.slice(0, 4); if (y !== yr) { yr = y; if (i > 0 && i < n - 8) xt.push([i, y]); } });
  const last = v[n - 1], ex = X(n - 1), ey = Y(last), anchor = ex > W - 96 ? 'end' : 'start';
  // natural level: named zones (spreads), the 1.0 line (vol ratios), the zero line, one and two sigma (divergences)
  const ref = [];
  if (R.zones && pair.op !== 'zgap') { let prev = -Infinity; R.zones.forEach((z, i) => { const a = Math.max(lo, prev), b = Math.min(hi, z.below); if (a < b) ref.push(`<rect class="sp-zone sp-zone-${i % 3}" x="${M.l}" y="${f1(Y(b))}" width="${W - M.l - M.r}" height="${f1(Y(a) - Y(b))}"/><text class="sp-zl" x="${M.l + 6}" y="${f1(Y((a + b) / 2) + 3)}">${esc(z.label)}</text>`); prev = z.below; }); }
  if (R.sigma) for (const [k, lab] of [[1, 'stretched'], [2, 'far out']]) for (const sgnv of [1, -1]) { const a = sgnv * k; if (a > lo && a < hi) ref.push(`<line class="sp-sig" x1="${M.l}" x2="${W - M.r}" y1="${f1(Y(a))}" y2="${f1(Y(a))}"/>${sgnv > 0 ? `<text class="sp-zl" x="${W - M.r - 4}" y="${f1(Y(a) - 3)}" text-anchor="end">${a}σ ${lab}</text>` : ''}`); }
  if (R.one && lo < 1 && hi > 1) ref.push(`<line class="sp-zero" x1="${M.l}" x2="${W - M.r}" y1="${f1(Y(1))}" y2="${f1(Y(1))}"/><text class="sp-zl" x="${M.l + 4}" y="${f1(Y(1) - 4)}">1.0: the two are priced alike</text>`);
  if (R.zero && !R.one && lo < 0 && hi > 0) ref.push(`<line class="sp-zero" x1="${M.l}" x2="${W - M.r}" y1="${f1(Y(0))}" y2="${f1(Y(0))}"/>${R.zones && pair.op !== 'zgap' ? '' : `<text class="sp-zl" x="${M.l + 4}" y="${f1(Y(0) - 4)}">${pair.op === 'zgap' ? 'zero: in line' : 'zero'}</text>`}`);
  return `<svg class="sp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${pair.short} over ${n} sessions, now ${fmtValue(pair, last)}, ${nth(row.pct)} percentile of its history`)}">
${ref.join('')}${band(p.p10, p.p90, 'sp-b1')}${band(p.p25, p.p75, 'sp-b2')}
${yt.map(a => `<line class="sp-grid" x1="${M.l}" x2="${W - M.r}" y1="${f1(Y(a))}" y2="${f1(Y(a))}"/><text class="sp-ax" x="${M.l - 8}" y="${f1(Y(a) + 3)}" text-anchor="end">${esc(fmtValue(pair, a))}</text>`).join('')}
${p.p50 >= lo && p.p50 <= hi ? `<line class="sp-med" x1="${M.l}" x2="${W - M.r}" y1="${f1(Y(p.p50))}" y2="${f1(Y(p.p50))}"/><text class="sp-ax" x="${W - M.r}" y="${f1(Y(p.p50) - 4)}" text-anchor="end">median of the whole record</text>` : ''}
${xt.map(([i, y]) => `<text class="sp-ax" x="${f1(X(i))}" y="${H - 8}" text-anchor="middle">${y}</text>`).join('')}
${a200 && ma(a200) ? `<path class="sp-ma sp-ma200" d="${ma(a200)}"/>` : ''}${a50 && ma(a50) ? `<path class="sp-ma sp-ma50" d="${ma(a50)}"/>` : ''}
<path class="sp-line sp-glow bv-sweep" pathLength="1" d="${d}"/>
<circle class="sp-end sp-glow" cx="${f1(ex)}" cy="${f1(ey)}" r="4.5"/><text class="sp-endv" x="${f1(ex + (anchor === 'end' ? -9 : 9))}" y="${f1(ey - 9)}" text-anchor="${anchor}">${esc(fmtValue(pair, last))}</text>
</svg>`;
}

/** The two legs (or two compared pairs) on one chart: each line starts level at its window start, so the one that pulled away is plain to see. */
export function twoLineSvg({ dates, a, b, la, lb, mode, unit }) {
  const n = a.length; if (n < 2) return '<div class="in-empty">Too few closes to draw.</div>';
  const all = a.concat(b); let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const X = i => M.l + (i / (n - 1)) * (W - M.l - M.r), Y = v => M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b);
  const stride = Math.max(1, Math.floor(n / 360)), idx = []; for (let i = 0; i < n; i += stride) idx.push(i); if (idx.at(-1) !== n - 1) idx.push(n - 1);
  const line = arr => idx.map((i, k) => `${k ? 'L' : 'M'}${f1(X(i))},${f1(Y(arr[i]))}`).join('');
  const fmt = v => (mode === 'rebased' ? v.toFixed(0) : mode === 'zscore' ? `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}σ` : `${v < 0 ? '−' : '+'}${unit === '$' ? '$' : ''}${Math.abs(v).toFixed(unit === 'bp' ? 0 : 2)}${unit === 'bp' ? 'bp' : ''}`);
  const yt = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * k) / 4), xt = []; let yr = ''; dates.forEach((dt, i) => { const y = dt.slice(0, 4); if (y !== yr) { yr = y; if (i > 0 && i < n - 8) xt.push([i, y]); } });
  const base = mode === 'rebased' ? 100 : 0, ex = X(n - 1), ea = Y(a[n - 1]), eb = Y(b[n - 1]), left = ex > W - 140;
  return `<svg class="sp-chart sp-two" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${la} and ${lb}, each starting level at the start of the window; now ${fmt(a[n - 1])} and ${fmt(b[n - 1])}`)}">
${yt.map(v => `<line class="sp-grid" x1="${M.l}" x2="${W - M.r}" y1="${f1(Y(v))}" y2="${f1(Y(v))}"/><text class="sp-ax" x="${M.l - 8}" y="${f1(Y(v) + 3)}" text-anchor="end">${esc(fmt(v))}</text>`).join('')}
${lo < base && hi > base ? `<line class="sp-med" x1="${M.l}" x2="${W - M.r}" y1="${f1(Y(base))}" y2="${f1(Y(base))}"/>` : ''}
${xt.map(([i, y]) => `<text class="sp-ax" x="${f1(X(i))}" y="${H - 8}" text-anchor="middle">${y}</text>`).join('')}
<path class="sp-line sp-glow bv-sweep" pathLength="1" d="${line(a)}"/><path class="sp-line2" d="${line(b)}"/>
<circle class="sp-end sp-glow" cx="${f1(ex)}" cy="${f1(ea)}" r="4.2"/><circle class="sp-end2" cx="${f1(ex)}" cy="${f1(eb)}" r="3.8"/>
<text class="sp-endv" x="${f1(ex + (left ? -9 : 9))}" y="${f1(ea - 8)}" text-anchor="${left ? 'end' : 'start'}">${esc(la)}</text><text class="sp-endv sp-endv2" x="${f1(ex + (left ? -9 : 9))}" y="${f1(eb + 15)}" text-anchor="${left ? 'end' : 'start'}">${esc(lb)}</text></svg>`;
}

/** The last month against the month before and a quarter ago, each rebased to its own start so the shapes lie on top of each other. */
export function ghostSvg(g) {
  const w = 360, h = 190, m = { l: 44, r: 12, t: 12, b: 26 };
  const all = g.paths.flatMap(p => p.pts); if (g.paths.length < 1 || all.length < 3) return '<div class="in-empty">Too little history for the ghosts.</div>';
  let lo = Math.min(0, ...all), hi = Math.max(0, ...all); const pad = (hi - lo) * 0.1 || 1; lo -= pad; hi += pad;
  const len = Math.max(...g.paths.map(p => p.pts.length)), X = i => m.l + (i / (len - 1)) * (w - m.l - m.r), Y = a => m.t + (1 - (a - lo) / (hi - lo)) * (h - m.t - m.b);
  const unit = g.unit === 'bp' ? 'bp' : '%';
  const path = p => p.pts.map((a, i) => `${i ? 'L' : 'M'}${f1(X(i))},${f1(Y(a))}`).join('');
  const tick = a => `${a < 0 ? '−' : a > 0 ? '+' : ''}${Math.abs(a).toFixed(Math.abs(a) < 10 ? 1 : 0)}${unit}`;
  const order = [...g.paths].reverse();   // the oldest first so the newest sits on top
  const end = g.paths[0].pts.at(-1);
  return `<svg class="sp-chart sp-ghosts" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(`The last month ${tick(end)} from its start, against the month before and a quarter ago`)}">
<line class="sp-grid" x1="${m.l}" x2="${w - m.r}" y1="${f1(Y(0))}" y2="${f1(Y(0))}"/><text class="sp-ax" x="${m.l - 6}" y="${f1(Y(0) + 3)}" text-anchor="end">0</text>
<text class="sp-ax" x="${m.l - 6}" y="${f1(Y(hi - pad) + 3)}" text-anchor="end">${esc(tick(hi - pad))}</text><text class="sp-ax" x="${m.l - 6}" y="${f1(Y(lo + pad) + 3)}" text-anchor="end">${esc(tick(lo + pad))}</text>
${order.map(p => `<path class="sp-gh sp-gh-${p.tone}${p.tone === 'now' ? ' sp-glow bv-sweep' : ''}" pathLength="1" d="${path(p)}"/>`).join('')}
<circle class="sp-end sp-glow" cx="${f1(X(g.paths[0].pts.length - 1))}" cy="${f1(Y(end))}" r="3.8"/>
<text class="sp-ax" x="${m.l}" y="${h - 8}">start of each window</text><text class="sp-ax" x="${w - m.r}" y="${h - 8}" text-anchor="end">21 sessions</text></svg>
<div class="sp-legend">${g.paths.map(p => `<span class="sp-lg sp-lg-${p.tone}"><i></i>${esc(p.label)} <em>${esc(niceDate(p.from))} to ${esc(niceDate(p.to))}</em></span>`).join('')}</div>`;
}

/** A tiny line with a glowing end, for the wall. Normalised to its own range. */
export function sparkSvg(vals, w = 220, h = 54) {
  const v = vals.filter(Number.isFinite); if (v.length < 3) return '';
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1, P = 3, step = Math.max(1, Math.floor(v.length / 160));
  const idx = []; for (let i = 0; i < v.length; i += step) idx.push(i); if (idx.at(-1) !== v.length - 1) idx.push(v.length - 1);
  const pts = idx.map(i => [P + (i / (v.length - 1)) * (w - 2 * P), P + (1 - (v[i] - lo) / span) * (h - 2 * P)]);
  const [ex, ey] = pts.at(-1);
  return `<svg class="sp-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path class="sp-line sp-glow bv-sweep" pathLength="1" d="${pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f1(x)},${f1(y)}`).join('')}"/><circle class="sp-end sp-glow" cx="${f1(ex)}" cy="${f1(ey)}" r="3"/></svg>`;
}

/** The X-versus-Y scatter. `frame` = { pts: [[x, y]...] } the trail to draw; `all` = faint history points; bounds from scatterBounds (or the full range). */
export function scatterSvg({ pts, all = [], bounds, xl, yl, nowLabel = '' }) {
  const w = 520, h = 340, m = { l: 58, r: 16, t: 14, b: 38 }, b = bounds;
  const X = a => m.l + ((a - b.x0) / (b.x1 - b.x0 || 1)) * (w - m.l - m.r), Y = a => m.t + (1 - (a - b.y0) / (b.y1 - b.y0 || 1)) * (h - m.t - m.b);
  const ticks = (lo, hi) => Array.from({ length: 4 }, (_, k) => lo + ((hi - lo) * (k + 0.5)) / 4);
  const seg = pts.slice(1).map((p, i) => `<line class="sp-trail" style="opacity:${(0.12 + 0.88 * ((i + 1) / pts.length)).toFixed(2)}" x1="${f1(X(pts[i][0]))}" y1="${f1(Y(pts[i][1]))}" x2="${f1(X(p[0]))}" y2="${f1(Y(p[1]))}"/>`).join('');
  const last = pts.at(-1);
  return `<svg class="sp-chart sp-scatter" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(`${yl} against ${xl}, the last ${pts.length} sessions as a trail ending ${nowLabel}`)}">
${ticks(b.x0, b.x1).map(a => `<line class="sp-grid" x1="${f1(X(a))}" x2="${f1(X(a))}" y1="${m.t}" y2="${h - m.b}"/><text class="sp-ax" x="${f1(X(a))}" y="${h - m.b + 14}" text-anchor="middle">${esc(sig(a))}</text>`).join('')}
${ticks(b.y0, b.y1).map(a => `<line class="sp-grid" x1="${m.l}" x2="${w - m.r}" y1="${f1(Y(a))}" y2="${f1(Y(a))}"/><text class="sp-ax" x="${m.l - 6}" y="${f1(Y(a) + 3)}" text-anchor="end">${esc(sig(a))}</text>`).join('')}
${all.map(([x, y]) => `<circle class="sp-dot" cx="${f1(X(x))}" cy="${f1(Y(y))}" r="1.6"/>`).join('')}
<g class="sp-glow">${seg}</g>
${last ? `<circle class="sp-end sp-glow" cx="${f1(X(last[0]))}" cy="${f1(Y(last[1]))}" r="5"/>` : ''}
<text class="sp-ax" x="${(w + m.l) / 2}" y="${h - 6}" text-anchor="middle">${esc(xl)}</text><text class="sp-ax" x="12" y="${(h - m.b) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(h - m.b) / 2})">${esc(yl)}</text></svg>`;
}
const fullBounds = (xs, ys) => { const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), px = (x1 - x0) * 0.06 || 1, py = (y1 - y0) * 0.06 || 1; return { x0: x0 - px, x1: x1 + px, y0: y0 - py, y1: y1 + py }; };

// ── the board ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const flags = r => `${r.short ? ' · short record' : ''}${r.stale ? ` · stale (last common close ${niceDate(r.lastDate)})` : ''}`;
const mentionsText = p => (p.mentions.n === 0 ? 'Added from general market knowledge: no line about it in the stored educator notes' : `${p.mentions.n} line${p.mentions.n === 1 ? '' : 's'} in the stored notes${p.mentions.shared ? ` (shared with the ${p.mentions.shared} pairs)` : ''}`);
const kindTag = r => (r.kind ? `<span class="sp-kind sp-kind-${esc(r.kind)}" title="${esc(`${KINDS[r.kind].label}: ${KINDS[r.kind].blurb}. Reference: ${KINDS[r.kind].ref}.`)}">${esc(KINDS[r.kind].label)}</span>` : '');

function quotesHtml(p) {
  if (!p.say.length) return `<p class="muted sp-none">${p.mentions.n === 0 ? 'No educator quote: this pair comes from general market knowledge, not the stored notes.' : `No quote from the stored notes for this one. ${esc(mentionsText(p))}; the raw transcripts were not mined.`}</p>`;
  return p.say.map(s => `<blockquote class="sp-q"><p>${esc(s.text)}</p><footer><b>${esc(s.who)}</b> <span class="sp-lane">${esc(laneOf(s.who))}</span> &middot; ${esc(s.src)}${s.verbatim ? '' : ' <i>(the desk\'s note on the clip, not his exact words)</i>'}</footer></blockquote>`).join('');
}
function foundHtml(row) {
  if (!row.ev.length) return '<p class="muted sp-none">Not tested here yet. The general tests of a rare move or two markets coming apart found nothing that follows (above). A preregistration stub is proposed in plans/SPREADS_AND_RATIOS.md.</p>';
  return `<ul class="sp-found">${row.ev.map(e => `<li>${chipHtml(e)}<p class="muted">${esc(e.say)}. <span>${esc(e.doc ?? '')}</span></p></li>`).join('')}</ul>`;
}

/** The "Stories now" strip: the most stretched readings across the seven stories, in plain English, each with its Evidence Book chip or "not tested here". */
export function storiesStripHtml(rank) {
  const S = storiesNow(rank); if (!S.items.length) return '';
  const lab = id => STORIES.find(x => x.id === id)?.label ?? id;
  return `<section class="sp-stories" aria-label="Stories now"><div class="sp-stories-h"><b>Stories now</b><span class="muted">${S.outer} of the ${S.total} pairs with a reading today sit in the outer tenth at either end of their own history; about ${S.chance} would by chance alone, so the longer this list runs past that, the more the market is stretched.</span></div>
<ul class="sp-stories-l">${S.items.map(it => `<li><button type="button" class="sp-story-card" data-open="${esc(it.id)}" aria-label="Open ${esc(it.row.pair.short)}"><span class="sp-story-tag sp-story-${esc(it.story)}">${esc(lab(it.story))}</span><span class="sp-story-t">${esc(it.text)}</span><span class="sp-chips">${gradeChipsHtml(it.row, 1)}</span></button></li>`).join('')}</ul></section>`;
}

/** The divergence panel: the two lines as z-scores against their own last two years (the second flipped when they usually move opposite ways), the gap shaded. `s` is a zgap slice. */
export function divergenceSvg(row, s) {
  const n = s.vals.length; if (n < 2 || !s.xz) return '<div class="in-empty">Too few closes to draw.</div>';
  const p = row.pair, sign = s.sign ?? 1, xs = s.xz, ys = s.yz.map(v => sign * v);
  const all = xs.concat(ys); let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const X = i => M.l + (i / (n - 1)) * (W - M.l - M.r), Y = a => M.t + (1 - (a - lo) / (hi - lo)) * (H - M.t - M.b);
  const stride = Math.max(1, Math.floor(n / 360)), idx = []; for (let i = 0; i < n; i += stride) idx.push(i); if (idx.at(-1) !== n - 1) idx.push(n - 1);
  const line = a => idx.map((i, k) => `${k ? 'L' : 'M'}${f1(X(i))},${f1(Y(a[i]))}`).join('');
  const area = `${idx.map((i, k) => `${k ? 'L' : 'M'}${f1(X(i))},${f1(Y(xs[i]))}`).join('')}${[...idx].reverse().map(i => `L${f1(X(i))},${f1(Y(ys[i]))}`).join('')}Z`;
  const yt = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * k) / 4), xt = []; let yr = ''; s.dates.forEach((dt, i) => { const y = dt.slice(0, 4); if (y !== yr) { yr = y; if (i > 0 && i < n - 8) xt.push([i, y]); } });
  const ex = X(n - 1), ey = Y(xs[n - 1]), ey2 = Y(ys[n - 1]), left = ex > W - 120;
  return `<svg class="sp-chart sp-div" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${p.xname} against ${p.yname}, each as standard deviations from its own last two years; the gap now is ${fmtValue(p, row.last)}`)}">
${yt.map(a => `<line class="sp-grid" x1="${M.l}" x2="${W - M.r}" y1="${f1(Y(a))}" y2="${f1(Y(a))}"/><text class="sp-ax" x="${M.l - 8}" y="${f1(Y(a) + 3)}" text-anchor="end">${a >= 0 ? '+' : '−'}${Math.abs(a).toFixed(1)}σ</text>`).join('')}
${lo < 0 && hi > 0 ? `<line class="sp-med" x1="${M.l}" x2="${W - M.r}" y1="${f1(Y(0))}" y2="${f1(Y(0))}"/>` : ''}
${xt.map(([i, y]) => `<text class="sp-ax" x="${f1(X(i))}" y="${H - 8}" text-anchor="middle">${y}</text>`).join('')}
<path class="sp-gap" d="${area}"/><path class="sp-line sp-glow bv-sweep" pathLength="1" d="${line(xs)}"/><path class="sp-line2" d="${line(ys)}"/>
<circle class="sp-end sp-glow" cx="${f1(ex)}" cy="${f1(ey)}" r="4.5"/><circle class="sp-end2" cx="${f1(ex)}" cy="${f1(ey2)}" r="4"/>
<text class="sp-endv" x="${f1(ex + (left ? -9 : 9))}" y="${f1(ey - 8)}" text-anchor="${left ? 'end' : 'start'}">${esc(p.xname)}</text><text class="sp-endv sp-endv2" x="${f1(ex + (left ? -9 : 9))}" y="${f1(ey2 + 15)}" text-anchor="${left ? 'end' : 'start'}">${esc(p.yname)}${sign < 0 ? ' (flipped)' : ''}</text></svg>`;
}

/** WHY it moved: the two legs on one chart (each starting level), and a sentence on which one did the work. Divergences already draw their two legs; single series say so. */
export function componentsHtml(row, win = '3y') {
  const dec = decompose(row, 21);
  if (row.pair.op === 'zgap') return dec ? `<p class="sp-dec"><b>Why it moved.</b> ${esc(dec.text)}</p>` : '';
  const c = componentSeries(row, WINDOWS[win] ?? 0);
  if (!c) return `<div class="card sp-card sp-compcard"><div class="ch"><span class="lbl">What moved it</span></div><p class="muted sp-none">${row.legs ? 'Too few closes in this window to split the two legs.' : 'This one is a single series (' + esc(row.pair.what.split('.')[0].toLowerCase()) + '), so there are no two legs to split.'}</p></div>`;
  const unitTxt = c.kind === 'rebased' ? 'Both start at 100 at the start of the window: a line above 100 has risen over it.' : `Each line is the change since the start of the window, in ${c.unit === 'bp' ? 'basis points' : c.unit === '$' ? 'dollars' : 'points'}.`;
  return `<div class="card sp-card sp-compcard"><div class="ch"><span class="lbl">What moved it: ${esc(c.names.x)} and ${esc(c.names.y)}</span></div>${twoLineSvg({ dates: c.dates, a: c.x, b: c.y, la: c.names.x, lb: c.names.y, mode: c.kind === 'rebased' ? 'rebased' : 'change', unit: c.unit })}
<p class="sp-key muted">${esc(unitTxt)}</p>${dec ? `<p class="sp-dec">${esc(dec.text)}</p>` : ''}</div>`;
}

/** WHERE it has been before: the earlier stretches in the same zone of its own record. Descriptive, with the count. */
export function episodesHtml(row) {
  const e = episodes(row.series, row.pct); if (!e) return '';
  const lo = fmtValue(row.pair, e.band[0]), hi = fmtValue(row.pair, e.band[1]);
  const now = e.current ? `It has been in this zone for ${e.current.len} session${e.current.len === 1 ? '' : 's'} since ${niceDate(e.current.from)}.` : 'It has just entered this zone.';
  if (!e.n) return `<div class="sp-eps"><h4>Where it has been before</h4><p class="muted">The zone around today's reading (${esc(lo)} to ${esc(hi)}, the same part of its own history) has no earlier stretch in the ${row.n.toLocaleString('en-GB')} closes we hold. ${esc(now)}</p></div>`;
  return `<div class="sp-eps"><h4>Where it has been before</h4><p class="muted">The zone around today's reading is ${esc(lo)} to ${esc(hi)} (the same part of its own history). It has sat there ${e.n} time${e.n === 1 ? '' : 's'} before, with a median stay of ${e.median} sessions. ${esc(now)}</p>
<ul class="sp-eplist">${e.past.map(p => `<li><span>${esc(niceDate(p.from))} to ${esc(niceDate(p.to))}</span><b>${p.len} session${p.len === 1 ? '' : 's'}</b></li>`).join('')}</ul>
<p class="sp-key muted">A description of where the line has been, not a forecast of where it goes.</p></div>`;
}

/** The hero view for one ranked row, as HTML. `win` is a key of WINDOWS. */
export function heroHtml(row, win = '3y') {
  const s = slice(row.series, WINDOWS[win] ?? 0), g = ghosts(row.series, row.pair), p = row.pair, K = row.kind ? KINDS[row.kind] : null, R = refLines(p.id);
  const pills = Object.keys(WINDOWS).map(k => `<button type="button" class="in-pill" data-win="${k}" aria-pressed="${win === k}">${esc(WIN_LABEL[k])}</button>`).join('');
  const canPick = p.op !== 'level';
  const refKey = R.trend ? 'Dashed teal: its 50-day average. Dotted gold: its 200-day average. ' : R.zones && p.op !== 'zgap' ? 'The tinted bands name the zones. ' : R.one ? 'The line marked 1.0 is where the two are priced alike. ' : R.zero ? 'The line marked zero is its natural level. ' : '';
  return `<div class="sp-hero" role="region" aria-label="${esc(p.short)} in detail">
<p class="sp-what"><b>What this is.</b> ${esc(p.what)}</p>
<p class="sp-cap">${esc(caption(row))}</p>
${K ? `<p class="sp-kindline"><span class="sp-kind sp-kind-${esc(row.kind)}">${esc(K.label)}</span> ${esc(K.blurb)}. Reference lines: ${esc(K.ref)}.</p>` : ''}
<div class="sp-hero-grid">${p.op === 'zgap' ? `<div class="card sp-card sp-divcard"><div class="ch"><span class="lbl">${esc(p.xname)} against ${esc(p.yname)}</span><span class="r in-pills" role="group" aria-label="Window">${pills}</span></div>${divergenceSvg(row, s)}
<p class="sp-key muted">Each line is measured as a z-score against its own last two years${(row.series.sign ?? 1) < 0 ? ' (the second is flipped because they usually move opposite ways)' : ''}. The shaded gap between them is the line below. A wide gap says they are out of line with each other, not which one gives way.</p>${componentsHtml(row, win)}</div>` : ''}<div class="card sp-card"><div class="ch"><span class="lbl">${esc(p.short)} over time</span>${p.op === 'zgap' ? '' : `<span class="r in-pills" role="group" aria-label="Window">${pills}</span>`}</div>${heroSvg(row, s)}
<p class="sp-key muted">Shaded: the middle 80% and middle 50% of the whole record. ${esc(refKey)}A line at the edge says it is stretched, not that it turns.</p></div>
${p.op === 'zgap' ? '' : componentsHtml(row, win)}
<div class="card sp-card"><div class="ch"><span class="lbl">The last month against the months before</span></div>${ghostSvg(g)}</div></div>
${episodesHtml(row)}
<div class="sp-two"><div class="sp-said"><h4>What they said</h4>${quotesHtml(p)}</div><div class="sp-foundbox"><h4>What we found</h4>${foundHtml(row)}</div></div>
<p class="sp-sowhat">${esc(soWhat(row))}</p>
<p class="sp-trust muted">${esc(trustNote(row))} ${esc(mentionsText(p))}.${canPick ? ` <button type="button" class="btn in-go" data-pick-pair="${esc(row.id)}">Open in the picker</button>` : ''}</p></div>`;
}

function rowHtml(r, open, win, st) {
  const cmpOn = (st.cmp ?? []).includes(r.id);
  return `<li class="in-li sp-li"><div class="sp-rowwrap"><button type="button" class="in-row sp-row" data-id="${esc(r.id)}" aria-expanded="${open ? 'true' : 'false'}">
<span class="in-nm"><b>${esc(r.pair.label)}</b><span class="sp-mean">${esc(meaningOf(r))}</span><i class="in-gr">${kindTag(r)} ${esc(r.group)}${st.sort === 'mentioned' ? ` · mentions: ${r.pair.mentions.n}` : ''}${esc(flags(r))}</i></span>
${trackHtml(r)}<span class="sp-pc" title="where it sits in its own history over the window shown"><b>${nth(r.pct)}</b><i>of ${esc(winShort(r.n))}</i></span>
<span class="in-val">${esc(r.lastFmt)}</span><span class="sp-ch muted" title="change over the last 21 sessions">${r.c21 ? `<i>1m</i> ${esc(r.c21.text)}` : ''}</span>
<span class="sp-chips">${gradeChipsHtml(r)}</span></button><button type="button" class="sp-cmp" data-cmp="${esc(r.id)}" aria-pressed="${cmpOn}" aria-label="${esc(`Compare ${r.pair.short} with another pair`)}" title="Compare with another pair">&#8644;</button></div>${open ? heroHtml(r, win) : ''}</li>`;
}

const GROUP_ORDER = ['Breadth and style', 'Rates', 'Credit', 'Volatility', 'Commodities', 'Currencies', 'Cross-asset', 'Funding and liquidity', 'Divergences'];

/** The compare card: two ranked rows on their common dates, each starting level. */
export function compareHtml(rank, st) {
  const by = Object.fromEntries(rank.rows.map(r => [r.id, r])), ids = (st.cmp ?? []).filter(id => by[id]);
  if (!ids.length) return '';
  const win = st.cw ?? '3y', pills = Object.keys(WINDOWS).map(k => `<button type="button" class="in-pill" data-cwin="${k}" aria-pressed="${win === k}">${esc(WIN_LABEL[k])}</button>`).join('');
  const head = `<div class="ch"><span class="lbl">Compare</span><span class="r in-pills" role="group" aria-label="Compare window">${pills}<button type="button" class="btn" data-cmp-clear="1">Clear</button></span></div>`;
  if (ids.length < 2) return `<section class="card sp-card sp-compare" aria-label="Compare two pairs">${head}<p class="muted sp-none">${esc(by[ids[0]].pair.short)} is picked. Press the &#8644; button on a second row to put the two on one chart.</p></section>`;
  const a = by[ids[0]], b = by[ids[1]], c = compareSeries(a, b, WINDOWS[win] ?? 0);
  if (!c) return `<section class="card sp-card sp-compare" aria-label="Compare two pairs">${head}<p class="muted sp-none">These two have too few common closes in this window to compare.</p></section>`;
  const note = c.mode === 'rebased' ? 'Both ratios start at 100 at the start of the window: the line that ends higher has out-run the other over it.' : 'These are not both ratios, so each line is shown as a standard score of the window (standard deviations from its own average): the shapes can be compared, not the levels.';
  return `<section class="card sp-card sp-compare" aria-label="Compare two pairs">${head}${twoLineSvg({ dates: c.dates, a: c.a, b: c.b, la: a.pair.short, lb: b.pair.short, mode: c.mode, unit: c.unit })}<p class="sp-key muted">${esc(note)} ${c.dates.length.toLocaleString('en-GB')} common closes, ${esc(niceDate(c.dates[0]))} to ${esc(niceDate(c.dates.at(-1)))}.</p></section>`;
}

const HOW = `<div class="sp-how"><p><b>How to read a row.</b> The marker shows where the pair stands inside <i>its own</i> history. Left is the lowest it has been, right is the highest; the shaded ends are the extreme tenths and the tick in the middle is its median. Under each title is one plain sentence of what the number means right now. A labelled tick (0 or 1.0) marks its natural level where it has one.</p>
<ul class="sp-kinds" aria-label="Kinds of pair">${Object.entries(KINDS).map(([k, v]) => `<li><span class="sp-kind sp-kind-${k}">${esc(v.label)}</span> <span class="muted">${esc(v.ref)}</span></li>`).join('')}</ul>
<details class="sp-help"><summary>What do the evidence chips mean?</summary><ul>${GRADE_HELP.map(([k, v]) => `<li><b>${esc(k)}</b>: ${esc(v)}</li>`).join('')}</ul></details></div>`;

/** The ladder view as HTML for a ranking (rankPairs) and view state. Pure. */
export function ladderHtml(rank, st) {
  const rows = rank.rows; if (!rows.length) return '<div class="in-empty">No pair had enough common history to rank.</div>';
  const groups = GROUP_ORDER.filter(g => rows.some(r => r.group === g));
  let list = rows.filter(r => (st.group === 'all' || r.group === st.group) && (!st.story || st.story === 'all' || r.story === st.story));
  if (st.sort === 'mentioned') list.sort((a, b) => b.pair.mentions.n - a.pair.mentions.n || b.score - a.score);
  const pills = [`<button type="button" class="in-pill" data-group="all" aria-pressed="${st.group === 'all'}">All <b>${rows.length}</b></button>`,
    ...groups.map(g => `<button type="button" class="in-pill" data-group="${esc(g)}" aria-pressed="${st.group === g}">${esc(g)} <b>${rows.filter(r => r.group === g).length}</b></button>`)].join('');
  const stories = STORIES.filter(x => rows.some(r => r.story === x.id));
  const storyPills = [`<button type="button" class="in-pill" data-story="all" aria-pressed="${!st.story || st.story === 'all'}">All stories <b>${rows.length}</b></button>`,
    ...stories.map(x => `<button type="button" class="in-pill sp-story sp-story-${esc(x.id)}" data-story="${esc(x.id)}" aria-pressed="${st.story === x.id}" title="${esc(x.blurb)}">${esc(x.label)} <b>${rows.filter(r => r.story === x.id).length}</b></button>`)].join('');
  const sorts = [['stretch', 'Most stretched'], ['mentioned', 'Most mentioned']].map(([k, t]) => `<button type="button" class="in-pill" data-sort="${k}" aria-pressed="${st.sort === k}">${t}</button>`).join('');
  const blurb = STORIES.find(x => x.id === st.story)?.blurb;
  return `<div class="sp-tools"><div class="in-pills" role="group" aria-label="Filter by story">${storyPills}</div>${blurb ? `<p class="sp-storyblurb muted">${esc(blurb)}.</p>` : ''}<div class="in-pills" role="group" aria-label="Filter by group">${pills}</div><div class="in-pills" role="group" aria-label="Order">${sorts}</div></div>
${HOW}${compareHtml(rank, st)}
<div class="sp-scale muted" aria-hidden="true"><span>marker at the left: bottom of its own history</span><span>shaded ends: the extreme tenths</span><span>right: top of its own history</span></div>
<ol class="in-list sp-list">${list.map(r => rowHtml(r, st.open === r.id, st.hw, st)).join('')}</ol>
${rank.missing.length ? `<p class="in-foot muted">Not drawn (a leg is missing or the record is too short): ${esc(rank.missing.map(m => m.pair.short).join(', '))}.</p>` : ''}
${notHeldHtml()}`;
}
function notHeldHtml() {
  return `<details class="sp-nh"><summary>Pairs the educators use that we cannot draw from the daily bundle (${NOT_HELD.length})</summary><ul>${NOT_HELD.map(h => `<li><b>${esc(h.label)}</b> <span class="muted">${esc(h.said)}</span><br><span>${esc(h.why)}</span></li>`).join('')}</ul></details>`;
}

/** The wall: the twelve most-mentioned pairs as small multiples. */
export function wallHtml(rank) {
  const by = Object.fromEntries(rank.rows.map(r => [r.id, r]));
  const cells = WALL_IDS.map(id => by[id]).filter(Boolean);
  if (!cells.length) return '<div class="in-empty">None of the most-mentioned pairs could be drawn.</div>';
  const cap = r => `${nth(r.pct)} percentile of ${winShort(r.n)}${r.c21 ? `, ${periodChange(r.c21)}` : ''}`;
  return `<p class="sp-wallnote muted">The twelve pairs the stored educator notes mention most (a line count, not a vote). Each line is its whole record; the end point is now. Click one for the detail.</p>
<div class="sp-wall">${cells.map(r => `<button type="button" class="sp-cell" data-id="${esc(r.id)}" style="--s:${r.score.toFixed(3)}" aria-label="${esc(`${r.pair.short}, ${cap(r)}`)}"><span class="sp-cn"><b>${esc(r.pair.short)}</b><i>${esc(r.group)}</i></span>${sparkSvg(r.series.vals)}<span class="sp-cv"><b>${esc(r.lastFmt)}</b> ${esc(cap(r))}<em class="sp-mean">${esc(meaningOf(r))}</em>${flags(r) ? `<em>${esc(flags(r).replace(/^ · /, ''))}</em>` : ''}</span><span class="sp-chips">${gradeChipsHtml(r, 1)}</span></button>`).join('')}</div>`;
}

// ── the picker ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const selectHtml = (id, label, val, bundleKeys) => {
  const groups = Object.keys(SERIES_GROUPS);
  const ALL = SERIES.concat(DERIVED);
  const opts = groups.map(g => { const items = ALL.filter(s => s.group === g && bundleKeys.has(s.key)); return items.length ? `<optgroup label="${esc(SERIES_GROUPS[g])}">${items.map(s => `<option value="${esc(s.key)}"${s.key === val ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</optgroup>` : ''; }).join('');
  return `<label class="sp-sel"><span>${esc(label)}</span><select id="${id}" aria-label="${esc(label)}">${opts}</select></label>`;
};
/** The picker view. Returns { html, custom } where custom = the computed pair (or null) so the caller can play its scatter. */
export function pickerHtml(bundle, st) {
  const keys = new Set(Object.keys(bundle.series).filter(k => seriesMeta(k)));
  const ops = OPS.map(o => `<option value="${o.id}"${st.pop === o.id ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
  const wins = Object.keys(WINDOWS).map(k => `<option value="${k}"${st.pw === k ? ' selected' : ''}>${esc(WIN_LABEL[k])}</option>`).join('');
  const controls = `<div class="sp-controls">${selectHtml('sp-x', 'X', st.px, keys)}${selectHtml('sp-y', 'Y', st.py, keys)}<label class="sp-sel"><span>Show</span><select id="sp-op" aria-label="Operation">${ops}</select></label><label class="sp-sel"><span>Window</span><select id="sp-pw" aria-label="Window">${wins}</select></label></div>`;
  const allowed = opAllowed(st.pop, st.px, st.py);
  if (!allowed.ok) return { html: `${controls}<div class="in-empty">${esc(allowed.why)}</div>`, custom: null };
  const c = customSeries(bundle, st.px, st.py, st.pop, WINDOWS[st.pw] ?? 0);
  if (!c.ok) return { html: `${controls}<div class="in-empty">${esc(c.error)}</div>`, custom: null };
  const row = customRow(c); if (!row) return { html: `${controls}<div class="in-empty">Too few common closes to describe.</div>`, custom: null };
  const all = moveCorr(c.xs, c.ys, st.px, st.py), recent = moveCorr(c.xs, c.ys, st.px, st.py, 60);
  const lib = libraryMatch(st.px, st.py, st.pop), ev = lib ? evidenceFor(lib.ev) : [];
  const chips = (ev.length ? ev : generalEvidence()).map(e => chipHtml(e)).join('');
  const xl = seriesMeta(st.px)?.label ?? st.px, yl = seriesMeta(st.py)?.label ?? st.py;
  const trail = c.xs.slice(-40).map((x, i) => [x, c.ys.slice(-40)[i]]), sample = c.xs.map((x, i) => [x, c.ys[i]]).filter((_, i) => i % 3 === 0);
  const b = fullBounds(c.xs, c.ys), s = slice(c.series, 0);
  const stat = (k, v, t = '') => `<div class="sp-stat" title="${esc(t)}"><span>${k}</span><b>${v}</b></div>`;
  return { custom: c, html: `${controls}<p class="sp-cap">${esc(customCaption({ row, pair: c.pair }, st.px, st.py, all, recent, ev))}</p>
<div class="sp-stats">${stat('Percentile', nth(row.pct), 'where the line sits in its own window')}${stat('z-score', `${row.z >= 0 ? '+' : '−'}${Math.abs(row.z).toFixed(1)}`, 'standard deviations from the window mean')}${stat('Daily moves, all', all ? all.r.toFixed(2) : '–', 'correlation of the daily moves over the whole window')}${stat('Daily moves, last 60', recent ? recent.r.toFixed(2) : '–', 'the same over the last 60 sessions')}${stat('Closes', row.n.toLocaleString('en-GB'), `since ${niceDate(row.from)}`)}</div>
<div class="sp-hero-grid"><div class="card sp-card"><div class="ch"><span class="lbl">${esc(c.pair.short)}</span></div>${heroSvg(row, s)}</div>
<div class="card sp-card"><div class="ch"><span class="lbl">${esc(yl)} against ${esc(xl)}</span><span class="r"><button type="button" class="btn" data-play="1">&#9654; Play the trail</button></span></div>${scatterSvg({ pts: trail, all: sample, bounds: b, xl, yl, nowLabel: niceDate(c.dates.at(-1)) })}
<p class="sp-key muted">Faint dots: every third close in the window. The glowing trail is the last 40 sessions. Play it to watch the pair move through time (a frame only uses closes up to its own date).</p></div></div>
<div class="sp-found-row"><span class="muted">What we found:</span> ${chips}</div>` };
}

/** The replay-player definition for a custom pair's scatter (frames hold only points up to their own date). */
export function scatterDef(c, st) {
  const xl = seriesMeta(st.px)?.label ?? st.px, yl = seriesMeta(st.py)?.label ?? st.py;
  return { id: 'spreads-scatter', title: `${yl} against ${xl}`, note: 'The trail is the last 40 closes up to each date. The axes only widen as the replay goes on, so no frame is drawn with knowledge of the later ones. A description of how the pair has moved, not a forecast.',
    load: async () => { const frames = scatterFrames(c.xs, c.ys, c.dates, { span: 504, trail: 40, step: 3 }); return { frames, extra: { frames } }; },
    draw: (frames, i) => scatterSvg({ pts: frames[i].pts, all: frames.slice(0, i + 1).map(f => f.pts.at(-1)), bounds: scatterBounds(frames, i), xl, yl, nowLabel: niceDate(frames[i].t) }),
    caption: (frames, i) => { const p = frames[i].pts, a = p[0], z = p.at(-1); return `${niceDate(frames[i].t)}: over the last ${p.length} closes ${xl} went from ${sig(a[0])} to ${sig(z[0])} and ${yl} from ${sig(a[1])} to ${sig(z[1])}.`; },
    label: f => niceDate(f.t),
    coverage: frames => `${frames.length} frames, ${niceDate(frames[0].t)} to ${niceDate(frames.at(-1).t)}, every third close of the last two years held.` };
}

// ── mount ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// literal hrefs (js/terminal/links.test.mjs allows a stylesheet under js/ and rejects a link built from a variable)
const ensureSpCss = doc => { if (doc.getElementById('spCss')) return; const l = doc.createElement('link'); l.id = 'spCss'; l.rel = 'stylesheet'; l.href = 'js/terminal/spreads.css'; doc.head.appendChild(l); };
const ensureRpvCss = doc => { if (doc.getElementById('rpvCss')) return; const l = doc.createElement('link'); l.id = 'rpvCss'; l.rel = 'stylesheet'; l.href = 'js/terminal/replay-viz.css'; doc.head.appendChild(l); };

const ONBOARD = '<div class="sp-onboard" role="note"><span>Ratios show where one thing stands against another, in its own history. They describe state, not direction: a stretched ratio says it is stretched, not that it turns.</span><button type="button" class="btn" data-dismiss="onboard">Got it</button></div>';

/** Mount the board into host. ctx: { getBundle(), go(target), win, doc }. Returns { destroy }. */
export function mountSpreads(host, ctx) {
  const win = ctx.win ?? window, doc = ctx.doc ?? document;
  ensureSpCss(doc);
  const store = () => { try { return win.localStorage ?? null; } catch { return null; } };
  const st = { view: 'ladder', group: 'all', story: 'all', sort: 'stretch', open: null, hw: '3y', px: 'rsp', py: 'spy', pop: 'ratio', pw: '3y', cmp: [], cw: '3y', seen: false };
  try { Object.assign(st, JSON.parse(store()?.getItem(LS) ?? '{}')); } catch { /* private window */ }
  st.cmp = [];
  if (!['ladder', 'wall', 'pick'].includes(st.view)) st.view = 'ladder';
  if (!WINDOWS[st.hw] && st.hw !== '6y') st.hw = '3y';
  const save = () => { try { store()?.setItem(LS, JSON.stringify({ view: st.view, group: st.group, story: st.story, sort: st.sort, hw: st.hw, px: st.px, py: st.py, pop: st.pop, pw: st.pw, cw: st.cw, seen: st.seen })); } catch { /* private window */ } };
  let bundle = null, rank = null, custom = null, alive = true;
  const gen = generalEvidence(DESK_EVIDENCE).map(e => chipHtml(e)).join('');
  const frame = body => `${st.seen ? '' : ONBOARD}<div class="sp-head"><p class="in-asof">${rank ? `Where each educator pair sits against its own history, as at the close of <b>${esc(niceDate(rank.refDate))}</b>. ${rank.rows.length} pairs from the daily market bundle (about six years; shorter for credit and single names). ` : ''}Each shows what the educators said and what our own tests found. <b>These describe state, not direction.</b></p>
<div class="sp-gen"><span class="muted">In general:</span> ${gen}</div></div>${rank && st.view === 'ladder' ? storiesStripHtml(rank) : ''}
<div class="in-pills sp-views" role="tablist" aria-label="Spreads and ratios views">${[['ladder', 'Ladder'], ['wall', 'The wall'], ['pick', 'Pick your own']].map(([k, t]) => `<button type="button" role="tab" class="in-tab" data-view="${k}" aria-selected="${st.view === k}">${t}</button>`).join('')}</div>${body}`;
  const draw = () => {
    if (!bundle) return;
    let body;
    if (st.view === 'wall') body = wallHtml(rank);
    else if (st.view === 'pick') { const p = pickerHtml(bundle, st); custom = p.custom; body = p.html; }
    else body = ladderHtml(rank, st);
    host.innerHTML = frame(body);
  };
  const play = async () => {
    if (!custom) return;
    ensureRpvCss(doc);
    try { const m = await import('./replayPlayer.js'); m.openPlayer(scatterDef(custom, st), { doc, win, opener: host.querySelector('[data-play]') }); } catch (e) { host.querySelector('.sp-found-row')?.insertAdjacentHTML('beforebegin', `<p class="in-empty">The replay window could not open (${esc(e?.message ?? e)}).</p>`); }
  };
  const onClick = e => {
    const t = e.target.closest?.('button'); if (!t || !host.contains(t)) return;
    const d = t.dataset;
    if (d.dismiss) { st.seen = true; save(); draw(); return; }
    if (d.view) { st.view = d.view; save(); draw(); return; }
    if (d.cmp) { const id = d.cmp, i = st.cmp.indexOf(id); if (i >= 0) st.cmp.splice(i, 1); else st.cmp = [...st.cmp, id].slice(-2); draw(); return; }
    if (d.cmpClear) { st.cmp = []; draw(); return; }
    if (d.cwin) { st.cw = d.cwin; save(); draw(); return; }
    if (d.story) { st.story = d.story; st.open = null; save(); draw(); return; }
    if (d.open) { st.view = 'ladder'; st.group = 'all'; st.story = 'all'; st.open = d.open; save(); draw(); host.querySelector(`.sp-row[data-id="${d.open}"]`)?.scrollIntoView?.({ block: 'nearest' }); return; }
    if (d.group) { st.group = d.group; st.open = null; save(); draw(); return; }
    if (d.sort) { st.sort = d.sort; save(); draw(); return; }
    if (d.win) { st.hw = d.win; save(); draw(); return; }
    if (d.play) { play(); return; }
    if (d.pickPair) { const p = BY_ID[d.pickPair]; if (p) { st.view = 'pick'; st.px = p.x; st.py = p.y ?? st.py; st.pop = p.op === 'diff' ? 'minus' : 'ratio'; save(); draw(); } return; }
    if (d.id) {
      if (st.view === 'wall') { st.view = 'ladder'; st.group = 'all'; st.open = d.id; } else st.open = st.open === d.id ? null : d.id;
      save(); draw(); host.querySelector(`.sp-row[data-id="${d.id}"]`)?.scrollIntoView?.({ block: 'nearest' });
    }
  };
  const onChange = e => {
    const t = e.target; if (!t?.id) return;
    const map = { 'sp-x': 'px', 'sp-y': 'py', 'sp-op': 'pop', 'sp-pw': 'pw' }; if (!map[t.id]) return;
    st[map[t.id]] = t.value; if (t.id === 'sp-op' && !opAllowed(t.value, st.px, st.py).ok && t.value === 'minus') { /* the view explains why */ }
    save(); draw(); host.querySelector(`#${t.id}`)?.focus?.();
  };
  host.addEventListener('click', onClick); host.addEventListener('change', onChange);
  host.innerHTML = '<div class="in-empty">Reading the daily market bundle…</div>';
  Promise.all([ctx.getBundle(), ctx.getExtras ? ctx.getExtras().catch(() => ({ ok: false })) : Promise.resolve(null)]).then(([b, x]) => {
    if (!alive) return;
    if (!b?.ok) { host.innerHTML = `<div class="in-empty">${esc(b?.error || 'The daily market bundle is not available.')}</div>`; return; }
    bundle = augmentBundle(b, x); rank = rankPairs(bundle, PAIRS, DESK_EVIDENCE); draw(); wantOpen();
  });
  const wantOpen = () => { const id = win.deskSpreadsWant; if (id && BY_ID[id]) { delete win.deskSpreadsWant; st.view = 'ladder'; st.group = 'all'; st.open = id; save(); draw(); host.querySelector(`.sp-row[data-id="${id}"]`)?.scrollIntoView?.({ block: 'nearest' }); } };
  win.deskSpreads = { open(id) { if (!BY_ID[id]) return false; st.view = 'ladder'; st.group = 'all'; st.open = id; save(); draw(); host.querySelector(`.sp-row[data-id="${id}"]`)?.scrollIntoView?.({ block: 'nearest' }); return true; }, ids: () => PAIRS.map(p => p.id) };
  return { destroy() { alive = false; host.removeEventListener('click', onClick); host.removeEventListener('change', onChange); delete win.deskSpreads; } };
}
export { EDUCATORS };
