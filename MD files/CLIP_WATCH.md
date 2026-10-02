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
