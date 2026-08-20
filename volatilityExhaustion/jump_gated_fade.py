"""
jump_gated_fade.py — Phase 10b: the last cheap FX lever the research flagged.

Phase-8 (median_follow_conditioned) found high-jump median tags FOLLOW worse — i.e.
tags reached by a bipower JUMP tend to REVERT ("jumps to the median overshoot and
revert"). The one untested cheap FX check it named: a jump-gated FADE — fade the median
only when the tag arrived via a jump.

This mirrors the vetted costed_median_follow FADE geometry (dynamic median limit entry →
OC-median target, stop beyond) but returns the fill index so we can measure the pre-tag
bipower jump fraction and bucket the fade P&L by it, IS/OOS, pooled FX.

Pre-registered pass (per CLAUDE.md): the HIGH-jump fade bucket clears cost (mean > 0)
OOS AND beats the LOW-jump bucket, pooled FX AND ≥ 4/6 majors, same sign IS & OOS.
NULL benchmark: driftless walk → 0 net expectancy on any barrier bet.

Run: python3 jump_gated_fade.py            (6 FX majors, pooled)
     python3 jump_gated_fade.py EURUSD
"""
import os, sys, math
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma
from costed_median_follow import (INSTR, FX, CACHE, C_MED, OC_MED, COST_PCT, SLMULT,
                                  MIN_BARS, _resolve, _stats)
from median_follow_conditioned import _jump_frac, MIN_PRE


def _fade_trade(hi, lo, cl, O, s):
    """Dynamic-line median FADE; returns (pnl_net_pct, fill_idx) or None. Limit entry at
    the trailing median line, target the OC-median close level, stop beyond (mirrors
    costed_median_follow._day_trade fade branch, but exposes the fill index)."""
    n = hi.size
    hl = C_MED * s
    ocm = OC_MED * s
    slD = O * hl * SLMULT
    runHi = np.empty(n); runLo = np.empty(n); rh = rl = O
    for k in range(n):
        runHi[k] = rh; runLo[k] = rl
        if hi[k] > rh: rh = hi[k]
        if lo[k] < rl: rl = lo[k]
    orders = [
        dict(isBuy=False, typ='limit', slSign=+1, lvl=lambda k: runLo[k]*(1+hl), tp=lambda f: O*(1+ocm)),
        dict(isBuy=True,  typ='limit', slSign=-1, lvl=lambda k: runHi[k]*(1-hl), tp=lambda f: O*(1-ocm)),
    ]
    best = None
    for o in orders:
        r = _resolve(o, hi, lo, cl, O, slD)
        if r is None:
            continue
        if best is None or r[1] < best[1]:
            best = r
    if best is None:
        return None
    return (best[0] - COST_PCT, best[1])


def collect(pair):
    m1 = load_m1(os.path.join(CACHE, INSTR[pair]))
    daily = build_london_daily(m1)
    sig = causal_sigma(daily)
    nd = daily['open'].size; split = nd // 2
    rows = []   # (pnl, jumpfrac, seg)
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
        tr = _fade_trade(hi, lo, cl, O, s)
        if tr is None:
            continue
        pnl, fidx = tr
        jf = _jump_frac(cl, fidx)
        if jf is None:
            continue
        rows.append((pnl, jf, 0 if i < split else 1))
    return np.array(rows) if rows else np.empty((0, 3))


def _terciles(rows, seg):
    sub = rows[rows[:, 2] == seg]
    if sub.shape[0] < 90:
        return None
    v = sub[:, 1]
    q1, q2 = np.quantile(v, [1/3, 2/3])
    out = {}
    for bk, mask in [('lo', v <= q1), ('mid', (v > q1) & (v < q2)), ('hi', v >= q2)]:
        t = sub[mask]
        out[bk] = _stats(np.column_stack([t[:, 0], np.ones(t.shape[0]), t[:, 2]])) if t.shape[0] else None
    return q1, q2, out


def main():
    pairs = sys.argv[1:] or FX
    pairs = [p for p in pairs if p in INSTR] or FX
    print(f"\n{'='*88}\nPhase 10b — JUMP-GATED median FADE (bipower jump fraction pre-tag), costed, IS/OOS\n"
          f"  Hypothesis (Phase-8 pointer): high-jump tags REVERT → fade clears cost in the HI bucket.\n"
          f"  Pass: HI bucket mean>0 OOS AND > LO bucket, pooled + ≥4/6, same sign IS&OOS.\n{'='*88}")
    data = {p: collect(p) for p in pairs}
    npass = 0
    for pair in pairs:
        rows = data[pair]
        print(f"\n=== {pair} ===")
        oos_hi = oos_lo = is_hi = is_lo = None
        for seg, lab in [(0, 'IS'), (1, 'OOS')]:
            r = _terciles(rows, seg)
            if not r:
                print(f"  {lab}: (thin)"); continue
            q1, q2, cells = r
            row = "  ".join(f"{bk} n={cells[bk]['n']:4d} {cells[bk]['mean_pct']:+.4f}% w{cells[bk]['win']*100:.0f}%"
                            for bk in ('lo', 'mid', 'hi') if cells[bk])
            print(f"  {lab} jumpfrac (lo≤{q1:.2f}/hi≥{q2:.2f}): {row}")
            if seg == 0 and cells['hi'] and cells['lo']: is_hi, is_lo = cells['hi']['mean_pct'], cells['lo']['mean_pct']
            if seg == 1 and cells['hi'] and cells['lo']: oos_hi, oos_lo = cells['hi']['mean_pct'], cells['lo']['mean_pct']
        if oos_hi is not None and oos_hi > 0 and oos_hi > oos_lo and is_hi is not None and is_hi > is_lo:
            npass += 1

    # pooled
    allr = np.vstack([data[p] for p in pairs])
    print(f"\n{'='*88}\nPOOLED FX\n{'='*88}")
    pool = {}
    for seg, lab in [(0, 'IS'), (1, 'OOS')]:
        r = _terciles(allr, seg)
        if not r: continue
        q1, q2, cells = r
        pool[lab] = cells
        for bk in ('lo', 'mid', 'hi'):
            st = cells[bk]
            if st: print(f"  {lab} {bk:3}: n={st['n']:5d}  mean={st['mean_pct']:+.4f}%  win={st['win']*100:4.1f}%")
        print()
    print(f"{'='*88}\nPRE-REGISTERED VERDICT\n{'='*88}")
    hi_oos = pool.get('OOS', {}).get('hi'); lo_oos = pool.get('OOS', {}).get('lo')
    pooled_ok = hi_oos and hi_oos['mean_pct'] > 0 and lo_oos and hi_oos['mean_pct'] > lo_oos['mean_pct']
    print(f"  majors with HI>0 & HI>LO OOS (IS agrees): {npass}/{len(pairs)}  (pass ≥4)")
    if hi_oos: print(f"  pooled OOS HI-jump fade mean: {hi_oos['mean_pct']:+.4f}%  (LO {lo_oos['mean_pct']:+.4f}%)")
    verdict = 'PASS' if (pooled_ok and npass >= 4) else 'NULL'
    print(f"\n  >>> {verdict} <<<   "
          f"{'High-jump fades clear cost — a real jump-gated FX fade.' if verdict=='PASS' else 'Jump gating does not lift the fade over cost — closes the last cheap FX lever.'}")


if __name__ == '__main__':
    main()
