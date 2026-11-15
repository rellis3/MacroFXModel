# slow-bias-clock — Does a vol-scaled 1/3/12-month trend (+ carry for FX) blend, used as the daily bias with size cut when fast and slow disagree, beat B0, the 4h rule and always-long?

**Pre-registered 2026-11-15, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `slow-bias-clock-dir` (direction cells), `slow-bias-clock-r` (daily R cells), `slow-bias-clock-book` (portfolio cell); one register row `slow-bias-clock` |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` |
| Register row | `plans/RESEARCH_REGISTER.md` → `slow-bias-clock` (maintained by the parent session) |
| Data | 13 instruments of `scripts/h4-trend-hold/backtest.py`: GOLD, EURUSD, GBPUSD, USDJPY, USDCAD, AUDUSD, NZDUSD, USDCHF, EURJPY, GBPJPY, NAS100, SPX500, US30. Daily = NY-close (17:00 New York) mid bars: `features/px_d1_<k>.parquet` (OANDA D, 17:00 NY; checked 2026-11-15 against NY-close bars rebuilt from local M1: 100% of 2,576-2,589 overlapping bars identical per instrument, 0 relative error, a 1-day shift gives 1-3% match, so the labels are the NY-close dates), from 2002-05 (FX) / 2003-03 (NAS100, SPX500) / 2006-03 (gold). EURJPY = EURUSD × USDJPY and GBPJPY = GBPUSD × USDJPY from the same NY-close prints (no OANDA daily file exists for the crosses). US30 has no daily file: NY-close bars from local M1 (`data/m1_bidask/dow_m1.parquet`, n ≥ 60 minutes) from 2016-10. Weekend-labelled rows dropped. **Never** `VolRangeForecaster/data/m1/*_d1.parquet`. Intraday R cells: local bid/ask M1 `data/m1_bidask/<key>_m1.parquet` (2016-10 →), keys as `scripts/exit-on-fixed-entries/run.py`. Everything ends **2026-08-21** (lockbox): daily labels ≤ 2026-08-21, M1 cut before 2026-08-21 21:00 UTC, asserted |
| Seed | `20261115` (one for every script in this study) |
| Uncertainty | date-block bootstrap, block 21 sessions, B = 2000 (clusters = dates, so instruments on one date move together); evidence-pack placebo 500 within-instrument signal shuffles |
| Scripts / outputs | `scripts/slow-bias-clock/run.py` → `analysis/output/slow-bias-clock/` (+ `evidence/<cell>/` from `scripts/evidence_pack/pack.py`) |
| Harness | own script (daily panel + M1 paths + a portfolio; `runStudy.mjs` does none of these). `python -X utf8 -I`, R2 env unset, local files only, `OMP/MKL_NUM_THREADS=2` |

## 1. The claim (required)

`plans/BIAS_RESEARCH_SYNTHESIS.md` P2 and `plans/DAILY_BIAS_REVIEW.md` step 2: *"Slow bias clock: a vol-scaled blend of
1/3/12-month trend per instrument (+ carry) as the daily bias, size cut when fast and slow disagree. Daily R vs the 4h
rule and B0, and as a multi-market portfolio."* The synthesis calls time-series momentum "the best-documented edge; the
banks' and CTAs' medium layer". The literature: Moskowitz, Ooi & Pedersen (2012) TSMOM, 58 futures 1985-2009, 12-month
look-back, vol-scaled, gross Sharpe ≈ 1.2 diversified, positive in every asset class; later work (Hurst-Ooi-Pedersen
"A Century of Evidence"; Baltas-Kosowski) shows post-2009 Sharpe roughly 0.3-0.6 and weaker in FX; blending look-backs
(1/3/12m) is the standard CTA construction. Carry (Koijen-Moskowitz-Pedersen-Vrugt 2018) is the second premium.

**Edge source (method lesson #4):** a risk premium plus slow information diffusion (under-reaction, then over-reaction
at long horizons); on the other side are hedgers and mean-reverting liquidity providers. It is a *weeks-to-months*
premium; a daily outcome sees it as a tiny drift (Sharpe 0.4 a year per market is a daily IC of about 0.025).

## 2. Why it is not already settled (required)

| Ledger entry | Verdict | What it answered | What differs here |
|---|---|---|---|
| `trend-following-fx` (2026-07-20) | NULL | FX-only trend basket null; broad multi-asset ~0.3 OOS, barely beating buy-and-hold | Different construction (1/3/12m vol-scaled blend + carry + size cut), different universe (9 FX + gold + 3 indices), scored as a **daily bias** (P(up), daily R) as well as a book, with costs from bid/ask data |
| `fx-factor-momentum` (2026-11-01) | UNDERPOWERED | **cross-sectional** ranking of 8 currencies on 1/3/12-1m returns, monthly, dollar-neutral: OOS Sharpe −0.39 [−1.60, +0.87] | Here **time-series** (each market against its own past, not ranked), daily, includes gold and indices where TSMOM is documented strongest |
| `fx-factor-carry` (2026-11-01) | UNDERPOWERED | cross-sectional carry rank: IC +0.079 [−0.030, +0.192], Sharpe +0.36 | Carry enters only as an additive FX term of a per-market bias |
| `fx-factor-book-v2` (2026-09-27) | UNDERPOWERED | TSMOM/Carver overlays vs incumbents on 7 USD pairs: trend −0.16 OOS, MDE +1.4 Sharpe | Longer sample (2005-2026, ~21.6 years) and 13 markets; the overlay question is not asked |
| `bias-learner-fx/gold/idx` (2026-11-15) | NULL / UNDERPOWERED | a regularised learner over **morning** readings (incl. a daily-bar trend and carry) does not beat B0 at 0-5 days | Here one fixed, literature-specified slow signal, calibrated by one slope; no learner, no intraday readings; same B0 yardstick |
| `exit-on-fixed-entries` (2026-11-15) | NULL | on the 4h-slope 07:00 entries, no exit beats the 21:00 close; the entries lose ≈ −0.03R net | Its E0 entries are this study's 4h-rule benchmark; here the **side** changes (slow vs 4h), the management stays fixed (lesson #27) |
| `h4-trend-hold` (2026-11-14, exploratory) | — | the 4h rule from 07:00 loses −0.04R/trade 2026-02→08 | The benchmark rule, rebuilt on M1 over 2016-2026 |
| `cot-trend-filter` (exploratory, 2026-10-22) | — | side finding: "the base trend system ran Sharpe 0.10 on these markets 2017-2026 vs 0.49 before" | Expect the same decay; the halves gate makes it visible |
| `portfolio-book` family (CONTEXT) | — | the Portfolio Book's headline 1.1 falls to 0.74 after haircuts | Not a trend book; cited for cost/haircut practice |

Not a re-run of a banked null: no entry scores a vol-scaled time-series trend + carry bias per market on daily direction,
on daily R against the 4h rule, or as a 13-market equal-risk book.

## 3. Definitions, fixed in advance (required)

### 3.1 Daily bars and the signal (all at NY close of day t, using closes ≤ t only)

- r_t = ln(C_t / C_{t−1}) over consecutive weekday NY-close bars of the instrument.
- σ_t = sample SD of the last 60 r (r_{t−59..t}), min 60 bars.
- T_k = ln(C_t / C_{t−k}) / (σ_t √k) for k ∈ {21, 63, 252} (≈ 1, 3, 12 months).
- **Trend** = (T_21 + T_63 + T_252) / 3.
- **Carry** (FX only) = (i_base − i_quote)/100 / (σ_t √252): the annual rate differential per unit of annual vol. Rates
  = 3-month rates known at 06:00 UTC on day t, exactly as `scripts/bias-learner/run.py` `load_rates` (first prints;
  the 2013-06-03 bulk-vintage rows known 45 days after month end; USD = 3m to 2013-06-03 then EFFR; EUR = EZ 3m to
  2026-02-16 then DE call money + the mean offset of their last 12 common months). EURJPY / GBPJPY use EUR−JPY, GBP−JPY.
- **Bias S** = Trend + 2·Carry for FX; S = Trend for gold and indices. Clipped to [−3, +3]. (Weight 2: a 5-point
  differential at 10% vol gives Carry 0.5, i.e. S += 1.0, about one SD of Trend. Fixed by hand, not fitted.)
- **Side** = sign(S); no trade when S is missing (warm-up: 312 bars) or 0.
- **Size** w = 0.5 when sign(T_21) ≠ sign(T_252) (fast and slow disagree), else 1.0.
- **Knowable when?** S_t is known at 17:00 NY on t. Daily outcomes start at close t. The 07:00 London entry on London
  date D uses S from the last NY close completed before 07:00 London on D (the prior weekday's close).

### 3.2 Scored question (i): direction, calibrated P(up), next day and 5 days

- y_{t,h} = 1{C_{t+h} > C_t}, h ∈ {1, 5} NY-close bars (ties dropped). Label end t+h must be ≤ 2026-08-21.
- **B0_{i,h}(t)** = (Σ y + 10)/(n + 20) over instrument i's horizon-h labels whose end is ≤ t (Beta(10,10), expanding,
  point-in-time; as `direction-bar` / `bias-learner`).
- **Calibration (fixed fit/test):** per group g ∈ {FX (9), gold, indices (3)} and h, one logistic
  logit P(up) = logit(B0) + a + b·S, fitted (unpenalised, sklearn-free closed IRLS) on the group's rows with label end
  < 2016-01-01 (**fit**, 2003/2006 → 2015). Applied unchanged to **test** rows t ∈ [2016-01-04, 2026-08-21 − h].
  US30 has no fit rows; it uses the index group's (a, b).
- **Statistic:** BSS_B0 = 1 − Σ(p − y)² / Σ(B0 − y)² over the group's test rows.
- **Mirror:** the fitted b must be > 0 (trend-following). b < 0 with positive BSS is the mirror (reversal) and is
  reported as WRONG SIGN, never as a pass.

### 3.3 Scored question (ii): daily R at 1σ risk vs the 4h rule and vs always-long

- Entries: every weekday London date D in [2016-11-21, 2026-08-21] per instrument, mechanics of
  `exit-on-fixed-entries` E0 / `h4-trend-hold` DAY: entry at the 07:00 London M1 bar (ask for long, bid for short),
  stop 1σ_D away where σ_D = SD of the last 20 NY-close log returns completed before 07:00 (the h4 rule's σ), stop
  checked on the bid/ask M1 path (gap through fills at the bar's open), exit at the 21:00 London bar's open (bid for
  long, ask for short). R_L and R_S computed for every entry day, spread inside.
- Rules on the **common days** (all three have a side): SLOW (side from 3.1, size w), H4 (sign of the 4h EMA20 slope at
  07:00, `exit-on-fixed-entries` `Inst.slope`, w = 1), LONG (+1, w = 1).
- **Statistic:** risk-weighted mean R per entry, R̄ = Σ w·R_side / Σ w (so the size cut cannot win just by trading
  smaller). Cells: **ΔR(SLOW − H4)** and **ΔR(SLOW − LONG)**, pooled over 13 instruments.
- **Mirror:** SLOW with the side reversed (R̄ and Δ reported).

### 3.4 Scored question (iii): equal-risk 13-market book

- Daily, close t → close t+1: position_i = side_i · w_i · (0.10/√252)/σ_i(t) (10% annual target per market, notional
  as a fraction of equity); book return = mean over the markets live that day.
- Return of a position = pos · (r_{t+1} + financing), financing per day: FX (i_base − i_quote)/100/252; gold −i_USD/100/252;
  indices (2.0 − i_USD)/100/252 (2% dividend yield assumed). Rates as 3.1, known at t.
- **Costs** from the data-rules spread source: half-spread/mid per instrument per calendar year = median of
  (ask − bid)/mid over 07:00-21:00 London minutes of local bid/ask M1 (2016-10 →); years before 2017 use the 2017 value
  (stated: likely understates pre-2010 spreads; sensitivity ×2 reported). Cost per day = Σ_i |pos_i(t) − pos_i(t−1)| ·
  halfspread_i / N_t.
- **Statistic:** annualised Sharpe of the net daily book return, 2005-01-03 → 2026-08-21 (first scored day = first
  day with ≥ 8 markets live after warm-up; earlier days dropped). Benchmarks (descriptive): LONG book (side +1, w 1, same
  scaling) and the Sharpe difference SLOW − LONG.
- **Mirror:** the reversed-side book (net, so costs make both worse).

### 3.5 Controls and de-clustering

- Clusters = dates (instruments on one date are one cluster), block 21 sessions. Overlapping 5-day labels: the block
  covers the overlap.
- Placebo (evidence pack): signal and side shuffled across dates within instrument, 500 draws; the real estimate must
  sit above the 97.5th percentile.
- Lookahead canary (evidence pack): the side replaced by the sign of the scored outcome; the estimate must jump.
- Positive control (evidence pack, on the real rows): a bar-sized drift in the signal direction added to the real
  outcomes must be found (≥ 80% of 40 plants at 1× bar).
- Concentration: by year, by instrument, halves, without the top 1% of rows; named stress windows (2008-09 → 2009-03,
  2020-02 → 2020-04, 2022) for the book (lesson #7, descriptive).

### 3.6 Positive control before the run (method lesson #1)

`run.py --selftest`, on synthetic data only, through the same functions as the real run: (a) 13 synthetic markets,
21 years, daily returns = μ_t + noise with μ_t a slow AR(1) drift (half-life ~120 days) sized so an oracle TSMOM book
has Sharpe ≈ 1 (known from the generator, outside the pipeline): the pipeline's book Sharpe CI lower bound must be > 0
and the +5 BSS > 0; (b) the same with μ = 0: book Sharpe CI must include 0 and BSS CI must include 0; (c) perturbing
prices after t leaves S_t unchanged (no lookahead); (d) the M1 R function on a hand-built path returns the known R
(stop hit, gap fill, 21:00 exit). The real run aborts if any fails.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | (i) Does calibrated P(up) from S beat B0 at +1 / +5 in FX, gold, indices (6 cells)? | **Null.** BSS ≈ 0 (≤ 0.05%): a 0.4-Sharpe premium is a daily IC ≈ 0.025, BSS ≈ 0.04%, below every MDE |
| b | (ii) ΔR(SLOW − H4) | **≈ 0 to +0.02R**: both are near-zero-edge sides under the same management; SLOW maybe slightly better because H4 loses |
| c | (ii) ΔR(SLOW − LONG) | **≈ 0, sign uncertain**: LONG carries the index/gold drift 2016-2026 |
| d | (iii) Book net Sharpe | **+0.1 to +0.4**, weaker after 2016 (`cot-trend-filter` side finding: 0.49 → 0.10) |
| — | **THE GATE** per cell: estimate's 95% CI lower > 0 **and** Holm-adjusted p < 0.05 over the 9 scored cells **and** same sign in both halves (test window split at its middle date; for the book, 2005-2015 vs 2016-2026) **and** above the placebo 97.5th percentile **and** the mirror condition (b > 0 for direction; the mirror R̄/Sharpe not significantly > 0) | |
| — | **THE MIRROR** | Reversed sign: built into (i) as b > 0; reported for (ii) and (iii) as the reversed-side R̄ and book |

**Verdict per cell:**

| Condition | Word |
|---|---|
| gate holds and estimate ≥ pass bar | `VALIDATED` |
| CI lower > 0 and Holm p < 0.05, but estimate < bar, or halves / placebo / mirror fails | `CONTEXT` (real but small, unstable or the wrong mechanism) |
| gate fails, cell POWERED (binding MDE ≤ bar), CI upper < bar | `NULL` |
| otherwise | `UNDERPOWERED` |

Binding MDE = max(the design MDE in §5, 3.61 × the run's bootstrap SE). Per-ledger-id word: VALIDATED if any of its
cells is VALIDATED; else CONTEXT if any is CONTEXT; else NULL if every cell is NULL; else UNDERPOWERED. `-dir` has 6
cells, `-r` 2, `-book` 1. Each cell's word is reported separately as well.

## 5. Power — what this design can and cannot find (required)

Holm first-step α = 0.05/9 two-sided → z = 2.77; MDE = (2.77 + 0.84) × SE = 3.61 × SE.

| Cell | Planned n | SE source (control only) | Design SE | **MDE** | Pass bar | Verdict |
|---|---|---|---|---|---|---|
| dir +1 FX | ~2,650 test dates × 9 | `bias-learner` null SD, same 9 pairs / similar window (one-slope model has less estimation noise, so conservative) | 0.046% | 0.17% | U = 0.40% | POWERED |
| dir +1 gold | ~2,650 | same | 0.068% | 0.25% | 0.40% | POWERED |
| dir +1 idx | ~2,650 × 3 | same | 0.062% | 0.22% | 0.40% | POWERED |
| dir +5 FX | ~2,650 × 9 (overlap) | same | 0.108% | 0.39% | 0.40% | POWERED (marginal) |
| dir +5 gold | ~2,650 | same | 0.207% | 0.75% | 0.40% | UNDERPOWERED by design |
| dir +5 idx | ~2,650 × 3 | same | 0.209% | 0.75% | 0.40% | UNDERPOWERED by design |
| ΔR SLOW − H4 | ~32,000 entries, ~2,450 dates | `exit-on-fixed-entries` (same entries, 13 instruments): ΔR SEs 0.005-0.013R | ≤ 0.013R | ≤ 0.047R | 0.05R | POWERED |
| ΔR SLOW − LONG | same | same | ≤ 0.013R | ≤ 0.047R | 0.05R | POWERED |
| Book net Sharpe | ~21.6 years daily | Lo (2002): SE ≈ √((1 + SR²/2)/years) | 0.22 | 0.79 | 0.30 | **UNDERPOWERED by design** |

- **U for direction** = the BSS of an ideal calibrated forecast with daily IC 0.08 on the horizon return:
  BSS ≈ 2ρ²/π = 0.41%, rounded to 0.40% (same IC as `bias-learner`'s U; that study's pipeline shrank it).
- **0.05R bar**: the desk's bar for a daily trade rule (`exit-on-fixed-entries`), above a round trip of spread (~0.03R).
  A literature-sized TSMOM premium is ~0.02R a day trade; the R cells can only find something much larger.
- **Book**: a 0.3 Sharpe (the memory's multi-asset OOS figure) is below the MDE; only a Sharpe ≈ 0.8 could pass Holm.
  An empty book cell is therefore UNDERPOWERED unless its CI upper bound falls below 0.3.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells: 9** = direction {+1, +5} × {FX, gold, indices} (BSS_B0); ΔR(SLOW − H4); ΔR(SLOW − LONG); book net
  Sharpe. Holm at α = 0.05; p from the bootstrap (z = estimate / SE, SE = max(bootstrap SE, placebo SD); two-sided).
- **Disaggregation / decomposition (BH q = 0.10, `chanceBaseline`; descriptive, candidates only)** — registered now so
  they cannot be chosen later (owner's null-decomposition rule):
  - components alone as the side: T_21, T_63, T_252, Trend (no carry), Carry (FX only), each on ΔR vs H4, R̄ alone,
    +1/+5 BSS, and the book Sharpe;
  - size cut on vs off (w ≡ 1);
  - per instrument and per year for each scored cell; the SLOW R̄ alone (net) and H4 R̄ alone; B0-side R̄.
  - book: spot-only (no financing), costs ×2, 2005-2015 vs 2016-2026, post-publication 2013 →, stress windows.
- **Promotion bar:** anything that sizes or gates a live position needs |t| ≥ 3 on its scored cell.

## 7. What this does NOT test (required)

- Not intraday timing or exits (fixed 07:00 → 21:00, 1σ stop: lesson #27, `exit-on-fixed-entries`).
- Not a multi-day hold of the daily-R trade (the book is the multi-day version, close to close, no stop).
- Not a fitted or optimised blend: the weights (1/3 each, carry ×2, size 0.5) are fixed by hand; no variant search.
- Not cross-sectional momentum or carry (`fx-factor-*`).
- Not broker execution: the book's costs are a spread model at a liquid hour, not fills at 17:00 NY; no swap markups.
- Not a cause: a pass says the slow side carries a premium on these markets, not why.

## 8. What each verdict changes (required)

- **Pass (any cell VALIDATED)** → ledger entry; the desk's published bias becomes the slow clock (side + "fast/slow
  agree" size) as a research-only line beside B0, forward-scored by `bias-scoreboard`; nothing live until |t| ≥ 3 or a
  forward pass.
- **NULL** → the desk card does not show a slow-trend direction as a forecast of tomorrow / the week; it may describe the
  trend state. The 4h rule is not replaced by it on R grounds.
- **UNDERPOWERED** → the book needs a longer or wider sample (60+ futures, 1985 →) to be judged; register the slow clock
  in the forward bias-scoreboard instead of claiming it. Direction +5 for gold/indices closes as untestable here.
- **CONTEXT** → described on the card as "a small, real premium", never as a call.

## Amendments

### A1 — 2026-11-15 — POST-HOC (scored estimates seen; packs not yet read)

Bug in the evidence-pack wiring for the direction cells, found while the first pack ran: the pack was given only the
test rows with the calibration (a, b) frozen, so (1) the shuffled-signal placebo barely moved p (band ±0.00006 BSS,
far too narrow) and (2) a drift planted "in the signal direction" lowers the skill whenever the frozen b is negative
(FX +1 b = −0.007), so the positive control could never be found. Fix: the direction pack holds the fit **and** test
rows, and every pack estimate (placebo draw, plant, leak, bootstrap) refits the one-slope calibration on its fit rows
before scoring the test rows — i.e. the placebo, plant and leak go through the registered pipeline (§3.2, §3.5). The
scored estimates, their bootstrap CIs and the 9-cell set are unchanged (same seed, same code path). The placebo SD and
percentile feed the gate and the p-value (SE = max(bootstrap SE, placebo SD)); the fix can only widen the placebo and
so can only demote. Also fixed: the pack output sits at `evidence/<cell>/evidence/` (the verdict stamp looked one
level up). The run was restarted from scratch. Because the laptop was saturated by concurrent studies (this process
got < 10% of a core), the evidence packs run with fewer resamples than §3.5 says (direction and book packs: 100
placebo shuffles, 10 plants per multiple, bootstrap 200; R packs: 200 / 10 / 300). The scored cells keep B = 2000.
Fewer placebo draws make the 97.5th-percentile gate noisier (± ~1.5 percentile points), not biased.

### A2 — 2026-11-15 — POST-HOC (results seen) — demote only

The direction cells' scored CI holds the fitted calibration (a, b) fixed, so it leaves out the noise of fitting b.
The evidence pack refits (a, b) on every resample and every plant; on the index and gold cells it found a planted
bar-sized effect in < 80% of plants although §5's MDE called some of them POWERED. Rule added (applied by
`scripts/slow-bias-clock/finalize.py`, never promotes): a cell whose pack positive control detects the 1× bar plant in
< 80% of plants cannot be NULL; it becomes UNDERPOWERED. Ledger-id words are recomputed from the demoted cell words.

Noted, not changed: the book is annualised with √252 although FX books trade ~260 weekdays a year (understates the
Sharpe by ~1.6%); the gold 21:00 bar is missing on 179 of 2,545 days (US holiday / early-close sessions), counted, not
imputed.

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/slow-bias-clock/RESULTS.md`. Nothing above this line changes after the run.*
