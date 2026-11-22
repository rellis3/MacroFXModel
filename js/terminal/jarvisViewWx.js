// js/terminal/jarvisViewWx.js: MARKET WEATHER, a WebGL hologram (jarvisGL.js). A forecast-broadcast board turned into two rows of floating glass panels on a gentle curve: one panel per asset class,
// one per currency, each with its own little holographic weather scene driven by that group's own measured move today (jarvisWxCore.js): a glowing sun with heat shimmer for a group that is rising,
// glowing cloud and particle rain for one that is falling, a storm with lightning flashes (bloomed) for one falling hard, racing wind streaks for big moves in both directions, a pale clear sky when
// little is happening.
// ENCODING (also drawn on screen):
//   weather       = the group's AVERAGE move so far today against each member's usual move (x), and the average SIZE of the moves (jarvisWxCore.condition)
//   big number    = that average, with ▲ / ▼ and green / red (grey under 0.15x)
//   member dots   = under every panel, one dot per member on a fixed -3x..+3x line (0 marked; a dot at the end is capped at 3x), coloured by its own direction; a gold tick marks the
//                   group's average. So a group with one market up 3x and one down 3x shows both dots, not just a quiet sky.
// Click a panel for a card listing its members and their moves. Drag/zoom orbit the camera. SHOW: the camera starts close on the stormiest panel, sweeps along to the warmest, then pulls back
// to the whole board. Reduced motion freezes the weather (no flashes). Data: the CANDLES board feed (api.candles(): /api/vol-forecast/live + /api/bias-engine).
// DESCRIPTION OF TODAY SO FAR, never an outlook: the key says so.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene, QUICK_IDS } from './showCore.js';
import { glView, orbitPos, ease } from './jarvisGL.js';
import { groupWeather, ccyWeather, wxScript, WORD } from './jarvisWxCore.js';

const PW = 1.16, PH = 1.0, GAP = 0.3, STRIP = 0.2, ROWGAP = 0.62, RC = 40, NRAIN = 46, NCLOUD = 6, NWIND = 9, WSEG = 6, MAXM = 32, VCAP = 3, MAXP = 15;
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const sg = (v, d = 1) => `${v > 0.15 ? '▲ +' : v < -0.15 ? '▼ −' : ''}${Math.abs(v).toFixed(d)}×`;
const tone = (C, v) => (v > 0.15 ? C.up : v < -0.15 ? C.dn : C.tx2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const S = { cd: null, sel: null, showP: -1, showAt: 0, bg: 'black', spin: null, drift: 0, cells: [], lay: '', box: null, ts: Array(3).fill(0) };
let cache = { at: 0, wx: null };
const compute = cd => { if (!cd?.ok) return null; if (cache.at !== cd.at) cache = { at: cd.at, wx: { groups: groupWeather(cd.rows), ccys: ccyWeather(cd.rows) } }; return cache.wx; };
const feed = api => api.st.cd ?? S.cd;
const showing = () => S.showP >= 0 && Date.now() - S.showAt < 1500;

registerJarvisModule({
  id: 'wx', label: 'WEATHER',
  views: [glView({
    id: 'wx', label: 'WEATHER', env: { accent: 'blue2', chrome: 'clean', scan: false },
    onEnter: api => {
      S.showP = -1; S.sel = null; S.spin = api.st.spin; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false });
      try { S.bg = api.win.getComputedStyle(api.doc.documentElement).getPropertyValue('--bg1').trim() || 'black'; } catch (e) { S.bg = 'black'; }
      Promise.resolve(api.candles?.()).then(x => { if (x) S.cd = x; }).catch(() => null);
    },
    onLeave: api => { S.showP = -1; if (S.spin != null) api.st.spin = S.spin; S.spin = null; },
    setup: (L, H, api) => build(L, H, api),
  })],
  render(pane, api) { pane.innerHTML = '<h3>MARKET WEATHER</h3><p>One little weather scene per asset class and per currency, from that group\'s own move so far today. Sun and heat for rising, cloud and rain for falling, a storm for falling hard, wind for big moves both ways. The dots under each scene are its members, so a split group shows its split. A description of today, not an outlook.</p><div class="jv-row"><button type="button" data-w="go">SHOW THE WEATHER</button></div>'; pane.querySelector('[data-w="go"]').onclick = () => api.setView('wx'); },
});

function build(L, H, api) {
  const { THREE } = L, kit = H.kit, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 200);
  const C0 = api.colours?.() ?? {}, blue0 = C0.blue ?? 'skyblue';
  scene.fog = new THREE.FogExp2(new THREE.Color('black'), 0.025);
  scene.add(kit.dust(1200, 34, C0.tx2 ?? 'gray'));
  const floor = kit.table(7, blue0, -3.2, 8, 48); scene.add(floor);
  // the glass: a vertical sky gradient (sky colour at the top, clear at the foot) plus a flash term for lightning
  const glassG = new THREE.PlaneGeometry(PW, PH), skyMat = () => new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(blue0) }, k: { value: 0.22 }, fl: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 c; uniform float k, fl; varying vec2 vU; void main(){ float e = min(min(vU.x, 1.0 - vU.x), min(vU.y, 1.0 - vU.y)); float a = k * pow(vU.y, 1.4) + 0.03 + fl * 0.55 + 0.08 * (1.0 - smoothstep(0.0, 0.04, e)); gl_FragColor = vec4(c * a + vec3(fl * 0.5), a); }',
  });
  const rr = (w, h, r) => { const p = [], q = (cx, cy, a0) => { for (let k = 0; k <= 6; k++) { const a = a0 + k / 6 * Math.PI / 2; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0]); } }; q(w / 2 - r, h / 2 - r, 0); q(-w / 2 + r, h / 2 - r, Math.PI / 2); q(-w / 2 + r, -h / 2 + r, Math.PI); q(w / 2 - r, -h / 2 + r, Math.PI * 1.5); p.push(p[0]); return p; };
  const frameP = rr(PW, PH, 0.08), sphG = new THREE.SphereGeometry(1, 24, 16);
  const basic = (op, col = 'white') => new THREE.MeshBasicMaterial({ color: new THREE.Color(col), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending });

  const panels = []; for (let n = 0; n < MAXP; n++) {
    const g = new THREE.Group(); scene.add(g);
    const glass = new THREE.Mesh(glassG, skyMat()); g.add(glass);
    const frame = kit.line(frameP, blue0, 1.4, 0.7); g.add(frame);
    // sun
    const sun = new THREE.Group(); sun.position.set(PW * 0.22, PH * 0.17, -0.1); g.add(sun);
    const sunF = kit.flare(C0.gold ?? 'gold', 1, 0.8), sunB = new THREE.Mesh(sphG, kit.holo(C0.gold ?? 'gold', { rim: 1.2, base: 0.25, scan: 0.4 })), sunC = new THREE.Mesh(sphG, basic(0.9));
    const rays = []; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; rays.push([Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0, Math.cos(a), Math.sin(a), 0]); }
    const rayL = kit.segments(rays, C0.gold ?? 'gold', 0.7); sun.add(sunF, sunB, sunC, rayL);
    // clouds: four soft glows each
    const clouds = []; for (let k = 0; k < NCLOUD; k++) { const cg = new THREE.Group(); g.add(cg); const puffs = []; for (let b = 0; b < 4; b++) { const s = kit.flare(C0.tx2 ?? 'gray', 1, 0.5); s.position.set((b - 1.5) * 0.075, (b % 2) * 0.025, b * 0.01); cg.add(s); puffs.push(s); } clouds.push({ cg, puffs }); }
    // rain, lightning, wind, heat shimmer
    const rain = kit.points(NRAIN, blue0, 3.2, { opacity: 0.95 }); g.add(rain);
    const boltP = Array.from({ length: 7 }, () => Array(3).fill(0)), bolt = kit.line(boltP, C0.tx ?? 'white', 2.6, 1), boltH = kit.line(boltP, blue0, 10, 0.4); g.add(boltH, bolt);
    const windSegs = Array.from({ length: NWIND * WSEG }, () => Array(6).fill(0)), wind = kit.segments(windSegs, blue0, 1); g.add(wind);
    const shim = [0, 1].map(() => { const p = Array.from({ length: 24 }, () => Array(3).fill(0)), l = kit.line(p, C0.gold ?? 'gold', 1.2, 0.5); g.add(l); return { p, l }; });
    // the member strip: an axis -3x..+3x with a zero tick, one dot per member, and a gold average tick
    const y0 = -PH / 2 - STRIP * 0.55, xs = v => clamp(v, -VCAP, VCAP) / VCAP * (PW / 2 - 0.06);
    const axis = kit.segments([[xs(-VCAP), y0, 0, xs(VCAP), y0, 0], [0, y0 - 0.04, 0, 0, y0 + 0.04, 0], [xs(-VCAP), y0 - 0.025, 0, xs(-VCAP), y0 + 0.025, 0], [xs(VCAP), y0 - 0.025, 0, xs(VCAP), y0 + 0.025, 0]], C0.tx2 ?? 'gray', 0.55); g.add(axis);
    const dots = kit.points(MAXM, 'white', 9, { colors: true }); g.add(dots);
    const avgT = kit.line([[0, y0 - 0.06, 0.01], [0, y0 + 0.06, 0.01]], C0.gold ?? 'gold', 2.4, 1); g.add(avgT);
    panels.push({ g, glass, frame, sun, sunF, sunB, sunC, rayL, clouds, rain, boltP, bolt, boltH, wind, windSegs, shim, dots, avgT, y0, xs, cell: null, seed: n * 17.3 + 1, flash: 0, boltKey: -1 });
  }

  const cc = { k: null };
  const sync = C => { const k = `${C.up}|${C.dn}|${C.gold}|${C.blue}|${C.tx}|${C.tx2}`; if (k === cc.k) return; cc.k = k; for (const n of ['up', 'dn', 'gold', 'blue', 'tx', 'tx2']) cc[n] = H.color(C[n]); };
  const skyOf = cond => (cond === 'storm' ? cc.dn : cond === 'hot' || cond === 'warm' ? cc.gold : cond === 'cloud' ? cc.tx2 : cc.blue);

  /** Panel slots: rows of `cols` on a curve of radius RC (centre of the curve toward the camera), asset classes first. Returns the bounding box. */
  function layout(cells, compact, nG) {
    const key = `${compact}|${cells.length}|${nG}`; if (key === S.lay) return; S.lay = key;
    const rows = []; const push = (list, cols) => { for (let i = 0; i < list.length; i += cols) rows.push(list.slice(i, i + cols)); };
    push(cells.slice(0, nG).map((c, i) => i), compact ? 3 : 8); push(cells.slice(nG).map((c, i) => nG + i), compact ? 4 : 8);
    const step = PW + GAP, rowH = PH + STRIP + ROWGAP; let minX = 0, maxX = 0;
    rows.forEach((row, ri) => row.forEach((idx, k) => {
      const x = (k - (row.length - 1) / 2) * step, th = x / RC, p = panels[idx];
      p.g.position.set(RC * Math.sin(th), -ri * rowH, -(RC - RC * Math.cos(th))); p.g.rotation.set(0, -th, 0); minX = Math.min(minX, x - PW / 2); maxX = Math.max(maxX, x + PW / 2);
    }));
    S.box = { w: maxX - minX, top: PH / 2 + 0.25, bot: -(rows.length - 1) * rowH - PH / 2 - STRIP - 0.1, rows: rows.length };
    floor.position.y = S.box.bot - 0.7 + 3.2;
  }

  const tmpV = new THREE.Vector3();
  function update(t, dt, api_, g) {
    sync(g.C);
    const cd = feed(api_), wx = compute(cd), calm = H.calm, tt = calm ? 3.3 : t;
    if (!cd && !S.asked) { S.asked = true; Promise.resolve(api_.candles?.()).then(x => { if (x) S.cd = x; }).catch(() => null); }
    S.drift += calm ? 0 : dt;
    const cells = wx ? [...wx.groups, ...wx.ccys].slice(0, MAXP) : []; S.cells = cells;
    const nG = wx ? Math.min(wx.groups.length, MAXP) : 0;
    if (cells.length) layout(cells, g.compact, nG);
    const sel = S.sel && cells.some(c => c.id === S.sel) ? S.sel : null;
    panels.forEach((p, n) => {
      const cell = cells[n]; p.cell = cell ?? null; p.g.visible = !!cell; if (!cell) return;
      const cond = cell.cond, sky = skyOf(cond), seed = p.seed, dim = sel && sel !== cell.id ? 0.3 : 1, hot = sel === cell.id;
      const bob = calm ? 0 : Math.sin(t * 0.8 + n) * 0.025; p.glass.position.y = bob; p.frame.position.y = bob;
      // lightning flash state
      let fl = 0; if (cond === 'storm' && !calm) { const ph = (t * 0.5 + hash(seed) * 6) % 3.2; if (ph < 0.25) fl = 1 - ph / 0.25; const key = Math.floor(t * 0.5 + hash(seed) * 6 - ph + 0.0001); if (key !== p.boltKey) { p.boltKey = key; let bx = (hash(key + seed) - 0.5) * PW * 0.4, by = PH * 0.3; for (let k = 0; k < 7; k++) { p.boltP[k][0] = bx; p.boltP[k][1] = by; p.boltP[k][2] = 0.06; bx += (hash(seed + k * 3.1 + key) - 0.5) * PW * 0.2; by -= PH * 0.1; } kit.setLine(p.bolt, p.boltP); kit.setLine(p.boltH, p.boltP); } }
      p.glass.material.uniforms.c.value.copy(sky); p.glass.material.uniforms.k.value = (cond === 'storm' ? 0.42 : cond === 'clear' ? 0.16 : 0.3) * dim; p.glass.material.uniforms.fl.value = fl * dim;
      p.frame.material.color.copy(hot ? cc.tx : sky); p.frame.material.opacity = (cond === 'storm' ? 0.8 : 0.5) * (sel ? (hot ? 1.2 : 0.4) : 1); p.frame.material.linewidth = hot ? 2.6 : cond === 'storm' ? 2 : 1.4;
      // sun
      const sunny = cond === 'clear' || cond === 'warm' || cond === 'hot', sr = cond === 'hot' ? 0.3 : cond === 'warm' ? 0.22 : 0.15;
      p.sun.visible = sunny; if (sunny) {
        const pulse = 1 + (calm ? 0 : 0.05 * Math.sin(t * 1.5 + seed)), c = cond === 'clear' ? cc.blue : cc.gold;
        p.sun.position.y = PH * 0.17 + bob; p.sunF.scale.setScalar(sr * 3.4 * pulse); p.sunF.material.color.copy(c); p.sunF.material.opacity = (cond === 'hot' ? 0.9 : 0.6) * dim;
        p.sunB.scale.setScalar(sr * 0.5); p.sunB.material.uniforms.c.value.copy(c); p.sunB.material.uniforms.op.value = dim; p.sunC.scale.setScalar(sr * 0.3); p.sunC.material.color.copy(cond === 'clear' ? cc.tx : cc.gold); p.sunC.material.opacity = 0.9 * dim;
        p.rayL.visible = cond === 'hot'; p.rayL.scale.setScalar(sr * 0.85); p.rayL.rotation.z = calm ? 0 : t * 0.25; p.rayL.material.opacity = 0.7 * dim;
      }
      p.shim.forEach((s, k) => { const on = (cond === 'hot' || cond === 'warm'); s.l.visible = on; if (!on) return; for (let i = 0; i < 24; i++) { const x = -PW / 2 + 0.06 + i / 23 * (PW - 0.12); s.p[i][0] = x; s.p[i][1] = -PH * (0.3 + 0.07 * k) + Math.sin(x * 14 + tt * 2.2 + k) * 0.018 + bob; s.p[i][2] = 0.02; } kit.setLine(s.l, s.p); s.l.material.opacity = 0.4 * dim; });
      // clouds: more and darker as it worsens; drift across and fade at the glass edges
      const nc = cond === 'cloud' ? 3 : cond === 'rain' ? 4 : cond === 'storm' ? 6 : cond === 'wind' ? 3 : cond === 'warm' ? 1 : 0, cCol = cond === 'storm' ? cc.dn : cc.tx2;
      p.clouds.forEach((cl, k) => {
        const on = k < nc; cl.cg.visible = on; if (!on) return;
        const sp = (cond === 'storm' ? 0.05 : cond === 'wind' ? 0.16 : 0.03) * (0.6 + hash(seed + k)), span = PW + 0.3, x = ((tt * sp + hash(seed + k * 3) * span) % span) - span / 2;
        const edge = clamp((PW / 2 - Math.abs(x)) / 0.18, 0, 1), rw = 0.9 + 0.5 * hash(seed + k * 7);
        cl.cg.position.set(x, PH * (0.32 - 0.16 * hash(seed + k * 5)) + bob, 0.04 + 0.04 * (k % 3)); cl.cg.scale.setScalar(rw);
        cl.puffs.forEach(s => { s.scale.setScalar(0.24); s.material.color.copy(cCol); s.material.opacity = (cond === 'storm' ? 0.5 : 0.28) * edge * dim; });
      });
      // rain: particles falling at a slant, denser in a storm
      const nr = cond === 'storm' ? NRAIN : cond === 'rain' ? 26 : 0, ra = p.rain.geometry.attributes.position.array; p.rain.visible = nr > 0;
      if (nr) { for (let k = 0; k < NRAIN; k++) { const o = k * 3; if (k >= nr) { ra[o + 1] = -99; continue; } const sp = 0.55 + 0.6 * hash(seed + k * 2), f = ((tt * sp + hash(seed + k * 13)) % 1); ra[o] = (hash(seed + k * 11) - 0.5) * (PW - 0.1) - f * 0.06; ra[o + 1] = PH * 0.25 - f * PH * 0.7 + bob; ra[o + 2] = 0.03 + 0.12 * hash(seed + k * 17); } p.rain.geometry.attributes.position.needsUpdate = true; p.rain.material.color.copy(cc.blue); p.rain.material.opacity = 0.95 * dim; }
      // lightning bolt: bright on the flash; with reduced motion a faint fixed bolt marks the storm
      const showBolt = cond === 'storm' && (fl > 0 || calm); p.bolt.visible = p.boltH.visible = showBolt;
      if (showBolt) { if (calm && p.boltKey < 0) { p.boltKey = 0; let bx = 0, by = PH * 0.3; for (let k = 0; k < 7; k++) { p.boltP[k][0] = bx; p.boltP[k][1] = by; p.boltP[k][2] = 0.06; bx += (hash(seed + k) - 0.5) * PW * 0.2; by -= PH * 0.1; } kit.setLine(p.bolt, p.boltP); kit.setLine(p.boltH, p.boltP); } p.bolt.material.opacity = (calm ? 0.5 : fl) * dim; p.boltH.material.opacity = (calm ? 0.15 : 0.5 * fl) * dim; p.boltH.material.color.copy(cc.blue); p.bolt.material.color.copy(cc.tx); }
      // wind: curved streaks racing across
      p.wind.visible = cond === 'wind'; if (cond === 'wind') {
        const wa = p.wind.geometry.attributes.position.array;
        for (let k = 0; k < NWIND; k++) { const sp = 0.5 + 0.5 * hash(seed + k), len = PW * (0.18 + 0.18 * hash(seed + k * 9)), span = PW + len, x0 = ((tt * sp + hash(seed + k * 3) * span) % span) - PW / 2 - len, y = -PH * 0.3 + PH * 0.6 * hash(seed + k * 5) + bob;
          for (let s = 0; s < WSEG; s++) { const o = (k * WSEG + s) * 6, u0 = s / WSEG, u1 = (s + 1) / WSEG, xa = clamp(x0 + u0 * len, -PW / 2 + 0.03, PW / 2 - 0.03), xb = clamp(x0 + u1 * len, -PW / 2 + 0.03, PW / 2 - 0.03); wa[o] = xa; wa[o + 1] = y + Math.sin(u0 * Math.PI) * 0.03; wa[o + 2] = 0.05; wa[o + 3] = xb; wa[o + 4] = y + Math.sin(u1 * Math.PI) * 0.03; wa[o + 5] = 0.05; } }
        p.wind.geometry.attributes.position.needsUpdate = true; p.wind.material.color.copy(cc.blue); p.wind.material.opacity = dim;
      }
      // member dots: stacked upward where they would overlap
      const da = p.dots.geometry.attributes.position.array, dc = p.dots.geometry.attributes.color.array, ms = cell.members ?? []; let lastX = -9, stack = 0;
      for (let k = 0; k < MAXM; k++) {
        const o = k * 3, m = ms[k]; if (!m) { da[o + 1] = -99; continue; }
        const x = p.xs(m.v); stack = x - lastX < 0.035 ? stack + 1 : 0; lastX = x;
        da[o] = x; da[o + 1] = p.y0 + 0.03 + stack * 0.035; da[o + 2] = 0.01; const c = m.v > 0.15 ? cc.up : m.v < -0.15 ? cc.dn : cc.tx2; dc[o] = c.r; dc[o + 1] = c.g; dc[o + 2] = c.b;
      }
      p.dots.geometry.attributes.position.needsUpdate = true; p.dots.geometry.attributes.color.needsUpdate = true; p.dots.material.opacity = dim;
      p.avgT.position.x = p.xs(cell.avg); p.avgT.material.color.copy(cc.gold); p.avgT.material.opacity = dim;
    });
    // camera: fit the board into the space between the HUD's header and key; the SHOW sweeps it
    const aspect = g.W / Math.max(1, g.H), tanH = Math.tan(camera.fov * Math.PI / 360), box = S.box ?? { w: 9, top: 0.8, bot: -2.5 };
    const top = g.compact ? 150 : 205, bot = g.compact ? 96 : 84, fy = (g.H - top - bot) / g.H, hb = box.top - box.bot, d = Math.max(hb / (2 * tanH * fy), (box.w + 0.4) / (2 * tanH * aspect * 0.96)) * 1.04;
    const visH = 2 * d * tanH, cyWorld = (box.top + box.bot) / 2, offPx = (top - bot) / 2, tg = [0, cyWorld + offPx / g.H * visH, -0.4];
    if (showing() && cells.length) {
      const pr = S.showP, worst = cells.slice(0, nG).reduce((a, c, i) => (c.avg < cells[a].avg ? i : a), 0), best = cells.slice(0, nG).reduce((a, c, i) => (c.avg > cells[a].avg ? i : a), 0);
      const at = i => { panels[i].g.getWorldPosition(tmpV); return [tmpV.x, tmpV.y, tmpV.z]; };
      const pw = at(worst), pb = at(best), seg = pr < 0.38 ? 0 : pr < 0.7 ? 1 : 2, u = ease(seg === 0 ? pr / 0.38 : seg === 1 ? (pr - 0.38) / 0.32 : (pr - 0.7) / 0.3);
      const close = (q, side) => [q[0] + side * 1.2, q[1] + 0.05, q[2] + 3.8];
      const A = seg === 0 ? close(pw, -1) : seg === 1 ? close(pw, -1) : close(pb, 1), B = seg === 0 ? close(pw, 0.6) : seg === 1 ? close(pb, 1) : orbitPos(0.12, 0.08, d, tg);
      const LA = seg === 2 ? [pb[0], pb[1], pb[2]] : seg === 1 ? pw : pw, LB = seg === 0 ? pw : seg === 1 ? pb : tg;
      const lp = [0, 1, 2].map(j => A[j] + (B[j] - A[j]) * u), ll = [0, 1, 2].map(j => LA[j] + (LB[j] - LA[j]) * u);
      camera.position.set(lp[0], lp[1], lp[2]); camera.lookAt(ll[0], ll[1], ll[2]);
    } else H.orbit(camera, api_.st, { dist: d, target: tg, elev: 0.06, lo: -0.4, hi: 0.9, yawAdd: calm ? 0 : Math.sin(S.drift * 0.15) * 0.06 });
  }

  function overlay(ctx, g, api_) {
    const { W, H: Hh, C, fade } = g, cp = g.compact, cd = feed(api_), wx = compute(cd);
    ctx.save(); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    if (!wx || !S.cells.length) { const m = cd ? 'The market feed is not available right now.' : 'Reading the markets...'; ctx.globalAlpha = fade; ctx.fillStyle = C.tx2; ctx.font = '13px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(m, W / 2, Hh / 2); ctx.restore(); return; }
    handleSel(api_);
    const nG = wx.groups.length, sel = S.sel;
    // header
    const hx = cp ? 12 : 22, hy = cp ? 116 : 166;
    ctx.globalAlpha = fade; ctx.fillStyle = C.blue; ctx.font = `600 ${cp ? 12 : 14}px ui-monospace,monospace`; ctx.fillText(cd?.label ? `MARKET WEATHER · ${cd.label}` : 'MARKET WEATHER · so far today', hx, hy);
    ctx.globalAlpha = fade * 0.85; ctx.fillStyle = C.tx2; ctx.font = `${cp ? 10 : 11}px ui-monospace,monospace`;
    ctx.fillText(cp ? 'avg move vs each market\'s usual (×) · tap a panel' : 'each panel = a group\'s average move today vs its members\' usual move (×) · dots = members', hx, hy + (cp ? 14 : 17));
    // per-panel text, projected from the panel's corners so it rides with the glass
    let rowLabelled = { g: false, c: false };
    S.cells.forEach((cell, n) => {
      const p = panels[n]; p.g.updateMatrixWorld();
      const tl = proj(p, -PW / 2, PH / 2), br = proj(p, PW / 2, -PH / 2), st = proj(p, PW / 2, p.y0); if (!tl.vis || !br.vis) return;
      const w = br.x - tl.x, h = br.y - tl.y; if (w < 30) return;
      const dim = sel && sel !== cell.id ? 0.4 : 1, small = w < 110, f1 = small ? 9 : w < 150 ? 10 : 11, f2 = Math.round(clamp(w * 0.15, 13, 24));
      g.hit('wx:' + cell.id, tl.x + w / 2, tl.y + h / 2);
      const isG = n < nG, rk = isG ? 'g' : 'c';
      if (!rowLabelled[rk]) { rowLabelled[rk] = true; ctx.globalAlpha = fade * 0.75; ctx.fillStyle = C.tx2; ctx.font = `${cp ? 9 : 10}px ui-monospace,monospace`; ctx.fillText(isG ? 'ASSET CLASSES' : 'CURRENCIES', tl.x, tl.y - 7); }
      ctx.globalAlpha = fade * dim; ctx.fillStyle = C.tx; ctx.font = `600 ${f1}px ui-monospace,monospace`;
      const name = small && cell.code ? cell.code : cell.label.toUpperCase(); ctx.fillText(name, tl.x + 7, tl.y + f1 + 6);
      if (cell.code && !small) { const nw = ctx.measureText(name).width; ctx.globalAlpha = fade * dim * 0.6; ctx.font = `${f1 - 1}px ui-monospace,monospace`; ctx.fillText(cell.code, tl.x + 12 + nw, tl.y + f1 + 6); }
      ctx.globalAlpha = fade * dim; ctx.font = `600 ${f2}px ui-monospace,monospace`; ctx.fillStyle = tone(C, cell.avg);
      const txt = sg(cell.avg); ctx.globalAlpha = fade * dim * 0.55; ctx.fillStyle = S.bg; const tw = ctx.measureText(txt).width; ctx.fillRect(tl.x + 4, br.y - f2 - (small ? 18 : 24), tw + 6, f2 + 4);
      ctx.globalAlpha = fade * dim; ctx.fillStyle = tone(C, cell.avg); ctx.fillText(txt, tl.x + 7, br.y - (small ? 18 : 24));
      ctx.fillStyle = C.tx; ctx.font = `${f1 + 1}px ui-monospace,monospace`; ctx.fillText(WORD[cell.cond], tl.x + 7, br.y - 7);
      if (cell.top && w >= 150) { ctx.textAlign = 'right'; ctx.fillStyle = C.tx2; ctx.font = `${f1 - 1}px ui-monospace,monospace`; ctx.fillText(`${cell.top.name} ${sg(cell.top.ratio)}`, br.x - 6, br.y - 7); ctx.textAlign = 'left'; }
      // the strip's spread, in words, at its right end
      if (!small) { ctx.globalAlpha = fade * dim * 0.75; ctx.fillStyle = C.tx2; ctx.font = '9px ui-monospace,monospace'; ctx.textAlign = 'right'; ctx.fillText(`${cell.n} · ${cell.lo.toFixed(1)}..${cell.hi >= 0 ? '+' : ''}${cell.hi.toFixed(1)}`, st.x, st.y + 13); ctx.textAlign = 'left'; }
    });
    card(ctx, g); keyLine(ctx, g);
    ctx.restore();
  }
  const pv = new THREE.Vector3();
  function proj(p, x, y) { pv.set(x, y, 0); p.g.localToWorld(pv); return H.toScreen(pv, camera); }

  function handleSel(api_) {
    const s = api_.st.sel; if (typeof s !== 'string' || !s.startsWith('wx:')) return;
    const id = s.slice(3); S.sel = S.sel === id ? null : id; api_.st.sel = null; api_.blip?.(760, 0.05);
  }

  function card(ctx, g) {
    const cell = S.sel && S.cells.find(c => c.id === S.sel); if (!cell) return;
    const { W, C, fade } = g, cp = g.compact, bw = cp ? W - 24 : 600, x = cp ? 12 : W - bw - 22, y = cp ? 140 : 160, lh = 14, f = cp ? 10 : 11;
    const ms = [...cell.members].sort((a, b) => b.v - a.v), per = cp ? 2 : 4, rows = Math.min(cp ? 4 : 5, Math.ceil(ms.length / per)), bh = 34 + rows * lh;
    ctx.globalAlpha = fade * 0.86; ctx.fillStyle = S.bg; ctx.fillRect(x, y - 14, bw, bh); ctx.globalAlpha = fade * 0.9; ctx.strokeStyle = C.blue; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y - 13.5, bw - 1, bh - 1);
    ctx.textAlign = 'left'; ctx.globalAlpha = fade; ctx.fillStyle = C.blue; ctx.font = `600 ${f + 1}px ui-monospace,monospace`; ctx.fillText(`${cell.label} · ${WORD[cell.cond]} · avg ${sg(cell.avg, 2)}`, x + 8, y + 2);
    ctx.textAlign = 'right'; ctx.fillStyle = C.tx2; ctx.font = `${f}px ui-monospace,monospace`; ctx.fillText('close ×', x + bw - 8, y + 2); g.hit('wx:' + cell.id, x + bw - 28, y - 2); ctx.textAlign = 'left';
    const cw = (bw - 16) / per;
    const room = ms.length > rows * per ? rows * per - 1 : ms.length;
    for (let i = 0; i < room; i++) { const m = ms[i], cx = x + 8 + (i % per) * cw, cy = y + 20 + Math.floor(i / per) * lh; ctx.fillStyle = tone(C, m.v); ctx.fillText(`${m.name} ${sg(m.v)}`, cx, cy); }
    if (room < ms.length) { ctx.fillStyle = C.tx2; ctx.fillText(`+${ms.length - room} more`, x + 8 + (room % per) * cw, y + 20 + Math.floor(room / per) * lh); }
  }

  function keyLine(ctx, g) {
    const { H: Hh, C, fade } = g, cp = g.compact; ctx.textAlign = 'left'; ctx.font = `${cp ? 10 : 11}px ui-monospace,monospace`;
    const y = Hh - (cp ? 70 : 60);
    ctx.globalAlpha = fade * 0.62; ctx.fillStyle = S.bg; ctx.fillRect(cp ? 6 : 16, y - (cp ? 40 : 30), g.W - (cp ? 12 : 32), cp ? 56 : 38);
    ctx.globalAlpha = fade * 0.95; ctx.fillStyle = C.gold;
    if (cp) { ctx.fillText('sun = rising · rain = falling · storm = falling hard', 12, y - 28); ctx.fillText('wind = big moves both ways · clear = quiet', 12, y - 14); ctx.fillStyle = C.tx2; ctx.fillText('dots = members (−3×..+3×) · today so far, not a forecast', 12, y); }
    else {
      ctx.fillText('sun and heat = rising · cloud and rain = falling · storm = falling hard · wind = big moves both ways · clear = quiet · today so far: not an outlook, not a forecast', 22, y);
      ctx.fillStyle = C.tx2; ctx.globalAlpha = fade * 0.8; ctx.fillText('dots under a panel = each member\'s own move on a −3×..+3× line (ends capped), gold tick = the average · the small name is the biggest mover · click a panel for its members', 22, y - 16);
    }
  }

  return { scene, camera, update, overlay, bloom: { strength: 0.7, radius: 0.4, threshold: 0.18 }, dispose() { glassG.dispose(); sphG.dispose(); } };
}

QUICK_IDS.add('wx');
registerShowScene({
  id: 'wx', after: 'candles',
  prepare: api => api.candles(),
  build: (inp, data) => {
    if (!data?.ok || !data.rows?.length) return null; const wx = compute(data), text = wxScript(wx?.groups, wx?.ccys); if (!text) return null;
    return { title: 'Market weather', view: 'wx', text,
      enter: api => { S.cd = data; S.sel = null; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); },
      motion: (api, p) => { S.showP = clamp(p, 0, 1); S.showAt = Date.now(); } };
  },
});
