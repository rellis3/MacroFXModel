#!/usr/bin/env python3
"""oi-monthly-vs-full (EXPLORATORY, not pre-registered, 2026-11-26): summarise compare.mjs rows.
    python scripts/oi-monthly-vs-full/score.py <rows.jsonl> <outDir>
Distances are |full - monthly-only| in units of that day's forecast σ (one day's move). 0.25σ = the touch tolerance of the line studies.
'missing' = the monthly-only build has no line of that type (or could not be built at all: no standard expiry in the capture that day).
"""
import json
import sys
from pathlib import Path

import numpy as np

rows = [json.loads(l) for l in open(sys.argv[1], encoding="utf-8")]
OUT = Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
ORDER = ["XAU/USD", "EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD", "USD/CHF", "NAS100_USD", "SPX500_USD", "US30_USD", "US2000_USD"]
INVERTED = {"USD/JPY", "USD/CAD", "USD/CHF"}
TYPES = ["call_wall", "put_wall", "gamma_peak", "zero_gamma", "gex_flip", "vanna_flip", "charm_flip", "max_pain"]


def top(levels, t):
    c = [l for l in (levels or []) if l["type"] == t]
    if not c:
        return None
    s = [l for l in c if l.get("strength") is not None]
    return (max(s, key=lambda l: l["strength"]) if s else c[0])["price"]


def summ(d):
    """d: list of distances in σ, None = missing."""
    n = len(d)
    if not n:
        return None
    x = np.array([v for v in d if v is not None], float)
    miss = n - len(x)
    if not len(x):
        return {"n": n, "missingPct": 100.0}
    return {"n": n, "missingPct": round(100 * miss / n, 1), "medianSig": round(float(np.median(x)), 3), "p90Sig": round(float(np.percentile(x, 90)), 3),
            "within0_1": round(100 * float(np.sum(x <= 0.1)) / n, 1), "within0_25": round(100 * float(np.sum(x <= 0.25)) / n, 1)}


res = {"exploratory": True, "note": "Exploratory, not pre-registered. Own QuikStrike capture, weekdays 2026-08-20..2026-11-23. Distances in forecast σ; within-% counts missing as a miss.", "instruments": {}}
for sk in ORDER:
    R = [r for r in rows if r["sk"] == sk]
    if not R:
        continue
    built = [r for r in R if "err" not in r["mon"]]
    sh = np.array([1 - r["stdShare"] for r in R])
    o = {"dates": len(R), "monthlyBuiltPct": round(100 * len(built) / len(R), 1),
         "weeklyDailyOiShare": {"median": round(float(np.median(sh)), 3), "p10": round(float(np.percentile(sh, 10)), 3), "p90": round(float(np.percentile(sh, 90)), 3)},
         "codesVia": {k: sum(1 for r in R if r["codesVia"] == k) for k in ("header", "ivterm")},
         "unknownColumnDates": sum(1 for r in R if r["unknownCols"] > 0),
         "stdCodesSeen": sorted({c for r in R for c in r["stdCodes"]})}
    # profile lines (strongest book), strongest line of each type
    prof = {}
    for t in TYPES:
        d = []
        for r in R:
            sig = r["sigma"]
            f = r["full"]["zeroGamma"] if t == "zero_gamma" else top(r["full"]["levels"], t)
            if f is None:
                continue
            if "err" in r["mon"]:
                d.append(None); continue
            m = r["mon"]["zeroGamma"] if t == "zero_gamma" else top(r["mon"]["levels"], t)
            d.append(None if m is None else abs(f - m) / sig)
        prof[t] = summ(d)
    o["profileStrongest"] = prof
    # the same, only on dates where a standard expiry was in the capture (indices: the capture's matrix reaches ~30 DTE, so the quarterly is absent ~2/3 of days)
    pb = {}
    for t in TYPES:
        d = []
        for r in built:
            f = r["full"]["zeroGamma"] if t == "zero_gamma" else top(r["full"]["levels"], t)
            if f is None:
                continue
            m = r["mon"]["zeroGamma"] if t == "zero_gamma" else top(r["mon"]["levels"], t)
            d.append(None if m is None else abs(f - m) / r["sigma"])
        pb[t] = summ(d)
    o["profileStrongestWhenBuilt"] = pb
    sb = np.array([1 - r["stdShare"] for r in built]) if built else np.array([np.nan])
    o["weeklyDailyOiShareWhenBuilt"] = round(float(np.nanmedian(sb)), 3)
    # profile lines, every drawn line: nearest monthly-only line of the same type
    st = {}
    for t in TYPES:
        if t == "zero_gamma":
            continue
        d = []
        for r in R:
            sig = r["sigma"]
            fl = [l["price"] for l in r["full"]["levels"] or [] if l["type"] == t]
            ml = [] if "err" in r["mon"] else [l["price"] for l in r["mon"]["levels"] or [] if l["type"] == t]
            for p in fl:
                d.append(min(abs(p - q) for q in ml) / sig if ml else None)
        st[t] = summ(d)
    o["profileEveryLine"] = st
    both = [r for r in built if r["full"]["regime"] and r["mon"]["regime"]]
    o["regimeAgreePct"] = round(100 * sum(r["full"]["regime"] == r["mon"]["regime"] for r in both) / len(both), 1) if both else None
    o["hedgeMapOn"] = {"full": round(100 * np.mean([r["full"]["hedgeOn"] for r in R]), 1), "monthly": round(100 * np.mean([r["mon"].get("hedgeOn", False) for r in R]), 1)}
    o["book"] = {"full": {}, "monthly": {}}
    for r in R:
        o["book"]["full"][r["full"]["book"]] = o["book"]["full"].get(r["full"]["book"], 0) + 1
        b = r["mon"].get("book", "not built")
        o["book"]["monthly"][b] = o["book"]["monthly"].get(b, 0) + 1
    # all-expiry aggregate (every column summed), full vs standard-only
    agg = {}
    for k in ("callWall", "putWall", "maxPain"):
        d = []
        for r in R:
            if not r["aggAll"]:
                continue
            a, b = r["aggAll"][k], (r["aggStd"] or {}).get(k)
            if a is None:
                continue
            if b is None:
                d.append(None); continue
            d.append(abs(a - b) / r["sigma"])
        agg[k] = summ(d)
    d = []
    for r in R:
        if r["full"]["allFlip"] is None:
            continue
        m = None if "err" in r["mon"] else r["mon"]["allFlip"]
        d.append(None if m is None else abs(r["full"]["allFlip"] - m) / r["sigma"])
    agg["allExpiryGammaFlip"] = summ(d)
    o["aggregate"] = agg
    res["instruments"][sk] = o

(OUT / "results.json").write_text(json.dumps(res, indent=1))
for sk, o in res["instruments"].items():
    p, a = o["profileStrongest"], o["aggregate"]
    f = lambda s: "—" if not s else f"{s.get('medianSig', '—')}/{s.get('p90Sig', '—')} {s.get('within0_25', 0)}% m{s['missingPct']}"
    print(f"{sk:11} n{o['dates']} built{o['monthlyBuiltPct']}% wkShare {o['weeklyDailyOiShare']['median']} regime {o['regimeAgreePct']} | "
          + " ".join(f"{t}:{f(p[t])}" for t in ("call_wall", "put_wall", "gamma_peak", "zero_gamma", "vanna_flip", "max_pain"))
          + f" || AGG cw {f(a['callWall'])} pw {f(a['putWall'])} mp {f(a['maxPain'])} flip {f(a['allExpiryGammaFlip'])}")
