# The non-US yield legs — gilts, JGBs, bunds against Treasuries

*Pre-registered 2026-09-20, before any data was pulled. The chain on today.html
is the US-dollar transmission machine; it cannot say "this was a UK day" or
"this was a yen day". These three series are the only free daily feeds that
could. The question is what, if anything, the gap between a foreign 10-year and
the Treasury 10-year carries for the pair — and the desk already knows that
rate differentials do not predict FX direction here (yield/asset coupling
2026-08-23, L1 2026-09-19, the yield-spread bot). So the claims below are a
labelling claim, a range claim and a direction base rate, in that order.*

## Data

| leg | series | source | cadence |
|---|---|---|---|
| gilt 10Y | IUDMNZC (nominal par yield) | BoE IADB | daily, ~1-2 business days behind |
| JGB 10Y | 10Y column | MoF Japan `jgbcme_all.csv` + current month `jgbcme.csv` | daily, ~1 day behind |
| bund 10Y | BBSIS.D.I.ZAR.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A | Bundesbank | daily, same day |
| UST 10Y | DGS10 | FRED (fredgraph.csv) | daily |
| pairs | GBP_USD, USD_JPY, EUR_USD | OANDA D1, London-midnight bars | daily |

Window: 2008-01 to now, common dates only. Gap = foreign − UST, in bp. A day's
FX return is the London-day log return on the same calendar date as the yield
prints (yields print inside that London day).

## Definitions, frozen

- **Foreign-led rise** (the day's label): Δforeign ≥ +T and Δgap ≥ +T, where T
  is 5bp for gilts and bunds, 3bp for JGBs (JGB moves are smaller). Foreign-led
  fall: the mirror.
- **Textbook sign** for the chain: gilt gap up → GBP/USD up (+1); bund gap up →
  EUR/USD up (+1); JGB gap up → yen bought → USD/JPY down (−1).
- **Big gap day** for the range test: |Δgap| ≥ 8bp (gilts, bunds), ≥ 5bp (JGBs).

## Claims

**Y1 — the label (same day, descriptive).** On the pair's worst 5% of days
(and, as the mirror, its best 5%), what share were foreign-led rise days,
against the unconditional share? Reported as a ratio with a bootstrap 95%
interval over the tail days. The pre-stated reading: a gilt-led rise
over-represented on GBP/USD's *worst* days is the fiscal-stress read (the
"bad rise" of September 2022); over-represented on its *best* days is the carry
textbook; neither is a label that carries nothing. Real only if the interval
on the ratio excludes 1.

**Y2 — the range (next session, the desk's standard).** After a big gap day,
the next session's realised range (high − low, as a share of close) against
the trailing 20-session median for the same pair: ratio, block-bootstrap 95%
interval (blocks of 10 sessions, 1000 reps). Real only if the interval excludes
1. Also reported: the same after a foreign-led rise day specifically.

**Y3 — direction (base rate, not a claim).** After a foreign-led rise day, the
share of next-session pair moves in the textbook direction, with its interval.
And the chain's own question: over rolling 20-session windows, the share where
sign(Δgap) × sign(ΔFX) agrees with the textbook. Both expected near 50%.

## What each verdict does to the page

- Y1 real on the worst tail → the chain chip reads "when this link breaks —
  yields up, currency down — it is the fiscal-stress read", and the day gets a
  desk-watch label. Y1 real on the best tail → the chip's textbook wording
  stands and the "bad rise" line is dropped. Y1 null → the chip is a
  description only and says so.
- Y2 real → a Desk Watch trigger for the next session's range, in the ledger.
  Y2 null → no trigger; the chip carries no range claim.
- Y3 is written into the ledger as the base rate whatever it says.

Harness: `analysis/nonus_yields_study.mjs`. Output: `analysis/output/nonus_yields.json`.

## Findings

*(to be filled after the run)*
