"""HORIZON-REVERSION — runs forge/HORIZON_REVERSION_PREREG.md exactly as registered.

Arm A (incumbent): sigma_h = sigma_t * sqrt(h).
Arm B (mean-reverting): sigma_h^2 = sum_{k<h} [Vbar + phi^k (sigma_t^2 - Vbar)], phi = 0.5^(1/HL),
Vbar = trailing-250-day mean of the forecast-ready daily sigma^2 (causal).
Widths refit on the first 60% of windows per instrument; one pooled HL per horizon chosen on train.

    python -m forge.run_horizon_reversion            (from the repo root)
"""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

import numpy as np
import pandas as pd

from forge import vol as V

OUT = Path("analysis/output/horizon_reversion")
CACHE = OUT / "daily_cache"
HL_GRID = (5, 10, 20, 40, 80)
HORIZONS = {"weekly": (5, 5), "monthly": (20, 1)}          # span, step (monthly overlapping, as production)
TRAIN_FRAC = 0.60
VBAR_WIN = 250
FORGE_KEY = {"SPX": "spx500", "DOW": "us30"}               # ladder name -> forge pair key where they differ
QS = ((0.50, "p50"), (0.75, "p75"))                         # selection/primary targets: H-L p50 + p75


def ladder_estimators() -> dict:
    js = ("import('./js/forecastLadderParams.js').then(({LADDER_PARAMS:L})=>"
          "console.log(JSON.stringify(Object.fromEntries(Object.entries(L.pairs).map(([k,p])=>[k,p.estimator])))))")
    return json.loads(subprocess.check_output(["node", "-e", js], text=True))


def daily_for(key: str) -> pd.DataFrame | None:
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{key}.parquet"
    if f.exists():
        return pd.read_parquet(f)
    root = V.INDEX_DATA_ROOT if key in V.INDEX_PAIRS else "VolRangeForecaster/data/m1"
    if not (Path(root) / f"{key}_m1.parquet").exists():
        return None
    d = V.load_daily(key, data_root=root, years=10, session="london22")
    d.to_parquet(f)
    return d


def windows(daily: pd.DataFrame, sig_d: np.ndarray, span: int, step: int):
    """Per window: start date, sigma_t (daily, % of price), Vbar_t, realised H-L % of the window open."""
    o, h, l = (daily[c].to_numpy(float) for c in ("open", "high", "low"))
    var = sig_d ** 2
    vbar = pd.Series(var).rolling(VBAR_WIN, min_periods=VBAR_WIN // 2).mean().to_numpy()
    rows = []
    for s in range(0, len(daily) - span + 1, step):
        st, vb = sig_d[s], vbar[s]
        if not (np.isfinite(st) and st > 0 and np.isfinite(vb) and vb > 0 and o[s] > 0):
            continue
        hl = (h[s:s + span].max() - l[s:s + span].min()) / o[s] * 100.0
        rows.append((daily.index[s], st, vb, hl))
    if not rows:
        return None
    w = pd.DataFrame(rows, columns=["date", "sig", "vbar", "hl"])
    return w


def horizon_sigma(w: pd.DataFrame, span: int, hl: float | None) -> np.ndarray:
    if hl is None:                                           # arm A
        return w["sig"].to_numpy() * np.sqrt(span)
    phi = 0.5 ** (1.0 / hl)
    k = np.arange(span)
    s2, vb = w["sig"].to_numpy() ** 2, w["vbar"].to_numpy()
    tot = span * vb + (s2 - vb) * (phi ** k).sum()
    return np.sqrt(np.clip(tot, 1e-12, None))


def pinball(actual, pred, tau):
    d = actual - pred
    return np.where(d >= 0, tau * d, (tau - 1) * d).mean()


def evaluate(w: pd.DataFrame, span: int, hl: float | None):
    """Fit widths on train, score train + test. Returns losses and test exceedance per row."""
    n_tr = int(len(w) * TRAIN_FRAC)
    sh = horizon_sigma(w, span, hl)
    act = w["hl"].to_numpy()
    out = {"train": 0.0, "test": 0.0, "pred75_test": None}
    for tau, name in QS:
        mult = V.fit_width_multiplier(sh[:n_tr], act[:n_tr], tau)
        pred = mult * sh
        out["train"] += pinball(act[:n_tr], pred[:n_tr], tau)
        out["test"] += pinball(act[n_tr:], pred[n_tr:], tau)
        if name == "p75":
            out["pred75_test"] = pred[n_tr:]
        if name == "p50":
            out["pred50_test"] = pred[n_tr:]
    return out


def main():
    est = ladder_estimators()
    data, dropped = {}, []
    for name, e in sorted(est.items()):
        key = FORGE_KEY.get(name, name.lower())
        d = daily_for(key)
        if d is None:
            dropped.append(f"{name} (no local M1)"); continue
        sig = V.as_of_yesterday(V.ESTIMATORS[e](d)) / V.SQRT252
        data[name] = (d, sig, e)
        print(f"loaded {name:7s} {e:9s} {d.index[0].date()} to {d.index[-1].date()} n={len(d)}", flush=True)

    report = {"dropped": dropped, "horizons": {}}
    for hz, (span, step) in HORIZONS.items():
        W = {}
        for name, (d, sig, e) in data.items():
            w = windows(d, sig, span, step)
            if w is None or (hz == "weekly" and len(w) < 100):
                if hz == "weekly": dropped.append(f"{name} (<100 weekly windows)")
                continue
            W[name] = w
        # pooled HL selection on TRAIN (ratio to A, mean across instruments)
        baseA = {n: evaluate(w, span, None) for n, w in W.items()}
        trial_log = []
        for hl in HL_GRID:
            r = np.mean([evaluate(w, span, hl)["train"] / baseA[n]["train"] for n, w in W.items()])
            trial_log.append({"HL": hl, "train_ratio_mean": round(float(r), 4)})
        best = min(trial_log, key=lambda t: t["train_ratio_mean"])["HL"]
        rows = []
        exc = {"A": {}, "B": {}}
        for n, w in W.items():
            a, b = baseA[n], evaluate(w, span, best)
            n_tr = int(len(w) * TRAIN_FRAC)
            te = w.iloc[n_tr:]
            # state terciles of sigma_t / sqrt(Vbar), edges from train
            ratio = (w["sig"] / np.sqrt(w["vbar"])).to_numpy()
            e1, e2 = np.quantile(ratio[:n_tr], [1 / 3, 2 / 3])
            terc = np.digitize(ratio[n_tr:], [e1, e2])
            for arm, res in (("A", a), ("B", b)):
                ex = te["hl"].to_numpy() > res["pred75_test"]
                ex50 = te["hl"].to_numpy() > res["pred50_test"]
                for t in range(3):
                    m = terc == t
                    acc = exc[arm].setdefault(t, [0, 0, 0])
                    acc[0] += int(ex[m].sum()); acc[1] += int(m.sum()); acc[2] += int(ex50[m].sum())
            rows.append({"inst": n, "est": data[n][2], "n_windows": len(w), "n_test": len(te),
                         "ratio_test": round(b["test"] / a["test"], 4),
                         "A_exc50": round(float((te["hl"].to_numpy() > a["pred50_test"]).mean()), 3),
                         "B_exc50": round(float((te["hl"].to_numpy() > b["pred50_test"]).mean()), 3),
                         "A_exc75": round(float((te["hl"].to_numpy() > a["pred75_test"]).mean()), 3),
                         "B_exc75": round(float((te["hl"].to_numpy() > b["pred75_test"]).mean()), 3)})
        ratios = np.array([r["ratio_test"] for r in rows])
        med, share = float(np.median(ratios)), float((ratios < 1).mean())
        terc75 = {arm: [round(v[t][0] / v[t][1], 3) for t in range(3)] for arm, v in exc.items()}
        terc50 = {arm: [round(v[t][2] / v[t][1], 3) for t in range(3)] for arm, v in exc.items()}
        spread = {arm: round(max(v) - min(v), 3) for arm, v in terc75.items()}
        primary = med < 0.98 and share >= 0.60
        verdict = ("PASS" if spread["B"] <= spread["A"] else "MIXED") if primary else "FAIL"
        report["horizons"][hz] = {"span": span, "overlapping": step == 1, "trials": trial_log, "HL_chosen": best,
                                  "median_ratio": round(med, 4), "share_B_better": round(share, 3),
                                  "p75_exceed_by_state_tercile(calm,normal,stressed)": terc75,
                                  "p50_exceed_by_state_tercile": terc50, "p75_tercile_spread": spread,
                                  "verdict": verdict, "per_instrument": rows}
        print(f"\n{hz}: HL={best} median B/A={med:.4f} B better on {share:.0%} -> {verdict}")
        print("  trials", trial_log)
        print("  p75 exceed calm/normal/stressed  A", terc75["A"], " B", terc75["B"], " spread", spread)
        print("  p50 exceed calm/normal/stressed  A", terc50["A"], " B", terc50["B"])

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(report, indent=1, default=str))
    md = ["# HORIZON-REVERSION — results", "", "Pre-registration: `forge/HORIZON_REVERSION_PREREG.md`.", ""]
    for hz, r in report["horizons"].items():
        md += [f"## {hz} ({r['span']} sessions{', overlapping' if r['overlapping'] else ''})", "",
               f"**Verdict: {r['verdict']}**. HL chosen on train: {r['HL_chosen']} days. "
               f"Test pinball B÷A median **{r['median_ratio']}**; B better on **{r['share_B_better']:.0%}** of instruments.", "",
               "| state tercile | calm | normal | stressed | spread |", "|---|---|---|---|---|",
               f"| A p75 exceed (target 25%) | {' | '.join(f'{x:.1%}' for x in r['p75_exceed_by_state_tercile(calm,normal,stressed)']['A'])} | {r['p75_tercile_spread']['A']:.3f} |",
               f"| B p75 exceed | {' | '.join(f'{x:.1%}' for x in r['p75_exceed_by_state_tercile(calm,normal,stressed)']['B'])} | {r['p75_tercile_spread']['B']:.3f} |",
               f"| A p50 exceed (target 50%) | {' | '.join(f'{x:.1%}' for x in r['p50_exceed_by_state_tercile']['A'])} | |",
               f"| B p50 exceed | {' | '.join(f'{x:.1%}' for x in r['p50_exceed_by_state_tercile']['B'])} | |", "",
               "Trials (train, pooled B÷A): " + ", ".join(f"HL {t['HL']}: {t['train_ratio_mean']}" for t in r["trials"]), "",
               "| instrument | σ estimator | windows | test | B÷A pinball | A p50 exc | B p50 exc | A p75 exc | B p75 exc |",
               "|---|---|---|---|---|---|---|---|---|"]
        md += [f"| {x['inst']} | {x['est']} | {x['n_windows']} | {x['n_test']} | {x['ratio_test']} | {x['A_exc50']:.1%} | {x['B_exc50']:.1%} | {x['A_exc75']:.1%} | {x['B_exc75']:.1%} |"
               for x in sorted(r["per_instrument"], key=lambda x: x["ratio_test"])]
        md += [""]
    if report["dropped"]:
        md += ["Dropped: " + ", ".join(report["dropped"]), ""]
    (OUT / "RESULTS.md").write_text("\n".join(md), encoding="utf-8")
    print("\nwrote", OUT / "RESULTS.md")


if __name__ == "__main__":
    main()
