#!/usr/bin/env node
/**
 * Run the Asia Fib Atlas engine (js/asiaFibAtlasEngine.js) on real M1 data and
 * print the OOS-held findings — the first real (non-synthetic) validation of
 * the engine built in this branch. See MD files/LEGO_MODULES.md §1aq for the
 * engine's own design notes.
 *
 *   node scripts/run_asia_fib_atlas.mjs [pairs...]   (default: eurusd gbpusd usdjpy gold)
 *   node scripts/run_asia_fib_atlas.mjs eurusd --full   (print the full book text, not just held findings)
 */

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { asiaFibAtlasWalk } from '../js/asiaFibAtlasEngine.js';
import { buildAsiaFibAtlasBook, extractHeldFindings, renderAsiaFibBookText } from '../js/asiaFibAtlasReport.js';

const args = process.argv.slice(2);
const full = args.includes('--full');
const pairs = args.filter(a => !a.startsWith('-'));
const list = pairs.length ? pairs : ['eurusd', 'gbpusd', 'usdjpy', 'gold'];

for (const pair of list) {
  const t0 = Date.now();
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`\n=== ${pair}: no M1 ===`); continue; }
  const assetClass = pair === 'gold' ? 'commodity' : 'fx';

  const { touches, coverage } = asiaFibAtlasWalk(packed, { instrument: pair, assetClass, rearmFracs: [0.3] });
  console.log(`\n=== ${pair.toUpperCase()} — ${packed.n} M1 bars, walk ${Date.now() - t0}ms ===`);
  console.log(`  coverage: ${coverage?.from} -> ${coverage?.to} (${coverage?.sessions} sessions, estimator ${coverage?.estimator})`);
  console.log(`  touches: ${touches.length}`);
  if (!touches.length) continue;

  const above = touches.filter(t => t.side === 'above').length;
  const below = touches.filter(t => t.side === 'below').length;
  const outcomes = touches.reduce((a, t) => (a[t.outcome] = (a[t.outcome] || 0) + 1, a), {});
  console.log(`  side split: above=${above} below=${below}   outcomes: ${JSON.stringify(outcomes)}`);

  const book = buildAsiaFibAtlasBook(touches, { rearmFrac: 0.3 });
  if (!book) { console.log('  (no book — too few touches to split IS/OOS)'); continue; }
  console.log(`  book: ${Object.keys(book.cells).length} cells, split ${book.splitDate}`);

  if (full) {
    console.log(renderAsiaFibBookText(book));
    continue;
  }

  const findings = extractHeldFindings(book, { limit: 15 });
  if (!findings.length) { console.log('  no dimension held OOS on this pair (n≥30 both halves, ≥3pp effect, same sign)'); continue; }
  console.log(`  top ${findings.length} OOS-held findings (dimension buckets, |effect| desc):`);
  for (const f of findings) {
    console.log(`    ${f.cellKey.padEnd(12)} ${f.dimKey.padEnd(20)} ${String(f.bucket).padEnd(16)} IS Δ${String(f.deltaOutIS).padStart(6)}pp (n=${f.n.is})  OOS Δ${String(f.deltaOutOOS).padStart(6)}pp (n=${f.n.oos})  out%IS=${f.outPctIS} out%OOS=${f.outPctOOS}`);
  }
}
