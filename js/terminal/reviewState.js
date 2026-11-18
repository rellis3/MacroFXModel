// js/terminal/reviewState.js: was this card actually REVIEWED? Pure.
//
// Owner 2026-11-18: a Bitcoin card that is all grey with no detail looks "not reviewed", and the word on it (neutral/flat) reads as a call. Three different
// things were sharing one grey chip:
//   unreviewed  no card, or a flat rating with no thesis and no conviction behind it: nobody (no analyst, no head) put a view on this market. NOT a neutral call.
//   neutral     reviewed, and the view is "no lean": there is a thesis and a conviction. A call in its own right.
//   call        a long or short.
// The reason is returned so the card can say WHY it is unreviewed instead of showing a bare grey chip.
const DIR = { STRONG_LONG: 2, LONG: 1, FLAT: 0, NEUTRAL: 0, SHORT: -1, STRONG_SHORT: -2 };
const CONVICTIONS = ['low', 'medium', 'high'];
const MIN_WHY = 25;   // characters: a real sentence, not a stub

/** { state: 'unreviewed' | 'neutral' | 'call', reason: string } for one desk card (head.book.instruments[n]). */
export function reviewState(c) {
  if (!c || typeof c !== 'object') return { state: 'unreviewed', reason: 'The desk run has no card for this market today.' };
  if (!Object.prototype.hasOwnProperty.call(DIR, c.rating)) return { state: 'unreviewed', reason: 'The card carries no rating.' };
  if (DIR[c.rating] !== 0) return { state: 'call', reason: '' };
  const why = String(c.why ?? '').trim(), hasConv = CONVICTIONS.includes(String(c.conviction ?? '').toLowerCase());
  if (why.length < MIN_WHY && !hasConv) return { state: 'unreviewed', reason: 'The desk run wrote a flat rating with no thesis and no conviction: this market was not reviewed, so grey here is not a neutral call.' };
  if (why.length < MIN_WHY) return { state: 'unreviewed', reason: 'The card has a flat rating but no written thesis, so there is nothing to show it was reviewed.' };
  return { state: 'neutral', reason: '' };
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/** The chip for a card: the direction as before for a call, "Neutral · reviewed" (with its reason) or a dashed "Not reviewed". `word` = the rating word the page already uses. */
export function stateChip(c, word) {
  const r = reviewState(c);
  if (r.state === 'unreviewed') return `<span class="chip" style="border-style:dashed;opacity:.8" title="${esc(r.reason)}">◌ Not reviewed</span>`;
  if (r.state === 'neutral') return `<span class="chip" title="Reviewed: the desk looked at this market and has no lean. The thesis is on the card.">● Neutral · reviewed</span>`;
  return null;   // a call: the caller draws the arrow chip as it always did
}

/** The text under the heading for an unreviewed card (replaces a bare grey thesis). '' for a reviewed card. */
export function unreviewedNote(c) {
  const r = reviewState(c);
  return r.state === 'unreviewed' ? `<div class="muted" style="font-size:12.5px;margin:6px 0">${esc(r.reason)} Nothing here is a view on the market.</div>` : '';
}
