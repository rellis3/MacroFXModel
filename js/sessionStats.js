/**
 * Session Consumption Statistics
 *
 * Fetches H1 bars from Oanda and computes what fraction of the daily H-L range
 * each session (Asia 00:00–06:00 London, London 08:00–13:00 London) historically
 * consumes.  Results are written to VolRangeForecaster/data/session_stats.json
 * and served via /api/session-stats.
 *
 * No Python dependency — runs entirely in Node.js using the same Oanda key that
 * the vol-forecast scheduler already uses.
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const OUTFILE    = path.join(__dirname, '..', 'VolRangeForecaster', 'data', 'session_stats.json');

const OANDA_ENV  = process.env.OANDA_ENV || 'practice';
const OANDA_BASE = OANDA_ENV === 'practice'
  ? 'https://api-fxpractice.oanda.com'
  : 'https://api-fxtrade.oanda.com';

const BARS_PER_REQUEST = 5000;
const DEFAULT_YEARS    = 5;

// ── Instruments to analyse ────────────────────────────────────────────────────
// Key = name used in the Pine Script paste;  value = Oanda instrument symbol
const INSTRUMENTS = {
  GOLD:   'XAU_USD',
  NQ:     'NAS100_USD',
  EURUSD: 'EUR_USD',
  GBPUSD: 'GBP_USD',
  USDJPY: 'USD_JPY',
  AUDUSD: 'AUD_USD',
  NZDUSD: 'NZD_USD',
  USDCAD: 'USD_CAD',
  USDCHF: 'USD_CHF',
  GBPJPY: 'GBP_JPY',
};

// Session windows — London local time [inclusive start, exclusive end)
const SESSIONS = {
  asia:   [0,  6],   // 00:00–06:00
  london: [8,  13],  // 08:00–13:00
  ny:     [13, 21],  // 13:00–21:00  (US open → NY close)
};

const MIN_DAY_BARS     = 12;  // H1 bars required for a valid full trading day
const MIN_SESSION_BARS =  3;  // H1 bars required for a valid session slice


// ── Oanda H1 fetch (chunked pagination) ──────────────────────────────────────

function _oandaKey() {
  const key = process.env.OANDA_KEY;
  if (!key) throw new Error('OANDA_KEY env var not set');
  return key;
}

async function _fetchChunk(instrument, fromDate) {
  const url = new URL(`${OANDA_BASE}/v3/instruments/${instrument}/candles`);
  url.searchParams.set('granularity', 'H1');
  url.searchParams.set('count',       String(BARS_PER_REQUEST));
  url.searchParams.set('price',       'M');
  url.searchParams.set('from',        fromDate.toISOString().replace(/\.\d+Z$/, '.000000000Z'));

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${_oandaKey()}` },
        signal:  AbortSignal.timeout(30_000),
      });
      if (res.status === 404 || res.status === 422) return [];
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

      const data = await res.json();
      return (data.candles ?? [])
        .filter(c => c.complete !== false && c.mid)
        .map(c => ({
          open:  parseFloat(c.mid.o),
          high:  parseFloat(c.mid.h),
          low:   parseFloat(c.mid.l),
          close: parseFloat(c.mid.c),
          time:  new Date(c.time),
        }));
    } catch (err) {
      if (attempt === 3) throw err;
      const wait = 2 ** (attempt + 1) * 1000;
      console.warn(`[SESSION-STATS] ${instrument} chunk attempt ${attempt + 1} failed: ${err.message} — retrying in ${wait / 1000}s`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  return [];
}

async function _fetchAllH1(instrument, years) {
  const all    = [];
  let   cursor = new Date(Date.now() - years * 365.25 * 24 * 60 * 60 * 1000);
  const now    = new Date();

  while (cursor < now) {
    const chunk = await _fetchChunk(instrument, cursor);
    if (!chunk.length) {
      // Non-trading gap (weekend / holiday) — skip forward 1 week
      cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000);
      continue;
    }
    all.push(...chunk);
    cursor = new Date(chunk.at(-1).time.getTime() + 60 * 60 * 1000);
    process.stdout.write(`  [${instrument}] ${chunk.at(-1).time.toISOString().slice(0, 10)}  ${all.length.toLocaleString()} bars\r`);
    if (chunk.length < BARS_PER_REQUEST) break; // caught up to now
    await new Promise(r => setTimeout(r, 60));  // Oanda rate-limit buffer
  }
  process.stdout.write('\n');
  return all;
}


// ── Session consumption calculation ──────────────────────────────────────────

// Reusable London-time formatter
const _londonFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year:     'numeric', month:  '2-digit', day:  '2-digit',
  hour:     '2-digit', hour12: false,
});

function _londonParts(date) {
  const parts = _londonFmt.formatToParts(date);
  const get = t => parts.find(p => p.type === t).value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: parseInt(get('hour'), 10),
  };
}

function _computeStats(bars) {
  const byDate = new Map();

  for (const bar of bars) {
    const { date, hour } = _londonParts(bar.time);
    if (!byDate.has(date)) byDate.set(date, { all: [], asia: [], london: [], ny: [] });
    const grp = byDate.get(date);
    grp.all.push(bar);
    for (const [sess, [h0, h1]] of Object.entries(SESSIONS)) {
      if (hour >= h0 && hour < h1) grp[sess].push(bar);
    }
  }

  const buckets = {
    asia_hl: [], asia_oc: [],
    london_hl: [], london_oc: [],
    ny_hl: [], ny_oc: [],
  };

  for (const grp of byDate.values()) {
    if (grp.all.length < MIN_DAY_BARS) continue;
    const dailyHL = Math.max(...grp.all.map(b => b.high)) - Math.min(...grp.all.map(b => b.low));
    if (dailyHL < 1e-9) continue;

    for (const sess of ['asia', 'london', 'ny']) {
      const sb = grp[sess].slice().sort((a, b) => a.time - b.time);
      if (sb.length < MIN_SESSION_BARS) continue;
      const sessHL = Math.max(...sb.map(b => b.high)) - Math.min(...sb.map(b => b.low));
      const sessOC = Math.abs(sb.at(-1).close - sb[0].open);
      buckets[`${sess}_hl`].push(sessHL / dailyHL * 100);
      buckets[`${sess}_oc`].push(sessOC / dailyHL * 100);
    }
  }

  const _pct = (arr, p) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const i = (p / 100) * (s.length - 1);
    const lo = Math.floor(i), hi = Math.ceil(i);
    return Math.round((s[lo] + (s[hi] - s[lo]) * (i - lo)) * 10) / 10;
  };

  const mkStats = arr => arr.length
    ? { p50: _pct(arr, 50), p75: _pct(arr, 75), mean: Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10, n: arr.length }
    : null;

  return {
    asia:      mkStats(buckets.asia_hl),
    asia_oc:   mkStats(buckets.asia_oc),
    london:    mkStats(buckets.london_hl),
    london_oc: mkStats(buckets.london_oc),
    ny:        mkStats(buckets.ny_hl),
    ny_oc:     mkStats(buckets.ny_oc),
  };
}


// ── Pine Script export block builder ─────────────────────────────────────────

const LW = 34;
function _div(name) { const p = `──── ${name} `; return p + '─'.repeat(Math.max(0, LW - p.length)); }

export function buildSessionExportBlock(instruments) {
  const lines = [_div('SESSION STATS'), ''];
  for (const [name, stats] of Object.entries(instruments)) {
    if (!stats?.asia || !stats?.london) continue;
    lines.push(name);
    lines.push(`Asia range      : ${stats.asia.p50}% median · ${stats.asia.p75}% 75th`);
    if (stats.asia_oc)   lines.push(`Asia O-C        : ${stats.asia_oc.p50}% median · ${stats.asia_oc.p75}% 75th`);
    lines.push(`London range    : ${stats.london.p50}% median · ${stats.london.p75}% 75th`);
    if (stats.london_oc) lines.push(`London O-C      : ${stats.london_oc.p50}% median · ${stats.london_oc.p75}% 75th`);
    if (stats.ny)        lines.push(`NY range        : ${stats.ny.p50}% median · ${stats.ny.p75}% 75th`);
    if (stats.ny_oc)     lines.push(`NY O-C          : ${stats.ny_oc.p50}% median · ${stats.ny_oc.p75}% 75th`);
    lines.push('');
  }
  return lines.join('\n');
}


// ── Public API ────────────────────────────────────────────────────────────────

let _computing = false;

/** Returns the cached stats from disk, or null if not yet computed. */
export function getSessionStats() {
  if (!fs.existsSync(OUTFILE)) return null;
  try { return JSON.parse(fs.readFileSync(OUTFILE, 'utf8')); }
  catch { return null; }
}

/** True while computeSessionStats() is running. */
export function isSessionStatsComputing() { return _computing; }

/**
 * Fetch H1 data from Oanda and compute session consumption stats.
 * Writes results to OUTFILE and returns the output object.
 * Throws if already computing.
 */
export async function computeSessionStats(years = DEFAULT_YEARS) {
  if (_computing) throw new Error('Session stats computation already in progress');
  _computing = true;
  const results = {};

  try {
    for (const [name, oandaSym] of Object.entries(INSTRUMENTS)) {
      console.log(`[SESSION-STATS] ── ${name} (${oandaSym}) ──`);
      const bars = await _fetchAllH1(oandaSym, years);
      if (!bars.length) { console.log('  SKIPPED — no bars'); continue; }
      const stats = _computeStats(bars);
      results[name] = stats;
      for (const [lbl, key] of [['Asia H-L','asia'],['Asia O-C','asia_oc'],['London H-L','london'],['London O-C','london_oc'],['NY H-L','ny'],['NY O-C','ny_oc']]) {
        const s = stats[key]; if (s) console.log(`  ${lbl.padEnd(12)} P50=${s.p50}%  P75=${s.p75}%  (n=${s.n})`);
      }
    }

    const output = {
      ok:           true,
      computed_at:  new Date().toISOString(),
      years,
      instruments:  results,
      export_block: buildSessionExportBlock(results),
    };

    fs.mkdirSync(path.dirname(OUTFILE), { recursive: true });
    fs.writeFileSync(OUTFILE, JSON.stringify(output, null, 2));
    console.log(`[SESSION-STATS] Written → ${OUTFILE}`);
    return output;
  } finally {
    _computing = false;
  }
}
