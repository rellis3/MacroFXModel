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
