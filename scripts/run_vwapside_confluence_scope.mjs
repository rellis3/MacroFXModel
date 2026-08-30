#!/usr/bin/env node
/**
 * SCOPING RUN, not a new engine — the owner asked to chase whether `vwapSide`
 * (session-VWAP-relative context, `js/confluenceFeatures.js`) sharpens the
 * ONE system in this codebase with real, validated OOS edge:
 * `js/perLineStrategy.js`'s HL-fade policy on `approachVel`
 * (33/33 pairs profitable OOS — see `MD files/ENTRY_ZONE_CONFIDENCE.md`).
 *
 * This is a genuinely different question from every VWAP-standalone test in
 * `GOLD_VWAP_FIXED_SIGMA_FINDINGS.md` (13/13 null): does VWAP context sharpen
 * an edge that already exists, not does VWAP alone have edge (already a clean
 * no). `LEGO_MODULES.md`'s existing "confluence features first round" names
 * verdicts for 5 of the 6 confluence features (confluence/wtMtf/wtSlow/
 * momAdx/htfTrend — mixed-to-null) but not vwapSide specifically; this fills
 * that gap using the SAME instruments (EURUSD/gold/NQ) for direct
 * comparability.
 *
 * DELIBERATELY NON-INVASIVE: every function imported below
 * (loadM1ForPair, bucketM1IntoSessions, runAnalyser, createHtfContext,
 * createConfluenceFeatures, extractTouches, buildPolicy, runPerLine,
 * costForPair, assetClassFor, pipSize) is a PURE function per this
 * codebase's own brick contract (CLAUDE.md: "no hidden global/DOM/network
 * state, data passed in") — confirmed by grep, none of them import r2Store's
 * putJSON. This script reproduces `forecastAnalyserStore.refreshPair`'s exact
 * data pipeline MINUS its `putJSON` persistence call, so it cannot write to
 * R2, cannot touch the live Book/Drivers tabs' stored dataset, and does not
 * modify any existing file. Read-only in, console-log out.
 *
 * Staged per CLAUDE.md's "start with the minimal-DOF version" rule:
 *   1. `vwapSide` ALONE as the cell condition (isolates its own signal).
 *   2. `approachVel` ALONE, on the SAME records/instruments/split — the real
 *      benchmark to beat (not the doc's own historical number, which used a
 *      different sample window).
 *   3. `approachVel`+`vwapSide` COMBINED — does it help the existing edge?
 *
 * Pre-registered bar (same as the rest of this codebase's discipline): a
 * combined-condition cell must clear the SAME minN=50/splitFrac=0.6 gates
 * `buildPolicy`/`runPerLine` already use in production, hold on OOS with the
 * same sign as IS, and improve the book's HONEST portfolio OOS Sharpe/
 * expectancy over step 2's benchmark — not just "some cell looks good".
 *
 *   node scripts/run_vwapside_confluence_scope.mjs [pairs...]
 */

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions, runAnalyser } from '../js/forecastAnalyser.js';
import { createHtfContext, createConfluenceFeatures } from '../js/confluenceFeatures.js';
import { extractTouches, buildPolicy, runPerLine, costForPair, DEFAULT_SLIP_PCT } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { pipSize } from '../js/instrumentRegistry.js';

const argPairs = process.argv.slice(2).filter(a => !a.startsWith('-'));
const pairs = argPairs.length ? argPairs : ['eurusd', 'gold', 'nq'];   // same 3 as the confluence-features first round

function safePip(pair) { try { return pipSize(pair) || 0; } catch { return 0; } }

console.log(`Loading + building confluence-feature records for: ${pairs.join(', ')}\n`);

const touchesByPairVwap = {}, touchesByPairVel = {}, touchesByPairBoth = {};
const costByPair = {}, slipByPair = {};

for (const pair of pairs) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`${pair}: no M1 data — skipped`); continue; }
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const assetClass = assetClassFor(pair);
  const pip = safePip(pair);
  const tf = createConfluenceFeatures({ htf: createHtfContext(packed) });
  const records = runAnalyser(sessions, assetClass, { horizon: 'daily', pip, tf });
  console.log(`${pair}: ${packed.n} M1 bars -> ${sessions.size} sessions -> ${records.length} daily windows (${assetClass})`);

  // Sanity check (CLAUDE.md "assume code failure first" — verify the field is
  // actually populated before trusting anything downstream): count lines with
  // a real vwapSide / approachVel bucket vs 'na'/missing.
  let nLines = 0, nVwap = 0, nVel = 0;
  for (const w of records) for (const ln of w.lines || []) {
    if (ln.outcome !== 'reverted' && ln.outcome !== 'continued') continue;
    nLines++;
    if (ln.vwapSide != null) nVwap++;
    if (ln.approachVel != null) nVel++;
  }
  console.log(`  decided lines=${nLines}  vwapSide populated=${nVwap} (${nLines ? (100 * nVwap / nLines).toFixed(0) : 0}%)  approachVel populated=${nVel} (${nLines ? (100 * nVel / nLines).toFixed(0) : 0}%)`);

  touchesByPairVwap[pair] = extractTouches(records, { conditions: ['vwapSide'] });
  touchesByPairVel[pair]  = extractTouches(records, { conditions: ['approachVel'] });
  touchesByPairBoth[pair] = extractTouches(records, { conditions: ['approachVel', 'vwapSide'] });
  costByPair[pair] = costForPair(pair, assetClass);
  slipByPair[pair] = DEFAULT_SLIP_PCT[assetClass] ?? DEFAULT_SLIP_PCT.fx;
}

function report(label, touchesByPair) {
  const nTouches = Object.values(touchesByPair).reduce((s, a) => s + a.length, 0);
  console.log(`\n=== ${label} (${nTouches} total gated touches) ===`);
  if (!nTouches) { console.log('  (no touches survive this condition — na-guard dropped everything)'); return null; }
  const r = runPerLine(touchesByPair, { splitFrac: 0.6, minN: 50, costByPair, slipByPair });
  if (!r) { console.log('  runPerLine returned null'); return null; }
  console.log(`  split ${r.splitDate}  cells: fade=${r.coverage.fadeCells} follow=${r.coverage.followCells} skip=${r.coverage.skipCells}`);
  console.log(`  OOS book: nTrades=${r.nTrades}  portfolio Sharpe=${r.portfolio.sharpe}  CAGR=${r.portfolio.cagr}%  maxDD(closed)=${r.portfolio.volTarget?.maxDDClosed ?? r.portfolio.maxDD}%`);
  for (const [pair, p] of Object.entries(r.perPair)) {
    console.log(`    ${pair}: n=${p.trades}  expectancy=${p.expectancy}%  sharpe=${p.sharpe}  winRate=${p.winRate}%`);
  }
  return r;
}

report('STEP 1 — vwapSide ALONE', touchesByPairVwap);
report('STEP 2 — approachVel ALONE (the real benchmark)', touchesByPairVel);
report('STEP 3 — approachVel + vwapSide COMBINED', touchesByPairBoth);
