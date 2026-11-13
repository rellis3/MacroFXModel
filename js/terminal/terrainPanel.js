/**
 * The terrain panel on the Desk Terminal's Options tab: the same chart OI Lab draws (js/terrainChart.js), for the market
 * picked, with the expiry window (<=3 days, <=30 days, whole book). Reads /api/oi-store (the stored OI entries) and, for
 * SPX / NDX / RUT, the live Cboe chain for the smile. Display only; it never changes a level.
 * Greeks stay in OI Lab: this panel is the one picture, not the whole instrument panel (link below the chart).
 */
import { drawTerrain, terrainSmiles, SMILE_SYMS } from '../terrainChart.js';
import { ownerLink, ownerOnly } from './links.js';

const NAMES = { 'XAU/USD': 'Gold', NAS100_USD: 'Nasdaq (NQ)', SPX500_USD: 'S&P 500 (ES)', US2000_USD: 'Russell (RTY)', US30_USD: 'Dow (YM)', 'EUR/USD': 'EURUSD', 'GBP/USD': 'GBPUSD',
  'USD/JPY': 'USDJPY', 'AUD/USD': 'AUDUSD', 'USD/CAD': 'USDCAD', 'USD/CHF': 'USDCHF', 'XAG/USD': 'Silver', 'XCU/USD': 'Copper', WTICO_USD: 'WTI', BCO_USD: 'Brent', NATGAS_USD: 'Nat gas' };
const fmtBig = v => { const a = Math.abs(v), sg = v < 0 ? '−' : ''; return a >= 1e9 ? sg + (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? sg + (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? sg + (a / 1e3).toFixed(1) + 'K' : sg + a.toFixed(a < 10 ? 2 : 0); };
const pxFor = sym => { const d = /JPY/.test(sym) ? 3 : /USD$|EUR|GBP|AUD|CAD|CHF/.test(sym) && !/XAU|NAS|SPX|US30|US2000/.test(sym) ? 5 : 1;
  return v => Number.isFinite(v) ? (Math.abs(v) >= 1000 ? v.toFixed(1) : Math.abs(v) >= 100 ? v.toFixed(2) : v.toFixed(d >= 5 ? 5 : 3)) : '—'; };

export function terrainHtml() {
  return `<div class="card" id="tr-card" style="padding:14px 14px 10px">
<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:6px">
<b id="tr-name" style="font-size:13px"></b>
<span id="tr-exp" class="tt-pills" style="margin-left:auto">${[[3, '≤3 DTE (daily)'], [30, '≤30 DTE'], [400, 'whole book']].map(([d, t], i) => `<button type="button" data-d="${d}" aria-pressed="${i ? 'false' : 'true'}">${t}</button>`).join('')}</span></div>
<div class="muted" style="font-size:12.5px;margin-bottom:6px">Centre: open interest by strike, <span style="color:#6fb6ff">calls</span> right, <span style="color:#f0b04a">puts</span> left. Outer panels: one line per expiry. On SPX, NDX and RUT they are the live Cboe <b>IV smile</b> (vol points above or below the at-the-money vol; every line meets at spot). On other markets, where CME gives one vol per expiry, they are gamma by strike. The price range is about one day's plausible move; <b>≤3 DTE</b> keeps only the expiries that can matter today.</div>
<canvas id="tr-cv" style="width:100%;height:760px;display:block;border-radius:8px;background:#090e13"></canvas>
<div class="muted" id="tr-leg" style="font-size:12px;margin-top:8px"></div>
${ownerOnly(`<div class="muted" style="font-size:12px;margin-top:6px">All the greeks (vanna, charm, vega, delta flow) for this market are in ${ownerLink('oi-dashboard-v2.html', 'OI Lab', { id: 'tr-lab' })}.</div>`)}</div>`;
}

let STORE = null, STORE_AT = 0, TIP = null;
const SMILE = {};
async function loadStore(J) {
  if (STORE && Date.now() - STORE_AT < 180_000) return STORE;
  const j = await (await fetch('/api/oi-store?cmdty=1', { cache: 'no-store' })).json(); STORE = j?.data ?? j ?? {}; STORE_AT = Date.now(); return STORE;
}
async function loadSmile(sym, redraw) {
  const hit = SMILE[sym]; if (hit && (hit.state === 'loading' || Date.now() - hit.at < 300_000)) return hit;
  SMILE[sym] = { state: 'loading', at: Date.now() };
  try { const r = await fetch(`/api/cboe-contracts?pair=${encodeURIComponent(sym)}&maxDte=45&window=0.08`); const j = await r.json(); if (!j.ok) throw new Error(j.error || 'Cboe unavailable'); SMILE[sym] = { state: 'ok', at: Date.now(), curves: terrainSmiles(j) }; }
  catch (e) { SMILE[sym] = { state: 'err', at: Date.now(), err: e.message }; }
  redraw(); return SMILE[sym];
}
const showTip = (ev, html) => { TIP ??= Object.assign(document.createElement('div'), { style: 'position:fixed;z-index:50;background:var(--bg1);border:1px solid var(--line2);border-radius:6px;padding:6px 9px;font:12px ui-monospace,Consolas,monospace;color:var(--tx);pointer-events:none' }); if (!TIP.isConnected) document.body.appendChild(TIP);
  TIP.innerHTML = html; TIP.style.display = 'block'; TIP.style.left = Math.min(innerWidth - TIP.offsetWidth - 10, ev.clientX + 16) + 'px'; TIP.style.top = Math.min(innerHeight - TIP.offsetHeight - 10, ev.clientY + 14) + 'px'; };
const hideTip = () => { if (TIP) TIP.style.display = 'none'; };

/** The stored open interest's market keys (OANDA style: 'XAU/USD', 'NAS100_USD'), for the tab's one market list. */
export async function terrainKeys(J) {
  const store = await loadStore(J).catch(() => ({}));
  return Object.keys(store).filter(k => store[k] && store[k].spot > 0);
}

/**
 * Fill the panel (terrainHtml() must already be in the DOM under `root`) for the tab's market. The market is chosen
 * once for the whole Options tab (owner 2026-11-10), so this panel has no picker of its own: state.id is the
 * terminal's market id (GOLD, NQ, EURUSD) and idOf maps a stored key to it. A market with no stored book says so
 * rather than showing another one. state = the session object the caller keeps.
 */
export async function mountTerrain(root, J, state = {}, { idOf = k => k, nameOf = id => id } = {}) {
  const cv = root.querySelector('#tr-cv'), leg = root.querySelector('#tr-leg'), exp = root.querySelector('#tr-exp'), nm = root.querySelector('#tr-name');
  if (!cv) return;
  const store = await loadStore(J);
  const keys = Object.keys(store).filter(k => store[k] && store[k].spot > 0);
  const sym = keys.find(k => idOf(k) === state.id) ?? null;
  if (nm) nm.textContent = nameOf(state.id);
  state.maxDte ??= 3;
  exp.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.d === state.maxDte));
  const draw = () => {
    if (!sym) {
      const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); cv.style.display = 'none';
      leg.textContent = `No stored open interest for ${nameOf(state.id)}. The terrain covers ${keys.map(k => nameOf(idOf(k))).join(', ') || 'no market today'}.`;
      return;
    }
    cv.style.display = 'block';
    state.sym = sym;
    const useSmile = SMILE_SYMS.includes(sym), smile = useSmile ? (SMILE[sym] ?? (loadSmile(sym, draw), { state: 'loading' })) : null;
    const r = drawTerrain(cv, { e: store[sym], sym, maxDte: state.maxDte, smile, smileCover: useSmile, px: pxFor(sym), fmtBig, showTip, hideTip });
    leg.innerHTML = r.legend || '';
    const lab = root.querySelector('#tr-lab'); if (lab && lab.dataset.ownerLink !== undefined) lab.href = `oi-dashboard-v2.html#${encodeURIComponent(sym)}`;   // only the owner's anchor exists; a viewer has nothing to point
  };
  state.draw = draw;
  exp.querySelectorAll('button').forEach(b => b.onclick = () => { state.maxDte = +b.dataset.d; exp.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); state.draw?.(); });
  if (!state.resize) { state.resize = true; let t = null; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (root.isConnected && root.offsetParent) try { state.draw?.(); } catch { /* tab hidden */ } }, 150); }); }
  draw();
}
