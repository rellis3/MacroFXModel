import assert from 'node:assert/strict';
import { GENERATORS, buildQuestion, score, rng, assertDerivable } from './marketDrill.js';
import { DESK_EVIDENCE } from './deskEvidence.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

/** A synthetic bundle: 400 days, with a controllable shape. */
function bundle(shape = {}) {
  const dates = Array.from({ length: 400 }, (_, i) => `2024-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`);
  const ramp = (from, per) => dates.map((_, i) => from + i * per);
  // the ramps are steep on purpose: a 20-session move has to clear each
  // generator's own floor, or nothing is asked (which is the correct behaviour
  // on a quiet tape, and makes for a useless fixture)
  return { dates, series: {
    us2y: ramp(4, 0.02), us10y: ramp(4, 0.02), us30y: ramp(4, 0.002), tips: ramp(2, 0.018), bei: ramp(2, 0.002),
    vix: ramp(15, 0.2), hy: ramp(3, 0.02), dxy: ramp(100, 0.1),
    gold: ramp(2000, -4), oil: ramp(70, 0.5), copper: ramp(4, 0.02),
    audusd: ramp(0.65, -0.001), usdjpy: ramp(150, 0.3), ...shape } };
}

t('every generator returns the full shape, and cites real ledger entries', () => {
  const ids = new Set(DESK_EVIDENCE.map(e => e.id));
  const b = bundle();
  let made = 0;
  for (const g of GENERATORS) {
    for (let i = 30; i < 380 && made < 400; i++) {
      let q = null; try { q = g.make(b, i, rng(i)); } catch { q = null; }
      if (!q) continue;
      made++;
      // the prose that teaches must be substantial; the stem/ask/reveal are short by design
      for (const k of ['why', 'principle']) assert.ok(q[k] && String(q[k]).length > 60, `${g.id}: ${k} missing or too thin`);
      for (const k of ['stem', 'ask', 'reveal']) assert.ok(q[k] && String(q[k]).length > 8, `${g.id}: ${k} missing`);
      assert.ok(typeof q.answer === 'string' && q.answer.length, `${g.id}: answer missing`);
      assert.ok(Array.isArray(q.options) && q.options.length >= 2, `${g.id}: needs options`);
      assert.ok(q.options.some(o => o.key === q.answer), `${g.id}: the answer must be one of the options`);
      assert.ok(new Set(q.options.map(o => o.key)).size === q.options.length, `${g.id}: duplicate option keys`);
      for (const e of q.evidence ?? []) assert.ok(ids.has(e), `${g.id} cites a ledger entry that does not exist: ${e}`);
      break;
    }
  }
  assert.ok(made >= 4, `only ${made} generators could make a question from the fixture`);
});

t('NO generator asks which way price went — that is the one forbidden question', () => {
  const b = bundle(); const asked = [];
  for (let s = 1; s < 120; s++) { const q = buildQuestion(b, { seed: s }); if (q) asked.push(`${q.ask} ${q.options.map(o => o.label).join(' ')}`); }
  assert.ok(asked.length > 20, 'the fixture should produce plenty of questions');
  for (const a of asked) {
    assert.doesNotMatch(a, /will (it|price|the market) (go|rise|fall)/i, 'no forecasting questions');
    assert.doesNotMatch(a, /higher or lower|buy or sell|long or short/i, 'no direction questions');
  }
});

t('the yield-split answer follows the actual legs', () => {
  const g = GENERATORS.find(x => x.id === 'yield-split');
  // breakevens do all the work
  const infl = bundle({ tips: Array.from({ length: 400 }, () => 2), bei: Array.from({ length: 400 }, (_, i) => 2 + i * 0.05) });
  infl.series.us10y = infl.series.tips.map((v, i) => v + infl.series.bei[i]);
  const q1 = g.make(infl, 200, rng(1));
  assert.equal(q1.answer, 'inflation');
  // the real yield does all the work
  const real = bundle({ bei: Array.from({ length: 400 }, () => 2), tips: Array.from({ length: 400 }, (_, i) => 2 + i * 0.05) });
  real.series.us10y = real.series.tips.map((v, i) => v + real.series.bei[i]);
  assert.equal(g.make(real, 200, rng(1)).answer, 'real');
});

t('a genuinely split yield move is NOT asked — no question without a clean answer', () => {
  const g = GENERATORS.find(x => x.id === 'yield-split');
  const even = bundle({ tips: Array.from({ length: 400 }, (_, i) => 2 + i * 0.025), bei: Array.from({ length: 400 }, (_, i) => 2 + i * 0.025) });
  even.series.us10y = even.series.tips.map((v, i) => v + even.series.bei[i]);
  assert.equal(g.make(even, 200, rng(1)), null);
});

t('the dollar-link question is only asked when exactly one leg broke', () => {
  const g = GENERATORS.find(x => x.id === 'dollar-link');
  // dollar up, gold up (broken), aud down (fine), usdjpy up (fine)
  const b = bundle({
    dxy: Array.from({ length: 400 }, (_, i) => 100 + i * 0.1),
    gold: Array.from({ length: 400 }, (_, i) => 2000 + i * 3),
    audusd: Array.from({ length: 400 }, (_, i) => 0.7 - i * 0.0005),
    usdjpy: Array.from({ length: 400 }, (_, i) => 150 + i * 0.1),
  });
  const q = g.make(b, 200, rng(3));
  assert.equal(q.answer, 'gold');
  assert.match(q.why, /broken link is where the story is/i);
  // all three following: nothing broken, no question
  const clean = bundle({
    dxy: Array.from({ length: 400 }, (_, i) => 100 + i * 0.1),
    gold: Array.from({ length: 400 }, (_, i) => 2000 - i * 3),
    audusd: Array.from({ length: 400 }, (_, i) => 0.7 - i * 0.0005),
    usdjpy: Array.from({ length: 400 }, (_, i) => 150 + i * 0.1),
  });
  assert.equal(g.make(clean, 200, rng(3)), null);
});

t('the same seed rebuilds the same question, a different seed does not', () => {
  const b = bundle();
  const a1 = buildQuestion(b, { seed: 42 }), a2 = buildQuestion(b, { seed: 42 });
  assert.deepEqual(a1.id, a2.id);
  assert.deepEqual(a1.options.map(o => o.key), a2.options.map(o => o.key), 'option order must be stable too');
  const seeds = new Set(Array.from({ length: 30 }, (_, s) => buildQuestion(b, { seed: s + 1 })?.id));
  assert.ok(seeds.size > 5, 'different seeds should reach different days and generators');
});

t('topics narrow the drill, and a thin bundle is refused rather than faked', () => {
  const b = bundle();
  const q = buildQuestion(b, { seed: 5, topics: ['gold'] });
  if (q) assert.equal(q.topic, 'gold');
  assert.equal(buildQuestion({ dates: ['2024-01-01'], series: {} }, { seed: 1 }), null);
  assert.equal(buildQuestion(null, { seed: 1 }), null);
});

t('scoring tracks the streak and finds the weakest topic', () => {
  const h = [
    { topic: 'rates', chosen: 'a', answer: 'a' }, { topic: 'rates', chosen: 'b', answer: 'a' }, { topic: 'rates', chosen: 'a', answer: 'a' },
    { topic: 'gold', chosen: 'x', answer: 'x' }, { topic: 'gold', chosen: 'x', answer: 'x' }, { topic: 'gold', chosen: 'x', answer: 'x' },
    { topic: 'rates', chosen: null, answer: 'a' },
  ];
  const s = score(h);
  assert.equal(s.n, 6);
  assert.equal(s.right, 5);
  assert.equal(s.streak, 4);   // three golds and the rates one before them; the miss breaks it
  assert.equal(s.weakest.topic, 'rates');
  assert.equal(score([]).pct, null);
});

t('EVERY question is derivable from its own stem — no guessing games', () => {
  const b = bundle(); const bad = [];
  for (let seed = 1; seed < 200; seed++) {
    const q = buildQuestion(b, { seed });
    if (!q) continue;
    const miss = assertDerivable(q);
    if (miss.length) bad.push(`${q.gen}: ${miss[0]}`);
  }
  assert.deepEqual([...new Set(bad)], [], 'a question whose answer is not on the card is a coin flip');
});

t('the reworded questions put both legs on the card', () => {
  const b = bundle();
  const ys = GENERATORS.find(g => g.id === 'yield-split');
  for (let i = 40; i < 380; i++) { const q = ys.make(b, i, rng(i)); if (!q) continue;
    assert.match(q.stem, /real yield/, 'the real leg must be shown, not hidden in the reveal');
    assert.match(q.stem, /inflation pricing/); break; }
  const ob = GENERATORS.find(g => g.id === 'oil-breakevens');
  for (let i = 40; i < 380; i++) { const q = ob.make(b, i, rng(i)); if (!q) continue;
    assert.match(q.stem, /breakeven/, 'the breakeven move must be shown'); break; }
  const cc = GENERATORS.find(g => g.id === 'credit-confirms');
  for (let i = 40; i < 380; i++) { const q = cc.make(b, i, rng(i)); if (!q) continue;
    assert.match(q.stem, /credit spreads/, 'the credit move must be shown'); break; }
});

console.log(`marketDrill: ${n} groups, all passed`);
