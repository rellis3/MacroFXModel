// js/terminal/jarvisViewVol.js: Jarvis's VOL view: a molten wireframe terrain you fly over. Across = the desk's markets grouped by asset class, along = time (the last ~60 completed sessions, oldest first, flying towards the newest),
// height and colour = how stretched that day's high-low range was against that market's own normal (the median of its previous 20 sessions' ranges; 1.0 = a normal day, clipped at 3). A white contour marks the 1.0 level.
// Canvas 2D with its own perspective; every typed array is allocated once and reused. DESCRIPTION ONLY: it shows what already happened, never a forecast. The maths lives in jarvisVolCore.js.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { VOL_GROUPS, VOL_MARKETS, CLIP, buildTerrain, dailyRanges, vixCurve, volScript } from './jarvisVolCore.js';

const MAXC = 64, MAXR = 64, SUB = 2, DX = 0.062, DZ = 0.085, HS = 0.12, AHEAD = 40, GAP_V = 0.22, LEVEL = 1;
const HT = new Float32Array(MAXC * MAXR), PX = new Float32Array(MAXC * MAXR), PY = new Float32Array(MAXC * MAXR), PZ = new Float32Array(MAXC * MAXR);
const colOf = new Int16Array(MAXC), colMk = new Int16Array(MAXC);        // grid column -> market index (-1 = a group gap) and the market's own column centre
const S = { data: null, busy: null, at: 0, ready: false, nc: 0, nr: 0, gx: [], showP: -1, showAt: 0, camY: 0.7, lastYaw: 0.35, lastPitch: -0.45, lastZoom: 1, touch: -99, spin: null, bg: null, built: null, p: 0 };
const tau = 6.2832, sm = u => u * u * (3 - 2 * u), clampN = (v, a, b) => Math.max(a, Math.min(b, v));

/** Load the daily ranges for every market plus the VIX curve, once per ten minutes; a failed feed leaves that market out and never throws. */
export async function loadVol(api, force) {
  if (S.busy) return S.busy; if (S.data && !force && Date.now() - S.at < 600000) return S.data;
  S.busy = (async () => {
    const ok = p => Promise.resolve(p).catch(() => null), now = new Date(), today = now.toISOString().slice(0, 10), from = new Date(now.getTime() - 135 * 864e5).toISOString().slice(0, 10), bars = {};
    const vp = ok(api.jf('/api/fredhistory?keys=vix,vix3m'));
    for (let k = 0; k < VOL_MARKETS.length; k += 7) {
      await Promise.all(VOL_MARKETS.slice(k, k + 7).map(async m => { const r = await ok(api.jf(`/api/ohlc-range?symbol=${m.oanda}&granularity=D&from=${from}&to=${today}`)); const d = dailyRanges(r, today); if (d.length) bars[m.key] = d; }));
    }
    let T = null; try { T = buildTerrain(bars); } catch (e) { T = null; }
    S.data = { T, V: vixCurve(await vp), got: Object.keys(bars).length }; S.at = Date.now(); S.busy = null; S.built = null; return S.data;
  })();
  return S.busy;
}

/** Turn the terrain into the drawing grid: market columns, a one-column ravine between asset classes, and SUB sub-columns per step (smoothstep between neighbours). Reuses HT. */
function buildGrid(T) {
  const cols = []; let last = null;
  T.markets.forEach((m, i) => { if (last != null && m.group !== last) cols.push(-1); cols.push(i); last = m.group; });
  const nc = Math.min(MAXC, (cols.length - 1) * SUB + 1), nr = Math.min(MAXR, T.ns); S.nc = nc; S.nr = nr; S.gx = [];
  const vAt = (c, j) => (cols[c] < 0 ? GAP_V : T.Z[j * T.nm + cols[c]]);
  for (let j = 0; j < nr; j++) for (let u = 0; u < nc; u++) { const c = Math.min(cols.length - 2, Math.floor(u / SUB)), f = sm((u - c * SUB) / SUB); HT[j * nc + u] = vAt(c, j) * (1 - f) + vAt(c + 1, j) * f; }
  for (let u = 0; u < nc; u++) { const c = Math.min(cols.length - 1, Math.round(u / SUB)); colOf[u] = cols[c]; }
  const rows = VOL_GROUPS.map(g => ({ id: g.id, label: g.label, a: 1e9, b: -1 })), byId = Object.fromEntries(rows.map(r => [r.id, r]));
  cols.forEach((c, k) => { if (c >= 0) { const r = byId[T.markets[c].group], u = k * SUB; r.a = Math.min(r.a, u); r.b = Math.max(r.b, u); } });
  S.gx = rows.filter(r => r.b >= 0); S.cols = cols; S.built = T;
}
const worldX = u => (u - (S.nc - 1) / 2) * DX, worldZ = j => j * DZ;

// colour stops for the height ramp: a cool valley, a neutral normal, then gold, red and white-hot. Two theme colours are layered with weights (no colour maths on strings).
const STOPS = [0, 0.85, 1.0, 1.5, 2.2, CLIP], NAMES = ['cy', 'cy', 'tx2', 'gold', 'dn', 'tx'];
let rA = 'cy', rB = 'cy', rF = 0;
function ramp(v) { let k = 0; while (k < STOPS.length - 2 && v > STOPS[k + 1]) k++; rA = NAMES[k]; rB = NAMES[k + 1]; rF = clampN((v - STOPS[k]) / (STOPS[k + 1] - STOPS[k]), 0, 1); }
const calmMotion = api => !!api.win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
const fmtD = iso => { const d = new Date(iso + 'T00:00:00Z'); return d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]; };

function draw(ctx, g, api) {
  const { W, H, C, t, fade } = g, dt = Math.min(0.05, g.dt || 0.016), calm = calmMotion(api), st = api.st, D = S.data, T = D?.T;
  ctx.save(); ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'center';
  if (!D) { ctx.globalAlpha = fade; ctx.fillStyle = C.tx2; ctx.fillText('Surveying the volatility terrain...', W / 2, H / 2); ctx.restore(); return; }
  if (!T) { ctx.globalAlpha = fade; ctx.fillStyle = C.tx2; ctx.fillText('The daily range feeds are not available right now, so there is no terrain to draw.', W / 2, H / 2); ctx.restore(); return; }
  if (S.built !== T) buildGrid(T);
  const nc = S.nc, nr = S.nr;
  // the user takes over: any change to yaw / pitch / zoom that is not ours pauses the auto-fly for a few seconds
  if (st.yaw !== S.lastYaw || st.pitch !== S.lastPitch || st.zoom !== S.lastZoom || st.drag) { S.touch = t; S.lastYaw = st.yaw; S.lastPitch = st.pitch; S.lastZoom = st.zoom; }
  const held = t - S.touch < 6, show = S.showP >= 0 && Date.now() - S.showAt < 1500;
  if (show) S.p = S.showP; else if (!held) { S.p += dt * (calm ? 0.004 : 0.0125); if (S.p > 1) S.p = 0; }
  const zEnd = worldZ(nr - 1) - 0.9, cz = -0.45 + S.p * (zEnd + 0.45), jc = clampN(Math.floor(cz / DZ), 0, nr - 2), sway = calm ? 0.2 : 1;
  const camX = Math.sin(t * 0.11 + 0.6) * nc * DX * 0.28 * sway, roll = -Math.cos(t * 0.11 + 0.6) * 0.16 * sway;
  const gu = clampN(Math.round(camX / DX + (nc - 1) / 2), 0, nc - 1), gj = clampN(Math.round(cz / DZ), 0, nr - 1), ground = HT[gj * nc + gu] * HS;
  S.camY += (Math.max(ground + 0.36, 0.5) + Math.sin(t * 0.37) * 0.05 - S.camY) * Math.min(1, dt * 1.6);
  const yw = clampN((st.yaw - 0.35) * 0.7, -0.9, 0.9) + Math.sin(t * 0.07) * 0.06 * sway, pt = clampN(0.3 + (st.pitch + 0.45) * 0.6, -0.15, 1.1), F = Math.min(W * 0.62, H * 0.95) * (st.zoom || 1);
  const cyw = Math.cos(yw), syw = Math.sin(yw), cpt = Math.cos(pt), spt = Math.sin(pt), cr = Math.cos(roll), sr = Math.sin(roll), ox = W / 2, oy = H * 0.46;
  const j0 = Math.max(0, jc - 1), j1 = Math.min(nr - 1, jc + AHEAD);
  // project the visible grid once
  for (let j = j0; j <= j1; j++) for (let u = 0; u < nc; u++) {
    const k = j * nc + u, dx = worldX(u) - camX, dy = HT[k] * HS - S.camY, dz = worldZ(j) - cz, x1 = dx * cyw - dz * syw, z1 = dx * syw + dz * cyw, y2 = dy * cpt + z1 * spt, z2 = z1 * cpt - dy * spt;
    PZ[k] = z2; if (z2 < 0.22) { PX[k] = PY[k] = 0; continue; }
    const sx = x1 / z2 * F, sy = -y2 / z2 * F; PX[k] = ox + sx * cr - sy * sr; PY[k] = oy + sx * sr + sy * cr;
  }
  ctx.globalAlpha = fade;
  // the molten sky glow at the horizon (the accent colour), under everything
  const hz = ctx.createLinearGradient(0, H * 0.18, 0, H * 0.62); hz.addColorStop(0, 'transparent'); hz.addColorStop(1, C.blue); ctx.globalAlpha = fade * 0.13; ctx.fillStyle = hz; ctx.fillRect(0, H * 0.18, W, H * 0.44);
  ctx.lineJoin = 'round'; ctx.lineWidth = 0.9;
  const swr = (t * (calm ? 1.2 : 3.4)) % (nr + 8) - 2;                            // the sweep: a bright line travelling along time
  for (let j = j1 - 1; j >= j0; j--) {
    const dep = Math.min(1, Math.max(0, 1 - (j - jc) / AHEAD)), rowA = fade * Math.min(1, dep * 1.6) * (j < jc + 1 ? 0.5 : 1);
    for (let u = 0; u < nc - 1; u++) {
      const a = j * nc + u, b = a + 1, c = a + nc + 1, d = a + nc;
      if (PZ[a] < 0.22 || PZ[b] < 0.22 || PZ[c] < 0.22 || PZ[d] < 0.22) continue;
      const v = (HT[a] + HT[b] + HT[c] + HT[d]) / 4; ramp(v);
      ctx.beginPath(); ctx.moveTo(PX[a], PY[a]); ctx.lineTo(PX[b], PY[b]); ctx.lineTo(PX[c], PY[c]); ctx.lineTo(PX[d], PY[d]); ctx.closePath();
      ctx.globalAlpha = rowA; ctx.fillStyle = S.bg || 'black'; ctx.fill();
      const lit = 0.1 + 0.55 * clampN((v - 0.5) / 1.8, 0, 1), sw = Math.exp(-Math.abs(j - swr) * 0.9);
      ctx.fillStyle = C[rA]; ctx.globalAlpha = rowA * lit * (1 - rF) * (1 + sw * 1.4); ctx.fill(); ctx.fillStyle = C[rB]; ctx.globalAlpha = rowA * lit * rF * (1 + sw * 1.4); ctx.fill();
      ctx.strokeStyle = C[rF > 0.5 ? rB : rA]; ctx.globalAlpha = rowA * (0.28 + 0.6 * clampN((v - 0.6) / 1.6, 0, 1) + sw * 0.4); ctx.stroke();
    }
  }
  // the 1.0 contour: where a day was exactly as wide as that market's normal (marching squares over the visible cells), drawn as a glowing line
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = C.tx; ctx.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.lineWidth = pass ? 1.3 : 4.5; ctx.beginPath();
    for (let j = j0; j < j1; j++) for (let u = 0; u < nc - 1; u++) {
      const a = j * nc + u, c4 = [a, a + 1, a + nc + 1, a + nc]; if (PZ[a] < 0.22 || PZ[a + 1] < 0.22 || PZ[a + nc] < 0.22 || PZ[a + nc + 1] < 0.22) continue;
      let n = 0, qx0 = 0, qy0 = 0, qx1 = 0, qy1 = 0, qx2 = 0, qy2 = 0, qx3 = 0, qy3 = 0;
      for (let e = 0; e < 4; e++) {
        const p = c4[e], q = c4[(e + 1) & 3], hp = HT[p] - LEVEL, hq = HT[q] - LEVEL; if ((hp > 0) === (hq > 0)) continue;
        const f = hp / (hp - hq), x = PX[p] + (PX[q] - PX[p]) * f, y = PY[p] + (PY[q] - PY[p]) * f;
        if (n === 0) { qx0 = x; qy0 = y; } else if (n === 1) { qx1 = x; qy1 = y; } else if (n === 2) { qx2 = x; qy2 = y; } else { qx3 = x; qy3 = y; } n++;
      }
      if (n >= 2) { ctx.moveTo(qx0, qy0); ctx.lineTo(qx1, qy1); } if (n === 4) { ctx.moveTo(qx2, qy2); ctx.lineTo(qx3, qy3); }
    }
    ctx.globalAlpha = fade * (pass ? 0.8 : 0.12); ctx.stroke();
  }
  // the sweep line itself: a hot line along the markets at the swept session, with its date
  const sj = Math.round(swr);
  if (sj >= j0 && sj <= j1) {
    ctx.beginPath(); let started = false, ex = 0, ey = 0;
    for (let u = 0; u < nc; u++) { const k = sj * nc + u; if (PZ[k] < 0.22) { started = false; continue; } if (started) ctx.lineTo(PX[k], PY[k]); else { ctx.moveTo(PX[k], PY[k]); started = true; } ex = PX[k]; ey = PY[k]; }
    ctx.strokeStyle = C.gold; ctx.lineWidth = 6; ctx.globalAlpha = fade * 0.18; ctx.stroke(); ctx.lineWidth = 1.5; ctx.globalAlpha = fade * 0.95; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = C.gold; ctx.textAlign = 'left'; ctx.globalAlpha = fade * 0.9; if (ex > 0) ctx.fillText(fmtD(T.dates[sj]), Math.min(W - 60, ex + 8), ey);
  }
  ctx.globalCompositeOperation = 'source-over';
  // group names on the ground, ahead of the camera, and the newest edge
  ctx.textAlign = 'center'; const jl = Math.min(j1, jc + 6);
  for (const r of S.gx) {
    const u = (r.a + r.b) / 2, k = jl * nc + Math.round(u); if (PZ[k] < 0.4) continue;
    ctx.fillStyle = C.tx2; ctx.globalAlpha = fade * 0.75; ctx.fillText(r.label, PX[k], PY[k] + 14);
  }
  // peak labels: the biggest ridges in view, named with market and date
  ctx.textAlign = 'left'; let shown = 0;
  for (const p of T.peaks) {
    if (shown >= 5 || p.v < 1.6) break; const u = S.cols.indexOf(p.i) * SUB, j = p.j; if (u < 0 || j < j0 + 1 || j > j1) continue; const k = j * nc + u; if (PZ[k] < 0.5) continue;
    shown++; const x = PX[k], y = PY[k], tx = x + 14, ty = y - 26 - shown * 2;
    ctx.strokeStyle = C.tx; ctx.globalAlpha = fade * 0.6; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx - 3, ty + 3); ctx.stroke();
    ctx.fillStyle = C.tx; ctx.globalAlpha = fade; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, tau); ctx.fill();
    ctx.fillText(`${p.key}  ${fmtD(p.date)}  ${p.v >= CLIP - 0.005 ? '3.0x+' : p.v.toFixed(1) + 'x'}`, tx, ty);
  }
  drawLegend(ctx, g, T, D.V, sj);
  ctx.restore();
}

function drawLegend(ctx, g, T, V, sj) {
  const { W, H, C, fade } = g; ctx.textAlign = 'left';
  const x0 = 18, y0 = H - 250, bw = 190;
  ctx.globalAlpha = fade * 0.72; ctx.fillStyle = S.bg || 'black'; ctx.fillRect(x0 - 10, y0 - 16, 440, 172); ctx.globalAlpha = fade * 0.95; ctx.fillStyle = C.blue; ctx.fillText('VOL  ·  RANGE USED', x0, y0);
  const rows = [
    ['across', 'markets, grouped by asset class'],
    ['along', `time: last ${T.ns} sessions, oldest to newest`],
    ['height', "day's range / that market's own normal"],
    ['', '(median of its previous 20 days); 1.0 = normal, cut at 3'],
    ['white line', 'the 1.0 level: a normal day'],
    ['gold line', 'the sweep, moving along time'],
  ];
  ctx.fillStyle = C.tx2; rows.forEach(([a, b], i) => { ctx.globalAlpha = fade * 0.9; ctx.fillStyle = C.tx; ctx.fillText(a, x0, y0 + 16 + i * 14); ctx.fillStyle = C.tx2; ctx.fillText(b, x0 + 70, y0 + 16 + i * 14); });
  // the colour bar: cool = a quiet day, grey = normal, gold to red = stretched, white = three times or more
  const by = y0 + 16 + rows.length * 14 + 4; for (let i = 0; i < bw; i++) { ramp(i / (bw - 1) * CLIP); ctx.fillStyle = C[rA]; ctx.globalAlpha = fade * (1 - rF) * 0.85; ctx.fillRect(x0 + i, by, 1, 7); ctx.fillStyle = C[rB]; ctx.globalAlpha = fade * rF * 0.85; ctx.fillRect(x0 + i, by, 1, 7); }
  ctx.fillStyle = C.tx2; ctx.globalAlpha = fade * 0.9; ctx.fillText('0x', x0, by + 19); ctx.textAlign = 'center'; ctx.fillText('1x normal', x0 + bw / 3 + 12, by + 19); ctx.textAlign = 'right'; ctx.fillText('3x+', x0 + bw + 2, by + 19);
  ctx.textAlign = 'left'; ctx.fillText('A description of what already happened, not a forecast.', x0, by + 34);
  // right: the latest session, the swept session and the VIX curve
  const xr = Math.max(18, W - 300); let y = 150; ctx.fillStyle = C.blue; ctx.globalAlpha = fade * 0.95; ctx.fillText(`LATEST SESSION  ${fmtD(T.dates[T.ns - 1])}`, xr, y);
  ctx.fillStyle = C.tx; ctx.globalAlpha = fade * 0.9; ctx.fillText(`${T.stretched} of ${T.nm} markets at 1.5x their normal or more`, xr, y + 16);
  T.latest.slice(0, 4).forEach((m, i) => { ctx.fillStyle = m.v >= 1.5 ? C.gold : C.tx2; ctx.fillText(`${m.key}  ${m.v.toFixed(2)}x`, xr + (i % 2) * 130, y + 32 + Math.floor(i / 2) * 14); });
  const sw = sj >= 0 && sj < T.ns ? T.dates[sj] : null;
  if (sw) { let bi = 0; for (let i = 1; i < T.nm; i++) if (T.Z[sj * T.nm + i] > T.Z[sj * T.nm + bi]) bi = i; ctx.fillStyle = C.gold; ctx.fillText(`SWEEP  ${fmtD(sw)}  top: ${T.markets[bi].key} ${T.Z[sj * T.nm + bi].toFixed(2)}x`, xr, y + 66); }
  ctx.fillStyle = C.tx2; ctx.fillText(V ? `VIX ${V.vix.toFixed(1)}${V.vix3m != null ? `  ·  VIX3M ${V.vix3m.toFixed(1)}  ·  curve ${V.inverted ? 'INVERTED' : 'upward'}` : ''}` : 'VIX curve: no feed', xr, y + 84);
}

registerJarvisModule({
  id: 'vol', label: 'VOL',
  render(pane, api) {
    pane.innerHTML = `<h3>VOLATILITY LANDSCAPE</h3><p>A terrain you fly over. Across are the desk's markets by asset class, along is time (the last 60 completed sessions), and the height is how stretched each day's range was against that market's own normal: 1.0 is a normal day, and a white contour marks it. Cool valleys are quiet days, gold to red ridges are stretched days. Drag to take the controls.</p><p class="jv-sub">It describes what already happened. It is never a forecast.</p><div class="jv-row"><button type="button" data-w="go">FLY THE TERRAIN</button></div>`;
    pane.querySelector('[data-w="go"]').onclick = () => { api.setView('vol'); loadVol(api, true); };
  },
  views: [{
    id: 'vol', label: 'VOL', env: { accent: 'dn', chrome: 'clean' }, draw,
    onEnter: api => {
      S.p = 0; S.showP = -1; S.touch = -99; S.lastYaw = 0.35; S.lastPitch = -0.45; S.lastZoom = 1; S.spin = api.st.spin; api.st.spin = false;
      try { S.bg = api.win.getComputedStyle(api.doc.documentElement).getPropertyValue('--bg1').trim() || 'black'; } catch (e) { S.bg = 'black'; }
      loadVol(api);
    },
    onLeave: api => { S.showP = -1; if (S.spin != null) api.st.spin = S.spin; S.spin = null; },
  }],
});

registerShowScene({
  id: 'vol', after: 'weather',
  prepare: api => loadVol(api),
  build: (inp, data) => { const text = data?.T ? volScript(data.T, data.V) : null; return text ? { title: 'The volatility landscape', view: 'vol', cam: { drift: true }, text, motion: (api, p) => { S.showP = clampN(p, 0, 1); S.showAt = Date.now(); } } : null; },
});
