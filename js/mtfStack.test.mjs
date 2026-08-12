/**
 * Unit tests for js/mtfStack.js — N-timeframe directional agreement.
 * Pure/synthetic. `node js/mtfStack.test.mjs`
 *
 * The important ones:
 *   • the DEGENERACY measurement is pinned as a test, not just a comment — a true
 *     VWAP is timeframe-invariant, so a stack over `vwap_dist` must agree ~always
 *     while `vwap_slope` / `wt_hist` genuinely differ per timeframe
 *   • rows are fast→slow and every non-fastest row is step-held causally
 *   • the score/agreement is measured over the visible window only
 */
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {
  SERIES_SOURCES, buildMtfStack, renderMtfStackPNG, mtfStackData, mtfStackCaption,
  MIN_BARS, MAX_TFS, STACK_THEME,
} from './mtfStack.js';

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}
function decodePNG(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  let off = 8, width = 0, height = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); }
    else if (type === 'IDAT') idat.push(data);
    off += 12 + len; if (type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = width * 3, rgb = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) raw.copy(rgb, y * stride, y * (1 + stride) + 1, y * (1 + stride) + 1 + stride);
  return { width, height, at: (x, y) => [...rgb.subarray((y * width + x) * 3, (y * width + x) * 3 + 3)] };
}

// ── Fixtures: one M1 path, aggregated up. Two UTC days so the session anchor
// actually resets and that code path is exercised.
const T0 = Math.floor(Date.UTC(2025, 9, 20, 0, 0, 0) / 1000);
function m1Path(n = 2880, shape) {
  const f = shape || (j => 1.15 + 0.00002 * j + 0.004 * Math.sin(j / 420) + 0.0015 * Math.sin(j / 95) + 0.0006 * Math.sin(j / 23));
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = f(i), c = f(i + 1);
    out.push({ open: o, close: c, high: Math.max(o, c) * 1.0002, low: Math.min(o, c) * 0.9998,
      volume: 80 + 60 * Math.abs(Math.sin(i / 37)), t: T0 + i * 60 });
  }
  return out;
}
const agg = (bars, k) => {
  const out = [];
  for (let i = 0; i + k <= bars.length; i += k) {
    const g = bars.slice(i, i + k);
    out.push({ open: g[0].open, close: g.at(-1).close, high: Math.max(...g.map(b => b.high)),
      low: Math.min(...g.map(b => b.low)), volume: g.reduce((s, b) => s + b.volume, 0), t: g[0].t });
  }
  return out;
};
function stack(tfs = { M1: 1, M3: 3, M5: 5, M15: 15 }, n = 2880, shape) {
  const m1 = m1Path(n, shape), by = {};
  for (const [tf, k] of Object.entries(tfs)) by[tf] = k === 1 ? m1 : agg(m1, k);
  return by;
}

console.log('\nseries registry');
t('every source declares tfDependent and a note', () => {
  for (const [k, s] of Object.entries(SERIES_SOURCES)) {
    assert.equal(typeof s.tfDependent, 'boolean', `${k}.tfDependent`);
    assert.ok(s.note && s.note.length > 20, `${k}.note`);
    assert.equal(typeof s.compute, 'function');
    assert.ok(s.label);
  }
});
t('cumulative VWAP series are marked degenerate; rolling ones are not', () => {
  assert.equal(SERIES_SOURCES.vwap_cum_dist.tfDependent, false);
  assert.equal(SERIES_SOURCES.vwap_cum_slope.tfDependent, false);
  assert.equal(SERIES_SOURCES.vwap_roll_dist.tfDependent, true);
  assert.equal(SERIES_SOURCES.vwap_roll_slope.tfDependent, true);
  assert.equal(SERIES_SOURCES.wt_hist.tfDependent, true);
});

console.log('\nDEGENERACY — the measurement, pinned');
t('a true VWAP is timeframe-invariant: vwap_dist agrees almost always', () => {
  const by = stack();
  const S = buildMtfStack(by, { source: 'vwap_cum_dist', displayBars: 400 });
  assert.ok(S.agreement.unanimousPct > 92,
    `price-vs-VWAP should agree across timeframes as arithmetic, got ${S.agreement.unanimousPct?.toFixed(1)}%`);
  assert.ok(S.degenerate, 'and the result must SAY it is degenerate');
  assert.match(S.degenerate, /arithmetic/);
  console.log(`      vwap_cum_dist all-agree ${S.agreement.unanimousPct.toFixed(1)}% (base ${S.agreement.baselinePct?.toFixed(1)}%) — degenerate flagged`);
});
t('rolling-VWAP and WaveTrend series genuinely differ per timeframe', () => {
  const by = stack();
  for (const source of ['vwap_roll_dist', 'vwap_roll_slope', 'wt_hist']) {
    const S = buildMtfStack(by, { source, displayBars: 400 });
    assert.equal(S.degenerate, null, `${source} must not be flagged degenerate`);
    // The rows must carry more than one opinion. NOT "all pairwise distinct":
    // `vwap_roll_slope`'s sign barely flips on slow timeframes (measured 0 flips
    // on M15 over one fixture), so two slow rows legitimately coincide over a
    // window while the stack as a whole still disagrees plenty.
    const sigs = S.rows.map(r => r.dir.slice(S.from, S.to + 1).join(''));
    const distinct = new Set(sigs).size;
    assert.ok(distinct >= 2, `${source}: all ${sigs.length} rows identical — no timeframe dependence at all`);
    assert.ok(S.agreement.unanimousPct < 95, `${source} all-agree ${S.agreement.unanimousPct?.toFixed(1)}% should leave real disagreement`);
    console.log(`      ${source.padEnd(15)} all-agree ${S.agreement.unanimousPct.toFixed(1)}% vs base ${S.agreement.baselinePct?.toFixed(1)}% (delta ${S.agreement.delta >= 0 ? '+' : ''}${S.agreement.delta?.toFixed(1)}pp) · ${distinct}/${sigs.length} distinct rows`);
  }
});

console.log('\nstructure');
t('rows are ordered fast→slow regardless of input key order', () => {
  const by = stack({ M15: 15, M1: 1, M5: 5, M3: 3 });
  const S = buildMtfStack(by, { source: 'wt_hist' });
  assert.deepEqual(S.tfs, ['M1', 'M3', 'M5', 'M15']);
  assert.equal(S.fastTf, 'M1');
  assert.deepEqual(S.rows.map(r => r.tf), ['M1', 'M3', 'M5', 'M15']);
  for (let i = 1; i < S.rows.length; i++) assert.ok(S.rows[i].sec > S.rows[i - 1].sec);
});
t('every row is aligned to the FAST grid length', () => {
  const by = stack();
  const S = buildMtfStack(by, { source: 'wt_hist' });
  for (const r of S.rows) assert.equal(r.values.length, by.M1.length, `${r.tf} aligned to M1 length`);
});
t('slower rows are step-held: fewer distinct values than bars', () => {
  const by = stack();
  const S = buildMtfStack(by, { source: 'wt_hist', displayBars: 300 });
  const distinct = r => new Set(r.values.slice(S.from, S.to + 1).map(v => Number.isFinite(v) ? v.toFixed(8) : 'x')).size;
  assert.ok(distinct(S.rows[0]) > 250, 'M1 row moves every bar');
  assert.ok(distinct(S.rows[3]) < 40, `M15 row should hold (~20 steps in 300 M1 bars), got ${distinct(S.rows[3])}`);
  assert.ok(distinct(S.rows[1]) > distinct(S.rows[2]), 'M3 steps more often than M5');
});
t('CAUSALITY: truncating the data cannot change earlier rows', () => {
  const full = buildMtfStack(stack(), { source: 'wt_hist', displayBars: 400 });
  const cutM1 = 1800;
  const by = stack(), sliced = {};
  for (const tf of Object.keys(by)) sliced[tf] = by[tf].filter(b => b.t <= by.M1[cutM1 - 1].t);
  const part = buildMtfStack(sliced, { source: 'wt_hist', displayBars: 400 });
  for (const r of part.rows) {
    const f = full.rows.find(x => x.tf === r.tf);
    for (let i = 0; i < 1500; i++) assert.equal(r.dir[i], f.dir[i], `${r.tf} bar ${i} changed when future was removed`);
  }
});

console.log('\nscore + agreement');
t('alignmentScore is the mean direction sign and lands in [-1,1]', () => {
  const S = buildMtfStack(stack(), { source: 'wt_hist', displayBars: 300 });
  for (const v of S.score) { if (v == null) continue; assert.ok(v >= -1 && v <= 1, `score ${v}`); }
  const last = S.reading.alignmentScore;
  if (last != null) {
    const dirs = S.rows.map(r => r.dir[S.to]).filter(d => d !== 0);
    assert.ok(Math.abs(last - dirs.reduce((a, b) => a + b, 0) / dirs.length) < 1e-9);
    assert.equal(S.reading.unanimous, Math.abs(last) === 1);
  }
});
t('unanimous flags only when every comparable timeframe matches', () => {
  const S = buildMtfStack(stack(), { source: 'wt_hist', displayBars: 300 });
  for (let k = 0; k < S.nVis; k++) {
    const i = S.from + k;
    const dirs = S.rows.map(r => r.dir[i]).filter(d => d !== 0);
    if (dirs.length < 2) { assert.equal(S.unanimous[k], null); continue; }
    assert.equal(S.unanimous[k], new Set(dirs).size === 1, `bar ${i}`);
  }
});
t('agreement is measured over the VISIBLE window only', () => {
  const by = stack();
  for (const bars of [120, 300, 600]) {
    const d = mtfStackData(by, { source: 'wt_hist', displayBars: bars });
    assert.equal(d.window.bars, bars);
    assert.ok(d.agreement.comparableBars <= d.window.bars,
      `comparableBars ${d.agreement.comparableBars} > window ${bars}`);
  }
  const a = mtfStackData(by, { source: 'wt_hist', displayBars: 120 }).agreement.unanimousPct;
  const b = mtfStackData(by, { source: 'wt_hist', displayBars: 600 }).agreement.unanimousPct;
  assert.notEqual(a, b, 'different windows must give different readings');
});
t('the baseline is present and deterministic', () => {
  const by = stack();
  const a = buildMtfStack(by, { source: 'wt_hist' }).agreement;
  const b = buildMtfStack(by, { source: 'wt_hist' }).agreement;
  assert.ok(a.baselinePct > 0 && a.baselinePct <= 100);
  assert.equal(a.baselinePct, b.baselinePct, 'no RNG');
  assert.ok(a.baselineShifts > 5);
});
t('a two-timeframe stack still works (minimum case)', () => {
  const S = buildMtfStack(stack({ M1: 1, M5: 5 }), { source: 'wt_hist' });
  assert.equal(S.rows.length, 2);
  assert.ok(S.agreement.unanimousPct != null);
});

console.log('\nguards');
t('rejects <2 or >MAX_TFS timeframes, thin history, unknown series, dup periods', () => {
  assert.throws(() => buildMtfStack({ M1: m1Path(200) }), /at least 2 timeframes/);
  const many = {}; for (const [tf, k] of Object.entries({ M1:1, M2:2, M3:3, M4:4, M5:5, M10:10, M15:15 })) many[tf] = k === 1 ? m1Path(2880) : agg(m1Path(2880), k);
  assert.throws(() => buildMtfStack(many), new RegExp(`at most ${MAX_TFS}`));
  assert.throws(() => buildMtfStack({ M1: m1Path(2880), M5: agg(m1Path(150), 5) }), /needs ≥/);   // 30 bars < MIN_BARS
  assert.throws(() => buildMtfStack(stack({ M1: 1, M5: 5 }), { source: 'nope' }), /unknown series/);
});
t('vwap_cum_slope does not compute a slope across the session anchor reset', () => {
  const m1 = m1Path(2880);           // spans two UTC days
  const s = SERIES_SOURCES.vwap_cum_slope.compute(m1, { slopeBars: 1 });
  const dayOf = b => Math.floor(b.t / 86400);
  let checked = 0;
  for (let i = 1; i < m1.length; i++) {
    if (dayOf(m1[i]) !== dayOf(m1[i - 1])) { assert.ok(!Number.isFinite(s[i]), `bar ${i} straddles the reset`); checked++; }
  }
  assert.ok(checked > 0, 'fixture really does cross a day boundary');
});

console.log('\nrender');
t('PNG decodes at the requested size', () => {
  const img = decodePNG(renderMtfStackPNG(stack(), { source: 'wt_hist', width: 1000, height: 500, title: 'EUR/USD' }));
  assert.equal(img.width, 1000); assert.equal(img.height, 500);
});
t('one ribbon row per timeframe is painted green/red', () => {
  const by = stack();
  const img = decodePNG(renderMtfStackPNG(by, { source: 'wt_hist', width: 900, height: 500 }));
  let up = 0, dn = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const [r, g, b] = img.at(x, y);
    if (g > 150 && r < 110 && b < 130) up++;
    if (r > 190 && g < 110 && b < 110) dn++;
  }
  assert.ok(up > 1500, `expected substantial up-ribbon area, got ${up}`);
  assert.ok(dn > 1500, `expected substantial down-ribbon area, got ${dn}`);
});
t('the degenerate warning is drawn on the image for a degenerate series', () => {
  const px = (source) => {
    const img = decodePNG(renderMtfStackPNG(stack(), { source, width: 900, height: 500 }));
    let red = 0;
    for (let y = img.height - 12; y < img.height; y++) for (let x = 0; x < 500; x++) {
      const [r, g, b] = img.at(x, y);
      if (r > 190 && g < 110 && b < 110) red++;
    }
    return red;
  };
  assert.ok(px('vwap_cum_dist') > 40, 'degenerate series must carry a visible warning');
  assert.equal(px('wt_hist'), 0, 'a sound series must not');
});
t('render is deterministic and reasonably quick', () => {
  const by = stack();
  const t0 = process.hrtime.bigint();
  const a = renderMtfStackPNG(by, { source: 'wt_hist', width: 1200, height: 520 });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const b = renderMtfStackPNG(by, { source: 'wt_hist', width: 1200, height: 520 });
  assert.ok(a.equals(b));
  assert.ok(ms < 1500, `took ${ms.toFixed(0)}ms`);
  console.log(`      (render ${ms.toFixed(0)}ms)`);
});

console.log('\ndata / caption');
t('JSON is serialisable, names the series, and carries both caveats', () => {
  const d = mtfStackData(stack(), { source: 'vwap_roll_dist', displayBars: 300 });
  assert.deepEqual(d, JSON.parse(JSON.stringify(d)));
  assert.deepEqual(d.timeframes, ['M1', 'M3', 'M5', 'M15']);
  assert.equal(d.reading.perTf.length, 4);
  assert.match(d.agreement.note, /read delta/);
  assert.match(d.agreement.note, /not called "confidence"/);
  assert.equal(d.degenerate, null);
});
t('caption fits the 1024 cap and flags a degenerate series', () => {
  const ok = mtfStackCaption(stack(), { source: 'vwap_roll_dist', title: 'EUR/USD' });
  const bad = mtfStackCaption(stack(), { source: 'vwap_cum_dist', title: 'EUR/USD' });
  assert.ok(ok.length < 1024 && bad.length < 1024);
  assert.doesNotMatch(ok, /degenerate/);
  assert.match(bad, /degenerate/);
  console.log(`      ${ok}`);
});

console.log(`\n${passed} passed${process.exitCode ? ' — WITH FAILURES' : ''}\n`);
