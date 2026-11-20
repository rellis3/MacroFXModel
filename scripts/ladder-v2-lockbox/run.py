"""ladder-v2-lockbox (forge/LADDER_V2_LOCKBOX_PREREG.md incl. A1): the ONE scoring of ladder-v2 forecast + exhaustion on
the holdout 2026-08-24 -> 2026-11-18, NQ / GOLD / EURUSD, CFD and futures. Refuses to run twice.

    python scripts/ladder-v2-lockbox/run.py   -> analysis/output/ladder-v2-lockbox/{results.json, report.txt, manifest.json}
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import beta

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
for d in ("scripts/ladder-v2", "scripts/exhaustion-v2"):
    sys.path.insert(0, str(ROOT / d))
import ladder as L  # noqa: E402
import export_shadow as E  # noqa: E402
import touches as TT  # noqa: E402
import score as XS  # noqa: E402
from forge import vol as V  # noqa: E402
from forge.data_screens import input_hashes  # noqa: E402

OUT = ROOT / "analysis/output/ladder-v2-lockbox"
H0, H1 = pd.Timestamp("2026-08-24"), pd.Timestamp("2026-11-18")
FIT_END = pd.Timestamp("2026-08-21")
ARM = {("NQ", "C"): "E6", ("NQ", "F"): "E6", ("GOLD", "C"): "HARCJ", ("GOLD", "F"): "R5",
       ("EURUSD", "C"): "HARCJ", ("EURUSD", "F"): "HARCJ"}
TGT = {50: .5, 75: .25, 90: .10}
QS, TAUS = ("hl", "oc", "oh", "ol"), (50, 75, 90)
CELLS = [(k, t) for k in ("hl", "oh", "ol") for t in (75, 90)]
LOG: list[str] = []


def say(s=""):
    sys.stdout.reconfigure(encoding="utf-8")
    print(s, flush=True)
    LOG.append(s)


# ---------------------------------------------------------------- data
def m1_C(sym):
    m = pd.read_parquet(E.DATA / f"{sym}_m5_recent.parquet")
    return m[["open", "high", "low", "close"]].astype(float)


def m1_F(sym, kind):
    root = L.SYMS[sym]["f"]
    d = pd.read_parquet(ROOT / f"analysis/output/nt8/continuous/{root}_1m_{kind}.parquet")
    d.index = pd.to_datetime(d.pop("timestamp"), utc=True) - pd.Timedelta(minutes=1)
    d = d[~d.index.duplicated()].sort_index()
    return d[["open", "high", "low", "close"]].astype(float)


def sessions(m, min_bars):
    lt = m.index.tz_convert("Europe/London")
    x = m[(lt.hour < 22) & (lt.dayofweek < 5)]
    dd = x.index.tz_convert("Europe/London").tz_localize(None).normalize()
    g = x.groupby(dd)
    s = pd.DataFrame({"o": g["open"].first(), "h": g["high"].max(), "l": g["low"].min(), "c": g["close"].last(), "n": g.size()})
    s = s[(s["n"] >= min_bars) & (s.index >= H0) & (s.index <= H1)]
    o = s["o"]
    return pd.DataFrame({"hl": (s["h"] - s["l"]) / o * 100, "oc": (s["c"] - o).abs() / o * 100,
                         "oh": (s["h"] - o) / o * 100, "ol": (o - s["l"]) / o * 100}), {k: v for k, v in x.groupby(dd) if H0 <= k <= H1}


def daily_bars(sym, track):
    if track == "C":
        d = pd.read_parquet(E.DATA / f"{sym}_d1_recent.parquet")
        return d[(d.index >= "2016-01-04") & (d.index.dayofweek < 5)][["open", "high", "low", "close"]]
    b, *_ = L.ny_bars(m1_F(sym, "ratio"))
    return b[b.index >= "2016-01-04"][["open", "high", "low", "close"]]


def est_series(b, name):
    """Estimator value at each bar key (as the research build: asof_before(D, s) picks the last key < D)."""
    if name == "har_rv_log":
        ph = b.iloc[[-1]].copy(); ph.index = [b.index[-1] + pd.Timedelta(days=1)]
        for c in ("open", "high", "low"):
            ph[c] = ph["close"]
        x = pd.concat([b, ph])
        return pd.Series(V.ESTIMATORS[name](x.reset_index(drop=True)).astype(float), index=x.index)[:-1] / V.SQRT252
    return pd.Series(V.ESTIMATORS[name](b.reset_index(drop=True)).astype(float), index=b.index) / V.SQRT252


def reg_series(sym, track, arm):
    coef, s2 = E.fit_coef(sym, track, arm)
    if track == "C":
        F = E.rv_features(m1_C(sym)["close"])
    else:
        c5 = m1_F(sym, "ratio")["close"].resample("5min", label="left", closed="left").last().dropna()
        F = E.rv_features(c5)
    return E.reg_sigma(F.dropna(), arm, coef, s2), (coef, s2)


def asof(series, dates):
    return L.asof_before(pd.DatetimeIndex(dates), series.dropna())


# ---------------------------------------------------------------- forecast (L1)
def widths_for(sym, track, arm, coefs):
    rows = pd.read_parquet(ROOT / f"analysis/output/ladder-v2-{sym.lower()}/rows_{track}.parquet").set_index("date")
    rows = rows[rows.index <= FIT_END]
    sig_v2 = rows[arm] if arm in rows.columns else E.reg_sigma(rows, arm, *coefs)
    return E.widths(rows, sig_v2), E.widths(rows, rows["A0"])


def miss30(R, sig_col, lines, q):
    m = []
    for j in range(5):
        sel = q == j
        for k, t in CELLS:
            m.append(abs((R.loc[sel, k] > lines[(k, t)][sel]).mean() - TGT[t]) * 100)
    return float(np.mean(m))


def guard12(R, lines):
    return float(np.mean([abs((R[k] > lines[(k, t)]).mean() - TGT[t]) * 100 for k in QS for t in TAUS]))


def binom_ci(k, n):
    return [float(beta.ppf(.05, k, n - k + 1)) * 100 if k else 0.0, float(beta.ppf(.95, k + 1, n - k)) * 100 if k < n else 100.0]


# ---------------------------------------------------------------- exhaustion (L2)
def exhaustion(sym, track, arm, R, sig_v2, rel, frames, coefs, m_v2):
    """Touches on holdout sessions with the v2 lines; X7 / X0 fitted on research touches <= 2026-08-21."""
    TT.LINE_ARM = arm
    events = TT.usd_major_times(sym)
    rows = []
    for D in R.index:
        g = frames.get(D)
        if g is None:
            continue
        row = {"date": D, "year": D.year, arm: sig_v2[D], "rel": rel[D]}
        for q in QS:
            for t in TAUS:
                row[f"{arm}_{q}_{t}"] = m_v2[(q, t)] * sig_v2[D]
        rows += TT.touches_for_session(g, pd.Series(row), "C", events)
    Xh = pd.DataFrame(rows)
    Xr = pd.read_parquet(ROOT / f"analysis/output/exhaustion-v2-{sym.lower()}/touches_{track}.parquet")
    Xr = Xr[Xr["date"] <= FIT_END]
    clk = pd.read_parquet(ROOT / f"analysis/output/exhaustion-v2-{sym.lower()}/clock_{track}.parquet")
    clock = clk[2026] if 2026 in clk.columns else clk["2026"]
    out = {}
    for tg in XS.TARGETS:
        tr, te = XS.prep(Xr, tg), XS.prep(Xh, tg)
        if not len(te):
            continue
        pr, _ = XS.predict_year(tr, te, clock, "C", ["X0", "X1", "X2", "X3", "X4", "X5", "X6", "X7"])
        out[tg] = pd.DataFrame({"y": te["y"].to_numpy(), "b4": te["b4"].to_numpy(), "X0": pr["X0"], "X7": pr["X7"], "sym": sym})
    return out, len(Xh)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    if (OUT / "results.json").exists():
        sys.exit("ladder-v2 lockbox already evaluated — the holdout is spent (analysis/output/ladder-v2-lockbox/results.json)")
    files = [f"analysis/output/ladder-v2-data/{s}_{k}_recent.parquet" for s in ("NQ", "GOLD", "EURUSD") for k in ("d1", "m5")]
    files += [f"analysis/output/nt8/continuous/{r}_1m_{k}.parquet" for r in ("NQ", "GC", "6E") for k in ("unadj", "ratio")]
    files += ["js/ladderV2Params.json"]
    (OUT / "manifest.json").write_text(json.dumps({"holdout": [str(H0.date()), str(H1.date())], "fit_end": str(FIT_END.date()),
                                                   "input_sha256": input_hashes(files)}, indent=1))
    res = {"holdout": [str(H0.date()), str(H1.date())], "per": {}}
    pooled = {"C": [], "F": []}
    for track in ("C", "F"):
        for sym in ("NQ", "GOLD", "EURUSD"):
            arm = ARM[(sym, track)]
            m = m1_C(sym) if track == "C" else m1_F(sym, "unadj")
            R, frames = sessions(m, 120 if track == "C" else 600)
            b = daily_bars(sym, track)
            a0 = est_series(b, "yz_10")
            if arm == "E6":
                sv2, coefs = est_series(b, "har_rv_log"), None
            else:
                sv2, coefs = reg_series(sym, track, arm)
            m_v2, m_a0 = widths_for(sym, track, arm, coefs)
            D = R.index
            sig_v2 = pd.Series(asof(sv2, D), index=D); sig_a0 = pd.Series(asof(a0, D), index=D)
            relser = a0 / a0.rolling(250, min_periods=60).median().shift(1)
            rel = pd.Series(asof(relser, D), index=D)
            ok = sig_v2.notna() & sig_a0.notna() & rel.notna()
            R, sig_v2, sig_a0, rel = R[ok], sig_v2[ok], sig_a0[ok], rel[ok]
            lv2 = {(k, t): (m_v2[(k, t)] * sig_v2).to_numpy() for k in QS for t in TAUS}
            la0 = {(k, t): (m_a0[(k, t)] * sig_a0).to_numpy() for k in QS for t in TAUS}
            R = R.assign(rel=rel.to_numpy(), v2=sig_v2.to_numpy(), a0=sig_a0.to_numpy())
            for k in QS:
                for t in TAUS:
                    R[f"v2_{k}_{t}"] = lv2[(k, t)]; R[f"a0_{k}_{t}"] = la0[(k, t)]
            R["sym"] = sym
            pooled[track].append(R)
            hits = {f"{k}_p{t}": {"v2": [float((R[k] > R[f"v2_{k}_{t}"]).mean() * 100),
                                         binom_ci(int((R[k] > R[f"v2_{k}_{t}"]).sum()), len(R))],
                                  "a0": float((R[k] > R[f"a0_{k}_{t}"]).mean() * 100)} for k in ("hl", "oh", "ol") for t in TAUS}
            ex, ntouch = exhaustion(sym, track, arm, R, sig_v2, rel, frames, coefs, m_v2)
            res["per"][f"{sym}/{track}"] = {"arm": arm, "sessions": int(len(R)), "hits": hits, "exhaustion": ex, "touches": ntouch}
            say(f"{sym:6} {track}: {len(R)} sessions, arm {arm}; HL p75 hit v2 {hits['hl_p75']['v2'][0]:.0f}% (yz_10 {hits['hl_p75']['a0']:.0f}%), "
                f"OH/OL p75 v2 {hits['oh_p75']['v2'][0]:.0f}/{hits['ol_p75']['v2'][0]:.0f}%; touches {ntouch}")
    say("\n== L1 forecast (pooled per track; fifths from the holdout pool)")
    verdict_L1 = {}
    for track in ("C", "F"):
        P = pd.concat(pooled[track], ignore_index=True)
        q = np.searchsorted(np.quantile(P["rel"], [.2, .4, .6, .8]), P["rel"].to_numpy())
        lv2 = {(k, t): P[f"v2_{k}_{t}"].to_numpy() for k in QS for t in TAUS}
        la0 = {(k, t): P[f"a0_{k}_{t}"].to_numpy() for k in QS for t in TAUS}
        mv, ma = miss30(P, "v2", lv2, q), miss30(P, "a0", la0, q)
        gv, ga = guard12(P, lv2), guard12(P, la0)
        hit = {f"{k}_p{t}": float((P[k] > P[f"v2_{k}_{t}"]).mean() * 100) for k in ("hl", "oh", "ol") for t in TAUS}
        passed = (mv < ma) and (gv <= ga + 1.0)
        verdict_L1[track] = passed
        res[f"L1_{track}"] = {"sessions": int(len(P)), "miss30_v2": mv, "miss30_yz10": ma, "guard12_v2": gv, "guard12_yz10": ga,
                              "hit_rates_v2": hit, "pass": bool(passed)}
        say(f"  {track}: {len(P)} sessions  30-cell miss v2 {mv:.2f} vs yz_10 {ma:.2f}  |  12-rung miss v2 {gv:.2f} vs yz_10 {ga:.2f}  -> "
            f"{'v2 better' if passed else 'v2 NOT better'}")
        say(f"     v2 hit rates (target 50/25/10): " + "  ".join(f"{k} {v:.0f}%" for k, v in hit.items()))
    say("\n== L2 exhaustion (pooled per track: 4 London buckets x 2 targets; X7 vs plain odds X0)")
    verdict_L2 = {}
    for track in ("C", "F"):
        miss = {"X0": [], "X7": []}; lls = {"X0": [], "X7": []}; n = 0
        for tg in XS.TARGETS:
            parts = [v["exhaustion"][tg] for k, v in res["per"].items() if k.endswith("/" + track) and tg in v["exhaustion"]]
            if not parts:
                continue
            T = pd.concat(parts, ignore_index=True); n += len(T)
            g = T.groupby("b4")[["y", "X0", "X7"]].mean()
            for c in ("X0", "X7"):
                miss[c] += list((g[c] - g["y"]).abs() * 100)
                lls[c] += list(XS.ll(T["y"].to_numpy(), T[c].to_numpy()))
            say(f"  {track} {tg:4} n={len(T):4}  observed / X0 / X7 by London bucket: " + "  ".join(
                f"{['00-07', '07-12', '12-16', '16-22'][int(b)]} {r.y * 100:.0f}/{r.X0 * 100:.0f}/{r.X7 * 100:.0f}" for b, r in g.iterrows()))
        mX0, mX7, lX0, lX7 = np.mean(miss["X0"]), np.mean(miss["X7"]), np.mean(lls["X0"]), np.mean(lls["X7"])
        verdict_L2[track] = bool(mX7 < mX0 and lX7 < lX0)
        res[f"L2_{track}"] = {"touches": n, "miss_X0": float(mX0), "miss_X7": float(mX7), "logloss_X0": float(lX0),
                              "logloss_X7": float(lX7), "pass": verdict_L2[track]}
        say(f"  {track}: miss X7 {mX7:.1f} vs X0 {mX0:.1f}  |  log loss X7 {lX7:.4f} vs X0 {lX0:.4f}  -> {'X7 better' if verdict_L2[track] else 'X7 NOT better'}")
    for v in res["per"].values():
        v["exhaustion"] = {tg: int(len(d)) for tg, d in v["exhaustion"].items()}
    res["L1_pass"], res["L2_pass"] = verdict_L1, verdict_L2
    v1 = "VALIDATED" if all(verdict_L1.values()) else ("NULL" if not any(verdict_L1.values()) else "UNDERPOWERED")
    v2 = "VALIDATED" if all(verdict_L2.values()) else ("NULL" if not any(verdict_L2.values()) else "UNDERPOWERED")
    res["verdict"] = {"ladder-v2-lockbox": v1, "exhaustion-v2-lockbox": v2}
    say(f"\nVERDICT forecast {v1} (C {verdict_L1['C']}, F {verdict_L1['F']}); exhaustion {v2} (C {verdict_L2['C']}, F {verdict_L2['F']})")
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=str))
    (OUT / "report.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
