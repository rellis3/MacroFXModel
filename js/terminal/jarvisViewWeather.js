// js/terminal/jarvisViewWeather.js: Jarvis's WEATHER view: today's measured stress and calm as weather over a stylised 3D sky. Canvas 2D with its own perspective; particle arrays are allocated once and reused.
// Every visual encodes ONE measured input (see weatherModel in jarvisWeatherCore.js, and the legend drawn on screen). Wind is gentle decoration and means nothing. DESCRIPTION ONLY: never a forecast.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { weatherModel, weatherScript } from './jarvisWeatherCore.js';

const NC = 230, NR = 340, NS = 70, NE = 40, BOLT = 12, TAU = Math.PI * 2;
const cx_ = new Float32Array(NC), cy_ = new Float32Array(NC), cz_ = new Float32Array(NC), cph = new Float32Array(NC), csz = new Float32Array(NC);
const rx = new Float32Array(NR), ry = new Float32Array(NR), rz = new Float32Array(NR), rv = new Float32Array(NR);
const sx_ = new Float32Array(NS), sy_ = new Float32Array(NS), sph = new Float32Array(NS);
const ex = new Float32Array(NE), ey = new Float32Array(NE), ez = new Float32Array(NE);
const bolt = new Float32Array((BOLT + 1) * 3);
const S = { data: null, busy: null, at: 0, flash: 0, bolt: 0, push: 0, sprites: new Map(), ready: false, last: 0 };
const rnd = (a, b) => a + Math.random() * (b - a);

function init() {
  if (S.ready) return; S.ready = true;
  for (let i = 0; i < NC; i++) { cx_[i] = rnd(-4.5, 4.5); cy_[i] = rnd(0.45, 1.7); cz_[i] = rnd(0.7, 6); cph[i] = rnd(0, TAU); csz[i] = rnd(0.35, 0.9); }
  for (let i = 0; i < NR; i++) { rx[i] = rnd(-4, 4); ry[i] = rnd(0, 1.5); rz[i] = rnd(0.7, 6); rv[i] = rnd(1.3, 2.1); }
  for (let i = 0; i < NS; i++) { sx_[i] = Math.random(); sy_[i] = Math.random(); sph[i] = rnd(0, TAU); }
  for (let i = 0; i < NE; i++) { ex[i] = rnd(-3.5, 3.5); ey[i] = rnd(0, 0.5); ez[i] = rnd(0.8, 5); }
}
const sprite = (api, col) => {                                  // a soft puff, drawn once per colour and reused
  let s = S.sprites.get(col); if (s) return s;
  const c = api.doc.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 1, 32, 32, 31);
  g.addColorStop(0, col); g.addColorStop(0.45, col); g.addColorStop(1, 'transparent'); x.globalAlpha = 0.5; x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  S.sprites.set(col, c); return c;
};

/** Load every feed the view needs, once per five minutes; a failed feed is null, never a throw. */
export async function loadWeather(api, force) {
  if (S.busy) return S.busy; if (S.data && !force && Date.now() - S.at < 300000) return S.data;
  S.busy = (async () => {
    const ok = p => Promise.resolve(p).catch(() => null);
    const [ws, hist, vl] = await Promise.all([ok(api.jf('/api/world-stress')), ok(api.jf('/api/fredhistory?keys=vix,vix3m,hy,sofr,iorb')), ok(api.jf('/api/vol-forecast/live'))]);
    S.data = { ws: ws?.ok ? ws : null, hist: hist && typeof hist === 'object' ? hist : null, vol: vl?.instruments ?? null }; S.at = Date.now(); S.busy = null; return S.data;
  })();
  return S.busy;
}
const modelOf = api => (S.data ? weatherModel({ ...S.data, broken: api.st.sum?.broken ?? null }) : null);
const calmMotion = api => !!api.win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

function draw(ctx, g, api) {
  init();
  const { W, H, C, t, fade } = g, dt = Math.min(0.05, g.dt || 0.016), calm = calmMotion(api), mv = calm ? 0.25 : 1, M = S.data ? modelOf(api) : null;
  ctx.save(); ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'left';
  if (!M) { ctx.globalAlpha = fade; ctx.fillStyle = C.tx2; ctx.textAlign = 'center'; ctx.fillText('Reading the weather...', W / 2, H / 2); ctx.restore(); return; }
  if (M.missing.length >= 4) { ctx.globalAlpha = fade; ctx.fillStyle = C.tx2; ctx.textAlign = 'center'; ctx.fillText('The weather feeds are not available right now: no stress lights, VIX, credit or market moves.', W / 2, H / 2); ctx.restore(); return; }
  const dn = M.density ?? 0, tb = M.turbulence ?? 0, rain = M.rain ?? 0, lit = M.lightning ?? 0, jag = M.jag ?? 0, au = M.aurora ?? 0, mist = M.mist ?? 0;
  const tone = M.tone === 'dn' ? C.dn : M.tone === 'gold' ? C.gold : C.blue, F = Math.min(W, H * 1.5) * 0.62 * (api.st.zoom || 1);
  const hy = H * (0.6 + (api.st.pitch + 0.45) * 0.25), camy = 0.3, yawx = (api.st.yaw - 0.35) * 2 + Math.sin(t * 0.05) * 0.2, vz = (0.05 + 0.5 * S.push) * mv, cx = W / 2;
  ctx.globalAlpha = fade;

  // stars: dimmed by cloud cover
  ctx.fillStyle = C.tx; for (let i = 0; i < NS; i++) { ctx.globalAlpha = fade * (1 - dn) * (0.25 + 0.35 * Math.sin(t * 0.9 * mv + sph[i])); ctx.fillRect(sx_[i] * W, sy_[i] * hy * 0.9, 1.4, 1.4); }
  // aurora = stress lights off: three drifting curtains
  if (au > 0.02) {
    ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 9;
    for (let b = 0; b < 3; b++) {
      ctx.strokeStyle = b === 1 ? C.cy : C.up; const base = hy * (0.22 + b * 0.13);
      for (let i = 0; i <= 52; i++) {
        const u = i / 52, x = u * W, y = base + Math.sin(u * 5 + t * 0.25 * mv + b * 2) * 22 + Math.sin(u * 11 - t * 0.4 * mv) * 8, len = 40 + 55 * Math.sin(u * 3.1 + b + t * 0.3 * mv) ** 2;
        ctx.globalAlpha = fade * au * 0.11 * (0.6 + 0.4 * Math.sin(u * 17 + t * 0.7 * mv + b)); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // ground: perspective grid under the sky; it scrolls with the camera
  ctx.lineWidth = 1; ctx.strokeStyle = C.blue;
  for (let k = 0; k < 14; k++) { const z = 0.5 + (((k * 0.5 - S.last * vz) % 7) + 7) % 7, y = hy + camy / z * F; if (y > H) continue; ctx.globalAlpha = fade * 0.16 * Math.min(1, (7 - z) / 3); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.globalAlpha = fade * 0.14; for (let i = -9; i <= 9; i++) { const x = i * 0.5 - yawx; ctx.beginPath(); ctx.moveTo(cx + x / 0.5 * F, hy + camy / 0.5 * F); ctx.lineTo(cx + x / 8 * F, hy + camy / 8 * F); ctx.stroke(); }
  // ridges: roughness = the VIX term structure (smooth when upward-sloping, jagged when inverted)
  for (let layer = 0; layer < 2; layer++) {
    const amp = layer ? 26 : 14, par = layer ? 1.2 : 0.5, off = yawx * par * 60; ctx.beginPath(); ctx.moveTo(0, hy);
    for (let x = 0; x <= W; x += 8) { const u = (x + off) / 90 + layer * 7, r = Math.sin(u) * 0.5 + Math.sin(u * 2.3 + 1) * 0.3 + Math.sin(u * 5.1) * (0.1 + 0.9 * jag) * 0.35 + Math.sin(u * 13.7) * Math.sin(u * 7.3) * jag * 0.5; ctx.lineTo(x, hy - amp * (0.3 + Math.abs(r)) * (0.6 + 0.8 * jag)); }
    ctx.lineTo(W, hy); ctx.closePath(); ctx.globalAlpha = fade * (layer ? 0.3 : 0.16); ctx.fillStyle = C.blue; ctx.fill(); ctx.globalAlpha = fade * 0.55; ctx.strokeStyle = layer ? C.cy : C.blue; ctx.stroke();
  }
  // mist on the ground = the dollar-funding light
  if (mist > 0) { const gr = ctx.createLinearGradient(0, hy - 50, 0, hy + 40); gr.addColorStop(0, 'transparent'); gr.addColorStop(0.55, C.gold); gr.addColorStop(1, 'transparent'); ctx.globalAlpha = fade * 0.2 * mist; ctx.fillStyle = gr; ctx.fillRect(0, hy - 50, W, 90); }
  // sparks on the ground = broken chain links
  if (M.embers) {
    ctx.fillStyle = C.dn;
    for (let i = 0; i < M.embers; i++) {
      ez[i] -= vz * dt; ey[i] += dt * 0.12 * mv; if (ez[i] < 0.7 || ey[i] > 0.55) { ez[i] = rnd(2, 5); ey[i] = 0; ex[i] = rnd(-3.5, 3.5); }
      const z = ez[i], x = cx + (ex[i] - yawx) / z * F, y = hy + (camy - ey[i]) / z * F; ctx.globalAlpha = fade * 0.9 * (1 - ey[i] * 1.6); ctx.fillRect(x, y, 2.2, 2.2);
    }
  }
  // clouds: cover = stress lights on, churn = VIX level, colour = the desk's overall level
  const spr = sprite(api, tone), n = Math.round(40 + 190 * dn);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    cz_[i] -= vz * dt; if (cz_[i] < 0.6) { cz_[i] = rnd(5, 6.2); cx_[i] = rnd(-4.5, 4.5); }
    cx_[i] += (0.015 + 0.05 * tb) * dt * mv; if (cx_[i] > 4.6) cx_[i] = -4.6;
    const z = cz_[i], wob = Math.sin(t * (0.3 + 1.1 * tb) * mv + cph[i]) * (0.04 + 0.22 * tb), wy = Math.cos(t * (0.25 + 0.9 * tb) * mv + cph[i] * 1.7) * (0.02 + 0.1 * tb);
    const x = cx + (cx_[i] + wob - yawx) / z * F, y = hy - (cy_[i] + wy - camy) / z * F, r = csz[i] * F / z * (1 + 0.25 * tb);
    ctx.globalAlpha = fade * Math.min(1, (z - 0.6) * 1.5) * Math.min(1, (6.2 - z) * 2) * (0.07 + 0.14 * dn); ctx.drawImage(spr, x - r, y - r * 0.6, r * 2, r * 1.2);
  }
  ctx.globalCompositeOperation = 'source-over';
  // rain = the credit light: strands fall from the cloud deck
  const nr = Math.round(NR * rain);
  if (nr) {
    ctx.strokeStyle = C.cy; ctx.lineWidth = 1; ctx.beginPath(); ctx.globalAlpha = fade * (0.18 + 0.25 * rain);
    for (let i = 0; i < nr; i++) {
      ry[i] -= rv[i] * dt * mv; rz[i] -= vz * dt; if (ry[i] < 0 || rz[i] < 0.7) { ry[i] = rnd(1, 1.6); rz[i] = rnd(0.9, 6); rx[i] = rnd(-4, 4); }
      const z = rz[i], x = cx + (rx[i] - yawx) / z * F, y = hy - (ry[i] - camy) / z * F; ctx.moveTo(x, y); ctx.lineTo(x - 2 / z, y - 16 / z);
    }
    ctx.stroke();
  }
  // lightning = the share of markets past their usual move: a bolt from the deck to the ground, then a quick fade
  if (lit > 0 && Math.random() < dt * lit * 1.1 * (calm ? 0.3 : 1)) {
    let x = rnd(-2.5, 2.5); const z = rnd(1.2, 4); for (let i = 0; i <= BOLT; i++) { bolt[i * 3] = x; bolt[i * 3 + 1] = 1.2 * (1 - i / BOLT); bolt[i * 3 + 2] = z; x += rnd(-0.14, 0.14); }
    S.bolt = 1; S.flash = calm ? 0.25 : 1; api.blip?.(110, 0.04);
  }
  if (S.bolt > 0.01) {
    ctx.beginPath(); for (let i = 0; i <= BOLT; i++) { const z = bolt[i * 3 + 2], x = cx + (bolt[i * 3] - yawx) / z * F, y = hy - (bolt[i * 3 + 1] - camy) / z * F; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.strokeStyle = C.tx; ctx.lineCap = 'round'; ctx.lineWidth = 6; ctx.globalAlpha = fade * S.bolt * 0.25; ctx.stroke(); ctx.lineWidth = 1.6; ctx.globalAlpha = fade * S.bolt; ctx.stroke(); S.bolt *= Math.exp(-dt * 7);
  }
  if (S.flash > 0.01) { ctx.globalAlpha = fade * S.flash * 0.1; ctx.fillStyle = C.tx; ctx.fillRect(0, 0, W, H); S.flash *= Math.exp(-dt * 9); }
  S.last += dt;

  // legend: what each visual encodes, with the measured number beside it (or "no feed" when a feed is missing)
  const L = M.L, rows = [
    ['cloud cover', `stress lights on${L ? `: ${L.on} of ${L.n}` : ': no feed'}`],
    ['churn', `VIX level${M.V ? `: ${M.V.vix.toFixed(1)}` : ': no feed'}`],
    ['rain', `credit light${M.K ? `: HY ${Math.round(M.K.hy)}bp` : ': no feed'}`],
    ['lightning', `markets past usual move${M.M ? `: ${M.M.past} of ${M.M.n}` : ': no feed'}`],
    ['ridge roughness', `VIX term${M.V?.ratio != null ? `: ${M.V.inverted ? 'inverted' : 'upward'}` : ': no feed'}`],
    ['aurora', 'stress lights off'], ['mist', `dollar-funding light${L?.funding != null ? '' : ': no feed'}`], ['sparks', `broken chain links${M.broken != null ? `: ${M.broken}` : ': chain not read'}`]];
  const x0 = Math.max(18, W - 380), y0 = 112; ctx.globalAlpha = fade * 0.9; ctx.fillStyle = C.cy; ctx.fillText('WEATHER  ·  what each thing means', x0, y0);
  rows.forEach(([a, b], i) => { ctx.fillStyle = C.tx; ctx.globalAlpha = fade * 0.9; ctx.fillText(a, x0, y0 + 18 + i * 15); ctx.fillStyle = C.tx2; ctx.fillText('= ' + b, x0 + 108, y0 + 18 + i * 15); });
  ctx.fillStyle = C.tx2; ctx.globalAlpha = fade * 0.7; ctx.fillText('A description of what is measured today,', x0, y0 + 24 + rows.length * 15); ctx.fillText('not a forecast. Wind is decoration.', x0, y0 + 38 + rows.length * 15);
  ctx.restore();
}

registerJarvisModule({
  id: 'weather', label: 'WEATHER',
  render(pane, api) {
    pane.innerHTML = `<h3>MARKET WEATHER</h3><p>Today's stress and calm as weather. Each thing in the sky is ONE measured number: cloud cover is how many of the desk's stress lights are on; churn is the VIX level; rain is the credit light; lightning is the share of markets already past their usual move today; ridge roughness is the VIX term structure; aurora shows when the lights are off; mist is the dollar-funding light; sparks are broken chain links.</p><p class="jv-sub">It describes what has been measured. It is never a forecast, and the wind means nothing.</p><div class="jv-row"><button type="button" data-w="go">OPEN THE SKY</button></div>`;
    pane.querySelector('[data-w="go"]').onclick = () => { api.setView('weather'); loadWeather(api, true); };
  },
  views: [{ id: 'weather', label: 'WEATHER', draw, onEnter: api => { S.push = 0; loadWeather(api); }, onLeave: () => { S.push = 0; } }],
});

registerShowScene({
  id: 'weather', after: 'lean',
  prepare: api => loadWeather(api),
  build: (inp, data) => { const m = data ? weatherModel({ ...data, broken: inp.chain?.broken ?? null }) : null, text = m ? weatherScript(m) : null; return text ? { title: "Today's weather", view: 'weather', cam: { drift: true }, text, motion: (api, p) => { S.push = p; } } : null; },
});
