// The central-bank tone timeline: the shaping added to js/terminal/cbBoardCore.js (phrases, themes, timeline) and the drawing in
// js/terminal/toneTimelineView.js.   node --test js/terminal/toneTimeline.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CB_BANKS, CB_HISTORY, phrasesOf, dimsRaw, themeShift, shapeBank } from './cbBoardCore.js';
import * as TT from './toneTimelineView.js';
import { toneStrip, tileHtml, boardHtml } from './cbBoardView.js';
globalThis.deskAccessState = { role: 'viewer' };

const NOW = Date.parse('2026-11-07T12:00:00Z');
const META = id => CB_BANKS.find(b => b.id === id);
const seg = (type, text) => ({ type, text });

test('the timeline window is the last ten meetings', () => assert.equal(CB_HISTORY, 10));

test('phrases: a removed run followed by an added run, plain words only, the policy words first', () => {
  const segs = [
    seg('same', 'The Committee decided to'), seg('del', '12'), seg('add', '10'),            // vote counts: not a wording change
    seg('del', '2026-09-16'), seg('add', '2026-10-28'),                                       // dates
    seg('del', '.......................'), seg('add', '.......................'),                // page furniture
    seg('del', 'solid'), seg('add', 'strong'),
    seg('del', 'raise'), seg('add', 'maintain'),
    seg('del', 'East.'), seg('add', 'East, including'),                                       // a lone capitalised word is a name
    seg('del', 'slowly. Prices'), seg('add', 'moderately'),                                  // cut across a sentence
    seg('add', 'Values at work'),                                                              // an addition with no removal
  ];
  const out = phrasesOf(segs);
  assert.deepEqual(out[0], { from: 'raise', to: 'maintain' }, 'policy words lead');
  assert.deepEqual(out[1], { from: 'solid', to: 'strong' });
  assert.equal(out.length, 2, 'dates, numbers, dots, names, fragments and bare additions are dropped');
  assert.deepEqual(phrasesOf(null), []);
  assert.deepEqual(phrasesOf([seg('same', 'nothing changed')]), []);
});

test('phrases: a long side is cut at a word boundary with an ellipsis, and the same removed word is not listed twice', () => {
  const long = 'the Committee judges that the risks to the inflation outlook remain tilted to the upside for some time to come';
  const out = phrasesOf([seg('del', 'the risks to the inflation outlook are broadly balanced for now and into next year'), seg('add', long)]);
  assert.equal(out.length, 1);
  assert.equal(phrasesOf([seg('del', 'raise'), seg('add', 'keep'), seg('del', 'raise'), seg('add', 'hold')]).length, 1, 'the same removed word once');
  assert.deepEqual(phrasesOf([seg('del', 'hike'), seg('add', 'hold, and that a measured approach, at this point')]), [], 'a word against a clause is a mismatch, not a swap');
  assert.ok(out[0].to.endsWith('…') && out[0].to.length <= 64 && !/\s…$/.test(out[0].to));
});

test('dimsRaw keeps every scored theme by its key; themeShift names the biggest moves of 0.10 or more', () => {
  const cur = dimsRaw({ dimensions: { inflationConcern: 0.85, laborConcern: 0.2, growthConcern: 0.2, committeeConfidence: 0.78, junk: 9 } });
  assert.deepEqual(Object.keys(cur), ['inflationConcern', 'laborConcern', 'growthConcern', 'committeeConfidence']);
  assert.equal(dimsRaw({}), null);
  const prev = { inflationConcern: 0.6, laborConcern: 0.55, growthConcern: 0.18, committeeConfidence: 0.7 };
  const th = themeShift(cur, prev);
  assert.deepEqual(th.map(x => [x.label, x.delta]), [['Labour', -0.35], ['Prices', 0.25]], 'Committee confidence +0.08 and Growth +0.02 are below 0.10');
  assert.deepEqual(themeShift(cur, null), []);
});

const payload = (score, regime, dims, extra = {}) => ({ kind: 'statement', analysis: { headline: `Tone ${score}`, hawkishScore: score, regime, dimensions: dims ?? { inflationConcern: 0.5 }, whatChanged: 'x', ...(extra.analysis ?? {}) }, diffSegments: extra.diff });
const MEET = ['2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28'].map(date => ({ date }));

test('a bank tile carries the timeline: every meeting in the window, a gap where nothing is stored, and the coverage', () => {
  const reads = {
    '2026-03-18': null, '2026-04-29': payload(0.1, 'NEUTRAL'), '2026-06-17': null, '2026-07-29': payload(0.3, 'HAWKISH'),
    '2026-09-16': payload(0.2, 'MIXED', { inflationConcern: 0.4, laborConcern: 0.6 }),
    '2026-10-28': payload(0.72, 'HAWKISH', { inflationConcern: 0.85, laborConcern: 0.2 }, { diff: [seg('del', 'raise'), seg('add', 'maintain')] }),
  };
  const b = shapeBank(META('fomc'), { meetings: MEET, reads, now: NOW });
  assert.equal(b.timeline.length, 6);
  assert.deepEqual(b.timeline.map(x => !!x.unread), [true, false, true, false, false, false]);
  assert.deepEqual(b.coverage, { read: 4, of: 6 });
  assert.equal(b.timeline.at(-1).score, 0.72);
  assert.deepEqual(b.read.phrases, [{ from: 'raise', to: 'maintain' }]);
  assert.deepEqual(b.themes.map(x => x.label), ['Prices', 'Labour'], 'against the previous read: prices +0.45, labour -0.40');
  assert.equal(b.history.length, 4, 'the scored history is unchanged');
});

test('the ribbon: a path, a glow, the zero line, hollow dots for gaps, dates, a plain-words summary, theme tokens only', () => {
  const tl = [{ date: '2026-04-29', score: 0.1, regime: 'NEUTRAL' }, { date: '2026-06-17', unread: true }, { date: '2026-07-29', score: -0.3, regime: 'DOVISH', headline: 'Eases' }, { date: '2026-10-28', score: 0.72, regime: 'HAWKISH' }];
  const svg = TT.ribbonSvg(tl);
  assert.match(svg, /<svg class="tt"/);
  assert.match(svg, /class="tt-ribbon" pathLength="1"/);
  assert.match(svg, /class="tt-gap"/);
  assert.match(svg, /28 Oct/);
  assert.match(svg, /aria-label="Tone at 3 of the last 4 meetings/);
  assert.match(svg, /no stored read for this meeting/);
  assert.ok(!/#[0-9a-f]{3,8}\b|rgb\(|rgba\(/i.test(svg), 'no hard-coded colour');
  assert.equal(TT.ribbonSvg([{ date: '2026-06-17', unread: true }]), '', 'nothing scored, nothing drawn');
  assert.equal(TT.ribbonSvg(null), '');
  assert.ok(TT.ribbonSvg([{ date: '2026-10-28', score: 0.5 }]).includes('<circle'), 'a single meeting still draws');
});

test('smoothPath stays inside its clamp', () => {
  const d = TT.smoothPath([[0, 10], [10, 90], [20, 12], [30, 80]], 8, 92);
  for (const n of d.match(/-?\d+\.\d/g).filter((_, i) => i % 2 === 1)) assert.ok(+n >= 8 && +n <= 92);
});

test('the RBNZ behind its firewall: the tone is frozen, with the date it froze at, and nothing is estimated', () => {
  const b = shapeBank(META('rbnz'), { meetings: MEET, reads: { '2026-04-29': payload(0.31, 'MIXED') }, now: NOW, headline: { date: '2026-10-28', title: 'OCR held at 2.75%', rate: 2.75 }, blocked: true });
  assert.equal(b.status, 'headline_only');
  const html = TT.frozenHtml(b);
  assert.match(html, /Tone frozen at the last captured statement \(29 Apr, \+0\.31, mixed\)/);
  assert.match(html, /firewall/);
  assert.match(tileHtml(b), /Tone frozen/, 'the tile says so');
  assert.equal(TT.frozenHtml({ status: 'read' }), '');
});

test('the wording swaps and the weight shifts read plainly, and the context line says it is not a signal', () => {
  const b = { read: { phrases: [{ from: 'raise', to: 'maintain' }] }, change: { from: '2026-09-16' }, themes: [{ label: 'Labour', delta: -0.35 }], timeline: [{ date: '2026-10-28', score: 0.7 }], coverage: { read: 1, of: 1 }, status: 'read' };
  const html = TT.stripHtml(b);
  assert.match(html, /Wording that changed since 16 Sep/);
  assert.match(html, /<s>raise<\/s>.*<b>maintain<\/b>/);
  assert.match(html, /Labour ▼0\.35/);
  assert.match(html, /not a direction signal/);
  assert.ok(!/Labour/.test(TT.stripHtml(b, { compact: true })), 'the compact strip (Currency modal) leaves the theme row out');
});

test('the Beige Book chip: release date, tone, its move and the themes that moved most', () => {
  const beige = { id: 'beige', status: 'read', read: { date: '2026-10-14', score: 0.45 }, change: { delta: 0.1 }, themes: [{ label: 'Labour', delta: 0.35 }, { label: 'Prices', delta: -0.1 }, { label: 'Growth', delta: 0.1 }] };
  const html = TT.beigeChipHtml(beige);
  assert.match(html, /Beige Book 14 Oct/);
  assert.match(html, /tone \+0\.45/);
  assert.match(html, /▲ 0\.10/);
  assert.match(html, /Labour ▲0\.35/);
  assert.ok(!/Growth/.test(html), 'two themes at most');
  assert.equal(TT.beigeChipHtml({ status: 'no_read', read: null }), '');
});

test('the Currency modal strip: the bank for that currency, the Beige Book only on USD, a registered surface, no link to the main site', () => {
  const fed = shapeBank(META('fomc'), { meetings: MEET, reads: { '2026-10-28': payload(0.72, 'HAWKISH'), '2026-09-16': payload(0.2, 'MIXED') }, now: NOW });
  const beige = shapeBank(META('beige'), { meetings: [{ date: '2026-09-02' }, { date: '2026-10-14' }], reads: { '2026-10-14': payload(0.45, 'MIXED'), '2026-09-02': payload(0.35, 'MIXED') }, now: NOW });
  const cb = { banks: [fed, beige] };
  const usd = toneStrip(cb, 'USD');
  assert.match(usd, /data-surface="panel\.ccy\.tone"/);
  assert.match(usd, /How the Fed's tone has moved/);
  assert.match(usd, /Beige Book 14 Oct/);
  assert.equal(toneStrip(cb, 'EUR'), '', 'no bank for that currency, nothing drawn');
  assert.equal(toneStrip(null, 'USD'), '');
  assert.ok(!/href=/.test(usd), 'a viewer gets no link');
});

test('the board draws a ribbon in every tile with a read and the Beige chip on the Fed tile only', () => {
  const fed = shapeBank(META('fomc'), { meetings: MEET, reads: { '2026-10-28': payload(0.72, 'HAWKISH'), '2026-09-16': payload(0.2, 'MIXED') }, now: NOW });
  const ecb = shapeBank(META('ecb'), { meetings: MEET, reads: { '2026-10-28': payload(0.2, 'MIXED'), '2026-09-16': payload(0.5, 'HAWKISH') }, now: NOW });
  const beige = shapeBank(META('beige'), { meetings: [{ date: '2026-10-14' }], reads: { '2026-10-14': payload(0.45, 'MIXED') }, now: NOW });
  const html = boardHtml({ ok: true, banks: [fed, ecb, beige], ranking: [], counts: { read: 3, total: 3 }, asOf: '2026-11-07T12:00:00Z' });
  assert.equal((html.match(/class="tt"/g) ?? []).length, 3);
  assert.equal((html.match(/class="tt-bb"/g) ?? []).length, 1, 'the Fed tile only');
});
