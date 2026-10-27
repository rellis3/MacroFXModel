"""direction-baseline-audit (EXPLORATORY, not pre-registered).

Question: before building any new direction model, at which horizon / instrument / market condition does simple
causal price information (past-return sign at several look-backs) beat the *base rate* on direction, and is the
number of winning cells above what chance alone would produce?

Data (all on disk in the repo, no fetch):
  FX majors   education/residual_pca_currency_test/data/daily_closes.csv   (closes, 2016-01-04 .. 2026-08-20)
  NQ, SPX     oi_research_book/data/gex_range_es/{nas100,spx500}_nyclose_d1.parquet  (NY-close OHLC, same span)
All sessions are <= 2026-08-20, so nothing touches the lockbox (sessions after 2026-08-21).

Timing: signal uses closes <= t; the position is entered at close t+1 (one-day delay) and held h sessions.
Outcome z = log(C[t+1+h] / C[t+1]) / (sigma20[t] * sqrt(h)), sigma20 = trailing 20-session std of log returns.

Per cell we report, with a moving-block bootstrap (block = max(h, 21) sessions, B = 1000, seed 20261026):
  hit_excess = hit rate  -  the hit rate a random signal with the same long-share would get given the cell's
               up-share (p_long*up + (1-p_long)*(1-up)). This is the honest "better than a coin flip" number: a
               50% benchmark flatters anything that is mostly long a market that mostly goes up.
  timing     = mean(s*z) - mean(s)*mean(z): signed return in sigma units with the "long a rising market" part removed.
Plus a magnitude contrast: Spearman rank correlation of trailing sigma20 with |forward return| (is SIZE predictable?).
Plus a first-touch barrier table on NQ/SPX daily OHLC (which of +-k*sigma is hit first within N sessions).
"""
import json
import math
import os
import sys

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'analysis', 'output', 'direction-baseline-audit')
SEED = 20261026
B = 1000
END = '2026-08-20'
HORIZONS = [1, 5, 20, 60]
LOOKBACKS = [1, 5, 20, 60, 120, 250]
CONDITIONS = ['all', 'vol_high', 'vol_low', 'trend_strong', 'trend_weak']
SPLIT = '2021-01-01'


def load():
    fx = pd.read_csv(os.path.join(ROOT, 'education/residual_pca_currency_test/data/daily_closes.csv'),
                     parse_dates=['date']).set_index('date')
    series = {c.upper(): fx[c].astype(float) for c in fx.columns}
    ohlc = {}
    for key, f in [('NQ', 'nas100'), ('SPX', 'spx500')]:
        d = pd.read_parquet(os.path.join(ROOT, f'oi_research_book/data/gex_range_es/{f}_nyclose_d1.parquet'))
        d.index = pd.to_datetime(d.index)
        d = d[d['n'] >= 60]  # data-rules: keep NY-close bars with >= 60 minutes
        series[key] = d['close'].astype(float)
        ohlc[key] = d
    # USD factor: average daily log return of being long USD against the 7 majors
    r = pd.DataFrame({k: np.log(v).diff() for k, v in series.items() if k not in ('NQ', 'SPX')})
    usd = pd.concat([-r[c] if c.endswith('USD') else r[c] for c in r.columns], axis=1).mean(axis=1, skipna=False)
    series['USD_FACTOR'] = np.exp(usd.fillna(0).cumsum())
    series = {k: v[v.index <= END].dropna() for k, v in series.items()}
    return series, ohlc


def integrity(series):
    rows = []
    for k, s in series.items():
        r = np.log(s).diff().dropna()
        rows.append(dict(key=k, first=str(s.index[0].date()), last=str(s.index[-1].date()), n=len(s),
                         zero_ret=int((r == 0).sum()), max_abs_ret=float(r.abs().max()),
                         max_gap_days=int(s.index.to_series().diff().dt.days.max())))
    return rows


class Boot:
    """Moving-block bootstrap of ratio statistics, using block sums so 1,000 reps are cheap."""

    def __init__(self, n, block, rng):
        self.n, self.block = n, block
        nb = int(math.ceil(n / block))
        self.starts = rng.integers(0, n - block + 1, size=(B, nb))

    def sums(self, x):
        c = np.concatenate([[0.0], np.cumsum(x)])
        bs = c[self.block:] - c[:-self.block]  # sum of each window of length `block`, by start
        return bs[self.starts].sum(axis=1)


def cell_stats(s, z, m, boot):
    """s: signal +-1, z: outcome (sigma units), m: 0/1 mask. Returns point estimates and bootstrap CIs."""
    up = (z > 0).astype(float)
    hit = (np.sign(z) == s).astype(float)
    lng = (s > 0).astype(float)
    parts = dict(m=m, hit=hit * m, lng=lng * m, up=up * m, sz=s * z * m, s=s * m, z=z * m)
    pt = {k: v.sum() for k, v in parts.items()}
    bs = {k: boot.sums(v) for k, v in parts.items()}

    def stats(d):
        n = d['m']
        with np.errstate(invalid='ignore', divide='ignore'):
            pl, pu = d['lng'] / n, d['up'] / n
            chance = pl * pu + (1 - pl) * (1 - pu)
            return d['hit'] / n - chance, d['sz'] / n - (d['s'] / n) * (d['z'] / n), d['hit'] / n, pu, pl

    he, tm, hr, pu, pl = stats(pt)
    bhe, btm, *_ = stats(bs)
    ok = np.isfinite(bhe)

    def ci(a):
        a = a[np.isfinite(a)]
        return [float(np.percentile(a, 2.5)), float(np.percentile(a, 97.5))], float(a.std(ddof=1))

    he_ci, he_se = ci(bhe[ok])
    tm_ci, tm_se = ci(btm[ok])
    return dict(n=int(pt['m']), up_share=float(pu), long_share=float(pl), hit=float(hr),
                hit_excess=float(he), hit_excess_ci=he_ci, hit_excess_t=float(he / he_se) if he_se > 0 else 0.0,
                timing=float(tm), timing_ci=tm_ci, timing_t=float(tm / tm_se) if tm_se > 0 else 0.0)


def build_frame(close):
    lc = np.log(close)
    r = lc.diff()
    sig = r.rolling(20).std()
    df = pd.DataFrame({'lc': lc, 'sig': sig})
    for L in LOOKBACKS:
        df[f'past{L}'] = lc - lc.shift(L)
    vol_med = sig.rolling(250, min_periods=120).median()
    df['vol_high'] = (sig > vol_med).astype(float)
    df['vol_low'] = (sig <= vol_med).astype(float)
    tstat = (lc - lc.shift(60)) / (sig * math.sqrt(60))
    df['trend_strong'] = (tstat.abs() > 1).astype(float)
    df['trend_weak'] = (tstat.abs() <= 1).astype(float)
    for h in HORIZONS:
        df[f'fwd{h}'] = (lc.shift(-(1 + h)) - lc.shift(-1)) / (sig * math.sqrt(h))
    return df


def run_direction(series, rng_seed):
    cells = []
    magnitude = []
    for key, close in series.items():
        df = build_frame(close)
        need = ['sig', 'past250'] + [f'fwd{h}' for h in HORIZONS] + ['vol_high']
        base = df.dropna(subset=['sig', 'past250', 'vol_high'])
        for h in HORIZONS:
            d = base.dropna(subset=[f'fwd{h}'])
            z = d[f'fwd{h}'].to_numpy()
            n = len(d)
            boot = Boot(n, max(h, 21), np.random.default_rng(rng_seed + h))
            # magnitude contrast: does trailing sigma rank the SIZE of the next move?  (raw |return|, not sigma units)
            raw = (np.log(close).shift(-(1 + h)) - np.log(close).shift(-1)).reindex(d.index).abs()
            rho = pd.Series(d['sig'].to_numpy()).rank().corr(pd.Series(raw.to_numpy()).rank())
            magnitude.append(dict(key=key, h=h, spearman_sigma_vs_abs_move=float(rho), n=n))
            for L in LOOKBACKS:
                s = np.sign(d[f'past{L}'].to_numpy())
                s[s == 0] = 1
                for cond in CONDITIONS:
                    m = np.ones(n) if cond == 'all' else d[cond].to_numpy()
                    if m.sum() < 200:
                        continue
                    st = cell_stats(s, z, m, boot)
                    halves = {}
                    for nm, msk in [('h1', d.index < SPLIT), ('h2', d.index >= SPLIT)]:
                        mm = m * msk
                        hit = ((np.sign(z) == s) * mm).sum() / mm.sum()
                        pl, pu = ((s > 0) * mm).sum() / mm.sum(), ((z > 0) * mm).sum() / mm.sum()
                        halves[nm] = float(hit - (pl * pu + (1 - pl) * (1 - pu)))
                    cells.append(dict(key=key, h=h, lookback=L, cond=cond, **st,
                                      hit_excess_h1=halves['h1'], hit_excess_h2=halves['h2']))
    return cells, magnitude


def run_barriers(ohlc):
    """First touch of +k*sigma vs -k*sigma from the entry close within N sessions, using daily high/low.
    A session that touches both is AMBIGUOUS (daily bars cannot order it) and is counted, not dropped silently."""
    rows = []
    for key, d in ohlc.items():
        c, hi, lo = d['close'].to_numpy(), d['high'].to_numpy(), d['low'].to_numpy()
        lc = np.log(d['close'])
        sig = lc.diff().rolling(20).std().to_numpy()
        past = {L: (lc - lc.shift(L)).to_numpy() for L in (20, 60, 250)}
        idx = d.index
        for k, N in [(1.0, 5), (1.5, 10), (2.0, 20)]:
            out = []
            for t in range(250, len(c) - N - 1):
                e = t + 1  # enter at the next close
                up, dn = c[e] * math.exp(k * sig[t]), c[e] * math.exp(-k * sig[t])
                res = 'none'
                for j in range(e + 1, e + 1 + N):
                    hu, hd = hi[j] >= up, lo[j] <= dn
                    if hu and hd:
                        res = 'ambiguous'
                        break
                    if hu:
                        res = 'up'
                        break
                    if hd:
                        res = 'down'
                        break
                out.append((idx[t], res, {L: past[L][t] for L in past}))
            for L in (None, 20, 60, 250):
                for side in ([None] if L is None else ['long', 'short']):
                    sel = [o for o in out if L is None or (o[2][L] > 0) == (side == 'long')]
                    cnt = {x: sum(1 for o in sel if o[1] == x) for x in ('up', 'down', 'ambiguous', 'none')}
                    res_n = cnt['up'] + cnt['down']
                    rows.append(dict(key=key, k=k, N=N, filter='all' if L is None else f'past{L}>0' if side == 'long' else f'past{L}<0',
                                     n=len(sel), **cnt, up_first_share=cnt['up'] / res_n if res_n else None))
    return rows


def count_sig(cells):
    t = np.array([c['timing_t'] for c in cells])
    return dict(pos2=int((t >= 2).sum()), neg2=int((t <= -2).sum()), abs3=int((np.abs(t) >= 3).sum()))


def run_placebo(series, reps):
    """The chance line. Each rep shuffles every instrument's daily returns (same days shuffled for all, so the
    cross-instrument correlation survives) and reruns the identical pipeline. Shuffling destroys any real
    serial dependence, so whatever the pipeline still 'finds' is the small-sample bias plus luck."""
    rng = np.random.default_rng(SEED + 1)
    out = []
    for i in range(reps):
        fake = {}
        perms = {}  # one permutation per series length: the FX block (and USD factor) share one, NQ/SPX another
        for k, s in series.items():
            r = np.log(s).diff().dropna()
            idx = perms.setdefault(len(r), rng.permutation(len(r)))
            fake[k] = pd.Series(np.exp(np.concatenate([[0], np.cumsum(r.to_numpy()[idx])])), index=s.index)
        cells, _ = run_direction(fake, SEED + 100 + i)
        out.append(count_sig(cells))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    series, ohlc = load()
    integ = integrity(series)
    cells, magnitude = run_direction(series, SEED)
    reps = int(os.environ.get('PLACEBO_REPS', '40'))
    placebo = run_placebo(series, reps)
    barriers = run_barriers(ohlc)
    json.dump(dict(study='direction-baseline-audit', status='EXPLORATORY (not pre-registered)', seed=SEED, B=B,
                   end=END, horizons=HORIZONS, lookbacks=LOOKBACKS, conditions=CONDITIONS, split=SPLIT,
                   integrity=integ, real_counts=count_sig(cells), placebo_counts=placebo,
                   cells=cells, magnitude=magnitude, barriers=barriers),
              open(os.path.join(OUT, 'results.json'), 'w'), indent=1)
    print(f'{len(cells)} direction cells, {len(barriers)} barrier rows -> {OUT}/results.json')


if __name__ == '__main__':
    sys.exit(main())
