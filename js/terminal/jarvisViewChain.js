// js/terminal/jarvisViewChain.js: Jarvis's CHAIN FLY-THROUGH ("FLY"), a WebGL hologram (js/terminal/jarvisGL.js). The macro chain as a glowing tunnel you fly through, cause to effect.
//
// ENCODING
//   orb + pylon     one market: a Fresnel glass orb with a bright core, standing on a pylon of light over the floor grid. Orb radius grows smoothly with the size the chain
//                   gives the market (how far it moved against its own noise); colour = its tone (up / dn tokens for a move beyond noise, gold = the effect end of a broken
//                   link, grey = inside its noise). Its name is written beside it as you approach.
//   tube of light   one textbook link, bowed so parallel links separate. Particles (comets) run along it from cause to effect, so the flow direction is motion, not only layout.
//                   HOLDING = a steady blue tube with an even stream; BROKEN = a thick gold tube that flickers, with a fast jittery stream; QUIET = a faint thread, nearly invisible.
//   ring gate       every market on the route has a ring gate the camera flies through (double ring with ticks); off-route markets have a small faint ring. A gate lights up as
//                   the camera passes, and the market's name, its measured move and the link verdict flash up as a card.
//   speed lines     streaks around the camera, length = how fast the camera is moving along the rail (it slows at broken links). The faint line ahead is the rail itself.
//   route strip     the flight's stops along the bottom (gold = broken, blue = holding), with a marker for where the camera is.
// Outside a SHOW the flight loops (about 25 s); drag to look around (it eases back), wheel to zoom. Inside the SHOW the flight is driven by the scene (progress p) and tied to
// the spoken script (each stop is reached as its sentence is spoken). Reduced motion: no flicker, no speed lines, no motion trail, a slower loop.
// DATA  the chain graph the HUD already holds (st.graph from buildGraph in jarvisCore.js over js/macroChain.js); nothing is fetched here. Maths, rail and script: chainFlyCore.js (pure, tested).
// DESCRIPTION ONLY: it shows which textbook links held or broke over the window. None of it is a forecast or a validated forward signal, and the key says so.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { glView } from './jarvisGL.js';
import { buildFly, camAt, labelAlpha } from './chainFlyCore.js';

const ID = 'chainfly', LOOP_S = 25, NSEG = 30, FLOOR = -1.7, NSPEED = 150, NCOMET = 3, RAILN = 220;
let showP = null;                       // set by the SHOW scene while it drives the flight; null = the view flies its own loop
const S = { graph: null, fly: null, clk: 0, p: 0, wasP: 0, speed: 0 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };
const toneCol = (C, t) => (t === 'up' ? C.up : t === 'dn' ? C.dn : t === 'wrong' ? C.gold : C.tx2);
const KIND = { broken: 'BROKEN LINK', holding: 'LINK HOLDING', move: 'MOVED' };
const X = p => [-p[0], p[1], p[2]];     // the core's frame has +x on the right of a camera looking down +z; three.js has it on the left, so x is mirrored once here

function flyFor(api) {
  const g = api.st.graph; if (!g) return null;
  if (S.graph !== g) { S.graph = g; S.fly = buildFly(g, api.names); }
  return S.fly;
}
/** The edge's curve (core frame): straight from cause to effect, bowed sideways so parallel links separate. */
function edgeCurve(e, pos) {
  const a = pos[e.from], b = pos[e.to], side = (hash(e.id) < 0.5 ? -1 : 1) * (0.25 + 0.5 * hash(e.id + 'b')), lift = (hash(e.id + 'c') - 0.5) * 0.7, out = [];
  for (let i = 0; i < NSEG; i++) { const t = i / (NSEG - 1), w = Math.sin(Math.PI * t); out.push([a[0] + (b[0] - a[0]) * t + side * w, a[1] + (b[1] - a[1]) * t + lift * w, a[2] + (b[2] - a[2]) * t]); }
  return out;
}
/** The look direction (core frame) for a camera plus the viewer's yaw / pitch offsets: the same rotation the core's projector applies. */
function lookDir(cam, yaw, pitch) {
  let fx = cam.target[0] - cam.eye[0], fy = cam.target[1] - cam.eye[1], fz = cam.target[2] - cam.eye[2]; const L = Math.hypot(fx, fy, fz) || 1; fx /= L; fy /= L; fz /= L;
  const cy = Math.cos(yaw), sy = Math.sin(yaw); let gx = fx * cy + fz * sy, gz = -fx * sy + fz * cy; const gy = fy;
  const hl = Math.hypot(gx, gz) || 1, ny = clamp(gy * Math.cos(pitch) + Math.sin(pitch), -0.99, 0.99), nh = Math.sqrt(1 - ny * ny); gx = gx / hl * nh; gz = gz / hl * nh;
  return [gx, ny, gz];
}
/** Where the flight is: debug override, the SHOW's progress, or the loop clock. Returns { p, wrap } (wrap fades the picture at the loop seam). */
function progress() {
  const dbg = globalThis.__jarvisFlyP;
  if (Number.isFinite(dbg)) return { p: clamp(dbg, 0, 1), wrap: 1 };
  if (showP != null) return { p: clamp(showP, 0, 1), wrap: 1 };
  const p = (S.clk / LOOP_S) % 1; return { p, wrap: Math.min(1, Math.min(p, 1 - p) / 0.025) };
}

function setup(L, H, api) {
  const { THREE } = L, kit = H.kit, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.04, 90);
  scene.fog = new THREE.Fog(0, 6, 23);
  let grp = null, built = null, C0 = null, nodes = [], edges = [], gates = [], parts = null, partCol = null, speed = null, railLine = null, dust = null;
  const tmp = new THREE.Color(), V = new THREE.Vector3();

  function drop() { if (!grp) return; scene.remove(grp); kit.forget(grp); grp = null; nodes = []; edges = []; gates = []; parts = null; speed = null; railLine = null; dust = null; }
  function build(fly, graph, C) {
    drop(); grp = new THREE.Group(); scene.add(grp); built = fly; C0 = C;
    const { layout, route } = fly, pos = layout.pos, zMax = layout.maxZ + 8;
    // floor: a long grid running along the flight, and a faint glow under the rail
    const fl = [];
    for (let x = -7.5; x <= 7.5 + 1e-6; x += 1.5) fl.push([x, FLOOR, -6, x, FLOOR, zMax]);
    for (let z = -6; z <= zMax; z += 1.3) fl.push([-7.5, FLOOR, z, 7.5, FLOOR, z]);
    grp.add(kit.segments(fl, C.blue, 0.16));
    // dust in the tunnel
    const nd = 900; dust = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: H.color(C.tx2), size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, map: kit.dot() }));
    { const a = new Float32Array(nd * 3); for (let i = 0; i < nd; i++) { a[i * 3] = (hash('dx' + i) - 0.5) * 16; a[i * 3 + 1] = FLOOR + hash('dy' + i) * 6; a[i * 3 + 2] = -6 + hash('dz' + i) * (zMax + 6); } dust.geometry.setAttribute('position', new THREE.BufferAttribute(a, 3)); }
    dust.frustumCulled = false; grp.add(dust);
    // the rail: a faint line of light the camera rides
    const rp = []; for (let i = 0; i <= RAILN; i++) { const c = camAt(route, i / RAILN); rp.push(X([c.eye[0], c.eye[1] - 0.42, c.eye[2]])); }
    railLine = kit.line(rp, C.cy ?? C.blue, 1.2, 0.22); railLine.material.dashed = true; railLine.material.dashSize = 0.18; railLine.material.gapSize = 0.14; railLine.material.fog = true; railLine.material.needsUpdate = true; grp.add(railLine);
    // links: a glass tube, a bright core line and a halo; particles run cause -> effect
    let np = 0;
    for (const e of graph.edges) {
      if (!pos[e.from] || !pos[e.to] || !['broken', 'holding', 'quiet'].includes(e.verdict)) continue;
      const br = e.verdict === 'broken', hold = e.verdict === 'holding', col = br ? C.gold : hold ? C.blue : C.tx2, pts = edgeCurve(e, pos).map(X);
      const rec = { e, pts, br, hold, mats: [], n: br ? 9 : hold ? 5 : 1, sp: br ? 0.34 : hold ? 0.16 : 0.07, ph: [], p0: np, mid: pts[NSEG >> 1] };
      for (let j = 0; j < rec.n; j++) rec.ph.push(hash(e.id + 'p' + j));
      np += rec.n * NCOMET;
      if (br || hold) {
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(q => new THREE.Vector3(...q))), 48, br ? 0.06 : 0.035, 10, false), kit.holo(col, { rim: 2.2, base: br ? 0.08 : 0.05, scan: 0, opacity: br ? 0.9 : 0.6 }));
        grp.add(tube); rec.tube = tube.material;
      }
      const halo = kit.line(pts, col, br ? 14 : hold ? 8 : 3, br ? 0.16 : hold ? 0.1 : 0.03), core = kit.line(pts, col, br ? 3.2 : hold ? 1.8 : 0.8, br ? 0.95 : hold ? 0.7 : 0.12);
      for (const l of [halo, core]) { l.material.fog = true; l.material.needsUpdate = true; grp.add(l); }
      rec.halo = halo.material; rec.core = core.material; rec.base = [halo.material.opacity, core.material.opacity];
      edges.push(rec);
    }
    parts = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: kit.dot() }));
    parts.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(1, np) * 3), 3));
    partCol = new Float32Array(Math.max(1, np) * 3); parts.geometry.setAttribute('color', new THREE.BufferAttribute(partCol, 3)); parts.frustumCulled = false; grp.add(parts);
    for (const ed of edges) { tmp.set(ed.br ? C.gold : ed.hold ? C.tx : C.tx2); ed.rgb = [tmp.r, tmp.g, tmp.b]; }
    // markets: orb, core, pylon, floor glow, ring (a double gate on the route)
    const stopIdx = new Map(route.stops.map((s, i) => [s.key, i]));
    for (const n of graph.nodes) {
      const P = pos[n.key]; if (!P) continue;
      const w = X(P), col = toneCol(C, n.style.tone), r = 0.08 + 0.12 * clamp(n.style.size ?? 0.5, 0, 1.6), si = stopIdx.get(n.key), isStop = si != null;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), kit.holo(col, { rim: 1.6, base: 0.07, scan: 1, opacity: 1 })); orb.position.set(...w); grp.add(orb);
      const glow = kit.flare(col, r * 4.5, 0.45); glow.position.set(...w); grp.add(glow);
      const core = kit.flare(C.tx, r * 1.8, 0.7); core.position.set(...w); grp.add(core);
      const py = kit.line([[w[0], w[1] - r, w[2]], [w[0], FLOOR, w[2]]], col, 1.2, 0.3); py.material.fog = true; grp.add(py);
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.55, 40), kit.glowDisc(col, 0.3)); pad.rotation.x = -Math.PI / 2; pad.position.set(w[0], FLOOR + 0.002, w[2]); grp.add(pad);
      const ringC = n.style.tone === 'wrong' ? C.gold : (C.cy ?? C.blue), ring = new THREE.Group(); ring.position.set(...w); grp.add(ring);
      const circ = (R, k = 64) => Array.from({ length: k + 1 }, (_, i) => [Math.cos(i / k * Math.PI * 2) * R, Math.sin(i / k * Math.PI * 2) * R, 0]);
      const mats = [];
      const r1 = kit.line(circ(isStop ? 0.62 : 0.34), ringC, isStop ? 2.4 : 1, isStop ? 0.5 : 0.16); ring.add(r1); mats.push([r1.material, r1.material.opacity]);
      if (isStop) {
        const r2 = kit.line(circ(0.8), ringC, 1, 0.22); r2.material.dashed = true; r2.material.dashSize = 0.09; r2.material.gapSize = 0.07; r2.material.needsUpdate = true; ring.add(r2); mats.push([r2.material, 0.22]);
        const tk = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; tk.push([Math.cos(a) * 0.66, Math.sin(a) * 0.66, 0, Math.cos(a) * 0.76, Math.sin(a) * 0.76, 0]); }
        const ticks = kit.segments(tk, ringC, 0.4); ring.add(ticks); mats.push([ticks.material, 0.4]);
      }
      const rec = { n, w, r, col, si, isStop, orb, glow, core, ring, mats, ph: hash(n.key) * 6 };
      nodes.push(rec); if (isStop) gates.push(rec);
    }
    // speed lines around the camera (positions written each frame)
    speed = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    speed.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NSPEED * 6), 3));
    const sc = new Float32Array(NSPEED * 6); tmp.set(C.cy ?? C.blue); for (let i = 0; i < NSPEED; i++) { sc[i * 6 + 3] = tmp.r; sc[i * 6 + 4] = tmp.g; sc[i * 6 + 5] = tmp.b; }
    speed.geometry.setAttribute('color', new THREE.BufferAttribute(sc, 3)); speed.frustumCulled = false; grp.add(speed);
    speed.userData.seed = Array.from({ length: NSPEED }, (_, i) => [hash('sa' + i) * Math.PI * 2, 0.9 + hash('sr' + i) * 3.2, hash('sz' + i) * 16]);
  }

  const view = { cam: null, p: 0, wrap: 1, eye: Array(3).fill(0) };
  return {
    scene, camera, bloom: { strength: 0.7, radius: 0.45, threshold: 0.2 }, trail: H.calm ? 0 : 0.35,   // (toned down after a live check: close passes washed the picture white)
    update(t, dt, api_, g) {
      const st = api.st, fly = flyFor(api); st.spin = false;
      if (!fly || !fly.route.stops.length) { if (grp) drop(); built = null; return; }
      if (built !== fly || C0?.blue !== g.C.blue || C0?.gold !== g.C.gold) build(fly, st.graph, g.C);
      const { route, script } = fly, driven = showP != null, times = driven && script ? script.marks : route.times;
      // the viewer's look offsets ease back when let go
      if (!st.drag) { st.yaw *= 1 - Math.min(1, dt * 1.6); st.pitch *= 1 - Math.min(1, dt * 1.6); }
      st.pitch = clamp(st.pitch, -0.8, 0.8); st.yaw = clamp(st.yaw, -1.5, 1.5);
      S.clk += dt * (H.calm ? 0.5 : 1);
      const { p, wrap } = progress(); view.p = p; view.wrap = wrap; view.times = times; view.fly = fly;
      if (Math.abs(p - S.wasP) > 0.5) S.speed = 0;
      S.wasP = p;
      const cam = camAt(route, p, times); view.cam = cam;
      const d = lookDir(cam, st.yaw || 0, st.pitch || 0), e = X(cam.eye);
      camera.position.set(...e); camera.up.set(0, 1, 0); camera.lookAt(e[0] - d[0], e[1] + d[1], e[2] + d[2]);
      camera.rotateZ(cam.roll + (H.calm ? 0 : Math.sin(t * 0.8) * 0.008));
      const zoom = clamp(st.zoom || 1, 0.5, 2.6), fov = clamp(62 / zoom, 24, 90); if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      view.eye = e;
      H.canvas.style.opacity = String(g.fade * wrap);
      const nominal = cam.speed / LOOP_S; S.speed += (nominal - S.speed) * Math.min(1, dt * 3);
      // links: flicker the broken ones, fade by distance (the glass tube has no fog of its own)
      const C = g.C;
      for (const ed of edges) {
        let dmin = 1e9; for (let i = 0; i < NSEG; i += 3) { const q = ed.pts[i]; dmin = Math.min(dmin, Math.hypot(q[0] - e[0], q[1] - e[1], q[2] - e[2])); }
        const dist = Math.hypot(ed.mid[0] - e[0], ed.mid[1] - e[1], ed.mid[2] - e[2]), fogK = clamp(1 - (dist - 4) / 16, 0.08, 1) * clamp((dmin - 0.35) / 1.4, 0.06, 1);   // a tube the camera brushes past would fill the screen
        const fl = ed.br && !H.calm ? 0.6 + 0.4 * Math.sin(t * 31 + hash(ed.e.id) * 40) * Math.sin(t * 13 + 1) : 1;
        ed.halo.opacity = ed.base[0] * fl; ed.core.opacity = ed.base[1] * (ed.br ? 0.55 + 0.45 * fl : 1);
        if (ed.tube) ed.tube.uniforms.op.value = (ed.br ? 0.9 : 0.6) * fogK * (ed.br ? 0.5 + 0.5 * fl : 1);
      }
      // particles: comets running cause -> effect
      const pa = parts.geometry.attributes.position.array;
      for (const ed of edges) {
        for (let j = 0; j < ed.n; j++) {
          const u0 = (ed.ph[j] + S.clk * ed.sp) % 1;
          for (let c = 0; c < NCOMET; c++) {
            const u = clamp(u0 - c * 0.014, 0, 1), f = u * (NSEG - 1), i = Math.min(NSEG - 2, f | 0), s = f - i, A = ed.pts[i], B = ed.pts[i + 1], k = (ed.p0 + j * NCOMET + c) * 3;
            const jit = ed.br && !H.calm ? Math.sin(t * 40 + j * 5 + c) * 0.025 : 0;
            pa[k] = A[0] + (B[0] - A[0]) * s + jit; pa[k + 1] = A[1] + (B[1] - A[1]) * s - jit; pa[k + 2] = A[2] + (B[2] - A[2]) * s;
            const b = (ed.br ? 1.1 : ed.hold ? 0.9 : 0.25) * (1 - c * 0.34) * Math.sin(Math.PI * Math.min(1, u0 * 1.02));
            partCol[k] = ed.rgb[0] * b; partCol[k + 1] = ed.rgb[1] * b; partCol[k + 2] = ed.rgb[2] * b;
          }
        }
      }
      parts.geometry.attributes.position.needsUpdate = true; parts.geometry.attributes.color.needsUpdate = true;
      // markets: gates light as the camera passes, orbs breathe
      for (const nd of nodes) {
        const la = nd.isStop ? labelAlpha(times, nd.si, p) : 0, pulse = H.calm ? 1 : 1 + 0.08 * Math.sin(t * 5 + nd.ph);
        nd.ring.scale.setScalar(pulse * (1 + 0.12 * la)); nd.ring.rotation.z = H.calm ? 0 : t * (nd.isStop ? 0.25 : 0.1);
        for (const [m, b] of nd.mats) m.opacity = b * (1 + 1.6 * la);
        const dn = Math.hypot(nd.w[0] - e[0], nd.w[1] - e[1], nd.w[2] - e[2]), near = clamp((dn - 0.8) / 3, 0, 1);   // a glow the camera is inside would wash out the picture
        nd.glow.material.opacity = (0.35 + 0.3 * la) * near; nd.glow.scale.setScalar(nd.r * 4.5 * (1 + 0.4 * la)); nd.core.material.opacity = 0.7 * near;
        nd.orb.material.uniforms.op.value = (0.7 + 0.3 * la) * clamp((dn - 0.4) / 2.2, 0.15, 1);
      }
      // speed lines: streaks in a cylinder round the camera, longer the faster it moves
      const sa = speed.geometry.attributes.position.array, sv = H.calm ? 0 : S.speed, len = clamp(sv * 0.3, 0, 1.6), seed = speed.userData.seed;
      speed.material.opacity = clamp(sv * 0.45, 0, 0.55);
      for (let i = 0; i < NSPEED; i++) {
        const [a, r, z0] = seed[i], z = e[2] + (((z0 - S.clk * sv * 1.6) % 16) + 16) % 16 - 3, x = e[0] + Math.cos(a) * r, y = e[1] + Math.sin(a) * r * 0.75;
        sa[i * 6] = x; sa[i * 6 + 1] = y; sa[i * 6 + 2] = z + len; sa[i * 6 + 3] = x; sa[i * 6 + 4] = y; sa[i * 6 + 5] = z;
      }
      speed.geometry.attributes.position.needsUpdate = true; speed.visible = sv > 0.02;
      void C; void V;
    },
    overlay(ctx, g, api_) {
      const fly = flyFor(api); if (!fly || !view.cam) return;
      const proj = q => { const w = X(q), s = H.toScreen(w, camera), d = Math.hypot(w[0] - view.eye[0], w[1] - view.eye[1], w[2] - view.eye[2]); s.d = d; return s; };
      chainHud(ctx, g, api, { fly, p: view.p, times: view.times, wrap: view.wrap, proj, speed: S.speed });
    },
    dispose() { drop(); },
  };
}

const LBL = Array.from({ length: 48 }, () => ({ x: 0, y: 0, w: 0, h: 0 }));
/**
 * The 2D layer over the hologram: market names near the camera (collision-free), the stop card that flashes as the camera passes a gate, the readout (top left),
 * the route strip and the key (bottom). v = { fly, p, times, wrap, proj(q) -> { x, y, vis, d } }. Exported for the test (it runs with a stub projector).
 */
export function chainHud(ctx, g, api, v) {
  const { W, H, C } = g, cp = g.compact, fade = g.fade * (v.wrap ?? 1), { route } = v.fly, nodes = api.st.graph?.nodes ?? [], times = v.times ?? route.times, p = v.p;
  const pos = v.fly.layout.pos, stopIdx = new Map(route.stops.map((s, i) => [s.key, i]));
  ctx.save(); ctx.textBaseline = 'alphabetic';
  // names: near markets only, nearest first, never on top of each other; every visible market is a click target (the HUD's chain card)
  const near = [];
  for (const n of nodes) { const P = pos[n.key]; if (!P) continue; const s = v.proj(P); if (!s.vis || s.d < 0.25) continue; g.hit(n.key, s.x, s.y); if (s.d < (cp ? 6 : 10)) near.push({ n, s }); }
  near.sort((a, b) => a.s.d - b.s.d);
  let nl = 0;
  for (const { n, s } of near) {
    const si = stopIdx.get(n.key); if (si != null && labelAlpha(times, si, p) > 0.02) continue;   // the card carries it
    if (cp && nl >= 3) break; if (nl >= LBL.length) break;
    const fs = clamp(Math.round(15 - s.d), cp ? 9 : 9, 13), nm = (api.names?.[n.key] ?? n.key).replace(/\s*\(.*\)/, ''); ctx.font = `${fs}px ui-monospace,monospace`;
    const w = ctx.measureText(nm).width + 6, x = clamp(s.x - w / 2, 4, W - w - 4), y = s.y + 10 + 60 / Math.max(1, s.d);
    if (y > H - (cp ? 150 : 120) || y < (cp ? 150 : 130)) continue;
    let hit = false; for (let i = 0; i < nl; i++) { const b = LBL[i]; if (x < b.x + b.w && x + w > b.x && y - fs < b.y && y > b.y - b.h) { hit = true; break; } }
    if (hit) continue; Object.assign(LBL[nl++], { x, y, w, h: fs + 2 });
    ctx.globalAlpha = fade * clamp(1.1 - s.d / 11, 0.35, 0.9); ctx.fillStyle = n.style.tone === 'wrong' ? C.gold : C.tx2; ctx.textAlign = 'left'; ctx.fillText(nm, x + 3, y);
  }
  // the card: the market's name, its measured move and the verdict flash up as the camera passes through its gate
  route.stops.forEach((stop, si) => {
    const la = labelAlpha(times, si, p); if (la < 0.02) return;
    const col = toneCol(C, nodes.find(n => n.key === stop.key)?.style.tone), e = la * la * (3 - 2 * la), x = W * 0.5, cs = cp ? 0.62 : 1, y = (cp ? H * 0.3 : H * 0.29) - (1 - e) * 18, sc = 0.85 + 0.2 * e;
    ctx.globalAlpha = fade * e * 0.55; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 170 * cs, y - 26 * cs, 340 * cs, 112 * cs);
    ctx.globalAlpha = fade * e; ctx.textAlign = 'center'; ctx.shadowColor = col; ctx.shadowBlur = 22;
    ctx.fillStyle = C.tx; ctx.font = `${Math.round(20 * sc * cs)}px ui-monospace,monospace`; ctx.fillText(stop.label.toUpperCase(), x, y);
    ctx.fillStyle = col; ctx.font = `${Math.round(46 * sc * cs)}px ui-monospace,monospace`; ctx.fillText(stop.text || '', x, y + 50 * sc * cs);
    ctx.shadowBlur = 0; ctx.fillStyle = stop.kind === 'broken' ? C.gold : stop.kind === 'holding' ? C.blue : C.tx2; ctx.font = '12px ui-monospace,monospace'; ctx.fillText(KIND[stop.kind] ?? '', x, y + 74 * sc * cs);
    ctx.globalAlpha = fade * e * 0.5; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 90 * cs, y + 84 * sc * cs); ctx.lineTo(x + 90 * cs, y + 84 * sc * cs); ctx.stroke();
  });
  // readout, top left
  const edges = api.st.graph?.edges ?? [], cnt = k => edges.filter(e => e.verdict === k).length, ty = cp ? 92 : 104;
  let cur = 0; for (let i = 0; i < route.stops.length; i++) if (p >= times[i + 1] - 0.02) cur = i + 1;
  shade(ctx, g, 0, ty - 26, cp ? W : 580, 78);
  ctx.textAlign = 'left'; ctx.globalAlpha = g.fade; ctx.fillStyle = C.blue; ctx.font = `600 ${cp ? 13 : 15}px ui-monospace,monospace`; ctx.fillText('FLY THE CHAIN', 16, ty);
  ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = C.tx2; ctx.fillText(cp ? 'cause to effect · links held or broke' : 'the macro chain from cause to effect · which textbook links held or broke over the window', 16, ty + 16);
  let x = 16; const y2 = ty + 32;
  for (const [k, c, w] of [['holding', C.blue, 'holding'], ['broken', C.gold, 'broken'], ['quiet', C.tx2, 'quiet']]) { const s = `${cnt(k)} ${w}`; ctx.fillStyle = c; ctx.fillText(s, x, y2); x += ctx.measureText(s).width + 14; }
  const at = cur > 0 ? route.stops[cur - 1] : null; ctx.fillStyle = C.tx;
  ctx.fillText(at ? `stop ${cur}/${route.stops.length}: ${String(at.label).replace(/\s*\(.*\)/, '')}` : `${route.stops.length} stops on the busiest path`, 16, y2 + 16);
  // the route strip
  const ky = H - (cp ? 128 : 104), sw = cp ? W - 48 : Math.min(W * 0.5, 520), sx = (W - sw) / 2, sy = ky - (cp ? 22 : 26);
  ctx.globalAlpha = fade * 0.35; ctx.strokeStyle = C.tx2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + sw, sy); ctx.stroke();
  ctx.globalAlpha = fade * 0.75; ctx.strokeStyle = C.cy ?? C.blue; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + sw * p, sy); ctx.stroke();
  route.stops.forEach((s, i) => { const tx = sx + sw * times[i + 1]; ctx.globalAlpha = fade * 0.9; ctx.fillStyle = s.kind === 'broken' ? C.gold : s.kind === 'holding' ? C.blue : C.tx2; ctx.beginPath(); ctx.arc(tx, sy, s.kind === 'broken' ? 3.5 : 2.5, 0, 6.2832); ctx.fill(); });
  ctx.globalAlpha = fade; ctx.fillStyle = C.tx; ctx.beginPath(); ctx.moveTo(sx + sw * p, sy - 3); ctx.lineTo(sx + sw * p + 4, sy - 9); ctx.lineTo(sx + sw * p - 4, sy - 9); ctx.closePath(); ctx.fill();
  // the key
  shade(ctx, g, 0, ky - 18, W, cp ? 78 : 60);
  ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'left';
  const items = cp ? [[C.blue, 'holding', 2], [C.gold, 'broken', 4], [C.tx2, 'quiet', 0.8]] : [[C.blue, 'link HOLDING: steady blue tube', 2], [C.gold, 'link BROKEN: thick flickering gold', 4], [C.tx2, 'quiet: a faint thread', 0.8]];
  x = 16;
  for (const [c, s, lw] of items) { ctx.globalAlpha = g.fade * 0.9; ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x, ky - 4); ctx.lineTo(x + 24, ky - 4); ctx.stroke(); ctx.fillStyle = C.tx2; ctx.fillText(s, x + 30, ky); x += ctx.measureText(s).width + 48; }
  ctx.globalAlpha = g.fade * 0.85; ctx.fillStyle = C.tx2;
  ctx.fillText(cp ? 'particles run cause → effect · orb size = move vs its noise' : 'particles run cause → effect, away from you · orb size = how far the market moved against its noise · rings = the stops on the route · drag to look, wheel to zoom', 16, ky + 16);
  ctx.fillStyle = C.gold; ctx.fillText(cp ? 'Which links held or broke: a description, not a signal.' : 'A description of which textbook links held or broke over the window. Not a forecast and not a signal.', 16, ky + 32);
  if (cp) { ctx.fillStyle = C.tx2; ctx.fillText('drag to look around · pinch or wheel to zoom', 16, ky + 48); }
  ctx.restore(); ctx.globalAlpha = 1;
}

/** A soft dark band behind words, fading out to the right (shade, not a box), so the glow never washes the words out. */
function shade(ctx, g, x, y, w, h) { const gr = ctx.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.42)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.save(); ctx.globalAlpha = g.fade; ctx.fillStyle = gr; ctx.fillRect(x, y, w, h); ctx.restore(); }

const hologram = glView({
  id: ID, label: 'FLY', env: { accent: 'blue2', chrome: 'clean', scan: false }, setup,
  onEnter(api) { S.clk = 0; api.st.yaw = 0; api.st.pitch = 0; api.st.zoom = 1; api.st.spin = false; },
  onLeave() { showP = null; },
});
/** No chain, no hologram: the words say so (and nothing is loaded for an empty picture). */
function draw(ctx, g, api) {
  const fly = flyFor(api);
  if (!fly || !fly.route.stops.length) { ctx.save(); ctx.globalAlpha = g.fade; ctx.fillStyle = g.C.tx2; ctx.font = '13px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText('The chain is not loaded', g.W / 2, g.H / 2); ctx.restore(); return; }
  hologram.draw(ctx, g, api);
}

registerJarvisModule({
  id: 'chainfly', label: 'FLY',
  render(pane, api) {
    pane.innerHTML = `<h3>FLY THE CHAIN</h3><p>The macro chain as a glowing tunnel you fly through, cause to effect. Each market is a glass orb on a pylon; each textbook link is a tube of light with particles running from cause to effect. A steady blue tube means the link is holding, a thick flickering gold one means it broke, and a faint thread means it was quiet. The camera rides the busiest path, flies through a ring gate at each market and slows at the broken links. Drag to look around, wheel to zoom.</p>
<p class="jv-sub">Description of which links held or broke over the window. Not a forecast and not a signal.</p><div class="jv-row"><button type="button" data-f="go">▶ FLY THE CHAIN</button></div>`;
    pane.querySelector('[data-f="go"]').onclick = () => { api.setMod('chain'); api.setView('chainfly'); };
  },
  views: [{ ...hologram, draw }],
});

registerShowScene({
  id: 'chainfly', after: 'chain',
  prepare: api => (api.st?.graph ? buildFly(api.st.graph, api.names) : null),
  build(inp, data) {
    if (!data?.script?.text) return null;
    return {
      title: 'Flying the chain', view: 'chainfly', cam: null, text: data.script.text,
      enter(api) { showP = 0; api.st.yaw = 0; api.st.pitch = 0; api.st.spin = false; },
      motion(api, p) { showP = p; },
    };
  },
});

export { draw as drawChainFly, LOOP_S };
