
## Verdict and what went wrong (written 2026-10-04 after the run above)

**The pre-registered design was degenerate.**
- The 80% schedule fitted to **0.0σ at every hour from about 16:00 London**: any running extreme is ≥80% final by
  then.
- Before 13:00, no distance up to 4σ reached 80% with 30+ days.
- **H11** "passed" (0.907 on unseen 2023–26, 34/34 instruments), but it only restates "late in the day the extremes are
  mostly in". It is a time fact, not a level.
- **H12** could not be tested: no touch fell "before" a defined schedule.
- **H13** was not run. A 0σ level after 16:00 would trigger both sides at once, and that is not the hypothesis.

**The cause:** D_h was the running extreme at the END of hour h. Late in the day that extreme was usually made hours
earlier, so it is trivially final.

**Post-hoc diagnostic (not pre-registered, both halves shown):** P(a NEW running extreme made during hour h is the
day's final one), by hour band and distance from the open in σ_used. 34 instruments, about 1.0M new-extreme events.

| hour band | half | <0.5σ | 0.5–1 | 1–1.5 | 1.5–2 | 2–2.5 | >2.5 |
|---|---|---|---|---|---|---|---|
| 00–07 | A / B | 0.10 / 0.10 | 0.12 / 0.12 | 0.15 / 0.13 | 0.17 / 0.18 | 0.18 / 0.20 | 0.31 / 0.28 |
| 07–11 | A / B | 0.15 / 0.14 | 0.16 / 0.16 | 0.17 / 0.17 | 0.18 / 0.18 | 0.20 / 0.16 | 0.18 / 0.24 |
| 11–14 | A / B | 0.19 / 0.18 | 0.20 / 0.20 | 0.20 / 0.21 | 0.20 / 0.22 | 0.22 / 0.24 | 0.23 / 0.29 |
| 14–17 | A / B | 0.31 / 0.30 | 0.31 / 0.31 | 0.31 / 0.31 | 0.32 / 0.31 | 0.31 / 0.32 | 0.30 / 0.35 |
| 17–20 | A / B | 0.35 / 0.35 | 0.34 / 0.35 | 0.36 / 0.34 | 0.35 / 0.33 | 0.38 / 0.34 | 0.38 / 0.31 |
| 20–24 | A / B | 0.65 / 0.63 | 0.64 / 0.62 | 0.64 / 0.63 | 0.66 / 0.64 | 0.67 / 0.66 | 0.67 / 0.69 |

**Conclusion:** whether a new extreme is the day's last depends on **time**, and almost not at all on **distance
travelled**. Within a time band the probability is flat across 0.5–2.5σ. A distance-based "exhaustion level" built from
price does not exist at these levels. That is consistent with the random-walk (reflection) property and with
`volatilityExhaustion/MARKET_STATE_FINDINGS.md` ("the fuel tank empties" is false).

**Design lesson:** the conditional table should have been checked before pre-registering a level-based schedule.
