// js/terminal/jarvisViewBook.js: Jarvis's BOOK view, a WebGL hologram (js/terminal/jarvisGL.js): the desk's written morning calls as glowing glass towers on the same street grid as CANDLES
// (FX majors at the front, then the crosses, indices, metals, and energy / farm / crypto at the back).
//
// ENCODING
//   tower       the desk's call on one market. A LONG call rises above the floor in green, a SHORT call hangs below it in red (colour AND direction, plus ▲ / ▼ on the label).
//               EVERY call stands the same height: the height of a tower says nothing about how strongly the desk holds it.
//   width       the card's CONVICTION word, in three steps (thin = low, middle = medium, thick = high), with brightness and a count of rings at the tower's foot (1 / 2 / 3) as
//               second cues, and the word on the label. When the feed carries no conviction (the ratings-only summary) the tower is hollow and the label says "n/a".
//   plinth      a flat card: a low plinth in the card's own wording, solid outline = "Neutral - reviewed" (the desk looked, no lean), dashed = "Not reviewed" (nobody looked).
//   cyan bar    beside each tower: what the market actually did today, open to close against its usual move (the same ratio CANDLES uses), on its own linear scale with a
//               notch at every whole usual move; clipped at 3x usual with a gold cap. It is the ONLY height in the view that measures anything.
// WHY: a review flagged that a conviction HEIGHT next to a measured-move HEIGHT invites a false comparison (two heights, no shared scale: "the call said 3, the market did 2").
//      So conviction moved to width / brightness / rings / words, and height is kept for the measured move; the key says "no shared scale" in words.
// Click a tower (or its label) to open the card: the desk's call, conviction, size, today's move and its written thesis. Drag to orbit, wheel to zoom.
// SHOW: the camera starts high over the street, dives low to fly past the highest-conviction calls while the script names them, then rises to a three-quarter view.
// DATA  /api/desk-run (the full run; else /api/desk-run?summary=1, ratings only) and /api/vol-forecast/live (today's open-to-close against its usual move). Cached 5 minutes.
//       Maths: jarvisBookCore.js (rows, shapes, the move scale, the SHOW camera, the spoken script; pure, tested). Grid: jarvisCandles.js.
// DESCRIPTION ONLY: these are the desk's own written calls, not ours and not a forecast. The bias engine's lean (no proven direction skill) is deliberately NOT drawn here.
import { marketName } from './jarvisNames.js';
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { glView, orbitPos } from './jarvisGL.js';
import { candleRows, candleLayout, ROWS } from './jarvisCandles.js';
import { bookRows, bookSummary, bookScript, convWord, callShape, moveHeight, bookShowCam, MOVE_K } from './jarvisBookCore.js';

const ID = 'book', G = 3.2;           // G = world units per CANDLES grid unit (markets 0.19 apart, rows 0.45 apart)
const S = { book: null, layout: null, at: 0, busy: null, err: false, sel: null, showP: -1, showAt: 0, spin: null };
const todayLondon = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
const word = r => (r.state === 'long' ? 'LONG' : r.state === 'short' ? 'SHORT' : r.state === 'neutral' ? 'Neutral - reviewed' : r.state === 'unreviewed' ? 'Not reviewed' : 'Flat');
const CONV_SHORT = ['n/a', 'LOW', 'MED', 'HIGH'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Load the desk's book (full run, else the ratings-only summary) and today's move per market. Cached for 5 minutes; never throws. */
export function loadBook(api, force = false) {
  if (!force && S.book && Date.now() - S.at < 300000) return Promise.resolve(S.book);
  if (S.busy) return S.busy;
  S.busy = (async () => {
    let run = null; for (const u of ['/api/desk-run', '/api/desk-run?summary=1']) { try { const j = await api.jf(u); if (j?.ok && j.head && j.head.ok !== false) { run = j; break; } } catch (e) { /* try the next */ } }
    let moves = {}; try { const v = await api.jf('/api/vol-forecast/live'); moves = Object.fromEntries(candleRows(v?.instruments ?? {}, {}).map(r => [r.key, r.ratio])); } catch (e) { /* the day's move is optional */ }
    const b = run ? bookRows(run, moves) : { rows: [], partial: false, date: null };
    S.book = b.rows.length ? { ...b, sum: bookSummary(b.rows) } : null; S.layout = S.book ? candleLayout(b.rows.map(r => r.key)) : null; S.at = Date.now(); S.err = !S.book;
    return S.book;
  })().finally(() => { S.busy = null; });
  return S.busy;
}

const wrap = (ctx, text, w) => { const out = []; let line = ''; for (const wd of String(text).split(/\s+/)) { const t = line ? `${line} ${wd}` : wd; if (ctx.measureText(t).width > w && line) { out.push(line); line = wd; } else line = t; } if (line) out.push(line); return out; };
const tone = (C, r) => (r.state === 'long' ? C.up : r.state === 'short' ? C.dn : r.state === 'neutral' ? C.tx : C.tx2);
/** The highest-conviction calls' mean grid position: where the SHOW flies low. */
function focusOf(B) {
  const ks = (B?.sum?.top ?? []).filter(k => S.layout?.[k]); if (!ks.length) return null;
  return { x: ks.reduce((s, k) => s + S.layout[k].x, 0) / ks.length * G, z: -ks.reduce((s, k) => s + S.layout[k].z, 0) / ks.length * G };
}

function setup(L, H, api) {
  const { THREE } = L, kit = H.kit, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 120);
  scene.add(kit.dust(900, 30, api.colours?.()?.tx2 || 'white'));
  let grp = null, built = null, C0 = null, recs = [], scan = null, scanZ = [0, 0];
  const cam = { p: new THREE.Vector3(0, 6, 9), t: new THREE.Vector3(), wp: new THREE.Vector3(), wt: new THREE.Vector3() };
  loadBook(api);

  function drop() { if (!grp) return; scene.remove(grp); kit.forget(grp); grp = null; recs = []; scan = null; }
  function box(w, h, d, y0, x, z) { const g = new THREE.BoxGeometry(w, Math.max(0.002, h), d); g.translate(x, y0 + h / 2, z); return g; }
  function build(B, C) {
    drop(); grp = new THREE.Group(); scene.add(grp); built = B; C0 = C;
    // the floor: the CANDLES street grid, scaled; a faint table glow under it
    const xs = Object.values(S.layout).map(p => p.x * G), zs = Object.values(S.layout).map(p => -p.z * G), x0 = Math.min(...xs) - 0.9, x1 = Math.max(...xs) + 0.9, z0 = Math.min(...zs) - 0.8, z1 = Math.max(...zs) + 0.8, fl = [];
    for (let x = Math.floor(x0 / 0.608) * 0.608; x <= x1; x += 0.608) fl.push([x, 0, z0, x, 0, z1]);
    for (let z = z0; z <= z1 + 1e-6; z += 0.36) fl.push([x0, 0, z, x1, 0, z]);
    grp.add(kit.segments(fl, C.blue, 0.1));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(Math.max(x1 - x0, z1 - z0) * 0.62, 80), kit.glowDisc(C.blue, 0.16)); disc.rotation.x = -Math.PI / 2; disc.position.y = -0.003; grp.add(disc);
    scan = kit.line([[x0, 0.004, 0], [x1, 0.004, 0]], C.cy, 2, 0.55); grp.add(scan); scanZ = [z0, z1];
    // one record per market
    for (const r of B.rows) {
      const P = S.layout[r.key]; if (!P) continue;
      const x = P.x * G, z = -P.z * G, sh = callShape(r), mv = moveHeight(r), col = tone(C, r), call = r.call !== 0, w = sh.w * G, h = (sh.y1 - sh.y0) * G, y0 = Math.min(0, sh.y1 * G);
      const rec = { r, x, z, sh, mv, col, mats: [], tip: [x, call ? sh.y1 * G : sh.y1 * G, z] };
      const add = (o, base, kind = 'op') => { grp.add(o); rec.mats.push([o.material, base, kind]); return o; };
      // the tower (or plinth): a glass body, bright edges, a glowing tip
      const geo = box(w * 2, Math.abs(h), w * 2, y0, x, z);
      if (!sh.hollow) add(new THREE.Mesh(geo, kit.holo(col, { rim: 1.8, base: call ? 0.04 + 0.08 * sh.glow : 0.03, scan: call ? 1 : 0, opacity: call ? 0.3 + 0.4 * sh.glow : 0.35 })), call ? 0.3 + 0.4 * sh.glow : 0.35, 'holo');
      const eg = new THREE.EdgesGeometry(geo);
      const em = sh.dashed ? new THREE.LineDashedMaterial({ color: H.color(col), dashSize: 0.05, gapSize: 0.04, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })
        : new THREE.LineBasicMaterial({ color: H.color(col), transparent: true, opacity: call ? 0.45 + 0.5 * sh.glow : 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
      const edges = new THREE.LineSegments(eg, em); if (sh.dashed) edges.computeLineDistances(); add(edges, em.opacity);
      if (call) { const f = kit.flare(col, 0.35 + 0.35 * sh.glow, 0.5 + 0.4 * sh.glow); f.position.set(x, sh.y1 * G, z); add(f, f.material.opacity); rec.flare = f; }
      // conviction rings at the foot: 1 / 2 / 3
      for (let k = 0; k < sh.rings; k++) { const R = w * 1.45 + k * 0.045, pts = Array.from({ length: 41 }, (_, i) => [x + Math.cos(i / 40 * Math.PI * 2) * R, 0.006, z + Math.sin(i / 40 * Math.PI * 2) * R]); const l = kit.line(pts, col, 1.3, 0.55); add(l, 0.55); }
      // today's measured move: a thin cyan bar with a notch at every whole usual move, gold cap when clipped
      if (mv) {
        const bx = x + w + 0.08, bh = mv.y * G, bw = 0.026, bg = box(bw * 2, Math.abs(bh), bw * 2, Math.min(0, bh), bx, z);
        add(new THREE.Mesh(bg, kit.holo(C.cy, { rim: 1.2, base: 0.35, scan: 0, opacity: 0.9 })), 0.9, 'holo');
        const core = kit.line([[bx, 0, z], [bx, bh, z]], C.cy, 2, 0.9); add(core, 0.9);
        if (mv.ticks.length) { const tk = mv.ticks.map(y => [bx - 0.06, y * G, z, bx + 0.06, y * G, z]); add(kit.segments(tk, C.tx, 0.8), 0.8); }
        if (mv.capped) { const cf = kit.flare(C.gold, 0.3, 0.9); cf.position.set(bx, bh, z); add(cf, 0.9); }
        rec.barTop = [bx, bh, z];
      }
      recs.push(rec);
    }
  }

  return {
    scene, camera, bloom: { strength: 0.6, radius: 0.45, threshold: 0.14 },
    update(t, dt, api_, g) {
      const st = api.st;
      if (typeof st.sel === 'string' && st.sel.startsWith('bk:')) { const k = st.sel.slice(3); S.sel = k === 'clear' || k === S.sel ? null : k; st.sel = null; api.blip?.(820, 0.05); }
      const B = S.book; if (!B) { if (grp) drop(); built = null; return; }
      if (built !== B || C0?.blue !== g.C.blue || C0?.up !== g.C.up) build(B, g.C);
      // dim everything but the selection
      for (const rc of recs) {
        const want = !S.sel || S.sel === rc.r.key ? 1 : 0.3; rc.f = (rc.f ?? 1) + (want - (rc.f ?? 1)) * Math.min(1, dt * 5);
        for (const [m, b, kind] of rc.mats) { if (kind === 'holo') m.uniforms.op.value = b * rc.f; else m.opacity = b * rc.f; }
        if (rc.flare) rc.flare.scale.setScalar((0.35 + 0.35 * rc.sh.glow) * (H.calm ? 1 : 1 + 0.12 * Math.sin(t * 2.4 + rc.x * 3)));
      }
      if (scan) { const z = H.calm ? (scanZ[0] + scanZ[1]) / 2 : scanZ[0] + ((t * 0.12) % 1) * (scanZ[1] - scanZ[0]); scan.position.z = z; scan.material.opacity = H.calm ? 0.15 : 0.55; }
      // the camera: the SHOW flight, or the HUD orbit
      const aspect = g.W / Math.max(1, g.H), far = aspect < 1 ? 1.9 : 1, show = S.showP >= 0 && Date.now() - S.showAt < 1500;
      if (show) {
        const sc = bookShowCam(S.showP, focusOf(B)), tg = [sc.target[0], sc.target[1] * G, sc.target[2]], p = orbitPos(sc.yaw, sc.elev, sc.dist * G * far, tg);
        cam.wp.set(...p); cam.wt.set(...tg);
      } else {
        const sw = H.calm ? 0 : Math.sin(t * 0.1) * 0.08, sel = S.sel ? recs.find(r => r.r.key === S.sel) : null, tg = sel ? [sel.x, 0.2, sel.z] : [0, 0, 0.4];
        const o = { yaw0: 0.35, pitch0: -0.45, elev: aspect < 1 ? 0.95 : 0.62, lo: 0.08, hi: 1.4, dist: (sel ? 6.5 : 11.5) * far };
        const a = (api.st.yaw ?? 0.35) - 0.35 + sw, el = clamp(o.elev - ((api.st.pitch ?? -0.45) + 0.45) * 0.8, o.lo, o.hi), d = o.dist / clamp(api.st.zoom || 1, 0.35, 4);
        cam.wp.set(...orbitPos(a, el, d, tg)); cam.wt.set(...tg);
      }
      const k = Math.min(1, dt * (show ? 3 : 2.4)); cam.p.lerp(cam.wp, k); cam.t.lerp(cam.wt, k); camera.position.copy(cam.p); camera.lookAt(cam.t);
    },
    overlay(ctx, g) { overlay(ctx, g, api, H, camera, recs); },
    dispose() { drop(); },
  };
}

// ───────────────────────── the 2D layer: labels (collision-free), the readout, the key, the card ─────────────────────────
const BOX = Array.from({ length: 96 }, () => ({ x: 0, y: 0, w: 0, h: 0 }));
function overlay(ctx, g, api, H, camera, recs) {
  const { W, H: HH, C, fade } = g, cp = g.compact, B = S.book;
  ctx.save(); ctx.textBaseline = 'alphabetic';
  if (!B) {
    ctx.globalAlpha = fade; ctx.textAlign = 'center'; ctx.font = '13px ui-monospace,monospace'; ctx.fillStyle = C.tx2;
    ctx.fillText(S.busy || !S.at ? 'Reading the desk book...' : 'No desk book for today yet', W / 2, HH / 2);
    ctx.font = '11px ui-monospace,monospace'; if (!S.busy && S.at) ctx.fillText('The desk run has not written its calls, or the feed is unavailable. Nothing is drawn rather than guessed.', W / 2, HH / 2 + 22);
    ctx.restore(); return;
  }
  const s = B.sum, ty = cp ? 92 : 104, topRes = cp ? 150 : 150, botRes = HH - (cp ? 140 : 118);
  let nb = 0; const free = (x, y, w, h) => { for (let i = 0; i < nb; i++) { const b = BOX[i]; if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y) return false; } return true; }, take = (x, y, w, h) => { if (nb < BOX.length) Object.assign(BOX[nb++], { x, y, w, h }); };
  take(0, 0, cp ? W : 470, topRes);
  const sel = S.sel ? B.rows.find(r => r.key === S.sel) : null;
  if (sel && !cp) take(W - 400, 110, 400, 150);
  // row titles along the left edge of the street
  ctx.font = '10px ui-monospace,monospace'; ctx.textAlign = 'right';
  if (!cp) ROWS.forEach(([title, ks]) => {
    if (!title) return; const xs = ks.map(k => S.layout[k]).filter(Boolean); if (!xs.length) return;
    const p = H.toScreen([Math.min(...xs.map(q => q.x)) * G - 0.5, 0, -xs[0].z * G], camera); if (!p.vis) return;
    const w = ctx.measureText(title).width; if (!free(p.x - w, p.y - 10, w, 12)) return; take(p.x - w, p.y - 10, w, 12); ctx.globalAlpha = fade * 0.6; ctx.fillStyle = C.tx2; ctx.fillText(title, p.x, p.y);
  });
  // labels: calls first (high conviction first), then flats when zoomed in or selected; every tower is a click target
  const order = [...recs].sort((a, b) => (b.r.call !== 0) - (a.r.call !== 0) || b.sh.step - a.sh.step || (a.r.key === S.sel ? -1 : 0));
  let named = 0;
  for (const rc of order) {
    const r = rc.r, tip = H.toScreen(rc.tip, camera); if (!tip.vis) continue;
    g.hit('bk:' + r.key, tip.x, tip.y);
    const isSel = r.key === S.sel, call = r.call !== 0;
    if (!isSel && !call && (api.st.zoom ?? 1) < 1.6) continue;
    if (cp && !isSel && named >= 4) continue;
    const nm = marketName(r.key, { short: true }), sub = call ? `${r.call > 0 ? '▲' : '▼'} ${CONV_SHORT[rc.sh.step]}` : r.state === 'neutral' ? 'neutral' : 'not reviewed';
    ctx.font = `600 ${cp ? 10 : 11}px ui-monospace,monospace`; const w = Math.max(ctx.measureText(nm).width, ctx.measureText(sub).width) + 8, h = 26;
    const x = clamp(tip.x - w / 2, 4, W - w - 4), y = r.call < 0 ? tip.y + 8 : tip.y - h - 8;
    if (y < topRes || y + h > botRes) { if (!isSel) continue; }
    if (!isSel && !free(x, y, w, h)) continue; take(x, y, w, h); named++;
    const dim = S.sel && !isSel ? 0.4 : 1;
    ctx.globalAlpha = fade * 0.6 * dim; ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x, y, w, h);
    if (isSel) { ctx.globalAlpha = fade; ctx.strokeStyle = C.cy; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
    ctx.textAlign = 'center'; ctx.globalAlpha = fade * dim; ctx.fillStyle = C.tx; ctx.fillText(nm, x + w / 2, y + 11);
    ctx.font = `${cp ? 10 : 11}px ui-monospace,monospace`; ctx.fillStyle = rc.col; ctx.fillText(sub, x + w / 2, y + 23);
  }
  // readout, top left (on a soft dark backdrop so the glow never washes the words out)
  backdrop(ctx, g, 0, ty - 26, cp ? W : 500, 92);
  ctx.textAlign = 'left'; ctx.globalAlpha = fade; ctx.fillStyle = C.blue; ctx.font = `600 ${cp ? 13 : 15}px ui-monospace,monospace`;
  ctx.fillText("THE DESK'S BOOK", 16, ty);
  ctx.font = '11px ui-monospace,monospace'; ctx.fillStyle = C.tx2;
  ctx.fillText(`${cp ? 'desk calls' : "the desk's own written calls"}${B.date ? `, ${B.date}` : ''}${B.date && B.date !== todayLondon() ? (cp ? ' (latest run)' : ' (the latest run, not today)') : ''}`, 16, ty + 16);
  let x = 16; const y2 = ty + 32;
  for (const [txt, c] of [[`${s.long} long`, C.up], [`${s.short} short`, C.dn], [`${s.neutral} neutral`, C.tx], [`${s.unreviewed + s.unknown} ${B.partial ? 'flat' : 'not reviewed'}`, C.tx2]]) { ctx.fillStyle = c; ctx.fillText(txt, x, y2); x += ctx.measureText(txt).width + 14; }
  if (!B.partial && s.topConv && !cp) { ctx.fillStyle = C.tx; ctx.fillText(`highest conviction: ${s.topConv} (${s.top.slice(0, 4).map(k => marketName(k, { short: true })).join(', ')}${s.top.length > 4 ? ' ...' : ''})`, 16, y2 + 16); }
  const moved = B.rows.filter(r => r.move != null).length; ctx.fillStyle = C.tx2; ctx.fillText(moved ? `today's move read for ${moved} of ${B.rows.length} markets` : "no read of today's move yet (no bars since the open)", 16, y2 + (B.partial || !s.topConv || cp ? 16 : 32));
  // the card
  if (sel) card(ctx, g, sel);
  key(ctx, g, B);
  ctx.restore();
}

/** A soft dark band behind words: fades out to the right so it reads as shade, not a box. */
function backdrop(ctx, g, x, y, w, h) { const gr = ctx.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.save(); ctx.globalAlpha = g.fade; ctx.fillStyle = gr; ctx.fillRect(x, y, w, h); ctx.restore(); }

function card(ctx, g, sel) {
  const { W, C, fade } = g, cp = g.compact, x = cp ? 14 : W - 392, y = cp ? 168 : 124, w = cp ? W - 28 : 376;
  const lines = (() => { ctx.font = '11px ui-monospace,monospace'; return wrap(ctx, sel.why || 'The card carries no written thesis.', w - 16).slice(0, cp ? 3 : 5); })(), h = 50 + lines.length * 14 + 8;
  ctx.globalAlpha = fade * 0.82; ctx.fillStyle = 'rgba(0,0,0,0.82)'; ctx.fillRect(x - 8, y - 18, w + 8, h);
  ctx.globalAlpha = fade * 0.7; ctx.strokeStyle = tone(C, sel); ctx.lineWidth = 1; ctx.strokeRect(x - 7.5, y - 17.5, w + 7, h - 1);
  ctx.textAlign = 'left'; ctx.globalAlpha = fade; ctx.fillStyle = C.tx; ctx.font = `600 ${cp ? 11 : 12}px ui-monospace,monospace`;
  ctx.fillText(`${marketName(sel.key, cp ? { short: true } : undefined)} · the desk's call: `, x, y); const lw = ctx.measureText(`${marketName(sel.key, cp ? { short: true } : undefined)} · the desk's call: `).width;
  ctx.fillStyle = tone(C, sel); ctx.fillText(`${word(sel)}${sel.strong ? ' (strong)' : ''}`, x + lw, y);
  ctx.fillStyle = C.tx2; ctx.font = '11px ui-monospace,monospace';
  ctx.fillText(`conviction ${convWord({ conviction: sel.conv }) ?? 'n/a'}${sel.size != null ? ` · size ${sel.size}` : ''} · today ${sel.move == null ? 'no read' : `${sel.move >= 0 ? '+' : ''}${sel.move.toFixed(1)}x usual move`}`, x, y + 16);
  lines.forEach((s, i) => ctx.fillText(s, x, y + 36 + i * 14));
  ctx.textAlign = 'right'; ctx.fillStyle = C.tx2; ctx.fillText('close ×', x + w - 6, y); g.hit('bk:clear', x + w - 26, y - 4);
}

function key(ctx, g, B) {
  const { H, C, fade } = g, cp = g.compact; ctx.textAlign = 'left'; ctx.font = '11px ui-monospace,monospace'; ctx.globalAlpha = fade * 0.9;
  const y = H - (cp ? 128 : 104); backdrop(ctx, g, 0, y - 18, g.W, cp ? 80 : 76);
  if (cp) {
    ctx.fillStyle = C.up; ctx.fillText('▲ long rises', 16, y); ctx.fillStyle = C.dn; ctx.fillText('▼ short hangs', 112, y); ctx.fillStyle = C.tx2; ctx.fillText('· plinth = flat', 216, y);
    ctx.fillText(B.partial ? 'width: conviction not in this feed' : 'width + rings = conviction (low/med/high)', 16, y + 15);
    ctx.fillStyle = C.cy; ctx.fillText("cyan bar = today's move vs usual (the only scale)", 16, y + 30);
    ctx.fillStyle = C.gold; ctx.fillText("The desk's own calls: a description, not a forecast.", 16, y + 45);
    return;
  }
  ctx.fillStyle = C.up; ctx.fillText('▲ green rises = long', 16, y); ctx.fillStyle = C.dn; ctx.fillText('▼ red hangs = short', 178, y); ctx.fillStyle = C.tx2;
  ctx.fillText('· low plinth = flat: solid "Neutral - reviewed", dashed "Not reviewed" · click a tower for the card · drag to orbit', 334, y);
  ctx.fillText(B.partial ? 'every call is one height (direction only) · conviction is not in the summary feed, so towers are hollow and say n/a' : 'every call is one height (direction only) · conviction = tower width, brightness and rings at its foot (1 low, 2 medium, 3 high)', 16, y + 16);
  ctx.fillStyle = C.cy; ctx.fillText("cyan bar = what the market did today, open to close against its usual move (notch = 1x usual, gold cap = clipped at 3x). No shared scale: only the cyan bar is measured.", 16, y + 32);
  ctx.fillStyle = C.gold; ctx.fillText("The desk's own written calls, not a forecast. The bias engine's lean is not drawn here (no proven direction skill).", 16, y + 48);
}

const hologram = glView({
  id: ID, label: 'BOOK', env: { accent: 'blue2', chrome: 'clean', scan: false }, setup,
  onEnter: api => { S.showP = -1; S.sel = null; S.spin = api.st.spin; Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); loadBook(api, true); },
  onLeave: api => { S.showP = -1; if (S.spin != null) api.st.spin = S.spin; S.spin = null; },
});

registerShowScene({
  id: 'book', after: 'lean',
  prepare: api => loadBook(api),
  build(inp, book) {
    const text = bookScript(book); if (!text) return null;
    return { title: "The desk's calls", view: 'book', cam: null, text,
      enter: api => { S.sel = null; S.showP = 0; S.showAt = Date.now(); api.st.spin = false; },
      motion: (api, p) => { api.st.spin = false; S.showP = clamp(p, 0, 1); S.showAt = Date.now(); } };
  },
});

registerJarvisModule({
  id: 'book', label: 'BOOK',
  render(pane, api) {
    const { esc } = api; pane.innerHTML = "<h3>THE DESK'S BOOK</h3><p class=\"jv-sub\">Reading the desk's morning calls...</p>";
    loadBook(api, true).then(B => {
      if (!B) { pane.innerHTML = "<h3>THE DESK'S BOOK</h3><p>No desk book for today yet.</p>"; return; }
      const s = B.sum, order = { long: 0, short: 1, neutral: 2, unreviewed: 3, unknown: 3 }, rows = [...B.rows].sort((a, b) => order[a.state] - order[b.state] || b.h - a.h || a.key.localeCompare(b.key));
      const calls = rows.filter(r => r.call !== 0);
      pane.innerHTML = `<h3>THE DESK'S BOOK${B.date ? ` · ${esc(B.date)}` : ''}</h3><p>The desk's own written calls, not a forecast and not the bias engine. ${s.calls} calls (${s.long} long, ${s.short} short); ${s.neutral} reviewed and neutral; ${s.unreviewed + s.unknown} ${B.partial ? 'flat' : 'not reviewed'}.</p>
<p class="jv-sub">Every call's tower is the same height (it only shows long or short); conviction is its width and the rings at its foot. The thin cyan bar beside it is today's measured move against its usual move, the only height that measures anything.</p>
<div class="jv-row"><button type="button" data-b="go">SHOW THE TOWERS</button></div>
<table class="jv-tab"><thead><tr><th>market</th><th>the desk's call</th><th>conviction</th></tr></thead><tbody>${calls.map(r => `<tr><td>${esc(marketName(r.key))}</td><td>${esc(word(r))}${r.strong ? ' (strong)' : ''}</td><td>${esc(r.conv ?? 'n/a')}</td></tr>`).join('') || '<tr><td colspan="3">No long or short calls today.</td></tr>'}</tbody></table>`;
      pane.querySelector('[data-b="go"]').onclick = () => api.setView('book');
    });
  },
  views: [hologram],
});
