"""
forecast_vs_fade.py — Phase 1 (forecast accuracy, descriptive — NOT a trade).

Question (the honest one): is the forecast's dynamic H-L exhaustion line NEAR the
point where price actually fades, and can pre-session sigma PREDICT that fade point
on future days?

Construction — exactly as the forecaster draws the dynamic H-L line:
  Expected-High = running_low  + C*sigma      (projected up from the running low)
  Expected-Low  = running_high - C*sigma       (re-anchors on every new extreme)
  C = Feller * per-asset correction  (fx: median 1.572*0.820=1.289 ; 75th 2.049*0.817=1.674)

Actual fade point = the day's DOMINANT reversal (the pivot with the largest retrace
after it). Its realized H-L excursion (from the opposite running extreme up to the
turn) is what the Expected-High/Low line is trying to predict:
  realized_excursion / sigma   vs   C

We report, IS and OOS:
  1. where the actual fade sits in sigma-units vs the forecast median/75th lines,
  2. scatter of forecast distance (C75*sigma, varies by day) vs realized distance,
  3. the decisive test — does sigma-scaling predict the fade BETTER than a naive
     fixed % (calibrated on IS)? i.e. is the vol forecast adding real information?
Pure measurement. Benchmark named. Both outcomes pre-registered.
"""
import os, sys, json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma
from measure import INSTRUMENTS, HERE, CH, _london_date_str, _zigzag

# fx forecast constants (js/volBacktestEngine.js): Feller * hl_corr
C_MED = 1.572 * 0.820      # 1.289  — H-L median line
C_75  = 2.049 * 0.817      # 1.674  — H-L 75th line (the extended exhaustion line)
plt.rcParams.update({'figure.dpi': 110, 'font.size': 10, 'axes.grid': True, 'grid.alpha': .25})


def _dominant_fade(c, hi, lo, thr, O):
    """Return (realized_excursion_frac, kind) for the day's biggest turn, or None.
    realized_excursion = H-L span from the opposite running extreme up to the reversal
    (the thing the Expected-High/Low line predicts)."""
    piv = _zigzag(c, thr)
    if not piv:
        return None
    n = c.size
    best = None
    for pi in piv:
        # is this pivot a high or a low? compare to neighbours via running extents
        is_high = c[pi] >= (hi[:pi + 1].max() * .9999)   # near running max -> a high pivot
        is_low = c[pi] <= (lo[:pi + 1].min() * 1.0001)
        if is_high == is_low:                            # ambiguous -> classify by local slope
            is_high = c[pi] > c[max(0, pi - 5)]
            is_low = not is_high
        if is_high:
            retrace = (hi[:pi + 1].max() - lo[pi:].min()) / O
            excursion = (hi[:pi + 1].max() - lo[:pi + 1].min()) / O
            kind = 'high'
        else:
            retrace = (hi[pi:].max() - lo[:pi + 1].min()) / O
            excursion = (hi[:pi + 1].max() - lo[:pi + 1].min()) / O
            kind = 'low'
        if best is None or retrace > best[0]:
            best = (retrace, excursion, kind)
    if best is None:
        return None
    return best[1], best[2]      # realized excursion (frac), kind


def run(pair):
    rel, _ = INSTRUMENTS[pair]
    m1 = load_m1(os.path.join(HERE, '..', rel))
    daily = build_london_daily(m1)
    sig = causal_sigma(daily)
    nd = daily['open'].size
    split = nd // 2
    dayRange = (daily['high'] - daily['low'])
    medRange = np.median(dayRange[dayRange > 0])

    real_sig, fc75_px, real_px, seg, sg = [], [], [], [], []
    for i in range(nd):
        s = sig[i]
        if not (s > 0):
            continue
        a, b = daily['start'][i], daily['end'][i]
        if b - a < 60:
            continue
        O = daily['open'][i]
        if not (O > 0):
            continue
        c = m1['close'][a:b]; hi = m1['high'][a:b]; lo = m1['low'][a:b]
        thr = 0.25 * medRange                       # zigzag reversal threshold (price units)
        r = _dominant_fade(c, hi, lo, thr, O)
        if r is None:
            continue
        excursion, kind = r
        real_sig.append(excursion / s)              # realized fade distance in sigma-units
        real_px.append(excursion * 100)             # realized fade distance, % of open
        fc75_px.append(C_75 * s * 100)              # forecast 75th distance, % of open
        seg.append(0 if i < split else 1)
        sg.append(s)
    real_sig = np.array(real_sig); real_px = np.array(real_px)
    fc75_px = np.array(fc75_px); seg = np.array(seg); sg = np.array(sg)

    # naive fixed-% benchmark: the IS-median realized fade %, held constant (ignores sigma)
    is_mask = seg == 0
    naive_pct = np.median(real_px[is_mask])
    # forecast %: use the 75th line scaled so its IS median == IS median realized (fair calibration:
    # remove any constant bias so we test the SHAPE/sigma-scaling, not the level).
    k_cal = np.median(real_sig[is_mask])            # empirical fade constant (IS) -> the honest line
    fc_cal_px = k_cal * sg * 100                    # sigma-scaled forecast, level-matched on IS

    def mae(seg_val):
        m = seg == seg_val
        e_sig = np.mean(np.abs(real_px[m] - fc_cal_px[m]))     # sigma-scaled forecast error
        e_naive = np.mean(np.abs(real_px[m] - naive_pct))      # fixed-% error
        corr = np.corrcoef(sg[m], real_px[m])[0, 1]            # does sigma track realized fade?
        return e_sig, e_naive, corr, int(m.sum())

    out = dict(pair=pair, n=int(real_sig.size), split_date=_london_date_str(daily['day_idx'][split]),
               k_cal=float(k_cal), C_MED=C_MED, C_75=C_75,
               real_sig_median_IS=float(np.median(real_sig[is_mask])),
               real_sig_median_OOS=float(np.median(real_sig[seg == 1])))
    for lab, sv in [('IS', 0), ('OOS', 1)]:
        e_sig, e_naive, corr, nn = mae(sv)
        out[f'mae_sigma_{lab}'] = round(e_sig, 4)
        out[f'mae_naive_{lab}'] = round(e_naive, 4)
        out[f'sigma_beats_naive_{lab}'] = bool(e_sig < e_naive)
        out[f'corr_sigma_fade_{lab}'] = round(float(corr), 3)
        out[f'n_{lab}'] = nn
    # charts
    _chart_hist(pair, real_sig, seg, out)
    _chart_scatter(pair, sg, real_px, fc75_px, seg, out)
    return out


def _chart_hist(pair, real_sig, seg, out):
    fig, ax = plt.subplots(figsize=(8.4, 4.8))
    ax.hist(real_sig[real_sig < 4], bins=60, color='#4c72b0', alpha=.85)
    med = np.median(real_sig)
    ax.axvline(med, color='#d62728', lw=2, label=f'actual fade median = {med:.2f}$\\sigma$')
    ax.axvline(C_MED, color='#555', lw=1.6, ls=':', label=f'forecast H-L median = {C_MED:.2f}$\\sigma$')
    ax.axvline(C_75, color='#e08214', lw=1.6, ls='--', label=f'forecast H-L 75th = {C_75:.2f}$\\sigma$')
    ax.set_xlabel('actual dominant-fade excursion (units of forecast $\\sigma$)')
    ax.set_ylabel('days'); ax.set_title(f'{pair}  —  where price ACTUALLY fades vs the forecast lines')
    ax.legend(fontsize=8.5); fig.tight_layout()
    p = os.path.join(CH, f'{pair}_8_fade_vs_forecast_hist.png'); fig.savefig(p); plt.close(fig)


def _chart_scatter(pair, sg, real_px, fc75_px, seg, out):
    fig, ax = plt.subplots(figsize=(6.6, 6.4))
    for sv, lab, col in [(0, 'IS', '#1f77b4'), (1, 'OOS', '#d62728')]:
        m = seg == sv
        ax.scatter(fc75_px[m], real_px[m], s=5, alpha=.25, color=col, label=lab)
    lim = np.percentile(real_px, 98)
    ax.plot([0, lim], [0, lim], 'k--', lw=1, label='forecast = actual (45°)')
    ax.set_xlim(0, lim); ax.set_ylim(0, lim)
    ax.set_xlabel('forecast H-L 75th distance (% of open)')
    ax.set_ylabel('actual dominant-fade distance (% of open)')
    ax.set_title(f'{pair}  —  forecast line vs actual fade point\n'
                 f'OOS corr(σ, fade)={out["corr_sigma_fade_OOS"]}  '
                 f'σ-forecast MAE {out["mae_sigma_OOS"]:.3f} vs naive {out["mae_naive_OOS"]:.3f}')
    ax.legend(fontsize=8.5); fig.tight_layout()
    p = os.path.join(CH, f'{pair}_9_fade_scatter.png'); fig.savefig(p); plt.close(fig)


if __name__ == '__main__':
    pairs = sys.argv[1:] or ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'NQ']
    res = {}
    print(f'{"pair":7} {"n":>5} {"fadeMed(σ)IS/OOS":>16} {"corr(σ,fade)OOS":>15} '
          f'{"MAEσ/naive OOS":>16} {"σ wins?":>8}')
    for p in pairs:
        r = run(p); res[p] = r
        print(f'{p:7} {r["n"]:>5} {r["real_sig_median_IS"]:.2f}/{r["real_sig_median_OOS"]:.2f}         '
              f'{r["corr_sigma_fade_OOS"]:>13}   {r["mae_sigma_OOS"]:.3f}/{r["mae_naive_OOS"]:.3f}   '
              f'{"YES" if r["sigma_beats_naive_OOS"] else "no":>8}')
    with open(os.path.join(HERE, 'forecast_vs_fade_summary.json'), 'w') as f:
        json.dump(res, f, indent=2)
    print('\nforecast_vs_fade_summary.json written.')
