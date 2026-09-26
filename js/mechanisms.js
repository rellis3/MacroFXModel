/**
 * The wiring underneath the drill — why A moves B, derived rather than asserted.
 *
 * THE GAP THIS FILLS, in the owner's words: "the information within it is very
 * interesting, I just don't know enough about the background towards it... it's the
 * underlying principles of if this goes up then that goes down. That's the bit I miss."
 *
 * That is a fair complaint about a real flaw. The drill asks "which gold is trading?"
 * and the `principle` it shows afterwards is a CONCLUSION — "there is no such thing as
 * gold, four drivers, one at a time". True, and useless to someone who does not yet
 * know why gold answers to real yields at all. It tests recognition of a mechanism it
 * never taught.
 *
 * So each concept gets a DERIVATION: five to seven steps, each one following from the
 * one before, starting somewhere obvious and ending exactly where the question starts.
 * Not a summary, not a definition list — a chain you can follow and then rebuild
 * yourself.
 *
 * THREE RULES THE CONTENT FOLLOWS.
 *
 *   1. Every step is a consequence of the previous one. If a step needs a fact from
 *      outside the chain it is stated as a fact, not smuggled in as reasoning.
 *   2. `tested` says what THIS desk has measured about the link, including where the
 *      measurement contradicts the textbook. A mechanism that sounds right and tested
 *      null here must say so, or the teaching layer quietly re-teaches things the
 *      evidence book spent months closing.
 *   3. `see` is what to put on a screen, and `tv` carries the paste-ready symbols for it.
 *      A mechanism you cannot observe is a story, and one you cannot observe WITHOUT
 *      first guessing ticker spellings is a chore nobody does twice.
 *
 * ON THE SYMBOLS. OANDA-native wherever OANDA carries the instrument, checked against the
 * account's own 123-instrument list rather than assumed. Four series have NO OANDA
 * equivalent — the 10-year TIPS real yield, the 10-year breakeven, high-yield spreads and
 * a dollar index — so those stay on FRED or TVC and each `note` says so. Substituting
 * something that merely looks similar would be worse than the gap.
 *
 * AND THE TRAP THAT MATTERS. OANDA's USB##Y_USD are bond PRICE CFDs, not yields, and
 * EURUSD is the dollar upside down. Every derivation below is written in yields and in
 * dollar strength, so those charts run BACKWARDS to the words beside them. `invert` names
 * exactly which symbols do it and the UI warns on it, because this desk has already been
 * bitten by a silent price-for-yield swap once (see RATES_PIVOT_LEAD_PREREG.md, where the
 * 2-year CFD is POSITIVELY correlated with the Nasdaq for precisely this reason).
 *
 * Pure data + two small helpers. No fetch, no DOM. Tested in js/mechanisms.test.mjs.
 */

export const MECHANISMS = {
  'yield-split': {
    label: 'Real yields vs inflation',
    question: 'Why does splitting a yield move matter more than the move itself?',
    steps: [
      'A government bond pays you a fixed number each year. That number is the NOMINAL yield — it is what the coupon says.',
      'But prices rise while you hold it. What you actually end up with is that number minus however much inflation there was. That leftover is the REAL yield.',
      'Both are priced in the market, separately. An inflation-protected bond (TIPS) pays a real yield directly, and the gap between an ordinary bond and a TIPS of the same maturity is what the market expects inflation to average — the BREAKEVEN.',
      'So the relationship is always: nominal = real + breakeven. Three numbers, and knowing two gives you the third.',
      'That means when the 10-year yield moves, one of those two legs moved — or both, possibly in opposite directions.',
      'And the two legs mean OPPOSITE things. Real yield up means money genuinely got more expensive: a headwind for gold, and for any company whose profits sit far in the future. Breakeven up means the market expects more inflation: that is gold’s friend, and it is not a tightening at all.',
      'Which is why a yield move you have not split is uninterpretable. "The 10-year rose 20bp" tells you nothing until you know which half did it.',
    ],
    see: 'Put the 10-year, the 10-year TIPS and the breakeven on one screen. The middle one is the one that matters; the breakeven is just the gap.',
    tested: 'This is arithmetic, not a claim — the three numbers are defined to add up. What this desk has tested is what follows, and direction after a yield move is null here. Use the split to understand what happened, not to predict what is next.',
    tv: { main: 'OANDA:USB10YUSD', compare: ['FRED:DFII10', 'FRED:T10YIE'], expr: null,
          invert: ['OANDA:USB10YUSD'],
          note: 'The OANDA bond is the 10-year PRICE, so it runs UPSIDE DOWN to the yield every step here talks about: the bond rallying IS the yield falling. The real yield and the breakeven have no OANDA equivalent at all — they are FRED series or nothing.' },
  },

  'curve-led': {
    label: 'The curve and banks',
    question: 'Why does it matter which END of the curve moved?',
    steps: [
      'A 2-year bond matures in two years. Almost all of what you earn depends on what the central bank does between now and then.',
      'A 30-year bond matures long after any current policy decision is irrelevant. What you earn depends on inflation over decades, and on how much the government needs to borrow.',
      'So the two ends are answering different questions, and they can move independently.',
      'The gap between them is the CURVE. Steepening = the long end is leading. Flattening = the front end is leading.',
      'Now the useful part: a bank funds itself short and lends long. The gap between short and long rates IS its margin, mechanically.',
      'So a flattening curve squeezes bank profitability and a steepening one helps it — which is the most reliable route from a rates move to an equity sector there is.',
      'And which end moved tells you which conversation the market is having: the front end is a vote on the central bank, the long end is a vote on inflation credibility and supply.',
    ],
    see: 'The 2-year and the 30-year on one chart, and the gap between them as its own line. Watch which one moves when the gap changes.',
    tested: 'The bank-margin mechanism is structural. The forward claim — that a curve move predicts the next equity move — is NOT tested here and should not be assumed.',
    tv: { main: 'OANDA:USB02YUSD', compare: ['OANDA:USB30YUSD'], expr: 'OANDA:USB02YUSD-OANDA:USB30YUSD',
          invert: ['OANDA:USB02YUSD', 'OANDA:USB30YUSD'],
          note: 'Both legs are PRICES, so the spread is written 2y minus 30y — that way it still rises when the yield curve steepens, which is the opposite order to how you would write it in yields. Read it as a direction only: the 30-year leg moves far more per basis point than the 2-year, so the size is dominated by the long end.' },
  },

  'oil-breakevens': {
    label: 'Oil into inflation pricing',
    question: 'Why should crude show up in the bond market at all?',
    steps: [
      'Petrol and heating are in the basket of goods that inflation is measured from. Crude feeds both, directly and quickly.',
      'So a large, sustained crude move mechanically changes headline inflation a few months out.',
      'The bond market prices expected inflation every second, in the breakeven. If it believes a crude move will reach the basket, the breakeven should move with it.',
      'Therefore: crude up with breakevens up is the market accepting the inflation story.',
      'And crude up with breakevens FLAT is the market rejecting it — reading the move as a supply shock or a one-off that will not persist into the basket.',
      'That second case is the informative one, because it tells you the bond market has already made a judgement that the headline has not.',
    ],
    see: 'Crude and the 10-year breakeven over the same twenty sessions. You are looking for whether they moved together, not by how much.',
    tested: 'MEASURED HERE, and it corrects the textbook: there is NO lag. Oil and breakevens move in the same window or not at all — a 20-day oil move of ±10% is followed by no excess breakeven change at 5, 10 or 20 sessions. A quiet breakeven beside a big oil move is disagreement, not delay. Never write "not yet".',
    tv: { main: 'OANDA:WTICOUSD', compare: ['FRED:T10YIE'], expr: null,
          invert: null,
          note: 'WTI on the chart. The breakeven is a FRED series — OANDA has no inflation instrument, so this one cannot be done OANDA-only.' },
  },

  'which-gold': {
    label: 'Which gold is trading',
    question: 'Why does gold care about real yields, and what else is it listening to?',
    steps: [
      'Gold pays you nothing. No coupon, no dividend, no rent. Holding it costs you whatever you could have earned instead.',
      'The obvious alternative is a government bond. So the cost of holding gold is roughly the yield you gave up.',
      'But inflation eats that yield too — and it erodes the bond, not the metal. So the fair comparison is the yield AFTER inflation: the real yield.',
      'Therefore: real yields up means holding gold costs more, and gold usually falls. Real yields down means it costs less, and gold usually rises. That is the first driver.',
      'Separately, gold is quoted in dollars. If the dollar strengthens, gold gets more expensive for everyone not holding dollars, and demand falls. That is a SECOND driver, independent of the first.',
      'Which gives you the test. When gold moves, check both: did real yields move, did the dollar move? If one explains it, that is the gold trading.',
      'If NEITHER explains it, the buyer is someone who does not care about either — a central bank adding reserves, or somebody frightened. That is the third and fourth gold, and you identify them by elimination rather than by a number.',
    ],
    see: 'Gold, the 10-year TIPS yield and the broad dollar on one screen. Two of them should explain most days; the days they do not are the interesting ones.',
    tested: 'The rates and dollar legs are measured on the board every day. The "fear gold" leg tested NULL here — gold does not reliably rise on fear — so treat the elimination case as "something not on this board", not as proof of a panic.',
    tv: { main: 'OANDA:XAUUSD', compare: ['OANDA:USB10YUSD', 'FRED:DFII10'], expr: null,
          invert: ['OANDA:USB10YUSD'],
          note: 'Gold is OANDA-native. The 10-year bond stands in for the rates leg and runs upside down to the yield. There is no OANDA dollar index — the nearest OANDA-native dollar is EURUSD read inverted, or use TVC:DXY.' },
  },

  'credit-confirms': {
    label: 'Credit as the earlier vote',
    question: 'Why would bond investors notice trouble before shareholders?',
    steps: [
      'If you own a share, you own the upside. The company can do arbitrarily well and you get all of it.',
      'If you lend to that company, you cannot do better than being repaid in full. Your entire job is judging whether you get your money back.',
      'So a lender is forced to price one specific question — the odds of not being repaid — while a shareholder is pricing a much vaguer one about future profits.',
      'A narrow, concrete question gets answered faster and more accurately than a broad one. So credit investors tend to reprice trouble before equity investors do.',
      'The number to watch is the SPREAD: the extra yield a risky borrower pays over a government borrowing for the same period. Widening means lenders are demanding more to take the same risk.',
      'Which gives you the reading. Equities falling WITH credit widening is an economic scare — the people whose job is default risk agree. Equities falling with credit calm is usually positioning, hedging or an expiry.',
    ],
    see: 'High-yield spreads against the S&P. You are checking whether they are moving together or only one is.',
    tested: 'The lead-lag ordering is measured here and holds as a description. It is NOT a validated forward signal — credit widening does not reliably predict the next equity move.',
    tv: { main: 'OANDA:SPX500USD', compare: ['FRED:BAMLH0A0HYM2'], expr: null,
          invert: null,
          note: 'The S&P is OANDA-native, so it leads here. High-yield spreads are FRED-only, and remember the spread RISING is the bad news — it is already inverted in meaning before any instrument choice.' },
  },

  'dollar-link': {
    label: 'The dollar as the unit',
    question: 'Why does half the board move when the dollar moves?',
    steps: [
      'Oil, gold, copper and most of world trade are quoted in dollars. The dollar is the measuring stick, not just another market.',
      'So a price in dollars is a ratio of two things: the value of the asset, and the value of the dollar.',
      'That means the number can change because the asset changed, or because the stick changed — and the chart looks identical either way.',
      'A 1% stronger dollar makes every dollar-priced thing about 1% cheaper in dollar terms, mechanically, with nothing having happened to the thing itself.',
      'So before saying "gold fell" or "oil fell", the first question is whether it fell or the measuring stick moved.',
      'The way to tell: if EVERYTHING dollar-priced moved the same way together, it was the stick. If one moved and the others did not, it was that asset.',
    ],
    see: 'The broad dollar alongside gold, oil and copper. A day where all three move together against the dollar is a currency day, not a commodity day.',
    tested: 'The dollar leg of the chain is measured daily. Note the board’s dollar index is a FRED series and settles days behind, which is why the end-of-day read rebuilds the dollar from live FX pairs instead.',
    tv: { main: 'OANDA:EURUSD', compare: ['OANDA:XAUUSD', 'OANDA:WTICOUSD', 'OANDA:XCUUSD'], expr: null,
          invert: ['OANDA:EURUSD'],
          note: 'OANDA has no dollar index, so the biggest single leg of one stands in — and EURUSD is the dollar UPSIDE DOWN. If all three dollar-priced things move WITH it, the measuring stick moved. Swap in TVC:DXY to read it the right way up.' },
  },

  'regime-quad': {
    label: 'Growth and inflation together',
    question: 'Why do two numbers place almost every macro asset?',
    steps: [
      'Nearly every macro asset cares about two things: whether the economy is speeding up or slowing down, and whether prices are rising faster or slower.',
      'Each can go two ways, so there are four combinations. That is the whole framework.',
      'Growth up, inflation up — reflation. Things that need demand and eat raw materials do well: commodities, cyclicals, banks.',
      'Growth up, inflation down — the comfortable one. Equities broadly, because profits rise without the central bank having to act.',
      'Growth down, inflation up — the awkward one. Bonds cannot rally (inflation) and shares cannot rally (no growth). Historically gold and energy.',
      'Growth down, inflation down — the scare. Government bonds, and very little else.',
      'The point is not to predict which box you land in. It is that once you know the box, you know which assets are FIGHTING their backdrop — and an asset rising against its own quadrant is telling you something the quadrant is not.',
    ],
    see: 'Copper against gold for the growth read, and breakevens for the inflation read. Two lines, four boxes.',
    tested: 'This is a classification, not a signal. No forward test here supports trading the quadrant, and the board uses it to describe a backdrop.',
    tv: { main: 'OANDA:XCUUSD/OANDA:XAUUSD', compare: ['FRED:T10YIE'], expr: 'OANDA:XCUUSD/OANDA:XAUUSD',
          invert: null,
          note: 'The growth axis is fully OANDA-native — copper divided by gold, one line. The inflation axis is a FRED breakeven; OANDA carries nothing equivalent. Two lines, four quadrants: read which box you are in, not where it goes next.' },
  },
};

/** The derivation for a concept, or null when there is none yet. */
export function mechanismFor(topic) { return MECHANISMS[topic] ?? null; }

/**
 * Which concepts still have no derivation.
 *
 * A drill topic that can be ASKED but not EXPLAINED is the exact failure this file was
 * written to fix, so it is reported rather than left to be discovered by someone stuck
 * on the question.
 */
export function missingMechanisms(topics = []) {
  return (Array.isArray(topics) ? topics : []).filter(t => !MECHANISMS[t]);
}
