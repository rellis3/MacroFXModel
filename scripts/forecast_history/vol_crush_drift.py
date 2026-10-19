"""VOL CRUSH DRIFT — after a Fed/CPI day on which VIX falls >= 5%, do SPX500 and NQ keep rising?
(forge/VOL_CRUSH_DRIFT_PREREG.md)

Event days from calendar_events.csv (de-duplicated); VIX closes; New York-close daily bars. Entry at the event day's
close (VIX's 16:15 ET close is known before the 17:00 ET bar close), outcome = next close (and +3 closes).

    PYTHONPATH=. python scripts/forecast_history/vol_crush_drift.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

D1 = Path("analysis/output/ladder_candidates/d1")
OUT = Path("analysis/output/vol_crush_drift")
START, END = "2016-03-29", "2026-07-02"           # calendar coverage; lockbox (2026-08-21) not reached
EVENTS = {"Fed Interest Rate Decision": "FOMC", "Inflation Rate Month-over-Month": "CPI"}
INSTS = ["SPX500", "NQ"]
CRUSH = -0.05
REPS = 5000
rng = np.random.default_rng(20261019)


def bars(name):
    d = pd.DataFrame(json.loads((D1 / f"{name}.json").read_text()))
    d["d"] = pd.to_datetime(d.d)
    d = d.drop_duplicates("d").sort_values("d").set_index("d")
    d["r1"] = np.log(d.c.shift(-1) / d.c)
    d["r3"] = np.log(d.c.shift(-3) / d.c)
    return d


def vix():
    t = pd.read_csv("analysis/surfaces/cboe/VIX.csv")
    t.columns = [c.strip().upper() for c in t.columns]
    s = pd.Series(t.CLOSE.astype(float).to_numpy(), index=pd.to_datetime(t.DATE, format="%m/%d/%Y"))
    s = s[~s.index.duplicated()].sort_index()
    return np.log(s / s.shift(1))


def events():
    c = pd.read_csv("calendar_events.csv", encoding="latin-1", low_memory=False).drop_duplicates()
    c = c[(c.country == "United States") & c.event.isin(EVENTS)]
    c["d"] = pd.to_datetime(c.date)
    c["kind"] = c.event.map(EVENTS)
    c = c[(c.d >= START) & (c.d <= END)]
    return c.groupby("d").kind.agg(lambda k: "+".join(sorted(set(k))))


def boot_diff(a, b):
    a, b = np.asarray(a), np.asarray(b)
    if len(a) < 5 or len(b) < 5:
        return [None, None]
    ia = rng.integers(0, len(a), (REPS, len(a)))
    ib = rng.integers(0, len(b), (REPS, len(b)))
    return [round(float(v), 4) for v in np.percentile(a[ia].mean(1) - b[ib].mean(1), [2.5, 97.5]) * 100]


def main():
    dv = vix()
    ev = events()
    frames = {}
    for i in INSTS:
        b = bars(i)
        b = b[(b.index >= START) & (b.index <= END)].copy()
        b["dvix"] = dv.reindex(b.index)
        b["event"] = ev.reindex(b.index)
        prev_event = b.event.notna().shift(1, fill_value=False)
        b["group"] = np.select(
            [b.event.notna() & (b.dvix <= CRUSH), b.event.notna(), (b.dvix <= CRUSH) & ~prev_event],
            ["EC", "EN", "NC"], "OTHER")
        frames[i] = b[b.r1.notna() & b.dvix.notna()]

    def stats(sub=None, col="r1"):
        res = {}
        for i, b in frames.items():
            x = b if sub is None else b[sub(b)]
            g = {k: x.loc[x.group == k, col].to_numpy() for k in ("EC", "EN", "NC")}
            allr = x[col].dropna().to_numpy()
            res[i] = {"n": {k: int(len(v)) for k, v in g.items()},
                      "mean_pct": {k: round(float(np.nanmean(v)) * 100, 4) if len(v) else None for k, v in g.items()} | {"ALL": round(float(allr.mean()) * 100, 4)},
                      "D_EC_minus_NC": round(float(np.nanmean(g["EC"]) - np.nanmean(g["NC"])) * 100, 4) if len(g["EC"]) and len(g["NC"]) else None,
                      "D_ci": boot_diff(g["EC"][~np.isnan(g["EC"])], g["NC"][~np.isnan(g["NC"])]),
                      "EC_minus_EN": round(float(np.nanmean(g["EC"]) - np.nanmean(g["EN"])) * 100, 4) if len(g["EC"]) and len(g["EN"]) else None,
                      "EC_minus_ALL": round(float(np.nanmean(g["EC"]) - allr.mean()) * 100, 4) if len(g["EC"]) else None}
        Ds = [r["D_EC_minus_NC"] for r in res.values() if r["D_EC_minus_NC"] is not None]
        lo = [r["D_ci"][0] for r in res.values() if r["D_ci"][0] is not None]
        hi = [r["D_ci"][1] for r in res.values() if r["D_ci"][1] is not None]
        res["avg"] = {"D": round(float(np.mean(Ds)), 4) if Ds else None,
                      "D_ci_approx": [round(float(np.mean(lo)), 4), round(float(np.mean(hi)), 4)] if lo else None}
        return res

    out = {"prereg": "forge/VOL_CRUSH_DRIFT_PREREG.md", "window": [START, END], "crush": CRUSH,
           "primary_r1": stats(), "r3": stats(col="r3"),
           "halves": {"<=2020": stats(lambda b: b.index <= "2020-12-31"), ">=2021": stats(lambda b: b.index >= "2021-01-01")},
           "fomc_only": stats(lambda b: (b.event.fillna("").str.contains("FOMC")) | (b.group != "EC") & (b.group != "EN")),
           "cpi_only": stats(lambda b: (b.event.fillna("").str.contains("CPI")) | (b.group != "EC") & (b.group != "EN"))}
    # the average-of-two-instruments interval: bootstrap the pooled (equal-weight) difference directly
    a = [frames[i].loc[frames[i].group == "EC", "r1"].to_numpy() for i in INSTS]
    n_ = [frames[i].loc[frames[i].group == "NC", "r1"].to_numpy() for i in INSTS]
    reps = np.zeros(REPS)
    for x, y in zip(a, n_):
        reps += (x[rng.integers(0, len(x), (REPS, len(x)))].mean(1) - y[rng.integers(0, len(y), (REPS, len(y)))].mean(1)) / len(INSTS)
    P = out["primary_r1"]
    D = P["avg"]["D"]
    ci = [round(float(v), 4) for v in np.percentile(reps, [2.5, 97.5]) * 100]
    out["primary_D"], out["primary_D_ci"] = D, ci
    each_pos = all(P[i]["D_EC_minus_NC"] > 0 for i in INSTS)
    halves_pos = [out["halves"][h]["avg"]["D"] for h in out["halves"]]
    ec_all = np.mean([P[i]["EC_minus_ALL"] for i in INSTS])
    if D >= 0.15 and ci[0] > 0 and each_pos and all(h > 0 for h in halves_pos) and ec_all > 0:
        verdict = "SUPPORTED"
    elif abs(D) < 0.075 or (halves_pos[0] > 0) != (halves_pos[1] > 0):
        verdict = "NULL"
    elif D <= -0.15 and ci[1] < 0:
        verdict = "WRONG WAY"
    else:
        verdict = "INCONCLUSIVE"
    out["verdict"] = verdict
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(out, indent=1, default=str), encoding="utf-8")

    md = ["# VOL CRUSH DRIFT (results)", "", f"Pre-registration: `forge/VOL_CRUSH_DRIFT_PREREG.md`. {START} → {END}; crush = VIX down ≥ 5% on the day. "
          "Returns in %, entry at the event day's New York close.", "",
          f"**Verdict: {verdict}.** D (event-crush minus non-event crush, next session, avg SPX500/NQ) = **{D:+.3f}%** [{ci[0]:+.3f}, {ci[1]:+.3f}].", "",
          "| | n EC / EN / NC | next-session mean % EC / EN / NC / ALL | D = EC − NC [95%] | EC − EN |", "|---|---|---|---|---|"]
    for key, title in (("primary_r1", "next session"), ("r3", "next 3 sessions")):
        for i in INSTS:
            r = out[key][i]; n = r["n"]; m = r["mean_pct"]
            f = lambda v: "—" if v is None else f"{v:+.3f}"
            md.append(f"| {i}, {title} | {n['EC']} / {n['EN']} / {n['NC']} | {f(m['EC'])} / {f(m['EN'])} / {f(m['NC'])} / {f(m['ALL'])} | "
                      f"{f(r['D_EC_minus_NC'])} [{f(r['D_ci'][0])}, {f(r['D_ci'][1])}] | {f(r['EC_minus_EN'])} |")
    for h, r in out["halves"].items():
        md.append(f"| halves {h} (avg) | | | {r['avg']['D']:+.3f} | |")
    for k in ("fomc_only", "cpi_only"):
        md.append(f"| {k} (avg) | EC n {out[k]['SPX500']['n']['EC']} | | {out[k]['avg']['D']:+.3f} | |")
    (OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
