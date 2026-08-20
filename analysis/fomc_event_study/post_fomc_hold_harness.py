#!/usr/bin/env python3
"""MD files/POST_FOMC_HOLD_HARNESS_TEST.md — the tradable-spec test earned by
the drift finding. Design frozen in the doc: long USD basket 14:30 ET on each
scheduled decision day, exit +5 trading days 14:00 ET; per-leg spread+slip
both ends; financing as a breakeven sweep (no swap data — don't fake it).

Run from repo root: python3 analysis/fomc_event_study/post_fomc_hold_harness.py
"""
import math
import os
from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd

from stage1_event_study import (  # noqa: E402
    FOMC_DATES, USD_QUOTE, USD_BASE, load_pair, px_at_or_before,
    next_trading_stamp, et_utc,
)

HERE = os.path.dirname(os.path.abspath(__file__))

# frozen round-trip pips (spread both ends + slippage), per the doc
RT_PIPS = {"eurusd": 1.3, "gbpusd": 1.5, "audusd": 1.4, "nzdusd": 1.9,
           "usdjpy": 1.4, "usdchf": 1.7, "usdcad": 1.7}
PIP = {"usdjpy": 0.01}  # all others 0.0001


def main():
    pairs = {p: load_pair(p) for p in RT_PIPS}
    rows = []
    for ds in FOMC_DATES:
        t_a = et_utc(ds, 14, 30)
        t_b = next_trading_stamp(ds, 5)
        legs, costs = [], []
        ok = True
        for p, df in pairs.items():
            a, b = px_at_or_before(df, t_a), px_at_or_before(df, t_b)
            if not a or not b:
                ok = False
                break
            r = math.log(b / a)
            legs.append(-r if p in USD_QUOTE else r)
            costs.append(RT_PIPS[p] * PIP.get(p, 0.0001) / a)
        if not ok:
            continue
        gross = sum(legs) / len(legs)
        cost = sum(costs) / len(costs)
        nights = (t_b - t_a).days  # real calendar nights held
        rows.append(dict(date=ds, gross=gross, cost=cost,
                         net=gross - cost, nights=nights))
    ev = pd.DataFrame(rows)
    ev.to_csv(os.path.join(HERE, "post_fomc_hold_trades.csv"), index=False)

    n = len(ev)
    print(f"events: {n}  mean gross={ev.gross.mean() * 1e4:.1f}bp  "
          f"mean cost={ev.cost.mean() * 1e4:.1f}bp  "
          f"mean net={ev.net.mean() * 1e4:.1f}bp  "
          f"mean nights={ev.nights.mean():.1f}")

    def tstat(s):
        return s.mean() / (s.std(ddof=1) / math.sqrt(len(s)))

    oos = ev[ev.date >= "2022"]
    ins = ev[ev.date < "2022"]
    print(f"\nIS 2016-2021: N={len(ins)} net mean={ins.net.mean() * 1e4:.1f}bp "
          f"t={tstat(ins.net):.2f}  win={(ins.net > 0).mean():.0%}")
    print(f"OOS 2022->:   N={len(oos)} net mean={oos.net.mean() * 1e4:.1f}bp "
          f"t={tstat(oos.net):.2f}  win={(oos.net > 0).mean():.0%}")

    # full-sample annualized Sharpe on per-event net returns (8 events/yr)
    sharpe = ev.net.mean() / ev.net.std(ddof=1) * math.sqrt(8)
    # breakeven financing: bp/night on basket notional that zeroes mean net
    breakeven = ev.net.mean() / ev.nights.mean() * 1e4
    print(f"\nfull-sample net annualized Sharpe (8 ev/yr): {sharpe:.2f}")
    print(f"breakeven financing: {breakeven:.2f} bp/night on basket notional")
    print("financing sweep (mean net per event after f bp/night):")
    for f in (0.5, 1.0, 1.5, 2.0):
        adj = ev.net - f / 1e4 * ev.nights
        print(f"  f={f:.1f}: mean={adj.mean() * 1e4:.1f}bp  "
              f"t={tstat(adj):.2f}  ann.Sharpe={adj.mean() / adj.std(ddof=1) * math.sqrt(8):.2f}")

    oos_pass = oos.net.mean() > 0 and abs(tstat(oos.net)) >= 2 and len(oos) >= 30
    verdict = oos_pass and sharpe >= 0.5 and breakeven >= 1.5
    print(f"\nPASS BAR: OOS net>0 |t|>=2 N>=30 [{oos_pass}], "
          f"full Sharpe>=0.5 [{sharpe >= 0.5}], "
          f"breakeven>=1.5bp/night [{breakeven >= 1.5}] "
          f"-> {'PASS' if verdict else 'FAIL'}")


if __name__ == "__main__":
    main()
