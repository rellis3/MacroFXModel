# Per-pair view — consolidation proposal

**Date** 2026-08-24 · **Scope** the per-pair card + drawer in `today.html`, informed by what
`index.html` currently shows and by every other page/API in the repo. **Status: proposal only,
nothing built.** Evidential verdicts quoted below come from `august analysis.md`.

---

## 1. The headline finding

**`today.html` already loads almost everything you want to see. It just doesn't render it.**

`assembleSnapshot()` (today.html:4639) builds the AI prompt from **OI walls + gamma + term
structure + volume magnets + concentration + clusters, COT (direct and derived-for-crosses),
the 11-dimension macro scorecard for both legs, the composite signal with its legs, the
liquidity gate, the credit gate, credit-quality spread, GPR, the AnalogML motif with its base
rate, 10 years of SessionResearch for that pair, COT cross-correlations, and the pair-filtered
event calendar.**

Almost none of that reaches your eyes. The AI sees a richer picture of the pair than you do,
and then hands you back a paragraph. **The consolidation job is mostly a rendering job, not a
plumbing job** — which is why it's cheap.

Second finding: the drawer is **13 flat collapsible sections in one scroll column**
(`analysis, thesis, story, tde, hits, levels, exh, chart, rates, cone, path, news, corr`), 7 of
which start hidden. There is no grouping, no "where am I", and no way to jump straight to the
part you want. That's the actual layout problem — not a shortage of content.

---

## 2. What each page has today

### `index.html` per-pair card (built by `js/render.js` + macro/vol/arma/oi/compass/signal/ai/cot)

| Block | Source | Evidential status |
|---|---|---|
| 7-tier macro score breakdown (rate diff, VIX+Δ, DXY, HY credit, cross-carry, NFCI, momentum, 5m Kalman) + tier coherence | `js/macro.js` `calculateTierScores` | **hand-set weights, uncalibrated**. Repo verdict on macro-as-signal: NULL ×5 |
| Bayesian score ±18, dollar-regime pill, vol-impulse pill, PCA | `js/macro.js` | uncalibrated |
| **Recommended size %** driven by that score | `calcPositionSize` | ⚠️ see §6 — conviction is *anti-predictive* in this repo's own measurement |
| Driver hierarchy (primary/secondary/tertiary) | `js/render.js` | derived from the above; useful *framing*, not evidence |
| Macro Compass — US10Y spread, DXY/yield divergence, spread lean, VECM 5d forecast | `js/compass.js` | context (yield→FX coupling banked as same-bar only) |
| OI sidebar — max pain, call/put walls, top-20 strikes, gamma flow, up/down targets | `js/oi.js` | **real data**, forward test collecting |
| Regime transition risk / shock risk | `js/arma.js` | context |
| Vol forecast comparison — EWMA / GARCH / GJR / LEFT + 68% CI | `js/volForecast.js` | **validated engine** |
| Trade setups & level map — stars, entry/SL/TP, R:R, agreement, session tag | `js/signal.js` | **stars are an unvalidated additive heuristic** |
| Market Analyst AI card | `js/ai.js` | AI opinion |
| Session quality (live OANDA spread), retail crowd (Myfxbook) | `_worker.js` `/api/spread`, `/api/sentiment` | real, under-used |
| COT card + cross-pair COT | `js/cot.js` | real |
| Yield pulse — US10Y / US2Y / spread daily bp change | `js/render.js` | context |

### `today.html` drawer (13 sections)

Full analysis (AI) · trade thesis · the story · Decision Engine snapshot + zones + Decide ·
line fade by hit (daily/weekly, by regime) · bot level book (stars) · turn zones ·
today-vs-forecast M5 chart · rates context · volatility cone · Forecast Path 4h claims ·
today's news · correlations, hedges & beta.

Plus on the card face: range map vs cone, fib ladder, exhaustion strip, AnalogML shape,
composite ⚖ chip, MVE chip, commodity-driver chip, session-research chip, COT-extreme chip,
OI regime chip.

### The gap in one line

`index.html` answers **"what is the macro state and where are the option walls"**.
`today.html` answers **"what is the range, where are the levels, and what are the base rates"**.
Neither answers both, and neither answers **"what do the live bots think about this pair right now"**.

---

## 3. Proposed structure — six tabs inside the drawer

Keep the grid of compact cards exactly as it is (it is good — scannable across 20+ pairs).
Change the **drawer** from 13 stacked collapsibles to a tab strip. Each tab is one question.

```
┌──────────────────────────────────────────────────────────────────────┐
│  XAU/USD   4655.81   ·  RANGE 63%  ·  vol P60  ·  ⏰ CPI 13:30       │
│                                                              ✕ Close │
├──────────────────────────────────────────────────────────────────────┤
│  READ │ MACRO │ FLOW │ LEVELS │ VOL & PATH │ SYSTEMS                  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   (tab body — lazy-loaded on first open, cached per pair)            │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

Design rules for every tab:

1. **One sentence at the top of each tab in plain English**, then the evidence under it.
   A novice should be able to read six sentences and stop.
2. **Every panel carries its status badge** — `VALIDATED` / `CONTEXT` / `UNCALIBRATED` /
   `AI OPINION`. `today.html` already does this well; extend it to everything migrated in.
3. **Nothing the repo has banked as NULL gets rendered as a signal.** See §7.
4. **Lazy fetch.** Tab 1 renders from data already in memory. Tabs 2–6 fetch on first click.

---

## 4. Tab-by-tab specification

### Tab 1 — READ  *(the 30-second answer; renders instantly, no new fetches)*

> *"XAU/USD is mildly bullish. The biggest driver is the rate differential, pulling it lower.
> 84% of today's expected range is already used — new breakouts are unlikely.
> CPI at 13:30 — many wait until it's out."*

| Panel | Where it comes from | New work |
|---|---|---|
| Bias line + composite ⚖ + agreement | already computed (`pairSignalComposite`) | move |
| Range utilisation meter + what that implies | already on card face (`rangeMapHtml`) | move |
| Session + confidence + event gate | `pairEvents`, `currentSession` | move |
| **The story** (Asia, last few days, driver, positioning, options) | `loadDrawerStory` | keep |
| **Trade thesis — supports vs challenges** | `loadDrawerThesis` | keep |
| **Full analysis (AI)** | `analysePair` | keep, collapsed by default |
| **Bottom line** — one bold sentence + a 3-item "before you click buy" checklist | new, assembled from the above | small |

### Tab 2 — MACRO  *(why the market is where it is)*

| Panel | Source | Status |
|---|---|---|
| **Both legs side by side, 11-dimension scorecard** (inflation, growth, labour, business, retail, trade, real yield, curve, confidence, PPI, CB tone) | `macroScorecard` — **already loaded, currently AI-only** | CONTEXT |
| Which dimension is driving the differential, and by how much | derive from the above | CONTEXT |
| **Rates strip** — 2Y/10Y both legs, spread, 5d bp change, curve slope | `/api/yield-context`, `/api/real-yield`, `/api/yield-curve`, `fred` | CONTEXT |
| **Yield-spread z-score for this pair** | `/api/yield-spread/plan` | ✅ **VALIDATED** — the one macro edge (OOS Sharpe ~1.1, PF 2.19). Show z, threshold, whether it is armed |
| **Macro Compass** — spread lean, DXY/yield divergence, VECM 5d | `js/compass.js` from index | CONTEXT |
| **Central-bank tone** for both legs + Beige Book | `/api/fomc/latest`, `/api/ecb/latest`, `/api/boe/latest`, `/api/boj/latest`, `/api/beigebook/latest` | CONTEXT — priced in ~30 min, explicitly not a signal |
| **Next release for either economy** + what the last one did | `events`, `/api/cpi`, `/api/ism`, `/api/labor-market`, … | real |
| **Board-wide risk gates** — credit (HY + quality), liquidity, GPR, VIX | already loaded (`creditGate`, `liquidityGateRead`, `gpr`, `creditQuality`) | CONTEXT |

*This tab absorbs the 8 clone econ pages, the 3 rates viewers and the 4 CB-sentiment pages from
the `august analysis.md` merge map — without you needing to visit any of them.*

### Tab 3 — FLOW & POSITIONING  *(who is on which side, and where the options pin it)*

| Panel | Source | Status |
|---|---|---|
| **Options board** — max pain, call/put walls with tier + persistence, gamma regime (PIN/BREAKOUT), GEX/DEX, P/C, concentration, clusters, volume magnets | `oiToday` / `oiStore` — **already loaded, currently AI-only** | forward test collecting |
| **Term structure** — where each expiry pins | `oi.inst.termStructure` — already loaded | real |
| **Day-over-day OI change** — what got built / covered | `oiHistory`, `/api/oi-history` | real (persistence fixed 2026-07-29) |
| **Reachability** — can price actually get to that wall today? | `/api/oi-reachability` | real |
| **COT** — spec net, %OI, percentile, weekly change, crowding, derived legs for crosses | already loaded | real |
| **COT correlation** — which currencies specs are building *with* / *against* this one | already loaded, AI-only | real |
| **Retail crowd** (Myfxbook) + **OANDA order / position book** | `/api/sentiment`, `/api/oanda_book` — on index, not on today | real, contrarian context |
| **Implied vol** — CVOL, EVZ/GVZ vs our realised σ, IV term inversion | `cvol`, `riskFlags` — partly loaded | real |
| **Live spread** vs typical | `/api/spread` | execution reality |

### Tab 4 — LEVELS & SETUPS  *(where to act, and what happens there historically)*

| Panel | Source | Status |
|---|---|---|
| **Level map** — range map, fib ladder, turn zones, nearest level + distance | already on card + drawer | mixed |
| **Bot level book (stars)** with entry / SL / TP / R:R / agreement | drawer `levels` + **`js/signal.js` from index supplies the R:R and entry prices today.html lacks** | ⚠️ stars = UNCALIBRATED heuristic |
| **Line fade by hit** — 1st / 2nd / 3rd tap fade vs blow-through, by regime | drawer `hits` | ✅ **measured base rates** — the honest core |
| **Continuation vs Fade duel** + **USD-trend filter** | `/api/trade-decision/zone-duel` | ✅ the USD-trend alignment filter is the **one OOS-validated, cross-pair-consistent finding** from 110,883 events — and it is currently *not* in the drawer at all |
| **Decision Engine snapshot** + Decide button | drawer `tde` | ⚠️ UNCALIBRATED PRIOR — keep the banner |
| **Range-line (§13) plan for this pair** | `/api/range-line-bot/plan`, `/zones`, `/confluence` | ✅ **the crown jewel** — Sharpe 4.7–6 OOS. Not on today.html at all |
| **Pattern scan** — double top / double bottom only | `/api/pattern-lab/scan/:pair` | ✅ the surviving motifs (OOS PF 1.31, 24/25 pairs) |
| **AnalogML structural motif** + base rate + n + PF | already loaded, chip only | research |
| **Confluence sources** for the nearest zone | `/api/levels-v2/entries`, `/api/range-line-bot/confluence` | mixed |

### Tab 5 — VOL & PATH  *(how far, how fast, and is that normal)*

| Panel | Source | Status |
|---|---|---|
| Today-vs-forecast M5 chart with cone | drawer `chart` | keep |
| **Vol forecast model comparison** — EWMA / GARCH / GJR / LEFT + 68% CI + which one is used and why | `js/volForecast.js` from index | ✅ validated engine |
| Volatility cone (5d / 21d / 63d / 252d percentiles) | drawer `cone` | keep |
| **Regime transition risk / shock risk** | `js/arma.js` from index | CONTEXT |
| Forecast Path — calibrated 4h claims, reach, trend-dir honesty note | drawer `path` + `/api/forecast-path/reach` | ✅ calibrated; direction explicitly a coin flip |
| **MTF regime stack** — 5m / 30m / 1h / 2h HMM state agreement | `/api/hmm5m-v2`, `/api/hmm30m-v2`, `/api/hmm1h-v2`, `/api/hmm2h-v2` | canonical classifier |
| **Structure stats** — Hurst/DFA, OU half-life, day-type T, entropy shift, EVT tail | `/api/analytics-desk/:pair` | CONTEXT (Hurst is a banked null *as a signal* — show as description only) |
| SessionResearch — Asia/London/NY handoff, spike reversal, today's outlook | already loaded, chip only | ✅ FDR-corrected |
| Correlations, hedges & beta | drawer `corr` | CONTEXT |

### Tab 6 — SYSTEMS & RISK  *(what the machines say, and how big to go)*

The view that doesn't exist anywhere today: **"what does every live bot think about THIS pair
right now, and do they agree?"**

| Panel | Source |
|---|---|
| One row per live system with its current stance on this pair: range-line, volatility bot, OI bot, yield-spread, DynAnchor, ConfluenceBot, Trade_Decision_Engine, RegimeV7 | `/api/range-line-bot/plan`, `/api/volatility-bot/plan`, `/api/oi-bot/zones`, `/api/yield-spread/plan`, `/api/dyn-anchor-forecast`, `/api/trade-decision/state/:pair`, `/api/regime-history` |
| **Agreement count** — "3 of 8 systems are long here" | derived |
| **Forward record** — how these calls have actually resolved | `/api/forward-track`, `/api/decision-audit` |
| **Position size** — fixed-fractional, stop from the noise floor, *not* from conviction | `/api/position-size` |
| **Open exposure** in this pair / correlated pairs | `/api/hedge-alerts`, journal |
| **Give-back / exit quality** for the bots that trade it | `/api/giveback` |

---

## 5. What this collapses

Reading a single pair today means visiting `index.html`, `today.html`, `oi-dashboard`,
`cot-extremes`, `macro-scorecard`, `yield-spread`, `vol-forecast-v2`, `forecast-path`,
`continuation-fade-ticker`, `analytics-desk`, `range-zones`, plus the CB and econ pages.
**Twelve-plus pages → one drawer with six tabs.** The detail pages stay exactly as they are;
each tab deep-links out to them ("see the full page →") rather than replacing them.

---

## 6. Three honesty problems to fix while doing this — not after

1. **Do not migrate `index.html`'s "RECOMMENDED SIZE" as-is.** It is driven by the 7-tier macro
   score, and this repo's own measurement says conviction is *anti-predictive*
   (`analysis/backtest_entry_quality.py`; DecisionEngine's high-confidence multiplier actually
   *shrinks* size — BUG_LIST #32). Size should come from stop distance and a fixed fraction,
   with the macro score shown as **context beside it, never multiplied into it**.

2. **The 7-tier macro score needs its status printed on it.** It is a hand-set weight blend, and
   macro-as-signal is a banked null ×5. It is genuinely useful as *framing* ("here is why the
   market is where it is") — it is not a vote on direction. Label it that way and it earns its
   place; leave it unlabelled and it quietly launders a null into a number.

3. **The stars heuristic** (`js/signal.js`, bot level book) is additive and unvalidated, and
   `range-level-edge.html` — the placebo test that would settle whether *any* level bounce is
   real — **has never been run**. Migrating stars is fine; migrating them without the warning
   banner `today.html` already puts on them is not.

## 7. What deliberately does NOT get migrated

VuManChu **direction** (|IC| ≈ 0.02–0.05, reproduces on a random walk — the MTF *state* may be
shown as context with its base rate and n from `/api/vumanchu/state`, but never as a call) ·
econ-trend momentum · macro-direction votes · credit-stress *gating* · EMA cross · k-NN shape
analogs · VWAP reversion · confluence-stacking fade scores · the Hurst *feature* · inverse-σ
sizing · discipline-map's "Reflexivity" composite. All banked NULL. Showing them in a
consolidated view is how a null becomes folklore.

---

## 8. Suggested build order

| Phase | Work | Payoff |
|---|---|---|
| **1** | Tab shell + move the 13 existing sections into tabs 1 / 4 / 5. No new data. | Immediate navigability; zero risk |
| **2** | Render what is already in memory but AI-only: full OI board, COT detail, macro scorecard both legs, COT correlation, SessionResearch, motif. | Biggest information gain per line of code — **no new fetches at all** |
| **3** | Tab 2 MACRO: yield-spread z (the validated edge), compass, CB tone, rates strip, econ next-up. | Kills ~15 page visits |
| **4** | Tab 4 additions: zone-duel + USD-trend filter, range-line plan, pattern scan, R:R on the level book. | Puts the two proven edges in front of you at decision time |
| **5** | Tab 6 SYSTEMS: bot agreement row, forward record, position size. | The view that doesn't exist today |
| **6** | Tab 3 flow extras (retail crowd, order book, live spread) and tab 5 structure stats. | Nice-to-have |

Phases 1–2 are roughly a day's work and would deliver most of the value on their own.

---

## 9. Open questions

1. **Tabs or grouped accordions?** Tabs are cleaner but hide things; 6 grouped accordions keep
   everything one scroll away. Recommendation: tabs, with the last-used tab remembered per pair
   in `localStorage`.
2. **Does the card face change?** Recommendation: leave it alone, put all of this in the drawer.
   The grid is genuinely good at what it does.
3. **Does this retire `index.html`'s per-pair card?** The repo has twice decided `index.html` is
   the front door and `today.html` the daily companion — this proposal inverts that. Worth
   deciding explicitly before phase 3, since phases 2–5 progressively hollow the index card out.
4. **`/api/sentiment`, `/api/oanda_book`, `/api/spread` are `_worker.js`-only routes.** They
   should be reachable on Railway (server.js imports `_worker.js` and delegates unmatched
   `/api/*` to it), but that needs one live check before anything is built on them.
