import { VIEWER_SHARED_POSTS } from './deskSharedReads.js';

// js/deskAccess.js: what a Desk Terminal VIEWER (the separate desk login) may call. Pure: no fetch, no env. Tested by js/deskAccess.test.mjs.
//
// The owner's decision (2026-11-13): the desk login is "security by obfuscation" for READ data. /api/* is not gated by the site login (the
// healthcheck and the bots call it unauthenticated, by design), so this is not a wall: it makes a request that carries a desk-viewer cookie
// behave like a read-only viewer. Requests with no cookie are unchanged (see the note at the server middleware).
//   - GET/HEAD is allowed everywhere EXCEPT the deny list below, ops-style paths (debug, rebuild, run, backfill, send ...) and forced refreshes
//     (?refresh=1, ?force=1), which spend compute or money.
//   - Anything that is not a GET is refused unless it is on VIEWER_POST_ALLOWED: the shared once-a-day reads. Model-calling routes that are not
//     shared reads (Ask-the-desk, explain, analysis...) are therefore owner-only by default.
//   - THE THREE RULES (owner, 2026-11-13; see js/terminal/tabRegistry.js): hide ONLY (1) what reads as a TRADE INSTRUCTION, (2) what COSTS MONEY,
//     (3) the owner's own tooling, real P&L, accounts, bots, journal, paper trades and the desk's track record. Everything else, including the
//     directional analysis and the book's risk, exposure and scenarios, is shown. So the deny list holds only those four reasons, and a route
//     that backs a switchable surface (a P&L or trade panel) opens when the owner switches that surface on (VIEWER_SURFACE_ROUTES).
//   - The desk's morning book carries analysis and trade-level fields in the same objects, so a viewer's copy of it has the trade-level fields
//     removed (a DENYLIST, js/deskViewerView.js, applied in server.js to the routes in VIEWER_SANITISERS).

/** POSTs a viewer may make: the shared once-a-day reads (first caller generates, everyone else reads the stored copy). The list lives with the
 *  shared-reads rules (js/deskSharedReads.js VIEWER_SHARED_POSTS); extend it there. The owner-only model routes (OWNER_ONLY_POSTS) are never in it. */
export const VIEWER_POST_ALLOWED = [...VIEWER_SHARED_POSTS];

/** Prefixes (of /api/...) a viewer may never call, even with GET (unless a route below opens them), each with its reason. */
export const VIEWER_DENY_PREFIXES = [
  // trade: the pair-selection matrix, the trade watcher, trade decisions and signals, sizing, hedge recommendations
  '/api/pair-select', '/api/trade-watch', '/api/trade-decision', '/api/trade-lab', '/api/signal-', '/api/position-size', '/api/hedge-',
  // pnl / bots / accounts / the book's holdings / journal / paper trades / the desk's record
  '/api/agents', '/api/allocation', '/api/bot-', '/api/book-stress', '/api/combine', '/api/decision-audit',
  '/api/fib-atlas-bot', '/api/fleet-portfolio', '/api/ledger', '/api/max-copier', '/api/motif-bot', '/api/mve-book',
  '/api/oi-bot', '/api/oi-bots', '/api/oi-conf-bot', '/api/oi-vol-bot', '/api/range-line-bot',
  '/api/volatility-bot', '/api/volatility-v2', '/api/volatility-v3',
  '/api/thesis-reality',                 // the desk's accuracy record
  '/api/desk-',                          // the desk's own run, journal, memory, score record, alerts, pack ... (market and analysis ones are re-allowed below)
  // broker, order books and capture ops
  '/api/oanda-book', '/api/oanda-fetch', '/api/oanda_stream', '/api/footprint', '/api/live-validation',
  // cost and internal: messaging, config, ops, storage, paid model routes
  '/api/telegram', '/api/ai-', '/api/kv-health', '/api/r2', '/api/nav-layout', '/api/services', '/api/monitor', '/api/egress-audit',
  '/api/shadows', '/api/scratchpad', '/api/systems', '/api/system-', '/api/research-', '/api/analysis',
];

/** Market-data routes under a denied prefix that a viewer may read (checked only after the ops and forced-refresh rules, which always win). */
export const VIEWER_ALLOW_OVERRIDES = [
  '/api/desk-news', '/api/desk-dayfc', '/api/desk-cot-history', '/api/desk-season', '/api/desk-bars', '/api/desk-volcheck',
  '/api/desk-asset-analyse', '/api/desk-shared-reads',   // the shared once-a-day reads: GET is free and never calls a model (POST: VIEWER_POST_ALLOWED)
  '/api/desk-session', '/api/desk-access',      // who am I, and which surfaces may I see (GET only: the POST is a non-GET and is refused for viewers)
  '/api/oanda-book/history',                    // retail-crowd positioning history: market data, not the owner's account
];

/** Analysis routes under the '/api/desk-' deny prefix that a viewer may read, EXACT paths only (a prefix here would also open /roles, /status and the like).
 *  The server hands a viewer a copy with the trade-level fields removed for the ones that carry them (js/deskViewerView.js): the desk's morning book,
 *  the session updates, the weekly strategist, the daily history, the index of runs and the wire. /api/desk-risk is the model description of the book's
 *  risk and exposure, and /api/desk-watch the setup watch and the chain-link log: analysis, no trade levels. */
export const VIEWER_ALLOW_EXACT = ['/api/desk-run', '/api/desk-run/index', '/api/desk-update', '/api/desk-weekly', '/api/desk-history', '/api/desk-risk', '/api/desk-watch'];

/** Routes that back a SWITCHABLE surface (trade or P&L): denied by default, open when the owner switches any one of the listed surfaces on for the
 *  desk login (the server and the page pass an `on(id)` function). Prefix match on the path; ops paths still lose. */
export const VIEWER_SURFACE_ROUTES = [
  ['/api/desk-score', ['panel.ov.record', 'panel.ana.track', 'panel.ana.fall', 'panel.ana.days']],
  ['/api/thesis-reality', ['panel.charts.ranking', 'panel.changed.thesis']],
  ['/api/desk-paper', ['panel.changed.paper']],
  ['/api/trade-watch', ['strip.zone', 'panel.ov.tradewatch']],
  ['/api/pair-select', ['panel.ov.bestpairs']],
  ['/api/desk-quality', ['widget.dqchip']],
  ['/api/desk-alerts', ['panel.ov.alerts']],
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
 * May a desk VIEWER make this call? method: 'GET' | 'POST' ...; url: path with optional query string; on(id): is this surface switched on for the
 * desk login (default: nothing is). Non-/api paths are not this module's business: true.
 */
export function viewerMayCall(method, url, on = () => false) {
  const { path, query } = split(url);
  if (!path.startsWith('/api/') && path !== '/api') return true;
  const m = String(method ?? 'GET').toUpperCase();
  if (query.get('refresh') === '1' || query.get('force') === '1' || query.get('rebuild') === '1') return false;   // a forced refresh is the owner's, on any method
  if (m !== 'GET' && m !== 'HEAD') return VIEWER_POST_ALLOWED.some(p => path === p || path.startsWith(p + '/'));
  const seg = path.split('/').filter(Boolean);
  if (seg.slice(1).some(s => OPS_SEGMENTS.has(s) || /backfill|rebuild/.test(s) || /^\$\{/.test(s))) return false;
  if (path === '/api/desk-bars' && query.get('role')) return false;          // a role makes it a model call; plain bars are market data
  if (VIEWER_ALLOW_EXACT.includes(path)) return true;
  if (typeof on === 'function' && VIEWER_SURFACE_ROUTES.some(([p, ids]) => under(path, p) && ids.some(id => on(id)))) return true;
  const denied = VIEWER_DENY_PREFIXES.some(p => under(path, p));
  if (!denied) return true;
  return VIEWER_ALLOW_OVERRIDES.some(p => under(path, p));
}

/**
 * Who a password on the DESK login page signs in as. The owner's main (dashboard) password is accepted here too and mints the MAIN-zone session
 * (owner: every surface, the admin panel, the paid routes); the desk password mints the desk viewer session. Anything else, or an empty password, is refused.
 * When the desk zone is disabled (no DESK_PASSWORD) only the owner path exists. Main wins if both passwords are the same string.
 * Returns { zone: 'main'|'desk', role: null|'viewer' } or null.
 */
export function deskLoginDecision({ password, mainPassword, deskPassword, deskEnabled }) {
  if (!password || typeof password !== 'string') return null;
  if (mainPassword && password === mainPassword) return { zone: 'main', role: null };
  if (deskEnabled && deskPassword && password === deskPassword) return { zone: 'desk', role: 'viewer' };
  return null;
}
