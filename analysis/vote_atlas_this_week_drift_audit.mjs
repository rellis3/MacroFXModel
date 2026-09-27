// Owner ask (2026-09-16): why does the backtest show a profit for the last
// 2 trading days while the live account is actually down? First pass found
// most of the gap is a risk_pct/currency-gate config mismatch ("best config"
// runs 0.5% risk, live runs 1%, and the currency loss gate's fixed 1%-of-
// account cap binds twice as fast at the real risk level) -- but even after
// matching risk_pct exactly, backtest said +0.91% for the 2 days vs the live
// account's real -0.92%. This re-runs the SAME trade-by-trade drift audit
// built 2026-09-12 (js/voteAtlasDriftAudit.js) against the actual live
// trades from 2026-09-14/15, with the gap-fill top-up
// vote_atlas_live_trade_validation.mjs already established is required --
// loadM1ForPair ALONE only reaches whatever's in the R2 parquet+tail
// (confirmed stuck at 2026-08-20 locally), nowhere near this week.
import fs from 'fs';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { mergeBarsIntoPacked } from '../js/m1GapFill.js';
import { auditVoteAtlasDrift } from '../js/voteAtlasDriftAudit.js';

const PROD_BASE = 'https://macrofxmodel-production.up.railway.app';
const TODAY = '2026-09-16';

async function fetchGapCandles(pair, fromDate, toDate) {
  const url = `${PROD_BASE}/api/vol-backtest/candles/${pair}?from=${fromDate}&to=${toDate}`;
  const r = await fetch(url);
  const j = await r.json();
  if (!j.ok) { console.warn(`  gap-fetch failed for ${pair}: ${j.error}`); return []; }
  return j.candles.map(c => ({ time: c.time + 'Z', open: c.open, high: c.high, low: c.low, close: c.close }));
}

async function loadM1WithGapFill(pair) {
  let packed = await loadM1ForPair(pair);
  const lastLocalDate = new Date(packed.times[packed.n - 1] * 1000).toISOString().slice(0, 10);
  if (lastLocalDate < TODAY) {
    const gapBars = await fetchGapCandles(pair, lastLocalDate, TODAY);
    console.log(`  ${pair}: local ends ${lastLocalDate}, fetched ${gapBars.length} gap-fill bars`);
    packed = mergeBarsIntoPacked(packed, gapBars);
  }
  return packed;
}

async function main() {
  const r = await fetch(`${PROD_BASE}/api/kv/get?key=volatility_bot_v2_trade_log`);
  const j = await r.json();
  const trades = j.data?.data ?? j.data ?? [];
  const recent = trades.filter(t => t.date === '2026-09-14' || t.date === '2026-09-15');
  console.log(`Auditing ${recent.length} real live trades from 2026-09-14/15...\n`);

  const report = await auditVoteAtlasDrift(recent, loadM1WithGapFill);

  console.log('\n' + '='.repeat(70));
  console.log(`totalTrades: ${report.totalTrades}`);
  console.log(`checkedWithVote: ${report.checkedWithVote}`);
  console.log(`directionMatches: ${report.directionMatches}`);
  console.log(`directionMismatches: ${report.directionMismatches}`);
  console.log(`matchRate: ${report.matchRate}`);
  console.log(`thinMarginOrNoVote: ${report.thinMarginOrNoVote}`);
  console.log('\nMismatch detail:');
  console.log(JSON.stringify(report.mismatchDetail, null, 1));
  fs.writeFileSync('analysis/output/vote_atlas_this_week_drift_audit.json', JSON.stringify(report, null, 1));
}

main();
