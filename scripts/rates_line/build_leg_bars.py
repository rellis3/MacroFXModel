"""Compact per-leg bars for the chart page (cog-chart.html): one JSON file per futures contract, 5-minute and 15-minute OHLC of the IBKR 1-minute MIDPOINT price,
drawn at BAR-OPEN time (TradingView's convention: the bar stamped 10:15 holds the minutes 10:15 to 10:29; IBKR stamps a 1-minute bar by its start).
    python scripts/rates_line/build_leg_bars.py [--m5-days 30] [--m15-days 180]
Reads analysis/output/stir_1m_deep/*.parquet, writes analysis/output/cog_chart/leg_<NAME>.json  (columnar: t = epoch seconds, o h l c = PRICE, not rate).
The page turns price into rate (100 - price), spreads, bp, invert and so on itself."""
import argparse
import json
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'analysis' / 'output' / 'stir_1m_deep'
OUT = ROOT / 'analysis' / 'output' / 'cog_chart'
LEGS = {
    'SR3U6': dict(file='CME_SR3U6', label='SOFR Sep26 (CME SR3U6)', group='SOFR', period='16 Sep 2026 - 16 Dec 2026'),
    'SR3Z6': dict(file='CME_SR3Z6', label='SOFR Dec26 (CME SR3Z6)', group='SOFR', period='16 Dec 2026 - 17 Mar 2027'),
    'SR3H7': dict(file='CME_SR3H7', label='SOFR Mar27 (CME SR3H7)', group='SOFR', period='17 Mar 2027 - 16 Jun 2027'),
    'IH7': dict(file='ICEEU_IH7', label='Euribor Mar27 (ICE IH7 = what I2! showed in the video week)', group='Euribor', period='17 Mar 2027 - 17 Jun 2027'),
    'IZ6': dict(file='ICEEU_IZ6', label='Euribor Dec26 (ICE IZ6)', group='Euribor', period='16 Dec 2026 - 17 Mar 2027'),
    'ER3Z6': dict(file='ICEEU_ER3Z6', label='ESTR 3M Dec26 (ICE ER3Z6)', group='ESTR', period='16 Dec 2026 - 17 Mar 2027'),
    'ER3H7': dict(file='ICEEU_ER3H7', label='ESTR 3M Mar27 (ICE ER3H7)', group='ESTR', period='17 Mar 2027 - 16 Jun 2027'),
}


def bars(df, rule):
    g = df.resample(rule, label='left', closed='left')
    out = pd.DataFrame({'o': g['open'].first(), 'h': g['high'].max(), 'l': g['low'].min(), 'c': g['close'].last(), 'n': g['close'].count()})
    return out[out.n >= 1].drop(columns='n')


def pack(b):
    t = ((b.index - pd.Timestamp('1970-01-01', tz='UTC')) // pd.Timedelta(seconds=1)).tolist()      # epoch seconds, independent of the index resolution
    r = lambda s: [None if not np.isfinite(v) else round(float(v), 4) for v in s.tolist()]
    return dict(t=t, o=r(b.o), h=r(b.h), l=r(b.l), c=r(b.c))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--m5-days', type=int, default=30)
    ap.add_argument('--m15-days', type=int, default=180)
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    meta = []
    for name, spec in LEGS.items():
        p = SRC / f'{spec["file"]}.parquet'
        if not p.exists():
            print(name, 'missing', p)
            continue
        d = pd.read_parquet(p)
        d['time'] = pd.to_datetime(d['time'], utc=True)
        d = d.set_index('time').sort_index()
        end = d.index.max()
        m15 = bars(d, '15min')
        m15 = m15[m15.index >= end - pd.Timedelta(days=a.m15_days)]
        m5 = bars(d[d.index >= end - pd.Timedelta(days=a.m5_days + 1)], '5min')
        m5 = m5[m5.index >= end - pd.Timedelta(days=a.m5_days)]
        obj = dict(name=name, label=spec['label'], group=spec['group'], period=spec['period'], source='IBKR 1-minute MIDPOINT (bid/ask midpoint, not trades)', convention='bar-open time (TradingView)',
                   asOf=str(end), m5=pack(m5), m15=pack(m15))
        (OUT / f'leg_{name}.json').write_text(json.dumps(obj, separators=(',', ':')), encoding='utf-8')
        meta.append(dict(name=name, label=spec['label'], group=spec['group'], period=spec['period'], asOf=str(end), m5=len(m5), m15=len(m15)))
        print(f'{name}: m5 {len(m5)} bars, m15 {len(m15)} bars, to {end}, {(OUT / f"leg_{name}.json").stat().st_size / 1024:.0f} KB')
    (OUT / 'legs_meta.json').write_text(json.dumps(meta, indent=1), encoding='utf-8')
