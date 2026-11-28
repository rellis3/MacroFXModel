// js/terminal/commandLine.js: the DOM half of the Desk Terminal's command line (the commands and the matching are js/terminal/commandCore.js).
//
//   / or ` or Ctrl+K opens it (not while you are typing in a box), Esc closes it, Up/Down choose, Enter does it. ? lists every command.
//   Beside each match: what it is, an example you can click to type, and where it takes you.
//
// A PREVIEW feature (registry id widget.cmdline): js/terminal/terminalFeel.js only loads this file when the session may see that surface, so a desk
// login with the switch off gets no button, no key handler and no code. The owner always has it.
import { buildCommands, search, plainAction, grouped } from './commandCore.js';
import { hashFor } from './macroSubtabs.js';
import { whyNot } from './featureStatus.js';
import { parseHelixHash } from './helixNav.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const RECENT_KEY = 'deskCmdRecent';
const store = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
export const loadRecent = (s = store()) => { try { const a = JSON.parse(s?.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string').slice(0, 6) : []; } catch { return []; } };
export const saveRecent = (line, s = store()) => {
  const t = String(line ?? '').trim(); if (!t) return;
  try { const a = [t, ...loadRecent(s).filter(x => x.toLowerCase() !== t.toLowerCase())].slice(0, 6); s?.setItem(RECENT_KEY, JSON.stringify(a)); } catch { /* blocked: no history */ }
};
const typing = el => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

/** Do one action (data from commandCore). Returns true if something was done. Uses the page's own hooks, so every rule they apply still applies. */
export function perform(a, doc = document, win = window) {
  if (!a) return false;
  const tab = t => { const b = doc.querySelector(`#tabs [data-t="${t}"]`); if (!b || b.hidden) return false; if (b.getAttribute('aria-selected') !== 'true') b.click(); return true; };
  switch (a.kind) {
    case 'tab': return tab(a.t);
    case 'deep': return typeof win.openDeepPage === 'function' ? (win.openDeepPage(a.inst, a.section), true) : tab('deep');
    case 'pair': return typeof win.openPairPage === 'function' ? (win.openPairPage(a.inst), true) : false;
    case 'replay': return typeof win.openReplay === 'function' ? win.openReplay(a.inst, a.ts) !== false : false;
    case 'macro': {
      let ok = true;
      if (a.block) ok = typeof win.openMacroBoard === 'function' ? win.openMacroBoard(a.block) !== false : tab('macro');
      else { tab('macro'); const h = hashFor(a.sub); if (win.location.hash === h) win.dispatchEvent(new Event('hashchange')); else win.location.hash = h; }
      if (a.ccy) win.setTimeout(() => win.ccyModal?.(a.ccy), 450);
      return ok;
    }
    case 'workspace': { const ok = tab('workspace'); if (ok && a.name) win.setTimeout(() => win.deskWorkspace?.load?.(a.name), 60); return ok; }
    case 'glance': { const ok = tab('overview'); if (ok) win.setTimeout(() => win.document?.querySelector?.('.fl-glance')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }), 80); return ok; }
    case 'density': return typeof win.deskFlow?.density?.set === 'function' ? (win.deskFlow.density.set(a.word === 'toggle' || !a.word ? win.deskFlow.density.get() === 'dense' ? 'comfortable' : 'dense' : (a.word === 'off' || a.word === 'comfortable' || a.word === 'normal') ? 'comfortable' : 'dense'), true) : false;
    case 'ovsec': { const ok = tab('overview'); if (ok) win.setTimeout(() => win.openOverviewSection?.(a.id), 120); return ok; }
    case 'ana': { const ok = tab('ana'); if (ok) win.setTimeout(() => win.deskAnalyticsSplit?.show?.(a.id), 120); return ok; }
    case 'asof': return win.deskAsof?.act ? win.deskAsof.act(a) !== false : false;
    case 'oitime': return typeof win.deskOiTime?.open === 'function' ? win.deskOiTime.open(a.id, a.inst, a.date) !== false : false;
    case 'eventreplay': return typeof win.deskEventReplay?.open === 'function' ? win.deskEventReplay.open(a.family, a.market) !== false : false;
    case 'since': return typeof win.deskSince?.open === 'function' ? win.deskSince.open(a.range) !== false : false;
    case 'flaghistory': return typeof win.deskRiskStrip?.open === 'function' ? win.deskRiskStrip.open() !== false : false;
    case 'oidrill': return typeof win.deskOiDrill?.open === 'function' ? win.deskOiDrill.open(a.inst, a.target) !== false : false;
    case 'smile': return typeof win.deskSmile?.open === 'function' ? win.deskSmile.open(a.sym, a.mode) !== false : false;
    case 'ghost': return typeof win.deskGhostWalk?.open === 'function' ? win.deskGhostWalk.open(a.inst, a.date) !== false : false;
    case 'replay-viz': return typeof win.deskReplayViz?.open === 'function' ? win.deskReplayViz.open(a.id) !== false : false;
    case 'page': return !!win.open?.(a.href, '_blank', 'noopener');
    case 'export': return win.deskExport ? (a.what === 'png' ? win.deskExport.png() : win.deskExport.csv(), true) : false;
    case 'news-search': { const ok = tab('news'); if (ok && a.name) win.setTimeout(() => win.deskNewsSearches?.apply?.(a.name), 120); return ok; }
    case 'monitor': { const ok = tab('monitor'); if (ok && a.name) win.setTimeout(() => win.deskMonitor?.show?.(a.name), 60); return ok; }
    case 'fav': { const ok = tab('assets'); if (ok && win.deskFavourites) win.deskFavourites.setAssetsOnly(!!a.on); return ok; }   // the list repaints the Assets tab itself
    case 'star': case 'unstar': { const f = win.deskFavourites; if (!f) return false; const r = a.kind === 'star' ? f.add(a.inst) : f.remove(a.inst); win.deskFavouritesRefresh?.(); return !!r.ok; }
    case 'monitor-add': { const ok = tab('monitor'); if (ok) win.setTimeout(() => win.deskMonitor?.add?.(a.inst), 60); return ok; }
    case 'kchart': { const ok = tab('kchart'); if (ok && (a.inst || a.tf)) win.setTimeout(() => win.deskKchart?.show?.(a.inst, a.tf), 60); return ok; }
    case 'spreads': { const ok = tab('insight'); if (ok) { win.deskSpreadsWant = a.id ?? null; win.setTimeout(() => { win.deskInsight?.show?.('spreads'); if (a.id) win.deskSpreads?.open?.(a.id); }, 60); } return ok; }
    case 'roc': { const ok = tab('insight'); if (ok) { win.deskRocWant = a.key ?? null; win.setTimeout(() => { win.deskInsight?.show?.('roc'); if (a.key) win.deskRoc?.open?.(a.key); }, 60); } return ok; }
    case 'levelengine': { const ok = tab('insight'); if (ok) { win.deskLevelWant = a.inst || a.level ? { inst: a.inst ?? null, level: a.level ?? null, level2: a.level2 ?? null, horizon: a.horizon ?? null } : null; win.setTimeout(() => { win.deskInsight?.show?.('reach'); if (win.deskLevelWant && typeof win.deskLevelEngine?.open === 'function') { win.deskLevelEngine.open(win.deskLevelWant); win.deskLevelWant = null; } }, 60); } return ok; }
    case 'insight': { const ok = tab('insight'); if (ok) win.setTimeout(() => win.deskInsight?.show?.(a.panel), 60); return ok; }
    case 'alerts': return win.deskAlerts?.open ? (win.deskAlerts.open(), true) : false;
    case 'alert-add': return win.deskAlerts?.add ? (win.deskAlerts.add(a.body), true) : false;
    case 'workspace-save': return win.deskWorkspace?.saveAs ? (win.deskWorkspace.saveAs(a.name), true) : false;
    case 'jarvis': import('./jarvisView.js').then(m => m.openJarvis(win, { args: a.args, hash: a.hash, popout: !!a.popout })).catch(e => console.warn('jarvis', e)); return true;
    case 'theme': import('./themePicker.js').then(m => m.applyTheme(a.id)).catch(() => {}); return true;
    case 'tf': return win.deskSelection ? (win.deskSelection.set({ tf: a.tf }, 'command'), true) : false;
    case 'link': return win.deskSelection ? (win.deskSelection.setLinked(a.on, 'command'), true) : false;
    default: return false;
  }
}

export function mountCommandLine({ doc = document, win = window, isOn = id => win.deskSurfaceOn?.(id) ?? true, now = () => Date.now() } = {}) {
  if (doc.getElementById('cmdk-back')) return null;
  const back = doc.createElement('div');
  back.id = 'cmdk-back'; back.className = 'cmdk-back'; back.hidden = true;
  back.innerHTML = `<div class="cmdk" role="dialog" aria-modal="true" aria-label="Command line">
<div class="cmdk-in"><b>&gt;</b><input id="cmdk-input" type="text" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="A market, a board or a command:  EURUSD  ·  FED  ·  REPLAY NQ 12 NOV  ·  ?"><kbd>esc</kbd></div>
<div id="cmdk-main"></div>
<div class="cmdk-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> choose</span><span><kbd>enter</kbd> go</span><span><kbd>?</kbd> every command</span><span id="cmdk-note"></span></div></div>`;
  doc.body.appendChild(back);
  const input = back.querySelector('#cmdk-input'), main = back.querySelector('#cmdk-main'), note = back.querySelector('#cmdk-note');
  let cmds = [], results = [], idx = 0, mode = 'search', lastFocus = null;

  const asItem = r => { const p = r.action ? r : r.error ? r : plainAction(r.cmd); return { ...r, action: p?.action ?? r.action ?? null, summary: r.summary ?? p?.summary ?? r.cmd.opens }; };

  function suggestions() {
    const recent = loadRecent();
    const lines = [...recent, 'EURUSD', 'FED', 'MACRO RATES', 'REPLAY NQ 12 NOV', 'CPI US', 'THEME AMBER', '?'].filter((x, i, a) => a.findIndex(y => y.toLowerCase() === x.toLowerCase()) === i).slice(0, 8);
    return lines.map(l => { const r = search(cmds, l, { limit: 1 })[0]; return r ? { ...r, typed: l } : null; }).filter(Boolean);
  }
  function listView() {
    const g = grouped(cmds);
    main.innerHTML = `<div class="cmdk-all">${g.map(({ group, items }) => `<div class="cmdk-g">${esc(group)} (${items.length})</div><table>${items.map(c => `<tr><td>${esc(c.name)}${c.args ? ` <i class="muted" style="font-weight:500">${esc(c.args)}</i>` : ''}</td><td>${esc(c.help)}</td><td class="ex"><code class="cmdk-btn" data-fill="${esc(c.example)}" tabindex="0" role="button">${esc(c.example)}</code></td></tr>`).join('')}</table>`).join('')}</div>`;
    note.textContent = `${cmds.length} commands`;
  }
  function render() {
    if (mode === 'list') return listView();
    const q = input.value.trim();
    results = (q ? search(cmds, q).map(asItem) : suggestions().map(asItem));
    if (idx >= results.length) idx = Math.max(0, results.length - 1);
    if (!results.length) { main.innerHTML = `<div class="cmdk-empty">Nothing matches "${esc(q)}". Press <kbd>?</kbd> to see every command.</div>`; note.textContent = ''; return; }
    const cur = results[idx], c = cur.cmd;
    main.innerHTML = `<div class="cmdk-body"><div class="cmdk-list" id="cmdk-list" role="listbox" aria-label="${q ? 'Matches' : 'Try one of these'}">${q ? '' : '<div class="cmdk-g">Try</div>'}${results.map((r, i) => `<button type="button" class="cmdk-opt${r.error ? ' err' : ''}" role="option" id="cmdk-o${i}" data-i="${i}" aria-selected="${i === idx}"><span class="nm">${esc(r.typed ?? (r.args != null ? `${r.cmd.name} ${r.args}` : r.cmd.name))}${!q || r.args != null ? '' : r.cmd.args ? ` <i>${esc(r.cmd.args)}</i>` : ''}</span><span class="sm">${esc(r.error ?? r.summary ?? r.cmd.help)}</span></button>`).join('')}</div>
<div class="cmdk-detail"><h4>${esc(c.name)}${c.args ? ` <span class="muted" style="font-weight:500">${esc(c.args)}</span>` : ''}</h4><div>${esc(c.help)}</div>
<dl><dt>Opens</dt><dd>${esc(c.opens)}</dd><dt>Example</dt><dd><code class="cmdk-btn" data-fill="${esc(c.example)}" tabindex="0" role="button">${esc(c.example)}</code></dd>${cur.error ? `<dt>Problem</dt><dd class="warn">${esc(cur.error)}</dd>` : cur.summary && cur.args != null ? `<dt>Will do</dt><dd>${esc(cur.summary)}</dd>` : ''}</dl></div></div>`;
    input.setAttribute('aria-activedescendant', `cmdk-o${idx}`);
    note.textContent = `${results.length} ${q ? 'match' + (results.length === 1 ? '' : 'es') : 'suggestions'}`;
    main.querySelector(`#cmdk-o${idx}`)?.scrollIntoView?.({ block: 'nearest' });
  }
  function open(prefill = '') {
    cmds = buildCommands({ isOn, now, workspaceNames: () => win.deskWorkspace?.names?.() ?? [], monitorNames: () => win.deskMonitor?.state?.saved?.map(l => l.name) ?? [], newsSearchNames: () => win.deskNewsSearches?.names?.() ?? [] });
    lastFocus = doc.activeElement; mode = 'search'; idx = 0;
    back.hidden = false; input.value = prefill; render(); input.focus();
  }
  function close() { back.hidden = true; if (lastFocus?.focus) { try { lastFocus.focus(); } catch { /* gone */ } } }
  function go(item) {
    if (!item) return;
    if (item.error) { render(); return; }
    const line = input.value.trim() || item.typed || '';
    const a = item.action;
    if (!a) { render(); return; }
    if (a.kind === 'help') { mode = 'list'; input.value = '?'; render(); return; }
    saveRecent(line || item.cmd.name);
    close();
    // a command that does nothing says why in words (a feature that failed to start, a board not drawn yet, a tab this login cannot open)
    if (perform(a, doc, win) === false) toast(whyNot(a.kind, win));
  }
  let toastT = null;
  function toast(text) {
    let t = doc.getElementById('cmdk-toast');
    if (!t) { t = doc.createElement('div'); t.id = 'cmdk-toast'; t.className = 'cmdk-toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); doc.body.appendChild(t); }
    t.textContent = text; t.hidden = false;
    if (toastT && win.clearTimeout) win.clearTimeout(toastT);
    toastT = win.setTimeout ? win.setTimeout(() => { t.hidden = true; }, 9000) : null;
  }

  input.addEventListener('input', () => { const v = input.value.trim(); mode = v === '?' ? 'list' : 'search'; idx = 0; render(); });
  back.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') { e.preventDefault(); input.focus(); return; }
    if (e.target === input) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (mode === 'search' && results.length) { idx = (idx + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length; render(); } }
      else if (e.key === 'Enter') { e.preventDefault(); if (mode === 'search') go(results[idx]); }
    } else if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset?.fill != null) { e.preventDefault(); fill(e.target.dataset.fill); }
  });
  const fill = text => { mode = 'search'; input.value = text; idx = 0; render(); input.focus(); };
  back.addEventListener('click', e => {
    if (e.target === back) { close(); return; }
    const f = e.target.closest?.('[data-fill]'); if (f) { fill(f.dataset.fill); return; }
    const o = e.target.closest?.('.cmdk-opt'); if (o) { idx = +o.dataset.i; go(results[idx]); }
  });
  const onKey = e => {
    if (e.defaultPrevented || !back.hidden) return;
    const k = e.key;
    if ((k === 'k' || k === 'K') && (e.ctrlKey || e.metaKey) && !e.altKey) { e.preventDefault(); open(); return; }
    if ((k === '/' || k === '`') && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(doc.activeElement) && !typing(e.target)) { e.preventDefault(); open(); }
  };
  doc.addEventListener('keydown', onKey);
  // HELIX DEEP LINKS: #helix/<picture>[/1d|5d|20d][/region][/popout] opens Helix there (the phone alerts and the morning digest link back this way). Only for a session that may see Helix.
  const followHelix = () => { const h = win.location?.hash ?? '', p = parseHelixHash(h); if (p && isOn('widget.jarvis')) perform({ kind: 'jarvis', hash: h, popout: p.popout }, doc, win); };
  win.addEventListener?.('hashchange', followHelix);
  if (parseHelixHash(win.location?.hash ?? '')) win.setTimeout?.(followHelix, 0);
  // The top-bar box (an input, or a button on an older page): click or Enter opens the palette; a typed character opens it
  // with that character already in the search, so you can type straight into the bar. The palette does the matching.
  const btn = doc.getElementById('cmdbtn');
  const onBtn = () => open();
  const onBarKey = e => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key === 'Tab' || e.key === 'Escape' || e.key.startsWith?.('Arrow') || e.key === 'Shift') return;
    if (e.key === 'Enter') { e.preventDefault(); open(); return; }
    if (e.key.length === 1) { e.preventDefault(); open(e.key === '`' ? '' : e.key); }
  };
  if (btn) { btn.hidden = false; btn.addEventListener('click', onBtn); btn.addEventListener('keydown', onBarKey); }
  return { open, close, destroy() { doc.removeEventListener('keydown', onKey); win.removeEventListener?.('hashchange', followHelix); btn?.removeEventListener('click', onBtn); btn?.removeEventListener('keydown', onBarKey); if (btn) btn.hidden = true; back.remove(); doc.getElementById('cmdk-toast')?.remove(); } };
}
