// js/terminal/spreadsView.js: the "Spreads & ratios" board (Insight tab, PREVIEW surface panel.insight.spreads). Draws js/terminal/spreadsCore.js over the
// educators' pairs in js/terminal/spreadsLibrary.js: a heat ladder (every pair ranked by how stretched it is against its own history), a hero view per
// pair (the line with its percentile bands, ghosts of the last months, what the educators said next to what our tests found), a wall of the twelve most
// mentioned pairs, and an X-versus-Y picker with a scatter whose glowing trail plays through time on the shared replay player.
//
// Presentation only. A spread or ratio describes state; every tile carries its Evidence Book verdict (read live from the book), and nothing is worded as a
// view on direction. Theme tokens only (spreads.css); SVG uses CSS variables, so a theme change repaints it without a redraw. Motion is the shared
// .bv-sweep / glow CSS and is off under prefers-reduced-motion.
import { PAIRS, BY_ID, WALL_IDS, NOT_HELD, GENERAL_EV, EDUCATORS } from './spreadsLibrary.js';
import { rankPairs, caption, trustNote, ghosts, slice, nth, niceDate, fmtValue, customSeries, customRow, customCaption, moveCorr, opAllowed, OPS, libraryMatch, evidenceFor, generalEvidence, scatterFrames, scatterBounds } from './spreadsCore.js';
import { SERIES, GROUPS as SERIES_GROUPS, BY_KEY } from './insightSeries.js';
import { esc } from './boardViz.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';

export const WINDOWS = { '1y': 252, '3y': 756, '6y': 0 };
const WIN_LABEL = { '1y': 'Last year', '3y': 'Last 3 years', '6y': 'All we hold' };
const LS = 'deskSpreads:v1';
const W = 720, H = 270, M = { l: 56, r: 18, t: 16, b: 26 };
const f1 = n => (Number.isFinite(n) ? n.toFixed(1) : '0');
const sig = (v, n = 3) => { const s = Number(v).toPrecision(n); return s.includes('e') ? String(Number(s)) : s; };

// ── small pieces ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** An Evidence Book chip. compact = the verdict word only (the full sentence is in the title). */
export const chipHtml = (e, compact = false) => `<span class="chip sp-v sp-v-${esc(e.verdict)}" title="${esc(`Evidence Book: ${e.id} (${e.verdict}, ${e.date}). Examined: ${e.about}. ${e.say}.`)}">${compact ? `tested · ${esc(e.word)}` : `${esc(e.about)}: ${esc(e.word)}`}</span>`;
const noTestChip = '<span class="chip sp-v sp-v-none" title="No test of this relationship is on file in the Evidence Book yet.">not tested here</span>';

/** The percentile track: a glowing marker for now, fainter ticks for a week and a month ago, the 10th to 90th band shaded. */
export function trackHtml(row) {
  const p = x => Math.min(1, Math.max(0, x ?? 0)).toFixed(3);
  return `<span class="sp-track" role="img" aria-label="${esc(`${nth(row.pct)} percentile now; ${row.pct1w != null ? `${nth(row.pct1w)} a week ago; ` : ''}${row.pct1m != null ? `${nth(row.pct1m)} a month ago` : ''}`)}"><i class="sp-band"></i>${row.pct1m != null ? `<u class="sp-t m" style="--p:${p(row.pct1m)}" title="a month ago"></u>` : ''}${row.pct1w != null ? `<u class="sp-t w" style="--p:${p(row.pct1w)}" title="a week ago"></u>` : ''}<b class="sp-now" style="--p:${p(row.pct)}"></b></span>`;
}

// ── charts ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The hero line: the series over a window, the history's 10-90 and 25-75 bands, the median, a glowing end point. `s` is a {dates, vals} slice. */
export function heroSvg(row, s) {
  const v = s.vals, n = v.length; if (n < 2) return '<div class="in-empty">Too few closes to draw.</div>';
  const pair = row.pair, p = row.p;
  let lo = Math.min(...v), hi = Math.max(...v); const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
  const X = i => M.l + (i / (n - 1)) * (W - M.l - M.r), Y = a => M.t + (1 - (a - lo) / (hi - lo)) * (H - M.t - M.b);
  const band = (a, b, cls) => { const a1 = Math.max(lo, Math.min(a, b)), b1 = Math.min(hi, Math.max(a, b)); return a1 < b1 ? `<rect class="${cls}" x="${M.l}" y="${f1(Y(b1))}" width="${W - M.l - M.r}" height="${f1(Y(a1) - Y(b1))}"/>` : ''; };
  const stride = Math.max(1, Math.floor(n / 420)), pts = []; for (let i = 0; i < n; i += stride) pts.push(i); if (pts.at(-1) !== n - 1) pts.push(n - 1);
  const d = pts.map((i, k) => `${k ? 'L' : 'M'}${f1(X(i))},${f1(Y(v[i]))}`).join('');
  const yt = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * k) / 4);
  const xt = []; let yr = ''; s.dates.forEach((dt, i) => { const y = dt.slice(0, 4); if (y !== yr) { yr = y; if (i > 0 && i < n - 8) xt.push([i, y]); } });
  const last = v[n - 1], ex = X(n - 1), ey = Y(last), anchor = ex > W - 96 ? 'end' : 'start';
  return `<svg class="sp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${pair.short} over ${n} sessions, now ${fmtValue(pair, last)}, ${nth(row.pct)} percentile of its history`)}">
${band(p.p10, p.p90, 'sp-b1')}${band(p.p25, p.p75, 'sp-b2')}
${yt.map(a => `<line class="sp-grid" x1="${M.l}" x2="${W - M.r}" y1="${f1(Y(a))}" y2="${f1(Y(a))}"/><text class="sp-ax" x="${M.l - 8}" y="${f1(Y(a) + 3)}" text-anchor="end">${esc(fmtValue(pair, a))}</text>`).join('')}
${p.p50 >= lo && p.p50 <= hi ? `<line class="sp-med" x1="${M.l}" x2="${W - M.r}" y1="${f1(Y(p.p50))}" y2="${f1(Y(p.p50))}"/><text class="sp-ax" x="${W - M.r}" y="${f1(Y(p.p50) - 4)}" text-anchor="end">median of the whole record</text>` : ''}
${xt.map(([i, y]) => `<text class="sp-ax" x="${f1(X(i))}" y="${H - 8}" text-anchor="middle">${y}</text>`).join('')}
<path class="sp-line sp-glow bv-sweep" pathLength="1" d="${d}"/>
<circle class="sp-end sp-glow" cx="${f1(ex)}" cy="${f1(ey)}" r="4.5"/><text class="sp-endv" x="${f1(ex + (anchor === 'end' ? -9 : 9))}" y="${f1(ey - 9)}" text-anchor="${anchor}">${esc(fmtValue(pair, last))}</text>
</svg>`;
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
const evChips = (row, max = 2) => {
  if (!row.ev.length) return noTestChip;
  const shown = row.ev.slice(0, max).map(e => chipHtml(e, true)).join('');
  return `${shown}${row.ev.length > max ? `<span class="chip sp-v sp-v-more" title="${esc(row.ev.slice(max).map(e => `${e.id}: ${e.word}`).join('; '))}">+${row.ev.length - max}</span>` : ''}`;
};
const mentionsText = p => `${p.mentions.n} line${p.mentions.n === 1 ? '' : 's'} in the stored notes${p.mentions.shared ? ` (shared with the ${p.mentions.shared} pairs)` : ''}`;

function quotesHtml(p) {
  if (!p.say.length) return `<p class="muted sp-none">No quote from the stored notes for this one. ${esc(mentionsText(p))}; the raw transcripts were not mined.</p>`;
  return p.say.map(s => `<blockquote class="sp-q"><p>${esc(s.text)}</p><footer><b>${esc(s.who)}</b> &middot; ${esc(s.src)}${s.verbatim ? '' : ' <i>(the desk\'s note on the clip, not his exact words)</i>'}</footer></blockquote>`).join('');
}
function foundHtml(row) {
  if (!row.ev.length) return '<p class="muted sp-none">Not tested here yet. The general tests of a rare move or two markets coming apart found nothing that follows (above). A preregistration stub is proposed in plans/SPREADS_AND_RATIOS.md.</p>';
  return `<ul class="sp-found">${row.ev.map(e => `<li>${chipHtml(e)}<p class="muted">${esc(e.say)}. <span>${esc(e.doc ?? '')}</span></p></li>`).join('')}</ul>`;
}

/** The hero view for one ranked row, as HTML. `win` is a key of WINDOWS. */
export function heroHtml(row, win = '3y') {
  const s = slice(row.series, WINDOWS[win] ?? 0), g = ghosts(row.series, row.pair);
  const pills = Object.keys(WINDOWS).map(k => `<button type="button" class="in-pill" data-win="${k}" aria-pressed="${win === k}">${esc(WIN_LABEL[k])}</button>`).join('');
  const canPick = row.pair.op !== 'level';
  return `<div class="sp-hero" role="region" aria-label="${esc(row.pair.short)} in detail">
<p class="sp-cap">${esc(caption(row))}</p>
<div class="sp-hero-grid"><div class="card sp-card"><div class="ch"><span class="lbl">${esc(row.pair.short)} over time</span><span class="r in-pills" role="group" aria-label="Window">${pills}</span></div>${heroSvg(row, s)}
<p class="sp-key muted">Shaded: the middle 80% and middle 50% of the whole record. A line at the edge says it is stretched, not that it turns.</p></div>
<div class="card sp-card"><div class="ch"><span class="lbl">The last month against the months before</span></div>${ghostSvg(g)}</div></div>
<div class="sp-two"><div class="sp-said"><h4>What they said</h4>${quotesHtml(row.pair)}</div><div class="sp-foundbox"><h4>What we found</h4>${foundHtml(row)}</div></div>
<p class="sp-trust muted">${esc(trustNote(row))} ${esc(mentionsText(row.pair))}.${canPick ? ` <button type="button" class="btn in-go" data-pick-pair="${esc(row.id)}">Open in the picker</button>` : ''}</p></div>`;
}

function rowHtml(r, open, win) {
  return `<li class="in-li sp-li"><button type="button" class="in-row sp-row" data-id="${esc(r.id)}" aria-expanded="${open ? 'true' : 'false'}">
<span class="in-rk">${r.rank}</span>
<span class="in-nm"><b>${esc(r.pair.label)}</b><i class="in-gr">${esc(r.group)}${esc(flags(r))}</i></span>
${trackHtml(r)}<span class="sp-pc">${nth(r.pct)}</span>
<span class="in-val">${esc(r.lastFmt)}</span><span class="sp-ch muted" title="change over the last 21 sessions">${r.c21 ? esc(r.c21.text) : ''}</span>
<span class="sp-chips">${evChips(r)}</span></button>${open ? heroHtml(r, win) : ''}</li>`;
}

const GROUP_ORDER = ['Breadth and style', 'Rates', 'Credit', 'Volatility', 'Commodities', 'Currencies'];
/** The ladder view as HTML for a ranking (rankPairs) and view state. Pure. */
export function ladderHtml(rank, st) {
  const rows = rank.rows; if (!rows.length) return '<div class="in-empty">No pair had enough common history to rank.</div>';
  const groups = GROUP_ORDER.filter(g => rows.some(r => r.group === g));
  let list = st.group === 'all' ? [...rows] : rows.filter(r => r.group === st.group);
  if (st.sort === 'mentioned') list.sort((a, b) => b.pair.mentions.n - a.pair.mentions.n || b.score - a.score);
  const pills = [`<button type="button" class="in-pill" data-group="all" aria-pressed="${st.group === 'all'}">All <b>${rows.length}</b></button>`,
    ...groups.map(g => `<button type="button" class="in-pill" data-group="${esc(g)}" aria-pressed="${st.group === g}">${esc(g)} <b>${rows.filter(r => r.group === g).length}</b></button>`)].join('');
  const sorts = [['stretch', 'Most stretched'], ['mentioned', 'Most mentioned']].map(([k, t]) => `<button type="button" class="in-pill" data-sort="${k}" aria-pressed="${st.sort === k}">${t}</button>`).join('');
  return `<div class="sp-tools"><div class="in-pills" role="group" aria-label="Filter by group">${pills}</div><div class="in-pills" role="group" aria-label="Order">${sorts}</div></div>
<div class="sp-scale muted" aria-hidden="true"><span>marker at the left: bottom of its own history</span><span>right: top of its own history</span></div>
<ol class="in-list sp-list">${list.map(r => rowHtml(r, st.open === r.id, st.hw)).join('')}</ol>
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
  const cap = r => `${nth(r.pct)} percentile${r.c21 ? `, ${r.c21.text} in a month` : ''}`;
  return `<p class="sp-wallnote muted">The twelve pairs the stored educator notes mention most (a line count, not a vote). Each line is its whole record; the end point is now. Click one for the detail.</p>
<div class="sp-wall">${cells.map(r => `<button type="button" class="sp-cell" data-id="${esc(r.id)}" style="--s:${r.score.toFixed(3)}" aria-label="${esc(`${r.pair.short}, ${cap(r)}`)}"><span class="sp-cn"><b>${esc(r.pair.short)}</b><i>${esc(r.group)}</i></span>${sparkSvg(r.series.vals)}<span class="sp-cv"><b>${esc(r.lastFmt)}</b> ${esc(cap(r))}${flags(r) ? `<em>${esc(flags(r).replace(/^ · /, ''))}</em>` : ''}</span><span class="sp-chips">${evChips(r, 1)}</span></button>`).join('')}</div>`;
}

// ── the picker ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const selectHtml = (id, label, val, bundleKeys) => {
  const groups = Object.keys(SERIES_GROUPS);
  const opts = groups.map(g => { const items = SERIES.filter(s => s.group === g && bundleKeys.has(s.key)); return items.length ? `<optgroup label="${esc(SERIES_GROUPS[g])}">${items.map(s => `<option value="${esc(s.key)}"${s.key === val ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</optgroup>` : ''; }).join('');
  return `<label class="sp-sel"><span>${esc(label)}</span><select id="${id}" aria-label="${esc(label)}">${opts}</select></label>`;
};
/** The picker view. Returns { html, custom } where custom = the computed pair (or null) so the caller can play its scatter. */
export function pickerHtml(bundle, st) {
  const keys = new Set(Object.keys(bundle.series).filter(k => BY_KEY[k]));
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
  const xl = BY_KEY[st.px]?.label ?? st.px, yl = BY_KEY[st.py]?.label ?? st.py;
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
  const xl = BY_KEY[st.px]?.label ?? st.px, yl = BY_KEY[st.py]?.label ?? st.py;
  return { id: 'spreads-scatter', title: `${yl} against ${xl}`, note: 'The trail is the last 40 closes up to each date. The axes only widen as the replay goes on, so no frame is drawn with knowledge of the later ones. A description of how the pair has moved, not a forecast.',
    load: async () => { const frames = scatterFrames(c.xs, c.ys, c.dates, { span: 504, trail: 40, step: 3 }); return { frames, extra: { frames } }; },
    draw: (frames, i) => scatterSvg({ pts: frames[i].pts, all: frames.slice(0, i + 1).map(f => f.pts.at(-1)), bounds: scatterBounds(frames, i), xl, yl, nowLabel: niceDate(frames[i].t) }),
    caption: (frames, i) => { const p = frames[i].pts, a = p[0], z = p.at(-1); return `${niceDate(frames[i].t)}: over the last ${p.length} closes ${xl} went from ${sig(a[0])} to ${sig(z[0])} and ${yl} from ${sig(a[1])} to ${sig(z[1])}.`; },
    label: f => niceDate(f.t),
    coverage: frames => `${frames.length} frames, ${niceDate(frames[0].t)} to ${niceDate(frames.at(-1).t)}, every third close of the last two years held.` };
}

// ── mount ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ensureCss = (doc, id, href) => { if (doc.getElementById(id)) return; const l = doc.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = href; doc.head.appendChild(l); };

/** Mount the board into host. ctx: { getBundle(), go(target), win, doc }. Returns { destroy }. */
export function mountSpreads(host, ctx) {
  const win = ctx.win ?? window, doc = ctx.doc ?? document;
  ensureCss(doc, 'spCss', 'js/terminal/spreads.css');
  const store = () => { try { return win.localStorage ?? null; } catch { return null; } };
  const st = { view: 'ladder', group: 'all', sort: 'stretch', open: null, hw: '3y', px: 'rsp', py: 'spy', pop: 'ratio', pw: '3y' };
  try { Object.assign(st, JSON.parse(store()?.getItem(LS) ?? '{}')); } catch { /* private window */ }
  if (!['ladder', 'wall', 'pick'].includes(st.view)) st.view = 'ladder';
  if (!WINDOWS[st.hw] && st.hw !== '6y') st.hw = '3y';
  const save = () => { try { store()?.setItem(LS, JSON.stringify({ view: st.view, group: st.group, sort: st.sort, hw: st.hw, px: st.px, py: st.py, pop: st.pop, pw: st.pw })); } catch { /* private window */ } };
  let bundle = null, rank = null, custom = null, alive = true;
  const gen = generalEvidence(DESK_EVIDENCE).map(e => chipHtml(e)).join('');
  const frame = body => `<div class="sp-head"><p class="in-asof">${rank ? `Where each educator pair sits against its own history, as at the close of <b>${esc(niceDate(rank.refDate))}</b>. ${rank.rows.length} pairs from the daily market bundle (about six years; shorter for credit and single names). ` : ''}Each shows what the educators said and what our own tests found. <b>These describe state, not direction.</b></p>
<div class="sp-gen"><span class="muted">In general:</span> ${gen}</div></div>
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
    ensureCss(doc, 'rpvCss', 'js/terminal/replay-viz.css');
    try { const m = await import('./replayPlayer.js'); m.openPlayer(scatterDef(custom, st), { doc, win, opener: host.querySelector('[data-play]') }); } catch (e) { host.querySelector('.sp-found-row')?.insertAdjacentHTML('beforebegin', `<p class="in-empty">The replay window could not open (${esc(e?.message ?? e)}).</p>`); }
  };
  const onClick = e => {
    const t = e.target.closest?.('button'); if (!t || !host.contains(t)) return;
    const d = t.dataset;
    if (d.view) { st.view = d.view; save(); draw(); return; }
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
  ctx.getBundle().then(b => {
    if (!alive) return;
    if (!b?.ok) { host.innerHTML = `<div class="in-empty">${esc(b?.error || 'The daily market bundle is not available.')}</div>`; return; }
    bundle = b; rank = rankPairs(b, PAIRS, DESK_EVIDENCE); draw(); wantOpen();
  });
  const wantOpen = () => { const id = win.deskSpreadsWant; if (id && BY_ID[id]) { delete win.deskSpreadsWant; st.view = 'ladder'; st.group = 'all'; st.open = id; save(); draw(); host.querySelector(`.sp-row[data-id="${id}"]`)?.scrollIntoView?.({ block: 'nearest' }); } };
  win.deskSpreads = { open(id) { if (!BY_ID[id]) return false; st.view = 'ladder'; st.group = 'all'; st.open = id; save(); draw(); host.querySelector(`.sp-row[data-id="${id}"]`)?.scrollIntoView?.({ block: 'nearest' }); return true; }, ids: () => PAIRS.map(p => p.id) };
  return { destroy() { alive = false; host.removeEventListener('click', onClick); host.removeEventListener('change', onChange); delete win.deskSpreads; } };
}
export { EDUCATORS };
