// Does REPEATED touching of the SAME rung within one session ("whiplash")
// carry real information the strategy could use, rather than just being
// pooled anonymously into the headline win rate?
//
// Owner's own framing (2026-09-03), after the fib_atlas_bot review found
// EURGBP repeatedly re-touching the same Asia rung on a choppy day: "instead
// of building a gate to block, can we analyse history — does it flip after
// X times, does it always fail past some point, does it happen more on
// volatile days" — an exploratory characterization, not a filter to ship.
//
// `buildBarrierTrades`/`runBarrierWalkForward` (asiaFibAtlasVoteReview.js) —
// the pipeline behind every headline number this session — pools EVERY
// re-armed touch of a rung into one flat trade list with no awareness of
// how many times that exact rung already fired this session. This script
// re-groups the SAME already-validated touches by (side, level, session) to
// see whether touch position within that group (1st, 2nd, 3rd, 4th+), the
// time gap since the PRIOR touch of that same rung, or the session's own
// realized-range regime predicts anything about outcome — using the exact
// same margin>=2 vote/pricing math production uses, real OOS split, real
// cost, so a real finding here could feed a future CONDITIONING dimension
// (e.g. widening prevOutcomeSameDay into a repeat-count-aware version)
// rather than a hard block.
//
//   node analysis/fib_atlas_whiplash_analysis.mjs
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { asiaFibAtlasWalk } from '../js/asiaFibAtlasEngine.js';
import { mondayFibAtlasWalk } from '../js/mondayFibAtlasEngine.js';
import { buildAsiaFibAtlasBook } from '../js/asiaFibAtlasReport.js';
import { voteDecision, priceBarrierTrade } from '../js/asiaFibAtlasVoteReview.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { costForPair } from '../js/perLineStrategy.js';

const PAIRS = [
  'nzdusd', 'usdjpy', 'gbpjpy', 'euraud', 'eurgbp', 'gbpusd', 'audusd', 'eurjpy',
  'usdchf', 'eurusd', 'usdcad', 'eurnzd', 'audnzd', 'audchf', 'audcad', 'gbpcad',
  'gbpnzd', 'cadjpy', 'gbpaud', 'audjpy', 'gbpchf', 'nzdjpy', 'eurchf', 'eurcad',
  'chfjpy', 'gold',
];
const DEFAULT_REARM = 0.3;
const MIN_MARGIN = 2;
const MIN_CELL_N = 30;   // this project's own OOS-trust floor

function median(arr) {
  const s = arr.filter(x => x != null && x > 0).sort((a, b) => a - b);
  if (!s.length) return null;
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
function volBucketFor(rangeVal, trailingMedian) {
  if (rangeVal == null || !trailingMedian) return null;
  const r = rangeVal / trailingMedian;
  return r < 0.7 ? 'quiet' : r > 1.4 ? 'wild' : 'normal';
}
function gapBucket(mins) {
  if (mins == null) return null;
  if (mins < 30) return '<30m';
  if (mins < 120) return '30-120m';
  if (mins < 480) return '2-8h';
  return '>8h';
}
function touchIdxBucket(i) { return i >= 4 ? '4+' : String(i); }

function summarize(rows) {
  const n = rows.length;
  if (!n) return { n: 0 };
  const wins = rows.filter(r => r.win).length;
  const grossWin = rows.filter(r => r.win).reduce((a, r) => a + r.pnlPct, 0);
  const grossLoss = -rows.filter(r => !r.win).reduce((a, r) => a + r.pnlPct, 0);
  return {
    n, winRate: +(wins / n * 100).toFixed(1),
    pf: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(3) : (grossWin > 0 ? Infinity : 0),
  };
}
function fmtCell(s) {
  if (!s || !s.n) return 'n=0';
  const flag = s.n < MIN_CELL_N ? ' (thin!)' : '';
  return `n=${s.n} winRate=${s.winRate}% PF=${s.pf === Infinity ? 'inf' : s.pf}${flag}`;
}

async function ladderRows(pair, ladder, packed, assetClass, cost) {
  const walk = ladder === 'asia' ? asiaFibAtlasWalk : mondayFibAtlasWalk;
  const { touches } = walk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM] });
  if (!touches?.length) return [];
  const book = buildAsiaFibAtlasBook(touches, { rearmFrac: DEFAULT_REARM });
  if (!book) return [];

  const oos = touches.filter(t => t.rearmFrac === DEFAULT_REARM && t.date >= book.splitDate && t.outcome !== 'neither');
  if (!oos.length) return [];

  const sessionField = ladder === 'asia' ? 'date' : 'mondayDate';
  const rangeField = ladder === 'asia' ? 'asiaRange' : 'mondayRange';

  // Trailing-median range regime, per unique session, chronological, pair-local.
  const sessSeq = [...new Map(oos.map(t => [t[sessionField], t[rangeField]])).entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const WIN = 20;
  const regimeBySession = new Map();
  for (let i = 0; i < sessSeq.length; i++) {
    const trailing = sessSeq.slice(Math.max(0, i - WIN), i).map(([, r]) => r);
    regimeBySession.set(sessSeq[i][0], volBucketFor(sessSeq[i][1], median(trailing)));
  }
  // Whiplash frequency proxy: total touches THIS session (all rungs pooled).
  const touchesPerSession = new Map();
  for (const t of oos) touchesPerSession.set(t[sessionField], (touchesPerSession.get(t[sessionField]) ?? 0) + 1);

  // Group by (side, level, session) to get touch order + gap within that exact rung's own repeat sequence.
  const groups = new Map();
  for (const t of oos) {
    const k = `${t.side}|${t.level}|${t[sessionField]}`;
    (groups.get(k) ?? groups.set(k, []).get(k)).push(t);
  }

  const rows = [];
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.time - b.time);
    arr.forEach((t, idx) => {
      const vd = voteDecision(book, t);
      if (!vd || vd.margin < MIN_MARGIN) return;
      const priced = priceBarrierTrade(t, vd.decision, cost);
      if (!priced) return;
      rows.push({
        pair, ladder, win: priced.win, pnlPct: priced.pnlPct,
        touchIndex: idx + 1, gapMin: idx > 0 ? +((t.time - arr[idx - 1].time) / 60).toFixed(1) : null,
        volRegime: regimeBySession.get(t[sessionField]) ?? null,
        sessionTouchCount: touchesPerSession.get(t[sessionField]) ?? null,
      });
    });
  }
  return rows;
}

async function main() {
  const all = [];
  for (const pair of PAIRS) {
    console.log(`\n=== ${pair.toUpperCase()} ===`);
    const packed = await loadM1ForPair(pair);
    if (!packed?.n) { console.log('  no M1 data'); continue; }
    const assetClass = assetClassFor(pair);
    const cost = costForPair(pair, assetClass);
    for (const ladder of ['asia', 'monday']) {
      const rows = await ladderRows(pair, ladder, packed, assetClass, cost);
      console.log(`  ${ladder}: ${rows.length} margin>=2 trades in whiplash groups`);
      all.push(...rows);
    }
  }

  for (const ladder of ['asia', 'monday']) {
    const L = all.filter(r => r.ladder === ladder);
    console.log(`\n\n════ ${ladder.toUpperCase()} — pooled across ${PAIRS.length} pairs (n=${L.length} margin>=2 trades) ════`);

    console.log('\n-- By touch index within (side, level, session) --');
    for (const b of ['1', '2', '3', '4+']) {
      console.log(`  touchIndex=${b}: ${fmtCell(summarize(L.filter(r => touchIdxBucket(r.touchIndex) === b)))}`);
    }

    console.log('\n-- By gap since the PRIOR touch of the SAME rung (touchIndex>=2 only) --');
    for (const b of ['<30m', '30-120m', '2-8h', '>8h']) {
      console.log(`  gap=${b}: ${fmtCell(summarize(L.filter(r => r.touchIndex >= 2 && gapBucket(r.gapMin) === b)))}`);
    }

    console.log('\n-- By session volatility regime (trailing-20-session range ratio) --');
    for (const b of ['quiet', 'normal', 'wild']) {
      const isolated = summarize(L.filter(r => r.volRegime === b && r.touchIndex === 1));
      const repeat = summarize(L.filter(r => r.volRegime === b && r.touchIndex >= 2));
      console.log(`  ${b}: isolated(1st touch) ${fmtCell(isolated)}  |  repeat(2nd+) ${fmtCell(repeat)}`);
    }

    console.log('\n-- Whiplash frequency vs volatility regime (avg total touches/session, all rungs pooled) --');
    const bySessTouch = new Map();
    for (const r of L) {
      if (!bySessTouch.has(r.volRegime)) bySessTouch.set(r.volRegime, []);
      bySessTouch.get(r.volRegime).push(r.sessionTouchCount);
    }
    for (const b of ['quiet', 'normal', 'wild']) {
      const vals = (bySessTouch.get(b) ?? []).filter(v => v != null);
      const avg = vals.length ? +(vals.reduce((a, v) => a + v, 0) / vals.length).toFixed(1) : null;
      console.log(`  ${b}: avg session touch count = ${avg ?? 'n/a'} (n=${vals.length})`);
    }
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
