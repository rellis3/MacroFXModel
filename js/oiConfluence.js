/**
 * OI (options-interest) forward-test tagging.
 *
 * There is NO historical options-OI for spot FX (OTC, fragmented), so gamma /
 * put-call walls / max-pain as range-entry confluence cannot be backtested the
 * way touch/naked were. This is instead a FORWARD test: the day's OI levels are
 * captured each morning (before entries → no lookahead), and every resolved
 * range-line trade is joined to THAT day's levels by price proximity. After
 * enough trades accumulate, tagged-vs-untagged expectancy says whether an OI
 * level lining up with a range level actually trades better.
 *
 * The independence cut is the lesson from the naked-levels null: big OI strikes
 * cluster on round numbers, which the confluence already counts (`round_number`).
 * So the audit also reports the "tagged AND not already at a round number" slice
 * — if OI only helps where a round number already is, it is redundant, not edge.
 *
 * Pure — no network/clock/DOM; offline-testable. The server injects the trade
 * log + the daily OI artifact; this only joins and tallies.
 */

// Canonical OI level types (free-form labels are allowed; these are the ones the
// breakdown names). gamma_flip is a regime boundary, not a magnet — tagged apart.
export const OI_TYPES = ['put_wall', 'call_wall', 'max_pain', 'gamma_flip', 'hvl'];

// Normalise a free-typed label to a slug: "Call Wall"/"callwall"/"c-wall" → call_wall.
export function normOIType(raw) {
  const s = String(raw ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (!s) return 'oi';
  if (/(call).*wall|^cw$|^c_wall$/.test(s)) return 'call_wall';
  if (/(put).*wall|^pw$|^p_wall$/.test(s)) return 'put_wall';
  if (/max.*pain|^mp$/.test(s)) return 'max_pain';
  if (/gamma.*(flip|zero|wall)|zero.*gamma|^gf$|^gflip$/.test(s)) return 'gamma_flip';
  if (/^hvl$|high.*vol|high.*gamma/.test(s)) return 'hvl';
  return s;
}

// Parse pasted OI lines → [{price, type}]. Tolerates "1.0850 call_wall",
// "1.0820, max pain", "1.0850" (untyped → 'oi'), blank lines and '#' comments.
export function parseOILevels(text) {
  const out = [];
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    // first number token = price; the rest = type label
    const m = line.match(/^([+-]?\d[\d,]*\.?\d*)\s*[, \t]*\s*(.*)$/);
    if (!m) continue;
    const price = parseFloat(m[1].replace(/,/g, ''));
    if (!Number.isFinite(price)) continue;
    out.push({ price, type: normOIType(m[2]) });
  }
  return out;
}

// Round-number proximity — the independence flag. Big OI strikes sit on round
// numbers the confluence already counts, so a tag that only fires at a round
// number adds nothing. Grid = big-figure / half / quarter of the pip decade
// (approximates the `round_number` source; diagnostic, not a gated source).
export function nearRoundNumber(price, pip, tolPips = 10) {
  if (!(price > 0) || !(pip > 0)) return false;
  const tol = tolPips * pip;
  const step = pip * 100;                       // one "big figure" = 100 pips
  for (const frac of [1, 0.5, 0.25]) {
    const grid = step * frac;
    const nearest = Math.round(price / grid) * grid;
    if (Math.abs(price - nearest) <= tol) return true;
  }
  return false;
}

// Tag one entry price by whether an OI level sits within tol of it.
//   → { hit, types:[…distinct…], nearest, distPips }
export function tagTradeOI(entryPrice, oiLevels, { pip, tolPips = 10 } = {}) {
  const none = { hit: false, types: [], nearest: null, distPips: null };
  if (!(entryPrice > 0) || !(pip > 0) || !Array.isArray(oiLevels) || !oiLevels.length) return none;
  const tol = tolPips * pip;
  const types = new Set();
  let nearest = null, nearestDist = Infinity;
  for (const lv of oiLevels) {
    if (!Number.isFinite(lv?.price)) continue;
    const d = Math.abs(lv.price - entryPrice);
    if (d <= tol) types.add(lv.type || 'oi');
    if (d < nearestDist) { nearestDist = d; nearest = lv.price; }
  }
  return types.size
    ? { hit: true, types: [...types], nearest, distPips: +(nearestDist / pip).toFixed(1) }
    : { ...none, nearest, distPips: Number.isFinite(nearestDist) ? +(nearestDist / pip).toFixed(1) : null };
}

// Size-independent per-trade return (%), signed by direction — the expectancy
// metric (lots vary by pair, so raw profit isn't comparable across pairs).
export function tradePctReturn(t) {
  if (t?.close_price == null || t?.open_price == null) return null;   // still open → unresolved
  const dir = String(t?.direction ?? '');
  const sign = /buy|long/i.test(dir) ? 1 : /sell|short/i.test(dir) ? -1 : 0;
  const o = Number(t.open_price), c = Number(t.close_price);
  if (!sign || !(o > 0) || !Number.isFinite(c)) return null;
  return (c - o) / o * 100 * sign;
}

const _acc = () => ({ n: 0, wins: 0, sumRet: 0 });
const _add = (a, ret) => { a.n++; if (ret > 0) a.wins++; a.sumRet += ret; };
const _fin = a => ({ n: a.n, winRate: a.n ? +(a.wins / a.n).toFixed(4) : 0,
  avgRet: a.n ? +(a.sumRet / a.n).toFixed(5) : 0, sumRet: +a.sumRet.toFixed(5) });

// The forward-test audit. Joins the accumulated trade log against the per-date OI
// artifact and tallies tagged-vs-untagged expectancy, per OI type, plus the
// round-number-independence slice.
//   tradeLog: [{ date, symbol|instrument, open_price, close_price, direction, … }]
//   oiByDate: { 'YYYY-MM-DD': { instrKey: [{price,type}, …] } }
//   pipFor(instrKey) → pip size; tolPips proximity; roundTolPips for the round grid.
export function oiAudit(tradeLog, oiByDate, { pipFor = () => 0, tolPips = 10, roundTolPips = 10 } = {}) {
  const tagged = _acc(), untagged = _acc(), taggedNotRound = _acc(), taggedAtRound = _acc();
  const byType = {};
  let joined = 0, noOI = 0, unresolved = 0;
  for (const t of (Array.isArray(tradeLog) ? tradeLog : [])) {
    const ret = tradePctReturn(t);
    if (ret == null) { unresolved++; continue; }
    const key = String(t.instrument ?? t.symbol ?? '').toLowerCase().replace('/', '').replace('_', '');
    const oi = oiByDate?.[t.date]?.[key];
    const pip = pipFor(key) || 0;
    // Only trades on a day whose OI was captured can be judged — tagged (an OI
    // level sits near the entry) vs untagged (OI present that day, but not near
    // this entry). Days with no OI captured are excluded, not counted as untagged.
    if (!oi || !oi.length || !(pip > 0)) { noOI++; continue; }
    joined++;
    const tag = tagTradeOI(t.open_price, oi, { pip, tolPips });
    if (tag.hit) {
      _add(tagged, ret);
      for (const ty of tag.types) { (byType[ty] ??= _acc()); _add(byType[ty], ret); }
      _add(nearRoundNumber(t.open_price, pip, roundTolPips) ? taggedAtRound : taggedNotRound, ret);
    } else {
      _add(untagged, ret);
    }
  }
  const finByType = {}; for (const k of Object.keys(byType)) finByType[k] = _fin(byType[k]);
  return {
    tagged: _fin(tagged), untagged: _fin(untagged),
    taggedNotRound: _fin(taggedNotRound), taggedAtRound: _fin(taggedAtRound),
    byType: finByType,
    coverage: { tradesWithOIDay: joined, tradesNoOIDay: noOI, unresolved },
    edge: +(_fin(tagged).avgRet - _fin(untagged).avgRet).toFixed(5),   // tagged − untagged expectancy
  };
}
