"""POST-HOC, descriptive (prereg amendment A1): evidence packs for the FORCED regime picker.

The registered books never traded (every rule lost in every regime in training, so the picker chose FLAT every
quarter), which leaves the registered packs with nothing to plant onto. To show WHY, this packs the picker that is
forced to trade: at each quarterly refit it takes the best training-mean rule per regime even when that mean is
negative. Rows = test instrument-sessions, outcome = the forced pick's net R, side = 1. Never scored.

    python -X utf8 -I scripts/regime-picks-rule/evidence_forced.py
"""
import importlib.util
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("MKL_NUM_THREADS", "2")
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("rpr", ROOT / "scripts/regime-picks-rule/run.py")
rpr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rpr)
from pack import build_pack  # noqa: E402  (path added by run.py)

OUT = rpr.OUT
df = pd.read_parquet(OUT / "rows.parquet").sort_values(["inst", "date"]).reset_index(drop=True)
assert df["date"].max() <= rpr.LOCKBOX
R = np.nan_to_num(df[["R_FADE", "R_FOLLOW", "R_BREAK"]].to_numpy(float), nan=0.0)
dnum = df["date"].to_numpy("datetime64[D]").astype(np.int64)
test = (df["oos"].to_numpy() == 1) & (df["date"] >= rpr.TEST_START).to_numpy()
refits = rpr.refit_dates(df.loc[test, "date"])
rn = np.array(refits, dtype="datetime64[D]").astype(np.int64)
train = np.ones(len(df), bool)
T = df[test].reset_index(drop=True)
T["cluster"] = pd.factorize(T["date"])[0] // rpr.BLOCK
q = df["hl_sig"].quantile([1 / 3, 2 / 3]).to_numpy()
oracle = np.maximum(R[test].max(1), 0.0)


def forced(col):
    cats = sorted({x for x in df[col] if x is not None and x == x})
    mp = {c: i for i, c in enumerate(cats)}
    codes = np.array([mp.get(x, -1) for x in df[col]])
    # the registered picker with the 'mean > 0' condition removed: min_n 100, best mean even if negative
    pick = np.full(len(df), -1)
    edges = list(rn) + [np.inf]
    picks = []
    for i in range(len(rn)):
        tr = train & (dnum < edges[i]) & (codes >= 0)
        cnt = np.bincount(codes[tr], minlength=len(cats))
        sums = np.stack([np.bincount(codes[tr], weights=R[tr, k], minlength=len(cats)) for k in range(3)], 1)
        m = sums / np.maximum(cnt, 1)[:, None]
        ch = np.where(cnt >= 100, m.argmax(1), -1)
        picks.append({c: rpr.RULES[ch[j]] if ch[j] >= 0 else "FLAT" for j, c in enumerate(cats)})
        sel = (dnum >= edges[i]) & (dnum < edges[i + 1]) & (codes >= 0)
        pick[sel] = ch[codes[sel]]
    return rpr.book_R(pick, R), picks


summary = {}
smo, _ = forced("hmm_s")
for F in rpr.FAMS:
    b, picks = forced(F)
    rows = pd.DataFrame({"date": T["date"], "inst": T["inst"], "cluster": T["cluster"], "signal": T[F].astype(str),
                         "side": 1, "outcome": b[test]})
    leak = smo[test] if F == "hmm" else oracle
    est = lambda r: float((r["side"] * r["outcome"]).mean())
    plant = lambda r, e, g: r.assign(outcome=r["outcome"] + e)
    leakf = lambda r, g, _l=leak: r.assign(outcome=_l)
    p = build_pack(rows, slug=f"regime-picks-rule forced-{F} (post-hoc, descriptive)", out=str(OUT / f"forced-{F}"),
                   estimate_fn=est, bar=rpr.BAR, unit="R per instrument-session", plant_fn=plant, leak_fn=leakf,
                   verdict_word="descriptive (A1)", seed=rpr.SEED, B=1000, n_placebo=200, n_plants=40,
                   signal_is_state=True,
                   notes="POST-HOC (amendment A1). The forced picker takes the best training-mean rule per regime "
                         "at each quarterly refit even when that mean is negative. Not scored.")
    uniq = []
    for d, s in zip(refits, picks):
        if not uniq or uniq[-1][1] != s:
            uniq.append((str(d.date()), s))
    summary[F] = {"estimate": p["estimate"], "ci": p["ci"], "label": p["diagnosis"]["label"],
                  "checks": p["diagnosis"]["checks"], "placebo": p["placebo"], "plant": p["positive_control"],
                  "canary": p.get("lookahead_canary"), "by_half": p["by_half"], "pick_changes": uniq}
    print(F, f"{p['estimate']:+.4f}", p["ci"], p["diagnosis"]["label"], flush=True)
(OUT / "forced_packs.json").write_text(json.dumps(summary, indent=1, default=str))
