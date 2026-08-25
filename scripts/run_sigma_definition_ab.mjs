#!/usr/bin/env node
/**
 * σ-definition A/B (GOLD_VWAP_FIXED_SIGMA_FINDINGS.md §10) — the same touch
 * walk under three band units, each read against the random-walk control run
 * under the SAME unit:
 *
 *   fixedRms   — frozen prior-sessions RMS-from-VWAP (this study's unit)
 *   developing — the session's own developing volume-weighted σ (the classic
 *                self-widening VWAP band, computeSessionVwap's sd)
 *   forecast   — the platform's daily forecast σ (forecastSigma yz_30)
 *
 * The comparison metric is the gold-minus-control EXCESS on the race and
 * return outcomes per band (which coordinate carries the most real, least
 * mechanical information), plus each unit's band-tag ladder (what "kσ" even
 * means under each).
 *
 *   node scripts/run_sigma_definition_ab.mjs [--pair gold]
 */

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { fixedSigmaWalk } from '../js/vwapFixedSigmaEngine.js';
import { returnedWithin, returnEligible } from '../js/vwapFixedSigmaReport.js';
import { syntheticRandomWalkPacked } from '../js/syntheticWalk.js';

const args = process.argv.slice(2);
const pair = args.includes('--pair') ? args[args.indexOf('--pair') + 1] : 'gold';

const real = await loadM1ForPair(pair);
if (!real?.n) { console.error(`No M1 for ${pair}`); process.exit(1); }
const control = syntheticRandomWalkPacked({ seed: 7, days: 800 });

function stats(touches, daysWalked) {
  const firsts = touches.filter(t => t.ordinal === 1);
  const out = {};
  for (const k of [1, 2, 3, 4, 5]) {
    const g = firsts.filter(t => t.band === k);
    if (g.length < 20) continue;
    const days = new Set(g.map(t => t.date)).size;
    const el = g.filter(t => returnEligible(t));
    out[k] = {
      n: g.length,
      tagPct: daysWalked ? +(days / daysWalked * 100).toFixed(1) : null,
      outPct: +(g.filter(t => t.outcome === 'out').length / g.length * 100).toFixed(1),
      retPct: el.length >= 20 ? +(el.filter(t => returnedWithin(t)).length / el.length * 100).toFixed(1) : null,
    };
  }
  return out;
}

for (const mode of ['fixedRms', 'developing', 'forecast']) {
  const opts = { liteContext: true, sigmaMode: mode, minHistory: 10 };
  const t0 = Date.now();
  const g = fixedSigmaWalk(real, { ...opts, instrument: pair, assetClass: pair === 'gold' ? 'commodity' : 'fx' });
  const c = fixedSigmaWalk(control, { ...opts, instrument: 'TEST' });
  const gs = stats(g.touches, g.coverage.daysWalked);
  const cs = stats(c.touches, c.coverage.daysWalked);
  console.log(`\n── sigmaMode: ${mode}  (${pair} ${g.coverage.daysWalked} days / control ${c.coverage.daysWalked} days, ${((Date.now() - t0) / 1000).toFixed(0)}s) ──`);
  console.log('  band | tag% gold/ctl | race out% gold/ctl (excess) | return≤240 gold/ctl (excess)');
  for (const k of [1, 2, 3, 4, 5]) {
    const a = gs[k], b = cs[k];
    if (!a) continue;
    const exOut = b ? (a.outPct - b.outPct).toFixed(1) : '—';
    const exRet = (a.retPct != null && b?.retPct != null) ? (a.retPct - b.retPct).toFixed(1) : '—';
    console.log(`   ${k}σ  | ${String(a.tagPct).padStart(5)} / ${String(b?.tagPct ?? '—').padStart(5)} | ${String(a.outPct).padStart(5)} / ${String(b?.outPct ?? '—').padStart(5)}  (${exOut}) | ${String(a.retPct ?? '—').padStart(5)} / ${String(b?.retPct ?? '—').padStart(5)}  (${exRet})`);
  }
}
