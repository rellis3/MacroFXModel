#!/usr/bin/env node
/**
 * Vote Atlas v2 — the SAME pipeline as scripts/build_level_atlas_vote_trades.mjs
 * (atlasWalk -> buildAtlasBook -> buildBarrierTrades -> summarizeTrades, byte-
 * for-byte the same functions, nothing forked), except `atlasWalk` is handed
 * `forecastLadderParamsV2.js`'s HAR-RV(log) calibration instead of the
 * incumbent Yang-Zhang `forecastLadderParams.js` — the one seam
 * js/levelAtlasEngine.js's `atlasWalk` and js/forecastLadder.js's `buildLadder`
 * were given an optional `ladderParams` override for. voteDecision/
 * priceBarrierTrade/costForPair/buildAtlasBook/summarizeTrades never touch
 * sigma at all, so none of them needed to change or be duplicated.
 *
 * Writes to a SEPARATE output directory (level-atlas-vote-trades-v2/), never
 * level-atlas-vote-trades/ — v1's files are a live-adjacent artifact and must
 * never be silently overwritten by a comparison run (see MD files/
 * VOL_LADDER_NOTES.md and this session's own near-miss overwriting
 * forge/out_vol_v2/ for exactly this class of mistake).
 *
 *   node scripts/build_level_atlas_vote_trades_v2.mjs               (all missing pairs)
 *   node scripts/build_level_atlas_vote_trades_v2.mjs eurjpy gbpjpy (specific pairs, overwrites)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook } from '../js/levelAtlasReport.js';
import { buildBarrierTrades, VOTE_TRADES_SCHEMA } from '../js/levelAtlasVoteReview.js';
import { summarizeTrades } from '../js/metricsCore.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { LADDER_PARAMS as LADDER_PARAMS_V2 } from '../js/forecastLadderParamsV2.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'analysis', 'output', 'level-atlas-vote-trades-v2');
const DEFAULT_REARM = 0.3;

// Same 26-pair universe v1's script uses — an honest A/B needs the identical
// instrument set, not a different one that could hide a coverage difference.
const ALL_26_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'eurnzd', 'gbpjpy', 'gbpaud', 'gbpcad',
  'gbpchf', 'gbpnzd', 'audjpy', 'audnzd', 'audcad', 'audchf', 'cadjpy', 'chfjpy', 'nzdjpy', 'gold'];

const args = process.argv.slice(2);
const requested = args.filter(a => !a.startsWith('-'));
const pairs = requested.length ? requested : ALL_26_PAIRS.filter(p =>
  !fs.existsSync(path.join(OUT_DIR, `${p}-votetrades.json`)));

if (!pairs.length) {
  console.log('Nothing to do — every pair in ALL_26_PAIRS already has a local v2 vote-trades file.');
  process.exit(0);
}
console.log(`Building v2 (HAR-RV log) vote-trades for: ${pairs.join(', ')}`);

async function buildOne(pair) {
  const sym = pair.toUpperCase();
  const t0 = Date.now();
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`  ${sym}: SKIPPED — no local M1 data`); return; }

  const assetClass = assetClassFor(pair);
  const { touches } = atlasWalk(packed, {
    instrument: sym, assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM,
    ladderParams: LADDER_PARAMS_V2,
  });
  const book = buildAtlasBook(touches, { rearmFrac: DEFAULT_REARM });
  if (!book) { console.log(`  ${sym}: SKIPPED — buildAtlasBook returned null (insufficient OOS touches?)`); return; }

  const cost = costForPair(pair, assetClass);
  const trades = buildBarrierTrades(touches, book, { rearmFrac: DEFAULT_REARM, cost });
  const summaryByMargin = {};
  for (const m of [1, 2, 3, 4]) {
    const sub = trades.filter(t => t.margin >= m);
    summaryByMargin[m] = summarizeTrades(sub.map(t => t.pnlPct), sub.map(t => t.date));
  }

  const payload = { instrument: sym, generatedAt: new Date().toISOString(), schema: VOTE_TRADES_SCHEMA, cost, splitDate: book.splitDate, trades, summaryByMargin, ladder: 'v2-har-rv-log' };
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
