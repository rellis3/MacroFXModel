"""fomc-range-share: assemble RESULTS.md and results.json from power.json, results.json (score stage) and extras.json."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
O = os.path.normpath(os.path.join(HERE, '..', '..', 'analysis', 'output', 'fomc-range-share')) + os.sep
res = json.load(open(O + 'results.json', encoding='utf-8'))
if 'detail' in res: res = res['detail']
ex = json.load(open(O + 'extras.json', encoding='utf-8'))
pw = json.load(open(O + 'power.json', encoding='utf-8'))
m = res['mean_event_share']; mp = res['mean_event_share_presser']; ms_ = res['mean_event_share_statement_only']
h1, h2, h3 = res['H1_S_excess_rvs'], res['H2_P_excess_rvs_presser'], res['H3_P_excess_rvs_statement_only']
E = res['H4_by_era']


def f(c):
    return '%+.3f [%+.3f, %+.3f]' % (c['mean'], c['lo950'], c['hi950'])


md = f"""# fomc-range-share — results

Prereg: `forge/FOMC_RANGE_SHARE_PREREG.md` (committed in `c6ec70b9`, 2026-11-14; A1 PRE-RESULTS in `3cfd7068`). Run 2026-11-14, seed 20261114, B = 2000 (1000 per instrument).
Branch `main`. Ledger id: `fomc-range-share`. Scripts `scripts/fomc-range-share/run.py` (stages `power`, `score`), `extras.py` (post-hoc) and `write_results.py`.

## Verdict: CONTEXT

Both gated cells pass their numbers. The statement half hour (14:00-14:30 ET) carries **{m['ev_rvs_S']*100:.1f}%** of the London-session realised variance on an FOMC day against **{m['pb_rvs_S']*100:.1f}%** in the same clock window on matched ordinary days (excess {f(h1)}; gate +0.05; MDE 0.006). The press-conference hour (14:30-15:30 ET) carries **{mp['ev_rvs_P']*100:.1f}%** on press-conference meetings against {mp['pb_rvs_P']*100:.1f}% (excess {f(h2)}; gate +0.03; MDE 0.008). The registered control H3 fails, so by the prereg's own rule H2 is demoted: on statement-only meetings (2016-18, no press conference) the 14:30-15:30 hour still carries an excess of {f(h3)} (n = 12), above the +0.03 margin with an interval that excludes 0. Part of the P-window excess is therefore the 14:00 reaction decaying into the next hour, not only the conference. Banked as a descriptive timing fact (`context`), not a validated press-conference effect.

## Scored cells

| Cell | n meetings | Estimate (mean pooled RV-share excess) | 95% CI | 97.5% CI (gate) | MDE | Pass bar | Cell verdict |
|---|---|---|---|---|---|---|---|
| H1 statement window S | {h1['n']} | {h1['mean']:+.3f} | [{h1['lo950']:+.3f}, {h1['hi950']:+.3f}] | [{h1['lo975']:+.3f}, {h1['hi975']:+.3f}] | 0.0063 | +0.05, lower end > 0 | PASS |
| H2 press-conference window P, press-conference meetings | {h2['n']} | {h2['mean']:+.3f} | [{h2['lo950']:+.3f}, {h2['hi950']:+.3f}] | [{h2['lo975']:+.3f}, {h2['hi975']:+.3f}] | 0.0076 | +0.03, lower end > 0 | PASS (demoted by H3) |
| H3 control: P window, statement-only meetings | {h3['n']} | {h3['mean']:+.3f} | [{h3['lo950']:+.3f}, {h3['hi950']:+.3f}] | [{h3['lo975']:+.3f}, {h3['hi975']:+.3f}] | about 0.020 | mean < 0.03 or interval includes 0 | FAILS (control does not hold) |

Range-share versions (secondary): S excess {f(res['H1_S_excess_range'])}; P press-conference {f(res['H2_P_excess_range_presser'])}; P statement-only {f(res['H3_P_excess_range_statement_only'])}.
Mean shares of the day's variance over the {h1['n']} scored meetings: FOMC day S {m['ev_rvs_S']:.3f}, P {m['ev_rvs_P']:.3f}; matched ordinary days S {m['pb_rvs_S']:.3f}, P {m['pb_rvs_P']:.3f}. Statement-only meetings: S {ms_['ev_rvs_S']:.3f}, P {ms_['ev_rvs_P']:.3f}.

## Controls

- **THE MIRROR (placebo clock sanity):** ordinary-day mean RV share S 0.020 (SD 0.019), P 0.036 (SD 0.021) from the power stage, far below the 0.15 bar and above zero. Placebo days exclude FOMC days, the days either side, and any day with a high-impact USD print near the clock (ForexFactory day-level, calendar_events 13:00-16:30 ET). 5.2 placebo days per meeting on average.
- **Calendar:** the 84 hard-coded scheduled meetings match the two calendar files within a day; 2026-07-29 has no file row (taken from the published Fed schedule); the 2020-03-15 emergency meeting is excluded.
- **Drops:** {res['n_dropped']} meeting dropped for fewer than 3 placebo days; instrument-days failing the coverage rule are excluded per instrument (AUDUSD, USDCHF, NZDUSD and SPX500 lose the most: n = 40-57 meetings).
- **Lockbox:** M1 ends 2026-08-20; nothing after 2026-08-21 is scored.

## Deviations from the prereg

A1 (PRE-RESULTS): power table, concrete coverage rule, fixed meeting list. No other changes. The sensitivity windows (P as 14:30-15:00 and 14:30-16:00) were not run. The first commit of the A1 edit truncated the prereg file by mistake (an encoding error in my script); `3cfd7068` restored it from the registered text with A1 applied, so the prereg is unchanged from `c6ec70b9` apart from A1.

## Descriptive (not part of the verdict)

- **By era (excess RV share, S / P on press-conference meetings):** 2016-18 {E['2016-18']['S']:+.3f} / {E['2016-18']['P_presser']:+.3f} (n {E['2016-18']['n']}); 2019-21 {E['2019-21']['S']:+.3f} / {E['2019-21']['P_presser']:+.3f} (n {E['2019-21']['n']}); 2022-26 {E['2022-26']['S']:+.3f} / {E['2022-26']['P_presser']:+.3f} (n {E['2022-26']['n']}). The statement window carries a little less and the press-conference hour more in the recent era.
- **By instrument:** every instrument's S and P excess is clearly positive. Indices carry less in S (NAS100 +0.136, SPX500 +0.132) than FX (+0.17 to +0.24) and more in P (NAS100 +0.194, SPX500 +0.233).
- **POST-HOC (results seen): press-conference vs statement-only inside 2016-18 only** (same era, so not an era effect): P excess {ex['presser_2016_18_P_excess']['mean']:+.3f} (n 12) vs {ex['statement_only_2016_18_P_excess']['mean']:+.3f} (n 12); difference {ex['difference']['mean']:+.3f} [{ex['difference']['lo95']:+.3f}, {ex['difference']['hi95']:+.3f}]. The conference adds a further share beyond the decay of the statement reaction; this is one comparison of 12 against 12 meetings and does not change the verdict.
- **POST-HOC: the session high or low printed inside the window** (instrument-days): FOMC days S {ex['extreme_in_window_FOMC_days']['S']['share']*100:.0f}%, P {ex['extreme_in_window_FOMC_days']['P']['share']*100:.0f}% against ordinary days S {ex['extreme_in_window_ordinary_days']['S']['share']*100:.0f}%, P {ex['extreme_in_window_ordinary_days']['P']['share']*100:.0f}%.

## What this changes

Nothing live. The Replay tab and the Event Response Book may print the shares as a timing fact with its interval ("about a fifth of the London-session variance on an FOMC day arrives in the half hour after the 14:00 ET statement, and about a fifth again in the next hour on press-conference days, against 2-4% in the same windows on ordinary days"). It is not a forecast, not a direction and not a trade rule. It would be reopened by a pre-registered split of the 14:30-15:30 hour into the first 15 minutes and the rest, or by the next press-conference meetings out of sample.
"""
open(O + 'RESULTS.md', 'w', encoding='utf-8').write(md)
out = {'id': 'fomc-range-share', 'verdict': 'context', 'ranAt': '2026-11-14T22:00:00Z', 'seed': 20261114, 'B': 2000,
       'prereg': 'forge/FOMC_RANGE_SHARE_PREREG.md', 'preregCommit': 'c6ec70b9', 'branch': 'main',
       'cells': [
           {'name': 'H1 statement window excess RV share', 'n': h1['n'], 'est': h1['mean'], 'lo': h1['lo950'], 'hi': h1['hi950'], 'mde': 0.0063, 'verdict': 'pass'},
           {'name': 'H2 press-conference window excess RV share (press-conference meetings)', 'n': h2['n'], 'est': h2['mean'], 'lo': h2['lo950'], 'hi': h2['hi950'], 'mde': 0.0076, 'verdict': 'pass, demoted by H3'},
           {'name': 'H3 control P window on statement-only meetings', 'n': h3['n'], 'est': h3['mean'], 'lo': h3['lo950'], 'hi': h3['hi950'], 'mde': 0.02, 'verdict': 'control fails'}],
       'detail': res, 'post_hoc': ex, 'power': pw}
json.dump(out, open(O + 'results.json', 'w', encoding='utf-8'), indent=1, default=str)
print(md[:1200])
