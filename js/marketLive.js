/**
 * The live layer of the Desk Terminal (owner, 2026-11-23: "the dashboard is meant to be a moving dashboard ... asset, currency etc as the day
 * moves should update and shift with the day"). Every market on the day's book, read against live prices through the day:
 *
 *   seed(cards, barsByInst, date)             the day so far from M1 bars since 00:00 London: open, high, low, last, a 5-minute path
 *   step(state, prices, nowMs)                one live tick (OANDA mids): last, high, low, the path
 *   view(state, cards)                        per market: move since the open in u (the day's p50 distance) and %, the day's range in u,
 *                                             where price sits in it, which forecast lines have been touched, the path
 *   ccyStrength(markets)                      per currency: the mean move since the open in u across its FX pairs (base +, quote −), ranked
 *
 * u is the same unit the desk scores in (js/deskScore.js unitOf), so a move reads alike across EURUSD, gold and the Nasdaq.
 * Pure: no fetch, no KV, no clock. Server: server.js `_mlTick`, GET /api/market-live. Tested in js/marketLive.test.mjs.
 * What it is not: a forecast or a call. It describes where each market is now against the morning's lines.
 */
import { unitOf } from './deskScore.js';

export const PATH_STEP_MS = 5 * 60_000;
const LINES = ['p50', 'p75', 'p90'];
export const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
const fin = x => typeof x === 'number' && Number.isFinite(x);
const r2 = x => (fin(x) ? Math.round(x * 100) / 100 : null);
const r3 = x => (fin(x) ? Math.round(x * 1000) / 1000 : null);

/** An FX pair's two legs ("GBPJPY" -> ['GBP', 'JPY']), or null for anything else (gold, indices, crypto). */
export function legs(name) {
  const m = /^([A-Z]{3})([A-Z]{3})$/.exec(String(name ?? ''));
  return m && CCYS.includes(m[1]) && CCYS.includes(m[2]) ? [m[1], m[2]] : null;
}

/** Push a price onto a 5-minute path: replace the bucket's close, or open a new bucket. path: [[bucketMs, close], ...]. */
function onPath(path, tMs, px) {
  const b = Math.floor(tMs / PATH_STEP_MS) * PATH_STEP_MS, last = path.at(-1);
  if (last && last[0] === b) last[1] = px; else if (!last || b > last[0]) path.push([b, px]);
}

/**
 * The day so far. cards: the book's instruments ({ levels }); barsByInst: { INST: [{ time (s), open, high, low, close }] } from 00:00 London.
 * The open is the card's forecast open where it has one (the lines hang off it), else the first bar of the day.
 */
export function seed(cards, barsByInst, date) {
  const out = { date, markets: {} };
  for (const n of Object.keys(cards ?? {})) {
    const bars = (barsByInst?.[n] ?? []).filter(b => fin(b?.close));
    const L = cards[n]?.levels, open = fin(L?.open) ? L.open : bars[0]?.open;
    if (!fin(open)) continue;
    const m = { open, hi: open, lo: open, last: open, at: null, path: [] };
    for (const b of bars) { m.hi = Math.max(m.hi, b.high); m.lo = Math.min(m.lo, b.low); m.last = b.close; m.at = b.time * 1000; onPath(m.path, b.time * 1000, b.close); }
    out.markets[n] = m;
  }
  return out;
}

/** One live tick. prices: { INST: mid }. Mutates and returns state. */
export function step(state, prices, nowMs) {
  for (const [n, px] of Object.entries(prices ?? {})) {
    const m = state?.markets?.[n]; if (!m || !fin(px)) continue;
    m.last = px; m.hi = Math.max(m.hi, px); m.lo = Math.min(m.lo, px); m.at = nowMs; onPath(m.path, nowMs, px);
  }
  return state;
}

/** The view the page draws. cards: the book's instruments (for the lines and the unit); a card may carry `unit` instead of levels when the
 *  book is from an earlier day (its lines do not apply today, but its p50 distance is still a fair yardstick for the move). */
export function view(state, cards) {
  const out = {};
  for (const [n, m] of Object.entries(state?.markets ?? {})) {
    const L = cards?.[n]?.levels, u = unitOf(L) ?? (fin(cards?.[n]?.unit) && cards[n].unit > 0 ? cards[n].unit : null), span = m.hi - m.lo;
    const touched = L ? [...LINES.filter(q => fin(L.up?.[q]) && m.hi >= L.up[q]).map(q => `up ${q}`), ...LINES.filter(q => fin(L.down?.[q]) && m.lo <= L.down[q]).map(q => `down ${q}`)] : [];
    out[n] = {
      last: m.last, open: m.open, hi: m.hi, lo: m.lo, at: m.at,
      chgPct: r3(((m.last - m.open) / m.open) * 100),
      nowU: u ? r2((m.last - m.open) / u) : null, highU: u ? r2((m.hi - m.open) / u) : null, lowU: u ? r2((m.lo - m.open) / u) : null,
      pos: span > 0 ? r2((m.last - m.lo) / span) : null,   // 0 = at the day's low, 1 = at its high
      touched,
      path: m.path.filter((_, i, a) => i % 3 === 0 || i === a.length - 1).map(p => p[1]),   // 15-minute closes and the latest, for a sparkline
    };
  }
  return out;
}

/**
 * Currency strength since the open: for each currency, the mean of its FX pairs' moves in u, a pair's move counting for the base and against
 * the quote. Pairs without a unit fall back to nothing (a % move is not comparable across pairs' volatility). Ranked strongest first.
 */
export function ccyStrength(markets) {
  const acc = Object.fromEntries(CCYS.map(c => [c, []]));
  for (const [n, v] of Object.entries(markets ?? {})) {
    const lg = legs(n); if (!lg || !fin(v?.nowU)) continue;
    acc[lg[0]].push(v.nowU); acc[lg[1]].push(-v.nowU);
  }
  const rows = CCYS.filter(c => acc[c].length).map(c => ({ ccy: c, score: r2(acc[c].reduce((a, b) => a + b, 0) / acc[c].length), pairs: acc[c].length }));
  rows.sort((a, b) => b.score - a.score);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}
