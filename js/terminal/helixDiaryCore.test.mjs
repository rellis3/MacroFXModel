import test from 'node:test'; import assert from 'node:assert/strict';
import { diaryDay, searchDiary, terms, dateRange } from './helixDiaryCore.js';
import { scorecardHtml, dayHtml, hitsHtml } from './jarvisModDiary.js';
import { mergeSummary } from './helixScoreCore.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const rec = (date, { lead = 'Gold is up 2.1 percent. That is 2.4 times its usual move.', movers = [{ key: 'GOLD', oc: 2.1, vsUsual: 2.4 }], events = [{ time: '13:30', country: 'US', event: 'Core PCE Price Index m/m' }], evening = null } = {}) => ({
  date, updatedAt: `${date}T07:05:00Z`,
  runs: { ...(evening ? { evening: { savedAt: `${date}T21:00:00Z`, plan: [{ kind: 'scene', title: "Today's releases", view: 'ahead', text: evening }], claims: [] } } : {}),
    morning: { savedAt: `${date}T07:05:00Z`, mode: 'quick', headline: { headline: `${movers[0].key} leads` }, inputs: { movers, events: { n: events.length, first: events } },
      plan: [{ kind: 'open', title: 'THE MORNING BRIEFING', view: 'globe', text: 'Good morning.' }, { kind: 'bumper', title: 'Markets', text: '' }, { kind: 'lead', title: 'The Lead', view: 'globe', text: lead }],
      claims: movers.filter(m => Math.abs(m.vsUsual) >= 1.2).map(m => ({ kind: 'mover_big', id: `mover_big:${m.key}`, key: m.key, ratio: m.vsUsual, spoken: true })) } },
});

test('diaryDay: parts in clock order, markets, families, unusual, score trimmed', () => {
  const d = diaryDay(rec('2026-11-27', { evening: 'At 13:30, US core PCE came in at 0.3 percent, above the 0.2 percent expected.' }), { scoredAt: 'x', counts: { mover_big: [1, 1] }, results: [{ id: 'mover_big:GOLD', kind: 'mover_big', part: 'morning', key: 'GOLD', hit: true, why: 'finished past its usual range', detail: { a: 1 } }] });
  assert.deepEqual(d.parts.map(p => p.part), ['morning', 'evening']); assert.equal(d.parts[0].lines.length, 2, 'bumper (no text) dropped');
  assert.deepEqual(d.markets, ['GOLD']); assert.ok(d.families.includes('PCE')); assert.equal(d.unusual, true); assert.equal(d.maxRatio, 2.4);
  assert.equal(d.score.results[0].hit, true); assert.ok(!('detail' in d.score.results[0])); assert.equal(diaryDay(null), null);
});

test('terms and dateRange', () => {
  assert.deepEqual(terms('Gold  "usual move" x'), ['gold', 'usual move']);
  assert.deepEqual(dateRange('2026-11-25', '2026-11-27'), ['2026-11-25', '2026-11-26', '2026-11-27']);
  assert.equal(dateRange('2026-01-01', '2026-12-31', 120).length, 120); assert.equal(dateRange('2026-01-01', '2026-12-31', 120).at(-1), '2026-12-31'); assert.deepEqual(dateRange('x', 'y'), []);
});

test('searchDiary: every term must match, filters by market / family / unusual, newest first, snippets', () => {
  const days = [diaryDay(rec('2026-11-25', { lead: 'A quiet start. Twenty of 30 markets are barely moving.', movers: [{ key: 'NQ', vsUsual: 0.4 }], events: [{ event: 'ECB rate decision' }] })),
    diaryDay(rec('2026-11-27')), diaryDay(rec('2026-11-26', { lead: 'Euro Dollar, down 0.4 percent: 1.5 times a normal day\'s travel.', movers: [{ key: 'EURUSD', vsUsual: -1.5 }] }))];
  assert.deepEqual(searchDiary(days, {}).map(h => h.date), ['2026-11-27', '2026-11-26', '2026-11-25']);
  const g = searchDiary(days, { q: 'gold usual' }); assert.deepEqual(g.map(h => h.date), ['2026-11-27']); assert.match(g[0].hits[0].snippet, /Gold is up/);
  assert.deepEqual(searchDiary(days, { q: 'gold zebra' }), []);
  assert.deepEqual(searchDiary(days, { market: 'eurusd' }).map(h => h.date), ['2026-11-26']);
  assert.deepEqual(searchDiary(days, { family: 'ecb' }).map(h => h.date), ['2026-11-25']);
  assert.deepEqual(searchDiary(days, { unusual: true }).map(h => h.date), ['2026-11-27']);
  assert.equal(searchDiary(days, { limit: 1 }).length, 1);
});

test('panel HTML: scorecard, a day with its marks, hits; everything escaped', () => {
  const s = mergeSummary(null, { date: '2026-11-27', counts: { mover_big: [3, 4] }, results: [] });
  const h = scorecardHtml({ ok: true, summary: s }, esc); assert.match(h, /3 \/ 4/); assert.match(h, /75%/); assert.match(h, /not a trading record/);
  assert.match(scorecardHtml({ ok: true, summary: null }, esc), /No day has been scored yet/);
  const d = { ok: true, ...diaryDay(rec('2026-11-27', { lead: '<b>x</b> gold' }), { counts: {}, results: [{ id: 'mover_big:GOLD', part: 'morning', hit: false, why: 'finished inside its usual range' }] }) };
  const html = dayHtml(d, esc, new Set(['globe'])); assert.match(html, /✗/); assert.match(html, /&lt;b&gt;x/); assert.match(html, /data-view="globe"/);
  assert.ok(!dayHtml(d, esc, new Set()).includes('data-view'), 'no jump button for a view that is not there');
  assert.match(hitsHtml({ ok: true, hits: [], searched: 3, from: 'a', to: 'b' }, esc), /Nothing matched in 3 stored days/);
});
