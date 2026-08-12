#!/usr/bin/env python3
"""
ContinuationBot backtest — buy the pullback that resumes the HTF trend, hold
it with a trailing exit, across every FX pair (+gold) this repo has M1 data
for, plus the index/futures universe (NQ, US30, SPX500, DAX, FTSE, Russell
2000) portfolioBacktest/ already trades — widening past FX matters because
FX pairs are heavily cross-correlated (USD/EUR/GBP touch most of them), so
"26 pairs" is really only a handful of independent bets. Indices give
genuinely uncorrelated exposure the same pullback logic can be tested on.

Pipeline per instrument:
  1. Load cached M1 parquet. FX + gold come from
     VolRangeForecaster/data/m1/{pair}_m1.parquet (the same R2 cache the JS
     backtests and Gold/mfe_mae_analysis.py use). Indices are downloaded
     on demand via portfolioBacktest.portfolio_backtest.load_pair_m1 — reusing
     that module's R2 client/cache instead of re-embedding credentials here.
  2. Resample to Daily / H4 / H1.
  3. modules.pullback_engine.htf_bias_series — vectorised port of
     ConfluenceBot's HTF bias rules (Daily EMA trend + H4 structure).
  4. modules.pullback_engine.generate_signals — shallow-retracement pullback
     entries, gated by HTF bias, confirmed by a break of the pullback's own
     local high/low.
  5. pylego.barrier_race.race_trailing — the repo's shared chandelier-trail
     walker (no fixed TP) — one call per signal, using THAT signal's own
     structural stop distance, so trades aren't forced onto a uniform SL.

This is a NEW strategy, not a fitted one — the report below is the first
read on whether it has any edge anywhere, not a validated result. Read the
per-pair table as a screen for where to look closer, the same way
portfolio_backtest.py's --pair-scan and Gold/mfe_mae_analysis.py's caveat
about small-sample results are meant to be read.

Usage:
  python ContinuationBot/backtest.py                       # all 32 instruments (26 FX/gold + 6 indices)
  python ContinuationBot/backtest.py --pairs eurusd gbpusd gold nq us30
  python ContinuationBot/backtest.py --from 2022-01-01 --to 2026-01-01
  python ContinuationBot/backtest.py --sweep                # per-pair trail-param diagnostic
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.join(_HERE, '..')
sys.path.insert(0, _HERE)
sys.path.insert(1, _ROOT)

from modules.pullback_engine import htf_bias_series, generate_signals   # noqa: E402
from pylego.barrier_race import Entry, race_trailing                    # noqa: E402
from pylego.costs import default_spread                                 # noqa: E402

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s',
                     datefmt='%H:%M:%S')
log = logging.getLogger(__name__)

DATA_DIR = Path(_ROOT) / 'VolRangeForecaster' / 'data' / 'm1'

FX_PAIRS = [
    'audcad', 'audchf', 'audjpy', 'audnzd', 'audusd',
    'cadjpy', 'chfjpy',
    'euraud', 'eurcad', 'eurchf', 'eurgbp', 'eurjpy', 'eurnzd', 'eurusd',
    'gbpaud', 'gbpcad', 'gbpchf', 'gbpjpy', 'gbpnzd', 'gbpusd',
    'nzdjpy', 'nzdusd',
    'usdcad', 'usdchf', 'usdjpy',
    'gold',
]

# Indices/futures — same universe portfolioBacktest/ trades, fetched via R2 on
# demand (cached to portfolioBacktest/cache/, not duplicated here). Genuinely
# uncorrelated with the FX block above, unlike another EUR or GBP cross.
INDEX_PAIRS = ['nq', 'us30', 'spx500', 'de30', 'uk100', 'us2000']

ALL_PAIRS = FX_PAIRS + INDEX_PAIRS

_index_loader = None


def _get_index_loader():
    """Lazy import of portfolioBacktest's R2 loader — only paid if an index
    pair is actually requested, and only imported once per run."""
    global _index_loader
    if _index_loader is None:
        pb_dir = os.path.join(_ROOT, 'portfolioBacktest')
        if pb_dir not in sys.path:
            sys.path.insert(0, pb_dir)
        from portfolio_backtest import load_pair_m1   # noqa: E402
        _index_loader = load_pair_m1
    return _index_loader

# Default hold/trail config — NOT per-pair-optimised. Optimising this per
# pair before reporting the headline number would be exactly the overfitting
# trap this repo's other backtests (portfolio_backtest's cointegration
# in-sample/out-of-sample split, levelEngine's OOS-agreement requirement)
# are built to avoid. Use --sweep for the per-pair diagnostic instead.
DEFAULT_ACTIVATE_R = 0.5
DEFAULT_TRAIL_R = 1.0
DEFAULT_MAX_BARS_AHEAD = 2000     # H1 bars (~83 days) of runway per trade

SWEEP_GRID = [(0.3, 0.6), (0.5, 0.8), (0.5, 1.0), (0.5, 1.5), (1.0, 1.5), (1.0, 2.0)]


def load_m1(pair: str) -> pd.DataFrame:
    if pair in INDEX_PAIRS:
        df = _get_index_loader()(pair)   # already tz-aware UTC, OHLC-only, sorted
        if df.index.tz is None:
            df.index = df.index.tz_localize('UTC')
        return df

    path = DATA_DIR / f'{pair}_m1.parquet'
    df = pd.read_parquet(path)
    if df.index.name not in ('datetime', 'time') and 'time' in df.columns:
        df = df.set_index('time')
    if df.index.tz is None:
        df.index = df.index.tz_localize('UTC')
    return df[['open', 'high', 'low', 'close']].sort_index()


def resample(df: pd.DataFrame, rule: str) -> pd.DataFrame:
    return df.resample(rule).agg(
        {'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last'}
    ).dropna()


def run_pair(pair: str, from_ts: pd.Timestamp, to_ts: pd.Timestamp, args) -> dict:
    m1 = load_m1(pair)
    m1 = m1.loc[from_ts:to_ts]
    if len(m1) < 50_000:
        return {'pair': pair, 'error': f'only {len(m1)} M1 bars in range — skipped'}

    d1 = resample(m1, '1D')
    h4 = resample(m1, '4h')
    h1 = resample(m1, '1h')
    if len(d1) < 60 or len(h4) < 60 or len(h1) < 100:
        return {'pair': pair, 'error': 'not enough resampled history — skipped'}

    bias = htf_bias_series(d1, h4)
    signals = generate_signals(
        h1, bias,
        pivot_n=args.pivot_n, min_atr_mult=args.min_atr_mult,
        shallow_lo=args.shallow_lo, shallow_hi=args.shallow_hi,
        min_confidence=args.min_confidence, sl_buffer_atr=args.sl_buffer_atr,
    )
    if not signals:
        return {'pair': pair, 'n_signals': 0, 'trades': [], 'error': None}

    # Round-trip spread cost, in price units — same shared table
    # (pylego.costs.default_spread) the paper bots use for fills, so this
    # backtest isn't flattered by a free-fill assumption. --no-costs zeroes it.
    cost_price = 0.0 if args.no_costs else default_spread(pair)

    trades = []
    for sig in signals:
        sl_dist = abs(sig.entry_price - sig.stop_price)
        if sl_dist <= 0:
            continue
        res = race_trailing(
            h1, [Entry(idx=sig.idx, direction=sig.direction, entry_price=sig.entry_price)],
            initial_sl_grid=[sl_dist],
            activate_r_grid=[args.activate_r],
            trail_r_grid=[args.trail_r],
            max_bars_ahead=args.max_bars_ahead,
            min_bars_ahead=1,
            cost_price=cost_price,
        )
        if not res:
            continue
        r = res[0]
        trades.append({
            'time': h1.index[sig.idx].isoformat(),
            'direction': 'LONG' if sig.direction > 0 else 'SHORT',
            'entry': round(sig.entry_price, 6),
            'stop': round(sig.stop_price, 6),
            'sl_dist': round(sl_dist, 6),
            'bias_confidence': sig.bias_confidence,
            'r': round(r.avg_r, 3),
        })

    if not trades:
        return {'pair': pair, 'n_signals': len(signals), 'trades': [], 'error': None}

    rs = np.array([t['r'] for t in trades])
    wins = rs[rs > 0]
    losses = rs[rs <= 0]
    result = {
        'pair': pair,
        'n_signals': len(signals),
        'n_trades': len(trades),
        'win_rate': float((rs > 0).mean() * 100),
        'total_r': float(rs.sum()),
        'avg_r': float(rs.mean()),
        'median_r': float(np.median(rs)),
        'profit_factor': float(wins.sum() / abs(losses.sum())) if losses.sum() != 0 else (99.0 if wins.sum() > 0 else 0.0),
        'trades': trades,
    }

    if args.sweep:
        sweep_rows = []
        for act, trail in SWEEP_GRID:
            grid_rs = []
            for sig in signals:
                sl_dist = abs(sig.entry_price - sig.stop_price)
                if sl_dist <= 0:
                    continue
                res = race_trailing(
                    h1, [Entry(idx=sig.idx, direction=sig.direction, entry_price=sig.entry_price)],
                    initial_sl_grid=[sl_dist], activate_r_grid=[act], trail_r_grid=[trail],
                    max_bars_ahead=args.max_bars_ahead, min_bars_ahead=1,
                    cost_price=cost_price,
                )
                if res:
                    grid_rs.append(res[0].avg_r)
            if grid_rs:
                arr = np.array(grid_rs)
                sweep_rows.append({'activate_r': act, 'trail_r': trail, 'n': len(arr),
                                   'total_r': float(arr.sum()), 'avg_r': float(arr.mean()),
                                   'win_rate': float((arr > 0).mean() * 100)})
        result['sweep'] = sweep_rows

    return result


def print_report(results: list, args) -> None:
    ok = [r for r in results if not r.get('error') and r.get('n_trades')]
    no_trades = [r for r in results if not r.get('error') and not r.get('n_trades')]
    errored = [r for r in results if r.get('error')]

    print('\n' + '=' * 92)
    print('  CONTINUATION BOT — PULLBACK-IN-TREND BACKTEST')
    print(f'  Config: pivot_n={args.pivot_n} min_atr_mult={args.min_atr_mult} '
          f'shallow=[{args.shallow_lo},{args.shallow_hi}] min_conf={args.min_confidence} '
          f'activate_r={args.activate_r} trail_r={args.trail_r} '
          f"costs={'OFF (gross)' if args.no_costs else 'ON (pylego.costs default spread)'}")
    print('=' * 92)
    hdr = f"  {'Pair':<10}{'Signals':>9}{'Trades':>8}{'WR%':>7}{'PF':>6}{'AvgR':>8}{'MedR':>8}{'TotalR':>9}"
    print(hdr)
    print('  ' + '-' * 88)
    total_r_all = 0.0
    total_trades_all = 0
    for r in sorted(ok, key=lambda x: -x['total_r']):
        pf = '∞' if r['profit_factor'] >= 99 else f"{r['profit_factor']:.2f}"
        print(f"  {r['pair']:<10}{r['n_signals']:>9}{r['n_trades']:>8}{r['win_rate']:>7.1f}"
              f"{pf:>6}{r['avg_r']:>+8.2f}{r['median_r']:>+8.2f}{r['total_r']:>+9.2f}")
        total_r_all += r['total_r']
        total_trades_all += r['n_trades']

    if no_trades:
        print(f"\n  No trades (had signals, none survived): "
              f"{', '.join(r['pair'] for r in no_trades)}")
    if errored:
        for r in errored:
            print(f"  {r['pair']}: {r['error']}")

    print(f"\n  Portfolio (equal-weight, sum of per-trade R across {len(ok)} pairs):")
    print(f"    Total trades : {total_trades_all}")
    print(f"    Total R      : {total_r_all:+.2f}")
    if total_trades_all:
        print(f"    Avg R/trade  : {total_r_all / total_trades_all:+.3f}")
    winners = [r for r in ok if r['total_r'] > 0]
    print(f"    Profitable pairs: {len(winners)}/{len(ok)}")
    n_all_trades = sum(r['n_trades'] for r in ok)
    if n_all_trades < 30:
        print(f"\n  NOTE: {n_all_trades} total trades across the whole universe is well under "
              f"the ~30-trade floor this repo's other analyses (e.g. Gold/mfe_mae_analysis.py) "
              f"treat as a minimum for any strategy claim — read this as a first screen, not "
              f"validated edge. Widen --from/--to or loosen --min-confidence to get more signal "
              f"volume before trusting the numbers.")
    print()

    if args.sweep:
        print('  Per-pair trail-parameter sweep (diagnostic — NOT used for the headline '
              'numbers above, since picking the per-pair best after the fact is overfitting):')
        for r in ok:
            if not r.get('sweep'):
                continue
            print(f"\n  {r['pair']}:")
            print(f"    {'activate_r':>10}{'trail_r':>9}{'n':>5}{'WR%':>7}{'avgR':>8}{'totalR':>9}")
            for s in sorted(r['sweep'], key=lambda x: -x['total_r']):
                print(f"    {s['activate_r']:>10.1f}{s['trail_r']:>9.1f}{s['n']:>5}"
                      f"{s['win_rate']:>7.1f}{s['avg_r']:>+8.2f}{s['total_r']:>+9.2f}")
        print()


def main():
    ap = argparse.ArgumentParser(description='Pullback-in-trend continuation backtest, multi-pair')
    ap.add_argument('--pairs', nargs='+', default=ALL_PAIRS)
    ap.add_argument('--from', dest='from_date', default='2018-01-01')
    ap.add_argument('--to', dest='to_date', default='2026-06-01')
    ap.add_argument('--pivot-n', type=int, default=4)
    ap.add_argument('--min-atr-mult', type=float, default=1.0)
    ap.add_argument('--shallow-lo', type=float, default=0.236)
    ap.add_argument('--shallow-hi', type=float, default=0.5)
    ap.add_argument('--min-confidence', type=float, default=0.5)
    ap.add_argument('--sl-buffer-atr', type=float, default=0.25)
    ap.add_argument('--activate-r', type=float, default=DEFAULT_ACTIVATE_R)
    ap.add_argument('--trail-r', type=float, default=DEFAULT_TRAIL_R)
    ap.add_argument('--max-bars-ahead', type=int, default=DEFAULT_MAX_BARS_AHEAD)
    ap.add_argument('--sweep', action='store_true', help='also run the per-pair trail-param grid (diagnostic)')
    ap.add_argument('--no-costs', action='store_true',
                    help='disable the round-trip spread cost (pylego.costs.default_spread) — gross-of-cost numbers')
    ap.add_argument('--output', default=str(Path(_HERE) / 'results.json'))
    args = ap.parse_args()

    from_ts = pd.Timestamp(args.from_date, tz='UTC')
    to_ts = pd.Timestamp(args.to_date, tz='UTC')

    pairs = [p for p in args.pairs if p in ALL_PAIRS]
    missing = [p for p in args.pairs if p not in ALL_PAIRS]
    if missing:
        log.warning(f'Unknown pairs skipped: {missing}')

    results = []
    t0 = time.perf_counter()
    for i, pair in enumerate(pairs):
        try:
            r = run_pair(pair, from_ts, to_ts, args)
        except Exception as exc:
            log.error(f'{pair}: {exc}', exc_info=True)
            r = {'pair': pair, 'error': str(exc)}
        results.append(r)
        log.info(f'  [{i+1}/{len(pairs)}] {pair}: '
                  f"{r.get('n_trades', 0)} trades" if not r.get('error') else f"{pair}: {r['error']}")
    log.info(f'Done in {time.perf_counter() - t0:.1f}s')

    print_report(results, args)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, 'w') as f:
        json.dump({'params': vars(args), 'results': results}, f, indent=2, default=str)
    log.info(f'Results -> {out}')


if __name__ == '__main__':
    main()
