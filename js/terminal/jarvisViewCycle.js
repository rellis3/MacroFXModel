// js/terminal/jarvisViewCycle.js: Jarvis's WORLD CYCLE hologram (WebGL, js/terminal/jarvisGL.js). The classic business-cycle clock made holographic: a glowing plane cut into the four
// phases of the OECD composite leading indicators, with time rising as the vertical axis, so each economy's last two years climb as a glowing trail and its newest month is a bright
// flagged orb on the "now" plane at the top. A TIME scrub drops the now plane down the history (or PLAY walks it back up month by month).
//
// ENCODING
//   across (x)       = the leading indicator against its trend: right of the bright centre line = above 100 (above trend), left = below. Linear, one scale for every economy and month.
//   depth (plane)    = momentum, the indicator's 3-month change (the change the phase definitions use): far side = rising, near side = falling. Linear, one scale.
//                      Both scales fit the 97th percentile of the history with room; a reading past the plane's edge is clamped to it and its card says "capped".
//   quadrants        = the four phases, faintly tinted and named on the plane: Expansion (above, rising; up token), Slowdown (above, falling), Contraction (below, falling; dn token),
//                      Recovery (below, rising). Colour is never the only cue: the quadrant's name is written on it, and the card names the phase.
//   up (y)           = time, one step per month (oldest at the floor, the month shown on the now plane at the top of the drawn trails).
//   trail colour     = the economy's region (gold Americas, cyan Europe, the view accent Asia-Pacific), brighter towards the present; the orb carries a flag with the country code.
//   halo (REAL FX)   = optional: the BIS real effective exchange rate's distance from its own 20-year average as a ring in the now plane around the orb. AREA proportional to |deviation|
//                      (capped at 30%, marked), solid ring = dearer than usual, dashed = cheaper, and the sign is printed on the flag.
// DATA  /api/leading-indicators (OECD DF_CLI via js/globalBoards.js cliBoard: per economy the last 24 monthly readings, latest period, phase) and, for REAL FX, /api/fair-value (BIS WS_EER,
//       js/globalBoards.js fairValue: devPct). The OECD publishes with a lag of a month or two; the screen names the latest month and the lag. Maths in js/terminal/cycleHoloCore.js.
//       A 10-minute cache; a feed that fails leaves the view saying so in words.
// DESCRIPTION ONLY: phases are definitions applied to published indicators, never a forecast of any economy or a signal.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { glView } from './jarvisGL.js';
import { buildCycle, pointAt, monthsInPhase, phaseGroups, phaseMoves, placeLabels, haloRadius, monthLabel, cycleScript, cycleFigure, PHASES, PHASE_WORD, REGION_WORD, fin } from './cycleHoloCore.js';

const ID = 'cycle', TTL = 10 * 60_000, P = 3, HT = 3.8, HALO = 0.62, RING = 48;
const KEY = 'x = leading indicator vs trend, depth = its momentum, up = time · phases are definitions, not a forecast';
const S = { model: null, status: 'idle', at: 0, busy: null, cur: null, play: -1, sel: null, fx: false, showP: -1, showAt: 0, builtFor: null, spin: null };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const QUAD = { expansion: [1, 1], slowdown: [1, -1], contraction: [-1, -1], recovery: [-1, 1] };   // [sign of u (level), sign of v (momentum)]
const QUAD_SUB = { expansion: 'above trend, rising', slowdown: 'above trend, falling', contraction: 'below trend, falling', recovery: 'below trend, rising' };
const sgn = (v, d = 2) => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(d)}` : 'n/a');
const O3 = () => Array(3).fill(0);
const ITEMS = Array.from({ length: 48 }, () => ({ x: 0, y: 0, w: 0, h: 0, pri: 0, text: '', sub: '', col: '', kind: '', ax: 0, ay: 0, key: '' }));

/** Read both feeds once per ten minutes. Never throws; S.status is 'loading' | 'ok' | 'fail'. */
export function loadCycle(api, force) {
  if (S.busy) return S.busy; if (S.model?.ok && !force && Date.now() - S.at < TTL) return Promise.resolve(S.model);
  if (!S.model) S.status = 'loading';
  S.busy = (async () => {
    const ok = u => Promise.resolve().then(() => api.jf(u)).catch(() => null);
    const [cli, fair] = await Promise.all([ok('/api/leading-indicators'), ok('/api/fair-value')]);
    let m = null; try { m = buildCycle(cli, fair?.ok === false ? null : fair, Date.now()); } catch (e) { m = { ok: false, why: 'The leading-indicator reply could not be read.' }; }
    if (m.ok || !S.model?.ok) { S.model = m; S.status = m.ok ? 'ok' : 'fail'; }
    S.at = Date.now(); S.busy = null; return S.model;
  })();
  return S.busy;
}

const regionCol = (C, r) => (r === 'americas' ? C.gold : r === 'europe' ? C.cy : r === 'asia' ? C.blue : C.tx2);
const phaseCol = (C, ph) => (ph === 'expansion' ? C.up : ph === 'contraction' ? C.dn : ph === 'slowdown' ? C.gold : C.cy);
const yOf = (i, n) => (n > 1 ? i / (n - 1) * HT : HT);

function setup(L, H, api) {
  const { THREE } = L, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200), kit = H.kit;
  scene.add(kit.dust(1000, 40, api.colours?.()?.tx2 || 'white'));
  let grp = null, now = null, recs = [], C0 = null, lastCur = -2, lastFx = null;
  const cam = { p: new THREE.Vector3(0, 7, 12), t: new THREE.Vector3(0, HT * 0.5, 0), wp: new THREE.Vector3(), wt: new THREE.Vector3() };
  const tmpC = new THREE.Color();
  if (api.st?.cyFx) S.fx = true;
  loadCycle(api);

  const disposeGroup = () => { if (!grp) return; scene.remove(grp); kit.forget(grp); grp = null; now = null; recs = []; };
  function build(g) {
    disposeGroup(); const M = S.model, C = g.C; C0 = C; S.builtFor = M; lastCur = -2; if (!M?.ok) return;
    grp = new THREE.Group(); scene.add(grp);
    const n = M.months.length;
    // the floor (oldest month) and four faint corner posts carrying the time ticks
    const fl = [[-P, 0, -P, P, 0, -P], [P, 0, -P, P, 0, P], [P, 0, P, -P, 0, P], [-P, 0, P, -P, 0, -P], [0, 0, -P, 0, 0, P], [-P, 0, 0, P, 0, 0]];
    for (const [x, z] of [[-P, -P], [P, -P], [P, P], [-P, P]]) fl.push([x, 0, z, x, HT, z]);
    for (let i = 0; i < n; i++) { const y = yOf(i, n), w = i % 6 === (n - 1) % 6 ? 0.22 : 0.1; fl.push([-P - w, y, P, -P, y, P]); }
    grp.add(kit.segments(fl, C.tx2, 0.13));
    // the now plane: four tinted quadrants, the trend line and the zero-momentum line, the border; it moves with the scrub
    now = new THREE.Group(); grp.add(now); now.userData.quads = [];
    for (const ph of PHASES) {
      const [su, sv] = QUAD[ph], m = new THREE.MeshBasicMaterial({ color: H.color(phaseCol(C, ph)), transparent: true, opacity: ph === 'expansion' || ph === 'contraction' ? 0.075 : 0.05, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
      const q = new THREE.Mesh(new THREE.PlaneGeometry(P * 0.985, P * 0.985), m); q.rotation.x = -Math.PI / 2; q.position.set(su * P / 2, 0, -sv * P / 2); now.add(q); now.userData.quads.push(m);
    }
    now.add(kit.segments([[-P, 0, -P, P, 0, -P], [P, 0, -P, P, 0, P], [P, 0, P, -P, 0, P], [-P, 0, P, -P, 0, -P]], C.blue, 0.5));
    const cross = kit.line([[0, 0, -P], [0, 0, P]], C.tx, 2, 0.55); now.add(cross);            // trend (100)
    const zero = kit.line([[-P, 0, 0], [P, 0, 0]], C.tx2, 1.4, 0.4); now.add(zero);            // no momentum
    const halo = new THREE.Mesh(new THREE.CircleGeometry(P * 1.5, 64), kit.glowDisc(C.blue, 0.1)); halo.rotation.x = -Math.PI / 2; halo.position.y = -0.002; now.add(halo);
    // one trail per economy: the climbed past (bright head, fading back), the part above the scrub (faint), the orb, its flag pole and the REAL FX halo ring
    for (const e of M.econ) {
      const col = regionCol(C, e.region), rec = { e, col, f: 1 };
      rec.past = kit.line([O3(), [0, 0.01, 0]], col, 2.4, 0.95); rec.past.material.vertexColors = true; rec.past.material.needsUpdate = true; grp.add(rec.past);
      rec.fut = kit.line([O3(), [0, 0.01, 0]], col, 1.2, 0.16); grp.add(rec.fut);
      rec.orb = kit.flare(col, 0.3, 0.8); grp.add(rec.orb);
      rec.core = kit.flare('white', 0.11, 0.85); grp.add(rec.core);
      rec.pole = kit.line([O3(), [0, 0.42, 0]], col, 1.2, 0.6); grp.add(rec.pole);
      const ring = Array.from({ length: RING + 1 }, (_, k) => [Math.cos(k / RING * Math.PI * 2), 0, Math.sin(k / RING * Math.PI * 2)]);
      rec.ring = kit.line(ring, col, 1.6, 0.7); rec.ring.visible = false; grp.add(rec.ring);
      const hr = e.reer ? haloRadius(e.reer.devPct, HALO, 30) : null; rec.halo = hr;
      if (hr && !hr.dearer) { rec.ring.material.dashed = true; rec.ring.material.dashSize = 0.08; rec.ring.material.gapSize = 0.06; rec.ring.material.needsUpdate = true; }
      rec.head = O3(); rec.pt = null; recs.push(rec);
    }
  }
  const pos = (p, i, n) => [p.u * P, yOf(i, n), -p.v * P];
  /** Re-lay every trail for the cursor (a month index, fractional while playing). */
  function layout(mc) {
    const M = S.model, n = M.months.length, i0 = Math.floor(mc), fr = mc - i0;
    for (const r of recs) {
      const e = r.e, past = [], cols = [], fut = [];
      for (let i = 0; i <= Math.min(i0, n - 1); i++) if (e.pts[i]) past.push(pos(e.pts[i], i, n));
      const a = e.pts[i0], b = e.pts[i0 + 1];
      if (a && b && fr > 0) past.push([(a.u + (b.u - a.u) * fr) * P, yOf(i0 + fr, n), -(a.v + (b.v - a.v) * fr) * P]);
      for (let i = Math.ceil(mc); i < n; i++) if (e.pts[i]) fut.push(pos(e.pts[i], i, n));
      if (past.length && fut.length && fut[0][1] > past.at(-1)[1]) fut.unshift(past.at(-1));
      const p = pointAt(e, Math.round(mc)); r.pt = p;
      if (!past.length) { r.past.visible = false; r.orb.visible = r.core.visible = r.pole.visible = false; r.head = null; }
      else {
        if (past.length === 1) past.push([past[0][0], past[0][1] + 0.001, past[0][2]]);
        tmpC.set(H.color(r.col)); for (let k = 0; k < past.length; k++) { const w = 0.12 + 0.88 * Math.pow(k / (past.length - 1), 1.6); cols.push(tmpC.r * w, tmpC.g * w, tmpC.b * w); }
        kit.setLine(r.past, past); r.past.geometry.setColors(cols); r.past.visible = true;
        const h = past.at(-1); r.head = h; r.orb.position.set(h[0], h[1], h[2]); r.core.position.set(h[0], h[1], h[2]); r.orb.visible = r.core.visible = r.pole.visible = true;
        r.pole.position.set(h[0], h[1], h[2]);
        r.ring.position.set(h[0], yOf(mc, n), h[2]);
      }
      if (fut.length >= 2) { kit.setLine(r.fut, fut); r.fut.visible = true; } else r.fut.visible = false;
    }
  }

  return {
    scene, camera, bloom: { strength: 0.7, radius: 0.45, threshold: 0.12 },
    update(t, dt, api2, g) {
      const st = api.st, M0 = S.model;
      // clicks: economies, months, buttons
      if (typeof st.sel === 'string' && st.sel.startsWith('cy:')) {
        const k = st.sel.slice(3), n = M0?.months?.length ?? 0, cur = S.cur ?? n - 1; st.sel = null; api.blip?.(820, 0.05);
        if (k.startsWith('e:')) { const a = k.slice(2); S.sel = S.sel === a ? null : a; }
        else if (k === 'all') S.sel = null;
        else if (k.startsWith('m:')) { S.cur = clamp(+k.slice(2) || 0, 0, Math.max(0, n - 1)); S.play = -1; }
        else if (k === 'prev') { S.cur = Math.max(0, cur - 1); S.play = -1; }
        else if (k === 'next') { S.cur = Math.min(n - 1, cur + 1); S.play = -1; }
        else if (k === 'now') { S.cur = null; S.play = -1; }
        else if (k === 'play') { S.play = S.play >= 0 ? -1 : t; if (S.play < 0) S.cur = null; }
        else if (k === 'fx') S.fx = !S.fx;
      }
      if (Date.now() - S.at > TTL && !S.busy) loadCycle(api);
      if (S.model && (S.builtFor !== S.model || C0?.blue !== g.C.blue)) build(g);
      const M = S.model; if (!M?.ok || !grp) { camera.position.set(0, 6, 12); camera.lookAt(0, 2, 0); return; }
      const n = M.months.length, show = S.showP >= 0 && Date.now() - S.showAt < 1500;
      if (S.sel && !M.econ.some(e => e.area === S.sel)) S.sel = null;
      // the cursor: the show's rise, a PLAY walk (about 0.9 s a month, then it rests on now), a scrubbed month, or now
      let mc = n - 1;
      if (show) mc = (n - 1) * clamp(S.showP / 0.7, 0, 1);
      else if (S.play >= 0) { const k = (t - S.play) / 0.9; if (k >= n - 1 + 2) { S.play = -1; S.cur = null; } mc = clamp(k, 0, n - 1); }
      else if (S.cur != null) mc = clamp(S.cur, 0, n - 1);
      if (H.calm && (show || S.play >= 0)) mc = Math.round(mc);
      if (Math.abs(mc - lastCur) > 1e-4 || lastFx !== S.fx) { layout(mc); lastCur = mc; lastFx = S.fx; }
      S.mc = mc; now.position.y = yOf(mc, n);
      // dim what is not selected; pulse the orbs gently; size the REAL FX rings
      for (const r of recs) {
        const want = !S.sel || r.e.area === S.sel ? 1 : 0.14; r.f += (want - r.f) * Math.min(1, dt * 5);
        r.past.material.opacity = 0.95 * r.f; r.fut.material.opacity = 0.16 * r.f; r.orb.material.opacity = 0.8 * Math.max(0.25, r.f); r.core.material.opacity = 0.85 * Math.max(0.2, r.f); r.pole.material.opacity = 0.6 * r.f;
        const big = S.sel === r.e.area ? 1.35 : 1, s = (H.calm ? 0.34 : 0.32 + 0.04 * Math.sin(t * 2.2 + r.e.area.length + r.col.length)) * big; r.orb.scale.setScalar(s);
        r.past.material.linewidth = S.sel === r.e.area ? 3.6 : 2.4;
        const on = S.fx && r.halo && r.head; r.ring.visible = !!on;
        if (on) { r.ring.scale.set(Math.max(0.02, r.halo.r), 1, Math.max(0.02, r.halo.r)); r.ring.material.opacity = 0.75 * Math.max(0.2, r.f); }
      }
      // the camera: a slow turn around the column (the HUD drag adds to it); the show swings it round as the plane rises; a selection leans in a little
      const aspect = g.W / Math.max(1, g.H), th = Math.tan(20 * Math.PI / 180), base = Math.max(15, 9.4 / (2 * th * Math.min(aspect, 1.6))), spin = H.calm ? 0 : t * 0.035;
      let yawAdd = spin;
      if (show) yawAdd = -0.7 + 1.1 * (S.showP * S.showP * (3 - 2 * S.showP));
      const o = { dist: base * (S.sel ? 0.92 : 1), target: [0, HT * 0.5 + (aspect < 1 ? 1.6 : 0.55), 0], yawAdd, elev: 0.6, lo: 0.12, hi: 1.25 };
      const st0 = show ? { yaw: 0.35, pitch: -0.45, zoom: 1 } : st;
      H.orbit(camera, st0, o); cam.wp.copy(camera.position); cam.wt.set(o.target[0], o.target[1], o.target[2]);
      const a = Math.min(1, dt * 3); cam.p.lerp(cam.wp, a); cam.t.lerp(cam.wt, a); camera.position.copy(cam.p); camera.lookAt(cam.t);
    },
    overlay(ctx, g, api2, H2) { overlay(ctx, g, api, H, camera, recs); },
    dispose() { disposeGroup(); },
  };
}

// ───────────────────────── the 2D overlay ─────────────────────────
const msg = (ctx, g, text) => { ctx.save(); ctx.globalAlpha = g.fade; ctx.fillStyle = g.C.tx2; ctx.font = '13px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(text, g.W / 2, g.H / 2); ctx.restore(); };
const panel = (ctx, g, x, y, w, h, a = 0.74) => { ctx.globalAlpha = g.fade * a; ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(x, y, w, h); ctx.globalAlpha = g.fade * 0.35; ctx.strokeStyle = g.C.blue; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); ctx.globalAlpha = g.fade; };
function button(ctx, g, x, y, w, h, label, key, on = false) {
  const { C, fade } = g; ctx.globalAlpha = fade * 0.85; ctx.fillStyle = 'rgba(0,0,0,0.82)'; ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = fade * (on ? 1 : 0.7); ctx.strokeStyle = on ? C.blue : C.tx2; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.globalAlpha = fade; ctx.fillStyle = on ? C.blue : C.tx; ctx.textAlign = 'center'; ctx.font = '11px ui-monospace,monospace'; ctx.fillText(label, x + w / 2, y + h / 2 + 4); ctx.textAlign = 'left'; g.hit(key, x + w / 2, y + h / 2);
}

function overlay(ctx, g, api, H, camera, recs) {
  const { W, H: HH, C, fade } = g, M = S.model, cp = g.compact;
  if (!M) return msg(ctx, g, 'Reading the OECD leading indicators...');
  if (!M.ok) return msg(ctx, g, S.status === 'loading' ? 'Reading the OECD leading indicators...' : `${String(M.why ?? 'No leading-indicator data').replace(/\.?$/, '.')} The cycle cannot be drawn.`);
  if (!recs.length) return;
  ctx.save(); ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  const n = M.months.length, mc = S.mc ?? n - 1, mi = Math.round(mc), month = M.months[mi], atNow = mi === n - 1, sel = S.sel ? recs.find(r => r.e.area === S.sel) : null;
  // title
  ctx.textAlign = 'left'; ctx.globalAlpha = fade; ctx.fillStyle = C.blue; ctx.font = `600 ${cp ? 13 : 15}px ui-monospace,monospace`;
  const ty = cp ? 92 : 104; ctx.fillText('WORLD CYCLE', 16, ty);
  ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = C.tx2;
  const lag = fin(M.lag) && M.lag > 0 ? ` · OECD data run ${M.lag} month${M.lag === 1 ? '' : 's'} behind` : '';
  ctx.fillText(cp ? `OECD leading indicators · latest ${monthLabel(M.asOf, { short: true })}${lag ? ` (${M.lag}m lag)` : ''}` : `OECD composite leading indicators, ${n} months · latest month ${monthLabel(M.asOf)}${lag}`, 16, ty + 16);
  ctx.fillStyle = atNow ? C.tx : C.gold; ctx.font = `600 ${cp ? 12 : 13}px ui-monospace,monospace`;
  ctx.fillText(atNow ? `now plane: ${monthLabel(month)} (latest)` : `now plane: ${monthLabel(month)} · scrubbed back ${n - 1 - mi} month${n - 1 - mi === 1 ? '' : 's'}`, 16, ty + 34);

  // reserved areas: title, readout, card, scrub bar and key (labels never go there)
  const reserved = [{ x: 0, y: 0, w: W, h: ty + 42 }];
  const groups = phaseGroups(M, mi), readW = 318;
  if (!cp) reserved.push({ x: W - readW - 24, y: 84, w: readW + 24, h: 132 });
  const bottomY = HH - (cp ? 168 : 118);         // scrub bar top; the key lives under it
  reserved.push({ x: 0, y: bottomY - 8, w: W, h: HH - bottomY + 8 });
  const card = sel ? cardLines(M, sel, mi) : null, cardH = card ? 22 + card.length * 15 : 0, cardW = cp ? W - 32 : 330;
  const cardX = 16, cardY = cp ? ty + 44 : bottomY - cardH - 12;
  if (card) reserved.push({ x: cardX - 4, y: cardY - 4, w: cardW + 8, h: cardH + 8 });

  // labels: quadrant names on the now plane, axis words, time ticks, economy flags
  let k = 0; const yNow = mc / Math.max(1, n - 1) * HT;
  const put = (p3, text, sub, col, pri, kind, key = '') => {
    if (k >= ITEMS.length) return; const p = H.toScreen(p3, camera); if (!p.vis) return;
    ctx.font = kind === 'q' ? '600 11px ui-monospace,monospace' : kind === 'e' ? `600 ${cp ? 12 : 12}px ui-monospace,monospace` : '11px ui-monospace,monospace';
    const w = Math.max(ctx.measureText(text).width, sub ? (ctx.font = '11px ui-monospace,monospace', ctx.measureText(sub).width) : 0);
    Object.assign(ITEMS[k++], { x: p.x, y: p.y, w, h: sub ? 28 : 13, pri, text, sub, col, kind, ax: p.x, ay: p.y, key });
  };
  for (const ph of PHASES) { const [su, sv] = QUAD[ph]; put([su * P * 0.78, yNow, -sv * P * 0.86], PHASE_WORD[ph].toUpperCase(), cp ? '' : QUAD_SUB[ph], phaseCol(C, ph), 80, 'q'); }
  if (!cp) { put([P * 1.08, yNow, 0], 'above trend', '', C.tx2, 5, 'a'); put([-P * 1.08, yNow, 0], 'below trend', '', C.tx2, 5, 'a'); put([0, yNow, -P * 1.08], 'rising', '', C.tx2, 5, 'a'); put([0, yNow, P * 1.08], 'falling', '', C.tx2, 5, 'a'); }
  for (let i = n - 1; i >= 0; i -= 6) if (i !== mi) put([-P - 0.25, i / Math.max(1, n - 1) * HT, P], monthLabel(M.months[i], { short: true }), '', C.tx2, 3, 'a');
  const order = [...recs].filter(r => r.head).sort((a, b) => Math.abs(b.pt?.chg3 ?? 0) - Math.abs(a.pt?.chg3 ?? 0));
  order.forEach((r, i) => {
    if (cp && i >= 7 && r !== sel) return;
    const fx = S.fx && r.e.reer ? ` ${r.e.reer.devPct > 0 ? '+' : '−'}${Math.abs(Math.round(r.e.reer.devPct))}%${Math.abs(r.e.reer.devPct) > 30 ? '▸' : ''}` : '', lagTx = r.pt?.lag > 0 ? ` ·${monthLabel(r.pt.period).slice(0, 3)}` : '';
    put([r.head[0], r.head[1] + 0.42, r.head[2]], `${r.e.code}${lagTx}${fx}`, '', r.col, r === sel ? 100 : 60 - i, 'e', r.e.area);
  });
  const pl = placeLabels(ITEMS.slice(0, k), { W, top: 4, bottom: HH - 4, reserved });
  for (let i = 0; i < k; i++) {
    const it = ITEMS[i], p = pl[i];
    if (it.kind === 'e') g.hit(`cy:${'e:' + it.key}`, it.ax, it.ay + 6);   // the orb is clickable even when its flag found no room
    if (!p) continue;
    const dim = sel && it.kind === 'e' && it.key !== S.sel ? 0.4 : 1;
    if (it.kind === 'e') {
      ctx.globalAlpha = fade * 0.45 * dim; ctx.strokeStyle = it.col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(it.ax, it.ay); ctx.lineTo(clamp(it.ax, p.x, p.x + it.w), p.y + (it.ay < p.y ? 0 : it.h)); ctx.stroke();
      ctx.globalAlpha = fade * 0.6 * dim; ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(p.x - 3, p.y - 1, it.w + 6, it.h + 3);
      ctx.globalAlpha = fade * dim; ctx.fillStyle = it.key === S.sel ? C.tx : it.col; ctx.font = '600 12px ui-monospace,monospace'; ctx.textAlign = 'left'; ctx.fillText(it.text, p.x, p.y + 11); continue;
    }
    ctx.textAlign = 'left'; ctx.globalAlpha = fade * (it.kind === 'q' ? 0.95 : 0.75); ctx.fillStyle = it.col; ctx.font = it.kind === 'q' ? '600 11px ui-monospace,monospace' : '11px ui-monospace,monospace';
    ctx.fillText(it.text, p.x, p.y + 11); if (it.sub) { ctx.globalAlpha = fade * 0.7; ctx.fillStyle = C.tx2; ctx.font = '11px ui-monospace,monospace'; ctx.fillText(it.sub, p.x, p.y + 25); }
  }

  if (!cp) readout(ctx, g, M, groups, mi, W - readW - 16, 96, readW); else readoutCompact(ctx, g, groups, ty + 50, sel);
  if (card) drawCard(ctx, g, card, cardX, cardY, cardW, cardH);
  scrub(ctx, g, M, mi, bottomY);
  key(ctx, g, M);
  ctx.restore();
}

/** Desktop: who sits in each phase at the plane's month, and the latest crossings. Each code is clickable. */
function readout(ctx, g, M, groups, mi, x, y, w) {
  const { C, fade } = g, mv = phaseMoves(M, mi, 3).slice(0, 3);
  panel(ctx, g, x - 8, y - 14, w + 16, 26 + 4 * 17 + (mv.length ? 18 : 0));
  ctx.textAlign = 'left'; ctx.font = '600 11px ui-monospace,monospace'; ctx.fillStyle = C.blue; ctx.fillText(`PHASES IN ${monthLabel(M.months[mi]).toUpperCase()} · click a code`, x, y);
  PHASES.forEach((ph, i) => {
    const yy = y + 20 + i * 17, list = groups[ph]; ctx.font = '600 11px ui-monospace,monospace'; ctx.fillStyle = phaseCol(C, ph); ctx.globalAlpha = fade;
    ctx.fillText(`${PHASE_WORD[ph].padEnd(12)}${String(list.length).padStart(2)}`, x, yy);
    let xx = x + 122; ctx.font = '11px ui-monospace,monospace';
    for (const e of list) { const tw = ctx.measureText(e.code).width; if (xx + tw > x + w) { ctx.fillStyle = C.tx2; ctx.fillText('…', xx, yy); break; } ctx.fillStyle = regionCol(C, e.region); ctx.globalAlpha = fade * (S.sel && S.sel !== e.area ? 0.5 : 1); ctx.fillText(e.code, xx, yy); g.hit(`cy:e:${e.area}`, xx + tw / 2, yy - 4); xx += tw + 9; }
    ctx.globalAlpha = fade;
  });
  if (mv.length) { ctx.fillStyle = C.tx2; ctx.font = '11px ui-monospace,monospace'; ctx.fillText(clip(`lately: ${mv.map(m => `${m.econ.code} → ${m.to}`).join(' · ')}`, 46), x, y + 20 + 4 * 17); }
}
function readoutCompact(ctx, g, groups, y, sel) {
  if (sel) return; const { C, fade } = g; let x = 16; ctx.font = '600 11px ui-monospace,monospace'; ctx.textAlign = 'left'; ctx.globalAlpha = fade;
  for (const ph of PHASES) { const t = `${PHASE_WORD[ph].slice(0, 5)} ${groups[ph].length}`; ctx.fillStyle = phaseCol(C, ph); ctx.fillText(t, x, y); x += ctx.measureText(t).width + 12; }
}
function cardLines(M, r, mi) {
  const e = r.e, p = pointAt(e, mi); if (!p) return [{ t: `${e.name}: no reading by ${monthLabel(M.months[mi])}`, c: 'tx2' }];
  const run = monthsInPhase(e, mi), out = [];
  out.push({ t: `${e.name} (${e.code}) · ${REGION_WORD[e.region] ?? ''}`, c: 'region', b: true });
  out.push({ t: `${monthLabel(p.period)}${p.lag > 0 ? ` (latest for ${e.code}, ${p.lag} month${p.lag === 1 ? '' : 's'} behind the plane)` : ''}`, c: 'tx2' });
  out.push({ t: `level     ${p.cli.toFixed(2)}  (${sgn(p.cli - 100)} vs trend 100)`, c: 'tx' });
  out.push({ t: `momentum  ${sgn(p.chg3)} (3m)${fin(p.chg1) ? ` · ${sgn(p.chg1)} (1m)` : ''}`, c: p.chg3 > 0 ? 'up' : 'dn' });
  out.push({ t: `phase     ${PHASE_WORD[p.phase]} (${QUAD_SUB[p.phase]})`, c: 'phase', ph: p.phase, b: true });
  if (run) out.push({ t: `in phase  ${run.atLeast ? 'at least ' : ''}${run.months} month${run.months === 1 ? '' : 's'}`, c: 'tx' });
  if (p.capped) out.push({ t: 'capped: past the plane edge, drawn at the edge', c: 'gold' });
  if (S.fx) out.push({ t: e.reer ? `real FX   ${sgn(e.reer.devPct, 1)}% vs 20y avg (${e.reer.devPct > 0 ? 'dearer' : 'cheaper'})${Math.abs(e.reer.devPct) > 30 ? ' · halo capped' : ''}` : 'real FX   no BIS series for this economy', c: 'tx2' });
  return out;
}
function drawCard(ctx, g, lines, x, y, w, h) {
  const { C, fade } = g, r = S.sel ? S.model.econ.find(e => e.area === S.sel) : null;
  panel(ctx, g, x - 4, y - 4, w + 8, h + 8, 0.82); ctx.textAlign = 'left';
  lines.forEach((l, i) => {
    ctx.font = `${l.b ? '600 ' : ''}11px ui-monospace,monospace`; ctx.globalAlpha = fade;
    ctx.fillStyle = l.c === 'region' ? regionCol(C, r?.region) : l.c === 'phase' ? phaseCol(C, l.ph) : C[l.c] ?? C.tx; ctx.fillText(clip(l.t, Math.floor(w / 6.7)), x + 4, y + 14 + i * 15);
  });
  button(ctx, g, x + w - 52, y + h - 20, 50, 18, 'CLOSE', 'cy:all');
}
/** The TIME scrub: a month track (each tick clickable), ◀ ▶ NOW PLAY and REAL FX. */
function scrub(ctx, g, M, mi, y) {
  const { W, C, fade } = g, cp = g.compact, n = M.months.length, bh = cp ? 26 : 20;
  const bx = 16, bw = cp ? 40 : 30, x0 = bx + bw * 2 + 12, right = cp ? W - 16 : W - 16 - 3 * 76, x1 = Math.max(x0 + 60, right - 8), ym = y + bh / 2;
  button(ctx, g, bx, y, bw, bh, '◀', 'cy:prev'); button(ctx, g, bx + bw + 4, y, bw, bh, '▶', 'cy:next');
  ctx.globalAlpha = fade * 0.5; ctx.strokeStyle = C.tx2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, ym); ctx.lineTo(x1, ym); ctx.stroke();
  for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * (n > 1 ? i / (n - 1) : 1), on = i === mi, tick = (n - 1 - i) % 6 === 0;
    ctx.globalAlpha = fade * (on ? 1 : tick ? 0.75 : 0.4); ctx.fillStyle = on ? C.blue : C.tx2; ctx.fillRect(x - (on ? 2 : 0.5), ym - (on ? 7 : tick ? 5 : 3), on ? 4 : 1, on ? 14 : tick ? 10 : 6);
    if (tick && !cp) { ctx.globalAlpha = fade * 0.75; ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(monthLabel(M.months[i], { short: true }), x, ym + 18); }
    if (!cp || i % 2 === 0 || on || i === n - 1) g.hit(`cy:m:${i}`, x, ym);
  }
  ctx.textAlign = 'left';
  if (cp) {
    const y2 = y + bh + 6, w3 = (W - 32 - 8) / 3;
    button(ctx, g, 16, y2, w3, bh, 'NOW', 'cy:now', mi === n - 1 && S.play < 0); button(ctx, g, 20 + w3, y2, w3, bh, S.play >= 0 ? 'STOP' : 'PLAY', 'cy:play', S.play >= 0); button(ctx, g, 24 + w3 * 2, y2, w3, bh, 'REAL FX', 'cy:fx', S.fx);
  } else {
    const xb = W - 16 - 3 * 76 + 4;
    button(ctx, g, xb, y, 70, bh, 'NOW', 'cy:now', mi === n - 1 && S.play < 0); button(ctx, g, xb + 76, y, 70, bh, S.play >= 0 ? 'STOP' : 'PLAY', 'cy:play', S.play >= 0); button(ctx, g, xb + 152, y, 70, bh, 'REAL FX', 'cy:fx', S.fx);
  }
}
const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function key(ctx, g, M) {
  const { W, H, C, fade } = g, cp = g.compact; ctx.textAlign = 'left'; ctx.font = '11px ui-monospace,monospace'; ctx.globalAlpha = fade * 0.9;
  const y = H - (cp ? 92 : 66), sc = `plane edge = ±${M.scale.x.toFixed(2)} points vs trend, ±${M.scale.z.toFixed(2)} momentum (3-month change)${M.capped ? ' · past the edge = capped' : ''}`;
  const fx = S.fx ? (cp ? 'halo = latest real FX vs 20y avg · solid dearer' : 'REAL FX halo: area = BIS real exchange rate vs its 20-year average, solid ring = dearer, dashed = cheaper (capped at 30%) · latest BIS month, not scrubbed') : null;
  const regions = () => { let x = 16; for (const [r, w] of [['americas', 'Americas'], ['europe', 'Europe'], ['asia', 'Asia-Pacific']]) { ctx.fillStyle = regionCol(C, r); ctx.fillText(`● ${w}`, x, y + 15); x += ctx.measureText(`● ${w}`).width + 12; } return x; };
  if (cp) {
    ctx.fillStyle = C.tx2; ctx.fillText('x = indicator vs trend · depth = momentum', 16, y); regions();
    ctx.fillStyle = C.tx2; ctx.fillText(fx ?? 'up = time · tap an orb or code', 16, y + 30);
    ctx.fillStyle = C.gold; ctx.fillText('Phases are definitions, not a forecast.', 16, y + 45); return;
  }
  ctx.fillStyle = C.gold; ctx.fillText(KEY, 16, y);
  const x = regions(); ctx.fillStyle = C.tx2; ctx.fillText(`· trails brighten towards the plane's month · ${clip(sc, Math.max(20, Math.floor((W - x - 24) / 6.7)))}`, x, y + 15);
  ctx.fillText(fx ?? 'click an orb or a code for its card · drag to turn, scroll to zoom · ◀ ▶ or the track to scrub, PLAY walks the two years up', 16, y + 30);
}

registerJarvisModule({
  id: ID, label: 'WORLD CYCLE',
  render(pane, api) {
    pane.innerHTML = `<h3>WORLD CYCLE</h3><p>The business-cycle clock from the OECD's composite leading indicators. Across the glowing plane is each economy's indicator against its trend (right = above 100), into its depth the indicator's 3-month momentum (far = rising), so the four quadrants are the four phases: expansion, slowdown, contraction and recovery. Time rises upward: each economy's last two years climb as a trail, coloured by region, to a flagged orb at the latest month. Scrub the time bar to drop the plane into the past, press PLAY to walk it back up, and REAL FX adds each currency's real exchange rate against its 20-year average as a halo. The OECD publishes a month or two late.</p><p class="jv-sub">Phases are definitions applied to published data, a description only, not a forecast.</p><div class="jv-row"><button type="button" data-cy="go">▶ SHOW THE CYCLE</button></div>`;
    pane.querySelector('[data-cy="go"]').onclick = () => { api.setView(ID); loadCycle(api, true); };
  },
  views: [glView({
    id: ID, label: 'WORLD CYCLE', env: { accent: 'pur', chrome: 'clean', scan: false }, setup,
    onEnter: api => { S.showP = -1; S.play = -1; S.cur = null; S.spin = api.st.spin; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); loadCycle(api); },
    onLeave: api => { S.showP = -1; S.play = -1; if (S.spin != null) api.st.spin = S.spin; S.spin = null; },
  })],
});

registerShowScene({
  id: ID, after: 'surprise',
  prepare: api => loadCycle(api).catch(() => null),
  build: (inp, data) => {
    const M = data ?? S.model, text = M?.ok ? cycleScript(M) : null; if (!text) return null;
    return { title: 'The world cycle', view: ID, cam: null, text, figure: cycleFigure(M),
      enter: api => { S.sel = null; S.cur = null; S.play = -1; S.showP = 0; S.showAt = Date.now(); Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); },
      motion: (api, p) => { S.showP = clamp(p, 0, 1); S.showAt = Date.now(); } };
  },
});
