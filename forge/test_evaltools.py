"""Checks for forge/evaltools.py against known answers and the Lesson 1 worked numbers.
    python -m forge.test_evaltools
"""
import math

import numpy as np

from forge import evaltools as E

rng = np.random.default_rng(1)
ok = 0


def check(name, cond, detail=""):
    global ok
    assert cond, f"FAIL {name} {detail}"
    ok += 1
    print(f"  ✓ {name} {detail}")


# Lesson 1 §02: Pr(loss) = Φ(−S√h) at S = 3.51 — day 41.3%, week 31.1%, month 15.6%, quarter 4.0%, year 0.02%
for years, want in ((1 / 252, 0.413), (5 / 252, 0.311), (21 / 252, 0.156), (63 / 252, 0.040), (1, 0.0002)):
    got = E.prob_loss(3.51, years)
    check(f"prob_loss h={years:.4f}", abs(got - want) < 0.003, f"{got:.4f} vs {want}")

# Lesson 1 §03: normal SE at Ŝ = 3.51 over the record's 1,181 days ≈ 0.47 annualised
mu, sd = 3.51 / math.sqrt(252) * 0.01, 0.01
x = rng.normal(mu, sd, 1181)
x = (x - x.mean()) / x.std(ddof=1) * sd + mu        # exact Sharpe, normal shape
se = E.sharpe_se(x)
check("sharpe_se normal ≈ 0.47 at S 3.51, T 1181", abs(se - 0.47) < 0.03, f"{se:.3f}")

# positive skew narrows the SE (Lesson 1: 0.47 -> 0.419 for the record's skew 0.973)
y = rng.gamma(2.0, 1.0, 1181)
y = (y - y.mean()) / y.std(ddof=1) * sd + mu
check("positive skew narrows the SE", E.sharpe_se(y) < E.sharpe_se(x), f"{E.sharpe_se(y):.3f} < {E.sharpe_se(x):.3f}")

# stationary bootstrap: valid indices, mean run length ≈ mean_block
idx = E.stationary_bootstrap(5000, mean_block=10, reps=3, rng=rng)
runs = np.diff(np.flatnonzero(np.r_[True, np.diff(idx[0]) != 1, True]))
check("stationary bootstrap run length ≈ 10", 8 < runs.mean() < 12, f"{runs.mean():.2f}")
paths = E.bootstrap_paths(rng.normal(0.0005, 0.01, 500), n_paths=50, rng=rng)
check("bootstrap_paths shape", paths.shape == (50, 500))

# Cornish-Fisher: equals the normal VaR for normal data, larger for fat left tails
z = rng.normal(0, 1, 200000)
check("CF VaR ≈ normal on normal data", abs(E.cornish_fisher_var(z, 0.01) - 2.326) < 0.05, f"{E.cornish_fisher_var(z, 0.01):.3f}")
t = rng.standard_t(4, 200000) / math.sqrt(2)
check("CF VaR > normal VaR for fat tails", E.cornish_fisher_var(t, 0.01) > 2.326 * t.std())

# Lesson 2: the noise maximum grows with the number of tries; deflation falls as trials rise
check("expected max Sharpe grows with N", E.expected_max_sharpe(100, 0.05) > E.expected_max_sharpe(10, 0.05) > 0)
good = rng.normal(0.001, 0.01, 2000)
d1, d100 = E.deflated_sharpe(good, 1, 0.02), E.deflated_sharpe(good, 1000, 0.02)
check("deflated Sharpe falls as trials rise", d1 > d100, f"{d1:.3f} > {d100:.3f}")

# clustered estimates: identical clusters -> SE of cluster means; ratio matches simple share
vals = np.repeat(rng.normal(0, 1, 400), 5); cl = np.repeat(np.arange(400), 5)
m, s = E.clustered_mean(vals, cl)
check("clustered SE = SE of cluster means", abs(s - vals[::5].std(ddof=1) / math.sqrt(400)) < 1e-3, f"{s:.4f}")
num = rng.integers(0, 2, 1000).astype(float); den = np.ones(1000)
R, se = E.clustered_ratio(num, den, np.arange(1000))
check("clustered ratio = share", abs(R - num.mean()) < 1e-12 and abs(se - num.std() / math.sqrt(1000)) < 2e-3, f"{R:.3f} ± {se:.4f}")
check("control_diff z", abs(E.control_diff((0.6, 0.01), (0.5, 0.01))["z"] - 0.1 / math.hypot(0.01, 0.01)) < 1e-9)
check("halves_agree", E.halves_agree(2.5, 3.1) and not E.halves_agree(2.5, -3.1) and not E.halves_agree(2.5, 1.9))
print(f"\nall {ok} checks passed")
