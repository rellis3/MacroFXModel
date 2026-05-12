// ============================================================
// macrofx-cron — Cloudflare Worker (scheduled / cron trigger)
//
// Reads entry levels computed by the browser dashboard and
// stored in KV, fetches live OANDA prices, and fires Telegram
// alerts when price approaches a high-confluence level.
//
// Shares the FX_SCORES KV namespace with the Pages worker.
// No HTTP handler — cron-only (no public URL exposed).
//
// Required secrets:  OANDA_KEY, OANDA_ENV ("live" | "practice")
// Optional secrets:  OANDA_ACCOUNT_ID  (enables real-time pricing endpoint)
// ============================================================

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD',
  'NZD/USD', 'USD/CAD', 'USD/CHF', 'XAU/USD', 'NAS100_USD',
];

const PIP_SIZE = {
  'EUR/USD': 0.0001, 'GBP/USD': 0.0001, 'AUD/USD': 0.0001,
  'NZD/USD': 0.0001, 'USD/CAD': 0.0001, 'USD/CHF': 0.0001,
  'GBP/JPY': 0.01,   'USD/JPY': 0.01,
  'XAU/USD': 1.0,    'NAS100_USD': 1.0,
};

const PRICE_DIGITS = {
  'USD/JPY': 3, 'GBP/JPY': 3, 'XAU/USD': 2, 'NAS100_USD': 1,
};

const DEFAULT_CFG = {
  enabled:     false,
  minStars:    4,
  pairs:       [],
  proxPips:    { default: 5, 'XAU/USD': 8, 'NAS100_USD': 30 },
  cooldownMin: 60,
  onlyAligned: false,
};

// Entries saved by browser are considered stale after 12 hours.
// After this, the cron stops alerting for that pair until browser re-syncs.
const ENTRIES_MAX_AGE_MS = 12 * 60 * 60 * 1000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getPipSize(sym)   { return PIP_SIZE[sym]      ?? 0.0001; }
function getDigits(sym)    { return PRICE_DIGITS[sym]  ?? 5; }
function toOanda(sym)      { return sym.replace('/', '_'); }
function toKVKey(sym)      { return `ai_entries_${sym.replace('/', '')}`; }

function cooldownKey(sym, price, direction, digits) {
  return `${sym.replace('/', '')}_${price.toFixed(digits)}_${direction}`;
}

// ── OANDA price fetch ─────────────────────────────────────────────────────────
// Uses account pricing endpoint when OANDA_ACCOUNT_ID is set (real-time bid/ask).
// Falls back to M1 candles endpoint (no account ID required).

async function fetchPrice(sym, env) {
  const instrument = toOanda(sym);
  const base = env.OANDA_ENV === 'practice'
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com';
  const auth = { 'Authorization': `Bearer ${env.OANDA_KEY}` };

  if (env.OANDA_ACCOUNT_ID) {
    try {
      const res = await fetch(
        `${base}/v3/accounts/${env.OANDA_ACCOUNT_ID}/pricing?instruments=${encodeURIComponent(instrument)}`,
        { headers: auth }
      );
      if (res.ok) {
        const d = await res.json();
        const p = d.prices?.[0];
        if (p?.bids?.[0] && p?.asks?.[0]) {
          const bid = parseFloat(p.bids[0].price);
          const ask = parseFloat(p.asks[0].price);
          return (bid + ask) / 2;
        }
      }
    } catch (_) {}
  }

  // Fallback: last completed M1 candle
  try {
    const res = await fetch(
      `${base}/v3/instruments/${encodeURIComponent(instrument)}/candles?count=2&granularity=M1&price=M`,
      { headers: auth }
    );
    if (!res.ok) return null;
    const d = await res.json();
    const last = d.candles?.slice(-1)[0];
    return last?.mid?.c ? parseFloat(last.mid.c) : null;
  } catch (_) {
    return null;
  }
}

// ── Telegram send ─────────────────────────────────────────────────────────────

async function sendTelegram(token, chatId, text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    const d = await res.json();
    return d.ok === true;
  } catch (_) {
    return false;
  }
}

// ── Format alert message (mirrors browser alerts.js format) ──────────────────

function formatAlert(sym, entry, currentPrice, distPips) {
  const digits  = getDigits(sym);
  const pipSz   = getPipSize(sym);
  const unit    = sym === 'NAS100_USD' ? 'pts' : 'p';
  const dir     = entry.direction === 'long' ? '↑ BUY' : '↓ SELL';
  const stars   = '⭐'.repeat(Math.min(entry.totalStars ?? 0, 5));
  const atStr   = distPips <= 0 ? 'AT LEVEL' : `${distPips}${unit} away`;

  const parts = [
    `🎯 <b>${sym} ${dir}</b> ${stars}`,
    `Level: <b>${entry.price.toFixed(digits)}</b> · ${atStr}`,
    `Current: ${currentPrice.toFixed(digits)}`,
  ];

  if (entry.tags?.length) {
    parts.push(`Tags: ${entry.tags.slice(0, 4).join(' · ')}`);
  }

  const slTp = [
    entry.sl != null ? `SL ${entry.sl.toFixed(digits)}` : null,
    entry.tp != null ? `TP ${entry.tp.toFixed(digits)}${entry.tpNote ? ` (${entry.tpNote})` : ''}` : null,
  ].filter(Boolean).join(' · ');
  if (slTp) parts.push(slTp);

  if (entry.rrRatio) parts.push(`R:R 1:${entry.rrRatio}`);

  parts.push('<i>🤖 Server alert</i>');

  return parts.join('\n');
}

// ── Main scheduled handler ────────────────────────────────────────────────────

export default {
  async scheduled(event, env, ctx) {
    if (!env.FX_SCORES || !env.OANDA_KEY) return;

    // Load Telegram credentials
    const tgRaw = await env.FX_SCORES.get('tg_config').catch(() => null);
    if (!tgRaw) return;
    const tg = JSON.parse(tgRaw);
    if (!tg?.token || !tg?.chatId) return;

    // Load alert config (synced from browser; falls back to defaults if not yet saved)
    const cfgRaw = await env.FX_SCORES.get('ai_alert_cfg').catch(() => null);
    const cfg = cfgRaw
      ? { ...DEFAULT_CFG, ...(JSON.parse(cfgRaw).data ?? {}) }
      : { ...DEFAULT_CFG };

    if (!cfg.enabled) return;

    // Load and prune cooldowns
    const cdRaw = await env.FX_SCORES.get('ai_cron_cooldowns').catch(() => null);
    const cooldowns = cdRaw ? JSON.parse(cdRaw) : {};
    const now = Date.now();
    const cutoff = now - 24 * 60 * 60 * 1000;
    for (const k of Object.keys(cooldowns)) {
      if (cooldowns[k] < cutoff) delete cooldowns[k];
    }
    let cdDirty = false;

    const watchPairs = cfg.pairs?.length ? cfg.pairs : DEFAULT_PAIRS;

    for (const sym of watchPairs) {
      // Load entries saved by the browser dashboard
      const entRaw = await env.FX_SCORES.get(toKVKey(sym)).catch(() => null);
      if (!entRaw) continue;

      let parsed;
      try { parsed = JSON.parse(entRaw); } catch (_) { continue; }

      // Skip if entries are stale (browser hasn't been open recently)
      if (!parsed.timestamp || now - parsed.timestamp > ENTRIES_MAX_AGE_MS) continue;

      const entries = parsed.data;
      if (!entries?.length) continue;

      // Fetch live price
      const price = await fetchPrice(sym, env);
      if (price == null) continue;

      const pipSz    = getPipSize(sym);
      const digits   = getDigits(sym);
      const proxPips = cfg.proxPips?.[sym] ?? cfg.proxPips?.default ?? 5;
      const proxDist = proxPips * pipSz;

      for (const entry of entries) {
        if ((entry.totalStars ?? 0) < (cfg.minStars ?? 4)) continue;
        if (cfg.onlyAligned && !entry.signalAligned) continue;
        if (!entry.direction) continue;

        const dist = Math.abs(entry.price - price);
        if (dist > proxDist) continue;

        const ck = cooldownKey(sym, entry.price, entry.direction, digits);
        const lastSent = cooldowns[ck] ?? 0;
        if (now - lastSent < (cfg.cooldownMin ?? 60) * 60 * 1000) continue;

        cooldowns[ck] = now;
        cdDirty = true;

        const distPips = Math.round(dist / pipSz);
        const msg = formatAlert(sym, entry, price, distPips);
        await sendTelegram(tg.token, tg.chatId, msg);
      }
    }

    if (cdDirty) {
      await env.FX_SCORES.put('ai_cron_cooldowns', JSON.stringify(cooldowns));
    }
  },

  // Dummy fetch handler so wrangler doesn't complain — cron-only worker
  async fetch(request) {
    return new Response('macrofx-cron: cron-only worker', { status: 200 });
  },
};
