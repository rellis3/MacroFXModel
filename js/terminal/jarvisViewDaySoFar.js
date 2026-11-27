// js/terminal/jarvisViewDaySoFar.js: Helix's THE DAY SO FAR (view id 'dayso'): one market's London day, 00:00 to 24:00, as a strip of 96 quarter-hours.
// ENCODING: each quarter-hour is a bar from the centre line, its height the close-minus-open of that 15-minute candle in % of the day's first open. Up bars are FILLED (up colour) above the
// line, down bars are HOLLOW outlines (down colour) below it, so direction always has a shape cue. Over the strip stand the day's scheduled releases as pylons (taller = more important,
// labels in up to three lanes), the Asia / London / New York opens as faint ticks and a white "now" line. The market is the HUD's selection, else the biggest mover against its usual move.
// Data: /api/cog-chart/candles (15m, the CHART view's source), /api/vol-forecast/live (to pick the loudest), and the DAY AHEAD view's release loader (jarvisViewDayAhead.js loadDay).
// Maths: jarvisNewViewsCore.js (tested). DESCRIPTION ONLY: what the day has done so far, never a forecast.
import { registerJarvisModule } from './jarvisModules.js';
import { marketName } from './jarvisNames.js';
import { MARKET_KEYS } from './jarvisMarkets.js';
import { intradayAsset, pickMarket } from './jarvisSessionCore.js';
import { loadDay } from './jarvisViewDayAhead.js';
import { bucketDay, slotScale, placePylons, dayHeadline, londonClock, SLOTS } from './jarvisNewViewsCore.js';

const TTL = 60_000, KEYS = MARKET_KEYS.filter(k => intradayAsset(k));
const S = { key: null, b: null, scale: 0.02, at: 0, busy: null, err: false, events: [], pyl: null, pylW: 0, pylX: 0, inst: null };
const F10 = '10px ui-monospace,monospace', F11 = '11px ui-monospace,monospace', F13 = '600 13px ui-monospace,monospace';
const KEY = 'one bar per 15 minutes, London time · filled up = closed higher, hollow down = closed lower, in % of the day\'s first open · pylons = scheduled releases · a description, not a forecast';
const KEY_PH = '15-min bars · filled = up, hollow = down · pylons = releases · not a forecast';
const OPENS = [[0, 'ASIA'], [480, 'LONDON'], [870, 'NEW YORK']];

const chosen = api => { const s = api.st?.sel; return KEYS.includes(s) ? s : S.key ?? pickMarket(null, S.inst ?? {}, KEYS) ?? 'NQ'; };

export async function loadDaySoFar(api, key = null, force = false) {
  if (S.busy) return S.busy;
  const k = key ?? chosen(api); if (S.b && !force && k === S.key && Date.now() - S.at < TTL) return S.b;
  S.busy = (async () => {
    try { if (!S.inst) { const v = await api.jf('/api/vol-forecast/live'); S.inst = v?.instruments ?? null; } } catch (e) { /* the default market is NQ */ }
    const kk = key ?? chosen(api), asset = intradayAsset(kk);
    const [bars, day] = await Promise.all([
      asset ? Promise.resolve().then(() => api.jf(`/api/cog-chart/candles?asset=${asset}&tf=15m&count=200`)).catch(() => null) : null,
      Promise.resolve().then(() => loadDay(api)).catch(() => null)]);
    if (bars?.ok && Array.isArray(bars.candles)) { S.b = bucketDay(bars.candles); S.scale = slotScale(S.b.move); S.key = kk; S.err = false; }
    else { S.err = true; S.key = kk; S.b = null; }
    S.events = Array.isArray(day?.events) ? day.events : []; S.pyl = null;
    S.at = Date.now(); S.busy = null; return S.b;
  })();
  return S.busy;
}

function draw(ctx, g, api) {
  const { W, H, C, fade, compact } = g; ctx.save(); ctx.textBaseline = 'middle';
  const want = chosen(api); if (!S.busy && (want !== S.key || Date.now() - S.at > TTL)) loadDaySoFar(api, want);
  const b = S.b;
  if (!b?.n) { ctx.globalAlpha = fade; ctx.fillStyle = C.tx2; ctx.font = F13; ctx.textAlign = 'center'; ctx.fillText(S.err ? `No 15-minute bars for ${marketName(S.key ?? want, { short: true })} right now.` : b ? 'No bars yet since London midnight.' : 'Reading the day...', W / 2, H / 2); ctx.restore(); return; }
  const gut = compact ? 16 : 40, x0 = gut, w = W - gut * 2, mid = H * (compact ? 0.56 : 0.58), amp = Math.min(H * 0.2, 150), slotW = w / SLOTS;
  if (!S.pyl || S.pylW !== w || S.pylX !== x0) { S.pyl = placePylons(S.events, x0, w, { gap: compact ? 90 : 120, minRank: compact ? 3 : 2 }); S.pylW = w; S.pylX = x0; }      // laid out once per size, not per frame
  // the hour grid and the session opens
  ctx.font = F10; ctx.lineWidth = 1;
  for (let h = 0; h <= 24; h += compact ? 6 : 3) { const x = x0 + h / 24 * w; ctx.globalAlpha = fade * 0.2; ctx.strokeStyle = C.tx2; ctx.beginPath(); ctx.moveTo(x, mid - amp - 6); ctx.lineTo(x, mid + amp + 6); ctx.stroke(); ctx.globalAlpha = fade * 0.75; ctx.fillStyle = C.tx2; ctx.textAlign = 'center'; ctx.fillText(`${String(h % 24).padStart(2, '0')}:00`, x, mid + amp + 18); }
  if (!compact) for (const [m, l] of OPENS) { const x = x0 + m / 1440 * w; ctx.globalAlpha = fade * 0.55; ctx.fillStyle = C.tx2; ctx.textAlign = 'left'; ctx.fillText(l, x + 3, mid + amp + 32); }
  ctx.globalAlpha = fade * 0.6; ctx.strokeStyle = C.tx2; ctx.beginPath(); ctx.moveTo(x0, mid); ctx.lineTo(x0 + w, mid); ctx.stroke();
  // the bars: filled up, hollow down
  const bw = Math.max(1, slotW * 0.72);
  for (let i = 0; i < SLOTS; i++) {
    const v = b.move[i]; if (!Number.isFinite(v) || v === 0) continue;
    const hgt = Math.max(1, Math.min(1, Math.abs(v) / S.scale) * amp), x = x0 + i * slotW + (slotW - bw) / 2;
    if (v > 0) { ctx.globalAlpha = fade * 0.9; ctx.fillStyle = C.up; ctx.fillRect(x, mid - hgt, bw, hgt); }
    else { ctx.globalAlpha = fade * 0.95; ctx.strokeStyle = C.dn; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, mid + 0.5, Math.max(1, bw - 1), hgt - 1); }
  }
  ctx.globalAlpha = fade * 0.7; ctx.fillStyle = C.tx2; ctx.textAlign = 'right'; ctx.fillText(`+${S.scale.toFixed(2)}%`, x0 + w, mid - amp - 10); ctx.fillText(`−${S.scale.toFixed(2)}%`, x0 + w, mid + amp + 4);
  // the releases: pylons over the strip
  for (const p of S.pyl) {
    const ph = 20 + p.rank * 14, yTop = mid - amp - 18 - ph - p.lane * 16;
    ctx.globalAlpha = fade * 0.7; ctx.strokeStyle = C.tx; ctx.lineWidth = p.rank >= 3 ? 1.6 : 1; ctx.beginPath(); ctx.moveTo(p.x, mid - amp - 10); ctx.lineTo(p.x, yTop); ctx.stroke();
    ctx.globalAlpha = fade; ctx.fillStyle = C.tx; ctx.beginPath(); ctx.arc(p.x, yTop, p.rank >= 3 ? 3.5 : 2.5, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = fade * 0.9; ctx.font = F10; ctx.textAlign = 'left'; ctx.fillText(p.label, p.x + 5, yTop);
  }
  // now
  const now = londonClock(Date.now()); if (now.date === b.date) { const x = x0 + now.mins / 1440 * w; ctx.globalAlpha = fade; ctx.strokeStyle = C.tx; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, mid - amp - 8); ctx.lineTo(x, mid + amp + 8); ctx.stroke(); ctx.font = F10; ctx.textAlign = 'center'; ctx.fillStyle = C.tx; ctx.fillText('NOW', x, mid + amp + 44); }
  // the title line, the selector buttons and the key
  ctx.globalAlpha = fade; ctx.font = F11; ctx.textAlign = 'left'; ctx.fillStyle = C.tx;
  ctx.fillText(`${marketName(S.key, { short: true })} · London ${b.date}`, x0, mid - amp - 130);
  if (!compact) { ctx.fillStyle = C.tx2; ctx.fillText('◂ PREV    NEXT ▸', x0 + 260, mid - amp - 130); g.hit('ds:prev', x0 + 275, mid - amp - 130); g.hit('ds:next', x0 + 345, mid - amp - 130); }
  ctx.globalAlpha = fade * 0.8; ctx.fillStyle = C.tx2; ctx.font = F10; ctx.fillText(compact ? KEY_PH : KEY, x0, H - (compact ? 70 : 90));
  ctx.restore();
  const s = api.st?.sel; if (s === 'ds:prev' || s === 'ds:next') { const i = Math.max(0, KEYS.indexOf(S.key)), k = KEYS[(i + (s === 'ds:next' ? 1 : -1) + KEYS.length) % KEYS.length]; api.st.sel = k; api.blip?.(780, 0.05); }
}

const view = {
  id: 'dayso', label: 'THE DAY SO FAR', env: { accent: 'blue2' },
  onEnter: api => { Object.assign(api.st, { spin: false }); loadDaySoFar(api); },
  headline: () => (S.b?.n ? dayHeadline(S.b, marketName(S.key, { short: true })) : null),
  draw,
};

registerJarvisModule({
  id: 'dayso', label: 'THE DAY SO FAR', views: [view],
  async render(pane, api) {
    const esc = api.esc, cur = chosen(api);
    pane.innerHTML = `<h3>THE DAY SO FAR</h3><p>One market's London day in quarter-hours, with the scheduled releases over it. Filled bars closed higher, hollow bars lower.</p><div class="jv-row"><select data-ds="mk" aria-label="Market">${KEYS.map(k => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(marketName(k, { short: true }))}</option>`).join('')}</select></div><div data-ds="out" class="jv-sub">Reading…</div><p class="jv-sub">What the day has done, a description, not a forecast.</p>`;
    const out = pane.querySelector('[data-ds="out"]');
    const fill = async k => { const b = await loadDaySoFar(api, k, true); if (!pane.isConnected) return; const h = dayHeadline(b, marketName(k, { short: true })); out.textContent = h ? `${h.hero} · ${h.sub}` : 'No 15-minute bars for this market right now.'; };
    pane.querySelector('[data-ds="mk"]').onchange = e => { api.st.sel = e.target.value; fill(e.target.value); };
    fill(cur);
  },
});
