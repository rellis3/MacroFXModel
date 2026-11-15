// js/terminal/matrixView.js: the Cross-asset board and the Sector rotation map (Insight tab), drawn from js/terminal/matrixCore.js.
//   Cross-asset   a grid of every asset's 1 / 5 / 20 session move (colour = which way it went, brightness = how unusual that move is for THAT asset), and a
//                 correlation matrix of daily moves (20 sessions, 120 sessions, or how far the 20 session one has moved from the 120), with the pairs that moved.
//   Rotation      the 11 US sectors against the S&P 500: a glowing map (relative strength across, momentum up) with a trail behind each sector.
// Presentation only; theme tokens only (insight.css); motion off under prefers-reduced-motion. Describes what has happened, never what comes next.
import { returnsGrid, corrMatrix, corrWords, rotation, QUADRANT_TEXT, CORR_BASKET, ASSET_BASKET } from './matrixCore.js';
import { GROUPS, metaFor } from './insightSeries.js';
import { esc } from './boardViz.js';

const nth = p => { const n = Math.round(p * 100); return `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')}`; };
const pct1 = x => `${x >= 0 ? '+' : '-'}${Math.abs(x * 100).toFixed(1)}%`;
const abbr = k => k.toUpperCase();
const lbl = k => metaFor(k).label;

/** The returns grid as HTML. Colour = sign of the move; brightness (--s) = percentile of the move against that asset's own history. */
export function gridHtml(g) {
  if (!g.rows.length) return '<div class="in-empty">None of the basket is in the bundle.</div>';
  const by = new Map(); for (const r of g.rows) { if (!by.has(r.group)) by.set(r.group, []); by.get(r.group).push(r); }
  const body = [...by.entries()].map(([grp, rows]) => `<tbody><tr class="in-grp"><th colspan="4">${esc(GROUPS[grp] ?? grp)}</th></tr>${rows.map(r => `<tr><th scope="row"><button type="button" class="in-link" ${r.go ? `data-go="${esc(r.go)}"` : 'disabled'}>${esc(r.label)}</button>${r.stale ? ` <i class="in-gr">stale</i>` : ''}</th>${r.moves.map((m, i) => m
    ? `<td><span class="in-mv ${m.chg > 0 ? 'u' : m.chg < 0 ? 'd' : ''}" style="--s:${m.pct.toFixed(2)}" title="${esc(`${['1','5','20'][i]} session move ${m.text}: bigger than ${Math.round(m.pct * 100)}% of its own such moves`)}">${esc(m.text)}</span></td>` : '<td class="muted">n/a</td>').join('')}</tr>`).join('')}</tbody>`).join('');
  return `<div class="in-tblw"><table class="in-tbl"><thead><tr><th>Market</th><th>1 session</th><th>5 sessions</th><th>20 sessions</th></tr></thead>${body}</table></div>
<p class="in-foot muted">Colour is which way it moved; brightness is how big that move is for that market against its own history (a dim cell is an ordinary move for it). As at the close of ${esc(g.asOf)}.</p>`;
}

/** The correlation matrix as HTML. mode: 'short' (20 sessions), 'long' (120) or 'chg' (20 minus 120). */
export function corrHtml(c, mode = 'short') {
  if (!c.keys.length) return '<div class="in-empty">No correlation can be drawn: the bundle lacks the basket.</div>';
  const val = x => (!x ? null : mode === 'short' ? x.r20 : mode === 'long' ? x.r120 : x.r20 - x.r120);
  const scale = mode === 'chg' ? 1 : 1;
  const head = `<tr><th></th>${c.keys.map(k => `<th class="in-ch" title="${esc(lbl(k))}">${esc(abbr(k))}</th>`).join('')}</tr>`;
  const rows = c.keys.map((a, i) => `<tr><th scope="row" title="${esc(lbl(a))}">${esc(abbr(a))}</th>${c.keys.map((b, j) => {
    const x = c.cells[i][j], v = val(x);
    if (i === j) return '<td class="in-cc self"></td>';
    if (v == null) return '<td class="in-cc muted">.</td>';
    const s = Math.min(1, Math.abs(v) / scale);
    return `<td class="in-cc ${v >= 0 ? 'pos' : 'neg'}${x.moved ? ' moved' : ''}" style="--s:${s.toFixed(2)}" title="${esc(`${lbl(a)} and ${lbl(b)}: ${x.r20.toFixed(2)} over 20 sessions (${corrWords(x.r20)}), ${x.r120.toFixed(2)} over 120${x.moved ? '. The 20 session value is further from the 120 session one than noise explains.' : ''}`)}">${v.toFixed(2).replace('-0.', '-.').replace(/^0\./, '.')}</td>`;
  }).join('')}</tr>`).join('');
  const f = c.flagged.slice(0, 5).map(p => `<li><b>${esc(lbl(p.a))}</b> and <b>${esc(lbl(p.b))}</b>: ${p.r20.toFixed(2)} over the last ${c.short} sessions against ${p.r120.toFixed(2)} over ${c.long} (${corrWords(p.r20)} now, ${corrWords(p.r120)} before)</li>`).join('');
  const tabs = [['short', `${c.short} sessions`], ['long', `${c.long} sessions`], ['chg', 'What changed']].map(([m, t]) => `<button type="button" class="in-pill" data-mode="${m}" aria-pressed="${mode === m}">${t}</button>`).join('');
  return `<div class="in-pills" role="group" aria-label="Correlation window">${tabs}</div>
<div class="in-tblw"><table class="in-corr"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
<p class="in-chance ${c.flagged.length > c.expectedByChance * 1.5 ? 'busy' : 'quiet'}"><b>${c.flagged.length}</b> of ${c.pairs.length} pairs have a ${c.short} session correlation further from their ${c.long} session one than noise explains (a ringed cell); about <b>${Math.round(c.expectedByChance)}</b> would by chance alone. Twenty daily moves are few: a single correlation is only good to about plus or minus 0.4.</p>
${f ? `<p class="in-foot"><b>The biggest changes</b></p><ul class="in-ul">${f}</ul>` : ''}
<p class="in-foot muted">Correlation of daily moves (a log change for prices and volatility, a plain difference for yields and spreads). Blue = move together, gold = move opposite ways, brighter = closer. It describes the last few weeks; it does not say the link will hold. As at the close of ${esc(c.asOf)}.</p>`;
}

export function crossHtml(grid, corr, mode) { return `<h3 class="in-h">Moves across markets</h3>${gridHtml(grid)}<h3 class="in-h">How markets have been moving together</h3>${corrHtml(corr, mode)}`; }

// ── the rotation map ──
const W = 640, H = 420, PADL = 46, PADR = 14, PADT = 16, PADB = 40;
export function rotationSvg(r) {
  const xs = r.items.flatMap(i => [i.now.rs, ...i.trail.map(t => t.rs)]), ys = r.items.flatMap(i => [i.now.mom, ...i.trail.map(t => t.mom)]);
  const xr = Math.max(2, ...xs.map(v => Math.abs(v - 100))) * 1.15, yr = Math.max(1, ...ys.map(v => Math.abs(v))) * 1.15;
  const X = v => PADL + ((v - 100 + xr) / (2 * xr)) * (W - PADL - PADR), Y = v => PADT + (1 - (v + yr) / (2 * yr)) * (H - PADT - PADB);
  const cx = X(100), cy = Y(0), q = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="in-q ${c}"/>`;
  const ticks = [-xr * 0.66, 0, xr * 0.66].map(d => `<text x="${X(100 + d).toFixed(1)}" y="${H - 22}" class="in-ax" text-anchor="middle">${(100 + d).toFixed(1)}</text>`).join('')
    + [-yr * 0.66, 0, yr * 0.66].map(d => `<text x="${PADL - 6}" y="${(Y(d) + 3).toFixed(1)}" class="in-ax" text-anchor="end">${d >= 0 ? '+' : ''}${d.toFixed(1)}</text>`).join('');
  const dots = r.items.map(i => {
    const pts = [...i.trail, i.now].map(p => [X(p.rs), Y(p.mom)]);
    const path = pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    const [ex, ey] = pts[pts.length - 1];
    return `<g class="in-sec ${i.quadrant}"><title>${esc(`${i.label}: ${QUADRANT_TEXT[i.quadrant]}. 20 session relative strength ${i.now.rs.toFixed(1)}, momentum ${i.now.mom >= 0 ? '+' : ''}${i.now.mom.toFixed(1)}.`)}</title>
<path d="${path}" class="in-trail bv-sweep" pathLength="1"/><circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="6" class="in-glow"/><circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="3.6" class="in-pt"/>
<text x="${(ex + 8).toFixed(1)}" y="${(ey + 3.5).toFixed(1)}" class="in-tag">${esc(i.key.toUpperCase())}</text></g>`;
  }).join('');
  return `<svg class="in-rot" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Sector rotation map: relative strength against the S&amp;P 500 across, momentum up. ${r.counts.map(c => `${c.n} ${c.q}`).join(', ')}.">
${q(cx, PADT, W - PADR - cx, cy - PADT, 'leading')}${q(PADL, PADT, cx - PADL, cy - PADT, 'improving')}${q(cx, cy, W - PADR - cx, H - PADB - cy, 'weakening')}${q(PADL, cy, cx - PADL, H - PADB - cy, 'lagging')}
<line x1="${cx}" x2="${cx}" y1="${PADT}" y2="${H - PADB}" class="in-axl"/><line x1="${PADL}" x2="${W - PADR}" y1="${cy}" y2="${cy}" class="in-axl"/>
<text x="${W - PADR - 6}" y="${PADT + 14}" class="in-ql" text-anchor="end">LEADING</text><text x="${PADL + 6}" y="${PADT + 14}" class="in-ql">IMPROVING</text><text x="${W - PADR - 6}" y="${H - PADB - 8}" class="in-ql" text-anchor="end">WEAKENING</text><text x="${PADL + 6}" y="${H - PADB - 8}" class="in-ql">LAGGING</text>
${ticks}<text x="${(PADL + W - PADR) / 2}" y="${H - 4}" class="in-ax" text-anchor="middle">relative strength over ${r.rsWin} sessions (100 = level with the S&amp;P 500)</text>
<text transform="translate(11 ${(PADT + H - PADB) / 2}) rotate(-90)" class="in-ax" text-anchor="middle">momentum (change over ${r.momWin} sessions)</text>${dots}</svg>`;
}
export function rotationHtml(r) {
  if (!r) return '<div class="in-empty">The bundle has no S&amp;P 500 ETF or no sector ETFs, so the rotation map cannot be drawn.</div>';
  const rows = r.items.map(i => `<tr><td class="in-rk">${i.rank}</td><th scope="row">${esc(i.label)} <i class="in-gr">${esc(i.key.toUpperCase())}</i></th><td><span class="in-mv ${i.rel20 >= 0 ? 'u' : 'd'}" style="--s:${Math.min(1, Math.abs(i.rel20) / 10).toFixed(2)}">${i.rel20 >= 0 ? '+' : '-'}${Math.abs(i.rel20).toFixed(1)}</span></td><td>${i.abs20 == null ? 'n/a' : pct1(i.abs20)}</td><td>${i.abs5 == null ? 'n/a' : pct1(i.abs5)}</td><td class="in-qc ${i.quadrant}">${i.quadrant}</td></tr>`).join('');
  const lead = r.items.filter(i => i.quadrant === 'leading').map(i => i.label), imp = r.items.filter(i => i.quadrant === 'improving').map(i => i.label);
  const read = `Over the last ${r.rsWin} sessions ${r.counts.find(c => c.q === 'leading').n + r.counts.find(c => c.q === 'weakening').n} of 11 sectors beat the S&P 500. ${lead.length ? `Still gaining: ${lead.join(', ')}. ` : 'None is both ahead and still gaining. '}${imp.length ? `Closing the gap: ${imp.join(', ')}.` : ''}`;
  return `<p class="in-chance quiet">${esc(read)}</p>${rotationSvg(r)}
<div class="in-tblw"><table class="in-tbl"><thead><tr><th>#</th><th>Sector</th><th>vs S&amp;P ${r.rsWin}s (pts)</th><th>${r.rsWin} sessions</th><th>5 sessions</th><th>Where on the map</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="in-foot muted">Each dot is where a sector stands against the S&amp;P 500 now; the tail is where it stood in the last four weeks, five sessions apart. Describes where money has been going. It is not a forecast: we have not found that rotation continues, so read it as context. As at the close of ${esc(r.asOf)}.</p>`;
}

function wire(host, ctx, redraw, state) {
  const onClick = e => {
    const t = e.target.closest?.('button'); if (!t || !host.contains(t)) return;
    if (t.dataset.go) { ctx.go?.(t.dataset.go); return; }
    if (t.dataset.mode) { state.mode = t.dataset.mode; redraw(); }
  };
  host.addEventListener('click', onClick);
  return () => host.removeEventListener('click', onClick);
}
export function mountCross(host, ctx) {
  const state = { mode: 'short' }; let g = null, c = null, alive = true;
  const redraw = () => { if (g && c) host.innerHTML = crossHtml(g, c, state.mode); };
  const off = wire(host, ctx, redraw, state);
  host.innerHTML = '<div class="in-empty">Reading the daily market bundle…</div>';
  ctx.getBundle().then(b => { if (!alive) return; if (!b?.ok) { host.innerHTML = `<div class="in-empty">${esc(b?.error || 'The daily market bundle is not available.')}</div>`; return; } g = returnsGrid(b, ASSET_BASKET); c = corrMatrix(b, CORR_BASKET); redraw(); });
  return { destroy() { alive = false; off(); } };
}
export function mountRotation(host, ctx) {
  let alive = true; const off = wire(host, ctx, () => {}, {});
  host.innerHTML = '<div class="in-empty">Reading the daily market bundle…</div>';
  ctx.getBundle().then(b => { if (!alive) return; if (!b?.ok) { host.innerHTML = `<div class="in-empty">${esc(b?.error || 'The daily market bundle is not available.')}</div>`; return; } host.innerHTML = rotationHtml(rotation(b)); });
  return { destroy() { alive = false; off(); } };
}
