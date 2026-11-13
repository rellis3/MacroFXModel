// The Desk Terminal's central-bank statement board: the shaping (js/terminal/cbBoardCore.js, shared with /api/cb-board) and the
// HTML (js/terminal/cbBoardView.js).   node --test js/terminal/cbBoard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CB_BANKS, pastDates, nextMeeting, voteText, dimsOf, readOf, shapeBank, rankBanks, boardPayload } from './cbBoardCore.js';
import { boardHtml, tileHtml, rankHtml, toneBar, spark, changeHtml, dimsHtml, dshort } from './cbBoardView.js';
globalThis.deskAccessState = { role: 'owner' };   // the owner sees the links to the main site (js/terminal/links.test.mjs covers the viewer)

const NOW = Date.parse('2026-11-07T12:00:00Z');
const META = id => CB_BANKS.find(b => b.id === id);
const payload = (score, extra = {}) => ({
  kind: 'statement',
  analysis: { headline: 'Holds, leans hawkish', hawkishScore: score, regime: score > 0.2 ? 'HAWKISH' : score < -0.2 ? 'DOVISH' : 'NEUTRAL', confidence: 'MEDIUM',
    dimensions: { inflationConcern: 0.8, laborConcern: 0.4, growthConcern: 0.3, financialStabilityConcern: 0.1, committeeConfidence: 0.5 },
    whatChanged: 'Dropped the word "patient".', voteNote: 'Two dissents.', ...(extra.analysis ?? {}) },
  vote: extra.vote ?? null,
});
const MEET = [{ date: '2026-07-29' }, { date: '2026-09-16' }, { date: '2026-10-28' }, { date: '2026-12-09' }];

test('there are nine tiles: eight banks and the Beige Book, each with a page to read the full text', () => {
  assert.equal(CB_BANKS.length, 9);
  assert.deepEqual(CB_BANKS.map(b => b.ccy).sort(), ['AUD', 'CAD', 'CHF', 'EUR', 'GBP', 'JPY', 'NZD', 'USD', 'USD']);
  for (const b of CB_BANKS) { assert.match(b.page, /\.html$/); assert.ok(b.prefix.endsWith('_')); }
  assert.equal(new Set(CB_BANKS.map(b => b.id)).size, 9);
});

test('past meetings and the next one, counted in calendar days', () => {
  assert.deepEqual(pastDates(MEET, NOW), ['2026-07-29', '2026-09-16', '2026-10-28']);
  assert.deepEqual(pastDates(MEET, NOW, 2), ['2026-09-16', '2026-10-28']);
  assert.deepEqual(nextMeeting(MEET, NOW), { date: '2026-12-09', days: 32 });
  assert.equal(nextMeeting([{ date: '2026-11-07' }], NOW).days, 0, 'a meeting today is today');
  assert.equal(nextMeeting([{ date: '2026-01-01' }], NOW), null);
  assert.deepEqual(pastDates(undefined, NOW), []);
});

test('the vote reads in every shape the banks store', () => {
  assert.equal(voteText({ for: 9, against: 3, dissenters: ['A. B.', 'C. D.'] }), '9–3 · against: A. B., C. D.');
  assert.equal(voteText({ for: 12, against: 0, dissenters: [] }), 'unanimous');
  assert.equal(voteText({ unanimous: true, majority: null, minority: null }), 'unanimous');
  assert.equal(voteText({ unanimous: false, majority: 5, minority: 4 }), '5–4');
  assert.equal(voteText({ unanimous: true, consensus: true }), 'consensus, no formal vote');
  assert.equal(voteText(null), null);
  assert.equal(voteText({}), null);
});

test('dimensions: magnitudes in drawing order, missing ones left out', () => {
  assert.deepEqual(dimsOf(payload(0.3).analysis).map(x => x.k), ['inflation', 'labour', 'growth', 'stability']);
  assert.deepEqual(dimsOf({ dimensions: { inflationConcern: 0.5 } }).map(x => x.k), ['inflation']);
  assert.equal(dimsOf({}), null);
  assert.equal(dimsOf({ dimensions: {} }), null);
});

test('a stored payload with no score is no read', () => {
  assert.equal(readOf('2026-10-28', { analysis: { headline: 'x' } }, NOW), null);
  assert.equal(readOf('2026-10-28', null, NOW), null);
  const r = readOf('2026-10-28', payload(0.5, { vote: { unanimous: true } }), NOW);
  assert.equal(r.score, 0.5); assert.equal(r.vote, 'unanimous'); assert.equal(r.ageDays, 10);
});

test('a bank with a read for its newest meeting: tone, change against the meeting before, history, next meeting', () => {
  const reads = { '2026-07-29': payload(0.1), '2026-09-16': payload(0.3), '2026-10-28': payload(0.55, { vote: { for: 9, against: 3, dissenters: ['X Y'] } }) };
  const b = shapeBank(META('fomc'), { meetings: MEET, reads, now: NOW, rate: { rate: 4.0, asOf: '2026-10-29' } });
  assert.equal(b.status, 'read'); assert.equal(b.read.date, '2026-10-28'); assert.equal(b.read.score, 0.55);
  assert.deepEqual(b.change, { delta: 0.25, from: '2026-09-16', fromScore: 0.3 });
  assert.deepEqual(b.history.map(h => h.score), [0.1, 0.3, 0.55]);
  assert.equal(b.read.vote, '9–3 · against: X Y');
  assert.deepEqual(b.next, { date: '2026-12-09', days: 32 });
  assert.deepEqual(b.rate, { rate: 4, asOf: '2026-10-29' });
  assert.equal(b.unreadMeeting, null);
});

test('the change is against the previous READ, so a gap in the record does not invent one', () => {
  const reads = { '2026-07-29': payload(0.1), '2026-09-16': null, '2026-10-28': payload(-0.2) };
  const b = shapeBank(META('ecb'), { meetings: MEET, reads, now: NOW });
  assert.equal(b.status, 'read');
  assert.deepEqual(b.change, { delta: -0.3, from: '2026-07-29', fromScore: 0.1 });
});

test('NO READ: the newest meeting has no analysis, the last read is kept but marked older, and it is never ranked', () => {
  const reads = { '2026-07-29': payload(0.2), '2026-09-16': payload(0.4), '2026-10-28': null };
  const b = shapeBank(META('rba'), { meetings: MEET, reads, now: NOW });
  assert.equal(b.status, 'no_read'); assert.equal(b.unreadMeeting, '2026-10-28'); assert.equal(b.read.date, '2026-09-16');
  assert.deepEqual(rankBanks([b]), [], 'last meeting\'s tone is not today\'s');
  const none = shapeBank(META('snb'), { meetings: MEET, reads: {}, now: NOW });
  assert.equal(none.status, 'no_read'); assert.equal(none.read, null); assert.equal(none.change, null);
});

test('RBNZ behind its firewall: headline only, no tone, and it says the statement is blocked', () => {
  const dec = { date: '2026-10-28', title: 'OCR held at 2.75%', rate: 2.75 };
  const b = shapeBank(META('rbnz'), { meetings: MEET, reads: {}, now: NOW, headline: dec, blocked: true });
  assert.equal(b.status, 'headline_only'); assert.equal(b.read, null); assert.equal(b.decision.rate, 2.75); assert.equal(b.blocked, true);
  const h = tileHtml(b);
  assert.match(h, /OCR held at 2\.75%/); assert.match(h, /blocked by the RBNZ.s firewall \(403\)/); assert.match(h, /headline only/);
  assert.doesNotMatch(h, /tone <b/i, 'no tone score is shown for a blocked bank');
  const notBlocked = tileHtml(shapeBank(META('rbnz'), { meetings: MEET, reads: {}, now: NOW, headline: dec, blocked: false }));
  assert.doesNotMatch(notBlocked, /firewall/); assert.match(notBlocked, /not been captured/);
  // a bank with a real read is never replaced by a headline
  const read = shapeBank(META('rbnz'), { meetings: MEET, reads: { '2026-10-28': payload(0.1) }, now: NOW, headline: dec, blocked: true });
  assert.equal(read.status, 'read');
});

test('ranking: hawkish to dovish, only current reads, Beige Book left out', () => {
  const mk = (id, s) => shapeBank(META(id), { meetings: MEET, reads: { '2026-09-16': payload(s - 0.1), '2026-10-28': payload(s) }, now: NOW });
  const banks = [mk('fomc', 0.1), mk('boj', 0.7), mk('ecb', -0.4), mk('beige', 0.9), shapeBank(META('snb'), { meetings: MEET, reads: {}, now: NOW })];
  assert.deepEqual(rankBanks(banks).map(x => x.bank), ['BoJ', 'Fed', 'ECB']);
  const p = boardPayload(banks, { now: NOW });
  assert.deepEqual(p.counts, { read: 4, noRead: 1, headlineOnly: 0, total: 5 });
  assert.equal(p.ok, true); assert.equal(p.asOf, '2026-11-07T12:00:00.000Z');
});

test('the tiles draw tone, change, vote, dimensions, what changed, next meeting and a link to the full read', () => {
  const reads = { '2026-09-16': payload(0.3), '2026-10-28': payload(0.55, { vote: { for: 9, against: 3, dissenters: ['X Y'] } }) };
  const h = tileHtml(shapeBank(META('fomc'), { meetings: MEET, reads, now: NOW, rate: { rate: 4, asOf: '2026-10-29' } }));
  assert.match(h, /\+0\.55/); assert.match(h, /▲ \+0\.25/); assert.match(h, /vs 16 Sep/);
  assert.match(h, /9–3 · against: X Y/); assert.match(h, /Inflation/); assert.match(h, /0\.80/);
  assert.match(h, /What changed:/); assert.match(h, /Next 9 Dec \(in 32 days\)/); assert.match(h, /4\.00%/);
  assert.match(h, /href="fomc-sentiment\.html"/); assert.match(h, /gold/);
  assert.doesNotMatch(h, /undefined|NaN|null/);
});

test('a bank that publishes no vote says so; the Beige Book does not pretend to have one', () => {
  const reads = { '2026-10-28': payload(0.0) };
  assert.match(tileHtml(shapeBank(META('boc'), { meetings: MEET, reads, now: NOW })), /No vote published/);
  assert.doesNotMatch(tileHtml(shapeBank(META('beige'), { meetings: MEET, reads, now: NOW })), /No vote published/);
});

test('no read: the tile names the meeting and shows the older read as older, not as today\'s', () => {
  const h = tileHtml(shapeBank(META('rba'), { meetings: MEET, reads: { '2026-09-16': payload(0.4) }, now: NOW }));
  assert.match(h, /no read/); assert.match(h, /No read yet for the 28 Oct meeting/); assert.match(h, /older than the latest meeting/);
  assert.match(tileHtml(shapeBank(META('snb'), { meetings: MEET, reads: {}, now: NOW })), /No read yet for the 28 Oct meeting/);
  assert.match(tileHtml(shapeBank(META('snb'), { meetings: [{ date: '2026-12-09' }], reads: {}, now: NOW })), /No statement has been read yet/);
});

test('anything the model wrote is escaped', () => {
  const evil = payload(0.2, { analysis: { headline: '<script>alert(1)</script>', whatChanged: '"><img src=x onerror=1>', voteNote: '<b>' } });
  const h = tileHtml(shapeBank(META('fomc'), { meetings: MEET, reads: { '2026-10-28': evil }, now: NOW }));
  assert.doesNotMatch(h, /<script>|<img |<b>x|onerror=1>/); assert.match(h, /&lt;script&gt;/);
});

test('the board: header with the evidence stamp, nine tiles, the ranking with the priced path, a footnote that says it is not a lean', () => {
  const mk = (id, s) => shapeBank(META(id), { meetings: MEET, reads: { '2026-09-16': payload(s - 0.1), '2026-10-28': payload(s) }, now: NOW });
  const banks = CB_BANKS.map((m, i) => (m.id === 'rbnz' ? shapeBank(m, { meetings: MEET, reads: {}, now: NOW, headline: { date: '2026-10-28', title: 'OCR held at 2.75%', rate: 2.75 }, blocked: true }) : mk(m.id, 0.6 - i * 0.12)));
  const d = boardPayload(banks, { now: NOW });
  const h = boardHtml(d, { cbx: { USD: { m6: { bp: -37 } }, EUR: { m6: { bp: 12 } } } });
  assert.match(h, /Central-bank statements/); assert.match(h, /description only/); assert.match(h, /cb-tone-direction/);
  assert.equal((h.match(/data-cb="/g) ?? []).length, 9);
  assert.match(h, /Hawkish to dovish/); assert.match(h, /Priced, ~6 months/); assert.match(h, /-37bp/); assert.match(h, /\+12bp/);
  assert.match(h, /8 of 9 have a read/); assert.match(h, /no current read: RBNZ/);
  assert.doesNotMatch(h, /undefined|NaN/);
  assert.doesNotMatch(boardHtml(d), /Priced, ~6 months/, 'no futures feed, no priced column');
});

test('loading and error states are plain', () => {
  assert.match(boardHtml(undefined), /Reading the statements/);
  assert.match(boardHtml({ ok: false, error: 'kv down' }), /kv down/);
  assert.equal(rankHtml({ ranking: [] }), '');
});

test('the small parts', () => {
  assert.equal(dshort('2026-10-28'), '28 Oct'); assert.equal(dshort(null), '–');
  assert.match(toneBar(0.5), /left:50%;width:25\.0%/); assert.match(toneBar(-1), /right:50%;width:50\.0%/); assert.equal(toneBar(null), '');
  assert.equal(spark([{ score: 0.1 }]), ''); assert.match(spark([{ score: 0.1 }, { score: 0.4 }, { score: -0.2 }]), /<svg/);
  assert.match(changeHtml({ delta: 0.02, from: '2026-09-16', fromScore: 0.3 }), /unchanged vs 16 Sep/);
  assert.match(changeHtml({ delta: -0.3, from: '2026-09-16', fromScore: 0.3 }), /▼ -0\.30/); assert.equal(changeHtml(null), '');
  assert.equal(dimsHtml(null), ''); assert.match(dimsHtml([{ label: 'Growth', v: 0.5 }]), /width:50%/);
});
