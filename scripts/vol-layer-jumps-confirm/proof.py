"""Proof pack for vol-layer-jumps-confirm: planted effects, shuffles, power and reproduction for every banked cell.

    python -X utf8 scripts/vol-layer-jumps-confirm/proof.py

Cells (one checks.json question each, judged by forge/verdict_gate.decide):
  t1  touch excess over the vol clock, bursts minus near-burst controls, d = 0.5, 60 min (probability units; bar +0.05)
  t2  mean loss beyond the stop per hit, bursts minus controls, d = 0.5 (R; bar +0.05R)
  a   closure of candidate (a): large market-wide bursts (size > 0.703, 3+ instruments), follow net of spread at 60 min
      (sigma; bar 0.03 = jump-after PATH_MIN). Discovery sessions only (< 2023-01-01), as the prereg's §5 quotes it.

What each proof does:
  * Reproduction: re-runs run.py's own t1/t2 on confirm/events_scored.parquet and compares with confirm/confirm.json; for (a)
    re-computes the prereg's quoted discovery numbers (+0.040 [-0.040, +0.122]). A miss marks diagnostics not ok.
  * Planted (t1): flips untouched burst sides to touched with a probability sized so the burst touch rate rises by the
    stated amount (large 0.15, minimum 0.05); shift = how far the measured delta moved.
  * Planted (t2): adds an exponential extra loss to burst hits, mean = the stated size in R (large 0.15R, minimum 0.05R).
  * Planted (a): jump-after's tape plants (pl_large 0.20 sigma, pl_min 0.03 sigma), on the same discovery bursts.
  * Shuffle (t1, t2): the confirm run's 200 per-moment label shuffles (confirm.json). Shuffle (a): one random sign per
    moment, 200 draws (jump-after A3).
checks.json is written only if every gate word equals the word in RESULTS (results.json); otherwise
checks_MISMATCH_do_not_commit.json and exit 2.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT)]
from forge import verdict_gate as G  # noqa: E402

_spec = importlib.util.spec_from_file_location("jc_run", ROOT / "scripts/vol-layer-jumps-confirm/run.py")
RUN = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(RUN)

SLUG = "vol-layer-jumps-confirm"
OUT = ROOT / "analysis/output" / SLUG
LARGE_SIZE, LARGE_MIN = 0.703, 3
PATH_MIN = 0.03
TOL = 2e-4


def same(a, b, tol=TOL):
    return a is not None and b is not None and abs(a - b) <= tol


def cell_t(name, R, S, conf, rng):
    F, C = R[R.kind == "flag"], R[R.kind == "control"]
    d = RUN.BASE_D
    fn = RUN.t1 if name == "t1" else RUN.t2
    base = fn(S, F, C)
    banked = conf["cells"][name.upper()]["base"]
    repro = all(same(base[k], banked[k]) for k in ("est", "lo", "hi"))

    def plant(size):
        F2 = F.copy()
        if name == "t1":
            for side in ("L", "S"):
                col = f"t{d}_60{side}"
                zero = F2[col].to_numpy() == 0
                q = size / zero.mean()
                flip = zero & (rng.random(len(F2)) < q)
                F2[col] = np.where(flip, 1.0, F2[col].to_numpy())
        else:
            for side in ("L", "S"):
                col = f"o{d}{side}"
                v = F2[col].to_numpy(float).copy()
                hit = np.isfinite(v)
                v[hit] = v[hit] + rng.exponential(size * d, hit.sum())        # +size R on average per hit
                F2[col] = v
        e2 = fn(S, F2, C)
        return {"injected": size, "shift": float(e2["est"] - base["est"]), "lo_after": e2["lo"],
                "how": ("flipped untouched burst sides to touched so the burst touch rate rises by %.2f" % size) if name == "t1"
                else ("added an exponential extra loss (mean %.2fR) to every burst stop hit" % size)}

    sh = conf["cells"][name.upper()]["shuffle"]
    ctrl = json.loads((OUT / "control/controls.json").read_text())
    disc = json.loads((OUT / "discovery/discovery.json").read_text())
    ok = bool(repro and ctrl["pass"] and disc["pass"])
    return dict(
        effect=base["est"], lo=base["lo"], hi=base["hi"], min_effect=RUN.BAR[name.upper()],
        diagnostics={"ok": ok, "why": None if ok else "re-run did not reproduce confirm.json, or controls / step 0 failed",
                     "note": f"positive controls pass {ctrl['pass']}, discovery reproduction pass {disc['pass']}; re-run of t-cell "
                             f"{'matches' if repro else 'DOES NOT match'} confirm.json",
                     "mde_prereg": conf["cells"][name.upper()]["gate"]["powered_prereg_mde"], "mde_realised": base["mde"]},
        planted_large=plant(0.15), planted_min=plant(0.05),
        shuffle={"lo": sh["lo"], "hi": sh["hi"], "mean": sh["mean"], "draws": sh["draws"],
                 "false_positive_rate": sh["share_draws_ci_excludes_0"], "how": "per-moment label shuffle within London hour, 200 draws (run.py)"},
        rows={"used": int(len(F)) + int(len(C)) if name == "t1" else base["hits_burst"] + base["hits_control"],
              "dropped": int(conf["dropped"]), "note": f"{len(F)} bursts, {len(C)} controls; dropped = events with no sigma / entry bar / path"})


def cell_a(rng):
    """(a) on discovery sessions only, as the prereg quotes it (jc_power.py logic)."""
    E = pd.read_parquet(RUN.EV)
    E = E[(E.ver == "x") & (E.date < RUN.DISC_END)].copy()
    sig = {s: RUN.load_sig(s) for s in E.inst.unique()}
    E["sg"] = [sig[i].get(d, np.nan) for i, d in zip(E.inst, E.date)]
    E["cost_m60"] = 0.5 * (E.sp_m60 + E.spread0) / E.sg
    fl = E.kind == "flag"
    E.loc[fl, "cojump"] = E[fl].groupby(["date", "slot"]).inst.transform("size")
    F = E[fl]
    lc = F[(F.cojump >= LARGE_MIN) & (F["size"] > LARGE_SIZE)]
    dates = np.array(sorted(E.date.unique()))
    di = {d: i for i, d in enumerate(dates)}
    r0 = np.random.default_rng(RUN.SEED)
    nb = int(np.ceil(len(dates) / 20))
    starts = r0.integers(0, len(dates), size=(2000, nb))
    W = np.zeros((2000, len(dates)))
    for b in range(2000):
        idx = (starts[b][:, None] + np.arange(20)[None, :]).ravel()[: len(dates)] % len(dates)
        np.add.at(W[b], idx, 1)

    def bm(part, y):
        y = np.asarray(y, float); k = np.isfinite(y)
        ii = np.array([di[d] for d in part.date[k]])
        reps = (W @ np.bincount(ii, y[k], len(dates))) / (W @ np.bincount(ii, None, len(dates)))
        return float(y[k].mean()), float(np.percentile(reps, 2.5)), float(np.percentile(reps, 97.5)), int(k.sum())

    est, lo, hi, n = bm(lc, lc.m60 - lc.cost_m60)
    g_est, g_lo, g_hi, _ = bm(lc, lc.m60)
    repro = same(round(est, 3), 0.040, 1.5e-3) and same(round(lo, 3), -0.040, 3e-3) and same(round(hi, 3), 0.122, 3e-3)
    pl = {}
    for nm, dl in (("min", 0.03), ("large", 0.20)):
        k = lc[f"pl_{nm}"].notna() & lc.m60.notna()
        pl[nm] = {"injected": dl, "shift": float(lc[f"pl_{nm}"][k].mean() - lc.m60[k].mean()), "how": "jump-after tape plant: every close after the burst moved by sign x delta x sigma"}
    f = lc[lc.m60.notna()]
    g = f.groupby(["date", "slot"]).ngroup().to_numpy()
    x = f.m60.to_numpy()
    means, hits = [], 0
    for _ in range(200):
        m_, l_, h_, _ = bm(f, x * rng.choice([-1.0, 1.0], g.max() + 1)[g])
        means.append(m_)
        hits += (l_ > 0) or (h_ < 0)
    sh = {"lo": float(np.percentile(means, 2.5)), "hi": float(np.percentile(means, 97.5)), "mean": float(np.mean(means)), "draws": 200,
          "false_positive_rate": hits / 200, "how": "one random sign per 5-minute moment on the gross 60-minute follow, 200 draws"}
    moments = int(f.groupby(["date", "slot"]).ngroups)
    return dict(
        effect=est, lo=lo, hi=hi, min_effect=PATH_MIN,
        diagnostics={"ok": bool(repro), "why": None if repro else "did not reproduce the prereg's discovery numbers",
                     "note": f"discovery sessions only (< 2023-01-01). Net follow {est:+.3f} sigma [{lo:+.3f}, {hi:+.3f}], gross {g_est:+.3f} [{g_lo:+.3f}, {g_hi:+.3f}], "
                             f"{n} bursts in {moments} moments. Prereg §5: on 2023-26 the MDE is 0.141 sigma (228 moments), on 2017-26 0.090 sigma "
                             "(558 moments), against a 0.03 sigma bar: UNDERPOWERED by design on any data we hold. 2023+ outcomes not read.",
                     "mde_prereg_2023_26": 0.141, "mde_prereg_2017_26": 0.090},
        planted_large=pl["large"], planted_min=pl["min"], shuffle=sh,
        rows={"used": int(n), "dropped": int(len(lc) - n), "note": f"{moments} distinct moments"})


def main():
    conf = json.loads((OUT / "confirm/confirm.json").read_text())
    res = json.loads((OUT / "results.json").read_text())
    expected = {c["proof_key"]: c["verdict"].upper() for c in res["cells"]}
    R = RUN.prep(pd.read_parquet(OUT / "confirm/events_scored.parquet"))
    S = RUN.Stat(R.date, np.random.default_rng(RUN.SEED))
    rng = np.random.default_rng(RUN.SEED + 1)
    q = {"t1": cell_t("t1", R, S, conf, rng), "t2": cell_t("t2", R, S, conf, rng), "a": cell_a(rng)}
    out = {k: {**c, **G.decide(c)} for k, c in q.items()}
    bad = []
    for k, r_ in out.items():
        exp = expected.get(k)
        print(f"{k}: gate {r_['verdict']:13s} results {exp}  power {None if r_['power'] is None else round(r_['power'], 3)}  {r_['reasons']}")
        if r_["verdict"] in ("INVALID", "INCOMPLETE") or r_["verdict"] != exp:
            bad.append(k)
    dflt = lambda o: o.item() if hasattr(o, "item") else str(o)
    if bad:
        p = OUT / "checks_MISMATCH_do_not_commit.json"
        p.write_text(json.dumps(out, indent=1, default=dflt), encoding="utf-8")
        print(f"STOP: {bad} disagree with RESULTS or are INVALID/INCOMPLETE. Wrote {p}; checks.json NOT written.")
        sys.exit(2)
    p = OUT / "checks.json"
    p.write_text(json.dumps(out, indent=1, default=dflt), encoding="utf-8")
    print(f"PASS: wrote {p}")


if __name__ == "__main__":
    main()
