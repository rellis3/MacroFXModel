/**
 * The Path replay, the pure core (Desk Terminal, preview): "The path" card (open interest by expiry, drawn ahead of the price) played through time over the nightly records
 * the Swing Map keeps (R2 swing_walk, one per capture session: for each anchor, the level of every expiry as that night's capture stood, with its days to expiry).
 *
 *   NOW sits in the middle: left is the past (the real price, 15-minute bars, drawn forward as the replay runs), right is each live expiry's level at its days to expiry.
 *   Each night the expiries count down (8d, 7d, 6d ... 0d); when one expires its FINAL level slides left into the past (-1d, -2d ...) and stays drawn, faded, with a ring where
 *   price came closest, so you can see how near it got. The previous nights' versions of each level stay as fading dots (the ghosts).
 * POINT IN TIME: a record is in force from its capture session (08:00 UTC on its capture date; the capture is saved ~06:45 London), never before; a level's closest approach
 * counts only price from then on. DESCRIPTION ONLY: walls and gamma centres were tested and are context, never a target (Evidence Book: wall-placebo NULL, swing walk
 * UNDERPOWERED / NULL by anchor; memory swing-walk track). Beside each final level sits the SAME distance mirrored through the price when the level was set (what chance gives).
 * What exists: one record per session since 2026-11-03 (about 10 weekdays today); it deepens by one night each day. The per-expiry OI-centre history of the expiry tracker is longer
 * (since 2026-08-20) but only for expiries still live, so it cannot show the past levels and is not used here.
 */
import { wilson } from './ghostWalkCore.js';

export const fin = v => typeof v === 'number' && Number.isFinite(v);
export const STEP = 15 * 60e3, DAYMS = 864e5;
export const ANCHORS = [{ v: 'gammaCentre', label: 'Gamma centre', verdict: 'UNDERPOWERED' }, { v: 'strike', label: 'Strongest strike', verdict: 'NULL' }, { v: 'maxPain', label: 'Max pain', verdict: 'NULL' }, { v: 'centre', label: 'OI centre', verdict: 'NULL' }];
export const PATH_MARKETS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'GOLD', 'NQ', 'SPX500'];   // the markets the Swing Map (and so the Path card) covers
export const PAST_DAYS = 3;
export const DTE_MAX = 45;
const dayN = d => Math.floor(Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`) / DAYMS);
const dateOf = ms => new Date(ms).toISOString().slice(0, 10);
export const inForce = r => Date.parse(`${r.captureDate}T08:00:00Z`);
const sig = r => (fin(r.close) && fin(r.vol) && r.vol > 0 ? r.close * r.vol : null);   // one session's sigma in price units

/** The record in force at ts (the latest whose capture session has started), as an index, or -1. */
export function recAt(records, ts) { let a = -1; for (let i = 0; i < records.length; i++) { if (inForce(records[i]) <= ts) a = i; else break; } return a; }

/** The level of one expiry on one record for an anchor, or null. */
const levelIn = (r, anchor, expiry) => { const w = r.walks?.[anchor]?.find(p => p[0] === expiry); return w && fin(w[2]) ? { px: w[2], dte: w[1], pull: w[3] ?? null } : null; };

/** Closest approach of price to a level over [fromMs, toMs]: 0 when a bar's range includes it. bars = [[t, o, h, l, c]] ascending. */
export function closest(bars, level, fromMs, toMs) {
  let best = null;
  for (const b of bars) {
    const end = b[0] + STEP; if (end <= fromMs) continue; if (b[0] >= toMs) break;
    const d = level >= b[3] && level <= b[2] ? 0 : Math.min(Math.abs(level - b[3]), Math.abs(level - b[2]));
    if (!best || d < best.dist) best = { dist: d, at: b[0] + STEP / 2, touched: d === 0 };
    if (d === 0 && best.dist === 0) { /* keep the first touch */ break; }
  }
  return best;
}

/** Sigma units and expected-move units of a distance. The expected move to an expiry is one session's sigma times the square root of its trading sessions left. */
export function units(dist, r, dteDays) {
  const s = sig(r); if (!fin(dist) || s == null) return { sigma: null, em: null };
  const sessions = Math.max(1, (dteDays ?? 1) * 5 / 7);
  return { sigma: dist / s, em: dist / (s * Math.sqrt(sessions)) };
}

/**
 * Everything the picture needs at one moment: live markers (level now, days left now, the previous nights' versions, closest approach so far), expired markers (final level, days
 * since, closest approach over its life, with the mirrored level's closest approach), and the nearest live level in sigma. Uses only the record in force and bars up to ts.
 */
export function stateAt(records, bars, anchor, ts) {
  const ri = recAt(records, ts); if (ri < 0) return null;
  const r = records[ri], today = dayN(dateOf(ts)), live = [], past = [], seenExp = new Set();
  const upto = bars.filter(b => b[0] + STEP <= ts);
  for (const p of r.walks?.[anchor] ?? []) {
    const dte = dayN(p[0]) - today; if (dte < 0 || !fin(p[2])) continue;
    const ghosts = []; for (let k = ri - 1; k >= Math.max(0, ri - 5); k--) { const g = levelIn(records[k], anchor, p[0]); if (g) ghosts.push(g.px); }
    const c = closest(upto, p[2], inForce(r), ts), u = c ? units(c.dist, r, dte) : { sigma: null, em: null };
    live.push({ expiry: p[0], dte, px: p[2], ghosts, closest: c, ...u, away: sigma(r, ts, upto, p[2]) });
    seenExp.add(p[0]);
  }
  const all = new Map();   // every expiry seen on any record up to ri, with its final record
  for (let k = 0; k <= ri; k++) for (const p of records[k].walks?.[anchor] ?? []) if (fin(p[2])) all.set(p[0], { k, px: p[2], dte0: p[1] });
  for (const [expiry, f] of all) {
    const ago = today - dayN(expiry); if (ago < 1 || ago > 7) continue;
    const rec = records[f.k], end = Date.parse(`${expiry}T23:59:59Z`), c = closest(upto, f.px, inForce(rec), Math.min(ts, end)), mirror = closest(upto, 2 * rec.close - f.px, inForce(rec), Math.min(ts, end));
    past.push({ expiry, ago, px: f.px, firstDte: f.dte0, closest: c, mirror, ...units(c?.dist, rec, f.dte0) });
  }
  live.sort((a, b) => a.dte - b.dte); past.sort((a, b) => a.ago - b.ago);
  return { ri, rec: r, live, past };
}
/** How far the price now is from a level, in the record's sigma units (signed: positive = level above price). */
function sigma(r, ts, upto, level) { const s = sig(r), last = upto.at(-1); return s != null && last ? (level - last[4]) / s : null; }

/** The tally over every EXPIRED expiry held: was its final level touched while it was live, and was the same distance on the other side? Wilson intervals; overlap flag. */
export function tally(records, bars, anchor) {
  const lastTs = bars.at(-1) ? bars.at(-1)[0] + STEP : 0, all = new Map();
  for (let k = 0; k < records.length; k++) for (const p of records[k].walks?.[anchor] ?? []) if (fin(p[2])) all.set(p[0], { k, px: p[2] });
  let n = 0, real = 0, mirror = 0;
  for (const [expiry, f] of all) {
    const end = Date.parse(`${expiry}T23:59:59Z`); if (end > lastTs) continue;
    const rec = records[f.k], from = inForce(rec); if (end <= from) continue;
    const c = closest(bars, f.px, from, end), m = closest(bars, 2 * rec.close - f.px, from, end);
    n++; if (c?.touched) real++; if (m?.touched) mirror++;
  }
  const a = wilson(real, n), b = wilson(mirror, n);
  return { n, real: a, mirror: b, overlap: n > 0 && a.lo <= b.hi && b.lo <= a.hi, enough: n >= 30 };
}
export function tallySentence(t) {
  if (!t?.n) return 'No expiry has expired inside the nights held yet, so there is no touch tally to show.';
  const pc = v => `${Math.round(v)}%`;
  return `Of ${t.n} expiries that have expired since the records began, the final level was touched while it was live in ${t.real.k} (${pc(t.real.p)}, 95% interval ${pc(t.real.lo)} to ${pc(t.real.hi)}); the same distance on the other side of the price when the level was set was touched in ${t.mirror.k} (${pc(t.mirror.p)}, ${pc(t.mirror.lo)} to ${pc(t.mirror.hi)}). ${t.overlap ? 'The intervals overlap, so there is no sign these levels are touched more than empty prices at the same distance.' : 'The intervals do not overlap; read that against the Evidence Book, which found no pull toward walls.'} ${t.enough ? '' : `Only ${t.n} expiries are held, so this is a very small sample: it will firm up as nights are added. `}Expiries overlap in time, so these are not independent trials.`;
}

/** One frame per 15-minute bar from the first record in force to the last bar. */
export function makeFrames(records, bars) {
  if (!records.length || !bars.length) return [];
  const t0 = inForce(records[0]), out = [];
  for (let i = 0; i < bars.length; i++) { const ts = bars[i][0] + STEP; if (ts < t0) continue; out.push({ t: ts, data: { i } }); }
  return out;
}
/** The price range one fixed picture should cover: closes over the replay and the levels within DTE_MAX days, 2nd to 98th percentile, padded. */
export function priceRange(records, bars, anchor) {
  const v = bars.map(b => b[4]); for (const r of records) for (const p of r.walks?.[anchor] ?? []) if (fin(p[2]) && p[1] <= DTE_MAX) v.push(p[2]);
  v.sort((a, b) => a - b); const q = x => v[Math.min(v.length - 1, Math.max(0, Math.floor(v.length * x)))], lo = q(0.02), hi = q(0.98), pad = (hi - lo) * 0.08 || hi * 0.002;
  return { lo: lo - pad, hi: hi + pad };
}

const HM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
export const stamp = ms => `${HM.format(new Date(ms))} London`;
const pxF = (v, dp) => (fin(v) ? Number(v).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : '–');
const sg = v => (fin(v) ? `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}` : '–');

/** Plain words for one moment. */
export function captionFor(st, ts, price, { label, dp = 2, anchorLabel = 'level' } = {}) {
  if (!st) return `${stamp(ts)}: no nightly record is in force yet.`;
  let s = `${stamp(ts)}: ${label} is at ${pxF(price, dp)}.`;
  const near = [...st.live].sort((a, b) => Math.abs(a.away ?? 1e9) - Math.abs(b.away ?? 1e9))[0];
  if (near) s += ` The nearest live ${anchorLabel} is the ${near.dte}-day expiry at ${pxF(near.px, dp)}, ${sg(near.away)} daily sigma ${near.away >= 0 ? 'above' : 'below'} the price.`;
  const p = st.past[0];
  if (p) s += ` The expiry that ended ${p.ago} day${p.ago === 1 ? '' : 's'} ago finished at ${pxF(p.px, dp)}; price came ${p.closest?.touched ? 'to it (touched it)' : `within ${fin(p.sigma) ? p.sigma.toFixed(1) : '–'} daily sigma of it`} while it was live. Where price is against the levels, not where it will go.`;
  return s;
}

export const coverage = (records, bars) => ({ nights: records.length, from: records[0]?.captureDate ?? null, to: records.at(-1)?.captureDate ?? null, bars: bars.length });
