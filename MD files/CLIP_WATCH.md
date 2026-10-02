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
