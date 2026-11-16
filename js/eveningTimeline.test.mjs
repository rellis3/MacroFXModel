// Tests for js/eveningTimeline.js, the Evening edition's "day in order".   node js/eveningTimeline.test.mjs
import assert from 'node:assert/strict';
import { buildTimeline, clusterBursts, coversEvent, coversPrint, surpriseWord, sessionOf, londonHM, timelineHtml, timelineText, dayBounds } from './eveningTimeline.js';
import { londonMs } from './deskScore.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const D = '2026-11-16';           // GMT: London = UTC
const at = (h, m = 0, d = D) => londonMs(d, h, m);

const events = [
  { ms: at(13, 30), country: 'CA', event: 'CPI m/m', impact: 'high', actual: '0.2%', estimate: '0.3%', prev: '0.1%' },
  { ms: at(13, 30), country: 'CA', event: 'Median CPI y/y', impact: 'high', actual: '2.0%', estimate: '2.0%', prev: '1.9%' },
  { ms: at(17, 0), country: 'US', event: 'Fed Chairman Warsh Speaks', impact: 'high' },
  { ms: at(2, 0), country: 'NZ', event: 'Inflation Expectations q/q', impact: 'medium', actual: '2.2%', estimate: null, prev: '2.3%' },
  { ms: at(9, 0), country: 'US', event: 'Minor thing', impact: 'low', actual: '1', estimate: '1' },
];
const scorecards = [{ ms: at(13, 30), country: 'CA', prints: [], reactions: [{ name: 'USDCAD', dir: 'up', move: 0.4, unit: 'u', ratio: 1.8 }, { name: 'CADJPY', dir: 'down', move: 0.3, unit: 'u', ratio: null }] }];
const wire = [
  { ms: at(8, 5), title: 'BoJ outlook leans dovish', sources: ['FXStreet'], tier: 2, read: { tier: 2, impact: { JPY: -1 }, why: 'rates stay low' }, react: { m30: { label: 'with' } } },
  { ms: at(10, 14), title: 'Sterling slides on hawkish Fed bets', sources: ['Reuters'], tier: 1, read: { tier: 1, impact: { USD: 2, GBP: -1 }, why: 'dollar bid' }, react: { m30: { label: 'against' } } },
  { ms: at(14, 45), title: 'Dow drops as yields slip', sources: ['Yahoo'], tier: 2, read: { tier: 2, impact: { EQUITIES: -1 } }, react: { m30: { label: 'with' } } },
  { ms: at(15, 22), title: 'Euro at fresh 19-month low', sources: ['FXStreet'], tier: 2, read: { tier: 2, impact: { EUR: -2 } } },
  { ms: at(16, 0), title: 'Minor tier-3 note', sources: ['Yahoo'], tier: 3 },
  { ms: Date.parse('2026-11-15T10:00:00Z'), title: 'Yesterday headline', sources: ['Yahoo'], tier: 1, read: { tier: 1 } },
];
const bursts = [
  { inst: 'SPX500', u: -2.28, from: '14:40', to: '15:15', fromMs: at(14, 40), toMs: at(15, 10), share: 80 },
  { inst: 'US30', u: -2.24, from: '14:40', to: '15:15', fromMs: at(14, 42), toMs: at(15, 12), share: 75 },
  { inst: 'NQ', u: -1.81, from: '14:50', to: '15:15', fromMs: at(14, 50), toMs: at(15, 20), share: 70 },
  { inst: 'WTI', u: -1.96, from: '11:40', to: '12:10', fromMs: at(11, 40), toMs: at(12, 10), share: 61 },
  { inst: 'NZDJPY', u: -1.48, from: '18:04', to: '18:34', fromMs: at(18, 4), toMs: at(18, 34), share: 51 },
];
const now = at(21, 5);

t('London time: GMT in November, BST in July; sessions split at 08:00 and 13:30', () => {
  assert.equal(londonHM(Date.parse('2026-11-16T13:30:00Z')), '13:30');
  assert.equal(londonHM(Date.parse('2026-07-15T12:30:00Z')), '13:30');           // BST: 12:30Z is 13:30 in London
  assert.equal(sessionOf(at(7, 59)), 'asia'); assert.equal(sessionOf(at(8, 0)), 'london'); assert.equal(sessionOf(at(13, 29)), 'london'); assert.equal(sessionOf(at(13, 30)), 'ny');
  assert.equal(londonMs('2026-07-15', 13, 30) - Date.parse('2026-07-15T12:30:00Z'), 0);
  const { startMs, endMs } = dayBounds(D); assert.equal(endMs - startMs, 24 * 3600e3);
});

t('surprise words come only from two numbers', () => {
  assert.equal(surpriseWord('0.2%', '0.3%'), 'below the forecast'); assert.equal(surpriseWord('2.0%', '2.0%'), 'in line with the forecast');
  assert.equal(surpriseWord('3.1', '2.9'), 'above the forecast'); assert.equal(surpriseWord(null, '2.9'), null); assert.equal(surpriseWord('n/a', '2'), null);
});

const tl = buildTimeline({ date: D, wire, events, scorecards, bursts, now });

t('beats are grouped Asia / London / New York in time order; yesterday and low-impact items stay out', () => {
  assert.deepEqual(tl.sessions.map(s => s.id), ['asia', 'london', 'ny']);
  const all = tl.sessions.flatMap(s => s.beats);
  assert.ok(!all.some(b => /Yesterday headline|Minor thing|tier-3/.test(b.text)), 'no other-day, low-impact or tier-3 items');
  for (const s of tl.sessions) for (let i = 1; i < s.beats.length; i++) assert.ok(s.beats[i].ms >= s.beats[i - 1].ms, 'time order inside a session');
  assert.ok(tl.sessions[0].beats.some(b => /Inflation Expectations/.test(b.text)), 'the 02:00 NZ print is the Asia beat');
});

t('a print says actual against forecast, the surprise, and the first 30 minutes', () => {
  const b = tl.sessions.flatMap(s => s.beats).find(x => x.kind === 'release' && /CPI m\/m/.test(x.text));
  assert.match(b.text, /^CA data: CPI m\/m 0\.2% against 0\.3% expected, below the forecast \(previous 0\.1%\); Median CPI y\/y 2\.0% against 2\.0% expected, in line with the forecast/, 'prints at the same minute from one country are one beat');
  assert.equal(tl.sessions.flatMap(s => s.beats).filter(x => x.kind === 'release' && x.country === 'CA').length, 1);
  assert.match(b.text, /USDCAD up 0\.4 u \(1\.8x an ordinary half-hour\)/);
  const nz = tl.sessions.flatMap(s => s.beats).find(x => /Inflation Expectations/.test(x.text)); assert.match(nz.text, /2\.2%/); assert.ok(!/below|above/.test(nz.text), 'no surprise word without a forecast');
});

t('a scheduled speaker with no headline is one plain gap line, not a hole', () => {
  const g = tl.sessions.flatMap(s => s.beats).find(b => b.kind === 'gap');
  assert.ok(g && /Fed Chairman Warsh Speaks \(US\) was scheduled for 17:00 London: no headline captured in the wire\./.test(g.text));
  assert.ok(tl.gaps.some(x => /no headline captured/.test(x)));
});

t('a headline that reports the speaker covers the event: it becomes the speaker beat, no gap, and is not repeated', () => {
  const w2 = [...wire, { ms: at(17, 20), title: 'Fed Chair says inflation too high, hikes possible', sources: ['Reuters'], tier: 1, read: { tier: 1, impact: { USD: 1 } } }];
  const t2 = buildTimeline({ date: D, wire: w2, events, scorecards, bursts: [], now });
  const all = t2.sessions.flatMap(s => s.beats);
  assert.ok(all.find(b => b.kind === 'speaker' && /the wire carried: Fed Chair says inflation too high/.test(b.text)));
  assert.ok(!all.some(b => b.kind === 'gap')); assert.equal(all.filter(b => /Fed Chair says inflation/.test(b.text)).length, 1);
  assert.ok(coversEvent({ title: 'Fed Chair says x' }, { event: 'Fed Chairman Warsh Speaks', country: 'US' })); assert.ok(!coversEvent({ title: 'Oil falls' }, { event: 'Fed Chairman Warsh Speaks', country: 'US' }));
});

t('bursts cluster when they overlap; a cluster is named by its group and direction', () => {
  const c = clusterBursts(bursts);
  assert.equal(c.length, 3, 'indices together, oil alone, NZDJPY alone');
  assert.equal(c[1].label, 'Stock indices fell together'); assert.equal(c[1].n, 3); assert.equal(c[1].markets[0].inst, 'SPX500');
  assert.match(c[0].label, /WTI had its busiest half hour/);
});

t('each burst lists the nearest headlines within 30 minutes, or says no news was found', () => {
  const idx = tl.bursts.find(b => b.label === 'Stock indices fell together');
  assert.deepEqual(idx.headlines.map(h => h.hm), ['14:45', '15:22']); assert.equal(idx.noNews, false);
  const oil = tl.bursts.find(b => /WTI/.test(b.label)); assert.equal(oil.noNews, true); assert.deepEqual(oil.headlines, []);
  const html = timelineHtml(tl); assert.match(html, /No news found in the wire within 30 minutes of this\./); assert.match(html, /Nearest headlines: 14:45 Dow drops as yields slip/);
});

t('an empty wire says so once and offers no cause; a missing print says the actual is not on the feed', () => {
  const e = buildTimeline({ date: D, wire: [], events: [{ ms: at(13, 30), country: 'CA', event: 'CPI m/m', impact: 'high', estimate: '0.3%' }], scorecards: [], bursts, now });
  assert.equal(e.wireEmpty, true); assert.match(e.gaps[0], /news wire held no tier 1-2 headlines for this day/);
  assert.ok(e.bursts.every(b => b.noNews));
  assert.match(e.sessions.flatMap(s => s.beats).find(b => b.kind === 'release').text, /actual not on the feed \(0\.3% expected\)/);
  assert.ok(!/because|caused|due to/i.test(timelineText(e)), 'the plain-text version states no causes');
});

t('headlines are capped, tier 1 first, then shown in time order', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ ms: at(9, i), title: `Headline ${i}`, sources: ['X'], tier: i % 5 === 0 ? 1 : 2, read: { tier: i % 5 === 0 ? 1 : 2 } }));
  const x = buildTimeline({ date: D, wire: many, events: [], scorecards: [], bursts: [], now, maxHeadlines: 8 });
  const hs = x.sessions.flatMap(s => s.beats).filter(b => b.kind === 'headline'); assert.equal(hs.length, 8);
  assert.ok(hs.filter(h => h.tier === 1).length >= 6, 'all six tier-1 headlines made the cut'); for (let i = 1; i < hs.length; i++) assert.ok(hs[i].ms >= hs[i - 1].ms);
});

t('the html carries every beat once, the read and the reaction as labelled lines, and the gap note', () => {
  const html = timelineHtml(tl); assert.match(html, /Overnight and Asia/); assert.match(html, /the news analyst's read: USD↑ GBP↓ \(dollar bid\)/); assert.match(html, /30 minutes later: the market moved against the read/);
  assert.match(html, /was scheduled for 17:00 London: no headline captured in the wire\./);
  assert.equal(html.split('BoJ outlook leans dovish').length - 1, 1, 'a headline outside any burst appears once');
  assert.equal(html.split('Euro at fresh 19-month low').length - 1, 2, 'a headline inside a burst appears as a beat and as that burst nearest headline, nowhere else');
  const text = timelineText(tl); assert.match(text, /LONDON \(London time\)/); assert.match(text, /\[gap\] Fed Chairman Warsh/); assert.ok(!/GAP: Fed Chairman Warsh/.test(text), 'a speaker gap is printed once, in its place in the day'); assert.equal(html.split('no headline captured').length - 1, 1);
});


t('a print the calendar has no actual for takes it from the wire when a headline reports it', () => {
  const ev = [{ ms: at(13, 30), country: 'CA', event: 'CPI m/m', impact: 'high', estimate: '0.3%' }, { ms: at(15, 0), country: 'US', event: 'Retail Sales m/m', impact: 'high', estimate: '0.2%' }];
  const w = [{ ms: at(13, 36), title: 'Canada October CPI 3.1% vs +3.2% expected', sources: ['X'], tier: 2, read: { tier: 2 } }, { ms: at(13, 40), title: 'Oil falls on stock build', sources: ['X'], tier: 2, read: { tier: 2 } }];
  const x = buildTimeline({ date: D, wire: w, events: ev, scorecards: [], bursts: [], now });
  const beats = x.sessions.flatMap(s => s.beats);
  assert.match(beats.find(b => b.kind === 'release' && b.country === 'CA').text, /actual not on the feed \(0\.3% expected\)\. The wire carried: Canada October CPI 3\.1% vs \+3\.2% expected/);
  assert.ok(!/wire carried/.test(beats.find(b => b.kind === 'release' && b.country === 'US').text), 'an unrelated headline is not attached');
  assert.equal(beats.filter(b => /Canada October CPI/.test(b.text)).length, 1, 'the headline is not repeated as its own beat');
  assert.ok(coversPrint({ title: 'Canada CPI rises' }, { country: 'CA', event: 'CPI m/m' })); assert.ok(!coversPrint({ title: 'Canada jobs fall' }, { country: 'CA', event: 'CPI m/m' }));
});

t('a cluster of one group is named for it; a mixed cluster is not guessed at', () => {
  const c = clusterBursts([{ inst: 'WTI', u: -2, fromMs: at(8, 44), toMs: at(9, 15) }, { inst: 'BRENT', u: -1.9, fromMs: at(8, 44), toMs: at(9, 10) }]); assert.equal(c[0].label, 'Energy fell together');
  const m = clusterBursts([{ inst: 'EURNOK', u: 2.4, fromMs: at(14, 29), toMs: at(15, 0) }, { inst: 'SPX500', u: -2.3, fromMs: at(14, 30), toMs: at(15, 0) }]); assert.equal(m[0].label, 'Several markets moved at once');
});

console.log(`eveningTimeline: ${n} tests passed`);
