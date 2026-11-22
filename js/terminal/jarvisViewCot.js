// js/terminal/jarvisViewCot.js: Jarvis's POSITIONING TERRAIN hologram (view 'cot', WebGL via js/terminal/jarvisGL.js). Three years of CFTC Commitments of Traders positioning
// for every market the desk follows, as one landscape: where speculators sit, market by market, week by week, and which of them are stretched against their own history.
//
// ENCODING
//   across (x)   one ridge per market, grouped by asset class (FX, indices, Treasuries, metals, energy, crypto, grains, softs, livestock), each group labelled on the floor.
//   depth (z)    the report week: the oldest at the back, the LATEST REPORT at the front edge (labelled with its Tuesday as-of date and Friday release).
//   height       speculators' net position as a share of open interest (leveraged funds for financial contracts, managed money for commodities), signed: net long rises
//                above the glass plane, net short sinks below it. Linear, one shared scale for every market (the 99th percentile of |share| over the window); a taller cell is
//                clipped and carries a white tip (capped). The scale post at the left reads in % of open interest.
//   colour       direction (up token = net long, dn token = net short; the second cue is above / below the glass), blended smoothly into GOLD as the week's value nears
//                either end of that market's own window (25th..75th = plain, 90th+ or 10th- = full gold), brightness rising with distance from the median.
//   front dots   each market's latest report; a GOLD BEACON (a beam pointing the way the market leans, plus a label) marks a market at the 90th percentile or above, or the
//                10th or below, of its own history: the same rule and thresholds as cot-extremes.html (rank of the latest value among the prior weeks, 52 weeks minimum).
//   ASSET MANAGERS (toggle) a second translucent sheet, in the view's accent, for the financial contracts that carry the asset-manager share, so a gap between the two
//                groups shows. The toggle is hidden when the feed carries no such field (today's /api/desk-cot-history does not), and the readout says so.
//   click        a market's front dot (or ‹ › to step) lights its ridge, dims the rest and opens a card: current net share, percentile, 4-week change, report date.
// DATA  /api/desk-cot-history?weeks=156 (server.js): { series: { SYM: { label, dates, specShare, amShare? } } } from KV cot_series_v2 written by the cot-extremes engine (_worker.js).
//       JPY, CAD and CHF are already in USD-pair terms there (long = long the dollar). Parsing, percentiles, scale and the spoken line: js/terminal/cotHoloCore.js. Ten-minute cache.
// DESCRIPTION ONLY: where positioning sits against its own past. A crowded market is a description, not a forecast, a signal or a trade.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { glView } from './jarvisGL.js';
import { parseCot, scaleOf, heightOf, windowRanks, toneOf, layoutX, extremes, cardOf, cotScript, cotFigure, placeBox, ordinal, sg, fmtDate, releaseOf, WEEKS } from './cotHoloCore.js';

const ID = 'cot', LABEL = 'POSITIONING TERRAIN', XW = 8.6, ZD = 5.4, ZF = 2.3, HY = 1.2;
const KEY = "height = speculators' net position as a share of open interest · gold = extreme against its own history · positioning, description only, not a forecast";
const S = { M: null, at: 0, busy: null, err: null, sel: null, am: false, showP: -1, showAt: 0, spin: null };
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = v => typeof v === 'number' && Number.isFinite(v);

/** Read the COT history once per ten minutes. Never throws: a failed read leaves S.err in words. */
export function loadCot(api, force) {
  if (S.busy) return S.busy; if (S.M && !force && Date.now() - S.at < 600000) return Promise.resolve(S.M);
  S.busy = (async () => {
    let j = null; try { j = await api.jf(`/api/desk-cot-history?weeks=${WEEKS}`); } catch (e) { j = null; }
    if (!j) { S.err = 'The positioning history could not be read right now.'; S.M = null; }
    else { const M = parseCot(j); S.M = M.markets.length ? M : null; S.err = M.markets.length ? null : (M.error || 'No COT series is cached yet.'); if (!S.M?.hasAm) S.am = false; }
    S.at = Date.now(); S.busy = null; return S.M;
  })();
  return S.busy;
}
const step = d => { const ms = S.M?.markets ?? []; if (!ms.length) return; const i = ms.findIndex(m => m.sym === S.sel); S.sel = ms[i < 0 ? (d > 0 ? 0 : ms.length - 1) : (i + d + ms.length) % ms.length].sym; };

function setup(L, H, api) {
  const { THREE } = L, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200), kit = H.kit;
  let data = null, builtFor = null, B = null, deco = false, selLine = null, selFor = null, amFor = null;
  const disposeGroup = g => g?.traverse(o => { o.geometry?.dispose?.(); const m = o.material; if (m) { kit._holo.delete(m); kit._mats.delete(m); if (!m.map) m.dispose?.(); } });
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };

  function build(M, C) {
    if (data) { scene.remove(data); disposeGroup(data); } data = new THREE.Group(); scene.add(data); selLine = null; selFor = null; amFor = null;
    if (!deco) { deco = true; scene.add(kit.dust(500, 30, C.blue)); }
    const nw = M.weeks.length, Lx = layoutX(M.markets, XW, 1.5), scale = scaleOf(M.markets, 0.99, M.hasAm), hw = Lx.slot * 0.34;
    const Zj = j => (nw > 1 ? ZF - (nw - 1 - j) * ZD / (nw - 1) : ZF), Yh = h => h * HY;
    const cUp = H.color(C.up), cDn = H.color(C.dn), cGold = H.color(C.gold), cTx = H.color(C.tx), cTx2 = H.color(C.tx2), cAcc = H.color(C.blue), tmp = new THREE.Color();
    const tint = (v, p, out) => { const t = toneOf(p); out.copy(v >= 0 ? cUp : cDn).lerp(cGold, t.gold).multiplyScalar(t.bright); return out; };
    // the glass plane, the group gutters and the year lines
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(XW + 0.8, ZD + 0.7), new THREE.MeshBasicMaterial({ color: cAcc, opacity: 0.045, ...additive }));
    fl.rotation.x = -Math.PI / 2; fl.position.z = ZF - ZD / 2; data.add(fl);
    const grid = [], gutter = Lx.slot * 0.75;
    Lx.groups.forEach((gp, i) => { if (i) grid.push([gp.x0 - gutter, 0, ZF + 0.3, gp.x0 - gutter, 0, ZF - ZD - 0.2]); });
    const years = []; for (let j = 1; j < nw; j++) if (M.weeks[j].slice(0, 4) !== M.weeks[j - 1].slice(0, 4)) { years.push({ j, y: M.weeks[j].slice(0, 4) }); grid.push([-XW / 2 - 0.3, 0, Zj(j), XW / 2 + 0.3, 0, Zj(j)]); }
    grid.push([-XW / 2 - 0.3, 0, ZF, XW / 2 + 0.3, 0, ZF]);
    data.add(kit.segments(grid, cAcc, 0.16));
    // the scale post at the left front corner: ticks at +-50% and +-100% of the scale
    const px = -XW / 2 - 0.45, post = [[px, -HY, ZF, px, HY, ZF]]; for (const f of [-1, -0.5, 0.5, 1]) post.push([px - 0.06, Yh(f), ZF, px + 0.06, Yh(f), ZF]);
    data.add(kit.segments(post, cTx2, 0.45));
    // one ridge per market: a lit strip at the value's height, a faint curtain down to the glass, a bright crest line
    const R = [], capP = [], front = [];
    M.markets.forEach((m, i) => {
      const x = Lx.x[i], ranks = windowRanks(m.spec), sp = new Float32Array(nw * 6), sc = new Float32Array(nw * 6), cp = new Float32Array(nw * 6), cc = new Float32Array(nw * 6);
      const idx = [], cidx = [], crest = [], crestC = []; let lastJ = -1;
      for (let j = 0; j < nw; j++) {
        const v = m.spec[j]; if (!fin(v)) continue; const hv = heightOf(v, scale), y = Yh(hv.h), z = Zj(j); tint(v, ranks[j], tmp).multiplyScalar(0.3 + 0.7 * Math.pow(j / Math.max(1, nw - 1), 1.6));   // older weeks dimmer, so the latest edge reads first
        sp.set([x - hw, y, z, x + hw, y, z], j * 6); sc.set([tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b], j * 6);
        cp.set([x, y, z, x, 0, z], j * 6); cc.set([tmp.r * 0.8, tmp.g * 0.8, tmp.b * 0.8], j * 6);   // the foot of the curtain stays dark (the array starts zeroed)
        if (hv.capped) capP.push([x, y + Math.sign(y) * 0.035, z]);
        if (lastJ >= 0 && lastJ === j - 1) { const a = 2 * lastJ, b = 2 * j; idx.push(a, a + 1, b, a + 1, b + 1, b); cidx.push(a, a + 1, b, a + 1, b + 1, b);
          crest.push(x, sp[lastJ * 6 + 1], Zj(lastJ), x, y, z); crestC.push(sc[lastJ * 6], sc[lastJ * 6 + 1], sc[lastJ * 6 + 2], tmp.r, tmp.g, tmp.b); }
        lastJ = j;
      }
      const grp = new THREE.Group(), mats = [];
      const mesh = (pos, col, ix, op) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(ix); const mt = new THREE.MeshBasicMaterial({ vertexColors: true, opacity: op, ...additive }); mats.push([mt, op]); grp.add(new THREE.Mesh(g, mt)); };
      if (idx.length) { mesh(sp, sc, idx, 0.2); mesh(cp, cc, cidx, 0.05); }
      if (crest.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(crest, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(crestC, 3)); const mt = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }); mats.push([mt, 0.6]); grp.add(new THREE.LineSegments(g, mt)); }
      data.add(grp);
      const jt = lastJ, top = jt >= 0 ? [x, Yh(heightOf(m.spec[jt], scale).h), Zj(jt)] : null;
      if (top) front.push({ i, p: top, c: (m.cur >= 0 ? cUp : cDn).clone().lerp(cGold, toneOf(m.pct).gold).lerp(cTx, 0.25) });
      R.push({ m, x, grp, mats, top, jt, am: null });
    });
    // the latest report: one dot per market, coloured by its official percentile, and a faint white edge line on the glass
    if (front.length) { const p = kit.points(front.length, cTx, 8, { colors: true, opacity: 1 }), a = p.geometry.attributes.position.array, ca = p.geometry.attributes.color.array;
      front.forEach((f, n) => { a.set(f.p, n * 3); ca.set([f.c.r, f.c.g, f.c.b], n * 3); });
      p.geometry.attributes.color.needsUpdate = true; data.add(p); }
    if (capP.length) { const p = kit.points(capP.length, cTx, 4, { opacity: 0.9 }), a = p.geometry.attributes.position.array; capP.forEach((q, n) => a.set(q, n * 3)); data.add(p); }
    // gold beacons: a beam pointing the way the market leans, from its latest dot, and a flare at the tip
    const beacons = [];
    for (const r of R) { if (!r.m.ext || !r.top) continue; const dir = r.m.ext === 'long' ? 1 : -1, tip = [r.top[0], r.top[1] + dir * 0.62, r.top[2]];
      data.add(kit.line([r.top, tip], cGold, 2.6, 0.9)); const f = kit.flare(cGold, 0.32, 0.9); f.position.set(...tip); data.add(f); beacons.push({ r, tip, f }); }
    // the asset-manager sheets (hidden until the toggle), in the accent colour
    if (M.hasAm) for (const r of R) { const am = r.m.am; if (!am?.some(fin)) continue;
      const pos = [], ix = [], ln = []; let k = 0, prev = -1;
      for (let j = 0; j < nw; j++) { const v = am[j]; if (!fin(v)) { prev = -1; continue; } const y = Yh(heightOf(v, scale).h), z = Zj(j); pos.push(r.x - hw * 1.25, y, z, r.x + hw * 1.25, y, z);
        if (prev >= 0) { ix.push(prev, prev + 1, k, prev + 1, k + 1, k); ln.push([r.x, pos[prev * 3 + 1], Zj(j - 1), r.x, y, z]); } prev = k; k += 2; }
      if (!ix.length) continue; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(ix);
      const grp = new THREE.Group(); grp.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: cAcc, opacity: 0.07, ...additive }))); grp.add(kit.segments(ln, cAcc, 0.4)); grp.visible = false; data.add(grp); r.am = grp; }
    B = { M, R, Lx, Zj, Yh, scale, nw, beacons, years, hw, cTx, capped: capP.length > 0 };
  }

  function applySel() {
    if (!B) return; if (selLine) { data.remove(selLine); kit.forget(selLine); selLine = null; }
    for (const r of B.R) { const on = !S.sel || r.m.sym === S.sel, k = S.sel ? (on ? 1.35 : 0.2) : 1; for (const [mt, op] of r.mats) mt.opacity = Math.min(1, op * k); }
    const r = B.R.find(x => x.m.sym === S.sel);
    if (r) { const pts = []; for (let j = 0; j < B.nw; j++) { const v = r.m.spec[j]; if (fin(v)) pts.push([r.x, B.Yh(heightOf(v, B.scale).h) + 0.01, B.Zj(j)]); } if (pts.length > 1) { selLine = kit.line(pts, B.cTx, 2.4, 0.85); data.add(selLine); } }
    selFor = S.sel;
  }

  return {
    scene, camera, bloom: { strength: 0.38, radius: 0.4, threshold: 0.18 },
    update(t, dt, a0, g) {
      const a = a0 ?? api;
      if (!S.M && !S.busy && !S.err) loadCot(a);
      const sel = a.st.sel;
      if (typeof sel === 'string' && sel.startsWith('cot:')) { const k = sel.slice(4); if (k === 'prev') step(-1); else if (k === 'next') step(1); else if (k === 'clear') S.sel = null; else if (k === 'am') S.am = !!S.M?.hasAm && !S.am; else if (k.startsWith('m:')) S.sel = S.sel === k.slice(2) ? null : k.slice(2); a.st.sel = null; a.blip?.(760, 0.05); }
      if (S.sel && !S.M?.markets.some(m => m.sym === S.sel)) S.sel = null;
      const sig = S.M ? `${S.at}|${S.M.weeks.length}|${S.M.markets.length}` : null;
      if (S.M && sig !== builtFor) { builtFor = sig; build(S.M, g.C); }
      if (!S.M && data) { scene.remove(data); disposeGroup(data); data = null; B = null; builtFor = null; }
      if (B && selFor !== S.sel) applySel();
      if (B && amFor !== S.am) { for (const r of B.R) if (r.am) r.am.visible = S.am; amFor = S.am; }
      const show = S.showP >= 0 && Date.now() - S.showAt < 1500, calm = H.calm;
      const sway = show ? -0.5 + S.showP * 0.9 : calm ? 0 : Math.sin(t * 0.05) * 0.15;
      const r = B && S.sel ? B.R.find(x => x.m.sym === S.sel) : null, tx = r ? r.x * 0.45 : 0;
      H.orbit(camera, a.st, { dist: g.compact ? Math.max(16, 15 / Math.max(0.3, g.W / Math.max(1, g.H))) : 10.4, target: [tx, 0.15, ZF - ZD * 0.4], elev: g.compact ? 0.62 : 0.46, lo: 0.06, hi: 1.3, yawAdd: sway });
      if (B && !calm) for (const b of B.beacons) b.f.material.opacity = 0.65 + 0.35 * Math.sin(t * 2.4 + b.r.x);
    },
    overlay(ctx, g, a) { overlay(ctx, g, a, H, camera, B); },
    dispose() { disposeGroup(scene); },
  };
}

// ───────────────────────── the 2D layer: readout, buttons, labels, card, key ─────────────────────────
function overlay(ctx, g, api, H, camera, B) {
  const { W, H: Hh, C, fade } = g, cp = g.compact; ctx.save(); ctx.globalAlpha = fade; ctx.textAlign = 'left';
  const font = (px, w = '') => { ctx.font = `${w}${px}px ui-monospace,monospace`; };
  const msg = (s, y = Hh / 2, col = C.tx2) => { font(13); ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(s, W / 2, y); ctx.textAlign = 'left'; };
  if (!S.M) { msg(S.err ? `${S.err.charAt(0).toUpperCase()}${S.err.slice(1).replace(/\.?$/, '.')} There is no positioning terrain to draw.` : 'Reading three years of COT reports...'); keyLine(ctx, g); ctx.restore(); return; }
  if (!B || B.M !== S.M) { msg('Raising the terrain...'); ctx.restore(); return; }
  const M = S.M, Sx = p => H.toScreen(p, camera), bg = 'rgba(0,0,0,0.72)', taken = [], E = extremes(M.markets);
  const bounds = { x0: 4, y0: cp ? 118 : 146, x1: W - 4, y1: Hh - (cp ? 128 : 92) };
  const box = (text, px, w = '') => { font(px, w); return { w: ctx.measureText(text).width + 8, h: px + 6 }; };
  const draw = (r, text, col, px, w = '') => { font(px, w); ctx.globalAlpha = fade * 0.9; ctx.fillStyle = bg; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = fade; ctx.fillStyle = col; ctx.fillText(text, r.x + 4, r.y + px + 1); };
  const label = (p, text, col, px, w, cands) => { if (!p.vis) return null; const d = box(text, px, w), r = placeBox(cands.map(([dx, dy]) => ({ x: p.x + dx(d.w), y: p.y + dy(d.h), w: d.w, h: d.h })), taken, bounds); if (r) draw(r, text, col, px, w); return r; };
  const right = () => 9, left = w => -9 - w, mid = w => -w / 2, up = h => -h - 7, down = () => 7, cen = h => -h / 2;
  // buttons: ‹ name › and the asset-manager toggle (only when the field exists)
  buttons(ctx, g, M, taken);
  // the readout, top left
  const rel = releaseOf(M.report), nExt = E.long.length + E.short.length, stale = M.markets.filter(m => m.stale).length;
  const head = `${LABEL} · COT report ${fmtDate(M.report)}`;
  const l1 = `positions as of Tuesday, released Friday${rel ? ` ${fmtDate(rel, false)}` : ''}`;
  const l2 = `${M.markets.length} markets · ${M.weeks.length} weeks · ${fmtDate(M.weeks[0])} to ${fmtDate(M.report)}`;
  const l3 = nExt ? `at an extreme of their own history: ${E.long.length} long (90th+), ${E.short.length} short (10th-)` : 'no market beyond its own 90th / 10th percentile';
  const l4 = M.hasAm ? (S.am ? 'accent sheet = asset managers\' net share (financial contracts)' : 'ASSET MANAGERS adds the real-money sheet') : 'asset-manager share: not in this feed, so no second sheet';
  if (cp) { const x = 12, y = 136; ctx.globalAlpha = fade * 0.75; ctx.fillStyle = bg; ctx.fillRect(x - 6, y - 16, W - 12, 52); ctx.globalAlpha = fade; font(12, '600 '); ctx.fillStyle = C.blue; ctx.fillText(`POSITIONING · ${fmtDate(M.report)}`, x, y); font(11); ctx.fillStyle = C.tx; ctx.fillText(`as of Tue, released Fri · ${M.markets.length} mkts · ${M.weeks.length} wks`, x, y + 15);
    ctx.fillStyle = nExt ? C.gold : C.tx2; ctx.fillText(nExt ? `extremes: ${E.long.length} long, ${E.short.length} short` : 'no market at an extreme', x, y + 30); taken.push({ x: 8, y: y - 14, w: W - 16, h: 50 }); bounds.y0 = y + 40; }
  else { const x = 22, y = 176; ctx.globalAlpha = fade * 0.75; ctx.fillStyle = bg; ctx.fillRect(x - 10, y - 20, 530, 92 + (stale ? 14 : 0) + (B.capped ? 14 : 0)); ctx.globalAlpha = fade; font(13, '600 '); ctx.fillStyle = C.blue; ctx.fillText(head, x, y); font(12); ctx.fillStyle = C.tx; ctx.fillText(l1, x, y + 18); ctx.fillStyle = C.tx2; ctx.fillText(l2, x, y + 34);
    ctx.fillStyle = nExt ? C.gold : C.tx2; ctx.fillText(l3, x, y + 50); font(11); ctx.fillStyle = C.tx2; let yy = y + 66; ctx.fillText(l4, x, yy); yy += 14;
    if (B.capped) { ctx.fillText('white tips = beyond the height scale, clipped', x, yy); yy += 14; }
    if (stale) { ctx.fillText(`${stale} market${stale > 1 ? 's' : ''} carried from an older report (shorter ridge)`, x, yy); yy += 14; }
    font(12); taken.push({ x: x - 4, y: y - 16, w: Math.max(ctx.measureText(l3).width, ctx.measureText(l2).width) + 12, h: yy - y + 8 }); }
  // the selection card reserves its space first, so labels keep clear of it
  const card = S.sel ? cardRect(g) : null; if (card) taken.push(card);
  // front-dot hit targets (every market) and the beacon labels, most stretched first
  for (const r of B.R) { if (!r.top) continue; const p = Sx(r.top); if (p.vis) g.hit(`cot:m:${r.m.sym}`, p.x, p.y); }
  const sel = B.R.find(r => r.m.sym === S.sel);
  if (sel?.top) { const p = Sx(sel.top), m = sel.m; label(p, `${m.name} ${sg(m.cur)}%${m.pct != null ? ` · ${ordinal(m.pct)}` : ''}`, C.tx, 13, '600 ', m.cur >= 0 ? [[mid, up], [right, up], [left, up], [right, cen], [left, cen]] : [[mid, down], [right, down], [left, down], [right, cen], [left, cen]]); }
  // the front edge, the oldest week and the scale first: they matter more than any one beacon
  const fr = Sx([XW / 2 + 0.35, 0, ZF]);
  label(fr, `◀ LATEST · ${fmtDate(M.report, false)} (Tue)`, C.tx, cp ? 11 : 12, '600 ', [[right, cen], [left, down], [mid, down]]) ?? label(Sx([0, 0, ZF + 0.6]), `front edge = latest report, ${fmtDate(M.report, false)}`, C.tx, 11, '', [[mid, down]]);
  label(Sx([XW / 2 + 0.35, 0, ZF - ZD]), fmtDate(M.weeks[0]), C.tx2, 11, '', [[right, cen], [left, up], [mid, up]]);
  const px = -XW / 2 - 0.45; if (!cp) { label(Sx([px, HY, ZF]), `+${Math.round(B.scale)}% of OI · long`, C.up, 11, '', [[left, cen], [right, cen], [mid, down]]); label(Sx([px, -HY, ZF]), `−${Math.round(B.scale)}% of OI · short`, C.dn, 11, '', [[left, cen], [right, cen], [mid, down]]); }
  for (const gp of B.Lx.groups) label(Sx([gp.xc, 0, ZF + 0.42]), gp.name, C.blue, cp ? 11 : 12, '600 ', [[mid, () => 14], [mid, () => 30]]);
  const beac = [...E.long, ...E.short].sort((a, b) => Math.abs(b.pct - 50) - Math.abs(a.pct - 50)).slice(0, cp ? 4 : 12);
  for (const m of beac) { if (m.sym === S.sel) continue; const b = B.beacons.find(x => x.r.m === m); if (!b) continue; const L = m.ext === 'long';
    label(Sx(b.tip), `${m.name} ${ordinal(m.pct)} ${L ? '▲' : '▼'}`, S.sel ? C.tx2 : C.gold, cp ? 11 : 12, '600 ', L ? [[mid, up], [right, cen], [left, cen], [right, up], [left, up]] : [[mid, down], [right, cen], [left, cen], [right, down], [left, down]]); }
  // the year lines
  if (!cp) for (const yv of B.years) label(Sx([XW / 2 + 0.35, 0, B.Zj(yv.j)]), yv.y, C.tx2, 11, '', [[right, cen]]);
  // the remaining market names, quietly, where they fit (desktop)
  if (!cp) for (const r of B.R) { if (!r.top || r.m.ext || r.m.sym === S.sel) continue; label(Sx([r.x, 0, ZF + 0.12]), r.m.name, C.tx2, 11, '', [[mid, down]]); }
  if (card) drawCard(ctx, g, card, M);
  keyLine(ctx, g);
  ctx.restore();
}

function buttons(ctx, g, M, taken) {
  const { W, C, fade } = g, cp = g.compact, y = cp ? 100 : 128, bh = cp ? 30 : 26, m = M.markets.find(x => x.sym === S.sel);
  const items = [['prev', '‹', cp ? 40 : 30], ['name', m ? m.name : 'PICK A MARKET', cp ? 140 : 150], ['next', '›', cp ? 40 : 30]];
  if (M.hasAm) items.push(['am', S.am ? 'ASSET MANAGERS ✓' : 'ASSET MANAGERS', cp ? 132 : 150]);
  const gap = 8, tw = items.reduce((s, it) => s + it[2], 0) + gap * (items.length - 1); let x = W / 2 - tw / 2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `600 ${cp ? 11 : 12}px ui-monospace,monospace`;
  for (const [k, lb, w] of items) { const cx = x + w / 2, on = k === 'am' && S.am;
    ctx.globalAlpha = fade * 0.85; ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(x, y - bh / 2, w, bh);
    if (on) { ctx.globalAlpha = fade * 0.2; ctx.fillStyle = C.blue; ctx.fillRect(x, y - bh / 2, w, bh); }
    ctx.strokeStyle = C.blue; ctx.globalAlpha = fade * (k === 'name' ? 0.45 : 0.95); ctx.lineWidth = on ? 1.6 : 1; ctx.strokeRect(x, y - bh / 2, w, bh);
    ctx.fillStyle = k === 'name' ? C.blue : C.tx; ctx.globalAlpha = fade; ctx.fillText(lb, cx, y + 1); if (k !== 'name') g.hit(`cot:${k}`, cx, y); x += w + gap; }
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; taken.push({ x: W / 2 - tw / 2 - 4, y: y - bh / 2 - 4, w: tw + 8, h: bh + 8 });
}

function cardRect(g) { const { W, H: Hh } = g, cp = g.compact, w = cp ? W - 24 : 380, h = cp ? 134 : 150; return { x: cp ? 12 : W - w - 22, y: cp ? Hh - 128 - h - 40 : 160, w, h }; }
function drawCard(ctx, g, r, M) {
  const k = cardOf(M, S.sel); if (!k) return; const { C, fade } = g, cp = g.compact, f = cp ? 11 : 12, lh = cp ? 15 : 17, col = c => ({ tx: C.tx, tx2: C.tx2, up: C.up, dn: C.dn, gold: C.gold, blue: C.blue }[c] ?? C.tx);
  const lines = k.lines.slice(0, cp ? 6 : 7), h = 34 + lines.length * lh; r.h = h;
  ctx.globalAlpha = fade * 0.85; ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(r.x, r.y, r.w, h); ctx.globalAlpha = fade * 0.9; ctx.strokeStyle = k.m.ext ? C.gold : C.blue; ctx.lineWidth = 1; ctx.strokeRect(r.x, r.y, r.w, h);
  ctx.globalAlpha = fade; ctx.textAlign = 'left'; ctx.font = `600 ${f + 2}px ui-monospace,monospace`; ctx.fillStyle = k.m.ext ? C.gold : C.blue; ctx.fillText(k.title, r.x + 10, r.y + 20);
  ctx.font = `${f}px ui-monospace,monospace`; ctx.textAlign = 'right'; ctx.fillStyle = C.tx2; ctx.fillText('close ×', r.x + r.w - 10, r.y + 20); g.hit('cot:clear', r.x + r.w - 32, r.y + 16); ctx.textAlign = 'left';
  const maxW = r.w - 20; lines.forEach(([c, s], i) => { ctx.fillStyle = col(c); let t = s; while (ctx.measureText(t).width > maxW && t.length > 4) t = t.slice(0, -2); ctx.fillText(t === s ? s : `${t}…`, r.x + 10, r.y + 40 + i * lh); });
}

function keyLine(ctx, g) {
  const { W, H: Hh, C, fade } = g; ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'center'; const maxW = W - 24, words = KEY.split(' '), lines = []; let cur = '';
  for (const w of words) { const nx = cur ? `${cur} ${w}` : w; if (ctx.measureText(nx).width > maxW && cur) { lines.push(cur); cur = w; } else cur = nx; } if (cur) lines.push(cur);
  const y0 = Hh - (g.compact ? 96 : 70) - (lines.length - 1) * 14; ctx.globalAlpha = fade * 0.9; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, y0 - 13, W, lines.length * 14 + 8);
  ctx.globalAlpha = fade; ctx.fillStyle = C.tx2; lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * 14)); ctx.textAlign = 'left';
}

const view = glView({ id: ID, label: LABEL, env: { accent: 'pur', chrome: 'clean', scan: false }, setup,
  onEnter: api => { S.showP = -1; S.spin = api.st.spin; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); loadCot(api); },
  onLeave: api => { S.showP = -1; if (S.spin != null) api.st.spin = S.spin; S.spin = null; } });
registerJarvisModule({
  id: ID, label: LABEL,
  render(pane, api) {
    pane.innerHTML = `<h3>POSITIONING TERRAIN: THREE YEARS OF COT</h3><p>Every futures market the desk follows as a ridge, grouped by asset class, with three years of weekly reports running back from the latest at the front edge. Height is speculators' net position as a share of open interest: long above the glass, short below. A ridge glows gold where positioning sits at an extreme of its own history, and a gold beacon marks any market at its 90th percentile or above, or its 10th or below, today. Click a market for its numbers. The report is as of Tuesday and published on Friday.</p><p class="jv-sub">Positioning, description only, not a forecast.</p><div class="jv-row"><button type="button" data-g="go">RAISE THE TERRAIN</button></div>`;
    pane.querySelector('[data-g="go"]').onclick = () => { api.setView(ID); loadCot(api, true); };
  },
  views: [view],
});

registerShowScene({
  id: ID, after: 'gterrain',
  prepare: api => loadCot(api).catch(() => null),
  build: () => {
    const text = S.M ? cotScript(S.M) : null; if (!text) return null;
    const E = extremes(S.M.markets), focus = E.most?.sym ?? null;
    return { title: 'Where the crowd is stretched', view: ID, cam: null, text, figure: cotFigure(S.M),
      enter: api => { S.sel = null; S.am = false; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); },
      motion: (api, p) => { S.showP = clampN(p, 0, 1); S.showAt = Date.now(); if (p > 0.55 && focus && S.sel !== focus) S.sel = focus; } };
  },
});
