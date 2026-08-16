// Synthetic tests for liquidityGateEngine.js. No network.
//   node js/liquidityGateEngine.test.mjs
import { toSeries, latestChangeZScore, cbLiquidityLeg, mergeFedLiquidity, fedNetLiquidityLeg, liquidityVixNote } from './liquidityGateEngine.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[toSeries — sorts, cleans]');
{
  const pts = [{ date: '2024-02-01', value: 101 }, { date: '2024-01-01', value: 100 }, { date: '2024-03-01', value: null }];
  const s = toSeries(pts);
  ok('sorted ascending, nulls dropped', s.length === 2 && s[0].date === '2024-01-01');
}

console.log('[latestChangeZScore — flags an unusual step vs steady baseline changes]');
{
  const series = [];
  for (let i = 0; i < 20; i++) series.push({ date: `d${String(i).padStart(2, '0')}`, value: 100 + i * 2 }); // steady +2/period
  series.push({ date: 'd20', value: series.at(-1).value + 40 }); // sudden +40 jump
  const z = latestChangeZScore(series);
  ok('z reads strongly positive for the outsized jump', z > 2, z);
}
{
  const flat = Array.from({ length: 10 }, (_, i) => ({ date: `d${i}`, value: 100 }));
  ok('too little history -> null, not a crash', latestChangeZScore(flat.slice(0, 3)) === null);
}

console.log('[cbLiquidityLeg — expanding balance sheet reads positive]');
{
  const pts = [];
  for (let i = 0; i < 19; i++) pts.push({ date: `d${String(i).padStart(2, '0')}`, value: 8000 + i * 1 }); // slow steady growth
  pts.push({ date: 'd19', value: pts.at(-1).value + 50 }); // sharp acceleration
  const r = cbLiquidityLeg(pts);
  ok('score positive (accelerating expansion)', r.score > 0, r.score);
  ok('latestValue reported', r.latestValue != null);
}
{
  const r = cbLiquidityLeg([{ date: 'd0', value: 100 }, { date: 'd1', value: 101 }]);
  ok('short history -> null score, not a crash', r.score === null);
}

console.log('[mergeFedLiquidity — forward-fills TGA/RRP onto WALCL dates, nets USD-only]');
{
  const walcl = [{ date: '2024-01-01', value: 8000 }, { date: '2024-01-08', value: 8010 }, { date: '2024-01-15', value: 8020 }];
  const tga = [{ date: '2024-01-01', value: 500 }, { date: '2024-01-10', value: 520 }];
  const rrp = [{ date: '2024-01-01', value: 300 }];
  const merged = mergeFedLiquidity(walcl, tga, rrp);
  ok('one merged point per WALCL date', merged.length === 3);
  ok('Jan-01 net = 8000-500-300', merged[0].value === 7200, merged[0].value);
  ok('Jan-08 still uses Jan-01 TGA (not yet updated, no future leak)', merged[1].value === 8010 - 500 - 300, merged[1].value);
  ok('Jan-15 uses the Jan-10 TGA update', merged[2].value === 8020 - 520 - 300, merged[2].value);
}

console.log('[fedNetLiquidityLeg — draining liquidity (rising TGA/RRP faster than WALCL) reads negative]');
{
  const walcl = [], tga = [], rrp = [];
  for (let i = 0; i < 19; i++) {
    walcl.push({ date: `d${String(i).padStart(2, '0')}`, value: 8000 });
    tga.push({ date: `d${String(i).padStart(2, '0')}`, value: 500 });
    rrp.push({ date: `d${String(i).padStart(2, '0')}`, value: 300 });
  }
  walcl.push({ date: 'd19', value: 8000 });
  tga.push({ date: 'd19', value: 700 }); // TGA jumps hard -> net liquidity drains
  rrp.push({ date: 'd19', value: 300 });
  const r = fedNetLiquidityLeg(walcl, tga, rrp);
  ok('score negative (liquidity draining)', r.score < 0, r.score);
}

console.log('[liquidityVixNote — confirming vs diverging reads]');
{
  ok('contracting liquidity + rising VIX = confirming', liquidityVixNote(-0.5, 22, 18).read === 'confirming');
  ok('contracting liquidity + falling VIX = diverging (liquidity draining but VIX not confirming it)', liquidityVixNote(-0.5, 15, 18).read === 'diverging');
  ok('expanding liquidity + falling VIX = confirming', liquidityVixNote(0.5, 14, 18).read === 'confirming');
  ok('missing inputs -> null, not a crash', liquidityVixNote(null, 15, 15) === null);
  ok('flat liquidity -> flat read, not forced into confirming/diverging', liquidityVixNote(0.05, 22, 18).read === 'flat');
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll liquidityGateEngine tests passed.');
