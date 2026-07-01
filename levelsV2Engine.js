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
import { selectAlerts, pruneCooldowns, DEFAULT_V2_ALERT_CFG, GRADE_RANK } from './js/alertV2Core.js';
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
const utcHour = epochSec => new Date(epochSec * 1000).getUTCHours();
const utcDay  = epochSec => new Date(epochSec * 1000).getUTCDay();   // 0=Sun..6=Sat

// Asia ladder = body range of the latest session's first ASIA_HRS hours.
// CRITICAL — this window MUST match what the frozen policy was LEARNED on, else the
// live ladder is anchored on a different range than the grades were computed for
// (the LEGO §1 "live and backtest import the same definition" rule). The v2 learn
// route buckets sessions at the 00:00-UTC boundary (boundaryHour default 0) and
// takes the first asiaHrs=6 → 00:00–06:00 **UTC**. The old code filtered on
// Europe/London local hours, which in BST is 23:00–05:00 UTC — a 1-hour drift that
// shifted/clipped the anchor vs the policy (the body high could sit in the missed
// 00:00–01:00 BST hour, so the live high read low). Keep it UTC to stay aligned.
const ASIA_HRS = 6;
function asiaRange(bars5m) {
  if (!bars5m?.length) return null;
  const lastDay = new Date(bars5m[bars5m.length - 1].time * 1000).toISOString().slice(0, 10);  // UTC day
  const asia = bars5m.filter(b => {
    const day = new Date(b.time * 1000).toISOString().slice(0, 10);
    return day === lastDay && utcHour(b.time) < ASIA_HRS;
  });
  return bodyRange(asia.length >= 12 ? asia : bars5m.filter(b => utcHour(b.time) < ASIA_HRS).slice(-72));
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
    // gradeLevelV2 returns {entries,skips} with includeSkips, but [] on its early
    // guard — tolerate both shapes.
    const entries  = Array.isArray(graded) ? graded : (graded?.entries ?? []);
    const skipsArr = Array.isArray(graded) ? [] : (graded?.skips ?? []);

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

    // (Telegram alerting is NOT done here — the 30-min refresh only recomputes the
    // zones. A separate fast loop, checkV2AlertsNow(), fires on live-price approach
    // every ~90s against these cached zones, so alerts aren't gated to the 30-min cycle.)

    // When 0 entries, pin down WHY: was any ladder level near price at all (geometry),
    // and of those near, did the policy skip them (skip/unseen) vs were they dropped
    // for a 'na' velocity bucket?
    let reason = 'ok';
    if (!payload.length) {
      let nearCount = 0;
      for (const lad of ladders) for (const g of buildRangeLadder(lad.low, lad.high - lad.low, lad.srcTag))
        if (Math.abs(g.level - price) <= proxDist) nearCount++;
      const skipCount = skipsArr.length;
      reason = nearCount === 0 ? `no-near-levels(ladders=${ladders.length},prox=${(proxDist / pip).toFixed(0)}p)`
             : skipCount > 0   ? `near-all-skip(near=${nearCount},skip=${skipCount},eg=${skipsArr[0]?.reason ?? '?'})`
             :                   `near-all-na(near=${nearCount})`;   // near but velocity/condition 'na'
    }
    console.log(`[LEVELS-V2] ${sym}: ${payload.length} entries (${ladders.map(l => l.srcTag).join('+')}${bars1m.length ? '' : ' M5-approach'}${sigmaFallback ? ' σ-fallback' : ''}) ${reason}, ${Date.now() - t0}ms`);
    return { n: payload.length, reason, sigmaFallback, m1: bars1m.length > 0 };
  } catch (e) {
    console.error(`[LEVELS-V2] ${sym} error:`, e?.stack ?? e?.message ?? e);
    return { n: 0, reason: 'error: ' + String(e?.message ?? e).slice(0, 120), error: String(e?.message ?? e) };
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

// ── Telegram creds: prefer v2's OWN bot, fall back to the shared v1 tg_config ──
export async function loadV2Creds() {
  try { const raw = await kv.get('tg_v2_config'); const c = raw ? JSON.parse(raw) : null; if (c?.token && c?.chatId) return { token: c.token, chatId: c.chatId, source: 'v2-bot' }; } catch {}
  try { const raw = await kv.get('tg_config');    const c = raw ? JSON.parse(raw) : null; if (c?.token && c?.chatId) return { token: c.token, chatId: c.chatId, source: 'shared-v1' }; } catch {}
  return null;
}
export async function sendV2Test(text) {
  const creds = await loadV2Creds();
  if (!creds) return { ok: false, error: 'no Telegram token/chat — save a v2 bot or the v1 tg_config' };
  const ok = await sendTelegramV2(creds.token, creds.chatId, text);
  return { ok, via: creds.source };
}

// ── Fast alert loop: fire on LIVE-price approach, decoupled from the 30-min zone
// refresh. Reads the cached zones (ai_entries_v2_*) + a fresh price per pair and
// applies the v2 alert config + cooldowns. Run every ~90s so an approach mid-cycle
// still alerts. Alerts only — never trades.
export async function checkV2AlertsNow(pairs = []) {
  const at = Date.now();
  let cfg;
  try { const raw = await kv.get('tg_v2_alert_cfg'); cfg = raw ? { ...DEFAULT_V2_ALERT_CFG, ...JSON.parse(raw) } : { ...DEFAULT_V2_ALERT_CFG }; }
  catch { cfg = { ...DEFAULT_V2_ALERT_CFG }; }
  const creds = await loadV2Creds();
  // Diagnostic snapshot — persisted every run so the page can show WHY 0 alerts
  // fired (disabled / no-creds / no zones / grade-too-low / out-of-range / cooldown)
  // instead of silent nothing. Read via GET /api/levels-v2/alert-diag.
  const diag = { at, enabled: !!cfg.enabled, minGrade: cfg.minGrade, credsSource: creds?.source ?? null, sent: 0, checked: 0, reason: 'ok', perPair: [] };
  const save = () => kv.put('tg_v2_alert_diag', JSON.stringify(diag)).catch(() => {});

  if (!cfg.enabled) { diag.reason = 'alerts disabled — tick “Enable alerts” in ⚙ Alerts'; await save(); return { ok: true, skipped: 'disabled', diag }; }
  if (!creds)       { diag.reason = 'no Telegram bot saved — add a v2 bot or the shared v1 tg_config'; await save(); return { ok: true, skipped: 'no-telegram-creds', diag }; }

  let cooldowns = {};
  try { const cd = await kv.get('tg_v2_cooldowns'); if (cd) cooldowns = JSON.parse(cd) || {}; } catch {}
  cooldowns = pruneCooldowns(cooldowns, at);

  const minRank = GRADE_RANK[cfg.minGrade] ?? 3;
  const watch = (Array.isArray(cfg.pairs) && cfg.pairs.length) ? cfg.pairs : pairs;
  let sent = 0, checked = 0, anyQual = 0, anyInRange = 0, anyZones = 0;
  for (const sym of watch) {
    let blk = null;
    try { const raw = await kv.get(`ai_entries_v2_${sym.replace('/', '')}`); blk = raw ? JSON.parse(raw) : null; } catch {}
    const zones = blk?.data;
    if (!zones?.length) { diag.perPair.push({ sym, zones: 0 }); continue; }
    anyZones += zones.length;
    const price = await fetchPrice(sym);
    if (price == null) { diag.perPair.push({ sym, zones: zones.length, price: null }); continue; }
    checked++;
    const pip = pipOf(sym), digits = digitsOf(sym);
    // Per-pair diagnostics: grade tally + nearest zone that clears minGrade.
    const grades = {};
    let nearestQual = null, qualCount = 0, inRangeCount = 0;
    const prox = (cfg.proxPips?.[sym] ?? cfg.proxPips?.default ?? DEFAULT_V2_ALERT_CFG.proxPips.default);
    for (const e of zones) {
      grades[e.grade] = (grades[e.grade] ?? 0) + 1;
      if ((GRADE_RANK[e.grade] ?? 0) < minRank || e.direction == null) continue;
      qualCount++;
      const dPips = Math.abs(e.price - price) / pip;
      if (nearestQual == null || dPips < nearestQual) nearestQual = dPips;
      if (dPips <= prox) inRangeCount++;
    }
    anyQual += qualCount; anyInRange += inRangeCount;
    const sel = selectAlerts({ sym, entries: zones, currentPrice: price, pip, cfg, cooldowns, now: at });
    cooldowns = sel.cooldowns;
    for (const a of sel.alerts) {
      const msg = formatV2Entry(sym, a.entry, { currentPrice: price, digits, distPips: a.distPips });
      if (await sendTelegramV2(creds.token, creds.chatId, msg)) sent++;
    }
    diag.perPair.push({ sym, zones: zones.length, grades, qual: qualCount,
      nearestQualPips: nearestQual != null ? +nearestQual.toFixed(1) : null,
      proxPips: prox, inRange: inRangeCount, fired: sel.alerts.length });
    await new Promise(r => setTimeout(r, 120));   // gentle on OANDA
  }
  try { await kv.put('tg_v2_cooldowns', JSON.stringify(cooldowns)); } catch {}
  diag.sent = sent; diag.checked = checked;
  if (sent) diag.reason = `sent ${sent}`;
  else if (!anyZones)   diag.reason = 'no cached zones yet — run Refresh (or Learn if no policy)';
  else if (!anyQual)    diag.reason = `no zones grade ≥ ${cfg.minGrade} — lower minGrade or wait for a stronger setup`;
  else if (!anyInRange) diag.reason = `${anyQual} zone(s) ≥ ${cfg.minGrade} but price not within proxPips — widen proxPips or wait for approach`;
  else                  diag.reason = 'qualifying zones in range but all within cooldown';
  await save();
  if (sent) console.log(`[LEVELS-V2] alert loop: sent ${sent} (checked ${checked} pairs · via ${creds.source})`);
  return { ok: true, sent, checked, via: creds.source, diag };
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

  const results = {};
  for (const sym of pairs) {
    results[sym] = await refreshPairV2(sym, frozen, opts, ledgerRef);
    await new Promise(r => setTimeout(r, 400));   // OANDA rate-limit
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
    const coarse = reason.startsWith('error') ? 'error' : reason.split('(')[0];   // group all errors; full msg stays per-pair
    byReason[coarse] = (byReason[coarse] || 0) + 1;
    perPair[sym] = { n, reason };                          // full detail (with counts) per pair
  }
  console.log(`[LEVELS-V2] done — ${pairsWithEntries}/${pairs.length} pairs with zones · ${totalEntries} entries · reasons ${JSON.stringify(byReason)}`);
  return { ok: true, policyBuiltAt: frozen.builtAt ?? null, ledgerSize: ledgerRef?.ledger.length ?? 0,
           totalEntries, pairsWithEntries, pairsTotal: pairs.length, byReason, perPair };
}
