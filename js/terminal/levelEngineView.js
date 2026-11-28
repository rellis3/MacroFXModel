// js/terminal/levelEngineView.js: the Level engine card (Insight tab > Level engine, surface panel.insight.reach; it replaced the Level reach board on 2026-11-28 and
// keeps its surface id so saved switches and layouts stay valid). Numbers from js/terminal/levelEngineCore.js; every number carries its Evidence id and that entry's verdict.
// Pick a market, type a price (or click one in the ladder), optionally a second price for the race, and a horizon (ROS / EOD / EOW). The command line does the same:
// REACH <market> <price> [<second price>] [ROS|EOD|EOW]. The time machine (?asof=) works: the clock is the as-of time and the reads come from the saved records.
// Reach, race and size are context; direction is never implied and nothing here is a trade. Presentation only; tokens only.
import { levelCard, ladderLevels, COMPONENTS, HORIZONS, HORIZON_LABEL } from './levelEngineCore.js';
import { harSigmaDailyPct } from './reachCore.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';
import { esc } from './boardViz.js';

const EV = new Map(DESK_EVIDENCE.map(e => [e.id, e]));
const WORD = { validated: 'validated', null: 'null', underpowered: 'underpowered', context: 'context', notbanked: 'not banked' };
const pc = p => (p == null || !Number.isFinite(p) ? 'n/a' : p >= 0.995 ? '&gt;99%' : p < 0.005 ? '&lt;1%' : `${Math.round(p * 100)}%`);
const px = (v, sym) => (!Number.isFinite(v) ? 'n/a' : v >= 1000 ? v.toFixed(1) : v >= 100 ? v.toFixed(2) : v >= 10 ? v.toFixed(3) : /JPY/.test(sym) ? v.toFixed(3) : v.toFixed(5));
const utc = ms => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'n/a');

/** The verdict chip for one component: the verdict as the Evidence Book holds it now (falls back to the component's own), then the Evidence id. */
export function chip(key) {
  const c = COMPONENTS[key]; if (!c) return '';
  const e = c.ev ? EV.get(c.ev) : null, v = c.shown ?? e?.verdict ?? c.verdict;
  const ids = [c.ev, c.ev2].filter(Boolean);
  return `<span class="in-vd ${esc(v)}">${esc(WORD[v] ?? v)}</span><span class="le-id">${ids.length ? ids.map(esc).join(' / ') : esc(c.doc ?? '')}</span>`;
}
const why = key => `<p class="in-cap">${esc(COMPONENTS[key]?.note ?? '')}</p>`;

function reachRows(c) {
  const R = c.reach, dd = c.drawdown.on, rows = [];
  const row = (hz, label, x, extra = '') => rows.push(`<tr${c.horizon === hz ? ' class="le-on"' : ''}><th scope="row">${esc(label)}</th><td class="le-p">${x ? (x.touched ? 'touched' : pc(x.p)) : 'n/a'}</td><td>${x?.band ? `${Math.round(x.band.lo * 100)}-${Math.round(x.band.hi * 100)}%` : ''}</td>${dd ? `<td>${x?.drawdown ? pc(x.drawdown.p) : ''}</td>` : ''}<td>${x ? chip(x.c) : ''}${extra}</td></tr>`);
  row('ROS', 'From now to the 22:00 London close', R.ROS ? { ...R.ROS } : null, R.ROS?.by ? ` <i class="in-gr">30 min ${pc(R.ROS.by['30'])} · 1 h ${pc(R.ROS.by['60'])} · 2 h ${pc(R.ROS.by['120'])} · 4 h ${pc(R.ROS.by['240'])}</i>` : '');
  row('EOD', 'Today\'s session, from its open (the day\'s prior)', R.EOD ? { ...R.EOD, touched: c.alreadyTouched } : null, R.EOD?.tail ? ' <i class="in-gr">beyond p90: extrapolated</i>' : '');
  row('EOW', 'This week, from Monday\'s open', R.EOW ? { ...R.EOW, touched: R.EOW.alreadyTouched } : null, R.EOW ? ` <i class="in-gr">${esc(R.EOW.ladder)} weekly lines</i>` : '');
  row('EOWnow', 'From now to Friday\'s close (plain geometry)', R.EOWnow);
  return `<div class="in-scrollx"><table class="in-tbl le-tbl"><thead><tr><th>Touches ${esc(px(c.level, c.sym))}</th><th>Chance</th><th>Likely</th>${dd ? '<th>With drawdown layer</th>' : ''}<th>Rests on</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function raceHtml(c) {
  const r = c.race; if (!r) return `<p class="in-cap">Add a second price on the other side of ${esc(px(c.price, c.sym))} to race the two levels.</p>`;
  if (r.sameSide) return `<p>${esc(r.note)}</p>`;
  if (r.error) return `<p class="in-cap">${esc(r.error)}</p>`;
  const dd = r.drawdown;
  return `<div class="in-scrollx"><table class="in-tbl le-tbl"><thead><tr><th>By ${esc(r.end)}</th><th>Chance</th>${dd ? '<th>With drawdown layer</th>' : ''}</tr></thead><tbody>
<tr><th scope="row">${esc(px(r.up, c.sym))} touched first</th><td class="le-p">${pc(r.upFirst)}</td>${dd ? `<td>${pc(dd.upFirst)}</td>` : ''}</tr>
<tr><th scope="row">${esc(px(r.down, c.sym))} touched first</th><td class="le-p">${pc(r.downFirst)}</td>${dd ? `<td>${pc(dd.downFirst)}</td>` : ''}</tr>
<tr><th scope="row">Neither by then</th><td class="le-p">${pc(r.neither)}</td>${dd ? `<td>${pc(dd.neither)}</td>` : ''}</tr>
<tr><th scope="row">With no time limit, ${esc(px(r.up, c.sym))} first</th><td class="le-p">${pc(r.upEventually)}</td>${dd ? '<td></td>' : ''}</tr></tbody></table></div>
<p class="le-chips">${chip('race')}</p>${why('race')}`;
}

function maeHtml(c) {
  if (!c.mae.length) return '<p class="in-cap">No sigma for this market, so no adverse-move odds.</p>';
  const dd = c.drawdown.on;
  const body = c.mae.map(m => `<tr><th scope="row">${m.k} sigma (${esc(px(m.price, c.sym))})</th><td class="le-p">${pc(m.againstFirst)}</td>${dd ? `<td>${pc(m.drawdown?.againstFirst)}</td>` : ''}<td>${pc(m.againstEventually)}</td></tr>`).join('');
  return `<div class="in-scrollx"><table class="in-tbl le-tbl"><thead><tr><th>Goes this far the other way before ${esc(px(c.level, c.sym))}</th><th>By ${esc(c.horizonEnd)}</th>${dd ? '<th>With drawdown layer</th>' : ''}<th>No time limit</th></tr></thead><tbody>${body}</tbody></table></div>
<p class="le-chips">${chip('geometry')}</p>${why('geometry')}
<p class="le-chips">${chip('drawdown')}</p><p class="in-cap">${esc(COMPONENTS.drawdown.note)} ${c.drawdown.spx20 == null ? 'The S&P 20-day move was not available, so the layer is off.' : `S&P 20-day move ${c.drawdown.spx20.toFixed(2)}%: the layer is ${c.drawdown.on ? `ON (x${c.drawdown.factor}), shown beside the base numbers, never replacing them` : 'off (the fall is under 2%, or this market is not FX or an index)'}.`}</p>
<p class="le-chips">${chip('adverse')}</p>${why('adverse')}`;
}

function afterHtml(c) {
  const a = c.after, out = [];
  if (a.line) out.push(`<p>${esc(px(c.level, c.sym))} sits on today's <b>${esc(a.line.name)}</b> ${a.line.side === 'up' ? 'open-to-high' : 'open-to-low'} line (${esc(px(a.line.price, c.sym))}). Being a line does not change the chance of reaching it.</p>`);
  if (a.nextRung?.p) out.push(`<p>If it is touched, the next line (${esc(a.nextRung.to)}) is reached before the close about <b>${pc(a.nextRung.p)}</b> of the time.</p><p class="le-chips">${chip('nextRung')}</p>${why('nextRung')}`);
  else if (a.nextRung?.c === 'p90') out.push(`<p class="le-chips">${chip('p90')}</p>${why('p90')}`);
  if (a.x7) out.push(`<p>Touched in this London window (${String(a.x7.from).padStart(2, '0')}:00-${a.x7.to}:00), the next forecast rung follows about <b>${pc(a.x7.p)}</b> of the time (observed on unseen days ${pc(a.x7.obs)}).</p><p class="le-chips">${chip('exhaustion')}</p>${why('exhaustion')}`);
  out.push(`<p><b>Fade or follow at the touch: no edge.</b> Every reaction test at our levels is placebo after costs.</p>${a.reaction.items.map(k => `<div class="in-ev">${chip(k)}${why(k)}</div>`).join('')}`);
  return out.join('');
}

/** The full result for one card. Pure. */
export function cardHtml(c) {
  if (!c?.ok) return `<div class="in-empty">${esc(c?.error ?? 'No answer.')}</div>`;
  const dir = c.side === 'up' ? 'above' : 'below', h = c.reach[c.horizon], lead = h ? (c.horizon === 'EOD' && c.alreadyTouched) || (c.horizon === 'EOW' && h.alreadyTouched) ? 'touched' : pc(h.p) : 'n/a';
  return `<p class="in-asof">${esc(c.sym)} at <b>${esc(px(c.price, c.sym))}</b> (last bar ${esc(utc(c.lastBarMs))}). ${esc(px(c.level, c.sym))} is <b>${Math.abs(c.distancePct).toFixed(2)}%</b> ${dir}${c.dSigma != null ? `, <b>${c.dSigma.toFixed(2)}</b> of the day's sigma` : ''}.</p>
<div class="in-chance le-head"><span class="le-hl">${esc(HORIZON_LABEL[c.horizon])}</span><b class="le-big">${esc(lead)}</b>${h ? `<span class="le-chips">${chip(h.c)}</span>` : ''}</div>
<div class="in-ggrid">
<div class="in-gcard wide"><h3 class="in-h">Reach: does price touch it</h3>${reachRows(c)}${why('session')}${why('week')}${c.reach.ROS ? why('m1') : ''}${why('identity')}</div>
<div class="in-gcard"><h3 class="in-h">Race: which level first</h3>${raceHtml(c)}</div>
<div class="in-gcard"><h3 class="in-h">On the way: how far the other way</h3>${maeHtml(c)}</div>
<div class="in-gcard wide"><h3 class="in-h">Reaction: after a touch</h3>${afterHtml(c)}</div>
</div>${c.notes.length ? `<ul class="in-ul">${c.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`;
}

export function ladderHtml(rows, sym) {
  if (!rows.length) return '';
  const cell = x => `<td><button type="button" class="in-link" data-level="${x.level}">${esc(px(x.level, sym))}</button> <button type="button" class="in-link le-2" data-level2="${x.level}" aria-label="Race against ${esc(px(x.level, sym))}">vs</button></td><td><span class="in-mv" style="--s:${(x.p ?? 0).toFixed(2)}">${pc(x.p)}</span></td>`;
  return `<h3 class="in-h">Other levels (click a price; "vs" sets it as the second level for the race)</h3><div class="in-tblw"><table class="in-tbl"><thead><tr><th>Distance</th><th>Below</th><th>Chance</th><th>Above</th><th>Chance</th></tr></thead><tbody>${rows.map(x => `<tr><th scope="row">${x.k} sigma</th>${cell(x.down)}${cell(x.up)}</tr>`).join('')}</tbody></table></div>`;
}
export const footHtml = () => '<p class="in-foot muted">Level engine: reach, race and how far price may travel are context built from the components the Evidence Book holds, each with its own verdict. No level has a reaction edge after costs, the direction of the next move is never implied, and nothing here is a trade or a signal.</p>';

/** The clock: the time machine's as-of time when one is set, else now. */
export function clockOf(win) {
  const A = win?.__deskAsof;
  return A?.active && Number.isFinite(A.t) ? { ms: A.t, asof: true } : { ms: Date.now(), asof: false };
}

export function mountLevelEngine(host, ctx) {
  const win = ctx.win ?? window, state = { sym: null, level: '', level2: '', horizon: 'ROS', fcs: null, fc: null, sessionDate: null, b5: null, b1: null, syms: [], spx20: null, ddOk: false, err: null };
  let alive = true, seq = 0;
  const want = win.deskLevelWant; win.deskLevelWant = null;
  if (want?.horizon && HORIZONS.includes(want.horizon)) state.horizon = want.horizon;
  if (want?.level) state.level = String(want.level); if (want?.level2) state.level2 = String(want.level2);
  const sel = () => want?.inst ?? win.deskSelection?.get?.()?.inst ?? null;
  const shell = () => `<div class="in-tools"><label class="kc-l" for="le-sym">Market</label><input id="le-sym" class="in-input" list="le-syms" autocomplete="off" spellcheck="false" maxlength="12" value="${esc(state.sym ?? '')}"><datalist id="le-syms">${state.syms.map(s => `<option value="${esc(s)}"></option>`).join('')}</datalist>
<label class="kc-l" for="le-level">Level</label><input id="le-level" class="in-input" inputmode="decimal" autocomplete="off" placeholder="a price" value="${esc(state.level)}">
<label class="kc-l" for="le-level2">Second level</label><input id="le-level2" class="in-input" inputmode="decimal" autocomplete="off" placeholder="optional, for the race" value="${esc(state.level2)}">
<span class="in-presets" role="group" aria-label="Horizon">${HORIZONS.map(h => `<button type="button" class="btn${state.horizon === h ? ' on' : ''}" data-hz="${h}" aria-pressed="${state.horizon === h}">${h}</button>`).join('')}</span></div>
<div id="le-out"></div>`;
  const getJson = url => ctx.fetchJson(url).catch(e => ({ ok: false, error: String(e?.message ?? e) }));
  async function loadBars(my) {
    const [j5, j1] = await Promise.all([getJson(`/api/desk-bars?inst=${encodeURIComponent(state.sym)}&tf=5m`), getJson(`/api/desk-bars?inst=${encodeURIComponent(state.sym)}&tf=1h`)]);
    if (my !== seq || !alive) return false;
    state.b5 = j5?.ok ? { sym: state.sym, bars: j5.bars } : null; state.b1 = j1?.ok ? { sym: state.sym, bars: j1.bars } : null;
    if (!state.b5 && !state.b1) { state.err = j5?.error || j1?.error || 'No prices for this market.'; return false; }
    return true;
  }
  async function compute() {
    const my = ++seq, out = host.querySelector('#le-out'); if (!out) return;
    if (!state.sym || !state.fc) { out.innerHTML = `<div class="in-empty">${esc(state.err || (state.sym ? `No forecast for ${state.sym}.` : 'Pick a market.'))}</div>`; return; }
    if (state.b5?.sym !== state.sym && state.b1?.sym !== state.sym) { out.innerHTML = '<div class="in-empty">Reading recent prices…</div>'; state.err = null; if (!(await loadBars(my))) { if (my === seq && alive) out.innerHTML = `<div class="in-empty">${esc(state.err ?? '')}</div>`; return; } }
    const clock = clockOf(win), lvl = parseFloat(String(state.level).replace(/,/g, '')), l2 = parseFloat(String(state.level2).replace(/,/g, ''));
    const args = { sym: state.sym, fc: state.fc, bars: state.b5?.bars ?? [], weekBars: state.b1?.bars ?? [], nowMs: clock.ms, horizon: state.horizon, spx20: state.spx20 };
    const card = Number.isFinite(lvl) ? levelCard({ ...args, level: lvl, level2: Number.isFinite(l2) ? l2 : null }) : { ok: false, error: 'Type a price level, or click one in the ladder below.' };
    const when = `<p class="in-cap le-when">${clock.asof ? `<b>Time machine:</b> as of ${esc(utc(clock.ms))}; prices and the forecast are the saved records from then.` : 'Live.'} Forecast for the session of ${esc(state.sessionDate ?? 'n/a')}.</p>`;
    out.innerHTML = `${when}${cardHtml(card)}${ladderHtml(ladderLevels(args), state.sym)}${footHtml()}`;
  }
  const setLevel = (k, v) => { state[k] = v; const el = host.querySelector(k === 'level' ? '#le-level' : '#le-level2'); if (el) el.value = v; };
  const onInput = e => { if (e.target.id === 'le-level') { state.level = e.target.value; compute(); } else if (e.target.id === 'le-level2') { state.level2 = e.target.value; compute(); } };
  const pickSym = s => { if (!state.syms.includes(s)) return false; state.sym = s; state.fc = state.fcs?.[s] ?? null; state.b5 = state.b1 = null; return true; };
  const onChange = e => { if (e.target.id === 'le-sym' && pickSym(e.target.value.trim().toUpperCase())) { setLevel('level', ''); setLevel('level2', ''); compute(); } };
  const onClick = e => {
    const b = e.target.closest?.('[data-hz],[data-level],[data-level2]'); if (!b || !host.contains(b)) return;
    if (b.dataset.hz) { state.horizon = b.dataset.hz; for (const x of host.querySelectorAll('[data-hz]')) { x.classList.toggle('on', x.dataset.hz === state.horizon); x.setAttribute('aria-pressed', String(x.dataset.hz === state.horizon)); } }
    else if (b.dataset.level2) setLevel('level2', String(+(+b.dataset.level2).toPrecision(7)));
    else setLevel('level', String(+(+b.dataset.level).toPrecision(7)));
    compute();
  };
  const onAsof = () => { state.b5 = state.b1 = null; load(); };
  host.addEventListener('input', onInput); host.addEventListener('change', onChange); host.addEventListener('click', onClick); win.addEventListener?.('deskasof', onAsof);
  win.deskLevelEngine = { ...(win.deskLevelEngine ?? {}), open(q) { if (!q) return true; if (q.inst) { const s = String(q.inst).toUpperCase(); if (state.fcs) { if (!pickSym(s)) return false; } else state.sym = s; } if (q.horizon && HORIZONS.includes(q.horizon)) state.horizon = q.horizon; if (q.level) state.level = String(q.level); state.level2 = q.level2 ? String(q.level2) : ''; if (state.fcs) { host.innerHTML = shell(); compute(); } return true; } };
  function load() {
    host.innerHTML = '<div class="in-empty">Reading the forecast…</div>';
    Promise.all([getJson('/api/vol-forecast'), getJson('/api/drawdown-shadow')]).then(([j, dd]) => {
      if (!alive) return;
      if (!j?.ok || !j.instruments) { host.innerHTML = `<div class="in-empty">${esc(j?.error || 'The volatility forecast is not available.')}</div>`; return; }
      state.fcs = j.instruments; state.sessionDate = j.session_date ?? null; state.spx20 = Number.isFinite(dd?.spx20) ? dd.spx20 : null;
      state.syms = Object.keys(j.instruments).filter(s => j.instruments[s]?.ladder && harSigmaDailyPct(j.instruments[s]) > 0).sort();
      if (!state.sym) { const w = sel(); state.sym = w && state.syms.includes(w) ? w : (state.syms.includes('EURUSD') ? 'EURUSD' : state.syms[0] ?? null); }
      state.fc = state.sym ? j.instruments[state.sym] ?? null : null;
      host.innerHTML = shell(); compute();
    });
  }
  load();
  return { destroy() { alive = false; host.removeEventListener('input', onInput); host.removeEventListener('change', onChange); host.removeEventListener('click', onClick); win.removeEventListener?.('deskasof', onAsof); if (win.deskLevelEngine) delete win.deskLevelEngine.open; } };
}

/** terminalFeel.js: installs the command bridge (REACH ... on the command line opens this card filled in). The card itself mounts with its Insight pill. */
export function installLevelEngine(win = globalThis.window ?? globalThis) {
  if (!win) return false;
  win.deskLevelEngine = { ...(win.deskLevelEngine ?? {}), installed: true };
  return true;
}
