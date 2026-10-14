import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  newsKind, parseFigure, consensusTilt, bookFor, positioningBoard,
  exposureLine, verdictLine, INVERTED_KINDS, ordinal, extremeOf,
} from './positioningIntoEvent.js';

// The real AUD book, 2026-10-06 report, and the real calendar rows for that week. Using
// the actual numbers rather than invented ones means the test fails if the shape of
// either feed changes under it -- which is the failure that would otherwise go unnoticed.
const AUD = {
  sym: 'AUD', group: 'fx', specNet: 54133, specShare: 16.5, specSharePct: 84,
  amNet: -101428, amShare: -30.9, amSharePct: 35, dlNet: 28965, dlShare: 8.8,
  splitChg4w: 27.6, openInterest: 328682, reportDate: '2026-10-06',
};
const USD = {
  sym: 'USD', group: 'fx', specNet: 864, specShare: 1.7, specSharePct: 61,
  amNet: 19096, amShare: 37.4, amSharePct: 80, dlNet: -19790, splitChg4w: -18.1,
};
const NOW = Date.UTC(2026, 9, 14, 6, 0);          // Wed 14 Oct 06:00 UTC
const EVENTS = [
  { country: 'US', event: 'CPI y/y', impact: 'high', ms: Date.UTC(2026, 9, 14, 12, 30), estimate: '3.6%', prev: '3.4%' },
  { country: 'AU', event: 'Employment Change', impact: 'high', ms: Date.UTC(2026, 9, 15, 0, 30), estimate: '19.6K', prev: '39.5K' },
  { country: 'AU', event: 'Unemployment Rate', impact: 'high', ms: Date.UTC(2026, 9, 15, 0, 30), estimate: '4.6%', prev: '4.6%' },
  { country: 'AU', event: 'MI Leading Index m/m', impact: 'low', ms: Date.UTC(2026, 9, 13, 23, 30), estimate: null, prev: '0.0%' },
  { country: 'GB', event: 'GDP m/m', impact: 'high', ms: Date.UTC(2026, 9, 15, 6, 0), estimate: '-0.1%', prev: '0.4%' },
  { country: 'AU', event: 'Retail Sales m/m', impact: 'high', ms: Date.UTC(2026, 10, 20, 0, 30), estimate: '0.4%', prev: '0.2%' },  // far future
];

test('figures parse out of the calendar\'s own formatting', () => {
  assert.equal(parseFigure('19.6K'), 19600);
  assert.equal(parseFigure('4.6%'), 4.6);
  assert.equal(parseFigure('-17.3%'), -17.3);
  assert.equal(parseFigure('116.8B'), 116.8e9);
  assert.equal(parseFigure('1,025B'), 1025e9);
  assert.equal(parseFigure(null), null);
  // a bond auction prints two numbers; there is no scalar to compare, so say so
  assert.equal(parseFigure('3.80|1.6'), null);
});

test('the consensus tilt is expressed for the CURRENCY, so unemployment reads backwards', () => {
  // jobs expected to halve: softer for the Aussie
  assert.equal(consensusTilt({ event: 'Employment Change', estimate: '19.6K', prev: '39.5K' }).tilt, 'dn');
  // unemployment expected UP is WEAKER, so the tilt must be 'dn' even though the number rises
  const u = consensusTilt({ event: 'Unemployment Rate', estimate: '4.8%', prev: '4.6%' });
  assert.equal(u.tilt, 'dn', 'a rising unemployment rate is a weaker currency read');
  assert.equal(u.inverted, true);
  // unchanged inside the 2% band
  assert.equal(consensusTilt({ event: 'Unemployment Rate', estimate: '4.6%', prev: '4.6%' }).tilt, 'hold');
  // inflation up is a stronger currency read (rates), not inverted
  assert.equal(consensusTilt({ event: 'CPI y/y', estimate: '3.6%', prev: '3.4%' }).tilt, 'up');
  // nothing to compare against
  assert.equal(consensusTilt({ event: 'BOE Gov Bailey Speaks', estimate: null, prev: null }).tilt, null);
});

test('inverted kinds are the labour ones and only those', () => {
  assert.ok(INVERTED_KINDS.has('unemp') && INVERTED_KINDS.has('claims'));
  assert.ok(!INVERTED_KINDS.has('jobs'), 'employment CHANGE rising is a stronger print, not weaker');
  assert.ok(!INVERTED_KINDS.has('inflation'));
});

test('the AUD book reads as a crowded fast-money LONG, not a crowded short', () => {
  const b = bookFor(AUD, EVENTS.filter(e => e.country === 'AU' && e.impact === 'high'), { nowMs: NOW });
  assert.equal(b.crowded, 'long', 'leveraged funds at the 84th percentile are crowded LONG');
  assert.equal(b.fast.side, 'long');
  assert.equal(b.real.side, 'short');
  assert.equal(b.diverging, true);
  assert.match(b.exposure, /crowded LONG/);
  assert.match(b.exposure, /has to be sold/);
  // the far-future retail sales row must not be pulled in
  assert.equal(b.events.length, 2);
  assert.equal(b.events[0].event, 'Employment Change');
});

test('nothing anywhere in a row claims a direction', () => {
  const board = positioningBoard([AUD, USD], EVENTS, { nowMs: NOW });
  const text = JSON.stringify(board).toLowerCase();
  for (const banned of ['bearish', 'bullish', 'will fall', 'will rise', 'expect a drop', 'target']) {
    assert.ok(!text.includes(banned), `a positioning row must never say "${banned}"`);
  }
  assert.match(board.verdict, /does not say which way/);
  assert.match(board.verdict, /\+0\.004/, 'the AUD leg result belongs in the caveat, by name');
});

test('USD is held out of the ranking because its releases hit every pair', () => {
  const board = positioningBoard([AUD, USD], EVENTS, { nowMs: NOW });
  assert.equal(board.usd.ccy, 'USD');
  assert.ok(!board.rows.some(r => r.ccy === 'USD'));
  assert.equal(board.usd.events.length, 1);
  assert.equal(board.usd.events[0].event, 'CPI y/y');
});

test('only high-impact events are joined, and only inside the horizon', () => {
  const board = positioningBoard([AUD], EVENTS, { nowMs: NOW, horizonH: 96 });
  const aud = board.rows.find(r => r.ccy === 'AUD');
  assert.ok(aud.events.every(e => e.impact === 'high'), 'a low-impact row must not reach the panel');
  assert.ok(aud.events.every(e => e.ms <= NOW + 96 * 3600e3));
});

test('a quiet book says nothing rather than inventing a story', () => {
  const quiet = { sym: 'CAD', group: 'fx', specNet: 1000, specShare: 2, specSharePct: 50,
                  amNet: -500, amShare: -1, amSharePct: 50, splitChg4w: 1.0 };
  const b = bookFor(quiet, [], { nowMs: NOW });
  assert.equal(b.crowded, null);
  assert.equal(b.stretched, null);
  assert.equal(b.diverging, false);
  assert.equal(b.exposure, null, 'no exposure line at all beats a vague one');
});

test('missing participant-split fields degrade to null, they do not throw', () => {
  const old = { sym: 'EUR', group: 'fx', specNet: -44261, specShare: -5.1, specSharePct: 12 };
  const b = bookFor(old, [], { nowMs: NOW });
  assert.equal(b.real.share, null);
  assert.equal(b.stretched, null);
  assert.equal(b.crowded, 'short');     // the fast-money read still works
  assert.doesNotThrow(() => positioningBoard([old], EVENTS, { nowMs: NOW }));
});

test('an empty board returns a shape rather than throwing', () => {
  assert.doesNotThrow(() => positioningBoard([], []));
  assert.deepEqual(positioningBoard([], []).rows, []);
  assert.equal(positioningBoard([], []).usd, null);
  assert.equal(exposureLine({}), null);
  assert.ok(verdictLine().length > 80);
});

// today.html keeps its own newsKind for the news playbook, and this module needs the same
// classification for the tilt. Two copies drift; this is the guard. If it fails, the two
// panels have started disagreeing about what kind of release something is.
test('newsKind here still agrees with the copy inside today.html', () => {
  const html = readFileSync(new URL('../today.html', import.meta.url), 'utf8');
  const m = html.match(/function newsKind\(name\) \{[\s\S]*?\n\}/);
  assert.ok(m, 'today.html no longer has a newsKind to compare against — check before deleting this test');
  // eslint-disable-next-line no-new-func
  const theirs = new Function(`${m[0]}; return newsKind;`)();
  const names = [
    'CPI y/y', 'Core CPI m/m', 'Unemployment Rate', 'Employment Change', 'Non-Farm Payrolls',
    'Unemployment Claims', 'GDP m/m', 'Retail Sales m/m', 'Flash Manufacturing PMI',
    'Cash Rate', 'Trade Balance', 'Industrial Production m/m', 'BOE Gov Bailey Speaks',
  ];
  for (const n of names) assert.equal(newsKind(n), theirs(n), `disagreement on "${n}"`);
});

// ── the three display bugs the first live run surfaced ───────────────────────

test("joining a tilt onto an event keeps the calendar's own strings", () => {
  // consensusTilt returns PARSED numbers, and bookFor spreads it over the calendar row.
  // Fields named est/prev would overwrite "39.5K" with 39500 on screen.
  const b = bookFor(AUD, [EVENTS[1]], { nowMs: NOW });
  const e = b.events[0];
  assert.equal(e.estimate, '19.6K', 'the published estimate string must survive the join');
  assert.equal(e.prev, '39.5K', 'and so must the previous one');
  assert.equal(e.estNum, 19600);
  assert.equal(e.prevNum, 39500);
});

test('percentiles get real ordinals', () => {
  assert.equal(ordinal(1), '1st');
  assert.equal(ordinal(2), '2nd');
  assert.equal(ordinal(3), '3rd');
  assert.equal(ordinal(11), '11th');
  assert.equal(ordinal(12), '12th');
  assert.equal(ordinal(13), '13th');
  assert.equal(ordinal(21), '21st');
  assert.equal(ordinal(61), '61st');
  assert.equal(ordinal(83), '83rd');
  assert.equal(ordinal(84), '84th');
  assert.equal(ordinal(0), '0th');
  assert.equal(ordinal(null), null);
  const b = bookFor(AUD, [], { nowMs: NOW });
  assert.match(b.exposure, /84th percentile/);
  assert.ok(!/\d+th percentile of their own three years\)[\s\S]*61th/.test(b.exposure));
});

test('a real-money leg long at a LOW percentile reads as TRIMMED, not stretched', () => {
  // EUR on 2026-10-06: asset managers net LONG (+21.8% of OI) but at the 0th percentile
  // of their own range. That is the smallest long in three years -- not a stretched one.
  const EUR = { sym: 'EUR', group: 'fx', specNet: -44261, specShare: -5.1, specSharePct: 12,
                amNet: 189881, amShare: 21.8, amSharePct: 0, splitChg4w: 3.2 };
  const b = bookFor(EUR, [], { nowMs: NOW });
  assert.equal(b.real.side, 'long');
  assert.equal(b.stretched, null, 'long at the 0th percentile is not a stretched long');
  assert.equal(b.realTrimmed, 'long');
  assert.match(b.exposure, /asset managers hold their smallest LONG in three years \(0th percentile\)/);
  assert.ok(!/LONG at the bottom/.test(b.exposure), 'the contradictory phrasing must be gone');
  // the fast money IS genuinely crowded short here: net short AND at a low percentile
  assert.equal(b.crowded, 'short');
});

test('the sign and the percentile must AGREE before anything is called crowded', () => {
  // Found live: GBP on 2026-10-14 was called a "crowded short" while leveraged funds were
  // net LONG +12,432 -- long, but the least long in three years. Opposite meaning: a
  // trimmed book has little left to unwind, a crowded one has a great deal.
  const GBP = { sym: 'GBP', group: 'fx', specNet: 12432, specShare: 4.7, specSharePct: 10,
                amNet: -145442, amShare: -54.7, amSharePct: 0, splitChg4w: 15.3 };
  const b = bookFor(GBP, [], { nowMs: NOW });
  assert.equal(b.fast.side, 'long');
  assert.equal(b.crowded, null, 'net LONG can never be called a crowded SHORT');
  assert.equal(b.trimmed, 'long');
  assert.match(b.exposure, /smallest LONG in three years/);
  assert.match(b.exposure, /little left to unwind/);
  assert.ok(!/crowded SHORT/.test(b.exposure));
  assert.ok(!/has to be bought back/.test(b.exposure), 'there is no crowded short to buy back');
  // the asset-manager leg here IS a genuine extreme: net short at the 0th percentile
  assert.equal(b.stretched, 'short');
});

test('extremeOf covers all four corners of sign x percentile', () => {
  assert.deepEqual(extremeOf({ share: 16.5, pct: 84 }), { crowded: 'long', trimmed: null });
  assert.deepEqual(extremeOf({ share: -5.1, pct: 12 }), { crowded: 'short', trimmed: null });
  assert.deepEqual(extremeOf({ share: 4.7, pct: 10 }), { crowded: null, trimmed: 'long' });
  assert.deepEqual(extremeOf({ share: -54.7, pct: 92 }), { crowded: null, trimmed: 'short' });
  assert.deepEqual(extremeOf({ share: 2, pct: 50 }), { crowded: null, trimmed: null });
  assert.deepEqual(extremeOf({ share: null, pct: 84 }), { crowded: null, trimmed: null });
  assert.deepEqual(extremeOf({ share: 16.5, pct: null }), { crowded: null, trimmed: null });
});

test("the USD row names no pair, because a US release is not one pair's event", () => {
  const b = bookFor(USD, [], { nowMs: NOW });
  assert.equal(b.instrument, null);
  assert.equal(bookFor(AUD, [], { nowMs: NOW }).instrument, 'AUDUSD');
});
