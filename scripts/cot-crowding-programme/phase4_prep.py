"""cot-crowding-programme Phase 4, step 1: align prices and the point-in-time COT state per day.

Registered design: forge/COT_CROWDING_PROGRAMME_PREREG.md (705e46ea), cells A1-A4. This script
computes no outcome; it only builds the inputs the node harness (phase4_trend.mjs) feeds into
js/trendFollowEngine.js.

Prices: panel.daily_prices() (Yahoo daily closes, JPY/CAD/CHF already inverted to pair terms,
cut at the 2026-08-21 lockbox). One business-day grid = union of all 34 markets' weekdays from
2005-01-03. A market's closes are forward-filled over its own holidays (a filled day earns a 0
return). Before a market's first price (RTY 2017-07, PLAT/PALL patchy early) the first close is
back-filled: constant closes give momentumSignal 0 and rollingVol 0, so the engine holds no
position there -- the market is simply absent until it has history.

State per grid day: the state of the most recent report RELEASED BEFORE that day (release =
report Tuesday + 3 days; used from the first grid day strictly after it). Only report rows with
ok & history_ok count; outside crowded-with-trend the state is none (0). Encoded per day:
  st  0 none, 1 A, 2 B, 3 C, 4 D        crowd  +1 / -1 (0 when st == 0)
Shutdown reports are already marked not-ok by panel.build, so the previous report carries on.

Output: analysis/output/cot-crowding-programme/phase4_aligned.json
"""
import json, os, sys
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
import panel as P   # noqa: E402
import states as S  # noqa: E402

OUT = P.DATA
START = pd.Timestamp("2005-01-03")
CODE = {"A": 1, "B": 2, "C": 3, "D": 4}


def main():
    p = P.build()
    px = P.daily_prices()
    p = S.add(p, px)
    syms = sorted(p.sym.unique())
    wide = px.pivot_table(index="date", columns="sym", values="close").sort_index()
    wide = wide[(wide.index >= START) & (wide.index.dayofweek < 5)][syms]
    wide = wide.ffill().bfill()
    assert wide.notna().all().all()
    dates = wide.index
    out = {"dates": [d.strftime("%Y-%m-%d") for d in dates], "markets": {}}
    for sym in syms:
        g = p[(p.sym == sym)].sort_values("report_date")
        g = g[g.ok & g.history_ok]
        rel = (g.report_date + pd.Timedelta(days=3)).values
        k = np.searchsorted(rel, dates.values, side="left") - 1     # last release strictly before the day
        stv = np.array([CODE.get(x, 0) if isinstance(x, str) else 0 for x in g.state.values])
        crv = np.where(stv > 0, g.crowd.values, 0)
        st = np.where(k >= 0, stv[np.maximum(k, 0)], 0).astype(int)
        cr = np.where(k >= 0, crv[np.maximum(k, 0)], 0).astype(int)
        first = px[px.sym == sym].date.min()
        out["markets"][sym] = {"set": g.set.iat[0], "closes": [round(float(x), 8) for x in wide[sym].values],
                               "st": st.tolist(), "crowd": cr.tolist(), "firstPrice": first.strftime("%Y-%m-%d")}
        print(sym, g.set.iat[0], "first price", first.date(), "state days", {k2: int((st == v).sum()) for k2, v in CODE.items()})
    with open(os.path.join(OUT, "phase4_aligned.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print("grid", out["dates"][0], "->", out["dates"][-1], len(dates))


if __name__ == "__main__":
    main()
