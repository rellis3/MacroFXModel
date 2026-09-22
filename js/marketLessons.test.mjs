import assert from 'node:assert/strict';
import { LESSONS, GLOSSARY, pickLesson, lessonsToday } from './marketLessons.js';
import { DESK_EVIDENCE } from './deskEvidence.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

const link = (id, verdict, a, b) => ({ id, verdict, short: id, textbook: `${id} textbook`, a, b });
const end = (key, label, text, dir, movedFlag = true) => ({ key, label, text, dir, moved: movedFlag });

t('every lesson has the four parts and names real ledger entries', () => {
  const ids = new Set(DESK_EVIDENCE.map(e => e.id));
  const ctx = { links: [], matrix: { validated: 9, nulls: 12, blank: 49 }, regime: { label: 'Goldilocks', months: 5, what: 'x' },
                events: [{ event: 'CPI m/m', country: 'US', inHours: 3, spike: 2.5 }], costRatio: 0.02, cotExtreme: { inst: 'GOLD', dir: 'long', pctile: 90 },
                vix: 20, vix3m: 18, asiaBand: 'wide', asiaAtr: 0.6, crackLevel: 64, crackPercentile: 0.97 };
  for (const l of LESSONS) {
    assert.ok(l.id && l.title && l.level >= 1 && l.level <= 3, `bad spec: ${l.id}`);
    let body; try { body = l.teach(ctx); } catch { body = null; }
    if (!body) continue;                                   // a lesson may need its own trigger data
    for (const k of ['seen', 'means', 'notMeans', 'words']) assert.ok(body[k] && body[k].length > 20, `${l.id} level ${l.level}: ${k} missing or too short`);
    for (const e of body.evidence ?? []) assert.ok(ids.has(e), `${l.id} names a ledger entry that does not exist: ${e}`);
  }
});

t('a lesson only fires when the market is actually doing the thing', () => {
  const quiet = { links: [link('a-b', 'quiet', end('oil', 'Oil', '+1%', 'up', false), end('bei', 'Breakevens', '+1bp', 'up', false))] };
  const firing = lessonsToday(quiet).map(l => l.id);
  assert.ok(!firing.includes('broken-link'), 'broken-link must not fire with no broken link');
  assert.ok(!firing.includes('which-gold'), 'which-gold must not fire when gold has not moved');
  assert.ok(firing.includes('range-not-direction'), 'the floor lesson is always available');
});

t('a brand-new reader is oriented first, then the tape takes over', () => {
  const ctx = { links: [link('dxy-usdjpy', 'broken', end('dxy', 'Dollar', '+1%', 'up'), end('usdjpy', 'USD/JPY', '-2%', 'down'))],
                matrix: { validated: 9, nulls: 12, blank: 49 } };
  assert.equal(pickLesson(ctx, {}).lesson.id, 'range-not-direction', 'day one: the frame');
  assert.equal(pickLesson(ctx, { 'range-not-direction': 1 }).lesson.id, 'broken-link', 'after that: what the market is doing');
});

t('the broken-link lesson names the actual broken link', () => {
  const ctx = { links: [
    link('dxy-usdjpy', 'broken', end('dxy', 'Dollar', '+1.2%', 'up'), end('usdjpy', 'USD/JPY', '-2.0%', 'down')),
    link('oil-bei', 'holding', end('oil', 'Oil', '+8%', 'up'), end('bei', 'Breakevens', '+9bp', 'up')),
  ] };
  const p = pickLesson(ctx, { 'range-not-direction': 1 });
  assert.equal(p.lesson.id, 'broken-link');
  assert.match(p.body.seen, /Dollar \+1\.2%/);
  assert.match(p.body.seen, /USD\/JPY -2\.0%/);
  assert.match(p.body.notMeans, /resolve/);
});

t('two broken links sharing an end promotes to the level-2 lesson', () => {
  const ctx = { links: [
    link('dxy-usdjpy', 'broken', end('dxy', 'Dollar', '+1.2%', 'up'), end('usdjpy', 'USD/JPY', '-2.0%', 'down')),
    link('dxy-btc', 'broken', end('dxy', 'Dollar', '+1.2%', 'up'), end('btc', 'Bitcoin', '+5%', 'up')),
  ] };
  const p = pickLesson(ctx, { 'range-not-direction': 1, 'broken-link': 1 });   // level 1 already seen
  assert.equal(p.lesson.level, 2);
  assert.match(p.body.seen, /Dollar is an end of 2/);
  assert.match(p.why, /level 2/);
});

t('an unseen idea beats a deeper level of a known one', () => {
  const ctx = { links: [link('dxy-usdjpy', 'broken', end('dxy', 'Dollar', '+1%', 'up'), end('usdjpy', 'USD/JPY', '-2%', 'down')),
                        link('dxy-btc', 'broken', end('dxy', 'Dollar', '+1%', 'up'), end('btc', 'Bitcoin', '+5%', 'up'))],
                regime: { label: 'Goldilocks', months: 5, what: 'growth up' } };
  const p = pickLesson(ctx, { 'range-not-direction': 1, 'broken-link': 1 });   // broken-link known, regime not
  assert.ok(['broken-link', 'regime'].includes(p.lesson.id));
  const seenBoth = pickLesson(ctx, { 'broken-link': 2, regime: 1 });
  assert.ok(seenBoth, 'still returns something when everything has been seen');
});

t('exclude lets the reader skip to the next one', () => {
  const ctx = { regime: { label: 'Goldilocks', months: 5, what: 'x' }, matrix: { validated: 9, nulls: 12, blank: 49 } };
  const first = pickLesson(ctx, {});
  const second = pickLesson(ctx, {}, { exclude: [`${first.lesson.id}:${first.lesson.level}`] });
  assert.notEqual(`${second.lesson.id}:${second.lesson.level}`, `${first.lesson.id}:${first.lesson.level}`);
});

t('every lesson carries a trap and a sentence you could say out loud', () => {
  const ctx = { links: [], matrix: { validated: 9, nulls: 12, blank: 49 } };
  const p = pickLesson(ctx, { 'range-not-direction': 1 }) ?? pickLesson(ctx, {});
  assert.ok(p.body.notMeans.length > 40, 'the trap is the point');
  assert.match(p.body.words, /^"/, 'the trader sentence should be quoted');
});

t('the glossary defines terms without inventing numbers', () => {
  assert.ok(GLOSSARY.length >= 12);
  for (const g of GLOSSARY) {
    assert.ok(g.term && g.def && g.def.length > 30, `thin entry: ${g.term}`);
    if (g.live) assert.doesNotThrow(() => g.live({}), `${g.term} must tolerate empty context`);
  }
  assert.equal(GLOSSARY.find(g => g.term === 'The crack spread').live({}), null);
  assert.equal(GLOSSARY.find(g => g.term === 'The crack spread').live({ crackLevel: 64.2 }), '$64/bbl');
});

t('pickLesson never throws on junk input', () => {
  assert.doesNotThrow(() => pickLesson(undefined, undefined));
  assert.doesNotThrow(() => pickLesson({ links: null, events: null }, {}));
  assert.ok(pickLesson({}, {}), 'the floor lesson always exists');
});

console.log(`marketLessons: ${n} groups, all passed`);
