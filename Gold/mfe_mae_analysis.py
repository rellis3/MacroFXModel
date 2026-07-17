"""
Gold Bot — MFE/MAE replay analyser.

Walks the REAL M1 price path between each logged trade's entry and close to
answer two questions the journal alone can't (it only has entry/TP1/close —
three points, not the path):

  1. How far did price actually run in favour before reversing (MFE), and
     against (MAE), relative to the fixed SL distance? This is the honest
     input for re-siting TP1/TP2 — not guessed R-multiples.
  2. Had a chandelier trail (ratchet the stop by a fixed offset off the best
     price seen, activated after +activate_r) been running instead of the
     fixed TP1/TP2, what R would it have captured on the SAME bar path?
     Compared directly against the actual fixed-exit outcome — no re-fit,
     same trades, same fills.

Data sources (read-only, no bot state touched):
  Gold/logs/gold_journal.jsonl, logs/gold_journal.jsonl  — ENTRY_SIGNAL /
    TP1_HIT / TRADE_CLOSED events, joined per zone_id in chronological order.
  VolRangeForecaster/data/m1/gold_m1.parquet             — M1 OHLC, the same
    R2 cache the JS backtests use (js/volBacktestM1Engine.js:loadM1ForPair).

Small-sample caveat: as of this run there are well under the ≥30 OOS trades
CLAUDE.md treats as a floor for any strategy claim. Read the percentiles as a
diagnostic to steer the next design choice, not as a validated edge.
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import pandas as pd

_JOURNALS = ['Gold/logs/gold_journal.jsonl', 'logs/gold_journal.jsonl']
_M1_PATH = 'VolRangeForecaster/data/m1/gold_m1.parquet'


@dataclass
class Trade:
    zone_id: str
    direction: str
    entry_time: datetime
    entry_price: float
    sl: float
    tp1: float
    tp2: float
    close_time: Optional[datetime] = None
    close_price: Optional[float] = None
    close_reason: Optional[str] = None
    tp1_hit_time: Optional[datetime] = None


def _parse_ts(ts: str) -> datetime:
    return datetime.strptime(ts, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)


def load_trades() -> list[Trade]:
    """Join ENTRY_SIGNAL -> TP1_HIT -> TRADE_CLOSED per zone_id, in file order.
    A zone_id could in principle repeat (same shelf, different day) so events
    are consumed in stream order rather than deduped by id alone."""
    trades: list[Trade] = []
    open_by_zone: dict[str, Trade] = {}

    for path in _JOURNALS:
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    ev = json.loads(line)
                except json.JSONDecodeError:
                    continue
                etype = ev.get('type')
                zid = ev.get('zone_id')
                if etype == 'ENTRY_SIGNAL':
                    t = Trade(
                        zone_id=zid, direction=ev['direction'],
                        entry_time=_parse_ts(ev['timestamp']),
                        entry_price=ev['entry_price'],
                        sl=ev['sl'], tp1=ev['tp1'], tp2=ev['tp2'],
                    )
                    open_by_zone[zid] = t
                elif etype == 'TP1_HIT':
                    t = open_by_zone.get(zid)
                    if t and t.tp1_hit_time is None:
                        t.tp1_hit_time = _parse_ts(ev['timestamp'])
                elif etype == 'TRADE_CLOSED':
                    t = open_by_zone.pop(zid, None)
                    if t:
                        t.close_time = _parse_ts(ev['timestamp'])
                        t.close_price = ev['price']
                        t.close_reason = ev['reason']
                        trades.append(t)
    return sorted(trades, key=lambda t: t.entry_time)


def load_m1() -> pd.DataFrame:
    """Tolerant of both parquet layouts seen in this cache: the R2 export
    (pandas-indexed 'datetime') and the direct OANDA fetch ('time' column,
    default RangeIndex) — scripts/fetch_m1_oanda.py vs scripts/r2_download.py."""
    df = pd.read_parquet(_M1_PATH)
    ts_col = 'datetime' if 'datetime' in df.columns else ('time' if 'time' in df.columns else None)
    if ts_col:
        df[ts_col] = pd.to_datetime(df[ts_col], utc=True)
        df = df.set_index(ts_col)
    elif df.index.name in ('datetime', 'time'):
        df.index = pd.to_datetime(df.index, utc=True)
    else:
        raise ValueError(f'no timestamp column/index found; columns={list(df.columns)}, index={df.index.name}')
    if df.index.tz is None:
        df.index = df.index.tz_localize('UTC')
    return df[['open', 'high', 'low', 'close']].sort_index()


@dataclass
class Excursion:
    mfe: float = 0.0   # price units, favourable
    mae: float = 0.0   # price units, adverse (positive number)
    mfe_after_close: float = 0.0   # how much further price ran past the ACTUAL close, same direction


def walk_excursion(bars: pd.DataFrame, trade: Trade, end_time: datetime,
                   extend_hours: float = 6.0) -> Optional[Excursion]:
    sign = 1.0 if trade.direction == 'LONG' else -1.0
    window = bars.loc[trade.entry_time:end_time]
    if window.empty:
        return None

    if sign > 0:
        mfe = float((window['high'] - trade.entry_price).max())
        mae = float((trade.entry_price - window['low']).max())
    else:
        mfe = float((trade.entry_price - window['low']).max())
        mae = float((window['high'] - trade.entry_price).max())
    mfe = max(mfe, 0.0)
    mae = max(mae, 0.0)

    # How much further price ran, same direction, in the extend_hours after
    # the ACTUAL close — the "left on the table" number a trail would chase.
    ext_end = end_time + pd.Timedelta(hours=extend_hours)
    ext_window = bars.loc[end_time:ext_end]
    mfe_after = 0.0
    if not ext_window.empty and trade.close_price is not None:
        if sign > 0:
            mfe_after = max(float((ext_window['high'] - trade.close_price).max()), 0.0)
        else:
            mfe_after = max(float((trade.close_price - ext_window['low']).max()), 0.0)

    return Excursion(mfe=mfe, mae=mae, mfe_after_close=mfe_after)


def simulate_chandelier(bars: pd.DataFrame, trade: Trade,
                        activate_r: float, trail_r: float,
                        max_hours: float = 24.0) -> float:
    """Replay the SAME bar path with: hard SL unchanged; once price has moved
    >= activate_r in favour, a trailing stop is armed at (best_price -
    sign*trail_r*sl_dist) and ratchets with new favourable extremes; no fixed
    TP. Returns realised R (positive = win). Session/data-gap cutoff at
    max_hours protects against a trade that never gets stopped in the window."""
    sign = 1.0 if trade.direction == 'LONG' else -1.0
    sl_dist = abs(trade.entry_price - trade.sl)
    if sl_dist <= 0:
        return 0.0

    end = trade.entry_time + pd.Timedelta(hours=max_hours)
    window = bars.loc[trade.entry_time:end]
    if window.empty:
        return 0.0

    best = trade.entry_price
    stop = trade.sl
    armed = False

    for _, row in window.iterrows():
        hi, lo = float(row['high']), float(row['low'])
        # Check stop-out first (conservative: adverse touch before favourable this bar)
        if sign > 0:
            if lo <= stop:
                return (stop - trade.entry_price) / sl_dist
            if hi > best:
                best = hi
                run_r = (best - trade.entry_price) / sl_dist
                if not armed and run_r >= activate_r:
                    armed = True
                if armed:
                    stop = max(stop, best - trail_r * sl_dist)
        else:
            if hi >= stop:
                return (trade.entry_price - stop) / sl_dist
            if lo < best:
                best = lo
                run_r = (trade.entry_price - best) / sl_dist
                if not armed and run_r >= activate_r:
                    armed = True
                if armed:
                    stop = min(stop, best + trail_r * sl_dist)

    # Window ended without a stop-out — mark to last close (matches
    # CLAUDE.md's "never assume the intrabar TP was hit" caution in reverse:
    # never assume a favourable close either, just use what's on the tape).
    last_close = float(window['close'].iloc[-1])
    return sign * (last_close - trade.entry_price) / sl_dist


def actual_r(trade: Trade) -> float:
    sl_dist = abs(trade.entry_price - trade.sl)
    if sl_dist <= 0 or trade.close_price is None:
        return 0.0
    sign = 1.0 if trade.direction == 'LONG' else -1.0
    return sign * (trade.close_price - trade.entry_price) / sl_dist


def pct(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    return float(statistics.quantiles(values, n=100, method='inclusive')[int(p) - 1]) \
        if len(values) >= 2 else values[0]


def main():
    ap = argparse.ArgumentParser(description='Gold bot MFE/MAE + chandelier replay')
    ap.add_argument('--activate-r', type=float, default=0.5,
                    help='R-multiple of favourable move before the trail arms (default 0.5)')
    ap.add_argument('--trail-r', type=float, default=0.6,
                    help='Trail distance behind the best price, in R (default 0.6)')
    ap.add_argument('--sweep', action='store_true',
                    help='Try a grid of activate/trail combos instead of just --activate-r/--trail-r')
    args = ap.parse_args()

    trades = load_trades()
    if not trades:
        print('No trades found in journals.')
        return
    print(f'Loaded {len(trades)} closed trades from journal '
          f'({trades[0].entry_time.date()} -> {trades[-1].entry_time.date()})')

    bars = load_m1()
    print(f'M1 parquet: {len(bars):,} rows, {bars.index.min()} -> {bars.index.max()}')

    rows = []
    skipped_no_data = 0
    for t in trades:
        exc = walk_excursion(bars, t, t.close_time)
        if exc is None:
            skipped_no_data += 1
            continue
        sl_dist = abs(t.entry_price - t.sl)
        chand_r = simulate_chandelier(bars, t, args.activate_r, args.trail_r)
        rows.append({
            'entry_time': t.entry_time, 'dir': t.direction, 'reason': t.close_reason,
            'sl_pips': round(sl_dist, 1),
            'mfe_r': round(exc.mfe / sl_dist, 2) if sl_dist else 0.0,
            'mae_r': round(exc.mae / sl_dist, 2) if sl_dist else 0.0,
            'actual_r': round(actual_r(t), 2),
            'chandelier_r': round(chand_r, 2),
            'mfe_after_close_pips': round(exc.mfe_after_close, 1),
        })

    if skipped_no_data:
        print(f'  ({skipped_no_data} trades skipped — outside M1 parquet coverage)')

    if not rows:
        print('No trades had M1 coverage — nothing to analyse.')
        return

    df = pd.DataFrame(rows)
    print('\n' + '=' * 100)
    print(f'{"TIME":<20}{"DIR":<6}{"REASON":<10}{"SL(p)":>7}{"MFE(R)":>8}{"MAE(R)":>8}'
          f'{"ACTUAL(R)":>11}{"CHAND(R)":>10}{"POST-CLOSE(p)":>15}')
    print('-' * 100)
    for r in rows:
        print(f'{str(r["entry_time"])[:16]:<20}{r["dir"]:<6}{r["reason"]:<10}'
              f'{r["sl_pips"]:>7.1f}{r["mfe_r"]:>8.2f}{r["mae_r"]:>8.2f}'
              f'{r["actual_r"]:>11.2f}{r["chandelier_r"]:>10.2f}{r["mfe_after_close_pips"]:>15.1f}')
    print('=' * 100)

    mfe_vals = df['mfe_r'].tolist()
    mae_vals = df['mae_r'].tolist()
    print(f'\nn={len(df)}  '
          f'(CLAUDE.md floor for any strategy claim is >=30 OOS trades — treat this as a steer, not proof)\n')
    print('MFE (R-multiple of SL distance) percentiles:')
    for p in (10, 25, 50, 75, 90):
        print(f'  p{p:<3} = {pct(mfe_vals, p):.2f}R')
    print('\nMAE (R-multiple of SL distance) percentiles:')
    for p in (10, 25, 50, 75, 90):
        print(f'  p{p:<3} = {pct(mae_vals, p):.2f}R')

    print(f'\nActual fixed TP1/TP2 exits: total R = {df["actual_r"].sum():+.2f}  '
          f'avg = {df["actual_r"].mean():+.2f}R')

    if args.sweep:
        print('\nChandelier parameter sweep (same 29 trades, same bar path — no re-fit):')
        print(f'  {"activate_r":>10}{"trail_r":>10}{"total_R":>10}{"avg_R":>8}{"wins":>7}')
        for act, trail in [(0.3, 0.6), (0.5, 0.6), (0.3, 0.9), (0.5, 1.1),
                          (0.8, 0.8), (0.5, 1.5), (1.0, 1.0)]:
            rs = [simulate_chandelier(bars, t, act, trail) for t in trades]
            print(f'  {act:>10.1f}{trail:>10.1f}{sum(rs):>10.2f}{sum(rs)/len(rs):>8.2f}'
                  f'{sum(1 for r in rs if r > 0):>4}/{len(rs)}')
    else:
        print(f'Chandelier (activate={args.activate_r}R, trail={args.trail_r}R): '
              f'total R = {df["chandelier_r"].sum():+.2f}  avg = {df["chandelier_r"].mean():+.2f}R')

    wins_left_on_table = df[(df['actual_r'] > 0) & (df['mfe_after_close_pips'] > 0)]
    if len(wins_left_on_table):
        print(f'\nOf {len(df[df["actual_r"] > 0])} winning trades, '
              f'{len(wins_left_on_table)} kept running >0 pips further in the same '
              f'direction in the {6}h after the actual close '
              f'(median {wins_left_on_table["mfe_after_close_pips"].median():.1f}p, '
              f'max {wins_left_on_table["mfe_after_close_pips"].max():.1f}p) — '
              f'this is the give-back a fixed TP2 accepts on trend days.')


if __name__ == '__main__':
    main()
