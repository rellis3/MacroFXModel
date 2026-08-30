#!/usr/bin/env node
/**
 * Run the VWAP Fixed-Sigma Band Atlas on gold's local M1 parquet and print the
 * reference book (playbook step 5: run the walk on REAL data and look at the
 * rows before deciding anything else).
 *
 *   node scripts/run_gold_vwap_sigma.mjs [--out DIR] [--all-touches]
 *
 * Writes: DIR/gold_vwap_sigma_touches.json (raw rows — the deliverable dataset)
 *         DIR/gold_vwap_sigma_book.json    (OOS-gated book, first touches)
 * Prints: coverage, per-band base rates, held findings.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { fixedSigmaWalk } from '../js/vwapFixedSigmaEngine.js';
import { buildFixedSigmaBook, extractHeldFindings, bandCoverage, renderBookText } from '../js/vwapFixedSigmaReport.js';

const args = process.argv.slice(2);
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'logs';
const firstTouchOnly = !args.includes('--all-touches');
const sigmaMode = args.includes('--sigma-mode') ? args[args.indexOf('--sigma-mode') + 1] : 'fixedRms';

console.log('Loading gold M1 parquet (R2 → local disk fallback)…');
const t0 = Date.now();
const packed = await loadM1ForPair('gold');
if (!packed?.n) { console.error('No gold M1 data available.'); process.exit(1); }
console.log(`  ${packed.n.toLocaleString()} bars, ${new Date(packed.times[0] * 1000).toISOString().slice(0, 10)} → ${new Date(packed.times[packed.n - 1] * 1000).toISOString().slice(0, 10)}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

console.log(`Walking fixed-sigma bands… (sigmaMode=${sigmaMode})`);
const t1 = Date.now();
const { touches, coverage } = fixedSigmaWalk(packed, { instrument: 'gold', assetClass: 'commodity', sigmaMode });
console.log(`  ${touches.length.toLocaleString()} touch records over ${coverage.daysWalked} sessions (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
console.log(`  coverage: ${coverage.from} → ${coverage.to} (${coverage.daysSkippedWarmup} warm-up sessions skipped)`);

const firsts = touches.filter(t => t.ordinal === 1);
const cov = bandCoverage(firsts, coverage.daysWalked);
console.log('\n── Band tag coverage (first touches, % of sessions that reach each band) ──');
for (const side of ['up', 'dn']) {
  const row = [1, 2, 3, 4, 5, 6, 7].map(k => {
    const c = cov[`${side}|${k}`];
    return `${side === 'up' ? '+' : '−'}${k}σ ${c ? String(c.pctOfDays).padStart(5) : '    0'}%`;
  }).join('  ');
  console.log('  ' + row);
}

const book = buildFixedSigmaBook(touches, { firstTouchOnly });
const held = extractHeldFindings(book);

console.log('\n' + renderBookText(book, cov));

console.log('\n── Held findings (same sign both halves, n≥30 both, |Δ|≥3pp both) ──');
if (!held.length) console.log('  (none cleared the gate)');
for (const h of held.slice(0, 30)) {
  console.log(`  ${h.cellKey.padEnd(6)} ${h.dimKey}=${h.bucket}  IS Δ${h.deltaOutIS > 0 ? '+' : ''}${h.deltaOutIS} (n=${h.n.is})  OOS Δ${h.deltaOutOOS > 0 ? '+' : ''}${h.deltaOutOOS} (n=${h.n.oos})`);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'gold_vwap_sigma_touches.json'), JSON.stringify({ coverage, touches }));
writeFileSync(path.join(outDir, 'gold_vwap_sigma_book.json'), JSON.stringify({ coverage, bandCoverage: cov, book, held }, null, 1));
console.log(`\nWrote ${path.join(outDir, 'gold_vwap_sigma_touches.json')} and _book.json`);
