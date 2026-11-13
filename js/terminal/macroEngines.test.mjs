// Macro engines board: the shaping (macroEnginesCore.js) and the drawing (macroEngines.js), on synthetic releases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyOf, cadenceOf, buildMacroBoard, flattenAhead, FAMILIES, CCYS } from './macroEnginesCore.js';
import { cellHtml, drawerHtml, boardHtml, defaultPick, heat, sparkSvg } from './macroEngines.js';

const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);
const D = n => NOW - n * 864e5;
// a series of past prints with consensus: raw surprise alternates +-0.1 so the scale is 0.1; the last print is the one under test
function series(country, event, lastActual, lastEstimate, { impact = 'High', ageDays = 3, n = 12, prev = '0.2%' } = {}) {
  const rows = [];
  for (let i = n; i >= 1; i--) rows.push({ country, event, impact, ms: D(ageDays + i * 30), estimate: '0.30%', prev, actual: i % 2 ? '0.40%' : '0.20%' });
  rows.push({ country, event, impact, ms: D(ageDays), estimate: lastEstimate, prev, actual: lastActual });
  return rows;
}

test('familyOf: headline releases per family; regional and unrelated titles do not match', () => {
  assert.deepEqual(familyOf('CPI y/y'), { family: 'cpi', rank: 1 });
  assert.equal(familyOf('CPI m/m').rank, 3);
  assert.equal(familyOf('Non-Farm Employment Change').family, 'labour');
  assert.equal(familyOf('Unemployment Rate').family, 'labour');
  assert.equal(familyOf('Flash Manufacturing PMI').family, 'pmi');
  assert.equal(familyOf('ISM Manufacturing PMI').family, 'pmi');
  assert.equal(familyOf('Advance GDP q/q').family, 'gdp');
  assert.equal(familyOf('Retail Sales m/m').family, 'retail');
  assert.equal(familyOf('Goods Trade Balance').family, 'trade');
  assert.equal(familyOf('GfK Consumer Confidence').family, 'confidence');
  // the euro area's regional releases are not the euro-area headline
  assert.equal(familyOf('German Retail Sales m/m'), null);
  assert.equal(familyOf('German Flash Manufacturing PMI'), null);
  assert.equal(familyOf('French Consumer Spending m/m'), null);
  // not one of the eight families
  assert.equal(familyOf('Unemployment Claims'), null);
  assert.equal(familyOf('Advance GDP Price Index q/q'), null);
  assert.equal(familyOf('Federal Funds Rate'), null);
});

test('cadenceOf: q/q and Tankan are quarterly, the rest monthly', () => {
  assert.equal(cadenceOf('GDP q/q'), 'quarterly');
  assert.equal(cadenceOf('CPI y/y'), 'monthly');
});

test('buildMacroBoard: a beat is stronger (green), sized by the release\'s own history; unemployment is inverted', () => {
  const rows = [
    ...series('US', 'CPI y/y', '0.90%', '0.30%'),                       // far above a 0.1 scale: big z, stronger
    ...series('US', 'Unemployment Rate', '4.2%', '4.0%'),                // above expectation but INVERTED: weaker
    ...series('GB', 'Retail Sales m/m', '0.10%', '0.30%'),               // below: weaker
  ];
  const b = buildMacroBoard({ rows, now: NOW });
  const cpi = b.cells.USD.cpi, lab = b.cells.USD.labour, ret = b.cells.GBP.retail;
  assert.equal(cpi.status, 'surprise'); assert.equal(cpi.strength, 1); assert.ok(cpi.z > 1.5, `z ${cpi.z}`);
  assert.equal(lab.strength, -1, 'a higher unemployment rate than expected is weaker');
  assert.ok(lab.z < 0);
  assert.equal(ret.strength, -1);
  assert.equal(cpi.prints.length, 6, 'last six prints');
  assert.equal(cpi.ageDays, 3);
  assert.equal(cpi.stale, false);
});

test('buildMacroBoard: no feed, no consensus (vs prior), engine only, stale and discontinued are all distinguished', () => {
  const noCons = [{ country: 'CH', event: 'CPI m/m', impact: 'High', ms: D(5), estimate: null, prev: '0.1%', actual: '0.3%' }];
  const stale = series('AU', 'GDP q/q', '0.6%', '0.5%', { ageDays: 200 });
  const scorecard = {
    ranked: [{ ccy: 'JPY', composite: 0.2, factorsScored: 3, factorsTotal: 6, dims: { laborMarket: -0.4 }, asOf: { laborMarket: '2026-09-30' }, ageDays: { laborMarket: 44 }, stale: [] },
             { ccy: 'NZD', composite: -0.1, factorsScored: 2, factorsTotal: 6, dims: { cpi: null }, asOf: {}, ageDays: {}, stale: [] }],
    discontinued: { cpi: { NZD: 'series stopped 2021' } },
  };
  const b = buildMacroBoard({ rows: [...noCons, ...stale], scorecard, now: NOW });
  assert.equal(b.cells.CHF.cpi.status, 'prior'); assert.equal(b.cells.CHF.cpi.basis, 'prior'); assert.equal(b.cells.CHF.cpi.strength, 1);
  assert.equal(b.cells.AUD.gdp.stale, true, 'a quarterly release 200 days old is past its cadence');
  assert.equal(b.cells.JPY.labour.status, 'engine'); assert.equal(b.cells.JPY.labour.engine.score, -0.4);
  assert.equal(b.cells.NZD.cpi.engine.discontinued, 'series stopped 2021');
  assert.equal(b.cells.CAD.cpi.status, 'none');
  assert.equal(b.composite.JPY.composite, 0.2);
  assert.ok(b.coverage.CAD.missing.includes('Inflation'));
  assert.equal(b.coverage.AUD.stale[0], 'Growth');
});

test('buildMacroBoard: the most recent print is the cell; flash and final are one family; the headline wins a near tie', () => {
  const rows = [
    ...series('EU', 'CPI Flash Estimate y/y', '2.2%', '2.0%', { ageDays: 14 }),
    ...series('EU', 'Final CPI y/y', '2.2%', '2.2%', { ageDays: 2 }),
    ...series('EU', 'German Prelim CPI m/m', '0.5%', '0.2%', { ageDays: 1 }),
  ];
  const b = buildMacroBoard({ rows, now: NOW });
  assert.equal(b.cells.EUR.cpi.event, 'Final CPI y/y');
  assert.ok(b.cells.EUR.cpi.also.some(a => /Flash/.test(a.event)));
  assert.ok(!b.cells.EUR.cpi.also.some(a => /German/.test(a.event)), 'regional prints are not pulled in');
});

test('buildMacroBoard: next release comes from the calendar, by currency and family', () => {
  const ahead = flattenAhead([{ date: '2026-11-17', events: [{ ms: NOW + 4 * 864e5, country: 'GB', event: 'CPI y/y' }] }], [{ ms: NOW + 2 * 864e5, country: 'US', event: 'Retail Sales m/m' }, { ms: NOW - 864e5, country: 'US', event: 'CPI y/y' }]);
  const b = buildMacroBoard({ rows: [], ahead, now: NOW });
  assert.equal(b.cells.GBP.cpi.next.event, 'CPI y/y');
  assert.equal(b.cells.USD.retail.next.event, 'Retail Sales m/m');
  assert.equal(b.cells.USD.cpi.next, undefined, 'a release already past is not next');
});

test('buildMacroBoard: an empty store builds an all-"no feed" board without throwing', () => {
  const b = buildMacroBoard({});
  assert.equal(CCYS.every(c => FAMILIES.every(f => b.cells[c][f.key].status === 'none')), true);
});

test('render: heat is green for stronger, red for weaker, none for inline or unknown, and grows with |z|', () => {
  assert.match(heat({ strength: 1, z: 2 }), /47,211,154/);
  assert.match(heat({ strength: -1, z: 2 }), /255,93,120/);
  assert.equal(heat({ strength: 0, z: 0 }), 'transparent');
  assert.equal(heat({ strength: null }), 'transparent');
  const a = s => +/,([\d.]+)\)$/.exec(s)[1];
  assert.ok(a(heat({ strength: 1, z: 3 })) > a(heat({ strength: 1, z: 0.5 })));
  assert.ok(a(heat({ strength: 1, z: 99 })) <= 0.5, 'capped');
});

test('render: cells say what they are; no-feed cells say so; stale cells are dimmed; escaped', () => {
  const rows = [...series('US', 'CPI y/y', '0.90%', '0.30%'), ...series('AU', 'GDP q/q', '0.6%', '0.5%', { ageDays: 200 })];
  const b = buildMacroBoard({ rows, now: NOW });
  const f = k => FAMILIES.find(x => x.key === k);
  const ok = cellHtml('USD', f('cpi'), b.cells.USD.cpi);
  assert.match(ok, /0\.90%/); assert.match(ok, /▲/); assert.match(ok, /z \+/); assert.match(ok, /rgba\(47,211,154/);
  assert.match(cellHtml('AUD', f('gdp'), b.cells.AUD.gdp), /me-stale/);
  assert.match(cellHtml('CAD', f('cpi'), b.cells.CAD.cpi), /no feed/);
  assert.doesNotMatch(cellHtml('USD', f('cpi'), { ...b.cells.USD.cpi, event: '<b>x</b>' }), /<b>x<\/b>/);
});

test('render: the board has a row per currency and a column per family, the composite, the coverage note, an open drawer and no direction claim', () => {
  const rows = [...series('US', 'CPI y/y', '0.90%', '0.30%'), ...series('GB', 'Retail Sales m/m', '0.10%', '0.30%')];
  const scorecard = { ranked: [{ ccy: 'USD', composite: 0.31, factorsScored: 5, factorsTotal: 6, dims: {}, asOf: {}, ageDays: {}, stale: [] }], discontinued: {} };
  const b = { ok: true, ...buildMacroBoard({ rows, scorecard, ahead: [], now: NOW }) };
  const html = boardHtml(b, undefined, { tag: 'VALIDATED', result: 'size widens range' });
  assert.equal((html.match(/<tr><td class="n"><b>/g) ?? []).length, 8);
  for (const f of FAMILIES) assert.ok(html.includes(`>${f.label}</th>`), f.label);
  assert.match(html, /\+0\.31/); assert.match(html, /Coverage:/); assert.match(html, /context, not a signal/);
  assert.match(html, /id="me-drawer"/); assert.match(html, /last 6 prints/);
  assert.match(html, /it says nothing about which way a market moves/);
  assert.equal(boardHtml({ ok: false }), '');
});

test('render: the drawer lists the prints, the engine reading and the engine page; defaultPick takes the biggest fresh surprise', () => {
  const rows = [...series('US', 'CPI y/y', '0.90%', '0.30%'), ...series('GB', 'Retail Sales m/m', '0.35%', '0.30%')];
  const scorecard = { ranked: [{ ccy: 'USD', composite: 0.1, factorsScored: 4, factorsTotal: 6, dims: { cpi: 0.5 }, asOf: { cpi: '2026-10-10' }, ageDays: { cpi: 34 }, stale: [] }], discontinued: {} };
  const b = { ok: true, ...buildMacroBoard({ rows, scorecard, now: NOW }) };
  assert.deepEqual(defaultPick(b), { ccy: 'USD', fam: 'cpi' });
  const d = drawerHtml(b, 'USD', 'cpi');
  assert.match(d, /Engine reading/); assert.match(d, /\+0\.50/); assert.match(d, /href="cpi\.html"/); assert.match(d, /Expected/);
  assert.match(drawerHtml(b, 'CAD', 'cpi'), /no feed/);
  assert.match(sparkSvg([{ value: 1 }, { value: 3 }, { value: 2 }]), /<svg/);
  assert.equal(sparkSvg([{ value: 1 }]), '');
});

test('buildMacroBoard: z is shown only when it agrees with the beat or miss; an in-line print carries no z', () => {
  // history that usually beats by 0.1, so an in-line print is "below usual" (negative z) while strength is 0
  const rows = [];
  for (let i = 12; i >= 1; i--) rows.push({ country: 'CH', event: 'GDP q/q', impact: 'High', ms: D(3 + i * 90), estimate: '0.30%', prev: '0.2%', actual: i % 3 ? '0.40%' : '0.50%' });
  rows.push({ country: 'CH', event: 'GDP q/q', impact: 'High', ms: D(3), estimate: '0.30%', prev: '0.2%', actual: '0.30%' });
  const c = buildMacroBoard({ rows, now: NOW }).cells.CHF.gdp;
  assert.equal(c.strength, 0); assert.equal(c.z, null);
  assert.match(cellHtml('CHF', FAMILIES.find(f => f.key === 'gdp'), c), /=/);
  assert.equal(heat(c), 'transparent');
});
