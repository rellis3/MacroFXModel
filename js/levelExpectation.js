/**
 * LEVEL EXPECTATION — what dealer hedging implies at a level, given the gamma band
 * that level sits in. One short phrase per level, for the export and the indicator.
 *
 * WHY THIS EXISTS. The export already asserts behaviour, but only ONCE per pair:
 * "+gamma (pin/dampen)", taken from where SPOT sits. Every level then inherits that
 * label even when it sits in a different band — and with multiple GEX crossings a
 * level 2% away routinely does. The same call wall pins inside a long-gamma band and
 * breaks inside a short-gamma one, so the regime has to be evaluated AT the level,
 * not at spot.
 *
 * MECHANISM, NOT PROPHECY. Every phrase here describes what dealer hedging does, not
 * what price will do. "hedging suppresses" is a structural statement about who has to
 * buy dips and sell rallies; "will reject" is a forecast. This platform has a record
 * of plausible-sounding logic that did not survive contact with data (the QMR
 * free-hour artifact, the null trend-following basket), so nothing here claims an
 * outcome. Whether these mechanics actually predict anything is an open question and
 * the reason `tag` exists: it is meant to be logged against what price did, and
 * scored later. Until that scoring exists, treat every phrase as a hypothesis.
 *
 * Pure and offline-testable. Uses only fields already on the store entry.
 */

// Which gamma band a price sits in, from the crossings list. Bands alternate, so the
// sign at any price is fixed by the FIRST crossing above it: if that crossing is
// 'long->short' we are below it and therefore long; if 'short->long', we are short.
// Falls back to the spot-side reading when no crossings are stored (older entries).
export function gammaBandAt(price, gexFlips, { spot = null, gammaFlip = null } = {}) {
  if (!Number.isFinite(price)) return null;
  const hits = (Array.isArray(gexFlips) ? gexFlips : [])
    .filter(f => Number.isFinite(f?.price))
    .sort((a, b) => a.price - b.price);
  if (hits.length) {
    const above = hits.find(f => f.price > price);
    if (above) return above.dir === 'long->short' ? 'long' : 'short';
    // Above every crossing: the sign is whatever the last crossing turned into.
    return hits[hits.length - 1].dir === 'long->short' ? 'short' : 'long';
  }
  if (Number.isFinite(gammaFlip) && Number.isFinite(spot)) {
    return price >= gammaFlip ? 'long' : 'short';
  }
  return null;
}

// Terse by design: the Pine indicator draws these on the chart and a long sentence
// makes the plot unreadable. `short` is what goes on a line; `long` is for the export
// where there is room for a clause.
// Each entry is: the ACTION word first (what to expect price to do), then WHY in
// plain English. The action vocabulary is deliberately tiny and reused everywhere:
//
//   REJECT   expect the level to hold and price to turn away from it
//   BREAK    expect price to go through, possibly speeding up as it does
//   MAGNET   expect price to drift toward it
//   PIN      expect price to stick around it
//   EDGE     a boundary: behaviour CHANGES on the other side
//
// The band decides which action a level gets, and it is the same idea every time:
// in a LONG-gamma band the dealers' hedging works against the move, so levels hold
// (REJECT). In a SHORT-gamma band their hedging works with the move, so the same
// level gives way (BREAK). That is the entire mechanism.
// Three words each - enough to recall the meaning without a legend elsewhere.
const GIST = {
  Reject: 'turns away',
  Break:  'goes through',
  Magnet: 'drifts to',
  Pin:    'sticks here',
  Edge:   'changes here',
  Watch:  'today only',
};

const PHRASE = {
  call_wall: {
    long:  { act: 'Reject', why: 'heavy call OI above - sellers defend it, and hedging works against the move' },
    short: { act: 'Break',  why: 'heavy call OI, but hedging here ADDS to the move - defence tends to give way' } },
  put_wall: {
    long:  { act: 'Reject', why: 'heavy put OI below - buyers defend it, and hedging works against the move' },
    short: { act: 'Break',  why: 'heavy put OI, but hedging here ADDS to the move - support tends to give way' } },
  max_pain: {
    long:  { act: 'Magnet', why: 'the price where most options expire worthless - drift tends toward it' },
    short: { act: 'Magnet', why: 'expiry magnet, but weaker here - the move can overrun it' } },
  gamma_flip: {
    long:  { act: 'Edge',   why: 'boundary: quieter above, jumpier below' },
    short: { act: 'Edge',   why: 'boundary: quieter above, jumpier below' } },
  gex_flip: {
    long:  { act: 'Edge',   why: 'whole-book boundary: crossing it changes how price behaves' },
    short: { act: 'Edge',   why: 'whole-book boundary: crossing it changes how price behaves' } },
  hvl: {
    long:  { act: 'Pin',    why: 'the biggest cluster of hedging - price tends to stick here' },
    short: { act: 'Pin',    why: 'big hedging cluster, but weaker hold in this band' } },
  oi_volume: {
    long:  { act: 'Watch',  why: "today's trading only, not a standing position - can vanish tomorrow" },
    short: { act: 'Watch',  why: "today's trading only, not a standing position - can vanish tomorrow" } },
  oi_cluster: {
    long:  { act: 'Reject', why: 'several strikes stacked together - a thicker level than a single strike' },
    short: { act: 'Break',  why: 'several strikes stacked, but hedging here adds to the move' } },
};

/**
 * level: { price, type, tier? }   ctx: { spot, gexFlips, gammaFlip, refMove }
 * -> { band, short, long, tag } | null
 *   band  'long' | 'short' | null   dealer gamma sign AT THE LEVEL
 *   short terse label for the indicator
 *   long  a clause for the export
 *   tag   stable machine key, for logging the expectation and scoring it later
 */
export function levelExpectation(level, ctx = {}) {
  const p = PHRASE[level?.type];
  if (!p || !Number.isFinite(level?.price)) return null;
  const band = gammaBandAt(level.price, ctx.gexFlips, ctx);
  // Unknown band: fall back to the long-gamma reading (the ordinary case) but say
  // the regime is unknown rather than implying it was checked.
  const e = band === 'short' ? p.short : p.long;
  // Distance matters: a level beyond the plausible move is context, not a target.
  const far = Number.isFinite(ctx.refMove) && ctx.refMove > 0 && Number.isFinite(ctx.spot)
    && Math.abs(level.price - ctx.spot) > 2.5 * ctx.refMove;
  const bandNote = band === 'long' ? 'calm zone' : band === 'short' ? 'jumpy zone' : 'zone unknown';
  const gist = GIST[e.act] || '';
  return {
    band,
    // Chart label: the action word, plus a flag when the level is out of reach.
    short: far ? `${e.act}·far` : e.act,
    // Same word with a three-word reminder of what it means. Used on the export
    // line and in the indicator's table, where there IS room - so the vocabulary
    // teaches itself instead of needing a key kept somewhere else.
    mid: `${e.act} (${gist})${far ? ' far' : ''}`,
    // Export line: action first, then why, in that order, so the action is
    // readable at a glance and the reason is there to learn from.
    long: `${e.act} - ${e.why} (${bandNote})${far ? '; beyond ~2.5x expected move' : ''}`,
    tag: `${level.type}:${band ?? 'unknown'}${far ? ':far' : ''}`,
  };
}
