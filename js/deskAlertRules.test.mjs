// node js/deskAlertRules.test.mjs: the server half of desk alerts (who may call, the tick, skipping when Telegram is off, merge on write).
import assert from 'node:assert/strict';
import { handle, tick, readStore, KEY } from './deskAlertRules.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const mem = () => { const m = new Map(); return { m, get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
const NOW = Date.parse('2026-11-16T10:00:00Z');
const add = (kv, b) => handle({ method: 'POST', role: 'owner', kv, body: { action: 'add', ...b }, now: NOW });

const kv = mem();
ok((await handle({ method: 'GET', role: null, kv })).status === 401, 'no session: 401');
ok((await handle({ method: 'GET', role: 'viewer', kv, on: () => false })).status === 403, 'desk login, switch off: no read');
const w = await add(kv, { kind: 'range_used', params: { market: 'EURUSD', pct: 80 } });
ok(w.status === 200 && w.json.rules.length === 1 && !('state' in w.json.rules[0]), 'owner adds; the list does not leak the rule memory');
ok((await handle({ method: 'GET', role: 'viewer', kv, on: id => id === 'widget.alerts' })).json.rules.length === 1, 'desk login reads the list once the switch is on');
ok((await handle({ method: 'POST', role: 'viewer', kv, on: () => true, body: { action: 'delete', id: w.json.rules[0].id } })).status === 403, 'but never changes it, switch or not');
ok((await add(kv, { kind: 'range_used', params: { market: 'EURUSD', pct: 80 } })).status === 400 && (await add(kv, { kind: 'bogus', params: {} })).status === 400, 'duplicates and bad kinds refused');

const feed = (live) => async p => ({ json: p === 'live-layer' ? live : null });
const row = used => ({ ok: true, closed: false, state: { range: { rows: [{ name: 'EURUSD', used, hours: 5 }] } } });
let texts = []; const send = async t => { texts.push(t); return true; };
let r = await tick({ kv, fetchFeed: feed(row(0.9)), send, now: () => NOW });
ok(r.fired === 1 && r.sent === 1 && /EURUSD has used 90%/.test(texts[0]), 'a crossing sends one note');
r = await tick({ kv, fetchFeed: feed(row(0.95)), send, now: () => NOW + 12e4 }); ok(r.fired === 0 && texts.length === 1, 'the next tick does not repeat it');
const stored = JSON.parse(kv.m.get(KEY)); ok(stored.sent.n === 1 && stored.rules[0].state.firedAt === NOW, 'memory and the day count are stored');

// telegram off: nothing sent and nothing used up
const kv2 = mem(); await add(kv2, { kind: 'range_used', params: { market: 'EURUSD', pct: 80 } });
texts = []; r = await tick({ kv: kv2, fetchFeed: feed(row(0.9)), send, canSend: () => false, now: () => NOW });
ok(r.skipped && texts.length === 0 && JSON.parse(kv2.m.get(KEY)).rules[0].state.armed === undefined, 'muted: skipped, the alert is not used up');
r = await tick({ kv: kv2, fetchFeed: feed(row(0.9)), send, now: () => NOW + 6e4 }); ok(r.fired === 1, 'and fires when Telegram is back');

// a failing source or sender never throws
const kv3 = mem(); await add(kv3, { kind: 'fed_move', params: { bp: 5 } });
r = await tick({ kv: kv3, fetchFeed: async () => { throw new Error('down'); }, send, now: () => NOW }); ok(r.ok && !r.fired, 'a feed that throws is no data, not an error');
const kv4 = mem(); await add(kv4, { kind: 'range_used', params: { market: 'EURUSD', pct: 80 } });
r = await tick({ kv: kv4, fetchFeed: feed(row(0.9)), send: async () => { throw new Error('tg down'); }, log: { error() {} }, now: () => NOW }); ok(r.fired === 1 && r.sent === 0, 'a sender that throws is counted as not sent, never thrown');
ok((await tick({ kv: mem(), fetchFeed: feed(null), send, now: () => NOW })).skipped === 'no active alerts', 'no rules: nothing is fetched');

// level_touch only fetches the day while the market is open, and only for markets with a rule
const kv5 = mem(); await add(kv5, { kind: 'level_touch', params: { market: 'NQ', which: 'any' } });
const asked = []; const f5 = closed => async p => { asked.push(p); return { json: p === 'live-layer' ? { ok: true, closed } : { ok: true, bars: [], win: { start: 0, end: 1 } } }; };
await tick({ kv: kv5, fetchFeed: f5(true), send, now: () => NOW }); ok(asked.join() === 'live-layer', 'market shut: only the live layer is read');
asked.length = 0; await tick({ kv: kv5, fetchFeed: f5(false), send, now: () => NOW }); ok(asked.some(p => p.startsWith('replay/day?inst=NQ&date=2026-11-16')), 'open: that market\'s day is read');

// a rule deleted while the tick ran is not brought back
const kv6 = mem(); await add(kv6, { kind: 'range_used', params: { market: 'EURUSD', pct: 80 } });
const id6 = (await readStore(kv6)).rules[0].id;
r = await tick({ kv: kv6, fetchFeed: async p => { await handle({ method: 'POST', role: 'owner', kv: kv6, body: { action: 'delete', id: id6 }, now: NOW }); return { json: row(0.9) }; }, send, now: () => NOW });
ok((await readStore(kv6)).rules.length === 0, 'a delete made during the tick stands');
console.log(`deskAlertRules: ${n} checks OK`);
