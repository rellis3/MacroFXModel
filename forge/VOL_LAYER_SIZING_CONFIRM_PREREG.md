# vol-layer-sizing-confirm: does the sizing layer do its own job on unseen data?

**Pre-registered 2026-11-16, before any outcome was computed.** No sizing measure has been computed on the confirm window (2023-01-01 → 2026-08-20). §2 lists what other studies have already seen in that window.

| | |
|---|---|
| ID / ledger id | `vol-layer-sizing-confirm-a`, `-b`, `-c`, `-e` (four scored cells). `-d` is descriptive and gets no verdict. |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `vol-layer-sizing-confirm` |
| Data | `analysis/output/forecast_history/<SYM>.csv`: one row per London session (00:00–22:00, weekdays), 34 instruments (7 USD majors, 20 crosses, GOLD, DE30, DOW, NQ, SPX500, UK100, US2000). Fields used: `r_ocs`, `pit_sig_used` (primary σ), `live_sig_used` (sensitivity), `rv5`. **Score window:** sessions 2023-01-01 → 2026-08-20. The lockbox (2026-08-21 on) is untouched; the table ends on 2026-08-20. **Discovery (reproduction, controls, power only):** 2016-10-24 → 2022-12-30. Trailing inputs may read rows before a window starts; outcomes may not. |
| Seed | `20261116` (every script in this study) |
| Uncertainty | Stationary bootstrap, B = 2000, weights from `forecast_record.boot_weights`. Month-level cells: month keys, mean block 3 months. Day-level cells: session-date keys, mean block 20 sessions. Instruments are clustered by date (month), never treated as independent. |
| Scripts / outputs | `scripts/vol-layer-sizing-confirm/run.py` (`--mode discovery`, then `--mode confirm` once) → `analysis/output/vol-layer-sizing-confirm/{discovery,confirm}/`, `RESULTS.md`, `results.json` |
| Harness | Own script. It reuses the stage 3 code path (`scripts/vol-layer-deep/sizing_wide.py`: `scale`, `month_table`, `legs`, `book_parts`), which the harnesses don't cover. |

## 1. The claim

Stage 3 of the Vol-Layer research (`scripts/vol-layer-deep/sizing_wide.py`, `backtest-data/vol-layer/sizing-wide.json`, discovery 2016-10-24 → 2022-12-30) found four things about sizing a daily London-session hold:
- Sizing by the forecast σ steadies monthly risk on 34 of 34 instruments. The mean |monthly vol − 1| is 0.152 against 0.263 unscaled (−0.111 [−0.145, −0.083]).
- A plain trailing 20-session realised vol (RV20) does exactly as well (−0.001 [−0.008, +0.005]).
- σ sizing moves tail days from loud sessions into quiet ones. A level floor, size by √(σ² + 0.25 · trailing median σ²), cuts quiet-day 3-sd days (−0.29pp [−0.38, −0.19]). **The floor was added after looking at the data.** This is its first clean test.
- 1/σ² sizing is worse: less steady (+0.115 [+0.091, +0.140]) with more tail days.

The book findings were R² on the dollar factor 0.62 (shuffled 0.489) and an all-correlations-to-1 cap that does not move ES 1%.

**Why stage 4 changed.** C.OG Lesson 03 says to validate each layer by its own factor: for sizing and the book, how steady risk is and how much forecast value survives into positions. The owner approved scoring stage 4 that way. The overlay test on Rule A (`vol-layer-rule-a-confirm`) had Sharpe-change MDEs of 0.25–0.31, so it could not see a sizing effect.

**The claim:** on unseen 2023–26 data, with a fixed direction-free position, (a) σ sizing steadies monthly risk against unscaled; (b) RV20 is equivalent to σ within a stated margin; (c) the level floor cuts quiet-day tail days; (e) 1/σ² is less steady than 1/σ. (d), the book's dollar share and the all-to-1 cap, is described.

## 2. Why it is not already settled

**Nearest Evidence Book entries, and what each already saw in 2023–26:**

| Entry | What it measured | Overlap with this study |
|---|---|---|
| `vol-target` (VALIDATED 2026-10-05) | Steadiness of σ-sized holds at portfolio level: SD of monthly book vol. LONG on 6 indices + gold; TREND on 28 instruments. Pooled 2016-08 → 2026-08. | **Large for cell (a).** That pooled sample includes 2023–26, on most of these instruments. Only the full sample and 2025-09 on were reported, but the direction of (a) on this window is not unknown. RV20 was not an arm there. |
| `vol-layer-rule-a-confirm-z1` (NULL 2026-11-15) | A σ level floor max(σ, Q₀.₂) on the stop of Rule A trades. ΔSharpe −0.025 [−0.13, +0.09]. | **Same window, different question.** It used 11 instruments and Rule A trades only (rich days, entries 00:00–10:00, 0.27σ risk). The outcome was trade P&L. The floor had a different form. |
| `vol-managed-mm` (UNDERPOWERED 2026-11-02) | 1/σ² weight on NQ, ES and gold, 2004–2026: Sharpe and drawdown. | The window includes 2023–26 for three of the instruments. The outcome was P&L, not steadiness. |
| `iv-sizing-filter` (NULL) | IV vs RV sizing on bot trades; market-level steadiness 5/7 with IV. | Different σ arms and trade sets. |
| Stage 3 (not banked) | Everything in §1. | Discovery only. Nothing after 2022-12-30 was loaded. |

**The 2023–26 window has been used once by this programme.** `vol-layer-rule-a-confirm` used it, only for Rule A's overlay trades, including Z1 (the level floor on Rule A trades). That is a different question from this one:
- That test asked whether a trade system's daily Sharpe rises. Its noise is the entry's P&L, so a risk effect had to be big to show (MDE 0.25–0.31 Sharpe).
- This test asks whether sizing does its own job. The outcome is realised risk per unit of exposure, not P&L. It is measured on every session of all 34 instruments, at a fixed direction-free position.
- **The overlap, said plainly.** The same price paths underlie both: 11 of the 34 instruments, the same calendar window. Whoever designed this had already seen the Z1 NULL. The `vol-target` result covers (a) on most of this window. So (a) is a near-replication with an expected pass. Cells (b), (c) and (e) have no steadiness or tail-day outcome computed on 2023–26 by anyone, as far as the Evidence Book, the register and `forge/` show.

**Two stage 3 shortcuts are fixed here, before any confirm outcome is seen:**
- **σ.** Stage 3 used `live_sig_used`. That is fold 5's spec (trained through 2025-08-19) applied to every day, so it is in-sample for discovery and for 2023-01 → 2025-08-19. This study uses `pit_sig_used`, which is out-of-sample (`oos = 1`) on the whole confirm window. `live` is a sensitivity only.
- **Quiet days.** Stage 3 cut σ terciles over the full window within each instrument, which is a look-ahead label (method lesson 14). Here a quiet day is σ below the 1/3 quantile of the same instrument's σ over the previous 250 sessions (minimum 120). A loud day is σ above the 2/3 quantile.

On discovery, with the fixed σ and labels, stage 3's numbers move little. F − U is −0.109 (pit) against −0.111 (live). The floor's quiet-day cut is −0.29pp (pit, full window); in 44-month sub-windows it is −0.23 to −0.44pp. These are discovery numbers, used here only for design.

**Method lessons applied** (`education/RESEARCH_METHOD_LESSONS.md`): #1 positive control before the run (§3); #9 SE from the time series of the per-month statistic; #10 a latent-proxy statistic on two specs (RV10/RV40 beside RV20); #14 causal regime labels; #26 the selection objective is a risk measure.

## 3. Definitions, fixed in advance

**The position.** Always long, one unit, held from the London open to 22:00 every session: z = r_ocs ÷ size. Every scored measure is sign-free. Monthly SD ignores sign, and |z| > 3 ignores sign. So this measures risk, not P&L. A random sign per session (seed 20261116) is rerun as a check. The 1st-percentile loss depends on sign and is descriptive only.

**Sizings** (size = the divisor; every input known before the session opens):

| Code | Size | Neighbours (plateau) | +1 lag |
|---|---|---|---|
| U | 1 (constant notional) | — | — |
| F | σ = `pit_sig_used` | σ^0.75, σ^1.25 | σ from the previous session |
| T20 | RV20 = √(mean r_ocs² over the 20 sessions before t), min 15 | RV10, RV40 (descriptive) | sessions before t−1 |
| FA | √(σ² + 0.25 · M), M = median σ² over the 250 sessions before t (min 120) | a = 0.10, 0.50 | σ and M one session late |
| MM | σ² | σ^1.75, σ^2.25 | σ one session late |

**Equal average risk.** Each sizing's z series is divided by its own SD per instrument over the window being scored, as in stage 3. This is a constant. It changes no shape statistic, but it is not a tradeable scale. Sensitivity: divide by the same instrument's SD over discovery instead, frozen and ex ante.

**Outcomes.**
- **Monthly risk deviation:** for each instrument-month with ≥ 10 sessions, |SD of z in the month − 1|. Cell value = mean over instrument-months. Difference A − B is paired by instrument-month. Bootstrap over months.
- **Tail days:** the share of sessions with |z| > 3, in %, on quiet days (as defined in §2). Difference A − B is paired by session. Bootstrap over dates.
- **ES 1% and 1st percentile** of z, pooled: descriptive.

**Book (cell d, descriptive).** The stage 3 14-leg book, built with `pit` σ: 7 USD majors signed short-USD, gold and 6 indices long, each leg in σ units, equal weight.
- D1: R² of the book on the dollar factor (mean of the 7 USD legs), rolling 60 sessions before t. The benchmark is legs shuffled independently (300 shuffles). Shown by year 2023–26 and by dollar-vol tercile (trailing, causal).
- D2: the all-correlations-to-1 cap on the book vol target. The target levers the book by 1/model vol, from a 60-session correlation shrunk 30% toward its average, sessions before t. The cap is stressed SD ≤ L × target, L = 2 (neighbours 1.5, 3). Reported: ES 1% capped − uncapped, monthly steadiness, 99% VaR breach rate (model vs stress), and how often the cap binds.
- D3 (L03 transfer): the share of the reachable steadiness that σ delivers, (dev_U − dev_F) ÷ (dev_U − dev_O). O sizes by the session's own √rv5, a hindsight ceiling that is not tradeable.

**Controls, run on discovery before confirm is opened. If any fails, stop and report; do not open confirm.**
1. **Reproduction.** With `live` σ and stage 3's filters, the script must reproduce stage 3 exactly: U 0.2630, F 0.1524, F − U −0.1106, MM − F +0.1152, T20 − F −0.0013. This was checked while drafting.
2. **Positive control** (lesson #1; reads no outcome): replace r with σ_pit × t₅ noise on each window's own σ path. F − U must come out below −0.08 (discovery: −0.127). Then replace r with N(0,1) noise, where σ is irrelevant. F − U must come out above +0.08 (discovery: +0.119). Both controls are also run on the confirm σ path before any confirm return is read.
3. **Mirror placebo for (a).** Shuffle each instrument's σ path in whole calendar months within the window, 200 times, and recompute F − U. Whole months are shuffled, not rows (lesson 2026-11-04). Real F − U must sit below the 2.5th percentile of the shuffles.

**Sample.** Confirm: 44 months, about 940 sessions per instrument. Year split for the stability check: 2023, 2024, 2025, 2026 (to 08-20).

## 4. Hypotheses

| Cell | Question | Statistic | Expectation |
|---|---|---|---|
| a | Does σ sizing steady monthly risk against unscaled? | dev_F − dev_U, month bootstrap | **Yes**, about −0.11 (prior partly seen, see §2) |
| b | Is RV20 equivalent to σ for steadiness? | dev_T20 − dev_F; equivalence margin ±0.02 | **Yes**, within ±0.01 |
| c | Does the level floor cut quiet-day tail days? | tail%_FA − tail%_F on quiet days, date bootstrap | **Yes**, about −0.3pp; less sure than (a) because it was found post hoc |
| e | Is 1/σ² less steady than 1/σ? | dev_MM − dev_F | **Yes**, about +0.12 |
| d | Book: dollar share, all-to-1 cap, transfer | §3 | Descriptive, no verdict |

**THE GATE (VALIDATED), per cell, all of these:**
- (a), (c), (e): Holm-adjusted p < 0.05 across the four cells, in the expected direction.
- (b): equivalence by two one-sided tests. TOST p = the larger one-sided bootstrap p against −0.02 and +0.02; that p goes into Holm. The estimate must sit inside ±0.02.
- **Plateau:** (a) σ^0.75 − U and σ^1.25 − U have the same sign and at least half the base size. (e) σ^1.75 − F and σ^2.25 − F have the same sign and at least half the base size. (c) a = 0.10 and 0.50 have the same sign. The size rule does not apply to (c), because the cut grows with a by construction. (b) has no plateau: it is a claim about RV20 by name, and RV10/RV40 are reported (discovery: RV10 −0.026, RV40 +0.034, both outside the margin).
- **+1 lag:** the same sign and at least half the size. For (b), the lagged estimate is also inside ±0.02.
- **Years:** the same sign in at least 3 of the 4 years. For (b), inside ±0.02 in at least 3 of 4.
- (a) only: the mirror placebo passes (control 3).
- (c) only: the floor must not raise all-day tail days significantly. The 95% CI of tail%_FA − tail%_F on all sessions must reach 0 or below.

**THE MIRROR:**
- (a): the whole-month σ shuffle.
- (c): loud days. The floor should add tail days there (discovery +0.15pp), the opposite sign. It is reported and not gated.
- (e): its mirror is (a) itself, at p = 2 against p = 1.

**Other verdicts:**
- **NULL.** (a): the 95% CI lies entirely above −0.05. (c): it lies entirely above −0.25pp. (e): it lies entirely below +0.05. (b): the 95% CI lies entirely outside ±0.02, so one of the two is clearly steadier. Also NULL: an effect significant in the wrong direction.
- **UNDERPOWERED:** the CI spans both 0 and the bar. For (b): the CI straddles a margin edge.
- **CONTEXT:** passes on p but fails the plateau, lag, year, mirror or all-day check.

## 5. Power (discovery data only)

SEs come from the stage 3 pipeline with `pit` σ and causal quiet-day labels on discovery. Each is the stationary bootstrap SE over the larger of two 44-month discovery sub-windows (W1 2016-11 → 2020-06, W2 2019-05 → 2022-12), the same length as confirm. The full-window SE, scaled by √(n_disc / n_conf), is shown beside it. MDEs come from `mdeFromCI`, 80% power, at α = 0.0125 two-sided, Holm's first step with four cells. For (b), the "MDE" is the smallest margin TOST can prove with 80% power when the true difference is 0: (z₀.₉₈₇₅ + z₀.₉) × SE.

| Cell | Unit | n (confirm) | Planning SE (worst 44-mo / scaled full) | **MDE** (α 0.0125) | Pass bar | Verdict | Power at the stage 3 size |
|---|---|---|---|---|---|---|---|
| a | |monthly vol − 1| | 44 months | 0.0273 / 0.0214 | **0.091** (0.071 on scaled SE) | 0.05 | **UNDERPOWERED** | 94% at 0.11 |
| b | same, equivalence | 44 months | 0.0042 / 0.0034 | **0.015** | margin 0.02 | **POWERED** | — |
| c | quiet-day % beyond 3 sd | ~830–890 quiet-day dates | 0.089 / 0.060 | **0.30pp** (0.20pp on scaled SE) | 0.25pp | **UNDERPOWERED** | 78% at 0.29pp, 99% at 0.44pp |
| e | |monthly vol − 1| | 44 months | 0.0188 / 0.0170 | **0.063** | 0.05 | **UNDERPOWERED** | ≈100% at 0.115 |
| d | book | ~900 sessions | ES-diff SE ≈ 0.11 sd (from discovery 0.086) | ≈ 0.38 sd | 0.10 sd | UNDERPOWERED → descriptive | — |

**How the pass bars were chosen, before the MDEs were computed:**
- 0.05 is a cut of a fifth in unscaled monthly risk deviation (0.263). A smaller gain would not justify running a forecast for sizing.
- 0.02 for equivalence is under a fifth of σ's own gain over unscaled (0.11).
- 0.25pp is about one normal distribution's worth of 3-sd days (0.27%), and a sixth of σ's quiet-day rate (~1.4%).

**Reading it.** (a), (c) and (e) cannot rule out effects between their bar and their MDE. If they come back empty, they are UNDERPOWERED, never NULL. They can still pass: the stage 3 sizes are at or above the MDE. (b) is the one cell that can return a clean NULL or VALIDATED at its margin. The worst-window SE is used because the confirm window holds its own shocks (2024-08 yen carry, 2025-04 tariffs), and W1's March 2020 shows how much one month moves the SE.

## 6. Multiplicity

- **Scored cells:** a, b, c, e. Holm at α = 0.05 (`holm`), with p from the bootstrap (two-sided for a/c/e, TOST for b).
- **Descriptive, no pass weight:** cell d (D1–D3); neighbours; the lag rerun; years; `live` σ; discovery-frozen scale; random sign; ES 1% and 1st percentile; loud-day mirror.
- **Disaggregation:** the four classes (FX majors, crosses, metals, indices) and 34 instruments for a/c/e. These are reported with BH q = 0.10 (`benjaminiHochberg`) and `chanceBaseline`. A slice that survives is a candidate, never a result.
- **Promotion:** nothing here sizes a live position. Any proposal to change live sizing needs |t| ≥ 3 on its cell and goes in as a side-by-side shadow, never an edit to a live calc.

## 7. What this does NOT test

- **Return or Sharpe.** The position has no edge by design. Steadier risk is not more money (`vol-target`: same Sharpe).
- **Any trading system's entries or stops.** That is the Rule A study's question, and it was answered there.
- **Costs and fills.** Sizing changes notional, not the number of trades; turnover is reported, not costed.
- **Black-Litterman, ERC, Kelly or drawdown throttles.** Stage 3 found ERC changes nothing; BL with a zero prior reduces to signal/σ. Neither is scored.
- **The jump allowance.** It was inert in stage 3 (it scales with σ).
- **Multi-day holds.** Stage 3 found no sizing differs over 5 sessions (0 of 15 cells).
- **Whether the floor's quiet-day cut is worth its loud-day cost.** That is a preference, reported not judged.

## 8. What each verdict changes

- **(a) VALIDATED:** the Assembly "Size" row (`js/volLayerResearch.js`) says σ sizing steadies risk on unseen data, per instrument-month on all 34. No live change; σ sizing is already the norm. **NULL / UNDERPOWERED:** the row stops saying "holds" and quotes the confirm interval.
- **(b) VALIDATED:** RV20 is a valid stand-in for σ in sizing, for instruments without a forecast (new pairs, the position sizer's fallback). The page says the forecast earns its keep on the lines, not on size (as `vol-target` found). **NULL:** say which is steadier and by how much; the sizing default follows the steadier one, as a shadow first.
- **(c) VALIDATED:** the floor goes to the position sizer as a side-by-side shadow (never an edit to the live sizing), labelled with its loud-day cost. **NULL:** drop the floor; quiet-day tail days are the accepted price of σ sizing. **UNDERPOWERED:** keep it as a candidate; it needs the lockbox (H-A, ≥ 60 sessions) or about 2 more years.
- **(e) VALIDATED:** 1/σ² is closed for sizing in this repo, with `vol-managed-mm`. **NULL:** the "worse everywhere" line comes off the page.
- **(d):** the "Book risk" row's numbers are updated with confirm-window descriptions, marked descriptive.

## Amendments

**2026-11-16, PRE-RESULTS (fixed in the scoring script before confirm was opened; discovery only had been run).** These read the text more exactly. None is a new test.
- (b) +1 lag gate: read as "the lagged estimate is inside ±0.02". The same-sign, half-size rule is not applied to (b). (b) claims a difference near zero, so its sign is noise.
- (a) mirror: the whole-month σ shuffle (200 shuffles) is run on discovery as control 3. It is run again on the confirm window, and the gate uses that confirm run.
- Sample rows: the scored rows keep the stage 3 and power-script filters (σ > 0; RV20, the 250-session median, the quiet-day quantile, the 60-session jump average and the previous σ all present). In confirm this drops no rows, because the trailing inputs read 2022 rows.
- Turnover (descriptive only): the mean absolute session-to-session change in position (1/size divided by its instrument mean).
- p-values: two-sided p = 2 × the smaller share of bootstrap replicates on either side of 0. The TOST p for (b) = the larger of the share of replicates ≤ −0.02 and the share ≥ +0.02.
- MDE: `mdeFromCI` on the confirm 95% CI, 80% power, α = 0.0125 two-sided. For (b) it is (z0.9875 + z0.9) × SE.
- A cell significant after Holm with the wrong sign is NULL. A cell whose CI misses 0 but fails Holm, and meets no NULL rule, is UNDERPOWERED.

**Step 0 (discovery, 2026-11-16): passed.** Reproduction exact: U 0.2630, F 0.1524, F − U −0.1106, MM − F +0.1152, T20 − F −0.0013 (54,433 rows, 34 instruments). Positive control F − U −0.127 [−0.172, −0.096]. Null control +0.119 [+0.094, +0.148]. Mirror: real F − U −0.109 (pit) against shuffles 2.5th percentile +0.048 (min +0.045).

### A2 — 2026-11-16 — POST-HOC (results seen; demotes only)

Cell c is banked CONTEXT, not VALIDATED. Its estimate, −0.232pp [−0.307, −0.163], is clearly below 0 and passes Holm, plateau, lag, 4/4 years and the all-day check, but it does not reach the cell's own 0.25pp pass bar. This prereg's VALIDATED rule did not require reaching the bar; the shared verdict gate (forge/verdict_gate.py) does, and the proof pack uses it. The stricter reading is taken. Cells a, b and e are unchanged (VALIDATED in both readings).

