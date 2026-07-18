"""
Fixed SL/TP distribution mapper — per asset, per time window.

This is deliberately signal-agnostic: it does NOT use any bot's zones/entries.
It samples entries mechanically (every H4 bar, both LONG and SHORT) across the
asset's own M1 history and asks a single question for a grid of fixed
(SL pips, TP as an R-multiple of SL) combos: which barrier gets touched first,
using the REAL M1 path (not a same-bar-fill assumption)? The goal is the raw
distribution of outcomes BEFORE conditioning on any entry logic — a baseline
to compare a bot's own signal-conditioned trades against, and to see how the
distribution itself drifts as the asset's price/vol regime moves (this is
exactly what caught Gold's stale 40-pip SL cap: pip-fixed thresholds go stale
as price moves, ATR/R-relative ones travel with it).

Usage:
  python VolRangeForecaster/sltp_distribution.py                     # gold, 6-month windows
  python VolRangeForecaster/sltp_distribution.py --asset eurusd --window 1y
  python VolRangeForecaster/sltp_distribution.py --sl-grid 20,40,60,80,100,150 --tp-r-grid 1,1.5,2,3
  python VolRangeForecaster/sltp_distribution.py --csv-out VolRangeForecaster/data/sltp_gold.csv

Data: VolRangeForecaster/data/m1/<asset>_m1.parquet (scripts/r2_download.py /
scripts/fetch_m1_oanda.py populate this cache — same R2 store the JS backtests
use). Pip size comes from pylego.instruments.pip_size — never re-inline a pip
table (a wrong pip is a 10x PnL bug, per CLAUDE.md).
"""
from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from pylego.instruments import pip_size, asset_class, instrument_keys  # noqa: E402
from pylego.barrier_race import Entry, race_grid  # noqa: E402

_M1_DIR = os.path.join(os.path.dirname(__file__), 'data', 'm1')

# Multiples of an asset's own trailing median daily range used to build a
# self-scaled default SL grid (see default_sl_grid). Kept out of the CLI
# default so an explicit --sl-grid still means "this many pips for every
# asset", matching the original single-asset behaviour.
_GRID_MULTIPLES = [0.15, 0.25, 0.4, 0.6, 0.85, 1.2, 1.6]


def resolve_available_assets() -> list[str]:
    """Canonical registry keys that have a cached M1 parquet in this dir."""
    return [k for k in instrument_keys()
            if os.path.exists(os.path.join(_M1_DIR, f'{k}_m1.parquet'))]


def default_sl_grid(bars: pd.DataFrame, pip: float) -> list[float]:
    """Self-scaled SL grid: multiples of the asset's own trailing median daily
    range, in pip units, computed ONCE from the full loaded history so the
    same absolute grid is used for every window. A grid that re-scaled itself
    per window would confound the very drift-over-time this tool exists to
    reveal (a fixed pip grid across 29 instruments of wildly different price
    scale would otherwise be meaningless for anything but gold)."""
    daily_high = bars['high'].resample('1D').max()
    daily_low = bars['low'].resample('1D').min()
    median_range_pips = float((daily_high - daily_low).dropna().median() / pip)
    grid = sorted({round(median_range_pips * m, 1) for m in _GRID_MULTIPLES})
    return [g for g in grid if g > 0]


def load_m1(asset: str) -> pd.DataFrame:
    """Tolerant of both parquet layouts seen in this cache: the R2 export
    (pandas-indexed 'datetime') and the direct OANDA fetch ('time' column,
    default RangeIndex)."""
    path = os.path.join(_M1_DIR, f'{asset}_m1.parquet')
    if not os.path.exists(path):
        raise FileNotFoundError(
            f'{path} not found - run scripts/r2_download.py {asset} or '
            f'scripts/fetch_m1_oanda.py {asset} first')
    df = pd.read_parquet(path)
    ts_col = 'datetime' if 'datetime' in df.columns else ('time' if 'time' in df.columns else None)
    if ts_col:
        df[ts_col] = pd.to_datetime(df[ts_col], utc=True)
        df = df.set_index(ts_col)
    elif df.index.name in ('datetime', 'time'):
        df.index = pd.to_datetime(df.index, utc=True)
    else:
        raise ValueError(f'no timestamp column/index found; columns={list(df.columns)}')
    if df.index.tz is None:
        df.index = df.index.tz_localize('UTC')
    return df[['open', 'high', 'low', 'close']].sort_index()


@dataclass
class GridResult:
    window_start: str
    window_end: str
    sl_pips: float
    tp_r: float
    n: int
    win_rate: float
    sl_rate: float
    timeout_rate: float
    avg_r: float
    expectancy_pips: float


def make_windows(index: pd.DatetimeIndex, freq: str) -> list[tuple[pd.Timestamp, pd.Timestamp]]:
    start, end = index.min(), index.max()
    step = pd.DateOffset(months=6) if freq == '6m' else pd.DateOffset(years=1)
    windows = []
    cur = start
    while cur < end:
        nxt = cur + step
        windows.append((cur, min(nxt, end)))
        cur = nxt
    return windows


def run_window(bars: pd.DataFrame, w_start: pd.Timestamp, w_end: pd.Timestamp,
               sl_grid: list[float], tp_r_grid: list[float],
               entry_freq: str, max_hours: float, pip: float = 1.0) -> list[GridResult]:
    window = bars.loc[w_start:w_end]
    if window.empty:
        return []

    entry_times = window.resample(entry_freq).first().dropna().index
    idx = bars.index
    entries: list[Entry] = []
    for t in entry_times:
        pos = idx.searchsorted(t)
        if pos >= len(idx):
            continue
        entries.append(Entry(idx=pos, direction=1))
        entries.append(Entry(idx=pos, direction=-1))
    if not entries:
        return []

    max_bars_ahead = int(max_hours * 60)   # M1 bars
    sl_grid_price = [s * pip for s in sl_grid]
    price_to_pip = dict(zip(sl_grid_price, sl_grid))   # exact float roundtrip, no re-derivation

    barrier_results = race_grid(bars, entries, sl_grid_price, tp_r_grid, max_bars_ahead)

    results: list[GridResult] = []
    for r in barrier_results:
        sl_pips = price_to_pip[r.sl]
        results.append(GridResult(
            window_start=str(w_start.date()), window_end=str(w_end.date()),
            sl_pips=sl_pips, tp_r=r.tp_r, n=r.n,
            win_rate=round(r.win_rate, 3), sl_rate=round(r.sl_rate, 3),
            timeout_rate=round(r.timeout_rate, 3),
            avg_r=round(r.avg_r, 3), expectancy_pips=round(r.avg_r * sl_pips, 2),
        ))
    return results


def process_asset(asset: str, sl_grid_arg: str | None, tp_r_grid_arg: str,
                   window: str, entry_freq: str, max_hours: float) -> list[dict]:
    bars = load_m1(asset)
    pip = pip_size(asset)
    ac = asset_class(asset)

    if sl_grid_arg:
        sl_grid = [float(x) for x in sl_grid_arg.split(',')]
        grid_note = 'explicit'
    else:
        sl_grid = default_sl_grid(bars, pip)
        grid_note = 'auto: x[.15,.25,.4,.6,.85,1.2,1.6] of median daily range'
    tp_r_grid = [float(x) for x in tp_r_grid_arg.split(',')]

    print(f'\n=== {asset} ({ac}, pip={pip}) ===')
    print(f'{len(bars):,} bars, {bars.index.min()} -> {bars.index.max()}')
    print(f'SL grid [{grid_note}]: {sl_grid}  x  TP in {[f"{r}R" for r in tp_r_grid]}')

    windows = make_windows(bars.index, window)
    rows: list[dict] = []
    for w_start, w_end in windows:
        wr = run_window(bars, w_start, w_end, sl_grid, tp_r_grid, entry_freq, max_hours, pip=pip)
        for r in wr:
            d = r.__dict__.copy()
            d['asset'] = asset
            d['asset_class'] = ac
            rows.append(d)
        if wr:
            best = max(wr, key=lambda r: r.avg_r)
            worst = min(wr, key=lambda r: r.avg_r)
            print(f'  {str(w_start.date())} -> {str(w_end.date())}  (n~{wr[0].n}/combo)  '
                  f'best: SL={best.sl_pips:>7.1f} TP={best.tp_r:>4.1f}R avg={best.avg_r:+.3f}R  |  '
                  f'worst: SL={worst.sl_pips:>7.1f} TP={worst.tp_r:>4.1f}R avg={worst.avg_r:+.3f}R')
    return rows


def main():
    ap = argparse.ArgumentParser(description='Fixed SL/TP distribution mapper (signal-agnostic)')
    ap.add_argument('--asset', default='gold',
                    help="Instrument key, comma-separated list, or 'all' for every asset with a "
                         "cached M1 parquet in VolRangeForecaster/data/m1/")
    ap.add_argument('--sl-grid', default=None,
                    help='Comma-separated SL distances in pips, applied literally to every asset. '
                         'Omit to auto-scale per asset from its own trailing median daily range '
                         '(recommended for --asset all, since a fixed pip grid is meaningless '
                         'across instruments of very different price scale).')
    ap.add_argument('--tp-r-grid', default='1,1.5,2,3,4',
                    help='Comma-separated TP targets as R-multiples of SL')
    ap.add_argument('--window', choices=['6m', '1y'], default='6m')
    ap.add_argument('--entry-freq', default='4h', help='Entry sampling cadence (pandas offset alias)')
    ap.add_argument('--max-hours', type=float, default=120.0,
                    help='Time-barrier cutoff if neither SL nor TP is touched (default 120h = 5 days)')
    ap.add_argument('--csv-out', default=None)
    args = ap.parse_args()

    if args.asset == 'all':
        assets = resolve_available_assets()
    else:
        assets = [a.strip() for a in args.asset.split(',') if a.strip()]
    print(f'Assets ({len(assets)}): {assets}')

    all_rows: list[dict] = []
    for asset in assets:
        try:
            all_rows.extend(process_asset(asset, args.sl_grid, args.tp_r_grid,
                                           args.window, args.entry_freq, args.max_hours))
        except FileNotFoundError as e:
            print(f'\n=== {asset}: skipped ({e}) ===')

    if not all_rows:
        print('No results - check data coverage / grid.')
        return

    df = pd.DataFrame(all_rows)
    if args.csv_out:
        df.to_csv(args.csv_out, index=False)
        print(f'\nFull grid ({len(df)} rows, {df["asset"].nunique()} asset(s)) written -> {args.csv_out}')

    print(f'\nCLAUDE.md floor for any strategy claim is >=30 OOS trades; this is a raw '
          f'price-action characterization, not a strategy backtest (no costs, no bot signal, '
          f'mechanical {args.entry_freq} entries).')


if __name__ == '__main__':
    main()
