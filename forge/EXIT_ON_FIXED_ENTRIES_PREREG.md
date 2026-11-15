# exit-on-fixed-entries — on the same entries, which exit earns more R than it earns on random entries?

**Pre-registered 2026-11-14, before any outcome was computed.** No market data was read for this document: the M1
caches are not in the container where it was written. The power table comes from a simulation on synthetic paths
(§5), which reads no outcome.

| | |
|---|---|
| ID / ledger id | `exit-on-fixed-entries` (the scored family, one cell per exit); `exit-on-fixed-entries-map` (the MFE/MAE map, descriptive, banked as `context`) |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` |
| Register row | `plans/RESEARCH_REGISTER.md` → `exit-on-fixed-entries` |
| Source card | daily-bias agenda Q7, Part 2 (`.claude/skills/research-director/agendas/daily-bias.md`) |
| Data | OANDA M1 with bid/ask, `data/m1_bidask/<key>_m1.parquet` (mid OHLC for paths, signals and σ; bid/ask for fills). Keys: `gold, eurusd, gbpusd, usdjpy, usdcad, audusd, nzdusd, usdchf, eurjpy, gbpjpy, nq, spx, dow` (= the 13 instruments of `scripts/h4-trend-hold/backtest.py`: GOLD, 9 FX, NAS100, SPX500, US30). Entries from the first London session with 400 closed H1 bars and 21 NY-close daily bars (≈ 2016-11-21) to the last entry whose 5-session path ends by **2026-08-21** (entry ≤ 2026-08-17). Nothing after the lockbox date is read |
| Seed | `20261114` (every script in this study) |
| Uncertainty | entry-date block bootstrap (all instruments of a London date move together), block = 21 London sessions, B = 2000; checked against a shifted-side placebo (§3.8) and the larger SE is used |
| Scripts / outputs | `scripts/exit-on-fixed-entries/` → `analysis/output/exit-on-fixed-entries/` |
| Harness | own Python script (`run.py`, with `selftest.py` for the synthetic positive control). `runStudy.mjs` and `study.mjs` handle neither multi-day path exits nor bid/ask fills |
| Run | laptop (M1 there): `python -I scripts/exit-on-fixed-entries/selftest.py`, then `python -I scripts/exit-on-fixed-entries/run.py` |

## 1. The claim (required)

Daily-bias agenda Q7, from the owner's question "what would improve the bias so we can take the trade and hold?":

> Fix the entries (desk side, the blend, Max's sides, and random entries as the control). Map each one's MFE/MAE path
> over five days first, then compare exits: 21:00 close, hold while the bias holds, trail behind the prior day's low or
> high, a fixed N-day time stop, half off at 1R with the rest trailed.

Falsifier on the card: *the best exit beats the 21:00 close by no more than it does on random entries.*

The question is not "which exit makes the most R" but **which exit adds R that depends on the entry having a side**.
Method lesson #27 (`education/RESEARCH_METHOD_LESSONS.md`): a management rule cannot create edge on an entry with no
drift; on a zero-edge entry every exit comes out ≈ 0R less its costs, and only the win rate and payoff change. So each
exit is read as its gain over the 21:00 close on the real entries **minus** the same gain on random entries taken at
the same instrument, day and time. That difference-in-differences is the only scored quantity.

**Scope of entry sources (decided here).**

- **(a) 4h EMA20-slope side at 07:00 London**: the rule of `scripts/h4-trend-hold/backtest.py`. **Scored.**
- **(b) Day-one-confirm side** (Q6, `hold-day-one-confirm`): **left out**, for three reasons. (1) Its entry rule is
  not frozen: its prereg is being written in parallel in this checkout and is not registered, so any definition here
  would be chosen before or alongside its own result, and choosing it after Q6 reads would be a selected entry.
  (2) It enters at 21:00 on day one, so the 21:00-close baseline does not exist for it; it would need a different
  baseline (next 21:00) and a different random control, which makes it a separate family. (3) Adding it would double
  the Holm family for an entry that may turn out to have no continuation. If Q6 banks a continuation candidate, the
  follow-up is a new slug `exit-on-fixed-entries-d1confirm`, registered with the same exits and control.
- **(c) Random entries**: the control (§3.6), not a source.
- **Out of scope, forward-only:** the desk side, the Global Read / macro blend (`macro-h4-blend`; macro history starts
  2026-10-14), Max Cole's sides and his own exits (Signal Copier record from 2026-10-07). None has history before the
  lockbox date. They belong in the bias-scoreboard forward record (agenda Q4), not here.

Edge source (lesson #4): if an exit passes, the source is trend persistence over 1–5 days (slow repositioning) that
a 21:00 close cuts off. The exit itself is not a source of edge.

## 2. Why it is not already settled (required)

- **`h4-trend-hold`** (EXPLORATORY, not banked, 2026-11-14): the same entry loses (DAY −0.042R, HOLD −0.107R a trade
  over 2026-02-26 → 2026-08-20). It compared one hold rule with the 21:00 close, on nine months, with the "enter only
  when flat" rule (so the two variants had different entry sets), a flat 0.03R cost, and no random-entry control. It
  cannot say whether holding is worse *because of the entry* or simply costs more. This study uses ten years, one
  fixed entry set for every exit, real bid/ask fills and the control lesson #27 requires.
- **`noise-area-momentum-stop`** (UNDERPOWERED, 2026-11-13): a trailing stop on ES/NQ intraday momentum; different
  instruments, intraday only, a different trail. Its decomposition already showed exits mostly reshape risk.
- **`daily-open-fib-retest`** (NULL) and **`range-edge-limit-fade`** (NULL): break-even and 1:1 vs 2:1 targets on
  zero-edge entries changed win rate, not mean, which is lesson #27 seen in data. Neither tested multi-day exits.
- **`overnight-hold-*`** (NQ/gold UNDERPOWERED, GBPUSD NULL, USDJPY UNDERPOWERED): fixed-time overnight holds with no
  directional signal; they priced spread and financing, which this study reuses.
- **`stress-filter-hold-*`**: hold vs flat by stress state, not exits.
- **`post-fomc-usd-drift`** (VALIDATED, FRAGILE): multi-day drift after one event family; event days are only a
  descriptive split here.

No banked entry compares exits on fixed entries against a random-entry control. This is not a re-run of a banked null.

## 3. Definitions, fixed in advance (required)

### 3.1 Sessions, bars and σ (data-rules)

- Session = London calendar date; window `london22` (00:00–22:00 London); weekends excluded. All clock times are
  Europe/London, so BST/GMT changes move the UTC times.
- H1 mid bars are built from M1 mid by UTC hour (as the dashboard OANDA H1 feed the h4 script read).
- **σ** = sample SD of the last 20 daily log returns of NY-close (17:00 New York) daily bars built from M1 mid, using
  only bars closed before the entry (`nyCloseDailyBars`, n ≥ 60 rule for the bar series; first σ needs 21 closes).
  *Deviation from the h4 script*, which sampled closes every 24h back from the entry time: data-rules item 2 requires
  NY-close bars. 1R = σ × entry mid price.

### 3.2 The entries (fixed, one set for every exit)

- Every weekday London session, every instrument, at **07:00 London**: side = sign of the 4h EMA20 slope, exactly as
  `S.slope()` in `scripts/h4-trend-hold/backtest.py`: 4h buckets aligned to 00/04/08… UTC from H1 bars closed by
  07:00 (the current bucket partial, holding the latest closed H1 close), EMA20 (k = 2/21) over the last 320 H1 bars'
  buckets, slope = EMA now − EMA of the series without its last 3 buckets; at least 400 closed H1 bars. Slope 0 → no
  entry.
- **Deviation from the h4 script, required by the question:** an entry is taken every eligible day **whether or not
  an earlier entry is still open** (the h4 script entered only when flat, which made the entry set depend on the
  exit). Positions overlap; the bootstrap blocks by date (§3.7) and the power table counts the overlap.
- Entry fill: the first M1 bar at or after 07:00 London, at its **ask open (long) / bid open (short)**. No 07:00 bar
  (holiday, data gap) → no entry, counted.
- Stop (all exits): **1R from the entry fill**, on the exit-side quote (long: bid low ≤ stop; short: ask high ≥ stop),
  checked on every M1 bar. Fill at the stop level, or at the bar's exit-side open if it gapped through (weekend and
  session gaps included).
- Entries per instrument-day with no σ or a missing quote are dropped **and counted**, by reason.

### 3.3 The path map (step 1, descriptive: `exit-on-fixed-entries-map`)

For every entry, from the entry fill to 21:00 London of session 5 (session 1 = the entry day), ignoring the stop:
MFE and MAE in R (on the exit-side quote) at the end of each session 1–5, and the signed R at each 21:00. Reported
for the slope entries, for the random control (§3.6) and for the counter-slope side, as quantiles (10/25/50/75/90),
means with CIs, the share reaching +1R before −1R, and time to MFE. Produced and written to its own table **before**
the exit table is computed in the same run. It carries no pass/fail weight.

### 3.4 The exits (every exit applies the 1R stop; every position is closed by 21:00 London of session 5)

| Code | Exit | Rule |
|---|---|---|
| **E0** | 21:00 close (baseline) | exit at the first M1 bar at/after 21:00 London of session 1, exit-side open |
| **E1** | hold while the slope holds | at each 21:00 review (sessions 1–4) re-read the 4h slope from H1 bars closed by 21:00 (same reading as entry); hold if its sign equals the sign at entry, else exit at that 21:00. **Friday flat:** a Friday review always exits (as the h4 script). Session-5 21:00 exits |
| **E2** | trail behind the prior day's low/high | from 00:00 London of session 2, the stop of a long is max(current stop, low of the previous session's `london22` window, mid bars); a short uses the previous high. Re-set at the start of each session; only tightens. If the new level is already through at 00:00, exit at that bar's exit-side open. Session-5 21:00 exits. Weekends are held (no Friday flat) |
| **E3-2, E3-3, E3-5** | N-day time stop | exit at 21:00 London of session N (N = 2, 3, 5; sessions = London trading days, weekends held) unless stopped |
| **E4** | half off at +1R, trail the rest | close half when the exit-side quote reaches entry + 1R (fill at the level); the other half follows E2 (initial stop, then the prior-day trail; no break-even move). If E2's exit comes before +1R is touched, the whole position exits there. In a bar that touches both +1R and the stop, the stop is taken first |

No other exits, no parameter sweeps. Weekend holding for E2–E4 is part of the rule as written; an "everything
Friday-flat" version of E2–E4 is a **descriptive** sensitivity.

### 3.5 Costs (data-rules: spread at the fill minute; never a flat table)

- **Spread:** every fill is at the bid or ask of its own M1 bar from `data/m1_bidask` (OANDA practice pricing,
  standard spread-only account, no commission). So the spread is paid once per round trip, and E4 pays an extra half
  spread on its partial. For reference only, the median / p90 close spreads in `analysis/output/costs/BIDASK_QUALITY.md`:
  EURUSD 1.4/1.7 pips, GBPUSD 1.9/2.4, USDJPY 1.5/2.0, USDCAD 1.8/2.3, AUDUSD 1.4/1.6, NZDUSD 1.6/2.0, USDCHF 1.6/2.1,
  EURJPY 1.9/2.9, GBPJPY 2.9/4.0, gold 0.316/0.727 (price units), NQ 1.7/2.5, SPX 0.5/0.5, Dow 2.5/3.8 (index points).
  Spreads widen at 21:00–23:00 London rollover; the exits at 21:00 take that bar's real quote.
- **Financing (second layer, reported, not in the primary):** per rollover held (17:00 New York; Wednesday × 3 for FX
  and gold, none on index CFDs' triple), OANDA long/short financing rates from the 2026-10-20 snapshot
  (`instrument_meta_log.parquet`), held constant over history, as `overnight-hold-fx`. The primary metric is net of
  spread only, because the random control has the same instrument, days and side mix, so its financing ≈ cancels
  in the difference-in-differences; the snapshot-held-constant model would add an assumption for little gain. The
  spread-plus-financing version of every scored number is reported next to it, and a cell whose sign changes with
  financing is flagged.
- **Mid + 0.03R flat** (the h4 script's cost) is reported as a reconciliation row only.

### 3.6 The control and the scored statistic

- **Random entries (the control):** same instrument, same session, same 07:00 fill time, same σ and stop; the side is
  a coin with P(long) = the slope source's long share **on that instrument over the sample** (side mix matched; this
  share is counted from signals, not outcomes). The control is computed as the **exact expectation over the coin**
  (each exit evaluated for both sides on the same path, weighted p / 1 − p), which is what infinitely many random
  draws give, with no Monte Carlo noise. One seeded realised random book (one coin per entry, seed 20261114) is kept
  for the distribution tables (win rate, payoff, tail share).
- For entry i and exit x: D_i(x) = R_i(x) − R_i(E0) on the slope side; Dr_i(x) = p·[R_long(x) − R_long(E0)] +
  (1 − p)·[R_short(x) − R_short(E0)].
- **Scored statistic per exit:** **Δ(x) = mean_i [ D_i(x) − Dr_i(x) ]**, in R per entry, spread costs on.
  Note: with p ≈ 0.5 this is about half the gap between the slope side and the counter-slope side, so Δ = +0.05R
  means the exit gains ≈ 0.10R more on the trend side than on the counter-trend side.
- **Lesson #27 check (design validity):** mean Dr(x) should equal the exit's extra cost (spread differences) plus ≈ 0.
  Any |mean Dr(x) − its cost difference| > 3 SE is reported as a design fault and the runner stops before Δ is read.
- **Mirror:** the counter-slope side. Against the two-side control it is a mechanical function of Δ (−p/(1 − p)
  times it), so it is reported, not scored.

### 3.7 Uncertainty

- Entry-date block bootstrap: resample blocks of 21 consecutive London sessions (all instruments of those dates
  together; an entry's whole 5-session path goes with its entry date), B = 2000, seed 20261114. Two-sided p from the
  bootstrap distribution (percentile; `pFromCI` normal approximation reported beside it).
- Lesson (fx-short-term-fair-value, swing-walk-track): date-block bootstraps can understate the SE of a persistent
  signal. **Shifted-side placebo:** circularly shift each instrument's slope-side series by the same random offset of
  21–250 sessions (500 shifts, seed 20261114), keeping its run lengths, and recompute Δ(x). Report the real Δ's
  percentile in the shift distribution. **SE used for the gate = max(bootstrap SE, SD of the shift distribution)**,
  and p = the larger of the bootstrap p and the two-sided shift-placebo p.

### 3.8 Sample, halves and splits

- Sample: §header. Expected ≈ 13 × 2,450 ≈ 32,000 entries (slope 0, missing σ or quotes removed and counted).
- Halves: split at the median entry date of the entry list (computed from entries, not outcomes; ≈ 2021-09).
- Descriptive splits (BH q = 0.10, `chanceBaseline`): group (gold / FX / indices) and each instrument; σ regime (σ vs
  its own trailing 250-session median: above / below); event day (a tier-1 US release — CPI, NFP, PPI, FOMC — on the
  entry session or the next, from `load_calendar()` deduplicated per data-rules fault #11; sessions after calendar
  coverage are `unknown` and excluded from this split); year.

### 3.9 Checks run before any outcome table is read

1. `node scripts/data_integrity.mjs` and the bid/ask quality report: state what is stale or missing.
2. **Positive control (lesson #1), `selftest.py`:** the exact `run.py` exit and scoring code on synthetic M1 paths.
   (a) Zero drift: every Δ within ±3 MC SE of 0, and mean Dr(x) = its cost difference. (b) Closed form: a constant
   planted drift of +m R per session in the entry-side direction, stop moved to 100R: E3-N − E0 must recover
   m × (N − 1) (gross) within 2 SE. (c) Planted momentum (§5, μ = 0.10R/day): Δ(E3-5) ≈ +0.08 must be recovered. A
   failure stops the run.
3. **Reconciliation:** E0 on the slope entries over 2026-02-26 → 2026-08-20, mid + 0.03R, against `h4-trend-hold`
   DAY −0.042R. Expected to differ a little (M1 vs dashboard H1, NY-close σ, no flat rule); a gap above 0.03R is
   explained before going on.
4. Join by date: assert each instrument's bars are read at their own London dates (lesson 2026-10-24); count misses.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Map: do slope entries have more favourable MFE/MAE over 1–5 sessions than random entries? | **Null**: the h4 rule lost before the lockbox; MFE/MAE ≈ the control's, within ±0.03R at each session |
| b | Δ(E1) slope-hold | **Null**, perhaps negative (the h4 HOLD variant lost more than DAY) |
| c | Δ(E2) prior-day trail | **Null** |
| d | Δ(E3-2), Δ(E3-3), Δ(E3-5) | **Null**; if anything, rising with N (only if 4h trends persist for days, which `fx-factor-momentum` could not show) |
| e | Δ(E4) half at 1R + trail | **Null**, smallest |Δ| of the family (half the position leaves early) |
| f | Raw R per exit on slope entries | all ≈ 0 or slightly negative after spread; lesson #27 says raw differences between exits will mostly be cost and payoff shape |
| — | **THE GATE** (per exit) | Δ(x) ≥ **+0.05R**, Holm-adjusted p < 0.05 across the 6 exits (p as §3.7), Δ > 0 in **both halves**, and ≥ 2 of 3 groups (gold / FX / indices) with Δ > 0. All four, for that exit to pass |
| — | **THE MIRROR** | the counter-slope side; mechanically −p/(1 − p) × Δ against the two-side control; reported, not scored |

The best exit is the passing exit with the largest Δ; if several pass, report all, and the copier/desk card names the
one with the largest Δ only if its interval excludes the next one's point estimate, else the simplest of them
(E3 < E2 < E1 < E4 in complexity).

## 5. Power — what this design can and cannot find (required)

**Method.** No control-sample SD can be computed here (no M1 in this container), so the SE of Δ comes from a
simulation that reads no market data: 13 instruments, 2,500 sessions, 15-minute Student-t(4) increments scaled to
1 daily σ = 1R, one common factor (pairwise ρ = 0.3, loading signs random), 24-hour sessions, the exact entry,
partial-bucket slope reading, stop, exits E0–E4, two-side control, 0.015R per fill. 200 replications; Δ's SD across
replications is the true SE (overlap and cross-instrument correlation included). Scratch script, not part of the
study: it was run once to set this table. ≈ 32,000 entries per replication.

| Cell (exit) | Planned n | SD of Δ_i (entry) | MC SE of Δ (ρ 0.3) | Date-block bootstrap SE (1 rep) | Effective design effect (SE² ÷ iid SE²) | **MDE**, 80% power, α = 0.05/6 (Holm first step), SE × 3.48 | MDE with SE × 1.5 for real-data vol clustering, σ error and weekend gaps | Pass bar | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| E1 slope-hold | ~32,000 | 0.72 | 0.0072 | 0.0072 | ≈ 3.2 | 0.025R | 0.038R | +0.05R | POWERED |
| E2 prior-day trail | ~32,000 | 0.83 | 0.0063 | 0.0073 | ≈ 2.5 | 0.025R | 0.038R | +0.05R | POWERED |
| E3-2 | ~32,000 | 0.73 | 0.0049 | 0.0052 | ≈ 1.6 | 0.018R | 0.027R | +0.05R | POWERED |
| E3-3 | ~32,000 | 0.93 | 0.0074 | 0.0083 | ≈ 2.5 | 0.029R | 0.043R | +0.05R | POWERED |
| E3-5 | ~32,000 | 1.15 | 0.0106 | 0.0120 | ≈ 3.5 | 0.042R | **0.063R** | +0.05R | POWERED on the simulation; **at risk** with the 1.5× allowance |
| E4 half + trail | ~32,000 | 0.62 | 0.0044 | 0.0050 | ≈ 2.2 | 0.017R | 0.026R | +0.05R | POWERED |

(MDE uses the larger of the two SEs.) Zero-drift means of Δ across 200 replications were all within ±0.002R of 0.
**Sensitivity, ρ = 0.5** (60 replications): MC SE E1 0.0105 / E2 0.0076 / E3-2 0.0062 / E3-3 0.0089 / E3-5 0.0130 /
E4 0.0054, so MDE 0.037 / 0.026 / 0.022 / 0.031 / 0.045 / 0.019R: all under the bar without the 1.5× allowance, and
E3-5 (0.068R) and E1 (0.055R) over it with the allowance. Those two are the cells the binding rule below may demote.

**What +0.05R means (planted-momentum check, same simulation).** A momentum process with drift μ per day in the
direction of the current 4h slope gave Δ = E1 +0.032 / E2 +0.021 / E3-2 +0.019 / E3-3 +0.024 / E3-5 +0.041 / E4
+0.015 at μ = 0.05R/day, and +0.065 / +0.047 / +0.039 / +0.056 / +0.081 / +0.033 at μ = 0.10R/day. So the bar
+0.05R is met only if 4h trends carry about 0.1σ a day of drift on the trend side, which is roughly what a tradable
multi-day hold would need after costs. A smaller drift (0.05σ/day) would not pass any exit: this design rules out
**material** gains, not small ones. That is intended: a gain under 0.05R per trade does not change the desk.

**Binding power rule (run time, before Δ is read):** the runner computes the shifted-side placebo SD for each exit
first (it uses the real paths but not the real side alignment, so it is a control-sample SD as the template allows).
Any exit whose MDE = 3.48 × max(shift-placebo SD of Δ, date-block bootstrap SE of Δ under shifted sides) exceeds 0.05R is marked
**UNDERPOWERED by design** in `results.json` before its Δ is printed. E3-5 is the cell most likely to fall there.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells:** 6 — Δ(E1), Δ(E2), Δ(E3-2), Δ(E3-3), Δ(E3-5), Δ(E4), one entry source. Everything else (the map,
  raw R, win rates, payoff, tail share, groups, instruments, σ regime, event days, years, financing and Friday-flat
  sensitivities, the reconciliation) is descriptive.
- **Family-wise:** Holm at α = 0.05 across the 6 exits (`holm`), on p = max(bootstrap p, shift-placebo p). The halves
  and groups conditions are conjunctive on top.
- **Disaggregation:** BH q = 0.10 over instrument × exit and regime × exit slices, with `chanceBaseline`. A surviving
  slice is a candidate for its own prereg, never a result.
- **Promotion (live):** a passing exit that would change the copier or a live position needs |t| ≥ 3 on its Δ
  (Harvey–Liu–Zhu), else it stays research-only until a forward record confirms it.
- Variants: none beyond §3.4. N ∈ {2, 3, 5} is the only sweep and all three are in the family.

## 7. What this does NOT test (required)

- **Whether the slope entry makes money.** Raw R is reported; the scored quantity is the exit's gain beyond random.
  A passing exit on a losing entry can still lose money overall.
- **Forward-only sources** (desk, macro blend, Max's sides and exits): out of scope (§1).
- **Day-one-confirm entries:** left out (§1); a separate slug if Q6 finds continuation.
- **Other entry times, stop widths, trail definitions, targets.** One stop (1σ), one entry time (07:00), the exits
  as written.
- **Execution beyond OANDA bid/ask:** no slippage beyond the quoted spread, OANDA practice pricing, not the MT5
  broker; financing from one snapshot held constant.
- **Causation or the post-lockbox period:** nothing after 2026-08-21 is read.

## 8. What each verdict changes (required)

- **VALIDATED (an exit passes):** ledger `exit-on-fixed-entries` validated, naming the exit(s) and Δ. The desk card
  and the Signal Copier get a named exit rule for slope-side trades, research-only until |t| ≥ 3 or a forward record.
  Agenda Q9 (do trends last longer in some regimes?) inherits that exit as its hold outcome.
- **NULL (powered exits all fail):** ledger null. The desk keeps a **21:00 close**: holding, trailing or scaling out
  on the 4h-slope entry adds risk and reshapes payoff, not mean. The page stops saying (or never starts saying) that
  the bias should be "held". Exits are only worth retesting on an entry with demonstrated drift (Q6, Q8).
- **UNDERPOWERED (a cell above the bar by the binding rule, or the whole family):** recorded as such; the remedy is
  more instruments (the 34 bid/ask keys) or the forward record, not a re-cut of this sample.
- **Map (`exit-on-fixed-entries-map`):** banked as `context` whatever the exits do.

## Amendments

### A1 — 2026-11-14 — PRE-RESULTS
Runner details fixed while writing `scripts/exit-on-fixed-entries/run.py`. No real data had been read: M1 is not in this
container, and only `--selftest` synthetic paths were scored.
1. **Stricter planted check in the selftest.** A 0.20R/day planted momentum must pass the full gate. This is a code
   check only, not a scored cell.
2. **Reconciliation stop.** Before any Δ is scored, the 21:00-close baseline is reconciled with the exploratory
   `h4-trend-hold` DAY variant on the same entries. The run stops if the gap is above 0.03R, unless
   `--ack-reconciliation` is given; RESULTS.md must then explain the gap.
3. **Continuous synthetic paths.** The selftest uses continuous paths, because a coarse random walk with stops filled
   at their level biased both sides by about +0.005R at the 21:00 close.

None of this changes an entry, an exit, the metric, the gate or a pass bar.

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/exit-on-fixed-entries/RESULTS.md` and `results.json` (seed 20261114). Nothing above this
line changes after the run.*
