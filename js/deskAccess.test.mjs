// What a Desk Terminal VIEWER (the separate desk login) may call.   node --test js/deskAccess.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { viewerMayCall, VIEWER_POST_ALLOWED, VIEWER_DENY_PREFIXES, VIEWER_ALLOW_OVERRIDES, VIEWER_ALLOW_EXACT } from './deskAccess.js';
import { OWNER_ONLY_POSTS } from './deskSharedReads.js';

test('market read routes are open to a viewer', () => {
  for (const u of ['/api/rates', '/api/cot-state', '/api/chain-live', '/api/chain-read', '/api/fed-path', '/api/rates-board', '/api/cb-board',
    '/api/macro-engines-board', '/api/risk-flags', '/api/em-gauges', '/api/world-stress', '/api/events', '/api/ohlc?symbol=EUR_USD',
    '/api/desk-news?hours=24&tier=2', '/api/desk-dayfc', '/api/desk-cot-history', '/api/desk-season', '/api/desk-bars?symbol=EUR_USD',
    '/api/desk-shared-reads', '/api/desk-asset-analyse?inst=GOLD', '/api/global-yields', '/api/intl-yields', '/api/options-skew', '/api/corr-terminal', '/api/version', '/api/regime', '/api/econ-surprise', '/api/macro-scorecard', '/api/terminal/stress-snap']) {
    assert.equal(viewerMayCall('GET', u), true, u);
  }
});

test('owner-data routes are refused to a viewer, with GET', () => {
  for (const u of ['/api/trade-watch', '/api/desk-run/roles', '/api/desk-run/status', '/api/desk-score/record', '/api/desk-paper/history', '/api/desk-journal',
    '/api/desk-risk', '/api/desk-quality', '/api/desk-memory', '/api/desk-watch', '/api/desk-alerts', '/api/desk-pack', '/api/pair-select', '/api/thesis-reality', '/api/book-risk',
    '/api/book-stress', '/api/analyst-scorecard', '/api/oanda-book/history', '/api/oanda-fetch/status/1', '/api/telegram/test', '/api/oi-bot/state',
    '/api/oi-conf-bot/status', '/api/fib-atlas-bot/trades', '/api/bot-audit', '/api/signal-journal', '/api/position-size', '/api/scenarios',
    '/api/scenario?id=1', '/api/ai-config', '/api/ai-spend', '/api/kv-health', '/api/r2/list', '/api/nav-layout', '/api/services', '/api/monitor',
    '/api/research-hub', '/api/research-shared', '/api/system-live', '/api/systems/job', '/api/fleet-portfolio', '/api/ledger', '/api/max-copier']) {
    assert.equal(viewerMayCall('GET', u), false, u);
  }
});

test('the lens: the desk\'s analysis is readable (as the allowlisted copy), the book and the signals are not', () => {
  for (const u of ['/api/desk-run', '/api/desk-run?date=2026-11-12', '/api/desk-run/index', '/api/desk-update', '/api/desk-weekly', '/api/desk-history?days=60']) assert.equal(viewerMayCall('GET', u), true, u);
  for (const u of ['/api/desk-run?force=1', '/api/desk-run/roles', '/api/desk-run/status', '/api/desk-update/run', '/api/desk-weekly/run']) assert.equal(viewerMayCall('GET', u), false, u);
  for (const u of ['/api/desk-run', '/api/desk-update', '/api/desk-weekly', '/api/desk-history']) assert.equal(viewerMayCall('POST', u), false, `POST ${u}`);
  assert.deepEqual(VIEWER_ALLOW_EXACT.filter(p => !VIEWER_DENY_PREFIXES.some(d => p.startsWith(d))), [], 'every exact allow sits under a deny prefix');
});

test('ops-style paths and forced refreshes are refused even on a market route', () => {
  for (const u of ['/api/rates?refresh=1', '/api/chain-read?force=1', '/api/corr-history/rebuild', '/api/cot-backfill/series', '/api/fomc/fetch-status',
    '/api/ecb/debug-index', '/api/rbnz/debug-fetch', '/api/${key}/debug-fetch', '/api/levels/reload-kv', '/api/vol-forecast/run', '/api/fiscal/fetch-now',
    '/api/desk-bars?symbol=EUR_USD&role=analyst']) {
    assert.equal(viewerMayCall('GET', u), false, u);
  }
});

test('a viewer cannot POST anything unless it is on the shared-read list', () => {
  for (const u of ['/api/desk-ask', '/api/explain', '/api/analysis', '/api/currency-analysis', '/api/oi-explain', '/api/eod-review', '/api/analysis-historical',
    '/api/morning-brief', '/api/research-pod/thread', '/api/desk-run', '/api/desk-weekly', '/api/desk-update/run', '/api/research-room/talk', '/api/access', '/api/desk-access']) {
    for (const m of ['POST', 'PUT', 'DELETE', 'PATCH']) assert.equal(viewerMayCall(m, u), false, `${m} ${u}`);
  }
});

test('the shared once-a-day reads are the only viewer POSTs (js/deskSharedReads.js VIEWER_SHARED_POSTS)', () => {
  assert.equal(viewerMayCall('POST', '/api/chain-read?window=1'), true);
  assert.equal(viewerMayCall('POST', '/api/desk-asset-analyse'), true);
  assert.equal(viewerMayCall('POST', '/api/chain-read?window=1&force=1'), false, "a forced refresh is the owner's");
  for (const u of OWNER_ONLY_POSTS) assert.equal(viewerMayCall('POST', u), false, `${u} must stay owner-only`);
});

test('the shared-read allowlist is the one place that opens a POST, and it opens only what it lists', () => {
  assert.ok(Array.isArray(VIEWER_POST_ALLOWED));
  VIEWER_POST_ALLOWED.push('/api/__shared_read_test');
  try {
    assert.equal(viewerMayCall('POST', '/api/__shared_read_test'), true);
    assert.equal(viewerMayCall('POST', '/api/__shared_read_test/x'), true);
    assert.equal(viewerMayCall('POST', '/api/__shared_read_testy'), false);
    assert.equal(viewerMayCall('POST', '/api/explain'), false);
  } finally { VIEWER_POST_ALLOWED.pop(); }
});

test('non-API paths are not this module\'s business', () => {
  assert.equal(viewerMayCall('GET', '/desk-terminal.html'), true);
  assert.equal(viewerMayCall('POST', '/login'), true);
});

test('lists are well formed', () => {
  for (const p of [...VIEWER_DENY_PREFIXES, ...VIEWER_ALLOW_OVERRIDES]) assert.match(p, /^\/api\/[a-z0-9_-]+$/, p);
  // an override must sit under a deny prefix, otherwise it is dead weight
  for (const o of VIEWER_ALLOW_OVERRIDES) assert.ok(VIEWER_DENY_PREFIXES.some(p => o.startsWith(p)), `override ${o} is not under a deny prefix`);
});
