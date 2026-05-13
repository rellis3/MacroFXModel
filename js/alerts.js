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
import { filterConfluences, enhanceConfluences } from './confluences.js';
import { runSignalEngine, runEntryScanner } from './signal.js';
import { calculateVolRegime, calculatePivots } from './vol.js';

const STORAGE_KEY  = 'tg_alert_cfg';
const COOLDOWN_KEY = 'tg_alert_cooldowns';

// Throttle KV entry syncs — at most once per 5 min per pair.
// This prevents flooding KV on every SSE price tick.
const _kvEntrySyncTimes = new Map();

// Default config
const DEFAULT_CFG = {
  enabled:    false,
  minStars:   4,           // minimum totalStars to alert
  pairs:      [],          // [] = all active pairs; ['EUR/USD','XAU/USD'] = specific
  proxPips:   {            // pips from level to trigger alert
    default:  5,
    'NAS100_USD': 30,
    'XAU/USD':    8,
  },
  cooldownMin: 60,         // minutes before re-alerting the same level
  onlyAligned: false,      // if true, only alert when signal aligned with entry direction
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

export function checkAndSendAlerts() {
  const cfg = loadAlertCfg();

  // Always iterate pairs to sync entries to KV for the cron worker,
  // even when browser alerts are disabled. Browser alerts are gated
  // below by cfg.enabled. KV sync is gated by having entries at all.
  const watchSyms = cfg.pairs && cfg.pairs.length > 0
    ? cfg.pairs
    : PAIRS.map(p => p.symbol);

  const now = Date.now();
  // Only load cooldowns when browser alerts are on (saves a localStorage read otherwise)
  let cooldowns      = cfg.enabled ? pruneCooldowns(loadCooldowns()) : null;
  let cooldownsDirty = false;

  for (const sym of watchSyms) {
    const quote = window._latestQuotes?.[sym];
    if (!quote?.price) continue;

    // Need range data loaded for this pair
    const asia   = S.asiaRangeData?.[sym];
    const monday = S.mondayRangeData?.[sym];
    if (!asia || !monday) continue;

    const allConfs = [
      ...(asia.confluences   || []).map(c => ({ ...c, source: 'asia'   })),
      ...(monday.confluences || []).map(c => ({ ...c, source: 'monday' })),
    ];
    if (!allConfs.length) continue;

    // Temporarily override currentPair so vol/pivot helpers use the right symbol
    const _savedPair = S.currentPair;
    S.currentPair = PAIRS.find(p => p.symbol === sym) || _savedPair;

    let entries;
    try {
      const volRegime = calculateVolRegime();
      const pivots    = calculatePivots();
      const macroBias = (() => {
        try { return runSignalEngine(S.compassData, volRegime).bias; }
        catch(e) { return 'NEUTRAL'; }
      })();
      const filtered = filterConfluences(allConfs);
      const enhanced = enhanceConfluences(filtered, quote.price, macroBias, pivots, volRegime, 0);
      const signal   = runSignalEngine(S.compassData, volRegime);
      entries = runEntryScanner(signal, enhanced, pivots, asia, monday, quote, volRegime);
    } catch(e) {
      S.currentPair = _savedPair;
      continue;
    }
    S.currentPair = _savedPair;

    // ── KV sync for cron worker ───────────────────────────────────────────────
    // Throttled to once per 5 min per pair to avoid flooding KV on every tick.
    // Cron worker reads these to know which levels to watch while browser is closed.
    if (entries?.length) {
      const lastSync = _kvEntrySyncTimes.get(sym) ?? 0;
      if (now - lastSync > 30 * 60 * 1000) {
        _kvEntrySyncTimes.set(sym, now);
        const payload = entries.map(e => ({
          price:         e.price,
          direction:     e.direction,
          totalStars:    e.totalStars   ?? 0,
          sl:            e.sl           ?? null,
          tp:            e.tp           ?? null,
          tpNote:        e.tpNote       ?? null,
          rrRatio:       e.rrRatio      ?? null,
          tags:          (e.tags ?? []).slice(0, 4).map(t => t.label),
          signalAligned: e.signalAligned ?? false,
          rangeBias:     e.rangeBias
            ? { confirmCount: e.rangeBias.confirmCount, conflictCount: e.rangeBias.conflictCount }
            : null,
        }));
        fetch('/api/kv/set', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ key: `ai_entries_${sym.replace('/', '')}`, data: payload, timestamp: now }),
        }).catch(() => {});
      }
    }

    // ── Browser alerts ────────────────────────────────────────────────────────
    if (!cfg.enabled) continue;
    if (!entries?.length) continue;

    const pipSz    = getPipSize(sym);
    const digits   = getDigits(sym);
    const price    = quote.price;
    const proxPips = cfg.proxPips?.[sym] ?? cfg.proxPips?.default ?? 5;
    const proxDist = proxPips * pipSz;

    for (const e of entries) {
      if ((e.totalStars ?? 0) < cfg.minStars) continue;
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

      const distPips = Math.round(dist / pipSz);
      sendTelegramAlert(sym, e, price, distPips, digits).finally(() => {
        _alertsInFlight.delete(ck);
      });
    }
  }

  if (cooldownsDirty) saveCooldowns(cooldowns);
}

// ── Format + dispatch ─────────────────────────────────────────────────────────

async function sendTelegramAlert(sym, entry, currentPrice, distPips, digits) {
  const unit    = sym === 'NAS100_USD' ? 'pts' : 'p';
  const dir     = entry.direction === 'long' ? '↑ BUY' : '↓ SELL';
  const stars   = '⭐'.repeat(entry.totalStars ?? 0);
  const rrStr   = entry.rrRatio ? `R:R 1:${entry.rrRatio}` : '';
  const slStr   = entry.sl != null ? `SL ${entry.sl.toFixed(digits)}` : '';
  const tpStr   = entry.tp != null ? `TP ${entry.tp.toFixed(digits)} (${entry.tpNote ?? ''})` : '';
  const atStr   = distPips <= 0 ? 'AT LEVEL' : `${distPips}${unit} away`;

  // Top tags (first 4 to keep message short)
  const tagStr = (entry.tags ?? []).slice(0, 4).map(t => t.label).join(' · ');

  const lines = [
    `🎯 <b>${sym} ${dir}</b> ${stars}`,
    `Price: <b>${entry.price.toFixed(digits)}</b> · ${atStr}`,
    `Current: ${currentPrice.toFixed(digits)}`,
    tagStr ? `Tags: ${tagStr}` : null,
    slStr || tpStr ? [slStr, tpStr].filter(Boolean).join(' · ') : null,
    rrStr ? rrStr : null,
    entry.rangeBias ? `Range Bias: ${entry.rangeBias.confirmCount}✓ ${entry.rangeBias.conflictCount}✗` : null,
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

  document.getElementById('alertEnabled').checked      = cfg.enabled;
  document.getElementById('alertMinStars').value       = cfg.minStars;
  document.getElementById('alertCooldown').value       = cfg.cooldownMin;
  document.getElementById('alertProxDefault').value    = cfg.proxPips?.default ?? 5;
  document.getElementById('alertProxGold').value       = cfg.proxPips?.['XAU/USD'] ?? 8;
  document.getElementById('alertProxNas').value        = cfg.proxPips?.['NAS100_USD'] ?? 30;
  document.getElementById('alertOnlyAligned').checked  = cfg.onlyAligned;
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
    enabled:     document.getElementById('alertEnabled').checked,
    minStars:    parseInt(document.getElementById('alertMinStars').value) || 4,
    cooldownMin: parseInt(document.getElementById('alertCooldown').value) || 60,
    onlyAligned: document.getElementById('alertOnlyAligned').checked,
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
  if (statusEl) { statusEl.textContent = 'Sending test…'; statusEl.className = 'alert-modal-status'; }

  try {
    const res = await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '✅ <b>Regime Dashboard</b> — Telegram alerts connected successfully!', parseMode: 'HTML' }),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'Send failed');
    if (statusEl) { statusEl.textContent = '✓ Test message sent — check Telegram'; statusEl.className = 'alert-modal-status ok'; }
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
