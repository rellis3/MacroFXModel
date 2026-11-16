// The vol clock board: the shaping (js/volClockCore.js) and the drawing (js/terminal/volClockView.js).   node --test js/volClockCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { wilson, latestSetup, lastScored, clockFor, recordOf, buildVolClock, describeVolClock, TAGS } from './volClockCore.js';
import { boardHtml, dialSvg, tileHtml, rankHtml } from './terminal/volClockView.js';
globalThis.deskAccessState = { role: 'viewer' };

const row = (sym, ratio, tag, extra = {}) => ({ sym, iv: 6.3, sigma: 0.42, ratio, tag, edges: [0.96, 1.1], ivrv: 1.0, event: 'none', eventMult: 0.95, ivSource: 'CME settlement IV30', provisional: null, lines: { hl_p50: 0.57, hl_p75: 0.74, hl_p90: 0.94 }, ...extra });
const DR = {
  updatedAt: '2026-11-15T15:55:00Z',
  tally: { continue: { n: 82, p75: 25, p75Rate: 0.305 }, fair: { n: 73, p75: 24, p75Rate: 0.329 }, exhaust: { n: 51, p75: 10, p75Rate: 0.196 } }, expectP75: { continue: 0.348, fair: 0.223, exhaust: 0.13, design: 0.25 },
  days: {
    '2026-11-13': { setup: { rows: [row('EURUSD', 0.9, 'exhaust')] }, score: { rows: [{ sym: 'EURUSD', hl: 0.48, hit: { oh_p50: false } }] } },
    '2026-11-16': { setup: { at: '2026-11-13T23:06:31Z', forecastAt: '2026-11-13T22:54:11Z', rows: [row('GOLD', 1.016, 'fair'), row('EURUSD', 0.941, 'exhaust'), row('USDJPY', 1.19, 'continue'), row('NOIV', null, null)] } },
  },
};
const INTEL = { computed_at: '2026-11-15T15:39:12Z', instruments: { GOLD: { assetClass: 'commodity', vol_pct: 16, vol_annual: 18.9, vol_vov_label: 'Stable', iv_term_structure: { shape: 'upward', front: { iv: 17.3 } }, vrp: { premium_pct: 37.1 } }, EURUSD: { assetClass: 'fx', vol_pct: 72, vol_annual: 6.4, vol_vov_label: 'Stable', iv_term_structure: { shape: 'upward', front: { iv: 4.1 } }, vrp: { premium_pct: -3.4 } }, USDJPY: { assetClass: 'fx', vol_pct: 13 }, AUDNZD: { assetClass: 'fx', vol_pct: 98, vol_annual: 6.3 } } };

test('Wilson interval for a share', () => {
  const w = wilson(25, 82);
  assert.ok(Math.abs(w.lo - 0.216) < 0.003 && Math.abs(w.hi - 0.411) < 0.003, JSON.stringify(w));
  assert.equal(wilson(0, 0), null);
  assert.ok(wilson(0, 10).lo === 0 || wilson(0, 10).lo < 0.001);
});

test('the newest day with a setup, and the newest scored session with the setup it was scored against', () => {
  assert.equal(latestSetup(DR.days).date, '2026-11-16');
  assert.equal(lastScored(DR.days).date, '2026-11-13');
  assert.equal(latestSetup({}), null);
  assert.equal(lastScored(null), null);
});

test('the clock: live range while the FX week is open, the last completed session while it is shut, nothing otherwise', () => {
  const scored = lastScored(DR.days);
  const live = { closed: false, state: { range: { rows: [{ name: 'EURUSD', used: 0.55, hours: 11, pace: 0.8, state: 'normal' }, { name: 'GOLD', used: null, hours: 1, state: 'early' }] } } };
  assert.deepEqual(clockFor('EURUSD', { live, scored }), { mode: 'live', used: 0.55, hours: 11, pace: 0.8, state: 'normal' });
  assert.equal(clockFor('GOLD', { live, scored }).used, null, 'too early to judge: no number');
  const shut = { closed: true, state: { range: { rows: [] } } };
  const c = clockFor('EURUSD', { live: shut, scored });
  assert.equal(c.mode, 'last'); assert.equal(c.used, 0.84, 'last session range 0.48 over the forecast median 0.57'); assert.equal(c.date, '2026-11-13');
  assert.equal(clockFor('GOLD', { live: shut, scored }).mode, 'none', 'no scored row for it');
  assert.equal(clockFor('EURUSD', { live: null, scored: null }).mode, 'none');
});

test('the forward record: each tag with its interval, the fitted share and the 25% design', () => {
  const r = recordOf(DR);
  assert.equal(r.design, 0.25);
  assert.deepEqual(r.rows.map(x => x.tag), ['continue', 'fair', 'exhaust']);
  const a = r.rows[0];
  assert.equal(a.n, 82); assert.equal(a.p75Rate, 0.305); assert.equal(a.expect, 0.348); assert.ok(a.lo < a.p75Rate && a.p75Rate < a.hi);
  assert.equal(r.since, '2026-11-13');
  assert.equal(recordOf({}), null);
});

test('buildVolClock: tiles for the markets with an options-implied number, a ranking over every market, honest gaps', () => {
  const vc = buildVolClock({ dailyRead: DR, intel: INTEL, live: { closed: true, quoteAt: '2026-11-13T21:59:00Z', state: { range: { rows: [] } } }, now: Date.parse('2026-11-15T16:00:00Z') });
  assert.equal(vc.ok, true);
  assert.deepEqual(vc.tiles.map(t => t.sym), ['GOLD', 'EURUSD', 'USDJPY'], 'a row with no ratio is not a tile');
  assert.equal(vc.tiles[1].lines.k75, 1.3); assert.equal(vc.tiles[1].cls, 'fx');
  assert.equal(vc.rank.length, 4);
  assert.equal(vc.rank.find(r => r.name === 'AUDNZD').ratio, null, 'ranked on realised vol alone');
  assert.equal(vc.noIv, 1); assert.equal(vc.counts.tagged, 3);
  assert.equal(vc.closed, true);
  assert.equal(vc.setup.date, '2026-11-16');
  assert.equal(buildVolClock({}).ok, false);
});

test('the paragraph: counts above / at / below, the extremes, the record with its interval and the overlap, never a direction', () => {
  const vc = buildVolClock({ dailyRead: DR, intel: INTEL, live: null });
  const s = describeVolClock(vc);
  assert.match(s, /Of the 3 markets/);
  assert.match(s, /1 sit above their forecast sigma \(lines likely too tight\), 1 about at it and 1 below it \(lines likely too wide\)/);
  assert.match(s, /Highest: USDJPY at 1\.19×; lowest: EURUSD at 0\.94×/);
  assert.match(s, /n=82, 95% interval 22% to 41%/);
  assert.match(s, /the two intervals overlap/);
  assert.match(s, /not which way/);
  assert.ok(!/\b(buy|sell|long|short|fade|follow)\b/i.test(s), 'no trade wording');
  assert.equal(describeVolClock({ ok: false }), null);
  for (const t of Object.values(TAGS)) assert.ok(!/\b(take profit|follow|fade|chase)\b/i.test(t.plain + t.short), 'the tag wording is the size of the move, never the Daily Read\'s trade lines');
});

test('the dial: the arc, the p50/p75/p90 marks, the London-day ring, theme tokens only, a plain-words summary', () => {
  const vc = buildVolClock({ dailyRead: DR, intel: INTEL, live: { closed: false, state: { range: { rows: [{ name: 'EURUSD', used: 0.55, hours: 11, pace: 0.8, state: 'normal' }] } } } });
  const t = vc.tiles.find(x => x.sym === 'EURUSD');
  const svg = dialSvg(t);
  assert.match(svg, /class="vc-fill"/);
  assert.equal((svg.match(/class="vc-tk"/g) ?? []).length, 3);
  assert.match(svg, />p75</);
  assert.equal((svg.match(/vc-hr vc-hr-on/g) ?? []).length, 11, 'eleven hours of the London day gone');
  assert.match(svg, /vc-pace/);
  assert.match(svg, /aria-label="EURUSD: options price 0\.94 times the forecast sigma \(lines likely too wide\)\. Range so far: 55% of the forecast median\. Size, not direction\./);
  assert.ok(!/#[0-9a-f]{3,8}\b|rgb\(|rgba\(/i.test(svg), 'no hard-coded colour');
  const noClock = dialSvg({ ...t, clock: { mode: 'none' } });
  assert.ok(!/class="vc-fill"/.test(noClock), 'no range reading, no arc');
});

test('the board: sentence, tiles, a sortable ranking, the forward record and the evidence stamp; a viewer sees no link to the main site', () => {
  const vc = buildVolClock({ dailyRead: DR, intel: INTEL, live: { closed: true, state: { range: { rows: [] } } } });
  const html = boardHtml(vc);
  assert.match(html, /data-surface="panel\.asset\.volclock"/);
  assert.match(html, /last session/);
  assert.equal((html.match(/class="vc-tile"/g) ?? []).length, 3);
  assert.match(html, /class="vc-sort" data-k="ratio"/);
  assert.match(html, /1 of 4 have an options-implied number|3 of 4 have an options-implied number/);
  assert.match(html, /The Daily Read's forward record/);
  assert.match(html, /small sample/);
  assert.match(html, /not a signal to buy or sell/);
  assert.ok(!/href=/.test(html.replace(/<svg[\s\S]*?<\/svg>/g, '')) || !/\.html/.test(html), 'no owner links in a viewer\'s board');
  assert.match(boardHtml(null), /Reading the vol surface/);
  assert.match(boardHtml({ ok: false, error: 'not built' }), /not built/);
  assert.match(rankHtml(vc), /<th class="n"><button type="button" class="vc-sort" data-k="vrp"/);
  assert.match(tileHtml(vc.tiles[0]), /FAIR/);
});

test('the ranking puts markets with an IV over sigma first, highest first, then the rest by realised-vol percentile', () => {
  const vc = buildVolClock({ dailyRead: DR, intel: INTEL, live: null });
  const names = [...rankHtml(vc).matchAll(/<tr data-ratio[^>]*><td><b class="mono">([A-Z]+)</g)].map(m => m[1]);
  assert.deepEqual(names, ['USDJPY', 'GOLD', 'EURUSD', 'AUDNZD']);
});
