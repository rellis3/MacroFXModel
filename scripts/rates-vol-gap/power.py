"""rates-vol-gap: power from the CONTROL only (signal circularly shifted >= 126 sessions, so it is
unrelated to the outcome by construction). Never computes the real-alignment statistic.
Writes analysis/output/rates-vol-gap/power.json for the prereg's section 5."""
import json

import numpy as np

from common import OUT, SEED, STATE_MP, STATE_VP, half, load, partial_corr, state_effect

rng = np.random.default_rng(SEED)
N_SHIFT = 400
res = {}
for h in (1, 5, 21):
    df0 = load(h)
    for part in ("explore", "confirm", "pooled"):
        df = df0 if part == "pooled" else half(df0, part)
        n = len(df)
        mp, vp = df["mp"].to_numpy(), df["vp"].to_numpy()
        state = (mp >= STATE_MP) & (vp <= STATE_VP)
        c1, c2 = [], []
        for _ in range(N_SHIFT):
            k = int(rng.integers(126, n - 126))
            d = df.copy()
            d["mp"] = np.roll(mp, k)
            c1.append(partial_corr(d, h))
            c2.append(state_effect(df, h, np.roll(mp, k)))
        se1, se2 = float(np.nanstd(c1)), float(np.nanstd(c2))
        res[f"h{h}_{part}"] = {
            "n_sessions": n, "state_days": int(state.sum()), "cheap_days": int((vp <= STATE_VP).sum()), "state_share": round(float(state.mean()), 3),
            "c1_placebo_mean": round(float(np.nanmean(c1)), 4), "c1_se": round(se1, 4), "c1_mde": round(2.8 * se1, 4),
            "c2_placebo_mean": round(float(np.nanmean(c2)), 4), "c2_se": round(se2, 4), "c2_mde": round(2.8 * se2, 4),
            "outcome_sd_log": round(float(df[f"y{h}"].std()), 3),
        }
        print(f"h{h} {part:8s}", res[f"h{h}_{part}"])
json.dump({"seed": SEED, "n_shift": N_SHIFT, "cells": res}, open(OUT / "power.json", "w"), indent=1)
