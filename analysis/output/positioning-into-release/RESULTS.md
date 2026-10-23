# positioning-into-release — results

Prereg: `MD files/POSITIONING_INTO_RELEASE_PREREG.md` (registered 2026-10-14, on main in `84af2f3`). Two PRE-RESULTS
data amendments were committed before the harness ran (`61fe417`, `3561e68`). Run 2026-10-22, seed 20261014,
B = 2000 (week bootstrap). Branch `ccr-b9c5645b-qc2in4`. Ledger ids: `positioning-into-release-range` (null),
`positioning-into-release-direction` (validated).

## Verdict

- **R (range): NULL.** Crowded positioning does not make a release day wider than a matched non-crowded day of the
  same pair, release kind and volatility decile. The effect is −0.003 ATR [−0.037, +0.036]; the interval rules out
  the +0.15 the gate needed.
- **D (direction): VALIDATED as registered.** On release days, price moved *against* the crowded leveraged-fund side
  by **+0.064 ATR [+0.019, +0.111]** more than on matched non-crowded days. That holds in both halves (+0.029 /
  +0.129) and in **6 of 6 pairs**. The placebo (the same test on non-release days) is −0.009 [−0.053, +0.032] and
  does not fire.

**This is the opposite of what the prereg expected** ("D is expected to fail"). Per its decision table, a D pass
"does **not** become a signal. It becomes a second pre-registration on held-out years", because it runs against
`crowded-bond-short-fomc` (84 meetings, the other way) and against `cot-positioning-factor` (null). The effect is
also small: about 6% of a day's typical range, roughly 3–4 pips on EURUSD per release day, before costs.

## Scored cells

| Cell | n (matched / weeks) | Estimate | 95% CI | Pass bar | Checks | Verdict |
|---|---|---|---|---|---|---|
| R: crowded event-day TR/ATR minus matched control | 2,105 / 335 | −0.003 | [−0.037, +0.036] | ≥ +0.15, CI excludes 0, both halves, ≥ 4/6 pairs | effect ✗ · CI ✗ · halves ✗ · pairs ✓ (4/6) | **NULL** |
| D: move against the crowd minus matched control (ATR) | 2,105 / 335 | **+0.064** | **[+0.019, +0.111]** | CI excludes 0, both halves, ≥ 5/6 pairs | CI ✓ · halves ✓ (+0.029 / +0.129) · pairs ✓ (6/6) | **VALIDATED** |

MIN_EVENTS: 2,152 crowded event-days (≥ 150 needed), all 6 pairs ≥ 25. 47 crowded days had no control in their cell
and are counted as dropped. Per pair, D: EURUSD +0.030, GBPUSD +0.110, AUDUSD +0.043, USDJPY +0.012, USDCAD +0.084,
USDCHF +0.081.

## Controls

| Control | R | D | Fires? |
|---|---|---|---|
| Placebo: non-release days, crowded vs matched non-crowded | +0.009 [−0.027, +0.040] | −0.009 [−0.053, +0.032] | no |
| Mirror: trimmed book on event days | −0.020 [−0.168, +0.097] | −0.025 [−0.289, +0.245] | no, but only **74** trimmed days exist, so this control has little power |

Sanity: release days are wider than quiet days (mean TR/ATR 1.04 vs 0.94), as `surprise-size` says they should be.
762 rate-decision days were excluded.

## Deviations from the prereg

These are the two PRE-RESULTS amendments in the prereg:
- OANDA M15 closes stand in for M1, so ranges are from 15-minute closes.
- NZD is dropped (6 pairs), and the pair bars are kept as numbers, which makes them stricter.
- The calendar is the ForexFactory high-impact history, 2018-01 → 2025-04-07.
- The rate-decision exclusion uses an explicit FF name list, because `newsKind` misses FOMC, ECB and BoC.
- The harness is in Python.

The mirror arm is far smaller than the design assumed: trimmed books are rare.

## Descriptive (POST-HOC, written after the result; never part of the verdict) — `diagnostics.json`

- **By year:** positive in 7 of 8 years (2019 is −0.07). Leaving any year out gives +0.057 to +0.076.
- **By pair:** leaving any pair out gives +0.053 to +0.072.
- **By crowd side:** crowded long +0.083 (n 1,342); crowded short +0.031 (n 763).
- **By whose release it is:** US-only days +0.054 (n 1,661); the other leg's release only +0.079 (n 167); both
  +0.110 (n 277).
- **By release kind:**
  - generic +0.098 (711; mostly Fed speakers and other unclassified high-impact items)
  - inflation +0.061 (418)
  - spending +0.103 (148)
  - jobs +0.075 (122)
  - surveys −0.002 (456)
  - growth −0.026 (120)
- **Is it just the trend reversing on news?** No, it isn't explained by the price trend into the day. In a joint
  fit on event days, crowding carries +0.046 and the sign of the trailing 40-day move +0.023. A strong trend
  *without* crowding shows no reversal (−0.005). On quiet days both coefficients are ~0.

## What this changes

- **The today.html "who is exposed" panel:** no change. It already claims no direction, and the prereg forbids
  turning a single D pass into a lean.
- **Next (as registered): a second pre-registration on held-out years.** The ForexFactory calendar reaches back to
  2007, and CME futures daily closes cover 2008–2017. The same D test can run there on data no study has scored for
  this question, with the bars fixed now. Only if that confirms can the panel say "release days have tended to move
  against the crowded side, by about 0.06 of a day's range".
- **The range line the prereg planned (R pass) is not added.**
- **The prereg's stopping rule** ("if this fails, no further conditional variants") does not trigger, because D
  passed. The held-out confirmation is the only variant it allows.
