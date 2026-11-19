// js/terminal/jarvisViewSession.js: SESSION, the time-lapse. One market's price action as large glossy 3D candles on a perspective floor; they print in left to right (rising from the floor with a glow)
// in a loop of draw-in, hold, repeat. Behind the candles: the market's own usual high and low reach for the day (a translucent band, from the vol-forecast feed), and behind that a ghost of the previous
// session's closes. A bright marker rides the latest bar. Today's 15-minute bars come from /api/cog-chart/candles when the server can reach them; otherwise the last 60 daily bars (/api/ohlc), labelled daily.
// DESCRIPTION ONLY: every element is something that has happened. The view also registers a SHOW scene and a small panel with a market picker.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { MARKET_KEYS } from './jarvisMarkets.js';
import { intradayAsset, dailySymbol, pickMarket, splitSessions, dailyBars, usualBand, sessionStats, sessionScript, titleOf, buildScene, bodyCorners, FACES, loopState, rise, fmtPrice, BAND_Z, GHOST_Z } from './jarvisSessionCore.js';

const TTL = 60_000, F = 2.3;
const VOL = { at: 0, inst: null, p: null }, DATA = new Map(), S = { t0: 0, key: null, pan: 0, tag: '' };
const pts8 = Array.from({ length: 8 }, () => new Array(3).fill(0)), sp8 = Array.from({ length: 8 }, () => ({ x: 0, y: 0 }));
const ease = p => p * p * (3 - 2 * p), clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function loadVol(api) {
  if (VOL.inst && Date.now() - VOL.at < TTL) return Promise.resolve(VOL.inst);
  VOL.p ??= api.jf('/api/vol-forecast/live').then(j => { if (j?.instruments) { VOL.inst = j.instruments; VOL.at = Date.now(); } return VOL.inst; }).catch(() => VOL.inst).finally(() => { VOL.p = null; });
  return VOL.p;
}
/** Load (or refresh after a minute) one market's bars. Never throws; the entry carries status 'loading' | 'ok' | 'fail'. */
export function loadSession(key, api) {
  const e = DATA.get(key) ?? { status: 'loading', at: 0, p: null }; DATA.set(key, e);
  if (e.p || (e.status !== 'loading' && Date.now() - e.at < TTL)) return e.p ?? Promise.resolve(e);
  e.p = (async () => {
    const inst = await loadVol(api), v = inst?.[key] ?? null; let r = null;
    const asset = intradayAsset(key);
    if (asset) { try { const j = await api.jf(`/api/cog-chart/candles?asset=${asset}&tf=15m&count=300`); if (j?.ok && Array.isArray(j.candles)) { const s = splitSessions(j.candles); if (s) r = { mode: 'intraday', bars: s.bars, prev: s.prev, band: usualBand(v) }; } } catch (x) { /* fall back to daily */ } }
    if (!r) { const sym = dailySymbol(key); if (sym) { try { const j = await api.jf(`/api/ohlc?symbol=${sym}`); const b = dailyBars(j?.values); if (b.length >= 5) r = { mode: 'daily', bars: b, prev: [], band: null }; } catch (x) { /* no data */ } } }
    if (r) { const st = sessionStats(r.bars, v); Object.assign(e, r, { v, st, sc: buildScene(r.bars, r.prev, r.band), status: 'ok' }); } else if (e.status !== 'ok') e.status = 'fail';
    e.at = Date.now(); e.p = null; return e;
  })();
  return e.p;
}

const msg = (ctx, g, text) => { ctx.save(); ctx.globalAlpha = g.fade; ctx.fillStyle = g.C.tx2; ctx.font = '13px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(text, g.W / 2, g.H / 2); ctx.restore(); };

function draw(ctx, g, api) {
  const st = api.st, key = MARKET_KEYS.includes(st.sel) ? st.sel : pickMarket(null, VOL.inst ?? {});
  if (!VOL.inst || !key) { loadVol(api); return msg(ctx, g, VOL.inst ? 'No market to show right now.' : 'Reading the markets...'); }
  if (key !== S.key) { S.key = key; S.t0 = g.t; S.pan = 0; }
  const e = loadSession(key, api) && DATA.get(key);
  if (!e || e.status === 'loading') return msg(ctx, g, `Reading ${key} bars...`);
  if (e.status !== 'ok') return msg(ctx, g, `No price bars could be loaded for ${key} right now.`);
  const sc = e.sc, n = sc.n, C = g.C, { printed, phase, hold } = loopState(g.t - S.t0, n);
  const lead = Math.min(n - 1, Math.max(0, printed - 1)), leadX = (lead - (n - 1) / 2) * sc.dx;
  const sw = st.sessionSweep;
  const want = sw != null ? (sw - 0.5) * sc.W * 0.8 : phase === 'draw' ? leadX * 0.55 : leadX * 0.55 * (1 - ease(clamp(hold * 2.5, 0, 1)));
  S.pan += (want - S.pan) * Math.min(1, g.dt * 3.5);
  const cam = { yaw: st.yaw, pitch: st.pitch, zoom: st.zoom }, cyw = Math.cos(cam.yaw), syw = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), spp = Math.sin(cam.pitch), SC = g.SC * 1.12, H = sc.H, y0 = H * 0.42;
  const PJ = (x, y, z, o) => { const px = x - S.pan, py = y - y0, x1 = px * cyw + z * syw, z1 = -px * syw + z * cyw, y2 = py * cp - z1 * spp, z2 = py * spp + z1 * cp, s = (F / (F + z2)) * cam.zoom; o.x = g.cx - 30 + x1 * s * SC; o.y = g.cy + 50 - y2 * s * SC; o.s = s; o.z = z2; return o; };
  const q = { x: 0, y: 0, s: 1, z: 0 }, q2 = { x: 0, y: 0, s: 1, z: 0 }, xl = -sc.W / 2 - 0.12, xr = sc.W / 2 + 0.12, zf = -0.28, zb = GHOST_Z + 0.16;
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const seg = (a, b, col, al, lw) => { PJ(a[0], a[1], a[2], q); PJ(b[0], b[1], b[2], q2); ctx.globalAlpha = al * g.fade; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q2.x, q2.y); ctx.stroke(); };
  // the floor and the back wall: a grid; the wall carries the price lines
  for (let i = 0; i <= 18; i++) { const x = xl + (xr - xl) * i / 18; seg([x, 0, zf], [x, 0, zb], C.blue, 0.10, 1); }
  for (let i = 0; i <= 6; i++) { const z = zf + (zb - zf) * i / 6; seg([xl, 0, z], [xr, 0, z], C.blue, 0.10, 1); }
  ctx.font = '10px ui-monospace,monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const p of sc.ticks) { const y = sc.yOf(p); seg([xl, y, zb], [xr, y, zb], C.blue, 0.13, 1); PJ(xl - 0.02, y, zb, q); ctx.globalAlpha = 0.85 * g.fade; ctx.fillStyle = C.tx2; ctx.fillText(fmtPrice(p), q.x, q.y); }
  seg([xl, 0, zb], [xl, H, zb], C.blue, 0.2, 1);
  // the usual-range band: translucent glass slab behind the candles, with the day's open as a gold line
  if (sc.band) {
    const { yHi, yLo, yOpen } = sc.band, A = PJ(-sc.W / 2, yLo, BAND_Z, { x: 0, y: 0 }), B = PJ(sc.W / 2, yLo, BAND_Z, { x: 0, y: 0 }), Cc = PJ(sc.W / 2, yHi, BAND_Z, { x: 0, y: 0 }), D = PJ(-sc.W / 2, yHi, BAND_Z, { x: 0, y: 0 });
    ctx.globalAlpha = 0.13 * g.fade; ctx.fillStyle = C.blue; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(Cc.x, Cc.y); ctx.lineTo(D.x, D.y); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.55 * g.fade; ctx.strokeStyle = C.blue; ctx.lineWidth = 1.2; ctx.stroke();
    seg([-sc.W / 2, yOpen, BAND_Z], [sc.W / 2, yOpen, BAND_Z], C.gold, 0.7, 1.3);
    PJ(sc.W / 2, yHi, BAND_Z, q); ctx.textAlign = 'left'; ctx.globalAlpha = 0.8 * g.fade; ctx.fillStyle = C.blue; ctx.fillText(`usual high ${fmtPrice(e.band.hi)}`, q.x + 6, q.y);
    PJ(sc.W / 2, yLo, BAND_Z, q); ctx.fillText(`usual low ${fmtPrice(e.band.lo)}`, q.x + 6, q.y);
    PJ(sc.W / 2, yOpen, BAND_Z, q); ctx.fillStyle = C.gold; ctx.fillText(`open ${fmtPrice(e.band.open)}`, q.x + 6, q.y);
  }
  // the ghost: the previous session's closes as a faint curtain behind everything
  if (sc.ghost.length > 1) {
    ctx.beginPath(); sc.ghost.forEach((p, i) => { PJ(p.x, p.y, GHOST_Z, q); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
    const last = sc.ghost[sc.ghost.length - 1], first = sc.ghost[0]; PJ(last.x, 0, GHOST_Z, q); ctx.lineTo(q.x, q.y); PJ(first.x, 0, GHOST_Z, q); ctx.lineTo(q.x, q.y); ctx.closePath();
    ctx.globalAlpha = 0.07 * g.fade; ctx.fillStyle = C.tx; ctx.fill();
    ctx.beginPath(); sc.ghost.forEach((p, i) => { PJ(p.x, p.y, GHOST_Z, q); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.globalAlpha = 0.5 * g.fade; ctx.strokeStyle = C.tx2; ctx.lineWidth = 1.4; ctx.stroke();
  }
  // the candles, farthest first
  const w = sc.dx * 0.38, d = Math.min(0.05, sc.dx * 0.4), order = syw > 0 ? 1 : -1, pr = printed;
  ctx.globalCompositeOperation = 'source-over';
  for (let k = 0; k < n; k++) {
    const i = order > 0 ? k : n - 1 - k, gr = rise(i, pr); if (gr <= 0.002) continue;
    const b = sc.bars[i], col = b.up ? C.up : C.dn, aa = g.fade * (0.4 + 0.6 * gr);
    PJ(b.x, b.yL * gr, 0, q); PJ(b.x, b.yH * gr, 0, q2);                       // wick
    ctx.globalAlpha = aa * 0.9; ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q2.x, q2.y); ctx.stroke();
    bodyCorners(pts8, b.x, b.yO, b.yC, w, d, gr); for (let j = 0; j < 8; j++) PJ(pts8[j][0], pts8[j][1], pts8[j][2], sp8[j]);
    for (let f = 0; f < 4; f++) g.poly(FACES.sides[f], sp8, col, 0.42 * aa, col);
    g.poly(FACES.top, sp8, col, 0.8 * aa, col);
    if (gr > 0.5) { ctx.globalAlpha = 0.16 * aa; ctx.fillStyle = C.tx; ctx.beginPath(); const a = sp8[0], bb = sp8[1], c2 = sp8[5], d2 = sp8[4]; ctx.moveTo(a.x, a.y); ctx.lineTo(bb.x, bb.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(d2.x, d2.y); ctx.closePath(); ctx.fill(); }   // the gloss on the front face
    if (gr < 0.98) {                                                            // printing: a glow at the top and a beam to the floor
      const tx = (sp8[4].x + sp8[6].x) / 2, ty = (sp8[4].y + sp8[6].y) / 2, rad = 14 + 26 * (1 - gr);
      ctx.globalCompositeOperation = 'lighter'; const gd = ctx.createRadialGradient(tx, ty, 0, tx, ty, rad); gd.addColorStop(0, col); gd.addColorStop(1, 'transparent');
      ctx.globalAlpha = 0.65 * (1 - gr) * g.fade; ctx.fillStyle = gd; ctx.beginPath(); ctx.arc(tx, ty, rad, 0, 6.2832); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
      PJ(b.x, 0, 0, q); ctx.globalAlpha = 0.4 * (1 - gr) * g.fade; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(tx, ty); ctx.stroke();
    }
  }
  // the live marker rides the latest printed bar: a pulsing ring on the floor, a beam, and the price tag
  const li = Math.min(n - 1, Math.max(0, Math.floor(pr - 0.5))), mb = sc.bars[li], mg = rise(li, pr), my = mb.yC, pulse = 0.5 + 0.5 * Math.sin(g.t * 5);
  if (pr > 0.5) {
    PJ(mb.x, 0, 0, q); PJ(mb.x, my + 0.12, 0, q2);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (0.35 + 0.3 * pulse) * g.fade; ctx.strokeStyle = C.cy; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q2.x, q2.y); ctx.stroke();
    ctx.beginPath(); for (let i = 0; i <= 28; i++) { const a = i / 28 * 6.2832, r = 0.06 + 0.04 * pulse; PJ(mb.x + Math.cos(a) * r, 0, Math.sin(a) * r, q); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); } ctx.globalAlpha = 0.9 * g.fade; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    const px = e.bars[li].c, lbl = `${phase === 'hold' || li === n - 1 ? 'NOW ' : ''}${fmtPrice(px)}`; PJ(mb.x, my + 0.14, 0, q); ctx.font = '11px ui-monospace,monospace';
    const tw = ctx.measureText(lbl).width + 12; ctx.globalAlpha = 0.75 * g.fade; ctx.fillStyle = C.cy; ctx.fillRect(q.x - tw / 2, q.y - 22, tw, 17); ctx.globalAlpha = g.fade; ctx.fillStyle = C.tx; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lbl, q.x, q.y - 13);
  }
  // time labels along the front edge
  ctx.font = '10px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = C.tx2;
  const marks = Math.min(6, n), idxs = Array.from({ length: marks }, (_, m) => Math.round(m * (n - 1) / Math.max(1, marks - 1)));
  for (const i of idxs) { PJ(sc.bars[i].x, 0, zf - 0.03, q); ctx.globalAlpha = 0.8 * g.fade; ctx.fillText(timeLabel(e.bars[i].t, e.mode), q.x, q.y + 2); }
  ctx.restore();
  hud(ctx, g, e, key, phase, pr, n);
}
function timeLabel(t, mode) { const d = new Date(t * 1000); return mode === 'daily' ? `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}` : `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; }

function hud(ctx, g, e, key, phase, pr, n) {
  const C = g.C, st = e.st; ctx.save(); ctx.globalAlpha = g.fade; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = C.tx; ctx.font = '600 16px ui-monospace,monospace'; ctx.fillText(titleOf(key, e.mode), 28, 244);
  ctx.fillStyle = C.tx2; ctx.font = '11px ui-monospace,monospace';
  const line = `${n} bars · ${phase === 'draw' ? `printing ${Math.min(n, Math.floor(pr))} / ${n}` : 'complete'} · open ${fmtPrice(st.open)} · high ${fmtPrice(st.hi)} · low ${fmtPrice(st.lo)} · last ${fmtPrice(st.last)} (${st.movePct >= 0 ? '+' : ''}${st.movePct.toFixed(2)}%${st.times != null && e.mode === 'intraday' ? `, ${st.times.toFixed(1)}x its usual move` : ''})`;
  ctx.fillText(line, 28, 262);
  const items = [[C.up, 'closed up'], [C.dn, 'closed down'], [C.blue, e.band ? "the market's usual high / low reach today (median)" : null], [C.tx2, e.prev?.length ? "previous session's closes (ghost)" : null], [C.cy, 'latest bar (now)']].filter(x => x[1]);
  let y = g.H - 112 - items.length * 16; ctx.font = '11px ui-monospace,monospace';
  for (const [c, t] of items) { ctx.globalAlpha = 0.9 * g.fade; ctx.fillStyle = c; ctx.fillRect(28, y - 8, 10, 10); ctx.fillStyle = C.tx2; ctx.fillText(t, 46, y); y += 16; }
  ctx.restore();
}

const view = { id: 'session', label: 'SESSION', draw, onEnter(api) { Object.assign(api.st, { yaw: 0.22, pitch: -0.34, zoom: 1, spin: false }); S.t0 = -1e9; S.key = null; api.st.sessionSweep = null; if (MARKET_KEYS.includes(api.st.sel)) loadSession(api.st.sel, api); else loadVol(api); }, onLeave(api) { api.st.sessionSweep = null; api.st.spin = true; } };

// the SHOW scene: the biggest mover's session, measured facts only; the camera sweeps along the candles while it is described
registerShowScene({
  id: 'session', after: 'candles',
  async prepare(api) { const inst = await loadVol(api), key = pickMarket(null, inst ?? {}); if (!key) return null; const e = await loadSession(key, api); return e?.status === 'ok' ? { key, mode: e.mode, st: e.st } : null; },
  build(inp, data) {
    if (!data?.st) return null; const text = sessionScript(data.key, data.st, data.mode); if (!text) return null;
    return { title: 'The session', view: 'session', cam: null, text, enter(api) { api.st.sel = data.key; api.st.spin = false; S.t0 = -1e9; S.key = null; }, motion(api, p) { api.st.sessionSweep = p; } };
  },
});

registerJarvisModule({
  id: 'session', label: 'SESSION', views: [view],
  render(pane, api) {
    const { esc, st } = api, cur = MARKET_KEYS.includes(st.sel) ? st.sel : 'NQ';
    pane.innerHTML = `<h3>SESSION</h3><p>One market's session as 3D candles that print in like a time-lapse, with the market's usual range behind them and the previous session as a ghost. Pick a market, or click one in the CANDLES view.</p>
<div class="jv-row"><label class="jv-sub">market <select data-s="mk">${MARKET_KEYS.map(k => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(k)}</option>`).join('')}</select></label><button type="button" data-s="go">▶ DRAW THE SESSION</button></div>
<p class="jv-sub">Today's 15 minute bars where the server can reach them, otherwise the last 60 daily bars. Description only, never a forecast.</p>`;
    const go = () => { st.sel = pane.querySelector('[data-s="mk"]').value; api.setView('session'); };
    pane.querySelector('[data-s="go"]').onclick = go; pane.querySelector('[data-s="mk"]').onchange = go;
  },
});
