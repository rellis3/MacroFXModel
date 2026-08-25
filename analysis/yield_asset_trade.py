"""
Stage 2 of the yield -> asset study: turn a surviving IC into a costed strategy.

An IC of 0.05 is not an edge until it survives spread. This runs each signal as a
daily-rebalanced long/flat/short book, charges a round-turn cost on every change
in position, and benchmarks against buy-and-hold on the same bars.

  position(t) = mean of last h days of  -sign( yield_change_k )  , shifted 1 day

The shift is the same synchronisation guard used in the study: the yield print is
3pm ET, most of these closes are not.

Usage:
    python -m analysis.yield_asset_trade --top 20
    python -m analysis.yield_asset_trade --asset FTSE --driver y10 --k 21 --h 21
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "analysis" / "output" / "yield_coupling"

# round-turn cost in bp of notional. Retail CFD/spread-bet, deliberately gentle.
COST_BP = {"default": 2.0, "GOLD": 3.0, "FTSE": 2.5, "STOXX": 2.5, "NIKKEI": 3.0,
           "EURUSD": 1.0, "USDJPY": 1.0, "GBPUSD": 1.5, "AUDUSD": 1.5,
           "USDCAD": 1.5, "USDCHF": 1.5, "NZDUSD": 2.0}


def load_px(name):
    return pd.read_csv(OUT / ("px_%s.csv" % name), index_col=0,
                       parse_dates=True)["close"].sort_index()


def perf(r: pd.Series, ann=252):
    r = r.dropna()
    if len(r) < 60 or r.std() == 0:
        return dict(sharpe=np.nan, cagr=np.nan, maxdd=np.nan)
    eq = r.cumsum()
    return dict(
        sharpe=float(r.mean() / r.std() * np.sqrt(ann)),
        cagr=float(np.expm1(r.sum() / (len(r) / ann))),
        maxdd=float((eq - eq.cummax()).min()),
    )


def backtest(sym, driver, k, h, yields, cost_bp=None):
    px = load_px(sym)
    y = yields.reindex(px.index.union(yields.index)).sort_index().ffill(limit=4)
    df = pd.concat([np.log(px).rename("lp"), y.reindex(px.index)], axis=1)
    df = df[~df.index.duplicated()].sort_index().dropna(subset=["lp", driver])

    ret = df["lp"].diff()
    sig = -np.sign(df[driver].diff(k))
    pos = sig.rolling(h).mean().shift(1).reindex(ret.index).fillna(0.0)

    cost = (cost_bp if cost_bp is not None else COST_BP.get(sym, COST_BP["default"])) / 1e4
    turn = pos.diff().abs().fillna(0.0)
    strat = (pos * ret - turn * cost).dropna()

    half = len(strat) // 2
    out = dict(asset=sym, driver=driver, k=k, h=h, yrs=round(len(strat) / 252, 1),
               ann_turn=float(turn.mean() * 252))
    out["sharpe_gross"] = perf(pos * ret)["sharpe"]
    for tag, s in [("net", strat), ("h1", strat.iloc[:half]), ("h2", strat.iloc[half:])]:
        out["sharpe_" + tag] = perf(s)["sharpe"]
    p = perf(strat)
    out["cagr_net"] = p["cagr"]
    out["maxdd"] = p["maxdd"]
    bh = perf(ret)
    out["bh_sharpe"] = bh["sharpe"]
    out["bh_cagr"] = bh["cagr"]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=20)
    ap.add_argument("--asset")
    ap.add_argument("--driver")
    ap.add_argument("--k", type=int)
    ap.add_argument("--h", type=int)
    ap.add_argument("--cost-bp", type=float, default=None)
    ap.add_argument("--group", help="restrict survivors to one group, e.g. fx")
    a = ap.parse_args()

    yields = pd.read_csv(OUT / "yields.csv", index_col=0, parse_dates=True)

    if a.asset:
        cells = [(a.asset, a.driver, a.k, a.h)]
    else:
        res = pd.read_csv(OUT / "study_main.csv")
        fwd = res[(res.tradeable == 1) & (~res.group.isin(["bond"]))]
        if a.group:
            fwd = fwd[fwd.group == a.group]
        surv = fwd[(fwd.stable == 1) & (fwd.p_null < 0.05)]
        pool = surv if len(surv) else fwd
        pool = pool.reindex(pool.ic.abs().sort_values(ascending=False).index)
        cells = list(pool[["asset", "driver", "lookback", "horizon"]]
                     .head(a.top).itertuples(index=False, name=None))
        print("running %d cells (%s), cost = broker-realistic bp per turn"
              % (len(cells), "best survivors" if len(surv) else "NO SURVIVORS: top |IC|"))

    rows = [backtest(s, d, k, h, yields, a.cost_bp) for s, d, k, h in cells]
    out = pd.DataFrame(rows)
    out["beats_bh"] = out.sharpe_net > out.bh_sharpe
    cols = ["asset", "driver", "k", "h", "yrs", "ann_turn", "sharpe_gross",
            "sharpe_net", "sharpe_h1", "sharpe_h2", "cagr_net", "maxdd",
            "bh_sharpe", "bh_cagr", "beats_bh"]
    pd.set_option("display.width", 250)
    print(out[cols].to_string(index=False, float_format=lambda v: "%7.3f" % v))
    print("\n  cells beating buy-and-hold : %d / %d" % (out.beats_bh.sum(), len(out)))
    print("  cells with net Sharpe > 0.5: %d / %d" % ((out.sharpe_net > 0.5).sum(), len(out)))
    print("  cells positive in BOTH halves: %d / %d"
          % (((out.sharpe_h1 > 0) & (out.sharpe_h2 > 0)).sum(), len(out)))
    out.to_csv(OUT / "trade_test.csv", index=False)
    print("\nwrote %s" % (OUT / "trade_test.csv"))


if __name__ == "__main__":
    main()
