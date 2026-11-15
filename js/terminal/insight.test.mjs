// js/terminal/insight.test.mjs: the Insight tab shell and the "unusual now" board: every board is registered and has a command, the HTML is escaped and
// carries no trade wording, the bundle is fetched once. It proves wiring and text, NOT the look (themes, phone width). node --test js/terminal/insight.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PANELS, panelFromHash } from './insightView.js';
import { surfaceById } from './tabRegistry.js';
import { buildCommands, INSIGHT_WORDS } from './commandCore.js';
import { getBundle, forgetBundle } from './insightData.js';
import { unusualHtml, spark } from './unusualView.js';
import { rankBundle } from './unusualCore.js';

const dates = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10));
const walk = (n, step, start, seed) => { let s = seed, p = start; const out = []; for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) % 4294967296; p *= 1 + ((s / 4294967296) - 0.5) * 2 * step; out.push(p); } return out; };

test('GUARD: every Insight board is a registered panel surface, its pill carries the literal data-surface, and it has a command with help', () => {
  const cmds = buildCommands({ isOn: () => true });
  for (const p of PANELS) {
    const row = surfaceById(p.surface); assert.ok(row && row.kind === 'panel', `${p.surface} is registered as a panel`);
    assert.ok(p.pill.includes(`data-surface="${p.surface}"`), `${p.key}: the pill carries data-surface`);
    assert.equal(p.surface, `panel.insight.${p.key}`);
    const c = cmds.find(x => x.surface === p.surface); assert.ok(c, `${p.key} has a command`); assert.ok(c.help.length > 20 && c.example && c.opens, `${p.key} command help/example/opens`);
  }
  assert.deepEqual(Object.keys(INSIGHT_WORDS).sort(), PANELS.map(p => p.key).sort(), 'one INSIGHT_WORDS row per board');
  assert.equal(surfaceById('tab.insight').hidden, 'preview');
});
test('the Insight commands need the Insight tab: a session that cannot see it is not offered them', () => {
  const cmds = buildCommands({ isOn: id => id !== 'tab.insight' });
  assert.ok(!cmds.some(c => c.group === 'Insight boards' || c.id === 'tab.insight'));
});
test('the page has the tab button and the section, both carrying the registry attribute', () => {
  const html = fs.readFileSync(new URL('../../desk-terminal.html', import.meta.url), 'utf8');
  assert.match(html, /<button[^>]*data-t="insight"[^>]*data-surface="tab\.insight"/); assert.match(html, /<section id="insight" hidden data-surface="tab\.insight">/);
});
test('panelFromHash reads #insight/<board> only for a real board', () => {
  assert.equal(panelFromHash('#insight/unusual'), 'unusual'); assert.equal(panelFromHash('#insight/nope'), null); assert.equal(panelFromHash('#macro/rates'), null); assert.equal(panelFromHash(undefined), null);
});
test('getBundle: two callers share one fetch, a failure is not kept, force refetches', async () => {
  forgetBundle(); let calls = 0, ok = false, t = 0;
  const fetchJson = async () => { calls++; return ok ? { ok: true, dates: ['2026-11-13'], series: { gold: [1] } } : { ok: false, error: 'down' }; };
  const now = () => t;
  const [a, b] = await Promise.all([getBundle({ fetchJson, now }), getBundle({ fetchJson, now })]); assert.equal(calls, 1); assert.equal(a.ok, false); assert.equal(b.ok, false);
  ok = true; assert.equal((await getBundle({ fetchJson, now })).ok, true); assert.equal(calls, 2);
  assert.equal((await getBundle({ fetchJson, now })).ok, true); assert.equal(calls, 2, 'held');
  t = 11 * 60_000; await getBundle({ fetchJson, now }); assert.equal(calls, 3, 'after ten minutes');
  await getBundle({ fetchJson, now, force: true }); assert.equal(calls, 4); forgetBundle();
});
test('unusualHtml: the chance line, the sky map, a row per series, the working when opened; labels are escaped; no trade wording; says it is not a signal', () => {
  const n = 600, d = dates(n), series = {}; for (const [i, k] of ['gold', 'silver', 'nq', 'spx', 'vix', 'us10y'].entries()) series[k] = walk(n, 0.01, 100, 30 + i);
  series.gold[n - 1] = series.gold[n - 2] * 1.2;
  const rank = rankBundle({ dates: d, series, to: d[n - 1] });
  const h = unusualHtml(rank, { open: 'gold' });
  assert.match(h, /readings are hot; about/); assert.match(h, /class="in-sky"/); assert.equal((h.match(/class="in-row"/g) ?? []).length, 6); assert.match(h, /class="in-detail"/);
  assert.match(h, /not a signal/); assert.match(h, /Open the source board/);
  assert.ok(!/\b(buy|sell|go long|go short|entry|stop loss|take profit)\b/i.test(h.replace(/<[^>]+>/g, ' ')), 'no trade wording');
  assert.ok(!/#[0-9a-f]{6}\b/i.test(h), 'no hard-coded colours: tokens only');
  const evil = unusualHtml({ ...rank, rows: rank.rows.map(r => ({ ...r, label: '<img src=x onerror=1>' })) }); assert.ok(!evil.includes('<img src=x'));
  assert.match(unusualHtml(rank, { group: 'rates' }), /in-pill" data-group="all" aria-pressed="false"/);
  assert.match(unusualHtml({ rows: [], tooShort: [{ label: 'x' }], refDate: '2026-11-13' }), /No series had enough history/);
});
test('spark: needs three points, draws a path and an end dot, and says nothing about a value', () => {
  assert.equal(spark([1, 2]), ''); const s = spark([1, 3, 2, 5]); assert.match(s, /<path/); assert.match(s, /<circle/); assert.match(s, /aria-hidden="true"/);
});
