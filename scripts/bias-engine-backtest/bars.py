"""bias-engine-backtest step 1a: the price bars the engine's trend / basket / SPX / commodity drivers read.

Per engine price name: D1 bars on the London-midnight boundary (the server's OANDA D, alignmentTimezone Europe/London,
dailyAlignment 0) and H4 bars on OANDA's default boundary (17:00 New York + 4h steps), both built from Oanda mid M1
(2016-01-04 ->). Before 2016 only NY-close daily closes exist (features/px_d1_*: 7 majors, gold, NAS100, SPX500); those
are used as D1 bars (closing 17:00 New York, 5-7 hours before the London boundary) and there is no H4 (the engine then
uses D1 alone, capped at +/-1, as it does live when H4 is missing). WTI / COPPER: OANDA macro D1 (UTC boundary, 2016 ->);
WTI before 2016 from FRED DCOILWTICO lagged 7 days (publication). Bars stamped t = bar OPEN (ms UTC) as the engine
expects; it keeps only bars with t + duration <= the issue time.
    python -X utf8 -I scripts/bias-engine-backtest/bars.py
"""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *  # noqa

DAY_MS, H4_MS = 86_400_000, 14_400_000


def london_d1(df):
    t = pd.DatetimeIndex(df['time']).tz_localize('UTC').tz_convert(LON)
    lab = t.tz_localize(None).normalize()
    g = df.groupby(lab.to_numpy())
    c, n = g['close'].last(), g.size()
    c = c[(n >= 60).to_numpy()]
    idx = pd.DatetimeIndex(c.index)
    keep = idx.dayofweek < 5
    c, idx = c[keep], idx[keep]
    t0 = idx.tz_localize(LON).tz_convert('UTC').tz_localize(None)
    return [[int(a.value // 10**6), float(v)] for a, v in zip(t0, c.to_numpy())]


def ny_h4(df):
    t = pd.DatetimeIndex(df['time']).tz_localize('UTC').tz_convert(NY).tz_localize(None)
    start_local = (t - pd.Timedelta(hours=17)).floor('4h') + pd.Timedelta(hours=17)
    g = df.groupby(start_local.to_numpy())
    c, n = g['close'].last(), g.size()
    c = c[(n >= 10).to_numpy()]
    idx = pd.DatetimeIndex(c.index).tz_localize(NY, ambiguous='NaT', nonexistent='shift_forward')
    ok = ~idx.isna()
    idx, c = idx[ok], c[ok]
    t0 = idx.tz_convert('UTC').tz_localize(None)
    return [[int(a.value // 10**6), float(v)] for a, v in zip(t0, c.to_numpy())]


def nyclose_bars(s, before):
    s = s[s.index < before]
    out = []
    for d, v in s.items():
        close = pd.Timestamp(d.year, d.month, d.day, 17, 0, tz=NY).tz_convert('UTC').tz_localize(None)
        out.append([int((close.value // 10**6) - DAY_MS), float(v)])
    return out


def main():
    INP.mkdir(parents=True, exist_ok=True)
    m1_start = pd.Timestamp('2016-01-04')
    cov = {}
    for name, (stem, pxkey, _) in PRICE_SRC.items():
        df = read_m1_mid(stem)
        d1, h4 = london_d1(df), ny_h4(df)
        pre = nyclose_bars(px_d1(pxkey), m1_start) if pxkey else []
        d1 = pre + [b for b in d1 if b[0] >= int(m1_start.tz_localize(LON).tz_convert('UTC').tz_localize(None).value // 10**6) - DAY_MS]
        (INP / f'bars_{name}.json').write_text(json.dumps({'d1': d1, 'h4': h4}))
        cov[name] = {'d1_first': pd.Timestamp(d1[0][0], unit='ms').isoformat(), 'd1_n': len(d1),
                     'h4_first': pd.Timestamp(h4[0][0], unit='ms').isoformat(), 'h4_n': len(h4)}
        log(name, cov[name])
    for name, stem in (('WTI', 'wti'), ('COPPER', 'copper')):
        import pyarrow.parquet as pq
        d = pq.read_table(MAIN / 'Oanda Parquet Files' / 'macro' / f'{stem}_d1.parquet').to_pandas(ignore_metadata=True)
        idx = pd.DatetimeIndex(pd.to_datetime(d['datetime']))
        if getattr(idx, 'tz', None) is not None:
            idx = idx.tz_convert('UTC').tz_localize(None)
        s = pd.Series(d['close'].to_numpy(), index=idx).sort_index()
        s = s[s.index + pd.Timedelta(days=1) <= M1_CUTOFF_UTC]
        bars = [[int(a.value // 10**6), float(v)] for a, v in s.items() if a.dayofweek < 5]
        if name == 'WTI':
            f = pd.read_csv(MAIN / 'analysis' / 'output' / 'rangebook' / 'macro' / 'DCOILWTICO.csv')
            f.columns = ['date', 'value']
            f['value'] = pd.to_numeric(f['value'], errors='coerce')
            f = f.dropna()
            f = f[(pd.to_datetime(f['date']) >= pd.Timestamp('2009-01-01')) & (pd.to_datetime(f['date']) < pd.Timestamp('2016-01-01')) & (f['value'] > 0)]
            pre = [[int((pd.Timestamp(r.date) + pd.Timedelta(days=7)).value // 10**6) - DAY_MS, float(r.value)] for r in f.itertuples()]
            bars = pre + bars
        (INP / f'bars_{name}.json').write_text(json.dumps({'d1': bars, 'h4': []}))
        cov[name] = {'d1_first': pd.Timestamp(bars[0][0], unit='ms').isoformat(), 'd1_n': len(bars), 'h4_n': 0}
        log(name, cov[name])
    (INP / 'bars_coverage.json').write_text(json.dumps(cov, indent=1))


if __name__ == '__main__':
    main()
