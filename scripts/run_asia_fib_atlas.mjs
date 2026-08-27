#!/usr/bin/env node
/**
 * Run the Asia Fib Atlas engine (js/asiaFibAtlasEngine.js) on real M1 data and
 * print the OOS-held findings — the first real (non-synthetic) validation of
 * the engine built in this branch. See MD files/LEGO_MODULES.md §1aq for the
 * engine's own design notes.
 *
 *   node scripts/run_asia_fib_atlas.mjs [pairs...]   (default: eurusd gbpusd usdjpy gold)
 *   node scripts/run_asia_fib_atlas.mjs eurusd --full   (print the full book text, not just held findings)
 *   node scripts/run_asia_fib_atlas.mjs --headline [pairs...]
 *     Widen check for the two cross-instrument headline findings (found on
 *     4 pairs) across a larger universe — how many cells hold, on how many
 *     pairs, same sign — instead of the top-15-per-pair dump above.
 */

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { asiaFibAtlasWalk } from '../js/asiaFibAtlasEngine.js';
import { buildAsiaFibAtlasBook, extractHeldFindings, renderAsiaFibBookText } from '../js/asiaFibAtlasReport.js';
import { cvolSeries, CVOL_PRODUCTS } from '../js/cvolLoader.js';
import { majorEventEpochs } from '../js/calendarLoader.js';

const ALL_26_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'eurnzd', 'gbpjpy', 'gbpaud', 'gbpcad',
  'gbpchf', 'gbpnzd', 'audjpy', 'audnzd', 'audcad', 'audchf', 'cadjpy', 'chfjpy', 'nzdjpy', 'gold'];

const args = process.argv.slice(2);
const full = args.includes('--full');
const headline = args.includes('--headline');
const pairs = args.filter(a => !a.startsWith('-'));
const list = pairs.length ? pairs : (headline ? ALL_26_PAIRS : ['eurusd', 'gbpusd', 'usdjpy', 'gold']);

// cvolLoader's product keys are uppercase FX/XAU symbols; this engine's own
// pair naming ('gold') doesn't match CVOL's ('XAUUSD') — same mapping the
// engine's own pipSize/assetClass lookups need.
const CVOL_PRODUCT = { gold: 'XAUUSD' };
const macroEvents = majorEventEpochs();   // loaded once, shared across pairs — currency-filtered inside the engine per instrument

// The two cross-instrument findings from the first 4-pair run — checking
// whether they generalise to the full pair universe, not just USD majors.
const HEADLINE_TARGETS = [
  { dimKey: 'prevOutcomeSameDay', bucket: 'out', label: 'same-day retest persistence' },
  { dimKey: 'sessionHandoff', bucket: '5·ny-late-preasia', label: 'late-NY reversal' },
];
const headlineRollup = HEADLINE_TARGETS.map(t => ({ ...t, perPair: [] }));

for (const pair of list) {
  const t0 = Date.now();
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`\n=== ${pair}: no M1 ===`); continue; }
  const assetClass = pair === 'gold' ? 'commodity' : 'fx';

  const cvolProduct = CVOL_PRODUCT[pair] ?? pair.toUpperCase();
  const ivByDate = CVOL_PRODUCTS.includes(cvolProduct) ? await cvolSeries(cvolProduct) : null;
  if (!ivByDate) console.log(`  (no CVOL coverage for ${pair} — ivRegime/vrp/ivSkewDir will read null)`);

  const { touches, coverage } = asiaFibAtlasWalk(packed, { instrument: pair, assetClass, rearmFracs: [0.3], ivByDate, macroEvents });
  const walkMs = Date.now() - t0;

  if (headline) {
    const book = touches.length ? buildAsiaFibAtlasBook(touches, { rearmFrac: 0.3 }) : null;
    const line = [`${pair.toUpperCase().padEnd(8)} touches=${String(touches.length).padStart(6)}  ${walkMs}ms`];
    for (const target of headlineRollup) {
      const cellsWithBucket = [];
      const cellsHeld = [];
      if (book) {
        for (const cell of Object.values(book.cells)) {
          const isRow = cell.dims[target.dimKey]?.is?.[target.bucket];
          const oosRow = cell.dims[target.dimKey]?.oos?.[target.bucket];
          if (!isRow) continue;
          cellsWithBucket.push({ deltaIS: isRow.deltaOut, deltaOOS: oosRow?.deltaOut ?? null, n: isRow.n });
          if (isRow.holdsOOS) cellsHeld.push({ deltaIS: isRow.deltaOut, deltaOOS: oosRow?.deltaOut ?? null, n: isRow.n });
        }
      }
      const avg = arr => arr.length ? +(arr.reduce((s, x) => s + x, 0) / arr.length).toFixed(1) : null;
      const result = {
        pair: pair.toUpperCase(),
        cellsWithBucket: cellsWithBucket.length,
        cellsHeld: cellsHeld.length,
        avgDeltaISHeld: avg(cellsHeld.map(c => c.deltaIS)),
        avgDeltaOOSHeld: avg(cellsHeld.map(c => c.deltaOOS).filter(v => v != null)),
        avgDeltaISAll: avg(cellsWithBucket.map(c => c.deltaIS)),
        minN: cellsHeld.length ? Math.min(...cellsHeld.map(c => c.n)) : null,
      };
      target.perPair.push(result);
      line.push(`${target.label.padEnd(28)} held ${String(result.cellsHeld).padStart(2)}/${String(result.cellsWithBucket).padStart(2)}  avgΔ(held) IS ${String(result.avgDeltaISHeld).padStart(6)} OOS ${String(result.avgDeltaOOSHeld).padStart(6)}  avgΔ(all) ${String(result.avgDeltaISAll).padStart(6)}`);
    }
    console.log(line.join('  |  '));
    continue;
  }

  console.log(`\n=== ${pair.toUpperCase()} — ${packed.n} M1 bars, walk ${walkMs}ms ===`);
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

if (headline) {
  console.log(`\n=== cross-pair rollup (${list.length} pairs) ===`);
  for (const target of headlineRollup) {
    const withHeld = target.perPair.filter(p => p.cellsHeld > 0);
    const signs = withHeld.map(p => Math.sign(p.avgDeltaISHeld));
    const posCount = signs.filter(s => s > 0).length;
    const negCount = signs.filter(s => s < 0).length;
    const sameSignCount = Math.max(posCount, negCount);
    const avg = arr => arr.length ? +(arr.reduce((s, x) => s + x, 0) / arr.length).toFixed(1) : null;
    console.log(`\n  ${target.label} (${target.dimKey} = ${target.bucket}):`);
    console.log(`    pairs with >=1 held cell: ${withHeld.length}/${target.perPair.length}`);
    console.log(`    of those, same-sign agreement: ${sameSignCount}/${withHeld.length}  (pos=${posCount} neg=${negCount})`);
    console.log(`    avg IS Δ across held-pairs:  ${avg(withHeld.map(p => p.avgDeltaISHeld))}pp`);
    console.log(`    avg OOS Δ across held-pairs: ${avg(withHeld.map(p => p.avgDeltaOOSHeld))}pp`);
    console.log(`    pairs with NO held cell: ${target.perPair.filter(p => p.cellsHeld === 0).map(p => p.pair).join(', ') || '(none)'}`);
  }
}
