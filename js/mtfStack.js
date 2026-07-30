/**
 * MTF Stack — N timeframes of ONE directional series, causally aligned, with a
 * per-bar alignment score. "Do 1m / 3m / 5m / 15m all point the same way, and how
 * strongly?" as an image plus a number.
 *
 * Generalises the 2-timeframe `vumanchuMtf` to an arbitrary list (2–6). Reuses
 * `vumanchuMtf.alignHtfCausal` for the step-hold — the causality guard is NOT
 * reimplemented here — plus `vumanchuCore` and `vwapReversionEngine`'s existing
 * session-VWAP for the series maths, and `pngCanvas` to draw.
 *
 * ── READ THIS BEFORE ASKING FOR "MULTI-TIMEFRAME VWAP" ───────────────────────
 * A true VWAP is very nearly TIMEFRAME-INVARIANT, so comparing "the 1m VWAP" with
 * "the 15m VWAP" is degenerate — it is the same number computed several times, and
 * returns ~100% agreement as arithmetic, not as evidence.
 *
 * Measured on one synthetic price path (2400 M1 bars aggregated to M3/M5/M15),
 * cumulative VWAP per timeframe against the M1 VWAP at the same instants:
 *
 *     M3   mean |rel diff|  6.7 ppm   max 19.8 ppm   slope-direction agreement 100.0%
 *     M5   mean |rel diff| 13.2 ppm   max 38.7 ppm   slope-direction agreement 100.0%
 *     M15  mean |rel diff| 44.4 ppm   max 115.3 ppm  slope-direction agreement 100.0%
 *
 * Why: VWAP = Σ(typical price × volume) / Σ(volume). Bucketing bars coarsely barely
 * changes either sum — the only discrepancy is that a bucket's (H+L+C)/3 differs
 * slightly from the mean of its constituent bars' (H+L+C)/3. Hence parts-per-million.
 *
 * Nor does taking the SLOPE of a cumulative VWAP rescue it. A cumulative average is
 * a slow monotone curve: its slope sign flipped only **2 times in an entire
 * session** (0.07% of M1 bars), so "is the VWAP rising" is the same answer at every
 * timeframe — measured all-agree 99.4%.
 *
 * What DOES work is a **ROLLING-window** VWAP, because the window length scales with
 * the timeframe (20 M1 bars = 20 minutes; 20 M15 bars = 5 hours) so the curves are
 * genuinely different objects. Same fixture, sign of the series, agreement across
 * M1/M3/M5/M15:
 *
 *     cumulative VWAP slope        99.4%   <- degenerate
 *     price vs cumulative VWAP     99.3%   <- degenerate
 *     price vs rolling VWAP(20)    76.7%   <- usable  (default)
 *     rolling VWAP(20) slope       74.1%   <- usable
 *
 * Sign-flip rates confirm the mechanism: rolling(20) flipped 22 times on M1 and 0
 * times on M15 over one fixture, whereas the cumulative version flipped twice at
 * every timeframe.
 *
 * `SERIES_SOURCES` therefore marks each series `tfDependent`, `buildMtfStack` emits
 * a `degenerate` warning when a stack is built on one that is not, and the renderer
 * stamps that warning on the image. The degenerate variants are KEPT rather than
 * deleted so the effect stays inspectable.
 *
 * ── "CONFIDENCE" IS CALLED WHAT IT IS ────────────────────────────────────────
 * `alignmentScore` is the mean of the per-timeframe direction signs: −1 (all down)
 * through 0 (evenly split) to +1 (all up). It is a DESCRIPTION of how unanimous the
 * timeframes are right now. It is deliberately NOT named "confidence": that would
 * imply predictive weight, and nothing here has been tested for predictive value.
 * As in `vumanchuMtf`, agreement ships with `baselinePct` from deterministic
 * circular re-phasings, because timeframes of one series on one price agree heavily
 * by construction. Read `delta`.
 *
 * Pure — no DOM, no network, no globals. Tested in js/mtfStack.test.mjs.
 */
import { computeWaveTrend } from './vumanchuCore.js';
import { computeSessionVwap } from './vwapReversionEngine.js';
import { alignHtfCausal, barSec, inferPeriodSec, TF_SECONDS } from './vumanchuMtf.js';
import { createCanvas, measureText, GLYPH_H } from './pngCanvas.js';
import { THEME } from './vumanchuChart.js';

export { TF_SECONDS };
export const MIN_BARS = 40;        // per timeframe
export const MAX_TFS = 6;

export const STACK_THEME = {
  up: '#22c55e', down: '#ef4444', flat: '#3a4456',
  line: '#5bc0f8', score: '#c084fc',
  rowAlt: '#0e1420',
};

// Session-anchored VWAP: one cumulative VWAP per UTC day, reusing the existing
// `computeSessionVwap` brick per day-slice rather than adding a fourth VWAP
// definition to the codebase (three already exist — see LEGO_MODULES §2).
function sessionVwapSeries(bars) {
  const out = new Float64Array(bars.length);
  let start = 0;
  const dayOf = b => { const s = barSec(b); return s == null ? 0 : Math.floor(s / 86400); };
  for (let i = 1; i <= bars.length; i++) {
    if (i === bars.length || dayOf(bars[i]) !== dayOf(bars[start])) {
      const { vwap } = computeSessionVwap(bars.slice(start, i));
      for (let k = 0; k < vwap.length; k++) out[start + k] = vwap[k];
      start = i;
    }
  }
  return out;
}

/**
 * Directional series a stack can be built on. Each `compute` returns one value per
 * bar whose SIGN is the directional read (>0 up, <0 down, 0/NaN no opinion).
 *
 * `tfDependent: false` means the series barely changes when you recompute it on a
 * coarser timeframe — a stack over it is arithmetic, not information.
 */
// Rolling VWAP over the last `w` bars of WHATEVER timeframe it is given. Not
// session-anchored (that is what the cumulative variants are for) — a rolling
// window is the standard definition and it is what makes the series genuinely
// timeframe-dependent: 20 M1 bars is 20 minutes, 20 M15 bars is 5 hours.
function rollingVwap(bars, w) {
  const out = new Array(bars.length).fill(NaN);
  let tpv = 0, vol = 0;
  const tps = [], vs = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const tp = (b.high + b.low + b.close) / 3;
    const v = (b.volume ?? b.tick_volume ?? 1) || 1;
    tps.push(tp); vs.push(v); tpv += tp * v; vol += v;
    if (tps.length > w) { tpv -= tps[i - w] * vs[i - w]; vol -= vs[i - w]; }
    if (i >= w - 1 && vol > 0) out[i] = tpv / vol;
  }
  return out;
}

export const SERIES_SOURCES = {
  vwap_roll_dist: {
    label: 'Price vs rolling VWAP',
    tfDependent: true,
    note: 'Close minus a ROLLING VWAP over the last `window` bars of each timeframe, in bp. Timeframe-dependent because the window length scales with the timeframe (20 M1 bars = 20min, 20 M15 bars = 5h). Measured all-agree 76.7% across M1/M3/M5/M15 — real disagreement to look at.',
    compute(bars, { window = 20 } = {}) {
      const v = rollingVwap(bars, window);
      return bars.map((b, i) => v[i] > 0 ? (b.close - v[i]) / v[i] * 1e4 : NaN);
    },
  },
  vwap_roll_slope: {
    label: 'Rolling VWAP slope',
    tfDependent: true,
    note: 'Slope of the rolling VWAP over `slopeBars` bars of each timeframe, in bp. Measured all-agree 74.1% across M1/M3/M5/M15. Sign-flip rate differs sharply by timeframe (22 flips on M1 vs 0 on M15 over one fixture) — which is exactly the timeframe dependence a stack needs.',
    compute(bars, { window = 20, slopeBars = 1 } = {}) {
      const v = rollingVwap(bars, window);
      const out = new Array(bars.length).fill(NaN);
      for (let i = slopeBars; i < bars.length; i++) {
        if (v[i] > 0 && v[i - slopeBars] > 0) out[i] = (v[i] - v[i - slopeBars]) / v[i - slopeBars] * 1e4;
      }
      return out;
    },
  },
  vwap_cum_slope: {
    label: 'Session VWAP slope',
    tfDependent: false,
    note: 'DEGENERATE FOR STACKS. Slope of the session-anchored cumulative VWAP. A cumulative average is a slow monotone curve — its slope sign flipped only 2 times in an entire session (0.07% of M1 bars) — so every timeframe returns the same answer: measured all-agree 99.4%. Kept so the degeneracy is inspectable rather than just asserted.',
    compute(bars, { slopeBars = 1 } = {}) {
      const v = sessionVwapSeries(bars);
      const out = new Array(bars.length).fill(NaN);
      for (let i = slopeBars; i < bars.length; i++) {
        const a = barSec(bars[i - slopeBars]), b = barSec(bars[i]);
        if (a != null && b != null && Math.floor(a / 86400) !== Math.floor(b / 86400)) continue;   // no slope across the anchor reset
        if (v[i] > 0 && v[i - slopeBars] > 0) out[i] = (v[i] - v[i - slopeBars]) / v[i - slopeBars] * 1e4;
      }
      return out;
    },
  },
  vwap_cum_dist: {
    label: 'Price vs session VWAP',
    tfDependent: false,
    note: 'DEGENERATE FOR STACKS. Close minus the session-anchored VWAP, in session sigma. Both price and a cumulative VWAP are near timeframe-invariant (M1-vs-M15 VWAP differ by ~115 ppm), so measured all-agree 99.3%. Genuinely useful as a SINGLE-timeframe read; meaningless stacked.',
    compute(bars) {
      const out = new Array(bars.length).fill(NaN);
      let start = 0;
      const dayOf = b => { const s = barSec(b); return s == null ? 0 : Math.floor(s / 86400); };
      for (let i = 1; i <= bars.length; i++) {
        if (i === bars.length || dayOf(bars[i]) !== dayOf(bars[start])) {
          const slice = bars.slice(start, i);
          const { vwap, sd } = computeSessionVwap(slice);
          for (let k = 0; k < slice.length; k++) out[start + k] = sd[k] > 0 ? (slice[k].close - vwap[k]) / sd[k] : 0;
          start = i;
        }
      }
      return out;
    },
  },
  wt_hist: {
    label: 'WaveTrend hist',
    tfDependent: true,
    note: 'wt1 − wt2, VuManChu’s wtVwap (the yellow line). Genuinely timeframe-dependent: measured up-fractions ran 30.9% / 37.2% / 41.8% / 48.7% at M1/M3/M5/M15 on one path.',
    compute(bars, { n1 = 9, n2 = 12, sp = 3 } = {}) {
      const { wt1, wt2 } = computeWaveTrend(bars, { n1, n2, sp });
      return wt1.map((v, i) => Number.isFinite(v) && Number.isFinite(wt2[i]) ? v - wt2[i] : NaN);
    },
  },
  wt_level: {
    label: 'WaveTrend level',
    tfDependent: true,
    note: 'wt1 itself — sign = which side of zero the wave sits.',
    compute(bars, { n1 = 9, n2 = 12, sp = 3 } = {}) {
      return computeWaveTrend(bars, { n1, n2, sp }).wt1;
    },
  },
};

const fin = v => Number.isFinite(v);
const sgn = v => !fin(v) || v === 0 ? 0 : v > 0 ? 1 : -1;

/**
 * Align N timeframes onto the fastest grid and score their agreement.
 *
 * `barsByTf` = { M1: bars[], M3: bars[], … } chronological (oldest first).
 * Timeframes are ordered fast→slow by period; the fastest becomes the x-axis and
 * every other series is step-held onto it CAUSALLY via alignHtfCausal.
 */
export function buildMtfStack(barsByTf, opts = {}) {
  const {
    source = 'vwap_roll_dist', displayBars = 240, baselineShifts = 24, seriesOpts = {},
  } = opts;
  const src = SERIES_SOURCES[source];
  if (!src) throw new Error(`mtfStack: unknown series "${source}" (${Object.keys(SERIES_SOURCES).join('|')})`);

  const tfs = Object.keys(barsByTf);
  if (tfs.length < 2) throw new Error('mtfStack: need at least 2 timeframes');
  if (tfs.length > MAX_TFS) throw new Error(`mtfStack: at most ${MAX_TFS} timeframes`);
  for (const tf of tfs) {
    if (!Array.isArray(barsByTf[tf]) || barsByTf[tf].length < MIN_BARS) {
      throw new Error(`mtfStack: ${tf} needs ≥${MIN_BARS} bars, got ${barsByTf[tf]?.length ?? 0}`);
    }
  }
  const secOf = tf => opts.tfSeconds?.[tf] ?? TF_SECONDS[tf] ?? inferPeriodSec(barsByTf[tf]);
  const ordered = [...tfs].sort((a, b) => secOf(a) - secOf(b));
  const seenSec = new Set();
  for (const tf of ordered) {
    const s = secOf(tf);
    if (!s) throw new Error(`mtfStack: cannot determine the period of ${tf}`);
    if (seenSec.has(s)) throw new Error(`mtfStack: duplicate timeframe period for ${tf}`);
    seenSec.add(s);
  }
  const fastTf = ordered[0];
  const fastBars = barsByTf[fastTf];
  const fastSec = secOf(fastTf);

  // Series per timeframe, then step-held onto the fast grid (the fastest is
  // already on it). `rows` is fast→slow, which is also top→bottom in the image.
  const rows = ordered.map(tf => {
    const raw = src.compute(barsByTf[tf], seriesOpts);
    const values = tf === fastTf
      ? Array.from(raw)
      : alignHtfCausal(fastBars, barsByTf[tf], raw, { fastSec, slowSec: secOf(tf) }).values;
    return { tf, sec: secOf(tf), values, dir: values.map(sgn) };
  });

  // Visible window: last displayBars, pushed past the warm-up of every row.
  const firstFin = arr => { for (let i = 0; i < arr.length; i++) if (arr[i] !== 0) return i; return arr.length; };
  const warm = Math.max(...rows.map(r => firstFin(r.dir)));
  const to = fastBars.length - 1;
  const from = Math.max(Math.min(warm, to), fastBars.length - displayBars);
  const nVis = to - from + 1;

  // Per-bar score over the VISIBLE WINDOW ONLY, so the number describes the same
  // bars as the picture (the same trap fixed in vumanchuMtf).
  const scoreOf = (dirRows, i) => {
    let sum = 0, n = 0;
    for (const d of dirRows) { if (d[i] !== 0) { sum += d[i]; n++; } }
    return n ? { score: sum / n, n, unanimous: Math.abs(sum) === n } : { score: null, n: 0, unanimous: null };
  };
  const score = [], unanimous = [];
  for (let i = from; i <= to; i++) {
    const s = scoreOf(rows.map(r => r.dir), i);
    score.push(s.score);
    unanimous.push(s.n >= 2 ? s.unanimous : null);
  }
  const pctOf = a => { let n = 0, k = 0; for (const v of a) { if (v === null) continue; n++; if (v) k++; } return n ? { pct: k / n * 100, n } : { pct: null, n: 0 }; };
  const actual = pctOf(unanimous);

  // Baseline: deterministic circular re-phasings of every NON-fastest row, which
  // keeps each row's own persistence but destroys the real time correspondence.
  const rot = (a, by) => { const o = new Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[(i + by) % a.length]; return o; };
  const samples = [];
  for (let k = 1; k <= baselineShifts && nVis > 8; k++) {
    const by = Math.floor(nVis * k / (baselineShifts + 1));
    if (by <= 0 || by >= nVis) continue;
    const shifted = rows.map((r, idx) => idx === 0 ? r.dir.slice(from, to + 1) : rot(r.dir.slice(from, to + 1), by));
    const u = [];
    for (let i = 0; i < nVis; i++) { const s = scoreOf(shifted, i); u.push(s.n >= 2 ? s.unanimous : null); }
    const p = pctOf(u);
    if (p.pct != null) samples.push(p.pct);
  }
  const baselinePct = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : null;

  const lastScore = score[nVis - 1];
  return {
    source, sourceLabel: src.label, sourceNote: src.note,
    degenerate: src.tfDependent ? null
      : `"${source}" is not meaningfully timeframe-dependent, so agreement across timeframes is arithmetic rather than information. Use a tfDependent series (${Object.keys(SERIES_SOURCES).filter(k => SERIES_SOURCES[k].tfDependent).join(', ')}).`,
    fastTf, tfs: ordered, rows, from, to, nVis, fastSec,
    score, unanimous,
    agreement: {
      unanimousPct: actual.pct, comparableBars: actual.n,
      baselinePct, delta: actual.pct != null && baselinePct != null ? actual.pct - baselinePct : null,
      baselineShifts: samples.length,
    },
    reading: {
      alignmentScore: lastScore,
      direction: lastScore == null ? null : lastScore > 0 ? 'up' : lastScore < 0 ? 'down' : 'split',
      unanimous: unanimous[nVis - 1],
      perTf: rows.map(r => ({ tf: r.tf, dir: r.dir[to], value: fin(r.values[to]) ? +r.values[to].toFixed(4) : null })),
      runBars: (() => {
        const cur = unanimous[nVis - 1];
        if (cur === null || cur === undefined) return null;
        let n = 0; for (let k = nVis - 1; k >= 0 && unanimous[k] === cur; k--) n++;
        return n;
      })(),
    },
  };
}

// ── PNG ──────────────────────────────────────────────────────────────────────
// Layout: the fastest timeframe's series as a context line on top, then ONE
// labelled ribbon row per timeframe (fast→slow), then the signed alignment score
// as a histogram. Ribbon rows sidestep the scale problem entirely — N series with
// different units cannot share one y-axis honestly, but their SIGNS can.
export function renderMtfStackPNG(barsByTf, opts = {}) {
  const S = buildMtfStack(barsByTf, opts);
  const o = { width: 1200, height: 520, tzOffsetMin: 0, title: '', ...opts };
  const T = THEME, K = STACK_THEME;
  const cv = createCanvas(o.width, o.height, T.bg);

  const padL = 44, padR = 58, padT = 30, padB = 20;
  const rowH = 16, gap = 3;
  const ribbonH = S.rows.length * (rowH + gap);
  const scoreH = 54;
  const lineH = Math.max(80, o.height - padT - padB - ribbonH - scoreH - 16);
  const lineTop = padT, plotW = o.width - padL - padR;
  const ribTop = lineTop + lineH + 8;
  const scoreTop = ribTop + ribbonH + 8;

  const xToPx = i => S.nVis <= 1 ? padL + plotW : padL + ((i - S.from) / (S.nVis - 1)) * plotW;
  const barW = Math.max(1, plotW / Math.max(1, S.nVis - 1));

  // ── context line: the fastest timeframe's own series ──
  cv.rect(padL, lineTop, plotW, lineH, T.panel);
  const fastVals = S.rows[0].values;
  let peak = 0;
  for (let i = S.from; i <= S.to; i++) if (fin(fastVals[i])) peak = Math.max(peak, Math.abs(fastVals[i]));
  const yMid = lineTop + lineH / 2;
  const yToPx = v => peak > 0 ? yMid - (v / (peak * 1.1)) * (lineH / 2) : yMid;
  cv.line(padL, yMid, padL + plotW, yMid, { color: T.zero, width: 1.1 });
  const pts = [];
  for (let i = S.from; i <= S.to; i++) pts.push(fin(fastVals[i]) ? { x: xToPx(i), y: yToPx(fastVals[i]) } : null);
  cv.polyline(pts, { color: K.line, width: 1.8 });
  cv.text(padL + 4, lineTop + 4, `${S.rows[0].tf} ${S.sourceLabel}`.toUpperCase(), { color: T.text, scale: 1 });
  if (peak > 0) {
    const last = fastVals[S.to];
    if (fin(last)) {
      const txt = `${last >= 0 ? '+' : ''}${last.toFixed(2)}`;
      cv.text(padL + plotW + 5, yToPx(last) - GLYPH_H / 2, txt, { color: K.line, scale: 1 });
    }
  }

  // ── one ribbon row per timeframe ──
  S.rows.forEach((r, ri) => {
    const y = ribTop + ri * (rowH + gap);
    cv.rect(padL, y, plotW, rowH, K.rowAlt);
    for (let i = S.from; i <= S.to; i++) {
      const d = r.dir[i];
      cv.rect(xToPx(i), y, barW + 0.6, rowH, d > 0 ? K.up : d < 0 ? K.down : K.flat);
    }
    // Left label, right-aligned into the gutter.
    const w = measureText(r.tf, 1);
    cv.text(padL - w - 6, y + (rowH - GLYPH_H) / 2, r.tf, { color: T.textBright, scale: 1 });
  });

  // ── alignment score histogram ──
  cv.rect(padL, scoreTop, plotW, scoreH, T.panel);
  const sMid = scoreTop + scoreH / 2;
  cv.line(padL, sMid, padL + plotW, sMid, { color: T.zero, width: 1 });
  for (let k = 0; k < S.nVis; k++) {
    const v = S.score[k];
    if (v == null || v === 0) continue;
    const h = Math.abs(v) * (scoreH / 2 - 2);
    cv.rect(xToPx(S.from + k), v > 0 ? sMid - h : sMid, barW + 0.6, h, v > 0 ? K.up : K.down);
  }
  cv.text(padL - measureText('SCR', 1) - 6, sMid - GLYPH_H / 2, 'SCR', { color: T.text, scale: 1 });
  cv.text(padL + plotW + 5, scoreTop + 2, '+1', { color: T.grid, scale: 1 });
  cv.text(padL + plotW + 5, scoreTop + scoreH - GLYPH_H - 2, '-1', { color: T.grid, scale: 1 });

  // ── header ──
  const title = (o.title || 'MTF STACK').toUpperCase();
  cv.text(padL - 34, 8, title, { color: T.textBright, scale: 2 });
  let hx = padL - 34 + measureText(title, 2) + 10;
  const sub = `${S.tfs.join('/')} ${S.sourceLabel}`.toUpperCase();
  cv.text(hx, 12, sub, { color: T.text, scale: 1 }); hx += measureText(sub, 1) + 10;
  const a = S.agreement;
  if (a.unanimousPct != null) {
    const lbl = `ALL-AGREE ${a.unanimousPct.toFixed(0)}%`;
    const col = a.delta == null ? T.text : a.delta > 4 ? K.up : a.delta < -4 ? K.down : T.text;
    cv.text(hx, 12, lbl, { color: col, scale: 1 }); hx += measureText(lbl, 1) + 5;
    if (a.baselinePct != null) {
      const b = `VS ${a.baselinePct.toFixed(0)}% BASE`;
      cv.text(hx, 12, b, { color: T.text, scale: 1 }); hx += measureText(b, 1) + 10;
    }
  }
  const sc = S.reading.alignmentScore;
  if (sc != null) {
    const txt = `SCORE ${sc >= 0 ? '+' : ''}${sc.toFixed(2)}`;
    cv.text(o.width - 8 - measureText(txt, 1), 12, txt, { color: sc > 0 ? K.up : sc < 0 ? K.down : T.text, scale: 1 });
  }
  if (S.degenerate) cv.text(padL, o.height - GLYPH_H - 2, 'DEGENERATE SERIES - AGREEMENT IS ARITHMETIC', { color: K.down, scale: 1 });

  // ── time axis ──
  const bars = barsByTf[S.fastTf];
  const ticks = Math.min(6, S.nVis);
  for (let k = 0; k < ticks; k++) {
    const i = S.from + Math.round((k / Math.max(1, ticks - 1)) * (S.nVis - 1));
    const s = barSec(bars[i]);
    if (s == null) continue;
    const d = new Date(s * 1000 + o.tzOffsetMin * 60_000);
    const lbl = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    const w = measureText(lbl, 1);
    cv.text(Math.min(o.width - w - 2, Math.max(2, xToPx(i) - w / 2)), scoreTop + scoreH + 5, lbl, { color: T.text, scale: 1 });
  }
  return cv.toPNG();
}

// ── JSON / caption ───────────────────────────────────────────────────────────
export function mtfStackData(barsByTf, opts = {}) {
  const S = buildMtfStack(barsByTf, opts);
  const r3 = v => v == null || !fin(v) ? null : +v.toFixed(3);
  return {
    source: S.source, sourceLabel: S.sourceLabel, sourceNote: S.sourceNote,
    degenerate: S.degenerate,
    timeframes: S.tfs, fastTf: S.fastTf,
    reading: {
      alignmentScore: r3(S.reading.alignmentScore),
      direction: S.reading.direction,
      unanimous: S.reading.unanimous,
      runBars: S.reading.runBars,
      perTf: S.reading.perTf,
    },
    agreement: {
      unanimousPct: r3(S.agreement.unanimousPct),
      baselinePct: r3(S.agreement.baselinePct),
      delta: r3(S.agreement.delta),
      comparableBars: S.agreement.comparableBars,
      baselineShifts: S.agreement.baselineShifts,
      note: 'unanimousPct = share of bars where EVERY timeframe pointed the same way. Timeframes of one series on one price agree heavily by construction, so read delta vs baselinePct. alignmentScore is the mean direction sign (-1..+1) — a DESCRIPTION of unanimity, deliberately not called "confidence": nothing here has been tested for predictive value.',
    },
    window: { from: S.from, to: S.to, bars: S.nVis },
  };
}

export function mtfStackCaption(barsByTf, opts = {}) {
  const d = mtfStackData(barsByTf, opts);
  const r = d.reading, a = d.agreement;
  const bits = [`📶 <b>${opts.title || 'MTF stack'}</b>`, `${d.timeframes.join('/')} ${d.sourceLabel}`];
  if (r.alignmentScore != null) {
    const icon = r.unanimous ? (r.alignmentScore > 0 ? '🟢' : '🔴') : '🟡';
    bits.push(`${icon} score ${r.alignmentScore >= 0 ? '+' : ''}${r.alignmentScore.toFixed(2)} (${r.direction}${r.unanimous ? ', unanimous' : ''})`);
  }
  bits.push(`all-agree ${a.unanimousPct?.toFixed(0) ?? '—'}% vs ${a.baselinePct?.toFixed(0) ?? '—'}% base`);
  if (d.degenerate) bits.push('⚠️ degenerate series');
  return bits.join(' · ');
}
