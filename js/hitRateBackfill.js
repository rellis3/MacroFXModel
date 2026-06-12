/**
 * Historical price-level hit rate computation.
 *
 * For each instrument over a lookback window:
 *   1. Fetch D1 bars  → compute rolling GARCH/RS-EWMA forecast per calendar day
 *   2. Fetch H1 bars  → scan each day's bars for the first time each price level is touched
 *   3. Aggregate      → hit rate % + median/earliest/latest UTC time per level
 *
 * Levels tracked (6 per instrument):
 *   O-H med / O-H 75th : bar HIGH reaches open + oc_median/oc_75 % of open  (upside touch)
 *   O-L med / O-L 75th : bar LOW  reaches open − oc_median/oc_75 % of open  (downside touch)
 *   H-L med / H-L 75th : rolling (session high − session low) >= hl_median/hl_75 % of open
 *
 * "Day" = London calendar date (00:00–23:59 Europe/London).
 * Anchor open = open price of first H1 bar on that London date.
 */

import { computeForecast } from './volForecast.js';

const OANDA_ENV  = process.env.OANDA_ENV || 'practice';
const OANDA_BASE = OANDA_ENV === 'practice'
  ? 'https://api-fxpractice.oanda.com'
  : 'https://api-fxtrade.oanda.com';

function _oandaKey() {
  const k = process.env.OANDA_KEY;
  if (!k) throw new Error('OANDA_KEY env var not set');
  return k;
}

// Instruments to analyse — must match volForecastScheduler definitions
export const HR_INSTRUMENTS = [
  { name: 'GOLD',   sym: 'XAU_USD',    ac: 'commodity' },
  { name: 'NQ',     sym: 'NAS100_USD', ac: 'index'     },
  { name: 'SPX500', sym: 'SPX500_USD', ac: 'index'     },
  { name: 'DE30',   sym: 'DE30_EUR',   ac: 'index'     },
  { name: 'UK100',  sym: 'UK100_GBP',  ac: 'index'     },
  { name: 'US30',   sym: 'US30_USD',   ac: 'index'     },
  { name: 'US2000', sym: 'US2000_USD', ac: 'index'     },
  { name: 'EURUSD', sym: 'EUR_USD',    ac: 'fx'        },
  { name: 'GBPUSD', sym: 'GBP_USD',    ac: 'fx'        },
  { name: 'USDJPY', sym: 'USD_JPY',    ac: 'fx'        },
  { name: 'AUDUSD', sym: 'AUD_USD',    ac: 'fx'        },
  { name: 'NZDUSD', sym: 'NZD_USD',    ac: 'fx'        },
  { name: 'USDCAD', sym: 'USD_CAD',    ac: 'fx'        },
  { name: 'USDCHF', sym: 'USD_CHF',    ac: 'fx'        },
  { name: 'GBPJPY', sym: 'GBP_JPY',    ac: 'fx'        },
  { name: 'EURGBP', sym: 'EUR_GBP',    ac: 'fx'        },
  { name: 'EURJPY', sym: 'EUR_JPY',    ac: 'fx'        },
  { name: 'EURCHF', sym: 'EUR_CHF',    ac: 'fx'        },
  { name: 'GBPCHF', sym: 'GBP_CHF',    ac: 'fx'        },
  { name: 'AUDJPY', sym: 'AUD_JPY',    ac: 'fx'        },
  { name: 'CADJPY', sym: 'CAD_JPY',    ac: 'fx'        },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const _londonFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', hour12: false,
});

function _londonDate(date) {
  const p = _londonFmt.formatToParts(date);
  const g = t => p.find(x => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

function _minsToHHMM(mins) {
  if (mins == null) return null;
  const h = Math.floor(mins / 60) % 24;
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function _median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ── Oanda fetch ───────────────────────────────────────────────────────────────

async function _fetchChunk(sym, gran, from, count = 5000) {
  const url = new URL(`${OANDA_BASE}/v3/instruments/${sym}/candles`);
  url.searchParams.set('granularity', gran);
  url.searchParams.set('count', String(count));
  url.searchParams.set('price', 'M');
  url.searchParams.set('from', from.toISOString().replace(/\.\d+Z$/, '.000000000Z'));

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${_oandaKey()}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 404 || res.status === 422) return [];
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data.candles ?? []).filter(c => c.complete !== false && c.mid).map(c => ({
        time:  c.time,
        open:  parseFloat(c.mid.o),
        high:  parseFloat(c.mid.h),
        low:   parseFloat(c.mid.l),
        close: parseFloat(c.mid.c),
      }));
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return [];
}

async function _fetchAll(sym, gran, fromMs, step) {
  const all = [];
  let cursor = new Date(fromMs);
  const now  = new Date();
  while (cursor < now) {
    const chunk = await _fetchChunk(sym, gran, cursor);
    if (!chunk.length) { cursor = new Date(cursor.getTime() + step); continue; }
    all.push(...chunk);
    cursor = new Date(new Date(chunk.at(-1).time).getTime() + (gran === 'D' ? 86400000 : 3600000));
    if (chunk.length < 5000) break;
    await new Promise(r => setTimeout(r, 80));
  }
  return all;
}

// ── Per-instrument computation ────────────────────────────────────────────────

const LEVELS = ['oh_med', 'oh_75', 'ol_med', 'ol_75', 'hl_med', 'hl_75'];

// Rebuild aggregate stats from a daily log array (used after incremental extension)
function _aggregateFromDaily(daily) {
  const hitBuckets = Object.fromEntries(LEVELS.map(l => [l, []]));
  for (const d of daily) {
    for (const lvl of LEVELS) {
      if (d.hits[lvl]) {
        const [h, m] = d.hits[lvl].split(':').map(Number);
        hitBuckets[lvl].push(h * 60 + m);
      }
    }
  }
  const n = daily.length;
  const levels = {};
  for (const lvl of LEVELS) {
    const times = hitBuckets[lvl];
    levels[lvl] = {
      hit_pct:      Math.round(times.length / (n || 1) * 100),
      n_hits:       times.length,
      n_days:       n,
      median_utc:   _minsToHHMM(_median(times)),
      earliest_utc: _minsToHHMM(times.length ? Math.min(...times) : null),
      latest_utc:   _minsToHHMM(times.length ? Math.max(...times) : null),
    };
  }
  return levels;
}

async function _computeInstrument(name, sym, ac, lookbackDays, existingInst = null) {
  const nowMs          = Date.now();
  const analysisFromMs = nowMs - lookbackDays * 86400000;
  const warmupFromMs   = analysisFromMs - 400 * 86400000; // 400 days GARCH warmup

  // Incremental: only fetch H1 from the day after the last stored date
  const existingDaily  = existingInst?.daily ?? [];
  const lastStoredDate = existingDaily.length ? existingDaily[existingDaily.length - 1].date : null;
  const h1FromMs       = lastStoredDate
    ? new Date(lastStoredDate + 'T00:00:00Z').getTime() + 86400000
    : analysisFromMs;

  const isIncremental = h1FromMs > analysisFromMs;
  const mode = isIncremental ? `incremental from ${lastStoredDate}` : `full ${lookbackDays}d`;

  process.stdout.write(`  [${name}] fetching D1...`);
  const d1 = await _fetchAll(sym, 'D', warmupFromMs, 7 * 86400000);
  process.stdout.write(` ${d1.length} bars  H1 (${mode})...`);
  const h1 = await _fetchAll(sym, 'H1', h1FromMs, 7 * 86400000);
  process.stdout.write(` ${h1.length} bars\n`);

  if (d1.length < 60) return null;

  const d1s = d1.map(b => ({ open: b.open, high: b.high, low: b.low, close: b.close, time: b.time }))
                 .sort((a, b) => a.time.localeCompare(b.time));

  // Group new H1 bars by London date
  const h1ByDate = new Map();
  for (const bar of h1) {
    const ld = _londonDate(new Date(bar.time));
    if (!h1ByDate.has(ld)) h1ByDate.set(ld, []);
    h1ByDate.get(ld).push(bar);
  }

  // Existing dates set — skip any dates already in daily log
  const existingDates = new Set(existingDaily.map(d => d.date));
  const newDailyLog   = [];

  for (const [date, dayBars] of [...h1ByDate.entries()].sort()) {
    if (existingDates.has(date)) continue;   // already computed
    if (dayBars.length < 4) continue;        // skip very partial days

    const cutoff  = date + 'T00:00:00.000Z';
    const d1Prior = d1s.filter(b => b.time < cutoff);
    if (d1Prior.length < 60) continue;

    let fc;
    try { fc = computeForecast(d1Prior, ac, 1.0); } catch { continue; }

    const bars = [...dayBars].sort((a, b) => a.time.localeCompare(b.time));
    const open = bars[0].open;

    const oc_med_abs = open * fc.oc_median / 100;
    const oc_75_abs  = open * fc.oc_75    / 100;
    const hl_med_abs = open * fc.hl_median / 100;
    const hl_75_abs  = open * fc.hl_75    / 100;

    let rHigh = open, rLow = open;
    const dayHit = {};
    for (const bar of bars) {
      const { high: bH, low: bL, time: bT } = bar;
      rHigh = Math.max(rHigh, bH);
      rLow  = Math.min(rLow,  bL);
      const rHL = rHigh - rLow;
      if (!dayHit.oh_med && bH >= open + oc_med_abs) dayHit.oh_med = bT;
      if (!dayHit.oh_75  && bH >= open + oc_75_abs)  dayHit.oh_75  = bT;
      if (!dayHit.ol_med && bL <= open - oc_med_abs) dayHit.ol_med = bT;
      if (!dayHit.ol_75  && bL <= open - oc_75_abs)  dayHit.ol_75  = bT;
      if (!dayHit.hl_med && rHL >= hl_med_abs)        dayHit.hl_med = bT;
      if (!dayHit.hl_75  && rHL >= hl_75_abs)         dayHit.hl_75  = bT;
    }

    const hitTimes = {};
    for (const lvl of LEVELS) {
      hitTimes[lvl] = dayHit[lvl]
        ? _minsToHHMM(new Date(dayHit[lvl]).getUTCHours() * 60 + new Date(dayHit[lvl]).getUTCMinutes())
        : null;
    }
    newDailyLog.push({ date, open, fc: { oc_median: fc.oc_median, oc_75: fc.oc_75, hl_median: fc.hl_median, hl_75: fc.hl_75 }, hits: hitTimes });
  }

  // Merge existing + new, trim to lookback window, sort ascending
  const cutoffDate = new Date(analysisFromMs).toISOString().slice(0, 10);
  const allDaily   = [...existingDaily, ...newDailyLog]
    .filter(d => d.date >= cutoffDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!allDaily.length) return null;

  return { total_days: allDaily.length, levels: _aggregateFromDaily(allDaily), daily: allDaily };
}

// ── Public API ────────────────────────────────────────────────────────────────

let _computing = false;
export const isHitRatesComputing = () => _computing;

export async function computeHitRates(lookbackDays = 90, existingData = null) {
  if (_computing) throw new Error('Hit rate computation already in progress');
  _computing = true;
  try {
    const mode = existingData ? 'incremental' : 'full';
    console.log(`[HIT-RATES] Starting — ${lookbackDays}-day lookback, ${HR_INSTRUMENTS.length} instruments (${mode})`);
    const results = {};
    for (const { name, sym, ac } of HR_INSTRUMENTS) {
      console.log(`[HIT-RATES] ── ${name} ──`);
      results[name] = await _computeInstrument(name, sym, ac, lookbackDays, existingData?.instruments?.[name] ?? null);
    }
    return {
      ok:           true,
      computed_at:  new Date().toISOString(),
      lookback_days: lookbackDays,
      instruments:  results,
    };
  } finally {
    _computing = false;
  }
}
