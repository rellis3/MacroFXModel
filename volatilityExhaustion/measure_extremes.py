"""
measure_extremes.py — the FAIRER exhaustion test (Phase 0b).

Instead of "distance from a fixed open", condition on the actual exhaustion setup:
the moment price prints a FRESH session extreme (a new running high/low) that is
already X sigma from the open. Then ask:

    does that extreme HOLD — i.e. price reverses THETA*sigma back toward the open
    before extending THETA*sigma to a new extreme?

For a driftless walk at a running extreme the null is ~0.5 (symmetric race). The
pre-registered read is the same:
    P(extreme holds) RISES with the extreme's distance  -> real exhaustion
    flat ~0.5                                            -> null

This is the "is this THE high/low?" question, and it's the one closest to how a
trader means 'exhaustion'. Reuses the exact same sigma/anchor baseplate.
"""
import os, sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma_kind
from measure import INSTRUMENTS, HERE, CH, DIST_EDGES, binned, _london_date_str

THETA = 0.25
H = 60
MIN_EXT = 0.4        # only count extremes at least this far from open (sigma) — an actual impulse
MIN_BARS = 60

plt.rcParams.update({'figure.dpi': 110, 'font.size': 10, 'axes.grid': True, 'grid.alpha': .25})


def measure_extremes(path, pair, sig_kind='yz'):
    print(f'\n=== {pair} (fresh-extreme test, sigma={sig_kind}) ===')
    m1 = load_m1(path)
    daily = build_london_daily(m1)
    sig = causal_sigma_kind(daily, sig_kind)
    nd = daily['open'].size
    split = nd // 2
    dist, hold, seg = [], [], []
    for i in range(nd):
        s = sig[i]
        if not (s > 0):
            continue
        a, b = daily['start'][i], daily['end'][i]
        if b - a < MIN_BARS:
            continue
        O = daily['open'][i]
        if not (O > 0):
            continue
        c = m1['close'][a:b]; hi = m1['high'][a:b]; lo = m1['low'][a:b]
        n = c.size
        thr_px = THETA * s * O
        run_hi, run_lo = c[0], c[0]
        seg_i = 0 if i < split else 1
        for j in range(1, n - 2):
            new_hi = c[j] > run_hi
            new_lo = c[j] < run_lo
            if new_hi: run_hi = c[j]
            if new_lo: run_lo = c[j]
            if not (new_hi or new_lo):
                continue
            d = (c[j] - O) / O / s                 # signed distance of this extreme
            if abs(d) < MIN_EXT:
                continue
            up = new_hi                            # a fresh HIGH -> exhaustion = reverse down
            # only treat as an exhaustion candidate if the extreme is AWAY from open in its dir
            if (up and d < 0) or ((not up) and d > 0):
                continue
            rev_px = c[j] - (thr_px if up else -thr_px)   # back toward open
            ext_px = c[j] + (thr_px if up else -thr_px)   # further extreme
            e = min(n, j + 1 + H)
            fh = hi[j + 1:e]; fl = lo[j + 1:e]
            if fh.size == 0:
                continue
            if up:
                rev_hits = fl <= rev_px; ext_hits = fh >= ext_px
            else:
                rev_hits = fh >= rev_px; ext_hits = fl <= ext_px
            r_any, e_any = rev_hits.any(), ext_hits.any()
            if not r_any and not e_any:
                continue
            r_idx = np.argmax(rev_hits) if r_any else 1 << 30
            e_idx = np.argmax(ext_hits) if e_any else 1 << 30
            if r_idx == e_idx:
                continue
            dist.append(abs(d)); hold.append(1 if r_idx < e_idx else 0); seg.append(seg_i)
    dist, hold, seg = np.array(dist), np.array(hold), np.array(seg)
    print(f'  fresh-extreme events: {hold.size:,}  (mean hold rate {hold.mean():.3f})')
    m = dist >= 1.5
    for label, sv in [('IS', 0), ('OOS', 1)]:
        mm = m & (seg == sv)
        r = hold[mm].mean() if mm.sum() >= 40 else None
        print(f'  hold-rate far(>=1.5s) {label} = {r} (n={int(mm.sum())})')
    return dict(pair=pair, dist=dist, hold=hold, seg=seg,
                split_date=_london_date_str(daily['day_idx'][split]))


def chart(res):
    fig, ax = plt.subplots(figsize=(8.4, 5.2))
    for sv, lab, col in [(0, f'in-sample (<= {res["split_date"]})', '#1f77b4'),
                         (1, f'out-of-sample (> {res["split_date"]})', '#d62728')]:
        m = res['seg'] == sv
        x, y, e, n = binned(res['dist'][m], res['hold'][m])
        ax.errorbar(x, y, yerr=e, marker='o', capsize=3, color=col, label=lab)
    ax.axhline(.5, ls='--', color='#555', lw=1, label='null (driftless) = 0.50')
    ax.set_xlabel('distance of the fresh extreme from open ($\\sigma$)')
    ax.set_ylabel(f'P(extreme holds: reverts {THETA}$\\sigma$ before new extreme)')
    ax.set_title(f'{res["pair"]}  —  do fresh extremes further from open hold more? (exhaustion)')
    ax.set_ylim(.35, .8); ax.legend(loc='upper left', fontsize=8.5)
    fig.tight_layout(); p = os.path.join(CH, f'{res["pair"]}_7_freshextreme_hold.png')
    fig.savefig(p); plt.close(fig); print('  ->', os.path.basename(p)); return p


def combined_chart(results, fname='FXMAJORS_freshextreme_overlay'):
    """Overlay OOS fresh-extreme hold-rate vs distance for several instruments."""
    fig, ax = plt.subplots(figsize=(9.2, 5.6))
    cmap = plt.get_cmap('tab10')
    for k, res in enumerate(results):
        m = res['seg'] == 1                       # OOS half only (the honest test)
        x, y, e, n = binned(res['dist'][m], res['hold'][m])
        ax.plot(x, y, marker='o', color=cmap(k), label=res['pair'], lw=1.5)
    ax.axhline(.5, ls='--', color='#555', lw=1, label='null = 0.50')
    ax.set_xlabel('distance of the fresh extreme from open ($\\sigma$)')
    ax.set_ylabel('P(extreme holds) — OOS half')
    ax.set_title('Fresh-extreme hold-rate across instruments (OOS)  —  above 0.5 = exhausts, below = trends')
    ax.set_ylim(.38, .70); ax.legend(fontsize=8.5, ncol=2)
    fig.tight_layout(); p = os.path.join(CH, f'{fname}.png')
    fig.savefig(p); plt.close(fig); print('\n->', os.path.basename(p)); return p


def _far_oos(r):
    m = (r['dist'] >= 1.5) & (r['seg'] == 1)
    return (r['hold'][m].mean() if m.sum() >= 40 else float('nan')), int(m.sum())


if __name__ == '__main__':
    args = sys.argv[1:]
    if args and args[0] == 'compare':
        # robustness: does the 6/6 FX result survive a DIFFERENT vol estimator?
        pairs = ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF']
        rows = []
        for pair in pairs:
            rel, _ = INSTRUMENTS[pair]
            p = os.path.join(HERE, '..', rel)
            ry = measure_extremes(p, pair, 'yz')
            rh = measure_extremes(p, pair, 'hv')
            (yz, ny), (hv, nh) = _far_oos(ry), _far_oos(rh)
            rows.append((pair, yz, hv))
        print('\n=== estimator robustness: OOS fresh-extreme hold (far >=1.5s) ===')
        print(f'  {"pair":8} {"YZ30":>7} {"HV20":>7}   both>0.5?')
        n_both = 0
        for pair, yz, hv in rows:
            ok = yz > 0.5 and hv > 0.5
            n_both += ok
            print(f'  {pair:8} {yz:7.3f} {hv:7.3f}   {"YES" if ok else "no"}')
        print(f'  -> {n_both}/6 majors exhaust under BOTH estimators')
    elif args and args[0] == 'combined':
        pairs = ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF']
        results = []
        print('pair      mean_hold  far>=1.5(IS/OOS)')
        for pair in pairs:
            rel, _ = INSTRUMENTS[pair]
            r = measure_extremes(os.path.join(HERE, '..', rel), pair)
            chart(r); results.append(r)
        combined_chart(results)
        # compact summary table
        print('\n=== FX majors fresh-extreme summary (OOS far >=1.5s) ===')
        for r in results:
            m = (r['dist'] >= 1.5) & (r['seg'] == 1)
            rr = r['hold'][m].mean() if m.sum() >= 40 else float('nan')
            tag = 'EXHAUSTS' if rr > 0.5 else 'trends'
            print(f'  {r["pair"]}: hold={rr:.3f} (n={int(m.sum())})  -> {tag}')
    else:
        for pair in (args or ['EURUSD']):
            rel, _ = INSTRUMENTS[pair]
            chart(measure_extremes(os.path.join(HERE, '..', rel), pair))
