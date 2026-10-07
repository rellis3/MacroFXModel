"""C.OG's two setups (forge/COG_SETUPS_PREREG.md): A = fade at his median O-C line, B = London-midnight retest in the
breakaway direction (+ mirror). M1 fills, London sessions 00:00-22:00, 2016-10 -> 2026-08.
Also scores the same setups on his exact published lines (KV vol_reference_*) where we have M1 (descriptive).

    python scripts/cog_setups/build.py <refdump.json>   -> analysis/output/cog_setups/trades.csv
"""
import sys, json, math, datetime as dt
from pathlib import Path
import numpy as np
sys.path.insert(0, 'volatilityExhaustion')
from vol_exhaustion_lib import load_m1, build_london_daily, hv_sigma

OUT = Path('analysis/output/cog_setups'); OUT.mkdir(parents=True, exist_ok=True)
INS = {  # path, his/ours sigma scale (checked vs his 72 published days), round-trip cost %
    'EURUSD': ('VolRangeForecaster/data/m1/eurusd_m1.parquet', 1.250, 0.008),
    'GOLD': ('VolRangeForecaster/data/m1/gold_m1.parquet', 1.146, 0.02),
    'NQ': ('portfolioBacktest/cache/nq_m1.parquet', 0.977, 0.008),
}
MED, P75 = 0.74, 1.24
B_AWAY, B_STOP = 0.37, 0.1
ref = json.load(open(sys.argv[1]))['ref'] if len(sys.argv) > 1 else {}


def run_exit(o, h, l, c, k, side, Ef, stop, tgt):
    """Stop first on the fill bar; target from the next bar; else the last bar's close."""
    if (l[k] <= stop) if side > 0 else (h[k] >= stop):
        return 'stop', stop
    for j in range(k + 1, len(o)):
        if (l[j] <= stop) if side > 0 else (h[j] >= stop):
            return 'stop', stop
        if (h[j] >= tgt) if side > 0 else (l[j] <= tgt):
            return 'target', tgt
    return 'close', c[-1]


def setup_a(o, h, l, c, mod, op, med, p75, cost):
    out = []
    for side in (1, -1):
        E = op * (1 - side * med); stop = op * (1 - side * p75); tgt = E + side * (med / 2) * op
        hit = np.flatnonzero((mod < 21 * 60) & ((l <= E) if side > 0 else (h >= E)))
        if not hit.size: continue
        k = hit[0]
        res, ex = run_exit(o, h, l, c, k, side, E, stop, tgt)
        out.append((side, int(mod[k]), res, (side * (ex - E) - cost * E) / abs(E - stop)))
    return out


def setup_b(o, h, l, c, mod, op, sig, cost, away=B_AWAY, p75=P75):
    up, dn = op * (1 + away * sig), op * (1 - away * sig)
    m = np.flatnonzero((mod < 16 * 60) & ((h >= up) | (l <= dn)))
    if not m.size: return []
    k0 = m[0]
    if h[k0] >= up and l[k0] <= dn: return []                       # both ways in one bar: ambiguous
    b = 1 if h[k0] >= up else -1
    rt = np.flatnonzero((np.arange(len(o)) > k0) & (mod < 20 * 60) & ((l <= op) if b > 0 else (h >= op)))
    if not rt.size: return []
    k = rt[0]
    if (o[k] < op) if b > 0 else (o[k] > op): return []             # gapped through the open: no clean retest fill
    out = []
    for side, tag in ((b, 'B'), (-b, 'Bmirror')):
        stop = op * (1 - side * B_STOP * sig); tgt = op * (1 + side * p75 * sig)
        res, ex = run_exit(o, h, l, c, k, side, op, stop, tgt)
        out.append((tag, side, int(mod[k]), res, (side * (ex - op) - cost * op) / abs(op - stop)))
    return out


rows = ['ins,date,setup,side,t20,p1,fill_min,outcome,R,sig']
for ins, (path, scale, cost_pct) in INS.items():
    m1 = load_m1(path)
    d = build_london_daily(m1)
    mod_all = d['min_of_day_all']
    sig_all = hv_sigma(d, 30) * scale
    cost = cost_pct / 100
    n = 0
    for i in range(22, len(d['open'])):
        date = str(dt.date(1970, 1, 1) + dt.timedelta(days=int(d['day_idx'][i])))
        if date < '2016-10-04': continue
        s, e = d['start'][i], d['end'][i]
        mod = mod_all[s:e]; keep = mod < 22 * 60
        if keep.sum() < 600 or mod[0] > 5: continue
        o, h, l, c, mod = (m1['open'][s:e][keep], m1['high'][s:e][keep], m1['low'][s:e][keep], m1['close'][s:e][keep], mod[keep])
        op = o[0]
        C = d['close']
        t20 = int(np.sign(C[i - 1] / C[i - 21] - 1)); p1 = int(np.sign(C[i - 1] / C[i - 2] - 1))
        sig = sig_all[i]
        if sig > 0:
            for side, fm, res, R in setup_a(o, h, l, c, mod, op, MED * sig, P75 * sig, cost):
                rows.append(f'{ins},{date},A,{side},{t20},{p1},{fm},{res},{R:.5f},{sig:.6f}'); n += 1
            for tag, side, fm, res, R in setup_b(o, h, l, c, mod, op, sig, cost):
                rows.append(f'{ins},{date},{tag},{side},{t20},{p1},{fm},{res},{R:.5f},{sig:.6f}'); n += 1
        r = ref.get(date, {}).get(ins)                                # his exact published lines (2026 days)
        if r:
            hs = r['vol'] / 100 / math.sqrt(252)
            for side, fm, res, R in setup_a(o, h, l, c, mod, op, r['oc_med'] / 100, r['oc_75'] / 100, cost):
                rows.append(f'{ins},{date},A_his,{side},{t20},{p1},{fm},{res},{R:.5f},{hs:.6f}')
            for tag, side, fm, res, R in setup_b(o, h, l, c, mod, op, hs, cost, away=r['oc_med'] / 200 / hs, p75=r['oc_75'] / 100 / hs):
                rows.append(f'{ins},{date},{tag}_his,{side},{t20},{p1},{fm},{res},{R:.5f},{hs:.6f}')
    print(ins, n, 'trades', flush=True)
(OUT / 'trades.csv').write_text('\n'.join(rows) + '\n')
