"""Stage 2 (build and look) for the jumps deep dive. Describes the flagged bursts WITHOUT reading anything after them.

Nothing here reads a price after the burst bar, so the after-burst test stays blind.
    python scripts/jump-after/look.py   ->  backtest-data/vol-layer/jump-look.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history"), str(ROOT / "scripts/jump-after")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from forecast_record import klass  # noqa: E402
from run import BA, BA_KEY, HIST  # noqa: E402

OUT = ROOT / "analysis/output/jump-after"
WEB = ROOT / "backtest-data/vol-layer"
BLOCKS = {"Rollover 21:00-01:00": [21, 0], "Asia 01:00-07:00": [1, 2, 3, 4, 5, 6], "London 07:00-12:00": [7, 8, 9, 10, 11],
          "US data 12:00-14:00": [12, 13], "Afternoon 14:00-21:00": [14, 15, 16, 17, 18, 19, 20]}


def block(h):
    return next(k for k, v in BLOCKS.items() if h in v)


def main():
    E = pd.read_parquet(OUT / "events.parquet", columns=["inst", "date", "slot", "kind", "sign", "L", "size", "hour", "spread0", "sched"])
    F = E[E.kind == "flag"].copy()
    C = E[E.kind == "control"].copy()
    F["klass"] = F.inst.map(klass)
    F["block"] = F.hour.map(block)
    # typical spread for that instrument and hour, from the controls (no outcome involved)
    typ = C.groupby(["inst", "hour"]).spread0.median().rename("typ")
    F = F.join(typ, on=["inst", "hour"])
    F["spread_x"] = F.spread0 / F.typ
    # cojumps: how many instruments burst in the same 5-minute slot on the same day
    F["cojump"] = F.groupby(["date", "slot"]).inst.transform("size")
    X = pd.read_parquet(OUT / "sessions.parquet", columns=["inst", "flag"])
    sess = int(X.flag.notna().sum())                           # sessions where the detector could flag
    out = {"n": int(len(F)), "per_inst_year": round(len(F) / sess * 252, 1), "share_of_sessions": round(len(F) / sess, 3),
           "events": int(F.groupby(["date", "slot"]).ngroups)}
    out["blocks"] = []
    for b in BLOCKS:
        g = F[F.block == b]
        out["blocks"].append({"block": b, "n": int(len(g)), "share": round(len(g) / len(F), 3),
                              "spread_x_median": round(float(g.spread_x.median()), 2), "spread_x_over3": round(float((g.spread_x > 3).mean()), 3),
                              "cojump_share": round(float((g.cojump >= 3).mean()), 3), "size_median": round(float(g["size"].median()), 3),
                              "sched": round(float(g.sched.mean()), 3) if g.sched.notna().any() else None})
    out["by_class"] = {c: {"n": int(len(g)), "cojump_share": round(float((g.cojump >= 3).mean()), 3), "spread_x_median": round(float(g.spread_x.median()), 2)} for c, g in F.groupby("klass")}
    out["cojump_dist"] = F.cojump.clip(upper=10).value_counts().sort_index().to_dict()
    out["size_hist"] = [[round(float(a), 3), int(c)] for c, a in zip(*np.histogram(F["size"].clip(upper=0.6), bins=24, range=(0, 0.6)))]
    out["by_hour"] = F.groupby("hour").size().to_dict()
    # 30 bursts by a fixed seed, six from each block: the hour before and the burst bar only
    rng = np.random.default_rng(20261108)
    pick = pd.concat([g.iloc[rng.choice(len(g), min(6, len(g)), replace=False)] for _, g in F.groupby("block")])
    shots = []
    for sym, g in pick.groupby("inst"):
        df = pd.read_parquet(BA / f"{BA_KEY.get(sym, sym.lower())}_m1.parquet", columns=["time", "close", "bid_c", "ask_c"])
        idx = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True)).tz_convert("Europe/London")
        d_ = idx.strftime("%Y-%m-%d")
        mins = (idx.hour * 60 + idx.minute).to_numpy()
        sig = pd.read_csv(HIST / f"{sym}.csv", usecols=["date", "open", "live_sig_used"]).set_index("date")
        for r in g.itertuples():
            end = (r.slot + 1) * 5                              # the burst bar's last minute: nothing after it
            m = (d_ == r.date) & (mins >= end - 65) & (mins < end)
            if m.sum() < 5:
                continue
            c = df.close.to_numpy()[m]
            sp = (df.ask_c - df.bid_c).to_numpy()[m]
            sigp = sig.open[r.date] * sig.live_sig_used[r.date] / 100
            base = c[0]
            shots.append({"inst": sym, "date": r.date, "time": f"{end // 60 - (1 if end % 60 == 0 else 0):02d}:{(end - 5) % 60:02d}", "block": r.block,
                          "L": round(float(r.L), 1), "size": round(float(r.size), 3), "spread_x": round(float(r.spread_x), 1) if np.isfinite(r.spread_x) else None,
                          "cojump": int(r.cojump), "sched": None if pd.isna(r.sched) else int(r.sched),
                          "path": [[int(t - end), round(float((x - base) / sigp), 3)] for t, x in zip(mins[m], c)],
                          "spread": [[int(t - end), round(float(s / sigp), 4)] for t, s in zip(mins[m], sp)]})
    out["shots"] = sorted(shots, key=lambda s: (list(BLOCKS).index(s["block"]), s["date"]))
    WEB.mkdir(parents=True, exist_ok=True)
    (WEB / "jump-look.json").write_text(json.dumps(out, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items() if k not in ("shots", "size_hist")}, indent=1, default=str))


if __name__ == "__main__":
    main()
