# portfolio-book-prop — run the Portfolio Book (CFD-tradeable, all haircuts) through the FTMO 2-step prop replica: how often is it funded, what is an attempt worth, and how much of that is edge rather than luck?

**Pre-registered 2026-11-04, before any prop simulation of this book was computed.** Not blind on the input: the
book's daily stream is the banked `portfolio-book-validate` "all haircuts, CFD-tradeable only" book (Sharpe **0.21**,
CAGR 1.7%, max DD 41.7%, IS −0.16 / OOS 0.64, 12/19 years up). Its prop behaviour has never been computed.

| | |
|---|---|
| ID / ledger id | `portfolio-book-prop` (context; one entry) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `portfolio-book-prop` |
| Data | the Portfolio Book build (`scripts/portfolio-book/build.mjs`, feature store `px_d1_*`, OANDA mid closes) with the validate transforms (one-day delay, CFD financing, no NAS100, no FOMC). Intraday lows/highs: NY-close daily bars from M1 (`analysis/output/ladder_candidates/d1/<NAME>.json`), which start 2016-01-04. Window for the prop cells **2016-01-04 → 2026-08-21** (lockbox end). No new price data is fetched |
| Seed | `20261104` |
| Uncertainty | Monte Carlo, 5,000 paths per cell, block bootstrap of daily rows, block 5 (toolkit default) and block 21 as a streak check; MC error ±0.7pp on a 50% rate. Edge uncertainty: 95% stationary-bootstrap CI of the daily mean (block 10, B = 2,000) |
| Scripts / outputs | `scripts/portfolio-book-prop/` → `analysis/output/portfolio-book-prop/`; standard system outputs → `analysis/output/systems/portfolio-book-prop/` |
| Harness | the book via `js/harness/runStudy.mjs` (inside `buildPortfolio`); the prop simulation is the existing replica `scripts/overnight-hold-toolkit/toolkit.py` (`simulate`, `FTMO`), imported, not copied, so both studies use one implementation |

This prereg follows the research pod's build path (plan §9ab/§9ac): it is the **system card** (rules, test, kill
line, build plan, fleet fit, standard outputs) with the **validation desk's pre-run review** in §9.

## 1. The claim (required)

C.OG, Discord (owner's paste, 2026-11-04):

> I think EV modelling against props is also a very good opportunity for everyone as this helps to build capital but
> is also a lot more accessible than diving straight into a robust system for live personal capital … a lot of people
> are covering more than an entire year of the sub costs through methods similar to this

C.OG, Progression Path video (`education/progression-path-breakdown-notes.md`): "you don't actually need an insanely
performing system. All you need is a consistent system that has the right shape distribution … we just want to be net
positive of costs."

The owner asked (2026-11-04) which of their systems would return something over a month, and to price the best
candidate against a prop challenge. The candidate named in that answer: the Portfolio Book's CFD-tradeable sleeves.

## 2. Why it is not already settled (required)

- `portfolio-book-validate` (context) scored this stream as a book (Sharpe 0.21). It never asked the prop question:
  daily loss on intraday equity, a static floor, two targets, no clock.
- `overnight-hold-toolkit` (context) built the replica and found the key trap this study is designed around: **a
  zero-edge copy also clears the fee** in the payout model, because a challenge caps losses at the fee. So EV alone
  cannot show edge; only the difference from a zero-edge copy can (A1 of that study). Here that difference is the
  pre-registered gate from the start.
- No ledger entry runs a diversified daily book (rather than a single overnight trade) through prop rules.

## 3. Definitions, fixed in advance (required)

**The system (card).**
- Book A (**primary, tradeable on MT5 CFDs**): sleeves S1g (VIX-gated core beta: SPX500, XAUUSD; NAS100 dropped),
  S2 (trend 21/63/126/252 on 7 FX + XAUUSD + SPX500; NAS100 dropped), S3g (VIX-gated carry on 7 FX), equal sleeve
  weights, each sleeve and the book vol-targeted to 10% a year (EWMA 60, cap 3×, lagged). One-day fill delay and CFD
  financing (cash + 2.5%, less dividends; FX 1%) applied. This is exactly `validate.mjs`
  `combinedCfdOnly`. Rebalance at the 22:00 UTC daily close; positions held over weekends.
- Book B (**reference only, not tradeable on MT5**): the same plus the gated VIX² short-variance proxy (S5g), i.e.
  the all-haircuts four-sleeve book (0.74). Its vol sleeve is a proxy that fails its PUT benchmark (T6). Reported so
  the owner sees what a tradeable vol sleeve would need to be worth; never read as a result.
- **Daily row** (one per weekday the book is live): `Return %` = the book's daily return (net); `MAE %` = the intraday
  worst point, built per leg as exposure × adverse excursion from the prior close, using that day's NY-close bar low
  (long) or high (short), **summed across legs as if every leg hit its worst at the same moment** (conservative
  upper bound on the drawdown), capped above at min(0, Return %). Exposure of leg *j* on day *i* = held position /
  legs in sleeve × sleeve scale × sleeve weight × book scale, with the held position the delayed one the transform
  uses. A leg-day with no NY-close bar uses its close-to-close loss only (counted and reported).
- **Reconstruction check (stop rule, before any prop cell):** Σ exposure × close-to-close return must reproduce the
  book's daily return with correlation ≥ 0.98 over the window (financing and costs explain the rest). If it fails,
  the exposure path is wrong and nothing is simulated.
- **Program:** FTMO 2-step, exactly the replica's `FTMO`: +10% then +5%, static 10% floor, 5% daily loss of initial on
  intraday equity, minimum 4 trading days, no time limit (500-day cap = timeout), each phase from the initial
  balance. Funded stage: 12 months, 80% of month-end profit paid and reset, a breach ends it.
- **Size k:** multiple of the 10%-vol book: k ∈ {0.5, 1, 2, 3, 5}.
- **Zero-edge copy (THE MIRROR):** the same rows with the window's mean daily return subtracted from Return % and MAE %
  (same shape, no drift).
- **Edge-uncertainty band:** cells re-run with the mean shifted to the lower and upper ends of the daily-mean CI.
- **EV per attempt** (% of account) = P(funded) × E[12-month payouts] − fee; fee = 0.54% (FTMO 100k €540, owner to
  check). **Edge EV** = EV(book) − EV(zero-edge copy) at the same k: the fee cancels, so this is the part of the EV the
  book's drift pays for.
- **Sensitivity (descriptive):** close-to-close MAE only (the optimistic bound), and block 21.
- **Halves:** the k = 1 cells on 2016-01 → 2020-12 and 2021-01 → 2026-08 rows separately.

## 4. Hypotheses, expectation first (required)

| # | Question | Expectation |
|---|---|---|
| T1 | Book A funded rate at k = 1 | Low, near the zero-edge copy: the book's Sharpe is 0.21 ± ~0.23 |
| T2 | Edge contribution (A − zero-edge) at the best k | < 5pp |
| T3 | Edge EV at k = 1, at the lower end of the edge band | ≤ 0 |
| T4 | Median days to funded at k = 1 | Long (> 1 year) at a 10% vol book |
| T5 | Daily-loss breaches as a share of failures at k ≥ 3 | Most failures: the 5% daily limit is ~2.5σ of a day at k = 3 before the intraday bound |

**THE GATE (reading, not a verdict):** "the book's edge pays for the challenge" only if, at some k, (a) Book A's funded
rate exceeds the zero-edge copy by ≥ 5pp, **and** (b) Edge EV > 0 at the lower end of the edge band, **and** (c) both
halves have Edge EV > 0 at that k. Otherwise the report says the pass rate is mostly variance, and the honest cost of
an attempt is the fee minus what a zero-edge trader would also get back.

## 5. Power (required)

MC error is small (±0.7pp). The binding uncertainty is the edge: Sharpe 0.21 over ~18.6 years has an SE of ~0.23, and
over the 10.6-year prop window ~0.31. The edge band is part of the design for that reason. No new inference about the
book's mean is made here; this study can say what the challenge is worth **if** the backtest mean is true, and how
much that answer moves across the band.

## 6. Multiplicity (required)

Nothing is scored as a test. 2 books × 5 sizes × {book, zero-edge, band low, band high} plus two sensitivities and two
halves is a descriptive grid, reported in full. Naming the best k after the fact is labelled as such. The Portfolio
Book's own trial count (11 registered + validate cells) is unchanged: this adds one context entry.

## 7. What this does NOT test (required)

Whether the book's edge is real (banked: context, 0.21). FTMO's real fills, spreads, swaps, symbol list or leverage
caps (FTMO's index/gold leverage may cap k; owner to check). Whether FTMO allows weekend holding on the account type
(the book holds over weekends: this assumes a Swing-type account). Any other firm. The real toolkit (password
protected): the toolkit CSVs are exported so the owner can run it and compare.

## 8. What each verdict changes (required)

Verdict word: **CONTEXT** in every case. If THE GATE reads yes, the next step is a forward paper record of Book A at
the chosen k (the `portfolio-book-confirm` step), never a paid challenge from this study alone. If it reads no, the
report says what Sharpe the book would need for the gate to read yes (the k = 1 edge contribution with the mean scaled
up), so the owner knows how far away it is.

## 9. Validation desk review, before the run (js/validationDesk.js checklist)

| Check | Status here |
|---|---|
| Leakage / look-ahead | Book construction passed future-poisoning (288,873 leg-days, 0 differ) and an independent rebuild. Positions are decided at the 22:00Z close and earn from the next day with a further one-day delay. The intraday low/high is used only as that day's adverse excursion, never in a decision |
| Survivorship / data faults | Fixed instrument list, all present 2016+. Feature-store weekend rows are folded (parent A4). NY-close bars: n per instrument and missing leg-days reported |
| Multiple testing | One book chosen before the run (the one the owner was told about); Book B is reference only |
| Costs and execution | Financing and delay already in; the intraday bound is conservative. Not done: FTMO's own spreads and swaps |
| Power | §5: the edge is not distinguishable from zero; the band is reported |
| Regime | Halves reported; IS −0.16 vs OOS 0.64 in the parent means the 2016+ window favours the book; said so in the result |
| Overfit / mechanism | No parameter is tuned here; k is a grid, reported in full |

Gates before any paper trading: THE GATE above, then a forward demo record of Book A.

## 10. Build plan (card)

1. S · `scripts/portfolio-book-prop/build_rows.mjs`: build Book A and B with the validate transforms, capture held
   positions, compute daily rows (Return %, MAE % intraday and close-only), run the reconstruction check, write
   `rows_A.csv`, `rows_B.csv` and the book's trade list in the Data Terminal template.
2. S · `scripts/portfolio-book-prop/prop.py`: imports `simulate`/`FTMO` from the replica; all cells in §3; writes
   `results.json` and the toolkit upload CSVs (`toolkit_A.csv`, `Date,Return %,MAE %`, one row per day).
3. S · standard outputs: `scripts/systems/writeSystemOutputs.mjs portfolio-book-prop <terminal csv>`.
4. RESULTS.md, Evidence Book entry, trial ledger.

**Fleet fit:** a daily multi-asset book; no bot runs anything like it. It would overlap only the dormant trend and
carry work. Correlation to the live OI bots is expected near zero (different horizon).

## Amendments

### A1 — 2026-11-05 — POST-HOC (results seen)

- Build fixes made before any prop cell ran: the close-only MAE was first coded as the sum of losing legs and is now
  min(0, day return) as §3 defines it; the missing-bar count was counting 2008-15 leg-days outside the window (21 of
  43,003 in-window leg-days are missing).
- Added one describe-only cell (`posthoc_full_mean.py`): Book A's rows with the mean reset to the full-history Sharpe
  0.21, because the 2016-26 window shows 0.56. It demotes the reading: edge +6pp and edge EV +0.4% at 1×.
- THE GATE reads yes on the letter at 0.5× and 1×, but leg (b) does not discriminate (edge EV at the band's low end
  is +0.05%). The reading is reported with that caveat, as in overnight-hold-toolkit A1.

## RESULTS

*In `analysis/output/portfolio-book-prop/RESULTS.md`.*
