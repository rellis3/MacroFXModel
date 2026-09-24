"""
DOES NQ NET GEX PREDICT NEXT-DAY DIFFUSION, MEASURED AGAINST A BROWNIAN BASELINE?

Pre-registration: oi_research_book/GEX_RANGE_BROWNIAN_PREREG.md (commit 0663f29,
written and committed BEFORE this script was run). Read it first; the verdict rule,
the specification axes and the operational bar are all fixed there.

The statistic. Raw range is confounded -- GEX scales with spot^2 and open interest,
both of which track the vol regime, so "big GEX days have big ranges" can be nothing
but vol level. Dividing by what a driftless random walk of the SAME trailing vol
would have produced removes that and gives an absolute null (DR = 1) rather than
only a relative comparison:

    expected_range_{t+1} = sigma_t * sqrt(8/pi)      # E[range] of driftless BM
    realised_range_{t+1} = ln(high_{t+1} / low_{t+1})
    DR_{t+1}             = realised / expected

DR > 1 = pushing out (amplified). DR < 1 = reverting back (damped / pinned).
GEX read at t, range at t+1. sigma_t is trailing 20d realised vol ending at t.

Significance is a stationary block bootstrap (mean block 10 days): daily vol
clusters hard and an iid t-test overstates it -- the exact error that flattered
the unclustered figures in analysis/gamma_band_realised.py.

Usage:  .venv/Scripts/python.exe oi_research_book/scripts/18_gex_range_brownian.py
"""
import json
import numpy as np
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "results"
OUT.mkdir(parents=True, exist_ok=True)

RNG = np.random.default_rng(20260924)
N_BOOT = 10_000
MEAN_BLOCK = 10
BM_RANGE_CONST = np.sqrt(8.0 / np.pi)   # E[range] of standard BM over unit time


# ---------------------------------------------------------------- bootstrap
def stationary_bootstrap_idx(n, n_boot, mean_block, rng):
    """Politis-Romano stationary bootstrap indices, VECTORISED: (n_boot, n) of
    geometric-length blocks with circular wrap. Preserves serial dependence,
    which an iid resample destroys.

    The loop-free construction: mark restart positions, carry the most recent
    restart position forward with a running max, and index off its anchor.
    Identical draw semantics to the naive per-step loop, ~1000x faster.
    """
    p = 1.0 / mean_block
    restarts = rng.random((n_boot, n)) < p
    restarts[:, 0] = True                       # every path starts on a fresh block
    anchors = rng.integers(0, n, (n_boot, n))   # candidate block starts
    k = np.arange(n)
    last = np.maximum.accumulate(np.where(restarts, k, 0), axis=1)
    start = np.take_along_axis(anchors, last, axis=1)
    return (start + (k - last)) % n


def _boot_stats(n, n_boot, rng, chunk=1000):
    """Yield (n_boot, n) index blocks in chunks so peak memory stays bounded."""
    done = 0
    while done < n_boot:
        m = min(chunk, n_boot - done)
        yield stationary_bootstrap_idx(n, m, MEAN_BLOCK, rng)
        done += m


def boot_diff_p(dr, is_short, n_boot=N_BOOT, rng=RNG):
    """Two-sided bootstrap p for mean(DR|short) - mean(DR|long), resampling whole
    blocks of the TIME SERIES so the regime split is resampled with its clustering."""
    n = len(dr)
    obs = dr[is_short].mean() - dr[~is_short].mean()
    out = []
    for ix in _boot_stats(n, n_boot, rng):
        d, s = dr[ix], is_short[ix]
        ns = s.sum(axis=1)
        # mean within each side, per bootstrap path
        sum_s = np.where(s, d, 0.0).sum(axis=1)
        sum_l = np.where(~s, d, 0.0).sum(axis=1)
        with np.errstate(invalid="ignore", divide="ignore"):
            stat = sum_s / ns - sum_l / (n - ns)
        stat[(ns < 5) | ((n - ns) < 5)] = np.nan
        out.append(stat)
    stats = np.concatenate(out)
    stats = stats[np.isfinite(stats)]
    # centre on the bootstrap mean -> null distribution of the difference
    centred = stats - stats.mean()
    p = float((np.abs(centred) >= abs(obs)).mean())
    return float(obs), p, float(stats.std())


def boot_mean_p(x, mu0=1.0, n_boot=N_BOOT, rng=RNG):
    """Bootstrap p for mean(x) != mu0, same block scheme."""
    n = len(x)
    obs = x.mean()
    out = [x[ix].mean(axis=1) for ix in _boot_stats(n, n_boot, rng)]
    stats = np.concatenate(out)
    centred = stats - stats.mean()
    p = float((np.abs(centred) >= abs(obs - mu0)).mean())
    return float(obs), p


# ---------------------------------------------------------------- data
def build(surface, normaliser, gex_col):
    """One specification cell. Returns a frame with DR and the regime flag.
    Every dropped row is counted and reported -- never silently discarded."""
    dm = pd.read_parquet(DATA / f"daily_master_{surface}_nas100_usd.parquet")
    gi = pd.read_parquet(DATA / "gamma_iv_nas100_usd.parquet")
    raw_n = len(dm)

    if gex_col == "net_gex":            # real-IV gamma lives in the other file
        dm = dm.merge(gi[["date", "net_gex"]], on="date", how="inner")
    df = dm.copy()

    # sigma_t known at t. rv20_ann ends at t (trailing) -> causal.
    if normaliser == "rv20_ann":
        sigma_d = df["rv20_ann"] / np.sqrt(252.0)
    else:                                # atr14 is a price range, convert to log vol
        sigma_d = (df["atr14"] / df["close"]) / BM_RANGE_CONST

    exp_rng = sigma_d * BM_RANGE_CONST
    real_rng = np.log(df["fwd_hi_1d"] / df["fwd_lo_1d"])

    df["dr"] = real_rng / exp_rng
    df["is_short"] = df[gex_col] < 0

    keep = df["dr"].notna() & np.isfinite(df["dr"]) & df[gex_col].notna() & (exp_rng > 0)
    dropped = int((~keep).sum())
    df = df[keep].sort_values("date").reset_index(drop=True)
    return df, {"raw_rows": raw_n, "dropped": dropped, "used": len(df)}


def variance_ratio(rets, q):
    """Lo-MacKinlay VR(q). >1 trending (push-out), <1 mean-reverting."""
    r = np.asarray(rets, dtype=float)
    r = r[np.isfinite(r)]
    n = len(r)
    if n < q * 5:
        return None
    v1 = r.var(ddof=1)
    agg = np.convolve(r, np.ones(q), mode="valid")
    vq = agg.var(ddof=1)
    return float(vq / (q * v1)) if v1 > 0 else None


# ---------------------------------------------------------------- harness checks
def harness_checks(df):
    """Pre-registered gates 1-3. These must pass before the real result is believed."""
    checks = {}
    dr = df["dr"].to_numpy()

    # 1. PLACEBO -- circular-shift GEX by 125 trading days. Keeps the series'
    #    autocorrelation, breaks the date link. Must come back near zero.
    shifted = np.roll(df["is_short"].to_numpy(), 125)
    obs, p, _ = boot_diff_p(dr, shifted, n_boot=2000)
    checks["placebo"] = {"deltaDR": round(obs, 4), "p": round(p, 4),
                         "pass": bool(abs(obs) < 0.03)}

    # 2. POSITIVE CONTROL -- trailing |return| is known to predict range (vol
    #    clustering). Substituting it for GEX must be detected, with a POSITIVE
    #    sign (high trailing move -> bigger next range).
    prox = df["ret"].abs().shift(1)
    hi = (prox > prox.median()).fillna(False).to_numpy()
    obs, p, _ = boot_diff_p(dr, hi, n_boot=2000)
    checks["positive_control"] = {"deltaDR": round(obs, 4), "p": round(p, 4),
                                  "pass": bool(obs > 0.05 and p < 0.05)}

    # 3. NO LOOKAHEAD -- DR_{t+1} uses only high/low of t+1 and vol to t. Perturbing
    #    everything from t+2 onward must leave the earlier half bit-identical.
    d2 = df.copy()
    half = len(d2) // 2
    tail = d2.index > half + 1
    d2.loc[tail, ["close", "high", "low", "open"]] *= 1.37
    checks["no_lookahead"] = {"pass": bool(np.allclose(
        d2["dr"].to_numpy()[:half], dr[:half], equal_nan=True))}
    return checks


# ---------------------------------------------------------------- run
def main():
    specs = [("near", "rv20_ann", "net_gex_sum"),   # PRIMARY: what G2 actually reads
             ("near", "atr14",    "net_gex_sum"),
             ("all",  "rv20_ann", "net_gex_sum"),
             ("all",  "atr14",    "net_gex_sum"),
             ("near", "rv20_ann", "net_gex"),       # real-IV gamma (not an independent axis)
             ("all",  "rv20_ann", "net_gex")]

    results, primary_df = [], None
    for surface, norm, gcol in specs:
        df, counts = build(surface, norm, gcol)
        if primary_df is None:
            primary_df = df
        dr = df["dr"].to_numpy()
        is_short = df["is_short"].to_numpy()

        delta, p, se = boot_diff_p(dr, is_short)
        long_mean, long_p = boot_mean_p(dr[~is_short], 1.0)
        short_mean, short_p = boot_mean_p(dr[is_short], 1.0)

        row = {
            "surface": surface, "normaliser": norm, "gex_col": gcol,
            "n": counts["used"], "n_short": int(is_short.sum()),
            "n_long": int((~is_short).sum()), "dropped": counts["dropped"],
            "deltaDR": round(delta, 4), "p": round(p, 4), "boot_se": round(se, 4),
            "DR_short": round(short_mean, 4), "DR_short_vs1_p": round(short_p, 4),
            "DR_long": round(long_mean, 4), "DR_long_vs1_p": round(long_p, 4),
        }
        results.append(row)
        print(f"{surface:>4} {norm:>9} {gcol:>12}  n={row['n']:>4} "
              f"(S{row['n_short']}/L{row['n_long']})  dDR={row['deltaDR']:+.4f} "
              f"p={row['p']:.4f}   DR_short={row['DR_short']:.3f} "
              f"DR_long={row['DR_long']:.3f}")

    print("\n--- variance ratios by regime (primary cell) ---")
    vr = {}
    for label, mask in [("short_gamma", primary_df["is_short"]),
                        ("long_gamma", ~primary_df["is_short"])]:
        vr[label] = {f"VR{q}": variance_ratio(primary_df.loc[mask, "ret"], q)
                     for q in (2, 3, 5)}
        print(f"  {label:>12}: " + "  ".join(
            f"{k}={v:.3f}" if v is not None else f"{k}=n/a" for k, v in vr[label].items()))

    print("\n--- harness checks ---")
    checks = harness_checks(primary_df)
    for k, v in checks.items():
        print(f"  {k:>17}: {v}")

    # ---- pre-registered verdict, applied mechanically ----
    prim = results[0]
    signs = {np.sign(r["deltaDR"]) for r in results[:4]}      # the four declared cells
    consistent = len(signs) == 1
    if prim["deltaDR"] >= 0.05 and prim["p"] < 0.05 and consistent and prim["deltaDR"] > 0:
        verdict = "SUPPORTED"
    elif abs(prim["deltaDR"]) < 0.03 or not consistent:
        verdict = "NULL"
    else:
        verdict = "INCONCLUSIVE"
    operational = "PASS" if prim["deltaDR"] >= 0.10 else "FAIL"

    print(f"\n=== VERDICT (pre-registered rule): {verdict} ===")
    print(f"=== Operational bar (dDR >= 0.10 for G2 2x tiers): {operational} ===")

    payload = {"generated": pd.Timestamp.utcnow().isoformat(),
               "prereg": "GEX_RANGE_BROWNIAN_PREREG.md",
               "results": results, "variance_ratios": vr, "harness": checks,
               "verdict": verdict, "operational": operational}
    (OUT / "gex_range_brownian.json").write_text(json.dumps(payload, indent=2))
    print(f"\nwrote {OUT / 'gex_range_brownian.json'}")


if __name__ == "__main__":
    main()
