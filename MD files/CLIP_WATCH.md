# Clip watch — educators other than Crown

Same job as `CROWN_WATCH.md` and the **same five-step pass**, which is written out in
that file's header and is not repeated here — one copy, so the two logs cannot drift.
In short: state the claim falsifiably, audit what this desk already has, decide whether
it is a trading claim or a macro-understanding one, ask for a display nugget regardless
of the verdict, then give a verdict and an action.

Separate file only for **attribution**. Once you are scoring which ideas held up, it
matters who said what, and `CROWN_WATCH.md` is explicitly one presenter's thread.

Carrying over the rule the owner set on 2026-10-02: **clips are undated, so the
"happening right now" facts get slack and are never scored as accuracy.** The claim is
what is being tested; the day it was filmed is not.

---

## 2026-10-02 — "Bond volatility and the dealer inventory spiral" (speaker not yet named)

> *"When bond volatility increases, this is an insane market to be in... As a dealer who
> has inventory, it's really difficult to keep up with this because everything you're
> holding is getting cheaper. So then you end up holding very little, and then there's no
> liquidity in the market. This is why the price can fall really fast in a fixed income
> market... It's not on the screens in the same way that you know of the equity markets.
> It's much more who you know and what the guy across the street holds. Fixed income is
> more of a cartel-style environment than equities, which is a more democratic market."*

**1. The claim, stated plainly.** Three pieces, and only one of them is the sort of thing
that gets tested:
- **(a) A microstructure fact.** Fixed income is dealer-intermediated and OTC — inventory
  held on balance sheets, bilateral quotes, relationships — where equities are exchange-
  traded and anonymous. This is simply how the two markets are built.
- **(b) A mechanism.** Rising bond volatility makes dealer inventory risky to carry, so
  dealers shrink inventory, so depth disappears, so price moves faster — which raises
  volatility again. A reflexive liquidity spiral.
- **(c) A characterisation.** "Cartel-style" versus "democratic". Rhetoric, not a claim;
  concentration among primary dealers is real, collusion is a different and much heavier
  allegation, and nothing here distinguishes them.

**2. What's already on this desk.** The mechanism's central quantity is a **disclosed hole**.
- `js/cogConfig.js` carries `move: { ticker: '^MOVE', flaggedMissing: true, note: 'No
  reliable free daily MOVE index feed — abstains via coverage policy until a paid feed is
  wired in (Phase 2 gap, disclosed not faked).' }`, and a **`movePercentile` factor at
  weight 0.6** in the COG risk score that abstains because of it. So the desk already
  decided bond vol belongs in its risk read and then could not feed it.
- Adjacent findings, all about rate *levels* rather than rate *volatility*:
  `front-end-shock` (NULL — a 2y shock does not raise FX vol the following week),
  `curve-inversion` (NULL), `yield-move-fx-range` (NULL — a big 10-year move does not widen
  the next FX session), `crowded-bond-short-fomc` (NULL), `stock-bond-flip` (context).
  **Not one of them measures bond VOLATILITY.** The desk has tested what yields *did* and
  never what the market was *paying for protection against* them doing it.
- `repo-stress-range` (context) and `funding-stress` (NULL, 2026-10-02) cover the *funding*
  side of liquidity. Neither touches dealer inventory in cash bonds.

**3. Trading claim or macro-understanding claim.** (a) and (b) are macro-understanding and
need no statistical test to be acted on — dealer balance-sheet capacity driving depth is
textbook market structure, and the honest audit question is whether the chain on
`today.html` already carries the mechanism. It does not: the chain's rates nodes are all
levels and spreads. (c) is not testable as stated and should not be repeated as though it
were.

**4. Display nugget.** Yes, and a concrete one. **The feed gap is closable.** Yahoo's chart
API serves `^MOVE` on exactly the path this repo already uses for sector ETFs and single
names: **2,478 daily observations, 2016-10-03 to 2026-10-02**, range 36.6 to 182.6, median
73.1, 63 days above 140 (the 2020/2022/2023 stress prints). As of 2026-10-02 it reads
**107.63 — the 79th percentile of ten years and the 98th of the last year.** The
"no reliable free daily feed" note is out of date rather than wrong-in-principle.

**5. Verdict and action.**
- **Nothing to pre-register from the clip as spoken.** The mechanism is structural, not a
  forecast, and the desk's own house style for that is the chain: describe it, stamp it
  context, never alert on it.
- **The feed is a decision, not a chore, and it is the owner's.** Supplying `^MOVE` would
  activate a **dormant 0.6-weight factor inside a live risk gate**. That changes gate
  behaviour, which is the same shape as the gold-pip re-tune: correcting the input and
  re-fitting what depends on it are one job, never a one-line change. Flagged, not done.
- **The genuinely untested question this raises**, and the first thing worth a
  pre-registration from this clip: *does high or rising bond volatility precede wider
  ranges in FX and equities?* Every neighbouring finding here tested rate LEVELS and came
  back null; the volatility version has never been run, and ten years of daily MOVE is
  enough to run it honestly.
- **Worth keeping from (a) regardless of any test.** It explains *why* bond liquidity can
  vanish in a way equity liquidity usually does not, and therefore why a bond move of a
  given size is not comparable to an equity move of the same size. That is a real framing
  for reading the rates leg of the chain, and it costs nothing to hold.

## 2026-10-02 — Jess Inskip, "The domino effect: tracing one shock through the whole board"

> *"Oil increased, inflation expectations increased, which caused Fed easing bets to
> collapse. That caused yields to rise, the dollar to strengthen, gold to fall, and equity
> multiples to compress... There is an important takeaway here: short-run inflation
> expectations increase, the two-year increased more than the ten-year, so you see it
> reflected in the bond market... A multiple is price divided by earnings. The numerator has
> decreased. The denominator has actually increased... earnings season is literally the most
> important thing."*

**1. The claim, stated plainly.** This is not one claim but a **method**, which is why it is
the most useful clip in the log so far. Three separable parts:
- **(a) A transmission chain**: oil ↑ → short-run inflation expectations ↑ → Fed easing bets
  collapse → yields ↑ → dollar ↑, gold ↓, equity multiples compress.
- **(b) A diagnostic**: the 2-year rose MORE than the 10-year (+35bp vs +31bp), which is the
  signature of a *short-run inflation expectations* shock rather than a term-premium or
  supply story. Which leg moves more tells you which story it is.
- **(c) A decomposition**: multiple compression came from the numerator falling while the
  denominator ROSE — earnings expectations were revised UP (12.8% → 13.2%) while the
  multiple fell 22 → 19.8. So the compression is price-driven, not earnings-driven, and the
  thing to watch is whether it turns into an earnings collapse.

**2. What's already on this desk.** Most of the chain is built; two legs are not, and one
whole branch is missing.
- **The chain already carries (a) almost exactly.** `js/macroChain.js` has `oil-bei` (oil →
  breakevens), then `real-dxy`, `real-gold`, `real-nq`, `real-spx` — real yields into the
  dollar, gold and equities. Her domino diagram is this desk's chain diagram with a
  different drawing.
- **The 2y-vs-long-end diagnostic (b) is on the chain too, and better developed.** The curve
  node's punch lines read: *"2-year up, 30-year down → hard flattening: the market thinks
  tightening bites before inflation does"* and *"2-year down, 30-year up → bear steepening on
  easing: credibility, not policy, is being priced."* Chapter A adds `curveFactors`, which
  splits any curve move into level, slope and curvature with shares. She uses 2y-vs-10y;
  this desk uses 2y-vs-30y and a three-factor split. Same idea, further along.
- **`oil-to-breakevens` is a tested NULL here — and it supports her, not against her.** What
  was nulled was the *lag*: oil reaching breakevens has no delay to trade on. Her chain
  asserts the transmission, not a tradeable lag, so the finding sharpens it rather than
  killing it. Anyone waiting for the breakeven leg to catch up is the one the null is aimed at.
- **Two legs are genuinely absent.** *Fed easing bets* — cuts priced into fed funds futures —
  is not on this desk at all, and CME's endpoints return 403 so it cannot simply be pulled.
  *Survey* inflation expectations are not pulled either: `MICH` (University of Michigan,
  1978→, 584 obs) and `EXPINF1YR` (Cleveland Fed, 1982→) are both free on FRED and neither is
  in the catalogue. The desk has market-implied breakevens and no survey measure, and her
  entire argument runs through the survey one — the consumer who sees the pump price.
- **The earnings branch does not exist here at all.** No forward P/E, no earnings-growth
  expectations, no revisions data. Part (c) cannot be computed on this desk today.

**3. Trading claim or macro-understanding claim.** Macro-understanding, unambiguously, and
she says so herself — the output is "where do I look next", not an entry. No
pre-registration is owed. The honest audit question for this type, per the header, is
whether the chain already covers the mechanism: it covers (a) and (b), and not the Fed-
expectations or earnings legs.

**4. Display nugget, and the lesson.** Two, of different sizes.
- **Small and concrete**: `MICH` / `EXPINF1YR` are free, long and uncatalogued. Monthly and
  lagged (`MICH` last prints 2026-08-01), so they are a context read, never a daily input —
  but the gap between *survey* and *market-implied* inflation expectations is exactly the
  de-anchoring question the Fed acts on, and this desk currently cannot see it.
- **Larger**: this clip is a **worked example**, and Theory Lab has none. All 304 lesson
  files there are `tl-status concept` — a technique explained in the abstract. Tracing one
  real shock end-to-end through the chain, with before/after numbers and the reasoning at
  each node, is a different and missing format. Proposed, not built — per the header's rule
  on real additions.

**5. Verdict and action.**
- **Nothing to test, nothing to correct.** The method is sound and most of it is already the
  house method. That is a good outcome: it is independent confirmation that the chain on
  `today.html` is pointed at the right relationships.
- **The one thing she does that the chain does not** is *sequence* — she walks the dominoes
  in causal order and says what would falsify the story at each step ("if the 2-year stops
  rising while oil keeps rising, they are looking through it; move your focus to earnings").
  The chain shows all links at once, flat, with a holds/broken stamp. Her version has a
  reading ORDER and an explicit next-question. That is the transferable part.
- **Open, and worth it**: wire `MICH` and `EXPINF1YR` into the catalogue as context series,
  and record plainly that the Fed-expectations and earnings legs are gaps rather than
  oversights.

## 2026-10-02 (2) — Jess Inskip, "Investor mood, the quote, and forced selling" (whiteboard)

*Re-sent 2026-10-02 under a second share link (`1DkAfHi7ym` as well as `1CgmZw3u6X`) — same
clip, identical transcript, already passed below. Noted here so the duplicate is visible at
the entry rather than discovered by re-running the audit.*

> *"Why would someone want to buy? Why would someone want to sell?... Buying is optimism,
> selling is fear, and if you're not sure, uncertainty — and uncertainty comes with
> volatility... If you own that on margin... you may not want to sell the stock, but you
> have to, to meet your minimum equity requirements. You have to raise cash, and normally
> you are going to get cash from your most profitable position. **The thing that caused the
> rally tends to lead the decline**, and then the inverse is true... Is this fear? Is this
> optimism? Is this uncertainty, or is this systematic?"*

**1. The claim, stated plainly.** Mostly foundational, with one sharp mechanical claim
buried in it:
- **(a) Microstructure.** Bid/ask, depth at each level, and price walking the book when one
  side exhausts. Definitional, not a claim.
- **(b) Psychology.** Buying = optimism, selling = fear, not-knowing = uncertainty =
  volatility; therefore price is unpredictable because minds are. A framing.
- **(c) THE TESTABLE ONE.** Margin calls force selling that is *systematic rather than
  emotional*, and the cash is raised from the **most profitable position** — so **the leader
  of the rally leads the decline**, and symmetrically the leader of the decline leads the
  recovery.
- **(d) A taxonomy for any move**: fear / optimism / uncertainty / **systematic**. The fourth
  category is the one most readings omit.
- **(e) Hype with earnings follow-through persists (Nvidia); hype without it collapses
  (GameStop).** Post-hoc as stated — two cases chosen after the outcomes were known.

**2. What's already on this desk.** (c) is **genuinely untested here**, and the data is in hand.
- The ledger's nearest neighbours are all about *breadth and dispersion*, not *leadership
  reversal*: `rotation-extreme` (NULL — Nasdaq-vs-Russell relative return extremes),
  `breadth-narrowing` (NULL), `dispersion-crowded-week` (NULL), `mv-dispersion-range` and
  `dispersion-reset` (both VALIDATED, both for RANGE). None asks whether the *winner* leads
  the drawdown.
- The data exists and is already pulled daily: **14 sector ETFs** (XLK/XLF/XLE/… plus SMH,
  RSP, SPY) with **1,506 observations from 2020-10**, and 12 single names (NVDA from 2023-10,
  753 obs — shorter, and too short to lean on).
- **There is no cyclical/defensive classification** anywhere in the repo. The sectors are
  pulled as a flat list; the split she teaches is not encoded.
- **Margin data is nearly useless here.** FRED's `BOGZ1FL663067003Q` is **quarterly**
  (305 obs back to 1945) and `MDOAH` died in 2019. So (c) cannot be tested *through* margin
  balances — only through its price fingerprint, which is the right way anyway.
- (d)'s fourth category has no representation on the board. Every existing read classifies a
  move by *size* or *direction*; none asks whether it was **forced**.

**3. Trading claim or macro-understanding claim.** (a), (b) and (d) are macro-understanding
and belong in teaching, not in a test. (c) is a trading-adjacent claim and is the only thing
here that could be pre-registered. (e) should not be repeated as evidence — two post-hoc
cases is an anecdote with a moral.

**4. Display nugget / lesson.** This clip is **Theory Lab material far more than board
material** — it explains how a quote works, which no page here teaches. Its one durable
board idea is (d): a fourth label, *systematic*, for a move that is forced rather than
chosen. Worth holding as vocabulary even with nothing wired to it, because "was this
forced?" is a question the current reads cannot ask.

**5. Verdict and action.**
- **One pre-registration candidate, and it is a good one**: *does the best-performing sector
  over the prior N days lead the drawdown when the index falls?* Pre-registered properly it
  needs a de-clustered definition of "drawdown", a control for sector beta (the leader is
  usually the high-beta sector, which falls more in ANY sell-off — that is the obvious
  confound and the thing that would make a naive version look true), and the symmetric test
  on the recovery. Six years and fourteen sectors is enough to run it; the single names are
  not.
- **The beta confound is the whole study.** If the "leader leads the decline" effect survives
  beta-matching it is a real forced-liquidation fingerprint; if it does not, it is the
  statement "high-beta sectors are high-beta" wearing a story. That is exactly the shape of
  the mirror that killed `breadth-narrowing`.
- **Not built, not tested yet** — logged as a candidate.

## 2026-10-02 (3) — Jess Inskip, "The VIX is not a fear gauge, it's an uncertainty index"

> *"Some people call it the fear gauge. That is wrong... The VIX calculation is going to look
> at SPX options on the call side AND on the put side, 30 days out, and do a normalization. I
> like to refer to it as the uncertainty index... It's a very common misconception. Just
> because the VIX is spiking, it doesn't mean the market's about to go down. It means people
> are willing to pay more for potential upside OR potential downside. But since fear tends to
> drive human emotion, we tend to pay more for the downside."*

**1. The claim, stated plainly.**
- **(a) Construction.** VIX is a 30-day normalisation across SPX calls *and* puts, not a
  put-only measure. Definitional and correct.
- **(b) The central claim.** A VIX spike means **uncertainty**, not direction. It does not
  imply the market is about to fall.
- **(c) The asymmetry.** Puts cost more than equivalent calls because of hedging demand, so
  the index is usually *driven* by downside pricing even though it measures both.

**2. What's already on this desk.** Claim (b) is not merely supported here — **it is the most
replicated result this desk has.**
- **Nineteen validated findings, twelve of which measure RANGE rather than direction.** Every
  single validated volatility finding is a range finding: `vix-inversion` (VIX above VIX3M →
  a wider week), `mv-vixterm-range` (inverted VIX curve → a wider month),
  `iv-over-rv-wider` (implied far above realised → the tape calms down). Not one of them
  says which way.
- **`fear-gold` — NULL**, and it is the direct instance of her point: after 58 VIX spikes
  gold showed **no bid on average** at five sessions (+0.07% [−0.42, +0.30]) and **lagged by
  1.2%** a month later. The "fear" trade, tested, did not pay. The desk's own note for it is
  *"the gold people buy, and the one that has not paid."*
- So she arrives, from teaching, at the conclusion this desk reached from testing: **vol tells
  you about SIZE, never about SIGN.** Independent confirmation of the house rule, and the
  cleanest one yet.

**3. Trading claim or macro-understanding claim.** Macro-understanding, and the single most
useful kind: it removes a false signal rather than adding one. Nothing to pre-register from
(a) or (b) — (b) is already established in the stronger, tested form.

**4. Display nugget — and here (c) finds a real gap.** Her asymmetry point has a number
attached to it that this desk **already pulls and has never used**: the **CBOE SKEW index**,
the cost of tail puts relative to at-the-money. It is in the drill bundle with **1,505 daily
observations from 2020-10**, it reads **141.92** today (29th percentile of a year), it is in
the catalogue nowhere and in the ledger nowhere. `VVIX` — the vol of vol — is in the same
position: 1,506 observations, unused.
So the desk has three volatility *levels* tested and validated, and the two series that
describe the **shape** of the vol surface sitting unexamined.

**5. Verdict and action.**
- **Nothing to correct and nothing to test from the main claim.** Bank it as confirmation:
  an outside teacher independently reaching "vol is about size, not sign" is worth more than
  another internal replication of it.
- **The lesson value is high and specific.** "Fear gauge" is the single most common wrong
  framing of a number that sits on this board every day, and no page here says plainly what
  the VIX is or corrects the misnomer. That is a one-screen Theory Lab piece.
- **The pre-registration candidate is (c), not (b).** Does the SKEW index — tail-put cost
  relative to ATM — say anything the VIX level does not? The obvious framing, matching the
  house pattern: a *range* question first (does high SKEW precede wider ranges, controlling
  for the VIX level?) and a direction question only to kill it. Needs SKEW to be
  disentangled from VIX, since the two co-move; the control is the study.
- **Smaller and free**: add `SKEW` and `VVIX` to the data catalogue. Both are pulled daily,
  neither is documented, and that is exactly the condition that caused three
  already-have-it mistakes earlier today.

## 2026-10-02 (4) — Jess Inskip, "The yield curve tells you what growth is expected"

> *"If there is a slowdown expected, the yield curve will be inverted... The Fed raises
> interest rates, and that affects the front end of the curve. So their actions are what
> leads to an inverted yield curve and an expectation of a slowdown in growth... post-Iran
> conflict, the two-year yield rose more than the ten-year, and that's because short-term
> inflation expectations rose where long-term did not."*

**1. The claim, stated plainly.** Note carefully what she does and does not say:
- **(a) The curve ENCODES expectations.** Upward slope = growth expected, inverted =
  slowdown expected, flat = little growth. She says *expected*, not *will happen*.
- **(b) The mechanism for term premium**: opportunity cost — with growth expected you could
  have the capital in equities, so you demand compensation for tying it up.
- **(c) Price/yield inverse** on the secondary market. Arithmetic, not a claim.
- **(d) Inversion is CAUSED by the Fed lifting the front end**, not by the long end falling.
- **(e) Segment mapping**: bills → savings rates, 2–10y → auto loans, 10y → mortgages,
  20–30y → long bonds.

**2. What's already on this desk.** Tested today, and the distinction between her claim and
the tested one is the whole entry.
- **`curve-inversion` — NULL, banked 2026-10-01.** Fifty years of `T10Y2Y`, ten de-clustered
  inversion episodes. Recession within 24 months followed **6 of 10**, 95% CI **[31%, 83%]**.
  Forward Nasdaq against a month-matched control: nothing clears at 3, 6 or 12 months. The
  gate failed on its steepening mirror.
- **But that nulls the PREDICTIVE version, and she did not make it.** "The curve tells you
  what is expected" is true essentially by construction — a forward curve *is* the market's
  expectation, that is what the arithmetic of forward rates means. What was tested and
  killed is the stronger claim that the expectation is *reliable enough to trade*.
- **The desk's own numbers sharpen her lesson rather than contradicting it.** Four of ten
  inversions were followed by **no recession within two years**. So the curve's expectation
  was simply *wrong* 40% of the time, and that is the most useful thing anyone can know
  about reading it. **Expectations are a measurement, not a forecast.**
- Everything else she describes is built: **Chapter A** carries eleven tenors with a
  level/slope/curvature decomposition and the full surface; **Chapter B** treats the 2-year
  as a vote on the next meetings; the chain's curve node already distinguishes her (d) from
  its opposite — *"2-year up, 30-year down → hard flattening"* versus *"2-year down, 30-year
  up → bear steepening on easing: credibility, not policy, is being priced."*
- `front-end-shock` (NULL) and `priced-in-direction` (NULL) sit underneath (d).
- **(e) is on this desk nowhere**, needs no test, and is the most immediately useful thing in
  the clip for a non-specialist: it turns an abstract curve into four rates a person actually
  pays.

**3. Trading claim or macro-understanding claim.** Macro-understanding throughout. She is
careful about it — she teaches what the curve *measures*, and never says to trade the shape.
Worth noting as a contrast with the Crown clip, which took a nulled relationship and acted on
it.

**4. Display nugget.** Chapter A already shows the curve, the three factors and the surface.
What it does not say is the sentence this desk has now earned: **an inverted curve has been
followed by a recession within two years in 6 of 10 episodes since 1976, on an interval of
31% to 83%.** That is one line, it is measured, and it belongs beside the curve on the
chapter page — it converts "the curve is predicting a slowdown" into "the curve is PRICING a
slowdown, and it has been wrong about that four times in ten."

**5. Verdict and action.**
- **Nothing to test. It was tested yesterday** and the result is already in the ledger.
- **The clip's real contribution is pedagogical**, and it is the fourth Jess clip that forms
  part of one coherent sequence: the chain (how a shock propagates) → investor mood and the
  quote (why price moves at all) → the VIX (what vol does and does not say) → the curve (what
  rates encode). That is a course, not four clips.
- **One line of board copy proposed** (see 4), measured rather than asserted.

## 2026-10-02 (5) — Jess Inskip, "The T-chart" (the four option positions)

> *"Calls are on the left, puts are on the right. Bullish strategies on the top, bearish on
> the bottom... Anytime you hear long, think purchase. Call, think the right to buy. Short,
> think sold. Put, think the right to sell... anything bullish involves a buy transaction of
> some sort — a long call and a short put — whereas the short call and the long put are
> bearish."*

**1. The claim, stated plainly.** There is no claim. It is definitional: long/short ×
call/put, who holds the right and who carries the obligation, and the P&L goal of each of
the four. Nothing here is falsifiable and nothing should be tested.

**2. What's already on this desk — and this is the entry.** The desk **reads eight
option-derived numbers and explains none of them.**
- Live on the board: `maxPain`, `callWall`, `putWall`, `pcRatio`, `gex`, `riskReversal`,
  `ivTermStructure`, `expectedMove`. The OI dashboard, the pair drawers and the vol
  intelligence endpoint all speak this language daily.
- `js/glossary.js` has **57 entries and not one option term**. No call, no put, no strike, no
  premium, no delta, no gamma — while the board shows a *gamma* exposure number.
- Theory Lab has **`black-scholes.html`**, **`second-order-greeks.html`** and
  **`fft-option-pricing-carr-madan.html`**. It teaches the Carr–Madan FFT method for pricing
  options and has no lesson explaining what a call is.

So the curriculum here starts at second-order Greeks. Her T-chart is the missing first page,
and it is a prerequisite for lessons that already exist.

**3. Trading claim or macro-understanding claim.** Neither — it is vocabulary, and it is the
vocabulary the desk's own option reads are written in.

**4. Display nugget.** Two, both cheap:
- **Glossary entries** for the eight terms the board already prints. A reader meeting
  "callWall 1.1317" or "GEX −1.2e11" has nowhere to look, and the glossary is the place that
  exists for exactly this.
- A T-chart **as a diagram** is the natural first panel of any options lesson, and it is one
  SVG.

**5. Verdict and action.**
- **Nothing to test, nothing to correct, and the highest teaching value per minute of any
  clip logged.** It is foundational rather than insightful, which is precisely why the gap
  it exposes had gone unnoticed: nobody writes a lesson on what a call is when they are busy
  building a gamma read.
- **Recommended, small**: add the eight board terms to `js/glossary.js`. That is the cheapest
  action from any clip in this log and it fixes a real asymmetry — the desk asks a reader to
  interpret a put wall and offers them no definition of a put.
- **Recommended, larger**: the T-chart is lesson 0 of an options sequence that would then
  flow into the Black-Scholes and Greeks lessons already sitting there unsupported.

## 2026-10-02 (6) — Jess Inskip, "What a wash sale is" — NOT APPLICABLE

> *"A wash sale has to do with tax things, which means it's only applicable to a taxable
> account... close a position at a loss, and within 30 calendar days reopen it... the IRS
> disallows the loss and adds it to your cost basis."*

**Verdict first, because it is a short one: this does not apply to this desk, and the
explanation is correct for what it covers.**

**Why it does not apply.** Three reasons, any one of which is sufficient:
- It is a **US IRS rule** (§1091) for US taxable accounts. This desk is UK-based — 77
  references to `Europe/London` against 8 to `America/New_York`, instruments quoted
  `UK100_GBP` and `DE30_EUR`, oi_store timestamps written in UK locale.
- The instruments are **FX, indices and gold via MT5 CFDs**, not US shares in a US brokerage
  account.
- The UK has its own 30-day rule for shares — same-day matching, then the 30-day
  "bed-and-breakfast" rule, then the Section 104 pool — and it is **not the same mechanism**
  as a wash sale, despite the superficially similar 30 days. Anything further than noting
  that belongs with an accountant, not here.

**What the audit confirmed.** There is **no tax or cost-basis handling anywhere in this
repo** — no `costBasis`, no `taxYear`, nothing. That is a deliberate scope boundary, not a
gap: the trade history, the give-back diagnostic and the P&L reads are all pre-tax and
measure execution, not after-tax outcome. Nothing here should change.

**Logged anyway**, because a clip that yields a clean "no" is worth recording — it stops the
same question being re-asked, and it is the fastest entry in this log by some distance. The
pass is as valuable when it returns nothing as when it returns a gap.

## 2026-10-02 (7) — Jess Inskip, "Who calls a recession, and what causes one"

> *"The NBER calls the peak, the turning point, and they call the trough... They usually call
> this in hindsight, four to 21 months from the peak or trough, because they want to be very
> sure... The technical definition is two quarters of negative GDP. That's not always true
> though... business investment falls first... then consumers stop spending... inventory
> increases... layoffs... unemployment leads to less spending. You must look at the totality
> of the data."*

**1. The claim, stated plainly.**
- **(a) Who calls it and how**: the NBER dates *turning points* — peaks and troughs — on
  depth, diffusion and duration, not periods, and **in hindsight**, 4–21 months later.
- **(b) "Two negative quarters" is shorthand, not the definition**, and it has been wrong in
  both directions.
- **(c) A transmission ORDER inside a contraction**: business investment (the volatile
  component) falls first → consumer spending → inventories build → price cuts → layoffs →
  unemployment → less spending.
- **(d) The policy response** — fiscal stimulus or rate cuts — turns the trough.

**2. What's already on this desk — and (a) is the thing I hit from the other side
yesterday.** The `curve-inversion` pre-registration, written before that study ran, says:
*"USREC is not [knowable in time]: NBER dates recessions in arrears, typically 6–18 months
later, so a USREC-based outcome is a retrospective label and can never be a tradeable signal."*
She says 4–21 months. Same wall, reached independently, and it is the reason that study
reported its recession leg descriptively and refused to call it tradeable.
- **The sample problem is worse than it looks, and this clip makes it concrete.** USREC
  carries **six recessions since 1976** — 1980-02, 1981-08, 1990-08, 2001-04, 2008-01,
  2020-03 — against the **ten** inversion episodes the curve study found. Any claim of the
  form "X predicts recessions" is working with six events. That is below this desk's
  MIN_EVENTS floor on every study it has ever run.
- **`dr-copper` — NULL**, and it is exactly this clip's family: *"copper falls three months
  before GDP turns negative, every time."* It fired 5 times against a floor of 6 and the
  strong form is falsified. The lesson there was **UNTESTABLE ≠ NULL**, and it applies to
  (c) in full.
- `nowcast-gap-gdp` (context) and `nowcast-gap-cpi` (null) cover the nowcast-versus-consensus
  question. Chapter E (Growth) is built on copper and crude; **Chapter F (Labour) is marked
  unbuilt** for want of data.
- **The growth stack is almost entirely absent.** `INDPRO`, `PAYEMS`, `UNRATE`, `GDPC1`,
  `PNFIC1` (business fixed investment) and `USREC` itself are **none of them pulled** —
  `USREC` exists here only as a scratch cache the curve study wrote yesterday. Only
  `DGORDER` is catalogued. The desk reads rates, credit, vol and FX in depth and has
  essentially no view of the real economy.

**3. Trading claim or macro-understanding claim.** Macro-understanding throughout, and (c) is
the valuable part: an *ordering* is more useful than a level because it tells you which
series to watch first. But see below — it cannot be scored here.

**4. Why (c) cannot be tested on this desk, stated plainly.** The sequence
investment → consumption → inventories → layoffs would be tested across recessions, and there
are **six**. Every lead-lag ordering would be fitted on six events, which is how `dr-copper`
got to "fired 5 times against a floor of 6". It can be **described and watched**; it cannot
be **scored**, and the honest label for that is UNTESTABLE rather than null. Recording the
reason now prevents someone running it later and reporting a confident ordering from six
observations.

**5. Verdict and action.**
- **Nothing to test. One real gap, and it is a big one**: no real-economy data. If the growth
  stack is ever wanted, `INDPRO`, `PAYEMS`, `UNRATE` and `USREC` are free, long and monthly,
  and would build Chapter F — which is currently marked unbuilt for exactly this reason.
  Monthly and revised, so context only, never a trading input.
- **A data trap worth recording**: FRED's `USREC` flag is offset from the NBER's announced
  dates by its own month convention — NBER puts the 2020 peak at February and the trough at
  April; USREC reads 1 from March through April. Anyone treating the first `USREC=1` month
  as "the recession started" is a month late. The curve study used a 12/18/24-month window so
  it is robust to this, but a tighter test would not be.
- **The strongest line in the clip, and worth stealing for the desk's own voice**: *"Just
  because there are two negative quarters of GDP does not mean we're in a recession. You must
  look at the totality of the data."* That is the same instinct as the mirror test and the
  leave-one-out check — one indicator is never the finding.

## 2026-10-02 (8) — Jess Inskip, "Four markets, four questions" (the synthesis clip)

> *"The stock market is going to tell us investor MOOD... the treasury market tells us
> investor DEMAND... the options market is really investor UNCERTAINTY... prediction markets
> give you investor EXPECTATIONS as probabilities... If we see yields increasing, is it
> because of growth or because of inflation expectations? We actually don't know, and we need
> to interpret that."*

**1. The claim, stated plainly.** A framing rather than a claim: four markets, each
answering a *different kind* of question — equities = mood, treasuries = demand, options =
uncertainty, prediction markets = explicit probabilities. The analytical move is to read
them against each other rather than separately.

**2. What's already on this desk.** Three of the four legs are built, and her stated open
problem is already solved here.
- **She asks "is the yield rise growth or inflation? We actually don't know."** This desk
  answers exactly that, with arithmetic rather than inference: `ratesSplitLine` decomposes
  the 10-year into **real + breakeven** and names the driver —
  `dominant = |real| >= |bei| ? 'REAL-RATE' : 'INFLATION-EXPECTATION'`. It also refuses to
  attribute at all when the three series printed on different days, rather than comparing
  one day against another. Her question has a sharper answer here than a prediction market
  would give, because it is an identity rather than a crowd's opinion.
- Equities-as-mood, treasuries-as-demand and options-as-uncertainty are the board, the chain
  and the vol stack respectively. Her VIX framing is the one already banked as the house rule
  — vol is about size, never sign.
- **Prediction markets are absent entirely.** Nothing in the repo touches Kalshi, Polymarket
  or PredictIt.

**3. Trading claim or macro-understanding claim.** Macro-understanding, and the most complete
statement of the method any clip in this log has given. Nothing to pre-register.

**4. Display nugget — and an honest check on the prediction-market idea.** Both venues are
**free and keyless**: Kalshi's `trade-api/v2/markets` and Polymarket's `gamma-api` both
returned 200 with `question`, `outcomePrices`, `volume` and `liquidity` in hand. So the feed
is possible.

**But the macro markets are not the liquid ones.** Kalshi's first 200 open markets contained
**zero** macro-relevant contracts; Polymarket's **top 60 by volume** contained zero. Both are
dominated by politics and sport. That does not prove the macro markets are absent — neither
sample was a proper series query — but it does establish the shape of the problem: **a thin
market's "probability" is a handful of trades, not a consensus.** Quoting 23% from a contract
with four-figure volume as "the market's probability of a recession" would be the same error
as a percentile computed over no cycle. Liquidity has to be checked before any price from
there is repeated.

**5. Verdict and action.**
- **Nothing to build from the framing** — it is the house method, stated more cleanly than
  the house states it.
- **The one thing worth taking** is her insistence that each market answers a *different
  question*. The board currently shows all four kinds of information side by side without
  labelling which question each one answers. That is a presentation idea, free, and it is
  the clearest articulation of it anyone has offered.
- **Prediction markets: a candidate, with a precondition.** They would fill the Fed-easing-
  bets gap logged against her domino clip (which needs fed funds futures, and CME 403s). But
  the precondition is a **liquidity floor** — a minimum volume and open interest below which
  a contract's price is not quoted at all. Without that this would import exactly the
  false-precision problem the catalogue was built to stop.

---

## 2026-10-02 — Jess Inskip, "The repo market map" (parts 1 and 2)

> *Part 1:* *"Cash comes with interest... treasuries are collateral. [Banks, primary
> dealers, non-bank financial institutions] are all matched up within this repo market. One
> needs to earn interest from cash, the other needs to borrow cash... sells a treasury and
> agrees to buy back that same treasury at a higher price. The difference of those
> transactions, that's interest... and this determines the SOFR. If there is more cash
> needed... like everyone needs to make all their tax payments all of a sudden and are
> pulling from money markets, [that] can spike up SOFR rates overnight."*
>
> *Part 2:* *"Money markets cannot access the discount window... if there's only one place I
> can go to borrow cash, well they could charge you a very very high rate... So the Fed
> created the standing repo facility... **if you see increased usage of the standing repo
> program, it doesn't mean that something is collapsing. It means that you can borrow cash
> from the Fed at a better rate than you can at the repo market. What the Fed put into
> action is working.**"*

**This is the first clip in either log whose central claim this desk had already tested —
and the first where the desk's own written prior was the thing that lost.**

**1. The claim, stated plainly.** Two testable ones, cleanly separable:
- **(a) Mid-month cash demand drives SOFR.** Tax payments and settlement pull cash out of
  money market funds, which forces them to raise cash in repo, which bids up the overnight
  rate. A *calendar* mechanism, explicitly not a stress mechanism.
- **(b) SRF usage is benign, discount window usage is not.** Drawing the Standing Repo
  Facility is arbitrage — you borrow where it is cheaper — and signals the ceiling working.
  Borrowing at the discount window is a last resort and a red flag. The distinction is the
  claim; either half alone is not.

**2. What's already on this desk.** All of it. Every player on her map is a series already
being pulled, and the catalogue's `policy` group *is* her diagram: `SOFR`, `IORB` (the floor
the corridor sits on), `RPONTSYD` (the SRF), `RRPONTSYD` (reverse repo), `WLCFLPCL` (the
discount window), `EFFR`, `DFEDTARU`.

**Her (a) names the mechanism behind a result banked yesterday.** `funding-stress`
(2026-10-02, NULL) found that with month-end excluded, **12 of the remaining 15 SOFR
episodes land on the 14th–18th of a month.** The study recorded that as "mid-month tax and
settlement dates" — a label, with no transmission chain behind it. She supplies the chain:
withdrawals from money market funds → funds must raise cash → repo demand → higher buyback
price → higher SOFR. **The desk found the artefact; the clip explains it.** That is the
first time a clip here has done that in this direction.

**Her (b) is the claim `funding-stress` S2 tested — and the desk lost its own bet.** The
pre-registered expectation was that a drawn SRF precedes *wider* ranges. It came back the
other way: SPX500 next-5-session range **−0.561 ATR [−0.984, −0.181]** against an
ATR-quintile-matched control, negative in both halves. Markets are **calmer** after the
facility is used. And the SRF is drawn on **667 of 2,123 sessions — 31%**, which is routine
plumbing, not an alarm. Her framing predicts exactly this; the desk's did not.

**3. Trading claim or macro-understanding claim.** Macro-understanding, and it should not be
converted into a trade. Note precisely where she goes one step further than the evidence
allows: `funding-stress`'s own `use` note says the negative is reported **as measured and
NOT as evidence the backstop works** — because with usage that routine, SRF days are mostly
ordinary days, and the sample begins in 2018 and contains no crisis at all. She concludes
"what the Fed put into action is working." **Her mechanism is right and her conclusion
over-reaches by exactly the one step the study declined to take.** The study cannot see the
counterfactual; neither can she.

**4. The display nugget — and the first genuinely strong follow-up any clip has produced.**
`WLCFLPCL` is pulled, is read by `rates` and `weekMap`, and carries **`evidence: []`** — it
has never been tested. Her clip supplies the sharp, falsifiable distinction that makes it
worth testing, and the data is already in hand:

- **1,242 weekly observations, 2002-12 → 2026-09.** It spans **two real bank crises** —
  2023-03-15 at **$152.9bn** (SVB, the all-time high) and 2008-10-29 at **$110.7bn**. This
  is the thing the SRF sample lacked, and `funding-stress` named that gap itself: *"the open
  question this still does not answer is whether funding stress matters when the facility is
  NOT there to cap it."* The discount window reaches back through two periods where it was.
- **But the same trap applies, and it has to be designed around from the start.**
  **94.7% of weeks are non-zero** — so "the discount window was used" is as meaningless as
  "the SRF was drawn" at 31%. The level is the signal; the usage flag is not. Any
  pre-registration starts from a level or a deviation, never a binary.

**A live reading, flagged with its caveat rather than as a finding.** The latest print
(2026-09-30) is **$8.74bn** — the 97th percentile since 2024, the 89th since 2002, up 12%
over thirteen weeks. That looks notable and probably is not, for two reasons the desk has
already learned twice: against the 2023 peak of $152.9bn it is a rounding error, so the
high percentile is **computed over a quiet regime with no cycle in it**; and the print lands
on **30 September — a quarter-end**, which is the precise balance-sheet-dressing artefact
that killed the 99th-percentile SOFR read in `repo-stress-range` and then killed it again in
`funding-stress`. A quarter-end spike in a funding metric is the null hypothesis here, not
the finding. **Worth watching from the next few prints; not worth repeating as stress.**

**5. Verdict and action.**
- **Mechanism: CONFIRMED as an explanation, for a result already banked NULL as a signal.**
  Both halves of her picture match what the data did. Nothing to re-test.
- **Catalogue update earned.** The `SOFR` trap currently says "mid-month tax and settlement"
  with no transmission behind it. It should carry the chain, because a trap a reader can
  *reason about* survives better than one they have to memorise.
- **One pre-registration worth writing: `discount-window-stress`.** Level-based, never a
  usage flag; weekly cadence; episode-level not week-level (2008 and 2023 are two events,
  not ninety weeks); and it must be mirrored. It is the only follow-up in this entire clip
  log that both closes a stated open question and has its data already on the desk.
- **Credit where it is due.** This is the first clip of the nine where the presenter's
  framing would have produced a *better written prior* than the one the desk pre-registered.
  Worth remembering the next time a plumbing claim gets a prior assigned by instinct.

---

## 2026-10-02 — Jess Inskip, Greeks series: Delta (parts 1–2) and the four-quadrant board

> *"Delta is on a scale from negative one to positive one... if you combine together multiple
> contracts or even an entire portfolio, you'll get a net delta, and then you'll understand
> your directional risk... When you create a covered call, you are capping your upwards
> potential... You've reduced your net deltas."*
>
> *The 2×2:* calls left, puts right, bullish top, bearish bottom. Long options: time decay
> negative, profit from a **sharp** directional move, profit from an **increase** in IV.
> Short options: time decay positive, profit from a **slight** move, profit from a
> **decrease** in IV.

**Pure pedagogy — nothing falsifiable about markets in either clip. But auditing it against
the desk produced the most significant gap found in this entire log.**

**1. The claim.** There isn't a market claim; it is a definitional framework, and it is
correct as stated. The 2×2 is the cleanest compression of option mechanics in the series:
every cell derives from two binary choices (bought/sold, call/put), and the four Greek signs
follow from those rather than needing to be memorised.

**One precision note, recorded because the desk holds delta data.** She says a 0.5 delta
"is a 50% probability of being in the money... which should make perfect sense." That is the
standard desk approximation and it is close enough for a 22-day at-the-money contract, but
it is **not an identity**: delta is N(d₁), while the risk-neutral probability of expiring
in the money is N(d₂). They separate as time and volatility grow. She presents it as
self-evident; it is an approximation that happens to be good where she demonstrates it.
Worth having written down somewhere before anyone here reads a delta as a probability.

**2. What's already on this desk — more than expected, and that is the problem.**
`js/ai.js` builds an options block for the AI prompt carrying `maxPain`, `callWall`,
`putWall`, `pcRatio`, `gex`, **`dex`**, `gammaFlip` and `callWalls`. So delta is here, as
`dex` — dollar delta exposure — which is precisely her "net delta across a portfolio tells
you directional risk", aggregated across a book.

**Two of those fields are not data but hard-coded interpretation, and both are sent to a
paid model as assertions:**

```js
pcBias:  inst.pcRatio > 1.3  ? 'BEARISH (put-heavy — market hedged down)'
       : inst.pcRatio < 0.77 ? 'BULLISH (call-heavy — market positioned up)' : 'NEUTRAL',
gexRead: gex > 0 ? 'Positive GEX — dealers long gamma, dampening moves, mean-reversion bias'
                 : 'Negative GEX — dealers short gamma, amplifying moves, breakout risk',
```

The same long-gamma/short-gamma rule drives `js/levelExpectation.js`, where it is the single
rule separating **Reject** from **Break**: *"in a calm (long-gamma) band hedging fights the
move so levels hold; in a jumpy (short-gamma) band hedging feeds the move so the same level
gives way."* That read is exported to the C+Z paste and the Pine indicator.

**3. THE FINDING: the gamma-regime claim has never been scored.** `js/deskEvidence.js` holds
**81 entries. Not one of them is a verdict on it.** The only occurrence of "gamma" in the
ledger is incidental — a sign-convention check inside the max-pain audit. There is no entry
for GEX, none for DEX, none for `pcRatio`, and the 1.3 / 0.77 thresholds (reciprocals, so
symmetric in logs, which is at least defensible) have no recorded provenance.

**A harness for it already exists and was never banked.** `analysis/gamma_band_realised.py`
(2026-08-23) carries a written prediction in its own source — *"deeper into long gamma =
quieter"* — which is the pre-registration. It was built to answer exactly this and the
result never reached the ledger.

This is the live asymmetry her clip exposes. She is scrupulous about separating what a Greek
**is** (a sensitivity, a rate of change) from what it **predicts** (on its own, nothing).
The desk converts a gamma *sign* into a *forecast* — "mean-reversion bias", "breakout risk"
— inside a prompt that costs money to run and inside a level engine whose output is
exported. Two adjacent OI claims have already failed here: `oi-max-pain` is NULL, and the
wall-touch read was found to be an artefact (walls reject no better than neighbouring
strikes). The gamma-regime rule sits in the same family and has had none of that scrutiny.

**4. Display nugget.** Second clip in a row to land on the same hole: **`js/glossary.js` has
57 entries and exactly one option-adjacent** (`oi-regime`, aliasing PIN / ACCELERATE /
gamma). The board prints `maxPain`, `callWall`, `putWall`, `pcRatio`, `gex`, `dex`,
`gammaFlip`, `riskReversal`, `ivTermStructure` and `expectedMove` with no definition behind
any of them. The T-chart clip flagged this; this one supplies the actual teaching content
for the root concept underneath all of them.

**5. Verdict and action.**
- **Nothing to test in the clips.** Definitional, correct, and the best-built teaching
  artefact anyone has sent. Her 2×2 is designed as a reference card, which is what it should
  become here — not prose.
- **Priority raised above the glossary: bank or kill the gamma-regime rule.**
  `analysis/gamma_band_realised.py` already holds the pre-registration; it needs running,
  mirroring, and an entry. Until then, `gexRead` and `levelExpectation`'s Reject/Break split
  are the most load-bearing untested assertions on the desk — they reach a paid prompt, a
  level engine, the C+Z export and the Pine indicator.
- **Record the delta-is-not-quite-a-probability point** wherever `dex` gets explained, so the
  approximation is never silently promoted to an identity.

---

## 2026-10-02 — Jess Inskip, Greeks series: long put and short put

**Definitionally these complete the 2×2 already logged above and add nothing new to test.**
Same mechanics, remaining two cells, correct as stated. Logged short on purpose — a clip
that restates a framework already passed does not get a second full pass.

**Two things in them are new, though, and one lands on a live assertion.**

**(a) Payoff asymmetry, which the 2×2 board does not carry.** The short-put clip adds what
the four-quadrant board leaves out: *"losses can be substantial because the stock can only
go to zero."* Max gain is the premium received; max loss is strike minus premium. The board
encodes the **signs** of direction, time and IV, but not the **shape** of the payoff — and
the shape is what sizes a position. Not actionable here (nothing on this desk sells options)
but it is the honest caveat on an otherwise complete teaching artefact.

**(b) THE FINDING: a put is not a direction, and the prompt says it is.** Across these two
clips her whole point is that the same instrument means opposite things depending on which
side you hold: a **long** put is bearish, a **short** put is **bullish**. The contract is
identical; the sign comes from who initiated.

`js/ai.js` asserts otherwise, to a paid model:

```js
pcBias: inst.pcRatio > 1.3  ? 'BEARISH (put-heavy — market hedged down)'
      : inst.pcRatio < 0.77 ? 'BULLISH (call-heavy — market positioned up)' : 'NEUTRAL',
```

And `js/oi.js:2428` shows what feeds it:

```js
const pcRatio = totalPutOI / Math.max(totalCallOI, 0.01);
```

**Pure open interest.** `oi_recon/fetch_oi.py` captures `openInterest` and `volume` and
nothing else — no bid/ask classification, no trade-initiator side. Open interest counts a
contract once regardless of who opened it, so a put-heavy book is equally consistent with
puts **bought** as hedges (bearish, as the prompt assumes) and puts **sold** for premium
(bullish, which is her short-put clip exactly). The data cannot distinguish them, and
`volume` would not resolve it either without side classification.

So "put-heavy — market hedged down" is an **interpretation presented as a reading**, resting
on an assumption about initiator that the capture does not carry. It may well be the right
prior — retail and institutional put buying for protection is real — but it is a prior, it
is unlabelled, and like `gexRead` it has no entry among the ledger's 81.

**Verdict and action.**
- **Nothing to test in the clips themselves.** Framework already covered.
- **`pcBias` joins `gexRead` on the same list**: two hard-coded interpretive sentences going
  into a paid prompt, neither scored, both in an OI family where max pain came back null and
  wall-touch came back an artefact. Whatever is done about the gamma rule should cover this
  one in the same pass — they share a harness, a data source and a failure mode.
- **Cheapest honest fix if neither gets tested soon:** make the prompt state the assumption
  rather than hide it — "put-heavy; direction depends on initiator, which this data does not
  carry" is both shorter and true.

---

## 2026-10-02 — Jess Inskip, "the market is an anxious man" (volatility and triggers)

> *"Volatility just means uncertainty... we need to understand their triggers... a rise in
> unemployment — people don't have jobs, they're not going to spend money, businesses aren't
> going to make money... interest rates increasing, it's going to cost more to borrow...
> artificial intelligence — an increase in productivity, we can do so much more with less."*

**The analogy is a teaching device and is not scored.** What is scorable is the three causal
chains she hangs on it, and this desk has a direct verdict on one of them.

**1. "Volatility just means uncertainty" — the loose version of a lesson that cost real
money here.** The sharper statement, learned the hard way on 2026-09-29, is that
**volatility is variance and variance is not direction**. Reading the HMM's "RANGE" state as
*directionless* rather than *quiet* hid a full dollar move on 8 of 14 pairs, and the fix was
a separate structural travel read (`js/travelRead.js`). "Uncertainty" invites exactly that
conflation. Worth noting too that this framing sits in mild tension with her own VIX clip
already in this log, whose entire point was that VIX is **not** a fear gauge; here fear of
the unknown is reintroduced as the driver. Both are framings rather than facts, so neither
is scored — but the desk should keep the harder definition.

**2. The interest-rate chain is TESTED, and null three separate ways.** Her second trigger —
rates up, therefore stocks down — is the most-tested folk chain on this desk:
- `yields-to-fx-direction` (2026-08-23, **null**): forward coupling null; the relationship
  is real only within the same bar. *"Never write that a yield move implies where a pair
  goes next."*
- `front-end-shock` (2026-09-17, **null**): a 2Y ±14bp weekly shock does not mean a volatile
  following week — and the sign **reverses**. After a hawkish 2Y shock, EUR/USD and GBP/USD
  ran **calmer** (−0.34 and −0.28 ATR, CIs clear of zero).
- `growth-vs-yields` (2026-09-17): the NQ range effect is real, but **yields are a
  passenger** — rates up with NQ flat is null. One-leg controls are what separated cause
  from passenger.

So the chain is intuitive, universally repeated, and does not survive a control. That is the
single most repeated finding on this desk.

**3. The AI/productivity chain is not testable here** and is logged as such rather than
guessed at. No productivity series is wired, and a multi-year structural claim is not
something a daily-bar harness can address.

**4. THE FINDING: her unemployment chain pointed at a hole in the catalogue's own guard.**
Checking whether the desk could test "unemployment → spending → earnings → equities", the
first answer looked like "no labour data" — and that was **wrong**, which is the fourth time
this session that reflex has been wrong. The desk has a great deal of it:
`js/laborMarketEngine.js` is a 470-line scoring engine over roughly thirty series (`PAYEMS`,
`UNRATE`, `CIVPART`, `AWHAETP`, JOLTS `JTSJOR`/`JTSQUR`, the US sector payroll split, plus
foreign wage and unemployment legs). `js/ismEngine.js` carries business confidence for six
countries. `js/econTrendEngine.js` holds unemployment and rates for eight currencies.

**None of it is in `js/dataCatalogue.js`.** The catalogue has 91 entries across ten groups
and its `growth` group contains exactly **one** (`DGORDER`). `UNRATE`, `PAYEMS`, `ICSA`,
`CFNAI` and `INDPRO` are all absent while being read by live engines.

**And the catalogue's header claims a test prevents precisely this:**

> *"KEPT HONEST BY A TEST. js/dataCatalogue.test.mjs asserts every FRED id reachable in the
> code appears here and vice versa, so the catalogue cannot quietly drift from what the
> server actually fetches."*

**The test passes, 9 of 9, and that claim is false.** It is guarded by two allowlists:
- a **hard-coded list of nine files** (`server.js`, `_worker.js`, `js/weekMap.js`,
  `js/macroCore.js`, `js/volForecastBench.js`, `js/fredActuals.js`, `js/cpiEngine.js`,
  `js/creditStressEngine.js`, `GlobalLiquidity/backtestCore.mjs`) — while **28 engines in
  `js/` reference FRED**, only three of which are on that list; and
- a **regex enumerating only the id families already catalogued**, so `UNRATE`, `PAYEMS`,
  `ICSA`, `CIVPART`, `JTSJOR` and the rest cannot match even if their file were scanned.

**The guard can only ever rediscover what it already knows.** A new engine is invisible to
it, silently, and the test goes green. This is the same shape as the `svcInterval` registry
and the second KV TTL gate: a check that passes while not checking.

**5. Verdict and action.**
- **Clip: nothing to test.** One chain already null three ways, one untestable, one pointing
  at a data gap that turned out to be a *catalogue* gap.
- **Fixed now:** the catalogue header no longer claims a guarantee the test does not provide,
  and the test file records what its two allowlists actually cover.
- **Offered, not done:** widening the scan to all 28 FRED-touching engines and cataloguing
  what it finds. That is real work — likely several dozen series needing a `why`, a `readBy`
  and an evidence list — and it is the user's call.
- **A genuine study is now visible:** the labour chain has thirty-odd series, a live scoring
  engine, and no entry in the ledger's 81.

---

## 2026-10-02 — Jess Inskip, Greeks series: long call and short call (series complete)

**The final cell pair. With this the 2×2 is fully covered and the framework is closed** —
long call, short call, long put, short put, each with its direction, time-decay sign and IV
sign. Correct throughout, nothing new to test, logged short on purpose.

**Two things worth keeping.**

**(a) The payoff asymmetry is itself asymmetric — and her board hides that.** The earlier
entry noted the 2×2 encodes the *signs* of direction, time and IV but not the *shape* of the
payoff. This clip completes the point and shows the shape is not even consistent across a
row. On the short side: a **short put** is bounded (max loss = strike − premium, since the
stock stops at zero) while a **short call** is genuinely **unlimited**. The board puts them
in the same row with the same three signs. They are not the same risk, and no Greek on the
card tells you which one you are holding. That is the single real gap in an otherwise
excellent teaching artefact, and it is the part that matters most for sizing.

**(b) It supplies the mechanism behind the desk's untested gamma claim.** The reason a short
call is dangerous is the reason dealers *must* hedge it dynamically: unbounded loss cannot be
left unhedged, so the position is delta-hedged continuously, and that forced hedging is the
entire basis of the gamma story — buying into strength and selling into weakness when long
gamma (damping), the reverse when short (amplifying). That is exactly what `gexRead` asserts
in `js/ai.js`.

**So the mechanism is sound, and that still is not evidence.** This is the same split the
repo-market clip produced: her transmission chain was right and her conclusion ("the backstop
is working") went one step past what the data could show. A plausible mechanism makes a claim
worth testing; it does not substitute for the test. `js/deskEvidence.js` still holds no
verdict on the gamma regime across its 81 entries, and `analysis/gamma_band_realised.py`
still holds a written prediction that was never run to a banked result.

**Verdict.** Nothing to test in the clip. The Greeks series as a whole is the best teaching
material in this log and the strongest case for the Theory Lab sequence; it has now produced
three separate pointers at the same place — `gexRead`, `pcBias`, and a glossary with 57
entries and one option term.

---

## 2026-10-02 — Jess Inskip, "what is a covered call"

**Largely a restatement** — the covered call already appeared in her delta clip as the
worked example for net delta (long 100 shares at 1.0, short a 0.2-delta call, net 0.8).
This adds construction detail and the strike-selection tradeoff (lower strike, more premium,
less room to appreciate), which is the moneyness relationship restated. Short entry.

**(a) The gap in her own series: a covered call IS a short put.** Long stock plus a short
call produces the same expiry payoff as a naked short put at that strike — capped upside at
the strike, premium collected, downside running all the way to zero less the premium.
(Exactly so at expiry and for the same strike; dividends, financing and early assignment
separate them in practice.) Her 2×2 cell for the short put — *bullish, time decay positive,
profits from a slight move up, profits from a decrease in IV* — is a word-for-word
description of the covered call she presents here as a different strategy. **The series
teaches them in separate videos and never connects them**, which is the one genuine
pedagogical miss in an otherwise unusually careful sequence. If the Theory Lab sequence gets
built, that equivalence is the lesson worth adding rather than copying.

**(b) "It's actually very conservative" is a framing, not a measurement.** The premium
cushions the downside by its own size and nothing more; max loss is the whole stock position
less $500 on a $10,000 outlay. Conservative *relative to holding the stock outright*, by
0.5% of capital. Not scored — it is a characterisation, and the slack rule applies — but
recorded because "conservative" is doing a lot of work in that sentence.

**(c) It sharpens the `pcBias` finding with the most important real-world case.** The entry
on her put clips noted that open interest cannot tell a bought put from a sold one. The
covered call is the sharper version on the *call* side: systematic overwriting — the large
income ETFs and institutional buy-write programs — sells calls continuously, and by her own
framing that seller is **neutral short term with capped upside**, not bullish.

That flow lands in `totalCallOI`, lowers `pcRatio`, and `js/ai.js` tells a paid model:

```js
pcRatio < 0.77 ? 'BULLISH (call-heavy — market positioned up)'
```

**So the single most common institutional options strategy produces exactly the open-interest
signature the prompt reads as bullish conviction.** Nothing in the live code models
overwriting flow; the strategy is documented only in `education/151 Trading Strategies.md`
(§2.2), which is a reference text, not a feed.

**Verdict.** Nothing to test in the clip. It is the third independent route to the same
conclusion: `pcBias` and `gexRead` are interpretations shipped as readings, and open interest
does not carry the side that would justify either.

---

## 2026-10-02 — Jess Inskip, "how a 10-year Treasury note works"

> *"Price and yield have an inverse relationship... $50 on $1,100 is actually 4.5%... The
> Fed can buy these securities, that's quantitative easing... if they buy a lot of
> treasuries that could stimulate the economy because it's going to increase the price,
> lower the yield... I am a foreign entity that owns a lot of these, I could offload them
> and sell them, causing the price to go down but the yield to increase."*

Mechanics are definitional and correct. **Three claims in it are testable, and the desk is
missing the data for two of them — a real gap this time, verified against the repo rather
than the catalogue, since the catalogue is now known to be incomplete.**

**(a) A precision note on the series the desk reads most.** Her worked example computes
coupon ÷ price — **current yield**. `DGS10` is a constant-maturity **yield to maturity**,
which also amortises the pull-to-par of the premium or discount over the remaining life.
They are not the same number: $50 on $1,100 is 4.55% current yield but roughly 3.9% YTM on a
ten-year. Nothing here is wrong for teaching the inverse relationship, but **`DGS10` is the
single most-read series on this desk**, and anyone reconstructing it as coupon-over-price
will not reproduce it. Worth having written down once.

**(b) "The ten-year is tied to your mortgage" — NOT TESTABLE HERE, and cheaply fixable.**
There is no mortgage series anywhere: `MORTGAGE30US` appears in no file under `js/`,
`analysis/`, `server.js` or `GlobalLiquidity/`. It is free on FRED, weekly, back to 1971.
The claim is near-universally repeated and the spread (30y mortgage minus 10y Treasury) is
itself a well-known credit/convexity indicator that widened sharply in 2023. **A genuine gap,
small to close.**

**(c) "Foreign selling pushes yields up" — NOT TESTABLE HERE.** `FDHBFIN` (foreign holdings
of Treasuries) is absent, as is `TREAST` (the Fed's own Treasury holdings). The catalogue's
`foreign` group holds 17 entries and every one is a foreign *interest rate* (`IRLTLT01…`),
not a holdings series. Note the practical limit before anyone gets excited: TIC data is
monthly and published on roughly a six-week lag, so this can answer a structural question
and never a tradeable one.

**(d) THE CANDIDATE: her QE claim is both famous and genuinely contested, and the desk can
test a version of it now.** *"If they buy a lot of treasuries... it's going to increase the
price, lower the yield."* The mechanism is sound — a large price-insensitive buyer lifts
price. **The net effect is what is disputed**: across the actual QE program windows, 10-year
yields frequently **rose**, because the growth and inflation expectations the purchases were
meant to create push the other way harder than the price pressure pushes.

That is exactly the **passenger** pattern this desk has already found twice — rates moving
*with* a story rather than driving it (`growth-vs-yields`), and a famous spread dying to a
control (`curve-inversion`). And `WALCL` is catalogued, long-history, and carries evidence
ids for `repo-stress-range` and `stock-bond-flip` but **nothing on yields**.

**The study almost writes itself, and it must be mirrored.** If balance-sheet *expansion* and
balance-sheet *contraction* are followed by the same yield direction, it is a period artefact
— the mirror that killed `breadth-narrowing` and `curve-inversion`. `WALCL` is weekly and
includes MBS and everything else, so it is a proxy for the Treasury-purchase leg; `TREAST`
would be the clean series and is not pulled. Episode-level, not week-level: QE3 alone would
otherwise contribute hundreds of observations, the same collapse that reduced fifty years of
curve data to ten episodes.

**Verdict.** Nothing wrong in the clip. One precision note worth keeping, two honest data
gaps found by checking the repo rather than trusting the catalogue, and **one pre-registerable
study on a claim that is repeated everywhere, has the data mostly in hand, and has never been
scored among the ledger's 81 entries.**
