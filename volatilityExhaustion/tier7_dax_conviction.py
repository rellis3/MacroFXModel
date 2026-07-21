"""
Tier 7 — conviction-gating on DAX daily (a REAL equity index, 2006-2026).

The NQ Tier-1 result (gating the trend edge helps) failed to replicate on gold. DAX is
the honest tie-breaker: a genuine equity index like NQ. No SPX/DAX/FTSE M1 exists in the
repo (would be in R2/Drive, unreachable here), but the conviction test runs on DAILY
bars, and dax_raw.csv has 20y of daily OHLC — enough to test it properly.

Same test as Tier 1b: TSMOM (momentum sign × inverse-vol), then down-weight the position
0.5× when the prior day was spent/chaotic (blew through its 75th OR efficiency < 0.35).
Does gating improve OOS Sharpe, and is the calm-vs-chaotic conditional edge signed like NQ
(calm better) or like gold (chaotic better)?
"""
import os, csv
import numpy as np
from vol_exhaustion_lib import yz_sigma
from budget_research_lib import (momentum_signal, rolling_vol, sharpe, efficiency,
                                 VOL_TARGET, MAX_LEV, COST_BP, BM_P75)

TRAIN_FRAC = 0.60
EFF_CHAOS = 0.35
HL75_INDEX = BM_P75 * 0.967


def load_dax():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..',
                        'Dax Base IFO System', 'System', 'data', 'dax_raw.csv')
    rows = list(csv.reader(open(path, encoding='utf-8-sig')))[1:]
    num = lambda s: float(s.replace(',', '').replace('%', ''))
    recs = []
    for r in rows:
        if len(r) < 5 or not r[1]:
            continue
        # Date DD/MM/YYYY, Price=close, Open, High, Low
        d, m, y = r[0].split('/')
        recs.append((int(y) * 10000 + int(m) * 100 + int(d), num(r[2]), num(r[3]), num(r[4]), num(r[1])))
    recs.sort()                                       # ascending by date
    o = np.array([x[1] for x in recs]); h = np.array([x[2] for x in recs])
    l = np.array([x[3] for x in recs]); c = np.array([x[4] for x in recs])
    return o, h, l, c


def run():
    o, h, l, c = load_dax()
    n = c.size
    rets = np.zeros(n); rets[1:] = np.where(c[:-1] > 0, (c[1:] - c[:-1]) / c[:-1], 0)
    yz = yz_sigma(o, h, l, c, 30)
    sig = np.empty(n); sig[:] = np.nan; sig[1:] = yz[:-1]        # causal σ_pred[i]=yz[i-1]

    er = efficiency(o, h, l, c)
    rhl = np.full(n, np.nan); ok = (sig > 0) & (o > 0)
    rhl[ok] = (h[ok] - l[ok]) / o[ok] / sig[ok]
    exc = (rhl > HL75_INDEX).astype(float)
    eff_prev = np.full(n, np.nan); eff_prev[1:] = er[:-1]
    exc_prev = np.full(n, np.nan); exc_prev[1:] = exc[:-1]

    s = momentum_signal(c); vol = rolling_vol(rets)
    pos = np.zeros(n)
    for i in range(n):
        v = vol[i]
        if v and np.isfinite(v) and v > 0:
            pos[i] = np.clip(s[i] * (VOL_TARGET / v), -MAX_LEV, MAX_LEV)
    chaos = (exc_prev == 1) | (eff_prev < EFF_CHAOS)
    gate = np.where(chaos, 0.5, 1.0)

    def strat(p):
        dr = np.zeros(n)
        for i in range(1, n):
            dr[i] = p[i - 1] * rets[i] - (COST_BP / 1e4) * abs(p[i - 1] - (p[i - 2] if i >= 2 else 0))
        return dr
    base = strat(pos); gated = strat(pos * gate)
    ntr = int(n * TRAIN_FRAC)

    print('=== DAX daily conviction-gating (real equity index, 2006-2026) ===')
    print(f'  full Sharpe        {sharpe(base):+.2f}  (validates DAX trends)')
    print(f'  base  OOS Sharpe   {sharpe(base[ntr:]):+.2f}')
    print(f'  gated OOS Sharpe   {sharpe(gated[ntr:]):+.2f}')
    sg = np.sign(pos); al = np.zeros(n); al[1:] = sg[:-1] * rets[1:]
    sc = [al[i] for i in range(2, ntr) if np.isfinite(eff_prev[i]) and chaos[i]]
    ca = [al[i] for i in range(2, ntr) if np.isfinite(eff_prev[i]) and not chaos[i]]
    print(f'  IS edge  calm {np.mean(ca)*1e4:+.2f}bp (n={len(ca)}) vs spent/chaotic {np.mean(sc)*1e4:+.2f}bp (n={len(sc)})')
    helps = sharpe(gated[ntr:]) > sharpe(base[ntr:])
    calm_better = np.mean(ca) > np.mean(sc)
    print(f'\n  gating helps OOS: {helps}   calm-edge > chaotic-edge: {calm_better}')
    print(f'  --> DAX verdict: {"echoes NQ (gating helps, calm better)" if helps and calm_better else "does NOT echo NQ"}')
    print('  (n=3 indices now: NQ echoes, gold reversed, DAX = tie-breaker)')


if __name__ == '__main__':
    run()
