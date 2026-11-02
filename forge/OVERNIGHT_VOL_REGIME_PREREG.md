# overnight-vol-regime — does the overnight hold's risk-adjusted return change with the volatility regime it is entered in?

**DRAFT for owner review, 2026-11-02. Not yet registered. No conditional outcome has been computed.**

What has been computed so far, all of it unconditional, which the template allows:
- per-night SDs;
- the unconditional SD of the vol-normalised return;
- the autocorrelation of the volatility percentile (which uses prices only);
- data coverage.

Registration happens when the owner approves this text. The approval date is then written here and committed **before** any script runs.

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
| Stability check | the split point between the two data sources is also the era split (§4 gate). A source artefact would show as the two eras disagreeing. |
| Not done | gold: no local gold minute data before 2015-11 (OANDA M1 and the GC futures both start there). Gold stays at 1,962 nights. Owner option: pull OANDA mid M1 for XAU back to ~2005 (free API, gross only) before registering. |

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

**THE GATE (for VALIDATED on H1 or H2), all of:**
1. Holm-adjusted placebo p < 0.05, and the bootstrap CI excludes 0.
2. **Same sign in both eras:**
   - NQ: 2009-01 → 2016-10 (futures extension) vs 2016-10 → 2026-08 (banked);
   - gold: 2016-10 → 2021-08 vs 2021-08 → 2026-08.
3. **Not a handful of nights:** the sign holds with the 10 largest |z| nights removed. The number of nights it takes to flip the sign is reported.
4. **Not one episode:** the sign holds with 2020 and 2022 removed.
5. **Gradual:** the quartile mean z moves in the slope's direction in at least 2 of the 3 steps.
6. **Not a simple-feature effect:** with the previous 5-day return and weekday added as controls, b keeps its sign and at least half its size.
7. **Not one definition:** at least 2 of the 3 secondary vol definitions give the same sign.

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

### 5.2 Underpowered vs too small to matter

A result that isn't significant can mean two very different things. **The confidence interval tells them apart, not the p-value.** "p = 0.4" looks the same in both cases.

Two sizes are fixed **now**, before any data:
- **Smallest effect of interest: |b| = 0.05.** This is a regime relationship that moves the expected return by about the size of the whole edge from the quietest to the busiest nights. For example, the edge is gone in one regime and doubled in the other. Anything smaller would not change how the trade is sized or filtered, even if it is real.
- **Large effect: |b| = 0.15.** This is the size a simple on/off regime filter would need to be worth building, about three times the edge.

Each outcome then reads like this:

| What the 95% CI does | What it means | Verdict word |
|---|---|---|
| Excludes 0, and the gate holds | evidence of a relationship | **VALIDATED** |
| Contains 0 and lies **entirely inside ±0.05** | the relationship is probably **too small to be useful**, real or not | **NULL** |
| Contains 0, extends beyond ±0.05 but **inside ±0.15** | a large effect is ruled out; a useful one is not | **UNDERPOWERED** (large effect ruled out) |
| Contains 0 and extends beyond ±0.15 | the data can't tell; even a large effect is possible | **UNDERPOWERED** (uninformative) |
| Excludes 0 but fails the gate | a pattern that may be one era, one episode or a few nights | **UNDERPOWERED**, with the failing gate item named |

**Said plainly, before running:**
- With the CI half-widths above (±0.08 NQ, ±0.13 gold), **NULL is unreachable for both instruments.** Even a true b of exactly 0 gives an interval wider than ±0.05.
- Ruling out a useful effect would need about 3× the NQ extended sample: roughly 10,000 nights, or 40 years.
- So the realistic outcomes are VALIDATED (only if the effect is large) or UNDERPOWERED. For NQ we will be able to say whether a **large** effect is ruled out.

That is still worth knowing: it decides whether a regime **filter** (which needs a large effect) is worth pursuing. It also tells us that smaller effects can only be settled by pooling instruments or by a forward record.

## 6. Multiplicity

- **Scored:** H1, H2. Holm at α 0.05. The gate's seven items are conjunctive, so no further correction is applied.
- **Described:**
  - buckets, raw slopes, costs and years carry no pass/fail weight;
  - the three secondary vol definitions feed gate item 7 only.
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

- **VALIDATED (b ≠ 0 with the gate):**
  - Flat expectation rejected. A positive b points at the inventory premium, and makes experiment 2 (previous US-session return) the obvious mechanism test.
  - A negative b gives vol-managed sizing on the overnight hold a case: a separate prereg, scored on post-cutoff nights.
- **UNDERPOWERED, large effect ruled out (NQ):** no simple vol-regime filter for the overnight hold. Vol sizing stays a drawdown tool (as `vol-target`). Move on to experiment 2.
- **UNDERPOWERED, uninformative (likely for gold):** record it honestly. Gold vol conditioning waits for more data (the OANDA history pull, or the forward record).
- **Every verdict:** banked with a POWER row, the trial ledger regenerated, the register row → BANKED, and the bucket tables added to the Overnight Hold page as description.

## Amendments

(none — draft)

## RESULTS

(not run)
