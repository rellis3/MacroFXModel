"""run_iv_trades — Part C of forge/IV_SIZING_FILTER_PREREG.md (trade level).

    python -m forge.run_iv_trades        (after forge.run_iv_sizing_filter)

C1: stress-filter on the Level Atlas Vote backtest (what volatility_bot_v3 trades).
C2: IV vs HAR vs flat sizing on the fixed-20-pip-stop motif and analog backtests.
Writes forge/out_vol_iv/trades_c.json.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

OUT = Path("forge/out_vol_iv")
FX6 = ["eurusd", "gbpusd", "audusd", "usdcad", "usdchf", "usdjpy"]
VOTE7 = FX6 + ["nq"]
RNG = np.random.default_rng(20260923)


def load_panel() -> pd.DataFrame:
    p = pd.read_parquet(OUT / "iv_session_panel.parquet")
    # forge.load_daily labels each london22 session by its START in naive UTC, so a BST
    # session is stamped 23:00 the previous day. Re-key on the London calendar date, the
    # same key london_session() gives a trade — an exact-date join on the raw label
    # silently dropped every summer trade (caught by the match-share audit, 43%).
    p["date"] = (pd.to_datetime(p["date"]).dt.tz_localize("UTC").dt.tz_convert("Europe/London")
                 .dt.tz_localize(None).dt.normalize().astype("datetime64[ns]"))
    out = []
    for inst, g in p.groupby("instrument"):
        g = g.sort_values("date").copy()
        for col, name in (("sigma_iv30", "w_iv"), ("sigma_har", "w_har")):
            med = g[col].shift(1).expanding(min_periods=60).median()   # causal reference level
            g[name] = med / g[col]
        out.append(g)
    return pd.concat(out)


def london_session(ts_utc: pd.Series) -> pd.Series:
    """london22 session date of a UTC timestamp; NaT for 22:00-24:00 London (no session)."""
    loc = ts_utc.dt.tz_convert("Europe/London")
    day = loc.dt.tz_localize(None).dt.normalize()
    return day.where(loc.dt.hour < 22)


def join(trades: pd.DataFrame, panel: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    n0 = len(trades)
    t = trades.merge(panel, left_on=["instrument", "session"], right_on=["instrument", "date"],
                     how="left", suffixes=("", "_p"))
    audit = {"n_trades": n0,
             "no_session_22_24_london": int(trades["session"].isna().sum()),
             "no_iv_row": int(t["sigma_iv30"].isna().sum() - trades["session"].isna().sum()),
             "matched": int(t["sigma_iv30"].notna().sum())}
    audit["matched_share"] = audit["matched"] / max(n0, 1)
    return t[t["sigma_iv30"].notna()].copy(), audit


def cluster_boot_mean(values: np.ndarray, clusters: np.ndarray, reps: int = 2000) -> tuple:
    df = pd.DataFrame({"v": values, "c": clusters})
    agg = df.groupby("c")["v"].agg(["sum", "count"])
    s, n = agg["sum"].values, agg["count"].values
    boots = []
    for _ in range(reps):
        i = RNG.integers(0, len(s), len(s))
        boots.append(s[i].sum() / n[i].sum())
    return float(values.mean()), float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))


def boot_diff(a: pd.DataFrame, b: pd.DataFrame, reps: int = 2000) -> tuple:
    """(mean R on a) − (mean R on b), clustering both on session date."""
    ga = a.groupby("session")["R"].agg(["sum", "count"])
    gb = b.groupby("session")["R"].agg(["sum", "count"])
    out = []
    for _ in range(reps):
        ia = RNG.integers(0, len(ga), len(ga)); ib = RNG.integers(0, len(gb), len(gb))
        out.append(ga["sum"].values[ia].sum() / ga["count"].values[ia].sum()
                   - gb["sum"].values[ib].sum() / gb["count"].values[ib].sum())
    return float(a["R"].mean() - b["R"].mean()), float(np.percentile(out, 2.5)), float(np.percentile(out, 97.5))


def load_vote() -> pd.DataFrame:
    rows = []
    for inst in VOTE7:
        j = json.load(open(f"analysis/output/level-atlas-vote-trades/{inst}-votetrades.json"))
        for t in j["trades"]:
            rows.append({"instrument": inst, "time": t["time"], "exit_time": t.get("resolveTime"),
                         "decision": t.get("decision"),
                         "R": t["pnlPct"] / (t["stopPips"] * t["pip"] / t["entry"] * 100)
                         if t.get("stopPips") and t.get("entry") else np.nan})
    v = pd.DataFrame(rows).dropna(subset=["R"])
    v["session"] = london_session(pd.to_datetime(v["time"], unit="s", utc=True))
    v["exit_day"] = pd.to_datetime(v["exit_time"].fillna(v["time"]), unit="s", utc=True).dt.tz_localize(None).dt.normalize()
    return v


def load_fixed_stop(path: str) -> pd.DataFrame:
    j = json.load(open(path))
    assert float(j["params"]["sl_pips"]) == 20.0, f"{path}: stop is not the fixed 20 pips"
    m = pd.DataFrame(j["trades"])
    m = m[m["pair"].isin(FX6)].rename(columns={"pair": "instrument", "r": "R"})
    m["session"] = london_session(pd.to_datetime(m["entry_date"], utc=True))
    m["exit_day"] = pd.to_datetime(m["exit_date"], utc=True).dt.tz_localize(None).dt.normalize()
    return m[pd.to_datetime(m["entry_date"], utc=True) >= pd.Timestamp("2020-09-08", tz="UTC")]


def sharpe_dd(t: pd.DataFrame, wcol: str | None) -> dict:
    w = t[wcol] / t[wcol].mean() if wcol else 1.0            # same mean risk for every scheme
    pnl = (t["R"] * w).groupby(t["exit_day"]).sum()
    days = pd.date_range(pnl.index.min(), pnl.index.max(), freq="B")
    s = pnl.reindex(days, fill_value=0.0)
    cum = s.cumsum()
    return {"sharpe": float(s.mean() / s.std() * np.sqrt(252)) if s.std() > 0 else float("nan"),
            "total_R": float(s.sum()), "max_dd_R": float((cum - cum.cummax()).min()), "n": int(len(t))}


def sizing_block(t: pd.DataFrame) -> dict:
    t = t.dropna(subset=["w_iv", "w_har"])
    out = {"pooled": {k: sharpe_dd(t, c) for k, c in (("flat", None), ("har", "w_har"), ("iv", "w_iv"))}}
    for inst, g in t.groupby("instrument"):
        out[inst] = {k: sharpe_dd(g, c) for k, c in (("flat", None), ("har", "w_har"), ("iv", "w_iv"))}
    return out


def main():
    panel = load_panel()
    res = {}

    # ── C1: stress filter on the live strategy's backtest ──
    vote, aud = join(load_vote(), panel)
    res["C1_audit"] = aud
    vs = vote.dropna(subset=["stress"])
    st, calm = vs[vs["stress"] == 1], vs[vs["stress"] == 0]
    res["C1"] = {"stress_mean_R_ci": cluster_boot_mean(st["R"].values, st["session"].values),
                 "calm_mean_R_ci": cluster_boot_mean(calm["R"].values, calm["session"].values),
                 "diff_ci": boot_diff(st, calm), "n_stress": int(len(st)), "n_calm": int(len(calm)),
                 "per_instrument": {i: {"stress": float(g[g.stress == 1].R.mean()), "calm": float(g[g.stress == 0].R.mean()),
                                        "n_stress": int((g.stress == 1).sum())} for i, g in vs.groupby("instrument")}}
    inv, notinv = vs[vs["inverted"] == 1], vs[vs["inverted"] == 0]
    res["C1_secondary_inverted"] = {"diff_ci": boot_diff(inv, notinv), "inv_mean": float(inv.R.mean()),
                                    "not_mean": float(notinv.R.mean())}
    s_lo_hi = res["C1"]["stress_mean_R_ci"]; d = res["C1"]["diff_ci"]
    res["C1_PASS"] = bool(s_lo_hi[0] < 0 and s_lo_hi[2] < 0 and (d[2] < 0 or d[1] > 0))

    # ── C2: sizing on the fixed-stop backtests ──
    for name, path in (("motif", "AnalogML/data/motif_backtest_export.json"),
                       ("analog", "AnalogML/data/backtest_export.json")):
        t, aud = join(load_fixed_stop(path), panel)
        res[f"C2_{name}_audit"] = aud
        res[f"C2_{name}"] = sizing_block(t)
        if name == "motif":
            ms = t.dropna(subset=["stress"])
            res["C1_secondary_motif"] = {"stress_mean": float(ms[ms.stress == 1].R.mean()),
                                         "calm_mean": float(ms[ms.stress == 0].R.mean()),
                                         "n_stress": int((ms.stress == 1).sum())}
    m = res["C2_motif"]
    iv_beats_har = sum(m[i]["iv"]["sharpe"] > m[i]["har"]["sharpe"] for i in FX6 if i in m)
    res["C2_PASS"] = bool(m["pooled"]["iv"]["sharpe"] > m["pooled"]["har"]["sharpe"]
                          and m["pooled"]["iv"]["sharpe"] > m["pooled"]["flat"]["sharpe"] and iv_beats_har >= 4)
    res["C2_iv_beats_har_pairs"] = iv_beats_har

    # secondary: move the Vote strategy's realized-scaled risk onto IV
    vote2 = vote.dropna(subset=["sigma_har"]).copy()
    vote2["w_shift"] = vote2["sigma_har"] / vote2["sigma_iv30"]
    res["C2_secondary_vote"] = {"flat": sharpe_dd(vote2, None), "iv_shift": sharpe_dd(vote2, "w_shift")}

    (OUT / "trades_c.json").write_text(json.dumps(res, indent=2, default=float))
    print(json.dumps({k: res[k] for k in ("C1_audit", "C1", "C1_secondary_inverted", "C1_secondary_motif",
                                          "C1_PASS")}, indent=1, default=float))
    for name in ("motif", "analog"):
        print(name, "audit", res[f"C2_{name}_audit"])
        for k, v in res[f"C2_{name}"].items():
            print(f"  {name:6s} {k:7s} " + " | ".join(f"{s}: SR {v[s]['sharpe']:+.2f} R {v[s]['total_R']:+.0f} DD {v[s]['max_dd_R']:.0f}"
                                                     for s in ("flat", "har", "iv")) + f"  n={v['iv']['n']}")
    print("C2 iv beats har on", iv_beats_har, "of 6 | C2_PASS", res["C2_PASS"])
    print("VOTE sizing shift", res["C2_secondary_vote"])


if __name__ == "__main__":
    main()
