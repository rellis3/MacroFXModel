#!/usr/bin/env node
/**
 * Standalone backfill for the Asia + Monday Fib Atlas vote-trades R2 blobs
 * (asia-fib-atlas-vote-backtest.html's data source) — calls the SAME
 * `runOne` each engine's Express route uses (`js/asiaFibAtlasRoutes.js`,
 * `js/mondayFibAtlasRoutes.js`, both exported specifically for this reuse),
 * just outside the running server so a 26-pair backfill isn't competing
 * with server.js's own startup background jobs (forecast auto-warm,
 * volatility bot, etc.) for the single Node thread. Idempotent — re-running
 * for an already-done pair just overwrites its R2 blob with an equivalent
 * result, safe to re-run after an interruption.
 *
 *   node scripts/backfill_fib_atlas_vote_trades.mjs [--only=asia|monday] [pairs...]
 *     (default: all 26 pairs, both engines)
 */
import { runOne as runOneAsia } from '../js/asiaFibAtlasRoutes.js';
import { runOne as runOneMonday } from '../js/mondayFibAtlasRoutes.js';

const ALL_26_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'eurnzd', 'gbpjpy', 'gbpaud', 'gbpcad',
  'gbpchf', 'gbpnzd', 'audjpy', 'audnzd', 'audcad', 'audchf', 'cadjpy', 'chfjpy', 'nzdjpy', 'gold'];

const args = process.argv.slice(2);
const onlyArg = args.find(a => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1] : null;
const pairs = args.filter(a => !a.startsWith('-'));
const list = pairs.length ? pairs : ALL_26_PAIRS;

const engines = [];
if (!only || only === 'asia') engines.push(['asia', runOneAsia]);
if (!only || only === 'monday') engines.push(['monday', runOneMonday]);

for (const pair of list) {
  for (const [name, runOne] of engines) {
    const t0 = Date.now();
    try {
      const result = await runOne(pair, { onLog: m => console.log(`  [${name}] ${m}`) });
      const ms = Date.now() - t0;
      // asiaFibAtlasRoutes.js's runOne returns the main book under
      // voteSummaryByMargin; mondayFibAtlasRoutes.js's runOne IS the
      // vote-trades object, so its summary is at summaryByMargin directly.
      const s2 = (result.voteSummaryByMargin ?? result.summaryByMargin)?.[2];
      console.log(`${pair.toUpperCase()} [${name}] done in ${ms}ms — margin=2: n=${s2?.trades ?? 0} winRate=${s2?.winRate ?? '—'}% Sharpe=${s2?.sharpe ?? '—'}`);
    } catch (e) {
      console.error(`${pair.toUpperCase()} [${name}] FAILED: ${e.message}`);
    }
  }
}
console.log('\nbackfill complete');
