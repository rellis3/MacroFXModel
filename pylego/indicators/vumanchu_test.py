"""Golden + synthetic tests for pylego.indicators.vumanchu. Offline, no network.

The golden half asserts the Python brick reproduces `js/vumanchuCore.js`
bit-for-bit on vectors the JS itself generated
(`scripts/gen_vumanchu_vectors.mjs`). That is the whole defence against the
drift that already happened between the three hand-written Python copies.

The synthetic half pins the properties the RESEARCH variants must have —
causality above all, since a look-ahead in a feature panel does not raise an
error, it just produces a result that is too good.

    python pylego/indicators/vumanchu_test.py
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from pylego.indicators.vumanchu import (  # noqa: E402
    WT_EPS, agreement, align_htf_causal, causal_money_flow, causal_vwap_dist, ema,
    money_flow_raw, parity_money_flow, parity_vwap_osc, rephasing_baseline,
    rolling_vwap, sma, wave_trend,
)

HERE = os.path.dirname(os.path.abspath(__file__))
VECTORS = os.path.join(HERE, 'vumanchu_vectors.json')

# Float64 through two languages and two summation orders: exact equality is not
# the right bar, but anything above ~1e-9 means a real formula difference.
TOL = 1e-9

_checks = 0


def check(cond, label):
    global _checks
    _checks += 1
    if not cond:
        raise AssertionError(f'FAIL: {label}')
    print(f'  ok  {label}')


def close_to(a, b, label, tol=TOL):
    a = np.asarray(a, dtype=float)
    b = np.asarray([np.nan if v is None else v for v in b], dtype=float) if isinstance(b, list) else np.asarray(b, dtype=float)
    check(a.shape == b.shape, f'{label} — shape {a.shape} == {b.shape}')
    both_nan = np.isnan(a) & np.isnan(b)
    check(bool(np.all(np.isnan(a) == np.isnan(b))), f'{label} — NaN positions match')
    diff = np.abs(np.where(both_nan, 0.0, a - b))
    worst = float(np.nanmax(diff)) if diff.size else 0.0
    check(worst <= tol, f'{label} — max|delta| {worst:.3e} <= {tol:.0e}')


def cols(bars, *keys):
    return [np.array([b[k] for b in bars], dtype=float) for k in keys]


def main():
    with open(VECTORS) as fh:
        V = json.load(fh)

    print('\n== GOLDEN: parity with js/vumanchuCore.js ==')
    bars = V['bars']
    o, h, l, c, v = cols(bars, 'o', 'h', 'l', 'c', 'v')

    close_to(ema(c, 5), V['ema_5'], 'ema(close, 5)')
    close_to(sma(c, 7), V['sma_7'], 'sma(close, 7)')

    for key, label in (('wt_library', 'WT library 10/21/4'), ('wt_operator', 'WT operator 9/12/3')):
        p = V[key]['params']
        wt = wave_trend(h, l, c, n1=p['n1'], n2=p['n2'], sp=p['sp'])
        close_to(wt.wt1, V[key]['wt1'], f'{label} — wt1')
        close_to(wt.wt2, V[key]['wt2'], f'{label} — wt2')

    # The channel-index guard: a flat series sends every bar down the ci=0
    # branch. This is the exact line where the two former JS copies drifted.
    fb = V['flat_bars']
    fo, fh_, fl, fc = cols(fb, 'o', 'h', 'l', 'c')
    p = V['wt_flat']['params']
    wtf = wave_trend(fh_, fl, fc, n1=p['n1'], n2=p['n2'], sp=p['sp'])
    close_to(wtf.wt1, V['wt_flat']['wt1'], 'WT flat series (d <= WT_EPS branch) — wt1')
    check(float(np.max(np.abs(wtf.wt1))) == 0.0, 'WT flat series — wt1 is identically zero')

    # No-volume feed: reproduces the JS `?? 1` fallback.
    nb = V['bars_no_volume']
    no_, nh, nl, nc = cols(nb, 'o', 'h', 'l', 'c')
    p = V['wt_no_volume']['params']
    wtn = wave_trend(nh, nl, nc, n1=p['n1'], n2=p['n2'], sp=p['sp'])
    close_to(wtn.wt1, V['wt_no_volume']['wt1'], 'WT no-volume bars — wt1')

    close_to(parity_money_flow(o, h, l, c, v, period=14), V['money_flow_14'],
             'computeMoneyFlow(period=14)')

    vw, osc = parity_vwap_osc(h, l, c, v)
    close_to(vw, V['vwap_cumulative'], 'computeVWAP — cumulative vwap')
    close_to(osc, V['vwap_osc'], 'computeVWAP — osc')

    print('\n== GOLDEN: causal MTF alignment vs js/vumanchuMtf.alignHtfCausal ==')
    M = V['mtf']
    fast_close = np.array([b['t'] for b in bars], dtype=float) + M['fast_sec']
    slow_close = np.array([b['t'] for b in M['slow_bars']], dtype=float) + M['slow_sec']
    got = align_htf_causal(fast_close, slow_close, np.array(M['slow_wt1'], dtype=float))
    close_to(got, M['aligned_values'], 'alignHtfCausal — step-held values')

    print('\n== CAUSALITY: no future may reach a research column ==')
    # Truncation invariance: computing on a prefix must reproduce the prefix of
    # the full-history result. This is the property a feature panel lives on.
    cut = 400
    full_wt = wave_trend(h, l, c, n1=9, n2=12, sp=3).wt1
    pre_wt = wave_trend(h[:cut], l[:cut], c[:cut], n1=9, n2=12, sp=3).wt1
    close_to(pre_wt, full_wt[:cut], 'wave_trend — truncation invariant')

    full_mf = causal_money_flow(o, h, l, c, v, window=200, min_periods=50)
    pre_mf = causal_money_flow(o[:cut], h[:cut], l[:cut], c[:cut], v[:cut], window=200, min_periods=50)
    close_to(pre_mf, full_mf[:cut], 'causal_money_flow — truncation invariant')

    full_vd = causal_vwap_dist(h, l, c, v, window=20, sigma_window=200, min_periods=50)
    pre_vd = causal_vwap_dist(h[:cut], l[:cut], c[:cut], v[:cut], window=20, sigma_window=200, min_periods=50)
    close_to(pre_vd, full_vd[:cut], 'causal_vwap_dist — truncation invariant')

    close_to(rolling_vwap(h[:cut], l[:cut], c[:cut], v[:cut], window=20),
             rolling_vwap(h, l, c, v, window=20)[:cut], 'rolling_vwap — truncation invariant')

    # And the counterpart: the parity functions must FAIL that test, otherwise
    # the look-ahead warning in the docstring is wrong and the panel could have
    # safely used them.
    #
    # MEASURED NUANCE, and the reason this contamination is nasty: both parity
    # functions divide by the max over the whole array, so the corruption only
    # shows up when the truncation point falls BEFORE that global peak. Cut
    # after the peak and the output is bit-identical to the full-history run —
    # i.e. a spot-check on one window can show a clean zero and wrongly certify
    # the function as causal. Assert both halves so the property is documented
    # as conditional, not as "always differs".
    def peak_idx(series):
        return int(np.argmax(np.abs(np.asarray(series, dtype=float))))

    mf_peak = peak_idx(money_flow_raw(o, h, l, c, v))
    vo_peak = peak_idx(c - parity_vwap_osc(h, l, c, v)[0])

    for name, fn, pk in (
        ('parity_money_flow', lambda n: parity_money_flow(o[:n], h[:n], l[:n], c[:n], v[:n]), mf_peak),
        ('parity_vwap_osc', lambda n: parity_vwap_osc(h[:n], l[:n], c[:n], v[:n])[1], vo_peak),
    ):
        full = fn(len(c))
        before, after = pk // 2 + 1, min(len(c), pk + 200)
        d_before = float(np.max(np.abs(fn(before) - full[:before])))
        d_after = float(np.max(np.abs(fn(after) - full[:after])))
        check(d_before > 1e-6,
              f'{name} — IS look-ahead: cut BEFORE its peak (i={pk}) changes it ({d_before:.3g})')
        check(d_after == 0.0,
              f'{name} — and cut AFTER its peak is bit-identical ({d_after:.3g}) — '
              f'why the contamination is silent, not loud')

    print('\n== PROPERTIES: money flow ==')
    raw = money_flow_raw(o, h, l, c, v)
    up = c > o
    check(bool(np.all(raw[up] > 0)) and bool(np.all(raw[~up] < 0)),
          'money_flow_raw — sign follows candle direction')
    check(np.allclose(money_flow_raw(o, h, l, c, None), money_flow_raw(o, h, l, c, np.ones_like(v))),
          'money_flow_raw — volume=None equals unit volume (the `?? 1` fallback)')
    mf = causal_money_flow(o, h, l, c, v, window=200, min_periods=50)
    check(bool(np.all(np.abs(mf[np.isfinite(mf)]) <= 150.0 + 1e-9)),
          'causal_money_flow — clamped on amplitude')
    check(bool(np.any(~np.isfinite(mf[:50]))), 'causal_money_flow — warm-up is NaN, not guessed')
    # A single huge volume spike must not flatten the whole series (the ~18x
    # outlier problem that forced the chart onto a robust percentile).
    v_spike = v.copy(); v_spike[300] *= 500
    mf_spike = causal_money_flow(o, h, l, c, v_spike, window=200, min_periods=50)
    ref = np.nanstd(mf[400:]); got_sd = np.nanstd(mf_spike[400:])
    check(got_sd > ref * 0.5,
          f'causal_money_flow — survives a 500x volume outlier (sd {got_sd:.1f} vs {ref:.1f})')
    pmf_spike = parity_money_flow(o, h, l, c, v_spike)
    pmf = parity_money_flow(o, h, l, c, v)
    check(np.nanstd(pmf_spike) < np.nanstd(pmf) * 0.5,
          'parity_money_flow — IS flattened by the same outlier (the documented failure)')

    print('\n== PROPERTIES: VWAP variants ==')
    # The degeneracy: on a trending series the cumulative osc ramps one way and
    # pins at its own peak, while the rolling distance keeps oscillating.
    n = 400
    trend = np.arange(n, dtype=float) * 0.1 + 100
    th, tl, tc = trend + 0.05, trend - 0.05, trend
    tv = np.full(n, 10.0)
    _, cum_osc = parity_vwap_osc(th, tl, tc, tv)
    roll_d = causal_vwap_dist(th, tl, tc, tv, window=20, sigma_window=100, min_periods=30)
    cum_sign_flips = int(np.sum(np.diff(np.sign(cum_osc[50:])) != 0))
    roll_fin = roll_d[np.isfinite(roll_d)]
    check(cum_sign_flips == 0,
          f'cumulative VWAP osc — never crosses zero on a trend ({cum_sign_flips} flips): degenerate')
    check(bool(np.all(np.diff(cum_osc[50:]) >= -1e-12)),
          'cumulative VWAP osc — monotone ramp on a trend (stops being an oscillator)')
    check(roll_fin.size > 0 and float(np.max(np.abs(roll_fin))) < 1e6,
          'causal_vwap_dist — finite and bounded on the same trend')

    print('\n== PROPERTIES: MTF agreement + its baseline ==')
    wt_f = wave_trend(h, l, c, n1=9, n2=12, sp=3)
    slow = M['slow_bars']
    sh, sl_, sc = cols(slow, 'h', 'l', 'c')
    wt_s = wave_trend(sh, sl_, sc, n1=9, n2=12, sp=3)
    s1 = align_htf_causal(fast_close, slow_close, wt_s.wt1)
    s2 = align_htf_causal(fast_close, slow_close, wt_s.wt2)

    for mode in ('direction', 'level', 'zone'):
        a = agreement(wt_f.wt1, wt_f.wt2, s1, s2, mode=mode)
        fin = a[np.isfinite(a)]
        check(bool(np.all(np.isin(fin, (0.0, 1.0)))), f'agreement[{mode}] — 0/1/NaN only')
        base = rephasing_baseline(wt_f.wt1, wt_f.wt2, s1, s2, mode=mode, shifts=12)
        check(np.isfinite(base) and 0.0 <= base <= 1.0,
              f'agreement[{mode}] — baseline {base:.3f} in [0,1], rate {fin.mean():.3f}, '
              f'comparable {fin.size}/{a.size}')

    az = agreement(wt_f.wt1, wt_f.wt2, s1, s2, mode='zone')
    al = agreement(wt_f.wt1, wt_f.wt2, s1, s2, mode='level')
    check(int(np.sum(np.isfinite(az))) < int(np.sum(np.isfinite(al))),
          'agreement[zone] — comparable on fewer bars than level (check comparableBars)')

    # Identical series must agree ~everywhere; the baseline must NOT, or it is
    # not destroying the time correspondence and every delta would read zero.
    self_rate = np.nanmean(agreement(wt_f.wt1, wt_f.wt2, wt_f.wt1, wt_f.wt2, mode='level'))
    self_base = rephasing_baseline(wt_f.wt1, wt_f.wt2, wt_f.wt1, wt_f.wt2, mode='level', shifts=12)
    check(self_rate == 1.0, 'agreement — a series agrees with itself 100%')
    check(self_base < 0.95, f'rephasing_baseline — destroys correspondence (self-baseline {self_base:.3f})')

    try:
        agreement(wt_f.wt1, wt_f.wt2, s1, s2, mode='nonsense')
        raise SystemExit('FAIL: agreement accepted an unknown mode')
    except ValueError:
        check(True, 'agreement — unknown mode raises (fail loud)')

    check(WT_EPS == 1e-10, 'WT_EPS matches the JS brick')

    print(f'\nAll {_checks} checks passed.')


if __name__ == '__main__':
    main()
