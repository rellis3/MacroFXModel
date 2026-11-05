/**
 * The news wire's market read (owner, 2026-11-05): for a headline the news analyst has read, which of the desk's
 * markets it bears on and which way, whether the market then moved that way, and the running record of how often it
 * did. Everything here is description, never a signal: a headline is context, and the record says what followed
 * past headlines, not what the next one will do.
 *
 * 1. Pairs. The analyst gives an impact per currency or asset (-2..+2: +2 a strong push up, +1 a push up, -1 / -2
 *    down). For each of the desk's markets:
 *      FX pair        direction = impact[base] - impact[quote]   (a leg the read leaves out counts 0)
 *      equity index   EQUITIES       GOLD   GOLD       WTI, BRENT   OIL       BTCUSD   CRYPTO
 *    Other markets (silver, copper, gas, ags) have no read key and are left out. A market with direction 0 is left
 *    out. Against today's book card: a LONG card (any rating containing LONG) with direction > 0 is "supports",
 *    < 0 "against"; SHORT the other way round; FLAT or no card: no stance.
 *
 * 2. Reaction. For each impacted market (up to six per headline), the mid at the headline's time t0 and at t0+5 and
 *    t0+30 minutes, from OANDA M1 mid closes: the price at a time is the close of the last minute bar that ended at
 *    or before it (within 10 minutes; otherwise no price). t0 is the publication time, or the time the wire first
 *    saw it when the feed's stamp is more than 30 minutes earlier (a feed that stamps the day, not the minute).
 *    The move is measured in units of that market's TYPICAL move over the same horizon: the median absolute change
 *    over the h minutes, taken every 5 minutes through the 6 hours of M1 bars before t0 (at least 12 windows). This
 *    is a simple trailing realised measure; a quiet Asian morning makes a London move look larger.
 *      units = (p(t0+h) - p(t0)) / typical(h) x sign(direction)     (positive = the way the read implied)
 *      label = "none" when |units| < 0.5, else "with" (units > 0) or "against" (units < 0)
 *    The headline's label at each horizon is the mean of its markets' signed units, labelled the same way.
 *
 * 3. Record. Per source and per topic: of the tier-1/2 headlines with a label, how many moved with the read, against
 *    it, or not clearly, at 5 and 30 minutes. A headline seen on several feeds counts once under each of them.
 *    Description, not a signal: many headlines land on a market already moving, and nothing here controls for that.
 *
 * Pure: no fetch, no KV, no clock (pass `now`). Tested in js/newsImpact.test.mjs.
 */
import { DESK_UNIVERSE, instrumentLegs, groupOf } from './deskPack.js';

export const IMPACT_KEYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'GOLD', 'OIL', 'EQUITIES', 'CRYPTO'];
const ASSET_KEY = { GOLD: 'GOLD', WTI: 'OIL', BRENT: 'OIL', BTCUSD: 'CRYPTO' };
export const NOTE = 'description, not a signal';

/** The read key(s) a market answers to: [base, quote] for a pair, [key] for an asset, null when none. */
export function marketKeys(inst) {
  const g = groupOf(inst);
  if (g === 'fx_majors' || g === 'fx_crosses') return instrumentLegs(inst);
  if (g === 'indices') return ['EQUITIES'];
  return ASSET_KEY[inst] ? [ASSET_KEY[inst]] : null;
}

/** A card's stance on a direction: 'supports' | 'against' | null. */
export function stance(rating, dir) {
  const s = /LONG/.test(String(rating ?? '')) ? 1 : /SHORT/.test(String(rating ?? '')) ? -1 : 0;
  if (!s || !dir) return null;
  return Math.sign(dir) === s ? 'supports' : 'against';
}

/**
 * The markets a read impacts: [{ inst, dir, card, stance }], strongest first, then markets with a live card, then
 * the universe's order. `book` = { INST: rating } for today's live cards (size > 0); omitted = no stances.
 */
export function pairImpacts(impact, { book = {}, universe = DESK_UNIVERSE, max = 16 } = {}) {
  const im = impact ?? {}, out = [];
  const names = Object.values(universe).flat();
  names.forEach((inst, order) => {
    const k = marketKeys(inst); if (!k) return;
    const v = x => (Number.isFinite(+im[x]) ? +im[x] : 0);
    const dir = k.length === 2 ? v(k[0]) - v(k[1]) : v(k[0]);
    if (!dir) return;
    const card = book[inst] ?? null;
    out.push({ inst, dir, card, stance: stance(card, dir), order });
  });
  out.sort((a, b) => Math.abs(b.dir) - Math.abs(a.dir) || (b.card ? 1 : 0) - (a.card ? 1 : 0) || a.order - b.order);
  return out.slice(0, max).map(({ order, ...r }) => r);
}

/** The markets to price for the reaction check: the strongest few, cards first among equals. */
export const reactionMarkets = (pairs, max = 6) => (pairs ?? []).slice(0, max).map(p => p.inst);

/** t0 for the reaction: the publication time, or first seen when the feed's stamp is far earlier. */
export function reactionStart(h, { lagMin = 30 } = {}) {
  const pub = Number(h?.ms), seen = Number(h?.firstSeen);
  if (Number.isFinite(seen) && (!Number.isFinite(pub) || seen - pub > lagMin * 60e3)) return { t0: seen, basis: 'first seen' };
  return Number.isFinite(pub) ? { t0: pub, basis: 'published' } : null;
}

/** Close of the last M1 bar ([{ t: bar start ms, c }], ascending) that ended at or before `ms`, within `tolMin` (and began at or after `after`). */
export function priceAt(bars, ms, { tolMin = 10, after = -Infinity } = {}) {
  let best = null;
  for (const b of bars ?? []) { const end = b.t + 60e3; if (end <= ms) best = b; else break; }
  return best && best.t >= after && ms - (best.t + 60e3) <= tolMin * 60e3 && Number.isFinite(best.c) ? best.c : null;
}

const median = xs => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** The typical absolute move over `horizonMin` minutes in the `lookbackMin` before `beforeMs` (see the header). */
export function typicalMove(bars, beforeMs, horizonMin, { lookbackMin = 360, stepMin = 5, minWindows = 12 } = {}) {
  const pre = (bars ?? []).filter(b => b.t + 60e3 <= beforeMs && b.t >= beforeMs - lookbackMin * 60e3 && Number.isFinite(b.c));
  if (pre.length < 2) return null;
  const moves = [];
  for (let s = pre[0].t + 60e3; s + horizonMin * 60e3 <= beforeMs; s += stepMin * 60e3) {
    const a = priceAt(pre, s, { tolMin: 3 }), b = priceAt(pre, s + horizonMin * 60e3, { tolMin: 3 });
    if (a != null && b != null) moves.push(Math.abs(b - a));
  }
  const m = moves.length >= minWindows ? median(moves) : null;
  return m > 0 ? m : null;
}

const labelOf = u => (u == null ? null : Math.abs(u) < 0.5 ? 'none' : u > 0 ? 'with' : 'against');
/** One market's move at one horizon: { move, units, label }, or null when a price or the typical move is missing. */
export function scoreMove({ p0, p, typical, dir }) {
  if (![p0, p, typical].every(Number.isFinite) || typical <= 0 || !dir) return null;
  const units = +(((p - p0) / typical) * Math.sign(dir)).toFixed(2);
  return { move: +(p - p0).toPrecision(6), units, label: labelOf(units) };
}

/**
 * Score one market from its M1 bars (covering t0-6h to t0+30m where available).
 * Returns { inst, dir, p0, p5, p30, typ5, typ30, m5, m30 } (m5/m30 = scoreMove results or null).
 */
export function scoreMarket(inst, dir, bars, t0) {
  const p0 = priceAt(bars, t0), p5 = priceAt(bars, t0 + 5 * 60e3, { after: t0 }), p30 = priceAt(bars, t0 + 30 * 60e3, { after: t0 });   // a price after t0 must come from a bar that traded after it
  const typ5 = typicalMove(bars, t0, 5), typ30 = typicalMove(bars, t0, 30);
  return { inst, dir, p0, p5, p30, typ5, typ30, m5: scoreMove({ p0, p: p5, typical: typ5, dir }), m30: scoreMove({ p0, p: p30, typical: typ30, dir }) };
}

/** The headline's label at a horizon ('m5' | 'm30'): the mean of its markets' signed units. */
export function headlineReaction(markets, horizon) {
  const us = (markets ?? []).map(m => m?.[horizon]?.units).filter(Number.isFinite);
  if (!us.length) return null;
  const units = +(us.reduce((a, b) => a + b, 0) / us.length).toFixed(2);
  return { units, label: labelOf(units), n: us.length };
}

/** A compact record row for a headline whose reaction is final. */
export function recordRow(h) {
  const r = h?.react; if (!r) return null;
  return { id: h.id, ms: h.ms, sources: h.sources?.length ? h.sources : [h.source], topic: h.topic ?? 'other', tier: h.read?.tier ?? h.tier,
    m5: r.m5?.label ?? null, m30: r.m30?.label ?? null, u5: r.m5?.units ?? null, u30: r.m30?.units ?? null, n: r.markets?.length ?? 0 };
}

/** Add rows to the stored record: one row per id, newest kept, older than `days` dropped, at most `max`. */
export function appendRecord(rows, add, { now, days = 120, max = 6000 } = {}) {
  const byId = new Map((rows ?? []).map(r => [r.id, r]));
  for (const r of add ?? []) if (r?.id) byId.set(r.id, r);
  return [...byId.values()].filter(r => now == null || now - r.ms < days * 864e5).sort((a, b) => b.ms - a.ms).slice(0, max);
}

const blank = () => ({ n: 0, with: 0, against: 0, none: 0 });
const rate = c => (c.n ? +(c.with / c.n).toFixed(3) : null);
/**
 * The track record: overall, by source and by topic, at 5 and 30 minutes. A row without a label at a horizon is not
 * counted there. Sorted by count.
 */
export function aggregateRecord(rows, { minN = 1 } = {}) {
  const groups = { all: { all: { m5: blank(), m30: blank() } }, source: {}, topic: {} };
  const add = (g, key, row) => { const x = (groups[g][key] ??= { m5: blank(), m30: blank() }); for (const hz of ['m5', 'm30']) { const l = row[hz]; if (!l) continue; x[hz].n++; x[hz][l]++; } };
  for (const r of rows ?? []) {
    add('all', 'all', r);
    for (const s of new Set((r.sources ?? []).map(x => String(x).split('/')[0]))) add('source', s, r);
    add('topic', r.topic ?? 'other', r);
  }
  const list = g => Object.entries(groups[g]).map(([key, v]) => ({ key, m5: { ...v.m5, withRate: rate(v.m5) }, m30: { ...v.m30, withRate: rate(v.m30) } }))
    .filter(x => Math.max(x.m5.n, x.m30.n) >= minN).sort((a, b) => b.m30.n - a.m30.n || b.m5.n - a.m5.n || a.key.localeCompare(b.key));
  return { label: NOTE, overall: list('all')[0] ?? { key: 'all', m5: { ...blank(), withRate: null }, m30: { ...blank(), withRate: null } }, bySource: list('source'), byTopic: list('topic'), rows: (rows ?? []).length };
}
