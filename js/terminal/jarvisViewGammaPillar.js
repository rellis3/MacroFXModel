// js/terminal/jarvisViewGammaPillar.js: Jarvis's GAMMA PILLAR hologram (view 'gpillar'): today's option book of one market as a glass column standing on the projector table, read like a price chart.
// Strikes run UP the column (a vertical price axis, ticks on the left). Call open interest glows out to the right, put open interest to the left, on ONE shared scale (bar length is linear in contracts).
// Net dealer gamma is a ribbon up the middle of the glass: it leans right and glows cyan where net gamma is positive, leans left and glows red where it is negative (colour AND side).
// The glass itself is split at the gamma-flip strike: cyan glass on the side where the data puts dealers net LONG gamma (hedging tends to damp moves), red glass where they are net SHORT gamma
// (hedging tends to add to moves). The flip is a bright gold ring with its price; spot is a white laser plane across the whole scene with a price tag; the biggest call and put strikes (the walls)
// are labelled at their bar tips; max pain is a small diamond. Beside the column, a faint trail of the last 20 daily captures' spot (dots) with that day's call and put wall (short dashes), so you
// see where price has been against the walls. The column's ribs turn slowly; the camera sways gently (drag to look around, still under H.calm).
// ENCODING: height = strike price · bar length = open interest (contracts, shared scale) · ribbon offset/colour = net gamma (share of the biggest bin) · glass colour = gamma regime by the flip.
// Data: /api/oi-store (the nightly CME open-interest capture: spot, gexProfile [{strike, callOI, putOI, netGex}], gammaFlip, callWall/putWall, maxPain, dte, savedAt) shaped by
// jarvisGammaCore.buildLadder; /api/oi-history?pair=&limit=30 (per-day summary: spot, callWall, putWall) for the trail. Pure maths in gammaHoloCore.js.
// DESCRIPTION ONLY: where open interest sits and the gamma it implies. Our studies found no proven direction from these levels; nothing here is a forecast, signal or target.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { glView } from './jarvisGL.js';
import { GAMMA_MARKETS, marketsWithOI, fmtOI } from './jarvisGammaCore.js';
import { buildPillar, spotTrail, niceTicks, dodge, placeBox, pillarScript, pickMain, metaOf, fmtDay, fmtPx, TRAIL_DAYS } from './gammaHoloCore.js';

const ID = 'gpillar', HGT = 4.4, Y0 = 0.25, R = 0.42, BAR = 1.7, AXX = -(R + BAR + 0.4), TX0 = R + BAR + 0.55, TX1 = TX0 + 1.55, TZ = -0.6;
const KEY_LINE = 'bars = open interest by strike · ribbon = net dealer gamma · blue = damping zone, red = amplifying zone · description only; our studies found no proven direction from these levels';
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

// ───────────── data (shared with GAMMA TERRAIN, which imports loadStore / GP) ─────────────
export const GP = { store: null, avail: [], at: 0, busy: null, err: false, key: null, trails: new Map(), cache: new Map(), show: { p: -1, at: 0 } };
/** Read the stored option books at most once per ten minutes. Never throws: a failed read leaves GP.err set. */
export async function loadStore(api, force) {
  if (GP.busy) return GP.busy; if (GP.store && !force && Date.now() - GP.at < 600000) return GP.store;
  GP.busy = (async () => {
    let j = null; try { j = await api.jf('/api/oi-store'); } catch (e) { j = null; }
    const store = j?.data ?? j; GP.err = !store || typeof store !== 'object' || !!j?.error;
    if (!GP.err) { GP.store = store; GP.avail = marketsWithOI(store); GP.cache.clear(); }
    GP.at = Date.now(); GP.busy = null; return GP.store;
  })();
  return GP.busy;
}
const pairOf = key => metaOf(key)?.pair ?? null;
/** Today's pillar for a market key (cached per store read). */
export const pillarOf = key => { const p = pairOf(key); if (!p || !GP.store?.[p]) return null; if (!GP.cache.has(key)) GP.cache.set(key, buildPillar(GP.store[p], p)); return GP.cache.get(key); };
/** The 20-capture spot trail for a market (fetched once per ten minutes; [] when the history is missing). */
function loadTrail(api, key) {
  const p = pairOf(key); if (!p) return; const c = GP.trails.get(key); if (c && (c.busy || Date.now() - c.at < 600000)) return;
  const e = { busy: true, at: Date.now(), rows: c?.rows ?? null }; GP.trails.set(key, e);
  api.jf(`/api/oi-history?pair=${encodeURIComponent(p)}&limit=30`).then(j => { e.rows = spotTrail(j, TRAIL_DAYS); }).catch(() => { e.rows = []; }).finally(() => { e.busy = false; e.at = Date.now(); });
}
const step = d => { const n = GP.avail.length; if (!n) return; const i = GP.avail.findIndex(m => m.key === GP.key); GP.key = GP.avail[(Math.max(0, i) + d + n) % n].key; };

// ───────────── the hologram ─────────────
function setup(L, H, api) {
  const { THREE } = L, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200), kit = H.kit;
  const base = new THREE.Group(); scene.add(base);
  let trailGrp = null, data = null, builtFor = null, built = null, glass = [], ribs = null, flipRing = null, flipFlare = null, spotGrp = null;
  const disposeGroup = g => g?.traverse(o => { o.geometry?.dispose?.(); const m = o.material; if (m) { kit._holo.delete(m); kit._mats.delete(m); if (!m.map) m.dispose?.(); } });

  function build(P, trail, C) {
    if (data) { scene.remove(data); disposeGroup(data); } data = new THREE.Group(); scene.add(data); glass = []; flipRing = null; flipFlare = null;
    if (!base.children.length) { base.add(kit.table(3.2, C.blue, 0, 7, 32)); base.add(kit.dust(900, 30, C.blue)); }
    const yOf = v => Y0 + (v - P.lo) / (P.hi - P.lo) * HGT, n = P.n, bh = HGT / n;
    const cLong = H.color(C.cy), cShort = H.color(C.dn), cUp = H.color(C.up), cTx = H.color(C.tx), cGold = H.color(C.gold), cTx2 = H.color(C.tx2);
    // the glass, split at the flip into the two regimes
    const seg = (y0, y1, col) => { if (!(y1 > y0 + 1e-3)) return; const m = new THREE.Mesh(new THREE.CylinderGeometry(R, R, y1 - y0, 48, 1, true), kit.holo(col, { rim: 2.2, base: 0.035, scan: 0.6, opacity: 0.5 })); m.position.y = (y0 + y1) / 2; data.add(m); glass.push(m);
      const caps = []; for (const y of [y0, y1]) for (let k = 0; k < 48; k++) { const a = k / 48 * 6.2832, b = (k + 1) / 48 * 6.2832; caps.push([Math.cos(a) * R, y, Math.sin(a) * R, Math.cos(b) * R, y, Math.sin(b) * R]); } data.add(kit.segments(caps, col, 0.35)); };
    const yF = P.flip != null ? clampN(yOf(P.flip), Y0, Y0 + HGT) : null;
    if (yF != null) { seg(Y0, yF, P.longAt(P.lo) ? cLong : cShort); seg(yF, Y0 + HGT, P.longAt(P.hi) ? cLong : cShort); }
    else seg(Y0, Y0 + HGT, P.long == null ? H.color(C.blue) : P.long ? cLong : cShort);
    // vertical ribs on the glass (they turn slowly, so the column reads as a solid turning object)
    const rs = []; for (let k = 0; k < 10; k++) { const a = k / 10 * 6.2832; rs.push([Math.cos(a) * R * 1.01, Y0, Math.sin(a) * R * 1.01, Math.cos(a) * R * 1.01, Y0 + HGT, Math.sin(a) * R * 1.01]); }
    ribs = kit.segments(rs, H.color(C.blue), 0.16); data.add(ribs);
    // the bars: instanced boxes (soft fill) and their outlines (crisp), calls right, puts left, one scale
    const sc = Math.max(1, P.maxCall, P.maxPut), dummy = new THREE.Object3D();
    for (const [arr, side, col] of [[P.call, 1, cUp], [P.put, -1, cShort]]) {
      const cnt = arr.reduce((a, v) => a + (v > 0 ? 1 : 0), 0); if (!cnt) continue;
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }), cnt);
      const edges = []; let k = 0;
      for (let i = 0; i < n; i++) { if (!(arr[i] > 0)) continue; const len = Math.max(0.012, arr[i] / sc * BAR), y = yOf(P.strikes[i]), x0 = side * R, x1 = side * (R + len), h = bh * 0.62;
        dummy.position.set((x0 + x1) / 2, y, 0); dummy.scale.set(len, h, 0.13); dummy.updateMatrix(); mesh.setMatrixAt(k++, dummy.matrix);
        edges.push([x0, y + h / 2, 0.065, x1, y + h / 2, 0.065], [x0, y - h / 2, 0.065, x1, y - h / 2, 0.065], [x1, y - h / 2, 0.065, x1, y + h / 2, 0.065]); }
      mesh.instanceMatrix.needsUpdate = true; data.add(mesh); data.add(kit.segments(edges, col, 0.85));
    }
    // the net-gamma ribbon inside the glass: a soft curtain from the axis and a bright line; offset right = positive, left = negative
    const pts = [], curtain = [], cols = [];
    for (let i = 0; i < n; i++) { const x = P.net[i] * R * 0.9, y = yOf(P.strikes[i]); pts.push([x, y, 0.02]); }
    for (let i = 1; i < n; i++) { const a = pts[i - 1], b = pts[i], ca = P.net[i - 1] >= 0 ? cLong : cShort, cb = P.net[i] >= 0 ? cLong : cShort;
      curtain.push(0, a[1], 0.02, a[0], a[1], 0.02, b[0], b[1], 0.02, 0, a[1], 0.02, b[0], b[1], 0.02, 0, b[1], 0.02);
      for (const c of [ca, ca, cb, ca, cb, cb]) cols.push(c.r, c.g, c.b); }
    if (curtain.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(curtain, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      data.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))); }
    // the ribbon line itself, in two colours: split into runs of one sign so the colour changes exactly where net gamma crosses zero
    let run = [pts[0]], sign = P.net[0] >= 0;
    const flush = () => { if (run.length > 1) data.add(kit.line(run, sign ? cLong : cShort, 2.4, 0.95)); };
    for (let i = 1; i < n; i++) { const s = P.net[i] >= 0; if (s !== sign) { const a = P.net[i - 1], b = P.net[i], t = Math.abs(a) / (Math.abs(a) + Math.abs(b) || 1), z = [0, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t, 0.02]; run.push(z); flush(); run = [z]; sign = s; } run.push(pts[i]); }
    flush(); data.add(kit.segments([[0, Y0, 0.02, 0, Y0 + HGT, 0.02]], cTx2, 0.25));
    // the flip ring
    if (yF != null && P.flip >= P.lo && P.flip <= P.hi) { const c = []; for (let k = 0; k <= 64; k++) { const a = k / 64 * 6.2832; c.push([Math.cos(a) * R * 1.45, yF, Math.sin(a) * R * 1.45]); }
      flipRing = kit.line(c, cGold, 3, 1); data.add(flipRing); flipFlare = kit.flare(cGold, 0.5, 0.6); flipFlare.position.set(R * 1.45, yF, 0); data.add(flipFlare); }
    // spot: a laser plane across the scene, reaching the trail
    spotGrp = new THREE.Group(); const yS = clampN(yOf(P.spot), Y0, Y0 + HGT); spotGrp.position.y = yS; data.add(spotGrp);
    spotGrp.add(kit.line([[AXX, 0, 0], [TX1 + 0.15, 0, 0]], cTx, 1.6, 0.9));
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(TX1 - AXX + 0.3, 2.2), new THREE.MeshBasicMaterial({ color: cTx, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    pl.rotation.x = -Math.PI / 2; pl.position.x = (AXX + TX1) / 2; spotGrp.add(pl);
    const cr = []; for (let k = 0; k <= 64; k++) { const a = k / 64 * 6.2832; cr.push([Math.cos(a) * R * 1.12, 0, Math.sin(a) * R * 1.12]); } spotGrp.add(kit.line(cr, cTx, 2, 0.9));
    // max pain: a small diamond on the front of the glass
    if (P.maxPain != null) { const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.075), new THREE.MeshBasicMaterial({ color: cTx2, wireframe: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); d.position.set(0, yOf(P.maxPain), R + 0.06); data.add(d); }
    // wall tips glow
    for (const [w, side, col] of [[P.callWall, 1, cUp], [P.putWall, -1, cShort]]) { if (!w) continue; const i = clampN(Math.floor((w.strike - P.lo) / P.w), 0, n - 1), len = (side > 0 ? P.call[i] : P.put[i]) / sc * BAR; const f = kit.flare(col, 0.38, 0.8); f.position.set(side * (R + len), yOf(P.strikes[i]), 0.07); data.add(f); }
    // the price axis on the left
    const ticks = niceTicks(P.lo, P.hi, 7), ax = [[AXX, Y0, 0, AXX, Y0 + HGT, 0]]; for (const v of ticks) ax.push([AXX, yOf(v), 0, AXX + 0.12, yOf(v), 0]); data.add(kit.segments(ax, cTx2, 0.45));
    // the trail of recent captures beside the column
    const tr = (trail ?? []).filter(r => r.spot >= P.lo && r.spot <= P.hi), m = trail?.length ?? 0, xOf = k => TX0 + (m > 1 ? k / (m - 1) : 1) * (TX1 - TX0);
    trailGrp = new THREE.Group(); data.add(trailGrp);
    if (m) {
      const line = [], dash = [[], []]; (trail ?? []).forEach((r, k) => { if (r.spot >= P.lo && r.spot <= P.hi) line.push([xOf(k), yOf(r.spot), TZ]);
        if (r.callWall >= P.lo && r.callWall <= P.hi) dash[0].push([xOf(k) - 0.03, yOf(r.callWall), TZ, xOf(k) + 0.03, yOf(r.callWall), TZ]);
        if (r.putWall >= P.lo && r.putWall <= P.hi) dash[1].push([xOf(k) - 0.03, yOf(r.putWall), TZ, xOf(k) + 0.03, yOf(r.putWall), TZ]); });
      if (line.length > 1) trailGrp.add(kit.line(line, cTx2, 1.4, 0.55));
      const dots = kit.points(line.length, cTx, 5, { opacity: 0.85 }), a = dots.geometry.attributes.position.array; line.forEach((p, k) => { a[k * 3] = p[0]; a[k * 3 + 1] = p[1]; a[k * 3 + 2] = p[2]; }); trailGrp.add(dots);
      if (dash[0].length) trailGrp.add(kit.segments(dash[0], cUp, 0.7)); if (dash[1].length) trailGrp.add(kit.segments(dash[1], cShort, 0.7));
      trailGrp.add(kit.segments([[TX0 - 0.1, Y0, TZ, TX1 + 0.1, Y0, TZ]], cTx2, 0.3));
    }
    built = { P, yOf, ticks, trail: trail ?? null, xOf, offScale: m - tr.length, sc };
  }

  const st = { touch: -99, yaw: null };
  return {
    scene, camera, bloom: { strength: 0.85, radius: 0.5, threshold: 0.08 },
    update(t, dt, api2, g) {
      const a = api2 ?? api;
      if (!GP.store && !GP.busy && !GP.err) loadStore(a).catch(() => null);
      if (!GP.key || !GP.avail.some(m => m.key === GP.key)) GP.key = GP.avail.some(m => m.key === a.st.sel) ? a.st.sel : pickMain(GP.avail);
      if (GP.avail.length && typeof a.st.sel === 'string' && a.st.sel.startsWith('gp:')) { const k = a.st.sel.slice(3); if (k === 'prev') step(-1); else if (k === 'next') step(1); a.st.sel = null; a.blip?.(780, 0.05); }
      const P = GP.key ? pillarOf(GP.key) : null; if (GP.key) loadTrail(a, GP.key);
      const tr = GP.key ? GP.trails.get(GP.key) : null, sig = `${GP.key}|${GP.at}|${tr?.rows ? tr.rows.length + (tr.rows.at(-1)?.date ?? '') : 'x'}`;
      if (P && sig !== builtFor) { builtFor = sig; build(P, tr?.rows ?? null, g.C); }
      if (!P && data) { scene.remove(data); disposeGroup(data); data = null; built = null; builtFor = null; }
      if (data) data.visible = !!P;
      if (trailGrp) trailGrp.visible = !g.compact;   // a phone has no room beside the column: the trail is desktop-only
      const calm = H.calm, show = GP.show.p >= 0 && Date.now() - GP.show.at < 1500;
      const sway = show ? -0.35 + GP.show.p * 0.7 : calm ? 0 : Math.sin(t * 0.06) * 0.32;
      H.orbit(camera, a.st, { dist: g.compact ? 19 : 11, target: [g.compact ? -0.45 : 0.25, Y0 + HGT * 0.5 + (g.compact ? -0.2 : 0.05), 0], elev: 0.16, lo: -0.15, hi: 0.95, yawAdd: sway });
      if (ribs) ribs.rotation.y = calm ? 0 : t * 0.12;
      for (const m of glass) m.rotation.y = calm ? 0 : t * 0.12;
      if (flipRing) flipRing.material.opacity = calm ? 1 : 0.75 + 0.25 * Math.sin(t * 2.2);
      if (flipFlare && !calm) { const a2 = t * 0.6; flipFlare.position.set(Math.cos(a2) * R * 1.45, flipFlare.position.y, Math.sin(a2) * R * 1.45); }
    },
    overlay(ctx, g, a) { overlay(ctx, g, a, H, camera, built); },
    dispose() { disposeGroup(scene); },
  };
}

// ───────────── the 2D layer: picker, labels, readout, key ─────────────
function overlay(ctx, g, api, H, camera, B) {
  const { W, H: Hh, C, fade } = g, cp = g.compact; ctx.save(); ctx.globalAlpha = fade;
  const font = (px, w = '') => { ctx.font = `${w}${px}px ui-monospace,monospace`; };
  const msg = s => { font(13); ctx.fillStyle = C.tx2; ctx.textAlign = 'center'; ctx.fillText(s, W / 2, Hh / 2); };
  if (!GP.store && !GP.err) { msg('Reading the option books...'); ctx.restore(); return; }
  if (GP.err || !GP.avail.length) { msg(GP.err ? 'The option open interest feed is not available right now, so there is no pillar to draw.' : 'No option open interest has been captured yet.'); ctx.restore(); return; }
  const meta = metaOf(GP.key); buttons(ctx, g, meta?.label ?? GP.key ?? '');
  if (!B || B.P !== pillarOf(GP.key)) { msg(`No usable open interest for ${meta?.label ?? GP.key} today.`); ctx.restore(); return; }
  const P = B.P, S = p => H.toScreen(p, camera), bg = 'rgba(0,0,0,0.72)', taken = [], keyTop = Hh - (cp ? 140 : 96);
  const bounds = { x0: 4, y0: (cp ? 118 : 146), x1: W - 4, y1: keyTop };
  taken.push({ x: W / 2 - 130, y: (cp ? 84 : 114), w: 260, h: 32 });
  const box = (text, px, w = '') => { font(px, w); return { w: ctx.measureText(text).width + 8, h: px + 6 }; };
  const draw = (r, text, col, px, w = '') => { font(px, w); ctx.fillStyle = bg; ctx.globalAlpha = fade; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.fillText(text, r.x + 4, r.y + px + 1); };
  // readout first (fixed place): the main fact in words
  const longHere = P.flip != null ? P.longAt(P.spot) : P.long;
  const head = `GAMMA PILLAR · ${meta?.label ?? ''}`, l1 = P.flip != null ? `spot ${fmtPx(P.spot)}: ${(Math.abs(P.spot - P.flip) / P.spot * 100).toFixed(1)}% ${P.spot >= P.flip ? 'above' : 'below'} flip ${fmtPx(P.flip)}` : `spot ${fmtPx(P.spot)} · no flip in range`;
  const l2 = longHere == null ? '' : longHere ? 'dealers long gamma: damping zone' : 'dealers short gamma: amplifying zone';
  const l3 = `${P.dte != null ? `${P.dte} DTE · ` : ''}capture ${String(P.savedAt ?? 'n/a').slice(0, 10)}`;
  ctx.textAlign = 'left';
  if (cp) { const y = 136; font(12, '600 '); ctx.fillStyle = C.blue; ctx.fillText(head, 12, y); font(11); ctx.fillStyle = C.tx; ctx.fillText(l1, 12, y + 15); ctx.fillStyle = longHere ? C.cy : C.dn; if (l2) ctx.fillText(l2, 12, y + 30); taken.push({ x: 8, y: y - 14, w: 300, h: 50 }); bounds.y0 = y + 38; }
  else { const x = 22, y = 176; font(13, '600 '); ctx.fillStyle = C.blue; ctx.fillText(head, x, y); font(12); ctx.fillStyle = C.tx; ctx.fillText(l1, x, y + 18); ctx.fillStyle = longHere ? C.cy : C.dn; if (l2) ctx.fillText(l2, x, y + 34); ctx.fillStyle = C.tx2; font(11); ctx.fillText(l3, x, y + 50);
    ctx.fillText(`calls ${fmtOI(P.total.call)} · puts ${fmtOI(P.total.put)} in view`, x, y + 64); ctx.fillStyle = C.up; ctx.fillText('calls →', x, y + 82); ctx.fillStyle = C.dn; ctx.fillText('← puts', x + 70, y + 82);
    font(12); const wmax = Math.max(...[head, l1, l2].map(t => ctx.measureText(t).width)) + 6; taken.push({ x: x - 4, y: y - 16, w: wmax, h: 104 }); }
  // the markers left of the price axis: spot, flip, max pain (dodged vertically, never on top of each other)
  const ax = v => S([AXX, B.yOf(v), 0]), marks = [];
  marks.push({ v: P.spot, pri: 3, text: `SPOT ${fmtPx(P.spot)}`, col: C.tx, px: 12, w: '600 ' });
  if (P.flip != null && P.flip >= P.lo && P.flip <= P.hi) marks.push({ v: P.flip, pri: 2, text: `FLIP ${fmtPx(P.flip)}`, col: C.gold, px: 12, w: '600 ' });
  if (P.maxPain != null && P.maxPain >= P.lo && P.maxPain <= P.hi) marks.push({ v: P.maxPain, pri: 1, text: `max pain ${fmtPx(P.maxPain)}`, col: C.tx2, px: 11, w: '' });
  for (const m of marks) { const p = ax(m.v); m.x = p.x; m.y = p.y; }
  dodge(marks, { gap: 19, top: bounds.y0 + 14, bottom: bounds.y1 - 4 });
  for (const m of marks) { if (m.hide) continue; const d = box(m.text, m.px, m.w), r = placeBox([{ x: m.x - 12 - d.w, y: m.ly - d.h + 4, w: d.w, h: d.h }, { x: m.x + 8, y: m.ly - d.h + 4, w: d.w, h: d.h }], taken, bounds, 1); if (!r) continue;
    if (Math.abs(m.ly - m.y) > 2) { ctx.strokeStyle = m.col; ctx.globalAlpha = fade * 0.5; ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(r.x > m.x ? r.x : r.x + r.w, m.ly - 3); ctx.stroke(); }
    draw(r, m.text, m.col, m.px, m.w); }
  // the walls at their bar tips: try above, below, beside; skipped rather than drawn on top of something
  for (const [w, side, col, nm] of [[P.callWall, 1, C.up, 'CALL WALL'], [P.putWall, -1, C.dn, 'PUT WALL']]) {
    if (!w) continue; const i = clampN(Math.floor((w.strike - P.lo) / P.w), 0, P.n - 1), len = (side > 0 ? P.call[i] : P.put[i]) / B.sc * BAR, p = S([side * (R + len), B.yOf(P.strikes[i]), 0.07]);
    const t1 = `${nm} ${fmtPx(w.strike)}`, t2 = `${fmtOI(w.oi)} contracts`, a = box(t1, 12, '600 '), b2 = cp ? { w: 0, h: 0 } : box(t2, 11), bw = Math.max(a.w, b2.w), bh = a.h + b2.h;
    const out = side > 0 ? p.x + 10 : p.x - 10 - bw, inn = side > 0 ? p.x - bw : p.x;
    const r = placeBox([{ x: out, y: p.y - bh / 2, w: bw, h: bh }, { x: out, y: p.y + 14, w: bw, h: bh }, { x: out, y: p.y - bh - 14, w: bw, h: bh }, { x: inn, y: p.y + 10, w: bw, h: bh }, { x: inn, y: p.y - bh - 10, w: bw, h: bh }], taken, bounds);
    if (!r) continue; draw({ x: r.x, y: r.y, w: bw, h: a.h }, t1, col, 12, '600 '); if (!cp) draw({ x: r.x, y: r.y + a.h, w: bw, h: b2.h }, t2, C.tx2, 11);
  }
  // price ticks where there is room
  for (const v of B.ticks) { const p = ax(v), t = fmtPx(v), d = box(t, 11), r = placeBox([{ x: p.x - 8 - d.w, y: p.y - d.h / 2 - 1, w: d.w, h: d.h }], taken, bounds, 2); if (!r) continue; font(11); ctx.globalAlpha = fade * 0.75; ctx.fillStyle = C.tx2; ctx.fillText(t, r.x + 4, r.y + 12); ctx.globalAlpha = fade; }
  // the trail caption, just above its highest point and below its lowest
  if (B.trail?.length && !cp) {
    const ys = B.trail.map(r => r.spot).filter(v => v >= P.lo && v <= P.hi), hiP = S([(TX0 + TX1) / 2, B.yOf(Math.max(...ys, P.lo)) + 0.35, TZ]), loP = S([TX0, B.yOf(Math.min(...ys, P.hi)) - 0.3, TZ]);
    const t1 = `SPOT · LAST ${B.trail.length} CAPTURES`, d1 = box(t1, 11), r1 = placeBox([{ x: hiP.x - d1.w / 2, y: hiP.y - d1.h, w: d1.w, h: d1.h }, { x: hiP.x - d1.w / 2, y: hiP.y - d1.h - 20, w: d1.w, h: d1.h }], taken, bounds); if (r1) draw(r1, t1, C.tx2, 11);
    const t2 = `from ${fmtDay(B.trail[0].date)}${B.offScale > 0 ? ` · ${B.offScale} off scale` : ''}`, d2 = box(t2, 11), r2 = placeBox([{ x: loP.x, y: loP.y, w: d2.w, h: d2.h }, { x: loP.x, y: loP.y + 20, w: d2.w, h: d2.h }], taken, bounds); if (r2) draw(r2, t2, C.tx2, 11);
  }
  keyLine(ctx, g, KEY_LINE);
  ctx.restore();
}
/** The one-line key at the bottom, wrapped on a phone. Exported for GAMMA TERRAIN. */
export function keyLine(ctx, g, text) {
  const { W, H, C, fade } = g; ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'center'; const maxW = W - 24, words = text.split(' '), lines = []; let cur = '';
  for (const w of words) { const nx = cur ? `${cur} ${w}` : w; if (ctx.measureText(nx).width > maxW && cur) { lines.push(cur); cur = w; } else cur = nx; } if (cur) lines.push(cur);
  const y0 = H - (g.compact ? 96 : 70) - (lines.length - 1) * 14; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.globalAlpha = fade; ctx.fillRect(0, y0 - 13, W, lines.length * 14 + 8);
  ctx.fillStyle = C.tx2; lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * 14)); ctx.textAlign = 'left';
}
/** The prev / name / next picker drawn on the HUD canvas (hit keys prefix:prev / prefix:next). Exported for GAMMA TERRAIN. */
export function buttons(ctx, g, label, prefix = 'gp') {
  const { W, C, fade } = g, cp = g.compact, y = cp ? 100 : 128, bh = cp ? 30 : 26, items = cp ? [['prev', '‹', -112, 46], ['name', label, 0, 150], ['next', '›', 112, 46]] : [['prev', '‹', -98, 30], ['name', label, 0, 150], ['next', '›', 98, 30]];
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 12px ui-monospace,monospace';
  for (const [k, lb, dx, w] of items) { const x = W / 2 + dx; ctx.globalAlpha = fade * 0.85; ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(x - w / 2, y - bh / 2, w, bh); ctx.strokeStyle = C.blue; ctx.globalAlpha = fade * (k === 'name' ? 0.45 : 0.95); ctx.lineWidth = 1; ctx.strokeRect(x - w / 2, y - bh / 2, w, bh);
    ctx.fillStyle = k === 'name' ? C.blue : C.tx; ctx.globalAlpha = fade; ctx.fillText(lb, x, y + 1); if (k !== 'name') g.hit(`${prefix}:${k}`, x, y); }
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
}

const view = glView({ id: ID, label: 'GAMMA PILLAR', env: { accent: 'blue2', chrome: 'clean', scan: false }, setup,
  onEnter: api => { GP.show.p = -1; GP._spin = api.st.spin; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); loadStore(api).catch(() => null); },
  onLeave: api => { GP.show.p = -1; if (GP._spin != null) api.st.spin = GP._spin; GP._spin = null; } });
registerJarvisModule({
  id: ID, label: 'GAMMA PILLAR',
  render(pane, api) {
    pane.innerHTML = '<h3>GAMMA PILLAR: TODAY\'S OPTION BOOK AS A GLASS COLUMN</h3><p>Strikes run up the column like a price chart. Call open interest glows to the right, put open interest to the left on one scale, and net dealer gamma is the ribbon up the middle. Cyan glass is where dealers are modelled long gamma (moves tend to be damped), red glass where they are short gamma (moves tend to be amplified); the gold ring is the gamma flip and the white plane is spot. Beside it, the last 20 captures of spot and the walls.</p><p class="jv-sub">A description of positioning, not a forecast.</p><div class="jv-row"><button type="button" data-g="go">SHOW THE PILLAR</button></div>';
    pane.querySelector('[data-g="go"]').onclick = () => { api.setView(ID); loadStore(api, true).catch(() => null); };
  },
  views: [view],
});

registerShowScene({
  id: ID, after: 'chain',
  prepare: api => loadStore(api).then(() => { const k = pickMain(GP.avail); return k ? { key: k } : null; }).catch(() => null),
  build: (inp, d) => {
    const key = d?.key; if (!key) return null; const P = pillarOf(key), text = pillarScript(P, key); if (!text) return null;
    return { title: 'The gamma pillar', view: ID, cam: null, text, enter: api => { GP.key = key; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); }, motion: (api, p) => { GP.show.p = clampN(p, 0, 1); GP.show.at = Date.now(); } };
  },
});
export { GAMMA_MARKETS };
