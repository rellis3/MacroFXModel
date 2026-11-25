"""
Maximum Adverse Excursion (MAE) analysis, reconstructed post-hoc from the
cached 1-minute bars for every trade in a backtest_forecast_band_fade run --
the engine itself doesn't track running adverse excursion per trade (see
generate_kpi_report.py's docstring), so this recomputes it directly from
price action between each trade's entry_ts and exit_ts rather than
re-simulating.

For each trade: scan every 1-min bar in [entry_ts, exit_ts], find the worst
(most adverse) NATIVE price reached, and convert that into the same $ PnL
formula close_position() itself uses (so inverted-quote instruments like
USDJPY/6J are handled correctly -- native price is the reciprocal of the
forecast-scale price, so forecast "high" maps to native "low" and vice
versa when invert=True).

Usage:
    python mae_analysis.py [--trades hardclose_run/backtest_hardclose_trades.csv]

Outputs (next to the trades file, under a "mae" subfolder):
    mae_per_trade.csv       -- one row per trade: mae_usd, mae_pct_of_risk
    mae_summary.json        -- aggregates by instrument and by tier
"""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from backtest_forecast_band_fade import CONTRACT_SPECS, DATA_CACHE

INSTRUMENTS = ["GOLD", "NQ", "EURUSD", "USDJPY", "ES"]


def _to_native(price, invert):
    return 1.0 / price if invert else price


def compute_mae_for_instrument(trades, bars, cfg):
    """trades: DataFrame slice for one instrument. bars: that instrument's
    cached 1-min OHLC (forecast scale, USDJPY already inverted by
    vol_pipeline -- see load_1m_bars). Returns trades with mae_usd/
    mae_pct_of_risk columns added."""
    invert = cfg["invert"]
    point_value = cfg["point_value"]
    qty = 1  # DEFAULTS["quantity"] throughout every run so far

    mae_usd = np.full(len(trades), np.nan)
    for i, row in enumerate(trades.itertuples()):
        window = bars.loc[row.entry_ts:row.exit_ts]
        if window.empty:
            continue
        native_entry = _to_native(row.entry_price, invert)
        is_native_short = (row.direction == "SHORT")

        # Forecast "high" -> native LOW when inverted (reciprocal flips
        # ordering), native HIGH otherwise -- and vice versa for "low".
        if invert:
            native_high = (1.0 / window["low"]).max()
            native_low = (1.0 / window["high"]).min()
        else:
            native_high = window["high"].max()
            native_low = window["low"].min()

        if is_native_short:
            worst_native = native_high  # higher native price = more loss for a short
            adverse_pnl = (native_entry - worst_native) * point_value * qty
        else:
            worst_native = native_low  # lower native price = more loss for a long
            adverse_pnl = (worst_native - native_entry) * point_value * qty

        mae_usd[i] = max(0.0, -adverse_pnl)

    trades = trades.copy()
    trades["mae_usd"] = mae_usd
    trades["mae_pct_of_risk"] = np.where(trades["risk_usd"] > 0, trades["mae_usd"] / trades["risk_usd"] * 100, np.nan)
    return trades


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--trades", default="hardclose_run/backtest_hardclose_trades.csv")
    args = p.parse_args()

    df = pd.read_csv(args.trades, parse_dates=["entry_ts", "exit_ts"])
    print(f"Loaded {len(df)} trades from {args.trades}")

    out_parts = []
    for name in INSTRUMENTS:
        sub = df[df["instrument"] == name]
        if sub.empty:
            continue
        bars_path = DATA_CACHE / f"{name}_1m.parquet"
        bars = pd.read_parquet(bars_path)[["high", "low"]]
        print(f"  {name}: {len(sub)} trades, scanning against {len(bars):,} cached bars...")
        out_parts.append(compute_mae_for_instrument(sub, bars, CONTRACT_SPECS[name]))

    out = pd.concat(out_parts, ignore_index=True)
    n_missing = out["mae_usd"].isna().sum()
    if n_missing:
        print(f"  WARNING: {n_missing} trades had no bar coverage for their window (excluded from aggregates)")
    out = out.dropna(subset=["mae_usd"])

    out_dir = Path(args.trades).parent / "mae"
    out_dir.mkdir(exist_ok=True)
    out.to_csv(out_dir / "mae_per_trade.csv", index=False)

    def _agg(g):
        return {
            "n_trades": int(len(g)),
            "mean_mae_usd": float(g["mae_usd"].mean()),
            "median_mae_usd": float(g["mae_usd"].median()),
            "p90_mae_usd": float(g["mae_usd"].quantile(0.90)),
            "max_mae_usd": float(g["mae_usd"].max()),
            "mean_mae_pct_of_risk": float(g["mae_pct_of_risk"].mean()),
            "median_mae_pct_of_risk": float(g["mae_pct_of_risk"].median()),
            "p90_mae_pct_of_risk": float(g["mae_pct_of_risk"].quantile(0.90)),
            "pct_trades_mae_over_80pct_of_risk": float((g["mae_pct_of_risk"] >= 80).mean() * 100),
        }

    summary = {
        "overall": _agg(out),
        "by_instrument": {name: _agg(g) for name, g in out.groupby("instrument")},
        "by_instrument_tier": {f"{name}__{tier}": _agg(g) for (name, tier), g in out.groupby(["instrument", "tier"])},
        "by_instrument_tier_result": {
            f"{name}__{tier}__{'win' if win else 'loss'}": _agg(g)
            for (name, tier, win), g in out.assign(win=out["pnl_usd"] > 0).groupby(["instrument", "tier", "win"])
        },
    }
    with open(out_dir / "mae_summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    print(f"\nWrote {out_dir / 'mae_per_trade.csv'} and {out_dir / 'mae_summary.json'}")
    print("\nOverall:", json.dumps(summary["overall"], indent=2))
    print("\nBy instrument:")
    for name, s in summary["by_instrument"].items():
        print(f"  {name}: mean {s['mean_mae_usd']:.2f} usd ({s['mean_mae_pct_of_risk']:.1f}% of risk), "
              f"median {s['median_mae_usd']:.2f}, p90 {s['p90_mae_usd']:.2f}")


if __name__ == "__main__":
    main()
