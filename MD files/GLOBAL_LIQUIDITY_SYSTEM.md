# Global Liquidity Trading System — Design & Cross-System Review

> Status: design doc. Author intent: build a trading system in the lineage of
> **Michael Howell / CrossBorder Capital (Global Liquidity)**, using
> **Macro Alf (risk-regime)** logic as a sizing overlay, and reusing the
> liquidity, macro and regime machinery already in this repo rather than
> starting from scratch.

---

## 0. TL;DR

You have already, across four separate sub-projects, built ~70% of a Howell-style
Global Liquidity engine without it being assembled into one system:

- **COG Gate 1A** (`js/cogConfig.js`, `js/cogLiquidityGate.js`) — multi-central-bank
  balance-sheet liquidity regime score with multi-horizon RoC + percentile blending.
  This is the closest thing to Howell's Global Liquidity Index already in the repo.
- **MacroEquityBot / macro-regime-conditional** (`MacroEquityBot/fred_signal.py`,
  `macro-regime-conditional/macro_equity_backtest.py`) — monthly net-liquidity equity
  allocation with walk-forward validation. US-only.
- **Liquidity-Pulse / Liquidity-Gate** (`server.js`, `liquidity-pulse.html`,
  `liquidity-gate-backtest.html`) — daily TGA/RRP flow + weekly net-liq z-score gate.
- **RegimeV2** (`RegimeV2/`) — HMM + BOCPD risk-regime detector. **Has zero liquidity
  input** — this is the natural home for the Macro Alf sizing overlay.

**The recommendation:** make the COG-style Global Liquidity Index the *core directional
read*, use a Macro Alf-style regime layer (RegimeV2 machinery) for *exposure/sizing*, and
do NOT try to systematize Raoul Pal alone — his "liquidity cycle" is a narrative wrapper
around Howell's data and is only useful here as the **cycle-clock** sub-component (§4.2).

---

## 1. Who we are following, and why

| Source | Their edge | Systematizable? | Role in this system |
|---|---|---|---|
| **Michael Howell / CrossBorder Capital** | Global Liquidity Index: global CB balance sheets in USD + private/shadow liquidity + collateral multiplier; emphasis on **rate-of-change** and a **~5–6yr cycle** | **Yes** — published methodology, replicable from FRED + market data | **Core signal** (direction + conviction) |
| **Raoul Pal** | The ~65-month "liquidity cycle"; "it's all liquidity + demographics" | Partially — the *narrative* isn't, but the **cycle phase** is | **Cycle-clock sub-component only** (§4.2) |
| **Macro Alf (Alfonso Peccatiello)** | Growth/inflation/liquidity **quadrant regimes**, positioning, vol-targeting | **Yes** — regime classification + vol-target sizing | **Sizing / exposure overlay** (reuse RegimeV2) |

Howell and CrossBorder are the same shop — "Global Liquidity" and "Liquidity models" are
one methodology. So functionally there are **three** distinct ideas, not four: a liquidity
*level/momentum* engine (Howell), a liquidity *cycle clock* (Raoul/Howell overlap), and a
*risk-regime sizing* layer (Macro Alf).

---

## 2. What already exists in this repo (inventory)

### 2.1 COG Gate 1A — Slow Macro Regime  *(the existing Howell-like core)*
Files: `js/cogConfig.js:48-78`, `js/cogLiquidityGate.js`

- Inputs (`COG_LIQUIDITY_1A_INPUTS`): WALCL (Fed, w=1.2), RRPONTSYD (−, w=1.2),
  WTREGEN (TGA, −, w=1.0), **ECBASSETSW (ECB, w=0.7)**, **JPNASSETS (BoJ, w=0.5)**,
  BAMLH0A0HYM2 (HY credit, −, w=1.0). Each has a `sign` and `publicationLagDays`.
- Per-input signal = **blend of multi-horizon RoC z-score [1,7,30d] and rolling level
  percentile**, each clipped to [−1,1] and averaged (`precomputeInputSignal`,
  `cogLiquidityGate.js:62-86`).
- Composite `RegimeScore ∈ [−5,5]`, classified BULLISH/BEARISH/NEUTRAL/INVALID with a
  `minCoverage ≥ 0.5` data-quality gate and a `marginal` flag near thresholds.
- Pure macro: **never touches Nasdaq price** (enforced by design, see config header).
- Gate 1B (fast intraday flow: DXY/US10Y/US2Y/HYG-LQD/breadth/VIX/VVIX) is **spec'd but
  built only against synthetic data** — no live wiring yet (`cogConfig.js:80-140`).

### 2.2 MacroEquityBot / macro-regime-conditional  *(US monthly allocation)*
Files: `MacroEquityBot/fred_signal.py:193-289`, `macro-regime-conditional/macro_equity_backtest.py`

- 5 factors: Net Liq `WALCL−WTREGEN−RRPONTSYD` (pct_change 21d), T10Y2Y, BAMLH0A0HYM2
  (diff 21d, inverted), DFII10 (real yield, inverted), ISM/NAPM. All **252d z-scored**.
- Weights 40/20/20/15/5; score → 100/75/50/25% allocation ladder; trend filter (200dMA +
  12m momentum) and VIX vol-sizer; allocation floor so it's never fully flat.
- Backtest: weekly signal → Monday open, walk-forward (504 train / 63 test / 21 step),
  reports CAGR/Sharpe/Sortino/MaxDD/WFE. QQQ OOS Sharpe ~1.2, WFE ~1.2.
- **US-only**; first-order RoC only; fixed 252d window (no long cycle).

### 2.3 Liquidity-Pulse / Liquidity-Gate  *(daily flow + weekly gate)*
Files: `server.js:3603-3888`, `liquidity-pulse.html`, `liquidity-gate-backtest.html`

- Daily: ON-RRP (FRED `RRPONTSYD`) + TGA from Treasury **Daily Treasury Statement** API
  (genuinely daily, not FRED-weekly). `liqPulse = −(dTGA + dRRP)`. Tested vs next-day NQ,
  with Tue/Thu T-bill-settlement days split out.
- Weekly: net-liq z-score (252d) gate vs 6 equity indices; coherence check with curve +
  credit; next-day and 5-day-forward correlation/hit-rate.

### 2.4 RegimeV2 (+V4/V7)  *(Macro Alf candidate — currently liquidity-blind)*
Files: `RegimeV2/regime_bot_v2.py`, `regime_score.py`, `bocpd.py`, `macro_overlay.py`, `backtest_v3.py`

- Regime = **EMA-separation HMM** on M5 (BULL/BEAR/RANGE), confidence 30–100%.
- **BOCPD** change-point on the confidence stream (3–8 bar lead on regime breaks).
- Macro overlay is **market-implied only**: VIX spot/term, CBOE FX implied vol, DXY 5d,
  HYG 5d, FOMC calendar, news. **No balance-sheet / liquidity input anywhere.**
- 7-component entry score (HMM 35 / BOCPD 20 / session 15 / DXY 10 / consensus 10 /
  vol 5 / credit 5) → lot scaling 50–100%. 13 exit rules.
- Backtest reports WR / PF / avg-R / total-R / MaxDD-R, IS vs OOS split, per-pair/session.

---

## 3. Target architecture

```
            ┌─────────────────────────────────────────────┐
            │  GLOBAL LIQUIDITY INDEX (GLI)  — the "why"    │
            │  (extends COG Gate 1A)                        │
            │  • Multi-CB balance sheets, USD-normalized    │
            │  • Shadow / collateral proxies                │
            │  • Multi-horizon RoC  (already in COG)        │
            │  • Cycle clock: phase + RoC-of-RoC            │
            └───────────────┬─────────────────────────────┘
                            │  level, slope, phase, conviction
                            ▼
            ┌─────────────────────────────────────────────┐
            │  RISK-REGIME OVERLAY  — the "how much"        │
            │  (Macro Alf, reuse RegimeV2 HMM+BOCPD)        │
            │  • GLI level/slope added as regime features   │
            │  • Regime sets EXPOSURE, not direction        │
            │  • Vol-target position sizing                 │
            └───────────────┬─────────────────────────────┘
                            ▼
            ┌─────────────────────────────────────────────┐
            │  EXPRESSION                                   │
            │  • Liquidity-sensitive sleeve: NQ, BTC, gold  │
            │  • FX majors (existing book)                  │
            │  • Weekly→monthly rebalance (MacroEquityBot)  │
            └─────────────────────────────────────────────┘
```

### 3.1 Why this shape
- The GLI answers *direction and conviction* from fundamentals (liquidity), which is the
  only one of the four sources that is genuinely falsifiable and replicable.
- The regime overlay answers *exposure* — full size in expanding-liquidity risk-on,
  cut/hedge in contraction. This is exactly Macro Alf's vol-target-by-quadrant approach,
  and RegimeV2 already has the HMM + BOCPD + sizing plumbing.
- Raoul Pal is **not** an independent block — his contribution collapses into the GLI
  cycle clock (§4.2).

---

## 4. Building the Global Liquidity Index (the new work)

Start from COG Gate 1A (`computeLiquidityGate1A`) — it already gives per-input RoC+percentile
normalization, publication-lag handling and a coverage gate. The gaps to close are what
separates "a multi-CB liquidity score" from "Howell's GLI".

### 4.1 Broaden and USD-normalize the central-bank panel
Current panel is Fed + ECB + BoJ (+ US plumbing). Howell's GLI is genuinely global and in
**USD-equivalent** terms.
- **Add** PBoC (`CHIABSWNC` or PBoC totals), BoE (`UKASSETS`/BoE weekly), and optionally
  SNB / RBA / BoC.
- **USD-normalize**: ECB assets are in EUR, BoJ in JPY, PBoC in CNY. Convert each by its
  spot cross before aggregating (`ECB_USD = ECBASSETS_EUR × EURUSD`, etc.). The current
  code aggregates raw home-currency values — a 10% EURUSD move silently mis-weights ECB.
  This is the single most important correctness fix.
- Keep COG's existing `sign` / `weight` / `publicationLagDays` schema — just extend the
  `COG_LIQUIDITY_1A_INPUTS` array and add an FX-conversion step in the data loader.

### 4.2 Add the cycle clock (the Raoul/Howell overlap)
Howell's central claim is that liquidity moves in a ~5–6 year cycle and that **position in
the cycle matters more than the level**.
- Compute **RoC-of-RoC** (acceleration) of the GLI, not just first-difference. Rising-and-
  accelerating vs rising-and-decelerating are different regimes.
- Estimate **cycle phase** — a slow band-pass / Hodrick-Prescott or a simple
  "months since last GLI trough/peak" clock — and expose a 0–360° phase or a
  {early-expansion, late-expansion, early-contraction, late-contraction} label.
- The MacroEquityBot's fixed 252d z-window is too short to see a 5–6yr cycle; add a longer
  (e.g. 750–1250d) lookback alongside the 252d for the cycle component specifically.

### 4.3 Add shadow / collateral proxies
This is the part the repo has **none** of, and it is core to Howell's framework.
- **Collateral / repo stress**: SOFR–IORB or GC repo–OIS spread, MOVE index, cross-currency
  basis (e.g. 3m EURUSD / USDJPY basis) as a USD-funding-scarcity proxy.
- **Private/shadow liquidity**: dealer balance-sheet usage proxies, primary-dealer repo,
  bank reserves (`WRESBAL`), commercial-bank credit (`TOTBKCR`) momentum.
- Treat these as additional `COG_LIQUIDITY_1A_INPUTS` with appropriate `sign` (e.g. widening
  cross-currency basis = USD scarcity = bearish, `sign:-1`).

### 4.4 Output contract
GLI should emit, per date: `{ level_z, slope (RoC z), accel (RoC-of-RoC), cyclePhase,
state (BULL/BEAR/NEUTRAL), conviction, coverage, contributions[] }` — mirroring COG's
existing "no black boxes" per-input contribution output so every number is auditable.

---

## 5. Cross-system review — design differences & what each can borrow

This is the second half of the request: comparing the existing bots/backtests and flagging
where importing one system's design detail would improve another.

### 5.1 Differences at a glance

| Dimension | COG Gate 1A | MacroEquityBot | Liquidity-Gate | RegimeV2 |
|---|---|---|---|---|
| CB panel | Fed+ECB+BoJ | Fed only | Fed+ECB+BoJ | none |
| USD-normalized | No | n/a | No | n/a |
| RoC treatment | **Multi-horizon [1,7,30] + percentile** | First-order pct_change(21) | z-score of pct_change | none |
| Cycle clock | No | No | No | No |
| Shadow/collateral | No | No | No | No |
| Regime overlay | classification only | VIX vol-sizer | coherence gate | **HMM+BOCPD, full** |
| Liquidity input | **core** | core (US) | core (US) | **absent** |
| Validation | (backtest engine) | **walk-forward + WFE** | corr/hit-rate diagnostics | IS/OOS split, R-multiples |
| Costs modeled | — | **0.15% RT** | partial | spread-correct pricing |

### 5.2 Concrete cross-pollination opportunities

1. **RegimeV2 ← GLI (biggest win).** RegimeV2 is entirely price/vol/VIX driven and has *no*
   fundamental anchor. Add the GLI `level_z` and `slope` as (a) an 8th entry-score
   component and (b) a hard sizing/exposure multiplier — full size only when liquidity is
   expanding, auto-cut in contraction. Add an exit rule (X14) for a GLI collapse below a
   stress percentile. This is the Macro Alf overlay and the single highest-value change.
   Insertion points: `regime_score.py:29-37` (weights), `macro_overlay.py` (add a
   `GLIFetcher` beside `CreditFetcher`), `regime_bot_v2.py:1147-1239` (exit rules).

2. **MacroEquityBot ← COG's RoC design.** MacroEquityBot uses only first-order
   `pct_change(21)` on net liquidity; COG already computes **multi-horizon RoC z-scores
   blended with a level percentile**. Port COG's `precomputeInputSignal` blend into
   `fred_signal.py` so the equity allocator sees acceleration, not just 1-month change.

3. **COG / Liquidity-Gate ← MacroEquityBot's validation rig.** COG and the Liquidity-Gate
   report correlation/hit-rate diagnostics but not the **walk-forward + WFE + cost-modeled**
   discipline that makes MacroEquityBot's QQQ result credible. Run the GLI through the
   `macro_equity_backtest.py` walk-forward harness (504/63/21, 0.15% RT) before trusting it.

4. **All ← USD normalization.** COG and Liquidity-Gate both aggregate ECB/BoJ in home
   currency. Every multi-CB consumer should pull from one shared USD-normalized GLI series
   so the FX-conversion bug is fixed once, not per-system.

5. **MacroEquityBot ← Liquidity-Pulse's daily layer.** The monthly allocator is blind to
   the intra-month TGA/RRP flow that Liquidity-Pulse already tracks daily from the Treasury
   DTS. A daily-flow tilt could front-run the monthly rebalance around Tue/Thu settlement.

6. **RegimeV2 ← MacroEquityBot's regime-as-exposure framing.** RegimeV2 currently lets
   regime drive *direction*; Macro Alf's discipline (and MacroEquityBot's) is that the slow
   macro read should drive *exposure/floors*, with a separate faster layer for direction.
   Consider demoting GLI to an exposure governor rather than a direction vote inside V2.

### 5.3 Shared gaps none of the systems close yet
- No USD-normalized multi-CB aggregate (everything is home-currency or US-only).
- No cycle-phase clock anywhere — the defining Howell feature is missing across all four.
- No collateral/shadow-liquidity proxies (repo spreads, cross-currency basis, MOVE).
- No single shared GLI series — each system re-fetches and re-derives liquidity differently,
  so they can disagree. Consolidating onto one GLI module removes that drift.

---

## 6. Recommended roadmap

1. **Prototype the GLI signal before building infra.** Extend the COG 1A panel to
   USD-normalized Fed+ECB+BoJ+PBoC+BoE, add RoC-of-RoC and a cycle phase, and chart the
   GLI level/slope against NQ/BTC/gold. Confirm the signal has eyeball edge first.
2. **Validate** the prototype GLI through MacroEquityBot's walk-forward harness with costs.
3. **Add collateral/shadow proxies** (§4.3) and re-validate — measure marginal lift.
4. **Wire GLI into RegimeV2** as the Macro Alf exposure overlay (§5.2 item 1).
5. **Consolidate** all liquidity consumers onto the one shared GLI module (§5.3).

The order matters: see the signal (1) before trusting it (2), make it complete (3), then
let it govern sizing (4), then unify (5).

---

## 7. Pointers (file:line)

- COG config & panel: `js/cogConfig.js:48-140`
- COG Gate 1A math: `js/cogLiquidityGate.js:62-160`
- US net-liq factors & allocation: `MacroEquityBot/fred_signal.py:193-289`
- Walk-forward backtest: `macro-regime-conditional/macro_equity_backtest.py:347-663`
- Daily TGA/RRP pulse + weekly gate: `server.js:3603-3888`
- RegimeV2 entry score / weights: `RegimeV2/regime_score.py:29-37,128-250`
- RegimeV2 exits: `RegimeV2/regime_bot_v2.py:1147-1239`
- RegimeV2 macro overlay (where GLI fetcher slots in): `RegimeV2/macro_overlay.py`
