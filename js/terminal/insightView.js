// js/terminal/insightView.js: the Insight tab (PREVIEW surface tab.insight): a row of boards that read what the terminal already holds in a new way.
// Each board is its own registered surface (panel.insight.*) so the owner can switch one off for the desk login, and its code is imported only when
// its pill is first opened. The tab itself is loaded by terminalFeel.js only when the registry says this session may see it.
//
// To add a board: write js/terminal/<name>View.js exporting mount<Name>(host, ctx) -> { destroy }, add a row to PANELS below (the literal
// data-surface="panel.insight.<key>" in `pill` is what the registry guard reads), register the surface in tabRegistry.js and give it a command
// in commandCore.js (INSIGHT_WORDS). ctx: { getBundle(), fetchJson(url), go(target), win, doc }.
import { getBundle } from './insightData.js';

export const PANELS = [
  { key: 'unusual', surface: 'panel.insight.unusual', pill: '<button type="button" class="in-tab" data-p="unusual" data-surface="panel.insight.unusual">Unusual now</button>', load: () => import('./unusualView.js').then(m => m.mountUnusual) },
  { key: 'matrix', surface: 'panel.insight.matrix', pill: '<button type="button" class="in-tab" data-p="matrix" data-surface="panel.insight.matrix">Cross-asset</button>', load: () => import('./matrixView.js').then(m => m.mountCross) },
  { key: 'rotation', surface: 'panel.insight.rotation', pill: '<button type="button" class="in-tab" data-p="rotation" data-surface="panel.insight.rotation">Sector rotation</button>', load: () => import('./matrixView.js').then(m => m.mountRotation) },
  { key: 'fxmatrix', surface: 'panel.insight.fxmatrix', pill: '<button type="button" class="in-tab" data-p="fxmatrix" data-surface="panel.insight.fxmatrix">Currency matrix</button>', load: () => import('./fxMatrixView.js').then(m => m.mountFx) },
  { key: 'gold', surface: 'panel.insight.gold', pill: '<button type="button" class="in-tab" data-p="gold" data-surface="panel.insight.gold">Gold</button>', load: () => import('./goldView.js').then(m => m.mountGold) },
  { key: 'reach', surface: 'panel.insight.reach', pill: '<button type="button" class="in-tab" data-p="reach" data-surface="panel.insight.reach">Level reach</button>', load: () => import('./reachView.js').then(m => m.mountReach) },
  { key: 'flags', surface: 'panel.insight.flags', pill: '<button type="button" class="in-tab" data-p="flags" data-surface="panel.insight.flags">Risk flags</button>', load: () => import('./flagsView.js').then(m => m.mountFlags) },
  { key: 'economies', surface: 'panel.insight.economies', pill: '<button type="button" class="in-tab" data-p="economies" data-surface="panel.insight.economies">Economies</button>', load: () => import('./economiesView.js').then(m => m.mountEconomies) },
];
const LS = 'deskInsight:v1';

/** '#insight/unusual' -> 'unusual' (any other hash -> null). */
export const panelFromHash = h => { const m = /^#insight\/([a-z0-9-]+)$/.exec(String(h ?? '')); return m && PANELS.some(p => p.key === m[1]) ? m[1] : null; };

export function mountInsight({ doc = document, win = window, fetchJson = null } = {}) {
  const sec = doc.getElementById('insight');
  if (!sec || sec.dataset.mounted) return null;
  sec.dataset.mounted = '1';
  const getJson = fetchJson ?? (async url => { const r = await win.fetch(url, { credentials: 'same-origin' }); try { return await r.json(); } catch { return { ok: false, error: `The server answered ${r.status}.` }; } });
  const store = () => { try { return win.localStorage ?? null; } catch { return null; } };
  const on = id => win.deskSurfaceOn?.(id) ?? true;
  const first = () => PANELS.find(p => on(p.surface)) ?? null;

  sec.innerHTML = `<div class="in-tools"><div class="in-tabs" role="tablist" aria-label="Insight boards">${PANELS.map(p => p.pill).join('')}</div></div>
<p class="in-intro muted">Boards that read the data the terminal already holds in a new way. Each says how far to trust it. Context for the day, not trade signals.</p>
${PANELS.map(p => `<div class="in-panel" id="in-p-${p.key}" data-p="${p.key}" data-surface="${p.surface}" hidden></div>`).join('')}`;
  const tabs = [...sec.querySelectorAll('.in-tab')];
  const mounted = {};
  const ctx = {
    win, doc, fetchJson: getJson, getBundle: () => getBundle({ fetchJson: getJson }),
    go(target) {
      if (!target) return false;
      if (String(target).startsWith('panel.macro.')) return typeof win.openMacroBoard === 'function' ? win.openMacroBoard(target) !== false : false;
      if (String(target).startsWith('panel.insight.')) return show(target.slice('panel.insight.'.length));
      return typeof win.openPairPage === 'function' ? (win.openPairPage(target), true) : false;
    },
  };
  let current = null;
  async function show(key) {
    const p = PANELS.find(x => x.key === key && on(x.surface)); if (!p) return false;
    current = key;
    for (const t of tabs) t.setAttribute('aria-selected', t.dataset.p === key ? 'true' : 'false');
    for (const h of sec.querySelectorAll('.in-panel')) h.hidden = h.dataset.p !== key;
    try { store()?.setItem(LS, key); } catch { /* private window */ }
    if (!mounted[key]) {
      const host = sec.querySelector(`#in-p-${key}`);
      mounted[key] = {};   // claim it now so a second click while the module loads does not mount twice
      try { const fn = await p.load(); mounted[key] = fn(host, ctx) ?? {}; } catch (e) { host.innerHTML = `<div class="in-empty">This board could not load (${String(e?.message ?? e).replace(/</g, '&lt;')}).</div>`; }
    }
    return true;
  }
  sec.addEventListener('click', e => { const t = e.target.closest?.('.in-tab'); if (t) show(t.dataset.p); });
  const tabBtn = doc.querySelector('#tabs [data-t="insight"]');
  const enter = () => { if (current) return; let k = panelFromHash(win.location?.hash); if (!k) { try { k = store()?.getItem(LS); } catch { k = null; } } if (!PANELS.some(p => p.key === k && on(p.surface))) k = first()?.key; if (k) show(k); };
  tabBtn?.addEventListener('click', () => win.setTimeout(enter, 0));
  if (tabBtn?.getAttribute('aria-selected') === 'true') enter();
  win.deskInsight = { show: k => show(k), panels: () => PANELS.map(p => p.key) };
  return { show, destroy() { for (const m of Object.values(mounted)) m?.destroy?.(); sec.innerHTML = ''; delete sec.dataset.mounted; } };
}
