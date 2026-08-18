/**
 * CLI wrapper for js/liveValidationCore.js's runLiveValidation — see that
 * file for the actual logic (shared with the /api/live-validation/* server
 * route + live-validation.html page, per Lego Principle 1: one shared
 * core, imported, never copied).
 *
 * CANNOT be run from a sandboxed dev session — OANDA is 403 there by
 * environment policy (see MD files/CLAUDE.md's "Live deployment" section).
 * Run this on Railway, or any machine with a working OANDA_KEY. On
 * Railway, prefer the HTML page (live-validation.html) — this script is
 * for anyone who'd rather run it from a terminal.
 *
 * Usage:
 *   OANDA_KEY=xxx OANDA_ENV=live node live_validation_harness.mjs [gold|nq|both]
 */
import { runLiveValidation } from '../../../js/liveValidationCore.js';

const which = (process.argv[2] || 'both').toLowerCase();
const pairs = which === 'both' ? ['gold', 'nq'] : [which];
if (!pairs.every(p => p === 'gold' || p === 'nq')) {
  console.error('usage: live_validation_harness.mjs [gold|nq|both]');
  process.exit(1);
}
if (!process.env.OANDA_KEY) {
  console.error('OANDA_KEY not set — this harness needs real OANDA access (Railway or your own key). Nothing to do.');
  process.exit(1);
}

function fmtTrade(t) {
  return `  ${t.date} ${t.side} entry=${t.entry} sl=${t.sl} tp=${t.tp} outcome=${t.outcome} rMult=${t.rMult} fill=${new Date(t.fillTime * 1000).toISOString()}`;
}

for (const pair of pairs) {
  console.log(`\n=== ${pair.toUpperCase()} ===`);
  const result = await runLiveValidation(pair, { onLog: msg => console.log(msg) });

  if (!result.freshEnough) {
    console.log('  !! still short of 2026-08-01 after gap-fill — check OANDA_KEY/OANDA_ENV and try again.');
    continue;
  }

  for (const [name, recent] of Object.entries(result.recentByVariant)) {
    console.log(`\n[${name}] ${recent.length} trade(s) since 2026-08-01:`);
    if (!recent.length) console.log('  (none)');
    for (const t of recent) console.log(fmtTrade(t));
  }

  console.log(`\n--- matching against Jordan's known trades (${pair}) ---`);
  for (const m of result.matches) {
    if (!m.found) { console.log(`  ${m.known.label}: NO same-direction signal found within +/-48h in any variant.`); continue; }
    console.log(`  ${m.known.label}: closest match [${m.variant}] ${m.date} entry=${m.entry} (Jordan entry=${m.known.entry}, price delta=${m.priceDelta}), fill=${new Date(m.fillTime * 1000).toISOString()}, ${m.hoursFromKnownWindow}h from the known window`);
  }
}

console.log('\nDone. This checks TIMING/DIRECTION/PRICE proximity, not an exact bar-by-bar replay of the screenshots (those specific 1m candles were never in any dataset this repo has access to).');
