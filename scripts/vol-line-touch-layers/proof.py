"""vol-line-touch-layers, step 4: proof pack (A1 item 9) and checks.json through forge/verdict_gate.py.
Headline combo only. Plants +0.30R / +0.06R on the top third of err10 (both windows), shuffles outcomes within
discovery dates, reruns the whole pipeline each time.
    python -X utf8 scripts/vol-line-touch-layers/proof.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import FEATS, FROZEN, OUT, SEED, WT, Boot, fit_predict, load, summ, walk_forward  # noqa: E402

sys.path.insert(0, str(WT / "forge"))
from verdict_gate import write_checks  # noqa: E402

SLUG = "vol-line-touch-layers"
MIN_EFFECT = 0.03


def pipeline(Ed, yd, Ec, feats):
    oof = walk_forward(Ed, yd, feats)
    ok = np.isfinite(oof)
    t = np.quantile(oof[ok], 0.8)
    _, pc = fit_predict(Ed, yd, Ec, feats)
    return pc >= t


def main():
    P = json.loads((FROZEN / "params.json").read_text(encoding="utf-8"))
    R = json.loads((OUT / "confirm/confirm.json").read_text(encoding="utf-8"))
    side, shape = P["headline"]["side"], P["headline"]["shape"]
    key = f"{side}_{shape}"
    col = f"r_{key}"
    Ed, Ec = load("disc"), load("conf")
    yd, yc = Ed[col].to_numpy(), Ec[col].to_numpy()
    D = Ec.date.to_numpy()
    boot = Boot(D)
    L, Bf = FEATS["layered"], FEATS["base"]
    real_tl = pipeline(Ed, yd, Ec, L)
    real_tb = pipeline(Ed, yd, Ec, Bf)
    frozen_tl = R["B1"][key]["layered"]["taken"]["n"]
    repro = {"refit_taken_n": int(real_tl.sum()), "frozen_taken_n": int(frozen_tl), "match": bool(real_tl.sum() == frozen_tl)}
    m_tl = yc[real_tl].mean()
    m_diff = yc[real_tl].mean() - yc[real_tb].mean()

    cut = Ed.err10.quantile(2 / 3)
    plants = {}
    for name, size in (("large", 0.30), ("min", 0.06)):
        yd2 = yd + size * (Ed.err10.to_numpy() >= cut)
        yc2 = yc + size * (Ec.err10.to_numpy() >= cut)
        tl = pipeline(Ed, yd2, Ec, L)
        plants[name] = {"injected": size,
                        "B1": {"injected": size, "shift": round(float(yc2[tl].mean() - m_tl), 5)},
                        "B2": {"injected": size, "shift": round(float((yc2[tl].mean() - yc2[real_tb].mean()) - m_diff), 5)}}
        print("plant", name, plants[name], flush=True)

    rng = np.random.default_rng(SEED)
    ys = yd.copy()
    for _, ix in Ed.groupby("date").indices.items():
        ys[ix] = ys[rng.permutation(ix)]
    tls = pipeline(Ed, ys, Ec, L)
    tbs = pipeline(Ed, ys, Ec, Bf)
    sh_b1 = summ(*boot.diff(D[tls], yc[tls], D, yc))
    sh_b2 = summ(*boot.diff(D[tls], yc[tls], D[tbs], yc[tbs]))
    print("shuffle", sh_b1, sh_b2, flush=True)

    b1 = R["B1"][key]["layered"]
    b2 = R["B2"][key]
    share = float(real_tl.mean())
    diag = {"ok": bool(0.05 <= share <= 0.5 and repro["match"]), "take_share": round(share, 4), "reproduction": repro,
            "why": "take share outside 5-50% or refit does not reproduce the frozen take-list"}
    Q = {
        f"{SLUG}-meta": {"effect": b1["taken"]["est"], "lo": b1["taken"]["lo"], "hi": b1["taken"]["hi"], "min_effect": MIN_EFFECT,
                         "diagnostics": diag, "planted_large": plants["large"]["B1"], "planted_min": plants["min"]["B1"],
                         "shuffle": {**sh_b1, "lo": sh_b1["lo"], "hi": sh_b1["hi"], "what": "shuffled-model taken minus all, real confirm outcomes"},
                         "rows": b1["taken"]["n"],
                         "gate_parts": {"lag": b1["lag_taken"]["est"] > 0, "years_3_of_4": b1["years_pos"] >= 3}},
        f"{SLUG}-add": {"effect": b2["est"], "lo": b2["lo"], "hi": b2["hi"], "min_effect": MIN_EFFECT, "diagnostics": diag,
                        "planted_large": plants["large"]["B2"], "planted_min": plants["min"]["B2"],
                        "shuffle": {**sh_b2, "what": "shuffled layered minus shuffled base taken, real confirm outcomes"},
                        "rows": b1["taken"]["n"]},
    }
    out = write_checks(SLUG, Q, root=WT / "analysis/output")
    for k, v in out.items():
        print(k, v["verdict"], v["reasons"], "power", v["power"])


if __name__ == "__main__":
    main()
