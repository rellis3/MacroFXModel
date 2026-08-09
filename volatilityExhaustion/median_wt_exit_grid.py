"""
median_wt_exit_grid.py — Phase 11b: monetize the (now real) WT-stretch-gated entry via the EXIT.

Phase 11 established the first entry with a genuine directional edge: the MTF WaveTrend-
stretch gate lifts the median-line fade win rate 50%→62% OOS (monotonic anti<blind<WT<MTF,
IS+OOS), but it stays sub-cost because the fade's exit geometry (modest target, wide stop,
mark-to-close) lets the wrong 38% (fading real continuations) give back the winners' gains.
The limiting factor is the EXIT, not direction. So — on the SAME MTF-gated median entry —
we test whether a better exit clears cost.

PRE-REGISTERED grid (kept small to avoid p-hacking the exit):
  PRIMARY  — tighten the stop (the continuation-loser tail is the drag), target fixed at
             the current OC-median: slMult ∈ {0.5, 0.75, 1.0, 1.5}.
  SECONDARY— at the best primary stop, vary the target: {ocmed, open, half}.
Pass: a cell clears cost (mean_pct > 0) OOS AND holds on ≥4/6 majors AND is positive IS too
(no IS/OOS sign flip). NULL benchmark: driftless walk → 0 net expectancy on any barrier bet.

Entry/gate/σ/costs are IDENTICAL to Phase 11 (reused), so only the exit changes.
Run: python3 median_wt_exit_grid.py            (6 majors)
     python3 median_wt_exit_grid.py EURUSD
"""
import os, sys
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma
from mtf_divergence import resample, WT, TF_MIN
from costed_median_follow import (INSTR, FX, CACHE, C_MED, OC_MED, COST_PCT, MIN_BARS,
                                  _resolve, _stats, _fmt)
from median_wt_gated_fade import wavetrend_wt1, _wt_at, OB_S, OS_S, LTF, HTF


def _orders(runHi, runLo, O, s, tp_mode):
    """Median fade orders with a parametrized TP toward the open. hl = median σ-distance."""
    hl = C_MED * s
    ocm = OC_MED * s
    if tp_mode == 'ocmed':
        tp_up = lambda f: O * (1 + ocm); tp_dn = lambda f: O * (1 - ocm)
    elif tp_mode == 'open':
        tp_up = lambda f: O;             tp_dn = lambda f: O
    elif tp_mode == 'half':
        tp_up = lambda f: O * (1 + 0.5 * hl); tp_dn = lambda f: O * (1 - 0.5 * hl)
    else:
        raise ValueError(tp_mode)
    return [
        dict(isBuy=False, typ='limit', slSign=+1, lvl=lambda k: runLo[k]*(1+hl), tp=tp_up),
        dict(isBuy=True,  typ='limit', slSign=-1, lvl=lambda k: runHi[k]*(1-hl), tp=tp_dn),
    ]


def run_pair(pair, slMult, tp_mode):
    """MTF-WT-stretch-gated median fade, parametrized exit. Returns (pnl_net, seg) rows."""
    m1 = load_m1(os.path.join(CACHE, INSTR[pair]))
    daily = build_london_daily(m1)
    sig = causal_sigma(daily)
    L = resample(m1, TF_MIN[LTF]); H = resample(m1, TF_MIN[HTF])
    wtL = wavetrend_wt1(L['high'], L['low'], L['close'], **WT)
    wtH = wavetrend_wt1(H['high'], H['low'], H['close'], **WT)
    um = m1['utc_min']
    nd = daily['open'].size; split = nd // 2
    rows = []
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
        slD = O * C_MED * s * slMult
        best = None
        for o in _orders(runHi, runLo, O, s, tp_mode):
            r = _resolve(o, hi, lo, cl, O, slD)
            if r is None:
                continue
            if best is None or r[1] < best[1]:
                best = (r[0], r[1], o['isBuy'])
        if best is None:
            continue
        pnl, fidx, isBuy = best
        t_fill = np.array([um[a + fidx]])
        wl = _wt_at(L['tmin'], wtL, t_fill, TF_MIN[LTF])[0]
        wh = _wt_at(H['tmin'], wtH, t_fill, TF_MIN[HTF])[0]
        if not (np.isfinite(wl) and np.isfinite(wh)):
            continue
        mtf_ok = (wl <= OS_S and wh <= OS_S) if isBuy else (wl >= OB_S and wh >= OB_S)
        if not mtf_ok:
            continue
        rows.append((pnl - COST_PCT, 0 if i < split else 1))
    return np.array(rows) if rows else np.empty((0, 2))


def _st(t, seg):
    sub = t[t[:, 1] == seg]
    return _stats(np.column_stack([sub[:, 0], np.ones(sub.shape[0]), sub[:, 1]])) if sub.shape[0] else None


# pre-registered grid
PRIMARY = [('sl0.5·ocmed', 0.5, 'ocmed'), ('sl0.75·ocmed', 0.75, 'ocmed'),
           ('sl1.0·ocmed', 1.0, 'ocmed'), ('sl1.5·ocmed', 1.5, 'ocmed')]
SECONDARY = [('sl0.75·open', 0.75, 'open'), ('sl0.75·half', 0.75, 'half')]


def main():
    pairs = [p for p in sys.argv[1:] if p in INSTR] or FX
    grid = PRIMARY + SECONDARY
    print(f"\n{'='*100}\nPhase 11b — EXIT grid on the MTF-WT-stretch-gated median fade "
          f"(entry/gate/σ/cost identical to Phase 11)\n"
          f"  Pass: a cell clears cost (mean>0) OOS AND ≥4/6 majors AND positive IS (no sign flip).\n{'='*100}")
    # collect per (cell, pair)
    cell_pair = {c[0]: {} for c in grid}
    for pair in pairs:
        for label, slM, tpm in grid:
            cell_pair[label][pair] = run_pair(pair, slM, tpm)

    print(f"\n{'PER-MAJOR OOS mean% (cell × pair)':<28}" + "".join(f"{p:>9}" for p in pairs) + "   pooled")
    winners = []
    for label, *_ in grid:
        oos_means = []
        pooled = np.vstack([cell_pair[label][p] for p in pairs])
        for p in pairs:
            st = _st(cell_pair[label][p], 1)
            oos_means.append(st['mean_pct'] if st else float('nan'))
        pool_is = _st(pooled, 0); pool_oos = _st(pooled, 1)
        npos = sum(1 for m in oos_means if m > 0)
        cells = "".join(f"{m:>+9.4f}" for m in oos_means)
        flag = ''
        if pool_oos and pool_oos['mean_pct'] > 0 and npos >= 4 and pool_is and pool_is['mean_pct'] > 0:
            flag = '  <<< PASS'; winners.append(label)
        print(f"  {label:<26}{cells}   {pool_oos['mean_pct']:+.4f} ({npos}/{len(pairs)}){flag}")

    print(f"\n{'='*100}\nPOOLED detail (IS | OOS)\n{'='*100}")
    for label, *_ in grid:
        pooled = np.vstack([cell_pair[label][p] for p in pairs])
        print(f"  {label:<16} IS {_fmt(_st(pooled,0))}   |   OOS {_fmt(_st(pooled,1))}")

    print(f"\n{'='*100}\nVERDICT: {'PASS — ' + ', '.join(winners) if winners else 'NULL — no exit cell clears cost OOS with ≥4/6 majors + positive IS.'}\n{'='*100}")


if __name__ == '__main__':
    main()
