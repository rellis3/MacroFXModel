"""ZERO-FIT test of the identified formula: plot = (SOFR rate - Euribor rate) in bp * 0.1 + 1.445   (inBps ON, invert ON, scale 0.1, offset = his default 1.445).
Nothing is fitted. Which EUR x USD contract months, data timeframe, source and EMA give the right ABSOLUTE level and shape?  RMSE in his units."""
import itertools, os, numpy as np, pandas as pd
from scipy.signal import lfilter
exec(open('scripts/rate_diff_nq/cog_param_sweep.py').read().split("t0 = time.time(); LEG")[0])      # reuse loaders/legs() from the sweep script
LEG = legs(MID, 'mid'); LEG.update(legs(TRD, 'trd'))
rows = []
for tag, e, u, tf, src, sm in itertools.product(('mid', 'trd'), EUR, USD, ('15min', '30min', '1h', '4h'), ('close', 'ohlc4', 'hl2'), (1, 2, 3, 5, 8)):
    le, lu = LEG.get((e, tf, src, tag)), LEG.get((u, tf, src, tag))
    if le is None or lu is None: continue
    s = (lu - le) * 100                                   # SOFR rate - Euribor rate in bp  (= invert ON, inBps ON)
    a = 2 / (sm + 1); f = s if sm == 1 else lfilter([a], [1, -(1 - a)], s, zi=[(1 - a) * s[0]])[0]
    y = f * 0.1 + 1.445; ok = np.isfinite(y)
    r = his.to_numpy()[ok] - y[ok]; rows.append((tag, e, u, tf, src, sm, np.sqrt((r ** 2).mean()), r.mean(), np.corrcoef(his.to_numpy()[ok], y[ok])[0, 1], np.corrcoef(np.diff(his.to_numpy()[ok]), np.diff(y[ok]))[0, 1]))
R = pd.DataFrame(rows, columns=['type', 'eur', 'usd', 'tf', 'src', 'ema', 'rmse', 'bias', 'level_corr', 'chg_corr']).sort_values('rmse')
R.to_csv('analysis/output/cog_video_0918/cog_formula_check.csv', index=False)
pd.set_option('display.width', 200); print(f'{len(R)} zero-fit configurations; his line 7.74..8.73 (mean {his.mean():.2f}, sd {his.std():.2f})')
print('\nbest 15 by absolute-level RMSE (units):'); print(R.head(15).round(3).to_string(index=False))
print('\nbest per EUR leg (usd/tf/src/ema shown, midpoint+trades):'); print(R.loc[R.groupby('eur').rmse.idxmin()].round(3).to_string(index=False))
print('\nbest per USD leg:'); print(R.loc[R.groupby('usd').rmse.idxmin()].round(3).to_string(index=False))
print('\nhis stated pair SR3U6 x I2!(IX6) best:', R[(R.eur == 'IX6') & (R.usd == 'SR3U6')].head(1)[['rmse', 'bias', 'level_corr', 'chg_corr']].round(3).to_dict('records'))
