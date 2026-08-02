// oiLevelExport.js
// Builds the plain-text OI section appended to the Confluence-Zones paste block —
// the "OI WALLS & MAX PAIN" part of the C+Z export, drawn by the merged
// `Confluence Zones Indicator.pine`. (It began as a standalone indicator/export;
// that was retired 2026-07 in favour of one combined overlay.)
//
// SINGLE SOURCE OF TRUTH: level extraction is NOT re-implemented here. It reuses
// the `oiStoreToLevels` brick (js/oiConfluence.js) — the exact same converter the
// OI bot and `/api/oi-levels` use — so the pasted levels are bit-identical to what
// the bots trade off. This module only *formats* those levels for the indicator.
//
// Output line format (per pair block):
//   OI 1.10000 : call_wall t3      (resistance ceiling — heavy call OI above)
//   OI 1.09480 : max_pain          (pin/magnet strike)
//   OI 1.09000 : put_wall t2       (support floor — heavy put OI below)
//   OI 1.09600 : gamma_flip        (long↔short-gamma regime boundary)
//   OI 1.10250 : oi_volume         (heaviest TODAY's option volume — transient)
// `t{n}` = wall strength tier (3 = strongest); omitted for non-wall types and for
// walls with no tier. The indicator parses ONLY lines beginning with "OI " for
// levels, plus the per-pair `· … · regime PIN|BREAKOUT` context line for the gamma
// regime tint. Every other line is ignored by the indicator and exists purely so a
// human reading the paste can see how STALE each pair is.
//
// GAMMA REGIME: derived from the sign of net dealer GEX (inst.exposures.gex) —
// positive → PIN (dealers long gamma, hedging dampens moves, walls hold / pull to
// max pain); negative → BREAKOUT (short gamma, hedging amplifies, breaks run. This
// is the GEX-SIGN read only; the fuller classifier's gravity weighting needs live
// ATR, which the paste doesn't carry — so it's labelled as such, not overstated.
//
// HONESTY: these levels are only as fresh as the user's last option-chain paste on
// the dashboard. The per-pair context line stamps that paste time + spot so a stale
// wall is never mistaken for a live one. Pairs with no CME options market never
// appear (the store simply has no entry for them) — no invented numbers.

import { oiStoreToLevels } from './oiConfluence.js';
import { levelExpectation } from './levelExpectation.js';
import { levelHeat } from './levelHeat.js';
import { gammaFlip, distanceToFlip, rolloffSummary } from './gammaFlow.js';
import { rebuildGexProfile } from './oi.js';

// Canonical chart-ticker per oi_store key. Mirrors the Confluence-Zones indicator's
// normalisation targets so the same chart symbols the user already uses resolve here
// (the Pine side normalises the live chart symbol to these same names).
const CANON = {
  'XAU/USD': 'GOLD', 'NAS100_USD': 'NQ', 'SPX500_USD': 'SPX500',
  'DE30_USD': 'DE30', 'UK100_GBP': 'UK100', 'US30_USD': 'US30', 'US2000_USD': 'US2000',
};

// Which level types to export, in the order they should print within a block, and
// the price decimals per instrument class. The strongest call/put walls + max pain,
// plus gamma_flip (regime boundary) and oi_volume (today's heaviest-volume strikes).
const TYPE_ORDER = ['call_wall', 'gamma_flip', 'gex_flip', 'max_pain', 'put_wall', 'oi_volume'];
const WANT = new Set(TYPE_ORDER);

const JPY_KEY = /JPY/i;
const INDEX_CANON = new Set(['NQ', 'SPX500', 'DE30', 'UK100', 'US30', 'US2000']);

function canonName(pair) {
  if (CANON[pair]) return CANON[pair];
  return String(pair).toUpperCase().replace(/[/_ ]/g, '');   // EUR/USD → EURUSD
}

function priceDp(pair, canon) {
  if (canon === 'GOLD' || INDEX_CANON.has(canon)) return 2;
  if (JPY_KEY.test(pair)) return 3;
  return 5;
}

// Gamma regime from the SIGN of net dealer GEX only (see header note). Positive →
// PIN, negative → BREAKOUT, zero/absent → no call (rather than a fake NEUTRAL).
function regimeOf(inst) {
  const g = inst?.exposures?.gex;
  if (!Number.isFinite(g) || g === 0) return null;
  return g > 0 ? 'PIN' : 'BREAKOUT';
}

function fmtSaved(inst) {
  const bits = [];
  if (inst?.savedAt) bits.push(`saved ${inst.savedAt}`);
  if (Number.isFinite(inst?.spot)) bits.push(`spot ${inst.spot}`);
  if (Number.isFinite(inst?.dte)) bits.push(`DTE ${inst.dte}`);
  // Inverted pairs can be exported under either call/put reading — say which, or a
  // red 'call wall' below spot looks like a bug rather than a deliberate setting.
  if (inst?.cpSwapped) bits.push('C/P flipped to pair terms');
  // Regime: when a near-dated "day" expiry is present, IT is what the bot trades, so the
  // tinted `regime` word follows the near-dated GEX sign (user's call). The far/primary
  // book still shows, but as "long/short-gamma" — deliberately NOT the words PIN/BREAKOUT/
  // regime, so the indicator's tint parse (which fires on any "REGIME" line and lets
  // BREAKOUT win ties) can't pick up the far regime by accident.
  const rgFar = regimeOf(inst);
  const day = inst?.dayExpiry;
  if (day && Number.isFinite(day.dte)) {
    const gd = day?.exposures?.gex;
    const rgDay = Number.isFinite(gd) && gd !== 0 ? (gd > 0 ? 'PIN' : 'BREAKOUT') : null;
    if (rgDay) bits.push(`regime ${rgDay}`);                        // NEAR-DATED — the tinted regime + what the bot trades
    bits.push(`day ${day.dte}dte vs primary ${inst?.dte ?? '?'}dte`);
    if (rgFar) bits.push(`primary book ${rgFar === 'PIN' ? 'long-gamma' : 'short-gamma'}`);   // context only, no tint trigger
  } else if (rgFar) {
    bits.push(`regime ${rgFar}`);            // single-expiry: the indicator parses THIS for its tint
  }
  return bits.length ? `· ${bits.join(' · ')}` : null;
}

// Positioning context for the paste: crowding percentile, which way, and how stale. On
// its own line so the age is impossible to miss, and explicitly labelled "not a level"
// because COT has no price coordinate — it conditions how you read the walls, it never
// times them and it must never be drawn as a line.
function fmtCot(c) {
  if (!c || c.pct == null) return null;
  const side = c.pct >= 90 ? 'CROWDED LONG' : c.pct <= 10 ? 'CROWDED SHORT'
             : c.pct >= 70 ? 'leaning long' : c.pct <= 30 ? 'leaning short' : 'balanced';
  const bits = [`cot ${c.pct}th pct — ${side}`];
  if (c.share != null) bits.push(`net ${c.share}% of OI`);
  if (c.reportDate) bits.push(`report ${c.reportDate}${c.ageDays != null ? ` (${c.ageDays}d old)` : ''}`);
  return `· ${bits.join(' · ')} · positioning only, NOT a level`;
}

// store = { [pair]: inst } (the `oi_store` KV `.data` object). Pure.
// topWalls defaults to null so the shared converter's TIER rule decides what's worth
// drawing (course Lesson 4's 3× rule) instead of an arbitrary count. Pass a number to
// force the old fixed-count behaviour.
// `cot` (optional) = { [canonName]: {pct, share, net, reportDate, ageDays, side} }. COT has
// NO price coordinate — it is positioning, not a level — so it is emitted on the per-pair
// context line the indicator ignores, never as an `OI {price}` line. Drawing a horizontal
// line for it would invent a price the data does not contain.
export function buildOILevelText(store, { topWalls = null, minTier = "moderate", maxWalls = 3, generated = null, cot = null, reachByPair = null } = {}) {
  const LW = 44;
  const hdr = '──── OI WALLS & MAX PAIN ' + '─'.repeat(Math.max(0, LW - 25));
  const lines = [hdr];
  lines.push(`Generated: ${generated ?? 'latest'}`);
  lines.push('Types: call_wall (red · resistance) · put_wall (green · support) · max_pain (yellow · magnet) · gamma_flip (purple) · gex_flip (violet · total-GEX zero) · oi_volume (blue · today)');
  lines.push('What to expect: Reject (turns away) · Break (goes through) · Magnet (drifts to)'
           + ' · Pin (sticks here) · Edge (changes here) · far = beyond ~2.5x expected move');
  lines.push('  Reject vs Break is decided by the zone: calm = hedging fights the move so levels'
           + ' hold; jumpy = hedging feeds the move so the same level gives way.');
  lines.push('');

  const entries = Object.entries(store || {});
  let emitted = 0;
  for (const [pair, inst] of entries) {
    if (!inst || typeof inst !== 'object') continue;
    const levels = oiStoreToLevels(inst, { topWalls, minTier, maxWalls }).filter(l => WANT.has(l.type));
    if (!levels.length) continue;

    // Self-heal a gexProfile the localStorage quota-trim shed (rebuildable from the
    // stored raw paste) so heat + P(touch) survive; returns inst.gexProfile untouched
    // when present. Everything below reads THIS, not inst.gexProfile directly.
    const gexProfile = rebuildGexProfile(inst);
    const canon = canonName(pair);
    const dp = priceDp(pair, canon);
    // Order by type group, then by price descending (top of the book first).
    levels.sort((a, b) => (TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)) || (b.price - a.price));

    lines.push(canon);
    const ctx = fmtSaved(inst);
    if (ctx) lines.push(ctx);
    const cotLine = fmtCot(cot?.[canon]);
    if (cotLine) lines.push(cotLine);
    // Gamma-flow context (human-only — the indicator ignores non-"OI " lines):
    // distance-to-flip vol read + a per-expiry roll-off block. No new data.
    const flip = Number.isFinite(inst.gammaFlip) ? inst.gammaFlip : gammaFlip(gexProfile);
    const dist = distanceToFlip(inst.spot, flip);          // no ATR here → % based
    if (dist) lines.push(`· flip ${flip.toFixed(dp)} · spot ${dist.pct >= 0 ? '+' : ''}${dist.pct}% → ${dist.side === 'positive' ? '+gamma (pin/dampen)' : dist.side === 'negative' ? '−gamma (breakout)' : 'at flip'}${dist.near ? ' · NEAR flip (unstable)' : ''}`);
    const roll = rolloffSummary(inst.termStructure);
    if (roll && roll.nExpiries > 1) {
      const ts = (inst.termStructure || []).slice().sort((a, b) => a.dte - b.dte).slice(0, 4);
      lines.push(`· term: ${ts.map(e => `${e.dte}DTE mp${Number(e.maxPain).toFixed(dp)}`).join('  ')}${roll.rollingSoon ? ' · near rolls off soon' : ''}`);
    }
    const gk = inst.greeksFlow;
    if (gk) {
      lines.push(`· charm/vanna (IV ${gk.dteDays}DTE): CEX ${gk.cex >= 0 ? '+' : ''}${gk.cex} · VEX ${gk.vex >= 0 ? '+' : ''}${gk.vex}${gk.vanna ? ` · vanna ${gk.vanna.state}${gk.vanna.firing ? ' firing' : ''}` : ''}`);
      // charm/vanna flip levels as drawable OI lines (the regime boundaries for each).
      if (gk.charmFlip != null) lines.push(`OI ${Number(gk.charmFlip).toFixed(dp)} : charm_flip`);
      if (gk.vannaFlip != null) lines.push(`OI ${Number(gk.vannaFlip).toFixed(dp)} : vanna_flip`);
    }
    // Expected-move band as two OI-parseable levels so the indicator can draw the
    // option-implied range live; plus the directional risk-reversal tilt (EOD data).
    const em = inst.expectedMove;
    if (em && em.upper != null) {
      lines.push(`OI ${em.upper.toFixed(dp)} : exp_move_hi`);
      lines.push(`OI ${em.lower.toFixed(dp)} : exp_move_lo`);
      lines.push(`· exp move ±${em.move} (${em.pct}%)${em.dte != null ? ` to ${em.dte}DTE` : ''} — EOD`);
    }
    const rr = inst.riskReversal;
    if (rr) lines.push(`· risk reversal ${rr.rr >= 0 ? '+' : ''}${rr.rr} (${rr.tilt} tilt)`);
    // Gamma HEAT per level (hot/warm/cold) from the gamma-weighted exposure at that
    // price — how hard the level is defended right now, the price-proximity + DTE
    // weighting the raw wall list lacks. Read off the stored gexProfile; null when
    // absent (older entries) → no heat segment, so the line is unchanged.
    // Heat each level off ITS OWN expiry's gamma profile: the near-dated "day" levels
    // (l.dte === dayExpiry.dte) off the near-dated book, everything else off the primary
    // — a near-dated wall's gamma defense is far stronger (γ ∝ 1/√T), so it deserves its
    // own profile, not the far book's. Keyed by level object so display order is untouched.
    const dayEx = inst.dayExpiry && typeof inst.dayExpiry === 'object' ? inst.dayExpiry : null;
    const dayDte = dayEx && Number.isFinite(dayEx.dte) ? dayEx.dte : null;
    const dayGP = dayEx && Array.isArray(dayEx.gexProfile) ? dayEx.gexProfile : [];
    const isDay = (l) => dayDte != null && l.dte === dayDte;
    const farLevels = levels.filter(l => !isDay(l));
    const dayLevels = dayDte != null ? levels.filter(isDay) : [];
    const heatOf = new Map();
    levelHeat(gexProfile, farLevels).forEach((x, i) => heatOf.set(farLevels[i], x.heatBucket || ''));
    if (dayLevels.length && dayGP.length) levelHeat(dayGP, dayLevels).forEach((x, i) => heatOf.set(dayLevels[i], x.heatBucket || ''));
    // P(touch) per level ("82%~2h"), keyed by exact price — computed live at the export
    // endpoint (needs current bars); absent here in the pure/offline path.
    const rp = (reachByPair && reachByPair[pair]) ? reachByPair[pair] : null;
    for (const l of levels) {
      const tier = Number.isFinite(l.tier) && l.tier > 0 ? ` t${l.tier}` : '';
      // DTE tag ("14dte") after the tier when a level carries one — present only in
      // dual-expiry mode, so single-expiry pastes are byte-identical. Pine reads it as its
      // own token (it doesn't start with 't', so it never confuses the tier scan).
      const dteTag = Number.isFinite(l.dte) ? ` ${l.dte}dte` : '';
      // The RHS carries ordered ' . ' segments the Pine parser reads by index — token 0
      // is the type, a 't'-prefixed token the tier, and everything after is invisible to
      // an un-updated indicator. Order: (1) expectation, (2) heat, (3) P(touch).
      const ex = levelExpectation(l, isDay(l)
        ? { spot: inst.spot, gammaFlip: dayEx.gammaFlip, refMove: inst.refMove?.move }
        : { spot: inst.spot, gexFlips: inst.gexFlips, gammaFlip: inst.gammaFlip, refMove: inst.refMove?.move });
      const note  = ex ? ex.mid : '';
      const heat  = heatOf.get(l) || '';
      const touch = rp ? (rp[l.price.toFixed(6)] || '') : '';
      // Touch (index 3) needs a heat placeholder ('-') so its position is stable when
      // heat is absent; trailing-absent segments are dropped, so a line with no heat and
      // no touch is byte-identical to before.
      let suffix = '';
      if (note) {
        if (touch)     suffix = ` . ${note} . ${heat || '-'} . ${touch}`;
        else if (heat) suffix = ` . ${note} . ${heat}`;
        else           suffix = ` . ${note}`;
      }
      lines.push(`OI ${l.price.toFixed(dp)} : ${l.type}${tier}${dteTag}${suffix}`);
    }
    lines.push('');
    emitted++;
  }

  if (!emitted) lines.push('(no OI data — paste an option chain on the dashboard OI analyser first)', '');
  return lines.join('\n');
}
