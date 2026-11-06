"""hedge-residual-system: build the bar files the study reads from the local M1 cache (no outcome is computed here).

Prereg: forge/HEDGE_RESIDUAL_SYSTEM_PREREG.md.

Usage:  python -I scripts/hedge-residual-system/extract.py [M1_DIR]
        (M1_DIR default: VolRangeForecaster/data/m1 of this checkout, then of the main checkout)

Writes data/hedge-residual-system/ (gitignored):
  h1.json     {t: [epoch s of each hour END, UTC], c: {key: [close at the last M1 bar inside that hour, forward-filled]},
               stale: {key: count of hours with no own bar}}
  d1.json     {d: [NY-close session dates], c: {key: [close at the last M1 bar before 17:00 New York]}, n: {key: [bars]}}
  manifest.json  sha256 + rows + first/last time of every source parquet

Hour grid = every UTC hour in which EURUSD or USDJPY has at least one M1 bar. Nothing after 2026-08-21 London is
kept (data-rules lockbox: the cache ends 2026-08-20 23:59 UTC, so nothing is cut in practice; the cut is explicit).
"""
import hashlib, json, sys
from pathlib import Path

import pandas as pd

REPO = Path(__file__).resolve().parents[2]
KEYS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'audjpy', 'cadjpy', 'eurjpy', 'gbpjpy', 'nzdjpy']
LOCKBOX_END_UTC = pd.Timestamp('2026-08-21 23:00:00')   # 00:00 London 2026-08-22 in BST: end of the 2026-08-21 session
OUT = REPO / 'data' / 'hedge-residual-system'


def m1_dir() -> Path:
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    for c in [REPO / 'VolRangeForecaster/data/m1', Path('/home/user/MacroFXModel/VolRangeForecaster/data/m1')]:
        if (c / 'eurusd_m1.parquet').exists():
            return c
    raise SystemExit('no M1 cache found')


def load(d: Path, k: str) -> pd.Series:
    f = d / f'{k}_m1.parquet'
    df = pd.read_parquet(f)
    tcol = 'datetime' if 'datetime' in df.columns else ('time' if 'time' in df.columns else None)
    t = pd.to_datetime(df[tcol] if tcol else df.index, utc=True).tz_convert(None)
    s = pd.Series(df['close'].astype('float64').values, index=t).sort_index()
    s = s[~s.index.duplicated(keep='last')]
    assert s.index.min().year >= 2000, f'{k}: time axis looks wrong ({s.index.min()})'
    return s[s.index < LOCKBOX_END_UTC]


def main() -> None:
    d = m1_dir()
    OUT.mkdir(parents=True, exist_ok=True)
    man, ser = {}, {}
    for k in KEYS:
        f = d / f'{k}_m1.parquet'
        man[k] = {'sha256': hashlib.sha256(f.read_bytes()).hexdigest(), 'file': str(f)}
        s = load(d, k)
        man[k].update(rows=int(len(s)), first=str(s.index.min()), last=str(s.index.max()))
        ser[k] = s
        print(k, len(s), s.index.min(), s.index.max(), flush=True)

    # ── H1: last close inside each UTC hour, stamped at the hour's END ──
    h = {k: s.groupby(s.index.floor('h')).last() for k, s in ser.items()}
    grid = h['eurusd'].index.union(h['usdjpy'].index).sort_values()
    c1, stale = {}, {}
    for k, v in h.items():
        r = v.reindex(grid)
        stale[k] = int(r.isna().sum())
        c1[k] = [round(float(x), 6) if pd.notna(x) else None for x in r.ffill().values]
    t_end = [int((x + pd.Timedelta(hours=1)).timestamp()) for x in grid]
    json.dump({'t': t_end, 'c': c1, 'stale': stale}, open(OUT / 'h1.json', 'w'))

    # ── D1: NY-close sessions (17:00 New York), the live Correlations & hedges panel's clock ──
    c2, n2, days = {}, {}, None
    for k, s in ser.items():
        ny = s.index.tz_localize('UTC').tz_convert('America/New_York')
        key = (ny + pd.Timedelta(hours=7)).date          # bars from 17:00 NY (d-1) to 17:00 NY (d) -> session d
        g = s.groupby(key)
        last, n = g.last(), g.size()
        last.index = pd.to_datetime(last.index); n.index = pd.to_datetime(n.index)
        ok = (n >= 60) & (last.index.weekday < 5)
        c2[k], n2[k] = last[ok], n[ok]
        days = c2[k].index if days is None else days.union(c2[k].index)
    days = days.sort_values()
    out = {'d': [x.strftime('%Y-%m-%d') for x in days],
           'c': {k: [round(float(x), 6) if pd.notna(x) else None for x in v.reindex(days).values] for k, v in c2.items()},
           'n': {k: [int(x) if pd.notna(x) else 0 for x in v.reindex(days).values] for k, v in n2.items()}}
    json.dump(out, open(OUT / 'd1.json', 'w'))
    man['_h1'] = {'hours': len(grid), 'first_end': str(grid[0] + pd.Timedelta(hours=1)), 'last_end': str(grid[-1] + pd.Timedelta(hours=1)), 'stale': stale}
    man['_d1'] = {'days': len(days), 'first': out['d'][0], 'last': out['d'][-1]}
    json.dump(man, open(OUT / 'manifest.json', 'w'), indent=1)
    print(json.dumps({'_h1': man['_h1'], '_d1': man['_d1']}, indent=1))


if __name__ == '__main__':
    main()
