// js/terminal/jarvisViewFxMatrix.js: Jarvis's FX MATRIX hologram (view id 'fxgrid'). The eight major currencies' 8 x 8 "who has out-run whom" grid floats as a sheet of glass over a projector table.
// Rows and columns are the same eight currencies, strongest first, so the grid reads as a wedge: the tallest column sits where the strongest row meets the weakest column.
// ENCODING (also drawn on screen):
//   column height = how far the ROW currency has out-run the COLUMN currency over the chosen window, in sigma (units of a usual move): one linear scale for every window
//                   (0.36 units per sigma), so a morph compares like with like; a gap past 5 sigma is drawn at the cap and its top turns gold with a "capped" tag.
//   above / below = the sign, together with colour: a bright green column RISES where the row out-ran the column; the same gap seen from the other side (the matrix is
//                   antisymmetric: cell b,a = minus cell a,b) HANGS below the glass as a dim red mirror, so nothing is double-counted visually.
//   diagonal      = small accent tiles (a currency against itself); the outer edges carry the currencies as glowing plates (rows on the left, columns along the front), each row plate
//                   labelled with rank and sigma score; plate colour = sign of the score.
//   gold beam     = the biggest gap on the grid (strongest over weakest), labelled.
// Window buttons (1H / 4H / 1D / 1W, the windows the data has) morph the plates and columns smoothly to the new ordering and heights. Clicking a currency plate lights its row and
// column, dims the rest and opens a card with the pairs it has out-run and lagged most. Drag/zoom orbit the camera; reduced motion stops the sway and the morph is instant.
// Data: /api/ccy-strength (js/deskBoardRoutes.js; built by js/ccyStrengthCore.js), the same feed as the terminal's Currency rates matrix (fxMatrixCore.js). Maths in fxHoloCore.js.
// DESCRIPTION ONLY: what has happened over each window. Nothing here is a forecast, a signal or a trade.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { glView, orbitPos, ease } from './jarvisGL.js';
import { holoModel, windowState, heightOf, blendInto, ccyCard, placeLabels, fxgridScript, defaultWindow, shortestWindow, sg, KEYS, CAP_SIGMA } from './fxHoloCore.js';

const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'], N = 8, CELL = 0.46, COLW = 0.25, EDGE = 4.75 * CELL, MORPH = 1.3;
const PAIRS = []; for (const a of CCYS) for (const b of CCYS) if (a !== b) PAIRS.push([a, b]);
const S = { payload: null, model: null, at: 0, busy: null, err: null, key: null, to: null, from: { idx: {}, score: {} }, disp: { idx: {}, score: {} }, mt: 1, sel: null, spin: null, showP: -1, showAt: 0, bg: 'black', labels: [], lastP: null };
for (const c of CCYS) { S.from.idx[c] = S.disp.idx[c] = CCYS.indexOf(c); S.from.score[c] = S.disp.score[c] = 0; }
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
const slot = i => (i - (N - 1) / 2) * CELL;

/** Read /api/ccy-strength (kept two minutes; the feed is live). A failed read leaves the view saying so in words. */
export async function loadFx(api, force) {
  if (S.busy) return S.busy; if (S.model && !force && Date.now() - S.at < 120000) return S.model;
  S.busy = (async () => {
    let j = null, err = null; try { j = await api.jf('/api/ccy-strength'); } catch (e) { err = String(e?.message ?? e); }
    const m = holoModel(j); S.at = Date.now(); S.busy = null;
    if (!m.ok) { S.err = err ? `The currency strength feed is not available right now (${err}).` : `Currency strength is not available: ${m.error}.`; if (!S.model) return null; return S.model; }
    S.err = null; S.model = m; S.payload = j;
    const k = S.key && m.windows.find(w => w.key === S.key && w.available) ? S.key : defaultWindow(m);
    setWindow(k, true); return m;
  })();
  return S.busy;
}
/** Switch window: snapshot what is on screen now and morph from it to the new window's ordering and scores. */
function setWindow(k, keepMorph) {
  if (!S.model) return; const ws = windowState(S.model, k); S.key = k;
  for (const c of CCYS) { S.from.idx[c] = S.disp.idx[c]; S.from.score[c] = S.disp.score[c]; }
  S.to = ws; if (!keepMorph || S.mt >= 1) S.mt = 0;
}

registerJarvisModule({
  id: 'fxgrid', label: 'FX MATRIX',
  render(pane, api) {
    pane.innerHTML = `<h3>FX MATRIX: WHO HAS OUT-RUN WHOM</h3><p>The eight major currencies as a hologram grid, strongest first along both edges. Each glowing column is how far the row currency has out-run the column currency over the chosen window, in units of a usual move; the dim red mirror below the glass is the same gap seen from the other side. Switch windows to watch the grid re-sort; click a currency to light its row and column.</p><p class="jv-sub">What has happened over each window: a description, not a forecast.</p><div class="jv-row"><button type="button" data-g="go">PROJECT THE MATRIX</button></div>`;
    pane.querySelector('[data-g="go"]').onclick = () => { api.setView('fxgrid'); loadFx(api, true); };
  },
  views: [glView({
    id: 'fxgrid', label: 'FX MATRIX', env: { accent: 'cy', chrome: 'clean', scan: false },
    onEnter: api => {
      S.showP = -1; S.spin = api.st.spin; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false });
      try { S.bg = api.win.getComputedStyle(api.doc.documentElement).getPropertyValue('--bg1').trim() || 'black'; } catch (e) { S.bg = 'black'; }
      loadFx(api).catch(() => null);
    },
    onLeave: api => { S.showP = -1; if (S.spin != null) api.st.spin = S.spin; S.spin = null; },
    setup: (L, H, api) => build(L, H, api),
  })],
});

function build(L, H, api) {
  const { THREE } = L, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200), kit = H.kit;
  const C0 = api.colours?.() ?? {}, col = (k, fb) => H.color(C0[k], fb);
  scene.fog = new THREE.FogExp2(new THREE.Color('black'), 0.035);
  scene.add(kit.dust(900, 26, H.color(C0.tx2 ?? 'slategray').getStyle()));
  const table = kit.table(3.3, C0.cy ?? 'cyan', -2.05, 6, 32); scene.add(table);
  // the glass sheet: a faint plane with the cell grid and a brighter frame
  const glassMat = new THREE.MeshBasicMaterial({ color: col('cy', 'cyan'), transparent: true, opacity: 0.035, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(N * CELL, N * CELL), glassMat); glass.rotation.x = -Math.PI / 2; scene.add(glass);
  const gl = [], e = N * CELL / 2; for (let i = 0; i <= N; i++) { const p = -e + i * CELL; gl.push([p, 0, -e, p, 0, e], [-e, 0, p, e, 0, p]); }
  const grid = kit.segments(gl, C0.cy ?? 'cyan', 0.13); scene.add(grid);
  const frame = kit.line([[-e, 0, -e], [e, 0, -e], [e, 0, e], [-e, 0, e], [-e, 0, -e]], C0.cy ?? 'cyan', 1.6, 0.55); scene.add(frame);
  // a soft projector cone: four faint lines from the table centre up to the glass corners
  scene.add(kit.segments([[0, -2.05, 0, -e, 0, -e], [0, -2.05, 0, e, 0, -e], [0, -2.05, 0, e, 0, e], [0, -2.05, 0, -e, 0, e]], C0.cy ?? 'cyan', 0.07));
  const core = kit.flare(C0.cy ?? 'cyan', 0.9, 0.12); core.position.y = -2.0; scene.add(core);

  // the columns: one box (body), its edges and a bright top tile per ordered pair; geometry shared, transformed per frame
  const boxG = new THREE.BoxGeometry(1, 1, 1); boxG.translate(0, 0.5, 0);
  const edgeG = new THREE.EdgesGeometry(boxG), topG = new THREE.PlaneGeometry(1, 1); topG.rotateX(-Math.PI / 2);
  const cells = PAIRS.map(([a, b]) => {
    const body = new THREE.Mesh(boxG, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    const edge = new THREE.LineSegments(edgeG, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    const top = new THREE.Mesh(topG, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    scene.add(body, edge, top); return { a, b, body, edge, top, v: 0, h: 0, capped: false, x: 0, z: 0 };
  });
  // the plates: row plates along the left edge, column plates along the front edge, diagonal tiles
  const plateG = new THREE.PlaneGeometry(0.4, 0.34); plateG.rotateX(-Math.PI / 2); const plateE = new THREE.EdgesGeometry(plateG);
  const diagG = new THREE.PlaneGeometry(0.17, 0.17); diagG.rotateX(-Math.PI / 2); diagG.rotateY(Math.PI / 4);
  const mkPlate = () => { const m = new THREE.Mesh(plateG, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); const l = new THREE.LineSegments(plateE, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })); scene.add(m, l); return { m, l }; };
  const plates = CCYS.map(c => ({ c, row: mkPlate(), colP: mkPlate(), diag: (() => { const d = new THREE.Mesh(diagG, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); scene.add(d); return d; })(), rx: 0, rz: 0, cx: 0, cz: 0 }));
  // the gold beam over the biggest gap
  const beam = kit.line([Array(3).fill(0), [0, 1, 0]], C0.gold ?? 'gold', 3, 0.95); const beamF = kit.flare(C0.gold ?? 'gold', 0.55, 0.9); const beamHalo = kit.line([Array(3).fill(0), [0, 1, 0]], C0.gold ?? 'gold', 9, 0.18); scene.add(beam, beamHalo, beamF);
  const beamTop = Array(3).fill(0);

  const cc = { k: null, up: new THREE.Color(), dn: new THREE.Color(), gold: new THREE.Color(), acc: new THREE.Color(), tx: new THREE.Color() };
  const syncColours = C => { const k = `${C.up}|${C.dn}|${C.gold}|${C.blue}|${C.tx}`; if (k === cc.k) return; cc.k = k; cc.up.copy(H.color(C.up)); cc.dn.copy(H.color(C.dn)); cc.gold.copy(H.color(C.gold)); cc.acc.copy(H.color(C.blue)); cc.tx.copy(H.color(C.tx)); beam.material.color.copy(cc.gold); beamHalo.material.color.copy(cc.gold); beamF.material.color.copy(cc.gold); };

  let sway = 0;
  function update(t, dt, api_, g) {
    syncColours(g.C);
    if (S.model && Date.now() - S.at > 120000 && !S.busy) loadFx(api_).catch(() => null);
    handleSel(api_);
    // morph
    if (S.mt < 1) S.mt = H.calm ? 1 : Math.min(1, S.mt + dt / MORPH);
    blendInto(S.disp, S.from, S.to, ease(S.mt), CCYS);
    const sel = S.sel, has = !!S.to;
    for (const cl of cells) {
      const ri = S.disp.idx[cl.a], ci = S.disp.idx[cl.b], v = has ? S.disp.score[cl.a] - S.disp.score[cl.b] : 0, { h, capped } = heightOf(v);
      cl.v = v; cl.h = h; cl.capped = capped && S.mt >= 1; cl.x = slot(ci); cl.z = slot(ri);
      const hh = Math.abs(h) < 0.004 ? 0.004 * (h < 0 ? -1 : 1) : h, up = v >= 0;
      for (const o of [cl.body, cl.edge]) { o.position.set(cl.x, 0, cl.z); o.scale.set(COLW, hh, COLW); }
      cl.top.position.set(cl.x, hh, cl.z); cl.top.scale.set(COLW, 1, COLW);
      const lit = !sel || cl.a === sel || cl.b === sel, k = (up ? 1 : 0.2) * (lit ? 1 : 0.14) * (sel && lit ? 1.25 : 1);
      const c = up ? cc.up : cc.dn;
      cl.body.material.color.copy(c); cl.edge.material.color.copy(c); cl.top.material.color.copy(cl.capped ? cc.gold : c);
      cl.body.material.opacity = 0.075 * k; cl.edge.material.opacity = Math.min(1, 0.6 * k); cl.top.material.opacity = Math.min(1, 0.42 * k);
      const vis = has && Math.abs(h) > 0.0005; cl.body.visible = cl.edge.visible = cl.top.visible = vis;
    }
    for (const p of plates) {
      const i = S.disp.idx[p.c], s = has ? S.disp.score[p.c] : 0, lit = !sel || sel === p.c, c = !has ? cc.acc : s >= 0 ? cc.up : cc.dn, k = lit ? (sel === p.c ? 1.6 : 1) : 0.25;
      p.rx = -EDGE; p.rz = slot(i); p.cx = slot(i); p.cz = EDGE;
      p.row.m.position.set(p.rx, 0, p.rz); p.row.l.position.copy(p.row.m.position); p.colP.m.position.set(p.cx, 0, p.cz); p.colP.l.position.copy(p.colP.m.position);
      for (const q of [p.row, p.colP]) { q.m.material.color.copy(c); q.l.material.color.copy(sel === p.c ? cc.tx : c); q.m.material.opacity = 0.12 * k; q.l.material.opacity = Math.min(1, 0.7 * k); }
      p.diag.position.set(slot(i), 0.002, slot(i)); p.diag.material.color.copy(cc.acc); p.diag.material.opacity = (lit ? 0.5 : 0.15) * (sel === p.c ? 1.6 : 1);
    }
    // gold beam over the target window's biggest gap (it follows the morph)
    const big = S.to?.biggest, cb = big ? cells.find(x => x.a === big.a && x.b === big.b) : null;
    const showBeam = !!cb && cb.h > 0.05; beam.visible = beamHalo.visible = beamF.visible = showBeam;
    if (showBeam) { const pulse = H.calm ? 1 : 0.85 + 0.15 * Math.sin(t * 2.2); kit.setLine(beam, [[cb.x, cb.h, cb.z], [cb.x, cb.h + 0.7, cb.z]]); kit.setLine(beamHalo, [[cb.x, cb.h, cb.z], [cb.x, cb.h + 0.7, cb.z]]); beamF.position.set(cb.x, cb.h + 0.7, cb.z); beamF.scale.setScalar(0.5 * pulse); beamTop[0] = cb.x; beamTop[1] = cb.h + 0.7; beamTop[2] = cb.z; }
    // camera: the SHOW flight rises over the grid; otherwise the HUD orbit with a slow sway
    sway += H.calm ? 0 : dt;
    const aspect = g.W / Math.max(1, g.H), far = aspect < 1 ? 1.85 : aspect < 1.4 ? 1.25 : 1, tg = aspect < 1 ? [-0.3, 0.1, 0.3] : [0, 0.1, 0], yaw0 = aspect < 1 ? -0.3 : -0.55;
    if (S.showP >= 0 && Date.now() - S.showAt < 1500) {
      const p = ease(S.showP), pos = orbitPos(-1.0 + 0.45 * p, 0.2 + 0.95 * p, (11.5 - 2 * p) * far, tg);
      camera.position.set(pos[0], pos[1], pos[2]); camera.lookAt(tg[0], tg[1], tg[2]);
    } else H.orbit(camera, api_.st, { dist: 10 * far, target: tg, elev: 0.8, lo: 0.08, hi: 1.4, yawAdd: yaw0 + Math.sin(sway * 0.12) * 0.12 });
  }

  function handleSel(api_) {
    const s = api_.st.sel; if (typeof s !== 'string' || !s.startsWith('fx:')) return;
    api_.st.sel = null; api_.blip?.(760, 0.05);
    if (s.startsWith('fx:w:')) { const k = s.slice(5); if (S.model?.windows.find(w => w.key === k && w.available) && k !== S.key) setWindow(k); }
    else if (s.startsWith('fx:c:')) { const c = s.slice(5); S.sel = S.sel === c || !CCYS.includes(c) ? null : c; }
    else if (s === 'fx:clear') S.sel = null;
  }

  function overlay(ctx, g, api_) {
    const { W, H: Hh, C, fade } = g, cp = g.compact, f = cp ? 11 : 12;
    ctx.save(); ctx.textBaseline = 'alphabetic';
    const M = S.model;
    if (!M) { msg(ctx, g, S.err ?? 'Reading the currency strength feed...'); ctx.restore(); return; }
    buttons(ctx, g, M);
    const ws = S.to;
    if (!ws) { msg(ctx, g, `No data for the ${S.key ?? ''} window yet: ${M.windows.find(w => w.key === S.key)?.reason ?? 'the bars are still arriving'}.`); keyLine(ctx, g, null); ctx.restore(); return; }
    // plate labels with collision avoidance (selected first, then the strongest and weakest)
    const items = S.labels; let n = 0;
    const add = (txt, x, y, w, pri, colr, key, kind, h = f + 4) => { const it = items[n] ?? (items[n] = {}); Object.assign(it, { txt, x, y, w, h, pri, colr, key, kind, show: false }); n++; return it; };
    // the HUD's own text is reserved first, so no label lands on it
    for (const b of blocks(g)) add('', b[0], b[1], b[2], 1e9, null, null, 'block', b[3]);
    ctx.font = `600 ${f}px ui-monospace,monospace`;
    for (const c of CCYS) {
      const p = plates.find(q => q.c === c), i = Math.round(S.disp.idx[c]), rank = ws.rank[c], s = ws.score[c], miss = ws.missing.includes(c);
      const pri = (S.sel === c ? 100 : 0) + (i === 0 || i === N - 1 ? 20 : 10 - Math.min(i, N - 1 - i));
      const colr = miss ? C.tx2 : s >= 0.05 ? C.up : s <= -0.05 ? C.dn : C.tx;
      const r = H.toScreen([p.rx - 0.24, 0, p.rz], camera);
      if (r.vis) { const txt = miss ? `${c} n/a` : `#${rank ?? '?'} ${c} ${sg(s)}${cp ? '' : 'σ'}`, w = ctx.measureText(txt).width; add(txt, Math.max(4, r.x - w - 6), r.y - f / 2 - 2, w, pri + 1, colr, c, 'row'); g.hit('fx:c:' + c, r.x + 12, r.y); }
      const q = H.toScreen([p.cx, 0, p.cz + 0.2], camera);
      if (q.vis) { const txt = c, w = ctx.measureText(txt).width; add(txt, q.x - w / 2, q.y + 4, w, pri - 0.5, colr, c, 'col'); if (!cp) g.hit('fx:c:' + c, q.x, q.y - 8); }
    }
    // the selected currency's row of values, and the beam label
    const big = ws.biggest;
    if (big && S.mt >= 1) {
      const bt = H.toScreen(beamTop, camera);
      if (bt.vis) { const txt = `BIGGEST GAP  ${big.a} over ${big.b}  ${sg(big.v)}σ`, w = ctx.measureText(txt).width; add(txt, clampN(bt.x - w / 2, 4, W - w - 4), bt.y - f - 10, w, 90, C.gold, null, 'beam'); }
    }
    if (S.sel && S.mt >= 1 && !cp) for (const cl of cells) {
      if (cl.a !== S.sel || ws.missing.includes(cl.b)) continue; const p = H.toScreen([cl.x, cl.h + (cl.h >= 0 ? 0.06 : -0.06), cl.z], camera); if (!p.vis) continue;
      ctx.font = `${f - 1}px ui-monospace,monospace`; const txt = `${sg(cl.v)}${cl.capped ? ' capped' : ''}`, w = ctx.measureText(txt).width; ctx.font = `600 ${f}px ui-monospace,monospace`;
      add(txt, p.x - w / 2, cl.h >= 0 ? p.y - f - 4 : p.y + 2, w, 50, cl.v >= 0 ? C.up : C.dn, null, 'val');
    }
    for (const cl of cells) if (cl.capped && cl.v > 0 && !S.sel) { const p = H.toScreen([cl.x, cl.h + 0.05, cl.z], camera); if (p.vis) { ctx.font = `${f - 1}px ui-monospace,monospace`; const txt = `capped >${CAP_SIGMA}σ`, w = ctx.measureText(txt).width; add(txt, p.x - w / 2, p.y - f - 4, w, 40, C.gold, null, 'val'); } }
    items.length = n; placeLabels(items, { W, H: Hh, tries: 2 });
    for (const it of items) {
      if (!it.show || it.kind === 'block') continue; const dim = S.sel && it.key && it.key !== S.sel && it.kind !== 'beam';
      ctx.font = it.kind === 'val' ? `${f - 1}px ui-monospace,monospace` : `600 ${f}px ui-monospace,monospace`;
      ctx.globalAlpha = fade * (dim ? 0.35 : 0.72); ctx.fillStyle = S.bg; ctx.fillRect(it.x - 3, it.y - 1, it.w + 6, it.h);
      ctx.globalAlpha = fade * (dim ? 0.45 : 1); ctx.fillStyle = it.colr; ctx.textAlign = 'left'; ctx.fillText(it.txt, it.x, it.y + f);
    }
    header(ctx, g, M, ws); card(ctx, g, M); keyLine(ctx, g, ws);
    ctx.restore();
  }

  // screen rectangles [x, y, w, h] the HUD text occupies (buttons, header, card, key line)
  function blocks(g) {
    const { W, H: Hh } = g, cp = g.compact, out = [];
    out.push(cp ? [W / 2 - 150, 82, 300, 36] : [W / 2 - 140, 112, 280, 32]);
    out.push(cp ? [8, 122, W - 16, 66] : [12, 150, 530, 92]);
    if (S.sel) out.push(cp ? [8, Hh - 262, W - 16, 140] : [W - 362, 150, 350, 126]);
    out.push(cp ? [8, Hh - 108, W - 16, 46] : [12, Hh - 84, 790, 28]);
    return out;
  }

  function msg(ctx, g, text) { const bw = Math.min(600, g.W - 16); ctx.globalAlpha = g.fade * 0.8; ctx.fillStyle = S.bg; ctx.fillRect(g.W / 2 - bw / 2, g.H / 2 - 22, bw, 52); ctx.globalAlpha = g.fade; ctx.fillStyle = g.C.tx2; ctx.font = '13px ui-monospace,monospace'; ctx.textAlign = 'center'; wrap(ctx, text, g.W / 2, g.H / 2, Math.min(560, g.W - 32), 18); }

  function buttons(ctx, g, M) {
    const { W, C, fade } = g, cp = g.compact, y = cp ? 100 : 128, bw = cp ? 64 : 58, bh = cp ? 30 : 26, gap = 8, x0 = W / 2 - (KEYS.length * bw + (KEYS.length - 1) * gap) / 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `600 ${cp ? 12 : 12}px ui-monospace,monospace`;
    KEYS.forEach((k, i) => {
      const w = M.windows.find(x => x.key === k), on = k === S.key, ok = !!w?.available, x = x0 + i * (bw + gap) + bw / 2;
      ctx.globalAlpha = fade * 0.82; ctx.fillStyle = S.bg; ctx.fillRect(x - bw / 2, y - bh / 2, bw, bh);
      ctx.globalAlpha = fade * (on ? 1 : ok ? 0.7 : 0.25); ctx.strokeStyle = on ? C.blue : C.tx2; ctx.lineWidth = on ? 1.6 : 1; ctx.strokeRect(x - bw / 2, y - bh / 2, bw, bh);
      if (on) { ctx.globalAlpha = fade * 0.18; ctx.fillStyle = C.blue; ctx.fillRect(x - bw / 2, y - bh / 2, bw, bh); }
      ctx.globalAlpha = fade * (ok ? 1 : 0.45); ctx.fillStyle = on ? C.blue : ok ? C.tx : C.tx2; ctx.fillText(ok ? k : `${k} n/a`, x, y + 1);
      if (ok) g.hit('fx:w:' + k, x, y);
    });
    ctx.textBaseline = 'alphabetic';
  }

  function header(ctx, g, M, ws) {
    const { C, fade } = g, cp = g.compact, x = cp ? 14 : 22, y = cp ? 138 : 172; ctx.textAlign = 'left';
    const when = M.closed ? `market shut · to ${M.closeLabel ?? 'the last prices'}` : M.asOf ? `as of ${String(M.asOf).slice(11, 16)} UTC` : '';
    ctx.font = `600 ${cp ? 12 : 14}px ui-monospace,monospace`; ctx.globalAlpha = fade; ctx.fillStyle = C.blue; ctx.fillText(`FX MATRIX · ${ws.key} · ${when}`, x, y);
    ctx.font = `${cp ? 11 : 12}px ui-monospace,monospace`; ctx.fillStyle = C.tx2; ctx.globalAlpha = fade * 0.92;
    const lines = cp ? ['rows and columns: strongest first', 'green rises: row out-ran column', 'red mirror below: the same gap reversed'] : ['rows (left) and columns (front): the eight currencies, strongest first', 'bright green column rises where the row out-ran the column', 'dim red mirror below the glass: the same gap seen from the other side', ws.unitPct != null ? `1σ ≈ ${ws.unitPct}% of a usual move over ${ws.key}` : ''];
    lines.forEach((l, i) => l && ctx.fillText(l, x, y + 17 + i * 15));
    if (ws.flat) { ctx.fillStyle = C.gold; ctx.fillText(`The market has barely moved over ${ws.key}: the grid lies flat.`, x, y + 17 + lines.length * 15 + 4); }
  }

  function card(ctx, g, M) {
    if (!S.sel) return; const k = ccyCard(M, S.key, S.sel); if (!k) return;
    const { W, H: Hh, C, fade } = g, cp = g.compact, bw = cp ? W - 28 : 330, x = cp ? 14 : W - bw - 22, y = cp ? Hh - 244 : 172, lh = cp ? 15 : 16, f = cp ? 11 : 12;
    const pairs = a => (a.length ? a.map(o => `${o.ccy} ${sg(o.v)}σ`).join(' · ') : 'none');
    const rows = [
      [C.tx, `#${k.rank ?? '?'} of ${k.of} over ${k.key} · score ${sg(k.score)}σ`],
      [C.up, `out-ran most: ${pairs(k.outran)}`],
      [C.dn, `lagged most: ${pairs(k.lagged)}`],
      [C.tx2, k.wordText ? `lately: ${k.wordText}` : 'lately: needs both short and long windows'],
    ];
    const maxC = Math.floor((bw - 20) / (f * 0.62)), lines = [];
    for (const [c, s] of rows) { let rest = s; while (rest.length > maxC && lines.length < 8) { const cut = rest.lastIndexOf(' ', maxC); const at = cut > 10 ? cut : maxC; lines.push([c, rest.slice(0, at)]); rest = '  ' + rest.slice(at).trim(); } lines.push([c, rest]); }
    const bh = 30 + lines.length * lh + 6;
    ctx.globalAlpha = fade * 0.82; ctx.fillStyle = S.bg; ctx.fillRect(x, y - 16, bw, bh); ctx.globalAlpha = fade * 0.9; ctx.strokeStyle = C.blue; ctx.lineWidth = 1; ctx.strokeRect(x, y - 16, bw, bh);
    ctx.textAlign = 'left'; ctx.font = `600 ${f + 2}px ui-monospace,monospace`; ctx.fillStyle = C.blue; ctx.globalAlpha = fade; ctx.fillText(S.sel, x + 10, y + 2);
    ctx.font = `${f}px ui-monospace,monospace`; ctx.textAlign = 'right'; ctx.fillStyle = C.tx2; ctx.fillText('close ×', x + bw - 10, y + 2); g.hit('fx:clear', x + bw - 30, y - 2); ctx.textAlign = 'left';
    lines.forEach(([c, s], i) => { ctx.fillStyle = c; ctx.fillText(s, x + 10, y + 22 + i * lh); });
  }

  function keyLine(ctx, g, ws) {
    const { W, H: Hh, C, fade } = g, cp = g.compact; ctx.textAlign = 'left'; ctx.font = `${cp ? 11 : 12}px ui-monospace,monospace`;
    const x = cp ? 14 : 22, y = Hh - (cp ? 70 : 64);
    ctx.globalAlpha = fade * 0.95; ctx.fillStyle = C.gold;
    if (cp) { ctx.fillText('column = how far one currency out-ran another,', x, y - 30); ctx.fillText('in its usual-move units', x, y - 15); ctx.fillText('description only, not a forecast', x, y); }
    else ctx.fillText('column = how far one currency out-ran another, in its usual-move units · description only, not a forecast', x, y);
    if (ws && !cp) { ctx.fillStyle = C.tx2; ctx.globalAlpha = fade * 0.8; ctx.fillText('click a currency plate to light its row and column · drag to orbit', x, y - 17); }
    void W;
  }

  return { scene, camera, update, overlay, bloom: { strength: 0.7, radius: 0.45, threshold: 0.12 }, dispose() { boxG.dispose(); edgeG.dispose(); topG.dispose(); plateG.dispose(); plateE.dispose(); diagG.dispose(); } };
}

function wrap(ctx, text, x, y, maxW, lh) {
  const words = String(text).split(/\s+/); let line = '', yy = y;
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = t; }
  if (line) ctx.fillText(line, x, yy);
}

await import('./jarvisViewRatePaths.js').catch(() => null);   // so the 'cbpaths' scene is registered before this one asks to follow it
registerShowScene({
  id: 'fxgrid', after: 'cbpaths',
  prepare: api => loadFx(api).catch(() => null),
  build: () => {
    const text = S.model ? fxgridScript(S.model) : null; if (!text) return null;
    const k = shortestWindow(S.model);
    return { title: 'Who has out-run whom', view: 'fxgrid', cam: null, text,
      enter: api => { S.sel = null; if (k && k !== S.key) setWindow(k); Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); },
      motion: (api, p) => { S.showP = clampN(p, 0, 1); S.showAt = Date.now(); } };
  },
});
