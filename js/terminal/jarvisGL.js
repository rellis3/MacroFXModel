// js/terminal/jarvisGL.js: the HOLOGRAM ENGINE for Jarvis. A WebGL layer (three.js r160, vendored in js/vendor/three, loaded lazily the first time a hologram view opens) that sits UNDER the
// HUD's 2D canvas: the glowing 3D scene is drawn here with real bloom, and the view's labels, buttons and readouts are still drawn crisp on the 2D canvas above it (the HUD clears that canvas
// every frame, so the hologram shows through). Recording (SHOW -> RECORD) captures the tab, so both layers end up in the video.
//
//   glView({ id, label, env, setup(L, H, api) -> inst | Promise<inst> })  -> a view object for registerJarvisModule({ views: [...] })
//     L    = the library: { THREE, Line2, LineMaterial, LineGeometry, LineSegments2, LineSegmentsGeometry }
//     H    = the host: { canvas, renderer, W, H, calm (reduced motion), kit (shared hologram parts, below), toScreen(v3, camera) -> { x, y, z, vis }, orbit(camera, st, opts), color(css) }
//     inst = { scene, camera, update(t, dt, api, g) (called every frame before rendering), overlay?(ctx, g, api) (2D labels on the HUD canvas, after rendering),
//              bloom?: { strength, radius, threshold }, trail?: 0..1 (motion-trail persistence, 0 = off), dispose?() }
//   setup runs once per view (the instance is kept while Jarvis is open, so switching back is instant). A setup that throws, or a browser with no WebGL, leaves the view saying so in words.
//
// DESCRIPTION ONLY, like the rest of Jarvis: this file draws, it never decides anything. No data is fetched here.

const LIB_URL = new URL('../vendor/three/three.module.min.js', import.meta.url).href;
const ADDON = f => new URL(`../vendor/three/addons/${f}`, import.meta.url).href;
let LIB = null, LIB_P = null;

/** Load three.js and the addons once. Resolves to the library object; rejects if the files cannot be loaded. */
export function loadThree() {
  if (LIB) return Promise.resolve(LIB);
  LIB_P ??= (async () => {
    const [THREE, EC, RP, UB, OP, AP, L2, LM, LG, LS2, LSG] = await Promise.all([
      import(LIB_URL), import(ADDON('EffectComposer.js')), import(ADDON('RenderPass.js')), import(ADDON('UnrealBloomPass.js')), import(ADDON('OutputPass.js')), import(ADDON('AfterimagePass.js')),
      import(ADDON('Line2.js')), import(ADDON('LineMaterial.js')), import(ADDON('LineGeometry.js')), import(ADDON('LineSegments2.js')), import(ADDON('LineSegmentsGeometry.js')),
    ]);
    LIB = { THREE, EffectComposer: EC.EffectComposer, RenderPass: RP.RenderPass, UnrealBloomPass: UB.UnrealBloomPass, OutputPass: OP.OutputPass, AfterimagePass: AP.AfterimagePass,
      Line2: L2.Line2, LineMaterial: LM.LineMaterial, LineGeometry: LG.LineGeometry, LineSegments2: LS2.LineSegments2, LineSegmentsGeometry: LSG.LineSegmentsGeometry };
    return LIB;
  })();
  LIB_P.catch(() => { LIB_P = null; });
  return LIB_P;
}

// ───────────────────────── pure helpers (tested) ─────────────────────────
/** Camera position for an orbit: yaw/pitch in radians, distance d, around target [x, y, z]. Pitch is clamped so the camera never flips over the pole. */
export function orbitPos(yaw, pitch, d, target = [0, 0, 0]) {
  const p = Math.max(-1.45, Math.min(1.45, pitch));
  return [target[0] + d * Math.cos(p) * Math.sin(yaw), target[1] + d * Math.sin(p), target[2] + d * Math.cos(p) * Math.cos(yaw)];
}
/** The HUD's drag state (st.yaw, st.pitch, st.zoom; extra views start at yaw 0.35, pitch -0.45, zoom 1) mapped to an orbit: yaw passes through, pitch becomes an elevation in [lo, hi], zoom divides the distance. */
export function hudOrbit(st, { yaw0 = 0.35, pitch0 = -0.45, elev = 0.45, lo = 0.05, hi = 1.35, dist = 6 } = {}) {
  const yaw = (st?.yaw ?? yaw0) - yaw0, el = Math.max(lo, Math.min(hi, elev - ((st?.pitch ?? pitch0) - pitch0) * 0.8)), z = Math.max(0.35, Math.min(4, st?.zoom ?? 1));
  return { yaw, pitch: el, dist: dist / z };
}
/** Smoothstep 0..1. */
export const ease = p => { const x = Math.max(0, Math.min(1, p)); return x * x * (3 - 2 * x); };
/** A CSS colour string reduced to something three.js parses (#rgb, #rrggbb, rgb(), hsl(), a name); anything else (color-mix, var) falls back. */
export function cssColour(s, fb = '#4fc3ff') {
  const v = String(s ?? '').trim();
  return /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-z]+)$/i.test(v) && !/^(var|inherit|initial|unset|transparent|currentcolor)$/i.test(v) ? v : fb;
}

// ───────────────────────── the host (one per open Jarvis) ─────────────────────────
let HOST = null;
function host(api) {
  const root = api.doc.getElementById(api.ID);
  if (HOST && HOST.root === root && root?.isConnected) return HOST;
  if (HOST) { try { HOST.renderer.dispose(); HOST.canvas.remove(); } catch (e) { /* gone */ } HOST = null; }
  if (!root || !LIB) return null;
  const { THREE } = LIB, canvas = api.doc.createElement('canvas');
  canvas.className = 'jv-gl'; canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none;z-index:0';
  root.insertBefore(canvas, root.querySelector('canvas'));          // UNDER the HUD canvas: labels stay on top
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }); }
  catch (e) { canvas.remove(); return null; }
  renderer.setClearColor(0x000000, 1); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const H = { root, canvas, renderer, W: 0, H: 0, dpr: 1, calm: !!api.win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches, active: null, lastDraw: 0, kit: null };
  H.color = (css, fb) => new THREE.Color(cssColour(css, fb));
  const v = new THREE.Vector3();
  H.toScreen = (p, camera) => { v.set(p[0] ?? p.x, p[1] ?? p.y, p[2] ?? p.z).project(camera); return { x: (v.x + 1) / 2 * H.W, y: (1 - v.y) / 2 * H.H, z: v.z, vis: v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15 }; };
  H.orbit = (camera, st, opts = {}) => {
    const o = hudOrbit(st, opts), tg = opts.target ?? [0, 0, 0], p = orbitPos(o.yaw + (opts.yawAdd ?? 0), o.pitch, o.dist, tg);
    camera.position.set(p[0], p[1], p[2]); camera.lookAt(tg[0], tg[1], tg[2]); return o;
  };
  H.kit = makeKit(LIB, H);
  // a watchdog hides the layer when no hologram view drew for a moment (view switched, show moved on, Jarvis docked or closed)
  const watch = () => { if (!HOST || HOST !== H) return; if (H.active && performance.now() - H.lastDraw > 180) { canvas.style.display = 'none'; H.active = null; } api.win.requestAnimationFrame(watch); };
  api.win.requestAnimationFrame(watch);
  HOST = H; return H;
}

/** Shared hologram parts, so every view has the same look. All additive, transparent, depthWrite off unless said. */
function makeKit(L, H) {
  const { THREE } = L, kit = {};
  /** A fat glowing line through points [[x,y,z]...]; width in px; returns a Line2 (update with kit.setLine). */
  kit.line = (pts, color, width = 2, opacity = 1) => {
    const g = new L.LineGeometry(); g.setPositions(pts.flat());
    const m = new L.LineMaterial({ color: new THREE.Color(color), linewidth: width, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, worldUnits: false });
    m.resolution.set(H.W || 1280, H.H || 720); kit._mats.add(m);
    const l = new L.Line2(g, m); l.computeLineDistances(); return l;
  };
  kit.setLine = (line, pts) => { line.geometry.setPositions(pts.flat()); line.computeLineDistances(); };
  /** Many thin glowing segments in one draw call: segs = [[x0,y0,z0,x1,y1,z1], ...]. */
  kit.segments = (segs, color, opacity = 0.5) => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(segs.flat(), 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  };
  /** A projector table: concentric rings and spokes on the floor, fading outward. */
  kit.table = (radius = 3, color = '#4fc3ff', y = 0, rings = 6, spokes = 24) => {
    const grp = new THREE.Group(), segs = [];
    for (let r = 1; r <= rings; r++) { const R = radius * r / rings, n = 96; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2; segs.push([Math.cos(a) * R, y, Math.sin(a) * R, Math.cos(b) * R, y, Math.sin(b) * R]); } }
    for (let i = 0; i < spokes; i++) { const a = i / spokes * Math.PI * 2; segs.push([Math.cos(a) * radius * 0.15, y, Math.sin(a) * radius * 0.15, Math.cos(a) * radius, y, Math.sin(a) * radius]); }
    grp.add(kit.segments(segs, color, 0.12));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 96), kit.glowDisc(color)); disc.rotation.x = -Math.PI / 2; disc.position.y = y - 0.001; grp.add(disc);
    return grp;
  };
  /** A soft radial glow material for a disc (centre bright, edge clear). */
  kit.glowDisc = (color, strength = 0.22) => new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(color) }, k: { value: strength } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 c; uniform float k; varying vec2 vU; void main(){ float d = distance(vU, vec2(0.5)) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.2) * k; gl_FragColor = vec4(c * a, a); }',
  });
  /** A hologram shell: Fresnel rim glow (edges bright, faces see-through) with faint scan bands. Use on spheres, cylinders, boxes. */
  kit.holo = (color, { rim = 1.6, base = 0.06, scan = 1, opacity = 1 } = {}) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { c: { value: new THREE.Color(color) }, rim: { value: rim }, base: { value: base }, scan: { value: scan }, t: { value: 0 }, op: { value: opacity } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(normalMatrix * normal); vec4 mv = viewMatrix * w; vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 c; uniform float rim, base, scan, t, op; varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), rim); float s = scan * (0.5 + 0.5 * sin(vW.y * 60.0 - t * 4.0)) * 0.12; float a = (base + f * 0.9 + s) * op; gl_FragColor = vec4(c * a, a); }',
    });
    kit._holo.add(m); return m;
  };
  /** Particles: n points, additive, round, size in px (scaled by distance). Positions live in .geometry.attributes.position.array (Float32Array, n*3). Optional per-point colour. */
  kit.points = (n, color, size = 4, { colors = false, opacity = 1 } = {}) => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    if (colors) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    const m = new THREE.PointsMaterial({ color: new THREE.Color(color), size, sizeAttenuation: false, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: colors, map: kit.dot() });
    const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
  };
  let dotTex = null;
  kit.dot = () => { if (dotTex) return dotTex; const c = H.root.ownerDocument.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); dotTex = new THREE.CanvasTexture(c); return dotTex; };
  /** A starfield/dust backdrop: a big sphere of faint points. */
  kit.dust = (n = 1500, r = 30, color = '#88aaff') => { const p = kit.points(n, color, 1.6, { opacity: 0.55 }), a = p.geometry.attributes.position.array; for (let i = 0; i < n; i++) { const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rr = r * (0.4 + 0.6 * Math.random()), s = Math.sqrt(1 - u * u); a[i * 3] = rr * s * Math.cos(th); a[i * 3 + 1] = rr * u; a[i * 3 + 2] = rr * s * Math.sin(th); } return p; };
  /** Glow sprite (a soft billboard), for cores, flares, markers. */
  kit.flare = (color, scale = 1, opacity = 1) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: kit.dot(), color: new THREE.Color(color), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.setScalar(scale); return s; };
  kit._mats = new Set(); kit._holo = new Set();
  kit.tick = t => { for (const m of kit._holo) m.uniforms.t.value = t; };
  kit.resize = (w, h) => { for (const m of kit._mats) m.resolution.set(w, h); };
  return kit;
}

const INST = new Map();       // view id -> { inst, composer, bloom, after } | { err } | { busy: Promise }
/** Wrap a hologram view so it plugs into the HUD's view list. */
export function glView(spec) {
  const { id, label, env, setup } = spec;
  function msg(ctx, g, text) { ctx.save(); ctx.globalAlpha = g.fade; ctx.fillStyle = g.C.tx2; ctx.font = '13px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(text, g.W / 2, g.H / 2); ctx.restore(); }
  async function build(api) {
    await loadThree(); const H = host(api); if (!H) throw new Error('This browser has no WebGL, so the hologram cannot be drawn.');
    const inst = await setup(LIB, H, api); const { THREE } = LIB;
    const composer = new LIB.EffectComposer(H.renderer); composer.addPass(new LIB.RenderPass(inst.scene, inst.camera));
    const b = inst.bloom ?? {}, bloom = new LIB.UnrealBloomPass(new THREE.Vector2(H.W || 1280, H.H || 720), b.strength ?? 1.15, b.radius ?? 0.55, b.threshold ?? 0.05); composer.addPass(bloom);
    let after = null; if (inst.trail) { after = new LIB.AfterimagePass(inst.trail); composer.addPass(after); }
    composer.addPass(new LIB.OutputPass());
    return { inst, composer, bloom, after, w: 0, h: 0 };
  }
  function draw(ctx, g, api) {
    let e = INST.get(id);
    if (!e) { e = { busy: build(api).then(x => INST.set(id, x)).catch(err => INST.set(id, { err: String(err?.message ?? err) })) }; INST.set(id, e); }
    if (e.busy) return msg(ctx, g, 'Projecting the hologram...');
    if (e.err) return msg(ctx, g, e.err);
    const H = host(api); if (!H) return msg(ctx, g, 'The hologram layer is not available.');
    const dpr = Math.min(2, api.win.devicePixelRatio || 1);
    if (H.W !== g.W || H.H !== g.H || H.dpr !== dpr) { H.W = g.W; H.H = g.H; H.dpr = dpr; H.renderer.setPixelRatio(dpr); H.renderer.setSize(g.W, g.H, false); H.kit.resize(g.W * dpr, g.H * dpr); }
    if (e.w !== g.W || e.h !== g.H) { e.w = g.W; e.h = g.H; e.composer.setPixelRatio(dpr); e.composer.setSize(g.W, g.H); if (e.inst.camera.isPerspectiveCamera) { e.inst.camera.aspect = g.W / Math.max(1, g.H); e.inst.camera.updateProjectionMatrix(); } }
    H.active = id; H.lastDraw = performance.now(); if (H.canvas.style.display !== 'block') H.canvas.style.display = 'block';
    H.canvas.style.opacity = String(g.fade);
    try { H.kit.tick(g.t); e.inst.update?.(g.t, Math.min(0.05, g.dt || 0.016), api, g); e.composer.render(); } catch (err) { INST.set(id, { err: `The hologram stopped: ${err?.message ?? err}` }); return; }
    try { e.inst.overlay?.(ctx, g, api, H); } catch (err) { /* labels must never stop the frame */ }
  }
  return { id, label, env: { chrome: 'clean', scan: true, ...(env ?? {}) }, draw, onEnter: spec.onEnter, onLeave: spec.onLeave, gl: true };
}

/** For a SHOW scene's motion(): the live instance of a hologram view (or null), so a scene can steer its camera. */
export const glInstance = id => INST.get(id)?.inst ?? null;
/** Close: free every GPU resource (called when Jarvis closes). */
export function glDisposeAll() {
  for (const e of INST.values()) { try { e.inst?.dispose?.(); e.composer?.dispose?.(); } catch (er) { /* gone */ } }
  INST.clear(); if (HOST) { try { HOST.renderer.dispose(); HOST.canvas.remove(); } catch (e) { /* gone */ } HOST = null; }
}
