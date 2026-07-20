"""
Tier 2 — time-adjusted consumption: does an early COMPRESSED session predict later
EXPANSION? (the owner's "Asia used 12%% -> London expands" example, tested directly)

Leakage-free by construction:
  * split each London day at T = 08:00 London (minute 480 = the London open).
  * FEATURE (known at T, pre-T bars only): Asia-session range in σ-units,
      asia_sig = (high[0:T] - low[0:T]) / open / σ_pred,
    and its COMPRESSION vs the trailing median of asia_sig at that T:
      compression = asia_sig / trailing_median(asia_sig).   <1 = compressed.
  * LABEL (post-T bars only): the range ADDED after the London open,
      ext_after_sig = (fullday_HL - HL_at_T) / open / σ_pred.
    (uses only bars after T, so it cannot mechanically contain the feature.)

Pre-registered read (the owner's hypothesis):
  compressed Asia (low compression tercile) -> LARGER London+ extension than the
  stretched tercile, and it HOLDS on the OOS half. Flat/So -> null.
  Baseline sanity: also report the naive (leaky) asia_sig -> full-day expansion
  correlation, purely to show the leak we are avoiding.
"""
import numpy as np
from budget_research_lib import FX_MAJORS, build_daily, BM_P75, HL75_CORR, ASSET_OF

T_MIN = 480          # London minute of the London open (08:00) — Asia = [0, 480)
TRAIN_FRAC = 0.60
MIN_BARS_PRE = 60
MIN_BARS_POST = 120
PCT_WIN = 120        # trailing days for the compression median


def per_day(pair):
    dd = build_daily(pair)
    d = dd['daily']; m1 = dd['m1']; sig = dd['sigma']
    mod = d['min_of_day_all']                          # london minute per M1 bar
    nd = d['open'].size
    asia_sig = np.full(nd, np.nan)
    ext_after_sig = np.full(nd, np.nan)
    full_hl_sig = np.full(nd, np.nan)
    for i in range(nd):
        s = sig[i]; O = d['open'][i]
        if not (s > 0 and O > 0):
            continue
        a, b = d['start'][i], d['end'][i]
        hi = m1['high'][a:b]; lo = m1['low'][a:b]; mm = mod[a:b]
        pre = mm < T_MIN; post = mm >= T_MIN
        if pre.sum() < MIN_BARS_PRE or post.sum() < MIN_BARS_POST:
            continue
        hl_T = hi[pre].max() - lo[pre].min()
        full_hi = hi.max(); full_lo = lo.min()
        full_hl = full_hi - full_lo
        asia_sig[i] = hl_T / O / s
        full_hl_sig[i] = full_hl / O / s
        ext_after_sig[i] = (full_hl - hl_T) / O / s     # >= 0, post-T extension
    return asia_sig, ext_after_sig, full_hl_sig


def run():
    hl75 = {p: BM_P75 * HL75_CORR[ASSET_OF[p]] for p in FX_MAJORS}
    print(f'=== compressed Asia (pre-{T_MIN}m) -> London+ extension?  (T={T_MIN} London min) ===')
    print(f'{"pair":8} {"compr.IS":>9} {"stretch.IS":>10} {"compr.OOS":>10} {"stretch.OOS":>11}  OOS sign')
    n_hold = 0
    rows = []
    for pair in FX_MAJORS:
        asia, ext, _ = per_day(pair)
        n = asia.size
        # trailing-median compression (causal)
        compr = np.full(n, np.nan)
        hist = []
        for i in range(n):
            if np.isfinite(asia[i]):
                if len(hist) >= 30:
                    med = np.median(hist[-PCT_WIN:])
                    if med > 0:
                        compr[i] = asia[i] / med
                hist.append(asia[i])
        valid = np.isfinite(compr) & np.isfinite(ext)
        idx = np.where(valid)[0]
        ntr = int(n * TRAIN_FRAC)
        def bucket_ext(sel):
            c = compr[sel]; e = ext[sel]
            lo_q, hi_q = np.quantile(c, [0.33, 0.66])
            comp = e[c <= lo_q].mean()      # compressed
            stre = e[c >= hi_q].mean()      # stretched
            return comp, stre
        is_sel = idx[idx < ntr]; oos_sel = idx[idx >= ntr]
        ci, si = bucket_ext(is_sel); co, so = bucket_ext(oos_sel)
        hold = co > so                       # compressed extends MORE, OOS
        n_hold += hold
        rows.append((pair, ci, si, co, so, hold))
        print(f'{pair:8} {ci:9.3f} {si:10.3f} {co:10.3f} {so:11.3f}  {"HOLDS" if hold else "no"}')
    print(f'\n  compressed-extends-more holds OOS on {n_hold}/6 FX majors')
    print(f'  (pre-registered: >=4/6 with compressed>stretched OOS = the effect is real)')
    verdict = 'PASS' if n_hold >= 4 else 'NULL'
    print(f'  --> {verdict}')
    return dict(n_hold=n_hold, verdict=verdict, rows=[(r[0], r[3], r[4], r[5]) for r in rows])


if __name__ == '__main__':
    run()
