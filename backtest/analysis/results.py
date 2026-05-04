"""
Trade statistics and summary reporting.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from engine.trade import Trade


def trades_to_df(trades: list[Trade]) -> pd.DataFrame:
    """Convert a list of Trade objects into a flat DataFrame."""
    if not trades:
        return pd.DataFrame()

    rows = []
    for t in trades:
        rows.append({
            'trade_date':           t.trade_date,
            'direction':            t.direction,
            'entry_time':           t.entry_time,
            'exit_time':            t.exit_time,
            'entry_price':          t.entry_price,
            'exit_price':           t.exit_price,
            'stop_price':           t.stop_price,
            'target_price':         t.target_price,
            'exit_reason':          t.exit_reason,
            'range_pips':           t.range_pips,
            'rvol_at_entry':        t.rvol_at_entry,
            'vwap_at_entry':        t.vwap_at_entry,
            'above_vwap':           t.above_vwap,
            'has_confluence':       t.has_confluence,
            'confluence_distance':  t.confluence_distance,
            'pnl_pips':             t.pnl_pips,
            'r_multiple':           t.r_multiple,
            'risk_pips':            t.risk_pips,
            'won':                  t.won,
        })

    df = pd.DataFrame(rows)
    df['year']  = pd.to_datetime(df['trade_date']).dt.year
    df['month'] = pd.to_datetime(df['trade_date']).dt.month
    df['dow']   = pd.to_datetime(df['trade_date']).dt.dayofweek  # 0=Mon
    return df


def print_summary(df: pd.DataFrame, label: str = 'Backtest Results') -> None:
    """Print a full statistics summary to console."""
    if df.empty:
        print('No trades.')
        return

    completed = df[df['exit_reason'].notna()].copy()
    n = len(completed)
    if n == 0:
        print('No completed trades.')
        return

    wins   = completed[completed['won'] == True]
    losses = completed[completed['won'] == False]

    win_rate    = len(wins) / n * 100
    avg_win     = wins['pnl_pips'].mean()   if not wins.empty   else 0
    avg_loss    = losses['pnl_pips'].mean() if not losses.empty else 0
    avg_rr      = completed['r_multiple'].mean()
    total_pips  = completed['pnl_pips'].sum()
    pf          = abs(wins['pnl_pips'].sum() / losses['pnl_pips'].sum()) \
                  if not losses.empty and losses['pnl_pips'].sum() != 0 else float('inf')

    # Equity curve for drawdown and Sharpe
    equity = completed['pnl_pips'].cumsum()
    peak   = equity.cummax()
    dd     = equity - peak
    max_dd = dd.min()

    daily_pnl  = completed.groupby('trade_date')['pnl_pips'].sum()
    sharpe     = (daily_pnl.mean() / daily_pnl.std() * np.sqrt(252)
                  if daily_pnl.std() > 0 else 0)

    # Exit breakdown
    exit_counts = completed['exit_reason'].value_counts()

    print(f'\n{"="*52}')
    print(f'  {label}')
    print(f'{"="*52}')
    print(f'  Period         : {df["trade_date"].min()}  to  {df["trade_date"].max()}')
    print(f'  Trades         : {n}')
    print(f'  Win Rate       : {win_rate:.1f}%  ({len(wins)}W / {len(losses)}L)')
    print(f'  Avg Win        : +{avg_win:.1f} pips')
    print(f'  Avg Loss       : {avg_loss:.1f} pips')
    print(f'  Avg R Multiple : {avg_rr:.2f}R')
    print(f'  Profit Factor  : {pf:.2f}')
    print(f'  Total P&L      : {total_pips:+.1f} pips')
    print(f'  Max Drawdown   : {max_dd:.1f} pips')
    print(f'  Sharpe (daily) : {sharpe:.2f}')
    print(f'\n  Exit breakdown :')
    for reason, count in exit_counts.items():
        print(f'    {reason:<12} {count:>4}  ({count/n*100:.1f}%)')

    print(f'\n  By direction:')
    for direction, grp in completed.groupby('direction'):
        wr = (grp['won'] == True).mean() * 100
        pips = grp['pnl_pips'].sum()
        print(f'    {direction:<6}  {len(grp):>4} trades  WR={wr:.1f}%  P&L={pips:+.1f}p')

    print(f'\n  By day of week:')
    dow_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    for dow_idx, grp in completed.groupby('dow'):
        wr   = (grp['won'] == True).mean() * 100
        pips = grp['pnl_pips'].sum()
        name = dow_names[dow_idx] if dow_idx < 5 else str(dow_idx)
        print(f'    {name}  {len(grp):>4} trades  WR={wr:.1f}%  P&L={pips:+.1f}p')

    print(f'\n  By year:')
    for year, grp in completed.groupby('year'):
        wr   = (grp['won'] == True).mean() * 100
        pips = grp['pnl_pips'].sum()
        print(f'    {year}  {len(grp):>4} trades  WR={wr:.1f}%  P&L={pips:+.1f}p')

    print(f'{"="*52}\n')


def compare_variants(variant_results: dict[str, pd.DataFrame]) -> None:
    """Print a side-by-side comparison of multiple strategy variants."""
    print(f'\n{"="*72}')
    print(f'  Strategy Variant Comparison')
    print(f'{"="*72}')
    print(f'  {"Variant":<28} {"Trades":>6} {"WR%":>6} {"PF":>6} {"P&L p":>8} {"MaxDD":>8} {"Sharpe":>7}')
    print(f'  {"-"*68}')

    for label, df in variant_results.items():
        if df.empty:
            print(f'  {label:<28}  no trades')
            continue
        completed = df[df['exit_reason'].notna()]
        if completed.empty:
            continue
        wins   = completed[completed['won'] == True]
        losses = completed[completed['won'] == False]
        wr     = len(wins) / len(completed) * 100
        pf     = abs(wins['pnl_pips'].sum() / losses['pnl_pips'].sum()) \
                 if not losses.empty and losses['pnl_pips'].sum() != 0 else 999
        pnl    = completed['pnl_pips'].sum()
        equity = completed['pnl_pips'].cumsum()
        maxdd  = (equity - equity.cummax()).min()
        daily  = completed.groupby('trade_date')['pnl_pips'].sum()
        sharpe = daily.mean() / daily.std() * np.sqrt(252) if daily.std() > 0 else 0

        print(f'  {label:<28} {len(completed):>6} {wr:>6.1f} {pf:>6.2f} {pnl:>8.1f} {maxdd:>8.1f} {sharpe:>7.2f}')

    print(f'{"="*72}\n')
