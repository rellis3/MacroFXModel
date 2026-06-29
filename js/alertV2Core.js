/**
 * Alert-v2 Core — the pure "should this v2 zone alert right now?" decision.
 *
 * Telegram-v2 has its OWN alert config + cooldowns, separate from v1 (so v2's
 * paper-stage alerts never muddy the live v1 alerter). This brick decides WHICH
 * graded zones to fire on, given proximity to price, a minimum grade, an optional
 * pair filter, and a per-level cooldown. Transport (sendTelegram) and message
 * formatting (alertFormatterV2) stay OUT — this is just the selection, so it's
 * unit-testable on synthetic data. Tested in js/telegramV2.test.mjs.
 */

export const DEFAULT_V2_ALERT_CFG = {
  enabled:     false,                  // default OFF — opt in from the page so it can't surprise-spam
  minGrade:    'A',                    // A+/A/B/C — minimum grade to alert
  cooldownMin: 120,                    // minutes before re-alerting the same level
  proxPips:    { default: 10, 'XAU/USD': 40, 'NAS100_USD': 50 },
  pairs:       [],                     // [] = all; else only these display symbols
};

const GRADE_RANK = { 'A+': 4, A: 3, B: 2, C: 1, SKIP: 0 };

// Stable cooldown key for a standing level.
export const alertKey = (sym, price, dir) => `${sym}|${price}|${dir}`;

const proxFor = (cfg, sym) => cfg.proxPips?.[sym] ?? cfg.proxPips?.default ?? DEFAULT_V2_ALERT_CFG.proxPips.default;

/**
 * Select alerts for ONE pair. Pure: returns the alerts to send + the updated
 * cooldown map (does not mutate the input). The caller sends + persists.
 *
 * args: { sym, entries, currentPrice, pip, cfg, cooldowns, now }
 *   entries     = gradeLevelV2 output for the pair
 *   currentPrice= live price (entries block carries it)
 *   pip         = pip size for the symbol (caller supplies; keeps this brick pure)
 *   cfg         = v2 alert config (DEFAULT_V2_ALERT_CFG shape)
 *   cooldowns   = { key: lastSentMs }
 *   now         = epoch ms
 * → { alerts: [{ entry, distPips, key }], cooldowns }
 */
export function selectAlerts({ sym, entries = [], currentPrice, pip, cfg = {}, cooldowns = {}, now = 0 }) {
  const c = { ...DEFAULT_V2_ALERT_CFG, ...cfg, proxPips: { ...DEFAULT_V2_ALERT_CFG.proxPips, ...(cfg.proxPips ?? {}) } };
  const out = { alerts: [], cooldowns: { ...cooldowns } };
  if (!c.enabled || currentPrice == null || !(pip > 0)) return out;
  if (Array.isArray(c.pairs) && c.pairs.length && !c.pairs.includes(sym)) return out;

  const minRank  = GRADE_RANK[c.minGrade] ?? 3;
  const proxDist = proxFor(c, sym) * pip;
  const coolMs   = (c.cooldownMin ?? 120) * 60_000;

  for (const e of entries) {
    if ((GRADE_RANK[e.grade] ?? 0) < minRank) continue;
    if (e.direction == null) continue;
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
