// Synthetic test for the OI forward-test tagging brick (no network).
//   node js/oiConfluence.test.mjs
import { parseOILevels, normOIType, nearRoundNumber, tagTradeOI, tradePctReturn, oiAudit, oiStoreToLevels, oiBias, oiDeltas, wallStrengthTier, oiSkew } from './oiConfluence.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[normOIType — free labels → slugs]');
ok('call wall variants', ['Call Wall', 'callwall', 'c-wall', 'CW'].every(s => normOIType(s) === 'call_wall'), JSON.stringify(['Call Wall','callwall','c-wall','CW'].map(normOIType)));
ok('put wall / max pain / gamma flip / hvl',
   normOIType('put wall') === 'put_wall' && normOIType('Max Pain') === 'max_pain' &&
   normOIType('gamma flip') === 'gamma_flip' && normOIType('HVL') === 'hvl');
ok('untyped → oi', normOIType('') === 'oi' && normOIType(null) === 'oi');

console.log('[parseOILevels — pasted lines]');
const parsed = parseOILevels(`
1.0850 call_wall
1.0820, max pain
1.0805  put wall
1.0900
# a comment

1,234.5 hvl
`);
ok('parses 5 levels, skips blanks/comments', parsed.length === 5, `n=${parsed.length}`);
ok('price + normalised type', parsed[0].price === 1.0850 && parsed[0].type === 'call_wall' && parsed[1].type === 'max_pain');
ok('untyped line → oi', parsed[3].price === 1.09 && parsed[3].type === 'oi');
ok('comma thousands parsed', parsed[4].price === 1234.5 && parsed[4].type === 'hvl');

console.log('[nearRoundNumber — big-figure / half / quarter grid]');
ok('1.1000 is round (big figure)', nearRoundNumber(1.10001, 0.0001, 10) === true);
ok('1.1050 is round (half)', nearRoundNumber(1.10502, 0.0001, 10) === true);
ok('1.1037 is NOT round', nearRoundNumber(1.1037, 0.0001, 10) === false);

console.log('[tagTradeOI — proximity within tol]');
const oi = [{ price: 1.0850, type: 'call_wall' }, { price: 1.0805, type: 'put_wall' }];
const hit = tagTradeOI(1.08455, oi, { pip: 0.0001, tolPips: 10 });   // 5.5 pips from call_wall
ok('near call_wall → hit', hit.hit && hit.types.includes('call_wall') && hit.distPips <= 10, JSON.stringify(hit));
const miss = tagTradeOI(1.0700, oi, { pip: 0.0001, tolPips: 10 });
ok('far from all → no hit, reports nearest', !miss.hit && miss.nearest === 1.0805 && miss.distPips > 10, JSON.stringify(miss));
ok('empty OI → no hit', tagTradeOI(1.08, [], { pip: 0.0001 }).hit === false);

console.log('[tradePctReturn — size-independent, direction-signed]');
ok('long win', Math.abs(tradePctReturn({ direction: 'BUY', open_price: 100, close_price: 101 }) - 1) < 1e-9);
ok('short win', Math.abs(tradePctReturn({ direction: 'SELL', open_price: 100, close_price: 99 }) - 1) < 1e-9);
ok('unresolved (no close) → null', tradePctReturn({ direction: 'BUY', open_price: 100, close_price: null }) === null);

console.log('[oiAudit — tagged vs untagged, per type, round-independence]');
// Two days. eurusd pip 1e-4. Day1 OI has call_wall 1.0850; Day2 OI has max_pain 1.2000 (a round number).
const oiByDate = {
  '2026-07-08': { eurusd: [{ price: 1.0837, type: 'call_wall' }] },   // 1.0837 is NOT a round grid level
  '2026-07-09': { eurusd: [{ price: 1.2000, type: 'max_pain' }] },
};
const log = [
  // Day1: entry AT the call_wall 1.0837 → tagged, winner. Not a round number.
  { date: '2026-07-08', symbol: 'EURUSD', direction: 'SELL', open_price: 1.0837, close_price: 1.0729 },
  // Day1: entry far from OI → untagged, loser (−0.5%).
  { date: '2026-07-08', symbol: 'EURUSD', direction: 'BUY', open_price: 1.0700, close_price: 1.06465 },
  // Day2: entry AT max_pain 1.2000 (a round number) → tagged + atRound, winner.
  { date: '2026-07-09', symbol: 'EURUSD', direction: 'SELL', open_price: 1.2000, close_price: 1.1880 },
  // A trade on a day with NO OI captured → excluded from tagged/untagged.
  { date: '2026-07-10', symbol: 'EURUSD', direction: 'BUY', open_price: 1.1000, close_price: 1.1050 },
  // Unresolved (still open) → skipped.
  { date: '2026-07-08', symbol: 'EURUSD', direction: 'BUY', open_price: 1.09, close_price: null },
];
const a = oiAudit(log, oiByDate, { pipFor: () => 0.0001, tolPips: 10, roundTolPips: 10 });
ok('tagged n=2 (both OI-aligned entries)', a.tagged.n === 2, `n=${a.tagged.n}`);
ok('untagged n=1 (OI day, entry not near)', a.untagged.n === 1, `n=${a.untagged.n}`);
ok('no-OI day excluded, unresolved skipped', a.coverage.tradesNoOIDay === 1 && a.coverage.unresolved === 1, JSON.stringify(a.coverage));
ok('tagged beats untagged (edge > 0)', a.edge > 0, `edge=${a.edge} tagged=${a.tagged.avgRet} untagged=${a.untagged.avgRet}`);
ok('per-type breakdown present', a.byType.call_wall?.n === 1 && a.byType.max_pain?.n === 1, JSON.stringify(Object.keys(a.byType)));
ok('round-independence split: 1 at round, 1 not', a.taggedAtRound.n === 1 && a.taggedNotRound.n === 1,
   `atRound=${a.taggedAtRound.n} notRound=${a.taggedNotRound.n}`);
// OI-direction scoring: trade 1 is a SELL at a call_wall (OI says sell) → agree, won.
// Trade 3 sits exactly AT max pain → the pin has no directional bias → not scored.
ok('OI-direction agreement scored (call-wall sell agrees; at-pin not scored)',
   a.oiDirAgree.n === 1 && a.oiDirDisagree.n === 0 && a.oiDirAgree.avgRet > 0,
   `agree=${a.oiDirAgree.n}@${a.oiDirAgree.avgRet} disagree=${a.oiDirDisagree.n}`);

console.log('[oiStoreToLevels — reuse index.html OI analyser output]');
{
  const inst = {
    maxPain: 1.0800,
    callWall: 1.0850, putWall: 1.0750,
    callWalls: [{ strike: 1.0850, oi: 9000 }, { strike: 1.0900, oi: 7000 }, { strike: 1.0950, oi: 5000 }],
    putWalls: [{ strike: 1.0750, oi: 8000 }, { strike: 1.0700, oi: 6000 }],
    // netGex flips sign between 1.0800 (+) and 1.0820 (−) → flip = the smaller-|netGex| strike (1.0820)
    gexProfile: [
      { strike: 1.0780, netGex: 500, gamma: 0.10 },
      { strike: 1.0800, netGex: 300, gamma: 0.40 },   // highest gamma → HVL
      { strike: 1.0820, netGex: -200, gamma: 0.20 },
      { strike: 1.0840, netGex: -600, gamma: 0.15 },
    ],
  };
  const lv = oiStoreToLevels(inst, { topWalls: 2 });
  const byType = t => lv.filter(x => x.type === t).map(x => x.price).sort((a, b) => a - b);
  ok('max pain extracted', byType('max_pain').includes(1.08));
  ok('call walls: headline + top-2 ranked, deduped', JSON.stringify(byType('call_wall')) === JSON.stringify([1.085, 1.09]), JSON.stringify(byType('call_wall')));
  ok('put walls extracted', JSON.stringify(byType('put_wall')) === JSON.stringify([1.07, 1.075]), JSON.stringify(byType('put_wall')));
  ok('gamma flip = smaller-|netGex| side of the sign change (1.0820)', byType('gamma_flip')[0] === 1.082, JSON.stringify(byType('gamma_flip')));
  ok('HVL = highest-|gamma| strike (1.0800)', byType('hvl')[0] === 1.08, JSON.stringify(byType('hvl')));
  ok('empty / junk → []', oiStoreToLevels(null).length === 0 && oiStoreToLevels({}).length === 0);
}

console.log('[oiBias — OI-implied buy/sell at the level]');
{
  const pip = 0.0001;
  // At a call wall → resistance → sell.
  const b1 = oiBias(1.0850, [{ price: 1.0850, type: 'call_wall' }], { pip, tolPips: 10 });
  ok('call wall → sell', b1.dir === 'sell' && b1.reasons.some(r => r.includes('call_wall')), JSON.stringify(b1));
  // At a put wall → support → buy.
  const b2 = oiBias(1.0800, [{ price: 1.0800, type: 'put_wall' }], { pip, tolPips: 10 });
  ok('put wall → buy', b2.dir === 'buy', JSON.stringify(b2));
  // Level above max pain → pulled down → sell; below → buy.
  ok('above max pain → sell', oiBias(1.0900, [{ price: 1.0800, type: 'max_pain' }], { pip, tolPips: 10 }).dir === 'sell');
  ok('below max pain → buy', oiBias(1.0700, [{ price: 1.0800, type: 'max_pain' }], { pip, tolPips: 10 }).dir === 'buy');
  // Gamma flip sets regime, not direction.
  const b3 = oiBias(1.0850, [{ price: 1.0820, type: 'gamma_flip' }, { price: 1.0850, type: 'call_wall' }], { pip, tolPips: 10 });
  ok('above gamma flip → meanrevert regime', b3.regime === 'meanrevert' && b3.dir === 'sell', JSON.stringify(b3));
  ok('below gamma flip → trend regime', oiBias(1.0800, [{ price: 1.0820, type: 'gamma_flip' }], { pip, tolPips: 10 }).regime === 'trend');
  // Conflict: call wall (sell) at the level but far below max pain (buy) → flagged.
  const b4 = oiBias(1.0850, [{ price: 1.0850, type: 'call_wall' }, { price: 1.0950, type: 'max_pain' }], { pip, tolPips: 10 });
  ok('opposing reads flagged as conflict', b4.conflict === true, JSON.stringify(b4));
  ok('empty / far → no direction', oiBias(1.05, [{ price: 1.09, type: 'call_wall' }], { pip, tolPips: 10 }).dir === null);
}

console.log('[oiDeltas — day-over-day OI dynamics]');
{
  const prev = { maxPain: 4200, callWall: 4300, putWall: 4100, pcRatio: 1.00,
    totalCallOI: 40000, totalPutOI: 40000,
    callWalls: [{ strike: 4300, oi: 8000 }, { strike: 4250, oi: 5000 }],
    putWalls: [{ strike: 4100, oi: 5000 }, { strike: 4050, oi: 3000 }] };
  const cur = { maxPain: 4100, callWall: 4300, putWall: 4100, pcRatio: 1.05,
    totalCallOI: 42000, totalPutOI: 45000,
    callWalls: [{ strike: 4300, oi: 9000 }, { strike: 4200, oi: 6000 }],   // 4300 firming, 4250 faded, 4200 new
    putWalls: [{ strike: 4100, oi: 4500 }, { strike: 4050, oi: 3500 }] };  // 4100 weakening
  const dl = oiDeltas(cur, prev);
  ok('max pain shifted down 100', dl.maxPainShift === -100, `${dl.maxPainShift}`);
  ok('P/C ratio +0.05', dl.pcRatioChange === 0.05, `${dl.pcRatioChange}`);
  ok('total OI building (+7000, new money)', dl.totalOIChange === 7000 && dl.flow === 'building', `${dl.totalOIChange}/${dl.flow}`);
  ok('call wall 4300 strengthening (+1000)', dl.callWalls.strengthening.some(w => w.strike === 4300 && w.delta === 1000));
  ok('call wall 4200 appeared / 4250 faded', dl.callWalls.appeared.some(w => w.strike === 4200) && dl.callWalls.faded.some(w => w.strike === 4250));
  ok('put wall 4100 weakening (−500)', dl.putWalls.weakening.some(w => w.strike === 4100 && w.delta === -500));
  ok('null on missing prior (first day)', oiDeltas(cur, null) === null);
}

console.log('[wallStrengthTier — the 3× rule]');
ok('3×+ neighbours → strong', wallStrengthTier(9000, [3000, 2500, 2800]).tier === 'strong');
ok('2× → moderate', wallStrengthTier(5600, [2800, 2800]).tier === 'moderate');
ok('1.5× → weak', wallStrengthTier(4200, [2800, 2800]).tier === 'weak');
ok('~1× → null tier (no edge)', wallStrengthTier(2900, [2800, 2800]).tier === null);
ok('multiple reported', wallStrengthTier(9000, [3000]).multiple === 3);
ok('isolated wall (no neighbours>0) → strong', wallStrengthTier(5000, [0, 0]).tier === 'strong');

console.log('[oiSkew — where the positioning sits]');
{
  // Heavy puts below spot 1.10, light calls above → downside-hedged (negative).
  const sk = oiSkew([1.08, 1.09, 1.11, 1.12], [100, 100, 200, 150], [4000, 3000, 100, 100], 1.10);
  ok('downside-hedged → negative score', sk.score < -0.2 && sk.read === 'downside-hedged', JSON.stringify(sk));
  // Heavy calls above → upside-tilted.
  const sk2 = oiSkew([1.08, 1.09, 1.11, 1.12], [100, 100, 4000, 3000], [150, 100, 100, 100], 1.10);
  ok('upside-tilted → positive score', sk2.score > 0.2 && sk2.read === 'upside-tilted', JSON.stringify(sk2));
  ok('null without spot', oiSkew([1, 2], [1, 1], [1, 1], 0) === null);
}

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
