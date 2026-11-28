// Tests for the atlas-books pipeline (scripts/atlas-books/build.mjs) on random-walk bid/ask:
// every book prices trades in the production shape, and with no edge in the prices no book
// shows one (mean R near zero minus about one spread). No real data is read.
import { votedTouches, priceTouch } from '../scripts/atlas-books/build.mjs';
import { bookKey, isAtlasBook } from './atlasBooks.js';
import { randomWalkPacked } from './atlasNullCheck.js';

let failures = 0;
const ok = (name, cond, detail = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${detail ? '  ' + detail : ''}`); if (!cond) failures++; };

function synthetic(seed, half) {
  const packed = randomWalkPacked({ seed, years: 3 });
  const d = { times: packed.times };
  const src = { o: packed.opens, h: packed.highs, l: packed.lows, c: packed.closes };
  for (const s of ['o', 'h', 'l', 'c']) { d['bid_' + s] = Float64Array.from(src[s], x => x - half); d['ask_' + s] = Float64Array.from(src[s], x => x + half); }
  return { packed, d };
}

ok('bookKey keeps every file under atlas-books/', bookKey('retest', 'asia', 'EURUSD') === 'atlas-books/retest/asia/eurusd-votetrades.json');
ok('unknown book refused', !isAtlasBook('live') && (() => { try { bookKey('live', 'vote', 'x'); return false; } catch { return true; } })());

const REQUIRED = ['date', 'time', 'resolveTime', 'side', 'rung', 'entry', 'pip', 'decision', 'margin', 'targetPips', 'stopPips', 'win', 'pnlPct', 'rMultiple', 'maePips'];
for (const sys of ['asia', 'vote']) {
  const { packed, d } = synthetic(sys === 'vote' ? 7 : 3, 0);
  const { touches } = votedTouches(sys, 'eurusd', packed, { ladder: 'v1' });
  ok(`${sys}: random walk gives voted OOS touches`, touches.length > 200, `n=${touches.length}`);
  for (const mode of ['limit', 'retest']) {
    const trades = [], skipped = {};
    for (const { t, vd } of touches) {
      const p = priceTouch(sys, { ...t, instrument: 'EURUSD' }, vd, d, packed, mode);
      if (p.trade) trades.push(p.trade); else skipped[p.skip] = (skipped[p.skip] ?? 0) + 1;
    }
    const r = trades.map(x => x.rMultiple), m = r.reduce((a, b) => a + b, 0) / r.length;
    const se = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1) / r.length);
    ok(`${sys}/${mode}: trades carry the fields the portfolio code reads`, trades.length > 50 && REQUIRED.every(k => trades[0][k] !== undefined), `n=${trades.length} skipped=${JSON.stringify(skipped)}`);
    ok(`${sys}/${mode}: no edge on a zero-spread random walk (mean R within 3.5 SE of 0)`, Math.abs(m) < 3.5 * se + 0.02, `mean=${m.toFixed(4)} se=${se.toFixed(4)}`);
    ok(`${sys}/${mode}: pnlPct = R x stop as % of the line`, trades.every(x => Math.abs(x.pnlPct - x.rMultiple * x.stopPips * x.pip / x.entry * 100) < 1e-3));
    if (mode === 'retest') ok(`${sys}/retest: fades use the retest entry, follows the stop entry`, trades.every(x => x.entryMode === (x.decision === 'fade' ? 'retest' : 'stop')) && (skipped.cancelled ?? 0) + (skipped.notArmed ?? 0) > 0);
  }
}

if (failures) { console.log(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nALL PASSED');
