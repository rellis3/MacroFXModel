// js/terminal/jarvisViewNet.js: Jarvis's NETWORK view, the markets as a living neural net. Each market is a glowing node in a slowly turning 3D cloud; positions come from a force-directed layout of the
// 60-day correlation matrix (correlated markets pulled together, opposed ones pushed apart: netCore.js, pure and tested). Node size = today's move against its usual, colour = its direction. Links only where |r| is
// above the threshold (green = moved together, red = moved opposite, thickness = |r|) with signal pulses running along them and flashing the node they reach. Clusters are soft halos with their names.
// Click a node: its links light, the rest dim, and a card lists its strongest partners. DESCRIPTION ONLY: how these markets moved together over a past window, which does not persist reliably. Never a forecast.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { marketSizes } from './jarvisMarkets.js';
import { buildNet, netScript, pickLinks, partners, CLUSTERS, clusterOf, DEFAULT_THR, MAX_LINKS } from './netCore.js';

const S = { net: null, sizes: {}, links: [], thr: DEFAULT_THR, loading: null, at: 0, spin: 0, flash: null, scr: null, lp: null, showP: null, hl: new Set(), pairs: 0, sel: -1, ok: null };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = n => { let h = (n + 1) * 2654435761 >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return (h >>> 0) / 4294967296; };
const fmt = r => (r >= 0 ? '+' : '-') + Math.abs(r).toFixed(2);

function relink() {
  const n = S.net; if (!n) return;
  S.links = pickLinks(n.m, S.thr, MAX_LINKS);
  S.pairs = n.ids.length * (n.ids.length - 1) / 2;
  S.lp = new Float32Array(S.links.length * 2);                   // pulse phase per link (two pulses each at most)
  for (let i = 0; i < S.links.length; i++) { S.lp[i * 2] = hash(i); S.lp[i * 2 + 1] = hash(i + 999); }
  S.scr = new Float32Array(n.ids.length * 4);                    // per node: screen x, y, depth, scale
  S.flash = new Float32Array(n.ids.length);
}

/** Load the correlation panel (public, 6-hourly build) and today's moves; cached for 20 minutes. Fails soft. */
async function load(api, force) {
  if (S.loading) return S.loading;
  if (!force && S.net && Date.now() - S.at < 20 * 60e3) return S.net;
  S.loading = (async () => {
    try {
      const [panel, vf] = await Promise.all([api.jf('/api/corr-terminal'), api.jf('/api/vol-forecast/live').catch(() => null)]);
      const net = buildNet(panel); S.ok = !!net;
      if (net) { S.net = net; S.sizes = marketSizes(vf); S.at = Date.now(); relink(); }
    } catch (e) { S.ok = false; } finally { S.loading = null; }
    return S.net;
  })();
  return S.loading;
}

const Cof = { eq: 'blue', usd: 'cy', cross: 'tx2', met: 'gold', en: 'tx' };

function draw(ctx, g, api) {
  const { W, H, C, t, dt } = g, st = api.st, net = S.net, fade = g.fade;
  st.spin = false;
  ctx.save(); ctx.textAlign = 'center'; ctx.font = '12px ui-monospace,monospace';
  if (!net || !S.scr) {
    ctx.globalAlpha = fade; ctx.fillStyle = C.tx2; ctx.fillText(S.ok === false ? 'The correlation feed is not available right now.' : 'Reading the correlations...', W / 2, H / 2); ctx.restore(); return;
  }
  const n = net.ids.length, P = net.P;
  // on-screen threshold buttons arrive as clicks on a hit key; a click on a node selects it, empty space clears
  if (typeof st.sel === 'string' && st.sel.startsWith('net:')) {
    const k = st.sel.slice(4);
    if (k === '+' || k === '-') { S.thr = clamp(Math.round((S.thr + (k === '+' ? 0.05 : -0.05)) * 100) / 100, 0.2, 0.9); relink(); st.sel = null; S.sel = -1; }
    else S.sel = net.ids.indexOf(k);
  } else S.sel = -1;
  if (globalThis.__netSel) S.sel = net.ids.indexOf(globalThis.__netSel);                         // a debug hook for the visual harness
  if (Number.isFinite(globalThis.__netShowP)) S.showP = globalThis.__netShowP;
  const show = S.showP != null;
  if (!st.drag && !(S.sel >= 0)) S.spin += dt * (show ? 0.18 : 0.09);

  // ── who is highlighted: the selected node, or (in the SHOW) whatever the narration is talking about ──
  S.hl.clear(); let pair = null, focus = 0;
  if (S.sel >= 0) { S.hl.add(S.sel); }
  if (show) {
    const p = S.showP, ix = k => net.ids.indexOf(k);
    if (p > 0.18 && p < 0.42 && net.hi) { S.hl.add(ix(net.hi.a)); S.hl.add(ix(net.hi.b)); pair = [ix(net.hi.a), ix(net.hi.b)]; focus = Math.min(1, Math.min(p - 0.18, 0.42 - p) / 0.05); }
    else if (p >= 0.42 && p < 0.64 && net.lo) { S.hl.add(ix(net.lo.a)); S.hl.add(ix(net.lo.b)); pair = [ix(net.lo.a), ix(net.lo.b)]; focus = Math.min(1, Math.min(p - 0.42, 0.64 - p) / 0.05); }
    else if (p >= 0.64 && p < 0.86 && net.tight[0]) { for (const k of CLUSTERS.find(c => c.id === net.tight[0].id).ids) if (ix(k) >= 0) S.hl.add(ix(k)); focus = Math.min(1, Math.min(p - 0.64, 0.86 - p) / 0.05); }
    S.hl.delete(-1);
  }
  const hl = S.hl.size > 0;
  // the centre the camera looks at drifts toward the highlighted nodes in the SHOW
  let fx = 0, fy = 0, fz = 0; if (show && focus > 0 && S.hl.size) { for (const i of S.hl) { fx += P[i * 3]; fy += P[i * 3 + 1]; fz += P[i * 3 + 2]; } fx = fx / S.hl.size * focus * 0.8; fy = fy / S.hl.size * focus * 0.8; fz = fz / S.hl.size * focus * 0.8; }
  const yaw = st.yaw - 0.55 + S.spin + (show ? S.showP * 1.6 : 0), pitch = clamp(-0.12 + (st.pitch + 0.7) * 0.7 + 0.12 * Math.sin(t * 0.21), -1.2, 1.2), zoom = clamp(st.zoom || 1, 0.5, 2.6) * (1 + 0.55 * focus);
  const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), SCL = Math.min(W * 0.46, H * 0.62) * zoom, CD = 3.4, ox = W / 2 + (W > 900 ? 60 : 0), oy = H * 0.48;
  const scr = S.scr;
  for (let i = 0; i < n; i++) {
    const x0 = P[i * 3] - fx, y0 = P[i * 3 + 1] - fy, z0 = P[i * 3 + 2] - fz;
    const x1 = x0 * cyw + z0 * syw, z1 = -x0 * syw + z0 * cyw, y2 = y0 * cp - z1 * sp, z2 = y0 * sp + z1 * cp + CD, k = 2.2 / Math.max(0.6, z2);
    scr[i * 4] = ox + x1 * k * SCL; scr[i * 4 + 1] = oy + y2 * k * SCL; scr[i * 4 + 2] = z2; scr[i * 4 + 3] = k;
  }
  const depthA = z => clamp(1.25 - (z - CD + 1) * 0.42, 0.22, 1);

  // a faint depth grid: the net floats in a dark field
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = C.up; ctx.lineWidth = 1; ctx.globalAlpha = fade * 0.05;
  for (let r = 1; r <= 3; r++) { ctx.beginPath(); ctx.ellipse(ox, oy + SCL * 0.55, SCL * r * 0.55, SCL * r * 0.55 * Math.abs(Math.sin(pitch + 0.25)) + 3, 0, 0, 6.2832); ctx.stroke(); }

  // ── cluster halos ──
  for (const c of CLUSTERS) {
    const mem = c.ids.map(k => net.ids.indexOf(k)).filter(i => i >= 0); if (mem.length < 2) continue;
    let sx = 0, sy = 0; for (const i of mem) { sx += scr[i * 4]; sy += scr[i * 4 + 1]; } sx /= mem.length; sy /= mem.length;
    let rad = 0; for (const i of mem) rad = Math.max(rad, Math.hypot(scr[i * 4] - sx, scr[i * 4 + 1] - sy)); rad = rad * 1.12 + 20;
    const col = C[Cof[c.id]] ?? C.tx2, lit = hl && mem.some(i => S.hl.has(i)) ? 1.6 : 1, gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
    gr.addColorStop(0, col); gr.addColorStop(1, 'transparent'); ctx.globalAlpha = fade * 0.2 * lit; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy, rad, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = fade * 0.2 * lit; ctx.strokeStyle = col; ctx.setLineDash([2, 6]); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx, sy, rad, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.globalCompositeOperation = 'source-over';
  for (const c of CLUSTERS) {
    const mem = c.ids.map(k => net.ids.indexOf(k)).filter(i => i >= 0); if (mem.length < 2) continue;
    let sx = 0, sy = 0, top = 1e9; for (const i of mem) { sx += scr[i * 4]; sy += scr[i * 4 + 1]; top = Math.min(top, scr[i * 4 + 1]); } sx /= mem.length;
    let rad = 0, cy0 = 0; for (const i of mem) cy0 += scr[i * 4 + 1]; cy0 /= mem.length; for (const i of mem) rad = Math.max(rad, Math.hypot(scr[i * 4] - sx, scr[i * 4 + 1] - cy0)); rad = rad * 1.12 + 20;
    ctx.globalAlpha = fade * 0.7; ctx.fillStyle = C[Cof[c.id]] ?? C.tx2; ctx.font = '10px ui-monospace,monospace'; ctx.fillText(c.name.toUpperCase(), sx, cy0 - rad - 4);
  }

  // ── links, far to near not needed: they are additive light ──
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  const L = S.links;
  for (let i = 0; i < L.length; i++) {
    const l = L[i], ax = scr[l.a * 4], ay = scr[l.a * 4 + 1], bx = scr[l.b * 4], by = scr[l.b * 4 + 1], z = (scr[l.a * 4 + 2] + scr[l.b * 4 + 2]) / 2, ar = Math.abs(l.r);
    const on = !hl || (pair ? (pair[0] === l.a && pair[1] === l.b) : (S.sel >= 0 ? (l.a === S.sel || l.b === S.sel) : (S.hl.has(l.a) && S.hl.has(l.b)))), a = depthA(z) * (on ? 1 : 0.07);
    const mx = (ax + bx) / 2, my = (ay + by) / 2, bow = (hash(l.a * 31 + l.b) - 0.5) * 0.18, qx = mx + (by - ay) * bow, qy = my - (bx - ax) * bow;
    const col = l.r >= 0 ? C.up : C.dn, wd = (0.5 + ar * 2.4) * (SCL / 330) * (on && hl ? 1.5 : 1);
    ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(qx, qy, bx, by);
    ctx.globalAlpha = fade * a * 0.07 * ar; ctx.lineWidth = wd * 4.5; ctx.stroke();                  // the glow
    ctx.globalAlpha = fade * a * (0.18 + 0.5 * ar); ctx.lineWidth = Math.max(0.5, wd); ctx.stroke(); // the line
    // signal pulses: negatively correlated links fire from the other end, as an opposed signal
    if (!on && hl) continue;
    const np = ar > 0.8 ? 2 : 1, sped = 0.12 + 0.35 * ar;
    ctx.fillStyle = col;
    for (let q = 0; q < np; q++) {
      let u = (S.lp[i * 2 + q] + t * sped * (q ? 0.8 : 1)) % 1; const f = l.r >= 0 ? u : 1 - u, v = 1 - f;
      const px = v * v * ax + 2 * v * f * qx + f * f * bx, py = v * v * ay + 2 * v * f * qy + f * f * by;
      ctx.globalAlpha = fade * a * 0.95; ctx.beginPath(); ctx.arc(px, py, Math.max(1, wd * 0.9 + 1.2), 0, 6.2832); ctx.fill();
      const pu = Math.max(0, u - 0.05), pf = l.r >= 0 ? pu : 1 - pu, pv = 1 - pf;                                // a short tail behind the pulse
      ctx.globalAlpha = fade * a * 0.35; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, wd); ctx.beginPath(); ctx.moveTo(pv * pv * ax + 2 * pv * pf * qx + pf * pf * bx, pv * pv * ay + 2 * pv * pf * qy + pf * pf * by); ctx.lineTo(px, py); ctx.stroke();
      if (u < dt * sped * 1.5) S.flash[l.r >= 0 ? l.b : l.a] = 1;                                   // a pulse has just arrived: the node fires
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  // ── the nodes, far to near ──
  const order = []; for (let i = 0; i < n; i++) order.push(i); order.sort((a, b) => scr[b * 4 + 2] - scr[a * 4 + 2]);
  ctx.textAlign = 'center';
  for (const i of order) {
    const id = net.ids[i], sz = S.sizes[id], x = scr[i * 4], y = scr[i * 4 + 1], k = scr[i * 4 + 3], z = scr[i * 4 + 2], on = !hl || S.hl.has(i) || (S.sel >= 0 && S.links.some(l => (l.a === S.sel && l.b === i) || (l.b === S.sel && l.a === i)));
    const col = !sz || sz.tone === 'quiet' ? C.tx2 : sz.tone === 'up' ? C.up : C.dn, size = sz ? sz.size : 0.18, a = depthA(z) * (on ? 1 : 0.22);
    const fl = S.flash[i]; S.flash[i] *= Math.exp(-dt * 5);
    const rad = (3.2 + size * 9) * (SCL / 330) * k * 0.95 * (1 + 0.35 * fl) * (S.hl.has(i) ? 1.35 : 1);
    ctx.globalCompositeOperation = 'lighter'; const gl = ctx.createRadialGradient(x, y, 0, x, y, rad * 3.6); gl.addColorStop(0, col); gl.addColorStop(1, 'transparent');
    ctx.globalAlpha = fade * a * (0.5 + 0.45 * fl); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, rad * 3.6, 0, 6.2832); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = fade * a; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = fade * a * 0.85; ctx.fillStyle = C.tx; ctx.beginPath(); ctx.arc(x - rad * 0.25, y - rad * 0.25, rad * 0.38, 0, 6.2832); ctx.fill();
    if (S.sel === i) { ctx.globalAlpha = fade; ctx.strokeStyle = C.tx; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, rad * 1.9 + Math.sin(t * 5) * 1.2, 0, 6.2832); ctx.stroke(); }
    g.hit('net:' + id, x, y);
    ctx.globalAlpha = fade * a * (S.hl.has(i) ? 1 : 0.92); ctx.fillStyle = S.hl.has(i) ? C.tx : C.tx2; ctx.font = (S.hl.has(i) ? '13px' : '11px') + ' ui-monospace,monospace'; ctx.fillText(net.labels[id] ?? id, x, y + rad + 13);
  }

  // ── the card for the clicked node ──
  ctx.textAlign = 'left'; ctx.font = '11px ui-monospace,monospace';
  if (S.sel >= 0) {
    const id = net.ids[S.sel], sz = S.sizes[id], pt = partners(net.ids, net.m, S.sel, 3), x0 = 24, y0 = 150, w = 262, lines = 6 + pt.pos.length + pt.neg.length;
    ctx.fillStyle = C.up; ctx.globalAlpha = fade * 0.07; ctx.fillRect(x0 - 10, y0 - 22, w, lines * 16 + 22); ctx.globalAlpha = fade * 0.5; ctx.strokeStyle = C.up; ctx.lineWidth = 1; ctx.strokeRect(x0 - 10, y0 - 22, w, lines * 16 + 22);
    ctx.globalAlpha = fade; ctx.fillStyle = C.tx; ctx.font = '14px ui-monospace,monospace'; ctx.fillText(net.labels[id] ?? id, x0, y0 - 2); ctx.font = '11px ui-monospace,monospace';
    let y = y0 + 18; ctx.fillStyle = C.tx2; ctx.fillText(sz ? `today ${sz.move >= 0 ? '+' : ''}${sz.move.toFixed(2)}%, ${sz.ratio.toFixed(1)}x its usual move` : 'no move reading today', x0, y); y += 20;
    ctx.fillStyle = C.up; ctx.fillText('MOVED TOGETHER WITH', x0, y); y += 16;
    for (const p of pt.pos) { ctx.fillStyle = C.tx; ctx.fillText((net.labels[p.k] ?? p.k), x0 + 6, y); ctx.fillStyle = C.up; ctx.fillText(fmt(p.r), x0 + 170, y); y += 16; }
    if (!pt.pos.length) { ctx.fillStyle = C.tx2; ctx.fillText('none positive', x0 + 6, y); y += 16; }
    y += 4; ctx.fillStyle = C.dn; ctx.fillText('MOVED OPPOSITE TO', x0, y); y += 16;
    for (const p of pt.neg) { ctx.fillStyle = C.tx; ctx.fillText((net.labels[p.k] ?? p.k), x0 + 6, y); ctx.fillStyle = C.dn; ctx.fillText(fmt(p.r), x0 + 170, y); y += 16; }
    if (!pt.neg.length) { ctx.fillStyle = C.tx2; ctx.fillText('none negative', x0 + 6, y); y += 16; }
  }

  // ── title and legend: what is drawn, over what window, and that it describes the past ──
  ctx.textAlign = 'left'; ctx.font = '11px ui-monospace,monospace';
  const lx = 24, ly = H - 222, nl = L.length;
  ctx.globalAlpha = fade * 0.95; ctx.fillStyle = C.up; ctx.font = '12px ui-monospace,monospace'; ctx.fillText('NETWORK  ·  how markets have moved together', lx, ly); ctx.font = '11px ui-monospace,monospace';
  const rows = [
    [`${net.window}-day correlation of daily returns, to ${net.asOf}.`],
    ['A description of how these moved together. It does not persist reliably.'],
    [`Links shown where |r| >= ${S.thr.toFixed(2)}: ${nl} of ${S.pairs} pairs.`],
    ['green = moved together   red = moved opposite   thicker = stronger'],
    ['node size = today\'s move against its usual   colour = its direction'],
    [`layout keeps the distances ${net.fit != null ? `(fit ${net.fit.toFixed(2)})` : ''}; position is only a picture of the matrix.`]];
  rows.forEach(([s], i) => { ctx.fillStyle = C.tx2; ctx.globalAlpha = fade * 0.85; ctx.fillText(s, lx, ly + 18 + i * 15); });
  // threshold buttons
  const bx = lx + 340, by = ly + 18 + 2 * 15 - 9;
  ctx.fillStyle = C.up; ctx.globalAlpha = fade * 0.9; ctx.strokeStyle = C.up; ctx.lineWidth = 1;
  for (const [k, x] of [['-', bx], ['+', bx + 28]]) { ctx.strokeRect(x, by, 22, 18); ctx.textAlign = 'center'; ctx.fillText(k, x + 11, by + 13); g.hit('net:' + k, x + 11, by + 9); ctx.textAlign = 'left'; }
  ctx.restore();
}

registerJarvisModule({
  id: 'net', label: 'NETWORK',
  render(pane, api) {
    pane.innerHTML = `<h3>NETWORK</h3><p>The markets as a neural net. Markets that have moved together over the last 60 trading days sit close; those that moved opposite sit far apart. Links appear only above the threshold: green for moved together, red for moved opposite, pulses run along them. Click a market to see its strongest partners.</p><p class="jv-sub">It describes how these moved together in a past window. That is not a relationship that persists, and never a forecast.</p><div class="jv-row"><label>link threshold |r| &gt;= <b data-n="v">${S.thr.toFixed(2)}</b> <input type="range" min="0.2" max="0.9" step="0.05" value="${S.thr}" data-n="thr"></label></div><div class="jv-row"><button type="button" data-n="go">ENTER THE NETWORK</button></div>`;
    const v = pane.querySelector('[data-n="v"]');
    pane.querySelector('[data-n="thr"]').oninput = e => { S.thr = Number(e.target.value); v.textContent = S.thr.toFixed(2); relink(); };
    pane.querySelector('[data-n="go"]').onclick = () => { api.setView('net'); load(api, true); };
  },
  views: [{ id: 'net', label: 'NETWORK', env: { accent: 'up', chrome: 'clean', scan: false }, draw, onEnter: api => { S.showP = null; load(api); }, onLeave: () => { S.showP = null; } }],
});

registerShowScene({
  id: 'net', after: 'lean',
  prepare: api => load(api).then(n => (n ? { ok: true } : null)).catch(() => null),
  build: (inp, data) => {
    const net = S.net; if (!data || !net) return null; const text = netScript(net);
    return text ? { title: 'The correlation network', view: 'net', cam: { drift: true }, text, enter: api => { S.showP = 0; if (api?.st) { api.st.yaw = 0.55; api.st.zoom = 1; } }, motion: (api, p) => { S.showP = p; } } : null;
  },
});
