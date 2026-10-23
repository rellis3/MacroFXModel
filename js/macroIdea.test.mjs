// Tests for js/macroIdea.js.   node js/macroIdea.test.mjs
import { buildIdea } from './macroIdea.js';
import { evaluateChain, CHAIN_NODES } from './macroChain.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const f = k => CHAIN_NODES[k].floor;
// oil up hard, inflation pricing up, but the 10-year falls: oil-bei holds, bei-us10y breaks
const vals = { oil: { delta: f('oil') * 4, last: 1 }, bei: { delta: f('bei') * 3, last: 1 }, us10y: { delta: -f('us10y') * 3, last: 1 }, real: { delta: f('real') * 1.2, last: 1 } };
const links = evaluateChain(vals);
const idea = buildIdea({ links, events: [{ ms: 5, ccy: 'USD', event: 'CPI', impact: 'high' }, { ms: 9, ccy: 'EUR', event: 'PMI', impact: 'medium' }], rangePressure: { on: 2, n: 5 }, nowMs: 1 });
ok('with moving links an idea is built with eight questions in three groups', idea && idea.q.length === 8 && ['view', 'timing', 'trade'].every(g => idea.q.some(x => x.g === g)));
ok('a broken link is chosen as the story and named as the pattern', idea.broken && /did not follow/.test(idea.pattern));
ok('the chain has at least two markets and every step names a market', idea.steps.length >= 2 && idea.steps.every(s => s.label));
ok('the calendar question uses only high-impact releases', /CPI/.test(idea.q[5].body) && !/PMI/.test(idea.q[5].body));
ok('it admits there is no positioning feed', /no positioning feed/.test(idea.q[3].body));
ok('it never gives a trade level or a direction forecast', !/\b(stop|target|buy|sell|short|long)\b|will (rise|fall)/i.test(idea.q.map(x => x.body).join(' ')));
ok('nothing judged means no idea', buildIdea({ links: evaluateChain({}) }) === null && buildIdea({}) === null);
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
