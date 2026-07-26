"""
median_follow_conditioned.py — can OU half-life or jumpiness isolate the SUBSET of
median-line tags where the (real but sub-cost, Phase-7) follow edge clears costs?

At each median tag we already know: the continuation is genuine momentum (Phase-7
placebo) but the average edge ≈ transaction cost. Averages hide subsets. Two causal,
pre-tag conditioners (theory the owner asked to test), computed ONLY from the intraday
path BEFORE the entry bar — no lookahead:

  OU HALF-LIFE — fit AR(1) on X_t = log(close_t) − log(sessionVWAP_t) up to the fill
    bar: X_t = c + φ·X_{t-1}. half_life = −ln2 / ln(φ). Short = fast mean reversion
    (chop → fade); φ→1 = no reversion (trending → follow should work). Hypothesis:
    follow expectancy RISES with half-life and the trending bucket clears cost.

  JUMP FRACTION (bipower) — on pre-tag 1-min log returns: RV=Σr² (with jumps),
    BV=(π/2)·Σ|rₜ||rₜ₋₁| (jump-robust). jump_frac = max(RV−BV,0)/RV. Was the tag
    reached by a jump (news) or a diffusive grind? Let the data say which continues.

Follow trade = the Phase-7 race config (dynamic lines, TP 75th, SL≈open, slMult 1.0),
costed, faithful to costed_median_follow. Buckets the costed follow pnl by each
conditioner (terciles), IS/OOS, pooled FX. Reuses costed_median_follow primitives
(_resolve, constants) — no re-derivation.
"""
import os, sys, datetime, math
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma
from costed_median_follow import (INSTR, FX, CACHE, C_MED, C_75, COST_PCT, SLIP_PCT,
                                  _resolve, _stats, _fmt)

SLMULT = 1.0          # SL ≈ open (the Phase-6 race, costed)
MIN_PRE = 30          # bars before the tag needed to fit the conditioners
BIG_HL = 1e4          # half-life sentinel for φ≥1 (no reversion → "trending")


def _follow_trade(hi, lo, cl, O, s):
    """Dynamic-line median FOLLOW; returns (pnl_net_pct, fill_idx) or None."""
    n = hi.size
    hl, hlOut = C_MED * s, C_75 * s
    slD = O * hl * SLMULT
    slip = O * SLIP_PCT / 100
    runHi = np.empty(n); runLo = np.empty(n); rh = rl = O
    for k in range(n):
        runHi[k] = rh; runLo[k] = rl
        if hi[k] > rh: rh = hi[k]
        if lo[k] < rl: rl = lo[k]
    orders = [
        dict(isBuy=True,  typ='stop', slSign=-1, lvl=lambda k: runLo[k]*(1+hl)+slip, tp=lambda f: runLo[f]*(1+hlOut)),
        dict(isBuy=False, typ='stop', slSign=+1, lvl=lambda k: runHi[k]*(1-hl)-slip, tp=lambda f: runHi[f]*(1-hlOut)),
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


def _ou_halflife(cl, vwap, upto):
    """AR(1) half-life of log(close)−log(vwap) on bars [1:upto]. Returns bars (float)."""
    if upto < MIN_PRE:
        return None
    x = np.log(np.maximum(cl[:upto], 1e-12)) - np.log(np.maximum(vwap[:upto], 1e-12))
    x0, x1 = x[:-1], x[1:]
    if x0.size < MIN_PRE - 1 or np.std(x0) < 1e-12:
        return None
    # OLS slope φ of x1 on x0 (with intercept)
    A = np.vstack([np.ones_like(x0), x0]).T
    try:
        coef, *_ = np.linalg.lstsq(A, x1, rcond=None)
    except np.linalg.LinAlgError:
        return None
    phi = coef[1]
    if phi <= 0:
        return 0.5                       # anti-persistent → effectively instant reversion
    if phi >= 1:
        return BIG_HL                    # no reversion → trending
    return -math.log(2) / math.log(phi)


def _jump_frac(cl, upto):
    """Bipower jump fraction on pre-tag 1-min log returns [0:upto]."""
    if upto < MIN_PRE:
        return None
    r = np.diff(np.log(np.maximum(cl[:upto], 1e-12)))
    if r.size < 3:
        return None
    rv = np.sum(r * r)
    bv = (math.pi / 2) * np.sum(np.abs(r[1:]) * np.abs(r[:-1]))
    if rv <= 1e-18:
        return None
    return max(rv - bv, 0.0) / rv


def collect(pair):
    m1 = load_m1(os.path.join(CACHE, INSTR[pair]))
    daily = build_london_daily(m1)
    sig = causal_sigma(daily)
    nd = daily['open'].size; split = nd // 2
    rows = []   # (pnl, halflife, jumpfrac, seg)
    for i in range(nd):
        s = sig[i]
        if not (s > 0):
            continue
        a, b = daily['start'][i], daily['end'][i]
        if b - a < 60:
            continue
        O = m1['open'][a]
        if not (O > 0):
            continue
        hi = m1['high'][a:b]; lo = m1['low'][a:b]; cl = m1['close'][a:b]; vol = m1['volume'][a:b]
        tp = (hi + lo + cl) / 3.0
        cumpv = np.cumsum(tp * vol); cumv = np.cumsum(vol)
        vwap = np.where(cumv > 0, cumpv / np.maximum(cumv, 1e-12), cl)
        tr = _follow_trade(hi, lo, cl, O, s)
        if tr is None:
            continue
        pnl, fidx = tr
        hl = _ou_halflife(cl, vwap, fidx)
        jf = _jump_frac(cl, fidx)
        if hl is None or jf is None:
            continue
        rows.append((pnl, hl, jf, 0 if i < split else 1))
    return np.array(rows) if rows else np.empty((0, 4))


def _bucket_report(rows, colname, col, hi_is_trend=True):
    """P&L stats by tercile of `col`, IS/OOS. Returns printable lines + the OOS
    top-vs-bottom bucket means for the verdict."""
    lines = []
    top_bottom = {}
    for seg, lab in [(0, 'IS'), (1, 'OOS')]:
        m = rows[:, 3] == seg
        sub = rows[m]
        if sub.shape[0] < 90:
            lines.append(f"    {lab}: (thin, n={sub.shape[0]})"); continue
        v = sub[:, col]
        q1, q2 = np.quantile(v, [1/3, 2/3])
        cells = {}
        for bk, mask in [('lo', v <= q1), ('mid', (v > q1) & (v < q2)), ('hi', v >= q2)]:
            t = sub[mask]
            st = _stats(np.column_stack([t[:, 0], np.ones(t.shape[0]), t[:, 3]])) if t.shape[0] else None
            cells[bk] = st
        lines.append(f"    {lab} {colname} terciles (lo≤{q1:.3g} / hi≥{q2:.3g}):")
        for bk in ('lo', 'mid', 'hi'):
            st = cells[bk]
            if st:
                lines.append(f"        {bk:3}: n={st['n']:4d}  mean={st['mean_pct']:+.4f}%  win={st['win']*100:4.1f}%")
        if seg == 1 and cells['lo'] and cells['hi']:
            top_bottom = {'lo': cells['lo']['mean_pct'], 'hi': cells['hi']['mean_pct']}
    return lines, top_bottom


def main():
    pairs = sys.argv[1:] or FX
    print(f"\n{'='*80}\nMedian FOLLOW conditioned on OU half-life & jump fraction (costed, IS/OOS)\n"
          f"follow = dynamic TP75th/SL≈open, cost {COST_PCT}%+slip. Bar: a bucket clears cost (mean>0) OOS.\n{'='*80}")
    allrows = []
    for pair in pairs:
        rows = collect(pair)
        allrows.append(rows)
        if rows.shape[0] < 120:
            print(f"\n=== {pair}: thin (n={rows.shape[0]}) ==="); continue
        print(f"\n=== {pair}  (n={rows.shape[0]}) ===")
        for name, col in [('half-life', 1), ('jump-frac', 2)]:
            lines, _ = _bucket_report(rows, name, col)
            for ln in lines:
                print(ln)
    pooled = np.vstack([r for r in allrows if r.shape[0]]) if allrows else np.empty((0, 4))
    print(f"\n{'='*80}\nPOOLED FX (n={pooled.shape[0]})\n{'='*80}")
    for name, col, trend in [('half-life', 1, True), ('jump-frac', 2, True)]:
        lines, tb = _bucket_report(pooled, name, col)
        for ln in lines:
            print(ln)
        if tb:
            verdict = ('follow improves in the HIGH bucket' if tb['hi'] > tb['lo'] else 'no gain in the HIGH bucket')
            clears = 'and CLEARS cost (mean>0 OOS)' if max(tb['lo'], tb['hi']) > 0 else 'but still sub-cost (mean<0 OOS)'
            print(f"  → {name}: OOS hi {tb['hi']:+.4f}% vs lo {tb['lo']:+.4f}% — {verdict}; {clears}")


if __name__ == '__main__':
    main()
