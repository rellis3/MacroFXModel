"""
Entry point — runs the Asia Range Breakout backtest for EUR/USD.

Usage:
    cd backtest
    pip install -r requirements.txt
    python run.py

The script runs four strategy variants side-by-side so you can see which
filters add genuine edge:

    Variant 1: Raw breakout (no filters)
    Variant 2: + RVOL filter only
    Variant 3: + RVOL + VWAP filter
    Variant 4: + RVOL + VWAP + Confluence filter
"""

import sys
import copy
from pathlib import Path

# Allow imports from the backtest root
sys.path.insert(0, str(Path(__file__).parent))

from config import PAIRS, STRATEGY
from core.loader import load_pair
from core.volume import add_all_volume_indicators
from engine.backtest import BacktestEngine
from analysis.results import trades_to_df, print_summary, compare_variants
from analysis.charts import plot_equity_curve, plot_monthly_heatmap, plot_entry_analysis

PAIR = 'EURUSD'


def build_variants() -> list[tuple[str, dict]]:
    """Four variants that progressively add filters."""
    base = copy.deepcopy(STRATEGY)

    v1 = copy.deepcopy(base)
    v1['rvol_min']          = 0.0    # no RVOL filter
    v1['vwap_filter']       = False
    v1['confluence_filter'] = False

    v2 = copy.deepcopy(base)
    v2['vwap_filter']       = False
    v2['confluence_filter'] = False

    v3 = copy.deepcopy(base)
    v3['confluence_filter'] = False

    v4 = copy.deepcopy(base)
    v4['confluence_filter'] = True

    return [
        ('V1: Raw breakout',              v1),
        ('V2: + RVOL filter',             v2),
        ('V3: + RVOL + VWAP',            v3),
        ('V4: + RVOL + VWAP + Confluence', v4),
    ]


def main():
    pair_cfg = PAIRS[PAIR]

    print(f'\n{"="*52}')
    print(f'  Asia Range Breakout Backtest — {PAIR}')
    print(f'{"="*52}')

    # ── Load data ─────────────────────────────────────────────────────────────
    print('\nLoading data...')
    data = load_pair(pair_cfg)

    # ── Compute volume indicators on 1m bars (done once, shared across variants)
    print('\nComputing volume indicators on 1m bars...')
    data['m1'] = add_all_volume_indicators(
        data['m1'],
        pip_size=pair_cfg['pip_size'],
        rvol_lookback=STRATEGY['rvol_lookback'],
    )

    # ── Run variants ──────────────────────────────────────────────────────────
    variant_dfs = {}
    for label, strategy in build_variants():
        print(f'\nRunning: {label}')
        engine = BacktestEngine(PAIR, pair_cfg, data, strategy)
        trades = engine.run()
        df     = trades_to_df(trades)
        variant_dfs[label] = df

    # ── Print individual summaries ─────────────────────────────────────────────
    for label, df in variant_dfs.items():
        print_summary(df, label=label)

    # ── Side-by-side comparison ───────────────────────────────────────────────
    compare_variants(variant_dfs)

    # ── Charts for the best variant (V3 or V4) ────────────────────────────────
    best_label = 'V3: + RVOL + VWAP'
    best_df    = variant_dfs[best_label]

    if not best_df.empty:
        print(f'Plotting charts for: {best_label}')
        plot_equity_curve(best_df,    title=f'{PAIR} — {best_label} — Equity Curve')
        plot_monthly_heatmap(best_df, title=f'{PAIR} — {best_label} — Monthly P&L (pips)')
        plot_entry_analysis(best_df)


if __name__ == '__main__':
    main()
