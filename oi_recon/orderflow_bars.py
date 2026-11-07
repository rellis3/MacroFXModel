#!/usr/bin/env python3
"""
1-minute order-flow bars from the raw Databento trades (oi_recon/databento_orderflow_pull.py), written 2026-11-06.

  raw  <ORDERFLOW_DIR>/raw/GLBX/trades/<root>/<YYYY-MM-DD>.dbn.zst   (one UTC day, never edited)
  bars <ORDERFLOW_DIR>/bars_1m/<root>/<YYYY>.parquet                (R2: orderflow/bars_1m/<root>/<YYYY>.parquet)
  ORDERFLOW_DIR defaults to %LOCALAPPDATA%/MacroFXModel/orderflow (outside OneDrive and the repo).

Columns (one row per UTC minute that has at least one trade; ts_utc is the START of the minute, tz-aware UTC):
  ts_utc, root, instrument_id, open, high, low, close, volume, buy_vol, sell_vol, delta, cum_delta_session, n_trades,
  and the BOOK columns, left EMPTY (NaN) until an mbp-1 / mbp-10 history is pulled:
  spread_mean, ofi, bid_sz1, ask_sz1, imb1, bid_depth10, ask_depth10, imb10, book_slope_bid, book_slope_ask

Definitions, fixed here so nothing downstream guesses:
  buy_vol   contracts traded with side 'B' (buyer was the aggressor);  sell_vol  side 'A' (seller was the aggressor).
            side 'N' (no aggressor reported) is in `volume` and `n_trades` but in neither buy_vol nor sell_vol; the share is printed.
            The side convention is CHECKED against the quote in the pilot (PILOT_REPORT.md: 'B' prints at the ask, 'A' at the bid).
  delta     buy_vol - sell_vol.
  cum_delta_session   running sum of delta that RESETS at the CME session open, 17:00 America/Chicago (DST-aware), so a session
            runs 17:00 CT the day before to 16:00 CT; the Sunday-evening open belongs to Monday's session.
  instrument_id       of the LAST trade in the minute. The series is the continuous front month BY VOLUME (<root>.v.0): the contract
            changes at a roll and prices are NOT back-adjusted, so a roll shows as a step in OHLC and the cumulative delta is not reset there.

    python orderflow_bars.py --root 6E                    # every year that has raw trade days
    python orderflow_bars.py --root 6E --year 2026
    python orderflow_bars.py --root 6E --year 2026 --check   # also reconcile bar volume against the raw trade sizes
"""
import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import os
BASE = Path(os.environ.get('ORDERFLOW_DIR') or (Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'MacroFXModel' / 'orderflow'))   # same place as databento_orderflow_pull.py
RAW = BASE / 'raw' / 'GLBX' / 'trades'
OUT = BASE / 'bars_1m'
BUY, SELL = 'B', 'A'
SESSION_TZ, SESSION_OPEN_HOUR = 'America/Chicago', 17
BOOK_COLS = ['spread_mean', 'ofi', 'bid_sz1', 'ask_sz1', 'imb1', 'bid_depth10', 'ask_depth10', 'imb10', 'book_slope_bid', 'book_slope_ask']
COLS = ['ts_utc', 'root', 'instrument_id', 'open', 'high', 'low', 'close', 'volume', 'buy_vol', 'sell_vol', 'delta', 'cum_delta_session',
        'n_trades'] + BOOK_COLS


def read_trades(path):
    import databento as db
    t = db.DBNStore.from_file(str(path)).to_df(pretty_ts=True, price_type='float', map_symbols=False)
    if 'ts_event' not in t.columns:
        t = t.reset_index()
    return t[['ts_event', 'instrument_id', 'price', 'size', 'side']]


def day_bars(root, path):
    t = read_trades(path)
    if t.empty:
        return None
    t = t.sort_values('ts_event', kind='stable')                         # file order is already time order; stable keeps ties in arrival order
    t['m'] = t['ts_event'].dt.floor('min')
    sz = t['size'].astype('int64')
    t['buy'] = np.where(t['side'] == BUY, sz, 0)
    t['sell'] = np.where(t['side'] == SELL, sz, 0)
    g = t.groupby('m', sort=True)
    b = pd.DataFrame({
        'instrument_id': g['instrument_id'].last(), 'open': g['price'].first(), 'high': g['price'].max(), 'low': g['price'].min(),
        'close': g['price'].last(), 'volume': g['size'].sum().astype('int64'), 'buy_vol': g['buy'].sum(), 'sell_vol': g['sell'].sum(),
        'n_trades': g.size(),
    })
    b['n_none_vol'] = b['volume'] - b['buy_vol'] - b['sell_vol']
    b.index.name = 'ts_utc'
    return b.reset_index()


def build(root, year, check=False):
    files = sorted(p for p in (RAW / root).glob('*.dbn.zst'))
    # the year plus the two UTC days before it, so a session that opens in the previous year carries its cumulative delta across the boundary
    want = [p for p in files if year - 1 <= int(p.name[:4]) <= year]
    if not want:
        return None
    first = next((i for i, p in enumerate(want) if int(p.name[:4]) == year), None)
    if first is None:
        return None
    want = want[max(0, first - 2):] if want[0].name[:4] != str(year) else want
    parts, raw_size = [], 0
    for p in want:
        b = day_bars(root, p)
        if b is None:
            continue
        parts.append(b)
        if check:
            raw_size += int(read_trades(p)['size'].sum())
    if not parts:
        return None
    df = pd.concat(parts, ignore_index=True).drop_duplicates('ts_utc', keep='last').sort_values('ts_utc', ignore_index=True)
    local = df['ts_utc'].dt.tz_convert(SESSION_TZ)
    df['_session'] = (local + pd.Timedelta(hours=24 - SESSION_OPEN_HOUR)).dt.normalize().dt.tz_localize(None)
    df['delta'] = df['buy_vol'] - df['sell_vol']
    df['cum_delta_session'] = df.groupby('_session')['delta'].cumsum()
    df['root'] = root
    for c in BOOK_COLS:
        df[c] = np.nan
    n_none = int(df['n_none_vol'].sum())
    df = df[df['ts_utc'].dt.year == year]
    out = df[COLS].reset_index(drop=True)
    if check:
        same = int(out['volume'].sum()) == raw_size or abs(int(out['volume'].sum()) - raw_size) <= int(raw_size * 1e-9)
        print(f'  reconcile {root} {year}: bar volume {int(out["volume"].sum()):,} vs raw trade size (incl. the 2 lead-in days) {raw_size:,}'
              f' -> {"match (lead-in days differ by design)" if same else "see note: lead-in days are outside the year"}', flush=True)
    print(f'  {root} {year}: {len(out):,} bars, {out["ts_utc"].min()} .. {out["ts_utc"].max()}, volume {int(out["volume"].sum()):,}, '
          f'delta sum {int(out["delta"].sum()):,}, side-N volume share {n_none / max(1, int(df["volume"].sum())):.2%}', flush=True)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True, choices=['6E', '6J'])
    ap.add_argument('--year', type=int, default=None)
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    years = [a.year] if a.year else sorted({int(p.name[:4]) for p in (RAW / a.root).glob('*.dbn.zst')})
    (OUT / a.root).mkdir(parents=True, exist_ok=True)
    for y in years:
        df = build(a.root, y, a.check)
        if df is None:
            print(f'  {a.root} {y}: no raw trade days'); continue
        df.to_parquet(OUT / a.root / f'{y}.parquet', index=False)
    print('done')


if __name__ == '__main__':
    main()
