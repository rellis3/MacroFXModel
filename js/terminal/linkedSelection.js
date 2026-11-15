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
    chip.textContent = on ? `⛓ ${describeSel(s, { londonHM })}` : '⛓ unlinked';
    chip.title = on ? 'Linked: picking a market in one place moves the Pair page, Replay, strength board and vol clock with it. Click to unlink.' : 'Unlinked: each panel keeps its own market. Click to link and follow the shared selection.';
    chip.setAttribute('aria-pressed', String(on));
  };
  const onChip = () => sel.setLinked(!sel.linked(), 'chip');
  if (chip) { chip.classList.add('lk-chip'); chip.addEventListener('click', onChip); }

  // ── marks on the page: the market's cards and tiles, the strength board's two currencies ──
  const mark = () => {
    doc.querySelectorAll('[data-lk-hit]').forEach(e => e.removeAttribute('data-lk-hit'));
    doc.querySelectorAll('[data-lk-leg]').forEach(e => e.removeAttribute('data-lk-leg'));
    const { inst } = sel.get();
    if (!sel.linked() || !inst) return;
    const q = esc(inst);
    doc.querySelectorAll(`[data-inst="${q}"],[data-lk-inst="${q}"]`).forEach(e => e.setAttribute('data-lk-hit', ''));
    const legs = ccyLegs(inst);
    if (legs.length) doc.querySelectorAll('.cs-row[data-ccy]').forEach(e => { if (legs.includes(e.dataset.ccy)) e.setAttribute('data-lk-leg', ''); });
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
      if (s) { if (s.value !== want && typeof win.openPairPage === 'function') { applying = true; try { win.openPairPage(want); } finally { applying = false; } } return; }
      if (++tries < 25) win.setTimeout(tick, 150);
    };
    tick();
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
    if (id === 'tt-sel' || id === 'rp-inst') writeSel({ inst: e.target.value });
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
  if (typeof origPair === 'function') win.openPairPage = inst => { writeSel({ inst }, 'ui'); return origPair(inst); };

  win.deskSelection = sel;
  paintChip();
  mark();
  return {
    sel,
    destroy() {
      unsub(); mo.disconnect(); doc.removeEventListener('click', onClick, true); doc.removeEventListener('change', onChange, true);
      chip?.removeEventListener('click', onChip); if (chip) chip.hidden = true;
      if (typeof origReplay === 'function') win.openReplay = origReplay;
      if (typeof origPair === 'function') win.openPairPage = origPair;
      doc.querySelectorAll('[data-lk-hit],[data-lk-leg]').forEach(e => { e.removeAttribute('data-lk-hit'); e.removeAttribute('data-lk-leg'); });
      delete win.deskSelection;
    },
  };
}
