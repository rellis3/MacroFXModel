// js/terminal/jarvisViewG10.js: Helix's G10 RATES + FUNDING view (plans/HELIX_IMPROVEMENTS.md 1.12, 3.6; plans/DATA_CAPTURE_G10.md phase 5). A 2D board in two halves:
//   G10 RATES: each currency's short and long government yield, the short-end gap to the US 2y (bp), its 20-session change with ▲/▼, and a bar for that change's z-score against the
//              previous year's 20-session changes (the bar is grey inside ±2σ, gold beyond). Currencies with no captured curve keep their row and say why.
//   FUNDING:   SOFR 99th percentile − IORB, SOFR − IORB, SOFR − TGCR (bp, with where today sits in the last 250 sessions), reverse repo, reserves, the TGA, money-fund repo with the Fed,
//              the last 2y / 10y / 30y auctions (bid-to-cover percentile vs the last 12 of that tenor), and the calendar note (month-end, mid-month settlement and tax dates).
// Data: /api/g10-rates and /api/funding-board (js/helixRoutes.js, from the R2 archive). The maths is in js/helixData.js; the formatting in jarvisG10Core.js.
// DESCRIPTION ONLY. The gap to the US is context (deskEvidence nonus-yield-gap-label); its direction and range tests are NULL. Funding readings tested NULL as stress signals (funding-stress).
import { registerJarvisModule } from './jarvisModules.js';
import { g10Rows, fundingRows, auctionRows, g10Brief, zTxt } from './jarvisG10Core.js';
import { asOfInfo, drawAsOf } from './helixAsOf.js';
import { keyLine } from './jarvisViewGammaPillar.js';

const ID = 'g10', TTL = 30 * 60_000;
const S = { rates: null, fund: null, rInfo: null, fInfo: null, at: 0, busy: null, tab: 'rates' };
const KEY = 'gap = short-end yield minus the US 2y · ▲/▼ = 20-session change · bar = that change in σ of its own past year (gold beyond ±2σ) · context for the day, not a read on the next session · funding levels are plumbing, not stress signals';
const KEY_PH = 'gap = short yield − US 2y · bar = 20-session change in σ · context, not a forecast · funding = plumbing, not a signal';

/** Load both boards once per 30 minutes (each route caches an hour on the server). Never throws. */
export function loadG10(api, force) {
  if (S.busy) return S.busy; if (S.rates && !force && Date.now() - S.at < TTL) return Promise.resolve(S);
  S.busy = (async () => {
    const ld = u => (api.jf.load ? api.jf.load(u) : api.jf(u).then(data => ({ data, asOf: data?.asOf ?? null, stale: false }), e => ({ data: null, asOf: null, stale: true, error: e.message })));
    const [r, f] = await Promise.all([ld('/api/g10-rates'), ld('/api/funding-board')]);
    if (r?.data?.rows) { S.rates = r.data; S.rInfo = asOfInfo({ asOf: r.data.asOf ?? r.asOf, stale: r.stale || (r.data.degraded?.length ?? 0) > 3 }, { maxAgeMs: 5 * 864e5 }); }
    if (f?.data?.items) { S.fund = f.data; S.fInfo = asOfInfo({ asOf: f.data.asOf ?? f.asOf, stale: f.stale }, { maxAgeMs: 5 * 864e5 }); }
    S.at = Date.now(); S.busy = null; return S;
  })();
  return S.busy;
}

function draw(ctx, g, api) {
  const { W, H, C, fade } = g, cp = g.compact, st = api.st, mono = px => `${px}px ${g.mono ?? 'ui-monospace,monospace'}`;
  if (typeof st.sel === 'string' && st.sel.startsWith('g10:')) { S.tab = st.sel.slice(4); st.sel = null; api.blip?.(780, 0.05); }
  if (!S.rates && !S.fund) { loadG10(api); ctx.save(); ctx.globalAlpha = fade; ctx.fillStyle = C.tx2; ctx.font = mono(13); ctx.textAlign = 'center'; ctx.fillText(S.at ? 'The G10 rates and funding boards could not be loaded right now.' : 'Reading the G10 curves and the funding plumbing...', W / 2, H / 2); ctx.restore(); return; }
  if (Date.now() - S.at > TTL) loadG10(api);
  ctx.save(); ctx.globalAlpha = fade; ctx.textBaseline = 'alphabetic';
  const top = cp ? 112 : 104, both = !cp && W >= 1100, colW = both ? (W - 72) / 2 : W - 40;
  if (!both) {   // phone / narrow: one half at a time, two tabs
    ctx.font = mono(11); ctx.textAlign = 'center';
    [['rates', 'G10 RATES'], ['funding', 'FUNDING']].forEach(([k, label], i) => {
      const x = W / 2 + (i ? 62 : -62), y = top - 30, on = S.tab === k; ctx.globalAlpha = fade * 0.85; ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - 56, y - 12, 112, 22);
      ctx.strokeStyle = on ? C.blue : C.tx2; ctx.globalAlpha = fade * (on ? 0.95 : 0.5); ctx.strokeRect(x - 55.5, y - 11.5, 111, 21); ctx.fillStyle = on ? C.tx : C.tx2; ctx.globalAlpha = fade; ctx.fillText(label, x, y + 4); g.hit?.(`g10:${k}`, x, y);
    });
    ctx.textAlign = 'left';
  }
  if (both || S.tab === 'rates') ratesPanel(ctx, g, 20, top, colW, mono);
  if (both || S.tab === 'funding') fundingPanel(ctx, g, both ? 52 + colW : 20, top, colW, mono);
  ctx.globalAlpha = fade; keyLine(ctx, g, cp ? KEY_PH : KEY);
  ctx.restore();
}

function ratesPanel(ctx, g, x, y, w, mono) {
  const { C, fade, compact: cp } = g, rows = g10Rows(S.rates);
  ctx.font = mono(11); ctx.fillStyle = C.tx2; ctx.fillText('G10 RATES · short and long yield, short-end gap to the US 2y', x, y);
  if (S.rInfo) drawAsOf(ctx, g, S.rInfo, { x: x + w, y, align: 'right' });
  const cols = cp ? [0, 44, 0, 128, 0] : [0, 50, 150, 250, 340], rh = cp ? 26 : 24; let yy = y + 26;
  ctx.font = mono(10); ctx.fillStyle = C.tx2; ['', 'SHORT', cp ? '' : 'LONG', 'GAP vs US', cp ? '' : '20-SESSION CHANGE'].forEach((h, i) => { if (h) ctx.fillText(h, x + cols[i], yy); }); yy += 16;
  for (const r of rows) {
    ctx.globalAlpha = fade * (r.missing ? 0.45 : r.stale ? 0.7 : 1); ctx.font = mono(cp ? 12 : 13); ctx.fillStyle = C.tx; ctx.fillText(r.ccy, x, yy);
    if (r.missing) { ctx.font = mono(10); ctx.fillStyle = C.tx2; ctx.fillText(r.note ?? 'no curve captured', x + cols[1], yy); yy += rh; continue; }
    ctx.font = mono(cp ? 11 : 12); ctx.fillStyle = C.tx; ctx.fillText(r.short, x + cols[1], yy); if (!cp) ctx.fillText(r.long, x + cols[2], yy);
    ctx.fillStyle = r.ccy === 'USD' ? C.tx2 : C.tx; ctx.fillText(r.gap, x + cols[3], yy);
    if (r.ccy !== 'USD') {
      const cx = cp ? x + cols[3] + 64 : x + cols[4], tone = r.gapArrow === '▲' ? C.up : r.gapArrow === '▼' ? C.dn : C.tx2;
      ctx.fillStyle = tone; ctx.fillText(`${r.gapArrow} ${r.gapChg}`, cx, yy);
      const bx = cx + (cp ? 72 : 96), bw = Math.max(40, Math.min(150, w - (bx - x) - 60)), mid = bx + bw / 2, z = r.gapZ;
      ctx.globalAlpha = fade * 0.35; ctx.fillStyle = C.tx2; ctx.fillRect(bx, yy - 5, bw, 1); ctx.fillRect(mid, yy - 9, 1, 9);
      if (Number.isFinite(z)) { const len = Math.max(-1, Math.min(1, z / 3)) * bw / 2; ctx.globalAlpha = fade * 0.9; ctx.fillStyle = Math.abs(z) >= 2 ? C.gold : C.tx2; ctx.fillRect(Math.min(mid, mid + len), yy - 8, Math.abs(len), 6); ctx.globalAlpha = fade; ctx.font = mono(10); ctx.fillStyle = C.tx2; ctx.fillText(zTxt(z), bx + bw + 6, yy); }
    }
    if (r.note && !cp) { ctx.globalAlpha = fade * 0.6; ctx.font = mono(9); ctx.fillStyle = C.tx2; ctx.fillText(r.note, x + cols[1], yy + 11); }
    yy += rh;
  }
  ctx.globalAlpha = fade * 0.8; ctx.font = mono(10); ctx.fillStyle = C.gold; ctx.fillText('Context, not a signal: the gap explains the day it moves on, not the next session.', x, yy + 6);
}

function fundingPanel(ctx, g, x, y, w, mono) {
  const { C, fade, compact: cp } = g, f = S.fund; ctx.globalAlpha = fade;
  ctx.font = mono(11); ctx.fillStyle = C.tx2; ctx.fillText('FUNDING · US money-market plumbing', x, y);
  if (S.fInfo) drawAsOf(ctx, g, S.fInfo, { x: x + w, y, align: 'right' });
  if (!f) { ctx.fillText('The funding board is not available right now.', x, y + 30); return; }
  let yy = y + 30; const vx = x + (cp ? Math.min(210, w * 0.55) : 300), cx = vx + (cp ? 90 : 110);
  for (const r of fundingRows(f)) {
    ctx.globalAlpha = fade * (r.stale ? 0.6 : 1); ctx.font = mono(cp ? 10 : 11); ctx.fillStyle = C.tx2; ctx.fillText(cp ? r.label.replace(/\s*\(.*\)$/, '').slice(0, 30) : r.label, x, yy);
    ctx.font = mono(cp ? 11 : 12); ctx.fillStyle = C.tx; ctx.fillText(r.value, vx, yy); ctx.font = mono(10); ctx.fillStyle = C.tx2; if (r.ctx && w > 420) ctx.fillText(r.ctx, cx, yy);
    yy += cp ? 20 : 21;
  }
  yy += 8; ctx.globalAlpha = fade; ctx.font = mono(10); ctx.fillStyle = C.tx2; ctx.fillText('LAST AUCTIONS', x, yy); yy += 16;
  for (const a of auctionRows(f)) { ctx.font = mono(cp ? 9 : 10); ctx.fillStyle = C.tx; yy = wrap(ctx, a.line, x, yy, w, cp ? 13 : 14); }
  yy += 8; ctx.fillStyle = C.blue; ctx.font = mono(10); ctx.fillText('CALENDAR', x, yy); yy += 15; ctx.fillStyle = C.tx2; yy = wrap(ctx, f.calendar?.text ?? '', x, yy, w, 14);
  ctx.globalAlpha = fade * 0.8; ctx.fillStyle = C.gold; wrap(ctx, 'Plumbing, not a stress signal: SOFR above the floor tested NULL as a warning (month-end dressing, mid-month tax and settlement).', x, yy + 6, w, 14);
}
function wrap(ctx, text, x, y, w, lh) { let line = ''; for (const word of String(text).split(' ')) { const t = line ? `${line} ${word}` : word; if (ctx.measureText(t).width > w && line) { ctx.fillText(line, x, y); y += lh; line = word; } else line = t; } if (line) { ctx.fillText(line, x, y); y += lh; } return y; }

registerJarvisModule({
  id: ID, label: 'G10 RATES',
  render(pane, api) {
    pane.innerHTML = `<h3>G10 RATES + FUNDING</h3><p>Each G10 currency's short and long government yield and the short-end gap to the US 2 year, with how far that gap moved over 20 sessions against its own past year. Beside it, the US funding plumbing: SOFR against the Fed's floor, reverse repo, reserves, the Treasury's cash, money-fund repo with the Fed, and the last 2y, 10y and 30y auctions, with a calendar note.</p>
<div class="jv-row"><button type="button" data-g10="go">▶ OPEN THE BOARD</button></div><p class="jv-sub" data-g10="brief">Reading...</p><p class="jv-sub">Description only. The gap to the US is context for the day it moves on (its direction and range tests are null); funding levels are not stress signals (tested null).</p>`;
    pane.querySelector('[data-g10="go"]').onclick = () => { api.setView(ID); loadG10(api, true); };
    loadG10(api).then(() => { const e = pane.querySelector('[data-g10="brief"]'); if (e) e.textContent = (S.rates || S.fund) ? g10Brief(S.rates, S.fund) || 'No G10 rows yet: the archive starts with the first macro capture run.' : 'The boards could not be loaded right now.'; }).catch(() => null);
  },
  views: [{ id: ID, label: 'G10 RATES', env: { accent: 'blue', chrome: 'clean', scan: false }, draw, onEnter: api => { loadG10(api); } }],
});
