// js/terminal/overviewSections.js: the Overview tab in five sections behind a pill row (Today / Currencies / Risk & markets / News & events / The desk).
// An OWNER-ONLY PREVIEW (registry surface widget.ov.sections, loaded by terminalFeel.js only when the session may see it). With it off a desk login sees the
// Overview exactly as it always was: one long page. With it on, this file adds a pill row UNDER the "At a glance" block and the market-open and time chips
// (they stay on top, always visible) and shows only the blocks of the open section.
//
// How it works (the same way analyticsSplit.js splits Analytics): desk-terminal.html still draws the whole Overview in one go (overview() writes #overview,
// enrichOverview() fills #xo a little later); this file only toggles a class on the blocks that are already there. Nothing is removed, re-ordered or
// re-drawn, so every block keeps its listeners, its surface id and its Access switch. A block that is hidden for the session (a trade, P&L or internal block for
// a desk login) stays hidden: a section only decides which of the allowed blocks are on screen. The class is scoped to #overview in overview-sections.css, so
// a block the Workspace tab has moved into a tile is never hidden there.
// ORDER with sections on (a flex column in overview-sections.css, so the order does not depend on which module drew first): the map ("The desk's world", pinned for
// EVERY section, with a fold control remembered per browser) > the pills > Today only: the At a glance block, then the risk-flag history card > the open section's blocks.
// Pure rules: overviewSubtabs.js (tested by overviewSubtabs.test.mjs); the DOM part is tested over the stand-in DOM by overviewSections.test.mjs.
import { OV_SUBS, ALL_BLOCKS, BLOCK_SUB, SURFACE, LS_KEY, HERO_LS, OV_PINNED, visibleSubs, parseHash, hashFor, pickSub, pillsHtml, stepSub, edgeSub, subById, subOfBlock, heroFolded, heroGroup } from './overviewSubtabs.js';

const OFF = 'ovs-off', SOLO = 'ovs-solo', ON = 'ovs-on', FOLDED = 'ovs-folded';
const HERO = OV_PINNED[0];
const tokens = e => String(e.className ?? '').split(/\s+/).filter(Boolean);
const hasCls = (e, c) => tokens(e).includes(c);
/** Add or remove one class (className edits so it works the same on the real DOM and the stand-in). Returns true when something changed. */
function setCls(e, c, on) {
  const t = tokens(e), has = t.includes(c);
  if (on === has) return false;
  e.className = (on ? [...t, c] : t.filter(x => x !== c)).join(' ');
  return true;
}
const kidsOf = n => (n.children ? [...n.children] : (n.kids ?? []).filter(k => k.tag !== '#text'));
const surfaceOf = e => e.getAttribute?.('data-surface') ?? '';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hasContent = e => !!(String(e.textContent ?? '').trim() || kidsOf(e).length);

export function mountOverviewSections({ doc = document, win = window } = {}) {
  const sec = doc.getElementById('overview');
  if (!sec || sec.dataset.ovsMounted) return null;
  sec.dataset.ovsMounted = '1';
  const isOn = id => win.deskSurfaceOn?.(id) ?? true;
  const store = () => { try { return win.localStorage ?? null; } catch { return null; } };
  let current = null, sig = '', applying = false, timer = null, mo = null, barSig = '';
  const phone = () => { try { return !!win.matchMedia?.('(max-width: 700px)')?.matches; } catch { return false; } };
  const heroStored = () => { try { const j = JSON.parse(store()?.getItem(HERO_LS) ?? '{}'); return j && typeof j === 'object' ? j : {}; } catch { return {}; } };
  const heroEl = () => sec.querySelector(`.sfc[data-surface="${HERO}"]`);
  const topOf = e => { let n = e; while (n && n.parentNode && n.parentNode !== sec) n = n.parentNode; return n && n.parentNode === sec ? n : null; };

  const blocks = () => [...sec.querySelectorAll('.sfc')].filter(e => ALL_BLOCKS.includes(surfaceOf(e)));
  const saved = () => { try { return store()?.getItem(LS_KEY) ?? ''; } catch { return ''; } };
  const isBlock = e => e.matches?.('.sfc') && ALL_BLOCKS.includes(surfaceOf(e));
  const isGrid = e => e.matches?.('.grid');

  /** Show the open section: toggle the class on blocks, then on the grids that wrap them (innermost first), and put the pill row in place. */
  function apply() {
    if (applying) return;
    applying = true;
    try {
      const bs = blocks();
      if (!bs.length) return;   // still "Drawing…"
      const present = new Set(bs.filter(hasContent).map(surfaceOf));
      const visible = visibleSubs(isOn, id => present.has(id));
      const active = pickSub({ hash: win.location?.hash, saved: current ?? saved(), visible });
      current = active;
      const split = visible.length >= 2 && !!active;
      // the pill row: rebuilt only when the sections on offer or the open one changed (so applying twice changes nothing and the observer settles)
      const nextSig = `${visible.join(',')}|${active}`;
      const existing = sec.querySelector('.ovs-pills');
      if (nextSig !== sig || (split && !existing) || (!split && existing)) {
        sig = nextSig;
        existing?.remove();
        if (split) {
          const wrap = doc.createElement('div');
          wrap.innerHTML = pillsHtml(active, visible);
          const row = wrap.firstChild;
          if (row) {
            // the pills go right under the map; with no map on the page, under the glance; else first (the css order puts them where they belong either way)
            const anchor = (heroEl() && topOf(heroEl())) || topOf(sec.querySelector('.fl-glance'));
            sec.insertBefore(row, anchor ? anchor.nextSibling : sec.firstChild);
          }
        }
      }
      // the flex column that fixes the order, and the open section for the css that shows the glance and the flag card on Today only
      setCls(sec, ON, split);
      if (split) { if (sec.dataset.ovsSub !== active) sec.dataset.ovsSub = active; } else if (sec.dataset.ovsSub !== undefined) sec.removeAttribute?.('data-ovs-sub');
      pinHero(split, active);
      // blocks
      for (const b of bs) setCls(b, OFF, split && BLOCK_SUB[surfaceOf(b)] !== active);
      // the one heading Overview draws between blocks ("News, releases and risks"): the pills name the sections now
      for (const k of kidsOf(sec)) if (hasCls(k, 'sec')) setCls(k, OFF, split);
      // grids that wrap only hidden blocks go too; a grid left with one visible child takes the whole row
      const grids = [...sec.querySelectorAll('.grid')].reverse();
      for (const g of grids) {
        const kids = kidsOf(g), tracked = kids.filter(k => isBlock(k) || isGrid(k));
        const allOff = split && tracked.length > 0 && tracked.every(k => hasCls(k, OFF));
        setCls(g, OFF, allOff);
        const shown = kids.filter(k => !hasCls(k, OFF)).length;
        setCls(g, SOLO, split && !allOff && tracked.length > 0 && shown === 1);
      }
    } finally { applying = false; }
  }
  /** The pinned map: never hidden by a section; the bar above it carries the Fold / Show control (and the title when folded). */
  function pinHero(split, active) {
    const hero = heroEl(); let bar = sec.querySelector('.ovs-herobar');
    if (!hero || !split) { bar?.remove(); if (hero) setCls(hero, FOLDED, false); barSig = ''; return; }
    const folded = heroFolded(active, heroStored(), phone());
    const title = String(hero.querySelector('h2')?.textContent ?? '').trim(), lbl = String(hero.querySelector('.lbl')?.textContent ?? '').trim();
    const next = `${folded}|${folded ? `${lbl}|${title}` : ''}`;
    if (!bar) { bar = doc.createElement('div'); bar.className = 'ovs-herobar'; bar.setAttribute('data-surface', 'widget.ov.sections'); sec.insertBefore(bar, hero); barSig = ''; }
    if (next !== barSig) {
      barSig = next;
      bar.innerHTML = `${folded ? `<span class="ovs-herotxt"><span class="lbl">${esc(lbl || "The desk's world")}</span>${title ? ` <b>${esc(title)}</b>` : ''}</span>` : '<span class="ovs-herotxt"></span>'}<button type="button" class="btn ovs-herobtn" data-ovs-hero aria-expanded="${!folded}" title="${folded ? 'Show the map and globe' : 'Fold the map and globe to a slim strip'}">${folded ? 'Show map ▼' : 'Fold map ▲'}</button>`;
    }
    setCls(hero, FOLDED, folded);
  }
  const later = () => { if (timer) win.clearTimeout?.(timer); timer = win.setTimeout(() => { timer = null; apply(); }, 40); };

  function choose(id, o = {}) {
    if (!subById(id)) return false;
    const wasFolded = heroFolded(current, heroStored(), phone());
    current = id;
    try { store()?.setItem(LS_KEY, id); } catch { /* private window */ }
    try { win.history?.replaceState?.(null, '', hashFor(id)); } catch { /* no history */ }
    apply();
    if (wasFolded && !heroFolded(current, heroStored(), phone())) win.setTimeout(() => { try { win.redrawHero?.(); } catch { /* next refresh */ } }, 30);
    const row = sec.querySelector('.ovs-pills');
    if (o.focus) sec.querySelector(`[data-ovsub="${id}"]`)?.focus?.();
    if (row && row.getBoundingClientRect().top < 0) row.scrollIntoView?.({ block: 'start', behavior: 'smooth' });   // came from far down the page: bring the new section's pills into view
    return true;
  }

  sec.addEventListener('click', e => {
    const f = e.target.closest?.('[data-ovs-hero]');
    if (f) {
      const group = heroGroup(current), now = heroFolded(current, heroStored(), phone()), st = heroStored();
      st[group] = now ? 'open' : 'folded';
      try { store()?.setItem(HERO_LS, JSON.stringify(st)); } catch { /* private window */ }
      apply();
      if (now) win.setTimeout(() => { try { win.redrawHero?.(); } catch { /* the map draws itself on the next refresh */ } }, 30);   // it was hidden: draw it again at its real width
      return;
    }
    const b = e.target.closest?.('[data-ovsub]'); if (b) choose(b.dataset.ovsub, { focus: true });
  });
  sec.addEventListener('keydown', e => {
    const b = e.target.closest?.('[data-ovsub]'); if (!b) return;
    const vis = visibleSubs(isOn, id => blocks().some(x => surfaceOf(x) === id && hasContent(x)));
    const to = e.key === 'ArrowRight' ? stepSub(current, 1, vis) : e.key === 'ArrowLeft' ? stepSub(current, -1, vis) : e.key === 'Home' ? edgeSub(false, vis) : e.key === 'End' ? edgeSub(true, vis) : null;
    if (to) { e.preventDefault(); choose(to, { focus: true }); }
  });
  // an address like #overview/currencies lands on that section (and opens the Overview tab if another tab is showing)
  const onHash = () => {
    const p = parseHash(win.location?.hash);
    if (!p?.sub) return;
    const tab = doc.querySelector('#tabs [data-t="overview"]');
    if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click();
    choose(p.sub);
    if (p.block) win.setTimeout(() => { const el = blocks().find(x => surfaceOf(x) === p.block); el?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); }, 60);
  };
  win.addEventListener?.('hashchange', onHash);

  if (win.MutationObserver) { mo = new win.MutationObserver(later); mo.observe(sec, { childList: true, subtree: true }); }

  /** The hook for other places (the command line, links): a section id (today, currencies...) or one block (panel.ov.priceread or priceread). */
  win.openOverviewSection = id => {
    const sub = subById(id) ? id : subOfBlock(id);
    if (!sub) return false;
    const tab = doc.querySelector('#tabs [data-t="overview"]');
    if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click();
    const ok = choose(sub);
    const block = subById(id) ? null : (String(id).startsWith('panel.ov.') ? id : `panel.ov.${id}`);
    if (ok && block) win.setTimeout(() => { blocks().find(x => surfaceOf(x) === block)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); }, 60);
    return ok;
  };
  win.deskOverviewSections = { show: choose, sections: () => OV_SUBS.map(s => s.id), surface: SURFACE, current: () => current };
  apply();
  onHash();   // opened on a #overview/... address
  return {
    destroy() {
      mo?.disconnect?.(); win.removeEventListener?.('hashchange', onHash); if (timer) win.clearTimeout?.(timer);
      sec.querySelector('.ovs-pills')?.remove(); sec.querySelector('.ovs-herobar')?.remove(); setCls(sec, ON, false); sec.removeAttribute?.('data-ovs-sub');
      for (const e of [...blocks(), ...sec.querySelectorAll('.grid'), ...kidsOf(sec).filter(k => hasCls(k, 'sec')), ...(heroEl() ? [heroEl()] : [])]) { setCls(e, OFF, false); setCls(e, SOLO, false); setCls(e, FOLDED, false); }
      delete sec.dataset.ovsMounted; delete win.deskOverviewSections; delete win.openOverviewSection;
    },
  };
}

/** terminalFeel.js calls this when the session may see the preview. */
export const mountOverview = () => mountOverviewSections() !== null;
