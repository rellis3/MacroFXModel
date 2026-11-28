// js/terminal/biasEngineV2View.js: the owner-only Bias Engine V2 (shadow) panel in the Macro tab's Bias engine section
// (plans/BIAS_ENGINE_V2_SPEC.md §5). Surface panel.macro.bev2, kind 'internal': the desk login never sees it, and nothing in production
// reads V2. Data: GET /api/bias-engine-v2/compare. The pure half (HTML strings) is tested in biasEngineV2View.test.mjs; `mount` touches the page.
// Colours are theme tokens only.

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fin = x => typeof x === 'number' && Number.isFinite(x);
const sgn = (x, k = 2) => (!fin(x) ? '–' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(k)}`);
const DIR = { BULLISH: ['▲', 'up'], BEARISH: ['▼', 'dn'], NEUTRAL: ['–', ''] };
export const NOTE = 'Shadow engine: not a production signal and read by nothing in production. V1 is the production control. Confidence is uncalibrated; strength is a magnitude, not a probability.';
export const SWITCH_LABEL = { F1: 'timestamps & quality', F2: 'carry (policy-rate gap)', F3: 'tone & COT out', F4: 'one risk factor', F5: 'expected repricing (6 m)' };

export function callHtml(c) {
  if (!c) return '<span class="muted">–</span>';
  const [a, cls] = DIR[c.dir] ?? DIR.NEUTRAL;
  return `<span class="${cls}">${a} ${esc(c.dir === 'NEUTRAL' ? 'Neutral' : `${c.strength}/10`)}</span> <span class="muted mono">${sgn(c.score)}</span>`;
}
/** One market row: V1, V1 replay, V2, quality, agreement, the families for and against. */
export function rowHtml(r) {
  const differ = r.v1 && r.v2 && r.v1.dir !== r.v2.dir;
  const sup = r.v2?.support ? `${(r.v2.support.for ?? []).map(f => `<span class="chip up">${esc(f)}</span>`).join('')}${(r.v2.support.against ?? []).map(f => `<span class="chip dn">${esc(f)}</span>`).join('')}` : '';
  return `<tr class="${differ ? 'bev2-diff' : ''}" data-m="${esc(r.market)}"><th>${esc(r.market)}${differ ? ' <span class="chip gold" title="V2 and V1 call different directions">differs</span>' : ''}</th>
<td>${callHtml(r.v1)}</td><td>${callHtml(r.v1r)}</td><td>${callHtml(r.v2)}</td>
<td class="n mono">${fin(r.v2?.dataQuality) ? r.v2.dataQuality.toFixed(2) : '–'}</td><td class="n mono">${fin(r.v2?.agreement) ? r.v2.agreement.toFixed(2) : '–'}</td><td>${sup}</td></tr>`;
}
/** V2's driver contributions for one market, largest first, with families, legs, freshness and the repricing components. */
export function driversHtml(r) {
  const ds = [...(r.drivers ?? [])].sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib));
  const max = Math.max(0.05, ...ds.map(x => Math.abs(x.contrib)));
  const bar = x => `<span class="bev2-bar ${x > 0 ? 'up' : 'dn'}" style="width:${Math.round(Math.abs(x) / max * 100)}%"></span>`;
  const rows = ds.map(x => `<tr><th title="${esc(x.key)}">${esc(x.leg ? `${x.leg} ` : '')}${esc(x.label ?? x.key)}${x.proxy ? ' <span class="chip">proxy</span>' : ''}</th><td class="muted">${esc(x.family)}</td><td class="n mono">${sgn(x.contrib, 3)}</td><td class="bev2-bw">${bar(x.contrib)}</td>
<td class="n mono" title="freshness 0-1">${fin(x.f) ? x.f.toFixed(2) : '–'}</td><td class="muted">${esc(x.reading ?? '')}${x.components ? ` <span class="mono">(level ${sgn(x.components.level, 3)}, change ${sgn(x.components.change, 3)})</span>` : ''}</td></tr>`).join('');
  const miss = (r.missing ?? []).length ? `<p class="muted">Missing: ${(r.missing).map(x => `${esc(x.leg ? `${x.leg} ` : '')}${esc(x.key)} (${esc(x.why)})`).join('; ')}</p>` : '';
  const att = r.attribution ? `<table class="bev2-att"><thead><tr><th>Switch</th><th class="n">V1 + this alone</th><th class="n">V2 without it</th></tr></thead><tbody>${Object.entries(r.attribution).map(([k, a]) => `<tr><th>${esc(k)} ${esc(SWITCH_LABEL[k] ?? '')}</th><td class="n mono">${sgn(a.alone)}</td><td class="n mono">${sgn(a.without)}</td></tr>`).join('')}</tbody></table>` : '';
  const pf = r.pairFeatures ? `<p class="muted mono">carry gap ${sgn(r.pairFeatures.carryGapPp)}pp · priced 6 m gap ${sgn(r.pairFeatures.expectedGapBp, 0)}bp · 20-bd change ${sgn(r.pairFeatures.expectedChgBp, 0)}bp · 2y gap ${sgn(r.pairFeatures.y2GapPp)}pp (context)</p>` : '';
  return `<table class="bev2-drv"><thead><tr><th>Driver</th><th>Family</th><th class="n">Contribution</th><th></th><th class="n">Fresh</th><th>Reading</th></tr></thead><tbody>${rows}</tbody></table>${pf}${miss}${att}`;
}
export function headHtml(P) {
  if (!P || P.empty) return `<p class="muted">${esc(P?.note ?? 'No V2 record yet.')}</p>`;
  const id = P.dataIdentity, gate = P.riskGate;
  return `<div class="bev2-head"><span class="chip ${P.phase === 'forward' ? 'pur' : 'gold'}">${P.phase === 'forward' ? 'official record' : 'technical trial'}</span>
<span class="chip" title="frozen specification ${esc(P.spec)}, configuration ${esc(String(P.configHash ?? '').slice(0, 10))}">frozen specification ${esc(P.spec)}</span>
<span class="chip ${id?.labelAgreement >= 0.95 ? 'up' : 'dn'}" title="V1's logic run on the V2 inputs, against the production V1 issue: a check that both read the same data">${fin(id?.labelAgreement) ? (id.labelAgreement >= 0.995 ? 'same inputs as V1 (replay matches)' : `V1 replay matches ${Math.round(id.labelAgreement * 100)}%`) : 'V1 replay not checked'}</span>
<span class="chip ${gate?.pass ? 'up' : 'gold'}" title="${esc(gate?.note ?? '')}">${gate?.pass ? 'one-risk-factor switch on (its test passed)' : 'one-risk-factor switch off (its test failed)'}</span>
${P.riskFactor && fin(P.riskFactor.score) ? `<span class="chip" title="the one risk factor, shown as context${P.riskFactor.usedInScore ? '' : '; not used in the score'}">risk factor ${sgn(P.riskFactor.score)}${P.riskFactor.usedInScore ? '' : ', context only'}</span>` : ''}</div>
<p class="muted">${P.date ? `Issue ${esc(P.date)}. ` : ''}${P.record?.officialDays != null ? `The forward record started ${esc(String(P.record.note ?? '').replace(/^official record from /, ''))} (${P.record.officialDays} official days so far). ` : `${esc(P.record?.note ?? '')} · `}${esc(NOTE)}</p>`;
}
export function tableHtml(P, { open = null, only = 'all' } = {}) {
  if (!P || P.empty || !P.markets?.length) return '';
  const rows = P.markets.filter(r => only === 'all' || (only === 'differ' && r.v1 && r.v2 && r.v1.dir !== r.v2.dir));
  return `<div class="bev2-tools"><button type="button" class="bev2-pill" data-only="all" aria-pressed="${only === 'all'}">All</button><button type="button" class="bev2-pill" data-only="differ" aria-pressed="${only === 'differ'}">Where V2 differs</button></div>
<table class="bev2-t"><thead><tr><th>Market</th><th>V1 (production)</th><th>V1 replay</th><th>V2</th><th class="n">Quality</th><th class="n">Agreement</th><th>Evidence for / against</th></tr></thead>
<tbody>${rows.map(r => rowHtml(r) + (open === r.market ? `<tr class="bev2-open"><td colspan="7">${driversHtml(r)}</td></tr>` : '')).join('') || '<tr><td colspan="7" class="muted">No market here.</td></tr>'}</tbody></table>`;
}
// ── Through the day (owner 2026-11-23; js/biasIntraday.js, GET /api/bias-engine-v2/intraday) ──
const ARROW = { BULLISH: ['▲', 'up'], BEARISH: ['▼', 'dn'], NEUTRAL: ['–', 'muted'] };
const word = d => ({ BULLISH: 'Bullish', BEARISH: 'Bearish', NEUTRAL: 'Neutral' }[d] ?? d);
const hhmm = iso => { const d = new Date(iso ?? ''); return Number.isFinite(d.getTime()) ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : ''; };
/** The day's timeline table for one engine ('v2' or 'v1r'); only = 'all' | 'shifted'. */
export function intradayHtml(T, { engine = 'v2', only = 'all', open = null, D = null, msg = '' } = {}) {
  if (!T) return '<p class="muted">Loading the day…</p>';
  if (T.ok === false) return `<p class="muted">${esc(T.error ?? 'Did not load.')}</p>`;
  const pts = T.points ?? [];
  const sched = T.schedule ? `<div class="bevi-sched"><span class="muted">Re-runs today</span> ${T.schedule.map(s => `<span class="chip ${s.state === 'done' ? 'up' : s.state === 'missed' ? 'dn' : s.state === 'due' ? 'gold' : ''}" title="${esc(s.state)}">${esc(s.slot)}</span>`).join(' ')}</div>` : '';
  const tools = `<div class="bev2-tools"><button type="button" class="bev2-pill" data-ieng="v2" aria-pressed="${engine === 'v2'}">V2</button><button type="button" class="bev2-pill" data-ieng="v1r" aria-pressed="${engine === 'v1r'}">V1 logic</button><span style="width:.6rem"></span><button type="button" class="bev2-pill" data-ionly="all" aria-pressed="${only === 'all'}">All</button><button type="button" class="bev2-pill" data-ionly="shifted" aria-pressed="${only === 'shifted'}">Only shifts</button></div>`;
  const form = fbFormHtml((T.markets ?? []).map(m => m.market), msg);
  const fastBox = fastHtml(T.fast);
  if (!pts.length) return `${tools}${sched}${fastBox}<p class="muted">Nothing stored for ${esc(T.date)} yet: the morning issue is written 05:30-06:00 London and the re-runs hourly from 07:00.</p>${form}`;
  const fbBy = {}; for (const r of T.fundabias ?? []) (fbBy[r.market] ??= []).push(r);
  const rows = (T.markets ?? []).filter(m => only === 'all' || (m.shifts?.[engine]?.length > 0) || fbBy[m.market]?.length > 1);
  const head = pts.map(p => `<th class="n" title="${esc(p === 'issue' ? `morning issue ${hhmm(T.issueAt)}` : `re-run at ${hhmm(T.slotTimes?.[p]) || p}`)}">${esc(p === 'issue' ? `Issue ${hhmm(T.issueAt)}` : p)}</th>`).join('');
  const body = rows.map(m => {
    const byPt = Object.fromEntries((m.calls?.[engine] ?? []).map(c => [c[0], c]));
    const shiftAt = new Set((m.shifts?.[engine] ?? []).map(s => s.at));
    const cells = pts.map(p => { const c = byPt[p]; if (!c) return '<td class="n muted">·</td>'; const [a, cls] = ARROW[c[1]] ?? ARROW.NEUTRAL;
      return `<td class="n${shiftAt.has(p) ? ' bevi-shift' : ''}" title="${esc(word(c[1]))}${c[1] !== 'NEUTRAL' && c[3] != null ? ` ${esc(c[3])}/10` : ''}, score ${sgn(c[2])}"><span class="${cls}">${a}</span></td>`; }).join('');
    const sh = (m.shifts?.[engine] ?? []).map(s => `<b>${esc(s.at)}</b> ${esc(word(s.from))} → ${esc(word(s.to))}`).join('; ');
    return `<tr data-im="${esc(m.market)}"><th>${esc(m.market)}</th>${cells}<td class="bevi-sh">${sh || '<span class="muted">held all day</span>'}${fbTrail(fbBy[m.market])}</td></tr>` + (open === m.market ? `<tr class="bev2-open"><td colspan="${pts.length + 2}">${detailHtml(D, engine)}</td></tr>` : '');
  }).join('');
  const n = (T.markets ?? []).filter(m => m.shifts?.[engine]?.length).length;
  return `${tools}${sched}${fastBox}<p class="muted">${esc(n)} of ${esc((T.markets ?? []).length)} markets changed direction since the morning issue (${engine === 'v2' ? 'V2' : 'V1 logic'}). A boxed cell is the re-run where it changed; tap a market for what moved. Most inputs are daily or slower, so a change usually follows a data release or a move in the faster price and risk readings.</p>
<div class="bevi-wrap"><table class="bev2-t bevi-t"><thead><tr><th>Market</th>${head}<th>Changes (London time)</th></tr></thead><tbody>${body || `<tr><td colspan="${pts.length + 2}" class="muted">No market changed direction today.</td></tr>`}</tbody></table></div>${form}`;
}
/** The fast layer (js/biasFastCore.js; GET .../intraday fast: { 'HH:MM': { at, calls: { MARKET: {z, dir, partU, partY, ownZ, flag} } } }). */
export function fastHtml(fast) {
  const slots = Object.keys(fast ?? {}).sort();
  if (!slots.length) return '<details class="bevi-fast"><summary><b>Fast layer</b> <span class="muted">· the dollar and US 2-year since 07:00 London, per market. First reading at 08:00.</span></summary></details>';
  const last = slots.at(-1), C = fast[last].calls ?? {}, z = x => (x == null ? '·' : `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}`);
  const ar = d => (d > 0 ? '<span class="up">▲</span>' : d < 0 ? '<span class="dn">▼</span>' : '<span class="muted">·</span>');
  const order = Object.keys(C).filter(m => C[m].z != null).sort((a, b) => (C[b].flag - C[a].flag) || Math.abs(C[b].z) - Math.abs(C[a].z));
  const rows = order.map(m => { const c = C[m];
    const trail = slots.map(sl => `<span title="${esc(sl)}">${ar(fast[sl].calls?.[m]?.dir ?? 0)}</span>`).join('');
    return `<tr><th>${esc(m)}</th><td class="n mono">${ar(c.dir)} ${z(c.z)}</td><td class="n mono muted">${z(c.partU)}</td><td class="n mono muted">${z(c.partY)}</td><td class="n mono">${z(c.ownZ)}</td><td class="bevi-tr">${trail}</td><td>${c.flag ? '<span class="chip gold" title="validated for the dollar pairs: about +0.08σ over the next 3 hours toward the drivers, more on big gaps">lagging its drivers</span>' : ''}</td></tr>`; }).join('');
  const missing = Object.keys(C).filter(m => C[m].z == null);
  return `<details class="bevi-fast" open><summary><b>Fast layer at ${esc(last)}</b> <span class="muted">· the dollar and US 2-year since 07:00 London, mapped through each market's hourly sensitivity (last 120 sessions)</span></summary>
<div class="bevi-wrap"><table class="bev2-t"><thead><tr><th>Market</th><th class="n" title="implied move since 07:00 in units of a typical move over that time; a call at 0.5 or more">Implied</th><th class="n">from dollar</th><th class="n">from 2y</th><th class="n" title="the market's own move since 07:00, same units">Market itself</th><th>Hourly calls 08:00 →</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="muted" style="margin:.3rem 0 0">Tested 2016-2026 (bias-fast-layer): the implied call alone leans right by about 2% of a 3-hour move, no better than following the market's own move, so it is context, not a call. The one part that held: a <b>dollar pair</b> that has gone against the rest of the dollar and the 2-year tends to catch up over the next 3 hours (flagged). Not gold or indices. Logged hourly for a forward record.${missing.length ? ` No reading: ${esc(missing.join(', '))}.` : ''}</p></details>`;
}
/** FundaBias rows for one market as a short trail: "07:38 ▼8 → 16:06 ▲7". */
export function fbTrail(rows) {
  if (!rows?.length) return '';
  return `<div class="bevi-fb"><span class="muted">FundaBias</span> ${rows.map(r => { const [a, cls] = ARROW[r.dir] ?? ARROW.NEUTRAL; return `<span title="${esc(word(r.dir))} ${esc(r.score10)}/10${r.note ? ` · ${esc(r.note)}` : ''}"><b>${esc(r.at)}</b> <span class="${cls}">${a}${esc(r.score10)}</span></span>`; }).join(' → ')}</div>`;
}
/** One market's drivers through the day (GET /api/bias-engine-v2/intraday?market=): what moved at each point, then the latest readings. */
export function detailHtml(D, engine = 'v2') {
  if (!D) return '<p class="muted">Loading the drivers…</p>';
  if (D.ok === false) return `<p class="muted">${esc(D.error ?? 'Did not load.')}</p>`;
  const pts = (D.points ?? []).filter(p => p[engine]);
  if (!pts.length) return '<p class="muted">No driver detail stored for this market yet (detail is kept from the re-runs after 2026-11-23 19:00).</p>';
  const moves = pts.slice(1).map(p => { const mv = p[`moved_${engine}`] ?? [];
    return mv.length ? `<li><b>${esc(p.point)}</b> ${mv.map(x => `${esc(x.driver)} ${sgn(x.from)} → ${sgn(x.to)}${x.now ? ` <span class="muted">(${esc(x.now)})</span>` : ''}`).join('; ')}</li>` : ''; }).join('');
  const last = pts.at(-1), rows = [...(last[engine] ?? [])].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(d => `<tr><th>${esc(d[0])}</th><td class="n mono ${d[1] > 0 ? 'up' : d[1] < 0 ? 'dn' : ''}">${sgn(d[1], 3)}</td><td class="muted">${esc(d[2])}</td></tr>`).join('');
  return `<div class="bevi-det"><p class="muted" style="margin:.2rem 0">What moved (${engine === 'v2' ? 'V2' : 'V1 logic'}), each point against the one before:</p>${moves ? `<ul class="bevi-mv">${moves}</ul>` : '<p class="muted">No driver changed by 0.005 or more through the day.</p>'}
<p class="muted" style="margin:.3rem 0 .1rem">Drivers at ${esc(last.point === 'issue' ? 'the morning issue' : last.point)}:</p><table class="bev2-drv"><tbody>${rows}</tbody></table></div>`;
}
/** The owner's form for logging a FundaBias reading with the time it was published. */
export function fbFormHtml(markets, msg = '') {
  const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  return `<div class="bevi-form"><span class="lbl">Log a FundaBias reading</span>
<input data-fb="market" list="bevi-mk" placeholder="Market (XAUUSD, EURUSD…)" size="12"><datalist id="bevi-mk">${(markets ?? []).map(m => `<option value="${esc(m)}">`).join('')}</datalist>
<select data-fb="dir"><option value="BULLISH">Bullish</option><option value="BEARISH">Bearish</option><option value="NEUTRAL">Neutral</option></select>
<input data-fb="score10" type="number" min="0" max="10" step="1" value="7" style="width:3.5rem" aria-label="score out of 10">
<input data-fb="at" type="time" value="${esc(now)}" aria-label="London time it was published">
<input data-fb="note" placeholder="headline (optional)" size="22">
<button type="button" class="bev2-pill" data-fbsave>Save</button><button type="button" class="bev2-pill" data-fbundo title="remove the last reading logged today for this market">Undo last</button>
<span class="muted" data-fbmsg>${esc(msg)}</span>
<p class="muted" style="margin:.2rem 0 0">Use the time FundaBias published it (the Discord post time). Shown beside the engines' calls; not scored. The scored FundaBias record stays the once-a-day log on the Bias process tab.</p></div>`;
}
export const CSS = `
.bev2-head{display:flex;flex-wrap:wrap;gap:.3rem;align-items:center;margin-bottom:.3rem}
.bev2-t,.bev2-drv,.bev2-att{width:100%;border-collapse:collapse;font-size:.82rem}
.bev2-t th,.bev2-t td,.bev2-drv th,.bev2-drv td,.bev2-att th,.bev2-att td{padding:.2rem .35rem;text-align:left;vertical-align:top}
.bev2-t tr[data-m]{cursor:pointer}.bev2-t tr[data-m]:hover{background:var(--bg2)}
.bev2-diff th{font-weight:700}
.bev2-bw{width:22%}.bev2-bar{display:inline-block;height:.55rem;border-radius:2px;background:currentColor;opacity:.75}
.bev2-tools{display:flex;gap:.3rem;margin:.4rem 0}
.bev2-pill{font:inherit;font-size:.78rem;padding:.15rem .55rem;border-radius:999px;border:1px solid var(--line);background:transparent;color:inherit;cursor:pointer}
.bev2-pill[aria-pressed="true"]{background:var(--pur);color:var(--bg)}
.bevi-wrap{overflow-x:auto}.bevi-t td,.bevi-t th{white-space:nowrap}.bevi-t td.bevi-sh{white-space:normal;min-width:12rem}
.bevi-shift{outline:1px solid var(--gold);outline-offset:-2px;border-radius:3px}.bevi-sched{display:flex;flex-wrap:wrap;gap:.25rem;align-items:center;margin:.2rem 0 .4rem}
.bevi-t tr[data-im]{cursor:pointer}.bevi-t tr[data-im]:hover{background:var(--bg2)}.bevi-fb{font-size:.76rem;margin-top:.15rem}.bevi-mv{margin:.2rem 0 .3rem 1rem;padding:0;font-size:.8rem}
.bevi-form{display:flex;flex-wrap:wrap;gap:.35rem;align-items:center;margin-top:.7rem;padding-top:.5rem;border-top:1px solid var(--line);font-size:.8rem}.bevi-form input,.bevi-form select{font:inherit;background:var(--bg2);color:inherit;border:1px solid var(--line);border-radius:6px;padding:.15rem .35rem}.bevi-form p{flex-basis:100%}
.bevi-fast{margin:.5rem 0;font-size:.82rem}.bevi-fast summary{cursor:pointer}.bevi-tr{letter-spacing:.05rem;white-space:nowrap}
@media (max-width:640px){.bev2-t th:nth-child(3),.bev2-t td:nth-child(3),.bev2-t th:nth-child(6),.bev2-t td:nth-child(6){display:none}.bev2-bw{width:30%}}
`;
/** Mount into `el` (owner only: the caller checks the surface). Idempotent. */
export function mount(el, { getJson, win = globalThis, doc = globalThis.document } = {}) {
  if (!el) return null;
  if (typeof win.deskSurfaceOn === 'function' && !win.deskSurfaceOn('panel.macro.bev2')) return null;
  if (!doc.getElementById('bev2-css')) { const st = doc.createElement('style'); st.id = 'bev2-css'; st.textContent = CSS; doc.head.appendChild(st); }
  const S = { P: null, open: null, only: 'all', mode: 'issue', T: null, engine: 'v2', ionly: 'all', iopen: null, D: null, msg: '' };
  const modes = () => `<div class="bev2-tools"><button type="button" class="bev2-pill" data-mode="issue" aria-pressed="${S.mode === 'issue'}">Morning issue</button><button type="button" class="bev2-pill" data-mode="day" aria-pressed="${S.mode === 'day'}">Through the day</button></div>`;
  const draw = () => { el.innerHTML = `<div class="ch"><span class="lbl">Bias Engine V2 · shadow</span><span class="r muted">owner only · V1 stays the production control</span></div>${headHtml(S.P)}${modes()}${S.mode === 'day' ? intradayHtml(S.T, { engine: S.engine, only: S.ionly, open: S.iopen, D: S.D, msg: S.msg }) : tableHtml(S.P, S)}`; };
  const loadDay = async () => { try { S.T = await getJson('/api/bias-engine-v2/intraday'); } catch (e) { S.T = { ok: false, error: `Did not load: ${e.message}` }; } draw(); };
  el.innerHTML = '<div class="ch"><span class="lbl">Bias Engine V2 · shadow</span></div><p class="muted">Loading…</p>';
  el.addEventListener('click', e => {
    const im = e.target.closest?.('tr[data-im]');
    if (im) { const m = im.dataset.im; if (S.iopen === m) { S.iopen = null; draw(); return; } S.iopen = m; S.D = null; draw();
      getJson(`/api/bias-engine-v2/intraday?market=${encodeURIComponent(m)}`).then(d => { if (S.iopen === m) { S.D = d; draw(); } }).catch(err => { S.D = { ok: false, error: err.message }; draw(); }); return; }
    const fbs = e.target.closest?.('button[data-fbsave],button[data-fbundo]');
    if (fbs) {
      const v = k => el.querySelector(`[data-fb="${k}"]`)?.value ?? '';
      const body = fbs.hasAttribute('data-fbundo') ? { market: v('market'), undo: true } : { market: v('market'), dir: v('dir'), score10: Number(v('score10')), at: v('at'), note: v('note') };
      fetch('/api/fundabias-log/intraday', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) })
        .then(r => r.json()).then(j => { S.msg = j.ok ? (body.undo ? `removed ${j.removed?.market} ${j.removed?.at}` : 'saved') : j.error; return loadDay(); })
        .catch(err => { S.msg = err.message; draw(); });
      return;
    }
    const md = e.target.closest?.('button[data-mode]'); if (md) { S.mode = md.dataset.mode; draw(); if (S.mode === 'day') loadDay(); return; }
    const ie = e.target.closest?.('button[data-ieng]'); if (ie) { S.engine = ie.dataset.ieng; draw(); return; }
    const io = e.target.closest?.('button[data-ionly]'); if (io) { S.ionly = io.dataset.ionly; draw(); return; }
    const b = e.target.closest?.('button[data-only]'); if (b) { S.only = b.dataset.only; draw(); return; }
    const tr = e.target.closest?.('tr[data-m]'); if (tr) { S.open = S.open === tr.dataset.m ? null : tr.dataset.m; draw(); }
  });
  (async () => { try { S.P = await getJson('/api/bias-engine-v2/compare'); } catch (e) { S.P = { empty: true, note: `Did not load: ${e.message}` }; } draw(); })();
  return { state: S, redraw: draw };
}
