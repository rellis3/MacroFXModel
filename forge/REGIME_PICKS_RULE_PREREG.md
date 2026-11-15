# regime-picks-rule — Does a regime known before the London open (ATR percentile; filtered HMM vol state; a named-state σ-chain) pick which simple intraday rule (FADE at the p50 line, FOLLOW the first move, BREAK the Asia range) pays that day, so a regime-switched book beats every rule alone, an unconditional picker and flat?

**Pre-registered 2026-11-15, before any outcome was computed.** No rule outcome (trade R) has been computed for this
study. The power numbers in §5 are analytic approximations from assumed SDs plus the binding planted-control rule (G6);
no market data was read to write this document beyond file schemas and coverage.

| | |
|---|---|
| ID / ledger id | `regime-picks-rule`; one ledger entry per regime family: `regime-picks-rule-atr`, `regime-picks-rule-hmm`, `regime-picks-rule-chain` |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` |
| Register row | `plans/RESEARCH_REGISTER.md` → `regime-picks-rule` (CLAIMED 2026-11-15; the register is maintained by the parent session) |
| Data | 13 instruments (the `scripts/h4-trend-hold/backtest.py` `SYM` set): EURUSD, GBPUSD, USDJPY, USDCAD, AUDUSD, NZDUSD, USDCHF, EURJPY, GBPJPY, GOLD, NAS100 (`nq`), SPX500 (`spx`), US30 (`dow`). Prices: **OANDA bid/ask M1** `data/m1_bidask/<key>_m1.parquet` (mid = research mid; bid_* / ask_* for every fill). Lines and σ: `analysis/output/forecast_history/<INST>.csv` (`NQ`, `SPX500`, `DOW` for the indices), columns `open`, `pit_sig_used`, `pit_oh_p50/p75`, `pit_ol_p50/p75`, `oos`. Read window 2016-10 → **2026-08-21 lockbox**; the runner asserts no bar after 2026-08-21 21:59 London is read and no scored session is after 2026-08-21. Never R2 (all `R2_*` env vars unset) |
| Seed | `20261115` (every script, bootstrap, shuffle, plant and HMM start) |
| Uncertainty | moving-block bootstrap over **dates** (all instruments of a date move together), block 21 sessions, B = 2000; SE floor = SD of 200 regime-label block shuffles (§3.7) |
| Scripts / outputs | `scripts/regime-picks-rule/run.py` (`--selftest`, real run) → `analysis/output/regime-picks-rule/` (`RESULTS.md`, `results.json`, `trades.parquet`, one evidence pack per scored cell under `<cell>/evidence/`) |
| Harness | own Python script (`python -X utf8 -I`): `analysis/study.mjs` / `runStudy.mjs` have no bid/ask fill engine or HMM path. CPU capped: `OMP_NUM_THREADS=2`, `MKL_NUM_THREADS=2`, ≤ 2 workers |

## 1. The claim (required)

`plans/BIAS_RESEARCH_SYNTHESIS.md` **P3** ("Regime decides the rule", C.OG L3): *"the ATR-percentile regime, and an HMM
vol state vs an explicit chain, picks fade / follow / break. Score each per regime."* The desk idea behind it (C.OG's
lesson 3, and the general "trend days vs range days" habit): on a quiet, low-volatility regime the day's range is
contained, so fading the expected-range line pays; on a high-volatility regime moves extend, so following the first
move or trading the break of the overnight (Asia) range pays. If that is true, a book that switches rule by the regime
read before 07:00 London should beat each rule run every day, beat a picker that ignores the regime, and beat flat.

**Mechanism.** Volatility clusters (that part is proven here: the σ forecasts and the HMM both separate variance). The
claim needs one more step: that the **sign of the payoff** of a fade versus a break flips with the regime, not just its
size. With equal-risk sizing (every R is 1 unit of risk), a larger range alone changes nothing; the rule must earn more
in R in its regime.

**Edge source (lesson #4).** Forecasting skill on the day type (contained vs extending) beyond what the shipped σ
forecast already prices into the line spacing. No premium is claimed. Who is on the other side: liquidity providers at
the range edges on fade days; late breakout traders on break days.

## 2. Why it is not already settled (required)

| Nearest entry | Verdict | Why this is a different question |
|---|---|---|
| `iv-regime-fade-follow` (`forge/IV_REGIME_FADE_FOLLOW_PREREG.md`) | NULL | The **IV** regime (level, VRP, term stress) as a skip-filter on **Vote Atlas's** fade/follow choice (FX, 20,138 trades). Here: realised-vol regimes (ATR percentile, HMM, named chain), three fixed rules, a **choice between rules** (not a skip), 13 instruments incl. gold and indices, real bid/ask fills |
| `live-range-book`, Fade/Continue Book (`forge/FADE_CONTINUE_BOOK_SPEC.md`, memory `project_range_book_eurusd`) | NULL | Every pass of every line, cells by session / range used / pace; "HMM/sigma/yesterday-range regimes add nothing" to the **reach odds**. That book never formed a rule **choice** per day nor asked whether the regime flips the sign of fade vs break payoff. **Screen applied:** the p50 fade here is one of the book's rows (first p50 touch after 07:00, fade target = the line behind, stop = the next line out) and is not re-scored alone as a claim; it appears only as an arm |
| `range-edge-limit-fade` (`forge/RANGE_EDGE_LIMIT_FADE_PREREG.md`) | NULL | Asia-edge **fade** with resting limits on bid/ask: −0.109R. Here the Asia range is traded the other way (BREAK), and only as one arm of a regime choice. Its fill conventions (limit fills only when the far quote trades **through**; stops at the bar open on gaps; adverse-first same-bar rule) are reused |
| `opening-range-break` (`MD files/TECHNICAL_RANGE_TESTS.md#T4`) | NULL | First-hour range break, descriptive follow-through; no regime, no costs. FOLLOW here uses a σ-scaled first move from 07:00, with costs, chosen by regime |
| `asia-range-london` (T7) / `pre-release-ranging` C | CONTEXT / NULL | Asia = [00:00, 07:00) London (same clock here). Descriptive reach/break rates, not a traded break and not regime-chosen |
| `overnight-vol-regime-nq/-gold` (`forge/OVERNIGHT_VOL_REGIME_PREREG.md`) | UNDERPOWERED | RV20 percentile vs its own past year, t−1 (the same regime construction as (a) here) on the **overnight hold**: risk-adjusted return flat across vol regimes. Different trades (intraday rules, not a hold) and a rule-choice question |
| `gr-hmm-trend-direction`, memory `project_hmm_variance_not_direction` | NULL | HMM states separate variance, not direction. That is why the HMM here is used **only as a volatility state** (states ranked by variance), never as a direction call |
| `mtf-structure` (in flight, same branch) | — | Direction from multi-timeframe states. Its **named-state σ-chain** definition is reused verbatim as regime (c) here (lesson #5 benchmark) |
| `line-touch-*` (`line-touch-reach` VALIDATED reach odds; `line-touch-limit-unseen` NULL net) | — | Line reach is calibrated (the lines are used as the FADE level because they are the shipped, calibrated range); touch trades lose net. Not regime-chosen |

No banked null is re-run: no entry let a pre-open realised-vol regime **choose between** fade, follow and break, and no
entry compared a filtered HMM vol state with an ATR percentile and a named chain on the same trades.

Method lessons applied (`education/RESEARCH_METHOD_LESSONS.md`): **#1** positive control (synthetic selftest + planted
control on the real rows, G6); **#5** named/linear baseline (the HMM must beat the named σ-chain, G5, and every regime
book must beat the regime-free picker, C2); **#6** HMM K chosen on held-out likelihood, 4 starts, yearly refit, dwell
rates reported; **#14** filtered labels only, smoothed labels used only as the leak canary; **#27** trade management is
not an edge (the three rules' stops/targets are fixed here and never varied; their always-on R is reported as the
reference each regime-chosen R is read against).

## 3. Definitions, fixed in advance (required)

### 3.1 Sessions, clock, prices

- **Session** d = London calendar date, weekdays (data-rules item 1). M1 `time` (naive UTC, bar start) → Europe/London.
- **Session open O** = the forecast-history `open` column (the anchor the shipped lines were drawn from). The runner
  also computes the first mid open at/after 00:00 London and reports the mismatch share (descriptive).
- **σ_px** = `pit_sig_used` / 100 × O (the shipped daily σ in price units, known at the open).
- **Decision time** 07:00 London. Rules may enter on bars starting 07:00–15:59 London; every open position is closed
  at the **close of the last bar starting before 21:55 London** (bid for longs, ask for shorts). No position crosses
  22:00.
- **Eligible session**: forecast-history row present with `oos = 1` (scoring) or `oos = 0` (training only, §3.5),
  `pit_*` lines finite, ≥ 600 M1 bars in 00:00–21:59, ≥ 120 bars in [00:00, 07:00), a bar starting in 07:00–07:04,
  and all three regime labels defined. Ineligible sessions are counted by reason.
- **Fills** (all from bid/ask; no commission; OANDA spread-only): a buy pays the ask, a sell receives the bid.
  - Limit sell at L fills on the first bar with `bid_h > L`, at L; limit buy at L fills on `ask_l < L`, at L.
  - Stop (exit or entry) buy at S triggers when `ask_h ≥ S`, fills at `max(S, ask_o)`; sell at S triggers when
    `bid_l ≤ S`, fills at `min(S, bid_o)`.
  - **Same-bar rule (adverse first)**: on the entry bar only the stop is checked; on a later bar where both stop and
    target trigger, the stop is taken.
- **Net R** = signed P&L (fill to fill) ÷ the planned risk distance (planned entry level to stop level). Spread is
  inside every fill. A rule that does not trade on a session scores **0 R** for that session (sizing is per
  instrument-session, so flat days count as zero, not as missing).

### 3.2 The three rules (one trade per rule per instrument-session at most)

| Rule | Entry | Stop (1R) | Target | Source definitions reused |
|---|---|---|---|---|
| **FADE** (mean-revert at the shipped p50 line) | Only if the last mid close before 07:00 lies strictly between L50 = O(1 − `pit_ol_p50`/100) and U50 = O(1 + `pit_oh_p50`/100). Resting **sell limit at U50** and **buy limit at L50**, live 07:00–15:59; the first fill cancels the other; both filled on the same bar → no trade (counted) | the next line out: U75 = O(1 + `pit_oh_p75`/100) for a short (buy stop), L75 for a long | the line behind = **O** (the session open) | Fade/Continue Book (`forge/FADE_CONTINUE_BOOK_SPEC.md`: fade target = back level, stop = next line out); fill rules from `range-edge-limit-fade` |
| **FOLLOW** (the first move after the open) | P0 = mid open of the first bar starting 07:00–07:04. The first bar (07:00–11:59) whose mid high ≥ P0 + 0.10 σ_px (up) or mid low ≤ P0 − 0.10 σ_px (down) sets the side; both on one bar → no trade. Market entry at the **next bar's open** (ask_o long, bid_o short) | 0.25 σ_px from the entry fill | none (time exit) | σ-scaled first move; neighbours `opening-range-break` (T4) and `round-break-follow` |
| **BREAK** (Asia high/low) | Asia range = mid high / low of bars in [00:00, 07:00) London (`asia-range-london` T7, `pre-release-ranging` clock). **Buy stop at A_hi**, **sell stop at A_lo**, live 07:00–15:59, OCO; both on one bar → no trade. Skipped (counted) if (A_hi − A_lo)/2 < 0.05 σ_px (spread feasibility) | the Asia midpoint A_mid | none (time exit) | Asia ladder of `range-edge-limit-fade` (traded through, not faded) |

R for BREAK = |planned level − A_mid| (= half the Asia range); for FADE = |U75 − U50| (or |L50 − L75|); for FOLLOW =
0.25 σ_px. These rules are fixed; no stop, target or window variant is run (lesson #27).

### 3.3 Regimes (all known before 07:00 London on d)

Daily bars: **NY-close days** built from the mid M1 (17:00 New York; label = NY date of t_NY + 7 h; weekend labels
dropped; ≥ 60 M1 bars), data-rules item 2. The value used on session d is the one from the **last daily bar completed
at or before 07:00 London on d**.

- **(a) ATR percentile** `atr`: ATR14 (Wilder-free simple mean of the true range over 14 bars, using the previous
  close) ÷ close, percentile rank of today's value among the **previous 252** daily values (strictly earlier; min 200).
  Labels: `LOW` (< 1/3), `MID`, `HIGH` (> 2/3).
- **(b) Filtered HMM vol state** `hmm`: per instrument and calendar year Y (2018 … 2026), a 1-D `hmmlearn.GaussianHMM`
  (`covariance_type='diag'`, `n_iter=200`, `tol=1e-4`, `min_covar=1e-3`) on daily log returns ÷ their training-window
  SD. Training window = daily bars completed before 00:00 UTC 1 Jan Y, from the first bar of the file (2016-10).
  **K ∈ {2, 3}**: fit each K on the first 80% of the window, 4 starts (`random_state` 20261115 + s, s = 0..3, best
  training log-likelihood kept), choose the K with the higher log-likelihood on the last 20%; refit that K on the whole
  window with 4 starts. States are **ranked by variance** and labelled `LOW`, (`MID`), `HIGH`. Labels are the argmax of
  the **filtered** probability (forward recursion with the fold's parameters, run from the window start through year
  Y; uses returns ≤ t only). The smoothed (forward-backward) label is computed only for the leak canary.
- **(c) Named-state σ-chain** `chain` (the `mtf-structure` §3.3 definition, D1 only, used as a regime not as a
  direction): state = (sign of the sum of the last 20 daily log returns: `UP` / `DN`, zero → `UP`) × (20-bar return SD
  above / at-or-below its median over the previous 250 values, min 100: `HI` / `LO`) → `UP-HI`, `UP-LO`, `DN-HI`,
  `DN-LO`.

### 3.4 The books

- **Always-k** (k ∈ FADE, FOLLOW, BREAK): the rule's net R on every eligible session.
- **Flat**: 0.
- **Regime picker** for family F: refit at the test start (2020-08-24) and at the first eligible session of every
  calendar quarter after it. Training rows = every eligible instrument-session (13 pooled) from **2018-01-02** to the
  last session before the refit date. For each label r with ≥ 100 training rows: m_k(r) = mean net R per
  instrument-session of rule k; pick argmax_k m_k(r) **if** that maximum > 0, else FLAT. A label with < 100 training
  rows → FLAT. The pick is applied to every test session until the next refit.
- **Unconditional picker** book_0: the same rule with one label for every row (picks the best rule overall if its
  mean > 0, else FLAT).
- **book_F** net R on (i, d) = R of the picked rule on (i, d) (0 if FLAT or the rule did not trade).

### 3.5 Sample and halves

Scored test sessions: **2020-08-24 → 2026-08-21** (forecast-history `oos = 1` rows: the shipped lines' walk-forward
specs, no lookahead in the line widths). Training rows for the pickers also include 2018-01-02 → 2020-08-21 `oos = 0`
(burn-in) rows: their line widths were fitted through 2020-08-20, so they are **never scored**; they only inform which
rule is picked in the test period (declared, not hidden). Halves: **H1 = 2020-08-24 → 2023-08-18**,
**H2 = 2023-08-21 → 2026-08-21**.

### 3.6 Scored cells

| Cell | Statistic (per instrument-session, 13 pooled, test sessions) | Bar |
|---|---|---|
| `C1-atr`, `C1-hmm`, `C1-chain` | mean net R of book_F (vs flat = 0) | **+0.04 R** |
| `C2-atr`, `C2-hmm`, `C2-chain` | mean of (book_F − book_0): what the regime adds over the regime-free picker | **+0.04 R** |

Six scored cells. Reported beside them, descriptive: book_F − always-k for each k (the "vs each rule alone"
comparisons, with CIs), each always-k mean, the regime × rule net-R table on the test period (BH q = 0.10 over its
cells, with the chance baseline), pick history, HMM dwell/flip rates and chosen K per fold, by instrument (BH), by
year, by asset group, by half, trade counts and skips by reason.

**Bar.** +0.04 R per instrument-session: with the rules trading on roughly half to most sessions, ≈ +0.05–0.08 R per
trade, the desk's useful-effect bar (`exit-on-fixed-entries`, `bias-learner`), and about one round-trip spread on the
wider instruments.

### 3.7 Uncertainty and p-values

- Per test date: Σ over instruments of the cell's per-row value and the row count; moving-block bootstrap of dates,
  block 21, B = 2000, seed 20261115 → 95% percentile CI of the ratio of sums.
- **Regime-label block shuffle (noise threshold)**: within each instrument, permute whole 21-session blocks of that
  instrument's label series (train and test labels together; outcomes stay in place), re-run the picker end to end,
  200 shuffles → the real value's percentile and the shuffle SD.
- **p** = two-sided normal, z = est / SE, **SE = max(bootstrap SE, shuffle SD)** (approximation, stated).

### 3.8 Controls

- **Selftest** (`run.py --selftest`, synthetic only, must pass before the real run reads any outcome): (i) a synthetic
  13-instrument panel with Markov regimes and three rule payoffs where the matched rule earns +0.15 R in its regime
  → the full picker pipeline recovers it (C2 CI lower > 0); (ii) the same panel with no interaction → C2 not flagged
  (|z| < 2.64 on the registered draw, and ≤ 3 of 20 null draws flagged); (iii) on a synthetic 2-state Gaussian HMM
  series: the forward filter equals hmmlearn's posterior at the last observation; the filtered label at t is unchanged
  when returns after t are perturbed; and a rule whose payoff depends on the **same day's** state is picked better by
  **smoothed** labels than by filtered ones (the leak is visible: smoothed book − filtered book > 0 with CI lower > 0);
  (iv) the fill engine on hand-made M1 paths gives the expected R for a FADE target, a FADE stop, a gap-through stop,
  a FOLLOW time exit and a BREAK OCO.
- **Planted control on the real rows, per scored cell (G6)**: on the real rule outcomes, map regimes to rules
  (`atr`: LOW → FADE, MID → FOLLOW, HIGH → BREAK; `hmm`: LOW → FADE, MID → FOLLOW, HIGH → BREAK; `chain`: `*-LO` →
  FADE, `*-HI` → BREAK) and, on the sessions the mapped rule traded in its regime, add δ_r per trade so that the mapped
  rule's mean per instrument-session in that regime (full sample) exceeds the best alternative (incl. flat) by the bar.
  Re-run the whole picker; 40 plants; detection = the cell's z ≥ 2.64 (Holm first step over 6) with CI lower > 0.
  **POWERED** when detection ≥ 80%. (For C1 the same plants are scored on C1.)
- **Leak canaries** (must jump; never scored): `hmm` with **smoothed** labels; for every family, a **realised-day**
  label (the session's own HL ÷ σ tercile, known only at 22:00).
- **Evidence pack** (`scripts/evidence_pack/pack.py` `build_pack`) per scored cell on the test rows (cluster = 21-session
  date block): C1 rows: outcome = the book's net R (on flat sessions, the mean of the three rules' R that day, with
  side 0), side = 1 where the book traded, estimate = mean(side × outcome); C2 rows: outcome = book_F − book_0,
  side = 1 where the two picks differ, estimate = mean(side × outcome). `plant_fn` adds a bar-sized R to the
  regime-chosen rule (outcome += bar / share of side ≠ 0 rows, on side ≠ 0 rows); `leak_fn` = smoothed-label book
  (hmm) or the realised-day oracle (best of the three rules and flat that day). Its diagnosis label is reported; it
  does not change the verdict (the pack's placebo shuffles side within instrument, not the regime; the registered
  noise threshold is §3.7's label-block shuffle).

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Do the three always-on rules lose net? | **Yes**, all three negative net (line fades and Asia trades lost on bid/ask before) |
| b | C1: does any regime book make money (≥ +0.04 R per instrument-session)? | **Null**: mostly FLAT picks, a book near 0 |
| c | C2: does the regime add over the regime-free picker? | **Null** (σ forecasts already price vol clustering into the line spacing; the Fade/Continue Book found regimes add nothing to reach odds) |
| d | Does the HMM vol state beat the ATR percentile and the named chain? | **No**: HMM ≈ the ATR percentile (both read variance) |
| — | **THE GATE (per cell)**: G1 Holm p < 0.05 over the 6 scored cells; G2 estimate ≥ +0.04 R; G3 positive in both halves; G4 above the 97.5th percentile of the label-block shuffle; G5 (`C2-hmm` only) the HMM book beats the chain book: bootstrap CI of (book_hmm − book_chain) lower > 0; G6 POWERED. **Family VALIDATED** iff its C2 cell passes G1–G6 **and** its C1 point estimate > 0 (a regime that only chooses among losers is not a book) | |
| — | **THE MIRROR**: a C2 with CI upper < 0 (the regime picks the wrong rule out of sample) | reported as CONTEXT (wrong sign), never a pass |

**Cell word** (registered): PASS (G1–G6) → VALIDATED. Else, if POWERED and CI upper < bar: CI lower > 0 → CONTEXT
(small but real), otherwise NULL. Else UNDERPOWERED. **Family word** = the C2 word, demoted to CONTEXT if C2 passes but
C1 ≤ 0. C1 words are reported per cell (a C1 pass with a C2 fail means "a rule pays, regardless of regime": CONTEXT
for this question).

## 5. Power — what this design can and cannot find (required)

Analytic approximation (assumed, no outcome read): ~1,500 test dates × 13 instruments; per-row SD of a book's net R
≈ 0.8 R (trading ~60% of sessions at ~1 R SD per trade); cross-instrument correlation of daily outcomes ≈ 0.3 →
per-date mean SD ≈ 0.8 × √((1 + 12 × 0.3)/13) ≈ 0.48; design effect ≈ 1.2 → SE ≈ 0.48 × √(1.2/1,500) ≈ 0.014.
MDE (80% power, Holm first step α = 0.05/6, two-sided z 2.64) ≈ (2.64 + 0.84) × 0.014 ≈ **0.047 R** for C1, just
above the 0.04 bar. C2 differences are zero on every session where the two pickers agree, so their SE is smaller in
proportion to the share of disagreeing sessions; expected MDE ≈ 0.02–0.04 R.

| Cell | Planned n | SD (assumed) | Deff | MDE | Bar | Verdict by design |
|---|---|---|---|---|---|---|
| C1-* | ~1,500 dates × 13 | 0.8 R / row | ~1.2 | ~0.047 R | 0.04 R | borderline: **G6 decides** |
| C2-* | same | smaller (agreeing days = 0) | ~1.2 | ~0.02–0.04 R | 0.04 R | likely POWERED: **G6 decides** |

**Binding rule:** the planted control on the real rows (§3.8, G6) decides POWERED / UNDERPOWERED per cell; the
analytic numbers above are not used for the verdict. A cell whose plants are detected < 80% of the time is
UNDERPOWERED whatever its estimate.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells**: the 6 in §3.6. **Holm** at α = 0.05 over the 6 p-values.
- **Disaggregation cells** (regime × rule table, per instrument, per asset group, per year): **BH q = 0.10** with
  `chanceBaseline`; a survivor is a candidate for its own prereg, never a result.
- **Variants**: none. One rule definition each, one picker, one refit schedule, one bar. Nothing is tuned after the
  run; any change is a dated amendment (PRE-RESULTS before any outcome, POST-HOC after: demote/describe only).
- **Promotion bar**: anything live needs |t| ≥ 3 on the scored cell and a forward record.

## 7. What this does NOT test (required)

- **Direction.** No rule here forecasts the day's direction; FOLLOW and BREAK take the side the market gives.
- **Other rule shapes.** One fixed stop/target per rule. A null here says "these three rules, chosen by these regimes,
  do not pay", not that no fade or break of any shape can be regime-chosen. Exit variants are out of scope (lesson #27).
- **Per-instrument pickers.** The picker is pooled over 13 instruments; instrument-specific regime maps are described
  (BH) but not scored.
- **Implied-vol regimes** (`iv-regime-fade-follow` covered those), event days, positioning.
- **The lockbox** (sessions after 2026-08-21) and forward performance.
- **Sizing by regime** (risk is constant per trade here).

## 8. What each verdict changes (required)

- **VALIDATED** (a family): a "today's rule" line on the desk card (research-only until |t| ≥ 3 or a forward paper
  record), and a shadow logger beside the live bots; never a live bot input before that.
- **NULL**: the desk card's day-type line says "regime sets the size of the day, not which rule to trade"; the C.OG L3
  idea is recorded as tested on these three rules; the HMM vol state stays a variance read only.
- **UNDERPOWERED**: name the data that would make it testable (more instruments / years of honest lines) or close it as
  untestable at this resolution.
- **CONTEXT** (C1 passes, C2 does not): a rule pays regardless of regime; that rule gets its own prereg on fresh data.

## Amendments

(none)

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/regime-picks-rule/RESULTS.md`. Nothing above this line changes after the run.*
