/**
 * VuManChu MTF — two timeframes of the WaveTrend on ONE pane, plus an honest
 * agreement read. Does the 30m wave back what the 5m wave is doing, or fight it?
 *
 * Composes existing bricks; no new indicator maths:
 *   • `vumanchuCore.computeWaveTrend` — both timeframes, one compute
 *   • `pngCanvas` — the rasteriser
 *   • `vumanchuChart.THEME` — shares the sibling chart's palette so the two
 *     pictures read as one system
 *
 * ── THE X-AXIS IS THE *FAST* TIMEFRAME ───────────────────────────────────────
 * The slow wave is step-held onto the fast grid, NOT the other way round. Drawing
 * on the slow grid would force the fast series to be downsampled, destroying
 * exactly the detail the comparison is for. On the fast grid the slow wave becomes
 * a staircase that only moves when a slow bar closes — which is how you read it
 * live.
 *
 * ── THE LOOKAHEAD TRAP (the reason this is a brick and not three lines) ───────
 * The naive step-hold is "which slow bar contains this fast bar? use its value".
 * That LEAKS THE FUTURE: it shows the completed 30m reading during the 27 minutes
 * before that 30m bar had closed. It is the Pine `request.security` repainting
 * bug. `alignHtfCausal` instead takes the last slow bar whose CLOSE is at or
 * before the fast bar's own close, so every drawn value was genuinely knowable at
 * that x position. The result sits up to one slow bar to the right of the naive
 * version and looks slightly "late" — that lateness is real information, not an
 * artefact to tune away.
 *
 * Bar `t` is a bar's START (OANDA's convention), so close = t + periodSeconds.
 *
 * ── WHY THE OVERLAY NEEDS NO RESCALING ───────────────────────────────────────
 * WaveTrend divides by an EMA of its own mean absolute deviation, i.e. it is
 * self-normalising. A 5m WT and a 30m WT therefore both live in ~±100 and are
 * directly comparable on one axis. A price-based indicator would need normalising
 * first; this one does not.
 *
 * ── THE AGREEMENT NUMBER SHIPS WITH ITS BASELINE ─────────────────────────────
 * Two timeframes of the SAME oscillator on the SAME price series are mechanically
 * correlated — the slow one is close to a smoothed version of the fast one — so
 * they agree a great deal BY CONSTRUCTION. A bare "aligned 68%" is therefore
 * uninterpretable. `agreementStats` reports `baselinePct` alongside: the same
 * statistic recomputed over deterministic circular re-phasings of the slow series,
 * which preserves both series' own persistence and marginal distribution while
 * destroying their true time correspondence. Read `delta = agreePct - baselinePct`,
 * never `agreePct` alone.
 *
 * This is a STRUCTURAL baseline, not a significance test, and the whole thing is
 * a DESCRIPTION: that alignment can be measured is not evidence it predicts
 * anything. Testing that needs costs and an out-of-sample split.
 *
 * ── WHY `direction` IS *NOT* THE DEFAULT (measured, and counter-intuitive) ────
 * "Are both waves rolling the same way" is the natural reading of MTF agreement,
 * and it is the mode most corrupted by the indicator's own lag. The slow wave's
 * slope is a heavily-smoothed, delayed version of the fast wave's, so when the
 * price's dominant cycle is SHORT relative to that lag the two slopes sit out of
 * phase and `direction` reports systematic DISAGREEMENT — far below its own
 * chance baseline, not near it.
 *
 * Measured on single-frequency fixtures at M5/M30 (WT 9/12/3, so the slow
 * smoothing lag is ~n2×ratio ≈ 72 fast bars), sweeping the sine's period:
 *
 *     cycle ÷ lag :  1.0    1.7    3.5    7.0   14.0   27.9   55.9
 *     direction   : 15.8%  15.3%  30.6%  54.3%  74.6%  87.0%  93.5%
 *     baseline    : ~51%   ~51%   ~51%   ~50%   ~49%   ~48%   ~48%
 *
 * Monotonic, crossing its baseline at roughly cycle ÷ lag ≈ 7. On a broadband
 * fixture (drift + three superposed cycles, closer to real price) the three modes
 * split hard: direction 26.8% vs 50.6% base (−23.8pp), level 69.6% vs 64.6%
 * (+5.1pp), zone 89.4% vs 74.3% (+15.2pp).
 *
 * So the default is `level`: it is comparable on nearly every bar and behaves the
 * way a reader expects. `zone` shows the strongest agreement but is null whenever
 * either wave is outside its OB/OS band (≈⅓ of bars comparable — check
 * `comparableBars` before reading it). `direction` is kept because it is what
 * people ask for, but a low number there is mostly differential smoothing lag,
 * NOT the timeframes fighting. This is exactly why the baseline ships with the
 * statistic.
 *
 * Pure — no DOM, no network, no globals. Tested in js/vumanchuMtf.test.mjs.
 */
import { computeWaveTrend } from './vumanchuCore.js';
import { createCanvas, measureText, GLYPH_H } from './pngCanvas.js';
import { THEME } from './vumanchuChart.js';

// Minimum bars for each timeframe's EMAs to mean anything.
export const MIN_BARS = 60;

// Seconds per granularity label. Kept here so the route and the brick agree, and
// so a caller can pass bars with no `t` and still get correct alignment.
export const TF_SECONDS = {
  M1: 60, M2: 120, M3: 180, M4: 240, M5: 300, M10: 600, M15: 900, M30: 1800,
  H1: 3600, H2: 7200, H3: 10800, H4: 14400, H6: 21600, H8: 28800, H12: 43200,
  D: 86400, W: 604800,
};

export const MTF_THEME = {
  slowWt1: '#c084fc',   // purple — a free hue; blue is the fast wave, yellow the
  slowWt2: '#7c5aa0',   // VWAP line, red/green the divergences
  agree:   '#22c55e',
  disagree:'#ef4444',
  neutral: '#3a4456',
  // Shading for the gap between the two waves — the disagreement made visible.
  diffFastAbove: '#22c55e26',   // fast timeframe above the slow one
  diffSlowAbove: '#ef444426',   // slow timeframe above the fast one
};

export const AGREE_MODES = ['direction', 'level', 'zone'];

const DEFAULTS = {
  width: 1200, height: 460,
  displayBars: 200,
  n1: 9, n2: 12, sp: 3,        // the operator's WaveTrend, matching the sibling chart
  obLevel: 53, osLevel: -53,
  agreeMode: 'level',         // NOT 'direction' — see the lag note in the header
  showSlowSignal: true,        // slow WT2 as a thin dashed line (explains `direction`)
  showDiffFill: true,          // shade the fast-vs-slow gap, coloured by who's on top
  baselineShifts: 24,          // deterministic circular re-phasings for the baseline
  ribbonPx: 9,
  fastLabel: '', slowLabel: '',
  title: '', subtitle: '',
  tzOffsetMin: 0,
};

const fin = v => Number.isFinite(v);

// Epoch SECONDS for a bar (accepts t in s or ms, or an ISO time/datetime).
export function barSec(b) {
  if (b == null) return null;
  if (typeof b.t === 'number') return b.t > 1e11 ? Math.floor(b.t / 1000) : b.t;
  const s = b.time ?? b.datetime;
  if (s == null) return null;
  const v = Date.parse(String(s).replace(' ', 'T') + (/[Zz+]/.test(String(s)) ? '' : 'Z'));
  return Number.isFinite(v) ? Math.floor(v / 1000) : null;
}

// Median positive spacing of a bar array — the fallback period when the caller
// doesn't name the timeframe. Median, not mean, so weekend gaps don't skew it.
export function inferPeriodSec(bars) {
  const d = [];
  for (let i = 1; i < bars.length; i++) {
    const a = barSec(bars[i - 1]), b = barSec(bars[i]);
    if (a != null && b != null && b > a) d.push(b - a);
  }
  if (!d.length) return null;
  d.sort((x, y) => x - y);
  return d[d.length >> 1];
}

/**
 * Step-hold a slow-timeframe series onto the fast grid, CAUSALLY.
 *
 * For each fast bar, takes the value of the last slow bar whose close is at or
 * before that fast bar's close. Returns `{ values, slowIdx }` aligned to
 * `fastBars` — `values[i]` is NaN and `slowIdx[i]` is -1 where no slow bar has
 * closed yet. Both arrays are the caller's proof that no future leaked in.
 *
 * Single forward pass; assumes both arrays are chronological (oldest first).
 */
export function alignHtfCausal(fastBars, slowBars, slowSeries, { fastSec, slowSec } = {}) {
  const fSec = fastSec ?? inferPeriodSec(fastBars);
  const sSec = slowSec ?? inferPeriodSec(slowBars);
  if (!fSec || !sSec) throw new Error('vumanchuMtf: cannot determine bar periods (no timestamps and no fastSec/slowSec)');
  const values = new Array(fastBars.length).fill(NaN);
  const slowIdx = new Array(fastBars.length).fill(-1);
  let k = -1;   // index of the last slow bar known to have closed
  for (let i = 0; i < fastBars.length; i++) {
    const fClose = barSec(fastBars[i]);
    if (fClose == null) continue;
    const fastCloseAt = fClose + fSec;
    // Advance while the NEXT slow bar has also closed by now.
    while (k + 1 < slowBars.length) {
      const sStart = barSec(slowBars[k + 1]);
      if (sStart == null || sStart + sSec > fastCloseAt) break;
      k++;
    }
    if (k >= 0) { values[i] = slowSeries[k]; slowIdx[i] = k; }
  }
  return { values, slowIdx };
}

/**
 * Per-bar agreement between the two timeframes.
 *   direction — both waves rolling the same way (sign of wt1−wt2). The usual
 *               reading of "is the higher timeframe with me right now".
 *   level     — both the same side of zero.
 *   zone      — both overbought, or both oversold. null when either is in
 *               neither zone (no opinion), false only on opposite zones.
 * Returns (true | false | null)[]; null = undefined/not comparable at that bar.
 */
export function agreementSeries(fast, slow, mode = 'direction', { obLevel = 53, osLevel = -53 } = {}) {
  const n = Math.min(fast.wt1.length, slow.wt1.length);
  const out = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const f1 = fast.wt1[i], f2 = fast.wt2[i], s1 = slow.wt1[i], s2 = slow.wt2[i];
    if (mode === 'level') {
      if (!fin(f1) || !fin(s1)) continue;
      out[i] = (f1 >= 0) === (s1 >= 0);
    } else if (mode === 'zone') {
      if (!fin(f1) || !fin(s1)) continue;
      const fz = f1 >= obLevel ? 1 : f1 <= osLevel ? -1 : 0;
      const sz = s1 >= obLevel ? 1 : s1 <= osLevel ? -1 : 0;
      out[i] = fz === 0 || sz === 0 ? null : fz === sz;
    } else {
      if (!fin(f1) || !fin(f2) || !fin(s1) || !fin(s2)) continue;
      out[i] = ((f1 - f2) >= 0) === ((s1 - s2) >= 0);
    }
  }
  return out;
}

const pctOf = arr => {
  let n = 0, a = 0;
  for (const v of arr) { if (v === null) continue; n++; if (v) a++; }
  return n ? { pct: a / n * 100, n } : { pct: null, n: 0 };
};

/**
 * Agreement percentage WITH its structural baseline.
 *
 * The baseline recomputes the same statistic over `shifts` deterministic circular
 * re-phasings of the slow series. Circular rotation keeps the slow series' own
 * autocorrelation and marginal distribution intact while destroying its true time
 * correspondence with the fast series — so it answers "how often would two series
 * this persistent agree if they were NOT actually aligned?".
 *
 * Deterministic by construction (evenly spaced offsets, no RNG) so a cached image
 * and its JSON never disagree. Offsets stay clear of the ends, where a rotation
 * would leave the series still nearly aligned.
 */
export function agreementStats(fast, slow, mode = 'direction', opts = {}) {
  const { shifts = 24, obLevel = 53, osLevel = -53 } = opts;
  const series = agreementSeries(fast, slow, mode, { obLevel, osLevel });
  const actual = pctOf(series);
  const n = Math.min(fast.wt1.length, slow.wt1.length);

  const rot = (arr, by) => { const o = new Array(arr.length); for (let i = 0; i < arr.length; i++) o[i] = arr[(i + by) % arr.length]; return o; };
  const samples = [];
  for (let k = 1; k <= shifts && n > 8; k++) {
    const by = Math.floor(n * k / (shifts + 1));
    if (by <= 0 || by >= n) continue;
    const shifted = { wt1: rot(slow.wt1, by), wt2: rot(slow.wt2, by) };
    const p = pctOf(agreementSeries(fast, shifted, mode, { obLevel, osLevel }));
    if (p.pct != null) samples.push(p.pct);
  }
  const baseline = samples.length ? samples.reduce((s, v) => s + v, 0) / samples.length : null;
  const hi = samples.length ? Math.max(...samples) : null;

  return {
    mode,
    agreePct: actual.pct,
    comparableBars: actual.n,
    baselinePct: baseline,
    baselineMaxPct: hi,          // the luckiest re-phasing — a crude "could be chance" bar
    delta: actual.pct != null && baseline != null ? actual.pct - baseline : null,
    baselineShifts: samples.length,
    series,
  };
}

// ── Layout ───────────────────────────────────────────────────────────────────
export function vumanchuMtfLayout(fastBars, slowBars, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (!Array.isArray(fastBars) || fastBars.length < MIN_BARS) throw new Error(`vumanchuMtf: need ≥${MIN_BARS} fast bars, got ${fastBars?.length ?? 0}`);
  if (!Array.isArray(slowBars) || slowBars.length < MIN_BARS) throw new Error(`vumanchuMtf: need ≥${MIN_BARS} slow bars, got ${slowBars?.length ?? 0}`);
  if (!AGREE_MODES.includes(o.agreeMode)) throw new Error(`vumanchuMtf: agreeMode must be ${AGREE_MODES.join('|')}`);
  const fSec = o.fastSec ?? inferPeriodSec(fastBars);
  const sSec = o.slowSec ?? inferPeriodSec(slowBars);
  if (fSec && sSec && sSec <= fSec) {
    throw new Error(`vumanchuMtf: slow timeframe must be COARSER than fast (got ${fSec}s vs ${sSec}s) — the slow wave is step-held onto the fast grid`);
  }

  const wtOpts = { n1: o.n1, n2: o.n2, sp: o.sp };
  const fast = computeWaveTrend(fastBars, wtOpts);
  const slowRaw = computeWaveTrend(slowBars, wtOpts);
  const a1 = alignHtfCausal(fastBars, slowBars, slowRaw.wt1, { fastSec: fSec, slowSec: sSec });
  const a2 = alignHtfCausal(fastBars, slowBars, slowRaw.wt2, { fastSec: fSec, slowSec: sSec });
  const slow = { wt1: a1.values, wt2: a2.values };

  // Visible window: last displayBars, pushed past any leading non-finite in
  // EITHER series (the fast SMA warm-up, and the slow series before its first close).
  const firstFin = arr => { for (let i = 0; i < arr.length; i++) if (fin(arr[i])) return i; return arr.length; };
  const warm = Math.max(firstFin(fast.wt2), firstFin(slow.wt2));
  const to = fastBars.length - 1;
  const from = Math.max(Math.min(warm, to), fastBars.length - o.displayBars);
  const nVis = to - from + 1;

  // Agreement is measured over the VISIBLE WINDOW ONLY, so the headline
  // percentage describes the same bars as the ribbon underneath it. Computing it
  // over the whole fetched series (which included ~240 bars of warm-up history)
  // made `comparableBars` exceed `window.bars` and quietly described a different
  // span from the picture. `stats.series` is therefore window-indexed: element 0
  // is bar `from`, so callers index it as `series[i - from]`.
  const sliceWt = (s) => ({ wt1: s.wt1.slice(from, to + 1), wt2: s.wt2.slice(from, to + 1) });
  const stats = agreementStats(sliceWt(fast), sliceWt(slow), o.agreeMode, {
    shifts: o.baselineShifts, obLevel: o.obLevel, osLevel: o.osLevel,
  });

  const padL = 10, padR = 62, padT = 30, padB = 22;
  const ribbon = o.ribbonPx;
  const plot = { x: padL, y: padT, w: o.width - padL - padR, h: o.height - padT - padB - ribbon - 3 };

  let peak = 0;
  for (let i = from; i <= to; i++) for (const v of [fast.wt1[i], fast.wt2[i], slow.wt1[i], slow.wt2[i]]) if (fin(v)) peak = Math.max(peak, Math.abs(v));
  const yMax = Math.max(o.obLevel * 1.6, peak * 1.08, 80);
  const yToPx = v => plot.y + plot.h / 2 - (v / yMax) * (plot.h / 2);
  const xToPx = i => nVis <= 1 ? plot.x + plot.w : plot.x + ((i - from) / (nVis - 1)) * plot.w;

  const ptsFor = arr => { const out = []; for (let i = from; i <= to; i++) out.push(fin(arr[i]) ? { x: xToPx(i), y: yToPx(arr[i]) } : null); return out; };
  const bandA = [], bandB = [];
  for (let i = from; i <= to; i++) if (fin(fast.wt1[i]) && fin(fast.wt2[i])) { bandA.push({ x: xToPx(i), y: yToPx(fast.wt1[i]) }); bandB.push({ x: xToPx(i), y: yToPx(fast.wt2[i]) }); }

  const gridlines = [
    { v: o.obLevel, label: `+${o.obLevel}` },
    { v: 0, label: '0' },
    { v: o.osLevel, label: `${o.osLevel}` },
  ].map(g => ({ ...g, y: yToPx(g.v), zero: g.v === 0 }));

  const timeLabels = [];
  if (barSec(fastBars[to]) != null) {
    const ticks = Math.min(6, nVis);
    for (let k = 0; k < ticks; k++) {
      const i = from + Math.round((k / Math.max(1, ticks - 1)) * (nVis - 1));
      const s = barSec(fastBars[i]);
      if (s != null) {
        const d = new Date(s * 1000 + o.tzOffsetMin * 60_000);
        timeLabels.push({ x: xToPx(i), label: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` });
      }
    }
  }

  // How long the current agree/disagree run has lasted, in fast bars. Window-
  // indexed, so it is capped by the visible window (a longer real run reads as
  // the full window, which is all the picture can support).
  const runBars = (() => {
    const last = nVis - 1;
    const cur = stats.series[last];
    if (cur === null || cur === undefined) return null;
    let n = 0;
    for (let k = last; k >= 0 && stats.series[k] === cur; k--) n++;
    return n;
  })();

  return {
    opts: o, width: o.width, height: o.height, plot, ribbon, yMax, from, to, nVis,
    yToPx, xToPx, fastSec: fSec, slowSec: sSec,
    series: { fast, slow, slowIdx: a1.slowIdx },
    points: { fastWt1: ptsFor(fast.wt1), fastWt2: ptsFor(fast.wt2), slowWt1: ptsFor(slow.wt1), slowWt2: ptsFor(slow.wt2) },
    band: { a: bandA, b: bandB },
    gridlines, timeLabels, stats,
    reading: {
      fastWt1: fin(fast.wt1[to]) ? fast.wt1[to] : null,
      fastWt2: fin(fast.wt2[to]) ? fast.wt2[to] : null,
      slowWt1: fin(slow.wt1[to]) ? slow.wt1[to] : null,
      slowWt2: fin(slow.wt2[to]) ? slow.wt2[to] : null,
      agree: stats.series[nVis - 1] ?? null,
      runBars,
    },
  };
}

// ── PNG ──────────────────────────────────────────────────────────────────────
export function renderVumanchuMtfPNG(fastBars, slowBars, opts = {}) {
  const L = vumanchuMtfLayout(fastBars, slowBars, opts);
  const o = L.opts, T = THEME, M = MTF_THEME, P = L.plot;
  const cv = createCanvas(L.width, L.height, T.bg);
  cv.rect(P.x, P.y, P.w, P.h, T.panel);

  for (const g of L.gridlines) {
    cv.line(P.x, g.y, P.x + P.w, g.y, { color: g.zero ? T.zero : T.obos, width: g.zero ? 1.2 : 1, dash: g.zero ? null : [4, 5] });
    if (g.label) cv.text(P.x + P.w + 5, g.y - GLYPH_H / 2, g.label, { color: T.grid, scale: 1 });
  }

  // Fast wave first (the familiar look), slow wave on top so it reads as context.
  cv.fillBetween(L.band.a, L.band.b, T.band);

  // THE DIFFERENCE, shaded. The thin ribbon alone reads as an afterthought; the
  // gap between the two waves IS the disagreement, so fill it and colour it by
  // which timeframe is on top. Split into constant-sign runs because fillBetween
  // takes one colour — a single fill would blend both meanings into one wash.
  if (o.showDiffFill) {
    const F = L.points.fastWt1, S = L.points.slowWt1;
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        const a = run.map(k => F[k]), b = run.map(k => S[k]);
        cv.fillBetween(a, b, F[run[0]].y < S[run[0]].y ? M.diffFastAbove : M.diffSlowAbove);
      }
      run = [];
    };
    for (let k = 0; k < F.length; k++) {
      if (!F[k] || !S[k]) { flush(); continue; }
      const sign = F[k].y < S[k].y;                      // y grows downward → fast above
      if (run.length && (F[run[0]].y < S[run[0]].y) !== sign) flush();
      run.push(k);
    }
    flush();
  }
  cv.polyline(L.points.fastWt2, { color: T.wt2, width: 1.3 });
  cv.polyline(L.points.fastWt1, { color: T.wt1, width: 2.0 });
  if (o.showSlowSignal) cv.polyline(L.points.slowWt2, { color: M.slowWt2, width: 1.1, dash: [4, 4] });
  // The step-hold's jumps span one fast bar, so a plain polyline already reads as
  // a staircase at any sane bar width.
  cv.polyline(L.points.slowWt1, { color: M.slowWt1, width: 2.4 });

  // Agreement ribbon under the plot.
  const ry = P.y + P.h + 3;
  cv.rect(P.x, ry, P.w, L.ribbon, T.bg);
  for (let i = L.from; i <= L.to; i++) {
    const v = L.stats.series[i - L.from];
    const x0 = L.xToPx(i), x1 = i < L.to ? L.xToPx(i + 1) : x0 + (P.w / Math.max(1, L.nVis - 1));
    cv.rect(x0, ry, Math.max(1, x1 - x0), L.ribbon, v === null ? M.neutral : v ? M.agree : M.disagree);
  }

  // Right-gutter value chips, de-overlapped.
  const chips = [[L.reading.fastWt1, T.wt1], [L.reading.slowWt1, M.slowWt1]]
    .filter(([v]) => v != null)
    .map(([v, col]) => ({ col, txt: `${v >= 0 ? '+' : ''}${v.toFixed(1)}`, y: L.yToPx(v) - GLYPH_H / 2 - 1 }))
    .sort((a, b) => a.y - b.y);
  for (let i = 0; i < chips.length; i++) {
    const floor = i === 0 ? P.y + 2 : chips[i - 1].y + GLYPH_H + 3;
    chips[i].y = Math.max(floor, chips[i].y);
  }
  const over = (chips.at(-1)?.y ?? 0) + GLYPH_H + 2 - (P.y + P.h);
  if (over > 0) for (const c of chips) c.y -= over;
  for (const c of chips) {
    cv.rect(P.x + P.w + 2, c.y - 2, measureText(c.txt, 1) + 6, GLYPH_H + 4, T.bg);
    cv.line(P.x + P.w + 1, c.y + GLYPH_H / 2, P.x + P.w + 3, c.y + GLYPH_H / 2, { color: c.col, width: 3 });
    cv.text(P.x + P.w + 5, c.y, c.txt, { color: c.col, scale: 1 });
  }

  // Header: title · "FAST VS SLOW" · agreement vs baseline.
  const title = (o.title || 'VUMANCHU MTF').toUpperCase();
  cv.text(P.x, 8, title, { color: T.textBright, scale: 2 });
  let hx = P.x + measureText(title, 2) + 10;
  const sub = o.subtitle || `${o.fastLabel} VS ${o.slowLabel}`.trim();
  if (sub) { cv.text(hx, 12, sub.toUpperCase(), { color: T.text, scale: 1 }); hx += measureText(sub, 1) + 10; }
  const s = L.stats;
  if (s.agreePct != null) {
    const lbl = `${o.agreeMode.toUpperCase()} ${s.agreePct.toFixed(0)}%`;
    // Colour by the DELTA, never the raw percentage — the raw number is mostly
    // structural correlation and would read as meaningful on its own.
    const col = s.delta == null ? T.text : s.delta > 4 ? M.agree : s.delta < -4 ? M.disagree : T.text;
    cv.text(hx, 12, lbl, { color: col, scale: 1 });
    hx += measureText(lbl, 1) + 5;
    if (s.baselinePct != null) {
      // T.text, not T.grid — the baseline is the number that makes the headline
      // percentage interpretable, so it must be as readable as the headline.
      cv.text(hx, 12, `VS ${s.baselinePct.toFixed(0)}% BASE`, { color: T.text, scale: 1 });
    }
  }

  // Legend, right-aligned.
  let lx = L.width - 8;
  const legend = [['FAST', T.wt1], ['SLOW', M.slowWt1]];
  for (const [lbl, col] of [...legend].reverse()) {
    const w = measureText(lbl, 1);
    lx -= w; cv.text(lx, 12, lbl, { color: col, scale: 1 });
    lx -= 6; cv.rect(lx, 14, 4, 2, col); lx -= 8;
  }

  for (const t of L.timeLabels) {
    const w = measureText(t.label, 1);
    cv.text(Math.min(L.width - w - 2, Math.max(2, t.x - w / 2)), ry + L.ribbon + 4, t.label, { color: T.text, scale: 1 });
  }
  return cv.toPNG();
}

// ── SVG ──────────────────────────────────────────────────────────────────────
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderVumanchuMtfSVG(fastBars, slowBars, opts = {}) {
  const L = vumanchuMtfLayout(fastBars, slowBars, opts);
  const o = L.opts, T = THEME, M = MTF_THEME, P = L.plot;
  const pl = pts => pts.filter(Boolean).map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const s = [];
  s.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}" font-family="ui-monospace,Menlo,Consolas,monospace">`);
  s.push(`<rect width="${L.width}" height="${L.height}" fill="${T.bg}"/>`);
  s.push(`<rect x="${P.x}" y="${P.y}" width="${P.w}" height="${P.h}" fill="${T.panel}"/>`);
  for (const g of L.gridlines) {
    s.push(`<line x1="${P.x}" y1="${g.y.toFixed(1)}" x2="${P.x + P.w}" y2="${g.y.toFixed(1)}" stroke="${g.zero ? T.zero : T.obos}" stroke-width="${g.zero ? 1.2 : 1}"${g.zero ? '' : ' stroke-dasharray="4 5"'}/>`);
    if (g.label) s.push(`<text x="${P.x + P.w + 5}" y="${(g.y + 3).toFixed(1)}" fill="${T.grid}" font-size="10">${esc(g.label)}</text>`);
  }
  if (L.band.a.length > 1) {
    s.push(`<path d="M ${pl(L.band.a).replace(/ /g, ' L ')} L ${pl([...L.band.b].reverse()).replace(/ /g, ' L ')} Z" fill="${T.band.slice(0, 7)}" fill-opacity="${(parseInt(T.band.slice(7, 9), 16) / 255).toFixed(2)}"/>`);
  }
  s.push(`<polyline points="${pl(L.points.fastWt2)}" fill="none" stroke="${T.wt2}" stroke-width="1.3"/>`);
  s.push(`<polyline points="${pl(L.points.fastWt1)}" fill="none" stroke="${T.wt1}" stroke-width="2"/>`);
  if (o.showSlowSignal) s.push(`<polyline points="${pl(L.points.slowWt2)}" fill="none" stroke="${M.slowWt2}" stroke-width="1.1" stroke-dasharray="4 4"/>`);
  s.push(`<polyline points="${pl(L.points.slowWt1)}" fill="none" stroke="${M.slowWt1}" stroke-width="2.4"/>`);
  const ry = P.y + P.h + 3;
  for (let i = L.from; i <= L.to; i++) {
    const v = L.stats.series[i - L.from];
    const x0 = L.xToPx(i), x1 = i < L.to ? L.xToPx(i + 1) : x0 + (P.w / Math.max(1, L.nVis - 1));
    s.push(`<rect x="${x0.toFixed(1)}" y="${ry}" width="${Math.max(1, x1 - x0).toFixed(1)}" height="${L.ribbon}" fill="${v === null ? M.neutral : v ? M.agree : M.disagree}"/>`);
  }
  s.push(`<text x="${P.x}" y="20" fill="${T.textBright}" font-size="14" font-weight="700">${esc(o.title || 'VuManChu MTF')}</text>`);
  const sub = o.subtitle || `${o.fastLabel} vs ${o.slowLabel}`.trim();
  if (sub) s.push(`<text x="${P.x + (o.title || 'VuManChu MTF').length * 9 + 12}" y="20" fill="${T.text}" font-size="10">${esc(sub)}</text>`);
  if (L.stats.agreePct != null) {
    s.push(`<text x="${L.width - 8}" y="20" fill="${T.text}" font-size="10" text-anchor="end">${esc(`${o.agreeMode} ${L.stats.agreePct.toFixed(0)}% vs ${L.stats.baselinePct?.toFixed(0) ?? '—'}% base`)}</text>`);
  }
  for (const t of L.timeLabels) s.push(`<text x="${t.x.toFixed(1)}" y="${ry + L.ribbon + 11}" fill="${T.text}" font-size="9" text-anchor="middle">${esc(t.label)}</text>`);
  s.push('</svg>');
  return s.join('');
}

// ── JSON / caption ───────────────────────────────────────────────────────────
export function vumanchuMtfData(fastBars, slowBars, opts = {}) {
  const L = vumanchuMtfLayout(fastBars, slowBars, opts);
  const r3 = v => v == null || !Number.isFinite(v) ? null : +v.toFixed(3);
  const s = L.stats;
  return {
    fastTf: L.opts.fastLabel || null, slowTf: L.opts.slowLabel || null,
    fastSec: L.fastSec, slowSec: L.slowSec,
    reading: {
      fastWt1: r3(L.reading.fastWt1), fastWt2: r3(L.reading.fastWt2),
      slowWt1: r3(L.reading.slowWt1), slowWt2: r3(L.reading.slowWt2),
      agree: L.reading.agree, runBars: L.reading.runBars,
    },
    agreement: {
      mode: s.mode,
      pct: r3(s.agreePct), baselinePct: r3(s.baselinePct),
      baselineMaxPct: r3(s.baselineMaxPct), delta: r3(s.delta),
      comparableBars: s.comparableBars, baselineShifts: s.baselineShifts,
      note: 'pct alone is mostly structural correlation between two timeframes of the same oscillator — read delta vs baselinePct. Structural baseline, not a significance test, and descriptive only.'
          + (s.mode === 'direction'
              ? ' MODE CAVEAT: `direction` compares instantaneous slopes across two very differently-lagged smoothings, so a low/negative delta here is mostly the slow wave\'s smoothing lag, not the timeframes conflicting. Prefer level/zone.'
              : s.mode === 'zone'
                ? ' MODE CAVEAT: `zone` is null unless BOTH waves are inside an OB/OS band — check comparableBars against window.bars before reading pct.'
                : ''),
    },
    window: { from: L.from, to: L.to, bars: L.nVis, totalFast: fastBars.length, totalSlow: slowBars.length },
  };
}

export function vumanchuMtfCaption(fastBars, slowBars, opts = {}) {
  const d = vumanchuMtfData(fastBars, slowBars, opts);
  const f = d.reading, a = d.agreement;
  const bits = [`〰️ <b>${opts.title || 'VuManChu MTF'}</b>`];
  if (d.fastTf && d.slowTf) bits.push(`${d.fastTf} vs ${d.slowTf}`);
  if (f.fastWt1 != null) bits.push(`fast ${f.fastWt1 >= 0 ? '+' : ''}${f.fastWt1.toFixed(1)}`);
  if (f.slowWt1 != null) bits.push(`slow ${f.slowWt1 >= 0 ? '+' : ''}${f.slowWt1.toFixed(1)}`);
  if (f.agree !== null && f.agree !== undefined) {
    bits.push(`${f.agree ? '✅ aligned' : '⚠️ split'}${f.runBars ? ` ${f.runBars} bars` : ''}`);
  }
  if (a.pct != null) bits.push(`${a.mode} ${a.pct.toFixed(0)}% (base ${a.baselinePct?.toFixed(0) ?? '—'}%)`);
  return bits.join(' · ');
}
