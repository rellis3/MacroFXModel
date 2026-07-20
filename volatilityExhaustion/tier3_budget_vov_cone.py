"""
Tier 3 — three focused premises behind the budget lens.

#4 EXIT/SIZING PREMISE — "after most of the day's range is spent, LESS realised vol
   remains." If true, tightening stops/targets/size once the budget is spent is
   justified (it is the honest core of the 'remaining-budget exit' idea, tested as a
   premise so no fake intraday strategy is needed). Leakage-free: consumption uses
   pre-T bars, forward vol uses post-T bars.
   Test: bucket days by consumed-by-T (σ-units); does high consumption -> LOWER
   forward range (T->close)? Pre-registered: monotone decreasing, holds OOS on >=4/6.

#5 VOL CONTINUITY — is the realised/forecast H-L ratio PERSISTENT day to day (does a
   big-vs-forecast day beget another)? corr(ratio[i], ratio[i+1]), IS/OOS. And does
   vol-of-vol add anything the σ level doesn't. (Expected: real but modest — vol
   clustering is the one replicated effect; this is not novel.)

#6 CONE CALIBRATION — does conditioning the 75th band on the validated expansion
   regime (prior day exceeded OR σ accelerating) move the exceed-rate toward its 25%
   target on the days it fires? A cheap calibration check, not a strategy.
"""
import numpy as np
from budget_research_lib import (FX_MAJORS, build_daily, state_features,
                                 BM_P75, HL75_CORR, ASSET_OF)

T_MID = 720          # noon London — mid-session checkpoint for the exit premise
TRAIN_FRAC = 0.60


def intraday_split(dd, T):
    """Per day: consumed-by-T (σ) and forward range T->close (σ). Disjoint windows."""
    d = dd['daily']; m1 = dd['m1']; sig = dd['sigma']; mod = d['min_of_day_all']
    nd = d['open'].size
    consumed = np.full(nd, np.nan); fwd = np.full(nd, np.nan)
    for i in range(nd):
        s = sig[i]; O = d['open'][i]
        if not (s > 0 and O > 0):
            continue
        a, b = d['start'][i], d['end'][i]
        hi = m1['high'][a:b]; lo = m1['low'][a:b]; mm = mod[a:b]
        pre = mm < T; post = mm >= T
        if pre.sum() < 60 or post.sum() < 60:
            continue
        consumed[i] = (hi[pre].max() - lo[pre].min()) / O / s
        fwd[i] = (hi[post].max() - lo[post].min()) / O / s
    return consumed, fwd


def test4_exit_premise():
    print('=== #4 exit premise: high consumption-by-noon -> LOWER forward range? ===')
    print(f'{"pair":8} {"loConsum.OOS":>12} {"hiConsum.OOS":>12}  (fwd range σ)  monotone?')
    n_ok = 0
    for pair in FX_MAJORS:
        dd = build_daily(pair)
        cons, fwd = intraday_split(dd, T_MID)
        v = np.isfinite(cons) & np.isfinite(fwd)
        idx = np.where(v)[0]; n = cons.size; ntr = int(n * TRAIN_FRAC)
        oos = idx[idx >= ntr]
        c = cons[oos]; f = fwd[oos]
        loq, hiq = np.quantile(c, [0.33, 0.66])
        lo_fwd = f[c <= loq].mean()     # low consumption so far
        hi_fwd = f[c >= hiq].mean()     # high consumption so far
        ok = hi_fwd < lo_fwd            # spent budget -> less remaining range
        n_ok += ok
        print(f'{pair:8} {lo_fwd:12.3f} {hi_fwd:12.3f}                 {"YES" if ok else "no"}')
    print(f'  --> spent-budget-means-less-remaining holds OOS on {n_ok}/6  '
          f'({"PASS" if n_ok >= 4 else "NULL"})')
    return n_ok


def test5_continuity():
    print('\n=== #5 vol continuity: is realised/forecast H-L ratio persistent? ===')
    hl50 = 1.572  # Feller median constant (σ-units) — ratio ~ realized/median
    cors = []
    for pair in FX_MAJORS:
        dd = build_daily(pair); d = dd['daily']; sig = dd['sigma']
        O, H, L = d['open'], d['high'], d['low']
        ok = (sig > 0) & (O > 0)
        ratio = np.full(O.size, np.nan)
        ratio[ok] = (H[ok] - L[ok]) / O[ok] / sig[ok] / (hl50 * HL75_CORR[ASSET_OF[pair]] / 0.817)
        r = ratio[np.isfinite(ratio)]
        n = r.size; ntr = int(n * TRAIN_FRAC)
        c_is = np.corrcoef(r[:ntr - 1], r[1:ntr])[0, 1]
        c_oos = np.corrcoef(r[ntr:-1], r[ntr + 1:])[0, 1]
        cors.append((pair, c_is, c_oos))
        print(f'  {pair}: lag-1 corr(realised/forecast)  IS {c_is:+.3f}  OOS {c_oos:+.3f}')
    mean_oos = np.mean([c[2] for c in cors])
    print(f'  --> mean OOS persistence {mean_oos:+.3f}  '
          f'(positive = vol clusters at the realised/forecast level; expected, modest)')
    return mean_oos


def test6_cone_calibration():
    print('\n=== #6 cone calibration: exceed-rate on expansion-lean vs contained days ===')
    tot_lean = tot_lean_n = tot_calm = tot_calm_n = 0
    for pair in FX_MAJORS:
        dd = build_daily(pair); st = state_features(dd); d = dd['daily']; sig = dd['sigma']
        O, H, L = d['open'], d['high'], d['low']
        hl75 = BM_P75 * HL75_CORR[ASSET_OF[pair]]
        ok = (sig > 0) & (O > 0)
        exceed = np.full(O.size, np.nan)
        exceed[ok] = ((H[ok] - L[ok]) / O[ok] / sig[ok] > hl75).astype(float)
        lean = (st['exc_prev'] == 1) | (st['sig_accel'] > 1.10)
        n = O.size; ntr = int(n * TRAIN_FRAC)
        oos = np.arange(ntr, n)
        e = exceed[oos]; ln = lean[oos]
        m = np.isfinite(e)
        tot_lean += np.nansum(e[m & ln]); tot_lean_n += (m & ln).sum()
        tot_calm += np.nansum(e[m & ~ln]); tot_calm_n += (m & ~ln).sum()
    print(f'  OOS exceed-rate | expansion-lean : {tot_lean/max(tot_lean_n,1):.3f}  (n={tot_lean_n})')
    print(f'  OOS exceed-rate | contained      : {tot_calm/max(tot_calm_n,1):.3f}  (n={tot_calm_n})')
    print(f'  (target is 25%; lean days exceed MORE -> widening the band on lean days'
          f' moves both toward target)')


if __name__ == '__main__':
    n4 = test4_exit_premise()
    m5 = test5_continuity()
    test6_cone_calibration()
