# A. Directional bias: what the repo's own theory teaches, what was tested, and what never was

Research note, 2026-11-15. Read-only pass over `theory-lab/`, `MD files/`, `plans/`, `forge/`, the regime bots, the
HMM modules and `js/deskEvidence.js` (Evidence Book, 395 entries). Verdict words are the ledger's: VALIDATED, NULL,
UNDERPOWERED, CONTEXT. Ledger ids are in `code`. "Lesson" means `theory-lab/lessons/<slug>.html`. Quotes are short and
exact.

Bias here means up / down / range per instrument over about 24 hours to a few days.

---

## 0. The answer in six lines

1. **Theory Lab has no lesson on market structure (swing highs/lows, break of structure) and none on multi-timeframe
   analysis.** A grep of all 378 lesson files for "multi-timeframe / higher timeframe / break of structure / higher low"
   finds nothing. The only "swing high" in the curriculum is a lookahead warning (`walk-forward-purged-cv.html`: "A swing
   high or low at bar i is defined by the bars on both sides of it, so its feature window reaches forward").
2. The frameworks the theory does teach for direction are: regime inference (HMM, Markov-switching, change-point,
   clustering), persistence vs mean reversion (Hurst/VR, OU, trend/cycle filters), the macro chain (four markets, the
   domino chain, IRP/carry, central banks, Taylor rule, yield curve), positioning and flows (COT, GEX, OI walls, fixes,
   risk reversals), and decision hygiene (base rates, combining signals, "no view" as an output).
3. The repo's standing reading, repeated in nearly every DESK box: **range/size is forecastable, direction mostly is
   not.** The daily-bias agenda counts "macro direction 0 of 82 validated, price direction 13 of 76", and 41 validated
   range entries (`.claude/skills/research-director/agendas/daily-bias.md`).
4. **Validated direction effects are few, small and sparse:** `post-fomc-usd-drift` (demoted to "descriptive" in the
   Global Read after the code audit graded it FRAGILE), `positioning-into-release-direction` (+0.064 ATR against a crowd),
   `cot-crowding-p5` (state D, 4 weeks, non-G10 holdout), `reversal-hour` (time-of-day reversion). The multi-timeframe
   learner `bias-learner-fx` is NULL; gold and indices are UNDERPOWERED.
5. **HMM: one honest direction test only**, `gr-hmm-trend-direction` (daily HMM, single timeframe, next day, NULL). The
   daily HMM splits on **variance, not direction** (`hmm.js` header). **HMM state alignment across timeframes (5m/1h,
   M30/H2), which RegimeV2/V4/V7 use as an entry gate, has never been tested honestly.** The only replay is contaminated
   by an ADX one-bar-future shift (`MD files/BACKTEST_INDEX.md`).
6. **Multi-timeframe trend alignment at 24h–days has never been tested as a sparse "all timeframes agree" state.** What
   exists: per-timeframe EMA slopes as linear inputs to the bias learner (NULL in FX), H1/H4 EMA state at the vol lines
   (a reversed, sub-cost continuation effect), and 1m–1h oscillator zone alignment (real, sub-cost reversion).

---

## (a) Frameworks for bias that the repo's theory teaches

### a1. Regime inference (latent state)

| Framework | Source | What it teaches (1–3 lines) |
|---|---|---|
| Hidden Markov Models | `theory-lab/lessons/hidden-markov-models.html` | Infer a hidden regime from data instead of a hand-set rule. Expected duration is 1/(1−A_ii); the worked 2-state trending/choppy matrix gives ~3.3 and ~6.7 days. Hard rule: "Smoothed/Viterbi labels use future data — never use them live"; use the filtered P(S_t given O_1:t). More states always raise likelihood; use AIC/BIC and OOS. |
| Markov-switching state space (Kim filter) | `theory-lab/lessons/regime-switching-state-space.html` | Fuses the HMM's discrete regime with a Kalman continuous state; Kim's collapse keeps it tractable. Its own takeaway: "A regime call describes the backdrop; it is not a trade." |
| Change-point detection (CUSUM, BOCPD) | `theory-lab/lessons/change-point-detection.html` | Narrower question than an HMM: has a change happened, and when. k/h trade speed against false alarms; BOCPD gives a run-length posterior. |
| Clustering for regimes | `theory-lab/lessons/clustering-market-structure.html` | k-means / hierarchical clustering to find regimes or instrument groups without labels. "Market structure" here means correlation structure, not price swings. No ground truth, so a clean split is not proof. |
| Growth × inflation regime | `MD files/REGIME.md` (desk doc; also `education/macro-deep-dives-notes.md` §1.3–1.6) | Monthly label from growth and inflation rates of change: goldilocks / reflation / stagflation / deflation. Labels are choppy (median spell 3 months). |

### a2. Trend vs mean reversion (does the path persist?)

| Framework | Source | What it teaches |
|---|---|---|
| Hurst exponent and variance ratio | `theory-lab/lessons/hurst-variance-ratio.html` | H or VR(q) say whether the recent path reinforces or undoes moves. "Neither statistic predicts direction"; it "licenses which strategy family has a right to work, not which way price goes next". "Persistence is episodic, and direction persists far less than pace." |
| Ornstein-Uhlenbeck mean reversion | `theory-lab/lessons/ou-mean-reversion.html` | Half-life of reversion as a sayable number ("reverts halfway back every N days"); contrasts it with the desk's drift ÷ diffusion trend-day score T. |
| Trend/cycle filters (HP, Butterworth, Baxter-King) | `theory-lab/lessons/trend-cycle-filters.html` | Trend + cycle decomposition; HP has end-of-sample bias exactly where decisions are made (Hamilton 2018). |
| Fractional Brownian motion | `theory-lab/lessons/fractional-brownian-motion.html` | Long memory / H as a model parameter (background to Hurst). |
| Factor premia: time-series and cross-sectional momentum, carry | `theory-lab/lessons/factor-based-portfolio-construction.html`, `institutional-fama-french-carhart.html` | "Momentum everywhere" literature; trend and carry as slow factors at weeks–months. |

### a3. Macro drivers of FX, gold and indices

| Framework | Source | What it teaches |
|---|---|---|
| Four markets, four questions | `theory-lab/lessons/four-markets-four-questions.html` | "Equities: mood. Treasuries: safety demand and the rate path. Options: uncertainty (size). FX: whose money people want." Split nominal yield into real + breakeven; "Disagreement is the signal." |
| The domino chain | `theory-lab/lessons/domino-chain-cross-asset.html` | Oil → breakevens → real yields → dollar / gold / equities. Desk verdict inside the lesson: the chain is real as mechanism "and it mostly happens in the same bar". |
| Interest-rate parity, UIP failure, carry | `theory-lab/lessons/interest-rate-parity.html` | CIP is an identity, UIP is not; Fama (1984) wrong-sign coefficient (~−0.88) is the basis of carry; carry is "short a fat left tail". |
| PPP | `theory-lab/lessons/purchasing-power-parity.html` | Slow anchor; reversion over years. |
| Central-bank policy | `theory-lab/lessons/central-bank-policy.html` | Dual-mandate 2×2; "It's the surprise, not the stance, that moves price." |
| Taylor rule | `theory-lab/lessons/taylor-rule.html` | Policy-rate gap vs the rule as a lean on the currency over months. |
| Yield curve and growth expectations | `theory-lab/lessons/yield-curve-growth-expectations.html` | Curve shape as growth expectations; inversion → recession. |
| QE/QT | `theory-lab/lessons/qe-qt-balance-sheet.html` | Balance-sheet channels to yields. |
| Event trading playbook | `theory-lab/lessons/event-trading-playbook.html` | Event vol, surprise, positioning into releases. |
| Macro capstone ("the morning macro read") | `theory-lab/capstone-macro.html` | The macro path's deliverable: each market's answer, the one chain moving, the plumbing, the policy gap; tag every sentence "(validated), (null), (context) or (untested)". Its rate-differential step says plainly that yields "explain FX in the same bar, not the next". |

### a4. Positioning and flows

| Framework | Source | What it teaches |
|---|---|---|
| Dealer gamma (GEX) | `theory-lab/lessons/gamma-exposure-dealer-hedging.html` | "Short gamma amplifies, long gamma dampens" (derived); dealer sign is an assumption. |
| OI walls and max pain | `theory-lab/lessons/open-interest-walls-max-pain.html` | Walls as fences, max pain as a magnet claim. |
| Order-flow imbalance, microprice | `theory-lab/lessons/institutional-order-flow-imbalance.html` (also `vpin-order-flow-toxicity`, `institutional-pin`, `institutional-trade-classification`) | Seconds-to-minutes direction from book pressure; out of the 24h horizon. |
| FX fixings and month-end flows | `theory-lab/lessons/fx-fixings-wm-reuters.html` | "Month-end sign rule: hedge top-ups sell the currency of the stock market that rose most", Flow_USD = B·r_F − A·r_US. "Know it, don't worship it". |
| FX risk reversals | `theory-lab/lessons/fx-options-quoting-rr-bf.html` | "A risk reversal is the market paying up for one side"; it mixes crash risk, hedging demand and spot–vol correlation. |
| Herding, crowding, forced selling | `theory-lab/lessons/herding-narratives-bubbles.html`, `investor-mood-forced-selling.html` | Crowding and forced sellers; the evidence supports "positioning (know how concentrated your exposure is), not timing". |
| VIX as uncertainty | `theory-lab/lessons/vix-uncertainty-not-fear.html` | VIX prices size, not sign. |

### a5. Decision hygiene for a bias

| Framework | Source | What it teaches |
|---|---|---|
| Base rates first | `theory-lab/lessons/action-base-rates.html` | Write the reference-class base rate before looking; posterior odds = prior × LR; "A hit rate without its base rate can look like an edge and be exactly nothing." |
| Combining signals that disagree | `theory-lab/lessons/action-combining-signals.html` | Correlated signals are one vote: N_eff = N/(1+(N−1)ρ). Combine by regression w = R⁻¹·IC, shrink by record length; "'No view' is a written output." |
| EMH / "priced in" | `theory-lab/lessons/emh.html` | Semi-strong form as the bar a public-information direction call has to clear. |
| Multiple testing, walk-forward | `multiple-testing.html`, `walk-forward-purged-cv.html` | Breadth and purging; the pivot-lookahead warning above. |

### a6. Desk documents that set out a bias framework (not lessons, but the repo's own design theory)

| Framework | Source | Summary |
|---|---|---|
| Top-down: global → currency → asset | `plans/DESK_ANALYST_PIPELINE.md` §2 | "All analysis runs global market → currency impacts → assets". Eight currency debates; pair views come from the two legs. Rule 1: "The LLM layers add context; they never create a signal." |
| Morning bias card, three calls | `plans/DESK_MORNING_BIAS_CARD.md` (proposal, not built) | Per instrument: `day_type` (RANGE / EXPANSION / UNCLEAR), `direction` (UP / DOWN / NO VIEW) with `p_up`, `event_state`. Fill order: calendar → one USD call first → local layer → day type → positioning tilt → stand-aside (expect "a third to a half" NO VIEW) → expression. Publish checks: coherence with the USD call, no call pre-release, no high-conviction call on RANGE days. |
| Daily-bias agenda | `.claude/skills/research-director/agendas/daily-bias.md` | The edge is, in order: (1) range vs expansion, (2) "conditioning direction on events and positioning", (3) abstaining. Max Cole's routine "already has that shape". |
| Selective forecaster | `plans/MACRO_DIRECTION_RESEARCH_PROPOSAL.md` §0, §B | Not a daily call. Speak only when "a condition with measured, out-of-sample evidence is active". Keep regime probability, directional probability, confidence and EV separate. Execution timing ("VWAP, HTF structure, levels") is a separate layer. H7 names a "slow price-trend regime as the higher-timeframe bias". |
| The bar | `forge/DIRECTION_BAR_PREREG.md` (`direction-bar`, CONTEXT) | Score against B0 (point-in-time climatology), B1 buy & hold, B2 momentum, B3 carry, never 50%. A cell active 10% of days must move P(up) ~6pp at 1 day, ~15pp at 5 days. |
| Evidence-weighted combiner | `js/globalReadCore.js`, `MD files/GLOBAL_DECISION_ENGINE.md` | Weight e_i = P(real given tier) × IC × n/(n+30) × freshness; null and untested inputs get weight 0 but are still shown. P(up) = Φ(ŷ/√(1−R²)). |
| Which gold is trading | `MD files/FOUR_GOLDS.md` | Gold is rates gold, dollar gold, reserve gold or fear gold, "only one drives at a time". Label from the 20-day real→gold and $→gold links. |
| Market State Engine | `plans/MARKET_STATE_ENGINE_PLAN.md` | Capital-flow hierarchy; "It describes. It does not forecast." |
| Regime screen | `MD files/REGIME.md` | Growth × inflation labels as backdrop; R2 per-currency regime differential. |
| Travel read (structural direction from price) | `js/travelRead.js` header | Position in the 3-month range sets the direction, efficiency ratio vs a random walk sets the weight. "DESCRIPTIVE … Nothing here is backtested." The closest thing in the repo to a market-structure read. |
| HMM regime bots | `RegimeV2/README.md`, `RegimeV4/regime_bot_v4.py`, `RegimeV7/regime_bot_v7.py`, `hmm5m.js`, `hmm5m-v2.js` | Trade BULL long / BEAR short. Gates include "1h alignment" (V2: "BULL on 1m with BULL on 1h = trend-aligned, full conviction"; blocks entries when 1h is opposed), cross-pair consensus, BOCPD exits; V7 adds an optional 4× HTF (H2 on M30) gate. |
| MTF regime classifier | `regime_classifier_mtf.py` | 5-state GaussianHMM on 1m/5m/15m/30m/4h for gold/NQ; labels BULL/BEAR TREND/CHOP, NEUTRAL. Plots only. It fits on the whole window and decodes with `model.predict` (Viterbi), which the HMM lesson says is lookahead. |
| Short-horizon direction model | `MD files/SHORT_HORIZON_DIRECTION_MODEL.md` | For 1–2h turns: multi-timeframe WaveTrend zone exhaustion; "alignment reverts, conflict does nothing". |

---

## (b) What the repo has tested on each, with verdicts

Results are as banked in `js/deskEvidence.js` (date, verdict, one line).

### b1. HMM and regime labels

| Ledger id | Verdict | One-line result |
|---|---|---|
| `gr-hmm-trend-direction` (2026-11-05, `forge/GLOBAL_READ_UNTESTED_DIRECTION_PREREG.md`) | NULL | Daily `fitHMM` on 200 returns, TREND regime with \|t\|≥1 on last 10 returns → next day, 7 USD pairs 2016–2026: IC −0.011 [−0.030, +0.008], MDE 0.027. "The HMM trend label describes the last fortnight; it is not a next-day call." |
| `regime-divergence-fx` (2026-09-20, `MD files/REGIME.md#R2`) | NULL | Diverging vs aligned growth/inflation regimes: EUR/USD range +0.03pp [−0.48, +0.52]; returns all through zero. |
| `stock-bond-flip` (2026-09-17) | CONTEXT | Negative stock/yield correlation: 71 episodes since 2008, median 5 sessions; 36 clean flips, too few to test. |
| `motif-regime-lookahead` (2026-09-19) | CONTEXT | Labelling the swing regime when knowable, not at the pivot, relabels 20.6% of bars; PF 1.315 → 1.198. |
| `iv-regime-fade-follow` (2026-09-23) | NULL | IV regime does not pick fade vs follow days. |
| `rates-follow-through-regimes` (2026-10-18) | CONTEXT | Follow-through after a confirmed spread move existed in 2016 and 2020 only; "could not be recognised before it paid". |
| REGIME.md US table | CONTEXT (not a ledger id) | Next-month tilts for S&P/Nasdaq in goldilocks/reflation and gold in deflation; "no tilt" for every FX pair, the dollar and the 10-year. |
| Regime bots (V1–V7) | not tested | `MD files/BACKTEST_INDEX.md`: `regime-backtest.html` is "Contaminated by the ADX one-bar-future shift". `plans/MACRO_DIRECTION_RESEARCH_PROPOSAL.md` A1: "HMM and regimes, 0 honest tests … The daily HMM splits on variance, not direction" (written before `gr-hmm-trend-direction`). |

### b2. Trend, momentum and multi-timeframe readings

| Ledger id | Verdict | One-line result |
|---|---|---|
| `trend-following-fx` (2026-07-20) | NULL | FX-only basket null (verified by an independent rebuild); multi-asset ~0.3 OOS ≈ buy & hold. |
| `fx-factor-momentum` (2026-11-01) | UNDERPOWERED | Cross-sectional 1/3/12-1 month FX momentum: OOS rank-IC −0.045 [−0.190, +0.104]. |
| `fx-factor-book-v2` (2026-09-27) | UNDERPOWERED | TSMOM/carry overlays: trend −0.16 OOS; carry +0.61 (1.5 SE, rate-divergence era). |
| `bias-learner-fx` (2026-11-15, `forge/BIAS_LEARNER_PREREG.md`) | NULL | L2 logistic over 13 morning readings incl. **1h/4h/D1/W1 EMA20 slopes**, Asia move, close location, events, surprise, carry, COT, σ regime, IV/RV; 9 FX pairs: Brier skill vs B0 +0.045% to +0.148%, every CI below the useful bar; top-confidence R ≈ base-rate drift. |
| `bias-learner-gold` / `bias-learner-idx` (2026-11-15) | UNDERPOWERED | Same learner; no point estimate useful; confident-day gains = B0 drift. |
| `gr-dollar-tape-direction` (2026-11-05) | NULL | Broad dollar 20d move → next day: IC +0.006 [−0.019, +0.032]. |
| `gr-today-tape-direction` (2026-11-05) | NULL | 00:00→13:00 London move → 13:00→21:00: IC +0.002. |
| `hold-day-one-confirm-run` / `-hold-r` (2026-11-15) | NULL | A ≥1σ day closing at its extreme does not continue over 1–5 sessions (P-bar −0.038; mirror −0.094). |
| `exit-on-fixed-entries` (2026-11-15) | NULL | 07:00 entries in the **4h EMA20-slope** direction: no exit rescues them; raw net R negative under every exit. `exit-on-fixed-entries-map` (CONTEXT): 4h-slope MFE/MAE = random side. |
| `fast-start-rest-of-day` (2026-09-18) | VALIDATED (range) | Fast first 2h → wider afternoon; direction continued 47–60% vs 48–52%, "a coin flip". |
| `tape-speed-persistence` (2026-09-12) | VALIDATED (pace) | Pace persists 68/68 cells; "Not a direction". |
| `reversal-hour` (2026-08-30) | VALIDATED | 20:00–22:00 UTC reverts intraday moves (EUR/USD +10pp, gold +7.6pp); session-open moves persist. |
| `daily-band-fade` (2026-09-23) | NULL | Daily close outside a vol band does not revert (t 0.85). `ou-bands-fx-crosses` UNDERPOWERED (22 OOS trades, 6% reached target). |
| `vmc-nq-cipher-direction` / `-interaction` (2026-10-30) | NULL | NQ Cipher B incl. "higher-timeframe agreement" and "four-component alignment": 0/186 cells survive; "agreement across components or timeframes is not better than one component". |
| `swing-structure-vwap` (2026-08-28) | CONTEXT | Oscillator turn far from VWAP is more often the swing high/low (1.3× hit rate, 3/3 instruments); "Structure, not a trade." |
| `direction-vote-at-lines` (2026-10-08) | CONTEXT | 20d trend + yield book + US-DE 2y + post-FOMC + rates gap vote: monotone ladder at the line (v≤−2 worst), but does not predict the London session (hit 49.0%). |
| `v4-dirtag` (2026-09-29) | NULL | today.html direction tag 47.6% at 08:00. |
| Not banked as ids: `analysis/output/rangebook/HTF_TREND_RESULTS.md` (prereg `forge/MACRO_TREND_WEEKDAY_PREREG.md` §B) | effect real, trade null | H1/H4 EMA20/EMA50 structure at vol-line touches: "The hypothesis is reversed": touches against the H1 trend continue +5.8pp (FX/gold) / +6.6pp (indices) more, both halves; 0/8 trade rows survive; "pays nothing after spread". The 5-day-trend version was null (`forge/CONFLUENCE_LEVELS_PREREG.md`). |
| Not banked: `MD files/VMC_TRIPLE_TF_FINDINGS.md`, `vumanchuLab/FINDINGS.md` (via `MD files/SHORT_HORIZON_DIRECTION_MODEL.md`) | sub-cost | 1/5/15m all-oversold zone alignment → P(up) +5.30pp at 60m (EURUSD), "alignment reverts, conflict does nothing"; cross-based MTF agreement "BELOW its chance baseline"; triple-TF buy circle NULL after costs. `VUMANCHU_DIRECTION_FINDINGS.md`: "Multi-timeframe agreement adds nothing" as a continuous score. |
| Exploratory only: `analysis/output/h4-trend-hold/RESULTS.md`, `macro-h4-blend/RESULTS.md`, `max-bias-reverse/RESULTS.md` | not banked | 4h trend alone −0.042R/trade pre-lockbox; holding overnight worse. Macro and the 4h trend agree 48% of days. Max Cole's side agrees with the 4h EMA20 slope on 84% of 57 instrument-days (88% day-clustered). |
| Hurst as an entry-bias feature | not a ledger id | `hurst-variance-ratio.html` DESK box: dropped from the conviction score July 2026 after "an out-of-sample benchmark across 10 instruments found no usable predictive relationship". `conviction-vote` NULL. |

### b3. Macro drivers

| Ledger id | Verdict | One-line result |
|---|---|---|
| `post-fomc-usd-drift` (2026-08-20) | VALIDATED, then FRAGILE | +26bp over 5 sessions, 65% up, n=81, both halves. Global Read demoted it to "descriptive" after the 2026-10-31 code audit (`js/globalReadCore.js`). |
| `yields-to-fx-direction` (2026-08-23) | NULL | Yield moves explain FX "only in the same bar". |
| `gr-us-yields-direction` (2026-11-05) | NULL | 20d US 10y rise → next-day dollar: IC +0.017. |
| `gr-risk-tone-direction` (2026-11-05) | NULL | 20d BAA credit change → risk side next day: IC −0.013. |
| `macro-confluence-baa-credit` (2026-10-24) | NULL | Net liquidity + curve + credit all agreeing does not predict EUR/USD, SPX500, gold at 5/20 days. `macro-confluence-direction` UNDERPOWERED (HY OAS window too short). |
| `policy-direction-at-lines` (2026-10-08) | NULL | Post-FOMC drift and 63d US–DE 2y momentum: right sign, too small; EURUSD 5-day hold hit 49.7%. |
| `nonus-yield-gap-direction` (2026-09-20) | NULL | Foreign-led yield rise: next session 50–55%. |
| `cb-tone-direction` (2026-08-20) | NULL | Statement tone priced inside 30 minutes; next-day sign agreement 46%. |
| `priced-in-direction`, `priced-in` | NULL | Lead-up state does not change the outcome's effect; k-NN 49.3% vs placebo 51.5%. |
| `rates-pivot-lead`, `front-end-shock`, `curve-inversion`, `fear-gold`, `oil-to-breakevens` | NULL | Rates do not lead equities or FX; hawkish 2y shocks → calmer FX; fear gold −1.19% at 20 sessions. |
| `residual-reversion-fx`, `fx-short-term-fair-value`, `rates-residual-catchup` | NULL / UNDERPOWERED | Price minus macro fair value does not close tradeably. |
| `yield-ladder-eurusd`, `yield-ladder-nq` | UNDERPOWERED | Decomposed rate drivers add nothing measurable OOS. |
| `rate-surprise-eurusd` / `-nq`, `post-release-drift-pooled` | UNDERPOWERED | Post-release direction. `post-release-momentum-pooled` NULL. |
| `analogue-weeks` | NULL | Nearest macro weeks at 13 weeks: S&P 75% vs 76% base. |
| `which-gold` (FOUR_GOLDS G2) | CONTEXT | Rates gold 19% of windows, dollar gold 18%, both 16%, neither 45%. |
| `stress-filter-hold-direction` (2026-11-02) | UNDERPOWERED | High VIX is not bearish next day for NQ/ES/gold (wrong sign both halves). |

### b4. Positioning and flows

| Ledger id | Verdict | One-line result |
|---|---|---|
| `positioning-into-release-direction` (2026-10-22) | VALIDATED (needs held-out confirmation) | Release days: +0.064 ATR against a crowded leveraged-fund book [+0.019, +0.111], 6/6 pairs, survives a 40d trend control; ~3–4 EURUSD pips. |
| `cot-crowding-p5` (2026-10-24) | VALIDATED | State D (crowded with trend, pullback, crowd leaving) → trend resumes over 4 weeks, +0.269 [+0.086, +0.392] on 22 holdout (non-G10-core) markets. |
| `cot-positioning-factor` (2026-08-22) | NULL | Spec share of OI → forward returns: rank-IC −0.032, p 0.094. |
| `cot-crowding-p6`, `-p8`, `-p9`, `-p10`, `-a1..a4`, `-va1/va2`, `-s0-adv` | NULL | Other crowding states, COT as features or filters on the trend system. Many siblings UNDERPOWERED. |
| `crowded-bond-short-fomc`, `squeeze-fuel` | NULL | Crowded shorts were paid, not squeezed; retail ~60% long every day. |
| `gex-range-es` (VALIDATED), `gex-range` (UNDERPOWERED) | range only | Short gamma → wider next day; "never direction". `gamma-regime-trades`, `-fx` NULL. |
| `oi-max-pain`, `swing-walk-*`, `expiry-pull-build` | NULL | No pin or drift toward OI anchors. |
| `month-end-rebalance` | NULL | Equity rebalancing sell-off after strong months. |
| `skew-fade` | NULL | Fading against CVOL skew at lines. |
| `orderflow-lead-aggressor`, `footprint-absorption` | NULL | 6E/6J aggressor imbalance does not lead. |

### b5. Day type (the "range" leg of the bias)

| Ledger id | Verdict | One-line result |
|---|---|---|
| `day-type-expansion-fx` / `-gold` (2026-11-15) | NULL | Pre-open expansion score adds no Brier over σ-only (+2% ruled out). `-idx` UNDERPOWERED. |
| Range inputs | VALIDATED | `iv-forecast`, `vix-inversion`, `vol-curve-front`, `iv-over-rv-wider`, `breadth-all-down`, `surprise-size`, `event-impact-map`, `extreme-in-probability`, `intraday-range`, `forecast-miss-month-end-fx`. |

---

## (c) Ideas in the theory that were never tested

Ordered by relevance to a 24h–few-day bias. "Never tested" means no ledger id, no register row and no results file
found.

### c1. Multi-timeframe market structure and alignment (highest gap)

- **No lesson exists.** Theory Lab teaches neither swing structure (HH/HL, LH/LL, break of structure) nor top-down
  timeframe alignment. The macro proposal names it only as a later execution layer ("HTF structure", §B) and as H7
  ("Slow price-trend regime as the higher-timeframe bias"; "The single-instrument long/flat has not been tested").
- **Never tested: an explicit "all timeframes agree" state (W1/D1/H4, optionally H1) as a sparse condition on
  24h–5-day direction**, scored against B0 with the direction-bar MDEs. What exists is adjacent, not this:
  - `bias-learner-fx` fed 1h/4h/D1/W1 slopes as **linear, pooled** inputs. Its secondary GBM (depth 2) could pick up
    two-way interactions, but it is descriptive only (`analysis/output/bias-learner/RESULTS.md`), and full W1+D1+H4
    agreement as a gated state was never scored.
  - `HTF_TREND_RESULTS.md` measured H1/H4 state only **at vol-line touches**, and the effect was reversed.
  - VuManChu MTF work is 1m–1h oscillators, not price structure at the daily horizon.
  - `max-bias-reverse` shows Max's side ≈ the 4h trend, but this is 21 days of exploratory description.
- **Never tested: swing-structure state (last confirmed swing high/low on D1/H4, break of structure) as a direction
  input.** The pivot-lookahead trap is documented (`walk-forward-purged-cv.html`; `motif-regime-lookahead` cost PF
  1.315 → 1.198). Any test must confirm swings only once they are knowable.
- **Never tested: structure × macro agreement.** For example, the 4h/daily structure agreeing with the USD call. The
  `macro-h4-blend` 22-day exploratory pass found the two agree 48% of the time, and the forward `bias-scoreboard`
  (Amendment A2) will record it, but no historical test exists.
- **Never tested: `travelRead.js`** (position in the 3-month range plus efficiency ratio vs random walk). Its header
  says "Nothing here is backtested."

### c2. HMM state alignment

- **5m/1m HMM agreeing with the 1h HMM (RegimeV2 "1h regime alignment", V4 G4/X7, V7 4× HTF gate):** live as a bot gate,
  never honestly tested. The replay is ADX-lookahead contaminated (`MD files/BACKTEST_INDEX.md`). `MD files/MARKET_DESK_PROPOSAL.md`
  even specifies a "5m v2 + 1h agree/disagree marker" chip.
- **Daily HMM × hourly HMM state agreement:** `js/hmmHourly.js` has logged a point-in-time hourly QUIET/ACTIVE state
  since late October 2026, plus what each hour did. That is a forward record only, never analysed. Both models are
  variance-split, so any alignment test must use a direction-bearing state (the `hmm5m-v2` BULL/BEAR/RANGE/CHOP
  emissions on trendZ/volZ/adxZ), not `hmm.js`.
- **HMM state as a conditioner, not a direction call:** the lesson's own use ("which strategy family has a right to
  work"; trending vs choppy persistence) has no test. For example, does `bias-learner` or a trend rule do better in
  the HMM TREND state? `gr-hmm-trend-direction` tested only the unconditional single-timeframe next-day sign.
- **Spell length vs a fixed transition matrix:** the HMM lesson's DESK box notes stock-bond spells have a "longer tail
  than a fixed transition matrix produces". That is a duration-dependence question, never tested.
- **`regime_classifier_mtf.py`:** a 5-timeframe HMM never evaluated for anything, and lookahead by construction
  (full-sample scaler, `predict` = Viterbi).

### c3. Regime and persistence tools the lessons describe but nothing tests

- **CUSUM / BOCPD alarms**: `change-point-detection.html` says "There is no CUSUM on this desk"; BOCPD is used as a
  RegimeV2 exit, but "the desk's evidence ledger holds no test of what followed those alarms". The lesson gives a
  full design.
- **Markov-switching (Kim) filter, clustering-based regimes**: "not built or tested anywhere in this repo"
  (`regime-switching-state-space.html`, `clustering-market-structure.html`).
- **Hurst/VR as a strategy selector** (trend-follow vs fade by regime): only the entry-bias feature drop (not a
  ledger id) and the `hurst-bench.html` A/B page exist.
- **Real-time output gap → rates/FX** (`trend-cycle-filters.html`: "untested here", design given).

### c4. Macro and flow ideas from the lessons with no test

- **Taylor-rule gap as an FX signal** (`taylor-rule.html`: "has not been tested here"; design given, 1999–2026).
- **QE/QT → yields, mirrored** (`qe-qt-balance-sheet.html`: "an open item").
- **Real-yield trend and VIX-curve tone as direction reads**: both `tier: 'untested'` in the Global Read registry
  (`js/globalReadCore.js`).
- **Month-end FX hedge-rebalancing sign rule** (`fx-fixings-wm-reuters.html`): no FX-direction ledger entry found.
  `month-end-rebalance` is equities; `residual-pca-monthend` is residual reversion; `forecast-miss-month-end-fx` is range.
- **Risk reversal as a positioning/direction read** (`fx-options-quoting-rr-bf.html`): only `skew-fade` at lines (NULL).
- **Event-vol over/under-pricing** (`event-trading-playbook.html`: "has not been tested").
- **"The leader leads the decline"** (`investor-mood-forced-selling.html`) and **bubble-top timing**
  (`herding-narratives-bubbles.html`): both "Not tested here".
- **OI walls as range fences** (`open-interest-walls-max-pain.html`: "queued").
- **Equities lead real yields (H9)** and **information-flow hierarchy by shock origin (H10)**
  (`plans/MACRO_DIRECTION_RESEARCH_PROPOSAL.md` §D): Granger-found, never pre-registered.
- **Shock-type decomposition** of yield moves (H4) and **post-decision drift for non-Fed central banks** (H3):
  proposed, not run.

### c5. Desk-design ideas not yet run

- **The three-call bias card** (`plans/DESK_MORNING_BIAS_CARD.md`): proposal, "nothing built".
- **One USD call vs pair calls** (daily-bias agenda Q3): needs the forward desk record (~60 days).
- **`bias-scoreboard`, `direction-score-pilot`, `trade-plan-shadow`, `desk-analyst-pipeline`**: registered or running
  forward records (`plans/RESEARCH_REGISTER.md`). No verdicts yet.

---

## (d) Data the repo holds that these frameworks need

From `.claude/skills/data-rules/references/sources.md` and `plans/MARKET_STATE_ENGINE_PLAN.md` §0b unless noted.

| Need | Store | Coverage and caveats |
|---|---|---|
| Multi-timeframe price (H1/H4/D1/W1 structure, HMM features) | Research M1 `VolRangeForecaster/data/m1/{pair}_m1.parquet` (FX + gold); index M1/H1/H4/D1 `portfolioBacktest/cache/`; bid/ask M1 `data/m1_bidask/` (34 instruments, 2016-10 → 2026-10-19) | M1 ~2006 → 2026-08-21 for FX/gold. **Not present in this cloud session** (`ls` returned empty); it lives on the laptop/R2. D1 for σ must be NY-close built from M1, never `*_d1.parquet`. Lockbox: nothing after 2026-08-21 is scored (`forge/LOCKBOX_PROTOCOL.md`). |
| Daily HMM / Global Read inputs | live OANDA D1 (`fetchD1Aligned`), `/api/ohlc-range` | As used in `scripts/global-read-untested-direction/`. |
| Hourly HMM state history | `js/hmmHourly.js` store (45-day rolling log, filtered states + hour direction) | Forward only from late October 2026. |
| 5m/1h HMM V2 regimes | `/api/hmm5m-v2`, `/api/hmm1h-v2` (`server.js` `state.hmm1hV2Regimes`, "for HTF alignment") | Live only; no point-in-time archive found. Regime bot KV logs "are empty on the server now" (`js/hmmHourly.js` header). |
| Rates, credit, vol, liquidity | KV `fredhistory_series_*`, R2 `archive/series/fred/`; ALFRED vintages via `scripts/fetch_fred_vintages.py`; committed `analysis/output/cog_yield_dir/fred/` (BAA10Y, AAA10Y, DFF …) | HY OAS only ~3 years on FRED; BAA10Y from 1986 is the long stand-in. |
| Point-in-time features | `features/*.parquet` (contract `plans/FEATURE_MANIFEST.json`, 100 entries, 79 built), incl. `rate3m_*` for carry | Laptop only (empty here). |
| COT positioning | R2 `archive/tables/cot/` (36 markets); committed `analysis/output/cot-crowding-programme/cot_weekly.csv` | Weekly, Tuesday as-of, Friday release. |
| Implied vol, options | CME settlement IV `oi_research_book/data/iv_daily_*` (2020-09 →, 7 products); Cboe indices `analysis/surfaces/cboe/` (VIX term, VXN, GVZ, VVIX, SKEW …); IV term archive `analysis/output/iv_term/iv_term_daily.csv` (2026-07 →); Cboe full chains R2 `cboe_raw/` (2026-10-19 →); NQ OI `OI Data/NAS100_USD.csv` | No FX risk-reversal history; EVZ withdrawn. |
| Calendar, surprises | `calendar_events.csv` (2014 → 2026-07-02), `calendar_events_nasdaq.csv` (2026-07-03 →), `forge/ff_calendar.py` (2007 → 2025-04) | Different event names across the seam; non-US actuals thin before mid-2025. |
| Macro regime labels | `js/regimeCore.js`, `/api/regime`, `analysis/output/regime.json` (monthly since 1971) | One-month publication lag built in. |
| Forward direction records | `/api/direction-ledger` (job `directionLedger`), desk runs since 2026-11-03, Max Cole signals since 2026-10-07 (Signal Copier) | Short; forward-only. |
| Bias learner readings | `scripts/h4-trend-hold/backtest.py` 13-instrument set; readings table in `forge/BIAS_LEARNER_PREREG.md` §3.3 | Reusable as the base for an MTF-alignment test (same B0, folds, gates). |

---

## Notes for whoever designs the next test

- Use the direction bar: score against B0/B1 with the `direction-bar` MDEs (6pp at 1 day for a 10%-active cell), never 50%.
- Swing points and HMM labels must be filtered/knowable-at-time (`hidden-markov-models.html` warning;
  `motif-regime-lookahead`).
- For HMM alignment, use a direction-bearing state (`hmm5m-v2` BULL/BEAR), because `hmm.js` RANGE means "QUIET"
  (`hmm.js` header; `js/travelRead.js` USDCHF 2026-09-29 example).
- Pool instruments with effective N (7 USD pairs ≈ 2.8 independent forecasts, `direction-bar`), and date-block bootstrap.
- Check for overlap with banked nulls before registering. The closest are `bias-learner-fx` (linear MTF slopes),
  `gr-hmm-trend-direction` (single-timeframe HMM), `exit-on-fixed-entries` (4h slope entry), `trend-following-fx`, and
  `vmc-nq-cipher-interaction` (oscillator HTF agreement).
