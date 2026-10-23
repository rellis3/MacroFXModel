# COG-MATCH-CONFIRM results

Registered in `forge/COG_MATCH_CONFIRM_PREREG.md` (51a89470) before the history run. The rule was applied once to the owner's 23 Oct 12:00 UTC example earlier (exploratory); this is the test on all history.

Decisions: 15,356. Decisions that produced at least one call (strong match + confirm): 3,190 (21%), about 24.7 per week. The fitted lead changed between consecutive decisions 68% of the time; median fitted lead 90 bars (22.5 h).

| horizon | calls | Explore mean signed move % (n) | Confirm mean signed move % (n) | Explore p | Confirm p | BH p | sign right | better of always-up/down | pass |
|---|---|---|---|---|---|---|---|---|---|
| 0.5h | 3014 | -0.0026 (1911) | +0.0066 (1103) | 0.681 | 0.173 | 0.921 | 49.4% | 52.6% | NO |
| 1h | 3079 | -0.0086 (1965) | +0.0123 (1114) | 0.872 | 0.093 | 0.921 | 49.9% | 53.7% | NO |
| 2h | 2883 | -0.0119 (1828) | +0.0102 (1055) | 0.876 | 0.251 | 0.921 | 48.7% | 54.8% | NO |
| 4h | 2618 | -0.0282 (1656) | -0.0076 (962) | 0.921 | 0.616 | 0.921 | 49.7% | 55.2% | NO |
| 8h | 2052 | -0.0367 (1292) | -0.0314 (760) | 0.851 | 0.816 | 0.921 | 48.5% | 56.2% | NO |

Placebo (line rotated by random days, 30 draws, maximum over horizons): Confirm real +0.0123 vs placebo median +0.0090, 95th +0.0479; Explore real -0.0026 vs placebo median +0.0153, 95th +0.0547.
**Registered verdict: the match-and-confirm process has an edge = NO** (0 of 5 horizons pass; placebo condition not met).

