// js/terminal/jarvisViewSkew.js: Helix's SKEW view (view id 'skew'): each market's 25-delta risk reversal (RR) and butterfly (BF) from GET /api/options-skew (the laptop's IBKR pull,
// scripts/rates_line/refresh_options_skew.py, js/optionsSkew.js). One row per market, two strips: a thin bar is the last 20 daily prints' low-to-high, the dot is today, a tick marks zero;
// the text gives the value, its 20-print percentile and its 5-print change. Maths in jarvisSkewCore.js (tested).
// DESCRIPTION ONLY: what the options market is paying for. Evidence Book skew-fade (null at the lines) and positioning-flow-rr (underpowered as a direction lean); no colour for "good" or "bad".
import { registerJarvisModule } from './jarvisModules.js';
import { skewRows, skewHeadline, skewLine, pctWord, signed, SKEW_NOTE } from './jarvisSkewCore.js';

const TTL = 10 * 60_000;
const S = { rows: null, ageH: null, at: 0, busy: null, err: false };
const F10 = '10px ui-monospace,monospace', F11 = '11px ui-monospace,monospace', F12B = '600 12px ui-monospace,monospace', F13 = '600 13px ui-monospace,monospace';
const KEY = 'RR = 25-delta call vol minus put vol (vol points; + = calls dearer) · BF = the 25-delta wings over ATM · bar = last 20 daily prints, dot = today, tick = zero · a description, not a signal (Evidence Book skew-fade, positioning-flow-rr)';
const KEY_PH = 'RR = calls minus puts · BF = wings over ATM · bar = 20 prints, dot = today · a description';

export async function loadSkew(api, force = false) {
  if (S.busy) return S.busy; if (S.rows && !force && Date.now() - S.at < TTL) return S.rows;
  S.busy = (async () => {
    let j = null; try { j = await api.jf('/api/options-skew'); } catch (e) { j = null; }
    if (j?.ok) { S.rows = skewRows(j); S.ageH = j.ageH ?? null; S.err = false; } else S.err = !S.rows;
    S.at = Date.now(); S.busy = null; return S.rows;
  })();
  return S.busy;
}

/** One strip: the 20-print band, a zero tick, today's dot. */
function strip(ctx, C, fade, x, y, w, v, band) {
  if (v == null) return;
  const lo = Math.min(0, v, band?.[0] ?? v), hi = Math.max(0, v, band?.[1] ?? v), sp = hi - lo || 1, X = u => x + (u - lo) / sp * w;
  ctx.globalAlpha = fade * 0.25; ctx.fillStyle = C.tx2; ctx.fillRect(x, y - 1, w, 2);
  if (band) { ctx.globalAlpha = fade * 0.6; ctx.fillRect(X(band[0]), y - 3, Math.max(2, X(band[1]) - X(band[0])), 6); }
  ctx.globalAlpha = fade * 0.8; ctx.fillStyle = C.tx2; ctx.fillRect(X(0) - 0.5, y - 7, 1, 14);
  ctx.globalAlpha = fade; ctx.fillStyle = C.tx; ctx.beginPath(); ctx.arc(X(v), y, 4, 0, 6.2832); ctx.fill();
}

function draw(ctx, g, api) {
  const { W, H, C, fade, compact } = g; ctx.save(); ctx.textBaseline = 'middle';
  if (!S.busy && Date.now() - S.at > TTL) loadSkew(api);
  const rows = S.rows;
  if (!rows?.length) { ctx.globalAlpha = fade; ctx.fillStyle = C.tx2; ctx.font = F13; ctx.textAlign = 'center'; ctx.fillText(S.err ? 'The options skew pull is not available right now (it comes from the laptop\'s IBKR session).' : rows ? 'No market has a risk reversal yet.' : 'Reading the options skew...', W / 2, H / 2); ctx.restore(); return; }
  const gut = compact ? 14 : 40, top = compact ? 132 : 120, bot = H - (compact ? 90 : 80), rh = Math.max(compact ? 34 : 26, Math.min(44, (bot - top) / rows.length));
  const nameW = compact ? 0 : 170, colW = compact ? (W - gut * 2) / 2 - 8 : Math.min(360, (W - gut * 2 - nameW) / 2 - 16), x1 = gut + nameW, x2 = x1 + colW + 16, barW = Math.max(60, colW - (compact ? 10 : 170));
  ctx.font = F10; ctx.fillStyle = C.tx2; ctx.globalAlpha = fade * 0.85; ctx.textAlign = 'left';
  ctx.fillText('RISK REVERSAL 25Δ', x1, top - 16); ctx.fillText('BUTTERFLY 25Δ', x2, top - 16);
  if (S.ageH != null) { ctx.textAlign = 'right'; ctx.fillText(`IBKR pull ${S.ageH}h ago`, W - gut, top - 16); ctx.textAlign = 'left'; }
  rows.forEach((r, i) => {
    const y = top + i * rh + rh / 2; if (y > bot) return;
    const sel = api.st?.sel === `sk:${r.id}`;
    if (sel) { ctx.globalAlpha = fade * 0.12; ctx.fillStyle = C.tx; ctx.fillRect(gut - 6, y - rh / 2, W - gut * 2 + 12, rh); }
    const ny = compact ? y - 9 : y;
    ctx.globalAlpha = fade; ctx.fillStyle = C.tx; ctx.font = F12B; ctx.textAlign = 'left';
    if (compact) ctx.fillText(r.pair, gut, ny - 4); else ctx.fillText(r.label, gut, y);
    const sy = compact ? y + 6 : y;
    strip(ctx, C, fade, x1, sy, barW, r.rr, r.rrBand); strip(ctx, C, fade, x2, sy, barW, r.bf, r.bfBand);
    ctx.font = F11; ctx.fillStyle = C.tx; ctx.globalAlpha = fade * 0.95;
    const t = (v, p, c5) => `${signed(v)}${p != null ? ` · ${p}th` : ''}${!compact && c5 != null ? ` · 5p ${signed(c5)}` : ''}`;
    if (compact) { ctx.fillText(t(r.rr, r.rrPct, r.rrChg5), x1, ny - 4); ctx.fillText(t(r.bf, r.bfPct, r.bfChg5), x2, ny - 4); }
    else { ctx.fillText(t(r.rr, r.rrPct, r.rrChg5), x1 + barW + 12, y); ctx.fillText(t(r.bf, r.bfPct, r.bfChg5), x2 + barW + 12, y); }
    g.hit(`sk:${r.id}`, gut + 40, y);
  });
  const s = rows.find(r => api.st?.sel === `sk:${r.id}`);
  ctx.font = F10; ctx.fillStyle = C.tx2; ctx.globalAlpha = fade * 0.85; ctx.textAlign = 'left';
  if (s) ctx.fillText(skewLine(s), gut, bot + 22);
  ctx.fillText(compact ? KEY_PH : KEY, gut, bot + (s ? 40 : 30));
  ctx.restore();
}

const view = {
  id: 'skew', label: 'SKEW', env: { accent: 'pur' },
  onEnter: api => { Object.assign(api.st, { spin: false }); loadSkew(api); },
  headline: () => (S.rows?.length ? skewHeadline(S.rows, S.ageH) : null),
  draw,
};

registerJarvisModule({
  id: 'skew', label: 'SKEW', views: [view],
  async render(pane, api) {
    pane.innerHTML = '<h3>OPTIONS SKEW</h3><p>Reading the options skew…</p>';
    const rows = await loadSkew(api); if (!pane.isConnected) return;
    if (!rows?.length) { pane.innerHTML = '<h3>OPTIONS SKEW</h3><p>The options skew pull has nothing to show right now (it comes from the laptop\'s IBKR session).</p>'; return; }
    const esc = api.esc;
    pane.innerHTML = `<h3>OPTIONS SKEW · 25Δ RR AND BF</h3><p>Each market's 25-delta risk reversal (call vol minus put vol) and butterfly (the wings over ATM), with where today sits among the last 20 daily prints.${S.ageH != null ? ` IBKR pull ${esc(String(S.ageH))}h ago.` : ''}</p><table>${rows.map(r => `<tr><td>${esc(r.label)}</td><td>RR ${esc(signed(r.rr))} · ${esc(pctWord(r.rrPct))}</td><td>BF ${esc(signed(r.bf))} · ${esc(pctWord(r.bfPct))}</td></tr>`).join('')}</table><p class="jv-sub">${esc(SKEW_NOTE)}</p>`;
  },
});
