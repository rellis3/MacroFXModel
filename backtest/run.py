"""
Entry point — Asia Range Breakout backtest for EUR/USD.

Runs 8 variants in sequence, each adding one more filter layer, so the
comparison table shows exactly what each filter contributes to edge.

Usage:
    cd backtest
    pip install -r requirements.txt
    python run.py
"""

import sys
import copy
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from config import PAIRS, STRATEGY
from core.loader import load_pair
from core.volume import add_all_volume_indicators
from engine.backtest import BacktestEngine
from analysis.results import trades_to_df, print_summary, compare_variants
from analysis.charts import plot_equity_curve, plot_monthly_heatmap, plot_entry_analysis

PAIR = 'EURUSD'


def build_variants(base: dict) -> list[tuple[str, dict]]:
    """
    8 variants built progressively — each adds one filter to the previous.
    Reading the comparison table left-to-right shows the marginal value of
    each filter in isolation and in combination.
    """
    def v(**overrides):
        cfg = copy.deepcopy(base)
        cfg.update(overrides)
        return cfg

    return [
        # ── Baselines ────────────────────────────────────────────────────────
        ('V1 Raw breakout',
         v(rvol_min=0.0, vwap_filter=False, ema_filter=False,
           use_pivot_confluence=False, confluence_filter=False)),

        ('V2 + RVOL',
         v(vwap_filter=False, ema_filter=False,
           use_pivot_confluence=False, confluence_filter=False)),

        # ── Volume filters ────────────────────────────────────────────────────
        ('V3 + RVOL + VWAP',
         v(ema_filter=False,
           use_pivot_confluence=False, confluence_filter=False)),

        # ── Trend filter ──────────────────────────────────────────────────────
        ('V4 + RVOL + EMA',
         v(vwap_filter=False, ema_filter=True,
           use_pivot_confluence=False, confluence_filter=False)),

        ('V5 + RVOL + VWAP + EMA',
         v(ema_filter=True,
           use_pivot_confluence=False, confluence_filter=False)),

        # ── Confluence filters ────────────────────────────────────────────────
        ('V6 + RVOL + VWAP + Fibs',
         v(ema_filter=False,
           use_pivot_confluence=False, confluence_filter=True)),

        ('V7 + RVOL + VWAP + Pivots',
         v(ema_filter=False,
           use_pivot_confluence=True, confluence_filter=True)),

        # ── Full stack ────────────────────────────────────────────────────────
        ('V8 Full stack',
         v(ema_filter=True,
           use_pivot_confluence=True, confluence_filter=True)),
    ]


def main():
    pair_cfg = PAIRS[PAIR]

    print(f'\n{"="*56}')
    print(f'  Asia Range Breakout — {PAIR}  (8 variants)')
    print(f'{"="*56}')

    # ── Load data (once) ──────────────────────────────────────────────────────
    print('\nLoading OHLCV data...')
    data = load_pair(pair_cfg)

    # ── Volume indicators on 1m bars (computed once, shared by all variants) ──
    print('\nComputing volume indicators...')
    data['m1'] = add_all_volume_indicators(
        data['m1'],
        pip_size=pair_cfg['pip_size'],
        rvol_lookback=STRATEGY['rvol_lookback'],
    )

    # ── Run all variants ──────────────────────────────────────────────────────
    variant_dfs: dict[str, object] = {}
    variants = build_variants(STRATEGY)

    for label, strategy in variants:
        print(f'\n{"─"*56}')
        print(f'  Running: {label}')
        print(f'{"─"*56}')
        engine = BacktestEngine(PAIR, pair_cfg, data, strategy)
        trades = engine.run()
        variant_dfs[label] = trades_to_df(trades)

    # ── Summary table ─────────────────────────────────────────────────────────
    compare_variants(variant_dfs)

    # ── Individual detail for the best-looking variant ────────────────────────
    # Print full summary for V3, V5, V7, V8 (the four meaningful checkpoints)
    for label in ['V3 + RVOL + VWAP', 'V5 + RVOL + VWAP + EMA',
                  'V7 + RVOL + VWAP + Pivots', 'V8 Full stack']:
        if label in variant_dfs:
            print_summary(variant_dfs[label], label=label)

    # ── Charts for the full stack ─────────────────────────────────────────────
    best = variant_dfs.get('V8 Full stack')
    if best is not None and not best.empty:
        print('\nGenerating charts for V8 Full stack...')
        plot_equity_curve(best,    title=f'{PAIR} — V8 Full Stack — Equity Curve')
        plot_monthly_heatmap(best, title=f'{PAIR} — V8 Full Stack — Monthly P&L (pips)')
        plot_entry_analysis(best)

        # Also overlay V1 vs V8 equity curves for a clean before/after view
        v1 = variant_dfs.get('V1 Raw breakout')
        if v1 is not None and not v1.empty:
            _plot_comparison(v1, best)


def _plot_comparison(v1_df, v8_df):
    """Overlay V1 (raw) vs V8 (full stack) equity curves."""
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(14, 6))
    fig.suptitle('EUR/USD — Raw Breakout vs Full Filter Stack', fontsize=13, fontweight='bold')

    for df, label, color in [
        (v1_df, 'V1 Raw breakout', '#e74c3c'),
        (v8_df, 'V8 Full stack',   '#27ae60'),
    ]:
        completed = df[df['exit_reason'].notna()].sort_values('entry_time')
        if completed.empty:
            continue
        equity = completed['pnl_pips'].cumsum().values
        ax.plot(equity, label=f'{label}  (total: {equity[-1]:+.0f}p)', linewidth=1.5, color=color)

    ax.axhline(0, color='grey', linewidth=0.8, linestyle='--')
    ax.set_xlabel('Trade #')
    ax.set_ylabel('Cumulative P&L (pips)')
    ax.legend()
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.show()


if __name__ == '__main__':
    main()
