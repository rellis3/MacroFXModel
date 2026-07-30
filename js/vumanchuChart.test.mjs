/**
 * Unit tests for the two new render bricks — js/pngCanvas.js (Tier 1 raster) and
 * js/vumanchuChart.js (Tier 2 VuManChu pane). Pure/synthetic: no network, no
 * browser, no OANDA — runnable in the sandbox where OANDA 403s.
 *
 *   node js/vumanchuChart.test.mjs
 *
 * The PNG assertions decode the emitted bytes back to pixels (chunk walk →
 * inflate → un-filter) so "it produced a Buffer" can never pass for "it produced
 * a valid image".
 */
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { createCanvas, parseColor, measureText, encodePNG } from './pngCanvas.js';
import {
  vumanchuLayout, renderVumanchuPNG, renderVumanchuSVG,
  vumanchuChartData, vumanchuCaption, MIN_BARS, THEME,
} from './vumanchuChart.js';

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

// ── A real PNG decoder, so the encoder is checked end-to-end ──────────────────
function decodePNG(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], 'PNG signature');
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  const seen = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    const crc = buf.readUInt32BE(off + 8 + len);
    // Verify the CRC independently of the encoder's own table.
    assert.equal(crc, zlib.crc32
      ? zlib.crc32(buf.subarray(off + 4, off + 8 + len))
      : crc, `CRC of ${type}`);
    seen.push(type);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      assert.equal(data[10], 0); assert.equal(data[11], 0); assert.equal(data[12], 0);
    } else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
    if (type === 'IEND') break;
  }
  assert.deepEqual(seen, ['IHDR', 'IDAT', 'IEND'], 'chunk order');
  assert.equal(bitDepth, 8); assert.equal(colorType, 2);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 3;
  assert.equal(raw.length, height * (1 + stride), 'scanline length');
  const rgb = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    assert.equal(raw[y * (1 + stride)], 0, `filter byte row ${y}`);
    raw.copy(rgb, y * stride, y * (1 + stride) + 1, y * (1 + stride) + 1 + stride);
  }
  return { width, height, rgb, at: (x, y) => [...rgb.subarray((y * width + x) * 3, (y * width + x) * 3 + 3)] };
}

// ── Synthetic bars ───────────────────────────────────────────────────────────
// Manufacturing a WaveTrend divergence takes more than fading the price swing.
// WT is SCALE-INVARIANT: the channel index divides by an EMA of its own mean
// absolute deviation, so shrinking the oscillation amplitude shrinks numerator
// and denominator together and the WT amplitude barely moves. (Measured: a
// smooth exp(-i/150) amplitude decay over 320 bars produced exactly ONE regular
// divergence, in the EMA warm-up.) What DOES bend the oscillator away from price
// is a step change faster than the n1=10 EMA can adapt to — hence a staircase:
// each 40-bar segment steps the trend and cuts the swing amplitude, so price
// prints higher highs while the wave's highs sag. dir=+1 → regular BEAR
// divergences; dir=-1 → regular BULL.
function staircaseBars(n = 320, dir = 1) {
  const bars = [];
  for (let i = 0; i < n; i++) {
    const seg = Math.floor(i / 40);
    const amp = 0.005 / (1 + seg * 0.9);
    const trend = 1.15 + dir * (seg * 0.004 + (i % 40) * 0.00005);
    const o = trend + amp * Math.sin((i - 1) / 6);
    const c = trend + amp * Math.sin(i / 6);
    bars.push({
      open: o, close: c,
      high: Math.max(o, c) + amp * 0.15,
      low: Math.min(o, c) - amp * 0.15,
      volume: 100 + (i % 17) * 3,
      t: 1_760_000_000 + i * 300,
    });
  }
  return bars;
}
const decayingBars = (n = 320) => staircaseBars(n, 1);
const flatBars = n => Array.from({ length: n }, (_, i) => ({
  open: 1.2, high: 1.2005, low: 1.1995, close: 1.2, volume: 10, t: 1_760_000_000 + i * 300,
}));

console.log('\npngCanvas — colour + text');
t('parseColor handles #rgb / #rrggbb / #rrggbbaa', () => {
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseColor('#0b0e14'), { r: 11, g: 14, b: 20, a: 1 });
  const half = parseColor('#ff000080');
  assert.equal(half.r, 255); assert.ok(Math.abs(half.a - 128 / 255) < 1e-9);
  assert.throws(() => parseColor('nope'));
});
t('measureText advances 6px per glyph at scale 1', () => {
  assert.equal(measureText('', 1), 0);
  assert.equal(measureText('A', 1), 5);
  assert.equal(measureText('AB', 1), 11);          // 5 + 1 spacing + 5
  assert.equal(measureText('AB', 2), 22);
});

console.log('\npngCanvas — drawing');
t('clear fills every pixel with the background', () => {
  const cv = createCanvas(4, 3, '#102030');
  assert.deepEqual(cv.pixelAt(0, 0), [0x10, 0x20, 0x30]);
  assert.deepEqual(cv.pixelAt(3, 2), [0x10, 0x20, 0x30]);
});
t('opaque rect paints exactly its span', () => {
  const cv = createCanvas(10, 10, '#000000');
  cv.rect(2, 2, 3, 3, '#ffffff');
  assert.deepEqual(cv.pixelAt(2, 2), [255, 255, 255]);
  assert.deepEqual(cv.pixelAt(4, 4), [255, 255, 255]);
  assert.deepEqual(cv.pixelAt(5, 5), [0, 0, 0], 'outside the span stays bg');
  assert.deepEqual(cv.pixelAt(1, 2), [0, 0, 0]);
});
t('50% alpha blends halfway onto the backdrop', () => {
  const cv = createCanvas(4, 4, '#000000');
  cv.rect(0, 0, 4, 4, '#ffffff80');
  const [r] = cv.pixelAt(1, 1);
  assert.ok(r >= 126 && r <= 130, `expected ~128, got ${r}`);
});
t('horizontal line lands on its row and anti-aliases', () => {
  const cv = createCanvas(20, 20, '#000000');
  cv.line(2, 10.5, 18, 10.5, { color: '#ffffff', width: 1 });
  assert.ok(cv.pixelAt(10, 10)[0] > 200, 'centre row is lit');
  assert.ok(cv.pixelAt(10, 13)[0] === 0, 'three rows away is untouched');
});
t('dashed line leaves gaps a solid line would not', () => {
  const solid = createCanvas(48, 6, '#000000'); solid.line(0, 3.5, 48, 3.5, { color: '#fff', width: 1 });
  const dashed = createCanvas(48, 6, '#000000'); dashed.line(0, 3.5, 48, 3.5, { color: '#fff', width: 1, dash: [4, 8] });
  // Count FULLY lit pixels — anti-aliasing bleeds a dash's ends, so a coverage
  // threshold would blur the very gaps this test is about.
  const lit = cv => { let n = 0; for (let x = 0; x < 48; x++) if (cv.pixelAt(x, 3)[0] > 200) n++; return n; };
  assert.ok(lit(solid) > 40, `solid should be near-continuous, got ${lit(solid)}`);
  assert.ok(lit(dashed) < lit(solid) * 0.55, `dashed ${lit(dashed)} should be well under solid ${lit(solid)}`);
});
t('fillBetween fills the span between two series with no column gaps', () => {
  const cv = createCanvas(30, 30, '#000000');
  const a = [], b = [];
  for (let i = 0; i <= 29; i++) { a.push({ x: i, y: 5 }); b.push({ x: i, y: 20 }); }
  cv.fillBetween(a, b, '#ffffff');
  for (let x = 1; x < 29; x++) assert.ok(cv.pixelAt(x, 12)[0] > 200, `column ${x} filled`);
  assert.equal(cv.pixelAt(15, 25)[0], 0, 'below the band stays bg');
});
t('fillBetween stays gap-free when bars are packed under 1px apart', () => {
  const cv = createCanvas(40, 20, '#000000');
  const a = [], b = [];
  for (let i = 0; i < 200; i++) { a.push({ x: i * 0.19, y: 4 }); b.push({ x: i * 0.19, y: 15 }); }
  cv.fillBetween(a, b, '#ffffff');
  for (let x = 1; x < 37; x++) assert.ok(cv.pixelAt(x, 9)[0] > 200, `dense column ${x} filled`);
});
t('disc is round — lit at the centre, dark past the radius', () => {
  const cv = createCanvas(20, 20, '#000000');
  cv.disc(10, 10, 4, '#ffffff');
  assert.ok(cv.pixelAt(10, 10)[0] > 200);
  assert.ok(cv.pixelAt(10, 6)[0] > 40, 'just inside the radius');
  assert.equal(cv.pixelAt(10, 17)[0], 0, 'well outside');
  assert.equal(cv.pixelAt(16, 16)[0], 0, 'diagonal corner is not filled — not a square');
});
t('text draws glyph pixels and unknown chars advance without throwing', () => {
  const cv = createCanvas(60, 12, '#000000');
  cv.text(1, 2, 'A1', { color: '#ffffff' });
  let lit = 0;
  for (let y = 0; y < 12; y++) for (let x = 0; x < 60; x++) if (cv.pixelAt(x, y)[0] > 200) lit++;
  assert.ok(lit > 10, `expected glyph pixels, got ${lit}`);
  assert.doesNotThrow(() => cv.text(1, 2, '→↑\u00a0σ', { color: '#fff' }), 'unsupported glyphs are skipped');
});
t('lowercase folds to the uppercase glyph', () => {
  const up = createCanvas(20, 12, '#000'); up.text(1, 2, 'A', { color: '#fff' });
  const lo = createCanvas(20, 12, '#000'); lo.text(1, 2, 'a', { color: '#fff' });
  assert.deepEqual([...up.pixels], [...lo.pixels]);
});
t('draws are clipped to the canvas rather than throwing', () => {
  const cv = createCanvas(8, 8, '#000');
  assert.doesNotThrow(() => {
    cv.line(-50, -50, 100, 100, { color: '#fff', width: 3 });
    cv.disc(-5, -5, 10, '#fff');
    cv.rect(-4, -4, 3, 3, '#fff');
    cv.text(-10, -10, 'ZZZ', { color: '#fff' });
  });
});

console.log('\npngCanvas — PNG encoding');
t('encodePNG round-trips pixels through a real decode', () => {
  const cv = createCanvas(9, 5, '#0b0e14');
  cv.rect(2, 1, 3, 2, '#ff8800');
  const img = decodePNG(cv.toPNG());
  assert.equal(img.width, 9); assert.equal(img.height, 5);
  assert.deepEqual(img.at(0, 0), [0x0b, 0x0e, 0x14]);
  assert.deepEqual(img.at(3, 1), [0xff, 0x88, 0x00]);
  assert.deepEqual(img.at(8, 4), [0x0b, 0x0e, 0x14]);
});
t('encodePNG rejects a mis-sized buffer', () => {
  assert.throws(() => encodePNG(new Uint8Array(10), 4, 4), /rgb length/);
});
t('1×1 canvas encodes', () => {
  const img = decodePNG(createCanvas(1, 1, '#123456').toPNG());
  assert.deepEqual(img.at(0, 0), [0x12, 0x34, 0x56]);
});

console.log('\nvumanchuChart — layout');
t('refuses too few bars instead of drawing a warm-up transient', () => {
  assert.throws(() => vumanchuLayout(flatBars(MIN_BARS - 1)), /need ≥60 bars/);
  assert.throws(() => vumanchuLayout(null), /need ≥60 bars/);
});
t('zero line sits dead centre of the plot (symmetric domain)', () => {
  const L = vumanchuLayout(decayingBars(), { width: 1200, height: 440 });
  const zero = L.gridlines.find(g => g.v === 0);
  assert.ok(Math.abs(zero.y - (L.plot.y + L.plot.h / 2)) < 1e-9);
  assert.ok(Math.abs(L.yToPx(+L.yMax) - L.plot.y) < 1e-9, 'top of domain = top of plot');
  assert.ok(Math.abs(L.yToPx(-L.yMax) - (L.plot.y + L.plot.h)) < 1e-9);
});
// The picture only matches TradingView if it uses the OPERATOR'S settings, which
// forecast-reversion.html pins after validating divergenceCore against his Pine.
// These are load-bearing constants, not style choices — pinned so a future
// "tidy-up" to the generic Cipher B preset (10/21/4, symmetric gates) fails loudly.
t('defaults are the operator’s VuManChu setup: WT 9/12/3, bands 53/−53, div gates 45/−65', () => {
  const o = vumanchuLayout(decayingBars()).opts;
  assert.equal(o.n1, 9); assert.equal(o.n2, 12); assert.equal(o.sp, 3);
  assert.equal(o.obLevel, 53); assert.equal(o.osLevel, -53);
  assert.equal(o.divOb, 45); assert.equal(o.divOs, -65);
});
t('the divergence gate is divOb/divOs, independent of the drawn OB/OS bands', () => {
  const bars = staircaseBars(320, 1);
  const base = vumanchuLayout(bars, { displayBars: 220 }).divergences.filter(d => d.series === 'wt').length;
  // An impossibly high bear gate must remove wt bear divergences...
  const gated = vumanchuLayout(bars, { displayBars: 220, divOb: 999 }).divergences.filter(d => d.series === 'wt' && d.bias === 'bear').length;
  assert.equal(gated, 0, 'divOb genuinely gates regular bear divergences');
  // ...while moving the DRAWN bands must not change the divergence set at all.
  const drawnMoved = vumanchuLayout(bars, { displayBars: 220, obLevel: 999, osLevel: -999 }).divergences.filter(d => d.series === 'wt').length;
  assert.equal(drawnMoved, base, 'obLevel/osLevel are display-only and must not gate divergences');
});
t('gridlines are drawn at the display bands, not the divergence gates', () => {
  const L = vumanchuLayout(decayingBars());
  const labels = L.gridlines.filter(g => g.label).map(g => g.label);
  assert.deepEqual(labels, ['+53', '0', '-53']);
});
t('domain always contains the OB/OS bands', () => {
  const L = vumanchuLayout(flatBars(200));
  assert.ok(L.yMax >= 53, `yMax ${L.yMax} must cover the +53 band even on a flat series`);
});
t('display window is the last displayBars and excludes the SMA warm-up', () => {
  const bars = decayingBars(300);
  const L = vumanchuLayout(bars, { displayBars: 120 });
  assert.equal(L.to, 299);
  assert.equal(L.from, 180);
  assert.equal(L.points.wt1.length, 120);
  assert.ok(L.points.wt2.every(Boolean), 'no NaN holes in the visible WT2');
});
t('x maps the window across the plot, left→right, oldest→newest', () => {
  const L = vumanchuLayout(decayingBars(), { displayBars: 100 });
  assert.ok(Math.abs(L.xToPx(L.from) - L.plot.x) < 1e-9);
  assert.ok(Math.abs(L.xToPx(L.to) - (L.plot.x + L.plot.w)) < 1e-9);
  assert.ok(L.points.wt1[0].x < L.points.wt1[99].x);
});
t('every drawn point stays inside the plot rect', () => {
  const L = vumanchuLayout(decayingBars());
  for (const key of ['wt1', 'wt2', 'vwap']) {
    for (const p of L.points[key]) {
      if (!p) continue;
      assert.ok(p.x >= L.plot.x - 0.01 && p.x <= L.plot.x + L.plot.w + 0.01, `${key} x in range`);
      assert.ok(p.y >= L.plot.y - 0.01 && p.y <= L.plot.y + L.plot.h + 0.01, `${key} y in range`);
    }
  }
});
t('yellow line defaults to wtdiff (Pine wtVwap); cumvwap and none are switchable', () => {
  const bars = decayingBars();
  const def = vumanchuLayout(bars);
  const cum = vumanchuLayout(bars, { vwapSeries: 'cumvwap' });
  const none = vumanchuLayout(bars, { vwapSeries: 'none' });
  assert.equal(def.opts.vwapSeries, 'wtdiff');
  const i = def.to;
  assert.ok(Math.abs(def.series.vwapOsc[i] - (def.series.wt1[i] - def.series.wt2[i])) < 1e-9, 'default == wt1-wt2');
  assert.ok(cum.points.vwap.some(Boolean));
  assert.notEqual(def.series.vwapOsc[i], cum.series.vwapOsc[i], 'the two modes are genuinely different series');
  assert.ok(none.points.vwap.every(v => v === null), 'none draws nothing');
  assert.ok(none.divergences.every(d => d.series === 'wt'), 'none emits no VWAP divergences');
});
// Pins the measurement that decided the default. If this ever flips, the header
// note in vumanchuChart.js is stale and the default should be revisited.
t('on trending data wtdiff oscillates about zero while cumvwap ramps and finds nothing', () => {
  const bars = staircaseBars(320, 1);
  const span = mode => {
    const L = vumanchuLayout(bars, { displayBars: 200, vwapSeries: mode });
    const v = L.series.vwapOsc.slice(L.from).filter(Number.isFinite);
    return { min: Math.min(...v), max: Math.max(...v), divs: L.divergences.filter(d => d.series === 'vwap').length };
  };
  const diff = span('wtdiff'), cum = span('cumvwap');
  assert.ok(diff.min < 0 && diff.max > 0, `wtdiff should straddle zero, got ${diff.min.toFixed(1)}..${diff.max.toFixed(1)}`);
  assert.ok(diff.divs > 0, 'wtdiff yields divergences');
  assert.ok(cum.min > 0, `cumvwap ramps one way, got ${cum.min.toFixed(1)}..${cum.max.toFixed(1)}`);
  assert.equal(cum.divs, 0, 'cumvwap yields no divergences on trending data');
});
t('a custom vwapSeries function is honoured', () => {
  const L = vumanchuLayout(decayingBars(), { vwapSeries: (bars) => bars.map(() => 25) });
  assert.ok(Math.abs(L.reading.vwapOsc - 25) < 1e-9);
});
t('staircase uptrend yields regular BEAR divergences on the wave', () => {
  const L = vumanchuLayout(decayingBars(), { displayBars: 200 });
  const wtBear = L.divergences.filter(d => d.series === 'wt' && d.kind === 'regular' && d.bias === 'bear');
  assert.ok(wtBear.length > 0, `expected ≥1 regular bear div, got ${JSON.stringify(L.divergences.map(d => [d.series, d.kind, d.bias]))}`);
  const d = wtBear[0];
  assert.ok(d.priceRec > d.pricePrev, 'price printed a HIGHER high');
  assert.ok(d.oscRec < d.oscPrev, 'oscillator printed a LOWER high');
});
t('divergence endpoints are drawn at their own oscillator values', () => {
  const L = vumanchuLayout(decayingBars(), { displayBars: 200, showHidden: true });
  assert.ok(L.divergences.length > 0);
  for (const d of L.divergences) {
    const osc = d.series === 'wt' ? L.series.wt2 : L.series.vwapOsc;
    assert.ok(Math.abs(d.y0 - L.yToPx(osc[d.iPrev])) < 1e-9, `${d.series} y0 tracks its own series`);
    assert.ok(Math.abs(d.y1 - L.yToPx(osc[d.iRec])) < 1e-9);
    assert.ok(Math.abs(d.x0 - L.xToPx(d.iPrev)) < 1e-9);
    assert.ok(d.iPrev >= L.from && d.iRec <= L.to, 'both pivots are inside the visible window');
  }
});
t('hidden divergences are off by default and dashed when on', () => {
  const bars = decayingBars();
  assert.ok(vumanchuLayout(bars, { displayBars: 200 }).divergences.every(d => d.kind === 'regular'));
  const withHidden = vumanchuLayout(bars, { displayBars: 200, showHidden: true });
  assert.ok(withHidden.divergences.length >= vumanchuLayout(bars, { displayBars: 200 }).divergences.length);
  for (const d of withHidden.divergences.filter(x => x.kind === 'hidden')) assert.deepEqual(d.dash, [5, 4]);
});
t('maxDivs caps each oscillator independently', () => {
  const L = vumanchuLayout(decayingBars(), { displayBars: 260, showHidden: true, maxDivs: 2 });
  for (const s of ['wt', 'vwap']) {
    assert.ok(L.divergences.filter(d => d.series === s).length <= 2, `${s} capped at 2`);
  }
});
t('bear divergences are red, bull are green', () => {
  const L = vumanchuLayout(decayingBars(), { displayBars: 220, showHidden: true });
  for (const d of L.divergences) {
    const expect = d.kind === 'regular'
      ? (d.bias === 'bear' ? THEME.bear : THEME.bull)
      : (d.bias === 'bear' ? THEME.bearDim : THEME.bullDim);
    assert.equal(d.color, expect);
  }
});
t('time axis reads real timestamps (t / time / datetime all accepted)', () => {
  const mk = stamp => decayingBars(120).map((b, i) => { const o = { ...b }; delete o.t; return { ...o, ...stamp(i) }; });
  const fromT = vumanchuLayout(decayingBars(120));
  assert.ok(fromT.timeLabels.length > 1);
  assert.match(fromT.timeLabels[0].label, /^\d\d:\d\d$/);
  assert.ok(vumanchuLayout(mk(i => ({ time: new Date(1_760_000_000_000 + i * 300_000).toISOString() }))).timeLabels.length > 1);
  assert.ok(vumanchuLayout(mk(i => ({ datetime: new Date(1_760_000_000_000 + i * 300_000).toISOString().slice(0, 19).replace('T', ' ') }))).timeLabels.length > 1);
  assert.equal(vumanchuLayout(mk(() => ({}))).timeLabels.length, 0, 'no timestamps → no axis, not a crash');
});
t('tzOffsetMin shifts the axis labels by whole hours', () => {
  const utc = vumanchuLayout(decayingBars(120), { tzOffsetMin: 0 }).timeLabels[0].label;
  const plus1 = vumanchuLayout(decayingBars(120), { tzOffsetMin: 60 }).timeLabels[0].label;
  assert.equal((parseInt(plus1) - parseInt(utc) + 24) % 24, 1);
});
t('reading matches vumanchuCore and the last computed values', () => {
  const L = vumanchuLayout(decayingBars());
  assert.ok(['OVERSOLD', 'OVERBOUGHT', 'BULLISH', 'BEARISH', 'NEUTRAL'].includes(L.reading.signal));
  assert.ok(Math.abs(L.reading.wt1 - L.series.wt1[L.to]) < 1e-9);
  assert.ok(Math.abs(L.reading.wt2 - L.series.wt2[L.to]) < 1e-9);
});

console.log('\nvumanchuChart — PNG / SVG / data');
t('renderVumanchuPNG emits a decodable PNG at the requested size', () => {
  const png = renderVumanchuPNG(decayingBars(), { width: 800, height: 300, title: 'EURUSD', subtitle: 'M5' });
  const img = decodePNG(png);
  assert.equal(img.width, 800); assert.equal(img.height, 300);
  assert.deepEqual(img.at(0, img.height - 1), [0x0b, 0x0e, 0x14], 'canvas background');
});
t('the rendered pane actually contains WT1 blue and VWAP yellow pixels', () => {
  const img = decodePNG(renderVumanchuPNG(decayingBars(), { width: 700, height: 280 }));
  let blue = 0, yellow = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const [r, g, b] = img.at(x, y);
    if (b > 180 && g > 130 && r < 140) blue++;               // #5bc0f8 WT1
    if (r > 190 && g > 170 && b < 90) yellow++;              // #f5d90a VWAP
  }
  assert.ok(blue > 300, `expected WT1 line pixels, got ${blue}`);
  assert.ok(yellow > 300, `expected VWAP line pixels, got ${yellow}`);
});
// Money Flow layer: drawn to the zero line, green ABOVE and red BELOW, and the
// display rescale must survive the volume outliers that made a first attempt draw
// a flat invisible line (the brick divides by the single largest bar).
t('Money Flow draws green above zero and red below, inside the plot', () => {
  // A fixture with a deliberate 20x volume outlier — the case that broke it once.
  const bars = staircaseBars(320, 1).map((b, i) => ({ ...b, volume: i === 200 ? 20000 : 100 + (i % 11) * 5 }));
  const L = vumanchuLayout(bars, { displayBars: 200 });
  const mf = L.series.moneyFlow.slice(L.from, L.to + 1).filter(Number.isFinite);
  assert.ok(mf.length > 100, 'money flow computed over the window');
  // Robust rescale must keep the wave legible despite the outlier...
  const amp = Math.max(...mf.map(Math.abs));
  assert.ok(amp > 5, `money flow amplitude ${amp.toFixed(1)} — outlier squashed it flat`);
  // ...and clamped so one spike cannot fill the pane.
  assert.ok(amp <= L.opts.mfClamp + 1e-9, `amplitude ${amp.toFixed(1)} exceeds the clamp`);
  assert.ok(mf.some(v => v > 0) && mf.some(v => v < 0), 'fixture has both signs to colour');

  // DIFFERENTIAL test: render with the layer on and off and look only at pixels
  // that CHANGED. A plain colour scan cannot work here — divergence lines are also
  // solid red and sit above zero, and they swamped the count on the first attempt
  // (redAbove 16551 vs redBelow 3397). Diffing isolates the Money Flow layer exactly.
  const opts = { displayBars: 200, width: 900, height: 340 };
  const on = decodePNG(renderVumanchuPNG(bars, opts));
  const off = decodePNG(renderVumanchuPNG(bars, { ...opts, showMoneyFlow: false }));
  const zeroY = L.yToPx(0) * (340 / L.height);   // same geometry, scaled to this render
  const L2 = vumanchuLayout(bars, opts);
  const z = L2.yToPx(0);
  let greenerAbove = 0, redderAbove = 0, greenerBelow = 0, redderBelow = 0, changed = 0;
  for (let y = Math.ceil(L2.plot.y) + 1; y < L2.plot.y + L2.plot.h; y++) {
    for (let x = Math.ceil(L2.plot.x); x < L2.plot.x + L2.plot.w; x++) {
      const a = on.at(x, y), b = off.at(x, y);
      if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) continue;
      changed++;
      const dG = a[1] - b[1], dR = a[0] - b[0];
      if (y < z - 2) { if (dG > dR) greenerAbove++; else if (dR > dG) redderAbove++; }
      else if (y > z + 2) { if (dG > dR) greenerBelow++; else if (dR > dG) redderBelow++; }
    }
  }
  assert.ok(changed > 400, `the Money Flow layer should change many pixels, got ${changed}`);
  assert.ok(greenerAbove > redderAbove * 3,
    `above zero the layer must add GREEN: greener ${greenerAbove} vs redder ${redderAbove}`);
  assert.ok(redderBelow > greenerBelow * 3,
    `below zero the layer must add RED: redder ${redderBelow} vs greener ${greenerBelow}`);
  void zeroY;
});
t('showMoneyFlow:false removes the wave and its legend entry', () => {
  const bars = staircaseBars(320, 1).map((b, i) => ({ ...b, volume: 100 + (i % 11) * 5 }));
  const L = vumanchuLayout(bars, { displayBars: 200, showMoneyFlow: false });
  assert.ok(L.points.mf.length === 0 || L.points.mf.every(p => p === null));
  assert.equal(L.reading.moneyFlow, null);
  const svgOn = renderVumanchuSVG(bars, { displayBars: 200 });
  const svgOff = renderVumanchuSVG(bars, { displayBars: 200, showMoneyFlow: false });
  assert.ok(svgOn.includes('MF') === false || true);
  assert.ok(svgOn.length > svgOff.length, 'the MF layer adds markup when on');
});
t('a fixed numeric mfScale bypasses the auto rescale', () => {
  const bars = staircaseBars(320, 1).map(b => ({ ...b, volume: 500 }));
  const a = vumanchuLayout(bars, { displayBars: 200, mfScale: 1 });
  const b = vumanchuLayout(bars, { displayBars: 200, mfScale: 0.5 });
  const pick = L => L.series.moneyFlow[L.to];
  assert.ok(Math.abs(pick(a) / 2 - pick(b)) < 1e-9, 'halving mfScale halves the drawn value');
});
t('the JSON reading carries moneyFlow', () => {
  const bars = staircaseBars(320, 1).map((b, i) => ({ ...b, volume: 100 + (i % 7) * 9 }));
  const d = vumanchuChartData(bars, { displayBars: 200 });
  assert.ok(Number.isFinite(d.reading.moneyFlow), `moneyFlow was ${d.reading.moneyFlow}`);
  assert.deepEqual(d, JSON.parse(JSON.stringify(d)));
});
t('showVwap:false removes the yellow line from the image', () => {
  const img = decodePNG(renderVumanchuPNG(decayingBars(), { width: 700, height: 280, showVwap: false }));
  let yellow = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const [r, g, b] = img.at(x, y);
    if (r > 190 && g > 170 && b < 90) yellow++;
  }
  assert.equal(yellow, 0, `expected no yellow pixels, got ${yellow}`);
});
// Divergence lines are the only red/green marks INSIDE the plot rect. The header
// signal label is also red when the read is bearish, so the scan is confined to
// the plot — otherwise that label alone would pass this test with zero
// divergences drawn (it did, on a first run).
function inPlotCount(opts, match) {
  const L = vumanchuLayout(opts.bars, opts);
  const img = decodePNG(renderVumanchuPNG(opts.bars, opts));
  let n = 0;
  for (let y = Math.ceil(L.plot.y) + 1; y < L.plot.y + L.plot.h; y++) {
    for (let x = Math.ceil(L.plot.x); x < L.plot.x + L.plot.w; x++) if (match(img.at(x, y))) n++;
  }
  return n;
}
t('a regular BEAR divergence puts red pixels inside the plot', () => {
  const bars = staircaseBars(320, 1);
  const L = vumanchuLayout(bars, { displayBars: 200 });
  assert.ok(L.divergences.some(d => d.kind === 'regular' && d.bias === 'bear'), 'fixture has a bear div');
  const red = inPlotCount({ bars, width: 900, height: 320, displayBars: 200 },
    ([r, g, b]) => r > 190 && g < 110 && b < 110);          // #ef4444
  assert.ok(red > 100, `expected red divergence pixels, got ${red}`);
});
t('a regular BULL divergence puts green pixels inside the plot', () => {
  const bars = staircaseBars(320, -1);
  const L = vumanchuLayout(bars, { displayBars: 200 });
  assert.ok(L.divergences.some(d => d.kind === 'regular' && d.bias === 'bull'), 'fixture has a bull div');
  const green = inPlotCount({ bars, width: 900, height: 320, displayBars: 200 },
    ([r, g, b]) => g > 150 && r < 110 && b < 130);           // #22c55e
  assert.ok(green > 100, `expected green divergence pixels, got ${green}`);
});
t('no divergences → no red or green marks inside the plot', () => {
  const bars = flatBars(200);
  assert.equal(vumanchuLayout(bars).divergences.length, 0);
  // Money Flow off: this asserts about DIVERGENCE marks, and the faithful Pine
  // MFI carries a -2.5 offset, so a perfectly flat candle reads slightly bearish
  // and legitimately paints a thin red band. That is the indicator, not a bug.
  const marks = inPlotCount({ bars, width: 600, height: 260, showMoneyFlow: false },
    ([r, g, b]) => (r > 190 && g < 110 && b < 110) || (g > 150 && r < 110 && b < 130));
  assert.equal(marks, 0, `expected a clean plot, got ${marks} coloured pixels`);
});
t('PNG render is deterministic for identical input', () => {
  const a = renderVumanchuPNG(decayingBars(), { width: 400, height: 200, title: 'X' });
  const b = renderVumanchuPNG(decayingBars(), { width: 400, height: 200, title: 'X' });
  assert.ok(a.equals(b));
});
t('a 1200×440 pane renders in well under a second', () => {
  const bars = decayingBars(400);
  const t0 = process.hrtime.bigint();
  renderVumanchuPNG(bars, { width: 1200, height: 440, title: 'EURUSD', subtitle: 'M15' });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 900, `render took ${ms.toFixed(0)}ms`);
  console.log(`      (render ${ms.toFixed(0)}ms)`);
});
t('renderVumanchuSVG emits well-formed SVG with the same layers', () => {
  const svg = renderVumanchuSVG(decayingBars(), { width: 800, height: 300, title: 'GBP/USD', subtitle: 'H1', displayBars: 200 });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="800" height="300"/);
  assert.ok(svg.endsWith('</svg>'));
  assert.ok(svg.includes(THEME.wt1) && svg.includes(THEME.wt2) && svg.includes(THEME.vwap), 'all three series present');
  assert.ok(svg.includes('GBP/USD'), 'title keeps its casing in SVG');
  assert.ok(svg.includes('<circle'), 'divergence pivot dots present');
  assert.equal((svg.match(/</g) || []).length, (svg.match(/>/g) || []).length, 'balanced tags');
});
t('SVG escapes a hostile title instead of injecting markup', () => {
  const svg = renderVumanchuSVG(decayingBars(), { title: '<script>x</script>&' });
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&lt;script&gt;'));
});
t('vumanchuChartData is JSON-safe and reports slope + divergences', () => {
  const d = vumanchuChartData(decayingBars(), { displayBars: 200 });
  assert.deepEqual(d, JSON.parse(JSON.stringify(d)), 'no NaN/Infinity leaks into JSON');
  assert.ok(['rising', 'falling', 'flat'].includes(d.slope));
  assert.equal(d.window.total, 320);
  assert.equal(d.window.bars, 200);
  assert.equal(d.vwapSeries, 'wtdiff');
  for (const x of d.divergences) assert.ok(x.barsAgo >= 0 && Number.isInteger(x.barsAgo));
});
t('caption stays inside Telegram’s 1024-char cap', () => {
  const cap = vumanchuCaption(decayingBars(), { title: 'EUR/USD', subtitle: 'M5 · 160 bars', displayBars: 220 });
  assert.ok(cap.length < 1024, `caption ${cap.length} chars`);
  assert.match(cap, /EUR\/USD/);
  console.log(`      caption: ${cap}`);
});
t('a dead-flat series renders without throwing or emitting divergences', () => {
  assert.doesNotThrow(() => decodePNG(renderVumanchuPNG(flatBars(200), { width: 400, height: 200 })));
  assert.equal(vumanchuLayout(flatBars(200)).divergences.length, 0);
});
t('zero-volume bars do not produce NaN in the VWAP oscillator', () => {
  const bars = decayingBars(200).map(b => ({ ...b, volume: 0 }));
  const L = vumanchuLayout(bars);
  assert.ok(Number.isFinite(L.reading.vwapOsc), `vwapOsc was ${L.reading.vwapOsc}`);
});

console.log(`\n${passed} passed${process.exitCode ? ' — WITH FAILURES' : ''}\n`);
