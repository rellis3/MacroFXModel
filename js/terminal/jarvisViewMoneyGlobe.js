// js/terminal/jarvisViewMoneyGlobe.js: Jarvis's MONEY GLOBE. A translucent hologram Earth (real coastlines from js/terminal/jarvisLand.js, the same Natural Earth outline the WORLD MAP globe draws)
// turning slowly in the dark, with three layers picked by buttons:
//   RATES (default)  every central bank in the BIS policy-rate set (about 39) is a light pillar rising from its country; the euro area is one pillar at the ECB in Frankfurt and its 20 members glow
//                    faintly in its colour.
//   BANK CREDIT      BIS Locational Banking Statistics (quarterly, about four months late). The BIS publishes these as TOTALS, by lender-bank nationality and by borrower country, and NOT as a
//                    lender -> borrower matrix, so nothing is drawn country to country: arcs rise from each lender nation to a glowing "global dollar pool" ring above the globe, and arcs descend
//                    from the pool to each borrower. The key says so in words.
//   RATE GAPS        arcs from the lowest-rate funding currencies to the highest-rate liquid ones: where the rate gap pays to move money. An incentive, not a measured flow.
//
// ENCODING
//   pillar height  = the policy rate, ONE shared linear scale 0..20 % (moneyGlobeCore.RATE_CAP); a rate above 20 % stops at the top and wears a crown of rings + the label ">20% capped"
//   pillar colour  = hiked (up colour, chevron up) / cut (down colour, chevron down) / unchanged (grey, no chevron) over 3 months, the +-0.2 pp rule of js/worldRates.js; stale banks are dim
//   base ring      = AREA proportional to the 12-month change (0..4 pp, capped and doubled above); solid ring = rose, dashed ring = fell
//   lender arc     = width linear in that nation's banks' cross-border USD claims (BIS has stocks only for lenders); particles run up to the pool, or back down in the down colour when the
//                    claims have shrunk over five years
//   borrower arc   = width linear in |cross-border USD credit flow over the last 4 quarters|; inflow = up colour, particles flow DOWN into the country; outflow = down colour, particles flow back UP
//   rate-gap arc   = gold, width linear in the policy-rate gap in pp (0..15, capped and marked above); particle count grows with the gap; particles run funder -> high-rate end, arrowhead at that end
// Camera: slow auto-rotate (off under reduced motion), drag and zoom through the HUD's st.yaw / st.pitch / st.zoom, region buttons (WORLD, AMERICAS, EUROPE, ASIA, MIDEAST-AFRICA) turn the globe.
// Click a pillar, lender or borrower: a card with the numbers. SHOW scene 'moneyglobe' (after 'reactor'): the camera visits each notable country while Jarvis reads the counts and the BIS pace.
// Data: /api/world-rates (js/worldRates.js worldRates()) and /api/bank-credit (js/bankCredit.js buildBankCredit(): headline, parents, usdBorrowers). /api/fx-carry is NOT used: it is a long
// back-test needing OANDA + FRED keys with no per-currency carry-to-vol, so it cannot dim the gap arcs cleanly. Shaping, scales, labels, cards and the script live in moneyGlobeCore.js (tested).
// DESCRIPTION ONLY: levels and changes as published. Nothing here is a forecast, a signal or a trade.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { glView, orbitPos } from './jarvisGL.js';
import { holoGlobeParts } from './jarvisGlobeHolo.js';
import { EURO_PLACES, REGIONS, REGION_LABEL, REGION_SHORT, RATE_CAP, GAP_CAP, RING_MAX, POOL_Y, POOL_R, ratesModel, creditModel, gapsModel, rateLabels, placeLabels, cardFor, moneyScript, moneyFigure,
  showStops, stopAt, llVec, poolArc, bez, gapArc, facing, angDiff, pct, pp, sbn, bn, sg } from './moneyGlobeCore.js';

const KEY_ALL = 'pillars = policy rates · arcs = BIS cross-border bank credit (totals) or rate gaps (incentive) · description only, not a forecast';
const KEY_CREDIT = 'lenders and borrowers are totals; the BIS does not publish who lends to whom here';
const KEY_GAPS = 'where the rate gap pays to move money: an incentive, not a measured flow';
const LAYERS = [['rates', 'RATES'], ['credit', 'BANK CREDIT'], ['gaps', 'RATE GAPS']];
const NS = 28;                 // samples per pool arc
const TTL = 10 * 60 * 1000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const S = {
  raw: { rates: null, credit: null }, rates: null, credit: null, gaps: null, at: 0, busy: null, ver: 0, layer: 'rates', region: 'world', selKey: null, base: 0.26, el: 0.38, cam: null, goYaw: null, goEl: null, goZoom: 1,
  spin: null, showP: -1, showAt: 0, stops: [], bg: 'black', hudTop: 70, hudAt: -9, colKey: '', builtVer: -1, off: 0, land: null,
};
const showing = () => S.showP >= 0 && Date.now() - S.showAt < 1500;

/** Read both feeds (kept ten minutes). A failed read is kept as a model with ok:false and a reason in words. */
export function loadMoney(api, force) {
  if (S.busy) return S.busy;
  if (S.rates && S.credit && !force && Date.now() - S.at < TTL) return Promise.resolve(S);
  S.busy = (async () => {
    const get = u => Promise.resolve().then(() => api.jf(u)).catch(e => ({ ok: false, error: String(e?.message ?? e) }));
    const [r, c] = await Promise.all([get('/api/world-rates'), get('/api/bank-credit')]);
    S.raw = { rates: r, credit: c }; S.rates = ratesModel(r); S.credit = creditModel(c); S.gaps = gapsModel(S.rates); S.stops = showStops(S.rates, S.credit);
    S.at = Date.now(); S.ver++; S.busy = null; return S;
  })();
  return S.busy;
}
const selParts = () => { const m = /^(b|l|r):(.+)$/.exec(S.selKey ?? ''); return m ? { kind: m[1] === 'b' ? 'bank' : m[1] === 'l' ? 'lender' : 'borrower', code: m[2] } : null; };
function turnTo(lat, lon, zoom) { const f = facing(lat, lon); S.goYaw = f.yaw; S.goEl = f.el; if (zoom != null) S.goZoom = zoom; }
const userReset = st => { S.base += (st.yaw ?? 0.35) - 0.35; st.yaw = 0.35; st.pitch = -0.45; st.zoom = 1; };

/** Buttons (g.hit keys 'mg:...') and picks arrive through st.sel. */
function commands(api) {
  const st = api.st, s = st.sel;
  if (S.selKey && s === 'mg:' + S.selKey) return;
  if (typeof s === 'string' && s.startsWith('mg:')) {
    const c = s.slice(3);
    if (c.startsWith('layer:')) { S.layer = c.slice(6); S.selKey = null; }
    else if (c.startsWith('reg:')) { const r = c.slice(4); if (REGIONS[r]) { S.region = r; const [la, lo, z] = REGIONS[r]; userReset(st); turnTo(la, lo, z); } }
    else if (c === 'close') S.selKey = null;
    else if (/^(b|l|r):/.test(c)) { S.selKey = c; const p = selParts(), o = p && placeOf(p); if (o) turnTo(o.lat, o.lon, null); }
    st.sel = S.selKey ? 'mg:' + S.selKey : null; api.blip?.(760, 0.05); return;
  }
  if (s == null && S.selKey) S.selKey = null;
}
function placeOf(p) {
  if (p.kind === 'bank') return S.rates?.by?.[p.code] ?? null;
  if (p.kind === 'lender') return S.credit?.lenders?.find(x => x.code === p.code) ?? null;
  return S.credit?.borrowers?.find(x => x.code === p.code) ?? null;
}

registerJarvisModule({
  id: 'moneyglobe', label: 'MONEY GLOBE',
  render(pane, api) {
    pane.innerHTML = `<h3>MONEY GLOBE</h3><p>A hologram Earth with three layers. RATES: every central bank in the BIS policy-rate set is a light pillar as tall as its policy rate (one scale, 0 to 20%, higher rates marked capped), green when it hiked over three months, red when it cut, grey when unchanged, with a ring at the base sized by the 12-month change. BANK CREDIT: the BIS cross-border bank statistics, drawn as totals: lender nations' banks feed a global dollar pool and the pool feeds each borrower, because the BIS does not publish who lends to whom. RATE GAPS: gold arcs from the cheapest funding currencies to the highest-rate ones, an incentive rather than a measured flow.</p><p class="jv-sub">A description of published rates and BIS statistics. Not a forecast and not a signal.</p><div class="jv-row"><button type="button" data-r="go">OPEN THE GLOBE</button><button type="button" data-r="credit">SHOW BANK CREDIT</button></div>`;
    pane.querySelector('[data-r="go"]').onclick = () => { S.layer = 'rates'; api.setView('moneyglobe'); };
    pane.querySelector('[data-r="credit"]').onclick = () => { S.layer = 'credit'; api.setView('moneyglobe'); };
  },
  views: [glView({
    id: 'moneyglobe', label: 'MONEY GLOBE', env: { accent: 'blue2', chrome: 'clean', scan: false },
    onEnter(api) {
      S.spin = api.st.spin; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); S.cam = null; S.goZoom = REGIONS[S.region]?.[2] ?? 1;
      try { S.bg = api.win.getComputedStyle(api.doc.documentElement).getPropertyValue('--bg1').trim() || 'black'; } catch (e) { S.bg = 'black'; }
      loadMoney(api).catch(() => null);
    },
    onLeave(api) { S.showP = -1; if (S.spin != null) api.st.spin = S.spin; S.spin = null; },
    setup,
  })],
});

async function setup(L, H, api) {
  const { THREE } = L, kit = H.kit, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.05, 200);
  if (!S.land) { try { S.land = (await import('./jarvisLand.js')).LAND; } catch (e) { S.land = []; } }
  scene.add(kit.dust(1400, 36));
  let globe = null, layers = null;
  const UP = new THREE.Vector3(0, 1, 0), tv = new THREE.Vector3(), cp = new THREE.Vector3();
  const basic = (col, op) => new THREE.MeshBasicMaterial({ color: H.color(col), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending });
  function dispose(o) { o?.traverse?.(x => { x.geometry?.dispose?.(); const m = x.material; if (m) (Array.isArray(m) ? m : [m]).forEach(mm => { if (mm !== kit.dot()) { kit._mats.delete(mm); kit._holo.delete(mm); mm.dispose?.(); } }); }); }
  const circle = (r, n, y = 0) => { const p = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; p.push([Math.cos(a) * r, y, Math.sin(a) * r]); } return p; };

  // ── the globe itself: an occluding core, the hologram shell, an atmosphere rim, coastlines (front bright, back a ghost), a faint graticule, a tilted orbit ring ──
  function buildGlobe(C) {
    if (globe) { scene.remove(globe); dispose(globe); }
    globe = new THREE.Group(); scene.add(globe);
    const parts = holoGlobeParts(L, H, C, S.land, { bg: S.bg });          // the shared Earth (jarvisGlobeHolo.js): the WORLD MAP globe is built from the same parts
    globe.add(parts.sphere); globe.add(parts.orbit); globe.add(parts.floor);
    const orbit = parts.orbit, glint = parts.glint; orbit.rotation.x = 0.42; orbit.rotation.z = -0.18; globe.userData = { orbit, glint };
  }
  const place = (grp, lat, lon, r = 1.0) => { const v = llVec(lat, lon, r); grp.position.set(v[0], v[1], v[2]); tv.set(v[0], v[1], v[2]).normalize(); grp.quaternion.setFromUnitVectors(UP, tv); };
  const toneCol = (C, t) => (t === 'up' ? C.up : t === 'dn' ? C.dn : C.tx2);

  // ── the three layers ──
  function buildLayers(C) {
    if (layers) { for (const g of Object.values(layers.groups)) { scene.remove(g); dispose(g); } }
    const groups = { rates: new THREE.Group(), credit: new THREE.Group(), gaps: new THREE.Group() };
    for (const g of Object.values(groups)) scene.add(g);
    const out = { groups, pillars: {}, pools: [], partPool: null, gapArcs: [], partGap: null, poolFx: null };
    const boxG = new THREE.BoxGeometry(...Array(3).fill(1)).translate(0, 0.5, 0), coneG = new THREE.ConeGeometry(0.022, 0.04, 4), torG = new THREE.TorusGeometry(0.026, 0.0035, 6, 24);
    // RATES
    const rm = S.rates;
    if (rm?.ok) {
      for (const b of rm.banks) {
        const grp = new THREE.Group(); place(grp, b.lat, b.lon); groups.rates.add(grp);
        const col = toneCol(C, b.tone), dim = b.stale ? 0.35 : 1, mats = [];
        const add = (m, op) => { grp.add(m); mats.push([m.material, op]); return m; };
        const cOp = (b.tone === 'up' || b.tone === 'dn' ? 0.8 : 0.42) * dim, core = add(new THREE.Mesh(boxG, basic(col, cOp)), cOp); core.scale.set(0.009, b.h, 0.009);
        const glow = add(new THREE.Mesh(boxG, basic(col, cOp * 0.1)), cOp * 0.1); glow.scale.set(0.03, b.h, 0.03);
        const tip = kit.flare(col, 0.07, cOp); tip.position.y = b.h; add(tip, cOp);
        const foot = kit.flare(col, 0.05, 0.6 * dim); foot.position.y = 0.004; add(foot, 0.6 * dim);
        if (b.tone === 'up' || b.tone === 'dn') { const ch = add(new THREE.Mesh(coneG, basic(col, 0.95 * dim)), 0.95 * dim); ch.position.y = b.h + 0.035; ch.rotation.y = Math.PI / 4; if (b.tone === 'dn') ch.rotation.x = Math.PI; }
        if (b.capped) for (const dy of [0, -0.025, -0.05]) { const t = add(new THREE.Mesh(torG, basic(col, 0.9)), 0.9); t.rotation.x = Math.PI / 2; t.position.y = b.h + dy; t.scale.setScalar(1 - dy * 6); }
        if (b.ring > 0) {   // ring AREA = |12m change|; solid = rose, dashed = fell; a doubled ring = capped
          const rc = b.ringSign > 0 ? C.up : C.dn, n = 48, segs = [];
          for (const rr of b.ringCapped ? [b.ring, b.ring * 1.12] : [b.ring]) for (let i = 0; i < n; i++) { if (b.ringSign < 0 && i % 2) continue; const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2; segs.push([Math.cos(a0) * rr, 0.006, Math.sin(a0) * rr, Math.cos(a1) * rr, 0.006, Math.sin(a1) * rr]); }
          const ring = kit.segments(segs, rc, 0.75 * dim); grp.add(ring); mats.push([ring.material, 0.75 * dim]);
        }
        out.pillars[b.area] = { grp, mats, b, base: llVec(b.lat, b.lon), vis: -1 };
      }
      if (rm.euro) {   // the euro members, faintly in the ECB's colour, threaded to Frankfurt
        const col = toneCol(C, rm.euro.tone), threads = [], fr = llVec(rm.euro.lat, rm.euro.lon, 1.004);
        for (const [la, lo] of Object.values(EURO_PLACES)) { const f = kit.flare(col, 0.05, 0.35); const v = llVec(la, lo, 1.006); f.position.set(v[0], v[1], v[2]); groups.rates.add(f); threads.push([...v, ...fr]); }
        groups.rates.add(kit.segments(threads, col, 0.14));
      }
    }
    // BANK CREDIT: the pool, lender fountains, borrower fountains, particles
    const cm = S.credit;
    if (cm?.ok) {
      const poolCol = C.cy;
      groups.credit.add(kit.line(circle(POOL_R, 128, POOL_Y), poolCol, 3, 0.9));
      groups.credit.add(kit.line(circle(POOL_R * 1.06, 128, POOL_Y), poolCol, 1, 0.3));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(POOL_R * 1.25, 96), kit.glowDisc(poolCol, 0.4)); disc.rotation.x = -Math.PI / 2; disc.position.y = POOL_Y; groups.credit.add(disc);
      const pf = kit.flare(poolCol, 0.5, 0.5); pf.position.y = POOL_Y; groups.credit.add(pf); out.poolFx = pf;
      const spokes = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; spokes.push([Math.cos(a) * POOL_R * 0.25, POOL_Y, Math.sin(a) * POOL_R * 0.25, Math.cos(a) * POOL_R * 0.96, POOL_Y, Math.sin(a) * POOL_R * 0.96]); }
      groups.credit.add(kit.segments(spokes, poolCol, 0.18));
      let np = 0;
      const mk = (kind, x) => {
        const dlon = kind === 'lender' ? -7 : 7, arc = poolArc(x.lat, x.lon + 0), pts = [];
        const b = arc.b, o = (x.lon + dlon) * Math.PI / 180; b[0] = POOL_R * Math.sin(o); b[2] = POOL_R * Math.cos(o);
        if (kind === 'borrower') { arc.c[0] *= 0.9; arc.c[2] *= 0.9; arc.c[1] += 0.12; }
        for (let i = 0; i <= NS; i++) pts.push(bez(arc.a, arc.c, b, i / NS));
        const col = kind === 'lender' ? (x.dir === 'back' ? C.dn : C.blue) : x.dir === 'out' ? C.dn : x.dir === 'in' ? C.up : C.tx2;
        const line = kit.line(pts, col, x.w, 0.5), glow = kit.line(pts, col, x.w * 2.2, 0.045); groups.credit.add(line); groups.credit.add(glow);
        const foot = kit.flare(col, 0.06 + 0.1 * Math.sqrt(x.share ?? 0), 0.85); foot.position.set(arc.a[0], arc.a[1], arc.a[2]); groups.credit.add(foot);
        const n = Math.max(2, Math.round(3 + 12 * (x.share ?? 0)));
        // particles: lender 'out' and borrower 'out' run surface -> pool (u up); lender 'back' and borrower 'in' run pool -> surface
        const upward = (kind === 'lender' && x.dir !== 'back') || (kind === 'borrower' && x.dir === 'out');
        const rec = { kind, code: x.code, x, pts, line, glow, foot, col: H.color(col), p0: np, n, upward, seed: (x.code.charCodeAt(0) * 0.137 + x.code.charCodeAt(1) * 0.071) % 1, still: x.dir === 'none' };
        np += n; out.pools.push(rec);
      };
      for (const l of cm.lenders) mk('lender', l);
      for (const b of cm.borrowers) mk('borrower', b);
      out.partPool = kit.points(Math.max(1, np), 'white', 4.5, { colors: true }); groups.credit.add(out.partPool);
    }
    // RATE GAPS
    const gm = S.gaps;
    if (gm?.ok) {
      const gold = C.gold; let np = 0;
      for (const a of gm.arcs) {
        const f = rm.by[a.from], t = rm.by[a.to], pts = gapArc(f.lat, f.lon, t.lat, t.lon, 48, 0.36);
        const line = kit.line(pts, gold, a.w, 0.3), glow = kit.line(pts, gold, a.w * 2.4, 0.03); glow.visible = false; groups.gaps.add(line); groups.gaps.add(glow);
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.018 + 0.004 * a.w, 0.06, 6), basic(gold, 0.9)), e = pts.at(-1), e0 = pts.at(-4);
        head.position.set(e[0], e[1], e[2]); tv.set(e[0] - e0[0], e[1] - e0[1], e[2] - e0[2]).normalize(); head.quaternion.setFromUnitVectors(UP, tv); groups.gaps.add(head);
        out.gapArcs.push({ a, pts, line, glow, head, p0: np, n: a.np, seed: (a.gap * 0.173) % 1 }); np += a.np;
      }
      for (const f of gm.funders) { const fl = kit.flare(C.cy, 0.16, 0.9), v = llVec(f.lat, f.lon, 1.01); fl.position.set(v[0], v[1], v[2]); groups.gaps.add(fl); }
      for (const t of gm.targets) { const fl = kit.flare(gold, 0.13, 0.8), v = llVec(t.lat, t.lon, 1.01); fl.position.set(v[0], v[1], v[2]); groups.gaps.add(fl); }
      out.partGap = kit.points(Math.max(1, np), 'white', 4, { colors: true }); groups.gaps.add(out.partGap); out.goldCol = H.color(gold);
    }
    layers = out;
  }

  // ── camera ──
  function camUpdate(st, dt, g) {
    const calm = H.calm, cpct = g.compact, userYaw = (st.yaw ?? 0.35) - 0.35, zoom = clamp(st.zoom ?? 1, 0.45, 3.5);
    const k = 1 - Math.exp(-dt * (calm ? 6 : 1.6));
    if (S.goYaw != null) { const d = angDiff(S.base + userYaw, S.goYaw); S.base += d * k; if (Math.abs(d) < 0.01) S.goYaw = null; }
    else if (!calm && !st.drag && !S.selKey && S.region === 'world' && !showing()) S.base += dt * 0.07;
    if (S.goEl != null) { S.el += (S.goEl - S.el) * k; if (Math.abs(S.goEl - S.el) < 0.005) S.goEl = null; }
    const credit = S.layer === 'credit', el = clamp((credit ? clamp(S.el * 0.6, -0.25, 0.32) + 0.12 : S.el * 0.85) - ((st.pitch ?? -0.45) + 0.45) * 0.8, -1.2, 1.3);   // the pool layer keeps a low camera so the pool stays in view
    const want = { el, dist: (cpct ? 6.2 : 4.9) * (credit ? 1.3 : 1) / (zoom * (credit ? Math.min(1.05, S.goZoom) : S.goZoom)), ty: credit ? 0.5 : 0.12 };
    if (!S.cam) S.cam = { ...want };
    for (const f of Object.keys(want)) S.cam[f] += (want[f] - S.cam[f]) * k;
    const p = orbitPos(S.base + userYaw, S.cam.el, S.cam.dist, [0, S.cam.ty, 0]);
    camera.position.set(p[0], p[1], p[2]); camera.lookAt(0, S.cam.ty, 0);
    const fov = cpct ? 50 : 38; if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const off = Math.round(g.W / 2 - (g.cx ?? g.W / 2));
    if (off !== S.off) { S.off = off; if (off) camera.setViewOffset(g.W, g.H, off, 0, g.W, g.H); else camera.clearViewOffset(); }
  }

  function update(t, dt, api, g) {
    const st = api.st, C = g.C, ck = [C.blue, C.up, C.dn, C.gold, C.tx, C.tx2, C.cy, S.bg].join('|');
    if (!S.rates && !S.busy) loadMoney(api).catch(() => null);
    if (ck !== S.colKey || !globe) { S.colKey = ck; buildGlobe(C); S.builtVer = -1; }
    if (S.builtVer !== S.ver) { S.builtVer = S.ver; buildLayers(C); }
    commands(api);
    // SHOW: the narration visits each notable country in turn
    if (showing() && S.stops.length) { const s = S.stops[stopAt(S.stops.length, S.showP)]; if (s) { if (S.layer !== s.layer) S.layer = s.layer; S.selKey = `${s.kind === 'bank' ? 'b' : 'r'}:${s.code}`; turnTo(s.lat, s.lon, 1.25); } }
    camUpdate(st, dt, g);
    if (globe) { const u = globe.userData; if (!H.calm) { u.orbit.rotation.y = t * 0.05; const a = t * 0.35; u.glint.position.set(Math.cos(a) * 1.42, 0, Math.sin(a) * 1.42); } }
    const L = layers; if (!L) return;
    for (const [k, grp] of Object.entries(L.groups)) grp.visible = k === S.layer;
    const sp = selParts(), calm = H.calm;
    if (S.layer === 'rates') {   // the selection dims the rest; pillars on the far side of the globe fade so the near hemisphere reads first
      for (const [a, o] of Object.entries(L.pillars)) {
        const f = front(o.base), vis = Math.round(clamp(0.25 + f * 1.5, 0.25, 1) * 20) / 20 * (sp?.kind === 'bank' && sp.code !== a ? 0.35 : 1);
        if (vis !== o.vis) { o.vis = vis; for (const [m, op] of o.mats) m.opacity = op * vis; }
      }
    }
    if (S.layer === 'credit' && L.partPool) {
      const pos = L.partPool.geometry.attributes.position.array, col = L.partPool.geometry.attributes.color.array;
      for (const r of L.pools) {
        const on = !sp || sp.kind === 'bank' || (sp.code === r.code && ((sp.kind === 'lender') === (r.kind === 'lender'))), dim = on ? 1 : 0.18;
        r.line.material.opacity = 0.5 * dim; r.glow.material.opacity = 0.045 * dim; r.foot.material.opacity = 0.85 * dim;
        for (let j = 0; j < r.n; j++) {
          let u = ((calm ? 0.5 : t * 0.16) + j / r.n + r.seed) % 1; if (!r.upward) u = 1 - u;
          const f = u * NS, i0 = Math.min(NS - 1, Math.floor(f)), w = f - i0, a = r.pts[i0], b = r.pts[i0 + 1], ix = (r.p0 + j) * 3;
          pos[ix] = a[0] + (b[0] - a[0]) * w; pos[ix + 1] = a[1] + (b[1] - a[1]) * w; pos[ix + 2] = a[2] + (b[2] - a[2]) * w;
          const br = r.still ? 0 : dim * (0.3 + 0.6 * Math.sin(Math.PI * u));
          col[ix] = r.col.r * br; col[ix + 1] = r.col.g * br; col[ix + 2] = r.col.b * br;
        }
      }
      L.partPool.geometry.attributes.position.needsUpdate = true; L.partPool.geometry.attributes.color.needsUpdate = true;
      if (L.poolFx) L.poolFx.material.opacity = calm ? 0.5 : 0.4 + 0.15 * Math.sin(t * 1.3);
    }
    if (S.layer === 'gaps' && L.partGap) {
      const pos = L.partGap.geometry.attributes.position.array, col = L.partGap.geometry.attributes.color.array, gc = L.goldCol, N = 48;
      for (const r of L.gapArcs) {
        const on = !sp || sp.kind !== 'bank' || sp.code === r.a.from || sp.code === r.a.to, dim = on ? 1 : 0.15;
        r.line.material.opacity = 0.3 * dim; r.glow.visible = !!sp && dim === 1; r.glow.material.opacity = 0.05; r.head.material.opacity = 0.9 * dim;
        for (let j = 0; j < r.n; j++) {
          const u = ((calm ? 0.5 : t * 0.12) + j / r.n + r.seed) % 1, f = u * N, i0 = Math.min(N - 1, Math.floor(f)), w = f - i0, a = r.pts[i0], b = r.pts[i0 + 1], ix = (r.p0 + j) * 3;
          pos[ix] = a[0] + (b[0] - a[0]) * w; pos[ix + 1] = a[1] + (b[1] - a[1]) * w; pos[ix + 2] = a[2] + (b[2] - a[2]) * w;
          const br = dim * (0.25 + 0.6 * u); col[ix] = gc.r * br; col[ix + 1] = gc.g * br; col[ix + 2] = gc.b * br;
        }
      }
      L.partGap.geometry.attributes.position.needsUpdate = true; L.partGap.geometry.attributes.color.needsUpdate = true;
    }
  }

  // ── the 2D overlay: buttons, readout, labels, card, key ──
  const VEC = new Map(), vc = (lat, lon, r = 1) => { const k = `${lat}|${lon}|${r}`; let v = VEC.get(k); if (!v) { v = llVec(lat, lon, r); VEC.set(k, v); } return v; };   // overlay vectors, made once
  /** How squarely a surface point faces the camera (cosine; below 0 it is behind the globe). */
  const front = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; cp.copy(camera.position).sub(tv.set(v[0], v[1], v[2])).normalize(); return (v[0] * cp.x + v[1] * cp.y + v[2] * cp.z) / l; };
  function overlay(ctx, g, api) {
    const { W, H: Hh, C, fade } = g, cpct = g.compact;
    if (g.t - S.hudAt > 1) { S.hudAt = g.t; try { S.hudTop = parseFloat(api.win.getComputedStyle(api.doc.getElementById(api.ID)).getPropertyValue('--jvtop')) || 70; } catch (e) { S.hudTop = 70; } }
    ctx.save(); ctx.globalAlpha = fade; ctx.textBaseline = 'alphabetic';
    const top = S.hudTop + 8, obst = [], keyH = (cpct ? 104 : 50) + (S.layer === 'rates' ? 0 : cpct ? 28 : 14), keyY = Hh - keyH;
    // layer buttons, then region buttons
    ctx.font = '600 12px ui-monospace,monospace';
    const bh = cpct ? 30 : 26, row = (items, y, onKey, pre, small) => {
      ctx.font = small ? '600 11px ui-monospace,monospace' : '600 12px ui-monospace,monospace';
      const bw = items.map(([, l]) => ctx.measureText(l).width + (cpct ? 16 : 22)), gap = cpct ? 5 : 8, tot = bw.reduce((a, b) => a + b, 0) + gap * (items.length - 1); let bx = (W - tot) / 2;
      const h = small ? bh - 4 : bh;
      items.forEach(([k, l], i) => { const on = k === onKey; card(ctx, bx, y, bw[i], h, on ? C.gold : C.blue, on ? 0.85 : 0.7); ctx.fillStyle = on ? C.gold : small ? C.tx2 : C.tx; ctx.textAlign = 'center'; ctx.fillText(l, bx + bw[i] / 2, y + h / 2 + 4); g.hit(pre + k, bx + bw[i] / 2, y + h / 2); obst.push({ x: bx, y, w: bw[i], h }); bx += bw[i] + gap; });
      return y + h;
    };
    let y = row(LAYERS, top, S.layer, 'mg:layer:', false);
    y = row(Object.keys(REGIONS).map(r => [r, cpct ? REGION_SHORT[r] : REGION_LABEL[r]]), y + 6, S.region, 'mg:reg:', true);
    // loading / failure in words
    const lay = S.layer, rm = S.rates, cm = S.credit, gm = S.gaps;
    const model = lay === 'credit' ? cm : lay === 'gaps' ? gm : rm;
    if (!model) { msg(ctx, g, S.busy ? 'Reading the BIS policy rates and bank statistics...' : 'Waiting for the data...'); keyBlock(ctx, g, keyY); ctx.restore(); return; }
    // readout block
    const ro = readout(lay, rm, cm, gm), rx = cpct ? 12 : 18, ry = cpct ? y + 10 : top;
    ctx.font = '11px ui-monospace,monospace'; const rw = Math.min(cpct ? W - 24 : 330, Math.max(...ro.lines.map(l => ctx.measureText(l[0]).width)) + 24, W - 24), rh = 26 + ro.lines.length * 15;
    if (!cpct && rw > (W - 2 * 330) / 2) { /* fits beside the centred buttons on desktop */ }
    card(ctx, rx, ry, rw, rh, C.blue, 0.72); ctx.textAlign = 'left'; ctx.fillStyle = C.blue; ctx.font = '600 12px ui-monospace,monospace'; ctx.fillText(ro.title, rx + 12, ry + 17);
    ctx.font = '11px ui-monospace,monospace'; ro.lines.forEach(([s, c], i) => { ctx.fillStyle = c ? C[c] : C.tx; ctx.fillText(s, rx + 12, ry + 33 + i * 15, rw - 24); });
    obst.push({ x: rx, y: ry, w: rw, h: rh });
    if (!model.ok) { msg(ctx, g, `No ${lay === 'credit' ? 'bank-credit' : 'policy-rate'} picture: ${model.why}.`); keyBlock(ctx, g, keyY); ctx.restore(); return; }
    // the card (before labels, so labels steer round it)
    const sp = selParts(), cd = sp ? cardFor(sp.kind, sp.code, { rates: rm, credit: cm }) : null;
    if (cd) obst.push(drawCard(ctx, g, cd, cpct ? keyY - 8 : ry + rh + 12, keyY));
    // labels
    const items = [], hits = [];
    const fade0 = d => clamp(0.55 + (d - 0.2) * 2, 0.55, 1);
    const addLabel = (id, tip, l1, l2, col, pri, hitKey) => {
      const d = front(tip.base); if (d < 0.08) return; const s = H.toScreen(tip.at, camera); if (!s.vis) return;
      hits.push([hitKey, s.x, s.y]);
      if (!l1 || d < 0.22) return;
      ctx.font = '600 12px ui-monospace,monospace'; const w1 = ctx.measureText(l1).width; ctx.font = '11px ui-monospace,monospace'; const w = Math.max(w1, l2 ? ctx.measureText(l2).width : 0) + 12, h = l2 ? 31 : 18;
      const side = s.x >= W / 2 ? 1 : -1;
      items.push({ id, x: side > 0 ? s.x + 12 : s.x - 12 - w, y: s.y - h / 2 - 6, w, h, pri, side, s, l1, l2, col, a: fade0(d), hitKey });
    };
    if (lay === 'rates') {
      const want = rateLabels(rm, { compact: cpct, sel: sp?.kind === 'bank' ? sp.code : null }), wset = new Set(want);
      for (const b of rm.banks) {
        const base = vc(b.lat, b.lon), at = vc(b.lat, b.lon, 1 + b.h + 0.05), lab = wset.has(b.area);
        addLabel(b.area, { base, at }, lab ? `${b.ccy} ${pct(b.rate)}${b.capped ? ' (capped)' : ''}` : null, lab ? `${b.tone === 'up' ? '▲' : b.tone === 'dn' ? '▼' : '•'} ${pp(b.ch3)} 3m · ${pp(b.ch12)} 12m` : null,
          toneCol(C, b.tone), lab ? 100 - want.indexOf(b.area) + (sp?.code === b.area ? 1000 : 0) : 0, 'mg:b:' + b.area);
      }
    } else if (lay === 'credit') {
      const lenders = cm.lenders, borrowers = cm.borrowers, topB = [...borrowers].sort((a, b) => Math.abs(b.flow4qBn ?? 0) - Math.abs(a.flow4qBn ?? 0)).slice(0, cpct ? 4 : 8).map(b => b.code);
      for (const b of borrowers) {
        const lab = topB.includes(b.code) || (sp?.kind === 'borrower' && sp.code === b.code), base = vc(b.lat, b.lon), at = vc(b.lat + 1.5, b.lon + 2.5, 1.02);
        addLabel('r' + b.code, { base, at }, lab ? `${b.name.length > 14 ? b.code : b.name} ${sbn(b.flow4qBn)}` : null, lab ? `${b.dir === 'in' ? '↓ in' : b.dir === 'out' ? '↑ out' : '·'} · 4Q · owes ${bn(b.stockBn)}` : null,
          b.dir === 'out' ? C.dn : b.dir === 'in' ? C.up : C.tx2, lab ? 60 + (b.share ?? 0) * 20 + (sp?.code === b.code ? 1000 : 0) : 0, 'mg:r:' + b.code);
      }
      for (const l of lenders) {
        const lab = !cpct || l.share > 0.35 || (sp?.kind === 'lender' && sp.code === l.code), base = vc(l.lat, l.lon), at = VEC.get('pa' + l.code) ?? (() => { const q = poolArc(l.lat, l.lon), v = bez(q.a, q.c, q.b, 0.32); VEC.set('pa' + l.code, v); return v; })();
        addLabel('l' + l.code, { base, at }, lab ? `${l.code} banks ${bn(l.usdBn)}` : null, lab ? `lender · ${sg(l.g5)} a yr (5y)` : null, l.dir === 'back' ? C.dn : C.blue, lab ? 40 + l.share * 20 + (sp?.code === l.code ? 1000 : 0) : 0, 'mg:l:' + l.code);
      }
      // the pool's own label
      const ps = H.toScreen([0, POOL_Y + 0.1, -POOL_R * 0.2], camera);
      if (ps.vis) { const t1 = 'GLOBAL DOLLAR POOL', t2 = cm.usdG != null ? `world USD credit ${sg(cm.usdG)} y/y · ${cm.regime}` : ''; ctx.font = '600 12px ui-monospace,monospace'; const w = Math.max(ctx.measureText(t1).width, (ctx.font = '11px ui-monospace,monospace', ctx.measureText(t2).width)) + 16; items.push({ id: 'pool', x: ps.x - w / 2, y: ps.y - 40, w, h: 31, pri: 900, side: 1, s: null, l1: t1, l2: t2, col: C.cy, a: 1 }); }
    } else {
      const fset = new Set(gm.funders.map(f => f.area));
      for (const b of [...gm.funders, ...gm.targets]) {
        const f = fset.has(b.area), base = vc(b.lat, b.lon), at = vc(b.lat, b.lon, 1.03);
        addLabel(b.area, { base, at }, `${b.ccy} ${pct(b.rate)}`, f ? 'funder · lowest rates' : `high-rate end${b.capped ? ` · above ${RATE_CAP}%` : ''}`, f ? C.cy : C.gold, f ? 200 : 150 - gm.targets.indexOf(b) + (sp?.code === b.area ? 1000 : 0), 'mg:b:' + b.area);
      }
      // the gap on the widest arcs, at their highest point
      for (const r of (layers?.gapArcs ?? []).slice(0, cpct ? 2 : 4)) {
        const m = r.pts[24]; if (front(m) < 0.1) continue; const s = H.toScreen(m, camera); if (!s.vis) continue;
        const l1 = `${r.a.from === 'XM' ? 'EUR' : rm.by[r.a.from].ccy}→${rm.by[r.a.to].ccy} +${r.a.gap.toFixed(1)}pp${r.a.capped ? ` (>${GAP_CAP} capped)` : ''}`;
        ctx.font = '600 12px ui-monospace,monospace'; const w = ctx.measureText(l1).width + 12; items.push({ id: 'g' + r.a.id, x: s.x - w / 2, y: s.y - 22, w, h: 18, pri: 50 + r.a.gap, side: 1, s: null, l1, l2: null, col: C.gold, a: 1 });
      }
    }
    const placed = placeLabels(items, { W, H: Hh, obstacles: obst, top, bottom: keyH + 4, step: 7, tries: 9 });
    for (const r of placed) {
      const it = items.find(x => x.id === r.id), sel = it.hitKey && 'mg:' + S.selKey === it.hitKey;
      if (it.s) { ctx.globalAlpha = fade * 0.55 * it.a; ctx.strokeStyle = it.col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(it.s.x, it.s.y); ctx.lineTo(it.side > 0 ? r.x : r.x + r.w, r.y + r.h / 2); ctx.stroke(); }
      ctx.globalAlpha = fade * it.a; card(ctx, r.x, r.y, r.w, r.h, sel ? it.col : null, 0.62);
      ctx.globalAlpha = fade * it.a; ctx.textAlign = 'left'; ctx.font = '600 12px ui-monospace,monospace'; ctx.fillStyle = it.id === 'pool' ? C.cy : C.tx; ctx.fillText(it.l1, r.x + 6, r.y + 13);
      if (it.l2) { ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = it.col; ctx.fillText(it.l2, r.x + 6, r.y + 26); }
      if (it.hitKey) g.hit(it.hitKey, r.x + r.w / 2, r.y + r.h / 2);
    }
    ctx.globalAlpha = fade;
    for (const [k, x, yy] of hits) g.hit(k, x, yy);
    // capped pillars always say so, labelled or not
    if (lay === 'rates') { ctx.font = '600 11px ui-monospace,monospace'; ctx.textAlign = 'center'; for (const a of rm.capped) { if (placed.some(r => r.id === a)) continue; const b = rm.by[a], base = vc(b.lat, b.lon); if (front(base) < 0.1) continue; const s = H.toScreen(vc(b.lat, b.lon, 1 + b.h + 0.09), camera); if (s.vis) { ctx.fillStyle = toneCol(C, b.tone); ctx.fillText(`>${RATE_CAP}%`, s.x, s.y); } } }
    keyBlock(ctx, g, keyY);
    ctx.restore();
  }

  function readout(lay, rm, cm, gm) {
    if (lay === 'rates') {
      if (!rm?.ok) return { title: 'MONEY GLOBE · RATES', lines: [['BIS policy rates: not available', 'tx2']] };
      const s = rm.summary;
      return { title: `MONEY GLOBE · RATES · ${rm.asOf ?? ''}`, lines: [[`${s.n} central banks (BIS, monthly)`], [`▼ ${s.cutting} cut over 3 months`, 'dn'], [`▲ ${s.hiking} hiked`, 'up'], [`• ${s.hold} unchanged${s.stale ? ` · ${s.stale} stale` : ''}`, 'tx2']] };
    }
    if (lay === 'credit') {
      if (!cm?.ok) return { title: 'MONEY GLOBE · BANK CREDIT', lines: [['BIS bank statistics: not available', 'tx2']] };
      return { title: `MONEY GLOBE · BANK CREDIT · ${cm.quarter ?? ''}`, lines: [[`world cross-border USD credit ${sg(cm.usdG)} y/y`, cm.usdG != null && cm.usdG < 0 ? 'dn' : 'up'], [`regime: ${cm.regime ?? 'n/a'} (BIS bands)`, 'gold'],
        ...(cm.biggestIn ? [[`biggest inflow ${cm.biggestIn.name} ${sbn(cm.biggestIn.flow4qBn)} (4Q)`, 'up']] : []), ...(cm.biggestOut ? [[`biggest outflow ${cm.biggestOut.name} ${sbn(cm.biggestOut.flow4qBn)}`, 'dn']] : []),
        [`BIS LBS, quarterly, ~4 months late${cm.firstSeen ? ` · seen ${cm.firstSeen}` : ''}`, 'tx2']] };
    }
    if (!gm?.ok) return { title: 'MONEY GLOBE · RATE GAPS', lines: [[gm?.why ?? 'no policy rates', 'tx2']] };
    const w = gm.widest, f = rm.by[w.from], t = rm.by[w.to];
    return { title: `MONEY GLOBE · RATE GAPS · ${rm.asOf ?? ''}`, lines: [[`funders: ${gm.funders.map(b => `${b.ccy} ${pct(b.rate)}`).join(', ')}`, 'cy'], [`high rates: ${gm.targets.map(b => b.ccy).join(', ')}`, 'gold'],
      [`widest gap ${f.ccy}→${t.ccy} ${w.gap.toFixed(1)} pp${w.capped ? ' (capped)' : ''}`], ['policy rates only: no FX hedging or vol cost', 'tx2']] };
  }
  function drawCard(ctx, g, cd, yTop, keyY) {
    const { W, C, fade } = g, cpct = g.compact, w = cpct ? W - 24 : 330, h = 46 + cd.lines.length * 16 + 16, x = cpct ? 12 : W - w - 18, y = cpct ? keyY - h - 8 : Math.min(yTop, keyY - h - 8);
    const col = cd.tone === 'up' ? C.up : cd.tone === 'dn' ? C.dn : C.blue;
    card(ctx, x, y, w, h, col, 0.86); ctx.globalAlpha = fade; ctx.textAlign = 'left'; ctx.font = '600 13px ui-monospace,monospace'; ctx.fillStyle = col; ctx.fillText(cd.title, x + 12, y + 20, w - 40);
    ctx.font = '11px ui-monospace,monospace';
    cd.lines.forEach(([k, v], i) => { const yy = y + 40 + i * 16; ctx.fillStyle = C.tx2; ctx.textAlign = 'left'; ctx.fillText(k, x + 12, yy); ctx.fillStyle = C.tx; ctx.textAlign = 'right'; ctx.fillText(v, x + w - 12, yy, w * 0.58); });
    ctx.textAlign = 'left'; ctx.fillStyle = C.tx2; ctx.fillText(cd.foot, x + 12, y + h - 10, w - 24);
    if (!showing()) { ctx.font = '600 13px ui-monospace,monospace'; ctx.textAlign = 'right'; ctx.fillText('✕', x + w - 10, y + 19); g.hit('mg:close', x + w - 14, y + 14); }
    ctx.textAlign = 'left'; return { x, y, w, h };
  }
  function msg(ctx, g, text) {
    const { W, H: Hh, C } = g; ctx.font = '13px ui-monospace,monospace'; const ls = wrap(ctx, text, Math.min(560, W - 48), 3), w = Math.max(...ls.map(l => ctx.measureText(l).width)) + 28, h = ls.length * 18 + 18;
    card(ctx, (W - w) / 2, Hh / 2 - 22, w, h, C.tx2, 0.88); ctx.textAlign = 'center'; ctx.fillStyle = C.tx; ls.forEach((l, i) => ctx.fillText(l, W / 2, Hh / 2 + i * 18));
  }

  // the key: what each mark means on this layer, the layer's honesty line and the overall line
  function keyBlock(ctx, g, y) {
    const { W, H: Hh, C, fade } = g, cpct = g.compact, lay = S.layer;
    card(ctx, 0, y, W, Hh - y, null, 0.6);
    const items = lay === 'rates' ? [[C.up, '▲ hiked (3m)'], [C.dn, '▼ cut (3m)'], [C.tx2, '▮ unchanged'], [C.tx, `height = rate, 0–${RATE_CAP}% linear`], [C.tx2, 'ring area = 12m change (solid up, dashed down)']]
      : lay === 'credit' ? [[C.blue, '━ lender banks: width = USD claims'], [C.up, '↓ borrower inflow (4Q)'], [C.dn, '↑ outflow'], [C.cy, '◯ dollar pool']]
        : [[C.cy, '● funder'], [C.gold, `━▶ width = rate gap, 0–${GAP_CAP}pp`], [C.gold, '· particles run funder → high rate']];
    const line2 = lay === 'credit' ? KEY_CREDIT : lay === 'gaps' ? KEY_GAPS : null;
    ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'left';
    const rows = []; let cur = [], cw = 0;
    for (const it of items) { const w = ctx.measureText(it[1]).width + 16; if (cw + w > W - 24 && cur.length) { rows.push(cur); cur = []; cw = 0; } cur.push([...it, w]); cw += w; }
    if (cur.length) rows.push(cur);
    let yy = y + 15;
    for (const r of rows.slice(0, cpct ? 2 : 1)) { let x = (W - r.reduce((a, b) => a + b[2], 0)) / 2; for (const [c, s, w] of r) { ctx.globalAlpha = fade * 0.92; ctx.fillStyle = c; ctx.fillText(s, x, yy); x += w; } yy += 14; }
    ctx.textAlign = 'center';
    if (line2) { ctx.globalAlpha = fade; ctx.fillStyle = lay === 'gaps' ? C.gold : C.cy; ctx.font = '600 11px ui-monospace,monospace'; for (const l of wrap(ctx, line2, W - 24, 2)) { ctx.fillText(l, W / 2, yy); yy += 14; } ctx.font = '11px ui-monospace,monospace'; }
    ctx.globalAlpha = fade * 0.85; ctx.fillStyle = C.tx2;
    for (const l of wrap(ctx, KEY_ALL, W - 24, 3)) { ctx.fillText(l, W / 2, yy); yy += 13; }
    ctx.globalAlpha = fade;
  }
  function card(ctx, x, y, w, h, edge, a) {
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = S.bg || 'black'; ctx.fillRect(x, y, w, h);
    if (edge) { ctx.globalAlpha = Math.min(1, ctx.globalAlpha * 1.25); ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
    ctx.restore();
  }

  return {
    scene, camera, update, overlay, bloom: { strength: 0.55, radius: 0.45, threshold: 0.18 },
    dispose() { if (layers) for (const g of Object.values(layers.groups)) { scene.remove(g); dispose(g); } if (globe) { scene.remove(globe); dispose(globe); } layers = null; globe = null; S.builtVer = -1; S.colKey = ''; },
  };
}

function wrap(ctx, text, maxW, maxLines = 3) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean), out = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur);
  if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = out[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
  return out;
}

// ── SHOW: after the chain reactor, the money globe; the camera visits each notable country while Jarvis reads the counts and the BIS pace ──
registerShowScene({
  id: 'moneyglobe', after: 'reactor',
  prepare: api => loadMoney(api).then(() => ({ rates: S.rates, credit: S.credit })).catch(() => null),
  build(inp, data) {
    const rm = data?.rates ?? S.rates, cm = data?.credit ?? S.credit, text = moneyScript(rm, cm); if (!text) return null;
    return {
      title: 'Where money is moving', view: 'moneyglobe', cam: null, text, figure: moneyFigure(rm, cm),
      enter(api) { S.showP = 0; S.showAt = Date.now(); S.layer = 'rates'; S.selKey = null; S.region = 'world'; if (api?.st) { api.st.sel = null; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); } },
      motion(api, p) { S.showP = clamp(p, 0, 1); S.showAt = Date.now(); },
    };
  },
});
