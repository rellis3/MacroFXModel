// js/terminal/netCore.test.mjs: the NETWORK maths (layout, links, clusters, script) and that the view registers its module, view and SHOW scene.
import test from 'node:test';
import assert from 'node:assert/strict';
import { forceLayout, layoutFit, pickLinks, clusterTightness, partners, buildNet, netScript, sharesCurrency, rng, returnsOf, scrubSteps, triIx, triAt, toMatrix, makeScan, scanSome, triOf, pairPath, swingPair, biggestChange, dayMoves, relayout, meanShift, stepState, WINDOWS } from './netCore.js';
import { series, matrix } from './corrMath.js';
import { EXTRA, viewsOf } from './jarvisModules.js';
import { SHOW_HOOKS, buildScenes } from './showCore.js';
await import('./jarvisViewNet.js');

// a synthetic panel: two groups driven by two factors, one market anti-correlated with the first factor
function panel(n = 200) {
  const r = rng(11), f1 = Array.from({ length: n }, () => r() - 0.5), f2 = Array.from({ length: n }, () => r() - 0.5), noise = () => (r() - 0.5) * 0.2;
  const mk = fn => { let p = 100; return [p, ...Array.from({ length: n - 1 }, (_, i) => (p *= Math.exp(fn(i) * 0.01)))]; };
  const spec = { NAS100_USD: i => f1[i] + noise(), SPX500_USD: i => f1[i] + noise(), US30_USD: i => f1[i] + noise(), US2000_USD: i => f1[i] + noise(), XAUUSD: i => f2[i] + noise(), XAGUSD: i => f2[i] + noise(), XPTUSD: i => f2[i] + noise(), USDZAR: i => -f1[i] + noise(), EURUSD: i => noise(), GBPUSD: i => noise() };
  const syms = Object.keys(spec), closes = {}; for (const s of syms) closes[s] = mk(spec[s]);
  return { syms, dates: Array.from({ length: n }, (_, i) => `d${i}`), closes };
}

test('the layout is deterministic for a seed and pulls correlated markets together, pushes opposed ones apart', () => {
  const net = buildNet({ ok: true, panel: panel() }), net2 = buildNet({ ok: true, panel: panel() });
  assert.deepEqual(Array.from(net.P), Array.from(net2.P));
  assert.ok(net.fit > 0.8, `layout fit ${net.fit}`);
  const d = (a, b) => { const i = net.ids.indexOf(a), j = net.ids.indexOf(b); return Math.hypot(net.P[i * 3] - net.P[j * 3], net.P[i * 3 + 1] - net.P[j * 3 + 1], net.P[i * 3 + 2] - net.P[j * 3 + 2]); };
  assert.ok(d('NQ', 'SPX500') < d('NQ', 'GOLD'), 'index pair closer than index-metal');
  assert.ok(d('NQ', 'USDZAR') > d('NQ', 'SPX500') * 2, 'anti-correlated pushed far apart');
  assert.notDeepEqual(Array.from(forceLayout(net.m, { seed: 1 })), Array.from(forceLayout(net.m, { seed: 2 })));
});

test('links respect the threshold and the cap; sign and strength are kept', () => {
  const m = [[1, 0.9, -0.6, 0.2], [0.9, 1, 0.1, null], [-0.6, 0.1, 1, 0.55], [0.2, null, 0.55, 1]];
  const l = pickLinks(m, 0.5, 10); assert.deepEqual(l.map(x => [x.a, x.b]), [[0, 1], [0, 2], [2, 3]]); assert.equal(l[1].r, -0.6);
  assert.equal(pickLinks(m, 0.5, 2).length, 2); assert.equal(pickLinks(m, 0.95).length, 0);
});

test('cluster tightness, partners, shared-currency flag', () => {
  const net = buildNet({ ok: true, panel: panel() }), eq = net.tight.find(c => c.id === 'eq');
  assert.ok(eq && eq.mean > 0.9); assert.ok(net.tight[0].mean >= net.tight[1].mean);
  const p = partners(net.ids, net.m, net.ids.indexOf('NQ')); assert.ok(p.pos[0].r > 0.9); assert.equal(p.neg[0].k, 'USDZAR');
  assert.ok(sharesCurrency('EURUSD', 'GBPUSD') && !sharesCurrency('EURJPY', 'GBPCHF') && !sharesCurrency('NQ', 'GOLD'));
  assert.deepEqual(clusterTightness(['NQ'], [[1]]), []);
});

test('fails soft: no panel, a short panel, a bad body', () => {
  assert.equal(buildNet(null), null); assert.equal(buildNet({ ok: false }), null); assert.equal(buildNet({ panel: { syms: ['A'], dates: ['d'], closes: { A: [1] } } }), null);
  assert.equal(netScript(null), null); assert.equal(layoutFit(new Float32Array(3), [[1]]), null);
});

test('the spoken script names the real pairs, states the window, and says it is not a forecast', () => {
  const t = netScript(buildNet({ ok: true, panel: panel() }));
  assert.match(t, /last 60 trading days/); assert.match(t, /tightest pair/); assert.match(t, /most opposed pair/); assert.match(t, /not a forecast/); assert.match(t, /tightly bound group is (metals|equity indices)/);
});

test('registers the NETWORK panel, the net view (accent up, clean chrome) and a SHOW scene after the lean', () => {
  assert.ok(EXTRA.some(m => m.id === 'net' && m.label === 'NETWORK'));
  const v = viewsOf().find(x => x.id === 'net'); assert.ok(v && v.env.accent === 'up' && v.env.chrome === 'clean' && typeof v.draw === 'function');
  const h = SHOW_HOOKS.find(x => x.id === 'net'); assert.ok(h && h.after === 'lean');
  assert.equal(h.build({}, null), null);
  assert.ok(buildScenes({ now: new Date() }).length >= 2);
});

// a panel whose stock-gold correlation flips sign half way (a regime change), so the scrub has something to find
function flipPanel(n = 400) {
  const r = rng(5), f1 = Array.from({ length: n }, () => r() - 0.5), f2 = Array.from({ length: n }, () => r() - 0.5), noise = () => (r() - 0.5) * 0.25;
  const mk = fn => { let p = 100; return [p, ...Array.from({ length: n - 1 }, (_, i) => (p *= Math.exp(fn(i + 1) * 0.01)))]; };
  const gold = i => (i < n / 2 ? f1[i] : -f1[i]) * 0.8 + f2[i] * 0.3 + noise();
  const spec = { NAS100_USD: i => f1[i] + noise(), SPX500_USD: i => f1[i] + noise(), US30_USD: i => f1[i] + noise(), XAUUSD: gold, XAGUSD: i => gold(i) + noise(), WTICO_USD: i => f2[i] + noise(), EURUSD: i => f2[i] * 0.5 + noise(), GBPUSD: i => f2[i] * 0.5 + noise() };
  const syms = Object.keys(spec), closes = {}; for (const k of syms) closes[k] = mk(spec[k]);
  return { syms, dates: Array.from({ length: n }, (_, i) => `2024-${String(1 + (i / 28 | 0)).padStart(2, '0')}-${String(1 + i % 28).padStart(2, '0')}`), closes };
}

test('scrub steps: weekly, anchored on the last day, never before a full window', () => {
  const s = scrubSteps(100, 60, 5); assert.equal(s.at(-1), 99); assert.ok(s[0] >= 60); assert.ok(s.every((e, i) => !i || e - s[i - 1] === 5));
  assert.deepEqual(scrubSteps(50, 60), []); assert.deepEqual(scrubSteps(61, 60), [60]);
  assert.deepEqual(WINDOWS, [20, 60, 120]);
});

test('a window matrix equals corrMath.matrix at that end, and the packed index is consistent', () => {
  const S = series(flipPanel()), ids = S.ids, R = returnsOf(S, ids);
  for (const [end, w] of [[399, 60], [150, 20], [250, 120]]) {
    const m = toMatrix(triAt(R, end, w), ids.length), ref = matrix(S, ids, w, end).m;
    for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) if (i !== j) assert.ok(Math.abs(m[i][j] - ref[i][j]) < 1e-6, `${i},${j}`);
  }
  let k = 0; for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) { assert.equal(triIx(5, i, j), k); assert.equal(triIx(5, j, i), k); k++; }
});

test('point-in-time: nothing after the shown date changes the matrix, the moves or the 3-month change (no lookahead)', () => {
  const S = series(flipPanel()), R = returnsOf(S, S.ids), end = 220;
  const a = triAt(R, end, 60), mv = dayMoves(R, S.ids, end), ch = biggestChange(R, S.ids, { w: 60, end });
  const R2 = R.map(x => { const y = Float64Array.from(x); for (let i = end + 1; i < y.length; i++) y[i] = (i % 2 ? 1 : -1) * 0.5; return y; });
  assert.deepEqual(Array.from(triAt(R2, end, 60)), Array.from(a));
  assert.deepEqual(dayMoves(R2, S.ids, end), mv); assert.deepEqual(biggestChange(R2, S.ids, { w: 60, end }), ch);
  // and the day itself does count: changing it changes the matrix
  const R3 = R.map(x => { const y = Float64Array.from(x); y[end] = 0.3; return y; }); assert.notDeepEqual(Array.from(triAt(R3, end, 60)), Array.from(a));
});

test('window edges and missing data: a too-thin window is unknown, gaps are pairwise-complete, a dead market is all unknown', () => {
  const S = series(flipPanel()), R = returnsOf(S, S.ids);
  assert.ok(triAt(R, 10, 60).every(v => Number.isNaN(v)), 'only 10 days of returns in a 60-day window');
  const Rg = R.map((x, i) => { const y = Float64Array.from(x); if (i === 1) for (let d = 300; d < 315; d++) y[d] = NaN; if (i === 7) y.fill(NaN); return y; });
  const t = triAt(Rg, 340, 60), n = R.length;
  assert.ok(Number.isFinite(t[triIx(n, 0, 1)]) && t[triIx(n, 0, 1)] > 0.8, 'a 15-day gap inside 60 days still leaves enough');
  for (let i = 0; i < n - 1; i++) assert.ok(Number.isNaN(t[triIx(n, i, 7)]));
  const m = toMatrix(t, n); assert.equal(m[7][0], null); assert.equal(m[0][0], 1);
  const L = forceLayout(m); assert.ok(Array.from(L).every(Number.isFinite), 'the layout survives a dead market');
  assert.deepEqual(dayMoves(Rg, S.ids, 340).GBPUSD, undefined);
  assert.equal(biggestChange(R, S.ids, { w: 60, end: 100 }), null, 'no window three months before day 100');
});

test('the scan fills in chunks (latest first, the shown step on demand), and the strip and swing pair find the flip', () => {
  const net = buildNet({ ok: true, panel: flipPanel() }), steps = scrubSteps(net.dates.length, 60), scan = makeScan(net.R, steps, 60);
  assert.equal(scanSome(scan, 3), false); assert.ok(scan.tri.at(-1) && scan.tri.at(-3) && !scan.tri[0]);
  scanSome(scan, 1, 0); assert.ok(scan.tri[0], 'the shown step jumps the queue');
  let guard = 0; while (!scanSome(scan, 5) && guard++ < 1000); assert.ok(scan.done && scan.tri.every(Boolean));
  const ix = k => net.ids.indexOf(k), path = pairPath(scan, ix('SPX500'), ix('GOLD'));
  assert.ok(path[2] > 0.4 && path.at(-1) < -0.4, `stock-gold flips: ${path[2]} -> ${path.at(-1)}`);
  const sw = swingPair(scan, net.ids); assert.ok(sw.range > 1, `swing ${sw.range}`); assert.ok([sw.a, sw.b].includes('GOLD') || [sw.a, sw.b].includes('SILVER'));
  assert.ok(!sharesCurrency(sw.a, sw.b));
  assert.equal(swingPair(makeScan(net.R, steps, 60), net.ids), null, 'nothing scanned yet: no headline pair');
});

test('warm start: same matrix barely moves the nodes; a new matrix moves them and still fits; a bad init falls back to a fresh layout', () => {
  const net = buildNet({ ok: true, panel: flipPanel() }), steps = scrubSteps(net.dates.length, 60), scan = makeScan(net.R, steps, 60);
  const a = stepState(net, scan, steps.length - 1), same = relayout(a.m, a.P);
  assert.ok(meanShift(a.P, same) < 0.08, `same matrix shift ${meanShift(a.P, same)}`);
  const b = stepState(net, scan, 5, a.P); assert.ok(b.fit > 0.7, `fit ${b.fit}`); assert.ok(meanShift(a.P, b.P) > 0.05);
  assert.equal(b.date, net.dates[steps[5]]); assert.ok(b.hi && b.lo && b.tight.length);
  assert.deepEqual(Array.from(forceLayout(a.m, { init: new Float32Array(3) })), Array.from(forceLayout(a.m)));
  const bad = Float32Array.from(a.P); bad[0] = NaN; assert.deepEqual(Array.from(forceLayout(a.m, { init: bad })), Array.from(forceLayout(a.m)));
});

test('the 3-month change is found and spoken, with the sign flip named', () => {
  const p = flipPanel(), n = p.dates.length;   // the flip sits at n/2 = 200; read it from a date 40 days after
  for (const k of p.syms) p.closes[k] = p.closes[k].slice(0, 240); p.dates = p.dates.slice(0, 240);
  const net = buildNet({ ok: true, panel: p }); assert.ok(net.change && Math.abs(net.change.delta) > 0.5, JSON.stringify(net.change)); assert.ok(n > 240);
  assert.ok(['GOLD', 'SILVER'].some(k => [net.change.a, net.change.b].includes(k)));
  const t = netScript(net); assert.match(t, /last three months the biggest change/); assert.match(t, /change of sign/); assert.match(t, /not a forecast/);
});

test('SHOW acts: the script parts join to the script, acts cover 0..1 in narration order, the caveat stays on the headline, focus eases in', async () => {
  const { netScriptParts, showActs, showAct, actNodes, nodeRadius } = await import('./netCore.js');
  const net = buildNet({ ok: true, panel: flipPanel() }), parts = netScriptParts(net);
  assert.equal(parts.map(x => x.text).join(' '), netScript(net));
  const acts = showActs(net); assert.equal(acts[0].a, 0); assert.equal(acts.at(-1).b, 1);
  for (let i = 1; i < acts.length; i++) assert.ok(Math.abs(acts[i].a - acts[i - 1].b) < 1e-12);
  assert.deepEqual(acts.map(a => a.act), parts.map(x => x.act).filter(a => a !== 'outro'));
  assert.equal(showAct(acts, 0).focus, 0); assert.equal(showAct(acts, 1).act, acts.at(-1).act); assert.equal(showAct(acts, 1).focus, 1);
  const hi = acts.find(a => a.act === 'hi'), mid = showAct(acts, (hi.a + hi.b) / 2); assert.equal(mid.act, 'hi'); assert.equal(mid.focus, 1);
  assert.ok(showAct(acts, hi.a + 0.01).focus < 1);
  const ch = actNodes(net, net.m, 'change'); assert.ok(ch.nodes.length >= 2 && ch.nodes.length <= 6 && ch.pair[0] < ch.pair[1]);
  assert.ok(ch.nodes.includes(net.ids.indexOf(net.change.a)) && ch.nodes.includes(net.ids.indexOf(net.change.b)));
  assert.deepEqual(actNodes(net, net.m, 'hi').nodes.sort(), [net.ids.indexOf(net.hi.a), net.ids.indexOf(net.hi.b)].sort());
  assert.deepEqual(actNodes(net, net.m, 'intro').nodes, []); assert.deepEqual(showActs(null), []);
  // area proportional above a floor: monotone, smooth, capped
  assert.ok(nodeRadius(0) > 0 && nodeRadius(0.5) > nodeRadius(0.25) && nodeRadius(2) === nodeRadius(1));
  assert.ok(Math.abs(nodeRadius(1) ** 2 - nodeRadius(0.5) ** 2 - (nodeRadius(0.5) ** 2 - nodeRadius(0) ** 2)) < 1e-12);
});

test('the BRIEF reads the day: the group that moved, a usual pair that split, the core markets that are one trade', async () => {
  const { splits, oneTrade, moveGroup, netBriefParts, showActs, showAct } = await import('./netCore.js');
  const ids = ['EURUSD', 'GBPUSD', 'USDCHF', 'NQ', 'US2000', 'GOLD'], n = ids.length, m = ids.map(() => ids.map(() => 0.1));
  const set = (a, b, r) => { const i = ids.indexOf(a), j = ids.indexOf(b); m[i][j] = m[j][i] = r; };
  set('EURUSD', 'GBPUSD', 0.85); set('EURUSD', 'USDCHF', -0.8); set('GBPUSD', 'USDCHF', -0.7); set('NQ', 'US2000', 0.8); ids.forEach((_, i) => { m[i][i] = 1; });
  const net = { ids, m };
  const mv = { NQ: { move: -0.6, ratio: 1.2 }, US2000: { move: 0.5, ratio: 0.9 }, EURUSD: { move: 0.1, ratio: 0.3 }, GBPUSD: { move: 0.1, ratio: 0.2 }, USDCHF: { move: -0.1, ratio: 0.2 } };
  assert.deepEqual(splits(net, mv).map(s => [s.a, s.b]), [['NQ', 'US2000']]);
  const ot = oneTrade(net); assert.equal(ot.a, 'EURUSD'); assert.deepEqual(ot.mem.map(x => x.k), ['GBPUSD', 'USDCHF']);
  const g = moveGroup(net, mv); assert.equal(g.id, 'eq'); assert.equal(g.dir, null, 'split directions: no group direction'); assert.equal(moveGroup(net, { NQ: { move: 1, ratio: 0.5 }, US2000: { move: 1, ratio: 0.6 } }), null, 'under 0.8 of usual is not a move');
  const parts = netBriefParts(net, mv, 'yesterday'), t = parts.map(x => x.text).join(' ');
  assert.match(t, /Nasdaq and the Russell normally move together, at 0\.80, but yesterday Nasdaq fell while the Russell rose/);
  assert.match(t, /Over this window that has been one dollar move, not three separate ones\./); assert.doesNotMatch(t, /\bwill\b/);
  assert.doesNotMatch(t, /gives way|size it|for positions|\btrade\b/i, 'Helix review 0.2: description, never advice');
  const acts = showActs(net, parts), sp = acts.find(a => a.act === 'split'); assert.deepEqual(sp.ids, ['NQ', 'US2000']); assert.equal(showAct(acts, (sp.a + sp.b) / 2).focus, 1);
});

test('the BRIEF figure shows the narration headline (split, else one trade, else the group), never the 3-month change', async () => {
  const { netBriefFigure } = await import('./netCore.js');
  const ids = ['EURUSD', 'GBPUSD', 'USDCHF', 'NQ', 'US2000', 'GOLD'], m = ids.map(() => ids.map(() => 0.1));
  const set = (a, b, r) => { const i = ids.indexOf(a), j = ids.indexOf(b); m[i][j] = m[j][i] = r; };
  set('EURUSD', 'GBPUSD', 0.85); set('EURUSD', 'USDCHF', -0.8); set('GBPUSD', 'USDCHF', -0.7); set('NQ', 'US2000', 0.8); ids.forEach((_, i) => { m[i][i] = 1; });
  const net = { ids, m, change: { a: 'GOLD', b: 'NQ', then: -0.45, now: 0.16, delta: 0.61 } };
  const f = netBriefFigure(net, { NQ: { move: -0.6, ratio: 1.2 }, US2000: { move: 0.5, ratio: 0.9 } }, 'yesterday');
  assert.equal(f.value, 'NQ ▼ · US2000 ▲'); assert.equal(f.label, 'split yesterday; usually 0.80 together');
  const g = netBriefFigure(net, {}, 'today'); assert.equal(g.value, '1 move, not 3'); assert.equal(g.label, 'EURUSD, GBPUSD, USDCHF');
  assert.doesNotMatch(JSON.stringify([f, g]), /0\.45|0\.16/);
  assert.equal(netBriefFigure({ ids: ['A', 'B'], m: [[1, 0.1], [0.1, 1]] }, {}), null);
});

test('a split needs a residual z of 2 on the pair\'s spread, said against the count chance gives (Helix review wave 1.3)', async () => {
  const { splits, splitsZ, netBriefParts, netBriefFigure, Z_TAIL_2 } = await import('./netCore.js');
  const ids = ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF'], m = ids.map(() => ids.map(() => 0.7)); ids.forEach((_, i) => { m[i][i] = 1; });
  const net = { ids, m };
  // a small sign disagreement: EURUSD +0.6 sd, GBPUSD -0.6 sd at r 0.7 -> d = 1.2 / sqrt(0.6) = 1.55: noise, though the old rule calls it a split
  const mv = Object.fromEntries(ids.map(k => [k, { move: 0.1, ratio: 0.6 }])); mv.GBPUSD = { move: -0.1, ratio: 0.6 };
  assert.ok(splits(net, mv).length > 0, 'the old sign rule fires');
  const Z = splitsZ(net, mv); assert.equal(Z.list.length, 0); assert.equal(Z.tested, 15); assert.ok(Math.abs(Z.expected - 15 * Z_TAIL_2) < 1e-12);
  const t = netBriefParts(net, mv).map(x => x.text).join(' ');
  assert.match(t, /no tight pair split by two sigma or more\. Of 15 tight pairs, zero are two sigma or more out of line today; chance alone gives fewer than one./);
  // a real break: +2 sd against -1.5 sd -> d = 3.5 / 0.77 = 4.5
  mv.GBPUSD = { move: -0.3, ratio: 1.5 }; mv.EURUSD = { move: 0.4, ratio: 2 };
  const t2 = netBriefParts(net, mv).map(x => x.text).join(' ');
  assert.match(t2, /Euro Dollar and .* normally move together, at 0\.70, but today .* rose while .* fell, 4\.5 sigma out of line/);
  assert.match(netBriefFigure(net, mv).value, /EURUSD ▲ · GBPUSD ▼/);
});
