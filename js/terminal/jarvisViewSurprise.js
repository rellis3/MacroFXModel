// js/terminal/jarvisViewSurprise.js: Jarvis's DATA SURPRISES hologram (view 'surprise'). An 8 x 8 holographic city block floating over a glass table: rows = the eight currencies (USD at the back,
// CHF at the front), columns = the eight indicator families (labour, inflation, PPI, growth, PMI, retail, trade, confidence). Each cell is a row of thin glowing slices, one per recent release.
// Row-end plates carry each currency's engine score. Only what matters is bright: the newest print, the biggest beat and the biggest miss of the last two weeks (labelled), and the selected cell.
//
// ENCODING
//   slice           = one release (oldest left, newest right and brightest; up to six per cell)
//   above / below   = beat consensus (stronger economy than expected) rises above the cell's glass mid-plane in the up colour; a miss hangs below it in the down colour (colour AND side)
//   slice length    = |z|, the surprise measured in that release's own usual surprise size, LINEAR up to 3; beyond 3 the slice stops at full length and wears a bright tip, labelled ">3"
//   grey sliver     = a print with no usable z (no consensus, in line, or too little history to size it); an empty cell is a faint dot
//   row-end plate   = the engine composite for the currency (the Macro scorecard), a signed bar: right + up colour, left - down colour, linear to +-1, capped and marked beyond
//   TIME replay     = month by month, each cell becomes one slab: the average z of every release in that family that month (from the surprise store's history), blended smoothly between months
// Click a cell: a card with its last prints (date, actual vs consensus, z), the engine reading, the next release and the polarity note. SHOW scene 'surprise' (after 'reactor').
// Data: /api/macro-engines-board (macroEnginesCore.buildMacroBoard) and /api/econ-surprise?history=1&since=... (the replay; optional). Shaping and scaling in surpriseHoloCore.js.
// Polarity: z is signed so + = stronger economy than expected. Releases outside the known inverted list (unemployment, claims, deficits) are read "higher = stronger" BY ASSUMPTION, so an
// inflation print above consensus shows as a beat; the card says so for those cells and the readout carries the store's assumed share.
// DESCRIPTION ONLY: a record of releases against expectations. Nothing here is a forecast, a signal or a trade.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { glView, orbitPos } from './jarvisGL.js';
import { shapeBoard, extremes, tilts, leaders, monthGrid, gridAt, monthLabel, surpriseScript, surpriseFigure, placeLabels, zText, fmtDate, FAMS, CAP, H_MAX, SLICES } from './surpriseHoloCore.js';

const ID = 'surprise', CW = 1.25, RD = 1.35, SL_DX = 0.15, SL_W = 0.1, SL_D = 0.46, PL_X = 6.15, PL_W = 0.85, MONTH_S = 1.4;
const KEY_LINE = 'slices = recent releases, above = beat consensus, below = missed, size = surprise in its usual units · description only, not a forecast';
const KEY_TIME = 'one slab per cell = that month’s average surprise for the family · above = beat consensus, below = missed · description only, not a forecast';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const colX = j => (j - 3.5) * CW, rowZ = i => (i - 3.5) * RD, sliceX = (j, i, n) => colX(j) + (i - (n - 1) / 2) * SL_DX;
const S = { D: null, selKey: null, mode: 'latest', mi: 11, play: false, showP: -1, showAt: 0, cam: null, base: 0, hudTop: 70, hudAt: -9, bg: 'black', spin: null };
const showing = () => S.showP >= 0 && Date.now() - S.showAt < 1500;

/** Board + history, once per ten minutes. Never throws; the entry says what failed. */
function load(api) {
  const c = S.D; if (c?.busy) return c.busy; if (c && Date.now() - c.at < 600000) return Promise.resolve(c);
  const e = { at: Date.now(), B: c?.B ?? null, G: c?.G ?? null, X: null, T: null, L: null }; S.D = e;
  const since = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  e.busy = Promise.all([api.jf('/api/macro-engines-board').catch(er => ({ ok: false, error: String(er?.message ?? er) })), api.jf(`/api/econ-surprise?history=1&since=${since}`).catch(() => null)]).then(([board, hist]) => {
    try { e.B = shapeBoard(board); } catch (er) { e.B = { ok: false, reason: 'The surprise board could not be read.' }; }
    try { e.G = hist && hist.ok !== false ? monthGrid(hist, { now: e.B?.asOf }) : null; } catch (er) { e.G = null; }
    if (e.B?.ok) { e.X = extremes(e.B); e.T = tilts(e.B); e.L = leaders(e.T); }
    e.at = Date.now(); e.busy = null; return e;
  });
  return e.busy;
}

/** Buttons (hit keys 'sp:...') and cell picks ('sp:c:CCY|fam') arrive through st.sel. */
function commands(api) {
  const st = api.st, s = st.sel, mine = S.selKey ? `sp:c:${S.selKey}` : null;
  if (typeof s === 'string' && s.startsWith('sp:') && !s.startsWith('sp:c:')) {
    const c = s.slice(3), G = S.D?.G;
    if (c === 'latest') { S.mode = 'latest'; S.play = false; }
    else if (c === 'time' && G) { if (S.mode !== 'time') { S.mode = 'time'; S.mi = 0; S.play = true; } else S.play = !S.play; if (S.play && S.mi >= G.months.length - 1.001) S.mi = 0; }
    else if (c === 'close') S.selKey = null;
    else if (c.startsWith('m:') && G) { S.mode = 'time'; S.play = false; S.mi = clamp(+c.slice(2) || 0, 0, G.months.length - 1); }
    st.sel = S.selKey ? `sp:c:${S.selKey}` : null; api.blip?.(760, 0.05); return;
  }
  if (s !== mine) {
    if (typeof s === 'string' && s.startsWith('sp:c:') && S.D?.B?.cells?.[s.slice(5)]) S.selKey = s.slice(5);
    else if (s == null) S.selKey = null;
  }
}

function setup(L, H, api) {
  const { THREE } = L, kit = H.kit, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  scene.add(kit.dust(900, 34));
  let world = null, dyn = null, builtFor = null, colKey = '', styleKey = '';
  const M4 = new THREE.Matrix4(), Q0 = new THREE.Quaternion(), P = new THREE.Vector3(), SC = new THREE.Vector3(), COL = new THREE.Color();

  function build(B, C) {
    if (world) { scene.remove(world); kit.forget(world); } world = new THREE.Group(); scene.add(world); dyn = null;
    const blue = C.blue, cUp = H.color(C.up), cDn = H.color(C.dn), cNo = H.color(C.tx2), cTx = H.color(C.tx);
    world.add(kit.table(9.5, blue, -1.05, 7, 36));
    // the block: a glass mid-plane per row, cell footprints, column dividers
    const plane = new THREE.PlaneGeometry(8 * CW - 0.2, 0.7), foot = [], dash = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ color: H.color(blue), transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2; m.position.set(0, 0, rowZ(i)); world.add(m);
      for (let j = 0; j < 8; j++) { const x0 = colX(j) - 0.46, x1 = colX(j) + 0.46, z0 = rowZ(i) - 0.3, z1 = rowZ(i) + 0.3; foot.push([x0, 0, z0, x1, 0, z0], [x1, 0, z0, x1, 0, z1], [x1, 0, z1, x0, 0, z1], [x0, 0, z1, x0, 0, z0]); }
      // the 3x reach marks: faint ticks at the cap height above and below each row's left edge
      for (const y of [H_MAX, -H_MAX]) dash.push([colX(0) - 0.55, y, rowZ(i), colX(0) - 0.47, y, rowZ(i)]);
    }
    world.add(kit.segments(foot, blue, 0.22)); world.add(kit.segments(dash, C.tx2, 0.35));
    // the slices (one instanced draw for the cores, one for the glow) and the replay slabs
    const N = 64 * SLICES, box = new THREE.BoxGeometry(1, 1, 1), mat = op => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending });
    const core = new THREE.InstancedMesh(box, mat(0.95), N), glow = new THREE.InstancedMesh(box, mat(0.06), N), slab = new THREE.InstancedMesh(box, mat(0.85), 64), slabGlow = new THREE.InstancedMesh(box, mat(0.07), 64);
    for (const o of [core, glow, slab, slabGlow]) { o.setColorAt(0, COL.set(0x000000)); o.frustumCulled = false; o.instanceMatrix.setUsage(THREE.DynamicDrawUsage); world.add(o); }
    const slots = [];
    for (const c of Object.values(B.cells)) c.slices.forEach((s, i) => slots.push({ c, s, i, n: c.slices.length }));
    // tips: a bright point at every capped slice's end (the ">3" mark), and a faint dot for empty cells
    const tips = kit.points(Math.max(1, N + 64), 'white', 7, { colors: true }); world.add(tips);
    // the plates
    const plates = {};
    B.ccys.forEach((ccy, i) => {
      const p = B.plates[ccy], z = rowZ(i), segs = [[PL_X - PL_W, 0, z, PL_X + PL_W, 0, z], [PL_X, -0.08, z, PL_X, 0.08, z], [PL_X - PL_W, -0.04, z, PL_X - PL_W, 0.04, z], [PL_X + PL_W, -0.04, z, PL_X + PL_W, 0.04, z]];
      world.add(kit.segments(segs, blue, 0.4));
      const base = new THREE.Mesh(new THREE.PlaneGeometry(PL_W * 2 + 0.1, 0.5), new THREE.MeshBasicMaterial({ color: H.color(blue), transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      base.rotation.x = -Math.PI / 2; base.position.set(PL_X, -0.002, z); world.add(base);
      const o = { mats: [] };
      if (p.score != null && p.f > 0) {
        const col = p.dir > 0 ? C.up : C.dn, len = p.f * PL_W, bar = new THREE.Mesh(box, mat(0.8)); bar.material.color = H.color(col);
        bar.scale.set(len, 0.06, 0.3); bar.position.set(PL_X + p.dir * len / 2, 0.03, z); world.add(bar); o.mats.push([bar.material, 0.8]);
        const gl = new THREE.Mesh(box, mat(0.1)); gl.material.color = H.color(col); gl.scale.set(len, 0.18, 0.46); gl.position.copy(bar.position); world.add(gl); o.mats.push([gl.material, 0.1]);
        if (p.capped) { const f = kit.flare(col, 0.5, 0.8); f.position.set(PL_X + p.dir * PL_W, 0.05, z); world.add(f); o.mats.push([f.material, 0.8]); }
      }
      plates[ccy] = o;
    });
    // markers for the biggest beat / miss: soft flares at the slice tips
    const fl = { beat: kit.flare(C.up, 0.55, 0.75), miss: kit.flare(C.dn, 0.55, 0.75) }; world.add(fl.beat); world.add(fl.miss); fl.beat.visible = fl.miss.visible = false;
    for (const k of ['beat', 'miss']) { const x = S.D?.X?.[k]; if (!x) continue; const c = B.cells[x.key], s = c.slices[x.i]; fl[k].position.set(sliceX(c.col, x.i, c.slices.length), s.dir * s.h, rowZ(c.row)); fl[k].visible = true; }
    // the selection ring: a bright footprint
    const selLine = kit.line([[-0.5, 0, -0.33], [0.5, 0, -0.33], [0.5, 0, 0.33], [-0.5, 0, 0.33], [-0.5, 0, -0.33]], C.tx, 2.2, 0.9); selLine.visible = false; world.add(selLine);
    dyn = { core, glow, slab, slabGlow, slots, tips, plates, fl, selLine, cUp, cDn, cNo, cTx };
    styleKey = '';
  }

  // per-instance matrices and colours for the slices (latest mode) or the slabs (time mode)
  function style(B, t) {
    const d = dyn, sel = S.selKey, time = S.mode === 'time', G = S.D?.G;
    d.core.visible = d.glow.visible = !time; d.slab.visible = d.slabGlow.visible = time;
    const tp = d.tips.geometry.attributes.position.array, tc = d.tips.geometry.attributes.color.array; let nt = 0;
    const tip = (x, y, z, c, b) => { tp[nt * 3] = x; tp[nt * 3 + 1] = y; tp[nt * 3 + 2] = z; tc[nt * 3] = c.r * b; tc[nt * 3 + 1] = c.g * b; tc[nt * 3 + 2] = c.b * b; nt++; };
    if (!time) {
      d.slots.forEach((o, k) => {
        const { c, s, i, n } = o, y = s.dir === 0 ? 0 : s.dir * s.h / 2, hh = s.dir === 0 ? 0.012 : s.h;
        P.set(sliceX(c.col, i, n), y, rowZ(c.row)); SC.set(SL_W, hh, SL_D); M4.compose(P, Q0, SC); d.core.setMatrixAt(k, M4);
        SC.set(SL_W * 2.2, hh + 0.04, SL_D * 1.15); M4.compose(P, Q0, SC); d.glow.setMatrixAt(k, M4);
        const age = n > 1 ? i / (n - 1) : 1, b = (0.28 + 0.72 * age) * (c.stale ? 0.55 : 1) * (sel && sel !== c.key ? 0.3 : 1), base = s.dir > 0 ? d.cUp : s.dir < 0 ? d.cDn : d.cNo;
        COL.copy(base).multiplyScalar(s.dir === 0 ? b * 0.6 : b); d.core.setColorAt(k, COL); d.glow.setColorAt(k, COL);
        if (s.capped) tip(P.x, s.dir * s.h, P.z, base, 1.2 * (sel && sel !== c.key ? 0.4 : 1));
      });
      d.core.count = d.glow.count = d.slots.length;
      d.core.instanceMatrix.needsUpdate = d.glow.instanceMatrix.needsUpdate = true; if (d.core.instanceColor) d.core.instanceColor.needsUpdate = d.glow.instanceColor.needsUpdate = true;
    } else {
      let k = 0;
      for (const c of Object.values(B.cells)) {
        const s = gridAt(G, c.key, S.mi), x = colX(c.col), z = rowZ(c.row), hh = s.h > 0 ? s.h : 0.001;
        P.set(x, s.dir * hh / 2, z); SC.set(0.62, hh, SL_D); M4.compose(P, Q0, SC); d.slab.setMatrixAt(k, M4);
        SC.set(0.74, hh + 0.04, SL_D * 1.2); M4.compose(P, Q0, SC); d.slabGlow.setMatrixAt(k, M4);
        const base = s.dir > 0 ? d.cUp : s.dir < 0 ? d.cDn : d.cNo; COL.copy(base).multiplyScalar(s.h > 0 ? (s.dir === 0 ? 0.12 : 1) * (sel && sel !== c.key ? 0.3 : 1) : 0); d.slab.setColorAt(k, COL); d.slabGlow.setColorAt(k, COL);
        if (s.capped) tip(x, s.dir * s.h, z, base, 1.2);
        k++;
      }
      d.slab.instanceMatrix.needsUpdate = d.slabGlow.instanceMatrix.needsUpdate = true; if (d.slab.instanceColor) d.slab.instanceColor.needsUpdate = d.slabGlow.instanceColor.needsUpdate = true;
    }
    for (const c of Object.values(B.cells)) if (!c.slices.length && !time) tip(colX(c.col), 0.01, rowZ(c.row), d.cNo, 0.25);
    for (let i = nt; i < tp.length / 3; i++) { tp[i * 3 + 1] = -99; tc[i * 3] = tc[i * 3 + 1] = tc[i * 3 + 2] = 0; }
    d.tips.geometry.attributes.position.needsUpdate = d.tips.geometry.attributes.color.needsUpdate = true;
    for (const k of ['beat', 'miss']) d.fl[k].material.opacity = time || (sel && S.D?.X?.[k]?.key !== sel) ? 0 : 0.75;
    for (const [ccy, o] of Object.entries(d.plates)) for (const [m, op] of o.mats) m.opacity = op * (time ? 0.3 : sel && !sel.startsWith(ccy + '|') ? 0.4 : 1);
    if (sel && B.cells[sel]) { const c = B.cells[sel]; d.selLine.position.set(colX(c.col), 0.002, rowZ(c.row)); d.selLine.visible = true; } else d.selLine.visible = false;
  }

  function camUpdate(st, dt, g, B) {
    const calm = H.calm, cp = g.compact, userYaw = (st.yaw ?? 0.35) - 0.35, zoom = clamp(st.zoom ?? 1, 0.4, 3);
    const asp = g.W / Math.max(1, g.H), hf = Math.atan(Math.tan(16 * Math.PI / 180) * asp);
    let dist = cp ? Math.max(30, 7.6 / Math.tan(hf)) : 21, el = cp ? 1.12 : 0.66, tg = [cp ? 1.1 : 0.8, cp ? 0 : 0.15, cp ? 0.6 : -0.7], yaw = 0;
    if (showing()) {
      const p = S.showP, X = S.D?.X, pick = p < 0.5 ? null : p < 0.78 ? X?.beat ?? X?.miss : X?.miss ?? X?.beat, c = pick ? B?.cells[pick.key] : null;
      if (c) { tg = [colX(c.col), 0, rowZ(c.row)]; dist = cp ? 18 : 10; el = 0.55; yaw = (c.col - 3.5) * 0.05; }
      else yaw = calm ? 0 : -0.25 + 0.5 * clamp(p / 0.5, 0, 1);
    } else if (!calm && !st.drag) yaw = 0.05 * Math.sin(g.t * 0.12);
    el = clamp(el - ((st.pitch ?? -0.45) + 0.45) * 0.8, 0.15, 1.4); dist /= zoom;
    const want = { el, dist, yaw, tx: tg[0], ty: tg[1], tz: tg[2] }, k = 1 - Math.exp(-dt * (calm ? 6 : 1.8));
    if (!S.cam) S.cam = { ...want };
    for (const f of Object.keys(want)) S.cam[f] += (want[f] - S.cam[f]) * k;
    const p = orbitPos(S.cam.yaw + userYaw, S.cam.el, S.cam.dist, [S.cam.tx, S.cam.ty, S.cam.tz]);
    camera.position.set(p[0], p[1], p[2]); camera.lookAt(S.cam.tx, S.cam.ty, S.cam.tz);
    const fov = cp ? 32 : 30; if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const off = Math.round(g.W / 2 - (g.cx ?? g.W / 2)); if (off !== S.off) { S.off = off; if (off) camera.setViewOffset(g.W, g.H, off, 0, g.W, g.H); else camera.clearViewOffset(); }
  }

  function update(t, dt, api, g) {
    load(api); const B = S.D?.B, C = g.C, ck = [C.blue, C.up, C.dn, C.gold, C.tx, C.tx2].join('|');
    if (!B?.ok) { if (world) { scene.remove(world); kit.forget(world); world = null; dyn = null; builtFor = null; } camUpdate(api.st, dt, g, null); return; }
    if (B !== builtFor || ck !== colKey || !world) { builtFor = B; colKey = ck; build(B, C); }
    commands(api);
    const G = S.D?.G; if (!G && S.mode === 'time') S.mode = 'latest';
    if (S.mode === 'time' && S.play) { S.mi += dt / (H.calm ? MONTH_S * 1.5 : MONTH_S); if (S.mi >= G.months.length - 1) { S.mi = G.months.length - 1; S.play = false; } }
    const key = `${S.mode}|${S.selKey}|${S.mode === 'time' ? S.mi.toFixed(3) : ''}`;
    if (key !== styleKey) { styleKey = key; style(B, t); }
    camUpdate(api.st, dt, g, B);
    if (dyn && !H.calm) { const pulse = 0.6 + 0.4 * Math.sin(t * 2.4); for (const k of ['beat', 'miss']) if (dyn.fl[k].material.opacity > 0) dyn.fl[k].scale.setScalar(0.42 + 0.18 * pulse); }
  }

  function overlay(ctx, g, api) {
    const { W, H: Hh, C, fade } = g, cp = g.compact, D = S.D, B = D?.B;
    if (g.t - S.hudAt > 1) { S.hudAt = g.t; try { const cs = api.win.getComputedStyle(api.doc.getElementById(api.ID)); S.hudTop = parseFloat(cs.getPropertyValue('--jvtop')) || 70; S.bg = api.win.getComputedStyle(api.doc.documentElement).getPropertyValue('--bg1').trim() || 'black'; } catch (e) { S.hudTop = 70; } }
    if (g.top > 0) S.hudTop = 62;   // the HUD has shifted this view below its menus (the safe area): lay out as under the plain top bar
    ctx.save(); ctx.globalAlpha = fade; ctx.textBaseline = 'alphabetic';
    const say = txt => { ctx.fillStyle = C.tx2; ctx.font = '13px ui-monospace,monospace'; ctx.textAlign = 'center'; wrap(ctx, txt, W - 40, 3).forEach((l, i) => ctx.fillText(l, W / 2, Hh / 2 + i * 18)); };
    if (!D || (D.busy && !B)) { say('Reading the surprise store...'); ctx.restore(); return; }
    if (!B?.ok) { say(B?.reason ?? 'The surprise board did not load.'); ctx.restore(); return; }
    const time = S.mode === 'time', G = D.G, top = S.hudTop + 8, obst = [], keyH = cp ? 64 : 40, keyY = Hh - keyH, scrubH = time ? (cp ? 54 : 46) : 0, bottom = keyH + scrubH + 6;
    // buttons, top centre
    const btns = [['latest', 'LATEST'], ...(G ? [['time', time ? (S.play ? '❚❚ PAUSE' : '▶ PLAY') : '▶ TIME REPLAY']] : [])];
    ctx.font = '600 12px ui-monospace,monospace'; const bh = cp ? 30 : 26, bw = btns.map(([, l]) => ctx.measureText(l).width + 26), totalW = bw.reduce((a, b) => a + b, 0) + 8 * (btns.length - 1);
    let bx = cp ? W - totalW - 12 : W / 2 - totalW / 2;
    btns.forEach(([k, l], i) => {
      const on = (k === 'latest' && !time) || (k === 'time' && time);
      card(ctx, bx, top, bw[i], bh, on ? C.blue : C.tx2, 0.8); ctx.globalAlpha = fade; ctx.fillStyle = on ? C.blue : C.tx; ctx.textAlign = 'center'; ctx.fillText(l, bx + bw[i] / 2, top + bh / 2 + 4);
      g.hit('sp:' + k, bx + bw[i] / 2, top + bh / 2); obst.push({ x: bx, y: top, w: bw[i], h: bh }); bx += bw[i] + 8;
    });
    // readout, top left
    const ro = readout(ctx, g, D, cp ? top + bh + 8 : top, cp); obst.push(ro);
    // row labels (currencies) and column headers (families)
    ctx.font = `600 ${cp ? 11 : 13}px ui-monospace,monospace`;
    B.ccys.forEach((ccy, i) => {
      const p = H.toScreen([colX(0) - 0.72, 0, rowZ(i)], camera); if (!p.vis) return;
      const w = ctx.measureText(ccy).width + 10, r = { x: p.x - w, y: p.y - 9, w, h: 18 }, on = S.selKey?.startsWith(ccy + '|');
      ctx.globalAlpha = fade * (S.selKey && !on ? 0.5 : 1); ctx.fillStyle = on ? C.tx : C.blue; ctx.textAlign = 'right'; ctx.fillText(ccy, p.x - 4, p.y + 5); obst.push(r);
    });
    ctx.font = `600 ${cp ? 11 : 12}px ui-monospace,monospace`; ctx.textAlign = 'center';
    const gap = Math.abs(H.toScreen([colX(1), 0, rowZ(0) - 0.75], camera).x - H.toScreen([colX(0), 0, rowZ(0) - 0.75], camera).x), longOk = FAMS.every(f => ctx.measureText(f.label.toUpperCase()).width < gap - 10), shortOk = FAMS.every(f => ctx.measureText(f.short).width < gap - 6);
    FAMS.forEach((f, j) => {
      const p = H.toScreen([colX(j), 0, rowZ(0) - 0.75], camera); if (!p.vis) return;
      const lab = longOk ? f.label.toUpperCase() : shortOk ? f.short : f.short.slice(0, 3), w = ctx.measureText(lab).width + 8, on = S.selKey?.endsWith('|' + f.key);
      ctx.globalAlpha = fade * (S.selKey && !on ? 0.5 : 0.95); ctx.fillStyle = on ? C.tx : C.blue; ctx.fillText(lab, p.x, p.y); obst.push({ x: p.x - w / 2, y: p.y - 12, w, h: 15 });
    });
    // the plate header and values
    { const p = H.toScreen([PL_X, 0, rowZ(0) - 0.75], camera); ctx.globalAlpha = fade * 0.95; ctx.fillStyle = C.blue; ctx.fillText(cp ? 'ENGINE' : 'ENGINE SCORE', p.x, p.y); }
    ctx.font = '11px ui-monospace,monospace';
    B.ccys.forEach((ccy, i) => {
      const pl = B.plates[ccy], p = H.toScreen([PL_X + PL_W + 0.08, 0.05, rowZ(i)], camera); if (!p.vis) return;
      const txt = pl.score == null ? 'n/a' : `${pl.score > 0 ? '+' : pl.score < 0 ? '−' : ''}${pl.capped ? '>1' : Math.abs(pl.score).toFixed(2)}`;
      ctx.globalAlpha = fade * (time ? 0.45 : S.selKey && !S.selKey.startsWith(ccy + '|') ? 0.5 : 0.95); ctx.fillStyle = pl.dir > 0 ? C.up : pl.dir < 0 ? C.dn : C.tx2;
      ctx.textAlign = 'left'; ctx.fillText(txt, p.x + 4, p.y + 4);
    });
    ctx.globalAlpha = fade;
    // every cell is clickable at its centre
    for (const c of Object.values(B.cells)) { const p = H.toScreen([colX(c.col), 0, rowZ(c.row)], camera); if (p.vis) g.hit('sp:c:' + c.key, p.x, p.y); }
    // the selected cell's card
    let cardBox = null; if (S.selKey && B.cells[S.selKey]) cardBox = selCard(ctx, g, B.cells[S.selKey], top + bh + 10, Hh - bottom, ro); if (cardBox) obst.push(cardBox);
    // labels: the biggest beat and miss (latest), or the month's biggest cells (time); capped slices say ">3" where they have room
    const items = [];
    if (!time) {
      for (const k of ['beat', 'miss']) {
        const x = D.X?.[k]; if (!x || (S.selKey && S.selKey !== x.key)) continue;
        const c = B.cells[x.key], s = c.slices[x.i], tp = H.toScreen([sliceX(c.col, x.i, c.slices.length), s.dir * s.h, rowZ(c.row)], camera); if (!tp.vis) continue;
        const l1 = `BIGGEST ${k === 'beat' ? 'BEAT ▲' : 'MISS ▼'}`, l2 = `${c.ccy} ${FAMS[c.col].label} ${zText(x.z, x.capped)} · ${fmtDate(x.ms)}`;
        items.push(labelItem(ctx, x.key + k, tp, l1, l2, k === 'beat' ? C.up : C.dn, 100, k === 'beat' ? -1 : 1, cp));
      }
    } else if (G) {
      const i = Math.round(S.mi), gm = G.grid[i] ?? {}, top2 = Object.entries(gm).sort((a, b) => Math.abs(b[1].z) - Math.abs(a[1].z)).slice(0, cp ? 2 : 4);
      top2.forEach(([key, v], r) => {
        const c = B.cells[key]; if (!c) return; const s = gridAt(G, key, S.mi), tp = H.toScreen([colX(c.col), s.dir * s.h, rowZ(c.row)], camera); if (!tp.vis || !s.h) return;
        items.push(labelItem(ctx, key, tp, `${c.ccy} ${FAMS[c.col].label}`, `${zText(v.z, v.capped)} avg · ${v.n} release${v.n === 1 ? '' : 's'}`, v.z > 0 ? C.up : C.dn, 50 - r, v.z > 0 ? -1 : 1, cp));
      });
    }
    const placed = placeLabels(items, { W, H: Hh, obstacles: obst, top, bottom, step: 8, tries: 10 });
    for (const r of placed) {
      const it = items.find(x => x.id === r.id);
      ctx.globalAlpha = fade * 0.7; ctx.strokeStyle = it.col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(it.tp.x, it.tp.y); ctx.lineTo(r.x + (it.tp.x < r.x ? 0 : r.w), r.y + r.h / 2); ctx.stroke();
      card(ctx, r.x, r.y, r.w, r.h, it.col, 0.78); ctx.globalAlpha = fade; ctx.textAlign = 'left';
      ctx.font = '600 11px ui-monospace,monospace'; ctx.fillStyle = it.col; ctx.fillText(it.l1, r.x + 7, r.y + 13); ctx.font = '12px ui-monospace,monospace'; ctx.fillStyle = C.tx; ctx.fillText(it.l2, r.x + 7, r.y + 28);
      obst.push(r);
    }
    if (!cp) {
      ctx.font = '600 11px ui-monospace,monospace'; ctx.textAlign = 'center';
      for (const o of time ? [] : (dyn?.slots ?? [])) {
        if (!o.s.capped || (S.selKey && S.selKey !== o.c.key)) continue;
        const p = H.toScreen([sliceX(o.c.col, o.i, o.n), o.s.dir * (o.s.h + 0.1), rowZ(o.c.row)], camera), box = { x: p.x - 12, y: p.y - 10, w: 24, h: 12 };
        if (!p.vis || obst.some(b => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y)) continue;
        ctx.fillStyle = o.s.dir > 0 ? C.up : C.dn; ctx.fillText(`>${CAP}`, p.x, p.y); obst.push(box);
      }
    }
    if (time && G) scrub(ctx, g, G, keyY - scrubH - 4, scrubH);
    keyBlock(ctx, g, keyY, keyH, time ? KEY_TIME : KEY_LINE);
    ctx.restore();
  }

  function labelItem(ctx, id, tp, l1, l2, col, pri, side, cp) {
    ctx.font = '600 11px ui-monospace,monospace'; const w1 = ctx.measureText(l1).width; ctx.font = '12px ui-monospace,monospace';
    const w = Math.max(w1, ctx.measureText(l2).width) + 14, h = 34, dx = cp ? -w / 2 : side > 0 ? 26 : -w - 26;
    return { id, x: tp.x + dx, y: tp.y - h / 2 + (cp ? (side > 0 ? 40 : -44) : side * 6), w, h, pri, tp, l1, l2, col };
  }

  // the readout: what the block says in words, top left
  function readout(ctx, g, D, y0, cp) {
    const { C, fade, W } = g, B = D.B, time = S.mode === 'time', G = D.G, L = D.L ?? { up: [], dn: [] }, T = D.T ?? {}, lines = [];
    const zs = (list) => list.slice(0, cp ? 2 : 3).map(c => `${c} ${zText(T[c]?.mean)}`).join('  ');
    if (!time) {
      lines.push([C.tx2, `as of ${fmtDate(B.asOf)} · average surprise, last 30 days`]);
      lines.push([C.up, `▲ beating  ${L.up.length ? zs(L.up) : '—'}`]);
      lines.push([C.dn, `▼ missing  ${L.dn.length ? zs(L.dn) : '—'}`]);
      if (!G && !cp) lines.push([C.tx2, 'time replay unavailable: the release history did not load']);
      if (D.X?.days > 14) lines.push([C.tx2, `no scored release in the last 2 weeks: extremes from the last ${D.X.days} days`]);
    } else {
      const i = Math.round(S.mi), cm = G.ccyMean[i] ?? {}, e = Object.entries(cm).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
      lines.push([C.tx2, `replay · ${monthLabel(G.months[i])} · average surprise by economy`]);
      lines.push([C.up, `▲ most beats  ${e.filter(([, v]) => v > 0).slice(0, cp ? 2 : 3).map(([c, v]) => `${c} ${zText(v)}`).join('  ') || '—'}`]);
      lines.push([C.dn, `▼ most misses  ${e.filter(([, v]) => v < 0).reverse().slice(0, cp ? 2 : 3).map(([c, v]) => `${c} ${zText(v)}`).join('  ') || '—'}`]);
    }
    const sel = S.selKey ? B.cells[S.selKey] : null, asm = G?.assumed ? Object.values(G.assumed).filter(v => v != null) : [], share = asm.length ? asm.reduce((a, b) => a + b, 0) / asm.length : null;
    if (!cp) { lines.push([C.gold, 'sign note: most releases are read higher = stronger by assumption,']); lines.push([C.gold, `so hotter inflation counts as a beat${share != null ? ` (${Math.round(share * 100)}% of scored prints)` : ''}`]); }
    else if (sel?.assumed) lines.push([C.gold, 'sign assumed: higher = stronger']);
    ctx.font = '600 14px ui-monospace,monospace'; const title = 'DATA SURPRISES';
    ctx.font = '12px ui-monospace,monospace'; const w = Math.min(W - 24, Math.max(...lines.map(([, s]) => ctx.measureText(s).width), 140) + 24), h = 30 + lines.length * 16, x = 12;
    card(ctx, x, y0, w, h, null, 0.6); ctx.globalAlpha = fade; ctx.textAlign = 'left';
    ctx.font = '600 14px ui-monospace,monospace'; ctx.fillStyle = C.blue; ctx.fillText(title, x + 12, y0 + 19);
    ctx.font = '12px ui-monospace,monospace'; lines.forEach(([c, s], i) => { ctx.fillStyle = c; ctx.fillText(s, x + 12, y0 + 38 + i * 16, w - 24); });
    return { x, y: y0, w, h };
  }

  // the selected cell: its last prints with date, actual vs consensus and z
  function selCard(ctx, g, c, y0, yMax, ro) {
    const { W, C, fade } = g, cp = g.compact, f = FAMS[c.col], prints = [...c.slices].reverse(), lineH = 16;
    const notes = [];
    if (c.engine?.score != null) notes.push([C.tx2, `engine reading ${c.engine.score > 0 ? '+' : ''}${c.engine.score.toFixed(2)} (level vs its own history, −1..+1)`]);
    if (c.stale) notes.push([C.gold, `last print ${c.ageDays} days ago: stale`]);
    if (c.next?.ms) notes.push([C.tx2, `next: ${c.next.event} · ${fmtDate(c.next.ms)}`]);
    if (c.assumed) notes.push([C.gold, 'sign assumed: higher read as stronger economy']);
    const w = cp ? W - 24 : 380, h = 58 + Math.max(1, prints.length) * lineH + notes.length * 15 + 8;
    const x = cp ? 12 : W - w - 18, y = cp ? Math.max(ro.y + ro.h + 8, yMax - h - 8) : clamp(y0, y0, Math.max(y0, yMax - h - 8));
    const last = prints[0], col = last?.dir > 0 ? C.up : last?.dir < 0 ? C.dn : C.blue;
    card(ctx, x, y, w, h, col, 0.86); ctx.globalAlpha = fade; ctx.textAlign = 'left';
    ctx.font = '600 14px ui-monospace,monospace'; ctx.fillStyle = C.tx; ctx.fillText(`${c.ccy} · ${f.label.toUpperCase()}`, x + 12, y + 20);
    ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = C.tx2; ctx.fillText(c.event ? clip(c.event, cp ? 40 : 48) : 'no headline release in the store', x + 12, y + 36);
    ctx.fillText('date', x + 12, y + 52); ctx.fillText('actual vs consensus', x + 76, y + 52); ctx.textAlign = 'right'; ctx.fillText('z', x + w - 12, y + 52); ctx.textAlign = 'left';
    ctx.font = '12px ui-monospace,monospace';
    if (!prints.length) { ctx.fillStyle = C.tx2; ctx.fillText('no prints yet', x + 12, y + 68); }
    prints.forEach((s, i) => {
      const yy = y + 68 + i * lineH, cc = s.dir > 0 ? C.up : s.dir < 0 ? C.dn : C.tx2;
      ctx.fillStyle = i === 0 ? C.tx : C.tx2; ctx.fillText(fmtDate(s.ms), x + 12, yy);
      ctx.fillText(`${s.actual ?? '—'} vs ${s.estimate ?? '—'}`, x + 76, yy, w - 160);
      ctx.fillStyle = cc; ctx.textAlign = 'right'; ctx.fillText(`${s.dir > 0 ? '▲ ' : s.dir < 0 ? '▼ ' : ''}${zText(s.z, s.capped)}`, x + w - 12, yy); ctx.textAlign = 'left';
    });
    ctx.font = '11px ui-monospace,monospace'; const ny = y + 68 + Math.max(1, prints.length) * lineH + 2;
    notes.forEach(([cc, s], i) => { ctx.fillStyle = cc; ctx.fillText(s, x + 12, ny + i * 15, w - 24); });
    ctx.fillStyle = C.tx2; ctx.textAlign = 'right'; ctx.font = '600 13px ui-monospace,monospace'; ctx.fillText('✕', x + w - 10, y + 18); g.hit('sp:close', x + w - 14, y + 14); ctx.textAlign = 'left';
    return { x, y, w, h };
  }

  // the month scrub: a tick per month (clickable), the play head, the month name
  function scrub(ctx, g, G, y, h) {
    const { W, C, fade } = g, cp = g.compact, n = G.months.length, x0 = cp ? 24 : Math.max(40, W / 2 - 330), x1 = cp ? W - 24 : Math.min(W - 40, W / 2 + 330), X = i => x0 + (x1 - x0) * i / Math.max(1, n - 1), ly = y + h / 2;
    card(ctx, 0, y, W, h, null, 0.5); ctx.globalAlpha = fade * 0.5; ctx.strokeStyle = C.blue; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, ly); ctx.lineTo(x1, ly); ctx.stroke();
    ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'center';
    for (let i = 0; i < n; i++) {
      const on = Math.round(S.mi) === i; ctx.globalAlpha = fade * (on ? 1 : 0.7); ctx.fillStyle = on ? C.tx : C.blue; ctx.fillRect(X(i) - 1, ly - 5, 2, 10);
      if (!cp || i % 3 === 0 || i === n - 1 || on) { ctx.fillStyle = on ? C.tx : C.tx2; ctx.fillText(monthLabel(G.months[i]), X(i), ly + 18); }
      g.hit('sp:m:' + i, X(i), ly);
    }
    const hx = X(S.mi); ctx.globalAlpha = fade; ctx.fillStyle = C.blue; ctx.beginPath(); ctx.arc(hx, ly, 5, 0, Math.PI * 2); ctx.fill();
  }

  function keyBlock(ctx, g, y, h, text) {
    const { W, C, fade } = g, cp = g.compact; card(ctx, 0, y, W, h, null, 0.6); ctx.textAlign = 'center';
    const items = [[C.up, '▲ beat (above)'], [C.dn, '▼ missed (below)'], [C.tx2, '▮ no z'], [C.tx, `tip = beyond ${CAP}× (capped)`], [C.blue, 'newest = right, brightest']];
    ctx.font = '11px ui-monospace,monospace'; const ws = items.map(([, s]) => ctx.measureText(s).width + 16);
    if (!cp) { let x = (W - ws.reduce((a, b) => a + b, 0)) / 2; ctx.textAlign = 'left'; items.forEach(([c, s], i) => { ctx.globalAlpha = fade * 0.92; ctx.fillStyle = c; ctx.fillText(s, x, y + 15); x += ws[i]; }); ctx.textAlign = 'center'; ctx.globalAlpha = fade * 0.85; ctx.fillStyle = C.tx2; ctx.fillText(text, W / 2, y + 31); return; }
    ctx.globalAlpha = fade * 0.85; ctx.fillStyle = C.tx2; wrap(ctx, text, W - 24, 4).forEach((l, i) => ctx.fillText(l, W / 2, y + 14 + i * 13));
  }

  function card(ctx, x, y, w, h, edge, a) {
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = S.bg || 'black'; ctx.fillRect(x, y, w, h);
    if (edge) { ctx.globalAlpha = Math.min(1, ctx.globalAlpha * 1.2); ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
    ctx.restore();
  }

  return { scene, camera, update, overlay, bloom: { strength: 0.42, radius: 0.35, threshold: 0.16 }, dispose() { if (world) { scene.remove(world); kit.forget(world); } world = null; dyn = null; } };
}

const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
function wrap(ctx, text, maxW, maxLines = 3) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean), out = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur);
  if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = out[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
  return out;
}

registerJarvisModule({
  id: ID, label: 'DATA SURPRISES',
  render(pane, api) {
    pane.innerHTML = '<h3>DATA SURPRISES</h3><p>An 8 by 8 block: rows are the eight currencies, columns the eight indicator families. Each cell holds its last few releases as thin slices: above the glass when the print beat consensus, below when it missed, as long as the surprise measured in that release’s usual surprise size (capped at three, and marked). The plates at the end of each row are the engine score. TIME REPLAY rolls the monthly average surprises across the economies. A record of releases, not a forecast.</p><p><button data-r="go">Show the block</button></p>';
    pane.querySelector('[data-r="go"]').onclick = () => api.setView(ID);
  },
  views: [glView({
    id: ID, label: 'DATA SURPRISES', env: { accent: 'blue2', chrome: 'clean', scan: false },
    onEnter(api) { S.spin = api.st.spin; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); S.cam = null; load(api); },
    onLeave(api) { S.showP = -1; S.play = false; if (S.spin != null) api.st.spin = S.spin; S.spin = null; },
    setup,
  })],
});

// ── SHOW: after the chain reactor, the surprise block; the camera sweeps the block, then visits the biggest beat and the biggest miss ──
registerShowScene({
  id: ID, after: 'reactor',
  prepare: async api => { try { const e = await load(api); return e?.B?.ok ? e : null; } catch (er) { return null; } },
  build(inp, d) {
    const B = d?.B; if (!B?.ok) return null; const text = surpriseScript(B); if (!text) return null;
    return {
      title: 'Data surprises', view: ID, cam: null, text, figure: surpriseFigure(B),
      enter(api) { S.showP = 0; S.showAt = Date.now(); S.selKey = null; S.mode = 'latest'; S.play = false; if (api?.st) { api.st.sel = null; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); } },
      motion(api, p) { S.showP = clamp(p, 0, 1); S.showAt = Date.now(); },
    };
  },
});
