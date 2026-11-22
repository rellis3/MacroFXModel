// js/terminal/jarvisViewCcy.js: Jarvis's CURRENCIES view, a WebGL hologram (jarvisGL.js). The eight majors as a gold orrery over a projector table: each currency is a glowing sphere on its
// own tilted ring around a pulsing core, the pairs that moved most today are glowing gold tubes strung between the spheres, and a ranked strength bar readout sits on the left.
// ENCODING (also drawn on screen):
//   ring          = RANK by today's strength (the average of its pair moves against their usual size): strongest on the inner ring, weakest outermost
//   sphere size   = the SIZE of the move, |strength|, whatever its direction: sphere area is proportional to |strength| on one fixed scale (3 usual moves = full size), with a small floor
//                   so a still currency stays visible (jarvisCcyCore.sizeOf). A review found the old view sized by SIGNED strength, which drew the weakest currency smallest and hid a big fall.
//   colour + cue  = green up / red down / grey barely moved (under 0.12), and a second cue: a glowing cone above (up) or below (down) each sphere, and ▲ / ▼ in every label and bar
//   bar readout   = the eight currencies ranked, signed bars from a centre line, one fixed scale for the whole list
//   gold tubes    = the eight pairs that moved most today; tube thickness = that pair's move against its usual move (capped at 3x); particles run from the weaker side toward the stronger
//   orbit speed   = DECORATION only: every sphere turns at the same slow rate, nothing about the motion is data (the key says so). Reduced motion stops it.
// Click a sphere or a bar row to light its ring and its pairs and open a card of its biggest pair moves. Drag/zoom orbit the camera. SHOW: the camera drops from a high overview onto the
// strongest currency's sphere, flies out to the weakest one, then pulls back low over the tubes.
// Data: /api/vol-forecast/live (instruments: oc and forecast.oc_median per pair); maths in jarvisCcyCore.js.
// DESCRIPTION ONLY: how far each currency has travelled so far today, never a forecast.
import { marketName, currencyName, getNameStyle } from './jarvisNames.js';
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { glView, orbitPos as camOrbit, ease } from './jarvisGL.js';
import { placeLabels } from './fxHoloCore.js';
import { CAP, ccyStrength, ccyScript, orbitPos, ringRadius, sizeOf, signed, dirOf, arrowOf } from './jarvisCcyCore.js';

const TAU = Math.PI * 2, SC = 1.85, RMAX = 0.36, NARC = 8, ARC = 28, NP = 14, SEG = 96, TABLE_Y = -1.55;
const KEY = 'ring = rank (strongest inside) · sphere size = size of the move, up or down · ▲ green up, ▼ red down · tubes = biggest pair moves · orbit motion is decoration · description only, not a forecast';
const S = { R: null, label: '', at: 0, busy: null, err: false, ang: new Float32Array(8), tx: new Float32Array(8), tz: new Float32Array(8), pos: new Float32Array(24), tmp: Array(3).fill(0),
  showP: -1, showAt: 0, bg: 'black', spin: null, labels: [], drift: 0 };
for (let i = 0; i < 8; i++) S.ang[i] = i * 2.3;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const showing = () => S.showP >= 0 && Date.now() - S.showAt < 1500;

/** Load today's moves and score the eight currencies. Cached for five minutes; a failed feed is a null result, never a throw. */
export function loadCcy(api, force = false) {
  if (!force && S.R && Date.now() - S.at < 300000) return Promise.resolve(S.R);
  if (S.busy) return S.busy;
  S.busy = (async () => {
    let v = null; try { v = await api.jf('/api/vol-forecast/live'); } catch (e) { /* null below */ }
    S.R = ccyStrength(v?.instruments); S.label = String(v?.session_label ?? ''); S.err = !S.R; S.at = Date.now(); return S.R;
  })().finally(() => { S.busy = null; });
  return S.busy;
}

registerJarvisModule({
  id: 'ccy', label: 'CURRENCIES',
  render(pane, api) {
    const { esc } = api; pane.innerHTML = '<h3>CURRENCIES</h3><p class="jv-sub">Reading the currency moves...</p>';
    loadCcy(api, true).then(R => {
      if (!R) { pane.innerHTML = '<h3>CURRENCIES</h3><p>No currency strength for today yet.</p>'; return; }
      pane.innerHTML = `<h3>THE EIGHT MAJORS</h3><p>Each currency scored as the average of its pair moves against their usual size, so far today. In the orrery the ring is the rank (strongest inside) and the sphere's size is the size of the move, up or down. A description, not a forecast.</p>
<div class="jv-row"><button type="button" data-c="go">SHOW THE ORRERY</button></div>
<table class="jv-tab"><thead><tr><th>#</th><th>currency</th><th>strength</th></tr></thead><tbody>${R.list.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(currencyName(r.ccy))}${getNameStyle() === 'names' ? ` <span class="jv-sub">${esc(r.ccy)}</span>` : ''}</td><td>${esc(arrowOf(r.s))} ${esc(signed(r.s))}</td></tr>`).join('')}</tbody></table>`;
      pane.querySelector('[data-c="go"]').onclick = () => api.setView('ccy');
    });
  },
  views: [glView({
    id: 'ccy', label: 'CURRENCIES', env: { accent: 'gold', chrome: 'clean', scan: false },
    onEnter: api => {
      S.showP = -1; S.spin = api.st.spin; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false });
      try { S.bg = api.win.getComputedStyle(api.doc.documentElement).getPropertyValue('--bg1').trim() || 'black'; } catch (e) { S.bg = 'black'; }
      loadCcy(api, true);
    },
    onLeave: api => { S.showP = -1; if (S.spin != null) api.st.spin = S.spin; S.spin = null; },
    setup: (L, H, api) => build(L, H, api),
  })],
});

function build(L, H, api) {
  const { THREE } = L, kit = H.kit, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  const C0 = api.colours?.() ?? {}, gold0 = C0.gold ?? 'gold';
  scene.fog = new THREE.FogExp2(new THREE.Color('black'), 0.03);
  scene.add(kit.dust(1100, 30, C0.tx2 ?? 'gray'));
  const table = kit.table(4.4, gold0, TABLE_Y, 7, 36); scene.add(table);
  // projector beam: a faint Fresnel cylinder from the table up to the orrery
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.1, -TABLE_Y - 0.2, 96, 1, true), kit.holo(gold0, { rim: 2.6, base: 0, scan: 0.5, opacity: 0.07 })); beam.position.y = (TABLE_Y - 0.2) / 2; scene.add(beam);
  // the core: a hot gold flare, a hologram sphere and three counter-turning gyro rings
  const core = new THREE.Group(); scene.add(core);
  const coreFlare = kit.flare(gold0, 0.9, 0.7), coreShell = new THREE.Mesh(new THREE.SphereGeometry(0.26, 32, 24), kit.holo(gold0, { rim: 1.4, base: 0.12, scan: 1 }));
  const coreDot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicMaterial({ color: H.color(C0.tx ?? 'white') }));
  core.add(coreFlare, coreShell, coreDot);
  const torG = [0, 1, 2].map(k => new THREE.TorusGeometry(0.42 + k * 0.14, 0.007, 6, 96)), tors = torG.map((g, k) => { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: H.color(gold0), transparent: true, opacity: 0.6 - k * 0.12, blending: THREE.AdditiveBlending, depthWrite: false })); core.add(m); return m; });

  // eight orbit rings, each a unit circle in its own tilted group (rotation = orbitPos's Rz(tz)·Rx(tx))
  const circle = []; for (let k = 0; k <= SEG; k++) { const a = k / SEG * TAU; circle.push([Math.cos(a), 0, Math.sin(a)]); }
  const rings = []; for (let i = 0; i < 8; i++) {
    const grp = new THREE.Group(), r = ringRadius(i) * SC; grp.rotation.order = 'ZYX';
    const ln = kit.line(circle.map(p => [p[0] * r, 0, p[2] * r]), gold0, 1.3, 0.3); grp.add(ln); scene.add(grp); rings.push({ grp, ln });
  }
  // the spheres (one per rank slot; recoloured from the data each frame)
  const sphG = new THREE.SphereGeometry(1, 40, 28), coneG = new THREE.ConeGeometry(0.07, 0.15, 16);
  const add = m => new THREE.MeshBasicMaterial({ transparent: true, opacity: m, depthWrite: false, blending: THREE.AdditiveBlending });
  const balls = []; for (let i = 0; i < 8; i++) {
    const g = new THREE.Group(), shell = new THREE.Mesh(sphG, kit.holo(gold0, { rim: 1.5, base: 0.1, scan: 0.7 })), inner = new THREE.Mesh(sphG, add(0.55)), fl = kit.flare(gold0, 1, 0.55), cone = new THREE.Mesh(coneG, add(0.95)), halo = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.33, 64), add(0.0));
    g.add(fl, inner, shell, halo, cone); scene.add(g); balls.push({ g, shell, inner, fl, cone, halo, rad: 0.1 });
  }
  // the pair tubes: a bright core line and a wide soft halo per pair, and particles running toward the stronger side
  const arcPts = Array.from({ length: NARC }, () => Array.from({ length: ARC + 1 }, () => Array(3).fill(0)));
  const tubes = arcPts.map(p => { const c = kit.line(p, gold0, 3, 0.95), h = kit.line(p, gold0, 12, 0.16); scene.add(h, c); return { c, h, mid: Array(3).fill(0), ctrl: Array(3).fill(0), a: Array(3).fill(0), b: Array(3).fill(0), w: 0 }; });
  const parts = kit.points(NARC * NP, C0.tx ?? 'white', 6, { opacity: 0.95 }); scene.add(parts); const pa = parts.geometry.attributes.position.array;

  const cc = { k: null, up: new THREE.Color(), dn: new THREE.Color(), flat: new THREE.Color(), gold: new THREE.Color(), tx: new THREE.Color() };
  const sync = C => { const k = `${C.up}|${C.dn}|${C.gold}|${C.tx}|${C.tx2}`; if (k === cc.k) return; cc.k = k; cc.up.copy(H.color(C.up)); cc.dn.copy(H.color(C.dn)); cc.flat.copy(H.color(C.tx2)); cc.gold.copy(H.color(C.gold)); cc.tx.copy(H.color(C.tx)); };
  const colOf = s => (dirOf(s) === 'up' ? cc.up : dirOf(s) === 'dn' ? cc.dn : cc.flat);
  const P = i => [S.pos[i * 3], S.pos[i * 3 + 1], S.pos[i * 3 + 2]];
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3() }, kp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], kl = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

  function update(t, dt, api_, g) {
    sync(g.C);
    if (S.R && Date.now() - S.at > 300000 && !S.busy) loadCcy(api_);
    const R = S.R, sel = R && R.list.some(r => r.ccy === api_.st.sel) ? api_.st.sel : null, calm = H.calm, move = calm ? 0 : dt;
    S.drift += move;
    // the core beats; the gyro rings turn (decoration)
    const beat = 1 + (calm ? 0 : 0.07 * Math.sin(t * 1.8)); coreFlare.scale.setScalar(0.9 * beat); core.position.y = calm ? 0 : 0.04 * Math.sin(t * 0.6);
    tors.forEach((m, k) => { m.rotation.x = 1.2 + k * 0.5 + S.drift * 0.3 * (k % 2 ? -1 : 1); m.rotation.y = S.drift * 0.2 * (k + 1); });
    // rings precess slowly; spheres all orbit at one slow rate (decoration: the motion carries no data)
    for (let i = 0; i < 8; i++) {
      S.tx[i] = 0.32 + 0.22 * Math.sin(i * 1.9 + S.drift * 0.07); S.tz[i] = (i % 2 ? 0.34 : -0.3) * Math.cos(i * 0.8 + S.drift * 0.05);
      rings[i].grp.rotation.set(S.tx[i], 0, S.tz[i]);
      S.ang[i] += move * 0.09 * (showing() ? 0.35 : 1) * (i % 2 ? -1 : 1);
      orbitPos(i, S.ang[i], S.tx[i], S.tz[i], S.tmp); S.pos[i * 3] = S.tmp[0] * SC; S.pos[i * 3 + 1] = S.tmp[1] * SC; S.pos[i * 3 + 2] = S.tmp[2] * SC;
      const r = R?.list[i], b = balls[i], hot = sel && r?.ccy === sel;
      rings[i].ln.material.color.copy(hot ? cc.tx : cc.gold); rings[i].ln.material.opacity = sel ? (hot ? 0.5 : 0.12) : 0.3 - i * 0.015; rings[i].ln.material.linewidth = hot ? 1.8 : 1.3;
      b.g.visible = !!r; if (!r) continue;
      const c = colOf(r.s), dim = sel && !hot ? 0.4 : 1, rad = RMAX * sizeOf(r.s); b.rad = rad;
      b.g.position.set(S.pos[i * 3], S.pos[i * 3 + 1], S.pos[i * 3 + 2]);
      b.shell.scale.setScalar(rad); b.shell.material.uniforms.c.value.copy(c); b.shell.material.uniforms.op.value = dim;
      b.inner.scale.setScalar(rad * 0.62); b.inner.material.color.copy(c); b.inner.material.opacity = 0.85 * dim;
      b.fl.scale.setScalar(rad * 4.2 * (1 + (calm ? 0 : 0.05 * Math.sin(t * 2 + i)))); b.fl.material.color.copy(c); b.fl.material.opacity = 0.32 * dim;
      b.halo.visible = !!hot; b.halo.scale.setScalar(rad); b.halo.material.color.copy(cc.tx); b.halo.material.opacity = 0.4; b.halo.lookAt(camera.position);
      const d = dirOf(r.s); b.cone.visible = d !== 'flat'; b.cone.material.color.copy(c); b.cone.material.opacity = 0.95 * dim;
      b.cone.position.set(0, d === 'up' ? rad + 0.13 : -rad - 0.13, 0); b.cone.rotation.set(d === 'up' ? 0 : Math.PI, S.drift * 0.8, 0);
    }
    // tubes between the spheres of the eight biggest pair moves
    const by = {}; R?.list.forEach((r, i) => { by[r.ccy] = i; });
    const top = R ? R.pairs.slice(0, NARC) : [];
    tubes.forEach((tb, n) => {
      const pr = top[n], on = !!pr; tb.c.visible = tb.h.visible = on;
      if (!on) { for (let q = 0; q < NP; q++) pa[(n * NP + q) * 3 + 1] = -99; return; }
      const w = Math.min(1, Math.abs(pr.ratio) / CAP), hot = !sel || pr.base === sel || pr.quote === sel;
      const strong = pr.ratio >= 0 ? pr.base : pr.quote, weak = pr.ratio >= 0 ? pr.quote : pr.base, a = P(by[weak]), b = P(by[strong]);
      const lift = 0.7 + 0.6 * w + n * 0.06;
      tb.ctrl[0] = (a[0] + b[0]) * 0.3; tb.ctrl[1] = (a[1] + b[1]) * 0.3 + lift; tb.ctrl[2] = (a[2] + b[2]) * 0.3;
      const pts = arcPts[n]; for (let k = 0; k <= ARC; k++) { const u = k / ARC, A = (1 - u) * (1 - u), B = 2 * u * (1 - u), Cq = u * u; for (let j = 0; j < 3; j++) pts[k][j] = A * a[j] + B * tb.ctrl[j] + Cq * b[j]; }
      tb.mid[0] = pts[ARC >> 1][0]; tb.mid[1] = pts[ARC >> 1][1]; tb.mid[2] = pts[ARC >> 1][2]; tb.w = w;
      kit.setLine(tb.c, pts); kit.setLine(tb.h, pts);
      tb.c.material.linewidth = 1.2 + 5.5 * w; tb.h.material.linewidth = 4 + 10 * w; tb.c.material.color.copy(cc.gold); tb.h.material.color.copy(cc.gold);
      tb.c.material.opacity = hot ? 0.45 + 0.4 * w : 0.08; tb.h.material.opacity = hot ? 0.035 + 0.05 * w : 0.01;
      for (let q = 0; q < NP; q++) {
        const u = calm ? (q + 0.5) / NP : (t * (0.18 + 0.22 * w) + q / NP + n * 0.13) % 1, A = (1 - u) * (1 - u), B = 2 * u * (1 - u), Cq = u * u, o = (n * NP + q) * 3;
        if (!hot) { pa[o + 1] = -99; continue; }
        for (let j = 0; j < 3; j++) pa[o + j] = A * a[j] + B * tb.ctrl[j] + Cq * b[j];
      }
    });
    parts.geometry.attributes.position.needsUpdate = true;
    // camera: the SHOW flight, else the HUD orbit with a slow drift
    const aspect = g.W / Math.max(1, g.H), far = aspect < 1 ? 1.9 : aspect < 1.4 ? 1.25 : 1, tg = aspect < 1 ? [0, -0.9, 0] : [-1.3, -0.2, 0];
    if (showing() && R) { flight(S.showP, far, tg); camera.position.copy(cam.pos); camera.lookAt(cam.look); }
    else H.orbit(camera, api_.st, { dist: 12.5 * far, target: tg, elev: 0.62, lo: 0.06, hi: 1.4, yawAdd: -0.35 + Math.sin(S.drift * 0.1) * 0.15 });
  }

  /** SHOW camera: high overview -> down onto the strongest sphere -> out to the weakest -> low over the tubes. Keyframes follow the moving spheres. */
  function flight(p, far, tg) {
    const R = S.R, hi = 0, lo = R.list.length - 1, near = (i, k) => {
      const x = S.pos[i * 3], y = S.pos[i * 3 + 1], z = S.pos[i * 3 + 2], h = Math.hypot(x, z) || 1, rad = balls[i].rad;
      kl[k].set(x * 0.85, y, z * 0.85); kp[k].set(x + (x / h) * (2.6 + 4 * rad) + (-z / h) * 1.3, y + 1.3 + rad, z + (z / h) * (2.6 + 4 * rad) + (x / h) * 1.3);
    };
    const o0 = camOrbit(-0.6, 1.15, 13 * far, tg), o3 = camOrbit(0.9, 0.5, 12.5 * far, tg);
    kp[0].set(o0[0], o0[1], o0[2]); kl[0].set(tg[0], tg[1], tg[2]); near(hi, 1); near(lo, 2); kp[3].set(o3[0], o3[1], o3[2]); kl[3].set(tg[0], tg[1] + 0.4, tg[2]);
    const seg = [[0, 0.1, 0, 0], [0.1, 0.32, 0, 1], [0.32, 0.45, 1, 1], [0.45, 0.62, 1, 2], [0.62, 0.8, 2, 2], [0.8, 1.01, 2, 3]];
    const s = seg.find(x => p < x[1]) ?? seg[seg.length - 1], u = ease((p - s[0]) / (s[1] - s[0]));
    cam.pos.copy(kp[s[2]]).lerp(kp[s[3]], u); cam.look.copy(kl[s[2]]).lerp(kl[s[3]], u);
  }

  function overlay(ctx, g, api_) {
    const { W, H: Hh, C, fade } = g, cp = g.compact, R = S.R;
    ctx.save(); ctx.textBaseline = 'alphabetic';
    if (!R) { msg(ctx, g, S.busy || !S.at ? 'Reading the currency moves...' : 'No currency strength for today yet. The FX move feed is unavailable or too thin: nothing is drawn rather than guessed.'); ctx.restore(); return; }
    const sel = R.list.some(r => r.ccy === api_.st.sel) ? api_.st.sel : null, items = S.labels, f = cp ? 11 : 12; let n = 0;
    const put = (txt, x, y, w, pri, colr, kind, key) => { const it = items[n] ?? (items[n] = {}); Object.assign(it, { txt, x, y, w, h: f + 4, pri, colr, kind, key, show: false }); n++; };
    for (const b of blocks(g, sel)) { const it = items[n] ?? (items[n] = {}); Object.assign(it, { txt: '', x: b[0], y: b[1], w: b[2], h: b[3], pri: 1e9, kind: 'block', show: false }); n++; }
    ctx.font = `600 ${f}px ui-monospace,monospace`;
    // sphere labels: ▲ name +0.86 above each sphere
    R.list.forEach((r, i) => {
      const b = balls[i], top = H.toScreen([S.pos[i * 3], S.pos[i * 3 + 1] + b.rad + 0.32, S.pos[i * 3 + 2]], camera), mid = H.toScreen([S.pos[i * 3], S.pos[i * 3 + 1], S.pos[i * 3 + 2]], camera);
      if (mid.vis) g.hit(r.ccy, mid.x, mid.y);
      if (!top.vis) return;
      const txt = `${arrowOf(r.s)} ${currencyName(r.ccy, { short: true })} ${signed(r.s)}`, w = ctx.measureText(txt).width;
      put(txt, clamp(top.x - w / 2, 4, W - w - 4), top.y - f - 2, w, (sel === r.ccy ? 100 : 0) + (i === 0 || i === 7 ? 30 : 20 - i), colOf2(C, r.s), 'ccy', r.ccy);
    });
    // tube labels: the top five pairs (two on a phone)
    const by = {}; R.list.forEach((r, i) => { by[r.ccy] = i; });
    R.pairs.slice(0, cp ? 2 : 5).forEach((pr, k) => {
      if (sel && pr.base !== sel && pr.quote !== sel) return;
      const m = H.toScreen(tubes[k].mid, camera); if (!m.vis) return;
      ctx.font = `${f - 1}px ui-monospace,monospace`; const txt = `${marketName(pr.key, { short: true })} ${pr.ratio >= 0 ? '+' : '-'}${Math.abs(pr.ratio).toFixed(1)}x`, w = ctx.measureText(txt).width; ctx.font = `600 ${f}px ui-monospace,monospace`;
      put(txt, m.x - w / 2, m.y - f - 6, w, 15 - k, C.gold, 'arc');
    });
    items.length = n; placeLabels(items, { W, H: Hh, tries: 3 });
    for (const it of items) {
      if (!it.show || it.kind === 'block') continue; const dim = sel && it.kind === 'ccy' && it.key !== sel;
      ctx.font = it.kind === 'arc' ? `${f - 1}px ui-monospace,monospace` : `600 ${f}px ui-monospace,monospace`;
      ctx.globalAlpha = fade * (dim ? 0.35 : 0.66); ctx.fillStyle = S.bg; ctx.fillRect(it.x - 3, it.y - 1, it.w + 6, it.h);
      ctx.globalAlpha = fade * (dim ? 0.5 : 1); ctx.fillStyle = it.colr; ctx.textAlign = 'left'; ctx.fillText(it.txt, it.x, it.y + f);
    }
    header(ctx, g); bars(ctx, g, R, sel); card(ctx, g, R, sel); keyLine(ctx, g);
    ctx.restore();
  }

  const colOf2 = (C, s) => (dirOf(s) === 'up' ? C.up : dirOf(s) === 'dn' ? C.dn : C.tx2);
  const geo = g => {   // where the HUD text blocks sit
    const cp = g.compact, W = g.W, Hh = g.H;
    return cp ? { hx: 14, hy: 118, bx: 10, by: Hh - 128 - 8 * 16, bw: W - 20, rh: 16, cx: 10, cy: 168, cw: W - 20, ky: Hh - 70 }
      : (() => { const hy = g.top > 0 ? 100 : 166, by = hy + 48; return { hx: 22, hy, bx: 22, by, bw: 290, rh: 24, cx: 22, cy: by + 50 + 8 * 24 + 16, cw: 330, ky: Hh - 64 }; })();   // (under the HUD's safe area the menus are already cleared)
  };
  function blocks(g, sel) {
    const q = geo(g), out = [[q.hx - 4, q.hy - 16, g.compact ? g.W - 20 : 470, 40], [q.bx - 4, q.by - 4, q.bw + 8, 40 + 8 * q.rh], [8, q.ky - (g.compact ? 34 : 18), g.W - 16, g.compact ? 50 : 28]];
    if (sel) out.push([q.cx - 4, q.cy - 18, q.cw + 8, g.compact ? 40 : 110]);
    return out;
  }
  function header(ctx, g) {
    const { C, fade } = g, q = geo(g), cp = g.compact; ctx.textAlign = 'left';
    ctx.globalAlpha = fade; ctx.fillStyle = C.gold; ctx.font = `600 ${cp ? 12 : 14}px ui-monospace,monospace`; ctx.fillText(/^LAST SESSION/.test(S.label) ? 'CURRENCIES · the eight majors, last session' : 'CURRENCIES · the eight majors, so far today', q.hx, q.hy);
    ctx.globalAlpha = fade * 0.85; ctx.fillStyle = C.tx2; ctx.font = `${cp ? 10 : 11}px ui-monospace,monospace`;
    ctx.fillText(`${S.label && !cp ? S.label + ' · ' : ''}strength = avg pair move vs its usual move`, q.hx, q.hy + (cp ? 14 : 17));
  }
  /** The ranked strength readout: eight signed bars from a centre line, one fixed scale (the biggest |strength| on the list). */
  function bars(ctx, g, R, sel) {
    const { C, fade } = g, q = geo(g), cp = g.compact, maxAbs = Math.max(0.25, ...R.list.map(r => Math.abs(r.s))), mid = q.bx + (cp ? q.bw * 0.5 : 158), half = cp ? Math.min(70, q.bw * 0.18) : 62;
    ctx.globalAlpha = fade * 0.72; ctx.fillStyle = S.bg; ctx.fillRect(q.bx - 4, q.by - 4, q.bw + 8, (cp ? 18 : 36) + 8 * q.rh);
    ctx.globalAlpha = fade * 0.75; ctx.strokeStyle = C.gold; ctx.lineWidth = 1; ctx.strokeRect(q.bx - 3.5, q.by - 3.5, q.bw + 7, (cp ? 18 : 36) + 8 * q.rh);
    ctx.globalAlpha = fade; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(q.bx + 18, q.by - 4); ctx.lineTo(q.bx - 4, q.by - 4); ctx.lineTo(q.bx - 4, q.by + 18); ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillStyle = C.gold; ctx.font = `600 ${cp ? 10 : 12}px ui-monospace,monospace`; ctx.fillText(cp ? 'STRENGTH, strongest first' : 'STRENGTH RANK', q.bx + 8, q.by + (cp ? 10 : 15));
    if (!cp) { ctx.fillStyle = C.tx2; ctx.font = '10px ui-monospace,monospace'; ctx.fillText('weaker ◄  0  ► stronger', mid - 70, q.by + 29); }
    const y0 = q.by + (cp ? 16 : 36);
    ctx.globalAlpha = fade * 0.45; ctx.fillStyle = C.tx2; ctx.fillRect(mid, y0, 1, 8 * q.rh - 4);
    R.list.forEach((r, i) => {
      const y = y0 + i * q.rh, c = colOf2(C, r.s), hot = sel === r.ccy, bh = cp ? 9 : 12;
      if (hot) { ctx.globalAlpha = fade * 0.2; ctx.fillStyle = C.gold; ctx.fillRect(q.bx, y, q.bw, q.rh - 2); }
      ctx.globalAlpha = fade * (sel && !hot ? 0.55 : 1); ctx.fillStyle = C.tx2; ctx.font = `${cp ? 10 : 11}px ui-monospace,monospace`; ctx.textAlign = 'left'; ctx.fillText(String(i + 1), q.bx + 6, y + q.rh * 0.68);
      ctx.fillStyle = C.tx; ctx.font = `${cp ? 11 : 12}px ui-monospace,monospace`; ctx.fillText(currencyName(r.ccy, { short: true }), q.bx + 22, y + q.rh * 0.68);
      const w = half * Math.min(1, Math.abs(r.s) / maxAbs); ctx.fillStyle = c; ctx.globalAlpha = fade * (sel && !hot ? 0.45 : 0.9); ctx.fillRect(r.s >= 0 ? mid + 1 : mid - w, y + (q.rh - bh) / 2 - 1, w, bh);
      ctx.globalAlpha = fade * (sel && !hot ? 0.55 : 1); ctx.textAlign = 'right'; ctx.font = `600 ${cp ? 11 : 12}px ui-monospace,monospace`; ctx.fillText(`${arrowOf(r.s)} ${signed(r.s)}`, q.bx + q.bw - 6, y + q.rh * 0.68);
      g.hit(r.ccy, q.bx + 50, y + q.rh / 2);
    });
  }
  function card(ctx, g, R, sel) {
    if (!sel) return; const { C, fade } = g, q = geo(g), cp = g.compact, mine = R.pairs.filter(p => p.base === sel || p.quote === sel).slice(0, cp ? 1 : 5), r = R.list.find(x => x.ccy === sel), rank = R.list.indexOf(r) + 1;
    ctx.textAlign = 'left'; const lh = 15, bh = cp ? 34 : 26 + mine.length * lh;
    ctx.globalAlpha = fade * 0.8; ctx.fillStyle = S.bg; ctx.fillRect(q.cx - 4, q.cy - 18, q.cw + 8, bh); ctx.globalAlpha = fade * 0.85; ctx.strokeStyle = C.gold; ctx.lineWidth = 1; ctx.strokeRect(q.cx - 3.5, q.cy - 17.5, q.cw + 7, bh);
    ctx.globalAlpha = fade; ctx.fillStyle = C.tx; ctx.font = `600 ${cp ? 11 : 12}px ui-monospace,monospace`;
    ctx.fillText(`${currencyName(sel, { short: true })} · #${rank} of 8 · ${arrowOf(r.s)} ${signed(r.s)}${cp ? '' : ' · its biggest pair moves'}`, q.cx + 4, q.cy - 2);
    ctx.font = `${cp ? 10 : 11}px ui-monospace,monospace`;
    mine.forEach((p, i) => { const forMe = p.base === sel ? p.ratio : -p.ratio; ctx.fillStyle = forMe >= 0 ? C.up : C.dn; ctx.fillText(`${marketName(p.key)}  ${p.ratio >= 0 ? '+' : '-'}${Math.abs(p.ratio).toFixed(2)}x usual (${forMe >= 0 ? '▲ for' : '▼ for'} ${sel})`, q.cx + 4, q.cy + 13 + i * lh); });
  }
  function keyLine(ctx, g) {
    const { C, fade } = g, q = geo(g), cp = g.compact; ctx.textAlign = 'left'; ctx.font = `${cp ? 10 : 11}px ui-monospace,monospace`;
    ctx.globalAlpha = fade * 0.62; ctx.fillStyle = S.bg; ctx.fillRect(cp ? 6 : 16, q.ky - (cp ? 30 : 30), g.W - (cp ? 12 : 32), cp ? 46 : 38);
    ctx.globalAlpha = fade * 0.95; ctx.fillStyle = C.gold;
    if (cp) { ctx.fillText('ring = rank · size = size of move, up or down', 12, q.ky - 18); ctx.fillText('▲ green up ▼ red down · tubes = biggest pairs', 12, q.ky - 4); ctx.fillStyle = C.tx2; ctx.fillText('orbit motion is decoration · description, not a forecast', 12, q.ky + 10); }
    else { ctx.fillText(KEY, 22, q.ky); ctx.fillStyle = C.tx2; ctx.globalAlpha = fade * 0.8; ctx.fillText('tube thickness = pair move vs its usual (cap 3x), particles run toward the stronger side · click a sphere or a bar · drag to orbit', 22, q.ky - 16); }
  }
  function msg(ctx, g, text) { const bw = Math.min(620, g.W - 16); ctx.globalAlpha = g.fade * 0.8; ctx.fillStyle = S.bg; ctx.fillRect(g.W / 2 - bw / 2, g.H / 2 - 22, bw, 60); ctx.globalAlpha = g.fade; ctx.fillStyle = g.C.tx2; ctx.font = '13px ui-monospace,monospace'; ctx.textAlign = 'center'; wrap(ctx, text, g.W / 2, g.H / 2, bw - 30, 18); }

  return { scene, camera, update, overlay, bloom: { strength: 0.75, radius: 0.42, threshold: 0.16 },
    dispose() { sphG.dispose(); coneG.dispose(); torG.forEach(x => x.dispose()); } };
}

function wrap(ctx, text, x, y, maxW, lh) {
  const words = String(text).split(/\s+/); let line = '', yy = y;
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = t; }
  if (line) ctx.fillText(line, x, yy);
}

registerShowScene({
  id: 'ccy', after: 'candles',
  prepare: api => loadCcy(api),
  build(inp, R) {
    const text = ccyScript(R); if (!text) return null;
    const hi = R.list[0].ccy, lo = R.list[R.list.length - 1].ccy;
    return { title: 'The eight currencies', view: 'ccy', cam: null, text,
      enter: api => { Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); },
      motion: (api, p) => { S.showP = clamp(p, 0, 1); S.showAt = Date.now(); api.st.spin = false; api.st.sel = p < 0.1 ? null : p < 0.45 ? hi : p < 0.8 ? lo : null; } };
  },
});
