#!/usr/bin/env python3
"""Test frozen in GEX_LADDER_CONFLUENCE_PREREG.md: does a forecast-ladder line sitting on a GEX level react (bounce) more than one that doesn't?

    PYTHONPATH=. .venv/Scripts/python.exe oi_research_book/scripts/25_ladder_gex_confluence.py
"""
import sys, json, importlib.util
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.stats import norm

HERE = Path(__file__).parent; ROOT = HERE.parent
sys.path.insert(0, str(HERE.parents[1]))
from forge.iep_build import sessions            # noqa: E402

DATA = ROOT / "data"; RES = DATA / "results"; RES.mkdir(parents=True, exist_ok=True)
FH = HERE.parents[1] / "analysis" / "output" / "forecast_history" / "NQ.csv"
START, END = "2020-09-04", "2026-08-20"
EPS, HOLD, REACT = 0.10, 120, 0.25          # confluence radius, minutes after touch, reaction size (all in u)
SHIFTS = [-1.0, -0.5, 0.5, 1.0]             # placebo shifts in u
TOPN, BAND, MULT = 5, 0.03, 20
rng = np.random.default_rng(20261016)


def gamma_g(spot, k, sig, t):
    t = np.maximum(t, 1 / 365); sig = np.maximum(sig, 1e-4)
    d1 = (np.log(spot / k) + 0.5 * sig ** 2 * t) / (sig * np.sqrt(t))
    return norm.pdf(d1) / (spot * sig * np.sqrt(t))


def build_G():
    """per OI date: (top-5 |net gamma| strikes, top-5 total-OI strikes) within +-3% of that date's close, in FUTURES strikes; + basis."""
    spec = importlib.util.spec_from_file_location("v24", str(HERE / "24_ripple_walls_placebo.py"))
    v24 = importlib.util.module_from_spec(spec); spec.loader.exec_module(v24)
    basis = v24.basis_series()
    c = pd.read_parquet(DATA / "cache" / "contract_level_ffilled_nas100_usd.parquet")
    dm = pd.read_parquet(DATA / "daily_master_near_nas100_usd.parquet")
    dm["date"] = pd.to_datetime(dm["date"]).dt.tz_localize(None)
    dm = dm[dm["date"] <= END][["date", "close", "rv20_ann"]].rename(columns={"close": "spot"})
    c["date"] = pd.to_datetime(c["date"]).dt.tz_localize(None)
    c = c[(c["date"] <= END) & (c["effective_oi"] > 0)].merge(dm, on="date")
    c = c[(c["strike"] / c["spot"] - 1).abs() <= BAND].copy()
    c["dte"] = (pd.to_datetime(c["expiry"]).dt.tz_localize(None).dt.normalize() - c["date"]).dt.days
    c = c[c["dte"] >= 0]
    sig = c["rv20_ann"].fillna(c["rv20_ann"].median())
    c["gex"] = np.where(c["right"] == "C", 1.0, -1.0) * c["effective_oi"] * gamma_g(c["spot"].values, c["strike"].values, sig.values, c["dte"].values / 365.0) * MULT * c["spot"]
    a = c.groupby(["date", "strike"]).agg(net=("gex", "sum"), oi=("effective_oi", "sum")).reset_index()
    out = {}
    for d, g in a.groupby("date"):
        out[d] = (g.reindex(g["net"].abs().sort_values(ascending=False).index)["strike"].to_numpy()[:TOPN],
                  g.sort_values("oi", ascending=False)["strike"].to_numpy()[:TOPN])
    dates = sorted(out)
    bs = basis.reindex(pd.DatetimeIndex(dates)).ffill(limit=3)
    return out, dates, bs


def race(m, h, l, i, level, s, u):
    """after the touch bar i; s=+1 upper line (bounce = down). returns 1 bounce, 0 through, -1 neither, -2 same-bar ambiguity"""
    end = np.searchsorted(m, m[i] + HOLD, side="right")
    B, T = level - s * REACT * u, level + s * REACT * u
    for j in range(i + 1, min(end, len(m))):
        hb = (l[j] <= B) if s > 0 else (h[j] >= B)
        ht = (h[j] >= T) if s > 0 else (l[j] <= T)
        if hb and ht: return -2
        if hb: return 1
        if ht: return 0
    return -1


def main():
    G, gdates, bs = build_G()
    gd = np.array(gdates, dtype="datetime64[D]")
    fh = pd.read_csv(FH).set_index("date")
    rows = []; skipped = {"no_oi": 0, "no_basis": 0, "no_ladder": 0}
    for d, m, o, h, l, c, sig, rel in sessions("NQ"):
        if d < START or d > END: continue
        if d not in fh.index: skipped["no_ladder"] += 1; continue
        f = fh.loc[d]; s_ = f["pit_sig_daily"]
        if not (s_ > 0): skipped["no_ladder"] += 1; continue
        j = np.searchsorted(gd, np.datetime64(d)) - 1            # latest OI date strictly before D
        if j < 0: skipped["no_oi"] += 1; continue
        b = bs.iloc[j]
        if not np.isfinite(b): skipped["no_basis"] += 1; continue
        O = o[0]; u = O * s_ / 100.0
        gx, gp = G[gdates[j]]
        gx, gp = gx - b, gp - b
        lines = [(O * (1 + f[f"pit_oh_{r}"] / 100), +1, r) for r in ("p50", "p75", "p90")] + [(O * (1 - f[f"pit_ol_{r}"] / 100), -1, r) for r in ("p50", "p75", "p90")]
        for L, s, r in lines:
            idx = np.flatnonzero((h[1:] >= L) if s > 0 else (l[1:] <= L)) + 1
            res, ti = (race(m, h, l, idx[0], L, s, u), idx[0]) if len(idx) else (-3, -1)   # -3: line never touched
            row = {"date": d, "year": d[:4], "s": s, "rank": r, "res": res, "touched": int(len(idx) > 0),
                   "conf": int(np.min(np.abs(gx - L)) <= EPS * u), "conf_oi": int(np.min(np.abs(gp - L)) <= EPS * u)}
            for k, sh in enumerate(SHIFTS):
                row[f"p{k}"] = int(np.min(np.abs(gx + sh * u - L)) <= EPS * u)
            rows.append(row)
    df = pd.DataFrame(rows); df.to_csv(RES / "ladder_gex_confluence_rows.csv", index=False)
    iso = pd.to_datetime(df["date"]).dt.isocalendar(); df["wk"] = iso["year"].astype(str) + "_" + iso["week"].astype(str)
    print(f"sessions {df['date'].nunique()} lines {len(df)} | skipped sessions {skipped}")
    r = df[df["res"].isin([0, 1])].copy(); r["b"] = (r["res"] == 1).astype(int)
    print(f"resolved (touched, not ambiguous, not 'neither'): {len(r)} of {int(df['touched'].sum())} touched | neither {(df['res']==-1).sum()} | same-bar ambiguous {(df['res']==-2).sum()}")

    def delta(x, flag, w=None):
        a, bb = x[x[flag] == 1], x[x[flag] == 0]
        return (a["b"].mean() - bb["b"].mean()) * 100 if len(a) and len(bb) else np.nan

    flags = ["conf"] + [f"p{k}" for k in range(len(SHIFTS))]
    print("confluent share of lines:", {f: round(float(df[f].mean()), 3) for f in flags + ["conf_oi"]})
    real = delta(r, "conf"); plac = [delta(r, f"p{k}") for k in range(len(SHIFTS))]; pl = float(np.nanmean(plac))
    # cluster bootstrap over ISO weeks
    wk = r.groupby("wk"); tab = {}
    for f in flags + ["conf_oi"]:
        t = r.assign(f=r[f]).groupby(["wk", "f"])["b"].agg(["sum", "count"]).unstack("f", fill_value=0)
        for need in (0, 1):
            for st in ("sum", "count"):
                if (st, need) not in t.columns: t[(st, need)] = 0
        tab[f] = t
    wks = tab["conf"].index.values; nW = len(wks)
    def stat(f, ix):
        t = tab[f].loc[ix]; a = t[("sum", 1)].sum() / max(t[("count", 1)].sum(), 1); bb = t[("sum", 0)].sum() / max(t[("count", 0)].sum(), 1)
        return (a - bb) * 100
    bd, bdp, bdd = [], [], []
    for _ in range(2000):
        ix = rng.choice(wks, nW)
        dr = stat("conf", ix); dp = np.mean([stat(f"p{k}", ix) for k in range(len(SHIFTS))])
        bd.append(dr); bdp.append(dp); bdd.append(dr - dp)
    ci = lambda x: np.percentile(x, [2.5, 97.5])
    n_conf = int((r["conf"] == 1).sum())
    print(f"\nconfluent resolved lines: {n_conf} (gate 4: need >= 400) | P(bounce) confluent {r[r.conf==1]['b'].mean()*100:.1f}% vs non-confluent {r[r.conf==0]['b'].mean()*100:.1f}%")
    print(f"DELTA real {real:+.2f} pp  CI [{ci(bd)[0]:+.2f}, {ci(bd)[1]:+.2f}]")
    print(f"DELTA placebo (4 shifts) {pl:+.2f} pp  each {[round(x,2) for x in plac]}  CI of mean [{ci(bdp)[0]:+.2f}, {ci(bdp)[1]:+.2f}]")
    print(f"DELTA real - placebo {real - pl:+.2f} pp  CI [{ci(bdd)[0]:+.2f}, {ci(bdd)[1]:+.2f}]")
    passed = bool(n_conf >= 400 and real >= 3 and ci(bd)[0] > 0 and (real - pl) >= 3 and ci(bdd)[0] > 0)
    print("VERDICT:", "PASS (confluence effect)" if passed else ("UNJUDGEABLE (<400 confluent lines)" if n_conf < 400 else "NULL"))
    # reported either way
    tr = df.groupby("conf")["touched"].mean() * 100
    print(f"touch rate confluent {tr.get(1, np.nan):.1f}% vs not {tr.get(0, np.nan):.1f}%")
    yr = {y: (round(delta(g, 'conf'), 2), int((g['conf'] == 1).sum())) for y, g in r.groupby("year")}
    print("by year (delta pp, n confluent):", yr)
    print(f"variant G = top-5 by OI: share {df['conf_oi'].mean():.3f}  delta {delta(r, 'conf_oi'):+.2f} pp  n conf {int((r['conf_oi']==1).sum())}")
    # injection control
    x = r.copy(); pf = 0.10 / (1 - x[x.conf == 1]["b"].mean())
    flip = (x["conf"] == 1) & (x["b"] == 0) & (rng.random(len(x)) < pf); x.loc[flip, "b"] = 1
    print(f"injection control: expected ~+10pp added, recovered {delta(x, 'conf') - real:+.2f} pp")
    json.dump({"n_lines": len(df), "n_resolved": len(r), "n_conf": n_conf, "real": real, "real_ci": ci(bd).tolist(), "placebo": plac, "placebo_mean": pl,
               "diff": real - pl, "diff_ci": ci(bdd).tolist(), "PASS": passed, "skipped": skipped, "by_year": yr}, open(RES / "ladder_gex_confluence.json", "w"), indent=2, default=float)


if __name__ == "__main__":
    main()
