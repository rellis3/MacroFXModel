// Tests for js/headlineCheck.js.   node js/headlineCheck.test.mjs
import { evaluateChain, CHAIN_NODES } from './macroChain.js';
import { evidenceFor, checkClaims, scrubText, dataHeadline } from './headlineCheck.js';
import { dollarBasket } from './dataChecks.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

const f = k => CHAIN_NODES[k].floor, mv = (k, m) => ({ delta: f(k) * m, last: 1, asOf: '2026-10-23' });
const links = evaluateChain({ nq: mv('nq', -3), gold: mv('gold', -3), hy: mv('hy', 3), real: mv('real', -3), us10y: mv('us10y', -3), dxy: mv('dxy', 3) });
const pairs = (v) => Object.entries(v).map(([key, d20]) => ({ key, d20 }));
const fell = pairs({ EURUSD: -0.4, GBPUSD: 1.0, AUDUSD: 1.1, NZDUSD: 1.6, USDJPY: -0.6, USDCAD: -1.7, USDCHF: -0.5 });
const rose = pairs({ EURUSD: -1, GBPUSD: -1.2, AUDUSD: -1.5, NZDUSD: -1.1, USDJPY: 1.4, USDCAD: 1.2, USDCHF: 0.9 });
const ys = { dNom: -32, dReal: -28, dBei: -4 };

console.log('the dollar on daily prices');
{ const b = dollarBasket(fell);
  ok('the basket is the average dollar move over the seven pairs, signed by whether the dollar is base or quote', b.n === 7 && Math.abs(b.avg + 0.871) < 0.01 && b.stronger === 1);
  const ev = evidenceFor({ links, ys, assets: fell }), evUp = evidenceFor({ links, ys, assets: rose });
  const c1 = checkClaims('Falling bond yields did not help stocks or gold, and the dollar rose anyway: the safety-bid shape.', ev);
  ok('"the dollar rose" is contradicted when the daily pairs show it fell, even though the lagging index rose', c1.find(c => c.id === 'dollar-up')?.status === 'contradicted' && /on average against 7 majors, stronger against 1 of 7/.test(c1.find(c => c.id === 'dollar-up').evidence));
  const c2 = checkClaims('The dollar is bought anyway.', evUp);
  ok('"the dollar is bought" is verified when the daily pairs show a stronger dollar', c2.find(c => c.id === 'dollar-up')?.status === 'verified');
  const c3 = checkClaims('The dollar weakened.', ev);
  ok('a falling dollar claim is verified by the same pairs', c3.find(c => c.id === 'dollar-down')?.status === 'verified');
  const mixed = evidenceFor({ links, ys, assets: pairs({ EURUSD: -1, GBPUSD: 1, AUDUSD: -1, NZDUSD: 1, USDJPY: 1, USDCAD: -1 }) });
  ok('an even split is unverifiable, not a verdict', checkClaims('The dollar rose.', mixed).find(c => c.id === 'dollar-up')?.status === 'unverifiable');
  ok('with too few pairs the dollar cannot be judged', checkClaims('The dollar rose.', evidenceFor({ links, ys, assets: fell.slice(0, 2) })).find(c => c.id === 'dollar-up')?.status === 'unverifiable'); }

console.log('other claims');
{ const ev = evidenceFor({ links, ys, assets: fell });
  const c = checkClaims('Yields fell, credit widens and the Nasdaq dropped while gold fell.', ev);
  ok('yields, credit, stocks and gold are each checked against their own move', ['yields-down', 'credit-wider', 'stocks-down', 'gold-down'].every(id => c.find(x => x.id === id)?.status === 'verified'));
  ok('a claim against the move is contradicted', checkClaims('Gold rallied.', ev).find(x => x.id === 'gold-down') === undefined && checkClaims('Credit spreads narrowed.', ev).length === 0);
  const calm = evaluateChain({ nq: mv('nq', 0.2), hy: mv('hy', 0.1), gold: mv('gold', 0.1), us10y: mv('us10y', -3) });
  ok('a move inside its noise floor is unverifiable', checkClaims('The Nasdaq fell.', evidenceFor({ links: calm, ys, assets: fell })).find(x => x.id === 'stocks-down')?.status === 'unverifiable'); }

console.log('scrubbing and rebuilding');
{ const ev = evidenceFor({ links, ys, assets: fell });
  const r = scrubText('The bond market marked down borrowing costs. The dollar is bid 0.9% higher. Cheaper money is a growth warning.', ev);
  ok('only the contradicted sentence is left out, and it is reported with its evidence', r.text === 'The bond market marked down borrowing costs. Cheaper money is a growth warning.' && r.removed.length === 1 && /the dollar rose/.test(r.removed[0].what) && /stronger against 1 of 7/.test(r.removed[0].evidence));
  const h = dataHeadline({ ys, links, assets: fell });
  ok('the rebuilt headline uses only verified figures', h.headline === 'Yields fell 32bp, but the Nasdaq and gold fell too' && /Real yields account for 88% of the move in the 10-year/.test(h.standfirst) && /credit spreads widened/.test(h.standfirst) && /the dollar fell 0\.9% on average against 7 majors/.test(h.standfirst));
  ok('the rebuilt headline survives its own check', checkClaims(`${h.headline}. ${h.standfirst}`, ev).every(c => c.status === 'verified'));
  const bare = dataHeadline({ ys: null, links: [], assets: [] });
  ok('with nothing to say it says only what it measured', /What moved over the last 20 days/.test(bare.headline) && bare.standfirst === ''); }

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
