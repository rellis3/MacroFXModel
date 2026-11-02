"""overnight-vol-regime: does the overnight hold's risk-adjusted gross return change with the vol regime at entry?

Pre-registered in forge/OVERNIGHT_VOL_REGIME_PREREG.md (registered 2026-11-02, commit fd1a6144) before this script existed.

Two modes, run in this order with an owner review between them:
  --mode controls   prereg section 5.4: overlap validation, data quality, measured null SE, planted-effect detection.
                    Never computes b on the real alignment: every statistic here pairs z with a label-shifted x
                    (shift >= 63 nights from the real alignment) or uses one side only.
  --mode score      the scored run (H1, H2) and the credibility checks; built and run once after the owner reviewed controls.

Usage: python -I scripts/overnight-vol-regime/run.py --mode controls
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'analysis' / 'output' / 'overnight-vol-regime'
SEED = 20261102
END = pd.Timestamp('2026-08-21')                       # lockbox: nothing after is read
EXT_START, EXT_END = pd.Timestamp('2009-01-02'), pd.Timestamp('2016-10-21')
D1 = {'nq': 'nas100', 'gold': 'xauusd'}
LON = 'Europe/London'
MAX_GAP = 1800                                         # as scripts/overnight-hold-futures/build.py
B, N_PLACEBO, MIN_SHIFT, N_REP = 2000, 2000, 63, 200
PLANTS = [0.0, 0.05, 0.10, 0.15, 0.20]
SESOI, LARGE = 0.05, 0.15
ERA_SPLIT = {'nq': pd.Timestamp('2016-10-24'), 'gold': pd.Timestamp('2021-08-21')}
FUT_COST = {'nq': (2 * 0.25 * 20 + 5.0, 20), 'gold': (2 * 0.10 * 100 + 5.0, 100)}   # futures net: 1 tick a side + $5 round trip ($); $ per point


# ---------------------------------------------------------------- data
def d1(inst):
    d = pd.read_parquet(ROOT / 'features' / f'px_d1_{D1[inst]}.parquet')
    if 'vintage' in d and d['vintage'].notna().any():
        d = d.sort_values(['date', 'vintage']).drop_duplicates('date', keep='last')
    s = pd.Series(pd.to_numeric(d['value'], errors='coerce').to_numpy(), index=pd.to_datetime(d['date'])).dropna()
    s = s[~s.index.duplicated(keep='last')].sort_index()
    s = s[(s.index.dayofweek < 5) & (s.index <= END)]  # weekend rows are a known fault (DATA_SPEC #9)
    lr = np.log(s).diff()
    f = pd.DataFrame({'px': s})
    f['sig'] = np.sqrt(lr.pow(2).ewm(alpha=0.06, adjust=False, min_periods=60).mean()) * 100   # daily sigma, %
    f['rv20'] = np.sqrt(252 * lr.pow(2).rolling(20, min_periods=20).mean())
    f['x'] = pct252(f.rv20.to_numpy())
    f['x_ewma'] = pct252(f.sig.to_numpy())                                     # secondary (B3)
    f['x_rv60'] = pct252(np.sqrt(252 * lr.pow(2).rolling(60, min_periods=60).mean()).to_numpy())
    f['r5z'] = (np.log(f.px / f.px.shift(5)) * 100) / f.sig                   # B2 control: prior 5-day return in sigma units
    return f


def pct252(v):
    """Mid-rank of each value among the previous 252 values (NaN until 252 are available)."""
    x = np.full(len(v), np.nan)
    for i in range(252, len(v)):
        w = v[i - 252:i]
        if np.isfinite(v[i]) and np.isfinite(w).all():
            x[i] = ((w < v[i]).sum() + 0.5 * (w == v[i]).sum()) / 252
    return x


def attach(n, f):
    """Each night takes sigma and x from the last D1 close strictly before its entry date (t-1)."""
    i = np.searchsorted(f.index.to_numpy(), n.date.to_numpy(), side='left') - 1
    ok = i >= 0
    for c in [c for c in ('sig', 'x', 'x_ewma', 'x_rv60', 'r5z') if c in f]:
        n[c] = np.where(ok, f[c].to_numpy()[np.clip(i, 0, None)], np.nan)
    n['z'] = n.gross / n.sig
    return n


def epoch(ts):
    return ts.dt.tz_convert('UTC').dt.tz_localize(None).astype('datetime64[s]').astype('int64').to_numpy()


def price_at(ep, close, target):
    i = np.searchsorted(ep, target, side='right') - 1
    ok = (i >= 0) & (target - ep[np.clip(i, 0, None)] <= MAX_GAP)
    return np.where(ok, close[np.clip(i, 0, None)], np.nan), i


def rule_nights(start, end):
    """Mon-Thu entries at 20:00 London, exit 14:30 London the next weekday (the banked rule)."""
    days = pd.bdate_range(start, end)
    days = days[days.dayofweek < 4]
    ent = pd.Series(days + pd.Timedelta(hours=20)).dt.tz_localize(LON)
    ext = pd.Series(days + pd.Timedelta(days=1, hours=14, minutes=30)).dt.tz_localize(LON)
    return pd.DataFrame({'date': days, 'entryEpoch': epoch(ent), 'exitEpoch': epoch(ext)})


def drive_prices(n):
    d = pd.read_parquet(ROOT / 'analysis/output/nt8/drive/NQ_1m_drive.parquet', columns=['utc', 'c'])
    ep, cl = epoch(d.utc), d.c.to_numpy()
    p0, i0 = price_at(ep, cl, n.entryEpoch.to_numpy())
    p1, i1 = price_at(ep, cl, n.exitEpoch.to_numpy())
    good = np.isfinite(p0) & np.isfinite(p1) & (i1 > i0) & (n.exitEpoch.to_numpy() <= ep[-1])
    n = n.assign(entryPrice=p0, exitPrice=p1, gross=(p1 / p0 - 1) * 100,
                 why=np.where(~np.isfinite(p0), 'no entry minute', np.where(~np.isfinite(p1), 'no exit minute',
                              np.where(n.exitEpoch.to_numpy() > ep[-1], 'after file end', np.where(i1 <= i0, 'no bars between', '')))))
    return n, good, int(ep[-1])


def banked(inst):
    t = pd.read_csv(ROOT / f'analysis/output/overnight-hold/honest_trades_{inst}.csv', parse_dates=['date', 'exitDate'])
    t = t[t.exitDate <= END].rename(columns={'grossPct': 'gross'})
    return t[['date', 'entryEpoch', 'exitEpoch', 'entryPrice', 'gross', 'net', 'spread', 'financing']].assign(src='banked')


def nights(inst):
    """The study sample. NQ: futures extension 2009-01 -> 2016-10, then the banked trades unchanged."""
    b = banked(inst)
    info = {}
    if inst == 'nq':
        ext, good, _ = drive_prices(rule_nights(EXT_START, EXT_END))
        info['ext_built'] = {int(y): int(c) for y, c in ext.date.dt.year.value_counts().sort_index().items()}
        info['ext_dropped'] = {f'{int(y)} {w}': int(c) for (y, w), c in
                               ext[~good].groupby([ext[~good].date.dt.year, ext[~good].why]).size().items()}
        info['ext_dropped_dates'] = [str(d.date()) for d in ext[~good].date]
        ext = ext[good].assign(src='futures')
        b = pd.concat([ext[['date', 'entryEpoch', 'exitEpoch', 'entryPrice', 'gross', 'src']], b], ignore_index=True)
    b = b.sort_values('date').reset_index(drop=True)
    return b, info


# ---------------------------------------------------------------- null machinery (never on the real alignment)
def shift_slopes(z, x):
    """b for every circular shift k of x against z: b[k] = cov(z, roll(x, k)) / var(x). b[0] is never read."""
    zc, xc = z - z.mean(), x - x.mean()
    c = np.fft.ifft(np.fft.fft(zc) * np.conj(np.fft.fft(xc))).real
    return c / (xc @ xc)


def valid_shifts(n, base=0):
    k = np.arange(n)
    tot = (k + base) % n
    return k[(np.minimum(k, n - k) >= MIN_SHIFT) & (np.minimum(tot, n - tot) >= MIN_SHIFT)]


def month_sums(month_codes, M, z, x):
    s = np.zeros((M, 5))
    for j, v in enumerate((np.ones_like(z), x, z, x * x, x * z)):
        s[:, j] = np.bincount(month_codes, weights=v, minlength=M)
    return s


def boot_slopes(C, sums):
    S = C @ sums                                       # (B, 5): n, Sx, Sz, Sxx, Sxz
    N = S[:, 0]
    return (S[:, 4] - S[:, 1] * S[:, 2] / N) / (S[:, 3] - S[:, 1] ** 2 / N)


def ols(z, x):
    xc = x - x.mean()
    return float(xc @ (z - z.mean()) / (xc @ xc))


def controls_for(label, df, rng):
    z, x = df.z.to_numpy(), df.x.to_numpy()
    n = len(z)
    codes, months = pd.factorize(df.date.dt.to_period('M'))
    M = len(months)
    C = rng.multinomial(M, np.full(M, 1 / M), size=B).astype(float)

    iid = z.std(ddof=1) / (x.std(ddof=1) * np.sqrt(n))
    allb = shift_slopes(z, x)
    vk = valid_shifts(n)
    plac_sd = float(allb[vk].std(ddof=1))
    boot_sd = []
    for s in rng.choice(vk, 20, replace=False):        # bootstrap SD on shifted pairings
        xs = np.roll(x, s)
        boot_sd.append(boot_slopes(C, month_sums(codes, M, z, xs)).std(ddof=1))
    se = max(plac_sd, float(np.mean(boot_sd)))
    zc = norm.ppf(1 - 0.025 / 2) + norm.ppf(0.80)

    plant = {}
    bases = rng.choice(vk, N_REP, replace=False)
    for bt in PLANTS:
        rows = []
        for s in bases:
            xs = np.roll(x, s)
            zp = z + bt * (xs - 0.5)
            bp = ols(zp, xs)
            pb = shift_slopes(zp, xs)
            ks = valid_shifts(n, base=s)
            dist = pb[rng.choice(ks, N_PLACEBO, replace=len(ks) < N_PLACEBO)]
            p = float((np.abs(dist - dist.mean()) >= abs(bp - dist.mean())).mean())
            bs = boot_slopes(C, month_sums(codes, M, zp, xs))
            lo, hi = np.percentile(bs, [2.5, 97.5])
            rows.append((bp, p, lo, hi))
        r = np.array(rows)
        bp, p, lo, hi = r.T
        excl0 = (lo > 0) | (hi < 0)
        ev025, ev05 = (p < 0.025) & excl0, (p < 0.05) & excl0
        plant[f'{bt:.2f}'] = {
            'evidence_holm_first_step_a025': float(ev025.mean()),
            'evidence_a05': float(ev05.mean()),
            'evidence_wrong_sign': float((ev05 & (np.sign(bp) != np.sign(bt))).mean()) if bt else None,
            'large_ruled_out': float(((lo > -LARGE) & (hi < LARGE)).mean()),
            'null_inside_sesoi': float(((lo > -SESOI) & (hi < SESOI)).mean()),
            'uninformative': float((~ev05 & ~((lo > -LARGE) & (hi < LARGE))).mean()),
            'median_ci_half_width': float(np.median((hi - lo) / 2)),
            'mean_estimate': float(bp.mean()),
        }
    return {
        'nights': n, 'months': M,
        'sd_z': float(z.std(ddof=1)),
        'iid_se': float(iid), 'placebo_sd': plac_sd, 'boot_sd_shifted': float(np.mean(boot_sd)),
        'deff_placebo': float((plac_sd / iid) ** 2), 'deff_boot': float((np.mean(boot_sd) / iid) ** 2),
        'mde_measured': float(zc * se), 'ci_half_width_null': float(1.96 * se),
        'planted': plant,
    }


def x_profile(x):
    x = x[np.isfinite(x)]
    q = np.histogram(x, bins=[0, .25, .5, .75, 1.0001])[0] / len(x)
    return {'n': int(len(x)), 'mean': round(float(x.mean()), 3), 'sd': round(float(x.std()), 3),
            'quartile_shares': [round(float(v), 3) for v in q], 'share_ge_0.90': round(float((x >= 0.9).mean()), 3)}


def overlap_check():
    """Futures-file gross vs banked OANDA gross, same rule, 2016-10-24 -> file end. Gross only: no x is touched."""
    bk = banked('nq')
    rn, good, file_end = drive_prices(rule_nights(pd.Timestamp('2016-10-24'), END))
    rn = rn[good]
    m = bk.merge(rn[['date', 'entryEpoch', 'exitEpoch', 'gross']], on='date', how='outer', suffixes=('_cfd', '_fut'), indicator=True)
    upto = pd.to_datetime(file_end, unit='s') - pd.Timedelta(days=1)
    both = m[m._merge == 'both']
    d = both.gross_fut - both.gross_cfd
    only_cfd = m[(m._merge == 'left_only') & (m.date <= upto)]
    only_fut = m[m._merge == 'right_only']
    return {
        'window': ['2016-10-24', str(upto.date())],
        'matched_nights': int(len(both)),
        'corr': round(float(np.corrcoef(both.gross_fut, both.gross_cfd)[0, 1]), 4),
        'mean_diff_pct': round(float(d.mean()), 5), 'sd_diff_pct': round(float(d.std()), 4),
        'abs_diff_p99_pct': round(float(d.abs().quantile(0.99)), 4),
        'entry_epoch_mismatch': int((both.entryEpoch_cfd != both.entryEpoch_fut).sum()),
        'exit_epoch_mismatch': int((both.exitEpoch_cfd != both.exitEpoch_fut).sum()),
        'banked_only_dates': [str(x.date()) for x in only_cfd.date],
        'rule_only_dates': [str(x.date()) for x in only_fut.date],
        'pass': bool(np.corrcoef(both.gross_fut, both.gross_cfd)[0, 1] >= 0.98 and abs(d.mean()) <= 0.005),
    }


def run_controls():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    res = {'mode': 'controls', 'seed': SEED, 'prereg': 'forge/OVERNIGHT_VOL_REGIME_PREREG.md',
           'withheld': 'b on the real alignment in any subset; bucket means; costs by regime; raw-% slope; era means; Group A/B checks'}
    ov = overlap_check()
    res['overlap'] = ov
    print('overlap', json.dumps({k: v for k, v in ov.items() if not k.endswith('_dates')}),
          'banked-only', len(ov['banked_only_dates']), 'rule-only', len(ov['rule_only_dates']))
    for inst in ('nq', 'gold'):
        n, info = nights(inst)
        n = attach(n, d1(inst))
        miss = n[~np.isfinite(n.x) | ~np.isfinite(n.z)]
        n = n[np.isfinite(n.x) & np.isfinite(n.z)].reset_index(drop=True)
        era = n.date < ERA_SPLIT[inst]
        bk16 = n[n.src == 'banked']
        r = {'quality': info | {'nights_without_x_or_sigma': [str(d.date()) for d in miss.date]},
             'x_profile': {'all': x_profile(n.x.to_numpy()), 'era1': x_profile(n.x[era].to_numpy()), 'era2': x_profile(n.x[~era].to_numpy())},
             'unconditional_banked_2016plus': {'nights': int(len(bk16)), 'mean_z': round(float(bk16.z.mean()), 4),
                                               'sd_z': round(float(bk16.z.std()), 4), 'median_sigma_pct': round(float(bk16.sig.median()), 3)},
             'x_autocorr': {str(l): round(float(pd.Series(n.x).autocorr(l)), 3) for l in (1, 20, 60)}}
        if inst == 'nq':
            ex = n[n.src == 'futures']
            r['extension_sd_z'] = round(float(ex.z.std()), 4)   # SD only; the era mean is withheld until score
            r['design'] = {'extended': controls_for('nq extended', n, rng), 'banked_only': controls_for('nq 2016+', bk16.reset_index(drop=True), rng),
                           'era1_null_ci_half_width': None, 'era2_null_ci_half_width': None}
            for e, sub in (('era1', n[era]), ('era2', n[~era])):
                r['design'][f'{e}_null_ci_half_width'] = controls_for(e, sub.reset_index(drop=True), np.random.default_rng(SEED))['ci_half_width_null']
        else:
            r['design'] = {'all': controls_for('gold', n, rng)}
            for e, sub in (('era1', n[era]), ('era2', n[~era])):
                r['design'][f'{e}_null_ci_half_width'] = controls_for(e, sub.reset_index(drop=True), np.random.default_rng(SEED))['ci_half_width_null']
        res[inst] = r
        print(inst, json.dumps({k: v for k, v in r.items() if k not in ('quality', 'design')}))
        for k, v in r['design'].items():
            print(' ', k, json.dumps(v) if not isinstance(v, dict) else json.dumps({a: b for a, b in v.items() if a != 'planted'}))
            if isinstance(v, dict):
                for bt, row in v['planted'].items():
                    print('     plant', bt, json.dumps(row))
        print('  quality', json.dumps({k: v for k, v in r['quality'].items() if k != 'ext_dropped_dates'}))
    (OUT / 'controls.json').write_text(json.dumps(res, indent=1))
    print('wrote', OUT / 'controls.json')


# ---------------------------------------------------------------- score mode (prereg sections 3.4-3.5, 4, 5.2-5.3)
QUARTS = [(0, .25), (.25, .5), (.5, .75), (.75, 1.01)]


def intraday_rv(inst):
    """Realised vol of 1-min closes 14:30-19:59 London on each weekday (known at the 20:00 entry), as a 252-day percentile.
    NQ: the futures file to its last day, OANDA M1 after; gold: OANDA M1 (from 2016-10, so the first year has none)."""
    parts = []
    m = pd.read_parquet(ROOT / f'data/m1_bidask/{inst}_m1.parquet', columns=['time', 'close'])
    m = pd.DataFrame({'t': m.time.dt.tz_localize('UTC').dt.tz_convert(LON), 'c': m.close.to_numpy()})
    if inst == 'nq':
        d = pd.read_parquet(ROOT / 'analysis/output/nt8/drive/NQ_1m_drive.parquet', columns=['utc', 'c'])
        d = pd.DataFrame({'t': d.utc.dt.tz_convert(LON), 'c': d.c.to_numpy()})
        cut = d.t.max().normalize()
        parts.append(d[d.t < cut])
        m = m[m.t >= cut]
    parts.append(m)
    a = pd.concat(parts, ignore_index=True)
    mins = a.t.dt.hour * 60 + a.t.dt.minute
    a = a[(mins >= 14 * 60 + 30) & (mins < 20 * 60)]
    a = a.assign(day=a.t.dt.tz_localize(None).dt.normalize().astype('datetime64[ns]'))
    a['r'] = np.log(a.c).groupby(a.day).diff()
    g = a.dropna(subset=['r']).groupby('day').r
    rv = np.sqrt(g.apply(lambda r: (r ** 2).sum())).where(g.size() >= 60).dropna()
    rv = rv[(rv.index.dayofweek < 5) & (rv.index <= END)]
    return pd.Series(pct252(rv.to_numpy()), index=rv.index)


def boot_ci(C, codes, M, z, x):
    return [float(v) for v in np.percentile(boot_slopes(C, month_sums(codes, M, z, x)), [2.5, 97.5])]


def slope_ci(df, ycol, xcol, rng):
    d = df[np.isfinite(df[ycol]) & np.isfinite(df[xcol])]
    codes, months = pd.factorize(d.date.dt.to_period('M'))
    M = len(months)
    C = rng.multinomial(M, np.full(M, 1 / M), size=B).astype(float)
    y, x = d[ycol].to_numpy(), d[xcol].to_numpy()
    return {'n': int(len(d)), 'b': ols(y, x), 'ci': boot_ci(C, codes, M, y, x)}


def placebo_p(z, x, rng):
    allb = shift_slopes(z, x)
    vk = valid_shifts(len(z))
    dist = allb[rng.choice(vk, N_PLACEBO, replace=len(vk) < N_PLACEBO)]
    b = ols(z, x)
    return float((np.abs(dist - dist.mean()) >= abs(b - dist.mean())).mean()), float(dist.std(ddof=1))


def flip_count(z, x, sign):
    """Nights removed, most supportive first (largest sign*(x-xbar)(z-zbar)), until the slope changes sign."""
    keep = np.ones(len(z), bool)
    for k in range(1, len(z) // 2):
        zz, xx = z[keep], x[keep]
        idx = np.flatnonzero(keep)[np.argmax(sign * (xx - xx.mean()) * (zz - zz.mean()))]
        keep[idx] = False
        if np.sign(ols(z[keep], x[keep])) != sign:
            return k
    return None


def quart(df):
    return [df[(df.x >= a0) & (df.x < a1)] for a0, a1 in QUARTS]


def describe(df, inst):
    base = float((df.gross > 0).mean())
    tot = df.gross.sum()
    usd, per_pt = FUT_COST[inst]
    df = df.assign(fut_cost=usd / (df.entryPrice * per_pt) * 100)
    df = df.assign(fut_net=df.gross - df.fut_cost, cfd_cost=df.spread + df.financing)
    groups = dict(zip(['Q1', 'Q2', 'Q3', 'Q4'], quart(df)))
    groups['extreme_ge_0.90'] = df[df.x >= 0.9]
    groups['all'] = df
    out = {}
    for k, g in groups.items():
        bk = g[g.src == 'banked']
        out[k] = {
            'nights': int(len(g)), 'mean_gross_pct': float(g.gross.mean()),
            'mean_net_cfd_pct_2016plus': float(bk.net.mean()) if len(bk) else None,
            'mean_net_futures_pct': float(g.fut_net.mean()), 'mean_z': float(g.z.mean()),
            'hit_rate': float((g.gross > 0).mean()), 'hit_minus_base': float((g.gross > 0).mean() - base),
            'sd_gross': float(g.gross.std()), 'skew': float(g.gross.skew()),
            'p5': float(g.gross.quantile(.05)), 'p95': float(g.gross.quantile(.95)), 'worst': float(g.gross.min()),
            'share_of_gross_pnl': float(g.gross.sum() / tot),
            'cfd_spread_pct': float(bk.spread.mean()) if len(bk) else None,
            'cfd_financing_pct': float(bk.financing.mean()) if len(bk) else None,
            'cfd_cost_over_mean_gross': float(bk.cfd_cost.mean() / bk.gross.mean()) if len(bk) and bk.gross.mean() > 0 else None,
            'futures_cost_pct': float(g.fut_cost.mean()),
        }
    return out, df


def score_instrument(inst, df, rng):
    z, x = df.z.to_numpy(), df.x.to_numpy()
    codes, months = pd.factorize(df.date.dt.to_period('M'))
    M = len(months)
    C = rng.multinomial(M, np.full(M, 1 / M), size=B).astype(float)
    b = ols(z, x)
    p, psd = placebo_p(z, x, rng)
    sign = np.sign(b)
    r = {'primary': {'nights': int(len(z)), 'months': M, 'b': b, 'ci95': boot_ci(C, codes, M, z, x),
                     'placebo_p_raw': p, 'placebo_sd': psd}}

    # Group A: concentration (can only demote)
    era = df.date < ERA_SPLIT[inst]
    eras = {}
    for nm, sub in (('era1', df[era]), ('era2', df[~era])):
        e = slope_ci(sub, 'z', 'x', rng)
        rd = 'consistent' if np.sign(e['b']) == sign else ('uninformative' if e['ci'][0] <= b <= e['ci'][1] else 'contradicts')
        eras[nm] = e | {'from': str(sub.date.min().date()), 'to': str(sub.date.max().date()), 'reading': rd}
    keep = np.setdiff1d(np.arange(len(z)), np.argsort(-np.abs(z))[:10])
    b_top = ols(z[keep], x[keep])
    yr = df.date.dt.year
    ep = df[~yr.isin([2020, 2022])]
    b_ep = ols(ep.z.to_numpy(), ep.x.to_numpy())
    loyo = {int(y): ols(df.z[yr != y].to_numpy(), df.x[yr != y].to_numpy()) for y in sorted(yr.unique())}
    conc = lambda bb: 'concentrated' if (np.sign(bb) != sign or abs(bb) < abs(b) / 2) else 'holds'
    r['A'] = {
        'A1_eras': eras,
        'A2_drop_top10_absz': {'b': b_top, 'reading': conc(b_top), 'nights_to_flip_sign': flip_count(z, x, sign)},
        'A3_drop_2020_2022': {'b': b_ep, 'reading': conc(b_ep),
                              'leave_one_year_out_range': [min(loyo.values()), max(loyo.values())], 'loyo': loyo},
    }
    # Group B: character (qualifies, never changes the verdict word)
    q = [float(g.z.mean()) for g in quart(df)]
    steps = int(sum(np.sign(q[i + 1] - q[i]) == sign for i in range(3)))
    d2 = df[np.isfinite(df.r5z)]
    X = np.column_stack([np.ones(len(d2)), d2.x, d2.r5z] + [(d2.date.dt.dayofweek == k).astype(float) for k in (1, 2, 3)])
    coef = np.linalg.lstsq(X, d2.z.to_numpy(), rcond=None)[0]
    b_ctrl = float(coef[1])
    sec = {c: slope_ci(df, 'z', c, rng) for c in ('x_ewma', 'x_rv60', 'x_intra')}
    agree = int(sum(np.sign(v['b']) == sign for v in sec.values()))
    r['B'] = {
        'B1_shape': {'quartile_mean_z': q, 'steps_with_slope': steps, 'reading': 'gradual' if steps >= 2 else 'threshold or one bucket'},
        'B2_controls': {'b_with_controls': b_ctrl, 'r5z_coef': float(coef[2]), 'nights': int(len(d2)),
                        'reading': 'explained by recent returns' if (np.sign(b_ctrl) != sign or abs(b_ctrl) < abs(b) / 2) else 'survives controls'},
        'B3_definitions': {'slopes': sec, 'same_sign': agree, 'reading': 'general' if agree >= 2 else 'RV20-specific'},
    }
    # Described, not scored
    buckets, d3 = describe(df, inst)
    bk = d3[d3.src == 'banked']
    r['described'] = {
        'buckets': buckets,
        'raw_slope_gross_pct': slope_ci(d3, 'gross', 'x', rng),
        'cost_slope_cfd_pct_2016plus': slope_ci(bk, 'cfd_cost', 'x', rng),
        'spread_slope_cfd_pct_2016plus': slope_ci(bk, 'spread', 'x', rng),
        'financing_slope_cfd_pct_2016plus': slope_ci(bk, 'financing', 'x', rng),
        'cost_slope_futures_pct': slope_ci(d3, 'fut_cost', 'x', rng),
        'net_cfd_slope_z_2016plus': slope_ci(bk.assign(nz=bk.net / bk.sig), 'nz', 'x', rng),
        'year_by_year': {int(y): {'nights': int(len(g)), 'b': ols(g.z.to_numpy(), g.x.to_numpy()) if len(g) > 30 else None,
                                  'mean_z': float(g.z.mean()),
                                  'quartile_mean_z': [float(h.z.mean()) if len(h) else None for h in quart(g)]}
                         for y, g in d3.groupby(d3.date.dt.year)},
        'era_mean_z': {'era1': float(df[era].z.mean()), 'era2': float(df[~era].z.mean())},
        'dst_mismatch_nights': int((pd.to_datetime(df.entryEpoch, unit='s', utc=True).dt.tz_convert('America/New_York').dt.hour != 15).sum()),
    }
    return r


def verdict(r, holm_p):
    b, (lo, hi) = r['primary']['b'], r['primary']['ci95']
    evidence = holm_p < 0.05 and (lo > 0 or hi < 0)
    large_out, small_out = lo > -LARGE and hi < LARGE, lo > -SESOI and hi < SESOI
    A, Bc = r['A'], r['B']
    a_fail = [k for k, v in (('A1', 'contradicts' in (A['A1_eras']['era1']['reading'], A['A1_eras']['era2']['reading'])),
                             ('A2', A['A2_drop_top10_absz']['reading'] == 'concentrated'),
                             ('A3', A['A3_drop_2020_2022']['reading'] == 'concentrated')) if v]
    b_not = [k for k, v in (('B1', Bc['B1_shape']['reading'] != 'gradual'),
                            ('B2', Bc['B2_controls']['reading'] != 'survives controls'),
                            ('B3', Bc['B3_definitions']['reading'] != 'general')) if v]
    if evidence and not a_fail:
        word, label = 'VALIDATED', 'credibility ' + ('high' if not b_not else 'moderate (' + ', '.join(b_not) + ')')
    elif evidence:
        word, label = 'UNDERPOWERED', 'effect concentrated (' + ', '.join(a_fail) + ')'
    elif small_out:
        word, label = 'NULL', 'too small to be useful'
    elif large_out:
        word, label = 'UNDERPOWERED', 'large effect ruled out'
    else:
        word, label = 'UNDERPOWERED', 'uninformative'
    return {'holm_p': holm_p,
            'Q1_evidence': 'yes' if evidence and not a_fail else 'yes, but concentrated' if evidence else 'no',
            'Q1_direction': ('positive' if b > 0 else 'negative') if evidence else None,
            'Q2_large_ruled_out': bool(large_out), 'Q3_useful_smaller_excluded': bool(small_out),
            'group_A_failures': a_fail, 'group_B_not_supportive': b_not, 'verdict': word, 'label': label}


def run_score():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    res = {'mode': 'score', 'seed': SEED, 'prereg': 'forge/OVERNIGHT_VOL_REGIME_PREREG.md', 'run': pd.Timestamp.now().strftime('%Y-%m-%d')}
    for inst in ('nq', 'gold'):
        n, _ = nights(inst)
        n = attach(n, d1(inst))
        xi = intraday_rv(inst)
        n['x_intra'] = xi.reindex(pd.DatetimeIndex(n.date)).to_numpy()
        n = n[np.isfinite(n.x) & np.isfinite(n.z)].reset_index(drop=True)
        res[inst] = score_instrument(inst, n, rng)
        print(inst, 'primary', json.dumps(res[inst]['primary']), flush=True)
    ps = [res[k]['primary']['placebo_p_raw'] for k in ('nq', 'gold')]
    holm, run_max = [0.0, 0.0], 0.0
    for rank, j in enumerate(np.argsort(ps)):
        run_max = max(run_max, min(1.0, (2 - rank) * ps[j]))
        holm[j] = run_max
    for j, k in enumerate(('nq', 'gold')):
        res[k]['verdict'] = verdict(res[k], holm[j])
        print(k, 'verdict', json.dumps(res[k]['verdict']))
        print(k, 'A', json.dumps(res[k]['A'], default=float))
        print(k, 'B', json.dumps(res[k]['B'], default=float))
    (OUT / 'results.json').write_text(json.dumps(res, indent=1, default=float))
    print('wrote', OUT / 'results.json')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', choices=['controls', 'score'], required=True)
    a = ap.parse_args()
    run_score() if a.mode == 'score' else run_controls()
