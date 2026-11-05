/**
 * The plan check (owner, 2026-11-05; prereg A18). A sized card's plan has a shape that must make sense against the
 * day's forecast lines before anything trades on it:
 *   long : invalidation < entry zone < first target (today's up p50 line)
 *   short: invalidation > entry zone > first target (today's down p50 line)
 * and the zone should be narrow enough to be a place, not a range (at most one u wide, u = the day's p50 half-range).
 * On 2026-11-03 nine of eighteen paper "target hits" sat at or past their target the moment they were entered (zones
 * like AUDCAD 0.97531-0.9808 short around a p50 of 0.97688), so the first target was behind the entry.
 *
 * This only describes: each card carries `planCheck: { ok, issues }`; the pages show it, the paper trades and the
 * trade watcher read it. It never changes a rating, a size or the scored direction (prereg H1 is unchanged).
 * Pure. Tested in js/planCheck.test.mjs.
 */
import { cardPlan } from './tradeWatch.js';
import { unitOf } from './deskScore.js';

export const MAX_ZONE_U = 1;   // a zone wider than one u (the day's p50 half-range) is a range, not an entry

export function checkPlan(card) {
  const plan = cardPlan(card); if (!plan) return null;   // FLAT or size 0: nothing to check
  const { dir, zone, invalid, target } = plan, u = unitOf(card.levels), issues = [];
  if (!zone) issues.push('no entry zone');
  if (zone && target != null && (dir > 0 ? zone[1] >= target : zone[0] <= target)) issues.push(`the entry zone reaches the first target (${target}): nothing left to gain from part of it`);
  if (zone && invalid != null && (dir > 0 ? invalid >= zone[0] : invalid <= zone[1])) issues.push(`the invalidation (${invalid}) sits inside or beyond the entry zone`);
  if (zone && u && (zone[1] - zone[0]) > MAX_ZONE_U * u) issues.push(`the entry zone is ${((zone[1] - zone[0]) / u).toFixed(1)} u wide (over ${MAX_ZONE_U} u)`);
  if (invalid == null) issues.push('no invalidation level');
  return { ok: issues.length === 0, issues, zone, invalid, target, u: u ?? null };
}

/** Attach planCheck to every card of a book (mutates and returns the instruments). */
export function checkBook(instruments) {
  for (const c of Object.values(instruments ?? {})) { const pc = checkPlan(c); if (pc) c.planCheck = pc; }
  return instruments;
}

/** How many sized cards pass, and the most common issues, for the page. */
export function planSummary(instruments) {
  const pcs = Object.values(instruments ?? {}).map(c => c.planCheck).filter(Boolean), counts = {};
  for (const p of pcs) for (const i of p.issues) { const k = i.replace(/\s*\(.*$/, '').replace(/ is [\d.]+ u wide.*/, ' is too wide'); counts[k] = (counts[k] ?? 0) + 1; }
  return { sized: pcs.length, ok: pcs.filter(p => p.ok).length, issues: counts };
}
