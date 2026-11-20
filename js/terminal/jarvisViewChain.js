// js/terminal/jarvisViewChain.js: Jarvis's CHAIN FLY-THROUGH ("FLY"). The macro chain as a place you fly through, cause to effect: each market is a glowing orb on a pylon, each textbook link a tube of light
// with particles running cause -> effect (holding = steady blue, broken = thick flickering gold, quiet = almost invisible). The camera rides a rail through the busiest path, banking, passing through a ring
// at each stop, slowing at broken links, while the market's name and measured move flash up as you pass. Outside a SHOW it loops its own flight (about 25 s) and you can drag to look around and wheel to zoom.
// Inside the SHOW the flight is driven by the scene (progress p) and tied to the spoken script. Maths, rail and script: chainFlyCore.js (pure, tested).
// DESCRIPTION ONLY: it shows which textbook links held or broke over the window. None of it is a forecast or a validated forward signal, and the legend says so.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { buildFly, camAt, makeProjector, fogAlpha, labelAlpha } from './chainFlyCore.js';

const LOOP_S = 25, NSEG = 12, FLOOR = -1.7, NSTAR = 170;
let showP = null;                       // set by the SHOW scene while it drives the flight; null = the view flies its own loop
let cache = { graph: null, fly: null }, clk = 0, hudTop = 70, hudAt = 0;
const S = { edges: [], stars: null, parts: null, nodePrev: null, wasP: 0 };

const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** The edge's curve in world space: straight from cause to effect, bowed sideways so parallel links separate. */
function buildEdges(graph, fly) {
  const pos = fly.layout.pos;
  S.edges = graph.edges.filter(e => pos[e.from] && pos[e.to]).map(e => {
    const a = pos[e.from], b = pos[e.to], h = hash(e.id), side = (h < 0.5 ? -1 : 1) * (0.25 + 0.5 * hash(e.id + 'b')), lift = (hash(e.id + 'c') - 0.5) * 0.7, pts = new Float32Array(NSEG * 3);
    for (let i = 0; i < NSEG; i++) { const t = i / (NSEG - 1), w = Math.sin(Math.PI * t); pts[i * 3] = a[0] + (b[0] - a[0]) * t + side * w; pts[i * 3 + 1] = a[1] + (b[1] - a[1]) * t + lift * w; pts[i * 3 + 2] = a[2] + (b[2] - a[2]) * t; }
    const n = e.verdict === 'broken' ? 7 : e.verdict === 'holding' ? 4 : e.verdict === 'quiet' ? 1 : 0;
    return { e, pts, scr: new Float32Array(NSEG * 3), n, ph: Array.from({ length: n }, (_, j) => hash(e.id + j)), prev: new Float32Array(n * 2).fill(NaN), zMid: 0 };
  });
  S.order = S.edges.map((_, i) => i);
  S.nodePrev = new Map();
  if (!S.stars) {
    S.stars = new Float32Array(NSTAR * 3); S.starPrev = new Float32Array(NSTAR * 2).fill(NaN);
    for (let i = 0; i < NSTAR; i++) { S.stars[i * 3] = (rnd() - 0.5) * 16; S.stars[i * 3 + 1] = (rnd() - 0.5) * 7; S.stars[i * 3 + 2] = rnd() * (fly.layout.maxZ + 14) - 4; }
  }
}
function flyFor(api) {
  const g = api.st.graph; if (!g) return null;
  if (cache.graph !== g) { cache = { graph: g, fly: buildFly(g, api.names) }; if (cache.fly) buildEdges(g, cache.fly); }
  return cache.fly;
}

const toneCol = (C, t) => (t === 'up' ? C.up : t === 'dn' ? C.dn : t === 'wrong' ? C.gold : C.tx2);
const KIND = { broken: 'BROKEN LINK', holding: 'LINK HOLDING', move: 'MOVED' };

function draw(ctx, g, api) {
  const { W, H, C, t, dt } = g, st = api.st;
  st.spin = false;
  const fly = flyFor(api);
  if (!fly || !fly.route.stops.length) {
    ctx.globalAlpha = g.fade; ctx.fillStyle = C.tx2; ctx.font = '13px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText('The chain is not loaded', W / 2, H / 2); ctx.globalAlpha = 1; return;
  }
  const { route, layout, script } = fly, driven = showP != null, times = driven && script ? script.marks : route.times;
  if (!st.drag) { st.yaw *= 1 - Math.min(1, dt * 1.6); st.pitch *= 1 - Math.min(1, dt * 1.6); } else { st.yaw = clamp(st.yaw, -1.3, 1.3); }
  st.pitch = clamp(st.pitch, -0.8, 0.8); st.yaw = clamp(st.yaw, -1.5, 1.5);
  clk += dt;
  const dbg = globalThis.__jarvisFlyP, p = Number.isFinite(dbg) ? dbg : driven ? clamp(showP, 0, 1) : (clk / LOOP_S) % 1, wrap = driven || Number.isFinite(dbg) ? 1 : Math.min(1, Math.min(p, 1 - p) / 0.025) ;
  if (Math.abs(p - S.wasP) > 0.5) { S.stars?.length && S.starPrev.fill(NaN); for (const e of S.edges) e.prev.fill(NaN); S.nodePrev.clear(); }
  S.wasP = p;
  const cam = camAt(route, p, times); cam.roll += Math.sin(t * 0.8) * 0.008;
  const zoom = clamp(st.zoom || 1, 0.5, 2.6), pr = makeProjector(cam, st.yaw, st.pitch, 1.25 * zoom), SC = H * 0.40, ox = g.cx, oy = g.H * 0.52;
  const fade = g.fade * wrap, o = { x: 0, y: 0, z: 0 }, v3 = new Array(3).fill(0);
  const px = q => ox + q.x * SC, py = q => oy + q.y * SC, sz = q => (1.25 * zoom / Math.max(q.z, 0.2)) * SC * 0.02;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // ── the floor grid and the dust: the sense of speed ──
  ctx.lineWidth = 1; ctx.strokeStyle = C.blue;
  const z0 = Math.floor((cam.eye[2] - 1) / 1.3) * 1.3;
  for (let xi = -6; xi <= 6; xi += 1.5) for (let zi = 0; zi < 14; zi++) {
    const za = z0 + zi * 1.3; let a = pr([xi, FLOOR, za], { x: 0, y: 0, z: 0 }), b = pr([xi, FLOOR, za + 1.3], o);
    if (a.z < 0.3 || b.z < 0.3) continue; ctx.globalAlpha = fade * 0.2 * fogAlpha(a.z, 11); ctx.beginPath(); ctx.moveTo(px(a), py(a)); ctx.lineTo(px(b), py(b)); ctx.stroke();
  }
  for (let zi = 0; zi < 14; zi++) {
    const za = z0 + zi * 1.3, a = pr([-6, FLOOR, za], { x: 0, y: 0, z: 0 }), b = pr([6, FLOOR, za], o);
    if (a.z < 0.3 || b.z < 0.3) continue; ctx.globalAlpha = fade * 0.14 * fogAlpha(a.z, 11); ctx.beginPath(); ctx.moveTo(px(a), py(a)); ctx.lineTo(px(b), py(b)); ctx.stroke();
  }
  ctx.fillStyle = C.tx; ctx.strokeStyle = C.tx;
  { const S3 = S.stars, SP = S.starPrev, span = layout.maxZ + 14;
    for (let i = 0; i < NSTAR; i++) {
      v3[0] = S3[i * 3] + cam.eye[0] * 0.0; v3[1] = S3[i * 3 + 1]; v3[2] = S3[i * 3 + 2];
      const rel = ((v3[2] - cam.eye[2] + 4) % span + span) % span - 4; v3[2] = cam.eye[2] + rel;     // the dust wraps round the camera so it never runs out
      const q = pr(v3, o); if (q.z < 0.3) { SP[i * 2] = NaN; continue; }
      const x = px(q), y = py(q), a = fade * 0.55 * fogAlpha(q.z, 12);
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) { SP[i * 2] = NaN; continue; }
      if (Number.isFinite(SP[i * 2]) && Math.hypot(x - SP[i * 2], y - SP[i * 2 + 1]) < W * 0.25) { ctx.globalAlpha = a * 0.8; ctx.lineWidth = Math.max(0.6, sz(q) * 0.7); ctx.beginPath(); ctx.moveTo(SP[i * 2] + (x - SP[i * 2]) * 0.0, SP[i * 2 + 1]); ctx.lineTo(x, y); ctx.stroke(); }
      else { ctx.globalAlpha = a; ctx.fillRect(x, y, 1.4, 1.4); }
      SP[i * 2] = x; SP[i * 2 + 1] = y;
    } }

  // ── the links: tubes of light, far to near ──
  const E = S.edges;
  for (const ed of E) { for (let i = 0; i < NSEG; i++) { v3[0] = ed.pts[i * 3]; v3[1] = ed.pts[i * 3 + 1]; v3[2] = ed.pts[i * 3 + 2]; pr(v3, o); ed.scr[i * 3] = px(o); ed.scr[i * 3 + 1] = py(o); ed.scr[i * 3 + 2] = o.z; } ed.zMid = ed.scr[(NSEG >> 1) * 3 + 2]; }
  S.order.sort((a, b) => E[b].zMid - E[a].zMid);
  ctx.globalCompositeOperation = 'lighter';
  for (const idx of S.order) {
    const ed = E[idx], v = ed.e.verdict, br = v === 'broken', hold = v === 'holding';
    if (v !== 'broken' && v !== 'holding' && v !== 'quiet') continue;
    const col = br ? C.gold : C.blue, flick = br ? 0.62 + 0.38 * Math.sin(t * 31 + hash(ed.e.id) * 40) * Math.sin(t * 13 + 1) : 1;
    const base = br ? 3.3 : hold ? 1.8 : 0.8, aMul = br ? 0.85 * flick : hold ? 0.62 : 0.1;
    for (let i = 0; i < NSEG - 1; i++) {
      const z = ed.scr[i * 3 + 2], z2 = ed.scr[i * 3 + 5]; if (z < 0.3 || z2 < 0.3) continue;
      const k = (1.25 * zoom / z) * SC * 0.02, fa = fade * fogAlpha(z, 13);
      ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(ed.scr[i * 3], ed.scr[i * 3 + 1]); ctx.lineTo(ed.scr[i * 3 + 3], ed.scr[i * 3 + 4]);
      ctx.globalAlpha = fa * aMul * 0.13; ctx.lineWidth = clamp(base * k * 3, 1, 46); ctx.stroke();       // the glow
      ctx.globalAlpha = fa * aMul; ctx.lineWidth = clamp(base * k, 0.5, 15); ctx.stroke();                   // the tube
    }
    // particles: cause -> effect (the curve's first point is the cause)
    ctx.fillStyle = br ? C.gold : C.tx; ctx.strokeStyle = col;
    for (let j = 0; j < ed.n; j++) {
      const sp = br ? 0.42 + 0.3 * hash(ed.e.id + 'v' + j) : hold ? 0.2 : 0.1, tt = (ed.ph[j] + clk * sp / (1 + 0 * j)) % 1, f = tt * (NSEG - 1), i = Math.min(NSEG - 2, f | 0), u = f - i;
      const z = ed.scr[i * 3 + 2] * (1 - u) + ed.scr[i * 3 + 5] * u; if (z < 0.3) { ed.prev[j * 2] = NaN; continue; }
      const jit = br ? (Math.sin(t * 40 + j * 5) * 1.6) : 0, x = ed.scr[i * 3] * (1 - u) + ed.scr[i * 3 + 3] * u + jit, y = ed.scr[i * 3 + 1] * (1 - u) + ed.scr[i * 3 + 4] * u - jit, k = (1.25 * zoom / z) * SC * 0.02, r = clamp((br ? 2.6 : 1.9) * k, 0.8, 8), a = fade * fogAlpha(z, 13) * (br ? 0.95 : hold ? 0.85 : 0.2);
      const pxv = ed.prev[j * 2], pyv = ed.prev[j * 2 + 1];
      if (Number.isFinite(pxv) && Math.hypot(x - pxv, y - pyv) < W * 0.2) { ctx.globalAlpha = a * 0.5; ctx.lineWidth = r * 1.5; ctx.beginPath(); ctx.moveTo(pxv, pyv); ctx.lineTo(x, y); ctx.stroke(); }
      ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
      ed.prev[j * 2] = x; ed.prev[j * 2 + 1] = y;
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  // ── the markets: pylon, orb, ring; far to near ──
  const nodes = api.st.graph.nodes, ord = nodes.map(n => { pr(layout.pos[n.key], o); return { n, z: o.z, x: px(o), y: py(o) }; }).filter(r => r.z > 0.3).sort((a, b) => b.z - a.z);
  const stopIdx = new Map(route.stops.map((s, i) => [s.key, i])); let named = 0;
  for (const r of ord) {
    const n = r.n, P = layout.pos[n.key], col = toneCol(C, n.style.tone), fa = fade * fogAlpha(r.z, 13), si = stopIdx.get(n.key), isStop = si != null, la = isStop ? labelAlpha(times, si, p) : 0;
    const k = (1.25 * zoom / r.z) * SC * 0.02, rad = Math.max(2, (0.13 + 0.2 * n.style.size) * k * 14 * (1 + 0.25 * la));
    if (fa < 0.02) continue;
    // pylon down to the floor
    v3[0] = P[0]; v3[1] = FLOOR; v3[2] = P[2]; const fl = pr(v3, { x: 0, y: 0, z: 0 });
    if (fl.z > 0.3) { const gr = ctx.createLinearGradient(r.x, r.y, px(fl), py(fl)); gr.addColorStop(0, col); gr.addColorStop(1, 'transparent'); ctx.globalAlpha = fa * 0.32; ctx.strokeStyle = gr; ctx.lineWidth = Math.max(1, k * 1.2); ctx.beginPath(); ctx.moveTo(r.x, r.y + rad); ctx.lineTo(px(fl), py(fl)); ctx.stroke(); ctx.globalAlpha = fa * 0.3; ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(px(fl), py(fl), Math.max(1, k * 7), Math.max(0.5, k * 2), 0, 0, 6.2832); ctx.fill(); }
    // the ring: the camera flies through it
    const rr = isStop ? 0.62 : 0.34, ra = fa * (isStop ? 0.4 + 0.55 * la : 0.18), pulse = 1 + 0.12 * Math.sin(t * 5 + hash(n.key) * 6);
    ctx.strokeStyle = n.style.tone === 'wrong' ? C.gold : C.cy ?? C.blue; ctx.lineWidth = Math.max(1, k * (isStop ? 1.6 + 2.5 * la : 0.8)); ctx.globalAlpha = ra; ctx.beginPath();
    let on = false;
    for (let i = 0; i <= 26; i++) { const a = i / 26 * 6.2832; v3[0] = P[0] + Math.cos(a) * rr * pulse; v3[1] = P[1] + Math.sin(a) * rr * pulse; v3[2] = P[2]; const q = pr(v3, { x: 0, y: 0, z: 0 }); if (q.z < 0.3) { on = false; continue; } if (on) ctx.lineTo(px(q), py(q)); else { ctx.moveTo(px(q), py(q)); on = true; } }
    ctx.stroke();
    // the orb: a soft glow and a bright core
    const gl = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, rad * 3.2); gl.addColorStop(0, col); gl.addColorStop(1, 'transparent');
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fa * (0.55 + 0.3 * la); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(r.x, r.y, rad * 3.2, 0, 6.2832); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = fa; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = fa * 0.9; ctx.fillStyle = C.tx; ctx.beginPath(); ctx.arc(r.x - rad * 0.28, r.y - rad * 0.28, rad * 0.38, 0, 6.2832); ctx.fill();
    // motion streak behind the orb (where it was last frame)
    const pv = S.nodePrev.get(n.key);
    if (pv && Math.hypot(r.x - pv.x, r.y - pv.y) < W * 0.2 && Math.hypot(r.x - pv.x, r.y - pv.y) > 1.5) { ctx.globalAlpha = fa * 0.4; ctx.strokeStyle = col; ctx.lineWidth = rad * 1.4; ctx.beginPath(); ctx.moveTo(pv.x, pv.y); ctx.lineTo(r.x, r.y); ctx.stroke(); }
    if (pv) { pv.x = r.x; pv.y = r.y; } else S.nodePrev.set(n.key, { x: r.x, y: r.y });
    g.hit(n.key, r.x, r.y);
    // names: small when near, a flashing card when the camera is passing a stop
    if (la > 0.02) { /* the card for this stop is drawn after the loop: the camera is beside the node, so the card cannot hang off it */ } else if (fa > 0.12 && r.z < (g.compact ? 4.5 : 9) && r.x > 8 && r.x < W - 8 && (!g.compact || ++named <= 3)) {   // phone: at most three names at once, kept on screen
      ctx.globalAlpha = fa * 0.7; ctx.fillStyle = C.tx2; ctx.textAlign = 'center'; ctx.font = `${clamp(Math.round(k * 9), g.compact ? 9 : 8, 13)}px ui-monospace,monospace`; const nm = (api.names[n.key] ?? n.key).replace(/\s*\(.*\)/, ''), hw = g.compact ? ctx.measureText(nm).width / 2 + 6 : 0; ctx.fillText(nm, clamp(r.x, hw, W - hw), r.y + rad * 1.9 + 10);
    }
  }
  // ── the card: the market's name and its measured move flash up as the camera passes through its ring ──
  route.stops.forEach((stop, si) => {
    const la = labelAlpha(times, si, p); if (la < 0.02) return;
    const col = toneCol(C, nodes.find(n => n.key === stop.key)?.style.tone), e = la * la * (3 - 2 * la), x = W * 0.5, y = H * 0.27 - (1 - e) * 18, sc = 0.85 + 0.2 * e;
    ctx.globalAlpha = fade * e; ctx.textAlign = 'center'; ctx.shadowColor = col; ctx.shadowBlur = 22;
    const cs = g.compact ? 0.62 : 1; ctx.fillStyle = C.tx; ctx.font = `${Math.round(20 * sc * cs)}px ui-monospace,monospace`; ctx.fillText(stop.label.toUpperCase(), x, y);
    ctx.fillStyle = col; ctx.font = `${Math.round(46 * sc * cs)}px ui-monospace,monospace`; ctx.fillText(stop.text || '', x, y + 50 * sc * cs);
    ctx.shadowBlur = 0; ctx.fillStyle = stop.kind === 'broken' ? C.gold : stop.kind === 'holding' ? C.blue : C.tx2; ctx.font = '12px ui-monospace,monospace'; ctx.fillText(KIND[stop.kind] ?? '', x, y + 74 * sc * cs);
    ctx.globalAlpha = fade * e * 0.5; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 90 * cs, y + 86 * sc * cs); ctx.lineTo(x + 90 * cs, y + 86 * sc * cs); ctx.stroke();
  });
  ctx.restore();

  // ── HUD: legend, route strip, speed ──
  if (t - hudAt > 1) { hudAt = t; try { hudTop = parseFloat(api.doc.getElementById(api.ID).style.getPropertyValue('--jvtop')) || 70; } catch (e) { /* layout only */ } }
  const ly = hudTop + 18, cx = W / 2, f = g.fade;
  ctx.save(); ctx.textAlign = 'center'; ctx.font = '11px ui-monospace,monospace';
  const items = g.compact ? [[C.blue, 'holding', 1.8], [C.gold, 'broken', 4], [C.tx2, 'quiet', 0.8]] : [[C.blue, 'link HOLDING: steady blue', 1.8], [C.gold, 'link BROKEN: thick, flickering gold', 4], [C.tx2, 'quiet: barely visible', 0.8]];
  let tot = 0; const wd = items.map(([, s]) => { const w = ctx.measureText(s).width + 44; tot += w; return w; }); let x = cx - tot / 2;
  items.forEach(([c, s, lw], i) => { ctx.globalAlpha = f * 0.9; ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + 28, ly); ctx.stroke(); ctx.fillStyle = C.tx2; ctx.textAlign = 'left'; ctx.fillText(s, x + 34, ly + 4); x += wd[i]; });
  ctx.textAlign = 'center'; ctx.globalAlpha = f * 0.75; ctx.fillStyle = C.tx2; ctx.fillText(g.compact ? 'Cause to effect. Which links held or broke: not a signal.' : 'flow runs cause to effect, towards you  ·  description of which links held or broke over the window, not a signal', cx, ly + 20);
  // the route strip
  const sw = g.compact ? W - 48 : Math.min(W * 0.5, 520), sx = cx - sw / 2, sy = ly + 38;
  ctx.globalAlpha = f * 0.35; ctx.strokeStyle = C.tx2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + sw, sy); ctx.stroke();
  route.stops.forEach((s, i) => { const tx = sx + sw * times[i + 1]; ctx.globalAlpha = f * 0.85; ctx.fillStyle = s.kind === 'broken' ? C.gold : s.kind === 'holding' ? C.blue : C.tx2; ctx.beginPath(); ctx.arc(tx, sy, s.kind === 'broken' ? 3.5 : 2.5, 0, 6.2832); ctx.fill(); });
  ctx.globalAlpha = f; ctx.fillStyle = C.tx; ctx.beginPath(); ctx.moveTo(sx + sw * p, sy - 3); ctx.lineTo(sx + sw * p + 4, sy - 9); ctx.lineTo(sx + sw * p - 4, sy - 9); ctx.closePath(); ctx.fill();
  ctx.restore(); ctx.globalAlpha = 1;
}

registerJarvisModule({
  id: 'chainfly', label: 'FLY',
  render(pane, api) {
    pane.innerHTML = `<h3>FLY THE CHAIN</h3><p>The macro chain as a place you fly through, cause to effect. Each market is a glowing orb; each textbook link is a tube of light with particles running from cause to effect. Steady blue means the link is holding, thick flickering gold means it broke, and a faint thread means it was quiet. The camera rides the busiest path, passes through a ring at each market and slows at the broken links. Drag to look around, wheel to zoom.</p>
<p class="jv-sub">Description of which links held or broke over the window. Not a forecast and not a signal.</p><div class="jv-row"><button type="button" data-f="go">▶ FLY THE CHAIN</button></div>`;
    pane.querySelector('[data-f="go"]').onclick = () => { api.setMod('chain'); api.setView('chainfly'); };
  },
  views: [{
    id: 'chainfly', label: 'FLY', draw,
    onEnter(api) { clk = 0; api.st.yaw = 0; api.st.pitch = 0; api.st.zoom = 1; api.st.spin = false; },
    onLeave() { showP = null; },
  }],
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
