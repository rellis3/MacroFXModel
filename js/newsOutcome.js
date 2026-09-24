/**
 * What the news actually did — the second half of the playbook.
 *
 * The playbook publishes three boxes before a release: stronger, in line, weaker, each
 * with a claim about what the market does. Until now only the FIRST half was ever
 * marked — which box the NUMBER landed in. The claim inside the box, "the Aussie dollar
 * usually strengthens", was never checked against what the Aussie dollar did.
 *
 * That is the half worth having, and not because it will vindicate the playbook. This
 * desk's own morning brief already says it: "size only, direction after news is a coin
 * flip". The surprise-size result validated for RANGE and the priced-in claim came back
 * null. So the honest expectation is that the direction claim lands near 50%, and the
 * running tally is here to SHOW that, repeatedly, rather than to hide it.
 *
 * Two outcomes are therefore kept apart and never blended:
 *
 *   numberSide   which box the print landed in. Arithmetic, always knowable.
 *   claimHeld    whether the named market then moved the way that box said. A coin
 *                flip on this desk's evidence, and reported with its own running tally
 *                so one good week cannot read as a skill.
 *
 * `moved` carries the measured size against an ordinary half-hour, because THAT is the
 * part this desk has validated: a release widens the range whichever way it goes.
 *
 * Pure: no fetch, no DOM. Tested in js/newsOutcome.test.mjs.
 */

/** The instrument a country's release is judged on — the first of its book list. */
export const HEADLINE_INSTRUMENT = {
  US: 'EURUSD', EU: 'EURUSD', DE: 'EURUSD', FR: 'EURUSD', IT: 'EURUSD', ES: 'EURUSD',
  GB: 'GBPUSD', UK: 'GBPUSD', JP: 'USDJPY', CH: 'USDCHF', AU: 'AUDUSD', NZ: 'NZDUSD', CA: 'USDCAD',
};

/**
 * Does the currency STRENGTHEN when the instrument goes up?
 *
 * USD/JPY up is a weaker yen, and USD/CHF up is a weaker franc — so a Swiss release
 * that strengthens the franc shows as the instrument going DOWN. Getting this backwards
 * would score every JPY, CHF and CAD release exactly wrong, which is worse than not
 * scoring them, so it is a table rather than a rule.
 */
const CCY_UP_IS_INSTRUMENT_UP = {
  EURUSD: true, GBPUSD: true, AUDUSD: true, NZDUSD: true,   // the currency is the base
  USDJPY: false, USDCHF: false, USDCAD: false,              // the currency is the quote
};

const numOf = v => {
  if (v == null) return null;
  const m = String(v).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};

/**
 * Which box the print landed in.
 *
 * `tol` is a fraction of the consensus, so "in line" scales with the number: 0.1 on a
 * 4.5% unemployment rate is a real miss, 0.1 on a 21,500 payroll is noise. A release
 * with no consensus returns null rather than being forced into a box — nobody had a
 * number to be surprised against.
 */
export function numberSide(actual, consensus, { tol = 0.02 } = {}) {
  const a = numOf(actual), c = numOf(consensus);
  if (a == null || c == null) return null;
  const band = Math.max(Math.abs(c) * tol, 1e-9);
  return Math.abs(a - c) <= band ? 'mid' : a > c ? 'up' : 'dn';
}

/**
 * Did the box's claim hold?
 *
 * Only scored where the box made a directional claim — the "in line" box says markets
 * drift, which is not falsifiable in thirty minutes and is reported as untestable
 * rather than counted as a win. `unemp` is inverted at the caller: a HIGHER
 * unemployment rate is a weaker economy, and the playbook already words its boxes that
 * way ("Stronger (fewer out of work)").
 */
export function scoreClaim({ side = null, instrument = null, dir = null, invert = false } = {}) {
  // A MISSING consensus and an IN-LINE print are both unscorable and are not the same
  // thing. Seen live: the SNB rows carry no consensus at all and were being told they
  // had landed in the in-line box, which is a different and wrong explanation.
  if (!side) return { claimHeld: null, why: 'no consensus was published, so there is no box for the number to land in' };
  if (side === 'mid') return { claimHeld: null, why: 'the in-line box claims a drift, which thirty minutes cannot falsify' };
  if (!dir || dir === 'flat') return { claimHeld: null, why: 'the market did not move enough to say' };
  const baseUp = CCY_UP_IS_INSTRUMENT_UP[instrument];
  if (baseUp == null) return { claimHeld: null, why: `no polarity known for ${instrument}` };
  // a strong print should strengthen the currency; invert flips what "strong" means
  const wantCcyUp = invert ? side === 'dn' : side === 'up';
  const wantInstrumentUp = baseUp ? wantCcyUp : !wantCcyUp;
  const gotUp = dir === 'up';
  return { claimHeld: gotUp === wantInstrumentUp, why: null };
}

/** A release with its number scored, its claim scored, and its measured size. */
export function scoreRelease(ev = {}, reaction = null, { invertKinds = ['unemp'] } = {}) {
  const instrument = ev.instrument ?? HEADLINE_INSTRUMENT[ev.country] ?? null;
  const side = numberSide(ev.actual, ev.estimate);
  const invert = invertKinds.includes(ev.kind);
  const claim = scoreClaim({ side, instrument, dir: reaction?.dir, invert });
  return {
    country: ev.country, event: ev.event, ms: ev.ms, kind: ev.kind ?? null,
    actual: ev.actual ?? null, estimate: ev.estimate ?? null,
    instrument, side, invert,
    moved: reaction ? { move: reaction.move, unit: reaction.unit, dir: reaction.dir, ratio: reaction.ratio, ordinary: reaction.ordinary } : null,
    ...claim,
    // the part this desk HAS validated: a release widens the range, whichever way it goes
    sizeWord: reaction?.ratio == null ? null
      : reaction.ratio >= 3 ? 'a big move' : reaction.ratio >= 1.5 ? 'a real move' : 'an ordinary half-hour',
  };
}

/**
 * The running record of the playbook's directional claim.
 *
 * Carries `n` so the denominator is never hidden, and a `settled` flag that stays false
 * until there are enough scored releases for the number to mean anything. Below that it
 * reports the count and refuses a percentage — a 3-of-4 printed as 75% is the single
 * easiest way for this panel to start looking like a skill it has not demonstrated.
 */
export const TALLY_MIN = 20;
export function claimTally(rows = []) {
  const scored = (Array.isArray(rows) ? rows : []).filter(r => r.claimHeld === true || r.claimHeld === false);
  const right = scored.filter(r => r.claimHeld).length;
  const n = scored.length;
  return {
    right, n, settled: n >= TALLY_MIN,
    pct: n >= TALLY_MIN ? Math.round((100 * right) / n) : null,
    line: n === 0
      ? 'No release has been scored yet.'
      : n < TALLY_MIN
      ? `${right} of ${n} so far — too few to quote a percentage, and it will be shown as one only past ${TALLY_MIN}.`
      : `${right} of ${n} (${Math.round((100 * right) / n)}%). This desk's tested position is that direction after news is a coin flip, so a number near 50 is the expected result, not a failure of the playbook.`,
  };
}
