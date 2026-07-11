/**
 * Forecast-Accuracy Engine — two lenses on the SAME forecast line, per pair.
 *
 * The point of the vol forecast (per COG's own manual, and our null on the fade) is an
 * ACCURATE range for sizing/reference — not a trade signal. A colleague's "win rate" is
 * exactly this: realized range within ±5% of the forecast (±10% for O-H/O-L). So this
 * measures WHAT the forecast is actually good for, honestly, and keeps the exhaustion
 * view alongside so the two are never conflated (they are DIFFERENT quantities — an
 * accurate range magnitude says nothing about where price reverses).
 *
 * PANEL A — Volatility (range) accuracy.
 *   For each London day, realized H-L% and O-C% vs the forecast MEDIAN, across three
 *   calibrations: Feller (1.572σ), COG (1.56σ, reverse-engineered), and our backtest
 *   recal (per-class, tighter). "Hit" = |realized − forecast| / forecast ≤ 5%. Reported
 *   with the EXCEED rate (realized > median) — the real calibration tell: a well-placed
 *   median is exceeded ~50% of days; < 50% ⇒ the line runs wide, > 50% ⇒ too tight.
 *   Benchmarked against a NAIVE persistence forecast (trailing median realized range) —
 *   a calibration only "wins" if it beats naive AND the others.
 *
 * PANEL B — Exhaustion / level-fade (the other question, kept visible, already answered).
 *   Where the day's DOMINANT reversal actually lands ÷ the realized median range (the
 *   ~0.65× FX finding); how often the Feller median line is even TOUCHED; and of those
 *   touches, how often price REVERTS (fade would win) vs blows THROUGH.
 *
 * Honest note: the ±5% hit rate is LOW in absolute terms (~15–25%) for ANY forecast —
 * daily range is noisy, so it lands within ±5% of the median only ~1 day in 4–5. The
 * metric is only meaningful RELATIVE (which calibration hits most / exceeds nearest 50%).
 *
 * Pure + composes existing bricks; no new vol math.
 */
import { buildLondonDaily } from './volEstimatorAB.js';
import { yzVolSeries } from './volBacktestEngine.js';
import { _zigzag } from './reversalPointResearch.js';
import { _dynLevelOutcome } from './intradayForecastResearch.js';
import { pipSize } from './instrumentRegistry.js';
import { pairType } from './crossPairResearch.js';

const _sort = a => [...a].sort((x, y) => x - y);
const _median = a => { if (!a.length) return 0; const s = _sort(a); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const _pct = (a, p) => { if (!a.length) return 0; const s = _sort(a); const i = p / 100 * (s.length - 1), lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r3 = x => x == null ? null : Math.round(x * 1000) / 1000;

// Median H-L / O-C constants (× daily σ) per calibration. Feller = driftless BM
// (H-L P50 = 1.572σ, O-C P50 = 0.6745σ half-normal). COG = reverse-engineered.
const SETS = { feller: { hl: 1.572, oc: 0.6745 }, cog: { hl: 1.56, oc: 0.74 } };
const RECAL_HL = { fx: 0.85, commodity: 0.878, index: 1.0 };   // H-L recal factor (our research book)
const _class = pair => { const t = pairType(pair); return t === 'index' ? 'index' : t === 'gold' ? 'commodity' : 'fx'; };

export function forecastAccuracy(intraday, opts = {}) {
  const { pair = 'EURUSD', band = 0.05, naiveWin = 20, minLookback = 40, minBarsPerDay = 6, revFrac = 0.25 } = opts;
  const lond = buildLondonDaily(intraday);
  if (lond.length < 120) return { insufficient: true, nDays: lond.length };
  const cls = _class(pair), pip = pipSize(pair);
  const yz = yzVolSeries(lond, 30);                          // daily σ series, causal
  const sets = { ...SETS, recal: { hl: 1.572 * RECAL_HL[cls], oc: 0.6745 } };
  const setNames = ['feller', 'cog', 'recal'];

  const acc = {}; for (const s of [...setNames, 'naive']) acc[s] = { hlHit: 0, hlExc: 0, ocHit: 0, ocExc: 0 };
  let nA = 0;
  const realizedHL = [];                                     // for the naive trailing-median benchmark
  const hlOverSig = [], ocOverSig = [];                      // realized ÷ σ → the exceed-neutral constant

  // Panel B state
  const domRuns = [];
  let touch = 0, revert = 0, cont = 0, nB = 0;
  const rangePrice = lond.map(d => d.high - d.low).filter(x => x > 0);
  const medRangePricePct = _median(lond.map(d => (d.high - d.low) / d.open * 100).filter(x => x > 0));
  const thr = revFrac * _median(rangePrice);                // zigzag threshold, price units

  for (let i = 0; i < lond.length; i++) {
    const d = lond[i];
    const rHL = (d.high - d.low) / d.open * 100, rOC = Math.abs(d.close - d.open) / d.open * 100;
    realizedHL.push(rHL);
    const sig = i > 0 ? yz[i - 1] : 0;                       // σ forecast for day i (causal)

    // ── Panel A: range-magnitude accuracy ──
    if (i >= minLookback && sig > 0) {
      const sp = sig * 100;
      nA++;
      for (const s of setNames) {
        const fHL = sets[s].hl * sp, fOC = sets[s].oc * sp;
        if (fHL > 0 && Math.abs(rHL - fHL) / fHL <= band) acc[s].hlHit++;
        if (rHL > fHL) acc[s].hlExc++;
        if (fOC > 0) { if (Math.abs(rOC - fOC) / fOC <= band) acc[s].ocHit++; if (rOC > fOC) acc[s].ocExc++; }
      }
      const nf = _median(realizedHL.slice(Math.max(0, i - naiveWin), i));   // persistence forecast
      if (nf > 0) { if (Math.abs(rHL - nf) / nf <= band) acc.naive.hlHit++; if (rHL > nf) acc.naive.hlExc++; }
      // Exceed-neutral constant: median(realized ÷ σ). By construction, realized exceeds
      // (this const × σ) exactly 50% of days — i.e. the correctly-calibrated median.
      hlOverSig.push(rHL / sp);
      if (rOC > 0) ocOverSig.push(rOC / sp);
    }

    // ── Panel B: exhaustion / fade at the Feller median line ──
    if (i >= minLookback && sig > 0 && d.bars && d.bars.length >= minBarsPerDay && d.open > 0) {
      nB++;
      const r = 1.572 * sig;                                 // the "exhaustion median" line, dynamic
      let touched = false;
      for (const dir of [+1, -1]) {
        const o = _dynLevelOutcome(d.bars, r, dir, pip);
        if (!o) continue;
        touched = true;
        if (o.outcome === 'reverse') revert++; else if (o.outcome === 'continue') cont++;
      }
      if (touched) touch++;
      // Dominant reversal run ÷ median range (where price ACTUALLY exhausts).
      let rl = d.bars[0].low, rh = d.bars[0].high, ptr = 0, domHi = 0, domLo = 0;
      for (const p of _zigzag(d.bars, thr).slice(1)) {
        while (ptr <= p.idx) { if (d.bars[ptr].low < rl) rl = d.bars[ptr].low; if (d.bars[ptr].high > rh) rh = d.bars[ptr].high; ptr++; }
        const re = p.kind === 'high' ? (p.price - rl) / d.open * 100 : (rh - p.price) / d.open * 100;
        if (re > 0) { if (p.kind === 'high') { if (re > domHi) domHi = re; } else { if (re > domLo) domLo = re; } }
      }
      if (domHi > 0) domRuns.push(domHi); if (domLo > 0) domRuns.push(domLo);
    }
  }

  const rate = (x, n) => n ? r3(x / n * 100) : null;
  const panelA = {};
  for (const s of setNames) panelA[s] = {
    hl_const: r3(sets[s].hl), oc_const: r3(sets[s].oc),
    hlHit5: rate(acc[s].hlHit, nA), hlExceed: rate(acc[s].hlExc, nA),
    ocHit5: rate(acc[s].ocHit, nA), ocExceed: rate(acc[s].ocExc, nA),
  };
  panelA.naive = { hlHit5: rate(acc.naive.hlHit, nA), hlExceed: rate(acc.naive.hlExc, nA) };

  // ── Calibration proposal: the exceed-neutral constants (50% exceed by construction).
  // These are the data-derived median constants to feed the export / sizing — they fix
  // ANY class (incl. indices, which raw Feller/COG leave too wide) without guessing.
  const calHl = hlOverSig.length ? _median(hlOverSig) : null;
  const calOc = ocOverSig.length ? _median(ocOverSig) : null;
  const calibrated = {
    hl_const: r3(calHl), oc_const: r3(calOc),
    hl_vs_feller: calHl != null ? r3(calHl / 1.572) : null,   // factor vs raw Feller (×<1 ⇒ Feller too wide)
    oc_vs_feller: calOc != null ? r3(calOc / 0.6745) : null,
  };

  const domP50 = domRuns.length ? _pct(domRuns, 50) : null;
  const panelB = {
    nDays: nB,
    medRangePct: r3(medRangePricePct),
    reversalRunP50pct: r3(domP50),
    reversalOverMedian: (domP50 != null && medRangePricePct > 0) ? r3(domP50 / medRangePricePct) : null,
    medianTouchRate: rate(touch, nB),
    revertOfTouch: (revert + cont) ? r3(revert / (revert + cont) * 100) : null,
    continueOfTouch: (revert + cont) ? r3(cont / (revert + cont) * 100) : null,
  };

  return { pair, cls, nDays: lond.length, dateFrom: lond[0].date, dateTo: lond.at(-1).date, band, nA, panelA, panelB, calibrated };
}
