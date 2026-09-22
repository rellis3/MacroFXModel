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

## Results (run 2026-09-20; design frozen above before running)

Harness `analysis/plumbing_study.mjs` → `analysis/output/plumbing_study.json`.

**First, what the data said about the setup itself.** SOFR's 99th percentile
sat ≥ 10bp above the floor on **535 of 2,114 sessions** — a quarter of all
days. In 2018 that was a new benchmark finding its level; from 2024 it is the
drained-RRP world, where month-ends and quarter-ends push the day's worst repo
trades through the floor as a matter of routine (the episode list is a calendar
of month-ends: 04-30, 06-26, 07-26, 08-27, 10-31, 12-02…). The 10bp threshold
therefore marks *plumbing tightness*, not stress; the September 2019 and March
2020 episodes are in the list, but so are twenty ordinary month-ends. This is
the finding worth keeping: on this series, "the 99th percentile is above the
floor" is now the normal state at a month-end, and the page says so.

**P1 — base rate, under the bar, no wider week visible.** 26 first-of-episode
sessions. Next-five-session range against a matched control (same ATR
quintile, not within ten sessions of a setup): SPX500 **+0.14 ATR** [−0.54,
+0.98], EUR/USD +0.13 [−0.37, +0.65], USD/JPY +0.08 [−0.76, +0.93]; the dollar's
5-day |change| 0.45% vs 0.59% unconditional — *smaller*. The intervals span
zero by a wide margin. Not a pass; the chain's funding links stay *described*.

**What shipped:** the plumbing block on rates.html (SOFR − floor, the 99th
percentile, EFFR − floor, the repo backstop, the discount window, RRP, in
words), four tiles on the week map, and the `funding` node in the chain with
two described links (funding → dollar, funding → fear). A real stress read
would need the backstops in use (SRF usage, discount window), which is what
the block leads with.
