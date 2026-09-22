import assert from 'node:assert/strict';
import { DRIVERS, TARGETS, CELLS, buildMatrix, leadership } from './impactMatrix.js';
import { DESK_EVIDENCE } from './deskEvidence.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

t('every cell names a driver and target that exist, and has a face', () => {
  const dids = new Set(DRIVERS.map(d => d.id)), tids = new Set(TARGETS.map(x => x.id));
  for (const c of CELLS) {
    assert.ok(dids.has(c.driver), `unknown driver ${c.driver}`);
    assert.ok(tids.has(c.target), `unknown target ${c.target}`);
    assert.ok(c.face && c.face.length <= 42, `face missing or too long: ${c.driver}|${c.target}`);
  }
});

t('no duplicate cells', () => {
  const seen = new Set();
  for (const c of CELLS) { const k = `${c.driver}|${c.target}`; assert.ok(!seen.has(k), `duplicate ${k}`); seen.add(k); }
});

t('every `ev` resolves against the live ledger — a renamed id must not fail silently', () => {
  const { stats } = buildMatrix(DESK_EVIDENCE, []);
  assert.deepEqual(stats.missing, [], `matrix points at ledger ids that no longer exist: ${stats.missing.join(', ')}`);
});

t('a cell takes its verdict from the ledger, never from the spec', () => {
  const { byKey } = buildMatrix(DESK_EVIDENCE, []);
  const fear = byKey.get('fear|range');
  assert.equal(fear.verdict, 'validated');
  assert.match(fear.evidence.result, /ATR/);
  // flip the ledger entry and the cell must follow
  const flipped = DESK_EVIDENCE.map(e => e.id === 'vix-inversion' ? { ...e, verdict: 'null' } : e);
  assert.equal(buildMatrix(flipped, []).byKey.get('fear|range').verdict, 'null');
});

t('a cell with only a chain link is context, and an unasked pair is untested', () => {
  const { byKey, rows } = buildMatrix(DESK_EVIDENCE, [{ id: 'dxy-gold', verdict: 'holding', short: 'dollar → gold' }]);
  const c = byKey.get('dollar|gold');
  assert.equal(c.verdict, 'context');
  assert.equal(c.chain[0].verdict, 'holding');
  const blank = rows.find(r => r.id === 'breadth').cells.find(x => x.target === 'gold');
  assert.equal(blank.verdict, 'untested');
});

t('the stats count the blanks, because the blanks are the point', () => {
  const { stats } = buildMatrix(DESK_EVIDENCE, []);
  assert.equal(stats.asked + stats.blank, DRIVERS.length * TARGETS.length);
  assert.ok(stats.nulls >= 5, 'the nulls should be a large share of what has been asked');
});

t('leadership ranks a series that moves with everything above one that does not', () => {
  const dates = Array.from({ length: 70 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`);
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
  const core = dates.map(() => rnd());
  const mk = (f) => dates.map((d, i) => ({ date: d, value: 100 + f(i) * 10 }));
  const series = {
    driver: mk(i => core.slice(0, i + 1).reduce((s, v) => s + v, 0)),
    follower1: mk(i => core.slice(0, i + 1).reduce((s, v) => s + v, 0) + rnd() * 0.05),
    follower2: mk(i => core.slice(0, i + 1).reduce((s, v) => s + v, 0) + rnd() * 0.05),
    loner: mk(() => rnd() * 3),
  };
  const rank = leadership(series, { window: 60, labels: { driver: 'Driver', loner: 'Loner' } });
  assert.equal(rank[0].key !== 'loner', true, 'the independent series must not rank first');
  assert.equal(rank[rank.length - 1].key, 'loner');
  assert.ok(rank[0].meanAbsCorr > rank[rank.length - 1].meanAbsCorr);
  assert.equal(rank[0].label, 'Driver');
});

t('leadership refuses to rank when there is not enough data', () => {
  assert.deepEqual(leadership({ a: [{ date: 'd', value: 1 }] }), []);
  assert.deepEqual(leadership({}), []);
});

console.log(`impactMatrix: ${n} groups, all passed`);
