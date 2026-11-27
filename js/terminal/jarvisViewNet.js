// js/terminal/jarvisViewNet.js: Jarvis's NETWORK view, the markets as a living neural net, drawn as a WebGL hologram (jarvisGL.js: real bloom, Fresnel shells, light lines, particles).
// Each market is a glowing node in a slowly turning 3D cloud; positions come from a force-directed layout of the correlation matrix (correlated markets pulled together, opposed ones pushed apart:
// netCore.js, pure and tested). Links only where |r| is above the threshold, as lines of light with signal pulses running along them that flash the node they reach. Clusters are soft nebulae with
// their names. Click a node: its links light, the rest dim, and a card lists its strongest partners.
//
// ENCODING
//   node        = a lit core inside a Fresnel shell; its AREA follows the day's move against its usual (netCore.nodeRadius: area proportional above a small floor, smooth, no jumps), capped at 3x,
//                 and a capped node wears a ring. Colour = direction (green up, red down, grey inside half its usual) with a chevron as the second cue (▲ up, ▼ down, none when quiet).
//   link        = green = moved together, red = moved opposite; thickness steps and brightness rise with |r|; pulses run a -> b on a positive link, b -> a on a negative one (an opposed signal).
//   nebula      = a soft glow round each named group's members (equity indices, dollar majors, FX crosses, metals, energy); it brightens when a member is lit.
//   position    = only a picture of the matrix: the layout keeps the correlation distances as well as it can (its fit is shown).
// TIME SCRUB (bottom panel): the window's END DATE moves back through the ~3 years of daily closes /api/corr-terminal carries, in weekly steps. Each step's matrix uses only returns up to that date
// (no lookahead: netCore.triAt), the layout warm-starts from the previous one so the nodes glide to the new arrangement, PLAY walks the history forward, 20 / 60 / 120 picks the window length.
// The strip under it is one pair's correlation at every step (the pair whose correlation swung most over the history, or the clicked market and its strongest partner), the shown date marked;
// above zero = green, below = red. Work is chunked: the full history's matrices are cached a few per frame (about 3 ms per frame), the shown step first.
// When scrubbed back, node size = that day's move against its own spread over the 60 days before it (point-in-time), not today's.
// SHOW 'net' (after 'lean'): the camera follows the narration (netCore.showActs, by sentence): the overview, the tightest pair, the most opposed pair, the tightest group, then it flies down
// into the cluster round the headline pair (the 3-month change, else the tightest pair) and stays there for the closing words.
// Data: /api/corr-terminal { ok, panel: { syms (26 OANDA names), dates (780 NY trading days), closes: { sym: [close|null] } } }, /api/vol-forecast/live for today's node sizes.
// DESCRIPTION ONLY: how these markets moved together over a past window, which does not persist reliably. Never a forecast.
import { marketName } from './jarvisNames.js';
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { glView, orbitPos, ease } from './jarvisGL.js';
import { marketSizes } from './jarvisMarkets.js';
import { placeLabels } from './fxHoloCore.js';
import { netBriefFigure, netBriefParts, netScriptParts } from './netCore.js';
import { buildNet, pickLinks, partners, CLUSTERS, DEFAULT_THR, MAX_LINKS, WINDOWS, scrubSteps, makeScan, scanSome, stepState, pairPath, swingPair, dayMoves, netScript, showActs, showAct, actNodes, nodeRadius, FULL_AT } from './netCore.js';
const nameOf = (net, id) => { const n = marketName(id, { short: true }); return n === id ? (net.labels[id] ?? id) : n; };

const S = { net: null, sizes: {}, live: {}, links: [], thr: DEFAULT_THR, loading: null, at: 0, flash: null, showP: null, showAt: 0, hl: new Set(), pair: null, pairs: 0, sel: -1, selId: null, ok: null, gen: 0,
  // the time scrub: window length, its scan (cached matrices per step), the shown step, the picture there (cur), the drawn positions gliding toward cur.P (D), play state, strip cache
  w: 60, scans: {}, scan: null, si: -1, cur: null, D: null, play: false, playT: 0, swing: {}, strip: null,
  // the camera and the HUD
  base: 0, cam: null, spin: null, bg: 'black', hudTop: 70, hudAt: -9, acts: [], act: null, off: 0 };
const last = () => (S.scan ? S.scan.steps.length - 1 : -1);
const isLive = () => S.si === last();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = n => { let h = (n + 1) * 2654435761 >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return (h >>> 0) / 4294967296; };
const fmt = r => (r >= 0 ? '+' : '-') + Math.abs(r).toFixed(2);
const showing = () => S.showP != null && Date.now() - S.showAt < 1500;
const RW = 2, SEG = 10, NEB = 80;                                     // world radius of the cloud, segments per link curve, nebula motes per group
const BUCKETS = [[0, 0.4, 1.1], [0.4, 0.55, 1.6], [0.55, 0.7, 2.3], [0.7, 0.85, 3.2], [0.85, 1.01, 4.4]];   // |r| from, to, line width in px

function relink() {
  const n = S.net; if (!n || !S.cur) return;
  S.links = pickLinks(S.cur.m, S.thr, MAX_LINKS);
  S.pairs = n.ids.length * (n.ids.length - 1) / 2;
  S.flash = S.flash?.length === n.ids.length ? S.flash : new Float32Array(n.ids.length);
  S.gen++;
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
      if (net) { S.net = net; S.live = marketSizes(vf); S.at = Date.now(); S.acts = showActs(net); initScrub(net); }
    } catch (e) { S.ok = false; } finally { S.loading = null; }
    return S.net;
  })();
  return S.loading;
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
/** On-screen controls arrive as clicks on a hit key ('net:@...', 'net:+' / 'net:-'); a click on a node selects it (kept while the controls are used), empty space clears. */
function commands(st, net) {
  if (typeof st.sel === 'string' && st.sel.startsWith('net:')) {
    const k = st.sel.slice(4);
    if (k === '+' || k === '-' || k[0] === '@') { control(k); st.sel = S.selId ? 'net:' + S.selId : null; }
    else S.selId = k;
  } else S.selId = null;
  if (globalThis.__netSel) S.selId = globalThis.__netSel;                                          // a debug hook for the visual harness
  S.sel = S.selId ? net.ids.indexOf(S.selId) : -1;
  if (Number.isFinite(globalThis.__netShowP)) { S.showP = globalThis.__netShowP; S.showAt = Date.now(); }
}

/** Who is lit: the selected node, or (in the SHOW) whatever the narration is talking about. Sets S.hl, S.pair, S.act; returns the act's focus 0..1. */
function lighting(net) {
  S.hl.clear(); S.pair = null; S.act = null;
  if (S.sel >= 0) S.hl.add(S.sel);
  if (!showing() || !S.cur) return 0;
  const a = showAct(S.acts, S.showP), on = actNodes(net, S.cur.m, a.act, 2, a.ids); S.act = a;
  if (a.focus <= 0 || !on.nodes.length) return 0;
  for (const i of on.nodes) S.hl.add(i); S.pair = on.pair; return a.focus;
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
  views: [glView({
    id: 'net', label: 'NETWORK', env: { accent: 'up', chrome: 'clean', scan: false },
    onEnter(api) {
      S.showP = null; S.cam = null; S.spin = api.st.spin; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false });
      try { S.bg = api.win.getComputedStyle(api.doc.documentElement).getPropertyValue('--bg1').trim() || 'black'; } catch (e) { S.bg = 'black'; }
      load(api);
    },
    onLeave(api) { S.showP = null; S.play = false; if (S.spin != null) api.st.spin = S.spin; S.spin = null; },
    setup,
  })],
});

function setup(L, H, api) {
  const { THREE } = L, kit = H.kit, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 200);
  scene.add(kit.dust(1400, 36));
  let world = null, nodes = [], links = null, pulses = null, tails = null, neb = null, nebFl = [], beam = null, builtFor = null, colKey = '', linkGen = -1, litKey = '';
  const ccol = {};                                       // cluster colours
  const wp = (i, o = 0, out = TMP) => { out[o] = S.D[i * 3] * RW; out[o + 1] = S.D[i * 3 + 1] * RW; out[o + 2] = S.D[i * 3 + 2] * RW; return out; };
  const TMP = new Float32Array(9), Q = new Float32Array(3), cols = {};
  const basic = (col, op) => new THREE.MeshBasicMaterial({ color: H.color(col), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending });
  const sphG = new THREE.SphereGeometry(1, 28, 18), coneG = new THREE.ConeGeometry(0.5, 0.8, 4), torG = new THREE.TorusGeometry(1, 0.045, 6, 48);

  function tok(name, fb) { try { return api.win.getComputedStyle(api.doc.documentElement).getPropertyValue(name).trim() || fb; } catch (e) { return fb; } }

  /** Everything built from the net: one hologram node per market, the nebulae, the particle pools, the pair beam. Links are built separately (they change with the threshold and the step). */
  function build(C, net) {
    if (world) { scene.remove(world); kit.forget(world); }
    world = new THREE.Group(); scene.add(world); nodes = []; links = null; linkGen = -1; litKey = '';
    Object.assign(cols, { up: H.color(C.up), dn: H.color(C.dn), q: H.color(C.tx2), w: H.color('white') });
    Object.assign(ccol, { eq: tok('--pur', C.cy), usd: C.cy, cross: C.tx2, met: C.gold, en: tok('--blue2', C.tx) });
    // a faint gyroscope round the cloud: three great circles and a floor of rings, so the depth reads
    const gy = []; for (const ax of [0, 1, 2]) for (let k = 0; k < 120; k++) { const a = k / 120 * Math.PI * 2, b = (k + 1) / 120 * Math.PI * 2, R0 = RW * 1.18, p = [Math.cos(a) * R0, Math.sin(a) * R0], q = [Math.cos(b) * R0, Math.sin(b) * R0];
      gy.push(ax === 0 ? [p[0], 0, p[1], q[0], 0, q[1]] : ax === 1 ? [p[0], p[1], 0, q[0], q[1], 0] : [0, p[0], p[1], 0, q[0], q[1]]); }
    const gyro = kit.segments(gy, C.tx2, 0.045); world.add(gyro);
    world.add(kit.table(RW * 1.1, C.up, -RW * 1.25, 4, 24));
    for (let i = 0; i < net.ids.length; i++) {
      const grp = new THREE.Group(); world.add(grp);
      const core = new THREE.Mesh(sphG, basic(C.tx2, 0.9)), shell = new THREE.Mesh(sphG, kit.holo(C.tx2, { rim: 2.2, base: 0.03, scan: 0.5 })), fl = kit.flare(C.tx2, 1, 0.55);
      const chev = new THREE.Mesh(coneG, basic(C.tx2, 0.95)), cap = new THREE.Mesh(torG, basic(C.tx2, 0.8)), ring = new THREE.Mesh(torG, basic(C.tx, 0.9));
      chev.rotation.y = Math.PI / 4; cap.rotation.x = Math.PI / 2; ring.visible = false;
      [fl, shell, core, chev, cap, ring].forEach(o => grp.add(o));
      nodes.push({ grp, core, shell, fl, chev, cap, ring, tone: '', r: null, dim: 1 });
    }
    // nebulae: motes tied to a member node with a fixed offset, plus one broad soft glow per group
    const groups = CLUSTERS.map(c => ({ c, mem: c.ids.map(k => net.ids.indexOf(k)).filter(i => i >= 0) })).filter(x => x.mem.length >= 2);
    neb = { groups, pts: kit.points(Math.max(1, groups.length * NEB), 'white', g0().compact ? 14 : 22, { colors: true, opacity: 0.9 }), mem: new Int16Array(groups.length * NEB), off: new Float32Array(groups.length * NEB * 3), gi: new Uint8Array(groups.length * NEB), col: groups.map(x => H.color(ccol[x.c.id] ?? C.tx2)) };
    for (let gI = 0; gI < groups.length; gI++) for (let k = 0; k < NEB; k++) {
      const j = gI * NEB + k, h = s => hash(j * 7 + s) * 2 - 1; neb.gi[j] = gI; neb.mem[j] = groups[gI].mem[Math.floor(hash(j * 13 + 5) * groups[gI].mem.length)];
      const rr = 0.12 + 0.3 * Math.abs(h(1)); const v = [h(2), h(3), h(4)], n = Math.hypot(...v) || 1; for (let a = 0; a < 3; a++) neb.off[j * 3 + a] = v[a] / n * rr;
    }
    world.add(neb.pts);
    nebFl = groups.map((x, gI) => { const f = kit.flare(ccol[x.c.id] ?? C.tx2, 1, 0.07); world.add(f); return f; });
    // the pulse pools (head and tail) and the beam the SHOW draws between the pair it names
    pulses = kit.points(MAX_LINKS * 2, 'white', 7, { colors: true }); tails = kit.points(MAX_LINKS * 4, 'white', 3.5, { colors: true }); world.add(pulses); world.add(tails);
    beam = kit.line(Array.from({ length: 21 }, () => Array(3).fill(0)), C.tx, 2.4, 0.9); beam.visible = false; beam.frustumCulled = false; world.add(beam);
    builtFor = net;
  }
  function g0() { return S.g ?? { compact: false }; }

  /** The links as light lines: one LineSegments2 per |r| bucket (width steps with |r|), positions and colours written in place each frame. */
  function buildLinks() {
    if (links) for (const b of links) { world.remove(b.obj); kit.forget(b.obj); }
    links = BUCKETS.map(([lo, hi, w]) => {
      const ix = []; S.links.forEach((l, i) => { const a = Math.abs(l.r); if (a >= lo && a < hi) ix.push(i); });
      if (!ix.length) return null;
      const geo = new L.LineSegmentsGeometry(), n = ix.length * SEG; geo.setPositions(new Float32Array(n * 6)); geo.setColors(new Float32Array(n * 6));
      const mat = new L.LineMaterial({ linewidth: w, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, worldUnits: false });
      mat.resolution.set((H.W || 1280) * (H.dpr || 1), (H.H || 720) * (H.dpr || 1)); kit._mats.add(mat);
      const obj = new L.LineSegments2(geo, mat); obj.frustumCulled = false; world.add(obj);
      return { ix, obj, pos: geo.attributes.instanceStart.data, col: geo.attributes.instanceColorStart.data };
    }).filter(Boolean);
    S.ctrl = new Float32Array(S.links.length * 9);
    linkGen = S.gen; litKey = '';
  }
  // a link's curve: a quadratic bezier from a through a control point bowed outward from the centre (and a little sideways, by the pair), so lines read as arcs, not a hairball
  function ctrlPoints() {
    const c = S.ctrl, L0 = S.links;
    for (let i = 0; i < L0.length; i++) {
      const l = L0[i]; wp(l.a, 0); wp(l.b, 3);
      const mx = (TMP[0] + TMP[3]) / 2, my = (TMP[1] + TMP[4]) / 2, mz = (TMP[2] + TMP[5]) / 2, len = Math.hypot(TMP[3] - TMP[0], TMP[4] - TMP[1], TMP[5] - TMP[2]), bow = 0.16 + 0.12 * hash(l.a * 31 + l.b), side = (hash(l.a * 17 + l.b * 3) - 0.5) * 0.25 * len;
      c[i * 9] = TMP[0]; c[i * 9 + 1] = TMP[1]; c[i * 9 + 2] = TMP[2];
      c[i * 9 + 3] = mx * (1 + bow) + side; c[i * 9 + 4] = my * (1 + bow) + side * 0.6; c[i * 9 + 5] = mz * (1 + bow) - side * 0.4;
      c[i * 9 + 6] = TMP[3]; c[i * 9 + 7] = TMP[4]; c[i * 9 + 8] = TMP[5];
    }
  }
  const bz = (i, u, out = Q) => { const c = S.ctrl, v = 1 - u, A = v * v, B = 2 * v * u, Cc = u * u; for (let k = 0; k < 3; k++) out[k] = A * c[i * 9 + k] + B * c[i * 9 + 3 + k] + Cc * c[i * 9 + 6 + k]; return out; };
  /** The markets linked to the selected one (one Set, reused), or null with no selection. */
  const LINKED = new Set();
  function linkedTo() { if (S.sel < 0) return null; LINKED.clear(); for (const l of S.links) { if (l.a === S.sel) LINKED.add(l.b); else if (l.b === S.sel) LINKED.add(l.a); } return LINKED; }
  const linkOn = l => !S.hl.size || (S.sel >= 0 ? (l.a === S.sel || l.b === S.sel) : (S.hl.has(l.a) && S.hl.has(l.b)));
  const isPair = l => S.pair && S.pair[0] === l.a && S.pair[1] === l.b;

  function writeLinks(recolour) {
    for (const b of links) {
      const P = b.pos.array, Cl = b.col.array;
      for (let q = 0; q < b.ix.length; q++) {
        const i = b.ix[q], l = S.links[i], o = q * SEG * 6;
        for (let s = 0; s < SEG; s++) { bz(i, s / SEG); P[o + s * 6] = Q[0]; P[o + s * 6 + 1] = Q[1]; P[o + s * 6 + 2] = Q[2]; bz(i, (s + 1) / SEG); P[o + s * 6 + 3] = Q[0]; P[o + s * 6 + 4] = Q[1]; P[o + s * 6 + 5] = Q[2]; }
        if (recolour) {
          const ar = Math.abs(l.r), col = l.r >= 0 ? cols.up : cols.dn, lit = linkOn(l), k = (0.22 + 0.78 * ar) * (lit ? (S.hl.size ? 1.25 : 0.8) : 0.06) * (isPair(l) ? 1.4 : 1);
          for (let s = 0; s < SEG; s++) for (const [e, u] of [[0, s / SEG], [3, (s + 1) / SEG]]) { const m = k * (0.55 + 0.45 * Math.sin(Math.PI * u)); Cl[o + s * 6 + e] = col.r * m; Cl[o + s * 6 + e + 1] = col.g * m; Cl[o + s * 6 + e + 2] = col.b * m; }
        }
      }
      b.pos.needsUpdate = true; if (recolour) b.col.needsUpdate = true;
    }
  }

  function camUpdate(st, dt, g, focus) {
    const calm = H.calm, cp = g.compact, userYaw = (st.yaw ?? 0.35) - 0.35, zoom = clamp(st.zoom ?? 1, 0.5, 2.6), show = showing();
    if (!calm && !st.drag && !(S.sel >= 0)) S.base += dt * (show ? 0.05 : 0.07);      // the SHOW turns slowly (26 Nov 2026: it whipped round in the brief)
    const d0 = cp ? 10 : 8.2; let dist = d0 / zoom, el = clamp(0.3 - ((st.pitch ?? -0.45) + 0.45) * 0.8, -0.9, 1.3), tx = 0, ty = 0, tz = 0;
    if (show && focus > 0 && S.hl.size) {
      // fly to the nodes the narration names: centre on them, close in until they fill the view, drop lower for the headline cluster
      let cx = 0, cy = 0, cz = 0; for (const i of S.hl) { wp(i, 0); cx += TMP[0]; cy += TMP[1]; cz += TMP[2]; } cx /= S.hl.size; cy /= S.hl.size; cz /= S.hl.size;
      let sp = 0; for (const i of S.hl) { wp(i, 0); sp = Math.max(sp, Math.hypot(TMP[0] - cx, TMP[1] - cy, TMP[2] - cz)); }
      const f = ease(focus), head = S.act?.act === 'change' || (S.act?.act === 'hi' && !S.acts.some(a => a.act === 'change'));
      const near = clamp(sp * (cp ? 3.4 : 2.5) + (head ? 1.0 : 1.5), head ? 1.5 : 2.2, d0 * 0.85);
      tx = cx * f; ty = cy * f; tz = cz * f; dist = dist + (near - dist) * f; el = el + ((head ? 0.08 : 0.2) - el) * f;
    } else if (S.sel >= 0) { wp(S.sel, 0); tx = TMP[0] * 0.4; ty = TMP[1] * 0.4; tz = TMP[2] * 0.4; dist *= 0.88; }
    const want = { el, dist, tx, ty, tz }, k = 1 - Math.exp(-dt * (calm ? 8 : show ? 0.55 : 1.5));
    if (!S.cam) S.cam = { ...want };
    for (const f of Object.keys(want)) S.cam[f] += (want[f] - S.cam[f]) * k;
    const p = orbitPos(S.base + userYaw, S.cam.el, S.cam.dist, [S.cam.tx, S.cam.ty, S.cam.tz]);
    camera.position.set(p[0], p[1], p[2]); camera.lookAt(S.cam.tx, S.cam.ty, S.cam.tz);
    const fov = cp ? 56 : 42; if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    // phone: lift the cloud into the space above the scrub panel; desktop: shift it left of an open side panel like the other views
    const off = Math.round(g.W / 2 - (g.cx ?? g.W / 2)), offY = cp ? Math.round(g.H * 0.14) : Math.round(g.H * 0.13), ok = `${off}|${offY}|${g.W}|${g.H}`;
    if (ok !== S.off) { S.off = ok; camera.setViewOffset(g.W, g.H, off, offY, g.W, g.H); }
  }

  function update(t, dt, api, g) {
    const st = api.st, net = S.net, C = g.C; S.g = g;
    st.spin = false;
    if (!net || !S.cur || !S.D) { if (world) world.visible = false; camera.position.set(0, 0.01, 6); camera.lookAt(scene.position); return; }
    commands(st, net);
    // the scrub's background work: cache the history's matrices about 3 ms per frame (the shown step first), then find the pair that swung most
    if (S.scan && !S.scan.done) { const t0 = performance.now(); do scanSome(S.scan, 1, S.si); while (!S.scan.done && performance.now() - t0 < 3); }
    if (S.scan?.done && !(S.w in S.swing)) S.swing[S.w] = swingPair(S.scan, net.ids);
    if (S.play) { S.playT += dt; const every = H.calm ? 0.9 : 0.36; if (S.playT >= every) { S.playT = 0; if (S.si >= last()) S.play = false; else goStep(S.si + 1); } }
    // the drawn positions glide toward the shown step's layout (snap under reduced motion)
    const P = S.D, T = S.cur.P, kg = H.calm ? 1 : 1 - Math.exp(-dt * 3.2);
    for (let i = 0; i < P.length; i++) P[i] += (T[i] - P[i]) * kg;
    const ck = [C.up, C.dn, C.gold, C.tx, C.tx2, C.cy].join('|');
    if (builtFor !== net || ck !== colKey || !world) { colKey = ck; build(C, net); }
    world.visible = true;
    if (linkGen !== S.gen) buildLinks();
    const focus = lighting(net);
    camUpdate(st, dt, g, focus);
    // links: curves follow the gliding nodes; colours rewritten when what is lit changes
    ctrlPoints();
    const lk = `${S.gen}|${[...S.hl].join(',')}|${S.sel}|${S.pair}`; writeLinks(lk !== litKey); litKey = lk;
    // nodes
    const n = net.ids.length, kz = 1 - Math.exp(-dt * 4), anyHl = S.hl.size > 0;
    const linked = linkedTo();
    for (let i = 0; i < n; i++) {
      const o = nodes[i], sz = S.sizes[net.ids[i]], tone = !sz ? 'none' : sz.tone, capped = !!sz && sz.ratio >= FULL_AT;
      if (tone !== o.tone) {
        o.tone = tone; const col = H.color(tone === 'up' ? C.up : tone === 'dn' ? C.dn : C.tx2);
        o.core.material.color.copy(col); o.shell.material.uniforms.c.value.copy(col); o.fl.material.color.copy(col); o.chev.material.color.copy(col); o.cap.material.color.copy(col);
        o.chev.visible = tone === 'up' || tone === 'dn'; o.chev.rotation.x = tone === 'dn' ? Math.PI : 0;
      }
      const rT = sz ? nodeRadius(sz.size) : nodeRadius(0) * 0.7; o.r = o.r == null || H.calm ? rT : o.r + (rT - o.r) * kz;
      const on = !anyHl || S.hl.has(i) || (linked && linked.has(i)), dimT = on ? 1 : 0.16; o.dim += (dimT - o.dim) * kz;
      const fl = S.flash?.[i] ?? 0; if (S.flash) S.flash[i] *= Math.exp(-dt * 5);
      const big = (S.hl.has(i) ? 1.3 : 1) * (g.compact ? 1.45 : 1), r = o.r * big * (1 + 0.25 * fl), quiet = tone === 'quiet' || tone === 'none';
      wp(i, 0); o.grp.position.set(TMP[0], TMP[1], TMP[2]);
      o.core.scale.setScalar(r * 0.5); o.core.material.opacity = (quiet ? 0.45 : 0.95) * o.dim;
      o.shell.scale.setScalar(r); o.shell.material.uniforms.op.value = (quiet ? 0.55 : 1) * o.dim;
      o.fl.scale.setScalar(r * (3 + 2.5 * fl)); o.fl.material.opacity = (quiet ? 0.16 : 0.3 + 0.4 * fl) * o.dim;
      o.chev.scale.setScalar(Math.max(0.05, r * 0.55)); o.chev.position.y = (r + Math.max(0.05, r * 0.55) * 0.5 + 0.02) * (tone === 'dn' ? -1 : 1); o.chev.material.opacity = 0.9 * o.dim;
      o.cap.visible = capped; o.cap.scale.setScalar(r * 1.55); o.cap.material.opacity = 0.75 * o.dim;
      o.ring.visible = S.sel === i; if (o.ring.visible) { o.ring.quaternion.copy(camera.quaternion); o.ring.scale.setScalar(r * (1.9 + (H.calm ? 0 : 0.12 * Math.sin(t * 5)))); }
    }
    // signal pulses: a head and two tail motes per pulse; negatively correlated links fire from the other end, as an opposed signal
    const pp = pulses.geometry.attributes.position.array, pc = pulses.geometry.attributes.color.array, tp = tails.geometry.attributes.position.array, tc = tails.geometry.attributes.color.array;
    pc.fill(0); tc.fill(0);
    for (let i = 0; i < S.links.length; i++) {
      const l = S.links[i], ar = Math.abs(l.r), lit = linkOn(l); if (anyHl && !lit) continue;
      const np = ar > 0.8 ? 2 : 1, sped = 0.12 + 0.35 * ar, col = l.r >= 0 ? cols.up : cols.dn, br = (0.5 + 0.5 * ar) * (isPair(l) ? 1.4 : 1);
      for (let q = 0; q < np; q++) {
        const u = H.calm ? (hash(i * 2 + q) + q * 0.5) % 1 : (hash(i * 2 + q) + t * sped * (q ? 0.8 : 1)) % 1, f = l.r >= 0 ? u : 1 - u, j = i * 2 + q;
        bz(i, f); pp[j * 3] = Q[0]; pp[j * 3 + 1] = Q[1]; pp[j * 3 + 2] = Q[2];
        const fade = Math.sin(Math.PI * Math.min(1, u * 1.02)) * 0.6 + 0.4; const kb = br * fade; pc[j * 3] = (col.r * 0.7 + 0.3) * kb; pc[j * 3 + 1] = (col.g * 0.7 + 0.3) * kb; pc[j * 3 + 2] = (col.b * 0.7 + 0.3) * kb;
        for (let tt = 0; tt < 2; tt++) { const uu = Math.max(0, u - 0.025 * (tt + 1)), ff = l.r >= 0 ? uu : 1 - uu, m = j * 2 + tt; bz(i, ff); tp[m * 3] = Q[0]; tp[m * 3 + 1] = Q[1]; tp[m * 3 + 2] = Q[2]; const kk = br * fade * (0.55 - tt * 0.2); tc[m * 3] = col.r * kk; tc[m * 3 + 1] = col.g * kk; tc[m * 3 + 2] = col.b * kk; }
        if (!H.calm && u < dt * sped * 1.5 && S.flash) S.flash[l.r >= 0 ? l.b : l.a] = 1;                 // a pulse has just arrived: the node fires
      }
    }
    pulses.geometry.attributes.position.needsUpdate = pulses.geometry.attributes.color.needsUpdate = true; tails.geometry.attributes.position.needsUpdate = tails.geometry.attributes.color.needsUpdate = true;
    // nebulae follow their members; a group with a lit member glows brighter
    const na = neb.pts.geometry.attributes.position.array, nc = neb.pts.geometry.attributes.color.array, spinN = H.calm ? 0 : t * 0.15;
    neb.groups.forEach((gr, gI) => {
      const lit = anyHl && gr.mem.some(i => S.hl.has(i)), dimG = anyHl ? (lit ? 1.6 : 0.45) : 1, col = neb.col[gI];
      let cx = 0, cy = 0, cz = 0; for (const i of gr.mem) { wp(i, 0); cx += TMP[0]; cy += TMP[1]; cz += TMP[2]; } cx /= gr.mem.length; cy /= gr.mem.length; cz /= gr.mem.length;
      let rad = 0; for (const i of gr.mem) { wp(i, 0); rad = Math.max(rad, Math.hypot(TMP[0] - cx, TMP[1] - cy, TMP[2] - cz)); }
      nebFl[gI].position.set(cx, cy, cz); nebFl[gI].scale.setScalar(rad * 2.2 + 0.6); nebFl[gI].material.opacity = 0.012 * dimG;
      gr.c3 = [cx, cy, cz, rad];
      for (let k = 0; k < NEB; k++) {
        const j = gI * NEB + k, a = spinN * (hash(j) - 0.5) * 2, ca = Math.cos(a), sa = Math.sin(a), ox = neb.off[j * 3], oy = neb.off[j * 3 + 1], oz = neb.off[j * 3 + 2]; wp(neb.mem[j], 0);
        // each mote sits between its member and the group centre, so the cloud wraps the group rather than single nodes
        const bx = TMP[0] * 0.7 + cx * 0.3, by = TMP[1] * 0.7 + cy * 0.3, bzv = TMP[2] * 0.7 + cz * 0.3;
        na[j * 3] = bx + ox * ca - oz * sa; na[j * 3 + 1] = by + oy; na[j * 3 + 2] = bzv + ox * sa + oz * ca;
        const m = (0.012 + 0.016 * hash(j * 3)) * dimG; nc[j * 3] = col.r * m; nc[j * 3 + 1] = col.g * m; nc[j * 3 + 2] = col.b * m;
      }
    });
    neb.pts.geometry.attributes.position.needsUpdate = neb.pts.geometry.attributes.color.needsUpdate = true;
    // the SHOW's pair beam: a bright arc between the two markets the narration names (drawn even when the pair is under the link threshold)
    beam.visible = !!(showing() && S.pair && focus > 0);
    if (beam.visible) {
      const [a, b] = S.pair, r = S.cur.m[a][b]; wp(a, 0); wp(b, 3);
      const mx = (TMP[0] + TMP[3]) / 2, my = (TMP[1] + TMP[4]) / 2, mz = (TMP[2] + TMP[5]) / 2, pts = [];
      for (let s = 0; s <= 20; s++) { const u = s / 20, v = 1 - u, cxp = mx * 1.25, cyp = my * 1.25 + 0.15, czp = mz * 1.25; pts.push([v * v * TMP[0] + 2 * v * u * cxp + u * u * TMP[3], v * v * TMP[1] + 2 * v * u * cyp + u * u * TMP[4], v * v * TMP[2] + 2 * v * u * czp + u * u * TMP[5]]); }
      kit.setLine(beam, pts); beam.material.color.copy(Number.isFinite(r) && r < 0 ? cols.dn : cols.up); beam.material.opacity = 0.9 * focus * (H.calm ? 1 : 0.75 + 0.25 * Math.sin(t * 4));
      S.beamMid = pts[10];
    }
  }

  // ───────── the 2D overlay: names, cluster names, the readout, the card, the scrub panel ─────────
  function overlay(ctx, g, api) {
    const { W, H: Hh, C, fade } = g, cp = g.compact, net = S.net;
    if (g.t - S.hudAt > 1) { S.hudAt = g.t; try { S.hudTop = parseFloat(api.win.getComputedStyle(api.doc.getElementById(api.ID)).getPropertyValue('--jvtop')) || 70; } catch (e) { S.hudTop = 70; } }
    if (g.top > 0) S.hudTop = 62;   // the HUD has shifted this view below its menus (the safe area): lay out as under the plain top bar
    ctx.save(); ctx.textBaseline = 'alphabetic';
    if (!net || !S.cur || !S.D || !world) {
      ctx.globalAlpha = fade; ctx.fillStyle = C.tx2; ctx.font = '13px ui-monospace,monospace'; ctx.textAlign = 'center';
      ctx.fillText(S.ok === false ? 'The correlation feed is not available right now.' : 'Reading the correlations...', W / 2, Hh / 2); ctx.restore(); return;
    }
    const top = S.hudTop + (cp ? 10 : 16), obst = [];
    const panelTop = scrubPanel(ctx, g, net);
    const ro = cp ? readoutCompact(ctx, g, net, top) : readout(ctx, g, net, top); obst.push(ro);
    const card = S.sel >= 0 ? selCard(ctx, g, net, cp ? ro.y + ro.h + 8 : top) : null; if (card) obst.push(card);
    // the r of the pair the SHOW names, at the beam's middle
    if (showing() && S.pair && S.beamMid && beam.visible) {
      const p = H.toScreen(S.beamMid, camera), r = S.cur.m[S.pair[0]][S.pair[1]];
      if (p.vis && Number.isFinite(r)) {
        const s = `${fmt(r)} ${r >= 0.2 ? '▲ together' : r <= -0.2 ? '▼ opposite' : '· near zero'}`; ctx.font = '600 13px ui-monospace,monospace'; const w = ctx.measureText(s).width + 16;
        const bx = clamp(p.x - w / 2, 8, W - w - 8), by = clamp(p.y - 30, top, panelTop - 30); box(ctx, bx, by, w, 22, r >= 0 ? C.up : C.dn, 0.8);
        ctx.globalAlpha = fade; ctx.fillStyle = r >= 0 ? C.up : C.dn; ctx.textAlign = 'center'; ctx.fillText(s, bx + w / 2, by + 15.5); obst.push({ x: bx, y: by, w, h: 22 });
      }
    }
    // node names and cluster names, placed without collisions; the lit ones first, then the big movers and the nearest
    const n = net.ids.length, items = [], scr = S.scr ??= [];
    const linked = linkedTo();
    let phoneSet = null; if (cp) phoneSet = new Set(net.ids.map((id, i) => [i, S.sizes[id]?.size ?? 0]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(a => a[0]));
    for (let i = 0; i < n; i++) {
      const o = nodes[i], p = H.toScreen([o.grp.position.x, o.grp.position.y, o.grp.position.z], camera); scr[i] = p;
      if (!p.vis) continue;
      g.hit('net:' + net.ids[i], p.x, p.y);
      const lit = S.hl.has(i) || S.sel === i, part = linked?.has(i);
      if (cp && !lit && !part && !phoneSet.has(i)) continue;
      if (S.hl.size && !lit && !part && showing()) continue;
      const big = lit || part, sz = S.sizes[net.ids[i]], txt = nameOf(net, net.ids[i]);
      ctx.font = big ? '600 12px ui-monospace,monospace' : '11px ui-monospace,monospace';
      const w = ctx.measureText(txt).width + 8, h = big ? 15 : 13, rpx = Math.max(6, nodes[i].r * 900 / Math.max(1.5, camera.position.distanceTo(nodes[i].grp.position)) * (Hh / 720));
      items.push({ kind: 'n', i, txt, big, x: p.x - w / 2, y: p.y + rpx * 0.6 + 4, w, h, pri: (lit ? 1000 : part ? 500 : 0) + (sz?.size ?? 0) * 10 + (1 - p.z) * 200, z: p.z });
    }
    if (!cp || !S.hl.size) for (const gr of neb.groups) {
      if (!gr.c3) continue; const p = H.toScreen([gr.c3[0], gr.c3[1] + gr.c3[3] + 0.28, gr.c3[2]], camera); if (!p.vis) continue;
      const lab = gr.c.name.toUpperCase(); ctx.font = '600 11px ui-monospace,monospace'; const w = ctx.measureText(lab).width + 10;
      items.push({ kind: 'c', id: gr.c.id, txt: lab, x: p.x - w / 2, y: p.y - 14, w, h: 15, pri: 300 + (gr.mem.some(i => S.hl.has(i)) ? 600 : 0) });
    }
    const ob = obst.map(r => ({ ...r, pri: 1e9, kind: 'x' })), all = ob.concat(items);
    placeLabels(all, { W, H: panelTop - 6, tries: 2, pad: 2 });
    for (const it of items) {
      if (!it.show) continue;
      if (it.kind === 'c') { const gr = neb.groups.find(x => x.c.id === it.id), col = ccol[it.id] ?? C.tx2; ctx.globalAlpha = fade * 0.85; ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.font = '600 11px ui-monospace,monospace'; ctx.fillText(it.txt, it.x + it.w / 2, it.y + 11); void gr; continue; }
      const a = clamp(1.3 - (it.z - 0.9) * 6, 0.35, 1) * (S.hl.size && !it.big ? 0.5 : 1);
      if (it.big) box(ctx, it.x, it.y, it.w, it.h, null, 0.55 * a);
      ctx.globalAlpha = fade * a; ctx.fillStyle = it.big ? C.tx : C.tx2; ctx.textAlign = 'center'; ctx.font = it.big ? '600 12px ui-monospace,monospace' : '11px ui-monospace,monospace'; ctx.fillText(it.txt, it.x + it.w / 2, it.y + it.h - 3);
    }
    ctx.restore();
  }

  /** Top-left: what is drawn, over what window, the encoding, and the link threshold buttons. Returns its box. */
  function readout(ctx, g, net, y0) {
    const { C, fade } = g, lx = 24, cur = S.cur, nl = S.links.length, live = isLive() && S.sizes === S.live;
    const rows = [
      [C.tx2, `${cur.w}-day correlation of daily returns, window ending ${cur.date}.`],
      [C.tx2, `Links shown where |r| >= ${S.thr.toFixed(2)}: ${nl} of ${S.pairs} pairs.`],
      [C.tx2, 'green = moved together   red = moved opposite   thicker, brighter = stronger'],
      [C.tx2, live ? 'node area = today\'s move against its usual (ring = capped at 3x)' : 'node area = that day\'s move against its prior 60-day spread (ring = 3x cap)'],
      [null, ''],
      [C.tx2, `layout keeps the distances${cur.fit != null ? ` (fit ${cur.fit.toFixed(2)})` : ''}; position is only a picture of the matrix.`]];
    ctx.font = '11px ui-monospace,monospace'; const w = Math.max(...rows.map(r => ctx.measureText(r[1]).width)) + 86, h = 30 + rows.length * 15;
    box(ctx, lx - 10, y0 - 16, w, h, null, 0.5);
    ctx.textAlign = 'left'; ctx.globalAlpha = fade; ctx.fillStyle = C.up; ctx.font = '600 13px ui-monospace,monospace'; ctx.fillText('NETWORK  ·  how markets have moved together', lx, y0);
    ctx.font = '11px ui-monospace,monospace';
    rows.forEach(([c, s], i) => { if (!c) return; ctx.globalAlpha = fade * 0.88; ctx.fillStyle = c; ctx.fillText(s, lx, y0 + 18 + i * 15); });
    // the direction cue row
    let x = lx; const yy = y0 + 18 + 4 * 15; ctx.globalAlpha = fade * 0.95;
    for (const [c, s] of [[C.up, '● ▲ up'], [C.dn, '● ▼ down'], [C.tx2, '● quiet (inside half its usual)']]) { ctx.fillStyle = c; ctx.fillText(s, x, yy); x += ctx.measureText(s).width + 16; }
    // threshold buttons, clear of the text on their row
    const by = y0 + 18 + 15 - 12, bx = lx + Math.ceil(ctx.measureText(rows[1][1]).width) + 14;
    ctx.fillStyle = C.up; ctx.globalAlpha = fade * 0.9; ctx.strokeStyle = C.up; ctx.lineWidth = 1;
    for (const [k, xx] of [['-', bx], ['+', bx + 28]]) { ctx.strokeRect(xx + 0.5, by + 0.5, 22, 16); ctx.textAlign = 'center'; ctx.fillText(k, xx + 11, by + 12); g.hit('net:' + k, xx + 11, by + 8); ctx.textAlign = 'left'; }
    return { x: lx - 10, y: y0 - 16, w, h };
  }
  /** Phone: the title, one line of encoding, the link count and 28px threshold buttons. */
  function readoutCompact(ctx, g, net, y0) {
    const { W, C, fade } = g, lx = 12;
    box(ctx, 4, y0 - 15, W - 8, 52, null, 0.5);
    ctx.textAlign = 'left'; ctx.globalAlpha = fade * 0.95; ctx.fillStyle = C.up; ctx.font = '600 12px ui-monospace,monospace'; ctx.fillText('NETWORK · how markets moved together', lx, y0);
    ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = C.tx2; ctx.globalAlpha = fade * 0.85;
    ctx.fillText(`green together · red opposite · |r| >= ${S.thr.toFixed(2)}: ${S.links.length}`, lx, y0 + 16);
    ctx.fillText('area = move vs usual · ▲ up ▼ down · ring = 3x cap', lx, y0 + 30);
    ctx.fillStyle = C.up; ctx.globalAlpha = fade * 0.9; ctx.strokeStyle = C.up; ctx.lineWidth = 1; ctx.font = '14px ui-monospace,monospace';
    for (const [k, x] of [['-', W - 78], ['+', W - 42]]) { ctx.strokeRect(x + 0.5, y0 - 12.5, 30, 28); ctx.textAlign = 'center'; ctx.fillText(k, x + 15, y0 + 6); g.hit('net:' + k, x + 15, y0 + 1); }
    ctx.textAlign = 'left'; ctx.font = '11px ui-monospace,monospace';
    return { x: 4, y: y0 - 15, w: W - 8, h: 52 };
  }
  /** The card for the clicked node: its move on the shown date, then its strongest partners each way. */
  function selCard(ctx, g, net, y) {
    const { W, C, fade } = g, cp = g.compact, id = net.ids[S.sel], sz = S.sizes[id], pt = partners(net.ids, S.cur.m, S.sel, cp ? 2 : 3);
    const w = cp ? W - 8 : 290, x = cp ? 4 : W - w - 20, lines = 4 + pt.pos.length + pt.neg.length + (pt.pos.length ? 0 : 1) + (pt.neg.length ? 0 : 1), h = 34 + lines * 15;
    const col = !sz || sz.tone === 'quiet' ? C.tx2 : sz.tone === 'up' ? C.up : C.dn;
    box(ctx, x, y - 16, w, h, col, 0.82);
    const x0 = x + 12; ctx.textAlign = 'left'; ctx.globalAlpha = fade; ctx.fillStyle = col; ctx.font = '600 14px ui-monospace,monospace';
    ctx.fillText(`${sz?.tone === 'up' ? '▲ ' : sz?.tone === 'dn' ? '▼ ' : ''}${nameOf(net, id)}`, x0, y + 2); ctx.font = '11px ui-monospace,monospace';
    let yy = y + 20; ctx.fillStyle = C.tx2;
    ctx.fillText(sz ? (sz === S.live[id] ? `today ${sz.move >= 0 ? '+' : ''}${sz.move.toFixed(2)}%, ${sz.ratio.toFixed(1)}x its usual move` : `${S.cur.date} ${sz.move >= 0 ? '+' : ''}${sz.move.toFixed(2)}%, ${sz.ratio.toFixed(1)}x its 60-day spread`) + (sz.ratio >= FULL_AT ? ' (capped)' : '') : `no move reading on ${S.cur.date}`, x0, yy, w - 24); yy += 20;
    const col2 = cp ? w - 70 : 200;
    ctx.fillStyle = C.up; ctx.fillText('MOVED TOGETHER WITH', x0, yy); yy += 15;
    for (const p of pt.pos) { ctx.fillStyle = C.tx; ctx.fillText(nameOf(net, p.k), x0 + 6, yy); ctx.fillStyle = C.up; ctx.fillText(fmt(p.r), x0 + col2, yy); yy += 15; }
    if (!pt.pos.length) { ctx.fillStyle = C.tx2; ctx.fillText('none positive', x0 + 6, yy); yy += 15; }
    yy += 4; ctx.fillStyle = C.dn; ctx.fillText('MOVED OPPOSITE TO', x0, yy); yy += 15;
    for (const p of pt.neg) { ctx.fillStyle = C.tx; ctx.fillText(nameOf(net, p.k), x0 + 6, yy); ctx.fillStyle = C.dn; ctx.fillText(fmt(p.r), x0 + col2, yy); yy += 15; }
    if (!pt.neg.length) { ctx.fillStyle = C.tx2; ctx.fillText('none negative', x0 + 6, yy); }
    return { x, y: y - 16, w, h };
  }
  function box(ctx, x, y, w, h, edge, a) {
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = S.bg || 'black'; ctx.fillRect(x, y, w, h);
    if (edge) { ctx.globalAlpha = Math.min(1, ctx.globalAlpha * 1.2); ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
    ctx.restore();
  }

  return {
    scene, camera, update, overlay, bloom: { strength: 0.75, radius: 0.4, threshold: 0.18 },
    dispose() { if (world) { scene.remove(world); kit.forget(world); } world = null; nodes = []; links = null; builtFor = null; },
  };
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
  if (showing() && net.change) return { i: net.ids.indexOf(net.change.a), j: net.ids.indexOf(net.change.b), why: 'biggest change over the last 3 months' };
  if (S.sel >= 0) {
    let best = -1, br = 0; const row = S.cur.m[S.sel];
    for (let j = 0; j < row.length; j++) if (j !== S.sel && Number.isFinite(row[j]) && Math.abs(row[j]) > br) { br = Math.abs(row[j]); best = j; }
    if (best >= 0) return { i: S.sel, j: best, why: 'the selected market and its strongest partner on the shown date' };
  }
  const sw = S.swing[S.w]; return sw ? { i: sw.i, j: sw.j, why: `the pair whose correlation swung most over these ${Math.round(net.dates.length / 252)} years` } : null;
}

/** Bottom panel: play / step / now, window length, the date, and the strip of one pair's correlation through time (click it to jump). Returns the panel's top y. */
function scrubPanel(ctx, g, net) {
  const { W, H, C, fade } = g, cp = g.compact, sc = S.scan;
  // laid out from the bottom up, clear of the HUD's own bottom bar (84 px on desktop, 74 on the phone)
  const x0 = cp ? 10 : 24, x1 = W - (cp ? 10 : 24), bh = cp ? 30 : 22, bot = H - (cp ? 80 : 90), keyY = cp ? bot - 34 : bot - 8, sh = cp ? 50 : 54;
  const sy0 = keyY - (cp ? 36 : 30) - sh, top = sy0 - (cp ? 72 : 44);
  if (!sc || !sc.steps.length) return H;
  ctx.save();
  ctx.globalAlpha = fade * 0.62; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x0 - 6, top - 8, x1 - x0 + 12, bot - top + 8);
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
  ctx.restore();
  return top - 10;
}

registerShowScene({
  id: 'net', after: 'lean',
  prepare: api => load(api).then(n => (n ? { ok: true } : null)).catch(() => null),
  build: (inp, data) => {
    const net = S.net; if (!data || !net) return null; const guide = netScript(net), ch = net.change;
    // the brief reads the day: the morning reads yesterday's full session (today has barely started), later in the day today's moves so far
    const hr = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hourCycle: 'h23' }).format(inp?.now ?? new Date()));
    const live = Object.keys(S.live ?? {}).length >= 6, yday = hr < 12 || !live, end = yday ? net.dates.findLastIndex(d => d < new Date(inp?.now ?? Date.now()).toISOString().slice(0, 10)) : -1;
    const moves = yday ? (end > 0 ? dayMoves(net.R, net.ids, end) : {}) : S.live, brief = netBriefParts(net, moves, yday ? 'yesterday' : 'today');
    const parts = inp?.guide ? netScriptParts(net) : brief, text = parts?.map(x => x.text).join(' ');
    return text ? { sync: true, guide,
      title: 'The correlation network', figure: inp?.guide ? (ch && Math.abs(ch.delta) >= 0.15 ? { value: `${fmt(ch.then)} → ${fmt(ch.now)}`, label: `${nameOf(net, ch.a)} vs ${nameOf(net, ch.b)}, 3 months` } : undefined) : (netBriefFigure(net, moves, yday ? 'yesterday' : 'today', k => nameOf(net, k)) ?? undefined), view: 'net', cam: null, text,
      enter: api => { S.showP = 0; S.showAt = Date.now(); S.play = false; S.cam = null; S.acts = showActs(net, parts); if (S.w !== net.window) setW(net.window); goStep(last()); if (api?.st) { api.st.sel = null; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); } },
      motion: (api, p) => { S.showP = clamp(p, 0, 1); S.showAt = Date.now(); },
    } : null;
  },
});
