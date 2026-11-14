# fomc-range-share — results

Prereg: `forge/FOMC_RANGE_SHARE_PREREG.md` (committed in `c6ec70b9`, 2026-11-14; A1 PRE-RESULTS in `3cfd7068`). Run 2026-11-14, seed 20261114, B = 2000 (1000 per instrument).
Branch `main`. Ledger id: `fomc-range-share`. Scripts `scripts/fomc-range-share/run.py` (stages `power`, `score`), `extras.py` (post-hoc) and `write_results.py`.

## Verdict: CONTEXT

Both gated cells pass their numbers. The statement half hour (14:00-14:30 ET) carries **21.6%** of the London-session realised variance on an FOMC day against **2.6%** in the same clock window on matched ordinary days (excess +0.190 [+0.166, +0.216]; gate +0.05; MDE 0.006). The press-conference hour (14:30-15:30 ET) carries **23.3%** on press-conference meetings against 3.6% (excess +0.197 [+0.174, +0.222]; gate +0.03; MDE 0.008). The registered control H3 fails, so by the prereg's own rule H2 is demoted: on statement-only meetings (2016-18, no press conference) the 14:30-15:30 hour still carries an excess of +0.055 [+0.033, +0.081] (n = 12), above the +0.03 margin with an interval that excludes 0. Part of the P-window excess is therefore the 14:00 reaction decaying into the next hour, not only the conference. Banked as a descriptive timing fact (`context`), not a validated press-conference effect.

## Scored cells

| Cell | n meetings | Estimate (mean pooled RV-share excess) | 95% CI | 97.5% CI (gate) | MDE | Pass bar | Cell verdict |
|---|---|---|---|---|---|---|---|
| H1 statement window S | 82 | +0.190 | [+0.166, +0.216] | [+0.163, +0.221] | 0.0063 | +0.05, lower end > 0 | PASS |
| H2 press-conference window P, press-conference meetings | 70 | +0.197 | [+0.174, +0.222] | [+0.171, +0.226] | 0.0076 | +0.03, lower end > 0 | PASS (demoted by H3) |
| H3 control: P window, statement-only meetings | 12 | +0.055 | [+0.033, +0.081] | [+0.031, +0.084] | about 0.020 | mean < 0.03 or interval includes 0 | FAILS (control does not hold) |

Range-share versions (secondary): S excess +0.293 [+0.265, +0.324]; P press-conference +0.362 [+0.316, +0.404]; P statement-only +0.165 [+0.113, +0.217].
Mean shares of the day's variance over the 82 scored meetings: FOMC day S 0.216, P 0.214; matched ordinary days S 0.026, P 0.037. Statement-only meetings: S 0.201, P 0.099.

## Controls

- **THE MIRROR (placebo clock sanity):** ordinary-day mean RV share S 0.020 (SD 0.019), P 0.036 (SD 0.021) from the power stage, far below the 0.15 bar and above zero. Placebo days exclude FOMC days, the days either side, and any day with a high-impact USD print near the clock (ForexFactory day-level, calendar_events 13:00-16:30 ET). 5.2 placebo days per meeting on average.
- **Calendar:** the 84 hard-coded scheduled meetings match the two calendar files within a day; 2026-07-29 has no file row (taken from the published Fed schedule); the 2020-03-15 emergency meeting is excluded.
- **Drops:** 1 meeting dropped for fewer than 3 placebo days; instrument-days failing the coverage rule are excluded per instrument (AUDUSD, USDCHF, NZDUSD and SPX500 lose the most: n = 40-57 meetings).
- **Lockbox:** M1 ends 2026-08-20; nothing after 2026-08-21 is scored.

## Deviations from the prereg

A1 (PRE-RESULTS): power table, concrete coverage rule, fixed meeting list. No other changes. The sensitivity windows (P as 14:30-15:00 and 14:30-16:00) were not run. The first commit of the A1 edit truncated the prereg file by mistake (an encoding error in my script); `3cfd7068` restored it from the registered text with A1 applied, so the prereg is unchanged from `c6ec70b9` apart from A1.

## Descriptive (not part of the verdict)

- **By era (excess RV share, S / P on press-conference meetings):** 2016-18 +0.216 / +0.132 (n 24); 2019-21 +0.200 / +0.156 (n 23); 2022-26 +0.165 / +0.246 (n 35). The statement window carries a little less and the press-conference hour more in the recent era.
- **By instrument:** every instrument's S and P excess is clearly positive. Indices carry less in S (NAS100 +0.136, SPX500 +0.132) than FX (+0.17 to +0.24) and more in P (NAS100 +0.194, SPX500 +0.233).
- **POST-HOC (results seen): press-conference vs statement-only inside 2016-18 only** (same era, so not an era effect): P excess +0.132 (n 12) vs +0.055 (n 12); difference +0.077 [+0.034, +0.119]. The conference adds a further share beyond the decay of the statement reaction; this is one comparison of 12 against 12 meetings and does not change the verdict.
- **POST-HOC: the session high or low printed inside the window** (instrument-days): FOMC days S 22%, P 39% against ordinary days S 6%, P 10%.

## What this changes

Nothing live. The Replay tab and the Event Response Book may print the shares as a timing fact with its interval ("about a fifth of the London-session variance on an FOMC day arrives in the half hour after the 14:00 ET statement, and about a fifth again in the next hour on press-conference days, against 2-4% in the same windows on ordinary days"). It is not a forecast, not a direction and not a trade rule. It would be reopened by a pre-registered split of the 14:30-15:30 hour into the first 15 minutes and the rest, or by the next press-conference meetings out of sample.
