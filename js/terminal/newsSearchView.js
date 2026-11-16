// js/terminal/newsSearchView.js: the SAVED SEARCHES bar on the News tab (the rules are newsSearchCore.js, the list lives on the server at /api/desk-news-searches).
// Pick a saved search and the News tab's own filter is set to it; the owner can save the current filter under a name, delete one, or turn the words into a keyword
// alert (one Telegram note per episode, js/deskAlertRulesCore.js kind news_keyword). The desk login only sees the list, and only once the owner switched it on.
// The News tab (js/terminal/terminalTabs.js) offers win.deskNews = { state(), apply(search) } and calls win.deskNewsSavedMount(host) when it builds #nt-saved.
//
// A PREVIEW feature (registry id panel.news.saved): js/terminal/terminalFeel.js only loads this file when the session may see that surface.
import { cleanName, cleanSearch, describeSearch, alertFor, sameFilter, sanitizeStore, applyAction } from './newsSearchCore.js';

export const LOCAL_KEY = 'deskNewsSearchesLocal:v1';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const json = async (win, url, method, body) => {
  try {
    const r = await win.fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    let j = null; try { j = await r.json(); } catch { /* not JSON */ }
    return j ?? { ok: false, error: `The server answered ${r.status}.` };
  } catch { return { ok: false, error: 'Could not reach the server.' }; }
};

/** A desk login's own saved searches: kept in THIS browser only (localStorage), never sent to the server, never seen by anyone else. Same save/delete rules as the owner's list. */
export function localSearches(win) {
  const read = () => { try { return sanitizeStore(JSON.parse(win.localStorage.getItem(LOCAL_KEY) ?? 'null') ?? {}); } catch { return sanitizeStore({}); } };
  return async (method, body) => {
    const s = read();
    if (method === 'GET') return { ok: true, ...s };
    const r = applyAction(s, body);
    if (!r.ok) return { ok: false, error: r.error };
    try { win.localStorage.setItem(LOCAL_KEY, JSON.stringify(r.store)); } catch { return { ok: false, error: 'This browser would not keep it (a private window?).' }; }
    return { ok: true, ...r.store };
  };
}

export function mountNewsSearches({ host, win = window, call = null, callAlert = b => json(win, '/api/desk-alert-rules', 'POST', b), ask = (m, d) => win.prompt(m, d), sure = m => win.confirm(m) } = {}) {
  if (!host || host.dataset.nsMounted) return null;
  host.dataset.nsMounted = '1';
  const owner = !win.deskIsViewer?.();
  // the owner's list lives on the server and is shared; a desk login's list is its own, in this browser, and the alert button is the owner's alone (an alert sends the one Telegram chat a message)
  const callFn = call ?? (owner ? (m, b) => json(win, '/api/desk-news-searches', m, b) : localSearches(win));
  let searches = [], note = '', applied = null;   // applied = the saved search last picked (to say when the filter has moved off it)
  const say = t => { note = t || ''; draw(); };
  function draw() {
    const cur = win.deskNews?.state?.() ?? null, moved = applied && cur && !sameFilter(applied, cur);
    host.innerHTML = `<div class="ns-bar" role="group" aria-label="Saved news searches"><label class="ns-l" for="ns-pick">Saved searches</label>
<select id="ns-pick"><option value="">${searches.length ? 'Choose one…' : 'None saved yet'}</option>${searches.map(s => `<option value="${esc(s.name)}"${applied?.name === s.name ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
<button type="button" class="btn" data-ns="save" title="${owner ? 'Keep the filter as it is now under a name, for the whole desk' : 'Keep the filter as it is now under a name. Only you see it: it is kept in this browser'}">Save this search…</button><button type="button" class="btn" data-ns="delete"${applied ? '' : ' disabled'}>Delete</button>${owner ? '<button type="button" class="btn" data-ns="alert" title="One Telegram note per episode when a NEW headline matches these words">Alert me on new matches</button>' : ''}
<span class="ns-note" role="status" aria-live="polite">${esc(note || (applied ? `${describeSearch(applied)}${moved ? ' (the filter has changed since)' : ''}` : ''))}</span></div>`;
  }
  async function load() { const r = await callFn('GET'); if (r?.ok) { searches = r.searches ?? []; draw(); } else { searches = []; say(r?.error ? `Saved searches: ${r.error}` : ''); } }
  host.addEventListener('change', e => {
    if (e.target.id !== 'ns-pick') return;
    const s = searches.find(x => x.name === e.target.value);
    applied = s ?? null;
    if (s && win.deskNews?.apply) win.deskNews.apply(s);
    draw();
  });
  host.addEventListener('click', async e => {
    const b = e.target.closest?.('[data-ns]'); if (!b) return;
    const a = b.dataset.ns, cur = win.deskNews?.state?.() ?? null;
    if (a === 'save') {
      if (!cleanSearch(cur)) { say('Type some words (at least two letters) or pick a currency or asset first: an empty search is the whole wire.'); return; }
      const n = cleanName(ask(owner ? 'Save this search as (shared with the desk):' : 'Save this search as (kept in this browser only):', applied?.name ?? '')); if (!n) return;
      const r = await callFn('POST', { action: 'save', name: n, search: cur });
      if (r?.ok) { searches = r.searches ?? searches; applied = searches.find(s => s.name === n) ?? null; say(`Saved as "${n}".`); } else say(r?.error ?? 'Could not save.');
    } else if (a === 'delete' && applied) {
      if (!sure(owner ? `Delete the saved search "${applied.name}" for everyone on the desk?` : `Delete your saved search "${applied.name}"?`)) return;
      const r = await callFn('POST', { action: 'delete', name: applied.name });
      if (r?.ok) { searches = r.searches ?? []; applied = null; say('Deleted.'); } else say(r?.error ?? 'Could not delete.');
    } else if (a === 'alert') {
      const al = alertFor(cleanSearch(cur) ?? applied);
      if (!al.ok) { say(al.error); return; }
      const r = await callAlert({ action: 'add', kind: al.kind, params: al.params, name: `News: ${al.params.q}`.slice(0, 40) });
      say(r?.ok ? `Alert added: a Telegram note when a new headline matches "${al.params.q}". It says nothing about direction.` : (r?.error ?? 'Could not add the alert.'));
    }
  });
  win.deskNewsSearches = { names: () => searches.map(s => s.name), apply: name => { const s = searches.find(x => x.name.toLowerCase() === String(name ?? '').toLowerCase()); if (!s || !win.deskNews?.apply) return false; applied = s; win.deskNews.apply(s); draw(); return true; } };
  draw(); load();
  return { reload: load, destroy() { host.innerHTML = ''; delete host.dataset.nsMounted; delete win.deskNewsSearches; } };
}

/** The loader's hook: the News tab calls win.deskNewsSavedMount(host) when it builds its bar, and once now if it already has. */
export function installNewsSearches({ doc = document, win = window } = {}) {
  win.deskNewsSavedMount = host => mountNewsSearches({ host, win });
  const host = doc.getElementById('nt-saved');
  return !!(host && mountNewsSearches({ host, win }));   // true when the bar was on screen to mount now; otherwise the hook mounts it when the News tab is built
}
