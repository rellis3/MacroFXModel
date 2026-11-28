// js/terminal/monitorView.js: the DOM half of the MONITOR tab (the rules are monitorCore.js, the memory and saving monitorState.js).
// A dense, sortable, keyboard-friendly table of the markets you picked with live columns. Click a row to select the market (linked selection:
// the Pair page, chart and Replay follow when it is on); Enter or a double click opens the Pair page. Refreshes every minute while the tab is on screen.
// Everything shown is a description (size, age, the morning card as written); the Desk call column says in its tooltip that direction is context only.
//
// A PREVIEW feature (registry id tab.monitor): js/terminal/terminalFeel.js only loads this file when the session may see that surface.
import { COLUMNS, IMPACTS, buildRows, sortRows, fmtPrice, fmtPct, rowsToTable, callText, entryText, invalText } from './monitorCore.js';
import { createMonitorState, FAV_MONITOR } from './monitorState.js';
import { ALL_INSTRUMENTS, instLabel } from './commandCore.js';
import { TAGS } from '../volClockCore.js';
import { clockState } from '../marketClock.js';

export const REFRESH_MS = 60_000;
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const localStore = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function httpApi(win = window) {
  const call = async (method, body) => {
    const r = await win.fetch('/api/desk-monitors', { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    let j = null; try { j = await r.json(); } catch { /* not JSON */ }
    return j ?? { ok: false, error: `The server answered ${r.status}.` };
  };
  return { list: () => call('GET'), post: b => call('POST', b) };
}
const getJson = async (win, url) => { try { const r = await win.fetch(url, { credentials: 'same-origin' }); return r.ok ? await r.json() : null; } catch { return null; } };

/** Fetch bars with a small pool so forty markets do not open forty connections at once. */
export async function loadBars(win, items, pool = 6) {
  const out = {}, queue = items.slice();
  await Promise.all(Array.from({ length: Math.min(pool, queue.length) }, async () => {
    while (queue.length) { const inst = queue.shift(); const j = await getJson(win, `/api/desk-bars?inst=${encodeURIComponent(inst)}&tf=1h&days=4`); if (j?.ok && Array.isArray(j.bars)) out[inst] = { bars: j.bars, asOf: j.asOf }; }
  }));
  return out;
}

export function mountMonitor({ doc = document, win = window, api = httpApi(win), store = localStore(), ask = (m, d) => win.prompt(m, d), sure = m => win.confirm(m), now = () => Date.now() } = {}) {
  const sec = doc.getElementById('monitor');
  if (!sec || sec.dataset.mounted) return null;
  sec.dataset.mounted = '1';
  const state = createMonitorState({ api, store, favourites: () => win.deskFavourites?.list?.() ?? [] });
  const owner = !win.deskIsViewer?.();
  sec.innerHTML = `<div class="mon-bar" role="toolbar" aria-label="Monitor">
<label class="mon-l" for="mon-pick">Monitor</label><select id="mon-pick"></select>
${owner ? '<button type="button" class="btn" data-mon="save">Save</button><button type="button" class="btn" data-mon="saveas">Save as…</button><button type="button" class="btn" data-mon="delete">Delete</button>' : ''}
<span class="mon-sep"></span>
<label class="mon-l" for="mon-add">Add a market</label><input id="mon-add" list="mon-list" autocomplete="off" spellcheck="false" placeholder="EURUSD, GOLD, NQ…"><datalist id="mon-list">${ALL_INSTRUMENTS.map(k => `<option value="${esc(k)}">${esc(instLabel(k))}</option>`).join('')}</datalist>
<button type="button" class="btn" data-mon="add">Add</button>
<span class="mon-sep"></span><label class="mon-l" for="mon-imp">Next release</label><select id="mon-imp">${IMPACTS.map(i => `<option value="${i.id}">${esc(i.label)}</option>`).join('')}</select>
<span class="mon-sep"></span><span id="mon-tools" class="mon-tools"></span><span id="mon-stamp" class="mon-stamp muted"></span>
</div><div id="mon-note" class="mon-note" role="status" aria-live="polite"></div><div class="mon-wrap"><table class="mon-t" id="mon-t" aria-label="Monitor"></table></div>
<p class="tt-note">Every column describes size, age or the morning desk card as written: how big a move is expected and how much is used, not which way; u is the day's usual move from the open. Direction is context only. Click a row to select the market; Enter opens its Pair page.</p>`;
  const $ = s => sec.querySelector(s);
  const pick = $('#mon-pick'), table = $('#mon-t'), noteEl = $('#mon-note'), stampEl = $('#mon-stamp'), addEl = $('#mon-add'), impEl = $('#mon-imp');
  let data = { bars: {}, vc: null, events: [], at: 0 }, sortCol = null, sortDir = 1, open = false, timer = null, flash = '', busy = false, selInst = null;
  let impact = 'headline'; try { const v = store?.getItem?.('deskMonitorImpact'); if (IMPACTS.some(i => i.id === v)) impact = v; } catch { /* default */ }
  if (impEl) impEl.value = impact;

  const rows = () => {
    const closed = !clockState(now()).open;
    const r = buildRows({ items: state.current.items, bars: data.bars, vc: data.vc, cards: win.deskCardsAll?.() ?? {}, events: data.events, now: now(), closed, impact });
    return sortCol ? sortRows(r, sortCol, sortDir) : r;
  };
  function drawBar() {
    const cur = state.current;
    pick.innerHTML = `<optgroup label="Built in">${state.allNames().slice(0, 2).map(n => `<option value="${esc(n)}"${n === cur.name && cur.source === 'starter' ? ' selected' : ''}>${esc(n)}</option>`).join('')}</optgroup>`
      + (state.favouriteItems().length ? `<optgroup label="Your favourites"><option value="${esc(FAV_MONITOR)}"${cur.name === FAV_MONITOR && cur.source === 'new' ? ' selected' : ''}>${esc(FAV_MONITOR)}</option></optgroup>` : '')
      + (state.saved.length ? `<optgroup label="Saved by the desk">${state.saved.map(l => `<option value="${esc(l.name)}"${l.name === cur.name && cur.source === 'saved' ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</optgroup>` : '')
      + (cur.source === 'new' && !(cur.name === FAV_MONITOR && state.favouriteItems().length) ? `<optgroup label="Open now"><option value="" selected>${esc(cur.name)} (not saved)</option></optgroup>` : '');
    const del = sec.querySelector('[data-mon="delete"]'); if (del) del.disabled = cur.source !== 'saved';
    noteEl.textContent = flash || state.note || (state.dirty && owner ? 'Unsaved changes. Save keeps them for the whole desk.' : '');
  }
  const cell = (r, id) => {
    switch (id) {
      case 'inst': return `<th scope="row" class="l"><b class="mono">${esc(r.inst)}</b> <span class="muted">${esc(r.label)}</span></th>`;
      case 'last': return `<td class="n mono">${fmtPrice(r.last)}</td>`;
      case 'chg': return `<td class="n mono ${r.chgPct > 0 ? 'up' : r.chgPct < 0 ? 'dn' : ''}">${fmtPct(r.chgPct)}</td>`;
      case 'used': return `<td class="n mono" title="${esc(r.used == null ? (r.why.used ?? '') : `${r.usedMode === 'last' ? 'The last finished session' : 'So far today'}: ${Math.round(r.used * 100)}% of the forecast median range`)}">${r.used == null ? '–' : `<span class="mon-bar-u"><i style="width:${Math.min(100, Math.round(r.used * 50))}%"></i></span>${Math.round(r.used * 100)}%`}</td>`;
      case 'iv': { const t = TAGS[r.tag]; return `<td class="n mono" title="${esc(r.ratio == null ? (r.why.iv ?? '') : `${t?.plain ?? ''}. How much, not which way.`)}">${r.ratio == null ? '–' : r.ratio.toFixed(2)}${t ? ` <span class="mon-tag">${esc(t.label.toLowerCase())}</span>` : ''}</td>`; }
      case 'call': return r.call ? `<td class="l mono ${r.call.sign > 0 ? 'up' : r.call.sign < 0 ? 'dn' : ''}" title="The morning desk book's card as written. Direction is context only, never a signal.">${r.call.sign > 0 ? '▲' : r.call.sign < 0 ? '▼' : '◆'} ${esc(callText(r.call))}</td>` : '<td class="l muted" title="The desk book has no card for this market today.">no card</td>';
      case 'entry': return r.dist?.entry ? `<td class="n mono${r.dist.entry.side === 'in' ? ' gold' : ''}" title="${esc(r.dist.ok ? 'Distance from the entry zone, in u.' : 'Distance from the entry zone, in u. This card\'s plan levels do not fit together (see the card).')}">${esc(entryText(r.dist))}${r.dist.ok ? '' : ' ⚠'}</td>` : '<td class="n muted">–</td>';
      case 'inval': return r.dist?.invalid != null ? `<td class="n mono${r.dist.invalid <= 0 ? ' dn' : ''}" title="Room before the invalidation level, in u.">${esc(invalText(r.dist))}</td>` : '<td class="n muted">–</td>';
      case 'next': return r.next ? `<td class="l" title="${esc(r.next.label)}"><span class="mono">${esc(r.next.ccy)}</span> ${esc(r.next.label)} <span class="muted">${esc(r.next.when)}</span></td>` : '<td class="l muted">–</td>';
      case 'age': return `<td class="n mono mon-age ${esc(r.age.state)}" title="${r.age.state === 'shut' ? 'The market is shut: this is the last print.' : 'How old the quote is.'}">${esc(r.age.text)}${r.age.state === 'shut' ? ' <span class="muted">shut</span>' : ''}</td>`;
      default: return '<td></td>';
    }
  };
  function drawTable() {
    const rs = rows();
    const th = COLUMNS.map(c => `<th scope="col" class="${c.align}" aria-sort="${sortCol === c.id ? (sortDir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="mon-sort" data-sort="${c.id}" title="${esc(c.help)}">${esc(c.label)}${sortCol === c.id ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('');
    const ctl = r => `<td class="mon-ctl"><button type="button" class="mon-x" data-up="${esc(r.inst)}" aria-label="Move ${esc(r.inst)} up" title="Move up">↑</button><button type="button" class="mon-x" data-dn="${esc(r.inst)}" aria-label="Move ${esc(r.inst)} down" title="Move down">↓</button><button type="button" class="mon-x" data-rm="${esc(r.inst)}" aria-label="Remove ${esc(r.inst)}" title="Remove">✕</button></td>`;
    table.innerHTML = `<thead><tr>${th}<th class="mon-ctl" scope="col"><span class="sr">Move or remove</span></th></tr></thead><tbody>${rs.length ? rs.map(r => `<tr tabindex="0" data-inst="${esc(r.inst)}" aria-selected="${r.inst === selInst}">${COLUMNS.map(c => cell(r, c.id)).join('')}${ctl(r)}</tr>`).join('') : `<tr><td colspan="${COLUMNS.length + 1}" class="muted">Nothing here yet: add a market above.</td></tr>`}</tbody>`;
    stampEl.textContent = data.at ? `${clockState(now()).open ? 'updated' : 'market shut · as at'} ${new Date(data.at).toISOString().slice(11, 16)} UTC` : 'loading…';
  }
  const render = () => { drawBar(); drawTable(); };

  async function refresh() {
    if (busy || !open) return; busy = true;
    try {
      const items = state.current.items;
      const [bars, vc, cal] = await Promise.all([loadBars(win, items), getJson(win, '/api/vol-clock'), getJson(win, '/api/calendar-ahead')]);
      // this week's calendar the page already holds (rated by ForexFactory) plus the forward list
      data = { bars, vc: vc?.ok === false ? null : vc, events: [...(win.deskEvents?.() ?? []), ...(cal?.rows ?? [])], at: now() };
    } catch { /* keep what we had */ }
    busy = false; if (open) drawTable();
  }
  function enter() { if (open) return; open = true; state.refresh(); render(); refresh(); timer = win.setInterval(() => { if (!doc.hidden) refresh(); }, REFRESH_MS); }
  function leave() { open = false; if (timer) win.clearInterval(timer); timer = null; }

  const say = (r, ok = '') => { flash = r?.ok ? ok : (r?.error ?? ''); drawBar(); if (r?.ok && ok) win.setTimeout?.(() => { flash = ''; drawBar(); }, 4000); };
  function pickRow(inst) { selInst = inst; if (win.deskSelection?.set) win.deskSelection.set({ inst }, 'monitor'); drawTable(); }
  sec.addEventListener('click', async e => {
    const t = e.target, q = s => t.closest?.(s);
    const sort = q('[data-sort]'); if (sort) { const c = sort.dataset.sort; if (sortCol === c) sortDir = -sortDir; else { sortCol = c; sortDir = c === 'inst' || c === 'next' || c === 'age' ? 1 : -1; } drawTable(); return; }
    const up = q('[data-up]'), dn = q('[data-dn]'), rm = q('[data-rm]');
    if (up) { sortCol = null; state.move(up.dataset.up, -1); return; }
    if (dn) { sortCol = null; state.move(dn.dataset.dn, 1); return; }
    if (rm) { state.removeItem(rm.dataset.rm); return; }
    const m = q('[data-mon]');
    if (m) {
      const a = m.dataset.mon;
      if (a === 'add') { const r = state.add(addEl.value); if (r.ok) { addEl.value = ''; refresh(); } say(r); return; }
      if (a === 'save') { let r = await state.save(); if (r.needName) { const n = ask('Name this monitor (shared with the desk):', ''); if (n) r = await state.save(n); else return; } say(r, `Saved as "${state.current.name}".`); return; }
      if (a === 'saveas') { const n = ask('Save this monitor as (shared with the desk):', state.current.source === 'saved' ? state.current.name : ''); if (n) say(await state.save(n), `Saved as "${n}".`); return; }
      if (a === 'delete') { if (sure(`Delete "${state.current.name}" for everyone on the desk?`)) say(await state.remove(), 'Deleted.'); return; }
    }
    const row = q('tr[data-inst]');
    if (row && !q('button')) pickRow(row.dataset.inst);
  });
  sec.addEventListener('dblclick', e => { const row = e.target.closest?.('tr[data-inst]'); if (row) win.openPairPage?.(row.dataset.inst); });
  sec.addEventListener('keydown', e => {
    const row = e.target.closest?.('tr[data-inst]');
    if (e.target === addEl && e.key === 'Enter') { e.preventDefault(); sec.querySelector('[data-mon="add"]').click(); return; }
    if (!row || e.target !== row) return;
    if (e.key === 'Enter') { e.preventDefault(); win.openPairPage?.(row.dataset.inst); }
    else if (e.key === ' ') { e.preventDefault(); pickRow(row.dataset.inst); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); (e.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling)?.focus?.(); }
  });
  pick.addEventListener('change', () => { const r = state.load(pick.value); say(r); if (r.ok) refresh(); });
  impEl?.addEventListener('change', () => { impact = impEl.value; try { store?.setItem?.('deskMonitorImpact', impact); } catch { /* fine */ } if (open) drawTable(); });
  const unsubSel = win.deskSelection?.subscribe?.(({ sel }) => { if (sel?.inst && sel.inst !== selInst) { selInst = sel.inst; if (open) drawTable(); } });
  state.subscribe(() => { if (open) { render(); } else drawBar(); });
  const tabBtns = [...doc.querySelectorAll('#tabs [data-t]')], onTab = e => { const b = e.currentTarget ?? e.target; if (b.dataset.t === 'monitor') win.setTimeout(enter, 0); else leave(); };
  for (const b of tabBtns) b.addEventListener('click', onTab);

  win.deskMonitor = {
    show: name => { const r = name ? state.load(name) : { ok: true }; if (r.ok) refresh(); return r; },
    add: w => { const r = state.add(w); if (r.ok) refresh(); say(r); return r; },
    table: () => rowsToTable(rows()), name: () => state.current.name, state,
    setTools: html => { $('#mon-tools').innerHTML = html; },
  };
  state.init().then(() => { render(); if (doc.querySelector('#tabs [data-t="monitor"]')?.getAttribute('aria-selected') === 'true') enter(); });
  return { state, enter, leave, destroy() { leave(); unsubSel?.(); for (const b of tabBtns) b.removeEventListener('click', onTab); delete win.deskMonitor; sec.innerHTML = ''; delete sec.dataset.mounted; } };
}
