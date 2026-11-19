// js/terminal/jarvisViewYields.js: Jarvis's YIELDS view: the US Treasury yield curve as a glowing 3D terrain through time. Canvas 2D with its own perspective; every array is allocated once and reused.
// x = maturity (3 month to 30 year, log scale), z = time (the last 120 sessions flow toward you, the newest curve is the bright front edge), height = yield.
// Surface colour = the 2s10s slope of that session: cool when normal, gold when flat, red when inverted. Optional ribbons beyond the 30Y edge: the real 10 year, the Bund and the gilt.
// DESCRIPTION ONLY: the shape of the curve through time, never a forecast. Also registers a SHOW scene and a small panel.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { TENORS, ROWS, T2, T10, T30, xOfYears, buildGrid, slopeBp, slopeMix, ribbonOn, curveStats, yieldsScript, dayWord, bpText } from './jarvisYieldsCore.js';

const NT = TENORS.length, NQ = ROWS * NT, TTL = 30 * 60_000, FOC = 4.2, WIDTH = 3.2, ZD = 2.3, YS = 1.25, YC = 0.5;
const PX = new Float32Array(NQ), PY = new Float32Array(NQ), PD = new Float32Array(NQ), MC = new Float32Array(ROWS), MG = new Float32Array(ROWS), MR = new Float32Array(ROWS);
const RIBS = [['real', 'REAL 10Y', 'up'], ['de', 'BUND 10Y', 'tx'], ['gb', 'GILT 10Y', 'cy']];
const S = { G: null, st: null, rib: { real: null, de: null, gb: null }, on: { real: true, de: false, gb: false }, status: 'loading', at: 0, p: null, busy: null, adv: 0 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), ease = p => p * p * (3 - 2 * p);
const DARK = `rgba(${[5, 9, 20].join(',')},0.9)`;
const O = { x: 0, y: 0, s: 1, d: 0 };                                                  // the last projected point (reused)
const CAM = { cx: 0, cy: 0, U: 1, cyw: 1, syw: 0, cp: 1, sp: 0, adv: 0 };

/** Load the curve (and the optional ribbons) once per 30 minutes. Never throws; S.status is 'loading' | 'ok' | 'fail'. */
export function loadYields(api, force) {
  if (S.busy) return S.busy; if (S.G && !force && Date.now() - S.at < TTL) return Promise.resolve(S.G);
  S.busy = (async () => {
    const ok = p => Promise.resolve(p).catch(() => null);
    const [ch, iy] = await Promise.all([ok(api.jf('/api/chapters')), ok(api.jf('/api/intl-yields'))]);
    const G = buildGrid(ch);
    if (G) { S.G = G; S.st = curveStats(G); S.at = Date.now(); S.status = 'ok'; prep(G, ch, iy); } else if (!S.G) S.status = 'fail';
    S.busy = null; return S.G;
  })();
  return S.busy;
}
function prep(G, ch, iy) {
  for (let j = 0; j < G.n; j++) { const m = slopeMix(slopeBp(G, j)); MC[j] = m.cool; MG[j] = m.gold; MR[j] = m.red; }
  S.rib.real = ribbonOn(G, ch?.series?.real10 ?? ch?.series?.tips); S.rib.de = ribbonOn(G, iy?.series?.de10y); S.rib.gb = ribbonOn(G, iy?.series?.gb10y);
}
const visRibs = () => RIBS.filter(([k]) => S.rib[k] && S.on[k]);

function axisRange(G) {
  let lo = 1e9, hi = -1e9; for (let i = 0; i < G.v.length; i++) { const v = G.v[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  for (const [k] of visRibs()) { const a = S.rib[k]; for (let j = 0; j < G.n; j++) if (a[j] === a[j]) { if (a[j] < lo) lo = a[j]; if (a[j] > hi) hi = a[j]; } }
  lo = Math.floor(lo * 4) / 4; hi = Math.ceil(hi * 4) / 4; return [lo, hi];
}
const proj = (x, y, z) => {
  const px = x, py = y - YC, x1 = px * CAM.cyw + z * CAM.syw, z1 = -px * CAM.syw + z * CAM.cyw, y2 = py * CAM.cp - z1 * CAM.sp, z2 = py * CAM.sp + z1 * CAM.cp - CAM.adv, s = FOC / Math.max(0.45, FOC + z2);
  O.x = CAM.cx + x1 * s * CAM.U; O.y = CAM.cy - y2 * s * CAM.U; O.s = s; O.d = z2; return O;
};
const msg = (ctx, g, text) => { ctx.save(); ctx.globalAlpha = g.fade; ctx.fillStyle = g.C.tx2; ctx.font = '13px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(text, g.W / 2, g.H / 2); ctx.restore(); };

function draw(ctx, g, api) {
  const st = api.st;
  if (st.sel && String(st.sel).startsWith('yl:')) { const k = String(st.sel).slice(3); if (k in S.on) { S.on[k] = !S.on[k]; api.blip?.(780, 0.05); } st.sel = null; }
  if (!S.G) { loadYields(api); return msg(ctx, g, S.status === 'fail' ? 'The Treasury yield history could not be loaded right now.' : 'Reading the yield curve...'); }
  if (Date.now() - S.at > TTL) loadYields(api);
  const G = S.G, n = G.n, T = NT, C = g.C, { W, H, t, fade } = g, [lo, hi] = axisRange(G), span = hi - lo;
  const calm = !!api.win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches, p = S.p, orbit = calm ? 0 : Math.sin(t * 0.13) * 0.34;
  const yaw = st.yaw + orbit + (p != null ? (p - 0.5) * 0.7 : 0), pitch = clamp(st.pitch, -1.1, -0.12) + (p != null ? 0.12 * Math.sin(p * Math.PI) : 0);
  S.adv += ((p != null ? ease(p) * 0.9 : 0) - S.adv) * Math.min(1, g.dt * 3);
  Object.assign(CAM, { cx: W * 0.5 - 10, cy: H * 0.46, U: Math.min(W / 6.8, H / 3.1) * (st.zoom || 1), cyw: Math.cos(yaw), syw: Math.sin(yaw), cp: Math.cos(pitch), sp: Math.sin(pitch), adv: S.adv });
  const xOf = i => (xOfYears(TENORS[i].years) - 0.5) * WIDTH, zOf = j => ZD / 2 - ZD * j / (n - 1), yOf = v => (v - lo) / span * YS;
  const x0 = -WIDTH / 2, x1 = WIDTH / 2, zN = zOf(n - 1), zO = zOf(0);
  for (let j = 0; j < n; j++) for (let i = 0; i < T; i++) { const k = j * T + i; proj(xOf(i), yOf(G.v[k]), zOf(j)); PX[k] = O.x; PY[k] = O.y; PD[k] = O.d; }
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.globalAlpha = fade;
  const line = (ax, ay, az, bx, by, bz, col, al, lw) => { proj(ax, ay, az); const sx = O.x, sy = O.y; proj(bx, by, bz); ctx.globalAlpha = al * fade; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(O.x, O.y); ctx.stroke(); };

  // floor grid, the back wall's yield lines and their labels
  for (let i = 0; i < T; i++) line(xOf(i), 0, zN, xOf(i), 0, zO, C.blue, 0.1, 1);
  for (let r = 0; r <= 6; r++) { const z = zN + (zO - zN) * r / 6; line(x0, 0, z, x1 + 0.1, 0, z, C.blue, 0.1, 1); }
  ctx.font = '10px ui-monospace,monospace'; ctx.textBaseline = 'middle';
  for (let v = Math.ceil(lo * 2) / 2; v <= hi + 1e-6; v += 0.5) { const y = yOf(v); line(x0, y, zO, x1, y, zO, C.blue, 0.1, 1); line(x0, y, zO, x0, y, zN, C.blue, 0.06, 1); proj(x0 - 0.04, y, zO); ctx.globalAlpha = 0.85 * fade; ctx.fillStyle = C.tx2; ctx.textAlign = 'right'; ctx.fillText(`${v.toFixed(1)}%`, O.x, O.y); }
  line(x0, 0, zO, x0, YS, zO, C.blue, 0.22, 1);

  // the surface, painted far to near: a dark glass quad, then the slope colours over it
  const near = PD[0] < PD[(n - 1) * T], jA = near ? n - 2 : 0, jB = near ? -1 : n - 1, step = near ? -1 : 1;
  for (let j = jA; j !== jB + (near ? 0 : 1); j += step) {
    if (j < 0 || j > n - 2) continue;
    const fd = 0.3 + 0.7 * ((j + 1) / (n - 1)), cool = MC[j + 1], gold = MG[j + 1], red = MR[j + 1];
    for (let i = 0; i < T - 1; i++) {
      const a = j * T + i, b = a + 1, c = a + T + 1, d = a + T, h = (G.v[a] + G.v[b] + G.v[c] + G.v[d]) * 0.25, hn = clamp((h - lo) / span, 0, 1), al = 0.46 * fd * (0.5 + 0.7 * hn);
      ctx.beginPath(); ctx.moveTo(PX[a], PY[a]); ctx.lineTo(PX[b], PY[b]); ctx.lineTo(PX[c], PY[c]); ctx.lineTo(PX[d], PY[d]); ctx.closePath();
      ctx.globalAlpha = fade * (0.55 + 0.4 * fd); ctx.fillStyle = DARK; ctx.fill();
      if (cool > 0.02) { ctx.globalAlpha = fade * al * cool; ctx.fillStyle = hn > 0.55 ? C.cy : C.blue; ctx.fill(); }
      if (gold > 0.02) { ctx.globalAlpha = fade * al * gold * 1.1; ctx.fillStyle = C.gold; ctx.fill(); }
      if (red > 0.02) { ctx.globalAlpha = fade * al * red * 1.25; ctx.fillStyle = C.dn; ctx.fill(); }
    }
  }
  // wireframe: a line along each maturity, and a curve every few sessions (coloured by that session's slope)
  ctx.lineWidth = 1;
  for (let i = 0; i < T; i++) { ctx.beginPath(); for (let j = 0; j < n; j++) { const k = j * T + i; j ? ctx.lineTo(PX[k], PY[k]) : ctx.moveTo(PX[k], PY[k]); } ctx.globalAlpha = 0.28 * fade; ctx.strokeStyle = C.blue; ctx.stroke(); }
  for (let j = n - 1; j >= 0; j -= 6) {
    ctx.beginPath(); for (let i = 0; i < T; i++) { const k = j * T + i; i ? ctx.lineTo(PX[k], PY[k]) : ctx.moveTo(PX[k], PY[k]); }
    ctx.strokeStyle = MR[j] > 0.5 ? C.dn : MG[j] > 0.5 ? C.gold : C.cy; ctx.globalAlpha = (0.14 + 0.4 * (j / (n - 1))) * fade; ctx.stroke();
  }

  // a scan line sweeps from the oldest session to the newest, lighting each curve as it passes (decoration; the row it is on is the one named in the corner)
  if (!calm) { const sj = Math.floor((t * 14) % (n + 20)); if (sj < n) { ctx.beginPath(); for (let i = 0; i < T; i++) { const k = sj * T + i; i ? ctx.lineTo(PX[k], PY[k]) : ctx.moveTo(PX[k], PY[k]); } ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = C.tx; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.55 * fade; ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '10px ui-monospace,monospace'; ctx.fillStyle = C.tx; ctx.fillText(`${dayWord(G.dates[sj])}  2s10s ${bpText(slopeBp(G, sj))}`, PX[sj * T + T - 1] + 10, PY[sj * T + T - 1]); } }
  // ribbons beyond the 30Y edge
  const rs = visRibs(); ctx.font = '10px ui-monospace,monospace';
  rs.forEach(([k, label, tone], r) => {
    const a = S.rib[k], xr = x1 + 0.3 + r * 0.22; let started = false;
    ctx.globalCompositeOperation = 'lighter'; ctx.beginPath(); ctx.strokeStyle = C[tone]; ctx.lineWidth = 2;
    for (let j = 0; j < n; j++) { if (a[j] !== a[j]) { started = false; continue; } proj(xr, yOf(a[j]), zOf(j)); started ? ctx.lineTo(O.x, O.y) : ctx.moveTo(O.x, O.y); started = true; }
    ctx.globalAlpha = 0.85 * fade; ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
    let last = n - 1; while (last > 0 && a[last] !== a[last]) last--; proj(xr, yOf(a[last]), zOf(last)); ctx.globalAlpha = fade; ctx.fillStyle = C[tone]; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`${label} ${a[last].toFixed(2)}`, O.x + 8, O.y);
  });

  // the newest curve: a curtain to the floor, a glowing spline, a dot and a label per tenor
  const f = (n - 1) * T; ctx.globalAlpha = 0.14 * fade; ctx.fillStyle = C.blue; ctx.beginPath(); ctx.moveTo(PX[f], PY[f]);
  for (let i = 1; i < T; i++) ctx.lineTo(PX[f + i], PY[f + i]); proj(xOf(T - 1), 0, zN); ctx.lineTo(O.x, O.y); proj(xOf(0), 0, zN); ctx.lineTo(O.x, O.y); ctx.closePath(); ctx.fill();
  const spline = () => { ctx.beginPath(); ctx.moveTo(PX[f], PY[f]); for (let i = 1; i < T - 1; i++) { const mx = (PX[f + i] + PX[f + i + 1]) / 2, my = (PY[f + i] + PY[f + i + 1]) / 2; ctx.quadraticCurveTo(PX[f + i], PY[f + i], mx, my); } ctx.lineTo(PX[f + T - 1], PY[f + T - 1]); };
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = C.cy; spline(); ctx.lineWidth = 9; ctx.globalAlpha = 0.14 * fade; ctx.stroke(); spline(); ctx.lineWidth = 2.6; ctx.globalAlpha = 0.95 * fade; ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
  ctx.textAlign = 'center'; const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
  for (let i = 0; i < T; i++) {
    const k = f + i, x = PX[k], y = PY[k], key = i === T2 || i === T10 || i === T30; proj(xOf(i), 0, zN);
    ctx.globalAlpha = 0.22 * fade; ctx.strokeStyle = C.cy; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(O.x, O.y); ctx.stroke();
    ctx.globalAlpha = fade; ctx.fillStyle = C.tx; ctx.beginPath(); ctx.arc(x, y, key ? 4.6 : 3.4, 0, 6.2832); ctx.fill();
    if (key) { ctx.globalAlpha = (0.3 + 0.3 * pulse) * fade; ctx.strokeStyle = C.cy; ctx.beginPath(); ctx.arc(x, y, 8 + 3 * pulse, 0, 6.2832); ctx.stroke(); }
    ctx.textBaseline = 'alphabetic'; ctx.font = '600 11px ui-monospace,monospace'; ctx.globalAlpha = fade; ctx.fillStyle = C.tx; ctx.fillText(G.v[k].toFixed(2), x, y - 16);
    ctx.font = '10px ui-monospace,monospace'; ctx.fillStyle = C.tx2; ctx.fillText(TENORS[i].label, x, y - 28);
    ctx.textBaseline = 'top'; ctx.fillText(TENORS[i].label, O.x, O.y + 4);
  }
  // time labels along the left edge
  ctx.textBaseline = 'middle'; ctx.textAlign = 'right'; ctx.font = '10px ui-monospace,monospace'; ctx.fillStyle = C.tx2;
  for (const j of [0, Math.round((n - 1) / 3), Math.round((n - 1) * 2 / 3), n - 1]) { proj(x0 - 0.12, 0, zOf(j)); ctx.globalAlpha = 0.85 * fade; ctx.fillText(dayWord(G.dates[j]), O.x, O.y + 12); }
  ctx.restore(); hud(ctx, g, api);
}

function hud(ctx, g, api) {
  const { W, H, C, fade } = g, G = S.G, st = S.st; ctx.save(); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const panel = (x, y, w, h) => { ctx.globalAlpha = 0.07 * fade; ctx.fillStyle = C.blue; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 0.35 * fade; ctx.strokeStyle = C.blue; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); };
  if (st) {
    const x = 24, y = 118, tone = st.inverted ? C.dn : st.flat ? C.gold : C.cy, word = st.inverted ? 'INVERTED' : st.flat ? 'ABOUT FLAT' : 'NORMAL';
    panel(x - 10, y - 18, 292, 176); ctx.globalAlpha = 0.9 * fade; ctx.fillStyle = C.tx2; ctx.font = '10px ui-monospace,monospace'; ctx.fillText(`US TREASURY CURVE  ·  as of ${dayWord(st.asOf)}`, x, y);
    ctx.fillStyle = tone; ctx.font = '600 22px ui-monospace,monospace'; ctx.globalAlpha = fade; ctx.fillText(`2s10s ${bpText(st.s)}`, x, y + 28); ctx.font = '600 11px ui-monospace,monospace'; ctx.fillText(word, x + 168, y + 27);
    ctx.font = '11px ui-monospace,monospace'; const rows = [['2Y', st.y2, st.d2], ['10Y', st.y10, st.d10], ['30Y', st.y30, st.d30]];
    rows.forEach(([a, v, d], i) => { const yy = y + 52 + i * 17; ctx.fillStyle = C.tx2; ctx.fillText(a, x, yy); ctx.fillStyle = C.tx; ctx.fillText(`${v.toFixed(2)}%`, x + 40, yy); ctx.fillStyle = d > 0 ? C.up : d < 0 ? C.dn : C.tx2; ctx.fillText(`${bpText(d)} over ${st.sessions} sessions`, x + 108, yy); });
    ctx.fillStyle = C.tx2; ctx.fillText(`2s10s was ${bpText(st.s0)}, now ${bpText(st.s)}  (${bpText(st.ds)})`, x, y + 112);
    ctx.fillText(`inverted on ${st.invDays} of ${st.n} sessions shown`, x, y + 129); ctx.fillText(`range ${bpText(st.sLo)} to ${bpText(st.sHi)}`, x, y + 146);
  }
  // legend: what each axis and colour encodes
  const lx = Math.max(24, W - 384), ly = 118; panel(lx - 10, ly - 18, 372, 196); ctx.font = '10px ui-monospace,monospace'; ctx.globalAlpha = 0.9 * fade; ctx.fillStyle = C.cy; ctx.fillText('HOW TO READ THIS  ·  shape of the curve through time', lx, ly);
  const L = [['left to right', 'maturity, 3 month to 30 year (log scale)'], ['toward you', `time: ${G ? G.n : ''} sessions, newest at the front`], ['height', 'yield in percent (lines every 0.5)'], ['bright line', 'the newest curve, one dot per maturity']];
  ctx.font = '11px ui-monospace,monospace'; L.forEach(([a, b], i) => { ctx.fillStyle = C.tx; ctx.globalAlpha = 0.9 * fade; ctx.fillText(a, lx, ly + 20 + i * 15); ctx.fillStyle = C.tx2; ctx.fillText('= ' + b, lx + 92, ly + 20 + i * 15); });
  [[C.cy, 'cool surface = 2s10s slope normal (40bp+)'], [C.gold, 'gold = flat, near zero'], [C.dn, 'red = inverted (10Y below 2Y)']].forEach(([c, tx], i) => { const yy = ly + 88 + i * 15; ctx.globalAlpha = 0.85 * fade; ctx.fillStyle = c; ctx.fillRect(lx, yy - 8, 10, 10); ctx.fillStyle = C.tx2; ctx.fillText(tx, lx + 18, yy); });
  ctx.fillStyle = C.tx2; ctx.globalAlpha = 0.75 * fade; ctx.fillText('Description of the curve, not a forecast.', lx, ly + 148); ctx.fillText('Drag to turn, scroll to zoom. Source: FRED, daily.', lx, ly + 163);
  // ribbon toggles
  let cx = 170; const cyy = H - 132;
  for (const [k, label, tone] of RIBS) {
    const have = !!S.rib[k], on = have && S.on[k]; ctx.globalAlpha = (have ? 0.9 : 0.35) * fade; ctx.strokeStyle = C[tone]; ctx.lineWidth = 1; ctx.strokeRect(cx + 0.5, cyy - 10.5, 100, 20);
    if (on) { ctx.globalAlpha = 0.25 * fade; ctx.fillStyle = C[tone]; ctx.fillRect(cx + 1, cyy - 10, 99, 19); }
    ctx.globalAlpha = (have ? 0.95 : 0.4) * fade; ctx.fillStyle = C.tx; ctx.textAlign = 'center'; ctx.font = '10px ui-monospace,monospace'; ctx.fillText(have ? label : `${label} n/a`, cx + 50, cyy + 3); if (have) g.hit(`yl:${k}`, cx + 50, cyy); cx += 110;
  }
  ctx.textAlign = 'right'; ctx.fillStyle = C.tx2; ctx.globalAlpha = 0.7 * fade; ctx.fillText('ribbons beyond 30Y:', 160, H - 129);
  ctx.restore();
}

registerJarvisModule({
  id: 'yields', label: 'YIELDS',
  render(pane, api) {
    pane.innerHTML = `<h3>YIELDS</h3><p>The US Treasury curve as a flowing 3D terrain. Maturity runs left to right, the last 120 sessions flow toward you and the height is the yield. The surface is coloured by the 2s10s slope of each session: cool when normal, gold when flat, red when inverted. The bright line is the newest curve.</p>
<div class="jv-row"><button type="button" data-y="go">▶ FLY OVER THE CURVE</button></div><p class="jv-sub">Real 10 year, Bund and gilt ribbons are optional. A description of the curve's shape, never a forecast.</p>`;
    pane.querySelector('[data-y="go"]').onclick = () => { api.setView('yields'); loadYields(api, true); };
  },
  views: [{
    id: 'yields', label: 'YIELDS', env: { accent: 'pur', chrome: 'clean', scan: false }, draw,
    onEnter: api => { Object.assign(api.st, { yaw: 0.05, pitch: -0.82, zoom: 1, spin: false }); S.p = null; S.adv = 0; loadYields(api); },
    onLeave: () => { S.p = null; S.adv = 0; },
  }],
});

registerShowScene({
  id: 'yields', after: 'chain',
  prepare: api => loadYields(api).then(() => S.st).catch(() => null),
  build: (inp, data) => {
    const text = data ? yieldsScript(data) : null; if (!text) return null;
    return { title: 'The yield curve', view: 'yields', cam: null, text, enter: api => { Object.assign(api.st, { yaw: 0.05, pitch: -0.82, zoom: 1, spin: false }); S.p = 0; }, motion: (api, p) => { S.p = p; } };
  },
});
