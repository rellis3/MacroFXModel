/**
 * One-time migration for gold's pip-denominated stored config.
 *
 * Background. `js/utils.js` and `levels.js` used to report XAU/USD's pip as
 * **0.1**, while the canonical tables (pylego/instruments.json,
 * js/instrumentRegistry.js, server.js PIP_SIZE, today.html) all say **1.0**.
 * 1.0 is arithmetically correct: gold's contract is 100 oz and the bots pay
 * $100 per pip per lot — 100 oz × $1.00 = $100. At 0.1 the pip value would be $10.
 *
 * The pip never travelled alone, though. Every gold constant beside it was
 * tuned against 0.1:
 *
 *     confluencePips 200  ×  pip 0.1  =  $20 clustering distance
 *
 * so today's BEHAVIOUR is right and only the label is wrong. Correcting the pip
 * without dividing its partner by 10 would silently widen that window to $200.
 *
 * Those partners live in KV / localStorage as user-set values, so the code-side
 * defaults cannot be fixed alone. This module rewrites a stored config the first
 * time it is read after the change and stamps `pipBasis: 'canonical'` so it is
 * never rescaled twice.
 *
 * ONLY gold is touched. Verified 2026-08-24: fx, nas100, spx500, de30, uk100,
 * us30, us2000 and every JPY pair already agreed with canonical, so their stored
 * values mean the same thing before and after.
 */

/** Ratio between the old (wrong) gold pip and the canonical one. */
const GOLD_PIP_RATIO = 0.1 / 1.0;

/** Marks a config as already expressed against the canonical pip table. */
export const PIP_BASIS = 'canonical';

const isNum = v => typeof v === 'number' && Number.isFinite(v);

/**
 * Rescale a caps config's gold confluence threshold, if it hasn't been already.
 * Returns a NEW object when it changes anything, the original otherwise, so a
 * caller can cheaply detect whether a write-back is needed (`out !== cfg`).
 */
export function migrateCapsConfig(cfg) {
  if (!cfg || typeof cfg !== 'object' || cfg.pipBasis === PIP_BASIS) return cfg;
  const gold = cfg.gold;
  if (!gold || !isNum(gold.confluencePips)) {
    return { ...cfg, pipBasis: PIP_BASIS };          // nothing to rescale; just stamp
  }
  return {
    ...cfg,
    gold: { ...gold, confluencePips: round4(gold.confluencePips * GOLD_PIP_RATIO) },
    pipBasis: PIP_BASIS,
  };
}

/**
 * Same for an alert config's per-symbol proximity thresholds.
 *
 * NOTE: this preserves the CURRENT firing distance exactly ($0.80 for the v1
 * alert default of 8). That distance is 0.017% of price where NAS100's is
 * 0.103% — 6× tighter — which suggests the 8 was authored expecting pip 1.0 and
 * gold proximity alerts have been firing far too tight to be useful. Widening it
 * is a real behaviour change to live Telegram alerts, so it is deliberately NOT
 * bundled in here; decide it separately and change the default in js/alerts.js.
 */
export function migrateAlertConfig(cfg) {
  if (!cfg || typeof cfg !== 'object' || cfg.pipBasis === PIP_BASIS) return cfg;
  const prox = cfg.proxPips;
  if (!prox || !isNum(prox['XAU/USD'])) {
    return { ...cfg, pipBasis: PIP_BASIS };
  }
  return {
    ...cfg,
    proxPips: { ...prox, 'XAU/USD': round4(prox['XAU/USD'] * GOLD_PIP_RATIO) },
    pipBasis: PIP_BASIS,
  };
}

/** Keep the rescaled values readable — 200 → 20, 8 → 0.8, not 0.8000000000000001. */
function round4(n) {
  return Math.round(n * 1e4) / 1e4;
}
