// js/terminal/jarvisViewSession.js: CANDLES, the HUD's flagship chart (view id 'session'). A TradingView-style 3D candlestick chart redrawn as a workshop hologram: glossy 3D candle bodies on a perspective floor, a price scale on the right with a
// live last-price tag, a time axis along the bottom, a crosshair with a floating OHLC readout, timeframe buttons (5m 15m 1h daily), a market picker, EMA 20 / EMA 50 ribbons (averages of PAST closes, labelled), the market's own usual
// high / low reach for the day as a translucent band, and DEPTH: each earlier UTC day stacked behind as a translucent parallel plane, dated and faded by age, that the camera can fly back through (buttons, or a slow auto-dolly).
// Bars come from /api/cog-chart/candles (5m / 15m / 1h) and /api/ohlc (daily). DESCRIPTION ONLY: every element is something that has happened; nothing here is a forecast. Pure maths lives in jarvisChartCore.js / jarvisSessionCore.js.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { MARKET_KEYS } from './jarvisMarkets.js';
import { intradayAsset, dailySymbol, pickMarket, dailyBars, usualBand, sessionStats, sessionScript, bodyCorners, FACES, loopState, rise, fmtPrice, BAND_Z } from './jarvisSessionCore.js';
import { TFS, TF_COUNT, ema, groupPlanes, chartScale, priceTicks, priceDecimals, timeTicks, nearestIndex, priceAtY, barChange, planeAlpha, autoDolly, stepKey, fullTime, clamp } from './jarvisChartCore.js';

const TTL = 60_000, F = 2.3, PZ = 0.3, H = 1.5, TF_LABEL = { '5m': '5m', '15m': '15m', '1h': '1h', '1d': 'D' }, TF_WORD = { '5m': '5 minute', '15m': '15 minute', '1h': 'hourly', '1d': 'daily' };
const VOL = { at: 0, inst: null, p: null }, DATA = new Map();
const S = { key: null, tf: '15m', replay: false, auto: false, dolly: 0, dollyT: 0, t0: null, pan: 0, mx: null, my: null, top: 70, topAt: 0, xs: new Float32Array(300), off: null };
const pts8 = Array.from({ length: 8 }, () => new Array(3).fill(0)), sp8 = Array.from({ length: 8 }, () => ({ x: 0, y: 0 }));

function loadVol(api) {
  if (VOL.inst && Date.now() - VOL.at < TTL) return Promise.resolve(VOL.inst);
  VOL.p ??= api.jf('/api/vol-forecast/live').then(j => { if (j?.instruments) { VOL.inst = j.instruments; VOL.at = Date.now(); } return VOL.inst; }).catch(() => VOL.inst).finally(() => { VOL.p = null; });
  return VOL.p;
}
const finish = (e, r, v) => {
  const closes = r.bars.map(b => b.c), planes = groupPlanes(r.bars, r.tf);
  if (!planes) return false;
  const band = r.tf !== '1d' ? usualBand(v) : null, sc = chartScale(planes, 3, band ? [band.hi, band.lo] : []);
  Object.assign(e, { tf: r.tf, bars: r.bars, e20: ema(closes, 20), e50: ema(closes, 50), planes, band, sc, st: sessionStats(planes[0].bars, v), v, status: 'ok', note: r.note ?? '' });
  return true;
};
/** Load (or refresh after a minute) one market's bars for a timeframe. Never throws; the entry carries status 'loading' | 'ok' | 'fail'. */
export function loadChart(key, tf, api) {
  const id = `${key}|${tf}`, e = DATA.get(id) ?? { status: 'loading', at: 0, p: null }; DATA.set(id, e);
  if (e.p || (e.status !== 'loading' && Date.now() - e.at < TTL)) return e.p ?? Promise.resolve(e);
  e.p = (async () => {
    const inst = await loadVol(api), v = inst?.[key] ?? null; let ok = false;
    const asset = tf !== '1d' ? intradayAsset(key) : null;
    if (asset) { try { const j = await api.jf(`/api/cog-chart/candles?asset=${asset}&tf=${tf}&count=${TF_COUNT[tf]}`); if (j?.ok && Array.isArray(j.candles) && j.candles.length >= 4) ok = finish(e, { tf, bars: j.candles.map(c => ({ t: +c.t, o: +c.o, h: +c.h, l: +c.l, c: +c.c })).sort((a, b) => a.t - b.t) }, v); } catch (x) { /* fall back to daily */ } }
    if (!ok) { const sym = dailySymbol(key); if (sym) { try { const j = await api.jf(`/api/ohlc?symbol=${sym}`), b = dailyBars(j?.values, 200); if (b.length >= 5) ok = finish(e, { tf: '1d', bars: b, note: tf !== '1d' ? 'No intraday bars for this market right now, so daily bars are shown.' : '' }, v); } catch (x) { /* no data */ } } }
    if (!ok && e.status !== 'ok') e.status = 'fail';
    e.at = Date.now(); e.p = null; return e;
  })();
  return e.p;
}
const entryOf = (key, tf) => DATA.get(`${key}|${tf}`);

/** One command from the toolbar or the panel: tf:<id> mk:<KEY> mkp mkn replay auto back fwd. */
export function chartCommand(cmd, api) {
  const st = api.st, [c, arg] = String(cmd).split(':');
  if (c === 'tf' && TFS.includes(arg)) { S.tf = arg; S.t0 = null; S.dollyT = 0; S.dolly = 0; }
  else if (c === 'mk' && MARKET_KEYS.includes(arg)) { st.sel = arg; S.key = arg; S.t0 = null; S.dollyT = 0; S.dolly = 0; }
  else if (c === 'mkp' || c === 'mkn') { const k = stepKey(MARKET_KEYS, S.key, c === 'mkn' ? 1 : -1); if (k) { st.sel = k; S.key = k; S.t0 = null; S.dollyT = 0; S.dolly = 0; } }
  else if (c === 'replay') { S.replay = !S.replay; S.t0 = null; }
  else if (c === 'auto') S.auto = !S.auto;
  else if (c === 'back' || c === 'fwd') { S.auto = false; S.dollyT = Math.round(S.dollyT) + (c === 'back' ? 1 : -1); }
}

const FONT = '10px ui-monospace,monospace';
const msg = (ctx, g, text) => { ctx.save(); ctx.globalAlpha = g.fade; ctx.fillStyle = g.C.tx2; ctx.font = '13px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(text, g.W / 2, g.H / 2); ctx.restore(); };
const rr = (ctx, x, y, w, h) => { ctx.beginPath(); ctx.rect(x, y, w, h); };

/** The in-canvas toolbar: buttons that are drawn, highlighted under the pointer, and registered with g.hit so a click reaches chartCommand through st.sel. */
function toolbar(ctx, g, key) {
  const C = g.C; let x = 24; const y = S.top + 12, h = 26;
  const btn = (w, label, cmd, on) => {
    const hov = S.mx != null && S.mx >= x && S.mx <= x + w && S.my >= y && S.my <= y + h;
    rr(ctx, x, y, w, h); ctx.globalAlpha = (on ? 0.28 : hov ? 0.2 : 0.1) * g.fade; ctx.fillStyle = C.blue; ctx.fill(); ctx.globalAlpha = (on ? 0.95 : 0.45) * g.fade; ctx.strokeStyle = C.blue; ctx.lineWidth = on ? 1.5 : 1; ctx.stroke();
    ctx.globalAlpha = (on ? 1 : 0.85) * g.fade; ctx.fillStyle = on ? C.tx : C.tx2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    g.hit(`cx:${cmd}`, x + w / 2, y + h / 2); x += w + 6;
  };
  ctx.save(); ctx.font = '11px ui-monospace,monospace';
  btn(26, '‹', 'mkp', false); btn(86, key ?? '...', 'mkn', true); btn(26, '›', 'mkn', false); x += 12;
  for (const t of TFS) btn(t === '1d' ? 30 : 38, TF_LABEL[t], `tf:${t}`, S.tf === t); x += 12;
  btn(66, S.replay ? '■ REPLAY' : '▶ REPLAY', 'replay', S.replay); btn(60, S.auto ? '■ AUTO' : '▶ AUTO', 'auto', S.auto); x += 12;
  btn(26, '◀', 'back', false); btn(54, 'DAYS', 'back', false); btn(26, '▶', 'fwd', false);
  ctx.restore();
}

function draw(ctx, g, api) {
  const st = api.st, C = g.C;
  if (typeof st.sel === 'string' && st.sel.startsWith('cx:')) { const c = st.sel.slice(3); st.sel = MARKET_KEYS.includes(S.key) ? S.key : null; chartCommand(c, api); }   // a toolbar click arrives as st.sel
  else if (!MARKET_KEYS.includes(st.sel) && MARKET_KEYS.includes(S.key)) st.sel = S.key;                                                                                      // a click on empty canvas must not drop the market
  if (g.t - S.topAt > 1) { S.topAt = g.t; const v = parseFloat(api.win?.getComputedStyle?.(api.$('cv').parentElement).getPropertyValue('--jvtop')); if (v > 0) S.top = v; }
  const key = MARKET_KEYS.includes(st.sel) ? st.sel : (MARKET_KEYS.includes(S.key) ? S.key : pickMarket(null, VOL.inst ?? {}));
  if (!VOL.inst || !key) { loadVol(api); return msg(ctx, g, VOL.inst ? 'No market to show right now.' : 'Reading the markets...'); }
  if (key !== S.key) { S.key = key; S.t0 = null; S.dolly = S.dollyT = 0; }
  toolbar(ctx, g, key);
  const e = (loadChart(key, S.tf, api), entryOf(key, S.tf));
  if (!e || e.status === 'loading') return msg(ctx, g, `Reading ${key} bars...`);
  if (e.status !== 'ok') return msg(ctx, g, `No price bars could be loaded for ${key} right now.`);
  if (S.t0 == null) S.t0 = g.t;
  const planes = e.planes, np = planes.length, tf = e.tf, slots = planes[0].slots, dx = Math.min(0.09, 3.0 / slots), Wc = slots * dx, X = s => (s - (slots - 1) / 2) * dx;
  // camera: the dolly eases toward its target plane; auto-dolly ping-pongs through the days; the SHOW scene sweeps the pan
  if (S.auto) S.dollyT = autoDolly(g.t, np); S.dollyT = clamp(S.dollyT, 0, np - 1); S.dolly += (S.dollyT - S.dolly) * Math.min(1, g.dt * 3);
  const ka = clamp(Math.round(S.dolly), 0, np - 1), sw = st.sessionSweep, want = sw != null ? (sw - 0.5) * Wc * 0.5 : 0; S.pan += (want - S.pan) * Math.min(1, g.dt * 3.5);
  // the price scale follows the plane in focus (and today's usual-range band when that is today), easing as the camera flies
  { const id = `${key}|${tf}|${ka}`; if (S.scId !== id) { S.scId = id; S.scT = chartScale([planes[ka]], 1, ka === 0 && e.band ? [e.band.hi, e.band.lo] : []); if (S.lo == null || S.scKey !== `${key}|${tf}`) { S.lo = S.scT.lo; S.hi = S.scT.hi; } S.scKey = `${key}|${tf}`; }
    const k = Math.min(1, g.dt * 4); S.lo += (S.scT.lo - S.lo) * k; S.hi += (S.scT.hi - S.hi) * k; }
  const lo = S.lo, hi = S.hi, yOf = p => ((p - lo) / (hi - lo)) * H, yE = v => yOf(clamp(v, lo - (hi - lo) * 0.06, hi + (hi - lo) * 0.06));
  const front = planes[0], nf = front.bars.length, printed = S.replay ? loopState(g.t - S.t0, nf).printed : Math.min(nf + 3, ((g.t - S.t0) / 3.2) * (nf + 3));
  const cyw = Math.cos(st.yaw), syw = Math.sin(st.yaw), cp = Math.cos(st.pitch), spp = Math.sin(st.pitch), y0 = H * 0.42, zoom = st.zoom;
  const SC = Math.min(g.W * 0.78 / (Wc + 0.5), g.H * 0.58 / (H + 0.1)) * 0.96, ox = g.cx - 34, oy = g.cy + 58;
  const PJ = (x, y, z, o) => { const px = x - S.pan, py = y - y0, x1 = px * cyw + z * syw, z1 = -px * syw + z * cyw, y2 = py * cp - z1 * spp, z2 = py * spp + z1 * cp, s = (F / (F + z2)) * zoom; o.x = ox + x1 * s * SC; o.y = oy - y2 * s * SC; o.s = s; o.z = z2; return o; };
  const q = { x: 0, y: 0, s: 1, z: 0 }, q2 = { x: 0, y: 0, s: 1, z: 0 }, q3 = { x: 0, y: 0, s: 1, z: 0 }, q4 = { x: 0, y: 0, s: 1, z: 0 }, xl = -Wc / 2 - 0.1, xr = Wc / 2 + 0.1, zA = (ka - S.dolly) * PZ, zBack = (np - 1 - S.dolly) * PZ + 0.14;
  const seg = (ax, ay, az, bx, by, bz, col, al, lw) => { PJ(ax, ay, az, q); PJ(bx, by, bz, q2); ctx.globalAlpha = al * g.fade; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q2.x, q2.y); ctx.stroke(); };
  const ticks = priceTicks(lo, hi, 6), dp = priceDecimals(hi, ticks.length > 1 ? ticks[1] - ticks[0] : 0);
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.font = FONT;
  // the floor and the back wall: a grid; the wall carries the price lines, the day plane in focus carries its own
  const zf = -0.3;
  for (let i = 0; i <= 16; i++) { const x = xl + (xr - xl) * i / 16; seg(x, 0, zf, x, 0, zBack, C.blue, 0.07, 1); }
  for (let i = 0; i <= np + 1; i++) { const z = zf + (zBack - zf) * i / (np + 1); seg(xl, 0, z, xr, 0, z, C.blue, 0.07, 1); }
  for (const p of ticks) { const y = yOf(p); seg(xl, y, zBack, xr, y, zBack, C.blue, 0.08, 1); seg(xl, y, zA, xr, y, zA, C.blue, 0.11, 1); }
  seg(xl, 0, zBack, xl, H, zBack, C.blue, 0.14, 1); seg(xl, H, zA, xl, H, zBack, C.blue, 0.1, 1); seg(xr, H, zA, xr, H, zBack, C.blue, 0.1, 1); seg(xr, 0, zA, xr, 0, zBack, C.blue, 0.1, 1);
  // the usual-range band: a translucent glass slab behind today's candles, with the day's open as a gold line
  if (e.band && S.dolly < 1.6) {
    const bd = e.band, yHi = yOf(bd.hi), yLo = yOf(bd.lo), yOp = yOf(bd.open), z = BAND_Z - S.dolly * PZ, al = planeAlpha(0, S.dolly), A = PJ(-Wc / 2, yLo, z, { x: 0, y: 0 }), B = PJ(Wc / 2, yLo, z, { x: 0, y: 0 }), Cc = PJ(Wc / 2, yHi, z, { x: 0, y: 0 }), D = PJ(-Wc / 2, yHi, z, { x: 0, y: 0 });
    ctx.globalAlpha = 0.12 * al * g.fade; ctx.fillStyle = C.blue; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(Cc.x, Cc.y); ctx.lineTo(D.x, D.y); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.5 * al * g.fade; ctx.strokeStyle = C.blue; ctx.lineWidth = 1.2; ctx.stroke();
    seg(-Wc / 2, yOp, z, Wc / 2, yOp, z, C.gold, 0.65 * al, 1.3);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.globalAlpha = 0.8 * al * g.fade;
    PJ(Wc / 2, yHi, z, q); ctx.fillStyle = C.blue; ctx.fillText(`usual high ${fmtPrice(bd.hi)}`, q.x + 6, q.y); PJ(Wc / 2, yLo, z, q); ctx.fillText(`usual low ${fmtPrice(bd.lo)}`, q.x + 6, q.y);
    PJ(Wc / 2, yOp, z, q); ctx.fillStyle = C.gold; ctx.fillText(`open ${fmtPrice(bd.open)}`, q.x + 6, q.y);
  }
  // the day planes, farthest first
  const w = dx * 0.36, d = Math.min(0.05, dx * 0.4), order = syw > 0 ? 1 : -1; let nowPt = null, hov = null;
  const hv = S.mx != null && !st.drag;
  for (let k = np - 1; k >= 0; k--) {
    const al = planeAlpha(k, S.dolly) * g.fade * (k > ka ? 0.38 : 1); if (al < 0.03) continue;
    const pl = planes[k], bars = pl.bars, nb = bars.length, z = (k - S.dolly) * PZ, near = Math.abs(k - S.dolly) < 0.6, act = k === ka;
    // frame, the age label, and a soft sheet of glass
    seg(xl, 0, z, xr, 0, z, C.blue, 0.3 * al, 1); seg(xr, 0, z, xr, H, z, C.blue, 0.1 * al, 1); seg(xl, 0, z, xl, H, z, C.blue, 0.1 * al, 1);
    PJ(xl - 0.03, 0.02, z, q); ctx.globalAlpha = 0.9 * al; ctx.fillStyle = act ? C.tx : C.tx2; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; { const lt = `${pl.label}${k === 0 ? ' · now' : ''}`; ctx.fillText(lt, Math.max(q.x, ctx.measureText(lt).width + 10), q.y); }
    // area under the closes, then the close line
    ctx.beginPath(); for (let i = 0; i < nb; i++) { const b = bars[i]; PJ(X(b.s), yOf(b.c), z, q); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
    const l0 = bars[nb - 1], f0 = bars[0]; ctx.globalAlpha = 0.5 * al; ctx.strokeStyle = act ? C.tx : C.tx2; ctx.lineWidth = act ? 1.2 : 1; ctx.stroke();
    PJ(X(l0.s), 0, z, q); ctx.lineTo(q.x, q.y); PJ(X(f0.s), 0, z, q); ctx.lineTo(q.x, q.y); ctx.closePath(); ctx.globalAlpha = (act ? 0.07 : 0.045) * al; ctx.fillStyle = C.tx; ctx.fill();
    if (!near) {                                                                 // far planes: batched flat candles, one path per colour
      for (let pass = 0; pass < 2; pass++) {
        const col = pass ? C.dn : C.up; ctx.globalAlpha = 0.6 * al; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath();
        for (let i = 0; i < nb; i++) { const b = bars[i]; if ((b.c >= b.o) === !pass) { PJ(X(b.s), yOf(b.l), z, q); PJ(X(b.s), yOf(b.h), z, q2); ctx.moveTo(q.x, q.y); ctx.lineTo(q2.x, q2.y); } } ctx.stroke();
        ctx.globalAlpha = 0.5 * al; ctx.fillStyle = col; ctx.beginPath();
        for (let i = 0; i < nb; i++) { const b = bars[i]; if ((b.c >= b.o) === !pass) { const x = X(b.s); PJ(x - w, yOf(b.o), z, q); PJ(x + w, yOf(b.c), z, q2); ctx.rect(Math.min(q.x, q2.x), Math.min(q.y, q2.y), Math.abs(q2.x - q.x), Math.max(1, Math.abs(q2.y - q.y))); } } ctx.fill();
      }
    } else {                                                                     // near planes: glossy 3D bodies, farthest bar first
      const lead = k === 0 ? printed : 1e9;
      for (let m = 0; m < nb; m++) {
        const i = order > 0 ? m : nb - 1 - m, gr = k === 0 ? rise(i, lead) : 1; if (gr <= 0.002) continue;
        const b = bars[i], bx0 = X(b.s), col = b.c >= b.o ? C.up : C.dn, aa = al * (0.4 + 0.6 * gr), yO = yOf(b.o), yC = yOf(b.c);
        PJ(bx0, yOf(b.l) * gr, z, q); PJ(bx0, yOf(b.h) * gr, z, q2);
        ctx.globalAlpha = aa * 0.9; ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q2.x, q2.y); ctx.stroke();
        bodyCorners(pts8, bx0, yO, yC, w, d, gr); for (let j = 0; j < 8; j++) PJ(pts8[j][0], pts8[j][1], pts8[j][2] + z, sp8[j]);
        for (let f = 0; f < 4; f++) g.poly(FACES.sides[f], sp8, col, 0.42 * aa, col);
        g.poly(FACES.top, sp8, col, 0.8 * aa, col);
        if (gr > 0.5) { ctx.globalAlpha = 0.16 * aa; ctx.fillStyle = C.tx; ctx.beginPath(); ctx.moveTo(sp8[0].x, sp8[0].y); ctx.lineTo(sp8[1].x, sp8[1].y); ctx.lineTo(sp8[5].x, sp8[5].y); ctx.lineTo(sp8[4].x, sp8[4].y); ctx.closePath(); ctx.fill(); }
        if (gr < 0.98) {                                                         // printing: a glow at the top and a beam down to the floor
          const tx = (sp8[4].x + sp8[6].x) / 2, ty = (sp8[4].y + sp8[6].y) / 2, rad = 14 + 26 * (1 - gr);
          ctx.globalCompositeOperation = 'lighter'; const gd = ctx.createRadialGradient(tx, ty, 0, tx, ty, rad); gd.addColorStop(0, col); gd.addColorStop(1, 'transparent');
          ctx.globalAlpha = 0.65 * (1 - gr) * al; ctx.fillStyle = gd; ctx.beginPath(); ctx.arc(tx, ty, rad, 0, 6.2832); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
          PJ(bx0, 0, z, q); ctx.globalAlpha = 0.4 * (1 - gr) * al; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(tx, ty); ctx.stroke();
        }
      }
    }
    // the moving-average ribbons: glowing strips through the candles (EMA 20 cyan, EMA 50 gold), only where the average exists
    if (Math.abs(k - S.dolly) < 0.6) for (let r = 0; r < 2; r++) {
      const arr = r ? e.e50 : e.e20, col = r ? C.gold : C.cy; let started = false, endB = null;
      ctx.beginPath();
      for (let i = 0; i < nb; i++) { const v = arr[bars[i].gi]; if (v == null || (k === 0 && i > printed - 1)) continue; PJ(X(bars[i].s), yE(v), z - 0.04, q); started ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); started = true; endB = i; }
      if (!started) continue;
      for (let i = endB; i >= 0; i--) { const v = arr[bars[i].gi]; if (v == null) continue; PJ(X(bars[i].s), yE(v), z + 0.04, q); ctx.lineTo(q.x, q.y); }
      ctx.closePath(); ctx.globalAlpha = 0.2 * al; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 0.55 * al; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; ctx.beginPath(); started = false;
      for (let i = 0; i <= endB; i++) { const v = arr[bars[i].gi]; if (v == null) continue; PJ(X(bars[i].s), yE(v), z, q); started ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); started = true; }
      ctx.globalAlpha = 0.55 * al; ctx.lineWidth = 3.2; ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
      if (act && endB != null) { const v = arr[bars[endB].gi]; PJ(X(bars[endB].s) + 0.02, yE(v), z, q); ctx.globalAlpha = 0.95 * al; ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`EMA ${r ? 50 : 20}`, q.x + 4, q.y + (r ? 9 : -9)); }
    }
    if (act) { for (let i = 0; i < nb; i++) { PJ(X(bars[i].s), 0, z, q); S.xs[i] = q.x; } S.nAct = nb; }
    if (k === 0 && S.dolly < 0.8) nowPt = { b: bars[Math.min(nb - 1, Math.max(0, Math.floor(printed - 0.5)))], z, al };
  }
  // the pulsing "now" marker on the latest bar of today's plane: a ring on the floor, a beam, and the price tag
  if (nowPt && printed > 0.5) {
    const b = nowPt.b, x = X(b.s), yc = yOf(b.c), pulse = 0.5 + 0.5 * Math.sin(g.t * 5), al = nowPt.al, z = nowPt.z;
    PJ(x, 0, z, q); PJ(x, yc + 0.12, z, q2);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (0.16 + 0.2 * pulse) * al; ctx.strokeStyle = C.tx; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q2.x, q2.y); ctx.stroke();
    ctx.beginPath(); for (let i = 0; i <= 28; i++) { const a = i / 28 * 6.2832, r = 0.05 + 0.045 * pulse; PJ(x + Math.cos(a) * r, 0, z + Math.sin(a) * r, q); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); } ctx.globalAlpha = 0.9 * al; ctx.lineWidth = 2; ctx.stroke();
    PJ(x, yc, z, q); const rad = 9 + 6 * pulse, gd = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, rad); gd.addColorStop(0, C.tx); gd.addColorStop(1, 'transparent'); ctx.globalAlpha = 0.8 * al; ctx.fillStyle = gd; ctx.beginPath(); ctx.arc(q.x, q.y, rad, 0, 6.2832); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  // the price scale on the right with the live last-price tag; the time axis along the bottom (the plane in focus)
  const pa = planes[ka], lastB = pa.bars[pa.bars.length - 1], upNow = lastB.c >= pa.bars[0].o, tagCol = upNow ? C.up : C.dn;
  seg(xr, 0, zA, xr, H, zA, C.blue, 0.4, 1); ctx.font = FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (const p of ticks) { const y = yOf(p); seg(xr, y, zA, xr + 0.03, y, zA, C.blue, 0.5, 1); PJ(xr + 0.045, y, zA, q); ctx.globalAlpha = 0.9 * g.fade; ctx.fillStyle = C.tx2; ctx.fillText(p.toFixed(dp), q.x, q.y); }
  { const yl = yOf(lastB.c); PJ(xl, yl, zA, q); PJ(xr, yl, zA, q2); ctx.setLineDash([5, 4]); ctx.globalAlpha = 0.6 * g.fade; ctx.strokeStyle = tagCol; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q2.x, q2.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '600 11px ui-monospace,monospace'; const lbl = lastB.c.toFixed(dp), tw = ctx.measureText(lbl).width + 12; ctx.globalAlpha = 0.9 * g.fade; ctx.fillStyle = tagCol; rr(ctx, q2.x + 8, q2.y - 9, tw, 18); ctx.fill(); ctx.globalAlpha = g.fade; ctx.fillStyle = C.tx; ctx.fillText(lbl, q2.x + 14, q2.y + 1);
    ctx.font = FONT; ctx.fillStyle = C.tx2; ctx.globalAlpha = 0.8 * g.fade; ctx.fillText(ka === 0 ? 'LAST' : 'CLOSE', q2.x + 8, q2.y + 20); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = C.tx2;
  for (const tk of timeTicks(pa)) { const x = X(tk.s); seg(x, 0, zA, x, -0.025, zA, C.blue, 0.5, 1); PJ(x, 0, zA, q); ctx.globalAlpha = 0.85 * g.fade; ctx.fillText(tk.label, q.x, q.y + 6); }
  PJ(0, 0, zA, q); ctx.globalAlpha = 0.95 * g.fade; ctx.fillStyle = C.tx; ctx.font = '600 11px ui-monospace,monospace'; ctx.fillText(`${pa.label}${ka === 0 ? (tf === '1d' ? ' (latest)' : ' (today)') : ''} · UTC`, q.x, q.y + 24);
  // the crosshair and its floating readout
  if (hv && S.mx != null) {
    const idx = nearestIndex(S.xs, S.nAct ?? 0, S.mx, 36);
    if (idx >= 0) {
      const b = pa.bars[idx], bx = X(b.s); PJ(bx, 0, zA, q); PJ(bx, H, zA, q2);
      if (S.my >= Math.min(q.y, q2.y) - 6 && S.my <= Math.max(q.y, q2.y) + 6) {
        const price = priceAtY(S.my, q.y, q2.y, lo, hi), chg = barChange(b), col = b.c >= b.o ? C.up : C.dn;
        PJ(xl, H, zA, q3); PJ(xr, H, zA, q4); ctx.setLineDash([3, 4]); ctx.globalAlpha = 0.7 * g.fade; ctx.strokeStyle = C.tx; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(S.xs[idx], q.y); ctx.lineTo(S.xs[idx], q2.y); ctx.moveTo(q3.x, S.my); ctx.lineTo(q4.x, S.my); ctx.stroke(); ctx.setLineDash([]);
        // axis tags: price on the right, time at the bottom
        PJ(xr, 0, zA, q2); ctx.font = '600 10px ui-monospace,monospace'; const pt = price.toFixed(dp), pw = ctx.measureText(pt).width + 12; ctx.globalAlpha = 0.95 * g.fade; ctx.fillStyle = C.blue; ctx.fillRect(q2.x + 8, S.my - 9, pw, 18); ctx.fillStyle = C.tx; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(pt, q2.x + 14, S.my + 1);
        const tt = fullTime(b.t, tf), tw = ctx.measureText(tt).width + 14; PJ(bx, 0, zA, q); ctx.fillStyle = C.blue; ctx.fillRect(S.xs[idx] - tw / 2, q.y + 30, tw, 18); ctx.fillStyle = C.tx; ctx.textAlign = 'center'; ctx.fillText(tt, S.xs[idx], q.y + 40);
        // the floating OHLC readout
        const lines = [[fullTime(b.t, tf), C.tx], [`O ${b.o.toFixed(dp)}   H ${b.h.toFixed(dp)}`, C.tx2], [`L ${b.l.toFixed(dp)}   C ${b.c.toFixed(dp)}`, C.tx2], [`${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%  (close vs open)`, col]];
        const e20 = e.e20[b.gi], e50 = e.e50[b.gi]; if (e20 != null) lines.push([`EMA 20 ${e20.toFixed(dp)}`, C.cy]); if (e50 != null) lines.push([`EMA 50 ${e50.toFixed(dp)}`, C.gold]);
        ctx.font = '11px ui-monospace,monospace'; let bw = 0; for (const [t] of lines) bw = Math.max(bw, ctx.measureText(t).width); bw += 22; const bh = lines.length * 16 + 12;
        let bx2 = S.mx + 18, by2 = S.my + 16; if (bx2 + bw > g.W - 10) bx2 = S.mx - bw - 18; if (by2 + bh > g.H - 10) by2 = g.H - bh - 10;
        ctx.globalAlpha = 0.9 * g.fade; ctx.fillStyle = C.blue; ctx.fillRect(bx2, by2, 2, bh); rr(ctx, bx2 + 2, by2, bw, bh); ctx.fillStyle = 'black'; ctx.globalAlpha = 0.62 * g.fade; ctx.fill(); ctx.globalAlpha = 0.5 * g.fade; ctx.strokeStyle = C.blue; ctx.stroke();
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; lines.forEach(([t, c], i) => { ctx.globalAlpha = g.fade; ctx.fillStyle = c; ctx.fillText(t, bx2 + 12, by2 + 14 + i * 16); });
        // outline the bar under the crosshair
        PJ(bx - w, yOf(b.h), zA, q); PJ(bx + w, yOf(b.l), zA, q2); ctx.globalAlpha = 0.9 * g.fade; ctx.strokeStyle = C.tx; ctx.lineWidth = 1; ctx.strokeRect(q.x, q.y, q2.x - q.x, q2.y - q.y); hov = idx;
      }
    }
  }
  ctx.restore();
  hud(ctx, g, e, key, tf, ka, np, printed, nf);
}

function hud(ctx, g, e, key, tf, ka, np, printed, nf) {
  const C = g.C, st = e.st, y0 = S.top + 62; ctx.save(); ctx.globalAlpha = g.fade; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = C.tx; ctx.font = '600 16px ui-monospace,monospace'; ctx.fillText(`${key} · ${TF_WORD[tf]} candles`, 28, y0);
  ctx.fillStyle = C.tx2; ctx.font = '11px ui-monospace,monospace';
  const span = tf === '1d' ? `the last ${e.planes[0].bars.length} daily bars` : "today's session so far";
  ctx.fillText(`${span} · open ${fmtPrice(st.open)} · high ${fmtPrice(st.hi)} · low ${fmtPrice(st.lo)} · last ${fmtPrice(st.last)} (${st.movePct >= 0 ? '+' : ''}${st.movePct.toFixed(2)}%${st.times != null && tf !== '1d' ? `, ${st.times.toFixed(1)}x its usual move` : ''})`, 28, y0 + 18);
  ctx.fillText(`${np} ${tf === '1d' ? 'blocks of 22 days' : 'UTC days'} stacked in depth · plane ${ka + 1} of ${np} in focus${S.replay && printed < nf ? ` · printing ${Math.floor(printed)} / ${nf}` : ''}`, 28, y0 + 34);
  if (e.note) { ctx.fillStyle = C.gold; ctx.fillText(e.note, 28, y0 + 50); }
  const items = [[C.up, 'closed up'], [C.dn, 'closed down'], [C.cy, 'EMA 20: average of the last 20 closes'], [C.gold, 'EMA 50: average of the last 50 closes'], [C.blue, e.band ? "the market's usual high / low reach today (median)" : null], [C.tx, 'latest bar (now) / last-price tag']].filter(x => x[1]);
  let y = g.H - 70 - items.length * 16; for (const [c, t] of items) { ctx.globalAlpha = 0.9 * g.fade; ctx.fillStyle = c; ctx.fillRect(28, y - 8, 10, 10); ctx.fillStyle = C.tx2; ctx.fillText(t, 46, y); y += 16; }
  ctx.globalAlpha = 0.6 * g.fade; ctx.fillStyle = C.tx2; ctx.textAlign = 'right'; ctx.fillText('drag orbit · wheel zoom · hover for the crosshair · ◀ ▶ fly through the days · averages are of past closes, not a forecast', g.W - 24, g.H - 28);
  ctx.restore();
}

let bound = null;
const view = {
  id: 'session', label: 'CANDLES', env: { accent: 'blue2', chrome: 'clean' }, draw,
  onEnter(api) {
    Object.assign(api.st, { yaw: 0.16, pitch: -0.26, zoom: 1, spin: false }); S.t0 = null; S.key = null; api.st.sessionSweep = null; S.dolly = S.dollyT = 0;
    if (MARKET_KEYS.includes(api.st.sel)) loadChart(api.st.sel, S.tf, api); else loadVol(api);
    try {
      const cv = api.$('cv'), mv = ev => { const r = cv.getBoundingClientRect(); S.mx = ev.clientX - r.left; S.my = ev.clientY - r.top; }, lv = () => { S.mx = S.my = null; };
      cv.addEventListener('pointermove', mv); cv.addEventListener('pointerleave', lv); bound = { cv, mv, lv };
    } catch (x) { /* no pointer readout; the chart still draws */ }
  },
  onLeave(api) { api.st.sessionSweep = null; api.st.spin = true; S.replay = false; S.mx = S.my = null; if (bound) { bound.cv.removeEventListener('pointermove', bound.mv); bound.cv.removeEventListener('pointerleave', bound.lv); bound = null; } },
};

// the SHOW scene: the biggest mover's chart, measured facts only; the camera sweeps along the candles while it is described
registerShowScene({
  id: 'session', after: 'candles',
  async prepare(api) { const inst = await loadVol(api), key = pickMarket(null, inst ?? {}); if (!key) return null; const e = await loadChart(key, '15m', api); return e?.status === 'ok' ? { key, mode: e.tf === '1d' ? 'daily' : 'intraday', st: e.st } : null; },
  build(inp, data) {
    if (!data?.st) return null; const text = sessionScript(data.key, data.st, data.mode); if (!text) return null;
    return { title: 'The chart', view: 'session', cam: null, text, enter(api) { api.st.sel = data.key; api.st.spin = false; S.key = null; S.tf = data.mode === 'daily' ? '1d' : '15m'; S.replay = true; S.t0 = null; S.dolly = S.dollyT = 0; }, motion(api, p) { api.st.sessionSweep = p; } };
  },
});

registerJarvisModule({
  id: 'session', label: 'CANDLES', views: [view],
  render(pane, api) {
    const { esc, st } = api, cur = MARKET_KEYS.includes(st.sel) ? st.sel : 'NQ';
    pane.innerHTML = `<h3>CANDLES</h3><p>A 3D candlestick chart: a price scale with a live last-price tag, a time axis, a crosshair, EMA 20 and EMA 50 ribbons (averages of past closes), the market's usual range behind, and every earlier day stacked behind as its own plane that you can fly back through.</p>
<div class="jv-row"><label class="jv-sub">market <select data-s="mk">${MARKET_KEYS.map(k => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(k)}</option>`).join('')}</select></label>${TFS.map(t => `<button type="button" data-s="tf" data-t="${esc(t)}" aria-pressed="${t === S.tf}">${esc(TF_LABEL[t])}</button>`).join(' ')}</div>
<div class="jv-row"><button type="button" data-s="go">▶ OPEN THE CHART</button> <button type="button" data-s="replay">REPLAY</button> <button type="button" data-s="auto">AUTO DOLLY</button> <button type="button" data-s="back">◀ BACK A DAY</button> <button type="button" data-s="fwd">FORWARD ▶</button></div>
<p class="jv-sub">5 minute, 15 minute and hourly bars where the server can reach them, otherwise daily bars. Description only, never a forecast.</p>`;
    const go = () => { chartCommand(`mk:${pane.querySelector('[data-s="mk"]').value}`, api); api.setView('session'); };
    pane.querySelector('[data-s="go"]').onclick = go; pane.querySelector('[data-s="mk"]').onchange = go;
    pane.querySelectorAll('[data-s="tf"]').forEach(b => { b.onclick = () => { chartCommand(`tf:${b.dataset.t}`, api); pane.querySelectorAll('[data-s="tf"]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); if (st.view !== 'session') go(); }; });
    for (const c of ['replay', 'auto', 'back', 'fwd']) pane.querySelector(`[data-s="${c}"]`).onclick = () => { chartCommand(c, api); if (st.view !== 'session') api.setView('session'); };
  },
});
