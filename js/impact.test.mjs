import assert from 'node:assert/strict';
import { impactOf, impactBoard, classify, VERDICTS } from './impact.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const row = (key, label, change, z, kind = 'price') => ({ key, label, change, z, kind, what: `${label} is a thing` });
const lk = (id, a, b, la, lb, corr) => ({ id, a, b, labelA: la, labelB: lb, corr, normally: `${la} drives ${lb}.` });

t('every verdict explains itself, and none of them predicts', () => {
  for (const [k, v] of Object.entries(VERDICTS)) {
    assert.ok(v.label && v.tone && v.means.length > 45, `${k} incomplete`);
    assert.doesNotMatch(v.means, /\b(will|expect|should continue|is about to)\b/i, `${k} predicts`);
  }
});

t('the expectation is the relationship times the source move, in z space', () => {
  // source z +2.0, corr -0.6 -> partner implied z -1.2. Partner did -1.1: transmitted.
  const r = impactOf('us2y', [row('us2y', '2y', 52, 2.0, 'rate'), row('gold', 'Gold', -6, -1.1)],
    [lk('us2y-gold', 'us2y', 'gold', '2y', 'Gold', -0.6)]);
  const d = r.direct[0];
  assert.equal(d.expectedZ, -1.2);
  assert.equal(d.actualZ, -1.1);
  assert.equal(d.verdict, 'transmitted');
  assert.ok(d.ratio > 0.9 && d.ratio < 1.0);
});

t('a market that ignored the move reads BLOCKED, and that is the finding', () => {
  const r = impactOf('us2y', [row('us2y', '2y', 52, 2.4, 'rate'), row('nq', 'Nasdaq', 5.2, 0.1)],
    [lk('us2y-nq', 'us2y', 'nq', '2y', 'Nasdaq', -0.7)]);
  const d = r.direct[0];
  assert.equal(d.verdict, 'blocked');
  assert.match(VERDICTS.blocked.means, /not on this board/);
  assert.deepEqual(r.blocked.map(x => x.key), ['nq']);
});

t('a market that went the other way reads REVERSED, the strongest signal here', () => {
  const r = impactOf('tips', [row('tips', 'Real 10y', 24, 1.5, 'rate'), row('gold', 'Gold', 6, 1.4)],
    [lk('tips-gold', 'tips', 'gold', 'Real 10y', 'Gold', -0.62)]);
  assert.equal(r.direct[0].verdict, 'reversed');
  assert.ok(r.direct[0].ratio < 0);
});

t('an implied move inside the noise is not judged at all', () => {
  const r = impactOf('us2y', [row('us2y', '2y', 5, 0.3, 'rate'), row('gold', 'Gold', -6, -1.7)],
    [lk('us2y-gold', 'us2y', 'gold', '2y', 'Gold', -0.6)]);
  assert.equal(r.direct[0].verdict, 'too small');
  assert.equal(r.direct[0].ratio, null);
  assert.equal(r.travelled, null, 'nothing judged means no travelled figure, not 0%');
});

t('a link too loose to mean anything implies nothing and is dropped', () => {
  const r = impactOf('dxy', [row('dxy', 'Dollar', 1.2, 2.0), row('btc', 'Bitcoin', 10, 2.1)],
    [lk('dxy-btc', 'dxy', 'btc', 'Dollar', 'Bitcoin', -0.05)]);
  assert.deepEqual(r.direct, [], 'a 0.05 relationship cannot imply anything about anything');
});

t('effects are sorted by what SHOULD have moved, not by what did', () => {
  const b = [row('us2y', '2y', 52, 2.4, 'rate'), row('a', 'A', 0.1, 0.05), row('bb', 'B', 9, 1.4)];
  const r = impactOf('us2y', b, [lk('l1', 'us2y', 'a', '2y', 'A', -0.9), lk('l2', 'us2y', 'bb', '2y', 'B', 0.3)]);
  assert.deepEqual(r.direct.map(d => d.key), ['a', 'bb'],
    'A barely moved but had the biggest implication -- sorting by actual would hide it');
});

t('travelled is the share of judged effects that actually took the move', () => {
  const b = [row('s', 'Src', 50, 2.0, 'rate'), row('x', 'X', 1, -1.2), row('y', 'Y', 1, 0.0), row('z2', 'Z', 1, -1.1)];
  const r = impactOf('s', b, [lk('a', 's', 'x', 'Src', 'X', -0.6), lk('b', 's', 'y', 'Src', 'Y', -0.6), lk('c', 's', 'z2', 'Src', 'Z', -0.6)]);
  assert.equal(r.tally.transmitted, 2);
  assert.equal(r.tally.blocked, 1);
  assert.ok(Math.abs(r.travelled - 0.67) < 0.01);
});

t('the board view propagates the biggest movers, skipping the quiet ones', () => {
  // `eff` sits below the source floor on purpose: it is a valid TARGET of Big's move
  // but has not moved enough itself to be worth propagating as a source.
  const b = [row('big', 'Big', 50, 2.4, 'rate'), row('mid', 'Mid', 5, 0.4), row('eff', 'Eff', 1, -1.0)];
  const l = [lk('a', 'big', 'eff', 'Big', 'Eff', -0.6), lk('b', 'mid', 'eff', 'Mid', 'Eff', -0.6)];
  const r = impactBoard(b, l, { top: 4, minZ: 1.2 });
  assert.equal(r.rows.length, 1, 'only the mover above the floor propagates');
  assert.equal(r.rows[0].key, 'big');
});

t('it never claims causation, on any input', () => {
  const r = impactOf('us2y', [row('us2y', '2y', 52, 2.4, 'rate'), row('gold', 'Gold', -6, -1.5)],
    [lk('l', 'us2y', 'gold', '2y', 'Gold', -0.6)]);
  assert.match(r.caveat, /not that one caused the other/);
  assert.doesNotMatch(JSON.stringify(r.direct), /\bcaused\b|\bwill\b/i);
});

t('a missing market or empty board returns null rather than guessing', () => {
  assert.equal(impactOf('nope', [row('a', 'A', 1, 1)], []), null);
  assert.equal(impactOf('a', null, null), null);
  assert.deepEqual(impactBoard(null, null), { rows: [], orphans: [] });
  assert.equal(classify(null, 1), null);
});

t('a big mover with no tight link is reported as an ORPHAN, not skipped silently', () => {
  // live on 2026-09-23 the two most extreme markets were the 2-year and the 2s10s
  // curve, and neither sits in a relationship above 0.20 -- ranking by |z| alone
  // returned an empty page, when "the biggest move on the board connects to nothing"
  // is exactly the thing a reader wants told.
  const b = [row('lonely', 'Lonely', 50, 2.9, 'rate'), row('src', 'Src', 20, 1.5, 'rate'), row('eff', 'Eff', 1, -1.0)];
  const l = [lk('a', 'src', 'eff', 'Src', 'Eff', -0.6), lk('b', 'lonely', 'eff', 'Lonely', 'Eff', 0.04)];
  const r = impactBoard(b, l, { top: 4, minZ: 1.2 });
  assert.deepEqual(r.rows.map(x => x.key), ['src'], 'only the connected mover propagates');
  assert.deepEqual(r.orphans.map(o => o.key), ['lonely'], 'and the biggest mover is named as unconnected');
  assert.equal(r.orphans[0].z, 2.9);
});

console.log(`impact: ${n} groups, all passed`);
