// js/terminal/jarvisViewVol.js: Jarvis's VOL view: a molten terrain of "range used", drawn by the hologram engine (jarvisGL.js, real bloom); labels on the HUD canvas.
// ENCODING: across = the desk's markets grouped by asset class (a low ravine between classes, the class named on the floor), along = time (the last ~60 completed sessions, oldest at the back, the
// newest session the front edge), height AND colour = how stretched that day's high-low range was against that market's own normal (the median of its previous 20 sessions' ranges): height is linear
// in the ratio, 1.0 = a normal day, clipped at 3 (clipped days carry a white tip). Colour ramp: cool below normal, grey at normal, gold to red when stretched, white-hot at 3x. A white contour marks
// the 1.0 level. A gold sweep line travels along time and names its session; the tallest ridges carry a flare and a label. The camera drifts round the terrain (drag to turn, scroll to zoom; still
// under reduced motion). SHOW: down LOW along the newest session's edge, the markets passing one by one, then up and back over the whole window with the tallest ridges named.
// Data: /api/ohlc-range daily bars (OANDA, one request per market, in batches of 7; about 250 sessions, so the base rates have a year of each market's own days) and the VIX curve from /api/fredhistory?keys=vix,vix3m. The maths lives in jarvisVolCore.js.
// DESCRIPTION ONLY: it shows what already happened, never a forecast.
import { marketName } from './jarvisNames.js';
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { glView, orbitPos } from './jarvisGL.js';
import { placeBox } from './gammaHoloCore.js';
import { keyLine } from './jarvisViewGammaPillar.js';
import { VOL_GROUPS, VOL_MARKETS, CLIP, buildTerrain, dailyRanges, vixCurve, volScript, volBrief, volShowAct, groupColumns } from './jarvisVolCore.js';

const ID = 'vol', SUB = 2, XW = 7.4, ZD = 6.2, ZF = ZD / 2, HS = 0.55, GAP_V = 0.22, LEVEL = 1;
const S = { data: null, busy: null, at: 0, showP: -1, showAt: 0, spin: null };
const KEY = 'across = markets by asset class · along = time, newest session at the front · height and colour = that day\'s range / that market\'s own normal (median of its previous 20 days); 1.0 = normal (white contour), cut at 3 (white tips) · past days, not a forecast';
const KEY_PH = 'markets across · time along, newest at front · height = range / own normal, white line = 1.0, cut at 3 · past days, not a forecast';
const clampN = (v, a, b) => Math.max(a, Math.min(b, v)), sm = u => u * u * (3 - 2 * u);
const fmtD = iso => { const d = new Date(iso + 'T00:00:00Z'); return d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]; };
// the colour ramp: a cool valley, a neutral normal, then gold, red and white-hot (theme tokens only, blended as three.js colours)
const STOPS = [0, 0.85, 1.0, 1.5, 2.2, CLIP], NAMES = ['cy', 'cy', 'tx2', 'gold', 'dn', 'tx'];
function rampAt(v) { let k = 0; while (k < STOPS.length - 2 && v > STOPS[k + 1]) k++; return { a: NAMES[k], b: NAMES[k + 1], f: clampN((v - STOPS[k]) / (STOPS[k + 1] - STOPS[k]), 0, 1) }; }

/** Load the daily ranges for every market plus the VIX curve, once per ten minutes; a failed feed leaves that market out and never throws. */
export async function loadVol(api, force) {
  if (S.busy) return S.busy; if (S.data && !force && Date.now() - S.at < 600000) return S.data;
  S.busy = (async () => {
    const ok = p => Promise.resolve(p).catch(() => null), now = new Date(), today = now.toISOString().slice(0, 10), from = new Date(now.getTime() - 380 * 864e5).toISOString().slice(0, 10), bars = {};
    const vp = ok(api.jf('/api/fredhistory?keys=vix,vix3m'));
    // one server reply with every market's daily ranges (/api/vol-terrain, the same dailyRanges rule); the old per-market fan-out below runs only when it is missing
    const vt = await ok(api.jf('/api/vol-terrain'));
    if (vt?.ok && vt.markets) for (const [key, a] of Object.entries(vt.markets)) { const d = (Array.isArray(a) ? a : []).filter(x => x[0] < today).map(([date, r]) => ({ date, r })); if (d.length) bars[key] = d; }
    if (Object.keys(bars).length < 3) for (let k = 0; k < VOL_MARKETS.length; k += 7) {
      await Promise.all(VOL_MARKETS.slice(k, k + 7).map(async m => { const r = await ok(api.jf(`/api/ohlc-range?symbol=${m.oanda}&granularity=D&from=${from}&to=${today}`)); const d = dailyRanges(r, today); if (d.length) bars[m.key] = d; }));
    }
    let T = null; try { T = buildTerrain(bars); } catch (e) { T = null; }
    S.data = { T, V: vixCurve(await vp), got: Object.keys(bars).length }; S.at = Date.now(); S.busy = null; return S.data;
  })();
  return S.busy;
}

function setup(L, H, api) {
  const { THREE } = L, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 200), kit = H.kit;
  let data = null, B = null, builtFor = null, deco = false;
  const cam = { p: new THREE.Vector3(0, 6, 11), t: new THREE.Vector3(), wp: new THREE.Vector3(), wt: new THREE.Vector3(), init: false };
  const disposeGroup = g => g?.traverse(o => { o.geometry?.dispose?.(); const m = o.material; if (m) { kit._holo.delete(m); kit._mats.delete(m); if (!m.map) m.dispose?.(); } });

  function build(T, C) {
    if (data) { scene.remove(data); disposeGroup(data); } data = new THREE.Group(); scene.add(data);
    if (!deco) { deco = true; scene.add(kit.dust(900, 30, C.blue)); }
    const { cols, at } = groupColumns(T.markets), nc = (cols.length - 1) * SUB + 1, nr = T.ns, DX = XW / Math.max(1, nc - 1), DZ = ZD / Math.max(1, nr - 1);
    const xOf = u => -XW / 2 + u * DX, zOf = j => ZF - (nr - 1 - j) * DZ, vAt = (c, j) => (cols[c] < 0 ? GAP_V : T.Z[j * T.nm + cols[c]]);
    const HT = new Float32Array(nc * nr);
    for (let j = 0; j < nr; j++) for (let u = 0; u < nc; u++) { const c = Math.min(cols.length - 2, Math.floor(u / SUB)), f = sm((u - c * SUB) / SUB); HT[j * nc + u] = cols.length > 1 ? vAt(c, j) * (1 - f) + vAt(c + 1, j) * f : vAt(0, j); }
    const pal = {}; for (const k of new Set(NAMES)) pal[k] = H.color(C[k]); const tmp = new THREE.Color();
    const colour = (v, out, o, b) => { const r = rampAt(v); tmp.copy(pal[r.a]).lerp(pal[r.b], r.f); out[o] = tmp.r * b; out[o + 1] = tmp.g * b; out[o + 2] = tmp.b * b; };
    // floor and its grid: a line under each market, a line every 10 sessions; a faint back wall with the 1x / 2x / 3x levels
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(XW + 0.6, ZD + 0.6), new THREE.MeshBasicMaterial({ color: H.color(C.blue), transparent: true, opacity: 0.04, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    fl.rotation.x = -Math.PI / 2; data.add(fl);
    const grid = []; for (let j = nr - 1; j >= 0; j -= 10) grid.push([-XW / 2 - 0.2, 0, zOf(j), XW / 2 + 0.2, 0, zOf(j)]);
    for (const lv of [1, 2, 3]) grid.push([-XW / 2, lv * HS, -ZF - 0.05, XW / 2, lv * HS, -ZF - 0.05]); grid.push([-XW / 2, 0, -ZF - 0.05, -XW / 2, CLIP * HS, -ZF - 0.05], [XW / 2, 0, -ZF - 0.05, XW / 2, CLIP * HS, -ZF - 0.05]);
    data.add(kit.segments(grid, H.color(C.blue), 0.14));
    // the surface: vertex colours from the ramp, brighter where stretched; older sessions a little fainter
    const pos = new Float32Array(nc * nr * 3), col = new Float32Array(nc * nr * 3), lin = new Float32Array(nc * nr * 3);
    for (let j = 0; j < nr; j++) { const age = 0.45 + 0.55 * (j / Math.max(1, nr - 1)); for (let u = 0; u < nc; u++) { const k = j * nc + u, v = HT[k]; pos[k * 3] = xOf(u); pos[k * 3 + 1] = v * HS; pos[k * 3 + 2] = zOf(j);
      const e = Math.pow(clampN((v - 0.55) / 2.2, 0, 1), 1.2); colour(v, col, k * 3, age * (0.05 + 0.7 * e)); colour(v, lin, k * 3, age * (0.1 + 0.8 * e)); } }
    const idx = []; for (let j = 0; j < nr - 1; j++) for (let u = 0; u < nc - 1; u++) { const a = j * nc + u, b = a + 1, c = a + nc, d = c + 1; idx.push(a, c, b, b, c, d); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3)); sg.setIndex(idx);
    data.add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })));
    const wf = [], wc = [], seg = (a, b) => { wf.push(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2], pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]); wc.push(lin[a * 3], lin[a * 3 + 1], lin[a * 3 + 2], lin[b * 3], lin[b * 3 + 1], lin[b * 3 + 2]); };
    for (let j = nr - 1; j >= 0; j -= 2) for (let u = 0; u < nc - 1; u++) seg(j * nc + u, j * nc + u + 1);
    for (let u = 0; u < nc; u += SUB) for (let j = 0; j < nr - 1; j++) seg(j * nc + u, (j + 1) * nc + u);
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wf, 3)); wg.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
    data.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })));
    // the 1.0 contour (marching squares on the grid, in world space, lifted a hair so it rides on the surface)
    const ct = [];
    for (let j = 0; j < nr - 1; j++) for (let u = 0; u < nc - 1; u++) {
      const c4 = [j * nc + u, j * nc + u + 1, (j + 1) * nc + u + 1, (j + 1) * nc + u], hit = [];
      for (let e = 0; e < 4; e++) { const p = c4[e], q = c4[(e + 1) & 3], hp = HT[p] - LEVEL, hq = HT[q] - LEVEL; if ((hp > 0) === (hq > 0)) continue; const f = hp / (hp - hq);
        hit.push(pos[p * 3] + (pos[q * 3] - pos[p * 3]) * f, LEVEL * HS + 0.01, pos[p * 3 + 2] + (pos[q * 3 + 2] - pos[p * 3 + 2]) * f); }
      if (hit.length >= 6) ct.push(hit.slice(0, 6)); if (hit.length === 12) ct.push(hit.slice(6, 12));
    }
    if (ct.length) { const g = new L.LineSegmentsGeometry(); g.setPositions(ct.flat()); const m = new L.LineMaterial({ color: H.color(C.tx), linewidth: 1.1, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
      m.resolution.set(H.W || 1280, H.H || 720); kit._mats.add(m); data.add(new L.LineSegments2(g, m)); }
    // the newest session's edge, bright, and white tips on the days clipped at 3x
    { const pts = []; for (let u = 0; u < nc; u++) pts.push([pos[((nr - 1) * nc + u) * 3], pos[((nr - 1) * nc + u) * 3 + 1] + 0.01, ZF]); data.add(kit.line(pts, H.color(C.tx), 1.8, 0.7)); }
    const caps = []; for (let i = 0; i < T.nm; i++) for (let j = 0; j < nr; j++) if (T.Z[j * T.nm + i] >= CLIP - 0.005) caps.push([xOf(at[i] * SUB), CLIP * HS + 0.04, zOf(j)]);
    if (caps.length) { const p = kit.points(caps.length, H.color(C.tx), 6, { opacity: 1 }), a = p.geometry.attributes.position.array; caps.forEach((c, n) => { a[n * 3] = c[0]; a[n * 3 + 1] = c[1]; a[n * 3 + 2] = c[2]; }); data.add(p); }
    // the tallest ridges in the window (each market's biggest day, 1.6x or more), with a flare
    const peaks = T.peaks.filter(p => p.v >= 1.6).slice(0, 6).map(p => { const w = [xOf(at[p.i] * SUB), p.v * HS, zOf(p.j)], f = kit.flare(H.color(p.v >= 2.2 ? C.dn : C.gold), 0.32, 0.9); f.position.set(w[0], w[1] + 0.02, w[2]); data.add(f); return { ...p, w }; });
    // the sweep: a gold line along one session (moved, not rebuilt)
    const sp = []; for (let u = 0; u < nc; u++) sp.push([pos[u * 3], pos[u * 3 + 1] + 0.02, pos[u * 3 + 2]]); const sweep = kit.line(sp, H.color(C.gold), 2.6, 0.95); data.add(sweep);
    B = { T, nc, nr, at, cols, xOf, zOf, HT, pos, peaks, sweep, sweepRow: -1, sweepArr: new Float32Array(nc * 3) };
  }
  function setSweep(j) {
    if (!B || B.sweepRow === j) return; B.sweepRow = j; const a = B.sweepArr, nc = B.nc;
    for (let u = 0; u < nc; u++) { const k = j * nc + u; a[u * 3] = B.pos[k * 3]; a[u * 3 + 1] = B.pos[k * 3 + 1] + 0.02; a[u * 3 + 2] = B.pos[k * 3 + 2]; }
    B.sweep.geometry.setPositions(a); B.sweep.computeLineDistances();
  }

  return {
    scene, camera, bloom: { strength: 0.6, radius: 0.45, threshold: 0.16 },
    update(t, dt, a0, g) {
      const a = a0 ?? api, st = a.st, D = S.data;
      if (!D) { loadVol(a); return; } if (Date.now() - S.at > 600000) loadVol(a);
      const T = D.T; if (!T) { if (data) { scene.remove(data); disposeGroup(data); data = null; B = null; } return; }
      const sig = `${S.at}|${g.C.blue}|${g.C.gold}`; if (sig !== builtFor) { builtFor = sig; build(T, g.C); }
      const aspect = g.W / Math.max(1, g.H), ph = aspect < 1, show = S.showP >= 0 && Date.now() - S.showAt < 1500, calm = H.calm, nr = B.nr, zoom = st.zoom || 1;
      if (show) {
        const A = volShowAct(S.showP); setSweep(nr - 1);
        if (A.act === 'sweep') { const x = -XW / 2 - 0.4 + (XW + 0.8) * A.k, back = ph ? 2.4 : 1; cam.wp.set(x - 0.8, 1.85, ZF + 2.1 * back); cam.wt.set(x + 0.4, 0.3, ZF - 0.5); }
        else if (A.act === 'rise') { const k = A.k, zt = ZF * (1 - k) + 0.8 * k, o = orbitPos(0.25 * k, 0.3 + 0.65 * k, (ph ? 9 : 4.5) + (ph ? 9 : 7) * k, [0, 0.3, zt]); cam.wp.set(o[0] + (XW / 2) * (1 - k), o[1], o[2]); cam.wt.set((XW / 2) * (1 - k), 0.3, zt); }
        else { const o = orbitPos(0.25 - 0.5 * A.k, 0.95, ph ? 18 : 11.5, [0, 0.3, 0.8]); cam.wp.set(o[0], o[1], o[2]); cam.wt.set(0, 0.3, 0.8); }
      } else {
        // the drift: the sweep travels oldest -> newest (resting on the newest under reduced motion); the camera orbits slowly
        const sr = Math.floor((t * 3.4) % (nr + 8)); setSweep(calm ? nr - 1 : Math.min(nr - 1, sr)); B.sweep.visible = calm || sr < nr;
        const yaw = (st.yaw - 0.35) + (calm ? 0 : Math.sin(t * 0.05) * 0.4), el = clampN((ph ? 0.75 : 0.55) - (st.pitch + 0.45) * 0.8, 0.06, 1.35);
        const o = orbitPos(yaw, el, (ph ? 18 : 10) / zoom, [0, 0.4, 0.2]); cam.wp.set(o[0], o[1], o[2]); cam.wt.set(0, 0.4, 0.2);
      }
      if (show) B.sweep.visible = true;
      if (!cam.init) { cam.p.copy(cam.wp); cam.t.copy(cam.wt); cam.init = true; }
      const k = Math.min(1, dt * (show ? 2.6 : 3)); cam.p.lerp(cam.wp, k); cam.t.lerp(cam.wt, k); camera.position.copy(cam.p); camera.lookAt(cam.t);
    },
    overlay(ctx, g, a) { overlay(ctx, g, a ?? api, H, camera, B); },
    dispose() { disposeGroup(scene); },
  };
}

// ───────────────────────── the 2D overlay: the readout, labels on the terrain, the colour bar and the key ─────────────────────────
function overlay(ctx, g, api, H, camera, B) {
  const { W, H: Hh, C, fade } = g, cp = g.compact, D = S.data; ctx.save(); ctx.globalAlpha = fade; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const font = (px, w = '') => { ctx.font = `${w}${px}px ui-monospace,monospace`; };
  const msg = s => { font(13); ctx.fillStyle = C.tx2; ctx.textAlign = 'center'; ctx.fillText(s, W / 2, Hh / 2); ctx.textAlign = 'left'; };
  if (!D) { msg('Surveying the volatility terrain...'); ctx.restore(); return; }
  if (!D.T || !B) { msg('The daily range feeds are not available right now, so there is no terrain to draw.'); ctx.restore(); return; }
  const T = B.T, V = D.V, nr = B.nr, nc = B.nc, Sc = p => H.toScreen(p, camera), taken = [], bg = 'rgba(0,0,0,0.66)', show = S.showP >= 0 && Date.now() - S.showAt < 1500;
  const bounds = { x0: 4, y0: cp ? 124 : 96, x1: W - 4, y1: Hh - (cp ? 190 : 120) };
  const draw = (r, text, col, px, w) => { font(px, w); ctx.fillStyle = bg; ctx.globalAlpha = fade * 0.9; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = fade; ctx.fillStyle = col; ctx.fillText(text, r.x + 4, r.y + px + 1); };
  const label = (p, text, col, px, w, cands) => { if (!p.vis) return null; font(px, w); const bw = ctx.measureText(text).width + 8, bh = px + 6; const r = placeBox(cands.map(([dx, dy]) => ({ x: p.x + dx(bw), y: p.y + dy(bh), w: bw, h: bh })), taken, bounds); if (r) draw(r, text, col, px, w); return r; };
  const right = () => 10, left = w => -10 - w, mid = w => -w / 2, up = h => -h - 8, down = () => 8, cen = h => -h / 2;
  const xv = v => (v >= CLIP - 0.005 ? '3.0x+' : `${v.toFixed(2)}x`), tone = v => (v >= 2.2 ? C.dn : v >= 1.5 ? C.gold : v < 0.85 ? C.cy : C.tx2);
  const mx = i => B.xOf(B.at[i] * SUB), wy = v => v * HS;
  // the readout, top left
  const sj = B.sweepRow;
  if (cp) {
    font(11, '600 '); ctx.fillStyle = C.blue; ctx.fillText(`LATEST ${fmtD(T.dates[T.ns - 1])} · ${T.stretched} of ${T.nm} markets at 1.5x normal+`, 14, 96);
    font(10); ctx.fillStyle = C.tx2; ctx.fillText(V ? `VIX ${V.vix.toFixed(1)}${V.vix3m != null ? ` · VIX3M ${V.vix3m.toFixed(1)} · ${V.inverted ? 'INVERTED' : 'upward'}` : ''}` : 'VIX curve: no feed', 14, 112); taken.push({ x: 8, y: 80, w: W - 16, h: 40 });
  } else {
    const x = 24, y = 118, h = 150; ctx.fillStyle = bg; ctx.fillRect(x - 10, y - 18, 320, h);
    font(12, '600 '); ctx.fillStyle = C.blue; ctx.fillText(`VOL · RANGE USED · latest ${fmtD(T.dates[T.ns - 1])}`, x, y);
    font(11); ctx.fillStyle = C.tx; ctx.fillText(`${T.stretched} of ${T.nm} markets at 1.5x their normal or more`, x, y + 18);
    T.latest.slice(0, 4).forEach((m, i) => { ctx.fillStyle = tone(m.v); ctx.fillText(`${m.v >= 1 ? '▲' : '▼'} ${marketName(m.key, { short: true })} ${xv(m.v)}`, x + (i % 2) * 150, y + 36 + Math.floor(i / 2) * 15); });
    if (sj >= 0 && sj < T.ns) { let bi = 0; for (let i = 1; i < T.nm; i++) if (T.Z[sj * T.nm + i] > T.Z[sj * T.nm + bi]) bi = i; ctx.fillStyle = C.gold; ctx.fillText(`SWEEP ${fmtD(T.dates[sj])} · top ${marketName(T.markets[bi].key, { short: true })} ${xv(T.Z[sj * T.nm + bi])}`, x, y + 74); }
    ctx.fillStyle = C.tx2; ctx.fillText(V ? `VIX ${V.vix.toFixed(1)}${V.vix3m != null ? ` · VIX3M ${V.vix3m.toFixed(1)} · curve ${V.inverted ? 'INVERTED' : 'upward'}` : ''}` : 'VIX curve: no feed', x, y + 92);
    // the colour bar
    const bw = 220, by = y + 104; for (let i = 0; i < bw; i++) { const r = rampAt(i / (bw - 1) * CLIP); ctx.fillStyle = C[r.a]; ctx.globalAlpha = fade * (1 - r.f) * 0.9; ctx.fillRect(x + i, by, 1, 7); ctx.fillStyle = C[r.b]; ctx.globalAlpha = fade * r.f * 0.9; ctx.fillRect(x + i, by, 1, 7); }
    ctx.globalAlpha = fade; font(10); ctx.fillStyle = C.tx2; ctx.fillText('0x', x, by + 19); ctx.textAlign = 'center'; ctx.fillText('1x normal', x + bw / CLIP, by + 19); ctx.textAlign = 'right'; ctx.fillText('3x+ (cut)', x + bw, by + 19); ctx.textAlign = 'left';
    taken.push({ x: x - 10, y: y - 18, w: 320, h });
  }
  // the newest session: each market's value at the front edge (the ones near the camera in the SHOW sweep, the stretched ones otherwise)
  const front = T.markets.map((m, i) => ({ i, key: m.key, v: T.Z[(T.ns - 1) * T.nm + i] }));
  const pick = show ? front.slice().sort((a, b) => Math.abs(Sc([mx(a.i), 0, ZF]).x - W / 2) - Math.abs(Sc([mx(b.i), 0, ZF]).x - W / 2)).slice(0, cp ? 3 : 7) : front.filter(f => f.v >= 1.5 || f.v < 0.6).sort((a, b) => b.v - a.v).slice(0, cp ? 3 : 6);
  for (const f of pick) label(Sc([mx(f.i), wy(f.v), ZF]), `${marketName(f.key, { short: true })} ${xv(f.v)}`, tone(f.v), show ? 12 : 11, '600 ', [[mid, up], [right, up], [left, up], [mid, h => -h - 26]]);
  // the tallest ridges in the window
  if (!show || volShowAct(S.showP).act !== 'sweep') for (const p of B.peaks.slice(0, cp ? 2 : 5)) label(Sc(p.w), `${marketName(p.key, { short: true })} ${fmtD(p.date)} ${xv(p.v)}`, p.v >= 2.2 ? C.dn : C.gold, 11, '', [[right, up], [left, up], [right, down], [left, down]]);
  // the sweep's date at its right end
  if (B.sweep.visible && sj >= 0) { const k = sj * nc + nc - 1; label(Sc([B.pos[k * 3] + 0.1, B.pos[k * 3 + 1], B.pos[k * 3 + 2]]), sj === nr - 1 ? `NEWEST ${fmtD(T.dates[sj])}` : fmtD(T.dates[sj]), C.gold, 11, '600 ', [[right, cen], [right, up]]); }
  // the asset classes on the floor in front of the newest edge, dates down the left edge, the levels on the back wall
  for (const gr of VOL_GROUPS) { const ii = T.markets.map((m, i) => (m.group === gr.id ? i : -1)).filter(i => i >= 0); if (!ii.length) continue; const x = (mx(ii[0]) + mx(ii[ii.length - 1])) / 2; label(Sc([x, 0, ZF + 0.3]), gr.label, C.tx2, 11, '600 ', [[mid, down], [mid, () => 24]]); }
  for (const j of cp ? [0] : [0, Math.round((nr - 1) / 2)]) label(Sc([-XW / 2 - 0.15, 0, B.zOf(j)]), fmtD(T.dates[j]), C.tx2, 10, '', [[left, cen], [left, up]]);
  for (const lv of [1, 2, 3]) label(Sc([-XW / 2, lv * HS, -ZF]), lv === 3 ? '3x cut' : lv === 1 ? '1x normal' : '2x', C.tx2, 10, '', [[left, cen]]);
  ctx.globalAlpha = fade; keyLine(ctx, g, cp ? KEY_PH : KEY);
  ctx.restore();
}

const view = glView({ id: ID, label: 'VOL', env: { accent: 'dn', chrome: 'clean', scan: false }, setup,
  onEnter: api => { S.showP = -1; S.spin = api.st.spin; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); loadVol(api); },
  onLeave: api => { S.showP = -1; if (S.spin != null) api.st.spin = S.spin; S.spin = null; } });

registerJarvisModule({
  id: 'vol', label: 'VOL',
  render(pane, api) {
    pane.innerHTML = `<h3>VOLATILITY LANDSCAPE</h3><p>A terrain you fly over. Across are the desk's markets by asset class, along is time (the last 60 completed sessions), and the height is how stretched each day's range was against that market's own normal: 1.0 is a normal day, and a white contour marks it. Cool valleys are quiet days, gold to red ridges are stretched days. Drag to take the controls.</p><p class="jv-sub">It describes what already happened. It is never a forecast.</p><div class="jv-row"><button type="button" data-w="go">FLY THE TERRAIN</button></div>`;
    pane.querySelector('[data-w="go"]').onclick = () => { api.setView('vol'); loadVol(api, true); };
  },
  views: [view],
});

registerShowScene({
  id: 'vol', after: 'lean',
  prepare: api => loadVol(api),
  build: (inp, data) => { const guide = data?.T ? volScript(data.T, data.V) : null, brief = data?.T ? volBrief(data.T, data.V) : null, text = inp?.guide ? guide : brief ?? guide; return text ? { title: 'The volatility landscape', view: 'vol', cam: null, text, guide, enter: api => { Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); S.showP = 0; S.showAt = Date.now(); }, motion: (api, p) => { S.showP = clampN(p, 0, 1); S.showAt = Date.now(); } } : null; },
});
