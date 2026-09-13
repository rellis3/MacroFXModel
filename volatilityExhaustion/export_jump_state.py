"""
export_jump_state.py — freeze the jump/diffusion study into a small table the site serves.

The measurement itself is a BATCH job: Phases 12-13 read ~1.6GB of 1-min bars across 26
instruments and take the better part of an hour. Nothing about that belongs on a live API
request, so this script does what every other heavy study in this repo does — precompute
once, write a compact frozen table, and let the server read it (`vumanchuLab/data/
vumanchu_state_table.json` is the pattern being followed).

WHAT GOES IN, and deliberately what does not:

  per instrument   the reference DISTRIBUTION of daily jump share (p50/p75/p90/p95/p99)
                   plus jumps-per-day and the share of days carrying one. This is the
                   yardstick a live reading is scored against — "today is 22% jump-driven"
                   means nothing until you know 22% is this pair's 95th percentile.
  study verdicts   what each pre-registered phase actually concluded, carried as DATA so
                   the page cannot drift from the research. A page that states a finding
                   the study killed is worse than no page.

  NOT included: any forecast, any reliability multiplier, any trading signal. Three
  independent tests (Phase 12 sigma-strip, Phase 14 HAR-CJ in both level and log form,
  Phase 13's exhaustion conditioning) failed to turn the jump share into a better
  next-day number. The page may therefore describe TODAY and must not claim anything
  about TOMORROW.

Run after jump_diffusion_daily.py + jump_detect_lm.py:
    python3 export_jump_state.py       ->  data/jump_state.json
"""
import os, csv, json, math, collections
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RV_CSV = os.path.join(HERE, 'jump_diffusion_daily.csv')
LM_CSV = os.path.join(HERE, 'jump_detect_lm.csv')
OUT = os.path.join(HERE, 'data', 'jump_state.json')

PCTS = [50, 75, 90, 95, 99]


def main():
    for p in (RV_CSV, LM_CSV):
        if not os.path.exists(p):
            print(f'missing {os.path.basename(p)} — run the earlier phases first'); return 1
    rv = collections.defaultdict(list)
    ac = {}
    for r in csv.DictReader(open(RV_CSV)):
        rv[r['pair']].append((r['date'], float(r['jf_5m']), float(r['rv_5m'])))
        ac[r['pair']] = r['asset_class']
    lm = collections.defaultdict(dict)
    for r in csv.DictReader(open(LM_CSV)):
        lm[r['pair']][r['date']] = (int(r['n_jumps']), float(r['jump_var_share']),
                                    float(r['max_jump']), int(r['first_jump_utc_min']))

    instruments = {}
    for pair, rows in sorted(rv.items()):
        rows.sort()
        jf = np.array([x[1] for x in rows])
        nj = np.array([lm[pair].get(x[0], (0,))[0] for x in rows])
        instruments[pair] = dict(
            asset_class=ac[pair], n_days=len(rows),
            span=[rows[0][0], rows[-1][0]],
            jump_share_pct={f'p{q}': round(float(np.percentile(jf, q)) * 100, 2) for q in PCTS},
            mean_jump_share_pct=round(float(jf.mean()) * 100, 2),
            mean_jumps_per_day=round(float(nj.mean()), 2),
            days_with_jump_pct=round(float(np.mean(nj > 0)) * 100, 1),
        )

    doc = dict(
        generated_utc=__import__('datetime').datetime.utcnow().replace(microsecond=0).isoformat() + 'Z',
        method=dict(
            sampling='5-minute, London day, gap-spanning returns dropped',
            estimator='bipower variation (Barndorff-Nielsen & Shephard); '
                      'jump times by Lee-Mykland (2008), diurnally adjusted',
            jump_share='max(RV-BV, 0) / RV  — a continuous descriptive share, NOT a '
                       'binary jump/no-jump classifier',
            null_reference='under pure diffusion ~1% of days would show >=1 detected jump',
        ),
        instruments=instruments,
        findings=[
            dict(id='events', phase='12', verdict='validated',
                 claim='Days carrying a Major macro release are measurably jumpier.',
                 detail='12/12 cells — every asset class, both halves of the sample, both '
                        'sampling frequencies (t +2.09 to +14.04). On event days the '
                        'largest 1-min move lands within 5 minutes of a release 35-41% of '
                        'the time against a ~1% chance baseline.'),
            dict(id='decay', phase='13', verdict='validated',
                 claim='Jump-driven volatility mean-reverts faster than smooth volatility.',
                 detail='At a matched volatility level, high-vol jump-driven days decay to '
                        '0.78-0.83 of today\'s realised variance by tomorrow vs 0.93-0.97 '
                        'for smooth ones — 6/6 cells. Artifact-controlled: regressing '
                        'log RV(t+1) on log RV(t) + jump share leaves the jump coefficient '
                        'at -0.99 to -1.47, t -4.2 to -31.1.'),
            dict(id='cluster', phase='13', verdict='null',
                 claim='Jumps do NOT cluster day to day.',
                 detail='Rank autocorrelation of jump share +0.03 to +0.08 (lift 1.03-1.14x). '
                        'The same computation on realised variance gives +0.69 to +0.77 '
                        '(lift 2.40-2.70x) — volatility clusters hard, jumps barely do. There '
                        'is no shock regime in which one jump raises tomorrow\'s jump odds.'),
            dict(id='direction', phase='13', verdict='null',
                 claim='Nothing here predicts direction.',
                 detail='Next-day continuation sits at 44-52% in every cell of every split — '
                        'high/low volatility, jump-driven/smooth, all four quadrants of the '
                        'frequency x size map, both halves, all asset classes.'),
            dict(id='exhaustion', phase='13', verdict='null',
                 claim='A jump-driven extreme exhausts no differently from a smooth one.',
                 detail='Conditioning the fresh-extreme hold race on the causal pre-extreme '
                        'jump share, within distance bands: pooled +0.0031 in-sample, '
                        '-0.0008 out-of-sample, signs pointing opposite ways across '
                        'instruments, on cells of 1,000-3,700 observations.'),
            dict(id='forecast', phase='12 & 14', verdict='null',
                 claim='The jump share does NOT improve tomorrow\'s volatility forecast.',
                 detail='Tested twice and failed twice. Stripping the jump component out of '
                        'the Yang-Zhang sigma: -0.24%/+0.26%/-0.16% OOS QLIKE against a +2% '
                        'bar. Feeding the continuous and jump components in as separate '
                        'HAR regressors (the form built to carry exactly this): +0.4% to '
                        '-0.7% against the same HAR without the split. This is why the page '
                        'describes today and claims nothing about tomorrow.'),
            dict(id='intraday_rv', phase='14', verdict='lead',
                 claim='Intraday realised variance beats the shipped daily sigma as a '
                       'forecast input — but this was the control arm, not the hypothesis.',
                 detail='HAR on 5-minute realised variance beats the incumbent Yang-Zhang '
                        'sigma by 9.7% (FX majors), 21.0% (crosses) and 21.0% (gold) on OOS '
                        'QLIKE, consistently across both specifications. NOT pre-registered '
                        '— it fell out of the control arm of the jump test — so it needs its '
                        'own pre-registered confirmation before anything is built on it.'),
        ],
        contract='Descriptive state only. Never a trading signal, and never wired into '
                 'the live bot plan-building path (volatilityBotPlan.js / '
                 'volatilityBotProducer.js).',
    )
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(doc, f, indent=1)
    kb = os.path.getsize(OUT) / 1024
    print(f'wrote {os.path.relpath(OUT, HERE)} — {len(instruments)} instruments, {kb:.1f} KB')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
