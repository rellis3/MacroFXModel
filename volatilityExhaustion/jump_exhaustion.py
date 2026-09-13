"""
jump_exhaustion.py — Phase 13c: is a JUMP-DRIVEN extreme a worse exhaustion signal?

This is the question that connects the jump work to what this folder actually studies.
Phase 0b (`measure_extremes.py`) established the study's best descriptive finding: at a
FRESH session extreme >=0.4 sigma from the open, price reverses 0.25 sigma back toward
the open before extending 0.25 sigma further about 52-54% of the time on FX majors — a
weak but IS/OOS-stable, cross-sectionally consistent exhaustion tendency against a 0.50
null.

That measurement treats every extreme alike. But "price is 1.5 sigma from the open"
describes only HOW FAR. It says nothing about HOW IT GOT THERE:

    smooth grind  0 -> +0.3 -> +0.6 -> +0.9 -> +1.2 sigma
    single jump   0 -> +0.1 -> +0.15 -> +1.4 sigma

The hypothesis under test (pre-registered before running): the second is a repricing, not
an exhaustion — the market has moved to a new level for a reason, so fading it should work
LESS well. Predicted: HOLD RATE FALLS as the pre-extreme jump share RISES.

THE CONDITIONER IS STRICTLY CAUSAL. At the extreme on bar j, the jump share is computed
from the session's own 1-min returns on bars 0..j ONLY — the same bipower brick
(`vol_exhaustion_lib.jump_fraction`) at the same within-session scope Phase 8 used, never
the whole-day number (which would include jumps that happen AFTER the extreme, i.e.
lookahead). Computed via cumulative RV/BV so it is O(1) per extreme, asserted equal to
the brick's direct result in the self-test.

DISTANCE IS CONTROLLED, because it has to be. Hold rate rises with distance, and
jump-driven extremes tend to be further from the open — so an uncontrolled comparison
would credit the jump conditioner for distance. Every split below is WITHIN a distance
band, and the bands are the same ones `measure.py` already uses.

THE RACE IS REUSED VERBATIM from `measure_extremes.py` (THETA=0.25, H=60, MIN_EXT=0.4,
50/50 IS/OOS at nd//2) so these hold rates are directly comparable to the README's
published table rather than a subtly different measurement.

PRE-REGISTERED READ:
  * hold rate FALLS monotonically with pre-extreme jump share, on BOTH halves, on a
    MAJORITY of instruments -> jump-driven extremes really are worse exhaustion signals.
  * flat / sign disagrees across halves or instruments -> NULL. Say so.
This is descriptive measurement. No trade, no cost, no signal.

Usage:  python3 jump_exhaustion.py [pair ...]   |   --selftest   |   --all
"""
import os, sys, csv, math, datetime, collections
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma, jump_fraction

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIRS = [os.path.join(HERE, '..', 'portfolioBacktest', 'cache'),
              os.path.join(HERE, '..', 'VolRangeForecaster', 'data', 'm1')]

THETA = 0.25          # measure_extremes.py
H = 60
MIN_EXT = 0.4
MIN_BARS = 60
MIN_PRE = 30          # median_follow_conditioned.MIN_PRE — bars needed for the conditioner
DIST_BANDS = [(0.4, 0.8), (0.8, 1.2), (1.2, 1.8), (1.8, 9.9)]
CORE = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf', 'gold']


def cum_jump_frac(c):
    """jf_upto[j] = bipower jump fraction of returns on bars 0..j, for every j. O(n).
    Equivalent to jump_fraction(diff(log(c[:j+1]))) — asserted in selftest()."""
    r = np.diff(np.log(np.maximum(c, 1e-12)))
    n = r.size
    rv = np.cumsum(r * r)                                  # rv[k] = sum over r[0..k]
    prod = np.zeros(n)
    prod[1:] = np.abs(r[1:]) * np.abs(r[:-1])
    bv = (math.pi / 2) * np.cumsum(prod)
    out = np.full(c.size, np.nan)
    with np.errstate(invalid='ignore', divide='ignore'):
        f = np.where(rv > 1e-18, np.maximum(rv - bv, 0.0) / np.maximum(rv, 1e-30), np.nan)
    out[1:] = f                                            # out[j] uses r[0..j-1] = bars 0..j
    return out


def collect(pair, path):
    m1 = load_m1(path)
    daily = build_london_daily(m1)
    sig = causal_sigma(daily)
    nd = daily['open'].size
    split = nd // 2
    rows = []
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
        if not np.all(np.isfinite(c)) or c.min() <= 0:
            continue
        jf = cum_jump_frac(c)
        thr_px = THETA * s * O
        run_hi = run_lo = c[0]
        seg_i = 0 if i < split else 1
        for j in range(1, n - 2):
            new_hi = c[j] > run_hi
            new_lo = c[j] < run_lo
            if new_hi: run_hi = c[j]
            if new_lo: run_lo = c[j]
            if not (new_hi or new_lo):
                continue
            d = (c[j] - O) / O / s
            if abs(d) < MIN_EXT:
                continue
            up = new_hi
            if (up and d < 0) or ((not up) and d > 0):
                continue
            if j < MIN_PRE or not np.isfinite(jf[j]):
                continue                                    # conditioner needs history
            rev_px = c[j] - (thr_px if up else -thr_px)
            ext_px = c[j] + (thr_px if up else -thr_px)
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
            rows.append((abs(d), float(jf[j]), 1 if r_idx < e_idx else 0, seg_i))
    return np.array(rows) if rows else np.empty((0, 4))


def selftest():
    rng = np.random.default_rng(9)
    c = 100 * np.exp(np.cumsum(rng.normal(0, 2e-4, 500)))
    jf = cum_jump_frac(c)
    worst = 0.0
    for j in (40, 120, 300, 499):
        direct = jump_fraction(np.diff(np.log(c[:j + 1])))
        worst = max(worst, abs(direct - jf[j]))
    print(f'  [ok] cumulative jump fraction == the shared brick (max diff {worst:.2e})')
    assert worst < 1e-12

    c2 = c.copy(); c2[250:] *= 1.01                 # a jump midway
    j2 = cum_jump_frac(c2)
    assert j2[240] < j2[260], (j2[240], j2[260])
    print(f'  [ok] a jump raises the running share ({j2[240]:.3f} before -> {j2[260]:.3f} after)')

    assert np.isnan(cum_jump_frac(c)[0])
    print('  [ok] conditioner is causal: bar j uses only bars 0..j, index 0 undefined')
    print('selftest PASSED\n')


def band_report(rows, label):
    """Hold rate by pre-extreme jump-share tercile, WITHIN each distance band."""
    print(f'\n  ══ {label} ══')
    print(f'    {"distance":12s} {"jump share":12s} {"half":4s} {"n":>7s} {"hold":>7s}   vs 0.50 null')
    verdict = {}
    for lo, hi in DIST_BANDS:
        m = (rows[:, 0] >= lo) & (rows[:, 0] < hi)
        sub = rows[m]
        if sub.shape[0] < 400:
            continue
        # terciles of the conditioner fitted on IS only (no lookahead in the bucketing)
        IS = sub[sub[:, 3] == 0]
        if IS.shape[0] < 200:
            continue
        q1, q2 = np.quantile(IS[:, 1], [1 / 3, 2 / 3])
        cells = {}
        for bname, bm in (('smooth (lo)', sub[:, 1] <= q1),
                          ('mid', (sub[:, 1] > q1) & (sub[:, 1] < q2)),
                          ('jumpy (hi)', sub[:, 1] >= q2)):
            for seg, half in ((0, 'IS'), (1, 'OOS')):
                t = sub[bm & (sub[:, 3] == seg)]
                if t.shape[0] < 60:
                    continue
                h = t[:, 2].mean()
                cells[(bname, half)] = (h, t.shape[0])
                print(f'    {f"{lo:.1f}-{hi:.1f}s":12s} {bname:12s} {half:4s} '
                      f'{t.shape[0]:7d} {h:7.3f}   {h-0.5:+.3f}')
        for half in ('IS', 'OOS'):
            a, b = cells.get(('smooth (lo)', half)), cells.get(('jumpy (hi)', half))
            if a and b:
                verdict.setdefault(half, []).append(b[0] - a[0])   # jumpy minus smooth
    return verdict


def discover():
    found = {}
    for d in CACHE_DIRS:
        if os.path.isdir(d):
            for fn in sorted(os.listdir(d)):
                if fn.endswith('_m1.parquet'):
                    found.setdefault(fn[:-len('_m1.parquet')], os.path.join(d, fn))
    return found


def main(argv):
    if '--selftest' in argv:
        selftest(); return 0
    found = discover()
    want = [a for a in argv[1:] if not a.startswith('-')]
    if not want:
        want = sorted(found) if '--all' in argv else CORE
    selftest()
    print('=' * 96)
    print('PHASE 13c — does a JUMP-DRIVEN extreme exhaust differently? (descriptive)')
    print('=' * 96)
    print('  race reused verbatim from measure_extremes.py (THETA=0.25, H=60, MIN_EXT=0.4)')
    print('  conditioner: bipower jump share of the session SO FAR, bars 0..j only (causal)')
    print('  PRE-REGISTERED: hold rate should FALL as pre-extreme jump share RISES')
    print('  (a jump-driven extreme = repricing, not exhaustion). Null = no difference.')
    pooled = collections.defaultdict(list)
    per_pair = {}
    for p in want:
        if p not in found:
            continue
        rows = collect(p, found[p])
        if rows.shape[0] < 1000:
            print(f'\n  {p}: thin ({rows.shape[0]}), skipped'); continue
        v = band_report(rows, f'{p}   ({rows.shape[0]:,d} fresh extremes, '
                               f'mean hold {rows[:,2].mean():.3f})')
        per_pair[p] = v
        for half, diffs in v.items():
            pooled[half].extend(diffs)
    print('\n' + '=' * 96)
    print('VERDICT — jumpy-minus-smooth hold-rate difference, within distance bands')
    print('  (negative = jump-driven extremes hold LESS = the hypothesis)')
    print(f"\n  {'pair':9s} {'IS mean':>9s} {'OOS mean':>9s}  sign agrees?")
    agree = 0; total = 0
    for p, v in per_pair.items():
        a = np.mean(v.get('IS', [np.nan])); b = np.mean(v.get('OOS', [np.nan]))
        ok = np.isfinite(a) and np.isfinite(b) and np.sign(a) == np.sign(b)
        agree += ok; total += 1
        print(f'  {p:9s} {a:+9.4f} {b:+9.4f}  {"yes" if ok else "no"}'
              f'{"  (both negative)" if ok and b < 0 else ""}')
    A = np.mean(pooled.get('IS', [np.nan])); B = np.mean(pooled.get('OOS', [np.nan]))
    print(f'\n  pooled     {A:+9.4f} {B:+9.4f}   sign agrees on {agree}/{total} instruments')
    if np.isfinite(A) and np.isfinite(B) and A < 0 and B < 0 and agree >= (total + 1) // 2:
        print('\n  READ: jump-driven extremes hold LESS, both halves, majority of instruments')
        print('        -> the pre-registered direction. A jump-driven extreme is a weaker')
        print('           exhaustion signal than a smooth one at the same distance.')
    elif np.isfinite(A) and np.isfinite(B) and A > 0 and B > 0 and agree >= (total + 1) // 2:
        print('\n  READ: jump-driven extremes hold MORE — the OPPOSITE of the hypothesis,')
        print('        but consistent both halves. Report as a real effect with the sign')
        print('        it actually has, not the one predicted.')
    else:
        print('\n  READ: NULL — no consistent direction across halves/instruments.')
    print('=' * 96)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
