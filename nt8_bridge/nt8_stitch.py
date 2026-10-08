"""Build continuous series from the per-contract 1-minute files written by nt8_backfill.py.

    python nt8_bridge/nt8_stitch.py NQ ES GC            # roots; default = every root that has contract files
Writes analysis/output/nt8/continuous/:
    <ROOT>_1m_unadj.parquet      real traded prices of whichever contract was front (JUMPS at each roll) -> use for LEVELS
    <ROOT>_1m_ratio.parquet      same, earlier history multiplied so rolls are gap-free (ratio) -> use for RETURNS / VOL
    <ROOT>_rolls.csv             one row per roll: switch time, from/to contract, ratio, gap in points

Roll rule (no look-ahead): on each CME trade date d, the front contract is the one with the highest volume on trade date
d-1 among the contracts available, and the choice only ever moves FORWARD in expiry (never back). The roll gap is taken
at the last minute BEFORE the switch where both contracts printed.
Trade date = US/Eastern, with the session starting 18:00 ET (so Sunday 18:00 belongs to Monday).
"""
import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

BASE = Path(__file__).resolve().parents[1] / "analysis" / "output" / "nt8"
CONTRACTS = BASE / "contracts"
OUT = BASE / "continuous"


def expiry_key(fname):
    mm, yy = fname.rsplit("_", 1)[1].replace(".parquet", "").split("-")
    return 2000 + int(yy), int(mm)


def trade_date(ts):
    et = ts.dt.tz_convert("America/New_York") + pd.Timedelta(hours=6)
    return et.dt.normalize().dt.tz_localize(None)


def load(root):
    files = sorted((CONTRACTS / root).glob(f"{root}_*.parquet"), key=lambda p: expiry_key(p.name))
    out = []
    for f in files:
        d = pd.read_parquet(f)
        if d.empty:
            continue
        d["timestamp"] = pd.to_datetime(d["timestamp"], utc=True)
        d = d.drop_duplicates("timestamp").sort_values("timestamp")
        d["tdate"] = trade_date(d["timestamp"])
        out.append((f.stem, d.set_index("timestamp")))
    return out


def stitch(root):
    cs = load(root)
    if len(cs) < 2:
        print(f"{root}: need >= 2 contracts, have {len(cs)}")
        return
    names = [n for n, _ in cs]
    vol = pd.DataFrame({n: d.groupby("tdate")["volume"].sum() for n, d in cs}).fillna(0.0)
    days = vol.index
    # front contract per trade date, from the PREVIOUS date's volume, forward-only in expiry order
    order = {n: i for i, n in enumerate(names)}
    cur = int(np.argmax(vol.iloc[0].values))
    front = []
    for i, day in enumerate(days):
        if i > 0:
            prev = vol.iloc[i - 1].values
            best = int(np.argmax(prev))
            if prev[best] > 0 and best > cur and prev[best] > prev[cur]:
                cur = best
        front.append(cur)
    front = pd.Series(front, index=days)

    pieces, rolls = [], []
    for k, (n, d) in enumerate(cs):
        mine = d[d["tdate"].map(front) == order[n]]
        if not mine.empty:
            pieces.append(mine.assign(contract=n))
    cont = pd.concat(pieces).sort_index()
    cont = cont[~cont.index.duplicated()]

    # roll gaps
    chg = cont["contract"] != cont["contract"].shift()
    adj = pd.Series(1.0, index=cont.index)
    cum = 1.0
    cdict = dict(cs)
    for ts in cont.index[chg][1:][::-1]:
        i = cont.index.get_loc(ts)
        frm, to = cont["contract"].iloc[i - 1], cont["contract"].iloc[i]
        a, b = cdict[frm]["close"], cdict[to]["close"]
        common = a.index.intersection(b.index)
        common = common[common < ts]
        if len(common) == 0:
            ratio, gap = 1.0, 0.0
        else:
            t = common[-1]
            ratio, gap = float(b.loc[t] / a.loc[t]), float(b.loc[t] - a.loc[t])
        rolls.append({"switch_utc": ts, "from": frm, "to": to, "ratio": ratio, "gap_points": gap})
    rolls = rolls[::-1]
    # ratio-adjust: everything BEFORE a roll is scaled by that roll's ratio (cumulative, newest first)
    r = pd.Series(1.0, index=cont.index)
    cum = 1.0
    for rl in reversed(rolls):
        cum *= rl["ratio"]
        r[r.index < rl["switch_utc"]] *= rl["ratio"]
    OUT.mkdir(parents=True, exist_ok=True)
    un = cont[["open", "high", "low", "close", "volume", "contract"]]
    un.reset_index().to_parquet(OUT / f"{root}_1m_unadj.parquet", index=False)
    ra = un.copy()
    for c in ("open", "high", "low", "close"):
        ra[c] = ra[c] * r
    ra.reset_index().to_parquet(OUT / f"{root}_1m_ratio.parquet", index=False)
    pd.DataFrame(rolls).to_csv(OUT / f"{root}_rolls.csv", index=False)
    span = f"{cont.index[0].date()} -> {cont.index[-1].date()}"
    gaps = pd.DataFrame(rolls)["gap_points"]
    print(f"{root}: {len(cont):,} bars, {span}, {len(rolls)} rolls, median |gap| {gaps.abs().median():.2f} pts "
          f"({len(names)} contracts)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("roots", nargs="*")
    a = ap.parse_args()
    roots = a.roots or sorted(p.name for p in CONTRACTS.iterdir() if p.is_dir())
    for r in roots:
        stitch(r)


if __name__ == "__main__":
    main()
