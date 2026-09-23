import assert from 'node:assert/strict';
import { buildMap, LAYOUT, STAGES, EDGE_LABEL, ROLE, MAP_W, MAP_H } from './mvMap.js';
import { LINKS, BOARD } from './marketScan.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

const link = (id, a, b, corr, z, weak = false) => ({ id, a, b, corr, z, weak, labelA: a, labelB: b });
const row = (key, z, change, kind = 'price') => ({ key, z, change, kind });

t('every market in a link has a place on the map, or the link is silently invisible', () => {
  const missing = [];
  for (const l of LINKS) { if (!LAYOUT[l.a]) missing.push(l.a); if (!LAYOUT[l.b]) missing.push(l.b); }
  assert.deepEqual([...new Set(missing)], [], 'these link legs have no position');
});

t('every market says what it IS, not just what it did', () => {
  const m = buildMap([link('tips-gold', 'tips', 'gold', -0.6, 0)], [row('tips', 1, 24, 'rate')]);
  assert.match(m.svg, /class="mmR"[^>]*>the true cost of money</);
  assert.match(m.svg, /class="mmV up"[^>]*>\+24bp ↑</, 'and carries a direction arrow');
  for (const k of Object.keys(LAYOUT)) {
    assert.ok(ROLE[k], `${k} has no role line -- a value with no role attached is trivia`);
    assert.ok(ROLE[k].length <= 28, `"${ROLE[k]}" is too long for a node`);
  }
});

t('stages are named by the role they play, not by what they contain', () => {
  assert.equal(STAGES.length, 5);
  assert.deepEqual(STAGES.map(x => x[0]), ['Drivers', 'Mechanism', 'Transmission', 'Result', 'Real things']);
  for (const [, role] of STAGES) assert.ok(role && role.length <= 20, `role "${role}" too long`);
  // rates in the first column, real things in the last -- the direction of the story
  assert.equal(LAYOUT.us2y[0], 0); assert.equal(LAYOUT.tips[0], 0);
  assert.equal(LAYOUT.gold[0], 4); assert.equal(LAYOUT.copper[0], 4);
  assert.ok(LAYOUT.vix[0] < LAYOUT.spx[0], 'fear is priced before equity answers it');
});

t('no two markets sit on top of each other', () => {
  const seen = new Set();
  for (const [k, [c, r]] of Object.entries(LAYOUT)) {
    const at = `${c}:${r}`;
    assert.ok(!seen.has(at), `${k} collides with another node at ${at}`);
    seen.add(at);
  }
});

t('link state is drawn, not written: colour by holding / apart / too loose', () => {
  const m = buildMap([
    link('a', 'tips', 'gold', -0.6, -0.2), link('b', 'dxy', 'btc', -0.05, 0.1, true),
    link('c', 'vix', 'spx', -0.8, 4.2),
  ], [], { apartZ: 3.1 });
  assert.match(m.svg, /class="mmE hold"/); assert.match(m.svg, /class="mmE loose"/); assert.match(m.svg, /class="mmE apart"/);
  assert.deepEqual(m.counts, { apart: 1, hold: 1, loose: 1 });
});

t('a tighter link is drawn thicker, so strength is visible without reading a number', () => {
  const thin = buildMap([link('a', 'tips', 'gold', 0.22, 0)], []).svg.match(/stroke-width="([\d.]+)"/)[1];
  const thick = buildMap([link('a', 'tips', 'gold', 0.95, 0)], []).svg.match(/stroke-width="([\d.]+)"/)[1];
  assert.ok(+thick > +thin * 1.5, `0.95 should draw much thicker than 0.22, got ${thin} then ${thick}`);
});

t('a node ring thickens with how unusual that market itself is', () => {
  const calm = buildMap([link('a', 'tips', 'gold', -0.6, 0)], [row('tips', 0.2, 2)]).svg;
  const wild = buildMap([link('a', 'tips', 'gold', -0.6, 0)], [row('tips', 4.1, 52)]).svg;
  assert.match(wild, /class="mmN hot"/);
  assert.doesNotMatch(calm, /class="mmN hot"/);
});

t('the same threshold as the findings, so the map cannot contradict the page', () => {
  const at = buildMap([link('a', 'tips', 'gold', -0.7, 3.2)], [], { apartZ: 3.1 });
  const under = buildMap([link('a', 'tips', 'gold', -0.7, 3.0)], [], { apartZ: 3.1 });
  assert.equal(at.counts.apart, 1); assert.equal(under.counts.apart, 0);
});

t('only markets that actually appear in a link are drawn', () => {
  const m = buildMap([link('a', 'tips', 'gold', -0.6, 0)], []);
  assert.deepEqual(m.nodes.sort(), ['gold', 'tips']);
  assert.doesNotMatch(m.svg, />Nikkei</, 'an untouched node must not clutter the map');
});

t('every drawn market has a label short enough for its box', () => {
  const m = buildMap(LINKS.map((l, i) => link(l.id, l.a, l.b, 0.5, 0)), BOARD.map(b => row(b.key, 0, 1, b.kind)));
  for (const lbl of [...m.svg.matchAll(/class="mmT" text-anchor="middle">([^<]+)</g)].map(x => x[1]))
    assert.ok(lbl.length <= 11, `"${lbl}" is too long for a node`);
});

t('the drawing stays inside its own viewBox', () => {
  const m = buildMap(LINKS.map(l => link(l.id, l.a, l.b, 0.6, 0)), []);
  for (const [, x, y] of m.svg.matchAll(/<rect x="(-?[\d.]+)" y="(-?[\d.]+)"/g)) {
    assert.ok(+x >= 0 && +y >= 0, `node at ${x},${y} is off the left/top edge`);
    assert.ok(+x < MAP_W && +y < MAP_H, `node at ${x},${y} is outside ${MAP_W}x${MAP_H}`);
  }
  assert.doesNotMatch(m.svg, /NaN|Infinity/);
});

t('no colour is hard-coded, so the map works in both themes', () => {
  const m = buildMap(LINKS.map(l => link(l.id, l.a, l.b, 0.6, 0)), BOARD.map(b => row(b.key, 1, 1, b.kind)));
  assert.doesNotMatch(m.svg, /#[0-9a-fA-F]{3,6}\b/);
  assert.doesNotMatch(m.svg, /style="[^"]*(fill|stroke):/);
});

t('an empty board draws nothing rather than throwing', () => {
  assert.doesNotThrow(() => buildMap([], []));
  assert.deepEqual(buildMap([], []).counts, { apart: 0, hold: 0, loose: 0 });
});

t('the mechanism is written ON the line, which is what makes it teach', () => {
  const m = buildMap([link('tips-gold', 'tips', 'gold', -0.6, 0)], []);
  assert.match(m.svg, /class="mmL hold"[^>]*>cost of carry</, 'the label must be drawn, not only in a tooltip');
  assert.match(m.svg, /marker-end="url\(#mmArrow-hold\)"/, 'and the line must point somewhere');
  // a link too loose to mean anything gets no label -- naming a mechanism that is
  // not operating is the one thing worse than naming none
  const loose = buildMap([link('dxy-btc', 'dxy', 'btc', -0.05, 0, true)], []);
  assert.doesNotMatch(loose.svg, /class="mmL/);
});

t('every link on the board has a mechanism label', () => {
  const missing = LINKS.filter(l => !EDGE_LABEL[l.id]).map(l => l.id);
  assert.deepEqual(missing, [], 'these links would draw a bare line');
  for (const [id, lab] of Object.entries(EDGE_LABEL))
    assert.ok(lab.length <= 22, `"${lab}" (${id}) is too long to sit on a line`);
});

console.log(`mvMap: ${n} groups, all passed`);
