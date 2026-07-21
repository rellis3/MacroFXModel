"""
Direct test of the owner's intuition: when most of the day's volatility BUDGET is
spent AND price is at a fresh extreme, does it REVERSE more often?

This is the DIRECTION question (reversal vs continuation), conditioned on budget used
— NOT the range question. At each fresh session extreme we run a symmetric two-barrier
race (reverse THETA*σ toward the open vs extend THETA*σ to a new extreme, whichever
first within H min) and bucket the outcome by how much of the forecast MEDIAN day
range was already consumed at that moment.

Null (driftless walk at an extreme) = P(reversal) 0.50 in every bucket.
Owner's hypothesis: P(reversal) RISES with budget used (peaks in the 90%+ bucket).
Flat ~0.50 across buckets = the '90% used -> expect reversal' rule has no edge.
"""
import numpy as np
from budget_research_lib import FX_MAJORS, build_daily, HL75_CORR, ASSET_OF

THETA = 0.25          # barrier half-width, σ-units (matches measure_extremes.py)
H = 60                # forward horizon, minutes
MIN_EXT = 0.4         # only count extremes at least this far from open (a real impulse)
MIN_BARS = 120
TRAIN_FRAC = 0.60
# forecast MEDIAN H-L in σ-units = BM_P50 * hl_50_corr. hl_50_corr fx=0.820, index=1.010
HL50_CORR = {'fx': 0.820, 'index': 1.010}
BM_P50 = 1.572
BUCKETS = [(0, .5), (.5, .7), (.7, .9), (.9, 1.1), (1.1, 9)]


def run_pair(pair):
    dd = build_daily(pair); d = dd['daily']; m1 = dd['m1']; sig = dd['sigma']
    med_sig = BM_P50 * HL50_CORR[ASSET_OF[pair]]      # median day range in σ-units
    nd = d['open'].size; split = nd // 2
    frac, rev, seg = [], [], []
    for i in range(nd):
        s = sig[i]; O = d['open'][i]
        if not (s > 0 and O > 0):
            continue
        a, b = d['start'][i], d['end'][i]
        if b - a < MIN_BARS:
            continue
        c = m1['close'][a:b]; hi = m1['high'][a:b]; lo = m1['low'][a:b]
        n = c.size
        thr_px = THETA * s * O
        run_hi = run_lo = c[0]
        seg_i = 0 if i < split else 1
        for j in range(1, n - 2):
            new_hi = c[j] > run_hi; new_lo = c[j] < run_lo
            if new_hi: run_hi = c[j]
            if new_lo: run_lo = c[j]
            if not (new_hi or new_lo):
                continue
            dd_ = (c[j] - O) / O / s
            if abs(dd_) < MIN_EXT:
                continue
            up = new_hi
            if (up and dd_ < 0) or ((not up) and dd_ > 0):
                continue
            # budget consumed so far = running H-L (σ) / forecast median (σ)
            budget = ((run_hi - run_lo) / O / s) / med_sig
            rev_px = c[j] - (thr_px if up else -thr_px)
            ext_px = c[j] + (thr_px if up else -thr_px)
            e = min(n, j + 1 + H)
            fh = hi[j + 1:e]; fl = lo[j + 1:e]
            if fh.size == 0:
                continue
            if up:
                rh = fl <= rev_px; eh = fh >= ext_px
            else:
                rh = fh >= rev_px; eh = fl <= ext_px
            ra, ea = rh.any(), eh.any()
            if not ra and not ea:
                continue
            ri = np.argmax(rh) if ra else 1 << 30
            ei = np.argmax(eh) if ea else 1 << 30
            if ri == ei:
                continue
            frac.append(budget); rev.append(1 if ri < ei else 0); seg.append(seg_i)
    return np.array(frac), np.array(rev), np.array(seg)


def run():
    print('=== P(reversal) at a fresh extreme, by BUDGET consumed (pooled FX, OOS half) ===')
    print('  null = 0.50; owner\'s claim = rises toward the 90%+ bucket\n')
    allf, allr, alls = [], [], []
    for pair in FX_MAJORS:
        f, r, s = run_pair(pair)
        allf.append(f); allr.append(r); alls.append(s)
    F = np.concatenate(allf); R = np.concatenate(allr); S = np.concatenate(alls)
    oos = S == 1
    print(f'  {"budget used":>14} {"P(rev) OOS":>11} {"n":>8}')
    for lo, hi in BUCKETS:
        m = oos & (F >= lo) & (F < hi)
        if m.sum() < 100:
            print(f'  {f"{int(lo*100)}-{int(hi*100)}%":>14} {"--":>11} {int(m.sum()):>8}')
            continue
        p = R[m].mean()
        print(f'  {f"{int(lo*100)}-{int(hi*100)}%":>14} {p:>11.3f} {int(m.sum()):>8}')
    # gradient test: is 90%+ reversal materially above the 50-70% bucket?
    def pb(lo, hi):
        m = oos & (F >= lo) & (F < hi); return (R[m].mean(), int(m.sum()))
    p_low, n_low = pb(.5, .7); p_hi, n_hi = pb(.9, 1.1)
    print(f'\n  90-110% bucket P(rev)={p_hi:.3f} vs 50-70% bucket P(rev)={p_low:.3f}  '
          f'-> gradient {p_hi - p_low:+.3f}')
    print('  (>0 and clearly above 0.50 = the owner\'s "budget spent -> reversal" holds;'
          '\n   flat ~0.50 = no edge from the budget-consumption condition)')


if __name__ == '__main__':
    run()
