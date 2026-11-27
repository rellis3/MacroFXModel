// js/terminal/reactorCore.js: the PURE half of Jarvis's CHAIN REACTOR view (jarvisViewReactor.js draws it). No DOM, no fetch, no three.js.
//
// The macro chain (js/macroChain.js, judged by evaluateChain and shaped by jarvisCore.buildGraph) as a glowing ring: the ring is cut into the seven THEME sectors, each market is a
// vertical light bar standing at its slot, and each textbook link is an arc over the centre (chord-diagram style). Everything about WHERE things go and WHAT is shown lives here:
// sector angles, bar heights and the 3x cap, which markets get a label (and where, without collisions), which links are visible, the order of the STORY tour and the spoken script.
//
// ENCODING (honest): bar height is LINEAR in |delta| / floor (the move against that market's own noise floor) up to 3x; above 3x the bar stays at full height and is flagged capped.
// Direction is colour (up / dn tone) AND a chevron. DESCRIPTION ONLY: the view shows which textbook links held or broke over the window; nothing here is a forecast or a signal.
import { THEME, THEME_ORDER } from './jarvisCore.js';

export const RING_R = 2.4;        // ring radius (world units)
export const BAR_MAX = 1.5;       // height of a bar at the cap
export const CAP = 3;             // |delta| / floor at which a bar is capped
export const BAR_MIN = 0.035;     // a tiny stub so a market with a move of 0 is still visible as a slot
const TAU = Math.PI * 2;
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The ring: the THEME sectors in THEME_ORDER (an unknown theme goes to 'Other', last), each market a slot. gap = empty slot-widths between sectors.
 *  Angles are in the XZ plane (x = R cos a, z = R sin a), starting at a0. Returns { slots: { key: { angle, sector, i } }, sectors: [{ name, a0, a1, mid, keys }] }. */
export function ringLayout(keys, { gap = 1.1, a0 = -Math.PI / 2 } = {}) {
  const list = [...new Set((keys ?? []).filter(k => typeof k === 'string'))], groups = new Map();
  const order = [...THEME_ORDER, 'Other'];
  for (const name of order) groups.set(name, []);
  const themeKeys = Object.keys(THEME);
  const rank = k => { const i = themeKeys.indexOf(k); return i < 0 ? 1e6 : i; };
  for (const k of [...list].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1))) groups.get(THEME[k] && groups.has(THEME[k]) ? THEME[k] : 'Other').push(k);
  const used = order.filter(n => groups.get(n).length), units = list.length + gap * used.length, step = units > 0 ? TAU / units : 0;
  const slots = {}, sectors = []; let u = gap / 2, i = 0;
  for (const name of used) {
    const ks = groups.get(name), s0 = a0 + u * step;
    for (const k of ks) { slots[k] = { angle: a0 + (u + 0.5) * step, sector: name, i: i++ }; u += 1; }
    const s1 = a0 + u * step; sectors.push({ name, a0: s0, a1: s1, mid: (s0 + s1) / 2, keys: ks }); u += gap;
  }
  return { slots, sectors, step };
}

/** A bar for one graph node: ratio = |delta| / floor; h is linear in ratio up to the cap (smooth, no jumps); capped is flagged; dir 'up'|'down'|null; missing when there is no number. */
export function barSpec(node) {
  const e = node?.end, d = num(e?.delta), f = num(e?.floor), tone = node?.style?.tone ?? 'none';
  if (d == null || !(f > 0)) return { key: node?.key, ratio: null, h: 0, capped: false, tone: 'none', dir: null, moved: false, missing: true, text: e?.text ?? '—' };
  const ratio = Math.abs(d) / f;
  return { key: node.key, ratio, h: barHeight(ratio), capped: ratio > CAP, tone, dir: d > 0 ? 'up' : d < 0 ? 'down' : null, moved: !!e.moved, missing: false, text: e.text ?? '' };
}
/** Height for a ratio: BAR_MIN + (BAR_MAX - BAR_MIN) * min(ratio, CAP) / CAP. Continuous and monotonic; 1x noise sits a third of the way up. */
export const barHeight = r => { const x = num(r); return x == null || x <= 0 ? BAR_MIN : BAR_MIN + (BAR_MAX - BAR_MIN) * Math.min(x, CAP) / CAP; };
/** Every bar, keyed. */
export const bars = graph => Object.fromEntries((graph?.nodes ?? []).filter(n => n?.key).map(n => [n.key, barSpec(n)]));

/** Which markets carry a label: the top n by ratio among those that moved past their noise (or are the wrong-way end of a broken link), plus the selected one and its link partners. */
export function pickLabels(barMap, { n = 8, sel = null, partners = [] } = {}) {
  const all = Object.values(barMap ?? {}), out = all.filter(b => !b.missing && (b.moved || b.tone === 'wrong')).sort((a, b) => b.ratio - a.ratio).slice(0, Math.max(0, n)).map(b => b.key);
  for (const k of [sel, ...partners]) if (k && barMap?.[k] && !out.includes(k)) out.push(k);
  return out;
}

/** Greedy screen-space label placement. items: [{ id, x, y (preferred top-left), w, h, pri (higher first), side: 1 right / -1 left }]; obstacles: [{ x, y, w, h }].
 *  Each label tries its spot, then steps up and down (and a nudge sideways) until it fits inside the bounds without touching anything placed; a label with no room is left out.
 *  Returns [{ id, x, y, w, h }]. */
export function placeLabels(items, { W = 1280, H = 720, pad = 3, obstacles = [], step = 9, tries = 9, top = 0, bottom = 0 } = {}) {
  const placed = obstacles.map(o => ({ ...o, obstacle: true })), out = [];
  const hit = (r) => placed.some(p => r.x < p.x + p.w + pad && r.x + r.w + pad > p.x && r.y < p.y + p.h + pad && r.y + r.h + pad > p.y);
  const inside = r => r.x >= 2 && r.x + r.w <= W - 2 && r.y >= top && r.y + r.h <= H - bottom;
  for (const it of [...(items ?? [])].sort((a, b) => (b.pri ?? 0) - (a.pri ?? 0))) {
    if (![it.x, it.y, it.w, it.h].every(Number.isFinite)) continue;
    let done = null;
    for (let k = 0; k <= tries * 2 && !done; k++) {
      const dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step;
      for (const dx of [0, (it.side ?? 1) * 14]) {
        const r = { x: Math.max(2, Math.min(W - 2 - it.w, it.x + dx)), y: it.y + dy, w: it.w, h: it.h };
        if (inside(r) && !hit(r)) { done = r; break; }
      }
    }
    if (done) { placed.push(done); out.push({ id: it.id, ...done }); }
  }
  return out;
}

/** How each link is drawn: kind 'broken' | 'holding' | 'quiet' (quiet also takes unmeasured / not live); show (quiet links are hidden unless showAll); a = brightness 0..1;
 *  with a selected market, its own links are full and every other link is dimmed. */
export function linkStyles(edges, { showAll = false, sel = null } = {}) {
  return (edges ?? []).map(e => {
    const kind = e?.verdict === 'broken' ? 'broken' : e?.verdict === 'holding' ? 'holding' : 'quiet', mine = !!sel && (e.from === sel || e.to === sel);
    let show = kind !== 'quiet' || showAll || mine, a = kind === 'broken' ? 1 : kind === 'holding' ? 0.4 : 0.16;
    if (sel) a = mine ? Math.max(a, kind === 'quiet' ? 0.45 : 1) : a * 0.12;
    return { id: e?.id, kind, show, a, mine };
  });
}

/** The arc of a link over the centre: a quadratic curve from slot A to slot B on the ring (height y0), its control point pulled in towards the centre and raised.
 *  Raised more for a longer chord so arcs separate. Returns n points [[x, y, z], ...] and the control point. */
export function arcPoints(aAng, bAng, { R = RING_R * 0.97, y0 = 0, n = 32, bow = 0.82, lift = 0.55, liftK = 0.9 } = {}) {
  const ax = Math.cos(aAng) * R, az = Math.sin(aAng) * R, bx = Math.cos(bAng) * R, bz = Math.sin(bAng) * R;
  const chord = Math.hypot(bx - ax, bz - az) / (2 * R), cy = y0 + 2 * (lift + liftK * chord);           // the curve's mid-height is half the control's height
  const c = [(ax + bx) / 2 * (1 - bow), cy, (az + bz) / 2 * (1 - bow)], pts = [];
  for (let i = 0; i < n; i++) { const t = i / (n - 1); pts.push(bez([ax, y0, az], c, [bx, y0, bz], t)); }
  return { pts, c, a: [ax, y0, az], b: [bx, y0, bz] };
}
/** Quadratic Bezier point. */
export const bez = (a, c, b, t) => { const u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], u * u * a[2] + 2 * u * t * c[2] + t * t * b[2]]; };

/** The camera yaw (jarvisGL orbit convention: position = target + d * (sin yaw, ., cos yaw)) that looks at ring angle a from outside. */
export const yawFacing = a => Math.PI / 2 - a;
/** Shortest signed angle from a to b, in (-pi, pi]. */
export const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d <= -Math.PI) d += TAU; return d; };
/** The middle direction of two ring angles (circular mean); for a chord through the centre, a quarter turn from A. */
export function midAngle(a, b) { const x = Math.cos(a) + Math.cos(b), z = Math.sin(a) + Math.sin(b); return Math.hypot(x, z) < 1e-6 ? a + Math.PI / 2 : Math.atan2(z, x); }

/** The STORY tour: the broken links, the biggest combined move first. Each stop has the camera angle (facing the middle of the chord) and the words for its caption. */
export function storyStops(graph, layout, names = {}) {
  const slots = layout?.slots ?? {}, out = [];
  for (const e of graph?.edges ?? []) {
    if (e?.verdict !== 'broken' || !slots[e.from] || !slots[e.to]) continue;
    const l = e.link ?? {}, ra = ratioOf(l.a), rb = ratioOf(l.b), mid = midAngle(slots[e.from].angle, slots[e.to].angle);
    out.push({ id: e.id, from: e.from, to: e.to, short: e.short ?? e.id, textbook: l.textbook ?? '', punch: l.punch ?? '', read: l.read ?? '', fromText: l.a?.text ?? '', toText: l.b?.text ?? '',
      fromName: names[e.from] ?? e.from, toName: names[e.to] ?? e.to, ra, rb, weight: (ra ?? 0) + (rb ?? 0), mid, yaw: yawFacing(mid) });
  }
  return out.sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : 1));
}
const ratioOf = end => { const d = num(end?.delta), f = num(end?.floor); return d != null && f > 0 ? Math.abs(d) / f : null; };

/** Where a 0..1 progress sits in the tour: an overview first (intro share), then each stop in turn. Returns { i (-1 = overview), f (0..1 within it) }. */
export function storyAt(n, p, intro = 0.14) {
  const x = Math.max(0, Math.min(0.99999, num(p) ?? 0));
  if (!(n > 0)) return { i: -1, f: x };
  if (x < intro) return { i: -1, f: x / intro };
  const q = (x - intro) / (1 - intro) * n, i = Math.min(n - 1, Math.floor(q));
  return { i, f: q - i };
}

/** The core's pulse rate in beats a second: a slow breath with nothing broken, faster with each broken link, capped. */
export const pulseRate = broken => 0.22 + 0.28 * Math.min(6, Math.max(0, num(broken) ?? 0));

/** The centre readout: "N links broken · M markets beyond their noise". */
export function readout(sum, barMap) {
  const b = Math.max(0, Math.round(num(sum?.broken) ?? 0)), m = Object.values(barMap ?? {}).filter(x => x.moved).length;
  return `${b} link${b === 1 ? '' : 's'} broken · ${m} market${m === 1 ? '' : 's'} beyond ${m === 1 ? 'its' : 'their'} noise`;
}

/** A link's short name in plain spoken words: 'real yields → gold' -> 'real yields to gold'. */
export function spokenLink(short) {
  return String(short ?? '').replace(/\s*(→|→|->)\s*/g, ' to ').replace(/\$/g, 'the dollar').replace(/USD\/JPY/g, 'dollar yen').replace(/\bAUD\b/g, 'the Aussie').replace(/\bCAD\b/g, 'the Canadian dollar')
    .replace(/\bJGB\b/g, 'Japanese bond').replace(/\b10Y\b/g, 'ten-year').replace(/\bEM\b/g, 'emerging-market').replace(/\s+/g, ' ').trim();
}
const listWords = a => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const nw = n => NUMW[n] ?? String(n);

/** The SHOW line: 2-4 plain sentences from the summary, the broken links by name and the biggest move. Description only. names = key -> plain name for the biggest mover. */
export function reactorScript(sum, stops, barMap, names = {}, floors = null) {
  if (!sum && !(stops?.length)) return null;
  const broken = Math.round(num(sum?.broken) ?? stops?.length ?? 0), judged = Math.round(num(sum?.judged) ?? ((num(sum?.holding) ?? 0) + broken));
  const moved = Object.values(barMap ?? {}).filter(b => b.moved), top = [...moved].sort((a, b) => b.ratio - a.ratio)[0];
  const s = ['The chain reactor: every market on one ring, every textbook link an arc across it.'];
  if (broken > 0 && stops?.length) {
    const nm = stops.slice(0, 4).map(x => spokenLink(x.short)), more = stops.length > 4 ? ` and ${nw(stops.length - 4)} more` : '';
    s.push(`${cap(nw(broken))} of ${judged} testable link${judged === 1 ? '' : 's'} ${broken === 1 ? 'is' : 'are'} broken: ${listWords(nm)}${more}.`);
  } else if (judged > 0) s.push(`All ${judged} testable links are holding; none is broken.`);
  else s.push('No link has both ends moving, so nothing is being tested.');
  if (top) s.push(`${cap(nw(moved.length))} market${moved.length === 1 ? ' is' : 's are'} beyond ${moved.length === 1 ? 'its' : 'their'} normal noise, the largest ${names[top.key] ?? top.key} at ${top.ratio >= 10 ? Math.round(top.ratio) : top.ratio.toFixed(1)} times.`);
  const fl = floors ? floorLine(floors, names) : null; if (fl) s.push(fl);      // beside the fixed floors, never instead of them (Helix review wave 1.5)
  s.push('A description of the window, not a forecast.');
  return s.join(' ');
}
const cap = w => w.charAt(0).toUpperCase() + w.slice(1);

/** A spoken-friendly name for a chain node from its label: drops the bracket, so 'Gold' stays 'Gold' and 'Fear gauge (VIX)' becomes 'the fear gauge'. */
export function plainName(label) {
  const s = String(label ?? '').replace(/\s*\(.*\)\s*$/, '').trim();
  return /^(Fear gauge|Dollar|Inflation expectations|Real yield|Funding|Crack spread)/.test(s) ? `the ${s.charAt(0).toLowerCase()}${s.slice(1)}` : s;
}

// ── adaptive noise floors, shown beside the fixed ones (Helix review wave 1.5) ──
// The chain's floors (js/macroChain.js CHAIN_NODES[k].floor) are fixed 20-day sizes. Here each node's own history gives an adaptive floor: the median absolute 20-session change over
// its last `look` sessions (the drill bundle, /api/drill-series: FRED yields and spreads in percent, so bp = 100 x the change; OANDA prices, so pct = the % change; VIX in points).
// Where the fixed floor is under half the adaptive one, the node reads as "moved" more easily than its own history would say: that is flagged and said, never changed in the live chain.
export const DRILL_KEY = { oil: 'oil', bei: 'bei', us2y: 'us2y', us10y: 'us10y', us30y: 'us30y', real: 'tips', dxy: 'dxy', gold: 'gold', copper: 'copper', audusd: 'audusd', usdcad: 'usdcad', usdjpy: 'usdjpy',
  vix: 'vix', hy: 'hy', nq: 'nq', spx: 'spx', smh: 'smh', xle: 'xle', xlre: 'xlre' };
/** { key: { fixed, adaptive, n, low } } for every node with a drill series of at least 60 sessions. drill = { dates, series: { k: [value|null] } }. */
export function adaptiveFloors(drill, nodes, { window = 20, look = 500 } = {}) {
  const out = {};
  for (const [k, def] of Object.entries(nodes ?? {})) {
    const col = drill?.series?.[DRILL_KEY[k]]; if (!Array.isArray(col) || !(def?.floor > 0)) continue;
    const v = col.map(Number).filter(Number.isFinite).slice(-(look + window)); if (v.length < window + 60) continue;
    const ch = []; for (let i = window; i < v.length; i++) { const a = v[i - window], b = v[i]; const d = def.unit === 'pct' ? (a > 0 ? (b / a - 1) * 100 : NaN) : def.unit === 'bp' ? (b - a) * 100 : b - a; if (Number.isFinite(d)) ch.push(Math.abs(d)); }
    if (ch.length < 60) continue; ch.sort((x, y) => x - y);
    const adaptive = ch.length % 2 ? ch[(ch.length - 1) / 2] : (ch[ch.length / 2 - 1] + ch[ch.length / 2]) / 2;
    out[k] = { fixed: def.floor, adaptive, n: ch.length, low: def.floor < adaptive / 2 };
  }
  return out;
}
/** The spoken sentence for the flagged nodes (names = key -> plain name), or null when no fixed floor is under half its adaptive one. */
export function floorLine(af, names = {}) {
  const all = Object.entries(af ?? {}), low = all.filter(([, x]) => x.low).sort((a, b) => b[1].adaptive / b[1].fixed - a[1].adaptive / a[1].fixed);
  if (!all.length || !low.length) return null;
  const nm = low.slice(0, 3).map(([k]) => names[k] ?? k);
  return `Against each market's own history, the fixed noise floor is under half its usual twenty-day move for ${listWords(nm)}${low.length > 3 ? ` and ${nw(low.length - 3)} more` : ''}, so ${low.length === 1 ? 'it reads' : 'they read'} as moved more easily than ${low.length === 1 ? 'its' : 'their'} history alone would say.`;
}
