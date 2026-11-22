// js/terminal/jarvisViewYields.js: Jarvis's YIELDS view: the US Treasury yield curve as a glowing 3D terrain through time, drawn by the hologram engine (jarvisGL.js, real bloom); labels on the HUD canvas.
// ENCODING: x = maturity (3 month to 30 year, log scale, left to right), z = time (the last 120 sessions flow toward you; the newest curve is the bright front edge with a curtain to the floor and a dot per
// maturity), height = yield (linear, from the window's low; the back wall carries the percent lines). Surface colour = the 2s10s slope of that session: cool when normal (40bp+), gold when flat, red when
// inverted (10Y below 2Y), brighter where yields are higher, older sessions fainter. A scan line runs from the oldest session to the newest and names the session it is on. Optional ribbons beyond the
// 30Y edge: the real 10 year, the Bund and the gilt (toggles at the bottom). The camera drifts slowly round the terrain (drag to turn, scroll to zoom; still under reduced motion).
// SHOW: a high look, then down LOW along the front edge (today's curve, short end to long end), then back through time: the terrain peels away session by session so each older curve becomes the front
// edge (today's curve rides along as a dashed ghost for comparison), then time runs forward again as the camera rises.
// Data: /api/chapters (FRED Treasury tenors m3..y30, real10/tips) and /api/intl-yields (de10y, gb10y). The maths lives in jarvisYieldsCore.js.
// DESCRIPTION ONLY: the shape of the curve through time, never a forecast. Also registers a SHOW scene and a small panel.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { glView, orbitPos } from './jarvisGL.js';
import { placeBox } from './gammaHoloCore.js';
import { keyLine } from './jarvisViewGammaPillar.js';
import { TENORS, T2, T10, T30, xOfYears, buildGrid, slopeBp, slopeMix, ribbonOn, curveStats, yieldsScript, dayWord, bpText, monoCurve, yieldsShowAct } from './jarvisYieldsCore.js';

const ID = 'yields', NT = TENORS.length, TTL = 30 * 60_000, XW = 6.4, ZD = 6.4, ZF = ZD / 2, YS = 2.8, SUB = 8, NC = (NT - 1) * SUB + 1;
const RIBS = [['real', 'REAL 10Y', 'up'], ['de', 'BUND 10Y', 'tx'], ['gb', 'GILT 10Y', 'cy']];
const S = { G: null, st: null, rib: { real: null, de: null, gb: null }, on: { real: true, de: false, gb: false }, status: 'loading', at: 0, busy: null, showP: -1, showAt: 0, spin: null };
const KEY = 'left to right = maturity, 3M to 30Y (log) · toward you = time, newest curve at the front · height = yield (back wall in %) · colour = 2s10s slope: cool normal (40bp+), gold flat, red inverted · description of the curve, not a forecast';
const KEY_PH = 'maturity across · time toward you, newest at front · height = yield · cool normal, gold flat, red inverted 2s10s · description, not a forecast';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const trip = a => { const o = []; for (let k = 0; k + 2 < a.length; k += 3) o.push([a[k], a[k + 1], a[k + 2]]); return o; };
const XS = TENORS.map(t => (xOfYears(t.years) - 0.5) * XW), YB = new Array(NT), CV = new Float32Array(NC * 2);

/** Load the curve (and the optional ribbons) once per 30 minutes. Never throws; S.status is 'loading' | 'ok' | 'fail'. */
export function loadYields(api, force) {
  if (S.busy) return S.busy; if (S.G && !force && Date.now() - S.at < TTL) return Promise.resolve(S.G);
  S.busy = (async () => {
    const ok = p => Promise.resolve(p).catch(() => null);
    const [ch, iy] = await Promise.all([ok(api.jf('/api/chapters')), ok(api.jf('/api/intl-yields'))]);
    let G = null; try { G = buildGrid(ch); } catch (e) { G = null; }
    if (G) { S.G = G; S.st = curveStats(G); S.at = Date.now(); S.status = 'ok'; S.rib.real = ribbonOn(G, ch?.series?.real10 ?? ch?.series?.tips); S.rib.de = ribbonOn(G, iy?.series?.de10y); S.rib.gb = ribbonOn(G, iy?.series?.gb10y); }
    else if (!S.G) S.status = 'fail';
    S.busy = null; return S.G;
  })();
  return S.busy;
}

/** The height range: every yield in the window and every ribbon we have (on or off, so a toggle never rescales the terrain), to the nearest quarter point. */
function axisRange(G) {
  let lo = 1e9, hi = -1e9; for (let i = 0; i < G.v.length; i++) { const v = G.v[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  for (const [k] of RIBS) { const a = S.rib[k]; if (a) for (let j = 0; j < G.n; j++) if (a[j] === a[j]) { if (a[j] < lo) lo = a[j]; if (a[j] > hi) hi = a[j]; } }
  return [Math.floor(lo * 4) / 4, Math.max(Math.floor(lo * 4) / 4 + 0.25, Math.ceil(hi * 4) / 4)];
}

function setup(L, H, api) {
  const { THREE } = L, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 200), kit = H.kit;
  let data = null, B = null, builtFor = null, deco = false;
  const cam = { p: new THREE.Vector3(0, 7, 12), t: new THREE.Vector3(0, 0.6, 0), wp: new THREE.Vector3(), wt: new THREE.Vector3(), init: false };
  const disposeGroup = g => g?.traverse(o => { o.geometry?.dispose?.(); const m = o.material; if (m) { kit._holo.delete(m); kit._mats.delete(m); if (!m.map) m.dispose?.(); } });
  const curveOf = (row, G, yOf, z, lift = 0) => { for (let i = 0; i < NT; i++) YB[i] = yOf(G.v[row * NT + i]); const n = monoCurve(XS, YB, SUB, CV), pts = new Float32Array(n * 3); for (let k = 0; k < n; k++) { pts[k * 3] = CV[k * 2]; pts[k * 3 + 1] = CV[k * 2 + 1] + lift; pts[k * 3 + 2] = z; } return pts; };

  function build(G, C) {
    if (data) { scene.remove(data); disposeGroup(data); } data = new THREE.Group(); scene.add(data);
    if (!deco) { deco = true; scene.add(kit.dust(900, 30, C.blue)); }
    const n = G.n, [lo, hi] = axisRange(G), span = hi - lo, yOf = v => (v - lo) / span * YS, zOf = j => ZF - ZD * (n - 1 - j) / Math.max(1, n - 1), x0 = XS[0], x1 = XS[NT - 1];
    const cCy = H.color(C.cy), cBlue = H.color(C.blue), cGold = H.color(C.gold), cDn = H.color(C.dn), cTx = H.color(C.tx), cTx2 = H.color(C.tx2), tmp = new THREE.Color();
    // the glass floor, its grid (a line along each maturity, a line every 20 sessions) and the back wall's percent lines
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(XW + 0.6, ZD + 0.6), new THREE.MeshBasicMaterial({ color: cBlue, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    fl.rotation.x = -Math.PI / 2; data.add(fl);
    const grid = []; for (const x of XS) grid.push([x, 0, ZF + 0.15, x, 0, -ZF - 0.05]); for (let j = n - 1; j >= 0; j -= 20) grid.push([x0 - 0.2, 0, zOf(j), x1 + 0.2, 0, zOf(j)]);
    data.add(kit.segments(grid, cBlue, 0.16));
    const ticks = []; for (let v = Math.ceil(lo * 2) / 2; v <= hi + 1e-6; v += 0.5) ticks.push(v);
    const wall = []; for (const v of ticks) { const y = yOf(v); wall.push([x0, y, -ZF - 0.02, x1, y, -ZF - 0.02], [x0 - 0.02, y, -ZF, x0 - 0.02, y, ZF]); } wall.push([x0, 0, -ZF, x0, YS, -ZF], [x1, 0, -ZF, x1, YS, -ZF]);
    data.add(kit.segments(wall, cBlue, 0.1));
    // the surface: per-vertex colour from that session's slope mix (cool / gold / red), brighter where higher, older rows fainter; indices are ordered oldest band first so a draw range can peel time
    const pos = new Float32Array(n * NT * 3), col = new Float32Array(n * NT * 3), mix = [];
    for (let j = 0; j < n; j++) {
      const m = slopeMix(slopeBp(G, j)); mix.push(m); const age = 0.12 + 0.88 * Math.pow(j / Math.max(1, n - 1), 1.6);
      for (let i = 0; i < NT; i++) {
        const k = j * NT + i, h = (G.v[k] - lo) / span; pos[k * 3] = XS[i]; pos[k * 3 + 1] = h * YS; pos[k * 3 + 2] = zOf(j);
        tmp.copy(cBlue).lerp(cCy, clamp(h * 1.4, 0, 1)); const b = age * (0.12 + 0.5 * h);
        col[k * 3] = (tmp.r * m.cool + cGold.r * m.gold + cDn.r * m.red) * b; col[k * 3 + 1] = (tmp.g * m.cool + cGold.g * m.gold + cDn.g * m.red) * b; col[k * 3 + 2] = (tmp.b * m.cool + cGold.b * m.gold + cDn.b * m.red) * b;
      }
    }
    const idx = []; for (let j = 0; j < n - 1; j++) for (let i = 0; i < NT - 1; i++) { const a = j * NT + i, b = a + 1, c = a + NT, d = c + 1; idx.push(a, c, b, b, c, d); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3)); sg.setIndex(idx);
    const surf = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); data.add(surf);
    // wireframe, also oldest first: a curve every 6 sessions (counted back from today) and a line along each maturity; segOff[j] = vertices drawn when row j is the front edge
    const wf = [], wc = [], segOff = new Int32Array(n), seg = (a, b, s = 1) => { wf.push(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2], pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]); wc.push(col[a * 3] * s, col[a * 3 + 1] * s, col[a * 3 + 2] * s, col[b * 3] * s, col[b * 3 + 1] * s, col[b * 3 + 2] * s); };
    for (let j = 0; j < n; j++) {
      if ((n - 1 - j) % 6 === 0) for (let i = 0; i < NT - 1; i++) seg(j * NT + i, j * NT + i + 1, 2.2);
      segOff[j] = wf.length / 3; if (j < n - 1) for (let i = 0; i < NT; i++) seg(j * NT + i, (j + 1) * NT + i, 1.3);
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wf, 3)); wg.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
    const wire = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })); data.add(wire);
    // the newest curve: a bright line, a curtain to the floor, drop lines and a dot per maturity (the 2Y, 10Y and 30Y carry a pulsing flare)
    const front = new THREE.Group(); data.add(front); const fp = curveOf(n - 1, G, yOf, ZF, 0.006);
    const fLine = kit.line(trip(fp), cCy, 3, 1); front.add(fLine);
    const cur = []; const cn = fp.length / 3; for (let k = 0; k < cn - 1; k++) { const ax = fp[k * 3], ay = fp[k * 3 + 1], bx = fp[k * 3 + 3], by = fp[k * 3 + 4]; cur.push(ax, ay, ZF, bx, by, ZF, ax, 0, ZF, bx, by, ZF, bx, 0, ZF, ax, 0, ZF); }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cur, 3));
    front.add(new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: cCy, transparent: true, opacity: 0.04, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })));
    const drops = []; for (let i = 0; i < NT; i++) { const y = pos[((n - 1) * NT + i) * 3 + 1]; drops.push([XS[i], y, ZF, XS[i], 0, ZF]); } front.add(kit.segments(drops, cCy, 0.28));
    const dots = kit.points(NT, cTx, 7, { opacity: 1 }), da = dots.geometry.attributes.position.array; for (let i = 0; i < NT; i++) { da[i * 3] = XS[i]; da[i * 3 + 1] = pos[((n - 1) * NT + i) * 3 + 1]; da[i * 3 + 2] = ZF; } front.add(dots);
    const flares = [T2, T10, T30].map(i => { const f = kit.flare(cCy, 0.3, 0.8); f.position.set(XS[i], pos[((n - 1) * NT + i) * 3 + 1], ZF); front.add(f); return f; });
    data.add(kit.segments([[x0 - 0.2, 0, ZF, x1 + 0.2, 0, ZF]], cTx2, 0.4));
    // ribbons beyond the 30Y edge (one Line2 per unbroken run), each in its own group so a toggle only flips visibility
    const ribs = {}; RIBS.forEach(([k, , tone], r) => {
      const a = S.rib[k]; if (!a) return; const grp = new THREE.Group(), xr = x1 + 0.4 + r * 0.26, c = H.color(C[tone]); let run = [];
      const flush = () => { if (run.length > 1) grp.add(kit.line(run, c, 2.2, 0.95)); run = []; };
      for (let j = 0; j < n; j++) { if (a[j] !== a[j]) { flush(); continue; } run.push([xr, yOf(a[j]), zOf(j)]); } flush();
      let last = n - 1; while (last > 0 && a[last] !== a[last]) last--; const f = kit.flare(c, 0.3, 0.9); f.position.set(xr, yOf(a[last]), zOf(last)); grp.add(f);
      data.add(grp); ribs[k] = { grp, xr, last };
    });
    // the moving line (the scan in the drift, the peeled front edge in the SHOW) and the dashed ghost of today's curve that rides with it
    const scan = kit.line(trip(fp), cTx, 2.4, 0.9); data.add(scan);
    const ghost = kit.line(trip(fp), cTx, 1.4, 0.45); ghost.material.dashed = true; ghost.material.dashSize = 0.09; ghost.material.gapSize = 0.07; ghost.material.needsUpdate = true; ghost.visible = false; data.add(ghost);
    const sliceDots = kit.points(NT, cTx, 6, { opacity: 0.95 }); sliceDots.visible = false; data.add(sliceDots);
    B = { G, n, lo, hi, span, yOf, zOf, x0, x1, ticks, surf, wire, segOff, front, flares, ribs, scan, ghost, sliceDots, scanRow: -1, peel: n - 1, mix, frontY: fp };
  }

  /** Put the moving line on row j (only when it changes); with ghost = true, today's curve rides along at the same depth, dashed. */
  function setScan(j, ghost) {
    if (!B || (B.scanRow === j && B.ghost.visible === ghost)) return; B.scanRow = j; const z = B.zOf(j), p = curveOf(j, B.G, B.yOf, z, 0.012);
    B.scan.geometry.setPositions(p); B.scan.computeLineDistances();
    B.ghost.visible = ghost; if (ghost) { const q = curveOf(B.n - 1, B.G, B.yOf, z, 0.012); B.ghost.geometry.setPositions(q); B.ghost.computeLineDistances(); }
    B.sliceDots.visible = ghost; if (ghost) { const a = B.sliceDots.geometry.attributes.position.array; for (let i = 0; i < NT; i++) { a[i * 3] = XS[i]; a[i * 3 + 1] = B.yOf(B.G.v[j * NT + i]) + 0.012; a[i * 3 + 2] = z; } B.sliceDots.geometry.attributes.position.needsUpdate = true; }
  }
  /** Peel time: draw only the sessions up to row j, so row j is the front edge. */
  function setPeel(j) {
    if (!B || B.peel === j) return; B.peel = j;
    B.surf.geometry.setDrawRange(0, j * 6 * (NT - 1)); B.wire.geometry.setDrawRange(0, B.segOff[j]); B.front.visible = j === B.n - 1;
    for (const k in B.ribs) { const r = B.ribs[k]; r.grp.children.forEach(o => { if (o.isSprite) o.visible = j >= r.last; }); }
  }
  const frontMidY = () => { if (!B) return 0.8; let s = 0; for (let i = 0; i < NT; i++) s += B.yOf(B.G.v[(B.n - 1) * NT + i]); return s / NT; };
  const rowMidY = j => { let s = 0; for (let i = 0; i < NT; i++) s += B.yOf(B.G.v[j * NT + i]); return s / NT; };

  return {
    scene, camera, bloom: { strength: 0.6, radius: 0.45, threshold: 0.14 },
    update(t, dt, a0, g) {
      const a = a0 ?? api, st = a.st;
      if (typeof st.sel === 'string' && st.sel.startsWith('yl:')) { const k = st.sel.slice(3); if (k in S.on) { S.on[k] = !S.on[k]; a.blip?.(780, 0.05); } st.sel = null; }
      if (!S.G) { loadYields(a); return; } if (Date.now() - S.at > TTL) loadYields(a);
      const sig = `${S.at}|${g.C.blue}|${g.C.cy}`; if (sig !== builtFor) { builtFor = sig; build(S.G, g.C); }
      for (const [k] of RIBS) if (B.ribs[k]) B.ribs[k].grp.visible = S.on[k];
      const n = B.n, aspect = g.W / Math.max(1, g.H), ph = aspect < 1, show = S.showP >= 0 && Date.now() - S.showAt < 1500, calm = H.calm;
      if (!calm) B.flares.forEach((f, i) => f.scale.setScalar(0.26 + 0.06 * Math.sin(t * 2.4 + i)));
      const fy = frontMidY(), zoom = st.zoom || 1;
      if (show) {
        // the SHOW: high look -> low along today's curve -> back through time (peel) -> forward again while rising
        const A = yieldsShowAct(S.showP, n), back = ph ? 2.2 : 1;
        setPeel(A.act === 'rewind' || A.act === 'return' ? A.slice : n - 1); setScan(A.act === 'rewind' || A.act === 'return' ? A.slice : n - 1, A.act === 'rewind' || A.act === 'return');
        if (A.act === 'over') { const o = orbitPos(-0.5 + 0.25 * A.k, 0.95 - 0.25 * A.k, (ph ? 18 : 11.5) - 1.5 * A.k, [0, 0.6, 0]); cam.wp.set(o[0], o[1], o[2]); cam.wt.set(0, 0.6, 0); }
        else if (A.act === 'front') { const k = A.k; cam.wp.set(-3.2 + 4.6 * k, fy + 0.75, ZF + 4.3 * back); cam.wt.set(-1.6 + 3.4 * k, fy * 0.8, ZF - 1); }
        else { const j = A.slice, z = B.zOf(j), y = rowMidY(j);
          if (A.act === 'rewind') { cam.wp.set(-3.5, y + 0.55, z + 3.1 * back); cam.wt.set(0.6, y * 0.85, z - 1); }
          else { const k = A.k, o = orbitPos(0.3, 0.2 + 0.5 * k, (ph ? 9 : 5) + (ph ? 8 : 6) * k, [0, 0.6, 0]); cam.wp.set(o[0], o[1], o[2] + (1 - k) * z); cam.wt.set(0.3 * (1 - k), 0.6, z * (1 - k)); } }
      } else {
        setPeel(n - 1);
        // the drift: the scan walks oldest -> newest (frozen on the newest under reduced motion); the camera orbits slowly round the terrain
        setScan(calm ? n - 1 : Math.floor((t * 14) % (n + 20)) % n, false); B.scan.visible = calm ? false : Math.floor((t * 14) % (n + 20)) < n;
        const yaw = (st.yaw - 0.35) + (calm ? 0 : Math.sin(t * 0.05) * 0.42), el = clamp((ph ? 0.6 : 0.42) - (st.pitch + 0.45) * 0.8, 0.06, 1.35), d = (ph ? 23 : 10.5) / zoom;
        const o = orbitPos(yaw, el, d, [0, 0.6, 0]); cam.wp.set(o[0], o[1], o[2]); cam.wt.set(0, 0.6, 0);
      }
      if (show) B.scan.visible = true;
      if (!cam.init) { cam.p.copy(cam.wp); cam.t.copy(cam.wt); cam.init = true; }
      const k = Math.min(1, dt * (show ? 2.6 : 3)); cam.p.lerp(cam.wp, k); cam.t.lerp(cam.wt, k); camera.position.copy(cam.p); camera.lookAt(cam.t);
    },
    overlay(ctx, g, a) { overlay(ctx, g, a ?? api, H, camera, B); },
    dispose() { disposeGroup(scene); },
  };
}

// ───────────────────────── the 2D overlay: the readout, labels on the terrain, the ribbon toggles and the key ─────────────────────────
function overlay(ctx, g, api, H, camera, B) {
  const { W, H: Hh, C, fade } = g, cp = g.compact; ctx.save(); ctx.globalAlpha = fade; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const font = (px, w = '') => { ctx.font = `${w}${px}px ui-monospace,monospace`; };
  const msg = s => { font(13); ctx.fillStyle = C.tx2; ctx.textAlign = 'center'; ctx.fillText(s, W / 2, Hh / 2); ctx.textAlign = 'left'; };
  if (!S.G || !B) { msg(S.status === 'fail' ? 'The Treasury yield history could not be loaded right now.' : 'Reading the yield curve...'); ctx.restore(); return; }
  const G = B.G, st = S.st, n = B.n, Sc = p => H.toScreen(p, camera), taken = [], bg = 'rgba(0,0,0,0.66)', show = S.showP >= 0 && Date.now() - S.showAt < 1500;
  const bounds = { x0: 4, y0: cp ? 124 : 96, x1: W - 4, y1: Hh - (cp ? 200 : 128) };
  const draw = (r, text, col, px, w) => { font(px, w); ctx.fillStyle = bg; ctx.globalAlpha = fade * 0.9; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = fade; ctx.fillStyle = col; ctx.fillText(text, r.x + 4, r.y + px + 1); };
  const label = (p, text, col, px, w, cands) => { if (!p.vis) return null; font(px, w); const bw = ctx.measureText(text).width + 8, bh = px + 6; const r = placeBox(cands.map(([dx, dy]) => ({ x: p.x + dx(bw), y: p.y + dy(bh), w: bw, h: bh })), taken, bounds); if (r) draw(r, text, col, px, w); return r; };
  const right = () => 10, left = w => -10 - w, mid = w => -w / 2, up = h => -h - 8, down = () => 8, cen = h => -h / 2;
  const toneOf = s => (s < 0 ? C.dn : Math.abs(s) < 10 ? C.gold : C.cy);
  // the readout, top left
  if (st) {
    const tone = st.inverted ? C.dn : st.flat ? C.gold : C.cy, word = st.inverted ? 'INVERTED' : st.flat ? 'ABOUT FLAT' : 'NORMAL';
    if (cp) {
      font(15, '600 '); ctx.fillStyle = tone; ctx.fillText(`2s10s ${bpText(st.s)} ${st.inverted ? '▼' : st.flat ? '•' : '▲'} ${word}`, 14, 96);
      font(10); ctx.fillStyle = C.tx2; ctx.fillText(`2Y ${st.y2.toFixed(2)}% · 10Y ${st.y10.toFixed(2)}% · 30Y ${st.y30.toFixed(2)}% · ${dayWord(st.asOf)}`, 14, 112); taken.push({ x: 8, y: 80, w: W - 16, h: 40 });
    } else {
      const x = 24, y = 118; ctx.fillStyle = bg; ctx.fillRect(x - 10, y - 18, 300, 178);
      font(10); ctx.fillStyle = C.tx2; ctx.fillText(`US TREASURY CURVE  ·  as of ${dayWord(st.asOf)}`, x, y);
      font(22, '600 '); ctx.fillStyle = tone; ctx.fillText(`2s10s ${bpText(st.s)}`, x, y + 28); font(11, '600 '); ctx.fillText(`${st.inverted ? '▼' : st.flat ? '•' : '▲'} ${word}`, x + 168, y + 27);
      font(11); [['2Y', st.y2, st.d2], ['10Y', st.y10, st.d10], ['30Y', st.y30, st.d30]].forEach(([nm, v, d], i) => { const yy = y + 52 + i * 17; ctx.fillStyle = C.tx2; ctx.fillText(nm, x, yy); ctx.fillStyle = C.tx; ctx.fillText(`${v.toFixed(2)}%`, x + 40, yy); ctx.fillStyle = d > 0 ? C.up : d < 0 ? C.dn : C.tx2; ctx.fillText(`${d > 0 ? '▲' : d < 0 ? '▼' : '•'} ${bpText(d)} over ${st.sessions} sessions`, x + 102, yy); });
      ctx.fillStyle = C.tx2; ctx.fillText(`2s10s was ${bpText(st.s0)}, now ${bpText(st.s)}  (${bpText(st.ds)})`, x, y + 112); ctx.fillText(`inverted on ${st.invDays} of ${st.n} sessions shown`, x, y + 129);
      [[C.cy, 'normal'], [C.gold, 'flat'], [C.dn, 'inverted']].forEach(([c, tx], i) => { const xx = x + i * 92, yy = y + 148; ctx.fillStyle = c; ctx.fillRect(xx, yy - 8, 10, 10); ctx.fillStyle = C.tx2; ctx.fillText(tx, xx + 15, yy); });
      taken.push({ x: x - 10, y: y - 18, w: 300, h: 178 });
    }
  }
  // the session the moving line is on (the peeled front edge in the SHOW), with today's curve named as the dashed ghost
  if (B.scan.visible && B.scanRow >= 0 && B.scanRow < n) {
    const j = B.scanRow, s = slopeBp(G, j), p = Sc([B.x1, B.yOf(G.v[j * NT + NT - 1]), B.zOf(j)]);
    label(p, `${dayWord(G.dates[j])} · 2s10s ${bpText(s)}`, show ? toneOf(s) : C.tx, show ? 13 : 11, '600 ', [[right, cen], [right, up], [left, up]]);
    if (B.ghost.visible && j < n - 1) label(Sc([B.x1, B.yOf(G.v[(n - 1) * NT + NT - 1]), B.zOf(j)]), `dashed = today ${dayWord(G.dates[n - 1])} ${bpText(slopeBp(G, n - 1))}`, C.tx2, 11, '', [[right, up], [right, down], [left, up], [left, down]]);
  }
  // today's curve: a value over each dot (2Y / 10Y / 30Y first, all of them on a desktop), the maturity on the floor
  if (B.front.visible) {
    const order = [T2, T10, T30, ...TENORS.map((_, i) => i).filter(i => i !== T2 && i !== T10 && i !== T30)];
    for (const i of order) { if (cp && i !== T2 && i !== T10 && i !== T30) continue; const v = G.v[(n - 1) * NT + i], key = i === T2 || i === T10 || i === T30; label(Sc([XS[i], B.yOf(v), ZF]), v.toFixed(2), key ? C.tx : C.tx2, key ? 12 : 11, key ? '600 ' : '', [[mid, up], [mid, h => -h - 22]]); }
    for (let i = 0; i < NT; i++) { if (cp && i % 2 && i !== T10) continue; label(Sc([XS[i], 0, ZF + 0.12]), TENORS[i].label, C.tx2, 11, '', [[mid, down], [mid, () => 22]]); }
  }
  // the ribbons' newest values
  RIBS.forEach(([k, nm, tone]) => { const r = B.ribs[k]; if (!r || !S.on[k] || (B.peel < r.last)) return; const a = S.rib[k]; label(Sc([r.xr, B.yOf(a[r.last]), B.zOf(r.last)]), cp ? a[r.last].toFixed(2) : `${nm} ${a[r.last].toFixed(2)}`, C[tone], 11, '', [[right, cen], [right, up], [right, down]]); });
  // dates down the left edge, percent on the back wall
  for (const j of cp ? [0, n - 1] : [0, Math.round((n - 1) / 3), Math.round((n - 1) * 2 / 3), n - 1]) if (j <= B.peel) label(Sc([B.x0 - 0.15, 0, B.zOf(j)]), j === n - 1 ? `TODAY ${dayWord(G.dates[j])}` : dayWord(G.dates[j]), j === n - 1 ? C.tx : C.tx2, 11, j === n - 1 ? '600 ' : '', [[left, cen], [left, down], [left, up]]);
  for (const v of B.ticks) if (!cp || Math.abs(v - Math.round(v)) < 1e-6) label(Sc([B.x0 - 0.06, B.yOf(v), -ZF]), `${v.toFixed(1)}%`, C.tx2, 10, '', [[left, cen]]);
  // ribbon toggles above the key
  const kt = cp ? KEY_PH : KEY; font(11); const lines = keyLines(ctx, kt, W - 24), keyTop = Hh - (cp ? 96 : 70) - (lines - 1) * 14 - 13;
  const bw = cp ? Math.min(96, (W - 28) / 3 - 6) : 100, bh = cp ? 28 : 20, by = keyTop - bh / 2 - 10, bx0 = cp ? (W - (bw * 3 + 12)) / 2 : 170;
  font(10); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  RIBS.forEach(([k, nm, tone], r) => {
    const have = !!S.rib[k], on = have && S.on[k], x = bx0 + r * (bw + (cp ? 6 : 10));
    ctx.globalAlpha = fade * 0.85; ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(x, by - bh / 2, bw, bh);
    ctx.globalAlpha = (have ? 0.9 : 0.35) * fade; ctx.strokeStyle = C[tone]; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, by - bh / 2 + 0.5, bw - 1, bh - 1);
    if (on) { ctx.globalAlpha = 0.25 * fade; ctx.fillStyle = C[tone]; ctx.fillRect(x + 1, by - bh / 2 + 1, bw - 2, bh - 2); }
    ctx.globalAlpha = (have ? 0.95 : 0.4) * fade; ctx.fillStyle = C.tx; ctx.fillText(have ? `${on ? '■' : '□'} ${nm}` : `${nm} n/a`, x + bw / 2, by + 1); if (have) g.hit(`yl:${k}`, x + bw / 2, by);
  });
  ctx.textBaseline = 'alphabetic';
  if (!cp) { ctx.textAlign = 'right'; ctx.fillStyle = C.tx2; ctx.globalAlpha = 0.75 * fade; ctx.fillText('ribbons beyond 30Y:', bx0 - 10, by + 4); }
  ctx.textAlign = 'left'; ctx.globalAlpha = fade; keyLine(ctx, g, kt);
  ctx.restore();
}
/** How many lines keyLine will wrap `text` into (same rule), so the toggles sit just above it. */
function keyLines(ctx, text, maxW) { let n = 1, cur = ''; for (const w of text.split(' ')) { const nx = cur ? `${cur} ${w}` : w; if (ctx.measureText(nx).width > maxW && cur) { n++; cur = w; } else cur = nx; } return n; }

const view = glView({ id: ID, label: 'YIELDS', env: { accent: 'pur', chrome: 'clean', scan: false }, setup,
  onEnter: api => { S.showP = -1; S.spin = api.st.spin; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); loadYields(api); },
  onLeave: api => { S.showP = -1; if (S.spin != null) api.st.spin = S.spin; S.spin = null; } });

registerJarvisModule({
  id: 'yields', label: 'YIELDS',
  render(pane, api) {
    pane.innerHTML = `<h3>YIELDS</h3><p>The US Treasury curve as a flowing 3D terrain. Maturity runs left to right, the last 120 sessions flow toward you and the height is the yield. The surface is coloured by the 2s10s slope of each session: cool when normal, gold when flat, red when inverted. The bright line is the newest curve.</p>
<div class="jv-row"><button type="button" data-y="go">▶ FLY OVER THE CURVE</button></div><p class="jv-sub">Real 10 year, Bund and gilt ribbons are optional. A description of the curve's shape, never a forecast.</p>`;
    pane.querySelector('[data-y="go"]').onclick = () => { api.setView('yields'); loadYields(api, true); };
  },
  views: [view],
});

registerShowScene({
  id: 'yields', after: 'chain',
  prepare: api => loadYields(api).then(() => S.st).catch(() => null),
  build: (inp, data) => {
    const text = data ? yieldsScript(data) : null; if (!text) return null;
    return { title: 'The yield curve', view: 'yields', cam: null, text, enter: api => { Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); S.showP = 0; S.showAt = Date.now(); }, motion: (api, p) => { S.showP = clamp(p, 0, 1); S.showAt = Date.now(); } };
  },
});
