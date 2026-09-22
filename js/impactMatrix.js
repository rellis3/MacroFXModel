/**
 * The impact matrix — "what is the effect of X on Y", as a grid.
 *
 * Two questions, deliberately kept apart, because confusing them is the single
 * most expensive mistake a cross-asset reader makes:
 *
 *   SAME WINDOW — "when X moved, did Y move with it?"  That is the chain
 *     (js/macroChain.js). It explains. It is judged fresh every day.
 *   FORWARD     — "having seen X, what happens NEXT?"  That is the evidence
 *     book (js/deskEvidence.js). Almost all of it is about RANGE; almost every
 *     direction claim this desk has tested has come back null.
 *
 * A cell is one of four things, and the fourth is the point of the exercise:
 *   validated  a tested effect with a number and an interval
 *   null       tested, nothing there — the most valuable cells on the board
 *   context    described or a base rate: real, but not a forward claim
 *   (blank)    nobody has asked. The blanks are the research queue.
 *
 * This file is the map from a (driver, target) pair to the evidence that
 * answers it. It holds no numbers of its own — every figure is read out of the
 * ledger at render time, so the grid cannot drift from the book.
 *
 * Pure: no fetch, no DOM. Tested in js/impactMatrix.test.mjs.
 */

/** The things that move other things, in the order a macro reader meets them. */
export const DRIVERS = [
  { id: 'real',     label: 'Real yields',        what: 'The 10-year TIPS yield: the true cost of money once inflation is taken out. The single most connected node on the board.' },
  { id: 'dollar',   label: 'The dollar',         what: 'The broad trade-weighted dollar. The price of the unit everything else is quoted in.' },
  { id: 'oil',      label: 'Oil',                what: 'Front-month crude. The first domino in the inflation chain.' },
  { id: 'crack',    label: 'The crack spread',   what: 'Refining margin: fuel minus crude. Says whether the pump price follows crude down.' },
  { id: 'fear',     label: 'Fear (VIX)',         what: 'The price of thirty days of insurance on the S&P.' },
  { id: 'credit',   label: 'Credit spreads',     what: 'High-yield OAS: what junk borrowers pay over Treasuries. Lenders vote here first.' },
  { id: 'funding',  label: 'Funding (repo)',     what: 'Overnight repo against the Fed floor. The plumbing.' },
  { id: 'surprise', label: 'A data surprise',    what: 'Actual versus consensus, in standard deviations of that series own surprise history.' },
  { id: 'fed',      label: 'The Fed decision',   what: 'The statement, the path and the dots.' },
  { id: 'gaps',     label: 'Foreign yield gaps', what: 'Gilt, Bund and JGB 10-years against the Treasury: who is repricing faster.' },
  { id: 'asia',     label: 'The Asia range',     what: 'How much of the day was spent before London opened.' },
  { id: 'crowd',    label: 'Positioning',        what: 'Large speculators (COT) and the retail book: who is already in.' },
  { id: 'breadth',  label: 'Equity breadth',     what: 'Whether the indices agree with each other.' },
  { id: 'tape',     label: 'Tape speed',         what: 'How fast price is arriving, against the same hour on other days.' },
];

/** The things you might want an answer about. */
export const TARGETS = [
  { id: 'range',     label: 'Tomorrow’s range',  what: 'How wide the next session or week runs. This is where nearly everything that survives on this desk lives.' },
  { id: 'direction', label: 'Direction',              what: 'Which way it closes. Tested many times here, and almost always a coin flip.' },
  { id: 'fx',        label: 'FX',                     what: 'The currency pairs, same window.' },
  { id: 'gold',      label: 'Gold',                   what: 'Same window.' },
  { id: 'equities',  label: 'Equities',               what: 'Indices, same window.' },
  { id: 'rates',     label: 'Yields & inflation',     what: 'Treasuries and what the bond market prices for inflation.' },
];

/**
 * The map. `ev` names an entry in js/deskEvidence.js — the cell's verdict and
 * number come from there, never from here. `chain` names links in
 * js/macroChain.js that answer the same-window question, so a cell can show
 * today's verdict as well as the standing one. `note` is the one-line reading.
 */
export const CELLS = [
  // real yields
  { driver: 'real', target: 'gold', face: 'the textbook enemy',      chain: ['real-gold'], note: 'Gold pays nothing, so a higher real yield is its textbook enemy.' },
  { driver: 'real', target: 'equities', face: '+0.19 to +0.23 ATR after a down-week',  chain: ['real-nq', 'real-spx'], ev: 'nq-down-week', note: 'Long-duration equity discounts hardest. The forward test that survives is the Nasdaq down-WEEK widening the next session; the yield leg itself predicts nothing.' },
  { driver: 'real', target: 'fx', face: 'same window only',        chain: ['real-dxy'], ev: 'yields-to-fx-direction', note: 'Capital chases real return in theory. Tested here: no forward edge to FX direction.' },
  { driver: 'real', target: 'direction', face: 'no forward edge', ev: 'yields-to-fx-direction' },
  { driver: 'real', target: 'rates', face: 'the split IS the story',     chain: ['us10y-real', 'bei-us10y'], note: 'A nominal yield is a real yield plus expected inflation; which leg moved is the whole story.' },

  // the dollar
  { driver: 'dollar', target: 'gold', face: 'dearer abroad',     chain: ['dxy-gold'] },
  { driver: 'dollar', target: 'fx', face: 'half of every pair',       chain: ['dxy-audusd', 'dxy-usdjpy'], note: 'Every pair is half a dollar trade. The chain judges the two legs that carry a second driver as well.' },
  { driver: 'dollar', target: 'equities', face: 'drifts after an FOMC', ev: 'post-fomc-usd-drift', note: 'No standing same-window link on the board; the dollar’s one validated forward behaviour is its own drift after an FOMC.' },

  // oil and the crack
  { driver: 'oil',   target: 'rates', face: 'same window or never',  chain: ['oil-bei'], ev: 'oil-to-breakevens', note: 'Oil reaches inflation pricing in the SAME window or not at all — there is no lag to wait for.' },
  { driver: 'oil',   target: 'fx', face: 'Canada exports it',     chain: ['oil-usdcad'], note: 'Canada exports it.' },
  { driver: 'crack', target: 'rates', face: '+15bp of breakevens when they disagree',  chain: ['crack-bei'], ev: 'crack-inflation-channel', note: 'The refining margin carries inflation pricing beyond crude itself.' },
  { driver: 'crack', target: 'range', face: 'no wider month',  ev: 'crack-blowout-range' },
  { driver: 'crack', target: 'direction', face: '62% [48-75], a coin', ev: 'crack-disagreement-direction' },

  // fear and credit
  { driver: 'fear',   target: 'range', face: '+0.43 to +0.82 ATR for a week',    ev: 'vix-inversion', note: 'The term structure inverting is the cleanest range signal this desk owns.' },
  { driver: 'fear',   target: 'fx', face: 'fear buys the yen',       chain: ['vix-usdjpy'], note: 'Fear buys the yen, in the same window.' },
  { driver: 'fear',   target: 'gold', face: 'no bid; lags a month later',     ev: 'fear-gold', note: 'The famous one, and it is not there.' },
  { driver: 'fear',   target: 'equities', face: 'over-insured calms down', ev: 'iv-over-rv-wider', note: 'Over-insurance calms down; it does not fall.' },
  { driver: 'credit', target: 'equities', face: 'lenders vote with fear', chain: ['vix-hy'], note: 'Lenders and equity fear move together. No forward test here yet.' },

  // plumbing
  { driver: 'funding', target: 'fx', face: 'scarce dollars get bid',    chain: ['funding-dxy'] },
  { driver: 'funding', target: 'range', face: 'month-end routine', ev: 'repo-stress-range', note: 'The 10bp repo mark is month-end routine since 2024, not stress.' },

  // events
  { driver: 'surprise', target: 'range', face: '+0.17 to +0.51 ATR by family',     ev: 'surprise-size', note: 'By family: rate decisions and jobs widen the day, CPI widens the day AFTER.' },
  { driver: 'surprise', target: 'direction', face: 'priced-in changes nothing', ev: 'priced-in-direction' },
  { driver: 'surprise', target: 'fx', face: 'a size per pair, per release',        ev: 'event-impact-map', note: 'Each release has a characteristic SIZE per pair — the Event Response Book.' },
  { driver: 'fed',      target: 'range', face: 'a third wider, like any big day',     ev: 'fed-two-moves' },
  { driver: 'fed',      target: 'direction', face: 'one cell, thin', ev: 'fomc-leadup-surprise-table' },
  { driver: 'fed',      target: 'fx', face: 'the dollar drifts up for 5 days',        ev: 'post-fomc-usd-drift', note: 'The one validated dollar drift on the book.' },
  { driver: 'fed',      target: 'rates', face: 'a shock means CALMER FX',     ev: 'front-end-shock' },

  // the non-US legs
  { driver: 'gaps', target: 'fx', face: 'bunds 74%, JGBs 70%, gilts a coin',        ev: 'nonus-yield-gap-label', chain: ['giltgap-gbpusd', 'bundgap-eurusd', 'jgbgap-usdjpy'], note: 'Same window: bunds 74% of 20-day windows, JGBs 70%, gilts a coin flip at 57%.' },
  { driver: 'gaps', target: 'range', face: 'vol clustering, not the gap',     ev: 'nonus-yield-gap-range' },
  { driver: 'gaps', target: 'direction', face: '50/55/50%', ev: 'nonus-yield-gap-direction' },

  // the session itself
  { driver: 'asia',    target: 'range', face: 'up to -29pp on the odds',     ev: 'asia-range-london', note: 'Overnight range says how much of the day is LEFT — the largest day-to-day conditioner on the board, and it says nothing about which way.' },
  { driver: 'tape',    target: 'range', face: 'pace persists an hour',     ev: 'tape-speed-persistence' },
  { driver: 'breadth', target: 'range', face: 'every index down = wider week',     ev: 'breadth-all-down' },
  { driver: 'crowd',   target: 'direction', face: 'crowding is constant', ev: 'squeeze-fuel', note: 'Crowding is nearly constant, so it cannot mark a turn.' },
  { driver: 'crowd',   target: 'range', face: 'wrong on all three counts',     ev: 'crowded-bond-short-fomc', note: 'The one crowding setup tested against an event: wrong on all three counts.' },
];

/**
 * Resolve the spec against the ledger and (optionally) today's chain verdicts.
 * Returns { rows, byKey, stats } where a cell is
 *   { driver, target, verdict, claim, result, use, doc, chain: [{id, verdict}], note }
 * and verdict is 'validated' | 'null' | 'context' | 'untested'.
 */
export function buildMatrix(evidence = [], chainLinks = []) {
  const byId = new Map(evidence.map(e => [e.id, e]));
  const linkById = new Map((chainLinks ?? []).map(l => [l.id, l]));
  const byKey = new Map();
  const missing = [];
  for (const c of CELLS) {
    const e = c.ev ? byId.get(c.ev) : null;
    if (c.ev && !e) missing.push(c.ev);                       // a renamed ledger id must not fail silently
    const chain = (c.chain ?? []).map(id => { const l = linkById.get(id); return { id, verdict: l?.verdict ?? null, short: l?.short ?? id, textbook: l?.textbook ?? null }; });
    const verdict = e ? e.verdict : (chain.length ? 'context' : 'untested');
    byKey.set(`${c.driver}|${c.target}`, { ...c, verdict, evidence: e ?? null, chain });
  }
  const rows = DRIVERS.map(d => ({ ...d, cells: TARGETS.map(t => byKey.get(`${d.id}|${t.id}`) ?? { driver: d.id, target: t.id, verdict: 'untested', chain: [] }) }));
  const flat = [...byKey.values()];
  const stats = {
    asked: flat.length, blank: DRIVERS.length * TARGETS.length - flat.length,
    validated: flat.filter(c => c.verdict === 'validated').length,
    nulls: flat.filter(c => c.verdict === 'null').length,
    context: flat.filter(c => c.verdict === 'context').length,
    missing,
  };
  return { rows, byKey, stats };
}

/**
 * Who is driving: rank series by how much of everyone else's daily move they
 * move with. `series` is { key: [{date, value}] } — the same node series the
 * chain uses. Returns [{ key, label, meanAbsCorr, n, partners }] descending.
 *
 * This is DESCRIPTION, and shared movement is not causation: two things can
 * move together because a third moved both. It answers "what is today's tape
 * organised around", which is the first question a macro reader asks and the
 * one no single chart shows.
 */
export function leadership(series = {}, { window = 60, labels = {} } = {}) {
  const keys = Object.keys(series).filter(k => Array.isArray(series[k]) && series[k].length >= 20);
  if (keys.length < 3) return [];
  // daily changes on the common dates
  const maps = Object.fromEntries(keys.map(k => [k, new Map(series[k].map(p => [p.date, p.value]))]));
  const dates = [...new Set(keys.flatMap(k => series[k].map(p => p.date)))].sort().slice(-(window + 1));
  const chg = {};
  for (const k of keys) {
    const m = maps[k]; const out = [];
    for (let i = 1; i < dates.length; i++) {
      const a = m.get(dates[i - 1]), b = m.get(dates[i]);
      out.push(a != null && b != null && a !== 0 ? (b - a) / Math.abs(a) : null);
    }
    chg[k] = out;
  }
  const corr = (a, b) => {
    const pa = [], pb = [];
    for (let i = 0; i < a.length; i++) if (a[i] != null && b[i] != null) { pa.push(a[i]); pb.push(b[i]); }
    if (pa.length < 15) return null;
    const ma = pa.reduce((s, v) => s + v, 0) / pa.length, mb = pb.reduce((s, v) => s + v, 0) / pb.length;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < pa.length; i++) { sab += (pa[i] - ma) * (pb[i] - mb); saa += (pa[i] - ma) ** 2; sbb += (pb[i] - mb) ** 2; }
    return (saa > 0 && sbb > 0) ? { r: sab / Math.sqrt(saa * sbb), n: pa.length } : null;
  };
  const out = [];
  for (const k of keys) {
    const partners = [];
    for (const j of keys) {
      if (j === k) continue;
      const c = corr(chg[k], chg[j]);
      if (c) partners.push({ key: j, label: labels[j] ?? j, r: +c.r.toFixed(2), n: c.n });
    }
    if (partners.length < 2) continue;
    const mean = partners.reduce((s, p) => s + Math.abs(p.r), 0) / partners.length;
    partners.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    out.push({ key: k, label: labels[k] ?? k, meanAbsCorr: +mean.toFixed(3), n: partners[0]?.n ?? null, partners: partners.slice(0, 4) });
  }
  return out.sort((a, b) => b.meanAbsCorr - a.meanAbsCorr);
}
