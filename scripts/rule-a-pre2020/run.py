"""rule-a-pre2020 (forge/RULE_A_PRE2020_PREREG.md): rule A on the chosen v3 lines, backcast to 2016-05 -> 2020-08.

    PYTHONPATH=. python scripts/rule-a-pre2020/run.py

Lines: vf3_stage_b's S / SI forms, class betas and per-instrument widths fitted on 2020-08-24 -> 2026-08-20 rows ONLY,
applied to 2016-05-23 -> 2020-08 rows (5-session embargo). Trades: scripts/backtest/build_line_backtest.py's simulate and
spreads, 00:00-10:00 London, stop 0.2 sigma, 5R, 2x spread. Seed 20261028.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, ".")
sys.path.insert(0, "scripts/forecast_history")
import forecast_fix as F  # noqa: E402
import vf3_stage_b as V  # noqa: E402
from forge.iep_build import sessions  # noqa: E402

spec = importlib.util.spec_from_file_location("blb", "scripts/backtest/build_line_backtest.py")
blb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(blb)

SEED = 20261028
OUT = Path("analysis/output/rule-a-pre2020")
FIT0, T0 = "2020-08-24", "2016-05-23"
INSTR = ["EURUSD", "GBPUSD", "AUDUSD", "USDCAD", "USDCHF", "USDJPY", "GOLD", "NQ", "SPX500", "US30", "US2000"]
FX = ["EURUSD", "GBPUSD", "AUDUSD", "USDCAD", "USDCHF", "USDJPY"]
STAGE = {"US30": "DOW"}
CELLS = [(0.2, 5), (0.1, 5), (0.1, 10), (0.2, 10)]
LINES = ("oh_p50", "oh_p75", "ol_p50", "ol_p75")


def backcast_lines():
    X = V.load()
    dates = np.sort(X.date.unique())
    i0 = int(np.searchsorted(dates, FIT0))
    last_test = dates[i0 - F.EMBARGO - 1]
    tr = X[X.date >= FIT0].copy()
    te = X[(X.date >= T0) & (X.date <= last_test)].copy()
    for arm, ft in {"S": F.FB, "SI": F.FC}.items():
        tr[f"sig_{arm}"] = np.nan
        te[f"sig_{arm}"] = np.nan
        for cls in sorted(X.klass.unique()):
            trc = tr[(tr.klass == cls) & tr[ft].notna().all(axis=1)]
            mk = (te.klass == cls) & te[ft].notna().all(axis=1)
            if len(trc) < 500 or not mk.any():
                continue
            b, mu = F.fit_beta(trc, ft)
            tr.loc[trc.index, f"sig_{arm}"] = F.apply_beta(trc, ft, b, mu)
            te.loc[mk, f"sig_{arm}"] = F.apply_beta(te[mk], ft, b, mu)
        col = f"sig_{arm}"
        ok = tr[col].notna() & (tr[col] > 0)
        w = F.widths(tr.loc[ok, col].to_numpy(), tr[ok])
        for q, r in F.CELLS:
            te[f"{arm}_{q}_{r}"] = te[col] * w[(q, r)].reindex(te.inst).to_numpy()
    return te, str(last_test)


def cvol_series():
    d = json.load(open("js/data/cmeCvolEod.json"))["series"]
    return {k: pd.Series({r["date"]: r["cvol"] for r in v if r.get("cvol")}).sort_index() for k, v in d.items()}


def one(sym, te, cv):
    rows = {r.date: r for r in te[te.inst == STAGE.get(sym, sym)].itertuples()}
    cser = cv.get(sym)
    cdates = cser.index.to_numpy() if cser is not None else None
    closes, ratio_all, out = [], {}, []
    for d, m, o, h, l, c, *_ in sessions(sym):
        e = np.searchsorted(m, blb.END)
        if e < 60:
            continue
        m, o, h, l, c = m[:e], o[:e], h[:e], l[:e], c[:e]
        prev = list(closes[-21:])
        closes.append(c[-1])
        if d > "2022-12-31" or len(prev) < 21:
            continue
        rv = float(np.std(np.diff(np.log(prev)), ddof=1) * np.sqrt(252) * 100)
        if not rv > 0:
            continue
        if sym in FX:
            if cser is None:
                continue
            k = int(np.searchsorted(cdates, d)) - 1                  # previous CVOL print, strictly before the day
            if k < 0:
                continue
            ratio_all[d] = float(cser.iloc[k]) / rv
        r = rows.get(d)
        if r is None:
            continue
        if sym not in FX:
            if not pd.notna(r.iv_ann):
                continue
            ratio = float(r.iv_ann) / rv
        else:
            if d not in ratio_all:
                continue
            ratio = ratio_all[d]
        arm = "SI" if pd.notna(getattr(r, "SI_oh_p50")) else "S"
        sig = getattr(r, f"sig_{arm}")
        O = o[0]
        if not (sig > 0) or abs(O / r.open - 1) > 0.002:
            continue
        unit = O * sig / 100
        sp, _ = blb.spread_for(sym, O)
        for k in LINES:
            side = 1 if k.startswith("oh") else -1
            pct = getattr(r, f"{arm}_{k}")
            if not (pct > 0):
                continue
            L = O * (1 + side * pct / 100)
            thr = L + side * 0.05 * unit
            brk = np.flatnonzero(((c >= thr) if side > 0 else (c <= thr)) & (m < 600))
            if not len(brk) or brk[0] + 1 >= len(c):
                continue
            i = int(brk[0])
            ep = float(o[i + 1])
            rec = {"inst": sym, "d": d, "ratio": ratio, "arm": arm, "line": k, "side": side, "hour": int(m[i] // 60)}
            for s, t in CELLS:
                stop = L - side * s * unit
                if side * (ep - stop) <= 0:
                    rec[f"{s}|{t}"] = None
                    continue
                risk = abs(ep - stop)
                res = blb.simulate(side, i + 1, ep, stop, ep + side * t * risk, h, l, c)
                rec[f"{s}|{t}"] = None if not res else res[0] - 2 * sp / risk
            out.append(rec)
    return out, ratio_all


def block_ci(df, col, B=2000, block_weeks=4):
    rng = np.random.default_rng(SEED)
    w = pd.to_datetime(df.d).dt.to_period("W").astype(str)
    g = df.assign(w=w).groupby("w")[col].agg(["sum", "count"]).sort_index()
    S, N = g["sum"].to_numpy(), g["count"].to_numpy()
    k = len(S)
    nb = int(np.ceil(k / block_weeks))
    st = rng.integers(0, max(1, k - block_weeks + 1), (B, nb))
    idx = (st[:, :, None] + np.arange(block_weeks)).reshape(B, -1)[:, :k]
    m = S[idx].sum(1) / np.maximum(N[idx].sum(1), 1)
    return [float(x) for x in np.quantile(m, [0.025, 0.975])]


def summary(x, col):
    x = x[x[col].notna()]
    if not len(x):
        return {"n": 0}
    lo, hi = block_ci(x, col)
    per = x.groupby("inst")[col].mean()
    grp = x.inst.isin(FX + ["GOLD"])
    return {"n": int(len(x)), "net_R": round(float(x[col].mean()), 4), "ci95": [round(lo, 4), round(hi, 4)],
            "fx_gold": round(float(x[grp][col].mean()), 4) if grp.any() else None,
            "indices": round(float(x[~grp][col].mean()), 4) if (~grp).any() else None,
            "instruments_positive": f"{int((per > 0).sum())}/{len(per)}", "by_instrument": per.round(3).to_dict(),
            "n_by_instrument": x.groupby("inst").size().to_dict(),
            "by_year": x.groupby(x.d.str[:4])[col].agg(["count", "mean"]).round(3).to_dict(orient="index"),
            "by_arm": x.groupby("arm")[col].agg(["count", "mean"]).round(3).to_dict(orient="index")}


def main():
    te, last_test = backcast_lines()
    print("backcast rows", len(te), te.date.min(), "->", last_test, flush=True)
    cv = cvol_series()
    rows, ratios = [], {}
    for sym in INSTR:
        r, ra = one(sym, te, cv)
        rows += r
        ratios[sym] = ra
        print(sym, len(r), flush=True)
    D = pd.DataFrame(rows)
    thr = {}
    for sym in INSTR:
        if sym in FX:
            v = np.array([x for d, x in ratios[sym].items() if "2016-01-01" <= d <= "2022-12-31"])
            thr[sym] = float(np.quantile(v, 2 / 3)) if len(v) > 100 else np.inf
        else:
            thr[sym] = blb.RICH[sym]
    D["rich"] = D.ratio >= D.inst.map(thr)
    p = summary(D[D.rich], "0.2|5")
    gate = {"mean_and_lower_bound_gt_0": p.get("n", 0) > 0 and p["ci95"][0] > 0,
            "fx_gold_and_indices_gt_0": p.get("n", 0) > 0 and (p["fx_gold"] or 0) > 0 and (p["indices"] or 0) > 0,
            "six_of_eleven": p.get("n", 0) > 0 and int(p["instruments_positive"].split("/")[0]) >= 6}
    if all(gate.values()):
        verdict = "VALIDATED"
    elif p.get("n", 0) and p["net_R"] > 0:
        verdict = "UNDERPOWERED"
    elif p.get("n", 0) and p["ci95"][1] < 0.162:
        verdict = "NULL"
    else:
        verdict = "UNDERPOWERED"
    res = {"seed": SEED, "prereg": "forge/RULE_A_PRE2020_PREREG.md", "window": [T0, last_test], "fit_window": [FIT0, "2026-08-20"],
           "thresholds": {k: (round(v, 4) if np.isfinite(v) else None) for k, v in thr.items()},
           "primary": p, "gate": gate, "verdict": verdict, "mirror_non_rich": summary(D[~D.rich], "0.2|5"),
           "other_cells_rich": {c: {k: v for k, v in summary(D[D.rich], c).items() if k in ("n", "net_R", "ci95")} for c in ("0.1|5", "0.1|10", "0.2|10")}}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=float))
    D.to_csv(OUT / "trades.csv", index=False)
    print(json.dumps({k: v for k, v in res.items() if k not in ("mirror_non_rich",)}, indent=1, default=float)[:4000])
    print("mirror", {k: res["mirror_non_rich"].get(k) for k in ("n", "net_R", "ci95")})


if __name__ == "__main__":
    main()
