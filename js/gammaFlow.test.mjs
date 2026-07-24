// Synthetic tests for the gamma-flow context bricks. No network.
//   node js/gammaFlow.test.mjs
import { gammaFlip, distanceToFlip, flipDrift, rolloffSummary } from './gammaFlow.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) fails++; };

console.log('[gammaFlip — zero-GEX crossing]');
{
  // netGex goes +,+,−,− → flips between strike 4200 (+) and 4250 (−). 4250 has the
  // smaller |netGex| (1) so it's the flip level.
  const gp = [{strike:4100,netGex:5},{strike:4200,netGex:3},{strike:4250,netGex:-1},{strike:4300,netGex:-4}];
  ok('picks the crossing strike nearer zero', gammaFlip(gp) === 4250, `${gammaFlip(gp)}`);
  ok('all-positive profile → null (no flip)', gammaFlip([{strike:1,netGex:2},{strike:2,netGex:1}]) === null);
  ok('empty/garbage → null', gammaFlip([]) === null && gammaFlip(null) === null);
}

console.log('[distanceToFlip — vol read]');
{
  const d = distanceToFlip(4260, 4200, { atr: 40 });
  ok('spot above flip → positive-gamma side', d.side === 'positive', d.side);
  ok('% of spot correct', Math.abs(d.pct - (60/4260*100)) < 1e-3, `${d.pct}`);
  ok('ATR-normalised (60/40 = 1.5)', d.atr === 1.5, `${d.atr}`);
  ok('deep (>0.5 ATR) not near', d.zone === 'deep-positive' && d.near === false, d.zone);
  const n = distanceToFlip(4210, 4200, { atr: 40 });   // 10/40 = 0.25 ATR
  ok('within 0.5 ATR → near-flip', n.near === true && n.zone === 'near-flip', JSON.stringify(n));
  const below = distanceToFlip(4180, 4200);
  ok('spot below flip → negative-gamma side', below.side === 'negative', below.side);
  ok('no ATR → atr null, % used', below.atr === null && below.near === false, JSON.stringify(below));
  ok('bad inputs → null', distanceToFlip(0, 4200) === null && distanceToFlip(4200, NaN) === null);
}

console.log('[flipDrift — migrating toward spot?]');
{
  // gap was 80 (4280 vs 4200), now 30 (4260 vs 4230) → closing → regime change loading.
  const s = [{date:'d1',spot:4280,flip:4200},{date:'d2',spot:4260,flip:4230}];
  const dr = flipDrift(s);
  ok('flip rose toward spot', dr.deltaFlip === 30 && dr.closing === true && dr.toward === true, JSON.stringify(dr));
  ok('carries dates', dr.fromDate === 'd1' && dr.toDate === 'd2');
  // gap widening → not closing.
  ok('widening gap → not toward', flipDrift([{spot:4260,flip:4230},{spot:4300,flip:4200}]).closing === false);
  ok('<2 points → null', flipDrift([{spot:4260,flip:4230}]) === null);
}

console.log('[rolloffSummary — OpEx roll-off]');
{
  const ts = [
    {dte:1, maxPain:4200, callWall:4300, putWall:4100, totalOI:8000},
    {dte:8, maxPain:4250, callWall:4400, putWall:4150, totalOI:12000},
  ];
  const r = rolloffSummary(ts, { rollDTE: 2 });
  ok('nearest expiry surfaced', r.nearDTE === 1 && r.nearMaxPain === 4200, JSON.stringify(r));
  ok('near share = 8000/20000', r.nearShare === 0.4, `${r.nearShare}`);
  ok('rolling soon (dte ≤ 2)', r.rollingSoon === true);
  ok('pin shift to next expiry (+50)', r.pinShift === 50, `${r.pinShift}`);
  ok('not rolling when near dte is far', rolloffSummary([{dte:10,maxPain:1,totalOI:5}], {rollDTE:2}).rollingSoon === false);
  ok('empty → null', rolloffSummary([]) === null && rolloffSummary(null) === null);
}

console.log(`\n${fails === 0 ? 'ALL PASSED ✓' : fails + ' FAILED ✗'}`);
process.exit(fails === 0 ? 0 : 1);
