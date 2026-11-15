"""Evidence pack for day-type-expansion (register row evidence-pack-retrofit; EXPLORATORY diagnostics only, the banked
verdicts in RESULTS.md do not change).

The registered runner did not save its out-of-sample predictions, so this script rebuilds them with the runner's OWN
code (imports scripts/day-type-expansion/run.py: input_panel -> build_panel -> family_frame -> score_cell(full=False),
same seed, same folds, same lockbox-filtered M1 reader) and dumps them to
analysis/output/day-type-expansion/evidence/oos_predictions.parquet. Then for each family x k cell it runs
scripts/evidence_pack/pack.py with the study's headline statistic, BSS of the model M vs the sigma-only model B1:

    BSS_B1 = 1 - sum((pm - y)^2) / sum((p1 - y)^2)          pass bar U = +2.0% (prereg §5)

Row encoding for the pack: signal = pm - p1 (the model's lift over sigma-only; estimate_fn rebuilds pm = p1 + signal
so the shuffled placebo really scrambles the model's information), side = sign(signal), outcome = y - p1 (label
surprise vs sigma-only). Positive control: pm moved a fraction a of the way toward the realised label on the real rows,
with a solved so BSS rises by exactly the planted amount. Canary: pm = y (label leaked). Cluster = test date.

    python -X utf8 -I scripts/day-type-expansion/evidence.py
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

spec = importlib.util.spec_from_file_location("dte_run", HERE / "run.py")
R = importlib.util.module_from_spec(spec)
sys.modules["dte_run"] = R
spec.loader.exec_module(R)

OUT = ROOT / "analysis" / "output" / "day-type-expansion"
EV = OUT / "evidence"
VERDICT = {"fx": "NULL", "gold": "NULL", "idx": "UNDERPOWERED"}
EPS = 1e-6


def _pm(r):
    return np.clip(r["p1"].to_numpy(float) + r["signal"].to_numpy(float), EPS, 1 - EPS)


def bss_b1(r) -> float:
    y, p1 = r["y"].to_numpy(float), r["p1"].to_numpy(float)
    e1 = ((p1 - y) ** 2).sum()
    return float(1 - ((_pm(r) - y) ** 2).sum() / e1) if e1 > 0 else float("nan")


def plant(r, eff, rng):
    y = r["y"].to_numpy(float)
    pm = _pm(r)
    e1, em = ((r["p1"].to_numpy(float) - y) ** 2).sum(), ((pm - y) ** 2).sum()
    est = 1 - em / e1
    a = 1 - np.sqrt(max(1 - est - eff, 0.0) * e1 / em)
    pm2 = pm + a * (y - pm)
    out = r.copy()
    out["signal"] = pm2 - out["p1"].to_numpy(float)
    out["side"] = np.sign(out["signal"]).astype(int)
    return out


def leak(r, rng):
    out = r.copy()
    out["signal"] = out["y"].to_numpy(float) - out["p1"].to_numpy(float)
    out["side"] = np.sign(out["signal"]).astype(int)
    return out


def main():
    cfg = R.Cfg(root=str(ROOT), m1_root=str(ROOT / "VolRangeForecaster/data/m1"),
                index_root=str(ROOT / "portfolioBacktest/cache"), out=str(OUT), B=200, quiet=False)
    rng = np.random.default_rng(R.SEED)
    inp = R.input_panel(cfg)
    P, _ = R.build_panel(cfg, inp)
    EV.mkdir(parents=True, exist_ok=True)
    dumps, summary = [], []
    for fam in R.FAM:
        d = R.family_frame(P, fam)
        for k in R.KS:
            res = R.score_cell(d, fam, k, cfg, rng, full=False)
            o = res["_o"]
            assert pd.Timestamp(o["date"].max()) <= R.LOCKBOX, "lockbox breach"
            dumps.append(o.assign(family=fam, k=k)[["family", "k", "date", "inst", "fold", "y", "p1", "pm", "p0"]])
            rows = pd.DataFrame({"date": o["date"], "inst": o["inst"], "y": o["y"].astype(float),
                                 "p1": o["p1"].astype(float), "signal": (o["pm"] - o["p1"]).astype(float)})
            rows["side"] = np.sign(rows["signal"]).astype(int)
            rows["outcome"] = rows["y"] - rows["p1"]
            cell = f"{fam}_k{k}"
            tmp = EV / f"_build_{cell}"
            p = build_pack(rows, slug=f"day-type-expansion:{cell}", out=str(tmp), estimate_fn=bss_b1, bar=R.U,
                           unit="Brier skill vs sigma-only (fraction)", plant_fn=plant, leak_fn=leak,
                           verdict_word=VERDICT[fam], n_plants=30,
                           notes=("OOS predictions rebuilt with the runner's own functions (same seed/folds); the "
                                  f"registered BSS_B1 for this cell was {res['bss_b1']:+.4f}. The pack bootstraps "
                                  "dates iid (the runner used 21-day moving blocks), so its CI can be a little "
                                  "narrower. Placebo = the model's lift (pm - p1) shuffled across dates within "
                                  "instrument."))
            dest = EV / cell
            if dest.exists():
                shutil.rmtree(dest)
            shutil.move(str(tmp / "evidence"), str(dest))
            shutil.rmtree(tmp, ignore_errors=True)
            pc = {x["multiple_of_bar"]: x["detected_share"] for x in p["positive_control"]}
            line = (f"{cell}: est {p['estimate']:+.4f} (registered {res['bss_b1']:+.4f}) CI [{p['ci'][0]:+.4f}, "
                    f"{p['ci'][1]:+.4f}] placebo pct {p['placebo']['real_percentile']:.0f} plant1x {pc[1.0]:.2f} "
                    f"halves {[round(h['estimate'], 4) for h in p['by_half']]} canary "
                    f"{p['lookahead_canary']['estimate_with_leak']:+.3f} -> {p['diagnosis']['label']}")
            print(line, flush=True)
            summary.append(line)
    pd.concat(dumps, ignore_index=True).to_parquet(EV / "oos_predictions.parquet", index=False)
    (EV / "summary.txt").write_text("\n".join(summary) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
