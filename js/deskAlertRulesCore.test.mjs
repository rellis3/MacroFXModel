// node js/deskAlertRulesCore.test.mjs: desk alerts, the pure half (rules in and out, each kind's episode memory, cooldown, daily cap, wording).
import assert from 'node:assert/strict';
import { KINDS, KIND_IDS, MAX_RULES, DAILY_CAP, makeRule, sanitizeStore, applyAction, evaluate, run, noteText, describeRule, weekKey, touchesFromDay } from './deskAlertRulesCore.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const T0 = Date.parse('2026-11-16T10:00:00Z');   // a Monday
const rule = (kind, params, state = {}) => ({ id: `r${Math.random().toString(36).slice(2, 8)}`, kind, params, muted: false, createdAt: null, state });
const live = (rows = [], extra = {}) => ({ closed: false, state: { range: { rows } }, indices: { rows: {} }, em: { pairs: {} }, ...extra });

// ── rules in and out ──
ok(KIND_IDS.length === 5 && KIND_IDS.every(k => KINDS[k].label && KINDS[k].help && KINDS[k].describe && KINDS[k].fields.length), 'every kind has a label, help, fields and a sentence');
ok(makeRule({ kind: 'nope', params: {} }).ok === false && !makeRule({ kind: 'range_used', params: {} }).ok && !makeRule({ kind: 'data_stale', params: { feed: 'x' } }).ok && !makeRule({ kind: 'level_touch', params: { market: 'ZZZ' } }).ok && !makeRule({ kind: 'gap_closed', params: { market: 'EURUSD' } }).ok, 'bad rules are refused in words');
const a = makeRule({ kind: 'range_used', params: { market: 'eur/usd', pct: 999 }, name: '<b>x</b>' }, T0);
ok(a.ok && a.rule.params.market === 'EURUSD' && a.rule.params.pct === 300 && !/[<>]/.test(a.rule.name), 'params are cleaned and clamped, names lose angle brackets');
ok(describeRule(a.rule) === "EURUSD has used 300% of today's forecast median range", 'a rule reads as a sentence');
let store = sanitizeStore({});
const add = (b) => { const r = applyAction(store, b, T0); if (r.ok) store = r.store; return r; };
ok(add({ action: 'add', kind: 'fed_move', params: { bp: 5 } }).ok && add({ action: 'add', kind: 'fed_move', params: { bp: 5 } }).error === 'That alert already exists.', 'duplicates refused');
const id = store.rules[0].id;
ok(add({ action: 'mute', id }).store.rules[0].muted === true && add({ action: 'unmute', id }).store.rules[0].muted === false && add({ action: 'rename', id, name: 'Fed' }).store.rules[0].name === 'Fed', 'mute, unmute, rename');
ok(add({ action: 'delete', id: 'zzz' }).status === 404 && add({ action: 'wipe' }).status === 400 && add({ action: 'delete', id }).store.rules.length === 0, 'delete, and bad ones in words');
for (let i = 0; i < MAX_RULES; i++) add({ action: 'add', kind: 'fed_move', params: { bp: 1 + i } });
ok(store.rules.length === MAX_RULES && add({ action: 'add', kind: 'fed_move', params: { bp: 99 } }).status === 400, 'capped');
const dirty = sanitizeStore({ rules: [{ id: 'good1', kind: 'fed_move', params: { bp: 5 }, state: { base: 3, evil: { a: 1 }, 'bad key!': 1 } }, { id: 'x', kind: 'fed_move', params: {} }, { id: 'good1', kind: 'fed_move', params: { bp: 6 } }, { id: 'good2', kind: 'nope', params: {} }, 7] });
ok(dirty.rules.length === 1 && dirty.rules[0].state.base === 3 && !('evil' in dirty.rules[0].state) && !('bad key!' in dirty.rules[0].state), 'a stored list is cleaned: unknown kinds, duplicates, bad ids, non-scalar state');

// ── range_used: once per episode, re-arms when it falls away or on a new day ──
{
  const r = rule('range_used', { market: 'EURUSD', pct: 80 });
  const row = used => live([{ name: 'EURUSD', used, hours: 6 }]);
  let o = evaluate(r, { now: T0, live: row(0.5) }); ok(!o.fire, 'below the line: quiet');
  o = evaluate({ ...r, state: o.state }, { now: T0, live: row(0.85) }); ok(o.fire && /85%/.test(o.text) && /not of its direction/.test(o.text), 'crosses: one note, says estimate of size not direction');
  const o2 = evaluate({ ...r, state: o.state }, { now: T0 + 6e4, live: row(0.9) }); ok(!o2.fire, 'still above: no repeat');
  const o3 = evaluate({ ...r, state: o2.state }, { now: T0 + 12e4, live: row(0.6) }), o4 = evaluate({ ...r, state: o3.state }, { now: T0 + 18e4, live: row(0.82) });
  ok(!o3.fire && o4.fire, 'falls well away, then crosses again: a new episode');
  ok(!evaluate(r, { now: T0, live: live([{ name: 'EURUSD', used: 0.9 }], { closed: true }) }).fire && !evaluate(r, { now: T0, live: null }).fire && !evaluate(r, { now: T0, live: live([]) }).fire, 'market shut, no data, no row: nothing');
}
// ── fed_move: baseline first, then the change ──
{
  const fed = bp => ({ zq: { meetings: [{ meeting: '2026-12-09', moveBp: bp }] } });
  let o = evaluate(rule('fed_move', { bp: 5 }), { now: T0, fed: fed(20) }); ok(!o.fire && o.state.base === 20, 'first look sets the baseline, says nothing');
  let o2 = evaluate(rule('fed_move', { bp: 5 }, o.state), { now: T0, fed: fed(23) }); ok(!o2.fire, 'a small move: quiet');
  o2 = evaluate(rule('fed_move', { bp: 5 }, o.state), { now: T0, fed: fed(27.1) }); ok(o2.fire && /2026-12-09/.test(o2.text) && o2.state.base === 27.1 && /not a forecast/.test(o2.text), 'a 5bp+ move fires once and moves the baseline');
  const o3 = evaluate(rule('fed_move', { bp: 5 }, o2.state), { now: T0, fed: fed(27.5) }); ok(!o3.fire, 'and not again for the same level');
  const o4 = evaluate(rule('fed_move', { bp: 5 }, { meeting: '2026-11-04', base: 0 }), { now: T0, fed: fed(40) }); ok(!o4.fire && o4.state.meeting === '2026-12-09', 'a new next meeting re-baselines silently');
  ok(!evaluate(rule('fed_move', { bp: 5 }), { now: T0, fed: { zq: { meetings: [] } } }).fire, 'no data: nothing');
}
// ── data_stale ──
{
  const r = rule('data_stale', { feed: 'fed-zq' });
  const f = h => ({ zq: { asOf: new Date(T0 - h * 3600e3).toISOString() } });
  ok(!evaluate(r, { now: T0, fed: f(40) }).fire, 'amber is not red');
  const o = evaluate(r, { now: T0, fed: f(100) }); ok(o.fire && /very stale/.test(o.text) && /100h|4 days/.test(o.text), 'red fires once');
  ok(!evaluate({ ...r, state: o.state }, { now: T0, fed: f(110) }).fire, 'and not again while red');
  const back = evaluate({ ...r, state: o.state }, { now: T0, fed: f(2) }); ok(!back.fire && back.state.armed === true, 'fresh again: re-armed');
  ok(evaluate(rule('data_stale', { feed: 'fed-atlanta' }), { now: T0, fed: { asOf: '2026-11-01' } }).fire, 'the Atlanta date feed too');
}
// ── level_touch: only touches from now on ──
{
  const r = rule('level_touch', { market: 'NQ', which: 'any' });
  const ev = t => ({ t, id: 'x', label: 'Call wall', kind: 'oi', type: 'call', price: 28000 });
  let o = evaluate(r, { now: T0, touches: { NQ: [ev(T0 - 5e5)] } }); ok(!o.fire, 'old touches do not fire on the first look');
  o = evaluate({ ...r, state: o.state }, { now: T0 + 6e4, touches: { NQ: [ev(T0 - 5e5), ev(T0 + 3e4)] } }); ok(o.fire && /Call wall 28000/.test(o.text) && /no claim about which way/.test(o.text), 'a new touch fires');
  ok(!evaluate({ ...r, state: o.state }, { now: T0 + 12e4, touches: { NQ: [ev(T0 + 3e4)] } }).fire, 'the same touch does not repeat');
  const fc = rule('level_touch', { market: 'NQ', which: 'fc' }, { lastT: T0 });
  ok(!evaluate(fc, { now: T0, touches: { NQ: [ev(T0 + 1)] } }).fire, 'a forecast-line rule ignores option walls');
  ok(!evaluate(r, { now: T0, touches: {} }).fire, 'no data for the market: nothing');
  ok(touchesFromDay({}).length === 0 && touchesFromDay({ bars: [], win: {} }).length === 0, 'a day with no bars has no touches');
}
// ── gap_closed ──
{
  const r = rule('gap_closed', { market: 'NQ', minPct: 0.3 });
  const SUN = Date.parse('2026-11-15T22:30:00Z'), row = c => ({ closed: false, indices: { rows: { NQ: { live: 100, ref: 100, chgPct: c } } }, state: { range: { rows: [] } } });
  let o = evaluate(r, { now: SUN, live: row(0.6) }); ok(!o.fire && o.state.phase === 'gap', 'a gap seen at the open starts the watch');
  ok(!evaluate({ ...r, state: o.state }, { now: SUN + 36e5, live: row(0.4) }).fire, 'narrowing is not closing');
  const c = evaluate({ ...r, state: o.state }, { now: SUN + 72e5, live: row(0.02) }); ok(c.fire && /closed the weekend gap/.test(c.text) && /nothing about what comes next/.test(c.text) && c.state.phase === 'done', 'back at Friday close: one note');
  ok(!evaluate({ ...r, state: c.state }, { now: SUN + 9e6, live: row(0.0) }).fire, 'done for the week');
  const crossed = evaluate({ ...r, state: { wk: weekKey(SUN), phase: 'gap', sign: 1 } }, { now: SUN + 36e5, live: row(-0.1) }); ok(crossed.fire, 'a move through Friday close counts');
  const small = evaluate(r, { now: SUN, live: row(0.1) }); ok(small.state.phase === 'none', 'a gap under the threshold is not watched');
  const late = evaluate(r, { now: Date.parse('2026-11-18T12:00:00Z'), live: row(0.9) }); ok(late.state.phase === 'none', 'first look on Wednesday: no gap to watch (the reference is no longer Friday)');
  ok(!evaluate(r, { now: SUN, live: { ...row(0.6), closed: true } }).fire, 'market shut: nothing');
  const em = evaluate(rule('gap_closed', { market: 'USDMXN', minPct: 0.3 }), { now: SUN, live: { closed: false, indices: { rows: {} }, em: { pairs: { USDMXN: { live: 1, ref: 1, chgLive: 0.5 } } } } }); ok(em.state.phase === 'gap', 'EM pairs work too');
}
// ── run(): muted, cooldown, daily cap, memory only written when it changed ──
{
  const row = live([{ name: 'EURUSD', used: 0.9 }, { name: 'GBPUSD', used: 0.9 }]);
  const base = { v: 1, rules: [rule('range_used', { market: 'EURUSD', pct: 80 }), { ...rule('range_used', { market: 'GBPUSD', pct: 80 }), muted: true }], sent: { day: '', n: 0 } };
  const r1 = run(base, { now: T0, live: row });
  ok(r1.fired.length === 1 && r1.fired[0].rule.params.market === 'EURUSD' && r1.sent.n === 1 && r1.changed, 'one fires, the muted one does nothing');
  ok(r1.rules[1].state && Object.keys(r1.rules[1].state).length === 0, 'a muted rule\'s memory is not advanced');
  const r2 = run({ ...base, rules: r1.rules, sent: r1.sent }, { now: T0 + 6e4, live: row });
  ok(r2.fired.length === 0 && !r2.changed, 'next look, nothing changed: nothing fired and nothing to write');
  const cool = { ...rule('range_used', { market: 'EURUSD', pct: 80 }, { firedAt: T0 - 60 * 6e4, armed: true, day: '2026-11-16' }) };
  ok(run({ v: 1, rules: [cool], sent: { day: '', n: 0 } }, { now: T0, live: row }).fired.length === 0, 'inside its cooldown a crossing sends nothing (but the episode is remembered)');
  const many = { v: 1, rules: Array.from({ length: DAILY_CAP + 3 }, (_, i) => rule('range_used', { market: `M${i}`, pct: 50 })), sent: { day: '', n: 0 } };
  const rows = live(many.rules.map(x => ({ name: x.params.market, used: 0.9 })));
  const capped = run(many, { now: T0, live: rows }); ok(capped.fired.length === DAILY_CAP && capped.sent.n === DAILY_CAP, 'the daily cap holds');
  const again = run({ v: 1, rules: capped.rules, sent: capped.sent }, { now: T0 + 12e4, live: rows }); ok(again.fired.length === 0, 'rules past the cap do not fire later the same day (their episode was recorded)');
  ok(run({ v: 1, rules: [], sent: { day: '2020-01-01', n: 9 } }, { now: T0 }).sent.n === 0, 'a new London day resets the count');
  const t = noteText(base.rules[0], 'x');
  ok(/Desk alert/.test(t) && /EURUSD has used 80%/.test(t) && !/buy|sell|long|short|enter/i.test(t), 'the note describes the rule and gives no trade wording');
}
for (const k of KIND_IDS) { const txt = JSON.stringify([KINDS[k].help, KINDS[k].describe(KINDS[k].check({ market: k === 'gap_closed' ? 'NQ' : 'NQ', feed: 'fed-zq', pct: 80, bp: 5, minPct: 0.3, which: 'any' }) ?? {})]); ok(!/\b(buy|sell|go long|go short|enter)\b/i.test(txt), `${k}: wording has no trade instruction`); }
console.log(`deskAlertRulesCore: ${n} checks OK`);
