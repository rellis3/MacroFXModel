"""VF3 Stage B, Part 1: daily forecasts head-to-head on identical rows (forge/VF3_STAGE_B_PLAN.md).

    PYTHONPATH=. python scripts/forecast_history/vf3_stage_b.py

P = the production export exactly as the point-in-time builder made it (pit_*: fold estimator, widths, event multipliers).
S / SI / I / IV / H: sigma from their definitions on P's PIT sigma (never today's parameters), widths refit per walk-forward fold
(FORECAST_FIX method, 5-session embargo). C = incumbent COG bands (YZ-30 / GARCH .87 on the same NY-close bars, COG constants).
Writes analysis/output/vf3_stage_b/PART1.md and part1.json. Retrospective research on previously explored data.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from forecast_record import H, boot_weights, complete, klass, pinball  # noqa: E402
import forecast_fix as F  # noqa: E402  (fit_beta / widths; BASE is pit_sig_used without --live)
from forge.run_combined_range import asof_before, cboe  # noqa: E402
from forge.export_iv_adjusted_params import IVFILE, ivd  # noqa: E402

assert F.BASE == "pit_sig_used"
OUT = Path("analysis/output/vf3_stage_b")
NYD = Path("analysis/output/ladder_candidates/d1")
HAR_NAME = {"DOW": "US30"}
Q = F.Q
R = F.R
TARGET = {"p50": 0.50, "p75": 0.25, "p90": 0.10}
CELLS = F.CELLS
COG = {"hl": (1.56, 1.93), "oc": (0.74, 1.24), "oh": (0.74, 1.24), "ol": (0.74, 1.24)}   # js/cogReverseEngineer.js COG_CONST
INDICES = {"NQ", "SPX500", "DOW", "US2000", "DE30", "UK100"}
WD = ["Mon", "Tue", "Wed", "Thu", "Fri"]


def yz(o, h, l, c, w=30):
    out = np.full(len(c), np.nan)
    k = 0.34 / (1.34 + (w + 1) / (w - 1))
    lon = np.log(o[1:] / c[:-1])
    loc = np.log(c / o)
    rs = np.log(h / c) * np.log(h / o) + np.log(l / c) * np.log(l / o)
    for i in range(w, len(c)):
        on = lon[i - w:i]                       # gaps j = i-w+1 .. i
        oc = loc[i - w + 1:i + 1]
        out[i] = np.sqrt(max(on.var(ddof=1) + k * oc.var(ddof=1) + (1 - k) * rs[i - w + 1:i + 1].mean(), 0))
    return out


def garch(c, omega=1.11e-5, a=0.06, b=0.87):
    r = np.diff(np.log(c))
    s2 = omega / (1 - a - b)
    out = np.full(len(c), np.nan)
    for i in range(len(r)):
        s2 = omega + a * r[i] ** 2 + b * s2
        out[i + 1] = np.sqrt(s2)
    return out


def iv_series():
    src = {**{k: ivd(k) for k in IVFILE}, "GOLD": cboe("GVZ"), "NQ": cboe("VXN")}
    for k in ("SPX500", "DOW", "US2000", "DE30", "UK100"):
        src[k] = cboe("VIX")
    return src


def load():
    ivs = iv_series()
    parts = []
    for f in sorted(H.glob("*.csv")):
        d = pd.read_csv(f).sort_values("date").reset_index(drop=True)
        inst = f.stem
        ny = pd.DataFrame(json.loads((NYD / f"{inst}.json").read_text()))
        o, h, l, c = (ny[k].to_numpy(float) for k in "ohlc")
        ny["sC"] = (yz(o, h, l, c) if inst not in INDICES else garch(c)) * 100        # incumbent sigma, % daily, as of that close
        ny["hl_ny"] = (ny.h - ny.l) / ny.o * 100
        ny["dt"] = pd.to_datetime(ny.d)
        d["dt"] = pd.to_datetime(d.date)
        m = pd.merge_asof(d.sort_values("dt"), ny[["dt", "sC", "hl_ny"]].sort_values("dt"), on="dt",
                          allow_exact_matches=False, direction="backward")              # last NY bar strictly before the session
        m = m.sort_values("date").reset_index(drop=True)
        sd = m.pit_sig_daily
        m["regime"] = np.log(sd / sd.shift(1).rolling(250, min_periods=120).median())
        r_ny = np.log(m.hl_ny.clip(lower=1e-6) / sd)              # previous NY day's range / the PIT sigma (live-computable form)
        m["res1"] = r_ny
        m["res5"] = r_ny.rolling(5, min_periods=3).mean()
        wd = m.dt.dt.dayofweek
        for k in range(1, 5):
            m[f"wd{k}"] = (wd == k).astype(float)
        m["iv_ann"] = asof_before(m.dt, ivs[inst]) if inst in ivs else np.nan
        m["iv_sig"] = np.log(m.iv_ann / (sd * np.sqrt(252)))
        h8 = pd.read_csv(NYD / f"{HAR_NAME.get(inst, inst)}_har800.csv")
        h8["dt"] = pd.to_datetime(h8.date)
        m = pd.merge_asof(m.sort_values("dt"), h8[["dt", "sig"]].rename(columns={"sig": "har_ann"}).sort_values("dt"), on="dt",
                          allow_exact_matches=False, direction="backward")
        m["y"] = np.log(m.r_hl.clip(lower=1e-6) / m.pit_sig_used)
        m["wd"] = wd.map(dict(enumerate(WD)))
        parts.append(m)
    X = pd.concat(parts, ignore_index=True)
    X = X[complete(X) & X.regime.notna() & X.res5.notna()].copy()          # oos = 0 burn-in rows are kept for FITTING only
    X["klass"] = X.inst.map(klass)
    X["regime_b"] = np.select([X.regime < np.log(0.85), X.regime > np.log(1.15)], ["quiet", "busy"], "normal")
    X["year"] = X.date.str[:4]
    return X.sort_values(["date", "inst"]).reset_index(drop=True)


def build(X):
    feats = {"S": F.FB, "SI": F.FC, "I": ["iv_sig"]}
    rows = []
    for fo in sorted(X[X.oos == 1].fold.unique()):
        te = X[(X.fold == fo) & (X.oos == 1)].copy()             # scored rows: out-of-sample only
        prior = np.sort(X.loc[X.date < te.date.min(), "date"].unique())
        tr = X[X.date < prior[-F.EMBARGO]].copy()                # fit rows: everything earlier (incl. burn-in), embargoed
        te["sig_P"] = te.pit_sig_used
        tr["sig_IV"], te["sig_IV"] = tr.iv_ann / np.sqrt(252), te.iv_ann / np.sqrt(252)
        tr["sig_H"], te["sig_H"] = tr.har_ann / np.sqrt(252), te.har_ann / np.sqrt(252)
        for arm, ft in feats.items():
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
        for arm in ("S", "SI", "I", "IV", "H"):
            col = f"sig_{arm}"
            ok = tr[col].notna() & (tr[col] > 0)
            w = F.widths(tr.loc[ok, col].to_numpy(), tr[ok])
            for q, r in CELLS:
                te[f"{arm}_{q}_{r}"] = te[col] * w[(q, r)].reindex(te.inst).to_numpy()
        for q, r in CELLS:
            te[f"P_{q}_{r}"] = te[f"pit_{q}_{r}"]
        for q, (c50, c75) in COG.items():
            te[f"C_{q}_p50"], te[f"C_{q}_p75"] = c50 * te.sC, c75 * te.sC
            te[f"C_{q}_p90"] = np.nan
        rows.append(te)
        print(f"fold {fo}: train {len(tr):,} test {len(te):,}", flush=True)
    return pd.concat(rows, ignore_index=True)


def board(T, arms, mask, W, di, nd):
    m = mask & np.all([T[f"{a}_hl_p50"].notna().to_numpy() for a in arms], axis=0)
    sig = T.pit_sig_used.to_numpy()
    out = {"rows": int(m.sum()), "dates": int(len(set(di[m]))), "instruments": int(T.inst[m].nunique()), "arms": {}}

    def loss(a, qs, rs):
        tot = np.zeros(len(T))
        for q in qs:
            for r in rs:
                tot += pinball(T[Q[q]].to_numpy(), T[f"{a}_{q}_{r}"].to_numpy(), R[r]) / sig
        return tot

    for a in arms:
        A = {}
        rs_all = ["p50", "p75"] if a == "C" else list(R)
        for name, qs in (("ALL", list(Q)), ("hl", ["hl"]), ("oc", ["oc"]), ("oh", ["oh"]), ("ol", ["ol"])):
            la, lp = loss(a, qs, rs_all), loss("P", qs, rs_all)
            sa = np.bincount(di[m], weights=la[m], minlength=nd)
            sp = np.bincount(di[m], weights=lp[m], minlength=nd)
            reps = (W @ sa) / (W @ sp)
            A[f"ratio_{name}"] = [round(float(sa.sum() / sp.sum()), 4), *[round(float(x), 4) for x in np.percentile(reps, [2.5, 97.5])]]
        A["exceed"] = {f"{q}_{r}": round(float((T[Q[q]][m] > T[f"{a}_{q}_{r}"][m]).mean()), 4) for q, r in CELLS if T[f"{a}_{q}_{r}"][m].notna().any()}

        def miss(col_q, rung, cut):
            tgt = TARGET[rung]
            ex = (T[Q[col_q]][m] > T[f"{a}_{col_q}_{rung}"][m]).groupby(T[cut][m]).mean()
            return {k: round(float(v), 4) for k, v in ex.items()}, round(float((ex - tgt).abs().max()), 4)

        for cut in ("regime_b", "wd", "event", "klass", "year"):
            for q in ("hl", "oh", "ol"):
                vals, mx = miss(q, "p75", cut)
                A[f"p75_{q}_by_{cut}"] = vals
                A[f"p75_{q}_miss_{cut}"] = mx
        bias = np.log(T.r_hl[m].clip(lower=1e-6) / T[f"{a}_hl_p50"][m])
        for cut in ("regime_b", "wd", "event", "klass", "year"):
            A[f"hl_logbias_by_{cut}"] = {k: round(float(v), 4) for k, v in bias.groupby(T[cut][m]).median().items()}
        A["by_inst_ratio_ALL"] = {}
        la, lp = loss(a, list(Q), rs_all), loss("P", list(Q), rs_all)
        for i in sorted(T.inst[m].unique()):
            mi = m & (T.inst == i).to_numpy()
            A["by_inst_ratio_ALL"][i] = round(float(la[mi].sum() / lp[mi].sum()), 4)
        A["by_inst_hl_p75"] = {i: round(float(g), 4) for i, g in (T.r_hl[m] > T[f"{a}_hl_p75"][m]).groupby(T.inst[m]).mean().items()}
        out["arms"][a] = A
    return out


def main():
    X = load()
    print("rows", len(X), "instruments", X.inst.nunique(), flush=True)
    T = build(X)
    OUT.mkdir(parents=True, exist_ok=True)
    T.to_parquet(OUT / "part1_lines.parquet")
    dates = np.sort(T.date.unique())
    di = pd.Series(np.arange(len(dates)), index=dates)[T.date].to_numpy()
    nd = len(dates)
    W = boot_weights(nd)
    allm = np.ones(len(T), bool)
    iv13 = T.iv_ann.notna().to_numpy()
    res = {"all34": board(T, ["P", "S", "H", "C"], allm, W, di, nd),
           "iv13": board(T, ["P", "S", "SI", "I", "IV", "H", "C"], iv13, W, di, nd),
           "coverage": {"oos_rows_in_table": int((X.oos == 1).sum()), "scored_rows": int(len(T)),
                        "fit_rows": "all earlier rows incl. burn-in (oos=0), 5-session embargo; scored rows oos=1 only", "iv_instruments": sorted(T.inst[iv13].unique())}}
    (OUT / "part1.json").write_text(json.dumps(res, indent=1))
    print(json.dumps({b: {a: {k: v for k, v in A.items() if k.startswith("ratio")} for a, A in res[b]["arms"].items()} for b in ("all34", "iv13")}, indent=1))


if __name__ == "__main__":
    main()
