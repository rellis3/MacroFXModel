// js/terminal/jarvisViewFlip.js: Helix's FLIP MAP (view id 'flipmap'): every market with an option book, one horizontal bar each, showing how far spot sits from its gamma flip.
// ENCODING: a centre line = the flip. A bar to the right = spot above the flip (dealers modelled net LONG gamma: hedging tends to damp moves), cyan, ending in a filled ▲; a bar to the left =
// spot below the flip (net SHORT gamma: moves tend to be amplified), red, ending in a hollow ▼. Length = distance in % of spot (one shared scale); the right-hand figure adds the distance in
// units of that market's usual day's high-low range when the vol forecaster has one. The OI capture date sits in the corner (the store is a nightly capture, not live).
// Data: /api/oi-store via the GAMMA view's loader (jarvisViewGamma.js loadGamma) and /api/vol-forecast/live. Maths: jarvisNewViewsCore.js (tested).
// DESCRIPTION ONLY: where open interest sits against spot, never a forecast; the repo's own studies found no proven direction from these levels.
import { registerJarvisModule } from './jarvisModules.js';
import { loadGamma } from './jarvisViewGamma.js';
import { flipRows, flipHeadline, flipScale, latestCapture } from './jarvisNewViewsCore.js';

const S = { f: null, at: 0, busy: null, err: false, scale: 1 };
const F11 = '11px ui-monospace,monospace', F12 = '12px ui-monospace,monospace', F13 = '600 13px ui-monospace,monospace', F10 = '10px ui-monospace,monospace';
const KEY = 'centre line = gamma flip · right, cyan ▲ = spot above: dealers modelled long gamma (moves damped) · left, red ▽ = below: short gamma (moves amplified) · length = % of spot · a description, not a forecast';
const KEY_PH = 'centre = flip · ▲ cyan above (damped) · ▽ red below (amplified) · not a forecast';

export async function loadFlip(api, force = false) {
  if (S.busy) return S.busy; if (S.f && !force && Date.now() - S.at < 600_000) return S.f;
  S.busy = (async () => {
    const [store, vol] = await Promise.all([Promise.resolve().then(() => loadGamma(api, force)).catch(() => null), Promise.resolve().then(() => api.jf('/api/vol-forecast/live')).catch(() => null)]);
    if (store && typeof store === 'object') { try { S.f = flipRows(store, vol?.instruments ?? null); S.scale = flipScale(S.f.rows); S.err = false; } catch (e) { S.err = !S.f; } } else S.err = !S.f;
    S.at = Date.now(); S.busy = null; return S.f;
  })();
  return S.busy;
}

function tri(ctx, x, y, s, up, fill) {
  ctx.beginPath(); if (up) { ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s * 0.8); ctx.lineTo(x - s, y + s * 0.8); } else { ctx.moveTo(x, y + s); ctx.lineTo(x + s, y - s * 0.8); ctx.lineTo(x - s, y - s * 0.8); }
  ctx.closePath(); if (fill) ctx.fill(); else { ctx.lineWidth = 1.4; ctx.stroke(); }
}
const pct = v => `${v >= 0 ? '+' : '−'}${Math.abs(v) < 10 ? Math.abs(v).toFixed(2) : Math.abs(v).toFixed(1)}%`;

function draw(ctx, g, api) {
  const { W, H, C, fade, compact } = g; ctx.save(); ctx.textBaseline = 'middle';
  if (!S.f && !S.busy && Date.now() - S.at > 600_000) loadFlip(api);
  const rows = S.f?.rows;
  if (!rows?.length) { ctx.globalAlpha = fade; ctx.fillStyle = C.tx2; ctx.font = F13; ctx.textAlign = 'center'; ctx.fillText(S.err ? 'The option open interest feed is not available right now, so there is no flip map.' : S.f ? 'No market has a gamma flip near spot in the last capture.' : 'Reading the option books...', W / 2, H / 2); ctx.restore(); return; }
  const gut = compact ? 16 : 40, top = compact ? 150 : 150, bot = H - (compact ? 90 : 110), labW = compact ? 64 : 120, valW = compact ? 70 : 150;
  const x0 = gut + labW, x1 = W - gut - valW, cx = (x0 + x1) / 2, half = (x1 - x0) / 2, n = rows.length, rowH = Math.max(18, Math.min(42, (bot - top) / n)), y0 = top + Math.max(0, (bot - top - rowH * n) / 2);
  // the scale: the flip line and the % ticks
  ctx.globalAlpha = fade * 0.9; ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, y0 - 14); ctx.lineTo(cx, y0 + rowH * n + 4); ctx.stroke();
  ctx.font = F10; ctx.textAlign = 'center'; ctx.fillStyle = C.tx2;
  for (const k of [-1, -0.5, 0.5, 1]) { const x = cx + k * half; ctx.globalAlpha = fade * 0.25; ctx.strokeStyle = C.tx2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y0 - 8); ctx.lineTo(x, y0 + rowH * n); ctx.stroke(); ctx.globalAlpha = fade * 0.7; ctx.fillText(pct(k * S.scale), x, y0 + rowH * n + 14); }
  ctx.globalAlpha = fade; ctx.fillStyle = C.gold; ctx.fillText('FLIP', cx, y0 - 22);
  if (!compact) { ctx.fillStyle = C.tx2; ctx.textAlign = 'right'; ctx.fillText('◂ BELOW: SHORT GAMMA, MOVES AMPLIFIED', cx - 12, y0 - 22); ctx.textAlign = 'left'; ctx.fillText('ABOVE: LONG GAMMA, MOVES DAMPED ▸', cx + 12, y0 - 22); }
  const sel = api.st?.sel;
  for (let i = 0; i < n; i++) {
    const r = rows[i], y = y0 + rowH * (i + 0.5), len = Math.max(2, Math.min(1, Math.abs(r.dist) / S.scale) * half), xe = cx + (r.above ? len : -len), col = r.above ? C.cy : C.dn, bh = Math.min(14, rowH * 0.5);
    ctx.globalAlpha = fade * 0.35; ctx.fillStyle = col; ctx.fillRect(Math.min(cx, xe), y - bh / 2, len, bh);
    ctx.globalAlpha = fade * 0.95; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(Math.min(cx, xe), y - bh / 2, len, bh);
    ctx.fillStyle = col; ctx.strokeStyle = col; tri(ctx, xe + (r.above ? 8 : -8), y, 5, r.above, r.above);      // ▲ filled above, ▽ hollow below: direction never by colour alone
    ctx.globalAlpha = fade; ctx.fillStyle = sel === r.key ? C.tx : C.tx2; ctx.font = sel === r.key ? F13 : F12; ctx.textAlign = 'right'; ctx.fillText(r.label, x0 - 10, y);
    ctx.textAlign = 'left'; ctx.fillStyle = C.tx; ctx.font = F11; ctx.fillText(compact ? pct(r.dist) : `${pct(r.dist)}${r.units != null ? `  ·  ${Math.abs(r.units).toFixed(1)}× usual range` : ''}`, x1 + 14, y);
    g.hit(r.key, gut + labW / 2, y);
  }
  // the key and the as-of
  ctx.globalAlpha = fade * 0.8; ctx.fillStyle = C.tx2; ctx.font = F10; ctx.textAlign = 'left';
  const cap = latestCapture(rows); ctx.fillText(`${cap ? `OI capture ${cap}` : 'OI capture date unknown'}${S.f.noFlip.length ? ` · no flip near spot: ${S.f.noFlip.join(', ')}` : ''}`, gut, bot + 34);
  ctx.fillText(compact ? KEY_PH : KEY, gut, bot + 50);
  ctx.restore();
}

const view = {
  id: 'flipmap', label: 'FLIP MAP', env: { accent: 'blue2' },
  onEnter: api => { Object.assign(api.st, { spin: false }); loadFlip(api); },
  headline: () => (S.f ? flipHeadline(S.f) : null),
  draw,
};

registerJarvisModule({
  id: 'flipmap', label: 'FLIP MAP', views: [view],
  async render(pane, api) {
    pane.innerHTML = '<h3>FLIP MAP</h3><p>Reading the option books…</p>';
    const f = await loadFlip(api); if (!pane.isConnected) return;
    if (!f?.rows?.length) { pane.innerHTML = '<h3>FLIP MAP</h3><p>No market has a gamma flip near spot in the last open interest capture.</p>'; return; }
    const h = flipHeadline(f), esc = api.esc;
    pane.innerHTML = `<h3>FLIP MAP · ${esc(h.hero.toUpperCase())}</h3><p>How far spot sits from each market's gamma flip, in % of spot. Above the flip the data puts dealers net long gamma (their hedging tends to damp moves); below it, net short gamma (moves tend to be amplified). ${esc(h.asOf ?? '')}.</p><table>${f.rows.map(r => `<tr><td>${r.above ? '▲' : '▽'} ${esc(r.label)}</td><td class="${r.above ? '' : 'jv-dn'}">${esc(pct(r.dist))}${r.units != null ? ` · ${Math.abs(r.units).toFixed(1)}× usual range` : ''}</td></tr>`).join('')}</table><p class="jv-sub">Positioning from a nightly capture: a description, not a forecast.</p>`;
  },
});
