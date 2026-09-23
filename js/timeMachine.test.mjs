import assert from 'node:assert/strict';
import { episodes, resolveIndex, context, whatFollowed } from './timeMachine.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

const N = 900;
const dates = Array.from({ length: N }, (_, i) => {
  const d = new Date(Date.UTC(2022, 0, 3) + i * 864e5); return d.toISOString().slice(0, 10);
});
let s = 7; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
const walk = (st, sp) => { let v = st; return dates.map(() => (v += rnd() * sp)); };

/** A bundle with a crash planted at a known index. */
function withCrash(at) {
  const spx = walk(4000, 15), vix = walk(17, 0.3), us2y = walk(3, 0.02), gold = walk(1900, 8);
  for (let k = 0; k <= 20; k++) { const i = at - 20 + k; if (i >= 0) { spx[i] *= 1 - 0.018 * k; vix[i] *= 1 + 0.05 * k; } }
  for (let i = at + 1; i < N; i++) { spx[i] *= spx[at] / spx[at + 1] || 1; }
  return { dates, series: { spx, vix, us2y, gold } };
}

t('episodes are found in the data, not hard-coded', () => {
  const b = withCrash(500);
  const eps = episodes(b);
  assert.ok(eps.length >= 4, `expected several episodes, got ${eps.length}`);
  const near = eps.filter(e => Math.abs(e.i - 500) <= 25);
  assert.ok(near.length >= 1, 'the planted crash must be found');
  assert.ok(near.some(e => e.kind === 'Equity drawdown' || e.kind === 'Fear spike'));
  for (const e of eps) {
    assert.ok(e.date && e.note && e.kind, 'every episode needs a date, a kind and a note');
    assert.ok(e.i >= 300, 'nothing before the warm-up, where there is no history to score against');
  }
});

t('the five worst days of one crash are one episode, not five', () => {
  const eps = episodes(withCrash(500), { apart: 60 });
  for (const kind of [...new Set(eps.map(e => e.kind))]) {
    const same = eps.filter(e => e.kind === kind).map(e => e.i).sort((a, b) => a - b);
    for (let k = 1; k < same.length; k++)
      assert.ok(same[k] - same[k - 1] >= 60, `${kind}: ${same[k - 1]} and ${same[k]} are the same event twice`);
  }
});

t('episodes come back newest first', () => {
  const eps = episodes(withCrash(500));
  for (let k = 1; k < eps.length; k++) assert.ok(eps[k - 1].date >= eps[k].date, 'newest first');
});

t('a weekend resolves to the session before it, never forward', () => {
  const b = withCrash(500);
  const exact = resolveIndex(b, b.dates[400]);
  assert.equal(exact, 400);
  // a date between two sessions must land on the EARLIER one -- landing forward would
  // show a board built from data that did not exist yet
  const between = resolveIndex(b, b.dates[400] + 'T23:59');
  assert.ok(b.dates[between] <= b.dates[400] + 'T23:59');
  assert.equal(resolveIndex(b, '1990-01-01'), 0);
  assert.equal(resolveIndex(b, '2099-01-01'), N - 1);
  assert.equal(resolveIndex(b, 12345), N - 1, 'an index past the end clamps');
  assert.equal(resolveIndex(b, -5), 0);
  assert.equal(resolveIndex({ dates: [] }, 'x'), null);
});

t('a date with no complete month after it refuses to say what followed', () => {
  const b = withCrash(500);
  const recent = context(b, N - 5);
  assert.equal(recent.canScore, false);
  assert.equal(recent.after, null);
  assert.match(whatFollowed(recent), /not yet a full month/);
  const old = context(b, 500);
  assert.equal(old.canScore, true);
  assert.ok(old.after.spx != null);
});

t('live is live, and says nothing about the future', () => {
  const c = context(withCrash(500), N - 1);
  assert.equal(c.isLive, true);
  assert.equal(c.sessionsBack, 0);
  assert.equal(whatFollowed(c), null, 'today has no "what followed"');
});

t('what followed reads forward, and says so', () => {
  const txt = whatFollowed(context(withCrash(500), 500));
  assert.match(txt, /Over the 20 sessions after this, the S&P was (up|down)/);
  assert.match(txt, /read it forward, not backward/);
});

t('a thin or broken bundle returns nothing rather than throwing', () => {
  for (const bad of [null, {}, { dates: [] }, { dates: ['a'], series: {} }]) {
    assert.doesNotThrow(() => episodes(bad));
    assert.deepEqual(episodes(bad), []);
    assert.doesNotThrow(() => context(bad, 0));
  }
});

console.log(`timeMachine: ${n} groups, all passed`);
