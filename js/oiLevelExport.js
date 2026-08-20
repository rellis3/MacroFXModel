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
import { wallHoldScore } from './oiZones.js';
import { gammaFlip, distanceToFlip, rolloffSummary } from './gammaFlow.js';
import { rebuildGexProfile, oiFuturesTermsPrice, oiBandSelect, oiRegimeBands } from './oi.js';

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
  // THE BASIS, AND HOW OLD IT IS. Every level here is `strike - basis`, so the whole
  // ladder shifts one-for-one with this number — and it moves intraday. Measured
  // 2026-08-20 on EUR/USD: +0.00021 at 08:39, +0.00066 by mid-afternoon. Four and a
  // half pips of silent drift on every line, from a figure nothing on the page showed.
  // The course notes are blunt about it ("a stale basis puts levels 10-20 pips off"),
  // so the export now states the basis it used and how old that reading is. Refresh
  // with POST /api/oi/reanalyse?live=1.
  if (Number.isFinite(inst?.basis)) {
    // basisAtMs, not savedAtMs — the basis and the chain age independently.
    const _bAt = Number.isFinite(inst?.basisAtMs) ? inst.basisAtMs : inst?.savedAtMs;
    const ageH = Number.isFinite(_bAt) ? (Date.now() - _bAt) / 3.6e6 : null;
    const age = ageH == null ? '' : ageH < 1 ? ` ${Math.round(ageH * 60)}m old`
      : ageH < 24 ? ` ${ageH.toFixed(1)}h old` : ` ${Math.round(ageH / 24)}d old`;
    const stale = ageH != null && ageH >= 4 ? ' STALE — re-basis before trading these' : '';
    bits.push(`basis ${inst.basis >= 0 ? '+' : ''}${(+inst.basis).toFixed(5)}${age}${stale}`);
  }
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
  } else {
    if (rgFar) bits.push(`regime ${rgFar}`);            // single-expiry: the indicator parses THIS for its tint
    // No day set — say WHY, so a missing near-dated block isn't a silent mystery.
    if (inst?.dayExpiryReason && inst.dayExpiryReason !== 'ok') bits.push(`no day levels: ${inst.dayExpiryReason}`);
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
export function buildOILevelText(store, { topWalls = null, minTier = "moderate", maxWalls = 3, generated = null, cot = null, reachByPair = null, terms = 'spot', allExpiry = false, bandByPair = null } = {}) {
  // bandByPair: { pair: bandFrac } — the day's trading band (from the vol forecast). When
  // present, the DEFAULT export shows every expiry's walls WITHIN the band + a catch level
  // beyond it (so a blowout always has a level ahead), instead of only primary+day. The
  // explicit `allExpiry` toggle still shows the full unbounded term structure.
  // terms: 'spot' (default — XAU/USD / OANDA spot, what the platform trades) or 'futures'
  // (raw CME/COMEX price terms, for overlaying on a futures chart). Only the DISPLAYED price
  // changes; P(touch) is still keyed off the spot price it was computed at.
  const futuresTerms = terms === 'futures';
  const LW = 44;
  const hdr = '──── OI WALLS & MAX PAIN ' + '─'.repeat(Math.max(0, LW - 25));
  const lines = [hdr];
  lines.push(`Generated: ${generated ?? 'latest'}`);
  lines.push('Types: call_wall (red · resistance) · put_wall (green · support) · max_pain (yellow · magnet) · gamma_flip (purple) · gex_flip (violet · total-GEX zero) · oi_volume (blue · today)');
  lines.push('What to expect: Reject (turns away) · Break (goes through) · Magnet (drifts to)'
           + ' · Pin (sticks here) · Edge (changes here) · far = beyond ~2.5x expected move');
  lines.push('  Reject vs Break is decided by the zone: calm = hedging fights the move so levels'
           + ' hold; jumpy = hedging feeds the move so the same level gives way.');
  lines.push('  hNN on a wall = HOLD score 0-100 (react-vs-blow-through: per-strike dealer GEX'
           + ' · persistence · wall multiple) — high tends to hold, low tends to give way.');
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
    // Futures-terms display converter (identity in spot mode). Only the printed number
    // changes — sorting, dedup and the P(touch) key all still use the spot price.
    const px = (p) => futuresTerms ? oiFuturesTermsPrice(p, inst) : p;
    // Order by type group, then by price descending (top of the book first).
    levels.sort((a, b) => (TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)) || (b.price - a.price));

    lines.push(canon);
    if (futuresTerms) lines.push('· prices in FUTURES/CME terms (basis added back — for a futures chart)');
    const ctx = fmtSaved(inst);
    if (ctx) lines.push(ctx);
    const cotLine = fmtCot(cot?.[canon]);
    if (cotLine) lines.push(cotLine);
    // Gamma-flow context (human-only — the indicator ignores non-"OI " lines):
    // distance-to-flip vol read + a per-expiry roll-off block. No new data.
    const flip = Number.isFinite(inst.gammaFlip) ? inst.gammaFlip : gammaFlip(gexProfile);
    const dist = distanceToFlip(inst.spot, flip);          // no ATR here → % based
    if (dist) lines.push(`· flip ${px(flip).toFixed(dp)} · spot ${dist.pct >= 0 ? '+' : ''}${dist.pct}% → ${dist.side === 'positive' ? '+gamma (pin/dampen)' : dist.side === 'negative' ? '−gamma (breakout)' : 'at flip'}${dist.near ? ' · NEAR flip (unstable)' : ''}`);
    // GEX regime BANDS (spot terms unless futures): the LOCAL PIN/BREAKOUT map so the indicator
    // can shade WHERE the book pins vs breaks — the net-GEX sign the regime word uses is a
    // whole-book average that hides short-gamma pockets. Emits the base regime (below the lowest
    // zero-gamma crossing) then each crossing price with the regime ABOVE it; the indicator
    // extends the outer bands to the chart edges. Machine-parsed by the Pine indicator.
    const bands = oiRegimeBands(inst);
    if (bands.length && bands[0].regime !== 'neutral') {
      const toks = [`base=${bands[0].regime}`];
      for (let i = 0; i < bands.length - 1; i++) toks.push(`${px(bands[i].hi).toFixed(dp)}=${bands[i + 1].regime}`);
      lines.push(`· gex-bands ${toks.join(' ')}`);
    }
    // Per-expiry breakdown (spot terms) — the same raw-OI max pain / call & put wall for
    // EVERY expiry, so you can line ANY single expiry up against another desk's OI panel and
    // confirm the calc (max pain is deterministic: same expiry + same chain ⇒ same number).
    const roll = rolloffSummary(inst.termStructure);
    const pe = (inst.perExpiry || []).slice().sort((a, b) => a.dte - b.dte).slice(0, 8);
    if (pe.length) {
      lines.push('· per-expiry (mp = max pain · cw/pw = call/put wall):');
      for (const e of pe) {
        const f = (v, lbl) => Number.isFinite(v) ? `${lbl} ${px(v).toFixed(dp)}` : `${lbl} —`;
        lines.push(`·   ${String(e.dte).padStart(3)}DTE  ${f(e.maxPain, 'mp')}  ${f(e.callWall, 'cw')}  ${f(e.putWall, 'pw')}`);
      }
      if (roll?.rollingSoon) lines.push('·   (near expiry rolls off soon)');
    } else if (roll && roll.nExpiries > 1) {
      const ts = (inst.termStructure || []).slice().sort((a, b) => a.dte - b.dte).slice(0, 4);
      lines.push(`· term: ${ts.map(e => `${e.dte}DTE mp${px(Number(e.maxPain)).toFixed(dp)}`).join('  ')}${roll.rollingSoon ? ' · near rolls off soon' : ''}`);
    }
    const gk = inst.greeksFlow;
    if (gk) {
      lines.push(`· charm/vanna (IV ${gk.dteDays}DTE): CEX ${gk.cex >= 0 ? '+' : ''}${gk.cex} · VEX ${gk.vex >= 0 ? '+' : ''}${gk.vex}${gk.vanna ? ` · vanna ${gk.vanna.state}${gk.vanna.firing ? ' firing' : ''}` : ''}`);
      // charm/vanna flip levels as drawable OI lines (the regime boundaries for each).
      if (gk.charmFlip != null) lines.push(`OI ${px(Number(gk.charmFlip)).toFixed(dp)} : charm_flip`);
      if (gk.vannaFlip != null) lines.push(`OI ${px(Number(gk.vannaFlip)).toFixed(dp)} : vanna_flip`);
    }
    // Expected-move band as two OI-parseable levels so the indicator can draw the
    // option-implied range live; plus the directional risk-reversal tilt (EOD data).
    const em = inst.expectedMove;
    if (em && em.upper != null) {
      lines.push(`OI ${px(em.upper).toFixed(dp)} : exp_move_hi`);
      lines.push(`OI ${px(em.lower).toFixed(dp)} : exp_move_lo`);
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
    const drawn = new Set();   // type@price of every detailed line drawn, so the per-expiry pass doesn't duplicate
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
      // HOLD score (walls only): the react-vs-blow-through read the bot sizes fades
      // by, exported as a compact `hNN` token so the chart shows the SAME strength
      // read the bot trades. Computed off the level's own expiry book (day levels →
      // day gexProfile), from per-strike GEX + persistence + multiple (the OI-flow
      // component needs day-over-day history the paste doesn't carry → renormalised
      // out). Blank for non-walls and when no component has data.
      let hold = '';
      if (l.type === 'call_wall' || l.type === 'put_wall') {
        const src = isDay(l) ? dayEx : inst;
        const walls = l.type === 'call_wall' ? (src?.callWalls || []) : (src?.putWalls || []);
        const w = walls.find(w => Number.isFinite(w?.strike) && Math.abs(w.strike - l.price) <= Math.max(1e-6, Math.abs(l.price) * 1e-7));
        const hs = w ? wallHoldScore(w, l.type === 'call_wall' ? 'call' : 'put',
          { gexProfile: isDay(l) ? dayGP : gexProfile }) : null;
        if (hs) hold = `h${Math.round(hs.score * 100)}`;
      }
      // Ordered ' . ' segments the Pine parser reads by index — (1) expectation,
      // (2) heat, (3) P(touch), (4) hold. '-' holds an absent slot so later indexes
      // stay stable; trailing-absent segments are dropped, so a line with none of
      // them is byte-identical to before.
      const segs = [note || '-', heat || '-', touch || '-', hold || '-'];
      while (segs.length && segs[segs.length - 1] === '-') segs.pop();
      const suffix = segs.length ? ` . ${segs.join(' . ')}` : '';
      lines.push(`OI ${px(l.price).toFixed(dp)} : ${l.type}${tier}${dteTag}${suffix}`);
      drawn.add(`${l.type}@${l.price.toFixed(dp)}`);
    }
    // Other-expiry lines: draw each OTHER expiry's max-pain + raw call/put wall as DTE-tagged
    // OI lines so the whole term structure is on the CHART, not just the text table. The
    // expiries already drawn in detail (primary + day) are skipped to avoid dupes.
    //   • DEFAULT (a band is known): only the walls WITHIN the day's trading band + a CATCH
    //     level just beyond it each side — so you never miss a level price can reach today,
    //     and a blowout always has the next level ahead, without drawing the far tail.
    //   • allExpiry toggle: the FULL unbounded term structure (cross-desk compare).
    // Either way the indicator's DTE styling fades the further-dated ones.
    const bandFrac = bandByPair && Number.isFinite(bandByPair[pair]) ? bandByPair[pair] : null;
    if ((allExpiry || bandFrac) && Array.isArray(inst.perExpiry)) {
      // Candidate pool = EVERY expiry's max-pain + biggest call/put wall (perExpiry), deduped
      // against the detailed primary/day lines already drawn (so the catch can be a far
      // primary wall the near-money selector dropped, and we never double-draw).
      const cands = [];
      for (const e of inst.perExpiry) {
        if (!Number.isFinite(e.dte)) continue;
      // MAX PAIN IS TIME-BOUND, WALLS ARE PRICE-BOUND. The band filter below asks "can
      // price reach this level today", which is the right question for a wall: a wall
      // matters because price arrives at it. It is the WRONG question for max pain,
      // whose pull comes from time to expiry, not distance — a 20DTE max pain sitting
      // inside today's range exerts no pin today, and gold was exporting a dozen of
      // them. So max pain from OTHER expiries is capped by DTE before the band filter
      // ever sees it. The primary and day expiries are drawn in full above regardless,
      // so the near-dated max pain that actually pins is never dropped.
      const MAXPAIN_MAX_DTE = 7;
      for (const [v, t] of [[e.maxPain, 'max_pain'], [e.callWall, 'call_wall'], [e.putWall, 'put_wall']]) {
        if (t === 'max_pain' && !allExpiry && e.dte > MAXPAIN_MAX_DTE) continue;
        if (Number.isFinite(v) && !drawn.has(`${t}@${v.toFixed(dp)}`)) cands.push({ price: v, type: t, dte: e.dte });
      }
      }
      let emit = cands;
      if (!allExpiry && bandFrac) {
        const sel = oiBandSelect(cands, inst.spot, bandFrac);   // in-band + a catch level beyond each side
        emit = [...sel.inBand, ...sel.catch];
      }
      const seen = new Set();
      for (const c of emit) {
        const k = `${c.type}@${c.price.toFixed(dp)}`;
        if (seen.has(k)) continue; seen.add(k);
        // P(touch) ON THESE LINES TOO. They used to be emitted bare — type + DTE and
        // nothing else — while the primary/day levels carried the full token set. Since
        // both passes can produce a line at the SAME price, the chart showed one
        // annotated and one blank a few pixels apart, and ~2/3 of all exported lines had
        // no P(touch) at all. It reads as "this level has no reading" when the truth is
        // "this line was drawn by the other code path".
        //
        // Expectation and heat stay '-': both need that expiry's own gamma profile, and
        // perExpiry carries only the headline strikes. P(touch) needs neither — it is a
        // property of the PRICE and today's volatility, so it is as valid here as
        // anywhere. Placeholders keep the segment indexes stable for the Pine parser.
        const t2 = rp ? (rp[c.price.toFixed(6)] || '') : '';
        const tail = t2 ? ` . - . - . ${t2}` : '';
        lines.push(`OI ${px(c.price).toFixed(dp)} : ${c.type} ${c.dte}dte${c.catch ? ' catch' : ''}${tail}`);
      }
    }
    lines.push('');
    emitted++;
  }

  if (!emitted) lines.push('(no OI data — paste an option chain on the dashboard OI analyser first)', '');
  return lines.join('\n');
}
