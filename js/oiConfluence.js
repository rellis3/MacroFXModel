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

// The 3× rule (Lesson 4): a wall's strength is its OI as a MULTIPLE of the
// surrounding strikes, not its absolute size. 1.5× weak · 2× moderate · 3×+ strong.
// `neighbourOIs` = the OIs at the nearest strikes either side of the wall (the
// analyser supplies them). Returns { multiple, tier }.
export function wallStrengthTier(oi, neighbourOIs) {
  const ns = (Array.isArray(neighbourOIs) ? neighbourOIs : []).filter(n => Number.isFinite(n) && n >= 0);
  if (!(oi > 0) || !ns.length) return { multiple: null, tier: null };
  const avg = ns.reduce((a, b) => a + b, 0) / ns.length;
  if (!(avg > 0)) return { multiple: null, tier: 'strong' };    // isolated wall — nothing around it
  const mult = +(oi / avg).toFixed(2);
  const tier = mult >= 3 ? 'strong' : mult >= 2 ? 'moderate' : mult >= 1.5 ? 'weak' : null;
  return { multiple: mult, tier };
}

// OI skew (Lesson 4): WHERE the positioning sits, not just the P/C ratio. Put OI
// concentrated below spot = downside hedging; call OI above = upside positioning.
// score in [-1,1]: + upside-tilted, − downside-hedged. Returns null without a spot.
export function oiSkew(strikes, callOIs, putOIs, spot) {
  if (!Array.isArray(strikes) || !strikes.length || !(spot > 0)) return null;
  let putBelow = 0, callAbove = 0;
  for (let i = 0; i < strikes.length; i++) {
    if (strikes[i] < spot) putBelow += (putOIs?.[i] || 0);
    else if (strikes[i] > spot) callAbove += (callOIs?.[i] || 0);
  }
  const tot = putBelow + callAbove;
  if (!(tot > 0)) return null;
  const score = +((callAbove - putBelow) / tot).toFixed(3);
  return { score, callAbove: Math.round(callAbove), putBelow: Math.round(putBelow),
    read: score > 0.2 ? 'upside-tilted' : score < -0.2 ? 'downside-hedged' : 'balanced' };
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

// Extract price levels from ONE `oi_store` entry (index.html's OI analyser output)
// → [{price,type}] in this brick's shape, so the forward test reuses the OI the
// user already computes daily instead of a second manual entry. Pulls max pain,
// the headline + top-ranked call/put walls, the gamma-flip strike (first netGex
// sign change in the strike-sorted gexProfile) and the HVL (highest-|gamma|
// strike). Pure. inst = { maxPain, callWall, putWall, callWalls[], putWalls[],
// gexProfile[{strike,netGex,gamma}] }.
// Day-over-day OI dynamics (Lesson 4 §dynamic): compare today's `oi_store` entry
// against a prior day's archived one → what MOVED. Powers the brief's "wall firming
// / fading, positioning building / unwinding" narrative and the delta rows on the
// card. Pure — takes two inst snapshots ({maxPain, callWall, putWall, pcRatio,
// totalCallOI, totalPutOI, callWalls[], putWalls[]}). Returns null if either side
// is missing so callers degrade gracefully on the first day (no prior).
export function oiDeltas(cur, prev) {
  if (!cur || !prev || typeof cur !== 'object' || typeof prev !== 'object') return null;
  const d = (a, b) => (Number.isFinite(a) && Number.isFinite(b)) ? +(a - b).toFixed(6) : null;
  const totCur = (cur.totalCallOI || 0) + (cur.totalPutOI || 0);
  const totPrev = (prev.totalCallOI || 0) + (prev.totalPutOI || 0);
  const totalOIChange = Math.round(totCur - totPrev);
  // Per-strike wall dynamics: match walls by strike across the two days.
  const wallDyn = (curW, prevW, kind) => {
    const cw = Array.isArray(curW) ? curW : [], pw = Array.isArray(prevW) ? prevW : [];
    const pmap = new Map(pw.map(w => [w.strike, w.oi]));
    const strengthening = [], weakening = [], appeared = [];
    for (const w of cw) {
      const pv = pmap.get(w.strike);
      if (pv == null) appeared.push({ strike: w.strike, oi: w.oi, kind });   // strike unimportant yesterday → fresh wall
      else {
        const dd = Math.round(w.oi - pv);
        const pct = pv > 0 ? +((w.oi - pv) / pv * 100).toFixed(0) : null;    // OI change % (fresh-positioning vs liquidation)
        if (dd > 0) strengthening.push({ strike: w.strike, delta: dd, pct, oi: w.oi, kind });
        else if (dd < 0) weakening.push({ strike: w.strike, delta: dd, pct, oi: w.oi, kind });
      }
    }
    const seen = new Set(cw.map(w => w.strike));
    const faded = pw.filter(w => !seen.has(w.strike)).map(w => ({ strike: w.strike, oi: w.oi, kind }));
    return { strengthening, weakening, appeared, faded };
  };
  return {
    maxPainShift: d(cur.maxPain, prev.maxPain),
    callWallShift: d(cur.callWall, prev.callWall),
    putWallShift: d(cur.putWall, prev.putWall),
    pcRatioChange: d(cur.pcRatio, prev.pcRatio),
    totalCallOIChange: Math.round((cur.totalCallOI || 0) - (prev.totalCallOI || 0)),
    totalPutOIChange: Math.round((cur.totalPutOI || 0) - (prev.totalPutOI || 0)),
    totalOIChange,
    totalOIChangePct: totPrev > 0 ? +((totCur - totPrev) / totPrev * 100).toFixed(1) : null,
    // L1: rising total OI = new money entering; falling = positions liquidating.
    flow: totalOIChange > 0 ? 'building' : totalOIChange < 0 ? 'unwinding' : 'flat',
    callWalls: wallDyn(cur.callWalls, prev.callWalls, 'call'),
    putWalls: wallDyn(cur.putWalls, prev.putWalls, 'put'),
  };
}

// Daily-change CLASSIFICATION (ChatGPT layer 2 / course L4 §dynamic): turn the raw
// deltas into human labels the brief + bots can act on — fresh_wall (appeared),
// fresh_positioning (big % build on an existing wall), liquidation (a wall fading /
// dropping), stable (little change). Roll (near-expiry fall + next-expiry rise)
// needs per-expiry change data → deferred; flagged when we can't tell. `freshPct` =
// the OI-change % that counts as a decisive build/liquidation.
export function classifyOIChange(deltas, { freshPct = 40 } = {}) {
  if (!deltas) return null;
  const out = { events: [] };
  const add = (kind, e, label) => out.events.push({ type: label, kind, strike: e.strike, oi: e.oi ?? null, pct: e.pct ?? null, delta: e.delta ?? null });
  for (const w of deltas.callWalls?.appeared || []) add('call', w, 'fresh_wall');
  for (const w of deltas.putWalls?.appeared || []) add('put', w, 'fresh_wall');
  for (const w of [...(deltas.callWalls?.strengthening || []), ...(deltas.putWalls?.strengthening || [])])
    if ((w.pct ?? 0) >= freshPct) add(w.kind, w, 'fresh_positioning');
  for (const w of [...(deltas.callWalls?.weakening || []), ...(deltas.putWalls?.weakening || [])])
    if ((w.pct ?? 0) <= -freshPct) add(w.kind, w, 'liquidation');
  for (const w of [...(deltas.callWalls?.faded || []), ...(deltas.putWalls?.faded || [])]) add(w.kind, w, 'liquidation');
  // Headline read: dominant activity + the whole-book flow.
  const n = t => out.events.filter(e => e.type === t).length;
  out.summary = n('fresh_wall') || n('fresh_positioning')
    ? (deltas.flow === 'building' ? 'fresh positioning building' : 'repositioning')
    : n('liquidation') ? 'positions liquidating (levels weakening)'
    : (deltas.flow === 'flat' ? 'stable' : deltas.flow === 'building' ? 'building' : 'unwinding');
  return out;
}

// Concentration (ChatGPT layer 5): top-N strikes as a % of total OI. Concentrated
// positioning → sharper reactions at those strikes; dispersed → weaker influence.
// `strikeOIs` = per-strike total OI (call+put). Pure.
// Today's option VOLUME vs resting OI — the "fresh positioning" read. A wall with
// high volume relative to its resting OI is being defended/built TODAY (new money),
// not stale positioning. ratio ≥ 1 = today's volume matched/exceeded the whole
// resting OI (very fresh); < 0.4 = quiet/stale. Pure.
export function wallFreshness(oi, volume) {
  if (!(oi > 0)) return null;
  const r = (+volume || 0) / oi;
  return { ratio: +r.toFixed(2), tag: r >= 1 ? 'fresh' : r >= 0.4 ? 'active' : 'stale' };
}

// Volume put/call ratio = today's directional FLOW (vs the OI P/C = resting
// positioning). A divergence — resting balanced but today heavily one side — is the
// tell. Returns null if no call volume. Pure.
export function volumePCRatio(callVol, putVol) {
  const c = +callVol || 0, p = +putVol || 0;
  return c > 0 ? +(p / c).toFixed(3) : null;
}

// OI-change × price-direction: is a move BACKED by fresh positioning, or hollow?
// The classic table — +OI with the move = new money (confirmed); −OI = the move is
// on positions CLOSING (short-covering up / long-liquidation down = weak/unsustainable).
// Signs: oiChg > 0 = OI building, < 0 = unwinding; priceDir > 0 = up, < 0 = down.
export function oiPriceConfirmation(oiChg, priceDir) {
  const oi = Math.sign(oiChg || 0), px = Math.sign(priceDir || 0);
  if (oi === 0 || px === 0) return null;
  if (oi > 0 && px > 0) return { read: 'new longs', trust: 'confirmed', note: 'up on building OI — new longs, move is backed' };
  if (oi > 0 && px < 0) return { read: 'new shorts', trust: 'confirmed', note: 'down on building OI — new shorts, move is backed' };
  if (oi < 0 && px > 0) return { read: 'short covering', trust: 'weak', note: 'up on FALLING OI — short covering, rally may be weak/unsustainable' };
  return { read: 'long liquidation', trust: 'weak', note: 'down on FALLING OI — long liquidation, capitulation/possible bottom' };
}

export function oiConcentration(strikeOIs, totalOI = null) {
  const arr = (Array.isArray(strikeOIs) ? strikeOIs : []).filter(n => Number.isFinite(n) && n >= 0).sort((a, b) => b - a);
  const tot = totalOI > 0 ? totalOI : arr.reduce((a, b) => a + b, 0);
  if (!(tot > 0) || !arr.length) return null;
  const sum = k => arr.slice(0, k).reduce((a, b) => a + b, 0);
  const top5 = +(sum(5) / tot * 100).toFixed(1), top10 = +(sum(10) / tot * 100).toFixed(1);
  return { top5Pct: top5, top10Pct: top10, read: top5 >= 50 ? 'concentrated' : top5 >= 30 ? 'moderate' : 'dispersed' };
}

// Strike CLUSTERING (ChatGPT layer 7 / course "walls are zones not lines"): merge
// nearby high-OI strikes within `tolPrice` into one institutional zone (OI-weighted
// centre + total). Feeds the brief, the confluence scorers and the OI bot — a
// clustered zone is higher-conviction than a lone strike. `walls` = [{strike|price,
// oi, kind?}]. Pure.
export function clusterStrikes(walls, tolPrice) {
  const items = (Array.isArray(walls) ? walls : [])
    .map(w => ({ strike: w?.strike ?? w?.price, oi: w?.oi ?? 0, kind: w?.kind ?? w?.type ?? null }))
    .filter(w => Number.isFinite(w.strike) && w.oi >= 0)
    .sort((a, b) => a.strike - b.strike);
  if (!items.length || !(tolPrice > 0)) return [];
  const clusters = [];
  let cur = null;
  for (const it of items) {
    if (cur && it.strike - cur.hi <= tolPrice) { cur.members.push(it); cur.hi = it.strike; cur.totalOI += it.oi; }
    else { if (cur) clusters.push(cur); cur = { lo: it.strike, hi: it.strike, totalOI: it.oi, members: [it] }; }
  }
  if (cur) clusters.push(cur);
  return clusters.map(c => ({
    low: +c.lo.toFixed(6), high: +c.hi.toFixed(6),
    center: +(c.members.reduce((s, m) => s + m.strike * m.oi, 0) / Math.max(c.totalOI, 1)).toFixed(6),
    totalOI: Math.round(c.totalOI), count: c.members.length,
    kinds: [...new Set(c.members.map(m => m.kind).filter(Boolean))],
  })).sort((a, b) => b.totalOI - a.totalOI);
}

// Wall STABILITY (ChatGPT layer 4): how many consecutive days each of the CURRENT
// walls has persisted (within `tolPrice`) across the archived `oi_history` series —
// an established wall (many days) is more reliable than one that appeared overnight.
// `historyDays` = [{date, callWalls:[{strike,oi}], putWalls:[...]}] oldest→newest. Pure.
export function oiWallStability(historyDays, tolPrice) {
  const days = Array.isArray(historyDays) ? historyDays : [];
  if (!days.length || !(tolPrice > 0)) return [];
  const cur = days[days.length - 1];
  const curWalls = [
    ...(cur.callWalls || []).map(w => ({ ...w, kind: 'call' })),
    ...(cur.putWalls || []).map(w => ({ ...w, kind: 'put' })),
  ];
  const present = (day, strike, kind) =>
    ((kind === 'call' ? day.callWalls : day.putWalls) || []).some(w => Math.abs(w.strike - strike) <= tolPrice);
  return curWalls.map(w => {
    let d = 0;
    for (let i = days.length - 1; i >= 0; i--) { if (present(days[i], w.strike, w.kind)) d++; else break; }
    return { strike: w.strike, kind: w.kind, oi: w.oi, daysPresent: d, fresh: d <= 1, established: d >= 5 };
  });
}

export function oiStoreToLevels(inst, { topWalls = 2 } = {}) {
  if (!inst || typeof inst !== 'object') return [];
  const out = [];
  // Walls carry their 3× strength `tier` so the bots can weight/gate by it — the
  // fix for "a strong wall should trade differently from a weak one". Non-wall
  // types (max_pain/gamma_flip/hvl/oi_volume) have no tier.
  const push = (price, type, tier = null) => { if (Number.isFinite(price) && price > 0) out.push(tier ? { price: +price, type, tier } : { price: +price, type }); };
  const cw = Array.isArray(inst.callWalls) ? inst.callWalls : [];
  const pw = Array.isArray(inst.putWalls) ? inst.putWalls : [];
  push(inst.maxPain, 'max_pain');
  push(inst.callWall, 'call_wall', cw.find(w => w.strike === inst.callWall)?.tier ?? null);
  push(inst.putWall, 'put_wall', pw.find(w => w.strike === inst.putWall)?.tier ?? null);
  for (const w of cw.slice(0, topWalls)) push(w?.strike, 'call_wall', w?.tier ?? null);
  for (const w of pw.slice(0, topWalls)) push(w?.strike, 'put_wall', w?.tier ?? null);
  const gp = Array.isArray(inst.gexProfile) ? inst.gexProfile : [];
  for (let i = 1; i < gp.length; i++) {
    if (Math.sign(gp[i]?.netGex ?? 0) !== Math.sign(gp[i - 1]?.netGex ?? 0)) {
      push(Math.abs(gp[i].netGex) < Math.abs(gp[i - 1].netGex) ? gp[i].strike : gp[i - 1].strike, 'gamma_flip');
      break;
    }
  }
  let hvl = null, hg = -Infinity;
  for (const g of gp) { const ag = Math.abs(g?.gamma ?? 0); if (ag > hg) { hg = ag; hvl = g?.strike; } }
  push(hvl, 'hvl');
  for (const v of (Array.isArray(inst.volumeMagnets) ? inst.volumeMagnets : []).slice(0, topWalls)) push(v?.strike, 'oi_volume');
  // Institutional CLUSTER zones (≥2 merged strikes) — a higher-conviction level the
  // bots/OI-bot can trade off. Emit the zone centre as `oi_cluster`.
  for (const c of (Array.isArray(inst.clusters) ? inst.clusters : [])) if ((c?.count ?? 0) >= 2) push(c.center, 'oi_cluster');
  const seen = new Set(), dedup = [];
  for (const l of out) { const k = `${l.type}@${l.price}`; if (!seen.has(k)) { seen.add(k); dedup.push(l); } }
  return dedup;
}

// OI-implied directional bias at a level the price is touching — the standard
// dealer-hedging reads, encoded so the bot can "trade sell/buy off the level":
//   • call_wall  = resistance (heavy call OI above; dealers sell into it) → SELL
//   • put_wall   = support    (heavy put OI below; dealers buy into it)   → BUY
//   • max_pain   = pin toward the strike: if the touched level is ABOVE max pain
//                  the pull is DOWN → SELL; BELOW → BUY (at the pin itself → none)
//   • gamma_flip = regime, not direction: above it = long-gamma (mean-revert /
//                  fade favoured), below = short-gamma (trend / follow favoured)
//   • hvl        = defended level, no inherent side → contributes to `regime` only
// Hold-vs-break (Lesson 5, `breakPips`>0 + `px`): a wall broken by more than
// breakPips flips from fade barrier to squeeze — call wall broken UP → buy, put
// wall broken DOWN → sell (parity with rangeline.py oi_bias).
// Returns { dir:'buy'|'sell'|null, strength (# agreeing OI reasons), reasons:[],
// regime:'meanrevert'|'trend'|null, conflict:bool }. Pure. `maxPain` optional
// (else inferred from an OI level of type max_pain).
export function oiBias(price, oiLevels, { pip, tolPips = 10, maxPain = null, px = null, breakPips = 0 } = {}) {
  const none = { dir: null, strength: 0, reasons: [], regime: null, conflict: false };
  if (!(price > 0) || !(pip > 0) || !Array.isArray(oiLevels) || !oiLevels.length) return none;
  const tol = tolPips * pip;
  // Break check first: a broken wall is a squeeze, not a barrier.
  if (Number.isFinite(px) && breakPips > 0) {
    const bd = breakPips * pip;
    for (const lv of oiLevels) {
      if (!Number.isFinite(lv?.price) || Math.abs(lv.price - price) > tol) continue;
      if (lv.type === 'call_wall' && px > lv.price + bd) return { dir: 'buy', strength: 1, reasons: ['call_wall broken up→squeeze→buy'], regime: 'trend', conflict: false };
      if (lv.type === 'put_wall' && px < lv.price - bd) return { dir: 'sell', strength: 1, reasons: ['put_wall broken down→squeeze→sell'], regime: 'trend', conflict: false };
    }
  }
  let buy = 0, sell = 0; const reasons = []; let regime = null;
  const mp = Number.isFinite(maxPain) ? maxPain
           : (oiLevels.find(l => l.type === 'max_pain' && Number.isFinite(l.price))?.price ?? null);
  const flip = oiLevels.find(l => l.type === 'gamma_flip' && Number.isFinite(l.price))?.price ?? null;
  if (Number.isFinite(flip)) regime = price > flip ? 'meanrevert' : 'trend';
  for (const lv of oiLevels) {
    if (!Number.isFinite(lv?.price) || Math.abs(lv.price - price) > tol) continue;
    if (lv.type === 'call_wall') { sell++; reasons.push('call_wall→resistance→sell'); }
    else if (lv.type === 'put_wall') { buy++; reasons.push('put_wall→support→buy'); }
    else if (lv.type === 'max_pain') { reasons.push('at max_pain→pin (no side)'); }
  }
  // Max-pain gravity: a touched level away from max pain is pulled back toward it.
  if (Number.isFinite(mp) && Math.abs(price - mp) > tol) {
    if (price > mp) { sell++; reasons.push('above max_pain→pull down→sell'); }
    else { buy++; reasons.push('below max_pain→pull up→buy'); }
  }
  const dir = buy > sell ? 'buy' : sell > buy ? 'sell' : null;
  return { dir, strength: Math.max(buy, sell), reasons, regime, conflict: buy > 0 && sell > 0 };
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
  const dirAgree = _acc(), dirDisagree = _acc();
  const byType = {};
  let joined = 0, noOI = 0, unresolved = 0;
  for (const t of (Array.isArray(tradeLog) ? tradeLog : [])) {
    const ret = tradePctReturn(t);
    if (ret == null) { unresolved++; continue; }
    const key = t.key || String(t.instrument ?? t.symbol ?? '').toLowerCase().replace('/', '').replace('_', '');
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
      // OI-DIRECTION scoring: did the trade's actual side match the OI read, and
      // did agreeing help? This is what validates the `oi_override` idea before it's
      // trusted live — split tagged trades by whether direction agreed with oiBias.
      const bias = oiBias(t.open_price, oi, { pip, tolPips });
      const tdir = /buy|long/i.test(String(t.direction)) ? 'buy' : /sell|short/i.test(String(t.direction)) ? 'sell' : null;
      if (bias.dir && tdir) _add(bias.dir === tdir ? dirAgree : dirDisagree, ret);
    } else {
      _add(untagged, ret);
    }
  }
  const finByType = {}; for (const k of Object.keys(byType)) finByType[k] = _fin(byType[k]);
  return {
    tagged: _fin(tagged), untagged: _fin(untagged),
    taggedNotRound: _fin(taggedNotRound), taggedAtRound: _fin(taggedAtRound),
    oiDirAgree: _fin(dirAgree), oiDirDisagree: _fin(dirDisagree),
    byType: finByType,
    coverage: { tradesWithOIDay: joined, tradesNoOIDay: noOI, unresolved },
    edge: +(_fin(tagged).avgRet - _fin(untagged).avgRet).toFixed(5),   // tagged − untagged expectancy
    oiDirEdge: +(_fin(dirAgree).avgRet - _fin(dirDisagree).avgRet).toFixed(5),   // agree − disagree (validates oi_override)
  };
}
