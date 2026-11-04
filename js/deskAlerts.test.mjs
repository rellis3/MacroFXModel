// Tests for js/deskAlerts.js.   node js/deskAlerts.test.mjs
import assert from 'node:assert/strict';
import { readStates, updateCarryHist, evaluate, alertMessage, appendLog, ALERT_DEFAULTS } from './deskAlerts.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const H = 3600e3, T0 = Date.parse('2026-11-04T10:00:00Z');
const stress = overall => ({ overall, score: 1, tiles: [{ label: 'Credit', level: overall === 'calm' ? 'ok' : 'watch' }] });

t('board payloads become keyed states', () => {
  const s = readStates({
    stress: stress('watch'),
    skew: { rows: [{ id: 'JPY', pair: 'USD/JPY', rr: 1.2, rrPct: 97, history: 40, slope: 1.4, event: 'near-term vol bid' }, { id: 'EUR', rr: 0.1, rrPct: 3, history: 12, slope: 0.2, event: null }] },
    fair: { rows: [{ area: 'CH', ccy: 'CHF', name: 'Switzerland', devPct: 11.2, period: '2026-09' }, { area: 'JP', ccy: 'JPY', devPct: -9.9, period: '2026-09' }] },
    cli: { rows: [{ area: 'USA', ccy: 'USD', phase: 'slowdown', cli: 100.2, chg3m: -0.3, period: '2026-09' }] },
    drift: { banks: { Fed: { bank: 'Fed', drift: 0.3, big: true, label: 'much more hawkish', speeches: 2, statement: { score: 0.1, date: '2026-10-29' } }, ECB: { bank: 'ECB', drift: null } } },
  });
  assert.equal(s['stress:overall'].state, 'watch');
  assert.equal(s['skew:JPY'].state, 'high'); assert.equal(s['skew:EUR'], undefined, 'under 20 days of history: no read');
  assert.equal(s['skewslope:JPY'].state, 'event'); assert.equal(s['skewslope:EUR'].state, 'normal');
  assert.equal(s['fair:CH'].state, 'over'); assert.equal(s['fair:JP'].state, 'inside');
  assert.equal(s['cli:USA'].state, 'slowdown');
  assert.equal(s['drift:Fed'].state, 'hawkish'); assert.equal(s['drift:ECB'], undefined);
});
t('carry collapse: a top pair whose ratio halves in five days', () => {
  let h = {};
  const day = i => `2026-10-${String(20 + i).padStart(2, '0')}`;
  for (let i = 0; i < 6; i++) h = updateCarryHist(h, { rows: [{ pair: 'AUDJPY', ratio: i === 0 ? 0.8 : 0.7 }, { pair: 'EURUSD', ratio: -0.05 }] }, day(i));
  h = updateCarryHist(h, { rows: [{ pair: 'AUDJPY', ratio: 0.5 }, { pair: 'EURUSD', ratio: -0.05 }] }, day(5));   // same day overwritten
  assert.equal(h.AUDJPY.length, 6); assert.equal(h.AUDJPY.at(-1).ratio, 0.5);
  const carry = { rows: [{ pair: 'AUDJPY', ratio: 0.35, carry: 3.5, vol: 10 }, { pair: 'EURUSD', ratio: -0.01 }] };
  const s = readStates({ carry }, h);
  assert.equal(s['carry:AUDJPY'].state, 'collapsed', '0.8 five days ago -> 0.35 now');
  assert.equal(s['carry:EURUSD'], undefined, 'too small to start with');
  assert.equal(readStates({ carry: { rows: [{ pair: 'AUDJPY', ratio: 0.6 }] } }, h)['carry:AUDJPY'].state, 'ok');
});
t('first sight is silent; a change into an alerting state is sent once; back to normal is logged, not sent', () => {
  let r = evaluate({}, { 'skew:JPY': { state: 'normal', alert: false } }, T0);
  assert.equal(r.events.length, 0); assert.equal(r.state.keys['skew:JPY'].state, 'normal');
  r = evaluate(r.state, { 'skew:JPY': { state: 'high', alert: true, text: 'x' } }, T0 + H);
  assert.equal(r.events.length, 1); assert.equal(r.events[0].send, true); assert.equal(r.events[0].from, 'normal');
  const again = evaluate(r.state, { 'skew:JPY': { state: 'high', alert: true } }, T0 + 2 * H);
  assert.equal(again.events.length, 0, 'no change, no message (a restart reading the same state resends nothing)');
  r = evaluate(r.state, { 'skew:JPY': { state: 'normal', alert: false } }, T0 + 3 * H);
  assert.equal(r.events[0].send, false); assert.match(r.events[0].held, /back to normal/);
  r = evaluate(r.state, { 'skew:JPY': { state: 'high', alert: true } }, T0 + 4 * H);
  assert.equal(r.events[0].send, false, 'within the 6 h gap of the last send'); assert.match(r.events[0].held, /min gap/);
  r = evaluate(r.state, { 'skew:JPY': { state: 'normal', alert: false } }, T0 + 5 * H);
  r = evaluate(r.state, { 'skew:JPY': { state: 'high', alert: true } }, T0 + 8 * H);
  assert.equal(r.events[0].send, true);
});
t('world stress is sent on every colour change, either way', () => {
  let r = evaluate({}, { 'stress:overall': { state: 'calm', alert: true } }, T0);
  r = evaluate(r.state, { 'stress:overall': { state: 'watch', alert: true } }, T0 + H); assert.equal(r.events[0].send, true);
  r = evaluate(r.state, { 'stress:overall': { state: 'calm', alert: true } }, T0 + 8 * H); assert.equal(r.events[0].send, true);
});
t('rate limit: at most maxPerHour in an hour; the rest are held, not queued', () => {
  const base = {}, flip = {};
  for (let i = 0; i < 9; i++) { base[`cli:A${i}`] = { state: 'expansion', alert: true }; flip[`cli:A${i}`] = { state: 'slowdown', alert: true }; }
  let r = evaluate({}, base, T0);
  r = evaluate(r.state, flip, T0 + 60e3);
  assert.equal(r.events.filter(e => e.send).length, ALERT_DEFAULTS.maxPerHour);
  assert.equal(r.events.filter(e => /rate limit/.test(e.held ?? '')).length, 9 - ALERT_DEFAULTS.maxPerHour);
  const later = evaluate(r.state, flip, T0 + 2 * H);
  assert.equal(later.events.length, 0, 'held alerts are not re-sent later');
});
t('a board that fails to load leaves its stored state alone', () => {
  let r = evaluate({}, { 'fair:CH': { state: 'inside', alert: false } }, T0);
  r = evaluate(r.state, {}, T0 + H);
  assert.equal(r.state.keys['fair:CH'].state, 'inside');
});
t('chain divergence watcher: |z| >= 2.5 alerts once, first sight is silent, links with no stats are skipped', () => {
  const cs = z => ({ links: { 'real-gold': { ok: true, z, zWin: 20, short: 'real yields → gold', line: 'US real yields up 25bp in 20 days, but gold rose 1.2%: 2.9σ away from the usual link.', corr: { 60: { now: -0.2 } } }, 'oil-bei': { ok: false } } });
  let st = readStates({ chainstats: cs(1.1) });
  assert.deepEqual(Object.keys(st), ['chainz:real-gold']); assert.equal(st['chainz:real-gold'].state, 'normal');
  let r = evaluate({}, st, T0); assert.equal(r.events.length, 0);
  st = readStates({ chainstats: cs(2.9) }); assert.equal(st['chainz:real-gold'].state, 'above'); assert.equal(st['chainz:real-gold'].alert, true);
  r = evaluate(r.state, st, T0 + H); assert.equal(r.events.length, 1); assert.equal(r.events[0].send, true);
  assert.match(alertMessage(r.events[0]), /⛓ <b>Desk alert<\/b> · Chain link <b>real yields → gold<\/b> diverging: US real yields up 25bp/); assert.match(alertMessage(r.events[0]), /not a signal/);
  assert.equal(readStates({ chainstats: cs(-2.6) })['chainz:real-gold'].state, 'below');
  assert.equal(evaluate(r.state, readStates({ chainstats: cs(3.4) }), T0 + 2 * H).events.length, 0, 'still diverged: no new message');
});
t('message and log', () => {
  const ev = { key: 'fair:CH', from: 'inside', to: 'over', text: 'Switzerland is dear' };
  assert.match(alertMessage(ev), /⚖️ <b>Desk alert<\/b> · Switzerland is dear\./); assert.match(alertMessage(ev), /not a signal/);
  assert.deepEqual(appendLog([{ key: 'old' }], [{ key: 'a' }, { key: 'b' }]).map(e => e.key), ['b', 'a', 'old']);
});
console.log(`deskAlerts: ${n} tests passed`);
