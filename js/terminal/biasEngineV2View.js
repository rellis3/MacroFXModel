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
  const rows = ds.map(x => `<tr><th>${esc(x.leg ? `${x.leg} ` : '')}${esc(x.key)}${x.proxy ? ' <span class="chip">proxy</span>' : ''}</th><td class="muted">${esc(x.family)}</td><td class="n mono">${sgn(x.contrib, 3)}</td><td class="bev2-bw">${bar(x.contrib)}</td>
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
<span class="chip">spec ${esc(P.spec)}</span><span class="chip mono" title="the frozen configuration hash">${esc(String(P.configHash ?? '').slice(0, 10))}</span>
<span class="chip ${id?.labelAgreement >= 0.95 ? 'up' : 'dn'}" title="V1's logic on the V2 snapshot against the production V1 issue">V1 replay agrees ${fin(id?.labelAgreement) ? `${Math.round(id.labelAgreement * 100)}%` : '?'}</span>
<span class="chip ${gate?.pass ? 'up' : 'gold'}" title="${esc(gate?.note ?? '')}">risk gate ${gate?.pass ? 'passed (F4 on)' : 'failed (F4 off)'}</span>
${P.riskFactor && fin(P.riskFactor.score) ? `<span class="chip" title="the one risk factor, shown as context${P.riskFactor.usedInScore ? '' : '; not used in the score'}">F ${sgn(P.riskFactor.score)}</span>` : ''}</div>
<p class="muted">${esc(P.record?.note ?? '')} · ${esc(NOTE)}</p>`;
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
export function intradayHtml(T, { engine = 'v2', only = 'all' } = {}) {
  if (!T) return '<p class="muted">Loading the day…</p>';
  if (T.ok === false) return `<p class="muted">${esc(T.error ?? 'Did not load.')}</p>`;
  const pts = T.points ?? [];
  const sched = T.schedule ? `<div class="bevi-sched"><span class="muted">Re-runs today</span> ${T.schedule.map(s => `<span class="chip ${s.state === 'done' ? 'up' : s.state === 'missed' ? 'dn' : s.state === 'due' ? 'gold' : ''}" title="${esc(s.state)}">${esc(s.slot)}</span>`).join(' ')}</div>` : '';
  const tools = `<div class="bev2-tools"><button type="button" class="bev2-pill" data-ieng="v2" aria-pressed="${engine === 'v2'}">V2</button><button type="button" class="bev2-pill" data-ieng="v1r" aria-pressed="${engine === 'v1r'}">V1 logic</button><span style="width:.6rem"></span><button type="button" class="bev2-pill" data-ionly="all" aria-pressed="${only === 'all'}">All</button><button type="button" class="bev2-pill" data-ionly="shifted" aria-pressed="${only === 'shifted'}">Only shifts</button></div>`;
  if (!pts.length) return `${tools}${sched}<p class="muted">Nothing stored for ${esc(T.date)} yet: the morning issue is written 05:30-06:00 London and the re-runs hourly from 07:00.</p>`;
  const rows = (T.markets ?? []).filter(m => only === 'all' || (m.shifts?.[engine]?.length > 0));
  const head = pts.map(p => `<th class="n" title="${esc(p === 'issue' ? `morning issue ${hhmm(T.issueAt)}` : `re-run at ${hhmm(T.slotTimes?.[p]) || p}`)}">${esc(p === 'issue' ? `Issue ${hhmm(T.issueAt)}` : p)}</th>`).join('');
  const body = rows.map(m => {
    const byPt = Object.fromEntries((m.calls?.[engine] ?? []).map(c => [c[0], c]));
    const shiftAt = new Set((m.shifts?.[engine] ?? []).map(s => s.at));
    const cells = pts.map(p => { const c = byPt[p]; if (!c) return '<td class="n muted">·</td>'; const [a, cls] = ARROW[c[1]] ?? ARROW.NEUTRAL;
      return `<td class="n${shiftAt.has(p) ? ' bevi-shift' : ''}" title="${esc(word(c[1]))}${c[1] !== 'NEUTRAL' && c[3] != null ? ` ${esc(c[3])}/10` : ''}, score ${sgn(c[2])}"><span class="${cls}">${a}</span></td>`; }).join('');
    const sh = (m.shifts?.[engine] ?? []).map(s => `<b>${esc(s.at)}</b> ${esc(word(s.from))} → ${esc(word(s.to))}`).join('; ');
    return `<tr><th>${esc(m.market)}</th>${cells}<td class="bevi-sh">${sh || '<span class="muted">held all day</span>'}</td></tr>`;
  }).join('');
  const n = (T.markets ?? []).filter(m => m.shifts?.[engine]?.length).length;
  return `${tools}${sched}<p class="muted">${esc(n)} of ${esc((T.markets ?? []).length)} markets changed direction since the morning issue (${engine === 'v2' ? 'V2' : 'V1 logic'}). A boxed cell is the re-run where it changed. Most inputs are daily or slower, so a change usually follows a data release or a move in the faster price and risk readings.</p>
<div class="bevi-wrap"><table class="bev2-t bevi-t"><thead><tr><th>Market</th>${head}<th>Changes (London time)</th></tr></thead><tbody>${body || `<tr><td colspan="${pts.length + 2}" class="muted">No market changed direction today.</td></tr>`}</tbody></table></div>`;
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
@media (max-width:640px){.bev2-t th:nth-child(3),.bev2-t td:nth-child(3),.bev2-t th:nth-child(6),.bev2-t td:nth-child(6){display:none}.bev2-bw{width:30%}}
`;
/** Mount into `el` (owner only: the caller checks the surface). Idempotent. */
export function mount(el, { getJson, win = globalThis, doc = globalThis.document } = {}) {
  if (!el) return null;
  if (typeof win.deskSurfaceOn === 'function' && !win.deskSurfaceOn('panel.macro.bev2')) return null;
  if (!doc.getElementById('bev2-css')) { const st = doc.createElement('style'); st.id = 'bev2-css'; st.textContent = CSS; doc.head.appendChild(st); }
  const S = { P: null, open: null, only: 'all', mode: 'issue', T: null, engine: 'v2', ionly: 'all' };
  const modes = () => `<div class="bev2-tools"><button type="button" class="bev2-pill" data-mode="issue" aria-pressed="${S.mode === 'issue'}">Morning issue</button><button type="button" class="bev2-pill" data-mode="day" aria-pressed="${S.mode === 'day'}">Through the day</button></div>`;
  const draw = () => { el.innerHTML = `<div class="ch"><span class="lbl">Bias Engine V2 · shadow</span><span class="r muted">owner only · V1 stays the production control</span></div>${headHtml(S.P)}${modes()}${S.mode === 'day' ? intradayHtml(S.T, { engine: S.engine, only: S.ionly }) : tableHtml(S.P, S)}`; };
  const loadDay = async () => { try { S.T = await getJson('/api/bias-engine-v2/intraday'); } catch (e) { S.T = { ok: false, error: `Did not load: ${e.message}` }; } draw(); };
  el.innerHTML = '<div class="ch"><span class="lbl">Bias Engine V2 · shadow</span></div><p class="muted">Loading…</p>';
  el.addEventListener('click', e => {
    const md = e.target.closest?.('button[data-mode]'); if (md) { S.mode = md.dataset.mode; draw(); if (S.mode === 'day') loadDay(); return; }
    const ie = e.target.closest?.('button[data-ieng]'); if (ie) { S.engine = ie.dataset.ieng; draw(); return; }
    const io = e.target.closest?.('button[data-ionly]'); if (io) { S.ionly = io.dataset.ionly; draw(); return; }
    const b = e.target.closest?.('button[data-only]'); if (b) { S.only = b.dataset.only; draw(); return; }
    const tr = e.target.closest?.('tr[data-m]'); if (tr) { S.open = S.open === tr.dataset.m ? null : tr.dataset.m; draw(); }
  });
  (async () => { try { S.P = await getJson('/api/bias-engine-v2/compare'); } catch (e) { S.P = { empty: true, note: `Did not load: ${e.message}` }; } draw(); })();
  return { state: S, redraw: draw };
}
