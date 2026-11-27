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
 *   Today          the same market and side, for a hedge held one session (08:00-17:00 London): partners ranked by in-session
 *                  hourly co-movement, the session ratio beside the daily one, and what the session ratio removed out of sample
 *                  (js/hedgeTodayCore.js, /api/hedge-today; evidence hedge-today, hedge-today-pick, hedge-today-daytype).
 *
 * The "Hedge signals" summary card (hedge-signals.html, /api/hedge-signals) was removed on 2026-11-06 when those signals
 * were retired: they were a spread mean-reversion system, not hedges, and were never tested (MD files/HEDGING_VS_SPREAD.md).
 *
 * Evidence (corrEvidence.js): the Book hedge is tested by hedge-finder-book (2026-11-06): its top row cut a proxy
 * book's daily 5% tail (VALIDATED, hedge-finder-book-es) but drawdowns and Sharpe were not shown (UNDERPOWERED), and the
 * currency's own USD pair cut the tail more. The per-market finder keeps its UNTESTED chip.
 */
import * as M from './corrMath.js';
import { chipsFor } from './corrEvidence.js';
import { rankToday, ccysOf } from '../hedgeTodayCore.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fin = v => v != null && Number.isFinite(v);
const sg = (v, dp = 2) => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(dp)}` : '–');
const name = id => esc(M.labelOf(id));
const DIR = { STRONG_LONG: 1, LONG: 1, SHORT: -1, STRONG_SHORT: -1 };

const H = { target: null, side: 1, inv: false, carry: null, today: null, todayErr: null, todayAsked: false, view: '' };

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
/** The FX leg(s) of `id` with no policy rate in /api/carry-vol (CNH, ZAR: the desk reads eight central banks). */
export const carryMissing = (id, cv) => (cv?.rates && /^[A-Z]{6}$/.test(id) ? [id.slice(0, 3), id.slice(3)].filter(c => !fin(cv.rates[c])) : []);
const carryTxt = (c, id, cv) => (fin(c) ? `<span class="${c >= 0 ? 'ct-earn' : 'ct-pay'}" title="policy-rate gap, per year, before costs">${c >= 0 ? 'earns' : 'pays'} ${Math.abs(c).toFixed(2)}%/yr</span>`
  : carryMissing(id, cv).length ? `<span class="muted" title="no policy rate for ${esc(carryMissing(id, cv).join(', '))} in the carry feed">carry: no ${esc(carryMissing(id, cv).join('/'))} rate</span>` : '');

/** One ranked row: the candidate, its side, a -1..1 track with the p10-p90 band and today's correlation. */
export function rowHtml(r, { cv = null, w = 60 } = {}) {
  const W = 150, X = v => ((v + 1) / 2) * W;
  const band = fin(r.p10) && fin(r.p90) ? `<rect x="${X(r.p10)}" y="3" width="${Math.max(2, X(r.p90) - X(r.p10))}" height="12" rx="3" fill="rgba(var(--pur2rgb),.22)"/>` : '';
  const bar = `<svg viewBox="0 0 ${W} 18" width="${W}" height="18" role="img" aria-label="correlation ${sg(r.rho)}, p10 to p90 ${sg(r.p10)} to ${sg(r.p90)}"><rect x="0" y="8" width="${W}" height="2" fill="var(--line)"/><line x1="${W / 2}" x2="${W / 2}" y1="1" y2="17" stroke="var(--line2)"/>${band}<line x1="${W / 2}" x2="${X(r.rho)}" y1="9" y2="9" stroke="${r.rho >= 0 ? 'var(--pur)' : 'var(--gold)'}" stroke-width="4" stroke-linecap="round"/><circle cx="${X(r.rho)}" cy="9" r="4" fill="var(--tx)"/></svg>`;
  return `<div class="ct-hrow"><span class="ct-hn"><b class="mono">${name(r.id)}</b> <span class="chip ${r.side === 'long' ? 'pur' : 'gold'}" title="${r.side === 'long' ? 'moves against: held long alongside' : 'moves with: held short against'}">${esc(r.side)}</span></span>
<span class="ct-hb">${bar}<span class="mono">${sg(r.rho)}</span></span>
<span class="ct-hms"><span class="ct-hm mono" title="share of ${esc(w)}-day windows over the last year with the same sign as today">held ${fin(r.share) ? Math.round(r.share * 100) + '%' : '–'}</span>
<span class="ct-hm mono" title="min-variance hedge ratio: units of this per unit of the exposure, from the window's volatilities">ratio ${fin(r.ratio) ? r.ratio.toFixed(2) : '–'}</span>
<span class="ct-hm mono" title="the same ratio from a recency-weighted fit (EWMA, 250 days, decay 0.97). Out of sample over 12 test sets it removed about 1pp more variance than the plain window ratio (hedge-method-comparison)">ewma ${fin(r.ratioEwma) ? r.ratioEwma.toFixed(2) : '–'}</span>
<span class="ct-hm mono" title="share of the exposure's variance that ratio would have removed in-window (r²)">cuts ${Math.round(r.varCut * 100)}%</span>
<span class="ct-hm mono" title="${fin(r.oos?.cut) ? `what this ratio really removed over the last ${esc(r.oos.n)} days, each day hedged with the ratio from the ${esc(w)} days before it${fin(r.oosEwma?.cut) ? `; the recency-weighted ratio removed ${Math.round(r.oosEwma.cut * 100)}%` : ''}` : 'not enough days'}">held up ${fin(r.oos?.cut) ? Math.round(r.oos.cut * 100) + '%' : '–'}</span>
<span class="ct-hm">${carryTxt(carryOf(r.id, r.side === 'long' ? 1 : -1, cv), r.id, cv)}</span>${M.failedOos(r) ? '<span class="chip dn" title="this ratio added variance on the days it had not seen: ranked last">failed out of sample</span>' : ''}</span></span></div>`;
}
export function listHtml(rows, opts = {}) {
  return rows.length ? `<div class="ct-hlist">${rows.map(r => rowHtml(r, opts)).join('')}</div>` : '<p class="muted">No candidate with a correlation of at least 0.10 over this window.</p>';
}

/** The Today card: one-session hedges for H.target on H.side (the evidence is in js/hedgeTodayCore.js). */
export function todayHtml(S, panel, { err = null } = {}) {
  const head = `<div class="ch"><span class="lbl">Today · hedge for one session</span><span class="r muted">08:00–17:00 London${panel ? ` · ${esc(panel.sessions.length)} sessions to ${esc(panel.sessions.at(-1))}` : ''}</span></div>`;
  if (!panel) return `<div class="card ct-today">${head}<p class="muted">${esc(err ?? 'The session panel builds when this view is first opened (OANDA hourly bars for every market, about a minute); it fills in here on its own.')}</p></div>`;
  const sym = panel.syms.find(x => M.idOf(x) === H.target);
  if (!sym) return `<div class="card ct-today">${head}<p class="muted">${name(H.target)} is not in the session panel (it holds the correlation build's ${esc(panel.syms.length)} OANDA markets). Pick one of those above.</p></div>`;
  const legs = ccysOf(sym), view = legs.includes(H.view) ? H.view : '';
  let rows = rankToday(panel, sym, { view: view || null }).map(r => ({ ...r, id: M.idOf(r.sym) }));
  if (H.side < 0) rows = rows.map(r => ({ ...r, side: r.side === 'long' ? 'short' : 'long' }));   // hedging a short flips every leg
  const daily = new Map(M.rankHedges(S, H.target, rows.map(r => r.id).filter(id => M.has(S, id)), { w: 60, minAbs: 0 }).map(r => [r.id, r]));
  const keep = rows.filter(r => !r.cutsView), cut = rows.filter(r => r.cutsView);
  const W = 120, X = v => ((v + 1) / 2) * W;
  const row = r => {
    const d = daily.get(r.id), twin = r.shares.length && Math.abs(r.rho) >= 0.8;
    const bar = `<svg viewBox="0 0 ${W} 18" width="${W}" height="18" role="img" aria-label="session correlation ${sg(r.rho)}"><rect x="0" y="8" width="${W}" height="2" fill="var(--line)"/><line x1="${W / 2}" x2="${W / 2}" y1="1" y2="17" stroke="var(--line2)"/><line x1="${W / 2}" x2="${X(r.rho)}" y1="9" y2="9" stroke="${r.rho >= 0 ? 'var(--pur)' : 'var(--gold)'}" stroke-width="4" stroke-linecap="round"/><circle cx="${X(r.rho)}" cy="9" r="4" fill="var(--tx)"/></svg>`;
    const flag = r.cutsView ? ` <span class="chip dn" title="it carries ${esc(view)}, the currency you are betting on: holding it against the trade cancels the view">cuts your ${esc(view)} view</span>`
      : twin ? ` <span class="chip gold" title="shares ${esc(r.shares.join(', '))} with ${name(H.target)} and moves almost one for one: holding it against the trade mostly closes the position">near-twin</span>` : '';
    return `<div class="ct-hrow"><span class="ct-hn"><b class="mono">${name(r.id)}</b> <span class="chip ${r.side === 'long' ? 'pur' : 'gold'}">${esc(r.side)}</span>${flag}</span>
<span class="ct-hb">${bar}<span class="mono">${sg(r.rho)}</span></span>
<span class="ct-hms"><span class="ct-hm mono" title="share of the last 120 sessions' 20-session correlations with today's sign">held ${fin(r.share) ? Math.round(r.share * 100) + '%' : '–'}</span>
<span class="ct-hm mono" title="session ratio: units of this per unit of ${name(H.target)}, from 08:00-17:00 hourly moves over the last 120 sessions, recent ones weighted more (EWMA 0.95)"><b>session ${fin(r.ratio) ? r.ratio.toFixed(2) : '–'}</b></span>
<span class="ct-hm mono" title="the daily 60-day ratio the Hedge finder below uses (NY close to NY close, overnight included)">daily ${fin(d?.ratio) ? d.ratio.toFixed(2) : '–'}</span>
<span class="ct-hm mono" title="${r.held ? `what the session ratio really removed from ${name(H.target)}'s 08:00-17:00 move over the last ${esc(r.held.n)} sessions, each hedged with the ratio from the sessions before it` : 'not enough sessions'}">held up ${r.held ? Math.round(r.held.cut * 100) + '%' : '–'}</span></span></div>`;
  };
  const pills = legs.length ? `<div class="tt-pills" role="group" aria-label="what the trade is a bet on"><button type="button" data-hview="" aria-pressed="${!view}">The whole move</button>${legs.map(c => `<button type="button" data-hview="${esc(c)}" aria-pressed="${view === c}">A bet on ${esc(c)}</button>`).join('')}</div>` : '';
  return `<div class="card ct-today">${head}${pills ? `<div class="ct-bar">${pills}</div>` : ''}
<p class="tt-sum">Hedges for being <b>${H.side > 0 ? 'long' : 'short'} ${name(H.target)}</b> from the London morning to the New York afternoon${view ? `, keeping the ${esc(view)} view` : ''}.</p>
${keep.length ? `<div class="ct-hlist">${keep.slice(0, 8).map(row).join('')}</div>` : '<p class="muted">No market with a session correlation of at least 0.10.</p>'}
${cut.length ? `<details class="ct-cut"><summary class="muted">${esc(cut.length)} more that carry ${esc(view)} (these cancel the view rather than hedge it)</summary><div class="ct-hlist">${cut.slice(0, 6).map(row).join('')}</div></details>` : ''}
<p class="tt-note">Ranked by the 20-session correlation of 08:00–17:00 hourly moves × how often its sign held. "session" = the hedge size from those hourly moves, which is what a hedge opened in the morning and closed in the afternoon is exposed to; "daily" = the size the Hedge finder below uses, which carries the overnight relationship into the session. Tested 2017–2026: the session size removed about 5pp more of the session's variance than the daily one on 12 of 12 test sets, most where the hedge is another asset class (indices against gold or yen); ranking by session moves beat ranking by daily moves on 7 of 8 markets. Sizing from past release days only did not help. Variance, not profit: no costs, no direction. "A bet on" sets aside partners that carry the currency you are betting on: holding them against the trade cancels the view.</p>${chipsFor('today')}</div>`;
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
${todayHtml(S, H.today, { err: H.todayErr })}
<div class="ct-grid">
<div class="card"><div class="ch"><span class="lbl">Hedge finder</span><span class="r muted">ranked by |correlation| × how often its sign held</span></div>
<div class="ct-bar"><label class="ct-sel">Market <select data-htgt><optgroup label="Today's book">${book.map(c => opt(c.id, `${M.labelOf(c.id)} · ${c.side > 0 ? 'long' : 'short'}`)).join('')}${bookNote}</optgroup><optgroup label="Markets">${ids.map(id => opt(id, M.labelOf(id))).join('')}</optgroup></select></label>
<div class="tt-pills" role="group"><button type="button" data-hside="1" aria-pressed="${H.side > 0}">Long it</button><button type="button" data-hside="-1" aria-pressed="${H.side < 0}">Short it</button></div>
<div class="tt-pills" role="group"><button type="button" data-hinv="0" aria-pressed="${!H.inv}">Any sign</button><button type="button" data-hinv="1" aria-pressed="${H.inv}">Inverse only</button></div></div>
<p class="tt-sum">Hedges for being <b>${H.side > 0 ? 'long' : 'short'} ${name(H.target)}</b> over the last ${esc(win)} days.</p>
<div id="ct-hlist">${listHtml(rows.slice(0, 12), { cv: H.carry, w: win })}</div>
<p class="tt-note">Bar: today's ${esc(win)}-day correlation (purple = moves with it, gold = moves against it); the shaded band is where that correlation sat 80% of the time over the last year. "held" = share of those windows with today's sign. "ratio" = the min-variance hedge size, "ewma" = the same size from a recency-weighted fit, "held up" = the variance the ratio really removed on the last 250 days it had not seen (against "cuts", which is in-window), "cuts" = the variance it would have removed in-window. Past co-movement only.</p>${chipsFor('hedges')}</div>
<div class="card"><div class="ch"><span class="lbl">Book hedge</span><span class="r"><span class="chip">descriptive · read-only</span></span></div>${bookHedgeHtml(bh, exp, win)}</div>
</div>`;
}

export function bookHedgeHtml(bh, exp, win) {
  if (!exp) return `<p class="muted">No desk book loaded today, so there is no exposure to offset.</p>${chipsFor('bookHedge')}`;
  if (!bh) return `<p class="muted">The book has no net currency exposure among the eight currencies.</p>${chipsFor('bookHedge')}`;
  const capped = exp.before && fin(exp.before[bh.ccy]) && exp.before[bh.ccy] !== bh.net ? ` (${sg(exp.before[bh.ccy], 1)} before the ±${esc(exp.cap)} cap)` : '';
  return `<p class="tt-sum">Biggest net exposure: <b>${bh.net > 0 ? 'long' : 'short'} ${esc(bh.ccy)} ${sg(bh.net, 1)}</b>${esc(capped)}.</p>
<p class="muted">Read as the ${esc(bh.ccy)} basket (against the other seven), ${bh.net > 0 ? 'long' : 'short'}. These are the markets that have moved against that over the last ${esc(win)} days. Pairs that contain ${esc(bh.ccy)} are left out: trading those cuts the exposure rather than hedging it.</p>
${listHtml(bh.rows.slice(0, 8), { cv: H.carry, w: win })}<p class="tt-note">What has offset this exposure, not a trade the desk has made. Tested on a 26-year proxy book: holding the top row daily cut the daily 5% tail by about 9% but not the drawdowns, cost about 0.06 Sharpe in spreads, did nothing for USD or JPY exposures, and the currency's own USD pair cut the tail more. The book itself is on Overview.</p>${chipsFor('bookHedge')}`;
}

/** After the HTML is in: fetch the carry rates once, then redraw. */
export function after(box, S, { getJson, redraw } = {}) {
  if (!box) return;
  if (!H.today && !H.todayAsked) {
    H.todayAsked = true;
    const load = retry => getJson('/api/hedge-today').then(d => {
      if (d?.ok && d.panel) { H.today = d.panel; H.todayErr = null; }
      else { H.todayErr = d?.error ?? 'The session panel did not load.'; if (retry && d?.building) setTimeout(() => load(false), 40_000); }
      if (box.isConnected) redraw?.();
    }).catch(e => { H.todayErr = `The session panel did not load: ${e?.message ?? e}`; if (box.isConnected) redraw?.(); });
    load(true);
  }
  if (!H.carry && !H.carryAsked) { H.carryAsked = true; getJson('/api/carry-vol').then(cv => { if (cv?.ok) { H.carry = cv; if (box.isConnected) redraw?.(); } }); }
}
export function onClick(_e, t, redraw) {
  const ds = t.dataset;
  if (ds.hside) { H.side = +ds.hside; redraw(); }
  else if (ds.hinv) { H.inv = ds.hinv === '1'; redraw(); }
  else if (ds.hview != null) { H.view = ds.hview; redraw(); }
}
export function onChange(e, redraw) {
  const s = e.target;
  if (s.matches('[data-htgt]')) { H.target = s.value; H.view = ''; const opt = s.selectedOptions?.[0]; if (opt && /· (long|short)$/.test(opt.textContent)) H.side = /long$/.test(opt.textContent) ? 1 : -1; redraw(); }
}
export const _state = H;   // tests
