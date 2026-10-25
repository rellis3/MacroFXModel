// Tests for js/dataChecks.js.   node js/dataChecks.test.mjs
import { laggingSeries, dollarOnDailyFx, dataChecks } from './dataChecks.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const end = (key, label, asOf) => ({ key, label, asOf });
const links = [{ a: end('real', 'Real yield', '2026-10-22'), b: end('dxy', 'Dollar (broad index)', '2026-10-16') }, { a: end('bei', 'Inflation', '2026-10-23'), b: end('nq', 'Nasdaq', '2026-10-23') }];
const L = laggingSeries(links);
ok('the newest print is found and only the series more than three days older are flagged', L.latest === '2026-10-23' && L.lagging.length === 1 && L.lagging[0].key === 'dxy' && L.lagging[0].days === 7);
ok('a series one day behind is not flagged', laggingSeries([{ a: end('a', 'A', '2026-10-22'), b: end('b', 'B', '2026-10-23') }]).lagging.length === 0);
const assets = [['EURUSD', -0.4], ['GBPUSD', 1.0], ['AUDUSD', 1.1], ['NZDUSD', 1.6], ['USDJPY', -0.6], ['USDCAD', -1.7], ['USDCHF', -0.5]].map(([key, d20]) => ({ key, label: key, d20 }));
const D = dollarOnDailyFx(assets);
ok('the dollar is counted stronger on a pair when the quote currency fell or the base rose, over the seven majors', D.n === 7 && D.stronger === 1 && D.rows.find(r => r.key === 'EURUSD').stronger === true && D.rows.find(r => r.key === 'USDJPY').stronger === false);
const c = dataChecks({ links, assets });
ok('a lagging dollar index with daily FX disagreeing gives both findings, naming the dates and the count', c.length === 2 && /last printed on 16 Oct, 7 days before/.test(c[0].body) && /stronger against 1 of 7 and weaker against 6/.test(c[1].body) && /moved −0\.9% on average/.test(c[1].body) && /unconfirmed/.test(c[1].body));
ok('when nothing lags there is nothing to say', dataChecks({ links: [{ a: end('a', 'A', '2026-10-23'), b: end('b', 'B', '2026-10-23') }], assets }).length === 0);
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
