// js/terminal/fxMatrixView.js: the Currency rates matrix board (Insight tab), from js/terminal/fxMatrixCore.js and /api/ccy-strength. Two drawings: the eight currencies
// across the four windows (score in sigma, rank, a "stronger / weaker lately" word), and the 8 x 8 grid of how far each currency has out-run each other over one window.
// Shut market: the route anchors to the last close and the board says so. Refreshes every 90 seconds while it is on screen. Ordering and size only, never a direction call.
// Presentation only; theme tokens only (insight.css); motion off under prefers-reduced-motion.
import { strengthTable, pairMatrix, pairOf, tableSentence, TURN_WORDS, KEYS } from './fxMatrixCore.js';
import { esc } from './boardViz.js';

const sg = v => (v == null || !Number.isFinite(v) ? '–' : Math.abs(v) < 0.05 ? '0.0' : `${v > 0 ? '+' : '-'}${Math.abs(v).toFixed(1)}`);
const when = iso => { const d = new Date(iso); return Number.isNaN(+d) ? '' : d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'; };

export function tableHtml(t) {
  if (!t.ok) return `<div class="in-empty">${esc(t.error)}. The Overview's own strength board stands on its own.</div>`;
  const head = `<tr><th>Currency</th>${t.cols.map(c => `<th title="${esc(c.available ? `${c.key}: ${when(c.from)} to ${when(c.to)}. 1.0 sigma is about ${c.unitPct}% of a normal move over the window.` : c.reason)}">${c.key}${c.available ? '' : ' <i class="in-gr">n/a</i>'}</th>`).join('')}<th>Lately</th></tr>`;
  const rows = t.rows.map(r => `<tr><th scope="row"><b>${esc(r.ccy)}</b></th>${KEYS.map(k => {
    const c = r.cells[k], col = t.cols.find(x => x.key === k);
    if (!col.available || !c) return '<td class="muted">n/a</td>';
    return `<td><span class="in-mv ${c.score > 0.05 ? 'u' : c.score < -0.05 ? 'd' : ''}" style="--s:${Math.min(1, Math.abs(c.score) / 2).toFixed(2)}" title="${esc(`${r.ccy} on ${k}: ${sg(c.score)} sigma, rank ${c.rank} of 8`)}">${sg(c.score)}<small> #${c.rank}</small></span></td>`;
  }).join('')}<td>${r.turning ? `<span class="in-tn ${r.turning}" title="${esc(`${r.ccy} is ${TURN_WORDS[r.turning]}`)}">${r.turning}</span>` : '<span class="muted">n/a</span>'}</td></tr>`).join('');
  const say = tableSentence(t), note = t.closed ? `<p class="in-chance quiet">The market is shut: every window runs to ${esc(t.closeLabel || 'the last prices')}.</p>` : '';
  const na = t.cols.filter(c => !c.available);
  return `${note}${say ? `<p class="in-asof"><b>${esc(say)}</b></p>` : ''}<div class="in-tblw"><table class="in-tbl in-fx"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
${na.length ? `<p class="in-foot muted">${na.map(c => `${c.key}: ${esc(c.reason)}`).join('. ')}. A window fills in as the bars arrive.</p>` : ''}`;
}

export function matrixHtml(m, hz) {
  const pills = KEYS.map(k => `<button type="button" class="in-pill" data-hz="${k}" aria-pressed="${k === hz}">${k}</button>`).join('');
  if (!m) return `<div class="in-pills" role="group" aria-label="Window">${pills}</div><div class="in-empty">No data for the ${esc(hz)} window yet.</div>`;
  const head = `<tr><th></th>${m.ccys.map(c => `<th class="in-ch">${esc(c)}</th>`).join('')}</tr>`;
  const rows = m.ccys.map((a, i) => `<tr><th scope="row">${esc(a)}</th>${m.ccys.map((b, j) => {
    const v = m.cells[i][j]; if (v == null) return '<td class="in-cc self"></td>';
    const p = pairOf(a, b), s = Math.min(1, Math.abs(v) / m.max);
    return `<td class="in-pm ${v > 0.05 ? 'u' : v < -0.05 ? 'd' : ''}" style="--s:${s.toFixed(2)}"${p ? ` data-go="${esc(p.inst)}" tabindex="0" role="button"` : ''} title="${esc(`${a} against ${b}: ${sg(v)} sigma over ${m.hz}${p ? `. Click to open ${p.inst} on the Pair page.` : ''}`)}">${sg(v)}</td>`;
  }).join('')}</tr>`).join('');
  return `<div class="in-pills" role="group" aria-label="Window">${pills}</div>
<div class="in-tblw"><table class="in-corr in-pmx"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
<p class="in-foot muted">Each cell is how far the currency on the left has out-run (positive) or lagged (negative) the one across the top over ${esc(m.hz)}, in units of a normal move (1.0 sigma is about ${m.unitPct}% of one). The grid is fitted, so no triangle contradicts itself. It says what has happened over the window; it does not say what happens next. Click a cell to open that pair.</p>`;
}

export function fxHtml(payload, hz) { return `<h3 class="in-h">The eight currencies, four windows</h3>${tableHtml(strengthTable(payload))}<h3 class="in-h">Who has out-run whom</h3>${matrixHtml(pairMatrix(payload, hz), hz)}`; }

export function mountFx(host, ctx) {
  const state = { hz: '1D' }; let payload = null, alive = true, timer = null;
  const draw = () => { if (payload) host.innerHTML = fxHtml(payload, state.hz); };
  const onClick = e => {
    const t = e.target.closest?.('[data-hz],[data-go]'); if (!t || !host.contains(t)) return;
    if (t.dataset.hz) { state.hz = t.dataset.hz; draw(); return; }
    if (t.dataset.go) ctx.go?.(t.dataset.go);
  };
  const onKey = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset?.go) { e.preventDefault(); ctx.go?.(e.target.dataset.go); } };
  host.addEventListener('click', onClick); host.addEventListener('keydown', onKey);
  async function load() {
    try { payload = await ctx.fetchJson('/api/ccy-strength'); } catch (e) { payload = { ok: false, error: `Could not load currency strength (${e?.message ?? e})` }; }
    if (!alive) return;
    if (payload?.ok && !payload.horizons?.[state.hz]?.available) state.hz = KEYS.find(k => payload.horizons?.[k]?.available) ?? state.hz;
    draw();
  }
  host.innerHTML = '<div class="in-empty">Reading the price bars…</div>';
  load();
  const doc = ctx.doc ?? document;
  timer = (ctx.win ?? window).setInterval(() => { if (alive && !host.hidden && doc.visibilityState !== 'hidden' && !host.closest?.('[hidden]')) load(); }, 90_000);
  return { destroy() { alive = false; (ctx.win ?? window).clearInterval(timer); host.removeEventListener('click', onClick); host.removeEventListener('keydown', onKey); } };
}
