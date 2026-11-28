import test from 'node:test';
import assert from 'node:assert/strict';
import { weekDates, buildDigest, digestText, digestHtml, dayLabel } from './helixDigestCore.js';
import { mount } from './helixBroadcast.js';
import { KV_KEY } from './helixBroadcastCore.js';

const rec = (date, { movers = [], chainAm = null, chainPm = null, review = null, head = null } = {}) => ({
  date, runs: {
    morning: { headline: head ? { headline: head } : null, inputs: { movers: [], chain: chainAm }, plan: [] },
    evening: { headline: null, inputs: { movers, chain: chainPm ?? chainAm }, plan: review ? [{ kind: 'scene', id: 'dayreview', title: 'The Releases', text: review }] : [] },
  },
});
const WEEK = weekDates('2026-11-25');
const RECORDS = {
  '2026-11-23': rec('2026-11-23', { movers: [{ key: 'GOLD', oc: 1.2, vsUsual: 2.4 }, { key: 'EURUSD', oc: -0.3, vsUsual: -0.8 }], chainAm: { holding: 9, broken: 2, brokenShort: ['oil→CAD', 'yields→USD'] }, head: 'Gold runs 2.4 times its usual move' }),
  '2026-11-24': rec('2026-11-24', { movers: [{ key: 'GOLD', oc: 0.4, vsUsual: 0.9 }, { key: 'NQ', oc: -2.1, vsUsual: -3.1 }], chainAm: { holding: 10, broken: 1, brokenShort: ['yields→USD'] }, review: 'US CPI printed 0.4 against 0.3 expected; the dollar rose 0.3 percent in the half hour after.' }),
  '2026-11-27': rec('2026-11-27', { movers: [{ key: 'USDJPY', oc: 0.5, vsUsual: 1.1 }], chainAm: { holding: 8, broken: 2, brokenShort: ['yields→USD', 'gold→AUD'] } }),
};
const EVENTS = [
  { ms: Date.parse('2026-11-24T13:30:00Z'), country: 'USD', event: 'CPI m/m', impact: 'high', actual: '0.4%', estimate: '0.3%', prev: '0.2%' },
  { ms: Date.parse('2026-11-24T09:30:00Z'), country: 'GBP', event: 'Retail Sales', impact: 'medium', actual: '0.1%' },
  { ms: Date.parse('2026-12-04T13:30:00Z'), country: 'USD', event: 'Non-Farm Employment Change', impact: 'high', estimate: '150K' },
  { ms: Date.parse('2026-11-16T13:30:00Z'), country: 'USD', event: 'Old', impact: 'high', actual: '1' },
];
const ITEMS = [{ id: 'yt-abcDEF12345', kind: 'video', part: 'weekly', title: 'H.E.L.I.X. Weekly · x', url: 'https://youtu.be/abcDEF12345', at: '2026-11-27T22:40:00Z' },
  { id: 'yt-old', kind: 'video', part: 'morning', title: 'old', url: 'https://youtu.be/oldoldold12', at: '2026-11-13T07:40:00Z' }];

test('weekDates: Monday to Friday; a weekend belongs to the week just ended', () => {
  assert.deepEqual(weekDates('2026-11-25'), ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27']);
  assert.deepEqual(weekDates('2026-11-28'), weekDates('2026-11-27')); assert.deepEqual(weekDates('2026-11-29'), weekDates('2026-11-23'));
  assert.deepEqual(weekDates('nope'), []);
  assert.equal(dayLabel('2026-11-27'), 'Fri 27 Nov');
});

test('buildDigest: biggest moves vs usual, releases, the release review, chain breaks and heals, next week, the week\'s videos', () => {
  const d = buildDigest({ week: WEEK, records: RECORDS, events: EVENTS, items: ITEMS, now: Date.parse('2026-11-27T23:00:00Z') });
  assert.ok(d.ok);
  assert.deepEqual(d.moves.map(m => m.key), ['NQ', 'GOLD', 'USDJPY', 'EURUSD'], 'one row per market, its biggest day, largest first by |vs usual|');
  assert.equal(d.moves[1].date, '2026-11-23');
  assert.deepEqual(d.releases.map(r => r.event), ['CPI m/m'], 'high impact with an actual, inside the week only');
  assert.equal(d.releases[0].time, '13:30'); assert.equal(d.releases[0].forecast, '0.3%');
  assert.equal(d.reactions.length, 1); assert.ok(d.reactions[0].text.includes('half hour after'));
  assert.deepEqual(d.chain.broke, ['gold→AUD']); assert.deepEqual(d.chain.healed, ['oil→CAD']); assert.deepEqual(d.chain.stillBroken, ['yields→USD']);
  assert.deepEqual(d.missing, ['2026-11-25', '2026-11-26']);
  assert.deepEqual(d.next.map(e => e.event), ['Non-Farm Employment Change']);
  assert.deepEqual(d.videos.map(v => v.url), ['https://youtu.be/abcDEF12345']);
  assert.equal(d.headlines[0].text, 'Gold runs 2.4 times its usual move');
});

test('digestText and digestHtml: description only, printable, escaped, every section', () => {
  const d = buildDigest({ week: WEEK, records: RECORDS, events: EVENTS, items: ITEMS, now: Date.parse('2026-11-27T23:00:00Z') });
  const t = digestText(d, 'https://h/api/helix/weekly-digest?week=2026-11-23');
  for (const s of ['WEEKLY DIGEST', 'NQ −2.10% on Tue 24 Nov, 3.1× its usual day', 'CPI m/m: 0.4% (forecast 0.3%, previous 0.2%)', 'Broke this week: gold→AUD', 'Healed this week: oil→CAD', 'Non-Farm', 'youtu.be/abcDEF12345', 'Description only']) assert.ok(t.includes(s), s);
  assert.ok(!/\b(buy|sell|long|short)\b/i.test(t.replace(/Shorts?/g, '')), 'no trade words');
  const h = digestHtml({ ...d, headlines: [{ date: '2026-11-23', part: 'morning', text: '<script>x</script>' }] }, { textHref: '/t', prevHref: '/p' });
  assert.ok(h.startsWith('<!doctype html>') && h.includes('@media print') && h.includes('window.print()') && h.includes('prefers-color-scheme'));
  assert.ok(!h.includes('<script>x') && h.includes('&lt;script&gt;'));
  assert.ok(digestHtml({ ok: false }).includes('Nothing to show') && digestText(null).includes('nothing'));
});

test('route: owner only, html/text/json, R2 records read, and the weekly recap note carries the digest link', async () => {
  const routes = {}, app = { get: (p, ...h) => { routes[`GET ${p}`] = h; }, post: (p, ...h) => { routes[`POST ${p}`] = h; } };
  const store = new Map([[KV_KEY, JSON.stringify({ day: '2026-11-27', items: ITEMS })]]), sent = [], gets = [];
  let owner = true;
  const deps = { express: { json: () => (_q, _r, n) => n(), raw: () => (_q, _r, n) => n() }, kv: { get: async k => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } },
    ownerOnly: (_q, r, n) => (owner ? n() : r.status(401).json({ ok: false })), tgSendAs: async (s, t) => { sent.push(t); return true; }, londonDate: () => '2026-11-27',
    selfJson: async () => EVENTS, r2: { configured: () => true, getJSON: async k => { gets.push(k); const m = /helix\/days\/(.+)\.json$/.exec(k); return m ? RECORDS[m[1]] ?? null : null; } } };
  await mount(app, deps);
  const call = async (key, req) => {
    const res = { code: 200, body: null, ct: null, set() { return this; }, type(t) { this.ct = t; return this; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; }, send(b) { this.body = b; return this; } };
    const q = { get: h => ({ host: 'desk.example', ...(req.headers ?? {}) })[h.toLowerCase()], query: {}, params: {}, ...req };
    const hs = routes[key]; let i = 0; const next = async () => { const h = hs[i++]; if (h) await h(q, res, next); }; await next(); return res;
  };
  let r = await call('GET /api/helix/weekly-digest', { query: { week: '2026-11-25' } });
  assert.ok(String(r.body).includes('Weekly Digest') && r.ct.startsWith('text/html'));
  assert.ok(gets.includes('helix/days/2026-11-23.json') && gets.includes('helix/days/2026-11-27.json'));
  r = await call('GET /api/helix/weekly-digest', { query: { week: '2026-11-25', format: 'text' } }); assert.ok(r.ct.startsWith('text/plain') && r.body.includes('https://desk.example/api/helix/weekly-digest?week=2026-11-23'));
  r = await call('GET /api/helix/weekly-digest', { query: { format: 'json' } }); assert.equal(r.body.week.from, '2026-11-23', 'default: this London week');
  owner = false; r = await call('GET /api/helix/weekly-digest', { query: {} }); assert.equal(r.code, 401, 'owner only'); owner = true;
  const prev = process.env.KV_WRITE_SECRET; delete process.env.KV_WRITE_SECRET;
  try {
    r = await call('POST /api/helix/broadcast-published', { body: { videoId: 'wkyDEF12345', title: 'Weekly', part: 'weekly', seconds: 400 } });
    assert.ok(r.body.sent && r.body.digest === 'https://desk.example/api/helix/weekly-digest?week=2026-11-27');
    assert.ok(sent.at(-1).includes('Written digest (prints to PDF): https://desk.example/api/helix/weekly-digest?week=2026-11-27'));
    r = await call('POST /api/helix/broadcast-published', { body: { videoId: 'mrnDEF12345', title: 'Morning', part: 'morning' } });
    assert.equal(r.body.digest, null); assert.ok(!sent.at(-1).includes('digest'), 'only the weekly note carries it');
  } finally { if (prev != null) process.env.KV_WRITE_SECRET = prev; }
});
