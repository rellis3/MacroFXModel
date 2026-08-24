import { S } from './state.js';
import { pipSize as regPipSize, priceDigits as regPriceDigits } from './instrumentRegistry.js';

// ── KV cache helpers ─────────────────────────────────────────────────────────

export async function kvGet(key) {
  try {
    const res = await fetch(`/api/kv/get?key=${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const obj = await res.json();
    if (obj.miss) return null;
    return obj; // { data, timestamp }
  } catch(e) {
    return null;
  }
}

export async function kvSet(key, data) {
  try {
    await fetch('/api/kv/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, data, timestamp: Date.now() })
    });
  } catch(e) {
    console.warn('KV write failed for', key, e.message);
  }
}

export async function loadCached(key, fetchFn, maxAge, validate) {
  const localRaw = localStorage.getItem(key);
  if (localRaw) {
    try {
      const { data, timestamp } = JSON.parse(localRaw);
      if (Date.now() - timestamp < maxAge) {
        if (!validate || validate(data)) return data;
        localStorage.removeItem(key); // evict invalid cached data so next load retries
      }
    } catch(e) {}
  }

  const kvObj = await kvGet(key);
  if (kvObj && kvObj.data != null && kvObj.timestamp) {
    if (Date.now() - kvObj.timestamp < maxAge) {
      if (!validate || validate(kvObj.data)) {
        try { localStorage.setItem(key, JSON.stringify(kvObj)); } catch(e) {}
        return kvObj.data;
      }
    }
  }

  const data = await fetchFn();

  if (!validate || validate(data)) {
    const entry = { data, timestamp: Date.now() };
    try { localStorage.setItem(key, JSON.stringify(entry)); } catch(e) {}
    kvSet(key, data);
  }

  return data;
}

export function cleanupStaleSessionCaches() {
  const today = londonSessionDay();
  const datedPattern = /^(ohlc5m|ohlc15m|ohlc30m)_.+_(\d{4}-\d{2}-\d{2})$/;
  const toDrop = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    const m = k.match(datedPattern);
    if (m && m[2] !== today) toDrop.push(k);
  }
  toDrop.forEach(k => localStorage.removeItem(k));
}

export async function fetchAPI(path) {
  const response = await fetch(path);
  const text = await response.text();
  if (!response.ok) {
    let msg = `API error: ${response.status}`;
    try { const j = JSON.parse(text); if (j.error) msg = j.error; } catch (e) {}
    throw new Error(msg);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    const snippet = text.slice(0, 80).replace(/\s+/g, ' ');
    throw new Error(`Bad response from ${path} (not JSON): ${snippet}…`);
  }
}

export function updateStatus(type, text) {
  document.getElementById('statusDot').className = `sdot ${type}`;
  document.getElementById('statusText').textContent = text;
}

export function updatePill(id, status) {
  document.getElementById(id).className = `dpill ${status}`;
}

// ── Session-day anchoring ────────────────────────────────────────────────────
// Before 06:00 London → still belongs to yesterday's session day.

export function londonSessionDay() {
  // Use Intl.DateTimeFormat to extract London date parts directly — avoids
  // locale-dependent parsing failures on mobile / non-English locales.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = type => parts.find(p => p.type === type)?.value ?? '00';
  const year = get('year'), month = get('month'), day = get('day');
  const hour = parseInt(get('hour'), 10);
  if (hour < 6) {
    const d = new Date(`${year}-${month}-${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().split('T')[0];
  }
  return `${year}-${month}-${day}`;
}

// ── Bar timestamp helpers ────────────────────────────────────────────────────
// TwelveData sends London-local strings with no zone marker.
// Intraday bars: "2026-05-04 09:30:00" — replace space with T, append Z.
// Daily bars:    "2026-05-04"           — date-only; "2026-05-04Z" is Invalid Date,
// so we must append "T00:00:00Z" for those to get a parseable UTC timestamp.

function barToUTC(bar) {
  const dt = bar.datetime;
  return dt.length === 10
    ? new Date(dt + 'T00:00:00Z')
    : new Date(dt.replace(' ', 'T') + 'Z');
}

export function barLondonHour(bar) {
  // datetime is London-local: "YYYY-MM-DD HH:MM:SS" — extract HH directly
  // to avoid BST errors from treating local time as UTC.
  const dt = bar.datetime;
  if (dt.length >= 13) return parseInt(dt.substring(11, 13), 10);
  return barToUTC(bar).getUTCHours();
}

export function barLondonDay(bar) {
  // Extract date part and parse as noon UTC for stable day-of-week regardless of DST.
  const dt = bar.datetime;
  const datePart = dt.length >= 10 ? dt.substring(0, 10) : dt;
  return new Date(datePart + 'T12:00:00Z').getUTCDay();
}

// Strip Saturday (6) and Sunday (0) bars — TwelveData can include a thin Sunday
// bar when the FX week opens ~22:00 London Sunday, which pollutes pivot/ATR calcs.
export function filterTradingDays(bars) {
  if (!bars) return [];
  return bars.filter(bar => { const d = barLondonDay(bar); return d >= 1 && d <= 5; });
}

// ── Pip / digit helpers ──────────────────────────────────────────────────────

const _EQUITY_SYMS = new Set(['NAS100_USD', 'SPX500_USD', 'DE30_USD', 'UK100_GBP', 'US30_USD', 'US2000_USD']);

// Pip size / price digits come from the ONE canonical table (js/instrumentRegistry.js,
// verified in sync with pylego/instruments.json by js/reconcile.test.mjs). These used
// to be private branches here that reported GOLD's pip as 0.1 while every other table
// in the tree said 1.0 — a 10× drift the registry's own header had flagged as known
// and unfixed. See js/goldPipMigration.js for why the paired constants moved too.
//
// Unknown symbols: the registry throws rather than defaulting a pip (a wrong pip
// silently scales PnL), so fall back to the old FX default only for symbols it
// genuinely does not carry, and say so loudly.
export function getPipSize(symbol) {
  try { return regPipSize(symbol); }
  catch { console.warn(`[utils] no registry entry for "${symbol}" — defaulting pip 0.0001`); return 0.0001; }
}

export function getDigits(symbol) {
  try { return regPriceDigits(symbol); }
  catch { console.warn(`[utils] no registry entry for "${symbol}" — defaulting 5 digits`); return 5; }
}

// Thresholds are in PIPS, so they only mean anything alongside getPipSize above.
// Gold's default moved 200 → 20 when its pip was corrected 0.1 → 1.0, preserving
// the $20 clustering distance exactly (200 × 0.1 === 20 × 1.0). A stored caps
// value written under the old basis is rescaled once by js/goldPipMigration.js.
// Every other bucket's pip was already canonical, so their numbers are unchanged.
export function getConfluenceThreshold(symbol) {
  if (symbol.includes('XAU') || symbol.includes('GOLD')) return S._caps?.gold?.confluencePips ?? 20;
  if (symbol === 'NAS100_USD') return S._caps?.nas100?.confluencePips ?? 100;
  if (symbol === 'SPX500_USD') return S._caps?.spx500?.confluencePips ?? 25;
  if (symbol === 'DE30_USD')   return S._caps?.de30?.confluencePips   ?? 80;
  if (symbol === 'UK100_GBP')  return S._caps?.uk100?.confluencePips  ?? 40;
  if (symbol === 'US30_USD')   return S._caps?.us30?.confluencePips   ?? 60;
  if (symbol === 'US2000_USD') return S._caps?.us2000?.confluencePips ?? 15;
  return S._caps?.fx?.confluencePips ?? 2;
}

export function getMergeFactor(symbol) {
  if (symbol.includes('XAU') || symbol.includes('GOLD')) return S._caps?.gold?.mergeFactor ?? 0.30;
  if (_EQUITY_SYMS.has(symbol)) return 0.30;
  return S._caps?.fx?.mergeFactor ?? 0.30;
}

export function getAsiaMinPips(symbol) {
  if (symbol.includes('XAU') || symbol.includes('GOLD')) return S._caps?.gold?.asiaMinPips ?? 150;
  if (symbol === 'NAS100_USD') return S._caps?.nas100?.asiaMinPips ?? 50;
  if (symbol === 'SPX500_USD') return S._caps?.spx500?.asiaMinPips ?? 15;
  if (symbol === 'DE30_USD')   return S._caps?.de30?.asiaMinPips   ?? 40;
  if (symbol === 'UK100_GBP')  return S._caps?.uk100?.asiaMinPips  ?? 25;
  if (symbol === 'US30_USD')   return S._caps?.us30?.asiaMinPips   ?? 30;
  if (symbol === 'US2000_USD') return S._caps?.us2000?.asiaMinPips ?? 10;
  return S._caps?.fx?.asiaMinPips ?? 15;
}

export function pipsBetween(p1, p2, symbol) {
  return Math.abs(p1 - p2) / getPipSize(symbol);
}

// ── FRED / formatting ────────────────────────────────────────────────────────

export function fred(key) {
  const obj = S.fredData?.[key];
  return obj?.value ?? null;
}

export function fmt(value, decimals = 2, suffix = '', fallback = '—') {
  if (value == null || isNaN(value)) return fallback;
  return value.toFixed(decimals) + suffix;
}

// ── Symbol format converters ─────────────────────────────────────────────────

// EUR/USD -> EUR_USD  (OANDA instruments format)
export function toOandaSym(sym) { return sym.replace('/', '_'); }

// EUR/USD -> EURUSD   (Myfxbook symbols format)
export function toMyfxbSym(sym) { return sym.replace('/', ''); }

// Classify a live spread vs typical spread for the pair.
// Returns 'NORMAL', 'WIDE', or 'EXTREME'.
export function classifySpread(spreadPips, typicalPips) {
  if (spreadPips == null || typicalPips == null) return null;
  if (spreadPips > typicalPips * 3.0) return 'EXTREME';
  if (spreadPips > typicalPips * 1.5) return 'WIDE';
  return 'NORMAL';
}

// ── Math helpers ─────────────────────────────────────────────────────────────

export function ema(values, period) {
  const k = 2 / (period + 1);
  const result = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

export function sma(values, period) {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - period + 1), i + 1);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
}

export function calcRSI(values, period) {
  const result = [];
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change > 0) gains += change; else losses -= change;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  result.push(100 - 100 / (1 + avgGain / (avgLoss || 0.0001)));
  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result.push(100 - 100 / (1 + avgGain / (avgLoss || 0.0001)));
  }
  while (result.length < values.length) result.unshift(50);
  return result;
}
