"""Proof pack for jump-after: checks with plain notes, and charts for the Vol-Layer page.

    python scripts/jump-after/proof.py   ->  backtest-data/vol-layer/jump-after.json
Reads analysis/output/jump-after/{results,checks}.json and events.parquet. Re-fits the stop-through and intensity
models once more to split their gain by half (descriptive, not scored).
"""
from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history"), str(ROOT / "scripts/jump-after")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import run as R  # noqa: E402
from forecast_record import klass  # noqa: E402

warnings.filterwarnings("ignore")
OUT, WEB = R.OUT, ROOT / "backtest-data/vol-layer"
NAMES = {"unscheduled": "No news", "scheduled": "News", "all_34": "All", "common": "Market-wide", "own": "Own"}


def bar(label, c, key="mean", lo="lo", hi="hi"):
    if isinstance(c[key], list):
        return {"label": label, "value": round(c[key][0], 4), "lo": round(c[key][1], 4), "hi": round(c[key][2], 4)}
    return {"label": label, "value": round(c[key], 4), "lo": round(c[lo], 4), "hi": round(c[hi], 4)}


def _short(t, f, h):
    return f"{'Stop' if t.startswith('Stop') else 'Burst'} {dict([('all four', 'all'), ('old jump share only', 'old'), ('burst counts only', 'counts')])[f]} {'19-22' if h.startswith('2019') else '22-26'}"


SHORT = {(t, f, h): _short(t, f, h) for t in ("Stop-through 0.5σ", "Burst today") for f in ("all four", "old jump share only", "burst counts only") for h in ("2019-Aug 2022", "Aug 2022-2026")}


def halves():
    X = pd.read_parquet(OUT / "sessions.parquet")
    X = X[X.event.ne("unknown")].copy()
    X["klass"] = X.inst.map(klass)
    for c in sorted(X.klass.unique()):
        X[f"c_{c}"] = (X.klass == c).astype(float)
    for t in ("FOMC", "NFP", "CPI", "high"):
        X[f"e_{t}"] = (X.event == t).astype(float)
    X["monday"] = (pd.to_datetime(X.date).dt.dayofweek == 0).astype(float)
    bench = [c for c in X.columns if c.startswith(("c_", "e_"))] + ["monday", "regime"]
    feats = ["lam_un", "lam_sch", "flag_last", "js20"]
    rows = []
    for nm, (tc, y) in {"Stop-through 0.5σ": ("y", 0.5), "Burst today": ("flag", None)}.items():
        Xy = X.copy()
        if y is not None:
            Xy["y"] = (Xy.big >= y).astype(float)
        for fs, fl in ((feats, "all four"), (["js20"], "old jump share only"), (feats[:3], "burst counts only")):
            T = R.logit_cell(Xy.dropna(subset=feats), tc, fs, bench)
            for h, part in (("2019-Aug 2022", T[T.date < "2022-08-21"]), ("Aug 2022-2026", T[T.date >= "2022-08-21"])):
                g = 1 - ((part.p1 - part[tc]) ** 2).sum() / ((part.p0 - part[tc]) ** 2).sum()
                rows.append({"target": nm, "features": fl, "half": h, "gain": round(float(g), 5)})
    return rows


def shots(E, n_each=6):
    F = E[(E.kind == "flag") & (E.ver == "x") & E.m60.notna()].copy()
    F["cojump"] = F.groupby(["date", "slot"]).inst.transform("size")
    rng = np.random.default_rng(20261109)
    pick = pd.concat([F[F.cojump >= 3].sample(n_each, random_state=rng.integers(1 << 31)),
                      F[F.cojump < 3].sample(n_each, random_state=rng.integers(1 << 31))])
    out = []
    for sym, g in pick.groupby("inst"):
        df = pd.read_parquet(R.BA / f"{R.BA_KEY.get(sym, sym.lower())}_m1.parquet", columns=["time", "close"])
        idx = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True)).tz_convert("Europe/London")
        d_, mins = idx.strftime("%Y-%m-%d"), (idx.hour * 60 + idx.minute).to_numpy()
        sig = pd.read_csv(R.HIST / f"{sym}.csv", usecols=["date", "live_sig_used"]).set_index("date").live_sig_used / 100
        for r in g.itertuples():
            end = (r.slot + 1) * 5
            m = (d_ == r.date) & (mins >= end - 30) & (mins <= end + 60)
            c, t = df.close.to_numpy()[m], mins[m]
            if len(c) < 20 or not (t <= end - 1).any():
                continue
            base = c[t <= end - 1][-1]
            path = [[int(tt - end), round(float(r.sign * np.log(x / base) / sig[r.date]), 3)] for tt, x in zip(t, c)]
            out.append({"inst": sym, "date": r.date, "side": f"{'Market-wide' if r.cojump >= 3 else 'Own'} burst, {r.size:.2f}σ, {int(r.cojump)} together",
                        "r": round(float(r.m60), 2), "unit": "σ", "stop": None, "target": None, "path": path})
    return sorted(out, key=lambda s: (not s["side"].startswith("Market"), s["date"]))


def main():
    res = json.loads((OUT / "results.json").read_text(encoding="utf-8"))
    ck = json.loads((OUT / "checks.json").read_text(encoding="utf-8"))
    E = pd.read_parquet(OUT / "events.parquet")
    for q, c in ck.items():
        if q.startswith("jump-after-path"):
            c["planted_large"]["how"] = "moved every price after each burst 0.20σ the burst's way, in a copy of the 1-minute tape, then re-ran the whole read"
            c["planted_min"]["how"] = "the same with 0.03σ, the smallest move worth having"
            c["shuffle"]["how"] = f"gave each 5-minute moment a random direction, so bursts that hit together stay together. 200 draws; {c['shuffle']['false_positive_rate']:.0%} of them looked significant, against 5% expected"
            c["rows"]["note"] = "First burst per instrument per session, 01:00-21:00 London."
            c["diagnostics"]["note"] = c["diagnostics"].get("why", "")
        else:
            c["planted_large"]["how"] = "made a fake outcome from the benchmark plus a known random feature worth about a 5% gain, then asked the model to find it"
            c["planted_min"]["how"] = "the same, worth about 0.5%, the smallest gain worth having"
            c["shuffle"]["how"] = "shuffled the jump features across sessions. Overfitting costs a little accuracy, so only a gain counts as a failure"
            c["rows"]["note"] = "Sessions 2019-2026 scored walk-forward. Earlier sessions only train."
            c["diagnostics"]["note"] = c["diagnostics"].get("why", "")
    x, a = res["reads"]["x"], res["reads"]["all"]
    d = res["descriptive"]
    hz = [0, 5, 15, 30, 60, 240]
    series = []
    for k in ("common", "own"):
        h = d["horizons"][k]
        pts = [[0, 0.0]] + [[m, round(h[f"m{m}"]["mean"] if m != 60 else x["path"][k]["mean"], 4)] for m in hz[1:]]
        series.append({"name": NAMES[k], "points": pts})
    charts = [
        {"type": "bars", "title": "Signed move 60 minutes after a burst, five scored groups", "unit": "σ (+ = carried on)", "ref": 0,
         "note": "Market-wide bursts carry on a little; own bursts give a little back. Neither clears the Holm correction for five groups.",
         "rows": [bar(NAMES[k], c) for k, c in x["path"].items()]},
        {"type": "groups", "title": "With and without the 21:00-01:00 rollover", "unit": "σ, 60 minutes", "names": ["Main, 01:00-21:00", "With rollover"],
         "note": "Almost the same either way. The 731 rollover bursts alone: -0.023σ [-0.098, +0.053].",
         "rows": [{"label": NAMES[k], "values": [round(x["path"][k]["mean"], 4), round(a["path"][k]["mean"], 4)]} for k in x["path"]]},
        {"type": "lines", "title": "Average path after the burst, market-wide vs own", "unit": "σ (+ = carried on)", "xlabel": "minutes",
         "note": "Own bursts give back about 0.025σ within 5 minutes and stay there. Market-wide bursts drift on for about 30 minutes.", "series": series},
        {"type": "bars", "title": "By size: thirds of the burst's own size", "unit": "σ, 60 minutes", "ref": 0,
         "note": f"Cut at {d['size_cuts_sigma'][0]}σ and {d['size_cuts_sigma'][1]}σ. Only large bursts carry on, and only market-wide ones. Descriptive, chosen before results but not scored.",
         "rows": [bar(k.capitalize(), c) for k, c in d["by_size_common_m60"].items()]},
        {"type": "bars", "title": "After spread: follow and fade, 60 minutes", "unit": "σ net", "ref": 0,
         "note": "Every cell is at or below zero after paying the spread at each end. Cost is about 0.05σ for a round trip.",
         "rows": [bar(f"{NAMES[k]} follow", c, "follow_net") for k, c in x["path"].items()] + [bar(f"{NAMES[k]} fade", c, "fade_net") for k, c in x["path"].items()]},
        {"type": "bars", "title": "Large market-wide bursts: follow net (not scored)", "unit": "σ net", "ref": 0,
         "note": "The closest thing to a trade. Its interval still includes zero, and the group was not one of the five scored.",
         "rows": [bar("Large mkt-wide", d["by_size_common_m60"]["large common"], "follow_net"), bar("Large, all", d["by_size_m60"]["large"], "follow_net")]},
    ]
    hv = halves()
    charts.append({"type": "bars", "title": "Stop-through and intensity gain, by half of the scored years", "unit": "Brier gain", "ref": 0.005,
                   "note": "Stop = stop-through at 0.5σ, Burst = a burst today. all = all four features, old = the old jump share alone, counts = burst counts alone. 19-22 = 2019 to Aug 2022. The stop-through gain is all in 2019-2022 and is mostly the old jump-share field. Burst clustering (intensity) holds in both halves.",
                   "rows": [{"label": SHORT[(r['target'], r['features'], r['half'])], "value": r["gain"]} for r in hv]})
    charts.append({"type": "trades", "title": "12 bursts by a fixed seed: 30 minutes before to 60 after", "unit": "σ, signed so up = carried on",
                   "note": "Six market-wide, six own. Picked by seed, not by result. The vertical line is the end of the burst bar.", "trades": shots(E)})
    WEB.mkdir(parents=True, exist_ok=True)
    (WEB / "jump-after.json").write_text(json.dumps({"id": "jump-after", "checks": ck, "charts": charts, "halves": hv}, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    print(json.dumps(hv, indent=1))


if __name__ == "__main__":
    main()
