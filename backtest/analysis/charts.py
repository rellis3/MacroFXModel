"""
Visualisation — equity curve, monthly heatmap, entry analysis.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors


def plot_equity_curve(df: pd.DataFrame, title: str = 'Equity Curve') -> None:
    completed = df[df['exit_reason'].notna()].copy()
    if completed.empty:
        print('No completed trades to plot.')
        return

    completed = completed.sort_values('entry_time')
    equity    = completed['pnl_pips'].cumsum()
    peak      = equity.cummax()
    drawdown  = equity - peak

    fig, axes = plt.subplots(2, 1, figsize=(14, 8), gridspec_kw={'height_ratios': [3, 1]})
    fig.suptitle(title, fontsize=14, fontweight='bold')

    # Equity
    ax1 = axes[0]
    ax1.plot(equity.values, color='steelblue', linewidth=1.5, label='Cumulative P&L (pips)')
    ax1.fill_between(range(len(equity)), equity.values, 0,
                     where=equity.values >= 0, alpha=0.15, color='green')
    ax1.fill_between(range(len(equity)), equity.values, 0,
                     where=equity.values < 0,  alpha=0.15, color='red')
    ax1.axhline(0, color='grey', linewidth=0.8, linestyle='--')
    ax1.set_ylabel('Pips')
    ax1.legend(loc='upper left')
    ax1.grid(True, alpha=0.3)

    # Drawdown
    ax2 = axes[1]
    ax2.fill_between(range(len(drawdown)), drawdown.values, 0,
                     color='red', alpha=0.5, label='Drawdown')
    ax2.set_ylabel('Drawdown (pips)')
    ax2.set_xlabel('Trade #')
    ax2.legend(loc='lower left')
    ax2.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.show()


def plot_monthly_heatmap(df: pd.DataFrame, title: str = 'Monthly P&L (pips)') -> None:
    completed = df[df['exit_reason'].notna()].copy()
    if completed.empty:
        return

    completed['year']  = pd.to_datetime(completed['trade_date']).dt.year
    completed['month'] = pd.to_datetime(completed['trade_date']).dt.month

    pivot = completed.groupby(['year', 'month'])['pnl_pips'].sum().unstack(fill_value=0)

    fig, ax = plt.subplots(figsize=(14, max(4, len(pivot) * 0.8)))
    vmax = max(abs(pivot.values.max()), abs(pivot.values.min()), 1)
    cmap = mcolors.LinearSegmentedColormap.from_list('rg', ['#c0392b', 'white', '#27ae60'])

    im = ax.imshow(pivot.values, aspect='auto', cmap=cmap, vmin=-vmax, vmax=vmax)
    plt.colorbar(im, ax=ax, label='Pips')

    month_labels = ['Jan','Feb','Mar','Apr','May','Jun',
                    'Jul','Aug','Sep','Oct','Nov','Dec']
    ax.set_xticks(range(len(pivot.columns)))
    ax.set_xticklabels([month_labels[m-1] for m in pivot.columns])
    ax.set_yticks(range(len(pivot.index)))
    ax.set_yticklabels(pivot.index)

    for i in range(len(pivot.index)):
        for j in range(len(pivot.columns)):
            val = pivot.values[i, j]
            ax.text(j, i, f'{val:+.0f}', ha='center', va='center',
                    fontsize=8, color='black')

    ax.set_title(title, fontsize=13, fontweight='bold')
    ax.set_xlabel('Month')
    ax.set_ylabel('Year')
    plt.tight_layout()
    plt.show()


def plot_entry_analysis(df: pd.DataFrame) -> None:
    completed = df[df['exit_reason'].notna()].copy()
    if completed.empty:
        return

    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle('Entry Quality Analysis', fontsize=13, fontweight='bold')

    # ── RVOL distribution: wins vs losses ────────────────────────────────────
    ax = axes[0, 0]
    wins   = completed[completed['won'] == True]['rvol_at_entry'].dropna()
    losses = completed[completed['won'] == False]['rvol_at_entry'].dropna()
    bins   = np.linspace(0, min(5, max(completed['rvol_at_entry'].max(), 5)), 30)
    ax.hist(wins,   bins=bins, alpha=0.6, color='green', label=f'Win  (n={len(wins)})')
    ax.hist(losses, bins=bins, alpha=0.6, color='red',   label=f'Loss (n={len(losses)})')
    ax.set_title('RVOL at Entry: Wins vs Losses')
    ax.set_xlabel('RVOL')
    ax.set_ylabel('Count')
    ax.legend()
    ax.grid(True, alpha=0.3)

    # ── Win rate by RVOL bucket ───────────────────────────────────────────────
    ax = axes[0, 1]
    completed['rvol_bucket'] = pd.cut(completed['rvol_at_entry'],
                                       bins=[0, 1.0, 1.5, 2.0, 3.0, 10.0],
                                       labels=['<1.0', '1.0-1.5', '1.5-2.0', '2.0-3.0', '>3.0'])
    wr_by_rvol = (completed.groupby('rvol_bucket', observed=True)['won']
                            .agg(['mean', 'count'])
                            .rename(columns={'mean': 'win_rate', 'count': 'n'}))
    colors = ['red' if wr < 0.5 else 'green' for wr in wr_by_rvol['win_rate']]
    bars = ax.bar(wr_by_rvol.index, wr_by_rvol['win_rate'] * 100, color=colors, alpha=0.7)
    ax.axhline(50, color='black', linestyle='--', linewidth=0.8)
    ax.set_title('Win Rate by RVOL Bucket')
    ax.set_xlabel('RVOL')
    ax.set_ylabel('Win Rate %')
    for bar, (_, row) in zip(bars, wr_by_rvol.iterrows()):
        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1,
                f'n={int(row["n"])}', ha='center', va='bottom', fontsize=8)
    ax.grid(True, alpha=0.3)

    # ── P&L by Asia range size ────────────────────────────────────────────────
    ax = axes[1, 0]
    completed['range_bucket'] = pd.cut(completed['range_pips'],
                                        bins=[0, 10, 20, 30, 40, 100],
                                        labels=['<10p', '10-20p', '20-30p', '30-40p', '>40p'])
    pnl_by_range = (completed.groupby('range_bucket', observed=True)['pnl_pips']
                              .agg(['mean', 'sum', 'count'])
                              .rename(columns={'mean': 'avg_pnl', 'sum': 'total_pnl', 'count': 'n'}))
    bar_colors = ['green' if v >= 0 else 'red' for v in pnl_by_range['avg_pnl']]
    ax.bar(pnl_by_range.index, pnl_by_range['avg_pnl'], color=bar_colors, alpha=0.7)
    ax.axhline(0, color='black', linewidth=0.8)
    ax.set_title('Avg P&L by Asia Range Size')
    ax.set_xlabel('Range Size (pips)')
    ax.set_ylabel('Avg P&L (pips)')
    ax.grid(True, alpha=0.3)

    # ── VWAP alignment ────────────────────────────────────────────────────────
    ax = axes[1, 1]
    vwap_stats = completed.groupby('above_vwap')['won'].agg(['mean', 'count'])
    labels = ['Below VWAP', 'Above VWAP']
    wr_vals = vwap_stats['mean'].values * 100
    counts  = vwap_stats['count'].values
    bar_colors = ['red' if wr < 50 else 'green' for wr in wr_vals]
    bars = ax.bar(labels, wr_vals, color=bar_colors, alpha=0.7)
    ax.axhline(50, color='black', linestyle='--', linewidth=0.8)
    ax.set_title('Win Rate: Above vs Below London VWAP')
    ax.set_ylabel('Win Rate %')
    ax.set_ylim(0, 100)
    for bar, count in zip(bars, counts):
        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1,
                f'n={count}', ha='center', va='bottom', fontsize=9)
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.show()
