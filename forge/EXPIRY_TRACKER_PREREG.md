# expiry-tracker — does an option expiry's book lean mark which side of today's price that expiry settles on?

**Pre-registered 2026-11-01, before any outcome was computed.**

| | |
|---|---|
| ID / ledger ids | `expiry-pull-side` (P1, primary), `expiry-pull-build` (P2), `expiry-pull-flip` (P3) |
| Branch | `ccr-b1afba0f-vtpty4` |
| Register row | `plans/RESEARCH_REGISTER.md` → `expiry-tracker` |
| Data | CME options per contract per trade date from the Databento pulls in R2 `OI Data/<PAIR>.csv` (EUR_USD, GBP_USD, AUD_USD, USD_CAD, USD_CHF, USD_JPY, NAS100_USD from 2020-09; SPX500_USD from 2020-10), re-cut per expiry by `oi_research_book/scripts/40_expiry_track_history.py`. Prices: OANDA M1 cut into 17:00 New York daily closes (data-rules item 2). **Scored expiries settle on or before 2026-08-21** (lockbox). Expiries after that, from the live nightly capture (`archive/expiry_track/`, from 2026-07-31, which adds gold), are a forward record only (§3.9). |
| Seed | `20261101` (every script in this study) |
| Uncertainty | cluster bootstrap, cluster = expiry calendar month across all instruments, B = 2,000 |
| Scripts / outputs | `oi_research_book/scripts/41_expiry_pull_score.py` (the OI book keeps its numbered scripts) → `analysis/output/expiry-tracker/` (`RESULTS.md`, `results.json`) |
| Harness | own script: the unit is an expiry, not a session or a trade, so `runStudy.mjs` / `study.mjs` don't fit |

## 1. The claim (required)

The owner's idea (2026-11-01). Pin every listed CME expiry to its calendar date and read its book every night as it
counts down. If the book of an expiry sits mostly above price (more open interest at strikes above it), price is drawn
up into that date; if it sits below, down. Expiries then hand over: "5 DTE stronger to the downside, then 10 DTE showing a
stronger upside" means down into the near date, then up into the next. Building matters too: a zone that keeps growing
away from price marks where price is heading.

`swing-map.html` already draws this (the pull table, ▲/▼ per expiry, the Monte Carlo pull), tagged UNTESTED, with a pull
strength that was chosen, not fitted. This test decides whether that picture earns anything beyond context, and if so,
what the pull strength should be.

## 2. Why it is not already settled (required)

Nearest entries in `js/deskEvidence.js` and the register:

- **`max-pain` pin: refuted.** Price does not pin to max pain into expiry. Max pain is one point. This tests the
  *side* the whole book sits on, over 10–20 sessions.
- **Wall placebo: walls behave like ordinary levels.** Touch-and-react at single strikes, intraday. Not where a
  multi-week path ends up.
- **`hedge-flow`: NULL on size beyond the gamma sign, side UNDERPOWERED.** Next-session range and its side from the
  dealer flow schedule. Here the horizon is the expiry date, the feature is the OI location (not the dealer flow), and
  the sample is per expiry. `hedge-flow-side` being underpowered at the session level is a reason to try the longer
  horizon, not a banked null of it.
- **`oi-level-map` (exploratory): "walls with OI being built bounce more" is a pointer**, now in its own forward test
  (`oi-wall-building-forward`, touch level). P2 here asks a different question: does building above vs below say where
  the expiry settles, weeks out.
- **`gex-range-es`: validated on range size only.** Gamma sign → range size, not direction. Used here only as a
  covariate in the description.

Nothing in the ledger scores the side of an expiry's book against where price is at that expiry. This is not a re-run.

## 3. Definitions, fixed in advance (required)

**3.1 Instruments.** EURUSD, GBPUSD, AUDUSD, USDCAD, USDCHF, USDJPY, NQ (NAS100_USD), ES (SPX500_USD). Gold is not in
the Databento set and appears only in the forward record.

**3.2 Expiries.** Every expiry in the file that passes the floor at its read point: its total OI (all strikes within
35% of the forward F, below) is at least 10% of the instrument's total listed OI across all expiries that trade date.
The floor reads OI only, never an outcome. It drops thin weeklies and keeps the monthlies, quarterlies and any heavy
weekly.

**3.3 Knowable when.** OI for trade date D is public mid-session D+1 (`RESEARCH_BOOK.md` Part 13). The read session is
D+1. The start price S₀ is the New York close of D+1. `h` = sessions from the read session to the expiry date.
Read points: **h = 20** (P1 primary) and **h = 10** (P1 secondary, P2 outcome start). The expiry close S_E is the New
York close of the session containing the option's expiry timestamp.

**3.4 The reference price for "above/below".** The forward F of that expiry on D, from put-call parity on the CME
settlements at the strike where |C − P| is smallest: F = K + C − P (undiscounted; r·T is below 0.5% at these tenors).
This keeps strikes and the reference in the same futures terms with no basis guesswork.

**3.5 The lean (the setup).** Over strikes K with |K/F − 1| ≤ 0.35 and OI(K) = call OI + put OI, forward-filled at
most 5 trade dates (as `01_build_daily_dataset.py`):
- the centre C = Σ K·OI(K) / Σ OI(K); **pull** = (C/F − 1) in spot direction (sign flipped for USD/JPY, USD/CAD and
  USD/CHF, whose CME strikes are inverted);
- **shareAbove** = OI at strikes above F in spot direction ÷ OI above + below;
- **L = sign(pull)** when |shareAbove − 0.5| ≥ 0.05, else L = 0 (balanced, excluded from the score and counted).

**3.6 The outcome.** R_h = ln(S_E / S₀) in spot terms, divided by σ·√h. σ is the trailing 60-session stdev of New York
daily log returns, known at the read close. The score per row is **L·R_h** (positive = price settled on the side the
book leaned).

**3.7 The questions.**
- **P1, side.** Pooled mean of L·R₂₀ over every (instrument, expiry) row.
- **P2, build before move.** Over the read window from h = 20 to h = 10, B = (OI added at strikes > 1% above F) −
  (OI added at strikes > 1% below F), in spot direction, summed night by night on non-stale nights, ÷ the expiry's OI at
  h = 20. L_B = sign(B) when |B| ≥ 0.02, else 0. Score L_B·R₁₀ (outcome from the h = 10 read to expiry, so the build is
  fully known before the outcome window opens).
- **P3, the hand-over (the 5-vs-10-day idea).** Take each read session where the nearest floored expiry N is 4–10
  sessions out and the next floored expiry X is after N and within 30 sessions. Use only reads where both lean (L_N, L_X
  ≠ 0) **and** lean opposite ways. Score = (L_N·R(read→N) + L_X·R(N→X)) / √2, each leg σ-normalised over its own
  length. One read per N (the first session N is 10 sessions out, else the first that qualifies).

**3.8 Controls.**
- **Trailing-return control (required by the 2026-10-21 lesson).** OI centres lag price: after a fall, the book sits
  above price, so "leans up" partly means "price just fell". So every scored cell is also fitted as OLS
  R = a + b·L + c·z₂₀ + d·dev₂₀, where z₂₀ = the trailing 20-session log return ÷ σ√20 and dev₂₀ = (S₀ − 20-session
  mean close) ÷ (σ·S₀). The coefficient **b** is what the lean adds beyond momentum and mean reversion.
- **Expiry-shift placebo.** Within each instrument, circularly shift the lean series by k expiries for every k ≠ 0
  (k < the instrument's expiry count) and recompute the pooled mean. The real mean must sit at or above the 97.5th
  percentile of that all-shift distribution (not one shift: the 2026-10-21 lesson).
- **Strike-shift placebo (description).** Shift every strike by +1σ√h and by −1σ√h of price, recompute L and the
  score. It is reported to show how much of any effect is "OI sits near price" geometry.

**3.9 Sample and split.** Scored rows: expiries settling 2020-10-01 to 2026-08-21. Halves split at the expiry date
2023-09-01. The forward record covers live-capture expiries settling after 2026-08-21, run by the same script on
`archive/expiry_track/` and reported separately. It cannot pass or fail the verdict alone. It is read once at ≥ 30 rows.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| P1 | Pooled mean L·R₂₀ > 0 (price settles on the side the book leaned 20 sessions earlier) | **Null.** Walls behave like ordinary levels and max pain doesn't pin, so a side effect of ≥ 0.25 is not expected |
| P2 | Pooled mean L_B·R₁₀ > 0 (building away from price, before the move, marks the side) | **Null**, held loosely: building is the one OI pointer still open (`oi-level-map`) |
| P3 | Pooled hand-over score > 0 | **Null**, and probably underpowered (§5) |
| **THE GATE** (per cell) | All four: (a) mean ≥ **0.25** (σ√h units, the pass bar; ≈ a 60% side hit under a normal outcome) with Holm-adjusted p < 0.05 from the cluster bootstrap; (b) the trailing-return-controlled b > 0 with a 95% CI excluding 0; (c) mean > 0 in both halves; (d) real mean ≥ 97.5th percentile of the expiry-shift placebo | |
| **THE MIRROR** | The same gates with the sign reversed (price settles *against* the book: OI as a fade). A mirror pass is its own result (`expiry-pull-side-fade`), not a P1 pass | **Null** |

## 5. Power — what this design can and cannot find (required)

SD of L·R is 1.0 by construction under a random walk (R is σ-normalised). The count-first pass (counts and the control
SD only, no outcome) will replace the planned n, SD and design effect before the run, and the cell verdict is set from
those numbers. Design effect: rows in the same expiry month share the dollar and equity factor; m ≈ 8 rows per month
cluster, ρ ≈ 0.35 (the repo's cross-instrument σ-error correlation is 0.47 for FX; equity vs FX is lower), deff =
1 + 7·0.35 ≈ 3.45. Helper: `mdeMeanDiff` in `js/preregStats.js`, 80% power, two-sided, at the Holm worst-case α = 0.05/3.

| Cell | Planned n (rows) | SD | Design effect | **MDE** | Pass bar | Verdict |
|---|---|---|---|---|---|---|
| P1 side, h = 20, pooled | ~567 (≈ 71 monthly cycles × 8) | 1.0 | 3.45 | **0.252** | 0.25 | **POWERED only if count-first n ≥ 567 at deff ≤ 3.45**; heavy weeklies passing the floor raise n (n 1,500 at deff 5 → MDE 0.187) |
| P2 build, pooled | ~567, minus rows where B is under 0.02 in size | 1.0 | 3.45 | ≥ 0.252 | 0.25 | Borderline; same rule |
| P3 hand-over, pooled | ~200 opposite-lean reads, likely fewer | 1.2 (two legs) | 3.45 | **0.51** | 0.25 | **UNDERPOWERED by design.** Run and reported as a description; it cannot be NULL. A P3 slice that looks large becomes the prereg for the forward record |

What this cannot find: a side effect of 0.1σ√h (≈ 54% hit) on any cell. A real but small pull would come back
UNDERPOWERED or NULL-with-wide-CI, and the write-up must say which.

**Positive control before the run (2026-10-21 lesson).** Plant a known lean effect into the real rows: add 0.25·L·σ√h
to the realised outcome on a copy of the data, then run the exact pipeline, including the trailing-return OLS and the
placebo. It must recover ≥ 0.20 and pass the gate. If it doesn't, the pipeline is fixed before any real number is read.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells:** P1, P2, P3. Holm at α = 0.05 across the three. P3 is underpowered by design but stays in the family
  so P1 and P2 pay for it.
- **Each gate is conjunctive** (bar, controlled b, both halves, placebo percentile), so no further correction inside a
  cell.
- **Disaggregation (BH q = 0.10, with `chanceBaseline`):** P1 at h = 10; P1 per instrument (8); FX vs indices; lean by
  `shareAbove` instead of the centre; gamma regime of the expiry (PIN / BREAKOUT, from `fullBookGex` at the read, flat
  σ); expiry type (monthly / quarterly / weekly); |pull| terciles. About 20 slices. A slice that survives BH is a
  *candidate* for its own prereg, never a result.
- **Promotion bar:** anything that sets a live pull strength or sizes a position needs |t| ≥ 3 on P1 or P2, or a passing
  forward record.

## 7. What this does NOT test (required)

- **Tradability.** No entries, stops or costs. A pass says the side is informative, not that a trade on it pays.
- **Path.** Only where price is at expiry, not the route (the Monte Carlo's dip-then-rise shape is not scored, except
  as P3's two-leg sum).
- **Pinning.** Distance to a strike at expiry is not scored (max pain is already refuted).
- **Cause.** A pass would not show that dealer hedging moves price. It could be informed positioning. The test can't
  tell them apart.
- **Gold, silver, crosses, Cboe ETF options.** Not in the scored data. QQQ/SPY books dwarf CME NQ (data-rules), so an
  index null on CME books does not settle the question for the whole option market.
- **Intraday or session effects.** Covered elsewhere (`hedge-flow`, wall tests).

## 8. What each verdict changes (required)

- **P1 or P2 VALIDATED.** Ledger entries `expiry-pull-side` / `expiry-pull-build`. On `swing-map.html` the pull table's
  tag goes from UNTESTED to VALIDATED for that cell only. The Monte Carlo pull strength k is replaced by a fitted value:
  the k at which `js/swingPaths.js` reproduces the controlled coefficient b on the same rows (fitted on the first half,
  checked on the second). Live use still needs |t| ≥ 3 or the forward record.
- **NULL** (MDE ≤ bar, CI upper < bar). The pull table and ▲/▼ arrows stay as description, tagged NULL with the ledger
  link. The Monte Carlo pull defaults to **off**, with "a tested null" next to the selector.
- **UNDERPOWERED.** The tag stays UNTESTED and the page says the history was too short. The forward record carries on,
  and a re-score is due when the live capture adds enough expiries to reach the MDE (P1 needs about 300 more
  monthly-equivalent rows).
- **P3 description.** It goes in the RESULTS file. If it is large, it becomes the prereg for the forward record (fresh
  data). It never changes the page's tags on its own.

## Amendments

*(none)*

---

## RESULTS — run <YYYY-MM-DD>

*Appended below this line, or written to `analysis/output/expiry-tracker/RESULTS.md`. Nothing above it changes after the
run.*
