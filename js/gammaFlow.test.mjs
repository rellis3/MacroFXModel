// Synthetic tests for the gamma-flow context bricks. No network.
//   node js/gammaFlow.test.mjs
import { gammaFlip, distanceToFlip, flipDrift, rolloffSummary } from './gammaFlow.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) fails++; };

console.log('[gammaFlip — zero-GEX crossing]');
{
  // netGex +,+,−,− flips between 4200 (+3) and 4250 (−1). The true zero is 3/(3+1) =
  // 75% of the way across, i.e. 4237.5. It used to SNAP to 4250 (nearer-zero side),
  // quantising every flip to the strike grid — $25 on gold, 50 pips on EUR/USD.
  const gp = [{strike:4100,netGex:5},{strike:4200,netGex:3},{strike:4250,netGex:-1},{strike:4300,netGex:-4}];
  ok('interpolates to the true zero, not the nearest strike', gammaFlip(gp) === 4237.5, `${gammaFlip(gp)}`);
  ok('all-positive profile → null (no flip)', gammaFlip([{strike:1,netGex:2},{strike:2,netGex:1}]) === null);
  ok('empty/garbage → null', gammaFlip([]) === null && gammaFlip(null) === null);

  // THE BUG THIS FIXES. Deep in the tails net GEX is noise flickering either side of
  // zero. The old scan returned the FIRST sign change walking up from the lowest
  // strike, so it latched onto that noise and never reached the money — on real gold
  // it returned 3,655 against another desk's 4,118, and gave charm and vanna the
  // identical 3,200 (two different exposure curves cannot share a zero).
  const noisy = [
    {strike:3000,netGex: 1},{strike:3050,netGex:-1},   // tail noise, ±1
    {strike:3100,netGex: 2},                            // …flips again
    {strike:4200,netGex: 900},{strike:4250,netGex:-900} // the real boundary, near spot
  ];
  ok('tail noise no longer wins over the real boundary',
    Math.abs(gammaFlip(noisy, 4225) - 4225) < 1, `${gammaFlip(noisy, 4225)}`);
  ok('without a spot, the largest-magnitude swing wins',
    Math.abs(gammaFlip(noisy) - 4225) < 1, `${gammaFlip(noisy)}`);
  ok('old first-from-bottom answer (~3025) is NOT returned', gammaFlip(noisy, 4225) > 4000);
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
