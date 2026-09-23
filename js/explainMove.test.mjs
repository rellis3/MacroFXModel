import assert from 'node:assert/strict';
import { explainMove } from './explainMove.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

const row = (key, label, change, z, kind = 'price') => ({ key, label, change, z, kind, what: `what ${label} is` });
const lk = (id, a, b, labelA, labelB, corr, weak = false) => ({ id, a, b, labelA, labelB, corr, weak, normally: `${labelA} drives ${labelB} because reasons.` });

// gold -6.4% (z -1.7) with real yields +24bp (z +1.4): the textbook -0.6 link explains it
const BOARD = [row('gold', 'Gold', -6.4, -1.7), row('tips', 'Real 10-year', 24, 1.4, 'rate'),
               row('dxy', 'Broad dollar', 0.1, 0.05), row('vix', 'VIX', -1, -0.2, 'level')];
const LINKS = [lk('tips-gold', 'tips', 'gold', 'Real 10-year', 'Gold', -0.62),
               lk('dxy-gold', 'dxy', 'gold', 'Broad dollar', 'Gold', -0.43)];

t('the market that actually explains it is named, and the one that did not is too', () => {
  const r = explainMove('gold', BOARD, LINKS);
  assert.equal(r.verdict.kind, 'one');
  assert.match(r.verdict.text, /Real 10-year is the candidate/);
  assert.match(r.verdict.text, /\+24bp/);
  // the dollar barely moved, and saying so is half the answer
  const dollar = r.candidates.find(c => c.key === 'dxy');
  assert.equal(dollar.consistent, false);
  assert.match(dollar.why, /barely moved, so it cannot be the reason/);
});

t('a partner that moved the WRONG way is rejected, not counted as support', () => {
  // gold down, and the dollar ALSO down: -0.43 says they move opposite, so a falling
  // dollar should have LIFTED gold. It cannot be the explanation.
  const b = [...BOARD.filter(x => x.key !== 'dxy'), row('dxy', 'Broad dollar', -2.4, -1.6)];
  const d = explainMove('gold', b, LINKS).candidates.find(c => c.key === 'dxy');
  assert.equal(d.consistent, false);
  assert.match(d.why, /wrong way for this to be the explanation/);
});

t('"nothing explains it" is the answer it exists to give', () => {
  const b = [row('btc', 'Bitcoin', 10.3, 2.1), row('dxy', 'Broad dollar', 0.1, 0.05)];
  const l = [lk('dxy-btc', 'dxy', 'btc', 'Broad dollar', 'Bitcoin', -0.05)];
  const r = explainMove('btc', b, l);
  assert.equal(r.verdict.kind, 'unexplained');
  assert.match(r.verdict.text, /driver is OFF this board/);
  assert.match(r.verdict.text, /a finding, not a gap/);
  assert.equal(r.explained.length, 0);
});

t('a loose link can never be an explanation, however far the partner moved', () => {
  const b = [row('btc', 'Bitcoin', 10.3, 2.1), row('dxy', 'Broad dollar', -4, -3.2)];
  const c = explainMove('btc', b, [lk('dxy-btc', 'dxy', 'btc', 'Broad dollar', 'Bitcoin', -0.05)]).candidates[0];
  assert.equal(c.consistent, false);
  assert.equal(c.weight, 0);
  assert.match(c.why, /too loose to explain anything/);
});

t('a big number that is not rare is told it is not rare, in those words', () => {
  // the page's core lesson: +5.2% on the Nasdaq is an ordinary month, and saying
  // "it has not moved enough" instead reads as nonsense to anyone looking at +5.2%
  const b = [row('nq', 'Nasdaq', 5.2, 0.7)];
  const r = explainMove('nq', b, []);
  assert.match(r.verdict.text, /\+5\.2% sounds like a lot/);
  assert.match(r.verdict.text, /ordinary twenty sessions \(z \+0\.7\)/);
});

t('a market that has not moved is not explained, it is left alone', () => {
  const r = explainMove('dxy', BOARD, LINKS);
  assert.equal(r.verdict.kind, 'quiet');
  assert.match(r.verdict.text, /that is an ordinary twenty sessions/);
  assert.match(r.verdict.text, /most common answer on any board/);
  assert.equal(r.moved, false);
});

t('several fitting candidates are reported as several, not resolved into one', () => {
  const b = [row('gold', 'Gold', -6.4, -1.7), row('tips', 'Real 10-year', 24, 1.4, 'rate'),
             row('dxy', 'Broad dollar', 2.6, 1.9)];
  const r = explainMove('gold', b, LINKS);
  assert.equal(r.verdict.kind, 'several');
  assert.match(r.verdict.text, /cannot separate them/);
  assert.match(r.verdict.text, /one story wearing several names/);
});

t('candidates are ranked by how much they can actually carry', () => {
  const b = [row('gold', 'Gold', -6.4, -1.7), row('tips', 'Real 10-year', 24, 1.4, 'rate'),
             row('dxy', 'Broad dollar', 2.6, 1.9)];
  const r = explainMove('gold', b, LINKS);
  for (let i = 1; i < r.candidates.length; i++)
    assert.ok(r.candidates[i - 1].weight >= r.candidates[i].weight, 'weights must descend');
  assert.ok(r.candidates[0].weight > 0);
});

t('it never claims causation, in any verdict', () => {
  const all = [explainMove('gold', BOARD, LINKS), explainMove('dxy', BOARD, LINKS),
               explainMove('btc', [row('btc', 'Bitcoin', 10, 2.1)], [])];
  for (const r of all.filter(Boolean)) {
    assert.doesNotMatch(r.verdict.text, /\b(caused|because of|will|therefore)\b/i, r.verdict.text);
    assert.match(r.caveat, /which story FITS, never which one is true/);
  }
});

t('an unknown market or a broken board returns null rather than guessing', () => {
  assert.equal(explainMove('nope', BOARD, LINKS), null);
  assert.equal(explainMove('gold', null, null), null);
  assert.deepEqual(explainMove('gold', BOARD, []).explained, []);
});

console.log(`explainMove: ${n} groups, all passed`);
