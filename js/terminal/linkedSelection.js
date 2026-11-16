// js/terminal/linkedSelection.js: the DOM half of LINKED SELECTION (the state is js/terminal/selectionCore.js).
//
// What it does, with the link on:
//   writes   picking a market anywhere (an asset card, a vol-clock tile or row, the Pair page's selector and quick buttons, the Replay's market box,
//            the openReplay hook), a candle size on any chart, or a Replay date, is written to the one shared selection;
//   follows  the Pair page opens that market, the Replay loads it (same moment if one is set), the asset cards, vol-clock tiles and rows get a glow
//            ring, the strength board rings the two currencies the market is made of, and the candle size is applied to every open chart and
//            remembered for the next;
//   shows    one chip in the top bar ("NQ · 12 Nov 14:30 · 1h") that says the terminal is linked; click it to unlink (the panels keep what they
//            have) and click again to link and adopt the shared selection.
// Nothing here changes any number: it only decides which market a panel is showing. A PREVIEW feature (registry id widget.linked): terminalFeel.js
// loads this file only when the session may see that surface.
import { createSelection, ccyLegs, describeSel } from './selectionCore.js';
import { saveTf } from './timeframePills.js';
import { londonDate, londonHM, INSTRUMENTS as REPLAY_INSTS } from '../replayCore.js';
import { ALL_INSTRUMENTS } from './commandCore.js';

const esc = s => String(s).replace(/"/g, '');

export function mountLinked({ doc = document, win = window, sel = createSelection(), known = i => ALL_INSTRUMENTS.includes(i) } = {}) {
  const chip = doc.getElementById('linkchip');
  const reduced = !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let applying = false;

  const writeSel = (patch, source = 'ui') => {
    if (!sel.linked() || applying) return;
    if (patch.inst && !known(String(patch.inst).toUpperCase())) delete patch.inst;
    if (Object.keys(patch).length) sel.set(patch, source);
  };

  // ── the chip ──
  const paintChip = () => {
    if (!chip) return;
    const on = sel.linked(), s = sel.get();
    chip.hidden = false;
    chip.dataset.linked = on ? 'on' : 'off';
    chip.textContent = on ? `⛓ Linked${s.inst ? ': ' : ' · '}${describeSel(s, { londonHM })}` : '⛓ Link off';
    chip.title = on ? 'Linked: picking a market in one place moves the Pair page, Replay, strength board and vol clock with it. Click to unlink. Click the ? for how it works.' : 'Link off: each panel keeps its own market. Click to link and follow the shared selection. Click the ? for how it works.';
    chip.setAttribute('aria-pressed', String(on));
    paintHelp();
  };

  // ── the ? beside the chip: how linking works, in words (it is a preview feature and nobody should have to guess what the chip does) ──
  let help = null, pop = null;
  const helpHtml = () => {
    const on = sel.linked(), s = sel.get();
    const now = on ? (s.inst ? `Linked, sharing ${describeSel(s, { londonHM })}.` : 'Linked, but no market has been picked yet.') : 'Link off: every panel uses its own market.';
    return `<div class="lk-pop-h"><b>Linked selection</b><button type="button" class="lk-pop-x" aria-label="Close this help" data-lk-close>×</button></div>
<p class="lk-now">${now}</p>
<dl>
<dt>What it does</dt><dd>With the link on, a market you pick in one place is picked everywhere. Click an asset card, a vol-clock tile or row, a market on the Pair page or in the Replay, and the Pair page, the Replay, the strength board, the candle-size buttons and the vol clock all follow it. That market's cards glow purple.</dd>
<dt>What the chip shows</dt><dd>"Linked: GOLD · 12 Nov 14:30 · 1h" is the shared market, then the Replay moment if you picked one, then the candle size. "Linked · nothing picked yet" means the link is on and waiting for your first pick. "Link off" means it is switched off.</dd>
<dt>Turning it off</dt><dd>Click the chip, or type LINK OFF in the command line. Each panel keeps the market it shows now and goes back to using its own; picking in one place stops moving the others. Click again, or type LINK ON, to link: the panels then follow the shared market.</dd>
<dt>Where it is kept</dt><dd>Only in this browser. Nobody else sees your picks, and clearing site data resets it. It changes which market a panel shows, never a number.</dd>
</dl>
<button type="button" class="btn lk-pop-t" data-lk-toggle>${on ? 'Turn the link off' : 'Turn the link on'}</button>`;
  };
  const placePop = () => {
    if (!help || !pop) return;
    const r = help.getBoundingClientRect?.() ?? { bottom: 40 };
    if (pop.style) pop.style.top = `${Math.max(8, Math.round(r.bottom + 8))}px`;
  };
  const closeHelp = (back = true) => {
    if (!pop || pop.hidden) return;
    pop.hidden = true; help?.setAttribute('aria-expanded', 'false');
    if (back) help?.focus?.();
  };
  const openHelp = () => {
    if (!pop) return;
    pop.innerHTML = helpHtml(); placePop(); pop.hidden = false; help?.setAttribute('aria-expanded', 'true');
    pop.querySelector('[data-lk-close]')?.focus?.();
  };
  function paintHelp() { if (pop && !pop.hidden) pop.innerHTML = helpHtml(); }
  if (chip?.parentNode) {
    help = doc.createElement('button'); help.type = 'button'; help.id = 'linkhelp'; help.className = 'lk-help';
    help.setAttribute('data-surface', 'widget.linked'); help.setAttribute('aria-label', 'How linked selection works'); help.setAttribute('aria-expanded', 'false'); help.setAttribute('aria-controls', 'lk-pop');
    help.title = 'How linking works'; help.textContent = '?';
    chip.parentNode.insertBefore(help, chip.nextSibling);
    pop = doc.createElement('div'); pop.id = 'lk-pop'; pop.className = 'lk-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'How linked selection works'); pop.setAttribute('data-surface', 'widget.linked'); pop.hidden = true;
    doc.body.appendChild(pop);
  }
  const onHelp = () => (pop?.hidden === false ? closeHelp() : openHelp());
  const onPopClick = e => {
    if (e.target?.closest?.('[data-lk-close]')) { closeHelp(); return; }
    if (e.target?.closest?.('[data-lk-toggle]')) { sel.setLinked(!sel.linked(), 'chip'); return; }
  };
  const onHelpKey = e => { if (e.key === 'Escape' && pop && !pop.hidden) { e.preventDefault(); closeHelp(); } };
  const onOutside = e => { if (pop && !pop.hidden && !e.target?.closest?.('#lk-pop') && !e.target?.closest?.('#linkhelp')) closeHelp(false); };
  help?.addEventListener('click', onHelp); pop?.addEventListener('click', onPopClick); doc.addEventListener('keydown', onHelpKey); doc.addEventListener('click', onOutside);

  const onChip = () => sel.setLinked(!sel.linked(), 'chip');
  if (chip) { chip.classList.add('lk-chip'); chip.addEventListener('click', onChip); }

  // ── marks on the page: the market's cards and tiles, the strength board's two currencies ──
  const mark = () => {
    doc.querySelectorAll('[data-lk-hit],[data-lk-leg]').forEach(e => { e.removeAttribute('data-lk-hit'); e.removeAttribute('data-lk-leg'); if (e.hasAttribute('data-lk-title')) { e.removeAttribute('title'); e.removeAttribute('data-lk-title'); } });
    const { inst } = sel.get();
    if (!sel.linked() || !inst) return;
    const q = esc(inst);
    const tag = (e, text) => { if (!e.hasAttribute('title')) { e.setAttribute('title', text); e.setAttribute('data-lk-title', ''); } };
    doc.querySelectorAll(`[data-inst="${q}"],[data-lk-inst="${q}"]`).forEach(e => { e.setAttribute('data-lk-hit', ''); tag(e, `Linked to ${inst}`); });
    const legs = ccyLegs(inst);
    if (legs.length) doc.querySelectorAll('.cs-row[data-ccy]').forEach(e => { if (legs.includes(e.dataset.ccy)) { e.setAttribute('data-lk-leg', ''); tag(e, `Linked to ${inst}: ${e.dataset.ccy} is one of its two currencies`); } });
  };
  let raf = 0;
  const markSoon = () => { if (!raf) raf = win.requestAnimationFrame(() => { raf = 0; mark(); }); };
  const mo = new win.MutationObserver(markSoon);
  const mainEl = doc.querySelector('main') ?? doc.body;
  mo.observe(mainEl, { childList: true, subtree: true });

  // ── following ──
  const tabNow = () => doc.querySelector('#tabs [aria-selected="true"]')?.dataset.t ?? null;
  const pressTf = tf => doc.querySelectorAll(`.tfp-b[data-tf="${tf}"]`).forEach(b => { if (b.getAttribute('aria-pressed') !== 'true') b.click(); });
  const followTf = tf => { if (!tf) return; saveTf('pair', tf); saveTf('asset', tf); applying = true; try { pressTf(tf); } finally { applying = false; } };
  function followPair() {
    const want = sel.get().inst; if (!want) return;
    let tries = 0;
    const tick = () => {
      const s = doc.getElementById('tt-sel');
      if (s) { if (s.value !== want && typeof win.openPairPage === 'function') { applying = true; try { win.openPairPage(want, { replace: true }); } finally { applying = false; } } return; }
      if (++tries < 25) win.setTimeout(tick, 150);
    };
    tick();
  }
  // the Deep dive tab reads the shared market too: when the pick moved elsewhere, redraw it for that market (a follow replaces the history entry)
  function followDeep() {
    const want = sel.get().inst; if (!want || typeof win.openDeepPage !== 'function') return;
    const cur = win.deskDeepInst?.(); if (cur === want) return;
    applying = true; try { win.openDeepPage(want, undefined, { replace: true }); } finally { applying = false; }
  }
  function followReplay() {
    const { inst, ts } = sel.get(); if (!inst || !REPLAY_INSTS[inst]) return;   // the Replay covers 12 markets, not all of them
    const root = doc.getElementById('replay');
    if (!root?.__rp) return;   // not built yet: the click handler below leaves a request for the build
    const cur = doc.getElementById('rp-inst')?.value, curDate = doc.getElementById('rp-date')?.value;
    if (cur === inst && (!ts || londonDate(ts) === curDate)) return;
    applying = true; try { root.__rp.load(inst, ts ?? null); } finally { applying = false; }
  }
  function scrollToHit() {
    if (!sel.get().inst) return;
    let tries = 0;
    const go = () => { const e = doc.querySelector('[data-lk-hit]'); if (e && e.getBoundingClientRect) { e.scrollIntoView?.({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }); return; } if (++tries < 8) win.setTimeout(go, 250); };
    win.setTimeout(go, 200);
  }
  function follow(tab, { scroll = false } = {}) {
    if (!sel.linked()) return;
    mark();
    if (tab === 'pair') followPair();
    else if (tab === 'deep') followDeep();
    else if (tab === 'replay') followReplay();
    else if (scroll && (tab === 'assets' || tab === 'overview')) scrollToHit();
  }
  const unsub = sel.subscribe(({ changed, source }) => {
    paintChip();
    if (!sel.linked()) { mark(); return; }
    if (changed.includes('tf') || changed.includes('linked')) followTf(sel.get().tf);
    // the panel that was just used already shows the pick; every other change (a command, the chip, a replay hook) moves the panel on screen too
    if (source === 'ui') mark(); else follow(tabNow());
  });

  // ── writing ──
  const onClick = e => {
    const t = e.target?.closest?.('[data-inst],[data-lk-inst],#pair [data-pair],#pair [data-p]');
    if (t) { const inst = t.dataset.inst ?? t.dataset.lkInst ?? t.dataset.pair ?? t.dataset.p; if (inst) writeSel({ inst }); return; }
    const b = e.target?.closest?.('.tfp-b[data-tf]');
    if (b) writeSel({ tf: b.dataset.tf });
    const tabBtn = e.target?.closest?.('#tabs [data-t]');
    if (tabBtn && sel.linked()) {
      const t2 = tabBtn.dataset.t;
      if (t2 === 'replay' && !doc.getElementById('replay')?.dataset.built) {
        const { inst, ts } = sel.get();
        if (inst && REPLAY_INSTS[inst] && !win.__replayRequest) win.__replayRequest = { inst, ts: ts ?? null, date: ts ? londonDate(ts) : null };
      }
      win.setTimeout(() => follow(t2, { scroll: true }), 0);
    }
  };
  const onChange = e => {
    const id = e.target?.id;
    if (id === 'tt-sel' || id === 'dd-sel' || id === 'rp-inst') writeSel({ inst: e.target.value });
    else if (id === 'rp-date') writeSel({ date: e.target.value });
  };
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('change', onChange, true);

  // the openReplay hook (any board's "replay this"): remember the market and the moment it was asked for
  const origReplay = win.openReplay;
  if (typeof origReplay === 'function') {
    win.openReplay = (inst, ts) => { writeSel(ts != null ? { inst, date: londonDate(ts), ts } : { inst }, 'ui'); return origReplay(inst, ts); };
  }

  // the Pair page's opener (a command, an Overview row, any link): remember the market it was asked for
  const origPair = win.openPairPage;
  if (typeof origPair === 'function') win.openPairPage = (inst, o) => { writeSel({ inst }, 'ui'); return origPair(inst, o); };

  // the Deep dive's opener: remember the market it was asked for
  const origDeep = win.openDeepPage;
  if (typeof origDeep === 'function') win.openDeepPage = (inst, section, o) => { if (inst) writeSel({ inst }, 'ui'); return origDeep(inst, section, o); };
  win.deskSelection = sel;
  paintChip();
  mark();
  return {
    sel,
    destroy() {
      unsub(); mo.disconnect(); doc.removeEventListener('click', onClick, true); doc.removeEventListener('change', onChange, true);
      chip?.removeEventListener('click', onChip); if (chip) chip.hidden = true;
      help?.removeEventListener('click', onHelp); pop?.removeEventListener('click', onPopClick); doc.removeEventListener('keydown', onHelpKey); doc.removeEventListener('click', onOutside); help?.remove(); pop?.remove();
      if (typeof origReplay === 'function') win.openReplay = origReplay;
      if (typeof origPair === 'function') win.openPairPage = origPair;
      if (typeof origDeep === 'function') win.openDeepPage = origDeep;
      doc.querySelectorAll('[data-lk-hit],[data-lk-leg]').forEach(e => { e.removeAttribute('data-lk-hit'); e.removeAttribute('data-lk-leg'); if (e.hasAttribute('data-lk-title')) { e.removeAttribute('title'); e.removeAttribute('data-lk-title'); } });
      delete win.deskSelection;
    },
  };
}
