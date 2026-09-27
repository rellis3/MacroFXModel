"""
DOES THE NQ GAMMA-DIFFUSION EFFECT APPEAR IN FX? (falsification test)

Pre-registration: oi_research_book/GEX_FX_CROSSMATCH_PREREG.md (commit 496bae1,
written and committed BEFORE this ran). Verdict rests on the three NON-inverted
pairs; the three CME-inverted pairs are reported with both sign conventions and
excluded from the verdict, because 01_build_daily_dataset.py inverts strikes but
not call/put labels and the resulting GEX sign cannot be verified from this data.

Statistic is identical to scripts 18/19, unchanged:
    DR = realised next-day log range / (sigma_trailing * sqrt(8/pi))
then the within-trailing-vol-stratum short-minus-long gap (5 strata).

Usage: .venv/Scripts/python.exe oi_research_book/scripts/21_gex_fx_crossmatch.py
"""
import json
import importlib.util
import numpy as np
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "results"
OUT.mkdir(parents=True, exist_ok=True)

_s = importlib.util.spec_from_file_location(
    "s18", Path(__file__).with_name("18_gex_range_brownian.py"))
s18 = importlib.util.module_from_spec(_s)
_s.loader.exec_module(s18)

RNG = np.random.default_rng(20260924)

# pair -> parquet suffix (EUR_USD keeps the original unsuffixed filenames)
PRIMARY = ["EUR_USD", "GBP_USD", "AUD_USD"]          # no inversion, no ambiguity
SECONDARY = ["USD_JPY", "USD_CAD", "USD_CHF"]        # CME-inverted, convention unverified

MIN_DAYS = 200
MIN_ARM = 60


def suffix(pair):
    return "" if pair == "EUR_USD" else f"_{pair.lower()}"


def build_pair(pair, flip_sign=False):
    """Same construction as s18.build, per pair. flip_sign tests the alternative
    call/put convention for the CME-inverted pairs."""
    f = DATA / f"daily_master_near{suffix(pair)}.parquet"
    if not f.exists():
        return None, {"error": f"missing {f.name}"}
    df = pd.read_parquet(f).copy()
    raw = len(df)

    sigma_d = df["rv20_ann"] / np.sqrt(252.0)
    exp_rng = sigma_d * s18.BM_RANGE_CONST
    real_rng = np.log(df["fwd_hi_1d"] / df["fwd_lo_1d"])
    df["dr"] = real_rng / exp_rng

    gex = -df["net_gex_sum"] if flip_sign else df["net_gex_sum"]
    df["is_short"] = gex < 0

    keep = (df["dr"].notna() & np.isfinite(df["dr"])
            & df["net_gex_sum"].notna() & (exp_rng > 0) & df["rv20_ann"].notna())
    dropped = int((~keep).sum())
    df = df[keep].sort_values("date").reset_index(drop=True)
    return df, {"raw_rows": raw, "dropped": dropped, "used": len(df)}


def vol_matched_delta(df, n_strata=5):
    df = df.copy()
    if df["rv20_ann"].nunique() < n_strata:
        return None
    df["st"] = pd.qcut(df["rv20_ann"], n_strata, labels=False, duplicates="drop")
    num = den = 0.0
    for _, g in df.groupby("st"):
        s = g["is_short"].to_numpy()
        if s.sum() < 10 or (~s).sum() < 10:
            continue
        d = g["dr"].to_numpy()
        num += (d[s].mean() - d[~s].mean()) * len(g)
        den += len(g)
    return float(num / den) if den else None


def assess(pair, flip_sign=False):
    df, counts = build_pair(pair, flip_sign)
    if df is None:
        return {"pair": pair, **counts}
    s = df["is_short"].to_numpy()
    raw_delta, p, _ = s18.boot_diff_p(df["dr"].to_numpy(), s, n_boot=4000)
    vm = vol_matched_delta(df)
    countable = (len(df) >= MIN_DAYS and s.sum() >= MIN_ARM and (~s).sum() >= MIN_ARM)
    return {"pair": pair, "flipped_convention": flip_sign,
            "n": counts["used"], "dropped": counts["dropped"],
            "n_short": int(s.sum()), "n_long": int((~s).sum()),
            "deltaDR_raw": round(raw_delta, 4), "p_raw": round(p, 4),
            "deltaDR_vol_matched": round(vm, 4) if vm is not None else None,
            "counts_toward_verdict": bool(countable)}


def show(r):
    if "error" in r:
        print(f"  {r['pair']:>8}: {r['error']}")
        return
    vm = r["deltaDR_vol_matched"]
    flag = "" if r["counts_toward_verdict"] else "   [n too small - NOT counted]"
    print(f"  {r['pair']:>8}{'  (flipped)' if r['flipped_convention'] else '          '}: "
          f"n={r['n']:>4} (S{r['n_short']}/L{r['n_long']})  "
          f"raw={r['deltaDR_raw']:+.4f} (p={r['p_raw']:.3f})  "
          f"vol-matched={vm:+.4f}" if vm is not None else
          f"  {r['pair']:>8}: n={r['n']} -- vol-matched n/a")
    if flag:
        print(flag)


def pooled_test(pairs, n_boot=3000, rng=RNG):
    """The pre-registered pooled estimate across the primary pairs.

    Resampling is by DATE, with all pairs moving together, because EUR/GBP/AUD
    share a USD factor -- three correlated pairs are not three independent votes,
    and resampling them separately would understate the standard error. This is
    the 'correlated pairs as diversification' failure mode applied to evidence
    counting rather than to a portfolio.
    """
    frames = {}
    for pair in pairs:
        df, _ = build_pair(pair)
        if df is None:
            continue
        df["date"] = pd.to_datetime(df["date"])
        df["st"] = pd.qcut(df["rv20_ann"], 5, labels=False, duplicates="drop")
        frames[pair] = df.set_index("date")[["dr", "is_short", "st"]].sort_index()
    if not frames:
        return None

    dates = np.array(sorted(set.intersection(*[set(f.index) for f in frames.values()])))
    n = len(dates)
    A = {p: (g["dr"].to_numpy(), g["is_short"].to_numpy(), g["st"].to_numpy())
         for p, g in ((p, f.loc[dates]) for p, f in frames.items())}

    def pooled(idx):
        num = den = 0.0
        for dr, sh, st in A.values():
            d, s_, t = dr[idx], sh[idx], st[idx]
            for k in range(5):
                mk = t == k
                a, b = mk & s_, mk & ~s_
                if a.sum() < 10 or b.sum() < 10:
                    continue
                num += (d[a].mean() - d[b].mean()) * mk.sum()
                den += mk.sum()
        return num / den if den else np.nan

    obs = pooled(np.arange(n))
    stats = []
    for chunk in s18._boot_stats(n, n_boot, rng, chunk=500):
        stats.extend(pooled(row) for row in chunk)
    stats = np.array([x for x in stats if np.isfinite(x)])
    centred = stats - stats.mean()
    p = float((np.abs(centred) >= abs(obs)).mean())
    sd = float(stats.std())
    return {"n_common_dates": int(n), "pooled_deltaDR": round(float(obs), 4),
            "p": round(p, 4), "boot_sd": round(sd, 4),
            "ci95": [round(float(obs - 1.96 * sd), 4), round(float(obs + 1.96 * sd), 4)],
            "n_paths": int(len(stats))}


def main():
    print("=" * 78)
    print("PRIMARY -- non-inverted pairs (the verdict rests on these)")
    print("=" * 78)
    prim = [assess(p) for p in PRIMARY]
    for r in prim:
        show(r)

    print("\n" + "=" * 78)
    print("SECONDARY -- CME-inverted pairs, BOTH conventions, excluded from verdict")
    print("=" * 78)
    sec = []
    for p in SECONDARY:
        for flip in (False, True):
            r = assess(p, flip)
            sec.append(r)
            show(r)

    print("\n" + "=" * 78)
    print("NQ reference (already banked): raw +0.1762, vol-matched +0.3154")
    print("=" * 78)

    counted = [r for r in prim if r.get("counts_toward_verdict")
               and r.get("deltaDR_vol_matched") is not None]
    pos = [r for r in counted if r["deltaDR_vol_matched"] > 0]
    neg = [r for r in counted if r["deltaDR_vol_matched"] <= 0]

    # The pre-registered rule needs BOTH the per-pair signs and a pooled test.
    # Signs alone are not enough: three USD pairs are not three independent votes.
    print("\n--- pooled test across the primary pairs (resampled by date) ---")
    pooled = pooled_test(PRIMARY)
    if pooled:
        print(f"  pooled vol-matched dDR = {pooled['pooled_deltaDR']:+.4f}  "
              f"p={pooled['p']:.4f}  95% CI {pooled['ci95']}  "
              f"({pooled['n_common_dates']} common dates, {pooled['n_paths']} paths)")

    pooled_ok = bool(pooled and pooled["pooled_deltaDR"] > 0 and pooled["p"] < 0.05)

    if not counted:
        verdict = "INCONCLUSIVE (no pair met the size floor)"
    elif len(pos) == len(counted) and len(counted) == 3 and pooled_ok:
        verdict = "CORROBORATED"
    elif len(neg) >= 2:
        verdict = "REFUTED as a general mechanism"
    else:
        verdict = "MIXED"

    print(f"\ncountable pairs: {len(counted)}/3   positive: {len(pos)}   "
          f"non-positive: {len(neg)}   pooled p<0.05: {pooled_ok}")
    print(f"\n>>> VERDICT: {verdict}")

    payload = {"generated": pd.Timestamp.now("UTC").isoformat(),
               "prereg": "GEX_FX_CROSSMATCH_PREREG.md",
               "primary": prim, "secondary_both_conventions": sec,
               "pooled": pooled,
               "nq_reference": {"raw": 0.1762, "vol_matched": 0.3154},
               "verdict": verdict}
    (OUT / "gex_fx_crossmatch.json").write_text(json.dumps(payload, indent=2))
    print(f"\nwrote {OUT / 'gex_fx_crossmatch.json'}")


if __name__ == "__main__":
    main()
