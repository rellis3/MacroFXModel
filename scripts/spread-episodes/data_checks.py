"""spread-episodes step 0: data checks + spread-only event counts (no setup outcome is computed here).
Writes analysis/output/spread-episodes/DATA_CHECKS.md and data_checks.json, and caches the bars for the run."""
import json, os, sys
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(__file__))
from common import *

os.makedirs(OUT, exist_ok=True)
L = ['# spread-episodes: data checks', '', 'Computed before any setup outcome. Window ends 2026-08-20 (lockbox).', '']
J = {}

# ---------------- Case 1 ----------------
c1 = case1_matrices(); days, X, P, SL, EL = c1['days'], c1['X'], c1['P'], c1['S'], c1['E']
q = quality_days(SL, EL)
wk = days.dayofweek < 5
valid = np.isfinite(X) & np.isfinite(P) & q[:, None] & wk[:, None]
np.savez_compressed(os.path.join(OUT, 'case1_bars.npz'), days=days.strftime('%Y-%m-%d').to_numpy(), X=X, P=P, S=SL, E=EL, q=q)
L += ['## Case 1: SOFR Sep26 (SR3U6) − Euribor Mar27 (IH7), bp, vs NAS100 (OANDA), 15-min', '']
L += [f'- Window {days[0].date()} → {days[-1].date()}; weekdays {int(wk.sum())}; days failing the ≥3-distinct-prices screen {int((~q & wk).sum())}; usable 15-min bars {int(valid.sum())}.']
raw = c1['raw']
def unchanged_1m(s):
    s = s[s.index.dayofweek < 5]; return float((s.diff() == 0).mean())
def unchanged_15(M):
    out = []
    for r in M:
        r = r[np.isfinite(r)]
        if len(r) > 1: out.append(np.r_[np.nan, np.diff(r)] == 0)
    a = np.concatenate([o[1:] for o in out]); return float(a.mean())
u = {'SR3U6 1m': unchanged_1m(raw['sofr1']), 'IH7 1m': unchanged_1m(raw['eur1']), 'NAS100 1m': unchanged_1m(raw['nas1']),
     'SR3U6 15m': unchanged_15(np.where(q[:, None] & wk[:, None], SL, np.nan)), 'IH7 15m': unchanged_15(np.where(q[:, None] & wk[:, None], EL, np.nan)),
     'spread 15m': unchanged_15(np.where(valid, X, np.nan))}
J['case1_unchanged'] = u
L += ['', '| series | share of bars unchanged from the previous bar |', '|---|---|'] + [f'| {k} | {v:.1%} |' for k, v in u.items()]
# by hour (UTC) for each leg at 15 min
hr = []
for h in range(24):
    sl = slice(h * 4, h * 4 + 4)
    def uh(M):
        a = M[:, max(0, h * 4 - 1):h * 4 + 4]; a = a[q & wk]; d = np.diff(a, axis=1); f = np.isfinite(d); return float((d[f] == 0).mean()) if f.sum() > 50 else np.nan
    cov = float(np.isfinite(EL[q & wk][:, sl]).mean())
    hr.append((h, uh(SL), uh(EL), cov))
J['case1_unchanged_by_hour'] = hr
L += ['', 'Unchanged share by UTC hour (15-min bars), and how often the Euribor leg prints at all in that hour:', '', '| UTC hour | SR3U6 unchanged | IH7 unchanged | IH7 bar present |', '|---|---|---|---|']
L += [f'| {h:02d} | {a:.0%} | {b:.0%} | {c:.0%} |' for h, a, b, c in hr]
# timestamp alignment: lag profile of the known same-bar link (data check, not a setup outcome)
xf, pf = X[valid], P[valid]; dx, dp = np.diff(xf), np.diff(pf)
lp = {}
for lag in range(-3, 4):
    if lag >= 0: a, b = dx[:len(dx) - lag], dp[lag:]
    else: a, b = dx[-lag:], dp[:len(dp) + lag]
    lp[lag] = float(np.corrcoef(a, b)[0, 1])
J['case1_lag_profile'] = lp
L += ['', 'Timestamp alignment: correlation of the 15-min spread change with the NAS100 log change L bars later (L<0 = price earlier). A correctly aligned pair peaks at 0:', '',
      '| L | ' + ' | '.join(str(k) for k in lp) + ' |', '|---|' + '---|' * len(lp), '| corr | ' + ' | '.join(f'{v:+.3f}' for v in lp.values()) + ' |', '']
# spread-only event counts
L += ['Spread-only event counts (confirmed zig-zag turns), and the median delay from turn to confirmation:', '', '| k | period | turns | median turn→confirm (bars of 15 min) | p90 |', '|---|---|---|---|---|']
flat_days = np.repeat(np.arange(len(days)), SLOTS).reshape(len(days), SLOTS)[valid]
per = period_of(days[flat_days], P1)
B = day_rms_scale(X, 16, valid)
cnt = {}
for k in (0.5, 0.75, 1.0, 1.5):
    tu, co, di = zigzag(xf, k * B)
    for name, _, _ in P1:
        m = per[co] == name; lag = co[m] - tu[m]
        cnt[(k, name)] = int(m.sum())
        L.append(f'| {k} | {name} | {int(m.sum())} | {np.median(lag) if m.any() else np.nan:.0f} | {np.percentile(lag, 90) if m.any() else np.nan:.0f} |')
J['case1_counts'] = {f'{k}|{p}': v for (k, p), v in cnt.items()}

# ---------------- Case 2 ----------------
df = case2_frame(); df.to_parquet(os.path.join(OUT, 'case2_daily.parquet'))
L += ['', '## Case 2: US 2Y / 10Y (FRED DGS2, DGS10) vs EURUSD (FRED DEXUSEU, noon New York), daily', '']
gaps = df.index.to_series().diff().dt.days
L += [f'- Rows {len(df)} ({df.index[0].date()} → {df.index[-1].date()}); spacing: {float((gaps == 1).mean()):.0%} one day, {float((gaps == 3).mean()):.0%} three days (weekend), max gap {int(gaps.max())} days. The FRED series are daily by construction.']
u2 = {c: float((df[c].diff() == 0).mean()) for c in ['DGS2', 'DGS10', 'AVG', 'SLOPE', 'DEXUSEU']}
J['case2_unchanged'] = u2
L += ['', '| series | share of days unchanged |', '|---|---|'] + [f'| {k} | {v:.1%} |' for k, v in u2.items()]
# source check vs OANDA NY close (2016+)
try:
    e = pd.read_parquet(os.path.join(ROOT, 'VolRangeForecaster/data/m1/eurusd_m1.parquet'))['close']; e.index = pd.to_datetime(e.index, utc=True)
    ny = e.tz_convert('America/New_York'); noon = ny[(ny.index.hour == 12) & (ny.index.minute == 0)]
    noon.index = noon.index.tz_localize(None).normalize()
    j = pd.concat([np.log(df['DEXUSEU']).diff(), np.log(noon).diff()], axis=1, keys=['fred', 'oanda']).dropna()
    j = j[(j.index >= '2016-01-06')]
    cc = float(j.corr().iloc[0, 1]); J['case2_dexuseu_vs_oanda_noon_corr'] = cc
    L += ['', f'- DEXUSEU daily log change vs OANDA EURUSD at 12:00 New York, 2016 → 2026-08: correlation {cc:.3f} on {len(j)} days (source check).']
except Exception as ex:
    L += [f'- OANDA source check failed: {ex}']
lp2 = {}
for c in ['AVG', 'DGS2', 'DGS10', 'SLOPE']:
    dy, dfx = df[c].diff(), df['P'].diff()
    lp2[c] = {lag: float(dy.corr(dfx.shift(-lag))) for lag in (-1, 0, 1)}
J['case2_lag_profile'] = lp2
L += ['', 'Alignment: correlation of the daily yield change with the EURUSD log change L days later (L=+1: yield of day d vs FX d→d+1). FRED yields are end of day, DEXUSEU is noon, so a same-day yield change partly happens after the noon print; this is why the design enters at day d+1.', '',
      '| series | L=-1 | L=0 | L=+1 |', '|---|---|---|---|'] + [f'| {c} | {v[-1]:+.3f} | {v[0]:+.3f} | {v[1]:+.3f} |' for c, v in lp2.items()]
L += ['', 'Spread-only event counts:', '', '| series | k | period | turns | median turn→confirm (days) |', '|---|---|---|---|---|']
per2 = period_of(df.index, P2); cnt2 = {}
for c in ['AVG', 'DGS2', 'DGS10', 'SLOPE']:
    x = df[c].to_numpy(); B2 = row_rms_scale(x, 5)
    for k in (0.5, 0.75, 1.0, 1.5):
        tu, co, di = zigzag(x, k * B2)
        for name, _, _ in P2:
            m = per2[co] == name; cnt2[f'{c}|{k}|{name}'] = int(m.sum())
            L.append(f'| {c} | {k} | {name} | {int(m.sum())} | {np.median(co[m] - tu[m]) if m.any() else np.nan:.0f} |')
J['case2_counts'] = cnt2
L += ['', '## The TradingView line in your chart', '',
      '- The "C.OG Normalised 10Y and 02Y Yields" script is not in this repo, so its source and timeframe cannot be checked here. In the screenshot the line moves within days (e.g. the 15 Oct spike), so it is not a pure daily series; flat stretches look like carried-forward values. Following your instruction the test treats the yields as daily (FRED), which is what can be verified.']
open(os.path.join(OUT, 'DATA_CHECKS.md'), 'w', encoding='utf-8').write('\n'.join(L))
json.dump(J, open(os.path.join(OUT, 'data_checks.json'), 'w'), indent=1, default=str)
print('\n'.join(L))
