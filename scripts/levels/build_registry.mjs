// Level registry v1 (plans/LEVEL_ENGINE_ROADMAP.md Phase 1, time-boxed). Read-only research build on the local M1 cache.
//
// For every instrument and London session (weekday, >= 600 M1 bars, <= 2026-08-20), the levels production's own calculator emits
// from data strictly BEFORE 00:00 London of that session:
//   * js/rangeLineAnalyser.js sessionConfluenceLevels (the function the range_line_bot backtest and live producer share):
//     pivots, prior_hilo (PDH/PDL/PWH/PWL/20d), volume_profile (5d composite, tick-volume weighted), swing_sr, swing_fib,
//     round_number, vwap, plus the 15-minute fib clusters (fib15);
//   * js/levelSources.js daily_open (last 5 daily opens).
// dailyBars = New-York-close daily bars (js/voteAtlasV4Lines.js nyCloseDailyBars, n >= 60) that closed before the session;
// intraday = the previous 6 days of M1. Pip sizes from js/instrumentRegistry.js (canonical: GOLD 1.0).
// Output data/levels/registry/<SYM>.csv: inst,date,source,kind,price  (data/ is gitignored).
//   node scripts/levels/build_registry.mjs [fileKey:SYM ...]
import fs from 'fs';
import { bucketM1IntoSessions } from '../../js/forecastAnalyser.js';
import { sessionConfluenceLevels } from '../../js/rangeLineAnalyser.js';
import { collectLevels } from '../../js/levelSources.js';
import { pipSize } from '../../js/instrumentRegistry.js';

const OUT = 'data/levels/registry', LAST = '2026-08-20';
const FX = ['audcad', 'audchf', 'audjpy', 'audnzd', 'audusd', 'cadchf', 'cadjpy', 'chfjpy', 'euraud', 'eurcad', 'eurchf', 'eurgbp',
  'eurjpy', 'eurnzd', 'eurusd', 'gbpaud', 'gbpcad', 'gbpchf', 'gbpjpy', 'gbpnzd', 'gbpusd', 'nzdcad', 'nzdjpy', 'nzdusd', 'usdcad', 'usdchf', 'usdjpy'];
const DEFAULT = [...FX.map(k => `${k}:${k.toUpperCase()}`), 'gold:GOLD', 'nq:NQ', 'spx500:SPX500', 'us30:US30', 'us2000:US2000', 'de30:DE30', 'uk100:UK100'];
const JOBS = (process.argv.length > 2 ? process.argv.slice(2) : DEFAULT).map(a => a.split(':'));
fs.mkdirSync(OUT, { recursive: true });

const lonFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour12: false, hour: '2-digit' });
const londonMidnight = date => { const noon = Date.parse(date + 'T12:00:00Z') / 1000; const lh = +lonFmt.format(new Date(noon * 1000)) % 24; return Date.parse(date + 'T00:00:00Z') / 1000 - (lh - 12) * 3600; };
function lowerBound(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; }

for (const [key, SYM] of JOBS) {
  const t0 = Date.now();
  // M1 from the flat binary written by scripts/levels/m1_to_bin.py (same parquet loadM1ForPair reads; JS parquet decoding
  // needs ~2 GB and ~4 min per instrument, which exhausted memory with several builders in parallel).
  const buf = fs.readFileSync(`data/levels/m1bin/${SYM}.bin`);
  const n = buf.readInt32LE(0);
  const ab = buf.buffer.slice(buf.byteOffset + 4, buf.byteOffset + buf.length);
  const times = new Int32Array(ab, 0, n);
  const f64 = new Float64Array(ab.slice(4 * n));
  const packed = { n, times, opens: f64.subarray(0, n), highs: f64.subarray(n, 2 * n), lows: f64.subarray(2 * n, 3 * n), closes: f64.subarray(3 * n, 4 * n), volumes: f64.subarray(4 * n, 5 * n) };
  // instrumentRegistry lacks some crosses (e.g. CADCHF): standard FX pip fallback, recorded in the inventory.
  let pip; try { pip = pipSize(SYM); } catch { pip = SYM.endsWith('JPY') ? 0.01 : 0.0001; console.warn(`${SYM}: pip from fallback ${pip}`); }
  // NY-close daily bars: the precomputed research file (same bars as nyCloseDailyBars; computing them from M1 takes ~5 min/instrument).
  // `d` is the bar's closing (New York) date; endSec = 17:00 New York on that date.
  const nyFile = { US30: 'US30' }[SYM] ?? SYM;
  const nyNameOk = fs.existsSync(`analysis/output/ladder_candidates/d1/${nyFile}.json`) ? nyFile : (SYM === 'US30' ? 'DOW' : SYM);
  const nyRaw = JSON.parse(fs.readFileSync(`analysis/output/ladder_candidates/d1/${nyNameOk}.json`, 'utf8'));
  const nyOff = d => { const t = Date.parse(d + 'T17:00:00Z') / 1000; const hNY = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit' }).format(new Date(t * 1000)) % 24; return t + (17 - hNY) * 3600; };
  const ny = nyRaw.map(b => ({ open: b.o, high: b.h, low: b.l, close: b.c, endSec: nyOff(b.d) }));
  const nyEnd = ny.map(b => b.endSec);
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const lines = ['inst,date,source,kind,price'];
  let nSess = 0;
  for (const date of [...sessions.keys()].sort()) {
    if (date > LAST) continue;
    const dow = new Date(date + 'T12:00:00Z').getUTCDay();
    if (dow === 0 || dow === 6 || (sessions.get(date)?.length ?? 0) < 600) continue;
    const mid = londonMidnight(date);
    const k = lowerBound(nyEnd, mid + 1);                       // NY bars with endSec <= mid
    if (k < 60) continue;
    const dailyBars = ny.slice(Math.max(0, k - 80), k).map(b => ({ time: b.endSec - 1, open: b.open, high: b.high, low: b.low, close: b.close }));
    const i0 = lowerBound(packed.times, mid - 6 * 86400), i1 = lowerBound(packed.times, mid);
    if (i1 - i0 < 600) continue;
    const intraday = [];
    for (let i = i0; i < i1; i++) intraday.push({ time: packed.times[i], open: packed.opens[i], high: packed.highs[i], low: packed.lows[i], close: packed.closes[i], volume: packed.volumes?.[i] ?? 1 });
    const price = intraday.at(-1).close;
    let lv;
    try {
      lv = sessionConfluenceLevels({ dailyBars, intraday, pip, price });
      for (const x of collectLevels({ dailyBars, pipSize: pip, price }, ['daily_open'])) lv.push(x);
    } catch (e) { console.warn(`${SYM} ${date}: ${e.message}`); continue; }
    const seen = new Set();
    for (const x of lv) {
      if (!Number.isFinite(x.price)) continue;
      const src = x.source ?? 'unknown', kind = x.kind ?? '';
      const id = `${src}|${kind}|${x.price.toPrecision(10)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      lines.push(`${SYM},${date},${src},${kind},${+x.price.toPrecision(10)}`);
    }
    nSess++;
  }
  fs.writeFileSync(`${OUT}/${SYM}.csv`, lines.join('\n') + '\n');
  console.log(`${SYM}: ${nSess} sessions, ${lines.length - 1} levels, ${Math.round((Date.now() - t0) / 1000)} s`);
}
