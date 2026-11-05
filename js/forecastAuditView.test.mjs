/**
 * Tests for the Forecast auditor card's HTML builders (js/forecastAuditView.js): band colours, the lockbox row, the
 * exploratory label on every backtest, and escaping.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rateCell, calTableHtml, alarmsHtml, rollingSvg, backtestFormHtml, backtestResultHtml, cardHtml, splitTableHtml } from './forecastAuditView.js';
import { buildAudit } from './forecastAudit.js';
import { summariseHistory } from './forecastAuditHistory.js';
import { mulberry32 } from './statsCore.js';

const rng = mulberry32(2);
const draw = (pr = [0.5, 0.25, 0.1]) => { const f = () => pr.map(p => (rng() < p ? 1 : 0)); return { hl: f(), oh: f(), ol: f(), pin: 1 + rng() }; };
const dates = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 0, 5) + i * 86400_000).toISOString().slice(0, 10));
const store = { days: {}, weeks: {} };
for (const d of dates(40)) store.days[d] = { A: { plain: draw(), persist: draw([0.9, 0.7, 0.4]) }, B: { plain: draw(), persist: draw([0.9, 0.7, 0.4]) } };
const audit = buildAudit({ store, asOf: '2026-02-20', harSessions: 40 });

test('rateCell: green inside the band, red with an arrow outside', () => {
  assert.match(rateCell({ rate: 0.25, lo: 0.2, hi: 0.3, out: 0 }), /--up/);
  const t = rateCell({ rate: 0.4, lo: 0.2, hi: 0.3, out: 1 });
  assert.match(t, /--dn/); assert.match(t, /↑/); assert.match(t, /TIGHT/);
  assert.equal(rateCell(null), '<td class="n">–</td>');
});

test('calibration table: one row per set, HAR-800 not scored (lockbox)', () => {
  const h = calTableHtml(audit, { q: 'hl', win: 'r20' });
  assert.match(h, /Plain/); assert.match(h, /Chosen/);
  assert.match(h, /not scored \(lockbox, 40 sessions held back\)/);
  assert.match(calTableHtml({}), /No scored sessions/);
});

test('alarms and the card', () => {
  assert.match(alarmsHtml([]), /no drift/);
  assert.match(alarmsHtml([{ text: '<b>x</b>' }]), /&lt;b&gt;x/);
  const c = cardHtml({ ok: true, audit, telegram: { optIn: false, muted: false } });
  assert.match(c, /monitoring, not a verdict/);
  assert.match(c, /id="fa-tg"/); assert.ok(!/fa-tg" checked/.test(c));
  assert.match(c, /drift/);                                   // the tight persist set raised alarms
  assert.match(cardHtml({ ok: false, error: 'down' }), /down/);
  assert.match(rollingSvg({}, 0), /not enough days/);
  assert.match(rollingSvg({ plain: [{ r: [0.5, 0.2, 0.1] }, { r: [0.6, 0.3, 0.1] }] }, 1), /polyline/);
});

test('backtest form never goes past the lockbox date; every result is labelled exploratory', () => {
  const f = backtestFormHtml({ sets: { plain: 'Plain', persist: 'Chosen ★' }, instruments: ['EURUSD'] });
  assert.match(f, /max="2026-08-21"/); assert.match(f, /Re-test over history/);
  const rows = [];
  for (const d of dates(60)) rows.push({ date: d, inst: 'A', regime: 'normal', event: 'none', s: { plain: draw(), persist: draw() } });
  const r = { ok: true, params: { sets: ['plain', 'persist'], instruments: ['A'], from: '2026-01-05', to: '2026-03-05' }, nBoot: 100, meanBlock: 20, seed: 1,
    notes: ['Exploratory backtest, not a pre-registered test.'], coverage: { A: { sessions: 60 } }, summary: summariseHistory(rows, ['plain', 'persist'], { nBoot: 100 }) };
  const h = backtestResultHtml(r);
  assert.match(h, /exploratory backtest/); assert.match(h, /not a pre-registered test/);
  assert.match(h, /Pinball ÷ plain/);
  assert.match(splitTableHtml('Regime', r.summary.persist.regime), /normal/);
  assert.match(backtestResultHtml({ ok: false, error: 'nope' }), /nope/);
});
