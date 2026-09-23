/**
 * The market scan — a board this wide is unreadable, so the page reads it for you.
 *
 * WHAT CHANGED, AND WHY (2026-09-23). The first version of this file scored every
 * series independently and ranked by z. That is a leaderboard, not a market view:
 * a z-score is a MAGNITUDE, so it can only ever answer "what moved most", never
 * "what does not fit together". The board could show the 2-year up 52bp, the
 * 30-year up 6bp, breakevens flat with crude up 14%, and gold down 6% — a complete,
 * coherent macro story — and the page would say "US 2-year is rare".
 *
 * So the primary object here is now the LINK, not the tile. Every link is a pair of
 * markets that normally move together (or against each other); each is scored by how
 * far TODAY sits from how those two have actually related over the last three years.
 * The tiles are the evidence underneath.
 *
 * HOW A LINK IS SCORED. For markets A and B, take the 20-session change of each,
 * standardise both against the trailing window so units cancel, fit the slope of B
 * on A over that window, and measure today's residual against the spread of past
 * residuals. Big residual = the two are further apart than they normally get. The
 * fit uses data up to YESTERDAY, so today never sets its own baseline.
 *
 * WHAT THE NUMBER IS NOT. Twenty-session windows overlap, so consecutive residuals
 * are heavily autocorrelated and a "z of 2" here is NOT a one-in-forty event. It is
 * a descriptive distance, and every link also carries `pct` — the plain share of
 * past days whose gap was smaller — which is the honest way to read it.
 *
 * And rarity is still not a forecast. Nothing in this file claims direction. The
 * forward claims on this desk live in the evidence book with their intervals.
 *
 * Pure: no fetch, no DOM. Tested in js/marketScan.test.mjs.
 */

/** The board. `kind` decides the unit and how a move is expressed. */
export const BOARD = [
  // ── rates: the discount rate everything else is priced off ──────────────────
  { key: 'us2y',    label: 'US 2-year',     group: 'Rates', kind: 'rate', what: 'The market’s vote on what the Fed does over the next year or two.' },
  { key: 'us5y',    label: 'US 5-year',     group: 'Rates', kind: 'rate', what: 'The belly of the curve — where a policy view turns into a growth view.' },
  { key: 'us10y',   label: 'US 10-year',    group: 'Rates', kind: 'rate', what: 'The world’s discount rate: real yield plus expected inflation.' },
  { key: 'us30y',   label: 'US 30-year',    group: 'Rates', kind: 'rate', what: 'The vote on inflation credibility and how much the government must borrow.' },
  { key: 'tips',    label: 'Real 10-year',  group: 'Rates', kind: 'rate', what: 'The true cost of money once inflation is taken out. The most connected number on the board.' },
  { key: 'bei',     label: 'Breakevens',    group: 'Rates', kind: 'rate', what: 'What the bond market expects inflation to average over ten years.' },
  { key: 'curve',   label: '2s10s curve',   group: 'Rates', kind: 'gap', what: 'Ten-year minus two-year. Steepening = the long end leading; flattening = the Fed leading.', derived: (v) => (v.us10y != null && v.us2y != null) ? v.us10y - v.us2y : null },
  { key: 'realshare', label: 'Real vs inflation', group: 'Rates', kind: 'gap', what: 'Real yield minus breakevens. Says whether a move in the 10-year is a GROWTH/policy move or an INFLATION move — the single most useful split on this board.', derived: (v) => (v.tips != null && v.bei != null) ? v.tips - v.bei : null },
  { key: 'giltgap', label: 'Gilt − UST',    group: 'Rates', kind: 'gap', what: 'UK yields against US. Who is repricing faster — the pound’s rate leg.' },
  { key: 'bundgap', label: 'Bund − UST',    group: 'Rates', kind: 'gap', what: 'German against US. The euro’s rate leg, and the tightest of the three.' },
  { key: 'jgbgap',  label: 'JGB − UST',     group: 'Rates', kind: 'gap', what: 'Japanese against US. The carry-unwind channel and the yen’s rate leg.' },
  // ── credit: lenders vote before shareholders do ─────────────────────────────
  { key: 'ig',      label: 'Investment-grade OAS', group: 'Credit & fear', kind: 'rate', what: 'What the safest corporate borrowers pay over Treasuries. Moves here are about the SYSTEM, not one bad company.' },
  { key: 'hy',      label: 'High-yield OAS',       group: 'Credit & fear', kind: 'rate', what: 'What junk borrowers pay over Treasuries. Lenders vote here before equity does.' },
  { key: 'ccc',     label: 'CCC OAS',              group: 'Credit & fear', kind: 'rate', what: 'The bottom of the credit stack. It cracks first and hardest, so it leads high-yield the way high-yield leads equity.' },
  { key: 'vix',     label: 'VIX',                  group: 'Credit & fear', kind: 'level', what: 'The price of thirty days of insurance on the S&P.' },
  { key: 'vix9d',   label: 'VIX 9-day',            group: 'Credit & fear', kind: 'level', what: 'Insurance for the next nine days. Above the VIX means the fear is about something on the calendar THIS WEEK.' },
  { key: 'vix3m',   label: 'VIX 3-month',          group: 'Credit & fear', kind: 'level', what: 'Three-month insurance. Normally the dearest of the three, because more can go wrong in more time.' },
  { key: 'vixterm', label: 'VIX term structure',   group: 'Credit & fear', kind: 'level', what: 'Three-month VIX minus spot VIX. Normally positive; when it goes NEGATIVE the market is paying more to be covered now than later, which is what a real scare looks like.', derived: (v) => (v.vix3m != null && v.vix != null) ? v.vix3m - v.vix : null },
  { key: 'vvix',    label: 'VVIX',                 group: 'Credit & fear', kind: 'level', what: 'The volatility OF volatility — what it costs to hedge the hedge. Rises when people are buying protection in a hurry.' },
  { key: 'skew',    label: 'SKEW',                 group: 'Credit & fear', kind: 'level', what: 'What deep out-of-the-money puts cost relative to at-the-money. High means the tail is being bid — often quietly, while the VIX sits still.' },
  { key: 'dspx',    label: 'Dispersion',           group: 'Credit & fear', kind: 'level', what: 'CBOE’s Dispersion Index: how much more expensive single-name volatility is than the index’s. High means the index looks calm while its constituents do not — the shape of a market crowded into one trade.' },
  // ── FX ──────────────────────────────────────────────────────────────────────
  { key: 'dxy',     label: 'Broad dollar',  group: 'FX', kind: 'price', what: 'The price of the unit everything else is quoted in.' },
  { key: 'eurusd',  label: 'EUR/USD',       group: 'FX', kind: 'price', what: 'The biggest pair — mostly the dollar, partly the Bund gap.' },
  { key: 'gbpusd',  label: 'GBP/USD',       group: 'FX', kind: 'price', what: 'The pound. Its rate leg is the weakest of the three on this board.' },
  { key: 'usdjpy',  label: 'USD/JPY',       group: 'FX', kind: 'price', what: 'The haven pair and the carry trade’s home.' },
  { key: 'usdchf',  label: 'USD/CHF',       group: 'FX', kind: 'price', what: 'The other haven. When it disagrees with the yen, the move is about Japan rather than about fear.' },
  { key: 'audusd',  label: 'AUD/USD',       group: 'FX', kind: 'price', what: 'The China-and-metals proxy.' },
  { key: 'nzdusd',  label: 'NZD/USD',       group: 'FX', kind: 'price', what: 'Australia’s smaller cousin — the two diverge on rates, not on China.' },
  { key: 'usdcad',  label: 'USD/CAD',       group: 'FX', kind: 'price', what: 'Canada exports oil, so this one has a commodity leg.' },
  { key: 'eurgbp',  label: 'EUR/GBP',       group: 'FX', kind: 'price', what: 'Europe against Britain with the dollar taken out — the clean read on the gilt-versus-Bund argument.' },
  { key: 'eurjpy',  label: 'EUR/JPY',       group: 'FX', kind: 'price', what: 'The purest carry cross on the board: no dollar in it, so it is risk appetite and the JGB leg alone.' },
  { key: 'audjpy',  label: 'AUD/JPY',       group: 'FX', kind: 'price', what: 'The classic risk barometer in FX — a growth currency funded in the cheapest one.' },
  // ── equities: two indices was not a market view ─────────────────────────────
  { key: 'spx',     label: 'S&P 500',       group: 'Equities', kind: 'price', what: 'The broad benchmark — less duration than the Nasdaq, so slower to answer real yields.' },
  { key: 'nq',      label: 'Nasdaq',        group: 'Equities', kind: 'price', what: 'Long-duration equity: its earnings sit far out, so a real-yield move discounts them hardest.' },
  { key: 'r2k',     label: 'Russell 2000',  group: 'Equities', kind: 'price', what: 'Small, domestic, and indebted at floating rates. It answers the 2-year rather than the 30-year, and it is the honest read on the actual US economy.' },
  { key: 'breadth', label: 'Russell − Nasdaq', group: 'Equities', kind: 'level', what: 'Small caps against big tech over twenty sessions. Deeply negative means the index is being carried by a handful of names — the concentration the Dispersion Index prices.', pairPct: ['r2k', 'nq'] },
  { key: 'de30',    label: 'DAX',           group: 'Equities', kind: 'price', what: 'Europe’s industrial index. Against the S&P it says whether a move is American or global.' },
  { key: 'uk100',   label: 'FTSE 100',      group: 'Equities', kind: 'price', what: 'Barely a UK index — commodities and overseas earners, so it often tracks crude and a weak pound.' },
  { key: 'jp225',   label: 'Nikkei',        group: 'Equities', kind: 'price', what: 'Japan’s index, and the yen’s mirror: a weaker yen flatters it mechanically.' },
  // ── commodities ─────────────────────────────────────────────────────────────
  { key: 'oil',     label: 'Crude (WTI)',   group: 'Commodities', kind: 'price', what: 'The first domino in the inflation chain.' },
  { key: 'brent',   label: 'Brent',         group: 'Commodities', kind: 'price', what: 'The global crude benchmark. Its gap to WTI is a US-supply story rather than a demand one.' },
  { key: 'crack',   label: 'Crack spread',  group: 'Commodities', kind: 'usd', what: 'A refiner’s margin. Says whether the pump price follows crude down.' },
  { key: 'natgas',  label: 'Natural gas',   group: 'Commodities', kind: 'price', what: 'Weather and storage far more than macro — which is exactly why it earns a tile: when it moves with everything else, the move is not about commodities.' },
  { key: 'gold',    label: 'Gold',          group: 'Commodities', kind: 'price', what: 'Four different trades wearing one name — rates, dollar, reserve, fear.' },
  { key: 'silver',  label: 'Silver',        group: 'Commodities', kind: 'price', what: 'Gold with an industrial leg and half the liquidity, so it overshoots gold in both directions.' },
  { key: 'platinum',label: 'Platinum',      group: 'Commodities', kind: 'price', what: 'The most industrial precious metal. When it leads gold, the bid is about factories rather than fear.' },
  { key: 'copper',  label: 'Copper',        group: 'Commodities', kind: 'price', what: 'The growth commodity: up with global demand, down with a scare.' },
  { key: 'ovx',     label: 'Crude vol',     group: 'Commodities', kind: 'level', what: 'CBOE’s OVX — the VIX of oil. Read it against the VIX: oil pricing far more fear than equities means the risk is a supply story, not an economic one.' },
  { key: 'gvz',     label: 'Gold vol',      group: 'Commodities', kind: 'level', what: 'CBOE’s GVZ — the VIX of gold. It rises with genuine reserve and currency stress rather than with equity drawdowns.' },
  // ── crypto ──────────────────────────────────────────────────────────────────
  { key: 'btc',     label: 'Bitcoin',       group: 'Crypto', kind: 'price', what: 'High-beta risk most days; the anti-dollar trade on the days the dollar story is about credibility.' },
];

/**
 * The LINKS. Each is a pair of markets with a mechanism, written cause → effect.
 *
 * `expect` is what the textbook says the sign should be; the scan checks that against
 * what the last three years ACTUALLY did, which is a teaching moment in itself when
 * the two disagree.
 *
 * `normally` is the mechanism in one sentence. `apart` is what it means when the two
 * are further apart than usual — written as a QUESTION to go and answer, never as a
 * prediction, because this desk has tested what happens after a link breaks (S5) and
 * the answer is that neither leg is reliably the one that corrects.
 */
export const LINKS = [
  { id: 'tips-gold', a: 'tips', b: 'gold', expect: -1,
    normally: 'Gold pays no interest, so when the real yield on a Treasury rises, holding gold costs more and gold falls. This is the cleanest mechanical link on the board.',
    apart: 'Gold is being bought or sold for one of its other three reasons — the dollar, central-bank reserve buying, or fear — rather than for rates. Which one is the question: the dollar tile and the gold-vol tile answer it.' },
  { id: 'tips-nq', a: 'tips', b: 'nq', expect: -1,
    normally: 'The Nasdaq’s earnings sit far in the future, so they are discounted back at the real rate. A higher real yield mechanically lowers what those distant earnings are worth today.',
    apart: 'Either the growth story has changed enough to outrun the discount rate, or the index is being carried by a few names rather than by the market. The Russell-minus-Nasdaq tile separates those two.' },
  { id: 'oil-bei', a: 'oil', b: 'bei', expect: +1,
    normally: 'Crude feeds straight into headline inflation, so the bond market’s ten-year inflation expectation usually moves with it.',
    apart: 'The bond market is treating the oil move as temporary — a supply event rather than a demand one — or is looking through it entirely. Tested here: there is no lag in this link, so if breakevens have not moved today they are not going to move tomorrow.' },
  { id: 'us2y-r2k', a: 'us2y', b: 'r2k', expect: -1,
    normally: 'Small caps carry floating-rate debt and borrow domestically, so the 2-year is their actual cost of funding. They feel the Fed before anyone else does.',
    apart: 'The market is pricing something for small caps — tax, tariffs, domestic demand — that outweighs their funding cost. This is the link to watch when the front end moves and the big indices shrug.' },
  { id: 'hy-spx', a: 'hy', b: 'spx', expect: -1,
    normally: 'Lenders price the odds of not being repaid, which is a harder and earlier question than what a share is worth. Credit usually moves first.',
    apart: 'One of the two is wrong and this desk cannot tell you which. Credit widening that equity ignores is the configuration worth being sceptical about; the reverse is usually an equity-specific event.' },
  { id: 'ccc-hy', a: 'ccc', b: 'hy', expect: +1,
    normally: 'The bottom of the credit stack moves with the rest of it, only more so. CCC is high-yield with the volume turned up.',
    apart: 'When CCC moves and high-yield does not, the stress is isolated to the weakest borrowers — a sector, or a handful of names. When both move together, it is the system.' },
  { id: 'vix-spx', a: 'vix', b: 'spx', expect: -1,
    normally: 'The VIX is the price of insurance on the S&P, and insurance gets dearer as the thing it covers falls.',
    apart: 'The VIX rising without the index falling means protection is being bought ahead of something — a date on the calendar, an expiry, a position being hedged rather than sold.' },
  { id: 'vix-ovx', a: 'vix', b: 'ovx', expect: +1,
    normally: 'Both are the price of fear, and most macro shocks frighten oil and equities together.',
    apart: 'The fear is specific to one of them. Oil vol far above equity vol is a supply or geopolitical story that the wider economy is not being asked to pay for — yet.' },
  { id: 'copper-audusd', a: 'copper', b: 'audusd', expect: +1,
    normally: 'Australia digs up and sells industrial metal, so its currency is a liquid proxy for Chinese demand.',
    apart: 'The Australian dollar is being traded on rates or on the broad dollar rather than on growth. Check whether NZD/USD went with it — if it did, it is a rates story, not a China one.' },
  { id: 'oil-usdcad', a: 'oil', b: 'usdcad', expect: -1,
    normally: 'Canada exports oil, so a higher crude price strengthens the Canadian dollar, which pushes USD/CAD down.',
    apart: 'The dollar leg is dominating the oil leg. USD/CAD is the pair where those two forces are most evenly matched, so it comes apart more often than the others here.' },
  { id: 'dxy-gold', a: 'dxy', b: 'gold', expect: -1,
    normally: 'Gold is priced in dollars, so a stronger dollar buys more of it and the price falls. Partly mechanical, partly a real competition for reserve money.',
    apart: 'Gold rising WITH the dollar is the configuration that matters: it usually means both are being bought as havens at once, which is a different market from either one moving alone.' },
  { id: 'dxy-btc', a: 'dxy', b: 'btc', expect: -1,
    normally: 'Bitcoin trades as high-beta risk, and risk generally does worse when the dollar is bid.',
    apart: 'This is the loosest link on the board and it comes apart constantly — which is itself the lesson. Treat a break here as close to meaningless unless the rest of the risk complex agrees with it.' },
  { id: 'jgbgap-usdjpy', a: 'jgbgap', b: 'usdjpy', expect: -1,
    normally: 'The gap between Japanese and US yields is what you are paid to be short the yen. Narrow the gap and the carry trade pays less, so the yen strengthens and USD/JPY falls.',
    apart: 'The yen is moving on intervention risk, on risk appetite, or on a position unwind rather than on rates. EUR/JPY tells you which — if it moved too, it is the yen; if it did not, it is the dollar.' },
  { id: 'bundgap-eurusd', a: 'bundgap', b: 'eurusd', expect: +1,
    normally: 'Euro assets pay more relative to US ones as the Bund-to-Treasury gap narrows, and money follows the yield.',
    apart: 'The euro is being driven by something other than rates — growth, energy, or politics. EUR/GBP strips the dollar out and says whether this is a euro story or a dollar story.' },
  { id: 'giltgap-gbpusd', a: 'giltgap', b: 'gbpusd', expect: +1,
    normally: 'Higher UK yields relative to US ones should attract money into sterling.',
    apart: 'Gilts selling off WITHOUT the pound rising is the configuration that matters here — it is what a market demanding a risk premium from a government looks like, rather than an ordinary rate rise.' },
  { id: 'spx-de30', a: 'spx', b: 'de30', expect: +1,
    normally: 'Global equity risk appetite moves the big indices together most of the time.',
    apart: 'The move is regional rather than global. A divergence here says whether you are looking at an American story or a worldwide one, which changes whose calendar matters this week.' },
  { id: 'usdjpy-jp225', a: 'usdjpy', b: 'jp225', expect: +1,
    normally: 'A weaker yen flatters Japanese exporters’ earnings in yen terms, so the Nikkei and USD/JPY move together almost mechanically.',
    apart: 'A rare and informative break: the Nikkei rising on a STRONGER yen means domestic demand is doing the work, which is the thing Japan has spent thirty years trying to achieve.' },
  { id: 'gold-silver', a: 'gold', b: 'silver', expect: +1,
    normally: 'Silver is gold with an industrial leg and half the liquidity, so it exaggerates whatever gold does.',
    apart: 'Silver lagging a gold rally means the bid is monetary — reserves and fear — rather than industrial. Silver leading means the opposite.' },
  { id: 'vix-hy', a: 'vix', b: 'hy', expect: +1,
    normally: 'Equity fear and credit fear are two prices for the same underlying worry about the economy.',
    apart: 'An equity scare that credit ignores is usually about equity itself — positioning, hedging demand, an expiry — rather than about the economy.' },
  { id: 'r2k-nq', a: 'r2k', b: 'nq', expect: +1,
    normally: 'Both are equity, so both usually rise and fall with risk appetite.',
    apart: 'This is the breadth question. Big tech running while small caps do not is a market being carried by a few names — the concentration that the Dispersion Index prices and that an index hedge does not cover.' },
];

const WINDOW = 20, HIST = 750;                      // 20 sessions, ranked against ~3 years
const MIN_HIST = 60;                                // below this there is nothing to rank against
const WEAK_CORR = 0.2;                              // a link this loose has nothing to break

const val = (b, key, i) => b?.series?.[key]?.[i] ?? null;
const rowAt = (b, i) => { const v = {}; for (const k of Object.keys(b?.series ?? {})) v[k] = val(b, k, i); return v; };

/** A spec's value at index i, whether it is a raw series or derived from several. */
function specVal(b, spec, i) {
  return spec?.derived ? spec.derived(rowAt(b, i)) : val(b, spec.key, i);
}

/** The 20-session change of a spec at index i, in that spec's own unit. */
function change(b, spec, i, WIN = WINDOW) {
  // A `pairPct` row is ITSELF a difference of two percentage changes (small caps
  // against big tech), so it is built from its two legs rather than differenced —
  // subtracting two index levels in different units would be meaningless.
  if (spec?.pairPct) {
    const [x, y] = spec.pairPct;
    const nx = val(b, x, i), tx = val(b, x, i - WIN), ny = val(b, y, i), ty = val(b, y, i - WIN);
    if (nx == null || tx == null || ny == null || ty == null || tx === 0 || ty === 0) return null;
    return (nx / tx - 1) * 100 - (ny / ty - 1) * 100;
  }
  const now = specVal(b, spec, i), then = specVal(b, spec, i - WIN);
  if (now == null || then == null) return null;
  if (spec.kind === 'price') return then !== 0 ? (now / then - 1) * 100 : null;
  if (spec.kind === 'rate' || spec.kind === 'gap') return (now - then) * 100;   // percent -> bp, once
  return now - then;                                 // level, usd
}

/** z of the latest 20-session change against its own history of 20-session changes. */
export function scoreSeries(bundle, spec, i, WIN = WINDOW) {
  const hist = [];
  for (let k = Math.max(WIN, i - HIST); k <= i; k++) { const c = change(bundle, spec, k, WIN); if (c != null) hist.push(c); }
  if (hist.length < MIN_HIST) return null;
  const now = hist[hist.length - 1];
  const mean = hist.reduce((s, v) => s + v, 0) / hist.length;
  const sd = Math.sqrt(hist.reduce((s, v) => s + (v - mean) ** 2, 0) / hist.length);
  if (!(sd > 0)) return null;
  const sorted = hist.slice().sort((a, b) => a - b);
  const pct = sorted.filter(v => v <= now).length / sorted.length;
  // FRED skips US holidays and OANDA does not, so the newest date can be blank
  // for a rates row -- walk back to the last real print rather than showing a dash
  let last = null;
  if (spec.pairPct) last = now;                      // a spread row's "level" IS its move
  else for (let j = i; j > i - 10 && j >= 0; j--) { const v = specVal(bundle, spec, j); if (v != null) { last = v; break; } }
  return { key: spec.key, label: spec.label, group: spec.group, kind: spec.kind, what: spec.what,
           last, change: now, z: (now - mean) / sd, pct, n: hist.length };
}

/** The whole board, scored. */
export function scanBoard(bundle, i = (bundle?.dates?.length ?? 1) - 1, WIN = WINDOW) {
  return BOARD.map(s => scoreSeries(bundle, s, i, WIN)).filter(Boolean).map(r => ({ ...r, window: WIN }));
}

/**
 * How the board splits, in one line of counts.
 *
 * A move over one session and the same move over a month are different questions, and
 * the board was stuck answering only the month. `windows` are the ones the page offers.
 */
export const WINDOWS = [{ n: 1, label: '1 day' }, { n: 5, label: '1 week' }, { n: 20, label: '1 month' }];

/** Orientation before detail: how many things are unusual, and how many are noise. */
export function glance(board = [], scored = []) {
  const rare = board.filter(b => Math.abs(b.z) >= 2).length;
  const unusual = board.filter(b => Math.abs(b.z) >= 1.5 && Math.abs(b.z) < 2).length;
  const live = (scored ?? []).filter(l => !l.weak);
  return {
    rare, unusual,
    // a link is "apart" on the same threshold the findings use, so the count and the
    // headline can never disagree with one another
    apart: live.filter(l => Math.abs(l.z) >= 1.8).length,
    holding: live.filter(l => Math.abs(l.z) < 1.8).length,
    tooLoose: (scored ?? []).length - live.length,
    inside: board.filter(b => Math.abs(b.z) < 1.5).length,
    total: board.length,
  };
}

const SPEC = Object.fromEntries(BOARD.map(s => [s.key, s]));
const meanOf = x => x.reduce((s, v) => s + v, 0) / x.length;

/**
 * Score one link: how far today's pair of moves sits from how these two markets have
 * actually related over the trailing window.
 *
 * The fit deliberately EXCLUDES today (every `.slice(0, -1)` below) — a residual
 * measured against a baseline that today helped set is a smaller residual, which is
 * the standard way this kind of measure quietly talks itself out of its own findings.
 *
 * Both legs are standardised before the fit, so the slope IS the correlation. That is
 * deliberate: it makes `corr` directly comparable across links whose raw units are
 * basis points, percent and index points.
 */
export function scoreLink(bundle, link, i = (bundle?.dates?.length ?? 1) - 1, WIN = WINDOW) {
  const sa = SPEC[link.a], sb = SPEC[link.b];
  if (!sa || !sb) return null;
  const A = [], B = [];
  for (let k = Math.max(WIN, i - HIST); k <= i; k++) {
    const ca = change(bundle, sa, k, WIN), cb = change(bundle, sb, k, WIN);
    if (ca == null || cb == null) continue;
    A.push(ca); B.push(cb);
  }
  if (A.length < MIN_HIST) return null;
  const fa = A.slice(0, -1), fb = B.slice(0, -1);
  const ma = meanOf(fa), mb = meanOf(fb);
  const sda = Math.sqrt(meanOf(fa.map(v => (v - ma) ** 2))), sdb = Math.sqrt(meanOf(fb.map(v => (v - mb) ** 2)));
  if (!(sda > 0) || !(sdb > 0)) return null;
  const za = A.map(v => (v - ma) / sda), zb = B.map(v => (v - mb) / sdb);
  const zfa = za.slice(0, -1), zfb = zb.slice(0, -1);
  let sxy = 0, sxx = 0;
  for (let k = 0; k < zfa.length; k++) { sxy += zfa[k] * zfb[k]; sxx += zfa[k] * zfa[k]; }
  if (!(sxx > 0)) return null;
  const beta = sxy / sxx;
  const resid = zb.map((v, k) => v - beta * za[k]);
  const fitResid = resid.slice(0, -1);
  const sdr = Math.sqrt(meanOf(fitResid.map(v => v ** 2)));
  if (!(sdr > 0)) return null;
  const now = resid[resid.length - 1];
  const sorted = fitResid.map(Math.abs).sort((x, y) => x - y);
  return {
    id: link.id, a: link.a, b: link.b, expect: link.expect, normally: link.normally, apart: link.apart,
    labelA: sa.label, labelB: sb.label,
    corr: beta, agrees: Math.sign(beta) === Math.sign(link.expect), weak: Math.abs(beta) < WEAK_CORR,
    resid: now, z: now / sdr,
    // the honest reading: the plain share of past days whose gap was smaller than today's
    pct: sorted.filter(v => v <= Math.abs(now)).length / sorted.length,
    n: A.length,
    // each leg's own move, so the page can show WHICH one is out of line
    moveA: A[A.length - 1], moveB: B[B.length - 1], kindA: sa.kind, kindB: sb.kind,
  };
}

/** Every link, scored, most dislocated first. */
export function scanLinks(bundle, i = (bundle?.dates?.length ?? 1) - 1, WIN = WINDOW) {
  return LINKS.map(l => scoreLink(bundle, l, i, WIN)).filter(Boolean).sort((x, y) => Math.abs(y.z) - Math.abs(x.z));
}

const fmtUnit = (v, kind) => {
  if (v == null) return '—';
  const s = v > 0 ? '+' : '';
  if (kind === 'price') return `${s}${v.toFixed(1)}%`;
  if (kind === 'usd') return `${v < 0 ? '-' : '+'}$${Math.abs(v).toFixed(0)}`;
  if (kind === 'level') return `${s}${v.toFixed(1)}`;
  return `${s}${Math.round(v)}bp`;
};

/**
 * What the reader should look at first, and what each one means.
 *
 * ORDER OF PRECEDENCE, and the reasoning. A DISLOCATION — two markets that normally
 * move together and today do not — outranks a big single number, because a big number
 * on its own is weather. An INVERTED link outranks both, because "the mechanism you
 * were taught is not the one operating in this sample" is a bigger fact about the
 * market than anything one session can show you.
 *
 * `links` are today's chain verdicts, kept as a separate input because they are
 * computed elsewhere against different rules; `scored` is scanLinks() output.
 */
export function findings(board = [], { links = [], limit = 3, scored = [] } = {}) {
  const by = k => board.find(b => b.key === k) ?? null;
  const out = [];
  const rare = z => Math.abs(z) >= 2 ? 'rare' : Math.abs(z) >= 1.5 ? 'unusual' : null;

  // 1. THE HEADLINE: links that have come apart. This is the market view.
  for (const L of (scored ?? []).filter(l => !l.weak && Math.abs(l.z) >= 1.8).slice(0, 2)) {
    const together = L.corr > 0 ? 'together' : 'in opposite directions';
    const bWord = Math.abs(L.moveB) < 0.05 ? 'has barely moved' : `is ${fmtUnit(L.moveB, L.kindB)}`;
    out.push({
      kind: 'dislocation', key: L.id, rank: 10 + Math.abs(L.z), z: L.z,
      title: `${L.labelA} and ${L.labelB} have come apart`,
      seen: `${L.labelA} is ${fmtUnit(L.moveA, L.kindA)} over twenty sessions while ${L.labelB} ${bWord}. These two normally move ${together} (${Math.abs(L.corr).toFixed(2)} over the last three years); today they sit further apart than on ${Math.round(L.pct * 100)}% of the days in that window.`,
      means: `${L.normally} ${L.apart}`,
      notMeans: `It does not mean the gap closes, and it does not say which of the two is wrong. Tested here (S5): when a link breaks there is no tendency for either leg to be the one that corrects. Note too that twenty-session windows overlap heavily, so treat the percentage above as the real reading — it is a distance, not a one-in-forty event.`,
    });
  }

  // 2. A link that has INVERTED against the textbook across three full years. Rarer
  //    than a dislocation and a bigger deal: not "today is odd" but "the mechanism you
  //    were taught is not the one that has been operating".
  for (const L of (scored ?? []).filter(l => !l.weak && !l.agrees).slice(0, 1)) {
    out.push({ kind: 'inverted', key: L.id, rank: 6 + Math.abs(L.corr), z: L.corr,
      title: `${L.labelA} and ${L.labelB} have been the wrong way round`,
      seen: `The textbook says these two move ${L.expect > 0 ? 'together' : 'against each other'}. Over the last three years they have actually moved ${L.corr > 0 ? 'together' : 'against each other'} (${L.corr.toFixed(2)} across ${L.n} overlapping windows).`,
      means: `${L.normally} That mechanism has not been the one in charge over this sample — something else has been driving both legs and swamping it. This is worth more of your attention than any single day's move, because it changes which chart you should be reading.`,
      notMeans: 'It does not mean the textbook is wrong in general. Three years is one regime, and a relationship can hibernate for a whole cycle and come back. It means you should not lean on this particular link in this market right now.' });
  }

  // 3. What KIND of rate move this is — the real-versus-inflation split. This is the
  //    single most useful thing you can do with a bond move, and it is pure arithmetic.
  { const t = by('tips'), be = by('bei'), n = by('us10y');
    if (t && be && n && Math.abs(n.change) >= 15) {
      const denom = Math.abs(t.change) + Math.abs(be.change);
      const realShare = denom > 0 ? Math.abs(t.change) / denom : 0.5;
      const isReal = realShare >= 0.7, isInfl = realShare <= 0.3;
      if (isReal || isInfl) out.push({ kind: 'ratekind', key: 'realshare', rank: 5 + Math.abs(n.z),
        title: isReal ? 'This is a real-yield move, not an inflation move' : 'This is an inflation move, not a growth move',
        seen: `The 10-year is ${fmtChange(n)} over twenty sessions, and ${isReal
          ? `${Math.round(realShare * 100)}% of that is the REAL yield (${fmtChange(t)}), with breakevens only ${fmtChange(be)}`
          : `${Math.round((1 - realShare) * 100)}% of that is BREAKEVENS (${fmtChange(be)}), with the real yield only ${fmtChange(t)}`}.`,
        means: isReal
          ? 'A nominal yield is a real yield plus expected inflation, and splitting it is the most useful thing you can do with a bond move. Real means the market is repricing growth or policy — the genuine cost of money — and that is the leg gold, the Nasdaq and every long-duration asset actually answer to. If you only remember one habit from this page, make it this one.'
          : 'The market is repricing inflation rather than growth. That is a different trade: it hurts bonds without supporting the currency the way a real-yield rise does, and it is the configuration gold tends to like rather than dislike.',
        notMeans: 'The split describes what kind of move has already happened. It is not a forecast of the next one, and this desk has no tested forward claim from the real-versus-breakeven mix.' }); } }

  // 4. the single most extreme series — demoted, because a big number with nothing
  //    attached to it is weather, not a market view
  for (const b of board.slice().sort((x, y) => Math.abs(y.z) - Math.abs(x.z))) {
    const word = rare(b.z); if (!word) break;
    out.push({ kind: 'extreme', key: b.key, rank: 2 + Math.abs(b.z), title: `${b.label} is ${word}`,
      seen: `${b.label} has moved ${fmtChange(b)} over twenty sessions — ${b.z > 0 ? 'higher' : 'lower'} than ${Math.round((b.z > 0 ? b.pct : 1 - b.pct) * 100)}% of twenty-session moves in the last three years (z ${b.z >= 0 ? '+' : ''}${b.z.toFixed(1)}).`,
      means: `${b.what} A move this size in ${b.label.toLowerCase()} is the kind that reprices the things attached to it, so the question is what else on the board has followed and what has not — that is where the story usually is.`,
      notMeans: 'Rare is a measurement, not a forecast. A move being unusual says nothing about whether it continues, reverses or stalls — the only forward claims on this desk live in the evidence book, each with its interval.', z: b.z });
    break;
  }

  // 5. the VIX term structure inverting — a tested claim, so it may speak more firmly
  { const t = by('vixterm'), v = by('vix');
    if (t && t.last != null && t.last < 0) out.push({ kind: 'vixterm', key: 'vixterm', rank: 5.5,
      title: 'The VIX curve is inverted',
      seen: `Three-month VIX is ${Math.abs(t.last).toFixed(1)} points BELOW spot VIX${v && v.last != null ? ` (spot ${v.last.toFixed(1)})` : ''}.`,
      means: 'Normally the longer-dated contract costs more, because more can go wrong in three months than in one. When it inverts, the market is paying up to be covered RIGHT NOW — the difference between a live scare and a background worry.',
      notMeans: 'Validated on this desk for RANGE only: inversions precede wider sessions. It carries no direction — an inverted curve says the next few days are likely to be bigger, not which way they go.' }); }

  // 6. where in the credit stack the repricing is
  { const ig = by('ig'), hy = by('hy'), ccc = by('ccc');
    if (ig && hy && ccc && Math.max(Math.abs(ig.z), Math.abs(hy.z), Math.abs(ccc.z)) >= 1.5) {
      const deep = Math.abs(ccc.z) >= 1.5 && Math.abs(ig.z) < 1;
      out.push({ kind: 'creditstack', key: deep ? 'ccc' : 'ig', rank: 4 + Math.abs(ccc.z),
        title: deep ? 'The stress is at the bottom of the credit stack only' : 'The whole credit stack is moving',
        seen: `CCC ${fmtChange(ccc)} (z ${ccc.z.toFixed(1)}), high-yield ${fmtChange(hy)} (z ${hy.z.toFixed(1)}), investment-grade ${fmtChange(ig)} (z ${ig.z.toFixed(1)}).`,
        means: deep
          ? 'Weak borrowers repricing while the safest ones do not is a sector or single-name problem rather than a systemic one. It is the ordinary way a credit cycle begins, and it very often goes nowhere.'
          : 'When investment-grade moves with the rest, the market is repricing the cost of capital for everybody rather than worrying about particular borrowers. That is the version that reaches equities and the real economy.',
        notMeans: 'This desk has no tested credit-leads-equity effect. The stack tells you what KIND of credit move this is; it makes no claim about what equity does next.' }); } }

  // 7. a broken link on the chain — a mechanism failing rather than a big number
  { const broken = (links ?? []).filter(l => l.verdict === 'broken');
    if (broken.length) {
      const ends = {}; for (const l of broken) { ends[l.a?.label] = (ends[l.a?.label] ?? 0) + 1; ends[l.b?.label] = (ends[l.b?.label] ?? 0) + 1; }
      const common = Object.entries(ends).sort((a, b) => b[1] - a[1])[0];
      out.push({ kind: 'broken', key: 'chain', rank: 2 + broken.length,
        title: broken.length > 1 ? `${broken.length} textbook links are broken` : 'A textbook link is broken',
        seen: broken.slice(0, 3).map(l => `${l.a?.label} ${l.a?.text} but ${l.b?.label} ${l.b?.text}`).join('; ') + '.',
        means: broken.length > 1 && common && common[1] > 1
          ? `${common[0]} is an end of ${common[1]} of them, which usually means that market — not the several on the other side — is the one behaving unusually. Something not on this board is driving it.`
          : 'The usual driver is not what is moving the second market. That is the story worth going to find.',
        notMeans: 'It does not mean the link will resolve. Tested here (S5): when a link breaks there is no tendency for either leg to be the one that corrects.' }); } }

  // 8. dispersion: the index calm while its constituents are not
  { const d = by('dspx'), v = by('vix');
    if (d && d.last != null && (d.pct >= 0.85 || d.z >= 1.5)) out.push({ kind: 'dispersion', key: 'dspx', rank: 2.2 + Math.max(d.z, 0),
      title: 'The index looks calmer than the shares inside it',
      seen: `Dispersion is ${d.last.toFixed(1)}, ${Math.round(d.pct * 100)}% of its own readings since 2014${v && v.last != null ? `, with the VIX at ${v.last.toFixed(1)}` : ''}${d.change != null ? ` and the twenty-session change ${d.change > 0 ? 'up' : 'down'} ${Math.abs(d.change).toFixed(1)}` : ''}.`,
      means: 'Dispersion is the gap between what single-name options cost and what the index’s cost. It rises when money crowds into a few names: the individual shares get expensive to hedge while the index, whose constituents are pulling against each other, stays cheap. That combination — a calm index over a violently disagreeing market — is the state where an index hedge protects you least, because the thing that hurts you is concentration, not the market falling as a whole.',
      notMeans: 'It is NOT a crash signal, and the popular version of the claim is dead: tested here on 68 setups since 2014 (D1), a crowded market did NOT precede a wider week (+0.07 [-0.06, +0.23] on the S&P) and did not raise the odds of a violent day within it (33% against 30%). The next MONTH did run wider (+0.23 [+0.04, +0.51]), and that survives holding the VIX down — but it was a secondary window on a small count, so it is a reason to re-run, not to trade.' }); }

  // 9. the commodity complex disagreeing with itself
  { const o = by('oil'), c = by('crack'), b = by('bei');
    if (o && c && o.change <= -5 && c.z >= 1) out.push({ kind: 'crack', key: 'crack', rank: 2 + c.z, title: 'Crude is falling and the refining margin is not',
      seen: `Crude ${fmtChange(o)} while the crack spread ${fmtChange(c)} (z ${c.z.toFixed(1)})${b ? `, with breakevens ${fmtChange(b)}` : ''}.`,
      means: 'Crude and fuel are two markets. A wide crack means the pump price stays up even as crude falls — and this desk measured that inflation pricing does not take the relief either (+15bp of breakevens against the case where both fall).',
      notMeans: 'It is not a range fact and not a direction call on crude — both tested, both null. It changes what you expect from the next inflation print, not what you trade.' }); }

  // 10. nothing unusual is itself the finding, and the common one
  if (!out.length) out.push({ kind: 'quiet', key: null, rank: 0, title: 'Nothing on the board is unusual',
    seen: `The largest twenty-session move is ${board.length ? board.slice().sort((a, b) => Math.abs(b.z) - Math.abs(a.z))[0].label : '—'}, and even that is inside its normal range, with every textbook link on the board holding together.`,
    means: 'This is the correct read on most days, and it is worth saying out loud: the base case is that nothing macro is happening. A quiet board is when stories get invented.',
    notMeans: 'It does not mean the session will be small. Intraday range comes from the calendar and volatility clustering, not from the macro board being interesting.' });

  return out.sort((a, b) => b.rank - a.rank).slice(0, limit);
}

/** Format a scored row's move in its own unit. */
export function fmtChange(b) {
  if (!b || b.change == null) return '—';
  return fmtUnit(b.change, b.kind);
}
/** Format a scored row's level in its own unit. */
export function fmtLevel(b) {
  if (!b || b.last == null) return '—';
  if (b.kind === 'rate') return `${b.last.toFixed(2)}%`;
  if (b.kind === 'gap') return `${Math.round(b.last * 100)}bp`;      // carried in percent
  if (b.kind === 'usd') return `$${b.last.toFixed(0)}`;
  if (b.kind === 'level') return b.last.toFixed(1);
  return b.last >= 1000 ? b.last.toFixed(0) : b.last.toFixed(b.last < 10 ? 4 : 2);
}
