"""
breakout_efficiency.py — does an intraday EFFICIENCY gate rescue the expansion-day breakout?

Expansion-day breakout is ~breakeven because it can't tell a clean-trend big day from a
big-CHOP whipsaw day (character isn't forecastable pre-open, Phase-3 AUC 0.505). But chop
REVEALS itself intraday: a choppy day covers little net ground per unit of path. So at the
moment of the 75th breakout, measure the session's Kaufman efficiency so far (causal, bars
open→fill) and gate: take the break only when the day is EFFICIENT/directional, skip when
choppy. Directly targets the chop-day entries that eat the trend-day gains.

ER = |close_fill − open| / Σ|Δclose|  over the session up to the fill bar (∈[0,1];
high = directional, low = chop). No lookahead (fill bar known at entry; trade plays out after).
Expansion days only. Buckets the costed breakout pnl by ER tercile, IS/OOS, pooled + per-pair.

Pre-registered pass: the HIGH-ER bucket clears cost (mean>0) OOS AND beats the LOW-ER bucket
AND beats ungated, pooled + ≥4/6 majors, same sign IS&OOS. NULL: driftless → 0.

Run: python3 breakout_efficiency.py            (6 majors)
     python3 breakout_efficiency.py EURUSD
"""
import os, sys
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma
from costed_median_follow import (INSTR, FX, CACHE, C_MED, C_75, COST_PCT, SLIP_PCT,
                                  MIN_BARS, _resolve, _stats)
from median_follow_gated import _expansion_lean

MIN_PRE = 15   # bars needed before the break for a meaningful efficiency read


def _breakout_fidx(hi, lo, cl, O, s, slMult=1.0):
    """Run-to-close breakout of the 75th; returns (pnl_net, fill_idx) or None."""
    n = hi.size
    hl75 = C_75 * s
    slip = O * SLIP_PCT / 100
    slD  = O * C_MED * s * slMult
    runHi = np.empty(n); runLo = np.empty(n); rh = rl = O
    for k in range(n):
        runHi[k] = rh; runLo[k] = rl
        if hi[k] > rh: rh = hi[k]
        if lo[k] < rl: rl = lo[k]
    orders = [
        dict(isBuy=True,  typ='stop', slSign=-1, lvl=lambda k: runLo[k]*(1+hl75)+slip, tp=None),
        dict(isBuy=False, typ='stop', slSign=+1, lvl=lambda k: runHi[k]*(1-hl75)-slip, tp=None),
    ]
    best = None
    for o in orders:
        r = _resolve(o, hi, lo, cl, O, slD)
        if r is None:
            continue
        if best is None or r[1] < best[1]:
            best = r
    return None if best is None else (best[0] - COST_PCT, best[1])


def _efficiency(cl, O, fidx):
    """Kaufman efficiency ratio open→fill (causal): |net| / Σ|Δ|. None if too few bars."""
    if fidx < MIN_PRE:
        return None
    path = np.abs(np.diff(cl[:fidx + 1])).sum()
    if path <= 0:
        return None
    return abs(cl[fidx] - O) / path


def run_pair(pair):
    m1 = load_m1(os.path.join(CACHE, INSTR[pair]))
    daily = build_london_daily(m1)
    sig = causal_sigma(daily)
    lean = _expansion_lean(daily, sig)
    nd = daily['open'].size; split = nd // 2
    rows = []   # (pnl, ER, seg) — expansion days only
    for i in range(nd):
        s = sig[i]
        if not (s > 0) or not lean[i]:
            continue
        a, b = daily['start'][i], daily['end'][i]
        if b - a < MIN_BARS:
            continue
        O = m1['open'][a]
        if not (O > 0):
            continue
        cl = m1['close'][a:b]
        tr = _breakout_fidx(m1['high'][a:b], m1['low'][a:b], cl, O, s)
        if tr is None:
            continue
        er = _efficiency(cl, O, tr[1])
        if er is None:
            continue
        rows.append((tr[0], er, 0 if i < split else 1))
    return np.array(rows) if rows else np.empty((0, 3))


def _st(t):
    return _stats(np.column_stack([t[:, 0], np.ones(t.shape[0]), t[:, 2]])) if t.shape[0] else None


def _terciles(rows, seg):
    sub = rows[rows[:, 2] == seg]
    if sub.shape[0] < 60:
        return None
    q1, q2 = np.quantile(sub[:, 1], [1/3, 2/3])
    out = {'ungated': _st(sub)}
    out['lo'] = _st(sub[sub[:, 1] <= q1])
    out['hi'] = _st(sub[sub[:, 1] >= q2])
    return q1, q2, out


def main():
    pairs = [p for p in sys.argv[1:] if p in INSTR] or FX
    print(f"\n{'='*84}\nIntraday EFFICIENCY gate on the expansion-day breakout (costed, IS/OOS)\n"
          f"  Hypothesis: high session-efficiency at the break → trend (not chop) → clears cost.\n"
          f"  Pass: HI-ER bucket >0 OOS AND > LO AND > ungated, pooled + ≥4/6, IS&OOS same sign.\n{'='*84}")
    data = {p: run_pair(p) for p in pairs}
    npass = 0
    for p in pairs:
        r_is, r_oos = _terciles(data[p], 0), _terciles(data[p], 1)
        print(f"\n=== {p} ===")
        for lab, r in [('IS', r_is), ('OOS', r_oos)]:
            if not r: print(f"  {lab}: (thin)"); continue
            q1, q2, c = r
            fmt = lambda st: f"{st['n']}@{st['mean_pct']*100:+.2f}bp/w{st['win']*100:.0f}%" if st else "—"
            print(f"  {lab} ER(lo≤{q1:.2f}/hi≥{q2:.2f}): ungated {fmt(c['ungated'])}  LO {fmt(c['lo'])}  HI {fmt(c['hi'])}")
        if r_is and r_oos:
            hi_o, lo_o, un_o = r_oos[2]['hi'], r_oos[2]['lo'], r_oos[2]['ungated']
            hi_i = r_is[2]['hi']
            if hi_o and lo_o and un_o and hi_i and hi_o['mean_pct'] > 0 and hi_o['mean_pct'] > lo_o['mean_pct'] and hi_o['mean_pct'] > un_o['mean_pct'] and hi_i['mean_pct'] > 0:
                npass += 1

    allr = np.vstack([data[p] for p in pairs])
    print(f"\n{'='*84}\nPOOLED FX")
    for lab, seg in [('IS', 0), ('OOS', 1)]:
        r = _terciles(allr, seg)
        if not r: continue
        q1, q2, c = r
        fmt = lambda st: f"n={st['n']:4d} {st['mean_pct']*100:+.2f}bp win={st['win']*100:.0f}%" if st else "—"
        print(f"  {lab} ER(lo≤{q1:.2f}/hi≥{q2:.2f}):  ungated {fmt(c['ungated'])} | LO {fmt(c['lo'])} | HI {fmt(c['hi'])}")
    po = _terciles(allr, 1)
    hi_o, un_o = (po[2]['hi'], po[2]['ungated']) if po else (None, None)
    ok = hi_o and un_o and hi_o['mean_pct'] > 0 and hi_o['mean_pct'] > un_o['mean_pct']
    print(f"\n  >>> {'PASS' if (ok and npass>=4) else 'NULL'} — HI-efficiency majors {npass}/{len(pairs)}"
          + (f"; pooled OOS HI {hi_o['mean_pct']*100:+.2f}bp vs ungated {un_o['mean_pct']*100:+.2f}bp" if hi_o else ""))


if __name__ == '__main__':
    main()
