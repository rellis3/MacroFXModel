// js/terminal/jarvisGlobeHolo.js: the WORLD MAP globe as a hologram (WebGL, through the jarvisGL engine), and the globe parts it shares with MONEY GLOBE so both read as one family.
//
//   holoGlobeParts(L, H, C, land, opts) -> { sphere, orbit, glint, floor }   the shared Earth: an occluding core in the page colour, a Fresnel hologram shell with scan bands, an atmosphere
//                                                                          rim, the Natural Earth coastlines (near side bright with a soft glow, far side a ghost), a faint graticule; plus an
//                                                                          orbit ring with a running glint and a floor glow (used by MONEY GLOBE; the WORLD MAP uses the ring only)
//   GLOBE_HOLO        a glView ('globe-holo') that jarvisView.drawGlobe() draws directly (it is NOT in the nav: the core 'globe' view keeps its id, state and steering). The camera is
//                     ORTHOGRAPHIC and its box is set every frame from the HUD's own X, Y, Rg (jarvisGlobeHoloCore.orthoBox), and the Earth is turned by the same rotation as
//                     jarvisCore.globeProject, so the 2D labels, click targets and module layers (MARKETS rings) land exactly on the GL globe. Proven in jarvisGlobeHoloCore.test.mjs.
//   drawGlobeOverlay  the 2D half: labels for the loudest markets (collision-avoided, with leader lines), the selection ring, the click targets (st.proj) and the one-line key.
//
// ENCODING (the same as the 2D globe it replaces)
//   pillar height  = the market's move against its own normal noise (jarvisCore.nodeStyle size, linear 0..1 -> 0.04..0.30 globe radii); a glowing flare at the tip
//   pillar colour  = up / down / gold for the wrong-way end of a broken textbook link; grey = inside its noise. Second cue: a chevron over the tip points up or down with the move
//   threads        = the macro-chain links as great arcs lifted off the surface, particles running cause -> effect: blue = holding, gold (pulsing) = broken, faint grey = quiet
// Data: the chain graph already in the HUD (st.graph from the Chain tab's loaders). Nothing is fetched here. If WebGL is missing, jarvisView keeps drawing its old 2D globe.
// DESCRIPTION ONLY: what moved and which links held or broke. Never a forecast, a signal or a trade.
import { glView } from './jarvisGL.js';
import { GEO, llToVec, greatArc } from './jarvisCore.js';
import { CHAIN_NODES } from '../macroChain.js';
import { shortLabel } from './chainBoard.js';
import { placeLabels } from './moneyGlobeCore.js';
import { orthoBox, globeEuler, pillarH, labelPick } from './jarvisGlobeHoloCore.js';

const NA = 48;                         // samples per thread
const PER = 3;                         // particles per live thread
const KEY_PHONE = 'height = move vs its noise · ▲▼ direction · gold = broken link · not a forecast';
const vecR = (lat, lon, r = 1) => { const v = llToVec(lat, lon); return [v[0] * r, v[1] * r, v[2] * r]; };
const tcolOf = (C, tone) => (tone === 'up' ? C.up : tone === 'dn' ? C.dn : tone === 'wrong' ? C.gold : C.tx2);

// ───────────────────────── the shared Earth ─────────────────────────
let COAST = null, COAST_SRC = null;
/** Coastline segments [x0,y0,z0,x1,y1,z1]... on a sphere of radius r, built once per land array. */
function coastSegs(land, r = 1.002) {
  if (COAST && COAST_SRC === land) return COAST;
  const out = [];
  for (const ring of land ?? []) for (let i = 0; i + 3 < ring.length; i += 2) out.push(...vecR(ring[i + 1], ring[i], r), ...vecR(ring[i + 3], ring[i + 2], r));
  COAST = out; COAST_SRC = land; return out;
}
/** The shared hologram Earth. opts: bg (core colour), shell/atmo/coast/ghost/grat opacities, glow = coastline glow strength (0 = off). */
export function holoGlobeParts(L, H, C, land, opts = {}) {
  const { THREE } = L, kit = H.kit, o = { bg: 'black', shell: 0.55, atmo: 0.32, coast: 0.85, ghost: 0.07, grat: 0.07, glow: 0.1, ...opts };
  const sphere = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.992, 64, 48), new THREE.MeshBasicMaterial({ color: H.color(o.bg, 'black') })); core.renderOrder = -2; sphere.add(core);
  sphere.add(new THREE.Mesh(new THREE.SphereGeometry(1, 72, 54), kit.holo(C.blue, { rim: 2.6, base: 0.025, scan: 0.35, opacity: o.shell })));
  sphere.add(new THREE.Mesh(new THREE.SphereGeometry(1.1, 64, 48), kit.holo(C.blue, { rim: 4.5, base: 0, scan: 0, opacity: o.atmo })));
  const flat = coastSegs(land);
  if (flat.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
    const mk = op => new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: H.color(C.blue), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending }));
    sphere.add(mk(o.coast));
    const ghost = mk(o.ghost); ghost.material.depthTest = false; ghost.renderOrder = -1; sphere.add(ghost);
    if (o.glow > 0) {        // a soft wide pass under the crisp coast: the land glows instead of being a hairline
      const sg = new L.LineSegmentsGeometry(); sg.setPositions(flat);
      const m = new L.LineMaterial({ color: H.color(C.blue), linewidth: 3.2, transparent: true, opacity: o.glow, depthWrite: false, blending: THREE.AdditiveBlending, worldUnits: false });
      m.resolution.set(H.W || 1280, H.H || 720); kit._mats.add(m); sphere.add(new L.LineSegments2(sg, m));
    }
  }
  const grat = [];
  for (let la = -60; la <= 60; la += 30) for (let i = 0; i < 72; i++) grat.push([...vecR(la, i * 5 - 180, 1.001), ...vecR(la, i * 5 - 175, 1.001)]);
  for (let lo = -180; lo < 180; lo += 30) for (let i = 0; i < 34; i++) grat.push([...vecR(i * 5 - 85, lo, 1.001), ...vecR(i * 5 - 80, lo, 1.001)]);
  sphere.add(kit.segments(grat, C.blue, o.grat));
  const ring = []; for (let i = 0; i <= 160; i++) { const a = i / 160 * Math.PI * 2; ring.push([Math.cos(a) * 1.42, 0, Math.sin(a) * 1.42]); }
  const orbit = kit.line(ring, C.blue, 1, 0.22), glint = kit.flare(C.blue, 0.09, 0.9); orbit.add(glint);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.9, 96), kit.glowDisc(C.blue, 0.12)); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.35;
  return { sphere, orbit, glint, floor };
}

// ───────────────────────── the WORLD MAP hologram ─────────────────────────
const S = { land: null, colKey: '', graph: null, bg: 'black' };

async function setup(L, H, api) {
  const { THREE } = L, kit = H.kit, scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-2, 2, 1, -1, 1, 120);
  camera.position.set(0, 0, 50); camera.lookAt(scene.position);
  if (!S.land) { try { S.land = (await import('./jarvisLand.js')).LAND; } catch (e) { S.land = []; } }
  try { S.bg = api.win.getComputedStyle(api.doc.documentElement).getPropertyValue('--bg1').trim() || 'black'; } catch (e) { S.bg = 'black'; }
  const frame = new THREE.Group(), world = new THREE.Group(); scene.add(frame); scene.add(world);
  const UP = new THREE.Vector3(0, 1, 0), tv = new THREE.Vector3(), shared = new Set();
  const boxG = new THREE.BoxGeometry(...Array(3).fill(1)).translate(0, 0.5, 0), coneG = new THREE.ConeGeometry(0.016, 0.034, 4), ringG = new THREE.RingGeometry(0.017, 0.023, 32).rotateX(-Math.PI / 2);
  [boxG, coneG, ringG].forEach(g => shared.add(g));
  const basic = (col, op) => new THREE.MeshBasicMaterial({ color: H.color(col), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending });
  const drop = o => o?.traverse?.(x => { if (x.geometry && !shared.has(x.geometry)) x.geometry.dispose?.(); const m = x.material; if (m) (Array.isArray(m) ? m : [m]).forEach(mm => { kit._mats.delete(mm); kit._holo.delete(mm); mm.dispose?.(); }); });
  let parts = null, back = null, threads = null, pillars = null, parts3 = null, box = '';

  function buildEarth(C) {
    for (const o of [parts?.sphere, parts?.orbit, back]) if (o) { o.parent?.remove(o); drop(o); }
    parts = holoGlobeParts(L, H, C, S.land, { bg: S.bg, shell: 0.55, atmo: 0.36, coast: 0.9, ghost: 0.07, grat: 0.08, glow: 0.1 });
    world.add(parts.sphere);
    parts.orbit.rotation.x = Math.PI / 2 - 0.32; parts.orbit.rotation.z = -0.16; frame.add(parts.orbit);
    back = new THREE.Group(); frame.add(back);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(2.1, 96), kit.glowDisc(C.blue, 0.16)); halo.position.z = -3; back.add(halo);
    const n = 700, dust = kit.points(n, C.blue, 1.7, { opacity: 0.5 }), a = dust.geometry.attributes.position.array;
    for (let i = 0; i < n; i++) { a[i * 3] = (Math.random() * 2 - 1) * 7; a[i * 3 + 1] = (Math.random() * 2 - 1) * 5; a[i * 3 + 2] = -4 - Math.random() * 20; }
    back.add(dust); back.userData.dust = dust;
  }

  function buildChain(C, gr) {
    for (const o of [threads?.grp, pillars?.grp, parts3]) if (o) { o.parent?.remove(o); drop(o); }
    threads = { grp: new THREE.Group(), list: [] }; pillars = { grp: new THREE.Group(), list: [] }; parts3 = null;
    world.add(threads.grp); world.add(pillars.grp);
    if (!gr) return;
    for (const e of gr.edges ?? []) {
      if (!GEO[e.from] || !GEO[e.to]) continue;
      const a = llToVec(GEO[e.from][0], GEO[e.from][1]), b = llToVec(GEO[e.to][0], GEO[e.to][1]), pts = [], flat = new Float32Array((NA + 1) * 3);
      for (let i = 0; i <= NA; i++) { const q = greatArc(a, b, i / NA, 0.3), k = 1 + q.h; pts.push([q.v[0] * k, q.v[1] * k, q.v[2] * k]); flat.set(pts[i], i * 3); }
      const v = e.verdict, col = v === 'broken' ? C.gold : v === 'holding' ? C.blue : C.tx2, w = v === 'broken' ? 2.6 : v === 'holding' ? 1.8 : 1;
      const core = kit.line(pts, col, w, 0.8), glow = kit.line(pts, col, w * 3.6, 0.1);
      threads.grp.add(glow); threads.grp.add(core);
      threads.list.push({ e, flat, core, glow, col: H.color(col), seed: (threads.list.length * 0.137) % 1 });
    }
    parts3 = kit.points(Math.max(1, threads.list.length * PER), 'white', 6, { colors: true }); threads.grp.add(parts3);
    for (const n of gr.nodes ?? []) {
      const geo = GEO[n.key]; if (!geo) continue;
      const tone = n.style?.tone ?? 'none', col = tcolOf(C, tone), live = tone !== 'quiet' && tone !== 'none', dim = live ? 1 : tone === 'quiet' ? 0.42 : 0.25;
      const grp = new THREE.Group(), v = llToVec(geo[0], geo[1]); grp.position.set(v[0], v[1], v[2]); tv.set(v[0], v[1], v[2]); grp.quaternion.setFromUnitVectors(UP, tv); pillars.grp.add(grp);
      const core = new THREE.Mesh(boxG, basic(col, 0.95 * dim)), glow = new THREE.Mesh(boxG, basic(col, 0.22 * dim)), ring = new THREE.Mesh(ringG, basic(col, 0.8 * dim));
      const tip = kit.flare(col, 0.06, 0.95 * dim), halo = kit.flare(col, 0.2, (live ? 0.3 : 0.1) * dim), foot = kit.flare(col, 0.07, 0.7 * dim);
      grp.add(glow); grp.add(core); grp.add(ring); grp.add(tip); grp.add(halo); grp.add(foot); foot.position.y = 0.003;
      let chev = null; const dir = n.end?.dir;
      if (live && (dir === 'up' || dir === 'dn')) { chev = new THREE.Mesh(coneG, basic(col, 0.95)); chev.rotation.y = Math.PI / 4; if (dir === 'dn') chev.rotation.x = Math.PI; grp.add(chev); }
      pillars.list.push({ key: n.key, n, grp, core, glow, ring, tip, halo, foot, chev, live, wrong: tone === 'wrong' });
    }
  }

  function update(t, dt, api2, g) {
    const C = g.C, G = g.globe; if (!G) return;
    const ck = [C.blue, C.up, C.dn, C.gold, C.tx, C.tx2, S.bg].join('|');
    if (ck !== S.colKey || !parts) { S.colKey = ck; buildEarth(C); S.graph = null; }
    if (G.graph !== S.graph) { S.graph = G.graph; buildChain(C, G.graph); }
    // the camera box: the HUD's X, Y, Rg exactly
    const b = orthoBox(g.W, g.H, G.X, G.Y, G.Rg), bk = `${b.left}|${b.right}|${b.top}|${b.bottom}`;
    if (bk !== box) { box = bk; camera.left = b.left; camera.right = b.right; camera.top = b.top; camera.bottom = b.bottom; camera.updateProjectionMatrix(); }
    const e = globeEuler(G.lat, G.lon); world.rotation.set(e.x, e.y, e.z, e.order);
    const calm = H.calm, zoom = Math.max(0.5, G.zoom || 1), k = 1 / Math.sqrt(zoom), sel = G.sel;
    // the frame: orbit ring (smaller on a phone, gone when zoomed into a region), the glint running round it
    parts.orbit.visible = zoom < 1.5; parts.orbit.scale.setScalar(g.compact ? 0.83 : 1);
    if (!calm) { const a = t * 0.35; parts.glint.position.set(Math.cos(a) * 1.42, 0, Math.sin(a) * 1.42); back.userData.dust.rotation.z = t * 0.004; }
    // pillars: height follows the smoothed size; widths shrink with zoom so a region close-up stays crisp; the wrong-way ones pulse
    for (const p of pillars?.list ?? []) {
      const size = G.disp?.[p.key] ?? p.n.style?.size ?? 0, h = pillarH(size), pulse = p.wrong && !calm ? 1 + 0.22 * Math.sin(t * 4) : 1, on = sel === p.key ? 1.35 : 1;
      p.core.scale.set(0.011 * k, h, 0.011 * k); p.glow.scale.set(0.034 * k * on, h, 0.034 * k * on);
      p.tip.position.y = h; p.tip.scale.setScalar((0.04 + 0.05 * size) * k * pulse * on);
      p.halo.position.y = h; p.halo.scale.setScalar((0.06 + 0.08 * size) * k * pulse * on);
      p.foot.scale.setScalar(0.07 * k); p.ring.scale.setScalar(k * (0.8 + 0.6 * size));
      if (p.chev) { p.chev.position.y = h + 0.04 * k; p.chev.scale.setScalar(k * on); }
    }
    // threads: holding and broken always; quiet faint; anything touching the selection brighter; particles run cause -> effect
    if (threads && parts3) {
      const pos = parts3.geometry.attributes.position.array, col = parts3.geometry.attributes.color.array, beat = calm ? 1 : 0.7 + 0.3 * Math.sin(t * 4);
      threads.list.forEach((r, i) => {
        const v = r.e.verdict, touch = sel != null && (r.e.from === sel || r.e.to === sel), hot = v === 'holding' || v === 'broken';
        const op = v === 'broken' ? 0.85 * beat : v === 'holding' ? 0.55 : v === 'quiet' ? (touch ? 0.5 : 0.13) : touch ? 0.4 : 0;
        r.core.visible = r.glow.visible = op > 0; r.core.material.opacity = op; r.glow.material.opacity = op * (hot || touch ? 0.07 : 0.03);
        const run = hot || touch, spd = v === 'broken' ? 0.5 : 0.28;
        for (let j = 0; j < PER; j++) {
          const ix = (i * PER + j) * 3, u = ((calm ? 1 / (2 * PER) : t * spd + r.seed) + j / PER) % 1, f = u * NA, i0 = Math.min(NA - 1, Math.floor(f)), w = f - i0, a0 = i0 * 3, b0 = a0 + 3;
          pos[ix] = r.flat[a0] + (r.flat[b0] - r.flat[a0]) * w; pos[ix + 1] = r.flat[a0 + 1] + (r.flat[b0 + 1] - r.flat[a0 + 1]) * w; pos[ix + 2] = r.flat[a0 + 2] + (r.flat[b0 + 2] - r.flat[a0 + 2]) * w;
          const br = run ? 0.45 + 0.75 * Math.sin(Math.PI * u) : 0; col[ix] = r.col.r * br; col[ix + 1] = r.col.g * br; col[ix + 2] = r.col.b * br;
        }
      });
      parts3.geometry.attributes.position.needsUpdate = true; parts3.geometry.attributes.color.needsUpdate = true;
    }
  }

  return {
    scene, camera, update, bloom: { strength: 0.6, radius: 0.45, threshold: 0.18 },
    dispose() { for (const o of [parts?.sphere, parts?.orbit, back, threads?.grp, pillars?.grp]) if (o) { o.parent?.remove(o); drop(o); } parts = back = threads = pillars = parts3 = null; S.colKey = ''; S.graph = null; },
  };
}

/** The core globe's WebGL layer. jarvisView calls GLOBE_HOLO.draw(ctx, g, api) with g.globe = { X, Y, Rg, lat, lon, zoom, graph, disp, sel }. */
export const GLOBE_HOLO = glView({ id: 'globe-holo', label: 'WORLD MAP', env: { accent: 'blue2' }, setup });

// ───────────────────────── the 2D overlay ─────────────────────────
const LBL = [];                       // label candidates, reused every frame
/**
 * Labels, selection ring, click targets and key on the HUD canvas, all from the same P() as the GL globe.
 * o = { P, X, Y, Rg, zoom, graph, disp, sel, compact, fade, t, C, W, H, top, bottom, bg, hit(key, x, y), key: show the key, legendY: desktop legend top, obstacles: [{x,y,w,h}] (the market card) }
 */
export function drawGlobeOverlay(ctx, o) {
  const { P, graph, C, fade, W, compact } = o, Hh = o.H; if (!graph) return;
  const zoom = o.zoom || 1, items = LBL; items.length = 0;
  for (const n of graph.nodes) {
    const geo = GEO[n.key]; if (!geo) continue;
    const v = llToVec(geo[0], geo[1]), size = o.disp?.[n.key] ?? n.style?.size ?? 0, base = P(v, 0); if (base.z <= 0.02) continue;
    const tip = P(v, pillarH(size)), tone = n.style?.tone ?? 'none';
    items.push({ key: n.key, n, size, base, tip, tone, live: tone !== 'quiet' && tone !== 'none', front: base.z > 0.12 });
    o.hit(n.key, tip.x, tip.y);
  }
  ctx.save(); ctx.textBaseline = 'alphabetic';
  // the selection ring
  const s = items.find(x => x.key === o.sel);
  if (s) { const r = (7 + s.size * 9) * Math.sqrt(zoom); ctx.globalAlpha = fade; ctx.strokeStyle = C.tx; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(s.tip.x, s.tip.y, r, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 0.35 * fade; ctx.beginPath(); ctx.arc(s.tip.x, s.tip.y, r + 5, 0, 6.2832); ctx.stroke(); }
  // labels: the loudest few (phone) or every live market (desktop), placed so none overlap, each with a leader line to its pillar
  const want = labelPick(items, { compact, zoom, sel: o.sel, phoneN: 4 }), by = new Map(items.map(x => [x.key, x])), cands = [];
  want.forEach((k, i) => {
    const it = by.get(k), nm = CHAIN_NODES[k] ? shortLabel(CHAIN_NODES[k]) : k, dir = it.n.end?.dir, arrow = dir === 'up' ? '▲' : dir === 'dn' ? '▼' : '•';
    const l2 = it.n.end?.text ? `${arrow} ${it.n.end.text}${it.tone === 'wrong' ? ' · wrong way' : ''}${(zoom > 1.7 && !compact) || k === o.sel ? ` · ${GEO[k][2]}` : ''}` : (k === o.sel ? GEO[k][2] : null);
    ctx.font = '600 12px ui-monospace,monospace'; const w1 = ctx.measureText(nm).width; ctx.font = '11px ui-monospace,monospace';
    const w = Math.max(w1, l2 ? ctx.measureText(l2).width : 0) + 12, h = l2 ? 31 : 18, side = it.tip.x >= o.X ? 1 : -1;
    cands.push({ id: k, x: side > 0 ? it.tip.x + 14 : it.tip.x - 14 - w, y: it.tip.y - h / 2 - 8, w, h, pri: (k === o.sel ? 1000 : 0) + 100 - i, side, it, l1: nm, l2 });
  });
  const obst = [...(o.obstacles ?? [])];
  if (o.key && !compact && o.legendY != null) {
    const x0 = 24, y0 = o.legendY; ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'left';
    const rows = [[C.tx2, 'KEY'], [C.tx, '▮ height = move vs its own noise'], [C.up, '▲ up'], [C.dn, '▼ down'], [C.gold, '◆ wrong way on a broken link'], [C.blue, '━ link holding'], [C.gold, '━ link broken (pulses)'], [C.tx2, '─ link quiet'], [C.tx2, 'description only, not a forecast']];
    ctx.globalAlpha = fade * 0.55; ctx.fillStyle = o.bg || 'black'; ctx.fillRect(x0 - 8, y0 - 14, 250, rows.length * 14 + 8);
    rows.forEach(([c, txt], i) => { ctx.globalAlpha = fade * (i ? 0.85 : 0.6); ctx.fillStyle = c; ctx.fillText(txt, x0, y0 + i * 14); });
    obst.push({ x: x0 - 4, y: y0 - 12, w: 250, h: rows.length * 14 + 4 });
  }
  const lo = { W, H: Hh, top: o.top ?? 0, bottom: o.bottom ?? 0, step: 7, tries: 10 }, placed = placeLabels(cands, { ...lo, obstacles: obst });
  if (placed.length < cands.length) {        // no room on its own side (the card, the edge): try the other side of the pillar
    const got = new Set(placed.map(r => r.id)), flip = cands.filter(c => !got.has(c.id)).map(c => { c.side = -c.side; c.x = c.side > 0 ? c.it.tip.x + 14 : c.it.tip.x - 14 - c.w; return c; });
    placed.push(...placeLabels(flip, { ...lo, obstacles: [...obst, ...placed] }));
  }
  for (const r of placed) {
    const c = cands.find(x => x.id === r.id), it = c.it, col = tcolOf(C, it.tone), a = fade * Math.max(0.6, Math.min(1, 0.6 + (it.base.z - 0.12) * 2)) * (it.live || c.id === o.sel ? 1 : 0.75);
    ctx.globalAlpha = a * 0.6; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(it.tip.x, it.tip.y); ctx.lineTo(c.side > 0 ? r.x : r.x + r.w, r.y + r.h / 2); ctx.stroke();
    ctx.globalAlpha = a * 0.66; ctx.fillStyle = o.bg || 'black'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = a * (c.id === o.sel ? 1 : 0.55); ctx.strokeStyle = col; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.globalAlpha = a; ctx.textAlign = 'left'; ctx.font = '600 12px ui-monospace,monospace'; ctx.fillStyle = C.tx; ctx.fillText(c.l1, r.x + 6, r.y + 13);
    if (c.l2) { ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = col; ctx.fillText(c.l2, r.x + 6, r.y + 26); }
    o.hit(c.id, r.x + r.w / 2, r.y + r.h / 2);
  }
  // the key. Phone: one line above the scrub bar. Desktop: a short legend under the HUD readout (top left), which the labels steer round
  if (o.key && compact) {
    ctx.globalAlpha = fade * 0.8; ctx.fillStyle = C.tx2; ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'center';
    const seg = KEY_PHONE.split(' · ');      // too wide: drop the middle parts, never the honesty line at the end
    while (seg.length > 2 && ctx.measureText(seg.join(' · ')).width > W - 24) seg.splice(seg.length - 2, 1);
    ctx.fillText(seg.join(' · '), W / 2, Hh - (o.bottom ?? 0) + 16, W - 16);
  }
  ctx.restore();
}
