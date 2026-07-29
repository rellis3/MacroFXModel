// Synthetic test for the OI forward-test tagging brick (no network).
//   node js/oiConfluence.test.mjs
import { parseOILevels, normOIType, nearRoundNumber, tagTradeOI, tradePctReturn, oiAudit, oiStoreToLevels, oiBias, oiDeltas, wallStrengthTier, oiSkew, classifyOIChange, oiConcentration, clusterStrikes, oiWallStability, wallFreshness, volumePCRatio, oiPriceConfirmation } from './oiConfluence.js';

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
  // Flip is now INTERPOLATED to the true zero rather than snapped to the nearer-zero
  // strike, and this brick no longer keeps a private copy of the scan — it uses the
  // stored value or the shared `gammaFlip` brick. 1.0812 is the actual crossing.
  ok('gamma flip interpolated to the true zero, not snapped to a strike',
    Math.abs(byType('gamma_flip')[0] - 1.0812) < 1e-6, JSON.stringify(byType('gamma_flip')));
  ok('HVL = highest-|gamma| strike (1.0800)', byType('hvl')[0] === 1.08, JSON.stringify(byType('hvl')));
  ok('empty / junk → []', oiStoreToLevels(null).length === 0 && oiStoreToLevels({}).length === 0);
  // Wall strength tier ships with the level so the bots can weight/gate by it.
  const tiered = oiStoreToLevels({ callWall: 1.0850, callWalls: [{ strike: 1.0850, oi: 9000, tier: 'strong' }], putWall: 1.0800, putWalls: [{ strike: 1.0800, oi: 3000, tier: 'weak' }] });
  ok('call wall ships tier=strong', tiered.find(l => l.type === 'call_wall' && l.price === 1.0850)?.tier === 'strong', JSON.stringify(tiered));
  ok('put wall ships tier=weak', tiered.find(l => l.type === 'put_wall' && l.price === 1.0800)?.tier === 'weak');
  // Volume magnets emit as oi_volume (so the forward test scores them too).
  const withVol = oiStoreToLevels({ maxPain: 1.08, volumeMagnets: [{ strike: 1.0912, volume: 1242 }, { strike: 1.0888, volume: 900 }] }, { topWalls: 2 });
  ok('volume magnets → oi_volume levels', withVol.filter(l => l.type === 'oi_volume').map(l => l.price).sort().join() === '1.0888,1.0912', JSON.stringify(withVol.filter(l => l.type === 'oi_volume')));
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
  // Hold-vs-break: call wall at 1.0837; a level at 1.0840 within tol. px broke above
  // by >20 pips → squeeze → buy (vs the hold read of sell). Parity with Python.
  const hold = oiBias(1.0840, [{ price: 1.0837, type: 'call_wall' }], { pip, tolPips: 10 });
  const brk = oiBias(1.0840, [{ price: 1.0837, type: 'call_wall' }], { pip, tolPips: 10, px: 1.0870, breakPips: 20 });
  ok('hold read = sell (fade the wall)', hold.dir === 'sell');
  ok('broken wall (px far above) → buy (squeeze)', brk.dir === 'buy' && brk.regime === 'trend', JSON.stringify(brk));
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

console.log('[classifyOIChange — fresh wall / fresh positioning / liquidation]');
{
  const prev = { totalCallOI: 40000, totalPutOI: 40000,
    callWalls: [{ strike: 4300, oi: 8000 }, { strike: 4250, oi: 5000 }],
    putWalls: [{ strike: 4100, oi: 5000 }] };
  const cur = { totalCallOI: 48000, totalPutOI: 40000,
    callWalls: [{ strike: 4300, oi: 12000 }, { strike: 4200, oi: 6000 }],   // 4300 +50% build, 4200 fresh, 4250 faded
    putWalls: [{ strike: 4100, oi: 2500 }] };                                // 4100 -50% liquidation
  const cl = classifyOIChange(oiDeltas(cur, prev), { freshPct: 40 });
  const has = (t, s) => cl.events.some(e => e.type === t && e.strike === s);
  ok('4200 tagged fresh_wall', has('fresh_wall', 4200));
  ok('4300 tagged fresh_positioning (+50%)', has('fresh_positioning', 4300));
  ok('4100 + 4250 tagged liquidation', has('liquidation', 4100) && has('liquidation', 4250));
  ok('summary reads fresh positioning', /fresh/.test(cl.summary), cl.summary);
}

console.log('[oiConcentration — top-N % of total OI]');
{
  const c = oiConcentration([5000, 4000, 3000, 2000, 1000, 500, 500], null);   // top5=15000/16000
  ok('concentrated when top5 ≥ 50%', c.top5Pct >= 50 && c.read === 'concentrated', JSON.stringify(c));
  const c2 = oiConcentration([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
  ok('dispersed when spread out', c2.read === 'dispersed', JSON.stringify(c2));
  ok('null on empty', oiConcentration([]) === null);
}

console.log('[clusterStrikes — nearby strikes → one institutional zone]');
{
  // 4290/4300/4310 cluster (gap ≤ 15) → one zone; 4400 separate.
  const cz = clusterStrikes([{ strike: 4300, oi: 8000, kind: 'call' }, { strike: 4310, oi: 3000, kind: 'call' }, { strike: 4290, oi: 2000, kind: 'call' }, { strike: 4400, oi: 9000, kind: 'call' }], 15);
  ok('two clusters formed', cz.length === 2, `${cz.length}`);
  const big = cz.find(z => z.count === 3);
  ok('the 3-strike cluster totals 13000', big && big.totalOI === 13000, JSON.stringify(big));
  ok('cluster spans 4290–4310, OI-weighted centre inside', big.low === 4290 && big.high === 4310 && big.center >= 4290 && big.center <= 4310);
  ok('sorted by totalOI (biggest first)', cz[0].totalOI >= cz[1].totalOI);
}

console.log('[oiWallStability — days a current wall has persisted]');
{
  const days = [
    { date: 'd1', callWalls: [{ strike: 4300, oi: 8000 }], putWalls: [] },
    { date: 'd2', callWalls: [{ strike: 4302, oi: 8500 }], putWalls: [] },   // within tol of 4300 → persists
    { date: 'd3', callWalls: [{ strike: 4300, oi: 9000 }, { strike: 4500, oi: 12000 }], putWalls: [] },  // 4500 fresh today
  ];
  const st = oiWallStability(days, 5);
  const w300 = st.find(w => w.strike === 4300), w500 = st.find(w => w.strike === 4500);
  ok('4300 established 3 days', w300.daysPresent === 3 && w300.established === false, JSON.stringify(w300));
  ok('4500 is fresh (1 day)', w500.daysPresent === 1 && w500.fresh === true);
}

console.log('[wallFreshness — volume vs resting OI]');
{
  ok('volume ≥ OI → fresh', wallFreshness(1000, 1200).tag === 'fresh' && wallFreshness(1000, 1200).ratio === 1.2);
  ok('~half OI → active', wallFreshness(1000, 500).tag === 'active');
  ok('little volume → stale', wallFreshness(1000, 100).tag === 'stale');
  ok('no OI → null', wallFreshness(0, 500) === null);
}
console.log('[volumePCRatio — today flow]');
{
  ok('put-heavy flow → ratio > 1', volumePCRatio(1000, 2500) === 2.5);
  ok('call-heavy → < 1', volumePCRatio(2000, 800) === 0.4);
  ok('no call volume → null', volumePCRatio(0, 500) === null);
}

console.log('[oiPriceConfirmation — move backed by fresh positioning?]');
{
  ok('up + building OI → new longs, confirmed', (() => { const r = oiPriceConfirmation(500, 3); return r.read === 'new longs' && r.trust === 'confirmed'; })());
  ok('up + falling OI → short covering, weak', (() => { const r = oiPriceConfirmation(-500, 3); return r.read === 'short covering' && r.trust === 'weak'; })());
  ok('down + building OI → new shorts, confirmed', oiPriceConfirmation(500, -3).read === 'new shorts');
  ok('down + falling OI → long liquidation, weak', oiPriceConfirmation(-500, -3).trust === 'weak');
  ok('flat OI or flat price → null', oiPriceConfirmation(0, 3) === null && oiPriceConfirmation(500, 0) === null);
}


console.log('[oiDeltas - basis drift must not fake wall turnover (regression, 2026-07-29)]');
{
  // Archived strikes are SPOT-converted (strike - basis). The basis moves overnight, so the
  // SAME CME strike is stored under a different number each day. Exact-float matching therefore
  // matched nothing: strengthening/weakening were permanently empty, every wall read as
  // `appeared`, and the daily brief was told "fresh positioning building" for 9 of 11 unrelated
  // instruments on the same day. Real observed shape: EUR/USD 1.157605 -> 1.158050 (4.45 pips).
  const mk = (base, ois, mp) => ({
    spot: 1.14, maxPain: mp ?? base + 0.005, totalCallOI: 1000, totalPutOI: 1000,
    callWalls: ois.map((o, i) => ({ strike: +(base + i * 0.0025).toFixed(6), oi: o })), putWalls: [] });

  const real = oiDeltas(mk(1.140445, [110, 200, 270, 400], 1.145445), mk(1.14, [100, 200, 300, 400], 1.145));
  ok('4.45-pip basis drift is detected, not treated as turnover', Math.abs(real.basisDrift - 0.000445) < 1e-9, String(real.basisDrift));
  ok('all 4 walls match across the drift', real.matchedWalls === 4, String(real.matchedWalls));
  ok('NO phantom appeared/faded walls', real.callWalls.appeared.length === 0 && real.callWalls.faded.length === 0);
  ok('real OI moves survive: 1 firming, 1 fading', real.callWalls.strengthening.length === 1 && real.callWalls.weakening.length === 1);
  ok('max pain that did NOT move nets to 0', real.maxPainShiftNet === 0, String(real.maxPainShiftNet));
  ok('raw shift still exposes the uncorrected number', Math.abs(real.maxPainShift - 0.000445) < 1e-9);

  // Drift is recoverable while it stays well under HALF the strike spacing. These are inside
  // that band (25-pip ladder). Real observed drifts are 0.02-0.3% of price against 0.2-1.2%
  // spacing, so they land here.
  for (const pips of [1, 5, 10, 13]) {
    const off = pips / 10000;
    const D = oiDeltas(mk(+(1.14 + off).toFixed(6), [110, 200, 270, 400], +(1.145 + off).toFixed(6)), mk(1.14, [100, 200, 300, 400], 1.145));
    ok(`drift ${pips}p (spacing 25p) matches all 4`, D.matchedWalls === 4, String(D.matchedWalls));
    ok(`drift ${pips}p measured correctly`, Math.abs(D.basisDrift - off) < 1e-9, String(D.basisDrift));
    ok(`drift ${pips}p -> max pain net 0`, Math.abs(D.maxPainShiftNet) < 1e-9, String(D.maxPainShiftNet));
  }

  // BEYOND half the spacing the shift is genuinely UNIDENTIFIABLE from strikes alone -
  // (drift - spacing) aligns the ladder equally well. The contract is therefore NOT "we
  // recover it" (an earlier version of this test wrongly asserted 26p and 40p worked; at 26p
  // it silently selects the 1-pip alias). The contract is that we FLAG it instead of
  // presenting a guess as fact.
  // What IS guaranteed past the bound: it FAILS SAFE toward "no drift" rather than inventing a
  // large bogus shift (the gold -99.365 failure mode), and the mis-alignment stays VISIBLE as
  // incomplete matching, so it cannot masquerade as a clean full-ladder read. At 40p a rival
  // offset also survives and `driftAmbiguous` fires; at 26p the cap has already removed the
  // true offset, leaving only the small alias - so incomplete matching is the only tell, and
  // that is asserted rather than glossed.
  for (const pips of [26, 40]) {
    const off = pips / 10000;
    const D = oiDeltas(mk(+(1.14 + off).toFixed(6), [110, 200, 270, 400], +(1.145 + off).toFixed(6)), mk(1.14, [100, 200, 300, 400], 1.145));
    ok(`drift ${pips}p (> half spacing): no large bogus drift claimed`, Math.abs(D.basisDrift ?? 0) <= 0.00225, String(D.basisDrift));
    ok(`drift ${pips}p (> half spacing): mis-alignment stays visible (matched < 4)`, D.matchedWalls < 4, String(D.matchedWalls));
  }
  ok('a rival offset within one match sets driftAmbiguous',
     oiDeltas(mk(1.144, [110, 200, 270, 400], 1.149), mk(1.14, [100, 200, 300, 400], 1.145)).driftAmbiguous === true);

  // THE GOLD ALIAS - the case that actually bit in production (2026-07-29). True drift was
  // +0.635 on a ladder with 50 and 100-point gaps; the -99.365 alias (one 100-point step
  // away) scored MORE matches purely from which walls sat in each day's top-8, won, and
  // mis-paired every wall. The 0.9x-spacing / 0.5%-of-price cap now excludes it: -99.365 is
  // 2.5% of a ~4000 price, physically impossible for an overnight basis move.
  {
    const gold = (off) => ({ spot: 4040 + off, maxPain: 4201.745 + off, totalCallOI: 5000, totalPutOI: 5000,
      callWalls: [4401.745, 4501.745, 4701.745, 4801.745].map((k, i) => ({ strike: k + off, oi: 900 - i * 10 })),
      putWalls: [3501.745, 3601.745, 3701.745, 3801.745, 3851.745, 3901.745, 4001.745].map((k, i) => ({ strike: k + off, oi: 800 - i * 10 })) });
    const G = oiDeltas(gold(0.635), gold(0));
    ok('gold: picks the true +0.635 drift, not the -99.365 alias', Math.abs(G.basisDrift - 0.635) < 1e-9, String(G.basisDrift));
    ok('gold: max pain that only moved with the basis nets to 0', Math.abs(G.maxPainShiftNet) < 1e-9, String(G.maxPainShiftNet));
    ok('gold: every wall matched, none phantom', G.matchedWalls === 11 && G.callWalls.appeared.length === 0 && G.putWalls.appeared.length === 0, String(G.matchedWalls));
  }

  // A genuinely relocated wall must STILL read as appeared+faded - drift correction must not
  // launder real turnover into a match.
  const pA = mk(1.14, [100, 200, 300, 400]), cA = mk(1.14, [100, 200, 300, 400]);
  cA.callWalls[3].strike = 1.16;
  const DA = oiDeltas(cA, pA);
  ok('a truly relocated wall is appeared + faded', DA.callWalls.appeared.length === 1 && DA.callWalls.faded.length === 1);
  ok('the untouched 3 still match', DA.matchedWalls === 3, String(DA.matchedWalls));
  ok('faded reports the original strike', DA.callWalls.faded[0].strike === 1.1475, String(DA.callWalls.faded[0].strike));

  // No corroboration => assert NO drift (null) rather than inventing one from a single pair.
  const one = oiDeltas(mk(1.15, [100]), mk(1.14, [100]));
  ok('a lone wall pair does NOT define a drift', one.basisDrift === null && one.matchedWalls === 0, String(one.basisDrift));

  const zero = oiDeltas(mk(1.14, [100, 200, 300, 400]), mk(1.14, [90, 200, 300, 400]));
  ok('no drift -> drift 0, all matched, 1 firming', zero.basisDrift === 0 && zero.matchedWalls === 4 && zero.callWalls.strengthening.length === 1);

  ok('classifyOIChange no longer sees all-fresh on a pure basis shift',
     (classifyOIChange(real)?.events || []).filter(e => e.type === 'fresh_wall').length === 0);
}

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
