// Meta-labelling built properly — LAYERS 1-2 (forge/META_LABEL_PROPER_PREREG.md).
// Layer 1: CUSUM events on UTC daily closes; the yield-spread primary (the engine's own z, |z| >= 1.0) picks a side.
// Layer 2: triple-barrier outcome for BOTH sides of every event (+-2 sigma, 10 trading days, stop first on a
// two-touch day, 0.02% round-trip cost). The primary's label is the outcome on its side.
//   node scripts/meta_proper/build_events.mjs
// Writes analysis/output/meta_proper/events.csv and daily_<PAIR>.csv; caches FRED csvs under .../fred/.
import fs from 'fs';
import path from 'path';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { ZSCORE_PAIRS, buildRollingZSeries, buildDayIndex, _shiftDate } from '../../js/zscoreSpreadEngine.js';
import { directionFromZ, resolveInverted } from '../../js/yieldSpreadCore.js';
import { usdRole } from '../../js/macroDirectionCore.js';

const OUT = 'analysis/output/meta_proper';
const FRED_DIR = path.join(OUT, 'fred');
const FROM = '2016-01-01', TO = '2026-08-20';
const Z_WIN = 126, Z_FIRE = 1.0, CUSUM_H = 1.0, BARRIER = 2.0, HORIZON = 10, COST = 0.0002;
const LAG_US = 2, LAG_FOR = 45;
fs.mkdirSync(FRED_DIR, { recursive: true });

async function fred(id) {
  const f = path.join(FRED_DIR, `${id}.csv`);
  if (!fs.existsSync(f)) {
    const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`FRED ${id} HTTP ${r.status}`);
    fs.writeFileSync(f, await r.text());
  }
  const m = new Map();
  for (const line of fs.readFileSync(f, 'utf8').trim().split('\n').slice(1)) {
    const [d, v] = line.split(',');
    const x = parseFloat(v);
    if (Number.isFinite(x)) m.set(d, x);
  }
  return m;
}
const shift = (obs, days) => new Map([...obs].map(([d, v]) => [_shiftDate(d, days), v]));

function sigmaByDate(sym) {
  const [head, ...rows] = fs.readFileSync(`analysis/output/forecast_history/${sym}.csv`, 'utf8').trim().split('\n');
  const H = head.split(','), iD = H.indexOf('date'), iS = H.indexOf('pit_sig_used');
  return new Map(rows.map(r => r.split(',')).map(c => [c[iD], +c[iS]]));
}

const r6 = x => (x == null || !Number.isFinite(x)) ? '' : Math.round(x * 1e6) / 1e6;
const HEAD = ['pair', 'date', 'i', 'close', 'sigma_pct', 'z', 'spread', 'dz5', 'since_cross', 'cusum_dir', 'side',
  'long_bar', 'long_exit', 'long_ret', 'short_bar', 'short_exit', 'short_ret'];
const rows = [HEAD.join(',')];
const summary = [];

for (const [pairKey, cfg] of Object.entries(ZSCORE_PAIRS)) {
  const sym = cfg.label;
  const packed = await loadM1ForPair(pairKey);
  // UTC daily OHLC (the yield-spread engine's day grouping)
  const daily = [];
  for (const [date, { start, end }] of buildDayIndex(packed.times)) {
    if (date < FROM || date > TO) continue;
    let hi = -Infinity, lo = Infinity;
    for (let k = start; k < end; k++) { if (packed.highs[k] > hi) hi = packed.highs[k]; if (packed.lows[k] < lo) lo = packed.lows[k]; }
    const c = packed.closes[end - 1];
    if (Number.isFinite(c) && end - start >= 60) daily.push({ date, high: hi, low: lo, close: c });
  }
  daily.sort((a, b) => (a.date < b.date ? -1 : 1));
  fs.writeFileSync(path.join(OUT, `daily_${sym}.csv`), 'date,high,low,close\n' + daily.map(d => `${d.date},${d.high},${d.low},${d.close}`).join('\n') + '\n');

  const zBy = buildRollingZSeries(shift(await fred(cfg.baseSeries), LAG_US), shift(await fred(cfg.quoteSeries), LAG_FOR), Z_WIN, FROM, TO);
  const inverted = resolveInverted(usdRole(pairKey), { autoOrient: true });
  const sig = sigmaByDate(sym);

  // triple barrier for one side from day i (entry at close i), days i+1..i+HORIZON
  const barrier = (i, dir, sPct) => {
    const e = daily[i].close, w = BARRIER * sPct / 100 * e;
    const up = e + w, dn = e - w;
    for (let j = i + 1; j <= Math.min(i + HORIZON, daily.length - 1); j++) {
      const hitUp = daily[j].high >= up, hitDn = daily[j].low <= dn;
      if (dir > 0) { if (hitDn) return ['sl', daily[j].date, -w / e - COST]; if (hitUp) return ['pt', daily[j].date, w / e - COST]; }
      else { if (hitUp) return ['sl', daily[j].date, -w / e - COST]; if (hitDn) return ['pt', daily[j].date, w / e - COST]; }
    }
    const j = Math.min(i + HORIZON, daily.length - 1);
    if (j <= i) return null;
    return ['vt', daily[j].date, dir * (daily[j].close - e) / e - COST];
  };

  let sPos = 0, sNeg = 0, lastAbove = null, nEv = 0, nFire = 0;
  const zHist = [];
  for (let i = 1; i < daily.length; i++) {
    const zi = zBy.get(daily[i].date);
    zHist.push(zi ? zi.z : null);
    if (zi && Math.abs(zi.z) < Z_FIRE) lastAbove = null;
    else if (zi && lastAbove == null) lastAbove = i;
    const sPct = sig.get(daily[i].date);
    const r = Math.log(daily[i].close / daily[i - 1].close);
    if (!(sPct > 0)) continue;
    const h = CUSUM_H * sPct / 100;
    sPos = Math.max(0, sPos + r); sNeg = Math.min(0, sNeg + r);
    let dirEv = 0;
    if (sPos > h) { dirEv = 1; sPos = 0; } else if (sNeg < -h) { dirEv = -1; sNeg = 0; }
    if (!dirEv || !zi || i + 1 >= daily.length) continue;
    nEv++;
    const z = zi.z, fires = Math.abs(z) >= Z_FIRE;
    const side = fires ? (directionFromZ(z, inverted) === 'LONG' ? 1 : -1) : 0;
    if (fires) nFire++;
    const z5 = zHist.length > 5 ? zHist[zHist.length - 6] : null;
    const L = barrier(i, 1, sPct), S = barrier(i, -1, sPct);
    if (!L || !S) continue;
    rows.push([sym, daily[i].date, i, r6(daily[i].close), sPct, r6(z), r6(zi.spread), z5 == null ? '' : r6(z - z5),
      fires && lastAbove != null ? i - lastAbove : '', dirEv, side, L[0], L[1], r6(L[2]), S[0], S[1], r6(S[2])].join(','));
  }
  summary.push(`${sym}: ${daily.length} days, ${nEv} CUSUM events, primary fires on ${nFire}`);
  console.log(summary.at(-1));
}
fs.writeFileSync(path.join(OUT, 'events.csv'), rows.join('\n') + '\n');
console.log(`wrote ${rows.length - 1} events`);
