# Cross-Asset Trend — scope & design (managed-futures premium, done properly)

> Scope doc, written 2026-07-21 after the FX-only trend work (`trendBasketEngine`,
> `QUANT_MOMENTUM_LESSONS.md`) concluded the **FX sleeve alone is thin** (OOS
> Sharpe 0.15 ± 0.37 — indistinguishable from zero, and the Frog-in-the-Pan
> quality filter didn't rescue it). This is the plan for the honest next step:
> extend trend-following to **bonds + commodities + equity indices + FX**, where
> the replicated premium actually lives.
>
> **This is a scope, not a build.** It ends in decisions for the owner to make,
> not a merged engine. Nothing here is an edge claim yet.

---

## 1. The honest prior — read this first

**Cross-asset time-series momentum (TSMOM) is genuinely replicated.** It is on
`CLAUDE.md`'s short list of real edges ("time-series / trend momentum"), and the
evidence is unusually strong for this field:

- Moskowitz, Ooi & Pedersen (2012), *Time Series Momentum* — the canonical paper,
  ~58 futures across asset classes, positive and significant for decades.
- AQR, *A Century of Evidence on Trend-Following Investing* — the premium holds
  back to ~1880 across equities, bonds, commodities, FX.

So unlike the FX-quality filter (a ~25–35% long shot that came back null), this
has a **real prior**. But three honest caveats belong up front, not in a footnote:

1. **The premium has decayed.** Diversified trend ran ~1.0+ Sharpe pre-2000,
   compressed to ~0.3–0.5 (some windows near zero) post-2010. Crowding, lower
   vol, and central-bank suppression of trends all contributed. A 2005→2026
   backtest sits mostly in the *decayed* era — expect a modest number, and read
   the last 5 years separately (the ifo/DAX lesson in `CLAUDE.md`).
2. **The Sharpe comes from DIVERSIFICATION, not the signal.** A single-sleeve
   trend (like our FX basket) is thin; the ~0.5–1.0 historical Sharpe is what you
   get *after* combining 4+ weakly-correlated asset-class sleeves. This is
   exactly what the effective-number-of-bets brick (`diversificationCore`)
   measures — and it's why bonds are non-negotiable (below).
3. **Retail capture after costs is the hard part.** The academic premium is on
   *futures* (cheap, no financing drag). We can only trade **OANDA CFDs**, which
   carry overnight financing on a multi-week hold. That drag can eat most of a
   thin, decayed premium. This is the single biggest reason this could still
   disappoint — see §5.

**Blunt odds:** ~45–55% that a clean multi-decade backtest shows a positive,
better-than-FX-alone OOS Sharpe (the premium is real, so this is more likely than
not). But only **~25–35%** that it survives *realistic OANDA-CFD financing costs*
as something you'd actually trade. The research question and the tradeable
question have different answers — keep them separate (this doc does).

---

## 2. Why this is worth doing when the FX one was null

The FX basket wasn't wrong — it was *incomplete*. Seven USD-crosses are one
correlated bloc (the live-book ENB card shows this: they collapse toward ~1 bet).
The trend premium's edge is **low cross-correlation between asset-class sleeves**:
bonds trend up in a growth scare while equities trend down; commodities trend on
a different driver again. Combining them is what turns four thin ~0.2-Sharpe
sleeves into one ~0.5-Sharpe book — *if* the low correlation holds after costs.

This is not "add more knobs." It's the one principled way to chase a replicated
premium, and it reuses machinery we already built and validated.

> **The standing tension (name it):** `SYSTEM_ASSESSMENT.md` says the platform's
> gap is validation, not more surface — "prove one thing forward, don't build
> another engine." This build *adds surface*. It's justified **only** because
> (a) it's the replicated premium, not folklore, and (b) we've now shown the
> existing FX sleeve is thin, so extending it is the honest fix rather than a new
> speculative idea. If the owner would rather forward-validate something existing
> first, that is a legitimate call — this scope can wait.

---

## 3. The engine — already ~90% there

`js/trendBasketEngine.js` `runTrendBasket` is **already asset-agnostic**: it takes
`{ name: [{t, v}] }` price series, computes a trend sign, sizes by inverse
volatility (equal risk), rebalances, charges cost on turnover, and splits IS/OOS.
Nothing in the core is FX-specific. What a cross-asset version needs:

| Change | Where | Effort |
|---|---|---|
| **Broader universe** (add bonds/commodities/indices to FX) | new `CROSS_ASSET_UNIVERSE` in server, or a config | small |
| **Per-instrument sign source** — drop the USD-inversion assumption; each instrument's own price trend (an index/bond/commodity has no "invert vs USD" concept) | server universe wiring; engine already takes raw series | small |
| **Asset-class risk budgeting** — inverse-vol alone will over-weight low-vol bonds by *count* and under-weight them by *risk*; add a per-sleeve cap so no single asset class dominates (e.g. equal risk *per asset class*, then inverse-vol within) | new option in `runTrendBasket` (a selector, Lego-correct) | medium |
| **Cost model per instrument type** — CFD financing differs by asset (see §5); the flat `costBps` on turnover isn't enough for a hold strategy | engine cost hook + per-instrument cost table | medium |
| **Effective-bets on the sleeves** — reuse `diversificationCore` to report how many independent bets the book actually has (the whole thesis) | wire existing brick | small |

The core stays a single primitive parameterised (Lego Principle 2); the new logic
is a **selector** (asset-class budgeting) layered on top, not new bespoke legs.

---

## 4. The data decision — the crux (needs the owner's call)

Everything above is easy. **Data is the make-or-break**, and there's a real
tradeoff. The universe is fully *reachable* — OANDA CFD symbols for bonds
(`USB02Y_USD`, `USB10Y_USD`, `DE10YB_EUR`, `UK10YB_GBP`), commodities (`BCO_USD`
oil, `NATGAS_USD`, `XAG_USD` silver, `XCU_USD` copper), and indices (`SPX500_USD`,
`NAS100_USD`, `DE30_EUR`, `UK100_GBP`, `US30_USD`) are already referenced in
`server.js` and fetch through the existing symbol-agnostic `fetchOandaD1Range`.
The question is *which* source, because they answer different questions:

| Source | History | Pros | Cons |
|---|---|---|---|
| **OANDA CFDs** (`fetchOandaD1Range`) | Short — indices/bonds/commodities mostly **~2016→now** | *Exactly what you'd trade live*; one code path live+backtest (Lego Principle 1); already wired | **Too short for an honest IS/OOS** on a slow signal — a 12-mo lookback + 70/30 split leaves a tiny OOS; sits entirely in the decayed era |
| **Yahoo** (`fetchYahooOHLC` + registry `yahoo:` tickers: `^GSPC`, `GC=F`, `ZN=F`…) | Decades — `^GSPC` to 1927, `GC=F`/`ZN=F` to ~2000 | Long enough for a *real* multi-decade IS/OOS and a pre/post-2010 decay read | Free & **flaky** (rate limits; the agent proxy may 403 it); **futures continuations** have roll/splice artefacts; **not the instrument you'd trade** (backtest-vs-live mismatch) |
| **FRED** (yields: `DGS10`, `DGS2`, `de10y`…) | Decades | Clean, free, no-lookahead helpers exist | **Yields aren't tradeable returns** — you'd need to convert to bond *price* returns + carry; usable as a *signal* input but not as the traded series |

**Recommendation (two-phase, keeps the two questions separate):**

- **Phase 1 — research backtest on Yahoo long history.** Get the honest
  multi-decade IS/OOS + per-sleeve attribution + pre/post-2010 read on whether
  the diversified premium is even there after *modeled* costs. Label it clearly as
  research on futures continuations, **not** a live-tradeable result.
- **Phase 2 — only if Phase 1 survives OOS — OANDA-CFD forward/paper version.**
  Same engine, OANDA instruments, *realistic financing costs*, forward paper log.
  This is the one that answers "can I actually trade it."

Bonds are **mandatory** and the current registry gap — add them first (§6).

---

## 5. Costs & the honest ceiling

The academic premium is a *futures* result. We trade CFDs, and on a trend
strategy you **hold for weeks**, so overnight financing is a first-order cost, not
a rounding error:

- **Index & commodity CFDs** carry daily financing (roughly the funding rate ±
  a spread) on the full notional — a real drag on a multi-week long.
- **Bond CFDs** similar, and their low vol means the inverse-vol sizing gives them
  *large* notional → large financing base.
- The flat 2 bps/rebalance in the FX basket **understates** this badly for a hold
  strategy. Phase 2 must model per-instrument daily financing from OANDA's actual
  financing rates (the positions tab already pulls account-instrument financing —
  reuse that feed).

**This is the most likely killer.** A decayed ~0.4 gross Sharpe can go net-flat
once realistic CFD financing is charged. Phase 1 (Yahoo/futures, cheap) will look
better than Phase 2 (OANDA/CFD, expensive) *by construction* — do not let the
Phase 1 number stand in for the tradeable answer. Report both, labelled.

---

## 6. Proposed starter universe (~18–20 instruments, 4 sleeves)

Grouped by asset class so the risk budget can be split per sleeve:

- **Equities (4):** S&P 500, Nasdaq 100, DAX, FTSE (+ optionally Russell 2000, Nikkei).
- **Bonds (4) — the diversifier, currently missing:** US 10Y, US 2Y (or 30Y),
  Bund 10Y, Gilt 10Y (+ optionally JGB). *Add these to `instrumentRegistry` first.*
- **Commodities (4–6):** Gold, Silver, WTI/Brent crude, Copper, Nat Gas (+ optionally an ag).
- **FX (7):** the existing `TREND_UNIVERSE` — reuse as-is.

Note the **breadth vs data-quality tradeoff**: more instruments = more diversification,
but each thin/short/illiquid series adds noise and a data-hygiene burden. Filter to
instruments with clean long history; `log()` any dropped for coverage (no silent
truncation). Diminishing returns kick in past ~15–20 liquid instruments.

---

## 7. Decisions the owner needs to make (this is the point of the scope)

1. **Go / wait?** This adds surface; the honest alternative is forward-validating
   something existing first (§2 tension). Legitimate either way.
2. **Data source:** Yahoo research-first (recommended), OANDA-only (live-honest
   but short history), or both phases.
3. **Universe breadth:** the ~18-instrument starter, or leaner (e.g. 1 index + 1
   bond + gold + FX = the minimum honest 4-sleeve test)?
4. **Risk budgeting:** plain inverse-vol (simplest) vs equal-risk-*per-sleeve*
   (recommended — stops bonds or equities dominating)?
5. **Signal:** keep the single 12-mo TSMOM sign, or blend 3 lookbacks (1/3/12-mo,
   as AQR does — more robust, slightly more DOF)? Recommend keep it single first
   (minimal-DOF, §CLAUDE.md backtest discipline), add blend only if the single
   version survives.

---

## 8. Phasing & pre-registration

**Phase 0 (½ day):** add bond + missing-commodity instruments to
`instrumentRegistry` (with `yahoo:` tickers); a throwaway script to confirm each
series fetches with clean long history from the chosen source. No strategy yet —
just prove the join/coverage (escalate-in-stages, §CLAUDE.md).

**Phase 1 (research, 1–2 days):** `crossAssetTrendEngine` (thin wrapper reusing
`runTrendBasket` + asset-class budgeting selector + `diversificationCore` ENB),
`/api/cross-asset-trend`, a viewer with IS/OOS, per-sleeve attribution, effective
bets, per-year + last-5-years heatmap, and cost-sensitivity (1×/2×/3×). Yahoo long
history. Modeled costs.

**Phase 2 (only if Phase 1 OOS-survives):** OANDA-CFD instruments, realistic
per-instrument financing, forward paper log, live-vs-backtest weekly compare.

**Pre-registered outcomes (write before running):**
- *Worked* = Phase-1 diversified book beats the FX-only basket AND buy-and-hold-ish
  benchmarks on **OOS** Sharpe after modeled costs, with effective-bets > 2 (real
  diversification) and the effect present in the last 5 years, not just pre-2010.
- *Didn't* = OOS flat/negative after costs, OR the whole result is pre-2010 decay
  with a dead recent window, OR effective-bets collapses (the sleeves turned out
  correlated). **Any of these → banked null, like the FX one.** Expected outcome
  is a *modest positive gross that thins toward flat under realistic CFD costs* —
  plan for that, don't be surprised by it.
- **Benchmarks named up front:** the FX-only trend basket (the incumbent), and a
  static 60/40-ish long book (so we know it's the *trend* factor, not just being
  long risk).

---

## 9. One-line summary

The engine is ready and the universe is reachable; **the real work is data
(bonds are missing, history is the constraint) and honest cost modeling (CFD
financing is the likely killer).** Cross-asset trend is the replicated premium and
the legitimate place to chase it — but it's a *modest, decayed, cost-sensitive*
premium, so the deliverable is a truthful IS/OOS read, not a wealth engine. Build
Phase 0+1 to learn cheaply whether it's there at all; only spend Phase 2 if it is.
