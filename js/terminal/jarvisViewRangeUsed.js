// js/terminal/jarvisViewRangeUsed.js: Helix's RANGE USED vs IMPLIED (view id 'rangeused'): a scatter of every desk market. Across = the vol forecaster's usual high-low range for today
// (median, % of price); up = the high-low range traded so far today (% of price). One shared scale on both axes, so the diagonal is "has traded its whole usual day": points above it have
// already gone further than a usual day, points below have room left in the usual sense. A second, dashed line marks a 75th-percentile day where the forecaster gives one (its median slope).
// Points above the diagonal are drawn as filled diamonds, below as hollow circles: "past its usual range" never rests on colour alone. The loudest carry their names.
// Data: /api/vol-forecast/live (api.jf falls back to the last complete session at weekends, labelled AS OF). Maths: jarvisNewViewsCore.js (tested).
// DESCRIPTION ONLY: how much of a usual day has been traded, never a forecast of what is left.
import { registerJarvisModule } from './jarvisModules.js';
import { marketName } from './jarvisNames.js';
import { rangePoints, scatterFrame, rangeHeadline } from './jarvisNewViewsCore.js';

const S = { pts: null, frame: null, label: null, at: 0, busy: null, err: false, p75: null };
const F10 = '10px ui-monospace,monospace', F11 = '11px ui-monospace,monospace', F13 = '600 13px ui-monospace,monospace';
const KEY = 'across = usual high-low range for today (forecaster median, % of price) · up = range traded so far · diagonal = a whole usual day traded · ◆ filled = past it, ○ hollow = inside it · a description, not a forecast';
const KEY_PH = 'across = usual range · up = traded so far · ◆ past the diagonal, ○ inside · not a forecast';

export async function loadRange(api, force = false) {
  if (S.busy) return S.busy; if (S.pts && !force && Date.now() - S.at < 60_000) return S.pts;
  S.busy = (async () => {
    let j = null; try { j = await api.jf('/api/vol-forecast/live'); } catch (e) { j = null; }
    if (j?.instruments) {
      S.pts = rangePoints(j.instruments); S.frame = scatterFrame(S.pts); S.label = j.fallback ? (j.session_label ?? 'LAST SESSION') : null; S.err = false;
      const r = S.pts.filter(p => p.p75 > 0).map(p => p.p75 / p.x).sort((a, b) => a - b); S.p75 = r.length ? r[r.length >> 1] : null;
    } else S.err = !S.pts;
    S.at = Date.now(); S.busy = null; return S.pts;
  })();
  return S.busy;
}

function draw(ctx, g, api) {
  const { W, H, C, fade, compact } = g; ctx.save(); ctx.textBaseline = 'middle';
  if (!S.busy && Date.now() - S.at > 60_000) loadRange(api);
  const pts = S.pts, fr = S.frame;
  if (!pts?.length) { ctx.globalAlpha = fade; ctx.fillStyle = C.tx2; ctx.font = F13; ctx.textAlign = 'center'; ctx.fillText(S.err ? 'The vol forecast feed is not available right now, so there is nothing to plot.' : pts ? 'No market has a usual range and a range so far yet.' : 'Reading the markets...', W / 2, H / 2); ctx.restore(); return; }
  const gut = compact ? 16 : 40, top = 140, bot = H - (compact ? 96 : 110), left = gut + (compact ? 34 : 48), size = Math.max(120, Math.min(W - left - gut - (compact ? 0 : 160), bot - top)), x0 = left, y1 = bot, x1 = x0 + size, y0 = bot - size;
  const X = v => x0 + v / fr.max * size, Y = v => y1 - v / fr.max * size;
  // the grid and the axes
  ctx.font = F10; ctx.lineWidth = 1;
  for (const v of fr.ticks) {
    ctx.globalAlpha = fade * 0.18; ctx.strokeStyle = C.tx2; ctx.beginPath(); ctx.moveTo(X(v), y0); ctx.lineTo(X(v), y1); ctx.moveTo(x0, Y(v)); ctx.lineTo(x1, Y(v)); ctx.stroke();
    ctx.globalAlpha = fade * 0.75; ctx.fillStyle = C.tx2; ctx.textAlign = 'center'; ctx.fillText(`${+v.toFixed(2)}%`, X(v), y1 + 12); ctx.textAlign = 'right'; ctx.fillText(`${+v.toFixed(2)}%`, x0 - 6, Y(v));
  }
  ctx.globalAlpha = fade * 0.8; ctx.fillStyle = C.tx2; ctx.textAlign = 'center'; ctx.fillText('USUAL RANGE FOR TODAY →', (x0 + x1) / 2, y1 + 28);
  ctx.save(); ctx.translate(x0 - (compact ? 28 : 40), (y0 + y1) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('TRADED SO FAR →', 0, 0); ctx.restore();
  // the diagonal: a whole usual day; the dashed line: a 75th-percentile day
  ctx.globalAlpha = fade * 0.9; ctx.strokeStyle = C.tx; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(fr.max), Y(fr.max)); ctx.stroke();
  if (S.p75 > 1) { const m = fr.max / S.p75; ctx.setLineDash?.([4, 4]); ctx.globalAlpha = fade * 0.55; ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(m), Y(fr.max)); ctx.stroke(); ctx.setLineDash?.([]); if (!compact) { ctx.globalAlpha = fade * 0.7; ctx.fillStyle = C.tx2; ctx.textAlign = 'left'; ctx.fillText('a 75th-percentile day', X(m) + 4, Y(fr.max) + 8); } }
  if (!compact) { ctx.globalAlpha = fade * 0.8; ctx.fillStyle = C.tx; ctx.textAlign = 'left'; ctx.fillText('a whole usual day', X(fr.max) + 6, Y(fr.max)); }
  // the points: ◆ filled above the diagonal, ○ hollow below; the furthest carry names
  const sel = api.st?.sel, named = compact ? 5 : 10;
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i], x = X(p.x), y = Y(Math.min(fr.max, p.y)), over = p.used >= 1, r = over ? 5.5 : 4.5;
    ctx.globalAlpha = fade * (over ? 0.95 : 0.7); ctx.fillStyle = C.tx; ctx.strokeStyle = C.tx; ctx.lineWidth = 1.3; ctx.beginPath();
    if (over) { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill(); } else { ctx.arc(x, y, r, 0, 6.2832); ctx.stroke(); }
    if (sel === p.key) { ctx.globalAlpha = fade; ctx.beginPath(); ctx.arc(x, y, r + 5, 0, 6.2832); ctx.stroke(); }
    if (i < named || sel === p.key) { ctx.globalAlpha = fade * (i < named ? 0.95 : 1); ctx.font = F11; ctx.textAlign = 'left'; ctx.fillText(`${marketName(p.key, { short: true })} ${Math.round(p.used * 100)}%`, x + r + 4, y - 1); }
    g.hit(p.key, x, y);
  }
  ctx.globalAlpha = fade * 0.8; ctx.fillStyle = C.tx2; ctx.font = F10; ctx.textAlign = 'left';
  if (S.label) ctx.fillText(S.label, gut, bot + 44);
  ctx.fillText(compact ? KEY_PH : KEY, gut, bot + (S.label ? 60 : 50));
  ctx.restore();
}

const view = {
  id: 'rangeused', label: 'RANGE USED', env: { accent: 'blue2' },
  onEnter: api => { Object.assign(api.st, { spin: false }); loadRange(api); },
  headline: () => (S.pts?.length ? rangeHeadline(S.pts, S.label) : null),
  draw,
};

registerJarvisModule({
  id: 'rangeused', label: 'RANGE USED', views: [view],
  async render(pane, api) {
    pane.innerHTML = '<h3>RANGE USED vs USUAL</h3><p>Reading the markets…</p>';
    const pts = await loadRange(api); if (!pane.isConnected) return;
    if (!pts?.length) { pane.innerHTML = '<h3>RANGE USED vs USUAL</h3><p>The vol forecast feed has nothing to plot right now.</p>'; return; }
    const h = rangeHeadline(pts, S.label), esc = api.esc;
    pane.innerHTML = `<h3>RANGE USED · ${esc(h.hero.toUpperCase())}</h3><p>The high-low range each market has traded so far today as a share of the forecaster's usual range for the day (median).${S.label ? ` ${esc(S.label)}.` : ''}</p><table>${pts.map(p => `<tr><td>${p.used >= 1 ? '◆' : '○'} ${esc(marketName(p.key, { short: true }))}</td><td>${Math.round(p.used * 100)}% · ${p.y.toFixed(2)}% of ${p.x.toFixed(2)}%</td></tr>`).join('')}</table><p class="jv-sub">What has been traded, a description, not a forecast of what is left.</p>`;
  },
});
