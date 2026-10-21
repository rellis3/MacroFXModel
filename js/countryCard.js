/**
 * COUNTRY CARD — one currency, the reasons first.
 *
 * Shape borrowed from a paid service the owner showed (score + label, one quoted line, three
 * tagged drivers, a monetary-cycle chip, best pair expressions, expand for the rest). What is NOT
 * borrowed is its verdict: that product's scores are AI opinions that flip with the headlines. This
 * card is built entirely from numbers this page already measures:
 *
 *   - the macro scorecard's six equal-weight factors (rates & policy, inflation, growth, labour,
 *     domestic demand, external balance) — which factor is carrying the currency, and by how much
 *   - what is separating the whole board today, and where this currency ranks on it
 *   - the central bank's tone trend, where a bank is tracked (FOMC / ECB / BoE / BoJ)
 *   - best expressions: this currency against each other one, differenced
 *
 * It explains WHY this currency should be bid or offered if the factor is priced — the mechanism.
 * It never says price WILL move: macro-as-signal has been tested and banked as null five times on
 * this desk, and central-bank tone momentum against forward price came back null too. So every
 * line is conditional, and the card says so once, at the foot.
 *
 * Pure: no DOM, no fetch. today.html feeds it data it already holds and renders the result.
 */

// What a strong or weak reading on each factor does to a currency, in one sentence each. These are
// the textbook transmission, written conditionally — "if priced". They are explanation, not claims.
export const FACTOR_WHY = {
  rates: {
    label: 'Rates & policy',
    strong: 'Yields and policy rates are high or rising against its peers, so holding the currency pays more and capital is drawn in — the carry and rate-differential bid.',
    weak: 'Yields and policy rates are low or falling against its peers, so holding it pays less and funding in it gets cheaper — which is what makes a currency a funding currency.',
  },
  inflation: {
    label: 'Inflation',
    strong: 'Inflation is running hot. A central bank facing it tends to hold rates higher for longer, which supports the currency — as long as the market believes the bank will act.',
    weak: 'Inflation is soft. That gives its central bank room to ease, which is the dovish path and weighs on the currency.',
  },
  growth: {
    label: 'Growth',
    strong: 'Output and business surveys are firm. Capital flows toward economies that are growing, and firm growth backs the case for tighter policy.',
    weak: 'Output and business surveys are soft. Weak growth pulls policy expectations down and capital toward better places to be.',
  },
  labour: {
    label: 'Labour market',
    strong: 'Jobs data are tight. A tight labour market keeps wage pressure — and so inflation — alive, which keeps the central bank cautious about cutting.',
    weak: 'Jobs data are loosening. That is the usual first sign a central bank can ease, and it weighs on the currency.',
  },
  demand: {
    label: 'Domestic demand',
    strong: 'Households are spending. Consumer demand is what sustains growth and inflation from the inside, which supports the policy path.',
    weak: 'Households are pulling back. Weak spending feeds through to growth and inflation, and so to a softer policy path.',
  },
  external: {
    label: 'External balance',
    strong: 'The country is earning more from abroad than it spends. A trade surplus means the world has to buy its currency to pay for what it sells.',
    weak: 'The country is spending more abroad than it earns. A trade deficit has to be financed by foreign capital, which makes the currency dependent on inflows continuing.',
  },
};

const FACTOR_KEYS = Object.keys(FACTOR_WHY);

/** Fewest scored factors (of six) for the composite to be worded as a read. Descriptive floor, not tuned. */
export const MIN_FACTORS = 3;

const CYCLE = {
  MORE_HAWKISH: { word: 'Turning hawkish', cls: 'bull', why: 'Its central bank sounded more hawkish than at the previous meeting.' },
  MORE_DOVISH: { word: 'Turning dovish', cls: 'bear', why: 'Its central bank sounded more dovish than at the previous meeting.' },
  UNCHANGED: { word: 'Tone steady', cls: 'neu', why: 'Its central bank sounded the same as at the previous meeting.' },
  INSUFFICIENT_DATA: { word: 'Tone unread', cls: 'neu', why: 'Not enough scored meetings to read a trend.' },
};

/** A signed composite on the scorecard's −1..+1 scale → a plain word. Thresholds are descriptive, not tuned. */
export function macroWord(c) {
  if (c == null || !Number.isFinite(c)) return { word: 'No read', cls: 'neu' };
  if (c >= 0.35) return { word: 'Strong', cls: 'bull' };
  if (c >= 0.12) return { word: 'Leaning strong', cls: 'bull' };
  if (c > -0.12) return { word: 'Mixed', cls: 'neu' };
  if (c > -0.35) return { word: 'Leaning weak', cls: 'bear' };
  return { word: 'Weak', cls: 'bear' };
}

function normFactors(factors) {
  const out = [];
  for (const [k, f] of Object.entries(factors ?? {})) {
    if (f?.score == null || !Number.isFinite(f.score)) continue;
    const key = FACTOR_WHY[k] ? k : FACTOR_KEYS.find(x => FACTOR_WHY[x].label.toLowerCase() === String(f.label ?? '').toLowerCase());
    if (!key) continue;
    const b = f.backedBy ?? f.dims ?? null;   // the scorecard sends `dims` as the list of series behind the factor
    out.push({ key, label: FACTOR_WHY[key].label, score: f.score, backedBy: Array.isArray(b) ? b.length : b, series: Array.isArray(b) ? b : null, of: f.of ?? null, stale: f.excludedStale ?? null });
  }
  return out;
}

/**
 * Build the card's content.
 *
 * input = {
 *   ccy,
 *   macro:   { composite, factors: {key: {label, score, backedBy, of, excludedStale}}, factorsScored, factorsTotal,
 *              coverage, stale } | null,
 *   measured:{ rank, of } | null,                    // where the day's actual move ranks it
 *   boardDriver: { factor, spread, thisCcyRank, of } | null,
 *   cb: { bank, trend, latestScore, deltaVsPrev } | null,
 *   board: [{ ccy, composite }],                     // every currency's composite, for expressions
 *   pairs: { 'EURUSD': ['EUR','USD'], ... },         // orientation: pair → [base, quote]
 * }
 */
export function buildCountryCard(input) {
  const { ccy, macro, measured, boardDriver, cb, board = [], pairs = {} } = input ?? {};
  if (!ccy) throw new Error('countryCard: ccy is required');
  const facs = normFactors(macro?.factors).sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  const composite = macro?.composite ?? null;
  const thin = macro?.factorsScored != null && macro?.factorsTotal != null && macro.factorsScored < MIN_FACTORS;
  // One factor out of six is not a macro read. A composite of +1.00 built on a single series would
  // print 'Strong' and mean 'the rate differential is high' — so below the floor the word is 'Thin read'.
  const w = thin ? { word: 'Thin read', cls: 'neu' } : macroWord(composite);

  // Drivers: the factors actually carrying the score, each with its mechanism and its backing.
  const drivers = facs.slice(0, 3).map(f => {
    const strong = f.score >= 0;
    const backing = f.of ? `${f.backedBy ?? '?'}/${f.of} series${f.series?.length ? ` (${f.series.join(', ')})` : ''}` : null;
    return {
      key: f.key, label: f.label, score: +f.score.toFixed(2), direction: strong ? 'strong' : 'weak',
      why: FACTOR_WHY[f.key][strong ? 'strong' : 'weak'],
      backing, thin: f.of ? (f.backedBy ?? 0) < f.of : false,
    };
  });

  // Where the factor that separates the board today puts this currency.
  let boardLine = null;
  if (boardDriver?.factor && boardDriver.thisCcyRank && boardDriver.of) {
    boardLine = `The factor currencies are most spread across today is ${boardDriver.factor.toLowerCase()}; ${ccy} ranks ${boardDriver.thisCcyRank} of ${boardDriver.of} on it. Leading a factor everyone agrees about says little; leading the disputed one says more.`;
  }

  // Monetary-cycle chip, only where a central bank is tracked.
  const cycle = cb && CYCLE[cb.trend]
    ? { bank: cb.bank, ...CYCLE[cb.trend], latestScore: cb.latestScore ?? null, delta: cb.deltaVsPrev ?? null }
    : { bank: null, word: 'No tracked bank', cls: 'neu', why: 'This desk tracks FOMC, ECB, BoE and BoJ tone only.', latestScore: null, delta: null };

  // Best expressions: this currency against every other, differenced, oriented by the pair's own base/quote.
  const comp = Object.fromEntries(board.filter(b => b?.composite != null).map(b => [b.ccy, b.composite]));
  const expressions = [];
  if (comp[ccy] != null) {
    for (const [name, [base, quote]] of Object.entries(pairs)) {
      if (base !== ccy && quote !== ccy) continue;
      const other = base === ccy ? quote : base;
      if (comp[other] == null) continue;
      const gap = comp[ccy] - comp[other];            // positive: ccy stronger than other on macro
      // The pair is long-base when base is the stronger currency.
      const baseStronger = (comp[base] - comp[quote]) > 0;
      expressions.push({
        pair: name, other, gap: +Math.abs(gap).toFixed(2), thisIsStronger: gap > 0,
        textbook: baseStronger ? `${base} over ${quote}` : `${quote} over ${base}`,
        line: `${ccy} ${comp[ccy] >= 0 ? '+' : ''}${comp[ccy].toFixed(2)} vs ${other} ${comp[other] >= 0 ? '+' : ''}${comp[other].toFixed(2)} ${thin ? `on the ${macro.factorsScored}/${macro.factorsTotal} factors with data` : 'on macro'} — the textbook leans ${baseStronger ? base : quote} over ${baseStronger ? quote : base}.${thin ? ' Thin: not a full macro read.' : ''}`,
      });
    }
    expressions.sort((a, b) => b.gap - a.gap);
  }

  const coverage = macro?.factorsScored != null && macro?.factorsTotal != null ? `${macro.factorsScored}/${macro.factorsTotal} factors` : null;

  return {
    ccy,
    composite: composite == null ? null : +composite.toFixed(2),
    word: w.word, cls: w.cls,
    coverage, thinCoverage: macro?.factorsScored != null && macro?.factorsTotal != null && macro.factorsScored < macro.factorsTotal, thin,
    measured: measured?.rank ? { rank: measured.rank, of: measured.of ?? null } : null,
    drivers, boardLine, cycle,
    expressions: expressions.slice(0, 3),
    foot: 'Why this currency should be bid or offered if these factors are priced — not a forecast. Macro as a signal has been tested here five times and banked null; central-bank tone against forward price too. The pair lines say where the textbook leans, nothing more.',
  };
}
