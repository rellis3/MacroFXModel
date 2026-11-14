/**
 * Desk Terminal shell: is the market open? One small module, no fetch. It reads the clock with js/marketClock.js and
 *   - stamps <html data-market="open|closed"> so the live boards can take a calm closed look from CSS alone (a touch less colour, never a broken look);
 *   - keeps the top-bar chip #mktchip: while the FX week is shut it says "closed · as at Fri 22:00 UTC" (the title carries the full sentence and the reopen);
 *     while it is open it stays hidden, except on a national-holiday note ("US stock market closed today (Thanksgiving)"), which is a note, not a state;
 *   - fires a 'marketstate' event on the window when the state flips (Sunday reopen, Friday close), so the live boards rebuild at once and go back to now.
 * The wording is about the last prints only: it is not a forecast and says nothing about direction.
 */
import { clockState } from '../marketClock.js';

/** Paint one instant onto the document. Pure enough to test with a stub document: returns the state. */
export function paint(doc, ms = Date.now(), prev = null) {
  const st = clockState(ms), root = doc.documentElement, chip = doc.getElementById?.('mktchip');
  root.dataset.market = st.open ? 'open' : 'closed';
  if (chip) {
    if (!st.open) { chip.hidden = false; chip.className = 'chip gold mkt-chip'; chip.textContent = st.short; chip.title = [st.label, ...st.holidays].join(' · '); }
    else if (st.holidays.length) { chip.hidden = false; chip.className = 'chip mkt-chip'; chip.textContent = st.holidays[0]; chip.title = st.holidays.join(' · '); }
    else { chip.hidden = true; chip.textContent = ''; chip.title = ''; }
  }
  return { st, flipped: prev != null && prev.open !== st.open };
}

let last = null;
export function start(doc = document, win = window, every = 30_000) {
  const tick = () => {
    const r = paint(doc, Date.now(), last); last = r.st;
    if (r.flipped) win.dispatchEvent(new win.CustomEvent('marketstate', { detail: { open: r.st.open } }));
  };
  tick();
  return win.setInterval(tick, every);
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.__mktStateStarted) { window.__mktStateStarted = true; start(); }
