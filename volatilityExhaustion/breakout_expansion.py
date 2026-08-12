"""
breakout_expansion.py — Style #2 off the same vol forecast: EXPANSION-gated BREAKOUT.

The mirror of all the fade work. Everything so far traded the lines as mean-reversion; this
trades them as a TREND/BREAKOUT: on days the (validated OOS) daytype classifier flags as
EXPANSION, ride a break of the 75th line instead of fading it. One forecast, a regime switch,
a second strategy — the "system of styles off one vol model" idea, backtested on the same rig.

Entry: stop through the trailing 75th line (up-break buy / down-break sell) — the day's
dominant thrust. Costed with breakout SLIPPAGE (unlike the fade's limit) + spread. Exit:
'close' = mark to session close (let it run), or 'ext' = a further 1.5×risk extension. Stop =
slMult × median distance back inside. Causal σ (yz[i-1]), lagged trailing anchor, IS/OOS.

Gate = the Phase-3 transparent EXPANSION rule (prior day blew its 75th OR σ accelerating),
reused from median_follow_gated (causal, pre-session). Legs: blind (all days) / EXPANSION
(gated) / CONTAINED (anti-gate — should be worse if the gate is real).

Pre-registered pass (per CLAUDE.md): expansion-gated breakout clears cost (mean>0) OOS AND
beats blind AND beats the contained anti-gate, pooled FX + ≥4/6 majors, IS/OOS same sign.
NULL benchmark: driftless walk → 0 net expectancy on any barrier bet.

Run: python3 breakout_expansion.py            (6 majors)
     python3 breakout_expansion.py EURUSD
"""
import os, sys
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma
from costed_median_follow import (INSTR, FX, CACHE, C_MED, C_75, COST_PCT, SLIP_PCT,
                                  MIN_BARS, _resolve, _stats, _fmt)
from median_follow_gated import _expansion_lean


def _breakout_trade(hi, lo, cl, O, s, slMult, tp_mode):
    """Stop-entry breakout through the trailing 75th line; returns (pnl_net_pct) or None."""
    n = hi.size
    hl75 = C_75 * s
    slip = O * SLIP_PCT / 100
    slD  = O * C_MED * s * slMult           # stop = slMult × median distance, back inside
    runHi = np.empty(n); runLo = np.empty(n); rh = rl = O
    for k in range(n):
        runHi[k] = rh; runLo[k] = rl
        if hi[k] > rh: rh = hi[k]
        if lo[k] < rl: rl = lo[k]
    def tp_up(f):
        e = runLo[f] * (1 + hl75) + slip
        return None if tp_mode == 'close' else e + 1.5 * slD
    def tp_dn(f):
        e = runHi[f] * (1 - hl75) - slip
        return None if tp_mode == 'close' else e - 1.5 * slD
    orders = [
        dict(isBuy=True,  typ='stop', slSign=-1, lvl=lambda k: runLo[k]*(1+hl75)+slip, tp=(None if tp_mode=='close' else tp_up)),
        dict(isBuy=False, typ='stop', slSign=+1, lvl=lambda k: runHi[k]*(1-hl75)-slip, tp=(None if tp_mode=='close' else tp_dn)),
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
    return best[0] - COST_PCT


def run_pair(pair, slMult, tp_mode):
    m1 = load_m1(os.path.join(CACHE, INSTR[pair]))
    daily = build_london_daily(m1)
    sig = causal_sigma(daily)
    lean = _expansion_lean(daily, sig)
    nd = daily['open'].size; split = nd // 2
    rows = []   # (pnl_net, seg, lean)
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
        r = _breakout_trade(m1['high'][a:b], m1['low'][a:b], m1['close'][a:b], O, s, slMult, tp_mode)
        if r is None:
            continue
        rows.append((r, 0 if i < split else 1, 1 if lean[i] else 0))
    return np.array(rows) if rows else np.empty((0, 3))


def _st(t):
    return _stats(np.column_stack([t[:, 0], np.ones(t.shape[0]), t[:, 1]])) if t.shape[0] else None


def _legs(t, seg):
    m = t[:, 1] == seg
    return dict(blind=_st(t[m]), expansion=_st(t[m & (t[:, 2] == 1)]), contained=_st(t[m & (t[:, 2] == 0)]))


CONFIGS = [('breakout·runclose·sl1.0', 1.0, 'close'),
           ('breakout·runclose·sl0.75', 0.75, 'close'),
           ('breakout·ext1.5R·sl1.0',   1.0, 'ext')]


def main():
    pairs = [p for p in sys.argv[1:] if p in INSTR] or FX
    print(f"\n{'='*96}\nStyle #2 — EXPANSION-gated BREAKOUT of the 75th line (costed w/ slippage, IS/OOS)\n"
          f"  Gate = Phase-3 expansion rule. Pass: expansion-gated >0 OOS AND > blind AND > contained,\n"
          f"  pooled + ≥4/6 majors. NULL: driftless → 0.\n{'='*96}")
    for label, slM, tpm in CONFIGS:
        data = {p: run_pair(p, slM, tpm) for p in pairs}
        npass = 0
        print(f"\n### {label}")
        for p in pairs:
            lo = _legs(data[p], 1)
            b, e, c = lo['blind'], lo['expansion'], lo['contained']
            if e and b and c and e['mean_pct'] > 0 and e['mean_pct'] > b['mean_pct'] and e['mean_pct'] > c['mean_pct']:
                npass += 1
        allt = np.vstack([data[p] for p in pairs])
        for seg, lab in [(0, 'IS'), (1, 'OOS')]:
            L = _legs(allt, seg)
            print(f"  {lab:3} blind {_fmt(L['blind'])}")
            print(f"      EXPANSION {_fmt(L['expansion'])}")
            print(f"      contained {_fmt(L['contained'])}")
        po = _legs(allt, 1)
        ok = po['expansion'] and po['blind'] and po['expansion']['mean_pct'] > 0 and po['expansion']['mean_pct'] > po['blind']['mean_pct']
        print(f"  >>> {'PASS' if (ok and npass>=4) else 'NULL'} — expansion-gated majors {npass}/{len(pairs)}; "
              f"pooled OOS expansion {po['expansion']['mean_pct']:+.4f}% vs blind {po['blind']['mean_pct']:+.4f}%")


if __name__ == '__main__':
    main()
