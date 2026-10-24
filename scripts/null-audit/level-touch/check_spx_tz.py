"""Check what clock the naive 'time' column in spx_m1/dow_m1 is on, by aligning with the
UTC-stamped spx500_m1/us30_m1 files on matching closes."""
import pyarrow.parquet as pq, pandas as pd, sys
D = 'VolRangeForecaster/data/m1/'
for a, b in (('spx', 'spx500'), ('dow', 'us30')):
    x = pq.read_table(D + f'{a}_m1.parquet').to_pandas()
    y = pq.read_table(D + f'{b}_m1.parquet').to_pandas()
    tx = pd.to_datetime(x['time']).dt.tz_localize('UTC')
    ty = y.index if 'datetime' not in y.columns else pd.to_datetime(y['datetime'])
    if not isinstance(ty, pd.DatetimeIndex): ty = pd.DatetimeIndex(ty)
    sx = pd.Series(x["close"].values, index=pd.DatetimeIndex(tx)); sy = pd.Series(y['close'].values, index=ty)
    print(a, 'range', tx.min(), tx.max(), len(sx), '|', b, ty.min(), ty.max(), len(sy))
    # gap hours histogram (no bars) in the naive file
    hrs = pd.Series(tx.dt.hour).value_counts().sort_index()
    print(' bars by hour (naive-as-UTC):', dict(hrs))
    for sh in (-5, -4, 0, 1, 4, 5):
        s2 = sx.copy(); s2.index = s2.index + pd.Timedelta(hours=sh)
        j = pd.concat([s2, sy], axis=1, join='inner').dropna()
        if len(j) == 0: print('  shift', sh, 'no overlap'); continue
        print('  shift %+d h: overlap %d, |diff| median %.3f' % (sh, len(j), (j.iloc[:, 0] - j.iloc[:, 1]).abs().median()))
