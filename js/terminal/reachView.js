// js/terminal/reachView.js: the Level-reach calculator (Insight tab), from js/terminal/reachCore.js. Pick a market and type a price level (or press a preset in units of the
// day's own sigma): get the chance price TOUCHES it by the end of the London session and over the whole session, each with a plus-or-minus band, the calibration note and the
// forecast lines the chance is read from. A ladder underneath shows the same for levels at 0.25 to 3 sigma either side of the price.
// The chance says how likely price is to REACH a level (a wick counts). Not whether it holds, not which way price goes next, never a trade. Presentation only; tokens only.
import { reach, ladderRows, MODEL_NOTE, harSigmaDailyPct } from './reachCore.js';
import { esc } from './boardViz.js';

const pc = p => (p == null || !Number.isFinite(p) ? 'n/a' : p >= 0.995 ? '>99%' : p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`);
const px = (v, sym) => (!Number.isFinite(v) ? 'n/a' : v >= 1000 ? v.toFixed(1) : v >= 100 ? v.toFixed(2) : v >= 10 ? v.toFixed(3) : /JPY/.test(sym) ? v.toFixed(3) : v.toFixed(5));
const range = b => `${Math.round(b.lo * 100)} to ${Math.round(b.hi * 100)}%`;

function chanceCard(title, m, sym, kind) {
  if (!m) return `<div class="in-gcard"><div class="in-gh"><span class="in-gl">${esc(title)}</span><b class="in-gv">n/a</b></div></div>`;
  const rungs = Object.entries(m.rungs).map(([k, v]) => `<tr><th scope="row">${k === 'p50' ? '50%' : k === 'p75' ? '25%' : '10%'} chance line</th><td>${esc(px(v, sym))}</td></tr>`).join('');
  return `<div class="in-gcard"><div class="in-gh"><span class="in-gl">${esc(title)}</span><b class="in-gv">${pc(m.p)}</b></div>
<div class="in-rail in-reach" role="img" aria-label="${esc(`${title}: ${pc(m.p)}, likely ${range(m.band)}`)}"><i class="in-rb" style="left:${(m.band.lo * 100).toFixed(1)}%;width:${((m.band.hi - m.band.lo) * 100).toFixed(1)}%"></i><i class="in-rm" style="left:${(m.p * 100).toFixed(1)}%"></i></div>
<p class="in-cap">Likely between ${range(m.band)}${m.tail ? '. Beyond the farthest forecast line, so extrapolated: rough' : ''}${kind === 'rest' && m.flagged ? '. This London hour is one the research flagged as unreliable' : ''}.</p>
<div class="in-scrollx"><table class="in-tbl in-mini"><tbody>${rungs}</tbody></table></div></div>`;
}

/** The result block for one reach() answer. Pure. */
export function resultHtml(r, sym, sessionDate) {
  if (!r.ok) return `<div class="in-empty">${esc(r.error)}</div>`;
  const dir = r.side === 'up' ? 'above' : 'below', d = Math.abs(r.distancePct).toFixed(2);
  const lead = r.alreadyTouched ? `<p class="in-chance busy">Price has <b>already touched</b> ${esc(px(r.level, sym))} this session (the session ${r.side === 'up' ? 'high' : 'low'} is ${esc(px(r.side === 'up' ? r.sessionHigh : r.sessionLow, sym))}). The chances below are for a fresh touch from here.</p>` : '';
  return `<p class="in-asof">${esc(sym)} is at <b>${esc(px(r.price, sym))}</b>. The level ${esc(px(r.level, sym))} is <b>${d}%</b> ${dir} it${r.rest ? `, <b>${r.rest.d.toFixed(2)}</b> of the day's sigma away` : ''}. The forecast is for the session of ${esc(sessionDate ?? 'today')}.</p>${lead}
<div class="in-ggrid">${chanceCard(`Touches it by the end of the London day${r.rest ? ` (from the ${String(r.rest.checkpoint).padStart(2, '0')}:00 checkpoint)` : ''}`, r.rest, sym, 'rest')}${chanceCard('Touches it at some point this session', r.whole, sym, 'whole')}</div>
${r.notes.length ? `<ul class="in-ul">${r.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`;
}

export function ladderHtml(rows, sym) {
  if (!rows.length) return '';
  const body = rows.map(x => `<tr><th scope="row">${x.k} sigma</th><td><button type="button" class="in-link" data-level="${x.down.level}">${esc(px(x.down.level, sym))}</button></td><td><span class="in-mv" style="--s:${(x.down.p ?? 0).toFixed(2)}">${pc(x.down.p)}</span></td><td><button type="button" class="in-link" data-level="${x.up.level}">${esc(px(x.up.level, sym))}</button></td><td><span class="in-mv" style="--s:${(x.up.p ?? 0).toFixed(2)}">${pc(x.up.p)}</span></td></tr>`).join('');
  return `<h3 class="in-h">The same chance at other distances</h3><div class="in-tblw"><table class="in-tbl"><thead><tr><th>Distance</th><th>Level below</th><th>Chance</th><th>Level above</th><th>Chance</th></tr></thead><tbody>${body}</tbody></table></div>`;
}
export const footHtml = () => `<p class="in-foot muted">${esc(MODEL_NOTE.rest)} ${esc(MODEL_NOTE.whole)} The chance says how likely price is to reach the level (a wick counts), not whether it holds or which way price goes next. It is not a trade or a signal.</p>`;

export function mountReach(host, ctx) {
  const win = ctx.win ?? window, state = { sym: null, level: '', fc: null, sessionDate: null, bars: null, syms: [], err: null }; let alive = true, seq = 0;
  const sel = () => win.deskSelection?.get?.()?.inst ?? null;
  const shell = () => `<div class="in-tools"><label class="kc-l" for="rc-sym">Market</label><input id="rc-sym" class="in-input" list="rc-syms" autocomplete="off" spellcheck="false" maxlength="12" value="${esc(state.sym ?? '')}"><datalist id="rc-syms">${state.syms.map(s => `<option value="${esc(s)}"></option>`).join('')}</datalist>
<label class="kc-l" for="rc-level">Level</label><input id="rc-level" class="in-input" inputmode="decimal" autocomplete="off" placeholder="a price" value="${esc(state.level)}">
<span class="in-presets" role="group" aria-label="Set the level in units of the day's sigma">${[-1, -0.5, 0.5, 1].map(k => `<button type="button" class="btn" data-k="${k}">${k > 0 ? '+' : ''}${k} sigma</button>`).join('')}</span></div>
<div id="rc-out"></div>`;
  async function compute() {
    const my = ++seq, out = host.querySelector('#rc-out'); if (!out) return;
    if (!state.sym || !state.fc) { out.innerHTML = `<div class="in-empty">${esc(state.err || (state.sym ? `No forecast for ${state.sym}.` : 'Pick a market.'))}</div>`; return; }
    if (!state.bars || state.bars.sym !== state.sym) {
      out.innerHTML = '<div class="in-empty">Reading recent prices…</div>';
      try { const j = await ctx.fetchJson(`/api/desk-bars?inst=${encodeURIComponent(state.sym)}&tf=5m`); if (my !== seq || !alive) return; state.bars = j?.ok ? { sym: state.sym, bars: j.bars } : null; if (!state.bars) { out.innerHTML = `<div class="in-empty">${esc(j?.error || 'No prices for this market.')}</div>`; return; } }
      catch (e) { if (my === seq && alive) out.innerHTML = `<div class="in-empty">Could not load prices (${esc(e?.message ?? e)}).</div>`; return; }
    }
    const bars = state.bars.bars, nowMs = Date.now(), lvl = parseFloat(String(state.level).replace(/,/g, ''));
    const base = { sym: state.sym, fc: state.fc, bars, nowMs };
    const res = Number.isFinite(lvl) ? reach({ ...base, level: lvl }) : { ok: false, error: 'Type a price level, or press a sigma button to set one from the current price.' };
    out.innerHTML = `${resultHtml(res, state.sym, state.sessionDate)}${ladderHtml(ladderRows(base), state.sym)}${footHtml()}`;
  }
  const onInput = e => { if (e.target.id === 'rc-level') { state.level = e.target.value; compute(); } };
  const onChange = e => { if (e.target.id === 'rc-sym') { const s = e.target.value.trim().toUpperCase(); if (state.syms.includes(s)) { state.sym = s; state.fc = state.fcs?.[s] ?? null; state.bars = null; state.level = ''; host.querySelector('#rc-level').value = ''; compute(); } } };
  const onClick = e => {
    const b = e.target.closest?.('[data-k],[data-level]'); if (!b || !host.contains(b)) return;
    const P = state.bars?.bars?.[state.bars.bars.length - 1]?.close, s = harSigmaDailyPct(state.fc);
    if (b.dataset.level) { state.level = String(+(+b.dataset.level).toPrecision(7)); }
    else if (P > 0 && s > 0) state.level = String(+(P * (1 + +b.dataset.k * s / 100)).toPrecision(7));
    else return;
    const el = host.querySelector('#rc-level'); if (el) el.value = state.level; compute();
  };
  host.addEventListener('input', onInput); host.addEventListener('change', onChange); host.addEventListener('click', onClick);
  host.innerHTML = '<div class="in-empty">Reading the forecast…</div>';
  ctx.fetchJson('/api/vol-forecast').then(j => {
    if (!alive) return;
    if (!j?.ok || !j.instruments) { host.innerHTML = `<div class="in-empty">${esc(j?.error || 'The volatility forecast is not available.')}</div>`; return; }
    state.fcs = j.instruments; state.sessionDate = j.session_date ?? null;
    state.syms = Object.keys(j.instruments).filter(s => j.instruments[s]?.ladder && harSigmaDailyPct(j.instruments[s]) > 0);
    const want = sel(); state.sym = want && state.syms.includes(want) ? want : (state.syms.includes('EURUSD') ? 'EURUSD' : state.syms[0] ?? null); state.fc = state.sym ? j.instruments[state.sym] : null;
    host.innerHTML = shell(); compute();
  }).catch(e => { if (alive) host.innerHTML = `<div class="in-empty">Could not load the forecast (${esc(e?.message ?? e)}).</div>`; });
  return { destroy() { alive = false; host.removeEventListener('input', onInput); host.removeEventListener('change', onChange); host.removeEventListener('click', onClick); } };
}
