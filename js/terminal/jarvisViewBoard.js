// js/terminal/jarvisViewBoard.js: Jarvis's MARKET BOARD as a hologram (WebGL, js/terminal/jarvisGL.js). It takes over the HUD's core 'candles' view (button BOARD): jarvisView.js hands that view
// to this one because it carries gl: true. Every desk market's session candle so far today stands on a glowing trading floor, one street per group (FX majors at the front, then the crosses,
// indices, metals, and energy / farm / crypto at the back), with the bias engine's lean floating over each candle as a blue chevron. Only the loudest candles are named; they flare and throw sparks.
//
// ENCODING
//   candle body     today's open-to-now move divided by the market's own usual open-to-close move (forecast.oc_median), so a big day in a quiet market stands as tall as a big day in a wild one.
//                   Height is linear in that ratio (one usual move = one step of the faint guide lines along every street), clipped at 3 usual moves (CAP; the label and card say "capped").
//                   Direction twice over: green rising ABOVE the floor = up, red hanging BELOW it = down; grey = under half a usual move ("barely moving") on whichever side it fell.
//   brightness      grows smoothly with the size of the move; the bright face is the close-so-far end.
//   wick            the session's high and low so far, in the same units, also clipped at 3.
//   chevron (blue)  the bias engine's lean (▲ bullish, ▼ bearish, a dot = neutral; size grows smoothly with its strength, capped at 3). Blue so it is never mistaken for what has happened.
//                   The engine's back-test (2010-2026) found NO proven direction skill; the key says so.
//   flare + sparks  the loudest movers (the biggest moves against their own normal, over one usual move) and only those carry a name, so the field stays readable.
//   click           a candle (or a row of the LOUDEST list) flies the camera to it and opens its card; ALL MARKETS flies back.
// SHOW            the core scenes 'candles' and 'lean' (showCore.js) drive the camera through st.cdTarget (api.flyTo, eased into st.cdCam by the HUD): this view follows that point LOW across the
//                 floor (front to back for the candles, back to front for the lean, when the chevrons are lifted forward and the candles dim).
// DATA  api.candles() = the HUD's cached board feed (/api/vol-forecast/live + /api/bias-engine through candleRows / candleLayout / boardSummary in jarvisCandles.js, a 60 s cache).
// DESCRIPTION ONLY: the candle is what has happened so far today; the lean is a rule-based reading with no proven skill. Nothing here is a forecast or a trade.
import { registerJarvisModule } from './jarvisModules.js';
import { glView } from './jarvisGL.js';
import { fontPx, lineHeight, slotCache } from './helixLayout.js';
// rows and columns follow the REAL font size (the broadcast's font floor lifts 11px labels to 15px): each gap is max(the old fixed gap, the measured one), so the board looks the same
// at normal sizes and never draws text over text under the floor. LC caches the measured column widths per font and contents, so a steady frame measures nothing.
const LC = slotCache(), rowH = (ctx, base) => Math.max(base, lineHeight(fontPx(ctx.font)) + 1);
import { candleBox, topMovers, ROWS, CAP } from './jarvisCandles.js';
import { marketName } from './jarvisNames.js';
import { placeLabels } from './ratePathsCore.js';

const ID = 'candles', SC = 5, VS = 3.5, KH = 0.3, HW = 0.065, YU = KH * VS;     // floor scale; height scale (linear, a little flatter than the floor); candleBox height per usual move; half-width; world units per usual move (1.05)
const NSP = 28, REFRESH = 30_000;
const S = { cd: null, busy: false, asked: 0, spin: null, selKey: null, lean: false, tz: null };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BOX = Array.from({ length: 96 }, () => ({ x: 0, y: 0, w: 0, h: 0, pri: 0, ok: false, text: '', sub: '', col: '', ax: 0, ay: 0, kind: '', tries: null, below: false })), ORD = [], KEPT = [];
const TRY_UP = [0, -1, -2, -3, 1], TRY_DN = [0, 1, 2, 3, -1];
const arrow = r => (r.tone === 'up' ? '▲' : r.tone === 'dn' ? '▼' : '•');
const pctTxt = v => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(Math.abs(v) < 1 ? 2 : 1)}%`;
const xTxt = v => `${v >= 0 ? '+' : '−'}${Math.min(Math.abs(v), CAP).toFixed(1)}×${Math.abs(v) > CAP ? ' cap' : ''}`;
const leanWord = r => (!r.haveLean ? 'no reading' : r.lean > 0 ? 'bullish' : r.lean < 0 ? 'bearish' : 'neutral');

/** Ask the HUD for its cached board (it refreshes once a minute). Never throws. */
function pull(api) {
  if (S.busy || Date.now() - S.asked < REFRESH) return; S.busy = true; S.asked = Date.now();
  Promise.resolve().then(() => api.candles()).then(cd => { S.cd = cd ?? { rows: [], ok: false }; }).catch(() => { S.cd = { rows: [], ok: false }; }).finally(() => { S.busy = false; });
}

function setup(L, H, api) {
  const { THREE } = L, kit = H.kit, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 260);
  scene.add(kit.dust(1100, 60, api.colours?.()?.tx2 || 'white'));
  const grp = new THREE.Group(); scene.add(grp);
  const cam = { p: new THREE.Vector3(0, 12, 24), t: new THREE.Vector3(), wp: new THREE.Vector3(), wt: new THREE.Vector3(), snap: true };
  let recs = [], byKey = {}, rowsW = [], post = null, field = { xl: -8, xr: 8, zf: 6, zb: -6 }, sweep = null, built = null, C0 = null, selRing = null;
  S.asked = 0; pull(api);

  const clear = () => { for (const o of [...grp.children]) { grp.remove(o); kit.forget(o); } recs = []; byKey = {}; rowsW = []; post = null; sweep = null; selRing = null; };
  function build(cd, C) {
    clear(); built = cd; C0 = C; cam.snap = true; if (!cd?.ok || !cd.rows?.length) return;
    const lay = cd.layout ?? {}, add = o => { grp.add(o); return o; };
    const P = Object.values(lay); if (!P.length) return;
    const xs = P.map(p => p.x * SC), zs = P.map(p => -p.z * SC);
    field = { xl: Math.min(...xs) - 1.3, xr: Math.max(...xs) + 1.3, zf: Math.max(...zs) + 1.5, zb: Math.min(...zs) - 1.5 };
    // the projector floor: a fine grid inside the field, a wider faint one around it, a soft pool of light under it, a bright frame with corner brackets
    const g1 = [], g2 = [], st = SC * 0.19;
    for (let x = Math.ceil(field.xl / st) * st; x <= field.xr + 1e-6; x += st) g1.push([x, 0, field.zb, x, 0, field.zf]);
    for (let z = Math.ceil(field.zb / st) * st; z <= field.zf + 1e-6; z += st) g1.push([field.xl, 0, z, field.xr, 0, z]);
    for (let x = -30; x <= 30; x += st * 2) g2.push([x, -0.01, -22, x, -0.01, 22]);
    for (let z = -22; z <= 22; z += st * 2) g2.push([-30, -0.01, z, 30, -0.01, z]);
    add(kit.segments(g1, C.blue, 0.11)); add(kit.segments(g2, C.blue, 0.035));
    const pool = new THREE.Mesh(new THREE.PlaneGeometry((field.xr - field.xl) * 1.5, (field.zf - field.zb) * 1.7), kit.glowDisc(C.blue, 0.2)); pool.rotation.x = -Math.PI / 2; pool.position.y = -0.02; add(pool);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(field.xr - field.xl, field.zf - field.zb), new THREE.MeshBasicMaterial({ color: H.color(C.blue), transparent: true, opacity: 0.025, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    glass.rotation.x = -Math.PI / 2; add(glass);
    const fr = [[field.xl, 0, field.zf], [field.xr, 0, field.zf], [field.xr, 0, field.zb], [field.xl, 0, field.zb], [field.xl, 0, field.zf]];
    add(kit.line(fr, C.blue, 1.2, 0.35));
    const br = [], bl = 0.9;
    for (const [x, z, sx, sz] of [[field.xl, field.zf, 1, -1], [field.xr, field.zf, -1, -1], [field.xr, field.zb, -1, 1], [field.xl, field.zb, 1, 1]]) br.push([x, 0.01, z, x + sx * bl, 0.01, z], [x, 0.01, z, x, 0.01, z + sz * bl]);
    add(kit.segments(br, C.tx, 0.75));
    sweep = add(kit.line([[field.xl, 0.01, 0], [field.xr, 0.01, 0]], C.blue, 2.4, 0.3));
    // the streets: one glowing rail per row, a faint strip, and the ±1 usual-move guide lines along it
    const guide = [];
    ROWS.forEach(([title], ri) => {
      const ks = Object.entries(lay).filter(([, p]) => p.row === ri); if (!ks.length) return;
      const z = -ks[0][1].z * SC, x0 = Math.min(...ks.map(([, p]) => p.x * SC)) - 0.75, x1 = Math.max(...ks.map(([, p]) => p.x * SC)) + 0.75;
      add(kit.line([[x0, 0.006, z], [x1, 0.006, z]], C.blue, 1.3, 0.4));
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 1.15), new THREE.MeshBasicMaterial({ color: H.color(C.blue), transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      strip.rotation.x = -Math.PI / 2; strip.position.set((x0 + x1) / 2, 0.004, z); add(strip);
      for (const s of [1, -1]) for (let x = x0; x < x1 - 0.05; x += 0.3) guide.push([x, s * YU, z, Math.min(x1, x + 0.15), s * YU, z]);
      rowsW.push({ title: title || '', x0, z, ri });
    });
    add(kit.segments(guide, C.tx2, 0.16));
    // the scale post at the left of the front street: a tick per usual move, up to the cap either way
    const front = rowsW.reduce((a, r) => (r.z > (a?.z ?? -1e9) ? r : a), null), px = field.xl - 0.35, pz = front ? front.z : 0, ps = [[px, -CAP * YU, pz, px, CAP * YU, pz]];
    for (let k = -CAP; k <= CAP; k++) ps.push([px - 0.14, k * YU, pz, px + 0.14, k * YU, pz]);
    add(kit.segments(ps, C.tx2, 0.6)); post = { x: px, z: pz };
    // the candles
    const loud = new Set(topMovers(cd.rows, 9).filter(r => Math.abs(r.ratio) > 1).map(r => r.key));
    for (const r of cd.rows) {
      const pos = lay[r.key]; if (!pos) continue;
      const b = candleBox(r, pos, HW, KH), X = pos.x * SC, Z = -pos.z * SC, lo0 = Math.min(b.pts[0][1], b.pts[4][1]) * VS, hi0 = Math.max(b.pts[0][1], b.pts[4][1]) * VS;
      const live = r.tone !== 'quiet', up = r.body >= 0, h = Math.max(0.05, hi0 - lo0), yC = up ? lo0 + h / 2 : hi0 - h / 2, yClose = up ? lo0 + h : hi0 - h, w = HW * 2 * SC;
      const col = r.tone === 'up' ? C.up : r.tone === 'dn' ? C.dn : C.tx2, a = live ? 0.5 + 0.5 * Math.min(1, Math.abs(r.ratio) / CAP) : 0.32;
      const mats = [], keep = (m, base, kind = 'op') => { mats.push({ m, base, kind }); return m; };
      const geo = new THREE.BoxGeometry(w, h, w);
      const body = new THREE.Mesh(geo, keep(kit.holo(col, { rim: 1.8, base: 0.03, scan: live ? 0.5 : 0.15, opacity: 0.55 * a }), 0.55 * a, 'holo')); body.position.set(X, yC, Z); add(body);
      const core = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, Math.max(0.02, h - 0.04), w * 0.82), keep(new THREE.MeshBasicMaterial({ color: H.color(col), transparent: true, opacity: 0.07 * a, blending: THREE.AdditiveBlending, depthWrite: false }), 0.07 * a));
      core.position.copy(body.position); add(core);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), keep(new THREE.LineBasicMaterial({ color: H.color(col), transparent: true, opacity: 0.9 * a, blending: THREE.AdditiveBlending, depthWrite: false }), 0.9 * a));
      edges.position.copy(body.position); add(edges);
      const cap = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, w * 0.96), keep(new THREE.MeshBasicMaterial({ color: H.color(col), transparent: true, opacity: 0.75 * a, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }), 0.75 * a));
      cap.rotation.x = -Math.PI / 2; cap.position.set(X, yClose, Z); add(cap);
      const wy0 = b.wick[0][1] * VS, wy1 = b.wick[1][1] * VS, wick = kit.line([[X, wy0, Z], [X, wy1, Z]], col, live ? 2.2 : 1.2, live ? 0.9 * a : 0.4); keep(wick.material, live ? 0.9 * a : 0.4); add(wick);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.85, 40), keep(kit.glowDisc(col, 0.22 * a), 0.22 * a, 'k')); disc.rotation.x = -Math.PI / 2; disc.position.set(X, 0.003, Z); add(disc);
      const tipY = Math.max(hi0, wy1, 0), rec = { r, X, Z, mats, f: 1, yClose, tipY, loY: Math.min(lo0, wy0, 0), loud: loud.has(r.key), flare: null, sparks: null, chev: null, chevS: 1, seed: (X * 7.13 + Z * 3.7) % 6.283 };
      // the bias engine's lean: a blue chevron (or a dot) floating over the candle, turned to face the camera
      if (r.haveLean) {
        const cg = new THREE.Group(); cg.position.set(X, tipY + 0.55, Z); const s = 0.15 + 0.065 * clamp(r.strength, 0, 3);
        if (r.lean === 0) { const d = kit.flare(C.blue, 0.2, 0.6); keep(d.material, 0.6); cg.add(d); }
        else { const d = r.lean > 0 ? 1 : -1, l = kit.line([[-s, -d * s * 0.55, 0], [0, d * s * 0.55, 0], [s, -d * s * 0.55, 0]], C.blue, 2.4, 0.95); keep(l.material, 0.95); cg.add(l); }
        add(cg); rec.chev = cg;
      }
      if (rec.loud) {
        rec.flare = kit.flare(col, 0.8, 0.55); keep(rec.flare.material, 0.55); rec.flare.position.set(X, yClose, Z); add(rec.flare);
        rec.sparks = kit.points(NSP, col, 3.2, { opacity: 0.9 }); keep(rec.sparks.material, 0.9); add(rec.sparks);
      }
      recs.push(rec); byKey[r.key] = rec;
    }
    selRing = kit.line(Array.from({ length: 49 }, (_, i) => [Math.cos(i / 48 * Math.PI * 2) * 0.75, 0.02, Math.sin(i / 48 * Math.PI * 2) * 0.75]), C.tx, 1.6, 0.9); selRing.visible = false; add(selRing);
  }

  return {
    scene, camera, bloom: { strength: 0.7, radius: 0.42, threshold: 0.18 },
    update(t, dt, api2, g) {
      const st = api.st; pull(api);
      const cd = S.cd; if (cd !== built || (C0 && C0.blue !== g.C.blue) || (!C0 && cd)) build(cd, g.C);
      const showing = !!st.cinemaStop, aspect = g.W / Math.max(1, g.H), ph = aspect < 1;
      // selection: a click on a candle (or a LOUDEST row) flies to it; ALL MARKETS, or a click on nothing, flies back
      if (st.sel === 'bd:all') { st.sel = null; api.blip?.(700, 0.05); }
      const sk = typeof st.sel === 'string' && byKey[st.sel] ? st.sel : null;
      if (sk !== S.selKey) {
        if (sk && !showing) { const p = cd.layout[sk]; st.cdTarget = { x: p.x, z: p.z }; }
        else if (!sk && S.selKey && !showing) st.cdTarget = { x: 0, z: 0 };
        S.selKey = sk;
      }
      // the SHOW: which way the fly point is travelling tells the candles pass (front to back) from the lean pass (back to front)
      const tz = st.cdTarget?.z ?? 0; if (showing) { if (S.tz != null) { const v = (tz - S.tz) / Math.max(1e-3, dt); if (v < -0.02) S.lean = true; else if (v > 0.02) S.lean = false; } } else S.lean = false; S.tz = tz;
      // fades: the selected candle stays lit and the rest dim; in the lean pass the candles dim and the chevrons come forward
      for (const rc of recs) {
        const want = (sk && sk !== rc.r.key ? 0.3 : 1) * (S.lean ? 0.45 : 1); rc.f += (want - rc.f) * Math.min(1, dt * 4);
        for (const q of rc.mats) { const isChev = rc.chev && q.m === rc.chev.children[0]?.material; const f = isChev ? (sk && sk !== rc.r.key ? 0.35 : 1) : rc.f;
          if (q.kind === 'k') q.m.uniforms.k.value = q.base * f; else if (q.kind === 'holo') q.m.uniforms.op.value = q.base * f; else q.m.opacity = q.base * f; }
        if (rc.chev) { rc.chevS += ((S.lean ? 1.5 : 1) - rc.chevS) * Math.min(1, dt * 3); rc.chev.quaternion.copy(camera.quaternion); rc.chev.scale.setScalar(rc.chevS); rc.chev.position.y = rc.tipY + 0.55 + (H.calm ? 0 : 0.06 * Math.sin(t * 1.6 + rc.seed)); }
        if (rc.flare) { const k = H.calm ? 1 : 1 + 0.22 * Math.sin(t * 3 + rc.seed); rc.flare.scale.setScalar((0.6 + 0.4 * Math.min(1, Math.abs(rc.r.ratio) / CAP)) * k); }
        if (rc.sparks) {
          const A = rc.sparks.geometry.attributes.position.array, d = rc.r.body >= 0 ? 1 : -1, tt = H.calm ? 0 : t;
          for (let i = 0; i < NSP; i++) { const u = (tt * 0.32 + i / NSP + rc.seed) % 1, an = i * 2.399 + tt * 0.8, rr = 0.12 + 0.22 * u; A[i * 3] = rc.X + Math.cos(an) * rr; A[i * 3 + 1] = rc.yClose + d * u * 1.9; A[i * 3 + 2] = rc.Z + Math.sin(an) * rr; }
          rc.sparks.geometry.attributes.position.needsUpdate = true; rc.sparks.material.opacity = 0.85 * rc.f;
        }
      }
      if (selRing) { const rc = sk ? byKey[sk] : null; selRing.visible = !!rc; if (rc) { selRing.position.set(rc.X, 0, rc.Z); selRing.scale.setScalar(H.calm ? 1 : 1 + 0.08 * Math.sin(t * 3)); } }
      if (sweep) { const span = field.zf - field.zb, z = H.calm ? field.zf : field.zf - ((t * 0.08) % 1) * span; sweep.position.z = z; }
      // the camera: an orbit over the floor (drag / scroll), centred on the fly point; in the SHOW it skims low across the streets
      const fx = (st.cdCam?.x ?? 0) * SC, fz = -(st.cdCam?.z ?? 0) * SC, z = clamp(st.zoom || 1, 0.5, 2.6);
      if (showing) {
        const yaw = -0.38 + (st.cdCam?.x ?? 0) * 0.7, el = S.lean ? 0.48 : 0.3, d = (ph ? 16 : 11.5) / z;
        cam.wt.set(fx, S.lean ? 1.2 : 0.7, fz); cam.wp.set(fx + d * Math.cos(el) * Math.sin(yaw), cam.wt.y + d * Math.sin(el), fz + d * Math.cos(el) * Math.cos(yaw));
      } else {
        const fw = field.xr - field.xl, fit = ph ? Math.max(30, fw * 2.1) : Math.max(24, fw * 1.2 / Math.min(1.7, aspect) + 13), selD = sk ? 0.5 : 1;
        const yaw = (st.yaw ?? 0.3) - 0.3 + (H.calm ? 0 : Math.sin(t * 0.09) * 0.07) , el = clamp(0.7 - ((st.pitch ?? -0.5) + 0.5) * 0.8 + (ph ? 0.25 : 0), 0.08, 1.35), d = fit * selD / z;
        cam.wt.set(fx, sk ? 0.6 : 0.1, fz + (sk ? 0 : ph ? 0 : 0.8)); cam.wp.set(fx + d * Math.cos(el) * Math.sin(yaw), cam.wt.y + d * Math.sin(el), fz + d * Math.cos(el) * Math.cos(yaw));
      }
      if (cam.snap) { cam.p.copy(cam.wp); cam.t.copy(cam.wt); cam.snap = false; } else { const e = Math.min(1, dt * (showing ? 3.2 : 2.4)); cam.p.lerp(cam.wp, e); cam.t.lerp(cam.wt, e); }
      camera.position.copy(cam.p); camera.lookAt(cam.t);
    },
    overlay(ctx, g) { overlay(ctx, g, api, H, camera, recs, rowsW, post); },
    dispose() { clear(); },
  };
}

// ───────────────────────── the 2D overlay: names of the loudest, street names, the scale, the readout, the card and the key ─────────────────────────
const msg = (ctx, g, text) => { ctx.save(); ctx.globalAlpha = g.fade; ctx.fillStyle = g.C.tx2; ctx.font = '13px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(text, g.W / 2, g.H / 2); ctx.restore(); };
const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const toneCol = (C, r) => (r.tone === 'up' ? C.up : r.tone === 'dn' ? C.dn : C.tx2);
const londonTime = ms => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)); } catch (e) { return ''; } };

function overlay(ctx, g, api, H, camera, recs, rowsW, post) {
  const { W, H: HH, C, fade } = g, cp = g.compact, cd = S.cd, st = api.st;
  if (!cd?.ok || !recs.length) return msg(ctx, g, cd ? 'The market feed is not available right now.' : 'Reading the markets...');
  ctx.save(); ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  const showing = !!st.cinemaStop, sel = S.selKey ? recs.find(r => r.r.key === S.selKey) : null, bd = cd.board ?? {};
  // title and the tally
  const ty = cp ? 92 : 104; ctx.textAlign = 'left'; ctx.globalAlpha = fade; ctx.fillStyle = C.blue; ctx.font = `600 ${cp ? 13 : 15}px ui-monospace,monospace`; ctx.fillText('MARKET BOARD', 16, ty);
  ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = C.tx2; const lh1 = rowH(ctx, 16), y1 = ty + lh1;
  if (cd.label) ctx.fillText(`${cd.label} · each candle sized against its market's usual open-to-close move`, 16, y1); else ctx.fillText(cp ? `today so far vs each market's usual move${cd.at ? ` · ${londonTime(cd.at)}` : ''}` : `today's session so far, each candle sized against its market's usual open-to-close move${cd.at ? ` · read ${londonTime(cd.at)} London` : ''}`, 16, y1);
  let x = 16; const y2 = y1 + Math.max(17, lh1); ctx.font = '600 11px ui-monospace,monospace';
  for (const [t2, c] of [[`▲ ${bd.up ?? 0} up`, C.up], [`▼ ${bd.dn ?? 0} down`, C.dn], [`• ${bd.quiet ?? 0} barely moving`, C.tx2]]) { ctx.fillStyle = c; ctx.fillText(t2, x, y2); x += ctx.measureText(t2).width + 14; }
  if (bd.haveLean) { ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = C.blue; ctx.fillText(cp ? `lean: ▲${bd.bull} ▼${bd.bear} •${bd.flat} (no proven skill)` : `engine leans ▲ bullish ${bd.bull} · ▼ bearish ${bd.bear} · • neutral ${bd.flat}  (back-test: no proven skill)`, 16, y2 + lh1); }
  const hdrBot = (bd.haveLean ? y2 + lh1 : y2) + 10;

  // labels: reserved areas first (never drawn), then the loudest candles' names, the street names and the scale marks
  let nb = 0; const res = (x0, y0, w, h) => { const b = BOX[nb++]; Object.assign(b, { x: x0, y: y0, w, h, pri: 100, text: '', sub: '', col: '', ax: 0, ay: 0, kind: 'x', tries: null, below: false }); };
  res(0, 0, W, Math.max(ty + (bd.haveLean ? 26 : 10), hdrBot));
  const listW = 250, movers = topMovers(cd.rows, 6);
  ctx.font = '11px ui-monospace,monospace'; const lr = rowH(ctx, 17);
  if (!cp && !sel) res(W - listW - 24, ty - 18, listW + 24, 26 + movers.length * lr);
  if (sel) res(cp ? 0 : W - 330, cp ? ty + 30 : ty - 18, cp ? W : 330, cp ? 56 : 112);
  const P = Array(3).fill(0), scr = (x0, y0, z0) => { P[0] = x0; P[1] = y0; P[2] = z0; return H.toScreen(P, camera); };
  const loudN = cp ? 4 : 9, loud = new Set(topMovers(cd.rows, loudN).filter(r => Math.abs(r.ratio) > 1).map(r => r.key));
  for (const rc of recs) {
    const r = rc.r, isSel = sel === rc, named = isSel || loud.has(r.key);
    const up = r.body >= 0, a = up ? scr(rc.X, rc.tipY + (rc.chev ? 1.0 : 0.35), rc.Z) : scr(rc.X, rc.loY - 0.3, rc.Z), tip = scr(rc.X, rc.yClose, rc.Z);
    if (tip.vis) g.hit(r.key, tip.x, tip.y);
    if (!named || !a.vis || nb >= BOX.length) continue;
    ctx.font = `600 ${cp ? 11 : 12}px ui-monospace,monospace`; const t1 = marketName(r.key, { short: true }), w1 = ctx.measureText(t1).width;
    const p1 = fontPx(ctx.font); ctx.font = '11px ui-monospace,monospace'; const t2 = `${arrow(r)} ${xTxt(r.ratio)}${cp ? '' : ` · ${pctTxt(r.oc)}`}`, w = Math.max(w1, ctx.measureText(t2).width) + 10, h = Math.max(30, p1 + fontPx(ctx.font) + 8);
    const b = BOX[nb++]; Object.assign(b, { x: clamp(a.x - w / 2, 4, W - w - 4), y: up ? a.y - h : a.y, w, h, pri: isSel ? 60 : 40 + Math.abs(r.ratio), text: t1, sub: t2, col: toneCol(C, r), ax: a.x, ay: a.y, kind: 'n', tries: up ? TRY_UP : TRY_DN, below: !up });
  }
  if (!showing) for (const rw of rowsW) {
    if (!rw.title || nb >= BOX.length) continue; const p = scr(rw.x0 - 0.25, 0, rw.z); if (!p.vis) continue;
    ctx.font = '10px ui-monospace,monospace'; const w = ctx.measureText(rw.title).width + 6, hh = Math.max(12, fontPx(ctx.font) + 2), b = BOX[nb++];
    Object.assign(b, { x: p.x - w, y: p.y - hh / 2, w, h: hh, pri: 20, text: rw.title, sub: '', col: C.tx2, ax: p.x, ay: p.y, kind: 'r', tries: [0, -1, 1], below: false });
  }
  if (post && !cp && !showing) for (let k = -CAP; k <= CAP; k++) {
    const p = scr(post.x - 0.2, k * YU, post.z); if (!p.vis || nb >= BOX.length) continue;
    const tx = k === 0 ? 'open' : `${k > 0 ? '+' : '−'}${Math.abs(k)}×${Math.abs(k) === CAP ? ' cap' : ''}`; ctx.font = '10px ui-monospace,monospace'; const w = ctx.measureText(tx).width + 4, hh = Math.max(12, fontPx(ctx.font) + 2), b = BOX[nb++];
    Object.assign(b, { x: p.x - w - 4, y: p.y - hh / 2, w, h: hh, pri: 10, text: tx, sub: '', col: C.tx2, ax: p.x, ay: p.y, kind: 's', tries: [0], below: false });
  }
  placeLabels(BOX, { W, H: HH - (cp ? 140 : 116), n: nb, order: ORD, kept: KEPT });
  for (let i = 0; i < nb; i++) {
    const b = BOX[i]; if (b.kind === 'x' || !b.ok) continue;
    if (b.kind === 'r' || b.kind === 's') { ctx.textAlign = 'right'; ctx.font = '10px ui-monospace,monospace'; ctx.globalAlpha = fade * (b.kind === 'r' ? 0.8 : 0.65); ctx.fillStyle = b.col; ctx.fillText(b.text, b.x + b.w - 2, b.y + b.h - 2); continue; }
    const ey = b.below ? b.y : b.y + b.h; if (Math.abs(ey - b.ay) > 2) { ctx.globalAlpha = fade * 0.45; ctx.strokeStyle = b.col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(b.ax, b.ay); ctx.lineTo(clamp(b.ax, b.x, b.x + b.w), ey); ctx.stroke(); }
    ctx.globalAlpha = fade * 0.6; ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.globalAlpha = fade * 0.55; ctx.strokeStyle = b.col; ctx.lineWidth = 1; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    ctx.textAlign = 'center'; ctx.globalAlpha = fade; ctx.fillStyle = C.tx; ctx.font = `600 ${cp ? 11 : 12}px ui-monospace,monospace`; const q1 = fontPx(ctx.font), l1 = b.y + Math.max(12, q1 + 1); ctx.fillText(b.text, b.x + b.w / 2, l1);
    ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = b.col; ctx.fillText(b.sub, b.x + b.w / 2, Math.max(b.y + 25, l1 + fontPx(ctx.font) + 2));
  }
  if (sel) card(ctx, g, sel.r, ty); else if (!cp) loudest(ctx, g, movers, ty, listW);
  key(ctx, g);
  ctx.restore();
}

/** Desktop: the loudest movers, top right, each row clickable (flies to the candle). */
function loudest(ctx, g, movers, ty, w) {
  const { W, C, fade } = g, y0 = ty; if (!movers.length) return;
  // the three columns (name, bar, value) by measured width: the name column is as wide as the widest name, never a fixed 118px
  ctx.font = '11px ui-monospace,monospace'; const f = ctx.font, lr = rowH(ctx, 17);
  const L = LC.get('loud', f, `${S.cd?.at ?? ''}|${movers.length}|${movers[0]?.key ?? ''}`, () => { let nw = 0; for (const r of movers) nw = Math.max(nw, ctx.measureText(clip(marketName(r.key, { short: true }), 15)).width); const vw = ctx.measureText('▼ 3.0×').width; const bx = Math.max(118, Math.ceil(nw) + 10), vx = bx + 66; return { bx, vx, w: Math.max(w, vx + Math.ceil(vw) + 4) }; });
  const ww = L.w, x = W - ww - 16;
  ctx.globalAlpha = fade * 0.7; ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(x - 8, y0 - 14, ww + 16, 22 + movers.length * lr);
  ctx.textAlign = 'left'; ctx.globalAlpha = fade; ctx.fillStyle = C.blue; ctx.font = '600 11px ui-monospace,monospace'; ctx.fillText(S.cd?.label ? 'LOUDEST, LAST SESSION · click' : 'LOUDEST TODAY  ·  click to fly there', x, y0);
  ctx.font = '11px ui-monospace,monospace';
  movers.forEach((r, i) => {
    const yy = y0 + Math.max(18, lr + 1) + i * lr, len = Math.min(1, Math.abs(r.ratio) / CAP) * 60, c = toneCol(C, r);
    ctx.globalAlpha = fade; ctx.fillStyle = C.tx; ctx.fillText(clip(marketName(r.key, { short: true }), 15), x, yy);
    ctx.globalAlpha = fade * 0.85; ctx.fillStyle = c; ctx.fillRect(x + L.bx, yy - 8, Math.max(2, len), 7);
    ctx.globalAlpha = fade; ctx.fillText(`${arrow(r)}${xTxt(r.ratio)}`, x + L.vx, yy);
    g.hit(r.key, x + 60, yy - 4);
  });
}

/** The selected candle's card: the move, its size against the usual move, the session's range so far and the engine's reading with its caveat. */
function card(ctx, g, r, ty) {
  const { W, C, fade } = g, cp = g.compact, w = cp ? W - 32 : 314, x = cp ? 16 : W - w - 16, y0 = cp ? ty + 46 : ty, c = toneCol(C, r);
  const lines = cp
    ? [[`${arrow(r)} ${pctTxt(r.oc)} = ${xTxt(r.ratio)} usual · lean ${leanWord(r)}`, c]]
    : [[`${arrow(r)} ${pctTxt(r.oc)} open to now`, c], [`= ${xTxt(r.ratio)} its usual open-to-close move (${Math.abs(r.noise).toFixed(2)}%)`, C.tx2],
      [`session high ${xTxt(r.hi)} · low ${xTxt(r.lo)} (usual moves)`, C.tx2], [`bias engine: ${leanWord(r)}${r.haveLean && r.lean ? `, strength ${r.strength}` : ''} · no proven skill`, C.blue]];
  ctx.font = '11px ui-monospace,monospace'; const lc = rowH(ctx, 16), top0 = Math.max(18, lc + 2);
  ctx.globalAlpha = fade * 0.78; ctx.fillStyle = 'rgba(0,0,0,0.82)'; ctx.fillRect(x - 8, y0 - 14, w + 16, 12 + top0 + lines.length * lc);
  ctx.globalAlpha = fade * 0.6; ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.strokeRect(x - 7.5, y0 - 13.5, w + 15, 11 + top0 + lines.length * lc);
  ctx.textAlign = 'left'; ctx.globalAlpha = fade; ctx.fillStyle = C.tx; ctx.font = '600 12px ui-monospace,monospace'; ctx.fillText(clip(marketName(r.key), cp ? 26 : 30), x, y0 + 2);
  ctx.font = '11px ui-monospace,monospace'; lines.forEach(([t, cc], i) => { ctx.fillStyle = cc; ctx.fillText(t, x, y0 + top0 + i * lc); });
  // ALL MARKETS: back to the whole board
  const bw = 92, bx = x + w - bw, by = y0 - 7; ctx.globalAlpha = fade * 0.9; ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(bx, by - 8, bw, 18); ctx.strokeStyle = C.blue; ctx.strokeRect(bx + 0.5, by - 7.5, bw - 1, 17);
  ctx.globalAlpha = fade; ctx.fillStyle = C.tx; ctx.textAlign = 'center'; ctx.font = '10px ui-monospace,monospace'; ctx.fillText('ALL MARKETS', bx + bw / 2, by + 5); g.hit('bd:all', bx + bw / 2, by + 1);
}

function key(ctx, g) {
  const { H, C, fade } = g, cp = g.compact; ctx.textAlign = 'left'; ctx.font = '11px ui-monospace,monospace'; ctx.globalAlpha = fade * 0.9;
  // rows step by the measured line height (min the old 15/16px) and the key sits higher by however much taller it got, so it never runs off the bottom; the second row's three items sit by measured width
  const lk = rowH(ctx, cp ? 15 : 16), n = cp ? 5 : 4, y = H - (cp ? 128 : 104) - Math.max(0, (n - 1) * (lk - (cp ? 15 : 16))), bw = cp ? Math.min(g.W - 16, 340) : Math.min(g.W - 16, ctx.measureText('CANDLES · today session so far against each market usual open-to-close move · height = the move ÷ that usual move · faint lines = ±1 usual move · capped at 3×').width + 20);
  ctx.globalAlpha = fade * 0.62; ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(8, y - 14, bw, (cp ? 80 : 68) + (n - 1) * (lk - (cp ? 15 : 16))); ctx.globalAlpha = fade * 0.9;
  if (cp) {
    ctx.fillStyle = C.up; ctx.fillText('▲ green above the floor = up', 16, y); ctx.fillStyle = C.dn; ctx.fillText('▼ red below = down', 16, y + lk);
    ctx.fillStyle = C.tx2; ctx.fillText('height = move ÷ usual move · grey < ½ · cap 3×', 16, y + 2 * lk);
    ctx.fillStyle = C.blue; ctx.fillText('chevron = engine lean, no proven skill', 16, y + 3 * lk);
    ctx.fillStyle = C.gold; ctx.fillText('What has happened today; not a forecast.', 16, y + 4 * lk);
    return;
  }
  ctx.fillStyle = C.tx2; ctx.fillText('CANDLES · today\'s session so far against each market\'s usual open-to-close move · height = the move ÷ that usual move · faint lines = ±1 usual move · capped at 3×', 16, y);
  const k1 = '▲ green above the floor = up', k2 = '▼ red below = down';
  let x = 16; ctx.fillStyle = C.up; ctx.fillText(k1, x, y + lk); x += Math.max(214, ctx.measureText(k1).width + 18); ctx.fillStyle = C.dn; ctx.fillText(k2, x, y + lk); x += Math.max(146, ctx.measureText(k2).width + 18); ctx.fillStyle = C.tx2; ctx.fillText('• grey = under half a usual move · click a candle to fly there · drag to turn, scroll to zoom', x, y + lk);
  ctx.fillStyle = C.blue; ctx.fillText('CHEVRONS · the bias engine\'s lean (▲ bullish, ▼ bearish, dot neutral; size = strength) · back-test: no proven direction skill', 16, y + 2 * lk);
  ctx.fillStyle = C.gold; ctx.fillText('What has happened so far today, description only, not a forecast or a trade.', 16, y + 3 * lk);
}

registerJarvisModule({
  id: 'board3d', label: 'MARKET BOARD',
  render(pane, api) {
    pane.innerHTML = `<h3>MARKET BOARD</h3><p>Every desk market's session candle so far today, standing on a glowing trading floor: green candles rise above the floor, red ones hang below it, each sized against its own market's usual open-to-close move so a big day in a quiet market stands as tall as a big day in a wild one (capped at three usual moves). The blue chevron over each is the bias engine's lean, whose back-test found no proven skill at direction. Only the loudest movers are named; click any candle to fly to it.</p><p class="jv-sub">What has happened so far today, description only, not a forecast.</p><div class="jv-row"><button type="button" data-bd="go">▶ SHOW THE BOARD</button></div>`;
    pane.querySelector('[data-bd="go"]').onclick = () => { api.setView(ID); S.asked = 0; };
  },
  views: [glView({
    id: ID, label: 'BOARD', env: { accent: 'blue2', chrome: 'clean', scan: false }, setup,
    onEnter: api => { S.asked = 0; S.selKey = null; S.lean = false; S.tz = null; if (S.spin == null) S.spin = api.st.spin; api.st.spin = false; pull(api); },
    onLeave: api => { if (S.spin != null) api.st.spin = S.spin; S.spin = null; },
  })],
});
