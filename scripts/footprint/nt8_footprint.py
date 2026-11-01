"""NQ footprint from NT8 trade ticks (millisecond stamps), signed by the tick rule. Descriptive order flow, not a signal.

    python nt8_bridge/nt8_pull.py --instrument "NQ 12-26" --bar-type tick --start 2026-10-30 --end 2026-10-31
    python scripts/footprint/nt8_footprint.py 2026-10-30 [--instrument NQ_12-26] [--bin 5]

Why the tick rule: the bridge serves no usable bid/ask history yet, so a trade is bought if it printed above the previous
different price, sold if below, and an unchanged price keeps the last sign. On 10 minutes of the 2026-10-30 open this
agreed with quote matching (IB Gateway) on the sign of every minute (corr 0.90) but is smaller in size, so read it as a
conservative view. Volume is checked against NT8's own 1-minute bars. Times UTC. Output: analysis/output/footprint/.
"""
import argparse, json
from pathlib import Path
import numpy as np, pandas as pd

ROOT = Path(__file__).resolve().parents[2]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("day"); ap.add_argument("--instrument", default="NQ_12-26"); ap.add_argument("--bin", type=int, default=5)
    a = ap.parse_args()
    d = ROOT / "analysis/output/nt8"
    t = pd.read_csv(d / f"{a.instrument}_tick.csv"); t["t"] = pd.to_datetime(t.timestamp)
    t = t[t.t.dt.strftime("%Y-%m-%d") == a.day].sort_values("t", kind="stable").reset_index(drop=True)
    s = np.sign(t.price.diff().fillna(0)).replace(0, np.nan).ffill().fillna(0)
    t["buy"] = np.where(s > 0, t.volume, 0); t["sell"] = np.where(s < 0, t.volume, 0)
    t["m"] = t.t.dt.floor("1min")
    g = t.groupby("m").agg(buy=("buy", "sum"), sell=("sell", "sum"), vol=("volume", "sum"), close=("price", "last"), high=("price", "max"), low=("price", "min"))
    g["delta"] = g.buy - g.sell; g["cvd"] = g.delta.cumsum()
    chk = None
    bf = d / f"{a.instrument}_1m.csv"
    if bf.exists():
        b = pd.read_csv(bf); b["t"] = pd.to_datetime(b.timestamp); b = b.set_index("t").volume
        j = pd.concat([g.vol, b.reindex(g.index)], axis=1, keys=["ticks", "bars"]).dropna()
        chk = dict(minutes=len(j), tick_volume=int(j.ticks.sum()), bar_volume=int(j.bars.sum()), pct_diff=round(float(j.ticks.sum() / j.bars.sum() - 1) * 100, 2))
    t["bin"] = t.t.dt.floor(f"{a.bin}min"); t["p"] = t.price
    fp = t.groupby(["bin", "p"]).agg(buy=("buy", "sum"), sell=("sell", "sum")).reset_index()
    out = dict(day=a.day, instrument=a.instrument, rule="tick rule", bin_minutes=a.bin, volume_check=chk,
               minutes=[dict(t=k.strftime("%H:%M"), buy=int(r.buy), sell=int(r.sell), delta=int(r.delta), cvd=int(r.cvd), close=r.close, high=r.high, low=r.low) for k, r in g.iterrows()],
               footprint=[dict(t=r.bin.strftime("%H:%M"), p=float(r.p), buy=int(r.buy), sell=int(r.sell)) for r in fp.itertuples()])
    o = ROOT / "analysis/output/footprint"; o.mkdir(parents=True, exist_ok=True)
    f = o / f"{a.instrument}_{a.day}_nt8_tickrule.json"; f.write_text(json.dumps(out))
    # small file the OI Lab page reads: [hhmm UTC, buy, sell, close] per minute, plus an index of the days available
    sd = ROOT / "analysis/output/footprint/site"; sd.mkdir(parents=True, exist_ok=True)
    (sd / f"NQ_{a.day}.json").write_text(json.dumps(dict(day=a.day, rule="tick rule", volume_check=chk, v=[[k.strftime("%H%M"), int(r.buy), int(r.sell), r.close] for k, r in g.iterrows()]), separators=(",", ":")))
    days = sorted(x.stem[3:] for x in sd.glob("NQ_*.json")); (sd / "index.json").write_text(json.dumps(days))
    print("saved", f, "| volume check", chk, "| buy", int(g.buy.sum()), "sell", int(g.sell.sum()), "delta", int(g.delta.sum()))


if __name__ == "__main__":
    main()
