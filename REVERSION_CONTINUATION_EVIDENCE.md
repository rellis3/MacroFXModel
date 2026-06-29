# Reversion vs Continuation at a Level — The Evidence Base

> A cited, peer-reviewed evidence review behind the fade-vs-follow question: at a
> price level / entry zone, will price **mean-revert (fade)** or **continue
> (follow/breakout)**? Built to replace retail "price-action" lore (FVG, ICT,
> order blocks, liquidity sweeps, Smart Money Concepts) with academically
> grounded signals. Companion to `REVERSION_CONTINUATION_CONCEPT.md` (the design
> basis) and `js/dayTypeCore.js` (the classifier brick).
>
> **Method:** each citation below was verified via multi-source web search
> against publisher/RePEc/SSRN/NBER records. Findings are tagged by asset class,
> horizon, and **replication/robustness status**, and we flag where an edge is
> *in-sample only*, *disputed*, or *fails net of costs* — because, per
> `SYSTEM_ASSESSMENT.md`, that distinction matters more than the method list.

---

## TL;DR — the honest verdict, ranked by strength of evidence

| Rank | Finding | Evidence strength | Use it for |
|---|---|---|---|
| 1 | **Order clustering at round numbers** (take-profits cluster *at* → reversal; stop-losses cluster *beyond* → cascade/continuation) | **Strong, FX-specific, primary order data** (Osler 2003 JF; 2005 JIMF) | The single most directly relevant, evidenced fade-vs-follow mechanism for FX |
| 2 | **Price impact ∝ order-flow imbalance ÷ depth** (thin book breaks, thick book absorbs) | **Strong, robust, replicated** (Cont-Kukanov-Stoikov 2014) | The real "absorption vs breakout" mechanism — but contemporaneous, decays in minutes |
| 3 | **Horizon structure of return autocorrelation** (days→weeks revert; 3–12mo continue; multi-year revert) | **Strong, heavily replicated** (Lo-MacKinlay, Jegadeesh, Jegadeesh-Titman, De Bondt-Thaler; FX: Menkhoff et al.) | Make the classifier horizon-aware; pick the right σ-scale |
| 4 | **Imbalance → short-run continuation then longer-run reversal** | **Solid** (Chordia-Subrahmanyam 2004) | The "follow then fade" timing of a level break |
| 5 | **OU / half-life mean reversion** where a true mean exists | **Solid for relative-value**, weaker single-asset (Avellaneda-Lee 2010) | Reversion-speed estimator; best on spreads/residuals |
| 6 | **Variance ratio as a regime test** | **Strong as a statistic** (Lo-MacKinlay 1988) | Already in `dayTypeCore.js` — keep it |
| — | **Technical-rule profitability** | **Weak / mostly fails** multiple-testing + costs (Sullivan-Timmermann-White; Bajgrowicz-Scaillet); FX TA decayed to ~zero post-1990s (Neely-Weller) | Treat individual indicators with deep suspicion |
| — | **Hurst exponent for trading** | **Fragile** — biased estimators, wide CIs (Lo 1991; Weron 2002) | Diagnostic at best, not load-bearing |
| ✗ | **FVG / ICT / order blocks / liquidity sweeps / SMC** | **Zero peer-reviewed empirical support** | Avoid as evidence; only retail/course/blog material exists |

**One-line takeaway:** the evidence supports a **conditional, level-dependent
selector** — fade near round-number/high-liquidity nodes, follow on
thin-book/stop-cascade breaks — *not* a universal fade or universal follow, and
*not* the retail "smart money" vocabulary.

---

## 1. Order flow at levels — the most directly relevant FX evidence

This is the closest thing to a peer-reviewed answer to "at this level, fade or
follow?" — and it is FX, intraday, and based on **actual order data**.

- **Osler (2000), "Support for Resistance: Technical Analysis and Intraday
  Exchange Rates,"** *FRBNY Economic Policy Review* 6(2):53–68. Published
  support/resistance levels from six FX firms have **genuine predictive power for
  intraday trend interruptions** — rates disproportionately stop/reverse near
  quoted levels (strongest at resistance; decays over days). *Refereed
  central-bank journal.*
- **Osler (2003), "Currency Orders and Exchange Rate Dynamics,"** *Journal of
  Finance* 58(5):1791–1819. **The key paper.** Using individual stop-loss and
  take-profit orders at a major dealing bank: **take-profit orders cluster AT
  round numbers → reversals** (limit orders lean against the move = the **fade**
  mechanism); **stop-loss orders cluster JUST BEYOND round numbers →
  continuation/cascades** (positive-feedback = the **follow** mechanism). Both
  cluster more at numbers ending in 0 than 5. *Tier-1; canonical.*
- **Osler (2005), "Stop-Loss Orders and Price Cascades in Currency Markets,"**
  *Journal of International Money and Finance* 24(2):219–241 (FRBNY Staff Report
  150). 9,655 orders, >$55bn, USD/JPY·GBP/USD·EUR/USD, Aug 1999–Apr 2000.
  Clustered stops generate **self-reinforcing cascades** that explain FX fat
  tails — the continuation engine of a trend day.

**Corroborating clustering evidence (cross-market):**
- **Sopranzetti & Datar (2002),** *Journal of Financial Markets* 5(4):411–417 —
  57–76% of FX quotes end in 0 or 5 (the round-number focal points are real).
- **Sonnemans (2006),** *European Economic Review* 50(8):1937–1950 — round
  numbers act as **price barriers** in equities (prices cross them *less* often).
- **Bhattacharya, Holden & Jacobsen (2012),** *Management Science* 58(2):413–431
  — >100M trades: excess buying just **below** round numbers, selling just
  **above**; effect *stronger approaching* than crossing. Clean equities analog
  of Osler's FX mechanism.

> **Codebase hook:** this directly justifies a **round-number / level-proximity
> estimator** in `dayTypeCore.js` (distance to nearest round figure; which side
> of it) — the most evidence-backed *new* feature we could add for FX.

## 2. Microstructure price impact — the "absorption vs breakout" mechanism

- **Cont, Kukanov & Stoikov (2014), "The Price Impact of Order Book Events,"**
  *Journal of Financial Econometrics* 12(1):47–88. Short-horizon price change is
  driven by **Order Flow Imbalance (OFI)**, **linearly**, with **slope ∝
  1/depth**. → *A given imbalance breaks through a thin book but is absorbed by a
  deep one.* US equities (TAQ, 50 stocks), seconds–minutes. **Robust, widely
  replicated.** Caveat: it's **contemporaneous impact**, not a tradeable
  forecast; predictive power decays within minutes.
- **Chordia & Subrahmanyam (2004),** *JFE* 72(3):485–518 — autocorrelated
  imbalance produces **short-run continuation that reverses over longer
  horizons**. The academic version of "follow the break, then fade the
  exhaustion." (Distinct from **Chordia, Roll & Subrahmanyam 2002,** *JFE*
  65(1):111–130, which is *aggregate daily* imbalance — investors contrarian on
  aggregate; sell imbalances ~4× the impact of buys.)
- **Easley, López de Prado & O'Hara (2012), "Flow Toxicity and Liquidity…"
  (VPIN),** *Review of Financial Studies* 25(5):1457–1493. Order-flow toxicity in
  volume-time; argued to spike before the 2010 Flash Crash. ⚠️ **Disputed:**
  Andersen & Bondarenko (2014, *J. Financial Markets*) argue the predictive
  content is largely a construction/look-ahead artifact. Treat "VPIN predicts
  crashes" as **unsettled**.
- **Square-root impact law & long-memory of flow:** Tóth et al. (2011), *Phys.
  Rev. X* 1:021006 — metaorder impact ∝ **√(size)** (concave), very widely
  replicated. Lillo & Farmer (2004) and Bouchaud et al. (2004) — order-flow
  *signs* have **long memory (H≈0.7, persistent)**, but this is **offset by
  mean-reverting liquidity**, keeping prices near-diffusive. **Key caution:
  persistent flow does *not* equal easily tradeable continuation.**

> **Honest flag:** there is **no peer-reviewed paper** that literally shows "OFI
> classifies breakout-vs-fade at a chart level." That exact framing is
> **practitioner folklore** (footprint/absorption blogs). The *mechanism* (impact
> ∝ 1/depth; continuation-then-reversal) is evidenced; the level-classifier
> packaging is not. Needs L2/volume data regardless.

## 3. Horizon structure of reversion vs continuation

The literature is consistent: **reversion and continuation live at different
timescales** — so the classifier *must* be horizon-aware (it already is).

- **Lo & MacKinlay (1988),** *Review of Financial Studies* 1(1):41–66. Variance
  ratio rejects the random walk for **weekly** US equity indexes via **positive**
  autocorrelation (VR>1, index-level *continuation*). The VR test is now standard.
- **Lehmann (1990),** *QJE* 105(1):1–28 — **weekly** cross-sectional **reversal**.
- **Jegadeesh (1990),** *Journal of Finance* 45(3):881–898 — **1-month reversal**.
- **Jegadeesh & Titman (1993),** *Journal of Finance* 48(1):65–91 — **3–12 month
  momentum/continuation** (~1%/mo). One of the most robust anomalies known.
- **De Bondt & Thaler (1985),** *Journal of Finance* 40(3):793–805 — **3–5 year
  reversal** (overreaction). Magnitude later contested (risk/January effects).
- **FX momentum — Menkhoff, Sarno, Schmeling & Schrimpf (2012),** *JFE*
  106(3):660–684 — cross-sectional **currency momentum up to ~10% p.a.**,
  **continuation in FX**, but **materially eroded by transaction costs** (the
  cost caveat is replicated).
- **OU / stat-arb — Avellaneda & Lee (2010),** *Quantitative Finance*
  10(7):761–782 — model idiosyncratic residual as **Ornstein-Uhlenbeck**; the OU
  speed implies a **half-life** (days–weeks). Canonical reversion-speed method;
  best where a true mean exists (pairs/residuals); profitability decays over time.

> ⚠️ **Tradability caveat (load-bearing for our harness):** the short-horizon
> reversal results (Lehmann; Jegadeesh 1990) are heavily contaminated by
> **bid-ask bounce / illiquidity** (Conrad-Gultekin-Kaul 1997), and FX momentum
> shrinks after costs. Several in-sample edges *vanish net of realistic costs* —
> exactly why CLAUDE.md mandates costs-on + OOS.

## 4. Technical analysis & the data-snooping reckoning

The arc of this literature *is* the argument for our validation discipline.

- **Brock, Lakonishok & LeBaron (1992),** *Journal of Finance* 47(5):1731–1764 —
  MA/trading-range rules on DJIA (1897–1986) beat null models. Early strong
  support — **but 26 rules, no costs, no multiple-testing correction.**
- **Sullivan, Timmermann & White (1999),** *Journal of Finance* 54(5):1647–1691 —
  apply **White's Reality Check** to ~7,846 rules. Once you account for the full
  search space, the apparent edge weakens sharply and **does not persist
  out-of-sample** post-1986.
- **Bajgrowicz & Scaillet (2012),** *JFE* 106(3):473–491 — with **False Discovery
  Rate** control + persistence tests on DJIA (1897–2011): you could **never have
  selected the future-best rules ex ante**, and in-sample profits are **fully
  offset by small transaction costs.** The strongest "TA doesn't survive" result.
- **Park & Irwin (2007),** *Journal of Economic Surveys* 21(4):786–826 — survey:
  56 positive / 20 negative / 19 mixed; profits common **until the early 1990s**,
  heavily caveated by data-snooping.
- **FX specifically — Neely, Weller & Dittmar (1997),** *JFQA* 32(4):405–426
  found GP-evolved FX rules profitable 1981–95; **Neely, Weller & Ulrich (2009),**
  *JFQA* 44(2):467–488 and **Neely & Weller (2013),** *J. Banking & Finance*
  37(10):3783–3798 show those FX profits **declined to extinction** as markets
  adapted (Adaptive Markets Hypothesis).

> **Takeaway:** prefer the *few* mechanisms with replicated, multi-market,
> after-cost support over the long tail of indicators that evaporate under
> multiple testing. This is Sullivan-Timmermann-White → López de Prado, and it is
> the same warning in `SYSTEM_ASSESSMENT.md` §2.1/§2.5.

## 5. ML methodology — discipline, not a magic predictor

López de Prado's apparatus is the rigorous way to *frame and validate* a
fade-vs-follow predictor. It is **methodology**, not evidence that ML works.

- **López de Prado (2018), *Advances in Financial Machine Learning* (Wiley).**
  - **Triple-barrier labelling** — label by which of {profit-take, stop-loss,
    time} is hit first. Path-dependent labels that match how a level trade
    actually resolves (held/reversed vs broke/continued). *This is the natural
    label for our problem.*
  - **Meta-labelling** — primary model picks side (fade vs follow); a secondary
    ML model predicts **P(the primary is right)** → confidence/sizing. Maps
    exactly onto our "selector on top of the primitive" + the calibrated
    confidence layer.
  - **Fractional differentiation** — stationary features that *retain memory*.
  - **Purged & embargoed CV / CPCV** — removes label-overlap leakage; yields a
    *distribution* of OOS paths. The rigorous form of our IS/OOS split.
- **Backtest-overfitting toolkit (verified venues):** Bailey & López de Prado
  (2014), "Deflated Sharpe Ratio," *J. Portfolio Management* 40(5):94–107; Bailey
  et al. (2017), "Probability of Backtest Overfitting," *J. Computational Finance*
  20(4):39–70; Bailey et al. (2014), "Pseudo-Mathematics and Financial
  Charlatanism," *Notices of the AMS* 61(5):458–471. **Deflate the Sharpe by the
  number of trials.**
- **Empirical ML evidence is thin for *our* problem.** Gu, Kelly & Xiu (2020),
  *RFS* 33(5):2223–2273, show ML helps — but **monthly cross-sectional
  equities**, not intraday/daily FX direction. Verified FX-direction ML papers
  are mostly **recent, lower-tier/preprint, single-study, rarely replicated**;
  the one peer-reviewed example showed the edge **collapsing once realistic
  spreads** hit non-major pairs.

> **Honest verdict on ML:** use it as *discipline* (labels + validation). There
> is **no credible, robust, peer-reviewed evidence** that ML reliably predicts
> short-horizon reversal-vs-continuation **after costs**. Assume fragility until
> an honest OOS bar (≥30 OOS trades, costs on, deflated for trials) is cleared.

## 6. The retail "smart money" vocabulary — no academic support

Targeted searches across Google Scholar, SSRN, ScienceDirect, Springer, arXiv,
RePEc found **no peer-reviewed empirical validation** for:

- **Fair Value Gaps (FVG)**, **ICT / Inner Circle Trader**, **order blocks**,
  **liquidity sweeps/grabs**, **Smart Money Concepts (SMC)**, **supply/demand
  zones**.

Every source was retail/educational (course platforms, indicator scripts, Medium
posts, prop-firm blogs, YouTube-adjacent). The "backtests" that exist are
self-published, non-replicated, with no methodology, cost, or OOS discipline —
**not citable as evidence.**

**Distinguish the legitimate academic cousins** (real phenomena the retail terms
borrow and rebrand, *without* testing the rebrand):
- **Price gaps** — e.g. *North American J. of Economics and Finance* (2020) on
  post-gap drift; *RFS* (2022) "Momentum Gap and Return Predictability." A "Fair
  Value Gap" (3-candle imbalance that must "rebalance") is **not** the same
  construct and has **not** been tested.
- **Support/resistance & round-number order-clustering** — Osler (§1) is the real
  microstructure cousin of "liquidity sweeps," but it is order-flow economics,
  not the ICT framework.
- **Order-flow imbalance** — a robust literature (§2), distinct from "order
  blocks."

> **Be plain:** the underlying *market phenomena* (clustering, gaps, imbalance)
> are researched and real; the *ICT/SMC packaging* of them is untested folklore.
> Build on the cousins, not the branding.

---

## What this means for the build (mapping evidence → the brick)

1. **Add a round-number / level-proximity estimator** to `dayTypeCore.js` — the
   best-evidenced FX-specific fade-vs-follow feature (Osler). Closes/price-only,
   cheap, orthogonal to the existing path estimators.
2. **Keep the variance-ratio + horizon-awareness** — directly supported (§3).
3. **Treat the lean as a selector, confidence as a separate calibrated layer** —
   meta-labelling + triple-barrier is the evidenced *methodology* for the
   `signedT` → `P(win)` upgrade (§5).
4. **Microstructure (OFI/depth) is the true exhaustion tell but needs L2/volume**
   and only lives at seconds–minutes — a later, data-gated addition (§2).
5. **Validate ruthlessly:** purged/embargoed OOS, costs on, deflate for the
   number of trials. The TA/data-snooping literature (§4) says most apparent
   edges die here — design for that, don't be surprised by it.

---

### Source index (primary, peer-reviewed unless noted)
Osler 2000 *FRBNY EPR* 6(2) · Osler 2003 *J. Finance* 58(5) · Osler 2005 *JIMF*
24(2) · Sopranzetti-Datar 2002 *J. Financial Markets* 5(4) · Sonnemans 2006 *Eur.
Econ. Rev.* 50(8) · Bhattacharya-Holden-Jacobsen 2012 *Management Science* 58(2)
· Cont-Kukanov-Stoikov 2014 *J. Financial Econometrics* 12(1) · Chordia-
Subrahmanyam 2004 *JFE* 72(3) · Chordia-Roll-Subrahmanyam 2002 *JFE* 65(1) ·
Easley-López de Prado-O'Hara 2012 *RFS* 25(5) (VPIN; disputed by Andersen-
Bondarenko 2014 *JFM*) · Tóth et al. 2011 *Phys. Rev. X* 1 · Lillo-Farmer 2004
*SNDE* 8(3) · Bouchaud et al. 2004 *Quant. Finance* 4(2) · Lo-MacKinlay 1988
*RFS* 1(1) · Lehmann 1990 *QJE* 105(1) · Jegadeesh 1990 *J. Finance* 45(3) ·
Jegadeesh-Titman 1993 *J. Finance* 48(1) · De Bondt-Thaler 1985 *J. Finance*
40(3) · Menkhoff-Sarno-Schmeling-Schrimpf 2012 *JFE* 106(3) · Avellaneda-Lee 2010
*Quant. Finance* 10(7) · Lo 1991 *Econometrica* 59(5) · Weron 2002 *Physica A*
312(1) · Brock-Lakonishok-LeBaron 1992 *J. Finance* 47(5) · Sullivan-Timmermann-
White 1999 *J. Finance* 54(5) · Bajgrowicz-Scaillet 2012 *JFE* 106(3) · Park-
Irwin 2007 *J. Economic Surveys* 21(4) · Neely-Weller-Dittmar 1997 *JFQA* 32(4) ·
Neely-Weller-Ulrich 2009 *JFQA* 44(2) · Neely-Weller 2013 *JBF* 37(10) · López de
Prado 2018 *Advances in Financial ML* (Wiley) · Bailey-López de Prado 2014 *JPM*
40(5) · Bailey et al. 2017 *J. Computational Finance* 20(4) · Bailey et al. 2014
*Notices AMS* 61(5) · Gu-Kelly-Xiu 2020 *RFS* 33(5).

*Citations verified via multi-source web search (publisher / RePEc / SSRN / NBER
records). A few page ranges flagged in research notes (e.g. De Bondt-Thaler
793–805 canonical) should be re-checked against the publisher before any formal
citation.*
