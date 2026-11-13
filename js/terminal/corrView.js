/**
 * Desk Terminal: the Correlations & hedges tab (owner, 2026-11-06: "rework the hedge and the correlation work in
 * correlations.html, show it visually, automated so the data is just there, modernised to terminal level").
 *
 * Sub-views: Matrix (heatmap, 20/60/120-day, what changed most against the 120-day), Rolling (two markets, three
 * windows, regime shading), Factors (rolling betas to DXY / rates proxy / risk / oil and the dominant one), Hedges
 * (js/terminal/hedgeView.js: ranked hedges for any market or book card, the book's biggest exposure, the hedge-signal
 * summary) and Regimes (correlation conditional on a regime).
 *
 * Data: /api/corr-terminal, the daily-close panel the 6-hourly correlation build writes (server.js
 * buildCorrHistoryJS, worker thread). The page never builds anything; it shows when the data was built. The maths is
 * js/terminal/corrMath.js; the Evidence Book chips js/terminal/corrEvidence.js. The card-level correlation web
 * (today's cards as held) stays on Analytics.
 *
 * render(root, { getJson, book }) — book() returns the page's D (D.run, D.cards). Everything shown is escaped.
 */
import * as M from './corrMath.js';
import { chipsFor } from './corrEvidence.js';
import * as HV from './hedgeView.js';
import { ownerLink, ownerOnly } from './links.js';

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fin = v => v != null && Number.isFinite(v);
export const sg = (v, dp = 2) => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(dp)}` : '–');
const LONDON = 'Europe/London';
export const VIEWS = [['matrix', 'Matrix'], ['rolling', 'Rolling'], ['factors', 'Factors'], ['hedges', 'Hedges'], ['regimes', 'Regimes']];
export const FCOL = { DXY: 'var(--blue)', RATES: 'var(--pur2)', RISK: 'var(--teal)', OIL: '#e0a458' };

/** Correlation colour: purple for positive, gold for negative (green / red stay for direction only). */
export function corrColor(r, alpha = 1) {
  if (!fin(r)) return alpha < 1 ? 'transparent' : 'var(--bg2)';
  const a = Math.min(1, Math.abs(r)), tok = r >= 0 ? '--purrgb' : '--goldrgb';   // theme tokens, so a theme recolours the matrix
  return alpha < 1 ? `rgba(var(${tok}),${(alpha * Math.min(1, Math.abs(r) * 1.4)).toFixed(2)})` : `color-mix(in srgb,rgb(var(${tok})) ${Math.round(100 * (0.15 + 0.85 * a))}%,var(--bg2))`;
}
export const pills = (name, opts, cur) => `<div class="tt-pills" role="group" data-pills="${esc(name)}">${opts.map(([v, l]) => `<button type="button" data-${esc(name)}="${esc(v)}" aria-pressed="${String(v) === String(cur)}">${esc(l)}</button>`).join('')}</div>`;
const winPills = cur => pills('win', M.WINDOWS.map(w => [w, `${w}d`]), cur);
const name = id => esc(M.labelOf(id));

/** "as of" line: built time in London, the refresh cadence, the last daily close, and a stale/building chip. */
export function asOfHtml(r) {
  const p = r?.panel; if (!p) return '';
  const t = new Date(p.generated), when = Number.isFinite(t.getTime()) ? t.toLocaleString('en-GB', { timeZone: LONDON, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–';
  return `<span class="muted">as of <b class="mono">${esc(when)}</b> London · refreshed every ${esc(r.refreshEveryH ?? 6)} h · daily closes (17:00 New York) through <b class="mono">${esc(p.to)}</b>${p.to && Number.isFinite(t.getTime()) && p.to >= new Date(t.getTime() + 3 * 3600_000).toISOString().slice(0, 10) ? ' (that day so far)' : ''} · ${esc(p.syms?.length ?? 0)} markets, ${esc(p.dates?.length ?? 0)} days</span>${r.stale ? ' <span class="chip gold" title="older than two refresh cycles: the scheduled build may be failing">stale</span>' : ''}${r.building ? ' <span class="chip pur">rebuilding</span>' : ''}`;
}

// ═════════════════════ MATRIX ═════════════════════
/** The heatmap as an SVG string. `marks` maps "a|b" to a change label (strengthening / weakening / flipped). */
export function heatmapSvg(mx, { marks = {}, cell = 34 } = {}) {
  const n = mx.ids.length, lab = 78, W = lab + n * cell + 34, H = lab + n * cell + 4;
  const sym = { strengthening: '▲', weakening: '▼', flipped: '⇄' };
  let s = `<svg class="ct-heat" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="correlation matrix, ${esc(mx.w)}-day">`;
  mx.ids.forEach((id, i) => {
    s += `<text x="${lab - 6}" y="${lab + i * cell + cell / 2 + 4}" text-anchor="end" class="ct-ax">${name(id)}</text>`;
    s += `<text transform="translate(${lab + i * cell + cell / 2 + 4},${lab - 6}) rotate(-55)" class="ct-ax">${name(id)}</text>`;
  });
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const r = mx.m[i][j], x = lab + j * cell, y = lab + i * cell, mk = i !== j ? marks[`${mx.ids[i]}|${mx.ids[j]}`] ?? marks[`${mx.ids[j]}|${mx.ids[i]}`] : null;
    const tl = i === j ? M.labelOf(mx.ids[i]) : `${M.labelOf(mx.ids[i])} vs ${M.labelOf(mx.ids[j])}: ${sg(r)} over ${mx.w} days${mk ? ` · ${mk} vs the 120-day` : ''}`;
    s += `<g class="ct-cell${i !== j ? ' ct-click' : ''}" ${i !== j ? `data-a="${esc(mx.ids[i])}" data-b="${esc(mx.ids[j])}" tabindex="0" role="button" aria-label="${esc(tl)}"` : ''}><rect x="${x + 1}" y="${y + 1}" width="${cell - 2}" height="${cell - 2}" rx="4" fill="${i === j ? 'var(--bg3)' : corrColor(r)}"${mk ? ' stroke="var(--tx)" stroke-width="1.6" stroke-dasharray="3 2"' : ''}><title>${esc(tl)}</title></rect>`;
    if (i !== j && fin(r)) s += `<text x="${x + cell / 2}" y="${y + cell / 2 + 4}" text-anchor="middle" class="ct-v" fill="${Math.abs(r) > 0.55 ? 'var(--bg)' : 'var(--tx)'}">${mk ? sym[mk] ?? '' : ''}${Math.round(r * 100)}</text>`;
    s += '</g>';
  }
  return s + '</svg>';
}
/** A -1..1 track with the 120-day value (hollow) and the current one (filled). */
export function shiftBar(now, base, w = 120) {
  const X = v => ((v + 1) / 2) * w;
  return `<svg viewBox="0 0 ${w} 14" width="${w}" height="14" aria-hidden="true"><rect x="0" y="6" width="${w}" height="2" rx="1" fill="var(--line)"/><line x1="${w / 2}" x2="${w / 2}" y1="2" y2="12" stroke="var(--line2)"/><line x1="${X(base)}" x2="${X(now)}" y1="7" y2="7" stroke="var(--tx2)" stroke-width="1.5"/><circle cx="${X(base)}" cy="7" r="3.5" fill="none" stroke="var(--tx2)"/><circle cx="${X(now)}" cy="7" r="4" fill="${corrColor(now)}" stroke="var(--tx)" stroke-width=".8"/></svg>`;
}
const LCLS = { strengthening: 'pur', weakening: '', flipped: 'gold', steady: '' };
export function changesHtml(list, w) {
  if (!list.length) return '<p class="muted">Not enough history for the comparison.</p>';
  return `<div class="ct-chg">${list.map(c => `<div class="ct-chgrow ct-click" data-a="${esc(c.a)}" data-b="${esc(c.b)}" tabindex="0"><b class="mono">${name(c.a)} · ${name(c.b)}</b><span class="mono">${sg(c.base)} → <b>${sg(c.now)}</b></span>${shiftBar(c.now, c.base)}<span class="chip ${LCLS[c.label] ?? ''}">${esc(c.label)}</span></div>`).join('')}</div><p class="tt-note">${esc(w)}-day against 120-day correlation. Strengthening / weakening = the size moved by 0.15 or more; flipped = the sign changed with both at least 0.2. Hollow dot = 120-day, filled = ${esc(w)}-day.</p>`;
}

// ═════════════════════ ROLLING (d3) ═════════════════════
const RCOL = { 20: 'var(--flat)', 60: 'var(--pur2)', 120: 'var(--gold)' };
const SHADE = { HIGH: 'rgba(var(--dnrgb),.10)', LOW: 'rgba(var(--tealrgb),.07)', BULL: 'rgba(var(--uprgb),.08)', BEAR: 'rgba(var(--dnrgb),.09)' };
export function rollingSvg(S, a, b, { from = 0, width = 900, regimes = null } = {}) {
  const d3 = globalThis.d3; if (!d3) return '<p class="muted">The chart library did not load.</p>';
  const H = width < 520 ? 230 : 300, m = { l: 34, r: 12, t: 12, b: 24 };
  const lines = M.WINDOWS.map(w => ({ w, pts: M.rolling(S, a, b, w, { from }).filter(p => fin(p.v)) }));
  const x = d3.scaleLinear().domain([from, S.n - 1]).range([m.l, width - m.r]), y = d3.scaleLinear().domain([-1, 1]).range([H - m.b, m.t]);
  const line = d3.line().x(p => x(p.i)).y(p => y(p.v)).defined(p => fin(p.v));
  const shade = regimes ? M.regimeRuns(regimes, from).filter(r => SHADE[r.label]).map(r => `<rect x="${x(r.from - 0.5)}" y="${m.t}" width="${Math.max(1, x(r.to + 0.5) - x(r.from - 0.5))}" height="${H - m.t - m.b}" fill="${SHADE[r.label]}"><title>${esc(r.label)} ${esc(S.dates[r.from])} to ${esc(S.dates[r.to])}</title></rect>`).join('') : '';
  const nt = width < 520 ? 4 : 8, span = S.n - 1 - from, ticks = []; for (let k = 0; k <= nt; k++) { const i = Math.round(from + span * k / nt); if (!ticks.length || String(S.dates[i]).slice(0, 7) !== String(S.dates[ticks.at(-1)]).slice(0, 7)) ticks.push(i); }
  return `<svg class="ct-roll" viewBox="0 0 ${width} ${H}" width="100%" role="img" aria-label="${esc(M.labelOf(a))} against ${esc(M.labelOf(b))}: rolling correlation">${shade}
${[-1, -0.5, 0, 0.5, 1].map(v => `<line x1="${m.l}" x2="${width - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? 'var(--line2)' : 'var(--line)'}"/><text x="${m.l - 6}" y="${y(v) + 3}" text-anchor="end" class="ct-ax">${v}</text>`).join('')}
${ticks.map(i => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="ct-ax">${esc(String(S.dates[i] ?? '').slice(0, 7))}</text>`).join('')}
${lines.map(L => `<path d="${line(L.pts) ?? ''}" fill="none" stroke="${RCOL[L.w]}" stroke-width="${L.w === 120 ? 2.2 : L.w === 60 ? 1.7 : 1.1}" opacity="${L.w === 20 ? 0.85 : 1}"/>`).join('')}
${lines.map(L => { const p = L.pts.at(-1); return p ? `<circle cx="${x(p.i)}" cy="${y(p.v)}" r="3.5" fill="${RCOL[L.w]}"/>` : ''; }).join('')}
</svg>`;
}

// ═════════════════════ FACTORS ═════════════════════
export function spark(pts, { w = 110, h = 22, col = 'var(--pur2)' } = {}) {
  const v = pts.filter(p => fin(p.v)); if (v.length < 3) return `<svg width="${w}" height="${h}"></svg>`;
  const lo = Math.min(0, ...v.map(p => p.v)), hi = Math.max(0, ...v.map(p => p.v)), X = k => (k / (v.length - 1)) * w, Y = y => h - 2 - ((y - lo) / (hi - lo || 1)) * (h - 4);
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><line x1="0" x2="${w}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--line2)"/><polyline points="${v.map((p, k) => `${X(k).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="1.3"/></svg>`;
}
export function factorTile(S, row, w, from) {
  const F = M.FACTORS, dom = row.dom ? F.find(f => f.k === row.dom) : null, self = F.find(f => row.f[f.k]?.self);
  const bar = F.map(f => (row.shares[f.k] ? `<i style="flex:${(row.shares[f.k] * 100).toFixed(1)};background:${FCOL[f.k]}" title="${esc(f.label)} ${Math.round(row.shares[f.k] * 100)}% of the explained variance"></i>` : '')).join('');
  return `<div class="ct-ftile"><div class="ch" style="margin-bottom:6px"><b class="mono">${name(row.id)}</b><span class="r">${self ? `<span class="chip" style="color:${FCOL[self.k]};border-color:${FCOL[self.k]}66" title="this market is the factor; the bar splits the other factors">is the ${esc(self.k.toLowerCase())} factor</span>` : dom ? `<span class="chip" style="color:${FCOL[dom.k]};border-color:${FCOL[dom.k]}66">${esc(dom.label)}</span>` : '<span class="muted">no data</span>'}</span></div>
<div class="gauge ct-share">${bar}</div>
${F.map(f => { const b = row.f[f.k] ?? {}; return `<div class="ct-frow"><span style="color:${FCOL[f.k]}">${esc(f.k)}</span><span class="mono">${b.self ? 'self' : sg(b.beta)}</span><span class="mono muted">${b.self ? '' : `r ${sg(b.r)}`}</span>${b.self ? '<span></span>' : spark(M.betaSeries(S, row.id, f, w, { from, step: 5 }), { col: FCOL[f.k] })}</div>`; }).join('')}</div>`;
}

// ═════════════════════ REGIMES ═════════════════════
export function regimeTableHtml(rows, def, counts) {
  const L = def.labels;
  return `<div class="scroll ct-scroll"><table class="ct-rt"><thead><tr><th>Pair</th>${L.map(l => `<th class="n">${esc(l)}<br><span class="muted" style="font-weight:400">${esc(counts[l] ?? 0)} days</span></th>`).join('')}<th class="n">Spread</th></tr></thead><tbody>${rows.map(r => `<tr class="ct-click" data-a="${esc(r.a)}" data-b="${esc(r.b)}" tabindex="0"><td class="mono">${name(r.a)} · ${name(r.b)}</td>${L.map(l => { const c = r.c[l]; return `<td class="n" style="background:${corrColor(c.r, 0.45)}" title="${esc(`${c.n} days`)}">${sg(c.r)}</td>`; }).join('')}<td class="n"><b>${fin(r.spread) ? r.spread.toFixed(2) : '–'}</b></td></tr>`).join('')}</tbody></table></div>`;
}

// ═════════════════════ THE TAB ═════════════════════
const ST = { view: 'matrix', win: 60, set: 'key', a: 'EURUSD', b: 'GOLD', range: 250, shade: 'vol', fset: 'key', reg: 'vol', resp: null, S: null, loading: null };
try { const v = localStorage.getItem('deskTerminalCorrView'); if (VIEWS.some(([k]) => k === v)) ST.view = v; } catch { /* storage blocked */ }

export function idsFor(S, set) {
  if (set === 'ccy') return M.SETS.ccy.filter(id => M.has(S, id));
  if (set === 'all') return S.ids;
  return M.SETS.key.filter(id => M.has(S, id));
}
export const allIds = S => [...M.SETS.ccy, 'DXY', ...S.ids].filter((id, i, a) => a.indexOf(id) === i && M.has(S, id));

function load(getJson, force = false) {
  if (force) ST.loading = null;
  return (ST.loading ??= getJson('/api/corr-terminal').then(r => { ST.resp = r; ST.S = r?.ok && r.panel ? M.series(r.panel) : null; if (!ST.S) ST.loading = null; return r; }));
}

export async function render(root, { getJson, book = () => ({}) } = {}) {
  if (!root) return;
  if (ST.view === 'hedges' && globalThis.deskSurfaceOn?.('panel.corr.hedges') === false) ST.view = 'matrix';   // the hedge finder is a recommendation: not for the desk login
  if (!document.querySelector('link[data-corr-css]')) document.head.insertAdjacentHTML('beforeend', `<link rel="stylesheet" href="${new URL('./corr-tab.css', import.meta.url).href}" data-corr-css>`);
  if (!root.dataset.built) {
    root.dataset.built = '1';
    root.innerHTML = `<div class="card glow"><div class="tt-head"><span class="lbl">Correlations &amp; hedges</span><h2 style="flex-basis:100%">How markets are moving together, and what has offset what</h2><span id="ct-asof"></span></div>
<div class="ct-bar">${pills('view', VIEWS.filter(([k]) => k !== 'hedges' || globalThis.deskSurfaceOn?.('panel.corr.hedges') !== false), ST.view)}</div>
<p class="tt-note">Daily log-return correlations over trailing 20, 60 and 120 trading days. Descriptive: what has moved together, not what will. The card-level web of today's book is on Analytics. ${ownerOnly(`Old page: ${ownerLink('correlations.html', 'correlations.html')}.`)}</p></div>
<div id="ct-body" style="margin-top:14px"><div class="tt-load">Loading the correlation panel…</div></div>
${globalThis.deskIsViewer?.() ? '' : '<details class="ct-admin"><summary>Admin</summary><p class="muted">The panel is rebuilt by the server every 6 hours (5 years of OANDA H4 bars, worker thread). Force a rebuild only if the time above is stale.</p><button class="btn" data-rebuild>Rebuild now</button> <span class="muted" id="ct-rb"></span></details>'}`;
    root.addEventListener('click', e => onClick(e, root, getJson, book));
    root.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('.ct-click')) { e.preventDefault(); onClick(e, root, getJson, book); } });
    root.addEventListener('change', e => onChange(e, root, getJson, book));
    let lastW = window.innerWidth;
    window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - lastW) > 60 && !root.hidden && ST.view === 'rolling') { lastW = window.innerWidth; draw(root, getJson, book); } });
  }
  await load(getJson);
  draw(root, getJson, book);
}

function setView(root, v) {
  ST.view = v; try { localStorage.setItem('deskTerminalCorrView', v); } catch { /* storage blocked */ }
  root.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
}

function onClick(e, root, getJson, book) {
  const t = e.target.closest('button,[data-a]'); if (!t) return;
  const ds = t.dataset;
  if (ds.view) { setView(root, ds.view); return draw(root, getJson, book); }
  if (ds.win) { ST.win = +ds.win; return draw(root, getJson, book); }
  if (ds.set) { ST.set = ds.set; return draw(root, getJson, book); }
  if (ds.fset) { ST.fset = ds.fset; return draw(root, getJson, book); }
  if (ds.range) { ST.range = +ds.range; return draw(root, getJson, book); }
  if (ds.shade) { ST.shade = ds.shade; return draw(root, getJson, book); }
  if (ds.reg) { ST.reg = ds.reg; return draw(root, getJson, book); }
  if (ds.rebuild !== undefined) {
    const out = root.querySelector('#ct-rb'); t.disabled = true;
    fetch('/api/corr-history/rebuild', { method: 'POST' }).then(r => r.json()).then(j => { out.textContent = j.message ?? ''; }).catch(err => { out.textContent = err.message; }).finally(() => { t.disabled = false; });
    return;
  }
  if (ds.a && ds.b && !t.closest('.ct-hedges')) { ST.a = ds.a; ST.b = ds.b; setView(root, 'rolling'); draw(root, getJson, book); root.querySelector('#ct-body')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
  if (t.closest('.ct-hedges')) HV.onClick(e, t, () => draw(root, getJson, book));
}
function onChange(e, root, getJson, book) {
  const s = e.target;
  if (s.id === 'ct-a') ST.a = s.value; else if (s.id === 'ct-b') ST.b = s.value;
  else if (s.closest('.ct-hedges')) return HV.onChange(e, () => draw(root, getJson, book));
  else return;
  draw(root, getJson, book);
}

function draw(root, getJson, book) {
  const body = root.querySelector('#ct-body'), r = ST.resp, S = ST.S;
  root.querySelector('#ct-asof').innerHTML = asOfHtml(r);
  if (!S) {
    body.innerHTML = `<div class="card"><p>${esc(r?.error ?? 'The correlation panel is not available.')}</p><p class="muted">${r?.building ? 'The scheduled build is running; this tab fills in when it finishes.' : 'It is built by the server on a 6-hour schedule (and a minute after a restart). Nothing to press here: it fills in on its own.'}</p></div>`;
    if (r && !r.ok) setTimeout(() => load(getJson, true).then(() => { if (!root.hidden) draw(root, getJson, book); }), 60_000);
    return;
  }
  const v = ST.view;
  if (v === 'matrix') {
    const ids = idsFor(S, ST.set), mx = M.matrix(S, ids, ST.win), cw = ST.win === 120 ? 20 : ST.win;
    const ch = M.changes(S, ids, { w: cw, base: 120, top: 10 }), marks = Object.fromEntries(ch.filter(c => c.label !== 'steady').map(c => [`${c.a}|${c.b}`, c.label]));
    body.innerHTML = `<div class="ct-bar">${pills('set', [['ccy', 'Currencies'], ['key', 'Key markets'], ['all', 'All']], ST.set)}${winPills(ST.win)}</div>
<div class="ct-grid"><div class="card"><div class="ch"><span class="lbl">Correlation matrix · ${esc(ST.win)}-day</span><span class="r muted">purple = move together · gold = move against · dashed = changed most vs 120d · tap a cell for its history</span></div><div class="ct-scroll">${heatmapSvg(mx, { marks, cell: ids.length > 16 || window.innerWidth < 600 ? 28 : 34 })}</div>${ST.set === 'ccy' ? '<p class="tt-note">Currencies = each currency against an equal-weighted basket of the other seven, built from the USD legs. The eight baskets sum to zero, so they lean negative together.</p>' : ''}${chipsFor('matrix')}</div>
<div class="card"><div class="ch"><span class="lbl">Changed most vs 120d</span><span class="r muted">${esc(cw)}-day now against the 120-day</span></div>${changesHtml(ch, cw)}</div></div>`;
  } else if (v === 'rolling') {
    const ids = allIds(S), from = Math.max(0, S.n - ST.range), regs = ST.shade === 'none' ? null : M.regimeOf(S, ST.shade);
    const opts = cur => ids.map(id => `<option value="${esc(id)}"${id === cur ? ' selected' : ''}>${name(id)}</option>`).join('');
    const now = M.WINDOWS.map(w => [w, M.corrAt(S, ST.a, ST.b, w)]), st = M.stability(S, ST.a, ST.b, 60);
    const card = root.querySelector('#ct-body');
    card.innerHTML = `<div class="card"><div class="ct-bar"><label class="ct-sel">A <select id="ct-a">${opts(ST.a)}</select></label><label class="ct-sel">B <select id="ct-b">${opts(ST.b)}</select></label>${pills('range', [[250, '1y'], [S.n, `${Math.round(S.n / 250)}y`]], ST.range === 250 ? 250 : S.n)}${pills('shade', [['vol', 'Vol regime'], ['trend', 'EUR/USD trend'], ['none', 'No shading']], ST.shade)}</div>
<div class="tt-tiles">${now.map(([w, c]) => `<div class="tt-tile"><div class="lbl" style="color:${RCOL[w]}">${w}-day</div><div class="v mono">${sg(c)}</div></div>`).join('')}<div class="tt-tile"><div class="lbl">60d sign held</div><div class="v mono">${fin(st.share) ? Math.round(st.share * 100) + '%' : '–'}</div><div class="s">of 60-day windows over the last year · p10–p90 ${sg(st.p10)} to ${sg(st.p90)}</div></div></div>
<div id="ct-rollbox"></div><p class="tt-note">${ST.shade === 'none' ? '' : `Shading: ${esc(M.REGIMES[ST.shade].note)}. ${ST.shade === 'vol' ? 'Red = high-vol third, teal = low-vol third.' : 'Green = BULL, red = BEAR, unshaded = RANGE.'}`} Lines: 20-day (thin), 60-day, 120-day (gold).</p>${chipsFor('rolling')}</div>`;
    const box = card.querySelector('#ct-rollbox');
    box.innerHTML = rollingSvg(S, ST.a, ST.b, { from, width: Math.max(300, Math.min(1300, box.clientWidth || 900)), regimes: regs });
  } else if (v === 'factors') {
    const ids = ST.fset === 'ccy' ? M.SETS.ccy.filter(id => M.has(S, id)) : idsFor(S, ST.fset), rows = M.factorBoard(S, ids, { w: ST.win }), from = Math.max(0, S.n - 250);
    const domCount = {}; for (const r of rows) if (r.dom) domCount[r.dom] = (domCount[r.dom] ?? 0) + 1;
    body.innerHTML = `<div class="ct-bar">${pills('fset', [['key', 'Key markets'], ['ccy', 'Currencies'], ['all', 'All']], ST.fset)}${winPills(ST.win)}</div>
<div class="card"><div class="ch"><span class="lbl">Factor betas · ${esc(ST.win)}-day</span><span class="r">${M.FACTORS.map(f => `<span class="chip" style="color:${FCOL[f.k]};border-color:${FCOL[f.k]}66" title="${esc(f.note)}">${esc(f.label)} ${esc(domCount[f.k] ?? 0)}</span>`).join('')}</span></div>
<p class="tt-note" style="margin-top:0">Each tile: beta of the market's daily return to each factor (one factor at a time), its correlation, and the beta over the last year (every 5 days). The bar splits the explained variance (r²) between the factors; the chip is the factor that explains most now. Factors: ${M.FACTORS.map(f => `${esc(f.label)} = ${esc(f.note)}`).join('; ')}.</p>
<div class="ct-ftiles">${rows.map(r => factorTile(S, r, ST.win, from)).join('')}</div>${chipsFor('factors')}</div>`;
  } else if (v === 'hedges') {
    body.innerHTML = `<div class="ct-hedges">${HV.html(S, { win: ST.win, book: book(), getJson, winPills })}</div>`;
    HV.after(body.querySelector('.ct-hedges'), S, { getJson, redraw: () => { if (ST.view === 'hedges') draw(root, getJson, book); } });
  } else if (v === 'regimes') {
    const def = M.REGIMES[ST.reg], regs = M.regimeOf(S, ST.reg), ids = M.SETS.key.filter(id => M.has(S, id));
    const pairs = []; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j]]);
    const rows = M.regimeTable(S, pairs, regs, def.labels).slice(0, 18), counts = {}; for (const g of regs) if (g) counts[g] = (counts[g] ?? 0) + 1;
    body.innerHTML = `<div class="ct-bar">${pills('reg', [['vol', 'S&P volatility'], ['trend', 'EUR/USD trend']], ST.reg)}</div>
<div class="card"><div class="ch"><span class="lbl">Correlation by regime · ${esc(def.name)}</span><span class="r muted">key-market pairs whose correlation differs most between regimes · tap a row for its history</span></div>${regimeTableHtml(rows, def, counts)}
<p class="tt-note">Each cell pools the daily returns of the days in that regime over the panel (${esc(S.dates[0])} to ${esc(S.dates.at(-1))}) and correlates them. Regime: ${esc(def.note)}. Days without a regime (the first year of the vol regime, or a day with no snapshot) are left out.</p>${chipsFor('regimes')}</div>`;
  }
}
