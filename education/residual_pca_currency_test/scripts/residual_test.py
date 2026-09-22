"""Currency PCA residual reversion -- the slide-28 gate test (+ the slide-32 loop).

Implements the "Mean Reversion of Residuals" lesson
(education/mean-reversion-of-residuals-notes.md) on the 8 G10-ish currencies.
Pre-registration: ../PREREGISTRATION.md (written before the real-data run).

Currencies are built from the 7 USD majors so no pair is double counted:
  r_c = log return of currency c vs USD (USD itself = 0)
  x_c = r_c - mean over the 8 currencies     (currency vs equal-weight basket)

Per day t (window = the 120 returns ending at t, nothing after t):
  standardise x in the window -> Z, correlation PCA -> V (top K eigenvectors)
  residual path  = cumsum(Z - Z V V')          displacement = its z-score
  next-day residual (OUT OF WINDOW, loadings frozen at t):
      z1 = (x[t+1] - mu) / sd ;  e1 = z1 - V V' z1, scaled by the window residual sd
Gate (slide 28): does displacement at t predict e1 at t+1 with the reverting sign?

Usage:
  python3 residual_test.py synthetic   # harness checks: null + positive control
  python3 residual_test.py real        # the pre-registered run
"""
import json
import os
import sys

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

CCYS = ["USD", "EUR", "GBP", "AUD", "NZD", "JPY", "CAD", "CHF"]
# (pair, sign): currency-vs-USD log return = sign * pair log return
CCY_PAIR = {"EUR": ("eurusd", 1), "GBP": ("gbpusd", 1), "AUD": ("audusd", 1),
            "NZD": ("nzdusd", 1), "JPY": ("usdjpy", -1), "CAD": ("usdcad", -1),
            "CHF": ("usdchf", -1)}
# Round-trip cost, % of price -- js/perLineStrategy.js PAIR_COST_PCT (house table).
RT_COST_PCT = {"EUR": 0.008, "GBP": 0.010, "AUD": 0.011, "NZD": 0.013,
               "JPY": 0.009, "CAD": 0.011, "CHF": 0.011, "USD": 0.0}

# Lesson parameters, fixed in advance (slide 32). Not tuned here.
WINDOW = 120
DEAD_BAND = 0.2
CAP = 1.5
NOISE_SIMS = 500
NOISE_PCTL = 95
BUCKETS = [-np.inf, -1.5, -0.5, 0.5, 1.5, np.inf]
BUCKET_NAMES = ["below -1.5", "-1.5 to -0.5", "-0.5 to 0.5", "0.5 to 1.5", "above 1.5"]


# ---------------------------------------------------------------- data
def load_real():
    d = pd.read_csv(os.path.join(DATA, "daily_closes.csv"), index_col=0, parse_dates=True)
    lr = np.log(d).diff().dropna()
    r = pd.DataFrame(0.0, index=lr.index, columns=CCYS)
    for c, (p, s) in CCY_PAIR.items():
        r[c] = s * lr[p]
    return r


def basket(r):
    """Currency vs equal-weight basket of all 8 (rows sum to zero)."""
    return r.sub(r.mean(axis=1), axis=0)


# ---------------------------------------------------------------- PCA pieces
def std_window(X):
    mu = X.mean(axis=0)
    sd = X.std(axis=0, ddof=1)
    return (X - mu) / sd, mu, sd


def eig_desc(Z):
    C = np.corrcoef(Z, rowvar=False)
    w, V = np.linalg.eigh(C)
    o = np.argsort(w)[::-1]
    return w[o], V[:, o]


def noise_band(n_obs, n_ser, sims=NOISE_SIMS, pctl=NOISE_PCTL, seed=7):
    """Eigenvalue share per rank from pure noise run through the SAME procedure
    (de-mean across currencies, standardise, correlation PCA)."""
    rng = np.random.default_rng(seed)
    shares = np.empty((sims, n_ser))
    for s in range(sims):
        e = rng.standard_normal((n_obs, n_ser))
        e = e - e.mean(axis=1, keepdims=True)
        w, _ = eig_desc(std_window(e)[0])
        shares[s] = w / w.sum()
    return np.percentile(shares, pctl, axis=0)


def k_beating_noise(share, band):
    k = 0
    while k < len(share) and share[k] > band[k]:
        k += 1
    return k


# ---------------------------------------------------------------- the walk
def walk(x, r, K, costs=RT_COST_PCT, cost_mult=1.0):
    """One pass per day. Returns per-day records (gate data + loop pnl)."""
    X = x.values
    R = r.values
    n, m = X.shape
    ones = np.ones(m)
    cost_vec = np.array([costs[c] / 100.0 / 2.0 for c in x.columns]) * cost_mult  # one-way
    w_prev = np.zeros(m)
    disp_rows, next_rows, recs = [], [], []
    for t in range(WINDOW - 1, n - 1):
        win = X[t - WINDOW + 1: t + 1]
        Z, mu, sd = std_window(win)
        w_eig, V = eig_desc(Z)
        VK = V[:, :K]
        P = VK @ VK.T
        res = Z - Z @ P
        c = np.cumsum(res, axis=0)
        disp = (c[-1] - c.mean(axis=0)) / c.std(axis=0, ddof=1)
        # out-of-window next-day residual, loadings frozen at t
        z1 = (X[t + 1] - mu) / sd
        e1 = (z1 - P @ z1) / res.std(axis=0, ddof=1)
        disp_rows.append(disp)
        next_rows.append(e1)

        # the slide-32 loop, on raw weights
        target = -disp
        target[np.abs(disp) < DEAD_BAND] = 0.0
        target = np.clip(target, -CAP, CAP)
        w = target / sd
        B = np.column_stack([sd[:, None] * VK, ones])           # raw-return factor exposures + basket
        w = w - B @ np.linalg.lstsq(B, w, rcond=None)[0]
        g = np.abs(w).sum()
        w = w / g if g > 0 else w
        turnover = np.abs(w - w_prev)
        cost = float(turnover @ cost_vec)
        gross = float(w @ R[t + 1])                              # sum(w)=0 -> = w . x[t+1]
        exp_pre = (sd[:, None] * VK).T @ (target / sd)           # factor exposure before neutralising
        exp_post = (sd[:, None] * VK).T @ w
        recs.append({"date": x.index[t + 1], "gross": gross, "cost": cost, "net": gross - cost,
                     "turnover": float(turnover.sum()), "sum_w": float(w.sum()),
                     "max_abs_exp_post": float(np.abs(exp_post).max()),
                     "max_abs_exp_pre": float(np.abs(exp_pre).max())})
        w_prev = w
    idx = x.index[WINDOW: n]
    return (pd.DataFrame(disp_rows, index=idx, columns=x.columns),
            pd.DataFrame(next_rows, index=idx, columns=x.columns),
            pd.DataFrame(recs).set_index("date"))


# ---------------------------------------------------------------- stats
def daily_ic(disp, nxt):
    """Cross-sectional Pearson corr of (-displacement) with next-day residual."""
    a = -disp.values
    b = nxt.values
    a = a - a.mean(axis=1, keepdims=True)
    b = b - b.mean(axis=1, keepdims=True)
    num = (a * b).sum(axis=1)
    den = np.sqrt((a * a).sum(axis=1) * (b * b).sum(axis=1))
    return pd.Series(num / den, index=disp.index)


def tstat(s, nw_lag=0):
    s = s.dropna().values
    n = len(s)
    mu = s.mean()
    e = s - mu
    var = (e @ e) / n
    for L in range(1, nw_lag + 1):
        var += 2 * (1 - L / (nw_lag + 1)) * (e[L:] @ e[:-L]) / n
    return mu / np.sqrt(var / n)


def bucket_table(disp, nxt):
    d = disp.values.ravel()
    e = nxt.values.ravel()
    cat = pd.cut(d, BUCKETS, labels=BUCKET_NAMES)
    g = pd.DataFrame({"b": cat, "e": e}).groupby("b", observed=False)["e"]
    out = pd.DataFrame({"obs": g.size(), "mean_next": g.mean(), "se": g.std() / np.sqrt(g.size())})
    out["t"] = out["mean_next"] / out["se"]
    return out


def perf(pnl):
    pnl = pnl.dropna()
    eq = (1 + pnl).cumprod()
    dd = (eq / eq.cummax() - 1).min()
    sh = pnl.mean() / pnl.std() * np.sqrt(252) if pnl.std() > 0 else np.nan
    yrs = len(pnl) / 252
    cagr = eq.iloc[-1] ** (1 / yrs) - 1 if yrs > 0 else np.nan
    return {"days": int(len(pnl)), "sharpe": round(float(sh), 3),
            "ann_ret_pct": round(float(pnl.mean() * 252 * 100), 3),
            "ann_vol_pct": round(float(pnl.std() * np.sqrt(252) * 100), 3),
            "cagr_pct": round(float(cagr * 100), 3), "max_dd_pct": round(float(dd * 100), 2)}


def gate(disp, nxt, label):
    ic = daily_ic(disp, nxt)
    bt = bucket_table(disp, nxt)
    return {"label": label, "days": int(ic.notna().sum()),
            "mean_ic": round(float(ic.mean()), 4), "t_ic": round(float(tstat(ic)), 2),
            "t_ic_nw5": round(float(tstat(ic, 5)), 2),
            "buckets": {k: {"obs": int(v.obs), "mean_next": round(float(v.mean_next), 4),
                            "t": round(float(v.t), 2)} for k, v in bt.iterrows()}}


def verdict(g_is, g_oos):
    b = g_oos["buckets"]
    m = [b[k]["mean_next"] for k in BUCKET_NAMES]
    checks = {
        "oos_ic_positive_t_ge_2": g_oos["mean_ic"] > 0 and g_oos["t_ic"] >= 2.0,
        "oos_extremes_right_sign": m[0] > 0 and m[4] < 0,
        "oos_low_half_above_high_half": (m[0] + m[1]) / 2 > (m[3] + m[4]) / 2,
        "is_ic_same_sign": g_is["mean_ic"] > 0,
    }
    return checks, ("PASS" if all(checks.values()) else "FAIL")


def split_half(df):
    h = len(df) // 2
    return df.iloc[:h], df.iloc[h:]


def choose_k(x, band, upto=None):
    """Pre-registered K rule: per window, count leading components above the noise
    band; K = median of that count over the IS windows only."""
    X = x.values if upto is None else x.values[:upto]
    ks = []
    for t in range(WINDOW - 1, len(X)):
        w, _ = eig_desc(std_window(X[t - WINDOW + 1: t + 1])[0])
        ks.append(k_beating_noise(w / w.sum(), band))
    ks = np.array(ks)
    return int(np.median(ks)), {int(k): int((ks == k).sum()) for k in np.unique(ks)}


def run(x, r, label, fixed_k=None, cost_mult=1.0):
    band = noise_band(WINDOW, x.shape[1])
    n_is = WINDOW + (len(x) - WINDOW) // 2
    k_rule, k_hist = choose_k(x, band, upto=n_is)
    K = fixed_k if fixed_k is not None else k_rule
    disp, nxt, rec = walk(x, r, K, cost_mult=cost_mult)
    d_is, d_oos = split_half(disp)
    n_is_, n_oos = split_half(nxt)
    g_is, g_oos = gate(d_is, n_is_, "IS"), gate(d_oos, n_oos, "OOS")
    checks, v = verdict(g_is, g_oos)
    r_is, r_oos = split_half(rec)
    return {"label": label, "K": K, "K_rule_hist_IS": k_hist,
            "noise_band_pct": [round(float(b) * 100, 2) for b in band],
            "gate_IS": g_is, "gate_OOS": g_oos, "checks": checks, "verdict": v,
            "loop": {"IS_gross": perf(r_is.gross), "IS_net": perf(r_is.net),
                     "OOS_gross": perf(r_oos.gross), "OOS_net": perf(r_oos.net),
                     "mean_daily_turnover": round(float(rec.turnover.mean()), 3),
                     "max_abs_sum_w": float(rec.sum_w.abs().max()),
                     "max_abs_factor_exp_after_neutralise": float(rec.max_abs_exp_post.max())},
            "_frames": (disp, nxt, rec)}


# ---------------------------------------------------------------- synthetic
def synthetic(kind, n=2700, seed=11):
    """kind='null': iid returns, real-looking covariance, no reversion anywhere.
    kind='ou':   2 common factors + per-currency OU residual levels (half life 15d)."""
    rng = np.random.default_rng(seed)
    m = 8
    idx = pd.bdate_range("2016-01-04", periods=n)
    load = rng.normal(0, 1, (m, 2)) * np.array([0.006, 0.003])
    f = rng.standard_normal((n, 2))
    if kind == "null":
        eps = rng.standard_normal((n, m)) * 0.003
    else:
        phi = 0.5 ** (1 / 15)
        lvl = np.zeros((n, m))
        for t in range(1, n):
            lvl[t] = phi * lvl[t - 1] + rng.standard_normal(m) * 0.003
        eps = np.diff(lvl, axis=0, prepend=lvl[:1])
    r = pd.DataFrame(f @ load.T + eps, index=idx, columns=CCYS)
    r["USD"] = 0.0
    return r


def clean(o):
    return {k: v for k, v in o.items() if not k.startswith("_")}


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "synthetic"
    if mode == "synthetic":
        out = {}
        for kind in ["null", "ou"]:
            r = synthetic(kind)
            res = run(basket(r), r, f"synthetic_{kind}", fixed_k=2)
            out[kind] = clean(res)
            print(json.dumps(clean(res), indent=1, default=str))
        json.dump(out, open(os.path.join(DATA, "synthetic_checks.json"), "w"), indent=1, default=str)
        return
    r = load_real()
    x = basket(r)
    res = run(x, r, "real")
    res2 = run(x, r, "real_cost_x2", fixed_k=res["K"], cost_mult=2.0)
    disp, nxt, rec = res["_frames"]
    # disaggregation (information only): per currency and per year
    ic = daily_ic(disp, nxt)
    per_ccy = {}
    half = len(disp) // 2
    for c in disp.columns:
        a, b = -disp[c].iloc[half:], nxt[c].iloc[half:]
        per_ccy[c] = round(float(np.corrcoef(a, b)[0, 1]), 4)
    per_year = ic.groupby(ic.index.year).agg(["mean", "count"]).round(4)
    yearly_net = rec.net.groupby(rec.index.year).sum().mul(100).round(2)
    out = clean(res)
    out["loop_cost_x2_OOS_net"] = res2["loop"]["OOS_net"]
    out["oos_start"] = str(disp.index[half].date())
    out["per_currency_OOS_ts_corr"] = per_ccy
    out["ic_by_year"] = {int(k): {"mean_ic": float(v["mean"]), "days": int(v["count"])}
                         for k, v in per_year.iterrows()}
    out["loop_net_return_pct_by_year"] = {int(k): float(v) for k, v in yearly_net.items()}
    print(json.dumps(out, indent=1, default=str))
    json.dump(out, open(os.path.join(DATA, "real_results.json"), "w"), indent=1, default=str)
    rec.to_csv(os.path.join(DATA, "real_daily_loop.csv"), float_format="%.7f")


if __name__ == "__main__":
    main()
