/**
 * The Forecast auditor card (terminal Research tab and Desk Office Research tab): the forward calibration table, the
 * pinball against plain, the drift alarms, the rolling exceedance per rung, and the history backtest control. The HTML
 * builders are pure (tested in js/forecastAuditView.test.mjs); `mount` touches the DOM.
 *
 * Monitoring, not a verdict: nothing here changes a forecast. A history re-test is an exploratory backtest, never banked.
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fin = v => v != null && Number.isFinite(+v);
const pc = (v, dp = 0) => (fin(v) ? `${(v * 100).toFixed(dp)}%` : '–');
const RUNGS = ['p50', 'p75', 'p90'], TARGET = [0.5, 0.25, 0.1];
export const QNAME = { hl: 'H-L', oh: 'O-H', ol: 'O-L' };
const WNAME = { r20: 'last 20', r60: 'last 60', r120: 'last 120', all: 'since start' };
const SET_COLOR = { plain: 'var(--tx3, #888)', persist: 'var(--gold, var(--acc, #e0a339))', ivadj: 'var(--pur, #8b7cf6)', har800: 'var(--tx2, #aaa)', sqrt: 'var(--tx3, #888)', rev: 'var(--gold, var(--acc, #e0a339))' };
const inp = 'background:var(--bg3);color:var(--tx);border:1px solid var(--line2);border-radius:5px;padding:4px 6px;font:13px inherit;max-width:100%';
const LBOX = '2026-08-21';

/** One rung cell: the rate, green inside its band, red outside (TIGHT above, WIDE below). */
export function rateCell(c, { ci = false } = {}) {
  if (!c) return '<td class="n">–</td>';
  const col = c.out ? 'var(--dn, #e5534b)' : 'var(--up, #3fb27f)';
  const tip = `band ${pc(c.lo, 1)}-${pc(c.hi, 1)}${c.ci ? `; 95% interval ${pc(c.ci[0], 1)}-${pc(c.ci[1], 1)}` : ''}${c.out ? (c.out > 0 ? ' — TIGHT' : ' — WIDE') : ''}`;
  return `<td class="n" title="${esc(tip)}" style="color:${col}">${pc(c.rate, 1)}${c.out ? (c.out > 0 ? '↑' : '↓') : ''}${ci && c.ci ? `<br><span class="muted" style="font-size:10.5px">${pc(c.ci[0])}-${pc(c.ci[1])}</span>` : ''}</td>`;
}
const ratioTxt = (r, ci) => (fin(r) ? `${(+r).toFixed(3)}${ci ? ` <span class="muted" style="font-size:10.5px">[${(+ci[0]).toFixed(3)}, ${(+ci[1]).toFixed(3)}]</span>` : ''}` : '–');

/** The forward calibration table: one row per line set, the chosen quantity's three rungs, pinball and ratio. */
export function calTableHtml(audit, { q = 'hl', win = 'r60' } = {}) {
  const sets = Object.entries(audit?.sets ?? {});
  if (!sets.length) return '<p class="muted">No scored sessions yet.</p>';
  const rows = sets.map(([k, s]) => {
    if (s.lockbox) return `<tr><td>${esc(s.label)}</td><td colspan="6" class="muted" style="font-size:12px" title="${esc(s.note ?? '')}">not scored (lockbox, ${s.sessions ?? 0} sessions held back)</td></tr>`;
    const c = s.windows?.[win];
    if (!c) return `<tr><td>${esc(s.label)}</td><td colspan="6" class="muted">no rows</td></tr>`;
    return `<tr><td><span style="color:${SET_COLOR[k] ?? 'inherit'}">●</span> ${esc(s.label)}${s.horizon === 'weekly' ? ' <span class="muted">(weeks)</span>' : ''}</td><td class="n">${c.sessions}</td>${c[q].map(x => rateCell(x)).join('')}<td class="n">${fin(c.pinball) ? c.pinball.toFixed(3) : '–'}</td><td class="n">${ratioTxt(c.ratio)}</td></tr>`;
  }).join('');
  return `<div style="overflow-x:auto"><table style="width:100%;font-size:12.5px"><thead><tr><th>Line set</th><th class="n">Days</th>${RUNGS.map((r, i) => `<th class="n">${QNAME[q]} ${r}<br><span class="muted" style="font-weight:400">${pc(TARGET[i])}</span></th>`).join('')}<th class="n">Pinball</th><th class="n">÷ base</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/** Active drift alarms. */
export function alarmsHtml(alarms) {
  if (!alarms?.length) return '<p style="margin:6px 0"><span class="chip ok up">no drift</span> <span class="muted">every rung inside its band and no pinball alarm over the last 60 sessions (or too few sessions to judge).</span></p>';
  return `<div style="margin:6px 0">${alarms.map(a => `<div style="margin:3px 0"><span class="chip bad dn">drift</span> ${esc(a.text)}</div>`).join('')}</div>`;
}

/** A small chart of one rung's rolling exceedance for several line sets, with the target dashed. */
export function rollingSvg(series, rungIdx, { w = 104, h = 60 } = {}) {
  const lines = Object.entries(series ?? {}).filter(([, s]) => s?.length > 1);
  const tgt = TARGET[rungIdx];
  if (!lines.length) return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="no data"><text x="4" y="${h / 2}" font-size="10" fill="var(--tx3, #888)">not enough days</text></svg>`;
  const vals = lines.flatMap(([, s]) => s.map(p => p.r?.[rungIdx]).filter(fin));
  const top = Math.max(tgt * 2, ...vals) * 1.05;
  const y = v => (h - 12 - (v / top) * (h - 16)).toFixed(1);
  const paths = lines.map(([k, s]) => {
    const pts = s.map((p, i) => (fin(p.r?.[rungIdx]) ? `${(i / (s.length - 1) * (w - 2) + 1).toFixed(1)},${y(p.r[rungIdx])}` : null)).filter(Boolean);
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="${SET_COLOR[k] ?? 'currentColor'}" stroke-width="1.4"><title>${esc(k)}</title></polyline>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="rolling exceedance ${RUNGS[rungIdx]}" style="max-width:100%">
<line x1="0" x2="${w}" y1="${y(tgt)}" y2="${y(tgt)}" stroke="var(--line2, #555)" stroke-dasharray="3 3"/>${paths}
<text x="2" y="${h - 1}" font-size="9.5" fill="var(--tx3, #888)">${RUNGS[rungIdx]} · target ${pc(tgt)}</text></svg>`;
}
export function rollingRowHtml(seriesBySet, note) {
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${[0, 1, 2].map(i => rollingSvg(seriesBySet, i)).join('')}</div><p class="muted" style="font-size:11.5px;margin:2px 0">${esc(note)}</p>`;
}

/** Regime / event / year / instrument split of one cell map, for one quantity. */
export function splitTableHtml(title, cells, q = 'hl', { ci = false } = {}) {
  const ent = Object.entries(cells ?? {}).filter(([, c]) => c);
  if (!ent.length) return '';
  return `<div style="overflow-x:auto;margin-top:6px"><table style="width:100%;font-size:12px"><thead><tr><th>${esc(title)}</th><th class="n">Rows</th>${RUNGS.map(r => `<th class="n">${QNAME[q]} ${r}</th>`).join('')}<th class="n">÷ base</th></tr></thead><tbody>${ent.map(([g, c]) => `<tr><td>${esc(g)}</td><td class="n">${c.n}</td>${c[q].map(x => rateCell(x, { ci })).join('')}<td class="n">${ratioTxt(c.ratio)}</td></tr>`).join('')}</tbody></table></div>`;
}

/** The backtest form. meta: GET /api/forecast-audit/backtest. */
export function backtestFormHtml(meta) {
  const sets = Object.entries(meta?.sets ?? {});
  const insts = meta?.instruments ?? [];
  const busy = meta?.running?.length;
  return `<div style="display:grid;gap:6px;margin-top:6px">
<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
<label>Line set <select id="fa-set" style="${inp}">${sets.filter(([k]) => k !== 'plain').map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}<option value="plain">Plain only</option></select></label>
<label>Instruments <select id="fa-inst" style="${inp}"><option value="all">All (${insts.length})</option><option value="IV13">USD majors, gold, indices</option>${insts.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select></label></div>
<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
<label>From <input id="fa-from" type="date" value="2020-10-01" min="2016-01-01" max="${LBOX}" style="${inp}"></label>
<label>To <input id="fa-to" type="date" value="${LBOX}" min="2016-01-01" max="${LBOX}" style="${inp}"></label>
<button class="btn" id="fa-run"${busy ? ' disabled' : ''}>${busy ? 'A re-test is running…' : 'Re-test over history'}</button></div>
<p class="muted" style="margin:0;font-size:12px">Compared with plain on the same days. Never past ${LBOX} (the lockbox date). Takes a few minutes for all instruments. ${esc(meta?.label ?? '')}</p></div>`;
}

/** One backtest result in full. */
export function backtestResultHtml(r, { q = 'hl' } = {}) {
  if (!r) return '';
  if (r.ok === false) return `<p class="muted">${esc(r.error ?? 'failed')}</p>`;
  const p = r.params ?? {}, S = r.summary ?? {};
  const main = p.sets?.find(s => s !== 'plain') ?? 'plain';
  const rows = Object.entries(S).map(([k, s]) => (s.empty ? `<tr><td>${esc(s.label)}</td><td colspan="5" class="muted">no rows (no implied-vol history for these instruments)</td></tr>`
    : `<tr><td><span style="color:${SET_COLOR[k] ?? 'inherit'}">●</span> ${esc(s.label)}</td><td class="n">${s.pooled.n}</td>${s.pooled[q].map(x => rateCell(x, { ci: true })).join('')}<td class="n">${ratioTxt(s.pooled.ratio, s.pooled.ratioCi)}</td></tr>`)).join('');
  const roll = Object.fromEntries(Object.entries(S).filter(([, s]) => s.rolling?.[q]).map(([k, s]) => [k, s.rolling[q]]));
  const M = S[main] ?? {};
  return `<div style="border-left:3px solid var(--line2);padding:6px 10px;margin:8px 0">
<p style="margin:0 0 4px"><b>${esc(M.label ?? main)}</b> · ${esc((p.instruments ?? []).length > 3 ? `${p.instruments.length} instruments` : (p.instruments ?? []).join(', '))} · ${esc(p.from)} → ${esc(p.to)} <span class="chip warn gold">exploratory backtest</span></p>
<div style="overflow-x:auto"><table style="width:100%;font-size:12.5px"><thead><tr><th>Line set</th><th class="n">Rows</th>${RUNGS.map((x, i) => `<th class="n">${QNAME[q]} ${x}<br><span class="muted" style="font-weight:400">${pc(TARGET[i])}</span></th>`).join('')}<th class="n">Pinball ÷ plain</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="muted" style="font-size:11.5px;margin:2px 0">Under each rate: its 95% date-block bootstrap interval (B ${r.nBoot}, block ${r.meanBlock}, seed ${r.seed}). Pinball ÷ plain below 1 = better than plain on the same rows.</p>
${rollingRowHtml(roll, `Rolling 60-session ${QNAME[q]} exceedance, all instruments pooled. Dashed = target.`)}
<details><summary class="muted">${esc(M.label ?? main)} by regime, event, year and instrument</summary>
${splitTableHtml('Regime', M.regime, q)}${splitTableHtml('Event', M.event, q)}${splitTableHtml('Year', M.byYear, q)}${splitTableHtml('Instrument', M.byInst, q)}</details>
<details><summary class="muted">How this was run</summary><ul style="margin:4px 0;padding-left:18px;font-size:12px">${(r.notes ?? []).map(n => `<li>${esc(n)}</li>`).join('')}</ul>
<p class="muted" style="font-size:12px">${Object.entries(r.coverage ?? {}).map(([n, c]) => `${esc(n)} ${c.error ? `(failed: ${esc(c.error)})` : c.sessions}`).join(' · ')}</p></details></div>`;
}

/** The whole card body (before the backtest part is filled). */
export function cardHtml(d, { q = 'hl', win = 'r60' } = {}) {
  if (!d?.ok) return `<h2>Forecast auditor</h2><p class="muted">${esc(d?.error ?? 'not available')}</p>`;
  const A = d.audit;
  const daily = Object.fromEntries(Object.entries(A?.sets ?? {}).filter(([, s]) => s.horizon === 'daily' && s.rolling?.[q]).map(([k, s]) => [k, s.rolling[q]]));
  const sel = (id, opts, cur) => `<select id="${id}" style="${inp}">${Object.entries(opts).map(([k, l]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const focus = A?.sets?.persist ?? A?.sets?.plain;
  return `<h2>Forecast auditor <i>do the lines hold up? monitoring, not a verdict</i></h2>
${A ? `<p class="muted" style="margin:2px 0;font-size:12px">${A.sessions} scored sessions since ${esc(A.since ?? '–')} (last ${esc(A.last ?? '–')}), ${A.weeks} weeks. Rates are how often the day passed each line; bands are binomial 95% with instruments counted as ~${A.rho} correlated.</p>` : '<p class="muted">The forward scorecard has no scored session yet.</p>'}
<div style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0">${sel('fa-q', QNAME, q)}${sel('fa-w', WNAME, win)}</div>
<div id="fa-table">${A ? calTableHtml(A, { q, win }) : ''}</div>
${A ? alarmsHtml(A.alarms) : ''}
${A ? rollingRowHtml(daily, `Rolling 20-session ${QNAME[q]} exceedance: plain grey, chosen ★ gold, IV-adjusted purple. Dashed = target.`) : ''}
${focus?.regime ? `<details><summary class="muted">${esc(focus.label)} by regime and event day (since start)</summary>${splitTableHtml('Regime', focus.regime, q)}${splitTableHtml('Event', focus.event, q)}</details>` : ''}
<p style="margin:6px 0;font-size:12.5px"><label><input type="checkbox" id="fa-tg"${d.telegram?.optIn ? ' checked' : ''}> Telegram drift messages</label> <span class="muted">${d.telegram?.muted ? '(muted in ⚙ Alerts)' : '(off by default)'}</span></p>
<h3 style="font-size:14px;margin:14px 0 4px">Re-test a line set over history</h3>
<div id="fa-bt"></div><div id="fa-bt-out"></div><div id="fa-bt-list"></div>`;
}
/** The stored re-tests. */
export function runsListHtml(meta) {
  const runs = meta?.runs ?? [];
  if (!runs.length) return '';
  return `<details style="margin-top:6px"><summary class="muted">Earlier re-tests (${runs.length})</summary>${runs.map(x => `<div style="font-size:12px;margin:2px 0"><a href="#" data-faopen="${esc(x.id)}">${esc(String(x.ranAt ?? '').slice(0, 10))}</a> ${esc((x.params?.sets ?? []).join(' + '))} · ${esc((x.params?.instruments ?? []).length)} instruments · ${esc(x.params?.from)} → ${esc(x.params?.to)}</div>`).join('')}</details>`;
}

// ── DOM ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Mount the card into `el`. Each mount is independent (the terminal and the Desk Office each have one). */
export async function mount(el, { getJson } = {}) {
  const st = { q: 'hl', win: 'r60', data: null, meta: null, last: null, timer: null };
  const $ = s => el.querySelector(s);
  const draw = () => {
    el.innerHTML = cardHtml(st.data, st);
    const q = $('#fa-q'), w = $('#fa-w'), tg = $('#fa-tg');
    if (q) q.onchange = () => { st.q = q.value; draw(); };
    if (w) w.onchange = () => { st.win = w.value; draw(); };
    if (tg) tg.onchange = async () => {
      const r = await getJson('/api/forecast-audit/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: tg.checked }) });
      if (r?.ok) st.data.telegram = r.telegram; else tg.checked = !tg.checked;
    };
    drawBt();
  };
  const drawBt = () => {
    const box = $('#fa-bt'); if (!box) return;
    box.innerHTML = st.meta?.ok ? backtestFormHtml(st.meta) : `<p class="muted">${esc(st.meta?.error ?? 'Loading…')}</p>`;
    if (st.last) $('#fa-bt-out').innerHTML = backtestResultHtml(st.last, st);
    $('#fa-bt-list').innerHTML = runsListHtml(st.meta);
    el.querySelectorAll('[data-faopen]').forEach(a => (a.onclick = e => { e.preventDefault(); openRun(a.dataset.faopen); }));
    const run = $('#fa-run');
    if (run) run.onclick = async () => {
      const set = $('#fa-set').value, inst = $('#fa-inst').value;
      const body = { sets: [set], instruments: inst === 'all' || inst === 'IV13' ? inst : [inst], from: $('#fa-from').value, to: $('#fa-to').value };
      run.disabled = true; run.textContent = 'Starting…';
      const r = await getJson('/api/forecast-audit/backtest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r?.ok) { $('#fa-bt-out').innerHTML = `<p class="muted">${esc(r?.error ?? 'failed')}</p>`; run.disabled = false; run.textContent = 'Re-test over history'; return; }
      poll(r.id);
    };
  };
  const openRun = async id => {
    const r = await getJson(`/api/forecast-audit/backtest?id=${encodeURIComponent(id)}`);
    if (r?.status === 'done') { st.last = r.result; drawBt(); }
  };
  const poll = async id => {
    clearTimeout(st.timer);
    const r = await getJson(`/api/forecast-audit/backtest?id=${encodeURIComponent(id)}`);
    const out = $('#fa-bt-out'); if (!out) return;
    if (r?.status === 'running') {
      out.innerHTML = `<p class="muted">Running: ${esc(r.progress ?? '')} · ${r.elapsed ?? 0} s</p>`;
      st.timer = setTimeout(() => poll(id), 4000);
      return;
    }
    if (r?.status === 'done') st.last = r.result;
    else out.innerHTML = `<p class="muted">${esc(r?.error ?? 'failed')}</p>`;
    st.meta = await getJson('/api/forecast-audit/backtest');
    drawBt();
  };
  el.innerHTML = '<h2>Forecast auditor</h2><p class="muted">Loading…</p>';
  [st.data, st.meta] = await Promise.all([getJson('/api/forecast-audit'), getJson('/api/forecast-audit/backtest')]);
  draw();
  const running = st.meta?.running?.[0];
  if (running) poll(running.id);
  return st;
}
