// node js/deskAlertNews.test.mjs: the news_keyword alert kind (js/deskAlertRulesCore.js): a NEW headline matching your words fires once, the first look says nothing,
// wording carries no direction, titles are cleaned, the tick asks for the wire only when such a rule exists.
import assert from 'node:assert/strict';
import { KINDS, makeRule, evaluate, run, sanitizeStore, describeRule, applyAction } from './deskAlertRulesCore.js';
import { tick } from './deskAlertRules.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const T0 = Date.parse('2026-11-16T10:00:00Z'), H = (id, title, ms, extra = {}) => ({ id, title, ms, source: 'Wire', read: { tier: 1 }, ...extra });
const mk = (params = { q: 'ecb hawkish', tier: 1 }) => makeRule({ kind: 'news_keyword', params }, T0).rule;

ok(KINDS.news_keyword && makeRule({ kind: 'news_keyword', params: { q: 'a' } }).ok === false, 'needs 2+ letters');
ok(JSON.stringify(mk({ q: '  ECB  Hawkish ', tier: '3', keys: ['eur', 'bad'] }).params) === '{"q":"ecb hawkish","tier":3,"keys":["EUR"]}', 'params cleaned');
ok(/a new headline matching "ecb hawkish"/.test(describeRule(mk())), 'described');
ok(sanitizeStore({ rules: [mk()] }).rules.length === 1 && sanitizeStore({ rules: [{ ...mk(), params: { q: '' } }] }).rules.length === 0, 'stored rules re-validate');

const items = [H(1, 'ECB hawkish tilt at the meeting', T0 - 3600e3), H(2, 'Unrelated headline', T0 - 60e3)];
let r = mk(), o = evaluate(r, { now: T0, news: { items } });
ok(!o.fire && o.state.lastMs >= T0, 'first look: nothing from before the alert, whatever the wire holds');
r = { ...r, state: o.state };
ok(!evaluate(r, { now: T0 + 1000, news: { items } }).fire, 'same wire again: still nothing');
const more = [...items, H(3, 'ECB hawkish: Lagarde <b>warns</b>\nagain', T0 + 120e3, { source: 'Reuters' }), H(4, 'ECB hawkish second', T0 + 150e3), H(5, 'ECB dovish', T0 + 160e3)];
o = evaluate(r, { now: T0 + 200e3, news: { items: more } });
ok(o.fire && /2 new headlines matched "ecb hawkish"/.test(o.text), 'two new matches fire once');
ok(!/[<>\n]/.test(o.text), 'titles are cleaned of tags and line breaks');
ok(/context, not a signal/.test(o.text) && !/\b(buy|sell|long|short)\b/i.test(o.text), 'no direction, no trade wording');
r = { ...r, state: o.state };
ok(!evaluate(r, { now: T0 + 300e3, news: { items: more } }).fire, 'one note per episode: the same headlines never fire again');
ok(!evaluate(r, { now: T0, news: null }).fire && !evaluate(r, { now: T0, news: { ok: false } }).fire, 'no wire = untouched');
const t1 = evaluate({ ...mk({ q: 'ecb', tier: 1 }), state: { lastMs: T0 } }, { now: T0 + 1e6, news: { items: [H(9, 'ECB item', T0 + 10e3, { read: { tier: 2 } })] } });
ok(!t1.fire, 'a tier-2 headline does not satisfy a tier-1 alert');
const store = { v: 1, rules: [{ ...mk(), state: { lastMs: T0 } }], sent: { day: '', n: 0 } };
const rr = run(store, { now: T0 + 400e3, news: { items: more } });
ok(rr.fired.length === 1 && rr.sent.n === 1, 'run fires it once and counts it');
ok(applyAction({ v: 1, rules: [], sent: {} }, { action: 'add', kind: 'news_keyword', params: { q: 'boe', tier: 2 } }, T0).ok, 'added through the same route as the other kinds');

// the tick asks for the wire only when a news rule exists
const asked = [], kvm = new Map(); const kv = { get: async k => kvm.get(k) ?? null, put: async (k, v) => { kvm.set(k, v); } };
await tick({ kv, fetchFeed: async p => { asked.push(p); return { json: { ok: true, items: [] } }; }, send: async () => true, now: () => T0 });
ok(asked.length === 0, 'no rules: nothing fetched');
kvm.set('desk_alert_rules_v1', JSON.stringify({ v: 1, rules: [mk()], sent: { day: '', n: 0 } }));
const sent = []; await tick({ kv, fetchFeed: async p => { asked.push(p); return { json: { ok: true, items } }; }, send: async t => { sent.push(t); return true; }, now: () => T0 });
ok(asked.some(p => p.startsWith('desk-news')) && !asked.some(p => p === 'live-layer' || p === 'fed-path'), 'only the wire is asked for');
await tick({ kv, fetchFeed: async () => ({ json: { ok: true, items: more } }), send: async t => { sent.push(t); return true; }, now: () => T0 + 400e3 });
ok(sent.length === 1 && /Desk alert/.test(sent[0]), 'a later tick sends the one note');
console.log(`deskAlertNews: ${n} checks OK`);
