// js/terminal/flowView.js: the DOM half of the terminal's FLOW features (flowCore.js holds the rules). Loaded by terminalFeel.js only when the registry says this
// session may see at least one of them (they are PREVIEW surfaces: the owner always sees them, the desk login once the owner switches them on). Each part is
// gated by its own surface, so switching one off removes only that part:
//   panel.ov.glance     the "At a glance" block at the top of Overview
//   panel.flow.promos   links to the Insight boards from where they belong (Assets, Pair, the stress strip, the strength card, Macro)
//   panel.pair.driveshort  the short "What drives this" on the Pair page, with "Read the full analysis"
//   widget.density      comfortable / dense for the Monitor and the tables (DENSE, remembered in this browser)
// Everything is re-applied after a tab redraws its whole section (a MutationObserver per host), never drawn twice, and fails soft: a missing feed shows
// "not available", not an error. Context only, no trade signals.
import { SURFACES, buildGlance, glanceHtml, promosFor, promoHtml, slimDrivers, slimHtml, DENSITY_KEY, normaliseDensity, nextDensity } from './flowCore.js';
import { rankBundle, expectedByChance } from './unusualCore.js';
import { getBundle } from './insightData.js';
import { cardDrivers } from './cardExplain.js';
import { analystLabel, stance, summaryLine } from './humanDrivers.js';

const SLIM_KEY = 'deskSlimDrives:v1';

export function mountFlow({ doc = document, win = window } = {}) {
  const on = id => (win.deskSurfaceOn ?? globalThis.deskSurfaceOn)?.(id) === true;
  const store = () => { try { return win.localStorage ?? null; } catch { return null; } };
  const page = () => { try { return { D: typeof D === 'undefined' ? (win.D ?? null) : D, E: typeof E === 'undefined' ? (win.E ?? null) : E }; } catch { return { D: null, E: null }; } };   // the page script's `let D` / `let E`
  const getJson = win.getJson ?? (async u => { try { const r = await win.fetch(u, { credentials: 'same-origin' }); return await r.json(); } catch { return null; } });
  const done = { glance: false, promos: false, slim: false, density: false };
  const observers = [];
  const watch = (el, fn) => {
    if (!el) return;
    let q = false;
    const run = () => { q = false; try { fn(); } catch (e) { win.console?.warn?.('flow', e); } };
    const mo = new win.MutationObserver(() => { if (!q) { q = true; win.setTimeout(run, 0); } });
    mo.observe(el, { childList: true });
    observers.push(mo);
    run();
  };

  // ── opening what a tile or link points at ──
  function goTab(t) { const b = doc.querySelector(`#tabs [data-t="${t}"]`); if (!b || b.hidden) return false; if (b.getAttribute('aria-selected') !== 'true') b.click(); return true; }
  function openInsight(surface) {
    const key = String(surface).replace(/^panel\.insight\./, '');
    if (!goTab('insight')) return false;
    win.setTimeout(() => win.deskInsight?.show?.(key), 60);
    return true;
  }
  function go(target) {
    if (!target) return false;
    if (target === 'ov.regime') { const e = doc.querySelector('[data-surface="panel.ov.regime"]'); e?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); return !!e; }
    if (target.startsWith('insight.')) return openInsight(`panel.${target}`);
    if (target.startsWith('panel.insight.')) return openInsight(target);
    if (target.startsWith('tab.')) return goTab(target.slice(4));
    return false;
  }
  doc.addEventListener('click', e => {
    const t = e.target.closest?.('[data-go]'); if (t && t.closest('.fl-glance')) { e.preventDefault(); go(t.dataset.go); return; }
    const p = e.target.closest?.('[data-promo]'); if (p) { e.preventDefault(); go(p.dataset.promo); }
  });

  // ── F7 at a glance ──
  let glanceBusy = false, glanceTries = 0;
  async function drawGlance() {
    const sec = doc.getElementById('overview');
    if (!sec || glanceBusy || sec.querySelector('.fl-glance')) return;
    glanceBusy = true; glanceTries++;
    try {
      const { D: d, E: ev } = page();
      const host = doc.createElement('div'); host.className = 'fl-host'; host.setAttribute('data-surface', SURFACES.glance);
      const input = { run: d?.run ?? null, ws: ev?.['world-stress'] ?? null, ranking: d?.ranking ?? null, events: d?.ev ?? null, dqText: doc.getElementById('dqchip')?.textContent ?? '' };
      host.innerHTML = glanceHtml(buildGlance(input));   // first paint with what the page already holds
      sec.insertBefore(host, sec.firstChild);
      // then the two feeds the page does not hold: the price read of strength and the unusual ranking (both cached for minutes by their own routes)
      const [strength, bundle] = await Promise.all([getJson('/api/ccy-strength'), getBundle({ fetchJson: getJson })]);
      let rank = null, expected = null;
      if (bundle?.ok) { try { rank = rankBundle(bundle); expected = expectedByChance(rank.rows); } catch { /* leave it out */ } }
      if (host.isConnected) host.innerHTML = glanceHtml(buildGlance({ ...input, ws: page().E?.['world-stress'] ?? input.ws, strength, rank, expected }));
    } finally {
      glanceBusy = false;
      // Overview was redrawn while the feeds were loading (the page does that as its own feeds arrive): the block went with it, so draw it again (a few tries at most)
      if (!sec.querySelector('.fl-glance') && sec.children.length > 2 && glanceTries < 6) win.setTimeout(drawGlance, 60); else if (sec.querySelector('.fl-glance')) glanceTries = 0;
    }
  }

  // ── F8 / F10 promoted links ──
  const promoRow = (host, items) => { const d = doc.createElement('div'); d.className = 'fl-promos'; d.setAttribute('data-surface', SURFACES.promos); d.setAttribute('data-host', host); d.innerHTML = items.map(promoHtml).join(''); return d; };
  function placePromos() {
    const put = (hostName, parent, where) => {
      if (!parent || parent.querySelector(`.fl-promos[data-host="${hostName}"]`)) return;
      const items = promosFor(hostName); if (!items.length) return;
      const row = promoRow(hostName, items);
      if (where === 'start') parent.insertBefore(row, parent.firstChild); else parent.appendChild(row);
    };
    put('assets', doc.getElementById('assets'), 'start');
    put('macro', doc.getElementById('macro'), 'start');
    const pair = doc.getElementById('pair'); if (pair?.querySelector('.tt-pick')) put('pair', pair, 'start');
    const ws = doc.getElementById('wstrip')?.firstElementChild; put('stress', ws, 'end');
    const st = doc.querySelector('[data-surface="panel.ov.strength"] .card'); put('strength', st, 'end');
  }

  // ── the slim "What drives this" ──
  function slimPair() {
    const pair = doc.getElementById('pair'); if (!pair) return;
    const full = pair.querySelector('.card.hd'); if (!full || full.dataset.slimmed) return;
    const inst = String(pair.querySelector('#tt-sel')?.value ?? '').toUpperCase(); if (!inst) return;
    const { D: d } = page(); if (!d?.run?.head?.ok) return;
    let x; try { x = cardDrivers(d.run, inst, { cap: 12 }); } catch { return; }
    const m = slimDrivers(x, { analystLabel }); if (!m || !m.points) return;
    full.dataset.slimmed = '1';
    const market = typeof win.nice === 'function' ? win.nice(inst) : inst;
    const box = doc.createElement('div'); box.className = 'card fl-slim'; box.setAttribute('data-surface', SURFACES.slim);
    box.innerHTML = slimHtml(m, { market, summary: summaryLine(x.analysts, market), stanceFn: stance }) + '<button type="button" class="btn fl-more" aria-expanded="false">Read the full analysis</button>';
    full.parentNode.insertBefore(box, full);
    const btn = box.querySelector('.fl-more');
    const set = (isFull, remember = true) => {
      full.hidden = !isFull; box.querySelector('.fl-slim-body').hidden = isFull;
      btn.textContent = isFull ? 'Show the short version' : 'Read the full analysis'; btn.setAttribute('aria-expanded', String(isFull));
      if (remember) { try { store()?.setItem(SLIM_KEY, isFull ? 'full' : 'slim'); } catch { /* private window */ } }
    };
    btn.addEventListener('click', () => set(full.hidden));
    let pref = 'slim'; try { pref = store()?.getItem(SLIM_KEY) ?? 'slim'; } catch { /* private window */ }
    set(pref === 'full', false);
  }

  // ── density ──
  const getDensity = () => { try { return normaliseDensity(store()?.getItem(DENSITY_KEY)); } catch { return 'comfortable'; } };
  function applyDensity(v) {
    const d = normaliseDensity(v);
    doc.documentElement?.setAttribute?.('data-density', d);
    for (const b of doc.querySelectorAll?.('[data-density-btn]') ?? []) { b.textContent = d === 'dense' ? 'Density: dense' : 'Density: comfortable'; b.setAttribute('aria-pressed', String(d === 'dense')); }
    return d;
  }
  function setDensity(v) { const d = applyDensity(v); try { store()?.setItem(DENSITY_KEY, d); } catch { /* private window */ } try { win.dispatchEvent?.(new Event('deskdensity')); } catch { /* no events */ } return d; }
  function placeDensityButton() {
    const bar = doc.querySelector('#monitor .mon-bar'); if (!bar || bar.querySelector('[data-density-btn]')) return;
    bar.insertBefore(Object.assign(doc.createElement('span'), { innerHTML: '<button type="button" class="btn" data-density-btn data-surface="widget.density" title="Tighter rows and smaller type on the Monitor and the tables. Remembered in this browser. Also: DENSE on the command line."></button>' }).firstChild, bar.querySelector('.mon-stamp'));
    bar.querySelector('[data-density-btn]').addEventListener('click', () => setDensity(nextDensity(getDensity())));
    applyDensity(getDensity());
  }

  // ── start ──
  if (on(SURFACES.glance)) { done.glance = true; watch(doc.getElementById('overview'), drawGlance); }
  if (on(SURFACES.promos)) {
    done.promos = true;
    for (const id of ['assets', 'macro', 'pair', 'overview', 'wstrip']) watch(doc.getElementById(id), placePromos);
    placePromos();
  }
  if (on(SURFACES.slim)) { done.slim = true; watch(doc.getElementById('pair'), slimPair); }
  if (on(SURFACES.density)) { done.density = true; applyDensity(getDensity()); watch(doc.getElementById('monitor'), placeDensityButton); }
  win.deskFlow = { glance: () => drawGlance(), go, density: { get: getDensity, set: setDensity, toggle: () => setDensity(nextDensity(getDensity())) }, state: () => ({ ...done }) };
  return Object.values(done).some(Boolean) ? { done, destroy() { for (const o of observers) o.disconnect(); delete win.deskFlow; } } : null;
}
