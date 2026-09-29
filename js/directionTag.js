// js/directionTag.js — "is price aiming up or down?" as ONE scannable mark.
//
// The per-pair cards already carried three separate directional hints (the ⚖
// composite chip, the ✓aligned/⚠mixed chip, and the prose bias line). None of
// them answered the plain question at a glance. This brick collapses them into
// a single tag — and, more importantly, is explicit about what may drive it.
//
// ── The rule this file exists to enforce ────────────────────────────────────
//
//   A non-validated input can SUBTRACT confidence. It can never ADD it.
//
// The inputs available per card do not carry equal evidential weight:
//
//   HTF trend (HMM daily) ....... descriptive — but see below, it measures VARIANCE
//   Structural travel ........... descriptive — where price sits in its own 3-month
//                                 range, and how directly it got there
//   Today's tape (session bias) . descriptive — what price IS doing
//   Range position .............. descriptive — how much room is left
//   COT positioning ............. real data; directional factor test NEVER RUN
//   Macro scorecard ............. macro-as-signal is a banked NULL ×5
//   Carry (10Y differential) .... the validated result is yield-spread MEAN
//                                 REVERSION at |z|≥2, not a directional tilt
//   OI gamma regime ............. forward test still COLLECTING, no verdict
//   Forecast cone direction ..... graded a COIN FLIP by its own calibration
//
// So DRIVERS (may set the arrow) = the three descriptive reads only.
// MODIFIERS (may only downgrade)  = COT, macro, carry, OI.
// The cone is deliberately absent: it forecasts RANGE honestly and direction
// not at all, so it has no business in a direction tag.
//
// ── WHY "HMM daily says RANGE" IS NOT "no direction" ────────────────────────
//
// The daily HMM separates its two states by RETURN VARIANCE — hmm.js labels them with
// `rangeState = B[0].sigma <= B[1].sigma`. So RANGE means QUIET, and it never meant
// directionless. This file used to render "HMM daily says RANGE — no structural
// direction", which is a claim the model does not make.
//
// The cost was not that it cancelled the tape (a 'flat' driver is excluded from the
// directional set, so it never did). It was subtler and worse:
//
//   * `strong` became unreachable, because that needs two directional drivers and only
//     the tape could ever be one;
//   * whenever the tape had no read — "session developing", "both sides active" — the
//     whole tag collapsed to flat and the chip rendered NOTHING.
//
// On 2026-09-29 USDCHF was +8.45% since March at 99% of its seven-month range, in the
// 7th vol percentile, and showed no direction at all for most of the session. Eight of
// the fourteen RANGE-labelled instruments were pinned at an extreme of their own range
// that day — one coherent dollar move, all of it invisible here.
//
// Fixed by splitting the question: the HMM keeps answering "how violent is this tape"
// and abstains on direction, and js/travelRead.js answers "has price been travelling",
// from price alone. Both are descriptive, so the rule above is untouched.
//
// This is a DESCRIPTION of the current lean, not a prediction, and nothing here
// is backtested. Pure: plain values in, plain object out — no DOM, no globals.

/** Direction of a signed score, with a dead-band so noise reads as flat. */
const sign = (v, dead = 0.08) => (v == null ? null : v > dead ? 'up' : v < -dead ? 'down' : 'flat');

/**
 * Normalise the HMM regime's trend direction to 'up' | 'down' | null.
 *
 * The daily-brief feed emits "BULL" / "BEAR" — NOT "up" / "down". Every caller
 * that tested `trend_dir === 'up'` therefore matched 0 of 30 live instruments,
 * and because those tests were written as `=== 'up' ? A : B`, a BULLISH trend
 * silently took the bearish branch. Two consequences were visible on the page:
 * every trending pair rendered "▼ TREND DOWN", and pairSignal() scored a bull
 * trend as -1. Accepts both vocabularies so either shape resolves.
 */
export function normTrendDir(v) {
  const t = (v ?? '').toString().toLowerCase();
  if (t === 'up' || t === 'bull' || t === 'bullish') return 'up';
  if (t === 'down' || t === 'bear' || t === 'bearish') return 'down';
  return null;
}

const asDir = normTrendDir;

/**
 * Read a direction out of the session engine's bias_detail prose.
 *
 * The vocabulary is NOT "bullish"/"bearish" — callers that tested /bull|bear/i
 * matched 0 of 30 live instruments and silently returned "no direction" for
 * every pair. The strings the engine actually emits are:
 *
 *   "upside leg dominating, downside contained"    -> up
 *   "downside leg dominating, upside contained"    -> down
 *   "downside extended"                            -> down
 *   "session developing"                           -> no read yet
 *   "both sides active"                            -> genuinely two-sided
 *
 * Note both directional strings mention BOTH sides ("upside … dominating,
 * downside contained"), so a bare /downside/ test flips the answer. Match the
 * qualified clause, never the bare word.
 *
 * @returns {'up'|'down'|null} null = no directional read available.
 */
export function sessionBiasDir(text) {
  const t = (text ?? '').toLowerCase();
  if (!t || /session developing|both sides active/.test(t)) return null;
  const dominating = t.match(/(upside|downside)\s+(?:leg\s+)?dominating/);
  if (dominating) return dominating[1] === 'upside' ? 'up' : 'down';
  const extended = t.match(/(upside|downside)\s+extended/);
  if (extended) return extended[1] === 'upside' ? 'up' : 'down';
  // Kept last so any legacy//alternate phrasing still resolves.
  if (/bull/.test(t)) return 'up';
  if (/bear/.test(t)) return 'down';
  return null;
}

/**
 * @param {object} i
 * @param {{label?:string, trendDir?:string, trendProb?:number, reliable?:boolean}} [i.regime]
 *        HMM daily regime — the higher-timeframe structural read.
 * @param {{bias?:string, dir?:number}} [i.session]  today's tape: bias text + directionality %.
 * @param {number} [i.rangeUsed]   fraction of the expected day range consumed (1.0 = all of it).
 * @param {number} [i.cot]         [-1,+1] positioning bias for the pair, or null.
 * @param {number} [i.macro]       [-1,+1] fundamentals differential, or null.
 * @param {number} [i.carry]       [-1,+1] 10Y yield differential, or null.
 * @param {object} [i.travel]      js/travelRead.js output: { dir, pos, mult, weight, detail }.
 * @param {string} [i.oiRegime]    'PIN' | 'BREAKOUT' | null.
 * @returns {{direction:'up'|'down'|'mixed'|'flat', strength:'strong'|'lean'|'mixed'|'flat',
 *            agree:number, total:number, drivers:Array, modifiers:Array, why:string}}
 */
export function directionTag(i = {}) {
  const drivers = [];

  // ── Driver 1: how violent the tape is (NOT which way it points) ──────────
  // `trendConfident === false` means the HMM's own 10-day drift is inside one standard
  // error of zero, i.e. a flat fortnight wearing a direction's name (AUDJPY was labelled
  // BULL on a mean of -2.5e-4). Only an explicit false downgrades — undefined means an
  // older caller that cannot tell us, and those keep the previous behaviour.
  const g = i.regime;
  const htfDir = asDir(g?.trendDir);
  const htfNoise = g?.trendConfident === false;
  if (g?.label === 'TREND' && htfDir && !htfNoise) {
    drivers.push({
      key: 'htf', label: 'Higher-timeframe trend', dir: htfDir,
      detail: `HMM daily ${htfDir} ${Math.round(g.trendProb ?? 0)}%${g.reliable === false ? ' (low confidence)' : ''}`,
      weight: g.reliable === false ? 0.6 : 1,
    });
  } else if (g?.label === 'TREND' && htfDir && htfNoise) {
    drivers.push({ key: 'htf', label: 'Volatility regime', dir: 'flat', weight: 0,
      detail: `HMM daily TREND (high-volatility), but its 10-day drift is inside its own noise — no direction claimed` });
  } else if (g?.label === 'RANGE') {
    // rangeProb is not always passed; the brief only carries trend_prob, and they are
    // complements, so derive it rather than print a confident 0%.
    const rp = g.rangeProb ?? (g.trendProb != null ? 100 - g.trendProb : null);
    drivers.push({ key: 'htf', label: 'Volatility regime', dir: 'flat', weight: 0,
      detail: `HMM daily RANGE${rp != null ? ` ${Math.round(rp)}%` : ''} — a LOW-VOLATILITY state, which says nothing about direction` });
  }

  // ── Driver 2: structural travel ──────────────────────────────────────────
  // Where price sits in its own ~3-month range, weighted by how directly it got there
  // (measured against a random walk over the same window). This is the structural read
  // the variance HMM cannot give: it is what finds a quiet one-way grind.
  const tv = i.travel;
  if (tv && (tv.dir === 'up' || tv.dir === 'down') && (tv.weight ?? 0) > 0) {
    drivers.push({ key: 'travel', label: 'Structural travel', dir: tv.dir,
      detail: tv.detail ?? `${Math.round((tv.pos ?? 0) * 100)}% of its recent range`,
      weight: Math.max(0.15, Math.min(1, tv.weight)) });
  } else if (tv) {
    drivers.push({ key: 'travel', label: 'Structural travel', dir: 'flat', weight: 0,
      detail: tv.detail ?? 'no structural travel either way' });
  }

  // ── Driver 3: today's tape ───────────────────────────────────────────────
  const bd = i.session?.bias ?? '';
  const tape = sessionBiasDir(bd);
  if (tape) {
    const clean = i.session?.dir;
    drivers.push({
      key: 'tape', label: "Today's tape", dir: tape,
      detail: `${bd}${clean != null ? ` · ${Math.round(clean)}% directional` : ''}`,
      // A choppy day is weak evidence of a lean even when it closes up.
      weight: clean != null ? Math.min(1, Math.max(0.4, clean / 70)) : 0.7,
    });
  }

  // ── Driver 4: room left in the range ─────────────────────────────────────
  // Not a direction of its own — it says whether the lean can still travel.
  // Past ~85% of the expected day range, continuation is the low-probability
  // side, so this caps strength rather than pointing anywhere.
  const used = i.rangeUsed;
  const exhausted = used != null && used >= 0.85;
  if (used != null) {
    drivers.push({ key: 'room', label: 'Room left in range', dir: 'flat',
      detail: exhausted
        ? `${Math.round(used * 100)}% of the expected range already used — little room to extend`
        : `${Math.round(used * 100)}% of the expected range used`,
      weight: 0 });
  }

  // ── Score the drivers ────────────────────────────────────────────────────
  const directional = drivers.filter(d => d.dir === 'up' || d.dir === 'down');
  let score = 0, wsum = 0;
  for (const d of directional) { score += (d.dir === 'up' ? 1 : -1) * d.weight; wsum += d.weight; }
  const norm = wsum ? score / wsum : null;
  let direction = norm == null ? 'flat' : sign(norm);
  const driversDisagree = directional.length >= 2 &&
    new Set(directional.map(d => d.dir)).size > 1;

  // ── Modifiers: may only ever downgrade ───────────────────────────────────
  const modifiers = [];
  const addMod = (key, label, val, status, fmt) => {
    const d = sign(val, 0.12);
    if (d == null) return;
    modifiers.push({ key, label, dir: d, status, detail: fmt(val) });
  };
  addMod('cot', 'Positioning (COT)', i.cot, 'factor test never run',
    v => `specs lean ${v > 0 ? 'long' : 'short'} (${v.toFixed(2)})`);
  addMod('macro', 'Fundamentals', i.macro, 'macro-as-signal is a banked null',
    v => `${v > 0 ? 'base' : 'quote'} stronger (${v.toFixed(2)})`);
  addMod('carry', 'Carry (10Y)', i.carry, 'validated as mean-reversion, not tilt',
    v => `${v > 0 ? 'base' : 'quote'} yields higher (${v.toFixed(2)})`);
  if (i.oiRegime === 'PIN' || i.oiRegime === 'BREAKOUT') {
    modifiers.push({ key: 'oi', label: 'Options positioning', dir: 'flat',
      status: 'forward test collecting',
      detail: i.oiRegime === 'PIN'
        ? 'PIN — dealers dampen moves; favours fading the edges, not extending'
        : 'BREAKOUT — dealers amplify; a break is likelier to run' });
  }

  // Count agreement across everything that expressed a direction, so the
  // number on the card reflects the whole board — even though only the
  // drivers were allowed to point it.
  const voters = [...directional, ...modifiers.filter(m => m.dir !== 'flat')];
  const agree = direction === 'flat' || direction === 'mixed'
    ? voters.filter(v => v.dir === direction).length
    : voters.filter(v => v.dir === direction).length;
  const total = voters.length;

  // ── Strength, and the downgrade rules ────────────────────────────────────
  // Order matters: two drivers pointing opposite ways cancel to a score of ~0,
  // which would otherwise read as 'flat'. Actively disagreeing is NOT the same
  // as having no direction, and conflating them would hide the most useful
  // thing the tag can say — so the disagreement test comes first.
  let strength;
  if (driversDisagree) {
    direction = 'mixed'; strength = 'mixed';
  } else if (direction === 'flat' || !directional.length) {
    direction = 'flat'; strength = 'flat';
  } else {
    const dissent = voters.filter(v => v.dir && v.dir !== direction).length;
    const allDriversAgree = directional.length >= 2;
    strength = (allDriversAgree && !dissent && !exhausted) ? 'strong' : 'lean';
    // A modifier majority against the lean drags it to mixed. It cannot create
    // a direction, but it is allowed to say "this is not clean".
    if (dissent && dissent >= Math.ceil(voters.length / 2)) { direction = 'mixed'; strength = 'mixed'; }
    else if (dissent || exhausted) strength = 'lean';
  }

  const why = strength === 'mixed'
    ? 'Reads disagree — no clean directional lean'
    : direction === 'flat'
      ? 'No structural direction and no clear tape'
      : `${directional.map(d => d.label.toLowerCase()).join(' + ')} point ${direction}` +
        (exhausted ? ', but the range is nearly spent' : '');

  return { direction, strength, agree, total, drivers, modifiers, why };
}
