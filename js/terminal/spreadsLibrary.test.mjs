// js/terminal/spreadsLibrary.test.mjs: the X-versus-Y library keeps its promises. node --test js/terminal/spreadsLibrary.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PAIRS, BY_ID, GENERAL_EV, NOT_HELD, WALL_IDS, EDUCATORS, STORIES } from './spreadsLibrary.js';
import { seriesMeta } from './spreadsDerived.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';

test('ids are unique and every pair says what it is, what up and down mean, and which group it belongs to', () => {
  assert.equal(new Set(PAIRS.map(p => p.id)).size, PAIRS.length);
  for (const p of PAIRS) { for (const k of ['label', 'short', 'group', 'what', 'up', 'down']) assert.ok(String(p[k] ?? '').length > 3, `${p.id}.${k}`); assert.ok(['ratio', 'diff', 'level', 'usd', 'zgap'].includes(p.op), p.id); }
});
test('every leg is a series the Insight bundle table knows, and a diff is only ever between two rate-kind series', () => {
  for (const p of PAIRS) {
    assert.ok(seriesMeta(p.x), `${p.id}: x ${p.x} is not in insightSeries or the derived series`);
    if (p.op === 'level') assert.equal(p.y, null, p.id); else assert.ok(seriesMeta(p.y), `${p.id}: y ${p.y} is not in insightSeries or the derived series`);
    if (p.op === 'diff') { assert.equal(seriesMeta(p.x).kind, 'rate', p.id); assert.equal(seriesMeta(p.y).kind, 'rate', p.id); }
    if (p.op === 'usd') { assert.equal(seriesMeta(p.x).kind, 'ratio', p.id); assert.equal(seriesMeta(p.y).kind, 'ratio', p.id); }
    if (p.op === 'zgap') { assert.ok([1, -1].includes(p.sign), `${p.id}: sign`); for (const k of ['xname', 'yname', 'rel']) assert.ok(String(p[k] ?? '').length >= 3, `${p.id}.${k}`); }
    if (p.fmt) assert.ok(['pct', 'bn', 'corr', 'pts'].includes(p.fmt) && p.op === 'level', `${p.id}: fmt only on a level`);
    if (p.needs) assert.equal(p.needs, 'extras', p.id);
  }
});
test('every Evidence Book id the library names exists in the book (a renamed id would silently drop a chip)', () => {
  const ids = new Set(DESK_EVIDENCE.map(e => e.id));
  for (const p of PAIRS) for (const r of p.ev) { assert.ok(ids.has(r.id), `${p.id}: ${r.id} is not in the Evidence Book`); assert.ok(r.about.length > 10, `${p.id}/${r.id} needs an "about"`); }
  for (const r of GENERAL_EV) assert.ok(ids.has(r.id), r.id);
  for (const h of NOT_HELD) for (const id of h.ev) assert.ok(ids.has(id), `${h.id}: ${id}`);
});
test('the verdict word is never stored in the library: it is read from the book', () => {
  for (const p of PAIRS) for (const r of p.ev) assert.deepEqual(Object.keys(r).sort(), ['about', 'id']);
});
test('every quote is attributed, and carries its source', () => {
  for (const p of PAIRS) for (const s of p.say) { assert.ok(s.who && s.text.length > 12 && s.src.length > 8, `${p.id}: ${JSON.stringify(s).slice(0, 80)}`); assert.equal(typeof s.verbatim, 'boolean'); }
  assert.ok(Object.values(EDUCATORS).length >= 6);
});
test('the wall holds 12 distinct rows and never ranks a shared or mostly-something-else count', () => {
  assert.equal(WALL_IDS.length, 12); assert.equal(new Set(WALL_IDS).size, 12);
  for (const id of WALL_IDS) { assert.ok(BY_ID[id], id); assert.ok(!BY_ID[id].mentions.shared && !BY_ID[id].mentions.note, `${id} should not be on the wall by a shared or noisy count`); }
});
test('what we cannot draw is listed with the reason and never invented', () => {
  assert.ok(NOT_HELD.length >= 4);
  for (const h of NOT_HELD) { assert.ok(h.label && h.said && h.why.length > 30, h.id); assert.ok(!PAIRS.some(p => p.id === h.id), `${h.id} is both held and not held`); }
});
test('no pair is worded as a trade or a prediction', () => {
  const text = JSON.stringify(PAIRS.map(p => [p.what, p.up, p.down]));
  assert.ok(!/\b(buy|sell|go long|go short|will rise|will fall|signal)\b/i.test(text));
});

test('every pair tells one of the seven stories, the story filter has a blurb for each, and a pair from general knowledge says so', () => {
  const ids = new Set(STORIES.map(x => x.id)); assert.equal(ids.size, 7);
  for (const x of STORIES) assert.ok(x.label && x.blurb.length > 20, x.id);
  for (const p of PAIRS) assert.ok(ids.has(p.story), `${p.id}: story ${p.story}`);
  for (const id of ids) assert.ok(PAIRS.some(p => p.story === id), `no pair tells the ${id} story`);
  for (const p of PAIRS.filter(q => q.mentions.n === 0)) { assert.ok(p.mentions.note && p.say.length === 0, p.id); }
});
test('wave 2 added the candidates the owner asked about: every one of them is held, or is listed as not held with a reason (never silently dropped)', () => {
  const need = ['xli-xlu', 'xlk-xlu', 'xlf-spy', 'btc-nq', 'skew', 'vrp', 'nzdjpy', 'chfjpy', 'y3m10y', 'y10-dff', 'y2-dff', 'tp10', 'sofr-iorb', 'rrp', 'netliq', 'brent-wti', 'gold-oil', 'plat-gold', 'sbcorr', 'dx-dxy-tips', 'dx-usdjpy-10y', 'dx-gold-tips', 'dx-dxy-vix', 'dx-aud-copper', 'dx-cad-oil', 'dx-oil-bei', 'dx-spx-vix'];
  for (const id of need) assert.ok(BY_ID[id], id);
  for (const id of ['sphb-splv', 'kre', 'eem-spy', 'transports', 'putcall', 'ust-bund', 'eurusd-rate-gap', 'surprise-rates', 'credit-impulse', 'breadth-ma', 'nok-brent', 'carry-basket', 'xccy-basis']) assert.ok(NOT_HELD.some(h => h.id === id), id);
});
