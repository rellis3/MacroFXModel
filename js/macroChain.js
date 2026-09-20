/**
 * The chain, today — Tier-1 brick.
 *
 * The textbook macro chain, one link at a time, with today's measured move at
 * both ends of every link and a verdict: is the link HOLDING (both ends moved,
 * in the direction the textbook says), BROKEN (both moved, the wrong way round),
 * QUIET (at least one end has not moved enough to say anything) or UNMEASURED
 * (a series is missing). The point is not prediction. It is the habit the page
 * exists to build: seeing that oil moved and asking, in order, what it did to
 * inflation expectations, to yields, to the real yield, to the dollar, to gold,
 * to the commodity currencies — and noticing where the textbook stopped working,
 * because the broken link is where the actual story is.
 *
 * Every input is a 20-day change (calendar-day window, via seriesDeltas — the
 * same rule the macro-change strip uses, so a "20d" here spans what a "20d"
 * there spans). Each node carries a noise floor below which it is "quiet": a
 * 2bp breakeven move is not a move, and a link cannot be judged on it.
 *
 * Pure: no fetch, no DOM. The page builds `vals` and renders; the AI prompt gets
 * the same links as text. Tested in js/macroChain.test.mjs.
 *
 * Evidence: ~ context. It explains; it does not predict. None of these links is
 * a validated signal in this repo, and several textbook links have already been
 * tested null as FORWARD predictors here (yields → FX, project_yield_asset_coupling).
 */

import { seriesDeltas } from './macroChange.js';

export const CHAIN_WINDOW_DAYS = 20;

// unit: how the 20d change is expressed. pct = percent change of a price;
// bp = change in a percent-quoted rate ×100; pt = change in a level.
// floor: the smallest 20d change that counts as "moved".
export const CHAIN_NODES = {
  oil:    { label: 'Oil (WTI)',                       unit: 'pct', floor: 3,   dp: 1, what: 'Front-month crude in dollars. Energy is the first domino: it is in every input cost and every headline inflation print.' },
  bei:    { label: 'Inflation expectations',          unit: 'bp',  floor: 5,   dp: 0, what: 'The 10-year breakeven (T10YIE): nominal yield minus the TIPS real yield. What the bond market is pricing for average inflation over ten years. Tested 2026-09-17: it moves in the SAME window as oil (correlation 0.37 at lag 0, 0.09 at 20 sessions); a quiet breakeven after an oil move is a verdict, not a delay.' },
  us2y:   { label: 'US 2Y yield',                     unit: 'bp',  floor: 8,   dp: 0, what: 'The two-year Treasury yield (DGS2): the market\u2019s vote on what the central bank does over the next couple of years. It moves first, and hardest, on policy.' },
  us30y:  { label: 'US 30Y yield',                    unit: 'bp',  floor: 8,   dp: 0, what: 'The thirty-year (DGS30): the vote on inflation and fiscal credibility over a generation. When it moves against the front end, that is the story.' },
  us10y:  { label: 'US 10Y yield',                    unit: 'bp',  floor: 8,   dp: 0, what: 'The nominal 10-year Treasury yield (DGS10). It is the real yield plus expected inflation, so a move in it always has a cause on one side or the other.' },
  real:   { label: 'Real yield (10Y TIPS)',           unit: 'bp',  floor: 8,   dp: 0, what: 'The inflation-adjusted 10-year (DFII10). The true cost of money. Gold, the dollar and long-duration assets answer to this, not to the nominal.' },
  dxy:    { label: 'Dollar (broad index)',            unit: 'pct', floor: 0.5, dp: 1, what: 'The Fed’s trade-weighted broad dollar (DTWEXBGS). Up = the dollar bought against everything.' },
  gold:   { label: 'Gold',                            unit: 'pct', floor: 2,   dp: 1, what: 'Gold pays nothing, so its textbook enemy is a rising real yield. It rallies into falling real yields, a weaker dollar, or a loss of faith in the people who set rates.' },
  copper: { label: 'Copper',                          unit: 'pct', floor: 3,   dp: 1, what: 'The growth commodity. Up with global demand, down with a growth scare. Reads alongside the commodity currencies.' },
  audusd: { label: 'AUD/USD',                         unit: 'pct', floor: 1,   dp: 1, what: 'The commodity currency the market uses as its China-and-metals proxy. Dollar up or copper down normally means AUD down.' },
  usdcad: { label: 'USD/CAD',                         unit: 'pct', floor: 1,   dp: 1, what: 'Canada exports oil, so dearer oil normally means a stronger CAD, which is USD/CAD DOWN.' },
  usdjpy: { label: 'USD/JPY',                         unit: 'pct', floor: 1,   dp: 1, what: 'The haven pair. Fear normally means the yen is bought — USD/JPY DOWN — as carry trades funded in yen are closed.' },
  vix:    { label: 'Fear gauge (VIX)',                unit: 'pt',  floor: 3,   dp: 1, what: 'S&P 500 implied volatility. The price of insurance against the next 30 days.' },
  hy:     { label: 'Credit spreads (HY)',             unit: 'bp',  floor: 15,  dp: 0, what: 'High-yield OAS: the extra yield junk borrowers pay over Treasuries. Widening = lenders want more compensation = stress.' },
  nq:     { label: 'Growth stocks (Nasdaq)',          unit: 'pct', floor: 2,   dp: 1, what: 'NAS100: the long-duration equity. Its earnings sit far in the future, so a higher real yield discounts them hardest. Tested here 2026-09-17: a Nasdaq DOWN-week widens the next session (~+0.2 ATR); the yield move itself predicts nothing.' },
  spx:    { label: 'Broad stocks (S&P 500)',          unit: 'pct', floor: 2,   dp: 1, what: 'SPX500: the broad, blend-not-growth benchmark. Less duration exposure than the Nasdaq, so it answers to the real yield more slowly and less — which is exactly why it can sit quiet (the "milk in the grocery store" read) while the chain upstream of it is genuinely moving. A quiet SPX does not mean a quiet market; check nq, dxy and gold before concluding nothing is happening. Not yet tested for forward predictability here (nq has been; see above) — a natural next pre-registration, not yet run.' },
  funding: { label: 'Funding (SOFR − floor)',       unit: 'bp',  floor: 5,   dp: 0, what: 'Overnight repo (SOFR) against the rate the Fed pays on reserves — the floor. Cash is plentiful when repo trades a few points under the floor; when it rises through it, someone is paying up for overnight money. The one plumbing number in the chain: funding stress bids the dollar and sells risk, in the textbook. Described, not tested (P1 registered 2026-09-20).' },
  btc:    { label: 'Bitcoin',                         unit: 'pct', floor: 5,   dp: 1, what: 'Trades most days as a high-beta risk asset and, on the days the dollar story is about credibility, as the last stop on the anti-dollar chain. The loosest link here.' },
};

// Each link: from → to, and the sign the textbook expects between the two moves.
// +1 = they move together, −1 = they move opposite. `holds` is the sentence for a
// link that is holding; `broken` has one sentence per direction of the FROM node,
// because "oil up, breakevens down" and "oil down, breakevens up" are different
// stories. Written to teach the mechanism, never to forecast.
// `short` names the link in three words for summaries. `punch` is the one-line
// version of each read, shown on the row; the full sentence sits behind a click.
// A twelve-row panel of three-line paragraphs was unreadable in practice.
export const CHAIN_LINKS = [
  {
    id: 'oil-bei',
    short: 'oil → inflation pricing',
    punch: { holds: 'Oil is reaching the bond market’s inflation pricing.', up: 'Oil up, inflation pricing flat — the bond market calls the oil move temporary.', down: 'Oil down but inflation pricing up — inflation is coming from somewhere else.' }, from: 'oil', to: 'bei', sign: +1,
    textbook: 'Dearer oil lifts inflation expectations',
    holds: 'Energy is feeding through to what the bond market expects for inflation — the first domino is doing its job.',
    broken: {
      up:   'Oil rose but inflation expectations did not follow. The market is treating the oil move as temporary, or something bigger — a growth scare, a policy stand — is pulling expectations the other way. Tested here: breakevens move with oil in the same window, not after it (only 43% of ±10% oil moves get 5bp of breakeven within 20 sessions), so this is the bond market’s call, not a lag.',
      down: 'Oil fell but inflation expectations rose anyway. Inflation is being priced from somewhere other than energy: wages, tariffs, fiscal, or doubt about the central bank.',
    },
  },
  {
    id: 'bei-us10y',
    short: 'inflation pricing → yields',
    punch: { holds: 'Yields rising with inflation pricing — partly an inflation move.', up: 'Inflation pricing up, yields down — real yields collapsing: the stagflation shape.', down: 'Inflation pricing down, yields up — real yields doing all the work: tighter money.' }, from: 'bei', to: 'us10y', sign: +1,
    textbook: 'Higher expected inflation pushes nominal yields up',
    holds: 'Nominal yields are moving with inflation expectations — the yield move is at least partly an inflation move.',
    broken: {
      up:   'Inflation expectations rose but the 10-year yield fell. Real yields must have fallen by more: the market is pricing easier policy or weaker growth even as it prices more inflation. That is the stagflation shape.',
      down: 'Inflation expectations fell but the 10-year yield rose. Real yields are doing all the work: this is a tighter-money or a term-premium move, not an inflation move.',
    },
  },
  {
    id: 'us10y-real',
    short: 'nominal → real yield',
    punch: { holds: 'Real yields moved with nominal — money is genuinely tighter or looser.', up: 'Nominal up, real down — the whole rise is inflation compensation; money is looser.', down: 'Nominal down, real up — money tighter in real terms despite the lower headline.' }, from: 'us10y', to: 'real', sign: +1,
    textbook: 'A nominal yield move is usually mostly a real-yield move',
    holds: 'The real yield moved with the nominal — the market is repricing the cost of money, not just inflation.',
    broken: {
      up:   'Nominal yields rose while real yields fell: the entire rise is inflation compensation. Money is not getting tighter in real terms — it is getting looser, which is why gold and commodities can rally into it.',
      down: 'Nominal yields fell while real yields rose: inflation expectations collapsed faster than yields did. Money is tighter in real terms even as the headline rate falls — a disinflation or growth-scare shape.',
    },
  },
  {
    id: 'us2y-us30y',
    short: 'front end \u2192 long end',
    punch: { holds: 'Long end following the front end \u2014 the curve believes the policy path.', up: '2-year up, 30-year down \u2192 hard flattening: the market thinks tightening bites before inflation does.', down: '2-year down, 30-year up \u2192 bear steepening on easing: credibility, not policy, is being priced.' },
    from: 'us2y', to: 'us30y', sign: +1,
    textbook: 'A front-end repricing pulls the long end with it',
    holds: 'The long end is following the front end \u2014 the whole curve is repricing the policy path, and the market believes it. Front end leading is the policy read; long end leading is the credibility read.',
    broken: {
      up:   'The front end sold off but the long end rallied: a hard flattening. The market thinks the tightening will bite growth, or break something, before it lets inflation through \u2014 the "policy mistake" shape. Dollar-supportive near term, growth-negative after.',
      down: 'The front end rallied but the long end sold off: bear steepening on easing. Investors want MORE compensation to lend long even as policy eases \u2014 fiscal or inflation-credibility doubt. This is the rates-crisis shape: policy easing that the bond market refuses to pass along.',
    },
  },
  {
    id: 'real-dxy',
    short: 'real yields → dollar',
    punch: { holds: 'Dollar following real yields — capital is being paid to come in.', up: 'Paid more to hold US assets, still not buying the dollar → risk premium, not carry.', down: 'Real yields down, dollar up → a safety bid, not a yield bid.' }, from: 'real', to: 'dxy', sign: +1,
    textbook: 'Higher real yields pull capital in and lift the dollar',
    holds: 'The dollar is following real yields — the carry version of a rate move. Capital is being paid to come in, and it is coming.',
    broken: {
      up:   'Real yields rose but the dollar fell. Investors are demanding MORE to hold US assets and still not buying the currency: that is a risk-premium or credibility story, not a carry story. The 2022 gilt shape, on the dollar. Tested here (55 such breaks since 2008): over the next 20 sessions the dollar caught up 47% of the time and fell further 36%; the real yield gave back 40% and rose further 36% — history does not say which leg gives way.',
      down: 'Real yields fell but the dollar rose. Money is buying dollars for safety rather than for yield — the flight-to-quality shape.',
    },
  },
  {
    id: 'real-gold',
    short: 'real yields → gold',
    punch: { holds: 'Gold answering to the real yield, as usual.', up: 'Gold up INTO rising real yields → a bid for money with no counterparty: credibility doubt.', down: 'Real yields down and gold still down → forced selling, or a dollar bid overwhelming it.' }, from: 'real', to: 'gold', sign: -1,
    textbook: 'Higher real yields are gold’s headwind',
    holds: 'Gold is answering to the real yield, as it usually does — the opportunity cost of holding a zero-yield asset is doing the pricing.',
    broken: {
      up:   'Real yields rose and gold rose with them. Someone is paying up for gold despite being paid more to hold Treasuries: that is a bid for an asset with no counterparty — doubt about the currency, the fiscal path, or the people setting rates. The chain’s loudest tell. Tested here (45 such breaks): gold went on to gain 2%+ in 33% of cases and lose 2%+ in 29% — no resolution tendency either way.',
      down: 'Real yields fell but gold fell too. The usual support is there and it is not working — look for forced selling (gold sold to raise cash in a margin squeeze) or a dollar bid strong enough to overwhelm it.',
    },
  },
  {
    id: 'real-nq',
    short: 'real yields \u2192 growth stocks',
    punch: { holds: 'Growth stocks answering to the discount rate, as the textbook says.', up: 'Real yields up, Nasdaq up anyway \u2192 earnings or financing outrunning the discount rate; paying to ignore rates.', down: 'Real yields down, Nasdaq down \u2192 growth scare: rates fall because earnings will, not because money is easier.' },
    from: 'real', to: 'nq', sign: -1,
    textbook: 'Higher real yields hit growth stocks hardest',
    holds: 'Growth stocks are answering to the real yield \u2014 the discount rate is doing the pricing. Tested 2026-09-17 (analysis/growth_vs_yields_study.mjs): what this link does NEXT is nothing \u2014 a Nasdaq down-week widens the following session on its own, and the yield leg adds nothing to that. Read it as description.',
    broken: {
      up:   'Real yields rose and Nasdaq rose with them. The long-duration equity is ignoring its discount rate: either earnings and the financing story are beating it, or the rally is on borrowed time. Which one is a judgment; the break itself is a fact.',
      down: 'Real yields fell and Nasdaq fell too. Money got cheaper and growth stocks did not care \u2014 rates are falling because growth is expected to, the growth-scare shape. Watch credit and copper for confirmation.',
    },
  },
  {
    id: 'real-spx',
    short: 'real yields \u2192 broad stocks',
    punch: { holds: 'The broad market answering to the discount rate too, just more quietly.', up: 'Real yields up, SPX up anyway \u2192 earnings outrunning the discount rate across the whole index, not just growth.', down: 'Real yields down, SPX down \u2192 a growth scare wide enough to reach the blend index, not just duration names.' },
    from: 'real', to: 'spx', sign: -1,
    textbook: 'Higher real yields are a headwind for equities generally, the broad index included',
    holds: 'The broad market is answering to the real yield too \u2014 more slowly than the Nasdaq (less duration in the index), but the same direction. If this link and real\u2192nq both hold, the discount-rate story is market-wide, not a growth-stock story alone.',
    broken: {
      up:   'Real yields rose and the S&P 500 rose with them. Either broad earnings are outrunning the discount rate, or (check real\u2192nq) the index is being carried by the same handful of duration names everyone already watches \u2014 a quiet SPX print can still hide a real-yield fight happening entirely inside its growth cohort.',
      down: 'Real yields fell and the S&P 500 fell too. Cheaper money is not helping stocks broadly \u2014 a growth scare wide enough to reach value and cyclicals, not just the long-duration names. Watch credit and copper for confirmation, same as real\u2192nq.',
    },
  },
  {
    id: 'dxy-gold',
    short: 'dollar → gold',
    punch: { holds: 'Gold and dollar opposite, as a dollar-priced asset should be.', up: 'Dollar and gold both bid → havens bought together; the market is fleeing something else.', down: 'Dollar down, no gold bid → a risk-on dollar sell, not a credibility sell.' }, from: 'dxy', to: 'gold', sign: -1,
    textbook: 'A stronger dollar makes dollar-priced gold dearer abroad',
    holds: 'Gold and the dollar are moving opposite, as priced in dollars they should.',
    broken: {
      up:   'Dollar and gold both rose. Both are being bought as havens at once — the market wants out of something else (other currencies, risk) rather than out of the dollar.',
      down: 'Dollar and gold both fell. The dollar is weakening without the usual gold bid — a risk-on dollar sell (money leaving safety for risk), not a credibility sell.',
    },
  },
  {
    id: 'dxy-audusd',
    short: 'dollar → AUD',
    punch: { holds: 'AUD trading against the dollar, as a commodity currency should.', up: 'AUD up against a stronger dollar → a specific Aussie bid: metals, RBA or China.', down: 'Dollar down and AUD down too → a growth scare bigger than the dollar move.' }, from: 'dxy', to: 'audusd', sign: -1,
    textbook: 'A stronger dollar weighs on the commodity currencies',
    holds: 'AUD is moving against the dollar as a commodity currency should.',
    broken: {
      up:   'The dollar rose and AUD/USD rose too. Something specific is bidding the Aussie — metals, an RBA stand, or China — hard enough to beat the dollar.',
      down: 'The dollar fell and AUD/USD fell anyway. The dollar weakness is not reaching the commodity bloc: a growth scare (copper, China) is bigger than the dollar move.',
    },
  },
  {
    id: 'dxy-usdjpy',
    short: 'dollar → USD/JPY',
    punch: { holds: 'USD/JPY tracking the broad dollar, no yen story of its own.', up: 'Dollar up broadly, yen too strong to follow → check for BoJ/MOF intervention.', down: 'Dollar down broadly, yen still weak → a BoJ story, not a dollar story.' }, from: 'dxy', to: 'usdjpy', sign: +1,
    textbook: 'A broadly stronger dollar should show up against the yen too',
    holds: 'USD/JPY is moving with the broad dollar — no yen-specific story is overriding the dollar move.',
    broken: {
      up:   'The broad dollar rose but the yen did not weaken with it — too strong a yen for a dollar story. This is the shape a BoJ/MOF intervention leaves (the yen bought back against a dollar that is otherwise firm), not a fear bid (see fear → yen for that leg) and not the dollar strength reaching the yen the way it is reaching everything else in the chain.',
      down: 'The broad dollar fell but USD/JPY held up or rose — the yen is weak on its own terms (a BoJ-dovishness or carry-demand story), not following the dollar down. A dollar sell-off elsewhere in the chain (gold up, AUD up) alongside a stuck or rising USD/JPY is exactly the "intervention living alongside the dollar story" shape, not a contradiction of it.',
    },
  },
  {
    id: 'oil-usdcad',
    short: 'oil → CAD',
    punch: { holds: 'CAD trading as an oil currency.', up: 'Oil up, CAD not bid → rates or risk outweighing the oil channel.', down: 'Oil down, CAD holding → a rates or risk story carrying it.' }, from: 'oil', to: 'usdcad', sign: -1,
    textbook: 'Dearer oil supports the Canadian dollar (USD/CAD down)',
    holds: 'CAD is trading as an oil currency — the export channel is doing the pricing.',
    broken: {
      up:   'Oil rose but USD/CAD rose too: CAD is not getting its oil bid. The dollar side (rates, risk) is bigger than the commodity side, or the market doubts the oil move lasts.',
      down: 'Oil fell but USD/CAD fell anyway: CAD is holding up without oil. A rates or risk story is carrying it.',
    },
  },
  {
    id: 'copper-audusd',
    short: 'copper → AUD',
    punch: { holds: 'AUD moving with copper — one growth read.', up: 'Copper up, AUD down → dollar or rates overriding the growth signal.', down: 'Copper down, AUD up → the currency is ignoring a growth scare.' }, from: 'copper', to: 'audusd', sign: +1,
    textbook: 'Copper and the Aussie read the same growth story',
    holds: 'AUD is moving with copper — the growth read is consistent across the metal and the currency.',
    broken: {
      up:   'Copper rose but AUD fell. The growth signal in the metal is not reaching the currency — a dollar or rates story is overriding it.',
      down: 'Copper fell but AUD rose. The currency is ignoring a growth-scare signal from the metal — a rates or positioning story is carrying it.',
    },
  },
  {
    id: 'vix-usdjpy',
    short: 'fear → yen',
    punch: { holds: 'The yen trading as the haven.', up: 'Fear up, yen not bid → a US-rates scare, or the yen has stopped being the haven.', down: 'Fear down, yen bid anyway → BoJ or intervention, not fear.' }, from: 'vix', to: 'usdjpy', sign: -1,
    textbook: 'Fear buys the yen (USD/JPY down)',
    holds: 'The yen is trading as the haven it usually is.',
    broken: {
      up:   'Fear rose but the yen did not get bid. Either the fear is a US-rates story (higher yields hold USD/JPY up even in a sell-off) or the yen has stopped being the market’s haven for now.',
      down: 'Fear fell but the yen strengthened anyway. Carry positions are being closed for a reason other than fear — a BoJ story or intervention.',
    },
  },
  {
    id: 'vix-hy',
    short: 'fear → credit',
    punch: { holds: 'Credit and equities agree on the fear.', up: 'Equity fear up, credit calm → credit calls it noise, and credit is usually right.', down: 'Fear down, credit widening → credit sees what equities ignore. Respect it.' }, from: 'vix', to: 'hy', sign: +1,
    textbook: 'Equity fear and credit stress rise together',
    holds: 'Credit and equities agree about how afraid to be.',
    broken: {
      up:   'Equity fear rose but credit spreads did not. Credit is calling it noise — usually the more reliable of the two.',
      down: 'Equity fear fell but credit spreads widened. Credit sees something equities are ignoring; this is the divergence that has historically been worth respecting.',
    },
  },
  {
    id: 'funding-dxy',
    short: 'funding → $',
    punch: { holds: 'Dearer funding and a bid dollar — the textbook plumbing move.', up: 'Repo up through the floor, dollar not bid — stress is local to funding, not a dollar shortage.', down: 'Repo easing, dollar still bid — a rates or haven story, not funding.' },
    textbook: 'Funding stress bids the dollar', from: 'funding', to: 'dxy', sign: +1,
    holds: 'Overnight money is dearer against the floor and the dollar is being bought — the scarce-dollar mechanism working as written.',
    broken: {
      up:   'SOFR rose through the floor but the dollar did not follow. Funding stress that stays in the repo market is a plumbing story — quarter-end, bill supply, dealer balance sheets — not a global dollar shortage.',
      down: 'Repo eased but the dollar strengthened anyway. The dollar bid is coming from rates or havens, not from a scramble for funding.',
    },
  },
  {
    id: 'funding-vix',
    short: 'funding → fear',
    punch: { holds: 'Funding stress showing up in the fear gauge.', up: 'Repo stress without fear — contained in the plumbing so far.', down: 'Fear rising with repo calm — this is not a funding event.' },
    textbook: 'Funding stress spills into risk', from: 'funding', to: 'vix', sign: +1,
    holds: 'Dearer overnight money and rising fear together — the 2019/2020 shape, where the plumbing leads the equity market.',
    broken: {
      up:   'Repo tightened but fear did not rise. The stress is technical (quarter-end, settlement) and equities are ignoring it — usually rightly.',
      down: 'Fear rose but funding is calm. Whatever the fear is about, it is not a shortage of money.',
    },
  },
  {
    id: 'dxy-btc',
    short: 'dollar → bitcoin',
    punch: { holds: 'Bitcoin trading as the anti-dollar asset.', up: 'Dollar and bitcoin both up → bitcoin trading as risk, not anti-dollar.', down: 'Dollar down, bitcoin down → not a credibility story; risk is being sold.' }, from: 'dxy', to: 'btc', sign: -1,
    textbook: 'A weaker dollar is the anti-dollar trade’s tailwind',
    holds: 'Bitcoin is moving as the anti-dollar asset — the last link on the chain is connected today.',
    broken: {
      up:   'Dollar and bitcoin both rose. Bitcoin is trading as a risk asset rather than as an anti-dollar asset.',
      down: 'Dollar fell but bitcoin fell too. The dollar weakness is not a credibility story — or bitcoin is trading as risk, and risk is being sold.',
    },
  },
];

const _dir = v => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');
const _fmt = (v, unit, dp) => {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = `${v > 0 ? '+' : ''}${v.toFixed(dp)}`;
  return unit === 'pct' ? `${s}%` : unit === 'bp' ? `${s}bp` : s;
};

/**
 * 20d change of a series in the node's unit. pts = ascending [{date, value}].
 * Returns { last, delta, asOf, refDate, refGapDays } or null.
 */
export function nodeDelta(pts, node, window = CHAIN_WINDOW_DAYS) {
  if (!node) return null;
  const s = seriesDeltas(pts, [window]);
  if (!s || s.d[window] == null) return null;
  const raw = s.d[window];
  const ref = s.last - raw;
  let delta;
  if (node.unit === 'pct') delta = ref ? (s.last / ref - 1) * 100 : null;
  else if (node.unit === 'bp') delta = raw * 100;
  else delta = raw;
  if (delta == null || !Number.isFinite(delta)) return null;
  return { last: s.last, delta, asOf: s.lastDate ?? null, refDate: s.refDate[window] ?? null, refGapDays: s.refGapDays[window] ?? null };
}

/**
 * Evaluate every link. vals: { <nodeKey>: {delta, last, asOf, ...} | null }.
 * Returns links in chain order, each with both ends described and a verdict.
 */
export function evaluateChain(vals = {}, links = CHAIN_LINKS, nodes = CHAIN_NODES) {
  const end = key => {
    const n = nodes[key]; const v = vals[key];
    if (!n) return null;
    if (!v || v.delta == null || !Number.isFinite(v.delta)) return { key, label: n.label, unit: n.unit, delta: null, moved: false, dir: null, text: '—', asOf: null };
    const moved = Math.abs(v.delta) >= n.floor;
    return { key, label: n.label, unit: n.unit, delta: v.delta, last: v.last ?? null, moved, dir: _dir(v.delta), text: _fmt(v.delta, n.unit, n.dp), asOf: v.asOf ?? null, floorText: _fmt(n.floor, n.unit, n.dp).replace('+', '±') };
  };
  return links.map(l => {
    const a = end(l.from), b = end(l.to);
    let verdict, read, punch = '';
    // What the textbook expected the TO end to do, given what the FROM end did.
    const expected = (a && a.moved) ? (l.sign > 0 ? a.dir : a.dir === 'up' ? 'down' : 'up') : null;
    if (!a || !b || a.delta == null || b.delta == null) { verdict = 'unmeasured'; read = 'A series this link needs is not loaded, so it is not judged.'; }
    else if (!a.moved || !b.moved) {
      verdict = 'quiet';
      const still = !a.moved && !b.moved ? 'neither end' : !a.moved ? a.label : b.label;
      read = `${still === 'neither end' ? 'Neither end has' : `${still} has not`} moved past its noise floor over ${CHAIN_WINDOW_DAYS} days, so there is nothing to judge the link on.`;
      punch = !a.moved ? `${a.label} inside its floor (${a.floorText})` : `${b.label} inside its floor (${b.floorText})`;
    }
    else {
      const agree = Math.sign(a.delta) * Math.sign(b.delta) === l.sign;
      verdict = agree ? 'holding' : 'broken';
      read = agree ? l.holds : l.broken[a.dir];
      punch = agree ? (l.punch?.holds ?? '') : (l.punch?.[a.dir] ?? '');
    }
    // The two ends can print on different days (the broad dollar index lags a
    // week; OANDA closes are yesterday). A verdict across a wide gap is still a
    // verdict, but the reader should see the gap rather than assume one date.
    const ta = Date.parse(a?.asOf ?? ''), tb = Date.parse(b?.asOf ?? '');
    const dateGapDays = (Number.isFinite(ta) && Number.isFinite(tb)) ? Math.round(Math.abs(ta - tb) / 864e5) : null;
    return { id: l.id, short: l.short ?? l.id, textbook: l.textbook, sign: l.sign, a, b, expected, verdict, read, punch, dateGapDays };
  });
}

/** Ends printed more than this many days apart get a visible note. */
export const CHAIN_DATE_GAP_NOTE_DAYS = 3;

/** Counts and a one-line headline over an evaluated chain. */
export function summariseChain(links) {
  const n = { holding: 0, broken: 0, quiet: 0, unmeasured: 0 };
  for (const l of links) n[l.verdict] = (n[l.verdict] ?? 0) + 1;
  const judged = n.holding + n.broken;
  const brokenIds = links.filter(l => l.verdict === 'broken').map(l => l.id);
  const brokenShort = links.filter(l => l.verdict === 'broken').map(l => l.short ?? l.id);
  let headline;
  if (judged === 0) headline = n.unmeasured === links.length ? 'Nothing measured yet.' : `Quiet: no link has both ends moving over ${CHAIN_WINDOW_DAYS} days. The textbook is not being tested today.`;
  else if (n.broken === 0) headline = `${n.holding} of ${judged} testable link${judged === 1 ? '' : 's'} holding. The textbook is working — first-order reads are enough today.`;
  else headline = `${n.broken} of ${judged} testable link${judged === 1 ? '' : 's'} broken: ${brokenShort.join(', ')}. That is where the story is.`;
  return { ...n, judged, brokenIds, brokenShort, headline };
}

/** Compact text for an AI prompt: one line per judged link, broken ones with the mechanism. */
export function chainForPrompt(links) {
  const lines = [];
  for (const l of links) {
    if (l.verdict === 'unmeasured') continue;
    const ends = `${l.a.label} ${l.a.text} → ${l.b.label} ${l.b.text}`;
    if (l.verdict === 'quiet') { lines.push(`- ${l.textbook}: QUIET (${ends})`); continue; }
    const gap = l.dateGapDays > CHAIN_DATE_GAP_NOTE_DAYS ? ` [ends printed ${l.dateGapDays} days apart: ${l.a.asOf} vs ${l.b.asOf}]` : '';
    lines.push(`- ${l.textbook}: ${l.verdict.toUpperCase()} (${ends})${gap}${l.verdict === 'broken' ? ` — ${l.read}` : ''}`);
  }
  return lines.join('\n');
}
