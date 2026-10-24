// Tests for js/macroTheories.js.   node js/macroTheories.test.mjs
import { buildTheories, buildInsight, nodeMoves } from './macroTheories.js';
import { evaluateChain, CHAIN_NODES } from './macroChain.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const f = k => CHAIN_NODES[k].floor;
const v = (k, mult) => ({ delta: f(k) * mult, last: 1 });

// A risk-off day: dollar up, stocks down, VIX up, credit wider, gold down while real yields fall
const riskOff = evaluateChain({ dxy: v('dxy', 3), nq: v('nq', -3), spx: v('spx', -3), vix: v('vix', 3), hy: v('hy', 3), gold: v('gold', -3), real: v('real', -3), smh: v('smh', -4), us10y: v('us10y', -3), bei: v('bei', 0.2), oil: v('oil', 0.1) });
const T = buildTheories(riskOff), by = id => T.find(t => t.id === id);
ok('all three theories are always offered, best supported first', T.length === 3 && ['supported', 'mixed', 'against', 'untested'].indexOf(T[0].label) <= ['supported', 'mixed', 'against', 'untested'].indexOf(T[2].label));
ok('flight to safety is supported when the dollar, stocks and VIX all agree', by('flight-to-safety').label === 'supported' && by('flight-to-safety').agree === 3);
ok('the isolated tech story is not supported when credit and the VIX also moved', by('isolated-tech').label === 'against' || by('isolated-tech').label === 'mixed');
ok('every check is true, false or null and nothing is a number or score', T.every(t => t.checks.every(c => c.ok === true || c.ok === false || c.ok === null)) && T.every(t => !('score' in t) && !('probability' in t)));
// Only chips moved, credit and VIX calm
const tech = evaluateChain({ smh: v('smh', -4), nq: v('nq', -1.2), hy: v('hy', 0.1), vix: v('vix', 0.1), spx: v('spx', -0.2) });
ok('the isolated tech story is supported on a chip-led day with calm credit', buildTheories(tech).find(t => t.id === 'isolated-tech').label === 'supported');
ok('with too few markets measured the label is not yet tested, not a guess', buildTheories(evaluateChain({ dxy: v('dxy', 3) })).every(t => t.label === 'untested' || t.measurable >= 2));
ok('nothing measured gives no theories', buildTheories(evaluateChain({})).length === 0 && buildTheories(null).length === 0);

const ins = buildInsight(riskOff, 'real-gold');
ok('the insight names the mechanism, today\'s divergence in numbers and the alternative forces', ins && ins.broken && /Why can/.test(ins.title) && ins.mechanism.length > 20 && /20 days/.test(ins.today) && ins.alternatives.length > 20);
ok('an unknown or unjudged story gives no insight', buildInsight(riskOff, 'nope') === null && buildInsight([], 'real-gold') === null);
ok('nodeMoves reads each market once from the link ends', nodeMoves(riskOff).dxy?.dir === 'up');
const allIns = (await import('./macroChain.js')).CHAIN_LINKS.map(l => buildInsight(evaluateChain({ [l.from]: v(l.from, 3), [l.to]: v(l.to, -3) }), l.id)).filter(Boolean);
ok('no lesson text shows a file path or a script name', allIns.length > 5 && allIns.every(x => !/\.mjs|analysis\/|MD files|\.md\b/.test(`${x.mechanism} ${x.today} ${x.alternatives}`)));
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
