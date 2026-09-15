"""
har_intraday_isolation.py — Phase 15: is the intraday-RV win about GRANULARITY, or just
about HAR being a better functional form than Yang-Zhang, regardless of data?

WHY THIS EXISTS. Phase 14's control arm found HAR fit on intraday 5-minute realised
variance beating the shipped Yang-Zhang sigma by 9.7% (fx_major) / 21.0% (fx_cross) /
21.0% (metal) OOS QLIKE, log form. That number was never the thing being tested — it fell
out sideways — and it conflates two entirely different claims:

    (a) HAR's own functional form (daily/weekly/monthly lagged AVERAGES, fit walk-forward
        by OLS) is simply a better predictor shape than YZ's fixed-window estimator, even
        fed the SAME daily-only information YZ already has.
    (b) Intraday (5-minute) data carries genuine information a daily OHLC bar throws away.

Only (b) is the interesting, actionable claim — "the forecaster should read intraday
bars." (a) would mean the win is really "replace YZ's functional form", a much smaller and
differently-shaped change. This script separates them the only clean way available: fit
the IDENTICAL HAR machinery on DAILY-only realised variance (Garman-Klass from the day's
own OHLC — already computed by har_cj_forecast.load(), no new data needed) and compare
three, not two:

    YZ (incumbent)        the shipped estimator, unchanged
    HAR-daily              HAR functional form, fed ONLY daily GK variance
    HAR-intraday            HAR functional form, fed 5-min realised variance (Phase 14's win)

    (HAR-daily − YZ)        =  the functional-form contribution
    (HAR-intraday − HAR-daily) =  the granularity contribution — THE claim being tested

Reuses har_cj_forecast.py's own machinery byte-for-byte (har_walk, gk, qlike, fit_scale,
load, _scale, VAR_FLOOR_FRAC) — imported, never copied, per the Lego Principle. This is
the SAME numerical-care contract (scale by 1/median RV, floor at 1% of median RV, applied
identically to every model) that kept Phase 14's 7-column system from blowing up to QLIKE
in the millions; a 1-regressor HAR here is much better conditioned but the discipline is
kept for consistency and because it costs nothing.

PER-INSTRUMENT, not just pooled by asset class. Phase 14 (like this whole study) pools by
fx_major/fx_cross/metal. A pooled win can hide a result that is really 4 strong pairs
dragging 3 weak ones — this repo has been burned by exactly that shape of result before
(Tier-8's NQ echo test, the WaveTrend gates). So every pair is scored individually here,
and the verdict is a MAJORITY-of-instruments count, not a pooled number.

PRE-REGISTERED, before running:
    GRANULARITY holds if HAR-intraday beats HAR-daily by >= 2.0% OOS QLIKE (the same bar
    Phase 14 used) on a MAJORITY of instruments within an asset class, with both halves
    of the comparison computed on the log-form specification (Phase 14 found level-form
    badly conditioned for wide systems; kept here for consistency even though this system
    is narrow).
    FUNCTIONAL FORM is reported the same way (HAR-daily vs YZ) as context, not as a pass
    condition — it is not the claim this script exists to test.
FAIL = granularity does not clear on a majority of instruments -> the Phase 14 pooled
number was mostly (or entirely) a functional-form effect, not an intraday-data effect,
and the actionable claim ("read intraday bars") does not hold up to scrutiny.

Usage:  python3 har_intraday_isolation.py
"""
import os, sys, csv, collections
import numpy as np
from har_cj_forecast import (
    load, har_walk, gk, qlike, fit_scale, _scale, VAR_FLOOR_FRAC,
    OOS_FRAC, CLASSES, PASS_PCT, RV_CSV, LM_CSV, BARS_CSV,
)

MIN_OOS_PER_PAIR = 150    # a pair needs at least this many OOS days to report


def run_pair(rows, log_form):
    """Returns dict(model -> (is_qlike, oos_qlike, n_oos)) for one instrument."""
    gkv = np.array([r[1] for r in rows])
    rv5 = np.array([r[2] for r in rows])
    real = gkv                                    # primary proxy, matches Phase 14
    tf = (lambda v: np.log(v)) if log_form else (lambda v: v)

    S = _scale(real)
    FLOOR = (1.0 / S) * VAR_FLOOR_FRAC
    sc = lambda v: np.maximum(v, FLOOR) * S
    tgt = np.log(np.maximum(real, FLOOR) * S) if log_form else real * S

    preds = {}
    preds['HAR-daily (GK only)'] = har_walk(tgt, [tf(sc(gkv))])
    preds['HAR-intraday (RV 5m)'] = har_walk(tgt, [tf(sc(rv5))])
    sig = np.array([r[5] for r in rows])           # YZ sigma, aligned to predict day i
    yz = sig ** 2
    preds['YZ (incumbent)'] = np.log(np.maximum(yz, FLOOR) * S) if log_form else yz * S

    if log_form:
        for k in list(preds):
            p = preds[k]
            m = np.isfinite(p)
            if m.sum() > 10:
                resid = tgt[m] - p[m]
                preds[k] = np.where(m, np.exp(p) * float(np.mean(np.exp(resid[np.isfinite(resid)]))), np.nan)
    for k in list(preds):
        preds[k] = np.maximum(preds[k], FLOOR)

    ok = np.isfinite(real) & (real > 0)
    for p in preds.values():
        ok &= np.isfinite(p) & (p > 0)
    idx = np.flatnonzero(ok)
    if idx.size < 300:
        return None
    cut = int(idx.size * (1 - OOS_FRAC))
    is_i, oos_i = idx[:cut], idx[cut:]
    out = {}
    for name, p in preds.items():
        c = fit_scale(real[is_i], p[is_i])
        out[name] = (qlike(real[is_i], p[is_i] * c), qlike(real[oos_i], p[oos_i] * c), oos_i.size)
    return out


def main():
    for p in (RV_CSV, LM_CSV, BARS_CSV):
        if not os.path.exists(p):
            print(f'missing {os.path.basename(p)} — run the earlier phases first'); return 1
    series = load()
    print('=' * 100)
    print('PHASE 15 — is the intraday-RV win about GRANULARITY, or just a better HAR shape?')
    print('=' * 100)
    print(f'  {len(series)} instruments · log-form (primary) · GK proxy · '
          f'{int((1-OOS_FRAC)*100)}/{int(OOS_FRAC*100)} split')
    print(f'  PRE-REGISTERED: granularity holds if HAR-intraday beats HAR-daily by '
          f'>= {PASS_PCT}% OOS QLIKE on a MAJORITY of instruments per class')

    per_pair = {}                    # pair -> {model: (is,oos,n)}
    for pair, rows in sorted(series.items()):
        r = run_pair(rows, log_form=True)
        if r is None or r['HAR-daily (GK only)'][2] < MIN_OOS_PER_PAIR:
            continue
        per_pair[pair] = r

    by_class = collections.defaultdict(list)
    for pair, rows in series.items():
        if pair in per_pair:
            by_class[rows[0][6]].append(pair)

    print(f'\n  {"pair":9s} {"class":9s} {"n_oos":>6s} '
          f'{"YZ->daily":>10s} {"daily->intraday":>16s}   (OOS QLIKE improvement)')
    granularity_wins = collections.defaultdict(list)   # class -> [bool clears bar]
    functional_wins = collections.defaultdict(list)
    for ac in CLASSES:
        for pair in sorted(by_class[ac]):
            r = per_pair[pair]
            yz_o, daily_o, intra_o = r['YZ (incumbent)'][1], r['HAR-daily (GK only)'][1], r['HAR-intraday (RV 5m)'][1]
            n = r['HAR-daily (GK only)'][2]
            functional_imp = (yz_o - daily_o) / abs(yz_o) * 100 if yz_o else float('nan')
            gran_imp = (daily_o - intra_o) / abs(daily_o) * 100 if daily_o else float('nan')
            clears = gran_imp >= PASS_PCT
            granularity_wins[ac].append(clears)
            functional_wins[ac].append(functional_imp >= PASS_PCT)
            print(f'  {pair:9s} {ac:9s} {n:6d} {functional_imp:+9.2f}% {gran_imp:+15.2f}%'
                  f'{"  <- clears" if clears else ""}')

    print('\n' + '=' * 100)
    print('VERDICT — per asset class, majority-of-instruments')
    print(f'  {"class":9s} {"n":>4s} {"functional-form wins":>22s} {"granularity wins":>18s}')
    overall_pass = True
    for ac in CLASSES:
        wins_g = granularity_wins.get(ac, [])
        wins_f = functional_wins.get(ac, [])
        if not wins_g:
            continue
        maj_g = sum(wins_g) > len(wins_g) / 2
        maj_f = sum(wins_f) > len(wins_f) / 2
        print(f'  {ac:9s} {len(wins_g):4d} {sum(wins_f):9d}/{len(wins_f):<3d} {"(majority)" if maj_f else "":>9s} '
              f'{sum(wins_g):9d}/{len(wins_g):<3d} {"(majority)" if maj_g else "":>9s}')
        if not maj_g:
            overall_pass = False

    print()
    if overall_pass:
        print('  GRANULARITY HOLDS on a majority of instruments in every class.')
        print('  The Phase 14 win is a real intraday-data effect, not just HAR beating YZ')
        print('  on the same daily information. The actionable claim survives scrutiny.')
    else:
        print('  GRANULARITY DOES NOT clear a majority in at least one class.')
        print('  Read the functional-form column: if THAT clears instead, the Phase 14 win')
        print('  was mostly "HAR beats YZ\'s shape", not "intraday data beats daily data" —')
        print('  a smaller, differently-shaped claim than the one that looked exciting.')
    print('=' * 100)
    return 0 if overall_pass else 2


if __name__ == '__main__':
    sys.exit(main())
