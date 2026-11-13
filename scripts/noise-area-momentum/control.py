"""noise-area-momentum positive control (prereg section 3, method lesson 1). Seed 20261113.

(a) pure Gaussian random walk at ES-like minute vol: V2 gross mean daily return must be within 2 SE of 0
    (a stopping rule on a martingale earns nothing: optional stopping, known from outside the pipeline);
(b) same walk + a planted day drift mu_d ~ N(0, 0.5 sigma_day) spread evenly over the day: V2 gross Sharpe must be > 1.
Usage: python -I scripts/noise-area-momentum/control.py
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import engine as E  # noqa: E402


def synth(rng, D=2600, sd_day=0.01, drift_frac=0.0):
    sm = sd_day / np.sqrt(E.NBAR)
    r = rng.normal(0, sm, (D, E.NBAR))
    mu = rng.normal(0, drift_frac * sd_day, D)
    r += mu[:, None] / E.NBAR
    gap = rng.normal(0, 0.004, D)
    O = np.empty(D)
    C = np.empty((D, E.NBAR))
    p = 4000.0
    for d in range(D):
        O[d] = p * np.exp(gap[d])
        C[d] = O[d] * np.exp(np.cumsum(r[d]))
        p = C[d, -1]
    span = np.abs(rng.normal(0, sm, (D, E.NBAR)))
    Z = dict(days=np.arange(D), open=O, close=C, high=C * np.exp(span), low=C * np.exp(-span),
             vol=rng.uniform(50, 150, (D, E.NBAR)), last=np.full(D, E.NBAR - 1), uopen=O, src=np.zeros(D))
    prev = np.full(D, np.nan)
    prev[1:] = C[:-1, -1]
    Z["prev"] = prev
    return Z


def main():
    rng = np.random.default_rng(E.SEED)
    out = {}
    for name, frac in (("random_walk", 0.0), ("planted_drift", 0.5)):
        Z = synth(rng, drift_frac=frac)
        F = E.features(Z)
        R = E.run_variant(Z, F, "V2", 0.0, sized=False)
        g = R["gross"][20:]
        t = g.mean() / (g.std(ddof=1) / np.sqrt(len(g)))
        sh = g.mean() / g.std(ddof=1) * np.sqrt(252)
        out[name] = dict(mean_bp=round(g.mean() * 1e4, 3), t=round(float(t), 2), sharpe=round(float(sh), 2),
                         trades_per_day=round(float(R["units"][20:].mean() / 2), 2))
    out["pass"] = bool(abs(out["random_walk"]["t"]) < 2 and out["planted_drift"]["sharpe"] > 1)
    print(json.dumps(out, indent=1))
    (E.OUT / "control.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
