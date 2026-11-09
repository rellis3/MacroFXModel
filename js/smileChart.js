/**
 * The IV smile chart: one fitted curve per expiry (implied vol against strike) over the raw out-of-the-money points, the
 * spot line, and the at-the-money IV30/60/90 and realised HV10/30/60 reference lines. Built 2026-11-09 for OI Lab and the
 * Desk Terminal's Options tab (one module, two pages). Data is the live Cboe chain (/api/cboe-contracts, 15 minutes
 * delayed), so it covers SPX, NDX and RUT only. Display only; it changes no level.
 *
 *   smilePanelHtml()                -> markup (controls, canvas, legend)
 *   mountSmile(root, { px })        -> { setSym(sym) }   fetches, fits and draws; expiry window, hover, click-a-legend-row-for-solo
 *
 * The fit is a least-squares quadratic in log-ish moneyness (u = (strike - spot) / spot) on each expiry's out-of-the-money
 * points (puts below spot, calls above), drawn only across the strikes that expiry actually has. It is a picture of the
 * smile, not a vol surface model: nothing downstream reads it.
 */
export const SMILE_SYMS = ['SPX500_USD', 'NAS100_USD', 'US2000_USD'];
const CACHE = {}, HVC = {};
const PRESETS = [['week', 0, 7], ['month', 0, 30], ['quarter', 0, 91], ['0-30', 0, 30], ['31-60', 31, 60], ['61+', 61, 1e9], ['to 98 days', 0, 98], ['all', 0, 1e9]];

function solve3(A, y) {                                   // 3x3 normal equations by Gaussian elimination
  const M = A.map((r, i) => [...r, y[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i; for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
    if (Math.abs(M[p][i]) < 1e-12) return null; [M[i], M[p]] = [M[p], M[i]];
    for (let k = i + 1; k < 3; k++) { const f = M[k][i] / M[i][i]; for (let c = i; c < 4; c++) M[k][c] -= f * M[i][c]; }
  }
  const x = [0, 0, 0]; for (let i = 2; i >= 0; i--) { let s = M[i][3]; for (let c = i + 1; c < 3; c++) s -= M[i][c] * x[c]; x[i] = s / M[i][i]; } return x;
}
export function fitQuad(pts, x0) {                        // pts: [{p, iv}] -> [a, b, c] for iv = a + b*u + c*u^2, u = (p - x0) / x0
  if (pts.length < 6) return null;
  const S = Array.from({ length: 3 }, () => [0, 0, 0]), t = [0, 0, 0];
  for (const { p, iv } of pts) { const u = (p - x0) / x0, v = [1, u, u * u]; for (let i = 0; i < 3; i++) { t[i] += v[i] * iv; for (let k = 0; k < 3; k++) S[i][k] += v[i] * v[k]; } }
  return solve3(S, t);
}

/** Cboe rows -> every expiry as { dte, atm (vol %), pinch, pts [{p, iv %}], fit, pmin, pmax }, nearest first. */
export function buildCurves(j) {
  const groups = new Map();
  for (const [K, T, cp, oi, iv, dte] of j.rows) { if (!(iv > 0)) continue; const k = dte + '|' + T; (groups.get(k) || groups.set(k, { dte, rows: [] }).get(k)).rows.push({ K, cp, iv }); }
  const sp = j.spot, shift = Number.isFinite(j.cfdOffset) ? j.cfdOffset : 0, pinch = sp + shift, out = [];
  for (const g of groups.values()) {
    const byK = new Map();
    for (const { K, cp, iv } of g.rows) { const o = byK.get(K) || {}; o[cp] = iv; byK.set(K, o); }
    const ser = [...byK.entries()].map(([K, o]) => ({ K, iv: K < sp ? (o.P ?? o.C) : (o.C ?? o.P) })).filter(x => x.iv > 0).sort((a, b) => a.K - b.K);
    if (ser.length < 6) continue;
    const j2 = ser.findIndex(x => x.K >= sp); if (j2 <= 0) continue;
    const a = ser[j2 - 1], c = ser[j2], atm = (a.iv + (c.iv - a.iv) * (sp - a.K) / ((c.K - a.K) || 1)) * 100;
    const pts = ser.map(x => ({ p: x.K + shift, iv: x.iv * 100 }));
    const fit = fitQuad(pts, pinch); if (!fit) continue;
    out.push({ dte: g.dte, atm, pinch, pts, fit, pmin: pts[0].p, pmax: pts[pts.length - 1].p });
  }
  return out.sort((x, y) => x.dte - y.dte);
}
const evalFit = (c, p) => { const u = (p - c.pinch) / c.pinch; return c.fit[0] + c.fit[1] * u + c.fit[2] * u * u; };
const interpAtm = (curves, d) => { const s = curves.slice().sort((a, b) => a.dte - b.dte); if (s.length < 2 || d < s[0].dte || d > s[s.length - 1].dte) return null;
  for (let i = 1; i < s.length; i++) if (s[i].dte >= d) { const a = s[i - 1], b = s[i]; return a.atm + (b.atm - a.atm) * (d - a.dte) / ((b.dte - a.dte) || 1); } return null; };
const colorFor = (rank, n) => { const f = n > 1 ? rank / (n - 1) : 0; return `hsl(${Math.round(48 + f * 150)} ${Math.round(82 - f * 22)}% ${Math.round(60 + f * 2)}%)`; };

async function loadChain(sym) {
  const h = CACHE[sym]; if (h && Date.now() - h.at < 300_000) return h;
  const r = await fetch(`/api/cboe-contracts?pair=${encodeURIComponent(sym)}&maxDte=400&window=0.15`); const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Cboe unavailable');
  return (CACHE[sym] = { at: Date.now(), j, curves: buildCurves(j) });
}
async function loadHV(sym) {                              // close-to-close realised vol from OANDA daily bars, annualised, in %
  if (HVC[sym] && Date.now() - HVC[sym].at < 3_600_000) return HVC[sym].v;
  let v = {};
  try {
    const r = await fetch(`/api/oanda_ohlc5m?symbol=${encodeURIComponent(sym)}&granularity=D`); const j = await r.json();
    const c = (j.values || []).map(x => ({ t: +x.t, c: +x.close })).filter(x => x.c > 0).sort((a, b) => a.t - b.t).map(x => x.c);
    const ret = c.slice(1).map((x, i) => Math.log(x / c[i]));
    for (const n of [10, 30, 60]) if (ret.length >= n) { const s = ret.slice(-n), m = s.reduce((a, b) => a + b, 0) / n; v[n] = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) * Math.sqrt(252) * 100; }
  } catch { /* no HV lines */ }
  HVC[sym] = { at: Date.now(), v }; return v;
}

export function drawSmile(cv, S) {
  const { curves, hv, from, to, solo, px, showTip, hideTip } = S;
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth || 1000, H = cv.clientHeight || 520;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const mono = '11px ui-monospace,"IBM Plex Mono",Consolas,monospace'; g.font = mono;
  const msg = m => { g.fillStyle = '#6b7585'; g.textAlign = 'center'; g.fillText(m, W / 2, H / 2); return []; };
  const vis = curves.filter(c => c.dte >= from && c.dte <= to);
  if (!vis.length) return msg('No expiries in this window.');
  const spot = vis[0].pinch;
  // x range: where these expiries have strikes, kept to +/-12% of spot so one far-out strike cannot flatten the picture
  let xlo = Math.max(spot * 0.88, Math.min(...vis.map(c => c.pmin))), xhi = Math.min(spot * 1.12, Math.max(...vis.map(c => c.pmax)));
  if (!(xhi > xlo)) return msg('Not enough strikes.');
  const samples = new Map(); vis.forEach(c => { const a = Math.max(xlo, c.pmin), b = Math.min(xhi, c.pmax), s = []; for (let i = 0; i <= 80; i++) { const p = a + (b - a) * i / 80; s.push([p, evalFit(c, p)]); } samples.set(c, s); });
  const vals = [...samples.values()].flat().map(q => q[1]).filter(Number.isFinite).sort((a, b) => a - b);
  let ylo = Math.max(0, vals[Math.floor(vals.length * 0.005)] * 0.85), yhi = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.985))] * 1.08;
  for (const k of [10, 30, 60]) if (hv?.[k]) ylo = Math.min(ylo, hv[k] * 0.9);
  const yr = niceRange(ylo, yhi); ylo = yr[0]; yhi = yr[1];
  const PL = 54, PR = 74, PT = 22, PB = 30, pw = W - PL - PR, ph = H - PT - PB;
  const X = p => PL + (p - xlo) / (xhi - xlo) * pw, Y = v => PT + (yhi - v) / (yhi - ylo) * ph;
  g.fillStyle = '#0c1320'; g.fillRect(PL, PT, pw, ph);
  const ystep = niceStep((yhi - ylo) / 6); g.textBaseline = 'middle';
  for (let v = Math.ceil(ylo / ystep) * ystep; v <= yhi + 1e-9; v += ystep) { g.strokeStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.moveTo(PL, Y(v)); g.lineTo(PL + pw, Y(v)); g.stroke(); g.fillStyle = '#7f8a98'; g.textAlign = 'right'; g.fillText(v.toFixed(v % 1 ? 1 : 0) + '%', PL - 8, Y(v)); }
  const xstep = niceStep((xhi - xlo) / 8); g.textBaseline = 'alphabetic'; g.textAlign = 'center';
  for (let p = Math.ceil(xlo / xstep) * xstep; p <= xhi; p += xstep) { g.strokeStyle = 'rgba(255,255,255,.04)'; g.beginPath(); g.moveTo(X(p), PT); g.lineTo(X(p), PT + ph); g.stroke(); g.fillStyle = '#7f8a98'; g.fillText(px(p), X(p), H - 10); }
  const rank = new Map(curves.map((c, i) => [c, i])), n = curves.length, dim = c => solo != null && c.dte !== solo;
  g.save(); g.beginPath(); g.rect(PL, PT, pw, ph); g.clip();
  vis.slice().reverse().forEach(c => {                    // far expiries first, so the near ones sit on top
    const col = colorFor(rank.get(c), n), a = dim(c) ? 0.07 : 1;
    g.fillStyle = col; g.globalAlpha = 0.5 * a; c.pts.forEach(q => { if (q.p < xlo || q.p > xhi || q.iv > yhi) return; g.fillRect(X(q.p) - 0.8, Y(q.iv) - 0.8, 1.7, 1.7); });
    g.globalAlpha = (solo != null && !dim(c) ? 1 : 0.78) * a; g.strokeStyle = col; g.lineWidth = solo != null && !dim(c) ? 2.4 : 1.25; g.beginPath();
    samples.get(c).forEach(([p, v], i) => i ? g.lineTo(X(p), Y(v)) : g.moveTo(X(p), Y(v))); g.stroke();
  });
  g.globalAlpha = 1; g.restore();
  // reference lines: at-the-money IV at 30/60/90 days (from the curves themselves) and realised vol, labelled at the right edge
  const refs = [];
  for (const d of [30, 60, 90]) { const v = interpAtm(curves, d); if (v != null) refs.push([v, `IV${d}`, '#8fa4c4']); }
  for (const k of [60, 30, 10]) if (hv?.[k]) refs.push([hv[k], `HV${k}`, '#e8736b']);
  let lastY = -99; refs.filter(r => r[0] >= ylo && r[0] <= yhi).sort((a, b) => Y(a[0]) - Y(b[0])).forEach(([v, name, col]) => {
    const y = Y(v); g.strokeStyle = col; g.globalAlpha = 0.75; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(PL, y); g.lineTo(PL + pw, y); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    const ly = Math.max(y + 4, lastY + 12); lastY = ly; g.textAlign = 'left'; g.fillStyle = col; g.fillText(`${name} ${v.toFixed(1)}%`, PL + pw + 6, ly); });
  // spot
  if (spot > xlo && spot < xhi) { g.strokeStyle = '#ffffff'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(X(spot), PT); g.lineTo(X(spot), PT + ph); g.stroke(); g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(`SPOT PRICE: ${px(spot)}`, X(spot) + 5, PT + 12); }
  // hover: the curve nearest the pointer, and what it reads there
  cv.onmousemove = ev => {
    const r = cv.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top; if (mx < PL || mx > PL + pw) return hideTip();
    const p = xlo + (mx - PL) / pw * (xhi - xlo); let best = null, bd = 1e9;
    for (const c of vis) { if (dim(c) || p < c.pmin || p > c.pmax) continue; const d = Math.abs(Y(evalFit(c, p)) - my); if (d < bd) { bd = d; best = c; } }
    if (!best || bd > 28) return hideTip();
    showTip(ev, `<b>${best.dte} DTE</b> · strike ${px(p)}<br>fitted IV <b>${evalFit(best, p).toFixed(2)}%</b> · ATM ${best.atm.toFixed(2)}%<br><span style="color:#8a95a3">${best.pts.length} strikes</span>`); };
  cv.onmouseleave = hideTip;
  return vis;
}
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }
function niceRange(lo, hi) { const s = niceStep((hi - lo) / 6); return [Math.max(0, Math.floor(lo / s) * s), Math.ceil(hi / s) * s]; }

export function smilePanelHtml() {
  const sty = 'background:var(--bg3,#151b27);color:var(--tx,#d8dcf0);border:1px solid var(--line2,#2a3350);border-radius:5px;padding:3px';
  return `<div class="card" data-sm="root" style="padding:14px 14px 10px">
<div style="display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-bottom:6px">
<label class="muted" style="font-size:12px">Market <select data-sm="sym" style="${sty}">${SMILE_SYMS.map(s => `<option value="${s}">${{ SPX500_USD: 'SPX', NAS100_USD: 'NDX', US2000_USD: 'RUT' }[s]}</option>`).join('')}</select></label>
<label class="muted" style="font-size:12px">Expiries <select data-sm="from" style="${sty}"></select> to <select data-sm="to" style="${sty}"></select></label>
<span data-sm="presets" style="display:flex;flex-wrap:wrap;gap:5px">${PRESETS.map(([t], i) => `<button type="button" data-pi="${i}" style="cursor:pointer;${sty};border-radius:999px;padding:3px 10px;font-size:12px">${t}</button>`).join('')}</span></div>
<div class="muted" style="font-size:12px;margin-bottom:6px">Hover reads the lines; a legend row opens that expiry alone. Dots are the out-of-the-money strikes (puts below spot, calls above); each line is a fit across them. Live Cboe chain, 15 minutes delayed. SPX, NDX and RUT only: CME books carry one vol per expiry, so they have no smile.</div>
<canvas data-sm="cv" style="width:100%;height:520px;display:block;border-radius:8px;background:#090e13"></canvas>
<div data-sm="leg" style="display:flex;flex-wrap:wrap;gap:4px 10px;font-size:11.5px;margin-top:8px;font-family:ui-monospace,Consolas,monospace"></div>
<div data-sm="note" class="muted" style="font-size:12px;margin-top:6px"></div></div>`;
}

let TIP = null;
const showTipDefault = (ev, html) => { TIP ??= Object.assign(document.createElement('div'), { style: 'position:fixed;z-index:50;background:#0c1124;border:1px solid #2a3350;border-radius:6px;padding:6px 9px;font:12px ui-monospace,Consolas,monospace;color:#d8dcf0;pointer-events:none' }); if (!TIP.isConnected) document.body.appendChild(TIP);
  TIP.innerHTML = html; TIP.style.display = 'block'; TIP.style.left = Math.min(innerWidth - TIP.offsetWidth - 10, ev.clientX + 16) + 'px'; TIP.style.top = Math.min(innerHeight - TIP.offsetHeight - 10, ev.clientY + 14) + 'px'; };
const hideTipDefault = () => { if (TIP) TIP.style.display = 'none'; };

export function mountSmile(root, { px, sym = 'NAS100_USD', showTip = showTipDefault, hideTip = hideTipDefault } = {}) {
  const q = k => root.querySelector(`[data-sm="${k}"]`), cv = q('cv'), selSym = q('sym'), selFrom = q('from'), selTo = q('to'), leg = q('leg'), note = q('note');
  const S = { sym, curves: [], hv: {}, from: 0, to: 1e9, solo: null, px: px || (v => v.toFixed(1)), showTip, hideTip }, my = { tok: 0 };
  const pxOf = v => Number.isFinite(v) ? (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(1)) : '—';
  S.px = px || pxOf;
  const redraw = () => {
    if (!S.curves.length) { const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); return; }
    const vis = drawSmile(cv, S), n = S.curves.length;
    leg.innerHTML = vis.map(c => { const i = S.curves.indexOf(c), on = S.solo === c.dte; return `<span data-d="${c.dte}" style="cursor:pointer;opacity:${S.solo != null && !on ? 0.4 : 1};${on ? 'text-decoration:underline;' : ''}"><span style="color:${colorFor(i, n)}">■</span> ${c.dte}d <span style="color:#7f8a98">${c.atm.toFixed(1)}%</span></span>`; }).join('');
    leg.querySelectorAll('[data-d]').forEach(el => el.onclick = () => { S.solo = S.solo === +el.dataset.d ? null : +el.dataset.d; redraw(); });
  };
  const fillSelects = () => {
    const opts = S.curves.map(c => `<option value="${c.dte}">${c.dte}d</option>`).join('');
    selFrom.innerHTML = opts; selTo.innerHTML = opts;
    const ds = S.curves.map(c => c.dte), f = ds.find(d => d >= S.from) ?? ds[0], t = [...ds].reverse().find(d => d <= S.to) ?? ds[ds.length - 1];
    selFrom.value = f; selTo.value = t;
  };
  const load = async s => {
    const tok = ++my.tok; S.sym = s; S.solo = null; selSym.value = s; note.textContent = 'loading the Cboe chain…'; S.curves = []; redraw();
    try {
      const [ch, hv] = await Promise.all([loadChain(s), loadHV(s)]); if (tok !== my.tok) return;
      S.curves = ch.curves; S.hv = hv; fillSelects(); redraw();
      note.textContent = S.curves.length ? `${S.curves.length} expiries, spot ${S.px(ch.j.spot + (Number.isFinite(ch.j.cfdOffset) ? ch.j.cfdOffset : 0))} (CFD terms). Chain fetched ${new Date(ch.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.` : 'No expiries with enough strikes.';
    } catch (e) { if (tok === my.tok) { note.textContent = `Cboe smile unavailable: ${e.message}`; } }
  };
  selSym.onchange = () => load(selSym.value);
  const apply = () => { S.from = +selFrom.value; S.to = +selTo.value; if (S.from > S.to) [S.from, S.to] = [S.to, S.from]; S.solo = null; redraw(); };
  selFrom.onchange = apply; selTo.onchange = apply;
  q('presets').querySelectorAll('button').forEach(b => b.onclick = () => { const [, a, z] = PRESETS[+b.dataset.pi]; S.from = a; S.to = z; fillSelects(); S.solo = null; redraw(); });
  let t = null; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (root.isConnected && root.offsetParent) try { redraw(); } catch { /* hidden */ } }, 150); });
  load(sym);
  return { setSym: s => { if (SMILE_SYMS.includes(s) && s !== S.sym) load(s); }, redraw };
}
