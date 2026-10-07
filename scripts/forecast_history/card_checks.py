"""Lesson 01 cards 01a (one-session delay of the chosen forecast), 09 (stress windows), 11 (measured spreads vs the
minimum stop). forge/CARD_CHECKS_PREREG.md. Card 01b (yield book delay) is computed from scripts/ys_long/build.mjs
with EXTRA_LAG=1 and summarised here.

    PYTHONPATH=. python scripts/forecast_history/card_checks.py
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import stability as S  # noqa: E402  (imports forecast_fix in live mode)
from forecast_record import H, complete, klass, pinball  # noqa: E402

F = S.F
OUT = Path("analysis/output/card_checks")
WINDOWS = [("COVID", "2020-02-20", "2020-04-30"), ("UK gilt crisis", "2022-09-20", "2022-10-31"), ("SVB", "2023-03-08", "2023-03-31"),
           ("Yen carry unwind", "2024-07-25", "2024-08-16"), ("Tariff shock", "2025-04-02", "2025-04-30")]
Q = {"oh": "r_oh", "ol": "r_ol", "hl": "r_hl", "oc": "r_oc"}
R = {"p50": 0.5, "p75": 0.75, "p90": 0.9}
API = "https://macrofxmodel-production.up.railway.app"


def card01a():
    X = S.with_windows(F.load(), 250, 5)
    base = S.ratio(X.copy(), 1.0)
    D = []
    for inst, d in X.groupby("inst"):
        d = d.sort_values("date").copy()
        for c in (F.BASE, "regime", "res1", "res5"):
            d[c] = d[c].shift(1)                     # every input one session older
        D.append(d)
    Xd = pd.concat(D).dropna(subset=[F.BASE]).sort_values(["date", "inst"]).reset_index(drop=True)
    delayed = S.ratio(Xd, 1.0)
    return {"undelayed": round(base, 4), "delayed": round(delayed, 4),
            "pass": bool(delayed < 1 and abs(delayed - base) <= 0.01)}


def card01b():
    out = {}
    for f in ("trades.csv", "trades_lag1.csv"):
        T = pd.read_csv(f"analysis/output/ys_long/{f}")
        t = T[(T.group == "original") & (T.date >= "1976-01-01") & (T.date <= "2014-12-31")]
        out[f] = round(float(t.ret.mean() * 100), 4)
    base, lag = out["trades.csv"], out["trades_lag1.csv"]
    return {"undelayed_pct": base, "delayed_pct": lag, "pass": bool(lag > 0 and lag >= base / 2)}


def card09():
    X = pd.concat([pd.read_csv(f) for f in sorted(H.glob("*.csv"))], ignore_index=True)
    X = X[complete(X)]
    Bl = pd.read_csv("analysis/output/forecast_fix/live_variant/lines_B.csv")
    Fl = pd.read_csv("analysis/output/jumps/flags_seasonal.csv", usecols=["inst", "date", "max_up5", "max_dn5"])
    X = X.merge(Bl, on=["inst", "date"]).merge(Fl, on=["inst", "date"])
    X["klass"] = X.inst.map(klass)
    hm = json.loads(Path("js/howMuchParams.js").read_text(encoding="utf-8").split("HOW_MUCH = ")[1].rstrip().rstrip(";"))["classes"]
    X["minstop"] = X.klass.map(lambda c: hm[c]["long"]["min_stop_sigma"])
    X["cross"] = (X.max_dn5 / X.sigB > X.minstop)            # a long's stop crossed by one 5-min bar
    rows = []
    def stats(m, name):
        g = X[m]
        lB = sum(pinball(g[Q[q]].to_numpy(), g[f"B_{q}_{r}"].to_numpy(), t) / g.live_sig_used.to_numpy() for q in Q for r, t in R.items())
        lP = sum(pinball(g[Q[q]].to_numpy(), g[f"live_{q}_{r}"].to_numpy(), t) / g.live_sig_used.to_numpy() for q in Q for r, t in R.items())
        return {"window": name, "sessions": int(len(g)), "hl_p75_chosen": round(float((g.r_hl > g.B_hl_p75).mean()), 4),
                "hl_p75_plain": round(float((g.r_hl > g.live_hl_p75).mean()), 4), "pinball_ratio": round(float(lB.sum() / lP.sum()), 4),
                "stop_cross": round(float(g.cross.mean()), 4)}
    for name, a, b in WINDOWS:
        rows.append(stats((X.date >= a) & (X.date <= b), name))
    stress = np.zeros(len(X), bool)
    for _, a, b in WINDOWS:
        stress |= ((X.date >= a) & (X.date <= b)).to_numpy()
    rows.append(stats(~stress, "all other days (2020-08 → 2026-08 walk-forward span)"))
    w = rows[:-1]
    return {"windows": rows, "forecast_holds": sum(r["pinball_ratio"] < 1 for r in w) >= 3,
            "stops_hold": sum(r["stop_cross"] <= 0.10 for r in w) >= 4}


def card11():
    sp = json.loads(urllib.request.urlopen(f"{API}/api/spread-profile", timeout=60).read())["pairs"]
    ch = json.loads(urllib.request.urlopen(f"{API}/api/vol-forecast/persist-ladder/json", timeout=120).read())["instruments"]
    hm = json.loads(Path("js/howMuchParams.js").read_text(encoding="utf-8").split("HOW_MUCH = ")[1].rstrip().rstrip(";"))["classes"]
    out = []
    for osym, P in sp.items():
        name = "GOLD" if osym == "XAU_USD" else osym.replace("_", "")
        L = ch.get(name)
        px_file = Path(f"analysis/output/ladder_candidates/d1/{name}.json")
        if not L or not px_file.exists():
            continue
        price = json.loads(px_file.read_text())[-1]["c"]                 # last cached close (Aug 2026): spread / price only
        pip = 1.0 if name == "GOLD" else (0.01 if "JPY" in name else 0.0001)
        stop = hm[klass(name)]["long"]["min_stop_sigma"] * L["sigma_used_pct"] / 100 * price
        worst = max(v["mean"] for v in P["byHour"].values())
        out.append({"pair": name, "spread_pips_entry_hours": P["entryHoursMean"], "spread_pips_worst_hour": worst,
                    "min_stop_pips": round(stop / pip, 1), "cost_share_entry": round(P["entryHoursMean"] * pip / stop, 4),
                    "cost_share_worst": round(worst * pip / stop, 4)})
    out.sort(key=lambda r: -r["cost_share_entry"])
    return out


def main():
    res = {"card01a": card01a(), "card01b": card01b(), "card09": card09(), "card11": card11()}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=lambda o: bool(o) if isinstance(o, np.bool_) else str(o)))
    a, b, c9 = res["card01a"], res["card01b"], res["card09"]
    md = ["# Lesson 01 cards 01, 09, 11 on the built system (results)", "", "Pre-registration: `forge/CARD_CHECKS_PREREG.md`.", "",
          "## Card 01 — the one-day delay check", "",
          f"- Chosen forecast, every input one session older: pinball ratio {a['delayed']} vs {a['undelayed']} undelayed → **{'PASS' if a['pass'] else 'FAIL'}**",
          f"- Yield-spread book, rates one day later (1976–2014): {b['delayed_pct']:+.3f}% vs {b['undelayed_pct']:+.3f}% per trade → **{'PASS' if b['pass'] else 'FAIL'}**", "",
          f"## Card 09 — stress windows (forecast holds: **{c9['forecast_holds']}**, stops hold: **{c9['stops_hold']}**)", "",
          "| window | sessions | HL p75 passed: chosen / plain (target 25%) | pinball chosen ÷ plain | one bar crosses the min stop |", "|---|---|---|---|---|"]
    md += [f"| {r['window']} | {r['sessions']} | {r['hl_p75_chosen'] * 100:.1f}% / {r['hl_p75_plain'] * 100:.1f}% | {r['pinball_ratio']:.3f} | {r['stop_cross'] * 100:.1f}% |" for r in c9["windows"]]
    md += ["", "## Card 11 — measured spread vs the minimum stop (round trip ≈ 1 spread)", "",
           "| pair | spread pips, entry hours / worst hour | today's min stop (pips) | cost as % of stop: entry / worst | flag |", "|---|---|---|---|---|"]
    md += [f"| {r['pair']} | {r['spread_pips_entry_hours']} / {r['spread_pips_worst_hour']} | {r['min_stop_pips']} | {r['cost_share_entry'] * 100:.1f}% / {r['cost_share_worst'] * 100:.1f}% | "
           f"{'cost-heavy' if r['cost_share_entry'] > 0.10 else ''} |" for r in res["card11"]]
    md += ["", "Indices: not in the spread profile (unmeasured). Prices for the cost share are the last cached closes (Aug 2026); "
           "σ is today's chosen forecast."]
    (OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
