"""
combined_book.py — the regime-ROUTED book: one equity curve off one vol forecast.

Routes each day to the regime-appropriate style (the "system of styles" payoff):
  • CONTAINED day → FADE the median line, but only if the fade is USD-trend-aligned
    (the +0.71bp side; opposed fades are skipped).
  • EXPANSION day → BREAKOUT the 75th line (ride the thrust).
One trade per pair per day. Compares the ROUTED book against each style run on ALL days
(fade-always, breakout-always) and blind, to answer: does routing beat either alone?

Reuses the vetted primitives: costed_median_follow (_resolve, costs, σ contract),
breakout_expansion (_breakout_trade), median_follow_gated (_expansion_lean). USD trend is the
same leave-one-out 10d construction as crossAssetFit, computed here in Python. Causal σ
(yz[i-1]), lagged anchors, IS/OOS, after-cost (spread; breakout also pays slippage).

Run: python3 combined_book.py
"""
import os, sys
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma
from costed_median_follow import (INSTR, FX, CACHE, C_MED, OC_MED, COST_PCT, SLMULT,
                                  MIN_BARS, _resolve, _stats, _fmt)
from median_follow_gated import _expansion_lean
from breakout_expansion import _breakout_trade

USD_BASE = {'EURUSD': -1, 'GBPUSD': -1, 'AUDUSD': -1, 'NZDUSD': -1, 'USDCAD': 1, 'USDCHF': 1}


def _median_fade(hi, lo, cl, O, s, usd_dir, base):
    """Fade the trailing median (earliest fill of either side). Returns (pnl_net, aligned)
    where aligned = the filled fade's direction agrees with the USD trend, or None."""
    n = hi.size
    hl = C_MED * s
    ocm = OC_MED * s
    slD = O * hl * SLMULT
    runHi = np.empty(n); runLo = np.empty(n); rh = rl = O
    for k in range(n):
        runHi[k] = rh; runLo[k] = rl
        if hi[k] > rh: rh = hi[k]
        if lo[k] < rl: rl = lo[k]
    # up-line fade = SHORT (fadeSign −1); down-line = LONG (+1).
    specs = [
        (False, -1, dict(isBuy=False, typ='limit', slSign=+1, lvl=lambda k: runLo[k]*(1+hl), tp=lambda f: O*(1+ocm))),
        (True,  +1, dict(isBuy=True,  typ='limit', slSign=-1, lvl=lambda k: runHi[k]*(1-hl), tp=lambda f: O*(1-ocm))),
    ]
    best = None   # (pnl_net, fill_idx, aligned) — compare on fill_idx (earliest fill wins)
    for isBuy, fadeSign, o in specs:
        r = _resolve(o, hi, lo, cl, O, slD)
        if r is None:
            continue
        aligned = bool(usd_dir) and (np.sign(fadeSign * base) == np.sign(usd_dir))
        if best is None or r[1] < best[1]:
            best = (r[0] - COST_PCT, r[1], aligned)
    return None if best is None else (best[0], best[2])


def _daily_ret_by_date(daily):
    d = {}
    c = daily['close']
    for i in range(1, c.size):
        if c[i-1] > 0 and c[i] > 0:
            d[daily['day_idx'][i]] = np.log(c[i] / c[i-1])
    return d


def main():
    # load everything (USD trend is cross-pair, so pre-load all majors)
    dat = {}
    for p in FX:
        m1 = load_m1(os.path.join(CACHE, INSTR[p]))
        daily = build_london_daily(m1)
        dat[p] = dict(m1=m1, daily=daily, sig=causal_sigma(daily),
                      lean=_expansion_lean(daily, causal_sigma(daily)), ret=_daily_ret_by_date(build_london_daily(m1)))
    all_dates = sorted(set().union(*[set(dat[p]['ret']) for p in FX]))
    # USD trend per pair per date: leave-one-out 10d trailing sum of other majors' USD returns
    di = {d: i for i, d in enumerate(all_dates)}
    usd = {p: {} for p in FX}
    for p in FX:
        for d in dat[p]['daily']['day_idx']:
            if d not in di:
                continue
            i = di[d]; s = 0.0; n = 0
            for q in FX:
                if q == p:
                    continue
                for k in range(max(0, i-10), i):     # strictly before d → causal
                    r = dat[q]['ret'].get(all_dates[k])
                    if r is not None: s += r * USD_BASE[q]; n += 1
            usd[p][d] = np.sign(s) if n else 0

    # build the books
    rows = {'routed': [], 'fade_blind': [], 'fade_aligned': [], 'fade_opposed': [], 'breakout_always': []}
    for p in FX:
        daily = dat[p]['daily']; sig = dat[p]['sig']; lean = dat[p]['lean']; m1 = dat[p]['m1']
        nd = daily['open'].size; split = nd // 2
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
            seg = 0 if i < split else 1
            ud = usd[p].get(daily['day_idx'][i], 0)
            fade = _median_fade(hi, lo, cl, O, s, ud, USD_BASE[p])   # (pnl, aligned) | None
            brk  = _breakout_trade(hi, lo, cl, O, s, 1.0, 'close')
            if fade is not None:
                rows['fade_blind'].append((fade[0], seg))
                rows['fade_aligned' if fade[1] else 'fade_opposed'].append((fade[0], seg))
            if brk is not None:
                rows['breakout_always'].append((brk, seg))
            # ROUTED: expansion → breakout ; contained → aligned fade only
            pick = brk if lean[i] else (fade[0] if (fade is not None and fade[1]) else None)
            if pick is not None:
                rows['routed'].append((pick, seg))

    print(f"\n{'='*80}\nREGIME-ROUTED BOOK vs components. After cost, IS/OOS, pooled 6 FX majors.\n"
          f"(routed = breakout on expansion days + USD-aligned median fade on contained days)\n{'='*80}")
    for name in ['routed', 'breakout_always', 'fade_blind', 'fade_aligned', 'fade_opposed']:
        t = np.array(rows[name]) if rows[name] else np.empty((0, 2))
        for seg, lab in [(0, 'IS'), (1, 'OOS')]:
            sub = t[t[:, 1] == seg]
            st = _stats(np.column_stack([sub[:, 0], np.ones(sub.shape[0]), sub[:, 1]])) if sub.shape[0] else None
            print(f"  {name:16} {lab:3} {_fmt(st)}")
        print()


if __name__ == '__main__':
    main()
