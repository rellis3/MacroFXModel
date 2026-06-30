// levelsV2Engine.js — server-side Telegram-v2 live producer.
//
// The live half of the v2 confidence engine (TELEGRAM_V2.md). Every refresh:
//   1. Fetch OANDA M5 (Asia session) + M30 (Monday) + D (daily σ) bars per pair.
//   2. Build the SAME Asia/Monday range ladders the offline learner used
//      (rangeLineAnalyser.buildRangeLadder — imported, never copied).
//   3. For each near-price level, compute the SAME approachVel bucket via the shared
//      touchFeatures brick, look up the FROZEN per-cell expectancy policy, and grade
//      with gradeLevelV2 → levelConfidenceCore.
//   4. Write ai_entries_v2_{PAIR} to KV (source 'server-v2') for the bot / cron / page.
//
// The runtime NEVER fits a policy — it loads the frozen artifact (KV key `policy_v2`,
// built offline via /api/levels-v2/learn). "Offline first, then push out."
//
// Live↔offline caveat (documented honestly): the offline learner buckets M1 into
// 22:00-UTC sessions and scores approachVel at the actual first-touch bar; the live
// engine fetches fresh OANDA bars and scores approachVel at "now" as price nears the
// level. Same ladder + same touchFeatures code ⇒ same cell key; the approach window
// is the closest live analogue of a touch. The grade is the backtested grade for
// that cell, applied live.
//
// Env: OANDA_KEY (+ OANDA_ENV, OANDA_ACCOUNT_ID). Policy: KV `policy_v2`.

import * as kv from './kv.js';
import { pipSize as pipSizeOf } from './js/instrumentRegistry.js';
import { volSigmaSeries } from './js/forecastCore.js';
import { createTouchFeatures } from './js/touchFeatures.js';
import { gradeLevelV2 } from './js/gradeLevelV2.js';
import { buildRangeLadder } from './js/rangeLineAnalyser.js';
import { isUsablePolicy } from './js/levelsV2Learn.js';
import { recordEntries, resolvePair } from './js/entryLedgerV2.js';
import { selectAlerts, pruneCooldowns, DEFAULT_V2_ALERT_CFG } from './js/alertV2Core.js';
import { formatV2Entry } from './js/alertFormatterV2.js';

// Minimal Telegram sender (v2-owned; the cross-file JS Telegram sender is a known
// LEGO_MODULES §2 candidate). Reads tg_config saved by the Alerts modal.
async function sendTelegramV2(token, chatId, html) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(12_000),
    });
    return r.ok;
  } catch { return false; }
}

// ── Instrument helpers ────────────────────────────────────────────────────────
function pipOf(sym) { try { return pipSizeOf(sym); } catch { return sym.includes('JPY') ? 0.01 : sym.includes('XAU') ? 0.1 : 0.0001; } }
function digitsOf(sym) { return sym.includes('JPY') ? 3 : sym.includes('XAU') ? 2 : sym === 'NAS100_USD' ? 1 : 5; }
function assetClassFor(sym) { return sym.includes('XAU') || sym.includes('GOLD') ? 'commodity' : sym === 'NAS100_USD' ? 'index' : 'fx'; }

// ── OANDA fetch (candidate shared brick #16; kept local for now) ──────────────
function oandaBase() {
  return (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com' : 'https://api-fxtrade.oanda.com';
}
// Returns bars OLDEST-FIRST as { time(epoch sec), open, high, low, close }.
async function fetchBars(sym, granularity, count) {
  const instrument = sym.replace('/', '_');
  const url = `${oandaBase()}/v3/instruments/${encodeURIComponent(instrument)}/candles?count=${count}&granularity=${granularity}&price=M`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`OANDA ${sym} ${granularity}: ${r.status}`);
  const d = await r.json();
  return (d.candles || []).filter(c => c.complete !== false).map(c => ({
    time:  Math.floor(new Date(c.time).getTime() / 1000),
    open:  parseFloat(c.mid.o), high: parseFloat(c.mid.h), low: parseFloat(c.mid.l), close: parseFloat(c.mid.c),
  }));
}
async function fetchPrice(sym) {
  try {
    const r = await fetch(`${oandaBase()}/v3/instruments/${encodeURIComponent(sym.replace('/', '_'))}/candles?count=1&granularity=M1&price=M`,
      { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const d = await r.json();
    const last = d.candles?.slice(-1)[0];
    return last?.mid?.c ? parseFloat(last.mid.c) : null;
  } catch { return null; }
}

// ── Body range over bars (open/close extremes) ───────────────────────────────
function bodyRange(bars) {
  if (!bars?.length) return null;
  let hi = -Infinity, lo = Infinity;
  for (const b of bars) { hi = Math.max(hi, b.open, b.close); lo = Math.min(lo, b.open, b.close); }
  return hi > lo ? { low: lo, high: hi } : null;
}
const londonHour = epochSec => {
  const s = new Date(epochSec * 1000).toLocaleString('sv-SE', { timeZone: 'Europe/London' });
  return parseInt(s.substring(11, 13), 10);
};
const utcDay = epochSec => new Date(epochSec * 1000).getUTCDay();   // 0=Sun..6=Sat

// Asia ladder = body range of the latest session's 00:00–06:00 London M5 bars.
function asiaRange(bars5m) {
  if (!bars5m?.length) return null;
  const lastDay = new Date(bars5m[bars5m.length - 1].time * 1000).toISOString().slice(0, 10);
  const asia = bars5m.filter(b => {
    const day = new Date(b.time * 1000).toISOString().slice(0, 10);
    return day === lastDay && londonHour(b.time) < 6;
  });
  return bodyRange(asia.length >= 12 ? asia : bars5m.filter(b => londonHour(b.time) < 6).slice(-72));
}
// Monday ladder = body range of the current week's Monday M30 bars.
function mondayRange(bars30m) {
  if (!bars30m?.length) return null;
  const mons = bars30m.filter(b => utcDay(b.time) === 1);
  if (!mons.length) return null;
  const lastMonDay = new Date(mons[mons.length - 1].time * 1000).toISOString().slice(0, 10);
  return bodyRange(mons.filter(b => new Date(b.time * 1000).toISOString().slice(0, 10) === lastMonDay));
}

// ── Policy loader (frozen artifact from KV) ──────────────────────────────────
let _policyCache = null, _policyAt = 0;
const POLICY_TTL = 10 * 60 * 1000;
export async function loadPolicy() {
  if (_policyCache && Date.now() - _policyAt < POLICY_TTL) return _policyCache;
  try {
    const raw = await kv.get('policy_v2');
    const frozen = raw ? JSON.parse(raw) : null;
    if (isUsablePolicy(frozen)) { _policyCache = frozen; _policyAt = Date.now(); return frozen; }
  } catch {}
  return null;
}
export function _setPolicyCache(frozen) { _policyCache = frozen; _policyAt = Date.now(); }   // for the learn route

// ── Per-pair refresh ──────────────────────────────────────────────────────────
export async function refreshPairV2(sym, frozen, opts = {}, ledgerRef = null) {
  const t0 = Date.now();
  const pip = pipOf(sym), digits = digitsOf(sym), ac = assetClassFor(sym);
  try {
    // M1 for the approach path (matches the offline learner's M1 bars so the
    // approachVel bucket — velWin=15 → 15 min — is comparable to the learned cell;
    // feeding M5 made every live touch read '1·grind'). M5/M30 for the ranges, D for σ.
    // M1 (approach path) and D (σ) are OPTIONAL — a failing/empty one must NOT
    // zero out the pair (that was the "no zones" bug). M5 (ladders) is required.
    const [bars1m, bars5m, bars30m, barsD] = await Promise.all([
      fetchBars(sym, 'M1', 900).catch(() => []),
      fetchBars(sym, 'M5', 1500).catch(() => []),
      fetchBars(sym, 'M30', 500).catch(() => []),
      fetchBars(sym, 'D', 120).catch(() => []),
    ]);
    if (!bars5m.length) return { n: 0, reason: 'no-M5-bars' };

    const ar = asiaRange(bars5m), mr = mondayRange(bars30m);
    const ladders = [];
    if (ar) ladders.push({ srcTag: 'A', low: ar.low, high: ar.high });
    if (mr) ladders.push({ srcTag: 'M', low: mr.low, high: mr.high });
    if (!ladders.length) return { n: 0, reason: 'no-ladders' };

    // Daily σ for approachVel units (forecastCore). If daily bars are unavailable,
    // fall back to a σ estimated from M5 returns so velocity can still bucket
    // (sigma=0 → every cell reads 'na' → zero zones).
    const d1 = barsD.map(b => ({ open: b.open, high: b.high, low: b.low, close: b.close }));
    const sigD = d1.length >= 20 ? volSigmaSeries(d1, ac) : [];
    let sigma = sigD.length ? (sigD[sigD.length - 1] || 0) : 0;
    let sigmaFallback = false;
    if (!(sigma > 0)) { sigma = fallbackSigmaFromM5(bars5m); sigmaFallback = sigma > 0; }
    if (!(sigma > 0)) return { n: 0, reason: 'no-sigma' };

    const price = await fetchPrice(sym);
    if (price == null) return { n: 0, reason: 'no-price' };

    // Approach path = M1 (matches the offline learner); fall back to M5 if M1 is
    // unavailable so a missing M1 only degrades velocity granularity, not coverage.
    const approachBars = bars1m.length ? bars1m : bars5m;
    const sessionBars = approachBars.slice(-Math.min(approachBars.length, 900));
    const open = sessionBars[0].open;
    const tf = createTouchFeatures(opts.touchCfg);

    // DISPLAY proximity window. The ladder step is half the session range, so a
    // FIXED pip window misses the nearest line whenever the range is wide (the
    // "no zones" cause). Scale it to the ladder so the nearest line ALWAYS shows —
    // the page is a tracker (cards display distance); tightness is the alert's job
    // (selectAlerts has its own proxPips). 0.3×range > 0.25×range = worst-case
    // distance to the nearest half-step line.
    const baseProxPips = opts.proxPips?.[sym] ?? opts.proxPips?.default ?? (sym.includes('XAU') ? 80 : sym === 'NAS100_USD' ? 60 : 25);
    const maxRange = Math.max(...ladders.map(l => l.high - l.low));
    const proxDist = Math.max(baseProxPips * pip, 0.3 * maxRange);

    const graded = gradeLevelV2({
      ladders, bars: sessionBars, open, sigma, pip, price, proxDist, tf,
      policy: frozen.policy, condFields: frozen.conditions ?? ['approachVel'],
      includeSkips: true,
      opts: { bands: frozen.bands ?? opts.bands },   // policy's own distribution-fit bands
    });
    const entries = graded.entries;

    const payload = entries.map(e => ({
      ...e, price: +e.price.toFixed(digits),
      sl: e.sl != null ? +e.sl.toFixed(digits) : null,
      tp: e.tp != null ? +e.tp.toFixed(digits) : null,
    }));

    await kv.put(`ai_entries_v2_${sym.replace('/', '')}`, JSON.stringify({
      data: payload, timestamp: Date.now(), source: 'server-v2',
      policyBuiltAt: frozen.builtAt ?? null, currentPrice: +price.toFixed(digits),
    }));

    // Daily-learning loop: record these signals + resolve older ones from M1.
    if (ledgerRef) {
      const now = Date.now();
      ledgerRef.ledger = recordEntries(ledgerRef.ledger, sym, payload, now, opts.ledger);
      ledgerRef.ledger = resolvePair(ledgerRef.ledger, sym, approachBars, now, opts.ledger);
    }

    // Telegram alerts (v2's OWN config + cooldowns; alerts only, never trades).
    const ac = opts.alertCtx;
    if (ac?.cfg?.enabled && ac.token && ac.chatId) {
      const sel = selectAlerts({ sym, entries: payload, currentPrice: +price.toFixed(digits), pip, cfg: ac.cfg, cooldowns: ac.cooldowns, now: Date.now() });
      ac.cooldowns = sel.cooldowns;
      for (const a of sel.alerts) {
        const msg = formatV2Entry(sym, a.entry, { currentPrice: +price.toFixed(digits), digits, distPips: a.distPips, policyBuiltAt: frozen.builtAt });
        const okSend = await sendTelegramV2(ac.token, ac.chatId, msg);
        ac.sent = (ac.sent ?? 0) + (okSend ? 1 : 0);
      }
    }

    // When 0 entries, pin down WHY: was any ladder level near price at all (geometry),
    // and of those near, did the policy skip them (skip/unseen) vs were they dropped
    // for a 'na' velocity bucket?
    let reason = 'ok';
    if (!payload.length) {
      let nearCount = 0;
      for (const lad of ladders) for (const g of buildRangeLadder(lad.low, lad.high - lad.low, lad.srcTag))
        if (Math.abs(g.level - price) <= proxDist) nearCount++;
      const skipCount = graded.skips?.length ?? 0;
      reason = nearCount === 0 ? `no-near-levels(ladders=${ladders.length},prox=${(proxDist / pip).toFixed(0)}p)`
             : skipCount > 0   ? `near-all-skip(near=${nearCount},skip=${skipCount},eg=${graded.skips[0]?.reason ?? '?'})`
             :                   `near-all-na(near=${nearCount})`;   // near but velocity/condition 'na'
    }
    console.log(`[LEVELS-V2] ${sym}: ${payload.length} entries (${ladders.map(l => l.srcTag).join('+')}${bars1m.length ? '' : ' M5-approach'}${sigmaFallback ? ' σ-fallback' : ''}) ${reason}, ${Date.now() - t0}ms`);
    return { n: payload.length, reason, sigmaFallback, m1: bars1m.length > 0 };
  } catch (e) {
    console.error(`[LEVELS-V2] ${sym} error:`, e.message);
    return { n: 0, reason: 'error', error: e.message };
  }
}

// Rough daily σ (fraction of price) from M5 close-to-close returns, for when daily
// bars are unavailable. ~288 M5 bars/day → scale the per-bar stdev to a day.
function fallbackSigmaFromM5(bars5m) {
  const closes = bars5m.slice(-600).map(b => b.close).filter(c => c > 0);
  if (closes.length < 20) return 0;
  const rets = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const m = rets.reduce((s, x) => s + x, 0) / rets.length;
  const v = rets.reduce((s, x) => s + (x - m) ** 2, 0) / rets.length;
  return Math.sqrt(v) * Math.sqrt(288);
}

// ── Refresh all pairs ───────────────────────────────────────────────────────
export async function refreshAllPairsV2(pairs, opts = {}) {
  const frozen = await loadPolicy();
  if (!frozen) { console.log('[LEVELS-V2] no frozen policy_v2 — run /api/levels-v2/learn first'); return { ok: false, error: 'no policy' }; }
  console.log(`[LEVELS-V2] refresh ${pairs.length} pairs · policy built ${frozen.builtAt ?? '?'} · ${frozen.nCells} cells`);

  // Load the running ledger once, thread it through every pair (record + resolve), save once.
  let ledgerRef = null;
  if (opts.ledger?.enabled !== false) {
    let ledger = [];
    try { const raw = await kv.get('ledger_v2'); if (raw) ledger = JSON.parse(raw)?.data ?? JSON.parse(raw) ?? []; } catch {}
    ledgerRef = { ledger: Array.isArray(ledger) ? ledger : [] };
  }

  // Load v2 alert config + Telegram creds + cooldowns once (own config, separate from v1).
  let alertCtx = null;
  try {
    const cfgRaw = await kv.get('tg_v2_alert_cfg');
    const cfg = cfgRaw ? { ...DEFAULT_V2_ALERT_CFG, ...JSON.parse(cfgRaw) } : { ...DEFAULT_V2_ALERT_CFG };
    if (cfg.enabled) {
      const tgRaw = await kv.get('tg_config');
      const tg = tgRaw ? JSON.parse(tgRaw) : null;
      if (tg?.token && tg?.chatId) {
        let cooldowns = {};
        try { const cdRaw = await kv.get('tg_v2_cooldowns'); if (cdRaw) cooldowns = JSON.parse(cdRaw) || {}; } catch {}
        alertCtx = { cfg, token: tg.token, chatId: tg.chatId, cooldowns: pruneCooldowns(cooldowns, Date.now()), sent: 0 };
      } else {
        console.log('[LEVELS-V2] alerts enabled but tg_config missing token/chatId — save them in the Alerts modal');
      }
    }
  } catch (e) { console.error('[LEVELS-V2] alert config load error:', e.message); }
  opts = { ...opts, alertCtx };

  const results = {};
  for (const sym of pairs) {
    results[sym] = await refreshPairV2(sym, frozen, opts, ledgerRef);
    await new Promise(r => setTimeout(r, 400));   // OANDA rate-limit
  }

  if (alertCtx) {
    try { await kv.put('tg_v2_cooldowns', JSON.stringify(alertCtx.cooldowns)); } catch {}
    if (alertCtx.sent) console.log(`[LEVELS-V2] sent ${alertCtx.sent} Telegram alert(s)`);
  }

  if (ledgerRef) {
    try { await kv.put('ledger_v2', JSON.stringify({ data: ledgerRef.ledger, timestamp: Date.now() })); } catch {}
  }

  // Diagnostics so "no zones" is never a mystery: total entries + why each pair
  // produced none (no-M5-bars / no-ladders / no-sigma / no-price / no-near-zones / error).
  const byReason = {}; const perPair = {};
  let totalEntries = 0, pairsWithEntries = 0;
  for (const [sym, r] of Object.entries(results)) {
    const n = typeof r === 'number' ? r : (r?.n ?? 0);
    const reason = typeof r === 'number' ? (n ? 'ok' : 'no-near-zones') : (r?.reason ?? 'null');
    totalEntries += n; if (n > 0) pairsWithEntries++;
    const coarse = reason.split('(')[0];                  // strip per-pair counts for the aggregate
    byReason[coarse] = (byReason[coarse] || 0) + 1;
    perPair[sym] = { n, reason };                          // full detail (with counts) per pair
  }
  console.log(`[LEVELS-V2] done — ${pairsWithEntries}/${pairs.length} pairs with zones · ${totalEntries} entries · reasons ${JSON.stringify(byReason)}`);
  return { ok: true, policyBuiltAt: frozen.builtAt ?? null, ledgerSize: ledgerRef?.ledger.length ?? 0,
           totalEntries, pairsWithEntries, pairsTotal: pairs.length, byReason, perPair };
}
