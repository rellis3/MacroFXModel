// node --test js/terminal/flowCore.test.mjs: the flow features' rules (at a glance, Analytics split, promoted links, slim drivers, dense mode) and their registry wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SURFACES as REG, surfaceById } from './tabRegistry.js';
import * as F from './flowCore.js';

const NOW = Date.parse('2026-11-16T10:00:00Z');

test('countdown: minutes, hours, days, now, and nothing for a bad time', () => {
  assert.equal(F.countdown(NOW + 35 * 60000, NOW), '35m');
  assert.equal(F.countdown(NOW + 135 * 60000, NOW), '2h 15m');
  assert.equal(F.countdown(NOW + 3 * 3600000, NOW), '3h');
  assert.equal(F.countdown(NOW + 72 * 3600000, NOW), '3d');
  assert.equal(F.countdown(NOW - 5 * 60000, NOW), 'now');
  assert.equal(F.countdown(NaN, NOW), null);
});

test('regime, stress, strength and the next release read the page data and say null when it is missing', () => {
  assert.equal(F.regimeOf(null), null);
  const r = F.regimeOf({ debate: { global: { view: { tone: 'risk_off', conviction: 'medium', summary: 'Credit cracking.' } } } });
  assert.deepEqual([r.word, r.cls, r.conviction], ['Risk-off', 'dn', 'medium']);
  assert.equal(F.stressOf({ ok: false }), null);
  const s = F.stressOf({ ok: true, overall: 'watch', tiles: [{ label: 'Credit', level: 'watch', detail: 'HY 320bp' }, { label: 'Flags', level: 'ok' }, { label: 'Funding', level: 'stress' }] });
  assert.deepEqual([s.ok, s.watch, s.stress, s.n], [1, 1, 1, 3]);
  assert.equal(s.worst[0].label, 'Funding');
  const st = F.strengthOf(['USD', 'JPY', 'CHF'], { ok: true, horizons: { '1D': { available: true, from: 'x', scores: [{ ccy: 'USD', score: 0.7 }, { ccy: 'JPY', score: 2.1 }, { ccy: 'CHF', score: -1.4 }] } } });
  assert.deepEqual(st.desk, { top: 'USD', bottom: 'CHF' });
  assert.equal(st.price.top.ccy, 'JPY'); assert.equal(st.price.bottom.ccy, 'CHF'); assert.equal(st.price.window, '1D');
  const st2 = F.strengthOf(['USD', 'CHF'], { ok: true, horizons: { '1D': { available: false }, '4H': { available: true, scores: [{ ccy: 'USD', score: 1 }, { ccy: 'EUR', score: -1 }] } } });
  assert.equal(st2.price.window, '4H');
  assert.equal(F.strengthOf(null, null).desk, null);
  assert.equal(F.strengthOf(null, null).price, null);
  const n = F.nextRelease([{ ms: NOW + 3600000, event: 'CPI', country: 'CA', impact: 'High' }, { ms: NOW + 600000, event: 'Minor', country: 'US', impact: 'Low' }, { ms: NOW - 3600000 * 2, event: 'Old', country: 'GB', impact: 'High' }], NOW);
  assert.deepEqual([n.event, n.in], ['CPI', '1h']);
  assert.equal(F.nextRelease([], NOW), null);
});

test('the glance block: every part escaped, a missing feed says not available, each tile opens a board, and no trade wording', () => {
  const m = F.buildGlance({ run: { ok: true, head: { ok: true, book: { headline: 'A <b>bold</b> day', global: { tone: 'risk_on', conviction: 'high' } } }, date: '2026-11-16' }, ws: null, ranking: ['USD', 'NZD'], now: NOW, dqText: 'DATA 129/134' });
  const h = F.glanceHtml(m);
  assert.ok(h.includes('data-surface="panel.ov.glance"'));
  assert.ok(!h.includes('<b>bold</b>') && h.includes('&lt;b&gt;bold&lt;/b&gt;'), 'stored text is escaped');
  assert.match(h, /World stress<\/span><span class="fl-na">not available/);
  assert.match(h, /Most unusual<\/span><span class="fl-na">not available/);
  assert.match(h, /no high-impact release in sight/);
  assert.match(h, /feeds 129\/134/);
  for (const g of ['ov.regime', 'insight.unusual', 'tab.cal']) assert.ok(h.includes(`data-go="${g}"`), g);
  assert.doesNotMatch(h, /\b(buy|sell|entry|target|stop loss)\b/i);
  assert.match(F.glanceHtml(F.buildGlance({ run: { ok: false }, now: NOW })), /not available/);
});

test('freshness words the run date, the data chip and the book age', () => {
  assert.equal(F.freshness({ date: '2026-11-16', finishedAt: '2026-11-16T09:30:00Z' }, 'DATA 129/134', NOW), 'desk run 2026-11-16 · feeds 129/134 · book 30m old');
  assert.equal(F.freshness(null, '', NOW), null);
});

test('Analytics split: every panel.ana.* surface is in exactly one section, none is invented, and the pills follow the visible blocks', () => {
  const ana = REG.filter(s => /^panel\.ana\./.test(s.id) && s.id !== 'panel.ana.pills').map(s => s.id).sort();
  assert.deepEqual([...F.ANA_BLOCKS].sort(), ana);
  assert.equal(new Set(F.ANA_BLOCKS).size, F.ANA_BLOCKS.length, 'no block in two sections');
  for (const b of F.ANA_BLOCKS) assert.equal(F.anaGroupOf(b), F.ANA_GROUPS.find(g => g.blocks.includes(b)).id);
  assert.equal(F.pickAnaGroup({ hash: '#ana/desk' }), 'desk');
  assert.equal(F.pickAnaGroup({ saved: 'desk' }), 'desk');
  assert.equal(F.pickAnaGroup({}), 'market');
  const onlyMarket = id => F.ANA_GROUPS[0].blocks.includes(id);
  assert.equal(F.pickAnaGroup({ hash: '#ana/desk', isOn: onlyMarket }), 'market', 'a hidden section is never opened');
  assert.equal(F.anaPillsHtml('market', onlyMarket), '', 'one section left: no pill row');
  const both = F.anaPillsHtml('desk', () => true);
  assert.ok(both.includes('data-ana="desk"') && both.includes('data-ana="market"'));
  assert.ok(both.includes('data-surface="panel.ana.pills"'));
  assert.equal(F.anaFromHash('#ana/market'), 'market');
  assert.equal(F.anaFromHash('#macro/rates'), null);
});

test('promoted links: every target is a registered Insight board and each board is promoted to one place', () => {
  for (const p of F.PROMOS) { assert.ok(surfaceById(p.target), p.target); assert.match(p.target, /^panel\.insight\./); assert.ok(F.promoHtml(p).includes(`data-promo="${p.target}"`)); }
  assert.equal(new Set(F.PROMOS.map(p => p.target)).size, F.PROMOS.length);
  assert.deepEqual(F.promosFor('assets').map(p => p.id), ['gold']);
});

test('slim drivers: the two strongest tailwinds and headwinds, each point once, with who made it; text ends on a word', () => {
  const x = { net: 1.5, analysts: [
    { id: 'a1', points: [{ claim: 'Fed holds hawkish with two hike dissents and the path prices a December hike.', push: 3 }, { claim: 'Credit is cracking at the tail.', push: -2 }] },
    { id: 'a2', points: [{ claim: 'Dollar real yield up.', push: 1 }, { claim: 'Oil falls.', push: -0.5 }, { claim: 'Surprise index positive.', push: 2 }, { claim: 'Gold ETF outflow.', push: -1 }, { claim: 'Third headwind.', push: -0.7 }] },
  ] };
  const m = F.slimDrivers(x, { analystLabel: id => `Analyst ${id}` });
  assert.deepEqual(m.tailwinds.map(p => p.push), [3, 2]);
  assert.deepEqual(m.headwinds.map(p => p.push), [-2, -1]);
  assert.equal(m.tailwinds[0].by, 'Analyst a1');
  assert.equal(m.points, 7);
  const h = F.slimHtml(m, { market: 'Gold', summary: 'Tailwinds <win>.' });
  assert.ok(h.includes('data-surface="panel.pair.driveshort"'));
  assert.ok(h.includes('Tailwinds &lt;win&gt;.'));
  assert.match(h, /not a tested signal/);
  assert.equal(F.slimDrivers(null), null);
  const cut = F.firstLine('x '.repeat(10) + 'word '.repeat(60), 100);
  assert.ok(cut.length <= 102 && cut.endsWith('…') && !/\s…$/.test(cut));
  assert.equal(F.firstLine('Short one. And a second.'), 'Short one.');
});

test('dense mode: only the two known words, the remembered value is normalised, toggle and the command words', () => {
  assert.equal(F.normaliseDensity('DENSE'), 'dense');
  assert.equal(F.normaliseDensity('garbage'), 'comfortable');
  assert.equal(F.normaliseDensity('dense'), 'dense');
  assert.equal(F.normaliseDensity(null), 'comfortable');
  assert.equal(F.nextDensity('comfortable'), 'dense');
  assert.equal(F.nextDensity('dense'), 'comfortable');
  assert.equal(F.densityFromWord('on'), 'dense');
  assert.equal(F.densityFromWord('off'), 'comfortable');
  assert.equal(F.densityFromWord('', 'dense'), 'comfortable');
  assert.equal(F.densityFromWord('nonsense'), null);
});

test('registry wiring: the four preview surfaces and the pill row exist, previews are hidden by default, and the markup carries each id literally', () => {
  for (const id of ['panel.ov.glance', 'panel.flow.promos', 'panel.pair.driveshort', 'widget.density']) { assert.equal(surfaceById(id)?.hidden, 'preview', id); assert.ok(surfaceById(id).note.length > 40, id); }
  assert.equal(surfaceById('panel.ana.pills')?.hidden ?? null, null, 'the pill row only groups existing blocks: not a preview');
  const src = fs.readFileSync(new URL('./flowCore.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('./flowView.js', import.meta.url), 'utf8');
  for (const id of ['panel.ov.glance', 'panel.flow.promos', 'panel.pair.driveshort', 'widget.density', 'panel.ana.pills']) assert.ok(src.includes(`data-surface="${id}"`), id);
});

test('flow.css: tokens only, no fixed widths or nowrap, so a card never grows past its box', () => {
  const css = fs.readFileSync(new URL('./flow.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'no fixed colours');
  assert.doesNotMatch(css, /white-space:\s*nowrap/);
  assert.doesNotMatch(css, /[{;]\s*width:\s*\d{3,}px/);
  assert.doesNotMatch(css, /[{;]\s*min-width:\s*\d{3,}px/);
  assert.match(css, /minmax\(min\(100%/, 'grids use min(100%, N) so they shrink on a phone');
});
