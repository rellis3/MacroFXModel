"""
validate.py — sanity-checks engine.py against the JS reference numbers
produced by /tmp/test_specific_cfg.mjs for one specific EUR/USD config,
over the same TRAIN/HOLDOUT windows. Not part of the sweep; throwaway
once the port is trusted.
"""

import sys
import time
import numpy as np
import pandas as pd

sys.path.insert(0, "/home/user/MacroFXModel/ForecasterOptimizer")
import engine as E

DATA = "/home/user/MacroFXModel/VolRangeForecaster/data/m1/eurusd_m1.parquet"


def ts_of(date_str):
    return int(pd.Timestamp(date_str + "T00:00:00Z").timestamp())


def ts_of_eod(date_str):
    return int(pd.Timestamp(date_str + "T23:59:59Z").timestamp())


def main():
    t0 = time.time()
    df = pd.read_parquet(DATA)
    data_start, hold_to = "2017-09-01", "2026-04-30"
    df = df.loc[data_start:hold_to]
    times = (df.index.values.astype("int64") // 1_000_000_000).astype(np.int64)
    opens = df["open"].values.astype(np.float64)
    highs = df["high"].values.astype(np.float64)
    lows = df["low"].values.astype(np.float64)
    closes = df["close"].values.astype(np.float64)
    print(f"loaded {len(df)} M1 bars in {time.time()-t0:.1f}s")

    t0 = time.time()
    day_keys, d_open, d_high, d_low, d_close = E.aggregate_daily(times, opens, highs, lows, closes)
    fc_valid, fc_hl75, fc_hlmed, fc_oc75, fc_ocmed = E.compute_walkforward_forecast_series(
        d_open, d_high, d_low, d_close, "fx", min_warmup=90
    )
    fc_lookup = E.build_forecast_lookup(day_keys, fc_valid, fc_hl75, fc_hlmed, fc_oc75, fc_ocmed)
    atr_arr = E.compute_atr_for_tf(times, opens, highs, lows, closes, 14, 30)
    mom_arr = E.compute_momentum_z(closes)
    pip_size = E.pip_size_for_pairkey("eurusd")
    print(f"precompute done in {time.time()-t0:.1f}s")

    cfg = dict(E.PARAM_DEFS)
    cfg.update(dict(
        strategy="reversal", slMode="pips", slFixedPips=30, slAtrMult=5.20, slAtrTfMin=30,
        tpMode="none", beAfterR=1.4, momZThresh=1.80, dynMinMove=1.00,
        windowStartH=9, windowEndH=14, oneTradeAtATime=1, minBarsBetween=116, maxLevelTrades=1,
    ))

    m1 = (times, opens, highs, lows, closes)

    def run(label, from_d, to_d):
        from_ts, to_ts = ts_of(from_d), ts_of_eod(to_d)
        t0 = time.time()
        entry_ts, exit_ts, pnl_pct, win, reason = E.run_backtest(
            m1, atr_arr, mom_arr, fc_lookup, cfg, from_ts, to_ts, pip_size
        )
        stats = E.compute_analytics(entry_ts, exit_ts, pnl_pct, win, reason)
        dt = time.time() - t0
        print(f"\n[{label}] {from_d}..{to_d}  ({dt:.2f}s)")
        if stats is None:
            print(f"  too few trades ({len(pnl_pct)}) for stats")
            return
        sl_n = int((reason == E.EXIT_SL).sum())
        be_n = int(((reason == E.EXIT_SL) & (np.abs(pnl_pct) < 1e-9)).sum())
        eod_n = int((reason == E.EXIT_EOD).sum())
        tp_n = int((reason == E.EXIT_TP).sum())
        pf_str = "inf" if not np.isfinite(stats["pf"]) else f"{stats['pf']:.2f}"
        print(f"  trades={stats['total']}  totalPnl={stats['totalPnl']:.2f}%  sharpe={stats['sharpe']:.2f}  "
              f"sortino={stats['sortino']:.2f}  calmar={stats['calmar']:.2f}  maxDD={stats['maxDD']:.2f}%  "
              f"winRate={stats['winRate']:.1f}%  pf={pf_str}")
        print(f"  exits: SL={sl_n} (BE~0={be_n})  EOD={eod_n}  TP={tp_n}")

    run("TRAIN", "2018-01-01", "2023-12-31")
    run("HOLDOUT", "2024-01-01", "2026-04-30")
    print("\nDONE")


if __name__ == "__main__":
    main()
