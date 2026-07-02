// Trade Decision Engine — news gate (pure brick).
//
// Two roles, per ARCHITECTURE.md §3:
//   • HARD gate: a high-impact event on one of the pair's currencies within the
//     block window forces `skip` before the model is consulted.
//   • SOFT feature: a high-impact event later in the horizon becomes a
//     `news_soon` flag the model weighs, not a veto.
//
// Pure over a supplied calendar — no fetching here. The slow loop supplies
// events as [{ timeMs, impact: 'high'|'medium'|'low', currency, title }].

import { assetClass, resolveKey } from '../js/instrumentRegistry.js';

export const DEFAULT_NEWS_CFG = {
  blockMinBefore: 45,   // hard window opens this many minutes before the event
  blockMinAfter:  15,   // …and closes this many after
  hardImpacts: ['high'],
  softHorizonMin: 240,  // high-impact inside this horizon → soft news_soon flag
};

// Currencies a pair is exposed to. FX keys are base+quote 6-letter codes;
// commodities/indices are USD-driven (gold additionally XAU by convention).
export function pairCurrencies(symbol) {
  const key = (() => { try { return resolveKey(symbol); } catch { return String(symbol).toLowerCase(); } })();
  const cls = (() => { try { return assetClass(key); } catch { return 'fx'; } })();
  if (cls === 'fx' && /^[a-z]{6}$/.test(key)) {
    return [key.slice(0, 3).toUpperCase(), key.slice(3).toUpperCase()];
  }
  if (key === 'gold') return ['USD', 'XAU'];
  if (key === 'dax')  return ['EUR'];
  return ['USD'];  // indices and anything else: USD events dominate
}

// events × now × pair currencies → gate result.
// Returns { blocked, reason, nextHighImpactMin, softNewsSoon, matched }.
export function newsGate(events, nowMs, currencies, cfg = {}) {
  const c = { ...DEFAULT_NEWS_CFG, ...cfg };
  const cur = new Set((currencies ?? []).map(x => String(x).toUpperCase()));
  let blocked = false, reason = null, nextMin = null, soft = false, matched = null;

  for (const ev of events ?? []) {
    const t = Number(ev.timeMs);
    if (!Number.isFinite(t)) continue;
    const impact = String(ev.impact ?? '').toLowerCase();
    if (!c.hardImpacts.includes(impact)) continue;
    if (cur.size && ev.currency && !cur.has(String(ev.currency).toUpperCase())) continue;

    const dtMin = (t - nowMs) / 60000;                    // >0 = upcoming
    if (dtMin >= -c.blockMinAfter && dtMin <= c.blockMinBefore) {
      blocked = true;
      matched = ev;
      reason = `high-impact ${ev.currency ?? ''} news ${dtMin >= 0
        ? `in ${Math.round(dtMin)}m` : `${Math.round(-dtMin)}m ago`}: ${ev.title ?? 'event'}`;
      break;
    }
    if (dtMin > c.blockMinBefore && dtMin <= c.softHorizonMin) {
      soft = true;
      if (nextMin == null || dtMin < nextMin) nextMin = Math.round(dtMin);
    }
  }
  return { blocked, reason, nextHighImpactMin: nextMin, softNewsSoon: soft, matched };
}
