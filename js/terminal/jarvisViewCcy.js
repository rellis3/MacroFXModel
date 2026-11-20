// js/terminal/jarvisViewCcy.js: Jarvis's CURRENCIES view: the eight majors as a gold-and-black orrery. Each currency is a sphere on its own tilted ring around a glowing core.
// ENCODING (also drawn on screen): ring order and sphere size = today's strength (the average of its pair moves against their usual size; strongest = inner ring and biggest); colour = green up / red down;
// orbit speed is tied loosely to the size of the move, beyond that it is decoration; each luminous arc is one of the pairs that moved most today, its thickness = that pair's move against its usual,
// the pulse runs toward the stronger side. DESCRIPTION ONLY: how far each currency has travelled so far today, never a forecast. Canvas 2D with the HUD's own camera; arrays are allocated once.
import { marketName, currencyName, getNameStyle } from './jarvisNames.js';
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { CAP, ccyStrength, ccyScript, orbitPos, sizeOf, speedOf, signed } from './jarvisCcyCore.js';

const TAU = Math.PI * 2, NS = 90, SEG = 64, ARC = 18, NARC = 8;
const S = { R: null, at: 0, busy: null, err: false, ang: new Float32Array(8), px: new Float32Array(8), py: new Float32Array(8), ps: new Float32Array(8), pz: new Float32Array(8), pos: new Float32Array(24), tmp: new Array(3).fill(0), ready: false,
  dust: new Float32Array(NS * 3), dph: new Float32Array(NS), tx: new Float32Array(8), tz: new Float32Array(8), ax: new Float32Array(NARC), ay: new Float32Array(NARC), from: new Array(3).fill(0), to: new Array(3).fill(0) };
const lerp = (a, b, p) => a + (b - a) * p, ease = p => p * p * (3 - 2 * p);

function init() {
  if (S.ready) return; S.ready = true;
  for (let i = 0; i < 8; i++) S.ang[i] = i * 2.3;
  for (let i = 0; i < NS; i++) { const u = Math.random() * 2 - 1, a = Math.random() * TAU, r = 3 + Math.random() * 1.5, q = Math.sqrt(1 - u * u); S.dust[i * 3] = r * q * Math.cos(a); S.dust[i * 3 + 1] = r * u * 0.6; S.dust[i * 3 + 2] = r * q * Math.sin(a); S.dph[i] = Math.random() * TAU; }
}

/** Load today's moves and score the eight currencies. Cached for five minutes; a failed feed is a null result, never a throw. */
export function loadCcy(api, force = false) {
  if (!force && S.R && Date.now() - S.at < 300000) return Promise.resolve(S.R);
  if (S.busy) return S.busy;
  S.busy = (async () => {
    let v = null; try { v = await api.jf('/api/vol-forecast/live'); } catch (e) { /* null below */ }
    S.R = ccyStrength(v?.instruments); S.err = !S.R; S.at = Date.now(); return S.R;
  })().finally(() => { S.busy = null; });
  return S.busy;
}

function draw(ctx, g, api) {
  init();
  const { C, fade, W, H, t } = g, st = api.st, R = S.R, dt = Math.min(0.05, g.dt || 0.016);
  ctx.save(); ctx.globalAlpha = fade; ctx.textAlign = 'center'; ctx.font = '13px ui-monospace,monospace'; ctx.fillStyle = C.tx2;
  if (!R) { ctx.fillText(S.busy || !S.at ? 'Reading the currency moves...' : 'No currency strength for today yet', W / 2, H / 2); ctx.font = '11px ui-monospace,monospace'; if (!S.busy && S.at) ctx.fillText('The FX move feed is unavailable or too thin. Nothing is drawn rather than guessed.', W / 2, H / 2 + 22); ctx.restore(); return; }
  const P = (x, y, z) => g.proj([x, y, z]), by = {}; R.list.forEach((r, i) => { by[r.ccy] = i; });
  const hiS = R.list[0].s, loS = R.list[7].s, maxAbs = Math.max(Math.abs(hiS), Math.abs(loS)), sel = st.sel in by ? st.sel : null;
  const col = s => (Math.abs(s) < 0.12 ? C.tx2 : s > 0 ? C.up : C.dn);
  // the gyroscope: every ring leans its own way and precesses slowly
  for (let i = 0; i < 8; i++) { S.tx[i] = 0.32 + 0.22 * Math.sin(i * 1.9 + t * 0.07); S.tz[i] = (i % 2 ? 0.34 : -0.3) * Math.cos(i * 0.8 + t * 0.05); }
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = C.gold; for (let i = 0; i < NS; i++) { const p = P(S.dust[i * 3], S.dust[i * 3 + 1], S.dust[i * 3 + 2]); ctx.globalAlpha = fade * (0.12 + 0.1 * Math.sin(t * 0.8 + S.dph[i])) * Math.min(1, p.s); ctx.fillRect(p.x, p.y, 1.4, 1.4); }
  { const c = P(...S.tmp.fill(0)), pulse = 1 + 0.08 * Math.sin(t * 1.7), rr = g.SC * 0.16 * c.s * pulse, gr = ctx.createRadialGradient(c.x, c.y, 1, c.x, c.y, rr * 3.2);
    gr.addColorStop(0, C.gold); gr.addColorStop(0.3, C.gold); gr.addColorStop(1, 'transparent'); ctx.globalAlpha = fade * 0.55; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(c.x, c.y, rr * 3.2, 0, TAU); ctx.fill();
    ctx.globalAlpha = fade * 0.9; ctx.fillStyle = C.tx; ctx.beginPath(); ctx.arc(c.x, c.y, rr * 0.45, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.gold; ctx.lineWidth = 1.2; for (let k = 0; k < 3; k++) { ctx.globalAlpha = fade * (0.5 - k * 0.12); ctx.beginPath(); ctx.ellipse(c.x, c.y, rr * (1 + k * 0.45), rr * (1 + k * 0.45) * 0.38, t * 0.4 * (k % 2 ? -1 : 1) + k, 0, TAU); ctx.stroke(); } }
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const hot = sel === R.list[i].ccy; ctx.strokeStyle = hot ? C.tx : C.gold; ctx.globalAlpha = fade * (hot ? 0.55 : 0.2 - i * 0.012); ctx.beginPath();
    for (let k = 0; k <= SEG; k++) { orbitPos(i, (k / SEG) * TAU, S.tx[i], S.tz[i], S.tmp); const p = P(S.tmp[0], S.tmp[1], S.tmp[2]); if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
    ctx.stroke();
  }
  // the spheres' places: rank = ring, speed tied loosely to |strength|
  for (let i = 0; i < 8; i++) {
    const r = R.list[i]; S.ang[i] += dt * (0.07 + 0.32 * speedOf(r.s, maxAbs)) * (i % 2 ? -1 : 1);
    orbitPos(i, S.ang[i], S.tx[i], S.tz[i], S.tmp); S.pos[i * 3] = S.tmp[0]; S.pos[i * 3 + 1] = S.tmp[1]; S.pos[i * 3 + 2] = S.tmp[2];
    const p = P(S.tmp[0], S.tmp[1], S.tmp[2]); S.px[i] = p.x; S.py[i] = p.y; S.ps[i] = p.s; S.pz[i] = p.z;
  }
  const at = (c, k) => S.pos[by[c] * 3 + k];
  // the arcs: the biggest pair moves of the day
  const top = R.pairs.slice(0, NARC);
  top.forEach((pr, n) => {
    const w = Math.abs(pr.ratio) / CAP, hot = sel && (pr.base === sel || pr.quote === sel);
    ctx.globalAlpha = fade * (sel && !hot ? 0.22 : 0.35 + 0.55 * w);
    const x0 = at(pr.base, 0), y0 = at(pr.base, 1), z0 = at(pr.base, 2), x1 = at(pr.quote, 0), y1 = at(pr.quote, 1), z1 = at(pr.quote, 2), lift = 0.45 + 0.35 * w;
    const cxm = (x0 + x1) * 0.3, cym = (y0 + y1) * 0.3 + lift + n * 0.05, czm = (z0 + z1) * 0.3;
    ctx.strokeStyle = C.gold; ctx.lineWidth = 0.8 + 4.2 * w; ctx.beginPath();
    for (let k = 0; k <= ARC; k++) { const u = k / ARC, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c2 = u * u, p = P(a * x0 + b * cxm + c2 * x1, a * y0 + b * cym + c2 * y1, a * z0 + b * czm + c2 * z1); if (k === ARC >> 1) { S.ax[n] = p.x; S.ay[n] = p.y; } if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
    ctx.stroke();
    // a pulse runs toward the stronger side of the pair
    const f = pr.ratio >= 0 ? pr.quote : pr.base, e = pr.ratio >= 0 ? pr.base : pr.quote;
    for (let q = 0; q < 2; q++) {
      const u = (t * (0.25 + 0.2 * w) + q * 0.5 + n * 0.13) % 1, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c2 = u * u, p = P(a * at(f, 0) + b * cxm + c2 * at(e, 0), a * at(f, 1) + b * cym + c2 * at(e, 1), a * at(f, 2) + b * czm + c2 * at(e, 2));
      ctx.globalAlpha = fade * 0.9; ctx.fillStyle = C.tx; ctx.beginPath(); ctx.arc(p.x, p.y, 1.5 + 2.2 * w, 0, TAU); ctx.fill();
    }
  });
  ctx.globalCompositeOperation = 'source-over';
  ctx.font = '10px ui-monospace,monospace'; ctx.textAlign = 'center';
  top.forEach((pr, n) => { if (n >= (g.compact ? 2 : 5)) return; ctx.globalAlpha = fade * 0.95; ctx.fillStyle = C.gold; ctx.fillText(`${marketName(pr.key, { short: true })}  ${pr.ratio >= 0 ? '+' : '-'}${Math.abs(pr.ratio).toFixed(1)}x`, S.ax[n], S.ay[n] - 8); });
  // spheres far to near
  const order = [0, 1, 2, 3, 4, 5, 6, 7].sort((a, b) => S.pz[b] - S.pz[a]);
  for (const i of order) {
    const r = R.list[i], c = col(r.s), sz = sizeOf(r.s, loS, hiS), rad = g.SC * Math.pow(S.ps[i], 0.45) * (0.07 + 0.09 * sz), x = S.px[i], y = S.py[i], hot = sel === r.ccy;
    ctx.globalCompositeOperation = 'lighter'; const h = ctx.createRadialGradient(x, y, rad * 0.5, x, y, rad * 2.8); h.addColorStop(0, c); h.addColorStop(1, 'transparent'); ctx.globalAlpha = fade * (hot ? 0.6 : 0.34); ctx.fillStyle = h; ctx.beginPath(); ctx.arc(x, y, rad * 2.8, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = fade * 0.88; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    const hl = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.4, 1, x - rad * 0.2, y - rad * 0.25, rad * 1.05); hl.addColorStop(0, C.tx); hl.addColorStop(1, 'transparent'); ctx.globalAlpha = fade * 0.62; ctx.fillStyle = hl; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    ctx.globalAlpha = fade * (hot ? 1 : 0.7); ctx.strokeStyle = hot ? C.tx : C.gold; ctx.lineWidth = hot ? 2 : 1; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.stroke();
    ctx.globalAlpha = fade; ctx.fillStyle = C.tx; ctx.font = `${Math.round((g.compact ? 9 : 10) + (g.compact ? 3 : 5) * Math.min(1.4, S.ps[i]))}px ui-monospace,monospace`; ctx.textAlign = 'center'; ctx.fillText(currencyName(r.ccy, { short: true }), x, y - rad - 7); if (getNameStyle() === 'names' && !g.compact) { ctx.font = '9px ui-monospace,monospace'; ctx.globalAlpha = fade * 0.6; ctx.fillText(r.ccy, x, y - rad + 3); }
    if (!g.compact) { ctx.globalAlpha = fade * 0.8; ctx.fillStyle = c; ctx.font = '10px ui-monospace,monospace'; ctx.fillText(signed(r.s), x, y + rad + 13); }
    g.hit(r.ccy, x, y);
  }
  if (g.compact) { boardCompact(ctx, g, R, sel, col, maxAbs); ctx.restore(); return; }
  // the leaderboard, floating on the left
  const px = 24, py = 118, pw = 262, rh = 27, ph = 58 + 8 * rh;
  ctx.globalAlpha = fade * 0.55; ctx.fillStyle = 'black'; ctx.fillRect(px, py, pw, ph); ctx.globalAlpha = fade * 0.7; ctx.strokeStyle = C.gold; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, pw, ph);
  ctx.globalAlpha = fade * 0.9; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(px + 22, py); ctx.lineTo(px, py); ctx.lineTo(px, py + 22); ctx.stroke();
  ctx.textAlign = 'left'; ctx.fillStyle = C.gold; ctx.font = '12px ui-monospace,monospace'; ctx.fillText('CURRENCY STRENGTH', px + 14, py + 21); ctx.fillStyle = C.tx2; ctx.font = '10px ui-monospace,monospace'; ctx.fillText('avg pair move vs its usual move, so far today', px + 14, py + 37);
  const mid = px + 150, half = 60;
  R.list.forEach((r, i) => {
    const y = py + 50 + i * rh, c = col(r.s), hot = sel === r.ccy;
    if (hot) { ctx.globalAlpha = fade * 0.18; ctx.fillStyle = C.gold; ctx.fillRect(px + 4, y - 4, pw - 8, rh - 2); }
    ctx.globalAlpha = fade; ctx.fillStyle = C.tx2; ctx.font = '10px ui-monospace,monospace'; ctx.fillText(String(i + 1), px + 12, y + 12);
    ctx.fillStyle = C.tx; ctx.font = '13px ui-monospace,monospace'; ctx.fillText(currencyName(r.ccy, { short: true }), px + 28, y + 13); if (getNameStyle() === 'names') { const nw = ctx.measureText(currencyName(r.ccy, { short: true })).width; ctx.font = '9px ui-monospace,monospace'; ctx.fillStyle = C.tx2; ctx.fillText(r.ccy, px + 28 + nw + 6, y + 13); }
    const w = half * Math.min(1, Math.abs(r.s) / (maxAbs || 1)); ctx.globalAlpha = fade * 0.8; ctx.fillStyle = c; ctx.fillRect(r.s >= 0 ? mid : mid - w, y + 3, w, 11);
    ctx.globalAlpha = fade * 0.4; ctx.fillStyle = C.tx2; ctx.fillRect(mid, y, 1, 17);
    ctx.globalAlpha = fade; ctx.fillStyle = c; ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'right'; ctx.fillText(signed(r.s), px + pw - 10, y + 13); ctx.textAlign = 'left';
    g.hit(r.ccy, px + 60, y + 8);
  });
  if (sel) {
    const mine = R.pairs.filter(p => p.base === sel || p.quote === sel).slice(0, 5), y0 = py + ph + 18;
    ctx.globalAlpha = fade * 0.9; ctx.fillStyle = C.tx; ctx.font = '11px ui-monospace,monospace'; ctx.fillText(`${currencyName(sel, { short: true })}: its biggest pair moves`, px, y0); ctx.fillStyle = C.tx2; ctx.font = '10px ui-monospace,monospace';
    mine.forEach((p, i) => ctx.fillText(`${marketName(p.key)}  ${p.ratio >= 0 ? '+' : '-'}${Math.abs(p.ratio).toFixed(2)}x usual`, px, y0 + 16 + i * 14));
  }
  // legend
  ctx.textAlign = 'right'; ctx.fillStyle = C.tx2; ctx.font = '11px ui-monospace,monospace'; ctx.globalAlpha = fade * 0.85;
  const L = ['CURRENCIES  ·  the eight majors, so far today', 'RING + SIZE  ·  strength: strongest on the inner ring and biggest; weakest outermost and smallest', 'GREEN up  ·  RED down  ·  grey = barely moved', 'GOLD ARCS  ·  the eight pairs that moved most; thickness = move against usual; top five named; pulses run toward the stronger side',
    'ORBIT SPEED  ·  loosely tied to the size of the move, otherwise decoration', "Click a sphere or a row for its pairs. Scored from the desk's 28-pair move feed. A description, not a forecast."];
  L.forEach((s, i) => ctx.fillText(s, W - 24, H - 205 + i * 16));
  ctx.restore();
}

registerShowScene({
  id: 'ccy', after: 'candles',
  prepare: api => loadCcy(api),
  build(inp, R) {
    const text = ccyScript(R); if (!text) return null;
    const hi = R.list[0].ccy, lo = R.list[R.list.length - 1].ccy;
    return { title: 'The eight currencies', view: 'ccy', cam: null, text, motion: (api, p) => { api.st.spin = false; api.st.sel = p < 0.45 ? hi : p < 0.8 ? lo : null; api.st.yaw = lerp(0.2, 1.1, ease(p)); api.st.pitch = lerp(-0.5, -0.3, ease(p)); api.st.zoom = 1 + 0.15 * ease(p); } };
  },
});

registerJarvisModule({
  id: 'ccy', label: 'CURRENCIES',
  render(pane, api) {
    const { esc } = api; pane.innerHTML = '<h3>CURRENCIES</h3><p class="jv-sub">Reading the currency moves...</p>';
    loadCcy(api, true).then(R => {
      if (!R) { pane.innerHTML = '<h3>CURRENCIES</h3><p>No currency strength for today yet.</p>'; return; }
      pane.innerHTML = `<h3>THE EIGHT MAJORS</h3><p>Each currency scored as the average of its pair moves against their usual size, so far today. A description, not a forecast.</p>
<div class="jv-row"><button type="button" data-c="go">SHOW THE ORRERY</button></div>
<table class="jv-tab"><thead><tr><th>#</th><th>currency</th><th>strength</th></tr></thead><tbody>${R.list.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(currencyName(r.ccy))}${getNameStyle() === 'names' ? ` <span class="jv-sub">${esc(r.ccy)}</span>` : ''}</td><td>${esc(signed(r.s))}</td></tr>`).join('')}</tbody></table>`;
      pane.querySelector('[data-c="go"]').onclick = () => api.setView('ccy');
    });
  },
  views: [{ id: 'ccy', label: 'CURRENCIES', env: { accent: 'gold', chrome: 'clean', scan: false }, draw: (ctx, g, api) => draw(ctx, g, api), onEnter: api => { init(); api.st.spin = true; loadCcy(api, true); } }],
});

/** Phone: the leaderboard is a slim table below the orrery and the legend is one caveat line. */
function boardCompact(ctx, g, R, sel, col, maxAbs) {
  const { C, fade, W, H } = g, x0 = 14, rh = 18, y0 = H - 92 - 8 * rh - 6, mid = Math.round(W * 0.5), half = Math.min(70, W * 0.14);
  ctx.textAlign = 'left'; ctx.globalAlpha = fade * 0.9; ctx.fillStyle = C.gold; ctx.font = '11px ui-monospace,monospace'; ctx.fillText('CURRENCY STRENGTH, so far today', x0, y0 - 8);
  R.list.forEach((r, i) => {
    const y = y0 + i * rh, c = col(r.s), hot = sel === r.ccy;
    if (hot) { ctx.globalAlpha = fade * 0.18; ctx.fillStyle = C.gold; ctx.fillRect(x0 - 4, y - 2, W - 2 * x0 + 8, rh - 1); }
    ctx.globalAlpha = fade; ctx.fillStyle = C.tx; ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'left'; ctx.fillText(`${i + 1} ${currencyName(r.ccy, { short: true })}`, x0, y + 11);
    const w = half * Math.min(1, Math.abs(r.s) / (maxAbs || 1)); ctx.globalAlpha = fade * 0.8; ctx.fillStyle = c; ctx.fillRect(r.s >= 0 ? mid : mid - w, y + 2, w, 9);
    ctx.globalAlpha = fade * 0.4; ctx.fillStyle = C.tx2; ctx.fillRect(mid, y, 1, 13);
    ctx.globalAlpha = fade; ctx.fillStyle = c; ctx.textAlign = 'right'; ctx.fillText(signed(r.s), W - x0, y + 11); g.hit(r.ccy, x0 + 40, y + 8);
  });
  if (sel) { const m = R.pairs.filter(p => p.base === sel || p.quote === sel)[0]; if (m) { ctx.textAlign = 'left'; ctx.globalAlpha = fade * 0.9; ctx.fillStyle = C.tx; ctx.font = '10px ui-monospace,monospace'; ctx.fillText(`${currencyName(sel, { short: true })}: biggest pair ${marketName(m.key, { short: true })} ${m.ratio >= 0 ? '+' : '-'}${Math.abs(m.ratio).toFixed(1)}x usual`, x0, 100); } }
  ctx.textAlign = 'center'; ctx.globalAlpha = fade * 0.8; ctx.fillStyle = C.tx2; ctx.font = '10px ui-monospace,monospace';
  ctx.fillText('Size = strength (green up, red down). Past moves, not a forecast.', W / 2, H - 84);
}
