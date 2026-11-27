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

// The three sessions by London wall hour (the same split the desk's day forecaster reads "high and low set in"):
// Asia 00:00-07:00, London 07:00-12:00, New York 12:00-21:00; after 21:00 counts as New York.
const _hourFmt = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/London' });
export const sessionOf = ms => { const h = Number(_hourFmt.format(new Date(ms))); return h < 7 ? 'asia' : h < 12 ? 'london' : 'ny'; };
function onSession(m, ms, hi, lo) {
  const k = sessionOf(ms), s = (m.sess ??= {})[k] ??= { hi, lo };
  s.hi = Math.max(s.hi, hi); s.lo = Math.min(s.lo, lo);
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
    for (const b of bars) { m.hi = Math.max(m.hi, b.high); m.lo = Math.min(m.lo, b.low); m.last = b.close; m.at = b.time * 1000; onPath(m.path, b.time * 1000, b.close); onSession(m, b.time * 1000, b.high, b.low); }
    out.markets[n] = m;
  }
  return out;
}

/** One live tick. prices: { INST: mid }. Mutates and returns state. */
export function step(state, prices, nowMs) {
  for (const [n, px] of Object.entries(prices ?? {})) {
    const m = state?.markets?.[n]; if (!m || !fin(px)) continue;
    m.last = px; m.hi = Math.max(m.hi, px); m.lo = Math.min(m.lo, px); m.at = nowMs; onPath(m.path, nowMs, px); onSession(m, nowMs, px, px);
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
      sess: Object.fromEntries(Object.entries(m.sess ?? {}).map(([k, x]) => [k, u ? { hiU: r2((x.hi - m.open) / u), loU: r2((x.lo - m.open) / u) } : { hi: x.hi, lo: x.lo }])),
      dayType: dayType(u ? (m.last - m.open) / u : null, u ? span / u : null, m.last - m.open, span),
      u: u ? +u.toPrecision(6) : null,
      // how much of the forecast's p50-to-p50 span the day's range has used (1 = the whole span)
      spanUsed: L && fin(L.up?.p50) && fin(L.down?.p50) && L.up.p50 > L.down.p50 ? r2(span / (L.up.p50 - L.down.p50)) : null,
      ref: cards?.[n]?.ref ?? null,   // yesterday's high / low / close and this week's open (refLevels)
      path: m.path.filter((_, i, a) => i % 3 === 0 || i === a.length - 1).map(p => p[1]),   // 15-minute closes and the latest, for a sparkline
      pathT: m.path.filter((_, i, a) => i % 3 === 0 || i === a.length - 1).map(p => p[0]),   // their bucket times (ms), for the day replay
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

/**
 * The day's shape so far, the desk day forecaster's rule: a trend day closes at least half its range from the open; a range day does
 * not. Under half a unit of range it is too early to say ('quiet'). moveU/rangeU in u when there is a unit, else the raw move/range.
 */
export function dayType(moveU, rangeU, move, range) {
  if (fin(rangeU) && rangeU < 0.5) return 'quiet';
  const mv = fin(moveU) ? moveU : move, rg = fin(rangeU) ? rangeU : range;
  if (!fin(mv) || !fin(rg) || rg <= 0) return null;
  return Math.abs(mv) >= 0.5 * rg ? (mv > 0 ? 'trend up' : 'trend down') : 'range';
}

// ── the live risk tape: built only from live prices (the FRED risk flags are end-of-day, so they are the morning backdrop, not the tape) ──
export const RISK_EQUITY = ['NQ', 'SPX500', 'DE30', 'US30'];
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
/**
 * Three legs, each in u since the open: equities (up = risk-on), the havens JPY and CHF (strong = risk-off, so counted against) and the
 * commodity currencies AUD and NZD (strong = risk-on). The score is the mean of the legs that have data; risk-on above +0.25, risk-off
 * below -0.25, mixed between. Gold is shown, not scored (it trades as a haven and as a dollar hedge). A description of the tape, not a call.
 */
export function riskTape(markets, ccyRows) {
  const c = Object.fromEntries((ccyRows ?? []).map(r => [r.ccy, r.score]));
  const eqv = RISK_EQUITY.map(n => markets?.[n]?.nowU).filter(fin), hav = ['JPY', 'CHF'].map(k => c[k]).filter(fin), com = ['AUD', 'NZD'].map(k => c[k]).filter(fin);
  const legs = { equities: eqv.length ? r2(mean(eqv)) : null, havens: hav.length ? r2(mean(hav)) : null, commodityFx: com.length ? r2(mean(com)) : null, gold: fin(markets?.GOLD?.nowU) ? markets.GOLD.nowU : null };
  const parts = [legs.equities, fin(legs.havens) ? -legs.havens : null, legs.commodityFx].filter(fin);
  if (!parts.length) return null;
  const score = r2(mean(parts));
  return { score, label: score > 0.25 ? 'risk-on' : score < -0.25 ? 'risk-off' : 'mixed', legs };
}
/** Keep the tape's label history: push a change, return how long the current label has held. hist: [{at, label}] (mutated). */
export function tapeHistory(hist, tape, nowMs) {
  if (!tape) return hist;
  if (!hist.length || hist.at(-1).label !== tape.label) hist.push({ at: nowMs, label: tape.label });
  return hist;
}
/**
 * Since when the current label has held: { since: ms, atLeast }. atLeast is true when the label is the first one the history holds and the
 * history began well after the day started (the server came up mid-day with no saved history), so the label may be older than that
 * (review 2026-11-27: "RISK-ON SINCE 18:31" was the restart time). fromMs: when this history began; dayStartMs: 00:00 London.
 */
export function tapeSince(hist, fromMs, dayStartMs, graceMs = 15 * 60_000) {
  if (!hist?.length) return null;
  const since = hist.at(-1).at;
  return { since, atLeast: hist.length === 1 && Number.isFinite(fromMs) && Number.isFinite(dayStartMs) && fromMs > dayStartMs + graceMs };
}

/** The close at or before t on a 5-minute path, or null. */
export function priceAt(path, t) {
  let v = null; for (const [b, px] of path ?? []) { if (b <= t) v = px; else break; }
  return v;
}
/**
 * How a currency moved over `mins` after a print at tMs: the mean, across its pairs, of the move from the 5-minute bucket before the print
 * to the bucket `mins` later, in u (base counts for, quote against). Null until that much time has passed, or with no pair priced.
 */
export function reaction(state, cards, ccy, tMs, mins = 15, nowMs = Date.now()) {
  if (nowMs < tMs + mins * 60_000) return null;
  const vals = [];
  for (const [n, m] of Object.entries(state?.markets ?? {})) {
    const lg = legs(n); if (!lg || !lg.includes(ccy)) continue;
    const L = cards?.[n]?.levels, u = unitOf(L) ?? (fin(cards?.[n]?.unit) && cards[n].unit > 0 ? cards[n].unit : null); if (!u) continue;
    const a = priceAt(m.path, tMs - PATH_STEP_MS), b = priceAt(m.path, tMs + mins * 60_000);
    if (!fin(a) || !fin(b)) continue;
    vals.push(((b - a) / u) * (lg[0] === ccy ? 1 : -1));
  }
  return vals.length ? r2(mean(vals)) : null;
}

/** Retail positioning since the morning from the position-book rows ([t, spot, longPct, ...], t in s or ms): now against the first row at or after openMs. */
export function retailSince(fine, openMs) {
  const rows = (fine ?? []).map(r => [r[0] < 1e12 ? r[0] * 1000 : r[0], r[2]]).filter(r => fin(r[0]) && fin(r[1])).sort((a, b) => a[0] - b[0]);
  if (!rows.length) return null;
  const now = rows.at(-1), first = rows.find(r => r[0] >= openMs);
  return { longPct: r2(now[1]), at: now[0], atOpen: first ? r2(first[1]) : null, d: first ? r2(now[1] - first[1]) : null };
}

/**
 * The live layer's Telegram nudges: what is new between two looks at the day. Each key fires once a day (fired: Set, mutated).
 *   a market reaches its p75 or p90 line;  the strongest or the weakest currency changes;  the risk tape changes label.
 * prev/cur: { markets: view, ccy: rows, tape }. Returns [{ key, text }].
 */
export function nudges(prev, cur, fired) {
  const out = [], add = (key, text) => { if (!fired.has(key)) { fired.add(key); out.push({ key, text }); } };
  if (!prev) return out;
  for (const [n, v] of Object.entries(cur?.markets ?? {})) {
    const was = new Set(prev.markets?.[n]?.touched ?? []);
    for (const l of v.touched ?? []) if (!was.has(l) && /p75|p90/.test(l)) add(`line:${n}:${l}`, `${n} reached its ${l} line (${v.nowU > 0 ? '+' : ''}${v.nowU ?? '?'}u from the open)`);
  }
  const top = r => r?.[0]?.ccy, bot = r => r?.at(-1)?.ccy;
  if (top(prev.ccy) && top(cur?.ccy) && top(prev.ccy) !== top(cur.ccy)) add(`top:${top(cur.ccy)}`, `${top(cur.ccy)} is now the strongest currency today (was ${top(prev.ccy)})`);
  if (bot(prev.ccy) && bot(cur?.ccy) && bot(prev.ccy) !== bot(cur.ccy)) add(`bot:${bot(cur.ccy)}`, `${bot(cur.ccy)} is now the weakest currency today (was ${bot(prev.ccy)})`);
  if (prev.tape?.label && cur?.tape?.label && prev.tape.label !== cur.tape.label) add(`tape:${cur.tape.label}:${Math.floor(Date.now() / 3600e3)}`, `Risk tape turned ${cur.tape.label} (score ${cur.tape.score > 0 ? '+' : ''}${cur.tape.score}u; equities ${cur.tape.legs.equities ?? '–'}, havens ${cur.tape.legs.havens ?? '–'}, AUD/NZD ${cur.tape.legs.commodityFx ?? '–'})`);
  return out;
}

/**
 * Yesterday's high, low and close and this week's open, from completed daily bars ([{date, open, high, low, close}], OANDA's trading-day
 * dates) and today's London date. The week open is the first completed bar of this week; on a Monday there is none yet, so it is null
 * (the page then uses today's open). Null when there is no completed bar before today.
 */
export function refLevels(d1, date) {
  const bars = (d1 ?? []).filter(b => b?.date && b.date < date && fin(b.high) && fin(b.low)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const y = bars.at(-1); if (!y) return null;
  const dt = new Date(`${date}T12:00:00Z`), dow = dt.getUTCDay() || 7, monday = new Date(dt.getTime() - (dow - 1) * 86400e3).toISOString().slice(0, 10);
  const wk = bars.find(b => b.date >= monday);
  return { pdh: y.high, pdl: y.low, pdc: y.close, pdDate: y.date, wo: wk ? wk.open : null };
}
