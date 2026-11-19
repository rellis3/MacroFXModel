// js/jarvis/jarvisWatch.js: the SERVER-SIDE Jarvis watcher (service id jarvisWatch). The HUD (js/terminal/jarvisView.js) only watches while the owner's tab is open;
// this runs on the server every 2 minutes, builds the same macro chain the browser's loadChain() builds, diffs it against the last snapshot and sends Telegram
// (sender 'jarvis') when a link breaks or heals, a market is newly >= 2x its noise, or server memory crosses JARVIS_MEM_LIMIT_MB.
// DESCRIPTION ONLY: it never forecasts and never trades. Rules (js/jarvis/jarvisLogic.js, tested): same event once per 6 h, 12 alerts per London day, nothing on the first run after
// boot (baseline only), nothing while the live window is frozen (weekend / markets shut), nothing if the previous snapshot is stale. State (last snapshot + alert log) lives in KV jarvis_watch_v1.
// The assembled chain inputs are exported (getChain) so the morning digest reuses the same caches.
import { chainLinks, CHAIN_OHLC, CHAIN_FRED_KEYS, ohlcAscending, summariseChain, CHAIN_NODES } from '../terminal/chainBoard.js';
import { buildGraph, watchSnapshot, watchDiff, memoryState, radarRank } from '../terminal/jarvisCore.js';
import { setLiveFrozen } from '../macroChain.js';
import { normaliseState, planAlerts, memoryEvent, liveUsable } from './jarvisLogic.js';

export const KV_KEY = 'jarvis_watch_v1';
const DAILY_MS = 30 * 60_000, LIVE_MS = 2 * 60_000, STALE_SNAPSHOT_MS = 20 * 60_000, PERSIST_MS = 15 * 60_000;
export const NAMES = Object.fromEntries(Object.entries(CHAIN_NODES).map(([k, n]) => [k, n.label]));

const M = { state: null, loading: null, daily: null, dailyAt: 0, live: null, liveAt: 0, running: false, first: true, wasFrozen: false, lastError: null, savedAt: 0, lastLiveOk: false };

/** The persisted state, loaded from KV once and then held in memory (shared with the morning digest). Never throws. */
export async function getState(deps) {
  if (M.state) return M.state;
  if (!M.loading) M.loading = (async () => { let raw = null; try { raw = await deps.kv.get(KV_KEY); } catch (e) { console.warn('[jarvisWatch] kv read failed:', e.message); } M.state = normaliseState(raw); M.loading = null; return M.state; })();
  return M.loading;
}
/** Write the state to KV (a failure is logged, never thrown). */
export async function saveState(deps) {
  if (!M.state) return;
  try { await deps.kv.put(KV_KEY, JSON.stringify(M.state)); M.savedAt = Date.now(); } catch (e) { console.warn('[jarvisWatch] kv write failed:', e.message); }
}

const settled = r => (r.status === 'fulfilled' ? r.value : null);

/** The chain's inputs, assembled as the browser's loadChain() does, through cached routes: daily inputs every 30 min, the live block every 2 min. Returns null when the daily inputs have never loaded. */
export async function getChain(deps, now = Date.now()) {
  if (!M.daily || now - M.dailyAt > DAILY_MS) {
    const syms = Object.entries(CHAIN_OHLC);
    const r = await Promise.allSettled([deps.selfJson(`/api/fredhistory?keys=${CHAIN_FRED_KEYS}`), deps.selfJson('/api/intl-yields'), deps.selfJson('/api/chain-extra'), deps.selfJson('/api/crack'), ...syms.map(([, s]) => deps.selfJson(`/api/ohlc?symbol=${s}`))]);
    const [fred, iy, cx, cr, ...oh] = r.map(settled);
    if (fred && fred.ok !== false && !fred.error) {
      M.daily = { fred, intl: iy?.series ?? {}, extra: cx?.series ?? {}, crack: Array.isArray(cr?.series) ? cr.series : null, ohlc: Object.fromEntries(syms.map(([k], i) => [k, ohlcAscending(oh[i])])) };
      M.dailyAt = now;
    } else if (!M.daily) return null;
    else M.dailyAt = now - DAILY_MS + 5 * 60_000;   // keep the old inputs, retry in 5 min
  }
  if (!M.live || now - M.liveAt > LIVE_MS) {
    try { const l = await deps.selfJson('/api/chain-live?anchor=session'); M.live = l?.ok ? l : null; } catch { M.live = null; }
    M.liveAt = now;
  }
  return { daily: M.daily, live: M.live };
}

/** Links, graph, summary and radar for one window ('live' or 1) from getChain's output. */
export function evaluate(chain, win) {
  const inputs = { ...chain.daily, live: win === 'live' ? chain.live : undefined };
  const links = chainLinks(inputs, win), graph = buildGraph(links);
  return { links, graph, sum: summariseChain(links, win), radar: radarRank(graph, NAMES) };
}

const memLimit = () => Math.max(0, Number(process.env.JARVIS_MEM_LIMIT_MB) || 0);

/** One watcher pass. Exported for tests and for the lead to call by hand. Returns a small status object. */
export async function tick(deps, now = Date.now()) {
  if (M.running) return { skipped: 'running' };
  M.running = true;
  try {
    const state = await getState(deps);
    const first = M.first; M.first = false;
    const events = [];
    const chain = await getChain(deps, now);
    if (!chain) M.lastError = 'chain inputs not available';
    else if (!liveUsable(chain.live)) {
      M.lastLiveOk = false; M.lastError = chain.live ? null : 'live feed not available';
      if (chain.live?.frozen) M.wasFrozen = true;
    } else {
      M.lastError = null; M.lastLiveOk = true;
      setLiveFrozen(false);
      const snap = watchSnapshot(evaluate(chain, 'live').graph, NAMES);
      const fresh = state.snapshot && now - state.snapshotAt < STALE_SNAPSHOT_MS;
      if (!first && !M.wasFrozen && fresh) events.push(...watchDiff(state.snapshot, snap));
      M.wasFrozen = false;
      state.snapshot = snap; state.snapshotAt = now;
    }
    // memory: judged on the first run too only as a baseline (no alert), like everything else
    const rss = process.memoryUsage().rss / 1048576;
    const mev = memoryEvent(rss, memLimit(), memoryState(rss, memLimit()));
    if (mev) events.push(mev);

    state.lastCheck = now;
    let sent = [];
    if (!first && events.length) {
      const plan = planAlerts(state, events, now);
      Object.assign(state, plan.state);
      for (const rec of plan.send) {
        let ok = false;
        try { ok = !!(await deps.tgSend(rec.text)); } catch (e) { console.warn('[jarvisWatch] telegram failed:', e.message); }
        rec.sent = ok;
      }
      sent = plan.send;
    }
    if (sent.length || now - M.savedAt > PERSIST_MS) await saveState(deps);
    return { events: events.length, sent: sent.length, first, live: M.lastLiveOk };
  } catch (e) {
    M.lastError = e?.message || String(e); console.warn('[jarvisWatch] tick failed:', M.lastError);
    return { error: M.lastError };
  } finally { M.running = false; }
}

export async function mount(app, deps) {
  app.get('/api/jarvis/watch', deps.ownerOnly, async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const s = await getState(deps), now = Date.now();
      res.json({ ok: true, lastCheck: s.lastCheck ? new Date(s.lastCheck).toISOString() : null, lastAlerts: s.log.slice(-20).reverse().map(a => ({ at: new Date(a.at).toISOString(), level: a.level, kind: a.kind, text: a.text, sent: a.sent !== false })),
        enabled: !!deps.svcEnabled?.('jarvisWatch'), snapshotAgeSec: s.snapshotAt ? Math.round((now - s.snapshotAt) / 1000) : null, liveOk: M.lastLiveOk, error: M.lastError, memLimitMB: memLimit() });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  deps.svcInterval('jarvisWatch', () => tick(deps).catch(e => console.warn('[jarvisWatch]', e.message)), 120_000);
}
