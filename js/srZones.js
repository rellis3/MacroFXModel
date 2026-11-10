/**
 * S/R ZONES — a desk-note ladder of support and resistance zones per instrument (owner request, 2026-11-10).
 *
 *   "Tier 2 — GEX flip / IV p50 down / forecast median low: futures 4192–4196 → CFD 4169–4173 (three sources agree)"
 *
 * Sources (families): oi (call/put wall, max pain, implied-move edges) · gamma (gamma flip, GEX flip, charm/vanna flips) · forecast (the vol
 * forecast ladder p50/p75/p90 highs and lows) · iv (the IV-adjusted ladder) · desk (the desk card's entry-zone ends and its invalidation) ·
 * profile (naked POCs, HVN/LVN of the last five London sessions' volume profile). Deliberately NOT fibs, pivots, round numbers, swing S/R,
 * prior opens or VWAP (the Confluence Zones export, js/confluenceZoneExport.js, keeps those).
 *
 * WHAT THE TIER NUMBER MEANS: distance only (js/oiTiers.js buildTiers, nearest = Tier 1). Nearer zones are reached more often — that is the
 * validated part (level-engine reach). The number of families in a zone is DESCRIPTIVE: OI walls and ladder lines are each placebo-null as
 * reaction levels, and a confluent ladder line on a gamma level did not react more (oi_research_book/GEX_LADDER_CONFLUENCE_RESULTS.md).
 * Nothing here is a signal; nothing reads it to trade.
 *
 * Pure, offline-testable (js/srZones.test.mjs). The server (js/srZonesRoutes.js) supplies the inputs.
 */
import { buildTiers, ladderLegs } from './oiTiers.js';
import { nakedLevels } from './nakedLevels.js';
import { oiLevelList } from './oiConf.js';
import { cardPlan } from './tradeWatch.js';

export const SRZ_HEADER = 'Tier = distance from spot (nearer is reached more often). Sources agreeing is descriptive, not shown to predict a reaction.';
export const SRZ_DEFAULTS = { radius: 0.15, maxSpan: 0.3, maxTiers: 6, maxSigma: 2.5, binFrac: 0.02, npocLookback: 15, compositeN: 5, hvnMult: 1.3, lvnMult: 0.5, maxHvn: 3, maxLvn: 3, minSessionBars: 36 };
export const FAMILY_ORDER = ['oi', 'gamma', 'forecast', 'iv', 'desk', 'profile'];

const OI_LABEL = { call_wall: 'call wall', put_wall: 'put wall', max_pain: 'max pain', exp_move_hi: 'implied-move high', exp_move_lo: 'implied-move low',
  gamma_flip: 'gamma flip', gex_flip: 'GEX flip', charm_flip: 'charm flip', vanna_flip: 'vanna flip', hvl: 'HVL (peak gamma)' };
const OI_FAMILY = { call_wall: 'oi', put_wall: 'oi', max_pain: 'oi', exp_move_hi: 'oi', exp_move_lo: 'oi', gamma_flip: 'gamma', gex_flip: 'gamma', charm_flip: 'gamma', vanna_flip: 'gamma', hvl: 'gamma' };
export const SRZ_OI_TYPES = Object.keys(OI_LABEL);

// ── London calendar ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const _ldnDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
const _ldnHm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** London calendar date ('YYYY-MM-DD') of a unix-seconds time — sessions are London calendar days (London midnight, DST-aware). */
export const londonDay = sec => _ldnDay.format(new Date(sec * 1000));
/** The London-midnight open of `day` from M5 bars: the bar stamped 00:00 London, else the first bar of that London day. */
export function londonOpen(bars, day) {
  let first = null;
  for (const b of bars || []) {
    if (londonDay(b.time) !== day) continue;
    if (_ldnHm.format(new Date(b.time * 1000)) === '00:00') return b.open;
    if (first == null) first = b.open;
  }
  return first;
}

// ── Volume profile (nPOC, HVN, LVN) ────────────────────────────────────────────────────────────────────────────────────────────────
// bars: [{time (unix s, bar open), high, low, volume}] — OANDA M5 with tick volume. A bar's volume is spread evenly over the bins its range covers.
function addBar(hist, b, w) {
  const v = Number(b.volume); if (!(v > 0) || !(b.high >= b.low)) return;
  const i0 = Math.floor(b.low / w), i1 = Math.floor(b.high / w), n = Math.min(i1 - i0 + 1, 400);
  const each = v / n;
  for (let i = 0; i < n; i++) hist.set(i0 + i, (hist.get(i0 + i) || 0) + each);
}
const pocOf = (hist, w) => { let best = null, bv = -1; for (const [i, v] of hist) if (v > bv || (v === bv && i < best)) { bv = v; best = i; } return best == null ? null : (best + 0.5) * w; };
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * opts: { spot, sigma (one day's σ in price), today ('YYYY-MM-DD' London; the forming session), binFrac, npocLookback, compositeN, hvnMult, lvnMult,
 * maxHvn, maxLvn, maxSigma, minSessionBars }. Returns { npoc:[{price,date}], hvn:[{price,vol}], lvn:[{price,vol}], sessions:n, binWidth, reason? }.
 */
export function volumeProfileLevels(bars, opts = {}) {
  const o = { ...SRZ_DEFAULTS, ...opts };
  const { spot, sigma, today } = o;
  const empty = reason => ({ npoc: [], hvn: [], lvn: [], sessions: 0, binWidth: null, reason });
  if (!(spot > 0) || !(sigma > 0)) return empty('no spot/σ');
  if (!Array.isArray(bars) || !bars.length) return empty('no bars');
  if (!bars.some(b => Number(b.volume) > 0)) return empty('no tick volume on the bars');
  const w = o.binFrac * sigma;
  const byDay = new Map();
  for (const b of bars) {
    const d = londonDay(b.time);
    let s = byDay.get(d);
    if (!s) byDay.set(d, (s = { date: d, high: -Infinity, low: Infinity, n: 0, hist: new Map() }));
    s.high = Math.max(s.high, b.high); s.low = Math.min(s.low, b.low); s.n++;
    addBar(s.hist, b, w);
  }
  const days = [...byDay.keys()].sort();
  // a short session (a Sunday-evening FX open, a holiday stub) still counts as a LATER session that may have traded through a level, but has no POC of its own
  const all = days.map(d => { const s = byDay.get(d); return { date: d, high: s.high, low: s.low, poc: (d !== today && s.n >= o.minSessionBars) ? pocOf(s.hist, w) : null, n: s.n, hist: s.hist }; });
  const keepForming = today && all.length && all[all.length - 1].date === today ? 1 : 0;
  const completed = all.slice(0, all.length - keepForming).filter(s => s.poc != null);
  const near = p => Math.abs(p - spot) <= o.maxSigma * sigma;
  const npoc = nakedLevels(all, { lookback: o.npocLookback, kinds: ['poc'], keepForming })
    .filter(l => near(l.price)).map(l => ({ price: l.price, date: l.date }));
  // composite of the last N completed sessions, smoothed with a 3-bin moving average
  const comp = new Map();
  for (const s of completed.slice(-o.compositeN)) for (const [i, v] of s.hist) comp.set(i, (comp.get(i) || 0) + v);
  if (!comp.size) return { npoc, hvn: [], lvn: [], sessions: completed.length, binWidth: w, reason: 'no completed session' };
  const keys = [...comp.keys()], lo = Math.min(...keys), hi = Math.max(...keys);
  const raw = []; for (let i = lo; i <= hi; i++) raw.push(comp.get(i) || 0);
  const sm = raw.map((_, k) => ((raw[k - 1] ?? raw[k]) + raw[k] + (raw[k + 1] ?? raw[k])) / 3);
  const med = median(raw.filter(v => v > 0));
  const priceAt = k => (lo + k + 0.5) * w;
  const peaks = [];
  for (let k = 1; k < sm.length - 1; k++) if (sm[k] > sm[k - 1] && sm[k] >= sm[k + 1] && sm[k] >= o.hvnMult * med) peaks.push(k);
  const hvn = peaks.map(k => ({ k, price: priceAt(k), vol: sm[k] })).filter(p => near(p.price)).sort((a, b) => b.vol - a.vol).slice(0, o.maxHvn);
  // LVN: the thinnest bin between two neighbouring qualifying peaks, if it holds at most lvnMult × the smaller of the two peaks
  const lvnAll = [];
  for (let j = 0; j < peaks.length - 1; j++) {
    const a = peaks[j], b = peaks[j + 1];
    let m = a + 1; for (let k = a + 1; k < b; k++) if (sm[k] < sm[m]) m = k;
    if (m < b && sm[m] <= o.lvnMult * Math.min(sm[a], sm[b])) lvnAll.push({ k: m, price: priceAt(m), vol: sm[m], depth: sm[m] / Math.min(sm[a], sm[b]) });
  }
  const lvn = lvnAll.filter(p => near(p.price)).sort((a, b) => a.depth - b.depth).slice(0, o.maxLvn);
  return { npoc, hvn: hvn.map(({ price, vol }) => ({ price, vol })), lvn: lvn.map(({ price, vol }) => ({ price, vol })), sessions: completed.length, binWidth: w };
}

// ── Legs per family ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const leg = (price, family, type, label) => ({ price, kind: family, family, type, label });

/** OI + gamma legs: oiStoreToLevels(inst) output plus the charm/vanna flips and implied-move edges on the record (js/oiConf.js oiLevelList). */
export function oiLegs(levels, inst) {
  const out = [];
  for (const l of oiLevelList(levels, inst, SRZ_OI_TYPES)) {
    const dte = Number.isFinite(l.dte) ? ` ${Math.max(0, Math.round(l.dte))}d` : '';
    out.push(leg(l.price, OI_FAMILY[l.type], l.type, `${OI_LABEL[l.type]}${dte}`));
  }
  return out;
}
/** GEX peaks (family gamma): the strike with the largest positive net GEX (dealers long gamma: the strongest pinning strike) and the
 *  largest negative (dealers short gamma: where hedging adds to the move), from the record's per-strike profile, within 10% of spot. */
export function gexPeakLegs(inst, spot) {
  const gp = Array.isArray(inst?.dayExpiry?.gexProfile) && inst.dayExpiry.gexProfile.length ? inst.dayExpiry.gexProfile : Array.isArray(inst?.gexProfile) ? inst.gexProfile : [];
  let pos = null, neg = null;
  for (const g of gp) {
    const k = +g?.strike, v = +g?.netGex;
    if (!(k > 0) || !Number.isFinite(v) || !(spot > 0) || Math.abs(k / spot - 1) > 0.10) continue;
    if (v > 0 && (!pos || v > pos.v)) pos = { k, v };
    if (v < 0 && (!neg || v < neg.v)) neg = { k, v };
  }
  const out = [];
  if (pos) out.push(leg(pos.k, 'gamma', 'gex_pos_peak', '+GEX peak (pin strike)'));
  if (neg) out.push(leg(neg.k, 'gamma', 'gex_neg_peak', '−GEX peak (accelerant strike)'));
  return out;
}
/** Overbought / oversold read. Two parts, kept apart because their evidence differs:
 *  day  = how far price is from the London open in σ and which forecast line it has passed (past p75 typically leaves ~0.3σ of travel:
 *         nq-lines-as-exhaustion; reach is the validated part of the lines);
 *  cot  = speculators' net positioning vs its 3-year range (extremes alone tested null as a reversal call: squeeze-fuel, cot-positioning-factor;
 *         only COT state D, crowded with the trend while price pulls back and the crowd reduces, passed on history). */
export function stretchContext({ spot, open, sigma, ladder, cot } = {}) {
  const parts = [];
  let day = null, dayWord = null;
  if (spot > 0 && open > 0 && sigma > 0) {
    day = (spot - open) / sigma;
    const pct = (spot / open - 1) * 100, up = pct >= 0, side = up ? ladder?.oh : ladder?.ol, a = Math.abs(pct);
    const past = side ? ['p90', 'p75', 'p50'].find(r => Number.isFinite(side[r]) && a >= side[r]) : null;
    dayWord = past === 'p90' || past === 'p75' ? (up ? 'overbought on the day' : 'oversold on the day') : 'inside the day range';
    parts.push(`day ${day >= 0 ? '+' : ''}${day.toFixed(2)}σ from open${past ? `, past ${past} ${up ? 'high' : 'low'}` : ''} (${dayWord}${past === 'p90' || past === 'p75' ? ', ~0.3σ typical travel left' : ''})`);
  }
  let cotWord = null;
  if (cot && cot.pct != null) {
    cotWord = cot.pct >= 90 ? 'COT overbought (specs crowded long)' : cot.pct <= 10 ? 'COT oversold (specs crowded short)' : cot.pct >= 70 ? 'COT leaning long' : cot.pct <= 30 ? 'COT leaning short' : 'COT neutral';
    parts.push(`${cotWord}, ${ord(Math.round(cot.pct))} pct 3y`);
  }
  return parts.length ? { text: parts.join(' · '), day, dayWord, cotWord, cotPct: cot?.pct ?? null } : null;
}
/** The forecast ladder (family forecast) or the IV-adjusted ladder (family iv), anchored at the London-midnight open. */
export function forecastLegs(ladder, open, family = 'forecast') {
  const lab = family === 'iv' ? { prefix: 'ivadj', name: 'IV-adj' } : { prefix: 'fcst', name: 'forecast' };
  return ladderLegs(ladder, open, lab).map(l => leg(l.price, family, l.type, l.label));
}
/** The desk card's entry-zone ends and its invalidation (js/tradeWatch.js cardPlan — the same numbers the trade watcher alerts on). */
export function deskLegs(card) {
  const p = cardPlan(card); if (!p) return [];
  const side = p.dir > 0 ? 'long' : 'short', out = [];
  if (p.zone) {
    if (p.zone[0] === p.zone[1]) out.push(leg(p.zone[0], 'desk', 'desk_zone', `desk ${side} zone`));
    else out.push(leg(p.zone[0], 'desk', 'desk_zone_lo', `desk ${side} zone low`), leg(p.zone[1], 'desk', 'desk_zone_hi', `desk ${side} zone high`));
  }
  if (Number.isFinite(p.invalid)) out.push(leg(p.invalid, 'desk', 'desk_invalid', 'desk invalidation'));
  return out;
}
const mmdd = d => (d ? String(d).slice(5) : '');
export function profileLegs(vp) {
  if (!vp) return [];
  return [
    ...(vp.npoc || []).map(n => leg(n.price, 'profile', 'npoc', `nPOC ${mmdd(n.date)}`.trim())),
    ...(vp.hvn || []).map(h => leg(h.price, 'profile', 'hvn', 'HVN')),
    ...(vp.lvn || []).map(h => leg(h.price, 'profile', 'lvn', 'LVN')),
  ];
}

// ── Zones ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Cluster every leg into zones either side of spot (distance-ranked). Returns { support:[zone], resistance:[zone] }, zone = { tier, lo, hi, mid, dist, families:[..], nFamilies, sources:[..] }. */
export function buildSrZones({ spot, sigma, legs = [], opts = {} }) {
  const o = { ...SRZ_DEFAULTS, ...opts };
  const clean = legs.filter(l => Number.isFinite(l?.price) && l.price > 0);
  const t = buildTiers({ spot, sigma, levels: [], legs: clean, radius: o.radius, maxSpan: o.maxSpan, maxTiers: o.maxTiers, maxSigma: o.maxSigma });
  const shape = z => {
    const fam = FAMILY_ORDER.filter(f => z.members.some(m => m.family === f));
    const ms = [...z.members].sort((a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family));
    return { tier: z.n, lo: z.lo, hi: z.hi, mid: z.mid, dist: z.dist, families: fam, nFamilies: fam.length, sources: [...new Set(ms.map(m => m.label))],
      members: ms.map(m => ({ price: m.price, family: m.family, type: m.type, label: m.label })) };
  };
  return { support: t.below.map(shape), resistance: t.above.map(shape) };
}

// ── Context ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Gamma regime from the sign of net dealer GEX: the near-dated ("day") book when present, as the OI levels export does. */
export function gexContext(inst) {
  const gd = inst?.dayExpiry?.exposures?.gex, gp = inst?.exposures?.gex;
  const g = Number.isFinite(gd) && gd !== 0 ? gd : gp;
  if (!Number.isFinite(g) || g === 0) return null;
  return g > 0 ? 'pos pin' : 'neg breakout';
}
const ord = n => { const s = n % 100; return `${n}${s >= 11 && s <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`; };
/** COT one-liner from the C+Z export's COT view ({pct, share, reportDate, ageDays}). Positioning only, never a level. */
export function cotContext(c) {
  if (!c || c.pct == null) return null;
  const side = c.pct >= 90 ? 'crowded long' : c.pct <= 10 ? 'crowded short' : c.pct >= 70 ? 'leaning long' : c.pct <= 30 ? 'leaning short' : 'balanced';
  const net = Number.isFinite(c.share) ? `, specs net ${c.share >= 0 ? '+' : ''}${(+c.share).toFixed(1)}% of OI` : '';
  const age = Number.isFinite(c.ageDays) ? `, ${c.ageDays}d old` : '';
  return `${ord(Math.round(c.pct))} pct ${side}${net}${age}`;
}

// ── Text (for the Pine renderer) ───────────────────────────────────────────────────────────────────────────────────────────────────
const safe = s => String(s ?? '').replace(/[|\r\n]+/g, ' ').replace(/=/g, ':').trim();
/** One block. item = { name, aliases, spot, sigma, basis (futures − spot, or null), date, digits, gex, cot, desk, missing:[..], zones:{support,resistance} } */
export function formatBlock(item) {
  const dp = Number.isFinite(item.digits) ? item.digits : 2, f = v => (+v).toFixed(dp);
  const head = [`SRZ`, safe(item.name), (item.aliases || []).map(safe).join(','), `spot=${f(item.spot)}`, `sigma=${f(item.sigma)}`,
    `basis=${Number.isFinite(item.basis) ? f(item.basis) : 'na'}`, `date=${item.date}`];
  if (item.gex) head.push(`gex=${safe(item.gex)}`);
  if (item.cot) head.push(`cot=${safe(item.cot)}`);
  if (item.desk) head.push(`desk=${safe(item.desk)}`);
  if (item.stretch?.text) head.push(`stretch=${safe(item.stretch.text)}`);
  if (item.missing?.length) head.push(`missing=${item.missing.map(safe).join(',')}`);
  const L = [head.join('|')];
  for (const [side, arr] of [['S', item.zones?.support || []], ['R', item.zones?.resistance || []]]) {
    for (const z of arr) L.push([side, z.tier, f(z.lo), f(z.hi), z.nFamilies, safe(z.sources.join(' + ')), z.dist.toFixed(2)].join('|'));
  }
  return L.join('\n');
}
export function formatExport(items, { generated = null } = {}) {
  return [`# ${SRZ_HEADER}${generated ? ` Generated ${generated}.` : ''}`, ...items.map(formatBlock)].join('\n');
}
/** Pine strings are capped at 4,096 characters: cut on block boundaries (a block that is itself too long is cut on line boundaries). */
export function splitParts(text, max = 4000) {
  const NL = '\n', parts = []; let cur = '';
  const lines = String(text || '').split(NL);
  // group into blocks: a header/comment line, then each SRZ block with its S/R lines
  const blocks = []; for (const ln of lines) { if (ln.startsWith('SRZ|') || !blocks.length) blocks.push([ln]); else blocks[blocks.length - 1].push(ln); }
  const push = s => { if (cur && cur.length + s.length + 1 > max) { parts.push(cur); cur = ''; } cur += (cur ? NL : '') + s; };
  for (const b of blocks) { const s = b.join(NL); if (s.length <= max) push(s); else for (const ln of b) push(ln); }
  if (cur) parts.push(cur);
  return parts;
}
export const partsText = parts => parts.map((p, i) => `=====PART ${i + 1}/${parts.length}=====\n${p}`).join('\n');

/** Human-readable desk note for one item: "Support T2 4089.4–4091.6 · 3 families — GEX flip + IV-adj median low + nPOC 11-04". */
export function describeSrZone(z, side, dp = 2) {
  const f = v => (+v).toFixed(dp), rng = Math.abs(z.hi - z.lo) < 1e-12 ? f(z.lo) : `${f(z.lo)}–${f(z.hi)}`;
  return `${side === 'S' || side === 'support' ? 'Support' : 'Resistance'} T${z.tier} ${rng} · ${z.nFamilies} famil${z.nFamilies === 1 ? 'y' : 'ies'} — ${z.sources.join(' + ')}`;
}
