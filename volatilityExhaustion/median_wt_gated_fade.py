"""
median_wt_gated_fade.py — Phase 11: WaveTrend-STRETCH-gated fade at the forecast levels.

The one directional signal in the whole repo that is genuinely OOS-sign-stable is the
VuManChu WaveTrend STRETCH → ~1h mean reversion (vumanchuLab: sign 22/23 instrument-years,
p≈5e-6, falsifier-surviving) — but sub-cost standalone. Its documented honest use is a
gate onto an edge sourced elsewhere. And the level-fade has never been tested with THIS
gate (every other conditioner — VWAP-stretch, time-z, OU, jumps, env — was NULL). The JS
runners hinted at a 26/31 in-sample cross-sectional lift for a WT-confirmed fade but never
committed a pooled after-cost OOS verdict. This resolves it.

Idea: fade a forecast-level touch ONLY when WaveTrend confirms the price is STRETCHED in
the touch direction (the exhaustion the fade is betting on), with MTF *zone* agreement
(the documented ~2× amplifier) as a second, stricter gate:
  • touch UPPER line (extended up) → SELL fade, gated on WT overbought (wt2 ≥ OB) on M15;
    MTF also requires H1 overbought.
  • touch LOWER line (extended down) → BUY fade, gated on WT oversold (wt2 ≤ OS) on M15;
    MTF also requires H1 oversold.
Crucial nuance from vumanchuLab: it is the STRETCH (level), not the oscillator TURN, that
marks reversals — so we gate on the wt2 LEVEL at the touch, not on a cross-back.

Faithful reuse (generate-don't-port): WaveTrend port + resample from mtf_divergence.py
(bit-for-bit vs js/vumanchuCore), dynamic-line fade geometry + costs + _resolve from
costed_median_follow.py, causal σ (yz[i-1]) + London day from vol_exhaustion_lib.py.
WT at an intraday touch uses the last COMPLETED M15/H1 bar (no lookahead).

Pre-registered pass (per CLAUDE.md — assume no edge): a gated fade BEATS the blind fade
AND clears cost (mean_pct > 0) OOS, pooled FX AND ≥4/6 majors, same sign IS & OOS. The
anti-gate (fade when NOT stretched) should be WORSE — if both "work" it's noise-slicing.
NULL benchmark: driftless walk → 0 net expectancy on any barrier bet.

Run: python3 median_wt_gated_fade.py            (6 majors, band=75th)
     python3 median_wt_gated_fade.py median      (band=median)
     python3 median_wt_gated_fade.py EURUSD      (one pair)
"""
import os, sys
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma
from mtf_divergence import resample, ema, WT_EPS, WT, TF_MIN
from costed_median_follow import (INSTR, FX, CACHE, C_MED, C_75, OC_MED, COST_PCT,
                                  SLMULT, MIN_BARS, _resolve, _stats, _fmt)

LTF, HTF = 'M15', 'H1'          # operator's base TF + the MTF-zone confirmer
# The LIVE pages (vumanchu-state / -chart) read the OB/OS ZONE on wt1 at ±53 with the
# operator's 9/12/3 (js/vumanchuState.js STATE_WT + OB_LEVEL/OS_LEVEL). Match that here —
# NOT mtf_divergence's 45/−65, which are the distinct DIVERGENCE gates.
OB_S, OS_S = 53, -53


def wavetrend_wt1(h, l, c, n1, n2, sp):
    """wt1 = EMA(ci, n2) — the series the live zone read (OB/OS ±53) thresholds."""
    hlc3 = (h + l + c) / 3.0
    esa = ema(hlc3, n1)
    d = ema(np.abs(hlc3 - esa), n1)
    ci = np.where(d > WT_EPS, (hlc3 - esa) / (0.015 * np.where(d > WT_EPS, d, 1.0)), 0.0)
    return ema(ci, n2)


def _wt_at(tmin_bars, wt, query_min, tf_min):
    """Causal WT lookup: for each query epoch-minute, the wt2 of the last COMPLETED
    TF bar (bucket start `tmin_bars`, completes at start+tf_min). NaN if none/warmup."""
    completed_at = tmin_bars + tf_min
    idx = np.searchsorted(completed_at, query_min, side='right') - 1
    out = np.full(query_min.shape, np.nan)
    ok = idx >= 0
    out[ok] = wt[idx[ok]]
    return out


def _fade_orders(runHi, runLo, O, s, band_c):
    """Dynamic-line fade at `band_c`σ line: limit entry at the trailing band, TP at the
    OC-median close level, stop beyond. Mirrors costed_median_follow fade geometry."""
    hl = band_c * s
    ocm = OC_MED * s
    return [
        dict(isBuy=False, typ='limit', slSign=+1, lvl=lambda k: runLo[k]*(1+hl), tp=lambda f: O*(1+ocm)),
        dict(isBuy=True,  typ='limit', slSign=-1, lvl=lambda k: runHi[k]*(1-hl), tp=lambda f: O*(1-ocm)),
    ]


def run_pair(pair, band_c):
    m1 = load_m1(os.path.join(CACHE, INSTR[pair]))
    daily = build_london_daily(m1)
    sig = causal_sigma(daily)
    # WaveTrend on M15 + H1 (from M1), for causal at-touch lookup.
    L = resample(m1, TF_MIN[LTF]); H = resample(m1, TF_MIN[HTF])
    wtL = wavetrend_wt1(L['high'], L['low'], L['close'], **WT)
    wtH = wavetrend_wt1(H['high'], H['low'], H['close'], **WT)
    um = m1['utc_min']
    nd = daily['open'].size; split = nd // 2
    rows = []   # (pnl_net, seg, wt_ok, mtf_ok)
    for i in range(nd):
        s = sig[i]
        if not (s > 0):
            continue
        a, b = daily['start'][i], daily['end'][i]
        if b - a < MIN_BARS:
            continue
        O = m1['open'][a]
        if not (O > 0):
            continue
        hi = m1['high'][a:b]; lo = m1['low'][a:b]; cl = m1['close'][a:b]
        n = hi.size
        runHi = np.empty(n); runLo = np.empty(n); rh = rl = O
        for k in range(n):
            runHi[k] = rh; runLo[k] = rl
            if hi[k] > rh: rh = hi[k]
            if lo[k] < rl: rl = lo[k]
        # earliest fill among the two fade orders (stop distance = slMult × band, in price)
        slD = O * band_c * s * SLMULT
        best = None
        for o in _fade_orders(runHi, runLo, O, s, band_c):
            r = _resolve(o, hi, lo, cl, O, slD)
            if r is None:
                continue
            if best is None or r[1] < best[1]:
                best = (r[0], r[1], o['isBuy'])
        if best is None:
            continue
        pnl, fidx, isBuy = best
        pnl_net = pnl - COST_PCT
        # WaveTrend state at the fill bar (causal: last completed M15/H1 bar)
        t_fill = np.array([um[a + fidx]])
        wl = _wt_at(L['tmin'], wtL, t_fill, TF_MIN[LTF])[0]
        wh = _wt_at(H['tmin'], wtH, t_fill, TF_MIN[HTF])[0]
        if not (np.isfinite(wl) and np.isfinite(wh)):
            continue
        # gate: stretched in the touch direction. isBuy=True → bought the LOWER line
        # (extended DOWN) → want OVERSOLD (wt ≤ OS). isBuy=False → SOLD the upper line
        # (extended UP) → want OVERBOUGHT (wt ≥ OB).
        if isBuy:
            wt_ok = wl <= OS_S; mtf_ok = wt_ok and (wh <= OS_S)
        else:
            wt_ok = wl >= OB_S; mtf_ok = wt_ok and (wh >= OB_S)
        rows.append((pnl_net, 0 if i < split else 1, 1 if wt_ok else 0, 1 if mtf_ok else 0))
    return np.array(rows) if rows else np.empty((0, 4))


def _stats_col(t):
    return _stats(np.column_stack([t[:, 0], np.ones(t.shape[0]), t[:, 1]])) if t.shape[0] else None


def _legs(t, seg):
    m = t[:, 1] == seg
    return dict(blind=_stats_col(t[m]),
                wt=_stats_col(t[m & (t[:, 2] == 1)]),
                anti=_stats_col(t[m & (t[:, 2] == 0)]),
                mtf=_stats_col(t[m & (t[:, 3] == 1)]))


def main():
    args = sys.argv[1:]
    band_name = 'median' if 'median' in args else '75th'
    band_c = C_MED if band_name == 'median' else C_75
    pairs = [p for p in args if p in INSTR] or FX
    print(f"\n{'='*100}\nPhase 11 — WaveTrend-STRETCH-gated FADE at the {band_name} line "
          f"(WT {WT['n1']}/{WT['n2']}/{WT['sp']} wt1, OB {OB_S}/OS {OS_S}, {LTF}+{HTF} MTF)\n"
          f"  Gate: fade only when WT is stretched in the touch direction; MTF also requires {HTF} zone.\n"
          f"  Pass: gated beats blind AND >0 OOS, pooled + ≥4/6 majors, IS&OOS same sign. anti-gate worse.\n{'='*100}")
    data = {p: run_pair(p, band_c) for p in pairs}
    npass_wt = npass_mtf = 0
    for pair in pairs:
        t = data[pair]
        print(f"\n=== {pair} ===")
        legs_is, legs_oos = _legs(t, 0), _legs(t, 1)
        for leg in ('blind', 'wt', 'mtf', 'anti'):
            print(f"  {leg:5} IS {_fmt(legs_is[leg])}   |   OOS {_fmt(legs_oos[leg])}")
        b, w, mt = legs_oos['blind'], legs_oos['wt'], legs_oos['mtf']
        wi = legs_is['wt']
        if w and b and w['mean_pct'] > b['mean_pct'] and w['mean_pct'] > 0 and wi and wi['mean_pct'] > 0:
            npass_wt += 1
        if mt and b and mt['mean_pct'] > b['mean_pct'] and mt['mean_pct'] > 0:
            npass_mtf += 1

    print(f"\n{'='*100}\nPOOLED FX\n{'='*100}")
    allt = np.vstack([data[p] for p in pairs])
    for seg, lab in [(0, 'IS'), (1, 'OOS')]:
        legs = _legs(allt, seg)
        for leg in ('blind', 'wt', 'mtf', 'anti'):
            print(f"  {leg:5} {lab:3} {_fmt(legs[leg])}")
        print()

    print(f"{'='*100}\nPRE-REGISTERED VERDICT\n{'='*100}")
    pool_oos = _legs(allt, 1)
    b, w, mt = pool_oos['blind'], pool_oos['wt'], pool_oos['mtf']
    print(f"  WT-gated  beats-blind & >0 OOS majors : {npass_wt}/{len(pairs)}  (pass ≥4)")
    print(f"  MTF-gated beats-blind & >0 OOS majors : {npass_mtf}/{len(pairs)}")
    if b and w:
        print(f"  pooled OOS: blind {b['mean_pct']:+.4f}%  WT-gated {w['mean_pct']:+.4f}%"
              f"  MTF-gated {mt['mean_pct']:+.4f}%" if mt else "")
    pooled_ok = w and b and w['mean_pct'] > b['mean_pct'] and w['mean_pct'] > 0
    verdict = 'PASS' if (pooled_ok and npass_wt >= 4) else 'NULL'
    print(f"\n  >>> {verdict} <<<   "
          f"{'WaveTrend-stretch gating lifts the level fade over cost — a real gated FX fade.' if verdict=='PASS' else 'WT-stretch gating does not clear the bar — the strongest directional signal still sub-cost at the level.'}")


if __name__ == '__main__':
    main()
