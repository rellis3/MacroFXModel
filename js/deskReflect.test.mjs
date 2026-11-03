// Tests for js/deskReflect.js.   node js/deskReflect.test.mjs
import assert from 'node:assert/strict';
import { reflectionSections, movers, memoryFeed } from './deskReflect.js';
import { validateReflection } from './deskSchemas.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

const run = { head: { ok: true, book: { global: { tone: 'risk_off' }, risks: ['NFP'], gaps: ['fed-path stale'], instruments: {
  EURUSD: { rating: 'SHORT', conviction: 'medium', size: 0.5, why: 'EUR weak' }, GOLD: { rating: 'SHORT', size: 1, why: 'USD firm' }, NQ: { rating: 'LONG', size: 1, why: 'x' } } } },
  debate: { global: { view: { tone: 'risk_off', conviction: 'medium', summary: 'Credit wider.' } }, currency: { view: { currencies: { USD: { bias: 1, why: 'Fed' } } } }, risk: { risk_conservative: { view: { warnings: ['Election'] } } } } };
const score = { eligible: true, S: 0.31, unweighted: 0.2, drift: -0.1, placebo: { mean: 0.01, p95: 0.4 }, control: { unweighted: 0.05 }, strong: { n: 0, mean: null }, plain: { n: 2, mean: 0.2 }, race: { resolved: 2, leanFirst: 1 },
  cards: { EURUSD: { dir: -1, R: 1.2, race: 1, size: 0.5 }, GOLD: { dir: -1, R: -0.4, race: -1, size: 1 }, NQ: { dir: 1, missing: 'no M1 bars in the window' } } };

t('the reviewer sees the score, every card with its result and the morning\'s rulings', () => {
  const s = Object.fromEntries(reflectionSections(run, score));
  assert.match(s['The score'], /Day score .*0\.31/); assert.match(s['The score'], /counts in the pre-registered test/);
  assert.match(s['Every live card, with its result'], /EURUSD: SHORT \(medium\) size 0\.5 · R 1\.2 u · lean-side p50 first/);
  assert.match(s['Every live card, with its result'], /NQ: LONG size 1 · not scored/);
  assert.equal(s["The morning's global ruling"].tone, 'risk_off');
  assert.deepEqual(s["The risk desk's warnings and the Head's risks"].warnings, ['Election']);
});

t('movers: the cards that made and lost the day, by size x R', () => {
  const m = movers(run, score);
  assert.equal(m.best[0].inst, 'EURUSD'); assert.equal(m.worst[0].inst, 'GOLD');
});

t('memory: newest first, labelled as anecdotes, lessons carried with their scope', () => {
  const ref = validateReflection({ headline: 'Short EUR worked, gold did not', lessons: [{ lesson: 'Check the real-yield chain before shorting gold on USD alone.', scope: 'asset', about: 'GOLD' }] }).value;
  const f = memoryFeed([{ date: '2026-11-04', score, reflection: ref, savedAt: 'a' }, { date: '2026-11-05', score: { S: -0.2 }, reflection: null, savedAt: 'b' }]);
  assert.match(f.label, /anecdotes.*not evidence/);
  assert.equal(f.days[0].date, '2026-11-05'); assert.equal(f.days[1].lessons[0], 'asset (GOLD): Check the real-yield chain before shorting gold on USD alone.');
  assert.equal(f.days[1].counts, true);
});

t('a reflection needs a headline and at least one lesson; at most five are kept', () => {
  assert.equal(validateReflection({ headline: 'x', lessons: [] }).ok, false);
  assert.equal(validateReflection({ lessons: [{ lesson: 'a' }] }).ok, false);
  assert.equal(validateReflection({ headline: 'x', lessons: Array.from({ length: 9 }, () => ({ lesson: 'a', scope: 'global' })) }).value.lessons.length, 5);
});

console.log(`deskReflect: ${n} tests passed`);
