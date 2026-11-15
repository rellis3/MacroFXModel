"""Evidence pack for bias-learner (register row evidence-pack-retrofit; EXPLORATORY diagnostics only, the banked
verdicts in RESULTS.md do not change).

The registered runner did not save its out-of-sample predictions, so this script rebuilds them with the runner's OWN
code (imports scripts/bias-learner/run.py: build_panel -> add_targets(with_R=False) -> make_data -> walk_forward, same
seed, same 2018 fold rule, same lockbox-filtered M1 reader) and dumps them to
analysis/output/bias-learner/evidence/oos_predictions.parquet. It then runs scripts/evidence_pack/pack.py on the two
fx cells the caller named (21:00|fx and +1|fx) with the study's headline statistic:

    BSS_B0 = 1 - sum((p - y)^2) / sum((b0 - y)^2)      y = 1 if the close at the horizon is above P0
    pass bar = the cell's registered useful effect U (power_table.json): 21:00|fx +0.186%, +1|fx +0.239%

Row encoding: signal = p - b0 (the model's lean beyond the base rate; estimate_fn rebuilds p = b0 + signal so the
shuffled placebo really scrambles the model), side = sign(signal), outcome = the per-row Brier improvement over B0,
(b0 - y)^2 - (p - y)^2. Positive control: p moved a fraction a toward the realised label on the real rows, a solved so
BSS rises by exactly the planted amount. Canary: p = y. Cluster = test date.

    python -X utf8 -I scripts/bias-learner/evidence.py
"""
from __future__ import annotations

import importlib.util
import os
import shutil
import sys
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("MKL_NUM_THREADS", "2")
for k in [k for k in os.environ if k.startswith("R2_")]:
    del os.environ[k]

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "evidence_pack"))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from pack import build_pack  # noqa: E402

spec = importlib.util.spec_from_file_location("bl_run", HERE / "run.py")
R = importlib.util.module_from_spec(spec)
sys.modules["bl_run"] = R
spec.loader.exec_module(R)

OUT = ROOT / "analysis" / "output" / "bias-learner"
EV = OUT / "evidence"
EPS = 1e-6
CELLS = ((0, "fx"), (1, "fx"))
VERDICT = {"fx": "NULL", "gold": "UNDERPOWERED", "idx": "UNDERPOWERED"}


def _p(r):
    return np.clip(r["b0"].to_numpy(float) + r["signal"].to_numpy(float), EPS, 1 - EPS)


def bss_b0(r) -> float:
    y, b0 = r["y"].to_numpy(float), r["b0"].to_numpy(float)
    e0 = ((b0 - y) ** 2).sum()
    return float(1 - ((_p(r) - y) ** 2).sum() / e0) if e0 > 0 else float("nan")


def plant(r, eff, rng):
    y, b0, p = r["y"].to_numpy(float), r["b0"].to_numpy(float), _p(r)
    e0, em = ((b0 - y) ** 2).sum(), ((p - y) ** 2).sum()
    est = 1 - em / e0
    a = 1 - np.sqrt(max(1 - est - eff, 0.0) * e0 / em)
    p2 = p + a * (y - p)
    return r.assign(signal=p2 - b0, side=np.sign(p2 - b0).astype(int))


def leak(r, rng):
    s = r["y"].to_numpy(float) - r["b0"].to_numpy(float)
    return r.assign(signal=s, side=np.sign(s).astype(int))


def predictions() -> pd.DataFrame:
    cache = EV / "oos_predictions.parquet"
    if cache.exists():
        return pd.read_parquet(cache)
    cfg = R.Cfg(root=str(ROOT), m1_root="VolRangeForecaster/data/m1", index_root="portfolioBacktest/cache",
                feature_root=str(ROOT / "features"), out=str(OUT), shuffles=0, jobs=1, gbm=False, with_R=False,
                descriptive_full=False)
    P, raw = R.build_panel(cfg)
    dates = pd.DatetimeIndex(sorted(P.date.unique()))
    P = R.add_targets(P, raw, with_R=False)
    del raw
    n_pre = int(((P.date < pd.Timestamp("2018-01-01")) & P.y0.notna()).sum())
    if n_pre < 2000 and 2018 in R.TEST_YEARS:
        R.TEST_YEARS.remove(2018)
    out = []
    for h in sorted({h for h, _ in CELLS}):
        D = R.make_data(P, h, dates, R.FEAT)
        p, _ = R.walk_forward(D, list(range(len(R.FEAT))))
        m = np.isfinite(p)
        out.append(pd.DataFrame({"h": R.HNAME[h], "date": dates[D.date_ix[m]], "inst": np.asarray(R.INST)[D.inst_ix[m]],
                                 "group": np.asarray(R.GROUPS)[D.grp[m]], "y": D.y[m], "b0": D.b0[m], "p": p[m]}))
    df = pd.concat(out, ignore_index=True)
    assert df["date"].max() <= R.LOCKBOX, "lockbox breach"
    EV.mkdir(parents=True, exist_ok=True)
    df.to_parquet(cache, index=False)
    return df


def main():
    df = predictions()
    summary = []
    for h, g in CELLS:
        key = f"{R.HNAME[h]}|{g}"
        sub = df[(df["h"] == R.HNAME[h]) & (df["group"] == g)]
        rows = pd.DataFrame({"date": sub["date"], "inst": sub["inst"], "y": sub["y"].astype(float),
                             "b0": sub["b0"].astype(float), "signal": (sub["p"] - sub["b0"]).astype(float)})
        rows["side"] = np.sign(rows["signal"]).astype(int)
        rows["outcome"] = (rows["b0"] - rows["y"]) ** 2 - (sub["p"].to_numpy() - rows["y"]) ** 2
        U = float(R.POWER["cells"][key]["U"])
        cell = key.replace("|", "_").replace(":", "").replace("+", "p")
        tmp = EV / f"_build_{cell}"
        pk = build_pack(rows, slug=f"bias-learner:{key}", out=str(tmp), estimate_fn=bss_b0, bar=U,
                        unit="Brier skill vs B0 (fraction)", plant_fn=plant, leak_fn=leak, verdict_word=VERDICT[g],
                        n_plants=30,
                        notes=("OOS predictions rebuilt with the runner's own functions (registered BSS_B0: 21:00|fx "
                               "+0.045%, +1|fx +0.048%). The pack bootstraps dates iid (runner: 21-date moving blocks, "
                               "SE floored by 200 block-shuffled-label refits), so the runner's CI is the binding one. "
                               "Placebo = the model's lean (p - b0) shuffled across dates within instrument (no refit). "
                               "Buckets: per-row Brier gain over B0 by decile of the lean. Halves at the median row "
                               "date (runner: 2018-21 vs 2022-26)."))
        dest = EV / cell
        if dest.exists():
            shutil.rmtree(dest)
        shutil.move(str(tmp / "evidence"), str(dest))
        shutil.rmtree(tmp, ignore_errors=True)
        pc = {x["multiple_of_bar"]: x["detected_share"] for x in pk["positive_control"]}
        line = (f"{key}: est {pk['estimate']:+.5f} CI [{pk['ci'][0]:+.5f}, {pk['ci'][1]:+.5f}] bar {U:+.5f} placebo pct "
                f"{pk['placebo']['real_percentile']:.0f} plant1x {pc[1.0]:.2f} halves "
                f"{[round(x['estimate'], 5) for x in pk['by_half']]} canary "
                f"{pk['lookahead_canary']['estimate_with_leak']:+.3f} -> {pk['diagnosis']['label']}")
        print(line, flush=True)
        summary.append(line)
    (EV / "summary.txt").write_text("\n".join(summary) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
