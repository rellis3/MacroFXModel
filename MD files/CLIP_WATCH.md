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
