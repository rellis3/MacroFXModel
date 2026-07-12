/**
 * Alert-v2 Core — the pure "should this v2 zone alert right now?" decision.
 *
 * Telegram-v2 has its OWN alert config + cooldowns, separate from v1 (so v2's
 * paper-stage alerts never muddy the live v1 alerter). This brick decides WHICH
 * graded zones to fire on, given proximity to price, a minimum grade, an optional
 * pair filter, an ABSOLUTE after-cost expectancy floor, and a per-level cooldown.
 * Transport (sendTelegram) and message formatting (alertFormatterV2) stay OUT —
 * this is just the selection, so it's unit-testable on synthetic data. Tested in
 * js/telegramV2.test.mjs.
 */

import { costForPair } from './perLineStrategy.js';
import { resolveKey, assetClass } from './instrumentRegistry.js';

export const DEFAULT_V2_ALERT_CFG = {
  enabled:     false,                  // default OFF — opt in from the page so it can't surprise-spam
  minGrade:    'A',                    // A+/A/B/C — minimum grade to alert
  cooldownMin: 120,                    // minutes before re-alerting the same level
  proxPips:    { default: 10, 'XAU/USD': 40, 'NAS100_USD': 50 },
  pairs:       [],                     // [] = all; else only these display symbols
  // Absolute expectancy floor: an entry only ALERTS if its after-cost expectancy
  // (%/touch, the same after-cost basis perLineStrategy.buildPolicy gated it on)
  // is ≥ this multiple of the pair's round-trip cost (PAIR_COST_PCT, the same
  // per-pair cost the policy charged). Grades stay RELATIVE for display —
  // deriveBands fits them to the policy's own expectancy percentiles, so an "A"
  // only means "top third of THIS book" — but an ALERT must clear its own cost
  // in absolute terms. Note expectancy is already net of cost, so at 1.0 the
  // gross edge must be ~2× the round-trip cost. 0 disables the floor.
  minExpectancyCostMult: 1.0,
};

export const GRADE_RANK = { 'A+': 4, A: 3, B: 2, C: 1, SKIP: 0 };

// Stable cooldown key for a standing level.
export const alertKey = (sym, price, dir) => `${sym}|${price}|${dir}`;

const proxFor = (cfg, sym) => cfg.proxPips?.[sym] ?? cfg.proxPips?.default ?? DEFAULT_V2_ALERT_CFG.proxPips.default;

/**
 * Select alerts for ONE pair. Pure: returns the alerts to send + the updated
 * cooldown map (does not mutate the input). The caller sends + persists.
 *
 * args: { sym, entries, currentPrice, pip, cfg, cooldowns, now, pairCost }
 *   entries     = gradeLevelV2 output for the pair
 *   currentPrice= live price (entries block carries it)
 *   pip         = pip size for the symbol (caller supplies; keeps this brick pure)
 *   cfg         = v2 alert config (DEFAULT_V2_ALERT_CFG shape)
 *   cooldowns   = { key: lastSentMs }
 *   now         = epoch ms
 *   pairCost    = optional round-trip cost (% of price) for the expectancy floor;
 *                 when omitted it is resolved from the SAME PAIR_COST_PCT table
 *                 the policy priced with (costForPair via the instrument registry)
 * → { alerts: [{ entry, distPips, key }], cooldowns }
 */
export function selectAlerts({ sym, entries = [], currentPrice, pip, cfg = {}, cooldowns = {}, now = 0, pairCost = null }) {
  const c = { ...DEFAULT_V2_ALERT_CFG, ...cfg, proxPips: { ...DEFAULT_V2_ALERT_CFG.proxPips, ...(cfg.proxPips ?? {}) } };
  const out = { alerts: [], cooldowns: { ...cooldowns } };
  if (!c.enabled || currentPrice == null || !(pip > 0)) return out;
  if (Array.isArray(c.pairs) && c.pairs.length && !c.pairs.includes(sym)) return out;

  const minRank  = GRADE_RANK[c.minGrade] ?? 3;
  const proxDist = proxFor(c, sym) * pip;
  const coolMs   = (c.cooldownMin ?? 120) * 60_000;
  // Absolute floor in %/touch: the entry's after-cost expectancy must clear
  // minExpectancyCostMult × this pair's round-trip cost. Same cost basis the
  // policy charged (perLineStrategy PAIR_COST_PCT, resolved by canonical key —
  // 'XAU/USD'→gold 0.020, 'NAS100_USD'→nq 0.008, else the asset-class default).
  const key      = resolveKey(sym);
  const cost     = pairCost ?? (key ? costForPair(key, assetClass(key)) : costForPair(sym));
  const expFloor = (c.minExpectancyCostMult ?? 0) * cost;

  for (const e of entries) {
    if ((GRADE_RANK[e.grade] ?? 0) < minRank) continue;
    if (e.direction == null) continue;
    // Expectancy floor — fail closed: an entry without a finite expectancy can't
    // prove it clears cost, so it doesn't alert (graded 'enter' entries always
    // carry one; see levelConfidenceCore.decide).
    if (expFloor > 0 && !(Number.isFinite(e.expectancy) && e.expectancy >= expFloor)) continue;
    if (Math.abs(e.price - currentPrice) > proxDist) continue;
    const key = alertKey(sym, e.price, e.direction);
    if (now - (out.cooldowns[key] ?? 0) < coolMs) continue;
    out.cooldowns[key] = now;
    out.alerts.push({ entry: e, distPips: Math.round(Math.abs(e.price - currentPrice) / pip), key });
  }
  return out;
}

// Prune cooldown entries older than 24h so the store can't grow unbounded.
export function pruneCooldowns(cooldowns, now) {
  const cutoff = now - 24 * 60 * 60_000;
  const out = {};
  for (const [k, ts] of Object.entries(cooldowns || {})) if (ts > cutoff) out[k] = ts;
  return out;
}
