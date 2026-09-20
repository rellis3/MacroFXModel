# Plumbing — is overnight money clearing, and is anyone at the backstop?

*Registered 2026-09-20 before running.*

The money-market machinery a desk watches, all free (NY Fed, FRED), added to
the week map, the Rates & Policy page and — as one node — the chain:

| tile | series | what it says |
|---|---|---|
| SOFR 99th − floor | NY Fed SOFR 99th percentile − IORB (IOER before 2021-07-29) | the *worst* repo trades of the day against the Fed's floor: a spike while the median looks calm is how Sept 2019 announced itself |
| EFFR − floor | fed funds effective − IORB/IOER | unsecured overnight drifting up through the floor = reserves getting scarce |
| SRF / repo ops | RPONTSYD, $bn | banks borrowing cash from the Fed's standing facility: the private repo market did not clear |
| discount window | WLCFLPCL, $bn | the older backstop; used only when a bank cannot avoid it (March 2023) |
| SOFR − floor (chain node) | SOFR − IORB/IOER, 20-day change | the chain's one plumbing node: funding stress → dollar bid, risk sold (textbook) |

## P1 — does repo stress precede a wider week?

- **Setup:** a session where SOFR's 99th percentile sits ≥ 10bp above the
  floor (IORB, IOER before 2021-07-29), taking only the *first* such session of
  an episode (no setup within ten sessions of a prior one). History 2018-04 →.
- **Outcome:** range over the next five sessions ÷ ATR14 at the setup, for
  SPX500, EUR/USD, USD/JPY (OANDA), and the broad dollar (FRED, 5-day |change|).
- **Control:** every non-setup session in the same ATR-percentile quintile,
  the unconditional distribution; paired-difference interval by session-block
  bootstrap (1000 reps).
- **Pass:** n ≥ 40 setups and next-5-session range ≥ +0.10 ATR above control
  with the interval clear of zero on at least two of the three instruments.
- Expected n is small (repo stress is rare: 2019-09, 2020-03, quarter-ends); if
  n < 40 the result is a base rate with an interval, and the chain link stays
  *described*, not tested.

---
