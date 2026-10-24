# cot-crowding-programme — what does COT crowding tell us, and can it improve trading decisions?

**Pre-registered 2026-10-24, before any state outcome was computed.** The only outcome statistics read before
registering were the means and standard deviations of the *control* sample on the discovery markets, used for the
power table (§5), which the template allows. Phase 1 (the measurement map) reads no forward outcomes.

| | |
|---|---|
| ID / ledger ids | family `cot-crowding-programme`; one ledger id per scored cell: `cot-crowding-p1` … `cot-crowding-p10`, `cot-crowding-a1` … `cot-crowding-a4`, `cot-crowding-va1`, `cot-crowding-va2` |
| Branch | `ccr-b9c5645b-qc2in4` |
| Register row | `plans/RESEARCH_REGISTER.md` → `cot-crowding-programme` |
| Data | CFTC TFF / Disaggregated futures-only, 34 markets, 2006 →; Yahoo daily OHLC (CME/ICE/COMEX/NYMEX/CBOT front-month continuous; FX = CME currency futures; ICE DXY); FRED monthly OECD 3-month rates, DFII10, DGS2. Scored reports 2007-06 → 2026-08-18; nothing after 2026-08-21 (lockbox) |
| Seed | `20261024` (every script) |
| Uncertainty | moving-block bootstrap over report dates (all markets on a date resampled together), block 26 weeks, B = 2000; applications: daily block 63 days, B = 2000 |
| Scripts / outputs | `scripts/cot-crowding-programme/` → `analysis/output/cot-crowding-programme/` |
| Harness | own Python (`panel.py`, `states.py`, `outcomes.py`) + the desk's trend engine imported unchanged (`js/trendFollowEngine.js`) for the applications |

## 1. The claim

The owner's research brief (2026-10-24): an extreme speculative position (e.g. EUR at the 95th percentile) might mean
one of several things:
1. the trend continues, because positioning confirms conviction;
2. the trend is vulnerable, because most speculative buyers are already in;
3. a sharp adverse move is more likely, even if the trend continues on average;
4. a trader should avoid new entries, cut risk, move stops or manage positions differently;
5. or crowding adds nothing once price, volatility and macro conditions are known.

These are competing hypotheses, not assumptions. The question: **does extreme speculative positioning add
information about future continuation, reversal risk, adverse excursion and volatility, conditional on the
positioning change, price behaviour, open interest and the macro regime? And does that improve real trading
decisions after costs?**

## 2. Why it is not already settled

| Entry | What it answered | Why this is different |
|---|---|---|
| `cot-positioning-factor` (Q17, null) | unconditional 4-week rank-IC of the positioning z-score, 8 markets | Preserved, not re-cut. This programme never scores the unconditional directional signal again. It asks *conditional* questions (state × price × flow × macro), adds risk outcomes (MAE, large adverse moves, vol, time to reversal), and tests decisions. |
| `positioning-into-release-*` | crowding on high-impact release days (D validated, R null) | Event-day only. Here every week is used, and release days aren't singled out. |
| `cot-extreme-aftermath`, `cot-extreme-duration`, `cot-trend-filter`, `cot-crowd-tail-asymmetry` (exploratory, not banked) | descriptive looks at the 12 discovery markets | Their findings shaped *which* questions are asked (see §3 "What earlier looks showed"), which is why the 12 markets they used are the **discovery** set here and every scored cell is confirmed on **22 markets no COT study here has touched**. |
| `crowded-bond-short-fomc` (null, backwards), `squeeze-fuel` (null) | one event type / retail positioning | Different participants and setups. |

## 3. Definitions, fixed in advance

**Markets.**
- **Discovery (12, already studied):** EUR, GBP, AUD, JPY, CAD, CHF, USD (ICE DXY), NQ, ES, TY, GOLD, SILVER.
- **Holdout (22, never used in a COT study here):** MXN, NZD, YM, RTY, US (30Y), TU (2Y), COPPER, PLAT, PALL, WTI,
  NATGAS, RBOB, CORN, WHEAT, SOYB, SOYOIL, SUGAR, COFFEE, COTTON, COCOA, CATTLE, HOGS.
- The **clean holdout** subset (financials + metals: MXN NZD YM RTY US TU COPPER PLAT PALL) is reported separately,
  because energy and livestock carry the largest roll jumps in unadjusted continuous futures.
- History guard: a market needs ≥ 260 scored reports (all 34 pass; RTY's Yahoo prices start 2017-07).

**Knowable when.** A report dated Tuesday T is public Friday T+3 15:30 ET. Its row is priced at **P = the first daily
close on or after the release Friday** (futures settle after 15:30 ET), no more than 4 days later. All features use
data dated at or before that close. Reports from the 2018-19 and 2025 shutdowns (published weeks late) are excluded.
Macro values are point-in-time: a monthly OECD rate is usable 45 days after its month ends and is missing once it is
more than 120 days stale; daily FRED series are usable the next day.

**Measures** (`panel.py`), spec = Leveraged Funds / Managed Money, in pair terms for JPY/CAD/CHF:
- share = net / OI;
- pct_share = rank of share against the prior up-to-155 reports (needs 52), the page's number;
- stretch s = pct_share if ≥ 50 else 100 − pct_share;
- d_share4, oi_chg4, dlong4/dshort4, dur90/dur80, frac80_26 (definitions in the module header).

**What Phase 1 showed (no outcomes; `phase1_measures.json`), and how it shaped the states:**
- Percentile, z-score and raw percentile are one measure (ρ 0.96–0.99). Net share, the gross long/short ratio and
  the trader-count ratio sit at 0.65–0.96 with them, and commercials mirror them (−0.79). That's one "level"
  dimension, 52% of variance.
- Flow (4-report change), OI change and duration are separate dimensions (≈ 3.2 effective dimensions in all).
- 14% of percentile extremes have the crowd side in the net minority. These are "trimmed" books, so the crowded
  flag requires the sign to agree, as `extremeOf` does.
- Only 42% of extremes are also gross-lopsided (≥ 3:1), and 62% of lopsided weeks are not historically extreme.
  Lopsidedness is reported descriptively, not as a state.
- At extremes, moves toward the crowd are about two-thirds new crowd-side positions; moves away are about 80%
  crowd-side liquidation. So "unwinding" means the crowd leaving.

**What earlier looks showed** (exploratory, discovery markets only; they inform the questions, not the bars):
- positioning follows the prior one to two months of price;
- fresh extremes continued and long-held ones went flat;
- weakening positioning didn't pull price;
- daily shocks against an extreme crowd were slightly more common, and the next month's vol about 5% higher;
- a COT filter on the trend system didn't help out of sample.

**States** (`states.py`), frozen:
- **crowded** = pct_share ≥ 90 with net long, or ≤ 10 with net short (crowd = +1 / −1).
- **trend_dir** = sign of the trailing 13-week price move.
- **crowded with trend** = crowded and crowd = trend_dir. This is the case the brief describes, and every primary
  cell uses it. *Crowded against trend* is reported descriptively.
- **m4** = +1 if the trailing 4-week move is in trend_dir (continuing), −1 if not (weakening).
- **flow** = +1 if share moved toward the crowd side over the last 4 reports (building), −1 if not (unwinding).

| State | Definition (crowded with trend) | The brief's reading |
|---|---|---|
| **A** | m4 = +1 and building | healthy: trend continuing, exposure increasing |
| **B** | m4 = −1 and building | vulnerable: momentum fading, exposure still increasing |
| **C** | m4 = +1 and unwinding | exposure beginning to unwind while price still goes |
| **D** | m4 = −1 and unwinding | active unwind: price reversing and exposure leaving |
| **E / F** | macro_dir = trend_dir / −trend_dir (any of A–D) | macro supports / macro deteriorating |

**macro_dir** is the sign of the 13-week change in the market's driver, in price terms. It's defined for FX, gold
and Treasuries only:
- FX: the 3-month rate differential (EUR: EZ−US, GBP: GB−US, AUD: AU−US, NZD: NZ−US, MXN: MX−US; USDJPY: US−JP,
  USDCAD: US−CA, USDCHF: US−CH; DXY: US−EZ);
- gold: −Δ DFII10;
- TY / US / TU: −Δ DGS2.

**danger** = m4 = −1 and oi_chg4 < 0 (price stalls while open interest contracts).

**The control.** Non-crowded weeks (not crowded and s < 70) in the same market. The outcome is signed by trend_dir in
both arms. Matched cells are **market × trend-strength tercile (|mom13| / σ_w√13, within market) × m4 × vol-regime
tercile (20-day ÷ 260-day daily realised vol, within market)**; cells add macro_ok where a cell uses it. The terciles
use each market's own full-sample cut points: a binning device built from pre-release data only.
- Effect = mean over state rows of (row value − mean of its control cell). Rows with an empty cell are dropped and
  counted.
- So each state is compared with weeks that had the **same price pattern, trend strength and vol regime, but no
  crowding**. That is the "beyond price and volatility" question.

**Outcomes** (`outcomes.py`), signed by trend_dir, from P along the daily path after the entry close:
- **r1, r4, r12**: forward log return in units of σ_w·√h. σ_w is the sd of the prior 52 weekly returns.
- **mae4, mae12 / mfe4, mfe12**: max adverse / favourable excursion from intraday lows and highs, in the same units.
- **big_adverse4**: 1 if the adverse excursion within 4 weeks reaches 2σ_w. The control base rate is 41%.
- **rv_ratio**: sd of the next 20 daily log returns ÷ sd of the prior 60.
- **shock20**: any of the next 20 daily returns ≤ −2.5 × trailing 60-day sd (against).
- **t_rev / rev12**: weeks until a weekly close is ≥ 2σ_w against the trend, censored at 26.

**De-clustering and uncertainty.** Weekly rows overlap within an episode (a run of the same state in a market, gaps
≤ 2 merged), and markets co-move. Intervals come from the 26-week moving-block bootstrap over report dates, with all
markets on a date resampled together; it carries both dependencies. Episode counts are reported for every cell, and
power (§5) uses episodes as the effective n.

**Sample split.** The confirmatory test of P1–P7 is on the **holdout markets** (2007–2026), with the **discovery
estimate reported alongside**. The **two chronological halves** of the holdout (2007-06 → 2016-12 and
2017-01 → 2026-08) must agree in sign.

**Trading applications** (Phase 4), each its own cell:
- **Trend system**: `js/trendFollowEngine.js` imported unchanged (DEFAULTS: lookbacks 21/63/126/252, inverse-vol
  sizing, 10% portfolio vol target, 2bp turnover cost), run on all 34 markets.
  - Daily signals use the most recent report **released before** that day (first trading day after the release
    Friday).
  - In-sample 2007-06 → 2016-12; **out-of-sample 2017-01 → 2026-08-21**, with subperiods 2017–2021 and
    2022 → 2026-08.
  - Unadjusted continuous futures put roll jumps into both arms equally. The arms differ only where a state fires.
- **Vote Atlas bot**: its recorded trades (`analysis/output/level-atlas-vote-trades/<inst>-votetrades.json`, costs
  included in `pnlPct`, 2022-05-05 → 2026-08-20), on the 12 instruments with their own COT market:
  - EURUSD, GBPUSD, AUDUSD, NZDUSD, USDJPY, USDCAD, USDCHF → their currency;
  - gold → GOLD, nq → NQ, spx → ES, dow → YM, us2000 → RTY.
  - A trade is "with the crowd" if its side equals the crowd direction (pair terms). The COT row used is the latest
    report released before the trade's entry time.
  - The split is IS 2022-05-05 → 2024-06-30, **OOS 2024-07-01 → 2026-08-20**. The bot's own rules were fixed on
    data overlapping this period; that is stated as a caveat, and only the conditional difference is scored.

## 4. Hypotheses, expectation first

All two-sided. "Holdout" = the 22 held-out markets. Expectations are what the earlier looks would suggest, stated so
a null isn't a surprise.

| # | Cell (outcome, comparison) | Pre-registered expectation |
|---|---|---|
| **P1** | crowded-with-trend vs matched control: **r12** | small or null (earlier looks: fresh extremes continue, long-held go flat; these may cancel) |
| **P2** | crowded-with-trend vs control: **big_adverse4** | slightly higher (bumpier ride), ≤ +5pp |
| **P3** | crowded-with-trend vs control: **rv_ratio** | slightly higher, ≈ +0.03 to +0.05 |
| **P4** | **B** vs control: **big_adverse4** | higher if "vulnerable" is real; null is plausible |
| **P5** | **D** vs control: **r4** | negative if "active unwind" is real; earlier look: weakening positioning didn't pull price |
| **P6** | **A** vs control: **r12** | positive or null (healthy-trend reading) |
| **P7** | within crowded-with-trend: **danger** rows vs other crowded rows, matched market × T3 × V3: **big_adverse4** | null or slightly higher |
| **P8** | within crowded-with-trend on macro-defined markets: **F** (macro against) vs **E** (supports), matched market × T3 × m4 × V3: **r4** | negative if macro non-confirmation matters; scored on **all** macro-defined markets (discovery + holdout), with both chronological halves, because the holdout alone has 72 F episodes (§5) |
| **P9** | **incremental prediction of big_adverse4**: logistic model with the baseline (trend strength, m4, mom26/σ, vol ratio, macro_ok as three dummies) vs baseline + COT (crowded-with-trend, state dummies, s, flow×crowd, oi_chg4, frac80_26, against-trend); fit on discovery markets (all years), scored on holdout markets (all years) | null or a tiny gain |
| **P10** | same as P9 for the **sign of r12** (continuation vs reversal) | null |
| **A1** | trend system, **entry filter**: a new position (signal changes sign) is not opened while that market is crowded with trend in state B or D on the signal's side; it opens when the state clears | null |
| **A2** | trend system, **risk scaling**: signal × 0.5 while crowded with trend in B or D on the signal's side | lower tail risk, little Sharpe change |
| **A3** | trend system, **exit**: signal set to 0 while crowded with trend in D on the signal's side | null or slight harm |
| **A4** | trend system, **state-scaled**: A ×1, C ×1, B ×0.5, D ×0 | null |
| **VA1** | Vote Atlas: trades **with** a crowd in B or D vs trades in non-crowded weeks, matched on instrument × decision (fade/follow) × rung × session: **mean pnlPct**, full period | null |
| **VA2** | Vote Atlas: **skip** trades with a crowd in B or D: OOS (2024-07 → 2026-08) mean pnlPct per trade vs taking all trades | null |

**THE GATE**, by family:
- **P1–P7.** All of these:
  - holdout effect 95% CI excludes 0;
  - Holm-adjusted p < 0.05 across P1–P10;
  - sign matches the discovery estimate;
  - same sign in both holdout halves;
  - ≥ 40 holdout episodes in the cell.
  - **VALIDATED** also needs the practical bar: |r| ≥ 0.20 (r12) / 0.25 (r4); |Δ big_adverse4| ≥ 0.05;
    |Δ rv_ratio| ≥ 0.05.
  - A confirmed effect below its practical bar is **CONTEXT**.
- **P8.** CI excludes 0 on all macro-defined markets, both chronological halves the same sign, Holm across P1–P10.
- **P9 / P10.** Holdout out-of-sample log-loss improvement > 0, with the 26-week block-bootstrap CI excluding 0 and
  both holdout halves positive. Holm across P1–P10.
- **A1–A4.** OOS Sharpe difference vs BASE with the 63-day block-bootstrap CI excluding 0, and the same sign in both
  OOS subperiods; Holm across A1–A4 and VA1–VA2.
  - **A2 instead:** OOS daily CVaR(97.5%) of the basket improves with CI excluding 0, max drawdown no worse, and the
    Sharpe difference's lower CI bound > −0.10 (non-inferiority).
- **VA1.** CI excludes 0 (day-block bootstrap, block 20 trading days) and the same sign in IS and OOS.
- **VA2.** OOS mean pnlPct/trade improves with CI excluding 0, and total OOS pnl does not fall.
- **Promotion to anything live** (a bot gate, a sizing rule) needs |t| ≥ 3 on its cell, not just a pass.

**THE MIRROR.**
- Crowded-*against*-trend rows, and trimmed books (extreme percentile with the opposite net sign), are run through
  the same P1–P3 comparisons descriptively.
- A pass in P1–P3 that the trimmed arm reproduces is about the percentile, not about crowding, and is demoted to
  CONTEXT.

## 5. Power — what this design can and cannot find

- Control SDs come from the **discovery control sample** (n = 4,218 weeks): r1 1.91, r4 1.88, r12 1.90,
  big_adverse4 0.49 (base 0.41), rv_ratio 0.42.
- Episodes are the effective n (design effect ≈ 1 per episode). MDE ≈ 2.8 × SD / √episodes; the control term is
  negligible.

| Cell | Holdout rows / episodes | Outcome SD | **MDE** (80%, α 0.05) | Pass bar | Verdict |
|---|---|---|---|---|---|
| P1 with-trend, r12 | 4,362 / 686 | 1.90 | 0.20 | 0.20 | POWERED (at the bar) |
| P2 with-trend, big_adverse4 | 4,362 / 686 | 0.49 | 0.052 | 0.05 | POWERED (at the bar) |
| P3 with-trend, rv_ratio | 4,362 / 686 | 0.42 | 0.045 | 0.05 | POWERED |
| P4 B, big_adverse4 | 681 / 423 | 0.49 | 0.067 | 0.05 | UNDERPOWERED for 5–6.7pp; finds ≥ 6.7pp |
| P5 D, r4 | 381 / 253 | 1.88 | 0.33 | 0.25 | UNDERPOWERED for 0.25–0.33σ |
| P6 A, r12 | 2,726 / 776 | 1.90 | 0.19 | 0.20 | POWERED |
| P7 danger vs other crowded | 543 / 316 vs 3,819 | 0.49 | 0.077 | 0.05 | UNDERPOWERED for 5–7.7pp |
| P8 F vs E (all macro markets) | F ≈ 748 rows / 206 episodes vs E ≈ 1,437 / ≈ 300 | 1.88 | ≈ 0.48 | 0.25 | UNDERPOWERED by design: run and reported, and an empty result is UNDERPOWERED |
| P9 / P10 | 4,362 crowded + all holdout weeks | — | gated by CI | > 0 | — |
| A1–A4 | 34 markets, 9.6 OOS years | — | Sharpe SE ≈ 0.33 over 9.6 years; diffs of correlated arms are much tighter | CI gate | judged by the CI |
| VA1 / VA2 | depends on trade overlap with B/D states | — | reported with n | CI gate | an empty cell with n < 100 trades is UNDERPOWERED |

## 6. Multiplicity

- **Scored family 1 (meaning):** P1–P10, Holm at α = 0.05. p-values come from the bootstrap via `pFromCI` (normal
  approximation).
- **Scored family 2 (decisions):** A1–A4, VA1, VA2, Holm at α = 0.05.
- The conjunctive gates (discovery sign, both halves, episode floor) are on top of Holm.
- **Disaggregation (descriptive):** per market, per asset class, by duration, one-sided vs not, accumulation vs
  covering composition, shock20, mae12/mfe12, rev12, the clean-holdout subset, and crowded-against-trend.
  - These get BH at q = 0.10 with their chance baseline.
  - A survivor is a candidate for its own prereg, never a result.
- **Variants:** none. The thresholds (90/10, 13-week trend, 4-week m4/flow, s < 70 controls, 2σ_w adverse) are
  fixed here. No other threshold is run under this registration.

## 7. What this does NOT test

- **Unconditional direction** (Q17 stands).
- Intraday timing around the release.
- **Cause:** a confirmed state effect says crowding *in that state* comes with different outcomes, not why.
- Live tradability beyond the stated cost models. The trend engine charges 2bp per unit of turnover. Financing and
  roll costs are not modelled beyond what the unadjusted continuous price embeds.
- The Vote Atlas bot's own edge.

## 8. What each verdict changes

- **P-cells validated:** the COT page's persistence and spotlight panels gain the measured line for that state, e.g.
  "in state B, a 2σ adverse move within 4 weeks has happened X% vs Y% for matched non-crowded weeks". No composite
  score.
- **P-cells context or null:** the page says plainly that the state comes with no measurable difference beyond price
  and volatility, and stops implying one.
- **A-cells validated (and |t| ≥ 3 for anything live):** the trend system gains that rule as a versioned variant
  (`trendFollowV{n}`), A/B'd on the OOS card. Validated below |t| 3: research only, plus a forward record.
- **VA-cells validated:** a proposed bot gate goes to the owner as a parity-risk change; nothing is wired in from
  this study.
- **Underpowered cells:** stated with their MDE. The fix is more history (legacy COT 1990s + longer price data) or a
  forward record.
- **Final classification** (the brief's four outcomes): each state is reported as "healthy", "vulnerable",
  "active unwind" or "COT adds nothing here" **only where its cells support that word**.

## Amendments

(none yet)
