"""Fidelity: my replay vs the shipped js/intradayRange.js on recent sessions (shipped params)."""
import json, subprocess, sys
import numpy as np, pandas as pd
from forge.live_range_replay import *

out = {}
rows = []
for name, cls in (("EURUSD", "fx_gold"), ("GOLD", "fx_gold"), ("NQ", "indices")):
    S = load_sessions(name)
    csv = pd.read_csv(H / f"{name}.csv")
    csv = csv[csv.last_min >= 1200].tail(5)
    ue, se, oU, oD = shipped_params(cls)
    for _, r in csv.iterrows():
        d = r["date"]; hrs, o, h, l, c = S[d]
        unit = r.pit_sig_daily / 100 * o[0]
        HT, EV = replay(hrs, o, h, l, c, unit, ue, se, oU, oD, 1.0)
        # JS bars: UTC epoch seconds; reconstruct from london date+hour
        ts = pd.to_datetime(d).tz_localize("Europe/London") + pd.to_timedelta(hrs, unit="h")
        bars = [dict(t=int(t.timestamp()), open=a, high=b, low=cc, close=e) for t, a, b, cc, e in zip(ts, o, h, l, c)]
        rows.append(dict(name=name, date=d, sigma=float(r.pit_sig_daily), bars=bars,
                         py=[[int(x[0]), float(o[0]+x[7]*unit), float(o[0]+x[8]*unit), *map(float, x[9:15])] for x in HT if x[1] == 1], unit=unit))
json.dump(rows, open(sys.argv[1], "w"))
