// node --test js/terminal/newsSearchView.test.mjs: the saved-searches bar over the stand-in DOM: list, apply, save, delete, alert; a desk login gets the list only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePage, makeWin } from './feelFakeDom.fixtures.mjs';
import { mountNewsSearches, installNewsSearches } from './newsSearchView.js';

async function setup({ viewer = false, searches = [{ name: 'ECB', q: 'ecb', tier: 1, keys: [], onlyBook: false }] } = {}) {
  const doc = makePage();
  doc.querySelector('main').innerHTML += '<div id="nt-saved"></div>';
  const applied = [], posted = [], alerts = []; let cur = { q: 'boe cut', tier: 2, keys: ['GBP'], onlyBook: false }, list = searches;
  const win = makeWin(doc, { deskIsViewer: () => viewer, deskNews: { state: () => cur, apply: s => { applied.push(s); cur = { ...s }; } } });
  const call = async (m, b) => { if (m === 'GET') return { ok: true, searches: list }; posted.push(b); if (b.action === 'save') list = [...list.filter(s => s.name !== b.name), { name: b.name, ...b.search }]; else list = list.filter(s => s.name !== b.name); return { ok: true, searches: list }; };
  const m = mountNewsSearches({ host: doc.getElementById('nt-saved'), win, call, callAlert: async b => { alerts.push(b); return { ok: true }; }, ask: () => 'My BoE', sure: () => true });
  await new Promise(r => setTimeout(r, 5));
  return { doc, win, m, applied, posted, alerts, host: doc.getElementById('nt-saved') };
}

test('the bar lists the saved searches; picking one sets the News filter to it', async () => {
  const { doc, host, applied } = await setup();
  assert.ok(host.innerHTML.includes('value="ECB"'));
  const pick = doc.getElementById('ns-pick'); pick.value = 'ECB'; doc.fire('change', pick);
  assert.equal(applied.length, 1); assert.equal(applied[0].q, 'ecb'); assert.equal(applied[0].tier, 1);
  assert.match(host.innerHTML, /words &quot;ecb&quot;|words "ecb"/);
});
test('the owner saves the current filter under a name, and the list shows it', async () => {
  const { host, posted } = await setup();
  host.querySelector('[data-ns="save"]').click(); await new Promise(r => setTimeout(r, 5));
  assert.equal(posted[0].action, 'save'); assert.equal(posted[0].name, 'My BoE'); assert.equal(posted[0].search.q, 'boe cut');
  assert.ok(host.innerHTML.includes('value="My BoE"'));
});
test('delete asks the server to remove the picked search; alert turns the current words into a keyword alert', async () => {
  const { doc, host, posted, alerts } = await setup();
  const pick = doc.getElementById('ns-pick'); pick.value = 'ECB'; doc.fire('change', pick);
  host.querySelector('[data-ns="alert"]').click(); await new Promise(r => setTimeout(r, 5));
  assert.equal(alerts[0].kind, 'news_keyword'); assert.equal(alerts[0].params.q, 'ecb'); assert.match(host.innerHTML, /Alert added/);
  host.querySelector('[data-ns="delete"]').click(); await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(posted.at(-1), { action: 'delete', name: 'ECB' });
});
test('an alert needs words: a filter with only a currency says so and sends nothing', async () => {
  const { host, alerts, win } = await setup({ searches: [] });
  win.deskNews.state = () => ({ q: '', tier: 2, keys: ['USD'], onlyBook: false });
  host.querySelector('[data-ns="alert"]').click(); await new Promise(r => setTimeout(r, 5));
  assert.equal(alerts.length, 0); assert.match(host.innerHTML, /needs words/);
});
test('a desk login gets the list and the picker, never the save, delete or alert buttons', async () => {
  const { host } = await setup({ viewer: true });
  assert.ok(host.innerHTML.includes('ns-pick')); assert.ok(!host.innerHTML.includes('data-ns='));
});
test('the loader hook mounts on a bar that already exists and on one the tab builds later', async () => {
  const doc = makePage(); doc.querySelector('main').innerHTML += '<div id="nt-saved"></div>';
  const win = makeWin(doc, { fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, searches: [] }) }) });
  assert.equal(installNewsSearches({ doc, win }), true, 'a bar already on the page is mounted now');
  assert.equal(installNewsSearches({ doc: makePage(), win: makeWin(makePage()) }), false, 'no bar yet: only the hook is installed');
  assert.equal(typeof win.deskNewsSavedMount, 'function');
  assert.equal(doc.getElementById('nt-saved').dataset.nsMounted, '1');
});
