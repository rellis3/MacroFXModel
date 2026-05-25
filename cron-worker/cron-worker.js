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
  minGrade:    'B',
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

function formatAlert(sym, entry, currentPrice, distPips, meta) {
  const digits  = getDigits(sym);
  const unit    = sym === 'NAS100_USD' ? 'pts' : 'p';
  const arrow   = meta?.approachArrow ? `${meta.approachArrow} ` : '';
  const dir     = entry.direction === 'long' ? '↑ BUY' : '↓ SELL';
  const stars   = '★'.repeat(Math.min(entry.totalStars ?? 0, 5));
  const atStr   = distPips <= 0 ? 'AT LEVEL' : `${distPips}${unit} away`;

  const parts = [
    `🎯 <b>${sym} ${arrow}${dir}</b> ${stars}`,
    `Price: <b>${entry.price.toFixed(digits)}</b> · ${atStr}`,
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

  // Signal quality score
  if (entry.signalScore != null) {
    const tier = entry.signalScore >= 65 ? 'Strong' : entry.signalScore >= 50 ? 'Moderate' : 'Weak';
    parts.push(`📊 Signal: <b>${entry.signalScore}%</b> · ${tier}`);
  }

  if (meta?.bayesStr)  parts.push(meta.bayesStr);

  if (meta?.tiersPos != null) {
    const isLong   = entry.direction === 'long';
    const agree    = isLong ? meta.tiersPos : meta.tiersNeg;
    const disagree = isLong ? meta.tiersNeg : meta.tiersPos;
    parts.push(`Regime: ${agree} agree · ${disagree} don't · ${meta.tiersNa} N/A`);
  }

  if (meta?.kalmanStr) parts.push(meta.kalmanStr);

  if (entry.rangeBias) {
    parts.push(`Range Bias: ${entry.rangeBias.confirmCount}✓ ${entry.rangeBias.conflictCount}✗`);
  }

  parts.push('<i>🤖 Cloudflare</i>');

  return parts.join('\n');
}

// ── Main scheduled handler ────────────────────────────────────────────────────

const DIAG_KEY = 'ai_cron_diag'; // KV key for last-run diagnostics

export default {
  async scheduled(event, env, ctx) {
    const runAt  = new Date().toISOString();
    const log    = [];   // human-readable trace written to KV after every run
    const alerts = [];   // alerts fired this run

    const note = (msg) => log.push(msg);

    if (!env.FX_SCORES) { note('ERROR: FX_SCORES KV not bound'); await _saveLog(env, runAt, log, alerts); return; }
    if (!env.OANDA_KEY)  { note('ERROR: OANDA_KEY secret not set'); await _saveLog(env, runAt, log, alerts); return; }

    note('Cron fired at ' + runAt);

    // Load Telegram credentials
    const tgRaw = await env.FX_SCORES.get('tg_config').catch(() => null);
    if (!tgRaw) { note('SKIP: tg_config not in KV — save Bot Token + Chat ID in Alerts modal'); await _saveLog(env, runAt, log, alerts); return; }
    const tg = JSON.parse(tgRaw);
    if (!tg?.token || !tg?.chatId) { note('SKIP: tg_config missing token or chatId'); await _saveLog(env, runAt, log, alerts); return; }
    note('Telegram config OK — chatId ' + tg.chatId);

    // Load alert config
    const cfgRaw = await env.FX_SCORES.get('ai_alert_cfg').catch(() => null);
    const cfg = cfgRaw
      ? { ...DEFAULT_CFG, ...(JSON.parse(cfgRaw).data ?? {}) }
      : { ...DEFAULT_CFG };

    note('Alert config: enabled=' + cfg.enabled + ', minGrade=' + cfg.minGrade + ', cooldown=' + cfg.cooldownMin + 'min');

    if (!cfg.enabled) {
      note('SKIP: alerts disabled in config — toggle Enabled in the Alerts modal');
      await _saveLog(env, runAt, log, alerts);
      return;
    }

    // Load and prune cooldowns
    const cdRaw = await env.FX_SCORES.get('ai_cron_cooldowns').catch(() => null);
    const cooldowns = cdRaw ? JSON.parse(cdRaw) : {};
    const now = Date.now();
    const cutoff = now - 24 * 60 * 60 * 1000;
    for (const k of Object.keys(cooldowns)) {
      if (cooldowns[k] < cutoff) delete cooldowns[k];
    }
    let cdDirty = false;
    note('Cooldowns loaded: ' + Object.keys(cooldowns).length + ' active');

    const watchPairs = cfg.pairs?.length ? cfg.pairs : DEFAULT_PAIRS;
    note('Watching ' + watchPairs.length + ' pairs: ' + watchPairs.join(', '));

    for (const sym of watchPairs) {
      // Load entries saved by the browser dashboard
      const entRaw = await env.FX_SCORES.get(toKVKey(sym)).catch(() => null);
      if (!entRaw) { note(sym + ': no KV entries — open dashboard with alerts enabled to sync'); continue; }

      let parsed;
      try { parsed = JSON.parse(entRaw); } catch (_) { note(sym + ': KV entries corrupt'); continue; }

      const ageMin = parsed.timestamp ? Math.round((now - parsed.timestamp) / 60000) : null;
      if (!parsed.timestamp || now - parsed.timestamp > ENTRIES_MAX_AGE_MS) {
        note(sym + ': entries stale (' + (ageMin ?? '?') + 'min old, max 720min) — open dashboard to refresh');
        continue;
      }

      // Support both legacy array format and new { entries, meta } format
      const entries = Array.isArray(parsed.data) ? parsed.data : (parsed.data?.entries ?? []);
      const meta    = Array.isArray(parsed.data) ? null         :  parsed.data?.meta ?? null;
      if (!entries?.length) { note(sym + ': 0 entries in KV'); continue; }
      note(sym + ': ' + entries.length + ' entries (' + ageMin + 'min old)' + (meta ? ' + meta' : ''));

      // Fetch live price
      const price = await fetchPrice(sym, env);
      if (price == null) { note(sym + ': OANDA price fetch failed'); continue; }

      const pipSz    = getPipSize(sym);
      const digits   = getDigits(sym);
      const proxPips = cfg.proxPips?.[sym] ?? cfg.proxPips?.default ?? 5;
      const proxDist = proxPips * pipSz;

      note(sym + ': price=' + price.toFixed(digits) + ', proximity=' + proxPips + 'p');

      let pairAlerts = 0;
      for (const entry of entries) {
        const _GO = {'A+': 5, 'A': 4, 'B': 3, 'C': 2, 'D': 1, 'SKIP': 0};
        if ((_GO[entry.grade] ?? 0) < (_GO[cfg.minGrade ?? 'B'] ?? 3)) continue;
        if (cfg.onlyAligned && !entry.signalAligned) continue;
        if (!entry.direction) continue;

        const dist = Math.abs(entry.price - price);
        const distPips = Math.round(dist / pipSz);

        if (dist > proxDist) {
          note(`  Level ${entry.price.toFixed(digits)} ${entry.direction} ${entry.totalStars}★ — ${distPips}p away (outside ${proxPips}p window)`);
          continue;
        }

        const ck = cooldownKey(sym, entry.price, entry.direction, digits);
        const lastSent = cooldowns[ck] ?? 0;
        const cooldownLeft = Math.round(((cfg.cooldownMin ?? 60) * 60000 - (now - lastSent)) / 60000);
        if (now - lastSent < (cfg.cooldownMin ?? 60) * 60 * 1000) {
          note(`  Level ${entry.price.toFixed(digits)} ${entry.direction} ${entry.totalStars}★ — ${distPips}p away, IN COOLDOWN (${cooldownLeft}min left)`);
          continue;
        }

        cooldowns[ck] = now;
        cdDirty = true;
        pairAlerts++;

        const msg = formatAlert(sym, entry, price, distPips, meta);
        const sent = await sendTelegram(tg.token, tg.chatId, msg);
        note(`  🔔 ALERT FIRED: ${entry.price.toFixed(digits)} ${entry.direction} ${entry.totalStars}★ — ${distPips}p away — Telegram ${sent ? 'OK' : 'FAILED'}`);
        alerts.push({ sym, price: entry.price, direction: entry.direction, stars: entry.totalStars, distPips, sent });
      }

      if (pairAlerts === 0) note(sym + ': no alerts triggered');
    }

    if (cdDirty) {
      await env.FX_SCORES.put('ai_cron_cooldowns', JSON.stringify(cooldowns));
    }

    note('Run complete — ' + alerts.length + ' alert(s) fired');
    await _saveLog(env, runAt, log, alerts);
  },

  // GET /diag — returns the last cron run log as JSON or plain text
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/diag') {
      if (!this._env?.FX_SCORES) {
        // Can't access env in fetch; return instructions
        return new Response(
          'macrofx-cron diagnostics\n\n' +
          'To read the last run log, check KV key "ai_cron_diag" in your Cloudflare dashboard:\n' +
          'Workers & Pages → KV → FX_SCORES → filter "ai_cron_diag"\n\n' +
          'Or add ?kv=true and bind FX_SCORES in the fetch handler.',
          { status: 200, headers: { 'Content-Type': 'text/plain' } }
        );
      }
    }
    return new Response(
      'macrofx-cron — cron-only worker\n' +
      'Last run log: check KV key "ai_cron_diag" in Cloudflare dashboard\n' +
      '  Workers & Pages → KV → FX_SCORES → search "ai_cron_diag"',
      { status: 200, headers: { 'Content-Type': 'text/plain' } }
    );
  },
};

async function _saveLog(env, runAt, log, alerts) {
  if (!env?.FX_SCORES) return;
  try {
    await env.FX_SCORES.put(DIAG_KEY, JSON.stringify({
      runAt,
      log,
      alerts,
      alertCount: alerts.length,
    }), { expirationTtl: 7200 });
  } catch(_) {}
}
