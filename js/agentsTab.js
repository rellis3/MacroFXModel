/**
 * Bot Config > Agents tab (data-tab="agents"): every agent, how they hand work to each other (inline-SVG flow charts drawn from the registry),
 * and the on/off switches and caps. Data comes from GET /api/agents; a switch calls POST /api/agents/toggle.
 *
 * Pure builders (cardHtml, switchHtml, capHtml, legendHtml) are exported for node tests; everything that touches the DOM is inside init().
 * No external libraries. Styles are the .ag-* block in bot-config.html (page CSS variables, so light and dark both work).
 */
import { flowSvg, modelBadge } from './agentFlowSvg.js';

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SRC = { setting: 'saved on this page', env: 'from the Railway environment variable', default: 'default (nothing saved)' };

export function capHtml(c) {
  if (!c) return '';
  const pct = c.cap > 0 ? Math.min(100, Math.round((c.used / c.cap) * 100)) : 0;
  return `<div class="ag-row"><span class="ag-k">Cap</span><div class="ag-cap"><div class="ag-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${c.cap}" aria-valuenow="${c.used}"><i style="width:${pct}%" class="${pct >= 90 ? 'hot' : ''}"></i></div>`
    + `<span class="ag-capn">${Number(c.used).toLocaleString()} of ${Number(c.cap).toLocaleString()} ${esc(c.label)} used${c.known ? '' : ' (none yet)'}</span></div></div>`;
}

export function switchHtml(id, def, st, { libraryOn = true } = {}) {
  const on = !!st?.value;
  const note = id === 'libraryLibrarian' ? `<div class="ag-note"${libraryOn ? ' hidden' : ''}>Has no effect while the library switch above is off.</div>` : '';
  return `<div class="ag-sw-row" data-sw-row="${esc(id)}"><button type="button" class="ag-sw${on ? ' on' : ''}" role="switch" aria-checked="${on}" data-toggle="${esc(id)}" aria-label="${esc(def.label)}"><span></span></button>`
    + `<div class="ag-sw-txt"><b>${esc(def.label)}</b> <span class="ag-state" data-state="${esc(id)}">${on ? 'ON' : 'OFF'}</span>`
    + `<div class="ag-sub">${esc(def.text)}</div>`
    + (def.spends ? `<div class="ag-spendnote">Spends money when on: it makes paid model calls (DeepSeek, within the cap shown).</div>` : '')
    + `<div class="ag-sub ag-src" data-src="${esc(id)}">Value: ${esc(SRC[st?.source] ?? SRC.default)}${def.env && st?.source !== 'setting' ? '' : (def.env ? ` (the ${esc(def.env)} variable is now overridden by this switch)` : '')}</div>`
    + `<div class="ag-msg" data-msg="${esc(id)}" aria-live="polite"></div>${note}</div></div>`;
}

export function legendHtml() {
  return '<div class="ag-legend"><span><i class="l data"></i>data</span><span><i class="l control"></i>someone presses a button / sets it off</span><span><i class="l opt"></i>optional (switched)</span><span><i class="l plan"></i>planned, not built</span><span><b class="ag-dollar">$</b>can spend model money</span></div>';
}

const list = (a, empty = 'nothing') => (a?.length ? `<ul class="ag-ul">${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `<span class="ag-sub">${empty}</span>`);

export function cardHtml(a, D, { open = false } = {}) {
  const m = a.modelTask ? D.models?.[a.modelTask] : null;
  const edgesIn = D.edges.filter(e => e.to === a.id), edgesOut = D.edges.filter(e => e.from === a.id);
  const nm = id => D.points?.[id]?.name ?? D.agents.find(x => x.id === id)?.name ?? id;
  const link = id => (D.agents.some(x => x.id === id) ? `<a href="#agent-${esc(id)}" data-open-agent="${esc(id)}">${esc(nm(id))}</a>` : esc(nm(id)));
  const job = a.job ? D.jobs?.[a.job] : null;
  const togs = (a.toggles ?? []).filter(t => D.toggleDefs?.[t]);
  const libOn = !!D.toggles?.libraryContext?.value;
  const anyOn = togs.some(t => D.toggles[t]?.value);
  const badges = [
    a.planned ? '<span class="ag-b plan">planned</span>' : '',
    a.modelTask && m ? `<span class="ag-b model">${String(m.model ?? '').toLowerCase().includes(String(m.provider ?? '#').toLowerCase()) ? '' : `${esc(m.provider ?? '')} `}${esc(modelBadge(m) ?? '')}</span>` : (a.modelTask ? `<span class="ag-b model">${esc(a.modelTask)}</span>` : (a.planned ? '' : '<span class="ag-b none">no model</span>')),
    a.spends && !a.planned ? '<span class="ag-b spend" title="can spend model money">$</span>' : '',
    togs.length ? `<span class="ag-b ${anyOn ? 'on' : 'off'}">${anyOn ? 'switch on' : 'switch off'}</span>` : '',
  ].join('');
  return `<details class="ag-card ag-g-${esc(a.group)}${a.planned ? ' ag-planned' : ''}" id="agent-${esc(a.id)}" data-agent="${esc(a.id)}"${open ? ' open' : ''}>`
    + `<summary><span class="ag-dot"></span><span class="ag-name">${esc(a.name)}</span><span class="ag-badges">${badges}</span></summary><div class="ag-body">`
    + `<p class="ag-purpose">${esc(a.purpose)}</p>`
    + `<div class="ag-row"><span class="ag-k">Starts when</span><span>${esc(a.trigger)}</span></div>`
    + (job ? `<div class="ag-row"><span class="ag-k">Schedule</span><span>${job.railwayOn === false ? 'not scheduled in Railway' : (job.pageOn ? 'running' : 'paused on the AI models page')}${job.lastRunAt ? `, last run ${esc(new Date(job.lastRunAt).toISOString().replace('T', ' ').slice(0, 16))} UTC (this instance)` : ''}</span></div>` : '')
    + `<div class="ag-row"><span class="ag-k">Reads</span>${list(a.reads)}</div>`
    + `<div class="ag-row"><span class="ag-k">Writes</span>${list(a.writes)}</div>`
    + `<div class="ag-row"><span class="ag-k">Model</span><span>${a.modelTask ? `${m ? `<b>${esc(m.provider)} / ${esc(m.model)}</b> ` : ''}(task <code>${esc(a.modelTask)}</code>) <a href="#tab-aimodels" data-goto-tab="aimodels">change on the AI models tab</a>` : (a.planned ? 'would need a model' : 'none: this agent makes no model call')}</span></div>`
    + capHtml(D.caps?.[a.id])
    + (edgesIn.length ? `<div class="ag-row"><span class="ag-k">Gets from</span><span>${edgesIn.map(e => `${link(e.from)} <i class="ag-lab">${esc(e.label)}</i>`).join(' &middot; ')}</span></div>` : '')
    + (edgesOut.length ? `<div class="ag-row"><span class="ag-k">Hands to</span><span>${edgesOut.map(e => `${link(e.to)} <i class="ag-lab">${esc(e.label)}</i>`).join(' &middot; ')}</span></div>` : '')
    + (a.links?.length ? `<div class="ag-row"><span class="ag-k">Pages</span><span>${a.links.map(l => `<a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join(' &middot; ')}</span></div>` : '')
    + (togs.length ? `<div class="ag-switches">${togs.map(t => switchHtml(t, D.toggleDefs[t], D.toggles[t], { libraryOn: libOn })).join('')}</div>` : '')
    + `</div></details>`;
}

// ── the DOM side ────────────────────────────────────────────────────────────────────────────────────────────────
export function init(doc = document, fetchFn = (...a) => fetch(...a)) {
  const $ = id => doc.getElementById(id);
  const root = $('agentsRoot');
  if (!root) return null;
  let D = null, flowId = null, selected = null, loading = false;
  const open = new Set();

  const render = () => {
    if (!D) return;
    const flow = D.flows.find(f => f.id === flowId) ?? D.flows[0];
    flowId = flow.id;
    const byId = Object.fromEntries(D.agents.map(a => [a.id, a]));
    $('agChips').innerHTML = D.flows.map(f => `<button type="button" class="ag-chip${f.id === flowId ? ' active' : ''}" data-flow="${esc(f.id)}">${esc(f.name)}</button>`).join('');
    $('agBlurb').textContent = flow.blurb;
    $('agChart').innerHTML = flowSvg(flow, { models: D.models, agents: byId, selected, uid: 'ag' });
    $('agLegend').innerHTML = legendHtml();
    renderInfo(flow);
    const pending = D.agents.filter(a => a.planned).length;
    const spend = D.spendTodayUsd != null ? ` Model spend today (Anthropic list prices): $${D.spendTodayUsd}.` : '';
    $('agSummary').textContent = `${D.agents.length - pending} agents${pending ? ` and ${pending} planned` : ''}.${spend}`;
    const cards = D.groups.map(g => {
      const rows = D.agents.filter(a => a.group === g);
      if (!rows.length) return '';
      return `<h3 class="ag-gh ag-g-${esc(g)}"><span class="ag-dot"></span>${esc(g)} <span class="ag-gc">${rows.length}</span></h3>${rows.map(a => cardHtml(a, D, { open: open.has(a.id) })).join('')}`;
    }).join('');
    $('agCards').innerHTML = cards;
  };

  const renderInfo = flow => {
    const el = $('agInfo');
    if (!selected) { el.innerHTML = '<span class="ag-sub">Tap a box to see what it is and jump to its card.</span>'; return; }
    const a = D.agents.find(x => x.id === selected), p = D.points?.[selected];
    el.innerHTML = a
      ? `<b>${esc(a.name)}</b>${a.planned ? ' (planned)' : ''}: ${esc(a.purpose)} <a href="#agent-${esc(a.id)}" data-open-agent="${esc(a.id)}">Open its card</a>`
      : `<b>${esc(p?.name ?? selected)}</b>: ${esc(p?.note ?? '')}`;
  };

  const openAgent = id => {
    open.add(id);
    const card = $('agent-' + id);
    if (card) { card.open = true; card.scrollIntoView({ block: 'center', behavior: 'smooth' }); card.classList.add('ag-flash'); setTimeout(() => card.classList.remove('ag-flash'), 1400); }
  };

  const load = async () => {
    if (loading) return;
    loading = true;
    $('agStatus').textContent = 'Loading…'; $('agStatus').className = 'ag-status';
    try {
      const r = await fetchFn('/api/agents', { credentials: 'same-origin', cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      D = d;
      $('agStatus').textContent = ''; render();
    } catch (e) { $('agStatus').textContent = `Could not load the agents: ${e.message}`; $('agStatus').className = 'ag-status err'; }
    finally { loading = false; }
  };

  const setMsg = (id, text, kind) => { const m = root.querySelector(`[data-msg="${CSS.escape(id)}"]`); if (m) { m.textContent = text; m.className = `ag-msg ${kind || ''}`; } };

  const toggle = async btn => {
    const id = btn.dataset.toggle;
    if (btn.disabled) return;
    const want = btn.getAttribute('aria-checked') !== 'true';
    btn.disabled = true; setMsg(id, 'Saving…', 'busy');
    try {
      const r = await fetchFn('/api/agents/toggle', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, value: want }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      D.toggles = { ...D.toggles, ...(d.toggles ?? {}), [id]: { value: d.value, source: 'setting' } };
      // update in place: this switch, its state word, its source line, and the other switch that depends on it
      for (const t of Object.keys(D.toggles)) {
        const b = root.querySelector(`[data-toggle="${CSS.escape(t)}"]`); if (!b) continue;
        const on = !!D.toggles[t].value; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on));
        const s = root.querySelector(`[data-state="${CSS.escape(t)}"]`); if (s) s.textContent = on ? 'ON' : 'OFF';
        const src = root.querySelector(`[data-src="${CSS.escape(t)}"]`); if (src) src.textContent = `Value: ${SRC[D.toggles[t].source] ?? SRC.default}`;
      }
      const lib = root.querySelector('[data-sw-row="libraryLibrarian"] .ag-note'); if (lib) lib.hidden = !!D.toggles.libraryContext?.value;
      const card = btn.closest('.ag-card'), badge = card?.querySelector('.ag-b.on, .ag-b.off');
      if (card && badge) { const any = (D.agents.find(a => a.id === card.dataset.agent)?.toggles ?? []).some(t => D.toggles[t]?.value); badge.className = `ag-b ${any ? 'on' : 'off'}`; badge.textContent = any ? 'switch on' : 'switch off'; }
      setMsg(id, `Saved ${new Date(d.at || Date.now()).toLocaleTimeString()}. Takes effect within 30 seconds.`, 'ok');
    } catch (e) { setMsg(id, `Not saved: ${e.message}`, 'err'); }
    finally { btn.disabled = false; }
  };

  root.addEventListener('click', ev => {
    const t = ev.target;
    const chip = t.closest('[data-flow]'); if (chip) { flowId = chip.dataset.flow; selected = null; render(); return; }
    const node = t.closest('[data-node]'); if (node) { selected = node.dataset.node; render(); if (D.agents.some(a => a.id === selected)) openAgent(selected); return; }
    const sw = t.closest('[data-toggle]'); if (sw) { toggle(sw); return; }
    const oa = t.closest('[data-open-agent]'); if (oa) { ev.preventDefault(); selected = oa.dataset.openAgent; render(); openAgent(selected); return; }
    const gt = t.closest('[data-goto-tab]'); if (gt) { ev.preventDefault(); if (typeof globalThis.switchTab === 'function') globalThis.switchTab(gt.dataset.gotoTab); }
  });
  root.addEventListener('keydown', ev => { const node = ev.target.closest?.('[data-node]'); if (node && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); node.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
  root.addEventListener('toggle', ev => { const c = ev.target; if (c?.matches?.('details.ag-card')) { c.open ? open.add(c.dataset.agent) : open.delete(c.dataset.agent); } }, true);
  $('agReload')?.addEventListener('click', () => load());
  return { load, get data() { return D; } };
}

// Load the first time the tab is shown (the page fires 'bc-tab' from switchTab), and at once if the page opened on #tab-agents.
if (typeof document !== 'undefined') {
  const boot = () => {
    const api = init(document);
    if (!api) return;
    let done = false;
    const go = () => { if (!done) { done = true; api.load(); } };
    document.addEventListener('bc-tab', e => { if (e.detail === 'agents') go(); });
    if (document.getElementById('tab-agents')?.classList.contains('active')) go();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
}
