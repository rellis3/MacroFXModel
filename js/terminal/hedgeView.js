/**
 * Desk Terminal, Correlations & hedges tab: the Hedges sub-view (the modern form of correlations.html's Hedge Finder).
 *
 *   Hedge finder   for any market or today's book card, the candidates that have offset it: correlation over the
 *                  window, the side that offsets, how often the sign held over the last year (with the p10-p90 band of
 *                  the rolling correlation), the min-variance ratio, the variance it would have removed in-window
 *                  (r²), and the carry of the hedge leg where the policy-rate gap is known (/api/carry-vol).
 *   Book hedge     the desk book's biggest net currency exposure (/api/desk-run, as the terminal already loads it) and
 *                  the instruments that have moved against it. Read-only and descriptive.
 *
 * The "Hedge signals" summary card (hedge-signals.html, /api/hedge-signals) was removed on 2026-11-06 when those signals
 * were retired: they were a spread mean-reversion system, not hedges, and were never tested (MD files/HEDGING_VS_SPREAD.md).
 *
 * Nothing here is tested as a hedge in the Evidence Book: every list carries the UNTESTED chip (corrEvidence.js).
 */
import * as M from './corrMath.js';
import { chipsFor } from './corrEvidence.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fin = v => v != null && Number.isFinite(v);
const sg = (v, dp = 2) => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(dp)}` : '–');
const name = id => esc(M.labelOf(id));
const DIR = { STRONG_LONG: 1, LONG: 1, SHORT: -1, STRONG_SHORT: -1 };

const H = { target: null, side: 1, inv: false, carry: null };

/** Today's live book cards (rated long or short) as [{ id, side, size }], biggest first. */
export function bookCards(D) {
  const cards = D?.cards ?? D?.run?.head?.book?.instruments ?? {};
  return Object.entries(cards).filter(([, c]) => DIR[c?.rating]).map(([id, c]) => ({ id, side: DIR[c.rating], size: +c.size || 0 })).sort((a, b) => b.size - a.size);
}
/** Carry of holding `id` on `side` (annual %, policy-rate gap) from /api/carry-vol's rates; null for non-FX. */
export function carryOf(id, side, cv) {
  const r = cv?.rates; if (!r || !/^[A-Z]{6}$/.test(id)) return null;
  const b = r[id.slice(0, 3)], q = r[id.slice(3)];
  return fin(b) && fin(q) ? side * (b - q) : null;
}
const carryTxt = c => (fin(c) ? `<span class="${c >= 0 ? 'ct-earn' : 'ct-pay'}" title="policy-rate gap, per year, before costs">${c >= 0 ? 'earns' : 'pays'} ${Math.abs(c).toFixed(2)}%/yr</span>` : '');

/** One ranked row: the candidate, its side, a -1..1 track with the p10-p90 band and today's correlation. */
export function rowHtml(r, { cv = null, w = 60 } = {}) {
  const W = 150, X = v => ((v + 1) / 2) * W;
  const band = fin(r.p10) && fin(r.p90) ? `<rect x="${X(r.p10)}" y="3" width="${Math.max(2, X(r.p90) - X(r.p10))}" height="12" rx="3" fill="rgba(180,169,255,.22)"/>` : '';
  const bar = `<svg viewBox="0 0 ${W} 18" width="${W}" height="18" role="img" aria-label="correlation ${sg(r.rho)}, p10 to p90 ${sg(r.p10)} to ${sg(r.p90)}"><rect x="0" y="8" width="${W}" height="2" fill="#1f2950"/><line x1="${W / 2}" x2="${W / 2}" y1="1" y2="17" stroke="#2c3866"/>${band}<line x1="${W / 2}" x2="${X(r.rho)}" y1="9" y2="9" stroke="${r.rho >= 0 ? '#8b7cf6' : '#e8b85a'}" stroke-width="4" stroke-linecap="round"/><circle cx="${X(r.rho)}" cy="9" r="4" fill="#eef0fb"/></svg>`;
  return `<div class="ct-hrow"><span class="ct-hn"><b class="mono">${name(r.id)}</b> <span class="chip ${r.side === 'long' ? 'pur' : 'gold'}" title="${r.side === 'long' ? 'moves against: held long alongside' : 'moves with: held short against'}">${esc(r.side)}</span></span>
<span class="ct-hb">${bar}<span class="mono">${sg(r.rho)}</span></span>
<span class="ct-hms"><span class="ct-hm mono" title="share of ${esc(w)}-day windows over the last year with the same sign as today">held ${fin(r.share) ? Math.round(r.share * 100) + '%' : '–'}</span>
<span class="ct-hm mono" title="min-variance hedge ratio: units of this per unit of the exposure, from the window's volatilities">ratio ${fin(r.ratio) ? r.ratio.toFixed(2) : '–'}</span>
<span class="ct-hm mono" title="share of the exposure's variance that ratio would have removed in-window (r²)">cuts ${Math.round(r.varCut * 100)}%</span>
<span class="ct-hm">${carryTxt(carryOf(r.id, r.side === 'long' ? 1 : -1, cv))}</span></span></span></div>`;
}
export function listHtml(rows, opts = {}) {
  return rows.length ? `<div class="ct-hlist">${rows.map(r => rowHtml(r, opts)).join('')}</div>` : '<p class="muted">No candidate with a correlation of at least 0.10 over this window.</p>';
}

function targets(S, D) {
  const book = bookCards(D).filter(c => M.has(S, c.id));
  const ids = M.SETS.key.concat(S.ids).filter((id, i, a) => a.indexOf(id) === i && M.has(S, id));
  return { book, ids };
}

/** The sub-view's HTML (state kept in this module; the tab redraws on any control). */
export function html(S, { win = 60, book: D = {}, winPills = () => '' } = {}) {
  const { book, ids } = targets(S, D);
  if (!H.target || !M.has(S, H.target)) { const b = book[0]; H.target = b?.id ?? 'EURUSD'; H.side = b?.side ?? 1; }
  const cands = S.ids.filter(id => id !== H.target);
  let rows = M.rankHedges(S, H.target, cands, { w: win, inverseOnly: H.inv });
  if (H.side < 0) rows = rows.map(r => ({ ...r, side: r.side === 'long' ? 'short' : 'long' }));   // hedging a short flips every leg
  const opt = (id, lab) => `<option value="${esc(id)}"${id === H.target ? ' selected' : ''}>${esc(lab)}</option>`;
  const bookNote = book.length ? '' : '<option disabled>(no live book cards)</option>';
  const exp = D?.run?.head?.book?.exposure, bh = exp ? M.bookHedges(S, exp, S.ids, { w: win }) : null;
  return `<div class="ct-bar">${winPills(win)}</div>
<div class="ct-grid">
<div class="card"><div class="ch"><span class="lbl">Hedge finder</span><span class="r muted">ranked by |correlation| × how often its sign held</span></div>
<div class="ct-bar"><label class="ct-sel">Market <select data-htgt><optgroup label="Today's book">${book.map(c => opt(c.id, `${M.labelOf(c.id)} · ${c.side > 0 ? 'long' : 'short'}`)).join('')}${bookNote}</optgroup><optgroup label="Markets">${ids.map(id => opt(id, M.labelOf(id))).join('')}</optgroup></select></label>
<div class="tt-pills" role="group"><button type="button" data-hside="1" aria-pressed="${H.side > 0}">Long it</button><button type="button" data-hside="-1" aria-pressed="${H.side < 0}">Short it</button></div>
<div class="tt-pills" role="group"><button type="button" data-hinv="0" aria-pressed="${!H.inv}">Any sign</button><button type="button" data-hinv="1" aria-pressed="${H.inv}">Inverse only</button></div></div>
<p class="tt-sum">Hedges for being <b>${H.side > 0 ? 'long' : 'short'} ${name(H.target)}</b> over the last ${esc(win)} days.</p>
<div id="ct-hlist">${listHtml(rows.slice(0, 12), { cv: H.carry, w: win })}</div>
<p class="tt-note">Bar: today's ${esc(win)}-day correlation (purple = moves with it, gold = moves against it); the shaded band is where that correlation sat 80% of the time over the last year. "held" = share of those windows with today's sign. "ratio" = the min-variance hedge size, "cuts" = the variance it would have removed in-window. Past co-movement only.</p>${chipsFor('hedges')}</div>
<div class="card"><div class="ch"><span class="lbl">Book hedge</span><span class="r"><span class="chip">descriptive · read-only</span></span></div>${bookHedgeHtml(bh, exp, win)}</div>
</div>`;
}

export function bookHedgeHtml(bh, exp, win) {
  if (!exp) return '<p class="muted">No desk book loaded today, so there is no exposure to offset.</p>';
  if (!bh) return '<p class="muted">The book has no net currency exposure among the eight currencies.</p>';
  const capped = exp.before && fin(exp.before[bh.ccy]) && exp.before[bh.ccy] !== bh.net ? ` (${sg(exp.before[bh.ccy], 1)} before the ±${esc(exp.cap)} cap)` : '';
  return `<p class="tt-sum">Biggest net exposure: <b>${bh.net > 0 ? 'long' : 'short'} ${esc(bh.ccy)} ${sg(bh.net, 1)}</b>${esc(capped)}.</p>
<p class="muted">Read as the ${esc(bh.ccy)} basket (against the other seven), ${bh.net > 0 ? 'long' : 'short'}. These are the markets that have moved against that over the last ${esc(win)} days. Pairs that contain ${esc(bh.ccy)} are left out: trading those cuts the exposure rather than hedging it.</p>
${listHtml(bh.rows.slice(0, 8), { cv: H.carry, w: win })}<p class="tt-note">What has offset this exposure, not a trade the desk has made or tested. The book itself is on Overview.</p>`;
}

/** After the HTML is in: fetch the carry rates once, then redraw. */
export function after(box, S, { getJson, redraw } = {}) {
  if (!box) return;
  if (!H.carry && !H.carryAsked) { H.carryAsked = true; getJson('/api/carry-vol').then(cv => { if (cv?.ok) { H.carry = cv; if (box.isConnected) redraw?.(); } }); }
}
export function onClick(_e, t, redraw) {
  const ds = t.dataset;
  if (ds.hside) { H.side = +ds.hside; redraw(); }
  else if (ds.hinv) { H.inv = ds.hinv === '1'; redraw(); }
}
export function onChange(e, redraw) {
  const s = e.target;
  if (s.matches('[data-htgt]')) { H.target = s.value; const opt = s.selectedOptions?.[0]; if (opt && /· (long|short)$/.test(opt.textContent)) H.side = /long$/.test(opt.textContent) ? 1 : -1; redraw(); }
}
export const _state = H;   // tests
