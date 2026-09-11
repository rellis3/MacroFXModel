// Read-only smoke test for the 2026-09-11 dropped-touch fix (js/asiaFibAtlasEngine.js,
// js/mondayFibAtlasEngine.js, js/asiaFibAtlasVoteReview.js). No writes.
// Confirms: (1) previously-dropped 'neither' touches now produce a priced
// trade instead of being excluded, (2) trade count increases by roughly the
// previously-measured dropped% per pair, (3) summaryByMargin numbers stay
// finite/sane (no NaN from a bad sessionClose lookup).
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { asiaFibAtlasWalk } from '../js/asiaFibAtlasEngine.js';
import { mondayFibAtlasWalk } from '../js/mondayFibAtlasEngine.js';
import { buildAsiaFibAtlasBook } from '../js/asiaFibAtlasReport.js';
import { runBarrierWalkForward } from '../js/asiaFibAtlasVoteReview.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { costForPair } from '../js/perLineStrategy.js';

const PAIRS = ['eurusd', 'audusd'];   // one low-drop, one high-drop pair from the earlier sweep
const REARM = 0.3;

async function check(pair, label, walkFn) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`${pair} ${label}: no local M1`); return; }
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);
  const { touches } = walkFn(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM] });
  const pool = touches.filter(t => t.rearmFrac === REARM);
  const neither = pool.filter(t => t.outcome === 'neither');
  const withSessionClose = neither.filter(t => t.sessionClose != null);
  const book = buildAsiaFibAtlasBook(touches, { rearmFrac: REARM });
  const wf1 = runBarrierWalkForward(touches, book, { rearmFrac: REARM, cost, minMargin: 1 });
  const wf2 = runBarrierWalkForward(touches, book, { rearmFrac: REARM, cost, minMargin: 2 });
  const n1 = wf1?.overall?.trades ?? wf1?.tradesUsed ?? 'n/a';
  const sharpe1 = wf1?.overall?.sharpe;
  const sharpe2 = wf2?.overall?.sharpe;
  console.log(`${pair}\t${label}\tpoolTouches=${pool.length}\tneither=${neither.length}\tneitherWithSessionClose=${withSessionClose.length}/${neither.length}\tm1_n=${n1}\tm1_sharpe=${sharpe1}\tm2_sharpe=${sharpe2}\tanyNaN=${[sharpe1, sharpe2].some(x => Number.isNaN(x))}`);
}

for (const pair of PAIRS) {
  await check(pair, 'asia', asiaFibAtlasWalk);
  await check(pair, 'monday', mondayFibAtlasWalk);
}
