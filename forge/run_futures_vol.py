"""Futures volatility forecast study — see forge/FUTURES_VOL_PREREG.md (pre-registered before any result).

    python -m forge.run_futures_vol                 # integrity gate, then primary + secondary instruments
    python -m forge.run_futures_vol --roots NQ ES   # subset (gate is evaluated on whatever primary roots are given)

Control A0 = forge.vol.har_rv_log_sigma on the futures daily OHLC (the live incumbent, unmodified).
Candidates differ only in regressors; all predict the next session's log Garman-Klass variance.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from forge import vol as V

NT8 = Path(__file__).resolve().parents[1] / "analysis" / "output" / "nt8"
CACHE = NT8 / "daily_london22"
PRIMARY = ["NQ", "ES", "YM", "RTY", "GC", "6E", "6B", "6J", "6A", "6N", "6C", "6S"]
SECONDARY = ["CL", "NG", "BZ", "HG", "SI", "PL", "ZC", "ZS", "ZW", "ZN", "ZB", "ZF", "ZT", "FDAX"]
MIN_BARS = 500
RUNGS = [("hl", "p50", 0.50), ("hl", "p75", 0.75), ("hl", "p90", 0.90),
         ("oc", "p50", 0.50), ("oc", "p75", 0.75), ("oc", "p90", 0.90)]
ARMS = ["A0", "C0", "C1", "C2", "C3"]


# ── daily table from 1-minute bars: London 00:00-22:00 session ──────────────────────────────

def build_daily(root: str) -> pd.DataFrame:
    CACHE.mkdir(parents=True, exist_ok=True)
    cache = CACHE / f"{root}.parquet"
    src = NT8 / "continuous" / f"{root}_1m_ratio.parquet"
    if cache.exists() and cache.stat().st_mtime >= src.stat().st_mtime:
        return pd.read_parquet(cache)
    d = pd.read_parquet(src, columns=["timestamp", "open", "high", "low", "close", "volume"])
    out = daily_from_bars(d)
    out.to_parquet(cache)
    return out


def daily_from_bars(d: pd.DataFrame) -> pd.DataFrame:
    """1-minute bars (columns timestamp[UTC], open, high, low, close, volume) -> London 00:00-22:00 daily table."""
    d = d.copy()
    lt = d["timestamp"].dt.tz_convert("Europe/London")
    d["date"] = lt.dt.tz_localize(None).dt.normalize()
    d["m"] = lt.dt.hour * 60 + lt.dt.minute
    d = d[d["m"] < 22 * 60]
    d["bin"] = d["m"] // 5
    rows = []
    for date, g in d.groupby("date", sort=True):
        if len(g) < MIN_BARS:
            continue
        o, h, l, c = g["open"].iloc[0], g["high"].max(), g["low"].min(), g["close"].iloc[-1]
        if not (o > 0 and l > 0 and h >= l):
            continue
        cl = g.groupby("bin")["close"].last().to_numpy()
        px = np.concatenate([[o], cl])
        r = np.diff(np.log(px))
        rv = float(np.sum(r ** 2))
        bv = float(np.pi / 2 * np.sum(np.abs(r[1:]) * np.abs(r[:-1]))) if len(r) > 2 else np.nan
        gk = max(0.5 * np.log(h / l) ** 2 - (2 * np.log(2.0) - 1) * np.log(c / o) ** 2, 1e-12)
        rows.append((date, o, h, l, c, float(g["volume"].sum()), gk, rv, bv))
    out = pd.DataFrame(rows, columns=["date", "open", "high", "low", "close", "volume", "gk", "rv5", "bv5"])
    out["jshare"] = (np.maximum(out["rv5"] - out["bv5"], 0) / out["rv5"]).fillna(0.0)
    med = out["volume"].rolling(20).median().shift(1)
    out["vsurp"] = np.log(out["volume"] / med)
    return out.set_index("date")


# ── causal expanding-OLS HAR forecasts ───────────────────────────────────────────────────────

def _har_terms(x: np.ndarray) -> np.ndarray:
    s = pd.Series(x)
    return np.column_stack([x, s.rolling(5).mean().to_numpy(), s.rolling(22).mean().to_numpy()])


def har_forecast(daily: pd.DataFrame, cols: dict, refit: int = 10, warmup: int = 60) -> np.ndarray:
    """sigma (annualised %) for session t from information through t-1.

    cols = {"har": [series to give lag1/mean5/mean22 terms], "lag": [series to give only a lag-1 term]}."""
    gk = daily["gk"].to_numpy()
    n = len(gk)
    floor = 0.01 * np.median(gk[:250])
    y = np.log(np.maximum(gk, floor))
    feats = [np.ones(n)]
    for name in cols.get("har", []):
        v = daily[name].to_numpy()
        v = np.log(np.maximum(v, floor)) if name in ("gk", "rv5", "bv5") else v
        feats += list(_har_terms(v).T)
    for name in cols.get("lag", []):
        feats.append(daily[name].to_numpy())
    X = np.column_stack(feats)                      # X[s] known after session s
    sigma = np.full(n, np.nan)
    pred_log = np.full(n, np.nan)
    resid_exp: list[float] = []
    beta = None
    for t in range(1, n):
        # training pairs (X[u-1], y[u]) for u <= t-1
        if (t - 1) % refit == 0 or beta is None:
            u = np.arange(1, t)
            Xt, yt = X[u - 1], y[u]
            ok = np.isfinite(Xt).all(axis=1) & np.isfinite(yt)
            if ok.sum() >= warmup:
                A = Xt[ok]
                beta = np.linalg.solve(A.T @ A + 1e-6 * np.eye(A.shape[1]), A.T @ yt[ok])
            else:
                beta = None
        xt = X[t - 1]
        if beta is None or not np.isfinite(xt).all():
            continue
        pl = float(xt @ beta)
        pred_log[t] = pl
        smear = float(np.mean(resid_exp)) if len(resid_exp) >= 30 else 1.0
        sigma[t] = np.sqrt(np.exp(pl) * smear) * V.SQRT252 * 100.0
    # smearing uses past out-of-sample residuals only: recompute causally in a second pass
    resid_exp = []
    for t in range(1, n):
        if np.isfinite(pred_log[t]):
            smear = float(np.mean(resid_exp)) if len(resid_exp) >= 30 else 1.0
            sigma[t] = np.sqrt(np.exp(pred_log[t]) * smear) * V.SQRT252 * 100.0
            resid_exp.append(float(np.exp(y[t] - pred_log[t])))
    return sigma


ARM_COLS = {
    "C0": {"har": ["gk"]},
    "C1": {"har": ["rv5"]},
    "C2": {"har": ["gk", "rv5"]},
    "C3": {"har": ["gk", "rv5"], "lag": ["jshare", "vsurp"]},
}


def build_frame(root: str) -> pd.DataFrame:
    daily = build_daily(root)
    daily = daily.replace([np.inf, -np.inf], np.nan)
    ohlc = daily[["open", "high", "low", "close"]]
    real = V.realized_quantities(ohlc)
    fr = pd.DataFrame({"date": daily.index, **{k: real[k] for k in ("hl_pct", "oc_pct", "oh_pct", "ol_pct")}})
    fr["sigma_A0"] = V.as_of_yesterday(V.har_rv_log_sigma(ohlc))
    for arm, cols in ARM_COLS.items():
        fr[f"sigma_{arm}"] = har_forecast(daily, cols)
    return fr.reset_index(drop=True)


# ── walk-forward scoring ─────────────────────────────────────────────────────────────────────

def score_root(fr: pd.DataFrame, arms=None, ctrl: str = "A0") -> pd.DataFrame:
    """Per-session OOS losses (control-σ normalised) for every arm, plus HL p75 exceed flags."""
    arms = arms or ARMS
    need = [f"sigma_{a}" for a in arms]
    fr = fr.dropna(subset=["hl_pct", "oc_pct"]).copy()
    out = []
    for i, (tr0, split, te_end) in enumerate(V.fold_bounds(fr["date"], 6)):
        ok = fr[need].notna().all(axis=1) & (fr[need] > 0).all(axis=1)
        train = fr[ok & (fr["date"] >= tr0) & (fr["date"] < split)]
        test = fr[ok & (fr["date"] >= split) & (fr["date"] < te_end)]
        if len(train) < 200 or len(test) < 30:
            continue
        cs = test[f"sigma_{ctrl}"].to_numpy() / V.SQRT252
        rec = {"date": test["date"].to_numpy(), "fold": i}
        for arm in arms:
            mult = {k: v for k, v in V._fit_multiplier_set(train, arm).items() if np.isfinite(v)}
            pred = V.predicted_quantiles(test[f"sigma_{arm}"].to_numpy(), mult)
            losses = []
            for q, p, tau in RUNGS:
                key = f"{q}_{p}"
                if key not in pred:
                    continue
                losses.append(V.pinball_loss(test[f"{q}_pct"].to_numpy(), pred[key], tau))
            rec[f"loss_{arm}"] = np.mean(losses, axis=0) / cs
            rec[f"exc75_{arm}"] = (test["hl_pct"].to_numpy() > pred["hl_p75"]).astype(float)
        out.append(pd.DataFrame(rec))
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame()


def block_bootstrap(per_root: dict, arm: str, ctrl: str = "A0", reps: int = 2000, block: int = 20, seed: int = 7):
    """Pooled (equal-weight over roots) ratio of mean loss arm/A0, jointly resampling calendar-date blocks."""
    dates = sorted(set().union(*[set(df["date"]) for df in per_root.values()]))
    pos = {d: i for i, d in enumerate(dates)}
    nd = len(dates)
    LA = np.zeros((nd, len(per_root)))
    LC = np.zeros((nd, len(per_root)))
    for j, df in enumerate(per_root.values()):
        idx = df["date"].map(pos).to_numpy()
        LA[idx, j] = df[f"loss_{ctrl}"].to_numpy()
        LC[idx, j] = df[f"loss_{arm}"].to_numpy()
    point = np.mean(LC.sum(0) / LA.sum(0))
    rng = np.random.default_rng(seed)
    nb = int(np.ceil(nd / block))
    ratios = np.empty(reps)
    for r in range(reps):
        starts = rng.integers(0, nd - block + 1, nb)
        idx = (starts[:, None] + np.arange(block)[None, :]).ravel()[:nd]
        w = np.bincount(idx, minlength=nd).astype(float)
        ratios[r] = np.mean((w @ LC) / (w @ LA))
    return float(point), float(np.quantile(ratios, 0.025)), float(np.quantile(ratios, 0.975))


def summarize(per_root: dict, label: str, arms=None, ctrl: str = "A0", primary: str = "C1") -> dict:
    arms = arms or ARMS
    res = {"label": label, "roots": {}, "pooled": {}}
    for root, df in per_root.items():
        res["roots"][root] = {"n": int(len(df)), **{a: float(df[f"loss_{a}"].mean() / df[f"loss_{ctrl}"].mean())
                                                    for a in arms if a != ctrl},
                              "exc75_P": float(df[f"exc75_{primary}"].mean()), "exc75_C": float(df[f"exc75_{ctrl}"].mean())}
    all_dates = sorted(set().union(*[set(df["date"]) for df in per_root.values()]))
    mid = all_dates[len(all_dates) // 2]
    for arm in [x for x in arms if x != ctrl]:
        pt, lo, hi = block_bootstrap(per_root, arm, ctrl)
        halves = []
        for part in ("first", "second"):
            sub = {r: (df[df["date"] < mid] if part == "first" else df[df["date"] >= mid]) for r, df in per_root.items()}
            halves.append(float(np.mean([s[f"loss_{arm}"].mean() / s[f"loss_{ctrl}"].mean() for s in sub.values() if len(s)])))
        wins = int(sum(v[arm] < 1 for v in res["roots"].values()))
        res["pooled"][arm] = {"ratio": pt, "ci95": [lo, hi], "half1": halves[0], "half2": halves[1],
                              "roots_better": wins, "roots": len(per_root)}
    res["pooled"]["exc75_P"] = float(np.mean([v["exc75_P"] for v in res["roots"].values()]))
    res["pooled"]["exc75_C"] = float(np.mean([v["exc75_C"] for v in res["roots"].values()]))
    res["arms"] = [x for x in arms if x != ctrl]
    return res


def show(res: dict) -> None:
    arms = res["arms"]
    print(f"\n=== {res['label']} ===")
    print(f"{'root':6} {'n':>5}  " + "  ".join(f"{a:>6}" for a in arms) + "   exc75 ctrl / primary")
    for r, v in res["roots"].items():
        print(f"{r:6} {v['n']:5d}  " + "  ".join(f"{v[a]:6.3f}" for a in arms) + f"   {v['exc75_C']:.2f} / {v['exc75_P']:.2f}")
    for a in arms:
        p = res["pooled"][a]
        print(f"POOLED {a}: ratio {p['ratio']:.4f}  CI95 [{p['ci95'][0]:.4f}, {p['ci95'][1]:.4f}]  "
              f"halves {p['half1']:.4f} / {p['half2']:.4f}  better on {p['roots_better']}/{p['roots']}")
    print(f"pooled HL p75 exceed-rate  control {res['pooled']['exc75_C']:.3f}  primary {res['pooled']['exc75_P']:.3f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--roots", nargs="+")
    ap.add_argument("--skip-gate", action="store_true")
    a = ap.parse_args()
    prim = [r for r in (a.roots or PRIMARY) if r in PRIMARY]
    sec = [r for r in (a.roots or SECONDARY) if r in SECONDARY]
    scored = {}
    for r in prim + sec:
        try:
            df = score_root(build_frame(r))
        except FileNotFoundError:
            print(f"{r}: no stitched file, skipped")
            continue
        if df.empty:
            print(f"{r}: not enough history to score")
            continue
        scored[r] = df
        print(f"{r}: {len(df)} OOS sessions {df['date'].min():%Y-%m-%d} -> {df['date'].max():%Y-%m-%d}", flush=True)
    P = {r: scored[r] for r in prim if r in scored}
    if not P:
        raise SystemExit("no primary roots scored")
    gate = float(np.mean([df["loss_C0"].mean() / df["loss_A0"].mean() for df in P.values()]))
    print(f"\nINTEGRITY GATE  C0/A0 pooled loss ratio = {gate:.4f}  (required 0.97 - 1.03)")
    if not (0.97 <= gate <= 1.03) and not a.skip_gate:
        raise SystemExit("GATE FAILED: harness does not reproduce the incumbent. Fix before reading C1.")
    out = {"gate_C0_over_A0": gate, "primary": summarize(P, "PRIMARY (12 CFD-matched roots)")}
    show(out["primary"])
    S = {r: scored[r] for r in sec if r in scored}
    if S:
        out["secondary"] = summarize(S, "SECONDARY (no live CFD counterpart / not in pass rule)")
        show(out["secondary"])
    (NT8 / "futures_vol_results.json").write_text(json.dumps(out, indent=1))
    print("\nwritten ->", NT8 / "futures_vol_results.json")


if __name__ == "__main__":
    main()
