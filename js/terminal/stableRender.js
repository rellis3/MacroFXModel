// js/terminal/stableRender.js: stops the Desk Terminal jumping and flickering while you read.
// The page redraws whole sections by assigning innerHTML (load() every 5 minutes, then the enrichment feeds as each lands, and several 20-second panels). When the new HTML is the same as the last,
// the browser still throws the old nodes away and rebuilds them: the section collapses for a frame, content below jumps up and back, anything you were selecting is lost. Three small rules, applied to
// every big innerHTML assignment (a string of 400+ characters, so small UI bits and "clear this box" assignments are untouched):
//   1. the same HTML as last time, into the same element, with its content still there: skip it (nothing changed, so nothing is redrawn);
//   2. a real change: hold the element's height for a moment, so the page below does not collapse and spring back while the new content is built;
//   3. put the scroll position back if it moved by itself, unless you scrolled in the last 0.4 s (so it never fights you).
// EXEMPT: an element inside [data-sr-off] (the Helix HUD sets it on #jarvis) is left alone: its panels are rebuilt on purpose and a held height there left a stale card.
// deskRenderStats() lists the elements redrawn most, to find any that still churn. Classic script, loaded first in desk-terminal.html.
export const MIN_LEN = 400, HOLD_MS = 1500, USER_MS = 400;

/** Install on an Element-like prototype. env = { win, now, raf, setTimeout } (injected so it can be tested without a browser). */
export function installStableRender(proto, env) {
  const d = Object.getOwnPropertyDescriptor(proto, 'innerHTML');
  if (!d || !d.set || proto.__stableRender) return false;
  const { win, now = () => Date.now(), raf = f => setTimeout(f, 16), later = setTimeout } = env, stats = new Map();
  let lastUser = 0; const touch = () => { lastUser = now(); };
  for (const ev of ['wheel', 'touchmove', 'keydown', 'mousedown', 'pointerdown']) win.addEventListener?.(ev, touch, { passive: true, capture: true });
  const exempt = el => { try { return !!el.closest?.('[data-sr-off]'); } catch (e) { return false; } };
  const label = el => `${(el.tagName ?? '?').toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className ? `.${el.className.split(/\s+/)[0]}` : ''}`;
  Object.defineProperty(proto, 'innerHTML', {
    configurable: true, enumerable: d.enumerable, get: d.get,
    set(v) {
      const s = typeof v === 'string' ? v : String(v ?? '');
      if (s.length >= MIN_LEN && exempt(this)) { d.set.call(this, v); this.__sr = null; return; }
      const big = s.length >= MIN_LEN, connected = this.isConnected !== false;
      if (big) { const k = label(this), st = stats.get(k) ?? { n: 0, skipped: 0 }; st.n++; stats.set(k, st);
        if (this.__sr === s && connected && this.firstChild) { st.skipped++; return; } }                 // rule 1: identical, nothing to redraw
      let sy = null, restore = null;
      if (big && connected) {
        sy = win.scrollY;                                                                                   // rule 3: remember where you were
        const h = this.offsetHeight;
        if (h > 80 && h < 30000) {                                                                          // rule 2: hold the height while it rebuilds
          if (this.__srHold == null) { this.__srHold = this.style.minHeight ?? ''; }
          this.style.minHeight = `${h}px`; const mine = this.style.minHeight;
          restore = () => { if (this.style.minHeight === mine) this.style.minHeight = this.__srHold; this.__srHold = null; };
        }
      }
      d.set.call(this, v);
      this.__sr = big ? s : null;
      if (restore) later(restore, HOLD_MS);
      if (sy != null) raf(() => { if (win.scrollY !== sy && now() - lastUser > USER_MS) win.scrollTo?.(win.scrollX, sy); });
    },
  });
  proto.__stableRender = true;
  win.deskRenderStats = () => [...stats.entries()].map(([k, v]) => ({ element: k, redraws: v.n, skippedAsIdentical: v.skipped })).sort((a, b) => b.redraws - a.redraws).slice(0, 25);
  return true;
}

if (typeof Element !== 'undefined' && typeof window !== 'undefined' && !window.__stableRenderOff) {
  try { installStableRender(Element.prototype, { win: window, raf: f => window.requestAnimationFrame(f), later: (f, ms) => window.setTimeout(f, ms) }); } catch (e) { console.warn('stable render', e); }
}
