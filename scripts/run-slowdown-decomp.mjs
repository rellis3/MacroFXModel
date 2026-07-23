/**
 * Reproduces the numbers baked into price-slowdown-lab.html from the local M1
 * parquet cache. Run from the repo root:
 *
 *   node scripts/run-slowdown-decomp.mjs
 *
 * Prints the fade-back evidence (by approach velocity and range-budget) for
 * EURUSD/GBPUSD/AUDUSD and writes slowdown_payload.json (EURUSD, with example
 * day paths) — inject it into the page's /*__PAYLOAD__*​/ token to refresh the
 * visual. Needs `npm i hyparquet` and the portfolioBacktest/cache/*.parquet files.
 */
import { readM1Resampled } from '../js/volBacktestM1Engine.js';
import { decomposeSessions, fadeRateBy, fadeRateByQuantile, hitRateBy } from '../js/priceSlowdownDecomp.js';
import { writeFileSync } from 'node:fs';

const PAIRS = [
  ['eurusd', './portfolioBacktest/cache/eurusd_m1.parquet'],
  ['gbpusd', './portfolioBacktest/cache/gbpusd_m1.parquet'],
  ['audusd', './portfolioBacktest/cache/audusd_m1.parquet'],
];

const allRecords = {};
for (const [name, file] of PAIRS) {
  const t0 = Date.now();
  const bars = await readM1Resampled(file, 5);
  const keep = name === 'eurusd';   // keep intraday paths for the example pair only
  const { records, sessionsAnalysed } = decomposeSessions(bars, {
    assetClass: 'fx', tagBand: 'hl50', keepPathFor: keep, pathStride: 3,
  });
  allRecords[name] = records;
  const taggedN = records.filter(r => r.tagged && r.outcome).length;
  const fadeAll = records.filter(r => r.tagged && r.outcome === 'REVERSION').length / taggedN;

  console.log(`\n===== ${name.toUpperCase()} =====  ${sessionsAnalysed} sessions, ${taggedN} tagged HL50  (${((Date.now()-t0)/1000).toFixed(0)}s)`);
  console.log(`overall fade-back rate (closed back within OC-median of open): ${(fadeAll*100).toFixed(1)}%`);

  const tradeable = records.filter(r=>r.tagged&&r.retraceToOcMed).length/taggedN;
  const toOpen = records.filter(r=>r.tagged&&r.retraceToOpen).length/taggedN;
  console.log(`retraced to OC-median line (tradeable fade target): ${(tradeable*100).toFixed(1)}%   |  all the way to open: ${(toOpen*100).toFixed(1)}%`);

  console.log('\n  by APPROACH VELOCITY into the tag:  [closeVsOcMed fade | retrace→OCmed | retrace→open]');
  const byVel = fadeRateBy(records, r => r.velBucket);
  const byVelOc = hitRateBy(records, r=>r.velBucket, r=>r.retraceToOcMed);
  const byVelOpen = hitRateBy(records, r=>r.velBucket, r=>r.retraceToOpen);
  for (const k of ['1·grind','2·med','3·spike']) if (byVel[k]) console.log(`    ${k.padEnd(9)}  n=${String(byVel[k].n).padStart(4)}  close-fade=${(byVel[k].fadeBackRate*100).toFixed(1)}%  →OCmed=${(byVelOc[k].rate*100).toFixed(1)}%  →open=${(byVelOpen[k].rate*100).toFixed(1)}%`);

  console.log('\n  by RANGE-BUDGET consumed at the tag (quintiles, low→high):');
  const byBud = fadeRateByQuantile(records, 'budgetAtTag', 5);
  for (const k of Object.keys(byBud)) { const b = byBud[k]; console.log(`    ${k} budget∈[${b.range[0]},${b.range[1]}]  n=${String(b.n).padStart(4)}  fade-back=${b.fadeBackRate!=null?(b.fadeBackRate*100).toFixed(1)+'%':'—'}`); }

  console.log('\n  by APPROACH VELOCITY (continuous, quintiles low→high):');
  const byVelQ = fadeRateByQuantile(records, 'approachVel', 5);
  for (const k of Object.keys(byVelQ)) { const b = byVelQ[k]; console.log(`    ${k} vel∈[${b.range[0]},${b.range[1]}]σ  n=${String(b.n).padStart(4)}  fade-back=${b.fadeBackRate!=null?(b.fadeBackRate*100).toFixed(1)+'%':'—'}`); }
}

// ── Pick archetype example days from EURUSD (with paths) for the visual ───────
const eur = allRecords.eurusd.filter(r => r.tagged && r.path && r.path.length > 10);
const byBudgetHi = eur.filter(r => r.budgetAtTag != null).sort((a,b)=>b.rangeMax-a.rangeMax);

// clean fade: tagged HL, closed back near open (small |dispClose|), decent range
const fade = [...eur].filter(r => r.outcome==='REVERSION' && Math.abs(r.dispClose) < 0.3 && r.rangeMax > 2.0)
                     .sort((a,b)=>Math.abs(a.dispClose)-Math.abs(b.dispClose))[0];
// trend day: tagged then kept going, closed far from open
const trend = [...eur].filter(r => r.outcome==='CONTINUATION' && Math.abs(r.dispClose) > 1.6)
                      .sort((a,b)=>Math.abs(b.dispClose)-Math.abs(a.dispClose))[0];
// round-trip: huge range, tiny closing displacement (the extreme reach-out-and-back)
const roundtrip = [...eur].filter(r => r.rangeMax > 2.5 && Math.abs(r.dispClose) < 0.25)
                          .sort((a,b)=>b.rangeMax-a.rangeMax)[0];

const examples = { fade, trend, roundtrip };
for (const [k,r] of Object.entries(examples)) {
  console.log(`\nexample ${k}: ${r?.date}  rangeMax=${r?.rangeMax}σ dispClose=${r?.dispClose}σ vel=${r?.approachVel} (${r?.velBucket}) outcome=${r?.outcome}`);
}

// Build the aggregate payload for the visual (EURUSD, the deepest sample)
const R = allRecords.eurusd;
const payload = {
  pair: 'EURUSD', span: [R[0].date, R[R.length-1].date], sessions: R.length,
  taggedN: R.filter(r=>r.tagged&&r.outcome).length,
  overallFadeBack: +(R.filter(r=>r.tagged&&r.outcome==='REVERSION').length / R.filter(r=>r.tagged&&r.outcome).length).toFixed(4),
  overallToOcMed: +(R.filter(r=>r.tagged&&r.retraceToOcMed).length / R.filter(r=>r.tagged).length).toFixed(4),
  overallToOpen: +(R.filter(r=>r.tagged&&r.retraceToOpen).length / R.filter(r=>r.tagged).length).toFixed(4),
  byVel: fadeRateBy(R, r=>r.velBucket),
  byVelOcMed: hitRateBy(R, r=>r.velBucket, r=>r.retraceToOcMed),
  byVelOpen: hitRateBy(R, r=>r.velBucket, r=>r.retraceToOpen),
  byVelQ: fadeRateByQuantile(R, 'approachVel', 5),
  byVelQOcMed: (()=>{ // quintiles of velocity → P(retrace to OCmed)
    const t=R.filter(r=>r.tagged&&r.approachVel!=null).map(r=>r.approachVel).sort((a,b)=>a-b);
    const e=[]; for(let q=1;q<5;q++) e.push(t[Math.floor(q/5*t.length)]);
    const bin=v=>{let k=0;while(k<e.length&&v>e[k])k++;return k;};
    const o={}; for(let k=0;k<5;k++){const a=R.filter(r=>r.tagged&&r.approachVel!=null&&bin(r.approachVel)===k);o['q'+(k+1)]={n:a.length,rate:a.length?+(a.filter(r=>r.retraceToOcMed).length/a.length).toFixed(4):null};} return o;
  })(),
  byBudget: fadeRateByQuantile(R, 'budgetAtTag', 5),
  examples: Object.fromEntries(Object.entries(examples).map(([k,r])=>[k, r && {
    date:r.date, rangeMax:r.rangeMax, dispClose:r.dispClose, approachVel:r.approachVel, velBucket:r.velBucket,
    outcome:r.outcome, tagSide:r.tagSide, tagTimeFrac:r.tagTimeFrac, hl50:+(r.hl50/r.sigma).toFixed(3),
    hl75:+(r.hl75/r.sigma).toFixed(3), ocMed:+(r.ocMed/r.sigma).toFixed(3), path:r.path,
  }])),
};
writeFileSync('./slowdown_payload.json', JSON.stringify(payload));
console.log('\nwrote payload:', payload.sessions, 'sessions,', payload.taggedN, 'tagged');
