"""ladder-event-layer-cb-fomc forward test (forge/LADDER_EVENT_LAYER_CB_FOMC_PREREG.md, pushed 770a99a1).

    python scripts/ladder-event-layer-cb-fomc/forward.py fetch   # cache site base levels + OANDA M5 mid (read-only)
    python scripts/ladder-event-layer-cb-fomc/forward.py score   # the ONE scoring; refuses to run twice

Window 2026-08-24 -> 2026-11-23. Base = the site's CFD QLIKE per-line levels (production API); layer 2 = base x mult
(js/ladderV2EventLayerCfdParams.json) on FOMC / own-central-bank decision days (bank calendar files); realised from
OANDA M5 mid, London 00:00-22:00, >= 120 bars.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis/output/ladder-event-layer-cb-fomc"
CACHE = OUT / "forward_cache"
API = "https://macrofxmodel-production.up.railway.app/api/vol-forecast/ladder-v2/levels"
D0, D1 = "2026-08-24", "2026-11-23"
SEED, B = 20261124, 2000
LINES = ("hl", "oh", "ol", "cup", "cdn")
TAUS = (50, 75, 90)
BANK = {"EUR": "EUR", "GBP": "GBP", "JPY": "JPY", "CAD": "CAD", "AUD": "AUD", "NZD": "NZD", "CHF": "CHF"}
LAYER = json.loads((ROOT / "js/ladderV2EventLayerCfdParams.json").read_text())
SITE = json.loads((ROOT / "js/ladderV2QlikeCfdParams.json").read_text())["instruments"]
DATES = json.loads((OUT / "bank_dates.json").read_text())


def oanda_key():
    k = os.environ.get("OANDA_KEY")
    if not k:
        for line in (ROOT / "RegimeV2/.env").read_text().splitlines():
            if line.startswith("OANDA_KEY="):
                k = line.split("=", 1)[1].strip().strip("\"'")
    return k


def fetch_m5(ins, key):
    host = "https://api-fxpractice.oanda.com"
    rows, start = [], pd.Timestamp("2026-08-23T00:00:00Z")
    while True:
        url = (f"{host}/v3/instruments/{ins}/candles?price=M&granularity=M5&count=5000"
               f"&from={start.strftime('%Y-%m-%dT%H:%M:%SZ')}")
        r = requests.get(url, headers={"Authorization": f"Bearer {key}"}, timeout=60)
        if r.status_code != 200:
            raise SystemExit(f"OANDA {ins} {r.status_code}: {r.text[:200]} (stopping: paid/credentialed API failure)")
        c = [x for x in r.json().get("candles", []) if x.get("complete")]
        if not c:
            break
        rows += [(x["time"], *(float(x["mid"][k]) for k in "ohlc")) for x in c]
        nxt = pd.Timestamp(c[-1]["time"]) + pd.Timedelta(minutes=5)
        if len(c) < 4999 or nxt > pd.Timestamp.now(tz="UTC"):
            break
        start = nxt
    d = pd.DataFrame(rows, columns=["time", "open", "high", "low", "close"])
    d.index = pd.to_datetime(d.pop("time"), utc=True)
    return d[~d.index.duplicated()].sort_index()


def fetch():
    CACHE.mkdir(parents=True, exist_ok=True)
    key = oanda_key()
    for sym, P in sorted(SITE.items()):
        f_lv, f_m5 = CACHE / f"levels_{sym}.json", CACHE / f"m5_{sym}.parquet"
        if not f_lv.exists():
            for attempt in range(3):
                r = requests.get(API, params={"calc": "qlike", "track": "cfd", "pair": sym.lower(), "from": D0, "to": D1}, timeout=180)
                if r.status_code == 200 and r.json().get("ok"):
                    f_lv.write_text(r.text)
                    break
                time.sleep(5)
            else:
                print(f"{sym}: site levels failed {r.status_code} {r.text[:150]}", flush=True)
                continue
        if not f_m5.exists():
            fetch_m5(P["oanda"], key).to_parquet(f_m5)
        print(f"{sym}: cached", flush=True)


def sessions(m):
    lt = m.index.tz_convert("Europe/London")
    x = m[(lt.hour < 22) & (lt.dayofweek < 5)].copy()
    x["date"] = x.index.tz_convert("Europe/London").strftime("%Y-%m-%d")
    g = x.groupby("date")
    s = pd.DataFrame({"o": g["open"].first(), "h": g["high"].max(), "l": g["low"].min(), "c": g["close"].last(), "n": g.size()})
    s = s[(s["n"] >= 120) & (s.index >= D0) & (s.index <= D1)]
    o = s["o"]
    soc = (s["c"] - o) / o * 100
    return pd.DataFrame({"hl": (s["h"] - s["l"]) / o * 100, "oh": (s["h"] - o) / o * 100, "ol": (o - s["l"]) / o * 100,
                         "cup": soc.where(soc > 0), "cdn": (-soc).where(soc < 0)})


def event_tag(sym):
    ccys = LAYER["instruments"][sym]["ccys"]
    tag = {d: "FOMC" for d in DATES["USD"]}
    for c in ccys:
        if c in BANK:
            for d in DATES[c]:
                tag[d] = "CB"                       # CB ranks above FOMC
    return tag


def pinball(x, lv):
    out = 0.0
    for j, t in enumerate(TAUS):
        u = x - lv[j]
        out += t / 100 * u if u >= 0 else (t / 100 - 1) * u
    return out / len(TAUS)


def score():
    done = OUT / "forward_results.json"
    if done.exists():
        raise SystemExit("forward test already scored once (prereg: one look); refusing to run twice")
    rows = []
    for sym in sorted(SITE):
        f_lv, f_m5 = CACHE / f"levels_{sym}.json", CACHE / f"m5_{sym}.parquet"
        if not (f_lv.exists() and f_m5.exists()):
            print(f"{sym}: missing cache, skipped", flush=True)
            continue
        days = json.loads(f_lv.read_text())["days"]
        R = sessions(pd.read_parquet(f_m5))
        tag = event_tag(sym)
        L2 = LAYER["instruments"][sym]["lines"]
        for d, rr in R.iterrows():
            if d not in days:
                continue
            b = tag.get(d, "none")
            for q in LINES:
                x = rr[q]
                if not np.isfinite(x) or f"{q}_p50" not in days[d]:
                    continue
                base = [days[d][f"{q}_p{t}"] for t in TAUS]
                mult = [L2[q]["mult"][b][str(t)] for t in TAUS] if b in ("CB", "FOMC") else [1.0, 1.0, 1.0]
                lay = [v * m for v, m in zip(base, mult)]
                rows.append(dict(sym=sym, date=d, line=q, tag=b, x=x, pb_base=pinball(x, base), pb_lay=pinball(x, lay),
                                 **{f"ob{t}": x > base[j] for j, t in enumerate(TAUS)},
                                 **{f"ol{t}": x > lay[j] for j, t in enumerate(TAUS)}))
    D = pd.DataFrame(rows)
    D.to_csv(OUT / "forward_rows.csv", index=False)
    ev = D[D["tag"].isin(["CB", "FOMC"])]
    cells = ev.groupby(["sym", "line"])
    edates = sorted(ev["date"].unique())

    def delta(sub):
        g = sub.groupby(["sym", "line"])[["pb_lay", "pb_base"]].sum()
        g = g[g["pb_base"] > 0]
        return float((g["pb_lay"] / g["pb_base"] - 1).mean() * 100)

    pt = delta(ev)
    rng = np.random.default_rng(SEED)
    by_date = {d: ev[ev["date"] == d] for d in edates}
    bs = []
    for _ in range(B):
        pick = rng.choice(edates, size=len(edates), replace=True)
        bs.append(delta(pd.concat([by_date[d] for d in pick])))
    ci = [float(np.quantile(bs, .05)), float(np.quantile(bs, .95))]
    v = "VALIDATED" if ci[1] < 0 else "NULL" if ci[0] > -0.5 else "UNDERPOWERED"
    allsess = delta(D)
    cov = {b: {f"base_p{t}": float(D[D.tag == b][f"ob{t}"].mean()) for t in TAUS} | {f"layer_p{t}": float(D[D.tag == b][f"ol{t}"].mean()) for t in TAUS}
           | {"n": int((D.tag == b).sum())} for b in ("CB", "FOMC", "none")}
    by_bucket = {b: delta(ev[ev.tag == b]) for b in ("CB", "FOMC") if (ev.tag == b).any()}
    by_line = {q: delta(ev[ev.line == q]) for q in LINES}
    res = dict(seed=SEED, window=[D0, D1], event_dates=edates, n_event_rows=int(len(ev)), n_cells=int(cells.ngroups),
               n_instruments=int(D["sym"].nunique()), delta_event_days=pt, ci90=ci, verdict=v, delta_all_sessions=allsess,
               by_bucket=by_bucket, by_line=by_line, coverage=cov)
    done.write_text(json.dumps(res, indent=1))
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    {"fetch": fetch, "score": score}[sys.argv[1]]()
