// js/terminal/jarvisViewRatePaths.js: Jarvis's RATE PATHS hologram (WebGL, js/terminal/jarvisGL.js). The market-implied policy-rate path of each central bank as a
// glowing lane running away from you along a shared time axis (today at your feet, about 13 months out at the far end, month lines across the floor).
//
// ENCODING
//   lane            one central bank. Lanes sit left to right from the most easing priced over the window to the most tightening (signed total, bp).
//   base rail       the bank's policy rate today (the glowing line along the lane floor); the bank's name and that rate stand at the lane head.
//   staircase       what futures / OIS price: at each meeting (dated by the bank's own calendar) the path steps by the move priced for that meeting, so
//                   height above / below the rail = the cumulative change priced since today, linear in bp on one shared scale for every lane
//                   (floored at 25bp, capped at 200bp; anything past the cap is clamped and labelled "capped"). Colour by direction (up token = hike,
//                   dn token = cut, neutral when under 2bp) AND the step direction itself (a riser up or down) as the second cue. A faint curtain
//                   fills between the rail and the staircase so the area reads at a glance.
//   ghost           a faint dashed staircase: the same path from the earlier snapshot the feed carries (4 weeks ago for the strips and the Fed, 1 month
//                   for the BoE curve), so you can see how pricing moved.
//   labels          the next meeting's step on each lane ("-18bp, 72% of a cut priced"), only where they fit (collision-avoided); a click on a lane head
//                   focuses it: the camera flies along that lane, the others dim, and every meeting on it is labelled.
// DATA  /api/cb-expectations (IBKR short-rate futures strips + policy rates), /api/fed-path (ZQ per-FOMC path), /api/cb-path/boe (Bank of England OIS);
//       meeting calendars from js/*Calendar.js and js/cbMeetingPath.js. The maths (strip -> per-meeting steps, sorting, scale, label placement, the
//       spoken line) lives in js/terminal/ratePathsCore.js. A 10-minute cache; any feed that fails is simply left out and its lane says so in words.
// DESCRIPTION ONLY: market pricing at each meeting, never a forecast of what a bank will do, never a signal.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { glView } from './jarvisGL.js';
import { buildLanes, heightOf, depthOf, monthTicks, placeLabels, stepWords, bpText, dateLabel, ratePathsScript, showAct } from './ratePathsCore.js';
import { FOMC_MEETINGS } from '../fomcCalendar.js';
import { ECB_MEETINGS } from '../ecbCalendar.js';
import { BOE_MEETINGS } from '../boeCalendar.js';
import { BOJ_MEETINGS } from '../bojCalendar.js';
import { SNB_MEETINGS } from '../snbCalendar.js';
import { BOC_MEETINGS } from '../bocCalendar.js';
import { RBA_MEETINGS } from '../rbaCalendar.js';
import { RBNZ_MEETINGS } from '../rbnzCalendar.js';
import { MEETINGS as STRIP_CAL } from '../cbMeetingPath.js';

const ID = 'cbpaths', TTL = 10 * 60_000, DEPTH = 10, SP = 1.3, HU = 2.1, Z0 = 0.45;
const CALS = { fomc: FOMC_MEETINGS, ecb: [...ECB_MEETINGS, ...(STRIP_CAL.EUR?.dates ?? [])], boe: [...BOE_MEETINGS, ...(STRIP_CAL.GBP?.dates ?? [])], boj: [...BOJ_MEETINGS, ...(STRIP_CAL.JPY?.dates ?? [])], snb: SNB_MEETINGS, boc: BOC_MEETINGS, rba: RBA_MEETINGS, rbnz: RBNZ_MEETINGS };
const S = { model: null, status: 'idle', at: 0, busy: null, focus: null, focusT: 0, showP: -1, showAt: 0, builtFor: null, spin: null };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), fin = Number.isFinite;
const HEAD_TRIES = [0, 1, 2, -1, 3, -2];
const BOX = Array.from({ length: 64 }, () => ({ x: 0, y: 0, w: 0, h: 0, pri: 0, ok: false, text: '', sub: '', col: '', ax: 0, ay: 0, kind: '', rec: null })), ORD = [], KEPT = [];

/** Read the three feeds once per ten minutes. Never throws; S.status is 'loading' | 'ok' | 'empty' | 'fail'. */
export function loadPaths(api, force) {
  if (S.busy) return S.busy; if (S.model && !force && Date.now() - S.at < TTL) return Promise.resolve(S.model);
  S.status = S.model ? S.status : 'loading';
  S.busy = (async () => {
    const ok = u => Promise.resolve().then(() => api.jf(u)).catch(() => null);
    const [cbx, fed, boe] = await Promise.all([ok('/api/cb-expectations'), ok('/api/fed-path'), ok('/api/cb-path/boe')]);
    let m = null; try { m = buildLanes({ cbx: cbx?.ok === false ? { policy: cbx.policy } : cbx, fed: fed?.ok ? fed : null, boe: boe?.ok ? boe : null, calendars: CALS, now: Date.now() }); } catch (e) { m = null; }
    if (m?.lanes?.length) { S.model = m; S.status = 'ok'; } else if (!S.model) S.status = (cbx || fed || boe) ? 'empty' : 'fail';
    S.at = Date.now(); S.busy = null; return S.model;
  })();
  return S.busy;
}

function setup(L, H, api) {
  const { THREE } = L, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200), kit = H.kit;
  scene.add(kit.dust(1200, 40, api.colours?.()?.tx2 || 'white'));
  const cam = { p: new THREE.Vector3(0, 5, 10), t: new THREE.Vector3(0, 0, -4), wp: new THREE.Vector3(), wt: new THREE.Vector3() };
  let grp = null, recs = [], field = { xl: 0, xr: 0, n: 0 }, ticks = [], C0 = null;
  loadPaths(api);

  const disposeGroup = () => { if (!grp) return; scene.remove(grp); grp.traverse(o => { o.geometry?.dispose?.(); if (o.material) { o.material.dispose?.(); kit._mats.delete(o.material); } }); grp = null; recs = []; };
  function build(g) {
    disposeGroup(); const M = S.model, C = g.C; if (!M) return;
    grp = new THREE.Group(); scene.add(grp); C0 = C;
    const n = M.lanes.length, now = Date.now(), cUp = C.up, cDn = C.dn, cNe = C.tx2, cBl = C.blue;
    field = { xl: -(n - 1) / 2 * SP, xr: (n - 1) / 2 * SP, n }; ticks = monthTicks(now, M.horizonDays);
    // the shared floor: month lines across every lane, and a scale post at the left (ticks every 25bp, or 50bp on a big scale)
    const fl = [], xa = field.xl - SP * 0.55, xb = field.xr + SP * 0.55;
    for (const tk of ticks) { const z = -tk.f * DEPTH; fl.push([xa, 0, z, xb, 0, z]); }
    fl.push([xa, 0, Z0, xa, 0, -DEPTH], [xb, 0, Z0, xb, 0, -DEPTH]);
    const floor = kit.segments(fl, cBl, 0.11); grp.add(floor);
    const stepT = M.scaleBp > 100 ? 50 : 25, post = [], xp = xa - 0.15;
    const zp = -DEPTH * 0.35; post.push([xp, -HU, zp, xp, HU, zp]);
    for (let v = -Math.floor(M.scaleBp / stepT) * stepT; v <= M.scaleBp + 1e-6; v += stepT) { const y = heightOf(v, M.scaleBp, HU).y; post.push([xp - 0.08, y, zp, xp + 0.08, y, zp]); }
    const postL = kit.segments(post, C.tx2, 0.45); grp.add(postL);
    M.lanes.forEach((ln, i) => {
      const x = field.xl + i * SP, mats = [], rec = { ln, x, mats, f: 1, risers: [], next: null, cap: false }, add = (o, m, base, kind = 'op') => { grp.add(o); mats.push({ m, base, kind }); return o; };
      // lane floor edges and a tick across the lane at each of its meetings
      const ed = [[x - SP * 0.42, 0, Z0, x - SP * 0.42, 0, -DEPTH], [x + SP * 0.42, 0, Z0, x + SP * 0.42, 0, -DEPTH]];
      for (const mt of ln.meetings) { const z = -depthOf(mt.date, now, M.horizonDays) * DEPTH; ed.push([x - SP * 0.3, 0, z, x + SP * 0.3, 0, z]); }
      const edg = kit.segments(ed, cBl, 0.16); add(edg, edg.material, 0.16);
      // the base rail (today's rate): a soft halo and a bright core
      const rail = [[x, 0, Z0], [x, 0, -DEPTH]];
      const halo = kit.line(rail, cBl, 7, 0.05); add(halo, halo.material, 0.05);
      const core = kit.line(rail, cBl, 1.6, 0.3); add(core, core.material, 0.3);
      const pad = new THREE.Mesh(new THREE.CircleGeometry(SP * 0.36, 48), kit.glowDisc(cBl, 0.22)); pad.rotation.x = -Math.PI / 2; pad.position.set(x, 0.002, Z0); add(pad, pad.material, 0.22, 'k');
      // the staircase: treads coloured by the sign of the cumulative change, risers by the direction of the step; a faint curtain to the rail
      const cv = [], cc = [], col = new THREE.Color(), push = (x0, y0, z0, c) => { cv.push(x0, y0, z0); col.set(c); cc.push(col.r, col.g, col.b); };
      let zPrev = Z0, yPrev = 0, cumPrev = 0;
      const tread = (z1, y, cum) => {
        const c = Math.abs(cum) < 2 ? cNe : cum > 0 ? cUp : cDn, l = kit.line([[x, y, zPrev], [x, y, z1]], c, 2.6, 0.8); add(l, l.material, 0.8);
        if (Math.abs(y) > 0.004) { const k = c; push(x, 0, zPrev, k); push(x, y, zPrev, k); push(x, y, z1, k); push(x, 0, zPrev, k); push(x, y, z1, k); push(x, 0, z1, k); }
      };
      ln.meetings.forEach((mt, k) => {
        const z = -depthOf(mt.date, now, M.horizonDays) * DEPTH, h = heightOf(mt.cumBp, M.scaleBp, HU); if (h.capped) rec.cap = true;
        tread(z, yPrev, cumPrev);
        if (Math.abs(h.y - yPrev) > 0.003) { const c = mt.dir > 0 ? cUp : mt.dir < 0 ? cDn : cNe, r = kit.line([[x, yPrev, z], [x, h.y, z]], c, 3, 0.9); add(r, r.material, 0.9); }
        rec.risers.push({ z, y: h.y, y0: yPrev, mt });
        if (k === 0) { const fcol = mt.dir > 0 ? cUp : mt.dir < 0 ? cDn : cNe, fl2 = kit.flare(fcol, 0.42, 0.75); fl2.position.set(x, h.y, z); add(fl2, fl2.material, 0.75); rec.next = fl2; }
        zPrev = z; yPrev = h.y; cumPrev = mt.cumBp;
      });
      tread(-DEPTH, yPrev, cumPrev);
      if (cv.length) { const gm = new THREE.BufferGeometry(); gm.setAttribute('position', new THREE.Float32BufferAttribute(cv, 3)); gm.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
        const mm = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.06, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }); add(new THREE.Mesh(gm, mm), mm, 0.06); }
      // the ghost: the earlier snapshot, dashed and faint, from its first meeting on
      if (ln.ghost) {
        const gp = []; let gy = null;
        ln.meetings.forEach((mt, k) => { const v = ln.ghost[k]; if (v == null) return; const z = -depthOf(mt.date, now, M.horizonDays) * DEPTH, y = heightOf(v, M.scaleBp, HU).y; if (gy != null) gp.push([x, gy, z]); gp.push([x, y, z]); gy = y; });
        if (gy != null) gp.push([x, gy, -DEPTH]);
        if (gp.length >= 2) { const gl = kit.line(gp, C.tx, 1.4, 0.3); gl.material.dashed = true; gl.material.dashSize = 0.16; gl.material.gapSize = 0.11; gl.material.needsUpdate = true; add(gl, gl.material, 0.3); }
      }
      recs.push(rec);
    });
    S.builtFor = M;
  }

  return {
    scene, camera, bloom: { strength: 0.75, radius: 0.45, threshold: 0.12 },
    update(t, dt, api2, g) {
      const st = api.st;
      if (typeof st.sel === 'string' && st.sel.startsWith('rp:')) { const k = st.sel.slice(3); S.focus = k === 'all' || k === S.focus ? null : k; S.focusT = t; st.sel = null; api.blip?.(820, 0.05); }
      if (Date.now() - S.at > TTL && !S.busy) loadPaths(api);
      if (S.model && (S.builtFor !== S.model || C0?.blue !== g.C.blue)) build(g);
      const M = S.model, aspect = g.W / Math.max(1, g.H), show = S.showP >= 0 && Date.now() - S.showAt < 1500;
      if (S.focus && !recs.some(r => r.ln.ccy === S.focus)) S.focus = null;
      // dim the lanes that are not focused
      for (const r of recs) {
        const want = !S.focus || r.ln.ccy === S.focus ? 1 : 0.16; r.f += (want - r.f) * Math.min(1, dt * 4);
        for (const q of r.mats) { if (q.kind === 'k') q.m.uniforms.k.value = q.base * r.f; else q.m.opacity = q.base * r.f; }
        if (r.next) { const s = H.calm ? 0.42 : 0.38 + 0.08 * Math.sin(t * 2.6 + r.x); r.next.scale.setScalar(s); }
      }
      // the camera: an overview that glides across the lanes, or a flight along the focused lane
      const fw = (field.xr - field.xl) + SP * 2.2, fit = aspect < 1 ? Math.max(14, fw * 1.3 / aspect) : Math.max(14, fw * 1.25 / Math.min(1.5, aspect));
      // in the SHOW the picture follows the script: an overview, then down to the side of the lane with the most easing priced, then the most tightening
      const act = show ? showAct(S.showP, M.lanes) : null;
      if (act?.act === 'lane') { if (S.focus !== act.ccy) { S.focus = act.ccy; S.focusT = t; } S.showFocus = true; }
      else if (S.showFocus) { S.focus = null; S.showFocus = false; }
      const fr = S.focus ? recs.find(r => r.ln.ccy === S.focus) : null;
      if (fr) {
        // fly along the lane from its head to its far end (~10 s, or with the narration in the SHOW), low and from the side so the steps read as a staircase profile
        const ft = t - S.focusT, k = act?.act === 'lane' ? act.k : H.calm ? 0.5 : 0.5 - 0.5 * Math.cos(Math.min(1, ft / 10) * Math.PI), zc = -1 - k * DEPTH * 0.6, ph = aspect < 1;
        const side = (ph ? 9 : act ? 6.2 : 7) / (st.zoom || 1), up = act ? 0.9 + 0.5 * Math.sin(k * Math.PI) : clamp(1.7 - (st.pitch + 0.45) * 3, 0.3, 6);
        cam.wp.set(fr.x + side, up, zc + (ph ? 3 : 2)); cam.wt.set(fr.x, -0.3, zc - 1.5);
      } else {
        const z = st.zoom || 1, elev = clamp((aspect < 1 ? 0.8 : 0.62) - (st.pitch + 0.45) * 0.8, 0.12, 1.3), glide = H.calm ? 0 : Math.sin(t * 0.11) * (aspect < 1 ? 0.03 : 0.06);
        let yaw = (st.yaw - 0.35) + glide, tx = 0;
        if (show) { const e = act?.k ?? 0; tx = field.xl + (field.xr - field.xl) * e; yaw = -0.32 + 0.64 * e; }
        const d = fit / z, tz = -DEPTH * 0.42;
        cam.wt.set(tx * (show ? 0.8 : 0), -1.5, tz); cam.wp.set(cam.wt.x + d * Math.cos(elev) * Math.sin(yaw), cam.wt.y + d * Math.sin(elev), tz + d * Math.cos(elev) * Math.cos(yaw));
      }
      const a = Math.min(1, dt * (S.focus ? 1.6 : 2.4)); cam.p.lerp(cam.wp, a); cam.t.lerp(cam.wt, a);
      camera.position.copy(cam.p); camera.lookAt(cam.t);
      void M;
    },
    overlay(ctx, g, api2, H2) { overlay(ctx, g, api, H, camera, recs, field, ticks); },
    dispose() { disposeGroup(); },
  };
}

// ───────────────────────── the 2D overlay: lane heads, step labels, month axis, the readout and the key ─────────────────────────
const msg = (ctx, g, text, y) => { ctx.save(); ctx.globalAlpha = g.fade; ctx.fillStyle = g.C.tx2; ctx.font = '13px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(text, g.W / 2, y ?? g.H / 2); ctx.restore(); };
const arrow = bp => (bp > 1.99 ? '▲' : bp < -1.99 ? '▼' : '•');
const toneOf = (C, bp) => (bp > 1.99 ? C.up : bp < -1.99 ? C.dn : C.tx2);

function overlay(ctx, g, api, H, camera, recs, field, ticks) {
  const { W, H: HH, C, fade } = g, M = S.model, cp = g.compact;
  if (!M) { return msg(ctx, g, S.status === 'fail' ? 'The rate-pricing feeds are not available right now, so there are no paths to draw.' : S.status === 'empty' ? 'No central bank pricing has been pulled yet (the futures strip, the ZQ path and the BoE curve are all empty).' : 'Reading what the rate markets price...'); }
  ctx.save(); ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  const now = Date.now(), focus = S.focus ? recs.find(r => r.ln.ccy === S.focus) : null;
  // title
  ctx.textAlign = 'left'; ctx.globalAlpha = fade; ctx.fillStyle = C.blue; ctx.font = `600 ${cp ? 13 : 15}px ui-monospace,monospace`;
  const ty = cp ? 92 : 104; ctx.fillText('RATE PATHS', 16, ty);
  ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = C.tx2;
  ctx.fillText(cp ? `priced moves at each meeting · ${asOfWords(M)}` : `what futures and OIS price at each policy meeting, next ~13 months · ${asOfWords(M)}`, 16, ty + 16);

  // reserved areas (never drawn): the title, the readout panel; the key below is kept clear by the placement height
  let nb = 0; const res = (x, y, w, h) => { const b = BOX[nb++]; Object.assign(b, { x, y, w, h, pri: 100, text: '', sub: '', col: '', ax: 0, ay: 0, kind: 'x', tries: null }); };
  res(0, 0, W, cp ? 146 : 124);
  if (!cp) res(W - 362, 126, 362, focus ? 20 + focus.ln.meetings.length * 15 : 14 + M.lanes.length * 17 + (M.missing.length ? 16 : 0));
  ctx.font = '11px ui-monospace,monospace';
  // month axis along the right edge of the field
  for (let i = 0; i < ticks.length && !focus; i++) {
    if (cp && i % 2) continue; const p = H.toScreen([field.xr + SP * 0.62, 0, -ticks[i].f * DEPTH], camera); if (!p.vis) continue;
    const b = BOX[nb++]; Object.assign(b, { x: p.x + 4, y: p.y - 8, w: ctx.measureText(ticks[i].label).width + 4, h: 12, pri: 1, text: ticks[i].label, sub: '', col: C.tx2, ax: 0, ay: 0, kind: 'm', tries: null });
  }
  // the scale post's bp marks
  const stepT = M.scaleBp > 100 ? 50 : 25, top = Math.floor(M.scaleBp / stepT) * stepT;
  if (!focus) for (let v = -top; v <= top + 1e-6; v += stepT) {
    if (cp && Math.abs(v) !== top) continue; const y = heightOf(v, M.scaleBp, HU).y, p = H.toScreen([field.xl - SP * 0.55 - 0.15, y, -DEPTH * 0.35], camera); if (!p.vis) continue;
    const tx = v === 0 ? 'rate now' : bpText(v); const b = BOX[nb++]; Object.assign(b, { x: p.x - ctx.measureText(tx).width - 10, y: p.y - 6, w: ctx.measureText(tx).width + 4, h: 12, pri: 2, text: tx, sub: '', col: C.tx2, ax: 0, ay: 0, kind: 'm', tries: null });
  }
  // lane heads: bank and rate today, total priced (with an arrow); each is a click target
  for (const r of recs) {
    const p = H.toScreen([r.x, 0, Z0 + 0.45], camera); if (!p.vis || nb >= BOX.length) continue;
    const name = cp ? r.ln.bank : `${r.ln.bank} ${fin(r.ln.policy) ? r.ln.policy.toFixed(2) + '%' : ''}`, tot = cp ? `${arrow(r.ln.totalBp)}${bpText(r.ln.totalBp)}` : `${arrow(r.ln.totalBp)}${bpText(r.ln.totalBp)} by ${dateLabel(r.ln.meetings.at(-1).date, now)}`;
    ctx.font = `600 ${cp ? 11 : 12}px ui-monospace,monospace`; const w1 = ctx.measureText(name).width; ctx.font = '11px ui-monospace,monospace'; const w = Math.max(w1, ctx.measureText(tot).width) + 6;
    const b = BOX[nb++]; Object.assign(b, { x: p.x - w / 2, y: p.y + 4, w, h: 28, pri: 50, text: name, sub: tot, col: toneOf(C, r.ln.totalBp), ax: p.x, ay: p.y, kind: 'h', rec: r, tries: HEAD_TRIES });
  }
  // step labels: the next meeting on each lane (overview), or every meeting on the focused lane
  ctx.font = '11px ui-monospace,monospace';
  const lab = (r, rs, k, pri) => {
    const p = H.toScreen([r.x, rs.y, rs.z], camera); if (!p.vis || nb >= BOX.length) return;
    const mt = rs.mt, t1 = `${dateLabel(mt.date, now)}  ${cp ? `${bpText(mt.stepBp)} · ${Math.round(Math.min(1, mt.prob) * 100)}% ${mt.stepBp < 0 ? 'cut' : 'hike'}` : stepWords(mt.stepBp, mt.prob)}`;
    const t2 = focus ? `rate priced ${fin(mt.rate) ? mt.rate.toFixed(2) + '%' : 'n/a'} · ${bpText(mt.cumBp)} so far${r.ln.ghost?.[k] != null ? ` · was ${bpText(r.ln.ghost[k])}` : ''}` : '';
    const w = Math.max(ctx.measureText(t1).width, t2 ? ctx.measureText(t2).width : 0) + 10, h = t2 ? 30 : 16, up = mt.cumBp >= 0;
    const b = BOX[nb++]; Object.assign(b, { x: clamp(p.x + 10, 4, W - w - 4), y: p.y + (up ? -h - 12 : 12), w, h, pri, text: t1, sub: t2, col: toneOf(C, mt.stepBp), ax: p.x, ay: p.y, kind: 's', tries: null });
  };
  if (focus) focus.risers.forEach((rs, k) => lab(focus, rs, k, 10 - k * 0.1));
  else { const order = [...recs].sort((a, b) => Math.abs(b.risers[0]?.mt.stepBp ?? 0) - Math.abs(a.risers[0]?.mt.stepBp ?? 0)); order.slice(0, cp ? 3 : 8).forEach((r, i) => { if (r.risers[0]) lab(r, r.risers[0], 0, 9 - i); }); }
  placeLabels(BOX, { W, H: HH - (cp ? 136 : 112), n: nb, order: ORD, kept: KEPT, tries: [0, -1, 1, -2, 2, -3, 3, -4] });
  for (let i = 0; i < nb; i++) {
    const b = BOX[i]; if (b.kind === 'x') continue;
    if (b.kind === 'h') {   // a lane head is a click target: drawn even if it could not find a clear spot
      const r = b.rec, dim = focus && focus !== r ? 0.35 : 1; g.hit(`rp:${r.ln.ccy}`, b.x + b.w / 2, b.y + 12);
      if (b.ok && Math.abs(b.y - (b.ay + 4)) > 1) { ctx.globalAlpha = fade * 0.4 * dim; ctx.strokeStyle = C.tx2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(b.ax, b.ay); ctx.lineTo(b.x + b.w / 2, b.y); ctx.stroke(); }
      ctx.textAlign = 'center'; ctx.globalAlpha = fade * dim; ctx.font = `600 ${cp ? 11 : 12}px ui-monospace,monospace`; ctx.fillStyle = focus === r ? C.blue : C.tx; ctx.fillText(b.text, b.x + b.w / 2, b.y + 11);
      ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = b.col; ctx.fillText(b.sub, b.x + b.w / 2, b.y + 25); continue;
    }
    if (!b.ok) continue;
    if (b.kind === 'm') { ctx.textAlign = 'left'; ctx.globalAlpha = fade * 0.85; ctx.fillStyle = b.col; ctx.fillText(b.text, b.x, b.y + 10); continue; }
    ctx.globalAlpha = fade * 0.55; ctx.strokeStyle = b.col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(b.ax, b.ay); ctx.lineTo(clamp(b.ax, b.x, b.x + b.w), b.y + (b.ay < b.y ? 0 : b.h)); ctx.stroke();
    ctx.globalAlpha = fade * 0.72; ctx.fillStyle = 'rgba(0,0,0,0.82)'; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.globalAlpha = fade * 0.6; ctx.strokeStyle = b.col; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    ctx.textAlign = 'left'; ctx.globalAlpha = fade; ctx.fillStyle = b.col; ctx.fillText(b.text, b.x + 5, b.y + 12);
    if (b.sub) { ctx.fillStyle = C.tx2; ctx.fillText(b.sub, b.x + 5, b.y + 26); }
  }
  if (!cp) readout(ctx, g, M, focus, now); else readoutCompact(ctx, g, M, focus, now);
  key(ctx, g, M, focus);
  ctx.restore();
}

const asOfWords = M => { const a = M.lanes.map(l => l.asOf).filter(Boolean).map(s => String(s).slice(0, 10)).sort(); return a.length ? `priced ${dateLabel(a.at(-1))}` : 'pricing date n/a'; };

/** Desktop: the ranking (overview) or the focused bank's meeting table, top right. */
function readout(ctx, g, M, focus, now) {
  const { W, C, fade } = g, w = 330, x = W - w - 16, y0 = 96;
  ctx.textAlign = 'left'; ctx.font = '11px ui-monospace,monospace';
  if (focus) {
    const ln = focus.ln, rows = ln.meetings, h = 62 + rows.length * 15;
    ctx.globalAlpha = fade * 0.75; ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(x - 8, y0 - 14, w + 16, h);
    ctx.globalAlpha = fade; ctx.fillStyle = C.blue; ctx.font = '600 12px ui-monospace,monospace'; ctx.fillText(`${ln.name}  ·  ${fin(ln.policy) ? ln.policy.toFixed(2) + '% now' : ''}`, x, y0);
    ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = C.tx2; ctx.fillText(clip(ln.src, 52), x, y0 + 15);
    ctx.fillText('meeting      step     total    rate', x, y0 + 34);
    rows.forEach((m, i) => { const yy = y0 + 50 + i * 15; ctx.fillStyle = C.tx; ctx.fillText(dateLabel(m.date, now).padEnd(12), x, yy); ctx.fillStyle = toneOf(C, m.stepBp); ctx.fillText(`${arrow(m.stepBp)}${bpText(m.stepBp)}`.padEnd(9), x + 86, yy); ctx.fillStyle = toneOf(C, m.cumBp); ctx.fillText(bpText(m.cumBp).padEnd(8), x + 158, yy); ctx.fillStyle = C.tx2; ctx.fillText(fin(m.rate) ? `${m.rate.toFixed(2)}%` : '', x + 224, yy); });
    button(ctx, g, x + w - 70, y0 - 2, 'ALL LANES', 'rp:all');
    return;
  }
  const L = M.lanes, h = 40 + L.length * 17 + (M.missing.length ? 16 : 0), mx = Math.max(25, ...L.map(l => Math.abs(l.totalBp))), bx = x + 104, bw = 52;
  ctx.globalAlpha = fade * 0.7; ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(x - 8, y0 - 14, w + 16, h);
  ctx.globalAlpha = fade; ctx.fillStyle = C.blue; ctx.font = '600 11px ui-monospace,monospace'; ctx.fillText('PRICED OVER THE WINDOW  ·  click a lane', x, y0);
  ctx.font = '11px ui-monospace,monospace';
  L.forEach((l, i) => {
    const yy = y0 + 20 + i * 17, len = Math.abs(l.totalBp) / mx * bw;
    ctx.globalAlpha = fade; ctx.fillStyle = C.tx; ctx.fillText(l.bank, x, yy); ctx.fillStyle = C.tx2; ctx.fillText(fin(l.policy) ? `${l.policy.toFixed(2)}%` : '', x + 46, yy);
    ctx.globalAlpha = fade * 0.4; ctx.fillStyle = C.tx2; ctx.fillRect(bx + bw, yy - 9, 1, 11);
    ctx.globalAlpha = fade * 0.85; ctx.fillStyle = toneOf(C, l.totalBp); ctx.fillRect(l.totalBp < 0 ? bx + bw - len : bx + bw + 1, yy - 7, len, 7);
    ctx.globalAlpha = fade; ctx.fillText(`${arrow(l.totalBp)}${bpText(l.totalBp)}`, x + 222, yy);
    if (l.movedBp != null) { ctx.fillStyle = C.tx2; ctx.globalAlpha = fade * 0.85; ctx.fillText(`${l.movedBp >= 0 ? '+' : '-'}${Math.abs(Math.round(l.movedBp))}`, x + 290, yy); }
    g.hit(`rp:${l.ccy}`, x + 20, yy - 4);
  });
  ctx.fillStyle = C.tx2; ctx.globalAlpha = fade * 0.75; ctx.fillText('priced bp by window end · Δ vs ghost (bp)', x, y0 + 20 + L.length * 17);
  if (M.missing.length) { ctx.fillText(clip(`no path: ${M.missing.map(m => `${m.bank} (${m.why})`).join('; ')}`, 54), x, y0 + 36 + L.length * 17); }
}

/** Phone: two short lines under the title; the focused lane's next steps. */
function readoutCompact(ctx, g, M, focus, now) {
  const { W, C, fade } = g; ctx.textAlign = 'left'; ctx.font = '11px ui-monospace,monospace';
  if (focus) {
    const ln = focus.ln; ctx.globalAlpha = fade; ctx.fillStyle = C.blue; ctx.fillText(`${ln.bank} ${fin(ln.policy) ? ln.policy.toFixed(2) + '%' : ''} · ${arrow(ln.totalBp)}${bpText(ln.totalBp)} by ${dateLabel(ln.meetings.at(-1).date, now)}`, 16, 124);
    ctx.fillStyle = C.tx2; ctx.fillText(clip(ln.src, 44), 16, 140); button(ctx, g, W - 100, 120, 'ALL LANES', 'rp:all', 84, 30); return;
  }
  const e = M.lanes[0], h = M.lanes.at(-1); ctx.globalAlpha = fade;
  if (e && e.totalBp < -2) { ctx.fillStyle = C.dn; ctx.fillText(`most easing: ${e.bank} ${bpText(e.totalBp)}`, 16, 124); }
  if (h && h.totalBp > 2) { ctx.fillStyle = C.up; ctx.fillText(`most tightening: ${h.bank} ${bpText(h.totalBp)}`, 16, 139); }
  void W;
}

function button(ctx, g, x, y, label, key, w = 70, h = 20) {
  const { C, fade } = g; ctx.globalAlpha = fade * 0.85; ctx.fillStyle = 'rgba(0,0,0,0.82)'; ctx.fillRect(x, y - h / 2 - 4, w, h); ctx.strokeStyle = C.blue; ctx.strokeRect(x + 0.5, y - h / 2 - 3.5, w - 1, h - 1);
  ctx.globalAlpha = fade; ctx.fillStyle = C.tx; ctx.textAlign = 'center'; ctx.fillText(label, x + w / 2, y + 1); ctx.textAlign = 'left'; g.hit(key, x + w / 2, y - 4);
}
const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function key(ctx, g, M, focus) {
  const { W, H, C, fade } = g, cp = g.compact; ctx.textAlign = 'left'; ctx.font = '11px ui-monospace,monospace';
  const y = H - (cp ? 128 : 104), cap = M.capped ? ' · steps past ±200bp are capped' : '';
  ctx.globalAlpha = fade * 0.9;
  if (cp) {
    ctx.fillStyle = C.tx2; ctx.fillText('lanes: most easing left → most tightening right', 16, y);
    ctx.fillStyle = C.up; ctx.fillText('▲ hike', 16, y + 15); ctx.fillStyle = C.dn; ctx.fillText('▼ cut', 76, y + 15); ctx.fillStyle = C.tx2; ctx.fillText('· rail = rate now · dashed = earlier', 124, y + 15);
    ctx.fillText('steps = priced bp per meeting · tap a lane', 16, y + 30);
    ctx.fillStyle = C.gold; ctx.fillText('Market pricing, description only, not a forecast.', 16, y + 45);
    return;
  }
  ctx.fillStyle = C.tx2; ctx.fillText(`lanes left → right: most easing priced → most tightening · rail = policy rate today · height = change priced since today (bp, one scale)${cap}`, 16, y);
  let x = 16; ctx.fillStyle = C.up; ctx.fillText('▲ green = hike', x, y + 16); x += 112; ctx.fillStyle = C.dn; ctx.fillText('▼ red = cut', x, y + 16); x += 92; ctx.fillStyle = C.tx2;
  ctx.fillText(`· ${focus ? 'click ALL LANES to go back' : 'click a lane head to fly along it'} · drag to turn, scroll to zoom`, x, y + 16);
  ctx.fillStyle = C.gold; ctx.fillText('steps = what futures/OIS price at each meeting, in basis points · ghost (dashed) = earlier pricing · market pricing, description only, not a forecast', 16, y + 32);
  void W;
}

registerJarvisModule({
  id: ID, label: 'RATE PATHS',
  render(pane, api) {
    pane.innerHTML = `<h3>RATE PATHS</h3><p>Each central bank is a lane running away from you through the next year of policy meetings. The glowing rail is the policy rate today; the bright staircase steps up or down at each meeting by the move futures or OIS price for it (green up for hikes, red down for cuts), and a faint dashed staircase shows the pricing of a few weeks earlier. Lanes run from the most easing priced on the left to the most tightening on the right. Click a lane head to fly along it.</p><p class="jv-sub">Market pricing, a description only, not a forecast.</p><div class="jv-row"><button type="button" data-rp="go">▶ SHOW THE PATHS</button></div>`;
    pane.querySelector('[data-rp="go"]').onclick = () => { api.setView(ID); loadPaths(api, true); };
  },
  views: [glView({
    id: ID, label: 'RATE PATHS', env: { accent: 'blue2', chrome: 'clean', scan: false }, setup,
    onEnter: api => { S.showP = -1; S.focus = null; S.spin = api.st.spin; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); loadPaths(api); },
    onLeave: api => { S.showP = -1; if (S.spin != null) api.st.spin = S.spin; S.spin = null; },
  })],
});

await import('./jarvisViewReactor.js').catch(() => null);   // so the 'reactor' scene is registered before this one asks to follow it
registerShowScene({
  id: ID, after: 'reactor',
  prepare: api => loadPaths(api).catch(() => null),
  build: (inp, data) => {
    const M = data ?? S.model, text = M ? ratePathsScript(M) : null; if (!text) return null;
    return { title: 'Rate paths', view: ID, cam: null, text,
      enter: api => { S.focus = null; S.showFocus = false; S.showP = 0; S.showAt = Date.now(); Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); },
      motion: (api, p) => { S.showP = clamp(p, 0, 1); S.showAt = Date.now(); } };
  },
});
