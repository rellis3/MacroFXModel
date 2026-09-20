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

**Isolation, same posture as `js/mve/`:** nothing here is wired into `server.js`, no
API route, no dashboard link. It stays isolated until Bar A and Bar B both clear on
real data — going live is a deliberate, separate step, same as the MVE's own §7.

## 5. Results

*(not yet run — needs `FRED_KEY` on Railway; append here when it runs, in the same
format as `MD files/LEAD_LAG_TESTS.md`'s results section, and add a `deskEvidence.js`
ledger entry once there's a verdict — validated / null / context, not before)*
