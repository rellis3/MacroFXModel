// node js/yahooFundAum.test.mjs
import assert from 'node:assert/strict';
import { fetchYahooFundAum, parseFundAum, resetYahooSession, yahooSession } from './yahooFundAum.js';
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('✓', name); };
const body = v => ({ quoteSummary: { result: [{ defaultKeyStatistics: { totalAssets: { raw: v } } }] } });
const resp = (status, data, text, cookies = []) => ({ ok: status >= 200 && status < 300, status, json: async () => data, text: async () => text ?? '', headers: { getSetCookie: () => cookies } });

await t('parseFundAum reads totalAssets and refuses junk', () => {
  assert.equal(parseFundAum(body(131e9)), 131e9);
  assert.equal(parseFundAum({ quoteSummary: { result: [{ summaryDetail: { totalAssets: { raw: 5 } } }] } }), 5);
  assert.equal(parseFundAum({}), null); assert.equal(parseFundAum(body(0)), null); assert.equal(parseFundAum(body('x')), null);
});
await t('session: cookie from the homepage, crumb from getcrumb, cached for an hour', async () => {
  resetYahooSession(); const calls = [];
  const f = async (url, o) => { calls.push([url, o?.headers?.Cookie]); return url.includes('getcrumb') ? resp(200, null, 'abc123') : resp(200, null, '', ['A3=xyz; Path=/', 'GUCS=q; Path=/']); };
  const s = await yahooSession(f, 1000); assert.equal(s.crumb, 'abc123'); assert.equal(s.cookie, 'A3=xyz; GUCS=q');
  assert.equal(calls[1][1], 'A3=xyz; GUCS=q'); await yahooSession(f, 2000); assert.equal(calls.length, 2);
});
await t('a crumb that is HTML or an HTTP error throws, never caches', async () => {
  resetYahooSession();
  await assert.rejects(() => yahooSession(async u => u.includes('getcrumb') ? resp(200, null, '<html>') : resp(200, null)), /unexpected/);
  await assert.rejects(() => yahooSession(async u => u.includes('getcrumb') ? resp(429, null, '') : resp(200, null)), /429/);
});
await t('fund AUM: sends the crumb, returns the number; a 401 gets one fresh session and retry; a second 401 throws', async () => {
  resetYahooSession(); let q = 0, crumbs = 0;
  const f = async u => { if (u.includes('getcrumb')) { crumbs++; return resp(200, null, 'c' + crumbs); } if (!u.includes('quoteSummary')) return resp(200, null); q++; return q === 1 ? resp(401, {}) : resp(200, body(58e9)); };
  assert.equal(await fetchYahooFundAum('IAU', f), 58e9); assert.equal(crumbs, 2);
  resetYahooSession();
  await assert.rejects(() => fetchYahooFundAum('IAU', async u => u.includes('getcrumb') ? resp(200, null, 'c') : u.includes('quoteSummary') ? resp(401, {}) : resp(200, null)), /HTTP 401/);
});
await t('a body without the field is an error, not a zero', async () => {
  resetYahooSession();
  await assert.rejects(() => fetchYahooFundAum('GLD', async u => u.includes('getcrumb') ? resp(200, null, 'c') : u.includes('quoteSummary') ? resp(200, { quoteSummary: { result: [{}] } }) : resp(200, null)), /no totalAssets/);
});
console.log(`\n${n} passed`);
