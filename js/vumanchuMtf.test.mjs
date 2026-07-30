/**
 * Unit tests for js/vumanchuMtf.js — the multi-timeframe WaveTrend overlay.
 * Pure/synthetic: no network, no browser. `node js/vumanchuMtf.test.mjs`
 *
 * The load-bearing tests are the CAUSALITY ones. A step-hold that leaks the
 * future still renders a beautiful, plausible chart, so nothing but an explicit
 * test catches it:
 *   • no drawn slow value may come from a bar that closes after the fast bar
 *   • truncating the data must not change any earlier aligned value
 * Everything else is geometry and bookkeeping.
 */
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { computeWaveTrend } from './vumanchuCore.js';
import {
  alignHtfCausal, agreementSeries, agreementStats, inferPeriodSec, barSec,
  vumanchuMtfLayout, renderVumanchuMtfPNG, renderVumanchuMtfSVG,
  vumanchuMtfData, vumanchuMtfCaption, MIN_BARS, TF_SECONDS, MTF_THEME, AGREE_MODES,
} from './vumanchuMtf.js';

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

function decodePNG(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  let off = 8, width = 0, height = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); }
    else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
    if (type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 3, rgb = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) raw.copy(rgb, y * stride, y * (1 + stride) + 1, y * (1 + stride) + 1 + stride);
  return { width, height, at: (x, y) => [...rgb.subarray((y * width + x) * 3, (y * width + x) * 3 + 3)] };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
const T0 = 1_761_000_000;   // fixed epoch seconds; no Date.now() so runs are reproducible

// Bars on a given period. `shape(i)` returns a close; OHLC is derived around it.
function bars(n, periodSec, shape, startSec = T0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = shape(i), o = shape(i - 1);
    out.push({
      open: o, close: c,
      high: Math.max(o, c) * 1.0004, low: Math.min(o, c) * 0.9996,
      volume: 100 + (i % 13), t: startSec + i * periodSec,
    });
  }
  return out;
}
// A fast/slow pair over the SAME synthetic price path, so the slow series really
// is the coarser view of the fast one (ratio must be an integer).
function pair(nFast, fastSec, slowSec, shape) {
  const ratio = slowSec / fastSec;
  const f = bars(nFast, fastSec, shape);
  const nSlow = Math.floor(nFast / ratio);
  const s = [];
  for (let j = 0; j < nSlow; j++) {
    const grp = f.slice(j * ratio, (j + 1) * ratio);
    s.push({
      open: grp[0].open, close: grp.at(-1).close,
      high: Math.max(...grp.map(b => b.high)), low: Math.min(...grp.map(b => b.low)),
      volume: grp.reduce((a, b) => a + b.volume, 0), t: grp[0].t,
    });
  }
  return { fast: f, slow: s };
}
const wavy = (amp = 0.004, per = 11) => i => 1.15 + amp * Math.sin(i / per) + 0.00004 * i;
const trend = i => 1.15 + 0.00006 * i + 0.003 * Math.sin(i / 9);

console.log('\nhelpers');
t('barSec accepts seconds, ms, ISO time and datetime', () => {
  assert.equal(barSec({ t: 1_761_000_000 }), 1_761_000_000);
  assert.equal(barSec({ t: 1_761_000_000_000 }), 1_761_000_000);
  assert.equal(barSec({ time: '2025-10-20T00:00:00.000Z' }), Date.parse('2025-10-20T00:00:00Z') / 1000);
  assert.equal(barSec({ datetime: '2025-10-20 00:00:00' }), Date.parse('2025-10-20T00:00:00Z') / 1000);
  assert.equal(barSec({}), null);
  assert.equal(barSec(null), null);
});
t('inferPeriodSec finds the period and ignores gaps (median, not mean)', () => {
  assert.equal(inferPeriodSec(bars(50, 300, wavy())), 300);
  const gappy = bars(50, 300, wavy());
  gappy[25].t += 3 * 86400;                       // a weekend-sized hole
  for (let i = 26; i < gappy.length; i++) gappy[i].t += 3 * 86400;
  assert.equal(inferPeriodSec(gappy), 300, 'one huge gap must not move the median');
});
t('TF_SECONDS covers the granularities the route offers', () => {
  for (const k of ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D']) assert.ok(TF_SECONDS[k] > 0, k);
  assert.equal(TF_SECONDS.M30 / TF_SECONDS.M5, 6);
});

console.log('\nalignHtfCausal — the lookahead guard');
t('each fast bar takes the last slow bar that had CLOSED by its own close', () => {
  const { fast, slow } = pair(120, 300, 1800, wavy());   // M5 / M30, ratio 6
  const idx = slow.map((_, j) => j);                     // series = its own index
  const { values, slowIdx } = alignHtfCausal(fast, slow, idx, { fastSec: 300, slowSec: 1800 });
  for (let i = 0; i < fast.length; i++) {
    const fastCloseAt = fast[i].t + 300;
    if (slowIdx[i] < 0) { assert.ok(Number.isNaN(values[i])); continue; }
    const used = slow[slowIdx[i]];
    assert.ok(used.t + 1800 <= fastCloseAt, `bar ${i}: used a slow bar closing at ${used.t + 1800} > fast close ${fastCloseAt} — FUTURE LEAK`);
    const next = slow[slowIdx[i] + 1];
    if (next) assert.ok(next.t + 1800 > fastCloseAt, `bar ${i}: a later slow bar had also closed — not the LAST closed one`);
    assert.equal(values[i], slowIdx[i], 'value tracks the chosen slow bar');
  }
});
t('the value is held flat across a slow bar, then steps exactly once', () => {
  const { fast, slow } = pair(120, 300, 1800, wavy());
  const { slowIdx } = alignHtfCausal(fast, slow, slow.map((_, j) => j), { fastSec: 300, slowSec: 1800 });
  // slowIdx steps at i ≡ 5 (mod 6), so 41..46 is a full flat run. Slicing across
  // a step boundary (e.g. 40..45) correctly shows two values — that is the step.
  const run = slowIdx.slice(41, 41 + 6);
  assert.equal(new Set(run).size, 1, `6 consecutive M5 bars should share one M30 value, got ${run}`);
  assert.equal(new Set(slowIdx.slice(40, 46)).size, 2, 'and a window straddling a boundary shows the step');
  // and monotonically non-decreasing overall
  for (let i = 1; i < slowIdx.length; i++) assert.ok(slowIdx[i] >= slowIdx[i - 1], 'slow index never goes backwards');
});
t('leading fast bars have NO slow value until the first slow close', () => {
  const { fast, slow } = pair(120, 300, 1800, wavy());
  const { values, slowIdx } = alignHtfCausal(fast, slow, slow.map((_, j) => j), { fastSec: 300, slowSec: 1800 });
  // First M30 bar starts at T0 and closes at T0+1800; the M5 bar closing exactly
  // then is index 5 (t=T0+1500, close T0+1800).
  for (let i = 0; i < 5; i++) assert.equal(slowIdx[i], -1, `fast bar ${i} must have no slow value yet`);
  assert.equal(slowIdx[5], 0, 'the bar closing exactly on the slow close may use it');
  assert.ok(Number.isNaN(values[0]));
});
t('CAUSALITY: truncating the data cannot change any earlier aligned value', () => {
  const { fast, slow } = pair(200, 300, 1800, wavy());
  const full = alignHtfCausal(fast, slow, slow.map((_, j) => j), { fastSec: 300, slowSec: 1800 });
  for (const cut of [80, 120, 137, 199]) {
    const fSlice = fast.slice(0, cut);
    // Slow bars a real caller would have: only those that have started.
    const sSlice = slow.filter(b => b.t <= fSlice.at(-1).t);
    const part = alignHtfCausal(fSlice, sSlice, sSlice.map((_, j) => j), { fastSec: 300, slowSec: 1800 });
    for (let i = 0; i < cut; i++) {
      assert.equal(part.slowIdx[i], full.slowIdx[i], `cut ${cut}, bar ${i}: past changed when future was removed`);
    }
  }
});
t('a naive contains-mapping WOULD leak — proving the test has teeth', () => {
  const { fast, slow } = pair(120, 300, 1800, wavy());
  const causal = alignHtfCausal(fast, slow, slow.map((_, j) => j), { fastSec: 300, slowSec: 1800 });
  // The bug being guarded against: "which slow bar contains this fast bar".
  const naive = fast.map(b => Math.floor((b.t - slow[0].t) / 1800));
  let leaks = 0;
  for (let i = 0; i < fast.length; i++) if (naive[i] > causal.slowIdx[i]) leaks++;
  assert.ok(leaks > 50, `expected the naive mapping to be ahead on most bars, got ${leaks}`);
  assert.notDeepEqual(naive, causal.slowIdx);
});
t('works with no fastSec/slowSec by inferring both periods', () => {
  const { fast, slow } = pair(120, 300, 1800, wavy());
  const a = alignHtfCausal(fast, slow, slow.map((_, j) => j));
  const b = alignHtfCausal(fast, slow, slow.map((_, j) => j), { fastSec: 300, slowSec: 1800 });
  assert.deepEqual(a.slowIdx, b.slowIdx);
});
t('throws rather than guessing when periods are undeterminable', () => {
  const f = bars(80, 300, wavy()).map(b => ({ ...b, t: undefined }));
  assert.throws(() => alignHtfCausal(f, f, f.map(() => 1)), /cannot determine bar periods/);
});

console.log('\nagreement');
t('direction mode compares the sign of wt1−wt2 on each side', () => {
  const fast = { wt1: [10, 10, -5, -5], wt2: [5, 20, -10, 0] };   // up, down, up, down
  const slow = { wt1: [1, 1, 1, 1], wt2: [0, 0, 2, 2] };          // up, up, down, down
  assert.deepEqual(agreementSeries(fast, slow, 'direction'), [true, false, false, true]);
});
t('level mode compares which side of zero', () => {
  const fast = { wt1: [5, 5, -5, -5], wt2: [0, 0, 0, 0] };
  const slow = { wt1: [1, -1, 1, -1], wt2: [0, 0, 0, 0] };
  assert.deepEqual(agreementSeries(fast, slow, 'level'), [true, false, false, true]);
});
t('zone mode: same zone true, opposite false, no zone null', () => {
  const fast = { wt1: [60, 60, -60, 10], wt2: [0, 0, 0, 0] };
  const slow = { wt1: [60, -60, -60, 60], wt2: [0, 0, 0, 0] };
  assert.deepEqual(agreementSeries(fast, slow, 'zone'), [true, false, true, null]);
});
t('non-finite values yield null, never a silent false', () => {
  const fast = { wt1: [NaN, 5, 5], wt2: [0, NaN, 0] };
  const slow = { wt1: [5, 5, 5], wt2: [0, 0, 0] };
  assert.deepEqual(agreementSeries(fast, slow, 'direction'), [null, null, true]);
  assert.deepEqual(agreementSeries(fast, slow, 'level'), [null, true, true]);
});
t('agreementStats reports pct, a baseline, and their delta', () => {
  const { fast, slow } = pair(400, 300, 1800, wavy());
  const f = computeWaveTrend(fast, { n1: 9, n2: 12, sp: 3 });
  const sRaw = computeWaveTrend(slow, { n1: 9, n2: 12, sp: 3 });
  const s = {
    wt1: alignHtfCausal(fast, slow, sRaw.wt1, { fastSec: 300, slowSec: 1800 }).values,
    wt2: alignHtfCausal(fast, slow, sRaw.wt2, { fastSec: 300, slowSec: 1800 }).values,
  };
  const st = agreementStats(f, s, 'direction');
  assert.ok(st.agreePct > 0 && st.agreePct <= 100, `pct ${st.agreePct}`);
  assert.ok(st.baselinePct > 0 && st.baselinePct <= 100, `baseline ${st.baselinePct}`);
  assert.ok(st.baselineShifts > 5, 'several re-phasings contributed');
  assert.ok(Math.abs(st.delta - (st.agreePct - st.baselinePct)) < 1e-9);
  assert.ok(st.comparableBars > 100);
  console.log(`      direction: ${st.agreePct.toFixed(1)}% vs baseline ${st.baselinePct.toFixed(1)}% (delta ${st.delta >= 0 ? '+' : ''}${st.delta.toFixed(1)}pp, max-shift ${st.baselineMaxPct.toFixed(1)}%)`);
});
t('the baseline is deterministic — no RNG, so cached image and JSON agree', () => {
  const { fast, slow } = pair(300, 300, 1800, trend);
  const f = computeWaveTrend(fast, { n1: 9, n2: 12, sp: 3 });
  const sr = computeWaveTrend(slow, { n1: 9, n2: 12, sp: 3 });
  const s = { wt1: alignHtfCausal(fast, slow, sr.wt1).values, wt2: alignHtfCausal(fast, slow, sr.wt2).values };
  const a = agreementStats(f, s, 'direction'), b = agreementStats(f, s, 'direction');
  assert.equal(a.baselinePct, b.baselinePct);
  assert.equal(a.baselineMaxPct, b.baselineMaxPct);
});
t('a perfectly-agreeing pair scores 100% and beats its own baseline', () => {
  const f = { wt1: [], wt2: [] };
  for (let i = 0; i < 200; i++) { f.wt1.push(Math.sin(i / 9) * 50); f.wt2.push(Math.sin((i - 2) / 9) * 50); }
  const st = agreementStats(f, f, 'direction');
  assert.equal(st.agreePct, 100);
  assert.ok(st.delta > 0, 'identical series must beat a re-phased version of themselves');
});

console.log('\nlayout');
t('refuses too little history on either side', () => {
  const { fast, slow } = pair(400, 300, 1800, wavy());
  assert.throws(() => vumanchuMtfLayout(fast.slice(0, 40), slow), /need ≥60 fast bars/);
  assert.throws(() => vumanchuMtfLayout(fast, slow.slice(0, 10)), /need ≥60 slow bars/);
});
t('refuses a slow timeframe that is not coarser than the fast one', () => {
  const a = bars(200, 300, wavy()), b = bars(200, 300, wavy());
  assert.throws(() => vumanchuMtfLayout(a, b, { fastSec: 300, slowSec: 300 }), /must be COARSER/);
  assert.throws(() => vumanchuMtfLayout(a, b, { fastSec: 1800, slowSec: 300 }), /must be COARSER/);
});
t('rejects an unknown agreement mode instead of silently defaulting', () => {
  const { fast, slow } = pair(400, 300, 1800, wavy());
  assert.throws(() => vumanchuMtfLayout(fast, slow, { agreeMode: 'vibes' }), /agreeMode must be/);
  for (const m of AGREE_MODES) assert.doesNotThrow(() => vumanchuMtfLayout(fast, slow, { agreeMode: m }));
});
t('x-axis is the FAST grid and the window is the last displayBars', () => {
  const { fast, slow } = pair(500, 300, 1800, wavy());
  const L = vumanchuMtfLayout(fast, slow, { displayBars: 150 });
  assert.equal(L.to, 499);
  assert.equal(L.nVis, 150);
  assert.equal(L.points.fastWt1.length, 150, 'one point per FAST bar, not per slow bar');
  assert.ok(Math.abs(L.xToPx(L.from) - L.plot.x) < 1e-9);
  assert.ok(Math.abs(L.xToPx(L.to) - (L.plot.x + L.plot.w)) < 1e-9);
});
t('window skips warm-up so neither wave opens on a gap', () => {
  const { fast, slow } = pair(500, 300, 1800, wavy());
  const L = vumanchuMtfLayout(fast, slow, { displayBars: 400 });
  assert.ok(L.points.fastWt2.every(Boolean), 'no holes in the visible fast signal');
  assert.ok(L.points.slowWt1.every(Boolean), 'no holes in the visible slow wave');
});
t('the slow wave is a staircase — repeated values, then a step', () => {
  const { fast, slow } = pair(400, 300, 1800, wavy());
  const L = vumanchuMtfLayout(fast, slow, { displayBars: 120, fastSec: 300, slowSec: 1800 });
  const ys = L.points.slowWt1.map(p => +p.y.toFixed(6));
  const distinct = new Set(ys).size;
  assert.ok(distinct >= 15 && distinct <= 25, `120 M5 bars ≈ 20 M30 levels, got ${distinct}`);
  assert.ok(distinct < 120, 'must not be a distinct value per fast bar');
});
t('zero line is centred and every drawn point is inside the plot', () => {
  const { fast, slow } = pair(400, 300, 1800, wavy());
  const L = vumanchuMtfLayout(fast, slow);
  assert.ok(Math.abs(L.gridlines.find(g => g.zero).y - (L.plot.y + L.plot.h / 2)) < 1e-9);
  for (const k of Object.keys(L.points)) for (const p of L.points[k]) {
    if (!p) continue;
    assert.ok(p.y >= L.plot.y - 0.01 && p.y <= L.plot.y + L.plot.h + 0.01, `${k} inside plot`);
  }
});
t('the ribbon sits below the plot, not over it', () => {
  const { fast, slow } = pair(400, 300, 1800, wavy());
  const L = vumanchuMtfLayout(fast, slow, { height: 460, ribbonPx: 9 });
  assert.ok(L.plot.y + L.plot.h + 3 + L.ribbon <= L.height, 'ribbon fits inside the canvas');
});
t('reading reports both sides plus the current run length', () => {
  const { fast, slow } = pair(400, 300, 1800, wavy());
  const L = vumanchuMtfLayout(fast, slow);
  assert.ok(Number.isFinite(L.reading.fastWt1) && Number.isFinite(L.reading.slowWt1));
  assert.ok(L.reading.agree === true || L.reading.agree === false || L.reading.agree === null);
  if (L.reading.agree !== null) assert.ok(L.reading.runBars >= 1);
});

console.log('\nrender');
t('PNG decodes at the requested size', () => {
  const { fast, slow } = pair(400, 300, 1800, wavy());
  const img = decodePNG(renderVumanchuMtfPNG(fast, slow, { width: 900, height: 380, fastLabel: 'M5', slowLabel: 'M30' }));
  assert.equal(img.width, 900); assert.equal(img.height, 380);
});
t('both waves are actually on the canvas (fast blue, slow purple)', () => {
  const { fast, slow } = pair(400, 300, 1800, wavy());
  const img = decodePNG(renderVumanchuMtfPNG(fast, slow, { width: 800, height: 360 }));
  let blue = 0, purple = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const [r, g, b] = img.at(x, y);
    if (b > 180 && g > 130 && r < 140) blue++;                 // #5bc0f8
    if (r > 150 && b > 200 && g < 150) purple++;               // #c084fc
  }
  assert.ok(blue > 300, `fast wave pixels ${blue}`);
  assert.ok(purple > 300, `slow wave pixels ${purple}`);
});
t('the ribbon paints green and/or red along the bottom strip', () => {
  const { fast, slow } = pair(400, 300, 1800, wavy());
  const L = vumanchuMtfLayout(fast, slow, { width: 800, height: 360 });
  const img = decodePNG(renderVumanchuMtfPNG(fast, slow, { width: 800, height: 360 }));
  const ry = Math.round(L.plot.y + L.plot.h + 3);
  let green = 0, red = 0;
  for (let y = ry; y < ry + L.ribbon; y++) for (let x = Math.ceil(L.plot.x); x < L.plot.x + L.plot.w; x++) {
    const [r, g, b] = img.at(x, y);
    if (g > 150 && r < 110 && b < 130) green++;
    if (r > 190 && g < 110 && b < 110) red++;
  }
  assert.ok(green + red > 200, `ribbon pixels green=${green} red=${red}`);
  assert.ok(green > 0 && red > 0, 'a wavy fixture should both agree and disagree somewhere');
});
t('render is deterministic', () => {
  // ≥60*ratio fast bars, or the derived slow series can't clear MIN_BARS.
  const { fast, slow } = pair(420, 300, 1800, wavy());
  const a = renderVumanchuMtfPNG(fast, slow, { width: 500, height: 300 });
  const b = renderVumanchuMtfPNG(fast, slow, { width: 500, height: 300 });
  assert.ok(a.equals(b));
});
t('a 1200×460 pane renders quickly', () => {
  const { fast, slow } = pair(600, 300, 1800, wavy());
  const t0 = process.hrtime.bigint();
  renderVumanchuMtfPNG(fast, slow, { width: 1200, height: 460, displayBars: 200, fastLabel: 'M5', slowLabel: 'M30' });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 1200, `took ${ms.toFixed(0)}ms`);
  console.log(`      (render ${ms.toFixed(0)}ms)`);
});
t('SVG is well-formed, has both waves, and escapes a hostile title', () => {
  const { fast, slow } = pair(400, 300, 1800, wavy());
  const svg = renderVumanchuMtfSVG(fast, slow, { width: 800, height: 360, title: '<script>x</script>', fastLabel: 'M5', slowLabel: 'M30' });
  assert.match(svg, /^<svg /); assert.ok(svg.endsWith('</svg>'));
  assert.equal((svg.match(/</g) || []).length, (svg.match(/>/g) || []).length, 'balanced tags');
  assert.ok(svg.includes(MTF_THEME.slowWt1), 'slow wave present');
  assert.ok(!svg.includes('<script>') && svg.includes('&lt;script&gt;'));
});

console.log('\ndata / caption');
t('JSON is serialisable and carries the baseline caveat', () => {
  const { fast, slow } = pair(400, 300, 1800, wavy());
  const d = vumanchuMtfData(fast, slow, { fastLabel: 'M5', slowLabel: 'M30', displayBars: 200 });
  assert.deepEqual(d, JSON.parse(JSON.stringify(d)), 'no NaN/Infinity leaks');
  assert.equal(d.fastSec, 300); assert.equal(d.slowSec, 1800);
  assert.equal(d.window.bars, 200);
  assert.ok(d.agreement.pct != null && d.agreement.baselinePct != null);
  assert.match(d.agreement.note, /read delta/i, 'the number ships with its caveat');
});
// The headline % must describe the SAME bars as the ribbon under it. Measuring
// over the whole fetched series (warm-up history included) let comparableBars
// exceed window.bars and silently described a wider span than the picture.
t('agreement is measured over the VISIBLE WINDOW, not the fetched history', () => {
  const { fast, slow } = pair(1400, 300, 1800, wavy());
  for (const bars of [120, 200, 400]) {
    const d = vumanchuMtfData(fast, slow, { displayBars: bars, fastSec: 300, slowSec: 1800 });
    assert.equal(d.window.bars, bars);
    assert.ok(d.agreement.comparableBars <= d.window.bars,
      `comparableBars ${d.agreement.comparableBars} must not exceed the ${bars}-bar window`);
    assert.ok(d.window.totalFast > d.window.bars, 'fixture really does have more history than the window');
  }
  // Different windows over the same data must give different readings — proof the
  // window is genuinely what's measured.
  const a = vumanchuMtfData(fast, slow, { displayBars: 120, fastSec: 300, slowSec: 1800 }).agreement.pct;
  const b = vumanchuMtfData(fast, slow, { displayBars: 800, fastSec: 300, slowSec: 1800 }).agreement.pct;
  assert.notEqual(a, b);
});
t('ribbon and runBars are window-indexed and consistent with the reading', () => {
  const { fast, slow } = pair(900, 300, 1800, wavy());
  const L = vumanchuMtfLayout(fast, slow, { displayBars: 150, fastSec: 300, slowSec: 1800 });
  assert.equal(L.stats.series.length, L.nVis, 'stats.series spans exactly the window');
  assert.equal(L.reading.agree, L.stats.series[L.nVis - 1], 'reading is the last visible bar');
  if (L.reading.agree !== null) {
    assert.ok(L.reading.runBars >= 1 && L.reading.runBars <= L.nVis, `runBars ${L.reading.runBars} within window`);
    // every bar in the run must match the current state
    for (let k = L.nVis - L.reading.runBars; k < L.nVis; k++) assert.equal(L.stats.series[k], L.reading.agree);
  }
});
t('caption fits Telegram’s 1024-char cap and names both timeframes', () => {
  const { fast, slow } = pair(400, 300, 1800, wavy());
  const cap = vumanchuMtfCaption(fast, slow, { title: 'EUR/USD', fastLabel: 'M5', slowLabel: 'M30' });
  assert.ok(cap.length < 1024, `caption ${cap.length}`);
  assert.match(cap, /M5 vs M30/);
  console.log(`      caption: ${cap}`);
});
t('a flat series degrades to nulls without throwing', () => {
  const flat = i => 1.2;
  const { fast, slow } = pair(400, 300, 1800, flat);
  assert.doesNotThrow(() => decodePNG(renderVumanchuMtfPNG(fast, slow, { width: 500, height: 300 })));
});
t('M15/H1 (ratio 4) and M5/H4 (ratio 48) both work', () => {
  // This fixture DERIVES slow bars from fast ones, so it needs ratio×MIN_BARS
  // fast bars. The route fetches the two series independently, so a big ratio
  // there costs slow-series history, not fast — but the constraint is real:
  // the slow side must reach far enough back to clear its own warm-up.
  for (const [fs, ss] of [[900, 3600], [300, 14400]]) {
    const ratio = ss / fs;
    const { fast, slow } = pair(Math.max(400, ratio * 70), fs, ss, wavy());
    const L = vumanchuMtfLayout(fast, slow, { fastSec: fs, slowSec: ss, displayBars: 120 });
    assert.ok(L.points.slowWt1.some(Boolean), `ratio ${ratio} produced a slow wave`);
    assert.ok(new Set(L.points.slowWt1.filter(Boolean).map(p => +p.y.toFixed(6))).size < 120, `ratio ${ratio} is stepped`);
  }
});
// Locks in the measured lag relationship from the header note. This is the
// regression test for the alignment itself: invert or un-lag the step-hold and
// these two flip.
t('LAG: a long price cycle agrees ABOVE baseline, a short one BELOW', () => {
  const run = (period, mode) => {
    const cyc = Math.round(2 * Math.PI * period);
    const { fast, slow } = pair(Math.max(2200, cyc * 6), 300, 1800, i => 1.15 + 0.004 * Math.sin(i / period));
    const f = computeWaveTrend(fast, { n1: 9, n2: 12, sp: 3 });
    const sr = computeWaveTrend(slow, { n1: 9, n2: 12, sp: 3 });
    const s = {
      wt1: alignHtfCausal(fast, slow, sr.wt1, { fastSec: 300, slowSec: 1800 }).values,
      wt2: alignHtfCausal(fast, slow, sr.wt2, { fastSec: 300, slowSec: 1800 }).values,
    };
    return agreementStats(f, s, mode);
  };
  const slowCycle = run(320, 'direction');      // cycle ≈ 2011 bars, ~28× the lag
  const fastCycle = run(11, 'direction');       // cycle ≈ 69 bars, ~1× the lag
  assert.ok(slowCycle.delta > 20, `long cycle should agree well above baseline, got ${slowCycle.delta?.toFixed(1)}pp`);
  assert.ok(fastCycle.delta < -20, `short cycle should sit well below baseline (smoothing lag), got ${fastCycle.delta?.toFixed(1)}pp`);
});
t('on broadband price, level/zone agree above baseline where direction does not', () => {
  const shape = i => 1.15 + 0.00004 * i + 0.004 * Math.sin(i / 130) + 0.002 * Math.sin(i / 37) + 0.0008 * Math.sin(i / 9);
  const { fast, slow } = pair(2400, 300, 1800, shape);
  const f = computeWaveTrend(fast, { n1: 9, n2: 12, sp: 3 });
  const sr = computeWaveTrend(slow, { n1: 9, n2: 12, sp: 3 });
  const s = {
    wt1: alignHtfCausal(fast, slow, sr.wt1, { fastSec: 300, slowSec: 1800 }).values,
    wt2: alignHtfCausal(fast, slow, sr.wt2, { fastSec: 300, slowSec: 1800 }).values,
  };
  const d = {}; for (const m of AGREE_MODES) d[m] = agreementStats(f, s, m);
  assert.ok(d.level.delta > 0, `level delta ${d.level.delta?.toFixed(1)}pp should be positive`);
  assert.ok(d.zone.delta > 0, `zone delta ${d.zone.delta?.toFixed(1)}pp should be positive`);
  assert.ok(d.direction.delta < d.level.delta, 'direction must not look better than level here');
  assert.ok(d.zone.comparableBars < d.level.comparableBars, 'zone is the sparser statistic');
  console.log(`      level ${d.level.delta.toFixed(1)}pp · zone ${d.zone.delta.toFixed(1)}pp (n=${d.zone.comparableBars}) · direction ${d.direction.delta.toFixed(1)}pp`);
});
t('the default mode is level, and JSON warns when direction/zone are used', () => {
  const { fast, slow } = pair(420, 300, 1800, wavy());
  assert.equal(vumanchuMtfLayout(fast, slow).opts.agreeMode, 'level');
  assert.doesNotMatch(vumanchuMtfData(fast, slow).agreement.note, /MODE CAVEAT/);
  assert.match(vumanchuMtfData(fast, slow, { agreeMode: 'direction' }).agreement.note, /smoothing lag/);
  assert.match(vumanchuMtfData(fast, slow, { agreeMode: 'zone' }).agreement.note, /comparableBars/);
});

console.log(`\n${passed} passed${process.exitCode ? ' — WITH FAILURES' : ''}\n`);
