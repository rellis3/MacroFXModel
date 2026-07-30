/**
 * VuManChu Chart — the RENDER brick for the WaveTrend pane. Turns bars into the
 * Cipher-B-style oscillator picture, as a PNG (for Telegram) or an SVG (for the
 * dashboard), from ONE layout pass.
 *
 * Composes existing bricks — it re-implements no maths of its own:
 *   • `vumanchuCore.computeWaveTrend` → WT1 / WT2 (the blue wave + its fill)
 *   • `vumanchuCore.computeVWAP`      → `.osc`, the yellow VWAP oscillator
 *   • `vumanchuCore.waveTrendReading` → the latest-bar OB/OS/cross classification
 *   • `divergenceCore.findDivergences`→ the connecting divergence lines, run on
 *     BOTH oscillators (that brick is oscillator-agnostic by design, so the same
 *     pivot/divergence logic serves the wave and the yellow line — no second copy)
 *   • `pngCanvas.createCanvas`        → the rasteriser
 *
 * Layers drawn (money flow deliberately excluded — the green/red band hugging
 * zero in a stock Cipher B pane is the RSI+MFI area and is not wanted here):
 *   1. OB/OS + zero gridlines          4. WT1 line (bright blue)
 *   2. WT1↔WT2 filled band (dark blue) 5. VWAP oscillator (yellow)
 *   3. WT2 signal line (muted)         6. divergence lines + pivot dots
 *
 * ⚠ WHICH SERIES IS THE YELLOW LINE — read before trusting it. Two candidates
 * exist and they are NOT the same quantity:
 *   • `'wtdiff'` (DEFAULT) — `wt1 - wt2`, VuManChu's Pine `wtVwap`.
 *   • `'cumvwap'` — `vumanchuCore.computeVWAP(bars).osc`: each bar's distance from
 *     the CUMULATIVE VWAP (anchored at bar 0), peak-normalised to ±100. This is
 *     the series `vumanchuFadeEngine` consumes.
 * `wtdiff` is the default on measured evidence, not preference. On a trending
 * 200-bar fixture, `cumvwap` ran 35→100 — a one-way ramp pinned at its own
 * normalisation peak, yielding ZERO divergences, and nothing like a line that
 * oscillates about zero. `wtdiff` ran −11→+14 around zero and produced 5
 * divergences. Since the point of the yellow line here is that it is *also* a
 * divergence source, the series that produces none on trending data cannot be the
 * default. The cause is structural: a VWAP anchored at bar 0 of an arbitrary
 * window drifts monotonically once price trends, so its "oscillator" stops
 * oscillating — which also means `cumvwap` deserves scrutiny wherever it IS
 * consumed, on a window not anchored to a real session start.
 * This has NOT been checked against the owner's actual Pine file; `wtdiff` matches
 * the reference screenshot's behaviour and the stock Cipher B definition, and that
 * is the whole of the evidence. Pass `vwapSeries:'cumvwap'`, or a function
 * `(bars,{wt1,wt2}) => number[]`, to draw something else. Nothing in
 * `vumanchuCore` was changed, so no engine's numbers move.
 *
 * WARM-UP: `bars` should be the FULL history you have (chronological, OLDEST
 * FIRST). The oscillators are computed on all of it and only the last
 * `displayBars` are drawn, so the EMA seeding transient never reaches the image.
 * Divergences are found on the full series and drawn when both pivots land in the
 * visible window. Passing newest-first bars silently mirrors the chart — the
 * `/api/vumanchu/chart` route reverses OANDA's newest-first payload for this
 * reason.
 *
 * Pure: no DOM, no network, no globals. Unit-tested in js/vumanchuChart.test.mjs.
 */
import { computeWaveTrend, computeVWAP, computeMoneyFlow, waveTrendReading } from './vumanchuCore.js';
import { findDivergences } from './divergenceCore.js';
import { createCanvas, measureText, GLYPH_H } from './pngCanvas.js';

// Minimum bars for the WaveTrend EMAs to mean anything (n1+n2 warm-up + a pane
// worth of visible history). Below this we refuse rather than draw a transient.
export const MIN_BARS = 60;

export const THEME = {
  bg:        '#0b0e14',
  panel:     '#111722',
  grid:      '#1b2230',
  zero:      '#33405a',
  obos:      '#26324a',
  wt1:       '#5bc0f8',
  wt2:       '#53698f',
  band:      '#1c3a5ecc',
  vwap:      '#f5d90a',
  text:      '#8b98ab',
  textBright:'#e6edf7',
  bear:      '#ef4444',
  bull:      '#22c55e',
  bearDim:   '#a13636',
  bullDim:   '#2a7a4d',
  // Money-Flow wave, filled to the zero line and split by sign.
  mfUp:      '#22c55e59',
  mfDn:      '#ef444459',
  mfUpLine:  '#3ddc84',
  mfDnLine:  '#f2686b',
};

// Defaults match the OPERATOR'S VuManChu Cipher B setup, not the generic Cipher B
// preset — the point of this pane is that it looks like what he sees on
// TradingView. Sourced from `forecast-reversion.html`, where `divergenceCore` was
// validated bit-for-bit against his Pine `f_findDivs`:
//   • WaveTrend 9/12/3 (NOT the stock 10/21/4)
//   • drawn OB/OS bands 53/−53
//   • divergence-zone gates 45/−65 — a SEPARATE, asymmetric pair, which is why
//     `divOb`/`divOs` are distinct options rather than reusing obLevel/osLevel.
//     Collapsing them (as a first cut here did) silently changes which
//     divergences qualify: the bull gate moves from −53 to −65 and the bear gate
//     from 53 to 45.
const DEFAULTS = {
  width: 1200, height: 440,
  displayBars: 160,
  n1: 9, n2: 12, sp: 3,
  obLevel: 53, osLevel: -53,   // drawn gridlines + the latest-bar OB/OS read
  divOb: 45, divOs: -65,       // gate for REGULAR divergences (hidden stay ungated)
  reach: 2,          // VuManChu's 5-bar fractal
  maxDivs: 5,        // most recent N divergences per oscillator (spaghetti guard)
  showVwap: true,
  showMoneyFlow: true,   // the green/red wave hugging zero
  mfPeriod: 14,
  // DISPLAY scaling only — nothing here is fed to anything but the canvas.
  //
  // `computeMoneyFlow` divides by `max(|raw|)` over the array it is given, where
  // raw = (close-open)/range x volume. That single-max normalisation is
  // OUTLIER-DOMINATED: on real EUR/USD M15 the busiest bar carried ~18x the median
  // tick count (21941 vs 1172), so one spike sets the divisor and squashes every
  // other bar to near-invisibility. First attempt at drawing this produced a flat
  // line for exactly that reason.
  //   'auto' (default) rescales by a ROBUST spread (the mfPctile-th percentile of
  //   |mf| over the drawn window) up to `mfTargetAmp`, so the wave is legible and
  //   stable regardless of outliers or how many bars were fetched.
  //   A number instead applies that fixed multiplier to the brick's output.
  // Either way the SHAPE and the sign are the brick's; only the amplitude is set
  // here, and amplitude is not information (the brick's own scale is arbitrary).
  mfScale: 'auto',
  mfTargetAmp: 30,
  mfPctile: 90,
  // Money Flow's distribution has a long tail (measured drawn range -12.9..+98.2
  // against a +/-106 domain before clamping — one excursion would have filled the
  // whole pane and buried the wave). Clamped for DISPLAY so a single spike cannot
  // swamp the pane; the clamp is on amplitude only, never on sign, so the
  // green/red reading is untouched. Raise it to see the raw excursions.
  mfClamp: 66,
  showHidden: false, // regular (exhaustion) divergences only, by default
  vwapSeries: 'wtdiff',   // Pine's wtVwap. See the header note before changing.
  title: '', subtitle: '',
  tzOffsetMin: 0,    // minutes added to UTC for the time axis labels
};

// Epoch ms for a bar, tolerating every timestamp shape in this repo.
function barTimeMs(b) {
  if (b == null) return null;
  if (typeof b.t === 'number') return b.t > 1e11 ? b.t : b.t * 1000;
  if (b.time != null) { const v = Date.parse(b.time); return Number.isFinite(v) ? v : null; }
  if (b.datetime != null) {
    const v = Date.parse(String(b.datetime).replace(' ', 'T') + (/[Zz+]/.test(b.datetime) ? '' : 'Z'));
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

function hhmm(ms, tzOffsetMin) {
  const d = new Date(ms + tzOffsetMin * 60_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

const fin = v => Number.isFinite(v);

// Resolve the yellow line. See the header note on why 'wtdiff' is the default.
function resolveVwapSeries(mode, bars, wt1, wt2) {
  if (typeof mode === 'function') return mode(bars, { wt1, wt2 });
  if (mode === 'cumvwap') return computeVWAP(bars).osc;
  if (mode === 'none') return wt1.map(() => NaN);
  return wt1.map((v, i) => fin(v) && fin(wt2[i]) ? v - wt2[i] : NaN);   // 'wtdiff'
}

/**
 * Compute every pixel coordinate the picture needs, without drawing. Both
 * renderers consume this, so the PNG and the SVG can never disagree on geometry.
 */
export function vumanchuLayout(bars, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (!Array.isArray(bars) || bars.length < MIN_BARS) {
    throw new Error(`vumanchuChart: need ≥${MIN_BARS} bars for a meaningful WaveTrend, got ${bars?.length ?? 0}`);
  }
  const wtOpts = { n1: o.n1, n2: o.n2, sp: o.sp };
  const { wt1, wt2 } = computeWaveTrend(bars, wtOpts);
  const vwapOsc = o.showVwap ? resolveVwapSeries(o.vwapSeries, bars, wt1, wt2) : wt1.map(() => NaN);
  // Money Flow: (close-open)/range x volume, EMA-smoothed and peak-normalised by
  // the brick. NOTE two honest caveats, surfaced in the page copy as well:
  //  • the peak normalisation is over the array it is given, so the AMPLITUDE
  //    shifts a little with how many bars were fetched (rank order is unaffected).
  //  • on FX `volume` is OANDA's TICK COUNT, not size traded, so this is an
  //    activity-weighted candle-direction read, not money changing hands.
  const moneyFlowRaw = o.showMoneyFlow ? computeMoneyFlow(bars, { period: o.mfPeriod }) : wt1.map(() => NaN);
  const priceHi = bars.map(b => b.high), priceLo = bars.map(b => b.low);

  // Visible window: the last displayBars, pushed forward past any leading
  // non-finite WT2 (the SMA's warm-up) so the band never opens on a gap.
  const firstFinite = wt2.findIndex(v => fin(v));
  const from = Math.max(firstFinite < 0 ? 0 : firstFinite, bars.length - o.displayBars);
  const to = bars.length - 1;
  const nVis = to - from + 1;

  // Robust display rescale of Money Flow, now that the drawn window is known.
  const moneyFlow = (() => {
    if (!o.showMoneyFlow) return moneyFlowRaw;
    if (typeof o.mfScale === 'number') return moneyFlowRaw.map(v => fin(v) ? v * o.mfScale : NaN);
    const win = [];
    for (let i = from; i <= to; i++) if (fin(moneyFlowRaw[i])) win.push(Math.abs(moneyFlowRaw[i]));
    if (!win.length) return moneyFlowRaw;
    win.sort((a, b) => a - b);
    const ref = win[Math.min(win.length - 1, Math.floor(win.length * o.mfPctile / 100))] || 0;
    const k = ref > 0 ? o.mfTargetAmp / ref : 0;
    const lim = Math.abs(o.mfClamp);
    return moneyFlowRaw.map(v => fin(v) ? Math.max(-lim, Math.min(lim, v * k)) : NaN);
  })();

  // Geometry. Right gutter holds the current-value chips; bottom holds the axis.
  const padL = 10, padR = 62, padT = 30, padB = 22;
  const plot = { x: padL, y: padT, w: o.width - padL - padR, h: o.height - padT - padB };

  // Symmetric y domain so the zero line sits dead centre — an oscillator read as
  // "how far from zero" is misleading on an asymmetric scale.
  let peak = 0;
  for (let i = from; i <= to; i++) {
    for (const v of [wt1[i], wt2[i], vwapOsc[i], moneyFlow[i]]) if (fin(v)) peak = Math.max(peak, Math.abs(v));
  }
  const yMax = Math.max(o.obLevel * 1.6, peak * 1.08, 80);
  const yToPx = v => plot.y + plot.h / 2 - (v / yMax) * (plot.h / 2);
  const xToPx = i => nVis <= 1 ? plot.x + plot.w : plot.x + ((i - from) / (nVis - 1)) * plot.w;

  const ptsFor = arr => {
    const out = [];
    for (let i = from; i <= to; i++) out.push(fin(arr[i]) ? { x: xToPx(i), y: yToPx(arr[i]) } : null);
    return out;
  };
  // The band needs hole-free arrays; a null in either series drops that column.
  const bandA = [], bandB = [];
  for (let i = from; i <= to; i++) {
    if (fin(wt1[i]) && fin(wt2[i])) { bandA.push({ x: xToPx(i), y: yToPx(wt1[i]) }); bandB.push({ x: xToPx(i), y: yToPx(wt2[i]) }); }
  }

  const gridlines = [
    { v: yMax,       label: null,             style: 'edge' },
    { v: o.obLevel,  label: `+${o.obLevel}`,  style: 'obos' },
    { v: 0,          label: '0',              style: 'zero' },
    { v: o.osLevel,  label: `${o.osLevel}`,   style: 'obos' },
    { v: -yMax,      label: null,             style: 'edge' },
  ].map(g => ({ ...g, y: yToPx(g.v) }));

  // Divergences on BOTH oscillators. WT divergences key off WT2 (the signal line
  // VuManChu uses) and are gated to the divergence zone (divOb/divOs — NOT the
  // drawn OB/OS bands); the yellow line is ungated, having no comparable zone.
  const divsFor = (osc, seriesName, gate) => findDivergences(priceHi, priceLo, osc, {
    reach: o.reach,
    obLevel: gate ? o.divOb : null,
    osLevel: gate ? o.divOs : null,
  })
    .filter(d => (o.showHidden || d.kind === 'regular') && d.iPrev >= from && d.iRec <= to)
    .slice(-o.maxDivs)
    .map(d => ({
      ...d, series: seriesName,
      x0: xToPx(d.iPrev), y0: yToPx(d.oscPrev),
      x1: xToPx(d.iRec),  y1: yToPx(d.oscRec),
      color: d.kind === 'regular'
        ? (d.bias === 'bear' ? THEME.bear : THEME.bull)
        : (d.bias === 'bear' ? THEME.bearDim : THEME.bullDim),
      dash: d.kind === 'hidden' ? [5, 4] : null,
      width: seriesName === 'wt' ? 1.7 : 1.2,
    }));
  const divergences = [
    ...divsFor(wt2, 'wt', true),
    ...(o.showVwap && o.vwapSeries !== 'none' ? divsFor(vwapOsc, 'vwap', false) : []),
  ];

  // ~6 evenly spaced time ticks off real bar timestamps (skipped if absent).
  const timeLabels = [];
  if (barTimeMs(bars[to]) != null) {
    const ticks = Math.min(6, nVis);
    for (let k = 0; k < ticks; k++) {
      const i = from + Math.round((k / Math.max(1, ticks - 1)) * (nVis - 1));
      const ms = barTimeMs(bars[i]);
      if (ms != null) timeLabels.push({ x: xToPx(i), label: hhmm(ms, o.tzOffsetMin) });
    }
  }

  const reading = waveTrendReading(bars, { obLevel: o.obLevel, osLevel: o.osLevel, ...wtOpts });
  const lastVwap = (() => { for (let i = to; i >= from; i--) if (fin(vwapOsc[i])) return vwapOsc[i]; return null; })();
  const lastMf = (() => { for (let i = to; i >= from; i--) if (fin(moneyFlow[i])) return moneyFlow[i]; return null; })();

  return {
    opts: o, width: o.width, height: o.height, plot, yMax, from, to,
    yToPx, xToPx,
    points: { wt1: ptsFor(wt1), wt2: ptsFor(wt2), vwap: o.showVwap ? ptsFor(vwapOsc) : [], mf: o.showMoneyFlow ? ptsFor(moneyFlow) : [] },
    band: { a: bandA, b: bandB },
    series: { wt1, wt2, vwapOsc, moneyFlow },
    gridlines, divergences, timeLabels,
    reading: {
      wt1: fin(reading.value) ? reading.value : null,
      wt2: fin(reading.signalValue) ? reading.signalValue : null,
      vwapOsc: lastVwap,
      moneyFlow: lastMf,
      signal: reading.signal,
    },
  };
}

// ── PNG ──────────────────────────────────────────────────────────────────────
export function renderVumanchuPNG(bars, opts = {}) {
  const L = vumanchuLayout(bars, opts);
  const o = L.opts, T = THEME, P = L.plot;
  const cv = createCanvas(L.width, L.height, T.bg);

  cv.rect(P.x, P.y, P.w, P.h, T.panel);

  // Money Flow first, so the zero/OB/OS gridlines and the WaveTrend wave both sit
  // on top of it — the layering in a stock Cipher B pane. Filled to the zero line
  // and split by sign into constant-colour runs (fillBetween takes one colour, so
  // a single fill would wash green and red into one meaningless tint).
  if (o.showMoneyFlow && L.points.mf.length) {
    const zeroY = L.yToPx(0);
    const pts = L.points.mf;
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        const up = pts[run[0]].y < zeroY;                    // y grows downward
        const a = run.map(k => pts[k]);
        const b = run.map(k => ({ x: pts[k].x, y: zeroY }));
        cv.fillBetween(a, b, up ? T.mfUp : T.mfDn);
        cv.polyline(a, { color: up ? T.mfUpLine : T.mfDnLine, width: 1.1 });
      }
      run = [];
    };
    for (let k = 0; k < pts.length; k++) {
      if (!pts[k]) { flush(); continue; }
      const up = pts[k].y < zeroY;
      if (run.length && (pts[run[0]].y < zeroY) !== up) {
        // Carry the boundary point into the next run so the two fills meet with no
        // 1px gap at the zero crossing.
        run.push(k); flush(); run.push(k - 1 >= 0 && pts[k - 1] ? k - 1 : k);
        run = [k];
        continue;
      }
      run.push(k);
    }
    flush();
  }

  for (const g of L.gridlines) {
    if (g.style === 'edge') continue;
    cv.line(P.x, g.y, P.x + P.w, g.y, {
      color: g.style === 'zero' ? T.zero : T.obos,
      width: g.style === 'zero' ? 1.2 : 1,
      dash: g.style === 'zero' ? null : [4, 5],
    });
    if (g.label) cv.text(P.x + P.w + 5, g.y - GLYPH_H / 2, g.label, { color: T.grid, scale: 1 });
  }

  cv.fillBetween(L.band.a, L.band.b, T.band);
  cv.polyline(L.points.wt2, { color: T.wt2, width: 1.4 });
  cv.polyline(L.points.wt1, { color: T.wt1, width: 2.1 });
  if (o.showVwap) cv.polyline(L.points.vwap, { color: T.vwap, width: 1.5 });

  for (const d of L.divergences) {
    cv.line(d.x0, d.y0, d.x1, d.y1, { color: d.color, width: d.width, dash: d.dash });
    const r = d.series === 'wt' ? 3.1 : 2.4;
    for (const [x, y] of [[d.x0, d.y0], [d.x1, d.y1]]) {
      cv.disc(x, y, r, d.color);
      if (d.series === 'vwap') cv.disc(x, y, r - 1.2, T.vwap);   // yellow-cored = VWAP divergence
    }
  }

  // Current-value chips in the right gutter, de-overlapped: two series sitting a
  // point apart would otherwise print their labels on top of each other.
  const chips = [
    [L.reading.wt1, T.wt1],
    [L.reading.wt2, T.wt2],
    ...(o.showVwap && L.reading.vwapOsc != null ? [[L.reading.vwapOsc, T.vwap]] : []),
  ]
    .filter(([v]) => v != null)
    .map(([v, col]) => ({ v, col, txt: `${v >= 0 ? '+' : ''}${v.toFixed(1)}`, y: L.yToPx(v) - GLYPH_H / 2 - 1 }))
    .sort((a, b) => a.y - b.y);
  const minGap = GLYPH_H + 3;
  for (let i = 0; i < chips.length; i++) {
    const floor = i === 0 ? P.y + 2 : chips[i - 1].y + minGap;
    chips[i].y = Math.max(floor, chips[i].y);
  }
  // If pushing down overflowed the plot, pull the whole stack back up.
  const overflow = (chips.at(-1)?.y ?? 0) + GLYPH_H + 2 - (P.y + P.h);
  if (overflow > 0) for (const c of chips) c.y -= overflow;
  for (const c of chips) {
    cv.rect(P.x + P.w + 2, c.y - 2, measureText(c.txt, 1) + 6, GLYPH_H + 4, T.bg);
    cv.line(P.x + P.w + 1, c.y + GLYPH_H / 2, P.x + P.w + 3, c.y + GLYPH_H / 2, { color: c.col, width: 3 });
    cv.text(P.x + P.w + 5, c.y, c.txt, { color: c.col, scale: 1 });
  }

  // Header: title left, then subtitle, then the divergence tally (kept up here
  // rather than on the time axis, where it collided with the first tick label).
  const title = (o.title || 'VUMANCHU').toUpperCase();
  cv.text(P.x, 8, title, { color: T.textBright, scale: 2 });
  let hx = P.x + measureText(title, 2) + 10;
  if (o.subtitle) { cv.text(hx, 12, o.subtitle.toUpperCase(), { color: T.text, scale: 1 }); hx += measureText(o.subtitle, 1) + 10; }
  if (L.divergences.length) {
    const bearN = L.divergences.filter(d => d.bias === 'bear').length;
    cv.text(hx, 12, `${L.divergences.length} DIV`, { color: T.text, scale: 1 });
    hx += measureText(`${L.divergences.length} DIV`, 1) + 5;
    if (bearN) { cv.text(hx, 12, `${bearN}B`, { color: T.bear, scale: 1 }); hx += measureText(`${bearN}B`, 1) + 4; }
    if (L.divergences.length - bearN) cv.text(hx, 12, `${L.divergences.length - bearN}S`, { color: T.bull, scale: 1 });
  }

  const sigCol = L.reading.signal === 'OVERSOLD' || L.reading.signal === 'BULLISH' ? T.bull
               : L.reading.signal === 'OVERBOUGHT' || L.reading.signal === 'BEARISH' ? T.bear : T.text;
  const legend = [['WT1', T.wt1], ['WT2', T.wt2], ...(o.showVwap ? [['VWAP', T.vwap]] : []),
                  ...(o.showMoneyFlow ? [['MF', T.mfUpLine]] : []), [L.reading.signal, sigCol]];
  let lx = L.width - 8;
  for (const [lbl, col] of [...legend].reverse()) {
    const w = measureText(lbl, 1);
    lx -= w;
    cv.text(lx, 12, lbl, { color: col, scale: 1 });
    lx -= 6; cv.rect(lx, 14, 4, 2, col); lx -= 8;
  }

  for (const t of L.timeLabels) {
    const w = measureText(t.label, 1);
    cv.text(Math.min(L.width - w - 2, Math.max(2, t.x - w / 2)), P.y + P.h + 7, t.label, { color: T.text, scale: 1 });
  }

  return cv.toPNG();
}

// ── SVG (same geometry; real font, so labels keep their casing) ───────────────
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderVumanchuSVG(bars, opts = {}) {
  const L = vumanchuLayout(bars, opts);
  const o = L.opts, T = THEME, P = L.plot;
  const pl = pts => pts.filter(Boolean).map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const s = [];
  s.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}" font-family="ui-monospace,Menlo,Consolas,monospace">`);
  s.push(`<rect width="${L.width}" height="${L.height}" fill="${T.bg}"/>`);
  s.push(`<rect x="${P.x}" y="${P.y}" width="${P.w}" height="${P.h}" fill="${T.panel}"/>`);

  for (const g of L.gridlines) {
    if (g.style === 'edge') continue;
    const zero = g.style === 'zero';
    s.push(`<line x1="${P.x}" y1="${g.y.toFixed(1)}" x2="${P.x + P.w}" y2="${g.y.toFixed(1)}" stroke="${zero ? T.zero : T.obos}" stroke-width="${zero ? 1.2 : 1}"${zero ? '' : ' stroke-dasharray="4 5"'}/>`);
    if (g.label) s.push(`<text x="${P.x + P.w + 5}" y="${(g.y + 3).toFixed(1)}" fill="${T.grid}" font-size="10">${esc(g.label)}</text>`);
  }

  if (o.showMoneyFlow && L.points.mf.length) {
    const zeroY = L.yToPx(0);
    const runs = []; let cur = [];
    for (const p of L.points.mf) {
      if (!p) { if (cur.length > 1) runs.push(cur); cur = []; continue; }
      const up = p.y < zeroY;
      if (cur.length && (cur[0].y < zeroY) !== up) { cur.push(p); if (cur.length > 1) runs.push(cur); cur = [p]; }
      cur.push(p);
    }
    if (cur.length > 1) runs.push(cur);
    for (const r of runs) {
      const up = r[0].y < zeroY;
      const fwdPts = r.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ');
      s.push(`<path d="M ${fwdPts} L ${r.at(-1).x.toFixed(1)},${zeroY.toFixed(1)} L ${r[0].x.toFixed(1)},${zeroY.toFixed(1)} Z" fill="${(up ? T.mfUp : T.mfDn).slice(0, 7)}" fill-opacity="${(parseInt((up ? T.mfUp : T.mfDn).slice(7, 9), 16) / 255).toFixed(2)}"/>`);
      s.push(`<polyline points="${r.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="${up ? T.mfUpLine : T.mfDnLine}" stroke-width="1.1"/>`);
    }
  }
  if (L.band.a.length > 1) {
    s.push(`<path d="M ${pl(L.band.a).replace(/ /g, ' L ')} L ${pl([...L.band.b].reverse()).replace(/ /g, ' L ')} Z" fill="${T.band.slice(0, 7)}" fill-opacity="${(parseInt(T.band.slice(7, 9), 16) / 255).toFixed(2)}"/>`);
  }
  s.push(`<polyline points="${pl(L.points.wt2)}" fill="none" stroke="${T.wt2}" stroke-width="1.4"/>`);
  s.push(`<polyline points="${pl(L.points.wt1)}" fill="none" stroke="${T.wt1}" stroke-width="2.1"/>`);
  if (o.showVwap) s.push(`<polyline points="${pl(L.points.vwap)}" fill="none" stroke="${T.vwap}" stroke-width="1.5"/>`);

  for (const d of L.divergences) {
    s.push(`<line x1="${d.x0.toFixed(1)}" y1="${d.y0.toFixed(1)}" x2="${d.x1.toFixed(1)}" y2="${d.y1.toFixed(1)}" stroke="${d.color}" stroke-width="${d.width}"${d.dash ? ` stroke-dasharray="${d.dash.join(' ')}"` : ''}/>`);
    const r = d.series === 'wt' ? 3.1 : 2.4;
    for (const [x, y] of [[d.x0, d.y0], [d.x1, d.y1]]) {
      s.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${d.color}"/>`);
      if (d.series === 'vwap') s.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r - 1.2}" fill="${T.vwap}"/>`);
    }
  }

  for (const [val, col] of [[L.reading.wt1, T.wt1], [L.reading.wt2, T.wt2], ...(o.showVwap && L.reading.vwapOsc != null ? [[L.reading.vwapOsc, T.vwap]] : [])]) {
    if (val == null) continue;
    s.push(`<text x="${P.x + P.w + 5}" y="${(L.yToPx(val) + 3).toFixed(1)}" fill="${col}" font-size="10">${val >= 0 ? '+' : ''}${val.toFixed(1)}</text>`);
  }

  s.push(`<text x="${P.x}" y="20" fill="${T.textBright}" font-size="14" font-weight="700">${esc(o.title || 'VuManChu')}</text>`);
  if (o.subtitle) s.push(`<text x="${P.x + (o.title || 'VuManChu').length * 9 + 12}" y="20" fill="${T.text}" font-size="10">${esc(o.subtitle)}</text>`);
  const sigCol = L.reading.signal === 'OVERSOLD' || L.reading.signal === 'BULLISH' ? T.bull
               : L.reading.signal === 'OVERBOUGHT' || L.reading.signal === 'BEARISH' ? T.bear : T.text;
  s.push(`<text x="${L.width - 8}" y="20" fill="${sigCol}" font-size="10" text-anchor="end">${esc(L.reading.signal)}</text>`);
  for (const t of L.timeLabels) {
    s.push(`<text x="${t.x.toFixed(1)}" y="${P.y + P.h + 14}" fill="${T.text}" font-size="9" text-anchor="middle">${esc(t.label)}</text>`);
  }
  s.push('</svg>');
  return s.join('');
}

// ── JSON summary (drives the Telegram caption / any text consumer) ────────────
export function vumanchuChartData(bars, opts = {}) {
  const L = vumanchuLayout(bars, opts);
  const r3 = v => v == null || !Number.isFinite(v) ? null : +v.toFixed(3);
  return {
    reading: { ...L.reading, wt1: r3(L.reading.wt1), wt2: r3(L.reading.wt2), vwapOsc: r3(L.reading.vwapOsc), moneyFlow: r3(L.reading.moneyFlow) },
    slope: (() => {           // sign of WT1's last move — the "skew/slope" read
      const p = L.points.wt1.filter(Boolean);
      if (p.length < 2) return null;
      const d = p[p.length - 2].y - p[p.length - 1].y;   // y grows downward
      return d > 0 ? 'rising' : d < 0 ? 'falling' : 'flat';
    })(),
    divergences: L.divergences.map(d => ({
      series: d.series, kind: d.kind, bias: d.bias,
      barsAgo: L.to - d.iRec, iPrev: d.iPrev, iRec: d.iRec,
      oscPrev: r3(d.oscPrev), oscRec: r3(d.oscRec),
      pricePrev: d.pricePrev, priceRec: d.priceRec,
    })),
    window: { from: L.from, to: L.to, bars: L.to - L.from + 1, total: bars.length },
    vwapSeries: L.opts.vwapSeries,
  };
}

// One-line caption for a Telegram photo (kept well under the 1024-char cap).
export function vumanchuCaption(bars, opts = {}) {
  const d = vumanchuChartData(bars, opts);
  const bits = [`〰️ <b>${opts.title || 'VuManChu'}</b>`];
  if (opts.subtitle) bits.push(opts.subtitle);
  bits.push(`WT ${d.reading.signal}${d.reading.wt1 != null ? ` ${d.reading.wt1 >= 0 ? '+' : ''}${d.reading.wt1.toFixed(1)}` : ''} ${d.slope ?? ''}`.trim());
  const regs = d.divergences.filter(x => x.kind === 'regular');
  if (regs.length) {
    bits.push(regs.slice(-2).map(x => `${x.bias === 'bear' ? '🔻' : '🔺'} ${x.series.toUpperCase()} ${x.bias} div (${x.barsAgo} bars ago)`).join(' · '));
  }
  return bits.join(' · ');
}
