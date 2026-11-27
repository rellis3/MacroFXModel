// js/terminal/jarvisViewReactor.js: Jarvis's CHAIN REACTOR. The macro chain (the same links and verdicts as the Chain tab, js/macroChain.js) as one glowing ring floating over a projector
// table, the camera tilted about 35 degrees and slowly turning. The ring is cut into the seven THEME sectors (Energy, Rates, Currencies, Equities, Risk, Credit, Metals and crypto), each named outside it.
// Every market is a thin vertical light bar standing at its slot; every textbook link is an arc over the centre (chord-diagram style, raised in 3D). In the middle a hologram core beats faster the
// more links are broken, with the readout "N links broken · M markets beyond their noise". It replaces SKYLINE (31 towers on a street grid), which was crowded.
//
// ENCODING
//   bar height  = |move| / its own noise floor, LINEAR up to 3x (two faint rulers mark 1x and 3x); above 3x the bar stops at full height and wears a notched crown marked ">3x"
//   bar colour  = up (green) / down (red) with a chevron as the second cue; the wrong-way end of a broken link is gold; a market inside its noise is a dim short stub; no data = a faint dot
//   arcs        = holding link: a thin thread in the accent blue; broken link: a thick, pulsing gold arc with particles running cause -> effect; quiet links are hidden (ALL LINKS shows them faintly)
//   core        = pulse rate follows the number of broken links
// Click a market: its links light up, everything else dims, and a card lists its links and verdicts. Click a sector name: the camera moves in on that sector. STORY: the camera visits each
// broken link in turn with a caption card; the SHOW scene 'reactor' drives the same tour from its narration.
// Data: api.st.graph (jarvisCore.buildGraph over evaluateChain) and api.st.sum (summariseChain), both already held by the HUD; nothing is fetched here. Layout, scaling, labels, link visibility and
// the story order live in reactorCore.js (pure, tested). DESCRIPTION ONLY: it shows which textbook links held or broke over the window. Nothing here is a forecast, a signal or a trade.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { glView, orbitPos } from './jarvisGL.js';
import { CHAIN_NODES } from '../macroChain.js';
import { shortLabel } from './chainBoard.js';
import { ringLayout, bars as barsOf, pickLabels, placeLabels, linkStyles, arcPoints, bez, storyStops, storyAt, pulseRate, readout, reactorScript, adaptiveFloors, yawFacing, angDiff, plainName, barHeight, RING_R, CAP } from './reactorCore.js';

const R = RING_R, TABLE_Y = -0.75, CORE_Y = 0.42, NP_BROKEN = 14, NP_HOLD = 2, STORY_S = 8, KEY_LINE = 'bar height = today’s move against its own noise · gold arc = a textbook link that broke · description only, not a forecast';
const NAME = k => (CHAIN_NODES[k] ? shortLabel(CHAIN_NODES[k]) : k);
const SAY = Object.fromEntries(Object.entries(CHAIN_NODES).map(([k, n]) => [k, plainName(n.label)]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const S = {
  graph: null, lay: null, bars: {}, stops: [], names: {}, showAll: false, selKey: null, focusSector: null, story: { on: false, i: 0, t: 0 }, showP: -1, showAt: 0, goYaw: null,
  base: 0.6, cam: null, styleKey: '', styles: [], hudTop: 70, hudAt: -9, bg: 'black', spin: null, colKey: '',
};

/** A plain sentence for a link's verdict on the card. */
const VERB = { holding: 'holding', broken: 'BROKEN', quiet: 'quiet', unmeasured: 'no data', notlive: 'not live' };

function sectorOf(name) { return S.lay?.sectors.find(s => s.name === name) ?? null; }
function currentStop() {
  if (S.showP >= 0 && Date.now() - S.showAt < 1500) { const a = storyAt(S.stops.length, S.showP); return a.i >= 0 ? S.stops[a.i] : null; }
  return S.story.on && S.stops.length ? S.stops[S.story.i % S.stops.length] : null;
}
const showing = () => S.showP >= 0 && Date.now() - S.showAt < 1500;

/** Button presses (g.hit keys 'rx:...') and market picks arrive through st.sel. A button restores the market selection it interrupted. */
function commands(api) {
  const st = api.st, s = st.sel;
  if (typeof s === 'string' && s.startsWith('rx:')) {
    const c = s.slice(3);
    if (c === 'all') S.showAll = !S.showAll;
    else if (c === 'story') { S.story.on = !S.story.on && S.stops.length > 0; S.story.i = 0; S.story.t = 0; S.focusSector = null; if (S.story.on) { S.selKey = null; userReset(st); } }
    else if (c === 'sn' || c === 'sp') { const n = S.stops.length || 1; S.story.i = (S.story.i + (c === 'sn' ? 1 : -1) + n) % n; S.story.t = 0; }
    else if (c === 'ring') { S.focusSector = null; S.story.on = false; userReset(st); }
    else if (c === 'close') S.selKey = null;
    else if (c.startsWith('sec:')) { const n = c.slice(4); S.focusSector = S.focusSector === n ? null : n; S.story.on = false; userReset(st); }
    st.sel = S.selKey; api.blip?.(780, 0.05); return;
  }
  if (s !== S.selKey) {
    const ok = typeof s === 'string' && S.bars[s];
    if (ok) { S.selKey = s; S.story.on = false; const sl = S.lay?.slots[s]; if (sl && !S.focusSector) S.goYaw = yawFacing(sl.angle); }
    else if (s == null) S.selKey = null;
  }
}
const userReset = st => { S.base += (st.yaw ?? 0.35) - 0.35; st.yaw = 0.35; st.pitch = -0.45; };

registerJarvisModule({
  id: 'reactor', label: 'REACTOR',
  render(pane, api) {
    pane.innerHTML = `<h3>CHAIN REACTOR</h3><p>The macro chain as one glowing ring. The ring is cut into seven sectors (energy, rates, currencies, equities, risk, credit, metals and crypto); every market is a light bar standing on it, as tall as its move against its own normal noise (capped at three times, and marked when capped). Green is up, red is down, gold is the wrong-way end of a broken link. Every textbook link is an arc across the middle: a thin blue thread when it holds, a thick pulsing gold arc when it broke. Click a market to light its links, click a sector to move in on it, or press STORY to visit each broken link.</p><p class="jv-sub">A description of which textbook links held or broke over the window. Not a forecast and not a signal.</p><div class="jv-row"><button type="button" data-r="go">OPEN THE REACTOR</button><button type="button" data-r="story">TOUR THE BROKEN LINKS</button></div>`;
    pane.querySelector('[data-r="go"]').onclick = () => api.setView('reactor');
    pane.querySelector('[data-r="story"]').onclick = () => { api.setView('reactor'); S.story = { on: S.stops.length > 0, i: 0, t: 0 }; };
  },
  views: [glView({
    id: 'reactor', label: 'REACTOR', env: { accent: 'blue2', chrome: 'clean', scan: false },
    onEnter(api) {
      S.spin = api.st.spin; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); S.focusSector = null; S.cam = null;
      try { S.bg = api.win.getComputedStyle(api.doc.documentElement).getPropertyValue('--bg1').trim() || 'black'; } catch (e) { S.bg = 'black'; }
    },
    onLeave(api) { S.showP = -1; S.story.on = false; if (S.spin != null) api.st.spin = S.spin; S.spin = null; },
    setup,
  })],
});

function setup(L, H, api) {
  const { THREE } = L, kit = H.kit, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  scene.add(kit.dust(1100, 34));
  let world = null, dyn = null;          // world = everything built from the graph; rebuilt when the graph or the theme colours change
  const tmp = new THREE.Vector3();

  function dispose(o) { o?.traverse?.(x => { x.geometry?.dispose?.(); const m = x.material; if (m) (Array.isArray(m) ? m : [m]).forEach(mm => { if (mm !== kit.dot()) mm.dispose?.(); }); }); }

  function build(C, graph) {
    if (world) { scene.remove(world); dispose(world); }
    world = new THREE.Group(); scene.add(world);
    const blue = C.blue, keys = (graph?.nodes ?? []).map(n => n.key);
    S.graph = graph; S.lay = ringLayout(keys); S.bars = barsOf(graph); S.names = Object.fromEntries(keys.map(k => [k, NAME(k)])); S.stops = storyStops(graph, S.lay, S.names); S.styleKey = '';
    // the projector table and its beam up to the ring
    world.add(kit.table(R * 1.4, blue, TABLE_Y, 6, 36));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.99, R * 1.12, -TABLE_Y, 96, 1, true), kit.holo(blue, { rim: 2.4, base: 0.0, scan: 0.6, opacity: 0.32 }));
    beam.position.y = TABLE_Y / 2; world.add(beam);
    const halo = new THREE.Mesh(new THREE.RingGeometry(R * 0.9, R * 1.12, 128), kit.glowDisc(blue, 0.18)); halo.rotation.x = -Math.PI / 2; halo.position.y = TABLE_Y + 0.01; world.add(halo);
    // the ring: one bright arc per sector, a thin outer rail, a tick per slot, and the 1x / 3x rulers (dotted circles at those bar heights)
    const secLines = {};
    for (const s of S.lay.sectors) {
      const pts = []; for (let i = 0; i <= 40; i++) { const a = s.a0 + (s.a1 - s.a0) * i / 40; pts.push([Math.cos(a) * R, 0, Math.sin(a) * R]); }
      const ln = kit.line(pts, blue, 3, 0.85); world.add(ln); secLines[s.name] = ln;
      const edge = []; for (const a of [s.a0, s.a1]) edge.push([Math.cos(a) * (R - 0.09), 0, Math.sin(a) * (R - 0.09), Math.cos(a) * (R + 0.16), 0, Math.sin(a) * (R + 0.16)]);
      world.add(kit.segments(edge, blue, 0.7));
    }
    const rail = [], ticks = [], ruler1 = [], ruler3 = [];
    for (let i = 0; i < 160; i++) { const a = i / 160 * Math.PI * 2, b = (i + 1) / 160 * Math.PI * 2; rail.push([Math.cos(a) * (R + 0.16), 0, Math.sin(a) * (R + 0.16), Math.cos(b) * (R + 0.16), 0, Math.sin(b) * (R + 0.16)]); }
    for (let i = 0; i < 120; i += 2) { const a = i / 120 * Math.PI * 2, b = (i + 1) / 120 * Math.PI * 2; for (const [arr, y] of [[ruler1, barHeight(1)], [ruler3, barHeight(CAP)]]) arr.push([Math.cos(a) * R, y, Math.sin(a) * R, Math.cos(b) * R, y, Math.sin(b) * R]); }
    for (const k of keys) { const a = S.lay.slots[k].angle; ticks.push([Math.cos(a) * (R - 0.07), 0, Math.sin(a) * (R - 0.07), Math.cos(a) * (R + 0.07), 0, Math.sin(a) * (R + 0.07)]); }
    world.add(kit.segments(rail, blue, 0.28)); world.add(kit.segments(ticks, C.tx, 0.45)); world.add(kit.segments(ruler1, C.tx2, 0.16)); world.add(kit.segments(ruler3, C.tx2, 0.09));
    // the bars
    const barObj = {}, boxG = new THREE.BoxGeometry(...Array(3).fill(1)).translate(0, 0.5, 0), coneG = new THREE.ConeGeometry(0.075, 0.12, 4), torG = new THREE.TorusGeometry(0.1, 0.009, 6, 24);
    const toneCol = tone => (tone === 'up' ? C.up : tone === 'dn' ? C.dn : tone === 'wrong' ? C.gold : C.tx2);
    const basic = (col, op) => new THREE.MeshBasicMaterial({ color: H.color(col), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const k of keys) {
      const b = S.bars[k], a = S.lay.slots[k].angle, x = Math.cos(a) * R, z = Math.sin(a) * R, col = toneCol(b.tone), grp = new THREE.Group(); grp.position.set(x, 0, z); world.add(grp);
      const quiet = b.tone === 'quiet' || b.tone === 'none', o = { grp, a, quiet, mats: [], ops: [] };
      const add = (mesh, op) => { grp.add(mesh); o.mats.push(mesh.material); o.ops.push(op); return mesh; };
      if (b.missing) { const f = kit.flare(C.tx2, 0.12, 0.5); f.position.y = 0.04; grp.add(f); o.mats.push(f.material); o.ops.push(0.5); barObj[k] = o; continue; }
      const core = add(new THREE.Mesh(boxG, basic(col, quiet ? 0.22 : 0.75)), quiet ? 0.22 : 0.75); core.scale.set(0.03, b.h, 0.03);
      const glow = add(new THREE.Mesh(boxG, basic(col, quiet ? 0.03 : 0.07)), quiet ? 0.03 : 0.07); glow.scale.set(0.085, b.h, 0.085);
      const tip = kit.flare(col, quiet ? 0.12 : 0.24, quiet ? 0.3 : 0.7); tip.position.y = b.h; add(tip, quiet ? 0.3 : 0.7);
      if (b.dir) { const ch = add(new THREE.Mesh(coneG, basic(col, quiet ? 0.35 : 0.95)), quiet ? 0.35 : 0.95); ch.position.y = b.h + 0.13; if (b.dir === 'down') ch.rotation.x = Math.PI; ch.rotation.y = Math.PI / 4; if (quiet) ch.scale.setScalar(0.7); }
      if (b.capped) {   // the notched crown: two rings and a flare, so a capped bar never looks like a plain 3x
        for (const dy of [0, -0.07, -0.14]) { const t = add(new THREE.Mesh(torG, basic(col, 0.9)), 0.9); t.rotation.x = Math.PI / 2; t.position.y = b.h + dy; t.scale.setScalar(1 - dy * 3); }
        const f = kit.flare(col, 0.45, 0.6); f.position.y = b.h; add(f, 0.6);
      }
      barObj[k] = o;
    }
    // the links
    const edgeObj = [];
    let nB = 0, nH = 0;
    for (const e of graph?.edges ?? []) {
      const sa = S.lay.slots[e.from], sb = S.lay.slots[e.to]; if (!sa || !sb) continue;
      const kind = e.verdict === 'broken' ? 'broken' : e.verdict === 'holding' ? 'holding' : 'quiet', arc = arcPoints(sa.angle, sb.angle, { n: 40 });
      const col = kind === 'broken' ? C.gold : kind === 'holding' ? blue : C.tx2;
      const line = kit.line(arc.pts, col, kind === 'broken' ? 3.4 : kind === 'holding' ? 1.2 : 1, 1), glow = kind === 'broken' ? kit.line(arc.pts, col, 9, 0.16) : null;
      world.add(line); if (glow) world.add(glow);
      edgeObj.push({ id: e.id, kind, line, glow, arc, p0: kind === 'broken' ? nB : nH, np: kind === 'broken' ? NP_BROKEN : kind === 'holding' ? NP_HOLD : 0, seed: (e.id.length * 0.137) % 1 });
      if (kind === 'broken') nB += NP_BROKEN; else if (kind === 'holding') nH += NP_HOLD;
    }
    const partB = kit.points(Math.max(1, nB), 'white', 5, { colors: true }), partH = kit.points(Math.max(1, nH), 'white', 3, { colors: true });
    world.add(partB); world.add(partH);
    // the core: a hologram shell, a turning wire heart, a flare, and a light column down to the table
    const hot = (S.lay && (graph?.edges ?? []).some(e => e.verdict === 'broken')) ? C.gold : blue;
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.27, 40, 28), kit.holo(hot, { rim: 1.8, base: 0.05, scan: 1 })); shell.position.y = CORE_Y; world.add(shell);
    const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), new THREE.MeshBasicMaterial({ color: H.color(hot), wireframe: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    heart.position.y = CORE_Y; world.add(heart);
    const flare = kit.flare(hot, 0.6, 0.6); flare.position.y = CORE_Y; world.add(flare);
    const column = kit.line([[0, TABLE_Y, 0], [0, CORE_Y, 0]], hot, 2, 0.35); world.add(column);
    const equator = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; equator.push([Math.cos(a) * 0.42, CORE_Y, Math.sin(a) * 0.42]); }
    const eq = kit.line(equator, hot, 1.4, 0.5); world.add(eq);
    const colB = H.color(C.gold), colH = H.color(blue);
    dyn = { barObj, edgeObj, partB, partH, shell, heart, flare, eq, secLines, colB, colH, hot };
  }

  function camUpdate(st, dt, g) {
    const calm = H.calm, stop = currentStop(), sec = S.focusSector ? sectorOf(S.focusSector) : null, cp = g.compact;
    const userYaw = (st.yaw ?? 0.35) - 0.35, zoom = clamp(st.zoom ?? 1, 0.4, 3);
    let yawT = null, dist = cp ? 13.5 : 8.4, el = cp ? 0.82 : 0.61, tg = [0, cp ? 0.1 : -0.05, 0];
    if (stop) {
      const ac = arcPointsCache(stop), mid = bez(ac.a, ac.c, ac.b, 0.5);
      yawT = stop.yaw; dist = cp ? 12 : 7.6; el = 0.8; tg = [mid[0] * 0.6, cp ? 0.2 : -0.45, mid[2] * 0.6];
    } else if (sec) { yawT = yawFacing(sec.mid); dist = cp ? 8.5 : 4.7; el = 0.4; tg = [Math.cos(sec.mid) * R * 0.78, 0.55, Math.sin(sec.mid) * R * 0.78]; }
    else if (showing()) { /* overview while the narration starts: a slow turn */ }
    const k = 1 - Math.exp(-dt * (calm ? 6 : 1.8));
    if (yawT != null) S.base += angDiff(S.base + userYaw, yawT) * k;
    else if (S.goYaw != null) { const d = angDiff(S.base + userYaw, S.goYaw); S.base += d * k; if (Math.abs(d) < 0.02) S.goYaw = null; }
    else if (!calm && !st.drag && !S.selKey) S.base += dt * 0.05;
    el = clamp(el - ((st.pitch ?? -0.45) + 0.45) * 0.8, 0.12, 1.35); dist /= zoom;
    const want = { el, dist, tx: tg[0], ty: tg[1], tz: tg[2] };
    if (!S.cam) S.cam = { ...want };
    for (const f of Object.keys(want)) S.cam[f] += (want[f] - S.cam[f]) * k;
    const p = orbitPos(S.base + userYaw, S.cam.el, S.cam.dist, [S.cam.tx, S.cam.ty, S.cam.tz]);
    camera.position.set(p[0], p[1], p[2]); camera.lookAt(S.cam.tx, S.cam.ty, S.cam.tz);
    const fov = cp ? 52 : 40; if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const off = Math.round(g.W / 2 - (g.cx ?? g.W / 2));        // a panel open beside the view: shift the picture left like the other views
    if (off !== S.off) { S.off = off; if (off) camera.setViewOffset(g.W, g.H, off, 0, g.W, g.H); else camera.clearViewOffset(); }
  }
  const arcCache = new Map();
  function arcPointsCache(stop) { let a = arcCache.get(stop.id); if (!a) { a = arcPoints(S.lay.slots[stop.from].angle, S.lay.slots[stop.to].angle, { n: 3 }); arcCache.set(stop.id, a); } return a; }

  function update(t, dt, api, g) {
    const st = api.st, graph = st.graph ?? null, C = g.C, ck = [C.blue, C.up, C.dn, C.gold, C.tx, C.tx2].join('|');
    if (graph !== S.graph || ck !== S.colKey || !world) { S.colKey = ck; arcCache.clear(); build(C, graph); }
    commands(api);
    if (S.story.on && !showing()) { S.story.t += dt; if (S.story.t > (H.calm ? STORY_S * 1.4 : STORY_S)) { S.story.t = 0; S.story.i = (S.story.i + 1) % Math.max(1, S.stops.length); } }
    camUpdate(st, dt, g);
    const d = dyn; if (!d) return;
    // which links show and how bright: a selected market lights its own; on a story stop, that link
    const stop = currentStop(), key = `${S.selKey}|${S.showAll}|${stop?.id ?? ''}`;
    if (key !== S.styleKey) {
      S.styleKey = key; S.styles = linkStyles(graph?.edges ?? [], { showAll: S.showAll, sel: S.selKey });
      if (stop && !S.selKey) S.styles = S.styles.map(s => ({ ...s, a: s.id === stop.id ? 1 : s.a * 0.14, show: s.show || s.id === stop.id }));
      const lit = new Set(); if (S.selKey) { lit.add(S.selKey); for (const e of graph?.edges ?? []) { if (e.from === S.selKey) lit.add(e.to); if (e.to === S.selKey) lit.add(e.from); } } else if (stop) { lit.add(stop.from); lit.add(stop.to); }
      for (const [k, o] of Object.entries(d.barObj)) { const dim = lit.size && !lit.has(k) ? 0.22 : 1; o.mats.forEach((m, i) => { m.opacity = o.ops[i] * dim; }); }
      const focus = S.focusSector; for (const [n, ln] of Object.entries(d.secLines)) ln.material.opacity = !focus ? 0.85 : n === focus ? 1 : 0.35;
    }
    const sty = new Map(S.styles.map(s => [s.id, s])), calm = H.calm, pulse = calm ? 1 : 0.72 + 0.28 * Math.sin(t * Math.PI * 2 * 0.9);
    const pb = d.partB.geometry.attributes.position.array, cb = d.partB.geometry.attributes.color.array, ph = d.partH.geometry.attributes.position.array, chh = d.partH.geometry.attributes.color.array;
    for (const o of d.edgeObj) {
      const s = sty.get(o.id) ?? { show: false, a: 0 }, vis = s.show && s.a > 0.01;
      o.line.visible = vis; if (o.glow) o.glow.visible = vis;
      o.line.material.opacity = s.a * (o.kind === 'broken' ? pulse : 1); if (o.glow) o.glow.material.opacity = 0.22 * s.a * pulse;
      const pos = o.kind === 'broken' ? pb : ph, col = o.kind === 'broken' ? cb : chh, base = o.kind === 'broken' ? d.colB : d.colH, sp = o.kind === 'broken' ? 0.22 : 0.08;
      for (let j = 0; j < o.np; j++) {
        const i = (o.p0 + j) * 3, u = ((calm ? 0.5 : t * sp) + j / o.np + o.seed) % 1, q = bez(o.arc.a, o.arc.c, o.arc.b, u), w = vis ? s.a * (o.kind === 'broken' ? 0.35 + 0.65 * Math.sin(Math.PI * u) : 0.5) : 0;
        pos[i] = q[0]; pos[i + 1] = q[1]; pos[i + 2] = q[2]; col[i] = base.r * w; col[i + 1] = base.g * w; col[i + 2] = base.b * w;
      }
    }
    d.partB.geometry.attributes.position.needsUpdate = true; d.partB.geometry.attributes.color.needsUpdate = true; d.partH.geometry.attributes.position.needsUpdate = true; d.partH.geometry.attributes.color.needsUpdate = true;
    // the core beats at a rate set by the number of broken links
    const rate = pulseRate(st.sum?.broken ?? S.stops.length), beat = calm ? 0.5 : Math.pow(0.5 + 0.5 * Math.sin(t * Math.PI * 2 * rate), 3);
    d.flare.scale.setScalar(0.5 + 0.45 * beat); d.flare.material.opacity = 0.35 + 0.45 * beat; d.shell.scale.setScalar(1 + 0.06 * beat);
    if (!calm) { d.heart.rotation.y = t * 0.6; d.heart.rotation.x = t * 0.23; }
    d.eq.material.opacity = 0.3 + 0.4 * beat;
  }

  function overlay(ctx, g, api) {
    const { W, H: Hh, C, fade } = g, cp = g.compact, st = api.st;
    if (g.t - S.hudAt > 1) { S.hudAt = g.t; try { S.hudTop = parseFloat(api.win.getComputedStyle(api.doc.getElementById(api.ID)).getPropertyValue('--jvtop')) || 70; } catch (e) { S.hudTop = 70; } }
    if (g.top > 0) S.hudTop = 62;   // the HUD has shifted this view below its menus (the safe area): lay out as under the plain top bar
    ctx.save(); ctx.globalAlpha = fade; ctx.textBaseline = 'alphabetic';
    if (!st.graph || !(st.graph.nodes?.length)) { ctx.fillStyle = C.tx2; ctx.font = '13px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText('The macro chain is not loaded yet, so there is no ring to draw.', W / 2, Hh / 2); ctx.restore(); return; }
    const top = S.hudTop + 8, obst = [], keyY = Hh - (cp ? 104 : 96);
    // buttons
    const btns = [['all', S.showAll ? 'ALL LINKS ✓' : 'ALL LINKS'], ['story', S.story.on ? '■ STOP STORY' : '▶ STORY']];
    if (S.focusSector || S.story.on) btns.push(['ring', 'WHOLE RING']);
    ctx.font = '600 12px ui-monospace,monospace'; const bh = cp ? 30 : 26, bw = btns.map(([, l]) => ctx.measureText(l).width + 24); let bx = W / 2 - (bw.reduce((a, b) => a + b, 0) + 8 * (btns.length - 1)) / 2;
    btns.forEach(([k, l], i) => {
      const on = (k === 'all' && S.showAll) || (k === 'story' && S.story.on);
      card(ctx, bx, top, bw[i], bh, on ? C.gold : C.blue, 0.8); ctx.fillStyle = on ? C.gold : C.tx; ctx.textAlign = 'center'; ctx.fillText(l, bx + bw[i] / 2, top + bh / 2 + 4);
      g.hit('rx:' + k, bx + bw[i] / 2, top + bh / 2); obst.push({ x: bx, y: top, w: bw[i], h: bh }); bx += bw[i] + 8;
    });
    // the core readout, just above the core
    const cs = H.toScreen([0, CORE_Y + 0.62, 0], camera), ro = readout(st.sum, S.bars), roF = cp ? '600 12px ui-monospace,monospace' : '600 13px ui-monospace,monospace';
    ctx.font = roF; const rw = ctx.measureText(ro).width + 22, ry = clamp(cs.y - 30, top + bh + 8, Hh - 200);
    card(ctx, cs.x - rw / 2, ry, rw, 24, (st.sum?.broken ?? 0) > 0 ? C.gold : C.blue, 0.72);
    ctx.textAlign = 'center'; ctx.fillStyle = (st.sum?.broken ?? 0) > 0 ? C.gold : C.tx; ctx.fillText(ro, cs.x, ry + 16.5); obst.push({ x: cs.x - rw / 2, y: ry, w: rw, h: 24 });
    // sector names, outside the ring (clickable)
    const secItems = [];
    ctx.font = `600 ${cp ? 11 : 12}px ui-monospace,monospace`;
    for (const s of S.lay.sectors) {
      const p = H.toScreen([Math.cos(s.mid) * (R + 0.62), -0.05, Math.sin(s.mid) * (R + 0.62)], camera); if (!p.vis) continue;
      const lab = (cp && s.name === 'Metals and crypto' ? 'METALS·CRYPTO' : s.name.toUpperCase()), w = ctx.measureText(lab).width + 12;
      secItems.push({ id: s.name, x: p.x - w / 2, y: p.y - 9, w, h: 18, pri: 100 - p.z, side: 1, lab, z: p.z, cx: p.x });
    }
    const secPlaced = placeLabels(secItems, { W, H: Hh, obstacles: obst, top, bottom: Hh - keyY + 20, step: 6, tries: 3 });
    for (const r of secPlaced) {
      const it = secItems.find(x => x.id === r.id), on = S.focusSector === r.id, back = clamp((it.z - 0.9) * 8, 0, 0.5);
      card(ctx, r.x, r.y, r.w, r.h, null, 0.55 - back * 0.6); ctx.globalAlpha = fade * (on ? 1 : 1 - back * 0.6); ctx.fillStyle = on ? C.gold : C.blue; ctx.textAlign = 'center'; ctx.fillText(it.lab, r.x + r.w / 2, r.y + 13);
      g.hit('rx:sec:' + r.id, r.x + r.w / 2, r.y + 9); obst.push(r);
    }
    ctx.globalAlpha = fade;
    // the market cards (cards sit before labels so labels steer round them)
    const stop = currentStop(); let cardBox = null;
    const leftSide = (g.cx ?? W / 2) < W / 2 - 10;
    if (S.selKey) cardBox = selCard(ctx, g, api, leftSide, top + bh + 10, keyY);
    else if (stop) cardBox = storyCard(ctx, g, stop, keyY);
    if (cardBox) obst.push(cardBox);
    // the "1x" / "3x" ruler marks at the front of the ring
    const fa = Math.atan2(camera.position.z, camera.position.x);
    ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = C.tx2; ctx.textAlign = 'left';
    for (const [r, lab] of [[1, '1× noise'], [CAP, '3× (cap)']]) { const a = fa + 0.5, p = H.toScreen([Math.cos(a) * (R + 0.05), barHeight(r), Math.sin(a) * (R + 0.05)], camera); if (p.vis && !cp) { const w = ctx.measureText(lab).width; const box = { x: p.x + 6, y: p.y - 11, w, h: 13 }; if (!obst.some(o => box.x < o.x + o.w && box.x + box.w > o.x && box.y < o.y + o.h && box.y + box.h > o.y)) { ctx.globalAlpha = fade * 0.75; ctx.fillText(lab, p.x + 6, p.y - 1); obst.push(box); } } }
    ctx.globalAlpha = fade;
    // market labels: the biggest movers, the selection and its partners, the story stop's ends
    const partners = []; if (S.selKey) for (const e of st.graph.edges) { if (e.from === S.selKey) partners.push(e.to); if (e.to === S.selKey) partners.push(e.from); }
    if (stop && !S.selKey) partners.push(stop.from, stop.to);
    const secKeys = S.focusSector && !S.selKey && !stop ? (sectorOf(S.focusSector)?.keys ?? []) : [];
    const want = pickLabels(S.bars, { n: S.selKey || stop || secKeys.length ? 0 : cp ? 4 : 8, sel: S.selKey, partners: [...partners, ...secKeys] }), cx0 = H.toScreen(Array(3).fill(0), camera).x, items = [];
    for (const [i, k] of want.entries()) {
      const b = S.bars[k], sl = S.lay.slots[k]; if (!b || !sl) continue;
      const a = sl.angle, tipY = b.missing ? 0.05 : b.h + 0.2, tp = H.toScreen([Math.cos(a) * R, tipY, Math.sin(a) * R], camera), an = H.toScreen([Math.cos(a) * (R + 0.45), tipY + 0.1, Math.sin(a) * (R + 0.45)], camera);
      if (!tp.vis) continue;
      const side = an.x >= cx0 ? 1 : -1, l1 = S.names[k] ?? k, l2 = b.missing ? 'no data' : `${b.text} · ${b.capped ? '>3' : b.ratio.toFixed(1)}× noise`;
      ctx.font = '600 12px ui-monospace,monospace'; const w1 = ctx.measureText(l1).width; ctx.font = '11px ui-monospace,monospace'; const w = Math.max(w1, ctx.measureText(l2).width) + 12, h = cp ? 30 : 32;
      const pri = (k === S.selKey ? 1000 : partners.includes(k) ? 500 : 0) + (want.length - i) + (b.moved ? 1 : 0);
      items.push({ id: k, x: side > 0 ? an.x + 4 : an.x - 4 - w, y: an.y - h / 2, w, h, pri, side, tp, l1, l2, b });
    }
    const placed = placeLabels(items, { W, H: Hh, obstacles: obst, top, bottom: Hh - keyY + 18, step: 8, tries: 10 });
    for (const r of placed) {
      const it = items.find(x => x.id === r.id), col = toneColour(C, it.b), sel = r.id === S.selKey, dim = (S.selKey || stop) && !sel && !partners.includes(r.id) ? 0.45 : 1;
      ctx.globalAlpha = fade * 0.6 * dim; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(it.tp.x, it.tp.y); ctx.lineTo(it.side > 0 ? r.x : r.x + r.w, r.y + r.h / 2); ctx.stroke();
      card(ctx, r.x, r.y, r.w, r.h, sel ? col : null, 0.6 * dim);
      ctx.globalAlpha = fade * dim; ctx.textAlign = 'left'; ctx.font = '600 12px ui-monospace,monospace'; ctx.fillStyle = C.tx; ctx.fillText(it.l1, r.x + 6, r.y + 13);
      ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = col; ctx.fillText(it.l2, r.x + 6, r.y + 26);
      g.hit(r.id, r.x + r.w / 2, r.y + r.h / 2);
    }
    // every bar is clickable at its tip; a capped bar always says so, labelled or not
    ctx.globalAlpha = fade; ctx.font = '600 11px ui-monospace,monospace'; ctx.textAlign = 'center';
    // the notched crown already marks a capped bar; the '>3×' tag is extra, so on a phone it is left off, and on a wide screen it is drawn only where it collides with nothing
    // (a busy day can have twenty-odd capped bars, and a tag on each turned into a pile-up of overlapping text)
    const used = placed.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h })), hitsAny = q => used.some(r => q.x < r.x + r.w && q.x + q.w > r.x && q.y < r.y + r.h && q.y + q.h > r.y);
    for (const [k, b] of Object.entries(S.bars)) {
      const sl = S.lay.slots[k]; if (!sl) continue; const p = H.toScreen([Math.cos(sl.angle) * R, b.h, Math.sin(sl.angle) * R], camera); if (!p.vis) continue;
      g.hit(k, p.x, p.y);
      if (cp || !b.capped || placed.some(r => r.id === k) || S.selKey || stop) continue;
      const box = { x: p.x - 13, y: p.y - 37, w: 26, h: 14 }; if (hitsAny(box)) continue;
      used.push(box); ctx.fillStyle = toneColour(C, b); ctx.globalAlpha = fade * 0.9; ctx.fillText('>3×', p.x, p.y - 26);
    }
    ctx.globalAlpha = fade;
    keyBlock(ctx, g, keyY);
    ctx.restore();
  }

  // the selected market: its move and every link it is part of, with the verdict
  function selCard(ctx, g, api, leftSide, y0, keyY) {
    const { W, C, fade } = g, cp = g.compact, k = S.selKey, b = S.bars[k], node = api.st.graph.nodes.find(n => n.key === k), e = node?.end;
    const rows = api.st.graph.edges.filter(x => x.from === k || x.to === k).sort((a, z) => rank(a.verdict) - rank(z.verdict));
    const w = cp ? W - 24 : 340, lineH = 15, n = Math.min(rows.length, cp ? 4 : 8), h = 62 + n * lineH + (rows.length > n ? lineH : 0);
    const x = cp ? 12 : leftSide ? 18 : W - w - 18, y = cp ? keyY - h - 24 : y0;
    card(ctx, x, y, w, h, toneColour(C, b), 0.82);
    ctx.globalAlpha = fade; ctx.textAlign = 'left'; ctx.font = '600 14px ui-monospace,monospace'; ctx.fillStyle = toneColour(C, b); ctx.fillText((S.names[k] ?? k).toUpperCase(), x + 12, y + 20);
    ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = C.tx;
    ctx.fillText(b.missing ? 'no data for this market over the window' : `${b.text} over the window · ${b.ratio.toFixed(1)}× its noise floor (${e?.floorText ?? '±' + e?.floor})${b.capped ? ' · capped' : ''}`, x + 12, y + 37, w - 24);
    ctx.fillStyle = C.tx2; ctx.fillText(rows.length ? `its ${rows.length} textbook link${rows.length === 1 ? '' : 's'}:` : 'no textbook link on this board', x + 12, y + 53);
    rows.slice(0, n).forEach((r, i) => {
      const yy = y + 68 + i * lineH, col = r.verdict === 'broken' ? C.gold : r.verdict === 'holding' ? C.blue : C.tx2;
      ctx.fillStyle = col; ctx.fillText(r.verdict === 'broken' ? '◆' : r.verdict === 'holding' ? '—' : '·', x + 12, yy);
      ctx.fillStyle = C.tx; ctx.fillText(clip(r.short, cp ? 30 : 32), x + 26, yy); ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.fillText(VERB[r.verdict] ?? r.verdict, x + w - 12, yy); ctx.textAlign = 'left';
    });
    if (rows.length > n) { ctx.fillStyle = C.tx2; ctx.fillText(`+ ${rows.length - n} more`, x + 26, y + 68 + n * lineH); }
    ctx.fillStyle = C.tx2; ctx.textAlign = 'right'; ctx.font = '600 13px ui-monospace,monospace'; ctx.fillText('✕', x + w - 10, y + 18); g.hit('rx:close', x + w - 14, y + 14); ctx.textAlign = 'left';
    return { x, y, w, h };
  }
  const rank = v => (v === 'broken' ? 0 : v === 'holding' ? 1 : 2);

  // the story caption: which broken link, both ends, the textbook and the one-line read
  function storyCard(ctx, g, stop, keyY) {
    const { W, C, fade } = g, cp = g.compact, i = S.stops.indexOf(stop), w = Math.min(cp ? W - 24 : 560, W - 24), x = (W - w) / 2;
    ctx.font = '11px ui-monospace,monospace';
    const tb = wrap(ctx, `Textbook: ${stop.textbook}.`, w - 24, 2), pu = wrap(ctx, typeof stop.punch === 'string' && stop.punch ? stop.punch : stop.read, w - 24, cp ? 2 : 2);
    const h = 64 + (tb.length + pu.length) * 14, y = keyY - h - 24;
    card(ctx, x, y, w, h, C.gold, 0.84);
    ctx.globalAlpha = fade; ctx.textAlign = 'left'; ctx.fillStyle = C.gold; ctx.font = '600 11px ui-monospace,monospace'; ctx.fillText(`BROKEN LINK ${i + 1} OF ${S.stops.length}`, x + 12, y + 16);
    ctx.font = `600 ${cp ? 14 : 16}px ui-monospace,monospace`; ctx.fillStyle = C.tx; ctx.fillText(stop.short.toUpperCase(), x + 12, y + 36, w - 90);
    ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = C.tx; ctx.fillText(`${stop.fromName} ${stop.fromText}  →  ${stop.toName} ${stop.toText}`, x + 12, y + 52, w - 24);
    ctx.fillStyle = C.tx2; tb.forEach((l, j) => ctx.fillText(l, x + 12, y + 68 + j * 14)); ctx.fillStyle = C.gold; pu.forEach((l, j) => ctx.fillText(l, x + 12, y + 68 + (tb.length + j) * 14));
    if (!showing()) {
      ctx.font = '600 14px ui-monospace,monospace'; ctx.fillStyle = C.tx; ctx.textAlign = 'center';
      ctx.fillText('‹', x + w - 58, y + 22); ctx.fillText('›', x + w - 24, y + 22); g.hit('rx:sp', x + w - 58, y + 18); g.hit('rx:sn', x + w - 24, y + 18);
      ctx.globalAlpha = fade * 0.5; ctx.fillRect(x + 12, y + h - 3, (w - 24) * clamp(S.story.t / STORY_S, 0, 1), 1.5);
    }
    ctx.globalAlpha = fade; return { x, y, w, h };
  }

  // the key: what each mark means, and the one line that says it is a description
  function keyBlock(ctx, g, y) {
    const { W, C, fade } = g, cp = g.compact; ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'left';
    card(ctx, 0, y - 16, W, cp ? 76 : 40, null, 0.55);
    const items = [[C.up, '▲ up'], [C.dn, '▼ down'], [C.gold, '◆ wrong-way end'], [C.tx2, '▮ inside its noise'], [C.blue, '— link holding'], [C.gold, '━ link broken'], [C.tx2, '♛ capped >3×']];
    const ws = items.map(([, s]) => ctx.measureText(s).width + 16);
    if (cp) {
      const rows = [items.slice(0, 4), items.slice(4)]; rows.forEach((row, ri) => { const rw = row.reduce((a, [, s]) => a + ctx.measureText(s).width + 14, 0); let x = (W - rw) / 2; row.forEach(([c, s]) => { ctx.globalAlpha = fade * 0.9; ctx.fillStyle = c; ctx.fillText(s, x, y + ri * 14); x += ctx.measureText(s).width + 14; }); });
      ctx.globalAlpha = fade * 0.85; ctx.fillStyle = C.tx2; ctx.textAlign = 'center';
      wrap(ctx, KEY_LINE, W - 24, 3).forEach((l, i) => ctx.fillText(l, W / 2, y + 32 + i * 13));
      return;
    }
    let x = (W - ws.reduce((a, b) => a + b, 0)) / 2;
    items.forEach(([c, s], i) => { ctx.globalAlpha = fade * 0.92; ctx.fillStyle = c; ctx.fillText(s, x, y); x += ws[i]; });
    ctx.globalAlpha = fade * 0.85; ctx.fillStyle = C.tx2; ctx.textAlign = 'center'; ctx.fillText(KEY_LINE, W / 2, y + 17);
  }

  function card(ctx, x, y, w, h, edge, a) {
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = S.bg || 'black'; ctx.fillRect(x, y, w, h);
    if (edge) { ctx.globalAlpha = Math.min(1, ctx.globalAlpha * 1.2); ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
    ctx.restore();
  }

  return {
    scene, camera, update, overlay, bloom: { strength: 0.6, radius: 0.42, threshold: 0.16 },
    dispose() { if (world) { scene.remove(world); dispose(world); } world = null; dyn = null; },
  };
  void tmp;
}

const toneColour = (C, b) => (b?.tone === 'up' ? C.up : b?.tone === 'dn' ? C.dn : b?.tone === 'wrong' ? C.gold : C.tx2);
const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
function wrap(ctx, text, maxW, maxLines = 3) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean), out = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur);
  if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = out[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
  return out;
}

// ── SHOW: after the biggest moves, the reactor; the camera flies across each broken link while Jarvis names them ──
registerShowScene({
  id: 'reactor', after: 'movers',
  prepare: async api => {
    if (!api.st?.graph) return null;
    // adaptive noise floors from each node's own history, said beside the fixed ones (Helix review wave 1.5); a failed fetch only drops that sentence
    let floors = null; try { const d = await api.jf('/api/drill-series'); floors = d?.ok === false ? null : adaptiveFloors(d, CHAIN_NODES); } catch (e) { floors = null; }
    return { graph: api.st.graph, sum: api.st.sum ?? null, floors };
  },
  build(inp, data) {
    const graph = data?.graph; if (!graph?.nodes?.length) return null;
    const sum = data?.sum ?? inp.chain ?? null, lay = ringLayout(graph.nodes.map(n => n.key)), names = Object.fromEntries(graph.nodes.map(n => [n.key, SAY[n.key] ?? n.key]));
    const text = reactorScript(sum, storyStops(graph, lay, names), barsOf(graph), names, inp?.guide ? null : data?.floors); if (!text) return null;
    return {
      title: 'The chain reactor', view: 'reactor', cam: null, text,
      enter(api) { S.showP = 0; S.showAt = Date.now(); S.story.on = false; S.focusSector = null; S.selKey = null; if (api?.st) { api.st.sel = null; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); } },
      motion(api, p) { S.showP = clamp(p, 0, 1); S.showAt = Date.now(); },
    };
  },
});
