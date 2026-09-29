/**
 * The twelve chapters, declared rather than hand-written.
 *
 * WHY A SPEC AND NOT TWELVE RENDER FUNCTIONS. A and D were written by hand and were
 * already drifting from each other by the time the third was needed — different member
 * orders, different receipt wording, one carrying evidence and the other nearly
 * forgetting. Twelve of those would be twelve chances to say the same thing differently,
 * which is exactly the inconsistency a reader reads as carelessness.
 *
 * So each chapter declares WHAT it is about and one renderer decides HOW it looks. The
 * only bespoke code left is the surface, which genuinely differs per complex.
 *
 * EVERY CHAPTER CARRIES ITS OWN VERDICTS. `evidence` names ledger entries by id, and a
 * test asserts each one exists — a chapter citing a finding that was renamed would
 * quietly show nothing, which is the failure mode this repo keeps meeting. Several
 * chapters carry mostly NULLS and that is the point: liquidity reads fine and this
 * desk's own G1 test returned null on all three OOS hit rates, and a page that shows the
 * gauge without the verdict is the thing the educator's version does.
 *
 * `gauge` members are read as CHANGE z-scores, not levels: a chapter about what is
 * happening to inflation is a different question from where the index happens to sit.
 *
 * Pure data. Tested in js/chapterSpec.test.mjs.
 */

/** unit 'pct' for anything quoted in percent, 'bp' for rates and spreads, 'idx' for levels. */
export const CHAPTERS = [
  {
    key: 'A', name: 'The curve', built: true,
    blurb: 'Eleven constant-maturity tenors. The shape is the market arguing about policy at the front and about inflation and supply at the back.',
    surface: 'curve',
    members: [
      { key: 'm1', label: '1M', unit: 'bp' }, { key: 'm3', label: '3M', unit: 'bp' },
      { key: 'y2', label: '2Y', unit: 'bp' }, { key: 'y10', label: '10Y', unit: 'bp' },
      { key: 'y30', label: '30Y', unit: 'bp' },
    ],
    receipts: ['y10', 'y2', 'y30'],
    evidence: ['front-end-shock', 'rates-pivot-lead', 'yields-to-fx-direction', 'spread-leads-fx-hours', 'yield-spread-sleeve'],
    note: 'A yield move you have not split is uninterpretable — see Chapter C for the real/inflation halves. Four of the five findings below are null: this chapter describes the curve, and almost everything people claim FOLLOWS from it was tested here and closed.',
  },
  {
    key: 'B', name: 'Policy path', built: true,
    blurb: 'What the market has priced for the front end. The 2-year is almost entirely a vote on the central bank between now and then.',
    members: [
      { key: 'y1', label: '1Y', unit: 'bp' }, { key: 'y2', label: '2Y', unit: 'bp' },
      { key: 'y3', label: '3Y', unit: 'bp' }, { key: 'm3', label: '3M', unit: 'bp' },
    ],
    receipts: ['y2', 'y1'],
    evidence: ['front-end-shock', 'priced-in', 'post-fomc-usd-drift', 'fed-two-moves', 'event-impact-map'],
    note: 'The front end is a vote on the next meetings; the long end is not. Both move on a policy day and only one is about policy.',
  },
  {
    key: 'C', name: 'Real yields', built: true,
    blurb: 'Nominal = real + breakeven. The two halves mean opposite things for gold and for anything whose profits sit far in the future.',
    members: [
      { key: 'real5', label: '5Y real', unit: 'bp' }, { key: 'real10', label: '10Y real', unit: 'bp' },
      { key: 'bei5', label: '5Y breakeven', unit: 'bp' }, { key: 'bei10', label: '10Y breakeven', unit: 'bp' },
    ],
    receipts: ['real10', 'bei10'],
    evidence: ['fear-gold', 'which-gold', 'oil-to-breakevens', 'yields-to-fx-direction'],
    note: 'Real yield up is money genuinely dearer. Breakeven up is not a tightening at all. The split is arithmetic and holds; what was tested and came back null is everything claimed to follow from it.',
  },
  {
    key: 'D', name: 'Inflation complex', built: true,
    blurb: 'What has printed, and what the market expects next — the three breakevens are the forward half.',
    members: [
      { key: 'bei5', label: '5Y breakeven', unit: 'bp' }, { key: 'bei10', label: '10Y breakeven', unit: 'bp' },
      { key: 'bei5y5y', label: '5y5y forward', unit: 'bp' }, { key: 'cpi', label: 'CPI', unit: 'idx' },
      { key: 'coreCpi', label: 'Core CPI', unit: 'idx' }, { key: 'corePce', label: 'Core PCE', unit: 'idx' },
      { key: 'ppi', label: 'PPI final demand', unit: 'idx' }, { key: 'ahe', label: 'average hourly earnings', unit: 'idx' },
    ],
    receipts: ['bei5', 'bei10', 'bei5y5y'],
    evidence: ['oil-to-breakevens', 'surprise-size', 'front-end-shock'],
    note: 'A breakeven that moves while the real yield does not is the market changing its mind about prices, not about policy. Note the nulls below — oil reaching breakevens has no lag here, and a quiet breakeven beside a big oil move is disagreement rather than delay.',
  },
  {
    key: 'E', name: 'Growth', built: true,
    blurb: 'The growth side of the two-axis read. Copper against gold is the cleanest daily proxy this board holds.',
    members: [
      { key: 'copper', label: 'Copper', unit: 'pct' }, { key: 'oil', label: 'Crude', unit: 'pct' },
    ],
    receipts: ['copper'],
    evidence: ['dr-copper', 'nq-down-week', 'rotation-extreme', 'nowcast-gap-gdp'],
    note: 'Copper is a growth DESCRIPTION here. "Dr Copper" as a recession call was tested and the strong form is falsified.',
  },
  {
    key: 'F', name: 'Labour', built: false,
    blurb: 'The employment side — the input central banks say they weight most, and the one with the longest revision tail.',
    members: [{ key: 'ahe', label: 'average hourly earnings', unit: 'idx' }],
    receipts: ['ahe'],
    evidence: ['surprise-size', 'event-impact-map'],
    note: 'Payrolls move a 30-minute window hard and a week barely at all — see the Event Response Book for the measured sizes.',
  },
  {
    key: 'G', name: 'Liquidity', built: false,
    blurb: 'Net liquidity: the Fed balance sheet less the Treasury account and reverse repo. The tide everything else floats on, allegedly.',
    members: [],
    receipts: [],
    evidence: ['repo-stress-range', 'stock-bond-flip', 'month-end-rebalance'],
    note: 'Read this chapter with its verdict in view: this desk\'s own G1 test put all three OOS hit rates inside the 48-52% null band.',
  },
  {
    key: 'H', name: 'Credit', built: true,
    blurb: 'Where in the capital structure the repricing is. Lenders price the odds of not being repaid, which is a harder question than what a share is worth.',
    members: [
      { key: 'hy', label: 'High yield', unit: 'bp' }, { key: 'ig', label: 'Investment grade', unit: 'bp' },
      { key: 'ccc', label: 'CCC', unit: 'bp' },
    ],
    receipts: ['hy', 'ig', 'ccc'],
    evidence: ['mv-creditstack-range', 'stock-bond-flip', 'breadth-all-down'],
    note: 'IG sits above high yield and CCC below it, so the three together say WHERE the stress is — which high yield alone cannot.',
  },
  {
    key: 'I', name: 'FX & carry', built: true,
    blurb: 'The dollar as the unit everything else is priced in, and the rate differentials behind the majors.',
    members: [
      { key: 'dxy', label: 'Broad dollar', unit: 'pct' }, { key: 'y2', label: 'US 2Y', unit: 'bp' },
    ],
    receipts: ['dxy'],
    evidence: ['yield-spread-sleeve', 'multi-spread-sleeve', 'yields-to-fx-direction', 'spread-leads-fx-hours', 'reversal-hour'],
    note: 'The one validated directional sleeve on this desk trades the SPREAD\'s mean-reversion, not the level of rates.',
  },
  {
    key: 'J', name: 'Commodities', built: true,
    blurb: 'Oil, copper and gold — growth, inflation and the reserve asset, all priced in the same dollar.',
    members: [
      { key: 'oil', label: 'Crude', unit: 'pct' }, { key: 'copper', label: 'Copper', unit: 'pct' },
      { key: 'gold', label: 'Gold', unit: 'pct' },
    ],
    receipts: ['oil', 'gold', 'copper'],
    evidence: ['oil-to-breakevens', 'crack-inflation-channel', 'crack-blowout-range', 'which-gold', 'fear-gold', 'dr-copper'],
    note: 'Gold is four trades wearing one name, and the fear one tested null here. Most of this chapter is closed findings: read it as a description of what commodities are doing, not as a set of signals.',
  },
  {
    key: 'K', name: 'Positioning', built: false,
    blurb: 'Where the crowd already sits — COT percentiles and the options book.',
    members: [],
    receipts: [],
    evidence: ['oi-max-pain', 'squeeze-fuel', 'crowded-bond-short-fomc', 'conviction-vote'],
    note: 'Four of the five findings here are null. Positioning says which way a surprise would hurt more; it has never said which way price goes.',
  },
  {
    key: 'L', name: 'Volatility', built: true,
    blurb: 'What the market is charging for insurance, and how that compares with what it has actually delivered.',
    members: [
      { key: 'vix', label: 'VIX', unit: 'pct' }, { key: 'vix3m', label: 'VIX 3M', unit: 'pct' },
      { key: 'ovx', label: 'Oil vol', unit: 'pct' }, { key: 'gvz', label: 'Gold vol', unit: 'pct' },
    ],
    receipts: ['vix', 'vix3m'],
    evidence: ['vix-inversion', 'mv-vixterm-range', 'iv-over-rv-wider', 'dispersion-crowded-week', 'dispersion-reset', 'mv-dispersion-range'],
    note: 'Every result here is about RANGE. Not one of them says which way anything goes.',
  },
];

export const chapterFor = key => CHAPTERS.find(c => c.key === key) ?? null;
export const builtChapters = () => CHAPTERS.filter(c => c.built);

/** Every series key any built chapter needs — what /api/chapters has to supply. */
export const requiredSeries = () => [...new Set(
  builtChapters().flatMap(c => [...c.members.map(m => m.key), ...c.receipts])
)].sort();
