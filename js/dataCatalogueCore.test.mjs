// Tests for js/dataCatalogueCore.js — the scan + merge behind the 🗄 Data Map.
// Run:  node --test js/dataCatalogueCore.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endpointPattern, pageTitle, scanUsage, uncataloguedHosts, statusOf, buildCatalogue, stampOf } from './dataCatalogueCore.js';

test('an endpoint does not match a longer sibling route', () => {
  const re = endpointPattern('/api/rates');
  assert.ok(re.test("fetch('/api/rates')"));
  assert.ok(re.test('fetch(`/api/rates?d=5`)'));
  assert.ok(!re.test("fetch('/api/rates-history')"), 'rates-history is a different endpoint');
  assert.ok(!re.test("fetch('/api/ratesX')"));
});

test('a route param matches a literal or a template segment', () => {
  const re = endpointPattern('/api/cot/:ccy');
  assert.ok(re.test("fetch('/api/cot/EUR')"));
  assert.ok(re.test('fetch(`/api/cot/${c}`)'));
  assert.ok(!re.test("fetch('/api/cot')"), 'the bare route has no param');
});

test('the page title is the first <title>, not one inside an SVG later on', () => {
  assert.equal(pageTitle('<head><title>Daily Brief</title></head><svg><title>tap</title></svg>'), 'Daily Brief');
  assert.equal(pageTitle('<p>no title</p>'), null);
  assert.equal(pageTitle('<title>A &amp; B</title>'), 'A & B');
  assert.equal(pageTitle('<title>Backtest Engine — MacroFXModel</title>'), 'Backtest Engine');
});

test('scanUsage lists every file that names the endpoint', () => {
  const files = [
    { path: 'a.html', text: "fetch('/api/crack')" },
    { path: 'b.html', text: "fetch('/api/crack-history')" },
    { path: 'js/c.js', text: 'get("/api/crack?x=1")' },
  ];
  assert.deepEqual(scanUsage(files, ['/api/crack']), { '/api/crack': ['a.html', 'js/c.js'] });
});

test('a host nobody claims is reported; subdomains of a claimed host are not', () => {
  const server = "fetch('https://api.stlouisfed.org/x'); fetch('https://query1.finance.yahoo.com/v8'); fetch('https://new.example.com/feed')";
  const feeds = [{ hosts: ['stlouisfed.org'] }, { hosts: ['finance.yahoo.com'] }];
  assert.deepEqual(uncataloguedHosts(server, feeds), ['new.example.com']);
  assert.deepEqual(uncataloguedHosts(server, feeds, ['example.com']), []);
});

test('unknown splits into loading (has a refresh cycle) and untracked (has nothing)', () => {
  assert.equal(statusOf([{ id: 'a', state: 'unknown', waiting: true }]).status, 'loading');
  assert.equal(statusOf([{ id: 'a', state: 'unknown', waiting: false }]).status, 'untracked');
  assert.equal(statusOf([]), null);
});

test('a feed with several health legs takes the worst one', () => {
  const s = statusOf([{ id: 'a', state: 'fresh' }, { id: 'b', state: 'dead' }, { id: 'c', state: 'snapshot' }]);
  assert.equal(s.status, 'dead');
  assert.equal(s.id, 'b');
});

test('buildCatalogue merges health, usage and series, and counts only real problems', () => {
  const out = buildCatalogue({
    categories: [{ id: 'macro', label: 'Macro' }],
    feeds: [
      { id: 'rates', name: 'Rates', category: 'macro', endpoints: ['/api/rates'], health: ['rates'], series: ['rates'] },
      { id: 'cvol', name: 'Implied vol', category: 'macro', health: ['cvol:EVZ', 'cvol:GVZ'] },
      { id: 'cal', name: 'Calendar CSV', category: 'macro', kind: 'file' },
      { id: 'news', name: 'News', category: 'macro' },
      { id: 'drill', name: 'Drill', category: 'macro', health: ['drill'] },
    ],
    healthRows: [
      { id: 'rates', state: 'fresh', last: '2026-10-02', why: 'current — 1 sessions behind' },
      { id: 'cvol:EVZ', state: 'dead', last: '2025-03-11', why: 'behind' },
      { id: 'cvol:GVZ', state: 'fresh', last: '2026-10-01' },
      { id: 'drill', state: 'unknown', waiting: true, refreshEveryH: 24, bootMin: 66 },
    ],
    usage: { '/api/rates': ['rates.html', 'today.html', 'js/deskApp.js'] },
    titles: { 'rates.html': 'Rates & Policy' },
    series: [{ id: 'DGS2', label: 'US 2-year', readBy: ['rates'], why: 'policy', evidence: ['x'] }, { id: 'X', readBy: ['other'] }],
  });
  const f = Object.fromEntries(out.feeds.map(x => [x.id, x]));
  assert.equal(f.rates.status, 'current');
  assert.deepEqual(f.rates.pages.map(p => p.file), ['rates.html', 'today.html']);
  assert.equal(f.rates.pages[0].title, 'Rates & Policy');
  assert.match(f.rates.consumers, /js\/deskApp\.js/);
  assert.deepEqual(f.rates.series.map(s => s.id), ['DGS2']);
  assert.equal(f.cvol.status, 'dead');
  assert.equal(f.cal.status, 'file');
  assert.equal(f.news.status, 'untracked');
  assert.equal(f.drill.status, 'loading');
  assert.match(f.drill.why, /66 min ago/);
  assert.equal(out.summary.needsEyes, 1, 'loading, file and untracked are not problems');
  assert.equal(out.summary.worst, 'dead');
});

test('stampOf finds a write time where the stores put one, and refuses to guess', () => {
  assert.equal(stampOf({ updatedAt: '2026-10-02T06:00:00Z', rows: [] }), '2026-10-02T06:00:00Z');
  assert.equal(stampOf({ meta: { generatedAt: '2026-10-01' } }), '2026-10-01');
  assert.equal(stampOf({ t: Date.UTC(2026, 9, 1) }), '2026-10-01T00:00:00.000Z');
  assert.equal(stampOf([{ date: '2026-09-30', v: 1 }, { date: '2026-10-01', v: 2 }]), '2026-10-01');
  assert.equal(stampOf({ history: [{ d: '2026-09-29' }] }), '2026-09-29');
  assert.equal(stampOf({ at: 5 }), null, 'a small number is not a timestamp');
  assert.equal(stampOf({ deep: { deeper: { updatedAt: '2026-10-01' } } }), null, 'never digs for a date');
  assert.equal(stampOf(null), null);
});

test('a prefix health id gathers every leg discovered at run time; kvStamp adds its own leg', () => {
  const out = buildCatalogue({
    feeds: [{ id: 'cvol', name: 'CVOL', category: 'v', kind: 'file', health: ['cvol:CME_*'] },
            { id: 'cpi', name: 'CPI', category: 'v', kvStamp: { key: 'cpi_v1' } }],
    healthRows: [{ id: 'cvol:CME_EURUSD', state: 'snapshot', last: '2026-08-20' }, { id: 'cvol:EVZCLS', state: 'dead', last: '2025-03-11' },
                 { id: 'kv:cpi_v1', state: 'fresh', last: '2026-09-15' }],
  });
  assert.equal(out.feeds[0].status, 'file', 'EVZ is not a CME leg');
  assert.equal(out.feeds[1].status, 'current');
});
