// js/deskAccess.js: what a Desk Terminal VIEWER (the separate desk login) may call. Pure: no fetch, no env. Tested by js/deskAccess.test.mjs.
//
// The owner's decision (2026-11-13): the desk login is "security by obfuscation" for READ data. /api/* is not gated by the site login (the
// healthcheck and the bots call it unauthenticated, by design), so this is not a wall: it makes a request that carries a desk-viewer cookie
// behave like a read-only viewer. Requests with no cookie are unchanged (see the note at the server middleware).
//   - GET/HEAD is allowed everywhere EXCEPT the owner-data deny list below (bots, accounts, trades, journal, paper trades, the book and
//     positions, broker and order routes, telegram, config/ops, anything that carries the owner's P&L), and except ops-style paths
//     (debug, rebuild, run, backfill, send ...) and forced refreshes (?refresh=1, ?force=1), which spend compute or money.
//   - Anything that is not a GET is refused unless it is on VIEWER_POST_ALLOWED: the shared once-a-day reads (Task 2 extends that list in this
//     one place). Model-calling routes that are not shared reads (Ask-the-desk, explain, analysis...) are therefore owner-only by default.
//   - When unsure, deny. Every deny-list entry is listed in the report so the owner can review it.

/** POSTs a viewer may make: the shared once-a-day reads (first caller generates, everyone else reads the stored copy). Extend here only. */
export const VIEWER_POST_ALLOWED = [];

/** Prefixes (of /api/...) a viewer may never call, even with GET. */
export const VIEWER_DENY_PREFIXES = [
  // bots, accounts, trades, journals, paper trades, the book and positions
  '/api/agents', '/api/allocation', '/api/analyst-scorecard', '/api/bot-', '/api/book-', '/api/combine', '/api/decision-audit',
  '/api/fib-atlas-bot', '/api/fleet-portfolio', '/api/hedge-', '/api/ledger', '/api/max-copier', '/api/motif-bot', '/api/mve-book',
  '/api/oi-bot', '/api/oi-bots', '/api/oi-conf-bot', '/api/oi-vol-bot', '/api/position-size', '/api/range-line-bot',
  '/api/signal-', '/api/trade-decision', '/api/trade-lab', '/api/trade-watch', '/api/volatility-bot', '/api/volatility-v2', '/api/volatility-v3',
  '/api/scenario',                       // scenarios run against the owner's book
  '/api/desk-',                          // the desk's own book, run, paper trades, journal, memory, score record, updates (market ones are re-allowed below)
  // broker, order books and capture ops
  '/api/oanda-book', '/api/oanda-fetch', '/api/oanda_stream', '/api/footprint', '/api/live-validation',
  // messaging, config, ops, storage
  '/api/telegram', '/api/ai-', '/api/kv-health', '/api/r2', '/api/nav-layout', '/api/services', '/api/monitor', '/api/egress-audit',
  '/api/shadows', '/api/scratchpad', '/api/systems', '/api/system-', '/api/research-', '/api/analysis',
];

/** Market-data routes under a denied prefix that a viewer may read (checked only after the ops and forced-refresh rules, which always win). */
export const VIEWER_ALLOW_OVERRIDES = [
  '/api/desk-news', '/api/desk-dayfc', '/api/desk-cot-history', '/api/desk-season', '/api/desk-bars', '/api/desk-volcheck',
  '/api/desk-session', '/api/desk-access',      // who am I, and which surfaces may I see (GET only: the POST is a non-GET and is refused for viewers)
];

/** Path segments that mark an ops or compute-triggering route. */
const OPS_SEGMENTS = new Set(['debug', 'debug-fetch', 'debug-index', 'fetch-status', 'fetch-now', 'run', 'run-now', 'rebuild', 'backfill', 'trigger',
  'reload', 'reload-kv', 'send', 'restart', 'train', 'job']);

/** Split '/api/x?y=1' into { path, query }. */
function split(u) {
  const s = String(u ?? ''); const i = s.indexOf('?');
  return { path: (i < 0 ? s : s.slice(0, i)).replace(/\/+$/, '') || '/', query: new URLSearchParams(i < 0 ? '' : s.slice(i + 1)) };
}
const under = (path, prefix) => path.startsWith(prefix);   // plain prefix: over-denying is the safe direction

/**
 * May a desk VIEWER make this call? method: 'GET' | 'POST' ...; url: path with optional query string.
 * Non-/api paths are not this module's business: true.
 */
export function viewerMayCall(method, url) {
  const { path, query } = split(url);
  if (!path.startsWith('/api/') && path !== '/api') return true;
  const m = String(method ?? 'GET').toUpperCase();
  if (m !== 'GET' && m !== 'HEAD') return VIEWER_POST_ALLOWED.some(p => path === p || path.startsWith(p + '/'));
  const seg = path.split('/').filter(Boolean);
  if (seg.slice(1).some(s => OPS_SEGMENTS.has(s) || /backfill|rebuild/.test(s) || /^\$\{/.test(s))) return false;
  if (query.get('refresh') === '1' || query.get('force') === '1' || query.get('rebuild') === '1') return false;
  if (path === '/api/desk-bars' && query.get('role')) return false;          // a role makes it a model call; plain bars are market data
  const denied = VIEWER_DENY_PREFIXES.some(p => under(path, p));
  if (!denied) return true;
  return VIEWER_ALLOW_OVERRIDES.some(p => under(path, p));
}
