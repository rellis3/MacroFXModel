"""
GlobalLiquidity — a liquidity-driven macro FX system.

Layers (each individually inspectable, deliberately not blended into one score):

    data      -> Dataset            (FRED live or seeded synthetic)
    gli       -> GLIResult          Global Liquidity Index nowcast + impulse
    regime    -> RegimeResult       4-state classifier + Macro Alf risk gate
    ranker    -> RankerResult       cross-sectional FX liquidity-impulse book
    sizer     -> SizedBook          vol-targeted, conviction-scaled exposure
    backtest  -> stats / WFE        walk-forward validation

Quick start (offline, synthetic):

    from GlobalLiquidity import data, backtest
    ds = data.load_synthetic()
    stats, detail = backtest.run_backtest(ds)

Live (set FRED_API_KEY, supply FX returns from your own price cache):

    ds = data.load_live()
    ds = data.attach_fx_returns(ds, my_weekly_returns)
"""

from . import config, mathx, data, gli, regime, ranker, sizer, backtest

__all__ = ["config", "mathx", "data", "gli", "regime", "ranker", "sizer", "backtest"]
