// js/terminal/jarvisModMarkets.js: the MARKETS panel and globe layer. The desk's other markets as small ring-and-dot markers sized by today's move against the market's own usual move.
// Feed: /api/vol-forecast/live (fails soft). DESCRIPTION ONLY: no forecast, no trade.
import { registerJarvisModule } from './jarvisModules.js';
import { llToVec } from './jarvisCore.js';
import { MARKET_GEO, marketSizes, rankMarkets, marketLabel, moveText } from './jarvisMarkets.js';

const FEED = '/api/vol-forecast/live', LS = 'jarvis.markets.layer', REFRESH_MS = 120_000;
const S = { sizes: null, at: 0, loading: false, failed: false, sel: null, on: true };
try { S.on = globalThis.localStorage?.getItem(LS) !== 'off'; } catch (e) { /* storage blocked: layer stays on */ }
const save = () => { try { globalThis.localStorage?.setItem(LS, S.on ? 'on' : 'off'); } catch (e) { /* ignore */ } };

async function load(api) {
  if (S.loading || (S.sizes && Date.now() - S.at < REFRESH_MS) || (S.failed && Date.now() - S.at < 30_000)) return;
  S.loading = true;
  try {
    const sz = marketSizes(await api.jf(FEED));
    if (Object.keys(sz).length) { S.sizes = sz; S.failed = false; } else S.failed = !S.sizes;
  } catch (e) { S.failed = !S.sizes; } finally { S.loading = false; S.at = Date.now(); }
}

function drawGlobe(ctx, g, api) {
  if (!S.on) return;
  load(api);
  if (!S.sizes) return;
  const C = api.colours(), tone = t => (t === 'up' ? C.up : t === 'dn' ? C.dn : C.tx2);
  const ranked = rankMarkets(S.sizes), top = new Set(ranked.slice(0, 4).filter(r => r.tone !== 'quiet').map(r => r.key));
  ctx.save(); ctx.font = '10px ui-monospace,monospace'; ctx.textBaseline = 'middle';
  for (const [k, s] of Object.entries(S.sizes)) {
    const geo = MARKET_GEO[k]; if (!geo) continue;
    const p = g.P(llToVec(geo[0], geo[1]), 0.01); if (p.z <= 0.05) continue;
    const r = 2 + s.size * 4, a = Math.min(1, p.z * 2.2) * g.fade * (s.tone === 'quiet' ? 0.55 : 0.95), c = tone(s.tone), sel = S.sel === k;
    ctx.globalAlpha = a; ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = sel ? 2 : 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, r + 2, 0, 6.2832); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.2, r * 0.45), 0, 6.2832); ctx.fill();
    if (sel || top.has(k) || g.zoom > 1.7) { ctx.fillStyle = C.tx; ctx.globalAlpha = a; ctx.fillText(`${marketLabel(k)} ${s.move >= 0 ? '+' : ''}${s.move.toFixed(1)}%`, p.x + r + 5, p.y); }
  }
  ctx.restore();
}

function render(pane, api) {
  try {
    const esc = api.esc;
    pane.innerHTML = '<h3>MARKETS</h3><div class="jv-row"><button type="button" data-mk="layer" aria-pressed="' + S.on + '">LAYER ' + (S.on ? 'ON' : 'OFF') + '</button><span class="jv-sub" data-mk="st"></span></div><div data-mk="list"></div>'
      + '<p class="jv-sub">Size = today\'s move from the open against the market\'s usual open-to-close move. Green up, red down, grey quiet. A description of today, not a forecast.</p>';
    const list = pane.querySelector('[data-mk="list"]'), st = pane.querySelector('[data-mk="st"]');
    const draw = () => {
      if (!S.sizes) { list.innerHTML = S.failed ? '<p>The market moves are not available right now (the live session feed did not answer).</p>' : '<p>Reading the markets...</p>'; return; }
      const rows = rankMarkets(S.sizes);
      st.textContent = `${rows.length} markets`;
      list.innerHTML = rows.map(r => `<button type="button" class="jv-item" data-k="${esc(r.key)}" aria-pressed="${S.sel === r.key}"><b class="${r.tone === 'up' ? 'jv-up' : r.tone === 'dn' ? 'jv-dn' : ''}">${esc(marketLabel(r.key))}</b> <span class="jv-sub">${esc(moveText(r))} · ${esc(MARKET_GEO[r.key]?.[2] ?? '')}</span></button>`).join('');
    };
    draw();
    if (!S.sizes) load(api).then(() => { if (pane.isConnected) draw(); });
    pane.onclick = e => {
      const lay = e.target.closest('[data-mk="layer"]');
      if (lay) { S.on = !S.on; save(); lay.setAttribute('aria-pressed', String(S.on)); lay.textContent = 'LAYER ' + (S.on ? 'ON' : 'OFF'); api.blip(600, 0.05); return; }
      const b = e.target.closest('button[data-k]'); if (!b) return;
      const geo = MARKET_GEO[b.dataset.k]; if (!geo) return;
      S.sel = b.dataset.k; const gl = api.st.gl; gl.tlat = geo[0]; gl.tlon = geo[1]; gl.tzoom = Math.max(gl.tzoom, 2.4); api.st.spin = false; api.blip(700, 0.05); draw();
    };
  } catch (e) { try { pane.innerHTML = '<p>The markets panel could not load.</p>'; } catch (e2) { /* nothing */ } }
}

registerJarvisModule({ id: 'markets', label: 'MARKETS', render, drawGlobe });
