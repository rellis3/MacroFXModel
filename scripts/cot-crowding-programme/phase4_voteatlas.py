"""cot-crowding-programme Phase 4, step 3: cells VA1 and VA2 on the Vote Atlas bot's recorded trades.

Registered design: forge/COT_CROWDING_PROGRAMME_PREREG.md (705e46ea). Seed 20261024.

Trades: analysis/output/level-atlas-vote-trades/<inst>-votetrades.json (costs included in pnlPct),
2022-05-05 -> 2026-08-20, 12 instruments with their own COT market:
  eurusd gbpusd audusd nzdusd usdjpy usdcad usdchf -> EUR GBP AUD NZD JPY CAD CHF (the panel's crowd
  is already in pair terms for JPY/CAD/CHF), gold -> GOLD, nq -> NQ, spx -> ES, dow -> YM, us2000 -> RTY.
Trade side 'up' = +1, 'down' = -1.
COT row: the latest report (ok & history_ok) whose release, Friday 15:30 America/New_York (report
Tuesday + 3 days), is strictly before the trade's entry `time`.
  test     side == crowd while the market is crowded with trend in state B or D
  control  the report row is a states.control week (not crowded, stretch < 70)
VA1: effect = mean over test trades of (pnlPct - mean pnlPct of control trades in the same
     instrument x decision x rung x session cell); full period; IS (<= 2024-06-30) and OOS signs.
VA2: OOS (2024-07-01 -> 2026-08-20): mean pnlPct per trade with the skip rule (drop test trades) minus
     mean pnlPct per trade taking every trade; total OOS pnl both ways.
CI: moving-block bootstrap over trade DATES (sorted unique trading dates, block 20), B = 2000.
"""
import json, os, sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
import panel as P   # noqa: E402
import states as S  # noqa: E402

ROOT, OUT = P.ROOT, P.DATA
TR = os.path.join(ROOT, "analysis/output/level-atlas-vote-trades")
MAP = {"eurusd": "EUR", "gbpusd": "GBP", "audusd": "AUD", "nzdusd": "NZD", "usdjpy": "JPY", "usdcad": "CAD",
       "usdchf": "CHF", "gold": "GOLD", "nq": "NQ", "spx": "ES", "dow": "YM", "us2000": "RTY"}
SEED, REPS, BLOCK = 20261024, 2000, 20
START, IS_END, OOS_START, OOS_END = "2022-05-05", "2024-06-30", "2024-07-01", "2026-08-20"
NY = ZoneInfo("America/New_York")


def release_epoch(report_date):
    t = (report_date + timedelta(days=3))
    return datetime(t.year, t.month, t.day, 15, 30, tzinfo=NY).timestamp()


def load():
    p = S.add(P.build(), P.daily_prices())
    rows = []
    for inst, sym in MAP.items():
        d = json.load(open(os.path.join(TR, f"{inst}-votetrades.json")))
        g = p[(p.sym == sym) & p.ok & p.history_ok].sort_values("report_date")
        rel = np.array([release_epoch(x) for x in g.report_date])
        for t in d["trades"]:
            if not (START <= t["date"] <= OOS_END):   # the registered window (some files start earlier)
                continue
            k = np.searchsorted(rel, t["time"], side="left") - 1      # release strictly before entry
            if k < 0:
                continue
            r = g.iloc[k]
            side = 1 if t["side"] == "up" else -1
            rows.append({"inst": inst, "sym": sym, "date": t["date"], "time": t["time"], "side": side,
                         "decision": t["decision"], "rung": t["rung"], "session": t["session"],
                         "pnl": t["pnlPct"], "mae": t["maePct"], "win": bool(t["win"]),
                         "report": str(r.report_date.date()), "state": r.state, "crowd": int(r.crowd),
                         "control": bool(r.control)})
    df = pd.DataFrame(rows)
    df["test"] = df.state.isin(["B", "D"]) & (df.side == df.crowd)
    df["cell"] = df.inst + "|" + df.decision + "|" + df.rung + "|" + df.session
    return df


def block_weights(dates, rng):
    ud = np.array(sorted(set(dates)))
    n = len(ud); nb = int(np.ceil(n / BLOCK))
    st = rng.integers(0, max(1, n - BLOCK + 1), nb)
    cnt = np.bincount((st[:, None] + np.arange(BLOCK)).ravel().clip(max=n - 1), minlength=n).astype(float)
    return dict(zip(ud, cnt))


def va1_effect(test, ctrl, w=None):
    wt = np.ones(len(test)) if w is None else test.date.map(w).values
    wc = np.ones(len(ctrl)) if w is None else ctrl.date.map(w).values
    cs = pd.Series(ctrl.pnl.values * wc).groupby(ctrl.cell.values).sum()
    cn = pd.Series(wc).groupby(ctrl.cell.values).sum()
    cm = (cs / cn.replace(0, np.nan)).reindex(test.cell.values).values
    ok = np.isfinite(cm) & (wt > 0)
    return float(np.sum((test.pnl.values - cm)[ok] * wt[ok]) / wt[ok].sum()) if ok.any() else np.nan, int(np.isfinite(cm).sum())


def pfromci(est, lo, hi):
    from math import erf, sqrt
    se = (hi - lo) / (2 * 1.959964)
    return 2 * (1 - 0.5 * (1 + erf(abs(est) / se / sqrt(2)))) if se > 0 else 1.0


def main():
    rng = np.random.default_rng(SEED)
    df = load()
    res = {"id": "cot-crowding-programme", "phase": 4, "part": "Vote Atlas VA1-VA2", "seed": SEED,
           "n_trades": int(len(df)), "window": [df.date.min(), df.date.max()],
           "by_inst": df.groupby("inst").agg(n=("pnl", "size"), test=("test", "sum"), control=("control", "sum")).astype(int).to_dict("index"),
           "state_counts": df.state.fillna("none").value_counts().to_dict()}
    test, ctrl = df[df.test], df[df.control]
    est, matched = va1_effect(test, ctrl)
    bs = []
    for _ in range(REPS):
        w = block_weights(df.date.values, rng)
        bs.append(va1_effect(test, ctrl, w)[0])
    lo, hi = np.nanpercentile(bs, [2.5, 97.5])
    is_t, is_c = test[test.date <= IS_END], ctrl[ctrl.date <= IS_END]
    oo_t, oo_c = test[test.date >= OOS_START], ctrl[ctrl.date >= OOS_START]
    e_is, e_oos = va1_effect(is_t, is_c)[0], va1_effect(oo_t, oo_c)[0]
    va1 = {"metric": "mean pnlPct (test - matched control cell mean)", "est": round(est, 4), "ci": [round(lo, 4), round(hi, 4)],
           "p": round(pfromci(est, lo, hi), 4), "n_test": int(len(test)), "n_test_matched": matched, "n_control": int(len(ctrl)),
           "is_est": round(e_is, 4), "oos_est": round(e_oos, 4), "n_test_is": int(len(is_t)), "n_test_oos": int(len(oo_t)),
           "descriptive": {"test": {"mean_pnl": round(test.pnl.mean(), 4), "win": round(test.win.mean(), 3), "mae": round(test.mae.mean(), 4)},
                           "control": {"mean_pnl": round(ctrl.pnl.mean(), 4), "win": round(ctrl.win.mean(), 3), "mae": round(ctrl.mae.mean(), 4)},
                           "against_crowd_in_BD": {"n": int((df.state.isin(["B", "D"]) & (df.side == -df.crowd)).sum()),
                                                   "mean_pnl": round(df[df.state.isin(["B", "D"]) & (df.side == -df.crowd)].pnl.mean(), 4)},
                           "test_by_state": df[df.test].groupby("state").pnl.agg(["mean", "size"]).round(4).to_dict("index"),
                           "test_by_inst": df[df.test].groupby("inst").pnl.agg(["mean", "size"]).round(4).to_dict("index")}}
    va1["checks"] = {"CI excludes 0": bool(lo > 0 or hi < 0), "same sign IS and OOS": bool(np.sign(e_is) == np.sign(e_oos) == np.sign(est))}
    va1["underpowered"] = len(test) < 100

    oos = df[(df.date >= OOS_START) & (df.date <= OOS_END)]
    def va2_stat(d, w=None):
        wt = np.ones(len(d)) if w is None else d.date.map(w).values
        allm = np.sum(d.pnl.values * wt) / wt.sum()
        k = ~d.test.values
        keep = np.sum(d.pnl.values[k] * wt[k]) / wt[k].sum()
        return keep - allm
    e2 = va2_stat(oos)
    bs2 = [va2_stat(oos, block_weights(oos.date.values, rng)) for _ in range(REPS)]
    l2, h2 = np.nanpercentile(bs2, [2.5, 97.5])
    va2 = {"metric": "OOS mean pnlPct per trade: skip rule minus all trades", "est": round(e2, 5), "ci": [round(l2, 5), round(h2, 5)],
           "p": round(pfromci(e2, l2, h2), 4), "n_oos": int(len(oos)), "n_skipped": int(oos.test.sum()),
           "total_pnl_all": round(oos.pnl.sum(), 3), "total_pnl_skip": round(oos[~oos.test].pnl.sum(), 3),
           "mean_all": round(oos.pnl.mean(), 5), "mean_skip": round(oos[~oos.test].pnl.mean(), 5)}
    va2["checks"] = {"mean improves, CI excludes 0": bool(l2 > 0), "total OOS pnl does not fall": bool(va2["total_pnl_skip"] >= va2["total_pnl_all"])}
    va2["underpowered"] = va2["n_skipped"] < 100
    res["cells"] = {"VA1": va1, "VA2": va2}
    json.dump(res, open(os.path.join(OUT, "phase4_voteatlas.json"), "w"), indent=1, default=str)
    print(json.dumps(res, indent=1, default=str))


if __name__ == "__main__":
    main()
