/**
 * The terrain chart's live price line (owner request 2026-11-16: "a currency live price line on the terrain chart under OI, so we can see the
 * price on the chart near the levels the terrain shows").
 *
 * The terrain (js/terrainChart.js) is drawn from a STORED OI entry. Its white line is the price at the snapshot's last refresh, so it goes stale. This module
 * adds a second, clearly different line on a transparent canvas laid over the terrain: the price NOW, with its age, and the distance to the nearest
 * labelled level above and below. Only that overlay is repainted on a tick: the terrain itself is not redrawn.
 *
 * Price source: /api/desk-bars (OANDA's own 5-minute bars, the last one forming; one call per market, cached ~60 s on the server and shared by every viewer).
 * Price scale (checked live on 2026-11-16, see plans/TERMINAL_BUILD_LIST.md): the stored entry's `spot` and its levels are already in OANDA's price terms (the
 * futures strikes are shifted by the entry's own basis), and `spot` matched OANDA's bar at the entry's basisAt within 0.03% on 12 of 13 markets (silver 0.17%).
 * So the OANDA price is drawn as it is, with NO offset. If it is ever more than 25% away from the snapshot's spot, the wrong market is mapped: nothing is drawn.
 *
 * Shut market: the last close, labelled "at close" with its time; it is never presented as live. A last bar more than 15 minutes old while the week is open is
 * labelled "last ... old" (a halt or the daily break), not "now".
 *
 * What it says and does not say: where price IS, against the stored levels. The tests of walls as targets are null or context only (oi-wall-touch-artifact,
 * hedge-flow-null, swing-walk-track), so nothing here says price will go to a level. The sigma in the distances is the snapshot's own expected move.
 *
 * Pure functions are exported for tests; mountTerrainLive() is the DOM part. Tested by js/terrainLive.test.mjs.
 */
import { clockState } from './marketClock.js';

/** The terrain's stored keys (OANDA style) -> the desk instrument name /api/desk-bars takes. A market not listed (corn, wheat, soybeans, palladium, platinum) has no live line. */
export const DESK_OF_SYM = {
  'XAU/USD': 'GOLD', NAS100_USD: 'NQ', SPX500_USD: 'SPX500', US30_USD: 'US30', US2000_USD: 'US2000',
  'EUR/USD': 'EURUSD', 'GBP/USD': 'GBPUSD', 'USD/JPY': 'USDJPY', 'AUD/USD': 'AUDUSD', 'USD/CAD': 'USDCAD', 'USD/CHF': 'USDCHF',
  'XAG/USD': 'SILVER', 'XCU/USD': 'COPPER', WTICO_USD: 'WTI', BCO_USD: 'BRENT', NATGAS_USD: 'NATGAS',
};

/** The line's colour: violet, which no other terrain line uses (white spot, orange flip, blue wall, grey pain, red call wall, green put wall). The terrain canvas keeps its own dark palette in every theme, so the overlay does too. */
export const LIVE_COLOUR = '#c084fc';
export const STALE_MS = 15 * 60_000;
export const barsUrl = desk => `/api/desk-bars?inst=${encodeURIComponent(desk)}&tf=5m&days=1`;

/** "<1m", "7m", "1h 05m", "2d": how old a price is. */
export function ageText(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return '<1m';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d`;
}

const utcStamp = ms => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));

/**
 * /api/desk-bars answer -> the live reading, or null when there is nothing to read.
 *   { price, kind: 'now' | 'stale' | 'close', quoteMs, ageMs, forming, label }
 * quoteMs: a forming bar's price is as of the server's read (asOf, at most ~60 s old); a finished bar's price is as of that bar's end.
 */
export function liveFromBars(r, nowMs, clock = clockState(nowMs)) {
  const bars = r?.bars; if (!Array.isArray(bars) || !bars.length) return null;
  const last = bars.at(-1), price = Number(last.close); if (!Number.isFinite(price) || !(price > 0)) return null;
  const sec = Number.isFinite(r.sec) ? r.sec : 300, endMs = (last.time + sec) * 1000, forming = last.forming === true;
  const quoteMs = forming ? Math.min(Number.isFinite(r.asOf) ? r.asOf : nowMs, nowMs) : Math.min(endMs, nowMs);
  const ageMs = Math.max(0, nowMs - quoteMs);
  const kind = !clock.open ? 'close' : ageMs > STALE_MS ? 'stale' : 'now';
  return { price, kind, quoteMs, ageMs, forming, label: kind === 'close' ? `${utcStamp(quoteMs)} UTC` : ageText(ageMs) };
}

/** The same reading re-aged at nowMs (the kind can change: a market that shut, a price that went stale). Pure. */
export function withAge(live, nowMs, clock = clockState(nowMs)) {
  if (!live) return null;
  const ageMs = Math.max(0, nowMs - live.quoteMs), kind = !clock.open ? 'close' : ageMs > STALE_MS ? 'stale' : 'now';
  return { ...live, ageMs, kind, label: kind === 'close' ? `${utcStamp(live.quoteMs)} UTC` : ageText(ageMs) };
}

/** The tag text: "now 5,432.1 · 2m", "at close 5,430.0 · Fri 21:55 UTC", "last 5,431.0 · 42m old". px formats a price for this market. */
export function tagText(live, px) {
  if (!live) return '';
  if (live.kind === 'close') return `at close ${px(live.price)} · ${live.label}`;
  if (live.kind === 'stale') return `last ${px(live.price)} · ${live.label} old`;
  return `now ${px(live.price)} · ${live.label}`;
}

/** "GEX FLIP (ZERO CROSSING)" -> "gex flip" */
export const nameShort = name => String(name ?? '').replace(/\s*\(.*\)\s*/, '').trim().toLowerCase();

/**
 * The nearest labelled level above and below the live price, with the gap in points and in the snapshot's expected-move units.
 *   { above: { name, price, pts, sigma } | null, below: { ... } | null, move }
 * pts is positive for both (a distance); sigma is null when the entry has no expected move. A level the price is exactly on counts as neither.
 */
export function levelDistances(price, levels, refMove) {
  const move = Number(refMove?.move) > 0 ? Number(refMove.move) : null;
  let above = null, below = null;
  for (const l of levels ?? []) {
    if (!Number.isFinite(l?.price) || !Number.isFinite(price)) continue;
    const d = l.price - price;
    if (d > 0 && (!above || d < above.pts)) above = { name: l.name, price: l.price, color: l.color, pts: d };
    if (d < 0 && (!below || -d < below.pts)) below = { name: l.name, price: l.price, color: l.color, pts: -d };
  }
  const add = x => x && { ...x, sigma: move ? x.pts / move : null };
  return { above: add(above), below: add(below), move };
}

/** One pip (the FX quote's usual last place) for the desk's FX pairs; every other market is quoted in points. */
const PIP = { EURUSD: 1e-4, GBPUSD: 1e-4, AUDUSD: 1e-4, USDCAD: 1e-4, USDCHF: 1e-4, USDJPY: 1e-2 };
/** A gap in this market's own unit: "12.4 pips" for an FX pair, otherwise points to a sensible number of places ("31.0", "9.50", "0.052"). */
export function distFor(desk) {
  const pip = PIP[desk];
  return pts => {
    if (!Number.isFinite(pts)) return '';
    if (pip) { const p = pts / pip; return `${p.toFixed(p < 10 ? 1 : 0)}p`; }
    const a = Math.abs(pts); return a >= 100 ? pts.toFixed(0) : a >= 10 ? pts.toFixed(1) : a >= 1 ? pts.toFixed(2) : pts.toFixed(a >= 0.1 ? 3 : 4);
  };
}

/** "▲ call wall +0.4σ · +12.4" (above) or "▼ put wall −0.9σ · −31.0" (below). dist formats a gap in this market's unit (distFor). */
export function distanceText(dir, d, dist = String) {
  if (!d) return '';
  const sg = dir === 'up' ? '+' : '−', sig = d.sigma != null ? `${sg}${d.sigma.toFixed(d.sigma < 10 ? 1 : 0)}σ · ` : '';
  return `${dir === 'up' ? '▲' : '▼'} ${nameShort(d.name)} ${sig}${sg}${dist(d.pts)}`;
}

/** The legend line under the chart: what the new line is, in words, with the sigma defined and the not-a-signal sentence. */
export function liveNote(geom, live) {
  const mv = geom?.refMove, sig = Number(mv?.move) > 0 ? ` σ is the snapshot's expected move (${mv.source === 'implied' ? 'from implied vol' : mv.source || 'stored'}).` : '';
  const what = live ? 'The violet line is the price now (OANDA, the same price scale as the levels), with its age; ▲ and ▼ are the nearest labelled levels.' : 'The live price line is not available for this market right now.';
  return `${what}${sig} It shows where price is against these levels, not where it will go.`;
}

/** A level is only drawn against a price on the same scale: if the live price is 25% or more from the snapshot spot, the mapping is wrong. */
export const plausible = (price, geom) => Number.isFinite(price) && Number.isFinite(geom?.spot) && geom.spot > 0 && Math.abs(price / geom.spot - 1) < 0.25;

/** Where the price sits on the terrain's axis: y in css px, and 'above' / 'below' when it is outside the drawn price window (clamped to the edge). */
export function yFor(price, geom) {
  const { lo, hi, PT, ph } = geom;
  if (price > hi) return { y: PT + 1, off: 'above' };
  if (price < lo) return { y: PT + ph - 1, off: 'below' };
  return { y: PT + (hi - price) / (hi - lo) * ph, off: null };
}

const ROUND = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath(); };

/** Paint the live line on the overlay context. css-pixel coordinates (the caller has applied the device scale). opts: { dist } formats the gaps (distFor), { line, bg, text } override the colours. Returns the lines of text it drew (for the label and the tests). */
export function paintLive(g, geom, live, px, tok = {}) {
  const out = [];
  if (!g || !geom || !live || !plausible(live.price, geom)) return out;
  const col = tok.line || LIVE_COLOUR, bg = tok.bg || '#090e13', fg = tok.text || '#e6edf3', mono = '11px ui-monospace,"IBM Plex Mono",Consolas,monospace';
  const { y, off } = yFor(live.price, geom), x0 = geom.PL, x1 = geom.PL + geom.pw;
  const shut = live.kind !== 'now';
  g.save();
  g.lineWidth = 1.6; g.strokeStyle = col; g.setLineDash(shut ? [3, 3] : []); g.globalAlpha = shut ? 0.8 : 1;
  g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
  // end marks: a small triangle at each end of the line (a filled triangle also reads without colour)
  g.fillStyle = col; for (const [x, s] of [[x0, 1], [x1, -1]]) { g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 6 * s, y); g.lineTo(x, y + 4); g.closePath(); g.fill(); }
  const tag = `${off === 'above' ? '▲ ' : off === 'below' ? '▼ ' : ''}${tagText(live, px)}${off ? (off === 'above' ? ' (above this range)' : ' (below this range)') : ''}`;
  const d = levelDistances(live.price, geom.levels, geom.refMove);
  const rows = [tag, distanceText('up', d.above, tok.dist || px), distanceText('down', d.below, tok.dist || px)].filter(Boolean);
  g.font = mono; g.textBaseline = 'middle'; g.textAlign = 'left';
  const w = Math.max(...rows.map(t => g.measureText(t).width)) + 14, rh = 16, bx = x0 + 10;
  // the tag sits just above the line (or below it when the line is near the top edge), the distances stack under the tag
  const h = rh * rows.length + 4, top = y - h - 3 >= geom.PT ? y - h - 3 : y + 3;
  const by = Math.min(Math.max(geom.PT, top), geom.PT + geom.ph - h);
  g.globalAlpha = 0.92; g.fillStyle = bg; ROUND(g, bx, by, w, h, 5); g.fill(); g.globalAlpha = 1;
  g.strokeStyle = col; g.lineWidth = 1; ROUND(g, bx, by, w, h, 5); g.stroke();
  rows.forEach((t, i) => { g.fillStyle = i === 0 ? col : fg; if (i === 0) g.font = `700 ${mono}`; else g.font = mono; g.fillText(t, bx + 7, by + 2 + rh * i + rh / 2); out.push(t); });
  g.restore();
  return out;
}

/**
 * Lay the live line over a drawn terrain canvas and keep it current.
 *   mountTerrainLive(cv, { px, fetchJson, now, doc, win, isOn, setNote, pollMs })  ->  { update(geom, desk), stop(), live() }
 * update(geom, desk) is called after every terrain redraw (new geometry, maybe a new market); it repaints the overlay and fetches if it has no price yet.
 * While the FX week is open it re-reads every pollMs (30 s; the server caches ~60 s) and repaints the age every 15 s; shut, it reads once and stops asking.
 * Nothing runs while the tab is hidden or the canvas has left the page. isOn() is the registry switch (widget.terrainlive).
 * Colours are fixed (LIVE_COLOUR on the terrain's own dark ground): the terrain canvas does not follow the page theme, so neither does its overlay.
 */
export function mountTerrainLive(cv, { px, fetchJson, now = () => Date.now(), doc = globalThis.document, win = globalThis.window, isOn = () => true, setNote = () => {}, pollMs = 30_000 } = {}) {
  let geom = null, desk = null, live = null, err = null, stopped = false, tFetch = null, tPaint = null, busy = false, ov = null;
  function ensure() {
    if (ov) return ov;
    const parent = cv.parentElement; if (!parent) return null;
    try { if (win.getComputedStyle(parent).position === 'static') parent.style.position = 'relative'; } catch { /* stand-in DOM */ }
    ov = doc.createElement('canvas'); ov.setAttribute('aria-hidden', 'true'); ov.setAttribute('data-noexport', '');
    ov.style.cssText = 'position:absolute;pointer-events:none;border-radius:8px';
    parent.appendChild(ov); cv._overlayCv = ov;
    return ov;
  }
  function size() {
    const o = ensure(); if (!o) return null;
    o.style.left = `${cv.offsetLeft ?? 0}px`; o.style.top = `${cv.offsetTop ?? 0}px`; o.style.width = `${cv.clientWidth || 0}px`; o.style.height = `${cv.clientHeight || 0}px`;
    if (o.width !== cv.width) o.width = cv.width; if (o.height !== cv.height) o.height = cv.height;
    return o;
  }
  function paint() {
    if (stopped) return;
    const o = size(); if (!o) return;
    const g = o.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, o.width, o.height);
    if (!geom || !live || !isOn()) { o.removeAttribute('aria-label'); return; }
    const dpr = cv.clientWidth ? cv.width / cv.clientWidth : 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const lines = paintLive(g, geom, withAge(live, now()), px, { dist: distFor(desk) });
    if (lines.length) o.setAttribute('aria-label', `Live price on the terrain: ${lines.join('; ')}`);
  }
  async function load() {
    if (stopped || busy || !desk || !isOn()) return;
    busy = true;
    try {
      const r = await fetchJson(barsUrl(desk));
      if (stopped) return;
      live = liveFromBars(r, now()); err = live ? null : (r?.error ?? 'no price bars');
    } catch (e) { live = null; err = e?.message ?? 'request failed'; }
    finally { busy = false; }
    setNote(liveNote(geom, live)); paint();
  }
  function tick() {
    if (stopped) return;
    if (!cv.isConnected) { stop(); return; }
    if (win.document?.visibilityState === 'hidden' || !isOn()) return;
    if (clockState(now()).open || !live) load(); else paint();
  }
  function start() {
    if (tFetch) return;
    tFetch = win.setInterval(tick, pollMs); tPaint = win.setInterval(() => { if (!stopped && live && win.document?.visibilityState !== 'hidden') paint(); }, 15_000);
  }
  function stop() { stopped = true; if (tFetch) win.clearInterval(tFetch); if (tPaint) win.clearInterval(tPaint); tFetch = tPaint = null; ov?.remove?.(); if (cv._overlayCv === ov) cv._overlayCv = null; ov = null; }
  return {
    update(g, d) {
      if (stopped) return;
      geom = g?.lo != null ? g : null;
      if (d !== desk) { desk = d ?? null; live = null; err = null; }
      if (!isOn() || !geom || !desk) { live = null; paint(); setNote(''); return; }
      start(); paint(); if (!live) load(); else setNote(liveNote(geom, live));
    },
    stop,
    live: () => live,
    error: () => err,
  };
}
