/**
 * Tests for the forward scorecard (js/forecastScorecard.js): the session window is London
 * 00:00–22:00, exceedance is "realised went past the line", and the roll-up compares arms only
 * on rows where both exist.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { realised, scoreLadder, scoreSession, scoreWeek, summarise, scoreLiveRange } from './forecastScorecard.js';

// Hourly bars for a winter London day (UTC = London): range 1.1000–1.1100, then a spike at 22:00 that must be ignored.
function day(date = '2026-01-14', base = 1.1) {
  const t0 = Date.parse(`${date}T00:00:00Z`) / 1000, out = [];
  for (let h = 0; h < 24; h++) {
    const o = base + (h % 11) * 0.001;
    out.push({ t: t0 + h * 3600, open: o, high: h === 22 ? 1.2 : o + 0.0005, low: o - 0.0005, close: o });
  }
  return out;
}

test('realised uses only the 00:00-22:00 London window', () => {
  const r = realised(day(), '2026-01-14');
  assert.ok(r.high < 1.12, 'the 22:00 spike is outside the session');
  assert.equal(r.days, 1);
  assert.ok(Math.abs(r.hl - (r.high - r.low) / r.open * 100) < 1e-12);
});

test('scoreLadder: flags rungs the realised move went past, and pinball is zero only on a perfect median', () => {
  const real = { hl: 0.6, oh: 0.3, ol: 0.3 };
  const s = scoreLadder({ hl: { p50: 0.5, p75: 0.7, p90: 0.9 }, oh: { p50: 0.2, p75: 0.35, p90: 0.5 }, ol: { p50: 0.4, p75: 0.5, p90: 0.6 } }, real);
  assert.deepEqual(s.hl, [1, 0, 0]); assert.deepEqual(s.oh, [1, 0, 0]); assert.deepEqual(s.ol, [0, 0, 0]);
  assert.ok(s.pin > 0);
});

test('session + week scoring and the roll-up', () => {
  const lad = { sigma_daily_pct: 0.4, hl: { p50: 0.5, p75: 0.7, p90: 0.9 }, oh: { p50: 0.2, p75: 0.35, p90: 0.5 }, ol: { p50: 0.2, p75: 0.35, p90: 0.5 } };
  const wide = { hl: { p50: 2, p75: 3, p90: 4 }, oh: { p50: 1, p75: 2, p90: 3 }, ol: { p50: 1, p75: 2, p90: 3 } };
  const rows = scoreSession({ date: '2026-01-14', forecast: { instruments: { EURUSD: { ladder: lad } } }, ivadj: { EURUSD: wide },
                              barsByName: { EURUSD: day() } });
  assert.ok(rows.EURUSD.plain && rows.EURUSD.ivadj && rows.EURUSD.live);
  const weekDates = ['2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16'];
  const wbars = weekDates.flatMap(d => day(d));
  const wk = scoreWeek({ dates: weekDates, forecast: { instruments: { EURUSD: { ladder_weekly: lad, ladder_weekly_rev: wide } } }, barsByName: { EURUSD: wbars } });
  assert.ok(wk.EURUSD.sqrt && wk.EURUSD.rev);
  const S = summarise({ days: { '2026-01-14': rows }, weeks: { '2026-01-12': wk } });
  assert.equal(S.sessions, 1); assert.equal(S.weeks, 1);
  assert.equal(S.daily.plain.n, 1); assert.equal(S.daily.ivadj.n, 1);
  assert.ok(S.daily_ivadj_vs_plain_pinball != null && S.weekly_rev_vs_sqrt_pinball != null);
  assert.ok(Object.keys(S.live).length >= 1);
});

test('Live Range replay skips instruments with no fit', () => {
  assert.equal(scoreLiveRange(day(), '2026-01-14', 'WHEAT', 1), null);
});
