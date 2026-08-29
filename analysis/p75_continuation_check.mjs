// Quick check before building anything: the user's idea is "when a trade
// hits its target and the move is still continuing in the same direction,
// roll the TP/SL out to the next rung instead of closing and hoping a fresh
// entry fires." For a p50 trade, the target IS p75 -- so "price reaches p75
// while still open" isn't really a distinct event, it's the trade winning.
// The real, answerable question: once price reaches p75, does it usually
// KEEP GOING to p90 (extending would help), or retrace back toward p50
// (today's behavior -- take the win, close -- is already close to right)?
// p75's own real outcome field already answers this directly: 'out' means
// continued to p90, 'back' means retraced to p50, 'neither' means it ran out
// of data before resolving either way. No synthetic boundary needed this
// time (p90 is p75's REAL outer rung).
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook } from '../js/levelAtlasReport.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';

const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

let totals = { back: 0, out: 0, neither: 0 };
const perPair = [];

for (const pair of PAIRS) {
  console.log(`Loading M1 + walking ladder for ${pair}...`);
  const packed = await loadM1ForPair(pair);
  if (!packed) { console.log(`  no M1 for ${pair}, skipping`); continue; }
  const assetClass = assetClassFor(pair);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [0.3], pendingRearmFrac: 0.3 });
  const book = buildAtlasBook(touches, { rearmFrac: 0.3 });
  if (!book) { console.log(`  no book for ${pair}, skipping`); continue; }

  const p75OOS = touches.filter(t => t.rung === 'p75' && t.rearmFrac === 0.3 && t.date >= book.splitDate);
  const counts = { back: 0, out: 0, neither: 0 };
  for (const t of p75OOS) counts[t.outcome]++;
  const n = p75OOS.length;
  console.log(`  ${pair}: n=${n}  back=${(counts.back / n * 100).toFixed(1)}%  out=${(counts.out / n * 100).toFixed(1)}%  neither=${(counts.neither / n * 100).toFixed(1)}%`);
  perPair.push({ pair, n, ...counts });
  totals.back += counts.back; totals.out += counts.out; totals.neither += counts.neither;
}

const totalN = totals.back + totals.out + totals.neither;
console.log(`\n──── TOTAL across ${perPair.length} pairs, p75 touches, OOS (n=${totalN}) ────`);
console.log(`back (retraced to p50): ${(totals.back / totalN * 100).toFixed(1)}%`);
console.log(`out  (continued to p90): ${(totals.out / totalN * 100).toFixed(1)}%`);
console.log(`neither (unresolved):    ${(totals.neither / totalN * 100).toFixed(1)}%`);
