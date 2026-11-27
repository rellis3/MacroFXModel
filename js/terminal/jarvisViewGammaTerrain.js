// js/terminal/jarvisViewGammaTerrain.js: Jarvis's GAMMA TERRAIN hologram (view 'gterrain'): net dealer gamma by strike over the last weeks as a glowing landscape you fly over.
// Across (x) = strike price (absolute, so a wall that stays put is a ridge running front to back, and spot snakes across). Depth (z) = the date: the oldest capture at the back, TODAY at the front
// edge (a bright white line, labelled). Height = net dealer gamma at that strike on that day: positive gamma rises as cyan hills above a glass floor, negative gamma sinks as gold valleys below it
// (colour AND above/below; gold, not red, because short gamma is a regime, not a down move: the same long-cyan / short-gold the Gamma Fly ribbon uses). In the open-interest fallback the
// heights are calls (up, green) and puts (down, red), never the long-gamma cyan. Heights are linear, scaled to the 97th percentile of the whole window; taller cells are clipped and carry a small white tip (capped). The white line riding the terrain
// is spot, day by day; the gold line lying ON the glass is the gamma flip (where net gamma crosses zero nearest spot); green dots are each day's biggest call strike, red dots the biggest put strike.
// The camera drifts slowly over the landscape (drag to look around; still under H.calm).
// Data: /api/oi-history-raw?pair=&limit=60 (the archived per-day RAW strike ladder: rawOI, spot, basis, dte; net gamma per strike is REBUILT per day in gammaHoloCore.rawDayProfile exactly as the
// server's rebuildGexProfile does: primary expiry, flat vol, that day's DTE) joined with /api/oi-history?pair=&limit=60 (per-day summary: walls, max pain, the server's gamma flip). If no day's ladder
// rebuilds, heights fall back to the summary's top call walls (up) and put walls (down), open interest not gamma, and the screen says so. Fewer than 5 days: "the archive is still building".
// DESCRIPTION ONLY: a record of where positioning sat. Our studies found no proven direction from these levels; nothing here is a forecast, signal or target.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { glView } from './jarvisGL.js';
import { fmtOI } from './jarvisGammaCore.js';
import { terrainDays, buildTerrain, heightAt, niceTicks, placeBox, terrainScript, pickMain, metaOf, fmtDay, fmtPx, TERRAIN_DAYS, MIN_DAYS } from './gammaHoloCore.js';
import { GP, loadStore, buttons, keyLine } from './jarvisViewGammaPillar.js';

const ID = 'gterrain', XW = 7.2, ZD = 5.2, ZF = 2.4, HY = 1.15;
const KEY_GAMMA = 'across = strike price · depth = date, today at the front · height = net dealer gamma: cyan hills above the glass positive, gold valleys below negative · white = spot · gold = gamma flip · dots = biggest call (green) and put (red) strike · description only, not a forecast';
const KEY_OI = 'across = strike price · depth = date, today at the front · height = open interest at the biggest strikes: calls up (green), puts down (red) · white = spot · gold = gamma flip · description only, not a forecast';
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
const TK = { key: null, hist: new Map(), show: { p: -1, at: 0 } };

const pairOf = key => metaOf(key)?.pair ?? null;
/** Fetch the raw ladders and the summaries for one market (once per ten minutes). Resolves to the cache entry; never throws. */
function loadHist(api, key) {
  const p = pairOf(key); if (!p) return Promise.resolve(null); const c = TK.hist.get(key);
  if (c?.busy) return c.busy; if (c && Date.now() - c.at < 600000) return Promise.resolve(c);
  const e = { at: Date.now(), days: c?.days ?? null, T: c?.T ?? null, err: false, rawErr: false }; TK.hist.set(key, e);
  const q = `pair=${encodeURIComponent(p)}&limit=${TERRAIN_DAYS}`;
  e.busy = Promise.all([api.jf(`/api/oi-history-raw?${q}`).catch(() => null), api.jf(`/api/oi-history?${q}`).catch(() => null)]).then(([raw, sum]) => {
    e.rawErr = !raw || !!raw.error; e.err = e.rawErr && (!sum || !!sum.error);
    try { e.days = terrainDays(raw, sum, p); e.T = buildTerrain(e.days); } catch (er) { e.days = []; e.T = null; }
    e.at = Date.now(); e.busy = null; return e;
  });
  return e.busy;
}
const step = d => { const n = GP.avail.length; if (!n) return; const i = GP.avail.findIndex(m => m.key === TK.key); TK.key = GP.avail[(Math.max(0, i) + d + n) % n].key; };

function setup(L, H, api) {
  const { THREE } = L, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200), kit = H.kit;
  let data = null, builtFor = null, B = null, deco = false, todayFlare = null;
  const disposeGroup = g => g?.traverse(o => { o.geometry?.dispose?.(); const m = o.material; if (m) { kit._holo.delete(m); kit._mats.delete(m); if (!m.map) m.dispose?.(); } });

  function build(T, C) {
    if (data) { scene.remove(data); disposeGroup(data); } data = new THREE.Group(); scene.add(data); todayFlare = null;
    if (!deco) { deco = true; scene.add(kit.dust(900, 30, C.blue)); }
    const nd = T.nd, nx = T.nx, X = p => (p - T.lo) / (T.hi - T.lo) * XW - XW / 2, Zj = j => (nd > 1 ? ZF - (nd - 1 - j) * ZD / (nd - 1) : ZF), Yh = v => v * HY;
    const xi = i => X(T.xs[i]), cPos = H.color(C.cy), cNeg = H.color(C.dn), cTx = H.color(C.tx), cGold = H.color(C.gold), cUp = H.color(C.up), cBlue = H.color(C.blue), cTx2 = H.color(C.tx2);
    // the glass floor and its grid
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(XW + 0.4, ZD + 0.6), new THREE.MeshBasicMaterial({ color: cBlue, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    fl.rotation.x = -Math.PI / 2; fl.position.z = ZF - ZD / 2; data.add(fl);
    const grid = []; for (const v of niceTicks(T.lo, T.hi, 8)) grid.push([X(v), 0, ZF + 0.25, X(v), 0, ZF - ZD - 0.25]); for (let k = 0; k <= 4; k++) { const z = ZF - k * ZD / 4; grid.push([-XW / 2 - 0.2, 0, z, XW / 2 + 0.2, 0, z]); }
    data.add(kit.segments(grid, cBlue, 0.14));
    // the surface: a soft fill and a wireframe, both coloured by sign with brightness by size
    const pos = new Float32Array(nd * nx * 3), col = new Float32Array(nd * nx * 3);
    const sPos = T.mode === 'gamma' ? cPos : cUp, sNeg = T.mode === 'gamma' ? cGold : cNeg;     // long / short gamma (a regime) or, in the OI fallback, calls / puts
    for (let j = 0; j < nd; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i, v = T.h[k], c = v >= 0 ? sPos : sNeg, b = T.missing[j] ? 0.02 : 0.03 + 0.97 * Math.abs(v);
      pos[k * 3] = xi(i); pos[k * 3 + 1] = Yh(v); pos[k * 3 + 2] = Zj(j); col[k * 3] = c.r * b; col[k * 3 + 1] = c.g * b; col[k * 3 + 2] = c.b * b; }
    if (nd > 1) {
      const idx = []; for (let j = 0; j < nd - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.push(a, c, b, b, c, d); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
      data.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })));
    }
    const wf = [], wc = [], seg = (a, b) => { wf.push(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2], pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]); wc.push(col[a * 3], col[a * 3 + 1], col[a * 3 + 2], col[b * 3], col[b * 3 + 1], col[b * 3 + 2]); };
    const rowStep = nd > 36 ? 2 : 1; for (let j = nd - 1; j >= 0; j -= rowStep) for (let i = 0; i < nx - 1; i++) seg(j * nx + i, j * nx + i + 1);
    for (let i = 0; i < nx; i += 4) for (let j = 0; j < nd - 1; j++) seg(j * nx + i, (j + 1) * nx + i);
    { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(wf, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
      data.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }))); }
    // capped tips: a white point where a value was clipped
    const capK = []; for (let k = 0; k < T.capped.length; k++) if (T.capped[k]) capK.push(k);
    if (capK.length) { const p = kit.points(capK.length, cTx, 4, { opacity: 0.9 }), a = p.geometry.attributes.position.array; capK.forEach((k, n) => { a[n * 3] = pos[k * 3]; a[n * 3 + 1] = pos[k * 3 + 1] + Math.sign(pos[k * 3 + 1]) * 0.03; a[n * 3 + 2] = pos[k * 3 + 2]; }); data.add(p); }
    // the front edge (today), bright
    { const j = nd - 1, pts = []; for (let i = 0; i < nx; i++) pts.push([xi(i), Yh(T.h[j * nx + i]) + 0.004, Zj(j)]); data.add(kit.line(pts, cTx, 2.2, 0.85)); data.add(kit.segments([[-XW / 2 - 0.2, 0, Zj(j), XW / 2 + 0.2, 0, Zj(j)]], cTx2, 0.35)); }
    // spot riding the terrain, and the flip lying on the glass (gaps where a day has none)
    const spotPts = T.days.map((d, j) => [X(d.spot), Yh(heightAt(T, j, d.spot)) + 0.06, Zj(j)]); if (spotPts.length > 1) data.add(kit.line(spotPts, cTx, 3, 1));
    todayFlare = kit.flare(cTx, 0.45, 0.9); todayFlare.position.set(...spotPts[spotPts.length - 1]); data.add(todayFlare);
    const flipOfDay = d => (T.mode === 'gamma' ? d.flip ?? d.gammaFlip : d.gammaFlip ?? d.flip);
    let run = []; const flush = () => { if (run.length > 1) data.add(kit.line(run, cGold, 2.4, 0.95)); run = []; };
    T.days.forEach((d, j) => { const f = flipOfDay(d); if (f != null && f >= T.lo && f <= T.hi) run.push([X(f), 0.012, Zj(j)]); else flush(); }); flush();
    // the walls as dots
    for (const [f, c] of [['callWall', cUp], ['putWall', cNeg]]) { const ds = T.days.map((d, j) => [d[f], j]).filter(([v]) => v != null && v >= T.lo && v <= T.hi); if (!ds.length) continue;
      const p = kit.points(ds.length, c, 8, { opacity: 1 }), a = p.geometry.attributes.position.array; ds.forEach(([v, j], n) => { a[n * 3] = X(v); a[n * 3 + 1] = Yh(heightAt(T, j, v)) + 0.05; a[n * 3 + 2] = Zj(j); }); data.add(p); }
    B = { T, X, Zj, Yh, flipOfDay };
  }

  return {
    scene, camera, bloom: { strength: 0.6, radius: 0.45, threshold: 0.12 },
    update(t, dt, a0, g) {
      const a = a0 ?? api;
      if (!GP.store && !GP.busy && !GP.err) loadStore(a).catch(() => null);
      if (!TK.key || !GP.avail.some(m => m.key === TK.key)) TK.key = GP.avail.some(m => m.key === a.st.sel) ? a.st.sel : pickMain(GP.avail);
      if (GP.avail.length && typeof a.st.sel === 'string' && a.st.sel.startsWith('gt:')) { const k = a.st.sel.slice(3); if (k === 'prev') step(-1); else if (k === 'next') step(1); a.st.sel = null; a.blip?.(780, 0.05); }
      if (TK.key) loadHist(a, TK.key);
      const e = TK.key ? TK.hist.get(TK.key) : null, T = e?.T ?? null, sig = T ? `${TK.key}|${e.at}|${T.nd}` : null;
      if (T && sig !== builtFor) { builtFor = sig; build(T, g.C); }
      if (!T && data) { scene.remove(data); disposeGroup(data); data = null; B = null; builtFor = null; }
      const show = TK.show.p >= 0 && Date.now() - TK.show.at < 1500, calm = H.calm;
      const sway = show ? -0.55 + TK.show.p * 1.1 : calm ? 0 : Math.sin(t * 0.045) * 0.5;
      H.orbit(camera, a.st, { dist: g.compact ? 15.5 : 9.6, target: [0, 0.1, ZF - ZD * 0.45], elev: g.compact ? 0.62 : 0.5, lo: 0.08, hi: 1.3, yawAdd: sway });
      if (todayFlare && !calm) todayFlare.material.opacity = 0.7 + 0.3 * Math.sin(t * 2.5);
    },
    overlay(ctx, g, a) { overlay(ctx, g, a, H, camera, B); },
    dispose() { disposeGroup(scene); },
  };
}

function overlay(ctx, g, api, H, camera, B) {
  const { W, H: Hh, C, fade } = g, cp = g.compact; ctx.save(); ctx.globalAlpha = fade;
  const font = (px, w = '') => { ctx.font = `${w}${px}px ui-monospace,monospace`; };
  const msg = (s, y = Hh / 2, col = C.tx2) => { font(13); ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(s, W / 2, y); ctx.textAlign = 'left'; };
  if (!GP.store && !GP.err) { msg('Reading the option books...'); ctx.restore(); return; }
  if (GP.err || !GP.avail.length) { msg(GP.err ? 'The option open interest feed is not available right now, so there is no terrain to draw.' : 'No option open interest has been captured yet.'); ctx.restore(); return; }
  const meta = metaOf(TK.key); buttons(ctx, g, meta?.label ?? TK.key ?? '', 'gt');
  const e = TK.hist.get(TK.key);
  if (!e || (e.busy && !e.T)) { msg('Reading the archive of daily strike ladders...'); ctx.restore(); return; }
  if (!B || B.T !== e.T) { msg(e.err ? 'The open interest archive is not available right now.' : `The archive is still building: ${e.days?.length ?? 0} days, and none carries a usable ladder for ${meta?.label ?? TK.key}.`); ctx.restore(); return; }
  const { T, X, Zj, Yh } = B, S = p => H.toScreen(p, camera), bg = 'rgba(0,0,0,0.72)', taken = [], nd = T.nd, last = T.days[nd - 1];
  const bounds = { x0: 4, y0: cp ? 118 : 146, x1: W - 4, y1: Hh - (cp ? 150 : 100) };
  taken.push({ x: W / 2 - 130, y: cp ? 84 : 114, w: 260, h: 32 });
  const box = (text, px, w = '') => { font(px, w); return { w: ctx.measureText(text).width + 8, h: px + 6 }; };
  const draw = (r, text, col, px, w = '') => { font(px, w); ctx.fillStyle = bg; ctx.globalAlpha = fade; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.fillStyle = col; ctx.fillText(text, r.x + 4, r.y + px + 1); };
  const label = (p, text, col, px, w, cands) => { const d = box(text, px, w), r = placeBox(cands.map(([dx, dy]) => ({ x: p.x + dx(d.w), y: p.y + dy(d.h), w: d.w, h: d.h })), taken, bounds); if (r) draw(r, text, col, px, w); return r; };
  const right = () => 10, left = w => -10 - w, mid = w => -w / 2, up = h => -h - 8, down = () => 8, cen = h => -h / 2;
  // the readout: the window, the mode, the main fact
  const head = `GAMMA TERRAIN · ${meta?.label ?? ''}`, l1 = `${nd} captures · ${fmtDay(T.days[0].date)} to ${fmtDay(last.date)}`;
  const l2 = T.mode === 'gamma' ? 'net gamma rebuilt per day from the archived ladders' : 'per-strike gamma could not be rebuilt: heights are the biggest call and put open interest';
  const miss = T.missing.filter(Boolean).length;
  ctx.textAlign = 'left';
  if (cp) { const y = 136; font(12, '600 '); ctx.fillStyle = C.blue; ctx.fillText(head, 12, y); font(11); ctx.fillStyle = C.tx; ctx.fillText(l1, 12, y + 15); ctx.fillStyle = T.mode === 'gamma' ? C.tx2 : C.gold; ctx.fillText(T.mode === 'gamma' ? 'net gamma rebuilt per day' : 'fallback: open interest, not gamma', 12, y + 30); taken.push({ x: 8, y: y - 14, w: 300, h: 50 }); bounds.y0 = y + 38; }
  else { const x = 22, y = 176; font(13, '600 '); ctx.fillStyle = C.blue; ctx.fillText(head, x, y); font(12); ctx.fillStyle = C.tx; ctx.fillText(l1, x, y + 18); font(11); ctx.fillStyle = T.mode === 'gamma' ? C.tx2 : C.gold; ctx.fillText(l2, x, y + 34);
    ctx.fillStyle = C.tx2; let yy = y + 50; if (miss) { ctx.fillText(`${miss} day${miss > 1 ? 's' : ''} without a readable ladder (flat rows)`, x, yy); yy += 14; }
    if ([...T.capped].some(Boolean)) { ctx.fillText('white tips = taller than the scale, clipped', x, yy); yy += 14; }
    font(12); taken.push({ x: x - 4, y: y - 16, w: Math.max(ctx.measureText(l2).width, 300) + 8, h: yy - y + 10 }); }
  if (nd < MIN_DAYS) msg(`The archive is still building: ${nd} day${nd === 1 ? '' : 's'} so far.`, cp ? 200 : 168, C.gold);
  // today at the front: spot, the flip, the walls
  const today = nd - 1, f = B.flipOfDay(last);
  const sp = S([X(last.spot), Yh(heightAt(T, today, last.spot)) + 0.06, Zj(today)]);
  label(sp, `SPOT ${fmtPx(last.spot)}`, C.tx, 12, '600 ', [[mid, up], [right, up], [left, up], [right, cen]]);
  if (f != null && f >= T.lo && f <= T.hi) label(S([X(f), 0.012, Zj(today)]), `FLIP ${fmtPx(f)}`, C.gold, 12, '600 ', [[mid, down], [left, down], [right, down], [left, cen]]);
  if (!cp) for (const [k, col, nm, w] of [['callWall', C.up, 'CALL WALL', last.calls[0]], ['putWall', C.dn, 'PUT WALL', last.puts[0]]]) { const v = last[k]; if (v == null || v < T.lo || v > T.hi) continue;
    const p = S([X(v), Yh(heightAt(T, today, v)) + 0.05, Zj(today)]); label(p, `${nm} ${fmtPx(v)}${w?.strike === v ? ` · ${fmtOI(w.oi)}` : ''}`, col, 11, '', [[k === 'callWall' ? right : left, up], [mid, up], [mid, down], [k === 'callWall' ? right : left, down]]); }
  // dates down the left edge, prices along the front
  const dl = S([-XW / 2 - 0.25, 0, Zj(today)]), fc = S([0, 0, Zj(today) + 0.3]); label(dl, `TODAY ${fmtDay(last.date)}`, C.tx, 12, '600 ', [[left, cen], [left, down]]) ?? label(fc, `TODAY ${fmtDay(last.date)} (front edge)`, C.tx, 12, '600 ', [[mid, () => 30], [mid, () => 48]]);
  if (nd > 1) { label(S([-XW / 2 - 0.25, 0, Zj(0)]), fmtDay(T.days[0].date), C.tx2, 11, '', [[left, cen], [left, up], [right, up], [mid, up]]); if (nd > 6) { const m = Math.floor(nd / 2); label(S([-XW / 2 - 0.25, 0, Zj(m)]), fmtDay(T.days[m].date), C.tx2, 11, '', [[left, cen]]); } }
  for (const v of niceTicks(T.lo, T.hi, cp ? 3 : 6)) { const p = S([X(v), 0, Zj(today) + 0.3]); label(p, fmtPx(v), C.tx2, 11, '', [[mid, down]]); }
  keyLine(ctx, g, T.mode === 'gamma' ? KEY_GAMMA : KEY_OI);
  ctx.restore();
}

const view = glView({ id: ID, label: 'GAMMA TERRAIN', env: { accent: 'blue2', chrome: 'clean', scan: false }, setup,
  onEnter: api => { TK.show.p = -1; TK._spin = api.st.spin; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); loadStore(api).catch(() => null); },
  onLeave: api => { TK.show.p = -1; if (TK._spin != null) api.st.spin = TK._spin; TK._spin = null; } });
registerJarvisModule({
  id: ID, label: 'GAMMA TERRAIN',
  render(pane, api) {
    pane.innerHTML = '<h3>GAMMA TERRAIN: NET DEALER GAMMA OVER THE LAST WEEKS</h3><p>A landscape of the archived option books. Across is the strike price, depth is the date with today at the front, and height is the net dealer gamma rebuilt from each day\'s strike ladder: cyan hills above the glass are positive, gold valleys below are negative. The white line is spot day by day, the gold line on the glass is the gamma flip, and the dots are each day\'s biggest call and put strikes.</p><p class="jv-sub">A record of positioning, not a forecast.</p><div class="jv-row"><button type="button" data-g="go">FLY THE TERRAIN</button></div>';
    pane.querySelector('[data-g="go"]').onclick = () => { api.setView(ID); loadStore(api, true).catch(() => null); };
  },
  views: [view],
});

registerShowScene({
  id: ID, after: 'gpillar',
  prepare: async api => { try { await loadStore(api); const k = pickMain(GP.avail); if (!k) return null; const e = await loadHist(api, k); return e?.days?.length ? { key: k, days: e.days } : null; } catch (er) { return null; } },
  build: (inp, d) => {
    if (!d?.key) return null; const text = terrainScript(d.days, d.key); if (!text) return null;
    return { title: 'The gamma terrain', view: ID, cam: null, text, enter: api => { TK.key = d.key; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); }, motion: (api, p) => { TK.show.p = clampN(p, 0, 1); TK.show.at = Date.now(); } };
  },
});
