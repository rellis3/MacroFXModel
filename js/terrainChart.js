/**
 * The terrain chart: open interest by strike in the centre, one line per expiry either side (the IV smile where a Cboe
 * chain exists, gamma by strike where it does not), and labelled levels on one price axis. Extracted on 2026-11-09 from
 * oi-dashboard-v2.html (drawCog) so OI Lab and the Desk Terminal's Options tab draw the same chart from the same code.
 * Display only: it reads a stored OI entry and never changes a level.
 *
 *   drawTerrain(canvas, { e, sym, maxDte, smile, px, fmtBig, showTip, hideTip, smileCover })  ->  { legend, note }
 *     e          the stored OI entry (as /api/oi-store returns it): spot, refMove, maxPain, gexFlip, callWall, putWall, rawOI ...
 *     smile      null (CME book: gamma lines), or { state: 'loading' | 'err' | 'ok', err, curves } with curves from terrainSmiles()
 *     smileCover true when this instrument has a Cboe smile (so a missing smile means "loading"/"unavailable", not "n/a")
 */
import { oiBookLegs } from './oi.js';
import { bsGamma } from './gammaGreeks.js';

export const SMILE_SYMS = ['SPX500_USD', 'NAS100_USD', 'US2000_USD'];

/** Cboe /api/cboe-contracts rows -> per-expiry smile curves (IV less ATM in vol points), nearest expiry first. */
export function terrainSmiles(j) {
  const groups = new Map();
  for (const [K, T, cp, oi, iv, dte] of j.rows) { if (!(iv > 0)) continue; const k = dte + '|' + T; (groups.get(k) || groups.set(k, { dte, rows: [] }).get(k)).rows.push({ K, cp, iv }); }
  const sp = j.spot, shift = Number.isFinite(j.cfdOffset) ? j.cfdOffset : 0, out = [];
  for (const g of groups.values()) {
    const byK = new Map();
    for (const { K, cp, iv } of g.rows) { const o = byK.get(K) || {}; o[cp] = iv; byK.set(K, o); }
    const ser = [...byK.entries()].map(([K, o]) => ({ K, iv: K < sp ? (o.P ?? o.C) : (o.C ?? o.P) })).filter(x => x.iv > 0).sort((a, b) => a.K - b.K);
    if (ser.length < 6) continue;
    const j2 = ser.findIndex(x => x.K >= sp); if (j2 <= 0) continue;
    const a = ser[j2 - 1], c = ser[j2], atm = a.iv + (c.iv - a.iv) * (sp - a.K) / ((c.K - a.K) || 1);
    const side = cp => [...byK.entries()].filter(([, o]) => o[cp] > 0).sort((x, y) => x[0] - y[0]).map(([K, o]) => ({ p: K + shift, dv: (o[cp] - atm) * 100 }));
    out.push({ dte: g.dte, atm, pinch: sp + shift, put: side('P'), call: side('C') });
  }
  return out.sort((x, y) => x.dte - y.dte).slice(0, 12);
}

export function terrainColor(i) { return i < 4 ? { c: `hsl(${72 + i * 28} 80% 62%)`, w: 1.9 - i * 0.2, a: 0.95 } : { c: `hsl(${34 - Math.min(14, (i - 4) * 2)} 78% 56%)`, w: 1, a: 0.42 }; }

export function drawTerrain(cv, o) {
  const { e, maxDte = 3, smile = null, px, fmtBig, showTip = () => {}, hideTip = () => {} } = o;
  const useSmile = !!o.smileCover;
  if (!cv) return { legend: '', note: 'no canvas' };
  const dpr = Math.min(2, window.devicePixelRatio || 1), cssW = cv.clientWidth || 1000, cssH = cv.clientHeight || 880;
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cssW, cssH);
  const note = m => { g.fillStyle = '#6b7585'; g.font = '14px ui-monospace,Consolas,monospace'; g.textAlign = 'center'; g.fillText(m, cssW / 2, cssH / 2); return { legend: '', note: m }; };
  if (!e || !(e.spot > 0)) return note('No data for this instrument.');
  let b = null; try { b = oiBookLegs(e); } catch (_) {}
  if (!b) return note('No per-expiry book stored for this instrument.');
  const spot = e.spot, rm = e.refMove?.move || spot * 0.01, hw = Math.min(0.028 * spot, Math.max(0.01 * spot, 1.4 * rm)), lo = spot - hw, hi = spot + hw;   // about the day's plausible range plus a buffer, as the indicator does
  const D = { mp: e.maxPain, flip: e.gexFlip, cw: e.callWall, pw: e.putWall };
  const mono = '11px ui-monospace,"IBM Plex Mono",Consolas,monospace';
  const PL = 78, PR = 14, PT = 34, PB = 38, pw = cssW - PL - PR, ph = cssH - PT - PB;
  const yOf = p => PT + (hi - p) / (hi - lo) * ph;
  const legs = b.legs.filter(l => !Number.isFinite(l.dte) || l.dte <= maxDte);
  // OI by strike
  const oi = new Map();
  for (const l of legs) for (let i = 0; i < l.strikes.length; i++) { const K = l.strikes[i]; if (K < lo || K > hi) continue; const q = oi.get(K) || { c: 0, p: 0 }; q.c += l.calls[i] || 0; q.p += l.puts[i] || 0; oi.set(K, q); }
  const ks = [...oi.keys()].sort((x, y) => x - y);
  if (ks.length < 2) return note('No strikes near price in this expiry set.');
  const steps = ks.slice(1).map((k, i) => k - ks[i]).sort((x, y) => x - y), step = steps[Math.floor(steps.length / 2)] || (hi - lo) / 40;
  const barH = Math.max(2.5, Math.min(14, step / (hi - lo) * ph * 0.78));
  const vals = [...oi.values()].flatMap(q => [q.c, q.p]).filter(v => v > 0).sort((x, y) => x - y);
  const oiMax = Math.max(1, vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.97))] || 1);
  // panels: left fan | OI | right fan
  const wl = pw * 0.31, wc = pw * 0.38, xl0 = PL, xc0 = PL + wl, xc1 = xc0 + wc, xr0 = xc1, xr1 = PL + pw, cx = xc0 + wc / 2;
  // grid + price labels
  g.font = mono; g.textBaseline = 'middle';
  const stepP = (() => { const raw = (hi - lo) / 22, pw10 = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / pw10; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pw10; })();
  for (let v = Math.ceil(lo / stepP) * stepP; v <= hi; v += stepP) { const y = yOf(v); g.strokeStyle = 'rgba(255,255,255,.035)'; g.lineWidth = 1; g.beginPath(); g.moveTo(PL, y); g.lineTo(PL + pw, y); g.stroke();
    g.fillStyle = '#7f8a98'; g.textAlign = 'right'; g.fillText(px(v), PL - 10, y); }
  [xc0, xc1].forEach(x => { g.strokeStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.moveTo(x, PT); g.lineTo(x, PT + ph); g.stroke(); });
  // max pain highlight band
  const mp = D.mp; if (Number.isFinite(mp) && mp > lo && mp < hi) { g.fillStyle = 'rgba(255,255,255,.055)'; g.fillRect(PL, yOf(mp) - barH * 0.8, pw, barH * 1.6); }
  // fans
  const smiles = useSmile && smile && smile.state === 'ok' ? smile.curves : null;
  let legTxt = '';
  const clipY = (x0, x1) => { g.save(); g.beginPath(); g.rect(x0, PT, x1 - x0, ph); g.clip(); };
  const DMIN = -2, DMAX = 4;
  if (smiles && smiles.length) {
    const draw = (x0, x1, key) => { clipY(x0, x1);
      smiles.forEach((c, i) => { const st = terrainColor(i);
        const pts = c[key].filter(q => q.p >= lo - step && q.p <= hi + step);
        const trace = sel => { g.beginPath(); let first = true, prev = false; pts.forEach(q => { const on = sel(q); const x = x0 + Math.max(0, Math.min(1, (q.dv - DMIN) / (DMAX - DMIN))) * (x1 - x0), y = yOf(q.p);
            if (!on) { prev = false; return; } if (first || !prev) g.moveTo(x, y); else g.lineTo(x, y); first = false; prev = true; }); g.stroke(); };
        // puts are out of the money below the pinch, calls above it; the in-the-money half is noisy, so it is drawn faint
        const otm = key === 'put' ? (q => q.p <= c.pinch) : (q => q.p >= c.pinch);
        g.strokeStyle = st.c; g.lineWidth = st.w;
        g.globalAlpha = st.a * 0.22; trace(() => true);
        g.globalAlpha = st.a; trace(otm); });
      g.restore(); g.globalAlpha = 1; };
    draw(xl0, xc0, 'put'); draw(xr0, xr1, 'call');
    legTxt = smiles.map((c, i) => `<span style="color:${terrainColor(i).c}">■</span> ${c.dte} DTE`).join('  ');
  } else if (!useSmile) {
    // gamma by strike, one line per expiry: puts left, calls right
    const rowsE = legs.slice().sort((a, c) => (a.dte ?? 1e9) - (c.dte ?? 1e9)).slice(0, 12).map(l => {
      const T = Math.max(Number.isFinite(l.dte) ? l.dte : 14, 0.25) / 365, s = l.sigma > 0 ? l.sigma : b.flat, pts = [];
      for (let i = 0; i < l.strikes.length; i++) { const K = l.strikes[i]; if (K < lo - step || K > hi + step) continue; const gm = bsGamma(spot, K, T, s) || 0; pts.push({ p: K, c: (l.calls[i] || 0) * gm * b.mult * spot, pu: (l.puts[i] || 0) * gm * b.mult * spot }); }
      return { dte: l.dte, pts }; });
    // strikes are sparse and uneven, so the raw per-strike line zigzags. Smooth each expiry into a density (gaussian over about a strike or two) and fill under it.
    const NG = 150, hbw = Math.max(step * 1.1, (hi - lo) / 70), grid = Array.from({ length: NG + 1 }, (_, i) => lo + (hi - lo) * i / NG);
    rowsE.forEach(r => { r.dc = grid.map(P => r.pts.reduce((a, q) => a + q.c * Math.exp(-0.5 * ((P - q.p) / hbw) ** 2), 0)); r.dp = grid.map(P => r.pts.reduce((a, q) => a + q.pu * Math.exp(-0.5 * ((P - q.p) / hbw) ** 2), 0)); });
    const mag = rowsE.flatMap(r => r.dc.concat(r.dp)).filter(v => v > 0).sort((x, y) => x - y), mx = mag.length ? mag[Math.min(mag.length - 1, Math.floor(mag.length * 0.985))] : 1;
    const draw = (x0, x1, key, toLeft) => { clipY(x0, x1);
      rowsE.slice().reverse().forEach(r => { const i = rowsE.indexOf(r), st = terrainColor(i), arr = r[key];
        const X = v => toLeft ? x1 - Math.min(1, v / mx) * (x1 - x0) : x0 + Math.min(1, v / mx) * (x1 - x0), base = toLeft ? x1 : x0;
        g.beginPath(); g.moveTo(base, yOf(grid[0])); grid.forEach((P, k) => g.lineTo(X(arr[k]), yOf(P))); g.lineTo(base, yOf(grid[NG])); g.closePath();
        g.globalAlpha = i < 4 ? 0.10 : 0.04; g.fillStyle = st.c; g.fill();
        g.globalAlpha = st.a; g.strokeStyle = st.c; g.lineWidth = st.w; g.beginPath(); grid.forEach((P, k) => { const x = X(arr[k]), y = yOf(P); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); });
      g.restore(); g.globalAlpha = 1; };
    draw(xl0, xc0, 'dp', true); draw(xr0, xr1, 'dc', false);
    legTxt = rowsE.map((r, i) => `<span style="color:${terrainColor(i).c}">■</span> ${r.dte != null ? r.dte : '?'} DTE`).join('  ');
  } else {
    const bad = smile && smile.state === 'err';
    g.fillStyle = '#6b7585'; g.textAlign = 'center'; g.fillText(bad ? 'Cboe smiles unavailable' : 'loading smiles…', (xl0 + xc0) / 2, PT + 30); g.fillText(bad ? '' : 'loading smiles…', (xr0 + xr1) / 2, PT + 30);
  }
  // OI bars with a light-to-saturated gradient and a fine stripe texture
  const half = wc / 2 - 6;
  const gradC = g.createLinearGradient(cx, 0, cx + half, 0); gradC.addColorStop(0, '#dcecff'); gradC.addColorStop(0.45, '#8fb8f5'); gradC.addColorStop(1, '#3b6fd0');
  const gradP = g.createLinearGradient(cx, 0, cx - half, 0); gradP.addColorStop(0, '#ffe29a'); gradP.addColorStop(0.45, '#f0b04a'); gradP.addColorStop(1, '#a8701c');
  ks.forEach(K => { const q = oi.get(K), y = yOf(K) - barH / 2;
    if (q.c > 0) { const w = Math.min(1, q.c / oiMax) * half; g.fillStyle = gradC; g.fillRect(cx, y, w, barH); g.fillStyle = 'rgba(0,0,0,.14)'; for (let x = cx + 2; x < cx + w; x += 4) g.fillRect(x, y, 1, barH); if (q.c > oiMax) { g.fillStyle = '#fff'; g.fillRect(cx + half - 3, y, 3, barH); } }
    if (q.p > 0) { const w = Math.min(1, q.p / oiMax) * half; g.fillStyle = gradP; g.fillRect(cx - w, y, w, barH); g.fillStyle = 'rgba(0,0,0,.14)'; for (let x = cx - 2; x > cx - w; x -= 4) g.fillRect(x, y, 1, barH); if (q.p > oiMax) { g.fillStyle = '#fff'; g.fillRect(cx - half, y, 3, barH); } } });
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, PT); g.lineTo(cx, PT + ph); g.stroke();
  // levels, labelled at the right end like a desk chart
  let bigK = null, bigV = 0; for (const [K, q] of oi) { if (q.c + q.p > bigV) { bigV = q.c + q.p; bigK = K; } }
  const lv = [[spot, '#ffffff', 'SPOT PRICE', 'solid'], [D.flip, '#f0b04a', 'GEX FLIP (ZERO CROSSING)', 'dot'], [bigK, '#7fb0ff', 'MAJOR WALL', 'dash'], [D.mp, '#c9cdd2', 'MAX PAIN', 'dot'], [D.cw, '#ee6d66', 'CALL WALL', 'dash'], [D.pw, '#3fc583', 'PUT WALL', 'dash']]
    .filter(l => Number.isFinite(l[0]) && l[0] > lo && l[0] < hi).sort((x, y) => yOf(x[0]) - yOf(y[0]));
  let lastY = -99;
  lv.forEach(([p, col, name, style]) => { const y = yOf(p); g.strokeStyle = col; g.lineWidth = style === 'solid' ? 1.5 : 1.1; g.setLineDash(style === 'dash' ? [7, 5] : style === 'dot' ? [2, 4] : []); g.globalAlpha = .9;
    g.beginPath(); g.moveTo(PL, y); g.lineTo(PL + pw, y); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    const ly = Math.max(y - 8, lastY + 13); lastY = ly; g.textAlign = 'right'; g.font = mono; g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = '#090e13'; g.strokeText(`${name}: ${px(p)}`, PL + pw - 6, ly); g.fillStyle = col; g.fillText(`${name}: ${px(p)}`, PL + pw - 6, ly); });
  // headers + axes
  g.font = '10.5px ui-monospace,Consolas,monospace'; g.fillStyle = '#8a95a3'; g.textBaseline = 'alphabetic';
  g.textAlign = 'left'; g.fillText(useSmile ? 'PUTS IV LESS ATM  −2 pt' : 'PUT GAMMA BY EXPIRY, SMOOTHED', xl0 + 4, 16); g.textAlign = 'right'; g.fillText(useSmile ? '+4 pt' : '', xc0 - 4, 16);
  g.textAlign = 'left'; g.fillText(useSmile ? '−2 pt' : '', xr0 + 4, 16); g.textAlign = 'right'; g.fillText(useSmile ? 'CALLS IV LESS ATM  +4 pt' : 'CALL GAMMA BY EXPIRY, SMOOTHED', xr1 - 4, 16);
  g.textAlign = 'center';
  [-1, -0.5, 0, 0.5, 1].forEach(f => { const x = cx + f * half, v = Math.abs(f) * oiMax; g.fillText(f === 0 ? '0' : (fmtBig(v)), x, cssH - PB + 18); });
  g.fillText('OI (contracts)  ·  puts ←   → calls', cx, cssH - 6);
  const legend = (legTxt ? `Expiries, nearest first: ${legTxt}` : '') + (useSmile ? '<br>Smiles are live from Cboe (15 minutes delayed) and pinch at that moment\'s spot; the levels and open interest are from the last saved OI snapshot, so the pinch and the spot line can sit a little apart.' : '');
  // hover
  cv.onmousemove = ev => { const r = cv.getBoundingClientRect(), y = ev.clientY - r.top, price = hi - (y - PT) / ph * (hi - lo); let best = null, bd = 1e18; for (const K of ks) { const d = Math.abs(K - price); if (d < bd) { bd = d; best = K; } }
    if (best == null || bd > step) return hideTip(); const q = oi.get(best); showTip(ev, `<b>${px(best)}</b><br>calls ${fmtBig(q.c)} · puts ${fmtBig(q.p)}<br><span style="color:#8a95a3">${maxDte >= 400 ? 'whole book' : 'expiries within ' + maxDte + ' days'}</span>`); };
  cv.onmouseleave = hideTip;
  return { legend, note: null };
}
