#!/usr/bin/env node
/**
 * Multi-spread sleeve — pre-registered. Design frozen in
 * MD files/MULTI_SPREAD_SLEEVE.md before this ran.
 *
 *   node analysis/multi_spread_sleeve.mjs [sweep]      (needs FRED_KEY + OANDA/R2)
 *
 * No args: runs the full sleeve at the validated grid's mid-point (|z|=2.25, window
 * 126) — the Bar A headline numbers plus every Bar B diversification diagnostic
 * (z-correlation, trade overlap, equal-risk combined Sharpe) against the validated
 * y2 baseline.
 *
 * `sweep`: also runs the y10 robustness grid (|z| 2.0-2.75 × window 90/126/252) —
 * Bar A's "plateau, not a spike" check, mirroring js/yieldSpreadEngine.js's own
 * runYieldSpreadSweep for the validated sleeve.
 *
 * Output: console + analysis/output/multi_spread_sleeve.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMultiSpreadSleeve, runSpreadSweep, SPREAD_TYPES } from '../js/multiSpreadEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output'); fs.mkdirSync(OUT_DIR, { recursive: true });
const RUN_SWEEP = process.argv[2] === 'sweep';

const fmt = (x, dp = 2) => x == null || !Number.isFinite(x) ? 'n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(dp)}`;
const log = (...a) => console.log(...a);

async function main() {
  if (!process.env.FRED_KEY) {
    log('FRED_KEY not set — cannot run. This is the expected state off Railway; see');
    log('MD files/MULTI_SPREAD_SLEEVE.md §4/§5. Nothing below was fabricated.');
    process.exitCode = 1;
    return;
  }

  log('═══ Multi-Spread Sleeve — pre-registered run ═══');
  log(`Spread types: ${SPREAD_TYPES.join(', ')}\n`);

  const opts = { entryThreshold: 2.25, zWindow: 126 };
  const result = await runMultiSpreadSleeve(opts);

  log('── Bar A: does each spread type clear the validated sleeve\'s own audit? ──');
  for (const t of SPREAD_TYPES) {
    const b = result.books[t];
    const o = b.combined.oos;
    log(`\n${t}: ${b.combined.nTrades} trades total, ${o.n} OOS`);
    log(`  OOS: winRate ${o.winRate}%  PF ${o.profitFactor}  totalRet ${fmt(o.totalRetPct)}%  ` +
        `Sharpe(flat) ${o.sharpe}  Sharpe(portfolio,daily-MTM) ${b.combined.portfolioSharpe.oos}`);
    const years = Object.entries(b.combined.perYearOos);
    const yearsPos = years.filter(([, y]) => y.totalRetPct > 0).length;
    log(`  Years OOS positive: ${yearsPos}/${years.length}`);
    for (const l of b.log) if (l.error) log(`  ⚠ ${l.pair}: ${l.error}`);
  }

  log('\n── Bar B: diversification against the validated y2 baseline ──');
  for (const t of SPREAD_TYPES) {
    if (t === 'y2') continue;
    const ov = result.overlapVsBaseline[t];
    log(`\n${t} vs y2:`);
    log(`  Trade overlap (±2d, same pair, same dir): ${ov.overlapping}/${ov.n} = ${ov.overlapPct}%`);
    const zc = Object.entries(result.zCorrelationByPair).filter(([k]) => k.endsWith(`:y2_${t}`));
    for (const [k, v] of zc) log(`  z-correlation ${k}: ${v ?? 'n/a'}`);
  }

  log('\n── Combined portfolio (equal risk — each leg at half size vs y2 alone) ──');
  log(`  y2 alone Sharpe:  ${result.portfolio.legSharpe.y2}`);
  for (const t of SPREAD_TYPES) if (t !== 'y2') log(`  ${t} alone Sharpe: ${result.portfolio.legSharpe[t]}`);
  log(`  Return correlation: ${JSON.stringify(result.portfolio.returnCorrelation)}`);
  log(`  Combined Sharpe (equal risk): ${result.portfolio.combinedSharpe}`);
  const beatsBaseline = result.portfolio.combinedSharpe > result.portfolio.legSharpe.y2;
  log(`  → ${beatsBaseline ? 'combined beats y2 alone at equal risk — candidate for Bar B PASS' : 'combined does NOT beat y2 alone — Bar B falsifier'}`);

  const out = { ranAt: new Date().toISOString(), opts, result };

  if (RUN_SWEEP) {
    log('\n── y10 robustness sweep (Bar A: plateau or spike?) ──');
    const sweep = await runSpreadSweep('y10', {});
    for (const c of sweep.cells) {
      if (c.error) { log(`  z${c.entryThreshold}/w${c.zWindow}: ERROR ${c.error}`); continue; }
      log(`  |z|${c.entryThreshold} / win${c.zWindow}: n=${c.n} winRate=${c.winRate}% PF=${c.profitFactor} ` +
          `totalRet=${fmt(c.totalRetPct)}% yearsPos=${c.yearsPositive}/${c.yearsTotal}`);
    }
    out.sweep = sweep;
  }

  fs.writeFileSync(path.join(OUT_DIR, 'multi_spread_sleeve.json'), JSON.stringify(out, null, 1));
  log('\nwritten analysis/output/multi_spread_sleeve.json');
  log('\nNext: append these numbers to MD files/MULTI_SPREAD_SLEEVE.md §5 verbatim,');
  log('with a PASS/NULL verdict against Bar A and Bar B as pre-registered. Only add a');
  log('js/deskEvidence.js ledger entry once there is an actual verdict.');
}

main().catch(e => { console.error(e); process.exitCode = 1; });
