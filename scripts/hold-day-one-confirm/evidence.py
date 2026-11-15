"""Evidence pack for hold-day-one-confirm (register row evidence-pack-retrofit; EXPLORATORY diagnostics only, the
banked verdicts in RESULTS.md do not change).

Rebuilds the scored rows with the runner's OWN code: imports scripts/hold-day-one-confirm/run.py and calls run() with
three hooks swapped (score -> also captures the stats/outcome arrays it is handed; describe and write_outputs ->
skipped), writing the runner's side files to a scratch folder so the banked outputs are untouched. Lockbox, M1 reader,
labels, drift b, one-position rule and the coin placebo are all the runner's.

Two cells, each with one row per (day one, instrument, horizon h in 1,2,3,5):
    run     side = day-one direction S on STRONG days; outcome = Z_h - h*b (sigma, net of the expanding drift)
            P-bar = 1/4 sum_h mean_h(side*outcome)/sqrt(h)                      bar U = 0.10
    hold-r  STRONG entries after the one-open-position rule; R = the runner's hold R for the chosen side, net of the
            0.03 R cost; P-bar(STRONG) minus the (fixed) coin-entry P-bar        bar U = 0.10 R
Signal = |day-one move| / sigma. Positive control adds bar*sqrt(h) to the chosen side's outcome on every row (P-bar
rises by exactly the bar). Canary: side = the sign of the realised outcome (run) / the better of long and short (hold-r).

    python -X utf8 -I scripts/hold-day-one-confirm/evidence.py
"""
from __future__ import annotations

import importlib.util
import math
import os
import shutil
import sys
import tempfile
from dataclasses import replace
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

spec = importlib.util.spec_from_file_location("hdoc_run", HERE / "run.py")
R = importlib.util.module_from_spec(spec)
sys.modules["hdoc_run"] = R
spec.loader.exec_module(R)

OUT = ROOT / "analysis" / "output" / "hold-day-one-confirm"
EV = OUT / "evidence"
CAP = {}


def capture_run():
    orig_score, orig_make = R.score, R.make_stats

    def score(stats, O, Wb, shifts, mc_sd, dates, cfg, which=R.SCORED):
        if "stats" not in CAP and not shifts:
            CAP.update(stats=stats, O=O, dates=dates)
        return orig_score(stats, O, Wb, shifts, mc_sd, dates, cfg, which)

    def make_stats(lab, taken=None, coin=None):
        CAP.setdefault("lab", lab)
        return orig_make(lab, taken=taken, coin=coin)

    R.score, R.make_stats = score, make_stats
    R.describe = lambda *a, **k: {}
    R.write_outputs = lambda *a, **k: None
    scratch = tempfile.mkdtemp(prefix="hdoc_evidence_")
    cfg = R.Cfg(root=str(ROOT), m1_root=str(ROOT / "VolRangeForecaster/data/m1"),
                index_root=str(ROOT / "portfolioBacktest/cache"), out=scratch, B=200, n_mc=150)
    cells = R.run(cfg)
    shutil.rmtree(scratch, ignore_errors=True)
    return cells, cfg


def long_rows(mask_by_h, side, outcome_by_h, extra_by_h, dates, insts, z1):
    rec = []
    for h in R.H:
        mk = mask_by_h[h] if isinstance(mask_by_h, dict) else mask_by_h
        di, ii = np.nonzero(mk)
        d = pd.DataFrame({"date": dates[di], "inst": np.asarray(insts)[ii], "h": h,
                          "side": side[di, ii].astype(int), "signal": np.abs(z1[di, ii])})
        for k, arr in outcome_by_h(h).items():
            d[k] = arr[di, ii]
        for k, arr in (extra_by_h(h) if extra_by_h else {}).items():
            d[k] = arr[di, ii]
        rec.append(d)
    return pd.concat(rec, ignore_index=True)


def pbar(r, col):
    out = 0.0
    for h in R.H:
        g = r[col][r["h"].to_numpy() == h]
        g = g[np.isfinite(g)]
        if len(g) == 0:
            return float("nan")
        out += g.mean() / math.sqrt(h)
    return out / len(R.H)


def main():
    cells, cfg = capture_run()
    S, O, dates, lab = CAP["stats"], CAP["O"], CAP["dates"], CAP["lab"]
    insts, z1, side = list(cfg.insts), lab["z1"], lab["S"]
    assert pd.Timestamp(dates.max()) <= R.LOCKBOX, "lockbox breach"
    EV.mkdir(parents=True, exist_ok=True)

    # ── run ──
    strong = lab["L"]["STRONG"]
    rr = long_rows(strong, side, lambda h: {"outcome": O[f"Z{h}"] - h * O["b"]}, None, dates, insts, z1)
    rr = rr[np.isfinite(rr["outcome"])].reset_index(drop=True)
    est_run = lambda r: pbar(r.assign(_v=r["side"] * r["outcome"]), "_v")
    plant_run = lambda r, e, g: r.assign(outcome=r["outcome"] + e * np.sqrt(r["h"]) * r["side"])
    leak_run = lambda r, g: r.assign(side=np.sign(r["outcome"]).astype(int))

    # ── hold-r ──
    terms = S["hold-r"].terms
    taken = terms[0][1]
    cm, cs = terms[1][1], terms[1][2]
    coin_val = R.Stat.combine(R.Stat("coin", [(1, cm, cs, np.ones_like(cs), "R")]).sums(O), np.ones(len(dates)))[0]
    hr = long_rows(taken, side, lambda h: {"RL": O[f"RL{h}"], "RS": O[f"RS{h}"]}, None, dates, insts, z1)
    hr = hr[np.isfinite(hr["RL"]) & np.isfinite(hr["RS"])].reset_index(drop=True)
    hr["outcome"] = np.where(hr["side"] > 0, hr["RL"], hr["RS"]) - R.COST
    hr["cost"] = 0.0

    def est_hold(r):
        v = np.where(r["side"].to_numpy() > 0, r["RL"].to_numpy(), r["RS"].to_numpy()) - R.COST
        return pbar(r.assign(_v=v), "_v") - coin_val

    def plant_hold(r, e, g):
        add = e * np.sqrt(r["h"].to_numpy())
        pos = r["side"].to_numpy() > 0
        return r.assign(RL=r["RL"] + np.where(pos, add, 0.0), RS=r["RS"] + np.where(~pos, add, 0.0))

    leak_hold = lambda r, g: r.assign(side=np.where(r["RL"] >= r["RS"], 1, -1))

    common = ("Rows rebuilt with the runner's own run() (hooks capture its outcome arrays). The pack bootstraps "
              "dates iid; the runner used 21-day moving blocks widened to a Monte-Carlo SE floor, so the runner's "
              "CI is the binding one. Halves split at the median row date (runner: 2023-08-18). The pack's placebo "
              "shuffles each row's side within instrument (the runner's placebo shifted the label grid in time). ")
    summary = []
    for cell, rows, est, plant, leak, unit, extra in (
            ("run", rr, est_run, plant_run, leak_run, "sigma per sqrt-day (P-bar)", ""),
            ("hold-r", hr, est_hold, plant_hold, leak_hold, "R per sqrt-day (P-bar, net of 0.03 R)",
             f"Coin-entry P-bar held fixed at {coin_val:+.4f} R.")):
        reg = cells[cell]["value"]
        tmp = EV / f"_build_{cell}"
        p = build_pack(rows, slug=f"hold-day-one-confirm:{cell}", out=str(tmp), estimate_fn=est, bar=R.U, unit=unit,
                       plant_fn=plant, leak_fn=leak, verdict_word=cells[cell]["verdict"], n_plants=30,
                       notes=common + f"Registered P-bar {reg:+.4f}. " + extra)
        dest = EV / cell
        if dest.exists():
            shutil.rmtree(dest)
        shutil.move(str(tmp / "evidence"), str(dest))
        shutil.rmtree(tmp, ignore_errors=True)
        pc = {x["multiple_of_bar"]: x["detected_share"] for x in p["positive_control"]}
        line = (f"{cell}: est {p['estimate']:+.4f} (registered {reg:+.4f}) CI [{p['ci'][0]:+.4f}, {p['ci'][1]:+.4f}] "
                f"placebo pct {p['placebo']['real_percentile']:.0f} plant1x {pc[1.0]:.2f} halves "
                f"{[round(h['estimate'], 4) for h in p['by_half']]} canary "
                f"{p['lookahead_canary']['estimate_with_leak']:+.3f} -> {p['diagnosis']['label']}")
        print(line, flush=True)
        summary.append(line)
    (EV / "summary.txt").write_text("\n".join(summary) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
