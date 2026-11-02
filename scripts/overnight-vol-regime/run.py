"""overnight-vol-regime: does the overnight hold's risk-adjusted gross return change with the vol regime at entry?

Pre-registered in forge/OVERNIGHT_VOL_REGIME_PREREG.md (registered 2026-11-02, commit fd1a6144) before this script existed.

Two modes, run in this order with an owner review between them:
  --mode controls   prereg section 5.4: overlap validation, data quality, measured null SE, planted-effect detection.
                    Never computes b on the real alignment: every statistic here pairs z with a label-shifted x
                    (shift >= 63 nights from the real alignment) or uses one side only.
  --mode score      the scored run (H1, H2) and the credibility checks. Built only after the owner has reviewed controls.

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
TICK_COST = {'nq': (2 * 0.25 * 20 + 5.0, 20)}          # futures net: 1 tick a side + $5 round trip; $ per point


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
    rv = f.rv20.to_numpy()
    x = np.full(len(rv), np.nan)
    for i in range(253, len(rv)):                      # mid-rank among the previous 252 values
        w = rv[i - 252:i]
        if np.isfinite(rv[i]) and np.isfinite(w).all():
            x[i] = ((w < rv[i]).sum() + 0.5 * (w == rv[i]).sum()) / 252
    f['x'] = x
    return f


def attach(n, f):
    """Each night takes sigma and x from the last D1 close strictly before its entry date (t-1)."""
    i = np.searchsorted(f.index.to_numpy(), n.date.to_numpy(), side='left') - 1
    ok = i >= 0
    for c in ('sig', 'x'):
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
    return t[['date', 'entryEpoch', 'exitEpoch', 'gross', 'net', 'spread', 'financing']].assign(src='banked')


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
        b = pd.concat([ext[['date', 'entryEpoch', 'exitEpoch', 'gross', 'src']], b], ignore_index=True)
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


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', choices=['controls', 'score'], required=True)
    a = ap.parse_args()
    if a.mode == 'score':
        sys.exit('score mode is built after the owner reviews the controls output (prereg section 5.4)')
    run_controls()
