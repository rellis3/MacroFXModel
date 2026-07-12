/**
 * Fill-Realism Ladder — the honest test of the Per-Line Volatility tearsheet.
 *
 * The tearsheet reports Sharpe ~3.1 for the projected-high/low FADE. Its own
 * disclosure flags the crack: ~44% of trades are zero-duration — fill and exit
 * collapse onto one coarse bar, so the triple-barrier is NOT resolved by real
 * touch order; the walker fills the limit and then (TP is un-knowable on the
 * fill bar) marks to close. That HIDES the full outer-line stop losses on
 * continuation days and books only the drift — the exact favourable-marking
 * inflation the exhaustion Panel-2 → Panel-3 collapse already demonstrated.
 *
 * This isolates that one variable. It runs the SAME report primitive
 * (computeBands + simulateEntry + walkBars + volSigmaSeries — no new math) on
 * the SAME sessions at a LADDER of bar resolutions (1-min → coarse). The only
 * thing that changes is how finely the intrabar path is resolved:
 *   • coarse bars  → fill-then-mark-to-close dominates (≈ the tearsheet)
 *   • 1-minute M1  → real TP-vs-SL touch order, real stop losses taken (honest)
 * If the OOS Sharpe collapses as bars get finer toward the truth, the tearsheet
 * edge is a fill artifact, not an edge. A flat ladder would mean it's real.
 *
 * Pure; the server streams M1 at each step (loadM1Resampled) and passes the bar
 * arrays in. Runs per instrument, IS/OOS split, costs on.
 */
import { computeBands, simulateEntry, volSigmaSeries } from './forecastCore.js';
import { summarizeTrades } from './metricsCore.js';
import { costForPair, DEFAULT_SLIP_PCT } from './perLineStrategy.js';

// Group epoch-second bars into broker-day sessions split at `boundaryHour` UTC
// (the tearsheet's 22:00 boundary). Returns [{date, open, high, low, close, bars}].
export function sessionsAt(bars, boundaryHour = 22) { return _sessions(bars, boundaryHour); }
function _sessions(bars, boundaryHour = 22) {
  const map = new Map();
  for (const b of bars) {
    const t = b.time;
    const dt = new Date((typeof t === 'number' ? (t < 1e12 ? t * 1000 : t) : Date.parse(t)));
    const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
    if (dt.getUTCHours() >= boundaryHour) d.setUTCDate(d.getUTCDate() + 1);
    const key = d.toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(b);
  }
  const dates = [...map.keys()].sort();
  return dates.map(date => {
    const arr = map.get(date).slice().sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    let hi = -Infinity, lo = Infinity;
    for (const b of arr) { if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
    return { date, open: arr[0].open, high: hi, low: lo, close: arr.at(-1).close, bars: arr };
  });
}

const _durSec = (a, b) => {
  const toSec = t => typeof t === 'number' ? (t < 1e12 ? t : t / 1000) : (t instanceof Date ? t.getTime() / 1000 : Date.parse(t) / 1000);
  if (a == null || b == null) return null;
  return Math.abs(toSec(b) - toSec(a));
};
const r3 = (x, d = 3) => x == null || !isFinite(x) ? null : +x.toFixed(d);

// Run the report's projected-band fade over one granularity's sessions.
function _runGranularity(bars, { assetClass, isFrac, band, slMult, boundaryHour, warmup, costPct, slipPct, zeroDurMaxSec }) {
  const sess = _sessions(bars, boundaryHour);
  if (sess.length < 120) return { insufficient: true, nSessions: sess.length };
  const d1 = sess.map(s => ({ open: s.open, high: s.high, low: s.low, close: s.close }));
  const sig = volSigmaSeries(d1, assetClass);
  const split = Math.floor(sess.length * isFrac);
  const seg = { is: { pnls: [], dates: [] }, oos: { pnls: [], dates: [] } };
  let filled = 0, zeroDur = 0;
  for (let i = warmup; i < sess.length; i++) {
    const sigma = sig[i];
    if (!(sigma > 0)) continue;
    const s = sess[i];
    if (!s.bars || s.bars.length < 3 || !(s.open > 0)) continue;
    const bands = computeBands(s.open, sigma, assetClass);
    const r = simulateEntry({ open: s.open, bars: s.bars }, bands,
      { band, action: 'fade', dir: 'both', slMult, costPct, slipPct, dynamicHL: true });
    if (!r.filled) continue;
    filled++;
    const dur = _durSec(r.fillTime, r.exitTime);
    if (dur != null && dur <= zeroDurMaxSec) zeroDur++;
    const b = i < split ? seg.is : seg.oos;
    b.pnls.push(r.pnlPct); b.dates.push(s.date);
  }
  const oos = summarizeTrades(seg.oos.pnls, seg.oos.dates);
  const is = summarizeTrades(seg.is.pnls, seg.is.dates);
  return {
    nSessions: sess.length, filled,
    zeroDurPct: filled ? r3(zeroDur / filled * 100, 1) : null,
    is: { sharpe: is.sharpe, trades: is.trades },
    oos: { sharpe: oos.sharpe, trades: oos.trades, winRate: oos.winRate, expectancy: r3(oos.expectancy, 4) },
  };
}

// barsByStep: { '1': bars1min, '15': bars15min, '60': bars60min } — same underlying M1.
export function fillRealismLadder(barsByStep, opts = {}) {
  const {
    pair = 'EURUSD', assetClass = 'fx', isFrac = 0.5, band = 'hl75', slMult = 1.5,
    boundaryHour = 22, warmup = 40, zeroDurMaxSec = 90,
  } = opts;
  const costPct = opts.costPct ?? costForPair(pair, assetClass);
  const slipPct = opts.slipPct ?? (DEFAULT_SLIP_PCT[assetClass] ?? 0.006);

  const steps = Object.keys(barsByStep).map(Number).filter(n => n > 0).sort((a, b) => a - b);
  if (!steps.length) return { insufficient: true, reason: 'no bar sets' };

  const perStep = {};
  for (const st of steps) {
    const bars = barsByStep[String(st)] || barsByStep[st];
    if (!bars || !bars.length) { perStep[st] = { insufficient: true }; continue; }
    perStep[st] = _runGranularity(bars, { assetClass, isFrac, band, slMult, boundaryHour, warmup, costPct, slipPct, zeroDurMaxSec });
  }
  const ok = steps.filter(st => !perStep[st].insufficient);
  if (ok.length < 2) return { insufficient: true, reason: 'need ≥2 resolvable granularities', pair, perStep };

  const fineStep = ok[0], coarseStep = ok.at(-1);       // 1-min = honest, max = tearsheet-like
  const honest = perStep[fineStep].oos, coarse = perStep[coarseStep].oos;
  const drop = (coarse.sharpe ?? 0) - (honest.sharpe ?? 0);
  const retained = coarse.sharpe > 0 ? r3((honest.sharpe ?? 0) / coarse.sharpe, 2) : null;

  return {
    pair, assetClass, costPct, slipPct, band, slMult, boundaryHour, isFrac,
    steps: ok, fineStep, coarseStep,
    perStep,
    // The verdict: how much of the coarse (tearsheet-like) Sharpe survives at 1-min truth.
    honestSharpe: honest.sharpe, coarseSharpe: coarse.sharpe,
    sharpeDrop: r3(drop), fracRetained: retained,
    honestZeroDurPct: perStep[fineStep].zeroDurPct, coarseZeroDurPct: perStep[coarseStep].zeroDurPct,
    // artifact = most of the edge is gone at 1-min AND the coarse book was zero-duration-heavy
    artifact: (coarse.sharpe ?? 0) > 0.5 && (retained == null || retained < 0.5)
      && (perStep[coarseStep].zeroDurPct ?? 0) > 20,
  };
}
