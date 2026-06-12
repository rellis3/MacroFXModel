// ── Telegram Alert System ─────────────────────────────────────────────────────
// Browser-side alert engine. Reads window._lastEntries on each price tick,
// checks proximity thresholds, debounces with per-level cooldowns, and fires
// alerts via /api/telegram (which calls the Telegram Bot API server-side).
//
// Config stored in localStorage under 'tg_alert_cfg'. No KV needed — this is
// intentionally browser-local so each device has its own alert preferences.

import { getPipSize, getDigits } from './utils.js';
import { S } from './state.js';
import { PAIRS } from './config.js';
import { filterConfluences, enhanceConfluences, mergeCrossSources } from './confluences.js';
import { runSignalEngine, runEntryScanner, computeSignalScore } from './signal.js';
import { calculateVolRegime, calculatePivots } from './vol.js';
import { calculateTierScores, compute5mKalmanDev, computeBayesianScore } from './macro.js';
import { gradeEntry } from './trade-grade.js';
import { computeGoldMacroModel } from './gold-model.js';
import { computeFXMacroModel, PAIR_DRIVERS } from './fx-macro-model.js';
import { computeFXDailyTone, computeRiskBarometer, resetRiskBarometerCache, TONE_REGIMES } from './fx-daily-tone.js';
import { computeArimaContext } from './arima-price.js';
import { collectDecisionInputs } from '../DecisionEngine/decisionInputs.js';
import { runDecisionEngine } from '../DecisionEngine/decisionEngine.js';

const STORAGE_KEY    = 'tg_alert_cfg';
const COOLDOWN_KEY   = 'tg_alert_cooldowns';
const AUDIT_LOG_KEY  = 'decision_audit_log';
const AUDIT_LOCAL_KEY = 'decision_audit_local';

// Throttle KV entry syncs — at most once per 5 min per pair.
// This prevents flooding KV on every SSE price tick.
const _kvEntrySyncTimes = new Map();

// ── Decision engine audit log ─────────────────────────────────────────────────
// In-memory + localStorage. Written on every proximity event that clears
// grade/cooldown filters. KV-synced for the backtest-viewer adapter.

const _MAX_AUDIT = 1000;

let _auditLog = (() => {
  try { return JSON.parse(localStorage.getItem(AUDIT_LOCAL_KEY) ?? '[]'); }
  catch { return []; }
})();

// Live suppressed log — resets on page reload. Last 20 suppressed entries.
const _suppressedLog = [];

export function getSuppressedLog() { return _suppressedLog; }
export function getAuditLog()      { return _auditLog; }

function _writeAuditEntry(sym, entry, decisionState, permitted, suppressed) {
  const now  = Date.now();
  const date = new Date(now).toISOString().slice(0, 10);
  const rec  = {
    id:                    `${sym.replace('/', '')}_${now}`,
    sym,
    date,
    fill_time:             new Date(now).toISOString().replace('Z', ''),
    direction:             entry.direction,
    price:                 entry.price,
    sl:                    entry.sl   ?? null,
    tp:                    entry.tp   ?? null,
    rrRatio:               entry.rrRatio ?? null,
    grade:                 entry.grade   ?? '—',
    verdict:               entry.verdict ?? '—',
    tags:                  (entry.tags ?? []).map(t => t.label ?? t).slice(0, 4),
    decisionMode:          decisionState?.mode          ?? null,
    decisionParticipation: decisionState?.participation ?? null,
    decisionRiskMult:      decisionState?.riskMult      ?? null,
    permitted,
    suppressed,
    reasons:               decisionState?.reasons?.slice(0, 2) ?? [],
  };

  _auditLog = [rec, ..._auditLog].slice(0, _MAX_AUDIT);
  try { localStorage.setItem(AUDIT_LOCAL_KEY, JSON.stringify(_auditLog)); } catch {}

  if (suppressed) _suppressedLog.unshift(rec);
  if (_suppressedLog.length > 20) _suppressedLog.length = 20;

  // Async KV write — fire and forget, no error recovery needed
  fetch('/api/kv/set', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ key: AUDIT_LOG_KEY, data: _auditLog, timestamp: now }),
  }).catch(() => {});
}

// Default config
const DEFAULT_CFG = {
  enabled:        false,
  browserEnabled: true,   // browser tab proximity alerts on/off
  serverEnabled:  true,   // Railway server monitoring loop on/off
  minGrade:       'B',    // A/B/C/D — minimum grade to alert on
  pairs:       [],          // [] = all active pairs; ['EUR/USD','XAU/USD'] = specific
  proxPips:    {            // pips from level to trigger alert
    default:  5,
    'NAS100_USD': 30,
    'XAU/USD':    8,
  },
  cooldownMin: 60,         // minutes before re-alerting the same level
  onlyAligned: false,      // if true, only alert when signal aligned with entry direction
  flipCandles: 3,          // consecutive full-body closes beyond a level to constitute a polarity break
  regimeChangeAlerts:  true, // send Telegram when live 1m HMM regime changes
  suppressBlocked:     false, // if true, skip Telegram for NOT PERMITTED directions
  macroContextAlerts:  true,  // 📊 structural FRED regime shift alerts
  dailyToneAlerts:     true,  // ⚡ daily tone / session alerts
};

export function loadAlertCfg() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_CFG, ...JSON.parse(raw) };
  } catch(e) {}
  return { ...DEFAULT_CFG };
}

export function saveAlertCfg(cfg) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch(e) {}
  // Sync to KV so the cron worker can read alert preferences server-side
  fetch('/api/kv/set', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ key: 'ai_alert_cfg', data: cfg, timestamp: Date.now() }),
  }).catch(() => {});
}

function loadCooldowns() {
  try { return JSON.parse(localStorage.getItem(COOLDOWN_KEY) || '{}'); } catch(e) { return {}; }
}

function saveCooldowns(cd) {
  try { localStorage.setItem(COOLDOWN_KEY, JSON.stringify(cd)); } catch(e) {}
}

// Prune stale cooldown entries (older than 24h) to keep storage clean
function pruneCooldowns(cd) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const pruned = {};
  for (const [k, ts] of Object.entries(cd)) {
    if (ts > cutoff) pruned[k] = ts;
  }
  return pruned;
}

// Cooldown key: "EURUSD_1.08470_long" — stable across ticks
function cooldownKey(sym, price, direction, digits) {
  return `${sym.replace('/', '')}_${price.toFixed(digits)}_${direction}`;
}

// ── Main check — called on every price tick (any pair) ───────────────────────
// Iterates all watch-pairs independently. Each pair uses its own stored data
// from S (asia/monday ranges, ohlc bars, compassData) and its own live quote
// from window._latestQuotes[sym]. The active pair tab does not matter.

let _alertsInFlight = new Set(); // prevent double-firing same alert concurrently

// Global rate-limit — at most once per 5s regardless of how many SSE ticks arrive
let _alertsLastRun = 0;
const ALERTS_THROTTLE_MS = 5_000;

// Per-symbol entry cache — recomputed at most every 5 min (bars don't change faster)
const _entryCache = new Map(); // sym → { entries, tierData, approachArrow, kalmanDev, at }
const ENTRY_CACHE_TTL = 5 * 60 * 1_000;

export function checkAndSendAlerts() {
  const now = Date.now();
  if (now - _alertsLastRun < ALERTS_THROTTLE_MS) return;
  _alertsLastRun = now;

  const cfg = loadAlertCfg();
  const watchSyms = cfg.pairs?.length ? cfg.pairs : PAIRS.map(p => p.symbol);
  const browserActive = cfg.enabled && cfg.browserEnabled !== false;
  let cooldowns      = browserActive ? pruneCooldowns(loadCooldowns()) : null;
  let cooldownsDirty = false;

  for (const sym of watchSyms) {
    const quote = window._latestQuotes?.[sym];
    if (!quote?.price) continue;

    const asia   = S.asiaRangeData?.[sym];
    const monday = S.mondayRangeData?.[sym];
    if (!asia || !monday) continue;

    const allConfs = mergeCrossSources([
      ...(asia.confluences   || []).map(c => ({ ...c, source: 'asia'   })),
      ...(monday.confluences || []).map(c => ({ ...c, source: 'monday' })),
    ], sym);
    if (!allConfs.length) continue;

    // Refresh entry cache every 5 min — expensive computation, bars don't change faster
    let cached = _entryCache.get(sym);
    if (!cached || now - cached.at > ENTRY_CACHE_TTL) {
      const _savedPair = S.currentPair;
      S.currentPair = PAIRS.find(p => p.symbol === sym) || _savedPair;
      let entries = [], alertTierData = null, alertApproachArrow = null, alertKalmanDev = null;
      let volRegime = null;
      try {
        volRegime = calculateVolRegime();
        const pivots    = calculatePivots();
        const macroBias = (() => {
          try { return runSignalEngine(S.compassData, volRegime).bias; }
          catch(e) { return 'NEUTRAL'; }
        })();
        const filtered = filterConfluences(allConfs);
        const enhanced = enhanceConfluences(filtered, quote.price, macroBias, pivots, volRegime, 0);
        const signal   = runSignalEngine(S.compassData, volRegime);
        entries        = runEntryScanner(signal, enhanced, pivots, asia, monday, quote, volRegime) ?? [];
        alertTierData  = (() => { try { return calculateTierScores(); } catch(e) { return null; } })();
        alertApproachArrow = (() => {
          const bars = S.ohlc5m?.[sym]?.values;
          if (!bars || bars.length < 6) return null;
          const gc = b => parseFloat(b.close ?? b.mid?.c ?? b.c);
          const r = gc(bars[1]), o = gc(bars[Math.min(5, bars.length - 1)]);
          return (!isNaN(r) && !isNaN(o)) ? (r > o ? '↗' : r < o ? '↘' : '→') : null;
        })();
        alertKalmanDev = (() => { try { return compute5mKalmanDev(sym); } catch(e) { return null; } })();
      } catch(e) {
        S.currentPair = _savedPair;
        continue;
      }
      const alertOtcForecast = S.otcForecasts?.[sym] ?? null;
      const alertDecisionState = (() => {
        try { return runDecisionEngine(collectDecisionInputs(volRegime, alertOtcForecast, quote)); }
        catch(_) { return null; }
      })();
      S.currentPair = _savedPair;

      // ARIMA price context — computed from daily bars, written to KV for the bot
      const dailyBars  = S.ohlcData?.[sym]?.values ?? null;
      const arimaCtx   = (() => { try { return computeArimaContext(dailyBars, sym); } catch(e) { return null; } })();
      if (arimaCtx) {
        fetch('/api/kv/set', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            key:  `arima_price_${sym.replace('/', '')}`,
            data: {
              residualStability: arimaCtx.residualStability,
              residualRatio:     arimaCtx.residualRatio,
              forecastPips:      arimaCtx.forecastPips,
              ci68Pips:          arimaCtx.ci68Pips,
              fairValueDev:      arimaCtx.fairValueDev,
              phi:               arimaCtx.phi,
              theta:             arimaCtx.theta,
              narrative:         arimaCtx.narrative,
              computedAt:        now,
            },
            timestamp: now,
          }),
        }).catch(() => {});
      }

      cached = { entries, tierData: alertTierData, approachArrow: alertApproachArrow, kalmanDev: alertKalmanDev, arimaCtx, decisionState: alertDecisionState, at: now };
      _entryCache.set(sym, cached);

      // KV sync for Railway bot — throttled to once per 30 min per pair
      if (entries.length) {
        const lastSync = _kvEntrySyncTimes.get(sym) ?? 0;
        if (now - lastSync > 5 * 60 * 1000) {
          _kvEntrySyncTimes.set(sym, now);
          const hmmData     = S.hmmRegimes?.[sym] ?? null;
          const intraday30m = hmmData?.intraday30m ?? null;
          const payload = entries.map(e => {
            const score = alertTierData ? (computeSignalScore(e, alertTierData, hmmData) ?? null) : null;
            const entryWithScore = { ...e, signalScore: score };
            const g = gradeEntry(entryWithScore, hmmData, intraday30m);
            return {
              price:         e.price,
              direction:     e.direction,
              totalStars:    e.totalStars   ?? 0,
              signalScore:   score,
              grade:         g.grade,
              verdict:       g.verdict,
              reasons:       g.reasons,
              warnings:      g.warnings,
              sl:            e.sl           ?? null,
              tp:            e.tp           ?? null,
              tpNote:        e.tpNote       ?? null,
              rrRatio:       e.rrRatio      ?? null,
              tags:          (e.tags ?? []).slice(0, 4).map(t => t.label ?? t),
              signalAligned: e.signalAligned ?? false,
              rangeBias:     e.rangeBias
                ? { confirmCount: e.rangeBias.confirmCount, conflictCount: e.rangeBias.conflictCount }
                : null,
            };
          });
          const meta = { approachArrow: alertApproachArrow ?? null };
          if (alertKalmanDev != null) meta.kalmanStr = `5m Kalman: ${alertKalmanDev >= 0 ? '+' : ''}${alertKalmanDev.toFixed(2)}σ`;
          if (alertTierData) {
            const bayes = computeBayesianScore(alertTierData.tiers);
            if (bayes) {
              const emj = bayes.dir === 'long' ? '📈' : bayes.dir === 'short' ? '📉' : '↔️';
              const lbl = bayes.dir === 'long' ? 'Long' : bayes.dir === 'short' ? 'Short' : 'Mixed';
              meta.bayesStr = `${emj} Bayesian: <b>${bayes.pct}%</b> ${lbl} Continuation`;
            }
            meta.tiersPos = alertTierData.tiers.filter(t => !t.na && t.score > 0).length;
            meta.tiersNeg = alertTierData.tiers.filter(t => !t.na && t.score < 0).length;
            meta.tiersNa  = alertTierData.tiers.filter(t =>  t.na || t.score === 0).length;
          }
          if (alertDecisionState) {
            meta.decisionMode          = alertDecisionState.mode;
            meta.decisionParticipation = alertDecisionState.participation;
            meta.decisionRiskMult      = alertDecisionState.riskMult;
            meta.decisionPermLong      = alertDecisionState.permissions.long;
            meta.decisionPermShort     = alertDecisionState.permissions.short;
            meta.decisionReasons       = alertDecisionState.reasons?.slice(0, 2) ?? [];
            // Write decision state to a CF-KV-routed key so the Railway bot can read it.
            // ai_entries_* is local-file-only on the server (levels.js overwrites it),
            // but ai_decision_meta_* routes through CF KV (matches the ai_* prefix rule).
            fetch('/api/kv/set', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({
                key:  `ai_decision_meta_${sym.replace('/', '')}`,
                data: {
                  decisionMode:          alertDecisionState.mode,
                  decisionParticipation: alertDecisionState.participation,
                  decisionRiskMult:      alertDecisionState.riskMult,
                  decisionPermLong:      alertDecisionState.permissions.long,
                  decisionPermShort:     alertDecisionState.permissions.short,
                  decisionReasons:       alertDecisionState.reasons?.slice(0, 2) ?? [],
                },
                timestamp: now,
              }),
            }).catch(() => {});
          }
          fetch('/api/kv/set', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ key: `ai_entries_${sym.replace('/', '')}`, data: { entries: payload, meta }, timestamp: now }),
          }).catch(() => {});
        }
      }
    }

    // ── Browser proximity check against cached entries (fast path) ────────────
    if (!browserActive || !cached.entries?.length) continue;

    const pipSz    = getPipSize(sym);
    const digits   = getDigits(sym);
    const price    = quote.price;
    const proxPips = cfg.proxPips?.[sym] ?? cfg.proxPips?.default ?? 5;
    const proxDist = proxPips * pipSz;

    for (const e of cached.entries) {
      const _GRADE_ORDER = {'A+': 5, 'A': 4, 'B': 3, 'C': 2, 'D': 1, 'SKIP': 0};
      if ((_GRADE_ORDER[e.grade] ?? 0) < (_GRADE_ORDER[cfg.minGrade ?? 'B'] ?? 3)) continue;
      if (cfg.onlyAligned && !e.signalAligned) continue;
      if (e.direction == null) continue;

      const dist = Math.abs(e.price - price);
      if (dist > proxDist) continue;

      const ck = cooldownKey(sym, e.price, e.direction, digits);
      if (_alertsInFlight.has(ck)) continue;

      const lastSent = cooldowns[ck] ?? 0;
      if (now - lastSent < cfg.cooldownMin * 60 * 1000) continue;

      cooldowns[ck] = now;
      cooldownsDirty = true;
      _alertsInFlight.add(ck);

      const distPips   = Math.round(dist / pipSz);
      const ds         = cached.decisionState;
      const isLongEntry = e.direction === 'long';
      const permitted  = !ds || ds.mode === 'NO_TRADE'
        ? false
        : (isLongEntry ? ds.permissions.long : ds.permissions.short);
      const suppressed = !permitted && (cfg.suppressBlocked ?? false);

      _writeAuditEntry(sym, e, ds, permitted, suppressed);

      if (suppressed) {
        _alertsInFlight.delete(ck);
        continue;
      }

      sendTelegramAlert(sym, e, price, distPips, digits, cached.approachArrow, cached.kalmanDev, cached.tierData, cached.arimaCtx, ds).finally(() => {
        _alertsInFlight.delete(ck);
      });
    }
  }

  if (cooldownsDirty) saveCooldowns(cooldowns);
}

// Invalidate the entry cache for a symbol when its bars are refreshed
export function invalidateAlertCache(sym) {
  _entryCache.delete(sym ?? S.currentPair?.symbol);
}

// ── Format + dispatch ─────────────────────────────────────────────────────────

async function sendTelegramAlert(sym, entry, currentPrice, distPips, digits, approachArrow, kalmanDev, tierData, arimaCtx, decisionState) {
  const unit     = S.currentPair.isEquity ? 'pts' : 'p';
  const arrowStr = approachArrow ?? '';
  const dir      = entry.direction === 'long' ? '↑ BUY' : '↓ SELL';
  const stars    = entry.grade ? `[${entry.grade}]` : '';
  const rrStr    = entry.rrRatio ? `R:R 1:${entry.rrRatio}` : '';
  const slStr    = entry.sl != null ? `SL ${entry.sl.toFixed(digits)}` : '';
  const tpStr    = entry.tp != null ? `TP ${entry.tp.toFixed(digits)} (${entry.tpNote ? entry.tpNote + ' · ATR' : 'ATR'})` : '';
  const atStr    = distPips <= 0 ? 'AT LEVEL' : `${distPips}${unit} away`;

  // Top tags (first 4 to keep message short)
  const tagStr = (entry.tags ?? []).slice(0, 4).map(t => t.label).join(' · ');

  // Bayesian continuation probability
  const bayesStr = (() => {
    if (!tierData) return null;
    const bayes = computeBayesianScore(tierData.tiers);
    if (!bayes) return null;
    const emj = bayes.dir === 'long' ? '📈' : bayes.dir === 'short' ? '📉' : '↔️';
    const lbl = bayes.dir === 'long' ? 'Long' : bayes.dir === 'short' ? 'Short' : 'Mixed';
    return `${emj} Bayesian: <b>${bayes.pct}%</b> ${lbl} Continuation`;
  })();

  // Tier regime agreement
  const regimeStr = (() => {
    if (!tierData || !entry.direction) return null;
    const isLong   = entry.direction === 'long';
    const agree    = tierData.tiers.filter(t => !t.na && (isLong ? t.score > 0 : t.score < 0)).length;
    const disagree = tierData.tiers.filter(t => !t.na && (isLong ? t.score < 0 : t.score > 0)).length;
    const na       = tierData.tiers.filter(t =>  t.na || t.score === 0).length;
    return `Regime: ${agree} agree · ${disagree} don't · ${na} N/A`;
  })();

  // 5m Kalman deviation
  const kalmanStr = kalmanDev != null
    ? `5m Kalman: ${kalmanDev >= 0 ? '+' : ''}${kalmanDev.toFixed(2)}σ`
    : null;

  // ARIMA price context
  const arimaStr = (() => {
    if (!arimaCtx) return null;
    const stab  = arimaCtx.residualStability;
    const icon  = stab >= 0.80 ? '✅' : stab >= 0.60 ? '🟡' : '🔴';
    const label = stab >= 0.80 ? 'Stable' : stab >= 0.60 ? 'Elevated residuals' : 'Erratic — caution';
    const fv    = Math.abs(arimaCtx.fairValueDev) > 1.0
      ? ` · FV ${arimaCtx.fairValueDev > 0 ? '+' : ''}${arimaCtx.fairValueDev.toFixed(1)}σ`
      : '';
    return `${icon} ARIMA: ${label}${fv}`;
  })();

  const hmm5m     = S.hmm5mRegimes?.[sym];
  const isLong    = entry.direction === 'long';
  const hmm5mLine = hmm5m && hmm5m.confidence >= 60 &&
    ((isLong && hmm5m.regime === 'BEAR') || (!isLong && hmm5m.regime === 'BULL'))
    ? `⚠ 1m: <b>${hmm5m.regime} ${hmm5m.confidence}%</b> — momentum opposing`
    : null;

  // Decision engine gate — permission + context for this direction
  const decisionLine = (() => {
    const ds = decisionState;
    if (!ds) return null;
    if (ds.mode === 'NO_TRADE') {
      return `🚫 Decision: <b>NO TRADE</b> — ${ds.reasons[0] ?? 'conditions not met'}`;
    }
    const permitted = isLong ? ds.permissions.long : ds.permissions.short;
    const gate      = permitted ? '✅ PERMITTED' : '❌ NOT PERMITTED';
    const modeLabel = ds.mode.replace(/_/g, ' ');
    return `${gate} · ${modeLabel} · ${ds.participation} · Risk ${ds.riskMult.toFixed(2)}×`;
  })();

  const lines = [
    `🎯 <b>${sym} ${arrowStr} ${dir}</b> ${stars}`,
    `Price: <b>${entry.price.toFixed(digits)}</b> · ${atStr}`,
    `Current: ${currentPrice.toFixed(digits)}`,
    tagStr ? `Tags: ${tagStr}` : null,
    slStr || tpStr ? [slStr, tpStr].filter(Boolean).join(' · ') : null,
    rrStr ? rrStr : null,
    bayesStr,
    regimeStr,
    kalmanStr,
    arimaStr,
    entry.rangeBias ? `Range Bias: ${entry.rangeBias.confirmCount}✓ ${entry.rangeBias.conflictCount}✗` : null,
    hmm5mLine,
    decisionLine,
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: lines, parseMode: 'HTML' }),
    });
    const j = await res.json();
    if (!j.ok) console.warn('Telegram alert failed:', j.error);
  } catch(e) {
    console.warn('Telegram alert error:', e.message);
  }
}

// ── Config modal ──────────────────────────────────────────────────────────────

export function openAlertModal() {
  const overlay = document.getElementById('alertModalOverlay');
  if (!overlay) return;

  const cfg = loadAlertCfg();

  document.getElementById('alertEnabled').checked         = cfg.enabled;
  document.getElementById('alertBrowserEnabled').checked  = cfg.browserEnabled !== false;
  document.getElementById('alertServerEnabled').checked   = cfg.serverEnabled  !== false;
  document.getElementById('alertMinGrade').value = cfg.minGrade ?? 'B';
  document.getElementById('alertCooldown').value       = cfg.cooldownMin;
  if (document.getElementById('alertFlipCandles')) document.getElementById('alertFlipCandles').value = cfg.flipCandles ?? 3;
  document.getElementById('alertProxDefault').value    = cfg.proxPips?.default ?? 5;
  document.getElementById('alertProxGold').value       = cfg.proxPips?.['XAU/USD'] ?? 8;
  document.getElementById('alertProxNas').value        = cfg.proxPips?.['NAS100_USD'] ?? 30;
  document.getElementById('alertOnlyAligned').checked    = cfg.onlyAligned;
  if (document.getElementById('alertRegimeChange'))    document.getElementById('alertRegimeChange').checked    = cfg.regimeChangeAlerts !== false;
  if (document.getElementById('alertSuppressBlocked')) document.getElementById('alertSuppressBlocked').checked  = cfg.suppressBlocked ?? false;
  if (document.getElementById('alertVuManChu'))        document.getElementById('alertVuManChu').value           = cfg.vuManChu ?? 'info';
  if (document.getElementById('alertMacroContext'))    document.getElementById('alertMacroContext').checked     = cfg.macroContextAlerts !== false;
  if (document.getElementById('alertDailyTone'))       document.getElementById('alertDailyTone').checked        = cfg.dailyToneAlerts !== false;
  document.getElementById('alertPairs').value          = (cfg.pairs ?? []).join(', ');

  // Load saved bot status
  loadBotStatus();

  overlay.classList.add('open');
}

export function closeAlertModal() {
  document.getElementById('alertModalOverlay')?.classList.remove('open');
}

export function saveAlertModal() {
  const cfg = {
    enabled:        document.getElementById('alertEnabled').checked,
    browserEnabled: document.getElementById('alertBrowserEnabled').checked,
    serverEnabled:  document.getElementById('alertServerEnabled').checked,
    minGrade:    document.getElementById('alertMinGrade').value || 'B',
    cooldownMin: parseInt(document.getElementById('alertCooldown').value) || 60,
    onlyAligned:         document.getElementById('alertOnlyAligned').checked,
    regimeChangeAlerts:  document.getElementById('alertRegimeChange')?.checked !== false,
    suppressBlocked:     document.getElementById('alertSuppressBlocked')?.checked ?? false,
    vuManChu:            document.getElementById('alertVuManChu')?.value ?? 'info',
    macroContextAlerts:  document.getElementById('alertMacroContext')?.checked !== false,
    dailyToneAlerts:     document.getElementById('alertDailyTone')?.checked !== false,
    flipCandles: parseInt(document.getElementById('alertFlipCandles')?.value) || 3,
    proxPips: {
      default:        parseFloat(document.getElementById('alertProxDefault').value) || 5,
      'XAU/USD':      parseFloat(document.getElementById('alertProxGold').value)   || 8,
      'NAS100_USD':   parseFloat(document.getElementById('alertProxNas').value)    || 30,
    },
    pairs: document.getElementById('alertPairs').value
      .split(',').map(s => s.trim()).filter(Boolean),
  };
  saveAlertCfg(cfg);

  const statusEl = document.getElementById('alertModalStatus');
  if (statusEl) {
    statusEl.textContent = '✓ Alert config saved';
    statusEl.className = 'alert-modal-status ok';
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
  }
}

export async function saveTelegramCreds() {
  const token  = document.getElementById('alertBotToken')?.value?.trim() || '';
  const chatId = document.getElementById('alertChatId')?.value?.trim()  || '';
  const statusEl = document.getElementById('alertModalStatus');

  if (!token || !chatId) {
    if (statusEl) { statusEl.textContent = '⚠ Bot token and chat ID are both required'; statusEl.className = 'alert-modal-status err'; }
    return;
  }

  if (statusEl) { statusEl.textContent = 'Saving…'; statusEl.className = 'alert-modal-status'; }

  try {
    const res = await fetch('/api/telegram/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, chatId }),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'Save failed');
    if (statusEl) { statusEl.textContent = '✓ Telegram credentials saved'; statusEl.className = 'alert-modal-status ok'; }
  } catch(e) {
    if (statusEl) { statusEl.textContent = '⚠ ' + e.message; statusEl.className = 'alert-modal-status err'; }
  }
}

export async function sendTestAlert() {
  const statusEl = document.getElementById('alertModalStatus');
  const cfg = loadAlertCfg();
  if (!cfg.enabled || cfg.browserEnabled === false) {
    if (statusEl) { statusEl.textContent = '— Browser alerts are off — nothing sent'; statusEl.className = 'alert-modal-status'; }
    return;
  }
  if (statusEl) { statusEl.textContent = 'Sending browser test…'; statusEl.className = 'alert-modal-status'; }
  try {
    const res = await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '✅ <b>Regime Dashboard (browser)</b> — browser alerts connected!', parseMode: 'HTML' }),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'Send failed');
    if (statusEl) { statusEl.textContent = '✓ Browser test sent — check Telegram'; statusEl.className = 'alert-modal-status ok'; }
  } catch(e) {
    if (statusEl) { statusEl.textContent = '⚠ ' + e.message; statusEl.className = 'alert-modal-status err'; }
  }
}

export async function sendTestServerAlert() {
  const statusEl = document.getElementById('alertModalStatus');
  const cfg = loadAlertCfg();
  if (!cfg.enabled || cfg.serverEnabled === false) {
    if (statusEl) { statusEl.textContent = '— Server alerts are off — nothing sent'; statusEl.className = 'alert-modal-status'; }
    return;
  }
  if (statusEl) { statusEl.textContent = 'Sending server test…'; statusEl.className = 'alert-modal-status'; }
  try {
    const res = await fetch('/api/telegram/test-server', { method: 'POST' });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'Send failed');
    if (statusEl) { statusEl.textContent = '✓ Server test sent — check Telegram'; statusEl.className = 'alert-modal-status ok'; }
  } catch(e) {
    if (statusEl) { statusEl.textContent = '⚠ ' + e.message; statusEl.className = 'alert-modal-status err'; }
  }
}

async function loadBotStatus() {
  const statusEl = document.getElementById('alertBotStatus');
  if (!statusEl) return;
  try {
    const res = await fetch('/api/telegram/config');
    const j   = await res.json();
    if (j.configured) {
      statusEl.textContent = `✓ Bot configured · Chat ID: ${j.chatId}`;
      statusEl.className   = 'alert-bot-status ok';
    } else {
      statusEl.textContent = '⚠ Not configured — enter token and chat ID below';
      statusEl.className   = 'alert-bot-status warn';
    }
  } catch(e) {
    statusEl.textContent = '— Could not check bot status';
    statusEl.className   = 'alert-bot-status';
  }
}

// ── Force KV sync ─────────────────────────────────────────────────────────────
// Clears per-pair throttle timers so next checkAndSendAlerts() call immediately
// re-pushes all entry data to KV. Used after OI update or manual button press.
export async function forceKVSync() {
  for (const p of PAIRS) {
    _kvEntrySyncTimes.set(p.symbol, 0);
  }
  _alertsLastRun = 0; // bypass the 5s throttle so the KV writes actually fire
  try {
    await checkAndSendAlerts();
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Gold Macro Model Alert System ─────────────────────────────────────────────
// Fires Telegram alerts when the gold macro regime or signal crosses meaningful
// thresholds — distinct from price-proximity alerts. These are macro-event alerts:
//
//   1. Regime change      — fired when regime classification changes
//   2. Signal threshold   — fired when signal crosses NEUTRAL ↔ BULLISH/BEARISH
//   3. Transition warning — fired when regime confidence drops to LOW
//   4. Uncertainty spike  — fired when BEI decomp shows uncertainty premium expanding
//
// Cooldowns stored under 'tg_gold_cooldowns' in localStorage (separate from price alerts).

const GOLD_COOLDOWN_KEY = 'tg_gold_cooldowns';

function loadGoldCooldowns() {
  try { return JSON.parse(localStorage.getItem(GOLD_COOLDOWN_KEY) || '{}'); } catch(e) { return {}; }
}

function saveGoldCooldowns(cd) {
  try { localStorage.setItem(GOLD_COOLDOWN_KEY, JSON.stringify(cd)); } catch(e) {}
}

// Rate-limit: gold macro alerts at most once per minute per alert type
let _goldAlertLastRun = 0;
const GOLD_ALERT_THROTTLE_MS = 60_000;

// Previous model snapshot for change detection
let _prevGoldModel = null;

// Check gold macro alerts — call after FRED data loads (not every tick)
export async function checkGoldMacroAlerts() {
  const cfg = loadAlertCfg();
  // Only fire if alerts enabled and XAU/USD is in the watch list (or all pairs watched)
  if (!cfg.enabled) return;
  const watchesGold = !cfg.pairs?.length || cfg.pairs.includes('XAU/USD');
  if (!watchesGold) return;

  const now = Date.now();
  if (now - _goldAlertLastRun < GOLD_ALERT_THROTTLE_MS) return;
  _goldAlertLastRun = now;

  // Compute gold model (use current vol regime + ARIMA stability if available)
  const volRegime = (() => { try { return calculateVolRegime(); } catch(e) { return null; } })();
  const goldBars  = S.ohlcData?.['XAU/USD']?.values ?? null;
  const goldArima = (() => { try { return computeArimaContext(goldBars, 'XAU/USD'); } catch(e) { return null; } })();
  const model     = computeGoldMacroModel(volRegime, null, goldArima?.residualStability ?? null);
  if (!model) return;

  const cd = loadGoldCooldowns();
  let dirty = false;

  // ── 1. Regime change alert ───────────────────────────────────────────────
  const regimeCooldownKey = `gold_regime_${model.regime}`;
  const REGIME_COOLDOWN = 4 * 60 * 60 * 1000; // 4 hours
  const regimeChanged = _prevGoldModel && _prevGoldModel.regime !== model.regime;
  const regimeCooledDown = now - (cd[regimeCooldownKey] ?? 0) > REGIME_COOLDOWN;

  if (regimeChanged && regimeCooledDown) {
    cd[regimeCooldownKey] = now;
    dirty = true;
    await sendGoldRegimeAlert(model, _prevGoldModel.regimeLabel || _prevGoldModel.regime);
  }

  // ── 2. Signal crossing alert ─────────────────────────────────────────────
  const signalCooldownKey = `gold_signal_${model.signal}_${model.strength}`;
  const SIGNAL_COOLDOWN = 2 * 60 * 60 * 1000; // 2 hours
  const signalChanged = _prevGoldModel
    && (_prevGoldModel.signal !== model.signal
        || (_prevGoldModel.signal === 'NEUTRAL' && model.signal !== 'NEUTRAL')
        || (model.strength === 'STRONG' && _prevGoldModel.strength !== 'STRONG'));
  const signalCooledDown = now - (cd[signalCooldownKey] ?? 0) > SIGNAL_COOLDOWN;

  if (signalChanged && signalCooledDown && model.signal !== 'NEUTRAL') {
    cd[signalCooldownKey] = now;
    dirty = true;
    await sendGoldSignalAlert(model);
  }

  // ── 3. Regime transition warning ─────────────────────────────────────────
  const transitionKey = 'gold_transition_warning';
  const TRANSITION_COOLDOWN = 6 * 60 * 60 * 1000; // 6 hours
  const transitionAlert = model.regimeConfidence.isTransitioning
    && now - (cd[transitionKey] ?? 0) > TRANSITION_COOLDOWN;

  if (transitionAlert) {
    cd[transitionKey] = now;
    dirty = true;
    await sendGoldTransitionAlert(model);
  }

  // ── 4. Uncertainty premium spike alert ───────────────────────────────────
  const uncertaintyKey = 'gold_uncertainty_spike';
  const UNCERTAINTY_COOLDOWN = 3 * 60 * 60 * 1000; // 3 hours
  const beiDecomp = model.beiDecomp;
  const uncertaintySpike = beiDecomp?.dominantDriver === 'uncertainty_premium'
    && beiDecomp.divergence > 0.08
    && now - (cd[uncertaintyKey] ?? 0) > UNCERTAINTY_COOLDOWN;

  if (uncertaintySpike) {
    cd[uncertaintyKey] = now;
    dirty = true;
    await sendGoldUncertaintyAlert(model);
  }

  if (dirty) saveGoldCooldowns(cd);

  // Store current model as previous for next check
  _prevGoldModel = { regime: model.regime, regimeLabel: model.regimeLabel, signal: model.signal, strength: model.strength };

  // Always sync gold model to KV so the bot can read it
  syncGoldModelToKV(model);
}

// Sync gold model result to KV for the Python bot
function syncGoldModelToKV(model) {
  const payload = {
    regime:           model.regime,
    regimeLabel:      model.regimeLabel,
    regimeBias:       model.regimeBias,
    signal:           model.signal,
    strength:         model.strength,
    goldScore:        model.goldScore,
    t1Score:          model.t1Score,
    confidence:       model.regimeConfidence.confidence,
    sizeMult:         model.regimeConfidence.sizeMult,
    isTransitioning:  model.regimeConfidence.isTransitioning,
    transitionScore:  model.regimeConfidence.transitionScore,
    transitionSignals: model.regimeConfidence.signals,
    tips:             model.tips,
    tipsMom:          model.tipsMom,
    bei:              model.bei,
    beiMom:           model.beiMom,
    dxyMom:           model.dxyMom,
    vix:              model.vix,
    fedPricingSignal: model.fedPricingSignal,
    beiDecompDriver:  model.beiDecomp?.dominantDriver,
    arimaStability:   model.arimaStability ?? null,
    computedAt:       model.computedAt,
  };

  fetch('/api/kv/set', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'ai_goldmodel', data: payload, timestamp: Date.now() }),
  }).catch(() => {});
}

// ── Gold Alert Message Formatters ──────────────────────────────────────────────

async function sendGoldRegimeAlert(model, prevRegimeLabel) {
  const biasEmoji = model.regimeBias === 'BULLISH' ? '↑' : model.regimeBias === 'BEARISH' ? '↓' : '↕';
  const regimeLine = `${model.regimeEmoji} <b>${prevRegimeLabel}</b> → <b>${model.regimeLabel}</b>`;
  const plainLine  = `${model.regimeDescription} Gold outlook shifts to <b>${model.regimeBias}</b> ${biasEmoji}`;
  await _sendGoldAlert(model, regimeLine, '📊 GOLD — MACRO CONTEXT SHIFT', plainLine);
}

async function sendGoldSignalAlert(model) {
  const arrow = model.signal === 'BULLISH' ? '↑' : '↓';
  const sigLine = `Signal: ${arrow} <b>${model.signal} ${model.strength}</b> (score: ${(model.goldScore * 100).toFixed(0)}%)`;
  await _sendGoldAlert(model, sigLine, '🥇 GOLD MACRO SIGNAL');
}

async function sendGoldTransitionAlert(model) {
  const sigList  = model.regimeConfidence.signals.slice(0, 3).join(' · ');
  const mainLine = `⚠️ <b>${model.regimeLabel}</b> regime is showing instability — reduce size (×${model.regimeConfidence.sizeMult})`;
  const plainLine = `Signals are conflicting within the current regime. Not a confirmed flip yet — the model is losing confidence in its own read. Stay defensive until the picture clears.`;
  const arimaLine = model.arimaStability != null ? (() => {
    const pct = (model.arimaStability * 100).toFixed(0);
    const ico = model.arimaStability < 0.50 ? '🔴' : model.arimaStability < 0.70 ? '🟡' : '✅';
    const lbl = model.arimaStability < 0.50 ? 'low — price residuals are erratic' : model.arimaStability < 0.70 ? 'moderate' : 'stable';
    return `Price trend reliability: ${pct}% ${ico} (${lbl})`;
  })() : null;
  const detailLine = [plainLine, sigList || null, arimaLine].filter(Boolean).join('\n') || null;
  await _sendGoldAlert(model, mainLine, '📊 GOLD — MACRO CONTEXT TRANSITION', detailLine);
}

async function sendGoldUncertaintyAlert(model) {
  const div = model.beiDecomp?.divergence;
  const mainLine = `BEI diverging from TIPS: +${div != null ? (div * 100).toFixed(0) : '?'}bp — inflation uncertainty premium`;
  await _sendGoldAlert(model, mainLine, '📊 GOLD BEI UNCERTAINTY SPIKE');
}

async function _sendGoldAlert(model, headline, title, extraLine) {
  const layers = model.layers;
  const beiD   = model.beiDecomp;

  const layerLines = [
    // Layer 1: Levels
    `<b>Layer 1 — Structure (Levels)</b>`,
    layers.level.realYield.label  ? `  Real Yield: ${layers.level.realYield.label}` : null,
    layers.level.breakeven.label  ? `  BEI: ${layers.level.breakeven.label}` : null,
    ``,
    // Layer 2: Momentum (the alpha layer)
    `<b>Layer 2 — Repricing Alpha (Momentum)</b>`,
    layers.momentum.realYield.label ? `  ${layers.momentum.realYield.label}` : null,
    layers.momentum.breakeven.label ? `  ${layers.momentum.breakeven.label}` : null,
    layers.momentum.dxy.label       ? `  ${layers.momentum.dxy.label}` : null,
    layers.momentum.safeHaven.label ? `  ${layers.momentum.safeHaven.label}` : null,
  ].filter(v => v != null);

  const beiLine = beiD?.interpretation
    ? `BEI Decomp: ${beiD.interpretation}`
    : null;

  const confBadge = model.regimeConfidence.confidence === 'HIGH'   ? '✅ Model confidence: High — signals are aligned'
                  : model.regimeConfidence.confidence === 'MEDIUM' ? '🟡 Model confidence: Medium — some signal noise'
                  : '🔴 Model confidence: Low — regime is in flux';

  const weightHighlight = (() => {
    const w = model.weights;
    const top = Object.entries(w).sort((a, b) => b[1] - a[1])[0];
    const labels = {
      realYieldMomentum: 'Real Yield Momentum',
      breakevenMomentum: 'BEI Momentum',
      safeHaven: 'Safe Haven Demand',
      breakevenLevel: 'BEI Level',
      realYieldLevel: 'Real Yield Level',
      dxyMomentum: 'DXY Momentum',
    };
    return top ? `What's driving gold: ${labels[top[0]] ?? top[0]} (${(top[1] * 100).toFixed(0)}% weight)` : null;
  })();

  const lines = [
    `🥇 <b>${title}</b>`,
    headline,
    extraLine ?? null,
    `${model.regimeEmoji} Regime: ${model.regimeLabel}`,
    ``,
    ...layerLines,
    ``,
    beiLine,
    weightHighlight,
    confBadge,
    model.fedPricingSignal ? `Fed Pricing: ${model.fedPricingSignal}` : null,
    model.nfciSignal ? `NFCI: ${model.nfciSignal}` : null,
    `⏱ Timescale: weekly/monthly · FRED macro data`,
  ].filter(v => v != null).join('\n');

  try {
    const res = await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: lines, parseMode: 'HTML' }),
    });
    const j = await res.json();
    if (!j.ok) console.warn('Gold macro alert failed:', j.error);
  } catch(e) {
    console.warn('Gold macro alert error:', e.message);
  }
}

// Push current gold model to KV on demand (e.g., after user updates FRED data)
export async function syncGoldModelNow() {
  const volRegime = (() => { try { return calculateVolRegime(); } catch(e) { return null; } })();
  const model = computeGoldMacroModel(volRegime);
  if (model) {
    syncGoldModelToKV(model);
    S.goldModel = model;
  }
  return model;
}

// ── FX Macro Regime Alerts ─────────────────────────────────────────────────────
// Fires Telegram alerts when any FX pair's macro regime or confidence crosses
// meaningful thresholds. Separate cooldown store from gold/price alerts.
//
//   1. Regime flip         — fired when regime classification changes (4h cooldown per pair+regime)
//   2. Transition warning  — fired when regime confidence drops to LOW (6h cooldown per pair)
//
// Cooldowns stored under 'fx_macro_cooldowns' in localStorage.

const FX_COOLDOWN_KEY = 'fx_macro_cooldowns'
const FX_THROTTLE_MS  = 60_000

let _fxAlertLastRun = 0
const _prevFXModels  = {} // { 'EUR/USD': { regime, regimeLabel, signal, strength } }

function loadFXCooldowns() {
  try { return JSON.parse(localStorage.getItem(FX_COOLDOWN_KEY) || '{}') } catch { return {} }
}

function saveFXCooldowns(cd) {
  try { localStorage.setItem(FX_COOLDOWN_KEY, JSON.stringify(cd)) } catch {}
}

// Check FX macro alerts — call after FRED data loads (not every price tick)
export async function checkFXMacroAlerts() {
  const cfg = loadAlertCfg()
  if (!cfg.enabled) return
  if (cfg.macroContextAlerts === false) return

  const now = Date.now()
  if (now - _fxAlertLastRun < FX_THROTTLE_MS) return
  _fxAlertLastRun = now

  const cd = loadFXCooldowns()
  let dirty = false

  for (const pair of Object.keys(PAIR_DRIVERS)) {
    const watchesPair = !cfg.pairs?.length || cfg.pairs.includes(pair)
    if (!watchesPair) continue

    const model = computeFXMacroModel(pair)
    if (!model) continue

    const prev = _prevFXModels[pair]

    // 1. Regime flip (4h cooldown per pair+regime)
    const flipKey = `fx_regime_${pair}_${model.regime}`
    const REGIME_COOLDOWN = 4 * 60 * 60 * 1000
    if (prev && prev.regime !== model.regime && now - (cd[flipKey] ?? 0) > REGIME_COOLDOWN) {
      cd[flipKey] = now
      dirty = true
      await sendFXRegimeAlert(pair, model, prev.regimeLabel)
    }

    // 2. Transition warning (6h cooldown per pair)
    const transKey = `fx_transition_${pair}`
    const TRANSITION_COOLDOWN = 6 * 60 * 60 * 1000
    if (model.regimeConfidence.isTransitioning && now - (cd[transKey] ?? 0) > TRANSITION_COOLDOWN) {
      cd[transKey] = now
      dirty = true
      await sendFXTransitionAlert(pair, model)
    }

    _prevFXModels[pair] = {
      regime:      model.regime,
      regimeLabel: model.regimeLabel,
      signal:      model.signal,
      strength:    model.strength,
    }
  }

  if (dirty) saveFXCooldowns(cd)
}

// ── FX Alert Message Formatters ────────────────────────────────────────────────

async function sendFXRegimeAlert(pair, model, prevLabel) {
  const headline = `${model.regimeEmoji} ${prevLabel} → <b>${model.regimeLabel}</b>\n${model.regimeSummary}`
  await _sendFXAlert(pair, model, headline, `📊 ${pair} — MACRO CONTEXT SHIFT`)
}

async function sendFXTransitionAlert(pair, model) {
  const sigList  = model.regimeConfidence.signals.slice(0, 3).join(' · ')
  const headline = [
    `${model.regimeEmoji} <b>${model.regimeLabel}</b> — regime instability detected`,
    `⚠️ Transitioning — reduce size (×${model.regimeConfidence.sizeMult})`,
    model.regimeSummary,
    sigList || null,
  ].filter(Boolean).join('\n')
  await _sendFXAlert(pair, model, headline, `📊 ${pair} — MACRO CONTEXT TRANSITION`)
}

async function _sendFXAlert(pair, model, headline, title) {
  const f   = model.factors
  const cfg = model.cfg

  // ── Rate differential section ────────────────────────────────────────────
  const base    = S.fredData?.[cfg.baseRateKey]?.value
  const quote   = S.fredData?.[cfg.quoteRateKey]?.value
  const baseStr  = base  != null ? `${cfg.baseName} ${base.toFixed(2)}%`  : `${cfg.baseName} —`
  const quoteStr = quote != null ? `${cfg.quoteName} ${quote.toFixed(2)}%` : `${cfg.quoteName} —`

  const rateDiffLine = f.rateDiff.label
    ? `  ${f.rateDiff.label}`
    : `  ${baseStr} vs ${quoteStr}`

  const rateLines = [
    `<b>Rate Differential (${cfg.baseName} vs ${cfg.quoteName})</b>`,
    `  ${baseStr} vs ${quoteStr}`,
    rateDiffLine !== `  ${baseStr} vs ${quoteStr}` ? rateDiffLine : null,
  ].filter(Boolean)

  // ── Market environment section ────────────────────────────────────────────
  const vixStr = f.risk.vix != null ? `VIX ${f.risk.vix.toFixed(0)}` : 'VIX —'
  const hyStr  = f.risk.hyBps != null ? `HY ${Math.round(f.risk.hyBps)}bp` : 'HY —'
  const envLines = [
    `<b>Market Environment</b>`,
    `  ${vixStr} · ${hyStr}`,
    f.risk.label ? `  ${f.risk.label}` : null,
  ]

  // ── Commodity section (pair-specific) ────────────────────────────────────
  const commLines = f.commodity && f.commodity.wti != null ? [
    ``,
    `<b>Commodity (WTI)</b>`,
    f.commodity.label ? `  ${f.commodity.label}` : null,
  ] : []

  // ── Confidence badge and bias ─────────────────────────────────────────────
  const confBadge = model.regimeConfidence.confidence === 'HIGH'   ? '✅ HIGH confidence'
                  : model.regimeConfidence.confidence === 'MEDIUM' ? '🟡 MEDIUM confidence'
                  : '🔴 LOW confidence — regime transitioning'

  const biasEmoji = model.regimeBias === 'BULLISH' ? '↑' : model.regimeBias === 'BEARISH' ? '↓' : '↔'
  const biasLine  = `${biasEmoji} Pair bias: <b>${model.regimeBias}</b>`

  const pairLink = `<a href="${window.location.origin}?pair=${pair.replace('/', '')}">Open ${pair} →</a>`

  const lines = [
    `💱 <b>${title}</b>`,
    headline,
    ``,
    `${model.regimeEmoji} Regime: ${model.regimeLabel}`,
    ``,
    ...rateLines,
    ``,
    ...envLines,
    ...commLines,
    ``,
    confBadge,
    biasLine,
    model.regimeConfidence.isTransitioning && model.regimeConfidence.signals.length
      ? `Signals: ${model.regimeConfidence.signals.slice(0, 2).join(' · ')}`
      : null,
    `⏱ Timescale: weekly/monthly · structural backdrop`,
    pairLink,
  ].filter(v => v != null).join('\n')

  try {
    const res = await fetch('/api/telegram', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message: lines, parseMode: 'HTML' }),
    })
    const j = await res.json()
    if (!j.ok) console.warn(`FX macro alert failed (${pair}):`, j.error)
  } catch(e) {
    console.warn(`FX macro alert error (${pair}):`, e.message)
  }
}

// ── FX Daily Tone Alerts ────────────────────────────────────────────────────
// Fast layer: fires when intraday/daily tone shifts using live OHLC bars.
// Complements the slow FRED macro model. Updates at daily bar cadence.
// Label: ⚡ — distinguishes from 📊 structural alerts.

const FX_TONE_COOLDOWN_KEY = 'fx_tone_cooldowns'
const _prevFXToneModels    = {}

// 90-minute run throttle
let _fxToneLastRun = 0
const FX_TONE_THROTTLE_MS = 90 * 60 * 1000

function loadFXToneCooldowns() {
  try { return JSON.parse(localStorage.getItem(FX_TONE_COOLDOWN_KEY) || '{}') } catch { return {} }
}

function saveFXToneCooldowns(cd) {
  try { localStorage.setItem(FX_TONE_COOLDOWN_KEY, JSON.stringify(cd)) } catch {}
}

export async function checkFXDailyToneAlerts() {
  const cfg = loadAlertCfg()
  if (!cfg.enabled) return
  if (cfg.dailyToneAlerts === false) return

  const now = Date.now()
  if (now - _fxToneLastRun < FX_TONE_THROTTLE_MS) return
  _fxToneLastRun = now

  // Reset shared risk barometer cache so all pairs use same snapshot
  resetRiskBarometerCache()

  const cd = loadFXToneCooldowns()
  let dirty = false

  for (const pair of Object.keys(PAIR_DRIVERS)) {
    const watchesPair = !cfg.pairs?.length || cfg.pairs.includes(pair)
    if (!watchesPair) continue

    const model = computeFXDailyTone(pair)
    if (!model) continue

    const prev = _prevFXToneModels[pair]
    const prevLabel = prev?.regimeLabel ?? null

    // Regime flip: 3h cooldown per pair+regime
    const TONE_COOLDOWN = 3 * 60 * 60 * 1000
    const flipKey = `fx_tone_${pair.replace('/', '')}_${model.regime}`
    const regimeChanged = prev && prev.regime !== model.regime
    const cooledDown    = now - (cd[flipKey] ?? 0) > TONE_COOLDOWN

    if (regimeChanged && cooledDown) {
      cd[flipKey] = now
      dirty = true
      await _sendFXToneAlert(pair, model, prevLabel)
    }

    _prevFXToneModels[pair] = {
      regime:      model.regime,
      regimeLabel: model.regimeLabel,
    }
  }

  if (dirty) saveFXToneCooldowns(cd)
}

async function _sendFXToneAlert(pair, model, prevLabel) {
  const toneEmoji = model.regimeEmoji
  const toneLabel = model.regimeLabel

  const prevLine = prevLabel ? `${prevLabel} → ` : ''
  const toneLine = `${prevLine}${toneEmoji} ${toneLabel}`

  const biasEmoji = model.bias === 'BULLISH' ? '↑' : model.bias === 'BEARISH' ? '↓' : '↔'
  const biasLine  = `${biasEmoji} ${pair} session bias: <b>${model.bias}</b>`

  // Risk barometer detail lines
  const rb = model.riskBarometer
  const riskScore = rb.score != null ? rb.score.toFixed(2) : '—'
  const riskDesc  = rb.score > 0.6 ? 'risk-off flows' : rb.score < -0.6 ? 'risk-on flows' : 'mixed/neutral'
  const riskLine  = `Risk barometer: ${riskScore} (${riskDesc})`

  const fmt = (z, name) => z != null
    ? `  ${name} 5d: ${z >= 0 ? '+' : ''}${z.toFixed(2)}σ · ${z > 0.3 ? 'rising' : z < -0.3 ? 'falling' : 'flat'}`
    : null

  const compLines = [
    fmt(rb.components.audjpy, 'AUD/JPY'),
    fmt(rb.components.xauusd, 'Gold'),
  ].filter(Boolean)

  const pairLink = `<a href="${window.location.origin}?pair=${pair.replace('/', '')}">Open ${pair} →</a>`

  const lines = [
    `⚡ <b>${pair} — DAILY MARKET TONE</b>`,
    toneLine,
    model.description,
    biasLine,
    ``,
    riskLine,
    ...compLines,
    ``,
    `⏱ Timescale: daily/session · updated with bar close`,
    pairLink,
  ].filter(v => v != null).join('\n')

  try {
    const res = await fetch('/api/telegram', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message: lines, parseMode: 'HTML' }),
    })
    const j = await res.json()
    if (!j.ok) console.warn(`FX tone alert failed (${pair}):`, j.error)
  } catch(e) {
    console.warn(`FX tone alert error (${pair}):`, e.message)
  }
}

// ── Send all macro snapshots now (bypasses cooldowns) ─────────────────────────
// Called from the Alerts modal "Snapshot All" button. Loops every watched pair,
// ensures daily OHLC is loaded, then fires one rich combined message per pair.
// Rate-limited at ~500ms between sends.
export async function sendAllMacroSnapshotsNow(onProgress) {
  const cfg       = loadAlertCfg()
  const allPairs  = Object.keys(PAIR_DRIVERS)
  const watchPairs = cfg.pairs?.length
    ? cfg.pairs.filter(p => allPairs.includes(p))
    : allPairs

  // ── Pass 1: pre-load daily OHLC for every pair ───────────────────────────
  // computeFXDailyTone requires S.ohlcData[pair].values (≥35 bars).
  // Background SSE streams only open price quotes — OHLC must be fetched here.
  if (typeof window.loadPairDataForAnalysis === 'function') {
    for (let i = 0; i < watchPairs.length; i++) {
      const pair = watchPairs[i]
      if (onProgress) onProgress(`Loading ${pair} (${i + 1}/${watchPairs.length})…`)
      try { await window.loadPairDataForAnalysis(pair) } catch(e) {}
    }
  }

  // Reset barometer once — all tone computations share the same market snapshot
  resetRiskBarometerCache()

  const ts = new Date().toUTCString().replace(' GMT', ' UTC')
  let sent = 0

  // ── Pass 2: compute models and send ─────────────────────────────────────
  for (let i = 0; i < watchPairs.length; i++) {
    const pair = watchPairs[i]

    const macro = computeFXMacroModel(pair)
    const tone  = computeFXDailyTone(pair)

    const pairLink = `<a href="${window.location.origin}?pair=${pair.replace('/', '')}">Open ${pair} →</a>`

    // ── Structural section ───────────────────────────────────────────────────
    let structLines = []
    if (macro) {
      const f   = macro.factors
      const pcfg = macro.cfg
      const base  = S.fredData?.[pcfg.baseRateKey]?.value
      const quote = S.fredData?.[pcfg.quoteRateKey]?.value
      const rateStr = (base != null && quote != null)
        ? `${pcfg.baseName} ${base.toFixed(2)}% vs ${pcfg.quoteName} ${quote.toFixed(2)}%`
        : `${pcfg.baseName} — vs ${pcfg.quoteName} —`
      const vixStr = f.risk.vix != null ? `VIX ${f.risk.vix.toFixed(0)}` : 'VIX —'
      const hyStr  = f.risk.hyBps != null ? `HY ${Math.round(f.risk.hyBps)}bp` : 'HY —'
      const conf   = macro.regimeConfidence.confidence === 'HIGH'   ? '✅ HIGH'
                   : macro.regimeConfidence.confidence === 'MEDIUM' ? '🟡 MEDIUM'
                   : '🔴 LOW — transitioning'
      const biasEmoji = macro.regimeBias === 'BULLISH' ? '↑' : macro.regimeBias === 'BEARISH' ? '↓' : '↔'
      structLines = [
        `<b>📊 Structural</b> <i>(weekly/monthly)</i>`,
        `${macro.regimeEmoji} ${macro.regimeLabel}`,
        macro.regimeSummary,
        rateStr,
        `${vixStr} · ${hyStr}`,
        f.risk.label ?? null,
        f.commodity?.label ?? null,
        `${biasEmoji} Bias: <b>${macro.regimeBias}</b> · ${conf}`,
      ]
    } else {
      structLines = [`<b>📊 Structural</b>`, `— no FRED data loaded`]
    }

    // ── Daily tone section ───────────────────────────────────────────────────
    let toneLines = []
    if (tone) {
      const rb = tone.riskBarometer
      const riskScore = rb.score != null ? rb.score.toFixed(2) : '—'
      const riskDesc  = rb.score > 0.6 ? 'risk-off' : rb.score < -0.6 ? 'risk-on' : 'neutral'
      const biasEmoji = tone.bias === 'BULLISH' ? '↑' : tone.bias === 'BEARISH' ? '↓' : '↔'
      const pairZLine = tone.pairZ != null
        ? `Pair momentum: ${tone.pairZ >= 0 ? '+' : ''}${tone.pairZ.toFixed(2)}σ`
        : null
      toneLines = [
        `<b>⚡ Daily Tone</b> <i>(session)</i>`,
        `${tone.regimeEmoji} ${tone.regimeLabel}`,
        tone.description,
        `${biasEmoji} Bias: <b>${tone.bias}</b>`,
        `Risk barometer: ${riskScore} (${riskDesc})`,
        pairZLine,
      ]
    } else {
      toneLines = [`<b>⚡ Daily Tone</b>`, `— OHLC data not yet loaded`]
    }

    const lines = [
      `💱 <b>${pair} — MACRO SNAPSHOT</b>`,
      ``,
      ...structLines,
      ``,
      ...toneLines,
      ``,
      `⏱ Snapshot: ${ts}`,
      pairLink,
    ].filter(v => v != null).join('\n')

    if (onProgress) onProgress(`Sending ${pair} (${i + 1}/${watchPairs.length})…`)

    try {
      const res = await fetch('/api/telegram', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: lines, parseMode: 'HTML' }),
      })
      const j = await res.json()
      if (j.ok) sent++
      else console.warn(`Snapshot failed (${pair}):`, j.error)
    } catch(e) {
      console.warn(`Snapshot error (${pair}):`, e.message)
    }

    if (i < watchPairs.length - 1) await new Promise(r => setTimeout(r, 500))
  }

  return sent
}
