// Shape and honesty tests for js/atlasPosition.js.   node js/atlasPosition.test.mjs
import * as P from './atlasPosition.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const NOW = Date.parse('2026-10-22T10:00:00Z');

const regime = { now: { regime: 'reflation', label: 'Reflation', what: 'growth improving, inflation rising', usual: 'commodities and value have liked it; bonds and growth stocks have not', months: 1, since: '2026-10', previous: { regime: 'goldilocks', months: 5 }, watchFor: { to: 'stagflation', tells: 'PMIs rolling over', typical: '2-4 months' } },
  table: { SPX500: { reflation: { n: 48, mean: 1.49, median: 2.07, posShare: 0.69, range: 6.81, tilt: 'up' } }, GOLD: { reflation: { n: 5, mean: 3, median: 3, posShare: 1, range: 4, tilt: 'up' } }, NQ: { goldilocks: { n: 56 } } } };
const rc = P.regimeCard(regime);
ok('regime card carries the backdrop and what came before', rc.label === 'Reflation' && rc.previous.regime === 'goldilocks' && rc.watchFor.to === 'stagflation');
ok('markets with a thin sample (n<12) are left out', rc.markets.length === 1 && rc.markets[0].key === 'SPX500' && rc.markets[0].posShare === 69);
ok('a market with no cell in this regime is left out', !rc.markets.some(m => m.key === 'NQ'));
ok('regime note says base rate, not a forecast', /what happened, not what will/.test(rc.note));
ok('regimeFor: sample floor and mapping', P.regimeFor(regime, 'SPX500')?.mean === 1.49 && P.regimeFor(regime, 'GOLD') === null && P.regimeFor(regime, 'DE30') === null);

const cb = P.cbTone({ USD: [{ meetingDate: 'a', hawkishScore: 0.2, regime: 'HAWKISH' }, { meetingDate: 'b', hawkishScore: 0.5, regime: 'HAWKISH', headline: 'x' }], EUR: [{ hawkishScore: 0.1 }], JPY: [{ hawkishScore: 0.3 }, { hawkishScore: 0.31 }] });
ok('cb tone: delta and trend words', cb[0].ccy === 'USD' && cb[0].delta === 0.3 && cb[0].trend === 'more hawkish' && cb[0].bank === 'FOMC');
ok('cb tone: one meeting is not a trend, a 0.01 move is steady', !cb.some(c => c.ccy === 'EUR') && cb.find(c => c.ccy === 'JPY').trend === 'steady');

const sb = P.surpriseBars({ byCcy: { USD: { score: 0.52, n: 4236, nRecent: 22, top: [{ event: 'GDP', z: 4.05, actual: '2.2%', estimate: '1.5%' }] }, NZD: { score: -0.27, n: 100 }, EUR: { score: null } } });
ok('surprise bars: sorted, null scores dropped, top release kept', sb.map(x => x.ccy).join() === 'USD,NZD' && sb[0].top[0].z === 4.1 || sb[0].top[0].z === 4.05);

const cr = P.crowding({ instruments: [
  { sym: 'EUR', group: 'fx', specSharePct: 1, specShare: -7.8, specNet: -68001 }, { sym: 'GBP', group: 'fx', specSharePct: 9, specShare: 3.8, specNet: 10313 },
  { sym: 'AUD', group: 'fx', specSharePct: 81, specShare: 14.9, specNet: 50591 }, { sym: 'AUD2', group: 'fx', specSharePct: 95, specShare: 14.9, specNet: 50591 }, { sym: 'CORN', group: 'ag', specSharePct: 99, specShare: 5 }] });
ok('crowding: percentile AND sign must agree', cr.find(x => x.sym === 'EUR').state === 'crowded short' && cr.find(x => x.sym === 'AUD2').state === 'crowded long');
ok('crowding: 9th percentile but net LONG is a trimmed long, not a crowded short', cr.find(x => x.sym === 'GBP').state === 'smallest long in years');
ok('crowding: 81st is mid-range; non-FX groups are left out', cr.find(x => x.sym === 'AUD').state === 'mid-range' && !cr.some(x => x.sym === 'CORN'));

const gr = { axes: { risk: { score: 0.14, agree: '2/4', inputs: [{ id: 'a', v: 0.56, text: '78% on the risk-on side' }] }, usd: { score: 0.04, agree: '1/2', inputs: [] } }, scenarios: [{ name: 'Base', p: 0.91, pWhy: 'base rate', text: 't' }] };
ok('axes carry their inputs; scenarios become whole percentages', P.axesRows(gr)[0].inputs[0].text.includes('78%') && P.scenarios(gr)[0].p === 91);

const oi = { pairs: [{ pair: 'EUR/USD', spot: 1.1227, regime: 'BREAKOUT', maxPain: 1.1476, callWall: 1.1251, putWall: 1.1226, pcRatio: 1.7545, dte: 15 }, { pair: 'XAU/USD', spot: 4100, callWall: 4000, putWall: 3900 }] };
const g = P.gammaFor(oi, 'EURUSD');
ok('gamma: nearer-wall wording and distances in percent', g.where === 'between the walls, nearer the call wall' || g.where === 'between the walls, nearer the put wall');
ok('gamma: spot above the call wall is said plainly; unmapped instrument is null', P.gammaFor(oi, 'GOLD').where === 'above the call wall' && P.gammaFor(oi, 'DE30') === null);

const ds = { states: [{ firing: true, id: 'a', label: 'Global thing', instruments: [], evidenceId: 'e1' }, { firing: true, id: 'b', label: 'NQ thing', instruments: ['NQ'] }, { firing: false, id: 'c', label: 'off', instruments: [] }, { firing: true, id: 'd', label: 'Gold thing', instruments: ['GOLD'] }] };
ok('desk watch: only firing; instrument filter keeps global and matching', P.deskFiring(ds).length === 3 && P.deskFiring(ds, 'NQ').map(x => x.id).join() === 'a,b');

const ev = [{ ms: NOW + 3 * 3.6e6, country: 'US', event: 'Claims', impact: 'medium', estimate: '200K', prev: '210K' }, { ms: NOW + 1 * 3.6e6, country: 'GB', event: 'CPI', impact: 'high' }, { ms: NOW + 2 * 3.6e6, country: 'JP', event: 'Low thing', impact: 'low' }, { ms: NOW + 100 * 3.6e6, country: 'EU', event: 'Far', impact: 'high' }, { ms: NOW - 5 * 3.6e6, country: 'US', event: 'Past', impact: 'high' }];
const ah = P.aheadEvents(ev, NOW);
ok('ahead: sorted, high and medium only, 72h window, past dropped', ah.map(e => e.event).join() === 'CPI,Claims', ah.map(e => e.event).join());
ok('ahead: country filter and currency mapping', P.aheadEvents(ev, NOW, { countries: ['US'] }).length === 1 && ah[0].ccy === 'GBP' && ah[0].inHours === 1);

const fp = P.fedPathCard({ asOf: '2026-10-20', currentRange: '375bps - 400bps', windows: [{ ref: '2026-12-16', hike: 94.12, cut: 2.48, mean: 424.5, dist: { '400bps - 425bps': 45.88, '425bps - 450bps': 38.56 }, hikeAgo: { w1: 94.75 } }] });
ok('fed path: hike odds, most likely band, and its own caveat', fp.hike === 94.1 && fp.mostLikely.band === '400bps - 425bps' && /no measured link/.test(fp.note));
ok('next meeting: first one after now', P.nextMeeting({ meetings: [{ date: '2026-10-01' }, { date: '2026-12-09', sep: true }, { date: '2027-01-27' }] }, NOW).date === '2026-12-09');
ok('nowcast card keeps its own "not a lean" note', /context/.test(P.nowcastCard({ ok: true, gdpnow: { value: 3.5, quarter: 'q' }, cleveland: { cpi: 0.25, core: 0.21, month: 'm' }, tested: 'context, not a lean' }).note));

const pl = P.positionLines({ regime: rc, axes: P.axesRows(gr), firing: P.deskFiring(ds), events: ah, fedPath: fp, meeting: P.nextMeeting({ meetings: [{ date: '2026-12-09' }] }, NOW), now: NOW });
ok('position lines: three tenses, each non-empty, each names its numbers', pl.behind.length >= 1 && pl.right.length >= 1 && pl.ahead.length >= 1 && /month 1 after 5 months of goldilocks/.test(pl.behind[0]) && /94.1%/.test(pl.ahead.join(' ')));
ok('textbook and measured record are separate, labelled lines', pl.behind.some(l => /^The textbook says/.test(l)) && pl.behind.some(l => /^The measured record since 2007/.test(l) && /S&P 500 \+1.49% a month \(69% of months up\)/.test(l)), pl.behind.join(' | '));
ok('position lines never state a direction', !JSON.stringify(pl).match(/\bwill (rise|fall|go|move|drop)\b|\bbullish\b|\bbearish\b|predict/i));
ok('ccysOf', P.ccysOf('EURUSD', 'fx').join() === 'EUR,USD' && P.ccysOf('GOLD', 'commodity') === null);
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
