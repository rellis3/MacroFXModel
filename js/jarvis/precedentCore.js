// js/jarvis/precedentCore.js: the pure part of the PRECEDENT board. How a market moved in the 30 minutes after past releases of one family, in units of its typical 30-minute reaction
// (the Event replay's own unit, js/eventReplayCore.js). History only: nothing here says which way the next release goes.
import { listReleases, unitFor, fin, familyFromWord, marketFromWord, FAMILY_LABEL, MARKETS, familyLabel, marketLabel, valueAt, OFFS } from '../eventReplayCore.js';

export const EDGE = 3, BIN = 0.5, THIN_N = 8, SHARE_N = 30, FLAT = 0.1, PATH_PTS = 28;
export const STANDING_CAVEAT = 'The direction of a release reaction is not predictable from the release alone (Evidence Book); size and timing are the part that repeats. This is history, not a forecast.';

export const quant = (a, q) => { const s = a.filter(fin).sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r2 = v => (fin(v) ? Math.round(v * 100) / 100 : null);

/** Resolve what a person (or a query string) typed to { family, market } keys, or null for either. */
export function resolveKeys(familyIn, marketIn) {
  const f = String(familyIn ?? '').toUpperCase(), family = FAMILY_LABEL[f] ? f : familyFromWord(familyIn);
  return { family, market: marketFromWord(marketIn) };
}

/** Signed 30-minute moves (% of price) of one market after the printed releases of one family, newest first: [{ id, t, name, m30 }]. */
export function reactionRows(rows, family, mkt, now = Date.now()) {
  return listReleases(rows, now).filter(r => r.family === family).map(r => ({ id: r.id, t: r.t, name: r.name, m30: r.M?.[mkt]?.m30 })).filter(r => fin(r.m30));
}

/** Histogram of signed sizes (units), bins of `bin` from -edge to edge; values beyond the edge are counted in the end bins (flagged `clipped`). */
export function histogram(sizes, edge = EDGE, bin = BIN) {
  const n = Math.round((2 * edge) / bin), out = Array.from({ length: n }, (_, i) => ({ lo: -edge + i * bin, hi: -edge + (i + 1) * bin, count: 0, clipped: false }));
  for (const v of sizes.filter(fin)) {
    const i = Math.min(n - 1, Math.max(0, Math.floor((v + edge) / bin))); out[i].count++;
    if (v < -edge || v >= edge) out[i].clipped = true;
  }
  return out;
}

/** The Wilson 95% interval of a share k / n: { share, lo, hi, k, n } or null when n is 0. */
export function wilson(k, n, z = 1.96) {
  if (!(n > 0)) return null; const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return { share: p, lo: Math.max(0, c - h), hi: Math.min(1, c + h), k, n };
}
/** Stats of the sizes (units). shareUp only when n >= SHARE_N, else null; beside it (Helix review wave 1.11) its Wilson 95% interval, shareUpLo / shareUpHi. */
export function sizeStats(sizes, unit) {
  const s = sizes.filter(fin), abs = s.map(Math.abs), up = s.filter(v => v > 0).length, w = s.length >= SHARE_N ? wilson(up, s.length) : null;
  return { medianAbs: r2(quant(abs, 0.5)), p25: r2(quant(abs, 0.25)), p75: r2(quant(abs, 0.75)), p90: r2(quant(abs, 0.9)),
    shareUp: s.length >= SHARE_N ? r2(up / s.length) : null, shareUpLo: w ? r2(w.lo) : null, shareUpHi: w ? r2(w.hi) : null, typical30mMove: r2(unit) };
}
/** The market's up-share over EVERY release the record holds by `now` (all families): the yardstick the family's share is read against. { share, n } or null under SHARE_N. */
export function baseShareUp(rows, mkt, now = Date.now()) {
  const v = listReleases(rows, now).map(r => r.M?.[mkt]?.m30).filter(x => fin(x) && x !== 0); if (v.length < SHARE_N) return null;
  return { share: r2(v.filter(x => x > 0).length / v.length), n: v.length };
}

export const dirWord = size => (!fin(size) ? 'n/a' : Math.abs(size) < FLAT ? 'flat' : size > 0 ? 'up' : 'down');

/** A stored path (% from the release minute) -> PATH_PTS evenly spaced values in units, from OFFS[0] to OFFS[1]; null where there is no unit or no data. */
export function downsamplePath(path, unit, pts = PATH_PTS) {
  if (!path || !(unit > 0)) return null;
  const out = [];
  for (let k = 0; k < pts; k++) { const m = Math.round(OFFS[0] + (k * (OFFS[1] - OFFS[0])) / (pts - 1)), v = valueAt(path, m); out.push(fin(v) ? r2(v / unit) : null); }
  return out.some(fin) ? out : null;
}

/** The caveats for this pair, always starting with the standing one. */
export function caveatsFor({ n, family, market, unitFallback = false, pathsMissing = 0 }) {
  const c = [STANDING_CAVEAT];
  if (n === 0) c.push(`No stored ${marketLabel(market)} reaction around ${familyLabel(family)} releases.`);
  else if (n < THIN_N) c.push(`Thin: only ${n} ${familyLabel(family)} releases have a stored ${marketLabel(market)} reaction, so the spread and the histogram are not a reliable shape.`);
  if (n >= THIN_N && n < SHARE_N) c.push(`With ${n} releases the share of up moves is not shown (needs ${SHARE_N}).`);
  if (unitFallback && n > 0) c.push('Fewer than 5 releases, so there is no typical 30-minute unit; sizes are in % of price.');
  else if (n > 0) c.push('The unit is the median absolute 30-minute move across these same releases, so a median size near 1 is by construction; read the spread and the tail.');
  if (pathsMissing > 0) c.push(`${pathsMissing} of the last releases had no stored minute path.`);
  return c;
}

/** Everything for one pair, from the Release Reaction rows and a function that returns a release's stored paths (or null). */
export async function buildPrecedent(rows, family, market, getPaths, now = Date.now()) {
  const rr = reactionRows(rows, family, market, now), unit = unitFor(rows, family, market, now), u = unit > 0 ? unit : null;      // point in time: the unit from releases printed by `now` only
  const sizes = rr.map(r => (u ? r.m30 / u : r.m30)), last = [];
  let pathsMissing = 0;
  for (const r of rr.slice(0, 5)) {
    let paths = null; try { paths = await getPaths(r.id); } catch { paths = null; }
    const path = downsamplePath(paths?.[market], u ?? 1); if (!path) pathsMissing++;
    const size = u ? r.m30 / u : r.m30;
    last.push({ date: String(r.t).slice(0, 10), label: r.name, size: r2(size), dirWord: dirWord(u ? size : r.m30 / 0.3), path });
  }
  return { ok: true, family, market, n: rr.length, unit: u ? 'typical 30-minute reaction' : '% of price', stats: sizeStats(sizes, u), base: baseShareUp(rows, market, now), histogram: histogram(sizes), last,
    caveats: caveatsFor({ n: rr.length, family, market, unitFallback: !u, pathsMissing }) };
}

/** A compact question for ASK from the board's data. */
export function askText(d) {
  if (!d || !d.n) return '';
  const s = d.stats;
  return `Describe how ${marketLabel(d.market)} reacted to ${familyLabel(d.family)} releases (${d.n} of them): median size ${s.medianAbs}, p25 ${s.p25}, p75 ${s.p75}, p90 ${s.p90} typical 30-minute reactions${s.shareUp != null ? `, up in ${Math.round(s.shareUp * 100)}%${s.shareUpLo != null ? ` (95% interval ${Math.round(s.shareUpLo * 100)}-${Math.round(s.shareUpHi * 100)}%)` : ''}${d.base ? `, against ${Math.round(d.base.share * 100)}% up over all ${d.base.n} releases held` : ''}` : ''}. What does history show and what does it not show? History only, no forecast.`;
}
export { MARKETS, FAMILY_LABEL, familyLabel, marketLabel };
