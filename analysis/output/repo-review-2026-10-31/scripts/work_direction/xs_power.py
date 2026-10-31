"""Power-only computation (no real signal is scored): MDE of cross-sectional and pooled designs for FX direction,
on FRED H.10 daily noon rates, truncated at 2026-08-21 (lockbox). Placebo signals are random; outcomes are real
returns, so overlap / cross-correlation / fat tails are carried. Seed 20261031 (same as direction-bar)."""
import sys
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.stats import norm

D = Path(sys.argv[1])
END = pd.Timestamp('2026-08-21')
Z = norm.ppf(0.975) + norm.ppf(0.80)
rng = np.random.default_rng(20261031)

# code: (series, usd_per_foreign)
G10 = {'EUR': ('DEXUSEU', True), 'JPY': ('DEXJPUS', False), 'GBP': ('DEXUSUK', True), 'AUD': ('DEXUSAL', True),
       'CAD': ('DEXCAUS', False), 'CHF': ('DEXSZUS', False), 'NZD': ('DEXUSNZ', True), 'NOK': ('DEXNOUS', False),
       'SEK': ('DEXSDUS', False)}
EM = {'MXN': ('DEXMXUS', False), 'ZAR': ('DEXSFUS', False), 'SGD': ('DEXSIUS', False), 'KRW': ('DEXKOUS', False),
      'BRL': ('DEXBZUS', False), 'INR': ('DEXINUS', False), 'THB': ('DEXTHUS', False)}


def load(sid, usd_per):
    d = pd.read_csv(D / f'{sid}.csv'); d.columns = ['date', 'v']
    s = pd.Series(pd.to_numeric(d.v, errors='coerce').to_numpy(), index=pd.to_datetime(d.date)).dropna()
    s = s[s.index <= END]
    return np.log(s if usd_per else 1 / s)


def panel(codes):
    return pd.DataFrame({c: load(*codes[c]) for c in codes})


def xs_gate(lp, start, freq='ME', h_periods=1, phi=0.9, R=1000, min_n=5):
    """mean rank IC across periods of a random persistent signal vs next-h-period currency returns relative to the
    cross-sectional mean (USD included as a zero-return currency)."""
    lp = lp[lp.index >= start].copy(); lp['USD'] = 0.0
    m = lp.resample(freq).last()
    fwd = m.shift(-h_periods) - m
    fwd = fwd.sub(fwd.mean(axis=1), axis=0)
    fwd = fwd.iloc[:-h_periods]
    Y = fwd.rank(axis=1).to_numpy()            # NaN for missing currencies
    mask = np.isfinite(Y)
    ok = mask.sum(1) >= min_n
    Y, mask = Y[ok], mask[ok]
    T, N = Y.shape
    ics = []
    for _ in range(R):
        x = np.empty((T, N)); x[0] = rng.standard_normal(N)
        e = rng.standard_normal((T, N))
        for t in range(1, T):
            x[t] = phi * x[t - 1] + np.sqrt(1 - phi ** 2) * e[t]
        xm = np.where(mask, x, np.inf)
        a = np.argsort(np.argsort(xm, axis=1), axis=1).astype(float) + 1
        n = mask.sum(1, keepdims=True)
        a = np.where(mask, a - (n + 1) / 2, 0.0)
        b = np.where(mask, Y - (n + 1) / 2, 0.0)
        icv = (a * b).sum(1) / np.sqrt((a * a).sum(1) * (b * b).sum(1))
        ics.append(icv.mean())
    ics = np.array(ics)
    return dict(periods=int(T), mean_N=float(mask.sum(1).mean()), ic_sd=float(ics.std()), mde_ic=float(Z * ics.std()))


def ts_pooled(lp, start, h=20, hl=20, common=False, R=300):
    """time-series design, daily rows, h-day overlapping outcomes, signal persistent (half-life hl days).
    pooled IC = corr over all (date, currency) of signal and standardized forward return (per-currency std)."""
    lp = lp[lp.index >= start]
    lp = lp[lp.index.dayofweek < 5]
    fwd = (lp.shift(-h) - lp).iloc[:-h]
    fwd = (fwd - fwd.mean()) / fwd.std()
    Y = fwd.to_numpy(); mask = np.isfinite(Y)
    T, N = Y.shape
    phi = 0.5 ** (1 / hl)
    ics = []
    for _ in range(R):
        e = rng.standard_normal((T, 1 if common else N))
        x = np.empty_like(e); x[0] = e[0]
        for t in range(1, T):
            x[t] = phi * x[t - 1] + np.sqrt(1 - phi ** 2) * e[t]
        if common:
            x = np.repeat(x, N, axis=1)
        xs, ys = x[mask], Y[mask]
        ics.append(np.corrcoef(xs, ys)[0, 1])
    ics = np.array(ics)
    return dict(days=int(T), N=int(N), obs=int(mask.sum()), ic_sd=float(ics.std()), mde_ic=float(Z * ics.std()),
                n_eff=float(1 / ics.var()))


if __name__ == '__main__':
    g10 = panel(G10); em = panel(EM)
    g8 = g10[['EUR', 'JPY', 'GBP', 'AUD', 'CAD', 'CHF', 'NZD']]
    out = {}
    out['XS_G8_2006_monthly (replicates direction-bar gate)'] = xs_gate(g8, '2006-01-01')
    out['XS_G10_1976_monthly'] = xs_gate(g10, '1976-01-01')
    out['XS_G10_1999_monthly'] = xs_gate(g10, '1999-01-01')
    out['XS_G10+EM7_1995_monthly'] = xs_gate(pd.concat([g10, em], axis=1), '1995-01-01')
    out['XS_G10+EM7_2006_monthly'] = xs_gate(pd.concat([g10, em], axis=1), '2006-01-01')
    out['XS_G10_1976_weekly_rebal_4w_fwd'] = xs_gate(g10, '1976-01-01', freq='W-FRI', h_periods=4, phi=0.975, R=300)
    out['XS_G10_1976_quarterly_h1'] = xs_gate(g10, '1976-01-01', freq='QE', phi=0.7)
    usd_oriented = g10.copy()
    out['TS_single_EUR_2006 (cf. direction-bar 0.18)'] = ts_pooled(g10[['EUR']], '2006-01-01', R=300)
    out['TS_single_JPY_1976'] = ts_pooled(g10[['JPY']], '1976-01-01', R=300)
    out['TS_pooled_G10_1976_independent_signals'] = ts_pooled(g10, '1976-01-01', common=False, R=200)
    out['TS_pooled_G10_1976_common_signal'] = ts_pooled(usd_oriented, '1976-01-01', common=True, R=200)
    out['TS_pooled_G10_2006_independent_signals'] = ts_pooled(g10, '2006-01-01', common=False, R=200)
    for k, v in out.items():
        print(k, {a: (round(b, 4) if isinstance(b, float) else b) for a, b in v.items()}, flush=True)
    pd.Series({k: v['mde_ic'] for k, v in out.items()}).to_json(Path(sys.argv[2]))
