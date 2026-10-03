"""Builds the data behind exhaustion-surface.html and injects it into the page.

Two surfaces, both from the same daily residual as residual_mechanism_check.py
(realised ln(H/L) / Yang-Zhang-10 sigma, 6 FX + NAS100, 2020-09 -> 2026-08):

  calib : x = IV/sigma decile (edges fitted on 2020-22 per instrument),
          y = line quantile q (thresholds = 2020-22 quantiles of the residual),
          z = actual exceedance minus design (1-q), in percentage points.
          Zero everywhere = lines perfectly calibrated whatever the options say.
  time  : x = week, y = instrument, z = 8-week rolling median residual divided
          by the instrument's 2020-22 median (1 = forecast width right).
Descriptive, not pre-registered.
"""
import io, json, re, runpy, contextlib
import numpy as np, pandas as pd

with contextlib.redirect_stdout(io.StringIO()):
    A = runpy.run_path('analysis/exhaustion_residual/residual_mechanism_check.py')['A']
SPLIT = pd.Timestamp('2023-01-01')
QS = [round(x, 2) for x in np.arange(0.30, 0.951, 0.05)]
INSTS = ['EURUSD', 'GBPUSD', 'AUDUSD', 'USDJPY', 'USDCAD', 'USDCHF', 'NAS100']

rows = []
for inst in INSTS:
    m = A[A.inst == inst].copy()
    tr = m.date < SPLIT
    edges = m.loc[tr, 'ivsig'].quantile(np.linspace(0.1, 0.9, 9)).values
    m['dec'] = np.digitize(m.ivsig, edges)            # 0..9
    for q in QS:
        m[f'x{q}'] = m.res > m.loc[tr, 'res'].quantile(q)
    rows.append(m)
B = pd.concat(rows)

def grid(df):
    z, n = [], []
    for q in QS:
        g = df.groupby('dec')[f'x{q}'].agg(['mean', 'size']).reindex(range(10))
        z.append([None if pd.isna(v) else round((v - (1 - q)) * 100, 2) for v in g['mean']])
        n.append([int(v) if not pd.isna(v) else 0 for v in g['size']])
    return {'z': z, 'n': n}

calib = {}
for inst in INSTS + ['ALL']:
    d = B if inst == 'ALL' else B[B.inst == inst]
    calib[inst] = {'all': grid(d), 'train': grid(d[d.date < SPLIT]), 'test': grid(d[d.date >= SPLIT])}

# time surface
weeks, zt, ivs = None, [], []
for inst in INSTS:
    m = A[A.inst == inst].set_index('date').sort_index()
    base = m.loc[m.index < SPLIT, 'res'].median()
    w = (m.res / base).resample('W-FRI').median().rolling(8, min_periods=4).median()
    iv = m.ivsig.resample('W-FRI').median()
    if weeks is None:
        weeks = w.index
    zt.append([None if pd.isna(v) else round(float(v), 3) for v in w.reindex(weeks)])
    ivs.append([None if pd.isna(v) else round(float(v), 3) for v in iv.reindex(weeks)])

ivr = A.copy()
ivr['ivd'] = (ivr.iv30 / np.sqrt(252)).groupby(ivr.inst).shift(1)
ivr['r_iv'] = np.log(ivr.high / ivr.low) / (1.596 * ivr.ivd)
ivr['r_sig'] = np.log(ivr.high / ivr.low) / (1.596 * ivr.sig)
tab = ivr.dropna(subset=['r_iv']).groupby('ivsig_t')[['r_sig', 'r_iv']].median().round(3)

data = {
    'built': pd.Timestamp.now('UTC').strftime('%Y-%m-%d'),
    'span': [str(A.date.min().date()), str(A.date.max().date())],
    'ndays': int(len(A)), 'qs': QS, 'insts': INSTS, 'calib': calib,
    'weeks': [d.strftime('%Y-%m-%d') for d in weeks], 'time': zt, 'ivsig': ivs,
    'optTable': {'tercile': ['cheap', 'middle', 'rich'], 'vsLines': tab.r_sig.tolist(), 'vsOptions': tab.r_iv.tolist()},
}
page = 'exhaustion-surface.html'
html = open(page).read()
blob = json.dumps(data, separators=(',', ':'))
html = re.sub(r'/\*DATA\*/.*?/\*END\*/', lambda _: f'/*DATA*/{blob}/*END*/', html, flags=re.S)
open(page, 'w').write(html)
print('injected', len(blob), 'bytes;', data['span'], data['ndays'], 'days')
