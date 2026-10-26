// Tests for js/betaShift.js.   node js/betaShift.test.mjs
import { betaFor, betaTop, MAX_AGE_DAYS } from './betaShift.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

const fac = (label, unit, now, prior, o = {}) => ({ label, unit, now, prior, corr_now: 0.4, corr_prior: -0.4, z: 1, flip: false, shift: false, ...o });
const beta = { asof: '2026-10-24', markets: {
  AUDUSD: { name: 'AUDUSD', asof: '2026-10-24', units: 'pct', line: 'x', factors: { US10Y: fac('US 10y yield', 'per 10bp', 0.23, -0.46, { flip: true, shift: true, z: 2.4 }), 'DX-Y.NYB': fac('Dollar index', 'per 1%', 0.6, 1.2, { shift: true, z: -1.7 }) } },
  EURUSD: { name: 'EURUSD', asof: '2026-10-24', units: 'pct', line: 'EURUSD: betas stable', factors: { US10Y: fac('US 10y yield', 'per 10bp', -0.03, -0.23) } },
  SPX500: { name: 'S&P 500', asof: '2026-10-24', units: 'pct', line: 'weak', factors: { US10Y: fac('US 10y yield', 'per 10bp', 0.31, -0.71, { corr_now: 0.29 }) } },
  XAUUSD: { name: 'Gold', asof: '2026-10-24', units: 'pct', line: 'x', factors: { 'DX-Y.NYB': fac('Dollar index', 'per 1%', -2.9, -1.2, { shift: true, z: -2 }) } },
  NQ: { name: 'Nasdaq 100', asof: '2026-10-24', units: 'pct', line: 'x', factors: { US10Y: fac('US 10y yield', 'per 10bp', 1.06, -0.89, { flip: true, shift: true, z: 3 }) } },
  BTCUSD: { name: 'Bitcoin', asof: '2026-10-10', units: 'pct', line: 'x', factors: { US10Y: fac('US 10y yield', 'per 10bp', 0.85, -1.71, { flip: true }) } },
} };

console.log('one market');
{ const a = betaFor(beta, 'AUDUSD', '2026-10-25', 'AUD/USD');
  ok('a flipped link is reported first, in plain terms with both periods', a.flipped === 1 && a.sentences.length === 2 && a.sentences[0] === 'Flipped: for each 10bp that the US 10-year yield moves, AUD/USD now moves +0.23%, against −0.46% over the 60 sessions before.');
  ok('a weaker link says weaker, and the dollar index is named', /^Weaker: for each 1% that the dollar index moves, AUD\/USD now moves \+0\.60%, against \+1\.20%/.test(a.sentences[1]));
  ok('the as-of date travels with it', a.asof === '2026-10-24');
  ok('stable betas print nothing', betaFor(beta, 'EURUSD', '2026-10-25', 'EUR/USD') === null);
  ok('a link that changed sign but is weak (neither flag set) prints nothing', betaFor(beta, 'SPX500', '2026-10-25', 'S&P 500') === null);
  ok('the issue key GOLD finds the review\'s XAUUSD, and a stronger link says stronger', /^Stronger: for each 1% that the dollar index moves, Gold now moves −2\.90%/.test(betaFor(beta, 'GOLD', '2026-10-25', 'Gold').sentences[0]));
  ok('a market the review does not cover prints nothing', betaFor(beta, 'US30', '2026-10-25', 'Dow') === null); }

console.log('stale and absent data');
{ ok('a market whose own date is older than the allowed age is left out', betaFor(beta, 'BTCUSD', '2026-10-25', 'Bitcoin') === null);
  ok(`the whole file older than ${MAX_AGE_DAYS} days prints nothing, exactly ${MAX_AGE_DAYS} days is still fine`, betaFor(beta, 'AUDUSD', '2026-11-03', 'AUD/USD') === null && betaFor(beta, 'AUDUSD', '2026-11-01', 'AUD/USD') !== null);
  ok('no feed, no date, or a date in the future prints nothing', betaFor(null, 'AUDUSD', '2026-10-25') === null && betaFor(beta, 'AUDUSD', undefined) === null && betaFor(beta, 'AUDUSD', '2026-10-20') === null); }

console.log('the biggest changes across markets');
{ const t = betaTop(beta, ['AUDUSD', 'EURUSD', 'GOLD', 'NQ', 'BTCUSD'], '2026-10-25', { AUDUSD: 'AUD/USD', GOLD: 'Gold', NQ: 'the Nasdaq 100' });
  ok('flips come first, largest shift first, three at most', t.items.length === 3 && t.items[0].key === 'NQ' && t.items[1].key === 'AUDUSD' && t.items.slice(0, 2).every(i => i.kind === 'flipped'));
  ok('it is one plain sentence naming each market and the driver', t.text === 'The biggest changes in what moves together: the Nasdaq 100 to the 10-year yield (flipped), AUD/USD to the 10-year yield (flipped) and Gold to the dollar (stronger).');
  ok('nothing changed or nothing fresh gives null', betaTop(beta, ['EURUSD', 'SPX500'], '2026-10-25') === null && betaTop(beta, ['NQ'], '2026-12-01') === null); }

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
