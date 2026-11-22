// js/terminal/jarvisViewVolSurface.js: Jarvis's VOL SURFACE hologram. The implied-volatility surface of one market as a glowing landscape on a projector floor:
// x = strike distance from spot in percent (puts left, calls right, a bright floor line at spot), z = expiry (nearest at the FRONT, rows evenly spaced and labelled in days), y = implied vol.
// ENCODING: height = implied vol measured from zero (one fixed scale per market, so a morph through time is honest); surface colour = the same vol on a sequential ramp from the view accent (low) to
// gold (high), white tips = above the scale top (capped, and the key says so); a translucent fill under a wireframe (bright lines = each expiry's smile, faint = the same strike across expiries);
// a white glowing SPINE runs along the expiry axis at the money (the term structure); two ribbons ride the surface at the 25-delta strikes: red on the put side (left), green on the call side (right),
// so colour AND side say which wing is which; floating labels give the ATM vol at the nearest and farthest expiry and the put-call skew sits in the readout.
// Where history exists, the surface MORPHS from the earliest snapshot to today and a faint grey ghost of that earliest surface stays visible, so the change can be seen; < > step through time.
// Data (never mixed in one surface):
//   /api/replay/smile?sym=..            (js/smileRoutes.js) Cboe chains: the held days, then ?date= one end-of-day chain reduced to the 4 nearest expiries' smiles (index markets + gold via GLD).
//   /api/oi-store                       (js/oi.js) the CME capture: ivSmile (+ivPrior = the previous settlement), ivSmiles (near chains), ivTermStructure.points (far expiries, ATM only = spine only).
// The maths lives in ivSurfaceCore.js. DESCRIPTION ONLY: what options are pricing now, never a forecast.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene, spoken } from './showCore.js';
import { glView, ease } from './jarvisGL.js';
import { IV_MARKETS, NC, MAX_ROWS, fromCboeFrame, fromOiEntry, oiHasIV, pickRange, pickScale, buildSurface, lerpSurface, surfaceFacts, ivScript, recentDays, dteText, dayLabel, volTicks } from './ivSurfaceCore.js';

const ID = 'ivsurf', XW = 3.1, ZD = 2.1, HY = 2.3, NR = MAX_ROWS, NV = NR * NC, TTL = 600_000, MORPH = 1.5, HOLD = 0.9;
const COLSTEP = 4, NCOL = Math.floor((NC - 1) / COLSTEP) + 1;
const S = {
  status: 'idle', busy: null, at: 0, store: null, held: new Map(), list: [], key: null,
  mk: new Map(), cur: null,                    // key -> { status, src, surfs, top, range, nRows, facts, ... } ; cur = the one drawn
  from: 0, to: 0, k: 1, hold: 0, play: false, showP: -1, showAt: 0, dirty: true, spin: null, built: null, bg: 'black',
};
const OUT = { rows: [] };                      // the blended surface, reused every frame
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ok = p => Promise.resolve(p).then(j => (j && j.ok !== false && !j.error ? j : null)).catch(() => null);
const spokenSafe = (k, fb) => { try { return spoken(k) || fb; } catch (e) { return fb; } };
const metaOf = k => IV_MARKETS.find(m => m.key === k) ?? null;

// ───────────────────────── data ─────────────────────────
/** Which markets have implied vol to draw: a Cboe history where the replay archive holds days for the market's symbol, else the CME capture. Never throws. */
export function loadIndex(api, force) {
  if (S.busy) return S.busy; if (S.status === 'ok' && !force && Date.now() - S.at < TTL) return Promise.resolve(S.list);
  S.status = S.status === 'ok' ? 'ok' : 'loading';
  S.busy = (async () => {
    const syms = IV_MARKETS.filter(m => m.sym);
    const [oi, ...hs] = await Promise.all([ok(api.jf('/api/oi-store')), ...syms.map(m => ok(api.jf(`/api/replay/smile?sym=${m.sym}`)))]);
    S.store = oi?.data ?? (oi && typeof oi === 'object' ? oi : null); S.held.clear();
    syms.forEach((m, i) => { const d = recentDays(hs[i]?.days); if (d.length) S.held.set(m.sym, hs[i].days); });
    S.list = IV_MARKETS.map(m => (m.sym && S.held.has(m.sym) ? { ...m, src: 'cboe' } : oiHasIV(S.store?.[m.pair]) ? { ...m, src: 'cme' } : null)).filter(Boolean);
    S.mk.clear(); S.status = S.list.length ? 'ok' : (S.store || S.held.size ? 'empty' : 'fail'); S.at = Date.now(); S.busy = null; return S.list;
  })();
  return S.busy;
}

/** One market's snapshots on a shared grid (cached). Cboe: the last 6 held days; CME: the previous settlement (where stored) and the latest capture. */
function loadMarket(api, key) {
  if (S.mk.has(key)) return S.mk.get(key).p;
  const m = S.list.find(x => x.key === key); if (!m) return Promise.resolve(null);
  const e = { status: 'loading', key, label: m.label, p: null };
  e.p = (async () => {
    let snaps = [], src = m.src, note = '';
    if (src === 'cboe') {
      const days = recentDays(S.held.get(m.sym), 6), got = await Promise.all(days.map(d => ok(api.jf(`/api/replay/smile?sym=${m.sym}&date=${d}`))));
      snaps = got.map((j, i) => (j?.frames?.[0] ? fromCboeFrame(j.frames[0], dayLabel(days[i])) : null)).filter(s => s && s.rows.length);
      note = `Cboe ${m.sym} chain · ${snaps[snaps.length - 1]?.rows.length ?? 0} nearest expiries (all the archive keeps)`;
      if (!snaps.length && oiHasIV(S.store?.[m.pair])) src = 'cme';
    }
    if (src === 'cme') {
      const { now, prior } = fromOiEntry(S.store?.[m.pair], 'latest capture'); snaps = [prior, now].filter(Boolean);
      const smiles = now?.rows.filter(r => !r.atmOnly).length ?? 0, atmO = (now?.rows.length ?? 0) - smiles;
      note = `CME settlement · ${smiles} expir${smiles === 1 ? 'y' : 'ies'} with a smile${atmO ? `, ${atmO} further at the money only` : ''}`;
    }
    if (!snaps.length) { e.status = 'none'; return e; }
    const range = pickRange(snaps), top = pickScale(snaps, range), surfs = snaps.map(s => buildSurface(s, range));
    Object.assign(e, { status: 'ok', src, note, range, top, surfs, nRows: Math.min(NR, Math.max(...surfs.map(s => s.rows.length))), facts: surfaceFacts(surfs[surfs.length - 1]),
      capped: surfs.some(s => s.rows.some(r => r.iv.some(v => v != null && v > top) || (r.atm ?? 0) > top)) });
    return e;
  })().catch(() => { e.status = 'none'; return e; });
  S.mk.set(key, e); return e.p;
}

const pickStart = api => { const sel = api.st?.sel; return S.list.some(m => m.key === sel) ? sel : S.list[0]?.key ?? null; };
function select(api, key, calm) {
  S.key = key; S.cur = null; S.dirty = true;
  loadMarket(api, key).then(e => {
    if (S.key !== key || !e || e.status !== 'ok') { if (S.key === key) S.cur = e; return; }
    S.cur = e; S.built = null; const last = e.surfs.length - 1;
    if (calm || last === 0) { S.from = S.to = last; S.k = 1; S.play = false; } else { S.from = 0; S.to = Math.min(1, last); S.k = 0; S.hold = 0.6; S.play = true; }
    S.dirty = true;
  });
}
const stepMarket = (api, d, calm) => { const n = S.list.length; if (!n) return; const i = S.list.findIndex(m => m.key === S.key); select(api, S.list[(Math.max(0, i) + d + n) % n].key, calm); };
const stepTime = d => { const e = S.cur; if (!e?.surfs) return; const nx = clamp(S.to + d, 0, e.surfs.length - 1); if (nx === S.to) return; S.from = S.to; S.to = nx; S.k = 0; S.hold = 0; S.play = false; S.dirty = true; };

// ───────────────────────── the hologram ─────────────────────────
function setup(L, H, api) {
  const { THREE } = L, kit = H.kit, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  const dust = kit.dust(700, 34, 'white'); dust.material.opacity = 0.35; scene.add(dust);
  const xOf = j => -XW + (2 * XW * j) / (NC - 1), zOf = (i, n) => (n <= 1 ? 0 : ZD - (2 * ZD * i) / (n - 1));
  const ACC = new THREE.Color('white'), GOLD = new THREE.Color('white'), HOT = new THREE.Color('white'), TMP = new THREE.Color(); let cKey = '';
  const ramp = (v, top, out) => { if (v > top) return out.copy(HOT); const p = clamp(v / top, 0, 1); out.copy(ACC).multiplyScalar(0.45 + 0.35 * p).lerp(GOLD, p * p); return out; };

  // surface fill: fixed grid NR x NC; a cell quad is drawn only where all four corners were quoted (vertex flag 'ok')
  const pos = new Float32Array(NV * 3), col = new Float32Array(NV * 3), okA = new Float32Array(NV), idx = [];
  for (let i = 0; i < NR - 1; i++) for (let j = 0; j < NC - 1; j++) { const a = i * NC + j, b = a + 1, c = a + NC, d = c + 1; idx.push(a, c, b, b, c, d); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3)); sg.setAttribute('ok', new THREE.BufferAttribute(okA, 1)); sg.setIndex(idx);
  const fill = new THREE.Mesh(sg, new THREE.ShaderMaterial({
    uniforms: { op: { value: 0.13 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute vec3 color; attribute float ok; varying vec3 vC; varying float vOk; varying float vY; void main(){ vC = color; vOk = ok; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float op; varying vec3 vC; varying float vOk; varying float vY; void main(){ if (vOk < 0.999) discard; float a = op * (0.55 + 0.45 * clamp(vY / 2.3, 0.0, 1.0)); gl_FragColor = vec4(vC, a); }',
  }));
  fill.frustumCulled = false; scene.add(fill);
  // wireframe: each expiry's smile (bright) and every 4th strike column across expiries (faint)
  const segs = (n, opacity) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    const o = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })); o.frustumCulled = false; return o; };
  const wRow = segs(NR * (NC - 1), 0.95), wCol = segs(NCOL * (NR - 1), 0.4), ghost = segs(NR * (NC - 1) + NR, 0.5), drops = segs(NR, 0.35), curtain = segs(NC, 0.28);   // curtain: the nearest smile dropped to the floor, so its height reads
  scene.add(wRow, wCol, ghost, drops, curtain);
  const putSeg = (o, s, a, b, ca, cb) => { const P = o.geometry.attributes.position.array, Cc = o.geometry.attributes.color.array, k = s * 6; P[k] = a[0]; P[k + 1] = a[1]; P[k + 2] = a[2]; P[k + 3] = b[0]; P[k + 4] = b[1]; P[k + 5] = b[2]; Cc[k] = ca.r; Cc[k + 1] = ca.g; Cc[k + 2] = ca.b; Cc[k + 3] = cb.r; Cc[k + 4] = cb.g; Cc[k + 5] = cb.b; };
  const ZERO = [0, -60, 0], BLK = new THREE.Color().setScalar(0), A3 = Array(3).fill(0), B3 = Array(3).fill(0);
  const vtx = (i, j, out) => { const k = (i * NC + j) * 3; out[0] = pos[k]; out[1] = pos[k + 1]; out[2] = pos[k + 2]; return out; };
  const vcol = (i, j, out) => { const k = (i * NC + j) * 3; return out.setRGB(col[k], col[k + 1], col[k + 2]); };
  const C1 = new THREE.Color(), C2 = new THREE.Color();
  // the ATM spine (term structure) and the 25-delta wing ribbons
  const pad = n => Array.from({ length: n }, (_, i) => [0, 0, i * 0.001]);
  const spine = kit.line(pad(NR), 'white', 3.2, 0.95), wPut = kit.line(pad(NR), 'white', 4.2, 0.95), wCall = kit.line(pad(NR), 'white', 4.2, 0.95);
  scene.add(spine, wPut, wCall);
  const fl = (c, s, o) => { const f = kit.flare(c, s, o); f.visible = false; scene.add(f); return f; };
  const atmF = Array.from({ length: NR }, () => fl('white', 0.22, 0.8)), putF = Array.from({ length: NR }, () => fl('white', 0.16, 0.7)), callF = Array.from({ length: NR }, () => fl('white', 0.16, 0.7));
  // world anchors for the overlay labels (reused)
  const A = { atm: Array.from({ length: NR }, () => Array(3).fill(0)), put: Array.from({ length: NR }, () => Array(3).fill(0)), call: Array.from({ length: NR }, () => Array(3).fill(0)), atmV: new Float64Array(NR), putV: new Float64Array(NR), callV: new Float64Array(NR), has: new Uint8Array(NR * 3), n: 0, ghost: false };
  let frame = null;                            // the floor grid + vol scale for the current market (rebuilt on market change)

  function buildFrame(e, C) {
    if (frame) { scene.remove(frame); frame.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }
    frame = new THREE.Group(); const fg = [], n = e.nRows, acc = C.blue;
    for (let q = -4; q <= 4; q++) { if (q === 0) continue; const x = (q / 4) * XW; fg.push([x, 0, ZD + 0.25, x, 0, -ZD - 0.25]); }
    for (let i = 0; i < n; i++) { const z = zOf(i, n); fg.push([-XW, 0, z, XW, 0, z]); }
    fg.push([-XW, 0, ZD + 0.25, XW, 0, ZD + 0.25], [-XW, 0, -ZD - 0.25, XW, 0, -ZD - 0.25]);
    frame.add(kit.segments(fg, acc, 0.16));
    frame.add(kit.segments([[0, 0.002, ZD + 0.45, 0, 0.002, -ZD - 0.35]], C.tx, 0.55));              // the spot line on the floor
    const wall = [], zb = -ZD - 0.35, xl = -XW - 0.3;
    for (const v of volTicks(e.top)) { const y = (v / e.top) * HY; wall.push([xl, y, zb, XW, y, zb], [xl - 0.12, y, zb, xl, y, zb]); }
    wall.push([xl, 0, zb, xl, HY, zb]);
    frame.add(kit.segments(wall, acc, 0.13));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(XW * 1.45, 72), kit.glowDisc(acc, 0.16)); disc.rotation.x = -Math.PI / 2; disc.position.y = -0.01; frame.add(disc);
    scene.add(frame);
  }

  function write(cur, e, gsurf) {
    const n = e.nRows, top = e.top, yOf = v => (Math.min(v, top) / top) * HY;
    for (let i = 0; i < NR; i++) {
      const r = i < n ? cur.rows[i] : null, z = zOf(i, n);
      for (let j = 0; j < NC; j++) {
        const k = i * NC + j, v = r?.iv[j], good = v != null; okA[k] = good ? 1 : 0;
        pos[k * 3] = xOf(j); pos[k * 3 + 1] = good ? yOf(v) : 0; pos[k * 3 + 2] = z;
        ramp(good ? v : 0, top, TMP); col[k * 3] = TMP.r; col[k * 3 + 1] = TMP.g; col[k * 3 + 2] = TMP.b;
      }
    }
    sg.attributes.position.needsUpdate = true; sg.attributes.color.needsUpdate = true; sg.attributes.ok.needsUpdate = true; sg.computeBoundingSphere();
    let s = 0;
    for (let i = 0; i < NR; i++) for (let j = 0; j < NC - 1; j++, s++) { const k = i * NC + j; if (okA[k] && okA[k + 1]) putSeg(wRow, s, vtx(i, j, A3), vtx(i, j + 1, B3), vcol(i, j, C1), vcol(i, j + 1, C2)); else putSeg(wRow, s, ZERO, ZERO, BLK, BLK); }
    s = 0;
    for (let c = 0; c < NCOL; c++) for (let i = 0; i < NR - 1; i++, s++) { const j = c * COLSTEP, k = i * NC + j; if (okA[k] && okA[k + NC]) putSeg(wCol, s, vtx(i, j, A3), vtx(i + 1, j, B3), vcol(i, j, C1), vcol(i + 1, j, C2)); else putSeg(wCol, s, ZERO, ZERO, BLK, BLK); }
    for (let j = 0; j < NC; j++) { if (okA[j]) { vtx(0, j, A3); B3[0] = A3[0]; B3[1] = 0; B3[2] = A3[2]; putSeg(curtain, j, B3, A3, BLK, vcol(0, j, C1)); } else putSeg(curtain, j, ZERO, ZERO, BLK, BLK); }
    curtain.geometry.attributes.position.needsUpdate = curtain.geometry.attributes.color.needsUpdate = true;
    wRow.geometry.attributes.position.needsUpdate = wRow.geometry.attributes.color.needsUpdate = true; wCol.geometry.attributes.position.needsUpdate = wCol.geometry.attributes.color.needsUpdate = true;
    // spine + wings + their flares and label anchors
    const sp = [], pp = [], cp = []; A.n = n; A.has.fill(0);
    for (let i = 0; i < NR; i++) {
      const r = i < n ? cur.rows[i] : null, z = zOf(i, n);
      atmF[i].visible = !!(r && r.atm != null); putF[i].visible = !!r?.put25; callF[i].visible = !!r?.call25;
      if (r && r.atm != null) { const p = [0, yOf(r.atm), z]; sp.push(p); A.atm[i][0] = 0; A.atm[i][1] = p[1]; A.atm[i][2] = z; A.atmV[i] = r.atm; A.has[i * 3] = 1; atmF[i].position.set(0, p[1], z); ramp(r.atm, top, atmF[i].material.color);
        putSeg(drops, i, [0, 0, z], p, BLK, ramp(r.atm, top, C1).multiplyScalar(0.8)); } else putSeg(drops, i, ZERO, ZERO, BLK, BLK);
      if (r?.put25) { const p = [(r.put25.m / e.range) * XW, yOf(r.put25.iv) + 0.02, z]; pp.push(p); A.put[i][0] = p[0]; A.put[i][1] = p[1]; A.put[i][2] = z; A.putV[i] = r.put25.iv; A.has[i * 3 + 1] = 1; putF[i].position.set(p[0], p[1], z); }
      if (r?.call25) { const p = [(r.call25.m / e.range) * XW, yOf(r.call25.iv) + 0.02, z]; cp.push(p); A.call[i][0] = p[0]; A.call[i][1] = p[1]; A.call[i][2] = z; A.callV[i] = r.call25.iv; A.has[i * 3 + 2] = 1; callF[i].position.set(p[0], p[1], z); }
    }
    drops.geometry.attributes.position.needsUpdate = drops.geometry.attributes.color.needsUpdate = true;
    const setL = (line, pts) => { line.visible = pts.length >= 2; if (!line.visible) return; while (pts.length < NR) pts.push(pts[pts.length - 1].map((v, q) => v + (q === 2 ? -1e-4 : 0))); kit.setLine(line, pts); };
    setL(spine, sp); setL(wPut, pp); setL(wCall, cp);
    // the ghost: the earliest snapshot's smiles and spine, faint
    A.ghost = !!gsurf; ghost.visible = A.ghost;
    if (gsurf) {
      s = 0; const gc = C1.set(0.55, 0.62, 0.75);
      for (let i = 0; i < NR; i++) {
        const r = i < n ? gsurf.rows[i] : null, z = zOf(i, n);
        for (let j = 0; j < NC - 1; j++, s++) { const a = r?.iv[j], b = r?.iv[j + 1]; if (a != null && b != null) putSeg(ghost, s, [xOf(j), yOf(a), z], [xOf(j + 1), yOf(b), z], gc, gc); else putSeg(ghost, s, ZERO, ZERO, BLK, BLK); }
      }
      for (let i = 0; i < NR; i++, s++) { const a = i < n ? gsurf.rows[i]?.atm : null, b = i + 1 < n ? gsurf.rows[i + 1]?.atm : null; if (a != null && b != null) putSeg(ghost, s, [0, yOf(a), zOf(i, n)], [0, yOf(b), zOf(i + 1, n)], gc, gc); else putSeg(ghost, s, ZERO, ZERO, BLK, BLK); }
      ghost.geometry.attributes.position.needsUpdate = ghost.geometry.attributes.color.needsUpdate = true;
    }
  }
  const all = [fill, wRow, wCol, ghost, drops, curtain, spine, wPut, wCall, ...atmF, ...putF, ...callF];
  const showAll = v => { for (const o of all) if (!v) o.visible = false; if (frame) frame.visible = v; fill.visible = wRow.visible = wCol.visible = drops.visible = curtain.visible = v; };

  return {
    scene, camera, bloom: { strength: 0.75, radius: 0.45, threshold: 0.12 }, A,
    update(t, dt, apiU, g) {
      const st = apiU.st, calm = H.calm;
      if (typeof st.sel === 'string' && st.sel.startsWith('vs:')) {
        const k = st.sel.slice(3); st.sel = null; apiU.blip?.(780, 0.05);
        if (k === 'prev') stepMarket(apiU, -1, calm); else if (k === 'next') stepMarket(apiU, 1, calm); else if (k === 'tprev') stepTime(-1); else if (k === 'tnext') stepTime(1);
        else if (k === 'play' && S.cur?.surfs?.length > 1) { S.from = 0; S.to = 1; S.k = calm ? 1 : 0; S.hold = 0.3; S.play = !calm; if (calm) S.to = S.cur.surfs.length - 1; S.dirty = true; }
      }
      const C = g.C, ck = `${C.blue}|${C.gold}|${C.up}|${C.dn}|${C.tx}`;
      if (ck !== cKey) { cKey = ck; ACC.copy(H.color(C.blue)); GOLD.copy(H.color(C.gold)); wPut.material.color.copy(H.color(C.dn)); wCall.material.color.copy(H.color(C.up)); dust.material.color.copy(H.color(C.blue));
        for (const f of putF) f.material.color.copy(wPut.material.color); for (const f of callF) f.material.color.copy(wCall.material.color); spine.material.color.copy(H.color(C.tx)); S.built = null; S.dirty = true; }
      const e = S.cur;
      if (!e || e.status !== 'ok') { showAll(false); camera.position.set(0, 3, 9); camera.lookAt(0, 0.6, 0); return; }
      if (S.built !== e) { buildFrame(e, C); S.built = e; S.dirty = true; showAll(true); }
      // time: morph from -> to, then (while playing) on to the next snapshot after a short hold
      if (S.k < 1) { if (S.hold > 0) S.hold -= dt; else { S.k = Math.min(1, S.k + dt / MORPH); S.dirty = true; } }
      else if (S.play) { if (S.to < e.surfs.length - 1) { S.from = S.to; S.to++; S.k = 0; S.hold = HOLD; S.dirty = true; } else S.play = false; }
      if (S.dirty) { lerpSurface(e.surfs[S.from], e.surfs[S.to], ease(S.k), OUT); const showG = e.surfs.length > 1 && (S.to > 0 || S.from > 0); write(OUT, e, showG ? e.surfs[0] : null); S.dirty = S.k < 1; }
      // camera: a 3/4 view from the front-left; during the SHOW the focus sweeps from the nearest expiry to the farthest
      const live = S.showP >= 0 && Date.now() - S.showAt < 1500, p = live ? ease(S.showP) : 0;
      const zf = live && !calm ? ZD * 0.8 - p * ZD * 1.6 : 0, drift = calm || live ? 0 : Math.sin(t * 0.09) * 0.12;
      H.orbit(camera, st, { dist: g.compact ? 21 : 10.2, target: [0, HY * 0.42, zf * 0.55], yawAdd: -0.22 + drift + (live && !calm ? p * 0.4 : 0), elev: 0.4 });
    },
    overlay(ctx, g, apiO, Hh) { overlay(ctx, g, apiO, Hh, camera, A); },
    dispose() { scene.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); },
  };
}

// ───────────────────────── the 2D overlay ─────────────────────────
const BOX = [];                                       // placed label boxes (reused)
const fits = (x, y, w, h) => { for (let i = 0; i < BOX.length; i += 4) if (x < BOX[i] + BOX[i + 2] && x + w > BOX[i] && y < BOX[i + 1] + BOX[i + 3] && y + h > BOX[i + 1]) return false; BOX.push(x, y, w, h); return true; };
function tag(ctx, g, text, x, y, color, { align = 'center', bold = false, bg = true, size = 12 } = {}) {
  ctx.font = `${bold ? '600 ' : ''}${size}px ui-monospace,monospace`; const w = ctx.measureText(text).width + 10, h = size + 7, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x, y0 = y - h + 4;
  if (x0 < 4 || x0 + w > g.W - 4 || y0 < 60 || y0 + h > g.H - 4 || !fits(x0, y0, w, h)) return false;
  if (bg) { ctx.globalAlpha = g.fade * 0.72; ctx.fillStyle = S.bg; ctx.fillRect(x0, y0, w, h); }
  ctx.globalAlpha = g.fade; ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.fillText(text, x0 + 5, y0 + h - 5); return true;
}
function wrap(ctx, text, maxW) { const out = []; let line = ''; for (const w of text.split(' ')) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; }
const pc = v => `${v < 10 ? v.toFixed(1) : v.toFixed(1)}%`;

function buttons(ctx, g, e) {
  const { W, C, fade } = g, cp = g.compact, y = cp ? 100 : 128, bh = cp ? 30 : 26, nm = metaOf(S.key)?.label ?? '';
  const times = e?.surfs?.length > 1, tl = times ? e.surfs[S.to].label : '';
  const items = cp ? [['prev', '‹', -150, 44], ['name', nm, -88, 76], ['next', '›', -26, 44], ...(times ? [['tprev', '◀', 36, 40], ['time', tl, 104, 92], ['tnext', '▶', 172, 40]] : [])]
    : [['prev', '‹', -230, 28], ['name', nm, -160, 108], ['next', '›', -90, 28], ...(times ? [['tprev', '◀', 0, 28], ['time', tl, 80, 128], ['tnext', '▶', 160, 28], ['play', 'REPLAY', 228, 80]] : [])];
  ctx.textBaseline = 'middle'; ctx.font = '600 12px ui-monospace,monospace';
  for (const [k, label, dx, w] of items) {
    const x = clamp(W / 2 + dx, w / 2 + 4, W - w / 2 - 4), pas = k === 'name' || k === 'time';
    ctx.globalAlpha = fade * 0.8; ctx.fillStyle = S.bg; ctx.fillRect(x - w / 2, y - bh / 2, w, bh); ctx.strokeStyle = C.blue; ctx.globalAlpha = fade * (pas ? 0.4 : 0.9); ctx.lineWidth = 1; ctx.strokeRect(x - w / 2, y - bh / 2, w, bh);
    ctx.fillStyle = pas ? C.blue : C.tx; ctx.globalAlpha = fade; ctx.textAlign = 'center'; ctx.fillText(label, x, y + 1); if (!pas) g.hit('vs:' + k, x, y);
    BOX.push(x - w / 2, y - bh / 2, w, bh);
  }
  ctx.textBaseline = 'alphabetic';
}

function overlay(ctx, g, api, H, cam, A) {
  const { W, H: HH, C, fade } = g, cp = g.compact; BOX.length = 0; ctx.save();
  const say = (t, c = C.tx2) => { ctx.globalAlpha = fade; ctx.fillStyle = c; ctx.font = '13px ui-monospace,monospace'; ctx.textAlign = 'center'; for (const [i, l] of wrap(ctx, t, W - 40).entries()) ctx.fillText(l, W / 2, HH / 2 + i * 18); };
  if (S.status === 'loading' || S.status === 'idle') { say('Reading the option vol surfaces...'); ctx.restore(); return; }
  if (S.status === 'fail') { say('The implied-vol feeds (option store and Cboe chain archive) are not available right now, so there is no surface to draw.'); ctx.restore(); return; }
  if (S.status === 'empty') { say('No market has implied vol stored today, so there is no surface to draw.'); ctx.restore(); return; }
  const e = S.cur; buttons(ctx, g, e);
  if (!e || e.status === 'loading') { say(`Reading the ${metaOf(S.key)?.label ?? ''} option chains...`); ctx.restore(); return; }
  if (e.status !== 'ok') { say(`No implied vol could be read for ${metaOf(S.key)?.label ?? 'this market'}. Try the next market.`); ctx.restore(); return; }
  const f = surfaceFacts(OUT) ?? e.facts, n = A.n, R = e.range;
  // world labels, most important first: ATM at the nearest and farthest expiry, the two wings, then the axes
  const P = p => H.toScreen(p, cam);
  const iNear = [...Array(n).keys()].find(i => A.has[i * 3]), iFar = [...Array(n).keys()].reverse().find(i => A.has[i * 3]);
  for (const [i, wd] of [[iNear, 'nearest'], [iFar, 'farthest']]) { if (i == null || (wd === 'farthest' && i === iNear)) continue; const s = P(A.atm[i]); if (s.vis) tag(ctx, g, `ATM ${pc(A.atmV[i])} · ${dteText(OUT.rows[i]?.dte)}`, s.x, s.y - 14, C.tx, { bold: true, size: cp ? 12 : 13 }); }
  const iw = [...Array(n).keys()].reverse().find(i => A.has[i * 3 + 1] && A.has[i * 3 + 2]);   // the farthest smile: its wings sit widest apart
  if (iw != null) { const sp = P(A.put[iw]), sc = P(A.call[iw]);
    if (sp.vis) tag(ctx, g, `25Δ PUT ${pc(A.putV[iw])}`, sp.x - 16, sp.y + 26, C.dn, { align: 'right' });
    if (sc.vis) tag(ctx, g, `25Δ CALL ${pc(A.callV[iw])}`, sc.x + 16, sc.y + 26, C.up, { align: 'left' }); }
  for (const q of cp ? [-1, 0, 1] : [-1, -0.5, 0, 0.5, 1]) { const s = P([q * XW, 0, ZD + 0.55]); const v = q * R; if (s.vis) tag(ctx, g, q === 0 ? 'SPOT' : `${q === -1 ? 'puts ‹ ' : ''}${v > 0 ? '+' : '−'}${Math.abs(v) % 1 ? Math.abs(v).toFixed(1) : Math.abs(v)}%${q === 1 ? ' › calls' : ''}`, s.x, s.y + 14, q === 0 ? C.tx : q < 0 ? C.dn : q > 0 ? C.up : C.tx2, { bg: false, size: 11 }); }
  for (let i = 0; i < n; i++) { if (cp && i !== 0 && i !== n - 1 && i % 2) continue; const z = n <= 1 ? 0 : ZD - (2 * ZD * i) / (n - 1), s = P([XW + 0.3, 0, z]); if (s.vis) tag(ctx, g, `${dteText(OUT.rows[i]?.dte)}${OUT.rows[i]?.atmOnly ? ' ·ATM' : ''}`, s.x, s.y + 5, C.tx2, { align: 'left', bg: false, size: 11 }); }
  for (const v of volTicks(e.top)) { const s = P([-XW - 0.3, (v / e.top) * HY, -ZD - 0.35]); if (s.vis) tag(ctx, g, `${v}%`, s.x - 6, s.y + 5, C.tx2, { align: 'right', bg: false, size: 11 }); }
  // readout (top-left) and key (bottom)
  const x0 = 16; let y = cp ? 140 : 170; ctx.textAlign = 'left';
  const line = (t, c, bold) => { ctx.font = `${bold ? '600 ' : ''}${cp ? 11 : 12}px ui-monospace,monospace`; for (const l of wrap(ctx, t, cp ? W - 32 : 500)) { ctx.globalAlpha = fade * 0.72; ctx.fillStyle = S.bg; const w = ctx.measureText(l).width; ctx.fillRect(x0 - 5, y - 13, w + 10, 18); ctx.globalAlpha = fade; ctx.fillStyle = c; ctx.fillText(l, x0, y); BOX.push(x0 - 5, y - 13, w + 10, 18); y += cp ? 15 : 17; } };
  line(`VOL SURFACE · ${metaOf(S.key)?.label ?? ''}`, C.blue, true);
  line(cp ? e.note.replace(/ \(all the archive keeps\)/, '') : e.note, C.tx2);
  if (f) {
    line(f.nExp > 1 ? `ATM ${pc(f.near.atm)} (${dteText(f.near.dte)}) → ${pc(f.far.atm)} (${dteText(f.far.dte)}) · term ${f.shape === 'upward' ? 'upward ↗' : f.shape === 'inverted' ? 'inverted ↘' : 'flat →'}` : `ATM ${pc(f.near.atm)} (${dteText(f.near.dte)}) · one expiry only`, C.tx);
    line(f.skew == null ? '25Δ skew: the wings are not quoted on this surface' : `25Δ skew ${f.skew > 0 ? '+' : ''}${f.skew.toFixed(1)} vol pts (put − call, ${dteText(f.skewDte)}): ${f.skewWord}`, f.skew == null ? C.tx2 : f.skew > 0.3 ? C.dn : f.skew < -0.3 ? C.up : C.tx);
  }
  if (e.surfs.length > 1) line(`showing ${e.surfs[S.k < 0.5 ? S.from : S.to].label}${S.k < 1 ? ' (morphing)' : ''} · grey ghost = ${e.surfs[0].label}`, C.tx2);
  // colour ramp legend + the key line
  const ky = HH - (cp ? 128 : 96), lw = cp ? 120 : 160;
  for (let i = 0; i < lw; i++) { const p = i / lw; ctx.globalAlpha = fade; ctx.fillStyle = mixCss(C.blue, C.gold, p); ctx.fillRect(x0 + i, ky - 22, 1, 6); }
  ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = C.tx2; ctx.globalAlpha = fade; ctx.textAlign = 'left'; ctx.fillText('0%', x0, ky - 26); ctx.fillText(`${e.top}%`, x0 + lw - ctx.measureText(`${e.top}%`).width, ky - 26); ctx.fillText(cp ? `colour = vol${e.capped ? ' · white = capped' : ''}` : `colour = implied vol${e.capped ? ` · white tips = above ${e.top}%, capped` : ''}`, x0 + lw + 10, ky - 17);
  ctx.textAlign = 'left'; ctx.font = `${cp ? 11 : 12}px ui-monospace,monospace`;
  const key = 'height = implied volatility · front = nearest expiry · ribbons = the 25-delta wings (skew) · what options are pricing now, description only, not a forecast';
  wrap(ctx, key, W - 32).forEach((l, i) => { ctx.globalAlpha = fade * 0.72; ctx.fillStyle = S.bg; ctx.fillRect(x0 - 5, ky + i * 16 - 13, ctx.measureText(l).width + 10, 17); ctx.globalAlpha = fade * 0.95; ctx.fillStyle = C.gold; ctx.fillText(l, x0, ky + i * 16); });
  ctx.restore();
}
/** A colour between two CSS colours (hex or rgb) for the 2D legend; falls back to the first. */
function mixCss(a, b, p) { const pa = rgb(a), pb = rgb(b); if (!pa || !pb) return a; const k = 0.45 + 0.35 * p, q = p * p; return `rgb(${[0, 1, 2].map(i => Math.round(Math.min(255, pa[i] * k * (1 - q) + pb[i] * q))).join(',')})`; }
function rgb(c) { const s = String(c ?? '').trim(); let m = /^#([0-9a-f]{6})$/i.exec(s); if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)); m = /^#([0-9a-f]{3})$/i.exec(s); if (m) return [0, 1, 2].map(i => parseInt(m[1][i] + m[1][i], 16)); m = /^rgba?\(([^)]+)\)/i.exec(s); if (m) return m[1].split(',').slice(0, 3).map(Number); return null; }

// ───────────────────────── registration ─────────────────────────
const view = glView({ id: ID, label: 'VOL SURFACE', env: { accent: 'cy', scan: false }, setup });
const enter = view.onEnter;
view.onEnter = api => {
  try { S.bg = api.win.getComputedStyle(api.doc.documentElement).getPropertyValue('--bg1').trim() || 'black'; } catch (e) { S.bg = 'black'; }
  S.showP = -1; S.spin = api.st.spin; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false });
  const calm = !!api.win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  loadIndex(api).then(() => { const k = S.key && S.list.some(m => m.key === S.key) ? S.key : pickStart(api); if (k && (k !== S.key || !S.cur)) select(api, k, calm); }).catch(() => null);
  enter?.(api);
};
view.onLeave = api => { S.showP = -1; if (S.spin != null) api.st.spin = S.spin; S.spin = null; };

registerJarvisModule({
  id: 'ivsurf', label: 'VOL SURFACE',
  render(pane, api) {
    pane.innerHTML = `<h3>VOL SURFACE: WHAT OPTIONS ARE PRICING</h3><p>The implied-volatility surface of one market as a glowing landscape: left to right is the strike's distance from spot (puts left, calls right), front to back the expiries (nearest at the front), height the implied vol. A white spine runs along the at-the-money vols (the term structure); red and green ribbons trace the 25-delta put and call wings (the skew). Where history is held, the surface morphs from an earlier day to today over a faint grey ghost.</p><p class="jv-sub">What options are pricing now: a description, not a forecast.</p><div class="jv-row"><button type="button" data-v="go">SHOW THE SURFACE</button></div>`;
    pane.querySelector('[data-v="go"]').onclick = () => { api.setView?.(ID); loadIndex(api, true); };
  },
  views: [view],
});

await import('./jarvisViewGammaTerrain.js').catch(() => null);   // so 'gpillar' then 'gterrain' are registered before this one asks to follow them (a fixed order, not import luck)
registerShowScene({
  id: ID, after: 'gterrain',
  prepare: async api => {
    await loadIndex(api); const key = S.key && S.list.some(m => m.key === S.key) ? S.key : pickStart(api); if (!key) return null;
    const e = await loadMarket(api, key); return e?.status === 'ok' ? { key, facts: e.facts, label: e.label, src: e.src } : null;
  },
  build: (inp, data) => {
    const text = data ? ivScript(data.facts, spokenSafe(data.key, data.label), data.src === 'cboe' ? 'the Cboe option chain' : 'the CME options settlement') : null; if (!text) return null;
    return { title: 'The vol surface', view: ID, cam: null, text,
      enter: api => { if (S.key !== data.key || !S.cur) select(api, data.key, false); Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); },
      motion: (api, p) => { S.showP = clamp(p, 0, 1); S.showAt = Date.now(); } };
  },
});
