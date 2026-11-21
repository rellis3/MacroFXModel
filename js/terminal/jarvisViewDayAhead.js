// js/terminal/jarvisViewDayAhead.js: Jarvis's DAY AHEAD hologram: today's release schedule as a glowing 24-hour clock lying on the projector table (London time, like the rest of the desk).
// What it shows: the clock ring with an hour tick every hour and a label every three; the three trading sessions (Asia, London, New York) as coloured arcs just inside it; a sweeping NOW hand with a
// bright comet head, and the part of the day already gone drawn dimmer; one pylon per scheduled release standing on the ring at its London time; and, when the desk has it, a ridge ring inside the
// sessions tracing the typical share of the day's range traded in each hour. The next high-impact release still to come gets a countdown floating over the centre. Click a pylon for its card.
//
// ENCODING
//   angle        = London clock time (00:00 at the far side, clockwise, a full turn per day)
//   pylon height = impact rank, proportional (low 1/3, medium 2/3, high full height); ranks above 3 would be capped at full height and the card says so
//   pylon colour = the currency's region (gold Americas, cyan Europe, green Asia-Pacific, grey other) AND the currency code on its label/card (colour is never the only cue)
//   pylons at the same minute stand side by side (lanes just outside / inside the ring), never inside each other
//   ridge        = typical activity by hour: the average share of the day's high-low range each London hour traded, over the FX pairs in the session statistics (radial distance from the base circle)
//   dim          = already happened today (or printed); bright = still to come
//
// Data: /api/calendar-feed (ForexFactory's week ahead: impact, forecast, previous; Nasdaq's printed rows: actual, consensus, previous), /api/calendar-events (the calendar archive, medium impact),
// /api/event-day (the desk's rate decisions and big US releases, with the Release Reaction history line) and /api/vol-forecast/intraday-profile (hourly profile). Maths in dayAheadCore.js.
// DESCRIPTION ONLY: a timetable and a typical-activity profile. Nothing here says what a release will print or which way anything goes.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { glView } from './jarvisGL.js';
import { SESSIONS, REGION_LABEL, londonParts, polar, angleOf, laneOffset, pylonHeight, mergeDay, nextBig, countdown, hourProfile, ridgeAt, placeLabels, dayScript, sweepMins } from './dayAheadCore.js';

const R = 3, R_SESS = 2.68, RB = 1.2, RA = 1.08, FULL = 1.5, TTL = 10 * 60_000, NR = 289, TAIL = 70, MAXP = 64;
const ORIGIN = Array(3).fill(0);
const KEY = 'pylons = scheduled releases, height = importance · ridge = typical activity by hour · schedule only, not a forecast';
const S = { day: null, prof: null, feedOk: false, status: 'loading', at: 0, busy: null, sel: null, showP: -1, showAt: 0, date: '' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const nowMs = api => (Number.isFinite(api?.st?.daNow) ? api.st.daNow : Date.now());     // st.daNow pins the clock (lab fixtures / replays); normally the real time
const addDays = (date, k) => new Date(Date.parse(date + 'T12:00:00Z') + k * 864e5).toISOString().slice(0, 10);

/** Read today's calendar and the hourly profile once per ten minutes (and again when the London date turns). Never throws; S.status is 'loading' | 'ok' | 'fail'. */
export function loadDay(api, force) {
  const now = nowMs(api), date = londonParts(now).date;
  if (S.busy) return S.busy; if (S.day && !force && S.date === date && Date.now() - S.at < TTL) return Promise.resolve(S.day);
  S.busy = (async () => {
    const ok = p => Promise.resolve().then(() => p()).catch(() => null);
    const [feed, cal, evday, prof] = await Promise.all([ok(() => api.jf('/api/calendar-feed')), ok(() => api.jf(`/api/calendar-events?from=${addDays(date, -1)}&to=${addDays(date, 1)}&minRank=1`)),
      ok(() => api.jf('/api/event-day')), ok(() => api.jf('/api/vol-forecast/intraday-profile'))]);
    try {
      const f = feed?.ok === false ? null : feed, c = cal?.ok === false ? null : cal, e = evday?.ok === false ? null : evday;
      S.day = mergeDay({ feed: f, cal: c, evday: e, now });
      S.feedOk = Array.isArray(f?.ahead) || S.day.events.length > 0;      // the week-ahead feed is the forward source; without it an empty list is no data, not a quiet day S.later = laterBig(f, S.day.date);
      S.prof = prof?.ok === false ? null : hourProfile(prof); S.status = 'ok'; S.date = date; S.stamp = (S.stamp ?? 0) + 1;
    } catch (err) { if (!S.day) S.status = 'fail'; }
    S.at = Date.now(); S.busy = null; return S.day;
  })();
  return S.busy;
}
/** The first high-impact release on a later day in the week-ahead feed, for the centre line once today is done. */
function laterBig(feed, today) {
  for (const d of Array.isArray(feed?.ahead) ? feed.ahead : []) for (const e of Array.isArray(d?.events) ? d.events : []) {
    if (!(e?.rank >= 3) || !Number.isFinite(e?.ms)) continue; const lp = londonParts(e.ms); if (lp.date > today) return { ...lp, ccy: e.ccy, event: e.event };
  }
  return null;
}

function arcPts(r, m0, m1, y, out) {          // points along the ring from minute m0 to m1 (m1 >= m0), every ~5 minutes; at least two
  out.length = 0; const n = Math.max(2, Math.ceil((m1 - m0) / 5) + 1);
  for (let i = 0; i < n; i++) out.push(polar(m0 + (m1 - m0) * i / (n - 1), r, y));
  return out;
}

function setup(L, H, api) {
  const { THREE } = L, kit = H.kit, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 120);
  scene.add(kit.dust(1200, 34, H.color(api.colours?.()?.blue ?? 'lightsteelblue').getStyle()));
  const stat = new THREE.Group(), dyn = new THREE.Group(); scene.add(stat, dyn);
  const tmp = [];
  // the objects that follow the clock (rebuilt by colour, re-shaped every minute)
  const O = { sig: '', min: -1, ringPast: null, ringFut: null, sess: [], ridgePast: null, ridgeFut: null, ridgeMesh: null, ridgeCol: null, hand: null, head: null, halo: null, tail: null, pyl: [], C: null };
  const col = c => H.color(c);
  const dispose = grp => { grp.traverse(o => { o.geometry?.dispose?.(); if (o.material) { kit._mats.delete(o.material); kit._holo.delete(o.material); o.material.dispose?.(); } }); grp.clear(); };

  function buildStatic(C) {
    dispose(stat);
    const tb = kit.table(4.4, C.blue, -0.002, 5, 24); tb.traverse(o => { if (o.material?.uniforms?.k) o.material.uniforms.k.value = 0.07; if (o.isLineSegments) o.material.opacity = 0.07; }); stat.add(tb);
    // hour ticks: every hour, longer every three; quarter-hour dots inside the ring
    const segs = [], big = [];
    for (let h = 0; h < 24; h++) { const a = polar(h * 60, R + 0.03), b = polar(h * 60, R + (h % 3 ? 0.14 : 0.3)); (h % 3 ? segs : big).push([...a, ...b]); }
    for (let q = 0; q < 96; q++) if (q % 4) { const a = polar(q * 15, R - 0.04), b = polar(q * 15, R - 0.1); segs.push([...a, ...b]); }
    stat.add(kit.segments(segs, C.blue, 0.55)); stat.add(kit.segments(big, C.tx, 0.8));
    stat.add(kit.line(arcPts(R + 0.42, 0, 1440, 0, []), C.blue, 1, 0.18));                  // outer guide
    if (S.prof) {
      stat.add(kit.line(arcPts(RB, 0, 1440, 0, []), C.tx2, 1, 0.22));                         // the ridge's base (zero) and full-scale (busiest hour) guides
      stat.add(kit.line(arcPts(RB + RA, 0, 1440, 0, []).filter((_, i) => i % 2 === 0), C.tx2, 1, 0.08));
    }
  }
  function buildDyn(C) {
    dispose(dyn); O.sess.length = 0; O.pyl.length = 0;
    O.ringPast = kit.line(arcPts(R, 0, 1, 0, tmp), C.blue, 1.4, 0.13); O.ringFut = kit.line(arcPts(R, 0, 1, 0, tmp), C.blue, 2.4, 0.85); dyn.add(O.ringPast, O.ringFut);
    for (const s of SESSIONS) { const c = regionCss(C, s.region), p = kit.line(arcPts(R_SESS, s.from, s.to, 0, tmp), c, 2.5, 0.1), f = kit.line(arcPts(R_SESS, s.from, s.to, 0, tmp), c, 3.5, 0.48); dyn.add(p, f); O.sess.push({ s, p, f }); }
    // the ridge: a filled band from the base circle out to the profile (vertex colours carry the past/future brightness), and its edge line
    O.ridgeMesh = null; O.ridgePast = O.ridgeFut = null;
    if (S.prof) {
      const g = new THREE.BufferGeometry(), pos = new Float32Array(NR * 2 * 3), colr = new Float32Array(NR * 2 * 3), idx = [];
      for (let i = 0; i < NR; i++) {
        const m = i / (NR - 1) * 1440, v = ridgeAt(S.prof, m), a = polar(m, RB, 0.004), b = polar(m, RB + RA * v, 0.004);
        pos.set(a, i * 6); pos.set(b, i * 6 + 3); if (i < NR - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(colr, 3)); g.setIndex(idx);
      O.ridgeMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      O.ridgeCol = colr; dyn.add(O.ridgeMesh);
      O.ridgePast = kit.line([polar(0, RB), polar(5, RB)], C.tx2, 1.2, 0.2); O.ridgeFut = kit.line([polar(0, RB), polar(5, RB)], C.tx2, 1.8, 0.6); dyn.add(O.ridgePast, O.ridgeFut);
    }
    // the NOW hand, its comet head and a fading tail along the ring
    O.hand = kit.line([polar(0, 0.28, 0.01), polar(0, R, 0.01)], C.tx, 2, 0.9); O.head = kit.flare(C.tx, 0.5, 1); O.halo = kit.flare(C.blue, 1.2, 0.35);
    O.tail = kit.points(TAIL, C.tx, 7, { colors: true }); dyn.add(O.hand, O.head, O.halo, O.tail);
    // the pylons
    for (const e of (S.day?.events ?? []).slice(0, MAXP)) {
      const c = regionCss(C, e.region), { h } = pylonHeight(e.rank, FULL), r = R + laneOffset(e.lane), base = polar(e.mins, r, 0), top = polar(e.mins, r, h);
      const grp = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, h, 14, 1, true), kit.holo(c, { rim: 1.6, base: 0.08, scan: 1, opacity: 0.8 }));
      shell.position.set(base[0], h / 2, base[2]); grp.add(shell);
      const core = kit.line([base, top], c, e.rank >= 3 ? 2 : 1.4, 0.9); grp.add(core);
      const tip = kit.flare(c, e.rank >= 3 ? 0.24 : 0.15, 1); tip.position.set(top[0], top[1], top[2]); grp.add(tip);
      const foot = kit.flare(c, 0.18, 0.5); foot.position.set(base[0], 0.01, base[2]); grp.add(foot);
      dyn.add(grp); O.pyl.push({ e, grp, shell, core, tip, foot, top, base, h });
    }
    O.min = -1;
  }
  function reshape(nm) {                   // the past/future split, every minute
    O.min = nm;
    kit.setLine(O.ringPast, arcPts(R, 0, Math.max(1, nm), 0, tmp)); kit.setLine(O.ringFut, arcPts(R, nm, 1440, 0, tmp)); O.ringPast.visible = nm > 1;
    for (const { s, p, f } of O.sess) {
      const a = Math.min(Math.max(nm, s.from), s.to);
      p.visible = a > s.from + 1; if (p.visible) kit.setLine(p, arcPts(R_SESS, s.from, a, 0, tmp));
      f.visible = a < s.to - 1; if (f.visible) kit.setLine(f, arcPts(R_SESS, a, s.to, 0, tmp));
    }
    if (O.ridgeMesh) {
      const c = col(O.C.tx2), cr = col(O.C.blue);
      for (let i = 0; i < NR; i++) { const m = i / (NR - 1) * 1440, fut = m >= nm, kb = fut ? 0.02 : 0.006, ke = fut ? 0.16 : 0.04; O.ridgeCol.set([cr.r * kb, cr.g * kb, cr.b * kb], i * 6); O.ridgeCol.set([c.r * ke, c.g * ke, c.b * ke], i * 6 + 3); }
      O.ridgeMesh.geometry.attributes.color.needsUpdate = true;
      const edge = (m0, m1) => { const n = Math.max(2, Math.ceil((m1 - m0) / 5) + 1), out = []; for (let i = 0; i < n; i++) { const m = m0 + (m1 - m0) * i / (n - 1); out.push(polar(m, RB + RA * ridgeAt(S.prof, m), 0.006)); } return out; };
      O.ridgePast.visible = nm > 1; if (nm > 1) kit.setLine(O.ridgePast, edge(0, nm)); kit.setLine(O.ridgeFut, edge(nm, 1440));
    }
    for (const p of O.pyl) { const past = p.e.released; p.shell.material.uniforms.op.value = past ? 0.18 : 0.8; p.core.material.opacity = past ? 0.16 : 0.9; p.tip.material.opacity = past ? 0.18 : 1; p.foot.material.opacity = past ? 0.12 : 0.5; }
  }
  const sig = C => [C.blue, C.tx, C.tx2, C.gold, C.cy, C.up, S.stamp ?? 0].join('|');

  return {
    scene, camera, bloom: { strength: 0.62, radius: 0.42, threshold: 0.22 },
    update(t, dt, api, g) {
      if (S.status !== 'ok' && !S.busy && Date.now() - S.at > 30_000) loadDay(api);
      if (S.day && (Date.now() - S.at > TTL || londonParts(nowMs(api)).date !== S.date)) loadDay(api, true);
      const C = g.C; if (sig(C) !== O.sig) { O.sig = sig(C); O.C = C; buildStatic(C); buildDyn(C); }
      const now = nowMs(api), lp = londonParts(now), nm = lp.mins + (now % 60e3) / 60e3;
      if (Math.floor(nm) !== O.min) reshape(Math.floor(nm));
      // the hand, head and tail
      const tip = polar(nm, R, 0.012); kit.setLine(O.hand, [polar(nm, 0.28, 0.012), polar(nm, R + 0.32, 0.012)]);
      const pulse = H.calm ? 1 : 0.85 + 0.15 * Math.sin(t * 3.1);
      O.head.position.set(tip[0], 0.03, tip[2]); O.head.scale.setScalar(0.5 * pulse); O.halo.position.set(tip[0], 0.02, tip[2]);
      const ta = O.tail.geometry.attributes.position.array, tc = O.tail.geometry.attributes.color.array, cc = col(C.tx);
      for (let i = 0; i < TAIL; i++) { const p = polar(nm - i * 1.6, R, 0.015); ta[i * 3] = p[0]; ta[i * 3 + 1] = p[1]; ta[i * 3 + 2] = p[2]; const k = Math.pow(1 - i / TAIL, 2.2); tc[i * 3] = cc.r * k; tc[i * 3 + 1] = cc.g * k; tc[i * 3 + 2] = cc.b * k; }
      O.tail.geometry.attributes.position.needsUpdate = true; O.tail.geometry.attributes.color.needsUpdate = true;
      // the next big release breathes; the selected pylon gets a bright foot
      const nb = S.day ? nextBig(S.day, now) : null;
      for (const p of O.pyl) {
        const isN = nb && p.e.id === nb.id, isS = S.sel === p.e.id, k = isN && !H.calm ? 1 + 0.25 * Math.sin(t * 4) : 1;
        p.tip.scale.setScalar((p.e.rank >= 3 ? 0.24 : 0.15) * k * (isS ? 1.6 : 1)); p.foot.scale.setScalar(isS ? 0.45 : 0.18);
      }
      // camera: faces a clock time a little ahead of now (drifting slowly), or sweeps from now to the last release during the SHOW
      const evs = S.day?.events ?? [], last = evs.length ? evs[evs.length - 1].mins : null, show = S.showP >= 0 && Date.now() - S.showAt < 1500;
      const face = show ? sweepMins(lp.mins, last, S.showP) + 60 : nm + 150 + (H.calm ? 0 : Math.sin(t * 0.045) * 70);
      const asp = g.W / Math.max(1, g.H), dist = 10.6 * (asp < 1.2 ? Math.min(2.25, 1.15 / Math.pow(asp, 0.8)) : 1), el0 = asp < 1 ? 1.0 : 0.8;
      H.orbit(camera, api.st, { dist, target: polar(face, 0.5, 0.2), elev: show ? el0 - 0.02 + 0.1 * Math.sin(S.showP * Math.PI) : el0, lo: 0.12, hi: 1.4, yawAdd: Math.PI - angleOf(face) });
    },
    overlay(ctx, g, api) { overlay(ctx, g, api, H, camera, O); },
    dispose() { dispose(stat); dispose(dyn); },
  };
}

function regionCss(C, region) { return region === 'americas' ? C.gold : region === 'europe' ? C.cy : region === 'asia' ? C.up : C.tx2; }

function text(ctx, s, x, y, col, font, al = 1, align = 'left') {
  ctx.font = font; ctx.textAlign = align; ctx.globalAlpha = al; ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillText(s, x + 1, y + 1); ctx.fillStyle = col; ctx.fillText(s, x, y);
}
function wrap(ctx, s, w) { const out = []; let line = ''; for (const word of String(s).split(/\s+/)) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t; } if (line) out.push(line); return out; }
function panel(ctx, C, x, y, w, h, fade, a = 0.82) { ctx.globalAlpha = a * fade; ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 0.45 * fade; ctx.strokeStyle = C.blue; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }

function overlay(ctx, g, api, H, camera, O) {
  const { W, H: HH, C, fade, compact } = g, st = api.st, now = nowMs(api), lp = londonParts(now), day = S.day, F = 'ui-monospace,monospace';
  if (typeof st.sel === 'string' && st.sel.startsWith('da:')) { const k = st.sel.slice(3); S.sel = k === 'x' || k === S.sel ? null : k; st.sel = null; api.blip?.(780, 0.05); }
  ctx.save(); ctx.textBaseline = 'alphabetic';
  const P = (p) => H.toScreen(p, camera), taken = [];
  // hour labels (London)
  for (let h = 0; h < 24; h += compact ? 6 : 3) {
    const s = P(polar(h * 60, R + 0.62)); if (!s.vis) continue;
    const cur = Math.floor(lp.mins / 60) === h; taken.push({ x: s.x - 10, y: s.y - 8, w: 20, h: 14 }); text(ctx, String(h).padStart(2, '0'), s.x, s.y + 4, cur ? C.tx : C.tx2, `${cur ? '600 ' : ''}${compact ? 11 : 12}px ${F}`, 0.9 * fade, 'center');
  }
  // session names on their arcs
  // the NOW tag at the comet head
  const hp = P(polar(lp.mins, R + 0.95, 0.02)); if (hp.vis) { text(ctx, `NOW ${lp.hm}`, hp.x, hp.y + 4, C.tx, `600 12px ${F}`, fade, 'center'); taken.push({ x: hp.x - 40, y: hp.y - 10, w: 80, h: 18 }); }
  if (!day) {
    text(ctx, S.status === 'fail' ? 'The calendar could not be read right now.' : "Reading today's calendar...", W / 2, HH * 0.5, C.tx2, `13px ${F}`, fade, 'center');
    ctx.restore(); return;
  }
  // centre: the countdown to the next high-impact release (floating above the middle of the clock)
  const nb = nextBig(day, now), c0 = P(ORIGIN), big = compact ? 15 : 19;
  let l1, l2, tone = C.tx;
  if (!S.feedOk) { l1 = 'NO CALENDAR FEED'; l2 = 'the feeds did not answer: not a quiet day, just no data'; tone = C.gold; }
  else if (nb) { l1 = compact ? `${nb.short}` : `${nb.short} in ${countdown(nb.ms - now)}`; l2 = compact ? `in ${countdown(nb.ms - now)} · ${nb.hm} London` : `${nb.hm} London · next high-impact release`; tone = regionCss(C, nb.region); }
  else { l1 = 'NO MORE HIGH-IMPACT RELEASES TODAY'; l2 = S.later ? `next: ${S.later.dow} ${S.later.hm} ${S.later.ccy} ${S.later.event}` : 'a quiet calendar for the rest of the day'; tone = C.tx2; }
  const bigF = nb ? big : Math.max(12, big - 5);
  ctx.font = `600 ${bigF}px ${F}`; const w1 = ctx.measureText(l1).width; ctx.font = `11px ${F}`; const w2 = ctx.measureText(l2).width, bw = Math.max(w1, w2) + 28, cy = c0.y;
  panel(ctx, C, c0.x - bw / 2, cy - bigF - 14, bw, bigF + 34, fade, 0.55);
  text(ctx, l1, c0.x, cy, tone, `600 ${bigF}px ${F}`, fade, 'center'); text(ctx, l2, c0.x, cy + 15, C.tx2, `11px ${F}`, 0.9 * fade, 'center');
  taken.push({ x: c0.x - bw / 2, y: cy - bigF - 14, w: bw, h: bigF + 34 });
  // header readout (top-left) and the key (bottom)
  const hiAll = day.events.filter(e => e.rank >= 3), done = hiAll.filter(e => e.released).length;
  const dateWord = new Date(now).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' });
  if (!compact) {
    const x = 24, y = 116; panel(ctx, C, x - 10, y - 18, 372, 86, fade, 0.5); taken.push({ x: x - 10, y: y - 18, w: 372, h: 86 });
    text(ctx, `DAY AHEAD · ${dateWord} · London ${lp.hm}`, x, y, C.blue, `600 12px ${F}`, fade);
    text(ctx, S.feedOk ? `${hiAll.length} high-impact release${hiAll.length === 1 ? '' : 's'} today · ${hiAll.length - done} still to come` : 'calendar feed not answering: schedule unknown', x, y + 20, S.feedOk ? C.tx : C.gold, `12px ${F}`, fade);
    text(ctx, `${day.events.length - hiAll.length} medium/low · ${S.prof ? `ridge: ${S.prof.pairs.length} FX pairs` : 'no hourly profile on the desk'}`, x, y + 37, C.tx2, `11px ${F}`, 0.9 * fade);
    text(ctx, 'click a pylon for its card · drag to turn', x, y + 54, C.tx2, `11px ${F}`, 0.7 * fade);
  } else {
    text(ctx, S.feedOk ? `${dateWord} · London ${lp.hm} · ${hiAll.length - done} of ${hiAll.length} high-impact to come` : `${dateWord} · London ${lp.hm} · no calendar feed`, 14, 100, C.tx, `11px ${F}`, fade); taken.push({ x: 0, y: 86, w: W, h: 20 });
  }
  const ky = HH - (compact ? 74 : 40);
  ctx.font = `11px ${F}`; const kl = compact ? wrap(ctx, KEY, W - 28) : [KEY];
  kl.forEach((s, i) => text(ctx, s, W / 2, ky + i * 14, C.tx2, `11px ${F}`, 0.9 * fade, 'center'));
  const chips = [['americas', 'Americas'], ['europe', 'Europe'], ['asia', 'Asia-Pacific']], cyy = ky - 18; let cw = 0; ctx.font = `11px ${F}`;
  for (const [, l] of chips) cw += ctx.measureText(l).width + 30; let cx = W / 2 - cw / 2;
  for (const [r, l] of chips) { ctx.globalAlpha = fade; ctx.fillStyle = regionCss(C, r); ctx.fillRect(cx, cyy - 8, 9, 9); text(ctx, l, cx + 14, cyy, C.tx2, `11px ${F}`, 0.9 * fade); cx += ctx.measureText(l).width + 30; }
  taken.push({ x: 0, y: cyy - 14, w: W, h: HH - cyy + 14 });
  // the card (drawn later, but its space is reserved now so labels avoid it)
  const selE = S.sel ? day.events.find(e => e.id === S.sel) : null, card = selE ? cardBox(g) : null; if (card) taken.push(card);
  // ridge label at the busiest hour
  const items = [], meta = [];
  if (S.prof) { const pk = S.prof.peak * 60 + 30, a = P(polar(pk, RB + RA + 0.05, 0.01)); ctx.font = `11px ${F}`; const s = `typical activity by hour · busiest ${String(S.prof.peak).padStart(2, '0')}:00`; items.push({ x: a.x, y: a.y - 6, w: ctx.measureText(s).width, h: 12, prio: 10 }); meta.push({ s, a, col: C.tx2, f: `11px ${F}` }); }
  for (const s of SESSIONS) { const a = P(polar((s.from + s.to) / 2, R_SESS - 0.28)); if (!a.vis) continue; ctx.font = `11px ${F}`; items.push({ x: a.x, y: a.y + 4, w: ctx.measureText(s.label).width, h: 11, prio: 5 }); meta.push({ s: s.label, a, col: regionCss(C, s.region), f: `11px ${F}`, dim: lp.mins >= s.to, nolead: true }); }
  // pylon labels: every high-impact release (one per same-minute run), the selected one, and hit targets on every pylon top
  for (const p of O.pyl) {
    const e = p.e, t = P(p.top); if (!t.vis) continue;
    g.hit(`da:${e.id}`, t.x, t.y);
    const lead = e.lane === 0, label = (e.rank >= 3 && lead && (!compact || !e.released)) || e.id === S.sel; if (!label) continue;
    const runN = e.lanes > 1 ? day.events.filter(x => x.mins === e.mins && x.rank >= 3 && x.id !== e.id).length : 0;
    const s = `${e.hm} ${e.short}${runN ? ` +${runN}` : ''}`, f = `${e.released ? '' : '600 '}${compact ? 11 : 12}px ${F}`; ctx.font = f;
    items.push({ x: t.x, y: t.y - 10, w: ctx.measureText(s).width, h: 12, prio: (e.id === S.sel ? 100 : 0) + (e.released ? 0 : 20) + e.rank - e.mins / 2000 });
    meta.push({ s, a: t, col: regionCss(C, e.region), f, dim: e.released });
  }
  const pl = placeLabels(items, W, HH, taken);
  pl.forEach((q, i) => {
    if (!q) return; const m = meta[i], it = items[i], al = (m.dim ? 0.55 : 1) * fade;
    if (!m.nolead && (Math.abs(q.y - it.y) > 4 || Math.abs(q.x - it.x) > 4)) { ctx.globalAlpha = 0.45 * al; ctx.strokeStyle = m.col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(m.a.x, m.a.y - 3); ctx.lineTo(q.x, q.y + 2); ctx.stroke(); }
    text(ctx, m.s, q.x, q.y, m.col, m.f, al, 'center');
  });
  if (card) drawCard(ctx, g, selE, card, now);
  ctx.restore();
}

function cardBox(g) { const { W, H, compact } = g; return compact ? { x: 10, y: H - 312, w: W - 20, h: 196 } : { x: W - 384, y: 116, w: 360, h: 236 }; }
function drawCard(ctx, g, e, b, now) {
  const { C, fade } = g, F = 'ui-monospace,monospace', col = regionCss(C, e.region); panel(ctx, C, b.x, b.y, b.w, b.h, fade, 0.92);
  ctx.globalAlpha = fade; ctx.fillStyle = col; ctx.fillRect(b.x, b.y, 3, b.h);
  let y = b.y + 22; const x = b.x + 14;
  text(ctx, `${e.hm} London · ${e.ccy} · ${REGION_LABEL[e.region]}`, x, y, col, `600 12px ${F}`, fade);
  text(ctx, '✕', b.x + b.w - 16, y, C.tx2, `13px ${F}`, fade, 'center'); g.hit('da:x', b.x + b.w - 16, y - 4);
  ctx.font = `600 13px ${F}`; for (const l of wrap(ctx, e.name, b.w - 28).slice(0, 2)) { y += 19; text(ctx, l, x, y, C.tx, `600 13px ${F}`, fade); }
  const imp = ['', 'low', 'medium', 'high'][e.rank] ?? 'high', from = e.rankFrom === 'type' ? ' (rated by release type)' : e.rankFrom === 'desk' ? ' (desk calendar)' : '';
  const rows = [['impact', `${imp}, ${e.rank} of 3${from}`], ['previous', e.previous ?? 'not given'], ['consensus', e.forecast ?? 'not given']];
  if (e.actual != null) rows.push(['actual', e.actual]);
  rows.push(['status', e.released ? (e.actual != null ? 'printed' : 'time has passed') : `due in ${countdown(e.ms - now)}`]);
  y += 8; for (const [k, v] of rows) { y += 17; text(ctx, k, x, y, C.tx2, `11px ${F}`, fade); text(ctx, String(v), x + 86, y, k === 'actual' ? C.tx : C.tx, `12px ${F}`, fade); }
  if (e.line) { ctx.font = `11px ${F}`; const ls = wrap(ctx, e.line.replace(/\s*Tested here:.*$/, ''), b.w - 28); const room = Math.max(0, Math.floor((b.y + b.h - 30 - y) / 14)); ls.slice(0, room).forEach((l, i) => text(ctx, i === room - 1 && ls.length > room ? l.replace(/.{0,2}$/, '…') : l, x, y + 18 + i * 14, C.tx2, `11px ${F}`, 0.9 * fade)); }
  ctx.font = `11px ${F}`; text(ctx, wrap(ctx, `source: ${e.src}`, b.w - 28)[0], x, b.y + b.h - 10, C.tx2, `11px ${F}`, 0.7 * fade);
}

const view = glView({ id: 'ahead', label: 'DAY AHEAD', env: { accent: 'blue2', chrome: 'clean', scan: false }, setup,
  onEnter: api => { Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); S.showP = -1; loadDay(api); },
  onLeave: () => { S.showP = -1; } });

registerJarvisModule({
  id: 'dayahead', label: 'DAY AHEAD',
  render(pane, api) {
    pane.innerHTML = `<h3>DAY AHEAD</h3><p>Today's release schedule as a 24-hour clock on the table, in London time. Each pylon is a scheduled release at its time: taller = more important, coloured by region. The arcs are the Asia, London and New York sessions, the ridge inside them is the typical share of the day's range traded in each hour, and the centre counts down to the next high-impact release.</p>
<div class="jv-row"><button type="button" data-da="go">▶ SHOW THE DAY</button></div><p class="jv-sub">A schedule, not a forecast.</p>`;
    pane.querySelector('[data-da="go"]').onclick = () => { api.setView('ahead'); loadDay(api, true); };
  },
  views: [view],
});

registerShowScene({
  id: 'dayahead', after: 'fxgrid',
  prepare: api => loadDay(api).then(() => (S.day && S.feedOk ? { now: nowMs(api) } : null)).catch(() => null),
  build: (inp, data) => {
    if (!data || !S.day) return null; const text = dayScript(S.day, data.now); if (!text) return null;
    return { title: 'The day ahead', view: 'ahead', cam: null, text, enter: api => { Object.assign(api.st, { yaw: 0.35, pitch: -0.45, zoom: 1, spin: false }); S.sel = null; S.showP = 0; S.showAt = Date.now(); },
      motion: (api, p) => { S.showP = clamp(p, 0, 1); S.showAt = Date.now(); } };
  },
});
