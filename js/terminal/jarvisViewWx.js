// js/terminal/jarvisViewWx.js: MARKET WEATHER. A forecast-broadcast board where every asset class and every currency has its own little weather scene, driven by that group's own measured move today
// (jarvisWxCore.js): sun and heat for a group that is rising, cloud and rain for one that is falling, a storm with lightning for one falling hard, wind for big moves in both directions, a clear sky when
// little is happening. One row of asset classes, one row of currencies. DESCRIPTION OF TODAY SO FAR, never an outlook: the legend says so. Data: the CANDLES board feed (api.candles()).
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene, QUICK_IDS } from './showCore.js';
import { groupWeather, ccyWeather, wxScript, WORD } from './jarvisWxCore.js';

const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const sg = (v, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}×`;
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
let cache = { at: 0, wx: null };
const compute = cd => { if (!cd?.ok) return null; if (cache.at !== cd.at) cache = { at: cd.at, wx: { groups: groupWeather(cd.rows), ccys: ccyWeather(cd.rows) } }; return cache.wx; };

/** One cell: the sky, the weather, the numbers. */
function drawCell(ctx, g, x, y, w, h, cell, t, i, cmp = false) {
  const C = g.C, cond = cell.cond, seed = i * 17.3 + 1, up = cell.avg > 0.15, dn = cell.avg < -0.15, tone = up ? C.up : dn ? C.dn : C.tx2;
  const sky = cond === 'storm' ? C.dn : cond === 'rain' ? C.blue : cond === 'hot' || cond === 'warm' ? C.gold : cond === 'wind' ? C.blue : cond === 'clear' ? C.blue : C.tx2;
  ctx.save(); rr(ctx, x, y, w, h, 14); ctx.clip();
  const bg = ctx.createLinearGradient(x, y, x, y + h); bg.addColorStop(0, sky); bg.addColorStop(1, 'transparent'); ctx.globalAlpha = cond === 'storm' ? 0.34 : 0.26; ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  // sun: a glowing disc for clear, warm and hot; bigger and brighter the hotter
  if (cond === 'clear' || cond === 'warm' || cond === 'hot') {
    const sr = (cond === 'hot' ? 0.5 : cond === 'warm' ? 0.38 : 0.28) * w * (1 + 0.04 * Math.sin(t * 1.5 + seed)), sx = x + w * 0.74, sy = y + h * 0.3, gr = ctx.createRadialGradient(sx, sy, 2, sx, sy, sr * 1.8);
    gr.addColorStop(0, cond === 'clear' ? C.blue : C.gold); gr.addColorStop(1, 'transparent'); ctx.globalAlpha = cond === 'hot' ? 0.75 : 0.5; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy, sr * 1.8, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 0.95; ctx.fillStyle = cond === 'clear' ? C.tx : C.gold; ctx.beginPath(); ctx.arc(sx, sy, sr * 0.34, 0, 6.2832); ctx.fill();
    if (cond === 'hot') { ctx.strokeStyle = C.gold; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.5; for (let k = 0; k < 12; k++) { const a = k / 12 * 6.2832 + t * 0.25; ctx.beginPath(); ctx.moveTo(sx + Math.cos(a) * sr * 0.5, sy + Math.sin(a) * sr * 0.5); ctx.lineTo(sx + Math.cos(a) * sr * 0.9, sy + Math.sin(a) * sr * 0.9); ctx.stroke(); } }
    if (cond === 'hot' || cond === 'warm') { ctx.strokeStyle = C.gold; ctx.lineWidth = 1; ctx.globalAlpha = 0.22; for (let k = 0; k < 3; k++) { ctx.beginPath(); for (let px = 0; px <= w; px += 6) { const py = y + h * (0.78 + 0.05 * k) + Math.sin(px * 0.09 + t * 2.2 + k) * 2.5; px ? ctx.lineTo(x + px, py) : ctx.moveTo(x + px, py); } ctx.stroke(); } }   // heat shimmer
  }
  // clouds: more and darker as it worsens
  const clouds = cond === 'cloud' ? 3 : cond === 'rain' ? 4 : cond === 'storm' ? 6 : cond === 'wind' ? 3 : cond === 'warm' ? 1 : 0;
  for (let k = 0; k < clouds; k++) {
    const sp = (cond === 'storm' ? 16 : cond === 'wind' ? 38 : 9) * (0.6 + hash(seed + k)), cx0 = x + ((t * sp + hash(seed + k * 3) * w * 2) % (w * 1.6)) - w * 0.3, cy0 = y + h * (0.12 + 0.18 * hash(seed + k * 5)), rw = w * (0.3 + 0.18 * hash(seed + k * 7));
    ctx.globalAlpha = cond === 'storm' ? 0.55 : 0.38; ctx.fillStyle = cond === 'storm' ? C.dn : C.tx2;
    for (let b = 0; b < 4; b++) { ctx.beginPath(); ctx.ellipse(cx0 + (b - 1.5) * rw * 0.28, cy0 + (b % 2) * 3, rw * 0.3, rw * 0.17, 0, 0, 6.2832); ctx.fill(); }
  }
  // rain and storm: falling lines
  if (cond === 'rain' || cond === 'storm') {
    const n = cond === 'storm' ? 34 : 18; ctx.strokeStyle = C.blue; ctx.lineWidth = 1; ctx.globalAlpha = 0.6;
    for (let k = 0; k < n; k++) { const sp = 60 + 70 * hash(seed + k * 2), px = x + hash(seed + k * 11) * w, py = y + ((t * sp + hash(seed + k * 13) * h * 2) % (h + 20)) - 10; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 3, py + 9); ctx.stroke(); }
  }
  // lightning: a flash and a bolt every few seconds in a storm
  if (cond === 'storm') {
    const ph = (t * 0.5 + hash(seed) * 6) % 3.2;
    if (ph < 0.22) {
      ctx.globalAlpha = 0.4 * (1 - ph / 0.22); ctx.fillStyle = C.tx; ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1; ctx.strokeStyle = C.tx; ctx.lineWidth = 2; let bx = x + w * (0.3 + 0.4 * hash(Math.floor(t * 0.5 + seed))), by = y + h * 0.18; ctx.beginPath(); ctx.moveTo(bx, by);
      for (let k = 0; k < 5; k++) { bx += (hash(seed + k + Math.floor(t * 0.5)) - 0.5) * w * 0.22; by += h * 0.12; ctx.lineTo(bx, by); } ctx.stroke();
    }
  }
  // wind: streaks racing across
  if (cond === 'wind') { ctx.strokeStyle = C.blue; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.5; for (let k = 0; k < 9; k++) { const sp = 80 + 90 * hash(seed + k), py = y + h * (0.2 + 0.5 * hash(seed + k * 5)), px = x + ((t * sp + hash(seed + k * 3) * w * 2) % (w * 1.5)) - w * 0.25, len = w * (0.18 + 0.2 * hash(seed + k * 9)); ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + len * 0.5, py - 4, px + len, py); ctx.stroke(); } }
  ctx.restore();
  // the glass frame and the numbers
  ctx.globalAlpha = cond === 'storm' ? 0.95 : 0.7; ctx.strokeStyle = sky; ctx.lineWidth = cond === 'storm' ? 2 : 1.3; rr(ctx, x, y, w, h, 14); ctx.stroke();
  ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.fillStyle = C.tx2; ctx.font = `${cmp ? 9 : 11}px ui-monospace,monospace`; ctx.fillText(cell.label.toUpperCase(), x + 10, y + (cmp ? 16 : 20));
  if (cell.code && !cmp) { ctx.fillStyle = C.tx2; ctx.globalAlpha = 0.6; ctx.font = '9px ui-monospace,monospace'; ctx.fillText(cell.code, x + 12 + ctx.measureText(cell.label.toUpperCase()).width * 1.05 + 6, y + 20); ctx.globalAlpha = 1; }
  ctx.fillStyle = tone; ctx.font = `${cmp ? 18 : Math.max(20, Math.min(30, w * 0.17))}px ui-monospace,monospace`; ctx.fillText(sg(cell.avg), x + 10, y + h - (cmp ? 28 : 38));
  ctx.fillStyle = C.tx; ctx.font = `${cmp ? 10 : 12}px ui-monospace,monospace`; ctx.fillText(WORD[cond], x + 10, y + h - (cmp ? 10 : 20));
  if (cell.top && !cmp) { ctx.fillStyle = C.tx2; ctx.font = '10px ui-monospace,monospace'; ctx.textAlign = 'right'; ctx.fillText(`${cell.top.name} ${sg(cell.top.ratio)}`, x + w - 10, y + h - 20); ctx.textAlign = 'left'; }
}

function draw(ctx, g, api) {
  const cd = api.st.cd, wx = compute(cd), C = g.C, W = g.W, H = g.H;
  if (!wx) { ctx.globalAlpha = g.fade; ctx.fillStyle = C.tx2; ctx.font = '13px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(cd ? 'The market feed is not available right now.' : 'Reading the markets...', W / 2, H / 2); if (!cd) api.candles(); return; }
  ctx.globalAlpha = g.fade; ctx.textAlign = 'left'; ctx.fillStyle = C.blue; ctx.font = '13px ui-monospace,monospace'; ctx.fillText('M A R K E T   W E A T H E R   ·   so far today', g.compact ? 10 : 36, g.compact ? 104 : 168);
  const cmp = g.compact, mx = cmp ? 10 : 36, gap = cmp ? 8 : 14, top = cmp ? 128 : 190, rowH = cmp ? 84 : Math.max(120, Math.min(190, (H - top - 150) / 2));
  const rows = [['ASSETS', wx.groups, cmp ? 3 : wx.groups.length], ['CURRENCIES', wx.ccys, cmp ? 4 : wx.ccys.length]];
  let idx = 0, y = top;
  rows.forEach(([name, cells, cols]) => {
    const n = cells.length; if (!n) return; cols = Math.max(1, Math.min(cols, n));
    ctx.globalAlpha = g.fade * 0.7; ctx.fillStyle = C.tx2; ctx.font = '10px ui-monospace,monospace'; ctx.textAlign = 'left'; ctx.fillText(name, mx, y - 6);
    const cw = Math.min(210, (W - 2 * mx - gap * (cols - 1)) / cols), nr = Math.ceil(n / cols);
    cells.forEach((c, k) => {
      const r = Math.floor(k / cols), cc = k % cols, inRow = Math.min(cols, n - r * cols), total = cw * inRow + gap * (inRow - 1), x0 = cmp ? mx : (W - total) / 2;
      ctx.globalAlpha = g.fade; drawCell(ctx, g, x0 + cc * (cw + gap), y + r * (rowH + gap) + Math.sin(g.t * 0.8 + idx) * (cmp ? 1 : 2.5), cw, rowH, c, g.t, idx++, cmp);
    });
    y += nr * (rowH + gap) + (cmp ? 22 : 34);
  });
  ctx.globalAlpha = g.fade * 0.75; ctx.fillStyle = C.tx2; ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'left';
  if (g.compact) { ctx.fillText('Average move so far today vs each market\'s usual. A description, not a forecast.', 10, H - 92); return; }
  const ly = H - 122; ['Each box is one group\'s average move so far today, against each market\'s own usual move (×). Sun and heat = rising · cloud and rain = falling · storm = falling hard · wind = big moves both ways · clear = quiet.',
    'The little name is that group\'s biggest mover. This describes today so far. It is not an outlook and not a forecast.'].forEach((l, k) => ctx.fillText(l, 36, ly + k * 16));
}

registerJarvisModule({
  id: 'wx', label: 'WEATHER',
  views: [{ id: 'wx', label: 'WEATHER', env: { accent: 'blue2', chrome: 'clean', scan: false }, draw, onEnter: api => { api.candles(); } }],
  render(pane, api) { pane.innerHTML = '<h3>MARKET WEATHER</h3><p>One little weather scene per asset class and per currency, from that group\'s own move so far today. Sun and heat for rising, cloud and rain for falling, a storm for falling hard, wind for big moves both ways. A description of today, not an outlook.</p><div class="jv-row"><button type="button" data-w="go">SHOW THE WEATHER</button></div>'; pane.querySelector('[data-w="go"]').onclick = () => api.setView('wx'); },
});

QUICK_IDS.add('wx');
registerShowScene({
  id: 'wx', after: 'candles',
  prepare: api => api.candles(),
  build: (inp, data) => { if (!data?.ok || !data.rows?.length) return null; const wx = compute(data), text = wxScript(wx?.groups, wx?.ccys); return text ? { title: 'Market weather', view: 'wx', text } : null; },
});
