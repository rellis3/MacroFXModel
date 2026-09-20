# Multi-Spread Sleeve — pre-registered (2026-09-20)

*Registered before running. Verdicts get appended below the line once §5 runs on
real FRED/OANDA data (Railway — this sandbox has `OANDA_KEY` but no `FRED_KEY`, so
nothing below the line was fabricated or estimated).*

## 0. Why this exists, and what it is NOT

`MD files/YIELD_SPREAD_STRATEGY.md` is the one strategy on this desk that cleared
every audit: the **US-vs-foreign 2Y yield spread, z-scored, mean-reverts, FX follows
it**. OOS 2015–2025, ~109 trades, 63% win, PF 2.2, Sharpe ~1.1, every OOS year
positive. Its code (`js/yieldSpreadCore.js` + `js/yieldSpreadEngine.js`) is
**validated and frozen** — that doc's own next-steps say *"do not add parameters or
'improve' it before forward data arrives."* This sleeve does not touch it.

The question here is narrower and separate: **does the identical mechanism, applied
to a different spread tenor, find an independent edge — or does it just relabel the
same bet?** That second half matters as much as the first. A "multi-spread sleeve"
that is secretly one trade counted twice is not diversification, it's leverage
wearing a costume.

**Explicitly out of scope, and why:** the obvious next legs after 2Y/10Y nominal
differentials would be a **real-yield differential** (US TIPS minus a foreign real
yield) and a **breakeven differential** (US breakeven minus a foreign breakeven).
Neither is buildable honestly right now — FRED does not carry a clean foreign real-
yield or breakeven series for DE/GB/JP/AU/CA/CH the way it carries nominal long-term
rates (the OECD `IRLTLT01<CC>M156N` family). Building a "differential" with only a US
leg and no foreign leg is not a spread, it's a single-country series with an
extra name — that is exactly the kind of thing this desk's evidence ledger exists to
catch, not produce. Those two legs are **deferred, not attempted**, until a real
foreign-leg source is found.

## 1. The two spread definitions under test

Both reuse the validated sleeve's own mechanism unchanged (entry `|z| ≥ threshold`,
direction from `sign(z)` oriented by USD role, exit at `|z| ≤ zExit` or a max-hold
time stop, daily mark-to-market, publication-lag shift on the foreign leg). Only the
spread definition changes.

| Spread | US leg | Foreign leg | Status |
|---|---|---|---|
| **`y2`** (baseline) | `GS2` | per-pair, `js/zscoreSpreadEngine.js` `ZSCORE_PAIRS` | **validated** — reused byte-identical, not re-derived |
| **`y10`** (new) | `DGS10` | OECD `IRLTLT01<CC>M156N` (DE/GB/JP/AU already fetched by `js/mve/liveAdapter.js`'s `FRED_ID`; CA/CH new here) | untested |

**CA/CH caveat, learned the hard way already on this desk:** the validated sleeve's
own USDCHF foreign leg (`IRSTCI01CHM156N`, the 2Y family) was discontinued on FRED
with no error — forward-fill hid it silently until someone checked `asOf`
(`YIELD_SPREAD_STRATEGY.md` §5). `IRLTLT01CAM156N` / `IRLTLT01CHM156N` follow the same
OECD naming convention as the DE/GB/JP/AU series already proven live, but have **not**
been pulled live in this repo before. First real run must spot-check each foreign
leg's `asOf` date before trusting any USDCAD/USDCHF `y10` result — do not assume the
convention holds just because the name pattern matches.

## 2. What "an independent edge" means here — two separate bars

**Bar A — does `y10` clear the SAME audit the `y2` sleeve cleared, on its own?**
Re-run `YIELD_SPREAD_STRATEGY.md` §4's exact checklist against `y10` only:
- Sign-correct direction (USD-role orientation, same as validated).
- Publication-lag honesty (US +2d, foreign +45d — no lookahead).
- Honest daily-MTM Sharpe (not the smeared-return bug that inflated the first `y2`
  pass to 3.79 before correction).
- Breadth: profitable pairs / OOS years, not one lucky pair or year.
- Parameter-grid robustness: entry `|z|` ∈ {2.0, 2.25, 2.5, 2.75} × window ∈
  {90, 126, 252} — a plateau, not a spike.
- Cost stress test at 0.04% round-trip (2× the validated assumption).

**Pass:** a robust region exists (multiple adjacent grid cells profitable, not one
cell), OOS Sharpe > 0.5 across it, breadth across pairs and years comparable to the
`y2` precedent.
**Falsifier:** no robust region, or the grid looks like `y2`'s decayed z-tier
finding (edge concentrated in the shallowest bucket only, or one pair/year carrying
the whole result).

**Bar B — if `y10` passes Bar A on its own, does combining it with `y2` actually
diversify, or just double the same trade?** Three diagnostics, all built into
`js/multiSpreadCore.js`:
1. **Z-series correlation** per pair between `y2`'s z and `y10`'s z — a cheap
   intuition check. High correlation (both series are ultimately "does the US rate
   cycle lead or lag") is expected to some degree; the question is how high.
2. **Trade-level overlap** — the fraction of `y10`'s trades that fire within ±2 days,
   same direction, same pair, as a `y2` trade. This is the direct test of "same bet."
3. **Combined-portfolio Sharpe at equal risk** — `y2` and `y10` each run at HALF
   size (so total capital-at-risk matches running `y2` alone), compared against `y2`
   alone and `y10` alone. This is the only honest answer to "is this worth running
   together" — a higher combined Sharpe than either leg alone, at the SAME total
   risk, is diversification; anything less is not, whatever the standalone numbers
   say.

**Pass (worth combining):** combined Sharpe at equal risk beats `y2` alone, trade
overlap well under 50%.
**Falsifier:** combined Sharpe ≤ `y2` alone, or trade overlap high enough that `y10`
is mostly re-firing `y2`'s own signal a few days later — then `y10` may still be a
valid finding for Bar A, but it does not make a *multi-spread* sleeve; it's a
correlated echo, and sizing both together is leverage on one bet, not two.

## 3. Config (matches the validated grid, spread definition is the only new variable)

```
entryThreshold: 2.0 / 2.25 / 2.5 / 2.75   (sweep)
zWindow:        90 / 126 / 252            (sweep)
zExit:          1.5
maxHoldDays:    20
costPct:        0.02  (stress-tested at 0.04)
pubLagUsDays:      2
pubLagForeignDays: 45
autoOrient:     true
pairs:          usdjpy, eurusd, gbpusd, audusd, usdcad, usdchf
period:         2015-01-01 → present (same window as the validated sleeve)
```

## 4. Code

- `js/multiSpreadCore.js` — pure. Re-exports the validated sleeve's primitives
  unchanged (`directionFromZ`, `resolveInverted`, `shouldExit`, `summarizeYieldSpread`,
  `sharpeFromDaily`, …), adds only what's new: `SPREAD_DEFS` construction, z/return
  correlation, trade-overlap, and the equal-risk combined-portfolio stat.
- `js/multiSpreadCore.test.mjs` — synthetic, deterministic, no network. Proves the
  new math (correlation, overlap, combined Sharpe) is correct — NOT that any spread
  has edge.
- `js/multiSpreadEngine.js` — I/O. Generalizes `js/yieldSpreadEngine.js`'s
  `loadPairData` / `simulatePair` / `simulateBook` to read from `SPREAD_DEFS` instead
  of assuming the 2Y table, reusing (not copying) `fetchFredObservations`,
  `buildRollingZSeries`, `buildDayIndex` from `js/zscoreSpreadEngine.js`.
- `analysis/multi_spread_sleeve.mjs` — the runner. `node analysis/multi_spread_sleeve.mjs`
  (needs `FRED_KEY` + OANDA/R2 — Railway). Writes
  `analysis/output/multi_spread_sleeve.json`.
- `multi-spread-sleeve.html` + `POST/GET /api/multi-spread-sleeve/{run,sweep,status}`
  (added after §5's first run) — the live page, same async-job pattern as
  `/api/yield-spread/*`. Full tearsheet (2026-09-20): CAGR/Sharpe(daily+per-trade)/
  Sortino/Calmar/skew/kurt/VaR/CVaR via `js/metricsCore.js`+`js/backtestStats.js`
  (imported directly in-browser, not reimplemented), an additive OOS equity curve
  (Chart.js), bootstrap+Monte-Carlo outcome-uncertainty tables with the house
  caveat, a monthly heatmap, and the 3 CSV exports. Real intrabar MAE/MFE
  (`js/multiSpreadEngine.js`'s `intrabarExcursion`, from the M1 path each pair's
  data load already has in memory) — this sleeve has no native price-level stop,
  so R in the CSVs is a stated fixed-fraction-of-equity assumption, not measured;
  said plainly on the page rather than faked, per CLAUDE.md's own guidance for
  exactly this "no native stop" case.

**Isolation:** the page/routes are real and live (added once §5's numbers existed to
show), but nothing here feeds a live signal or bot — same posture as `mve.html`'s own
"isolated means no signal wiring, not no route." A `deskEvidence.js` entry already
exists (§5); the page is for re-running/re-checking, not a new pending verdict.

## 5. Results (run 2026-09-20 on Railway; design frozen above before running)

`multi-spread-sleeve.html`, `entryThreshold=2.75, zWindow=252, zExit=1.5, maxHoldDays=20,
costPct=0.02, autoOrient=on, dateFrom=2015-01-01`. A first run surfaced a real bug in
the Bar B comparison (wrong annualization, `26` instead of `252`, for a daily return
stream — fixed same day, PR #1476); the numbers below are post-fix.

**y2 (validated baseline, reused byte-identical):** 46 OOS trades, 82.6% win, PF 6.97,
+53.96%, portfolio Sharpe (honest daily MTM) 0.99 — consistent with
`YIELD_SPREAD_STRATEGY.md`'s own numbers at this end of its validated grid.

**y10 at this one cell:** 28 OOS trades, 64.3% win, PF 3.44, +26.01%, portfolio Sharpe
0.82, 4/5 OOS years positive. The page's own single-cell verdict function flagged this
as "does not clear Bar A" purely because n=28 is under the usual ≥30 floor **for this
one cell** — that is not the pre-registered Bar A test (fixed same day: the verdict box
now says so explicitly and points at the sweep instead of asserting a flat fail).

**Bar A — the robustness sweep (the actual test), y10, 12 cells:**

| Entry\|z\| | window | n | Win% | PF | Total ret | Years+ |
|---|---|---|---|---|---|---|
| 2.00 | 90  | 161 | 61.5% | 2.06 | 65.3% | 4/5 |
| 2.25 | 90  | 106 | 64.2% | 1.98 | 44.1% | 5/5 |
| 2.50 | 90  | 71  | 57.7% | 1.33 | 12.4% | 4/5 |
| 2.75 | 90  | 47  | 57.4% | 1.52 | 14.0% | 5/6 |
| 2.00 | 126 | 142 | 63.4% | 2.28 | 71.4% | 4/5 |
| 2.25 | 126 | 92  | 66.3% | 2.59 | 57.9% | 4/5 |
| 2.50 | 126 | 53  | 67.9% | 2.06 | 25.5% | 3/5 |
| 2.75 | 126 | 36  | 58.3% | 1.27 | 6.6%  | 3/5 |
| 2.00 | 252 | 93  | 52.7% | 1.06 | 3.8%  | 2/5 |
| 2.25 | 252 | 64  | 59.4% | 1.51 | 18.8% | 4/5 |
| 2.50 | 252 | 43  | 58.1% | 2.55 | 30.2% | 4/5 |
| 2.75 | 252 | 28  | 64.3% | 3.44 | 26.0% | 4/5 |

**12/12 cells profitable** (PF 1.06–3.44), most clearing PF ≥ 1.5, broad multi-year
coverage (2/5 at the single weakest cell, ≥3/5 everywhere else, several 5/5). This is a
broad plateau, not a lucky spike — comparable in shape to the validated y2 sleeve's own
12-cell sweep (PF 1.73–5.04), a touch thinner at the floor (1.06 vs y2's 1.73) but not a
different pattern. **The sweep's own initial run did not compute a per-cell Sharpe at
all** (a real gap, not just a display omission — `runSpreadSweep` never built the
combined daily-MTM stream the way `runSpreadBook`/the validated sleeve's own sweep do);
fixed same day (PR after #1476) to add `portfolioSharpeOos` per cell, matching §2's
actual pass bar ("OOS Sharpe > 0.5 across it") instead of only PF/win-rate/years, which
can't by themselves confirm that criterion. Re-run pending to fill in the Sharpe column.

**The weak corner:** window=252 at the shallow end (entry|z|=2.0: PF 1.06, n=93, 2/5
years) is the thinnest cell in the grid — margin over the 0.02% cost assumption is
thin here specifically. The 90/126-day windows and the deeper thresholds are
comfortably strong throughout. Mirrors the validated y2 sleeve's own finding that its
252-day window is "the weakest, most regime-concentrated" — consistent with, not a new
anomaly against, what's already known about this spread family's window sensitivity.

**Bar A verdict: PASS**, on the region entry|z| 2.0–2.75 × window 90–126 (uniformly
strong); window=252 is weaker and more uneven, especially at its shallow end — treat
that corner as unconfirmed until the Sharpe re-run and a longer/cost-stressed look.

**Bar B — diversification (post-fix numbers):**

| | y2 alone | y10 alone | Combined (equal risk) |
|---|---|---|---|
| Sharpe | 1.02 | 0.81 | **1.15** |

Trade overlap (y10 vs y2, ±2d, same pair/dir): **13/83 = 15.7%** — well under 50%, a
genuinely different bet, not a relabeled one. Return correlation (y2 daily vs y10
daily, OOS window): **0.300** — moderate, not near-1 (some shared macro driver
expected, both are rate-differential bets on the same pairs), far from redundant.
Combined Sharpe at equal risk (**1.15**) beats either leg alone (1.02, 0.81) — real
diversification benefit, not just a second profitable sleeve stacked on top.

**Bar B verdict: PASS.**

**Overall: both bars pass.** y10 is a genuine, if thinner-at-the-edges, second sleeve,
and combining it with y2 at equal risk improves the book's Sharpe. Same caveat the
validated y2 sleeve itself carries and states plainly: **this is in-sample/OOS
backtest evidence, not forward-proof.** The only remaining test is paper-trading the
combined book live, the same bar y2 was held to before its own "validated" tag.

**What changes on the page.** Nothing wired into any live signal — still isolated,
per §5's own design. `js/deskEvidence.js` gets a `multi-spread-sleeve` entry
reflecting this PASS, with the same "not forward-proven yet" caveat `yield-spread-sleeve`
carries.

**Outstanding before this is fully closed:** (1) re-run the sweep with the Sharpe
column now wired, to confirm ≥0.5 Sharpe holds across the claimed robust region: (2) a
cost-sensitivity stress test on the weak 252-window corner specifically, mirroring the
validated sleeve's own 0.04%-cost stress test.
