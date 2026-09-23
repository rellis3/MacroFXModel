import assert from 'node:assert/strict';
import { readBook, bookFindings, parseSavedAt, OI_TO_BOARD, OI_LABEL, BOOK_FRESH_H } from './oiBoard.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

const AT = '22/09/2026, 06:38:57';
const NOW = Date.UTC(2026, 8, 22, 12, 0, 0);          // ~5h after that capture

const pair = (o = {}) => ({ pair: 'EUR/USD', spot: 1.1433, callWall: 1.1461, putWall: 1.1436,
  maxPain: 1.1611, regime: 'BREAKOUT', pcRatio: 1.94, dte: 17, savedAt: AT, ...o });
const today = (...ps) => ({ ok: true, pairs: ps.length ? ps : [pair()] });

t('a UK-formatted stamp is parsed day-first, not month-first', () => {
  // 22/09 is unambiguous, but 09/10 is the trap: month-first reads it as September.
  assert.equal(parseSavedAt('10/09/2026, 06:00:00'), Date.UTC(2026, 8, 10, 6, 0, 0));
  assert.equal(parseSavedAt(AT), Date.UTC(2026, 8, 22, 6, 38, 57));
  for (const bad of ['', null, undefined, 'yesterday', '2026-09-22T06:38:57Z', '99/99/2026, 00:00:00'])
    assert.equal(parseSavedAt(bad), null, `should reject ${bad}`);
});

t('a fresh book reads as fresh and carries the distances to each wall', () => {
  const b = readBook(today(), null, NOW);
  assert.equal(b.ok, true);
  assert.equal(b.stale, false);
  assert.ok(b.ageH > 5 && b.ageH < 6, `age should be about 5.3h, got ${b.ageH}`);
  const r = b.rows[0];
  assert.ok(Math.abs(r.toCall - 0.245) < 0.01, `call wall is ~0.245% above spot, got ${r.toCall}`);
  assert.ok(r.toPut > 0, 'this put wall sits ABOVE spot, so the distance must be positive');
  assert.equal(r.key, 'eurusd', 'a row must point at its board tile');
});

t('a book from before the weekend is refused rather than badged', () => {
  const b = readBook(today(), null, NOW + 40 * 3.6e6);
  assert.equal(b.stale, true, `${BOOK_FRESH_H}h is the line and 45h is past it`);
  const f = bookFindings(b);
  assert.equal(f[0].kind, 'book-stale', 'staleness must lead, not sit in a corner');
  assert.match(f[0].seen, /hours old/);
  assert.match(f[0].means, /has to be awake/, 'and must explain WHY a book goes stale');
});

t('price outside the wall band is found, and named as settled rather than as a level', () => {
  const b = readBook(today(pair({ spot: 1.1600 })), null, NOW);
  assert.equal(b.rows[0].inside, false);
  const f = bookFindings(b);
  const o = f.find(x => x.kind === 'book-outside');
  assert.ok(o, 'trading above the call wall should surface');
  assert.match(o.seen, /above its heaviest call strike/);
  assert.match(o.means, /already been settled/);
});

t('every finding that touches the book carries the max-pain null', () => {
  const b = readBook(today(pair({ spot: 1.1600 })), { pairs: { 'EUR/USD': { deltas: { totalOIChangePct: 12, flow: 'building' }, prevDate: '2026-09-19', curDate: '2026-09-22', days: 35 } } }, NOW);
  const f = bookFindings(b, { limit: 5 });
  assert.ok(f.length >= 2);
  for (const x of f.filter(y => y.kind !== 'book-stale')) {
    assert.match(x.notMeans, /NULL/, `${x.kind} must quote the max-pain null`);
    assert.match(x.notMeans, /never as support or resistance/, `${x.kind} must block the obvious misreading`);
  }
});

t('open interest changing overnight is reported as created vs closed, not as direction', () => {
  const mk = p => readBook(today(), { pairs: { 'EUR/USD': { deltas: { totalOIChangePct: p, flow: p > 0 ? 'building' : 'unwinding' }, prevDate: '2026-09-19', curDate: '2026-09-22' } } }, NOW);
  const up = bookFindings(mk(14)).find(x => x.kind === 'book-flow');
  assert.match(up.title, /new positions were opened/);
  assert.match(up.means, /CREATED/);
  const dn = bookFindings(mk(-14)).find(x => x.kind === 'book-flow');
  assert.match(dn.title, /positions were closed/);
  assert.match(dn.means, /CLOSED/);
  for (const x of [up, dn]) assert.doesNotMatch(x.means, /\b(bullish|bearish|will rise|will fall)\b/i);
});

t('a small overnight change is not dressed up as a finding', () => {
  const b = readBook(today(), { pairs: { 'EUR/USD': { deltas: { totalOIChangePct: 1.2, flow: 'flat' } } } }, NOW);
  assert.equal(bookFindings(b).some(x => x.kind === 'book-flow'), false, '1.2% is noise');
});

t('history is matched across the slash/underscore naming split', () => {
  const b = readBook(today(pair({ pair: 'NAS100_USD', spot: 30752, callWall: 31000, putWall: 30000, maxPain: 30500 })),
    { pairs: { 'NAS100_USD': { deltas: { totalOIChangePct: 9, flow: 'building' }, curDate: '2026-09-22' } } }, NOW);
  assert.ok(b.rows[0].change, 'the archive row must be found');
  assert.equal(b.rows[0].label, 'Nasdaq', 'and shown by the name a human uses');
});

t('an empty or broken payload says so instead of rendering an empty book', () => {
  for (const bad of [null, {}, { pairs: [] }, { pairs: null }]) {
    const b = readBook(bad, null, NOW);
    assert.equal(b.ok, false);
    assert.equal(bookFindings(b).length, 0);
  }
  assert.equal(readBook(today(pair({ spot: null })), null, NOW).ok, false, 'a row with no spot cannot be placed');
});

t('every mapped OI market has a human label, and board keys are real or explicitly null', () => {
  for (const k of Object.keys(OI_TO_BOARD)) assert.ok(OI_LABEL[k], `${k} needs a display name`);
  assert.equal(OI_TO_BOARD['US30_USD'], null, 'the Dow is not on the scan board, and that is recorded rather than missing');
});

t('a nonsense wall is dropped rather than drawn', () => {
  // live 2026-09-23: the Dow's put wall parsed as 21.55 against a 52,024 spot
  const b = readBook(today(pair({ pair: 'US30_USD', spot: 52024, putWall: 21.55, callWall: 53190, maxPain: 52500 })), null, NOW);
  const r = b.rows[0];
  assert.equal(r.putWall, null, 'a strike 99.96% away from spot is a bad parse');
  assert.equal(r.callWall, 53190, 'and the sane one on the other side must survive');
  assert.equal(r.inside, null, 'with one wall missing there is no band to be inside of');
  assert.equal(r.band, null);
});

t('an archive where every market reports exactly zero is refused, not shown as flat', () => {
  // The capture lands ~05:40 UTC but `curDate` is the calendar day, so an archive
  // read before that compares today's placeholder against its own source.
  const zeros = { pairs: Object.fromEntries(['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD']
    .map(k => [k, { deltas: { totalOIChangePct: 0, flow: 'flat' }, prevDate: '2026-09-22', curDate: '2026-09-23' }])) };
  const b = readBook(today(), zeros, NOW);
  assert.equal(b.rows[0].change, null, 'uniform zeros across unrelated markets is a broken comparison');
  assert.equal(bookFindings(b).some(x => x.kind === 'book-flow'), false);
  // but a genuine mix of flat and moving markets must still come through
  const mixed = { pairs: { 'EUR/USD': { deltas: { totalOIChangePct: 0, flow: 'flat' } },
                           'GBP/USD': { deltas: { totalOIChangePct: 8, flow: 'building' } },
                           'USD/JPY': { deltas: { totalOIChangePct: -3, flow: 'unwinding' } } } };
  assert.ok(readBook(today(), mixed, NOW).rows[0].change, 'a real flat reading among movers is kept');
});

console.log(`oiBoard: ${n} groups, all passed`);
