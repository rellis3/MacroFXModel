/**
 * Offline tests for the concurrency-drawdown fixes:
 *  (1) the timing floor — a book built from records whose barrier resolved on the touch
 *      bar (exitTime == fillTime, zero duration) must still yield a VALID mark-to-market
 *      drawdown instead of collapsing to n/a;
 *  (2) concentrationStats — average pairwise correlation, effective independent bets, and
 *      single-instrument gross-PnL share.
 * Run: node js/perLineConcurrency.test.mjs
 */
import { runPerLine, concentrationStats } from './perLineStrategy.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, t = 0.05) => Math.abs(a - b) <= t;

// Build fade-favouring touches for one pair. `degenerate` ⇒ exitTime/extTime == fillTime
// (a same-bar barrier resolution) — the case that used to zero out the MTM path.
function touchesFor(pair, n, t0, { degenerate }) {
  const out = [];
  const day = new Date('2022-01-03T00:00:00Z').getTime();
  for (let i = 0; i < n; i++) {
    const date = new Date(day + i * 86400_000).toISOString().slice(0, 10);
    const fillTime = t0 + i * 86400;                 // epoch seconds
    const reverted = i % 4 !== 0;                    // ~75% revert → fade pays
    out.push({
      date, open: 100, line: 'HL50_up', name: 'HL50', side: 'up',
      level: 101, innerLvl: 100.5, outerLvl: 102, reverted, decidedBy: 'barrier',
      cell: 'HL50_up|fast', extPct: 0.6, retracePct: 0.5,
      fillTime,
      exitTime: degenerate ? fillTime : fillTime + 1800,   // same-bar vs 30-min hold
      extTime:  degenerate ? fillTime : fillTime + 600,
    });
  }
  return out;
}

console.log('[timing floor → MTM stays valid on zero-duration records]');
{
  // Both pairs' records are degenerate (exitTime == fillTime) — the stale-data shape.
  const touchesByPair = {
    eurusd: touchesFor('eurusd', 200, 1_600_000_000, { degenerate: true }),
    audusd: touchesFor('audusd', 200, 1_600_000_000 + 3600, { degenerate: true }),
  };
  const res = runPerLine(touchesByPair, { splitFrac: 0.5, minN: 20, marginPct: 0,
    mcRuns: 50, bootRuns: 50, survivorMargin: 0.1, minSurvivorTrades: 20 });
  const idd = res.survivors.intradayDD;
  ok('MTM block present', !!idd);
  ok('zero-duration collapsed away (pctZeroDuration ~0)', (idd.zeroDurPct ?? 100) < 5, `zeroDurPct=${idd.zeroDurPct}`);
  ok('MTM drawdown is VALID despite degenerate input timestamps', idd.valid === true, `valid=${idd.valid}`);
  ok('survivor standard book present', !!res.survivors.book && res.survivors.book.sharpe != null);
}

console.log('[concentrationStats]');
{
  const days = [];
  { let d = new Date('2023-01-02T00:00:00Z'); for (let i = 0; i < 90; i++) { d = new Date(d.getTime() + 86400_000); days.push(d.toISOString().slice(0, 10)); } }
  const drv = days.map((_, i) => Math.sin(i / 6));
  const mk = f => days.map((dt, i) => ({ date: dt, pnl: +f(i).toFixed(4) }));
  // eurusd & audusd share the driver (correlated); gold is its own thing and huge.
  const pnlByPair = {
    eurusd: mk(i => drv[i] * 0.4 + 0.05),
    audusd: mk(i => drv[i] * 0.4 + 0.04),
    gold:   mk(i => Math.cos(i / 3) * 0.9 + 0.05),
  };
  const perPair = { eurusd: { totalPnl: 20 }, audusd: { totalPnl: 18 }, gold: { totalPnl: 80 } };
  const c = concentrationStats(['eurusd', 'audusd', 'gold'], pnlByPair, perPair);
  ok('reports N pairs', c.pairs === 3);
  ok('detects positive average correlation', c.avgCorr > 0.1, `avgCorr=${c.avgCorr}`);
  ok('effective bets < N (correlation shrinks breadth)', c.nEff < 3 && c.nEff >= 1, `nEff=${c.nEff}`);
  ok('flags the dominant instrument', c.topPair === 'gold' && c.topPairSharePct > 50, `top=${c.topPair} ${c.topPairSharePct}%`);
  ok('<2 pairs → null (no correlation to speak of)', concentrationStats(['eurusd'], pnlByPair, perPair) === null);
}

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
if (failures) process.exit(1);
