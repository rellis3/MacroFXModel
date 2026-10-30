"""vmc-nq-cipher: apply THE GATE and THE SCREEN-LEVEL GATE (prereg section 4) to the discovery screens and freeze the
survivors before validation is opened.

    python -I scripts/vmc-nq-cipher/freeze.py REAL_RUNS_DIR SYNTH_RUNS_DIR
Writes analysis/output/vmc-nq-cipher/discovery_cells.csv, survivors.json, sequencing_discovery.json.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import score  # noqa: E402

OUT = score.OUT


def gate_table(real, synth_tables):
    synth_t = {}
    for d in synth_tables:
        for name in ("R12", "race", "V12"):
            for tf, fam, t in zip(d.tf, d.family, d[f"{name}_t"]):
                synth_t.setdefault((name, tf, fam), []).append(abs(t) if np.isfinite(t) else np.nan)
    return score.survivors(real, synth_t)


def main(real_dir, synth_dir):
    real = pd.read_parquet(Path(real_dir) / "screen_real_disc.parquet")
    synth = sorted(Path(synth_dir).glob("screen_synth*_disc.parquet"))
    st = [pd.read_parquet(p) for p in synth]
    g = gate_table(real, st)
    # the same gate applied to each synthetic history (leave-one-out shuffle percentiles) prices the search
    counts = []
    for j, d in enumerate(st):
        rest = [x for i, x in enumerate(st) if i != j]
        gs = gate_table(d.assign(tag="s"), rest)
        counts.append(int(gs.survivor.sum()))
    n_real = int(g.survivor.sum())
    lim = float(np.percentile(counts, 95)) if counts else None
    screen_pass = n_real > lim if counts else False
    g.to_csv(OUT / "discovery_cells.csv", index=False)
    surv = g[g.survivor][["outcome", "tf", "family", "est", "t", "p", "h1", "h2"]]
    # mirror check: bull and bear halves must not have opposite signs
    mir = []
    for _, r in surv.iterrows():
        row = real[(real.tf == r.tf) & (real.family == r.family)].iloc[0]
        b1, b2 = row[f"{r.outcome}_bull"], row[f"{r.outcome}_bear"]
        mir.append(not (np.isfinite(b1) and np.isfinite(b2) and np.sign(b1) == -np.sign(b2) and r.outcome != "V12"))
    surv = surv.assign(mirror_ok=mir)
    frozen = surv[surv.mirror_ok] if screen_pass else surv.iloc[0:0]
    res = {"real_survivors": n_real, "synthetic_survivor_counts": counts, "synthetic_95th": lim,
           "screen_level_gate_passed": bool(screen_pass), "n_synthetic": len(st),
           "survivors_before_mirror": surv.to_dict("records"), "frozen": frozen.to_dict("records")}
    (OUT / "survivors.json").write_text(json.dumps(res, indent=1, default=float))
    # sequencing gate, discovery half
    seq_r = json.loads((Path(real_dir) / "seq_real_disc.json").read_text())
    seq_s = [json.loads(p.read_text()) for p in sorted(Path(synth_dir).glob("seq_synth*_disc.json"))]
    seq = {}
    for tf, v in seq_r.items():
        sv = [s[tf] for s in seq_s if s.get(tf) is not None]
        seq[tf] = {"real": v, "synth_mean": float(np.mean(sv)), "synth_975": float(np.percentile(sv, 97.5)),
                   "synth_min": float(np.min(sv)), "synth_max": float(np.max(sv)), "above": bool(v > np.percentile(sv, 97.5))}
    seq["gate_discovery"] = sum(1 for k, v in seq.items() if isinstance(v, dict) and v["above"]) >= 3
    (OUT / "sequencing_discovery.json").write_text(json.dumps(seq, indent=1))
    print(json.dumps({k: res[k] for k in ("real_survivors", "synthetic_survivor_counts", "synthetic_95th", "screen_level_gate_passed")}))
    print("frozen", len(frozen)); print(frozen.to_string() if len(frozen) else "")
    print(json.dumps(seq))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
