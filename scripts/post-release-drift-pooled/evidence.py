"""Evidence pack for post-release-drift-pooled (register row evidence-pack-retrofit; EXPLORATORY diagnostics only,
the banked verdicts in RESULTS.md do not change).

Rebuilds the scored rows from the study's own saved measurement (analysis/output/post-release-drift-pooled/rows.parquet
+ events.parquet) with the study's own y_cols(), then runs scripts/evidence_pack/pack.py on the headline cells:

    drift_h2     side = surprise sign x instrument direction (dir_sig); outcome = ln(P_21:00/P_entry)/sigma (raw, sigma)
    momentum_h2  side = sign of the first-15-minute move (dir_mom); same outcome

Headline statistic = the study's: mean over scored events (>= 3 instruments measured) of the per-event mean of
side x outcome. Pass bar 0.10 sigma at h2 (prereg §5). Cluster = the study's overlap clusters (union-find of event
windows). Cost = the study's cost in R units x 0.5 (R is measured at a 0.5 sigma stop) -> sigma.

    python -X utf8 -I scripts/post-release-drift-pooled/evidence.py
"""
from __future__ import annotations

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
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "scripts" / "evidence_pack"))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from pack import build_pack  # noqa: E402
import pipeline as PL  # noqa: E402
from common import OUT, BARS  # noqa: E402

LOCKBOX = pd.Timestamp("2026-08-21", tz="UTC")


def event_estimate(r: pd.DataFrame) -> float:
    """Mean over events of the per-event mean of side*outcome; >= 3 instruments when the subset has >= 3 (a
    single-instrument breakdown uses every event). Bootstrap duplicates of an event keep their weight."""
    y = (r["side"] * r["outcome"]).to_numpy(float)
    ok = np.isfinite(y) & (r["side"].to_numpy() != 0)
    if ok.sum() == 0:
        return float("nan")
    d = pd.DataFrame({"eid": r["eid"].to_numpy()[ok], "inst": r["inst"].to_numpy()[ok], "y": y[ok]})
    need = min(3, d["inst"].nunique())
    g = d.groupby("eid")
    m, n_rows, n_inst = g["y"].mean(), g.size(), g["inst"].nunique()
    keep = n_inst >= need
    w = (n_rows / n_inst)[keep]
    return float((m[keep] * w).sum() / w.sum()) if w.sum() > 0 else float("nan")


def plant(r, eff, rng):
    return r.assign(outcome=r["outcome"] + eff * r["side"])


def leak(r, rng):
    return r.assign(side=np.sign(r["outcome"]).astype(int), signal=r["outcome"])


def rows_for(R: pd.DataFrame, clus: pd.Series, tag: str, h: str) -> pd.DataFrame:
    dcol = "dir_sig" if tag == "sig" else "dir_mom"
    y = R[f"y_{tag}_{h}"]
    sub = R[y.notna()].copy()
    out = pd.DataFrame({
        "date": sub["t"].dt.tz_convert("Europe/London").dt.date.astype(str),
        "inst": sub["inst"], "eid": sub["eid"],
        "family": sub["family"],
        "signal": (sub[dcol] * sub["z"].abs().fillna(1.0)) if tag == "sig" else sub["m"] / sub["sig"],
        "side": sub[dcol].astype(int),
        "outcome": sub[f"raw_{h}"],
        "cost": 0.5 * sub[f"costR_{tag}_{h}"].fillna(0.0),
        "cluster": sub["eid"].map(clus).astype(str),
    })
    assert pd.to_datetime(out["date"]).max() <= pd.Timestamp("2026-08-21"), "lockbox breach"
    return out.reset_index(drop=True)


def run_cell(rows, cell, verdict, notes):
    tmp = OUT / "evidence" / f"_build_{cell}"
    pack = build_pack(rows, slug=f"post-release-drift-pooled:{cell}", out=str(tmp), estimate_fn=event_estimate,
                      bar=BARS["h2"], unit="daily sigma", plant_fn=plant, leak_fn=leak, verdict_word=verdict,
                      notes=notes)
    dest = OUT / "evidence" / cell
    if dest.exists():
        shutil.rmtree(dest)
    shutil.move(str(tmp / "evidence"), str(dest))
    shutil.rmtree(tmp, ignore_errors=True)
    return pack


def main():
    rows = pd.read_parquet(OUT / "rows.parquet")
    ev = pd.read_parquet(OUT / "events.parquet")
    ev = ev[ev["t"] <= LOCKBOX + pd.Timedelta(days=1)]
    R = PL.y_cols(rows, ev, None)
    R = R.merge(ev[["eid", "z"]], on="eid", how="left")
    R = R[R["s"] != 0]
    scored = ev[ev["s"] != 0]
    clus = PL.clusters_for(scored)
    note = ("Rows rebuilt from the study's saved rows.parquet via its own y_cols(); headline recomputed here as the "
            "event-weighted mean (>= 3 instruments). Halves split at the median row date (the prereg split was "
            "2018-01-01). Cost converted from R at the 0.5 sigma stop (x0.5). The placebo here shuffles each "
            "instrument's side across dates; the study's own placebo used random non-release times.")
    out = {}
    for cell, tag, verdict in (("drift_h2", "sig", "UNDERPOWERED"), ("momentum_h2", "mom", "NULL")):
        r = rows_for(R, clus, tag, "h2")
        p = run_cell(r, cell, verdict, note)
        out[cell] = p
        pc = {x["multiple_of_bar"]: x["detected_share"] for x in p["positive_control"]}
        print(cell, f"est {p['estimate']:+.4f} CI [{p['ci'][0]:+.4f}, {p['ci'][1]:+.4f}] placebo pct "
              f"{p['placebo']['real_percentile']:.1f} plant1x {pc[1.0]:.2f} halves "
              f"{[round(h['estimate'], 4) for h in p['by_half']]} canary {p['lookahead_canary']['estimate_with_leak']:+.3f} "
              f"net {p.get('net_of_cost')} -> {p['diagnosis']['label']}")
    return out


if __name__ == "__main__":
    main()
