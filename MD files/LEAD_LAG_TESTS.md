# Lead–lag tests from the course notes — pre-registered

*Registered 2026-09-19 before running, from `education/macro-deep-dives-notes.md`
(Lesson 3) and `education/QUANT_MACRO_LESSONS_1-6.md` (§2.5). Verdicts appended
below the line.*

The notes make claims this desk has tested only in daily bars. The specific one
— *"the DE–US 10-year spread led EUR/USD by ~24 hours (17–18 Feb 2026); when the
spread moves and spot doesn't, the question isn't if, it's when"* — is an
**intraday** claim, and the desk's existing verdicts (`yields-to-fx-direction`
null on daily bars; `price-vs-spread-divergence` null over 20 sessions) do not
speak to a 24-hour horizon. So it gets its own test, at the horizon it claims.

Data: OANDA hourly mid closes 2012 → 2026 for `DE10YB_EUR`, `USB10Y_USD`,
`UK10YB_GBP` (bond CFD prices; a rising price is a falling yield) and `EUR_USD`,
`GBP_USD`. The spread proxy is the hourly log-return difference
Δs = Δlog(P_DE) − Δlog(P_US): positive when the US yield advantage widens, so the
textbook says EUR/USD should fall — the expected correlation with later EUR/USD
returns is **negative**.

## L1 — Does the spread lead EUR/USD by hours?

**L1a — cross-correlation.** ρ(k) = corr(Δs_t, Δfx_{t+k}) for k = −48…+48 hours,
full sample and per calendar year. The claim needs |ρ(k)| for k = 1…24 to sit
clearly above a placebo (Δs shuffled within each week, 200 reps) and to hold
across years. Contemporaneous ρ(0) is expected to be large and is *not* the
claim.

**L1b — the divergence setup, as the lesson uses it.** At every hour t, over the
trailing 24 hours: the spread has moved ≥ 1σ (σ of trailing-24h Δs over the
prior 250 sessions) while EUR/USD has moved < 0.25σ of its own trailing-24h
moves, or against the spread. Outcome: the sign of EUR/USD's *next* 24-hour
return versus the spread's direction (spread widened for the US → EUR/USD
expected down). One setup per 24-hour block (no overlap).
- Hit rate with a 95% binomial interval; mean next-24h return in the spread's
  direction, in σ units, with a block-bootstrap interval (ISO week, 1000 reps).
- Control: hours with the same spread move where EUR/USD *already* moved with
  it (the aligned case) — the lesson says the divergent case should carry the
  catch-up and the aligned case should not.
- **Pass:** n ≥ 100 setups, hit-rate lower bound > 0.50, and mean return in
  the spread's direction ≥ +0.15σ with the interval clear of zero.
- **Falsifier:** hit-rate interval through 0.50, or the aligned control does as
  well as the divergent setup (then it is momentum in the spread, not a lag).
- Same test on GBP/USD with the Gilt–T-note proxy, reported separately.

## L2 — Month-end rebalancing pressure

*"After a strong month, funds must sell stocks in the final 2–3 days; don't
chase breakouts on the 29th–31st."*
- SPX500 daily (OANDA, 2012→). Strong month = month-to-date return at session
  T−3 (three sessions before month end) in the top quintile of all months;
  weak month = bottom quintile.
- Outcome: the return over the last three sessions of the month; share negative;
  compared with the last three sessions of ordinary months and with three-
  session returns at random points in the month.
- **Pass:** after strong months the last-three-session return is negative on
  average with a bootstrap interval clear of zero and a share negative ≥ 55%
  with the binomial interval clear of 50%; after weak months, the mirror. n
  will be ~35 per tail — reported as a base rate if under the bar.

## Queued, not run today

- Net liquidity (Fed balance sheet − TGA − RRP, weekly, FRED) → S&P 4-week
  sign; the growth/inflation regime classifier and the asset-by-regime table
  rebuilt on this desk's data; OpEx week vs the week after (range).

---
