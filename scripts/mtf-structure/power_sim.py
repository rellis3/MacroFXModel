"""mtf-structure power table by simulation (synthetic only: reads no market data and no outcome).

Synthetic panel: T test dates x 13 instruments. Daily latent moves share one common factor (loading rho) so that
cross-instrument outcomes correlate; horizon-h outcome = sign of the sum of h daily moves (overlapping windows, as the
real 07:00 -> 07:00 outcomes). A state 'side' (+1/-1, or 0 = no call) is persistent (geometric runs) and also shares a
common factor across instruments, with coverage pi = share of rows called.

Statistic (as the real run): mean over called rows of side * (y - B0), B0 = 0.5 here (the hit-rate excess over B0).
Null SD over N_SIM draws -> MDE = (z_{1 - alpha/(2m)} + z_0.80) * SD, alpha = 0.05, m = 18 scored cells (Holm first step).
Abstention cells: delta = excess(kept) - excess(all base-call rows), with the base call always on.

Run: python -X utf8 -I scripts/mtf-structure/power_sim.py  ->  analysis/output/mtf-structure/power_sim.json
"""
import json
import os
from statistics import NormalDist

import numpy as np

SEED = 20261115
T, N = 2250, 13
RHO = 0.40          # common-factor share of daily move variance (conservative vs ~0.3 typical FX direction co-movement)
SIDE_RHO = 0.50     # common-factor share of the state's latent (states co-move across instruments)
RUN = 8.0           # mean run length (sessions) of a state
N_SIM = 300
M_CELLS = 18
ND = NormalDist()
Z = ND.inv_cdf(1 - 0.05 / (2 * M_CELLS)) + ND.inv_cdf(0.80)


def ar_latent(rng, phi):
    c = rng.standard_normal(T)
    e = rng.standard_normal((T, N))
    x = np.empty((T, N))
    x[0] = np.sqrt(SIDE_RHO) * c[0] + np.sqrt(1 - SIDE_RHO) * e[0]
    s = np.sqrt(1 - phi ** 2)
    for t in range(1, T):
        x[t] = phi * x[t - 1] + s * (np.sqrt(SIDE_RHO) * c[t] + np.sqrt(1 - SIDE_RHO) * e[t])
    return x


def sim_once(rng, pi, h):
    phi = 1 - 1 / RUN
    lat = ar_latent(rng, phi)
    thr = np.quantile(np.abs(lat), 1 - pi)
    side = np.where(np.abs(lat) >= thr, np.sign(lat), 0.0)
    base = np.sign(lat)                       # always-on base call (abstention cells)
    f = rng.standard_normal(T + h)
    e = rng.standard_normal((T + h, N))
    r = np.sqrt(RHO) * f[:, None] + np.sqrt(1 - RHO) * e
    cs = np.cumsum(r, axis=0)
    mv = cs[h:h + T] - cs[0:T]
    y = (mv > 0).astype(float)
    ex = y - 0.5
    called = side != 0
    est = (side[called] * ex[called]).mean()
    delta = est - (base * ex).mean()
    return est, delta


def main():
    rng = np.random.default_rng(SEED)
    out = {"seed": SEED, "T": T, "N": N, "rho": RHO, "side_rho": SIDE_RHO, "run": RUN, "n_sim": N_SIM,
           "m_cells": M_CELLS, "z_alpha_plus_power": Z, "cells": []}
    for pi in (0.05, 0.10, 0.20, 0.30):
        for h in (1, 3, 5):
            ests, dels = zip(*[sim_once(rng, pi, h) for _ in range(N_SIM)])
            sd_e, sd_d = float(np.std(ests, ddof=1)), float(np.std(dels, ddof=1))
            row = {"coverage": pi, "h": h, "sd_excess": sd_e, "mde_excess": Z * sd_e, "sd_delta": sd_d,
                   "mde_delta": Z * sd_d, "mean_excess_null": float(np.mean(ests))}
            out["cells"].append(row)
            print(f"pi={pi:.2f} h={h}: SD {sd_e:.4f} MDE excess {Z*sd_e:.4f} | delta SD {sd_d:.4f} MDE {Z*sd_d:.4f}")
    od = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "analysis", "output", "mtf-structure")
    os.makedirs(od, exist_ok=True)
    with open(os.path.join(od, "power_sim.json"), "w") as fh:
        json.dump(out, fh, indent=1)


if __name__ == "__main__":
    main()
