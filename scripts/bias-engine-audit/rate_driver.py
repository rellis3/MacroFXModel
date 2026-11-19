"""bias-engine-audit, item 2: what does the 'Rate differential trend' driver actually measure?

Exploratory, not pre-registered; descriptive only (no outcome joined, nothing fitted). Rebuilds, month by month, the
engine's rates driver (js/biasEngine.js ratesDriver: band(z, [0.5, 1.5]) + gap-vs-8-average ±1 at 1.5 pp, clamped) from
the same short-rate series rate_diff_v1 uses (js/yieldCurveEngine.js YIELD_CURVE_UNIVERSE .short; z = latestZScore,
24-print baseline, population SD), and compares the pair-level result (d_base - d_quote) with the actual bilateral
short-rate differential (level, and its 3- and 12-month change).

Caveats: latest-vintage FRED (not first prints); GBP uses IR3TIB01GBM156N (the FRED 3m series the live store used until
it died 2026-01; live now uses BoE Bank Rate). Observations dated on/after 2026-08-01 are dropped (lockbox 2026-08-21:
the August monthly average is not known before it).

    python3 -I scripts/bias-engine-audit/rate_driver.py      -> analysis/output/bias-engine-audit/rate_driver.json
"""
import json
import urllib.request
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'analysis' / 'output' / 'bias-engine-audit'
DATA = OUT / 'data'
DATA.mkdir(parents=True, exist_ok=True)
SER = {'USD': 'GS2', 'EUR': 'IRSTCI01DEM156N', 'GBP': 'IR3TIB01GBM156N', 'JPY': 'IRSTCI01JPM156N', 'AUD': 'IR3TIB01AUM156N',
       'CAD': 'IRSTCI01CAM156N', 'CHF': 'IR3TIB01CHM156N', 'NZD': 'IR3TIB01NZM156N'}
CUT = pd.Timestamp('2026-08-01')
PRIORITY = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY']


def fred(sid):
    p = DATA / f'{sid}.csv'
    if not p.exists():
        with urllib.request.urlopen(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}', timeout=60) as r:
            p.write_bytes(r.read())
    d = pd.read_csv(p)
    d.columns = ['date', 'value']
    d['date'] = pd.to_datetime(d['date'])
    d['value'] = pd.to_numeric(d['value'], errors='coerce')
    d = d.dropna()
    return d[d['date'] < CUT].set_index('date')['value']


def latest_z(vals, lookback=24, min_base=6):
    v = [x for x in vals if np.isfinite(x)]
    if len(v) < min_base + 1:
        return np.nan
    last, base = v[-1], v[max(0, len(v) - 1 - lookback):len(v) - 1]
    m = sum(base) / len(base)
    sd = (sum((x - m) ** 2 for x in base) / len(base)) ** 0.5
    floor = max(1e-9, abs(m) * 1e-9)
    if sd < floor:
        return 0.0 if abs(last - m) < floor else (4.0 if last > m else -4.0)
    return round((last - m) / sd, 2)


def band(x, t1=0.5, t2=1.5):
    if not np.isfinite(x):
        return np.nan
    a = abs(x)
    return 2 * np.sign(x) if a >= t2 else np.sign(x) if a >= t1 else 0.0


L = pd.DataFrame({c: fred(s) for c, s in SER.items()}).sort_index()
L = L[L.index >= pd.Timestamp('1999-01-01')]
months = L.index[L.index >= pd.Timestamp('2002-01-01')]
rows = []
for t in months:
    lv = {}
    for c in SER:
        s = L[c].loc[:t].dropna()
        if len(s) and s.index[-1] == t:
            lv[c] = (round(float(s.iloc[-1]), 2), latest_z(list(s.values)))
    if len(lv) < 4:
        continue
    avg = np.mean([v[0] for v in lv.values()])
    for c, (lev, z) in lv.items():
        if not np.isfinite(z):
            continue
        gap = lev - avg
        dz = band(z)
        dg = 1 if gap >= 1.5 else -1 if gap <= -1.5 else 0
        rows.append({'date': t, 'ccy': c, 'level': lev, 'z': z, 'gap': gap, 'dz': dz, 'dg': dg, 'd': float(np.clip(dz + dg, -2, 2)),
                     'flat_floor': abs(z) == 4.0})
R = pd.DataFrame(rows)
cur = R[(R['date'] >= pd.Timestamp('2010-01-01'))]
res = {'note': 'Exploratory, not pre-registered. Latest-vintage FRED monthly short rates, observations before 2026-08-01.',
       'sample': [str(cur['date'].min().date()), str(cur['date'].max().date())], 'currency_months': int(len(cur))}
# 1. what moves d: the z part vs the level part
res['currency_level'] = {
    'share_d_nonzero': round(float((cur['d'] != 0).mean()), 3),
    'share_dz_nonzero': round(float((cur['dz'] != 0).mean()), 3),
    'share_dgap_nonzero': round(float((cur['dg'] != 0).mean()), 3),
    'share_z_and_gap_parts_opposed': round(float(((cur['dz'] * cur['dg']) < 0).mean()), 3),
    'share_z_is_flat_floor_pm4': round(float(cur['flat_floor'].mean()), 3),
    'abs_z_ge_0p5_share': round(float((cur['z'].abs() >= 0.5).mean()), 3),
    'abs_z_ge_1p5_share': round(float((cur['z'].abs() >= 1.5).mean()), 3),
    'spearman_d_vs_level_gap': round(float(cur[['d', 'gap']].corr('spearman').iloc[0, 1]), 3),
    'spearman_d_vs_z': round(float(cur[['d', 'z']].corr('spearman').iloc[0, 1]), 3),
    'd_month_to_month_change_share': None,
}
piv_d = cur.pivot(index='date', columns='ccy', values='d')
res['currency_level']['d_month_to_month_change_share'] = round(float((piv_d.diff().abs() > 0).sum().sum() / piv_d.diff().notna().sum().sum()), 3)
# per-currency
res['by_ccy'] = {c: {'share_d_pos': round(float((g['d'] > 0).mean()), 3), 'share_d_neg': round(float((g['d'] < 0).mean()), 3),
                     'mean_gap_pp': round(float(g['gap'].mean()), 2), 'share_flat_floor': round(float(g['flat_floor'].mean()), 3),
                     'share_z_gap_opposed': round(float(((g['dz'] * g['dg']) < 0).mean()), 3)} for c, g in cur.groupby('ccy')}
# 2. pair level: engine's (d_b - d_q) vs the bilateral differential
lev = cur.pivot(index='date', columns='ccy', values='level')
pr = []
for b, q in combinations(PRIORITY, 2):
    if b not in lev or q not in lev:
        continue
    diff = lev[b] - lev[q]
    dd = piv_d[b] - piv_d[q]
    f = pd.DataFrame({'dd': dd, 'diff': diff, 'chg3': diff - diff.shift(3), 'chg12': diff - diff.shift(12)}).dropna()
    f['pair'] = b + q
    pr.append(f)
P = pd.concat(pr)
sgn = np.sign
nz = P[P['dd'] != 0]
res['pair_level'] = {
    'pair_months': int(len(P)),
    'share_engine_rates_term_nonzero': round(float((P['dd'] != 0).mean()), 3),
    'sign_agree_with_bilateral_level_when_nonzero': round(float((sgn(nz['dd']) == sgn(nz['diff'])).mean()), 3),
    'sign_agree_with_3m_change_when_both_nonzero': round(float((sgn(nz['dd']) == sgn(nz['chg3']))[nz['chg3'] != 0].mean()), 3),
    'sign_agree_with_12m_change_when_both_nonzero': round(float((sgn(nz['dd']) == sgn(nz['chg12']))[nz['chg12'] != 0].mean()), 3),
    'spearman_dd_vs_level': round(float(P[['dd', 'diff']].corr('spearman').iloc[0, 1]), 3),
    'spearman_dd_vs_chg3': round(float(P[['dd', 'chg3']].corr('spearman').iloc[0, 1]), 3),
    'spearman_dd_vs_chg12': round(float(P[['dd', 'chg12']].corr('spearman').iloc[0, 1]), 3),
    'share_wrong_way_vs_level_with_gap_ge_2pp': round(float(((sgn(P['dd']) == -sgn(P['diff'])) & (P['diff'].abs() >= 2) & (P['dd'] != 0)).sum() / max(1, ((P['diff'].abs() >= 2) & (P['dd'] != 0)).sum())), 3),
    'share_zero_engine_term_with_gap_ge_2pp': round(float(((P['dd'] == 0) & (P['diff'].abs() >= 2)).sum() / max(1, (P['diff'].abs() >= 2).sum())), 3),
}
# 3. the last month before the cut, per currency (latest vintage)
last = cur[cur['date'] == cur['date'].max()].set_index('ccy')[['level', 'z', 'gap', 'dz', 'dg', 'd']].round(2)
res['last_month'] = {'date': str(cur['date'].max().date()), 'rows': last.to_dict(orient='index')}
(OUT / 'rate_driver.json').write_text(json.dumps(res, indent=1, default=float))
print(json.dumps(res, indent=1, default=float))
