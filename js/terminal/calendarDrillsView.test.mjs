// node --test js/terminal/calendarDrillsView.test.mjs: the calendar drills over the stand-in DOM: the two cards, a drill button on each release row tied to its event, the drill's content (similar
// releases, nowcast gap with its grade), the owner's private call hidden from a desk login, and every source failing. It does NOT prove the look (themes, phone width) in a real browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePage, makeWin } from './feelFakeDom.fixtures.mjs';
import { mountCalendarDrills, earningsCardHtml, scorecardsCardHtml, drillHtml, historyHtml, zStripSvg } from './calendarDrillsView.js';
import { releaseHistory } from '../releaseHistory.js';

const NOW = Date.parse('2026-11-16T09:00:00Z');
const EV = [
  { ms: Date.parse('2026-11-16T13:30:00Z'), country: 'US', event: 'Core Inflation Rate MoM', impact: 'High', estimate: '0.3%', prev: '0.3%' },
  { ms: Date.parse('2026-11-16T15:00:00Z'), country: 'GB', event: 'Some Obscure Survey', impact: 'Low' },
];
const earn = { ok: true, rows: [{ date: '2026-11-16', symbol: 'NVDA', name: 'Nvidia', capB: 4000, when: 'after the close', tracked: true }] };
const cards = { ok: true, scorecards: [{ key: 'US|1', country: 'US', ms: 1, prints: [{ event: 'Core CPI MoM', actual: '0.4%', estimate: '0.3%' }], reactions: [{ name: 'EURUSD', move: 18, unit: 'pips', dir: 'down', ratio: 2.1, book: { spike: 2.9, n: 124 } }], call: { call: 'higher', result: 'hit' } }] };
const nowcast = { ok: true, cleveland: { month: '2026-11', asOf: '2026-11-14', cpi: 0.31, core: 0.27 }, gdpnow: null };

function setup({ viewer = false, fail = false, hist = null } = {}) {
  const doc = makePage();
  const wrap = doc.createElement('div'); doc.querySelector('main').appendChild(wrap);
  wrap.innerHTML = '<div id="cal-drills" hidden></div><section id="cal" hidden><table><tbody>'
    + '<tr><td class="n">13:30</td><td><b>US</b></td><td>Core Inflation Rate MoM <span class="chip dn">High</span></td><td></td></tr>'
    + '<tr><td class="n">15:00</td><td><b>GB</b></td><td>Some Obscure Survey</td><td></td></tr></tbody></table></section>';
  const nav = doc.getElementById('tabs'), tab = doc.createElement('button'); tab.setAttribute('data-t', 'cal'); tab.setAttribute('aria-selected', 'false'); nav.appendChild(tab);
  tab.addEventListener('click', () => { for (const x of doc.querySelectorAll('#tabs [data-t]')) x.attrs['aria-selected'] = String(x === tab); });
  const fetched = [];
  const win = makeWin(doc, { setInterval: () => 1, clearInterval() {}, deskIsViewer: () => viewer, fetch: async u => { fetched.push(u); if (fail) throw new Error('down'); const j = u.startsWith('/api/earnings') ? earn : u.startsWith('/api/release-calls') ? cards : u.startsWith('/api/release-history') ? (hist ?? { ok: true, found: false, note: 'No past print of this release is held in the surprise store.' }) : nowcast; return { ok: true, json: async () => j }; } });
  const m = mountCalendarDrills({ doc, win, getEvents: () => EV, now: () => NOW });
  return { doc, win, m, fetched };
}
const open = async ctx => { ctx.doc.querySelector('#tabs [data-t="cal"]').click(); ctx.win.flush(); await new Promise(r => setTimeout(r, 20)); };

test('opening the Calendar tab shows the earnings and scorecard cards; leaving hides them', async () => {
  const c = setup(); assert.equal(c.doc.getElementById('cal-drills').hidden, true);
  await open(c);
  const h = c.doc.getElementById('cal-drills');
  assert.equal(h.hidden, false); assert.ok(h.innerHTML.includes('NVDA')); assert.match(h.innerHTML, /Core CPI MoM: 0\.4%, higher than the 0\.3% expected/); assert.match(h.innerHTML, /EUR\/USD moved 18 pips down/);
  assert.deepEqual([...new Set(c.fetched)].sort(), ['/api/earnings-ahead', '/api/nowcast', '/api/release-calls?days=30']);
  c.doc.querySelector('#tabs [data-t="overview"]').click(); assert.equal(h.hidden, true);
});
test('the owner\'s private call is shown to the owner and never to a desk login', async () => {
  const o = setup(); await open(o); assert.match(o.doc.getElementById('cal-drills').innerHTML, /Your call: higher \(right\)/);
  const v = setup({ viewer: true }); await open(v); assert.ok(!/Your call/.test(v.doc.getElementById('cal-drills').innerHTML));
});
test('each release row gets a drill button tied to its event; opening it shows the history and the nowcast gap, opening again closes it', async () => {
  const c = setup(); await open(c); c.m.decorate();
  const btns = c.doc.querySelectorAll('.cd-btn'); assert.equal(btns.length, 2, 'one per row');
  btns[0].click();
  const det = c.doc.querySelector('.cd-det'); assert.ok(det);
  assert.match(det.innerHTML, /What this release has done before/); assert.match(det.innerHTML, /size, not direction/); assert.match(det.innerHTML, /Nowcast gap/); assert.match(det.innerHTML, /context only: tested, no edge/); assert.match(det.innerHTML, /about the same/);
  assert.equal(btns[0].getAttribute('aria-expanded'), 'true');
  btns[0].click(); assert.equal(c.doc.querySelector('.cd-det'), null); assert.equal(btns[0].getAttribute('aria-expanded'), 'false');
  btns[1].click(); assert.match(c.doc.querySelector('.cd-det').innerHTML, /Nothing held about this release/, 'a release the book does not know says so');
});
test('every source failing: the cards say so in words, the rows still get their buttons, nothing throws', async () => {
  const c = setup({ fail: true }); await open(c); c.m.decorate();
  assert.match(c.doc.getElementById('cal-drills').innerHTML, /No big-company earnings/); assert.match(c.doc.getElementById('cal-drills').innerHTML, /No release scorecard yet/);
  c.doc.querySelector('.cd-btn').click(); assert.ok(c.doc.querySelector('.cd-det').innerHTML.includes('What this release has done before'));
  assert.ok(!c.doc.querySelector('.cd-det').innerHTML.includes('Nowcast gap'), 'no nowcast, no gap');
});
test('the card builders escape what comes from outside and say nothing about direction', () => {
  const html = earningsCardHtml([{ date: '2026-11-16', symbol: 'X<b>', name: 'Evil "co"', capB: 200, when: 'before the open' }], NOW) + scorecardsCardHtml([{ ms: 1, country: 'US', prints: [{ event: '<img src=x>', actual: '1', estimate: '1' }], reactions: [] }]) + drillHtml({ country: 'US', event: 'Core CPI MoM', estimate: '<b>' }, nowcast);
  assert.ok(!/<img|<b>/.test(html)); assert.ok(!/\b(buy|sell|bullish|bearish)\b/i.test(html));
});
test('no cal-drills container = nothing mounted', () => { assert.equal(mountCalendarDrills({ doc: makePage(), win: makeWin(makePage()) }), null); });

// ── the past-prints drawer (js/releaseHistory.js -> /api/release-history) ──
const row = (date, estimate, actual, prev, extra = {}) => ({ country: 'US', event: 'Core Inflation Rate MoM', ms: Date.parse(`${date}T13:30:00Z`), time: `${date}T13:30:00Z`, impact: 'high', estimate, actual, prev, ...extra });
const STORE = ['2026-01-14', '2026-02-11', '2026-03-11', '2026-04-14', '2026-05-12', '2026-06-10', '2026-07-14', '2026-08-12'].map((d, i) => row(d, ['0.3%', '0.3%', '0.2%', '0.3%', '0.4%', '0.3%', '0.3%', '0.2%'][i], ['0.3%', '0.4%', '0.2%', '0.2%', '0.5%', '0.3%', '0.4%', '<img src=x>'][i], '0.3%'));
const HIST = releaseHistory(STORE, { country: 'US', event: 'Core Inflation Rate MoM', n: 12, now: NOW });

test('the past-prints drawer: a row per print, the surprise with its z, what is missing, the size-not-direction chip and the Evidence Book verdict', () => {
  const h = historyHtml(HIST);
  assert.equal((h.match(/<tr><td class="mono">/g) ?? []).length, HIST.rows.length);
  assert.match(h, /Past prints of this release/); assert.match(h, /size, not direction/); assert.match(h, /Not available: a forecast range/);
  assert.match(h, /data-ev="surprise-size"/); assert.match(h, /8 prints held since/); assert.match(h, /above, \d+ in line, \d+ below/);
  assert.match(h, /<svg class="cd-z"/);
  assert.ok(!/NaN|undefined/.test(h), 'no NaN or undefined');
  assert.ok(!/<img/.test(h) && /&lt;img src=x&gt;/.test(h), 'what comes from the store is escaped');
  assert.ok(!/\b(buy|sell|bullish|bearish)\b/i.test(h));
});

test('the past-prints drawer says so when nothing is held or the route failed', () => {
  assert.match(historyHtml({ ok: true, found: false, note: 'No past print of this release is held in the surprise store.' }), /No past print of this release is held/);
  assert.match(historyHtml(null), /nothing to show/);
  assert.match(historyHtml({ ok: false, error: 'x' }), /nothing to show/);
});

test('the z strip: needs two prints, one bar each, theme tokens only', () => {
  assert.equal(zStripSvg([{ z: 1 }]), '');
  const svg = zStripSvg(HIST.rows);
  assert.equal((svg.match(/<rect /g) ?? []).length, HIST.rows.filter(r => r.z != null).length);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(svg));
});

test('opening a drill fetches that release\'s past prints and draws them in the drill, after a loading line', async () => {
  const c = setup({ hist: HIST }); await open(c); c.m.decorate();
  c.doc.querySelectorAll('.cd-btn')[0].click();
  assert.match(c.doc.querySelector('.cd-hist').innerHTML, /Loading the past prints/);
  await new Promise(r => setTimeout(r, 20));
  assert.ok(c.fetched.some(u => u.startsWith('/api/release-history?country=US&event=Core%20Inflation%20Rate%20MoM&n=12')), c.fetched.join(' | '));
  assert.match(c.doc.querySelector('.cd-hist').innerHTML, /8 prints held since/); assert.match(c.doc.querySelector('.cd-det').innerHTML, /What this release has done before/, 'the earlier drill content is still there');
});

test('a release with no stored history says nothing is held, and a failing route does not break the drill', async () => {
  const c = setup(); await open(c); c.m.decorate();
  c.doc.querySelectorAll('.cd-btn')[0].click(); await new Promise(r => setTimeout(r, 20));
  assert.match(c.doc.querySelector('.cd-hist').innerHTML, /No past print of this release is held/);
  const f = setup({ fail: true }); await open(f); f.m.decorate();
  f.doc.querySelectorAll('.cd-btn')[0].click(); await new Promise(r => setTimeout(r, 20));
  assert.match(f.doc.querySelector('.cd-hist').innerHTML, /nothing to show/);
});
