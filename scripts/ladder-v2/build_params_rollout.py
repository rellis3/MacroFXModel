"""Add the ladder-v2-rollout instruments to the site's shadow params (js/ladderV2Params.json), plus a parity fixture.

    python scripts/ladder-v2/build_params_rollout.py   -> js/ladderV2Params.json (rollout block), js/ladderV2Rollout.fixture.json

Which instruments (forge/LADDER_V2_ROLLOUT_PREREG.md §4, analysis/output/ladder-v2-rollout/results.json):
  - CFD track on the site when the CFD sigma race AND the CFD exhaustion race are VALIDATED
  - futures track when the futures races are VALIDATED and the site can compute the validated sigma from OANDA:
      C vs F 'same'      -> futures reuse the CFD sigma and widths
      C vs F 'different' -> the CFD sigma with widths re-fitted on the futures' own realised ranges (as gold)
      futures validated but CFD not (US2000): the CFD sigma, futures widths (C vs F 'same' there)
    Futures whose validated sigma needs NT8 data (rates; NG / ZW / ZC, whose CFD fails inventory) stay off the site.
The pilots (NQ, GOLD, EURUSD; scripts/ladder-v2/build_params.py) are left exactly as they are.

Per instrument the frozen parts are the sigma spec (estimator / HAR regression coefficients / GARCH parameters fitted on
data before 2026, as the 2026 walk-forward year used), the width multipliers (fitted on every session <= 2026-08-21
with that sigma), the next-line odds by London bucket (its own first touches, shrunk toward the pool of all site
instruments with a weight of 50 touches) and the zone (the pilots' pooled reversal-zones value, in sigma).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
import export_shadow as E  # noqa: E402
import export_exhaustion as X  # noqa: E402
import ladder as L  # noqa: E402

QS, TAUS = ("hl", "oc", "oh", "ol"), (50, 75, 90)
REGCOLS = {"R5": ["d1", "d5", "d22"], "R15": ["d1", "d5", "d22"], "SHAR": ["pos", "neg", "d5", "d22"],
           "HARCJ": ["c1", "c5", "c22", "j1"]}
OANDA_NAME = {"SPX500": "SPX500_USD", "US30": "US30_USD", "US2000": "US2000_USD", "DE30": "DE30_EUR",
              "UK100": "UK100_GBP", "SILVER": "XAG_USD", "COPPER": "XCU_USD", "PLATINUM": "XPT_USD",
              "PALLADIUM": "XPD_USD", "WTI": "WTICO_USD", "BRENT": "BCO_USD"}
GYEAR = "@2026"


def oanda(sym):
    return OANDA_NAME.get(sym) or f"{sym[:3]}_{sym[3:]}"


def wdict(m):
    return {q: {str(t): float(m[(q, t)]) for t in TAUS} for q in QS}


def fit_coef(sym, arm):
    f = pd.read_parquet(ROOT / f"analysis/output/ladder-v2-{sym.lower()}/rvfeat_C_{arm}.parquet")
    cols = REGCOLS[arm]
    f = f[np.isfinite(f[cols + ["y_next"]]).all(axis=1)]
    Xm = np.column_stack([np.ones(len(f))] + [f[c] for c in cols])
    coef, *_ = np.linalg.lstsq(Xm, f["y_next"].to_numpy(), rcond=None)
    return coef, float(np.var(f["y_next"].to_numpy() - Xm @ coef))


def reg_sigma(rows, arm, coef, s2):
    Xm = np.column_stack([np.ones(len(rows))] + [rows[f"{arm}_{c}"] for c in REGCOLS[arm]])
    return pd.Series(np.sqrt(np.exp(Xm @ coef + s2 / 2)) * 100, index=rows.index)


def har_col(sym):
    return "A0" if L.SYMS[sym]["live"] == "har_rv_log" else "E_har_rv_log"


def spec_and_sigma(sym, arm, rows):
    """(JSON spec the JS evaluates, the same sigma as a series over rows) for one banked arm."""
    live = L.SYMS[sym]["live"]
    gp = json.loads((ROOT / f"analysis/output/ladder-v2-{sym.lower()}/garch_params_C.json").read_text())
    if arm == "A0" or arm.startswith("E_"):
        est = live if arm == "A0" else arm[2:]
        return {"type": "est", "est": est}, rows[arm]
    if arm in REGCOLS:
        coef, s2 = fit_coef(sym, arm)
        return {"type": "reg", "arm": arm, "coef": [float(c) for c in coef], "s2": s2}, reg_sigma(rows, arm, coef, s2)
    if arm.startswith("G_"):
        return {"type": "garch", "model": arm, "params": gp[arm + GYEAR]}, rows[arm + GYEAR]
    if arm == "B_har_garcht":
        return ({"type": "blend", "parts": [{"type": "est", "est": "har_rv_log"},
                                            {"type": "garch", "model": "G_garch_t", "params": gp["G_garch_t" + GYEAR]}]},
                0.5 * (rows[har_col(sym)] + rows["G_garch_t" + GYEAR]))
    raise SystemExit(f"{sym}: arm {arm} has no site port")


def odds_tables(entries):
    """entries: [(sym, track)] -> {(sym, rung, bucket): % reaching the next line}, shrunk to the pool (as the pilots)."""
    rows = []
    for sym, tr in entries:
        Xt = pd.read_parquet(ROOT / f"analysis/output/exhaustion-v2-{sym.lower()}/touches_{tr}.parquet")
        Xt = Xt[Xt["fam"].isin(["OH", "OL"])].copy()
        Xt["b"] = np.searchsorted([420, 720, 960], Xt["min"].to_numpy(), side="right")
        Xt["y"] = np.where(Xt["rung"] < 90, Xt["further"] >= Xt["d_next"], Xt["further"] >= Xt["d_sig"]).astype(float)
        Xt["sym"] = sym
        rows.append(Xt[["sym", "rung", "b", "y"]])
    A = pd.concat(rows)
    pooled = A.groupby(["rung", "b"])["y"].mean()
    g = A.groupby(["sym", "rung", "b"])["y"].agg(["sum", "count"])
    return {k: (r["sum"] + X.SHRINK * pooled[(k[1], k[2])]) / (r["count"] + X.SHRINK) * 100 for k, r in g.iterrows()}


def main():
    R = json.loads((ROOT / "analysis/output/ladder-v2-rollout/results.json").read_text())
    P = json.loads((ROOT / "js/ladderV2Params.json").read_text())
    pilot_z = [P["instruments"][s]["zone_sigma"] for s in ("NQ", "GOLD", "EURUSD")]
    zone = [float(np.mean([z[0] for z in pilot_z])), float(np.mean([z[1] for z in pilot_z]))]
    plan, off = [], []
    for d in R["rows"]:
        s, Ld, Ed = d["sym"], d["lad"], d["exh"]
        ok = {t: Ld.get(t, {}).get("verdict") == "VALIDATED" and Ed.get(t, {}).get("verdict") == "VALIDATED" for t in "CF"}
        has_c_arm = "C" in Ld and (s, "C") not in L.INVENTORY_FAIL
        cfd = ok["C"]
        fut = ok["F"] and has_c_arm and (d.get("cvf") is not None)
        if not (cfd or fut):
            off.append(s)
            continue
        plan.append((s, d, cfd, fut))
    roll = {}
    for s, d, cfd, fut in plan:
        arm = d["lad"]["C"]["chosen"]
        rows = pd.read_parquet(ROOT / f"analysis/output/ladder-v2-{s.lower()}/rows_C.parquet").set_index("date")
        spec, sig = spec_and_sigma(s, arm, rows)
        d1 = json.loads((ROOT / f"analysis/output/ladder-v2-{s.lower()}/d1/{s}_C.json").read_text())
        ent = {"oanda": oanda(s), "arm": arm, "sigma": spec, "d1_start": d1[0]["d"], "rollout": True,
               "needs": sorted({"d1"} | ({"m5"} if arm in ("R5", "SHAR", "HARCJ") else set()) | ({"m15"} if arm == "R15" else set())),
               "zone_sigma": zone, "zone_note": "pooled NQ/GOLD/EURUSD reversal-zones value"}
        wc = wdict(E.widths(rows, sig))
        if cfd:
            ent["cfd"] = {"widths": wc}
        if fut:
            if d["cvf"]["same"]:
                ent["fut"] = {"widths": wc, "note": f"{d['fut']} = CFD distribution (ladder-v2-{s.lower()}-cvf)"}
            else:
                rf = pd.read_parquet(ROOT / f"analysis/output/ladder-v2-{s.lower()}/rows_F.parquet").set_index("date")
                j = rf[list(QS)].join(sig.rename("sig"), how="inner")
                ent["fut"] = {"widths": wdict(E.widths(j, j["sig"])),
                              "note": f"CFD sigma, widths fitted on {d['fut']} realised ranges (C vs F different)"}
        ent["odds_track"] = "C" if cfd else "F"
        roll[s] = ent
    od = odds_tables([(s, e["odds_track"]) for s, e in roll.items()])
    for s, e in roll.items():
        e["odds"] = {str(t): [round(float(od[(s, t, b)]), 2) for b in range(4)] for t in TAUS}
    for s in [k for k, v in P["instruments"].items() if v.get("rollout")]:
        del P["instruments"][s]
    P["instruments"].update(roll)
    P["rollout"] = {"banked": "ladder-v2-rollout", "off_site": off,
                    "note": "off-site: sigma or exhaustion not VALIDATED on a track the site can compute"}
    (ROOT / "js/ladderV2Params.json").write_text(json.dumps(P, indent=1))

    # parity fixture: the research inputs before one session, and the Python sigma for it
    fx = {"instruments": {}}
    seen = set()                       # one instrument per sigma kind keeps the fixture small; every code path is covered
    for s, e in roll.items():
        kind = e["arm"] if e["arm"] not in ("A0",) else e["sigma"]["est"]
        if kind in seen:
            continue
        seen.add(kind)
        rows = pd.read_parquet(ROOT / f"analysis/output/ladder-v2-{s.lower()}/rows_C.parquet").set_index("date")
        _, sig = spec_and_sigma(s, e["arm"], rows)
        sig = sig.dropna()
        sess = sig.index.max()
        d1 = [b for b in json.loads((ROOT / f"analysis/output/ladder-v2-{s.lower()}/d1/{s}_C.json").read_text())
              if b["d"] < str(sess.date())]
        item = {"session": str(sess.date()), "sigma": float(sig.loc[sess]),
                "d1": [[b["d"], b["o"], b["h"], b["l"], b["c"]] for b in d1]}
        if {"m5", "m15"} & set(e["needs"]):
            m = L.load_m1(s, "C")
            m = m[(m.index >= pd.Timestamp(sess).tz_localize("UTC") - pd.Timedelta(days=45))
                  & (m.index < pd.Timestamp(sess).tz_localize("UTC") + pd.Timedelta(hours=12))]
            for k in (5, 15):
                if f"m{k}" in e["needs"]:
                    c = m["close"].resample(f"{k}min", label="left", closed="left").last().dropna()
                    item[f"m{k}"] = [[int(t.timestamp()), float(v)] for t, v in c.items()]
        fx["instruments"][s] = item
    (ROOT / "js/ladderV2Rollout.fixture.json").write_text(json.dumps(fx))
    print(f"{len(roll)} rollout instruments on the site; off: {off}")
    print({s: (e['arm'], 'cfd' in e, 'fut' in e) for s, e in roll.items()})


if __name__ == "__main__":
    main()
