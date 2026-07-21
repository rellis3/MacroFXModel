# Quantitative Momentum (Gray & Vogel) — what maps here, what's already built

> Distilled from a thread on *Quantitative Momentum* (Wesley Gray & Jack Vogel),
> via Goshawk Trades (28 Jan). **Unlike the PTJ interview
> (`PTJ_TRADING_LESSONS.md`, ~null folklore), this one sits on a replicated
> factor.** Momentum — time-series/trend and cross-sectional — is on
> `CLAUDE.md`'s short list of edges with genuine, decades-long, multi-market
> evidence. So the ideas here are worth taking seriously *as literature*, not
> just vibes.
>
> Honest prior: the book is about **US equities** (rank 500+ stocks, hold the
> top ~50). Most of its systematic chapters are **already implemented** in this
> repo's `trendBasketEngine.js`. The genuinely new, transferable, *testable*
> idea is one chapter — momentum **quality** (Frog-in-the-Pan) — and it maps
> onto a brick we already own but don't yet use that way (`dayTypeScore` =
> drift÷diffusion). That's the whole reason this doc exists.

---

## The headline

**Chapters III–VI describe the engine we already have.** `trendBasketEngine.js`
is a vol-scaled, weekly-rebalanced, cost-netted G10 momentum basket — its own
header calls it "the first thing in this repo with decades of academic +
practitioner evidence BEFORE testing." So the book mostly **confirms the design
is right**, it doesn't hand us anything new there.

**Chapter II — momentum *quality* (Frog-in-the-Pan) — is the one new hook**, and
it's a clean, cheap, pre-registerable OOS test because we already have the
measure. Everything below separates "already built / confirmation" from
"actually new / go test it."

---

## Book chapter → what already exists here

| Book idea | Status in this repo |
|---|---|
| **I. Why momentum works** (behavioral under-reaction + career-risk premium; "works because it's painful") | **Confirmation.** This is *why* `trendBasketEngine` exists and why its header insists it's "deliberately boring — small Sharpe, real drawdowns." The pain/career-risk framing is the honest reason the premium survives; nothing to build. |
| **III. Concentration > diversification** (hold top ~50 of 500; returns are power-law) | **Partly N/A for FX.** The basket already sizes by inverse-vol across G10 — but with only ~10 currencies you *can't* concentrate into "top 50 of 500." FX dispersion is thin; the concentration argument is an equity-universe argument that largely doesn't transfer. Note it, don't force it. |
| **IV. Rebalancing & transaction costs** (calendar vs threshold; costs compound) | **Already built.** Basket rebalances weekly, net of costs. The book's hybrid (calendar + drift-threshold override) is a *candidate refinement* to A/B, not a gap — and only worth it if the cost saving clears the added complexity OOS. |
| **V. Absolute (time-series) vs relative (cross-sectional) momentum** | **Already built — both.** The basket is explicitly "cross-sectional / time-series momentum … long if 12-month trend up, short if down." The market-neutral long/short framing is exactly its construction. |
| **VI. What NOT to do** (don't over-diversify, don't rebalance too slowly, expect multi-year drawdowns) | **Confirmation.** Matches the engine's design notes and `CLAUDE.md`'s "modest, drawdown-heavy diversifier, not a wealth engine" honesty. |

---

## The one genuinely new, testable idea: momentum QUALITY (FIP)

> Two names both +50% over 12 months. **A** got there smoothly (continuous
> information → investors under-react → it continues). **B** got there in one
> lottery spike (discrete jump → over-reaction → it mean-reverts). Rank by
> *smoothness*, not raw return. In equities, high-quality (smooth) beat
> low-quality (jumpy) momentum by ~4%/yr over 1927–2014.

This is the **Frog-in-the-Pan** result (Da, Gurun & Warachka 2014). It is a real
published effect, and it maps almost exactly onto a brick we already own:

- **`dayTypeCore.js` → `dayTypeScore` = drift ÷ diffusion** ("trend-day-ness T").
  A smooth trend is **high drift-to-diffusion**; a spiky, lottery-like move is
  low. That is the same quantity the book's author says he adapted ("measure
  daily volatility relative to total return"). We built it for the fade/follow
  forecaster and **never wired it into the trend basket as a quality filter.**

### The pre-registerable test (this is the actionable output)

Add a **path-quality gate** to `trendBasketEngine` as a *selector*, not new
tunables (Lego Principle 4):

- For each currency, compute a smoothness score over the momentum lookback —
  either `dayTypeScore`-style drift÷diffusion, or the classic FIP `ID`
  (sign of period return × [%up-days − %down-days]).
- **Keep only the smooth trends**; drop the jumpy ones from the long/short legs.
- A/B the filtered basket vs the raw basket on the **OOS card**, net of costs,
  ≥30 OOS rebalances. It "wins" only if it beats the incumbent basket on OOS
  Sharpe — in-sample improvement is not evidence (Principle 5).

**Pre-register both outcomes now** (per `CLAUDE.md` / `PREREGISTERED_EVALUATIONS.md`):
- *"It worked"* = the quality-filtered basket beats the raw basket on **OOS**
  Sharpe by a non-trivial margin with the trade count intact, and the effect is
  IS-consistent (not one subsample).
- *"It didn't"* = OOS Sharpe flat or worse, or the filter just thins the book
  until N collapses. **This is the expected default** — see the caveat below.

### Honest odds on this one

Real but modest. **~25–35%** it survives OOS in FX after costs, and I'd frame
that as "worth one cheap test," not "promising."

Why the discount vs the equity result:
- **FX universe is ~10 currencies, not 500.** The FIP edge in equities feeds on
  wide cross-sectional dispersion — sorting hundreds of names by quality. With
  ten currencies there's little to sort; the concentration/dispersion machinery
  the effect relies on is mostly absent.
- **Quality-as-time-series filter is the more plausible FX form** — i.e. use `T`
  to gate each currency's *own* trend (trade only smooth trends), rather than
  cross-sectionally rank ten names. That's the version to test first.
- FIP is documented in equities; **its transfer to FX is unproven.** A null here
  would be an ordinary, useful result, not a failure.

---

## What's anecdote, not evidence

- The thread author's crypto results ("filtered out lottery tokens," "top 20–100
  tokens") are **personal anecdotes**, not the book's evidence. Crypto's
  power-law is real but the specific numbers are one person's live P&L — treat as
  colour, not data.
- "Momentum works because it's painful / career risk" is a *plausible mechanism*
  and matches the literature, but as stated it's unfalsifiable narrative. The
  falsifiable claim is the return series, which is what the basket tests.

---

## Bottom line

1. **The systematic core of the book is already built** (`trendBasketEngine.js`)
   — this thread mostly confirms that engine is designed the way the literature
   says it should be. That's a real, if quiet, positive: the honest trend-premium
   engine is on solid ground.
2. **One new, cheap, pre-registerable test**: wire the momentum-**quality** idea
   (Frog-in-the-Pan) into the basket using the `dayTypeScore` (drift÷diffusion)
   brick we already own, and A/B it OOS. Default expectation is null in FX
   because the universe is thin — but it's a one-brick, one-selector test that
   costs almost nothing to run, and it reuses existing bricks instead of adding
   surface.

No new edge claimed. The momentum *factor* is real; whether the *quality filter*
improves the FX basket after costs is an open question we can now answer cheaply.

---

## Status — the quality filter is now BUILT (2026-07-21)

The test above is wired, not just proposed:

- **`js/trendQuality.js`** — `trendQualityScore` (drift÷diffusion or Frog-in-the-Pan
  `fipID`) + `makeQualityDirection`, composed onto `trendBasketEngine` via its
  existing `directionAt` hook (the validated engine is untouched). Parameter-free
  selector: each rebalance keeps the top-half of trending currencies by path
  quality (cross-sectional median split). Unit-tested (`js/trendQuality.test.mjs`).
- **`/api/trend-basket`** now returns a `qualityAB` block (raw basket vs
  quality-filtered, ΔOOS Sharpe, verdict) and **`trend-basket.html`** shows a
  Frog-in-the-Pan A/B panel.

**Verdict still PENDING** — it needs the real IS/OOS run on OANDA data (the
sandbox has no OANDA, so only the mechanics are validated so far). Run
`trend-basket.html` on the deploy and read the **OOS** row. Pre-registered
outcomes stand: it "wins" only if the filtered basket beats the raw basket on
**OOS** Sharpe with the book still ≥3 names; the honest prior remains **null in
thin FX (~25–35%)**. If it's null, bank it as a documented null — that's a win too.
