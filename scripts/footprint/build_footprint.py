"""One day's footprint from NT8 data, by hand. For the every-day feed use footprint_capture.py (start_footprint_capture.bat).

    # a past day from the recorder (bid/ask matched) or from NT8 tick history (tick rule); --push --final stores it on the site
    python scripts/footprint/build_footprint.py --source live --instrument "NQ 12-26" --day 2026-11-09 --push --final
    python scripts/footprint/build_footprint.py --source hist --instrument "NQ 12-26" --day 2026-10-30 --push --final

    # convert an older nt8_footprint.py output (5-minute rows) without the raw ticks
    python scripts/footprint/build_footprint.py --from-json analysis/output/footprint/NQ_12-26_2026-10-30_nt8_tickrule.json

Which side a trade hit:
  live  (recorder files <instrument>/<day>_ticks_v2.csv): a trade at or above the stored ask is a buy, at or below the bid a sell.
        Inside the spread or with no quote, the tick rule decides. The counts of each go in the file.
  hist  (analysis/output/nt8/<INST>_tick.csv from nt8_pull.py --bar-type tick): no quotes, tick rule only. Agrees with quote
        matching on minute direction but understates size.
Times are the exchange's own, UTC. Output: analysis/output/footprint/days/fp_<SYM>_<day>.json (gitignored).
Descriptive order flow, not a signal.
"""
import argparse, json, os, sys, time, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "analysis/output/footprint/days"
LIVE_DIRS = [Path(os.environ.get("FOOTPRINT_LIVE_DIR") or (Path(os.environ.get("LOCALAPPDATA", Path.home())) / "MacroFXModel" / "nt8_live")), ROOT / "analysis/output/nt8_live"]
BASE = os.environ.get("MACROFX_BASE", "https://macrofxmodel-production.up.railway.app")
TICK = {"NQ": 0.25, "MNQ": 0.25, "ES": 0.25, "MES": 0.25, "YM": 1.0, "MYM": 1.0, "RTY": 0.1, "M2K": 0.1,
        "GC": 0.1, "MGC": 0.1, "CL": 0.01, "MCL": 0.01, "6E": 0.00005, "6J": 0.0000005, "6B": 0.0001}
MAX_PUSH = 900_000   # bytes; above this the push is rebinned to 5-minute bars so it fits a live push


def sym_of(inst):
    return inst.replace("_", " ").split(" ")[0]


def tick_rule(price):
    s = np.sign(np.diff(price, prepend=price[0] if len(price) else 0.0))
    return pd.Series(s).replace(0, np.nan).ffill().fillna(0).to_numpy()


def load_live(inst, day):
    """Recorder rows for `day` by exchange time. Files roll on arrival time, so the next day's file is read too."""
    name = inst.replace(" ", "_")
    d = next((x / name for x in LIVE_DIRS if (x / name / f"{day}_ticks_v2.csv").exists()), LIVE_DIRS[0] / name)
    nxt = (datetime.fromisoformat(day) + timedelta(days=1)).strftime("%Y-%m-%d")
    parts = [pd.read_csv(f) for f in (d / f"{day}_ticks_v2.csv", d / f"{nxt}_ticks_v2.csv") if f.exists()]
    if not parts:
        sys.exit(f"no recorder file {d / (day + '_ticks_v2.csv')} (start it with nt8_record.py start)")
    t = pd.concat(parts)
    t = t[t["type"].astype(str).str.lower() == "last"].copy()
    t["t"] = pd.to_datetime(t.exch_time, utc=True, errors="coerce")
    t = t[t.t.dt.strftime("%Y-%m-%d") == day].sort_values("t", kind="stable").reset_index(drop=True)
    px, bid, ask = t.price.to_numpy(float), t.bid.to_numpy(float), t.ask.to_numpy(float)
    tr = tick_rule(px)
    have = (bid > 0) & (ask > 0) & (ask >= bid)
    q = np.where(have & (px >= ask), 1, np.where(have & (px <= bid), -1, 0))
    t["side"] = np.where(q != 0, q, tr)
    return t, dict(quote=int((q != 0).sum()), tick_fallback=int((q == 0).sum())), "quote"


def load_hist(inst, day):
    f = ROOT / "analysis/output/nt8" / f"{inst.replace(' ', '_')}_tick.csv"
    if not f.exists():
        sys.exit(f"no tick history {f} (pull it with nt8_pull.py --bar-type tick)")
    t = pd.read_csv(f); t["t"] = pd.to_datetime(t.timestamp, utc=True)
    t = t[t.t.dt.strftime("%Y-%m-%d") == day].sort_values("t", kind="stable").reset_index(drop=True)
    t["side"] = tick_rule(t.price.to_numpy(float))
    return t, dict(quote=0, tick_fallback=len(t)), "tick"


def build(t, tick, base=1):
    """Ticks with t, price, volume, side -> [[minuteOfDay, o, h, l, c, [[offTicks, sell, buy], ...]], ...]."""
    if t.empty:
        return []
    t = t.assign(m=(t.t.dt.hour * 60 + t.t.dt.minute) // base * base,
                 k=np.round(t.price.to_numpy(float) / tick).astype(np.int64),
                 buy=np.where(t.side > 0, t.volume, 0), sell=np.where(t.side < 0, t.volume, 0))
    ohlc = t.groupby("m").price.agg(["first", "max", "min", "last"])
    cells = t.groupby(["m", "k"])[["sell", "buy"]].sum().reset_index()
    out = []
    for m, g in cells.groupby("m"):
        o, h, l, c = ohlc.loc[m]
        lk = int(round(l / tick))
        rows = [[int(k - lk), int(s), int(b)] for k, s, b in zip(g.k, g.sell, g.buy) if s or b]
        out.append([int(m), float(o), float(h), float(l), float(c), rows])
    return out


def rebin(bars, tick, base):
    """Merge stored bars into `base`-minute bars (used to shrink a push)."""
    acc = {}
    for m, o, h, l, c, rows in bars:
        k = m // base * base
        a = acc.setdefault(k, [k, o, h, l, c, {}])
        a[2] = max(a[2], h); a[3] = min(a[3], l); a[4] = c
        lk = round(l / tick)
        for off, s, b in rows:
            x = a[5].setdefault(lk + off, [0, 0]); x[0] += s; x[1] += b
    out = []
    for k in sorted(acc):
        m, o, h, l, c, cells = acc[k]; lk = round(l / tick)
        out.append([m, o, h, l, c, [[p - lk, s, b] for p, (s, b) in sorted(cells.items())]])
    return out


def from_json(path):
    d = json.loads(Path(path).read_text())
    sym, tick, base = sym_of(d["instrument"]), TICK.get(sym_of(d["instrument"]), 0.25), d.get("bin_minutes", 5)
    mins = {int(x["t"][:2]) * 60 + int(x["t"][3:]): x for x in d["minutes"]}
    acc = {}
    for r in d["footprint"]:
        m = int(r["t"][:2]) * 60 + int(r["t"][3:])
        x = acc.setdefault(m, {}).setdefault(round(r["p"] / tick), [0, 0]); x[0] += r["sell"]; x[1] += r["buy"]
    bars = []
    for m in sorted(acc):
        sub = [mins[k] for k in range(m, m + base) if k in mins]
        ks = sorted(acc[m]); lk = ks[0]
        o = sub[0]["close"] if sub else lk * tick   # the old file has no per-minute open: first minute's close stands in
        h = max([x["high"] for x in sub] or [ks[-1] * tick]); l = min([x["low"] for x in sub] or [lk * tick])
        c = sub[-1]["close"] if sub else ks[-1] * tick
        lk = round(l / tick)
        bars.append([m, o, h, l, c, [[k - lk, s, b] for k, (s, b) in sorted(acc[m].items()) if s or b]])
    return dict(v=1, sym=sym, instrument=d["instrument"], day=d["day"], rule="tick", tick=tick, base=base,
                built=datetime.now(timezone.utc).isoformat(timespec="seconds"), counts=None, volume_check=d.get("volume_check"),
                note="converted from nt8_footprint.py output; bar open is the first minute's close", bars=bars)


def save(doc):
    SITE.mkdir(parents=True, exist_ok=True)
    f = SITE / f"fp_{doc['sym']}_{doc['day']}.json"
    f.write_text(json.dumps(doc, separators=(",", ":")))
    return f


def push(doc, final=False):
    body = doc
    if not final and len(json.dumps(doc, separators=(",", ":"))) > MAX_PUSH and doc["base"] < 5:
        body = {**doc, "base": 5, "bars": rebin(doc["bars"], doc["tick"], 5), "note": "rebinned to 5 minutes to fit the live push"}
    payload = json.dumps(dict(doc=body, final=final), separators=(",", ":")).encode()
    hdr = {"Content-Type": "application/json"}
    if os.environ.get("KV_WRITE_SECRET"):
        hdr["X-Auth-Token"] = os.environ["KV_WRITE_SECRET"]
    req = urllib.request.Request(f"{BASE}/api/footprint/push", data=payload, headers=hdr, method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.getcode(), len(payload)


def run_once(a, day):
    t, counts, rule = (load_live if a.source == "live" else load_hist)(a.instrument, day)
    sym = sym_of(a.instrument); tick = a.tick or TICK.get(sym, 0.25)
    doc = dict(v=1, sym=sym, instrument=a.instrument, day=day, rule=rule, tick=tick, base=a.base,
               built=datetime.now(timezone.utc).isoformat(timespec="seconds"), counts=counts,
               last_trade=t.t.iloc[-1].isoformat() if len(t) else None, bars=build(t, tick, a.base))
    f = save(doc)
    vol = int(t.volume.sum()) if len(t) else 0
    msg = f"{day} {sym} {rule}: {len(t)} trades, volume {vol}, {len(doc['bars'])} bars, classified {counts} -> {f.name}"
    if a.push:
        try:
            code, n = push(doc, a.final); msg += f" | push HTTP {code} ({n // 1024} KB)"
        except Exception as e:  # noqa: BLE001 — a failed push must not stop the watch loop
            msg += f" | push FAILED {e}"
    print(msg, flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--source", choices=["live", "hist"], default="live")
    ap.add_argument("--instrument", default="NQ 12-26", help='NT8 contract, e.g. "NQ 12-26"')
    ap.add_argument("--day", help="UTC date (default today)")
    ap.add_argument("--base", type=int, default=1, help="minutes per stored bar (the page can only merge upward)")
    ap.add_argument("--tick", type=float, help="tick size if the symbol is not in the table")
    ap.add_argument("--watch", type=int, help="rebuild every N seconds (today's file, live source)")
    ap.add_argument("--push", action="store_true", help=f"POST to {BASE}/api/footprint/push")
    ap.add_argument("--final", action="store_true", help="with --push: a finished day, stored on the site for good")
    ap.add_argument("--from-json", help="convert an nt8_footprint.py output file instead")
    a = ap.parse_args()
    if a.from_json:
        doc = from_json(a.from_json); print("saved", save(doc), len(doc["bars"]), "bars")
        if a.push: print("push", push(doc, a.final))
        return
    if not a.watch:
        return run_once(a, a.day or datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    while True:
        try:
            run_once(a, a.day or datetime.now(timezone.utc).strftime("%Y-%m-%d"))
        except SystemExit as e:
            print("waiting:", e, flush=True)
        except Exception as e:  # noqa: BLE001
            print("build failed:", e, flush=True)
        time.sleep(a.watch)


if __name__ == "__main__":
    main()
