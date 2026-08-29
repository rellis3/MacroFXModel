#!/usr/bin/env node
/**
 * Generates `analysis/output/level-atlas-vote-trades/{pair}-votetrades.json`
 * for pairs that don't have one yet — the same local-file, no-R2-needed
 * fallback `js/levelAtlasRoutes.js`'s `loadLocalVoteTrades` already reads.
 * Reuses the EXACT same pipeline `runOne` (levelAtlasRoutes.js) uses to
 * build + persist a pair's vote-trades, minus two things that pipeline does
 * that this script doesn't need: the OANDA gap-fill (no OANDA_KEY in this
 * sandbox — M1 data is already present in full from the local parquet
 * cache, gap-fill only tops up to "right now" for the live-context UI,
 * which this script doesn't touch) and the full atlas book's R2 persistence
 * (a separate, larger artifact `today.html`'s card UI reads — out of scope
 * for the portfolio vote-backtest, which only needs the trade list).
 *
 * Universe: the SAME `ALL_26_PAIRS` list `scripts/run_asia_fib_atlas.mjs`
 * already established for this project — the "26 multitasking portfolio"
 * pairs, not a fresh guess.
 *
 *   node scripts/build_level_atlas_vote_trades.mjs               (all missing pairs)
 *   node scripts/build_level_atlas_vote_trades.mjs eurjpy gbpjpy (specific pairs, overwrites)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook } from '../js/levelAtlasReport.js';
import { buildBarrierTrades } from '../js/levelAtlasVoteReview.js';
import { summarizeTrades } from '../js/metricsCore.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'analysis', 'output', 'level-atlas-vote-trades');
const DEFAULT_REARM = 0.3;

const ALL_26_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'eurnzd', 'gbpjpy', 'gbpaud', 'gbpcad',
  'gbpchf', 'gbpnzd', 'audjpy', 'audnzd', 'audcad', 'audchf', 'cadjpy', 'chfjpy', 'nzdjpy', 'gold'];

const args = process.argv.slice(2);
const requested = args.filter(a => !a.startsWith('-'));
const pairs = requested.length ? requested : ALL_26_PAIRS.filter(p =>
  !fs.existsSync(path.join(OUT_DIR, `${p}-votetrades.json`)));

if (!pairs.length) {
  console.log('Nothing to do — every pair in ALL_26_PAIRS already has a local vote-trades file.');
  process.exit(0);
}
console.log(`Building vote-trades for: ${pairs.join(', ')}`);

async function buildOne(pair) {
  const sym = pair.toUpperCase();
  const t0 = Date.now();
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`  ${sym}: SKIPPED — no local M1 data`); return; }

  const assetClass = assetClassFor(pair);
  const { touches } = atlasWalk(packed, { instrument: sym, assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
  const book = buildAtlasBook(touches, { rearmFrac: DEFAULT_REARM });
  if (!book) { console.log(`  ${sym}: SKIPPED — buildAtlasBook returned null (insufficient OOS touches?)`); return; }

  const cost = costForPair(pair, assetClass);
  const trades = buildBarrierTrades(touches, book, { rearmFrac: DEFAULT_REARM, cost });
  const summaryByMargin = {};
  for (const m of [1, 2, 3, 4]) {
    const sub = trades.filter(t => t.margin >= m);
    summaryByMargin[m] = summarizeTrades(sub.map(t => t.pnlPct), sub.map(t => t.date));
  }

  const payload = { instrument: sym, generatedAt: new Date().toISOString(), cost, splitDate: book.splitDate, trades, summaryByMargin };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${pair}-votetrades.json`), JSON.stringify(payload));

  const m3 = summaryByMargin[3];
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  ${sym}: ${trades.length} trades, margin>=3: n=${m3.trades} winRate=${m3.winRate}% sharpe=${m3.sharpe} (${secs}s, ${packed.n.toLocaleString()} M1 bars)`);
}

for (const pair of pairs) {
  try { await buildOne(pair); }
  catch (e) { console.log(`  ${pair.toUpperCase()}: FAILED — ${e.message}`); }
}
console.log('Done.');
