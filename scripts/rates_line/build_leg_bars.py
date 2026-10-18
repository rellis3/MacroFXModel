"""Compact per-contract bars for the chart page (cog-chart.html): one JSON file per futures contract, 5-minute and 15-minute OHLC of the IBKR 1-minute MIDPOINT price,
drawn at BAR-OPEN time (TradingView's convention: the bar stamped 10:15 holds the minutes 10:15 to 10:29; IBKR stamps a 1-minute bar by its start).
    python scripts/rates_line/build_leg_bars.py [--m5-days 30] [--m15-days 180]
Discovers EVERY US and euro rates contract on disk (SOFR 3M, fed funds 30-day, 2y/5y/10y/30y Treasury futures, Euribor 3M, ESTR 3M, Schatz / Bobl / Bund / Buxl), merging the same contract
from every folder it appears in. Writes analysis/output/cog_chart/leg_<NAME>.json (columnar: t = epoch seconds, o h l c = PRICE, not rate) and legs_meta.json (name, label, group, side, kind, period, coverage).
`kind` is 'rate' for contracts quoted as 100 - rate (the page can turn price into rate) and 'price' for bond futures (it cannot)."""
import argparse
import calendar
import datetime as dt
import json
import re
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUTROOT = ROOT / 'analysis' / 'output'
OUT = OUTROOT / 'cog_chart'
DIRS = ['stir_1m_deep', 'stir_1m_meeting', 'stir_1m', 'stir_1m_i2', 'stir_1m_sweep/mid', 'stir_1m_bonds']      # midpoint folders only (the trades folders are trade prices)
MONTH = {'F': 1, 'G': 2, 'H': 3, 'J': 4, 'K': 5, 'M': 6, 'N': 7, 'Q': 8, 'U': 9, 'V': 10, 'X': 11, 'Z': 12}
MNAME = {1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun', 7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec'}


def third_wed(y, m):
    return [d for d in calendar.Calendar().itermonthdates(y, m) if d.month == m and d.weekday() == 2][2]


def add_months(y, m, k):
    m2 = m - 1 + k
    return y + m2 // 12, m2 % 12 + 1


def describe(stem):
    """stem like CME_SR3U6 -> (name, label, group, side, kind, period) or None if it is not a US / euro rates contract."""
    m = re.match(r'^(CME|ICEEU|CBOT)_(SR3|ER3|I|ZQ|ZT|ZF|ZN|ZB|UB)([FGHJKMNQUVXZ])(\d)$', stem)
    if m:
        ex, root, mc, yd = m.groups()
        y, mo = 2020 + int(yd), MONTH[mc]
        tag = f'{MNAME[mo]}{str(y)[2:]}'
        name = f'{root}{mc}{yd}'
        if root in ('SR3', 'ER3', 'I'):
            ye, me = add_months(y, mo, 3)
            period = f'{third_wed(y, mo):%d %b %Y} - {third_wed(ye, me):%d %b %Y}'
            if root == 'SR3':
                return name, f'SOFR {tag} (CME {name})', 'SOFR 3M (CME SR3)', 'US', 'rate', period
            if root == 'ER3':
                return name, f'ESTR 3M {tag} (ICE {name})', 'ESTR 3M (ICE ER3)', 'EUR', 'rate', period
            return name, f'Euribor 3M {tag} (ICE {name})' + (' = what I2! showed in the video week' if name == 'IH7' else ''), 'Euribor 3M (ICE I)', 'EUR', 'rate', period
        if root == 'ZQ':
            last = calendar.monthrange(y, mo)[1]
            return name, f'Fed funds 30-day {tag} (CBOT {name})', 'Fed funds 30-day (CBOT ZQ)', 'US', 'rate', f'average over {MNAME[mo]} {y} (1 - {last} {MNAME[mo]})'
        label = {'ZT': 'US 2y note', 'ZF': 'US 5y note', 'ZN': 'US 10y note', 'ZB': 'US 30y bond', 'UB': 'US Ultra bond'}[root]
        return name, f'{label} future {tag} (CBOT {name})', 'US Treasury futures (price, not a rate)', 'US', 'price', 'bond future: price only'
    m = re.match(r'^EUREX_(FGBS|FGBM|FGBL|FGBX)_(\d{8})_M$', stem)
    if m:
        root, d = m.groups()
        y, mo = int(d[:4]), int(d[4:6])
        label = {'FGBS': 'Schatz (German 2y)', 'FGBM': 'Bobl (German 5y)', 'FGBL': 'Bund (German 10y)', 'FGBX': 'Buxl (German 30y)'}[root]
        return f'{root}{d[2:6]}', f'{label} future {MNAME[mo]}{str(y)[2:]} (Eurex {root})', 'German bond futures (price, not a rate)', 'EUR', 'price', 'bond future: price only'
    return None


def bars(df, rule):
    g = df.resample(rule, label='left', closed='left')
    out = pd.DataFrame({'o': g['open'].first(), 'h': g['high'].max(), 'l': g['low'].min(), 'c': g['close'].last(), 'n': g['close'].count()})
    return out[out.n >= 1].drop(columns='n')


def pack(b):
    t = ((b.index - pd.Timestamp('1970-01-01', tz='UTC')) // pd.Timedelta(seconds=1)).tolist()      # epoch seconds, independent of the index resolution
    r = lambda s: [None if not np.isfinite(v) else round(float(v), 4) for v in s.tolist()]
    return dict(t=t, o=r(b.o), h=r(b.h), l=r(b.l), c=r(b.c))


def discover():
    found = {}
    for d in DIRS:
        for f in sorted((OUTROOT / d).glob('*.parquet')):
            info = describe(f.stem)
            if info:
                found.setdefault(info[0], dict(info=info, stem=f.stem, files=[]))['files'].append(f)
    return found


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--m5-days', type=int, default=30)
    ap.add_argument('--m15-days', type=int, default=180)
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    meta = []
    for name, rec in sorted(discover().items()):
        _, label, group, side, kind, period = rec['info']
        frames = []
        for f in rec['files']:
            x = pd.read_parquet(f)
            x['time'] = pd.to_datetime(x['time'], utc=True)
            frames.append(x[['time', 'open', 'high', 'low', 'close']])
        d = pd.concat(frames).drop_duplicates('time', keep='last').set_index('time').sort_index()
        end, start = d.index.max(), d.index.min()
        m15 = bars(d, '15min')
        m15 = m15[m15.index >= end - pd.Timedelta(days=a.m15_days)]
        m5 = bars(d[d.index >= end - pd.Timedelta(days=a.m5_days + 1)], '5min')
        m5 = m5[m5.index >= end - pd.Timedelta(days=a.m5_days)]
        obj = dict(name=name, label=label, group=group, side=side, kind=kind, period=period, source='IBKR 1-minute MIDPOINT (bid/ask midpoint, not trades)', convention='bar-open time (TradingView)',
                   first=str(start), asOf=str(end), m5=pack(m5), m15=pack(m15))
        (OUT / f'leg_{name}.json').write_text(json.dumps(obj, separators=(',', ':')), encoding='utf-8')
        meta.append(dict(name=name, label=label, group=group, side=side, kind=kind, period=period, first=str(start)[:10], asOf=str(end), m5=len(m5), m15=len(m15), stem=rec['stem']))
        print(f'{name}: {group} | {str(start)[:10]} -> {str(end)[:16]} | m5 {len(m5)} m15 {len(m15)} | {(OUT / f"leg_{name}.json").stat().st_size / 1024:.0f} KB')
    (OUT / 'legs_meta.json').write_text(json.dumps(meta, indent=1), encoding='utf-8')
    print(len(meta), 'contracts')
