"""Random bid/ask sessions + the backtest engine's outcomes, for the JS parity check.

    python3 scripts/daily-open-fib-retest/parity_fixture.py OUT.json [n_sessions]

Used by scripts/daily-open-fib-retest/parity.mjs (js/dailyOpenFib.js must reproduce
engine.py exactly on every session, anchor, target and BE setting).
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine import find_fill, trade  # noqa: E402

out, n = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 400
rng = np.random.default_rng(20261029)
sessions = []
for s in range(n):
    bars = 700
    mid = 2000 + np.cumsum(rng.normal(0, 0.25, bars))
    o = np.concatenate([[2000.0], mid[:-1]])
    wig = np.abs(rng.normal(0, 0.15, (2, bars)))
    h = np.maximum(o, mid) + wig[0]
    l = np.minimum(o, mid) - wig[1]
    sp = np.abs(rng.normal(0.3, 0.2, bars)) + 0.02          # spread per bar
    bid = {k: np.round(v - sp / 2, 3) for k, v in (("o", o), ("h", h), ("l", l), ("c", mid))}
    ask = {k: np.round(v + sp / 2, 3) for k, v in (("o", o), ("h", h), ("l", l), ("c", mid))}
    mins = np.arange(bars)
    if rng.random() < 0.2:                                   # a few sessions with gaps in the minutes
        mins = np.cumsum(rng.integers(1, 3, bars)) - 1
    adr = float(rng.uniform(8, 30))
    res = {}
    for anchor in ("high", "do"):
        f = find_fill(bid["o"], bid["h"], bid["l"], mins, adr, anchor, 0.10, 360, buy_l=ask["l"], buy_o=ask["o"])
        if f is None:
            res[anchor] = None
            continue
        side = "ask" if f["side"] < 0 else "bid"
        ex = ask if f["side"] < 0 else bid
        spread = float(ask["o"][f["j"]] - bid["o"][f["j"]])
        r = {"side": int(f["side"]), "j": int(f["j"]), "A": float(f["A"]), "L0": float(f["L0"]), "entry": float(f["entry"])}
        for tg, be in (("zero", True), ("zero", False), (3, True), (2, True)):
            t = trade(ex["o"], ex["h"], ex["l"], mins, f, 0.2, tg, be, 540, fill_spread=spread)
            r[f"{tg}|{int(be)}"] = {"R": t["R"], "how": t["how"]}
        res[anchor] = r
    sessions.append({"mins": mins.tolist(), "adr": adr, "bid": {k: v.tolist() for k, v in bid.items()},
                     "ask": {k: v.tolist() for k, v in ask.items()}, "res": res})
with open(out, "w") as fh:
    json.dump(sessions, fh)
print(f"{len(sessions)} sessions -> {out}")
