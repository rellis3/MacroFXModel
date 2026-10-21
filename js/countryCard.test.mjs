// Shape and honesty tests for js/countryCard.js.   node js/countryCard.test.mjs
import { buildCountryCard, macroWord, FACTOR_WHY, MIN_FACTORS } from './countryCard.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

const PAIRS = { EURUSD: ['EUR', 'USD'], GBPUSD: ['GBP', 'USD'], USDJPY: ['USD', 'JPY'], AUDUSD: ['AUD', 'USD'], EURJPY: ['EUR', 'JPY'] };
const board = [{ ccy: 'USD', composite: 0.41 }, { ccy: 'EUR', composite: -0.10 }, { ccy: 'JPY', composite: -0.33 }, { ccy: 'GBP', composite: 0.05 }, { ccy: 'AUD', composite: null }];
const usd = buildCountryCard({
  ccy: 'USD',
  macro: {
    composite: 0.41, factorsScored: 5, factorsTotal: 6,
    factors: {
      rates: { label: 'Rates & policy', score: 0.62, backedBy: 3, of: 3 },
      inflation: { label: 'Inflation', score: 0.44, backedBy: 2, of: 2 },
      growth: { label: 'Growth', score: -0.2, backedBy: 1, of: 2 },
      labour: { label: 'Labour market', score: 0.1, backedBy: 1, of: 1 },
      external: { label: 'External balance', score: -0.5, backedBy: 1, of: 1 },
      demand: { label: 'Domestic demand', score: null },
    },
  },
  measured: { rank: 2, of: 8 },
  boardDriver: { factor: 'Rates & policy', spread: 1.2, thisCcyRank: 1, of: 8 },
  cb: { bank: 'FOMC', trend: 'UNCHANGED', latestScore: 0.3, deltaVsPrev: 0 },
  board, pairs: PAIRS,
});

ok('composite and word', usd.composite === 0.41 && usd.word === 'Strong' && usd.cls === 'bull');
ok('drivers are the three biggest |score|, ordered', usd.drivers.map(d => d.key).join() === 'rates,external,inflation', usd.drivers.map(d => d.key).join());
ok('a negative factor reads weak and uses the weak mechanism', usd.drivers[1].direction === 'weak' && usd.drivers[1].why === FACTOR_WHY.external.weak);
ok('a factor with null score is left out, never treated as neutral', !usd.drivers.some(d => d.key === 'demand'));
ok('thin backing is flagged', buildCountryCard({ ccy: 'USD', macro: { composite: 0.1, factors: { growth: { label: 'Growth', score: 0.3, backedBy: 1, of: 2 } } } }).drivers[0].thin === true && usd.drivers[0].thin === false);
ok('coverage and thin coverage', usd.coverage === '5/6 factors' && usd.thinCoverage === true);
ok('board line names the factor and the rank', /rates & policy/.test(usd.boardLine) && /USD ranks 1 of 8/.test(usd.boardLine));
ok('cycle chip from a tracked bank', usd.cycle.bank === 'FOMC' && usd.cycle.word === 'Tone steady');
ok('no tracked bank says so', buildCountryCard({ ccy: 'AUD', macro: { composite: 0, factors: {} }, cb: null }).cycle.word === 'No tracked bank');
ok('expressions: biggest gap first, orientation from the pair', usd.expressions[0].pair === 'USDJPY' && usd.expressions[0].gap === 0.74 && /USD over JPY/.test(usd.expressions[0].textbook), JSON.stringify(usd.expressions[0]));
ok('expressions skip a currency with no composite', !usd.expressions.some(e => e.pair === 'AUDUSD'));
ok('expressions are oriented even when ccy is the quote', buildCountryCard({ ccy: 'JPY', macro: { composite: -0.33, factors: {} }, board, pairs: PAIRS }).expressions.some(e => e.pair === 'USDJPY' && /USD over JPY/.test(e.textbook)));
ok('expressions only for pairs containing the currency', usd.expressions.every(e => PAIRS[e.pair].includes('USD')));
ok('never states a direction or a forecast', !JSON.stringify(usd).match(/\bwill (rise|fall|go|move)\b|\bbullish\b|\bbearish\b|predict/i));
ok('the foot says it is not a forecast and cites the null', /not a forecast/.test(usd.foot) && /null/.test(usd.foot));
ok('every factor has both mechanisms', Object.values(FACTOR_WHY).every(f => f.label && f.strong && f.weak));
ok('macroWord edges', macroWord(0.35).word === 'Strong' && macroWord(0.12).word === 'Leaning strong' && macroWord(0).word === 'Mixed' && macroWord(-0.11).word === 'Mixed' && macroWord(-0.12).word === 'Leaning weak' && macroWord(-0.2).word === 'Leaning weak' && macroWord(-0.5).word === 'Weak' && macroWord(null).word === 'No read');
ok('missing macro still builds', (() => { const c = buildCountryCard({ ccy: 'NZD' }); return c.composite === null && c.drivers.length === 0 && c.word === 'No read'; })());

// Real-data shape (live scorecard 2026-10-21): `dims` is a LIST of series names, and every currency had 1/6 factors.
const live = buildCountryCard({ ccy: 'USD', macro: { composite: 1, factorsScored: 1, factorsTotal: 6, factors: { rates: { label: 'Rates & policy', score: 1, dims: ['rateDiff'], of: 3 } } }, board: [{ ccy: 'USD', composite: 1 }, { ccy: 'GBP', composite: -0.39 }], pairs: { GBPUSD: ['GBP', 'USD'] } });
ok('a dims list is read as a count, with the series named', live.drivers[0].backing === '1/3 series (rateDiff)', live.drivers[0].backing);
ok('1 factor of 6 is a Thin read, never Strong', live.word === 'Thin read' && live.thin === true && live.cls === 'neu', live.word);
ok('a thin read says so in its pair lines too', /1\/6 factors with data/.test(live.expressions[0].line) && /not a full macro read/.test(live.expressions[0].line), live.expressions[0].line);
ok('at the floor it is worded as a read', buildCountryCard({ ccy: 'USD', macro: { composite: 0.5, factorsScored: MIN_FACTORS, factorsTotal: 6, factors: {} } }).word === 'Strong');
let threw = false; try { buildCountryCard({}); } catch { threw = true; }
ok('ccy is required', threw);
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
