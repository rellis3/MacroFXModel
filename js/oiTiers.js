/**
 * OI TIERS — group the day's levels (OI walls/flips/max pain + the forecast ladder's median/75th/90th highs and lows) into zones
 * either side of spot and rank the zones by DISTANCE, nearest = Tier 1. Output reads like a desk note:
 *   "Tier 2 — mid, GEX flip + forecast median low: CFD spot 4169–4173 (futures 4192–4196)"
 *
 * WHAT THE TIER NUMBER MEANS: distance only. Nearer zones are reached first and more often — that is validated geometry (level-engine P2:
 * reach is set by distance ÷ (σ·√time left), level identity adds nothing). "N sources agree" is DESCRIPTIVE: oi_research_book/
 * GEX_LADDER_CONFLUENCE_RESULTS.md found no sign a ladder line on a gamma level reacts more (and the forecast legs share one σ, so they are
 * not independent confirmations). The export says so in its header line.
 *
 * Pure, offline-testable. No Pine change: the tier text rides in the heat slot (chart label) and note slot (table) of existing OI lines.
 */

const SRC_LABEL = {
  call_wall: 'call wall', put_wall: 'put wall', gex_flip: 'GEX flip', gamma_flip: 'gamma flip', max_pain: 'max pain',
  charm_flip: 'charm flip', vanna_flip: 'vanna flip', exp_move_hi: 'implied-move high', exp_move_lo: 'implied-move low',
};
const RUNG_LABEL = { p50: 'median', p75: '75th-pct', p90: '90th-pct' };
export const TIER_OI_TYPES = new Set(Object.keys(SRC_LABEL));

// ladder = { oh:{p50,p75,p90}, ol:{...} } in percent of the open. Returns [{ price, kind:'ladder', type:'fcst_p50_lo', label:'forecast median low' }].
export function ladderLegs(ladder, open) {
  if (!ladder || !(open > 0)) return [];
  const out = [];
  for (const r of ['p50', 'p75', 'p90']) {
    if (Number.isFinite(ladder.oh?.[r])) out.push({ price: open * (1 + ladder.oh[r] / 100), kind: 'ladder', type: `fcst_${r}_hi`, label: `forecast ${RUNG_LABEL[r]} high` });
    if (Number.isFinite(ladder.ol?.[r])) out.push({ price: open * (1 - ladder.ol[r] / 100), kind: 'ladder', type: `fcst_${r}_lo`, label: `forecast ${RUNG_LABEL[r]} low` });
  }
  return out;
}

const character = d => (d < 0.5 ? 'shallow' : d < 1 ? 'mid' : d < 1.6 ? 'deep' : 'tail');

// opts: spot, sigma (price points of one day's σ), levels (OI levels [{price,type,tier?,dte?}]), legs (ladderLegs), radius (σ fraction, default .15), maxSpan (widest zone, σ, default .3), maxTiers (per side, default 4)
// Returns { below:[zone], above:[zone] } nearest first; zone = { n, side, lo, hi, mid, dist, character, members:[{price,type,kind,label,ref}] }.
export function buildTiers({ spot, sigma, levels = [], legs = [], radius = 0.15, maxSpan = 0.3, maxTiers = 4 } = {}) {
  if (!(spot > 0) || !(sigma > 0)) return { below: [], above: [] };
  const members = [
    ...levels.filter(l => Number.isFinite(l?.price) && TIER_OI_TYPES.has(l.type)).map(l => ({ price: l.price, type: l.type, kind: 'oi', label: SRC_LABEL[l.type], ref: l })),
    ...legs.map(l => ({ ...l, ref: null })),
  ];
  const build = (side) => {
    const arr = members.filter(m => (side === 'below' ? m.price < spot : m.price > spot)).sort((a, b) => Math.abs(a.price - spot) - Math.abs(b.price - spot));
    const zones = [];
    for (const m of arr) {
      // join a zone only if the member is within `radius` of it AND the zone stays narrower than `maxSpan` σ — no single-linkage chains
      const z = zones.find(z => m.price >= z.lo - radius * sigma && m.price <= z.hi + radius * sigma && Math.max(z.hi, m.price) - Math.min(z.lo, m.price) <= maxSpan * sigma);
      if (z) { z.members.push(m); z.lo = Math.min(z.lo, m.price); z.hi = Math.max(z.hi, m.price); }
      else zones.push({ lo: m.price, hi: m.price, members: [m] });
    }
    return zones.slice(0, maxTiers).map((z, i) => {
      const mid = (z.lo + z.hi) / 2, dist = Math.abs(mid - spot) / sigma;
      return { n: i + 1, side, lo: z.lo, hi: z.hi, mid, dist, character: character(dist), members: z.members };
    });
  };
  return { below: build('below'), above: build('above') };
}

// "Tier 2 — mid, GEX flip + forecast median low: CFD spot 4169–4173 (futures 4192–4196) · P(touch) 38%~2h"
// fmt(price) → string in spot terms; fmtFut(price) → futures terms or null; touch = optional label.
export function describeZone(z, { fmt, fmtFut = null, touch = null } = {}) {
  const names = [...new Set(z.members.map(m => m.label))];
  const rng = (f) => (Math.abs(z.hi - z.lo) < 1e-9 ? f(z.lo) : `${f(z.lo)}–${f(z.hi)}`);
  const many = names.length > 1;
  const fut = fmtFut ? ` (futures ${rng(fmtFut)})` : '';
  return `Tier ${z.n} — ${z.character}, ${names.join(' + ')}${many ? ' confluence' : ''}: ${z.side === 'below' ? 'support' : 'resistance'} CFD spot ${rng(fmt)}${fut}${touch ? ` · ${touch}` : ''}`;
}

// short tag for the chart label (heat slot): "T2 mid"
export const zoneTag = z => `T${z.n}${z.side === 'below' ? 'v' : '^'} ${z.character}`;
