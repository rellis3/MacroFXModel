// Build js/tapeSpeedParams.js — how fast the tape is moving, and what that has
// meant for the next hour, per instrument and session band.
//
//   node analysis/build_tape_speed_params.mjs            # all pairs, 5 years
//   LA_PAIRS=gold,eurusd YEARS=3 node analysis/build_tape_speed_params.mjs
//
// WHY THIS IS UNCONDITIONAL. analysis/approach_speed_control_study.mjs (2026-09-12)
// tested the claim that price arriving SLOWLY at a level then dwells on it. It does
// -- but it dwells just as much at a random non-level price arriving at the same
// speed, and the paired level increment is zero or negative on 4 instruments x 4
// bands. The effect is speed persistence, not levels: a tape moving slowly over the
// last 15 minutes tends to keep moving slowly for the next hour, and a fast one to
// keep moving. So the useful statistic is computed on EVERY bar, not at touches,
// and it applies at every moment of the day rather than the handful when price
// meets a line.
//
// WHAT IS MEASURED, per (pair, band), from bars sampled every 5 minutes:
//   speed      |close[i-1] - close[i-16]| / 15 / ATR14     ATR per minute, last 15 min
//   dwell      share of the next 60 closes within 0.10 ATR of close[i]
//   nextRange  (high-low over the next 60 bars) / ATR14
//   volRatio   next-hour range / previous-hour range
// Speed is cut into quintiles WITHIN the band, because the same speed is slow in
// the NY overlap and fast in Asia; a single full-day cut mislabels most of both.
//
// Output is a frozen table, committed, read by js/tapeSpeedEngine.js at runtime.
// Nothing here predicts direction and nothing here is a signal; it is a read of
// what kind of hour the tape has historically produced from this pace.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions } from '../js/forecastAnalyser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT = path.join(__dirname, '..', 'js', 'tapeSpeedParams.js');

const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PAIRS = process.env.LA_PAIRS ? process.env.LA_PAIRS.split(',').map(s => s.trim().toLowerCase()) : ALL_PAIRS;
const YEARS = Number(process.env.YEARS || 5);

const ATR_N = 14, SPEED_BARS = 15, FWD_BARS = 60, DWELL_ATR = 0.10, SAMPLE_EVERY = 5;
export const BANDS = [
  { key: 'asia',   label: 'Asia 23:00-07:00',       from: 23, to: 7 },
  { key: 'london', label: 'London 07:00-12:00',     from: 7,  to: 12 },
  { key: 'ny',     label: 'NY overlap 12:00-17:00', from: 12, to: 17 },
  { key: 'late',   label: 'Late 17:00-23:00',       from: 17, to: 23 },
];
const bandOf = h => (h >= 23 || h < 7) ? 'asia' : h < 12 ? 'london' : h < 17 ? 'ny' : 'late';

const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function quantile(sorted, q) { const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
const r4 = v => v == null ? null : +v.toFixed(4);

async function buildPair(pair) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) return null;
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const allDates = [...sessions.keys()].sort().filter(d => (sessions.get(d)?.length ?? 0) >= 300);
  const cutoff = new Date(Date.now() - YEARS * 365.25 * 864e5).toISOString().slice(0, 10);
  const d1 = new Map();
  for (const d of allDates) {
    const b = sessions.get(d); let hi = -Infinity, lo = Infinity;
    for (const x of b) { if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; }
    d1.set(d, { hi, lo, close: b[b.length - 1].close });
  }
  const atrAt = idx => {
    if (idx < ATR_N + 1) return null;
    let s = 0;
    for (let k = idx - ATR_N; k < idx; k++) { const c = d1.get(allDates[k]), p = d1.get(allDates[k - 1]); s += Math.max(c.hi - c.lo, Math.abs(c.hi - p.close), Math.abs(c.lo - p.close)); }
    return s / ATR_N;
  };

  const rows = { asia: [], london: [], ny: [], late: [] };
  let sessionsUsed = 0, from = null, to = null;
  for (let idx = 0; idx < allDates.length; idx++) {
    const date = allDates[idx]; if (date < cutoff) continue;
    const atr = atrAt(idx); if (!(atr > 0)) continue;
    const bars = sessions.get(date);
    sessionsUsed++; from ??= date; to = date;
    for (let i = SPEED_BARS + FWD_BARS + 1; i < bars.length - FWD_BARS - 1; i += SAMPLE_EVERY) {
      const h = new Date(bars[i].time * 1000).getUTCHours();
      const speed = Math.abs(bars[i - 1].close - bars[i - 1 - SPEED_BARS].close) / SPEED_BARS / atr;
      const P = bars[i].close;
      let near = 0, fhi = -Infinity, flo = Infinity, phi = -Infinity, plo = Infinity;
      for (let k = 1; k <= FWD_BARS; k++) {
        const b = bars[i + k]; if (Math.abs(b.close - P) <= DWELL_ATR * atr) near++;
        if (b.high > fhi) fhi = b.high; if (b.low < flo) flo = b.low;
        const q = bars[i - k]; if (q.high > phi) phi = q.high; if (q.low < plo) plo = q.low;
      }
      const prev = phi - plo;
      rows[bandOf(h)].push({ speed, dwell: near / FWD_BARS, nextRange: (fhi - flo) / atr, volRatio: prev > 0 ? (fhi - flo) / prev : null });
    }
  }

  const bands = {};
  for (const bd of BANDS) {
    const r = rows[bd.key]; if (r.length < 500) continue;
    const sp = r.map(x => x.speed).sort((a, b) => a - b);
    const cuts = [0.2, 0.4, 0.6, 0.8].map(q => quantile(sp, q));
    const qOf = s => { let q = 0; while (q < 4 && s > cuts[q]) q++; return q; };
    const quint = [];
    for (let q = 0; q < 5; q++) {
      const g = r.filter(x => qOf(x.speed) === q);
      quint.push({ n: g.length, dwell: r4(mean(g.map(x => x.dwell))), nextRangeAtr: r4(median(g.map(x => x.nextRange))), volRatio: r4(median(g.map(x => x.volRatio).filter(v => v != null))) });
    }
    bands[bd.key] = { n: r.length, cuts: cuts.map(r4), quintiles: quint,
      // The pair's own sense of "unremarkable" for this band: the unconditional
      // median next-hour range, so a quintile's range can be read as above/below it.
      medianNextRangeAtr: r4(median(r.map(x => x.nextRange))) };
  }
  return { pair, coverage: { from, to, sessions: sessionsUsed }, bands };
}

async function main() {
  const out = {};
  for (const pair of PAIRS) {
    process.stderr.write(`${pair} … `);
    try { const r = await buildPair(pair); if (r) { out[pair] = r; process.stderr.write(`${r.coverage.sessions} sessions\n`); } else process.stderr.write('no data\n'); }
    catch (e) { process.stderr.write(`FAILED ${e.message}\n`); }
  }
  const header = `/**
 * Tape-speed parameters — GENERATED by analysis/build_tape_speed_params.mjs, do not hand-edit.
 *
 * Per instrument and session band: quintile cut points of 15-minute speed (ATR per
 * minute) and, for each quintile, what the NEXT HOUR has historically looked like --
 * dwell (share of the hour within 0.10 ATR of where price was), the median next-hour
 * range in ATR, and the median ratio of next-hour to previous-hour range.
 *
 * Unconditional on levels, deliberately. analysis/approach_speed_control_study.mjs
 * showed the "slow arrival dwells on the level" effect is speed persistence and
 * appears identically at random non-level prices, so the read belongs to every bar.
 * Context for what kind of hour this is, never a direction call.
 *
 * Built ${new Date().toISOString().slice(0, 10)} from ${YEARS} years of M1, sampled every ${SAMPLE_EVERY} minutes.
 */
export const TAPE_SPEED_PARAMS = `;
  fs.writeFileSync(OUT, header + JSON.stringify(out, null, 1) + ';\n');
  console.log(`wrote ${OUT} (${Object.keys(out).length} pairs)`);
}
if (path.resolve(process.argv[1] ?? '') === __filename) main();
