// js/terminal/jarvisViewGamma.js: Jarvis's GAMMA view: an amber "dealer floor" you fly along. The strike ladder of one market runs away from you (lowest strike near, highest far), and at each strike stand a pair of bars:
// call open interest rising (green) on the right, put open interest hanging (red) on the left, on one shared scale. A glowing ribbon through the middle traces the net gamma those open interest books imply, strike by
// strike, and changes colour at the gamma-flip strike (a bright ring). The two biggest strikes carry tall labelled pylons, the spot price is a bright plane slicing the corridor and max pain is a small floor marker.
// The camera auto-flies from the lowest strike to the highest, passing each marker with a plain-words card; drag/zoom takes the controls (the auto-fly pauses), PAUSE holds it.
// Data: /api/oi-store (the nightly CME open-interest capture, public). Canvas 2D with its own perspective; all projection arrays are allocated once. DESCRIPTION ONLY: where open interest sits and the gamma it
// implies. It is never a forecast: the repo's own studies found no proven direction from these levels. The maths lives in jarvisGammaCore.js.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { GAMMA_MARKETS, BINS, marketsWithOI, buildLadder, fmtPx, fmtOI, rel, gammaScript } from './jarvisGammaCore.js';

const DZ = 0.17, BD = 0.1, XI = 0.04, XO = 0.13, HMAX = 0.8, DEPTH = 9, RIB = 0.55;
const PX = new Float32Array(16), PY = new Float32Array(16), PZ = new Float32Array(16);
const FACES = { xlo: [0, 2, 6, 4], xhi: [1, 3, 7, 5], ylo: [0, 1, 5, 4], yhi: [2, 3, 7, 6], zlo: [0, 1, 3, 2] };
const S = { store: null, avail: [], at: 0, busy: null, err: false, key: null, cache: new Map(), p: 0, touch: -99, paused: false, lastYaw: 0.35, lastPitch: -0.45, lastZoom: 1, showP: -1, showAt: 0, bg: null, spin: null, camY: 0.27 };
const tau = 6.2832, clampN = (v, a, b) => Math.max(a, Math.min(b, v)), calmMotion = api => !!api.win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
const zOf = (L, strike) => ((strike - L.lo) / L.w - 0.5) * DZ;

/** Read the stored option books once per ten minutes. A failed read leaves the view saying so; it never throws. */
export async function loadGamma(api, force) {
  if (S.busy) return S.busy; if (S.store && !force && Date.now() - S.at < 600000) return S.store;
  S.busy = (async () => {
    let j = null; try { j = await api.jf('/api/oi-store'); } catch (e) { j = null; }
    const store = j?.data ?? j; S.err = !store || typeof store !== 'object'; if (!S.err) { S.store = store; S.avail = marketsWithOI(store); S.cache.clear(); }
    S.at = Date.now(); S.busy = null; return S.store;
  })();
  return S.busy;
}
const metaOf = key => GAMMA_MARKETS.find(m => m.key === key) ?? null;
/** The ladder for a HUD market key (cached); null when that market has no open interest read. */
const ladderOf = key => { const m = metaOf(key); if (!m || !S.store?.[m.pair]) return null; if (!S.cache.has(key)) { let L = null; try { L = buildLadder({ ...S.store[m.pair], pair: m.pair }); } catch (e) { L = null; } S.cache.set(key, L); } return S.cache.get(key); };
const pickStart = api => { const sel = api.st?.sel; return S.avail.some(m => m.key === sel) ? sel : S.avail[0]?.key ?? null; };
const step = d => { const n = S.avail.length; if (!n) return; const i = S.avail.findIndex(m => m.key === S.key); S.key = S.avail[(Math.max(0, i) + d + n) % n].key; S.p = 0; };

function draw(ctx, g, api) {
  const { W, H, C, t, fade } = g, dt = Math.min(0.05, g.dt || 0.016), calm = calmMotion(api), st = api.st;
  ctx.save(); ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'center';
  if (typeof st.sel === 'string' && st.sel.startsWith('gm:')) { const k = st.sel.slice(3); if (k === 'prev') step(-1); else if (k === 'next') step(1); else if (k === 'pause') S.paused = !S.paused; st.sel = null; api.blip?.(780, 0.05); }
  if (!S.store && !S.err) { ctx.globalAlpha = fade; ctx.fillStyle = C.tx2; ctx.fillText('Reading the option books...', W / 2, H / 2); ctx.restore(); return; }
  if (S.err || !S.avail.length) { ctx.globalAlpha = fade; ctx.fillStyle = C.tx2; ctx.fillText(S.err ? 'The option open interest feed is not available right now, so there is no strike ladder to draw.' : 'No open interest read today.', W / 2, H / 2); ctx.restore(); return; }
  if (!S.key || !S.avail.some(m => m.key === S.key)) S.key = pickStart(api);
  const L = ladderOf(S.key), meta = metaOf(S.key);
  buttons(ctx, g, meta);
  if (!L) { ctx.globalAlpha = fade; ctx.fillStyle = C.tx2; ctx.fillText(`No open interest read for ${meta?.label ?? S.key} today`, W / 2, H / 2); ctx.restore(); return; }
  const n = L.n, zEnd = (n - 1) * DZ;
  if (st.yaw !== S.lastYaw || st.pitch !== S.lastPitch || st.zoom !== S.lastZoom || st.drag) { S.touch = t; S.lastYaw = st.yaw; S.lastPitch = st.pitch; S.lastZoom = st.zoom; }
  const held = t - S.touch < 6 || S.paused, show = S.showP >= 0 && Date.now() - S.showAt < 1500;
  if (show) S.p = S.showP; else if (!held) { S.p += dt * (calm ? 0.004 : 0.016); if (S.p > 1.04) S.p = 0; }
  const cz = -0.55 + clampN(S.p, 0, 1) * (zEnd + 0.9), sway = calm ? 0.2 : 1, camX = Math.sin(t * 0.17) * 0.05 * sway, roll = -Math.cos(t * 0.17) * 0.07 * sway;
  S.camY += (0.27 + Math.sin(t * 0.4) * 0.03 * sway - S.camY) * Math.min(1, dt * 2); const camY = S.camY;
  const yw = clampN((st.yaw - 0.35) * 0.7, -0.9, 0.9) + Math.sin(t * 0.09) * 0.05 * sway, pt = clampN(0.18 + (st.pitch + 0.45) * 0.6, -0.15, 1.1), F = Math.min(W * 0.62, H * 0.95) * (st.zoom || 1);
  const cyw = Math.cos(yw), syw = Math.sin(yw), cpt = Math.cos(pt), spt = Math.sin(pt), cr = Math.cos(roll), sr = Math.sin(roll), ox = W / 2, oy = H * 0.5;
  let oX = 0, oY = 0, oZ = 0;
  const pj = (x, y, z) => { const dx = x - camX, dy = y - camY, dz = z - cz, x1 = dx * cyw - dz * syw, z1 = dx * syw + dz * cyw, y2 = dy * cpt + z1 * spt, z2 = z1 * cpt - dy * spt; oZ = z2; if (z2 < 0.16) { oX = oY = 0; return false; } const sx = x1 / z2 * F, sy = -y2 / z2 * F; oX = ox + sx * cr - sy * sr; oY = oy + sx * sr + sy * cr; return true; };
  const dep = z2 => clampN(1 - (z2 - 0.3) / DEPTH, 0, 1);
  const sc = Math.max(1, L.maxCall, L.maxPut), flipZ = L.flip != null ? zOf(L, L.flip) : null, spotZ = zOf(L, L.spot);

  // the horizon glow in the accent colour, then the floor rail and the strike ticks
  const hz = ctx.createLinearGradient(0, H * 0.2, 0, H * 0.62); hz.addColorStop(0, 'transparent'); hz.addColorStop(1, C.blue); ctx.globalAlpha = fade * 0.16; ctx.fillStyle = hz; ctx.fillRect(0, H * 0.2, W, H * 0.45);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = C.gold; ctx.lineWidth = 1;
  for (let i = n - 1; i >= 0; i--) {
    const z = i * DZ; if (z < cz - 0.1) continue;
    if (!pj(-0.3, 0, z)) continue; const ax = oX, ay = oY, az = oZ; if (!pj(0.3, 0, z)) continue;
    ctx.globalAlpha = fade * dep(az) * (i % 4 === 0 ? 0.35 : 0.14); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(oX, oY); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 1.4;
  for (const sx of [-0.02, 0.02, -0.3, 0.3]) { ctx.beginPath(); let go = false; for (let i = 0; i < n; i += 1) { const z = i * DZ; if (z < cz - 0.2 || z > cz + 6) continue; if (!pj(sx, 0, z)) { go = false; continue; } go ? ctx.lineTo(oX, oY) : ctx.moveTo(oX, oY); go = true; } ctx.globalAlpha = fade * (Math.abs(sx) < 0.1 ? 0.7 : 0.3); ctx.strokeStyle = C.gold; ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over';

  // the bars, far to near: an opaque dark body so nearer bars hide farther ones, then the lit faces and an edge
  const bg = S.bg || 'black';
  const box = (x0, x1, y0, y1, z0, z1, col, k, a) => {
    let c = 0; for (let b = 0; b < 8; b++) { const ok = pj(b & 1 ? x1 : x0, b & 2 ? y1 : y0, b & 4 ? z1 : z0); PX[b] = oX; PY[b] = oY; PZ[b] = oZ; if (ok) c++; }
    if (c < 8) return;
    const faces = []; if (camX < x0) faces.push('xlo'); else if (camX > x1) faces.push('xhi'); if (camY > y1) faces.push('yhi'); else if (camY < y0) faces.push('ylo'); if (cz < z0) faces.push('zlo');
    for (const f of faces) {
      const q = FACES[f]; ctx.beginPath(); ctx.moveTo(PX[q[0]], PY[q[0]]); for (let m = 1; m < 4; m++) ctx.lineTo(PX[q[m]], PY[q[m]]); ctx.closePath();
      ctx.globalAlpha = a * 0.9; ctx.fillStyle = bg; ctx.fill(); ctx.globalAlpha = a * (f === 'zlo' ? 0.42 : f[0] === 'y' ? 0.62 : 0.26) * (0.6 + k * 0.7); ctx.fillStyle = col; ctx.fill();
      ctx.globalAlpha = a * 0.85; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
    }
  };
  for (let i = n - 1; i >= 0; i--) {
    const z0 = i * DZ - BD / 2, z1 = i * DZ + BD / 2; if (z1 < cz + 0.05) continue; if (!pj(0, 0, i * DZ)) continue; const a = fade * dep(oZ) * (z0 < cz + 0.4 ? 0.7 : 1); if (a < 0.02) continue;
    const cv = L.call[i] / sc, pv = L.put[i] / sc;
    if (L.put[i] > 0) box(-XO, -XI, -Math.max(0.012, pv * HMAX), 0, z0, z1, C.dn, Math.min(1, pv * 2), a);
    if (L.call[i] > 0) box(XI, XO, 0, Math.max(0.012, cv * HMAX), z0, z1, C.up, Math.min(1, cv * 2), a);
  }
  // the net-gamma ribbon through the middle: a curtain down to the floor and a bright line on top; colour flips at the gamma-flip strike
  ribbon(ctx, g, L, cz, pj, () => [oX, oY, oZ], dep);
  // markers: the flip ring, the spot plane, max pain, and the wall pylons
  const marks = [];
  const flipM = flipZ != null && L.flip != null;
  if (flipM) { ring(ctx, g, pj, () => [oX, oY, oZ], flipZ, C.tx, t, dep, cz); marks.push({ z: flipZ, x: 0, y: 0.62, col: C.tx, title: `GAMMA FLIP  ${fmtPx(L.flip)}`, l1: 'net gamma changes sign at this strike', l2: 'hedging tends to calm moves on one side, add to them on the other: a boundary, not a target' }); }
  spotPlane(ctx, g, L, pj, () => [oX, oY, oZ], spotZ, cz, dep, t);
  marks.push({ z: spotZ, x: 0, y: -0.58, col: C.tx, title: `SPOT  ${fmtPx(L.spot)}`, l1: 'the price now', l2: L.long == null ? '' : `per the data, dealers are net ${L.long ? 'long' : 'short'} gamma here` });
  if (L.maxPain != null) { const mz = zOf(L, L.maxPain); if (pj(0, 0, mz) && mz > cz) { const a = fade * dep(oZ); ctx.globalAlpha = a * 0.9; ctx.strokeStyle = C.gold; ctx.lineWidth = 1.4; const d = 7 * F / Math.max(0.5, oZ) * 0.012 + 3; ctx.beginPath(); ctx.moveTo(oX, oY - d); ctx.lineTo(oX + d, oY); ctx.lineTo(oX, oY + d); ctx.lineTo(oX - d, oY); ctx.closePath(); ctx.stroke(); }
    marks.push({ z: mz, x: 0, y: 0.03, col: C.gold, title: `MAX PAIN  ${fmtPx(L.maxPain)}`, l1: 'the strike where option holders lose least at expiry', l2: 'a level to know about, not a magnet', small: true }); }
  for (const [W_, side, col, name, ln] of [[L.callWall, 1, C.up, 'CALL WALL', 'largest call open interest here'], [L.putWall, -1, C.dn, 'PUT WALL', 'largest put open interest here']]) {
    if (!W_) continue; const z = zOf(L, W_.strike), top = side * (HMAX + 0.3), xx = side * (XI + XO) / 2;
    if (pj(xx, 0, z)) { const bx = oX, by = oY, bz = oZ; if (pj(xx, top, z)) { const a = fade * dep(bz); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.globalAlpha = a * 0.2; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(oX, oY); ctx.stroke(); ctx.lineWidth = 1.6; ctx.globalAlpha = a; ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(oX, oY, 3.2, 0, tau); ctx.fill(); } }
    marks.push({ z, x: xx, y: top, col, title: `${name}  ${fmtPx(W_.strike)}`, l1: `${fmtOI(W_.oi)} contracts · ${ln}`, l2: rel(W_.strike, L.spot).replace(' percent', '%') });
  }
  cards(ctx, g, marks, cz, pj, () => [oX, oY, oZ]);
  hud(ctx, g, L, meta, cz, n);
  ctx.restore();
}

// the ribbon: segment by segment, a faint curtain to the floor and a hot line, additive so it glows
function ribbon(ctx, g, L, cz, pj, out, dep) {
  const { fade, C } = g, n = L.n; let px = 0, py = 0, pz = 0, fx = 0, fy = 0, have = false, pc = null;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const z = i * DZ; if (z < cz - 0.3 || z > cz + 6.5) { have = false; continue; }
    if (!pj(0, L.net[i] * RIB, z)) { have = false; continue; } const [x, y, d] = out(); const f = pj(0, 0, z) ? out() : null; const col = (L.flip != null ? L.strikes[i] >= L.flip : L.net[i] >= 0) ? C.cy : C.gold;
    if (have && f) {
      const a = fade * dep(d);
      ctx.fillStyle = col; ctx.globalAlpha = a * 0.1; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.lineTo(f[0], f[1]); ctx.lineTo(fx, fy); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.globalAlpha = a * 0.16; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      ctx.lineWidth = 2; ctx.globalAlpha = a * 0.95; ctx.stroke();
    }
    px = x; py = y; pz = d; fx = f ? f[0] : x; fy = f ? f[1] : y; have = true; pc = col;
  }
  void pz; void pc; ctx.globalCompositeOperation = 'source-over';
}

// a ring standing across the corridor (the gamma flip)
function ring(ctx, g, pj, out, z, col, t, dep, cz) {
  if (z < cz - 0.1) return; ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = col; let go = false, d0 = 0;
  const R = 0.62, M = 40; ctx.beginPath();
  for (let k = 0; k <= M; k++) { const a = k / M * tau; if (!pj(Math.cos(a) * R, Math.sin(a) * R * 0.9, z)) { go = false; continue; } const o = out(); d0 = o[2]; go ? ctx.lineTo(o[0], o[1]) : ctx.moveTo(o[0], o[1]); go = true; }
  const a = g.fade * dep(d0) * (0.75 + 0.2 * Math.sin(t * 2.4)); ctx.lineWidth = 8; ctx.globalAlpha = a * 0.16; ctx.stroke(); ctx.lineWidth = 2.2; ctx.globalAlpha = a; ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
}

// the spot price: a translucent bright plane across the corridor, with a pulsing edge
function spotPlane(ctx, g, L, pj, out, z, cz, dep, t) {
  if (z < cz - 0.05) return; const q = [[-0.4, -0.7], [0.4, -0.7], [0.4, 0.7], [-0.4, 0.7]], p = []; let dd = 0;
  for (const [x, y] of q) { if (!pj(x, y, z)) return; const o = out(); p.push([o[0], o[1]]); dd = o[2]; }
  const a = g.fade * dep(dd), pul = 0.65 + 0.3 * Math.sin(t * 3); ctx.globalCompositeOperation = 'lighter'; ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath();
  ctx.fillStyle = g.C.tx; ctx.globalAlpha = a * 0.07; ctx.fill(); ctx.strokeStyle = g.C.tx; ctx.lineWidth = 1.6; ctx.globalAlpha = a * pul; ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
}

// the floating cards: a label that fades in as the camera approaches a marker and opens into plain words as it passes
function cards(ctx, g, marks, cz, pj, out) {
  const { fade, W } = g; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  for (const m of marks) {
    const d = m.z - cz; if (d < -0.7 || d > 3.2) continue; const a = (d > 0 ? clampN((3.2 - d) / 1.4, 0, 1) : clampN(1 + d / 0.7, 0, 1)) * fade; if (a < 0.03) continue;
    if (!pj(m.x, m.y, m.z)) continue; const [x, y] = out(), open = d > -0.5 && d < 1.3, small = m.small, bw = open ? 330 : 190, lx = clampN(x + 14, 8, W - bw - 8), ly = y - 24;
    ctx.globalAlpha = a * 0.75; ctx.strokeStyle = m.col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(lx, ly + 4); ctx.stroke(); ctx.fillStyle = m.col; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, tau); ctx.fill();
    ctx.globalAlpha = a * 0.78; ctx.fillStyle = S.bg || 'black'; ctx.fillRect(lx - 6, ly - 13, bw, open ? (small ? 56 : 56) : 20);
    ctx.globalAlpha = a; ctx.fillStyle = m.col; ctx.font = '600 12px ui-monospace,monospace'; ctx.fillText(m.title, lx, ly);
    if (open) { ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = g.C.tx; ctx.fillText(clip(m.l1, 46), lx, ly + 16); ctx.fillStyle = g.C.tx2; ctx.fillText(clip(m.l2, 52), lx, ly + 31); }
  }
  ctx.font = '11px ui-monospace,monospace';
}
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// the in-canvas market picker and fly controls
function buttons(ctx, g, meta) {
  const { W, C, fade } = g, y = 128, items = [['prev', '‹', -150, 26], ['name', meta?.label ?? S.key ?? '', 0, 120], ['next', '›', 150, 26], ['pause', S.paused ? '▶ FLY' : '❚❚ PAUSE', 260, 92]];
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 12px ui-monospace,monospace';
  for (const [k, label, dx, w] of items) {
    const x = W / 2 + dx; ctx.globalAlpha = fade * 0.8; ctx.fillStyle = S.bg || 'black'; ctx.fillRect(x - w / 2, y - 13, w, 26); ctx.strokeStyle = C.blue; ctx.globalAlpha = fade * (k === 'name' ? 0.4 : 0.9); ctx.lineWidth = 1; ctx.strokeRect(x - w / 2, y - 13, w, 26);
    ctx.fillStyle = k === 'name' ? C.blue : C.tx; ctx.globalAlpha = fade; ctx.fillText(label, x, y + 1); if (k !== 'name') g.hit('gm:' + k, x, y);
  }
  ctx.textBaseline = 'alphabetic';
}

function hud(ctx, g, L, meta, cz, n) {
  const { W, H, C, fade } = g; ctx.textAlign = 'left';
  const x0 = 18, y0 = H - 222;
  ctx.globalAlpha = fade * 0.74; ctx.fillStyle = S.bg || 'black'; ctx.fillRect(x0 - 10, y0 - 16, 470, 178);
  ctx.globalAlpha = fade * 0.95; ctx.fillStyle = C.blue; ctx.fillText(`GAMMA  ·  ${meta?.label ?? ''}  ·  THE STRIKE LADDER`, x0, y0);
  const rows = [['along', 'strikes, lowest near you to highest far away'], ['right bars', 'call open interest, rising (green)'], ['left bars', 'put open interest, hanging (red), same scale'], ['ribbon', 'net gamma implied by that open interest, by strike'], ['', 'cyan above the gamma flip, amber below it'], ['white ring', 'the gamma flip; white plane = spot price'], ['pylons', 'the biggest call and put strike']];
  rows.forEach(([a, b], i) => { ctx.globalAlpha = fade * 0.9; ctx.fillStyle = C.tx; ctx.fillText(a, x0, y0 + 16 + i * 14); ctx.fillStyle = C.tx2; ctx.fillText(b, x0 + 78, y0 + 16 + i * 14); });
  ctx.fillStyle = C.gold; ctx.globalAlpha = fade * 0.95; ctx.fillText('Where open interest sits and the gamma it implies: a description, not a forecast.', x0, y0 + 16 + rows.length * 14 + 8);
  // right: what the camera is passing, and the capture it is built from
  const i = clampN(Math.round(cz / DZ), 0, n - 1), xr = Math.max(18, W - 400); let y = 190;
  ctx.fillStyle = C.blue; ctx.globalAlpha = fade * 0.95; ctx.fillText(`AT STRIKE  ${fmtPx(L.strikes[i])}`, xr, y);
  ctx.fillStyle = C.tx; ctx.globalAlpha = fade * 0.9; ctx.fillText(`calls ${fmtOI(L.call[i])}   puts ${fmtOI(L.put[i])}   (this bin)`, xr, y + 16);
  ctx.fillStyle = C.tx2; ctx.fillText(`net gamma here ${L.net[i] >= 0 ? 'positive' : 'negative'} (${Math.round(Math.abs(L.net[i]) * 100)}% of the biggest bin)`, xr, y + 32);
  ctx.fillText(`spot ${fmtPx(L.spot)}${L.flip != null ? `  ·  flip ${fmtPx(L.flip)}` : ''}${L.dte != null ? `  ·  ${L.dte} DTE` : ''}`, xr, y + 48);
  ctx.fillText(`capture ${L.savedAt ?? 'n/a'}`, xr, y + 64);
  ctx.fillStyle = L.long == null ? C.tx2 : L.long ? C.cy : C.gold; ctx.fillText(L.long == null ? '' : `spot is ${L.long ? 'above' : 'below'} the flip: dealers net ${L.long ? 'long' : 'short'} gamma (modelled)`, xr, y + 80);
  smile(ctx, g, L, xr, y + 96, 220, 64, cz);
}

// the IV smile inset: implied volatility by strike for the main expiry, with spot and the camera's strike marked
function smile(ctx, g, L, x, y, w, h, cz) {
  const { C, fade } = g, P = L.ivPts; if (!P || P.length < 3) return; let lo = Infinity, hi = -Infinity; for (const p of P) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); } if (!(hi > lo)) return;
  const a0 = P[0][0], a1 = P[P.length - 1][0], X = s => x + (clampN(s, a0, a1) - a0) / (a1 - a0) * w, Y = v => y + h - (v - lo) / (hi - lo) * (h - 10) - 2;
  ctx.globalAlpha = fade * 0.72; ctx.fillStyle = S.bg || 'black'; ctx.fillRect(x - 6, y - 14, w + 12, h + 30); ctx.fillStyle = C.blue; ctx.globalAlpha = fade * 0.9; ctx.fillText('IV SMILE  ·  main expiry', x, y - 3);
  ctx.beginPath(); P.forEach((p, k) => (k ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.strokeStyle = C.cy; ctx.lineWidth = 1.5; ctx.globalAlpha = fade * 0.9; ctx.stroke();
  ctx.strokeStyle = C.tx; ctx.lineWidth = 1; ctx.globalAlpha = fade * 0.6; if (L.spot >= a0 && L.spot <= a1) { ctx.beginPath(); ctx.moveTo(X(L.spot), y); ctx.lineTo(X(L.spot), y + h); ctx.stroke(); }
  const cs = L.lo + (cz / DZ + 0.5) * L.w; if (cs >= a0 && cs <= a1) { ctx.strokeStyle = C.gold; ctx.globalAlpha = fade * 0.9; ctx.beginPath(); ctx.moveTo(X(cs), y); ctx.lineTo(X(cs), y + h); ctx.stroke(); }
  ctx.fillStyle = C.tx2; ctx.globalAlpha = fade * 0.85; ctx.fillText(`${(lo * 100).toFixed(1)}% to ${(hi * 100).toFixed(1)}%  ·  white = spot, amber = you`, x, y + h + 13);
}

registerJarvisModule({
  id: 'gamma', label: 'GAMMA',
  render(pane, api) {
    const opts = S.avail.map(m => `<option value="${api.esc(m.key)}"${m.key === S.key ? ' selected' : ''}>${api.esc(m.label)}</option>`).join('');
    pane.innerHTML = `<h3>GAMMA: A FLY-THROUGH ALONG THE STRIKES</h3><p>An amber dealer floor. The strikes of one market run away from you: call open interest rises in green on the right, put open interest hangs in red on the left, and a glowing ribbon through the middle traces the net gamma that open interest implies. A ring marks the gamma flip, a white plane the spot price, and tall pylons the biggest call and put strikes. The camera flies from the lowest strike to the highest. Drag to take the controls.</p><p class="jv-sub">Where open interest sits and the gamma it implies: a description, not a forecast.</p><div class="jv-row"><select data-g="mk" aria-label="Market">${opts}</select><button type="button" data-g="go">FLY THE STRIKES</button></div>`;
    const sel = pane.querySelector('[data-g="mk"]'); if (sel) sel.onchange = () => { S.key = sel.value; S.p = 0; };
    pane.querySelector('[data-g="go"]').onclick = () => { api.setView('gamma'); loadGamma(api, true); };
    loadGamma(api).then(() => { if (sel && !sel.options.length && S.avail.length) sel.innerHTML = S.avail.map(m => `<option value="${api.esc(m.key)}">${api.esc(m.label)}</option>`).join(''); }).catch(() => null);
  },
  views: [{
    id: 'gamma', label: 'GAMMA', env: { accent: 'gold', chrome: 'clean', scan: false }, draw,
    onEnter: api => {
      S.p = 0; S.showP = -1; S.touch = -99; S.paused = false; S.lastYaw = 0.35; S.lastPitch = -0.45; S.lastZoom = 1; S.spin = api.st.spin; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false });
      try { S.bg = api.win.getComputedStyle(api.doc.documentElement).getPropertyValue('--bg1').trim() || 'black'; } catch (e) { S.bg = 'black'; }
      loadGamma(api).then(() => { S.key = pickStart(api); }).catch(() => null);
    },
    onLeave: api => { S.showP = -1; if (S.spin != null) api.st.spin = S.spin; S.spin = null; },
  }],
});

await import('./jarvisViewBook.js').catch(() => null);   // so the 'book' scene is registered before this one asks to follow it
registerShowScene({
  id: 'gamma', after: 'book',
  prepare: api => loadGamma(api).then(() => { const k = pickStart(api); S.key = k; return { key: k }; }).catch(() => null),
  build: (inp, data) => {
    const key = data?.key ?? S.key, L = key && S.store ? ladderOf(key) : null, text = L ? gammaScript(L, key) : null; if (!text) return null;
    return { title: 'The option strikes', view: 'gamma', cam: null, text, enter: api => { S.key = key; S.paused = false; S.p = 0; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); }, motion: (api, p) => { S.showP = clampN(p, 0, 1); S.showAt = Date.now(); } };
  },
});
