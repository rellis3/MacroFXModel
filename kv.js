// kv.js — KV store with Cloudflare REST API backend (primary) or file backend (fallback)
//
// Primary backend — set all three env vars to persist data across deploys:
//   CF_ACCOUNT_ID       Cloudflare account ID
//   CF_API_TOKEN        API token with KV:Edit permission on the namespace
//   CF_KV_NAMESPACE_ID  KV namespace ID (defaults to the existing Pages namespace)
//
// KEY ROUTING — only truly persistent keys go to CF KV REST API.
// Ephemeral market-data caches (ohlc, quote, compass, fredhistory) are stored
// in the local file store only; they are rebuilt automatically on next page load
// and do not need to survive redeploys. This keeps CF KV writes well within the
// free-plan limit of 1,000/day.
//
// Persistent (→ CF KV):   ai_*, tg_config, journal_*, oi_store, cot_data,
//                          surprise_index, events_today, sentiment
// Ephemeral (→ file only): ohlc_*, ohlc5m_*, ohlc30m_*, quote_*, compass_*,
//                          fredhistory_*, and anything else not listed above

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = process.env.DATA_DIR || path.join(__dirname, 'data');
const KV_FILE   = path.join(DATA_DIR, 'kv.json');

// Only keys that are irreplaceable if the server restarts go to CF KV.
// Everything else — market-data caches, computed entries, cooldowns — is stored
// locally and rebuilt automatically. This keeps CF KV writes under ~20/day,
// well within the free-plan limit of 1,000/day.
//
//  CF KV (→ survives redeploys):
//    journal_store, journal_replay_store  — user's trade journal
//    tg_config                            — Telegram bot credentials
//    ai_alert_cfg                         — alert thresholds/pairs
//    oi_store                             — user-pasted CME OI data (cannot auto-rebuild)
//    oi_history                           — 60-day OI summary archive (only re-accumulable by waiting)
//    range_line_oi                        — dated OI levels for the forward test (cannot be back-filled)
//    hedge_signal_tg                      — hedge-signal Telegram credentials (user-entered)
//    cot_data, cot_urls, cot_url          — CFTC COT data + user-set report URLs
//    caps                                 — user-configured proximity caps
//
//  Local file only (→ rebuilds on restart, no CF quota used):
//    ai_entries_*  recomputed by levels.js within 30 min of startup
//    ai_cron_cooldowns  acceptable to lose on redeploy (first alert re-fires once)
//    ohlc_*, ohlc5m_*, ohlc30m_*, quote_*, compass_*, fredhistory_*  ephemeral caches
//    surprise_index, events_*  re-fetched from Finnhub on next page load
const _CF_EXACT = new Set([
  'tg_config', 'ai_alert_cfg',
  'fwd_fade_log',            // forward-track confirmed-fade signal log — accumulates a live post-research record, cannot be rebuilt
  'fwd_fade_meta',           // forward-track tracking-start date + last-scan bookkeeping
  'cone_fwd_log',            // cone forward-track: live cone claims + resolved outcomes — accumulates a post-research record, cannot be rebuilt
  'cone_fwd_meta',           // cone forward-track tracking-start + last-scan bookkeeping
  'surprise_alert_config',   // cone surprise-alert: enable + Telegram creds + thresholds/pairs — user-entered, must survive redeploys
  'journal_store', 'journal_replay_store',
  'oi_store',               // user-pasted CME OI data — cannot be auto-rebuilt
  'oi_expect_log',          // forward record: what each OI level's expectation CLAIMED, per session.
                            // Accumulates a post-hoc-proof-resistant log and CANNOT be rebuilt - the
                            // levels and the spot they were judged against are gone once the day is.
  'oi_store_py',            // SHADOW of oi_store, written by the automated QuikStrike
                            // sweep (oi_recon/). Deliberately NOT in _worker.js's
                            // PERMANENT_KEYS: while it is only being compared against the
                            // real thing, a 48h TTL is wanted — the key should expire on
                            // its own rather than linger once the trial ends.
  'oi_sweep_last',          // heartbeat from the nightly scraper. Its VALUE matters less than
                            // its AGE - a task that silently stopped firing sends no failure,
                            // so the only evidence is a last-seen stamp that stops advancing.
  'oi_auto_target',         // WHERE the nightly sweep writes: the shadow, or the real
                            // oi_store the bots read. Set from the OI modal so the feed can
                            // be switched back to manual from a phone, without access to the
                            // machine running the scraper — the whole point is that the
                            // rollback does not depend on being at the PC.
  'range_line_oi',          // DATED per-session OI levels per instrument (~120 days) - the OTHER half of the OI
                            // forward test. The trade log was already durable but this was not, so the audit
                            // joined 35 logged trades against ONE surviving OI date: 32 of 35 unjoinable,
                            // tagged n=1. The test could never accumulate evidence. Built forward only -
                            // CME serves no history, so a lost day is lost permanently.
  'hedge_signal_tg',        // hedge-signal Telegram token + chat id - USER-ENTERED credentials. Same class as
                            // the vol-level-alert creds this project already lost once to the ephemeral store.
  'oi_history',             // ~60-day day-over-day archive of the OI summary per pair. DERIVED from
                            // oi_store, but oi_store only ever holds the LATEST paste, so history is
                            // gone forever if lost — it can only be re-accumulated by waiting 60 more
                            // days. Was in the file store until 2026-07-28, which reset it to a single
                            // day on every redeploy; that silently nulled every day-over-day read
                            // built on it (brief oiChange / oiStability / flip-drift, /api/oi-history).
                            // `_snapshotOIHistory` now writes only when the summary actually CHANGED
                            // (~1-2/day on paste, not 48/day on its 30-min timer) to stay quota-cheap.
  'cot_data',               // parsed CFTC COT — requires user-set URL to rebuild
  'cot_series_v1',          // 200-week COT series per market — a CACHE, but written at most weekly and
                            // rebuilding costs a full CFTC refetch, so it is worth surviving a redeploy
                            // (weekly writes are negligible against the CF KV quota)
  'cot_urls',               // user-configured CFTC report URLs (multi-asset)
  'cot_url',                // legacy single CFTC URL key
  'caps',                   // user-configured proximity caps
  'daily_watchlist',        // top-6 levels per pair, computed at 06:05 London — persists within trading day
  'hmm5m_trained_params',   // Baum-Welch learned HMM V2 params — must survive redeploys
  'hmm5m_macro_context',    // FRED macro context snapshot
  'regime_bot_config',       // regime bot settings — must survive redeploys
  'regime_bot_credentials',  // regime bot MT5 credentials — must survive redeploys
  'regime_bot_v2_config',    // regime v2 bot settings — must survive redeploys
  'regime_bot_v2_credentials', // regime v2 bot MT5 credentials — must survive redeploys
  'regime_bot_v7_config',    // regime v7 bot settings — must survive redeploys
  'regime_bot_v7_credentials', // regime v7 bot MT5 credentials — must survive redeploys
  'regime_bot_v7_audit_log', // regime v7 entry/exit audit log w/ config snapshots — cannot be auto-rebuilt
  'bot_config',             // main bot settings — must survive redeploys
  'bot_credentials',        // main bot MT5 credentials — must survive redeploys
  'backtestsystem_live_config',  // backtest bot settings — must survive redeploys
  'backtestsystem_credentials',  // backtest bot MT5 credentials — must survive redeploys
  'gold_bot_config',        // Gold bot settings — must survive redeploys
  'gold_ml_params',         // trained ML model coefficients — must survive redeploys
  'gold_optimiser_last',    // last optimiser run result — persists across restarts
  'gold_perf_snapshot',     // 30-day P&L snapshot for performance dashboard
  'gold_v2_config',         // Gold V2 bot settings — must survive redeploys
  'gold_v2_credentials',    // Gold V2 MT5 credentials — must survive redeploys
  'gold_v2_trades',         // Gold V2 closed-trade history (rolling) — cannot be auto-rebuilt
  // NOTE: gold_v2_status / gold_v2_zones are deliberately NOT here — the bot
  // rewrites them every ~2 min, so they stay local/ephemeral to protect the
  // CF KV write quota (same reasoning as volatility_bot_status).
  'confluence_bot_config',      // Confluence bot settings — must survive redeploys
  'confluence_bot_credentials', // Confluence bot MT5 credentials — must survive redeploys
  'confluence_bot_trades',      // Confluence bot closed-trade history (rolling) — cannot be auto-rebuilt
  // NOTE: confluence_bot_status / confluence_bot_zones are deliberately NOT here —
  // rewritten every ~1-2 min, same reasoning as gold_v2_status/gold_v2_zones above.
  // _worker.js's PERMANENT_KEYS already listed config/credentials/trades as
  // permanent (no TTL), but that gate only controls the TTL passed to CF KV — on
  // Railway, put() below routes through isCfKey() FIRST, and these three keys were
  // missing from it, so every save silently landed in the local file store (wiped
  // every Railway redeploy) instead of ever reaching CF KV. Surfaced as "Confluence
  // bot config forgotten on every deployment" (found + fixed 2026-07-21).
  'fred_data_v3',           // FRED dashboard cache (31 series) — survives Railway restarts
  'policy_v2',              // Telegram-v2 frozen confidence policy — learned from a full M1 run (minutes); MUST survive redeploys or every restart wipes it
  'ledger_v2',              // Telegram-v2 daily-learning ledger — accumulated live signal outcomes; cannot be rebuilt, must survive redeploys
  'tg_v2_alert_cfg',        // Telegram-v2 alert config (own config, separate from v1 ai_alert_cfg) — user-set, must survive redeploys
  'tg_v2_config',           // Telegram-v2 OWN bot token + chat ID (separate from v1 tg_config) — user-set, must survive redeploys
  'tg_vollevel_config',     // Vol-forecast level-alert OWN bot token + chat ID (separate dedicated bot) — user-set, must survive redeploys
  'vol_level_alert_cfg',    // Vol-forecast level-alert settings (threshold/levels/pairs/cooldown) — user-set, must survive redeploys
  'policy_v2_status',       // Telegram-v2 learn-job progress/state — so the page shows it across page refreshes + server restarts (decoupled from the in-memory jobId)
  'dyn_anchor_config',      // DynAnchor bot settings — must survive redeploys
  'dyn_anchor_credentials', // DynAnchor bot MT5 credentials — must survive redeploys
  'macro_equity_config',       // Macro Equity bot settings — must survive redeploys
  'macro_equity_credentials',  // Macro Equity bot MT5 credentials — must survive redeploys
  'volatility_bot_config',      // Volatility bot settings — must survive redeploys (was wiped every deploy)
  'volatility_bot_credentials', // Volatility bot MT5 credentials — must survive redeploys
  'volatility_bot_plan',        // Volatility bot daily plan (survivors/policy/σ) — keep last good plan across a redeploy
  'volatility_bot_audit_log',   // Volatility bot entry/exit audit log — cannot be auto-rebuilt
  // NOTE: volatility_bot_status is deliberately NOT here — the bot rewrites it every
  // ~30s, so it stays local/ephemeral to avoid blowing the CF KV write quota.
  'yield_spread_config',           // Yield-Spread bot settings — must survive redeploys
  'yield_spread_credentials',      // Yield-Spread bot MT5 credentials — must survive redeploys
  'yield_spread_plan',             // Yield-Spread daily z-signal plan — keep last good plan across a redeploy
  'yield_spread_audit',            // Yield-Spread entry/exit audit log — cannot be auto-rebuilt
  // NOTE: yield_spread_status omitted like volatility_bot_status — rewritten every cycle, ephemeral.
  'range_line_bot_config',      // Range-Line bot settings — must survive redeploys
  'range_line_bot_credentials', // Range-Line bot MT5 credentials — must survive redeploys
  'range_line_bot_plan',        // Range-Line bot daily plan (per-instrument policy) — keep last good plan across a redeploy
  'range_line_confluence',      // Range-Line bot daily confluence levels (for the entry gate) — must live in CF KV so the worker's /api/kv/get can serve it to the bot (same store the plan uses)
  'range_line_bot_audit_log',   // Range-Line bot entry/exit audit log — cannot be auto-rebuilt
  'range_line_trade_log',       // Range-Line resolved closed-trade log (deduped, capped 5000) — the give-back/MFE history; appended every 10 min, NOT rewritten every cycle, so persist it or the record resets on every redeploy
  // NOTE: range_line_bot_status is deliberately NOT here — the bot rewrites it every
  // ~30s (same reason as volatility_bot_status).
  'oi_bot_config',              // OI bot settings (universe, regime toggles, FX opt-in) — must survive redeploys
  'oi_bot_credentials',         // OI bot MT5 credentials — must survive redeploys
  'oi_bot_zones',               // OI bot daily zone plan (per-instrument regime-switch trades) — keep last good plan across a redeploy; the worker's /api/kv/get serves it to the executor
  'oi_bot_trade_log',           // OI resolved closed-trade log (deduped, capped) — give-back/MFE history; same durability need as range_line_trade_log
  'confluence_trade_log',       // Confluence resolved closed-trade log (deduped, capped) — give-back/MFE history for the webpage; same durability need
  // NOTE: oi_bot_status is deliberately NOT here — the bot rewrites it every ~30s
  // (same reason as range_line_bot_status / volatility_bot_status).
  'morning_brief_v1',       // Daily Brief top-down macro read (AI, ~1 gen/day) — must survive redeploys or the front page goes blank until regenerated
  'hedge_audit_log',        // forward-test log for advisory hedge suggestions — must survive redeploys
  'hedge_alerts_cache',     // summary of corr_history.json pushed by /api/hedge-alerts — survives redeploys
  'vol_hit_rates',          // historical price-level hit rates — expensive to recompute (~10 min full, ~1 min incremental)
  'event_vol_impact',       // Finnhub event expansion ratios — must survive redeploys
  'session_stats',          // intraday hourly vol profile — 5y H1 pull, ~5 min to recompute
  'nq_qmr_status',          // NQ-QMR live gate state — must survive redeploys (gate1 lost on restart kills gate2 Telegram)
  'nq_qmr_audit',           // NQ-QMR 90-day gate audit log — must survive redeploys
  'nq_qmr_config',          // NQ-QMR user config — must survive redeploys
  'spx_qmr_status', 'spx_qmr_audit', 'spx_qmr_config',  // SPX-QMR — same persistence needs as NQ-QMR
  'dow_qmr_status', 'dow_qmr_audit', 'dow_qmr_config',  // DOW-QMR — same persistence needs as NQ-QMR
  'dax_qmr_status', 'dax_qmr_audit', 'dax_qmr_config',  // DAX-QMR — same persistence needs as NQ-QMR
  // Committed walk-forward OOS result per instrument — read by _qmrValidationLine
  // to stamp every gate/entry alert. Written by hand from a recorded run, never
  // recomputed live; losing it silently reverts every alert to "⚠ UNVALIDATED".
  'nq_qmr_validation', 'spx_qmr_validation', 'dow_qmr_validation', 'dax_qmr_validation',
  // COG's own messages, logged by hand as they arrive — irreplaceable primary
  // source (see COG_OBSERVED_SYSTEM.md). Losing this loses data that cannot be
  // recomputed from anything, ever.
  'cog_signal_log',
  // COG shadow emitter's daily gate output — the forward record. Cannot be
  // recomputed after the fact: it is a stamped prediction, not a derivation.
  'cog_shadow_log',
  'nav_layout',             // index.html command-hub custom category/order — user drag-drop, must survive redeploys and sync across devices
  'scratchpad_notes',       // index.html scratchpad modal — free-text personal notes, must survive redeploys and sync across devices
]);
function isCfKey(key) {
  // kv_probe_* are throwaway keys the /api/kv-health round-trip writes to TEST the
  // durable CF path (write→read→delete). Route them to CF so the probe actually
  // exercises the same backend real config uses; they are deleted immediately.
  if (key.startsWith('kv_probe_')) return true;
  // ai_entries_* and ai_cron_* are ephemeral — rebuilt automatically on restart
  if (key.startsWith('ai_entries_') || key.startsWith('ai_cron_')) return false;
  // v2_touch_* are per-pair extracted touches cached for the Telegram-v2 learn —
  // expensive to recompute (full M1 reload), so persist them to resume a learn
  // that died mid-run instead of reloading all 26 pairs from scratch.
  if (key.startsWith('v2_touch_')) return true;
  // fredhistory_* caches (90-day yield series for spread charts) are expensive to rebuild
  // (concurrent FRED requests cause rate-limits) so persist them in CF KV
  if (key.startsWith('fredhistory_')) return true;
  // trade_hist_* are the per-bot-per-day closed trade logs — must survive Railway redeploys
  if (key.startsWith('trade_hist_')) return true;
  // tde_shadow_* is the TDE shadow book (what the model said per open trade, keyed
  // by position_id) — joined to trade outcomes in the audit, must survive redeploys
  if (key.startsWith('tde_shadow_')) return true;
  // vol_session_* are daily session audit snapshots — must survive Railway redeploys
  if (key.startsWith('vol_session_')) return true;
  // vol_forecast_* are daily vol forecasts + index — must survive Railway redeploys
  if (key.startsWith('vol_forecast_')) return true;
  // vol_reference_* are user-pasted reference exports — cannot be auto-rebuilt
  if (key.startsWith('vol_reference_')) return true;
  // vmlog_* are the VuManChu forward-validation log (one key per UTC day) — the
  // record of what the engine predicted vs what price actually did. It is the
  // ONLY out-of-sample evidence the VuManChu work will ever have and it cannot
  // be rebuilt after the fact, so it must survive redeploys.
  if (key.startsWith('vmlog_')) return true;
  // fomc_* is the FOMC sentiment engine: raw statement/transcript/minutes text
  // + the AI analysis built from it, one set per meeting. A source page can be
  // revised or reworded after the fact (preliminary → final transcript), so a
  // lost capture cannot be re-fetched into an identical state later — same
  // "point-in-time record, not a cache" reasoning as vmlog_/vol_forecast_.
  // Infrequent writes (a handful per ~6-week meeting cycle), well within quota.
  if (key.startsWith('fomc_')) return true;
  // ecb_* — same reasoning as fomc_ above, the ECB engine's own point-in-time
  // captures.
  if (key.startsWith('ecb_')) return true;
  // boe_* — same reasoning as fomc_/ecb_ above.
  if (key.startsWith('boe_')) return true;
  // boj_* — same reasoning as fomc_/ecb_/boe_ above.
  if (key.startsWith('boj_')) return true;
  return _CF_EXACT.has(key) || key.startsWith('journal_') || key.startsWith('ai_');
}

// ── Cloudflare KV REST API backend ───────────────────────────────────────────

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN  = process.env.CF_API_TOKEN;
const CF_KV_NS_ID   = process.env.CF_KV_NAMESPACE_ID || '37e632371b754333bcbb33093f33b3bb';
const USE_CF        = !!(CF_ACCOUNT_ID && CF_API_TOKEN);

const CF_BASE    = USE_CF
  ? `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NS_ID}`
  : null;
const CF_HEADERS = USE_CF ? { Authorization: `Bearer ${CF_API_TOKEN}` } : {};

// In-memory read cache — absorbs repeated reads of the same key within 30 s.
// A browser page load can trigger 30–50 CF KV reads (ohlc, quotes, entries for
// all pairs) in quick succession; caching here cuts CF API calls dramatically.
// Writes invalidate the cached entry immediately.
const _readCache = new Map(); // key → { value, expiresAt }
const READ_CACHE_TTL = 30_000;

function cacheGet(key) {
  const entry = _readCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { _readCache.delete(key); return undefined; }
  return entry.value;
}
function cacheSet(key, value) {
  _readCache.set(key, { value, expiresAt: Date.now() + READ_CACHE_TTL });
}
function cacheInvalidate(key) { _readCache.delete(key); }

// Core CF fetch with 429 retry + exponential backoff (1 s → 2 s → 4 s → 8 s)
async function cfFetch(method, key, body, opts) {
  const qs  = opts?.expirationTtl ? `?expiration_ttl=${opts.expirationTtl}` : '';
  const url = `${CF_BASE}/values/${encodeURIComponent(key)}${qs}`;
  const init = {
    method,
    headers: method === 'PUT'
      ? { ...CF_HEADERS, 'Content-Type': 'text/plain' }
      : CF_HEADERS,
  };
  if (method === 'PUT') init.body = body;

  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, init);
    if (r.status === 429) {
      const delay = Math.min(1_000 * 2 ** attempt, 8_000);
      console.warn(`[KV] CF rate limited (${method} ${key}), retry in ${delay} ms`);
      await new Promise(res => setTimeout(res, delay));
      continue;
    }
    return r;
  }
  throw new Error(`CF KV ${method} ${key}: rate limited after 4 attempts`);
}

async function cfGet(key) {
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  const r = await cfFetch('GET', key);
  if (r.status === 404) { cacheSet(key, null); return null; }
  if (!r.ok) throw new Error(`CF KV GET ${key}: ${r.status}`);
  const value = await r.text();
  cacheSet(key, value);
  return value;
}

async function cfPut(key, value, opts = {}) {
  cacheInvalidate(key);
  const r = await cfFetch('PUT', key, value, opts);
  if (!r.ok) throw new Error(`CF KV PUT ${key}: ${r.status}`);
}

async function cfDel(key) {
  cacheInvalidate(key);
  const r = await cfFetch('DELETE', key);
  if (!r.ok && r.status !== 404) throw new Error(`CF KV DEL ${key}: ${r.status}`);
}

// ── File backend ──────────────────────────────────────────────────────────────

let store = {};
let dirty = false;

async function fileLoad() {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    const raw = await readFile(KV_FILE, 'utf8');
    store = JSON.parse(raw);
    const now = Date.now();
    for (const key of Object.keys(store)) {
      if (key.startsWith('__ttl_')) continue;
      const ttlKey = `__ttl_${key}`;
      if (store[ttlKey] && now > store[ttlKey]) {
        delete store[key];
        delete store[ttlKey];
      }
    }
  } catch {
    store = {};
  }
}

async function fileFlush() {
  if (!dirty) return;
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(KV_FILE, JSON.stringify(store));
    dirty = false;
  } catch (e) {
    console.error('[KV] Flush error:', e.message);
  }
}

setInterval(fileFlush, 5_000).unref();
process.on('beforeExit', fileFlush);

// ── Public API ────────────────────────────────────────────────────────────────

export async function load() {
  if (USE_CF) {
    console.log(`[KV] CF REST API backend — account ${CF_ACCOUNT_ID} ns ${CF_KV_NS_ID}`);
    console.log(`[KV] Read cache TTL ${READ_CACHE_TTL / 1000} s — 429 retry with backoff enabled`);
  } else {
    await fileLoad();
    const count = Object.keys(store).filter(k => !k.startsWith('__ttl_')).length;
    console.log(`[KV] File backend — ${count} keys (${KV_FILE})`);
    // LOUD warning: on Railway the container filesystem is ephemeral, so the file
    // backend is WIPED on every redeploy — bot configs + MT5 credentials silently
    // vanish. This is the "account details keep being lost" failure. Make it
    // impossible to miss so it gets configured, not rediscovered each deploy.
    console.warn('┌───────────────────────────────────────────────────────────────────────┐');
    console.warn('│ [KV] ⚠  NO PERSISTENT BACKEND — bot CONFIG + CREDENTIALS will be LOST   │');
    console.warn('│      on the next redeploy (file store is ephemeral on Railway).        │');
    console.warn('│      FIX: set CF_ACCOUNT_ID + CF_API_TOKEN (Cloudflare KV) in the       │');
    console.warn('│      Railway service env, OR mount a persistent volume at DATA_DIR.     │');
    console.warn('└───────────────────────────────────────────────────────────────────────┘');
  }
}

// Persistence health — is a redeploy-durable backend active? Surfaced via
// /api/kv-health + the bot-config banner so the user SEES the risk before it bites.
export function health() {
  return {
    persistent: USE_CF,
    backend: USE_CF ? 'cloudflare-kv' : 'file',
    file: USE_CF ? null : KV_FILE,
    warning: USE_CF ? null
      : 'Ephemeral file backend: bot config + MT5 credentials are WIPED on every redeploy. Set CF_ACCOUNT_ID + CF_API_TOKEN in Railway (or mount a volume at DATA_DIR).',
  };
}

// LIVE persistence probe — turns "did my config actually persist?" into a fact
// instead of trusting a green "Saved ✓". Does a real write→read→delete round-trip
// through the SAME durable path config uses (see isCfKey's kv_probe_ rule), and
// reports which of `keys` are present in the store RIGHT NOW. Surfaced at
// /api/kv-health so a config that silently landed in the ephemeral store (CF
// inactive / write failing) is visible before a redeploy eats it.
export async function probe(keys = []) {
  const out = { roundTrip: null, keysPresent: {} };
  if (USE_CF) {
    const pk = `kv_probe_${Date.now()}`;
    const val = JSON.stringify({ t: Date.now() });
    try {
      await put(pk, val);
      const back = await get(pk);
      out.roundTrip = back === val
        ? 'ok — durable backend writes + reads back'
        : 'FAILED: value did not read back from CF KV (writes are silently not persisting)';
    } catch (e) {
      out.roundTrip = `FAILED: ${e.message}`;
    } finally {
      try { await del(pk); } catch { /* best-effort cleanup */ }
    }
  } else {
    out.roundTrip = 'skipped — file backend is NOT durable across redeploys (set CF_ACCOUNT_ID + CF_API_TOKEN)';
  }
  for (const k of keys) {
    try { out.keysPresent[k] = (await get(k)) != null; }
    catch (e) { out.keysPresent[k] = `error: ${e.message}`; }
  }
  return out;
}

export async function get(key) {
  if (USE_CF && isCfKey(key)) {
    try   { return await cfGet(key); }
    catch (e) { console.error(`[KV] CF get failed (${key}):`, e.message); return null; }
  }
  const ttlKey = `__ttl_${key}`;
  if (store[ttlKey] && Date.now() > store[ttlKey]) {
    delete store[key]; delete store[ttlKey]; dirty = true; return null;
  }
  return store[key] ?? null;
}

export async function put(key, value, opts = {}) {
  if (USE_CF && isCfKey(key)) {
    try   { await cfPut(key, value, opts); return; }
    catch (e) { console.error(`[KV] CF put failed (${key}):`, e.message); }
  }
  store[key] = value;
  if (opts?.expirationTtl) store[`__ttl_${key}`] = Date.now() + opts.expirationTtl * 1_000;
  dirty = true;
}

// List key names matching a prefix. Returns array of key name strings.
// CF backend: uses the KV list API (one request, up to 1000 keys).
// File backend: filters the in-memory store.
export async function keys(prefix = '') {
  if (USE_CF) {
    try {
      const url = `${CF_BASE}/keys?prefix=${encodeURIComponent(prefix)}&limit=1000`;
      const r   = await fetch(url, { headers: CF_HEADERS });
      if (!r.ok) throw new Error(`CF KV LIST ${prefix}: ${r.status}`);
      const json = await r.json();
      return (json.result ?? []).map(k => k.name);
    } catch (e) {
      console.error(`[KV] CF keys failed (${prefix}):`, e.message);
      return [];
    }
  }
  return Object.keys(store).filter(k => !k.startsWith('__ttl_') && k.startsWith(prefix));
}

export async function del(key) {
  if (USE_CF && isCfKey(key)) {
    try   { await cfDel(key); return; }
    catch (e) { console.error(`[KV] CF del failed (${key}):`, e.message); }
  }
  delete store[key];
  delete store[`__ttl_${key}`];
  dirty = true;
}
