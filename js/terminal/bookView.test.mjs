// The book as decision support (js/terminal/bookView.js, scenarioMap.js, bookIntel.js, rankReality.js).
//   node --test js/terminal/bookView.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as BV from './bookView.js';
import { netExposure } from '../deskExposure.js';
import { scenarioMatrix, matrixHtml, worstRow, cellBg } from './scenarioMap.js';
import { bookIntel } from './bookIntel.js';
import { rankRows, rankHistory, rankTableHtml, rankHeatHtml, rankColour } from './rankReality.js';
import { rankCorr } from '../thesisReality.js';

const card = (rating, size, extra = {}) => ({ rating, conviction: 'medium', why: '', size, ...extra });
// three JPY crosses all short JPY (long the cross), one card against its currencies' view (EURAUD), a commodity, an
// index, a flat card and a zero-size card
const BOOK = {
  EURJPY: card('LONG', 1), GBPJPY: card('LONG', 0.5), AUDJPY: card('STRONG_LONG', 0.4), EURAUD: card('LONG', 0.3),
  EURUSD: card('SHORT', 0.25), GOLD: card('LONG', 0.5), NQ: card('SHORT', 1), USDCAD: card('FLAT', 1), EURGBP: card('SHORT', 0),
};
const VIEW = { USD: { bias: 1, why: 'rates' }, EUR: { bias: -1, why: 'soft ECB <script>' }, GBP: { bias: 1 }, JPY: { bias: -1, conviction: 'medium', why: 'BoJ dovish' }, AUD: { bias: 1 }, CAD: { bias: 0 } };
// /api/desk-risk's corr block: direction × correlation; the three JPY crosses move together
const CORR = { names: ['EURJPY', 'GBPJPY', 'AUDJPY', 'EURUSD'], weights: [1, 0.5, 0.6, -0.25],
  m: [[1, 0.9, 0.9, 0], [0.9, 1, 0.9, 0], [0.9, 0.9, 1, 0], [0, 0, 0, 1]] };
const RISK = { ok: true, days: 60, cards: 6, effectiveBets: 3.2, corr: CORR, bets: [{ lead: 'EURJPY', cards: ['EURJPY', 'GBPJPY', 'AUDJPY'], weight: 2.1 }] };

test('liveCards keeps cards with a direction and a size, largest first', () => {
  assert.deepEqual(BV.liveCards(BOOK).map(([n]) => n), ['EURJPY', 'NQ', 'GBPJPY', 'GOLD', 'AUDJPY', 'EURAUD', 'EURUSD']);
});

test('exposureRows: the same net as the exposure cap (netExposure), indices on their own EQUITY line', () => {
  const rows = BV.exposureRows(BOOK), by = Object.fromEntries(rows.map(r => [r.key, r]));
  const { net } = netExposure(BOOK);
  for (const k of ['USD', 'EUR', 'GBP', 'JPY', 'AUD']) assert.equal(by[k].net, net[k], k);
  // JPY: EURJPY −1, GBPJPY −0.5, AUDJPY −1.5×0.4 = −0.6 → −2.1; USD: EURUSD short +0.25, gold long −0.5 → −0.25
  assert.equal(by.JPY.net, -2.1); assert.equal(by.JPY.gross, 2.1); assert.equal(by.USD.net, -0.25); assert.equal(by.USD.gross, 0.75);
  assert.equal(by.EUR.net, 1.05); assert.equal(by.EUR.long, 1.3); assert.equal(by.EUR.short, -0.25);
  assert.equal(by.EQUITY.net, -1); assert.deepEqual(by.EQUITY.cards.map(c => c.name), ['NQ']);
  assert.equal(rows[0].key, 'JPY');   // sorted by |net|
  assert.ok(!by.CAD);                 // the flat USDCAD adds nothing
});

test('flowLegs: construction splits the size across the legs; gross puts the full units on every exposure leg', () => {
  assert.deepEqual(BV.flowLegs('EURJPY', BOOK.EURJPY), [{ leg: 'EUR', side: 1, w: 0.5 }, { leg: 'JPY', side: -1, w: 0.5 }]);
  assert.deepEqual(BV.flowLegs('EURJPY', BOOK.EURJPY, 'gross'), [{ leg: 'EUR', side: 1, w: 1 }, { leg: 'JPY', side: -1, w: 1 }]);
  assert.deepEqual(BV.flowLegs('AUDJPY', BOOK.AUDJPY, 'gross').map(l => +l.w.toFixed(2)), [0.6, 0.6]);
  assert.deepEqual(BV.flowLegs('GOLD', BOOK.GOLD, 'gross'), [{ leg: 'USD', side: -1, w: 0.5 }]);
  assert.deepEqual(BV.flowLegs('NQ', BOOK.NQ, 'gross'), [{ leg: 'EQUITY', side: -1, w: 1 }]);
  assert.deepEqual(BV.flowLegs('NQ', BOOK.NQ), [{ leg: 'USD', side: 0, w: 1 }]);
  assert.deepEqual(BV.flowLegs('USDCAD', BOOK.USDCAD), []);
});

test('viewCheck: a pair against what its two biases imply is "against"; equal biases "no view"; non-FX n/a', () => {
  const ck = BV.viewCheck(BOOK, VIEW);
  assert.equal(ck.EURJPY.status, 'no view');   // EUR −1, JPY −1
  assert.equal(ck.GBPJPY.status, 'agrees');    // GBP +1 over JPY −1 → long
  assert.equal(ck.EURUSD.status, 'agrees');    // EUR −1 under USD +1 → short, card short
  assert.equal(ck.EURAUD.status, 'against');   // EUR −1 under AUD +1 → short, card long
  assert.equal(ck.GOLD.status, 'n/a'); assert.equal(ck.NQ.status, 'n/a');
  assert.equal(BV.impliedByBiases('EURNOK', VIEW), -1);   // NOK has no ruling: the EUR leg alone
  assert.equal(BV.impliedByBiases('USDSEK', {}), 0);
  const t = BV.viewTally(ck);
  assert.deepEqual({ judged: t.judged, agree: t.agree, against: t.against, noView: t.noView, notFx: t.notFx }, { judged: 4, agree: 3, against: ['EURAUD'], noView: ['EURJPY'], notFx: 2 });
});

test('subsetBets: (Σ|w|)² / w\'Cw over the cards named; null with fewer than two in the corr block', () => {
  const b = BV.subsetBets(CORR, ['EURJPY', 'GBPJPY', 'AUDJPY']);
  // Σ|w| = 2.1; w'Cw = 1 + .25 + .36 + 2×.9×(.5 + .6 + .3) = 4.13 → 4.41 / 4.13
  assert.equal(b.bets, +(4.41 / 4.13).toFixed(2)); assert.equal(b.of, 3);
  assert.equal(BV.subsetBets(CORR, ['EURJPY', 'GOLD']), null);
  assert.equal(BV.subsetBets(null, ['EURJPY', 'GBPJPY']), null);
  // two independent equal cards are two bets
  assert.equal(BV.subsetBets({ names: ['A', 'B'], weights: [1, -1], m: [[1, 0], [0, 1]] }, ['A', 'B']).bets, 2);
});

test('concentration: three or more cards on the same side of one leg, with their independent bets and the risk cluster', () => {
  const fl = BV.concentration(BOOK, RISK);
  assert.equal(fl.length, 1);
  assert.deepEqual({ ccy: fl[0].ccy, side: fl[0].side, units: fl[0].units }, { ccy: 'JPY', side: -1, units: 2.1 });
  assert.deepEqual(fl[0].cards.sort(), ['AUDJPY', 'EURJPY', 'GBPJPY']);
  assert.equal(fl[0].bets.bets, 1.07); assert.equal(fl[0].cluster.lead, 'EURJPY');
  assert.match(BV.flagText(fl[0], { days: 60 }), /^3 cards short JPY \(2\.1 units\), ~1\.07 independent bets on the last 60 sessions' correlations: /);
  assert.equal(BV.concentration(BOOK, null)[0].bets, null);
  assert.equal(BV.concentration(BOOK, null, { min: 4 }).length, 0);
});

test('currencyDetail: long and short contributors, which add to the net and which offset it, and the bias reason', () => {
  const x = BV.currencyDetail('EUR', BOOK, VIEW);
  assert.equal(x.net, 1.05); assert.equal(x.bias, -1); assert.equal(x.why, 'soft ECB <script>');
  assert.deepEqual(x.long.map(r => [r.name, r.role, r.withBias]), [['EURJPY', 'adds', false], ['EURAUD', 'adds', false]]);
  assert.deepEqual(x.short.map(r => [r.name, r.role, r.withBias]), [['EURUSD', 'offsets', true]]);
  assert.equal(x.long.find(r => r.name === 'EURAUD').view, 'against');
  const html = BV.currencyPanelHtml(x, { flags: BV.concentration(BOOK, RISK) });
  assert.ok(html.includes('soft ECB &lt;script&gt;') && !html.includes('<script>'), 'the reason is escaped');
  assert.match(html, />against view</); assert.match(html, /data-inst="EURAUD"/);
  const eq = BV.currencyDetail('EQUITY', BOOK, VIEW);
  assert.equal(eq.net, -1); assert.match(BV.currencyPanelHtml(eq), /does not rule on equities/);
});

test('flowSvg draws every live card (no top-N), isolates a currency, and marks cards against the view', () => {
  const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCAD', 'USDCHF', 'GBPJPY', 'EURGBP', 'EURJPY', 'EURCHF', 'GBPCHF', 'AUDJPY', 'CADJPY', 'EURAUD', 'EURCAD', 'EURNZD', 'GBPAUD', 'GBPCAD', 'AUDCAD'][i], card(i % 2 ? 'LONG' : 'SHORT', 0.1 + i / 20)]));
  const svg = BV.flowSvg(many, 'construction', { tone: 'risk_off' });
  assert.equal((svg.match(/class="bf-card/g) ?? []).length, 20);
  const ck = BV.viewCheck(BOOK, VIEW), g = BV.flowSvg(BOOK, 'gross', { tone: 'risk_on', ccyView: VIEW, sel: 'JPY', check: ck });
  assert.match(g, /data-bfccy="EQUITY"/); assert.match(g, /EURAUD.*against view/s);
  assert.match(g, /class="bf-card bf-dim" data-inst="EURUSD"/);   // EURUSD has no JPY leg
  assert.match(g, /class="bf-card" data-inst="GBPJPY"/);
  assert.ok(!/NaN|undefined/.test(g + svg));
  assert.match(BV.flowSvg({}, 'construction'), /No live card/);
  const nar = BV.flowSvg(BOOK, 'gross', { tone: 'risk_off', ccyView: VIEW, check: ck, narrow: true });
  assert.match(nar, /viewBox="0 0 470 /); assert.match(nar, /RISK-OFF → CURRENCIES → CARDS/); assert.match(nar, /vs view/);
  assert.equal((nar.match(/class="bf-card/g) ?? []).length, 7); assert.ok(!/NaN|undefined/.test(nar));
  const net = BV.netBarsHtml(BOOK, { cap: 4, ccyView: VIEW, sel: 'JPY' });
  assert.equal((net.match(/class="bf-nrow/g) ?? []).length, BV.exposureRows(BOOK).length);
  assert.ok(!/NaN|undefined/.test(net));
});

// ── the scenario map ──
const SCEN = {
  ok: true, full: true,
  scenarios: [
    { key: 'carry_unwind', label: 'Carry unwind', ok: true, book: { pnl: -3.1, pnlPct: -0.5, worst: [{ name: 'EURJPY', pnl: -1.5 }, { name: 'GBPJPY', pnl: -0.8 }, { name: 'AUDJPY', pnl: -1.2 }], best: [{ name: 'EURUSD', pnl: 0.4 }], missing: ['GOLD'] } },
    { key: 'usd_up_2', label: 'Dollar +2%', ok: true, book: { pnl: 0.6, pnlPct: 0.1, worst: [{ name: 'EURJPY', pnl: -0.2 }], best: [{ name: 'EURUSD', pnl: 0.8 }], missing: [] } },
    { key: 'risk_off_day', label: 'Risk-off day', ok: false, errors: ['not enough joint history'] },
  ],
  replays: [
    { key: 'yen_carry_2024', label: 'Yen carry unwind', from: '2024-07-31', to: '2024-08-05', covered: true, pnl: -40, pnlPct: -2, worst: [{ name: 'AUDJPY', pnl: -20 }, { name: 'EURJPY', pnl: -15 }, { name: 'GBPJPY', pnl: -9 }, { name: 'NQ', pnl: 4 }], missing: [] },
    { key: 'covid_2020', label: 'COVID', from: '2020-03-06', to: '2020-03-19', covered: false },
  ],
};

test('scenarioMatrix: cells from the engine\'s lists, absent = 0 only with full=1, missing = null; rows where a leg-group loses together', () => {
  const m = scenarioMatrix(SCEN, BOOK, { groups: BV.concentration(BOOK, RISK) });
  assert.deepEqual(m.cols, ['EURUSD', 'AUDJPY', 'EURAUD', 'EURJPY', 'GBPJPY', 'NQ', 'GOLD']);
  const carry = m.rows[0];
  assert.equal(carry.cells.EURJPY, -1.5); assert.equal(carry.cells.EURAUD, 0); assert.equal(carry.cells.GOLD, null);
  assert.equal(carry.total, -3.1); assert.equal(carry.losers, 3);
  assert.deepEqual(carry.hits.map(h => [h.ccy, h.sign, h.cards.length]), [['JPY', -1, 3]]);
  assert.equal(m.rows[1].hits.length, 0);
  assert.equal(m.rows[2].ok, false); assert.equal(m.rows[4].ok, false);
  assert.equal(m.rows[3].kind, 'replay'); assert.equal(m.rows[3].hits.length, 1);
  assert.equal(worstRow(m).key, 'yen_carry_2024');
  // without full=1 a card the endpoint did not list is "not listed", never zero
  const part = scenarioMatrix({ ...SCEN, full: false }, BOOK);
  assert.equal(part.rows[0].cells.EURAUD, null);
});

test('matrixHtml: sticky first and book columns, a flag on the clustered row, escaped labels, no NaN', () => {
  const m = scenarioMatrix({ ...SCEN, scenarios: [{ ...SCEN.scenarios[0], label: 'Carry <b>unwind</b>' }, ...SCEN.scenarios.slice(1)] }, BOOK, { groups: BV.concentration(BOOK, RISK) });
  const html = matrixHtml(m);
  assert.match(html, /class="sm-wrap"/); assert.match(html, /class="sm-first"/); assert.match(html, /class="sm-book/);
  assert.equal((html.match(/class="sm-hit"/g) ?? []).length, 2);
  assert.ok(html.includes('Carry &lt;b&gt;unwind&lt;/b&gt;') && !html.includes('<b>unwind'));
  assert.match(html, /before the price history/);
  assert.ok(!/NaN|undefined/.test(html));
  assert.equal(cellBg(null, 1), 'transparent'); assert.match(cellBg(-1, 1), /^rgba\(255,93,120/); assert.match(cellBg(0.5, 1), /^rgba\(47,211,154/);
});

// ── book intelligence ──
test('bookIntel: the strip and the template sentences come from the book, the risk read and the scenario rows only', () => {
  const run = { date: '2026-11-06', head: { ok: true, book: { instruments: BOOK, global: { tone: 'risk_off' }, exposure: { cap: 2, cuts: [{ ccy: 'JPY', net: -3, factor: 0.7, cards: ['EURJPY'] }] } } },
    debate: { currency: { view: { currencies: VIEW } }, global: { view: { tone: 'risk_off', conviction: 'high' } } } };
  const m = scenarioMatrix(SCEN, BOOK, { groups: BV.concentration(BOOK, RISK) });
  const x = bookIntel({ run, risk: RISK, matrix: m });
  assert.deepEqual(x.tiles.map(t => t.k), ['Global call', 'Largest net currency', 'Effective bets', 'Largest scenario loss', 'Against currency view']);
  assert.equal(x.tiles[0].v, 'risk-off'); assert.equal(x.tiles[1].v, 'short JPY 2.1'); assert.equal(x.tiles[2].v, '3.2 of 6');
  assert.equal(x.tiles[3].v, '−40 card-σ'); assert.equal(x.tiles[4].v, '1 of 4');
  assert.equal(x.bullets.length, 4);
  assert.match(x.bullets[0], /short JPY, 2\.1 units across 3 cards, at the ±2 cap \(the cap cut it from −3\)/);
  assert.match(x.bullets[1], /^Tightest cluster: 3 cards short JPY/);
  assert.match(x.bullets[2], /"Yen carry unwind": −40 card-σ \(−2% of gross\), most from AUDJPY, EURJPY and GBPJPY\. Today's sensitivities, not a forecast\./);
  assert.match(x.bullets[3], /^3 of 4 FX cards agree with their currencies' biases; against the currency view: EURAUD\.$/);
  // nothing loaded yet: still a strip, no invented numbers
  const y = bookIntel({ run });
  assert.equal(y.tiles[2].v, '–'); assert.equal(y.tiles[3].v, '–');
  assert.equal(y.bullets.length, 3); assert.ok(!y.bullets.join(' ').includes('independent bets')); assert.match(y.bullets[1], /^Concentration: 3 cards short JPY/);
  const z = bookIntel({ run: { ...run, head: { ok: true, book: { ...run.head.book, instruments: { GBPJPY: BOOK.GBPJPY } } } } });
  assert.match(z.bullets[0], /global ruling is risk-off at high conviction; the book holds 1 live card, 1 of them FX/);
});

// ── ranking vs realised ──
const day = (date, ranking, realisedRanking, sv, wv) => ({ date, currencies: { ranking, realisedRanking, biases: { USD: 1, JPY: -1 }, realised: Object.fromEntries(realisedRanking.map((c, i) => [c, 1 - i * 0.5])),
  rankCorr: rankCorr(ranking, realisedRanking), strongest: { verdict: sv }, weakest: { verdict: wv } } });
const C4 = ['USD', 'EUR', 'GBP', 'JPY'];
const DAYS = [day('2026-11-04', C4, ['USD', 'EUR', 'GBP', 'JPY'], 'right', 'right'), day('2026-11-03', C4, ['JPY', 'GBP', 'EUR', 'USD'], 'wrong', 'wrong'), day('2026-11-05', C4, ['EUR', 'USD', 'JPY', 'GBP'], 'right', 'wrong')];

test('rankRows: desk rank, realised rank and the gap per currency, with the stored Spearman', () => {
  const t = rankRows(DAYS[2]);
  assert.deepEqual(t.rows.map(r => [r.ccy, r.desk, r.realised, r.gap]), [['USD', 1, 2, 1], ['EUR', 2, 1, -1], ['GBP', 3, 4, 1], ['JPY', 4, 3, -1]]);
  assert.equal(t.rho, 0.6); assert.equal(t.n, 4);
  assert.equal(rankRows(null), null);
  assert.match(rankTableHtml(t), /Spearman for 2026-11-05: <b class="mono">\+0\.60<\/b> over 4 currencies/);
});

test('rankHistory: days oldest first, top/bottom marks, rolling mean Spearman and the top/bottom hit rate with n', () => {
  const hh = rankHistory(DAYS, { w: 2 });
  assert.deepEqual(hh.cells.map(c => c.date), ['2026-11-03', '2026-11-04', '2026-11-05']);
  assert.deepEqual(hh.rho.map(r => r.rho), [-1, 1, 0.6]);
  assert.deepEqual(hh.rolling.map(r => r.mean), [-1, 0, 0.8]);
  assert.equal(hh.meanRho, 0.2); assert.equal(hh.days, 3);
  assert.deepEqual(hh.hit, { n: 6, right: 3, share: 0.5 });
  assert.equal(hh.cells[0].by.USD.mark, 'top'); assert.equal(hh.cells[0].by.JPY.mark, 'bottom'); assert.equal(hh.cells[0].by.EUR.mark, null);
  assert.equal(hh.cells[0].by.USD.realised, 4);
  const html = rankHeatHtml(hh);
  assert.match(html, /▲4/); assert.ok(!/NaN|undefined/.test(html));
  assert.equal(rankHistory([]).days, 0); assert.match(rankHeatHtml(rankHistory([])), /No scored day/);
  assert.match(rankColour(1, 8), /^rgba\(47/); assert.match(rankColour(8, 8), /^rgba\(255/);
});
