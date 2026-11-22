// js/terminal/jarvisViewSession.js: CANDLES, the HUD's flagship chart (view id 'session'), drawn by the hologram engine (WebGL, js/terminal/jarvisGL.js). A TradingView-style candlestick chart
// as a glowing hologram: emissive 3D candle bodies standing on a lit projector floor, a price scale on the right with a live last-price tag and value tags, a time axis along the bottom,
// laser crosshair lines with a floating OHLC readout, timeframe buttons (5m 15m 1h daily), a market picker, EMA 20 / EMA 50 as light tubes, the market's usual high / low reach for the day
// as a glass slab, and DEPTH: each earlier UTC day stacked behind as a holographic sheet, dated and faded by age, that the camera flies back through (buttons, or a slow auto-dolly).
//
// ENCODING
//   candle      one bar. Body from open to close, wick from low to high, on ONE linear price scale (the plane in focus sets it; it eases as the camera flies). Colour by direction (up token =
//               closed up, dn token = closed down) AND fill as the second cue: an up body is a filled block of light, a down body is a hollow glass outline. The latest bars glow brighter
//               (bloom) and the very latest pulses under a white beam with a ring on the floor; brightness never changes the geometry.
//   EMA tubes   EMA 20 (cy) and EMA 50 (gold): exponential averages of PAST closes, drawn as light tubes through the candles, only where the average exists; tagged on the price scale.
//   glass slab  the market's usual high / low reach for today (median distance from the day's open, from the vol forecaster), behind today's candles, with the day's open as a gold line.
//   sheets      one holographic sheet per earlier UTC day (daily bars: blocks of 22 trading days), newest in front; same clock time sits directly behind. Older sheets are fainter.
//   tags        right-hand axis: price ticks, the last price (solid, coloured by the session's direction), EMA values and the band edges, pushed apart so none overlap.
// Bars come from /api/cog-chart/candles (5m / 15m / 1h) and /api/ohlc (daily); the usual reach from /api/vol-forecast/live. A 60 s cache; any failure leaves the view saying so in words.
// Pure maths (planes, scale, ticks, EMA, crosshair hit-tests, the SHOW flight path, tag spreading) lives in jarvisChartCore.js / jarvisSessionCore.js (tested).
// DESCRIPTION ONLY: every element is something that has happened; nothing here is a forecast, a signal or a trade.
import { marketName } from './jarvisNames.js';
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { glView, hudOrbit, orbitPos } from './jarvisGL.js';
import { MARKET_KEYS } from './jarvisMarkets.js';
import { intradayAsset, dailySymbol, pickMarket, dailyBars, usualBand, sessionStats, sessionScript, loopState, rise, fmtPrice } from './jarvisSessionCore.js';
import { TFS, TF_COUNT, ema, groupPlanes, chartScale, priceTicks, priceDecimals, timeTicks, nearestIndex, priceAtY, barChange, planeAlpha, autoDolly, stepKey, fullTime, clamp, dayOf, showFlight, spreadLabels } from './jarvisChartCore.js';

const TTL = 60_000, WC = 6, HY = 3, TOP = HY * 1.03, PZ = 1.15, BAND_DZ = -0.45, FOV = 38, YAW0 = -0.22, FALLBACK = 'NQ';
const TF_LABEL = { '5m': '5m', '15m': '15m', '1h': '1h', '1d': 'D' }, TF_WORD = { '5m': '5 minute', '15m': '15 minute', '1h': 'hourly', '1d': 'daily' };
const VOL = { at: 0, inst: null, p: null }, DATA = new Map();
const S = { key: null, tf: '15m', replay: false, auto: false, dolly: 0, dollyT: 0, t0: null, pan: 0, mx: null, my: null, top: 70, topAt: -9, xs: new Float32Array(300), nAct: 0, lo: null, hi: null, scT: null, scId: '', scKey: '',
  showP: -1, showAt: 0, hov: -1, hovPrice: 0, spin: null, printed: 0 };
const showing = () => S.showP >= 0 && Date.now() - S.showAt < 1500;

function loadVol(api) {
  if (VOL.inst && Date.now() - VOL.at < TTL) return Promise.resolve(VOL.inst);
  VOL.p ??= Promise.resolve().then(() => api.jf('/api/vol-forecast/live')).then(j => { if (j?.instruments) { VOL.inst = j.instruments; VOL.at = Date.now(); } return VOL.inst; }).catch(() => VOL.inst).finally(() => { VOL.p = null; });
  return VOL.p;
}
const finish = (e, r, v) => {
  const closes = r.bars.map(b => b.c), planes = groupPlanes(r.bars, r.tf);
  if (!planes) return false;
  const band = r.tf !== '1d' ? usualBand(v) : null, sc = chartScale(planes, 3, band ? [band.hi, band.lo] : []);
  Object.assign(e, { tf: r.tf, bars: r.bars, e20: ema(closes, 20), e50: ema(closes, 50), planes, band, sc, st: sessionStats(planes[0].bars, v), v, status: 'ok', note: r.note ?? '', ver: (e.ver ?? 0) + 1 });
  return true;
};
/** Load (or refresh after a minute) one market's bars for a timeframe. Never throws; the entry carries status 'loading' | 'ok' | 'fail'. */
export function loadChart(key, tf, api) {
  const id = `${key}|${tf}`, e = DATA.get(id) ?? { status: 'loading', at: 0, p: null }; DATA.set(id, e);
  if (e.p || (e.status !== 'loading' && Date.now() - e.at < TTL)) return e.p ?? Promise.resolve(e);
  e.p = (async () => {
    const inst = await loadVol(api), v = inst?.[key] ?? null; let ok = false;
    const asset = tf !== '1d' ? intradayAsset(key) : null;
    if (asset) { try { const j = await api.jf(`/api/cog-chart/candles?asset=${asset}&tf=${tf}&count=${TF_COUNT[tf]}`); if (j?.ok && Array.isArray(j.candles) && j.candles.length >= 4) ok = finish(e, { tf, bars: j.candles.map(c => ({ t: +c.t, o: +c.o, h: +c.h, l: +c.l, c: +c.c })).sort((a, b) => a.t - b.t) }, v); } catch (x) { /* fall back to daily */ } }
    if (!ok) { const sym = dailySymbol(key); if (sym) { try { const j = await api.jf(`/api/ohlc?symbol=${sym}`), b = dailyBars(j?.values, 200); if (b.length >= 5) ok = finish(e, { tf: '1d', bars: b, note: tf !== '1d' ? 'No intraday bars for this market right now, so daily bars are shown.' : '' }, v); } catch (x) { /* no data */ } } }
    if (!ok && e.status !== 'ok') e.status = 'fail';
    e.at = Date.now(); e.p = null; return e;
  })();
  return e.p;
}
const entryOf = (key, tf) => DATA.get(`${key}|${tf}`);
/** The market to draw: the selection, else the biggest mover against its usual move, else Nasdaq (so a weekend, when the forecaster has no bars, still shows the last session). */
const marketFor = (sel, inst) => (MARKET_KEYS.includes(sel) ? sel : pickMarket(null, inst ?? {}) ?? FALLBACK);

/** One command from the toolbar or the panel: tf:<id> mk:<KEY> mkp mkn replay auto back fwd. */
export function chartCommand(cmd, api) {
  const st = api.st, [c, arg] = String(cmd).split(':');
  if (c === 'tf' && TFS.includes(arg)) { S.tf = arg; S.t0 = null; S.dollyT = 0; S.dolly = 0; }
  else if (c === 'mk' && MARKET_KEYS.includes(arg)) { st.sel = arg; S.key = arg; S.t0 = null; S.dollyT = 0; S.dolly = 0; }
  else if (c === 'mkp' || c === 'mkn') { const k = stepKey(MARKET_KEYS, S.key, c === 'mkn' ? 1 : -1); if (k) { st.sel = k; S.key = k; S.t0 = null; S.dollyT = 0; S.dolly = 0; } }
  else if (c === 'replay') { S.replay = !S.replay; S.t0 = null; }
  else if (c === 'auto') S.auto = !S.auto;
  else if (c === 'back' || c === 'fwd') { S.auto = false; S.dollyT = Math.round(S.dollyT) + (c === 'back' ? 1 : -1); }
}

// ───────────────────────── shaders (additive light: colour * a, so values above 1 bloom) ─────────────────────────
const CANDLE_VS = `attribute vec3 aCol; attribute float aGlow; attribute float aFill;
varying vec3 vN; varying vec3 vV; varying vec3 vC; varying vec2 vU; varying float vG; varying float vF; varying float vY; varying float vWY;
void main(){ vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
  vC = aCol; vG = aGlow; vF = aFill; vU = uv; vY = position.y + 0.5; vWY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }`;
const CANDLE_FS = `uniform float op, top; varying vec3 vN; varying vec3 vV; varying vec3 vC; varying vec2 vU; varying float vG; varying float vF; varying float vY; varying float vWY;
void main(){ if (vWY < -0.002 || vWY > top) discard; float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  vec2 dd = min(vU, 1.0 - vU); vec2 fw = max(fwidth(vU) * 1.4, vec2(1e-4)); float e = 1.0 - min(smoothstep(0.0, fw.x, dd.x), smoothstep(0.0, fw.y, dd.y));
  float body = mix(0.03, 0.28, vF) * (0.55 + 0.45 * vY);
  float a = (body + f * mix(0.55, 0.3, vF) + e * mix(1.0, 0.6, vF)) * vG * op; gl_FragColor = vec4(vC * a, 1.0); }`;
const SHEET_VS = 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SHEET_FS = `uniform vec3 c; uniform float op, t, hot; varying vec2 vU;
void main(){ vec2 dd = min(vU, 1.0 - vU); vec2 fw = max(fwidth(vU) * 1.2, vec2(1e-4)); float e = 1.0 - min(smoothstep(0.0, fw.x, dd.x), smoothstep(0.0, fw.y, dd.y));
  float lowb = (1.0 - vU.y) * (1.0 - vU.y); float scan = 0.5 + 0.5 * sin(vU.y * 240.0 - t * 2.0); float sweep = exp(-pow((vU.y - fract(t * 0.06)) * 16.0, 2.0));
  float a = (0.012 + 0.03 * lowb + 0.006 * scan + 0.035 * sweep * hot + e * (0.22 + 0.3 * hot) * (0.4 + 0.6 * step(vU.y, 0.02))) * op; gl_FragColor = vec4(c * a, 1.0); }`;
const AREA_VS = 'attribute float aBot; varying float vH; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); if (aBot > 0.5) w.y = 0.0; vH = w.y; gl_Position = projectionMatrix * viewMatrix * w; }';
const TUBE_VS = 'varying vec3 vN; varying vec3 vV; varying float vWY; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWY = w.y; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }';
const TUBE_FS = 'uniform vec3 c; uniform float op, top; varying vec3 vN; varying vec3 vV; varying float vWY; void main(){ if (vWY < -0.002 || vWY > top) discard; float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.3); float a = (0.14 + f * 0.6) * op; gl_FragColor = vec4(c * a, 1.0); }';
const AREA_FS = 'uniform vec3 c; uniform float op, hy; varying float vH; void main(){ if (vH > hy * 1.03) discard; float k = clamp(vH / hy, 0.0, 1.0); float a = (0.004 + 0.035 * k * k) * op; gl_FragColor = vec4(c * a, 1.0); }';

function setup(L, H, api) {
  const { THREE } = L, kit = H.kit, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.05, 200);
  scene.add(kit.dust(900, 40, 'white'));
  const O3 = () => Array(3).fill(0), CLIP = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.002), new THREE.Plane(new THREE.Vector3(0, -1, 0), TOP)], ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  H.renderer.localClippingEnabled = true;                    // the close and EMA core lines are cut at the sheet edges like everything else on a day
  const clipLine = l => { l.material.clippingPlanes = CLIP; l.material.needsUpdate = true; return l; };
  const cam = { p: new THREE.Vector3(0, 3, 9), t: new THREE.Vector3(0, 1.4, 0), wp: new THREE.Vector3(), wt: new THREE.Vector3(), snap: true };
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  let M = null, root = null, colKey = '';

  const clear = () => { if (root) { scene.remove(root); kit.forget(root); root = null; } M = null; };
  const candleMat = () => new THREE.ShaderMaterial({ uniforms: { op: { value: 1 }, top: { value: TOP } }, vertexShader: CANDLE_VS, fragmentShader: CANDLE_FS, side: THREE.DoubleSide, ...ADD });
  const sheetMat = c => new THREE.ShaderMaterial({ uniforms: { c: { value: H.color(c) }, op: { value: 1 }, t: { value: 0 }, hot: { value: 0 } }, vertexShader: SHEET_VS, fragmentShader: SHEET_FS, side: THREE.DoubleSide, ...ADD });
  const instMesh = (n, mat) => {
    const gm = new THREE.BoxGeometry(1, 1, 1); gm.setAttribute('aCol', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)); gm.setAttribute('aGlow', new THREE.InstancedBufferAttribute(new Float32Array(n), 1)); gm.setAttribute('aFill', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
    const m = new THREE.InstancedMesh(gm, mat, n); m.frustumCulled = false; return m;
  };
  /** A light tube through points (x, y, 0) with `seg` ring segments, index ordered along the path so drawRange can cut it at any point. */
  const tube = (pts, r, mat) => {
    const n = pts.length, R = 8, pos = new Float32Array(n * R * 3), nor = new Float32Array(n * R * 3), idx = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      for (let j = 0; j < R; j++) { const an = j / R * Math.PI * 2, cx = Math.cos(an), sz = Math.sin(an), nx = -ty * cx, ny = tx * cx, o = (i * R + j) * 3; nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = sz; pos[o] = pts[i][0] + r * nx; pos[o + 1] = pts[i][1] + r * ny; pos[o + 2] = pts[i][2] + r * sz; }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < R; j++) { const a = i * R + j, b = (i + 1) * R + j, c2 = (i + 1) * R + (j + 1) % R, d = i * R + (j + 1) % R; idx.push(a, b, d, b, c2, d); }
    const gm = new THREE.BufferGeometry(); gm.setAttribute('position', new THREE.BufferAttribute(pos, 3)); gm.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); gm.setIndex(idx);
    const m = new THREE.Mesh(gm, mat); m.userData.R = R; return m;
  };

  /** Build the whole chart for one entry (market + timeframe): planes, candles, tubes, slab, floor, and the pools the frame moves. */
  function build(e, C) {
    clear(); const planes = e.planes, np = planes.length, slots = planes[0].slots, dx = Math.min(0.26, WC / slots), Wc = slots * dx, X = s => (s - (slots - 1) / 2) * dx;
    const sc0 = chartScale([planes[0]], 1, e.band ? [e.band.hi, e.band.lo] : []), P0 = sc0.lo, U = (sc0.hi - sc0.lo) / HY, R = p => (p - P0) / U;
    const w = dx * 0.34, d = clamp(dx * 0.42, 0.012, 0.09), ww = clamp(dx * 0.07, 0.004, 0.016), xl = -Wc / 2 - 0.12, xr = Wc / 2 + 0.12;
    root = new THREE.Group(); scene.add(root);
    const cUp = H.color(C.up), cDn = H.color(C.dn);
    M = { cUp, cDn, e, ver: e.ver, planes, np, slots, dx, Wc, X, P0, U, R, w, d, ww, xl, xr, pl: [], zBack: -(np - 1) * PZ, done: false };
    // the projector floor: a soft glow pool and a grid running back through every day
    const depth = (np - 1) * PZ + 1.2, fl = [];
    for (let i = 0; i <= 24; i++) { const x = xl + (xr - xl) * i / 24; fl.push([x, 0, 0.6, x, 0, -depth]); }
    for (let z = 0.6; z >= -depth; z -= PZ / 2) fl.push([xl, 0, z, xr, 0, z]);
    const grid = kit.segments(fl, C.blue, 0.09); root.add(grid);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(Wc + 3, depth + 2), kit.glowDisc(C.blue, 0.2)); pool.rotation.x = -Math.PI / 2; pool.position.set(0, -0.004, -depth / 2 + 0.3); root.add(pool);
    planes.forEach((pl, k) => {
      const grp = new THREE.Group(); grp.position.z = -k * PZ; root.add(grp);
      const sm = sheetMat(C.blue), sheet = new THREE.Mesh(new THREE.PlaneGeometry(xr - xl, HY), sm); sheet.position.set(0, HY / 2, -0.002); grp.add(sheet);
      const priced = new THREE.Group(); grp.add(priced);
      const bars = pl.bars, n = bars.length, mat = candleMat(), bodies = instMesh(n, mat), wicks = instMesh(n, mat);
      for (const ms of [bodies, wicks]) { const ca = ms.geometry.attributes.aCol.array, fa = ms.geometry.attributes.aFill.array; bars.forEach((b, i) => { const up = b.c >= b.o, c3 = up ? cUp : cDn; ca[i * 3] = c3.r; ca[i * 3 + 1] = c3.g; ca[i * 3 + 2] = c3.b; fa[i] = ms === wicks ? 1 : up ? 1 : 0; }); }
      priced.add(wicks, bodies);
      const rec = { k, pl, grp, priced, sheet: sm, mat, bodies, wicks, n, base: new Float32Array(n), lines: [], emas: [], area: null, close: null };
      for (let i = 0; i < n; i++) rec.base[i] = k === 0 ? 0.5 + 2.4 * Math.exp(-(n - 1 - i) / 2.5) : 0.55;
      setBars(rec, 1e9);
      // the closes: a faint line and a glowing area to the floor
      const cp = bars.map(b => [X(b.s), R(b.c), 0]);
      if (n >= 2) {
        const cl = clipLine(kit.line(cp, C.tx2, 1.1, 0.3)); priced.add(cl); rec.close = cl;
        const ap = new Float32Array(n * 2 * 3), ab = new Float32Array(n * 2), ai = []; cp.forEach((p, i) => { ap.set([p[0], p[1], -0.01], i * 6); ap.set([p[0], p[1], -0.01], i * 6 + 3); ab[i * 2 + 1] = 1; if (i) { const a = (i - 1) * 2; ai.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
        const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.BufferAttribute(ap, 3)); ag.setAttribute('aBot', new THREE.BufferAttribute(ab, 1)); ag.setIndex(ai);
        const am = new THREE.ShaderMaterial({ uniforms: { c: { value: H.color(C.tx) }, op: { value: 1 }, hy: { value: HY } }, vertexShader: AREA_VS, fragmentShader: AREA_FS, side: THREE.DoubleSide, ...ADD });
        rec.area = new THREE.Mesh(ag, am); rec.area.frustumCulled = false; priced.add(rec.area);
      }
      // the moving averages as light tubes with a bright core, only where the average exists
      for (const [arr, c, nm] of [[e.e20, C.cy, 20], [e.e50, C.gold, 50]]) {
        const ix = [], pts = []; bars.forEach((b, i) => { const v = arr[b.gi]; if (v != null) { ix.push(i); pts.push([X(b.s), R(v), 0]); } });
        if (pts.length < 2) continue;
        const hm = new THREE.ShaderMaterial({ uniforms: { c: { value: H.color(c) }, op: { value: 0.8 }, top: { value: TOP } }, vertexShader: TUBE_VS, fragmentShader: TUBE_FS, side: THREE.DoubleSide, ...ADD }), tb = tube(pts, clamp(dx * 0.22, 0.012, 0.03), hm); priced.add(tb);
        const core = clipLine(kit.line(pts, c, 1.6, 0.95)); priced.add(core);
        rec.emas.push({ nm, arr, ix, tube: tb, core, hm, col: c });
      }
      // today: the usual-reach glass slab and the day's open
      if (k === 0 && e.band) {
        const b = e.band, h = R(b.hi) - R(b.lo), hm = kit.holo(C.blue, { rim: 1.5, base: 0.035, scan: 1, opacity: 0.85 }), slab = new THREE.Mesh(new THREE.BoxGeometry(Wc, h, 0.16), hm);
        slab.position.set(0, (R(b.hi) + R(b.lo)) / 2, BAND_DZ); const eg = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: H.color(C.blue), transparent: true, opacity: 0.55, ...ADD })); eg.position.copy(slab.position);
        const op = kit.line([[-Wc / 2, R(b.open), BAND_DZ + 0.08], [Wc / 2, R(b.open), BAND_DZ + 0.08]], C.gold, 1.6, 0.8);
        priced.add(slab, eg, op); M.band = { hm, eg, op };
      }
      M.pl.push(rec);
    });
    // pools the frame moves: price grid lines on the plane in focus, the last-price line, the right axis, lasers, the hovered-bar outline, the now marker and the printing flare
    M.grid = Array.from({ length: 12 }, () => { const l = kit.line([[xl, 0, 0], [xr, 0, 0]], C.blue, 1, 0.16); l.visible = false; root.add(l); return l; });
    M.axis = kit.line([[xr, 0, 0], [xr, HY, 0]], C.blue, 1.2, 0.45); root.add(M.axis);
    M.last = kit.line([[xl, 0, 0], [xr, 0, 0]], C.tx, 1.2, 0.75); M.last.material.dashed = true; M.last.material.dashSize = 0.08; M.last.material.gapSize = 0.06; M.last.material.needsUpdate = true; root.add(M.last);
    M.laserV = kit.line([O3(), [0, HY, 0]], C.tx, 1.4, 0.85); M.laserH = kit.line([[xl, 0, 0], [xr, 0, 0]], C.tx, 1.4, 0.85); M.laserV.visible = M.laserH.visible = false; root.add(M.laserV, M.laserH);
    M.box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: H.color(C.tx), transparent: true, opacity: 0.95, ...ADD })); M.box.visible = false; root.add(M.box);
    const ring = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; ring.push([Math.cos(a), 0, Math.sin(a)]); }
    M.ring = kit.line(ring, C.tx, 2, 0.9); M.beam = kit.line([O3(), [0, 1, 0]], C.tx, 1.6, 0.45); M.flare = kit.flare(C.tx, 0.4, 0.9); M.pflare = kit.flare(C.tx, 0.5, 0); root.add(M.ring, M.beam, M.flare, M.pflare);
    colKey = `${C.up}|${C.dn}|${C.blue}|${C.cy}|${C.gold}|${C.tx}`;
  }

  /** Instance matrices + glow for one plane, given how far the print-in has got (bars rise from their open toward the close, wicks grow from the middle). */
  function setBars(rec, printed) {
    const { X, R, w, d, ww } = M, bars = rec.pl.bars, ga = rec.bodies.geometry.attributes.aGlow.array, gw = rec.wicks.geometry.attributes.aGlow.array; let flare = null;
    for (let i = 0; i < rec.n; i++) {
      const b = bars[i], gr = rec.k === 0 ? rise(i, printed) : 1, x = X(b.s);
      if (gr <= 0.002) { m4.makeScale(1e-9, 1e-9, 1e-9); rec.bodies.setMatrixAt(i, m4); rec.wicks.setMatrixAt(i, m4); ga[i] = gw[i] = 0; continue; }
      const yo = R(b.o), yc = yo + (R(b.c) - yo) * gr, yh = R(b.h), yl = R(b.l), ym = (yh + yl) / 2, hw = Math.max(0.004, (yh - yl) * gr);
      m4.makeScale(w * 2, Math.max(0.006, Math.abs(yc - yo)), d * 2).setPosition(x, (yo + yc) / 2, 0); rec.bodies.setMatrixAt(i, m4);
      m4.makeScale(ww, hw, ww).setPosition(x, ym, 0); rec.wicks.setMatrixAt(i, m4);
      const boost = gr < 0.999 ? 1.4 * (1 - gr) : 0; ga[i] = rec.base[i] * (0.35 + 0.65 * gr) + boost; gw[i] = ga[i] * 0.9;
      if (boost > 0 && (!flare || i > flare.i)) flare = { i, x, y: Math.max(yo, yc), gr, up: b.c >= b.o };
    }
    rec.bodies.instanceMatrix.needsUpdate = rec.wicks.instanceMatrix.needsUpdate = true; rec.bodies.geometry.attributes.aGlow.needsUpdate = rec.wicks.geometry.attributes.aGlow.needsUpdate = true;
    return flare;
  }

  return {
    scene, camera, bloom: { strength: 0.85, radius: 0.45, threshold: 0.22 },
    update(t, dt, api2, g) {
      const st = api.st, C = g.C;
      if (typeof st.sel === 'string' && st.sel.startsWith('cx:')) { const c = st.sel.slice(3); st.sel = MARKET_KEYS.includes(S.key) ? S.key : null; chartCommand(c, api); api.blip?.(820, 0.05); }   // a toolbar click arrives as st.sel
      else if (!MARKET_KEYS.includes(st.sel) && MARKET_KEYS.includes(S.key)) st.sel = S.key;                                                                                                       // a click on empty canvas must not drop the market
      if (!VOL.inst && !VOL.p && !VOL.tried) { VOL.tried = true; loadVol(api); }
      const key = VOL.inst || VOL.tried && !VOL.p ? marketFor(st.sel, VOL.inst) : null;
      S.cur = null; if (!key) { if (root) root.visible = false; return; }
      if (key !== S.key) { S.key = key; S.t0 = null; S.dolly = S.dollyT = 0; }
      const e = (loadChart(key, S.tf, api), entryOf(key, S.tf));
      if (!e || e.status !== 'ok') { if (root) root.visible = false; S.cur = { key, e }; return; }
      if (!M || M.e !== e || M.ver !== e.ver || colKey !== `${C.up}|${C.dn}|${C.blue}|${C.cy}|${C.gold}|${C.tx}`) { build(e, C); S.lo = null; }
      root.visible = true; if (S.t0 == null) S.t0 = t;
      const planes = M.planes, np = M.np, tf = e.tf, X = M.X, show = showing();
      // the dolly eases toward its target plane; auto-dolly ping-pongs through the days
      if (S.auto) S.dollyT = autoDolly(t, np); S.dollyT = clamp(S.dollyT, 0, np - 1); if (show) S.dollyT = 0; S.dolly += (S.dollyT - S.dolly) * Math.min(1, dt * 3);
      const ka = clamp(Math.round(S.dolly), 0, np - 1), zA = -ka * PZ;
      // the price scale follows the plane in focus (and today's usual-range band when that is today), easing as the camera flies
      { const id = `${key}|${tf}|${ka}|${M.ver}`; if (S.scId !== id) { S.scId = id; S.scT = chartScale([planes[ka]], 1, ka === 0 && e.band ? [e.band.hi, e.band.lo] : []); if (S.lo == null || S.scKey !== `${key}|${tf}`) { S.lo = S.scT.lo; S.hi = S.scT.hi; } S.scKey = `${key}|${tf}`; }
        const k = Math.min(1, dt * 4); S.lo += (S.scT.lo - S.lo) * k; S.hi += (S.scT.hi - S.hi) * k; }
      const lo = S.lo, hi = S.hi, sy = M.U * HY / (hi - lo), by = (M.P0 - lo) * HY / (hi - lo), yW = p => (p - lo) / (hi - lo) * HY;
      // how far today's bars have printed: the SHOW prints them with the flight, REPLAY loops, otherwise a short draw-in on arrival
      const front = M.pl[0], nf = front.n, fl = show ? showFlight(S.showP, { x0: X(front.pl.bars[0].s), x1: X(front.pl.bars[nf - 1].s), hy: HY, depth: M.zBack, yAt: q => yW(front.pl.bars[Math.min(nf - 1, Math.round(q * (nf - 1)))].c) }) : null;
      const printed = H.calm && !show ? 1e9 : show ? fl.printed * (nf + 2.5) : S.replay ? loopState(t - S.t0, nf).printed * (nf + 2.5) / nf : Math.min(nf + 3, ((t - S.t0) / 3.2) * (nf + 3));
      S.printed = Math.min(nf, printed);
      let pf = null; if (printed < nf + 2.6 || !M.done) { pf = setBars(front, printed); M.done = printed >= nf + 2.6; }
      // per plane: the price transform, the fade by age and dolly, and the cut of the lines while printing
      for (const r of M.pl) {
        r.priced.scale.y = sy; r.priced.position.y = by;
        const al = planeAlpha(r.k, S.dolly) * (r.k > ka ? 0.24 : 1), near = clamp(1 - Math.abs(r.k - S.dolly) / 0.9, 0, 1);
        r.grp.visible = al > 0.02; r.mat.uniforms.op.value = al; r.sheet.uniforms.op.value = al * (r.k === ka ? 1 : 0.7); r.sheet.uniforms.hot.value = r.k === ka ? 1 : 0; r.sheet.uniforms.t.value = H.calm ? 0 : t;
        const cut = r.k === 0 ? Math.floor(printed - 0.5) : 1e9;
        if (r.close) { r.close.material.opacity = 0.3 * al; r.close.geometry.instanceCount = clamp(cut, 0, r.n - 1); }
        if (r.area) { r.area.material.uniforms.op.value = al; r.area.geometry.setDrawRange(0, clamp(cut, 0, r.n - 1) * 6); }
        for (const m of r.emas) { let nOk = m.ix.length; if (r.k === 0) { nOk = 0; for (const i of m.ix) if (i <= cut) nOk++; } const segs = Math.max(0, nOk - 1), a = al * (0.12 + 0.88 * near); m.tube.geometry.setDrawRange(0, segs * m.tube.userData.R * 6); m.core.geometry.instanceCount = segs; m.hm.uniforms.op.value = 0.8 * a; m.core.material.opacity = 0.95 * a; m.tube.visible = m.core.visible = segs > 0; }
      }
      if (M.band) { const a = planeAlpha(0, S.dolly) * (S.dolly < 1.6 ? 1 : 0); M.band.hm.uniforms.op.value = 0.85 * a; M.band.eg.material.opacity = 0.55 * a; M.band.op.material.opacity = 0.8 * a; }
      // the plane in focus: price grid on its ticks, the right axis, the dashed last-price line
      const ticks = priceTicks(lo, hi, 6); S.ticks = ticks;
      M.grid.forEach((l, i) => { const p = ticks[i]; l.visible = p != null; if (p != null) l.position.set(0, yW(p), zA - 0.004); });
      M.axis.position.z = zA;
      const pa = planes[ka], lastB = pa.bars[ka === 0 ? clamp(Math.floor(S.printed - 0.5), 0, pa.bars.length - 1) : pa.bars.length - 1], upNow = lastB.c >= pa.bars[0].o;
      M.last.position.set(0, yW(lastB.c), zA + 0.01); M.last.material.color.copy(upNow ? M.cUp : M.cDn); M.last.visible = ka !== 0 || S.printed > 0.5;
      // the pulsing "now" marker on today's latest printed bar, and the flare on the bar that is printing
      const nb = front.pl.bars[clamp(Math.floor(S.printed - 0.5), 0, nf - 1)], pulse = H.calm ? 0.5 : 0.5 + 0.5 * Math.sin(t * 5), nowA = clamp(1 - S.dolly / 0.8, 0, 1) * (S.printed > 0.5 ? 1 : 0), nx = X(nb.s), ny = yW(nb.c);
      M.ring.position.set(nx, 0.004, 0); M.ring.scale.setScalar(0.07 + 0.06 * pulse); M.ring.material.opacity = 0.9 * nowA;
      M.beam.position.set(nx, 0, 0); M.beam.scale.y = Math.max(0.01, ny + 0.25); M.beam.material.opacity = (0.25 + 0.3 * pulse) * nowA;
      M.flare.position.set(nx, ny, 0.02); M.flare.scale.setScalar(0.16 + 0.08 * pulse); M.flare.material.opacity = 0.85 * nowA;
      if (pf) { M.pflare.position.set(pf.x, pf.y * sy + by, 0.03); M.pflare.material.color.copy(pf.up ? M.cUp : M.cDn); M.pflare.material.opacity = 0.6 * (1 - pf.gr); M.pflare.scale.setScalar(0.18 + 0.3 * (1 - pf.gr)); } else M.pflare.material.opacity = 0;
      // the laser crosshair (the overlay found the bar under the pointer last frame)
      const hb = S.hov >= 0 ? pa.bars[S.hov] : null;
      M.laserV.visible = M.laserH.visible = M.box.visible = !!hb;
      if (hb) { const bx = X(hb.s); M.laserV.position.set(bx, 0, zA + 0.03); M.laserH.position.set(0, yW(S.hovPrice), zA + 0.03); const yh = yW(hb.h), yl = yW(hb.l); M.box.scale.set(M.w * 2 + 0.03, Math.max(0.02, yh - yl + 0.03), M.d * 2 + 0.03); M.box.position.set(bx, (yh + yl) / 2, zA); }
      // the camera: the HUD orbit around the plane in focus, fitted to the screen; the SHOW flies its own path low along the bars
      const aspect = g.W / Math.max(1, g.H), vt = Math.tan(FOV / 2 * Math.PI / 180), ht = vt * aspect, cp = g.compact;
      const fitD = Math.max((M.Wc + (cp ? 2.2 : 2.6)) / 2 / ht, HY * (cp ? 1.6 : 2.0) / 2 / vt);
      if (fl && !H.calm) { cam.wp.set(fl.pos[0], fl.pos[1], fl.pos[2]); cam.wt.set(fl.tgt[0], fl.tgt[1], fl.tgt[2]); }
      else {
        const o = hudOrbit(st, { yaw0: 0.16, pitch0: -0.26, elev: cp ? 0.42 : 0.32, lo: 0.0, hi: 1.25, dist: fitD }), tg = [S.pan + (cp ? 0.7 : 0.45) * M.Wc / WC, HY * (cp ? 0.5 : 0.62), zA - 0.6], p = orbitPos(o.yaw + YAW0, o.pitch, o.dist, tg);
        cam.wt.set(tg[0], tg[1], tg[2]); cam.wp.set(p[0], p[1], p[2]);
      }
      if (cam.snap) { cam.p.copy(cam.wp); cam.t.copy(cam.wt); cam.snap = false; } else { const a = Math.min(1, dt * (show ? 2.2 : 3.2)); cam.p.lerp(cam.wp, a); cam.t.lerp(cam.wt, a); }
      camera.position.copy(cam.p); camera.lookAt(cam.t);
      S.cur = { key, e, ka, zA, lo, hi, yW, tf, pa, lastB, upNow, show };
    },
    overlay(ctx, g, api2, H2) { overlay(ctx, g, api, H, camera); },
    dispose() { clear(); },
  };
}

// ───────────────────────── the 2D overlay: toolbar, price scale and tags, time axis, day labels, crosshair readout, the readout block and the key ─────────────────────────
const FONT = '10px ui-monospace,monospace';
const msg = (ctx, g, text) => { ctx.save(); ctx.globalAlpha = g.fade; ctx.fillStyle = g.C.tx2; ctx.font = '13px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(text, g.W / 2, g.H / 2); ctx.restore(); };
const rr = (ctx, x, y, w, h) => { ctx.beginPath(); ctx.rect(x, y, w, h); };
const TAGS = Array.from({ length: 8 }, () => ({ y: 0, x: 0, text: '', col: '', solid: false, pri: 0 })), TY = new Array(8).fill(0);

/** The in-canvas toolbar: buttons that are drawn, highlighted under the pointer, and registered with g.hit so a click reaches chartCommand through st.sel. */
function toolbar(ctx, g, key) {
  const C = g.C, cp = g.compact; let x = cp ? 12 : 24; let y = S.top + (cp ? 6 : 12); const h = cp ? 28 : 26, gap = cp ? 8 : 12;
  const btn = (w, label, cmd, on) => {
    const hov = S.mx != null && S.mx >= x && S.mx <= x + w && S.my >= y && S.my <= y + h;
    rr(ctx, x, y, w, h); ctx.globalAlpha = (on ? 0.6 : 0.5) * g.fade; ctx.fillStyle = 'black'; ctx.fill(); ctx.globalAlpha = (on ? 0.3 : hov ? 0.2 : 0.08) * g.fade; ctx.fillStyle = C.blue; ctx.fill(); ctx.globalAlpha = (on ? 0.95 : 0.45) * g.fade; ctx.strokeStyle = C.blue; ctx.lineWidth = on ? 1.5 : 1; ctx.stroke();
    ctx.globalAlpha = (on ? 1 : 0.85) * g.fade; ctx.fillStyle = on ? C.tx : C.tx2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    g.hit(`cx:${cmd}`, x + w / 2, y + h / 2); x += w + 6;
  };
  ctx.save(); ctx.font = '11px ui-monospace,monospace';
  btn(26, '‹', 'mkp', false); btn(118, key ? marketName(key, { short: true }) : '...', 'mkn', true); btn(26, '›', 'mkn', false); x += gap;
  for (const t of TFS) btn(t === '1d' ? 30 : 38, TF_LABEL[t], `tf:${t}`, S.tf === t); x += gap;
  if (cp) { x = 12; y += h + 6; }                                                  // phone: a second row
  btn(66, S.replay ? '■ REPLAY' : '▶ REPLAY', 'replay', S.replay); btn(60, S.auto ? '■ AUTO' : '▶ AUTO', 'auto', S.auto); x += gap;
  btn(26, '◀', 'back', false); btn(54, 'DAYS', 'back', false); btn(26, '▶', 'fwd', false);
  ctx.restore();
}

function overlay(ctx, g, api, H, camera) {
  const st = api.st, C = g.C, cur = S.cur;
  if (g.t - S.topAt > 1) { S.topAt = g.t; try { const v = parseFloat(api.win?.getComputedStyle?.(api.$('cv').parentElement).getPropertyValue('--jvtop')); if (v > 0) S.top = v; } catch (x) { /* keep the default */ } }
  if (g.top > 0) S.top = 62;   // the HUD has shifted this view below its menus (the safe area): lay out as under the plain top bar
  if (!cur) { S.hov = -1; return msg(ctx, g, 'Reading the markets...'); }
  toolbar(ctx, g, cur.key);
  const e = cur.e;
  if (!e || e.status === 'loading') { S.hov = -1; return msg(ctx, g, `Reading ${marketName(cur.key)} bars...`); }
  if (e.status !== 'ok' || cur.pa == null) { S.hov = -1; return msg(ctx, g, `No price bars could be loaded for ${marketName(cur.key)} right now.`); }
  const { ka, zA, lo, hi, yW, tf, pa, lastB, upNow } = cur, M = { X: s => (s - (pa.slots - 1) / 2) * Math.min(0.26, WC / pa.slots) }, X = M.X, slots = pa.slots, Wc = slots * Math.min(0.26, WC / slots), xl = -Wc / 2 - 0.12, xr = Wc / 2 + 0.12;
  const P = (x, y, z) => H.toScreen([x, y, z], camera), ticks = S.ticks ?? [], dp = priceDecimals(hi, ticks.length > 1 ? ticks[1] - ticks[0] : 0), cp = g.compact, planes = e.planes, np = planes.length;
  const today = tf !== '1d' && dayOf(Date.now() / 1000) === dayOf(planes[0].date);
  ctx.save(); ctx.globalAlpha = g.fade; ctx.lineJoin = 'round';
  // day labels at the left foot of every sheet (phone: only the one in focus)
  ctx.font = FONT; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let k = np - 1; k >= 0; k--) {
    const al = planeAlpha(k, S.dolly) * (k > ka ? 0.6 : 1); if (al < 0.08 || (cp && k !== ka)) continue;
    const q = P(xl - 0.06, 0.04, -k * PZ); if (!q.vis) continue;
    let ph = -Infinity, pl = Infinity; for (const b of planes[k].bars) { if (b.h > ph) ph = b.h; if (b.l < pl) pl = b.l; } const off = `${ph > hi ? ' ▲' : ''}${pl < lo ? ' ▼' : ''}`;
    const lt = `${planes[k].label}${k === 0 ? (today ? ' · now' : ' · latest') : ''}${off ? `${off} off scale` : ''}`; ctx.globalAlpha = 0.9 * al * g.fade; ctx.fillStyle = k === ka ? C.tx : C.tx2; ctx.fillText(lt, Math.max(q.x, ctx.measureText(lt).width + 10), q.y);
  }
  // the right-hand price scale: value tags first (last, EMAs, usual band), pushed apart; round-number ticks where there is room
  let nt = 0; const tag = (p, text, col, solid, pri) => { if (!Number.isFinite(p) || nt >= TAGS.length) return; const q = P(xr, yW(p), zA); Object.assign(TAGS[nt++], { y: q.y, x: q.x, text, col, solid, pri }); };
  const li = ka === 0 ? clamp(Math.floor(S.printed - 0.5), 0, pa.bars.length - 1) : pa.bars.length - 1;
  if (ka !== 0 || S.printed > 0.5) tag(lastB.c, lastB.c.toFixed(dp), upNow ? C.up : C.dn, true, 9);
  if (!cp) { const v20 = e.e20[pa.bars[li].gi], v50 = e.e50[pa.bars[li].gi]; if (v20 != null) tag(v20, `EMA20 ${v20.toFixed(dp)}`, C.cy, false, 5); if (v50 != null) tag(v50, `EMA50 ${v50.toFixed(dp)}`, C.gold, false, 5); }
  if (e.band && ka === 0 && S.dolly < 1.2) { tag(e.band.hi, cp ? 'usual hi' : `usual high ${fmtPrice(e.band.hi)}`, C.blue, false, 3); tag(e.band.lo, cp ? 'usual lo' : `usual low ${fmtPrice(e.band.lo)}`, C.blue, false, 3); if (!cp) tag(e.band.open, `open ${fmtPrice(e.band.open)}`, C.gold, false, 2); }
  for (let i = 0; i < nt; i++) TY[i] = TAGS[i].y; const placed = spreadLabels(TY.slice(0, nt), 17, S.top + 50, g.H - 120);
  ctx.textAlign = 'left'; ctx.font = FONT;
  for (const p of ticks) { const q = P(xr, yW(p), zA); if (!q.vis || placed.some(y => Math.abs(y - q.y) < 12)) continue; ctx.globalAlpha = 0.5 * g.fade; ctx.strokeStyle = C.blue; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + 5, q.y); ctx.stroke(); ctx.globalAlpha = 0.85 * g.fade; ctx.fillStyle = C.tx2; ctx.fillText(p.toFixed(dp), q.x + 9, q.y); }
  for (let i = 0; i < nt; i++) {
    const b = TAGS[i], y = placed[i]; ctx.font = b.solid ? '600 11px ui-monospace,monospace' : FONT; const tw = ctx.measureText(b.text).width + 12, x = b.x + 8;
    if (Math.abs(y - b.y) > 1) { ctx.globalAlpha = 0.6 * g.fade; ctx.strokeStyle = b.col; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(x, y); ctx.stroke(); }
    ctx.globalAlpha = (b.solid ? 0.92 : 0.8) * g.fade; ctx.fillStyle = b.solid ? b.col : 'black'; rr(ctx, x, y - 8, tw, 16); ctx.fill(); if (!b.solid) { ctx.globalAlpha = 0.75 * g.fade; ctx.strokeStyle = b.col; ctx.stroke(); }
    ctx.globalAlpha = g.fade; ctx.fillStyle = b.solid ? 'black' : b.col; ctx.textBaseline = 'middle'; ctx.fillText(b.text, x + 6, y + 1);
    if (b.solid && !cp) { ctx.font = FONT; ctx.fillStyle = C.tx2; ctx.globalAlpha = 0.8 * g.fade; ctx.fillText(ka === 0 ? 'LAST' : 'CLOSE', x + tw + 6, y + 1); }
  }
  // the time axis along the foot of the plane in focus, and its date
  const qd = P(0, 0, zA), dl = `${pa.label}${ka === 0 ? (tf === '1d' ? ' (latest)' : today ? ' (today)' : ' (latest session)') : ''} · UTC`; ctx.font = '600 11px ui-monospace,monospace'; const dw = ctx.measureText(dl).width / 2 + 8;
  ctx.font = FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; let lastX = -1e9;
  for (const tk of timeTicks(pa)) { const q = P(X(tk.s), 0, zA); if (!q.vis) continue; const tw = ctx.measureText(tk.label).width; if (q.x - tw / 2 < lastX + 6 || (Math.abs(q.x - qd.x) < dw + tw / 2 && Math.abs(q.y - qd.y) < 30)) continue; lastX = q.x + tw / 2; ctx.globalAlpha = 0.5 * g.fade; ctx.strokeStyle = C.blue; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x, q.y + 4); ctx.stroke(); ctx.globalAlpha = 0.85 * g.fade; ctx.fillStyle = C.tx2; ctx.fillText(tk.label, q.x, q.y + 6); }
  if (qd.vis) { ctx.globalAlpha = 0.95 * g.fade; ctx.fillStyle = C.tx; ctx.font = '600 11px ui-monospace,monospace'; ctx.fillText(dl, qd.x, qd.y + 22); }
  // the crosshair: find the bar under the pointer on the plane in focus (the frame draws the lasers), then the tags and the floating OHLC readout
  S.hov = -1; const nb = Math.min(pa.bars.length, S.xs.length), hv = S.mx != null && !st.drag && !cur.show;
  if (hv) {
    for (let i = 0; i < nb; i++) S.xs[i] = P(X(pa.bars[i].s), 0, zA).x;
    const idx = nearestIndex(S.xs, ka === 0 ? Math.min(nb, Math.max(0, Math.floor(S.printed + 0.5))) : nb, S.mx, 36);
    if (idx >= 0) {
      const b = pa.bars[idx], q = P(X(b.s), 0, zA), q2 = P(X(b.s), HY, zA);
      if (S.my >= Math.min(q.y, q2.y) - 6 && S.my <= Math.max(q.y, q2.y) + 6) {
        const price = priceAtY(S.my, q.y, q2.y, lo, hi), chg = barChange(b), col = b.c >= b.o ? C.up : C.dn; S.hov = idx; S.hovPrice = price;
        const qr = P(xr, yW(price), zA); ctx.font = '600 10px ui-monospace,monospace'; const pt = price.toFixed(dp), pw = ctx.measureText(pt).width + 12;
        ctx.globalAlpha = 0.95 * g.fade; ctx.fillStyle = C.blue; ctx.fillRect(qr.x + 8, qr.y - 9, pw, 18); ctx.fillStyle = 'black'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(pt, qr.x + 14, qr.y + 1);
        const tt = fullTime(b.t, tf), tw = ctx.measureText(tt).width + 14; ctx.fillStyle = C.blue; ctx.fillRect(q.x - tw / 2, q.y + 36, tw, 18); ctx.fillStyle = 'black'; ctx.textAlign = 'center'; ctx.fillText(tt, q.x, q.y + 46);
        const lines = [[fullTime(b.t, tf), C.tx], [`O ${b.o.toFixed(dp)}   H ${b.h.toFixed(dp)}`, C.tx2], [`L ${b.l.toFixed(dp)}   C ${b.c.toFixed(dp)}`, C.tx2], [`${chg >= 0 ? '▲ +' : '▼ '}${chg.toFixed(2)}%  (close vs open)`, col]];
        const e20 = cp ? null : e.e20[b.gi], e50 = cp ? null : e.e50[b.gi]; if (e20 != null) lines.push([`EMA 20 ${e20.toFixed(dp)}`, C.cy]); if (e50 != null) lines.push([`EMA 50 ${e50.toFixed(dp)}`, C.gold]);
        ctx.font = '11px ui-monospace,monospace'; let bw = 0; for (const [t] of lines) bw = Math.max(bw, ctx.measureText(t).width); bw += 22; const bh = lines.length * 16 + 12;
        let bx2 = S.mx + 18, by2 = S.my + 16; if (bx2 + bw > g.W - 10) bx2 = S.mx - bw - 18; if (by2 + bh > g.H - 10) by2 = g.H - bh - 10;
        ctx.globalAlpha = 0.9 * g.fade; ctx.fillStyle = C.blue; ctx.fillRect(bx2, by2, 2, bh); rr(ctx, bx2 + 2, by2, bw, bh); ctx.fillStyle = 'black'; ctx.globalAlpha = 0.72 * g.fade; ctx.fill(); ctx.globalAlpha = 0.5 * g.fade; ctx.strokeStyle = C.blue; ctx.stroke();
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; lines.forEach(([t, c], i) => { ctx.globalAlpha = g.fade; ctx.fillStyle = c; ctx.fillText(t, bx2 + 12, by2 + 14 + i * 16); });
      }
    }
  }
  ctx.restore();
  readout(ctx, g, e, cur.key, tf, ka, np, today);
}

/** Top-left readout (title, the session's facts, the depth) and the key at the bottom. */
function readout(ctx, g, e, key, tf, ka, np, today) {
  const C = g.C, s = e.st, cp = g.compact, nf = e.planes[0].bars.length; ctx.save(); ctx.globalAlpha = g.fade; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const mv = `${s.movePct >= 0 ? '▲ +' : '▼ '}${s.movePct.toFixed(2)}%`;
  if (cp) {
    const y0 = S.top + 84; ctx.globalAlpha = 0.55 * g.fade; ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(6, y0 - 18, g.W - 12, e.note ? 58 : 42); ctx.globalAlpha = g.fade; ctx.fillStyle = C.tx; ctx.font = '600 14px ui-monospace,monospace'; ctx.fillText(`${marketName(key, { short: true })} · ${TF_WORD[tf]} candles`, 14, y0);
    ctx.font = '10px ui-monospace,monospace'; ctx.fillStyle = C.tx2; ctx.fillText(`last ${fmtPrice(s.last)} · plane ${ka + 1}/${np}`, 14, y0 + 16); ctx.fillStyle = s.movePct >= 0 ? C.up : C.dn; ctx.fillText(`${mv}${s.times != null && tf !== '1d' ? `, ${s.times.toFixed(1)}x usual` : ''}`, 14 + ctx.measureText(`last ${fmtPrice(s.last)} · plane ${ka + 1}/${np}  `).width, y0 + 16);
    if (e.note) { ctx.fillStyle = C.gold; ctx.fillText('Daily bars shown: no intraday data.', 14, y0 + 32); }
    const y = g.H - 98; [[C.up, '▲ up filled', 14], [C.dn, '▼ down hollow', 104], [C.cy, 'EMA20', 214], [C.gold, 'EMA50', 270]].forEach(([c, t, x]) => { ctx.globalAlpha = 0.95 * g.fade; ctx.fillStyle = c; ctx.fillText(t, x, y); });
    ctx.globalAlpha = 0.75 * g.fade; ctx.fillStyle = C.tx2; ctx.fillText('Past closes, not a forecast. Drag to orbit.', 14, y + 16); ctx.restore(); return;
  }
  const y0 = S.top + 62; ctx.globalAlpha = 0.55 * g.fade; ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(14, y0 - 20, 640, e.note ? 76 : 60); ctx.globalAlpha = g.fade; ctx.fillStyle = C.tx; ctx.font = '600 16px ui-monospace,monospace'; ctx.fillText(`${marketName(key)} · ${TF_WORD[tf]} candles`, 24, y0);
  ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = C.tx2;
  const span = tf === '1d' ? `the last ${nf} daily bars` : today ? "today's session so far" : 'the latest session';
  const head = `${span} · open ${fmtPrice(s.open)} · high ${fmtPrice(s.hi)} · low ${fmtPrice(s.lo)} · last ${fmtPrice(s.last)} `; ctx.fillText(head, 24, y0 + 18);
  ctx.fillStyle = s.movePct >= 0 ? C.up : C.dn; ctx.fillText(`${mv}${s.times != null && tf !== '1d' ? `, ${s.times.toFixed(1)}x its usual move` : ''}`, 24 + ctx.measureText(head).width, y0 + 18);
  ctx.fillStyle = C.tx2; ctx.fillText(`${np} ${tf === '1d' ? 'blocks of 22 days' : 'UTC days'} stacked in depth · plane ${ka + 1} of ${np} in focus${S.replay && S.printed < nf ? ` · printing ${Math.floor(S.printed)} / ${nf}` : ''}`, 24, y0 + 34);
  if (e.note) { ctx.fillStyle = C.gold; ctx.fillText(e.note, 24, y0 + 50); }
  // the key: one line of what each light means, one line of how to drive it
  const y = g.H - 46; let x = 24; ctx.font = '11px ui-monospace,monospace';
  for (const [c, t] of [[C.up, '▲ closed up: filled body'], [C.dn, '▼ closed down: hollow body'], [C.cy, 'EMA 20 tube'], [C.gold, 'EMA 50 tube'], [C.blue, e.band ? "glass slab: the market's usual high / low reach today (median)" : null], [C.tx, 'white beam: latest bar']]) {
    if (!t) continue; ctx.globalAlpha = 0.95 * g.fade; ctx.fillStyle = c; ctx.fillText(t, x, y); x += ctx.measureText(t).width + 18;
  }
  ctx.globalAlpha = 0.65 * g.fade; ctx.fillStyle = C.tx2; ctx.fillText('drag orbit · wheel zoom · hover for the crosshair · ◀ ▶ fly through the days · ▲▼ off scale: that day is cut at its sheet edge · EMAs average past closes · description only, not a forecast', 24, y + 17);
  ctx.restore();
}

let bound = null;
const view = glView({
  id: 'session', label: 'CANDLES', env: { accent: 'blue2', chrome: 'clean', scan: false }, setup,
  onEnter(api) {
    S.spin = api.st.spin; Object.assign(api.st, { yaw: 0.16, pitch: -0.26, zoom: 1, spin: false }); S.t0 = null; S.key = null; S.dolly = S.dollyT = 0; S.showP = -1; S.hov = -1;
    if (MARKET_KEYS.includes(api.st.sel)) loadChart(api.st.sel, S.tf, api); else loadVol(api);
    try {
      const cv = api.$('cv'), mv = ev => { const r = cv.getBoundingClientRect(); S.mx = ev.clientX - r.left; S.my = ev.clientY - r.top - (api.st.safeTop ?? 0); }, lv = () => { S.mx = S.my = null; };
      cv.addEventListener('pointermove', mv); cv.addEventListener('pointerleave', lv); bound = { cv, mv, lv };
    } catch (x) { /* no pointer readout; the chart still draws */ }
  },
  onLeave(api) { S.showP = -1; api.st.spin = S.spin ?? true; S.spin = null; S.replay = false; S.mx = S.my = null; S.hov = -1; if (bound) { bound.cv.removeEventListener('pointermove', bound.mv); bound.cv.removeEventListener('pointerleave', bound.lv); bound = null; } },
});

// the SHOW scene: the biggest mover's chart, measured facts only; the camera comes down from over the stack of days and rides low along the session's candles as they print
registerShowScene({
  id: 'session', after: 'candles',
  async prepare(api) { const inst = await loadVol(api), key = marketFor(null, inst); if (!key) return null; const e = await loadChart(key, '15m', api); return e?.status === 'ok' ? { key, mode: e.tf === '1d' ? 'daily' : 'intraday', st: e.st } : null; },
  build(inp, data) {
    if (!data?.st) return null; const text = sessionScript(data.key, data.st, data.mode); if (!text) return null;
    return { title: 'The chart', view: 'session', cam: null, text,
      enter(api) { api.st.sel = data.key; api.st.spin = false; S.key = null; S.tf = data.mode === 'daily' ? '1d' : '15m'; S.replay = false; S.t0 = null; S.dolly = S.dollyT = 0; S.showP = 0; S.showAt = Date.now(); },
      motion(api, p) { S.showP = clamp(p, 0, 1); S.showAt = Date.now(); } };
  },
});

registerJarvisModule({
  id: 'session', label: 'CANDLES', views: [view],
  render(pane, api) {
    const { esc, st } = api, cur = MARKET_KEYS.includes(st.sel) ? st.sel : 'NQ';
    pane.innerHTML = `<h3>CANDLES</h3><p>A 3D candlestick hologram: a price scale with a live last-price tag, a time axis, a laser crosshair, EMA 20 and EMA 50 light tubes (averages of past closes), the market's usual range as a glass slab behind, and every earlier day stacked behind as its own sheet that you can fly back through.</p>
<div class="jv-row"><label class="jv-sub">market <select data-s="mk">${MARKET_KEYS.map(k => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(marketName(k))}</option>`).join('')}</select></label>${TFS.map(t => `<button type="button" data-s="tf" data-t="${esc(t)}" aria-pressed="${t === S.tf}">${esc(TF_LABEL[t])}</button>`).join(' ')}</div>
<div class="jv-row"><button type="button" data-s="go">▶ OPEN THE CHART</button> <button type="button" data-s="replay">REPLAY</button> <button type="button" data-s="auto">AUTO DOLLY</button> <button type="button" data-s="back">◀ BACK A DAY</button> <button type="button" data-s="fwd">FORWARD ▶</button></div>
<p class="jv-sub">5 minute, 15 minute and hourly bars where the server can reach them, otherwise daily bars. Description only, never a forecast.</p>`;
    const go = () => { chartCommand(`mk:${pane.querySelector('[data-s="mk"]').value}`, api); api.setView('session'); };
    pane.querySelector('[data-s="go"]').onclick = go; pane.querySelector('[data-s="mk"]').onchange = go;
    pane.querySelectorAll('[data-s="tf"]').forEach(b => { b.onclick = () => { chartCommand(`tf:${b.dataset.t}`, api); pane.querySelectorAll('[data-s="tf"]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); if (st.view !== 'session') go(); }; });
    for (const c of ['replay', 'auto', 'back', 'fwd']) pane.querySelector(`[data-s="${c}"]`).onclick = () => { chartCommand(c, api); if (st.view !== 'session') api.setView('session'); };
  },
});
