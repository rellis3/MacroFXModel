# overnight-vol-regime — does the overnight hold's risk-adjusted return change with the volatility regime it is entered in?

**REGISTERED 2026-11-02 on owner approval.** The draft was reviewed and the owner asked for three clarifications, which are written in below:
- why the ±0.05 and ±0.15 thresholds (§5.2);
- primary evidence vs credibility checks (§4);
- the three-question report (§5.3).

Owner decisions on the draft:
- extend NQ to 2009, subject to the overlap and data-quality checks;
- gold uses the existing 2016+ sample, with no extra history pulled.

No conditional outcome had been computed when this was committed. Before registration only these were computed, all unconditional, as the template allows:
- per-night SDs;
- the unconditional SD of the vol-normalised return;
- the autocorrelation of the volatility percentile (prices only);
- data coverage.

| | |
|---|---|
| ID / ledger ids | `overnight-vol-regime` (study); ledger ids `overnight-vol-regime-nq` (H1), `overnight-vol-regime-gold` (H2) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `overnight-vol-regime` |
| Data | NAS100: banked overnight trades 2016-10-24 → 2026-08-19, plus NQ futures extension 2009-01-02 → 2016-10-21 (§3.2). Gold: banked trades 2016-10-24 → 2026-08-19 only. The vol variable comes from OANDA D1 closes. Ends at the lockbox. |
| Seed | `20261102` |
| Uncertainty | block bootstrap by **calendar month** (B 2000); label-shift placebo (2000 shifts, ≥ 63 nights) |
| Scripts / outputs | `scripts/overnight-vol-regime/` → `analysis/output/overnight-vol-regime/` |
| Harness | own Python script, in two modes: `--mode controls` (no real-label statistic is computed), reviewed by the owner, then `--mode score` |
| Queue | this is experiment 1 of 3, agreed 2026-11-02. Then the previous US-session return (`overnight-prior-session`), then the night before FOMC (`overnight-pre-fomc`). Each gets its own prereg. |

## 1. The claim

C.OG (Discord, 2026-11-01): *"test some simple filters, such as high stress or low stress."* The owner's framing (2026-11-02): before any filter, establish whether the overnight hold's return distribution differs between volatility regimes at all.

**Question.** Holding NAS100 or gold long from 20:00 to 14:30 UK: does the **risk-adjusted** gross return of a night depend on how volatile the market was going into it?

Three competing accounts predict different answers:

| Account | Prediction for risk-adjusted return as volatility rises |
|---|---|
| **Constant risk premium.** Return scales with risk, as found close-to-close in `stress-filter-hold`. | **Flat** (our pre-registered expectation) |
| **Volatility-managed portfolios** (Moreira & Muir 2017). Returns don't keep up with risk. | **Falls** |
| **Overnight inventory premium** (Boyarchenko, Larsen & Whelan 2023, *The Overnight Drift*). Overnight returns pay dealers for absorbing end-of-day selling, which is heaviest in stressed markets. | **Rises** |

## 2. Why it is not already settled

- `overnight-hold-nq` / `overnight-hold-gold` (UNDERPOWERED, 2026-10-25): the unconditional edge only. No conditioning was done.
- `stress-filter-hold` (2026-11-02): **close-to-close** daily holding. Stressed days were followed by +0.022σ against calm. That is a different window, and the overnight literature says the overnight window behaves differently. Its result is our prior, not an answer.
- `vol-target` (validated): sizing by σ gives the same Sharpe and a smaller worst month, on daily data. The overnight window has never been tested.
- `iv-sizing-filter`: intraday bot trades, a different object.
- Exploratory `overnight-hold-futures` (2026-10-29): re-priced the 2016+ trades on futures. Futures and CFD gross agree with correlation 0.998, a mean difference of 0.0002% a night. No pre-2016 overnight returns have been computed by anyone.

## 3. Definitions, fixed in advance

### 3.1 The nights and the outcome

- **Nights.** Entry at 20:00 UK (Europe/London clock) Monday–Thursday, exit at 14:30 UK on the next weekday. This is exactly the banked rule (`forge/OVERNIGHT_HOLD_PREREG.md`): no Friday entries, so no weekend holds.
  - In the ~3 weeks a year when US and UK clocks are out of step, the rule keeps the UK clock. Those nights are flagged and reported, not removed.
- **Gross return** r = exit / entry − 1, in %. **This is the primary measure** (owner, 2026-11-02).
- **Net return** is kept beside it:
  - 2016+: the banked CFD net (real bid/ask spread at the fill minute, plus modelled financing);
  - all years: a futures net (1 tick a side plus $5 per round trip, as in `overnight-hold-futures`).
- **Vol-normalised return** z = r / σ̂, where σ̂ = the EWMA (λ 0.94) daily σ from OANDA D1 closes **through the previous weekday's 17:00 NY close**.
  - Unconditional SD of z (allowed, computed): NQ 0.65, gold 0.79.
  - The SD is below 1 because the overnight window carries only part of a day's variance.

### 3.2 NQ history extension (2009-01 → 2016-10), and why it is comparable

**Source.** The owner's NQ 1-minute file (`analysis/output/nt8/drive/NQ_1m_drive.parquet`): 5.8m bars, 2008-12-11 → 2026-04-22, no gaps longer than 4 days. The entry and exit minutes are present on 242–258 days a year from 2009 to 2016, about 97–100% of trading days. The series is ratio back-adjusted, so % returns are exact inside a contract and carry no roll jump.

**How it joins.** The extension supplies only the nights **before** the banked sample (2009-01-02 → 2016-10-21, about 1,580 nights after holidays). 2016-10-24 onward stays the banked OANDA trades, unchanged, so the baseline is unchanged.

**Comparability checks, run in `--mode controls` before any scoring:**
1. On the overlap 2016-10 → 2026-04, the futures-file gross against the banked OANDA gross, night by night. It needs correlation ≥ 0.98 and a mean difference ≤ 0.005% a night. The earlier exploratory check found 0.998 and 0.0002%.
2. Nights dropped for a missing minute are counted, by year.
3. The minute alignment is copied from `scripts/overnight-hold-futures/build.py` (Central time → UTC → London), not rewritten.

If check 1 fails, the extension is dropped and NQ runs on 2016+ only (the power table below shows the cost).

**What changes with the extension, and what doesn't:**

| | Effect |
|---|---|
| Power | n ≈ 1,949 → ≈ 3,530; the MDE falls by about 25% (§5) |
| Regimes covered | adds 2010 flash crash, 2011 US downgrade, 2015 yuan shock, and a long low-vol 2013–14 stretch; still no 2008 (the file starts 2008-12) |
| Gross | the same instrument economically (futures = CFD gross to 0.0002% a night on the overlap) |
| Net | only the futures cost model exists before 2016. The CFD net (spread + swap) is 2016+ only, and 2009–12 Globex spreads were wider than one tick, so the pre-2016 futures net is optimistic. This is why gross is primary. |
| Stability check | the split point between the two data sources is also the era split (§4.2 check A1). A source artefact would show as the two eras disagreeing. |
| Not done | gold: no local gold minute data before 2015-11 (OANDA M1 and the GC futures both start there). Gold stays at 1,962 nights. **Owner decision 2026-11-02:** no extra gold history for now. First establish whether this research produces useful evidence. |

### 3.3 The volatility variable (known at 20:00 UK entry)

- **x = vol percentile.** RV20 = √(252 × mean of the last 20 squared daily log returns) from OANDA D1 closes **through the previous weekday's close (t−1)**. x is its mid-rank percentile among the RV20 values of the previous 252 trading days (t−253 … t−2). So x lies in [0, 1], and the thresholds come from the instrument's own past, not from us.
- **Why t−1 and not today:** the 20:00 UK entry is 15:00 New York, an hour **before** the US close. Today's daily close, today's VIX close (16:15 ET) and today's RV20 are not known at entry. Using them would be look-ahead specific to this trade.
- **Persistence (computed, prices only):** x autocorrelation 0.97 at 1 night, 0.41 at 20, 0.05 at 60 (NQ). Gold: 0.95 / 0.24 / 0.02. So regimes last about a quarter. Each "high-vol quartile" is a handful of episodes, not 500 independent nights. That is why the bootstrap blocks by month and the placebo shifts by at least 63 nights.
- **Descriptive buckets:** quartiles of x with fixed edges 0.25 / 0.50 / 0.75, plus "extreme" = x ≥ 0.90, flagged for description only.
- **Secondary vol definitions** (robustness only):
  - EWMA σ̂ percentile on the same rule;
  - intraday realised vol from M1, 14:30–19:59 UK on the entry day (known at entry);
  - RV60 percentile.

### 3.4 Scored tests

| # | Test | Statistic |
|---|---|---|
| **H1** | NAS100: does risk-adjusted overnight return change with x? | OLS slope b of z on x (x from 0 to 1, so b = the change in z from the quietest to the busiest nights) |
| **H2** | Gold: same | same |

Two scored tests, Holm at α 0.05. Everything else is described.

**Uncertainty:**
- 95% CI from a month-block bootstrap of nights (B 2000).
- p-value from the label-shift placebo: x is rotated against the returns by a random offset of ≥ 63 nights, 2000 times, and p is the share of |b_placebo − mean| ≥ |b − mean|.
- The placebo keeps both series' own persistence and destroys only their alignment.
- The verdict needs the bootstrap CI and the placebo to agree.

### 3.5 Described, not scored

- **Bucket table** for each quartile and the extreme group:
  - nights, mean gross and net (%), mean z, hit rate against the instrument's own base rate (not 50%);
  - SD, skew, 5th / 95th percentiles, worst night;
  - share of total gross P&L.
- **Raw-return slope:** gross % on x, with CI. Expected positive purely from scale: if z is flat, a busier market moves more in both directions. The size this design can see is in §5.
- **Costs across regimes** (the owner's explicit request), by quartile:
  - CFD spread (entry + exit), financing per night, and costs as % of gross (2016+);
  - futures tick + commission as % (all years);
  - test: slope of cost per night on x, with CI.
  - Expectation: spreads widen in high vol, and financing follows the rate level (time, not vol), so cost differences track the year as much as the regime. Both are reported.
- **Year-by-year** b and the bucket means.

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| H1 | NQ slope b of z on x ≠ 0 | **Flat: b ≈ 0** (plausible range −0.05 to +0.05). Prior: close-to-close +0.022σ. |
| H2 | Gold slope b ≠ 0 | **Flat: b ≈ 0** |
| Described | raw-% slope | positive, ≈ +0.03 to +0.06% a night across the full range, from scale alone; below what this design can see |
| Described | costs | CFD spread higher in the top quartile; cost as % of gross roughly constant or lower, because gross moves scale up |

### 4.1 Primary evidence: this alone answers "is there an effect?"

For each instrument, the primary conclusion comes from **one statistic and two agreeing measures of its uncertainty**:
- **P1.** The slope b of z on x, on all nights.
- **P2.** The 95% month-block bootstrap CI for b.
- **P3.** The label-shift placebo p, Holm-adjusted across H1 and H2.

**Evidence of an effect** means the Holm-adjusted placebo p < 0.05 **and** the CI excludes 0. Whether a large or a useful effect is ruled out is read from the same CI (§5.2).

Nothing else feeds this. The checks below cannot make an insignificant slope significant, and they don't count as further independent tests. They are not seven separate pass/fail gates.

### 4.2 Credibility checks: is an effect, if found, believable and general?

These are only judged if P1–P3 show an effect. Each has one pre-set reading. They come in two groups, with different roles.

**Group A: concentration.** Does the effect depend on a few nights, one period or one data source? These test the owner's "a few trades or one period" concern directly. They can **demote** the verdict.

| # | Check | Reading |
|---|---|---|
| A1 | **Eras.** b in each era. NQ: 2009-01 → 2016-10 (futures extension) vs 2016-10 → 2026-08 (banked). Gold: 2016-10 → 2021-08 vs 2021-08 → 2026-08. | **Contradicts** if one era has the opposite sign **and** its own CI excludes the full-sample b. **Uninformative** if the sign is opposite but the CI includes the full-sample b (a half-sample is noisy). **Consistent** otherwise. For NQ this also tests the data-source join. |
| A2 | **A few nights.** b with the 10 largest \|z\| nights removed, plus the number of nights needed to flip the sign. | **Concentrated** if removing them leaves less than half of b, or flips its sign. |
| A3 | **One episode.** b with 2020 and 2022 removed. A leave-one-year-out range is described. | **Concentrated** if less than half of b remains, or its sign flips. |

**Group B: character.** What kind of effect is it? These are reported, and they qualify how the result is read and what follows (§8). **They do not change the verdict word.**

| # | Check | Reading |
|---|---|---|
| B1 | **Shape.** Quartile mean z moves with the slope in ≥ 2 of 3 steps. | gradual, or a threshold/one-bucket effect |
| B2 | **Simpler features.** b with the previous 5-day return and the weekday as controls. | **Explained by recent returns** if b loses more than half its size or flips sign. That would point to experiment 2 (previous-session return) as the real variable. |
| B3 | **Definition.** The sign of b under the 3 secondary vol definitions. | **General** if ≥ 2 of 3 agree in sign; **RV20-specific** otherwise |

**How they combine into the verdict:**
- **VALIDATED** = P1–P3 show an effect, and no Group A check reads *contradicts* or *concentrated*.
  - **Credibility high:** Group B is also all supportive.
  - **Credibility moderate:** one or more Group B items isn't. That item is named in the headline.
- **Effect present but concentrated** = P1–P3 show an effect, but a Group A check fails. **UNDERPOWERED**, with that check named. The pattern is recorded, but not as a relationship.
- **No effect shown** = P1–P3 don't show one. Groups A and B are still reported, as description only. The verdict comes from the CI (§5.2).

**THE MIRROR:** both signs are live hypotheses (§1), so a significant negative or positive b is reported as what it is. Neither becomes a trading rule here (§8).

## 5. Power, and the difference between "underpowered" and "too small to matter"

### 5.1 What the design can detect (analytic, from unconditional SDs)

For a slope on a percentile, SE(b) ≈ SD(z) / (SD(x) · √n) · √deff, with:
- SD(x) = 0.289 (uniform on [0, 1]);
- deff = 1.2, a conservative allowance for heteroskedasticity and month clustering. The placebo replaces it with the measured value in `--mode controls`;
- MDE = (z₀.₉₇₅,Holm + z₀.₈₀) × SE = 3.08 × SE (Holm's first step at α 0.025).

The %-a-night column multiplies b by the median daily σ (NQ 1.1%, gold 0.8%).

| Cell | n | SE(b) | **MDE (b, z units)** | ≈ % a night, quietest → busiest | 95% CI half-width if b ≈ 0 |
|---|---|---|---|---|---|
| H1 NQ, 2016+ only | 1,949 | 0.056 | 0.17 | 0.19% | ±0.11 |
| **H1 NQ, with 2009+ extension** | ≈ 3,530 | 0.042 | **0.13** | 0.14% | **±0.08** |
| H2 gold | 1,962 | 0.068 | **0.21** | 0.17% | ±0.13 |

For scale, the **average** gross edge is about 0.05 z-units (NQ ≈ 0.054% a night ÷ 1.1%; gold ≈ 0.058% ÷ 0.8% ≈ 0.07). **This design can only find a vol relationship about three times the size of the edge itself.**

`--mode controls` reports the placebo MDE and a positive control: plant b = 0.15 on shifted labels and record the detection rate. The owner reviews these before scoring.

### 5.2 The two thresholds, and why these values

#### What b measures

- z is a night's gross return divided by that instrument's daily σ at entry. **z = 1** means the night moved by one ordinary day's worth of volatility.
- The SD of z is 0.65 (NQ) and 0.79 (gold), because a night is only part of a day.
- **b** is the rise of the fitted line from the quietest nights (x = 0, vol at the bottom of its past year) to the busiest (x = 1, vol at the top).
- Buckets are easier to picture. The gap between the **top-quartile** and **bottom-quartile** average z is **0.75 × b**, because the quartile centres are 0.125 and 0.875.

#### The yardstick: the edge itself

Measured in z, the unconditional edge (the banked 2016+ mean gross over median σ) is:
- NQ: μ ≈ 0.054% / 1.1% ≈ **0.05**;
- gold: μ ≈ 0.058% / 0.8% ≈ **0.07**.

Both are themselves uncertain: the banked edge is UNDERPOWERED. They are used only to translate the thresholds. The thresholds are fixed in z and are **not re-derived** from any later estimate of μ.

#### The calculation

Under a straight line, E[z | x] = μ + b (x − ½). Two economic yardsticks follow:
1. **The best any use of x could do.** Size each night in proportion to its expected z (an oracle that knows b exactly). Sharpe rises by a factor √(1 + b² / (12 μ²)). No real rule beats this ceiling, because b would have to be estimated.
2. **The simplest filter.** Skip the bottom quartile if b > 0 (or the top quartile if b < 0).
   - Kept nights average μ + 0.125 |b|, on 75% exposure.
   - Sharpe changes by √0.75 × (1 + 0.125 |b| / μ).
   - Total return changes by 0.75 × (1 + 0.125 |b| / μ).

| b (z units) | Meaning, NQ (μ 0.05) | % a night, quietest → busiest (NQ / gold) | Top − bottom quartile, z | Oracle Sharpe ceiling (NQ / gold) | Quartile filter, NQ: Sharpe / total return | Quartile filter, gold: Sharpe / total return |
|---|---|---|---|---|---|---|
| **0.05** (smallest of interest) | edge 0.025 at the quietest, 0.075 at the busiest; quartile averages 0.03 vs 0.07 | 0.055% / 0.04% | 0.04 | **+4% / +2%** | −2% / −15% | −6% / −19% |
| 0.10 | edge ≈ 0 at the quietest, ×2 at the busiest | 0.11% / 0.08% | 0.075 | +16% / +8% | +9% / −6% | +1% / −12% |
| **0.15** (large) | edge negative at the quietest, ×2.5 at the busiest; quartile averages −0.01 vs 0.11 | 0.165% / 0.12% | 0.11 | **+33% / +16%** | **+20% / +4%** | +9% / −6% |

Break-even points for the quartile filter:

| | NQ | Gold |
|---|---|---|
| Sharpe break-even (b = 1.24 μ) | 0.06 | 0.09 |
| Total-return break-even (b = 2.67 μ) | 0.13 | 0.20 |

#### Why ±0.05 is the smallest effect of interest

- **No decision changes below it.** Even the oracle gains at most 4% Sharpe on NQ and 2% on gold. That is 0.03–0.04 on an overnight Sharpe near 1.
  - It is below what any realistic record could confirm: the SE of a Sharpe ratio over 10 years is about ±0.3.
  - It is below the uncertainty in the costs themselves: gold swap differs 5× between the two accounts.
- **The simplest filter loses money** at this size on both instruments, in both Sharpe and total return.
- **So:** an effect inside ±0.05 may be real, but it can't be turned into a better trade with the data we have. It is "too small to be useful", not "zero".

#### Why ±0.15 is a large effect

- **On NQ it is where the simplest filter starts to pay on both counts:**
  - Sharpe +20%;
  - total return no lower (+4%), because the skipped nights cost less than they risk.
  - Between 0.06 and 0.13 the filter improves Sharpe but gives up total return. That is a sizing question, not a filter.
- **It marks the scale at which the regime changes the sign of the trade's expectation.** At 0.15 the quietest quarter's expected return is about zero or negative.
- **Why not higher:** a larger threshold would let a working NQ filter be called "not large".
- **Why not lower:** below about 0.13, ruling out a "large" effect would no longer rule out a filter that keeps total return.

#### Gold

Gold's edge is larger in z (0.07), so the same b is relatively smaller:
- a gold quartile filter needs b ≈ 0.20 to keep total return;
- so "large ruled out at 0.15" is a stronger statement for gold than it looks.

The thresholds are kept common so the two instruments are read on one scale. The gold break-evens above are reported alongside.

#### Why the CI, not the p-value, separates the outcomes

A non-significant result can mean two different things. "p = 0.4" looks the same in both. The **95% CI** for b, read against the two thresholds, tells them apart:

| What the 95% CI does | What it means | Verdict word |
|---|---|---|
| Excludes 0 (with the placebo, §4.1), and Group A holds | evidence of a relationship | **VALIDATED** |
| Contains 0 and lies **entirely inside ±0.05** | the relationship is probably **too small to be useful**, real or not | **NULL** |
| Contains 0, extends beyond ±0.05 but **inside ±0.15** | a large effect is ruled out; a smaller useful one is not | **UNDERPOWERED** (large effect ruled out) |
| Contains 0 and extends beyond ±0.15 | the data can't tell; even a large effect is possible | **UNDERPOWERED** (uninformative) |
| Excludes 0 but a Group A check fails | a pattern carried by one era, one episode or a few nights | **UNDERPOWERED** (effect concentrated), with the check named |

**Said plainly, before running:**
- With the CI half-widths above (±0.08 NQ, ±0.13 gold), **NULL is unreachable for both instruments.** Even a true b of exactly 0 gives an interval wider than ±0.05.
- Ruling out a useful effect would need about 3× the NQ extended sample: roughly 10,000 nights, or 40 years.
- So the realistic outcomes are VALIDATED (only if the effect is large) or UNDERPOWERED. For NQ we expect to be able to say whether a **large** effect is ruled out.

`--mode controls` measures these probabilities directly (§5.4) before anything is scored.

### 5.3 How the result is reported: three separate questions per instrument

The report never compresses the outcome into the verdict word alone. For each instrument it answers three questions, each from the CI and placebo, in this order:

| Question | Answered by | Possible answers |
|---|---|---|
| **Q1. Is there evidence of an effect?** | §4.1: placebo p (Holm) < 0.05 **and** CI excludes 0 | **yes** (with direction and credibility high/moderate, §4.2) · **yes, but concentrated** (Group A check named) · **no** |
| **Q2. Is a large effect (\|b\| ≥ 0.15) ruled out?** | the CI lies inside ±0.15 | **ruled out** · **not ruled out** |
| **Q3. Can a smaller but potentially useful effect (0.05 ≤ \|b\| < 0.15) be excluded?** | the CI lies inside ±0.05 | **excluded** (too small to be useful) · **cannot be determined** (the data are compatible with a useful effect) |

The questions can combine:
- "Q1 yes, and Q2 ruled out" means a real but modest effect: probably a sizing input, not a filter.
- "Q1 no, Q2 ruled out, Q3 undetermined" is the expected NQ outcome. It means: no filter, and smaller effects remain open.

Each answer quotes the CI, so the reader can see how close it came. The headline line per instrument reads, for example:

> NQ: no evidence of an effect (p 0.4); large effect ruled out (CI −0.07 to +0.09); a useful smaller effect cannot be determined → UNDERPOWERED (large effect ruled out).

(The numbers in that line are invented to show the format.)

### 5.4 What `--mode controls` computes, and what it withholds

**Computed and reported for review (no real-alignment statistic anywhere):**
1. **Overlap validation (§3.2):** futures-file gross vs banked OANDA gross on matched nights 2016-10 → 2026-04:
   - correlation, mean and SD of the difference;
   - nights present in one set but not the other. This also checks that the night-building rule reproduces the banked night calendar.
2. **Data quality:**
   - extension nights built and dropped per year, and why (no entry or exit minute);
   - nights without an x;
   - the x distribution per era (should be close to uniform).
3. **Measured null SE:**
   - the SD of b across label shifts (≥ 63 nights from the real alignment);
   - the month-block bootstrap SD of b on shifted pairings;
   - the measured design effect against the iid formula;
   - the resulting MDE and expected CI half-width, against the analytic §5.1 numbers.
4. **Planted-effect detection.** On shifted x (never the real alignment), z + b_true (x_shift − ½) for b_true ∈ {0, 0.05, 0.10, 0.15, 0.20}, 200 base shifts each. The full §4.1 test is run on each (placebo p and bootstrap CI). Per b_true, the share that comes out as:
   - evidence (Holm first step α 0.025, and at α 0.05);
   - wrong sign;
   - large ruled out;
   - NULL (inside ±0.05);
   - uninformative.
   The b_true = 0 row is the false-positive rate. The b_true = 0.15 row is the pre-registered positive control.
5. Unconditional, banked-sample-only figures used for the threshold translation: mean z and SD of z, 2016+, per instrument.

**Withheld until `--mode score`:**
- b on the real alignment, in any subset;
- bucket means, costs by regime, the raw-% slope;
- era-level means;
- every Group A/B check.

## 6. Multiplicity

- **Scored:** H1, H2. Holm at α 0.05. The credibility checks (§4.2) are not extra tests: they can only demote an effect, never create one, so they need no correction.
- **Described:**
  - buckets, raw slopes, costs and years carry no pass/fail weight;
  - the three secondary vol definitions feed check B3 only.
- **Ledger level:** the result is placed against the trial ledger (262 tested claims) by `build_trial_ledger`.
- **Anything that would size a live position** needs |t| ≥ 3 and a forward record. That is a later, separate prereg.

## 7. What this does NOT test

- **A trading rule.** No filter, size change or stand-aside is backtested here. That comes only if the relationship is established (owner, 2026-11-02).
- **VIX, GVZ or other implied/stress measures.** Those are follow-ups ("beyond realised vol, does implied add anything?"), conditional on this result.
- **The direction of volatility** (rising vs falling). That is experiment 2-bis, and it must control for past returns.
- **The previous US-session return and the pre-FOMC night.** Experiments 2 and 3, each with its own prereg.
- **Gold before 2015-11** (no local data; owner option §3.2).
- **Why** any relationship exists (cause).

## 8. What each verdict changes

- **VALIDATED (Q1 yes, Group A holds):**
  - The flat expectation is rejected.
  - A positive b points at the inventory premium, and makes experiment 2 (the previous US-session return) the obvious mechanism test. If B2 reads "explained by recent returns", experiment 2 becomes the lead rather than the follow-up.
  - A negative b gives vol-managed sizing on the overnight hold a case: a separate prereg, scored on post-cutoff nights.
  - Whether it is a filter or a sizing input is read from Q2 and the §5.2 break-evens. No rule is built here.
- **UNDERPOWERED, effect concentrated:** the pattern and the failing check are recorded. It is not treated as a relationship. Nothing is built on it.
- **UNDERPOWERED, large effect ruled out (expected for NQ):**
  - No simple vol-regime filter for the overnight hold. Vol sizing stays a drawdown tool (as in `vol-target`).
  - Smaller effects stay open (Q3). They can only be settled by pooling instruments or by a forward record.
  - Move on to experiment 2.
- **UNDERPOWERED, uninformative (possible for gold):** recorded honestly. Gold vol conditioning waits for more data: the OANDA history pull (deferred by the owner) or the forward record.
- **NULL (unreachable here, §5.2):** a vol relationship too small to be useful; the question is closed for this instrument.
- **Every verdict:**
  - banked with a POWER row and the Q1–Q3 answers;
  - the trial ledger regenerated;
  - the register row moved to BANKED;
  - the bucket tables added to the Overnight Hold page as description.

## Amendments

(none)

## RESULTS

(not run)
