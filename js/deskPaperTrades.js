/**
 * Paper trades on the trade watcher's own rules (owner request, 2026-11-05). For each sized card the watcher watched:
 *   ENTRY  the first time price trades inside the card's entry zone (js/tradeWatch.js cardPlan), between 08:00 and
 *          21:00 London; a card with no zone enters at the open of the first bar at or after 08:00 London.
 *          A card whose invalidation is touched before it ever reaches its zone is never entered (the watcher sends
 *          nothing more on a card after its invalidation).
 *   EXIT   the first of: the first target (today's p50 on the card's side), the invalidation, or the close of the last
 *          bar before 21:00 London. A bar that touches both the target and the invalidation counts as the
 *          invalidation. In the bar that entered from outside the zone, only the invalidation can be hit (the
 *          bar's other extreme may have come before the entry).
 *   COST   one spread per round trip, in price units (measured where the repo has it, else a conservative default).
 * R is in the day's unit u (js/deskScore.js unitOf) and in % of the entry price; size × R weights it by the card.
 *
 * Description of trading the watcher's alerts, not the pre-registered test (prereg H1). It never feeds the Desk Pack
 * or any analyst prompt (forge/DESK_ANALYST_PIPELINE_PREREG.md §7). Pure. Tested in js/deskPaperTrades.test.mjs.
 */
import { cardPlan } from './tradeWatch.js';
import { unitOf, londonMs, windowFor } from './deskScore.js';
import { SLOTS, slotMs } from './deskUpdate.js';

export const PAPER_VERSION = 2;   // 2: no trade when the first target is already behind the entry (2026-11-05)
export const MIN_AHEAD_U = 0.1;
export const PAPER_LABEL = "Description of trading the watcher's alerts, not the pre-registered test; few days so far.";
const DIR = { STRONG_LONG: 1, LONG: 1, SHORT: -1, STRONG_SHORT: -1 };
const r4 = x => (Number.isFinite(x) ? +x.toFixed(4) : null);

/**
 * The cards the watcher watches: the book with each session update applied, and any card the updates flipped or
 * flattened dropped (as server.js _twTick does). view: js/deskUpdate.js liveView(book, updates).
 */
/**
 * The cards as the day went, with no look-ahead: each sized directional card from the morning book, carrying `stopMs`,
 * the time of the first session update that flipped it or made it FLAT (null if none). A card is traded until then and
 * closed at that moment if still open, rather than dropped for the whole day (which would use what the update knew later).
 * Same-direction size changes keep the morning size: the paper record follows the morning plan.
 */
export function cardsAsTheDayWent(book, updates, date) {
  const out = {};
  for (const [n, c] of Object.entries(book?.instruments ?? {})) {
    const d0 = DIR[c.rating] ?? 0; if (!d0) continue;
    let stopMs = null;
    for (const slot of Object.keys(SLOTS)) {
      const up = updates?.slots?.[slot], ch = (up?.changes ?? []).find(x => x.instrument === n);
      if (ch && (DIR[ch.to] ?? 0) !== d0) { stopMs = Date.parse(up.at ?? '') || slotMs(date, slot); break; }
    }
    out[n] = { ...c, stopMs };
  }
  return out;
}

/** Superseded by cardsAsTheDayWent (kept for callers that only have the final view). */
export function watchedCards(book, view) {
  const out = {};
  for (const [n, c] of Object.entries(book?.instruments ?? {})) {
    const v = view ? view[n] : { rating: c.rating, size: c.size };
    if (!v) continue;
    const d0 = DIR[c.rating] ?? 0, d1 = DIR[v.rating] ?? 0;
    if (d0 && d0 === d1) out[n] = { ...c, rating: v.rating, size: v.size ?? c.size };
  }
  return out;
}

// Conservative default spreads where nothing measured is passed in. FX in pips (JPY pairs: pip 0.01, else 0.0001);
// everything else in basis points of price (OANDA CFD retail spreads, rounded up).
const FX_DEFAULT_PIPS = 3;
const BPS = { NQ: 2, SPX500: 2, US30: 2, US2000: 4, DE30: 2, UK100: 2, GOLD: 3, SILVER: 6, COPPER: 10, PLATINUM: 15, PALLADIUM: 25,
  WTI: 6, BRENT: 6, NATGAS: 25, SOYBEAN: 15, WHEAT: 20, CORN: 20, SUGAR: 25, BTCUSD: 15 };
export const isFx = inst => /^[A-Z]{6}$/.test(inst) && !BPS[inst];
export const pipOf = inst => (/JPY$/.test(inst) ? 0.01 : 0.0001);
/** A default round-trip spread for one market, in price units, at price `price`. */
export function defaultSpread(inst, price) {
  if (isFx(inst)) return +(FX_DEFAULT_PIPS * pipOf(inst)).toFixed(6);
  return Number.isFinite(price) ? price * (BPS[inst] ?? 10) / 1e4 : 0;
}

/**
 * One card against its bars ({ time: sec, open, high, low, close }, ascending; M1 or M5).
 * Returns null when the card is not traded by the watcher (FLAT, size 0, nothing to watch).
 */
export function simulateCard(inst, card, bars, { date, spread = null } = {}) {
  const plan = cardPlan(card); if (!plan) return null;
  const size = Number(card.size), dir = plan.dir, u = unitOf(card.levels);
  const base = { inst, dir, rating: card.rating, size, zone: plan.zone, invalid: plan.invalid, target: plan.target, u: u ?? null };
  if (!u) return { ...base, reason: 'no-entry', note: 'no forecast levels (no unit u)' };
  const { entryMs } = windowFor(date), stopMs = Number.isFinite(card.stopMs) ? card.stopMs : null, exitMs = Math.min(windowFor(date).exitMs, stopMs ?? Infinity);
  const win = (bars ?? []).filter(b => b.time * 1000 >= entryMs && b.time * 1000 < exitMs);
  if (!win.length && stopMs != null && stopMs <= entryMs) return { ...base, reason: 'no-entry', note: 'flipped or flattened by a session update before 08:00' };
  if (!win.length) return { ...base, reason: 'no-entry', note: 'no bars between 08:00 and 21:00 London' };
  const tgt = plan.target, inv = plan.invalid;
  const hitInv = b => inv != null && (dir > 0 ? b.low <= inv : b.high >= inv);
  const hitTgt = b => tgt != null && (dir > 0 ? b.high >= tgt : b.low <= tgt);
  // a level reached by a gap fills at the bar's open, not at the level
  const fillInv = b => (dir > 0 ? Math.min(b.open, inv) : Math.max(b.open, inv));
  const fillTgt = b => (dir > 0 ? Math.max(b.open, tgt) : Math.min(b.open, tgt));
  let i0 = -1, entry = null, entryMode = plan.zone ? 'zone' : 'open-08:00', fullBar = true;
  if (!plan.zone) { i0 = 0; entry = win[0].open; }
  else {
    const [lo, hi] = plan.zone;
    for (let i = 0; i < win.length; i++) {
      const b = win[i], prev = i ? win[i - 1].close : b.open;
      const inBar = b.low <= hi && b.high >= lo, gapped = !inBar && Math.max(prev, b.open) >= lo && Math.min(prev, b.open) <= hi;
      if (inBar || gapped) {
        i0 = i; entry = inBar ? Math.min(hi, Math.max(lo, b.open)) : b.open;
        fullBar = entry === b.open;
        break;
      }
      if (hitInv(b)) return { ...base, reason: 'no-entry', note: `invalidated at ${new Date(b.time * 1000).toISOString()} before reaching the zone` };
    }
    if (i0 < 0) return { ...base, reason: 'no-entry', note: 'price never traded in the zone' };
  }
  // the first target must still be ahead of the entry (by MIN_AHEAD_U of the day's unit); a zone that reaches the
  // target, or an 08:00 entry after price already passed it, is a plan with nothing to gain: not traded (owner, fix 1)
  if (tgt != null && dir * (tgt - entry) < MIN_AHEAD_U * u) {
    return { ...base, reason: 'no-entry', targetBehind: true, entryAt: new Date(win[i0].time * 1000).toISOString(), entry: r6(entry),
      note: `target ${tgt} already ${dir * (tgt - entry) <= 0 ? 'behind' : 'within ' + MIN_AHEAD_U + ' u of'} the entry ${r6(entry)}: no trade` };
  }
  let exit = null, exitAt = null, reason = 'close';
  for (let i = i0; i < win.length; i++) {
    const b = win[i], first = i === i0, iv = hitInv(b), tg = hitTgt(b) && (!first || fullBar);
    if (iv) { exit = fillInv(b); exitAt = b.time; reason = 'invalid'; break; }
    if (tg) { exit = fillTgt(b); exitAt = b.time; reason = 'target'; break; }
  }
  if (exit == null) { const last = win.at(-1); exit = last.close; exitAt = last.time; if (stopMs != null && stopMs < windowFor(date).exitMs) reason = 'update'; }
  const sp = Number.isFinite(spread) ? spread : defaultSpread(inst, entry);
  const grossR = dir * (exit - entry) / u, costR = sp / u, netR = grossR - costR;
  return { ...base, entryMode, entryAt: new Date(win[i0].time * 1000).toISOString(), entry: r6(entry), exitAt: new Date(exitAt * 1000).toISOString(), exit: r6(exit), reason,
    spread: r6(sp), grossR: r4(grossR), costR: r4(costR), R: r4(netR), grossPct: r4(dir * (exit - entry) / entry * 100), pct: r4((dir * (exit - entry) - sp) / entry * 100),
    sizeR: r4(size * netR), grossSizeR: r4(size * grossR) };
}
const r6 = x => (Number.isFinite(x) ? +x.toFixed(6) : null);

/** The day's summary over the simulated cards. */
export function summarise(trades) {
  const done = trades.filter(t => t.reason !== 'no-entry'), sum = k => done.reduce((s, t) => s + (t[k] ?? 0), 0);
  const wins = done.filter(t => t.R > 0).length;
  return { cards: trades.length, trades: done.length, noEntry: trades.length - done.length, targetBehind: trades.filter(t => t.targetBehind).length, wins, hitRate: done.length ? r4(wins / done.length) : null,
    byReason: Object.fromEntries(['target', 'invalid', 'close', 'update'].map(k => [k, done.filter(t => t.reason === k).length])),
    meanR: done.length ? r4(sum('R') / done.length) : null, meanGrossR: done.length ? r4(sum('grossR') / done.length) : null,
    sumSizeR: r4(sum('sizeR')), sumGrossSizeR: r4(sum('grossSizeR')), costSizeR: r4(sum('grossSizeR') - sum('sizeR')) };
}

/**
 * The whole day. cards: watchedCards(...); barsByInst: { INST: bars }; spreads: { INST: price units } (optional).
 * Returns { date, version, label, trades, summary }.
 */
export function paperDay(cards, barsByInst, { date, spreads = {} } = {}) {
  const trades = [];
  for (const n of Object.keys(cards ?? {}).sort()) {
    const t = simulateCard(n, cards[n], barsByInst?.[n] ?? [], { date, spread: spreads?.[n] ?? null });
    if (t) trades.push(t);
  }
  return { date, version: PAPER_VERSION, label: PAPER_LABEL, window: '08:00-21:00 London', trades, summary: summarise(trades) };
}

/** The running total over stored day summaries ([{ date, summary }], any order). */
export function runningTotal(days) {
  const ds = [...(days ?? [])].filter(d => d?.summary).sort((a, b) => a.date.localeCompare(b.date));
  let trades = 0, wins = 0, sumR = 0, sumSizeR = 0, sumGrossSizeR = 0, cum = 0;
  const curve = ds.map(d => {
    const s = d.summary; trades += s.trades ?? 0; wins += s.wins ?? 0; sumR += (s.meanR ?? 0) * (s.trades ?? 0); sumSizeR += s.sumSizeR ?? 0; sumGrossSizeR += s.sumGrossSizeR ?? 0;
    cum += s.sumSizeR ?? 0; return { date: d.date, sumSizeR: s.sumSizeR ?? 0, cum: r4(cum) };
  });
  return { days: ds.length, from: ds[0]?.date ?? null, to: ds.at(-1)?.date ?? null, trades, wins, hitRate: trades ? r4(wins / trades) : null,
    meanR: trades ? r4(sumR / trades) : null, sumSizeR: r4(sumSizeR), sumGrossSizeR: r4(sumGrossSizeR), curve };
}

/** Is the day's window over (so a result can be stored for good)? */
export const dayComplete = (date, now = Date.now()) => now >= londonMs(date, 21);
