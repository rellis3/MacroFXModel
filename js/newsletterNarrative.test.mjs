// Tests for js/newsletterNarrative.js.   node js/newsletterNarrative.test.mjs
import { evaluateChain, CHAIN_NODES } from './macroChain.js';
import { currencyNarrative, pairNarrative, clip } from './newsletterNarrative.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

const strengths = [['NZD', 0.33], ['AUD', 0.26], ['USD', 0.05], ['CAD', 0.02], ['EUR', -0.04], ['JPY', -0.1], ['GBP', -0.11], ['CHF', -0.55]].map(([ccy, score]) => ({ ccy, score }));
const cb = [{ ccy: 'USD', bank: 'Fed', regime: 'HAWKISH', latest: 0.88, delta: 0.43, headline: 'The Fed hiked 25bp on a unanimous 12-0 vote and flatly promised to deliver price stability. It reads as hawkish as a statement gets.' }, { ccy: 'JPY', bank: 'Bank of Japan', regime: 'HAWKISH', latest: 0.72, delta: 0.4, headline: 'BoJ hiked.' }, { ccy: 'EUR', bank: 'ECB', regime: 'HAWKISH', latest: 0.85, delta: 0, headline: 'ECB hiked.' }, { ccy: 'CAD', bank: 'Bank of Canada', regime: 'MIXED', latest: 0.35, delta: 0.15, headline: 'BoC holds.' }];
const surprise = [{ ccy: 'USD', score: 0.51, stale: false, top: [{ event: 'Final GDP q/q', z: 4, actual: '2.2%', estimate: '1.5%' }] }, { ccy: 'EUR', score: -0.11, stale: false, top: [] }];
const crowding = [{ sym: 'EUR', pct: 1, state: 'crowded short' }, { sym: 'NQ', pct: 94, state: 'crowded long' }];
const events = [{ ccy: 'USD', event: 'FOMC Meeting', impact: 'high', ms: 2e12 }, { ccy: 'EUR', event: 'EUR GDP', impact: 'medium', ms: 1e12 }];
const assets = [{ key: 'USDJPY', label: 'USD/JPY' }, { key: 'EURUSD', label: 'EUR/USD' }, { key: 'AUDUSD', label: 'AUD/USD' }, { key: 'USDCHF', label: 'USD/CHF' }];
const fedPath = { hike: 86.86, ref: '2026-12-16', hikeWeekAgo: 94, current: '375bps - 400bps' };
const ctx = { strengths, cb, surprise, crowding, events, fedPath, assets, when: ms => `t${ms}`, nowMs: 0, names: { USD: 'US Dollar', EUR: 'Euro', JPY: 'Japanese Yen', NZD: 'New Zealand Dollar' } };

console.log('a currency');
{ const u = currencyNarrative('USD', ctx);
  ok('it says where the currency stands today in the table, in words and numbers', /3rd of 8/.test(u.synthesis) && /\+0\.05%/.test(u.synthesis) && u.rank === 3 && u.state === 'Upper half today');
  ok('it carries the central bank, the rates path for the dollar and the data surprise', /FOMC|Fed's latest statement reads hawkish/.test(u.synthesis) && /87% on a higher Fed rate by 16 Dec, against 94% a week ago/.test(u.synthesis) && /beaten expectations \(surprise score \+0\.51\)/.test(u.synthesis));
  ok('there are at most three drivers, each tagged', u.drivers.length === 3 && u.drivers.every(d => d.tag && d.text) && u.drivers[0].tag === 'Central bank');
  ok('it never scores a direction', !/bullish|bearish|buy |sell |out of 10|\/10/i.test(JSON.stringify(u)));
  ok('the pairs where it differs most are described by gap and are not a signal', u.pairs.length === 2 && u.pairs[0].gap >= u.pairs[1].gap && /USD\/CHF: USD \+0\.05% against CHF −0\.55%, a gap of 0\.60 points/.test(u.pairs[0].text));
  ok('the monetary cycle names the stance and how far the tone moved', u.cycle.label === 'Hawkish' && /tone score 0\.88, up 0\.43/.test(u.cycle.note));
  const e = currencyNarrative('EUR', ctx);
  ok('speculator positioning is described as who has most to lose, not a direction', /crowded short/.test(e.synthesis) && /most to lose if the market turns, not which way it goes/.test(e.synthesis));
  ok('price and policy pointing different ways is called out', /price and policy language point different ways/.test(e.synthesis));
  const n = currencyNarrative('NZD', ctx);
  ok('a currency with no tracked central bank says so instead of inventing one', n.cycle === null && n.uncertain.some(t => /No central-bank statement is tracked/.test(t)) && n.state === 'Strongest today'); }

console.log('a market');
{ const f = k => CHAIN_NODES[k].floor, mv = (k, m) => ({ delta: f(k) * m, last: 1, asOf: '2026-10-23' });
  const links = evaluateChain({ real: mv('real', -3), nq: mv('nq', -3), gold: mv('gold', -3), usdjpy: mv('usdjpy', 0) });
  const eur = pairNarrative({ key: 'EURUSD', label: 'EUR/USD', d1: -0.12, d20: -0.4 }, { ...ctx, links, cotFor: { EURUSD: ['EUR'] } });
  ok('a pair says where each currency stands and who has the edge, and whether policy separates them', /EUR is 5th of 8 and USD 3rd/.test(eur.synthesis) && /USD has the edge by 0\.09 points/.test(eur.synthesis) && /Both central banks read hawkish, so policy language does not separate the pair/.test(eur.synthesis));
  ok('the next release for either currency is named with its time', /Next big release for EUR or USD: EUR GDP, t1000000000000/.test(eur.synthesis));
  const nq = pairNarrative({ key: 'NQ', label: 'Nasdaq', d1: 0.26, d20: -5.9 }, { ...ctx, links });
  ok('a market in the day\'s chain says how its textbook link did', nq.hasStory && /In the day's story: Real yield/.test(nq.synthesis) && /did not hold/.test(nq.synthesis));
  const dax = pairNarrative({ key: 'UK100', label: 'FTSE 100', d1: -0.4, d20: 1.8 }, { ...ctx, links });
  const dx = pairNarrative({ key: 'DE30', label: 'DAX', d1: -0.9, d20: -0.5 }, { ...ctx, links });
  ok('a market takes the next release of its own economy, not the dollar', /Next big release for the euro area: EUR GDP/.test(dx.synthesis));
  ok('a market outside the chain with nothing due says nothing instead of repeating its header', !dax.hasStory && dax.synthesis === '');
  ok('no market narrative scores a direction', ![eur, nq, dax].some(x => /bullish|bearish|buy |sell /i.test(JSON.stringify(x)))); }

console.log('clip');
{ ok('a short statement is kept whole and a long one is cut at the end of a sentence or a word', clip('Short.') === 'Short.' && /\.$/.test(clip('The Fed hiked 25bp on a unanimous vote. Then it said a great deal more about the outlook for the economy over the year ahead, at length.', 60)) && clip('word '.repeat(60), 40).endsWith('…')); }

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
