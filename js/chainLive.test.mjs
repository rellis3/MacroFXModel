// Synthetic tests for js/chainLive.js. No network, no clock.
//   node js/chainLive.test.mjs
import { DOLLAR_BASKET, pctMove, dollarBasketPct, anchorAt, impliedYield, liveYieldMove, buildLiveNodes, mergeLive } from './chainLive.js';
import { zonedEpoch } from './yieldLegs.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

console.log('[pctMove / dollar basket]');
{
  ok('pctMove is the percent move against the reference close', near(pctMove(101, 100), 1));
  ok('pctMove refuses a missing or non-positive price', pctMove(null, 100) === null && pctMove(100, 0) === null && pctMove(NaN, 1) === null);
  ok('basket weights are the DXY legs and sum to 92.2', near(DOLLAR_BASKET.reduce((a, b) => a + b.w, 0), 92.2));
  const flat = Object.fromEntries(DOLLAR_BASKET.map(b => [b.node, { price: 1, ref: 1 }]));
  ok('a flat board is a flat dollar', near(dollarBasketPct(flat), 0));
  const eurDown = { ...flat, eurusd: { price: 0.99, ref: 1 } };
  const exp = 57.6 * -Math.log(0.99) * 100 / 92.2;
  ok('EUR/USD -1% alone lifts the dollar by its 62.5% share', near(dollarBasketPct(eurDown), exp, 1e-9) && dollarBasketPct(eurDown) > 0.6 && dollarBasketPct(eurDown) < 0.65, String(dollarBasketPct(eurDown)));
  const jpyUp = { ...flat, usdjpy: { price: 1.01, ref: 1 } };
  ok('USD/JPY +1% lifts it too (the sign is the dollar side)', dollarBasketPct(jpyUp) > 0);
  ok('a missing leg means no basket, not a partial one', dollarBasketPct({ ...flat, gbpusd: null }) === null && dollarBasketPct({ eurusd: flat.eurusd }) === null);
}

console.log('[implied yield: anchor, reference, live]');
{
  // Two official prints; M5 CFD bars Thu -> Mon. The price path is built so every number is known by hand.
  const US_FIX = d => zonedEpoch(d, 15, 30, 'America/New_York');
  const official = [{ date: '2026-10-29', value: 4.00 }, { date: '2026-10-30', value: 4.05 }];
  const fixThu = US_FIX('2026-10-29'), fixFri = US_FIX('2026-10-30');
  const tRef = zonedEpoch('2026-10-30', 17, 0, 'America/New_York');          // Friday 17:00 NY: the daily close
  const now = zonedEpoch('2026-11-02', 10, 0, 'America/New_York');           // Monday 10:00 NY
  const step = 300, bars = [];
  // price: 100.0 up to the Thursday fix, 100.1 to the Friday fix, 100.2 to the Friday close, 100.4 after
  const px = t => (t < fixThu ? 100 : t < fixFri ? 100.1 : t < tRef ? 100.2 : 100.4);
  for (let t = fixThu - 6 * 3600; t <= now; t += step) bars.push({ t, o: px(t), h: px(t), l: px(t), c: px(t) });
  const D = 8;
  const mv = liveYieldMove({ bars, step, official, fix: US_FIX, D, pNow: 99.6, now, tRef });
  ok('a move comes back', mv != null);
  // anchors: Thursday fix price 100.0 -> 4.00 ; Friday fix price 100.1 -> 4.05 (the last bar before each fix)
  const anc = [{ t: fixThu, y: 4.00, p: 100.0 }, { t: fixFri, y: 4.05, p: 100.1 }];
  const yRef = 4.05 - 100 * Math.log(100.2 / 100.1) / D, yNow = 4.05 - 100 * Math.log(99.6 / 100.1) / D;
  ok('the reference is the Friday anchor moved to the 17:00 close', near(mv.ref, yRef, 1e-9), `${mv.ref} vs ${yRef}`);
  ok('now is the same anchor moved to the live price', near(mv.now, yNow, 1e-9), `${mv.now} vs ${yNow}`);
  ok('delta bp is the pure CFD move (the anchor cancels) through the duration', near(mv.deltaBp, -100 * Math.log(99.6 / 100.2) / D * 100, 1e-6), String(mv.deltaBp));
  ok('price down means yield up (positive bp)', mv.deltaBp > 0);
  ok('both ends used the Friday anchor', mv.anchorNow === fixFri && mv.anchorRef === fixFri);
  ok('anchorAt picks the latest anchor at or before the instant', anchorAt(anc, tRef).t === fixFri && anchorAt(anc, fixFri - 1).t === fixThu && anchorAt(anc, fixThu - 1) === null);
  ok('impliedYield at the anchor price is the official yield', near(impliedYield(anc, D, tRef, 100.1), 4.05));
  // a new official print landing between the reference and now moves the live end only
  const official2 = [...official, { date: '2026-11-02', value: 4.20 }];
  const fixMon = US_FIX('2026-11-02');
  const now2 = fixMon + 3600;
  const bars2 = []; for (let t = fixThu - 6 * 3600; t <= now2; t += step) bars2.push({ t, o: px(t), h: px(t), l: px(t), c: px(t) });
  const mv2 = liveYieldMove({ bars: bars2, step, official: official2, fix: US_FIX, D, pNow: 100.4, now: now2, tRef });
  ok('a newer official print re-anchors the live end', mv2.anchorNow === fixMon && mv2.anchorRef === fixFri);
  ok('no usable anchor -> null, not a guess', liveYieldMove({ bars, step, official: [{ date: '2026-01-02', value: 4 }], fix: US_FIX, D, pNow: 100, now, tRef }) === null);
}

console.log('[the live node map]');
{
  const m = (price, ref, extra = {}) => ({ price, ref, asOf: '2026-11-02T14:00:00Z', closed: false, ...extra });
  const markets = { gold: m(2000, 1950), eurusd: m(0.99, 1), usdjpy: m(150, 150), gbpusd: m(1.2, 1.2), usdcad: m(1.4, 1.4), oil: m(80, 80, { closed: true }) };
  const y = (deltaBp, now, ref) => ({ deltaBp, now, ref, asOf: '2026-11-02T14:00:00Z', closed: false });
  const yields = { us2y: y(3, 4.0, 3.97), us10y: y(-6, 4.2, 4.26), us30y: y(-8, 4.5, 4.58), bund10: y(-9, 2.5, 2.59) };
  const nodes = buildLiveNodes({ markets, yields, tipsLast: 1.9 });
  ok('market chips are percent moves with basis live', near(nodes.gold.delta, (2000 / 1950 - 1) * 100) && nodes.gold.basis === 'live' && nodes.gold.last === 2000);
  ok('the closed flag is carried', nodes.oil.closed === true && nodes.gold.closed === false);
  ok('yields are implied bp', nodes.us10y.delta === -6 && nodes.us10y.basis === 'implied' && nodes.us2y.delta === 3);
  ok('real yield = the 10Y implied move, breakevens flat, and says so', nodes.real.delta === -6 && /breakevens assumed flat/.test(nodes.real.basis) && near(nodes.real.last, 1.9 - 0.06));
  ok('Bund gap = Bund implied - UST implied, in bp', near(nodes.bundgap.delta, -9 - -6) && near(nodes.bundgap.last, 2.5 - 4.2) && nodes.bundgap.basis === 'implied');
  ok('the dollar is a basket and says so', nodes.dxy && nodes.dxy.basis === 'implied basket' && nodes.dxy.delta > 0);
  ok('nothing else is invented (no breakevens, credit, VIX, funding, gilt or JGB gap)', ['bei', 'hy', 'vix', 'funding', 'giltgap', 'jgbgap', 'ccc', 'move', 'crack', 'smh'].every(k => !(k in nodes)));
  const noBund = buildLiveNodes({ markets, yields: { us10y: yields.us10y } });
  ok('no Bund yield -> no gap (the page keeps its last print)', !('bundgap' in noBund) && 'real' in noBund);
  const noEur = buildLiveNodes({ markets: { ...markets, eurusd: null }, yields });
  ok('a missing FX leg -> no dollar basket', !('dxy' in noEur));
  const noUst = buildLiveNodes({ markets, yields: { bund10: yields.bund10 } });
  ok('no UST 10Y -> no real yield and no gap', !('real' in noUst) && !('bundgap' in noUst));

  console.log('[merge on the page]');
  const prints = { gold: { delta: -3.6, last: 1900, asOf: '2026-10-30' }, bei: { delta: 1, last: 2.3, asOf: '2026-10-30' }, hy: null, real: { delta: -4, last: 1.9, asOf: '2026-10-30' } };
  const merged = mergeLive(nodes, prints);
  ok('a live node replaces the print', merged.gold.basis === 'live' && merged.gold.delta > 0, JSON.stringify(merged.gold));
  ok('a node with no live price keeps its print, tagged last-print', merged.bei.basis === 'last-print' && merged.bei.delta === 1 && merged.bei.asOf === '2026-10-30');
  ok('a null print stays null (no data), not a fake', merged.hy === null);
  ok('the live real yield beats the last-print one', /implied/.test(merged.real.basis));
  ok('with no live data every node is a last print', Object.values(mergeLive({}, prints)).filter(Boolean).every(v => v.basis === 'last-print'));
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
