// Pure logic behind the Desk Terminal's Chain, Changed and Pair tabs (js/terminal/*.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ohlcAscending, fundingSpread, gapSeries, chainVals, chainLinks, chainSvg, chainSnapshot, termPremiumSplit, summariseChain, CHAIN_LAYOUT } from './chainBoard.js';
import { bookOf, diffBooks, stressChanges, chainFlips, whatChanged, recordSnap, previousSnap, stressSnapOf } from './whatChanged.js';
import { legsOf, isFx, pairLabel, oandaOf, mentions, researchFor, rowFor, crowdFor, rateGap } from './pairView.js';

// ── chain ──
const days = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 8, 1) + i * 864e5).toISOString().slice(0, 10));
const ramp = (n, a, b) => days(n).map((date, i) => ({ date, value: a + (b - a) * i / (n - 1) }));

test('ohlcAscending: newest-first strings become ascending numbers, dated one day on (OANDA stamps by the open)', () => {
  const s = ohlcAscending({ values: [{ datetime: '2026-11-02', close: '1.1191' }, { datetime: '2026-10-30', close: '1.1150' }, { datetime: 'x', close: '1' }] });
  assert.deepEqual(s, [{ date: '2026-10-31', value: 1.115 }, { date: '2026-11-03', value: 1.1191 }]);
});

test('fundingSpread: SOFR minus the floor in force, IOER before IORB', () => {
  const fred = { sofr: [{ date: 'a', value: 5 }, { date: 'b', value: 5.1 }, { date: 'c', value: 5.2 }], ioer: [{ date: 'a', value: 4.9 }], iorb: [{ date: 'c', value: 5.15 }] };
  assert.deepEqual(fundingSpread(fred).map(p => +p.value.toFixed(2)), [0.1, 0.2, 0.05]);
  assert.deepEqual(fundingSpread({}), []);
});

test('gapSeries: foreign minus Treasury on common dates only', () => {
  assert.deepEqual(gapSeries([{ date: 'a', value: 4 }, { date: 'z', value: 9 }], [{ date: 'a', value: 4.5 }]), [{ date: 'a', value: -0.5 }]);
});

test('chainVals + chainLinks: real yields up and gold down reads as the link holding; gold up reads broken', () => {
  const base = { fred: { tips: ramp(30, 2.0, 2.4), us10y: ramp(30, 4.0, 4.4), bei: ramp(30, 2.3, 2.3) }, ohlc: { gold: ramp(30, 4000, 3600) } };
  const v = chainVals(base, 20);
  assert.ok(v.real.delta > 8 && v.gold.delta < -3);
  const hold = chainLinks(base, 20).find(l => l.id === 'real-gold');
  assert.equal(hold.verdict, 'holding');
  const broke = chainLinks({ ...base, ohlc: { gold: ramp(30, 3600, 4000) } }, 20).find(l => l.id === 'real-gold');
  assert.equal(broke.verdict, 'broken');
  assert.equal(chainLinks({}, 20).every(l => l.verdict === 'unmeasured'), true);
});

test('chainVals live: live nodes override last prints; a node with no live price is last-print and its links are not judged live', () => {
  const inputs = { fred: { tips: ramp(30, 2.0, 2.4), hy: ramp(30, 3, 3.5) }, ohlc: { gold: ramp(30, 4000, 3600) }, live: { nodes: { gold: { delta: 2, last: 4100, basis: 'live' }, vix: { delta: 3, last: 22, basis: 'live' } } } };
  const v = chainVals(inputs, 'live');
  assert.equal(v.gold.basis, 'live'); assert.equal(v.gold.delta, 2);
  assert.equal(v.hy.basis, 'last-print');
  const links = chainLinks(inputs, 'live');
  assert.equal(links.find(l => l.id === 'vix-hy').verdict, 'notlive');
});

test('chainSvg: one chip per laid-out node, one group per drawn link, hide-quiet hides quiet links', () => {
  const inputs = { fred: { tips: ramp(30, 2.0, 2.4) }, ohlc: { gold: ramp(30, 4000, 3600) } };
  const links = chainLinks(inputs, 20);
  const svg = chainSvg(links, { win: 20 });
  assert.equal((svg.match(/data-node="/g) ?? []).length, Object.keys(CHAIN_LAYOUT).length);
  assert.equal((svg.match(/data-link="/g) ?? []).length, links.length);
  assert.match(svg, /data-link="real-gold"[^>]*>/);
  assert.match(svg, /class="cg-e hold[^"]*" data-link="real-gold"/);
  const judged = links.filter(l => l.verdict === 'holding' || l.verdict === 'broken').length;
  assert.equal((chainSvg(links, { showQuiet: false }).match(/data-link="/g) ?? []).length, judged);
  assert.equal(chainSvg([], {}), '');
  assert.doesNotMatch(svg, /undefined|NaN/);
});

test('chainSnapshot: carries the chain text, a window and a free-of-NaN asset list', () => {
  const inputs = { fred: { tips: ramp(30, 2.0, 2.4) }, ohlc: { gold: ramp(30, 4000, 3600) } };
  const links = chainLinks(inputs, 20), s = chainSnapshot({ links, vals: chainVals(inputs, 20), win: 20, events: [{ impact: 'High', ms: Date.now() + 3600e3, country: 'US', event: 'CPI' }] });
  assert.equal(s.window, 20); assert.match(s.chain, /HOLDING/); assert.match(s.assets, /Gold/); assert.match(s.events, /US CPI -- in 1h/);
  assert.equal(summariseChain(links, 20).holding >= 1, true);
});

test('termPremiumSplit: path = fitted minus term premium; none on live', () => {
  const fred = { tp10: ramp(30, 0.5, 0.7), fy10: ramp(30, 4.0, 4.5) };
  const s = termPremiumSplit(fred, 20);
  assert.ok(Math.abs(s.tp + s.path - s.fitted) < 1e-9);
  assert.equal(termPremiumSplit(fred, 'live'), null);
});

// ── what changed ──
const run = (date, { tone = 'risk_off', conv = 'low', biases = {}, cards = {} } = {}) => ({ date, finishedAt: `${date}T07:00:00Z`, head: { ok: true, book: { global: { tone }, currencies: {}, instruments: cards } }, debate: { global: { view: { conviction: conv } }, currency: { view: { currencies: Object.fromEntries(Object.entries(biases).map(([k, b]) => [k, { bias: b }])), ranking: Object.keys(biases) } } } });

test('bookOf: null without a head book; biases from the currency debate', () => {
  assert.equal(bookOf({ head: { ok: false } }), null);
  const b = bookOf(run('2026-11-04', { biases: { USD: 1 }, cards: { EURUSD: { rating: 'SHORT', size: 0.2, conviction: 'low' } } }));
  assert.equal(b.biases.USD, 1); assert.equal(b.cards.EURUSD.dir, -1);
});

test('diffBooks: a flipped sized card outranks a one-notch bias move; added, removed and resized are named', () => {
  const prev = bookOf(run('2026-11-03', { tone: 'risk_on', biases: { USD: 1, EUR: -1 }, cards: { EURUSD: { rating: 'SHORT', size: 0.3 }, GOLD: { rating: 'LONG', size: 0.2 }, NQ: { rating: 'LONG', size: 0.2, conviction: 'low' } } }));
  const cur = bookOf(run('2026-11-04', { tone: 'risk_off', biases: { USD: 2, EUR: -1 }, cards: { EURUSD: { rating: 'LONG', size: 0.3 }, USDJPY: { rating: 'SHORT', size: 0.25 }, NQ: { rating: 'LONG', size: 0.5, conviction: 'high' } } }));
  const d = diffBooks(prev, cur), by = k => d.find(x => x.key === k);
  assert.equal(by('EURUSD').change, 'flipped');
  assert.equal(by('GOLD').change, 'removed');
  assert.equal(by('USDJPY').change, 'added');
  assert.equal(by('NQ').change, 'resized'); assert.match(by('NQ').title, /size 0.2 → 0.5/);
  assert.equal(by('tone').weight, 6);
  assert.ok(by('EURUSD').weight > by('USD').weight);
  assert.equal(diffBooks(null, cur).length, 0);
});

test('stressChanges: only tiles that changed colour, weighted by how far', () => {
  const a = { overall: 'watch', tiles: [{ id: 'credit', label: 'Credit', level: 'ok' }, { id: 'em', label: 'EM', level: 'ok' }] };
  const b = { overall: 'stress', tiles: [{ id: 'credit', label: 'Credit', level: 'stress' }, { id: 'em', label: 'EM', level: 'ok' }] };
  const c = stressChanges(a, b);
  assert.deepEqual(c.map(x => x.key).sort(), ['credit', 'overall']);
  assert.equal(c.find(x => x.key === 'credit').weight, 4);
  assert.deepEqual(stressChanges(null, b), []);
});

test('chainFlips: last event per link in the window; links touching the book weigh more', () => {
  const log = [
    { id: 'chain-real-gold', event: 'started', at: '2026-11-03T10:00:00Z', label: 'Chain link broken: real yields → gold' },
    { id: 'chain-real-gold', event: 'cleared', at: '2026-11-03T12:00:00Z', label: 'Chain link broken: real yields → gold' },
    { id: 'chain-real-gold', event: 'started', at: '2026-11-03T15:00:00Z', label: 'Chain link broken: real yields → gold' },
    { id: 'chain-vix-hy', event: 'cleared', at: '2026-11-03T15:00:00Z', label: 'Chain link broken: fear → credit' },
    { id: 'chain-oil-bei', event: 'started', at: '2026-10-01T15:00:00Z' },
    { id: 'gauge-x', event: 'started', at: '2026-11-03T15:00:00Z' },
  ];
  const f = chainFlips(log, Date.parse('2026-11-02T00:00:00Z'), Infinity, ['GOLD']);
  assert.equal(f.length, 2);
  const g = f.find(x => x.key === 'real-gold');
  assert.equal(g.change, 'broke'); assert.equal(g.weight, 3.5); assert.match(g.title, /^real yields → gold: holding → broken/);
  assert.equal(f.find(x => x.key === 'vix-hy').change, 'healed');
});

test('whatChanged: ranked, summarised, and the window starts at the previous book', () => {
  const prevRun = run('2026-11-03', { biases: { USD: 1 }, cards: { EURUSD: { rating: 'SHORT', size: 0.3 } } });
  const curRun = run('2026-11-04', { biases: { USD: 0 }, cards: { EURUSD: { rating: 'LONG', size: 0.3 } } });
  const r = whatChanged({ prevRun, curRun, watchLog: [{ id: 'chain-dxy-gold', event: 'started', at: '2026-11-03T08:00:00Z' }, { id: 'chain-dxy-btc', event: 'started', at: '2026-11-02T08:00:00Z' }] });
  assert.equal(r.items[0].key, 'EURUSD');
  assert.deepEqual(r.summary, { book: 2, stress: 0, chain: 1 });
  assert.equal(r.prevDate, '2026-11-03');
  for (let i = 1; i < r.items.length; i++) assert.ok(r.items[i - 1].weight >= r.items[i].weight);
});

test('recordSnap / previousSnap: first look of the day wins, old days roll off, previous is strictly earlier', () => {
  let s = recordSnap({}, '2026-11-03', { overall: 'watch' });
  s = recordSnap(s, '2026-11-04', { overall: 'stress' });
  s = recordSnap(s, '2026-11-04', { overall: 'ok' });
  assert.equal(s['2026-11-04'].overall, 'stress');
  assert.equal(previousSnap(s, '2026-11-04').date, '2026-11-03');
  assert.equal(previousSnap(s, '2026-11-03'), null);
  let big = {}; for (let i = 1; i <= 20; i++) big = recordSnap(big, `2026-10-${String(i).padStart(2, '0')}`, { i }, 14);
  assert.equal(Object.keys(big).length, 14); assert.ok(!big['2026-10-01']);
  assert.equal(stressSnapOf({ ok: false }), null);
  assert.deepEqual(stressSnapOf({ ok: true, overall: 'ok', tiles: [{ id: 'a', label: 'A', level: 'ok', detail: 'd', extra: 1 }] }).tiles[0], { id: 'a', label: 'A', level: 'ok', detail: 'd' });
});

// ── per pair ──
test('legsOf / isFx / labels', () => {
  assert.deepEqual(legsOf('EURUSD'), ['EUR', 'USD']);
  assert.deepEqual(legsOf('GOLD'), [null, 'USD']);
  assert.equal(legsOf('FOO'), null);
  assert.deepEqual(legsOf('EURNOK'), ['EUR', 'NOK']); assert.deepEqual(legsOf('USDSEK'), ['USD', 'SEK']); assert.equal(oandaOf('USDNOK'), 'USD_NOK');   // prereg A13
  assert.equal(mentions('the krone and the euro', 'EURNOK', { loose: true }), true);
  assert.equal(isFx('USDJPY'), true); assert.equal(isFx('NQ'), false);
  assert.equal(pairLabel('GBPJPY'), 'GBP/JPY'); assert.equal(oandaOf('EURUSD'), 'EUR_USD'); assert.equal(oandaOf('GOLD'), 'XAU_USD'); assert.equal(oandaOf('NQ'), null);
});

test('mentions: FX spellings, whole words for assets, loose currency words only when asked', () => {
  assert.equal(mentions('Carry in EUR/USD after the ECB', 'EURUSD'), true);
  assert.equal(mentions('eurusd momentum', 'EURUSD'), true);
  assert.equal(mentions('EUR-USD and GBP_USD', 'GBPUSD'), true);
  assert.equal(mentions('Yahoo EURUSD=X closes', 'EURUSD'), true);
  assert.equal(mentions('EURUSDT stablecoin', 'EURUSD'), false);
  assert.equal(mentions('the euro against the dollar', 'EURUSD'), false);
  assert.equal(mentions('the euro against the dollar', 'EURUSD', { loose: true }), true);
  assert.equal(mentions('Gold and real yields', 'GOLD'), true);
  assert.equal(mentions('goldman sachs', 'GOLD'), false);
  assert.equal(mentions('', 'GOLD'), false);
});

test('researchFor: proposals by text or universe, papers by text, newest first', () => {
  const library = [{ id: 'a', title: 'Yen carry crash', lastSeen: '2026-11-01', rules: { universe: ['USDJPY'] } }, { id: 'b', title: 'USD/JPY skew', lastSeen: '2026-11-03' }, { id: 'c', title: 'Gold', lastSeen: '2026-11-04' }];
  const papers = [{ title: 'Carry trades and USDJPY', year: 2019 }, { title: 'Momentum', year: 2024 }];
  const r = researchFor('USDJPY', { library, papers });
  assert.deepEqual(r.proposals.map(p => p.id), ['b', 'a']);
  assert.equal(r.papers.length, 1);
});

test('rowFor / crowdFor / rateGap', () => {
  assert.equal(rowFor([{ pair: 'EUR/USD', x: 1 }, { inst: 'GOLD', x: 2 }], 'EURUSD').x, 1);
  assert.equal(rowFor([{ inst: 'GOLD', x: 2 }], 'GOLD').x, 2);
  assert.equal(rowFor(null, 'GOLD'), null);
  assert.deepEqual(crowdFor({ instruments: { EUR_USD: { latest: [0, 1.1, 62.3], change24h: { delta: -1 } } } }, 'EURUSD'), { long: 62.3, d24: -1 });
  const g = rateGap('EURUSD', { rd: { byCcy: { EUR: { latestRate: 2.27, z: -0.08 }, USD: { latestRate: 4.3, z: 0.5 } } }, ry: { byCcy: { EUR: { latestReal: -0.28 }, USD: { latestReal: 1.1 } } }, policy: { EUR: { rate: 2.5 }, USD: { rate: 4 } } });
  assert.equal(g.short, -2.03); assert.equal(g.real, -1.38); assert.equal(g.policy, -1.5); assert.equal(g.y10, null);
  assert.equal(rateGap('GOLD', {}), null);
});

// ── transmission statistics (js/terminal/chainStatsView.js) and expectations vs reality (js/terminal/reactionPanel.js) ──
import { linkStatsHtml, breakingHtml, lagBars } from './chainStatsView.js';
import { reactionsHtml } from './reactionPanel.js';

test('chain stats view: the tap-card block, the breaking-down list, always labelled context not signal', () => {
  const lags = Array.from({ length: 11 }, (_, i) => ({ lag: i - 5, r: i === 5 ? -0.4 : i === 7 ? 0.2 : 0.01, n: 500 }));
  const s = { ok: true, n: 500, asOf: '2026-11-03', corr: { 20: { now: -0.1, then: -0.5, avg2y: -0.4 }, 60: { now: -0.05, then: -0.4, avg2y: -0.45 }, 120: { now: -0.3, then: -0.4, avg2y: -0.42 } },
    trend: 'breaking down', trendDelta: -0.35, textbookSign: 'holds on average', leadLag: { lags, band: 0.126, n: 500, text: 'the upstream end leads by 2 days' },
    divergence: { 20: { win: 20, fromMove: 25, toMove: 1.2, implied: -3, z: 2.3 } }, z: 2.3, line: 'Real yield up 25bp in 20 days, but Gold rose 1.2% where the usual link implies -3.0%: 2.3σ away from the usual link.' };
  const html = linkStatsHtml(s);
  assert.match(html, /Transmission statistics/); assert.match(html, /breaking down/); assert.match(html, /context, not a signal/); assert.match(html, /2\.3σ away/); assert.match(html, /not a forecast/);
  assert.equal((lagBars(lags, 0.126).match(/<rect/g) ?? []).length, 11);
  assert.match(lagBars(lags, 0.126), /var\(--gold\)/, 'the lag clearing the band is marked');
  assert.match(linkStatsHtml({ ok: false, why: 'no daily history for Funding' }), /no daily history/);
  assert.equal(linkStatsHtml(null), '');
  const b = breakingHtml({ ok: true, day: '2026-11-04', note: 'Context, not a signal.', breaking: [{ id: 'real-gold', short: 'real yields → gold', trend: 'breaking down', corr60: -0.05, then60: -0.4, avg60: -0.45 }], divergences: [{ id: 'real-gold', z: 2.6, win: 20, line: 'x <y>', alert: true }] });
  assert.match(b, /Links breaking down/); assert.match(b, /data-act="link" data-id="real-gold"/); assert.match(b, /x &lt;y&gt;/); assert.match(b, /Diverging today/);
  assert.equal(breakingHtml(null), '');
});

test('reactions panel: live and study rows, labels, the family table and the note', () => {
  const p = { ok: true, studyN: 150, note: 'History with its count, not a forecast.', recent: [
    { source: 'live', ms: Date.UTC(2026, 10, 6, 13, 30), country: 'US', event: 'CPI m/m', surprise: { diffText: '+0.1pp', z: 1.2 }, label30: 'overreaction', regime: { tone: 'normal', stress: 'watch' }, markets: [{ id: 'zt', label: 'US 2y note', unit: '%', m30: -0.3, exp30: -0.1 }] },
    { source: 'study', ms: Date.UTC(2026, 9, 3, 12, 30), family: 'NFP', event: 'Non-farm payrolls', surprise: { diff: -68000 }, label30: 'opposite', label240: 'in line', markets: [{ id: 'zt', label: 'US 2y note', m30: 0.06, m240: -0.1, exp240: -0.11 }] }],
    summary: [{ family: 'ALL', regime: 'all', n: 151, live: 1, m30: { expected: 0.67, nDirectional: 27, pricedIn: 0.17, nClear: 23, labels: { 'in line': 80, overreaction: 10 } }, m240: { expected: 0.64, pricedIn: 0.26 } },
      { family: 'ALL', regime: 'calm', n: 60, m30: { expected: 0.7, pricedIn: 0.1 }, m240: {} }] };
  const html = reactionsHtml(p);
  assert.match(html, /Expectations vs reality/); assert.match(html, /overreaction/); assert.match(html, /US 2y note <b class="mono">-0\.30%<\/b> <span class="muted mono">vs -0\.10<\/span>/);
  assert.match(html, />live</); assert.match(html, />study</); assert.match(html, /-68000/); assert.match(html, /All families/); assert.match(html, /<b>calm<\/b> 60 releases/);
  assert.match(html, /not a forecast/);
  assert.equal(reactionsHtml({ ok: false }), '');
});
