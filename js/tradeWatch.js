/**
 * Agent 18: the trade watcher (plans/DESK_ANALYST_PIPELINE.md §9u). Watches the day's book against live prices and
 * says once, on Telegram, when a card's price reaches something the plan named:
 *   zone      price is inside the card's entry zone (the numbers in plan.zone);
 *   target    price has reached the first target on the lean side (today's p50 line);
 *   invalid   price has gone through the invalidation level against the card.
 * Each event fires at most once per card per day, and nothing more fires on a card after its invalidation.
 * Between two checks price can jump past a level, so a level counts as reached when the path from the last price to
 * this one crosses it, not only when the price sits on it.
 *
 * No model call: the plan is the Head's, the levels are the vol forecast's. The watcher reports, it never trades.
 * Pure. Tested in js/tradeWatch.test.mjs.
 */
const DIR = { STRONG_LONG: 1, LONG: 1, SHORT: -1, STRONG_SHORT: -1 };
export const MIN_AHEAD_U = 0.1;   // the first target must be at least this many u beyond the entry to count (same rule as the paper trades)
/** The numbers in a plan's text, reading thousands separators as part of the number: "26,850-27,010" is 26850 and 27010, not 26, 850, 27 and 10
 * (on 2026-11-08 every gold, index and Bitcoin zone written with commas parsed to nothing, or to the wrong levels). */
export const priceNums = s => (String(s ?? '').replace(/(\d),(?=\d{3}(?!\d))/g, '$1').match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
const nums = priceNums;

/** The watch plan for one card: { dir, zone: [lo, hi] | null, invalid: number | null, target: number | null }. */
export function cardPlan(card) {
  const dir = DIR[card?.rating] ?? 0;
  if (!dir || !(Number(card.size) > 0)) return null;
  const L = card.levels, ref = Number.isFinite(L?.open) ? L.open : null;
  // keep only numbers that are prices near today's open (drops "50%", "15:00", "0DTE" and the like)
  const near = v => (ref ? v > ref * 0.9 && v < ref * 1.1 : v > 0);
  const z = nums(card.plan?.zone).filter(near);
  const zone = z.length >= 2 ? [Math.min(...z), Math.max(...z)] : z.length === 1 ? [z[0], z[0]] : null;
  // the invalidation is the level against the card: above for a short, below for a long; take the nearest such number
  const inv = nums(card.plan?.invalidation ?? card.invalidation).filter(near);
  const against = ref ? inv.filter(v => (dir < 0 ? v >= ref * 0.995 : v <= ref * 1.005)) : inv;
  const invalid = against.length ? (dir < 0 ? Math.min(...against) : Math.max(...against)) : null;
  const target = dir > 0 ? (L?.up?.p50 ?? null) : (L?.down?.p50 ?? null);
  if (!zone && invalid == null && target == null) return null;
  const u = L?.up && L?.down && Number.isFinite(L.up.p50) && Number.isFinite(L.down.p50) ? ((L.up.p50 - L.open) + (L.open - L.down.p50)) / 2 : null;
  return { dir, zone, invalid, target, u };
}

/** The whole book's watch plan. cards: the Head's instruments, with any session-update changes already applied. */
export function watchPlan(cards) {
  const out = {};
  // a plan whose levels do not fit together (js/planCheck.js: invalidation inside the zone, a zone that reaches the target) is still watched,
  // but carries its issues so every alert and the board say so instead of reading it as a valid plan (review 2026-11-27: 8 of 16 cards)
  for (const [n, c] of Object.entries(cards ?? {})) { const p = cardPlan(c); if (p) out[n] = c.planCheck?.ok === false && c.planCheck.issues?.length ? { ...p, issues: c.planCheck.issues } : p; }
  return out;
}

/**
 * Plans already through their invalidation when the book was published (review 2026-11-27: GOLD 3650 and AUDJPY 106.27 at 06:45 against
 * invalidations of 3613.2 and 106.01, book out at 06:53). bars: { INST: [{ time: sec, close }] } up to the issue time. Returns
 * { INST: { price, level, at } } for each plan whose last price at or before issueMs sits beyond its invalidation.
 */
export function invalidAtIssue(plan, bars, issueMs) {
  const out = {};
  for (const [n, p] of Object.entries(plan ?? {})) {
    if (p.invalid == null) continue;
    const before = (bars?.[n] ?? []).filter(b => b.time * 1000 <= issueMs && Number.isFinite(b.close)), last = before.at(-1);
    if (last && (p.dir < 0 ? last.close >= p.invalid : last.close <= p.invalid)) out[n] = { price: last.close, level: p.invalid, at: new Date(last.time * 1000).toISOString() };
  }
  return out;
}

/** Mark the plans that were invalid at issue as off in the watch state, and return their events (kind 'invalid-at-issue', once each). */
export function markInvalidAtIssue(plan, issued, state = {}) {
  state.fired ??= {};
  const events = [];
  for (const [n, x] of Object.entries(issued ?? {})) {
    const fired = (state.fired[n] ??= []);
    if (fired.includes('invalid')) continue;
    fired.push('invalid', 'invalid-at-issue');
    events.push({ inst: n, kind: 'invalid-at-issue', price: x.price, level: x.level, dir: plan?.[n]?.dir ?? 0, seenAt: x.at });
  }
  return events;
}

const crosses = (a, b, lo, hi) => Math.max(a, b) >= lo && Math.min(a, b) <= hi;

/**
 * One check. prices: { INST: mid }. state: { fired: { INST: [kinds] }, last: { INST: price } } (mutated and returned).
 * Returns the new events, in the order they should be sent.
 */
export function check(plan, prices, state = {}) {
  state.fired ??= {}; state.last ??= {};
  const events = [];
  for (const [n, p] of Object.entries(plan)) {
    const px = prices?.[n]; if (!Number.isFinite(px)) continue;
    const first = !Number.isFinite(state.last[n]), prev = first ? px : state.last[n], fired = (state.fired[n] ??= []);
    state.last[n] = px;
    // an event on the first price the watcher has for a market (the day's first check, or the first after a restart) is a state found
    // already true, not a crossing seen happening: it is flagged so its time is not read as the moment it happened
    const push = ev => events.push({ ...ev, ...(first ? { firstSeen: true } : {}), ...(p.issues ? { planIssues: p.issues } : {}) });
    if (fired.includes('invalid')) continue;
    if (p.invalid != null && (p.dir < 0 ? Math.max(prev, px) >= p.invalid : Math.min(prev, px) <= p.invalid)) { fired.push('invalid'); push({ inst: n, kind: 'invalid', price: px, level: p.invalid, dir: p.dir }); continue; }
    // the entry: the first price in the zone, or for a card with no zone the first price the watcher saw that day
    state.entry ??= {};
    if (!p.zone && state.entry[n] == null) state.entry[n] = prev;
    if (p.zone && !fired.includes('zone') && crosses(prev, px, p.zone[0], p.zone[1])) {
      fired.push('zone'); state.entry[n] = Math.min(p.zone[1], Math.max(p.zone[0], px));
      const behind = p.target != null && p.dir * (p.target - state.entry[n]) < MIN_AHEAD_U * (p.u ?? 0);
      if (behind) fired.push('target-behind');
      push({ inst: n, kind: 'zone', price: px, level: p.zone, dir: p.dir, ...(behind ? { targetBehind: p.target } : {}) });
    }
    // "first target" only after an entry, and only while the target was still ahead of it (owner, fix 2, 2026-11-05):
    // a target reached before the zone, or one the zone already sat past, says nothing about the plan
    const entered = state.entry[n] != null, ahead = entered && !fired.includes('target-behind') && (p.target == null || p.dir * (p.target - state.entry[n]) >= MIN_AHEAD_U * (p.u ?? 0));
    if (p.target != null && ahead && !fired.includes('target') && (p.dir > 0 ? Math.max(prev, px) >= p.target : Math.min(prev, px) <= p.target)) { fired.push('target'); push({ inst: n, kind: 'target', price: px, level: p.target, dir: p.dir }); }
  }
  return events;
}

const dp = p => (p >= 1000 ? 1 : p >= 100 ? 2 : p >= 10 ? 3 : 5);
const fmt = (v, ref) => (Array.isArray(v) ? (v[0] === v[1] ? fmt(v[0], ref) : `${fmt(v[0], ref)}–${fmt(v[1], ref)}`) : Number(v).toFixed(dp(ref ?? v)));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The Telegram text (HTML) for one event. */
export function message(ev, card, { date } = {}) {
  const side = ev.dir > 0 ? 'long' : 'short', px = fmt(ev.price, ev.price);
  const head = { zone: `🎯 <b>${esc(ev.inst)}</b> in the entry zone`, target: `✅ <b>${esc(ev.inst)}</b> reached its first target`, invalid: `⛔ <b>${esc(ev.inst)}</b> invalidated`, 'invalid-at-issue': `⛔ <b>${esc(ev.inst)}</b> was already invalid when the book was published` }[ev.kind];
  const body = {
    zone: `Price ${px} is in the ${side} zone ${fmt(ev.level, ev.price)}. The card: ${esc(card?.rating)} (${esc(card?.conviction)}), size ${card?.size}.${card?.plan?.invalidation ? `\nInvalid if: ${esc(card.plan.invalidation)}` : ''}${card?.plan?.timing ? `\nTiming: ${esc(card.plan.timing)}` : ''}${ev.targetBehind != null ? `\n⚠️ The first target (${fmt(ev.targetBehind, ev.price)}) is already at or behind this price: the plan has nothing left to its first target, and no target alert will follow.` : ''}`,
    target: `Price ${px} has reached today's p50 line ${fmt(ev.level, ev.price)} on the ${side} side.`,
    invalid: `Price ${px} went through ${fmt(ev.level, ev.price)}, the level the plan named against the ${side}. The card is off for today.`,
    'invalid-at-issue': `Price was ${px} at the book's publication, already through ${fmt(ev.level, ev.price)}, the level the plan named against the ${side}. The plan was off before it started; the watcher does not follow it today.`,
  }[ev.kind];
  const warn = ev.planIssues?.length ? `\n⚠️ This card's plan levels do not fit together (${esc(ev.planIssues.join('; '))}): read this as a level being reached, not as the plan working.` : '';
  return `${head}\n${body}${warn}\n<i>Desk book ${esc(date ?? '')} · context, not an order</i>`;
}
