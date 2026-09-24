"""
DIAGNOSTICS ON SCRIPT 18 -- run BEFORE its result is believed.

Script 18 returned dDR = +0.176 (p = 0.0008) on the primary cell, which the
pre-registered rule scores SUPPORTED. Two things block that reading:

  1. THE POSITIVE CONTROL FAILED (dDR 0.061, p 0.20). The prereg says the
     harness must pass first. On inspection the control was MIS-SPECIFIED by me,
     not failing: it used trailing |return| to predict next-day range, but DR is
     already divided by trailing 20d vol, so the DR statistic deliberately
     removes most of exactly that signal. A control the statistic is designed to
     neutralise tests nothing. Gate 2 is replaced here with a SYNTHETIC
     INJECTION, which tests the detector itself rather than a market fact.

  2. SPEC SENSITIVITY. The effect is 5x larger under the rv20 normaliser
     (+0.176) than under atr14 (+0.071, p 0.15). Two estimates of the same
     quantity should not disagree that much. The leading alternative explanation
     is that trailing vol is STALE on short-gamma days -- if short gamma clusters
     in rising-vol regimes, rv20 understates today's vol and DR > 1 follows
     mechanically, with no dealer hedging involved.

Test 2 is therefore the decisive one: stratify on trailing vol and re-compare
WITHIN strata. If the gap survives matched comparison it is not a vol-level
artifact; if it collapses, script 18's headline is measuring vol staleness.

Usage: .venv/Scripts/python.exe oi_research_book/scripts/19_gex_range_diagnostics.py
"""
import json
import numpy as np
import pandas as pd
from pathlib import Path

import importlib.util

_spec = importlib.util.spec_from_file_location(
    "s18", Path(__file__).with_name("18_gex_range_brownian.py"))
s18 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(s18)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "results"
RNG = np.random.default_rng(20260924)


def injection_control(df, lift=0.15, rng=RNG):
    """GATE 2, REPLACED. Take the real DR series, pick a random half of days, and
    multiply their DR by (1 + lift). A working detector must recover a difference
    of about `lift` with p < 0.05. This tests the machinery, not the market --
    which is what a positive control is for."""
    dr = df["dr"].to_numpy().copy()
    flag = rng.random(len(dr)) < 0.5
    dr[flag] *= (1.0 + lift)
    obs, p, _ = s18.boot_diff_p(dr, flag, n_boot=4000)
    expected = lift * df["dr"].mean()
    return {"injected_lift": lift, "expected_deltaDR": round(float(expected), 4),
            "recovered_deltaDR": round(obs, 4), "p": round(p, 4),
            "pass": bool(p < 0.05 and abs(obs - expected) < 0.4 * expected)}


def vol_staleness(df):
    """Is trailing vol STALE on short-gamma days? Compare the vol the normaliser
    used (trailing rv20, known at t) with the vol that actually showed up next
    day, by regime. If short-gamma days are systematically rising-vol days, DR>1
    is an artifact of the normaliser lagging, not of dealer hedging."""
    sigma_t = df["rv20_ann"] / np.sqrt(252.0)
    realised_next = np.log(df["fwd_hi_1d"] / df["fwd_lo_1d"]) / s18.BM_RANGE_CONST
    ratio = realised_next / sigma_t          # >1 = trailing vol understated tomorrow
    s = df["is_short"].to_numpy()
    return {
        "vol_ratio_short": round(float(ratio[s].mean()), 4),
        "vol_ratio_long": round(float(ratio[~s].mean()), 4),
        "rv20_level_short": round(float(df.loc[s, "rv20_ann"].mean()), 4),
        "rv20_level_long": round(float(df.loc[~s, "rv20_ann"].mean()), 4),
    }


def matched_by_vol(df, n_strata=5):
    """THE DECISIVE TEST. Stratify on trailing vol (the confound), then compare
    short vs long gamma WITHIN each stratum and pool the within-stratum gaps,
    weighted by stratum size. This is the paired-control discipline the repo uses
    elsewhere: it asks whether gamma adds anything once vol level is held fixed."""
    df = df.copy()
    df["stratum"] = pd.qcut(df["rv20_ann"], n_strata, labels=False, duplicates="drop")
    rows, num, den = [], 0.0, 0.0
    for k, g in df.groupby("stratum"):
        s = g["is_short"].to_numpy()
        if s.sum() < 15 or (~s).sum() < 15:
            rows.append({"stratum": int(k), "n_short": int(s.sum()),
                         "n_long": int((~s).sum()), "deltaDR": None,
                         "note": "too few in one arm"})
            continue
        d = g["dr"].to_numpy()
        gap = d[s].mean() - d[~s].mean()
        w = len(g)
        num += gap * w
        den += w
        rows.append({"stratum": int(k), "n_short": int(s.sum()), "n_long": int((~s).sum()),
                     "rv20_mid": round(float(g["rv20_ann"].median()), 4),
                     "DR_short": round(float(d[s].mean()), 4),
                     "DR_long": round(float(d[~s].mean()), 4),
                     "deltaDR": round(float(gap), 4)})
    pooled = num / den if den else None

    # bootstrap the pooled within-stratum gap, resampling time blocks as before
    stats = []
    dr_all = df["dr"].to_numpy()
    sh_all = df["is_short"].to_numpy()
    st_all = df["stratum"].to_numpy()
    for ix in s18._boot_stats(len(df), 4000, RNG):
        d, s, st = dr_all[ix], sh_all[ix], st_all[ix]
        tot_w, acc = 0.0, 0.0
        for k in np.unique(st):
            m = st == k
            ss, ll = m & s, m & ~s
            if ss.sum() < 5 or ll.sum() < 5:
                continue
            acc += (d[ss].mean() - d[ll].mean()) * m.sum()
            tot_w += m.sum()
        stats.append(acc / tot_w if tot_w else np.nan)
    stats = np.array(stats)
    stats = stats[np.isfinite(stats)]
    centred = stats - stats.mean()
    p = float((np.abs(centred) >= abs(pooled)).mean()) if pooled is not None else None

    return {"pooled_within_stratum_deltaDR": round(float(pooled), 4) if pooled else None,
            "p": round(p, 4) if p is not None else None, "strata": rows}


def main():
    df, counts = s18.build("near", "rv20_ann", "net_gex_sum")
    print(f"primary cell: n={counts['used']}, dropped={counts['dropped']}\n")

    print("--- GATE 2 REPLACED: synthetic injection control ---")
    inj = injection_control(df)
    print(f"  {inj}\n")

    print("--- vol staleness by regime (the leading confound) ---")
    vs = vol_staleness(df)
    for k, v in vs.items():
        print(f"  {k:>18}: {v}")

    print("\n--- DECISIVE: gamma gap WITHIN trailing-vol strata ---")
    mt = matched_by_vol(df)
    for r in mt["strata"]:
        if r.get("deltaDR") is None:
            print(f"  stratum {r['stratum']}: {r.get('note')}")
        else:
            print(f"  stratum {r['stratum']} (rv20~{r['rv20_mid']:.3f}) "
                  f"S{r['n_short']}/L{r['n_long']}  "
                  f"DR_short={r['DR_short']:.3f} DR_long={r['DR_long']:.3f}  "
                  f"dDR={r['deltaDR']:+.4f}")
    print(f"\n  POOLED within-stratum dDR = {mt['pooled_within_stratum_deltaDR']:+.4f} "
          f"(p={mt['p']})")
    print(f"  unstratified dDR was        = +0.1762 (p=0.0008)")

    payload = {"generated": pd.Timestamp.now("UTC").isoformat(),
               "injection_control": inj, "vol_staleness": vs, "matched_by_vol": mt}
    (OUT / "gex_range_diagnostics.json").write_text(json.dumps(payload, indent=2))
    print(f"\nwrote {OUT / 'gex_range_diagnostics.json'}")


if __name__ == "__main__":
    main()
