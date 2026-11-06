// Pure logic behind the Desk Terminal's Chain, Changed and Pair tabs (js/terminal/*.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ohlcAscending, fundingSpread, gapSeries, chainVals, chainLinks, chainSvg, chainSnapshot, termPremiumSplit, summariseChain, CHAIN_LAYOUT } from './chainBoard.js';
import { bookOf, diffBooks, stressChanges, chainFlips, whatChanged, recordSnap, previousSnap, stressSnapOf } from './whatChanged.js';
import { legsOf, isFx, pairLabel, oandaOf, mentions, researchFor, rowFor, crowdFor, rateGap } from './pairView.js';
import * as NV from './newsView.js';

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

// ── what drives a card (the modal's explainer) ──
import { channels, cardDrivers } from './cardExplain.js';
test('cardDrivers: points on the market, its legs and risk appetite, signed onto the market; stale feeds named', () => {
  assert.deepEqual(channels('EURUSD').map(c => `${c.key}${c.sign > 0 ? '+' : '-'}`), ['EURUSD+', 'EUR+', 'USD-']);
  assert.deepEqual(channels('GOLD').map(c => c.key), ['GOLD', 'USD']);
  assert.deepEqual(channels('NQ').map(c => c.key), ['NQ', 'RISK']);
  const run = { date: '2026-11-04', packBuiltAt: '2026-11-04T06:42:00Z', finishedAt: '2026-11-04T07:13:00Z',
    head: { book: { instruments: { EURUSD: { rating: 'SHORT', conviction: 'low', levels: { open: 1.1 }, plan: { invalidation: 'Close above 1.1234' } } } } },
    dataQuality: { gaps: [{ id: 'credit-stress', skill: 'credit_funding', status: 'stale', ageH: 102.7 }, { id: 'world-rates', skill: 'rates_cb', status: 'stale', ageH: 1542 }] },
    analysts: {
      rates_cb: { ok: true, layer: 'currency', report: { confidence: 'high', points: [{ claim: 'Fed hawkish', evidence: 'fomc-latest', impact: { USD: 2 } }, { claim: 'ECB on hold', evidence: 'world-rates', impact: { EUR: 1 } }] } },
      credit_funding: { ok: true, layer: 'global', report: { points: [{ claim: 'Funding stress', evidence: 'credit-stress', impact: { RISK: -1 } }] } },
      cot_positioning: { ok: true, report: { points: [{ claim: 'EUR shorts crowded', evidence: 'cot-state', impact: { EUR: -1, GBP: 1 } }] } },
      failed: { ok: false },
    } };
  const x = cardDrivers(run, 'EURUSD');
  assert.equal(x.dir, -1); assert.deepEqual(x.analysts.map(a => a.id), ['rates_cb', 'cot_positioning'], 'RISK does not move an FX pair; failed analysts are skipped');
  const rc = x.analysts[0];
  assert.equal(rc.net, -1, 'USD +2 pushes EURUSD down 2, EUR +1 up 1'); assert.equal(rc.forN, 1); assert.equal(rc.againstN, 1);
  assert.deepEqual(rc.points.find(p => p.evidence === 'world-rates').staleFeeds, ['world-rates (stale, 1542h)']);
  assert.equal(x.forPush, 3); assert.equal(x.againstPush, 1);
  assert.deepEqual(x.data.gaps.map(g => g.id), ['world-rates'], 'only the gaps of the analysts that moved it');
  assert.equal(x.data.linesFor, '2026-11-04'); assert.equal(x.invalidation, 'Close above 1.1234');
  assert.equal(cardDrivers({}, 'EURUSD').analysts.length, 0);
});

// ── memory in prices (js/terminal/autocorrView.js) ──
import * as ACV from './autocorrView.js';
test('autocorrelation view: board, pair card, bars, always description not a signal', () => {
  const lag = (r, sig = false) => Array.from({ length: 10 }, (_, i) => ({ lag: i + 1, r: i ? 0.01 : r, se: 0.02, sig: !i && sig }));
  const row = (id, word, r1) => ({ id, ok: true, n: 3290, from: '2014-01-02', to: '2026-08-21', ret: lag(r1, word === 'reverts'), vol: lag(0.2), bandRetZ: 2.81, bandAbs: 0.049, volLags: 10,
    vr: { 5: { vr: 0.86, z: -1.9, p: 0.06 }, 20: { vr: 0.79, z: -1.4, p: 0.15 } }, halves: [{ acf1: -0.11 }, { acf1: -0.09 }], recent: { acf1: 0.12 }, reading: { word, line: `${id} line <x>` } });
  const d = { ok: true, label: 'Description, not a signal.', summary: { markets: 2, trends: 0, reverts: 1, unstable: 0, noMemory: 1 }, rows: [row('NQ', 'reverts', -0.097), row('EURUSD', 'no memory', 0.001), { id: 'BAD', ok: false, reading: { word: 'no data', line: 'short' } }], errors: { US30: 'HTTP 500' } };
  const b = ACV.boardHtml(d);
  assert.match(b, /Memory in prices/); assert.match(b, /data-pair="NQ"/); assert.doesNotMatch(b, /data-pair="BAD"/); assert.match(b, /not a signal/); assert.match(b, /Not loaded: US30/);
  assert.match(b, /NQ line &lt;x&gt;/); assert.match(b, /1 revert/);
  assert.match(ACV.lagBars(d.rows[0], 'ret'), /var\(--gold\)/, 'a lag clearing its band is gold');
  assert.equal((ACV.lagBars(d.rows[0], 'vol').match(/<rect/g) ?? []).length, 10);
  assert.match(ACV.pairCard(d, 'nq'), /reverts/); assert.match(ACV.pairCard(d, 'nq'), /quick test/);
  assert.match(ACV.pairCard(d, 'GBPUSD'), /not on the autocorrelation board/);
  assert.match(ACV.boardHtml({ ok: false, error: 'boom' }), /boom/); assert.equal(ACV.boardHtml(null), ''); assert.equal(ACV.pairCard(null, 'NQ'), '');
});

// ── who leads whom (js/terminal/leadLagView.js) ──
import * as LLV from './leadLagView.js';
test('lead-lag view: leads, near misses, grid, pair card; same day is not a lead', () => {
  const x = (lead, follow, o = {}) => ({ lead, follow, k: 1, r: 0.06, z: 4, p: 0.001, n: 3000, sameDay: 0.5, halves: [0.05, 0.07], lags: [0.06, 0, 0, 0, 0], survivedBH: true, halvesAgree: true, isLead: true, ...o });
  const L = x('AUDUSD', 'NZDUSD'), N = x('GOLD', 'EURUSD', { r: -0.03, p: 0.4, survivedBH: false, isLead: false, halves: [0.01, -0.05] });
  const d = { ok: true, ids: ['AUDUSD', 'NZDUSD', 'GOLD', 'EURUSD'], labels: {}, tested: 12, lags: 5, from: '2014-07-10', to: '2026-08-21', leads: [L], near: [N], leadKeys: ['AUDUSD>NZDUSD'],
    matrix: { AUDUSD: { NZDUSD: 0.06, GOLD: 0, EURUSD: 0.01 }, NZDUSD: { AUDUSD: 0.01 }, GOLD: { EURUSD: -0.03 }, EURUSD: {} }, byMarket: { NZDUSD: { ledBy: [L], leads: [] } }, label: 'Description, not a signal.', errors: {} };
  const g = LLV.gridHtml(d);
  assert.match(g, /Who leads whom/); assert.match(g, /1 lead<\/b>/); assert.match(g, /data-pair="NZDUSD"/); assert.match(g, /near miss/); assert.match(g, /not a lead/); assert.match(g, /not a signal/);
  assert.match(LLV.heatGrid(d), /outline:2px solid var\(--gold\)/); assert.equal((LLV.heatGrid(d).match(/<tr>/g) ?? []).length, 5);
  assert.match(LLV.pairCard(d, 'nzdusd'), /AUDUSD today → NZDUSD 1 day later/); assert.match(LLV.pairCard(d, 'USDJPY'), /not on the lead-lag grid/);
  assert.match(LLV.gridHtml({ ...d, leads: [], leadKeys: [] }), /No market reliably leads another/);
  assert.equal(LLV.gridHtml(null), ''); assert.match(LLV.gridHtml({ ok: false, error: 'x' }), /x/);
});

// ── the Options tab (js/terminal/optionsView.js) ──
import * as OPV from './optionsView.js';
test('options view: gauges read against own history, lines carry evidence words, dealers, VIX, path, pair card', () => {
  const hist = { markets: { 'EUR/USD': Array.from({ length: 60 }, (_, i) => ({ date: `2026-08-${String(i % 28 + 1).padStart(2, '0')}`, pc: 1 + i / 100, calls: 1000 + i, puts: 1500 + 2 * i })) },
    vix: { vix: Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, value: 15 + i / 3 })), vix3m: Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, value: 20 })) } };
  const st = OPV.pcStats(hist.markets['EUR/USD']); assert.equal(st.pct, 100); assert.equal(OPV.pcRead(st).word, 'puts much heavier than usual');
  assert.equal(OPV.pcRead(OPV.pcStats([{ pc: 1 }])).word, 'short history');
  const oi = { ok: true, pairs: [{ pair: 'EUR/USD', spot: 1.1234, pcRatio: 1.59, regime: 'BREAKOUT', dte: 2, callWall: 1.1258, putWall: 1.1233, maxPain: 1.1383,
    levels: [{ price: 1.1383, type: 'max_pain', distPips: 149 }, { price: 1.1258, type: 'call_wall', tier: 'moderate', distPips: 24, touchPct: 41 }, { price: 1.1183, type: 'put_wall', distPips: -51, touchPct: 8 }] }] };
  const pos = OPV.positioningHtml(oi, hist);
  assert.match(pos, /data-pair="EURUSD"/); assert.match(pos, /<b class="dn">1<\/b> lean to puts/); assert.match(pos, /UNTESTED/); assert.match(pos, /no natural 50\/50/);
  assert.match(OPV.gaugeSvg(1), /<line x1="75"/, 'needle drawn'); assert.doesNotMatch(OPV.gaugeSvg(null), /stroke-width="3"/, "no needle without data");
  const lad = OPV.ladderHtml(oi.pairs[0]);
  assert.match(lad, /Price now/); assert.match(lad, /Max pain/); assert.match(lad, /41%/); assert.match(lad, /NULL/);
  assert.ok(lad.indexOf('Call wall') < lad.indexOf('Price now') && lad.indexOf('Put wall') > lad.indexOf('Price now'), 'above the price, then below');
  const dl = OPV.dealersHtml({ ok: true, markets: [{ pair: 'NAS100_USD', name: 'Nasdaq 100', state: 'speeds', switchPoint: 29222, switchDistPct: 2.64, flowUp1pct: 9797, flowDown1pct: -13481, lines: ['a', 'b', 'c', 'd', 'expect wide moves'] }] });
  assert.match(dl, /hedging speeds moves/); assert.match(dl, /data-pair="NQ"/); assert.match(dl, /range only/);
  const vx = OPV.vixHtml(hist); assert.match(vx, /VIX 3-month/); assert.match(vx, /backwardation: fear is NOW/);
  const sm = { ok: true, instruments: ['GOLD', 'NQ'], series: Array.from({ length: 70 }, (_, i) => [new Date(Date.UTC(2026, 7, 1) + i * 864e5).toISOString().slice(0, 10), 4000 + i]), livePrice: { price: 4070 },
    expiries: [{ expiry: '2026-11-24', date: '2026-11-24', dte: 21, zones: [{ px: 4200, oi: 12000, call: 9000, put: 3000 }, { px: 3900, oi: 6000, call: 100, put: 5900 }] }],
    paths: [{ name: 'Bounce first', prob: 0.45, points: [{ date: '2026-10-09', px: 4069 }, { date: '2026-11-19', px: 4275 }] }], pull: { summary: 'leans up' } };
  sm.state = { date: '2026-10-08', close: 4069, sigmaDailyPct: 1.5 }; sm.expiries.push({ expiry: '2026-12-29', dte: 56, totalOI: 3000, zones: [{ px: 3950, oi: 3000, call: 100, put: 2900 }] }); sm.expiries[0].totalOI = 18000;
  const walk = OPV.zoneWalk(sm.expiries, { close: 4070, anchor: 'strike', includeThin: true, vol: OPV.walkVol(sm), date: '2026-10-08' });
  assert.equal(walk.points.length, 2); assert.equal(walk.points[0].px, 4200); assert.equal(walk.points[1].dir, 'down');
  const ph = OPV.pathHtml(sm, 'GOLD', { walk, anchor: 'strike' });
  assert.match(ph, /opt-walk-spark/, 'the spark runs along the walk'); assert.match(ph, />21d</); assert.match(ph, />56d</); assert.match(ph, /24 Nov/);
  assert.match(ph, /strongest strike/); assert.match(ph, /NULL/); assert.match(ph, /<option selected>GOLD/); assert.match(ph, /▲ 4,200/); assert.match(ph, /▼ 3,950/);
  assert.match(OPV.pathHtml(sm, 'GOLD', { walk, anchor: 'gammaCentre' }), /UNDERPOWERED/);
  // sources (owner 2026-11-06): a selector for gold, every row and dot labelled, the as-of lines and the honesty line
  assert.match(ph, /id="opt-path-src"/); assert.match(ph, /GLD \(Cboe\)/); assert.match(ph, /opt-walk-src[^>]*>CME</);
  assert.match(ph, /More expiries fill the picture; they do not make the pull a tested signal\./);
  assert.doesNotMatch(ph, /data-wopt="volOv"/, 'no volume overlay on the CME source');
  assert.doesNotMatch(OPV.pathHtml({ ...sm, instruments: ['EURUSD'] }, 'EURUSD', { walk, anchor: 'strike' }), /opt-path-src/, 'FX has no Cboe book');
  const smc = { ...sm, expiries: sm.expiries.map((e, i) => ({ ...e, source: i ? 'cme' : 'cboe', sourceLabel: i ? 'CME' : 'GLD', volCentre: { px: 4150, volume: 900 } })),
    pathSource: { selected: 'combined', cboe: { label: 'GLD', ratio: 10.92, xauSpot: 4073, spot: 373, ozPerContract: 9.16, xauAt: 'OANDA at the quote time' },
      asOf: [{ label: 'CME', oi: 'OI as of 2026-11-06 (nightly CME capture)' }, { label: 'GLD', oi: 'OI as of 2026-11-05 (prior day, OCC)', greeks: 'greeks as of 19:04 UTC (15-min delayed)' }] } };
  const wc = OPV.zoneWalk(smc.expiries, OPV.walkOptsFor(smc, 'strike', { ...OPV.WALK_OPTS_DEFAULT, volOv: true }));
  const pc = OPV.pathHtml(smc, 'GOLD', { walk: wc, anchor: 'strike', o: { ...OPV.WALK_OPTS_DEFAULT, volOv: true } });
  assert.match(pc, /<option value="combined" selected>/); assert.match(pc, /OI as of 2026-11-05 \(prior day, OCC\)/); assert.match(pc, /greeks as of 19:04 UTC \(15-min delayed\)/);
  assert.match(pc, /src-cboe/, 'Cboe dot drawn as a diamond'); assert.match(pc, /opt-walk-src[^>]*>GLD</); assert.match(pc, /data-wopt="volOv" checked/);
  assert.match(pc, /opt-walk-vol/); assert.match(pc, /descriptive, untested/); assert.match(pc, /strikes × 10\.920/);
  assert.equal(OPV.walkOptsFor(sm, 'strike').maxDte, 200, 'the path reads out to the 200-day horizon');
  assert.match(OPV.pairCard('EURUSD', { oi, hist }), /puts per call/); assert.match(OPV.pairCard('NZDUSD', { oi, hist }), /No listed options book/);
  assert.equal(OPV.idOf('XAU/USD'), 'GOLD'); assert.equal(OPV.idOf('SPX500_USD'), 'SPX500');
});

// ── news (js/terminal/newsView.js) ──
const NOW = Date.UTC(2026, 10, 5, 13, 0);
const NEWS = [
  { id: 'a', title: 'BoE hikes to 4% <b>', link: 'https://www.fxstreet.com/news/boe', ms: NOW - 30 * 60e3, source: 'FXStreet', sources: ['FXStreet', 'Reuters'], touches: ['GBP'], topic: 'central bank', tier: 2,
    read: { tier: 1, impact: { GBP: 2 }, why: 'GBP strength' }, pairs: [{ inst: 'GBPUSD', dir: 2, card: 'SHORT', stance: 'against' }, { inst: 'GBPAUD', dir: 2, card: 'LONG', stance: 'supports' }, { inst: 'EURGBP', dir: -2, card: null, stance: null }],
    react: { m5: { label: 'with', units: 0.9, n: 3 }, m30: { label: 'against', units: -0.7, n: 3 } } },
  { id: 'b', title: 'Gold miners rally', link: 'javascript:alert(1)', ms: NOW - 2 * 3600e3, source: 'Yahoo', touches: ['GOLD'], topic: 'other', tier: 3 },
  { id: 'c', title: 'US payrolls beat', link: 'https://example.com/nfp?a=1&b=2', ms: NOW - 8 * 3600e3, source: 'ForexLive', touches: ['USD'], tier: 1, read: { tier: 1, impact: { USD: 1, EQUITIES: -1 } } },
  { id: 'd', title: 'Oil slips on supply', link: 'https://e.com/oil', ms: NOW - 26 * 3600e3, source: 'MarketWatch', touches: ['OIL'], tier: 2, read: { tier: 2, impact: { OIL: -1 } } },
  { id: 'a', title: 'duplicate of a', ms: NOW - 31 * 60e3, tier: 1 },
];

test('newsView.filterNews: tier, keys, book, search; newest first, de-duplicated', () => {
  assert.deepEqual(NV.filterNews(NEWS).map(h => h.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(NV.filterNews(NEWS, { tier: 1 }).map(h => h.id), ['a', 'c'], 'the read tier wins over the feed tier');
  assert.deepEqual(NV.filterNews(NEWS, { tier: 2 }).map(h => h.id), ['a', 'c', 'd']);
  assert.deepEqual(NV.filterNews(NEWS, { keys: ['USD'] }).map(h => h.id), ['c']);
  assert.deepEqual(NV.filterNews(NEWS, { keys: ['EQUITIES'] }).map(h => h.id), ['c'], 'an impact key counts like a touch');
  assert.deepEqual(NV.filterNews(NEWS, { keys: ['GOLD', 'OIL'] }).map(h => h.id), ['b', 'd']);
  assert.deepEqual(NV.filterNews(NEWS, { onlyBook: true }).map(h => h.id), ['a']);
  assert.deepEqual(NV.filterNews(NEWS, { q: 'reuters boe' }).map(h => h.id), ['a'], 'every word, across title and sources');
  assert.deepEqual(NV.filterNews(NEWS, { q: 'GBP strength' }).map(h => h.id), ['a'], 'the read is searched too');
  assert.deepEqual(NV.filterNews([], {}), []); assert.deepEqual(NV.filterNews(null), []);
});

test('newsView.topStories: tier 1 in the last 6 hours only', () => {
  assert.deepEqual(NV.topStories(NEWS, NOW).map(h => h.id), ['a']);
  assert.deepEqual(NV.topStories(NEWS, NOW, { hours: 9 }).map(h => h.id), ['a', 'c']);
  assert.match(NV.topStripHtml([], NOW), /No tier-1 headlines/);
});

test('newsView.marketNews: pairs[] first, else base/quote from the read; indices, gold and oil by asset key', () => {
  const g = NV.marketNews(NEWS, 'GBPUSD');
  assert.deepEqual(g.map(x => [x.h.id, x.dir, x.stance]), [['a', 2, 'against'], ['c', -1, null]], 'a USD headline bears on GBPUSD through its quote');
  const eu = NV.marketNews(NEWS, 'EURUSD', { rating: 'LONG' });
  assert.deepEqual(eu.map(x => [x.h.id, x.dir, x.stance]), [['c', -1, 'against']], 'USD up = EURUSD down, against a long card');
  assert.deepEqual(NV.marketNews(NEWS, 'NQ', { rating: 'SHORT' }).map(x => [x.h.id, x.dir, x.stance]), [['c', -1, 'supports']]);
  assert.deepEqual(NV.marketNews(NEWS, 'WTI').map(x => x.h.id), ['d']);
  assert.deepEqual(NV.marketNews(NEWS, 'GOLD').map(x => x.h.id), [], 'tier-3 gold chatter is left out of the card');
  assert.deepEqual(NV.marketNews(NEWS, 'GOLD', { tier: 3 }).map(x => [x.h.id, x.dir]), [['b', 0]]);
  assert.equal(NV.marketNews(NEWS, 'GBPJPY', { n: 5 }).length, 1);
  assert.deepEqual(NV.newsKeysFor('EURUSD'), ['EUR', 'USD']); assert.deepEqual(NV.newsKeysFor('SPX500'), ['EQUITIES']); assert.deepEqual(NV.newsKeysFor('COPPER'), []);
});

test('newsView HTML: escaped, links only http(s) with target=_blank rel=noopener, arrows, stances, reaction', () => {
  const html = NV.listHtml(NV.filterNews(NEWS), { now: NOW });
  assert.match(html, /BoE hikes to 4% &lt;b&gt;/); assert.doesNotMatch(html, /4% <b>/);
  assert.doesNotMatch(html, /javascript:/i, 'a non-http link is never rendered');
  assert.match(html, /href="https:\/\/example\.com\/nfp\?a=1&amp;b=2" target="_blank" rel="noopener"/);
  const links = html.match(/<a [^>]*>/g); assert.ok(links.length >= 3); for (const a of links) assert.match(a, /target="_blank" rel="noopener"/);
  assert.match(html, /GBP ↑↑/); assert.match(html, /USD ↑</); assert.match(html, /Equities ↓/);
  assert.match(html, /GBPUSD ↑↑ <b>against your card<\/b>/); assert.match(html, /GBPAUD ↑↑ <b>supports your card<\/b>/);
  assert.match(html, /5m: moved with the read/); assert.match(html, /30m: moved against the read/);
  assert.match(html, />12:30</, 'London time'); assert.match(html, />Wed 11:00</, 'an earlier day carries its weekday');
  assert.match(html, /FXStreet, Reuters/);
  assert.match(NV.listHtml([], {}), /No headlines match/);
  assert.equal(NV.safeHref(' https://a.b/c '), 'https://a.b/c'); assert.equal(NV.safeHref('data:text/html,x'), null); assert.equal(NV.safeHref('//evil.com'), null); assert.equal(NV.safeHref('https://a.b/"onmouseover=x'), null);
});

test('newsView.pairCard / latestLine / filtersHtml', () => {
  const c = NV.pairCard(NEWS, 'GBPUSD', { rating: 'SHORT', now: NOW, name: 'GBP/USD' });
  assert.match(c, /Latest news for GBP\/USD/); assert.match(c, /GBPUSD ↑↑/); assert.match(c, /against your card/); assert.match(c, /data-news-more="GBPUSD"/);
  assert.match(c, /href="https:\/\/www\.fxstreet\.com\/news\/boe" target="_blank" rel="noopener"/);
  assert.match(NV.pairCard(NEWS, 'COPPER', { now: NOW }), /no read key/);
  assert.match(NV.pairCard([], 'EURUSD', { now: NOW }), /No tier-1\/2 headlines/);
  assert.match(NV.latestLine(NEWS, 'GBPAUD'), /latest:<\/span> BoE hikes to 4% &lt;b&gt;/);
  assert.equal(NV.latestLine(NEWS, 'COPPER'), '');
  const f = NV.filtersHtml({ tier: 1, keys: ['EUR', 'USD'], market: 'EURUSD', onlyBook: true, q: '"x"' });
  assert.match(f, /data-nt-tier="1" aria-pressed="true"/); assert.match(f, /data-nt-key="EUR" aria-pressed="true"/); assert.match(f, /data-nt-key="GBP" aria-pressed="false"/);
  assert.match(f, /data-nt-book checked/); assert.match(f, /value="&quot;x&quot;"/); assert.match(f, /EURUSD/);
  for (const k of ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'EQUITIES', 'GOLD', 'OIL']) assert.match(f, new RegExp(`data-nt-key="${k}"`));
});
