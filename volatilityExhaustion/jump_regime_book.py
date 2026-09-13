"""
jump_regime_book.py — Phase 13b: the DESCRIPTIVE regime book.

Purely a measurement layer. No trade, no cost, no signal — this answers "what does the
data actually look like, and what tends to happen next", which is the stage this folder
insists on before anything else.

WHAT IT ANSWERS (each section states its own null so a flat result is readable as flat):

  1. DISTRIBUTIONS — the real percentiles of jump share, jump count, intensity, largest
     jump and asymmetry, per asset class. Worth doing first because intuition about
     these numbers is usually miscalibrated: a "jump-dominated" FX day is nothing like
     a 40% variance share.

  2. CLUSTERING — does a jump today raise the odds of a jump tomorrow?
     NULL: P(jump tomorrow | jump today) = P(jump tomorrow). If jumps were an
     independent Poisson process these are equal; a lift means a shock REGIME exists.

  3. ASYMMETRY — is jump variance systematically up- or down-skewed per instrument, and
     does today's asymmetry carry to tomorrow?
     NULL: mean asymmetry 0, and no day-over-day persistence.

  4. WHAT HAPPENS NEXT, character vs level. Jump share and volatility LEVEL are
     correlated, so comparing "high jump" against "quiet" would confound the two. The
     test is therefore a 2x2: within HIGH-RV days only, split by jump share, and the
     same within LOW-RV days. That isolates HOW the day moved from HOW MUCH it moved.
     Measured next day: |return|, range in sigma units, continuation (does tomorrow's
     close-to-close keep today's sign), and vol decay (RV_{t+1}/RV_t).
     NULL: continuation 50%, and no difference between the jump and no-jump cells.

  5. THE 2x2 MAP — jump frequency x jump size, the four environments, with next-day
     behaviour in each.

  6. ARTIFACT CONTROL — section 4/5 report RV decay as the ratio RV_{t+1}/RV_t, and a
     ratio falls mechanically when its denominator is larger. Jump-driven days DO have
     larger RV_t, so the decay ordering could be pure arithmetic. This section refits it
     as log RV_{t+1} = a + b log RV_t + c*jump_share_t: c is the jump effect at a MATCHED
     level of today's volatility. If c is not reliably negative, sections 4 and 5 are an
     artifact and must be read as one.

Thresholds are always fitted on the IS half of each pair's own history and applied
unchanged to OOS, so no bucket boundary is chosen with hindsight. Everything is split
IS/OOS (60/40 chronological, the split the rest of this folder uses) and reported per
asset class — a result that only appears in one half is noise, and this folder has
retired several leads for exactly that.

Reads `jump_detect_lm.csv` (Phase 13) + `jump_diffusion_daily.csv` (Phase 1), and
caches per-day OHLC to `daily_bars.csv` on first run.

Usage:  python3 jump_regime_book.py
"""
import os, sys, csv, json, math, datetime, collections, itertools
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIRS = [os.path.join(HERE, '..', 'portfolioBacktest', 'cache'),
              os.path.join(HERE, '..', 'VolRangeForecaster', 'data', 'm1')]
LM_CSV = os.path.join(HERE, 'jump_detect_lm.csv')
RV_CSV = os.path.join(HERE, 'jump_diffusion_daily.csv')
BARS_CSV = os.path.join(HERE, 'daily_bars.csv')
OOS_FRAC = 0.40
CLASSES = ('fx_major', 'fx_cross', 'metal')


def discover():
    found = {}
    for d in CACHE_DIRS:
        if os.path.isdir(d):
            for fn in sorted(os.listdir(d)):
                if fn.endswith('_m1.parquet'):
                    found.setdefault(fn[:-len('_m1.parquet')], os.path.join(d, fn))
    return found


def build_daily_bars():
    """Cache per-(pair,date) London OHLC + causal sigma. One-off; reused by every study."""
    if os.path.exists(BARS_CSV):
        return
    print('building daily_bars.csv (one-off, needs the M1 cache)...')
    rows = []
    for pair, path in sorted(discover().items()):
        m1 = load_m1(path)
        d = build_london_daily(m1)
        sig = causal_sigma(d)
        for i in range(d['open'].size):
            dt = (datetime.date(1970, 1, 1) + datetime.timedelta(days=int(d['day_idx'][i]))).isoformat()
            rows.append(dict(pair=pair, date=dt, open=d['open'][i], high=d['high'][i],
                             low=d['low'][i], close=d['close'][i],
                             sigma=('' if not np.isfinite(sig[i]) else sig[i])))
        print(f'  {pair}: {d["open"].size} days')
    with open(BARS_CSV, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['pair', 'date', 'open', 'high', 'low', 'close', 'sigma'])
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f'wrote daily_bars.csv — {len(rows):,d} rows\n')


def load_all():
    """Join LM jumps + RV/BV + daily bars into one per-(pair,date) record, time-ordered,
    with next-day fields attached. Strictly one row per pair-date."""
    lm = {}
    with open(LM_CSV, newline='') as f:
        for r in csv.DictReader(f):
            lm[(r['pair'], r['date'])] = r
    rv = {}
    with open(RV_CSV, newline='') as f:
        for r in csv.DictReader(f):
            rv[(r['pair'], r['date'])] = r
    bars = collections.defaultdict(dict)
    with open(BARS_CSV, newline='') as f:
        for r in csv.DictReader(f):
            bars[r['pair']][r['date']] = r

    out = collections.defaultdict(list)
    for pair, bymap in bars.items():
        dates = sorted(bymap)
        for i, d in enumerate(dates):
            k = (pair, d)
            if k not in lm or k not in rv:
                continue
            b = bymap[d]
            o, c = float(b['open']), float(b['close'])
            s = float(b['sigma']) if b['sigma'] else float('nan')
            if not (o > 0 and c > 0 and s > 0):
                continue
            rec = dict(pair=pair, asset_class=lm[k]['asset_class'], date=d,
                       ret=math.log(c / o), sigma=s,
                       rv=float(rv[k]['rv_5m']), jf=float(rv[k]['jf_5m']),
                       n_jumps=int(lm[k]['n_jumps']),
                       intensity=float(lm[k]['jump_intensity']),
                       jump_share=float(lm[k]['jump_var_share']),
                       asym=float(lm[k]['jump_asym']),
                       max_jump=float(lm[k]['max_jump']))
            # next-day fields (the only forward-looking part, and it is the OUTCOME)
            if i + 1 < len(dates):
                nk = (pair, dates[i + 1])
                nb = bymap[dates[i + 1]]
                no, nc = float(nb['open']), float(nb['close'])
                nh, nl = float(nb['high']), float(nb['low'])
                if no > 0 and nc > 0 and nk in rv:
                    rec['next_ret'] = math.log(nc / no)
                    rec['next_range_sig'] = ((nh - nl) / no) / s
                    rec['next_rv'] = float(rv[nk]['rv_5m'])
                    rec['next_jumps'] = int(lm[nk]['n_jumps']) if nk in lm else None
            out[pair].append(rec)
    return out


def split(recs):
    cut = int(len(recs) * (1 - OOS_FRAC))
    for i, r in enumerate(recs):
        r['seg'] = 0 if i < cut else 1
    return recs


def pct(a, qs):
    return np.quantile(a, qs) if a.size else np.full(len(qs), np.nan)


def section1(byclass):
    print('\n' + '=' * 98)
    print('1. DISTRIBUTIONS — what these numbers actually look like')
    print('=' * 98)
    print('   (5-min sampling; jump share = jump variance / realised variance)')
    for ac in CLASSES:
        R = byclass.get(ac)
        if not R:
            continue
        jf = np.array([r['jf'] for r in R])
        js = np.array([r['jump_share'] for r in R])
        nj = np.array([r['n_jumps'] for r in R])
        mj = np.array([abs(r['max_jump']) for r in R]) * 100
        print(f'\n   {ac}  (n={len(R):,d} pair-days)')
        print(f'     {"measure":26s} {"P25":>8s} {"P50":>8s} {"P75":>8s} {"P90":>8s} {"P95":>8s} {"P99":>8s}')
        for name, a, f in (('bipower jump share', jf, '{:8.3f}'),
                           ('LM jump-variance share', js, '{:8.3f}'),
                           ('LM jumps per day', nj.astype(float), '{:8.1f}'),
                           ('largest jump (abs, %)', mj, '{:8.3f}')):
            q = pct(a, [.25, .5, .75, .90, .95, .99])
            print(f'     {name:26s} ' + ' '.join(f.format(x) for x in q))
        print(f'     days with >=1 LM jump: {np.mean(nj > 0)*100:.1f}%   '
              f'(pure-diffusion null ~1%)   mean jumps/day: {nj.mean():.2f}')


def section2(bypair, byclass):
    print('\n' + '=' * 98)
    print('2. CLUSTERING — does a jump today raise the odds of a jump tomorrow?')
    print('=' * 98)
    print('   NULL: P(jump tomorrow | jump today) == P(jump tomorrow).  Lift > 1 = shock regime.')
    print(f'\n   {"class":10s} {"half":4s} {"P(jump)":>9s} {"P(j|j)":>9s} {"P(j|no j)":>10s} '
          f'{"lift":>6s} {"P(j|j,j)":>9s}  n')
    for ac in CLASSES:
        for seg, half in ((0, 'IS'), (1, 'OOS')):
            base = jj = jn = 0; nb = nj_ = nn = 0; jjj = 0; njj = 0
            for pair, recs in bypair.items():
                if not recs or recs[0]['asset_class'] != ac:
                    continue
                for i in range(len(recs) - 1):
                    r, nx = recs[i], recs[i + 1]
                    if r['seg'] != seg:
                        continue
                    tom = nx['n_jumps'] > 0
                    base += tom; nb += 1
                    if r['n_jumps'] > 0:
                        jj += tom; nj_ += 1
                        if i > 0 and recs[i - 1]['n_jumps'] > 0:
                            jjj += tom; njj += 1
                    else:
                        jn += tom; nn += 1
            if nb < 100 or nj_ < 30:
                continue
            p, pj, pn = base / nb, jj / nj_, jn / nn
            p2 = jjj / njj if njj >= 30 else float('nan')
            print(f'   {ac:10s} {half:4s} {p*100:8.1f}% {pj*100:8.1f}% {pn*100:9.1f}% '
                  f'{pj/p:6.2f} {p2*100:8.1f}%  {nb:,d}')


def section3(byclass, bypair):
    print('\n' + '=' * 98)
    print('3. ASYMMETRY — is jump variance up- or down-skewed, and does it persist?')
    print('=' * 98)
    print('   asym = (JV_up - JV_down)/(JV_up + JV_down);  NULL: mean 0, no persistence.')
    print(f'\n   {"class":10s} {"half":4s} {"mean asym":>10s} {"t":>7s} {"AR(1) corr":>11s}  n')
    for ac in CLASSES:
        for seg, half in ((0, 'IS'), (1, 'OOS')):
            a = np.array([r['asym'] for p, R in bypair.items() for r in R
                          if r['asset_class'] == ac and r['seg'] == seg and r['n_jumps'] > 0])
            pairs = []
            for p, R in bypair.items():
                if not R or R[0]['asset_class'] != ac:
                    continue
                for i in range(len(R) - 1):
                    if R[i]['seg'] == seg and R[i]['n_jumps'] > 0 and R[i + 1]['n_jumps'] > 0:
                        pairs.append((R[i]['asym'], R[i + 1]['asym']))
            if a.size < 50:
                continue
            t = a.mean() / (a.std(ddof=1) / math.sqrt(a.size)) if a.std() > 0 else float('nan')
            P = np.array(pairs)
            c = np.corrcoef(P[:, 0], P[:, 1])[0, 1] if P.shape[0] > 30 else float('nan')
            print(f'   {ac:10s} {half:4s} {a.mean():+10.4f} {t:+7.2f} {c:+11.3f}  {a.size:,d}')


def _outcomes(rows):
    """Next-day outcome summary for a bucket of records."""
    rows = [r for r in rows if 'next_ret' in r]
    if len(rows) < 30:
        return None
    nr = np.array([r['next_ret'] for r in rows])
    rg = np.array([r['next_range_sig'] for r in rows])
    cont = np.array([np.sign(r['next_ret']) == np.sign(r['ret']) for r in rows
                     if r['ret'] != 0 and r['next_ret'] != 0])
    dec = np.array([r['next_rv'] / r['rv'] for r in rows if r['rv'] > 0])
    return dict(n=len(rows), abs_ret=float(np.mean(np.abs(nr)) * 100),
                range_sig=float(np.mean(rg)),
                cont=float(cont.mean()) if cont.size else float('nan'),
                decay=float(np.median(dec)) if dec.size else float('nan'))


def section4(bypair):
    print('\n' + '=' * 98)
    print('4. WHAT HAPPENS NEXT — character (jump share) vs level (RV), held apart')
    print('=' * 98)
    print('   Within HIGH-RV days only, split by jump share; same within LOW-RV days.')
    print('   That way "jumpy" is not just a synonym for "volatile".')
    print('   NULL: continuation 50%, and the jumpy/smooth cells identical.')
    print('   Thresholds: per-pair medians/terciles fitted on IS only, applied to OOS.')
    for ac in CLASSES:
        print(f'\n   ══ {ac} ══')
        print(f'     {"RV level":9s} {"character":12s} {"half":4s} {"n":>6s} '
              f'{"|ret| %":>8s} {"range/sig":>10s} {"contin.":>8s} {"RV decay":>9s}')
        cells = collections.defaultdict(lambda: collections.defaultdict(list))
        for pair, R in bypair.items():
            if not R or R[0]['asset_class'] != ac:
                continue
            IS = [r for r in R if r['seg'] == 0]
            if len(IS) < 200:
                continue
            rv_med = np.median([r['rv'] for r in IS])
            jf_hi = np.quantile([r['jf'] for r in IS], 2 / 3)
            jf_lo = np.quantile([r['jf'] for r in IS], 1 / 3)
            for r in R:
                lvl = 'HIGH RV' if r['rv'] >= rv_med else 'LOW RV'
                if r['jf'] >= jf_hi:
                    ch = 'jump-driven'
                elif r['jf'] <= jf_lo:
                    ch = 'smooth'
                else:
                    continue
                cells[(lvl, ch)][r['seg']].append(r)
        for lvl in ('HIGH RV', 'LOW RV'):
            for ch in ('jump-driven', 'smooth'):
                for seg, half in ((0, 'IS'), (1, 'OOS')):
                    o = _outcomes(cells[(lvl, ch)][seg])
                    if not o:
                        continue
                    print(f'     {lvl:9s} {ch:12s} {half:4s} {o["n"]:6d} {o["abs_ret"]:8.3f} '
                          f'{o["range_sig"]:10.3f} {o["cont"]*100:7.1f}% {o["decay"]:9.3f}')


def section2b(bypair):
    """Is the clustering read an artifact of the LM detector? Two controls.

    The LM detector scales each return by a ~22h trailing local vol, so yesterday's jump
    RAISES today's yardstick and could suppress today's detection — faking anti-clustering.
    The bipower DAILY share has no rolling window and cannot do that, so it is the clean
    read. And daily RV, which is famously strongly autocorrelated, is the positive control
    that this method can see clustering when clustering is there."""
    print('\n   controls — bipower share (no rolling window) and an RV positive control:')
    print(f'     {"class":10s} {"series":16s} {"rank corr":>10s} {"P(hi|hi)":>9s} {"base":>7s} {"lift":>6s}')
    for key, name in (('jf', 'bipower share'), ('rv', 'realised var (control)')):
        agg = collections.defaultdict(lambda: [[], [], [0, 0, 0, 0]])
        for pair, R in bypair.items():
            if not R:
                continue
            ac = R[0]['asset_class']
            a, b, c = agg[ac]
            v = np.array([r[key] for r in R])
            if v.size < 50:
                continue
            a.extend(v[:-1]); b.extend(v[1:])
            hi = v >= np.quantile(v, 0.75)
            c[0] += int(np.sum(hi[:-1] & hi[1:])); c[1] += int(np.sum(hi[:-1]))
            c[2] += int(np.sum(hi[1:])); c[3] += v.size - 1
        for ac in CLASSES:
            if ac not in agg:
                continue
            a, b, c = agg[ac]
            a = np.array(a); b = np.array(b)
            rr = np.corrcoef(np.argsort(np.argsort(a)), np.argsort(np.argsort(b)))[0, 1]
            pc = c[0] / max(c[1], 1); base = c[2] / max(c[3], 1)
            print(f'     {ac:10s} {name:16s} {rr:+10.4f} {pc*100:8.1f}% {base*100:6.1f}% {pc/base:6.2f}')
    print('     -> volatility clusters hard; jumps barely do. The LM sign is inside the')
    print('        noise between the two estimators, so no jump-clustering DIRECTION is claimed.')


def _ols(y, X):
    A = np.column_stack([np.ones(len(y))] + list(X))
    c, *_ = np.linalg.lstsq(A, y, rcond=None)
    res = y - A @ c
    s2 = float(res @ res) / max(len(y) - A.shape[1], 1)
    se = np.sqrt(np.maximum(np.diag(s2 * np.linalg.inv(A.T @ A)), 1e-30))
    return c, c / se


def section6(bypair):
    print('\n' + '=' * 98)
    print('6. ARTIFACT CONTROL — does "jump-driven vol decays faster" survive matching on level?')
    print('=' * 98)
    print('   log RV_{t+1} = a + b*log RV_t + c*jump_share_t   (demeaned within class-half)')
    print('   c < 0 = at the SAME volatility today, a jumpier day is followed by a QUIETER one.')
    print(f'\n   {"class":10s} {"half":4s} {"n":>7s} {"b (level)":>10s} {"t":>7s} {"c (jump)":>10s} {"t":>7s}')
    agg = collections.defaultdict(lambda: collections.defaultdict(list))
    for pair, R in bypair.items():
        for i in range(len(R) - 1):
            a, b = R[i], R[i + 1]
            if a['rv'] > 0 and b['rv'] > 0:
                agg[a['asset_class']][a['seg']].append(
                    (math.log(b['rv']), math.log(a['rv']), a['jf']))
    ok = 0; tot = 0
    for ac in CLASSES:
        for seg, half in ((0, 'IS'), (1, 'OOS')):
            A = np.array(agg[ac][seg]) if agg[ac][seg] else np.empty((0, 3))
            if A.shape[0] < 200:
                continue
            y = A[:, 0] - A[:, 0].mean()
            c, t = _ols(y, [A[:, 1] - A[:, 1].mean(), A[:, 2] - A[:, 2].mean()])
            tot += 1; ok += (c[2] < 0 and t[2] < -2)
            print(f'   {ac:10s} {half:4s} {A.shape[0]:7d} {c[1]:10.4f} {t[1]:7.1f} '
                  f'{c[2]:10.4f} {t[2]:7.2f}')
    print(f'\n   c < 0 with t < -2 in {ok}/{tot} cells -> '
          + ('the decay ordering is REAL, not the ratio artifact.' if ok == tot
             else 'NOT reliable; read sections 4/5 as an artifact.'))


def section5(bypair):
    print('\n' + '=' * 98)
    print('5. THE 2x2 MAP — jump FREQUENCY x jump SIZE')
    print('=' * 98)
    print('   Frequency = LM jumps/day; size = largest |jump|. Split at IS medians among')
    print('   days that HAD a jump (so the map describes jump days, not quiet ones).')
    for ac in CLASSES:
        print(f'\n   ══ {ac} ══')
        print(f'     {"freq":6s} {"size":6s} {"half":4s} {"n":>6s} {"|ret| %":>8s} '
              f'{"range/sig":>10s} {"contin.":>8s} {"RV decay":>9s}  reading')
        cells = collections.defaultdict(lambda: collections.defaultdict(list))
        for pair, R in bypair.items():
            if not R or R[0]['asset_class'] != ac:
                continue
            IS = [r for r in R if r['seg'] == 0 and r['n_jumps'] > 0]
            if len(IS) < 100:
                continue
            f_med = np.median([r['n_jumps'] for r in IS])
            s_med = np.median([abs(r['max_jump']) for r in IS])
            for r in R:
                if r['n_jumps'] == 0:
                    continue
                fq = 'high' if r['n_jumps'] > f_med else 'low'
                sz = 'high' if abs(r['max_jump']) > s_med else 'low'
                cells[(fq, sz)][r['seg']].append(r)
        names = {('low', 'low'): 'normal', ('low', 'high'): 'shock event',
                 ('high', 'low'): 'choppy', ('high', 'high'): 'stress regime'}
        for fq in ('low', 'high'):
            for sz in ('low', 'high'):
                for seg, half in ((0, 'IS'), (1, 'OOS')):
                    o = _outcomes(cells[(fq, sz)][seg])
                    if not o:
                        continue
                    print(f'     {fq:6s} {sz:6s} {half:4s} {o["n"]:6d} {o["abs_ret"]:8.3f} '
                          f'{o["range_sig"]:10.3f} {o["cont"]*100:7.1f}% {o["decay"]:9.3f}  '
                          f'{names[(fq, sz)] if half == "IS" else ""}')


def main():
    for p in (LM_CSV, RV_CSV):
        if not os.path.exists(p):
            print(f'missing {os.path.basename(p)} — run the earlier phases first'); return 1
    build_daily_bars()
    bypair = {p: split(sorted(R, key=lambda r: r['date'])) for p, R in load_all().items()}
    byclass = collections.defaultdict(list)
    for R in bypair.values():
        for r in R:
            byclass[r['asset_class']].append(r)
    print('=' * 98)
    print('JUMP REGIME BOOK — descriptive measurement, no trade and no cost anywhere in here')
    print('=' * 98)
    print(f'  {sum(len(R) for R in bypair.values()):,d} pair-days, {len(bypair)} instruments, '
          f'{int((1-OOS_FRAC)*100)}/{int(OOS_FRAC*100)} chronological IS/OOS per pair')
    section1(byclass)
    section2(bypair, byclass)
    section2b(bypair)
    section3(byclass, bypair)
    section4(bypair)
    section5(bypair)
    section6(bypair)
    print('\n' + '=' * 98)
    return 0


if __name__ == '__main__':
    sys.exit(main())
