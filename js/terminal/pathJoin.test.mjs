import test from 'node:test';
import assert from 'node:assert/strict';
import { walkModel, renderWalk } from './optionsView.js';

const series = (dates, px) => dates.map((d, i) => [d, px + i]);
const base = dates => ({ series: series(dates, 4100), state: { date: '2026-11-09', close: 4141, sigmaDailyPct: 1 }, expiries: [], bands: [] });
const D = ['2026-10-30', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];

test('the price line runs on to the now dot when the series ends before today (a weekend gap)', () => {
  const m = walkModel(base(D), { points: [] });
  assert.equal(m.ser.at(-1)[0], '2026-11-09');
  assert.equal(m.ser.at(-1)[1], 4141);
  assert.equal(m.ser.length, D.length + 1);
  assert.equal(m.serT.at(-1), m.tNow, 'the last point of the line is the now dot');
});

test('when the series already ends today, its last point follows the live price instead of adding a second point', () => {
  const sm = base([...D, '2026-11-09']); sm.series.at(-1)[1] = 4100;
  const m = walkModel(sm, { points: [] });
  assert.equal(m.ser.length, D.length + 1);
  assert.equal(m.ser.at(-1)[1], 4141);
});

test('the source series is not changed, and the drawn line ends exactly at the now dot', () => {
  const sm = base(D); const before = JSON.stringify(sm.series);
  const m = walkModel(sm, { points: [] });
  assert.equal(JSON.stringify(sm.series), before);
  const r = renderWalk(m);
  const hist = /<path d="(M[^"]+)" fill="none" stroke="var\(--pur2,#9b8cff\)" stroke-width="2"\/>/.exec(r.svg);
  assert.ok(hist, 'the price line is drawn');
  const lastPt = hist[1].split('L').at(-1).split(',').map(Number);
  assert.ok(Math.abs(lastPt[0] - r.X(m.tNow)) < 0.2 && Math.abs(lastPt[1] - r.Y(4141)) < 0.2, `the line ends at the now dot, got ${lastPt}`);
});
