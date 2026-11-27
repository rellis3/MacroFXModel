// js/terminal/jarvisViewShockwave.js: Jarvis's RELEASE SHOCKWAVE hologram (WebGL, js/terminal/jarvisGL.js). How markets have reacted, minute by minute, to every past release of one kind
// (payrolls, CPI, the Fed, the ECB, the BoE, the BoJ, the Treasury refunding, UK budgets), stacked in depth like the pages of a book, with the typical path floating in front.
//
// What it shows (STACK, the default): pick a release FAMILY and a MARKET with the canvas buttons. Every past release of that family is one glowing path line; lines stand one behind the other
// by date (oldest far, newest near, spaced by real time so gaps in the record show). A bright vertical "release instant" plane stands at minute 0 and a half-ring shockwave radiates from it
// forward in time. In front of the stack, the median path across the family is a thick gold line and the 25-75% range of the paths a translucent gold ribbon. A sweep line travels from the
// release minute to +4 hours, lighting each release's position as it passes. The three biggest 30-minute reactions and the newest release are labelled; click a label to pick that release out.
// ALL MARKETS: the newest release of the family, its markets fanned radially around the release instant: each market is a spoke whose path is drawn outward in time (radius = minutes after the
// release), height = its move against its usual, and a flare at the 30-minute point whose AREA is that 30-minute size. The biggest reactions are labelled.
//
// ENCODING
//   x (stack) / radius (fan)  minutes from the release, -30 to +240 (fan: 0 to +240), linear
//   z (stack)                 release date, oldest far, newest near (linear in time)
//   height                    the move since the release minute DIVIDED BY the market's usual 30-minute reaction to this family (median |30-min move| over the family's releases), linear;
//                             1 = an ordinary reaction. Capped at +-4 usual moves: a capped line is clamped there and the readout says how many were capped. The native size (%, bp, points) is
//                             always given in words beside it. Chosen so a quiet market and a loud one, or a % market and a bp market, read on one scale.
//   colour                    the direction of that release's 30-minute move (up token = up, dn token = down) AND its side of the zero line (above / below) as the second cue; brightness = recency
//   gold line / ribbon        median path across the family / its 25-75% range at each minute (SIZE toggle: the same of the absolute move, so the gold line is the typical size envelope)
//   flare (fan)               area proportional to |30-min move| / usual (capped at 4, marked)
// DATA  /api/release-layer1 (rows: family, name, t, id, M[market].m30 ...; ahead) and /api/release-layer1/paths?id= ({ paths: { market: { step, v[271] } } }, -30..+240 min) (server.js, Release
//       Reaction layer 1; 150 releases 2024-04 to 2026-10 committed under analysis/output/release_layer1). Releases after the committed build exist only when the laptop pushes the live record
//       to KV release_layer1_v1 (scripts/release_layer1/live_push.py); without that push the view shows the committed history and says so. /api/event-day for "next: <family> at HH:MM".
//       Maths in js/terminal/shockwaveCore.js. 10-minute cache; paths are fetched once per release.
// DESCRIPTION ONLY: history of past reactions. The direction of a release reaction is not predictable from the release alone; nothing here is a forecast, a signal or a trade.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { glView } from './jarvisGL.js';
import { familiesOf, releasesOf, unitFor, resample, bandStats, typical30, biggest, depthOf, dateTicks, fanOf, areaScale, nextToday, placeLabels, nativeText, shockwaveScript,
  MARKETS, FAMILY_MARKET, FAMILY_SHORT, familyLabel, marketLabel, marketUnit, CAP, OFFS, GRID_STEP, fin, shockTodayScript, typicalInRegime } from './shockwaveCore.js';
import { isEvening } from './eveningCore.js';
import { londonParts } from './dayAheadCore.js';

const ID = 'shockwave', TTL = 10 * 60_000, XL = 6.4, HU = 0.42, DEPTH = 8, ZS = 1.5, BASE = -CAP * HU - 0.05, R0 = 0.55, RF = 4.4, HF = 0.42, SWEEP = 9, MAXL = 48;
const KEY = 'each line = one past release · gold = the typical path · history, not a forecast: the direction of a release reaction is not predictable from the release alone';
const S = { rl: null, evday: null, status: 'idle', at: 0, busy: null, paths: new Map(), inflight: new Set(), pstamp: 0, family: null, mkt: null, mode: 'stack', abs: false, sel: null, showP: -1, showAt: 0, spin: null, err: null };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const xOf = m => m / OFFS[1] * XL;
const nowMs = api => (Number.isFinite(api?.st?.swNow) ? api.st.swNow : Date.now());       // st.swNow pins the clock (lab fixtures); normally the real time
const F = 'ui-monospace,monospace';

/** Read the release list and today's events once per ten minutes. Never throws; S.status is 'loading' | 'ok' | 'empty' | 'fail'. */
export function loadRecord(api, force) {
  if (S.busy) return S.busy; if (S.rl && !force && Date.now() - S.at < TTL) return Promise.resolve(S.rl);
  if (!S.rl) S.status = 'loading';
  S.busy = (async () => {
    const ok = u => Promise.resolve().then(() => api.jf(u)).catch(() => null);
    const [rl, ev] = await Promise.all([ok('/api/release-layer1'), ok('/api/event-day')]);
    if (rl && rl.ok !== false && Array.isArray(rl.rows)) { S.rl = rl; S.status = familiesOf(rl.rows, nowMs(api)).length ? 'ok' : 'empty'; }
    else if (!S.rl) S.status = 'fail';
    S.evday = ev && ev.ok !== false ? ev : null;
    if (S.rl && !S.family) pickDefault(api);
    S.at = Date.now(); S.busy = null; return S.rl;
  })();
  return S.busy;
}
/** Default family: the next one due today if we hold it, else the family of the most recent release. */
function pickDefault(api) {
  const now = nowMs(api), fams = familiesOf(S.rl.rows, now).map(f => f.f), nx = nextToday(S.evday, S.rl, now, fams);
  let f = nx?.family; if (!f) { const last = S.rl.rows.filter(r => fams.includes(r.family) && Date.parse(r.t) <= now).sort((a, b) => Date.parse(b.t) - Date.parse(a.t))[0]; f = last?.family ?? fams[0]; }
  setFamily(api, f);
}
function setFamily(api, f) { if (!f) return; S.family = f; S.sel = null; const ms = marketsFor(f, nowMs(api)); S.mkt = ms.includes(FAMILY_MARKET[f]) ? FAMILY_MARKET[f] : ms[0] ?? 'eurusd'; ensurePaths(api); }
/** The markets that have a 30-minute move in at least five releases of the family (the button list). */
function marketsFor(f, now) { const rel = releasesOf(S.rl?.rows, f, now); return MARKETS.map(m => m.k).filter(k => rel.filter(r => fin(r.M?.[k]?.m30)).length >= 5); }

/** Fetch the minute paths of the family's releases (four at a time, each once). */
function ensurePaths(api) {
  if (!S.rl || !S.family) return;
  const q = releasesOf(S.rl.rows, S.family, nowMs(api)).slice(-MAXL).map(r => r.id).filter(id => !S.paths.has(id) && !S.inflight.has(id)).reverse();   // newest first
  const run = async () => { while (q.length) { const id = q.shift(); S.inflight.add(id); let p = null; try { const j = await api.jf(`/api/release-layer1/paths?id=${encodeURIComponent(id)}`); p = j?.ok === false ? null : (j?.paths ?? null); } catch (e) { p = null; } S.paths.set(id, p); S.inflight.delete(id); S.pstamp++; } };
  for (let i = 0; i < 4; i++) run();
}

/** Everything the scene and overlay need for the current family / market, rebuilt when either changes. */
function model(now) {
  const rows = S.rl?.rows ?? [], fam = S.family, mkt = S.mkt, rel = releasesOf(rows, fam, now).slice(-MAXL), U = unitFor(rows, fam, mkt, now), unit = U?.unit ?? null;
  const t0 = rel.length ? Date.parse(rel[0].t) : 0, t1 = rel.length ? Date.parse(rel.at(-1).t) : 1;
  const lines = [];
  for (const r of rel) {
    const p = S.paths.get(r.id); if (!p || !p[mkt] || unit == null) continue;
    const l = resample(p[mkt], unit, { abs: S.abs }); if (!l.segs.length) continue;
    const m30 = r.M?.[mkt]?.m30;
    lines.push({ r, l, d: depthOf(r.t, t0, t1), sign: fin(m30) ? Math.sign(m30) : 0, m30, ys: gridOf(l) });
  }
  const units = {}; for (const m of MARKETS) { const u = unitFor(rows, fam, m.k, now); if (u) units[m.k] = u.unit; }
  const newest = rel.at(-1) ?? null, fan = newest && S.paths.get(newest.id) ? fanOf(newest, S.paths.get(newest.id), units) : null;
  return { fam, mkt, rel, unit, U, t0, t1, lines, band: bandStats(lines.map(x => x.l)), typ: typical30(rows, fam, mkt, now), big: biggest(rel, mkt, unit, 3), newest, fan,
    loading: rel.filter(r => !S.paths.has(r.id)).length, capped: lines.filter(x => x.l.capped).length, ticks: dateTicks(t0, t1) };
}
const NG = Math.floor((OFFS[1] - OFFS[0]) / GRID_STEP) + 1;
function gridOf(l) { const a = new Float32Array(NG).fill(NaN); for (const s of l.segs) for (const [m, y] of s) a[(m - OFFS[0]) / GRID_STEP] = y; return a; }

function setup(L, H, api) {
  const { THREE } = L, kit = H.kit, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  scene.add(kit.dust(1100, 40, api.colours?.()?.tx2 || 'white'));
  let grp = null, sig = '', lastBuild = 0;
  const O = { M: null, rings: [], plane: null, sweepL: null, sweepP: null, lineRecs: [], spokes: [], C: null };
  const cam = { p: new THREE.Vector3(2, 5, 14), t: new THREE.Vector3(2.4, -0.4, -3), wp: new THREE.Vector3(), wt: new THREE.Vector3() };
  loadRecord(api);

  const drop = () => { if (!grp) return; scene.remove(grp); kit.forget(grp); grp = null; O.rings = []; O.lineRecs = []; O.spokes = []; O.sweepL = O.sweepP = O.plane = null; };
  const halfRing = (C, y) => { const m = new THREE.Mesh(new THREE.RingGeometry(0.99, 1, 96, 1, -Math.PI / 2, Math.PI), new THREE.MeshBasicMaterial({ color: H.color(C), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.position.y = y; return m; };

  function buildStack(M, C) {
    const zc = -DEPTH / 2;
    // the base plate: minute lines along the depth, the front / back edges, and the zero line at the release plane
    const segs = [], z0 = ZS + 0.5, z1 = -DEPTH - 0.3;
    for (const m of [-30, 0, 30, 60, 120, 180, 240]) segs.push([xOf(m), BASE, z0, xOf(m), BASE, z1]);
    segs.push([xOf(-30), BASE, z0, XL, BASE, z0], [xOf(-30), BASE, z1, XL, BASE, z1]);
    grp.add(kit.segments(segs, C.blue, 0.16));
    grp.add(kit.segments([[xOf(30), BASE, z0, xOf(30), BASE, z1]], C.gold, 0.22));          // the 30-minute mark the readout talks about
    // the release instant: a translucent vertical plane at minute 0 with a bright frame
    const ph = CAP * HU * 2 + 0.1, pg = new THREE.PlaneGeometry(DEPTH + ZS + 0.8, ph);
    const pm = new THREE.ShaderMaterial({ uniforms: { c: { value: H.color(C.cy) }, k: { value: 0.16 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 c; uniform float k; varying vec2 vU; void main(){ float e = 1.0 - abs(vU.y - 0.5) * 2.0; float a = (0.25 + 0.75 * pow(e, 3.0)) * k * (0.55 + 0.45 * smoothstep(0.0, 0.3, vU.x)); gl_FragColor = vec4(c * a, a); }' });
    const plane = new THREE.Mesh(pg, pm); plane.rotation.y = Math.PI / 2; plane.position.set(0, BASE + ph / 2, (ZS + 0.5 + z1) / 2); grp.add(plane); O.plane = pm;
    grp.add(kit.line([[0, BASE, z0], [0, BASE + ph, z0], [0, BASE + ph, z1], [0, BASE, z1]], C.cy, 1.4, 0.55));
    grp.add(kit.line([[0, 0, z0], [0, 0, z1]], C.cy, 1, 0.35));
    // the shockwave: three half-rings radiating forward in time on the zero level
    for (let i = 0; i < 3; i++) { const r = halfRing(C.cy, 0.002); r.position.z = zc; grp.add(r); O.rings.push(r); }
    // one line per release
    for (const x of M.lines) {
      const z = -x.d * DEPTH, newest = x.r === M.newest, sel = x.r.id === S.sel, col = sel ? C.tx : newest ? C.blue : x.sign > 0 ? C.up : x.sign < 0 ? C.dn : C.tx2;
      const op = sel ? 1 : newest ? 0.9 : S.sel ? 0.1 : 0.14 + 0.36 * (1 - x.d), w = sel ? 3 : newest ? 2.4 : 1.2;
      for (const s of x.l.segs) grp.add(kit.line(s.map(([m, y]) => [xOf(m), y * HU, z]), col, w, op));
      O.lineRecs.push({ x, z });
    }
    // the typical path: gold median and the 25-75% ribbon, floating in front of the stack
    const B = M.band.filter(b => b.med != null);
    if (B.length >= 2) {
      const pos = [], idx = [];
      B.forEach((b, i) => { pos.push(xOf(b.m), b.lo * HU, ZS, xOf(b.m), b.hi * HU, ZS); if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      grp.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: H.color(C.gold), transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })));
      grp.add(kit.line(B.map(b => [xOf(b.m), b.lo * HU, ZS]), C.gold, 1, 0.4)); grp.add(kit.line(B.map(b => [xOf(b.m), b.hi * HU, ZS]), C.gold, 1, 0.4));
      grp.add(kit.line(B.map(b => [xOf(b.m), b.med * HU, ZS]), C.gold, 4.5, 0.95));
      grp.add(kit.segments([[xOf(-30), 0, ZS, XL, 0, ZS]], C.tx2, 0.3));
    }
    // the sweep: a line across the stack at the current minute and a dot on every release there
    O.sweepL = kit.line([[0, BASE, ZS + 0.5], [0, BASE, -DEPTH]], C.tx, 1.4, 0.5); grp.add(O.sweepL);
    O.sweepP = kit.points(M.lines.length + 1, C.tx, 6, { colors: true }); grp.add(O.sweepP);
    const ca = O.sweepP.geometry.attributes.color.array;
    M.lines.forEach((x, i) => { const c = H.color(x.sign > 0 ? C.up : x.sign < 0 ? C.dn : C.tx2); ca.set([c.r, c.g, c.b], i * 3); });
    const cg = H.color(C.gold); ca.set([cg.r, cg.g, cg.b], M.lines.length * 3);
    const core = kit.flare(C.cy, 0.5, 0.9); core.position.set(0, 0, ZS); grp.add(core);
  }

  function buildFan(M, C) {
    const fan = M.fan; if (!fan) return;
    const segs = [];
    for (const [m, hi] of [[30, true], [60, false], [120, false], [240, false]]) {
      const R = R0 + m / OFFS[1] * RF, n = 128, s = [];
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2; s.push([Math.cos(a) * R, BASE * 0.5, Math.sin(a) * R, Math.cos(b) * R, BASE * 0.5, Math.sin(b) * R]); }
      grp.add(kit.segments(s, hi ? C.gold : C.blue, hi ? 0.35 : 0.14));
    }
    const N = fan.spokes.length, order = MARKETS.map(m => m.k).filter(k => fan.spokes.some(s => s.k === k));
    for (const sp of fan.spokes) {
      const a = order.indexOf(sp.k) / Math.max(1, N) * Math.PI * 2 - Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), col = sp.sign > 0 ? C.up : sp.sign < 0 ? C.dn : C.tx2;
      segs.push([ca * R0 * 0.6, BASE * 0.5, sa * R0 * 0.6, ca * (R0 + RF), BASE * 0.5, sa * (R0 + RF)]);
      const k = clamp((sp.size ?? 0) / 2, 0.25, 1);
      for (const s of sp.line.segs) grp.add(kit.line(s.map(([m, y]) => { const R = R0 + m / OFFS[1] * RF; return [ca * R, y * HF, sa * R]; }), col, 1.1 + 1.3 * k, 0.25 + 0.55 * k));
      const R30 = R0 + 30 / OFFS[1] * RF;
      const y = sp.line.segs.flat().find(p => p[0] >= 28 && p[0] <= 32)?.[1] ?? 0;
      const fl = kit.flare(col, areaScale(sp.size, 0.42) + 0.05, 0.9); fl.position.set(ca * R30, y * HF, sa * R30); grp.add(fl);
      grp.add(kit.segments([[ca * R30, BASE * 0.5, sa * R30, ca * R30, y * HF, sa * R30]], col, 0.25));
      O.spokes.push({ sp, a, ca, sa, end: (() => { const l = sp.line.segs.at(-1).at(-1); const R = R0 + l[0] / OFFS[1] * RF; return [ca * R, l[1] * HF, sa * R]; })(), p30: [ca * R30, y * HF, sa * R30], fl });
    }
    grp.add(kit.segments(segs, C.blue, 0.12));
    const pil = kit.line([[0, BASE * 0.5, 0], [0, CAP * HF, 0]], C.cy, 2, 0.7); grp.add(pil);
    const core = kit.flare(C.cy, 0.55, 0.7); grp.add(core);
    for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.RingGeometry(0.992, 1, 128), new THREE.MeshBasicMaterial({ color: H.color(C.cy), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); r.rotation.x = -Math.PI / 2; r.position.y = BASE * 0.5 + 0.002; grp.add(r); O.rings.push(r); }
  }

  function build(g, now) {
    drop(); const C = g.C; O.C = C; grp = new THREE.Group(); scene.add(grp);
    const M = model(now); O.M = M; lastBuild = Date.now();
    if (S.mode === 'all') buildFan(M, C); else buildStack(M, C);
  }

  return {
    scene, camera, bloom: { strength: 0.7, radius: 0.45, threshold: 0.14 },
    update(t, dt, api2, g) {
      const st = api.st, now = nowMs(api);
      if (typeof st.sel === 'string' && st.sel.startsWith('sw:')) { handleSel(api, st.sel.slice(3)); st.sel = null; api.blip?.(820, 0.05); }
      if (!S.busy && (Date.now() - S.at > TTL || (S.status === 'fail' && Date.now() - S.at > 30_000))) loadRecord(api, true);
      if (S.rl && !S.family) pickDefault(api);
      if (S.rl && S.family) ensurePaths(api);
      const s = [S.family, S.mkt, S.mode, S.abs, S.sel, g.C.blue, g.C.up, g.C.gold, S.rl ? S.at : 0].join('|');
      if (S.rl && S.family && (s !== sig || (S.pstamp !== O.pst && Date.now() - lastBuild > 500))) { sig = s; O.pst = S.pstamp; build(g, now); }
      // shockwave rings: radiate from the release instant and fade (calm: one faint still ring)
      const fan = S.mode === 'all';
      O.rings.forEach((r, i) => {
        const ph = H.calm ? 0.35 : ((t * 0.22 + i / 3) % 1), R = fan ? R0 + ph * (RF + 0.4) : 0.2 + ph * (XL + 0.6);
        r.scale.set(R, R, fan ? R : R); if (!fan) r.scale.set(R, R * 0.62, 1);
        r.material.opacity = (H.calm ? 0.2 : 0.4 * Math.pow(1 - ph, 1.6)) * (i === 0 || !H.calm ? 1 : 0);
      });
      if (O.plane) O.plane.uniforms.k.value = H.calm ? 0.16 : 0.13 + 0.05 * Math.sin(t * 2.2);
      // the sweep across the stack
      if (O.sweepL && O.M) {
        const ph = H.calm ? 30 : ((t % (SWEEP + 1.5)) / SWEEP) * OFFS[1], m = Math.round(clamp(ph, 0, OFFS[1]) / GRID_STEP) * GRID_STEP, x = xOf(m), gi = (m - OFFS[0]) / GRID_STEP;
        O.sweepM = m; kit.setLine(O.sweepL, [[x, BASE, ZS + 0.5], [x, BASE, -DEPTH - 0.3]]);
        const a = O.sweepP.geometry.attributes.position.array, L2 = O.M.lines;
        for (let i = 0; i < L2.length; i++) { const y = L2[i].ys[gi]; a[i * 3] = x; a[i * 3 + 1] = Number.isFinite(y) ? y * HU : -999; a[i * 3 + 2] = -L2[i].d * DEPTH; }
        const b = O.M.band.find(q => q.m === m), k = L2.length * 3; a[k] = x; a[k + 1] = b?.med != null ? b.med * HU : -999; a[k + 2] = ZS;
        O.sweepP.geometry.attributes.position.needsUpdate = true;
      }
      // camera
      const asp = g.W / Math.max(1, g.H), z = st.zoom || 1, show = S.showP >= 0 && Date.now() - S.showAt < 1500;
      if (fan) {
        const d = (asp < 1 ? 21 : 14) / z, el = clamp((asp < 1 ? 0.95 : 0.72) - (st.pitch + 0.45) * 0.8, 0.15, 1.35), yaw = (st.yaw - 0.35) + (H.calm ? 0 : t * 0.05);
        cam.wt.set(0, -0.2, 0); cam.wp.set(d * Math.cos(el) * Math.sin(yaw), d * Math.sin(el) - 0.2, d * Math.cos(el) * Math.cos(yaw));
      } else {
        const d = (asp < 1 ? 32 : 15.5) / z, el = clamp((asp < 1 ? 0.62 : 0.5) - (st.pitch + 0.45) * 0.8, 0.04, 1.3);
        let yaw = (st.yaw - 0.35) - 0.16 + (H.calm ? 0 : Math.sin(t * 0.07) * 0.04);
        if (show) { const p = clamp(S.showP, 0, 1); yaw = -0.5 + 0.4 * p * p * (3 - 2 * p); }
        cam.wt.set(XL * 0.44, -1.25, -DEPTH * 0.36 + (asp < 1 ? 0.6 : 0)); cam.wp.set(cam.wt.x + d * Math.cos(el) * Math.sin(yaw), cam.wt.y + d * Math.sin(el), cam.wt.z + d * Math.cos(el) * Math.cos(yaw));
      }
      const k = Math.min(1, dt * 2.4); cam.p.lerp(cam.wp, k); cam.t.lerp(cam.wt, k); camera.position.copy(cam.p); camera.lookAt(cam.t);
    },
    overlay(ctx, g) { overlay(ctx, g, api, H, camera, O); },
    dispose() { drop(); },
  };
}

function handleSel(api, k) {
  const fams = familiesOf(S.rl?.rows, nowMs(api)).map(f => f.f), mk = S.family ? marketsFor(S.family, nowMs(api)) : [];
  const cyc = (list, cur, d) => list[(list.indexOf(cur) + d + list.length) % list.length];
  if (k.startsWith('fam:')) setFamily(api, k.slice(4));
  else if (k === 'fam+' || k === 'fam-') setFamily(api, cyc(fams, S.family, k === 'fam+' ? 1 : -1));
  else if (k.startsWith('mkt:')) { S.mkt = k.slice(4); S.sel = null; }
  else if ((k === 'mkt+' || k === 'mkt-') && mk.length) { S.mkt = cyc(mk, S.mkt, k === 'mkt+' ? 1 : -1); S.sel = null; }
  else if (k === 'all') { S.mode = S.mode === 'all' ? 'stack' : 'all'; S.sel = null; }
  else if (k === 'size') S.abs = !S.abs;
  else if (k.startsWith('rel:')) { const id = k.slice(4); S.sel = S.sel === id ? null : id; }
  else if (k === 'x') S.sel = null;
}

// ───────────────────────── the 2D overlay ─────────────────────────
function text(ctx, s, x, y, col, font, al = 1, align = 'left') { ctx.font = font; ctx.textAlign = align; ctx.globalAlpha = al; ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillText(s, x + 1, y + 1); ctx.fillStyle = col; ctx.fillText(s, x, y); }
function panel(ctx, C, x, y, w, h, fade, a = 0.8) { ctx.globalAlpha = a * fade; ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 0.4 * fade; ctx.strokeStyle = C.blue; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
function wrap(ctx, s, w) { const out = []; let line = ''; for (const word of String(s).split(/\s+/)) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t; } if (line) out.push(line); return out; }
/** A canvas button; returns its width. on = lit. */
function button(ctx, g, x, y, label, key, on, h = 22) {
  const { C, fade } = g; ctx.font = `${on ? '600 ' : ''}11px ${F}`; const w = ctx.measureText(label).width + 16;
  ctx.globalAlpha = fade * (on ? 0.9 : 0.75); ctx.fillStyle = 'rgba(0,0,0,0.82)'; ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = fade * (on ? 0.95 : 0.4); ctx.strokeStyle = on ? C.gold : C.blue; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.globalAlpha = fade; ctx.fillStyle = on ? C.gold : C.tx; ctx.textAlign = 'center'; ctx.fillText(label, x + w / 2, y + h / 2 + 4); ctx.textAlign = 'left';
  g.hit(`sw:${key}`, x + w / 2, y + h / 2); return w;
}
const day = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const mon = t => new Date(t).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const xU = v => (fin(v) ? `${v.toFixed(1)}×` : '–');

function overlay(ctx, g, api, H, camera, O) {
  const { W, H: HH, C, fade, compact: cp } = g, now = nowMs(api), M = O.M;
  ctx.save(); ctx.textBaseline = 'alphabetic';
  if (!S.rl || !M) {
    const m = S.status === 'fail' ? 'The release record could not be read right now (/api/release-layer1), so there is nothing to draw.' : S.status === 'empty' ? 'The release record holds no family with enough releases to draw.' : 'Reading the release record...';
    ctx.font = `13px ${F}`; wrap(ctx, m, W - 40).forEach((l, i) => text(ctx, l, W / 2, HH / 2 + i * 18, C.tx2, `13px ${F}`, fade, 'center')); ctx.restore(); return;
  }
  const P = p => H.toScreen(p, camera), taken = [], fams = familiesOf(S.rl.rows, now), mks = marketsFor(S.family, now), all = S.mode === 'all', unitW = marketUnit(S.mkt);
  const nx = nextToday(S.evday, S.rl, now, fams.map(f => f.f));
  // ── title, next, controls ──
  const x0 = 16, ty = cp ? 92 : 100;
  text(ctx, 'RELEASE SHOCKWAVE', x0, ty, C.blue, `600 ${cp ? 13 : 15}px ${F}`, fade);
  let sub = all ? `${familyLabel(S.family)} · newest release ${M.newest ? day(M.newest.t) : ''} · every market` : `${familyLabel(S.family)} · ${marketLabel(S.mkt)} · ${M.rel.length} releases ${M.rel.length ? `${mon(M.rel[0].t)} – ${mon(M.rel.at(-1).t)}` : ''}`;
  if (M.loading) sub += ` · loading paths ${M.rel.length - M.loading}/${M.rel.length}`;
  ctx.font = `11px ${F}`; text(ctx, cp ? wrap(ctx, sub, W - 32)[0] : sub, x0, ty + 16, C.tx2, `11px ${F}`, fade);
  if (nx) { const s = `next: ${FAMILY_SHORT[nx.family] ?? nx.family} at ${nx.hm} London`; ctx.font = `600 12px ${F}`; const w = ctx.measureText(s).width; const xx = cp ? x0 : x0 + 190; const yy = cp ? ty + 32 : ty;
    if (!cp) { panel(ctx, C, xx - 6, yy - 14, w + 12, 19, fade, 0.6); } text(ctx, s, xx, yy, C.gold, `600 12px ${F}`, fade); }
  let by = cp ? ty + 42 : ty + 28, bx = x0;
  if (cp) {
    // phone: cyclers
    const fl = FAMILY_SHORT[S.family] ?? S.family, ml = marketLabel(S.mkt), h = 30;
    bx += button(ctx, g, bx, by, '◀', 'fam-', false, h) + 4; bx += button(ctx, g, bx, by, fl, 'fam+', true, h) + 4; bx += button(ctx, g, bx, by, '▶', 'fam+', false, h) + 12;
    if (!all) { bx += button(ctx, g, bx, by, '◀', 'mkt-', false, h) + 4; bx += button(ctx, g, bx, by, ml, 'mkt+', true, h) + 4; button(ctx, g, bx, by, '▶', 'mkt+', false, h); }
    by += h + 6; bx = x0; bx += button(ctx, g, bx, by, 'ALL MARKETS', 'all', all, h) + 6; if (!all) button(ctx, g, bx, by, S.abs ? 'SIZE' : 'SIGNED', 'size', S.abs, h);
    taken.push({ x: 0, y: 0, w: W, h: by + h + 6 });
  } else {
    for (const f of fams) bx += button(ctx, g, bx, by, FAMILY_SHORT[f.f] ?? f.f, `fam:${f.f}`, f.f === S.family) + 4;
    bx += 10; bx += button(ctx, g, bx, by, 'ALL MARKETS', 'all', all) + 4; if (!all) button(ctx, g, bx, by, S.abs ? 'SIZE |move|' : 'SIGNED', 'size', S.abs);
    if (!all) { by += 27; bx = x0; for (const k of mks.slice(0, 13)) { const w = button(ctx, g, bx, by, marketLabel(k), `mkt:${k}`, k === S.mkt); bx += w + 4; if (bx > W - 420) break; } }
    taken.push({ x: 0, y: 0, w: Math.max(bx, 560), h: by + 30 });
  }
  // ── readout (right) ──
  const rd = readout(ctx, g, M, now, unitW); if (rd) taken.push(rd);
  // ── key (bottom) ──
  const ky = HH - (cp ? 70 : 44); ctx.font = `11px ${F}`; const kl = wrap(ctx, KEY, W - 32);
  kl.forEach((s, i) => text(ctx, s, W / 2, ky + i * 14, C.tx2, `11px ${F}`, 0.9 * fade, 'center'));
  const enc = all ? 'spoke = one market · out = minutes after · height & flare area = move ÷ its usual 30-min move' : `height = move ÷ usual 30-min ${marketLabel(S.mkt)} move (1 = ${nativeText(M.unit, unitW)})${S.abs ? ' · SIZE: folded to |move|' : ''}`;
  ctx.font = `11px ${F}`; const ew = wrap(ctx, enc, W - 32);
  // colour chips
  const chips = all || !S.abs ? [[C.up, '▲ up at +30m'], [C.dn, '▼ down at +30m'], [C.gold, all ? '— 30-min ring' : '— median · ribbon 25–75%'], [C.cy, '| release instant']] : [[C.gold, '— median size · ribbon 25–75%'], [C.cy, '| release instant']];
  const rowsC = [[]]; { let rw = 0; for (const ch of chips) { const w = ctx.measureText(ch[1]).width + 18; if (rw + w > W - 24 && rowsC.at(-1).length) { rowsC.push([]); rw = 0; } rowsC.at(-1).push(ch); rw += w; } }
  const cyy = ky - 16, encY = cyy - 16 - (rowsC.length - 1) * 14;
  rowsC.forEach((row, ri) => { let cw = 0; for (const [, l] of row) cw += ctx.measureText(l).width + 18; let cx = W / 2 - cw / 2 + 9; const yy = cyy - (rowsC.length - 1 - ri) * 14;
    for (const [c, l] of row) { text(ctx, l, cx, yy, c, `11px ${F}`, fade); cx += ctx.measureText(l).width + 18; } });
  ew.forEach((s, i) => text(ctx, s, W / 2, encY - (ew.length - 1 - i) * 14, C.tx, `11px ${F}`, 0.9 * fade, 'center'));
  taken.push({ x: 0, y: encY - ew.length * 14, w: W, h: HH });
  const items = [], meta = [];
  const add = (anchor, s, col, prio, font = `11px ${F}`, key = null, lead = true) => { if (!anchor.vis) return; ctx.font = font; items.push({ x: anchor.x, y: anchor.y - 8, w: ctx.measureText(s).width, h: 12, prio }); meta.push({ s, col, font, a: anchor, key, lead }); };
  if (!all) {
    // axis: minutes along the front, unit marks on the release plane, dates along the right
    for (const m of [-30, 0, 30, 60, 120, 180, 240]) { if (cp && (m === 180 || m === -30)) continue; add(P([xOf(m), BASE, ZS + 0.9]), m === 0 ? 'release' : `${m > 0 ? '+' : ''}${m}m`, m === 0 ? C.cy : C.tx2, 30, `11px ${F}`, null, false); }
    for (const u of [2, -2]) add(P([0, u * HU, ZS + 0.5]), `${u > 0 ? '+' : '−'}2× usual`, C.tx2, 25, `11px ${F}`, null, false);
    for (const tk of M.ticks) add(P([XL + 0.25, BASE, -tk.f * DEPTH]), tk.label, C.tx2, 20, `11px ${F}`, null, false);
    // the typical path, the newest release, the biggest reactions, the selected one
    const b30 = M.band.find(b => b.m === 30);
    if (b30?.med != null) add(P([xOf(OFFS[1]), (M.band.at(-1)?.med ?? b30.med) * HU, ZS]), S.abs ? 'typical size' : 'typical path (median)', C.gold, 60);
    const lab = (r, prio, extra = '') => {
      const rec = M.lines.find(x => x.r.id === r.id); if (!rec) return;
      const y = rec.ys[(30 - OFFS[0]) / GRID_STEP], m30 = r.M?.[S.mkt]?.m30, size = fin(m30) && M.unit ? Math.abs(m30) / M.unit : null;
      const s = `${extra}${cp ? mon(r.t) : day(r.t)} ${nativeText(m30, unitW, true)}${size != null ? ` · ${xU(size)}` : ''}`;
      add(P([xOf(30), (Number.isFinite(y) ? y : 0) * HU, -rec.d * DEPTH]), s, r.id === S.sel ? C.tx : (m30 ?? 0) >= 0 ? C.up : C.dn, prio, `${r.id === S.sel ? '600 ' : ''}11px ${F}`, `rel:${r.id}`);
    };
    if (S.sel) { const r = M.rel.find(x => x.id === S.sel); if (r) lab(r, 100); }
    if (M.newest) lab(M.newest, 80, 'newest ');
    M.big.slice(0, cp ? 2 : 3).forEach((b, i) => { if (b.id !== S.sel && b.id !== M.newest?.id) lab(M.rel.find(r => r.id === b.id), 70 - i); });
    if (O.sweepM != null && !H.calm) add(P([xOf(O.sweepM), BASE, -DEPTH - 0.4]), `+${O.sweepM}m`, C.tx, 10, `11px ${F}`, null, false);
  } else if (M.fan) {
    for (const [m, l] of [[30, '30m'], [120, '2h'], [240, '4h']]) add(P([0, BASE * 0.5, -(R0 + m / OFFS[1] * RF) - 0.05]), l, m === 30 ? C.gold : C.tx2, 30, `11px ${F}`, null, false);
    O.spokes.forEach((o, i) => {
      const sp = o.sp, top = i < (cp ? 4 : 7), s = top ? `${sp.label} ${nativeText(sp.m30, sp.unit, true)} · ${xU(sp.size)}${sp.size > CAP ? ' (capped)' : ''}` : sp.label;
      add(P(top ? o.p30 : [o.ca * (R0 + RF + 0.35), 0, o.sa * (R0 + RF + 0.35)]), s, top ? (sp.sign > 0 ? C.up : sp.sign < 0 ? C.dn : C.tx2) : C.tx2, top ? 60 - i : 5, `${top ? '600 ' : ''}11px ${F}`, null, top);
    });
  }
  const pl = placeLabels(items, W, HH, taken);
  pl.forEach((q, i) => {
    if (!q) return; const m = meta[i], it = items[i];
    if (m.lead && (Math.abs(q.y - it.y) > 3 || Math.abs(q.x - it.x) > 3)) { ctx.globalAlpha = 0.45 * fade; ctx.strokeStyle = m.col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(m.a.x, m.a.y); ctx.lineTo(q.x, q.y + 3); ctx.stroke(); }
    if (m.lead) { ctx.font = m.font; const w = ctx.measureText(m.s).width + 8; ctx.globalAlpha = 0.62 * fade; ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(q.x - w / 2, q.y - 12, w, 16); }
    text(ctx, m.s, q.x, q.y, m.col, m.font, fade, 'center');
    if (m.key) g.hit(`sw:${m.key}`, q.x, q.y - 4);
  });
  ctx.restore();
}

/** The readout: the typical first 30 minutes (size, not direction), the newest / selected release, the record's coverage. Returns its box. */
function readout(ctx, g, M, now, unitW) {
  const { W, H: HH, C, fade, compact: cp } = g, all = S.mode === 'all', lines = [];
  const typ = M.typ, rl = S.rl;
  if (all) {
    const f = M.fan; lines.push([`NEWEST ${FAMILY_SHORT[S.family] ?? S.family} · ${M.newest ? day(M.newest.t) : 'n/a'}`, C.blue, true]);
    if (!f) lines.push([M.newest && !S.paths.has(M.newest.id) ? 'loading its paths...' : 'no minute paths stored for it', C.tx2]);
    else {
      lines.push([`${f.spokes.length} markets · biggest against usual:`, C.tx2]);
      for (const sp of f.spokes.slice(0, cp ? 3 : 5)) lines.push([`${(sp.sign > 0 ? '▲ ' : sp.sign < 0 ? '▼ ' : '• ') + sp.label.padEnd(12)} ${nativeText(sp.m30, sp.unit, true).padStart(8)} ${xU(sp.size)}`, sp.sign > 0 ? C.up : sp.sign < 0 ? C.dn : C.tx2]);
      if (f.missing.length && !cp) lines.push([`no path: ${f.missing.slice(0, 5).join(', ')}${f.missing.length > 5 ? ' …' : ''}`, C.tx2]);
    }
  } else {
    lines.push([`TYPICAL FIRST 30 MIN · ${marketLabel(S.mkt)}`, C.blue, true]);
    if (typ) {
      lines.push([`size ${nativeText(typ.med, unitW)} (median of ${typ.n})`, C.gold, true]);
      lines.push([`half between ${nativeText(typ.lo, unitW)} and ${nativeText(typ.hi, unitW)}`, C.tx]);
      lines.push([`direction: ${typ.up} up, ${typ.dn} down`, C.tx2]);
      if (!cp) lines.push([`largest ${nativeText(typ.max, unitW)} (${xU(typ.max / (M.unit || 1))} usual)`, C.tx2]);
    } else lines.push(['no 30-minute moves stored for this market', C.tx2]);
    if (M.U?.pooled) lines.push(['usual = all families (too few here)', C.gold]);
    if (M.capped) lines.push([`${M.capped} line${M.capped > 1 ? 's' : ''} capped at ±${CAP}× usual`, C.gold]);
    const sel = S.sel ? M.rel.find(r => r.id === S.sel) : null;
    if (sel) { const m30 = sel.M?.[S.mkt]?.m30; lines.push([`▸ ${sel.name} ${day(sel.t)}`, C.tx, true]); lines.push([`  +30m ${nativeText(m30, unitW, true)} · ${xU(fin(m30) && M.unit ? Math.abs(m30) / M.unit : null)} usual`, C.tx]); }
  }
  if (!cp) {
    const live = rl.asOf ? `live push ${Math.round((rl.ageSec ?? 0) / 60)} min old` : `history to ${rl.builtAt ? day(rl.builtAt) : 'n/a'} · live record needs the laptop push (KV release_layer1_v1)`;
    lines.push([live, C.tx2]);
  }
  ctx.font = `11px ${F}`; const wMax = cp ? W - 32 : 340;
  const rowsW = []; for (const [s, c, b] of lines) for (const l of wrap(ctx, s, wMax - 16)) rowsW.push([l, c, b]);
  const h = rowsW.length * 15 + 14, w = cp ? W - 32 : Math.min(wMax, Math.max(...rowsW.map(([s]) => ctx.measureText(s).width)) + 22);
  const x = cp ? 16 : W - w - 16, y = cp ? HH - 128 - h : 100;
  panel(ctx, C, x, y, w, h, fade, 0.72);
  rowsW.forEach(([s, c, b], i) => text(ctx, s, x + 10, y + 18 + i * 15, c, `${b ? '600 ' : ''}11px ${F}`, fade));
  if (S.sel && !all) { text(ctx, '✕', x + w - 14, y + 18, C.tx2, `12px ${F}`, fade, 'center'); g.hit('sw:x', x + w - 14, y + 14); }
  return { x, y, w, h };
}

const view = glView({ id: ID, label: 'RELEASE SHOCKWAVE', env: { accent: 'blue2', chrome: 'clean', scan: false }, setup,
  onEnter: api => { S.showP = -1; S.spin = api.st.spin; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); loadRecord(api); },
  onLeave: api => { S.showP = -1; if (S.spin != null) api.st.spin = S.spin; S.spin = null; } });

registerJarvisModule({
  id: ID, label: 'RELEASE SHOCKWAVE',
  render(pane, api) {
    pane.innerHTML = `<h3>RELEASE SHOCKWAVE</h3><p>How markets moved, minute by minute, after every past release of one kind (payrolls, CPI, the Fed, the ECB, the BoE, the BoJ...). Each glowing line is one past release, stacked by date with the newest nearest; the bright plane is the release minute, the gold line the typical path and the gold ribbon the middle half of them. Heights are in the market's usual 30-minute reaction, so 1 is ordinary and 3 is large. ALL MARKETS fans the newest release's markets around the release instant.</p><p class="jv-sub">History, not a forecast: which way a release moves a market is not predictable from the release alone.</p><div class="jv-row"><button type="button" data-sw="go">▶ SHOW THE SHOCKWAVE</button></div>`;
    pane.querySelector('[data-sw="go"]').onclick = () => { api.setView(ID); loadRecord(api, true); };
  },
  views: [view],
});

await import('./jarvisViewDayAhead.js').catch(() => null);     // so the 'dayahead' scene is registered before this one asks to follow it
registerShowScene({
  id: ID, after: 'dayahead',
  prepare: api => loadRecord(api).then(async () => {
    if (!S.rl) return null; const now = nowMs(api), fams = familiesOf(S.rl.rows, now).map(f => f.f); if (!fams.length) return null;
    const next = nextToday(S.evday, S.rl, now, fams), family = next?.family ?? S.rl.rows.filter(r => fams.includes(r.family) && Date.parse(r.t) <= now).sort((a, b) => Date.parse(b.t) - Date.parse(a.t))[0]?.family;
    if (!family) return null; const mkt = FAMILY_MARKET[family] ?? 'eurusd', typ = typical30(S.rl.rows, family, mkt, now);
    if (!typ) return null;
    // today's VIX band: the same family's typical in a like regime, beside the all-regime figure (Helix review wave 1.6); optional, a missing VIX only drops that sentence
    let regime = null; try { const h = await api.jf('/api/fredhistory?keys=vix'); regime = typicalInRegime(S.rl.rows, family, mkt, now, h?.vix); } catch (e) { regime = null; }
    return { family, mkt, typ, next, regime };
  }).catch(() => null),
  build: (inp, data) => {
    if (!data) return null; const text = shockwaveScript({ ...data, allowRecent: !!inp?.guide }); if (!text) return null;
    return { title: 'Release shockwave', view: ID, cam: null, text, figure: { value: nativeText(data.typ.med, data.typ.unit), label: `typical 30-min ${marketLabel(data.mkt)} move after ${FAMILY_SHORT[data.family] ?? data.family}` },
      enter: api => { S.mode = 'stack'; S.abs = false; S.sel = null; S.family = null; setFamily(api, data.family); S.mkt = data.mkt; S.showP = 0; S.showAt = Date.now(); Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); },
      motion: (api, p) => { S.showP = clamp(p, 0, 1); S.showAt = Date.now(); } };
  },
});

// the EVENING's big release: when a release the record holds (payrolls, CPI, a central bank...) printed TODAY, its markets fanned out (ALL MARKETS) with the real first half hour
registerShowScene({
  id: 'shocktoday', after: ID,
  prepare: api => {
    const now = nowMs(api); if (!isEvening(now)) return null;
    return loadRecord(api).then(() => {
      if (!S.rl) return null; const today = londonParts(now).date;
      const rel = S.rl.rows.filter(r => r && FAMILY_MARKET[r.family] && r.status !== 'upcoming' && !r.inProgress && Date.parse(r.t) <= now && londonParts(Date.parse(r.t)).date === today).sort((a, b) => Date.parse(b.t) - Date.parse(a.t))[0];
      if (!rel) return null; const mkt = FAMILY_MARKET[rel.family], typ = typical30(S.rl.rows.filter(r => r.id !== rel.id), rel.family, mkt, now);
      return typ ? { rel, mkt, typ, hm: londonParts(Date.parse(rel.t)).hm } : null;
    }).catch(() => null);
  },
  build: (inp, data) => {
    if (!data) return null; const text = shockTodayScript(data); if (!text) return null; const m = data.rel.M?.[data.mkt]?.m30;
    return { title: 'Release shockwave', view: ID, cam: null, text, figure: { value: nativeText(m, data.typ.unit, true), label: `${marketLabel(data.mkt)} first 30 min` },
      enter: api => { S.mode = 'all'; S.abs = false; S.sel = null; S.family = null; setFamily(api, data.rel.family); S.mkt = data.mkt; S.showP = 0; S.showAt = Date.now(); Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); },
      motion: (api, p) => { S.showP = clamp(p, 0, 1); S.showAt = Date.now(); } };
  },
});
