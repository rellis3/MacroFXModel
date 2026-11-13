// js/terminal/access.js: who is looking at the Desk Terminal, and which surfaces they may see. Loaded first, before terminalTabs.js.
//
//   1. asks the server: GET /api/desk-session (owner | viewer) and GET /api/desk-access (the surface ids this session may see);
//   2. FAILS CLOSED: if either call fails, the session is treated as a viewer and gets only the registry's DEFAULT_VISIBLE_IDS;
//   3. hides every other surface with ONE stylesheet ([data-surface="id"]{display:none}), so panels that re-render stay hidden;
//   4. for a viewer: moves off a hidden tab, turns links to other pages into plain text (they would bounce to the owner's login),
//      and sets globalThis.deskAccessState = { role, visible, mayCall } so getJson never asks for a route the server refuses them;
//   5. dispatches 'deskaccess': the page's load() waits for it.
// The registry is js/terminal/tabRegistry.js; the guard test is js/terminal/tabRegistry.test.mjs. Pure parts are exported for tests.
import { SURFACE_IDS, DEFAULT_VISIBLE_IDS, ALWAYS_OWNER_IDS, visibleFor } from './tabRegistry.js';
import './links.js';   // sets globalThis.ownerLink / ownerOnly for the page's classic script
import { viewerMayCall } from '../deskAccess.js';

/** The stylesheet text that hides every surface not in `visible`. */
export function hideCss(visible) {
  const on = new Set(visible);
  return SURFACE_IDS.filter(id => !on.has(id)).map(id => `[data-surface="${id}"]{display:none!important}`).join('\n');
}

/** Resolve the session from the two server answers (either may be null when the call failed). Fails closed. */
export function resolveSession(session, access) {
  const ok = session?.ok === true && access?.ok === true && Array.isArray(access.visible);
  const owner = ok && session.role === 'owner' && access.role === 'owner';
  const auth = session?.auth !== false;   // false only when the server says no passwords are set; unknown => show Sign out
  if (owner) return { role: 'owner', visible: [...SURFACE_IDS], failed: false, auth };
  const visible = ok ? access.visible.filter(id => SURFACE_IDS.includes(id) && !ALWAYS_OWNER_IDS.includes(id)) : visibleFor('viewer', null);
  return { role: 'viewer', visible, failed: !ok, auth };
}

const j = async (u, ms = 8000) => {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(u, { cache: 'no-store', signal: c.signal }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); }
};

// links to another page bounce a viewer to the owner's login: show them as plain text instead
const KEEP = /^(#|https?:|mailto:|\/api\/|desk-terminal(\.html)?(#|\?|$)|\/desk-terminal)/i;
function deLink(root) {
  for (const a of root.querySelectorAll('a[href]')) {
    const h = a.getAttribute('href') || '';
    if ((KEEP.test(h) && !a.hasAttribute('data-owner-link')) || a.closest('[data-keep-link]')) continue;
    const s = document.createElement('span');
    s.className = `${a.className} nolink`.trim(); s.title = 'Owner only'; s.innerHTML = a.innerHTML;
    a.replaceWith(s);
  }
}

function currentTabHidden(hidden) {
  const cur = document.querySelector('#tabs [aria-selected="true"]');
  return cur && hidden.has(cur.getAttribute('data-surface'));
}

export function applyAccess(state) {
  document.documentElement.dataset.role = state.role;
  let st = document.getElementById('deskAccessStyle');
  if (!st) { st = document.createElement('style'); st.id = 'deskAccessStyle'; document.head.appendChild(st); }
  st.textContent = hideCss(state.visible);
  if (state.role !== 'viewer') return;
  const hidden = new Set(SURFACE_IDS.filter(id => !state.visible.includes(id)));
  if (currentTabHidden(hidden)) {
    const first = [...document.querySelectorAll('#tabs button[data-surface]')].find(b => !hidden.has(b.getAttribute('data-surface')));
    first?.click();
  }
  let raf = 0;
  const run = () => { raf = 0; deLink(document.body); };
  deLink(document.body);
  new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(run); }).observe(document.body, { childList: true, subtree: true });
}

/** The Sign out chip: shows who is signed in (owner or desk) and signs out. Owner clears every zone (so the desk password can be tried next); a viewer clears the desk cookie. */
export function wireSignout(state, doc = document) {
  const b = doc.getElementById('signout'); if (!b) return;
  if (!state.auth) { b.style.display = 'none'; return; }   // no passwords set (local run): nothing to sign out of
  const zone = state.role === 'owner' ? 'all' : 'desk';
  b.style.display = '';
  b.textContent = `${state.role === 'owner' ? 'owner' : 'desk'} · Sign out`;
  b.title = state.role === 'owner' ? 'Sign out of every login (main, desk, library), then try the desk password' : 'Sign out of the Desk Terminal';
  b.onclick = async () => {
    b.disabled = true;
    let to = null;
    try { const r = await fetch(`/logout?zone=${zone}`, { method: 'POST', cache: 'no-store' }); const j = await r.json(); if (j?.ok && typeof j.redirect === 'string' && j.redirect.startsWith('/')) to = j.redirect; } catch { /* fall through */ }
    location.href = to ?? `/logout?zone=${zone}`;   // the GET route does the same and always redirects
  };
}

export async function init() {
  const [session, access] = await Promise.all([j('/api/desk-session'), j('/api/desk-access')]);
  const state = resolveSession(session, access);
  globalThis.deskAccessState = { role: state.role, visible: state.visible, failed: state.failed, mayCall: state.role === 'viewer' ? viewerMayCall : () => true };
  applyAccess(state);
  wireSignout(state);
  dispatchEvent(new Event('deskaccess'));
  return state;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && !globalThis.__deskAccessNoAutoInit) init();
