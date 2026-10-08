# STIR residual: do short-rate FUTURES lead price, where bond CFDs did not? (R1–R3)

*Pre-registered 2026-10-08, after the futures were pulled and before any statistic on them was computed (the only look
was a data check: bar counts, timestamps, and the share of 15-min bars whose close changed: SR3U6 39%, SR3H7 51%,
Euribor IZ6 49%). Follows `forge/RATES_RESIDUAL_PREREG.md` (S1 FAIL on bond CFDs) and `plans/STUDY_BOOK_2026-10-08.md` §5,
which named short-rate futures as the one untested input. Source of the idea: C.OG's stream 2026-10-05 (SOFR futures
SR3U2026 vs a euro short-rate future, plotted over NQ / EURUSD; "model the residual ... conditional directional bias";
Friday's rate-differential line shown next to Monday's NAS100 with the turns at 13:41, 15:07, 16:03 marked).*

## Data

- **Futures:** `analysis/output/stir/` (IBKR, 15-min TRADES bars, UTC bar start), 2026-04-07/12 → 2026-10-08:
  SOFR SR3U6 / SR3Z6 / SR3H7 / SR3M7 (CME), 3-month Euribor IZ6 (ICE). The €STR futures (ER3U6, FST3, ESRM7) trade a
  median 0–2 lots per 15 min and are not used.
- **Targets:** OANDA M15 mid closes, `analysis/output/rates_residual/m15/` (same files as S1), through 2026-10-07.
- **About 125 trading days.** Everything below is sized for that: it can find a lead of the kind C.OG describes if it is
  large; it cannot rule out a small one.

## R1 — the residual catch-up (primary), the S1 model with futures as the drivers

Same construction as S1 (`scripts/rates_residual/study.py`): 15-min log returns on bars where target and every driver
have a close and the previous slot is exactly 15 min earlier; β by OLS (no intercept) over the previous 20 trading days,
refit each UTC day from data strictly before it; implied move I = Σ β·x over the last K bars, own move O = Σ target
returns over the same bars, both ÷ σ·√K; forward F = next H bars ÷ σ·√H; sampled every H bars; F = a + b·I + c·O.

| target | drivers (15-min returns) |
|---|---|
| NAS100 | SR3Z6, SR3H7 |
| SPX500 | SR3Z6, SR3H7 |
| USDJPY | SR3Z6, SR3H7 |
| XAUUSD | SR3Z6, SR3H7 |
| EURUSD | SR3Z6, IZ6 (the two legs of the Dec'26 SOFR − Euribor differential; β finds the spread) |

SR3Z6 / SR3H7 are fixed now as the contracts carrying the next two quarters of the Fed path (U6 is mostly fixed and moves
one tick at a time). Dec'26 Euribor matches Dec'26 SOFR in expiry.

- **Primary horizon: K = H = 4 (1 hour).** C.OG's claim is intraday turns (rates turn, price follows within the hour),
  and 1 h gives four times the samples of 4 h. **Secondary: K = H = 16 (4 h, S1's horizon)**, reported with the same rules.

**PASS R1 (judged on K = H = 4):**
1. pooled b > 0 with its 95% day-block bootstrap interval above 0;
2. b > 0 in both halves (test days split at their median date);
3. b > 0 on at least 3 of the 5 targets;
4. real b above the 95th percentile of 200 placebo runs, each shifting every driver series by a random whole number of
   days (≥ 5, wrapping) before the β fit.

Also reported (not deciding): the same-bar correlation of each target with its drivers (the data has to show the known
same-bar link, or the join is broken); the gap trade (|I − O| > 1.5, hold H, after the S1 cost table).

## R2 — plain lead-lag (descriptive)

For NAS100 and EURUSD: correlation of the target's return over the next 1, 2, 4 bars with the driver's return in the
current bar (SR3H7 for NAS100; ΔIZ6 − ΔSR3Z6, the differential, for EURUSD), and the reverse direction. Day-block
intervals. No pass rule: it shows whether any lead exists before the residual model is involved.

## R3 — "Friday's rate path draws Monday's NAS100" (the stream claim)

For every pair of consecutive trading days (d, d+1) with full data: the rate differential's path on day d and NAS100's
path on day d+1, both as cumulative 15-min changes from 12:30 to 18:00 London (the window on his two charts), each
z-scored within the day. Statistic: their correlation, averaged over all pairs.

- Differential = IZ6 price − SR3Z6 price (US short rate minus euro short rate; rises when US rates rise relative to
  euro rates). His chart showed the line and NAS100 moving the same way, so the claim is a **positive** mean correlation.
- **Placebo:** the same statistic with day d's rate path paired with a randomly chosen NAS100 day other than d+1
  (1,000 draws). This removes what every afternoon has in common (13:30 data, 14:30 open).

**PASS R3:** the real mean correlation above the 95th percentile of the placebo, and above 0.
Reported: the same-day pairing (d with d), and Friday→Monday pairs alone (too few to judge: ~25).

## Not run

S3 (the gap at C.OG's lines) is not repeated: his setup trades overlap the futures window on only about 4 months, too few
trades to test.

## Stopping rule

No variants. These are the first and last runs on this 6-month pull; the archive grows with each IBKR pull, and a later
re-run on a longer history is a new pre-registration, not a variant of this one.

Output: `analysis/output/stir_residual/RESULTS.md`; script `scripts/rates_residual/stir_study.py`.
