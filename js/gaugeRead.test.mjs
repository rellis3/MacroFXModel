import assert from 'node:assert/strict';
import { gauge, gaugeSentence, watch, watchSentence } from './gaugeRead.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const M = (key, z, label = key) => ({ key, label, z });

// ── The thing this file exists for ────────────────────────────────────────────
// Two gauges can print the same score and mean completely different things. Today's
// panels show only the score.
t('a broad gauge and a one-member gauge are told apart at the same score', () => {
  const broad = gauge([M('a', 0.6), M('b', 0.6), M('c', 0.6), M('d', 0.6)]);
  const narrow = gauge([M('a', 2.4), M('b', 0), M('c', 0), M('d', 0)]);
  assert.equal(broad.score, narrow.score, 'the fixture must hold score constant to make the point');
  assert.equal(broad.concentrated, false);
  assert.equal(narrow.concentrated, true, 'one member carrying it all must be flagged');
  assert.equal(narrow.loudest.key, 'a');
});

t('contributions sum to the score exactly, so a receipt can be checked', () => {
  for (const ms of [[M('a', 1), M('b', -0.5), M('c', 2)], [M('a', -3), M('b', 0.25)], [M('a', 0), M('b', 0)]]) {
    const g = gauge(ms);
    const sum = g.members.reduce((s, m) => s + m.share, 0);
    assert.ok(Math.abs(sum - g.score) < 1e-9, `shares sum to ${sum}, score is ${g.score}`);
  }
});

// ── Absence is not agreement ──────────────────────────────────────────────────
t('a member that did not print is absent, never a zero vote', () => {
  const g = gauge([M('a', 2), M('b', null), M('c', undefined), { key: 'd', label: 'd' }]);
  assert.equal(g.present, 1);
  assert.equal(g.coverage, 0.25);
  assert.equal(g.score, 2, 'absent members must not drag the mean toward zero');
  assert.deepEqual(g.absent.sort(), ['b', 'c', 'd']);
  assert.equal(g.thin, true);
});

t('coverage is reported, and a thin read says so in its sentence', () => {
  const thin = gauge([M('a', 1), M('b', null), M('c', null)]);
  assert.match(gaugeSentence(thin, 'the gauge'), /33% coverage/);
  assert.match(gaugeSentence(thin, 'the gauge'), /partial read/);
  const full = gauge([M('a', 1), M('b', 1)]);
  assert.doesNotMatch(gaugeSentence(full, 'the gauge'), /partial read/);
});

// ── Agreement and dissent ─────────────────────────────────────────────────────
t('agreement counts only members sharing the composite sign', () => {
  const g = gauge([M('a', 1), M('b', 1), M('c', -0.2)]);
  assert.equal(g.agree, 2);
  assert.equal(g.agreeOf, 3);
  assert.equal(g.dissent.length, 1);
  assert.equal(g.dissent[0].key, 'c');
});

t('dissenters come back loudest first', () => {
  const g = gauge([M('a', 3), M('b', -0.4), M('c', -1.9), M('d', -0.1)]);
  assert.deepEqual(g.dissent.map(d => d.key), ['c', 'b', 'd']);
});

t('the sentence names the loudest member and the dissent', () => {
  const s = gaugeSentence(gauge([M('ppi', 3.32, 'PPI final demand'), M('ahe', -3.16, 'average hourly earnings'), M('cpi', 0.2, 'CPI')]), 'the inflation gauge');
  assert.match(s, /the inflation gauge reads/);
  assert.match(s, /PPI final demand/);
  assert.match(s, /carrying/);
  assert.match(s, /average hourly earnings .* dissents/);
});

// ── Concentration is measured on gross movement, not on the score ─────────────
t('a score near zero does not make every share look enormous', () => {
  // +2 and -2 cancel to a score of ~0; dividing by the score would explode
  const g = gauge([M('a', 2), M('b', -2), M('c', 0.01)]);
  assert.ok(Math.abs(g.score) < 0.1);
  assert.ok(g.concentration != null && g.concentration <= 1, `concentration ${g.concentration} must stay a proportion`);
  assert.ok(g.concentration < 0.55, 'two equal-and-opposite members are not a concentrated gauge');
});

t('weights are honoured and still sum correctly', () => {
  const g = gauge([{ key: 'a', label: 'a', z: 2, weight: 3 }, { key: 'b', label: 'b', z: 0, weight: 1 }]);
  assert.equal(g.score, 1.5);
  assert.ok(Math.abs(g.members.reduce((s, m) => s + m.share, 0) - g.score) < 1e-9);
});

t('degenerate inputs do not throw', () => {
  assert.equal(gauge([]).verdict, 'EMPTY');
  assert.equal(gauge(null).verdict, 'EMPTY');
  assert.equal(gauge([M('a', null)]).verdict, 'NO DATA');
  assert.equal(gaugeSentence(null), null);
  assert.equal(gaugeSentence(gauge([])), null);
});

// ── The watch ─────────────────────────────────────────────────────────────────
t('a watch will not accept thresholds that let it chatter', () => {
  assert.throws(() => watch(1, { arm: 1.5, standDown: 1.5 }), RangeError);
  assert.throws(() => watch(1, { arm: 1, standDown: 1.5 }), RangeError);
  assert.throws(() => watch(1, { arm: 1.5 }), TypeError);
});

t('it arms at the high line and stays armed through the gap', () => {
  let w = watch(0.5, { arm: 1.5, standDown: 1.0, at: 0 });
  assert.equal(w.armed, false);
  w = watch(1.6, { arm: 1.5, standDown: 1.0, prev: w, at: 1 });
  assert.equal(w.armed, true);
  assert.equal(w.arms, 1);
  // inside the gap: armed, but would not have armed from cold
  w = watch(1.2, { arm: 1.5, standDown: 1.0, prev: w, at: 2 });
  assert.equal(w.armed, true, 'must not stand down until it clears the lower line');
  w = watch(0.9, { arm: 1.5, standDown: 1.0, prev: w, at: 3 });
  assert.equal(w.armed, false);
  assert.equal(w.arms, 1, 'standing down is not a new arming');
});

t('a missing reading holds the state rather than standing down', () => {
  let w = watch(2, { arm: 1.5, standDown: 1, at: 0 });
  assert.equal(w.armed, true);
  w = watch(null, { arm: 1.5, standDown: 1, prev: w, at: 1 });
  assert.equal(w.armed, true, 'no data is not evidence the condition passed');
  assert.equal(w.stale, true);
  assert.match(watchSentence(w), /stale/);
});

t('it counts how long it has held and how many times it has armed', () => {
  let w = watch(2, { arm: 1.5, standDown: 1, at: 10 * 864e5 });
  w = watch(2, { arm: 1.5, standDown: 1, prev: w, at: 12 * 864e5 });
  assert.equal(w.sinceDays, 2);
  w = watch(0, { arm: 1.5, standDown: 1, prev: w, at: 13 * 864e5 });
  w = watch(9, { arm: 1.5, standDown: 1, prev: w, at: 14 * 864e5 });
  assert.equal(w.arms, 2);
});

t('the watch sentence states both thresholds', () => {
  const s = watchSentence(watch(0, { arm: 1.5, standDown: 1, at: 0, label: 'de-anchoring watch' }));
  assert.match(s, /de-anchoring watch is dormant/);
  assert.match(s, /arms above 1.5 and stands down below 1/);
  assert.equal(watchSentence(null), null);
});

// ── Nothing here claims a gauge predicts anything ────────────────────────────
t('the prose makes no forward claim', () => {
  const s = gaugeSentence(gauge([M('a', 3, 'A'), M('b', -1, 'B')]), 'the gauge') + ' '
          + watchSentence(watch(3, { arm: 1.5, standDown: 1, at: 0 }));
  assert.doesNotMatch(s, /\b(will|expect|predict|buy|sell|target|signal)\b/i);
});

console.log(`gaugeRead: ${n} groups, all passed`);
