// Tests for js/newsChannel.js.   node js/newsChannel.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { channelMessage, channelCandidates, allowChannel, validateConfig, publicView, parseConfig, groups, safeUrl, explainTelegramError, persistConfig, removeConfig, CAPS, CHANNEL_KV_KEY } from './newsChannel.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const M = 60e3;
const H = over => ({ id: 'h1', title: 'US CPI hotter than forecast, core at 0.4%', link: 'https://example.com/a?x=1&y=2', ms: Date.parse('2026-11-11T14:32:00Z'), sources: ['Reuters', 'Bloomberg'], tier: 1,
  read: { tier: 1, why: 'Faster inflation pushes back the first cut.', impact: { USD: 2, GOLD: -2, EUR: -1, JPY: -1, EQUITIES: -1, OIL: 1 }, book: 'against the USDJPY short' }, ...over });

t('the message has the tier, the headline as a link, the read-more link, the why, and the groups', () => {
  const m = channelMessage(H());
  assert.match(m, /^🚨 <b>TIER 1<\/b> · 14:32 UK/);
  assert.match(m, /<a href="https:\/\/example\.com\/a\?x=1&amp;y=2"><b>US CPI hotter than forecast, core at 0\.4%<\/b><\/a>/);
  assert.match(m, /<a href="[^"]+">→ Read the article<\/a> \(Reuters\)/);
  assert.match(m, /Why: Faster inflation pushes back the first cut\./);
  assert.match(m, /🟢 <b>LONG<\/b>   🇺🇸 USD ▲▲   🛢️ Oil ▲/);
  assert.match(m, /🔴 <b>SHORT<\/b>   🥇 Gold ▼▼   🇪🇺 EUR ▼   🇯🇵 JPY ▼   📈 Equities ▼/);
  assert.match(m, /<i>Context, not a signal · Reuters, Bloomberg<\/i>/);
});

t('grouped: every longs item has an up arrow and every shorts item a down arrow, strongest first', () => {
  const g = groups({ USD: 1, EUR: -2, GBP: -1, GOLD: 2, FOO: 5, JPY: 0 });
  assert.deepEqual(g.long.map(r => r.key), ['GOLD', 'USD']);
  assert.deepEqual(g.short.map(r => r.key), ['EUR', 'GBP']);
  const m = channelMessage(H({ read: { tier: 1, impact: { USD: 1, EUR: -2 } } }));
  const long = m.split('\n').find(l => l.includes('LONG')), short = m.split('\n').find(l => l.includes('SHORT'));
  assert.ok(long.includes('▲') && !long.includes('▼')); assert.ok(short.includes('▼') && !short.includes('▲'));
});

t('an empty group is left out; tier 2 uses the pin; no link means no link lines', () => {
  const m = channelMessage(H({ tier: 2, link: null, read: { tier: 2, why: 'ok', impact: { EUR: 1 } } }));
  assert.match(m, /^📌 <b>TIER 2<\/b>/); assert.ok(!m.includes('SHORT') && m.includes('LONG')); assert.ok(!m.includes('Read the article') && !m.includes('<a '));
  assert.match(m, /<b>US CPI/);
});

t('PRIVACY: the desk book lines are never in the shared message', () => {
  const m = channelMessage(H(), [{ inst: 'USDJPY', card: 'SHORT', stance: 'against' }]);
  assert.ok(!/Supports|Against|against the USDJPY|book|card/i.test(m), m);
  const src = fs.readFileSync(new URL('./newsChannel.js', import.meta.url), 'utf8');
  assert.ok(!/\.pairs|stance|\.book\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'the builder does not read pairs, stance or the book');
});

t('text is escaped and only plain http(s) links get in', () => {
  const m = channelMessage(H({ title: 'A <script>x</script> & "B"', link: 'javascript:alert(1)', read: { tier: 1, why: '<b>x</b>', impact: { USD: 1 } } }));
  assert.ok(!m.includes('<script>') && !m.includes('javascript:') && !m.includes('<b>x</b>')); assert.match(m, /&lt;script&gt;/);
  assert.equal(safeUrl('https://a.com/x?q=1&r=2'), 'https://a.com/x?q=1&amp;r=2'); assert.equal(safeUrl('ftp://a.com'), null); assert.equal(safeUrl('https://a.com/"onmouseover='), null); assert.equal(safeUrl(null), null);
  assert.ok(channelMessage(H({ title: 'x'.repeat(2000) })).length < 3500, 'under Telegram\'s 4096 limit');
});

t('candidates: the chosen tiers, with an impact, recent, unsent, oldest first', () => {
  const now = Date.parse('2026-11-11T15:00:00Z');
  const w = [H({ id: 'a' }), H({ id: 'b', tier: 2, read: { tier: 2, impact: { EUR: 1 } }, ms: now - 5 * M }), H({ id: 'c', read: { tier: 1, impact: {} } }), H({ id: 'd', ms: now - 90 * M, firstSeen: now - 90 * M }),
    H({ id: 'e', tier: 3, read: { tier: 3, impact: { USD: 1 } } }), H({ id: 'f', ms: now - 3 * M })];
  assert.deepEqual(channelCandidates(w, now).map(h => h.id), ['a', 'b', 'f']);
  assert.deepEqual(channelCandidates(w, now, { tiers: [1] }).map(h => h.id), ['a', 'f']);
  assert.deepEqual(channelCandidates(w, now, { sent: { 1: { sent: { a: 1 } }, 2: { sent: { b: 1 } } } }).map(h => h.id), ['f']);
});

t('a story published long ago is not sent even if the server only just saw it', () => {
  const now = Date.parse('2026-11-11T18:50:00Z');
  const fresh = H({ id: 'n', ms: now - 20 * M, firstSeen: now - 2 * M });
  const stale = H({ id: 'o', ms: now - 2 * 24 * 60 * M, firstSeen: now - 2 * M });
  assert.deepEqual(channelCandidates([fresh, stale], now).map(h => h.id), ['n']);
});

t('the longer detail is shown, but never if it mentions the desk, book or tools', () => {
  const ok = channelMessage(H({ read: { ...H().read, detail: 'Hotter inflation lifts yield expectations and the dollar. Watch Friday payrolls.' } }));
  assert.match(ok, /Why: Faster inflation[^\n]*\nHotter inflation lifts yield expectations/);
  for (const bad of ['This fits the desk book short USDJPY card.', 'We expect our signal to fire.', 'See the dashboard terminal.']) assert.doesNotMatch(channelMessage(H({ read: { ...H().read, detail: bad } })), /desk|signal to fire|dashboard/);
  assert.doesNotMatch(channelMessage(H()), /undefined|null/);
});

t('throttle: one per headline, six an hour for tier 1 and ten for tier 2, kept apart', () => {
  assert.deepEqual(CAPS, { 1: 6, 2: 10 });
  let st = null;
  for (let i = 0; i < 6; i++) { const r = allowChannel(st, `a${i}`, 1, i * M); assert.ok(r.ok); st = r.state; }
  assert.equal(allowChannel(st, 'a6', 1, 10 * M).why, 'cap 6 an hour');
  for (let i = 0; i < 10; i++) { const r = allowChannel(st, `b${i}`, 2, i * M); assert.ok(r.ok, `tier 2 note ${i}`); st = r.state; }
  assert.equal(allowChannel(st, 'b10', 2, 11 * M).why, 'cap 10 an hour');
  assert.equal(allowChannel(st, 'a0', 1, 90 * M).why, 'already sent');
});

const TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw0';
t('config: a good token and channel are kept; the token can be left empty to keep the saved one; bad input is refused with a reason', () => {
  const a = validateConfig({ token: TOKEN, chatId: '@macro_news_blast' }, null, 0); assert.equal(a.ok, true);
  assert.deepEqual(a.cfg, { v: 1, token: TOKEN, chatId: '@macro_news_blast', on: true, tiers: [1, 2], savedAt: '1970-01-01T00:00:00.000Z' });
  const b = validateConfig({ chatId: '-1001234567890', tiers: [1], on: false }, a.cfg); assert.equal(b.ok, true); assert.equal(b.cfg.token, TOKEN); assert.deepEqual(b.cfg.tiers, [1]); assert.equal(b.cfg.on, false);
  assert.match(validateConfig({ chatId: '@macro_news_blast' }).error, /token is required/);
  assert.match(validateConfig({ token: 'nope', chatId: '@macro_news_blast' }).error, /does not look like a bot token/);
  assert.match(validateConfig({ token: TOKEN, chatId: 'macro news' }).error, /channel must be/);
  assert.match(validateConfig({ token: TOKEN, chatId: '@abc' }).error, /channel must be/);
  assert.match(validateConfig({ token: TOKEN, chatId: '@macro_news_blast', tiers: [3] }).error, /pick tier 1/);
});

t('the page never sees the token', () => {
  const cfg = validateConfig({ token: TOKEN, chatId: '@macro_news_blast' }).cfg, v = publicView(cfg);
  assert.deepEqual(Object.keys(v).sort(), ['chatId', 'configured', 'on', 'savedAt', 'tiers', 'tokenHint']);
  assert.equal(v.tokenHint, '••••saw0'); assert.ok(!JSON.stringify(v).includes(TOKEN.slice(0, 20)));
  assert.deepEqual(publicView(null), { configured: false }); assert.equal(parseConfig('{bad'), null); assert.equal(parseConfig(JSON.stringify(cfg)).chatId, '@macro_news_blast');
});

t('registered where the repo requires, and the server routes are login-gated and never echo the token', () => {
  assert.equal(CHANNEL_KV_KEY, 'news_channel_v1');
  for (const f of ['../kv.js', './storeRegistry.js']) assert.ok(fs.readFileSync(new URL(f, import.meta.url), 'utf8').includes(CHANNEL_KV_KEY), f);
  assert.equal((fs.readFileSync(new URL('../_worker.js', import.meta.url), 'utf8').match(/'news_channel_v1'/g) ?? []).length, 2, 'both lists in _worker.js');
  const s = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  for (const r of ["app.get('/api/news-channel', _agentsGate", "app.post('/api/news-channel', _agentsGate, _agentsSameOrigin", "app.delete('/api/news-channel', _agentsGate, _agentsSameOrigin", "app.post('/api/news-channel/test', _agentsGate, _agentsSameOrigin", "app.get('/api/news-channel/preview', _agentsGate"]) assert.ok(s.includes(r), r);
});

t('a bot name is refused as the channel, and Telegram errors are explained in plain words', () => {
  const e = validateConfig({ token: TOKEN, chatId: '@TheChain_Newsbot' }).error;
  assert.match(e, /looks like a bot's name/); assert.match(e, /add the bot as an administrator/);
  assert.equal(validateConfig({ token: TOKEN, chatId: '-1001234567890' }).ok, true, 'the number always works');
  assert.match(explainTelegramError("Forbidden: the bot can't send messages to the bot"), /CHANNEL, not to the bot[\s\S]*\(Telegram said: Forbidden: the bot can't send messages to the bot\)/);
  assert.match(explainTelegramError('Bad Request: chat not found'), /cannot find that channel/);
  assert.match(explainTelegramError('Forbidden: bot is not a member of the channel chat'), /not in the channel/);
  assert.match(explainTelegramError('Bad Request: not enough rights to send text messages to the chat'), /allow "Post messages"/);
  assert.match(explainTelegramError('Unauthorized'), /rejected the bot token/);
  assert.equal(explainTelegramError('something new'), 'something new', 'an unknown message is passed through as it is');
});


// a fake store that behaves like kv.js: a "silent" backend failure keeps the value in memory only and the strict read does not see it
const fakeKv = ({ silentPutFail = false, putThrows = false, strictThrows = false, delSilentFail = false } = {}) => { const durable = new Map(), mem = new Map();
  return { durable, mem,
    put: async (k, v) => { if (putThrows) throw new Error('boom'); if (silentPutFail) { mem.set(k, v); return; } durable.set(k, v); },
    getStrict: async k => { if (strictThrows) throw new Error('CF down'); return durable.get(k) ?? null; },
    del: async k => { if (delSilentFail) return; durable.delete(k); } }; };
const GOOD = () => validateConfig({ token: TOKEN, chatId: '@macro_news' }).cfg;


await (async () => {
  const a = fakeKv(); const cfg = GOOD(); assert.deepEqual(await persistConfig(a, cfg), { ok: true }); assert.equal(JSON.parse(a.durable.get(CHANNEL_KV_KEY)).token, TOKEN); n++;
  const b = fakeKv({ silentPutFail: true }); const rb = await persistConfig(b, cfg); assert.equal(rb.ok, false); for (const w of ['did not reach the permanent store', 'lost on the next deploy', 'Nothing was changed']) assert.ok(rb.error.includes(w), w); assert.equal(b.durable.size, 0); n++;
  const c = fakeKv({ putThrows: true }); assert.equal((await persistConfig(c, cfg)).ok, false); n++;
  const d = fakeKv({ strictThrows: true }); assert.equal((await persistConfig(d, cfg)).ok, false, 'an unreadable store is not "saved"'); n++;
  // an update that silently fails must not look saved when the OLD value is still what the store holds
  const e = fakeKv(); await persistConfig(e, cfg); e.put = async (k, v) => { e.mem.set(k, v); }; const upd = { ...cfg, chatId: '@other_channel' }; assert.equal((await persistConfig(e, upd)).ok, false); assert.equal(JSON.parse(e.durable.get(CHANNEL_KV_KEY)).chatId, '@macro_news'); n++;
  // disconnect: proven gone, and a silent delete failure is reported
  const f = fakeKv(); await persistConfig(f, cfg); assert.deepEqual(await removeConfig(f), { ok: true }); assert.equal(f.durable.size, 0); n++;
  const g = fakeKv({ delSilentFail: true }); await persistConfig(g, cfg); const rg = await removeConfig(g); assert.equal(rg.ok, false); assert.match(rg.error, /could not be deleted/); n++;
})();
console.log(`newsChannel: ${n} tests ok`);
