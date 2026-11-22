// js/terminal/jarvisViewGlobe.js: Jarvis's GLOBE (WORLD MAP), the HUD's default view, as a hologram (WebGL, js/terminal/jarvisGL.js). It replaces the flat Canvas 2D globe (drawGlobe in
// jarvisView.js, kept there as the fallback): a dark holographic Earth with a Fresnel atmosphere, glowing coastlines, a dot-matrix of land, a faint latitude/longitude graticule and points of
// light at the financial centres. Every chain market stands on its city (jarvisCore GEO) as a beacon of light; every textbook link of the chain is a glowing great-circle arc between two cities
// with particles running cause -> effect. The camera follows the HUD's globe state (st.gl, set by drag, wheel, the region buttons and the SHOW's api.globeTo): far from where it is heading it pulls
// back first and comes in again (a hop), and zoomed in it tilts towards the horizon so the beacons stand up in 3D (a SHOW focus on a market flies down to it).
//
// ENCODING
//   beacon height = the move as a share of its own noise floor (jarvisCore nodeStyle size, LINEAR, as on the old globe: 0.04 + 0.26 x size); a move of 3x its noise or more is capped and wears a
//                   ring crown, and its label says ">3x noise"
//   beacon colour = up (green) / down (red) with a chevron on top as the second cue; gold = the wrong-way end of a broken link (pulsing); a market inside its noise is a dim short stub
//   arcs          = holding link: a blue thread with slow particles; broken link: a thick pulsing gold arc with fast particles; quiet links are hidden unless they touch the selected market
//   labels        = the moving markets (the five biggest on a phone), the selection, and every market once zoomed in; name, move and multiple of its noise (and the city when zoomed or selected)
// Click a market: st.sel (the HUD's card lists its links). Other modules' globe layers (drawGlobe(ctx, g, api), e.g. MARKETS) are drawn over it with a g.P() that projects with this camera.
// Data: api.st.graph / api.st.sum (buildGraph over the chain links, held by the HUD), coastlines from jarvisLand.js; nothing is fetched here. Camera, facing, beacon sizes: globeCore.js (tested).
// DESCRIPTION ONLY: it shows what moved and which textbook links held or broke over the window. Nothing here is a forecast, a signal or a trade.
import { registerJarvisModule, EXTRA } from './jarvisModules.js';
import { glView } from './jarvisGL.js';
import { GEO, llToVec } from './jarvisCore.js';
import { CHAIN_NODES } from '../macroChain.js';
import { shortLabel } from './chainBoard.js';
import { placeLabels } from './reactorCore.js';
import { MARKET_GEO } from './jarvisMarkets.js';
import { globeCam, facing, beacon, moveLine, landGrid, seeded, edgeShow } from './globeCore.js';

const ID = 'globe3d', NAME = k => (CHAIN_NODES[k] ? shortLabel(CHAIN_NODES[k]) : k), LIFT = 0.3, NP_B = 12, NP_H = 4, ARC_N = 56;
const KEY = [['up', '▲ up'], ['dn', '▼ down'], ['gold', '◆ wrong-way end'], ['tx2', '│ inside its noise'], ['blue', '⌒ link holding'], ['gold', '⌒ link broke']];
const KEY_TXT = 'height = move against its own noise (crown past 3×) · description only, not a forecast';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ZERO = Object.freeze(Array(3).fill(0)), UNIT_Y = Object.freeze([0, 1, 0]);
const S = { hudTop: 70, hudAt: -9, bg: 'black', cam: null, off: 0 };

registerJarvisModule({
  id: ID, label: 'WORLD MAP',
  render(pane, api) {
    pane.innerHTML = '<h3>WORLD MAP</h3><p>The macro chain on a holographic Earth. Every market stands on its city as a beacon of light, as tall as its move against its own normal noise (capped at three times, and crowned when capped). Green is up, red is down, gold is the wrong-way end of a broken link. Every textbook link is an arc between two cities: a blue thread when it holds, a thick pulsing gold arc when it broke, with light running from cause to effect. Drag to turn, scroll to zoom, pick a region, or click a market to read its links. A description of the window, not a forecast.</p><div class="jv-row"><button type="button" data-g="go">OPEN THE GLOBE</button></div>';
    pane.querySelector('[data-g="go"]').onclick = () => api.setView('globe');
  },
  views: [glView({
    id: 'globe', label: 'GLOBE', env: { accent: 'blue2', chrome: 'hud', scan: true },
    onEnter(api) { try { S.bg = api.win.getComputedStyle(api.doc.documentElement).getPropertyValue('--bg1').trim() || 'black'; } catch (e) { S.bg = 'black'; } },
    setup,
  })],
});

async function setup(L, H, api) {
  const { THREE } = L, kit = H.kit, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.01, 120);
  const LAND = await import('./jarvisLand.js').then(m => m.LAND).catch(() => []);
  scene.add(kit.dust(1500, 40));
  let earth = null, chain = null, colKey = '', graphRef, ed = null;
  const up3 = new THREE.Vector3(0, 1, 0), tv = new THREE.Vector3(), tmp = Array(3).fill(0);
  const dispose = o => { if (o) { scene.remove(o); kit.forget(o); } };
  const basic = (col, op) => new THREE.MeshBasicMaterial({ color: H.color(col), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending });

  // where the land is: the coastline rings filled on a small equirectangular canvas, read back once
  const landMask = (() => {
    try {
      const Wm = 720, Hm = 360, c = H.root.ownerDocument.createElement('canvas'); c.width = Wm; c.height = Hm; const x = c.getContext('2d', { willReadFrequently: true });
      x.fillStyle = 'white';
      for (const ring of LAND) { x.beginPath(); for (let i = 0; i < ring.length; i += 2) { const px = (ring[i] + 180) * 2, py = (90 - ring[i + 1]) * 2; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); x.fill('evenodd'); }
      const d = x.getImageData(0, 0, Wm, Hm).data;
      return (lat, lon) => { const px = clamp(Math.floor((lon + 180) * 2), 0, Wm - 1), py = clamp(Math.floor((90 - lat) * 2), 0, Hm - 1); return d[(py * Wm + px) * 4 + 3] > 127; };
    } catch (e) { return () => false; }
  })();
  const landPts = landGrid(landMask, 1.05);

  function buildEarth(C) {
    dispose(earth); earth = new THREE.Group(); scene.add(earth);
    // the body: an opaque dark sea (it hides everything round the back), lit a little towards the viewer
    const sea = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 48), new THREE.ShaderMaterial({
      uniforms: { c: { value: H.color(C.blue) } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f = max(0.0, dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(c * (0.01 + 0.07 * f * f), 1.0); }',
    }));
    earth.add(sea);
    // a Fresnel rim on the surface and a soft atmosphere outside it
    earth.add(new THREE.Mesh(new THREE.SphereGeometry(1.004, 72, 48), kit.holo(C.blue, { rim: 3.6, base: 0, scan: 0.25, opacity: 0.32 })));
    const Ra = 1.16, cc = Math.sqrt(1 - 1 / (Ra * Ra));
    earth.add(new THREE.Mesh(new THREE.SphereGeometry(Ra, 72, 48), new THREE.ShaderMaterial({
      uniforms: { c: { value: H.color(C.blue) }, k: { value: cc } }, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 c; uniform float k; varying vec3 vN; varying vec3 vV; void main(){ float d = -dot(normalize(vN), normalize(vV)); float x = clamp(d / k, 0.0, 1.0); float a = pow(x, 3.0) * 0.32; gl_FragColor = vec4(c * a, a); }',
    })));
    // the graticule: every 30 degrees, the equator a little brighter
    const segs = [], eq = [], r = 1.0015;
    const P = (la, lo) => llToVec(la, lo).map(v => v * r);
    for (let la = -60; la <= 60; la += 30) for (let lo = -180; lo < 180; lo += 3) (la === 0 ? eq : segs).push([...P(la, lo), ...P(la, lo + 3)]);
    for (let lo = -180; lo < 180; lo += 30) for (let la = -87; la < 87; la += 3) segs.push([...P(la, lo), ...P(la + 3, lo)]);
    earth.add(kit.segments(segs, C.blue, 0.06)); earth.add(kit.segments(eq, C.blue, 0.16));
    // the coastlines: one glowing line per ring
    const cs = [];
    for (const ring of LAND) { const n = ring.length / 2; for (let j = 0; j < n; j++) { const a = j * 2, b = ((j + 1) % n) * 2; cs.push(...llToVec(ring[a + 1], ring[a]).map(v => v * 1.0025), ...llToVec(ring[b + 1], ring[b]).map(v => v * 1.0025)); } }
    if (cs.length) {        // one draw call for every coast: fat glowing segments
      const cg = new L.LineSegmentsGeometry(); cg.setPositions(cs);
      const cm = new L.LineMaterial({ color: H.color(C.blue), linewidth: 1.2, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, worldUnits: false });
      cm.resolution.set(H.W || 1280, H.H || 720); kit._mats.add(cm); earth.add(new L.LineSegments2(cg, cm));
    }
    // the land as a dot matrix
    const dots = kit.points(Math.max(1, landPts.length), C.blue, 1.6, { opacity: 0.2 }), da = dots.geometry.attributes.position.array;
    landPts.forEach(([la, lo], i) => { const v = llToVec(la, lo); da[i * 3] = v[0] * 1.001; da[i * 3 + 1] = v[1] * 1.001; da[i * 3 + 2] = v[2] * 1.001; });
    earth.add(dots);
    // city lights: a small cluster round every market city (chain and desk markets), a few faint sparks along the coasts
    const rnd = seeded(11), cities = [...Object.values(GEO), ...Object.values(MARKET_GEO)].filter(g => Array.isArray(g) && Number.isFinite(g[0])), lights = [];
    for (const [la, lo] of cities) for (let j = 0; j < 7; j++) { const s = j === 0 ? 0 : 0.35 + 1.1 * rnd(), a = rnd() * Math.PI * 2; lights.push([la + Math.sin(a) * s, lo + Math.cos(a) * s / Math.max(0.3, Math.cos(la * Math.PI / 180)), j === 0 ? 1 : 0.35 + 0.4 * rnd()]); }
    for (const ring of LAND) for (let i = 0; i < ring.length; i += 2) if (rnd() < 0.09) lights.push([ring[i + 1], ring[i], 0.18 + 0.25 * rnd()]);
    const lp = kit.points(lights.length, C.tx, 2.2, { colors: true, opacity: 0.6 }), la2 = lp.geometry.attributes.position.array, lc = lp.geometry.attributes.color.array;
    lights.forEach(([la, lo, w], i) => { const v = llToVec(la, lo); for (let k = 0; k < 3; k++) { la2[i * 3 + k] = v[k] * 1.003; lc[i * 3 + k] = w; } });
    earth.add(lp);
    // an orbit ring with ticks, slowly turning, for depth when the camera tilts
    const orb = new THREE.Group(), os = [], ot = [], R2 = 1.42;
    for (let i = 0; i < 180; i++) { const a = i / 180 * Math.PI * 2, b = (i + 1) / 180 * Math.PI * 2; os.push([Math.cos(a) * R2, 0, Math.sin(a) * R2, Math.cos(b) * R2, 0, Math.sin(b) * R2]); }
    for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2, l = i % 6 ? 0.015 : 0.04; ot.push([Math.cos(a) * R2, 0, Math.sin(a) * R2, Math.cos(a) * (R2 + l), 0, Math.sin(a) * (R2 + l)]); }
    orb.add(kit.segments(os, C.blue, 0.08)); orb.add(kit.segments(ot, C.blue, 0.16)); orb.rotation.x = 0.38; orb.rotation.z = -0.2; earth.add(orb);
    earth.userData.orb = orb;
  }

  function buildChain(C, graph) {
    dispose(chain); chain = new THREE.Group(); scene.add(chain); graphRef = graph;
    const tcol = tone => (tone === 'up' ? C.up : tone === 'dn' ? C.dn : tone === 'wrong' ? C.gold : C.tx2);
    const beacons = [], edges = [];
    const ringPts = []; for (let i = 0; i <= 32; i++) { const a = i / 32 * Math.PI * 2; ringPts.push([Math.cos(a) * 0.016, 0.001, Math.sin(a) * 0.016]); }
    const coneG = new THREE.ConeGeometry(0.011, 0.022, 4), torG = new THREE.TorusGeometry(0.017, 0.0022, 6, 28), discG = new THREE.CircleGeometry(0.06, 40);
    for (const n of graph?.nodes ?? []) {
      const geo = GEO[n.key]; if (!geo) continue;
      const v = llToVec(geo[0], geo[1]), b0 = beacon(n, n.style?.size), col = tcol(b0.tone), live = b0.live, grp = new THREE.Group();
      grp.position.set(v[0], v[1], v[2]); grp.quaternion.setFromUnitVectors(up3, tv.set(v[0], v[1], v[2])); chain.add(grp);
      const pillar = kit.line([ZERO, UNIT_Y], col, live ? 2.6 : 1.2, live ? 0.95 : 0.4); grp.add(pillar);
      const glow = live ? kit.line([ZERO, UNIT_Y], col, 9, 0.16) : null; if (glow) grp.add(glow);
      const flare = kit.flare(col, live ? 0.07 : 0.035, live ? 0.95 : 0.45); grp.add(flare);
      const ring = kit.line(ringPts, col, 1.2, live ? 0.8 : 0.35); grp.add(ring);
      const disc = new THREE.Mesh(discG, kit.glowDisc(col, live ? 0.5 : 0.18)); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.0015; grp.add(disc);
      let chev = null; if (b0.dir && (live || b0.tone === 'quiet')) { chev = new THREE.Mesh(coneG, basic(col, live ? 0.95 : 0.35)); chev.rotation.y = Math.PI / 4; if (b0.dir === 'down') chev.rotation.x = Math.PI; grp.add(chev); }
      const crown = []; if (b0.capped) for (let i = 0; i < 2; i++) { const t = new THREE.Mesh(torG, basic(col, 0.9)); t.rotation.x = Math.PI / 2; t.scale.setScalar(1 + i * 0.45); grp.add(t); crown.push(t); }
      beacons.push({ key: n.key, n, v, grp, pillar, glow, flare, chev, crown, ring, disc, col, fs: live ? 0.07 : 0.035 });
    }
    let nb = 0, nh = 0;
    for (const e of graph?.edges ?? []) {
      const ga = GEO[e.from], gb = GEO[e.to]; if (!ga || !gb) continue;
      const a = llToVec(ga[0], ga[1]), b = llToVec(gb[0], gb[1]), om = Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1)), so = Math.sin(om) || 1e-9, hk = LIFT * Math.min(1, om / 1.2 + 0.25);
      const at = u => { const A = Math.sin((1 - u) * om) / so, B = Math.sin(u * om) / so, k = 1 + hk * Math.sin(Math.PI * u); return [(A * a[0] + B * b[0]) * k, (A * a[1] + B * b[1]) * k, (A * a[2] + B * b[2]) * k]; };
      const pts = []; for (let i = 0; i <= ARC_N; i++) pts.push(at(i / ARC_N));
      const kind = edgeShow(e, null).kind, col = kind === 'broken' ? C.gold : kind === 'holding' ? C.blue : C.tx2;
      const line = kit.line(pts, col, kind === 'broken' ? 3.2 : kind === 'holding' ? 1.6 : 1.1, kind === 'quiet' ? 0.5 : 0.85), glow = kind === 'broken' ? kit.line(pts, col, 10, 0.18) : null;
      chain.add(line); if (glow) chain.add(glow);
      const np = kind === 'broken' ? NP_B : kind === 'holding' ? NP_H : 0, p0 = kind === 'broken' ? nb : nh; if (kind === 'broken') nb += np; else nh += np;
      edges.push({ e, kind, line, glow, a, b, om, so, hk, np, p0, seed: (e.id?.length ?? 3) * 0.137 % 1 });
    }
    const partB = kit.points(Math.max(1, nb), 'white', 5.5, { colors: true }), partH = kit.points(Math.max(1, nh), 'white', 3.6, { colors: true });
    chain.add(partB); chain.add(partH);
    ed = { beacons, edges, partB, partH, colB: H.color(C.gold), colH: H.color(C.blue) };
  }

  function update(t, dt, api2, g) {
    const st = api2.st, C = g.C, calm = H.calm, ck = [C.blue, C.up, C.dn, C.gold, C.tx, C.tx2].join('|');
    if (ck !== colKey || !earth) { colKey = ck; buildEarth(C); graphRef = undefined; }
    if ((st.graph ?? null) !== graphRef) buildChain(C, st.graph ?? null);
    // the globe state, as the old 2D globe moved it: spin, then ease towards the target
    const gs = st.gl ?? (st.gl = { lat: 20, lon: 15, zoom: 1, tlat: 20, tlon: 15, tzoom: 1 }); gs.tzoom = clamp(gs.tzoom ?? 1, 0.8, 5);
    if (st.spin && !st.drag) { const r = dt * (calm ? 1.5 : 4); gs.tlon += r; gs.lon += r; }
    const dl = ((gs.tlon - gs.lon + 540) % 360 + 360) % 360 - 180, e = Math.min(1, dt * 3);
    gs.lon += dl * e; gs.lat += (gs.tlat - gs.lat) * e; gs.zoom += (gs.tzoom - gs.zoom) * e;
    const cam = globeCam(gs, { W: g.W, H: g.H, compact: g.compact }); S.cam = cam;
    camera.position.set(...cam.pos); camera.up.set(...cam.up); camera.lookAt(...cam.target);
    if (camera.fov !== cam.fov) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
    const off = Math.round(g.W / 2 - (g.cx ?? g.W / 2));        // a panel open beside the view: shift the picture left like the other views
    if (off !== S.off) { S.off = off; if (off) camera.setViewOffset(g.W, g.H, off, 0, g.W, g.H); else camera.clearViewOffset(); }
    if (earth?.userData.orb && !calm) earth.userData.orb.rotation.y = t * 0.05;
    if (!ed) return;
    // beacons: heights follow the HUD's eased sizes (st.disp), the wrong-way ends pulse, the selection glows brighter
    const sel = st.sel, pulse = calm ? 1 : 0.75 + 0.25 * Math.sin(t * Math.PI * 2 * 0.8);
    for (const o of ed.beacons) {
      const b = beacon(o.n, st.disp?.[o.key] ?? o.n.style?.size), h = b.h;
      // close to the camera (zoomed in) the markers shrink so they keep about the same size on screen and never swamp the view
      const kd = 1 + h, dc = Math.hypot(o.v[0] * kd - camera.position.x, o.v[1] * kd - camera.position.y, o.v[2] * kd - camera.position.z), ks = clamp(dc / 2.6, 0.1, 1);
      o.pillar.scale.y = h; if (o.glow) o.glow.scale.y = h; o.flare.position.y = h;
      const wp = b.tone === 'wrong' && !calm ? 1 + 0.3 * Math.sin(t * 4) : 1; o.flare.scale.setScalar(o.fs * wp * (sel === o.key ? 1.6 : 1) * ks);
      if (o.chev) { o.chev.position.y = h + 0.03 * ks; o.chev.scale.setScalar(ks); }
      o.ring.scale.set(ks, 1, ks); o.disc.scale.setScalar(ks);
      o.crown.forEach((c, i) => { c.position.y = h - (0.012 + i * 0.016) * ks; c.scale.setScalar((1 + i * 0.45) * ks); });
    }
    // links: holding and broken always, quiet ones only when they touch the selection; particles from cause to effect
    const pb = ed.partB.geometry.attributes.position.array, cb = ed.partB.geometry.attributes.color.array, ph = ed.partH.geometry.attributes.position.array, chh = ed.partH.geometry.attributes.color.array;
    for (const o of ed.edges) {
      const s = edgeShow(o.e, sel), dim = sel && !s.mine ? 0.3 : 1;
      o.line.visible = s.show; if (o.glow) o.glow.visible = s.show;
      o.line.material.opacity = (o.kind === 'broken' ? 0.95 * pulse : o.kind === 'holding' ? 0.8 : 0.55) * dim; if (o.glow) o.glow.material.opacity = 0.22 * pulse * dim;
      const pos = o.kind === 'broken' ? pb : ph, col = o.kind === 'broken' ? cb : chh, base = o.kind === 'broken' ? ed.colB : ed.colH, sp = o.kind === 'broken' ? 0.5 : 0.22;
      for (let j = 0; j < o.np; j++) {
        const i = (o.p0 + j) * 3, u = ((calm ? 0.3 : t * sp) + j / o.np + o.seed) % 1, A = Math.sin((1 - u) * o.om) / o.so, B = Math.sin(u * o.om) / o.so, k = 1 + o.hk * Math.sin(Math.PI * u);
        pos[i] = (A * o.a[0] + B * o.b[0]) * k; pos[i + 1] = (A * o.a[1] + B * o.b[1]) * k; pos[i + 2] = (A * o.a[2] + B * o.b[2]) * k;
        const w = s.show ? dim * (0.35 + 0.65 * Math.sin(Math.PI * u)) : 0; col[i] = base.r * w; col[i + 1] = base.g * w; col[i + 2] = base.b * w;
      }
    }
    for (const p of [ed.partB, ed.partH]) { p.geometry.attributes.position.needsUpdate = true; p.geometry.attributes.color.needsUpdate = true; }
  }

  // a point on (or h above) the unit sphere on screen, with z = how squarely it faces the camera (> 0 = this side of the globe), as the old globe's P()
  function P(vec, h = 0) {
    const k = 1 + (h || 0); tmp[0] = vec[0] * k; tmp[1] = vec[1] * k; tmp[2] = vec[2] * k;
    const s = H.toScreen(tmp, camera), z = s.z > -1 && s.z < 1 ? facing(tmp, S.cam?.pos ?? [0, 0, 3]) : -1;
    return { x: s.x, y: s.y, z };
  }

  function overlay(ctx, g, api2) {
    const { W, H: Hh, C, fade } = g, cp = g.compact, st = api2.st, gs = st.gl ?? {}, cam = S.cam; if (!cam) return;
    if (g.t - S.hudAt > 1) { S.hudAt = g.t; try { S.hudTop = parseFloat(api2.win.getComputedStyle(api2.doc.getElementById(api2.ID)).getPropertyValue('--jvtop')) || 70; } catch (e) { S.hudTop = 70; } }
    ctx.save(); ctx.globalAlpha = fade; ctx.textBaseline = 'alphabetic';
    const top = S.hudTop + (cp ? 40 : 36), keyY = Hh - (cp ? 80 : 70), obst = [];
    if (!cp) obst.push({ x: 0, y: S.hudTop, w: 250, h: 140 });                                  // the HUD's own readout, top left
    if (st.sel && (st.mod ?? 'chain') === 'chain') obst.push({ x: W - 470, y: Hh * 0.5, w: 470, h: Hh * 0.5 });  // the HUD's market card, bottom right
    const tone = t => (t === 'up' ? C.up : t === 'dn' ? C.dn : t === 'wrong' ? C.gold : C.tx2);
    const ctr = P(ZERO);
    if (!st.graph?.nodes?.length) { ctx.fillStyle = C.tx2; ctx.font = '13px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText('The macro chain is not loaded yet: the globe shows no markets.', W / 2, keyY - 30); }
    else if (ed) {
      // labels: collision-free, the selection first, then the biggest moves
      const items = [], vis = [], zoomed = (gs.zoom ?? 1) > 1.7 && !cp;
      const loud = new Set(ed.beacons.filter(o => o.n.style?.tone !== 'quiet' && o.n.style?.tone !== 'none').sort((a, b) => (b.n.style?.size ?? 0) - (a.n.style?.size ?? 0)).slice(0, 5).map(o => o.key));
      for (const o of ed.beacons) {
        const b = beacon(o.n, st.disp?.[o.key] ?? o.n.style?.size), base = P(o.v, 0); if (base.z <= 0.02) continue;
        const tip = P(o.v, b.h + 0.045), lim = top + 44;
        if (tip.y < lim && base.y > tip.y) { const f = clamp((base.y - lim) / (base.y - tip.y), 0, 1); tip.x = base.x + (tip.x - base.x) * f; tip.y = base.y + (tip.y - base.y) * f; }   // a tall beacon running off the top: label it where it is still on screen
        vis.push({ o, b, tip, base });
        const sel = st.sel === o.key; if (!((b.live && (!cp || loud.has(o.key))) || sel || zoomed)) continue;
        const l1 = NAME(o.key), parts = []; if (b.live || sel) parts.push(moveLine(b)); if (zoomed || sel) parts.push(GEO[o.key][2]);
        const l2 = parts.join(' · ');
        ctx.font = '600 12px ui-monospace,monospace'; const w1 = ctx.measureText(l1).width; ctx.font = '11px ui-monospace,monospace'; const w = Math.max(w1, l2 ? ctx.measureText(l2).width : 0) + 12, h = l2 ? 31 : 18;
        const side = tip.x >= ctr.x ? 1 : -1, fa = clamp(base.z * 3, 0, 1);
        items.push({ id: o.key, x: side > 0 ? tip.x + 10 : tip.x - 10 - w, y: tip.y - h / 2 - 8, w, h, side, pri: (sel ? 1000 : 0) + (b.live ? 100 : 0) + b.size * 50 + base.z, tip, l1, l2, b, fa });
      }
      const placed = placeLabels(items, { W, H: Hh, obstacles: obst, top, bottom: Hh - keyY + 18, step: 7, tries: 16 });
      for (const r of placed) {
        const it = items.find(x => x.id === r.id), col = tone(it.b.tone), sel = r.id === st.sel, a = fade * it.fa * (st.sel && !sel ? 0.65 : 1);
        ctx.globalAlpha = a * 0.55; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(it.tip.x, it.tip.y); ctx.lineTo(it.side > 0 ? r.x : r.x + r.w, r.y + r.h / 2); ctx.stroke();
        card(ctx, r.x, r.y, r.w, r.h, sel ? col : null, 0.8 * fade * it.fa);
        ctx.globalAlpha = a; ctx.textAlign = 'left'; ctx.font = '600 12px ui-monospace,monospace'; ctx.fillStyle = C.tx; ctx.fillText(it.l1, r.x + 6, r.y + 13);
        if (it.l2) { ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = it.b.live ? col : C.tx2; ctx.fillText(it.l2, r.x + 6, r.y + 26); }
        g.hit(r.id, r.x + r.w / 2, r.y + r.h / 2);
      }
      // every beacon is clickable at its tip; the selection wears a ring; a capped beacon says so even without a label
      ctx.font = '600 10px ui-monospace,monospace'; ctx.textAlign = 'center';
      for (const { o, b, tip, base } of vis) {
        g.hit(o.key, tip.x, tip.y);
        if (st.sel === o.key) { ctx.globalAlpha = fade; ctx.strokeStyle = C.tx; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(tip.x, tip.y, 13 + 2 * Math.sin(g.t * 3), 0, 6.2832); ctx.stroke(); }
        if (b.capped && !placed.some(r => r.id === o.key)) { ctx.globalAlpha = fade * clamp(base.z * 3, 0, 1) * 0.9; ctx.fillStyle = tone(b.tone); ctx.fillText('>3×', tip.x, tip.y - 10); }
      }
    }
    ctx.restore();
    // other modules' globe layers (MARKETS ...), projected with this camera
    const Rg = (Hh / 2) / Math.tan(cam.fov * Math.PI / 360) / Math.sqrt(Math.max(1e-6, cam.D * cam.D - 1)), gg = { P, X: ctr.x, Y: ctr.y, Rg, ctr: { lat: gs.lat, lon: gs.lon }, t: g.t, fade, zoom: gs.zoom ?? 1, compact: cp };
    for (const m of EXTRA) { if (m.id === ID || typeof m.drawGlobe !== 'function') continue; try { ctx.save(); m.drawGlobe(ctx, gg, api2); } catch (e) { /* a layer must never stop the frame */ } finally { ctx.restore(); } }
    ctx.save(); keyLine(ctx, g, keyY); ctx.restore();
  }

  function keyLine(ctx, g, y) {
    const { W, C, fade } = g, cp = g.compact; ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'left';
    const items = KEY.map(([c, s]) => [C[c] ?? C.tx2, s]), gap = 14, wOf = s => ctx.measureText(s).width;
    const rowW = row => row.reduce((a, [, s]) => a + wOf(s) + gap, -gap);
    const draw = (row, yy) => { let x = (W - rowW(row)) / 2; for (const [c, s] of row) { ctx.globalAlpha = fade * 0.9; ctx.fillStyle = c; ctx.fillText(s, x, yy); x += wOf(s) + gap; } };
    const one = [...items, [C.tx2, KEY_TXT]];
    if (!cp && rowW(one) < W - 48) { card(ctx, (W - rowW(one)) / 2 - 10, y - 13, rowW(one) + 20, 18, null, 0.5 * fade); draw(one, y); return; }
    const rows = cp ? [items.slice(0, 3), items.slice(3), [[C.tx2, 'height = move vs its noise · not a forecast']]] : [items, [[C.tx2, KEY_TXT]]];
    rows.forEach((row, i) => { const yy = y - (rows.length - 1 - i) * 14; card(ctx, (W - rowW(row)) / 2 - 8, yy - 12, rowW(row) + 16, 16, null, 0.45 * fade); draw(row, yy); });
  }

  function card(ctx, x, y, w, h, edge, a) {
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = S.bg || 'black'; ctx.fillRect(x, y, w, h);
    if (edge) { ctx.globalAlpha = Math.min(1, a * 1.5); ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
    ctx.restore();
  }

  return {
    scene, camera, update, overlay, bloom: { strength: 0.55, radius: 0.45, threshold: 0.18 },
    dispose() { dispose(earth); dispose(chain); earth = chain = null; ed = null; },
  };
}
