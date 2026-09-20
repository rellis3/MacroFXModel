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

## Results (run 2026-09-19; design frozen above before running)

Harness `analysis/lead_lag_studies.mjs`; output `analysis/output/lead_lag_studies.json`.
Hourly bars 2012-01 → 2026-09: 61,015 shared hours for EUR/USD, 33,269 for GBP/USD.

**L1a — the spread and the currency move in the same hour, and that is all.**
EUR/USD: ρ(0) = **−0.30** (the textbook sign, every year 2012–2026, −0.12 to
−0.44), then ρ(+1h) = −0.015 against a placebo 95th percentile of 0.013 — one
hour of spillover at the edge of noise — and ρ(+2h…+48h) all inside ±0.005.
GBP/USD: ρ(0) = −0.14, ρ(+1h) +0.004, nothing after. No year shows a 24-hour
lead (ρ(+24h) between −0.03 and +0.04 in every year).

**L1b — the lesson's divergence setup does not carry a catch-up.** EUR/USD:
727 non-overlapping divergences (spread moved ≥ 1σ over 24h, spot did not
follow). Next 24 hours in the spread's direction **379 of 727 = 52% [48.5–55.8]**,
mean +0.05σ [−0.05, +0.14]. The *aligned* control — spot had already moved with
the spread — scored the same: 52% [49–55], +0.06σ. Big divergences (|z| ≥ 2,
n=52) went the other way: 35% [22–48], **−0.47σ** — the spread gave back, the
currency did not catch up. GBP/USD: 47% [43–50] on 736 setups, −0.13σ; aligned
47%. **NULL on both pairs.**

Reading: the 17–18 Feb 2026 case is one episode. Across 3,300 divergences in
fourteen years the currency's next day is a coin flip, and the biggest gaps
closed from the spread's side. This matches the desk's daily-bar verdicts
(`yields-to-fx-direction`, `price-vs-spread-divergence`) at the one horizon they
had not covered. The relationship is real and contemporaneous; it is not a lead.
The lesson's own §3.5 roadmap (rolling lag, Granger) would find the same: the
optimal lag is zero.

**L2 — no month-end drag.** 229 months of SPX500 (2007-08 → 2026-08), quintiles
of 45. After the strongest months the last three sessions returned **+0.11%**
[−0.32, +0.50], negative 21 of 45 (47% [32–61]); after the weakest, +0.65%
[−0.14, +1.53], negative 36%; ordinary months −0.06%, any three sessions +0.11%.
Under the sample bar, and the direction is not even the one claimed. **NULL as a
base rate.**

**What changes on the page.** Nothing new is added; two more lines go into the
evidence book so the AI reads and the divergence panel never say "the spread
moved first, the currency will follow". The spread stays what it was: the
same-hour explanation of a move, and — as a z-scored 2-year spread over weeks —
the one validated macro sleeve.
