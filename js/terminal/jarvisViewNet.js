// js/terminal/jarvisViewNet.js: Jarvis's NETWORK view, the markets as a living neural net. Each market is a glowing node in a slowly turning 3D cloud; positions come from a force-directed layout of the
// 60-day correlation matrix (correlated markets pulled together, opposed ones pushed apart: netCore.js, pure and tested). Node size = today's move against its usual, colour = its direction. Links only where |r| is
// above the threshold (green = moved together, red = moved opposite, thickness = |r|) with signal pulses running along them and flashing the node they reach. Clusters are soft halos with their names.
// Click a node: its links light, the rest dim, and a card lists its strongest partners.
// TIME SCRUB (bottom panel): the window's END DATE moves back through the ~3 years of daily closes /api/corr-terminal carries, in weekly steps. Each step's matrix uses only returns up to that date
// (no lookahead: netCore.triAt), the layout warm-starts from the previous one so the nodes glide to the new arrangement, PLAY walks the history forward, 20 / 60 / 120 picks the window length.
// The strip under it is one pair's correlation at every step (the pair whose correlation swung most over the history, or the clicked market and its strongest partner), the shown date marked;
// above zero = green, below = red. Work is chunked: the full history's matrices are cached a few per frame (about 3 ms per frame), the shown step first.
// When scrubbed back, node size = that day's move against its own spread over the 60 days before it (point-in-time), not today's.
// Data: /api/corr-terminal { ok, panel: { syms (26 OANDA names), dates (780 NY trading days), closes: { sym: [close|null] } } }, /api/vol-forecast/live for today's node sizes.
// DESCRIPTION ONLY: how these markets moved together over a past window, which does not persist reliably. Never a forecast.
import { marketName } from './jarvisNames.js';
const nameOf = (net, id) => { const n = marketName(id, { short: true }); return n === id ? (net.labels[id] ?? id) : n; };
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { marketSizes } from './jarvisMarkets.js';
import { buildNet, netScript, pickLinks, partners, CLUSTERS, DEFAULT_THR, MAX_LINKS, WINDOWS, scrubSteps, makeScan, scanSome, stepState, pairPath, swingPair, dayMoves } from './netCore.js';

const S = { net: null, sizes: {}, live: {}, links: [], thr: DEFAULT_THR, loading: null, at: 0, spin: 0, flash: null, scr: null, lp: null, showP: null, hl: new Set(), pairs: 0, sel: -1, selId: null, ok: null,
  // the time scrub: window length, its scan (cached matrices per step), the shown step, the picture there (cur), the drawn positions gliding toward cur.P (D), play state, strip cache
  w: 60, scans: {}, scan: null, si: -1, cur: null, D: null, play: false, playT: 0, swing: {}, strip: null };
const calm = () => { try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const last = () => (S.scan ? S.scan.steps.length - 1 : -1);
const isLive = () => S.si === last();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = n => { let h = (n + 1) * 2654435761 >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return (h >>> 0) / 4294967296; };
const fmt = r => (r >= 0 ? '+' : '-') + Math.abs(r).toFixed(2);

function relink() {
  const n = S.net; if (!n || !S.cur) return;
  S.links = pickLinks(S.cur.m, S.thr, MAX_LINKS);
  S.pairs = n.ids.length * (n.ids.length - 1) / 2;
  S.lp = new Float32Array(S.links.length * 2);                   // pulse phase per link (two pulses each at most)
  for (let i = 0; i < S.links.length; i++) { S.lp[i * 2] = hash(i); S.lp[i * 2 + 1] = hash(i + 999); }
  S.scr = new Float32Array(n.ids.length * 4);                    // per node: screen x, y, depth, scale
  S.flash = new Float32Array(n.ids.length);
}

/** Show scrub step s: the matrix ending on that date, laid out warm from where the nodes are heading now. Node sizes: today's live reading on the last step, that day's move otherwise. */
function goStep(s) {
  const net = S.net; if (!net || !S.scan) return;
  s = clamp(s | 0, 0, last()); if (s === S.si && S.cur) return;
  try { S.cur = stepState(net, S.scan, s, S.cur?.P ?? null); } catch (e) { return; }
  S.si = s; relink();
  S.sizes = s === last() && Object.keys(S.live).length ? S.live : dayMoves(net.R, net.ids, S.cur.end);
}
/** Change the window length, staying on (or just before) the shown date. */
function setW(w) {
  const net = S.net; if (!net || !WINDOWS.includes(w)) return;
  const end = S.cur?.end ?? net.dates.length - 1;
  S.w = w; S.scan = S.scans[w] ??= makeScan(net.R, scrubSteps(net.dates.length, w), w);
  let s = 0; S.scan.steps.forEach((e, i) => { if (e <= end) s = i; });
  S.si = -1; goStep(s);
}
function initScrub(net) {
  S.scans = {}; S.swing = {}; S.strip = null; S.cur = null; S.si = -1; S.play = false; S.w = net.window;
  S.scan = S.scans[S.w] = makeScan(net.R, scrubSteps(net.dates.length, S.w), S.w);
  if (!S.scan.steps.length) { S.cur = { s: 0, end: net.dates.length - 1, date: net.asOf, w: S.w, m: net.m, P: net.P, fit: net.fit }; S.D = Float32Array.from(net.P); relink(); S.sizes = S.live; return; }
  goStep(last()); S.D = Float32Array.from(S.cur.P);
}

/** Load the correlation panel (public, 6-hourly build) and today's moves; cached for 20 minutes. Fails soft. */
async function load(api, force) {
  if (S.loading) return S.loading;
  if (!force && S.net && Date.now() - S.at < 20 * 60e3) return S.net;
  S.loading = (async () => {
    try {
      const [panel, vf] = await Promise.all([api.jf('/api/corr-terminal'), api.jf('/api/vol-forecast/live').catch(() => null)]);
      const net = buildNet(panel); S.ok = !!net;
      if (net) { S.net = net; S.live = marketSizes(vf); S.at = Date.now(); initScrub(net); }
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
  if (!net || !S.scr || !S.cur || !S.D) {
    ctx.globalAlpha = fade; ctx.fillStyle = C.tx2; ctx.fillText(S.ok === false ? 'The correlation feed is not available right now.' : 'Reading the correlations...', W / 2, H / 2); ctx.restore(); return;
  }
  const n = net.ids.length;
  // on-screen controls arrive as clicks on a hit key ('net:@...', 'net:+' / 'net:-'); a click on a node selects it (kept while the controls are used), empty space clears
  if (typeof st.sel === 'string' && st.sel.startsWith('net:')) {
    const k = st.sel.slice(4);
    if (k === '+' || k === '-' || k[0] === '@') { control(k); st.sel = S.selId ? 'net:' + S.selId : null; }
    else S.selId = k;
  } else S.selId = null;
  if (globalThis.__netSel) S.selId = globalThis.__netSel;                                          // a debug hook for the visual harness
  S.sel = S.selId ? net.ids.indexOf(S.selId) : -1;
  if (Number.isFinite(globalThis.__netShowP)) S.showP = globalThis.__netShowP;
  // the scrub's background work: cache the history's matrices about 3 ms per frame (the shown step first), then find the pair that swung most
  if (S.scan && !S.scan.done) { const t0 = performance.now(); do scanSome(S.scan, 1, S.si); while (!S.scan.done && performance.now() - t0 < 3); }
  if (S.scan?.done && !(S.w in S.swing)) S.swing[S.w] = swingPair(S.scan, net.ids);
  if (S.play) { S.playT += dt; const every = calm() ? 0.9 : 0.36; if (S.playT >= every) { S.playT = 0; if (S.si >= last()) S.play = false; else goStep(S.si + 1); } }
  // the drawn positions glide toward the shown step's layout (snap under reduced motion)
  const P = S.D, T = S.cur.P, kg = calm() ? 1 : 1 - Math.exp(-dt * 3.2);
  for (let i = 0; i < P.length; i++) P[i] += (T[i] - P[i]) * kg;
  const show = S.showP != null;
  if (!st.drag && !(S.sel >= 0)) S.spin += dt * (show ? 0.18 : 0.09);

  // ── who is highlighted: the selected node, or (in the SHOW) whatever the narration is talking about ──
  S.hl.clear(); let pair = null, focus = 0;
  if (S.sel >= 0) { S.hl.add(S.sel); }
  if (show) {
    const p = S.showP, ix = k => net.ids.indexOf(k);
    if (p > 0.18 && p < 0.42 && net.hi) { S.hl.add(ix(net.hi.a)); S.hl.add(ix(net.hi.b)); pair = [ix(net.hi.a), ix(net.hi.b)]; focus = Math.min(1, Math.min(p - 0.18, 0.42 - p) / 0.05); }
    else if (p >= 0.42 && p < 0.64 && net.lo) { S.hl.add(ix(net.lo.a)); S.hl.add(ix(net.lo.b)); pair = [ix(net.lo.a), ix(net.lo.b)]; focus = Math.min(1, Math.min(p - 0.42, 0.64 - p) / 0.05); }
    else if (p >= 0.6 && p < 0.76 && net.tight[0]) { for (const k of CLUSTERS.find(c => c.id === net.tight[0].id).ids) if (ix(k) >= 0) S.hl.add(ix(k)); focus = Math.min(1, Math.min(p - 0.6, 0.76 - p) / 0.05); }
    else if (p >= 0.76 && p < 0.92 && net.change) { S.hl.add(ix(net.change.a)); S.hl.add(ix(net.change.b)); pair = [ix(net.change.a), ix(net.change.b)].sort((a, b) => a - b); focus = Math.min(1, Math.min(p - 0.76, 0.92 - p) / 0.05); }
    S.hl.delete(-1);
  }
  const hl = S.hl.size > 0;
  // the centre the camera looks at drifts toward the highlighted nodes in the SHOW
  let fx = 0, fy = 0, fz = 0; if (show && focus > 0 && S.hl.size) { for (const i of S.hl) { fx += P[i * 3]; fy += P[i * 3 + 1]; fz += P[i * 3 + 2]; } fx = fx / S.hl.size * focus * 0.8; fy = fy / S.hl.size * focus * 0.8; fz = fz / S.hl.size * focus * 0.8; }
  const yaw = st.yaw - 0.55 + S.spin + (show ? S.showP * 1.6 : 0), pitch = clamp(-0.12 + (st.pitch + 0.7) * 0.7 + 0.12 * Math.sin(t * 0.21), -1.2, 1.2), zoom = clamp(st.zoom || 1, 0.5, 2.6) * (1 + 0.55 * focus);
  const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), SCL = (g.compact ? Math.min(W * 0.62, H * 0.4) : Math.min(W * 0.42, H * 0.5)) * zoom, CD = 3.4, ox = W / 2 + (W > 900 ? 60 : 0), oy = H * (g.compact ? 0.4 : 0.42);
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
  const placed = S.placed ??= []; placed.length = 0;
  if (!g.compact) for (const c of CLUSTERS) {
    const mem = c.ids.map(k => net.ids.indexOf(k)).filter(i => i >= 0); if (mem.length < 2) continue;
    let sx = 0, sy = 0, top = 1e9; for (const i of mem) { sx += scr[i * 4]; sy += scr[i * 4 + 1]; top = Math.min(top, scr[i * 4 + 1]); } sx /= mem.length;
    let rad = 0, cy0 = 0; for (const i of mem) cy0 += scr[i * 4 + 1]; cy0 /= mem.length; for (const i of mem) rad = Math.max(rad, Math.hypot(scr[i * 4] - sx, scr[i * 4 + 1] - cy0)); rad = rad * 1.12 + 20;
    ctx.globalAlpha = fade * 0.7; ctx.fillStyle = C[Cof[c.id]] ?? C.tx2; ctx.font = '11px ui-monospace,monospace'; const cn = c.name.toUpperCase(), cw = ctx.measureText(cn).width + 6, cr = [sx - cw / 2, cy0 - rad - 15, cw, 13];
    if (placed.some(q => cr[0] < q[0] + q[2] && q[0] < cr[0] + cr[2] && cr[1] < q[1] + q[3] && q[1] < cr[1] + cr[3])) continue;
    ctx.fillText(cn, sx, cy0 - rad - 4); placed.push(cr);
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
  let lab = null; if (g.compact) { lab = new Set(net.ids.map((id, i) => [i, S.sizes[id]?.size ?? 0]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(a => a[0])); }   // phone: only the five biggest movers are named
  const labs = [];
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
    if (lab && !lab.has(i) && !S.hl.has(i) && S.sel !== i) continue;
    labs.push({ i, x, y: y + rad + 13, a, pri: (S.hl.has(i) || S.sel === i ? 10 : 0) + (sz?.size ?? 0) + k * 0.5 });
  }
  // labels: the highlighted, then the biggest movers and nearest first; one that would overlap a placed label is left out
  labs.sort((p, q) => q.pri - p.pri);
  for (const L0 of labs) {
    const big = L0.pri >= 10, txt = nameOf(net, net.ids[L0.i]); ctx.font = (big ? '13px' : '11px') + ' ui-monospace,monospace';
    const w = ctx.measureText(txt).width + 6, h = big ? 15 : 13, r = [L0.x - w / 2, L0.y - h + 3, w, h];
    if (!big && placed.some(q => r[0] < q[0] + q[2] && q[0] < r[0] + r[2] && r[1] < q[1] + q[3] && q[1] < r[1] + r[3])) continue;
    placed.push(r); ctx.globalAlpha = fade * L0.a * (big ? 1 : 0.92); ctx.fillStyle = big ? C.tx : C.tx2; ctx.fillText(txt, L0.x, L0.y);
  }

  // ── the card for the clicked node ──
  ctx.textAlign = 'left'; ctx.font = '11px ui-monospace,monospace';
  if (S.sel >= 0) {
    const cp = g.compact, id = net.ids[S.sel], sz = S.sizes[id], pt = partners(net.ids, S.cur.m, S.sel, cp ? 2 : 3), x0 = cp ? 20 : 24, y0 = cp ? 112 : 150, w = cp ? Math.min(262, W - 20) : 262, lines = 6 + pt.pos.length + pt.neg.length;
    ctx.fillStyle = C.up; ctx.globalAlpha = fade * 0.07; ctx.fillRect(x0 - 10, y0 - 22, w, lines * 16 + 22); ctx.globalAlpha = fade * 0.5; ctx.strokeStyle = C.up; ctx.lineWidth = 1; ctx.strokeRect(x0 - 10, y0 - 22, w, lines * 16 + 22);
    ctx.globalAlpha = fade; ctx.fillStyle = C.tx; ctx.font = '14px ui-monospace,monospace'; ctx.fillText(nameOf(net, id), x0, y0 - 2); ctx.font = '11px ui-monospace,monospace';
    let y = y0 + 18; ctx.fillStyle = C.tx2; ctx.fillText(sz ? (sz === S.live[id] ? `today ${sz.move >= 0 ? '+' : ''}${sz.move.toFixed(2)}%, ${sz.ratio.toFixed(1)}x its usual move` : `${S.cur.date} ${sz.move >= 0 ? '+' : ''}${sz.move.toFixed(2)}%, ${sz.ratio.toFixed(1)}x its 60-day spread`) : `no move reading on ${S.cur.date}`, x0, y); y += 20;
    ctx.fillStyle = C.up; ctx.fillText('MOVED TOGETHER WITH', x0, y); y += 16;
    for (const p of pt.pos) { ctx.fillStyle = C.tx; ctx.fillText(nameOf(net, p.k), x0 + 6, y); ctx.fillStyle = C.up; ctx.fillText(fmt(p.r), x0 + (cp ? 150 : 170), y); y += 16; }
    if (!pt.pos.length) { ctx.fillStyle = C.tx2; ctx.fillText('none positive', x0 + 6, y); y += 16; }
    y += 4; ctx.fillStyle = C.dn; ctx.fillText('MOVED OPPOSITE TO', x0, y); y += 16;
    for (const p of pt.neg) { ctx.fillStyle = C.tx; ctx.fillText(nameOf(net, p.k), x0 + 6, y); ctx.fillStyle = C.dn; ctx.fillText(fmt(p.r), x0 + (cp ? 150 : 170), y); y += 16; }
    if (!pt.neg.length) { ctx.fillStyle = C.tx2; ctx.fillText('none negative', x0 + 6, y); y += 16; }
  }

  // ── title and legend: what is drawn, over what window, and that it describes the past ──
  ctx.textAlign = 'left'; ctx.font = '11px ui-monospace,monospace';
  scrubPanel(ctx, g, net);
  ctx.textAlign = 'left'; ctx.font = '11px ui-monospace,monospace';
  if (g.compact) return netLegendCompact(ctx, g, net, L.length);
  const lx = 24, ly = H - 330, nl = L.length, cur = S.cur, live = isLive() && S.sizes === S.live;
  ctx.globalAlpha = fade * 0.95; ctx.fillStyle = C.up; ctx.font = '12px ui-monospace,monospace'; ctx.fillText('NETWORK  ·  how markets have moved together', lx, ly); ctx.font = '11px ui-monospace,monospace';
  const rows = [
    `${cur.w}-day correlation of daily returns, window ending ${cur.date}.`,
    `Links shown where |r| >= ${S.thr.toFixed(2)}: ${nl} of ${S.pairs} pairs.`,
    'green = moved together   red = moved opposite   thicker = stronger',
    live ? 'node size = today\'s move against its usual   colour = its direction' : 'node size = that day\'s move against its prior 60-day spread   colour = direction',
    `layout keeps the distances ${cur.fit != null ? `(fit ${cur.fit.toFixed(2)})` : ''}; position is only a picture of the matrix.`];
  rows.forEach((r, i) => { ctx.fillStyle = C.tx2; ctx.globalAlpha = fade * 0.85; ctx.fillText(r, lx, ly + 18 + i * 15); });
  // threshold buttons, clear of the text on their row
  const by = ly + 18 + 15 - 12, bx = lx + Math.ceil(ctx.measureText(rows[1]).width) + 14;
  ctx.fillStyle = C.up; ctx.globalAlpha = fade * 0.9; ctx.strokeStyle = C.up; ctx.lineWidth = 1;
  for (const [k, x] of [['-', bx], ['+', bx + 28]]) { ctx.strokeRect(x, by, 22, 16); ctx.textAlign = 'center'; ctx.fillText(k, x + 11, by + 12); g.hit('net:' + k, x + 11, by + 8); ctx.textAlign = 'left'; }
  ctx.restore();
}

/** The controls: threshold +/-, and the scrub's @play @prev @next @now @w20/60/120 @t<step>. */
function control(k) {
  if (k === '+' || k === '-') { S.thr = clamp(Math.round((S.thr + (k === '+' ? 0.05 : -0.05)) * 100) / 100, 0.2, 0.9); relink(); return; }
  const c = k.slice(1);
  if (c === 'play') { if (S.play) S.play = false; else { if (S.si >= last()) goStep(0); S.play = true; S.playT = 0; } }
  else if (c === 'prev') { S.play = false; goStep(S.si - 1); }
  else if (c === 'next') { S.play = false; goStep(S.si + 1); }
  else if (c === 'now') { S.play = false; goStep(last()); }
  else if (c[0] === 'w') setW(Number(c.slice(1)));
  else if (c[0] === 't') { S.play = false; goStep(Number(c.slice(1))); }
}

/** A canvas button in the HUD style; `on` lights it. */
function btn(ctx, g, key, label, x, y, w, h, on = false) {
  const { C, fade } = g;
  ctx.globalAlpha = fade * (on ? 0.24 : 0.08); ctx.fillStyle = C.up; ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = fade * (on ? 0.95 : 0.6); ctx.strokeStyle = C.up; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.globalAlpha = fade; ctx.fillStyle = on ? C.tx : C.up; ctx.textAlign = 'center'; ctx.fillText(label, x + w / 2, y + h / 2 + 4); ctx.textAlign = 'left';
  g.hit(key, x + w / 2, y + h / 2);
}
/** Wrap text to a width (for the phone). */
function wrap(ctx, s, w) { const out = []; let line = ''; for (const word of s.split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t; } if (line) out.push(line); return out; }

const KEY_LINE = 'correlation over the chosen window ending on the shown date · how markets moved together then, which does not persist reliably · not a forecast';

/** The strip pair: the clicked market and its strongest partner on the shown date, or the pair whose correlation swung most over the history. */
function stripPair(net) {
  if (S.showP != null && net.change) return { i: net.ids.indexOf(net.change.a), j: net.ids.indexOf(net.change.b), why: 'biggest change over the last 3 months' };
  if (S.sel >= 0) {
    let best = -1, br = 0; const row = S.cur.m[S.sel];
    for (let j = 0; j < row.length; j++) if (j !== S.sel && Number.isFinite(row[j]) && Math.abs(row[j]) > br) { br = Math.abs(row[j]); best = j; }
    if (best >= 0) return { i: S.sel, j: best, why: 'the selected market and its strongest partner on the shown date' };
  }
  const sw = S.swing[S.w]; return sw ? { i: sw.i, j: sw.j, why: `the pair whose correlation swung most over these ${Math.round(net.dates.length / 252)} years` } : null;
}

/** Bottom panel: play / step / now, window length, the date, and the strip of one pair's correlation through time (click it to jump). */
function scrubPanel(ctx, g, net) {
  const { W, H, C, fade } = g, cp = g.compact, sc = S.scan; if (!sc || !sc.steps.length) return;
  // laid out from the bottom up, clear of the HUD's own bottom bar (84 px on desktop, 74 on the phone)
  const x0 = cp ? 10 : 24, x1 = W - (cp ? 10 : 24), bh = cp ? 30 : 22, bot = H - (cp ? 80 : 90), keyY = cp ? bot - 34 : bot - 8, sh = cp ? 50 : 54;
  const sy0 = keyY - (cp ? 36 : 30) - sh, top = sy0 - (cp ? 72 : 44);
  ctx.globalAlpha = fade * 0.55; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x0 - 6, top - 8, x1 - x0 + 12, bot - top + 8);
  ctx.globalAlpha = fade * 0.3; ctx.strokeStyle = C.up; ctx.lineWidth = 1; ctx.strokeRect(x0 - 5.5, top - 7.5, x1 - x0 + 11, bot - top + 7);
  ctx.font = (cp ? '12px' : '11px') + ' ui-monospace,monospace';
  // buttons
  let x = x0;
  const b = (k, l, w, on) => { btn(ctx, g, 'net:@' + k, l, x, top, w, bh, on); x += w + 6; };
  b('play', S.play ? '❚❚ PAUSE' : '▶ PLAY', cp ? 76 : 74, S.play); b('prev', '‹', cp ? 32 : 24); b('next', '›', cp ? 32 : 24); b('now', 'NOW', cp ? 44 : 40, isLive());
  x += cp ? 2 : 10; for (const w of WINDOWS) b('w' + w, cp ? `${w}` : `${w}d`, cp ? 36 : 38, S.w === w);
  // the date
  ctx.globalAlpha = fade; ctx.textAlign = cp ? 'left' : 'right'; ctx.fillStyle = isLive() ? C.up : C.tx; ctx.font = (cp ? '13px' : '15px') + ' ui-monospace,monospace';
  const dl = `${S.cur.date}${isLive() ? '  LATEST' : ''}`;
  if (cp) ctx.fillText(dl, x0, top + bh + 18); else ctx.fillText(dl, x1, top + 15);
  ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = C.tx2; ctx.globalAlpha = fade * 0.85;
  const scanTxt = sc.done ? '' : `  · reading the history ${Math.round(100 * (1 - sc.left / sc.steps.length))}%`;
  if (cp) { ctx.textAlign = 'right'; ctx.fillText(`${S.w}-day window${scanTxt ? ' ·' + scanTxt.slice(3) : ''}`, x1, top + bh + 18); }
  else { ctx.fillText(`window: ${S.w} trading days ending on this date · week ${S.si + 1} of ${sc.steps.length}${scanTxt}`, x1 - 210, top + 15); }
  ctx.textAlign = 'left';
  // the strip
  const sx0 = x0, sx1 = x1, mid = sy0 + sh / 2, N = sc.steps.length, X = s => sx0 + (N > 1 ? s / (N - 1) : 1) * (sx1 - sx0), Y = v => mid - v * sh / 2;
  const sp = stripPair(net);
  ctx.globalAlpha = fade * 0.25; ctx.strokeStyle = C.tx2; ctx.setLineDash([2, 4]);
  for (const v of [0.5, -0.5]) { ctx.beginPath(); ctx.moveTo(sx0, Y(v)); ctx.lineTo(sx1, Y(v)); ctx.stroke(); }
  ctx.setLineDash([]); ctx.globalAlpha = fade * 0.5; ctx.beginPath(); ctx.moveTo(sx0, mid); ctx.lineTo(sx1, mid); ctx.stroke();
  // year ticks
  ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = C.tx2; ctx.globalAlpha = fade * 0.6;
  let py = null; for (let s = 0; s < N; s++) { const yr = net.dates[sc.steps[s]].slice(0, 4); if (py && yr !== py) { ctx.fillRect(X(s), sy0 + sh - 4, 1, 6); ctx.fillText(yr, X(s) + 3, sy0 + sh + 12); } py = yr; }
  if (sp && sp.i >= 0 && sp.j >= 0) {
    const key = `${S.w}|${sp.i}|${sp.j}|${sc.left}`;
    if (S.strip?.key !== key) S.strip = { key, v: pairPath(sc, Math.min(sp.i, sp.j), Math.max(sp.i, sp.j)) };
    const v = S.strip.v;
    ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 2;
    for (let s = 1; s < N; s++) {
      const a = v[s - 1], c = v[s]; if (!Number.isFinite(a) || !Number.isFinite(c)) continue;
      ctx.strokeStyle = (a + c) / 2 >= 0 ? C.up : C.dn; ctx.globalAlpha = fade * 0.9; ctx.beginPath(); ctx.moveTo(X(s - 1), Y(a)); ctx.lineTo(X(s), Y(c)); ctx.stroke();
      ctx.globalAlpha = fade * 0.12; ctx.fillStyle = (a + c) / 2 >= 0 ? C.up : C.dn; ctx.fillRect(X(s - 1), Math.min(mid, Y(c)), X(s) - X(s - 1) + 0.5, Math.abs(Y(c) - mid));
    }
    ctx.globalCompositeOperation = 'source-over';
    const now = v[S.si];
    ctx.globalAlpha = fade; ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = C.tx;
    const name = `${nameOf(net, net.ids[sp.i])} vs ${nameOf(net, net.ids[sp.j])}`;
    ctx.fillText(name, sx0, sy0 - 4); const nw = ctx.measureText(name).width;
    ctx.fillStyle = Number.isFinite(now) ? (now >= 0 ? C.up : C.dn) : C.tx2; ctx.fillText(Number.isFinite(now) ? `${fmt(now)} ${now >= 0.2 ? '▲ together' : now <= -0.2 ? '▼ opposite' : '· near zero'}` : 'n/a', sx0 + nw + 10, sy0 - 4);
    if (!cp) { ctx.fillStyle = C.tx2; ctx.globalAlpha = fade * 0.7; ctx.textAlign = 'right'; ctx.fillText(`${S.w}-day correlation at each week · ${sp.why}`, sx1, sy0 - 4); ctx.textAlign = 'left'; }
  } else { ctx.globalAlpha = fade * 0.7; ctx.fillStyle = C.tx2; ctx.fillText('reading the history for the strip...', sx0, sy0 - 4); }
  ctx.fillStyle = C.tx2; ctx.globalAlpha = fade * 0.5; ctx.fillText('+0.5', sx0 + 2, Y(0.5) - 2); ctx.fillText('-0.5', sx0 + 2, Y(-0.5) + 11);
  // the shown date
  const cx = X(S.si); ctx.globalAlpha = fade; ctx.strokeStyle = C.tx; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx, sy0 - 2); ctx.lineTo(cx, sy0 + sh + 2); ctx.stroke();
  const vv = S.strip?.v?.[S.si]; if (Number.isFinite(vv)) { ctx.fillStyle = C.tx; ctx.beginPath(); ctx.arc(cx, Y(vv), 3.5, 0, 6.2832); ctx.fill(); }
  // click anywhere on the strip to jump: one hit point per step along its middle (bigger spacing on the phone)
  const every = Math.max(1, Math.ceil(N / ((sx1 - sx0) / (cp ? 14 : 9))));
  for (let s = 0; s < N; s += every) g.hit('net:@t' + s, X(s), mid);
  // the key line under the strip
  ctx.globalAlpha = fade * 0.8; ctx.fillStyle = C.tx2; ctx.font = '11px ui-monospace,monospace';
  if (cp) wrap(ctx, KEY_LINE, x1 - x0).slice(0, 3).forEach((l, i) => ctx.fillText(l, x0, keyY + i * 13));
  else ctx.fillText(KEY_LINE, x0, keyY);
}

registerJarvisModule({
  id: 'net', label: 'NETWORK',
  render(pane, api) {
    pane.innerHTML = `<h3>NETWORK</h3><p>The markets as a neural net. Markets that have moved together over the chosen window (20, 60 or 120 trading days) sit close; those that moved opposite sit far apart. Links appear only above the threshold: green for moved together, red for moved opposite, pulses run along them. Click a market to see its strongest partners.</p><p>The time scrub moves the window's end date back through about three years, a week at a time, using only the data up to that date; PLAY walks it forward so you can watch groups form and break.</p><p class="jv-sub">It describes how these moved together in a past window. That is not a relationship that persists, and never a forecast.</p><div class="jv-row"><label>link threshold |r| &gt;= <b data-n="v">${S.thr.toFixed(2)}</b> <input type="range" min="0.2" max="0.9" step="0.05" value="${S.thr}" data-n="thr"></label></div><div class="jv-row"><label>window <select data-n="w">${WINDOWS.map(w => `<option value="${w}"${w === S.w ? ' selected' : ''}>${w} days</option>`).join('')}</select></label></div><div class="jv-row"><label>window ending <b data-n="d">${S.cur?.date ?? 'latest'}</b> <input type="range" min="0" max="${Math.max(0, last())}" step="1" value="${Math.max(0, S.si)}" data-n="t"></label></div><div class="jv-row"><button type="button" data-n="go">ENTER THE NETWORK</button></div>`;
    const v = pane.querySelector('[data-n="v"]');
    pane.querySelector('[data-n="thr"]').oninput = e => { S.thr = Number(e.target.value); v.textContent = S.thr.toFixed(2); relink(); };
    const d = pane.querySelector('[data-n="d"]'), tr = pane.querySelector('[data-n="t"]');
    pane.querySelector('[data-n="w"]').onchange = e => { setW(Number(e.target.value)); tr.max = Math.max(0, last()); tr.value = S.si; d.textContent = S.cur?.date ?? ''; };
    tr.oninput = e => { S.play = false; goStep(Number(e.target.value)); d.textContent = S.cur?.date ?? ''; };
    pane.querySelector('[data-n="go"]').onclick = () => { api.setView('net'); load(api, true); };
  },
  views: [{ id: 'net', label: 'NETWORK', env: { accent: 'up', chrome: 'clean', scan: false }, draw, onEnter: api => { S.showP = null; load(api); }, onLeave: () => { S.showP = null; } }],
});

registerShowScene({
  id: 'net', after: 'lean',
  prepare: api => load(api).then(n => (n ? { ok: true } : null)).catch(() => null),
  build: (inp, data) => {
    const net = S.net; if (!data || !net) return null; const text = netScript(net), ch = net.change;
    return text ? { title: 'The correlation network', figure: ch && Math.abs(ch.delta) >= 0.15 ? { value: `${fmt(ch.then)} → ${fmt(ch.now)}`, label: `${nameOf(net, ch.a)} vs ${nameOf(net, ch.b)}, 3 months` } : undefined, view: 'net', cam: { drift: true }, text, enter: api => { S.showP = 0; S.play = false; if (S.w !== net.window) setW(net.window); goStep(last()); if (api?.st) { api.st.yaw = 0.55; api.st.zoom = 1; } }, motion: (api, p) => { S.showP = p; } } : null;
  },
});

/** Phone: the title, one line of encoding, the link count and 28px threshold buttons, all above the scrub panel. */
function netLegendCompact(ctx, g, net, nl) {
  const { W, H, C, fade } = g, lx = 14, ly = H - 318; ctx.textAlign = 'left';
  ctx.globalAlpha = fade * 0.95; ctx.fillStyle = C.up; ctx.font = '11px ui-monospace,monospace'; ctx.fillText('NETWORK · how markets moved together', lx, ly);
  ctx.fillStyle = C.tx2; ctx.globalAlpha = fade * 0.85;
  ctx.fillText(`green together · red opposite · |r| >= ${S.thr.toFixed(2)}: ${nl}`, lx, ly + 26);
  ctx.fillStyle = C.up; ctx.globalAlpha = fade * 0.9; ctx.strokeStyle = C.up; ctx.lineWidth = 1; ctx.font = '14px ui-monospace,monospace';
  for (const [k, x] of [['-', W - 78], ['+', W - 42]]) { ctx.strokeRect(x, ly - 14, 30, 28); ctx.textAlign = 'center'; ctx.fillText(k, x + 15, ly + 5); g.hit('net:' + k, x + 15, ly); }
  ctx.restore();
}
