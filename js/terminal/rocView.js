// js/terminal/rocView.js: the "Momentum & rate of change" board (Insight tab, PREVIEW surface panel.insight.roc). Draws js/terminal/rocCore.js over the price series of the
// daily market bundle: a heat ladder (where each series' 50-session rate of change sits in its own history, where it stood 50 sessions ago, whether its rate of change is
// falling or rising hard), the lists the educators talk about (stalled leaders, stalled laggards, decelerating hardest, accelerating hardest), and a hero view per series.
//
// Presentation only. It describes state. The educator's claim (a strong run that stalls = holders frustrated = weakness ahead) was tested on 30 markets over 13 years:
// the verdicts are read live from the Evidence Book (roc-stall-50d-*) and shown next to what was said. Nothing is worded as a view on direction.
// Theme tokens only (roc.css); the SVG uses CSS variables, so a theme change repaints it without a redraw. Motion is off under prefers-reduced-motion.
import { SERIES, GROUPS as SERIES_GROUPS } from './insightSeries.js';
import { rankAll, walk, runs, caption, nth, fmtChange, evidenceFor, EVIDENCE_IDS, RELATED_IDS, MIN_HIST, N_LOOK } from './rocCore.js';
import { esc } from './boardViz.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';

const LS = 'deskRoc:v1';
const W = 720, H1 = 150, H2 = 130, M = { l: 52, r: 16, t: 12, b: 22 };
const f1 = n => (Number.isFinite(n) ? n.toFixed(1) : '0');
export const WINDOWS = { '1y': 252, '3y': 756, '6y': 0 };
const WIN_LABEL = { '1y': 'Last year', '3y': 'Last 3 years', '6y': 'All we hold' };
/** the price series: a rate of change of a price is a percentage move; yields, spreads and volatility indices are read by level elsewhere */
export const DEFS = SERIES.filter(s => s.level === false);
const GROUP_ORDER = ['index', 'sector', 'stock', 'commodity', 'fx', 'crypto'];

// ── small pieces ─────────────────────────────────────────────────────────────────────
export const chipHtml = e => `<span class="chip rc-v rc-v-${esc(e.verdict)}" title="${esc(`Evidence Book: ${e.id} (${e.verdict}, ${e.date}). ${e.claim}`)}">${esc(e.verdict)}</span>`;
const EV_LABEL = { 'roc-stall-50d-top20': 'Stall after a run: next 20 sessions', 'roc-stall-50d-top60': 'Stall after a run: next 60 sessions', 'roc-stall-50d-topvol': 'Stall after a run: riskier month',
  'roc-stall-50d-bottom20': 'Stall after a fall (the mirror)', 'roc-accel-down-20': 'Rate of change falling hard: next 20 sessions', 'roc-accel-down-vol': 'Rate of change falling hard: riskier month' };

/** The "what they say against what we found" card, all from the Evidence Book. */
export function foundHtml(book = DESK_EVIDENCE) {
  const mine = evidenceFor(book, EVIDENCE_IDS), rel = evidenceFor(book, RELATED_IDS);
  if (!mine.length) return `<p class="rc-none">The test of this idea is running and is not in the Evidence Book yet. Until it is, the board only describes where each series stands.</p>`;
  return `<ul class="rc-found">${mine.map(e => `<li><div class="rc-found-row">${chipHtml(e)}<b>${esc(EV_LABEL[e.id] ?? e.id)}</b></div><p>${esc(e.result.split('. ').slice(0, 2).join('. '))}.</p></li>`).join('')}</ul>
${rel.length ? `<p class="rc-rel muted">Nearby tests: ${rel.map(e => `${chipHtml(e)} ${esc(e.claim.split(':')[0].slice(0, 90))}`).join(' · ')}</p>` : ''}`;
}

/** The percentile track: where the 50-session move stands in its own history now (glowing marker) and where it stood 50 sessions ago (ghost tick). */
export function trackHtml(r) {
  const p = x => Math.min(1, Math.max(0, x ?? 0)).toFixed(3);
  if (r.pct50 == null) return '<span class="rc-track rc-short" role="img" aria-label="record too short to rank"></span>';
  return `<span class="rc-track" role="img" aria-label="${esc(`${nth(r.pct50)} percentile now${r.priorPct != null ? `; ${nth(r.priorPct)} fifty sessions ago` : ''}`)}"><i class="rc-band"></i>${r.priorPct != null ? `<i class="rc-prior" style="--p:${p(r.priorPct)}"></i>` : ''}<i class="rc-now" style="--p:${p(r.pct50)}"></i></span>`;
}
const arrow = r => (r.pacc == null ? '' : r.accDown ? '↘' : r.accUp ? '↗' : r.pacc < 0.35 ? '↘' : r.pacc > 0.65 ? '↗' : '→');
export const stateChip = r => r.stall === 'top' ? '<span class="chip rc-st rc-st-top" title="Its 50-session move was in its top fifth 50 sessions ago and is now about zero: a strong run that has stalled.">stalled run</span>'
  : r.stall === 'bottom' ? '<span class="chip rc-st rc-st-bot" title="Its 50-session move was in its bottom fifth 50 sessions ago and is now about zero: a fall that has stopped.">stalled fall</span>'
  : r.accDown ? '<span class="chip rc-st rc-st-dn" title="Its 50-session move has fallen hard over the last 20 sessions (bottom tenth of its own history).">decelerating</span>'
  : r.accUp ? '<span class="chip rc-st rc-st-up" title="Its 50-session move has risen hard over the last 20 sessions (top tenth of its own history).">accelerating</span>' : '';

// ── the hero chart: price on top, the 50-session rate of change below with its history band and the stall episodes shaded ──
export function heroSvg(def, dates, vals, kind, win) {
  const all = vals.length, keep = WINDOWS[win] && WINDOWS[win] < all ? WINDOWS[win] : all, from = all - keep;
  const w = walk(vals, kind), roc = w.roc50, n = keep; if (n < 3) return '<div class="in-empty">Too few closes to draw.</div>';
  const X = i => M.l + ((i - from) / (all - 1 - from)) * (W - M.l - M.r);
  const stride = Math.max(1, Math.floor(n / 420)), idx = []; for (let i = from; i < all; i += stride) idx.push(i); if (idx.at(-1) !== all - 1) idx.push(all - 1);
  // price panel
  const pv = idx.map(i => vals[i]); let plo = Math.min(...pv), phi = Math.max(...pv); const ppad = (phi - plo) * 0.06 || 1; plo -= ppad; phi += ppad;
  const PY = a => M.t + (1 - (a - plo) / (phi - plo)) * (H1 - M.t - M.b);
  const pd = idx.map((i, k) => `${k ? 'L' : 'M'}${f1(X(i))},${f1(PY(vals[i]))}`).join('');
  // rate-of-change panel
  const rv = idx.map(i => roc[i]).filter(Number.isFinite); let rlo = Math.min(0, ...rv), rhi = Math.max(0, ...rv); const rpad = (rhi - rlo) * 0.08 || 1; rlo -= rpad; rhi += rpad;
  const RY = a => M.t + (1 - (a - rlo) / (rhi - rlo)) * (H2 - M.t - M.b);
  const rd = idx.filter(i => Number.isFinite(roc[i])).map((i, k) => `${k ? 'L' : 'M'}${f1(X(i))},${f1(RY(roc[i]))}`).join('');
  const hist = w.hist, p10 = hist.a.length >= MIN_HIST ? hist.quantile(0.10) : null, p90 = hist.a.length >= MIN_HIST ? hist.quantile(0.90) : null;
  const band = p10 != null && p90 != null ? `<rect class="rc-b" x="${M.l}" y="${f1(RY(Math.min(rhi, p90)))}" width="${W - M.l - M.r}" height="${f1(Math.max(0, RY(Math.max(rlo, p10)) - RY(Math.min(rhi, p90))))}"/>` : '';
  const shade = (flags, cls) => runs(flags).filter(([a, b]) => b >= from).map(([a, b]) => { const x1 = X(Math.max(a, from)), x2 = Math.max(x1 + 2, X(b)); return `<rect class="${cls}" x="${f1(x1)}" y="${M.t}" width="${f1(x2 - x1)}" height="${H2 - M.t - M.b}"/>`; }).join('');
  const xt = []; let yr = ''; for (let i = from; i < all; i++) { const y = dates[i].slice(0, 4); if (y !== yr) { yr = y; if (i > from && i < all - 8) xt.push([i, y]); } }
  const last = roc[all - 1], ex = X(all - 1), ey = RY(last), unit = kind === 'rate' ? (def.unit || '') : '%';
  const yt = a => `${a < 0 ? '−' : a > 0 ? '+' : ''}${Math.abs(a).toFixed(Math.abs(a) < 10 ? 1 : 0)}${unit === '%' ? '%' : ''}`;
  return `<svg class="rc-chart" viewBox="0 0 ${W} ${H1 + H2}" role="img" aria-label="${esc(`${def.label}: price above and its 50-session rate of change below, now ${fmtChange(last, kind, def.unit)}`)}">
<text class="rc-lab" x="${M.l}" y="9">price</text>
${[0, 1, 2, 3].map(k => { const a = plo + ((phi - plo) * k) / 3; return `<line class="rc-grid" x1="${M.l}" x2="${W - M.r}" y1="${f1(PY(a))}" y2="${f1(PY(a))}"/><text class="rc-ax" x="${M.l - 8}" y="${f1(PY(a) + 3)}" text-anchor="end">${esc(Math.abs(a) >= 1000 ? Math.round(a).toLocaleString('en-GB') : a.toFixed(Math.abs(a) < 10 ? 3 : 1))}</text>`; }).join('')}
<path class="rc-price" d="${pd}"/>
<g transform="translate(0 ${H1})"><text class="rc-lab" x="${M.l}" y="9">50-session rate of change</text>
${band}${shade(w.top, 'rc-ep-top')}${shade(w.bottom, 'rc-ep-bot')}
${[rlo + rpad, 0, rhi - rpad].map(a => `<line class="${a === 0 ? 'rc-zero' : 'rc-grid'}" x1="${M.l}" x2="${W - M.r}" y1="${f1(RY(a))}" y2="${f1(RY(a))}"/><text class="rc-ax" x="${M.l - 8}" y="${f1(RY(a) + 3)}" text-anchor="end">${esc(yt(a))}</text>`).join('')}
${xt.map(([i, y]) => `<text class="rc-ax" x="${f1(X(i))}" y="${H2 - 6}" text-anchor="middle">${y}</text>`).join('')}
<path class="rc-line rc-glow bv-sweep" pathLength="1" d="${rd}"/>
<circle class="rc-end rc-glow" cx="${f1(ex)}" cy="${f1(ey)}" r="4.5"/></g></svg>
<p class="rc-key muted">Below: the 50-session move. The shaded band is the middle 80% of its own history, the dashed line is zero. Purple blocks mark where a strong run had stalled, teal where a fall had stopped.</p>`;
}

export function heroHtml(row, bundle, win) {
  const v = bundle.series[row.def.key], dates = [], vals = [];
  bundle.dates.forEach((dt, i) => { if (Number.isFinite(v[i])) { dates.push(dt); vals.push(v[i]); } });
  const pills = Object.keys(WINDOWS).map(k => `<button type="button" class="in-pill" data-win="${k}" aria-pressed="${win === k}">${esc(WIN_LABEL[k])}</button>`).join('');
  return `<div class="rc-hero" role="region" aria-label="${esc(row.def.label)} in detail">
<p class="rc-cap">${esc(caption(row))}</p>
<div class="card rc-card"><div class="ch"><span class="lbl">${esc(row.def.label)}</span><span class="r in-pills" role="group" aria-label="Window">${pills}</span></div>${heroSvg(row.def, dates, vals, row.kind, win)}</div>
<p class="rc-trust muted">${row.n.toLocaleString('en-GB')} closes since ${esc(row.from)}; the percentile is against this record only${row.short ? ' (too short to rank: it needs about ' + (MIN_HIST + N_LOOK) + ' sessions)' : ''}. ${esc(row.kind === 'rate' ? '' : 'The 50-session move is a log change, in percent.')}</p></div>`;
}

function rowHtml(r, open, bundle, win) {
  const unit = r.def.unit ?? '';
  return `<li class="in-li rc-li"><button type="button" class="in-row rc-row" data-key="${esc(r.def.key)}" aria-expanded="${open ? 'true' : 'false'}">
<span class="in-nm"><b>${esc(r.def.label)}</b><i class="in-gr">${esc(SERIES_GROUPS[r.def.group] ?? r.def.group)}${r.short ? ' · short record' : ''}</i></span>
${trackHtml(r)}<span class="rc-pc">${r.pct50 == null ? '–' : nth(r.pct50)}</span>
<span class="in-val">${esc(fmtChange(r.roc50, r.kind, unit))}</span><span class="rc-ac" title="change in the 50-session move over the last 20 sessions">${arrow(r)} ${r.pacc == null ? '' : nth(r.pacc)}</span>
<span class="rc-chips">${stateChip(r)}</span></button>${open ? heroHtml(r, bundle, win) : ''}</li>`;
}

export function ladderHtml(rank, st, bundle) {
  const rows = rank.rows; if (!rows.length) return '<div class="in-empty">No series had enough history to rank.</div>';
  const groups = GROUP_ORDER.filter(g => rows.some(r => r.def.group === g));
  let list = rows.filter(r => st.group === 'all' || r.def.group === st.group);
  const by = { move: (a, b) => (b.pct50 ?? -1) - (a.pct50 ?? -1), accel: (a, b) => (a.pacc ?? 9) - (b.pacc ?? 9), stall: (a, b) => (b.stall ? 1 : 0) - (a.stall ? 1 : 0) || (b.pct50 ?? -1) - (a.pct50 ?? -1) };
  list = [...list].sort(by[st.sort] ?? by.move);
  const gp = [`<button type="button" class="in-pill" data-group="all" aria-pressed="${st.group === 'all'}">All <b>${rows.length}</b></button>`, ...groups.map(g => `<button type="button" class="in-pill" data-group="${esc(g)}" aria-pressed="${st.group === g}">${esc(SERIES_GROUPS[g])} <b>${rows.filter(r => r.def.group === g).length}</b></button>`)].join('');
  const sp = [['move', 'Strongest 50-session move'], ['accel', 'Decelerating hardest'], ['stall', 'Stalled first']].map(([k, t]) => `<button type="button" class="in-pill" data-sort="${k}" aria-pressed="${st.sort === k}">${t}</button>`).join('');
  return `<div class="rc-tools"><div class="in-pills" role="group" aria-label="Filter by group">${gp}</div><div class="in-pills" role="group" aria-label="Sort">${sp}</div></div>
<div class="rc-scale muted" aria-hidden="true"><span>left: bottom of its own history</span><span>right: top · the faint tick is where it stood 50 sessions ago</span></div>
<ol class="in-list rc-list">${list.map(r => rowHtml(r, st.open === r.def.key, bundle, st.hw)).join('')}</ol>`;
}

export function listsHtml(rank) {
  const block = (title, blurb, rows) => `<section class="rc-block"><h4>${esc(title)} <b>${rows.length}</b></h4><p class="muted">${esc(blurb)}</p>${rows.length ? `<ul class="rc-names">${rows.map(r => `<li><button type="button" class="rc-name" data-open="${esc(r.def.key)}"><b>${esc(r.def.label)}</b> <span>${esc(fmtChange(r.roc50, r.kind, r.def.unit))} over 50 sessions</span><i>${r.priorPct != null ? `${nth(r.priorPct)} → ${nth(r.pct50)}` : r.pacc != null ? nth(r.pacc) : ''}</i></button></li>`).join('')}</ul>` : '<p class="rc-none">None right now.</p>'}</section>`;
  return `<div class="rc-lists">
${block('Stalled leaders', 'A strong 50-session run (top fifth of its own history) 50 sessions ago, and about zero now: price has gone nowhere for 50 sessions.', rank.stalledLeaders)}
${block('Stalled laggards', 'A hard fall (bottom fifth) 50 sessions ago, and about zero now: the fall has stopped.', rank.stalledLaggards)}
${block('Decelerating hardest', 'The 50-session move has fallen into the bottom tenth of its own 20-session changes.', rank.deceleratingHardest)}
${block('Accelerating hardest', 'The 50-session move has risen into the top tenth of its own 20-session changes.', rank.acceleratingHardest)}</div>`;
}

// ── mount ──────────────────────────────────────────────────────────────────────────
const ensureCss = doc => { if (doc.getElementById('rcCss')) return; const l = doc.createElement('link'); l.id = 'rcCss'; l.rel = 'stylesheet'; l.href = 'js/terminal/roc.css'; doc.head.appendChild(l); };

/** Mount the board into host. ctx: { getBundle(), win, doc }. Returns { destroy }. */
export function mountRoc(host, ctx) {
  const win = ctx.win ?? window, doc = ctx.doc ?? document;
  ensureCss(doc);
  const store = () => { try { return win.localStorage ?? null; } catch { return null; } };
  const st = { view: 'ladder', group: 'all', sort: 'move', open: null, hw: '3y' };
  try { Object.assign(st, JSON.parse(store()?.getItem(LS) ?? '{}')); } catch { /* private window */ }
  if (!['ladder', 'lists'].includes(st.view)) st.view = 'ladder';
  if (!(st.hw in WINDOWS)) st.hw = '3y';
  const save = () => { try { store()?.setItem(LS, JSON.stringify({ view: st.view, group: st.group, sort: st.sort, hw: st.hw })); } catch { /* private window */ } };
  let bundle = null, rank = null, alive = true;
  const frame = body => `<div class="rc-head"><p class="in-asof">${rank ? `Where each price series' 50-session rate of change stands against its own history, as at the close of <b>${esc(rank.refDate)}</b>. ${rank.rows.length} series from the daily market bundle (about six years).` : ''} It describes state: the idea that a stalled run means weakness ahead was tested and is shown below.</p>
<details class="rc-said"><summary>What the educator says, and what we found</summary><blockquote class="rc-q">“Rate of change just means a rolling percentage performance over the last 50 days. If something gets to 100 and 50 days later it's at 100, it just went to zero in terms of rate of change. When that second derivative changes ... people are getting frustrated.”<footer>an educator in the informational lane (source clip not located in the stored notes)</footer></blockquote>${foundHtml()}</details></div>
<div class="in-pills rc-views" role="tablist" aria-label="Momentum views">${[['ladder', 'Ladder'], ['lists', 'Stalled and turning']].map(([k, t]) => `<button type="button" role="tab" class="in-tab" data-view="${k}" aria-selected="${st.view === k}">${t}</button>`).join('')}</div>${body}`;
  const draw = () => { if (!bundle) return; host.innerHTML = frame(st.view === 'lists' ? listsHtml(rank) : ladderHtml(rank, st, bundle)); };
  const onClick = e => {
    const t = e.target.closest?.('button'); if (!t || !host.contains(t)) return;
    const d = t.dataset;
    if (d.view) { st.view = d.view; save(); draw(); return; }
    if (d.group) { st.group = d.group; st.open = null; save(); draw(); return; }
    if (d.sort) { st.sort = d.sort; save(); draw(); return; }
    if (d.win) { st.hw = d.win; save(); draw(); return; }
    if (d.open) { st.view = 'ladder'; st.group = 'all'; st.open = d.open; save(); draw(); host.querySelector(`.rc-row[data-key="${d.open}"]`)?.scrollIntoView?.({ block: 'nearest' }); return; }
    if (d.key) { st.open = st.open === d.key ? null : d.key; save(); draw(); host.querySelector(`.rc-row[data-key="${d.key}"]`)?.scrollIntoView?.({ block: 'nearest' }); }
  };
  host.addEventListener('click', onClick);
  host.innerHTML = '<div class="in-empty">Reading the daily market bundle…</div>';
  Promise.resolve(ctx.getBundle()).then(b => {
    if (!alive) return;
    if (!b?.ok) { host.innerHTML = `<div class="in-empty">${esc(b?.error || 'The daily market bundle is not available.')}</div>`; return; }
    bundle = b; rank = rankAll(b, DEFS); draw();
    const want = win.deskRocWant; if (want) { delete win.deskRocWant; st.view = 'ladder'; st.group = 'all'; st.open = want; save(); draw(); }
  });
  win.deskRoc = { open(key) { if (!DEFS.some(s => s.key === key)) return false; st.view = 'ladder'; st.group = 'all'; st.open = key; save(); draw(); return true; }, keys: () => DEFS.map(s => s.key) };
  return { destroy() { alive = false; host.removeEventListener('click', onClick); delete win.deskRoc; } };
}
