"""Stage 2 look for the noise-threshold map: charts for vol-layer-system.html (Stop orders tab). Nothing scored.

    python scripts/noise-threshold/look.py  ->  backtest-data/vol-layer/noise-look.json
Reads analysis/output/noise-threshold/{map.json, entries.parquet}. Discovery window only (2016-10 .. 2022).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/noise-threshold")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import build as B  # noqa: E402

WEB = ROOT / "backtest-data/vol-layer"
# Words written after reading map.json (2026-11-10); numbers quoted from it.
INTRO = [
 "217,184 random entries on 34 instruments, 2016-10 to 2022, each taken long and short (1.3M rows). 2023 to the lockbox is not looked at.",
 "Read: the excess is tiny everywhere. All instruments held to 21:00: -0.002σ at every size from 0.05σ to 1σ. A random walk gives 0. The median spread is 0.016-0.044σ, bigger than almost every excess.",
 "FX majors lean slightly below 0 (adverse moves keep going a little: -0.007σ at 0.25σ, -0.025σ at 1σ). Range-bound commodity crosses lean above 0 (AUDNZD +0.031σ). USDJPY is the most negative (-0.028σ).",
 "The sign flips by year: +0.001 to +0.005σ in 2016-2018, -0.001 to -0.009σ in 2019-2022 (at 0.25σ). C.OG's look-back windows would chase that flip.",
 "Late entries (16:00-17:00) show +0.01 to +0.02σ, but they have little time left, so a hit there is mostly reversion into 21:00. Treat as a timing effect, not a threshold.",
 "Stops are touched 2-8 points less often than a random walk says: moves come in bursts, so quiet days touch less and loud days go further.",
 "What it means: for a random entry there is no market-wide noise threshold worth paying a spread for. Where to put a stop then depends on the system's own entries, which is C.OG's point: map YOUR trade distribution first."
]
CLS = {"fx_majors": "FX majors", "fx_crosses": "FX crosses", "indices": "Indices", "gold": "Gold"}
SHORT = {"fx_majors": "Maj", "fx_crosses": "Cross", "indices": "Idx", "gold": "Gold"}
HZN = {"h60": "60 minutes", "h240": "4 hours", "eod": "To 21:00"}


def curve(cells, kind, key, hz):
    rows = sorted((c for c in cells if c["kind"] == kind and c["key"] == key and c["hz"] == hz and "excess" in c), key=lambda c: c["d"])
    return rows


def shots(E, n=12):
    """Seeded entries whose long side went at least 0.25 sigma against by 21:00: the trades a 0.25-sigma stop would cut."""
    F = E[(E.hz == "eod") & (E.side == "long") & (E.mae >= 0.25)]
    pick = F.sample(n, random_state=20261110)
    out = []
    for sym, g in pick.groupby("inst"):
        df = pd.read_parquet(B.BA / f"{B.BA_KEY.get(sym, sym.lower())}_m1.parquet", columns=["time", "close"])
        idx = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True)).tz_convert("Europe/London").tz_localize(None)
        codes, uniq = pd.factorize(idx.normalize())
        d_, mins = np.asarray(uniq.strftime("%Y-%m-%d"))[codes], (idx.hour * 60 + idx.minute).to_numpy()
        sig = pd.read_csv(B.HIST / f"{sym}.csv", usecols=["date", "live_sig_used"]).set_index("date").live_sig_used / 100
        for r in g.itertuples():
            m = (d_ == r.date) & (mins >= r.minute) & (mins <= B.CLOSE)
            c, t = df.close.to_numpy()[m], mins[m]
            if len(c) < 10:
                continue
            path = [[int(tt - r.minute), round(float(np.log(x / c[0]) / sig[r.date]), 3)] for tt, x in zip(t[::5], c[::5])]
            out.append({"inst": sym, "date": r.date, "side": f"long at {r.minute // 60:02d}:{r.minute % 60:02d}, went {r.mae:.2f}σ against",
                        "r": round(float(r.final), 2), "unit": "σ at 21:00", "stop": -0.25, "target": None, "path": path})
    return sorted(out, key=lambda s: s["date"])


def main():
    M = json.loads((B.OUT / "map.json").read_text(encoding="utf-8"))
    cells = M["cells"]
    E = pd.read_parquet(B.OUT / "entries.parquet")
    charts = []
    charts.append({"type": "lines", "title": "Excess by size of the adverse move, held to 21:00", "unit": "σ (0 = random walk)", "xlabel": "σ against",
                   "note": "Each point: trades that went d against at some point, their average end plus d. Above 0: they tend to come back (noise). Below 0: they keep going (information).",
                   "series": [{"name": CLS[k], "points": [[c["d"], round(c["excess"], 4)] for c in curve(cells, "class", k, "eod")]} for k in CLS if curve(cells, "class", k, "eod")]})
    for k in CLS:
        rows = curve(cells, "class", k, "eod")
        if rows:
            charts.append({"type": "bars", "title": f"{CLS[k]}: excess with 95% range, held to 21:00", "unit": "σ", "ref": 0,
                           "note": "Date-block bootstrap. Hits counted once per side.",
                           "rows": [{"label": f"{c['d']}σ ({c['hits']:,})", "value": round(c["excess"], 4), "lo": round(c["lo"], 4), "hi": round(c["hi"], 4)} for c in rows if "lo" in c]})
    allc = {hz: {} for hz in B.HZ}
    for hz in B.HZ:
        for d in B.D_GRID:
            hit = E[(E.hz == hz) & (E.mae >= d)]
            if len(hit) > 100:
                allc[hz][d] = round(float((hit.final + d).mean()), 4)
    charts.append({"type": "lines", "title": "By holding horizon, all instruments", "unit": "σ", "xlabel": "σ against",
                   "note": "Longer holds give an adverse move more time to come back or to run.",
                   "series": [{"name": HZN[hz], "points": [[d, v] for d, v in allc[hz].items()]} for hz in B.HZ]})
    charts.append({"type": "lines", "title": "By entry time (London), held to 21:00", "unit": "σ", "xlabel": "σ against",
                   "note": "The late bucket has the least time left, so few trades reach the bigger sizes.",
                   "series": [{"name": b, "points": [[c["d"], round(c["excess"], 4)] for c in curve(cells, "bucket", b, "eod")]} for _, _, b in B.BUCKET[:3]]})
    rr = [c for c in cells if c["kind"] == "class" and c["hz"] == "eod"]
    charts.append({"type": "groups", "title": "How often a stop is touched: real vs a random walk, held to 21:00", "names": ["Real", "Random walk"], "unit": "share of entries",
                   "note": "Random walk = 2Φ(-d/√V), V = the share of the day's variance left (each instrument's own 2016-2022 profile). This checks the measuring stick, not a result.",
                   "rows": [{"label": f"{SHORT[c['key']]} {c['d']}", "values": [c["reach"], c["reach_rw"]]} for c in rr if c["d"] in (0.25, 0.5)]})
    yrs = [y for y in M["years"] if y["hz"] == "eod" and y["d"] in (0.25, 0.5)]
    charts.append({"type": "groups", "title": "Year by year, all instruments, held to 21:00", "names": ["0.25σ against", "0.5σ against"], "unit": "σ excess",
                   "note": "Stability check for C.OG's look-back question. 2016 is from late October only.",
                   "rows": [{"label": y, "values": [next(r["excess"] for r in yrs if r["year"] == y and r["d"] == 0.25), next(r["excess"] for r in yrs if r["year"] == y and r["d"] == 0.5)]}
                            for y in sorted({r["year"] for r in yrs})]})
    inst = sorted((c for c in cells if c["kind"] == "inst" and c["hz"] == "eod" and c["d"] == 0.25 and "excess" in c), key=lambda c: c["excess"])
    charts.append({"type": "bars", "title": "Each instrument at 0.25σ against, held to 21:00", "unit": "σ", "ref": 0,
                   "note": "No intervals here: one instrument is too few days to read alone. Look for a pattern, not a winner.",
                   "rows": [{"label": c["key"], "value": round(c["excess"], 4)} for c in inst]})
    sp = M["spread_sigma_median"]
    charts.append({"type": "bars", "title": "Median spread at entry, in daily σ", "unit": "σ", "ref": 0,
                   "note": "What a round trip costs before any stop or hold. Any excess smaller than this cannot pay.",
                   "rows": [{"label": CLS.get(k, k), "value": v} for k, v in sp.items()]})
    ov = json.loads((B.OUT / "overshoot.json").read_text(encoding="utf-8"))
    wd = [r for r in ov if r["weekend"] == 0]
    charts.append({"type": "bars", "title": "Kou-Wang check: typical overshoot past a stop that gapped, weekdays", "unit": "σ past the stop (median)", "ref": 0,
                   "note": "Stop-risk records, all years, mid prices. Kou-Wang say the overshoot should not depend on where the stop is. The typical one does not (about 0.004σ at every size). The tail does: p99 0.28σ at a 0.25σ stop, 1.05σ at 2σ, because far stops are reached on violent days.",
                   "rows": [{"label": f"{r['d']}σ, p99 {r['p99']:.2f}", "value": r["p50"]} for r in wd]})
    charts.append({"type": "groups", "title": "Expected gap cost per stopped trade, in R", "names": ["Weekday", "Over a weekend"], "unit": "R",
                   "note": "Gap rate x mean overshoot / stop size. Within the week gaps cost almost nothing at any size. Over a weekend a tight stop loses about 0.18R extra per stop-out.",
                   "rows": [{"label": f"{r['d']}σ", "values": [round(r["gap_rate"] * r["mean"] / r["d"], 4),
                                                              round(next(w["gap_rate"] * w["mean"] / w["d"] for w in ov if w["weekend"] == 1 and w["d"] == r["d"]), 4)]} for r in wd]})
    charts.append({"type": "trades", "title": "12 entries by a fixed seed that went 0.25σ against: what happened next", "unit": "σ from entry",
                   "note": "Long side shown. The orange dashed line is where a 0.25σ stop would sit. Picked by seed among trades that touched it, not by result.", "trades": shots(E)})
    n = M["n_entries"]
    WEB.mkdir(parents=True, exist_ok=True)
    (WEB / "noise-look.json").write_text(json.dumps({"id": "noise-look", "window": M["window"], "n_entries": n, "instruments": len(M["instruments"]), "charts": charts, "intro": INTRO},
                                                    default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    print(json.dumps({k: v for k, v in allc.items()}, indent=1))


if __name__ == "__main__":
    main()
